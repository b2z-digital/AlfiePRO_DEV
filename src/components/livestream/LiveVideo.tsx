import React from 'react';
import { Maximize2, Radio, Volume2, VolumeX } from 'lucide-react';
import type { LivestreamSession } from '../../types/livestream';
import { supabase } from '../../utils/supabase';

/** One id per browser, so a viewer counts once a minute however many players they open. */
function viewerKey(): string {
  try {
    let k = localStorage.getItem('alfie_viewer_key');
    if (!k) { k = crypto.randomUUID(); localStorage.setItem('alfie_viewer_key', k); }
    return k;
  } catch {
    const w = window as unknown as { __alfieViewerKey?: string };
    return (w.__alfieViewerKey ||= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  }
}

/**
 * A live broadcast playing inside the page (AlfieTV watch page, event Live tab).
 * WHEP straight from Cloudflare (low delay), retrying with back-off, then the
 * Cloudflare Stream player as a fallback. Fills its container; the container sets 16:9.
 */
export function LiveVideo({ session, muted: forceMuted = false, compact = false }: {
  session: LivestreamSession;
  /** Silences the picture (for example while a race replay plays on top) */
  muted?: boolean;
  /** Smaller controls for embedded players */
  compact?: boolean;
}) {
  const [isConnecting, setIsConnecting] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [isMuted, setIsMuted] = React.useState(false);
  const [usingFallback, setUsingFallback] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = React.useRef(0);
  const isFallbackRef = React.useRef(false);
  const unmountedRef = React.useRef(false);

  // WHEP only plays streams sent in by WHIP. Cloud broadcasts and streaming encoders send
  // RTMPS, so they play through Cloudflare's player (HLS) instead.
  const rtmpIngest = session.engine === 'cloud' || session.stream_input_mode === 'rtmp_external';
  const whepUrl = rtmpIngest ? null : session.cloudflare_whip_playback_url;
  const iframeEmbedUrl = session.cloudflare_customer_code && session.cloudflare_live_input_id
    ? `https://customer-${session.cloudflare_customer_code}.cloudflarestream.com/${session.cloudflare_live_input_id}/iframe?autoplay=true&muted=false&preload=auto&letterboxColor=000000`
    : null;
  // Viewer minutes (live viewer count, and what a club's livestream costs): one ping a minute
  // while this player is on screen in a visible tab
  React.useEffect(() => {
    if (session.status !== 'live') return;
    const key = viewerKey();
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.rpc('livestream_viewer_ping', { p_session: session.id, p_viewer: key }).then(() => {}, () => {});
    };
    ping();
    const timer = setInterval(ping, 60000);
    return () => clearInterval(timer);
  }, [session.id, session.status]);

  const whepUrlRef = React.useRef(whepUrl);
  const iframeEmbedUrlRef = React.useRef(iframeEmbedUrl);
  whepUrlRef.current = whepUrl;
  iframeEmbedUrlRef.current = iframeEmbedUrl;

  const closePeer = () => {
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const retryOrFallBack = React.useCallback((message: string) => {
    if (unmountedRef.current) return;
    if (retryCountRef.current < 10) {
      retryCountRef.current += 1;
      const delay = Math.min(retryCountRef.current * 2000, 10000);
      retryTimerRef.current = setTimeout(() => connectWhep(), delay);
    } else if (!isFallbackRef.current && iframeEmbedUrlRef.current) {
      isFallbackRef.current = true;
      setUsingFallback(true);
      setIsConnecting(false);
    } else {
      setConnectionError(message);
      setIsConnecting(false);
    }
    // connectWhep is stable (no deps), declared below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWhep = React.useCallback(async () => {
    const url = whepUrlRef.current;
    if (!url || unmountedRef.current) return;
    setIsConnecting(true);
    setConnectionError(null);
    closePeer();
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {
            // Autoplay with sound was blocked: play muted, the viewer can unmute
            if (videoRef.current) { videoRef.current.muted = true; setIsMuted(true); videoRef.current.play().catch(() => {}); }
          });
          setIsConnecting(false);
          setConnectionError(null);
          retryCountRef.current = 0;
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        if (pc.connectionState === 'connected') {
          setIsConnecting(false);
          setConnectionError(null);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          retryOrFallBack('Connection lost. The broadcast may have ended.');
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const check = () => {
          if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); }
        };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 3000);
      });
      const localDesc = pc.localDescription;
      if (!localDesc) throw new Error('No local description');
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: localDesc.sdp });
      if (!response.ok) throw new Error(`WHEP error: ${response.status}`);
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      console.error('[WHEP] Connection error:', err);
      retryOrFallBack('Unable to connect to the live broadcast.');
    }
  }, [retryOrFallBack]);

  React.useEffect(() => {
    unmountedRef.current = false;
    if (whepUrl) {
      connectWhep();
    } else if (iframeEmbedUrl) {
      isFallbackRef.current = true;
      setUsingFallback(true);
      setIsConnecting(false);
    }
    return () => {
      unmountedRef.current = true;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      closePeer();
    };
    // Connect once per mount; the parent remounts (key) to reconnect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted || forceMuted;
  }, [isMuted, forceMuted]);

  const toggleFullscreen = () => {
    const el = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else video?.webkitEnterFullscreen?.(); // iPhone: the video element's own full screen
  };

  if (!whepUrl && !iframeEmbedUrl) {
    return <div className="alv-lv"><div className="alv-lv-msg"><p>This broadcast has no picture yet.</p></div></div>;
  }

  return (
    <div ref={wrapRef} className={`alv-lv ${compact ? 'is-compact' : ''}`}>
      <video ref={videoRef} autoPlay playsInline style={{ display: usingFallback ? 'none' : 'block' }} />
      {usingFallback && iframeEmbedUrl && (
        <iframe
          src={iframeEmbedUrl}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          title={session.title || 'Live broadcast'}
          loading="eager"
        />
      )}

      {isConnecting && (
        <div className="alv-lv-msg" role="status">
          <span className="spin" aria-hidden="true" />
          <p>Connecting to the live broadcast…</p>
        </div>
      )}
      {connectionError && (
        <div className="alv-lv-msg" role="alert">
          <Radio className="w-7 h-7" aria-hidden="true" />
          <p>{connectionError}</p>
          <button
            type="button"
            className="alv-btn is-small alv-btn-live"
            onClick={() => { retryCountRef.current = 0; isFallbackRef.current = false; setUsingFallback(false); connectWhep(); }}
          >
            Try again
          </button>
        </div>
      )}

      {!usingFallback && !isConnecting && !connectionError && (
        <div className="alv-lv-bar">
          <span className="live"><span className="dot" aria-hidden="true" />Live</span>
          <span className="note">Live only in Alfie</span>
          <button type="button" className="alv-lv-ib" onClick={() => setIsMuted(m => !m)} aria-label={isMuted ? 'Unmute' : 'Mute'} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted || forceMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button type="button" className="alv-lv-ib" onClick={toggleFullscreen} aria-label="Full screen" title="Full screen">
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
