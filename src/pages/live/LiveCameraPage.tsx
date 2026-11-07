import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ENDED_MESSAGE, NOTE_MESSAGE, PROGRAM_MESSAGE, liveCloud, loadRealtimeKit, type RtkMeeting } from '../../utils/liveCloud';

/**
 * Phone / iPad camera for a cloud broadcast (livestream board: "Phone camera app").
 * Opens from the QR code or camera link with no login. The device sends its camera
 * to the cloud room, keeps the screen awake, and shows a tally: green when it's the
 * next shot, red while viewers are watching it. Notes from the control room show on
 * screen, and phones that support it get .5× / 1× / 3× zoom.
 */

type DeviceStatus = { battery: number | null; charging: boolean; network: string | null };

/** Battery and connection where the browser shares them (Android Chrome; iPhones don't) */
function useDeviceStatus(): DeviceStatus {
  const [status, setStatus] = useState<DeviceStatus>({ battery: null, charging: false, network: null });
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }>;
      connection?: { effectiveType?: string; downlink?: number; addEventListener?: (e: string, f: () => void) => void };
    };
    const readNetwork = () => {
      const c = nav.connection;
      if (!c?.effectiveType) return null;
      const strength = (c.downlink ?? 0) >= 5 ? 'strong' : (c.downlink ?? 0) >= 1.5 ? 'good' : 'weak';
      return `${c.effectiveType.toUpperCase()} · ${strength}`;
    };
    setStatus((s) => ({ ...s, network: readNetwork() }));
    nav.connection?.addEventListener?.('change', () => { if (!cancelled) setStatus((s) => ({ ...s, network: readNetwork() })); });
    nav.getBattery?.().then((b) => {
      const read = () => { if (!cancelled) setStatus((s) => ({ ...s, battery: Math.round(b.level * 100), charging: b.charging })); };
      read();
      b.addEventListener('levelchange', read);
      b.addEventListener('chargingchange', read);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return status;
}

type ZoomRange = { min: number; max: number };
function zoomPresets(range: ZoomRange | null): number[] {
  if (!range || range.max <= range.min) return [];
  const list = [range.min <= 0.6 ? Math.max(range.min, 0.5) : null, 1, range.max >= 3 ? 3 : range.max >= 2 ? 2 : null];
  return list.filter((z): z is number => z !== null && z >= range.min && z <= range.max);
}

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
  const [isNext, setIsNext] = useState(false);
  const [endedByRoom, setEndedByRoom] = useState(false);
  const lastProgramAtRef = useRef(0);
  const meetingRef = useRef<RtkMeeting | null>(null);
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  const [resolution, setResolution] = useState<number | null>(null);
  const device = useDeviceStatus();
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
      if (wakeLockRef.current) { setAwake(true); return; }
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

  // The control room repeats who's on program every 5 seconds. If that stops (control
  // room closed, broadcast ended), drop the tally after 15 seconds rather than stay on air.
  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => {
      if (lastProgramAtRef.current && Date.now() - lastProgramAtRef.current > 15000) {
        setOnAir(false);
        setIsNext(false);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  // A director's note stays up for 45 seconds (or until dismissed)
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 45000);
    return () => clearTimeout(t);
  }, [note]);

  // Zoom range and resolution of the camera in use (zoom isn't offered on iPhone)
  const readTrack = (m: RtkMeeting) => {
    try {
      const self = m.self as unknown as { rawVideoTrack?: MediaStreamTrack; videoTrack?: MediaStreamTrack };
      const track = self.rawVideoTrack || self.videoTrack;
      if (!track) return;
      const caps = (track.getCapabilities?.() || {}) as { zoom?: { min: number; max: number } };
      const settings = (track.getSettings?.() || {}) as { zoom?: number; height?: number };
      setZoomRange(caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max } : null);
      setZoom(settings.zoom ?? 1);
      setResolution(settings.height ?? null);
    } catch { setZoomRange(null); }
  };
  const applyZoom = async (value: number) => {
    if (!meeting) return;
    try {
      const self = meeting.self as unknown as { rawVideoTrack?: MediaStreamTrack; videoTrack?: MediaStreamTrack };
      const track = self.rawVideoTrack || self.videoTrack;
      await track?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      setZoom(value);
    } catch { /* this camera can't zoom */ }
  };

  const join = async () => {
    // Ask for the screen to stay awake inside the tap: Safari only grants it to a user gesture
    requestWakeLock();
    setPhase('joining');
    setError(null);
    setEndedByRoom(false);
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
        if (type === ENDED_MESSAGE) {
          finish(m, true);
          return;
        }
        if (type === NOTE_MESSAGE) {
          const to = payload?.to;
          const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
          if (text && (to === 'all' || to === m.self.id)) setNote({ text: text.slice(0, 160), at: Date.now() });
          return;
        }
        if (type !== PROGRAM_MESSAGE) return;
        lastProgramAtRef.current = Date.now();
        const mine = payload?.participantId === m.self.id;
        setIsNext(!mine && payload?.nextId === m.self.id);
        setOnAir((was) => {
          if (mine && !was) setOnAirSince(Date.now());
          return mine;
        });
      }) as any);
      // The room closing (broadcast ended, removed by the control room) ends filming here too
      const selfEvents = m.self as unknown as { on?: (ev: string, f: (p: { state: string }) => void) => void };
      selfEvents.on?.('roomLeft', ({ state }) => {
        if (state === 'ended' || state === 'kicked' || state === 'rejected') finish(m, true);
      });
      readTrack(m);
      meetingRef.current = m;
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
      readTrack(meeting);
    } catch { /* ignore */ }
  };

  // Stop sending and show the end screen (byRoom: the control room ended the broadcast)
  const finish = async (m: RtkMeeting | null, byRoom: boolean) => {
    if (meetingRef.current !== m && m !== null) return;
    meetingRef.current = null;
    try { await m?.leave(); } catch { /* already gone */ }
    setMeeting(null);
    setOnAir(false);
    setIsNext(false);
    setNote(null);
    setEndedByRoom(byRoom);
    setPhase('ended');
  };
  const leave = () => finish(meeting, false);

  const elapsed = onAirSince ? Math.max(0, Math.floor((now - onAirSince) / 1000)) : 0;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  const shell: React.CSSProperties = {
    minHeight: '100dvh', background: '#060B16', color: '#F4F6FB',
    fontFamily: "'Instrument Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
  };

  if (phase === 'live') {
    const presets = zoomPresets(zoomRange);
    const tally = onAir ? '#E11D38' : isNext ? '#30D158' : 'rgba(255,255,255,0.22)';
    const stats = [resolution ? `${resolution}p` : null, device.network, device.battery !== null ? `${device.battery}%` : null].filter(Boolean).join(' · ');
    return (
      <div style={{ ...shell, position: 'fixed', inset: 0 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        <div style={{ position: 'absolute', inset: 0, border: `6px solid ${tally}`, borderRadius: 4, pointerEvents: 'none', transition: 'border-color 0.2s ease' }} aria-hidden="true" />
        <div style={{ position: 'absolute', left: SAFE_LEFT, right: 'calc(max(16px, env(safe-area-inset-right)) + 64px)', top: 'max(12px, env(safe-area-inset-top))', display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 10,
            background: onAir ? '#E11D38' : isNext ? '#1F9D48' : 'rgba(6,11,22,0.7)', color: '#fff', fontWeight: 800, letterSpacing: '0.04em', fontSize: 14, flexShrink: 0 }}>
            {onAir && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} aria-hidden="true" />}
            {onAir ? `ON AIR · ${mmss}` : isNext ? 'NEXT · get ready' : 'STANDBY'}
          </span>
          {note ? (
            <button type="button" onClick={() => setNote(null)} aria-label={`Director: ${note.text}. Tap to dismiss.`}
              style={{ maxWidth: 420, minHeight: 34, padding: '7px 12px', borderRadius: 10, border: 0, background: 'rgba(6,11,22,0.82)', color: '#F4F6FB', fontSize: 14, lineHeight: 1.35, textAlign: 'left' }}>
              <b>Director:</b> {note.text}
            </button>
          ) : (
            <span style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'rgba(6,11,22,0.6)', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
              {name.trim() || position}
            </span>
          )}
        </div>
        {presets.length > 1 && (
          <div role="group" aria-label="Zoom" style={{ position: 'absolute', right: SAFE_RIGHT, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {presets.map((z) => {
              const active = Math.abs(zoom - z) < 0.05;
              return (
                <button key={z} type="button" onClick={() => applyZoom(z)} aria-pressed={active} aria-label={`Zoom ${z}×`}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: 0, fontSize: 13, fontWeight: 800,
                    background: active ? '#FFC83D' : 'rgba(6,11,22,0.72)', color: active ? '#1A1300' : '#fff' }}>
                  {z < 1 ? `.${String(z).split('.')[1] || '5'}` : `${z}×`}
                </button>
              );
            })}
          </div>
        )}
        {portrait && (
          <div style={{ position: 'absolute', left: SAFE_LEFT, right: SAFE_RIGHT, top: 'calc(max(12px, env(safe-area-inset-top)) + 50px)', padding: '10px 12px', borderRadius: 12, background: 'rgba(6,11,22,0.7)', fontSize: 14, textAlign: 'center' }}>
            Turn your phone sideways for the best picture
          </div>
        )}
        <div style={{ position: 'absolute', left: SAFE_LEFT, right: SAFE_RIGHT, bottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {stats && (
            <span style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'rgba(6,11,22,0.7)', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
              {stats}
            </span>
          )}
          {!awake && (
            <span style={{ height: 34, padding: '0 12px', borderRadius: 10, background: 'rgba(255,178,36,0.2)', color: '#FFD27A', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
              Keep the screen on
            </span>
          )}
          <span style={{ flex: 1 }} />
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
            {phase === 'ended' ? (endedByRoom ? 'Broadcast ended' : 'Thanks for filming') : 'Join as a camera'}
          </h1>
          {title && <p style={{ margin: '6px 0 0', color: 'rgba(235,240,255,0.72)' }}>{title}</p>}
        </div>

        {phase === 'ended' ? (
          <p style={{ color: 'rgba(235,240,255,0.72)', lineHeight: 1.5 }}>
            {endedByRoom
              ? 'The race officer has ended the broadcast. Your camera has stopped sending. Thanks for filming. You can close this page.'
              : 'You\'ve left the broadcast. You can close this page, or join again.'}
          </p>
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
            <dl style={{ margin: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', fontSize: 14 }}>
              <dt>Screen stays awake</dt>
              <dd style={{ margin: 0, fontWeight: 600, color: 'wakeLock' in navigator ? '#7BEA9C' : '#FFD27A' }}>{'wakeLock' in navigator ? 'On while filming' : 'Keep it on yourself'}</dd>
              {device.network && (<><dt>Connection</dt><dd style={{ margin: 0, fontWeight: 600, color: /weak/.test(device.network) ? '#FFD27A' : '#7BEA9C' }}>{device.network}</dd></>)}
              {device.battery !== null && (<><dt>Battery</dt><dd style={{ margin: 0, fontWeight: 600, color: device.battery < 25 && !device.charging ? '#FFD27A' : '#F4F6FB' }}>{device.battery}%{device.charging ? ' · charging' : ''}</dd></>)}
            </dl>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, fontWeight: 600 }}>
              Camera name (optional)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={position} maxLength={40}
                style={{ height: 48, borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#F4F6FB', padding: '0 14px', fontSize: 16 }} />
            </label>
          </>
        )}

        {error && <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 12, background: 'rgba(225,29,56,0.14)', color: '#FFB3BD', fontSize: 14 }}>{error}</p>}

        {!(phase === 'ended' && endedByRoom) && <button type="button" onClick={join} disabled={phase === 'joining' || !key}
          style={{ height: 52, borderRadius: 14, border: 0, background: 'linear-gradient(180deg,#2A93FF,#0A78F0)', color: '#fff', fontSize: 16, fontWeight: 700, opacity: phase === 'joining' ? 0.7 : 1 }}>
          {phase === 'joining' ? 'Joining…' : phase === 'ended' ? 'Join again' : 'Start camera'}
        </button>}
        {!key && <p style={{ margin: 0, color: '#FFB3BD', fontSize: 14 }}>This link is missing its key. Ask the race officer for the camera link.</p>}
        <p style={{ margin: 0, color: 'rgba(235,240,255,0.6)', fontSize: 13, lineHeight: 1.5 }}>
          No app or login needed. Your camera and microphone go to the broadcast only while this page is open, and the link stops working when the broadcast ends.
        </p>
      </main>
    </div>
  );
}

// Landscape phones: keep controls clear of the Dynamic Island / notch and the rounded corners
const SAFE_LEFT = 'max(16px, env(safe-area-inset-left))';
const SAFE_RIGHT = 'max(16px, env(safe-area-inset-right))';

const btn: React.CSSProperties = {
  height: 44, padding: '0 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(6,11,22,0.7)', color: '#fff', fontSize: 15, fontWeight: 700,
};
const chip: React.CSSProperties = {
  height: 40, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(235,240,255,0.85)', fontSize: 14, fontWeight: 600,
};
