import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { CAMERA_PRESET, NOTE_MESSAGE, PROGRAM_MESSAGE, liveCloud, loadRealtimeKit, type RtkMeeting } from '../../utils/liveCloud';

/**
 * Cloud engine test bench (club admins). Creates a hidden test broadcast on the
 * cloud engine, lets phones join as cameras, picks the program camera, starts the
 * program out to Cloudflare Stream and records races, and shows what happened.
 * Test broadcasts are never listed in AlfieTV.
 */

type Cam = { id: string; name: string; videoEnabled: boolean };
type Rec = { id: string; status: string; download_url?: string; output_file_name?: string; recording_duration?: number; started_time?: string };

function CamTile({ meeting, cam, isProgram, onPick }: { meeting: RtkMeeting; cam: Cam; isProgram: boolean; onPick: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const p = meeting.participants.joined.get(cam.id);
    const el = ref.current;
    if (!p || !el) return;
    meeting.participants.subscribe([cam.id], ['video']).catch(() => {});
    p.registerVideoElement(el);
    return () => { try { p.deregisterVideoElement(el); } catch { /* left */ } };
  }, [meeting, cam.id]);
  return (
    <button type="button" onClick={onPick} className={`alv-cam ${isProgram ? 'is-program' : ''}`} style={{ height: 150 }}
      aria-pressed={isProgram} aria-label={`${cam.name}${isProgram ? ', on program' : ', put on program'}`}>
      <video ref={ref} autoPlay playsInline muted />
      <span className="name" style={{ fontSize: 13 }}>{cam.name}{isProgram ? ' · ON PROGRAM' : ''}{cam.videoEnabled ? '' : ' (no picture)'}</span>
    </button>
  );
}

export default function LiveCloudTestPage() {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const clubId = currentClub?.clubId || '';
  const sessionId = new URLSearchParams(window.location.search).get('session') || '';

  const [session, setSession] = useState<Record<string, any> | null>(null);
  const [title, setTitle] = useState('Cloud engine test');
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [cameraUrl, setCameraUrl] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<RtkMeeting | null>(null);
  const [cams, setCams] = useState<Cam[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [player, setPlayer] = useState<string | null>(null);
  const [inputStatus, setInputStatus] = useState<string>('');
  const [race, setRace] = useState(1);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const note = useCallback((line: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((l) => [`${t}  ${line}`, ...l].slice(0, 80));
  }, []);

  const act = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    try {
      const r = await fn();
      note(`✓ ${label}`);
      return r;
    } catch (e) {
      note(`✗ ${label}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  // Load the test broadcast
  useEffect(() => {
    if (!sessionId) return;
    supabase.from('livestream_sessions').select('*').eq('id', sessionId).maybeSingle()
      .then(({ data }) => { setSession(data); if (data?.program_participant_id) setProgramId(data.program_participant_id); });
  }, [sessionId]);

  useEffect(() => {
    if (!cameraUrl || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, cameraUrl, { width: 200, margin: 1 }).catch(() => {});
  }, [cameraUrl]);

  const create = async () => {
    const r = await act('Create test broadcast', () =>
      liveCloud<{ session: Record<string, any>; cameraLink: { url: string } }>('create', { clubId, title, test: true }));
    if (r?.session) {
      setCameraUrl(r.cameraLink?.url ?? null);
      navigate(`/live/cloud-test?session=${r.session.id}`, { replace: true });
      setSession(r.session);
    }
  };

  const newCameraLink = async () => {
    const r = await act('New camera link', () => liveCloud<{ cameraLink: { url: string } }>('camera_link', { sessionId }));
    if (r?.cameraLink) setCameraUrl(r.cameraLink.url);
  };

  const joinControlRoom = async () => {
    const r = await act('Join as control room', async () => {
      const { token } = await liveCloud<{ token: string }>('director_token', { sessionId });
      const RealtimeKitClient = await loadRealtimeKit();
      const m = await RealtimeKitClient.init({ authToken: token, defaults: { audio: false, video: false } });
      await m.join();
      return m;
    });
    if (r) setMeeting(r);
  };

  // Track cameras in the room
  useEffect(() => {
    if (!meeting) return;
    const refresh = () => {
      const list: Cam[] = [];
      meeting.participants.joined.forEach((p) => {
        if (p.presetName === CAMERA_PRESET || !p.presetName) list.push({ id: p.id, name: p.name, videoEnabled: p.videoEnabled });
      });
      setCams(list);
    };
    refresh();
    const joined = meeting.participants.joined;
    const events = ['participantJoined', 'participantLeft', 'videoUpdate'] as const;
    events.forEach((ev) => joined.on(ev as any, refresh as any));
    return () => { events.forEach((ev) => joined.off(ev as any, refresh as any)); meeting.leave().catch(() => {}); };
  }, [meeting]);

  // Tell cameras and the program page which camera is on program, and which is next
  // (repeated, so late joiners catch up)
  const programIndex = cams.findIndex((c) => c.id === programId);
  const nextId = cams.length > 1 ? cams[(programIndex + 1) % cams.length]?.id ?? null : null;
  useEffect(() => {
    if (!meeting || !programId) return;
    const send = () => meeting.participants.broadcastMessage(PROGRAM_MESSAGE, nextId ? { participantId: programId, nextId } : { participantId: programId }).catch(() => {});
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [meeting, programId, nextId]);

  // Notes to camera operators ("Follow 51 round the windward mark")
  const [noteText, setNoteText] = useState('');
  const [noteTo, setNoteTo] = useState('all');
  const sendNote = async () => {
    const text = noteText.trim();
    if (!meeting || !text) return;
    await act(`Note to ${noteTo === 'all' ? 'all cameras' : cams.find((c) => c.id === noteTo)?.name || 'camera'}`,
      () => meeting.participants.broadcastMessage(NOTE_MESSAGE, { to: noteTo, text }));
    setNoteText('');
  };

  const pick = async (id: string) => {
    setProgramId(id);
    await act('Put camera on program', () => liveCloud('set_program', { sessionId, participantId: id }));
  };

  const refreshStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const st = await liveCloud<{ recordings: Rec[]; recordingsError?: string; liveInput?: { status?: { current?: { state?: string } } | string }; iframe?: string }>('status', { sessionId });
      setRecs(st.recordings || []);
      if (st.recordingsError) note(`Recordings: ${st.recordingsError}`);
      const s = st.liveInput?.status as any;
      setInputStatus(typeof s === 'string' ? s : (s?.current?.state || 'unknown'));
      if (st.iframe) setPlayer(st.iframe);
    } catch (e) {
      note(`Status: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [sessionId, note]);

  useEffect(() => {
    if (!sessionId) return;
    refreshStatus();
    const t = setInterval(refreshStatus, 10000);
    return () => clearInterval(t);
  }, [sessionId, refreshStatus]);

  const card: React.CSSProperties = { background: 'var(--alv-panel)', border: '1px solid var(--alv-line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 };

  return (
    <div className="alv" style={{ minHeight: '100vh', background: 'var(--alv-bg)', padding: '24px 20px 48px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="alv-btn is-small" onClick={() => navigate('/livestream')}>Back</button>
          <div>
            <div className="alv-eyebrow">AlfiePRO Live · test bench</div>
            <h1 className="alv-disp" style={{ fontSize: 26, fontWeight: 700, margin: '2px 0 0' }}>Cloud engine test</h1>
          </div>
          <span style={{ flex: 1 }} />
          {session && <span className="alv-chip is-test">Test broadcast · hidden from AlfieTV</span>}
        </div>

        {!sessionId && (
          <div style={card}>
            <p className="alv-mute" style={{ margin: 0, lineHeight: 1.5 }}>
              Creates a hidden test broadcast on the cloud engine. Join a phone as a camera, put it on program,
              go live, and record a race. Everything here is private: it's never listed in AlfieTV and race videos go to YouTube unlisted.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ height: 42, borderRadius: 10, border: '1px solid var(--alv-line)', background: 'var(--alv-fill)', color: 'var(--alv-ink)', padding: '0 12px', fontSize: 15, maxWidth: 420 }} />
            </label>
            <div><button type="button" className="alv-btn" disabled={!!busy || !clubId} onClick={create}>{busy ? `${busy}…` : 'Create test broadcast'}</button></div>
            {!clubId && <p style={{ margin: 0, color: '#FFB3BD' }}>Choose a club first.</p>}
          </div>
        )}

        {sessionId && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={card}>
              <span className="alv-eyebrow">1 · Cameras</span>
              {cameraUrl ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <canvas ref={qrRef} style={{ borderRadius: 8, background: '#fff' }} />
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="alv-mute" style={{ fontSize: 13 }}>Scan with a phone or iPad. No login needed.</span>
                    <input readOnly value={cameraUrl} onFocus={(e) => e.currentTarget.select()} style={{ height: 36, borderRadius: 8, border: '1px solid var(--alv-line)', background: 'var(--alv-fill)', color: 'var(--alv-ink)', padding: '0 8px', fontSize: 12 }} />
                    <button type="button" className="alv-btn is-small" onClick={() => navigator.clipboard.writeText(cameraUrl).then(() => note('Camera link copied'))}>Copy link</button>
                  </div>
                </div>
              ) : (
                <div><button type="button" className="alv-btn is-small" disabled={!!busy} onClick={newCameraLink}>Show camera link</button></div>
              )}
            </div>

            <div style={card}>
              <span className="alv-eyebrow">2 · Control room</span>
              {!meeting ? (
                <div><button type="button" className="alv-btn" disabled={!!busy} onClick={joinControlRoom}>Join as control room</button></div>
              ) : cams.length === 0 ? (
                <span className="alv-mute">Waiting for cameras to join…</span>
              ) : (
                <>
                  <div className="alv-cams">
                    {cams.map((c) => <CamTile key={c.id} meeting={meeting} cam={c} isProgram={c.id === programId} onPick={() => pick(c.id)} />)}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); sendNote(); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={noteTo} onChange={(e) => setNoteTo(e.target.value)} aria-label="Send the note to"
                      style={{ height: 36, borderRadius: 8, border: '1px solid var(--alv-line)', background: 'var(--alv-fill)', color: 'var(--alv-ink)', padding: '0 8px' }}>
                      <option value="all">All cameras</option>
                      {cams.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Note to the camera, e.g. follow 51" maxLength={160} aria-label="Note"
                      style={{ flex: 1, minWidth: 160, height: 36, borderRadius: 8, border: '1px solid var(--alv-line)', background: 'var(--alv-fill)', color: 'var(--alv-ink)', padding: '0 10px' }} />
                    <button type="submit" className="alv-btn is-small" disabled={!noteText.trim()}>Send note</button>
                  </form>
                </>
              )}
            </div>

            <div style={card}>
              <span className="alv-eyebrow">3 · Go live and record</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="alv-btn" disabled={!!busy} onClick={() => act('Start program out', () => liveCloud('program_start', { sessionId })).then(refreshStatus)}>Go live</button>
                <button type="button" className="alv-btn" disabled={!!busy} onClick={() => act('Stop program out', () => liveCloud('program_stop', { sessionId })).then(refreshStatus)}>Stop live</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label className="alv-mute" style={{ fontSize: 13 }}>Race
                  <input type="number" min={1} value={race} onChange={(e) => setRace(Math.max(1, Number(e.target.value) || 1))} style={{ width: 56, marginLeft: 6, height: 34, borderRadius: 8, border: '1px solid var(--alv-line)', background: 'var(--alv-fill)', color: 'var(--alv-ink)', padding: '0 8px' }} />
                </label>
                <button type="button" className="alv-btn is-small" disabled={!!busy} onClick={() => act(`Start recording race ${race}`, () => liveCloud('race_start', { sessionId, raceNumber: race })).then(refreshStatus)}>Record race</button>
                <button type="button" className="alv-btn is-small" disabled={!!busy} onClick={() => act('Stop race recording', () => liveCloud('race_stop', { sessionId })).then(() => { setRace((r) => r + 1); refreshStatus(); })}>Stop race</button>
              </div>
              <div><button type="button" className="alv-btn is-small" disabled={!!busy} style={{ borderColor: 'rgba(225,29,56,0.5)' }}
                onClick={() => act('End broadcast', () => liveCloud('program_stop', { sessionId, end: true })).then(refreshStatus)}>End broadcast</button></div>
              <span className="alv-mute" style={{ fontSize: 13 }}>Cloudflare input: {inputStatus || '…'}</span>
            </div>

            <div style={card}>
              <span className="alv-eyebrow">4 · What viewers see (Cloudflare Stream)</span>
              {player ? (
                <iframe title="Program output" src={`${player}?autoplay=true&muted=true`} allow="autoplay; fullscreen" style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 10, background: '#000' }} />
              ) : <span className="alv-mute">No player yet.</span>}
              <button type="button" className="alv-btn is-small" onClick={() => setPlayer((p) => (p ? `${p.split('#')[0]}#${Date.now()}` : p))}>Reload player</button>
            </div>

            <div style={{ ...card, gridColumn: '1 / -1' }}>
              <span className="alv-eyebrow">Recordings</span>
              {recs.length === 0 ? <span className="alv-mute">None yet.</span> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  {recs.map((r) => (
                    <div key={r.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="alv-mono">{r.status}</span>
                      <span>{r.output_file_name || r.id}</span>
                      {r.recording_duration ? <span className="alv-mute">{Math.round(r.recording_duration)} s</span> : null}
                      {r.download_url && <a href={r.download_url} target="_blank" rel="noreferrer" style={{ color: '#8CC4FF' }}>Download</a>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...card, gridColumn: '1 / -1' }}>
              <span className="alv-eyebrow">Log</span>
              <pre className="alv-mono" style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', color: 'var(--alv-mute)' }}>
                {log.join('\n') || 'Nothing yet.'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
