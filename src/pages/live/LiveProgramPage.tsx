import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CAMERA_PRESET, HOLD_MESSAGE, PROGRAM_MESSAGE, RESULTS_MESSAGE, TITLE_MESSAGE,
  liveCloud, loadRealtimeKit, type RtkMeeting,
} from '../../utils/liveCloud';
import { LivestreamOverlayRenderer, type OverlaySource } from '../../components/livestream/LivestreamOverlayRenderer';
import type { LivestreamSession } from '../../types/livestream';

/**
 * The program picture for a cloud broadcast. Cloudflare's recorder opens this page
 * in a headless browser (adding ?authToken=…&config=…), joins the meeting with it,
 * and records or streams whatever it shows: the chosen camera, full frame, with
 * Alfie's overlays on top (the same ones as the studio). The recorder isn't signed
 * in, so the race data for the overlays comes from the live-cloud function.
 * Nobody visits this page directly.
 */

type CameraInfo = { id: string; name: string; videoEnabled: boolean };
type ProgramState = {
  title: string;
  isPaused: boolean;
  programParticipantId: string | null;
  session?: Partial<LivestreamSession>;
  overlay?: OverlaySource | null;
};

export default function LiveProgramPage() {
  const { sessionId = '' } = useParams();
  const params = new URLSearchParams(window.location.search);
  const authToken = params.get('authToken');
  // The club's time zone for the overlay clock (the recorder's browser runs in UTC)
  const timeZone = params.get('tz') || 'Australia/Sydney';

  const [meeting, setMeeting] = useState<RtkMeeting | null>(null);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [paused, setPaused] = useState(false);
  const [session, setSession] = useState<LivestreamSession | null>(null);
  const [titleTrigger, setTitleTrigger] = useState(0);
  const [resultsTrigger, setResultsTrigger] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<OverlaySource | null>(null);

  useEffect(() => { document.title = 'AlfiePRO program'; }, []);

  // Join the meeting as the recorder
  useEffect(() => {
    if (!authToken) { setError('Waiting for the recorder'); return; }
    let cancelled = false;
    let joined: RtkMeeting | null = null;
    (async () => {
      try {
        const RealtimeKitClient = await loadRealtimeKit();
        const { RealtimeKitRecording } = await import('@cloudflare/realtimekit-recording-sdk');
        const recording = new RealtimeKitRecording({ autoStart: true, autoStop: false });
        const m = await RealtimeKitClient.init({ authToken, defaults: { audio: false, video: false } });
        await recording.init(m);
        await m.join();
        if (cancelled) { m.leave().catch(() => {}); return; }
        joined = m;
        setMeeting(m);
      } catch (e) {
        console.error('[program] join failed', e);
        setError('Could not join the broadcast');
      }
    })();
    return () => { cancelled = true; joined?.leave().catch(() => {}); };
  }, [authToken]);

  // Keep the camera list current, and follow the control room's cues
  useEffect(() => {
    if (!meeting) return;
    const refresh = () => {
      const list: CameraInfo[] = [];
      meeting.participants.joined.forEach((p) => {
        if (!p.presetName || p.presetName === CAMERA_PRESET) list.push({ id: p.id, name: p.name, videoEnabled: p.videoEnabled });
      });
      setCameras(list);
    };
    refresh();
    const joined = meeting.participants.joined;
    const events = ['participantJoined', 'participantLeft', 'videoUpdate'] as const;
    events.forEach((ev) => joined.on(ev as any, refresh as any));
    const onMessage = ({ type, payload }: { type: string; payload: Record<string, unknown> }) => {
      if (type === PROGRAM_MESSAGE && typeof payload?.participantId === 'string') setProgramId(payload.participantId);
      else if (type === TITLE_MESSAGE) setTitleTrigger((n) => n + 1);
      else if (type === RESULTS_MESSAGE) setResultsTrigger((n) => n + 1);
      else if (type === HOLD_MESSAGE) setPaused(!!payload?.paused);
    };
    meeting.participants.on('broadcastedMessage', onMessage as any);
    return () => {
      events.forEach((ev) => joined.off(ev as any, refresh as any));
      meeting.participants.off('broadcastedMessage', onMessage as any);
    };
  }, [meeting]);

  // The saved state (program camera, hold, overlay settings and race data) every 4 seconds,
  // so a recorder that starts later catches up and the overlays stay current
  useEffect(() => {
    if (!sessionId) return;
    let stop = false;
    const poll = async () => {
      try {
        const state = await liveCloud<ProgramState>('program_state', { sessionId, overlay: true });
        if (stop) return;
        setTitle(state.title || '');
        setPaused(!!state.isPaused);
        if (state.programParticipantId) setProgramId(state.programParticipantId);
        overlayRef.current = state.overlay ?? null;
        if (state.session) {
          setSession((prev) => {
            const next = { ...(prev || {}), ...state.session } as LivestreamSession;
            // Only hand the overlays a new session object when something they use changed
            return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
          });
        }
      } catch { /* keep the last state */ }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [sessionId]);

  const loadSource = useCallback(async () => overlayRef.current, []);

  // Show the program camera, or the first camera with a picture
  const live = cameras.filter((c) => c.videoEnabled);
  const shownId = (programId && live.some((c) => c.id === programId)) ? programId : (live[0]?.id ?? null);

  useEffect(() => {
    if (!meeting || !shownId || !videoRef.current) return;
    const p = meeting.participants.joined.get(shownId);
    if (!p) return;
    const el = videoRef.current;
    meeting.participants.subscribe([shownId], ['video', 'audio']).catch(() => {});
    p.registerVideoElement(el);
    return () => { try { p.deregisterVideoElement(el); } catch { /* participant left */ } };
  }, [meeting, shownId]);

  const showOverlays = !!session && session.enable_overlays !== false;

  return (
    <div className="alv" style={{
      position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
      fontFamily: "'Instrument Sans', system-ui, sans-serif", color: '#F4F6FB',
    }}>
      <video ref={videoRef} autoPlay playsInline muted={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: shownId && !paused ? 'block' : 'none' }} />

      {(!shownId || paused) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2vw',
          background: 'radial-gradient(ellipse at center, #0E1A33 0%, #05070D 70%)', textAlign: 'center', padding: '4vw' }}>
          {paused && (
            <span style={{ padding: '0.4vw 1vw', borderRadius: '0.5vw', background: 'rgba(255,178,36,0.2)', color: '#FFD27A', fontSize: '1.1vw', fontWeight: 800, letterSpacing: '0.12em' }}>
              ON HOLD
            </span>
          )}
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: '3.4vw', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {paused ? 'Racing will resume shortly' : (title || 'AlfiePRO Live')}
          </div>
          <div style={{ fontSize: '1.4vw', color: 'rgba(235,240,255,0.7)' }}>
            {paused ? title : (error || 'Starting soon')}
          </div>
        </div>
      )}

      {/* The same overlays as the studio: race bar, fleet list, results and title cards */}
      {showOverlays && session && !paused && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <LivestreamOverlayRenderer
            session={session}
            loadSource={loadSource}
            titleCardTrigger={titleTrigger}
            resultsTrigger={resultsTrigger}
            timeZone={timeZone}
          />
        </div>
      )}
    </div>
  );
}
