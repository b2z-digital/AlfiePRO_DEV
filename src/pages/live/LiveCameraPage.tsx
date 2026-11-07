import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PROGRAM_MESSAGE, liveCloud, loadRealtimeKit, type RtkMeeting } from '../../utils/liveCloud';

/**
 * Phone / iPad camera for a cloud broadcast (livestream board: "Phone camera app").
 * Opens from the QR code or camera link with no login. The device sends its camera
 * to the cloud room, keeps the screen awake, and shows a tally: red while viewers
 * are watching this camera.
 */

const POSITIONS = ['Start boat', 'Windward mark', 'Shore', 'Drone'];

type Phase = 'join' | 'joining' | 'live' | 'ended' | 'error';

export default function LiveCameraPage() {
  const { sessionId = '' } = useParams();
  const key = new URLSearchParams(window.location.search).get('k') || '';

  const [phase, setPhase] = useState<Phase>('join');
  const [position, setPosition] = useState(POSITIONS[0]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<RtkMeeting | null>(null);
  const [onAir, setOnAir] = useState(false);
  const [onAirSince, setOnAirSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [awake, setAwake] = useState(false);
  const [portrait, setPortrait] = useState(() => window.matchMedia?.('(orientation: portrait)').matches ?? false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const deviceIndexRef = useRef(0);

  useEffect(() => {
    document.title = 'AlfiePRO camera';
    const mq = window.matchMedia?.('(orientation: portrait)');
    const onChange = () => setPortrait(!!mq?.matches);
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  // Keep the screen on while sending (re-requested when the page comes back)
  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      if (!nav.wakeLock) { setAwake(false); return; }
      wakeLockRef.current = await nav.wakeLock.request('screen');
      setAwake(true);
    } catch { setAwake(false); }
  };
  useEffect(() => {
    if (phase !== 'live') return;
    requestWakeLock();
    const onVis = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [phase]);

  useEffect(() => {
    if (!onAir) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [onAir]);

  const join = async () => {
    setPhase('joining');
    setError(null);
    try {
      const cameraName = `${name.trim() || position}`;
      const res = await liveCloud<{ token: string; title: string }>('join_camera', { sessionId, key, name: cameraName });
      setTitle(res.title || '');
      const RealtimeKitClient = await loadRealtimeKit();
      const m = await RealtimeKitClient.init({
        authToken: res.token,
        defaults: { audio: true, video: true },
      });
      await m.join();
      // Prefer the back camera on phones and tablets
      try {
        const vids = await m.self.getVideoDevices();
        devicesRef.current = vids;
        const back = vids.findIndex((d) => /back|rear|environment/i.test(d.label));
        if (back > 0) { deviceIndexRef.current = back; await m.self.setDevice(vids[back]); }
      } catch { /* keep the default camera */ }
      if (!m.self.videoEnabled) await m.self.enableVideo().catch(() => {});
      m.participants.on('broadcastedMessage', (({ type, payload }: { type: string; payload: Record<string, unknown> }) => {
        if (type !== PROGRAM_MESSAGE) return;
        const mine = payload?.participantId === m.self.id;
        setOnAir((was) => {
          if (mine && !was) setOnAirSince(Date.now());
          return mine;
        });
      }) as any);
      setMeeting(m);
      setPhase('live');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the broadcast');
      setPhase('error');
    }
  };

  useEffect(() => {
    if (!meeting || !videoRef.current) return;
    const el = videoRef.current;
    meeting.self.registerVideoElement(el, true);
    return () => { try { meeting.self.deregisterVideoElement(el, true); } catch { /* left */ } };
  }, [meeting]);

  const flip = async () => {
    if (!meeting) return;
    try {
      if (devicesRef.current.length === 0) devicesRef.current = await meeting.self.getVideoDevices();
      const list = devicesRef.current;
      if (list.length < 2) return;
      deviceIndexRef.current = (deviceIndexRef.current + 1) % list.length;
      await meeting.self.setDevice(list[deviceIndexRef.current]);
    } catch { /* ignore */ }
  };

  const leave = async () => {
    try { await meeting?.leave(); } catch { /* already gone */ }
    setMeeting(null);
    setOnAir(false);
    setPhase('ended');
  };

  const elapsed = onAirSince ? Math.max(0, Math.floor((now - onAirSince) / 1000)) : 0;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const shell: React.CSSProperties = {
    minHeight: '100dvh', background: '#060B16', color: '#F4F6FB',
    fontFamily: "'Instrument Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
  };

  if (phase === 'live') {
    return (
      <div style={{ ...shell, position: 'fixed', inset: 0 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        <div style={{ position: 'absolute', inset: 0, border: `6px solid ${onAir ? '#E11D38' : '#30D158'}`, pointerEvents: 'none' }} aria-hidden="true" />
        <div style={{ position: 'absolute', left: 16, right: 16, top: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 10,
            background: onAir ? '#E11D38' : 'rgba(48,209,88,0.9)', color: onAir ? '#fff' : '#04140A', fontWeight: 800, letterSpacing: '0.06em', fontSize: 14 }}>
            {onAir ? `ON AIR · ${mmss}` : 'STANDBY'}
          </span>
          <span style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'rgba(6,11,22,0.6)', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
            {name.trim() || position}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'rgba(6,11,22,0.6)', display: 'inline-flex', alignItems: 'center', fontSize: 12.5 }}>
            {awake ? 'Screen stays awake' : 'Keep the screen on'}
          </span>
        </div>
        {portrait && (
          <div style={{ position: 'absolute', left: 16, right: 16, top: 64, padding: '10px 12px', borderRadius: 12, background: 'rgba(6,11,22,0.7)', fontSize: 14, textAlign: 'center' }}>
            Turn your phone sideways for the best picture
          </div>
        )}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'max(16px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button type="button" onClick={flip} style={btn}>Switch camera</button>
          <button type="button" onClick={leave} style={{ ...btn, background: 'rgba(225,29,56,0.85)', borderColor: 'transparent' }}>Leave</button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <main style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '32px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(235,240,255,0.64)' }}>AlfiePRO Live</div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: '6px 0 0' }}>
            {phase === 'ended' ? 'Thanks for filming' : 'Join as a camera'}
          </h1>
          {title && <p style={{ margin: '6px 0 0', color: 'rgba(235,240,255,0.72)' }}>{title}</p>}
        </div>

        {phase === 'ended' ? (
          <p style={{ color: 'rgba(235,240,255,0.72)', lineHeight: 1.5 }}>You've left the broadcast. You can close this page, or join again.</p>
        ) : (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Where are you?</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {POSITIONS.map((p) => (
                  <button key={p} type="button" aria-pressed={position === p} onClick={() => setPosition(p)}
                    style={{ ...chip, ...(position === p ? { background: 'rgba(42,147,255,0.2)', borderColor: '#2A93FF', color: '#fff' } : {}) }}>
                    {p}
                  </button>
                ))}
              </div>
            </fieldset>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, fontWeight: 600 }}>
              Camera name (optional)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={position} maxLength={40}
                style={{ height: 48, borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#F4F6FB', padding: '0 14px', fontSize: 16 }} />
            </label>
          </>
        )}

        {error && <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 12, background: 'rgba(225,29,56,0.14)', color: '#FFB3BD', fontSize: 14 }}>{error}</p>}

        <button type="button" onClick={join} disabled={phase === 'joining' || !key}
          style={{ height: 52, borderRadius: 14, border: 0, background: 'linear-gradient(180deg,#2A93FF,#0A78F0)', color: '#fff', fontSize: 16, fontWeight: 700, opacity: phase === 'joining' ? 0.7 : 1 }}>
          {phase === 'joining' ? 'Joining…' : phase === 'ended' ? 'Join again' : 'Start camera'}
        </button>
        {!key && <p style={{ margin: 0, color: '#FFB3BD', fontSize: 14 }}>This link is missing its key. Ask the race officer for the camera link.</p>}
        <p style={{ margin: 0, color: 'rgba(235,240,255,0.6)', fontSize: 13, lineHeight: 1.5 }}>
          No app or login needed. Your camera and microphone go to the broadcast only while this page is open, and the link stops working when the broadcast ends.
        </p>
      </main>
    </div>
  );
}

const btn: React.CSSProperties = {
  height: 48, padding: '0 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(6,11,22,0.7)', color: '#fff', fontSize: 15, fontWeight: 700,
};
const chip: React.CSSProperties = {
  height: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(235,240,255,0.85)', fontSize: 14, fontWeight: 600,
};
