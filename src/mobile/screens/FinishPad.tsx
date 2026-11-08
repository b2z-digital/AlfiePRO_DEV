/**
 * Race Management · Calling the finish (board: "Three ways to call a finish, mixed freely in
 * one race"): tap, voice and keypad all feed one finish order, kept with the rules of the
 * desktop Touch mode (utils/finishOrder). Letter scores show the points they score first.
 * The order goes to the scoring sheet, which saves and confirms it through its own handlers.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Skipper } from '../../types';
import type { LetterScore } from '../../types/letterScores';
import {
  REDRESS_AVERAGE_ALL, REDRESS_AVERAGE_PENULTIMATE, REDRESS_AVERAGE_SERIES, ROD_POINTS_FLAG,
  addFinish, applyLetterScore, moveFinish, previousResultsFor, redressAverage, removeFinish, sailSortedIndices, type FinishingEntry,
} from '../../utils/finishOrder';
import { heatManagementOf, scoringStateOf } from '../../utils/raceSetup';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { useSetupEvent } from '../raceSetupData';
import { NextUp, RaceSession, SESSION_EVENT, clock, forScoring, nextUp, sailOf, saveSession } from '../raceSession';
import { PadBoats, keypadMatches, keypadPick, matchCalls, ordinal, padBoats, parseSpoken, readBack, registerPad, resolveConflict, shortName, startingOrder } from '../finishPad';
import { ConflictCard, useTogether } from './ScoreTogether';
import { OfflineBar } from './Sync';
import { listen, speechKind, type Listening, type SpeechKind } from '../speech';
import { useKeepAwake } from '../startBoxParts';
import { HEAT_COLOURS, Loading, Missing } from './RaceSetup';

type Mode = 'tap' | 'voice' | 'keypad';
const MODE_KEY = 'alfie-m-finish-mode';
const BIG_FLEET = 20;

/* ─────────────── letter scores (board: "Every RRS code the desktop supports") ─────────────── */

const HEAT_PLUS: [LetterScore, string][] = [['OCS', 'Over early'], ['DNF', "Didn't finish"], ['RET', 'Retired'], ['NSC', 'Wrong course'], ['DNS', "Didn't start"], ['DNC', "Didn't come"]];
const ENTRANTS_PLUS: [LetterScore, string][] = [['DSQ', 'Disqualified'], ['BFD', 'Black flag'], ['UFD', 'U flag'], ['DNE', "Can't drop"], ['WDN', 'Withdrawn']];
const COMMITTEE: [LetterScore, string][] = [['RDG', 'Redress'], ['DPI', 'Penalty'], ['ZFP', '20%'], ['SCP', 'Rule 44.3'], ['ROD', 'RO duty']];

type Redress = 'avg_event' | 'avg_penultimate' | 'avg_series' | 'manual';

export interface LetterTarget { index: number; current?: FinishingEntry }

export const LetterSheet: React.FC<{
  target: LetterTarget; skipper?: Skipper; race: number; raceLabel: string; heatLabel: string; heatSize: number; entrants: number;
  prev: ReturnType<typeof previousResultsFor>; shrs: boolean; heats: boolean; multiDay: boolean; numberOfDays?: number; currentDay?: number;
  onApply: (code: LetterScore, points?: number) => void; onClear: () => void; onClose: () => void;
}> = ({ target, skipper, race, raceLabel, heatLabel, heatSize, entrants, prev, shrs, heats, multiDay, numberOfDays, currentDay, onApply, onClear, onClose }) => {
  const [code, setCode] = useState<LetterScore>((target.current?.letterScore as LetterScore) || 'DNF');
  const hasCompleted = prev.some(r => r.position !== null && r.position > 0);
  const [redress, setRedress] = useState<Redress>(hasCompleted ? 'avg_event' : shrs ? 'avg_series' : 'manual');
  const [points, setPoints] = useState(target.current?.customPoints && target.current.customPoints > 0 ? String(target.current.customPoints) : '');
  const ctx = { isHeatRacing: heats, isSHRS: shrs, isMultiDay: multiDay, numberOfDays, currentDay };
  const avg = redressAverage(prev, heats && !shrs, false, ctx);
  const avgPen = redressAverage(prev, heats && !shrs, true, ctx);
  const needsPoints = (code === 'RDG' && redress === 'manual') || code === 'DPI' || code === 'ZFP' || code === 'SCP';
  const typed = parseFloat(points);
  const pointsOk = !needsPoints || (!isNaN(typed) && typed >= 0.1);
  const heatPts = heatSize + 1, entrantPts = entrants + 1;
  const worth = HEAT_PLUS.some(([c]) => c === code) ? `${heatPts} pts`
    : ENTRANTS_PLUS.some(([c]) => c === code) ? `${entrantPts} pts`
      : code === 'ROD' ? (avg !== null ? `~${avg} pts` : 'average')
        : code === 'RDG' && redress === 'avg_event' ? (avg !== null ? `~${avg} pts` : 'average')
          : code === 'RDG' && redress === 'avg_penultimate' ? (avgPen !== null ? `~${avgPen} pts` : 'average')
            : code === 'RDG' && redress === 'avg_series' ? 'series average'
              : pointsOk && points ? `${typed} pts` : '';
  const apply = () => {
    if (!pointsOk) return;
    if (code === 'ROD') return onApply(code, ROD_POINTS_FLAG);
    if (code === 'RDG' && redress === 'avg_event') return onApply(code, REDRESS_AVERAGE_ALL);
    if (code === 'RDG' && redress === 'avg_penultimate') return onApply(code, REDRESS_AVERAGE_PENULTIMATE);
    if (code === 'RDG' && redress === 'avg_series') return onApply(code, REDRESS_AVERAGE_SERIES);
    if (needsPoints) return onApply(code, typed);
    return onApply(code);
  };
  const group = (label: string, list: [LetterScore, string][]) => (
    <>
      <p className="m-lb m-dim" style={{ margin: '12px 0 7px' }}>{label}</p>
      <div className="m-lsg">
        {list.map(([c, t]) => (
          <button key={c} className={`m-ls ${code === c ? 'm-ls-on' : ''}`} aria-pressed={code === c} onClick={() => setCode(c)}>
            <b>{c}</b><span>{t}</span>
          </button>
        ))}
      </div>
    </>
  );
  const methods: [Redress, string, string, boolean][] = shrs
    ? [['avg_event', 'Average of prior races', avg !== null ? `~${avg} pts now` : 'Needs a completed race', !hasCompleted], ['avg_series', 'Average of the series', 'Q or F phase', false], ['manual', 'Fixed points', 'Set by the protest committee', false]]
    : [['avg_event', 'Average of all races', avg !== null ? `~${avg} pts now${heats ? ' · R1 left out' : ''}` : 'Needs a completed race', !hasCompleted], ['avg_penultimate', 'Average to the day before', avgPen !== null ? `~${avgPen} pts now` : 'Multi-day events', false], ['manual', 'Fixed points', 'Set by the committee', false]];
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={`Letter score for ${sailOf(skipper)}`}>
        <span className="m-grab" />
        <div className="m-row" style={{ gap: 12 }}>
          <span className="m-fc" style={{ width: 54 }}><b>{sailOf(skipper) || '–'}</b></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{skipper?.name}</div>
            <div className="m-dim" style={{ fontSize: 12.5 }}>{raceLabel}{heatLabel ? ` · Heat ${heatLabel}` : ''} · {heatSize} boats{entrants !== heatSize ? ` · ${entrants} entrants` : ''}</div>
          </div>
        </div>
        {group(`${heatLabel ? 'Heat size' : 'Boats'} + 1 · ${heatPts} pts`, HEAT_PLUS)}
        {group(`Entrants + 1 · ${entrantPts} pts`, ENTRANTS_PLUS)}
        {group('Set by the committee', COMMITTEE)}
        {code === 'RDG' && (
          <div className="m-card" style={{ marginTop: 12 }}>
            {methods.map(([m, t, sub, off]) => (
              <button key={m} className="m-li" disabled={off} onClick={() => setRedress(m)} style={{ opacity: off ? 0.45 : 1 }}>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{t}</span><span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{sub}</span></span>
                {redress === m && !off && <Icon name="check" style={{ color: 'var(--m-blue-ink)' }} />}
              </button>
            ))}
          </div>
        )}
        {needsPoints && (
          <label className="m-fld" style={{ marginTop: 12 }}>
            <span>Points</span>
            <input className="m-field" type="number" inputMode="decimal" min="0.1" step="0.1" value={points} placeholder="e.g. 3 or 2.5" onChange={e => setPoints(e.target.value)} style={{ fontSize: 20, textAlign: 'center' }} />
          </label>
        )}
        <div className="m-dim" style={{ fontSize: 12.5, marginTop: 10 }}>The scoring sheet works out the final points{code === 'RDG' || code === 'ROD' ? ' (averages are recalculated as the event goes on)' : ''}. Race {race}.</div>
        <div className="m-row" style={{ gap: 8, marginTop: 14 }}>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={onClear} disabled={!target.current}>Clear</button>
          <button className="m-btn m-btn-p" style={{ flex: 2 }} onClick={apply} disabled={!pointsOk}>Apply {code}{worth ? ` · ${worth}` : ''}</button>
        </div>
      </div>
    </>
  );
};

/* ─────────────── pieces ─────────────── */

const Header: React.FC<{ up: NextUp; elapsed: number | null; onBack: () => void; onUndo?: () => void; canUndo: boolean }> = ({ up, elapsed, onBack, onUndo, canUndo }) => (
  <header className="m-top">
    <button className="m-ibtn" aria-label="Back to the race" onClick={onBack}><Icon name="back" /></button>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
      <div className="m-rp">
        {up.heat && <span className="m-hp" style={{ background: HEAT_COLOURS[up.heatIndex % HEAT_COLOURS.length] }}>{up.heatLabel}</span>}
        <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{up.raceLabel}</span>
        {elapsed !== null && <span className="m-dim m-num" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>· {clock(elapsed)}</span>}
      </div>
    </div>
    {onUndo ? <button className="m-ibtn" aria-label="Undo the last finish" onClick={onUndo} disabled={!canUndo}><Icon name="undo" /></button> : <span style={{ width: 44 }} />}
  </header>
);

const Modes: React.FC<{ mode: Mode; onMode: (m: Mode) => void }> = ({ mode, onMode }) => (
  <nav className="m-seg" aria-label="Finish input">
    {(['tap', 'voice', 'keypad'] as Mode[]).map(m => (
      <button key={m} className={mode === m ? 'm-on' : ''} aria-pressed={mode === m} onClick={() => onMode(m)} style={{ flex: 1 }}>
        {m === 'tap' ? 'Tap' : m === 'voice' ? 'Voice' : 'Keypad'}
      </button>
    ))}
  </nav>
);

/** The finish order so far, newest at the right, with the next place waiting. */
const Strip: React.FC<{ order: FinishingEntry[]; skippers: Skipper[]; last: number | null; left: number; total: number; showLeft?: boolean }> = ({ order, skippers, last, left, total, showLeft }) => {
  const ref = useRef<HTMLDivElement>(null);
  const finishers = order.filter(e => !e.letterScore);
  useEffect(() => { ref.current?.scrollTo({ left: ref.current.scrollWidth, behavior: 'smooth' }); }, [finishers.length]);
  const next = finishers.length + 1;
  return (
    <div className="m-strip" ref={ref} aria-label="Finish order">
      {finishers.length === 0 && <div className="m-dim" style={{ fontSize: 13, alignSelf: 'center', padding: '0 4px', whiteSpace: 'nowrap' }}>No finishes yet</div>}
      {finishers.map(e => (
        <div key={e.skipperIndex} className={`m-fc ${e.skipperIndex === last ? 'm-fc-new' : ''}`}><span>{ordinal(e.position)}</span><b>{sailOf(skippers[e.skipperIndex]) || '–'}</b></div>
      ))}
      {left > 0 && <div className="m-fc m-fc-next"><span style={{ color: 'var(--m-blue-ink)' }}>{ordinal(next)}</span><b style={{ opacity: 0.35 }}>?</b></div>}
      {left > 1 && !showLeft && <div className="m-fc m-fc-next" style={{ opacity: 0.4 }}><span>{ordinal(next + 1)}</span><b style={{ opacity: 0.25 }}>?</b></div>}
      {showLeft && <div className="m-fc" style={{ width: 'auto', padding: '7px 10px' }}><span>of {total}</span><b style={{ fontSize: 14 }}>{left} left</b></div>}
    </div>
  );
};

/** A sail-number key: tap when the boat crosses, tap again to take it out, hold for a letter score. */
const PadKey: React.FC<{ skipper?: Skipper; entry?: FinishingEntry; absent: boolean; you: boolean; onTap: () => void; onHold: () => void }> = ({ skipper, entry, absent, you, onTap, onHold }) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const down = () => { held.current = false; timer.current = setTimeout(() => { held.current = true; onHold(); }, 500); };
  const up = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const sail = sailOf(skipper) || '–';
  const state = entry?.letterScore ? `, ${entry.letterScore}` : entry ? `, ${ordinal(entry.position)}` : absent ? ', absent' : '';
  return (
    <button
      className={`m-key ${entry?.letterScore ? 'm-key-ls' : entry ? 'm-key-done' : ''} ${absent && !entry ? 'm-key-abs' : ''}`}
      aria-label={`${sail} ${skipper?.name || ''}${state}`}
      onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
      onContextMenu={e => { e.preventDefault(); }}
      onClick={() => { if (held.current) { held.current = false; return; } onTap(); }}
    >
      {entry?.letterScore ? <i>{entry.letterScore}</i> : entry ? <i>{entry.position}</i> : absent ? <i className="m-key-tag">absent</i> : null}
      <b>{sail}</b>
      <span>{you ? 'You' : shortName(skipper)}</span>
    </button>
  );
};

/* ─────────────── voice ─────────────── */

interface HeardRow { id: number; said: string; index: number | null; place?: number; options?: number[]; note?: string }

const Wave: React.FC<{ on: boolean }> = ({ on }) => (
  <div className={`m-vw ${on ? 'm-vw-on' : ''}`} aria-hidden="true">
    {[10, 22, 36, 18, 42, 28, 14, 32, 20, 10].map((h, i) => <i key={i} style={{ height: on ? h : 6, animationDelay: `${i * 80}ms` }} />)}
  </div>
);

const VoicePad: React.FC<{
  kind: SpeechKind | undefined; boats: PadBoats; heat: boolean; rows: HeardRow[]; listening: boolean; partial: string;
  onHold: () => void; onRelease: () => void; onPick: (row: HeardRow, index: number) => void; onSkip: (row: HeardRow) => void;
}> = ({ kind, boats, heat, rows, listening, partial, onHold, onRelease, onPick, onSkip }) => {
  if (kind === undefined) return <div className="m-dim" style={{ textAlign: 'center', padding: 30 }}>Checking the microphone…</div>;
  if (kind === null) {
    return (
      <div className="m-card" style={{ padding: 18 }}>
        <div className="m-disp" style={{ fontSize: 19, fontWeight: 700 }}>Voice isn't available here</div>
        <p className="m-mut" style={{ fontSize: 14, margin: '6px 0 0' }}>This phone or browser can't listen for sail numbers. Tap or type the finishes; they all go into the same order.</p>
      </div>
    );
  }
  const shown = rows.slice(-4);
  return (
    <>
      {shown.length > 0 && (
        <div className="m-card" style={{ overflow: 'hidden' }}>
          {shown.map(r => (
            <div key={r.id} className={`m-heard ${r.options ? 'm-heard-ask' : ''}`}>
              <span className="m-disp" style={{ width: 40, fontWeight: 700, fontSize: 17 }}>{r.place ? ordinal(r.place) : ''}</span>
              {r.options ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m-mut" style={{ fontSize: 13.5 }}>“{r.said}…” {r.options.length ? 'which boat?' : "isn't in this race"}</div>
                  <div className="m-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {r.options.map((i, n) => <button key={i} className={`m-fc m-fc-btn ${n === 0 ? 'm-fc-new' : ''}`} onClick={() => onPick(r, i)} aria-label={`Boat ${sailOf(boats.skippers[i])}`}><b>{sailOf(boats.skippers[i])}</b></button>)}
                    <button className="m-link" style={{ marginLeft: 4 }} onClick={() => onSkip(r)}>Skip</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="m-fc" style={{ width: 50, padding: '4px 0' }}><b style={{ fontSize: 17 }}>{r.index !== null ? sailOf(boats.skippers[r.index]) : '–'}</b></span>
                  <span className="m-mut" style={{ flex: 1, minWidth: 0, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>“{r.said}”{r.note ? ` · ${r.note}` : ''}</span>
                  {!r.note && <Icon name="check" style={{ color: 'var(--m-green-ink)' }} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Wave on={listening} />
        <p className="m-disp" style={{ margin: 0, fontSize: 24, fontWeight: 600, minHeight: 32, textAlign: 'center' }}>{listening ? (partial ? `“${partial}…”` : 'Listening…') : rows.length ? '' : 'Hold and say the sail numbers'}</p>
      </div>
      <button
        className={`m-mic ${listening ? 'm-mic-on' : ''}`} aria-label="Hold to call finishes" aria-pressed={listening}
        onPointerDown={e => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onHold(); }}
        onPointerUp={onRelease} onPointerCancel={onRelease} onContextMenu={e => e.preventDefault()}
        onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) onHold(); }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') onRelease(); }}
      >
        <span><Icon name="mic" size={38} /></span>
      </button>
      <div className="m-dim" style={{ fontSize: 12.5, textAlign: 'center' }}>Only this {heat ? 'heat' : 'race'}'s sail numbers are listened for. Say “scratch that” to undo.</div>
    </>
  );
};

/* ─────────────── keypad ─────────────── */

const KeypadPad: React.FC<{ boats: PadBoats; open: number[]; typed: string; letterMode: boolean; onType: (t: string) => void; onPick: (i: number) => void; onLetterMode: () => void }> = ({ boats, open, typed, letterMode, onType, onPick, onLetterMode }) => {
  const sug = keypadMatches(typed, boats.skippers, open).slice(0, 4);
  return (
    <>
      <div className={`m-kp-in ${letterMode ? 'm-kp-ls' : ''}`} aria-live="polite">
        {letterMode && <span className="m-lb" style={{ position: 'absolute', top: 8, left: 12, color: 'var(--m-red-ink)' }}>Letter score for…</span>}
        <span className="m-disp m-num" style={{ fontSize: 46, fontWeight: 700 }}>{typed}</span><span className="m-caret" />
      </div>
      <div className="m-sug">
        {typed && sug.length === 0 && <div className="m-dim" style={{ fontSize: 13, padding: '14px 0', textAlign: 'center', flex: 1 }}>No boat still racing starts with {typed}</div>}
        {sug.map(i => <button key={i} onClick={() => onPick(i)}><b>{sailOf(boats.skippers[i])}</b><span>{shortName(boats.skippers[i])}</span></button>)}
        {!typed && <div className="m-dim" style={{ fontSize: 13, padding: '14px 0', textAlign: 'center', flex: 1 }}>Type a sail number; a single match adds itself</div>}
      </div>
      <div className="m-np">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => onType(typed.length < 6 ? typed + d : typed)}>{d}</button>)}
        <button aria-label="Letter score" aria-pressed={letterMode} className={`m-np-ls ${letterMode ? 'm-np-ls-on' : ''}`} onClick={onLetterMode}>DNF…</button>
        <button onClick={() => onType(typed.length < 6 ? `${typed}0` : typed)}>0</button>
        <button aria-label="Delete" onClick={() => onType(typed.slice(0, -1))}><Icon name="backspace" size={24} /></button>
      </div>
    </>
  );
};

/* ─────────────── screen ─────────────── */

export const FinishPadScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { tap, toast, memberIds } = useMobile();
  const { item, event } = useSetupEvent(key);
  const up = useMemo(() => (event ? nextUp(event) : null), [event]);
  const boats = useMemo(() => (event && up ? padBoats(event, up) : null), [event, up]);

  const [session, setSessionState] = useState<RaceSession | null>(null);
  const sessionRef = useRef<RaceSession | null>(null);
  const [order, setOrderState] = useState<FinishingEntry[]>([]);
  const orderRef = useRef<FinishingEntry[]>([]);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    if (!event || !up || !boats) return;
    const s = registerPad(event, up);
    const o = s.finish || startingOrder(boats, up.race, s);
    sessionRef.current = s; orderRef.current = o;
    setSessionState(s); setOrderState(o);
  }, [event?.id, up?.race, up?.heat, boats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finishes called on spotters' phones (Score together) land in the same race session
  useEffect(() => {
    if (!event || !up) return;
    const on = (ev: Event) => {
      const s = (ev as CustomEvent).detail as RaceSession;
      if (!s || s.eventId !== event.id || s === sessionRef.current || s.race !== up.race || (s.heat || null) !== (up.heat || null)) return;
      sessionRef.current = s;
      setSessionState(s);
      if (s.finish) { orderRef.current = s.finish; setOrderState(s.finish); }
    };
    window.addEventListener(SESSION_EVENT, on);
    return () => window.removeEventListener(SESSION_EVENT, on);
  }, [event?.id, up?.race, up?.heat]); // eslint-disable-line react-hooks/exhaustive-deps
  const together = useTogether(event?.id, e => {
    tap(e.kind === 'conflict' ? 'medium' : 'light');
    if (e.kind === 'conflict') toast(`${e.who} called a different boat for the same place`);
  });

  const setOrder = useCallback((changed: FinishingEntry[], added?: number[], extra?: Partial<RaceSession>) => {
    // as Touch mode does once the change is saved and read back
    const o = readBack(changed);
    orderRef.current = o;
    setOrderState(o);
    const s = sessionRef.current;
    if (!s) return;
    const next: RaceSession = { ...s, ...extra, finish: o, added: added ?? (s.added || []).filter(i => o.some(e => e.skipperIndex === i)) };
    sessionRef.current = next;
    setSessionState(next);
    saveSession(next);
  }, []);

  const [mode, setModeState] = useState<Mode>(() => {
    try { const m = localStorage.getItem(MODE_KEY) as Mode | null; if (m === 'tap' || m === 'voice' || m === 'keypad') return m; } catch { /* private mode */ }
    return 'tap';
  });
  const modeChosen = useRef(false);
  useEffect(() => {
    try { if (localStorage.getItem(MODE_KEY)) { modeChosen.current = true; return; } } catch { /* private mode */ }
    if (boats && boats.skippers.length > BIG_FLEET) setModeState('keypad');
  }, [boats]);
  const setMode = (m: Mode) => { setModeState(m); modeChosen.current = true; try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } };

  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useKeepAwake(true);

  const [letter, setLetter] = useState<LetterTarget | null>(null);
  const [typed, setTyped] = useState('');
  const [letterMode, setLetterMode] = useState(false);

  /* voice */
  const [kind, setKind] = useState<SpeechKind | undefined>(undefined);
  useEffect(() => { if (mode === 'voice' && kind === undefined) speechKind().then(setKind).catch(() => setKind(null)); }, [mode, kind]);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [rows, setRows] = useState<HeardRow[]>([]);
  const rowsRef = useRef<HeardRow[]>([]);
  rowsRef.current = rows;
  const rowId = useRef(1);
  const listener = useRef<Listening | null>(null);
  const holding = useRef(false);
  const session_ = useRef({ text: '', committed: 0 });
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finished = useMemo(() => new Set(order.map(e => e.skipperIndex)), [order]);

  const finishBoat = useCallback((i: number, atPlace?: number): number | null => {
    if (!boats) return null;
    const cur = orderRef.current;
    let o = addFinish(cur, boats.skippers, i);
    if (!o) return null;
    if (atPlace) {
      // a boat chosen after later ones were called goes back to the place it was heard at
      const target = o.findIndex(e => !e.letterScore && e.position === atPlace);
      if (target >= 0 && target < o.length - 1) o = moveFinish(o, o.length - 1, target);
    }
    setOrder(o, [...(sessionRef.current?.added || []), i], { callers: { ...(sessionRef.current?.callers || {}), [i]: { who: 'You', at: Date.now() } } });
    setLast(i);
    tap('success');
    return o.find(e => e.skipperIndex === i)?.position ?? null;
  }, [boats, setOrder, tap]);

  const undoLast = useCallback(() => {
    if (!boats) return;
    const added = [...(sessionRef.current?.added || [])];
    while (added.length) {
      const i = added.pop()!;
      const e = orderRef.current.find(x => x.skipperIndex === i && !x.letterScore);
      if (e) {
        setOrder(removeFinish(orderRef.current, i), added);
        setLast(null);
        tap('medium');
        toast(`${sailOf(boats.skippers[i])} taken out of ${ordinal(e.position)}`);
        return;
      }
    }
    toast('Nothing to undo');
  }, [boats, setOrder, tap, toast]);

  const commitVoice = useCallback((upTo: 'all') => {
    if (!boats || upTo !== 'all') return;
    const text = session_.current.text;
    const heard = parseSpoken(text);
    const fresh = heard.slice(session_.current.committed);
    session_.current.committed = heard.length;
    if (!fresh.length) return;
    const fin = new Set(orderRef.current.map(e => e.skipperIndex));
    const indices = boats.skippers.map((_, i) => i);
    const calls = matchCalls(fresh, boats.skippers, indices, fin);
    const newRows: HeardRow[] = [];
    for (const c of calls) {
      if (c.kind === 'undo') { undoLast(); continue; }
      if (c.kind === 'boat') {
        const place = finishBoat(c.index);
        if (place) newRows.push({ id: rowId.current++, said: c.said, index: c.index, place });
        continue;
      }
      if (c.kind === 'seen') {
        const en = orderRef.current.find(x => x.skipperIndex === c.index);
        newRows.push({ id: rowId.current++, said: c.said, index: c.index, note: en?.letterScore ? `already ${en.letterScore}` : en ? `already ${ordinal(en.position)}` : 'already in' });
        continue;
      }
      const pendingAsks = [...rowsRef.current, ...newRows].filter(r => r.options).length;
      newRows.push({ id: rowId.current++, said: c.said, index: null, options: c.options, place: orderRef.current.filter(e => !e.letterScore).length + 1 + pendingAsks });
    }
    if (newRows.length) setRows(r => [...r, ...newRows]);
  }, [boats, finishBoat, undoLast]);
  const commitRef = useRef(commitVoice);
  commitRef.current = commitVoice;

  const onText = useCallback((text: string, done: boolean) => {
    session_.current.text = text;
    const all = parseSpoken(text);
    const tail = all.slice(session_.current.committed).map(h => (h.kind === 'number' ? h.said : 'scratch that')).join(' ');
    setPartial(tail);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (done) commitRef.current('all');
    else commitTimer.current = setTimeout(() => { commitRef.current('all'); setPartial(''); }, 900);
  }, []);

  const startListening = useCallback(async () => {
    if (!boats || !kind || listener.current) return;
    holding.current = true;
    session_.current = { text: '', committed: 0 };
    setListening(true);
    setPartial('');
    tap('light');
    const hints = boats.skippers.map(s => sailOf(s)).filter(Boolean);
    const l = await listen(kind, hints, {
      onText,
      onError: msg => { toast(msg); },
      onEnd: () => {
        if (commitTimer.current) { clearTimeout(commitTimer.current); commitTimer.current = null; }
        commitRef.current('all');
        listener.current = null;
        setPartial('');
        // still holding: recognisers stop after a pause, so keep listening
        if (holding.current) { void startListening(); return; }
        setListening(false);
      },
    });
    if (!l) { setListening(false); holding.current = false; return; }
    listener.current = l;
    if (!holding.current) l.stop();
  }, [boats, kind, onText, toast, tap]);

  const stopListening = useCallback(() => {
    holding.current = false;
    listener.current?.stop();
    if (!listener.current) setListening(false);
  }, []);
  useEffect(() => () => { holding.current = false; listener.current?.stop(); }, []);

  if (item === undefined || (item && !event)) return <Loading />;
  if (!item || !event || !up || !boats || !session) return <Missing />;

  const skippers = boats.skippers;
  const total = skippers.length;
  const gunAt = session.gunAt || null;
  const backToRace = () => navigate(`/race-desk/event/${key}/race`, { replace: true });
  const entryOf = (i: number) => order.find(e => e.skipperIndex === i);
  const finishers = order.filter(e => !e.letterScore).length;
  const letters = order.filter(e => e.letterScore);
  const ocs = letters.filter(e => e.letterScore === 'OCS').length;
  const left = total - order.length;
  const open = sailSortedIndices(skippers).filter(i => !finished.has(i));
  const absentLocal = (session.rollCall?.absent || []).map(g => boats.globalOf.indexOf(g)).filter(i => i >= 0);
  const isYou = (i: number) => memberIds.includes(skippers[i]?.memberId || '');

  const e = forScoring(event);
  const st = scoringStateOf(e);
  const hm = heatManagementOf(e);
  const shrs = hm?.configuration?.scoringSystem === 'shrs';
  const heats = !!(up.heat && hm?.configuration?.enabled);

  const tapKey = (i: number) => {
    const en = entryOf(i);
    if (!en) { finishBoat(i); return; }
    if (en.letterScore) { setLetter({ index: i, current: en }); return; }
    setOrder(removeFinish(orderRef.current, i));
    if (last === i) setLast(null);
    tap('medium');
    toast(`${sailOf(skippers[i])} taken out · places after it moved up`);
  };
  const applyLetter = (code: LetterScore | null, points?: number) => {
    if (!letter) return;
    setOrder(applyLetterScore(orderRef.current, skippers, letter.index, code, points));
    tap(code ? 'medium' : 'light');
    setLetter(null);
  };
  const keypadType = (t: string) => {
    if (letterMode) {
      setTyped(t);
      const all = sailSortedIndices(skippers);
      const exact = all.filter(i => sailOf(skippers[i]).toUpperCase() === t.toUpperCase());
      const longer = all.filter(i => sailOf(skippers[i]).toUpperCase().startsWith(t.toUpperCase()));
      if (exact.length === 1 && longer.length === 1) { setLetter({ index: exact[0], current: entryOf(exact[0]) }); setTyped(''); setLetterMode(false); }
      return;
    }
    const pick = keypadPick(t, skippers, open);
    if (pick !== null) { finishBoat(pick); setTyped(''); return; }
    setTyped(t);
  };
  const keypadPickBoat = (i: number) => {
    if (letterMode) { setLetter({ index: i, current: entryOf(i) }); setLetterMode(false); setTyped(''); return; }
    finishBoat(i); setTyped('');
  };
  const prev = letter ? previousResultsFor(boats.results as any, up.race, letter.index) : [];

  return (
    <div className={`m-stack m-finish ${mode === 'voice' ? 'm-finish-voice' : ''}`} style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)', gap: 10 }}>
      <Header up={up} elapsed={gunAt ? now - gunAt : null} onBack={backToRace} onUndo={mode !== 'voice' ? undoLast : undefined} canUndo={(session.added || []).length > 0} />
      <OfflineBar />
      {together.hosting && (
        <div className="m-together-bar"><Icon name="people" size={16} />{together.spotters.length ? `${together.spotters.map(p => p.name.split(' ')[0]).join(', ')} calling with you` : 'Waiting for spotters to join'}</div>
      )}
      {(session.conflicts || []).slice(0, 1).map(c => session.pad && (
        <ConflictCard key={c.id} conflict={c} pad={session.pad} onKeep={w => {
          const r = resolveConflict(sessionRef.current!, c.id, w);
          setOrder(r.finish || [], r.added, { conflicts: r.conflicts });
          tap('success');
        }} />
      ))}
      <Modes mode={mode} onMode={m => { if (m !== 'voice') stopListening(); setMode(m); }} />
      {mode !== 'voice' && <Strip order={order} skippers={skippers} last={last} left={left} total={total} showLeft={mode === 'keypad'} />}
      {mode === 'tap' && (
        <>
          <div className="m-keys">
            {sailSortedIndices(skippers).map(i => (
              <PadKey key={i} skipper={skippers[i]} entry={entryOf(i)} absent={absentLocal.includes(i)} you={isYou(i)} onTap={() => tapKey(i)} onHold={() => { tap('medium'); setLetter({ index: i, current: entryOf(i) }); }} />
            ))}
          </div>
          <div className="m-dim" style={{ fontSize: 12, textAlign: 'center' }}>Tap a finished boat to take it out · hold for a letter score</div>
        </>
      )}
      {mode === 'keypad' && <KeypadPad boats={boats} open={open} typed={typed} letterMode={letterMode} onType={keypadType} onPick={keypadPickBoat} onLetterMode={() => { setLetterMode(m => !m); setTyped(''); }} />}
      {mode === 'voice' && (
        <VoicePad kind={kind} boats={boats} heat={heats} rows={rows} listening={listening} partial={partial}
          onHold={() => { void startListening(); }} onRelease={stopListening}
          onPick={(r, i) => { const place = finishBoat(i, r.place); setRows(rs => rs.map(x => (x.id === r.id ? { ...x, options: undefined, index: i, place: place || r.place } : x))); }}
          onSkip={r => setRows(rs => rs.filter(x => x.id !== r.id))} />
      )}
      <div style={{ flex: mode === 'voice' ? 0 : 1 }} />
      <div className="m-dim" style={{ fontSize: 12.5, textAlign: 'center' }} aria-live="polite">
        {finishers} of {total} finished{ocs ? ` · ${ocs} OCS` : ''}{letters.length - ocs ? ` · ${letters.length - ocs} letter score${letters.length - ocs > 1 ? 's' : ''}` : ''}{left > 0 ? ` · ${left} racing` : ''}
      </div>
      <button className={`m-btn ${left === 0 ? 'm-btn-p' : 'm-btn-g'}`} style={{ height: 50 }} onClick={() => { stopListening(); navigate(`/race-desk/event/${key}/confirm`); }}>Review finish order</button>

      {letter && (
        <LetterSheet target={letter} skipper={skippers[letter.index]} race={up.race} raceLabel={up.raceLabel} heatLabel={heats ? up.heatLabel : ''}
          heatSize={total} entrants={(st.skippers || []).length} prev={prev} shrs={shrs} heats={heats}
          multiDay={!!event.multiDay} numberOfDays={event.numberOfDays} currentDay={e.currentDay}
          onApply={(c, p) => applyLetter(c, p)} onClear={() => applyLetter(null)} onClose={() => setLetter(null)} />
      )}
    </div>
  );
};

export default FinishPadScreen;
