import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CAMERA_PRESET, PROGRAM_MESSAGE, liveCloud, loadRealtimeKit, type RtkMeeting } from '../../utils/liveCloud';

/**
 * The program picture for a cloud broadcast. Cloudflare's recorder opens this page
 * in a headless browser (adding ?authToken=…&config=…), joins the meeting with it,
 * and records or streams whatever it shows: the chosen camera, full frame, with
 * Alfie's overlays on top. Nobody visits this page directly.
 */

type CameraInfo = { id: string; name: string; videoEnabled: boolean };

export default function LiveProgramPage() {
  const { sessionId = '' } = useParams();
  const params = new URLSearchParams(window.location.search);
  const authToken = params.get('authToken');
  const race = params.get('race');

  const [meeting, setMeeting] = useState<RtkMeeting | null>(null);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Keep the camera list current
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
    };
    meeting.participants.on('broadcastedMessage', onMessage as any);
    return () => {
      events.forEach((ev) => joined.off(ev as any, refresh as any));
      meeting.participants.off('broadcastedMessage', onMessage as any);
    };
  }, [meeting]);

  // The control room's choice is also saved, so a recorder that joins later picks it up
  useEffect(() => {
    if (!sessionId) return;
    let stop = false;
    const poll = async () => {
      try {
        const state = await liveCloud<{ title: string; programParticipantId: string | null }>('program_state', { sessionId });
        if (stop) return;
        setTitle(state.title || '');
        if (state.programParticipantId) setProgramId(state.programParticipantId);
      } catch { /* keep the last state */ }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [sessionId]);

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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', overflow: 'hidden',
      fontFamily: "'Instrument Sans', system-ui, sans-serif", color: '#F4F6FB',
    }}>
      <video ref={videoRef} autoPlay playsInline muted={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: shownId ? 'block' : 'none' }} />

      {!shownId && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.2vw',
          background: 'radial-gradient(ellipse at center, #0E1A33 0%, #05070D 70%)' }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: '3.4vw', fontWeight: 700 }}>{title || 'AlfiePRO Live'}</div>
          <div style={{ fontSize: '1.4vw', color: 'rgba(235,240,255,0.7)' }}>{error || 'Starting soon'}</div>
        </div>
      )}

      {/* Overlays */}
      <div style={{ position: 'absolute', left: '1.6vw', top: '1.6vw', display: 'flex', gap: '0.6vw', alignItems: 'center' }}>
        <span style={{ padding: '0.35vw 0.7vw', borderRadius: '0.4vw', background: 'rgba(6,11,22,0.62)', fontSize: '1vw', fontWeight: 800, letterSpacing: '0.06em' }}>
          {title ? title.slice(0, 48) : 'AlfiePRO'}
        </span>
        <span style={{ padding: '0.35vw 0.7vw', borderRadius: '0.4vw', background: '#E11D38', fontSize: '1vw', fontWeight: 800, letterSpacing: '0.08em' }}>LIVE</span>
      </div>
      {race && (
        <div style={{ position: 'absolute', left: '1.6vw', bottom: '1.6vw', padding: '0.7vw 1.1vw', borderRadius: '0.6vw',
          background: 'rgba(6,11,22,0.58)', backdropFilter: 'blur(6px)', fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: '1.6vw', fontWeight: 700 }}>
          Race {race}
        </div>
      )}
    </div>
  );
}
