/**
 * Race Management · Together (board: "More hands on race day"): the scorer's "Score together"
 * sheet (QR, PIN, who's on the session), the "two phones disagree" prompt, and the spotter's
 * phone, which joins by PIN with no account and only calls finishes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useParams } from 'react-router-dom';
import type { RaceEvent } from '../../types/race';
import { createOrFetchSession, joinScoringSession, joinUrlFor } from '../../utils/scoringSessions';
import { isNative } from '../../lib/native/platform';
import { Icon } from '../icons';
import { ordinal, shortName } from '../finishPad';
import { clock, type FinishConflict, type PadInfo } from '../raceSession';
import { joinAsSpotter, startHosting, stopHosting, hostInfo, hostFor, type Person, type Spotter, type SpotterState } from '../scoreTogether';
import { HEAT_COLOURS } from './RaceSetup';
import '../../styles/alfie-mobile.css';

const WEB_ORIGIN = 'https://app.alfiepro.com.au';
const joinOrigin = () => (isNative ? WEB_ORIGIN : window.location.origin);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/* ─────────────── the scorer: Score together ─────────────── */

export const ScoreTogetherSheet: React.FC<{ event: RaceEvent; clubId?: string; hostName: string; onClose: () => void; toast: (m: string) => void }> = ({ event, clubId, hostName, onClose, toast }) => {
  const [pin, setPin] = useState<string | null>(hostInfo(event.id)?.pin || null);
  const [qr, setQr] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventName = event.eventName || 'Race day';

  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    (async () => {
      try {
        const cid = clubId || event.clubId;
        if (!cid) { setError('This event has no club, so it can\'t be shared.'); return; }
        const { session, error: e } = await createOrFetchSession(event.id, cid, eventName);
        if (gone) return;
        if (!session) { setError(e || 'Couldn\'t start a session. Check your connection.'); return; }
        const host = startHosting({ sessionId: session.id, pin: session.pin_code, eventId: event.id, eventName, hostName });
        setPin(session.pin_code);
        off = host.link.onPeople(setPeople);
        host.broadcast();
        setQr(await QRCode.toDataURL(joinUrlFor(session.pin_code, joinOrigin()), { width: 360, margin: 1, color: { dark: '#0B1220', light: '#FFFFFF' } }));
      } catch (err: any) {
        if (!gone) setError(navigator.onLine ? (err?.message || 'Couldn\'t start a session.') : 'Score together needs signal to start. Finishes you call are kept on this phone.');
      }
    })();
    return () => { gone = true; off?.(); };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = pin ? joinUrlFor(pin, joinOrigin()) : '';
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Score together">
        <span className="m-grab" />
        <div className="m-row">
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
          <div className="m-disp" style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }}>Score together</div>
          <span style={{ width: 44 }} />
        </div>
        <div className="m-dim" style={{ textAlign: 'center', fontSize: 13, marginTop: 2 }}>{eventName}</div>
        {error ? <div className="m-card m-empty" style={{ marginTop: 14 }}>{error}</div> : (
          <>
            <div className="m-qr" role="img" aria-label="QR code to join scoring">{qr ? <img src={qr} alt="" /> : <span className="m-dim">Starting…</span>}</div>
            <div className="m-dim" style={{ textAlign: 'center', fontSize: 12.5 }}>or enter PIN at {joinOrigin().replace(/^https?:\/\//, '')}/join-scoring</div>
            <div className="m-pin" aria-label={pin ? `PIN ${pin.split('').join(' ')}` : 'PIN'}>{(pin || '······').split('').map((d, i) => <b key={i}>{d}</b>)}</div>
            <div className="m-card" style={{ overflow: 'hidden', marginTop: 12 }}>
              <div className="m-li m-li-head"><span className="m-lb m-dim">On this session · {people.length}</span></div>
              {people.map(p => (
                <div key={p.key} className="m-li" style={{ gap: 10 }}>
                  <span className="m-av-s">{initials(p.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.role === 'scorer' ? 'You' : p.name}</div>
                    <div className="m-dim" style={{ fontSize: 12.5 }}>{p.role === 'scorer' ? 'Race scorer' : 'Calling finishes'} · {p.device}</div>
                  </div>
                  <span className="m-dot-on" aria-label="Connected" />
                </div>
              ))}
            </div>
            <div className="m-dim" style={{ fontSize: 12.5, marginTop: 10 }}>Spotters join this event only, with no account. The PIN ends with the session.</div>
            <div className="m-row" style={{ gap: 8, marginTop: 12 }}>
              <button className="m-btn m-btn-g" style={{ flex: 1 }} disabled={!pin} onClick={async () => {
                try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); }
              }}>Copy link</button>
              <button className="m-btn m-btn-g" style={{ flex: 1, color: 'var(--m-red-ink)' }} disabled={!pin} onClick={async () => { await stopHosting(event.id); toast('Session ended. Spotters have been told.'); onClose(); }}>End session</button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

/** Who's calling finishes with the scorer (for the race screen and finish pad). */
export function useTogether(eventId: string | undefined, onCall?: (e: { kind: 'conflict' | 'call'; who: string }) => void) {
  const [people, setPeople] = useState<Person[]>([]);
  const cb = useRef(onCall);
  cb.current = onCall;
  useEffect(() => {
    if (!eventId) return;
    const host = hostFor(eventId);
    if (!host) { setPeople([]); return; }
    const offP = host.link.onPeople(setPeople);
    const offC = host.onCall(e => cb.current?.(e));
    return () => { offP(); offC(); };
  }, [eventId]);
  return { hosting: !!(eventId && hostInfo(eventId)), spotters: people.filter(p => p.role === 'spotter') };
}

/* ─────────────── two phones disagree ─────────────── */

export const ConflictCard: React.FC<{ conflict: FinishConflict; pad: PadInfo; onKeep: (winner: number) => void }> = ({ conflict, pad, onKeep }) => {
  const [pick, setPick] = useState(conflict.a);
  const opts = [{ i: conflict.a, who: conflict.aWho, at: conflict.aAt }, { i: conflict.b, who: conflict.bWho, at: conflict.bAt }];
  return (
    <div className="m-card m-conflict" role="group" aria-label={`Who finished ${ordinal(conflict.place)}?`}>
      <div className="m-li m-li-head" style={{ background: 'rgba(255,159,10,.12)' }}><span style={{ fontWeight: 700, color: 'var(--m-amber-ink)' }}>Who finished {ordinal(conflict.place)}?</span></div>
      {opts.map(o => (
        <button key={o.i} className={`m-li m-conf-opt ${pick === o.i ? 'm-conf-on' : ''}`} aria-pressed={pick === o.i} onClick={() => setPick(o.i)}>
          <span className="m-radio" />
          <span className="m-sail">{pad.boats[o.i]?.sail || '–'}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{pad.boats[o.i]?.name}</span>
            <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{o.who}{o.at ? ` · ${timeOf(o.at)}` : ''}</span>
          </span>
        </button>
      ))}
      <div className="m-li m-dim" style={{ fontSize: 12.5 }}>The other boat moves to {ordinal(conflict.place + 1)}. You can still drag to fix the order afterwards.</div>
      <div style={{ padding: '0 14px 14px' }}>
        <button className="m-btn m-btn-p" style={{ width: '100%' }} onClick={() => onKeep(pick)}>Keep {pad.boats[pick]?.sail} in {ordinal(conflict.place)}</button>
      </div>
    </div>
  );
};

/* ─────────────── a spotter's phone ─────────────── */

const SPOTTER_KEY = 'alfie-spotter';
interface Joined { sessionId: string; name: string; eventName: string; pin: string }
const readJoined = (): Joined | null => { try { const r = sessionStorage.getItem(SPOTTER_KEY); return r ? JSON.parse(r) : null; } catch { return null; } };

const SpotterPad: React.FC<{ joined: Joined; onLeave: () => void }> = ({ joined, onLeave }) => {
  const [state, setState] = useState<SpotterState | null | undefined>(undefined);
  const [ended, setEnded] = useState(false);
  const [pending, setPending] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const sp = useRef<Spotter | null>(null);
  useEffect(() => {
    const s = joinAsSpotter(joined.sessionId, joined.name, st => { setState(st); setPending(p => p.filter(i => !st?.order.some(o => o.i === i))); }, () => setEnded(true));
    sp.current = s;
    return () => s.close();
  }, [joined.sessionId, joined.name]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const keys = useMemo(() => {
    if (!state?.pad) return [];
    return state.pad.boats.map((b, i) => ({ i, ...b })).sort((a, b) => {
      const x = parseInt(a.sail, 10), y = parseInt(b.sail, 10);
      if (!isNaN(x) && !isNaN(y)) return x - y;
      if (!isNaN(x)) return -1;
      if (!isNaN(y)) return 1;
      return a.sail.localeCompare(b.sail);
    });
  }, [state?.pad]);

  if (ended) {
    return (
      <div className="m-card" style={{ padding: 20, marginTop: 30, textAlign: 'center' }}>
        <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>The session has ended</div>
        <p className="m-mut" style={{ fontSize: 14 }}>Thanks for calling finishes. The scorer has the results.</p>
        <button className="m-btn m-btn-g" onClick={onLeave}>Done</button>
      </div>
    );
  }
  const nextPlace = (state?.nextPlace || 1) + pending.length;
  const tap = (i: number) => {
    if (!state || state.order.some(o => o.i === i) || pending.includes(i)) return;
    try { navigator.vibrate?.(15); } catch { /* no vibration */ }
    sp.current?.call(state.pad.globalOf[i], nextPlace);
    setPending(p => [...p, i]);
  };
  const heat = state?.pad.heatLabel;
  return (
    <>
      <div className="m-spot-bar">
        <span className="m-dot-on" />
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>Calling finishes</b> <span className="m-dim" style={{ fontSize: 13 }}>{state?.hostName ? `with ${state.hostName}` : ''}</span></div>
        <span className="m-dim m-num" style={{ fontSize: 12.5 }}>PIN {joined.pin}</span>
      </div>
      {state === undefined ? <div className="m-card m-empty">Connecting to the scorer's phone…</div>
        : state === null ? <div className="m-card m-empty">The scorer hasn't started a race yet. This screen updates by itself.</div> : (
          <>
            <div className="m-row" style={{ gap: 10 }}>
              {heat && <span className="m-hp" style={{ background: HEAT_COLOURS[state.pad.heatIndex % HEAT_COLOURS.length], width: 34, height: 34, fontSize: 15 }}>{heat}</span>}
              <div style={{ flex: 1 }}>
                <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{state.pad.raceLabel}{heat ? ` · Heat ${heat}` : ''}</div>
                <div className="m-dim" style={{ fontSize: 13 }}>Next finisher is {ordinal(nextPlace)}{state.gunAt ? ` · ${clock(now - state.gunAt)}` : ''}</div>
              </div>
            </div>
            <div className="m-keys">
              {keys.map(k => {
                const o = state.order.find(x => x.i === k.i);
                const wait = pending.includes(k.i);
                return (
                  <button key={k.i} className={`m-key ${o?.code ? 'm-key-ls' : o ? 'm-key-done' : wait ? 'm-key-wait' : ''}`} aria-label={`${k.sail} ${k.name}${o?.place ? `, ${ordinal(o.place)}` : o?.code ? `, ${o.code}` : ''}`} onClick={() => tap(k.i)}>
                    {o?.code ? <i>{o.code}</i> : o?.place ? <i>{o.place}</i> : wait ? <i className="m-key-tag">sent</i> : null}
                    <b>{k.sail}</b>
                    <span>{shortName({ name: k.name } as any)}</span>
                  </button>
                );
              })}
            </div>
            {state.conflict && <div className="m-card" style={{ padding: '10px 14px', fontSize: 13, color: 'var(--m-amber-ink)' }}>The scorer is checking a place two phones called differently.</div>}
          </>
        )}
      <div className="m-dim" style={{ fontSize: 12.5, textAlign: 'center' }}>Spotters can't confirm, publish or change settings.</div>
      <button className="m-link" style={{ alignSelf: 'center' }} onClick={onLeave}>Leave</button>
    </>
  );
};

/** /join-scoring/:pin on a phone: join by PIN (no account), then the spotter's finish pad. */
export const SpotterApp: React.FC = () => {
  const { pin: routePin } = useParams();
  const [joined, setJoined] = useState<Joined | null>(readJoined);
  const [pin, setPin] = useState((routePin || '').replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState(() => { try { return localStorage.getItem('scoring_display_name') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const light = (() => { try { return localStorage.getItem('alfie-m-appearance') === 'light'; } catch { return false; } })();

  const join = async () => {
    setBusy(true); setError(null);
    try {
      try { localStorage.setItem('scoring_display_name', name.trim()); } catch { /* private mode */ }
      const { joined: j, error: e } = await joinScoringSession(pin, name.trim());
      if (!j) { setError(e || 'That PIN didn\'t work.'); setBusy(false); return; }
      const next = { sessionId: j.sessionId, name: name.trim(), eventName: j.eventName, pin };
      try { sessionStorage.setItem(SPOTTER_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      setJoined(next);
    } catch (err: any) {
      setError(navigator.onLine ? (err?.message || 'Couldn\'t join.') : 'You\'re offline. Joining needs signal.');
    }
    setBusy(false);
  };
  const leave = () => { try { sessionStorage.removeItem(SPOTTER_KEY); } catch { /* ignore */ } setJoined(null); };

  return (
    <div className={`m-app ${light ? 'm-light' : ''}`}>
      <div className="m-stack" style={{ flex: 1, overflowY: 'auto', padding: 'calc(var(--m-safe-top) + 12px) 16px calc(var(--m-safe-bottom) + 20px)', gap: 12 }}>
        {joined ? <SpotterPad joined={joined} onLeave={leave} /> : (
          <>
            <div style={{ textAlign: 'center', padding: '24px 0 6px' }}>
              <div className="m-disp" style={{ fontSize: 26, fontWeight: 700 }}>Call finishes</div>
              <p className="m-mut" style={{ fontSize: 14, margin: '6px 0 0' }}>Enter the PIN on the scorer's phone. No account needed.</p>
            </div>
            <label className="m-fld"><span>PIN</span>
              <input className="m-field m-pin-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" />
            </label>
            <label className="m-fld"><span>Your name</span>
              <input className="m-field" value={name} onChange={e => setName(e.target.value)} placeholder="Shown to the scorer" autoComplete="name" />
            </label>
            {error && <div className="m-card" style={{ padding: '10px 14px', color: 'var(--m-red-ink)', fontSize: 14 }}>{error}</div>}
            <button className="m-btn m-btn-p" style={{ height: 52 }} disabled={busy || pin.length !== 6 || !name.trim()} onClick={() => void join()}>{busy ? 'Joining…' : 'Join'}</button>
          </>
        )}
      </div>
    </div>
  );
};

export default SpotterApp;
