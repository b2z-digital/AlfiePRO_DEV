/**
 * Race Management · Starting (board "StartBox runs the start, the phone keeps the race"):
 * StartBox for the heat or race that sails next, then the race clock, OCS marks, general
 * recall and abandon. Sequences, sounds and timing are the desktop StartBox engine's; what
 * sails next and each boat's handicap come from the desktop scoring rules (utils/raceProgress).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { Skipper } from '../../types';
import type { RaceEvent } from '../../types/race';
import type { StartBoxState, StartSequence } from '../../types/startBox';
import { destroyStartBoxEngine, getStartBoxEngine } from '../../utils/startBoxAudio';
import { getSequences } from '../../utils/startBoxStorage';
import { RaceStatus, getRaceStatus, updateRaceStatus } from '../../utils/liveTrackingStorage';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { startScoring } from '../raceDesk';
import { useSetupEvent } from '../raceSetupData';
import {
  HandicapGroup, NextUp, RaceSession, SESSION_EVENT, clearSession, clock, countdown, handicapGroups, nextUp, sailOf, saveSession,
} from '../raceSession';
import { applyLetterScore } from '../../utils/finishOrder';
import { padBoats, registerPad, startingOrder } from '../finishPad';
import { ScoreTogetherSheet, useTogether } from './ScoreTogether';
import { OfflineBar } from './Sync';
import { handicapSettingsFor } from '../confirmRace';
import { SOUND, SignalButtons, SoundSheet, StartDial, playSystemSound, readVolume, useKeepAwake } from '../startBoxParts';
import { HEAT_COLOURS, Loading, Missing } from './RaceSetup';

const seqKey = (format?: string) => `alfie-m-startbox-seq:${format === 'handicap' ? 'handicap' : 'scratch'}`;
const offLabel = (h: number) => (h === 0 ? 'Scratch' : `${h} s`);

/* ─────────────── pieces ─────────────── */

const RacePill: React.FC<{ up: NextUp; extra?: string }> = ({ up, extra }) => (
  <div className="m-rp">
    {up.heat && <span className="m-hp" style={{ background: HEAT_COLOURS[up.heatIndex % HEAT_COLOURS.length] }}>{up.heatLabel}</span>}
    <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{up.raceLabel}{up.heat ? ` · Heat ${up.heatLabel}` : ''}</span>
    {extra && <span className="m-dim" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{extra}</span>}
  </div>
);

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/**
 * Handicap start list: biggest head start first, scratch boats last at the gun. A group goes
 * when the countdown to the gun reaches its head start (remaining is null before the sequence runs).
 */
const GroupList: React.FC<{ groups: HandicapGroup[]; skippers: Skipper[]; remaining: number | null; you: string[] }> = ({ groups, skippers, remaining, you }) => {
  const next = remaining === null ? -1 : groups.findIndex(g => g.hcap * 1000 < remaining);
  return (
    <div className="m-card" style={{ overflow: 'hidden' }}>
      {groups.map((g, i) => {
        const started = remaining !== null && g.hcap * 1000 >= remaining;
        const isNext = i === next;
        const names = g.skipperIndices.map(x => (you.includes(skippers[x]?.memberId || '') ? 'You' : (skippers[x]?.name || '').split(' ')[0])).join(', ');
        return (
          <div key={g.hcap} className={`m-row m-grp ${isNext ? 'm-grp-next' : ''}`} style={{ opacity: started ? 0.45 : 1 }}>
            <span className="m-lb" style={{ width: 62, flexShrink: 0, textTransform: g.hcap === 0 ? undefined : 'none', color: isNext ? 'var(--m-amber-ink)' : undefined }}>{offLabel(g.hcap)}</span>
            <span className="m-row" style={{ gap: 4, flexWrap: 'wrap', flexShrink: 0, maxWidth: '45%' }}>
              {g.skipperIndices.slice(0, 4).map(x => <span key={x} className="m-sail" style={{ minWidth: 38, height: 30 }}>{sailOf(skippers[x]) || '–'}</span>)}
              {g.skipperIndices.length > 4 && <span className="m-dim" style={{ fontSize: 12 }}>+{g.skipperIndices.length - 4}</span>}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{names}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: started ? 'var(--m-green-ink)' : isNext ? 'var(--m-amber-ink)' : 'var(--m-dim)' }}>
              {started ? 'Started' : remaining === null ? (g.hcap === 0 ? 'at the gun' : `${g.hcap} s before`) : countdown(remaining - g.hcap * 1000)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

type RollCall = RaceSession['rollCall'];

/** The heat's boats, with roll call when the event uses it (tap: ready, again: absent, again: clear). */
const BoatsCard: React.FC<{ up: NextUp; skippers: Skipper[]; roll: RollCall | null; onRoll: (r: RollCall) => void; title: string }> = ({ up, skippers, roll, onRoll, title }) => {
  const ids = up.skipperIndices;
  const ready = roll ? ids.filter(i => roll.ready.includes(i)).length : 0;
  const absent = roll ? ids.filter(i => roll.absent.includes(i)).length : 0;
  const cycle = (i: number) => {
    if (!roll) return;
    if (roll.ready.includes(i)) onRoll({ ready: roll.ready.filter(x => x !== i), absent: [...roll.absent, i] });
    else if (roll.absent.includes(i)) onRoll({ ready: roll.ready, absent: roll.absent.filter(x => x !== i) });
    else onRoll({ ready: [...roll.ready, i], absent: roll.absent });
  };
  const status = !roll ? '' : ready + absent >= ids.length ? (absent ? `Roll call done · ${absent} absent` : 'Roll call done') : `${ready} of ${ids.length} ready`;
  return (
    <div className="m-card" style={{ alignSelf: 'stretch', padding: '12px 14px' }}>
      <div className="m-row">
        <span className="m-lb m-dim" style={{ flex: 1 }}>{title} · {ids.length}</span>
        {roll && <span style={{ fontSize: 12.5, fontWeight: 600, color: ready + absent >= ids.length ? 'var(--m-green-ink)' : 'var(--m-mut)' }}>{status}</span>}
      </div>
      <div className="m-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {ids.map(i => {
          const on = roll?.ready.includes(i), off = roll?.absent.includes(i);
          const sail = sailOf(skippers[i]) || '–';
          const label = `${sail} ${skippers[i]?.name || ''}${on ? ', ready' : off ? ', absent' : ''}`;
          return roll
            ? <button key={i} className={`m-sail ${on ? 'm-sail-on' : off ? 'm-sail-off' : ''}`} aria-label={label} onClick={() => cycle(i)}>{sail}</button>
            : <span key={i} className="m-sail" aria-label={label}>{sail}</span>;
        })}
      </div>
      {roll && ready + absent < ids.length && (
        <div className="m-row" style={{ marginTop: 10, gap: 8 }}>
          <span className="m-dim" style={{ flex: 1, fontSize: 12.5 }}>Tap a boat when it's ready; tap again if it's absent.</span>
          <button className="m-link" onClick={() => onRoll({ ready: ids.filter(i => !roll.absent.includes(i)), absent: roll.absent })}>All ready</button>
        </div>
      )}
    </div>
  );
};

const STATUS: { v: RaceStatus; t: string }[] = [{ v: 'live', t: 'Live' }, { v: 'on_hold', t: 'On hold' }, { v: 'completed_for_day', t: 'Done today' }];

/** Live tracking status (desktop LiveStatusControl), for events followed live. */
const LiveStatusRow: React.FC<{ eventId: string }> = ({ eventId }) => {
  const [status, setStatus] = useState<RaceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getRaceStatus(eventId).then(s => setStatus(s?.status || 'on_hold')).catch(() => setStatus('on_hold')); }, [eventId]);
  const set = async (v: RaceStatus) => { setBusy(true); if (await updateRaceStatus(eventId, v)) setStatus(v); setBusy(false); };
  return (
    <div className="m-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="m-lb m-dim" style={{ flex: 1 }}>Live status</span>
      <div className="m-seg" style={{ height: 34 }}>
        {STATUS.map(s => <button key={s.v} className={status === s.v ? 'm-on' : ''} disabled={busy || status === null} onClick={() => set(s.v)}>{s.t}</button>)}
      </div>
    </div>
  );
};

const Confirm: React.FC<{ title: string; body: string; action: string; danger?: boolean; onYes: () => void; onClose: () => void }> = ({ title, body, action, danger, onYes, onClose }) => (
  <>
    <div className="m-veil" onClick={onClose} />
    <div className="m-sheet" role="dialog" aria-label={title}>
      <span className="m-grab" />
      <div className="m-disp" style={{ fontSize: 21, fontWeight: 700 }}>{title}</div>
      <p className="m-mut" style={{ fontSize: 14.5, lineHeight: 1.45, margin: '8px 0 16px' }}>{body}</p>
      <button className="m-btn" style={{ width: '100%', height: 52, background: danger ? '#FF3B30' : '#0A84FF', color: '#fff' }} onClick={onYes}>{action}</button>
      <button className="m-btn m-btn-g" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>Cancel</button>
    </div>
  </>
);

const OcsSheet: React.FC<{ up: NextUp; skippers: Skipper[]; marked: number[]; onToggle: (i: number) => void; onClose: () => void }> = ({ up, skippers, marked, onToggle, onClose }) => (
  <>
    <div className="m-veil" onClick={onClose} />
    <div className="m-sheet" role="dialog" aria-label="Mark OCS">
      <span className="m-grab" />
      <div className="m-row">
        <div className="m-disp" style={{ flex: 1, fontSize: 21, fontWeight: 700 }}>Mark OCS</div>
        <button className="m-link" onClick={onClose}>Done</button>
      </div>
      <p className="m-mut" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>Boats over the line at the start that didn't come back. Tap again to clear.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {up.skipperIndices.map(i => {
          const on = marked.includes(i);
          return <button key={i} className={`m-sail m-sail-btn ${on ? 'm-sail-ocs' : ''}`} aria-pressed={on} aria-label={`${sailOf(skippers[i])} ${skippers[i]?.name || ''}`} onClick={() => onToggle(i)}>{sailOf(skippers[i]) || '–'}</button>;
        })}
      </div>
    </div>
  </>
);

const NextCard: React.FC<{ up: NextUp }> = ({ up }) => {
  if (up.nextHeat) {
    const n = up.nextHeat;
    return (
      <div className="m-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="m-hp" style={{ background: HEAT_COLOURS[(n.heat.charCodeAt(0) - 65) % HEAT_COLOURS.length] }}>{n.label}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Heat {n.label} next</div>
          <div className="m-dim" style={{ fontSize: 12.5 }}>{n.boats} boats{n.promoted ? ` + the top ${n.promoted} from Heat ${n.from}` : ''}</div>
        </div>
        <span className="m-dim" style={{ fontSize: 12.5 }}>after this heat</span>
      </div>
    );
  }
  return null;
};

/** Nothing to start: every race scored, the round needs moving on, or set-up isn't finished. */
const NothingToStart: React.FC<{ up: NextUp; event: RaceEvent; onSheet: () => void; busy: boolean }> = ({ up, event, onSheet, busy }) => {
  const navigate = useNavigate();
  const { key = '' } = useParams();
  const noBoats = !event.skippers?.length;
  const unseeded = !noBoats && up.heat !== null && up.skipperIndices.length === 0;
  const [title, body] = noBoats ? ['Add skippers first', 'There are no skippers in this event yet.']
    : unseeded ? ['Seed the heats first', 'The heats for this race have no boats in them yet.']
      : up.allDone ? ['Every race is scored', 'All the races planned for this event have results.']
        : [`Every heat of ${up.raceLabel} is scored`, 'Move the heats on to the next race on the scoring sheet, then come back to start it.'];
  return (
    <div className="m-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
      <div className="m-mut" style={{ fontSize: 14 }}>{body}</div>
      {noBoats ? <button className="m-btn m-btn-p" onClick={() => navigate(`/race-desk/event/${key}/skippers`)}>Skippers</button>
        : unseeded ? <button className="m-btn m-btn-p" onClick={() => navigate(`/race-desk/event/${key}/heats`)}>Heats</button>
          : <button className="m-btn m-btn-p" onClick={onSheet} disabled={busy}>{busy ? 'Loading…' : 'Open the scoring sheet'}</button>}
    </div>
  );
};

/* ─────────────── screen ─────────────── */

export const RaceScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { tap, toast, memberIds, profile } = useMobile();
  const { item, event } = useSetupEvent(key);
  const engine = useRef(getStartBoxEngine()).current;

  const up = useMemo(() => (event ? nextUp(event) : null), [event]);
  const eventRef = useRef(event); eventRef.current = event;
  const upRef = useRef(up); upRef.current = up;
  const [session, setSessionState] = useState<RaceSession | null>(null);
  const sessionRef = useRef<RaceSession | null>(null);
  const setSession = useCallback((s: RaceSession) => { sessionRef.current = s; setSessionState(s); saveSession(s); }, []);
  useEffect(() => { if (event && up) { const s = registerPad(event, up); sessionRef.current = s; setSessionState(s); } }, [event?.id, up?.race, up?.heat]); // eslint-disable-line react-hooks/exhaustive-deps
  // Spotters' calls (Score together) update the race session while this screen is open
  useEffect(() => {
    if (!event || !up) return;
    const on = (ev: Event) => {
      const s = (ev as CustomEvent).detail as RaceSession;
      if (!s || s.eventId !== event.id || s === sessionRef.current || s.race !== up.race || (s.heat || null) !== (up.heat || null)) return;
      sessionRef.current = s; setSessionState(s);
    };
    window.addEventListener(SESSION_EVENT, on);
    return () => window.removeEventListener(SESSION_EVENT, on);
  }, [event?.id, up?.race, up?.heat]); // eslint-disable-line react-hooks/exhaustive-deps
  // the handicap rules are kept on the phone in case there's no signal at confirm time
  useEffect(() => { if (event?.raceFormat === 'handicap') void handicapSettingsFor(event); }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const together = useTogether(event?.id, e => { tap('light'); toast(e.kind === 'conflict' ? `${e.who} called a different boat for the same place` : `${e.who} called a finish`); });

  const [sequences, setSequences] = useState<StartSequence[]>([]);
  const [seq, setSeq] = useState<StartSequence | null>(null);
  const [state, setState] = useState<StartBoxState>(engine.getState());
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [volume, setVolume] = useState(readVolume);
  const [sheet, setSheet] = useState<null | 'seq' | 'sound' | 'ocs' | 'recall' | 'abandon' | 'together'>(null);
  const [opening, setOpening] = useState(false);

  const gunAt = session?.gunAt || null;
  const running = state === 'running' || state === 'paused';

  /* Sequences: the one used last for this kind of race, else the club's default for it */
  useEffect(() => {
    if (!event) return;
    getSequences(currentClub?.clubId || event.clubId || null).then(list => {
      const usable = list.filter(s => s.sequence_type !== 'botw');
      setSequences(usable);
      const live = engine.getCurrentSequence();
      if (live && (engine.getState() === 'running' || engine.getState() === 'paused')) { setSeq(live); return; }
      let saved: string | null = null;
      try { saved = localStorage.getItem(seqKey(event.raceFormat)); } catch { /* private mode */ }
      const format = event.raceFormat === 'handicap' ? 'handicap' : 'scratch';
      const pick = usable.find(s => s.id === sessionRef.current?.sequenceId) || usable.find(s => s.id === saved)
        || usable.find(s => s.race_type_default === format) || usable.find(s => s.is_system_default) || usable[0];
      if (pick) choose(pick, false);
    }).catch(() => {});
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback((s: StartSequence, remember = true) => {
    setSeq(s);
    if (remember) { try { localStorage.setItem(seqKey(event?.raceFormat), s.id); } catch { /* private mode */ } }
    engine.arm(s);
    const ms = (s.use_audio_only && s.countdown_start_seconds ? s.countdown_start_seconds : s.total_duration_seconds) * 1000;
    setRemaining(ms); setTotal(ms);
  }, [engine, event?.raceFormat]);

  const markGun = useCallback((at: number) => {
    const s = sessionRef.current;
    if (!s || s.gunAt) return;
    // the finish order starts now (OCS marks go in as they're made), ready for spotters' calls
    const e = eventRef.current, u = upRef.current;
    const finish = s.finish || (e && u ? startingOrder(padBoats(e, u), u.race, s) : s.finish);
    setSession({ ...s, finish, gunAt: at, sequenceId: engine.getCurrentSequence()?.id || s.sequenceId || null });
    tap('success');
  }, [engine, setSession, tap]);

  useEffect(() => {
    engine.setVolume(volume);
    const offs = [
      engine.onStateChange(st => { setState(st); if (st === 'completed') markGun(Date.now()); }),
      engine.onTick(d => { setRemaining(d.remainingMs); setTotal(d.totalDurationSeconds * 1000); setState(d.state); }),
      engine.onSoundFired(ss => { tap('medium'); if (ss.label) { setFlash(ss.label); setTimeout(() => setFlash(null), 2500); } }),
    ];
    return () => offs.forEach(f => f());
  }, [engine, volume, tap, markGun]);
  // Leaving: keep the engine while a count-up recording is still calling handicap times
  useEffect(() => () => { if (!engine.isCountdownAudioPlaying() && engine.getState() !== 'running') destroyStartBoxEngine(); }, [engine]);
  useEffect(() => {
    if (!gunAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [gunAt]);
  useKeepAwake(running || !!gunAt);

  /* Handicap starts: beep each group away when no recording is calling the head starts */
  const groups = useMemo(() => (event && up?.handicap ? handicapGroups(event, up.race, up.skipperIndices) : []), [event, up]);
  const beeped = useRef(new Set<string>());
  useEffect(() => {
    if (state !== 'running' || !groups.length) return;
    for (const g of groups) {
      if (g.hcap === 0) continue; // scratch boats go on the sequence's own start signal
      for (const t of [3, 2, 1, 0]) {
        const k = `${seq?.id}-${g.hcap}-${t}`;
        const at = (g.hcap + t) * 1000;
        if (remaining <= at && remaining > at - 1000 && !beeped.current.has(k)) {
          beeped.current.add(k);
          if (t === 0) tap('medium');
          if (!engine.isCountdownAudioPlaying() && !seq?.audio_file_url) void engine.playSynthBeep(t === 0 ? 1000 : 880, t === 0 ? 500 : 150);
        }
      }
    }
  }, [remaining, state, groups, engine, tap, seq]);
  useEffect(() => { if (state === 'armed' || state === 'idle') beeped.current.clear(); }, [state]);

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event || !up || !session) return <Missing />;
  const skippers = event.skippers || [];
  const eventPage = () => navigate(`/race-desk/event/${key}`, { replace: true });
  const openSheet = async () => {
    setOpening(true);
    const err = await startScoring(event, currentClub?.clubId || event.clubId);
    setOpening(false);
    if (err) toast(err);
  };
  const nothing = !gunAt && (!skippers.length || up.skipperIndices.length === 0 || up.roundComplete || up.allDone);

  /* actions */
  const startSeq = async () => { if (!seq) return; tap('medium'); await engine.initialize(); if (engine.getState() === 'idle') engine.arm(seq); engine.start(); };
  const gunNow = async () => {
    if (engine.getState() === 'running' || engine.getState() === 'paused') engine.stop();
    markGun(Date.now());
    void playSystemSound(engine, SOUND.startHorn, 440, 900);
  };
  const postpone = () => {
    engine.stop(); if (seq) engine.arm(seq);
    void playSystemSound(engine, SOUND.doubleHorn, 440, 900);
    toast('Postponed. Start the sequence again when you\'re ready.');
  };
  const recall = () => {
    setSheet(null);
    void playSystemSound(engine, SOUND.doubleHorn, 440, 900);
    engine.stop(); if (seq) engine.arm(seq);
    beeped.current.clear();
    setSession({ ...session, gunAt: null, marks: [], finish: null, added: [], callers: {}, conflicts: [], recalls: (session.recalls || 0) + 1 });
    toast('General recall. Start the sequence again.');
  };
  const abandon = () => {
    setSheet(null);
    engine.stop();
    clearSession(event.id);
    toast(`${up.raceLabel} abandoned. Nothing was scored.`);
    eventPage();
  };
  const toggleOcs = (i: number) => {
    tap();
    const has = session.marks.some(m => m.skipperIndex === i && m.code === 'OCS');
    // once the finish pad has started, its order follows the marks too
    let finish = session.finish;
    if (finish) {
      const boats = padBoats(event, up);
      const local = boats.globalOf.indexOf(i);
      const entry = finish.find(f => f.skipperIndex === local);
      if (local >= 0 && has && entry?.letterScore === 'OCS') finish = applyLetterScore(finish, boats.skippers, local, null);
      else if (local >= 0 && !has && !entry) finish = applyLetterScore(finish, boats.skippers, local, 'OCS');
    }
    setSession({ ...session, finish, marks: has ? session.marks.filter(m => !(m.skipperIndex === i && m.code === 'OCS')) : [...session.marks, { skipperIndex: i, code: 'OCS', atMs: gunAt ? Date.now() - gunAt : 0 }] });
  };
  const roll = (event as any).enable_roll_call ? session.rollCall : null;
  const live = !!(event.enableLiveTracking || event.enableLiveStream);

  /* ── Racing ── */
  if (gunAt) {
    const elapsed = now - gunAt;
    return (
      <div className="m-stack m-racing">
        <header className="m-top">
          <button className="m-ibtn" aria-label="Back to the event" onClick={eventPage}><Icon name="back" /></button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}><RacePill up={up} /></div>
          <button className="m-ibtn" aria-label="Sound" onClick={() => setSheet('sound')}><Icon name="sound" /></button>
        </header>
        <OfflineBar />
        <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
          <span className="m-racing-pill">RACING</span>
          <div className="m-disp m-num" style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, marginTop: 8 }} role="timer" aria-label={`${clock(elapsed)} since the gun`}>{clock(elapsed)}</div>
          <div className="m-mut" style={{ fontSize: 14 }}>{up.handicap ? 'since scratch boats started' : 'since the gun'} · {up.skipperIndices.length} boats{session.recalls ? ` · ${session.recalls} recall${session.recalls > 1 ? 's' : ''}` : ''}</div>
        </div>
        <button className="m-btn m-btn-p" style={{ height: 64, fontSize: 18, borderRadius: 18 }} onClick={() => navigate(`/race-desk/event/${key}/finish`)}>
          <Icon name="racing" size={22} />{session.finish?.length ? `Finishes · ${session.finish.filter(f => !f.letterScore).length} called` : 'Score the finishes'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <button className="m-card m-act-tile" onClick={() => setSheet('ocs')}><span className="m-sail m-sail-ocs" style={{ fontSize: 12, minWidth: 40, height: 28 }}>OCS</span>Mark OCS</button>
          <button className="m-card m-act-tile" onClick={() => setSheet('recall')}><Icon name="recall" size={22} />Recall</button>
          <button className="m-card m-act-tile" style={{ color: 'var(--m-red-ink)' }} onClick={() => setSheet('abandon')}><Icon name="close" size={22} />Abandon</button>
        </div>
        <SignalButtons engine={engine} onTap={() => tap('light')} />
        {session.marks.length > 0 && (
          <div className="m-card">
            <div className="m-li"><span className="m-lb m-dim" style={{ flex: 1 }}>Marked during the race</span></div>
            {session.marks.map(m => (
              <div key={`${m.code}-${m.skipperIndex}`} className="m-li">
                <span className="m-sail m-sail-ocs">{sailOf(skippers[m.skipperIndex]) || '–'}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{skippers[m.skipperIndex]?.name} · OCS</span>
                <span className="m-dim m-num" style={{ fontSize: 12 }}>{clock(m.atMs)}</span>
              </div>
            ))}
            <div className="m-li m-dim" style={{ fontSize: 12.5 }}>These go into the finish pad as OCS.</div>
          </div>
        )}
        <NextCard up={up} />
        <button className="m-card m-li" style={{ gap: 12 }} onClick={() => setSheet('together')}>
          <span className="m-tile" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="people" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>Score together</span>
            <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{together.hosting ? (together.spotters.length ? `${together.spotters.map(p => p.name.split(' ')[0]).join(', ')} calling finishes` : 'Session open · no spotters yet') : 'Invite a spotter to call finishes'}</span>
          </span>
          <Icon name="chevron" className="m-dim" />
        </button>
        {live && <LiveStatusRow eventId={event.id} />}
        {sheet === 'sound' && <SoundSheet engine={engine} volume={volume} onVolume={setVolume} onClose={() => setSheet(null)} horns />}
        {sheet === 'together' && <ScoreTogetherSheet event={event} clubId={currentClub?.clubId} hostName={`${profile.firstName} ${profile.lastName ? `${profile.lastName[0]}.` : ''}`.trim() || 'Scorer'} toast={toast} onClose={() => setSheet(null)} />}
        {sheet === 'ocs' && <OcsSheet up={up} skippers={skippers} marked={session.marks.filter(m => m.code === 'OCS').map(m => m.skipperIndex)} onToggle={toggleOcs} onClose={() => setSheet(null)} />}
        {sheet === 'recall' && <Confirm title="General recall" body={`Sounds two horns and takes ${up.raceLabel}${up.heat ? ` · Heat ${up.heatLabel}` : ''} back to the start sequence. OCS marks and any finishes called for this start are cleared.`} action="Recall and restart" onYes={recall} onClose={() => setSheet(null)} />}
        {sheet === 'abandon' && <Confirm title={`Abandon ${up.raceLabel}?`} body="Nothing is scored for this start, and the race is sailed again later." action="Abandon the race" danger onYes={abandon} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  /* ── StartBox ── */
  const progress = total ? remaining / total : 1;
  const sub = flash || seq?.name || 'Choose a start sequence';
  const nextHcap = groups.find(g => g.hcap * 1000 < remaining)?.hcap ?? null;
  const tooEarly = groups.filter(g => g.hcap * 1000 > total).reduce((n, g) => n + g.skipperIndices.length, 0);
  return (
    <div className="m-stack m-startbox" style={{ alignItems: 'center', minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <header className="m-top" style={{ alignSelf: 'stretch' }}>
        <button className="m-ibtn" aria-label="Back to the event" onClick={() => (running ? toast('Postpone the start first to leave StartBox.') : eventPage())}><Icon name="down" /></button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}><RacePill up={up} extra={up.heat && up.sails ? `sails ${ordinal(up.sails)}` : undefined} /></div>
        <button className="m-ibtn" aria-label="Sound" onClick={() => setSheet('sound')}><Icon name="sound" /></button>
      </header>
      {nothing ? <div style={{ alignSelf: 'stretch' }}><NothingToStart up={up} event={event} onSheet={openSheet} busy={opening} /></div> : (
        <>
          {up.handicap ? (
            <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ textAlign: 'center', paddingTop: 4 }} role="timer" aria-label={`${countdown(remaining)} to the start`}>
                <div className="m-lb" style={{ color: 'var(--m-amber-ink)' }}>
                  {state === 'paused' ? 'Paused' : running && nextHcap !== null ? <>Next off · <span style={{ textTransform: 'none' }}>{nextHcap ? `${nextHcap} s head start` : 'scratch boats'}</span></> : 'Start in'}
                </div>
                <div className="m-disp m-num" style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{countdown(running && nextHcap !== null ? remaining - nextHcap * 1000 : remaining)}</div>
                {running && nextHcap ? <div className="m-mut" style={{ fontSize: 13.5 }}>Scratch boats go in {countdown(remaining)}</div> : (
                  <button className="m-mut" disabled={running} onClick={() => setSheet('seq')} style={{ fontSize: 13.5, background: 'none', border: 0, padding: '2px 4px', color: 'var(--m-mut)', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 20 }}>
                    {sub}{!running && !flash && <Icon name="down" size={14} />}
                  </button>
                )}
              </div>
              <GroupList groups={groups} skippers={skippers} remaining={running ? remaining : null} you={memberIds} />
              {tooEarly > 0 && <div className="m-card" style={{ padding: '10px 14px', fontSize: 13, color: 'var(--m-amber-ink)' }}>{tooEarly} boat{tooEarly > 1 ? 's have' : ' has'} more head start than this {countdown(total)} sequence. Choose a longer one, or start {tooEarly > 1 ? 'them' : 'it'} by hand.</div>}
              <div className="m-dim" style={{ fontSize: 12.5, lineHeight: 1.4 }}>Head starts come from each boat's handicap after the last race. The biggest head start goes first, scratch boats last on the gun. First across the line wins; the finish pad works the same as scratch.</div>
            </div>
          ) : (
            <>
              <div style={{ marginTop: 10 }}>
                <StartDial size={270} progress={progress} animate={state === 'running'} label={`${countdown(remaining)} to the start`}>
                  <span className="m-lb" style={{ color: 'var(--m-pink-ink)' }}>{state === 'paused' ? 'Paused' : 'Start in'}</span>
                  <span className="m-disp m-num" style={{ fontSize: 'min(84px, 22vw)', fontWeight: 700, lineHeight: 1 }}>{countdown(remaining)}</span>
                  <button className="m-mut" disabled={running} onClick={() => setSheet('seq')} style={{ fontSize: 13.5, background: 'none', border: 0, padding: '2px 4px', color: 'var(--m-mut)', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 20 }}>
                    {sub}{!running && !flash && <Icon name="down" size={14} />}
                  </button>
                </StartDial>
              </div>
              <BoatsCard up={up} skippers={skippers} roll={roll} onRoll={r => setSession({ ...session, rollCall: r })} title={up.heat ? 'In this heat' : 'Racing'} />
            </>
          )}
          {up.handicap && roll && <BoatsCard up={up} skippers={skippers} roll={roll} onRoll={r => setSession({ ...session, rollCall: r })} title="Roll call" />}
          <div style={{ flex: 1, minHeight: 16 }} />
          <SignalButtons engine={engine} onTap={() => tap('light')} />
          <div className="m-row" style={{ gap: 22 }}>
            {running
              ? <button className="m-rb m-rb-s" onClick={postpone}><Icon name="pause" size={20} />Postpone</button>
              : <button className="m-rb m-rb-s" onClick={gunNow}><Icon name="racing" size={20} />Gun now</button>}
            {running
              ? <button className="m-rb" aria-label="Start now" onClick={gunNow} style={{ width: 88, height: 88, background: '#0A84FF', color: '#fff', fontSize: 14 }}>Gun now</button>
              : <button className="m-rb" aria-label="Start the sequence" onClick={startSeq} disabled={!seq} style={{ width: 88, height: 88, background: '#34C759', color: '#04210E' }}><Icon name="play" size={30} /></button>}
            <button className="m-rb m-rb-s" disabled={!running || !!seq?.use_audio_only || !!seq?.audio_file_url} onClick={() => { tap('medium'); engine.syncToMinute(); }}><Icon name="clock" size={20} />Sync</button>
          </div>
          <div className="m-dim m-row" style={{ fontSize: 12.5, gap: 6 }}><Icon name="timer" size={14} />{running ? 'Gun now starts the race clock straight away' : 'Using your own horn? Tap Gun now at the start'}</div>
        </>
      )}
      {sheet === 'sound' && <SoundSheet engine={engine} volume={volume} onVolume={setVolume} onClose={() => setSheet(null)} horns />}
      {sheet === 'seq' && (
        <>
          <div className="m-veil" onClick={() => setSheet(null)} />
          <div className="m-sheet" role="dialog" aria-label="Start sequences">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Start sequence</div>
            {sequences.length === 0 ? <div className="m-empty">No start sequences yet. Your club sets these up in StartBox on the desktop.</div> : (
              <div className="m-card">
                {sequences.map(s => (
                  <button key={s.id} className="m-li" onClick={() => { choose(s); setSheet(null); }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{s.name}</span>
                      <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{countdown(s.total_duration_seconds * 1000)}{s.sequence_type === 'handicap' ? ' · handicap' : ''}{s.club_id ? ' · your club' : ''}</span>
                    </span>
                    {seq?.id === s.id && <Icon name="check" className="m-dim" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RaceScreen;
