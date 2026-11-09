import { useEffect, useMemo, useState } from 'react';
import { X, Smartphone, Server, Cloud, Clapperboard, Radio } from 'lucide-react';
import { money, needsCredit, useLivestreamCredit } from '../../utils/livestreamCredit';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { createBroadcast, loadStreamableEvents, type FilmingMode, type StreamableEvent } from '../../utils/liveBroadcasts';
import type { LivestreamSession } from '../../types/livestream';

/**
 * New broadcast (livestream board "New broadcast sheet"): one screen instead of a
 * four-step wizard. Nothing goes public until Go live.
 */

interface NewBroadcastSheetProps {
  clubId: string;
  onClose: () => void;
  onCreated: (session: LivestreamSession) => void;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function NewBroadcastSheet({ clubId, onClose, onCreated }: NewBroadcastSheetProps) {
  const { user, isSuperAdmin } = useAuth();
  const { addNotification } = useNotification();
  const [events, setEvents] = useState<StreamableEvent[] | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [timing, setTiming] = useState<'now' | 'schedule'>('now');
  const [scheduled, setScheduled] = useState('');
  const [filming, setFilming] = useState<FilmingMode>('device');
  // Record races (free: race videos to YouTube/AlfieTV replays) or Livestream (paid: live in AlfieTV)
  const [mode, setMode] = useState<'record' | 'live'>('record');
  const { credit } = useLivestreamCredit(clubId);
  const [audience, setAudience] = useState<'everyone' | 'test'>('everyone');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStreamableEvents(clubId).then(setEvents).catch(() => setEvents([]));
  }, [clubId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const selected = useMemo(() => events?.find((e) => e.id === eventId) ?? null, [events, eventId]);

  const pick = (ev: StreamableEvent | null) => {
    setEventId(ev?.id ?? null);
    if (!titleTouched) setTitle(ev ? `${ev.name}${mode === 'live' ? ' · Live' : ''}` : '');
    if (ev) {
      const d = new Date(`${ev.date}T09:30:00`);
      if (d.getTime() > Date.now() + 30 * 60000) { setTiming('schedule'); setScheduled(toLocalInput(d)); }
    }
  };

  const chooseMode = (m: 'record' | 'live') => {
    setMode(m);
    if (!titleTouched && selected) setTitle(`${selected.name}${m === 'live' ? ' · Live' : ''}`);
  };
  const short = mode === 'live' && needsCredit(credit, audience === 'test');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const label = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Race videos are cut from the scoring, so Record races needs an event
  const canCreate = !!title.trim() && !saving && (timing === 'now' || !!scheduled) && (mode === 'live' || !!eventId);

  const create = async () => {
    if (!user || !canCreate) return;
    setSaving(true);
    try {
      const session = await createBroadcast({
        clubId,
        userId: user.id,
        title: title.trim(),
        eventId,
        scheduledTime: timing === 'schedule' ? new Date(scheduled).toISOString() : null,
        filming,
        isPublic: audience === 'everyone',
        racesOnly: mode === 'record',
      });
      addNotification('success', mode === 'record'
        ? 'Created. Press Start recording when racing begins.'
        : 'Broadcast created. Nothing is public until you press Go live.', 4000);
      onCreated(session);
    } catch (e) {
      addNotification('error', e instanceof Error ? e.message : 'Could not create the broadcast');
    } finally {
      setSaving(false);
    }
  };

  const option = (active: boolean): React.CSSProperties => ({
    textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer', color: 'var(--alv-ink)',
    border: `1px solid ${active ? 'var(--alv-blue)' : 'var(--alv-line)'}`,
    background: active ? 'rgba(42,147,255,0.12)' : 'rgba(255,255,255,0.03)',
    font: 'inherit',
  });

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,15,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="alv-new-title" className="alv"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', overflow: 'auto', background: 'var(--alv-panel)', border: '1px solid var(--alv-line)', borderRadius: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 22px 8px' }}>
          <div>
            <h2 id="alv-new-title" className="alv-disp" style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>New broadcast</h2>
            <p className="alv-mute" style={{ margin: '4px 0 0', fontSize: 14 }}>One screen. Nothing goes public until you start.</p>
          </div>
          <button type="button" className="alv-ib" onClick={onClose} aria-label="Close" disabled={saving}><X size={18} /></button>
        </div>

        <div style={{ padding: '8px 22px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section aria-labelledby="alv-what">
            <h3 id="alv-what" className="alv-eyebrow" style={{ margin: '0 0 10px' }}>What are you covering?</h3>
            {events === null ? <span className="alv-mute">Loading your races…</span> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflow: 'auto' }} role="radiogroup" aria-labelledby="alv-what">
                {events.map((ev) => {
                  const d = new Date(`${ev.date}T12:00:00`);
                  const on = eventId === ev.id;
                  return (
                    <button key={ev.id} type="button" role="radio" aria-checked={on} onClick={() => pick(ev)} style={{ ...option(on), display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="alv-date"><small>{d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</small><b>{d.getDate()}</b></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{ev.name}</span>
                        <span className="alv-mute" style={{ fontSize: 13 }}>{[label(ev.date), ev.venue].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="alv-chip" style={{ height: 24 }}>{ev.kind}</span>
                    </button>
                  );
                })}
                <button type="button" role="radio" aria-checked={eventId === null} onClick={() => pick(null)} style={option(eventId === null)}>
                  <span style={{ fontWeight: 600 }}>No event: go live now and link it later</span>
                </button>
              </div>
            )}
          </section>

          <section aria-labelledby="alv-when" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <h3 id="alv-when" className="alv-eyebrow" style={{ margin: 0, width: '100%' }}>When</h3>
            <div className="alv-seg" role="group" aria-labelledby="alv-when">
              <button type="button" aria-pressed={timing === 'now'} onClick={() => setTiming('now')}>Now</button>
              <button type="button" aria-pressed={timing === 'schedule'} onClick={() => { setTiming('schedule'); if (!scheduled) setScheduled(toLocalInput(new Date(Date.now() + 86400000))); }}>Schedule</button>
            </div>
            {timing === 'schedule' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }} className="alv-mute">
                Pre-show starts
                <input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className="alv-input" style={{ colorScheme: 'dark' }} />
              </label>
            )}
          </section>

          <section aria-labelledby="alv-mode">
            <h3 id="alv-mode" className="alv-eyebrow" style={{ margin: '0 0 10px' }}>Record or livestream?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }} role="radiogroup" aria-labelledby="alv-mode">
              <button type="button" role="radio" aria-checked={mode === 'record'} onClick={() => chooseMode('record')} style={option(mode === 'record')}>
                <Clapperboard size={18} aria-hidden="true" />
                <span style={{ display: 'block', fontWeight: 700, marginTop: 6 }}>Record races <span className="alv-chip" style={{ height: 20, marginLeft: 4 }}>Free</span></span>
                <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Each race is recorded and published to YouTube and AlfieTV replays once it's scored. Not shown live, and members aren't notified.</span>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'live'} onClick={() => chooseMode('live')} style={option(mode === 'live')}>
                <Radio size={18} aria-hidden="true" />
                <span style={{ display: 'block', fontWeight: 700, marginTop: 6 }}>Livestream</span>
                <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                  Live in AlfieTV and the event's Live tab, members are notified, and every race is still published as a video.
                  {credit && credit.settings.enforce && !credit.exempt ? ` Uses livestream credit (balance ${money(credit.balance_cents)}).` : ''}
                </span>
              </button>
            </div>
            {mode === 'record' && events !== null && !eventId && (
              <p className="alv-mute" style={{ margin: '10px 0 0', fontSize: 13.5 }}>Pick the event above: race videos are cut from its scoring.</p>
            )}
            {short && (
              <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, color: '#FFB4BE' }}>
                Not enough livestream credit to go live ({money(credit!.balance_cents)}; {money(credit!.settings.min_balance_cents)} needed). Add credit on the broadcasts board, or choose Record races.
              </p>
            )}
          </section>

          <section aria-labelledby="alv-how">
            <h3 id="alv-how" className="alv-eyebrow" style={{ margin: '0 0 10px' }}>How you're filming</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }} role="radiogroup" aria-labelledby="alv-how">
              <button type="button" role="radio" aria-checked={filming === 'device'} onClick={() => setFilming('device')} style={option(filming === 'device')}>
                <Smartphone size={18} aria-hidden="true" />
                <span style={{ display: 'block', fontWeight: 700, marginTop: 6 }}>This laptop or iPad</span>
                <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Its camera, plus phones that scan a QR code. Keep this screen open while live.</span>
              </button>
              <button type="button" role="radio" aria-checked={filming === 'encoder'} onClick={() => setFilming('encoder')} style={option(filming === 'encoder')}>
                <Server size={18} aria-hidden="true" />
                <span style={{ display: 'block', fontWeight: 700, marginTop: 6 }}>Pro encoder</span>
                <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45 }}>OBS, vMix, ATEM or Larix over RTMPS. We give you the server and key.</span>
              </button>
              {isSuperAdmin && (
                <button type="button" role="radio" aria-checked={filming === 'cloud'} onClick={() => setFilming('cloud')} style={option(filming === 'cloud')}>
                  <Cloud size={18} aria-hidden="true" />
                  <span style={{ display: 'block', fontWeight: 700, marginTop: 6 }}>Cloud production <span className="alv-chip is-test" style={{ height: 20, marginLeft: 4 }}>Beta</span></span>
                  <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Phones and iPads join by link with no login. The program is mixed in the cloud, so the stream keeps going if your laptop drops out.</span>
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="alv-who" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <h3 id="alv-who" className="alv-eyebrow" style={{ margin: 0, width: '100%' }}>Who can watch</h3>
            <div className="alv-seg" role="group" aria-labelledby="alv-who">
              <button type="button" aria-pressed={audience === 'everyone'} onClick={() => setAudience('everyone')}>Everyone</button>
              <button type="button" aria-pressed={audience === 'test'} onClick={() => setAudience('test')}>Test (link only)</button>
            </div>
            <span className="alv-mute" style={{ fontSize: 13, flex: 1, minWidth: 220 }}>
              {audience === 'test'
                ? 'Hidden from AlfieTV, members aren\'t notified, and race videos go to YouTube unlisted.'
                : mode === 'record'
                  ? 'Each race goes to YouTube (AUS RC Yachting) and AlfieTV replays once it\'s scored.'
                  : 'Live in AlfieTV and the event\'s Live tab. Each race goes to YouTube (AUS RC Yachting) once it\'s scored.'}
            </span>
          </section>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, fontWeight: 600 }}>
            Title
            <input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} placeholder={selected ? `${selected.name}${mode === 'live' ? ' · Live' : ''}` : mode === 'live' ? 'e.g. Club night · Live' : 'e.g. Club night'} className="alv-input" maxLength={140} />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--alv-line)', flexWrap: 'wrap' }}>
          <span className="alv-mute" style={{ fontSize: 13, marginRight: 'auto' }}>
            {filming === 'cloud' ? 'Creates the broadcast and a volunteer camera link'
              : mode === 'record' && filming === 'device' ? 'Records on this device; nothing is streamed'
              : 'Creates the broadcast and its Cloudflare input'}
          </span>
          <button type="button" className="alv-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="alv-btn alv-btn-p" onClick={create} disabled={!canCreate}>{saving ? 'Creating…' : 'Create broadcast'}</button>
        </div>
      </div>
    </div>
  );
}
