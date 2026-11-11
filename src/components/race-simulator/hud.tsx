// The race screen's floating panels: wind, clock, start line or course, fleet, coach, boat strip,
// sticks, rules moments, instant replay and results. Presentational only; SimRace owns the state.
import React, { useRef } from 'react';
import type { Incident } from '@/sim/types';
import type { Cue, CoachMode, LineInfo } from './coach';
import { SAILING_CLEAR } from './coach';
import { ruleText } from './rulesText';
import { AlfieOrb, Btn, C, Cap, Chip, Hud, InfoGlyph, WarnGlyph, clock, cx, ordinal } from './ui';
import { rudderWords, sailWords, type DemoCue, type Stick } from './demoTalk';
import { compassPoint, shiftWords } from './windWords';

/** What the race screen shows, refreshed ten times a second from the race. */
export interface HudState {
  T: number; raceT: number; preStart: boolean;
  /** `off`: degrees the wind is from its average now (+ right). `tack`: yours, while you're beating; else null. */
  wind: { kn: number; from: number; spark: number[]; swing: number; off: number; tack: 'stbd' | 'port' | null };
  line: LineInfo | null;
  course: { leg: string; legNo: number; legs: number; next: string; distL: number | null; place: number; of: number; status: string | null };
  fleet: FleetRow[];
  boat: { tack: 'Starboard' | 'Port'; pos: string; spdPct: number; kn: number; trim: string };
  rudder: number; sheet: number; twa: number;
  /** The penalty turn you owe, and how far round you are (null when you owe none). */
  penalty: PenaltyProgress | null; finished: boolean;
  goal: { progress: string | null; timeLeft: number | null } | null;
}

// ───────────────────────── Wind ─────────────────────────
/**
 * The wind: how strong, where from, and where it is against its average, drawn the way you see it
 * looking up the course (left is left). The dot is the wind now; the line hanging from it is where
 * it has been over the last two minutes, the newest at the top.
 */
export function WindCard({ kn, from, spark, swing, off, tack = null, compact }: { kn: number; from: number; spark: number[]; swing: number; off: number; tack?: 'stbd' | 'port' | null; compact?: boolean }) {
  const w = 240, top = 20, H = 44, h = top + H + 2;
  const range = Math.max(10, Math.ceil(Math.max(...spark.map(v => Math.abs(v)), Math.abs(off)) / 5) * 5);
  const X = (v: number) => w / 2 + (Math.max(-range, Math.min(range, v)) / range) * (w / 2 - 12);
  // Newest first, down the card.
  const n = spark.length;
  const d = spark.map((_, i) => { const v = spark[n - 1 - i]; return `${i ? 'L' : 'M'}${X(v).toFixed(1)} ${(top + (n > 1 ? (i / (n - 1)) * H : 0)).toFixed(1)}`; }).join(' ');
  const sw = shiftWords(off, tack);
  // Which way it's moving: further out the side it's on, or back towards its average.
  const out = Math.abs(off) >= 3 && Math.sign(swing) === Math.sign(off);
  const trend = Math.abs(swing) < 2 ? 'Holding steady' : `${out ? 'Still going' : Math.abs(off) >= 3 ? 'Coming back' : 'Going'} ${swing > 0 ? 'right' : 'left'}: ${Math.round(Math.abs(swing))}° in the last 40 s`;
  const colour = sw.tone === 'good' ? '#7EE2A8' : sw.tone === 'warn' ? '#FFCB96' : '#A9D2FF';
  return (
    <Hud className={cx('flex flex-col gap-2.5 px-[18px] py-4', compact ? 'w-[200px]' : 'w-[276px]')}>
      <div className="flex items-center justify-between">
        <Cap>Wind</Cap>
        <span className="text-[12.5px] font-semibold" style={{ color: C.mute }} aria-label={`From the ${compassPoint(from)}, ${Math.round(from) % 360} degrees`}>from {compassPoint(from)} · {String(Math.round(from) % 360).padStart(3, '0')}°</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[30px] font-bold leading-none tabular-nums">{kn.toFixed(1)}</span>
        <span className="text-[13.5px]" style={{ color: C.mute }}>knots</span>
      </div>
      {!compact && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Wind ${sw.where.toLowerCase()}. ${trend}.`}>
          <text x="0" y="9" fill="rgba(235,240,255,.6)" fontSize="10" fontWeight="600">LEFT</text>
          <text x={w / 2} y="9" fill="rgba(235,240,255,.45)" fontSize="10" textAnchor="middle">average</text>
          <text x={w} y="9" fill="rgba(235,240,255,.6)" fontSize="10" fontWeight="600" textAnchor="end">RIGHT</text>
          {/* The scale: the average down the middle, a tick every 5°. */}
          <path d={`M12 ${top} H${w - 12}`} stroke="rgba(255,255,255,.16)" />
          {Array.from({ length: (2 * range) / 5 + 1 }, (_, i) => -range + i * 5).map(v => <path key={v} d={`M${X(v)} ${top - (v === 0 ? 5 : 3)} V${top + (v === 0 ? 5 : 3)}`} stroke={v === 0 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.2)'} />)}
          <path d={`M${w / 2} ${top} V${top + H}`} stroke="rgba(255,255,255,.12)" strokeDasharray="2 4" />
          {n > 2 && <path d={d} fill="none" stroke="#4DA3FF" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          <circle cx={X(off)} cy={top} r={6} fill={colour} stroke="rgba(7,13,27,.9)" strokeWidth={2} />
          <text x={w} y={h - 1} fill="rgba(235,240,255,.5)" fontSize="9" textAnchor="end" stroke="rgba(7,13,27,.9)" strokeWidth={3} paintOrder="stroke">2 min ago</text>
        </svg>
      )}
      <div className="flex flex-col gap-0.5">
        <p className="m-0 text-[13.5px] font-semibold tabular-nums">{sw.where}</p>
        <p className="m-0 text-[13px] font-semibold" style={{ color: colour }}>{sw.means}</p>
        {!compact && <p className="m-0 text-[12px]" style={{ color: C.mute }}>{trend}</p>}
      </div>
    </Hud>
  );
}

// ───────────────────────── Clock ─────────────────────────
export function ClockCard({ preStart, T, seq, raceT, sub, compact }: { preStart: boolean; T: number; seq: number; raceT: number; sub: string; compact?: boolean }) {
  const frac = preStart ? Math.min(1, Math.max(0, 1 - T / seq)) : 1;
  const marks = seq >= 180 ? ['3:00', '2:00', '1:00', 'Gun'] : seq >= 120 ? ['2:00', '1:00', 'Gun'] : ['1:00', '0:30', 'Gun'];
  return (
    <Hud className={cx('text-center', compact ? 'w-[176px] px-3.5 pb-2.5 pt-2' : 'w-[260px] px-5 pb-3.5 pt-3')}>
      <Cap>{preStart ? 'Start in' : 'Racing'}</Cap>
      <p className={cx('m-0 mt-1 font-display font-bold leading-none tabular-nums', compact ? 'mb-1.5 text-[34px]' : 'mb-2.5 text-[52px]')} aria-live="off">{preStart ? clock(Math.ceil(T)) : clock(raceT)}</p>
      {preStart ? (
        <>
          <div className="relative h-1.5 rounded-md bg-white/[0.08]">
            <span className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${frac * 100}%`, background: 'linear-gradient(90deg,#2E7BFF,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B)' }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px]" style={{ color: C.mute }}>{marks.map(m => <span key={m}>{m}</span>)}</div>
        </>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{sub}</p>
      )}
    </Hud>
  );
}

// ───────────────────────── Start line ─────────────────────────
export function LineCard({ line, map }: { line: LineInfo; map?: React.ReactNode }) {
  const fav = line.favoured;
  const tilt = fav === 'pin' ? -7 : fav === 'starboard' ? 7 : 0;
  return (
    <Hud className="flex w-[276px] flex-col gap-3 px-[18px] py-4">
      <Cap>Start line</Cap>
      <div className="flex items-center gap-3.5">
        <svg width="84" height="56" viewBox="0 0 84 56" role="img" aria-label={fav === 'square' ? 'The line is square to the wind' : `The ${fav} end is favoured`}>
          <path d="M10 40 L76 40" stroke="#FFB340" strokeWidth={2} strokeDasharray="5 4" />
          <path d="M42 40 L42 6" stroke="rgba(255,255,255,.25)" strokeDasharray="2 3" />
          <g transform={`rotate(${tilt} 42 36)`}>
            <path d="M42 6 L42 34" stroke="#9CCBFF" strokeWidth={2} strokeLinecap="round" />
            <path d="M38.6 28 L42 34 L45.4 28" fill="none" stroke="#9CCBFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <circle cx="10" cy="40" r={fav === 'pin' ? 5 : 4} fill="#FF9F43" fillOpacity={fav === 'starboard' ? 0.55 : 1} />
          <circle cx="76" cy="40" r={fav === 'starboard' ? 5 : 4} fill="#FF9F43" fillOpacity={fav === 'pin' ? 0.55 : 1} />
        </svg>
        <div>
          <p className="m-0 text-[15px] font-semibold">{fav === 'square' ? 'Square line' : fav === 'pin' ? 'Pin end favoured' : 'Starboard end favoured'}</p>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: C.mute }}>{fav === 'square' ? 'Neither end gains much' : `By ${Math.round(line.bias)}°, worth about ${line.worth < 1 ? 'half a length' : `${line.worth.toFixed(1)} lengths`}`}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
          <Cap className="!text-[10px]">{line.belowL < 0 ? 'Over the line' : 'Below line'}</Cap>
          <p className={cx('m-0 mt-1 text-[15px] font-semibold', line.belowL < 0 && 'text-[#FFB4B4]')}>{Math.abs(line.belowL).toFixed(1)} lengths</p>
        </div>
        <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
          <Cap className="!text-[10px]">At full speed</Cap>
          <p className="m-0 mt-1 text-[15px] font-semibold">{line.ttl === null ? '–' : `${line.ttl.toFixed(1)} s`}</p>
        </div>
      </div>
      {map}
    </Hud>
  );
}

// ───────────────────────── Course ─────────────────────────
export function CourseCard({ leg, legNo, legs, next, distL, place, of, status, map }: { leg: string; legNo: number; legs: number; next: string; distL: number | null; place: number; of: number; status: string | null; map?: React.ReactNode }) {
  return (
    <Hud className="flex w-[276px] flex-col gap-3 px-[18px] py-4">
      <div className="flex items-center justify-between"><Cap>Course</Cap><span className="text-xs" style={{ color: C.mute }}>Leg {Math.min(legNo, legs)} of {legs}</span></div>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-[34px] font-bold leading-none">{ordinal(place)}</span>
        <span className="text-[13.5px]" style={{ color: C.mute }}>of {of}</span>
        {status && <Chip tone="warn" className="ml-auto">{status}</Chip>}
      </div>
      <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
        <p className="m-0 text-[13.5px] font-semibold">{leg}</p>
        <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: C.mute }}>{distL === null ? next : `${next} · ${distL} lengths`}</p>
      </div>
      {map}
    </Hud>
  );
}

// ───────────────────────── Fleet ─────────────────────────
export interface FleetRow { id: string; sail: string; color: string; name: string; intent: string; isPlayer: boolean; place: number; flag: string | null }

export function FleetCard({ rows, preStart }: { rows: FleetRow[]; preStart: boolean }) {
  return (
    <Hud className="flex min-h-0 w-[276px] flex-col px-2 pb-2 pt-3.5">
      <div className="flex items-center justify-between px-2.5 pb-1.5">
        <Cap>Fleet</Cap>
        <span className="text-xs" style={{ color: C.mute }}>{preStart ? "what they're planning" : 'place · what they\'re doing'}</span>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {rows.map(r => (
          <div key={r.id} className={cx('grid grid-cols-[10px_26px_minmax(0,1fr)] items-start gap-2.5 rounded-[10px] px-2.5 py-[7px]', r.isPlayer && 'bg-white/[0.05]')}>
            <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
            <span className="text-[13px] font-semibold tabular-nums">{preStart ? r.sail : r.place}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{preStart ? r.name : `${r.sail} · ${r.name}`}{r.flag && <span className="ml-1.5 text-[11px] font-bold text-[#FFB067]">{r.flag}</span>}</span>
              <span className="block truncate text-[12.5px]" style={{ color: C.mute }}>{r.intent}</span>
            </span>
          </div>
        ))}
      </div>
    </Hud>
  );
}

// ───────────────────────── Coach ─────────────────────────
export function CoachCard({ cue, mode, onHide, onWhy, compact }: { cue: Cue | null; mode: CoachMode; onHide: () => void; onWhy?: () => void; compact?: boolean }) {
  if (!cue || mode === 'off') return null;
  const showWatch = !!cue.watch && mode === 'full';
  return (
    <Hud className={cx('flex flex-col gap-3', compact ? 'px-4 py-3' : 'px-5 py-[18px]')} style={{ width: compact ? '100%' : 432 }}>
      <div className="flex items-center gap-2.5">
        <AlfieOrb size={compact ? 26 : 32} />
        <p className="m-0 text-[15px] font-semibold">Alfie</p>
        <span className="rounded-full bg-white/[0.07] px-2.5 py-[3px] text-xs font-semibold">{cue.topic}</span>
        <button type="button" onClick={onHide} className="ml-auto cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[12.5px] font-semibold text-[#A9D2FF] hover:bg-white/[0.06]">Hide</button>
      </div>
      <p className={cx('m-0 leading-[1.5]', compact ? 'text-[14px]' : 'text-[15px]', cue.tone === 'warn' && 'text-[#FFD7B0]')} aria-live="polite">{cue.text}</p>
      {showWatch && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(255,159,67,0.32)] bg-[rgba(255,159,67,0.10)] px-3 py-2.5">
          <WarnGlyph />
          <p className="m-0 text-[13.5px] leading-[1.45] text-[#FFD7B0]"><b>Rule watch.</b> {cue.watch}</p>
        </div>
      )}
      {onWhy && !compact && <div className="flex gap-2"><Btn small onClick={onWhy}>Rules on the water</Btn></div>}
    </Hud>
  );
}

// ───────────────────────── Boat strip ─────────────────────────
export function BoatStrip({ tack, pos, spdPct, kn, trim, auto, finished = false }: { tack: 'Starboard' | 'Port'; pos: string; spdPct: number; kn: number; trim: string; auto: boolean; finished?: boolean }) {
  return (
    <Hud className="flex items-center gap-3.5 whitespace-nowrap rounded-2xl px-4 py-2.5">
      <span className={cx('rounded-full px-2.5 py-1 text-[12.5px] font-bold', tack === 'Starboard' ? 'bg-[rgba(42,147,255,0.16)] text-[#A9D2FF]' : 'bg-[rgba(255,159,67,0.16)] text-[#FFCB96]')}>{tack}</span>
      <span className="text-[13.5px]">{pos}</span>
      <span className="h-[18px] w-px bg-white/[0.12]" />
      {finished ? <span className="text-[13.5px]">{SAILING_CLEAR}</span> : (
        <>
          <span className="text-[13.5px]">Speed <b>{Math.round(spdPct * 100)}%</b> of target <span style={{ color: C.mute }}>· {kn.toFixed(1)} kn</span></span>
          <span className="hidden h-[18px] w-px bg-white/[0.12] xl:block" />
          <span className="hidden text-[13.5px] xl:inline" style={{ color: C.mute }}>{auto ? 'Auto-trim on' : trim}</span>
        </>
      )}
    </Hud>
  );
}

// ───────────────────────── Sticks ─────────────────────────
/** A One-Turn Penalty you owe, and how far round your turn you are. */
export interface PenaltyProgress { owed: number; deg: number; tack: boolean; gybe: boolean }

/** How your penalty turn is going: right round (360°), through a tack and a gybe. */
function PenaltyTurn({ owed, deg, tack, gybe }: PenaltyProgress) {
  const f = Math.min(1, deg / 360), R = 11, len = 2 * Math.PI * R;
  const tick = (done: boolean, text: string) => (
    <span className={cx('inline-flex items-center gap-1 text-[12.5px] font-semibold', done ? 'text-[#A7F3D0]' : '')} style={done ? undefined : { color: C.mute }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{done ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <circle cx="12" cy="12" r="6" />}</svg>
      {text}
    </span>
  );
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3" role="status" aria-label={`Penalty turn: ${Math.round(deg)} degrees, tack ${tack ? 'done' : 'to do'}, gybe ${gybe ? 'done' : 'to do'}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5" />
        <circle cx="14" cy="14" r={R} fill="none" stroke="#FFB061" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${len * f} ${len}`} transform="rotate(-90 14 14)" />
      </svg>
      <div className="flex min-w-0 flex-col">
        <span className="text-[13px] font-semibold text-[#FFD7B0]">{owed > 1 ? `${owed} penalty turns to sail` : 'Sail your penalty turn'}</span>
        <span className="flex gap-3">{tick(tack, 'Tack')}{tick(gybe, 'Gybe')}<span className="text-[12.5px] tabular-nums" style={{ color: C.mute }}>{Math.round(deg)}°</span></span>
      </div>
    </div>
  );
}

export function ControlsCard({ rudder, sheet, onRudder, onRudderEnd, onSheet, onTack, onHail, tackLabel, penalty = null, compact }: {
  rudder: number; sheet: number; onRudder: (v: number) => void; onRudderEnd: () => void; onSheet: (v: number) => void;
  onTack: () => void; onHail: () => void; tackLabel: string;
  /** The penalty you owe: you sail it yourself, and this shows how far round you are. */
  penalty?: PenaltyProgress | null; compact?: boolean;
}) {
  const rudRef = useRef<HTMLSpanElement>(null);
  const sailRef = useRef<HTMLSpanElement>(null);
  const RW = compact ? 132 : 124, SH = compact ? 120 : 112;
  const rud = (e: React.PointerEvent) => {
    const r = rudRef.current?.getBoundingClientRect(); if (!r) return;
    onRudder(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
  };
  const sail = (e: React.PointerEvent) => {
    const r = sailRef.current?.getBoundingClientRect(); if (!r) return;
    onSheet(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
  };
  return (
    <Hud className="flex flex-col gap-3 px-[18px] py-4">
      {penalty && <PenaltyTurn {...penalty} />}
      <div className="flex items-end gap-[18px]">
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[11px]" style={{ color: C.mute }}>OUT</span>
        <span
          ref={sailRef}
          role="slider" aria-label="Sail" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sheet * 100)} tabIndex={0}
          className="relative block cursor-ns-resize touch-none rounded-[18px] bg-black/35 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]"
          style={{ width: 36, height: SH }}
          onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); sail(e); }}
          onPointerMove={e => { if (e.buttons) sail(e); }}
        >
          <span className="absolute left-1 h-7 w-7 rounded-full bg-[#E9EEF8] shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ top: 4 + sheet * (SH - 36) }} />
        </span>
        <span className="text-[11px]" style={{ color: C.mute }}>IN</span>
        <Cap className="!text-[10px]">Sail</Cap>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span
          ref={rudRef}
          role="slider" aria-label="Rudder" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(rudder * 100)} tabIndex={0}
          className="relative block cursor-ew-resize touch-none rounded-[18px] bg-black/35 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]"
          style={{ width: RW, height: 36 }}
          onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); rud(e); }}
          onPointerMove={e => { if (e.buttons) rud(e); }}
          onPointerUp={onRudderEnd}
          onPointerCancel={onRudderEnd}
        >
          <span className="absolute inset-y-1.5 w-0.5 bg-white/[0.14]" style={{ left: RW / 2 - 1 }} />
          <span className="absolute top-1 h-7 w-7 rounded-full bg-[#E9EEF8] shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ left: RW / 2 - 14 + rudder * (RW / 2 - 18) }} />
        </span>
        <Cap className="!text-[10px]">Rudder</Cap>
      </div>
      <div className="flex flex-col gap-2">
        <Btn small onClick={onTack}>{tackLabel}</Btn>
        <Btn small onClick={onHail}>Hail</Btn>
      </div>
      </div>
    </Hud>
  );
}

/**
 * The sticks as Alfie works them, while you watch a drill sailed the right way: the same sail and
 * rudder sticks you sail with, to look at and not to touch (taps go through to the water). Each
 * says where it is in words, and the one Alfie is talking about lights up.
 */
export function SticksView({ rudder, sheet, focus = null, compact }: { rudder: number; sheet: number; focus?: Stick | null; compact?: boolean }) {
  const RW = compact ? 92 : 148, SH = compact ? 64 : 124, K = compact ? 22 : 30, T = K + 8;
  const knob = 'absolute rounded-full bg-[#4DA3FF] shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-[top,left] duration-100 ease-linear';
  const r = Math.max(-1, Math.min(1, rudder)), sh = Math.max(0, Math.min(1, sheet));
  const lit = (on: boolean) => cx('relative block rounded-[18px] bg-black/35 transition-shadow duration-200', on ? 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.6),0_0_0_2px_#4DA3FF,0_0_18px_rgba(77,163,255,0.55)]' : 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]');
  const sailOn = focus === 'sail' || focus === 'both', rudOn = focus === 'rudder' || focus === 'both';
  const word = (on: boolean) => cx('whitespace-nowrap font-semibold tabular-nums', compact ? 'text-[11px]' : 'text-[13px]', on ? 'text-[#A9D2FF]' : 'text-[rgba(235,240,255,0.86)]');
  return (
    <Hud className={cx('pointer-events-none flex flex-col', compact ? 'gap-2 px-3 py-2.5' : 'gap-3 px-[18px] py-4')}
      role="img" aria-label={`Alfie's sticks: sail ${sailWords(sh).toLowerCase()}, rudder ${rudderWords(r).toLowerCase()}`}>
      <Cap className="!text-[10px] !text-[#8FC2FF]">Alfie's sticks</Cap>
      <div className={cx('flex items-end', compact ? 'gap-3' : 'gap-5')}>
        <div className="flex flex-col items-center gap-1.5" style={{ minWidth: compact ? 54 : 72 }}>
          {!compact && <span className="text-[11px]" style={{ color: C.mute }}>OUT</span>}
          <span className={lit(sailOn)} style={{ width: T, height: SH }}>
            <span className={knob} style={{ left: 4, width: K, height: K, top: 4 + sh * (SH - T) }} />
          </span>
          {!compact && <span className="text-[11px]" style={{ color: C.mute }}>IN</span>}
          <Cap className="!text-[10px]">Sail stick</Cap>
          <span className={word(sailOn)}>{sailWords(sh)}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className={lit(rudOn)} style={{ width: RW, height: T }}>
            <span className="absolute inset-y-1.5 w-0.5 bg-white/[0.14]" style={{ left: RW / 2 - 1 }} />
            <span className={knob} style={{ top: 4, width: K, height: K, left: RW / 2 - K / 2 + r * (RW / 2 - K / 2 - 4) }} />
          </span>
          {!compact && <span className="flex w-full justify-between text-[11px]" style={{ color: C.mute }}><span>LEFT</span><span>RIGHT</span></span>}
          <Cap className="!text-[10px]">Rudder stick</Cap>
          <span className={word(rudOn)}>{rudderWords(r)}</span>
        </div>
      </div>
    </Hud>
  );
}

/**
 * Alfie talking you through a drill as it's sailed for you: what the sticks are doing now, and why.
 * It sits where his coaching does when you sail yourself.
 */
export function DemoCard({ cue, onHide, compact }: { cue: DemoCue | null; onHide: () => void; compact?: boolean }) {
  if (!cue) return null;
  const stick = cue.stick === 'both' ? 'Both sticks' : cue.stick === 'rudder' ? 'Rudder stick' : cue.stick === 'sail' ? 'Sail stick' : null;
  return (
    <Hud className={cx('flex flex-col gap-3', compact ? 'px-4 py-3' : 'px-5 py-[18px]')} style={{ width: compact ? '100%' : 432 }}>
      <div className="flex items-center gap-2.5">
        <AlfieOrb size={compact ? 26 : 32} />
        <p className="m-0 text-[15px] font-semibold">Alfie is showing you</p>
        <span className="rounded-full bg-white/[0.07] px-2.5 py-[3px] text-xs font-semibold">{cue.topic}</span>
        <button type="button" onClick={onHide} className="ml-auto cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[12.5px] font-semibold text-[#A9D2FF] hover:bg-white/[0.06]">Hide</button>
      </div>
      <p className={cx('m-0 leading-[1.5]', compact ? 'text-[14px]' : 'text-[15px]')} aria-live="polite">{cue.text}</p>
      {stick && <p className="m-0 flex items-center gap-2 text-[12.5px] font-semibold text-[#A9D2FF]"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-[#4DA3FF] shadow-[0_0_8px_rgba(77,163,255,0.8)]" />Watch: {stick.toLowerCase()}</p>}
    </Hud>
  );
}

/**
 * Before Alfie sails a drill for you: what's being asked, how it's done, and what each stick does,
 * so you know what to look for. The demonstration waits behind it until you start it.
 */
export function WatchIntro({ title, group, brief, goal, tip, sticks, onStart, onBack, compact }: {
  title: string; group: string; brief: string; goal: string; tip: string;
  sticks?: { sail: string; rudder: string } | null; onStart: () => void; onBack: () => void; compact?: boolean;
}) {
  // The drill's advice, a step to a line.
  const steps = tip.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map(x => x.trim()).filter(Boolean);
  const row = (name: string, text: string, glyph: React.ReactNode) => (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
      <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(77,163,255,0.14)]">{glyph}</span>
      <p className="m-0 text-[14px] leading-[1.45]"><b className="text-[#A9D2FF]">{name}.</b> {text}</p>
    </div>
  );
  return (
    <Hud role="dialog" aria-modal="true" aria-label={`How to sail ${title}`} className={cx('flex max-h-full flex-col gap-4 overflow-y-auto', compact ? 'w-full px-5 py-5' : 'w-[600px] px-8 py-7')}>
      <div className="flex items-center gap-3">
        <AlfieOrb size={36} />
        <div className="min-w-0">
          <Cap>{group} · Alfie shows you how</Cap>
          <p className={cx('m-0 font-display font-bold leading-tight', compact ? 'text-[20px]' : 'text-[24px]')}>{title}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Cap>What's asked</Cap>
        <p className="m-0 text-[14.5px] leading-[1.5]">{brief} <b>{goal}.</b></p>
      </div>
      <div className="flex flex-col gap-2">
        <Cap>How it's done</Cap>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((x, i) => (
            <li key={x} className="flex items-start gap-2.5 text-[14.5px] leading-[1.45]">
              <span aria-hidden="true" className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold tabular-nums">{i + 1}</span>
              <span>{x}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-2">
        <Cap>On the sticks</Cap>
        {row('Sail stick', sticks?.sail ?? 'Down to sheet in, up to let the sail out. Right in upwind, out downwind.',
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none"><rect x="5" y="1" width="8" height="20" rx="4" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.18)" /><circle cx="9" cy="16" r="3.2" fill="#4DA3FF" /></svg>)}
        {row('Rudder stick', sticks?.rudder ?? 'Left and right to steer. Small, smooth movements: every big one is a brake.',
          <svg width="22" height="18" viewBox="0 0 22 18" fill="none"><rect x="1" y="5" width="20" height="8" rx="4" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.18)" /><circle cx="11" cy="9" r="3.2" fill="#4DA3FF" /></svg>)}
        <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>As he sails, Alfie's sticks show at the bottom of the screen, each with its position in words, and he says what he's doing and why. The stick he's talking about lights up. Pause at any time to read.</p>
      </div>
      <div className="flex flex-wrap gap-2.5 pt-1">
        <Btn primary onClick={onStart} autoFocus={!compact}>Watch Alfie sail it</Btn>
        <Btn onClick={onBack}>Back</Btn>
      </div>
    </Hud>
  );
}

// ───────────────────────── Rules moment ─────────────────────────
export function RulesMomentPanel({ inc, mine, otherSail, onContinue, onReplay, onLearn, compact }: {
  inc: Incident; mine: boolean; otherSail: string | null; onContinue: () => void; onReplay?: () => void; onLearn: () => void;
  /** On a phone: smaller, and as tall as the screen allows. */
  compact?: boolean;
}) {
  const rt = ruleText(inc.rule);
  const head = inc.kind === 'ocs' ? 'You were over the line at the gun'
    : mine ? `You broke Rule ${inc.rule}: ${inc.title.toLowerCase()}`
      : `${otherSail ?? 'A boat'} broke Rule ${inc.rule} against you`;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warn">Rules moment</Chip>
        <Chip>Rule {inc.rule} · {inc.title.toLowerCase()}</Chip>
      </div>
      <h2 className={cx('m-0 font-display font-bold leading-[1.2] tracking-[-0.02em]', compact ? 'text-[19px]' : 'text-[25px]')}>{head}</h2>
      <p className={cx('m-0 leading-[1.55]', compact ? 'text-[14px]' : 'text-[14.5px]')}>{inc.explanation}</p>
      {rt?.rc && (
        <div className="flex items-start gap-2.5 rounded-[14px] bg-white/[0.04] px-3.5 py-3">
          <InfoGlyph />
          <p className="m-0 text-[13.5px] leading-normal" style={{ color: C.mute }}>{rt.rc}</p>
        </div>
      )}
      {inc.kind !== 'ocs' && (
        <div className="flex flex-col gap-2.5 pt-1">
          <Cap>The ruling</Cap>
          <p className="m-0 text-[13.5px] leading-[1.45]">
            {mine ? <><b>You</b> take a One-Turn Penalty: as soon as you're clear of other boats, turn right round the same way, through one tack and one gybe.</> : <><b>{otherSail}</b> must take a One-Turn Penalty. You did nothing wrong{otherSail ? ` and hailed "Protest"` : ''}.</>}
          </p>
        </div>
      )}
      {inc.nextTime && (
        <div className="flex flex-col gap-1.5">
          <Cap className="flex items-center gap-2"><AlfieOrb size={18} />Alfie's tip for next time</Cap>
          <p className="m-0 text-[13.5px] leading-normal" style={{ color: C.mute }}>{inc.nextTime}</p>
        </div>
      )}
    </>
  );
  const buttons = (
    <div className="mt-auto flex flex-wrap gap-2.5">
      <Btn primary onClick={onContinue}>Carry on racing</Btn>
      {onReplay && (
        <Btn onClick={onReplay}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
          Watch replay
        </Btn>
      )}
      {rt && <Btn quiet onClick={onLearn}>Rule {rt.rule} in brief</Btn>}
    </div>
  );
  // On a phone the words scroll and the buttons stay in view below them.
  return compact ? (
    <Hud className="flex flex-col gap-3 overflow-hidden px-4 py-4" style={{ width: 'min(520px, 100%)', maxHeight: '100%' }}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{body}</div>
      {buttons}
    </Hud>
  ) : (
    <Hud className="flex flex-col gap-4 overflow-auto px-6 py-[22px]" style={{ width: 'min(464px, calc(100vw - 32px))', maxHeight: 'calc(100% - 44px)' }}>
      {body}
      {buttons}
    </Hud>
  );
}

export function RuleSheet({ rule, onClose }: { rule: string; onClose: () => void }) {
  const rt = ruleText(rule);
  if (!rt) return null;
  const pen = ruleText('44')!;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default border-0 bg-black/45" onClick={onClose} />
      <Hud className="relative flex max-h-full w-full max-w-[460px] flex-col gap-3.5 overflow-y-auto px-6 py-5" role="dialog" aria-label={`Rule ${rt.rule}`}>
        <Cap>Rule {rt.rule}</Cap>
        <h3 className="m-0 font-display text-[22px] font-bold">{rt.title}</h3>
        <p className="m-0 text-[14.5px] leading-[1.55]">{rt.text}</p>
        {rt.rc && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>{rt.rc}</p>}
        <div className="rounded-xl bg-white/[0.04] px-3.5 py-3">
          <p className="m-0 text-[13px] font-semibold">{pen.title}</p>
          <p className="m-0 mt-1 text-[13px] leading-normal" style={{ color: C.mute }}>{pen.text}</p>
        </div>
        <div className="flex justify-end"><Btn onClick={onClose}>Close</Btn></div>
      </Hud>
    </div>
  );
}

// ───────────────────────── Instant replay ─────────────────────────
export function ReplayBar({ back, max, playing, onStep, onToggle, onScrub, onExit }: {
  back: number; max: number; playing: boolean; onStep: (d: number) => void; onToggle: () => void; onScrub: (back: number) => void; onExit: () => void;
}) {
  const frac = 1 - back / Math.max(1, max);
  const barRef = useRef<HTMLDivElement>(null);
  const scrub = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect(); if (!r) return;
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onScrub(Math.round((1 - f) * max));
  };
  return (
    <Hud className="flex flex-col gap-2.5 px-[18px] py-3.5" style={{ width: 'min(720px, calc(100vw - 32px))' }}>
      <div className="flex items-center gap-3">
        <Btn icon small aria-label="Back one second" onClick={() => onStep(20)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
        </Btn>
        <Btn icon small aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={onToggle}>
          {playing
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>}
        </Btn>
        <Btn icon small aria-label="Forward one second" onClick={() => onStep(-20)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
        </Btn>
        <span className="text-[13px]" style={{ color: C.mute }}>Replay · {(back / 20).toFixed(1)} s ago</span>
        <Btn small className="ml-auto" onClick={onExit}>Back to the race</Btn>
      </div>
      <div ref={barRef} className="relative h-6 cursor-pointer touch-none" onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); scrub(e); }} onPointerMove={e => { if (e.buttons) scrub(e); }}>
        <span className="absolute inset-x-0 top-2.5 h-1 rounded bg-white/10" />
        <span className="absolute left-0 top-2.5 h-1 rounded bg-[#4DA3FF]" style={{ width: `${frac * 100}%` }} />
        <span className="absolute top-1 h-4 w-4 -translate-x-2 rounded-full bg-white" style={{ left: `${frac * 100}%` }} />
      </div>
    </Hud>
  );
}

// ───────────────────────── Toasts & banners ─────────────────────────
export interface Toast { id: number; text: string; tone: 'plain' | 'warn' | 'good' }

export function Toasts({ items, compact }: { items: Toast[]; compact?: boolean }) {
  return (
    <div className={cx('pointer-events-none flex flex-col items-center', compact ? 'gap-1.5' : 'gap-2')} aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={cx('rounded-full border font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-[10px]', compact ? 'px-3 py-1.5 text-center text-[12.5px]' : 'px-4 py-2 text-[13.5px]',
          t.tone === 'warn' ? 'border-[rgba(255,159,67,0.45)] bg-[rgba(60,32,8,0.88)] text-[#FFD7B0]'
            : t.tone === 'good' ? 'border-[rgba(52,211,153,0.4)] bg-[rgba(6,40,30,0.88)] text-[#A7F3D0]'
              : 'border-white/[0.12] bg-[rgba(7,13,27,0.88)] text-[#F1F4FA]')}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function HintBanner({ inc, mine, onOpen, onClose, compact }: { inc: Incident; mine: boolean; onOpen: () => void; onClose: () => void; compact?: boolean }) {
  return (
    <Hud className={cx('pointer-events-auto flex items-start', compact ? 'w-full max-w-[520px] gap-2.5 !rounded-[14px] px-3 py-2.5' : 'gap-3 px-4 py-3')} style={compact ? undefined : { width: 'min(560px, calc(100vw - 32px))' }}>
      <WarnGlyph />
      <div className="min-w-0 flex-1">
        <p className={cx('m-0 font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}>Rule {inc.rule}: {inc.title}</p>
        <p className={cx('m-0 mt-0.5 leading-[1.45]', compact ? 'line-clamp-2 text-[12px]' : 'text-[13px]')} style={{ color: C.mute }}>{inc.kind === 'ocs' ? (mine ? 'Recall: sail back below the line and start again. ' : '') : mine ? 'You owe a One-Turn Penalty: when you\'re clear, turn right round through a tack and a gybe. ' : 'The other boat owes a penalty. '}{inc.nextTime ?? ''}</p>
      </div>
      {/* On a phone held upright the buttons stack, leaving the words room. */}
      <div className={cx('flex shrink-0', compact ? 'flex-col items-end gap-1.5 min-[480px]:flex-row min-[480px]:items-center' : 'items-center gap-3')}>
        <Btn small onClick={onOpen}>Explain</Btn>
        <Btn small icon aria-label="Dismiss" onClick={onClose}>✕</Btn>
      </div>
    </Hud>
  );
}

// ───────────────────────── Results ─────────────────────────
export interface ResultRowView { id: string; place: number; sail: string; name: string; color: string; time: string; isPlayer: boolean }

export function ResultsOverlay({ rows, title, onDebrief, onAgain, onHome, live }: { rows: ResultRowView[]; title: string; onDebrief: () => void; onAgain: () => void; onHome: () => void; live: boolean }) {
  return (
    <Hud className="flex flex-col gap-4 px-6 py-5" style={{ width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100% - 48px)' }} role="dialog" aria-label="Results">
      <div className="flex items-center gap-2.5">
        <h2 className="m-0 font-display text-[24px] font-bold">{title}</h2>
        {live && <Chip className="ml-auto">Others still racing</Chip>}
      </div>
      <div className="min-h-0 overflow-y-auto">
        {rows.map(r => (
          <div key={r.id} className={cx('grid grid-cols-[28px_10px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2.5 py-2', r.isPlayer && 'bg-white/[0.06]')}>
            <span className="font-display text-[15px] font-bold tabular-nums">{r.place}</span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
            <span className="truncate text-[13.5px]"><b>{r.sail}</b> <span style={{ color: C.mute }}>{r.name}</span></span>
            <span className="text-[13px] tabular-nums" style={{ color: C.mute }}>{r.time}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Btn primary onClick={onDebrief}>See the debrief</Btn>
        <Btn onClick={onAgain}>Race again</Btn>
        <Btn quiet onClick={onHome}>Simulator home</Btn>
      </div>
    </Hud>
  );
}

// ───────────────────────── Drills, lessons and lab moments ─────────────────────────
export function GoalCard({ group, title, goal, progress, timeLeft, watching, compact }: {
  group: string; title: string; goal: string; progress: string | null; timeLeft: number | null; watching: boolean; compact?: boolean;
}) {
  return (
    <Hud className={cx('flex flex-col gap-1.5', compact ? 'px-3.5 py-2.5' : 'px-[18px] py-3.5')} style={{ width: compact ? '100%' : 300 }}>
      <div className="flex items-center gap-2">
        <Cap>{group}</Cap>
        {watching && <Chip tone="blue" className="ml-auto !h-[22px]">Watching the right way</Chip>}
      </div>
      <p className="m-0 text-[15px] font-semibold leading-snug">{title}</p>
      <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>{goal}</p>
      {(progress || timeLeft !== null) && (
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-[13px]">
          {progress && <span className="font-semibold">{progress}</span>}
          {timeLeft !== null && <span className="ml-auto tabular-nums" style={{ color: C.mute }}>{Math.max(0, Math.ceil(timeLeft))} s left</span>}
        </div>
      )}
    </Hud>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map(i => (
        <svg key={i} width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill={i < n ? '#FFC94A' : 'rgba(255,255,255,0.12)'} stroke={i < n ? '#FFDD87' : 'rgba(255,255,255,0.2)'} strokeWidth={1} strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

export function SceneResult({ pass, title, text, stars, best, watching, onAgain, onWatch, onNext, nextLabel, onBack, backLabel, onRule, rule, onReplay }: {
  pass: boolean; title: string; text: string; stars?: number; best?: string | null; watching: boolean;
  onAgain: () => void; onWatch?: () => void; onNext?: () => void; nextLabel?: string; onBack: () => void; backLabel: string;
  onRule?: () => void; rule?: string;
  /** Replay the last 10 s, from a button here (on a phone, where there's no room for one underneath). */
  onReplay?: () => void;
}) {
  return (
    <Hud className="flex flex-col gap-4 overflow-y-auto px-6 py-5" style={{ width: 'min(480px, calc(100vw - 32px))', maxHeight: 'calc(100% - 48px)' }} role="dialog" aria-label={title}>
      <div className="flex items-center gap-3">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', pass ? 'bg-[rgba(52,211,153,0.16)] text-[#6EE7B7]' : 'bg-[rgba(255,159,67,0.16)] text-[#FFCB96]')}>
          {pass
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 16.5v.01" /></svg>}
        </span>
        <div className="min-w-0">
          <Cap>{watching ? 'The right way' : pass ? 'Done' : 'Not this time'}</Cap>
          <h2 className="m-0 mt-0.5 font-display text-[22px] font-bold leading-tight">{title}</h2>
        </div>
      </div>
      {stars !== undefined && stars > 0 && <div className="flex items-center gap-3"><Stars n={stars} />{best && <span className="text-[13px]" style={{ color: C.mute }}>Your best: {best}</span>}</div>}
      <p className="m-0 text-[14.5px] leading-[1.55]">{text}</p>
      <div className="flex flex-wrap gap-2.5">
        <Btn primary onClick={onAgain}>{watching ? 'Now you try' : 'Try again'}</Btn>
        {onWatch && !watching && <Btn onClick={onWatch}>Watch the right way</Btn>}
        {onNext && <Btn onClick={onNext}>{nextLabel ?? 'Next'}</Btn>}
        {onRule && rule && <Btn quiet onClick={onRule}>Rule {rule} in brief</Btn>}
        {onReplay && <Btn quiet onClick={onReplay}>Replay the last 10 s</Btn>}
        <Btn quiet onClick={onBack}>{backLabel}</Btn>
      </div>
    </Hud>
  );
}
