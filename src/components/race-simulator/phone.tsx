// The race screen on a phone. Everything sits round the edges so the water stays clear: the clock,
// the wind and Alfie along the top, the course map in the corner (tap it for the course and the
// fleet), the sail under your left thumb and the rudder under your right, as on a transmitter.
// Presentational only: SimRace owns the state.
import React, { useEffect, useRef, useState } from 'react';
import type { Race } from '@/sim/engine';
import type { BankCam } from './bank';
import type { CoachMode, Cue } from './coach';
import CourseMap from './CourseMap';
import { CourseCard, FleetCard, LineCard, SticksView, type HudState, type PenaltyProgress } from './hud';
import { compassPoint, shiftWords } from './windWords';
import type { DemoCue } from './demoTalk';
import { SAILING_CLEAR } from './coach';
import { SAFE } from './phoneLayout';
import { AlfieOrb, Btn, C, Cap, Chip, Hud, Seg, clock, cx, ordinal } from './ui';

const below = (px: number) => `calc(${SAFE.top} + ${px}px)`;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A little expo, as on a transmitter: fine control round the middle, full lock at the end. */
const expo = (x: number) => x * (0.35 + 0.65 * Math.abs(x));

// The first few races on a phone show how the sticks work, until you've used them.
const TIPS_KEY = 'race-sim-phone-tips';
function tipsSeen(): boolean { try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } }
function markTipsSeen() { try { localStorage.setItem(TIPS_KEY, '1'); } catch { /* storage unavailable */ } }

// ───────────────────────── Small parts ─────────────────────────

const glass = 'border border-white/[0.1] bg-[rgba(7,13,27,0.8)] shadow-[0_8px_20px_rgba(0,0,0,0.32)] backdrop-blur-[12px]';

function RoundBtn({ label, size = 46, round, className, style, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; size?: number; round?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx('pointer-events-auto inline-flex shrink-0 cursor-pointer select-none items-center justify-center text-[13.5px] font-semibold text-[#F1F4FA] active:bg-[rgba(42,80,140,0.9)]', glass, className)}
      // The corner radius is set here, not as a class: the app's Alfie theme turns a row of
      // rounded-full buttons (Hail and Tack) into a segmented control.
      style={{ width: size, height: size, borderRadius: round ? 9999 : 14, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

const PauseGlyph = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
const MenuGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;

function ClockChip({ hud, scene, narrow }: { hud: HudState; scene: boolean; narrow: boolean }) {
  const pre = hud.preStart;
  const c = hud.course;
  const leg = `Leg ${Math.min(c.legNo, c.legs)}/${c.legs}`;
  const label = pre ? 'Start in' : hud.finished ? 'Finished' : scene ? 'Racing' : narrow ? `${ordinal(c.place)} · ${leg}` : `${ordinal(c.place)} of ${c.of} · ${leg}`;
  return (
    <Hud className={cx('pointer-events-none flex shrink-0 flex-col items-center justify-center !rounded-[14px]', narrow ? 'h-10 px-2' : 'h-[46px] px-3')}>
      <span className="whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.mute }}>{label}</span>
      <span className={cx('font-display font-bold leading-[1.1] tabular-nums', narrow ? 'text-[18px]' : 'text-[21px]', pre && hud.T <= 10 && 'text-[#FFCB96]')}>{pre ? clock(Math.ceil(hud.T)) : clock(hud.raceT)}</span>
    </Hud>
  );
}

function WindChip({ kn, from, off, tack, narrow }: HudState['wind'] & { narrow: boolean }) {
  // Where the wind is against its average, and what that means for the tack you're on.
  const sw = shiftWords(off, tack);
  const n = Math.round(Math.abs(off));
  const short = n < 3 ? 'Average' : tack ? `${sw.tone === 'good' ? 'Lifted' : 'Headed'} ${n}°` : `${off < 0 ? 'Left' : 'Right'} ${n}°`;
  const colour = sw.tone === 'good' ? '#7EE2A8' : sw.tone === 'warn' ? '#FFCB96' : C.mute;
  return (
    <Hud className={cx('pointer-events-none flex shrink-0 items-center !rounded-[14px]', narrow ? 'h-10 px-2.5' : 'h-[46px] px-3')} title={`Wind from the ${compassPoint(from)}, ${sw.where.toLowerCase()}. ${sw.means}.`}>
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-display text-[17px] font-bold tabular-nums">{kn.toFixed(1)}<span className="ml-0.5 text-[11px] font-semibold" style={{ color: C.mute }}>kn {compassPoint(from)}</span></span>
        {!narrow && <span className="mt-1 whitespace-nowrap text-[10.5px] font-semibold" style={{ color: colour }}>{short}</span>}
      </span>
    </Hud>
  );
}

function MapButton({ race, cam, w, h, onOpen }: { race: Race; cam: BankCam | null; w: number; h: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Course and fleet" className={cx('pointer-events-auto shrink-0 cursor-pointer rounded-[14px] p-1', glass)}>
      <CourseMap race={race} width={w} height={h} cam={cam} />
    </button>
  );
}

/** Alfie in a line or two along the top: tap for all of it. */
function Ticker({ cue, coach, open, onToggle, onHide, long }: { cue: Cue; coach: CoachMode; open: boolean; onToggle: () => void; onHide: () => void; /** A demonstration's lines are longer: give them room. */ long?: boolean }) {
  const watch = cue.watch && coach === 'full' ? cue.watch : null;
  return (
    <Hud className="pointer-events-auto flex w-full min-w-0 items-start gap-1 !rounded-[14px] py-1.5 pl-2 pr-1.5">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 border-0 bg-transparent p-0 py-0.5 text-left text-[#F1F4FA]">
        <AlfieOrb size={22} />
        <span className="min-w-0 flex-1">
          <span className="sr-only">Alfie: </span>
          <span aria-live="polite" className={cx('block text-[12.5px] leading-[1.35]', !open && (watch ? 'truncate' : long ? 'line-clamp-5' : 'line-clamp-2'), cue.tone === 'warn' && 'text-[#FFD7B0]')}>{cue.text}</span>
          {watch && <span className={cx('mt-0.5 block text-[12px] leading-[1.35] text-[#FFD7B0]', !open && 'truncate')}><b>Rule watch.</b> {watch}</span>}
        </span>
      </button>
      {open && <button type="button" onClick={onHide} className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-[12px] font-semibold text-[#A9D2FF]">Hide</button>}
    </Hud>
  );
}

/** A drill, lesson or lab moment: its title and how you're doing, and the whole goal on a tap. */
function GoalChip({ group, title, goal, progress, timeLeft, watching }: { group: string; title: string; goal: string; progress: string | null; timeLeft: number | null; watching: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Hud className="pointer-events-auto max-w-full !rounded-[14px]">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex max-w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent px-3 py-1.5 text-left text-[#F1F4FA]">
        <span className="flex max-w-full items-center gap-2 whitespace-nowrap text-[12.5px]">
          <span className="min-w-0 truncate font-semibold">{title}</span>
          {watching && <Chip tone="blue" className="!h-5 !px-2 !text-[11px]">Watching</Chip>}
          {progress && <span className="font-semibold text-[#A9D2FF]">{progress}</span>}
          {timeLeft !== null && <span className="tabular-nums" style={{ color: C.mute }}>{Math.max(0, Math.ceil(timeLeft))} s left</span>}
        </span>
        {open && <span className="whitespace-normal text-[12px] leading-snug" style={{ color: C.mute }}><b>{group}.</b> {goal}</span>}
      </button>
    </Hud>
  );
}

function TurnHint() {
  return (
    <Hud className="pointer-events-none flex items-center gap-2 !rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CCBFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M20 9a8 8 0 01-3 9M4 15a8 8 0 013-9" /></svg>
      Turn your phone sideways for a wider view
    </Hud>
  );
}

/** Your boat in one line: tack, how she's sailing and her speed. Before the start, the line. */
function BoatChip({ hud, autoTrim }: { hud: HudState; autoTrim: boolean }) {
  const b = hud.boat, li = hud.preStart ? hud.line : null;
  const stbd = b.tack === 'Starboard';
  const advice = !autoTrim && !li && !hud.finished && b.trim !== 'Trim: good' ? b.trim.replace(/^Trim: /, '') : null;
  return (
    <Hud className="pointer-events-none flex max-w-full flex-col items-center !rounded-[16px] px-3 py-1.5">
      {/* Each part stays whole; on a narrow phone the last part drops to a second line. */}
      <span className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[12.5px] [&>span]:whitespace-nowrap">
        <span className={cx('rounded-full px-2 py-0.5 text-[11.5px] font-bold', stbd ? 'bg-[rgba(42,147,255,0.16)] text-[#A9D2FF]' : 'bg-[rgba(255,159,67,0.16)] text-[#FFCB96]')}>{b.tack}</span>
        {li ? (
          <>
            <span className={cx(li.belowL < 0 && 'font-semibold text-[#FFB4B4]')}>{li.belowL < 0 ? `Over the line by ${Math.abs(li.belowL).toFixed(1)} lengths` : `${li.belowL.toFixed(1)} lengths below the line`}</span>
            {li.ttl !== null && li.belowL >= 0 && <span style={{ color: C.mute }}>· {li.ttl.toFixed(1)} s to the line</span>}
          </>
        ) : hud.finished ? (
          <span>{SAILING_CLEAR}</span>
        ) : (
          <>
            <span>{b.pos}</span>
            <span><span style={{ color: C.mute }}>·</span> <b>{Math.round(b.spdPct * 100)}%</b> <span style={{ color: C.mute }}>{b.kn.toFixed(1)} kn</span></span>
          </>
        )}
      </span>
      {advice && <span className="text-[11.5px]" style={{ color: C.mute }}>{advice}</span>}
    </Hud>
  );
}

function PenaltyChip({ owed, deg, tack, gybe }: PenaltyProgress) {
  const f = Math.min(1, deg / 360), R = 7.5, len = 2 * Math.PI * R;
  const tick = (done: boolean, text: string) => <span className={done ? 'text-[#A7F3D0]' : 'text-[rgba(235,240,255,0.6)]'}>{done ? '✓' : '○'} {text}</span>;
  return (
    <Hud role="status" aria-label={`Penalty turn: ${Math.round(deg)} degrees, tack ${tack ? 'done' : 'to do'}, gybe ${gybe ? 'done' : 'to do'}`} className="pointer-events-none flex items-center gap-2 whitespace-nowrap !rounded-full !border-[rgba(255,159,67,0.4)] py-1 pl-1.5 pr-3 text-[12px] font-semibold">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle cx="10" cy="10" r={R} fill="none" stroke="#FFB061" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${len * f} ${len}`} transform="rotate(-90 10 10)" />
      </svg>
      <span className="text-[#FFD7B0]">{owed > 1 ? `${owed} penalty turns` : 'Penalty turn'}</span>
      {tick(tack, 'Tack')}{tick(gybe, 'Gybe')}
    </Hud>
  );
}

// ───────────────────────── The sticks ─────────────────────────

/**
 * The sail under your left thumb: put it down anywhere on it and slide up to ease her out, down to
 * sheet in. The knob moves with your thumb, and stays where you leave it.
 */
export function ThumbSail({ sheet, onSheet, zoneH, trackH, tip, onTouch }: { sheet: number; onSheet: (v: number) => void; zoneH: number; trackH: number; tip: boolean; onTouch: () => void }) {
  const drag = useRef<{ id: number; y: number; v: number } | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const travel = trackH - 40;
  const v = held ?? sheet;
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // The latest thumb on it has it, so a finger resting on the screen can't hold it.
    drag.current = { id: e.pointerId, y: e.clientY, v };
    setHeld(v); onTouch();
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const nv = clamp(d.v + (e.clientY - d.y) / travel, 0, 1);
    setHeld(nv); onSheet(nv);
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null; setHeld(null);
  };
  return (
    <div
      role="slider" aria-label="Sail" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      aria-valuetext={v > 0.95 ? 'Sheeted right in' : v < 0.05 ? 'Eased right out' : `${Math.round(v * 100)}% sheeted in`}
      className="pointer-events-auto relative shrink-0 touch-none select-none" style={{ width: 96, height: zoneH }}
      onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    >
      {tip && <span className="pointer-events-none absolute left-[54px] w-[112px] text-[11px] font-semibold leading-tight text-[#A9D2FF] [text-shadow:0_1px_3px_rgba(6,11,22,0.9)]" style={{ bottom: 18 + trackH / 2 }}>Slide up to ease the sail, down to sheet in</span>}
      <div className="absolute bottom-0 left-0 flex flex-col items-start gap-1">
        <span className="w-11 text-center text-[10px] font-semibold" style={{ color: C.mute }}>OUT</span>
        <span className={cx('relative block rounded-[22px]', glass, held !== null && '!border-[rgba(77,163,255,0.7)]')} style={{ width: 44, height: trackH }}>
          <span className="absolute left-[4px] h-[34px] w-[34px] rounded-full bg-[#E9EEF8] shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ top: 2 + v * travel }} />
        </span>
        <span className="w-11 text-center text-[10px] font-semibold" style={{ color: C.mute }}>IN</span>
      </div>
    </div>
  );
}

/**
 * The rudder under your right thumb: put it down anywhere on it and slide left or right. Where your
 * thumb lands is the middle, so landing a little off doesn't turn her; let go and it centres, like a
 * transmitter's rudder stick.
 */
export function ThumbRudder({ rudder, onRudder, onRudderEnd, zoneW, zoneH, tip, onTouch }: { rudder: number; onRudder: (v: number) => void; onRudderEnd: () => void; zoneW: number; zoneH: number; tip: boolean; onTouch: () => void }) {
  const drag = useRef<{ id: number; x: number } | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const reach = Math.min(90, zoneW / 2 - 24);
  const v = held ?? rudder;
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX };
    setHeld(0); onRudder(0); onTouch();
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const r = expo(clamp((e.clientX - d.x) / reach, -1, 1));
    setHeld(r); onRudder(r);
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null; setHeld(null); onRudderEnd();
  };
  return (
    <div
      role="slider" aria-label="Rudder" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      className="pointer-events-auto relative shrink-0 touch-none select-none" style={{ width: zoneW, height: zoneH }}
      onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    >
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1">
        {tip && <span className="text-center text-[11px] font-semibold leading-tight text-[#A9D2FF] [text-shadow:0_1px_3px_rgba(6,11,22,0.9)]">Slide left and right to steer</span>}
        <span className={cx('relative block rounded-[22px]', glass, held !== null && '!border-[rgba(77,163,255,0.7)]')} style={{ width: zoneW, height: 44 }}>
          <span className="absolute inset-y-[7px] w-0.5 bg-white/[0.16]" style={{ left: zoneW / 2 - 1 }} />
          <span className="absolute top-[4px] h-[34px] w-[34px] rounded-full bg-[#E9EEF8] shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ left: zoneW / 2 - 17 + v * (zoneW / 2 - 22) }} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.mute }}>Rudder</span>
      </div>
    </div>
  );
}

// ───────────────────────── The layout ─────────────────────────

export interface PhoneHudProps {
  hud: HudState;
  race: Race;
  /** The screen's size in CSS pixels. */
  w: number; h: number;
  /** The bank view's camera, for the wedge you can see on the map (null in the top view). */
  cam: BankCam | null;
  /** A drill, lesson or lab moment, and its goal. */
  scene: { group: string; title: string; goal: string } | null;
  watching: boolean;
  /** Alfie's tip, while he's coaching. */
  cue: Cue | null; coach: CoachMode; onHideCoach: () => void;
  /** Live-race notes, toasts and the rules banner: under the top row. */
  notices: React.ReactNode;
  /** The top-left button: pause and the menu (in a live race, which never stops, just the menu). */
  live: boolean; onMenu: () => void;
  onCourse: () => void;
  view: 'bank' | 'top';
  glance: boolean; onGlance: (v: boolean) => void;
  follow: boolean; onFollow: () => void;
  /** The sticks (none while a scene is sailed for you to watch, or during a replay). */
  sticks: null | { onRudder: (v: number) => void; onRudderEnd: () => void; onSheet: (v: number) => void; onTack: () => void; onHail: () => void; tackLabel: string };
  /** Watching a drill sailed the right way: show the sticks as Alfie works them. */
  watchSticks?: boolean;
  /** The bottom row at all (not during a replay, which has its own bar there). */
  bottom: boolean;
  autoTrim: boolean;
  /** The map credit for a real venue (the corner it usually sits in has the rudder in it). */
  credit: string | null;
}

export function PhoneHud({ hud, race, w, h, cam, scene, watching, cue, coach, onHideCoach, notices, live, onMenu, onCourse, view, glance, onGlance, follow, onFollow, sticks, watchSticks, bottom, autoTrim, credit }: PhoneHudProps) {
  const portrait = h > w;
  const [open, setOpen] = useState(false);
  // Turned upright: suggest turning it sideways, for a while.
  const [turn, setTurn] = useState(false);
  useEffect(() => {
    if (!portrait) { setTurn(false); return; }
    setTurn(true);
    const id = window.setTimeout(() => setTurn(false), 8000);
    return () => window.clearTimeout(id);
  }, [portrait]);
  // How the sticks work, until you've used them (or for the first quarter of a minute).
  const [tips, setTips] = useState(() => !tipsSeen());
  useEffect(() => {
    if (!tips) return;
    const id = window.setTimeout(() => setTips(false), 15000);
    return () => window.clearTimeout(id);
  }, [tips]);
  const touched = () => { if (tips) { setTips(false); markTipsSeen(); } };

  // A small phone held upright (an older iPhone SE): everything along the top a size smaller.
  const narrow = w < 350;
  const row = narrow ? 40 : 46;
  const mapW = narrow ? 46 : portrait ? 64 : 104, mapH = narrow ? 46 : portrait ? 64 : 78;
  const boxW = mapW + 10, boxH = mapH + 10;
  const sailZoneH = Math.round(clamp(h * (portrait ? 0.4 : 0.6), 150, 300));
  const trackH = Math.round(clamp(h * (portrait ? 0.24 : 0.4), 112, 170));
  const rudW = Math.round(portrait ? clamp(w * 0.56, 190, 250) : clamp(w * 0.34, 210, 300));
  const rudZoneH = 84, btnRow = 58;

  const ticker = cue && coach !== 'off' ? <Ticker cue={cue} coach={coach} open={open} onToggle={() => setOpen(v => !v)} onHide={onHideCoach} long={watching} /> : null;
  const chips = (
    <>
      {hud.penalty && <PenaltyChip {...hud.penalty} />}
      <BoatChip hud={hud} autoTrim={autoTrim} />
      {credit && <span className="pointer-events-none whitespace-nowrap text-[10px] font-medium leading-none text-[rgba(235,240,255,0.62)] [text-shadow:0_1px_2px_rgba(6,11,22,0.8)]">{credit}</span>}
    </>
  );

  return (
    <>
      {/* The sticks and your boat, along the bottom (first, so everything else sits on top of them). */}
      {bottom && portrait && (
        <div className="pointer-events-none absolute flex flex-col items-center gap-1.5" style={{ left: sticks ? `calc(${SAFE.left} + 54px)` : SAFE.left, right: SAFE.right, bottom: `calc(${SAFE.bottom} + ${sticks ? rudZoneH + btnRow + 20 : watchSticks ? 176 : 0}px)` }}>{chips}</div>
      )}
      {bottom && (
        <div className="pointer-events-none absolute flex items-end gap-2" style={{ left: SAFE.left, right: SAFE.right, bottom: SAFE.bottom }}>
          {sticks && <ThumbSail sheet={hud.sheet} onSheet={sticks.onSheet} zoneH={sailZoneH} trackH={trackH} tip={tips} onTouch={touched} />}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">{!portrait && chips}</div>
          {sticks && (
            <div className="pointer-events-none flex shrink-0 flex-col items-end gap-2" style={{ width: rudW }}>
              <div className="flex items-center gap-2.5">
                <RoundBtn round size={50} onClick={sticks.onHail}>Hail</RoundBtn>
                <RoundBtn round size={btnRow} onClick={sticks.onTack}>{sticks.tackLabel}</RoundBtn>
              </div>
              <ThumbRudder rudder={hud.rudder} onRudder={sticks.onRudder} onRudderEnd={sticks.onRudderEnd} zoneW={rudW} zoneH={rudZoneH} tip={tips} onTouch={touched} />
            </div>
          )}
          {!sticks && watchSticks && <div className="shrink-0"><SticksView compact rudder={hud.rudder} sheet={hud.sheet} focus={cue && 'stick' in cue ? (cue as DemoCue).stick : null} /></div>}
        </div>
      )}

      {!bottom && credit && (
        <span className="pointer-events-none absolute whitespace-nowrap text-[10px] font-medium text-[rgba(235,240,255,0.62)] [text-shadow:0_1px_2px_rgba(6,11,22,0.8)]" style={{ right: SAFE.right, bottom: `calc(${SAFE.bottom} + 100px)` }}>{credit}</span>
      )}

      {/* Along the top: the menu, the clock, the wind, Alfie and the map. */}
      <div className={cx('pointer-events-none absolute flex items-start', narrow ? 'gap-1.5' : 'gap-2')} style={{ top: SAFE.top, left: SAFE.left, right: SAFE.right, zIndex: open ? 1 : undefined }}>
        <RoundBtn label={live ? 'Menu' : 'Pause and menu'} size={row} onClick={onMenu}>{live ? <MenuGlyph /> : <PauseGlyph />}</RoundBtn>
        <ClockChip hud={hud} scene={!!scene} narrow={narrow} />
        <WindChip {...hud.wind} narrow={narrow} />
        <div className="flex min-w-0 flex-1">{!portrait && ticker}</div>
        <MapButton race={race} cam={cam} w={mapW} h={mapH} onOpen={onCourse} />
      </div>

      {/* Under it: Alfie when upright, the goal, live-race notes, toasts and the rules banner. */}
      <div className="pointer-events-none absolute flex flex-col items-center gap-2" style={{ top: below(row + 8), left: SAFE.left, right: `calc(${SAFE.right} + ${boxW + 8}px)` }}>
        {portrait && ticker && <div className="flex self-stretch">{ticker}</div>}
        {scene && <GoalChip group={scene.group} title={scene.title} goal={scene.goal} progress={hud.goal?.progress ?? null} timeLeft={hud.preStart ? null : hud.goal?.timeLeft ?? null} watching={watching} />}
        {turn && <TurnHint />}
        {notices}
      </div>

      {/* Under the map: look at the next mark (bank view), or the whole course (top view). */}
      <div className="absolute" style={{ top: below(boxH + 8), right: SAFE.right }}>
        {view === 'bank' ? (
          <RoundBtn label="Look at the next mark (hold)" size={row} aria-pressed={glance} className={glance ? '!bg-[rgba(42,80,140,0.9)]' : ''}
            onPointerDown={() => onGlance(true)} onPointerUp={() => onGlance(false)} onPointerLeave={() => onGlance(false)} onPointerCancel={() => onGlance(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </RoundBtn>
        ) : (
          <RoundBtn label={follow ? 'Show the whole course' : 'Follow my boat'} size={row} aria-pressed={!follow} onClick={onFollow} className={!follow ? '!bg-[rgba(42,80,140,0.9)]' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </RoundBtn>
        )}
      </div>
    </>
  );
}

// ───────────────────────── Course and fleet ─────────────────────────

/** The course map, the line or your leg, and the fleet: over the water, from the map in the corner. */
export function CourseSheet({ race, hud, cam, portrait, onClose }: { race: Race; hud: HudState; cam: BankCam | null; portrait: boolean; onClose: () => void }) {
  const map = <CourseMap race={race} width={240} height={portrait ? 190 : 150} cam={cam} />;
  return (
    <div className={cx('absolute inset-0 flex', portrait ? 'items-end' : 'justify-end')}>
      <button type="button" aria-label="Close the course and fleet" className="absolute inset-0 cursor-default border-0 bg-black/45" onClick={onClose} />
      {/* Sideways: a drawer from the right, the course beside the fleet. Upright: a sheet from the bottom. */}
      <div role="dialog" aria-label="Course and fleet"
        className={cx('relative flex flex-col gap-3 border-white/[0.08] bg-[rgba(6,11,22,0.95)] shadow-[0_0_40px_rgba(0,0,0,0.5)]', portrait ? 'max-h-[86%] w-full rounded-t-[22px] border-t' : 'h-full border-l')}
        style={{ paddingTop: portrait ? 14 : SAFE.top, paddingBottom: SAFE.bottom, paddingLeft: portrait ? SAFE.left : 14, paddingRight: SAFE.right }}>
        <div className="flex items-center gap-2">
          <p className="m-0 flex-1 text-[15px] font-semibold">Course and fleet</p>
          <Btn small onClick={onClose}>Close</Btn>
        </div>
        <div className={cx('flex min-h-0 gap-3', portrait ? 'flex-col items-center overflow-y-auto' : 'flex-1')}>
          <div className={cx('shrink-0', !portrait && 'min-h-0 overflow-y-auto')}>{hud.line ? <LineCard line={hud.line} map={map} /> : <CourseCard {...hud.course} map={map} />}</div>
          <div className={cx('flex shrink-0', !portrait && 'min-h-0')}><FleetCard rows={hud.fleet} preStart={hud.preStart} /></div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Pause and menu ─────────────────────────

/** Pause (or, in a live race, which never stops, just the menu): everything the desktop's top bar has. */
export function PhoneMenu({ title, sub, room, paused, onResume, onReplay, view, onView, coach, onCoach, muted, onMute, fast, onFast, laylines, onLaylines, full, onFull, onPad, onRestart, onHome, homeLabel }: {
  title: string; sub: string; room: string | null; paused: boolean;
  onResume: () => void; onReplay?: () => void;
  view: 'bank' | 'top'; onView: (v: 'bank' | 'top') => void;
  coach: CoachMode; onCoach: (m: CoachMode) => void;
  muted: boolean; onMute: () => void;
  /** Speed up (not in a live race). */
  fast: boolean | null; onFast: () => void;
  /** Laylines (the top view). */
  laylines: boolean | null; onLaylines: () => void;
  /** Full screen, where the browser has it. */
  full: boolean | null; onFull: () => void;
  onPad: () => void; onRestart?: () => void; onHome: () => void; homeLabel: string;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40" style={{ padding: `${SAFE.top} ${SAFE.right} ${SAFE.bottom} ${SAFE.left}` }}>
      <Hud className="flex max-h-full w-full max-w-[560px] flex-col gap-3.5 overflow-y-auto px-4 py-4" role="dialog" aria-label={paused ? 'Paused' : 'Menu'}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 font-display text-[20px] font-bold leading-tight">{paused ? 'Paused' : title}</p>
            <p className="m-0 mt-0.5 line-clamp-2 text-[12.5px] leading-snug" style={{ color: C.mute }}>{paused ? `${title} · ${sub}` : sub}</p>
          </div>
          {room && <Chip tone="blue">Room {room}</Chip>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn primary onClick={onResume}>{paused ? 'Resume' : 'Back to the race'}</Btn>
          {onReplay && <Btn onClick={onReplay}>Replay the last 10 s</Btn>}
        </div>
        <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Cap>View</Cap>
            <Seg size="sm" label="View" value={view} onChange={onView} options={[{ value: 'bank', label: 'From the bank' }, { value: 'top', label: 'From above' }]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Cap className="flex items-center gap-1.5"><AlfieOrb size={16} />Alfie's coaching</Cap>
            <Seg size="sm" label="Alfie's coaching" value={coach} onChange={onCoach} options={[{ value: 'full', label: 'Full' }, { value: 'hints', label: 'Hints' }, { value: 'off', label: 'Off' }]} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn small aria-pressed={!muted} onClick={onMute}>{muted ? 'Sound off' : 'Sound on'}</Btn>
          {fast !== null && <Btn small aria-pressed={fast} onClick={onFast}>{fast ? 'Speed 2.5×' : 'Speed 1×'}</Btn>}
          {laylines !== null && <Btn small aria-pressed={laylines} onClick={onLaylines}>{laylines ? 'Laylines on' : 'Laylines off'}</Btn>}
          {full !== null && <Btn small aria-pressed={full} onClick={onFull}>{full ? 'Leave full screen' : 'Full screen'}</Btn>}
          <Btn small onClick={onPad}>Transmitter</Btn>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
          {onRestart && <Btn onClick={onRestart}>Restart</Btn>}
          <Btn quiet onClick={onHome}>{homeLabel}</Btn>
        </div>
      </Hud>
    </div>
  );
}
