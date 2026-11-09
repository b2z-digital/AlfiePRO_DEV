import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Captions, Check, ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume1, Volume2, VolumeX } from 'lucide-react';
import { AlfieIcon } from '../../brand/AlfieIcon';

/**
 * AlfieTV's video player: YouTube plays underneath with its own controls switched off,
 * and AlfieTV's controls sit on top (play/pause, skip, seek, volume, captions, speed,
 * full screen). No big centre button, and nothing of YouTube's to click away to.
 *
 * Before the video first starts, taps go through to YouTube (iPhones and iPads need a tap
 * on YouTube's own play button when autoplay with sound isn't allowed). If YouTube's
 * player script can't load, it falls back to the plain YouTube embed with its controls.
 */

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<any> | null = null;

function loadYouTubeApi(timeoutMs = 6000): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => { apiPromise = null; reject(new Error('YouTube player script failed to load')); };
      document.head.appendChild(script);
    });
  }
  return Promise.race([
    apiPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('YouTube player script timed out')), timeoutMs)),
  ]);
}

const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
const IDLE_MS = 3000;

function clock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

type Track = { languageCode: string; displayName?: string; languageName?: string; kind?: string };
const trackName = (t: Track) => t.displayName || t.languageName || t.languageCode;

interface AlfieTVPlayerProps {
  videoId: string;
  title: string;
  onClose: () => void;
  /** Seconds to start from (Continue watching) */
  start?: number;
  /** Position and length while playing, for watch history */
  onProgress?: (time: number, duration: number) => void;
}

export const AlfieTVPlayer: React.FC<AlfieTVPlayerProps> = ({ videoId, title, onClose, start, onProgress }) => {
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout>>();
  const seekThrottle = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [mode, setMode] = useState<'loading' | 'api' | 'fallback'>('loading');
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [rate, setRate] = useState(1);
  const [rates, setRates] = useState<number[]>([1]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackCode, setTrackCode] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | 'main' | 'speed' | 'captions'>(null);
  const [awake, setAwake] = useState(true);
  const [overControls, setOverControls] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canFullscreen = typeof document !== 'undefined' &&
    !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 2600);
  }, []);

  // ── YouTube player ────────────────────────────────────────────────
  // YouTube picks the quality in embeds and starts low. These calls are no longer documented
  // and may be ignored, but where they still work the replay starts in HD instead of 360p.
  const askForHd = (p: any) => {
    try { p.setPlaybackQualityRange?.('hd1080', 'highres'); } catch { /* ignored by YouTube */ }
    try { p.setPlaybackQuality?.('hd1080'); } catch { /* ignored by YouTube */ }
  };

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const el = document.createElement('div');
        hostRef.current.appendChild(el);
        playerRef.current = new YT.Player(el, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3,
            modestbranding: 1, playsinline: 1, cc_load_policy: 0, origin: window.location.origin,
            ...(start && start > 5 ? { start: Math.floor(start) } : {}),
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return;
              const p = e.target;
              setReady(true);
              try {
                setDuration(p.getDuration() || 0);
                setMuted(p.isMuted());
                setVolume(p.getVolume());
                const r = p.getAvailablePlaybackRates?.();
                if (Array.isArray(r) && r.length) setRates(r);
                askForHd(p);
                p.playVideo();
              } catch { /* player still starting */ }
            },
            onStateChange: (e: any) => {
              if (cancelled) return;
              const s = e.data;
              setPlaying(s === YT_STATE.PLAYING || s === YT_STATE.BUFFERING);
              if (s === YT_STATE.PLAYING) {
                askForHd(e.target);
                setStarted(true);
                try { setDuration(e.target.getDuration() || 0); } catch { /* ignore */ }
              }
              if (s === YT_STATE.ENDED) window.setTimeout(() => onCloseRef.current(), 1500);
            },
            onPlaybackRateChange: (e: any) => setRate(e.data),
            onApiChange: () => {
              try {
                const list = playerRef.current?.getOption?.('captions', 'tracklist');
                if (Array.isArray(list)) setTracks(list);
              } catch { /* captions module not loaded */ }
            },
            onError: () => { if (!cancelled) setMode('fallback'); },
          },
        });
        setMode('api');
      })
      .catch(() => { if (!cancelled) setMode('fallback'); });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
    };
  }, [videoId]);

  // Time, buffer and volume while the player runs
  useEffect(() => {
    if (mode !== 'api' || !ready) return;
    const t = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        setTime(p.getCurrentTime() || 0);
        setLoaded(p.getVideoLoadedFraction?.() || 0);
        const d = p.getDuration?.();
        if (d) setDuration(d);
        onProgressRef.current?.(p.getCurrentTime() || 0, d || 0);
        setMuted(p.isMuted());
        setVolume(p.getVolume());
      } catch { /* between states */ }
    }, 250);
    return () => window.clearInterval(t);
  }, [mode, ready]);

  // Fallback embed: close shortly after the video ends (YouTube state 0)
  useEffect(() => {
    if (mode !== 'fallback') return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com' && event.origin !== 'https://www.youtube-nocookie.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onStateChange' && data.info === 0) window.setTimeout(() => onCloseRef.current(), 1500);
      } catch { /* not the player */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mode]);

  // ── Controls ──────────────────────────────────────────────────────
  const call = (fn: string, ...args: unknown[]) => {
    try { return playerRef.current?.[fn]?.(...args); } catch { return undefined; }
  };

  const togglePlay = useCallback(() => {
    if (playing) { call('pauseVideo'); setPlaying(false); } else { call('playVideo'); setPlaying(true); }
  }, [playing]);

  const seekTo = useCallback((t: number, final = true) => {
    const clamped = Math.max(0, Math.min(duration || t, t));
    call('seekTo', clamped, final);
    setTime(clamped);
  }, [duration]);

  const skip = useCallback((delta: number) => seekTo((time || 0) + delta), [seekTo, time]);

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      call('unMute');
      if (volume === 0) { call('setVolume', 50); setVolume(50); }
      setMuted(false);
    } else { call('mute'); setMuted(true); }
  }, [muted, volume]);

  const changeVolume = (v: number) => {
    call('setVolume', v);
    setVolume(v);
    if (v > 0 && muted) { call('unMute'); setMuted(false); }
    if (v === 0) { call('mute'); setMuted(true); }
  };

  const readTracks = (): Track[] => {
    try {
      const list = playerRef.current?.getOption?.('captions', 'tracklist');
      if (Array.isArray(list)) { setTracks(list); return list; }
    } catch { /* not loaded */ }
    return [];
  };

  const chooseTrack = (code: string | null) => {
    if (!code) {
      call('unloadModule', 'captions');
      setCaptionsOn(false);
      return;
    }
    call('loadModule', 'captions');
    call('setOption', 'captions', 'track', { languageCode: code });
    setTrackCode(code);
    setCaptionsOn(true);
  };

  const toggleCaptions = useCallback(() => {
    if (captionsOn) { chooseTrack(null); return; }
    call('loadModule', 'captions');
    setCaptionsOn(true);
    // The track list arrives once YouTube has loaded its captions module
    window.setTimeout(() => {
      const list = readTracks();
      if (!list.length) {
        setCaptionsOn(false);
        call('unloadModule', 'captions');
        flash('No captions for this video');
        return;
      }
      const preferred = list.find((t) => t.languageCode === trackCode)
        || list.find((t) => t.languageCode?.startsWith('en'))
        || list[0];
      call('setOption', 'captions', 'track', { languageCode: preferred.languageCode });
      setTrackCode(preferred.languageCode);
    }, 900);
  }, [captionsOn, trackCode, flash]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current as any;
    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    } else if (el) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      const doc = document as any;
      setFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // ── Showing and hiding the controls ───────────────────────────────
  const wake = useCallback(() => {
    setAwake(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setAwake(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => { if (idleRef.current) clearTimeout(idleRef.current); };
  }, [wake]);
  // Controls stay up while paused, in a menu, or under the pointer
  const showControls = awake || !playing || !!menu || overControls || mode === 'fallback';

  // Click on the picture: play/pause with a mouse (a double click goes full screen instead);
  // with touch, show or hide the controls
  const clickRef = useRef<ReturnType<typeof setTimeout>>();
  const onPicture = (e: React.PointerEvent) => {
    if (menu) { setMenu(null); return; }
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      if (clickRef.current) clearTimeout(clickRef.current);
      clickRef.current = setTimeout(() => { clickRef.current = undefined; togglePlay(); wake(); }, canFullscreen ? 220 : 0);
      return;
    }
    if (showControls && playing) { setAwake(false); if (idleRef.current) clearTimeout(idleRef.current); } else { wake(); }
  };
  const onPictureDouble = () => {
    if (clickRef.current) { clearTimeout(clickRef.current); clickRef.current = undefined; }
    if (canFullscreen) toggleFullscreen();
  };

  // ── Keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape') {
        if (menu) { setMenu(null); return; }
        const doc = document as any;
        if (doc.fullscreenElement || doc.webkitFullscreenElement) return; // the browser leaves full screen
        onCloseRef.current();
        return;
      }
      if (typing || mode !== 'api' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const onSlider = target?.getAttribute('type') === 'range';
      if (k === ' ' && target?.tagName === 'BUTTON') return; // Space presses the focused button
      if (k === ' ' || k === 'k') togglePlay();
      else if (k === 'arrowleft' && !onSlider) skip(-5);
      else if (k === 'arrowright' && !onSlider) skip(5);
      else if (k === 'j') skip(-10);
      else if (k === 'l') skip(10);
      else if (k === 'm') toggleMute();
      else if (k === 'c') toggleCaptions();
      else if (k === 'f' && canFullscreen) toggleFullscreen();
      else return;
      e.preventDefault();
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, mode, togglePlay, skip, toggleMute, toggleCaptions, toggleFullscreen, canFullscreen, wake]);

  // ── Render ────────────────────────────────────────────────────────
  const shown = scrub ?? time;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;
  const bufPct = Math.min(100, Math.max(pct, loaded * 100));
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const currentTrack = tracks.find((t) => t.languageCode === trackCode);

  const className = [
    'atv-player',
    showControls && 'is-awake',
    mode !== 'fallback' && 'is-custom',
    started && 'is-started',
    !showControls && 'is-idle',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={className} style={{ zIndex: 9000 }} onMouseMove={wake}>
      {mode === 'fallback' ? (
        <>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&fs=1&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`}
            className="atv-player-frame"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            title={title || 'Video'}
            loading="eager"
          />
          {/* Covers YouTube's logo link so viewers stay in AlfieTV */}
          <div className="atv-player-guard" />
        </>
      ) : (
        <>
          <div ref={hostRef} className="atv-player-host" />
          {/* Takes the clicks, so YouTube's own buttons and links never come up */}
          <div className="atv-player-hit" onPointerUp={onPicture} onDoubleClick={onPictureDouble} />
        </>
      )}

      <div className="atv-player-top">
        <button
          type="button"
          className="atv-player-back"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Back to AlfieTV (Esc)"
        >
          <AlfieIcon glyph="chevL" size={22} strokeWidth={2.2} />
          <span>Back</span>
        </button>
        <span className="atv-player-title">{title}</span>
      </div>

      {notice && <div className="atv-player-notice" role="status">{notice}</div>}

      {mode === 'api' && (
        <div
          className="atv-player-bar"
          onMouseEnter={() => setOverControls(true)}
          onMouseLeave={() => setOverControls(false)}
        >
          <div className="atv-player-seek">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={shown}
              disabled={!duration}
              aria-label="Seek"
              aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
              style={{ ['--p' as string]: `${pct}%`, ['--b' as string]: `${bufPct}%` }}
              onChange={(e) => {
                const t = Number(e.target.value);
                setScrub(t);
                const now = Date.now();
                if (now - seekThrottle.current > 180) { seekThrottle.current = now; call('seekTo', t, false); }
              }}
              onPointerUp={() => { if (scrub != null) { seekTo(scrub, true); setScrub(null); } }}
              onKeyUp={() => { if (scrub != null) { seekTo(scrub, true); setScrub(null); } }}
              onBlur={() => { if (scrub != null) { seekTo(scrub, true); setScrub(null); } }}
            />
          </div>

          <div className="atv-player-row">
            <button type="button" className="atv-pc atv-pc-main" onClick={togglePlay} aria-label={playing ? 'Pause (k)' : 'Play (k)'} title={playing ? 'Pause (k)' : 'Play (k)'}>
              {playing ? <Pause size={24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} />}
            </button>
            <button type="button" className="atv-pc atv-pc-skip" onClick={() => skip(-10)} aria-label="Back 10 seconds (j)" title="Back 10 seconds (j)">
              <RotateCcw size={20} /><span>10</span>
            </button>
            <button type="button" className="atv-pc atv-pc-skip" onClick={() => skip(10)} aria-label="Forward 10 seconds (l)" title="Forward 10 seconds (l)">
              <RotateCw size={20} /><span>10</span>
            </button>

            <div className="atv-pc-vol">
              <button type="button" className="atv-pc" onClick={toggleMute} aria-label={muted ? 'Unmute (m)' : 'Mute (m)'} title={muted ? 'Unmute (m)' : 'Mute (m)'}>
                <VolumeIcon size={22} />
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                aria-label="Volume"
                style={{ ['--p' as string]: `${muted ? 0 : volume}%` }}
                onChange={(e) => changeVolume(Number(e.target.value))}
              />
            </div>

            <span className="atv-player-time">{clock(shown)} <span>/ {clock(duration)}</span></span>
            <span className="atv-player-spacer" />

            <button
              type="button"
              className={`atv-pc ${captionsOn ? 'is-on' : ''}`}
              onClick={toggleCaptions}
              aria-pressed={captionsOn}
              aria-label="Captions (c)"
              title="Captions (c)"
            >
              <Captions size={22} />
            </button>

            <div className="atv-pc-menuwrap">
              <button
                type="button"
                className={`atv-pc ${menu ? 'is-open' : ''}`}
                onClick={() => { if (menu) setMenu(null); else { readTracks(); setMenu('main'); } }}
                aria-haspopup="menu"
                aria-expanded={!!menu}
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={22} />
              </button>
              {menu && (
                <div className="atv-player-menu" role="menu">
                  {menu === 'main' && (
                    <>
                      <button type="button" role="menuitem" onClick={() => setMenu('speed')}>
                        <span>Playback speed</span><em>{rate === 1 ? 'Normal' : `${rate}×`}</em><ChevronRight size={16} />
                      </button>
                      <button type="button" role="menuitem" onClick={() => { readTracks(); setMenu('captions'); }}>
                        <span>Captions</span><em>{captionsOn ? (currentTrack ? trackName(currentTrack) : 'On') : 'Off'}</em><ChevronRight size={16} />
                      </button>
                    </>
                  )}
                  {menu === 'speed' && (
                    <>
                      <button type="button" className="is-head" onClick={() => setMenu('main')}><ChevronLeft size={16} /><span>Playback speed</span></button>
                      {rates.map((r) => (
                        <button key={r} type="button" role="menuitemradio" aria-checked={r === rate}
                          onClick={() => { call('setPlaybackRate', r); setRate(r); setMenu(null); }}>
                          <span>{r === 1 ? 'Normal' : `${r}×`}</span>{r === rate && <Check size={16} />}
                        </button>
                      ))}
                    </>
                  )}
                  {menu === 'captions' && (
                    <>
                      <button type="button" className="is-head" onClick={() => setMenu('main')}><ChevronLeft size={16} /><span>Captions</span></button>
                      <button type="button" role="menuitemradio" aria-checked={!captionsOn} onClick={() => { chooseTrack(null); setMenu(null); }}>
                        <span>Off</span>{!captionsOn && <Check size={16} />}
                      </button>
                      {tracks.length ? tracks.map((t) => (
                        <button key={t.languageCode + (t.kind || '')} type="button" role="menuitemradio"
                          aria-checked={captionsOn && t.languageCode === trackCode}
                          onClick={() => { chooseTrack(t.languageCode); setMenu(null); }}>
                          <span>{trackName(t)}</span>{captionsOn && t.languageCode === trackCode && <Check size={16} />}
                        </button>
                      )) : (
                        <button type="button" role="menuitemradio" aria-checked={captionsOn} onClick={() => { setMenu(null); if (!captionsOn) toggleCaptions(); }}>
                          <span>On</span>{captionsOn && <Check size={16} />}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {canFullscreen && (
              <button type="button" className="atv-pc" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'} title={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}>
                {fullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlfieTVPlayer;
