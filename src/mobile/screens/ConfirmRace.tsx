/**
 * Race Management · Confirm & publish (board: "Check it, fix it with a drag, then everyone sees
 * it"): review the finish, confirm the race or heat, then HMS heat moves or handicap changes,
 * and the published standings. Confirming runs the desktop scoring screen's own steps
 * (mobile/confirmRace → utils/scoringConfirm, utils/finishOrder, utils/heatUtils).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { Skipper } from '../../types';
import type { LetterScore } from '../../types/letterScores';
import type { RaceEvent } from '../../types/race';
import {
  POSITION_PRESERVING_SCORES, addFinish, applyLetterScore, moveFinish, previousResultsFor, sailSortedIndices, sortFinishOrder, type FinishingEntry,
} from '../../utils/finishOrder';
import { setFinishHandoff } from '../../utils/finishHandoff';
import type { HandicapSettings } from '../../utils/scoringConfirm';
import { heatManagementOf, scoringStateOf } from '../../utils/raceSetup';
import { eventStandings } from '../data';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { startScoring } from '../raceDesk';
import { useSetupEvent } from '../raceSetupData';
import { NextUp, RaceSession, clearSession, forScoring, loadSession, nextUp, sailOf, saveSession } from '../raceSession';
import { PadBoats, ordinal, padBoats, startingOrder } from '../finishPad';
import {
  HandicapChange, HeatConfirmation, RaceConfirmation, applyHeatFinish, applyRaceFinish, confirmHeat, confirmRace, confirmsOnPhone,
  handicapChanges, handicapSettingsFor, heatMoves, overrideHandicap, runOf, saveConfirmation, saveRun,
} from '../confirmRace';
import { advanceToNextRoundIn } from '../../utils/scoringConfirm';
import { heatSailingOrder } from '../../utils/raceProgress';
import { HEAT_COLOURS, Loading, Missing } from './RaceSetup';
import { LetterSheet, type LetterTarget } from './FinishPad';

const heatColour = (h: string) => HEAT_COLOURS[(h.charCodeAt(0) - 65) % HEAT_COLOURS.length];
const heatLetterPts = (code: string, heatSize: number, entrants: number) =>
  ['OCS', 'DNF', 'RET', 'NSC', 'DNS', 'DNC'].includes(code) ? heatSize + 1 : ['DSQ', 'BFD', 'UFD', 'DNE', 'WDN'].includes(code) ? entrants + 1 : null;

async function shareText(title: string, text: string) {
  try {
    const { isNative } = await import('../../lib/native/platform');
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text });
      return;
    }
    if (navigator.share) await navigator.share({ title, text });
    else await navigator.clipboard.writeText(text);
  } catch { /* cancelled */ }
}

/* ─────────────── pieces ─────────────── */

const TitleBar: React.FC<{ up: NextUp; sub: string; onBack?: () => void }> = ({ up, sub, onBack }) => (
  <header className="m-top" style={{ gap: 10 }}>
    {onBack && <button className="m-ibtn" aria-label="Back to the finish pad" onClick={onBack}><Icon name="back" /></button>}
    {up.heat && <span className="m-hp" style={{ background: HEAT_COLOURS[up.heatIndex % HEAT_COLOURS.length], width: 34, height: 34, fontSize: 15, borderRadius: 10 }}>{up.heatLabel}</span>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="m-disp" style={{ fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{up.raceLabel}{up.heat ? ` · Heat ${up.heatLabel}` : ''}</div>
      <div className="m-dim" style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  </header>
);

const DoneHead: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <header className="m-top" style={{ gap: 12 }}>
    <span className="m-done-tick"><Icon name="check" size={20} strokeWidth={2.6} /></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
      <div className="m-dim" style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  </header>
);

const ROW_H = 52;

/** The finish order with drag to reorder (finishers only); tap a boat for a letter score. */
const OrderList: React.FC<{ order: FinishingEntry[]; skippers: Skipper[]; you: (i: number) => boolean; heatSize: number; entrants: number; onMove: (from: number, to: number) => void; onRow: (e: FinishingEntry) => void }> = ({ order, skippers, you, heatSize, entrants, onMove, onRow }) => {
  const finishers = order.filter(e => !e.letterScore).length;
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);
  const moved = useRef(false);
  const over = drag ? Math.max(0, Math.min(finishers - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1;
  return (
    <div className="m-card m-order" role="list" aria-label="Finish order">
      {order.map((e, k) => {
        const isDrag = drag?.from === k;
        const shift = drag && !isDrag && !e.letterScore ? (k > drag.from && k <= over ? -ROW_H : k < drag.from && k >= over ? ROW_H : 0) : 0;
        const pts = e.letterScore ? heatLetterPts(e.letterScore, heatSize, entrants) : null;
        return (
          <div key={e.skipperIndex} role="listitem" className={`m-ord ${isDrag ? 'm-ord-drag' : ''} ${e.letterScore ? 'm-ord-ls' : ''}`}
            style={{ transform: isDrag ? `translateY(${drag!.dy}px)` : shift ? `translateY(${shift}px)` : undefined }}
            onPointerDown={ev => { if (e.letterScore) return; startY.current = ev.clientY; moved.current = false; (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId); setDrag({ from: k, dy: 0 }); }}
            onPointerMove={ev => { if (!drag || drag.from !== k) return; const dy = ev.clientY - startY.current; if (Math.abs(dy) > 6) moved.current = true; setDrag({ from: k, dy }); }}
            onPointerUp={() => { if (!drag || drag.from !== k) return; const to = over; setDrag(null); if (moved.current && to !== k) onMove(k, to); else if (!moved.current) onRow(e); }}
            onPointerCancel={() => setDrag(null)}
            onClick={() => { if (e.letterScore) onRow(e); }}
          >
            <span className="m-disp m-ord-pl">{e.letterScore ? '–' : e.position}</span>
            <span className={`m-sail ${e.letterScore ? 'm-sail-ocs' : ''}`}>{sailOf(skippers[e.skipperIndex]) || '–'}</span>
            <span className="m-ord-nm">{you(e.skipperIndex) ? 'You' : skippers[e.skipperIndex]?.name}</span>
            {e.letterScore ? <span className="m-ord-code">{e.letterScore}{pts ? ` ${pts}` : ''}</span> : <span className="m-ord-grip" aria-hidden="true"><i /><i /><i /></span>}
          </div>
        );
      })}
    </div>
  );
};

const OverrideSheet: React.FC<{ change: HandicapChange; skipper?: Skipper; onSet: (v: number) => void; onClose: () => void }> = ({ change, skipper, onSet, onClose }) => {
  const [v, setV] = useState(String(change.to));
  const n = Number(v);
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Override handicap">
        <span className="m-grab" />
        <div className="m-disp" style={{ fontSize: 21, fontWeight: 700 }}>{sailOf(skipper)} · {skipper?.name}</div>
        <p className="m-mut" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>The rules give {change.to} s ({change.from} before this race). Set the handicap this boat sails on next; later races are worked out from it.</p>
        <label className="m-fld"><span>Handicap (seconds)</span><input className="m-field" type="number" inputMode="numeric" min={0} step={5} value={v} onChange={e => setV(e.target.value)} style={{ fontSize: 22, textAlign: 'center' }} /></label>
        <button className="m-btn m-btn-p" style={{ width: '100%', marginTop: 14 }} disabled={v === '' || !Number.isFinite(n) || n < 0} onClick={() => onSet(n)}>Set handicap</button>
      </div>
    </>
  );
};

function reasonFor(c: HandicapChange, all: HandicapChange[], scratchWon: boolean): string {
  const d = c.to - c.from;
  const amount = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  if (c.overridden) return 'Set by hand';
  if (d === 0) return c.from === 0 ? 'Scratch boat · no change' : 'No change';
  if (c.letterScore) return `${c.letterScore} ${amount}`;
  const last = Math.max(...all.filter(x => !x.letterScore && x.position).map(x => x.position || 0));
  if (c.position && c.position <= 3 && d < 0) return `${ordinal(c.position)} place ${amount}`;
  if (c.position === last && d > 0) return `Last place ${amount}`;
  if (scratchWon && d > 0) return `Scratch boat won · ${amount}`;
  return c.position ? `${ordinal(c.position)} place ${amount}` : amount;
}

/** Standings after the race (the desktop results table's scoring). */
const Standings: React.FC<{ event: RaceEvent; you: (memberId?: string) => boolean }> = ({ event, you }) => {
  const st = useMemo(() => eventStandings(forScoring(event)), [event]);
  if (!st) return null;
  const races = st.races.slice(-3);
  return (
    <div className="m-card" style={{ overflow: 'hidden' }}>
      <table className="m-stand">
        <thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Skipper</th>{races.map(r => <th key={r}>R{r}</th>)}<th>Pts</th></tr></thead>
        <tbody>
          {st.rows.slice(0, 12).map((r, k) => (
            <tr key={r.index} className={you(r.memberId) ? 'm-stand-you' : ''}>
              <td><span className={k < 3 ? `m-stand-p m-stand-p${k + 1}` : ''}>{k + 1}</span></td>
              <td style={{ textAlign: 'left' }}><span className="m-stand-nm">{you(r.memberId) ? 'You' : r.name}</span> <span className="m-dim">{r.sailNo}</span></td>
              {races.map(x => {
                const c = st.cell(r.index, x);
                const dropped = st.isDropped(r.index, x);
                return <td key={x} className={dropped ? 'm-stand-drop' : /^[A-Z]/.test(c) ? 'm-stand-ls' : ''}>{c || '–'}</td>;
              })}
              <td style={{ fontWeight: 700 }}>{r.netLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ─────────────── screen ─────────────── */

type Step = 'review' | 'moves' | 'handicaps' | 'published';
interface Done { c: RaceConfirmation | HeatConfirmation; event: RaceEvent; up: NextUp; settings: HandicapSettings }

export const ConfirmRaceScreen: React.FC = () => {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { tap, toast, memberIds } = useMobile();
  const { item, event } = useSetupEvent(key);
  const up = useMemo(() => (event ? nextUp(event) : null), [event]);
  const boats = useMemo(() => (event && up ? padBoats(event, up) : null), [event, up]);

  const [session, setSession] = useState<RaceSession | null>(null);
  const [order, setOrderState] = useState<FinishingEntry[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [step, setStep] = useState<Step>('review');
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState<LetterTarget | null>(null);
  const [override, setOverride] = useState<HandicapChange | null>(null);

  useEffect(() => {
    if (!event || !up || !boats || done) return;
    const s = loadSession(event.id, up);
    setSession(s);
    setOrderState(s.finish || startingOrder(boats, up.race, s));
  }, [event?.id, up?.race, up?.heat, boats]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOrder = (changed: FinishingEntry[]) => {
    const o = sortFinishOrder(changed.map(x => ({ ...x, position: x.letterScore && !POSITION_PRESERVING_SCORES.has(x.letterScore) ? 999 : x.position })));
    setOrderState(o);
    if (session) { const next = { ...session, finish: o }; setSession(next); saveSession(next); }
  };

  if (!done && (item === undefined || (item && !event))) return <Loading />;
  if (!done && (!item || !event || !up || !boats || !session)) return <Missing />;

  const isYouIdx = (skippers: Skipper[]) => (i: number) => memberIds.includes(skippers[i]?.memberId || '');
  const isYou = (memberId?: string) => !!memberId && memberIds.includes(memberId);

  /* ── after confirming ── */
  if (done) {
    const { c, up: was } = done;
    const ev = done.event;
    const after = nextUp(ev);
    const skippers = c.after.skippers;
    const startNext = () => navigate(`/race-desk/event/${key}/race`, { replace: true });
    // Every heat of the race is in: the next race's heats come from the scoring screen's "Advance" step
    const hmNow = c.after.heatManagement;
    const advance = c.kind === 'heat' && after.roundComplete && !after.allDone && hmNow
      ? advanceToNextRoundIn(hmNow, heatSailingOrder(hmNow).slice(-1)[0], c.after.dropRules, c.after.skippers) : null;
    const upAfterAdvance = advance && advance.heatManagement.currentRound > hmNow!.currentRound ? nextUp({ ...ev, heatManagement: advance.heatManagement }) : null;
    const nextUpShown = upAfterAdvance || after;
    const nextLabel = after.allDone || (after.roundComplete && !upAfterAdvance) ? 'Back to the event'
      : `${nextUpShown.race !== was.race ? `${nextUpShown.raceLabel} · ` : ''}start ${nextUpShown.heat ? `Heat ${nextUpShown.heatLabel}` : nextUpShown.raceLabel}`;
    const goNext = async () => {
      if (after.allDone || (after.roundComplete && !upAfterAdvance)) { navigate(`/race-desk/event/${key}`, { replace: true }); return; }
      if (advance && upAfterAdvance) {
        setBusy(true);
        try {
          const run = { ...c.after, heatManagement: advance.heatManagement, ...(advance.convertedResults.length ? { raceResults: advance.convertedResults, lastCompletedRace: advance.lastCompletedRace! } : {}) };
          await saveRun(ev, run);
        } catch { toast("Couldn't move on to the next race. Check your connection and try again."); setBusy(false); return; }
        setBusy(false);
      }
      startNext();
    };

    if (step === 'moves' && c.kind === 'heat') {
      const hm = c.after.heatManagement!;
      const moves = heatMoves(c);
      const cfg = hm.configuration;
      const promote = cfg.promotionCountOverrides?.[c.round] ?? cfg.promotionCount;
      const nextAssign = after.heat ? hm.rounds.find(r => r.round === hm.currentRound)?.heatAssignments.find(a => a.heatDesignation === after.heat) : null;
      const promotedIn = moves.now.filter(m => m.to === after.heat).length;
      const higherNext = after.heat && after.race === c.round;
      return (
        <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
          <DoneHead title={`Heat ${was.heatLabel} confirmed`} sub={`${was.raceLabel} · ${cfg.scoringSystem === 'shrs' ? 'SHRS 2026' : 'HMS 2022'}${cfg.scoringSystem !== 'shrs' && c.round > 1 ? ` · promote ${promote}` : ''}`} />
          {moves.now.length > 0 && (
            <div className="m-card" style={{ overflow: 'hidden' }}>
              <div className="m-li m-li-head" style={{ background: 'rgba(52,199,89,.10)' }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--m-green-ink)' }}>Promote to Heat {moves.now[0].to} now</span>
                <span className="m-hp" style={{ background: heatColour(moves.now[0].to) }}>{moves.now[0].to}</span>
              </div>
              {moves.now.map(m => (
                <div key={m.skipperIndex} className="m-li">
                  <span className="m-disp" style={{ width: 22, fontWeight: 700 }}>{m.place ?? ''}</span>
                  <span className="m-sail">{sailOf(skippers[m.skipperIndex])}</span>
                  <span style={{ flex: 1, fontSize: 14.5 }}>{isYouIdx(skippers)(m.skipperIndex) ? 'You' : skippers[m.skipperIndex]?.name}</span>
                </div>
              ))}
            </div>
          )}
          {higherNext && nextAssign && (
            <div className="m-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="m-hp" style={{ background: heatColour(after.heat!), width: 34, height: 34, fontSize: 15 }}>{after.heatLabel}</span>
              <div style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Heat {after.heatLabel} sails next</b> <span className="m-dim" style={{ fontSize: 13 }}>{promotedIn ? `${nextAssign.skipperIndices.length - promotedIn} + ${promotedIn} promoted = ` : ''}{nextAssign.skipperIndices.length} boats</span></div>
            </div>
          )}
          {higherNext && cfg.scoringSystem !== 'shrs' && c.round > 1 && (
            <div className="m-card" style={{ overflow: 'hidden' }}>
              <div className="m-li m-li-head" style={{ background: 'rgba(255,159,10,.10)' }}><span style={{ fontWeight: 600, fontSize: 14, color: 'var(--m-amber-ink)' }}>After Heat {after.heatLabel} · drop to the heat below for Race {c.round + 1}</span></div>
              <div className="m-li m-dim" style={{ fontSize: 13.5 }}>The bottom boats of Heat {after.heatLabel}, decided when it's confirmed</div>
            </div>
          )}
          <div className="m-dim m-row" style={{ fontSize: 12.5, gap: 8, alignItems: 'flex-start' }}><Icon name="check" size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>Promotion, relegation, race points and tie-breaks follow {cfg.scoringSystem === 'shrs' ? 'SHRS' : 'HMS 2022'}, using the same code as desktop.</span></div>
          <div style={{ flex: 1 }} />
          <button className="m-btn m-btn-p" style={{ height: 54 }} onClick={() => void goNext()}>
            {after.heat && !after.allDone && !after.roundComplete && <span className="m-hp" style={{ background: heatColour(after.heat), width: 24, height: 24, fontSize: 12 }}>{after.heatLabel}</span>}
            {after.allDone || after.roundComplete ? 'Back to the event' : `Start Heat ${after.heatLabel}`}
          </button>
          {nextAssign && (
            <button className="m-btn m-btn-g" onClick={() => void shareText(`${after.raceLabel} · Heat ${after.heatLabel}`, `${ev.eventName || ''}\n${after.raceLabel} · Heat ${after.heatLabel}\n${nextAssign.skipperIndices.map(i => `${sailOf(skippers[i])} ${skippers[i]?.name || ''}`).join('\n')}`)}>Print or share heat sheet</button>
          )}
          <button className="m-link" style={{ alignSelf: 'center' }} onClick={() => setStep('published')}>See the standings</button>
        </div>
      );
    }

    if (step === 'handicaps' && c.kind === 'race') {
      const changes = handicapChanges(c.after, c.race);
      const winner = changes.find(x => x.position === 1);
      const scratchWon = !!winner && winner.from === 0;
      const rules = done.settings.ruleset ? (done.settings.ruleset as any).name || 'Club handicap rules' : 'AlfiePRO handicap rules';
      return (
        <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
          <DoneHead title={`Race ${c.race} confirmed`} sub={`${ev.eventName || ''} · ${rules}`} />
          <div className="m-card" style={{ overflow: 'hidden' }}>
            <div className="m-li m-li-head"><span className="m-lb m-dim" style={{ width: 28 }}>Pos</span><span className="m-lb m-dim" style={{ flex: 1 }}>Boat</span><span className="m-lb m-dim">Handicap</span></div>
            {changes.map(x => (
              <button key={x.skipperIndex} className="m-li" onClick={() => setOverride(x)} aria-label={`Override handicap for ${sailOf(skippers[x.skipperIndex])}`}>
                <span className="m-disp" style={{ width: 28, fontWeight: 700, fontSize: x.letterScore ? 11 : 16 }}>{x.letterScore || x.position}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="m-row" style={{ gap: 6 }}><span className="m-sail" style={{ minWidth: 34, height: 24, fontSize: 12 }}>{sailOf(skippers[x.skipperIndex])}</span><span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isYouIdx(skippers)(x.skipperIndex) ? 'You' : skippers[x.skipperIndex]?.name}</span></span>
                  <span className="m-dim" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>{reasonFor(x, changes, scratchWon)}</span>
                </span>
                <span className="m-num" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{x.from} → <b style={{ color: x.to < x.from ? 'var(--m-green-ink)' : x.to > x.from ? 'var(--m-amber-ink)' : undefined }}>{x.to}</b></span>
              </button>
            ))}
          </div>
          <div className="m-dim m-row" style={{ fontSize: 12.5, gap: 8, alignItems: 'flex-start' }}><Icon name="check" size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>Worked out by the same {done.settings.ruleset ? 'club rules' : 'AlfiePRO rules'} as desktop. Tap a boat to override its new handicap.</span></div>
          <div style={{ flex: 1 }} />
          <button className="m-btn m-btn-p" style={{ height: 54 }} onClick={() => setStep('published')}>Use for Race {c.race + 1}</button>
          {override && (
            <OverrideSheet change={override} skipper={skippers[override.skipperIndex]} onClose={() => setOverride(null)} onSet={async v => {
              const run = overrideHandicap(c.after, override.skipperIndex, v, done.settings);
              setOverride(null);
              setBusy(true);
              try {
                const saved = await saveRun(ev, run);
                setDone({ ...done, c: { ...c, after: run }, event: saved });
                tap('success');
              } catch { toast("Couldn't save the handicap. Check your connection and try again."); }
              setBusy(false);
            }} />
          )}
          {busy && <div className="m-dim" style={{ textAlign: 'center', fontSize: 13 }}>Saving…</div>}
        </div>
      );
    }

    // published
    const raceNo = c.kind === 'race' ? c.race : c.round;
    const roundDone = c.kind === 'race' || c.roundCompleted;
    const drops = Array.isArray(c.after.dropRules) ? c.after.dropRules : [];
    const dropsNow = drops.filter(d => c.after.lastCompletedRace >= d).length;
    const nextDrop = drops.find(d => d > c.after.lastCompletedRace);
    const live = !!(ev.enableLiveTracking || ev.enableLiveStream);
    const moves = c.kind === 'heat' ? heatMoves(c) : null;
    return (
      <div className="m-stack m-published" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
        <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
          <span className="m-pub-tick"><Icon name="check" size={30} strokeWidth={2.6} /></span>
          <div className="m-disp" style={{ fontSize: 26, fontWeight: 700, marginTop: 12 }}>{roundDone ? `${c.kind === 'heat' ? was.raceLabel : `Race ${raceNo}`} is live` : `Heat ${was.heatLabel} is in`}</div>
          <div className="m-mut" style={{ fontSize: 13.5, marginTop: 4 }}>Members see it in Results now{live ? ' · and on the live page' : ''}</div>
        </div>
        <div className="m-row" style={{ padding: '0 2px' }}>
          <span className="m-lb m-dim" style={{ flex: 1 }}>Standings after {c.after.lastCompletedRace} race{c.after.lastCompletedRace === 1 ? '' : 's'}</span>
          {drops.length > 0 && <span className="m-dim" style={{ fontSize: 12 }}>{dropsNow ? `${dropsNow} drop${dropsNow > 1 ? 's' : ''}` : 'No drops yet'}{nextDrop ? ` · ${dropsNow ? 'next' : '1st'} after R${nextDrop}` : ''}</span>}
        </div>
        <Standings event={ev} you={isYou} />
        {c.kind === 'heat' && <div className="m-dim" style={{ fontSize: 12.5 }}>Heat positions are converted to overall race points by the same {c.after.heatManagement?.configuration.scoringSystem === 'shrs' ? 'SHRS' : 'HMS'} rules desktop uses.</div>}
        {moves && moves.nextRound && moves.next.length > 0 && (
          <div className="m-card" style={{ overflow: 'hidden' }}>
            <div className="m-li m-li-head"><span className="m-lb m-dim" style={{ flex: 1 }}>Heat moves for Race {moves.nextRound}</span></div>
            {moves.next.map(m => (
              <div key={m.skipperIndex} className="m-li" style={{ gap: 10 }}>
                <span className="m-sail">{sailOf(skippers[m.skipperIndex])}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{isYouIdx(skippers)(m.skipperIndex) ? 'You' : skippers[m.skipperIndex]?.name}</span>
                <span className="m-hp" style={{ background: heatColour(m.from), width: 22, height: 22, fontSize: 11 }}>{m.from}</span>
                <Icon name="chevron" size={14} className="m-dim" />
                <span className="m-hp" style={{ background: heatColour(m.to), width: 22, height: 22, fontSize: 11 }}>{m.to}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="m-btn m-btn-p" style={{ height: 54 }} disabled={busy} onClick={() => void goNext()}>{busy ? 'Saving…' : nextLabel}</button>
        <div className="m-row" style={{ gap: 8 }}>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => {
            const st = eventStandings(forScoring(ev));
            const lines = (st?.rows || []).slice(0, 10).map((r, k) => `${k + 1}. ${r.name} (${r.sailNo || ''}) ${r.netLabel}`);
            void shareText(ev.eventName || 'Results', `${ev.eventName || ''} · standings after ${c.after.lastCompletedRace} race${c.after.lastCompletedRace === 1 ? '' : 's'}\n${lines.join('\n')}`);
          }}>Share results</button>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => navigate(`/race-desk/event/${key}`, { replace: true })}>Event page</button>
        </div>
      </div>
    );
  }

  /* ── review ── */
  const ev = event!; const u = up!; const b = boats as PadBoats; const s = session!;
  const skippers = b.skippers;
  const finished = new Set(order.map(x => x.skipperIndex));
  const out = sailSortedIndices(skippers).filter(i => !finished.has(i));
  const nextPlace = order.filter(x => !x.letterScore).length + 1;
  const st = scoringStateOf(forScoring(ev));
  const hm = heatManagementOf(forScoring(ev));
  const shrs = hm?.configuration?.scoringSystem === 'shrs';
  const heats = !!(u.heat && hm?.configuration?.enabled);
  const onPhone = confirmsOnPhone(ev);
  const entrants = (st.skippers || []).length;
  const backToPad = () => navigate(`/race-desk/event/${key}/finish`, { replace: true });

  const confirm = async () => {
    if (out.length) return;
    setBusy(true);
    try {
      if (!onPhone) {
        setFinishHandoff({ eventId: ev.id, race: u.race, heat: u.heat, entries: order.map(x => ({ ...x, skipperIndex: b.globalOf[x.skipperIndex] })) });
        const err = await startScoring(ev, currentClub?.clubId || ev.clubId);
        if (err) toast(err);
        setBusy(false);
        return;
      }
      const settings = await handicapSettingsFor(ev);
      const run = runOf(ev);
      const global = order.map(x => ({ ...x, skipperIndex: b.globalOf[x.skipperIndex] }));
      let c: RaceConfirmation | HeatConfirmation;
      if (heats && u.heat) c = confirmHeat(applyHeatFinish(run, u.heat, b.globalOf, global), u.heat);
      else c = confirmRace(applyRaceFinish(run, u.race, order, settings), u.race, settings);
      const saved = await saveConfirmation(ev, c, settings);
      clearSession(ev.id);
      tap('success');
      setDone({ c, event: saved, up: u, settings });
      setStep(c.kind === 'heat' && !c.roundCompleted ? 'moves' : c.kind === 'race' && ev.raceFormat === 'handicap' ? 'handicaps' : 'published');
    } catch (err) {
      console.error('Confirm failed', err);
      toast("Couldn't save the results. Nothing was lost: check your connection and confirm again.");
    }
    setBusy(false);
  };

  return (
    <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <TitleBar up={u} sub={`${skippers.length} boats · ${shrs ? 'SHRS' : heats ? 'HMS' : ev.raceFormat === 'handicap' ? 'handicap' : 'scratch'}`} onBack={backToPad} />
      {order.length === 0 ? <div className="m-card m-empty">No finishes called yet. Go back to the finish pad to call them.</div> : (
        <OrderList order={order} skippers={skippers} you={isYouIdx(skippers)} heatSize={skippers.length} entrants={entrants}
          onMove={(a, z) => { setOrder(moveFinish(order, a, z)); tap('light'); }}
          onRow={x => setLetter({ index: x.skipperIndex, current: x })} />
      )}
      {out.length > 0 && (
        <div className="m-card m-tray">
          <div className="m-li m-li-head"><span className="m-lb" style={{ color: 'var(--m-amber-ink)' }}>Still racing · {out.length}</span></div>
          {out.map(i => (
            <div key={i} className="m-li" style={{ gap: 8 }}>
              <span className="m-sail">{sailOf(skippers[i]) || '–'}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isYouIdx(skippers)(i) ? 'You' : skippers[i]?.name}{s.rollCall?.absent?.includes(b.globalOf[i]) ? <span className="m-dim"> · absent</span> : null}</span>
              <button className="m-chip-btn" onClick={() => { const o = addFinish(order, skippers, i); if (o) { setOrder(o); tap('success'); } }}>Finished {ordinal(nextPlace)}</button>
              <button className="m-chip-btn m-chip-red" onClick={() => { setOrder(applyLetterScore(order, skippers, i, s.rollCall?.absent?.includes(b.globalOf[i]) ? 'DNS' : 'DNF')); tap('medium'); }}>{s.rollCall?.absent?.includes(b.globalOf[i]) ? 'DNS' : 'DNF'}</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {!onPhone && <div className="m-dim" style={{ fontSize: 12.5, textAlign: 'center' }}>Multi-day events are confirmed on the scoring sheet for now; it opens with this order.</div>}
      {out.length > 0 && <div className="m-dim" style={{ fontSize: 12.5, textAlign: 'center' }}>Every boat needs a finish or a letter score before the {u.heat ? 'heat' : 'race'} can be confirmed.</div>}
      <button className="m-btn m-btn-p" style={{ height: 54 }} disabled={busy || out.length > 0 || order.length === 0} onClick={confirm}>
        {busy ? 'Saving…' : !onPhone ? 'Confirm on the scoring sheet' : `Confirm ${u.heat ? `Heat ${u.heatLabel}` : u.raceLabel}`}
      </button>
      {letter && (
        <LetterSheet target={letter} skipper={skippers[letter.index]} race={u.race} raceLabel={u.raceLabel} heatLabel={heats ? u.heatLabel : ''}
          heatSize={skippers.length} entrants={entrants} prev={previousResultsFor(b.results as any, u.race, letter.index)} shrs={shrs} heats={heats}
          multiDay={!!ev.multiDay} numberOfDays={ev.numberOfDays} currentDay={forScoring(ev).currentDay}
          onApply={(code: LetterScore, p?: number) => { setOrder(applyLetterScore(order, skippers, letter.index, code, p)); setLetter(null); tap('medium'); }}
          onClear={() => { setOrder(applyLetterScore(order, skippers, letter.index, null)); setLetter(null); }}
          onClose={() => setLetter(null)} />
      )}
    </div>
  );
};

export default ConfirmRaceScreen;
