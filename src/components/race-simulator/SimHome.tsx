// Simulator home: set up a quick race, open the Start Trainer, Rules Academy or Scenario Lab, and
// see your skipper profile (kept on this device for now).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, LogOut } from 'lucide-react';
import type { ClassId } from '@/sim/classes';
import type { SkipperLevel } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import type { CourseLength } from '@/sim/course';
import type { CoachMode } from './coach';
import type { SeaKind } from '@/sim/sea';
import { LAB, FIRST, nextFirst } from '@/sim/training';
import { Profile, clearProfile, skills } from './profile';
import { TrainingProgress, drillStars, licence, type Way } from './progress';
import type { SimView } from './SimRace';
import { AlfieOrb, Btn, C, Cap, Chip, Seg, Tile, compassName, cx, ordinal } from './ui';
import { BUILT_IN, DEFAULT_VENUE, VENUES, venueForClub } from '@/sim/venues';
import { windAt, windsOf } from '@/sim/venue';
import type { VenueWind as TodayWind } from './venueWind';
import { RaceAudio } from './audio';
import VenuePick from './VenuePick';
import { PLAYS, practiceLink } from './playbook';
import { offerFirstSail } from './plan';
import { nextUp } from './nextup';
import { learnPath } from './learn';
import { SYLLABUS, levelLicence, weekPlan } from './programme';
import { LEVEL_NAME, cleanSailing, levelName, standing } from './rating';
import { HELP_WORDS, type Comfort } from './comfort';
import { Brand, ComfortCard, DOOR_NAME, DoorBack, DoorCard, LearnCard, LevelCard, LicenceCard, NextUpCard, StartAgain, SetupChips, WayAsk, WaySwitch, WayToggle, WeekCard, type Door } from './SimDoors';
import { CAUSE_WORDS } from './ledger';
import { dayState, seasonOf, type Career } from './career';
import { MedalShelf } from './SimCareer';
import { focusWords, raceFocus } from './focus';
import { rehearseWords, type NextRace } from './rehearse';
import { compassPoint } from './windWords';
import { todaysCases } from './judge';
import { GRADE_NAME, passport } from './passport';
import type { VenueDef } from '@/sim/venue';
import type { TrainLink } from './stats';
import VenueBuilder from './VenueBuilder';
import type { Water } from './waters';
import type { SimIdentity } from './identity';
import { Challenge, closesText, isOpen } from './challenges';
import { challengeLine } from './SimChallenge';
import { BLOWN_OUT_OPEN, BLOWN_OUT_RACES, SimEvent, eventLine, eventState, eventStatusText } from './events';
import EventForm, { EventChoice } from './EventForm';
import type { SimSequence } from './startbox';
import type { OpenRoom } from './live';
import type { PadInfo } from './transmitter';
import SimHero from './SimHero';
import YachtStage from './YachtStage';
import { lookFor, sailFor, yachtFor, type Yard } from './yacht';

export interface Setup {
  classId: ClassId; fleetSize: number; level: SkipperLevel;
  windStrength: WindStrength; windCharacter: WindCharacter;
  laps: number; length: CourseLength; sequenceSeconds: number;
  coach: CoachMode; autoTrim: boolean; forgetfulSkippers: boolean;
  seaState: SeaKind; view: SimView;
  /** A venue id, or 'pond' for the practice pond. */
  venue: string;
  /** At a venue: one of the winds it gets (the usual one unless windPick says another), today's wind there, or any direction. */
  windDir: 'usual' | 'today' | 'any';
  /** Which of the venue's winds, when windDir is 'usual': its place in the venue's list (0, the usual breeze, when unset). */
  windPick?: number;
  /** Where you've chosen to sail at each venue, by venue id: metres east and north of the club's saved location. */
  spots?: Record<string, [number, number]>;
  /** With today's wind: sail in today's strength too (the default), or in the strength chosen. */
  todayStrength?: boolean;
  /** The StartBox sequence to start with (an id); null for the simulator's own calls; unset, the club's. */
  startSeq?: string | null;
  /** IOM: the rig you put on for the day. Unset or null, the right one for the breeze is put on for you. */
  rig?: 'A' | 'B' | 'C' | null;
}

/** The default race: an IOM against 8 State-level skippers at Lake Macquarie RYC in its sea breeze,
 *  on choppy water, seen from the club's control area, with the 1-minute scratch sequence clubs use
 *  in StartBox and the sails on your stick (no auto-trim). */
export const DEFAULT_SETUP: Setup = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'full', autoTrim: false, forgetfulSkippers: false,
  seaState: 'chop', view: 'bank', venue: DEFAULT_VENUE, windDir: 'usual',
};

/** The day on this device, as YYYY-MM-DD. */
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CHARACTER_WORD: Record<WindCharacter, string> = { steady: 'steady', oscillating: 'shifty', puffy: 'gusty', persistent: 'swinging' };

const CLASS_LABEL: Record<ClassId, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };


const LEVEL_TEXT: Record<SkipperLevel, string> = {
  club: 'Learning the ropes: late starts, wide roundings, and the odd foul you can protest.',
  state: 'Solid starts, play the big shifts, rarely foul. The odd late tack on the layline.',
  national: 'Sharp starts, tight roundings and clean tacks. They pick their shifts and give little away.',
  world: 'On the line at the gun and on the right side of every shift. One mistake and they are gone.',
};

function minutes(s: Setup) {
  const perLap = s.length === 'short' ? 2.2 : s.length === 'long' ? 4.2 : 3;
  const cls = s.classId === 'DF65' ? 1.25 : s.classId === '10R' ? 0.85 : s.classId === 'M' ? 0.92 : 1;
  const wind = s.windStrength === 'light' ? 1.35 : s.windStrength === 'fresh' ? 0.85 : 1;
  return Math.round(perLap * s.laps * cls * wind + 0.6);
}

function Toggle({ on, onChange, label, text }: { on: boolean; onChange: (v: boolean) => void; label: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
      <input type="checkbox" className="peer sr-only" checked={on} onChange={e => onChange(e.target.checked)} />
      <span aria-hidden="true" className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#4DA3FF]', on ? 'bg-[#2A8BFF]' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="block text-[12.5px] leading-snug" style={{ color: C.mute }}>{text}</span>
      </span>
    </label>
  );
}

function SkillBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3">
      <span className="text-[13px]" style={{ color: C.mute }}>{label}</span>
      <span className="relative h-1.5 rounded bg-white/[0.08]">
        <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${v}%`, background: v < 45 ? '#FF9F43' : '#4DA3FF' }} />
      </span>
      <span className="text-right text-[13px] font-semibold tabular-nums">{v}</span>
    </div>
  );
}

// ───────────────────────── The set-up board ─────────────────────────
type Pick = 'venue' | 'boat' | 'fleet' | 'skippers' | 'wind' | 'water' | 'course' | 'start' | 'aids';

const GLYPH: Record<Pick | 'academy' | 'flag' | 'book' | 'flask' | 'pin', string> = {
  venue: 'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  boat: 'M12 3v13M12 4l6.5 10H12M12 7l-5 7h5M4 18.5c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 4 0',
  fleet: 'M6 4v8M6 5l3.5 6H6M15 8v9M15 9l4.5 7H15M3 15c1.2.9 2.4.9 3.6 0M11 20c1.5 1 3 1 4.5 0s3-1 4.5 0',
  skippers: 'M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16l-5.1 2.7 1-5.7-4.1-4 5.7-.8z',
  wind: 'M3 9h10.5a2.5 2.5 0 10-2.5-2.5M3 13h15a3 3 0 11-3 3M3 17h7',
  water: 'M3 9c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 14c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 19c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0',
  course: 'M7 4v16M17 4v16M7 6a5 5 0 0110 0M17 18a5 5 0 01-10 0',
  start: 'M12 7v5l3 2M12 21a8 8 0 100-16 8 8 0 000 16zM9 2h6',
  aids: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  academy: 'M3 9l9-4 9 4-9 4-9-4zM7 11v4.5c1.6 1.5 3.3 2 5 2s3.4-.5 5-2V11M21 9v5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13',
  flask: 'M9 3h6M10 3v6L4 19a1.5 1.5 0 001.3 2h13.4a1.5 1.5 0 001.3-2L14 9V3',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
};
function Glyph({ name, size = 20 }: { name: keyof typeof GLYPH; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={GLYPH[name]} /></svg>;
}

/** One thing about the race, as a row of the set-up card: what it is and what it's set to. Tap it to change it. */
function SetupRow({ icon, label, value, sub, onClick }: { icon: Pick; label: string; value: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog"
      className="group flex w-full cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-transparent px-2.5 py-2.5 text-left text-[#F1F4FA] transition-colors duration-150 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4DA3FF]">
      <span aria-hidden="true" className="sim-set-icon flex h-10 w-10 shrink-0 items-center justify-center text-[#9CCBFF]"><Glyph name={icon} size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium leading-tight" style={{ color: C.faint }}>{label}</span>
        <span className="mt-[3px] block text-[15px] leading-snug">
          <span className="font-semibold">{value}</span>
          {sub && <span style={{ color: C.mute }}> · {sub}</span>}
        </span>
      </span>
      <svg className="shrink-0 opacity-35 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-90" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );
}

/** A column of the set-up card: a few rows that belong together. */
function SetupGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sim-set-group flex min-w-0 flex-col gap-0.5 px-2.5 py-3 sm:px-3.5">
      <Cap className="px-2.5 pb-1.5">{title}</Cap>
      {children}
    </div>
  );
}

/** A choice in a sheet: a big card you tap, lit when it's the one chosen. */
function Opt({ on, onClick, title, text, badge, wide }: { on: boolean; onClick: () => void; title: React.ReactNode; text?: React.ReactNode; badge?: React.ReactNode; wide?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx('relative flex cursor-pointer flex-col gap-1 rounded-2xl border p-3.5 text-left text-[#F1F4FA] transition-[transform,border-color,background-color] duration-150 active:scale-[0.985]', wide && 'col-span-full',
        on ? 'border-[#4DA3FF] bg-[rgba(46,123,255,0.16)] shadow-[0_0_0_1px_rgba(77,163,255,0.35),0_8px_24px_rgba(30,108,255,0.18)]' : 'border-white/[0.08] bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]')}>
      <span className="flex items-center gap-2">
        <span className="font-display text-[16px] font-bold leading-tight">{title}</span>
        {badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold" style={{ color: C.mute }}>{badge}</span>}
        <span aria-hidden="true" className={cx('ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-[#4DA3FF] bg-[#2E7BFF]' : 'border-white/25')}>
          {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </span>
      </span>
      {text && <span className="text-[12.5px] leading-snug" style={{ color: C.mute }}>{text}</span>}
    </button>
  );
}

function Opts({ label, children, cols = 2 }: { label?: string; children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <Cap>{label}</Cap>}
      <div className={cx('grid gap-2.5', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>{children}</div>
    </div>
  );
}

/** The sea states, and what each does to the boat. */
const WATER: Record<SeaKind, [string, string]> = {
  flat: ['Flat', 'Glassy water and clear reflections.'],
  chop: ['Choppy', 'Waves 4 cm high: a little slower upwind, a little surfing downwind.'],
  rough: ['Rough', 'Waves 10 cm high with whitecaps: she slams upwind and surfs downwind.'],
};

/** The sea state to race in: flat, choppy or rough (labelled "The sea" inside the water picker). */
function SeaOpts({ value, onPick, bare }: { value: SeaKind; onPick: (w: SeaKind) => void; bare?: boolean }) {
  return (
    <Opts label={bare ? undefined : 'The sea'} cols={3}>
      {(Object.keys(WATER) as SeaKind[]).map(w => <Opt key={w} on={value === w} onClick={() => onPick(w)} title={WATER[w][0]} text={WATER[w][1]} />)}
    </Opts>
  );
}

/**
 * A sheet over the page for one choice: slides up from the bottom on a phone, sits in the middle on a
 * bigger screen. While there's more of it below, the foot fades and a button says what's there and
 * takes you down to it.
 */
function Sheet({ title, text, icon, onClose, more, children }: { title: string; text?: React.ReactNode; icon: Pick; onClose: () => void; /** What's further down, for the button that shows there's more. */ more?: string; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement | null>(null);
  const [below, setBelow] = useState(false);
  const measure = React.useCallback(() => {
    const el = body.current;
    if (el) setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  }, []);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    measure();
    // The content grows when a choice opens more of it (a water's map and winds): measure again.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    const mo = new MutationObserver(() => { for (const c of Array.from(el.children)) ro.observe(c); measure(); });
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [measure]);
  const down = () => { const el = body.current; if (el) el.scrollBy({ top: Math.max(160, el.clientHeight * 0.7), behavior: 'smooth' }); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[9985] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-[rgba(3,7,16,0.72)] backdrop-blur-[6px]" />
      <div className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[26px] border border-white/10 bg-[#0B1322] text-[#F1F4FA] shadow-[0_30px_80px_rgba(0,0,0,0.6)] sm:max-w-[680px] sm:rounded-[26px]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <div className="flex items-start gap-3 border-b border-white/[0.07] px-5 pb-4 pt-5">
          <Tile size={40}><Glyph name={icon} /></Tile>
          <div className="min-w-0 flex-1">
            <h2 className="sim-h2">{title}</h2>
            {text && <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>{text}</p>}
          </div>
          <Btn primary onClick={onClose} autoFocus>Done</Btn>
        </div>
        <div ref={body} onScroll={measure} className="flex flex-col gap-5 overflow-y-auto px-5 pb-6 pt-4">{children}</div>
        {below && (
          <div className="sim-sheet-more">
            <button type="button" onClick={down} className="sim-sheet-more-btn">{more ?? 'More below'}<ChevronDown size={16} aria-hidden="true" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/** For a newcomer: the five First sail steps, with the next one a tap away. */
function FirstSailCard({ done, onGo, onDismiss, bare }: { done: (id: string) => boolean; onGo: (id: string) => void; onDismiss?: () => void; /** A row of the home screen's deck: no frame of its own. */ bare?: boolean }) {
  const next = nextFirst(done);
  if (!next) return null;
  const n = FIRST.findIndex(m => m.id === next.id);
  return (
    <section className={cx('relative flex flex-wrap items-center gap-x-6 gap-y-4 pr-12 sm:pr-14', bare ? 'sim-deck-row' : 'rounded-[22px] border border-[rgba(77,163,255,0.36)] bg-[rgba(10,24,54,0.74)] p-5 backdrop-blur-[18px] sm:pl-6')} aria-labelledby="fs-title">
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Don't show this again" title="Don't show this again"
          className="absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent text-white/60 transition-colors hover:bg-white/10 hover:text-white" style={{ borderRadius: '50%' }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l9 9M11.5 2.5l-9 9" /></svg>
        </button>
      )}
      <AlfieOrb size={44} />
      <div className="min-w-[240px] flex-1">
        <h2 id="fs-title" className="sim-h3">{n === 0 ? 'New to RC sailing? Learn to sail in five short steps' : 'Learning to sail: your next step'}</h2>
        <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>About ten minutes: steer her, trim the sail, tack, round a mark and cross a start line. Alfie will show you each one if you ask.</p>
        <ol className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
          {FIRST.map((m, k) => (
            <li key={m.id} className={cx('inline-flex h-[28px] items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold', done(m.id) ? 'border-[rgba(126,226,168,0.4)] bg-[rgba(52,211,153,0.12)] text-[#A7F3D0]' : k === n ? 'border-[rgba(77,163,255,0.55)] bg-[rgba(42,147,255,0.16)]' : 'border-transparent bg-white/[0.06]')} style={done(m.id) || k === n ? undefined : { color: C.mute }}>
              <span aria-hidden="true" className="tabular-nums">{done(m.id) ? '✓' : k + 1}</span>{m.title}
            </li>
          ))}
        </ol>
      </div>
      <Btn primary onClick={() => onGo(next.id)}>{n === 0 ? 'Start: steer her' : `Step ${n + 1}: ${next.title.toLowerCase()}`}</Btn>
    </section>
  );
}

/** The club's next race day, to sail before you get there: the day, the class, the forecast. */
function RehearseCard({ race, at, onRehearse }: { race: NextRace; at: VenueDef | null; onRehearse: () => void }) {
  const w = rehearseWords(race, at);
  return (
    <section className="flex flex-col gap-3 rounded-[22px] border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.06)] p-5" aria-labelledby="rh-title">
      <div className="flex items-center gap-2">
        <Cap>Your club's next race day</Cap>
        <Chip tone="good" className="ml-auto">{w.when}{race.startTime ? `, ${race.startTime}` : ''}</Chip>
      </div>
      <div>
        <h2 id="rh-title" className="sim-h3">{w.title}</h2>
        <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>{race.venue ? `${race.venue}. ` : ''}{w.wind}</p>
      </div>
      <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>Sail it now, so the shifts and the laylines aren't new on the day. {w.where}</p>
      <div><Btn primary onClick={onRehearse}>{w.button}</Btn></div>
    </section>
  );
}

/** "Blown out? Race it here" (the club's admins): the race day the weather took, raced on the club's water instead. */
function BlownOutCard({ day, at, onRace }: { day: NextRace & { cancelled: boolean }; at: VenueDef | null; onRace: (races: number, days: number) => Promise<string | null> }) {
  const [races, setRaces] = useState<number>(6);
  const [days, setDays] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const w = rehearseWords(day, at);
  const breeze = !at ? "On the practice pond (choose your club's water under Where to race it at home)."
    : day.wind ? `On ${at.name}'s water, in the day's breeze from the ${compassPoint(day.wind.from)}${day.wind.kn > 18 ? ', taken down to a fresh day' : ''}.` : `On ${at.name}'s water, in its usual breeze.`;
  const go = async () => { setBusy(true); setErr(null); const e = await onRace(races, days); setBusy(false); if (e) setErr(e); };
  const pick = (label: string, value: number, options: readonly number[], set: (n: number) => void, unit: (n: number) => string) => (
    <div className="flex flex-col gap-2">
      <Cap>{label}</Cap>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(o => <button key={o} type="button" className="sim-chip-btn" aria-pressed={value === o} onClick={() => set(o)} style={value === o ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{unit(o)}</button>)}
      </div>
    </div>
  );
  return (
    <section className="sim-glass flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="blown-title">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[240px] flex-1">
          <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: '#FFB86B' }}>{day.cancelled ? 'Cancelled' : day.days === 0 ? 'Today' : w.when} · for the club's admins</p>
          <h2 id="blown-title" className="m-0 mt-1 font-display text-[24px] font-bold leading-tight tracking-tight">Blown out? Race it here</h2>
          <p className="m-0 mt-1.5 text-[14px] leading-snug" style={{ color: C.mute }}><b className="font-semibold text-[#F1F4FA]">{day.name}</b>{day.classId ? `, ${day.className}` : ''}, as a virtual event for the club's members. {breeze} Everyone sails the same races in their own time; first tries count. The results stay in the Academy: nothing goes on the club's results.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {pick('Races', races, BLOWN_OUT_RACES, setRaces, n => `${n}`)}
        {pick('Open for', days, BLOWN_OUT_OPEN, setDays, n => (n === 1 ? 'Today' : `${n} days`))}
      </div>
      {err && <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: '#FFB86B' }}>{err}</p>}
      <div><button type="button" className="sim-btn-lg sim-btn-go" disabled={busy} onClick={() => void go()}>{busy ? 'Setting it up…' : 'Race it here'}</button></div>
    </section>
  );
}

// ───────────────────────── The Sailing Academy ─────────────────────────
/** Your yacht as you've finished her, and the way into the yard to change her. */
function YachtCard({ yard, cls, me, onDesign }: { yard: Yard; cls: ClassId; me: SimIdentity | null; onDesign: () => void }) {
  const y = yachtFor(yard, cls), look = lookFor(yard, cls), sail = sailFor(yard, cls, me).sail;
  return (
    <section className="relative flex flex-col overflow-hidden sim-card" aria-labelledby="yacht-title">
      <YachtStage still className="block aspect-[16/10] w-full" cls={cls} look={look} sail={sail} inset={{ bottom: 8 }} />
      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 id="yacht-title" className="sim-h3">{y ? y.name : 'Your yacht'}</h2>
          <p className="m-0 mt-0.5 text-[13.5px]" style={{ color: C.mute }}>{CLASS_LABEL[cls]} · {look.country ?? 'AUS'} {sail}{yard.yachts.length > 1 ? ` · ${yard.yachts.length} yachts saved` : ''}</p>
        </div>
        <Btn primary onClick={onDesign}>{y ? 'Your yachts' : 'Design your yacht'}</Btn>
      </div>
    </section>
  );
}

function AcademyCard({ icon, kicker, title, text, progress, progressText, action, actionLabel, tint }: {
  icon: keyof typeof GLYPH; kicker: string; title: string; text: string; progress: number; progressText: string; action: () => void; actionLabel: string; tint: string;
}) {
  return (
    <button type="button" onClick={action}
      className="group relative flex min-h-[214px] cursor-pointer flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0C1424] p-0 text-left text-[#F1F4FA] transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-white/25 active:translate-y-0 active:scale-[0.99]">
      <span aria-hidden="true" className="relative flex h-[76px] items-end overflow-hidden px-4 pb-3" style={{ background: `linear-gradient(135deg, ${tint}55, ${tint}14 60%, transparent)` }}>
        <span className="absolute -right-3 -top-4 opacity-[0.16]" style={{ color: tint }}><Glyph name={icon} size={104} /></span>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(6,11,22,0.55)]" style={{ color: tint }}><Glyph name={icon} size={21} /></span>
        <span className="ml-3 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(241,244,250,.82)' }}>{kicker}</span>
      </span>
      <span className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        <span className="font-display text-[18px] font-bold leading-tight">{title}</span>
        <span className="flex-1 text-[13px] leading-snug" style={{ color: C.mute }}>{text}</span>
        <span className="mt-1 flex items-center gap-3">
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, background: tint }} /></span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.mute }}>{progressText}</span>
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: tint }}>{actionLabel}
          <svg className="transition-transform group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </span>
    </button>
  );
}

/** Set a challenge: a title, a line about it, when it closes, and (super admins) who it's for. Uses the setup above. */
function SetChallenge({ canEveryone, onCreate, onDone }: { canEveryone: boolean; onCreate: (c: { title: string; description: string; days: number | null; everyone: boolean }) => Promise<string | null>; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<number>(7);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[14px] text-[#F1F4FA] placeholder:text-[rgba(235,240,255,0.4)] focus:border-[rgba(77,163,255,0.6)] focus:outline-none';
  return (
    <form className="flex flex-col gap-3 sim-card p-4" onSubmit={async e => {
      e.preventDefault();
      if (title.trim().length < 3) { setErr('Give it a title of at least three letters.'); return; }
      setBusy(true); setErr(null);
      const r = await onCreate({ title, description, days: days || null, everyone });
      setBusy(false);
      if (r) setErr(r); else onDone();
    }}>
      <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>The challenge is the race set up above (class, fleet, skippers, venue and wind), with its own shifts that everyone gets the same.</p>
      <label className="flex flex-col gap-1.5"><Cap>Title</Cap><input className={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Sunday sea breeze, IOM" /></label>
      <label className="flex flex-col gap-1.5"><Cap>About it (optional)</Cap><textarea className={cx(field, 'min-h-[64px]')} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Practise the start before Sunday's racing." /></label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5"><Cap>Open for</Cap><Seg size="sm" label="Open for" value={days} onChange={setDays} options={[{ value: 3, label: '3 days' }, { value: 7, label: 'A week' }, { value: 14, label: 'Two weeks' }, { value: 0, label: 'No end' }]} /></div>
        {canEveryone && <div className="flex flex-col gap-1.5"><Cap>For</Cap><Seg size="sm" label="Who it's for" value={everyone ? 'all' : 'club'} onChange={v => setEveryone(v === 'all')} options={[{ value: 'club', label: 'This club' }, { value: 'all', label: 'Every club' }]} /></div>}
        <span className="ml-auto" />
        <Btn type="button" quiet onClick={onDone}>Cancel</Btn>
        <Btn type="submit" primary disabled={busy}>{busy ? 'Setting it…' : 'Set the challenge'}</Btn>
      </div>
      {err && <p className="m-0 text-[13px] text-[#FCA5A5]">{err}</p>}
    </form>
  );
}

/**
 * The starts to offer: the club's own sequences (or StartBox's defaults if it has none) and the one
 * chosen, then the simulator calling a 1, 2 or 3 minute start for the lengths they don't cover.
 */
/** Race members live: open a room for the race set up above, join one with its code, or pick one of
 *  the club's open races. */
/** Your transmitter: sail with your own sticks. Which one is plugged in, and the set-up. */
function TransmitterCard({ pads, onSetUp }: { pads: PadInfo[]; onSetUp: () => void }) {
  const pad = pads.find(p => p.transmitter) ?? pads[0] ?? null;
  return (
    <section className="flex flex-col gap-3 sim-card p-5 sm:p-6" aria-labelledby="tx-title">
      <div className="flex items-center gap-2.5">
        <Tile size={36}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="12" rx="3" /><path d="M8 11v4M6 13h4M15.5 12h.01M18 14h.01M12 7V3" /></svg>
        </Tile>
        <div className="min-w-0 flex-1">
          <h2 id="tx-title" className="sim-h3">Your transmitter</h2>
          <p className="m-0 truncate text-[12.5px]" style={{ color: C.mute }}>
            {pad ? `${pad.name} · ${pad.setUp ? 'ready to sail' : 'not set up yet'}` : 'Sail with your own sticks'}
          </p>
        </div>
        {pad && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pad.setUp ? C.green : C.orange }} aria-hidden="true" />}
      </div>
      {!pad && <p className="m-0 text-[13.5px] leading-normal" style={{ color: C.mute }}>Plug in a RadioMaster or any EdgeTX radio by USB, choose USB Joystick (HID), and move a stick.</p>}
      <div><Btn small primary={!!pad && !pad.setUp} onClick={onSetUp}>{pad ? (pad.setUp ? 'Check the set-up' : 'Set it up') : 'How to connect'}</Btn></div>
    </section>
  );
}

function LiveSection({ rooms, onOpen, onJoin }: { rooms: OpenRoom[]; onOpen: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return (
    <section className="flex flex-col gap-3.5" aria-labelledby="live-title">
      <div>
        <h2 id="live-title" className="sim-h2">Race members live</h2>
        <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Race other members in real time. Each of you sails your own boat from your own device, and AI skippers fill the rest of the fleet.</p>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
        <div className="flex flex-col gap-3 sim-card p-5">
          <p className="m-0 text-[16px] font-semibold">Open a live race</p>
          <p className="m-0 flex-1 text-[13px] leading-snug" style={{ color: C.mute }}>The race you've set up above. You get a code to give the members you're racing, and you start it when everyone's ready.</p>
          <Btn primary onClick={onOpen} className="self-start">Open a room</Btn>
        </div>
        <form className="flex flex-col gap-3 sim-card p-5" onSubmit={e => { e.preventDefault(); if (clean.length === 6) onJoin(clean); }}>
          <label htmlFor="live-code" className="m-0 text-[16px] font-semibold">Join with a code</label>
          <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>The six-letter code from whoever opened the room.</p>
          <div className="flex gap-2">
            <input id="live-code" value={code} onChange={e => setCode(e.target.value)} placeholder="ABC234" autoComplete="off" spellCheck={false} maxLength={8}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 font-display text-[16px] font-bold uppercase tracking-[0.18em] text-[#F1F4FA] outline-none placeholder:text-white/25 focus:border-[#2A8BFF]" />
            <Btn type="submit" disabled={clean.length !== 6}>Join</Btn>
          </div>
        </form>
        <div className="flex flex-col gap-3 sim-card p-5">
          <p className="m-0 text-[16px] font-semibold">Open races at your club</p>
          {rooms.length === 0 ? (
            <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>None open right now. Rooms show here while they wait to start.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rooms.slice(0, 5).map(r => (
                <li key={r.code} className="flex items-center gap-3 rounded-[12px] bg-white/[0.035] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[14px] font-semibold">{r.title}</p>
                    <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{r.host} · {r.people} in</p>
                  </div>
                  <Btn small onClick={() => onJoin(r.code)}>Join</Btn>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The starts to choose from. With StartBox sequences to hand they are the only choices (the club's
 * own, or StartBox's defaults for a club with none of its own), so the start you practise to is the
 * one you race to. The simulator's own calls are offered only when there is no sequence at all.
 */
function startOptions(sequences: SimSequence[], chosen: SimSequence | null): { value: string; label: string }[] {
  if (!sequences.length) return [60, 120, 180].map(n => ({ value: `b${n}`, label: `${n / 60} minute${n > 60 ? 's' : ''}` }));
  const own = sequences.filter(q => q.club);
  let shown = own.length ? own.slice(0, 6) : sequences.slice(0, 4);
  if (chosen && !shown.some(q => q.id === chosen.id)) shown = [...shown, chosen];
  return shown.map(q => ({ value: q.id, label: q.name }));
}

export default function SimHome({ setup, onSetup, onStart, profile, onProfileCleared, training, onOpen, onDismiss, door = 'home', onDoor, onWay, onReset, onYear, comfort, helpNow = 'full', onComfort, onPlay, career = null, onCareer, onBench, onExit, world = null, blownOut = null, clubEvent = null, yard, onLink, today, me = null, synced = false, challenges = null, onChallenge, canSet = null, onCreateChallenge, events = null, onEvent, onCreateEvent, sequences = [], startSeq = null, startFinding = false, live = null, transmitter = null, next = null, clubId = null, waters = [], waterAdmin = false, onWaters }: {
  setup: Setup; onSetup: (s: Setup) => void; onStart: (mode: 'race' | 'start', s: Setup) => void; profile: Profile; onProfileCleared: () => void;
  training: TrainingProgress; onOpen: (where: 'trainer' | 'academy' | 'lab' | 'playbook' | 'passport' | 'judge' | 'yacht') => void;
  /** "Don't show this again", for a card on this screen. */
  onDismiss?: (card: string) => void;
  /** Which part of the Academy is open: the front, or behind one of its three doors. */
  door?: Door; onDoor?: (d: Door) => void;
  /** "Help me sail better" or "I want to race", and "I'm new to RC sailing" (on or off). */
  onWay?: (w: Way, newcomer?: boolean) => void;
  /** Start again: everything cleared (the yachts kept, or not). */
  onReset?: (keepYachts: boolean) => void;
  /** Open your year in sailing. */
  onYear?: () => void;
  /** Comfort settings, Alfie's help at your level now, and the way to change them. */
  comfort?: Comfort; helpNow?: CoachMode; onComfort?: (c: Omit<Comfort, 'at'>) => void;
  /** Open a play in the Playbook. */
  onPlay?: (id: string) => void;
  /** Your season on the Circuit (null: not begun), and the way to its screen. */
  career?: Career | null; onCareer?: () => void;
  /** The scoring bench (club admins and race officers). */
  onBench?: () => void;
  /** "Blown out? Race it here" (the club's admins): the race day the weather took, and racing it here. */
  blownOut?: { day: NextRace & { cancelled: boolean }; at: VenueDef | null; onRace: (races: number, days: number) => Promise<string | null> } | null;
  /** A virtual event of your club's to sail now (Next up puts it first). */
  clubEvent?: { event: SimEvent; left: number; hours: number } | null;
  /** Leave the Sailing Academy (back to the rest of AlfiePRO): the exit at the top right. */
  onExit?: () => void;
  /** The world (the daily race, the World Regatta, the Majors and the tables), once it has races. */
  world?: { line: string; onOpen: () => void } | null;
  /** The boats you've designed (Design your yacht). */
  yard: Yard;
  /** Start a drill or scenario straight from the home screen (today's ten minutes). */
  onLink?: (l: TrainLink) => void;
  /** Today's wind at the venue, when you've asked for it: loading, got it, or couldn't get it. */
  today: TodayWind | 'loading' | 'failed' | null;
  /** The signed-in member: their name and sail numbers. */
  me?: SimIdentity | null;
  /** Their club, so its own water comes first. */
  clubId?: string | null;
  /** Clubs' own water from the database (already registered with the engine). */
  waters?: Water[];
  /** A club admin, who can set up and change their club's water. */
  waterAdmin?: boolean;
  onWaters?: (next: Water[]) => void;
  /** Races and training are being kept in the member's account. */
  synced?: boolean;
  /** Challenges you can see (null when you're not signed in, or they couldn't be loaded). */
  challenges?: Challenge[] | null;
  onChallenge?: (c: Challenge) => void;
  /** Can you set challenges, and for every club? */
  canSet?: { everyone: boolean } | null;
  onCreateChallenge?: (c: { title: string; description: string; days: number | null; everyone: boolean }) => Promise<string | null>;
  /** Virtual race events you can see (null when you're not signed in, or they couldn't be loaded). */
  events?: SimEvent[] | null;
  onEvent?: (e: SimEvent) => void;
  onCreateEvent?: (c: EventChoice) => Promise<string | null>;
  /** The club's StartBox sequences, and the one this race will use (null: the simulator calls it). */
  sequences?: SimSequence[];
  /** StartBox hasn't answered yet, and nothing is kept from before. */
  startFinding?: boolean;
  startSeq?: SimSequence | null;
  /** Live races with other members (signed in): the club's open rooms, open one, join one. */
  live?: { rooms: OpenRoom[]; onOpen: () => void; onJoin: (code: string) => void } | null;
  /** Your transmitter: what's plugged in, and the set-up. */
  transmitter?: { pads: PadInfo[]; onSetUp: () => void } | null;
  /** The club's next race day (signed in, with a club and something on its calendar), and how to rehearse it. */
  next?: { race: NextRace; at: VenueDef | null; onRehearse: () => void } | null;
}) {
  const [setting, setSetting] = useState(false);
  const [settingEvent, setSettingEvent] = useState(false);
  const stars = drillStars(training);
  const lic = licence(training);
  const labWon = LAB.filter(m => training.lab[m.id]?.won).length;
  const firstWon = FIRST.filter(m => training.lab[m.id]?.won).length;
  // You be the judge: today's five cases (the first is the call of the day), and how many you've called today.
  const judgeToday = useMemo(() => todaysCases(localDay()), []);
  const calledToday = (id: string) => { const r = training.judge?.[id]; return r && localDay(new Date(r.at)) === localDay() ? r : null; };
  const callToday = calledToday(judgeToday[0].id);
  const judgedToday = judgeToday.filter(c => calledToday(c.id)).length;
  const [s, setS] = useState<Setup>(setup);
  const set = (patch: Partial<Setup>) => { const n = { ...s, ...patch }; setS(n); onSetup(n); };
  const sk = useMemo(() => skills(profile), [profile]);
  // Try Alfie's voice from the coaching sheet: it says a line, and says so here if the browser can't.
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const hearAlfie = () => {
    const a = new RaceAudio();
    a.unlock();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { setVoiceNote("This browser has no voice, so Alfie's coaching will be written only."); return; }
    setVoiceNote('Speaking…');
    // (A moment for the browser's voices to load, the first time.)
    window.setTimeout(() => a.say("Alfie here. In full coaching I'll call your trim, your tacks and your start as you sail.", true), 150);
    window.setTimeout(() => {
      setVoiceNote(a.problem
        ? `The browser wouldn't speak (${a.problem}). Alfie's coaching will be written only until that's sorted.`
        : "If you didn't hear Alfie, check this tab isn't muted and your device's volume is up.");
      a.dispose();
    }, 8000);
  };
  // Today's three: from where the races are going, and what's due.
  // The one thing your next race is for: your biggest leak lately.
  const focus = useMemo(() => raceFocus(profile), [profile]);
  const pp = useMemo(() => passport(profile), [profile]);
  const venue = s.venue !== 'pond' ? VENUES[s.venue] ?? null : null;
  const vWind = venue ? windAt(venue, s.windPick) : null;
  const windHint = !venue || !vWind ? null
    : s.windDir === 'usual' ? `${vWind.note ?? "One of the club's winds."} From ${String(vWind.from).padStart(3, '0')}°.`
      : s.windDir === 'any' ? 'A different direction every race, so you learn the whole lake.'
        : today === 'loading' ? 'Getting the wind at the club now…'
          : today === 'failed' || !today ? `Couldn't get today's wind, so it's the ${vWind.name} for now.`
            : `Now at the club: ${Math.round(today.kn)} kn from the ${compassName(today.from)} (${String(Math.round(today.from)).padStart(3, '0')}°).`;
  // With today's wind, its strength is one of the choices (and the one used unless you pick another).
  const todayKn = venue && s.windDir === 'today' && today && today !== 'loading' && today !== 'failed' ? today.kn : null;
  const useToday = todayKn !== null && s.todayStrength !== false;
  const strengthHint = useToday ? `Today's real breeze at the club, ${Math.round(todayKn!)} kn. Pick a strength to sail in that instead, from today's direction.`
    : s.windStrength === 'fresh' ? 'A fresh breeze: the boats heel hard and the gusts lay them over. IOMs change down to the B rig.'
      : s.windStrength === 'light' ? 'Light air: keep her moving, and look for the darker water where the breeze is.' : null;
  const weakest = sk ? (Object.entries({ starts: sk.starts, upwind: sk.upwind, roundings: sk.roundings, downwind: sk.downwind, rules: sk.rules }) as [string, number][]).sort((a, b) => a[1] - b[1])[0] : null;

  const surprise = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const n: Setup = {
      ...s,
      classId: pick(['IOM', 'IOM', 'DF95', 'DF65', '10R', 'M'] as ClassId[]),
      fleetSize: pick([6, 8, 8, 12]),
      level: pick(['club', 'state', 'state', 'national'] as SkipperLevel[]),
      windStrength: pick(['light', 'medium', 'medium', 'fresh'] as WindStrength[]),
      windCharacter: pick(['steady', 'oscillating', 'oscillating', 'puffy', 'persistent'] as WindCharacter[]),
    };
    setS(n); onSetup(n); onStart('race', n);
  };

  // ── What each tile says, and the sheet that changes it ──
  const [pick, setPick] = useState<Pick | null>(null);
  const closePick = React.useCallback(() => setPick(null), []);
  const STRENGTH: Record<WindStrength, string> = { light: 'Light 3–6 kn', medium: 'Medium 7–12 kn', fresh: 'Fresh 13–18 kn' };
  const CHARACTER: Record<WindCharacter, [string, string]> = {
    steady: ['Steady', 'Little changes: a race of boat speed and clean air.'],
    oscillating: ['Oscillating', 'It swings back and forth: tack on the headers.'],
    puffy: ['Puffy', 'Gusts and lulls sweep down the course: sail for the dark water.'],
    persistent: ['Persistent shift', 'It goes one way and stays there: get to that side early.'],
  };
  const CLASS_TEXT: Record<ClassId, string> = {
    IOM: 'One metre. The most raced class in the world, with three rigs for the breeze.',
    DF95: '95 cm one-design. Quick, light and lively.',
    DF65: '65 cm one-design. The way most people start.',
    '10R': 'The big one: long, powerful and fast in a straight line.',
    M: 'Marblehead: tall rig, slim hull, a thoroughbred.',
  };
  const windDirName = !venue || !vWind ? 'Up the pond' : s.windDir === 'usual' ? `${vWind.name[0].toUpperCase()}${vWind.name.slice(1)}` : s.windDir === 'today' ? "Today's wind" : 'Any direction';
  // The wind the venue's map lays the course for: the one picked, or today's when it's in.
  const mapWind = !venue || !vWind ? 0 : s.windDir === 'today' && today && today !== 'loading' && today !== 'failed' ? today.from : vWind.from;
  const spot = venue ? s.spots?.[venue.id] ?? null : null;
  // The venues to choose from: the ones that come with the app and clubs' own. Once a club has
  // published its own version of a venue that came with the app, its version stands in for it.
  const mine = (d: { clubs?: string[] }) => !!clubId && !!d.clubs?.includes(clubId);
  const venueList = [
    ...BUILT_IN.filter(d => !waters.some(w => w.published && w.venueId && w.venueId === d.venueId)),
    ...waters.map(w => w.def),
  ].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  const draftIds = new Set(waters.filter(w => !w.published).map(w => w.def.id));
  const myWaters = waters.filter(w => w.clubId === clubId);
  // Setting up or changing the club's water (admins): the one being changed, or 'new'.
  const [building, setBuilding] = useState<Water | 'new' | null>(null);
  const builtIn = venueForClub(clubId);
  const startFrom = builtIn && !myWaters.some(w => w.venueId === builtIn.venueId) ? builtIn : null;
  // Venue practice is at the venue you've chosen; on the practice pond, at your club's (or the first that comes with the app).
  const practiceAt = venue ?? builtIn ?? VENUES[DEFAULT_VENUE];
  const strengthName = useToday ? `Today's ${Math.round(todayKn!)} kn` : STRENGTH[s.windStrength];
  const startName = startSeq ? startSeq.name : s.sequenceSeconds % 60 ? `${s.sequenceSeconds} seconds, called` : `${s.sequenceSeconds / 60} minute${s.sequenceSeconds > 60 ? 's' : ''}, called`;

  // The layered home: your level, this week's program, the licence above you, and what's next.
  const way: Way = training.way?.mode ?? 'simple';
  const simple = way === 'simple';
  // Said they're new to RC sailing: their level is known (Club), and the learn-to-sail path comes first.
  const st = useMemo(() => standing(profile, !!training.newcomer), [profile, training.newcomer]);
  const learn = useMemo(() => (training.newcomer ? learnPath(profile, training, training.newcomer) : null), [profile, training]);
  /** The first race of the path: short, against five Club skippers, with Alfie coaching. */
  const firstRace = () => onStart('race', { ...s, fleetSize: 6, level: 'club', laps: 1, length: 'short', coach: 'full', autoTrim: true });
  const goLearn = () => { const n = learn?.next; if (!n) return; if (n.link) onLink?.(n.link); else firstRace(); };
  const clean = useMemo(() => cleanSailing(profile), [profile]);
  const week = useMemo(() => weekPlan(profile, training, Date.now(), st), [profile, training, st]);
  const grad = useMemo(() => levelLicence(st.level, profile, training), [st.level, profile, training]);
  const newcomer = offerFirstSail(profile, training);
  // (In the simple way of using it, licences and challenges stay out of sight.)
  const up = useMemo(() => nextUp({ profile, training, standing: st, week, licence: simple ? null : grad, next: next?.race ?? null, challenges: simple ? [] : challenges ?? [], career: simple || !onCareer ? undefined : career, clubEvent, now: Date.now() }),
    [profile, training, st, week, simple, grad, next, challenges, career, onCareer, clubEvent]);
  const cs = career ? dayState(career) : null;
  // How much of the window the deck covers, so the render frames the fleet above it.
  const deck = useRef<HTMLDivElement | null>(null);
  const [foot, setFoot] = useState(0);
  useEffect(() => {
    const el = deck.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const measure = () => setFoot(Math.round(Math.min(1, el.offsetHeight / Math.max(1, window.innerHeight)) * 20) / 20);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [door]);
  // Quick race: straight to the race set-up (water, wind and its direction, boat, fleet), for a race and nothing else.
  const setCard = useRef<HTMLElement | null>(null);
  const [toSet, setToSet] = useState(false);
  useEffect(() => {
    if (!toSet || door !== 'race') return;
    setToSet(false);
    requestAnimationFrame(() => setCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [toSet, door]);
  const quickRace = () => { setToSet(true); onDoor?.('race'); };
  const go = (d: Door) => { onDoor?.(d); window.scrollTo({ top: 0 }); document.querySelector('.sim-page')?.parentElement?.scrollTo({ top: 0 }); };
  const upView: { kicker: string; title: string; text: string; button: string; onGo: () => void } =
    up.kind === 'career-day' ? { kicker: `Next up · your race day is under way`, title: `${up.event}: race ${up.race} of ${up.of}`, text: up.canSimulate ? 'Sail the next race, or simulate the rest of the day from the ones you\'ve sailed.' : 'Sail at least three races; after that the rest of the day can be simulated.', button: 'Open the race day', onGo: () => onCareer?.() }
      : up.kind === 'career-next' ? { kicker: up.started ? `Next up · the Circuit, season ${up.season}` : 'Next up · the AlfiePRO Circuit', title: up.started ? up.event : 'Start your club season', text: up.started ? `${cs ? `${cs.event.races} races${cs.days > 1 ? ` over ${cs.days} days` : ''}` : 'Six races'}, scored by AlfiePRO. Sail at least three${cs && cs.days > 1 ? ' a day' : ''}; the rest can be simulated.` : 'Six race days against nine club mates with names, numbers and form of their own, then the Club Championship. A podium earns a medal.', button: up.started ? 'Open the race day' : 'See the season', onGo: () => onCareer?.() }
      : up.kind === 'club-event' ? { kicker: `Next up · your club${up.hours ? `, closes in ${up.hours < 24 ? `${up.hours} hour${up.hours === 1 ? '' : 's'}` : `${Math.round(up.hours / 24)} day${Math.round(up.hours / 24) === 1 ? '' : 's'}`}` : ''}`, title: up.event.title, text: `${up.left} race${up.left === 1 ? '' : 's'} for you to sail, the same for everyone at the club. Your first try at each counts.`, button: 'Open the event', onGo: () => onEvent?.(up.event) }
      : up.kind === 'placement' ? { kicker: 'Next up · find your level', title: up.sailed === 0 ? 'Three races find your level' : `Placement race ${up.sailed + 1} of ${up.of}`, text: `After three races you're placed, Club, Regional, National or World, and your training follows. About ${minutes(s)} minutes each, in the boat and fleet below.`, button: 'Start race', onGo: () => onStart('race', s) }
      : up.kind === 'rehearse' && next ? { kicker: `Next up · your club races ${rehearseWords(up.race, next.at).when.toLowerCase()}`, title: rehearseWords(up.race, next.at).title, text: `${rehearseWords(up.race, next.at).wind} Sail it now, so the shifts and the laylines aren't new on the day.`, button: rehearseWords(up.race, next.at).button, onGo: next.onRehearse }
        : up.kind === 'licence' ? { kicker: `Next up · one step from your ${LEVEL_NAME[up.to]} licence`, title: `${up.req.label}: ${up.req.need}`, text: `You have: ${up.req.have.toLowerCase()}. It's the last thing between you and your ${LEVEL_NAME[up.to]} licence.`, button: up.req.go === 'race' ? 'Start race' : 'Work on it', onGo: () => { const g = up.req.go; if (g === 'race') onStart('race', s); else onOpen(g); } }
          : up.kind === 'challenge' ? { kicker: `Next up · closes in ${up.hours < 24 ? `${up.hours} hour${up.hours === 1 ? '' : 's'}` : 'a day or so'}`, title: up.challenge.title, text: `Your club's challenge: the same race for everyone, with a leaderboard. ${challengeLine(up.challenge)}`, button: 'Open the challenge', onGo: () => onChallenge?.(up.challenge) }
            : up.kind === 'session' ? { kicker: simple ? "Today's session" : `Next up · session ${up.n} of ${up.of} this week`, title: practiceLink(up.session.link).label.replace(/^(Start Trainer|Scenario): /, ''), text: `${up.session.why} About five minutes.`, button: 'Start the session', onGo: () => onLink?.(practiceLink(up.session.link)) }
              : { kicker: simple ? "This week's sessions are done" : 'Next up', title: 'Go racing', text: `${focus ? `${focusWords(focus).title}. ` : ''}About ${minutes(s)} minutes, in the boat and fleet below.`, button: 'Start race', onGo: () => onStart('race', s) };
  // The race as set up, each part a way into its picker (so the boat can be changed right where a race is offered).
  const chips = [
    { what: 'Boat', value: CLASS_LABEL[s.classId], onPick: () => setPick('boat') },
    { what: 'Fleet', value: `${s.fleetSize} boats`, onPick: () => setPick('fleet') },
    { what: 'Skippers', value: LEVEL_NAME[s.level], onPick: () => setPick('skippers') },
    { what: 'Where', value: venue ? venue.short : 'Practice pond', onPick: () => setPick('venue') },
    { what: 'Wind', value: strengthName, onPick: () => setPick('wind') },
    { what: 'Sea', value: WATER[s.seaState][0], onPick: () => setPick('water') },
  ];
  // How you're going, in words (the simple way of using it).
  const lastRace = profile.races.find(r => r.mode === 'race' && r.status !== 'racing');
  const going = [
    learn && !learn.done ? `You're learning the basics: ${learn.progress.done} of ${learn.progress.of} steps done.` : st.placed ? `You're sailing at ${LEVEL_NAME[st.level]} level.` : st.races === 0 ? "Sail three races and we'll know your level." : `${up.kind === 'placement' ? up.of - up.sailed : 3 - st.races} more race${3 - st.races === 1 ? '' : 's'} and we'll know your level.`,
    ...(week.weakest ? [`${CAUSE_WORDS[week.weakest].name} is where you have most to gain.`] : []),
    ...(lastRace ? [`Your last race: ${lastRace.place ? `${ordinal(lastRace.place)} of ${lastRace.of}` : 'not finished'}.`] : []),
  ];
  const openCh = (challenges ?? []).filter(c => isOpen(c) && !c.event_id).length, openEv = (events ?? []).filter(e => eventState(e).open.length).length;
  const mateLine = openCh || openEv ? [openCh ? `${openCh} challenge${openCh > 1 ? 's' : ''}` : '', openEv ? `${openEv} event${openEv > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ') + ' open' : 'With mates: live rooms, challenges and events';

  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* ── The front of the Academy: the fleet racing live, with what's next and the ways in over it ── */}
      <section className={cx('sim-home-hero', door === 'home' && 'sim-home-front')}>
        <div className="sim-home-media" aria-hidden="true">
          <SimHero setup={s} fill foot={door === 'home' ? foot : 0} />
          <div className="sim-home-scrim" />
        </div>
        <div className="sim-home-hero-body px-4 sm:px-6 lg:px-10 xl:px-16">
          {door === 'home' ? (
            <>
              <div className="sim-front-top">
                <Brand />
                {training.way && onWay && <WayToggle way={way} onChoose={onWay} />}
                {onExit && <button type="button" className="sim-exit" onClick={onExit} aria-label="Leave the Sailing Academy" title="Leave the Sailing Academy"><LogOut size={19} aria-hidden="true" /></button>}
              </div>
              <h1 className="sr-only">Sailing Academy</h1>
              <div className="sim-front">
                {/* One deck at the foot of the render: what's next across the top, the ways in beneath it. */}
                <div className="sim-deck" ref={deck}>
                  {!training.way && onWay && <WayAsk onChoose={onWay} />}
                  {up.kind === 'learn' && learn
                    ? <LearnCard bare path={learn} onGo={goLearn} />
                    // (While they're being asked, "I'm new to RC sailing" is one of the answers: no need for the card as well.)
                    : up.kind === 'first-sail' && !training.way && onWay ? null
                    : up.kind === 'first-sail' && onLink
                    ? <FirstSailCard bare done={id => !!training.lab[id]?.won} onGo={id => onLink({ kind: 'lab', id, label: 'First sail' })} onDismiss={onDismiss ? () => onDismiss('first-sail') : undefined} />
                    : <NextUpCard big={simple} {...upView} quick={!simple && up.kind !== 'placement' && up.kind !== 'race' ? quickRace : undefined}>{(up.kind === 'placement' || up.kind === 'race') && <SetupChips items={chips} />}</NextUpCard>}
                  {simple ? (
                    <div className="sim-deck-cells">
                      <section className="sim-cell" aria-labelledby="going-title">
                        <h2 id="going-title" className="sim-cell-kicker">How you're going</h2>
                        {going.map(l => <p key={l} className="sim-cell-say">{l}</p>)}
                      </section>
                      {up.kind !== 'placement' && up.kind !== 'race' && up.kind !== 'learn' && (
                        <section className="sim-cell" aria-labelledby="pr-title">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1"><span id="pr-title" className="sim-cell-title">A practice race</span><span className="sim-cell-status">About {minutes(s)} minutes</span></span>
                            <button type="button" className="sim-btn-lg sim-btn-go sim-btn-green" onClick={() => onStart('race', s)}><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 001.5.86l12.5-7.5a1 1 0 000-1.72L8.5 3.64A1 1 0 007 4.5z" /></svg>Quick race</button>
                          </div>
                          <SetupChips items={chips} />
                        </section>
                      )}
                      <button type="button" className="sim-cell sim-door" onClick={() => go('train')}>
                        <span className="flex items-center gap-3"><span className="sim-cell-title">Your training</span><ArrowRight size={20} aria-hidden="true" className="sim-door-arrow ml-auto shrink-0" /></span>
                        <span className="sim-cell-status">{learn && !learn.done ? `Learning the basics: ${learn.progress.done} of ${learn.progress.of} steps` : `${week.done} of ${week.sessions.length} sessions done this week`}</span>
                        <span className="sim-cell-note">This week's sessions, picked from how you race, plus starts, rules and tactics to practise any time.</span>
                      </button>
                      <button type="button" className="sim-cell sim-door" onClick={() => go('you')}>
                        <span className="flex items-center gap-3"><span className="sim-cell-title">You and your yacht</span><ArrowRight size={20} aria-hidden="true" className="sim-door-arrow ml-auto shrink-0" /></span>
                        <span className="sim-cell-status">{yachtFor(yard, s.classId)?.name ?? CLASS_LABEL[s.classId]}, sail {sailFor(yard, s.classId, me).sail}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="sim-deck-cells">
                      <DoorCard title="Race" status={`${CLASS_LABEL[s.classId]} · ${s.fleetSize} boats · ${LEVEL_NAME[s.level]} skippers`} onOpen={() => go('race')}
                        lines={[cs ? `The Circuit: ${cs.event.name}${career?.day ? `, race ${Math.min(cs.raced + 1, cs.event.races)} of ${cs.event.races}` : ' is next'}` : 'The Circuit: your club season', 'Practice: your own race, as you set it', live && live.rooms.length ? `${live.rooms.length} live room${live.rooms.length > 1 ? 's' : ''} open now` : mateLine]} />
                      <DoorCard title="Train" status={`${week.done} of ${week.sessions.length} sessions done this week`} onOpen={() => go('train')}
                        lines={[`${LEVEL_NAME[st.level]} program: ${SYLLABUS[st.level].aim.toLowerCase()}`, grad ? `${LEVEL_NAME[grad.to]} licence: ${grad.met} of ${grad.reqs.length}` : 'World level: nothing above it', 'The library: tactics, rules, starts, race moments']} />
                      <DoorCard title="You" status={st.placed ? `${LEVEL_NAME[st.level]} skipper · ${st.rating.toLocaleString()}` : `${st.races} of 3 placement races sailed`} onOpen={() => go('you')}
                        lines={[`${yachtFor(yard, s.classId)?.name ?? CLASS_LABEL[s.classId]} · sail ${sailFor(yard, s.classId, me).sail}`, pp?.total.grade ? `Passport: ${GRADE_NAME[pp.total.grade]} overall` : 'Your skill passport and race history', 'Design your yacht']}>
                        <YachtStage still className="block h-full w-full" cls={s.classId} look={lookFor(yard, s.classId)} sail={sailFor(yard, s.classId, me).sail} inset={{ bottom: 4 }} />
                      </DoorCard>
                    </div>
                  )}
                </div>
                {simple && <button type="button" className="sim-link self-start text-[13.5px]" onClick={() => go('race')}>Set up the race in full, or race with others</button>}
              </div>
            </>
          ) : (
            <>
              <DoorBack onHome={() => go('home')} />
              <h1 className="sim-home-title">{DOOR_NAME[door]}</h1>
              <p className="sim-home-sub">{door === 'race' ? 'Your own race as you set it, live rooms with your mates, and club challenges and events.' : door === 'train' ? 'Three sessions a week, picked from how you race. Then starts, rules, tactics and race moments to practise any time.' : 'Your level, your yacht, and how your racing is going.'}</p>
            </>
          )}
        </div>
      </section>

      <div className="sim-home-body flex flex-col gap-7 px-4 pb-16 sm:px-6 lg:px-10 xl:px-16">
        {door === 'race' && (
          <>
            {blownOut && <BlownOutCard {...blownOut} />}
            {onCareer && (
              <section className="sim-glass flex flex-wrap items-center gap-x-6 gap-y-4 p-5 sm:p-6" aria-labelledby="circuit-title">
                <div className="min-w-[240px] flex-1">
                  <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>The AlfiePRO Circuit{career ? ` · season ${career.season}` : ''}</p>
                  <h2 id="circuit-title" className="m-0 mt-1 font-display text-[24px] font-bold leading-tight tracking-tight">{cs ? `${cs.event.name}${career?.day ? `: race ${Math.min(cs.raced + 1, cs.event.races)} of ${cs.event.races}` : ''}` : 'Your club season'}</h2>
                  <p className="m-0 mt-1.5 text-[14px] leading-snug" style={{ color: C.mute }}>{career ? `${career.done.length} of ${seasonOf(career).length} events sailed this season. ${career.medals.length ? `${career.medals.length} medal${career.medals.length > 1 ? 's' : ''} so far.` : 'A podium earns a medal.'}` : 'Six race days against nine club mates, then the Club Championship. Scored by AlfiePRO; a podium earns a medal.'}</p>
                </div>
                <button type="button" className="sim-btn-lg sim-btn-go" onClick={onCareer}>{career?.day ? 'Carry on' : career ? 'Open the race day' : 'See the season'}</button>
              </section>
            )}
            {world && (
              <section className="sim-glass flex flex-wrap items-center gap-x-6 gap-y-4 p-5 sm:p-6" aria-labelledby="world-title">
                <div className="min-w-[240px] flex-1">
                  <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>Every {CLASS_LABEL[s.classId]} skipper in the world</p>
                  <h2 id="world-title" className="m-0 mt-1 font-display text-[24px] font-bold leading-tight tracking-tight">The world</h2>
                  <p className="m-0 mt-1.5 text-[14px] leading-snug" style={{ color: C.mute }}>{world.line} The same races for everyone, sailed in your own time, with world points and tables.</p>
                </div>
                <button type="button" className="sim-btn-lg sim-btn-go" onClick={world.onOpen}>Open the world</button>
              </section>
            )}
            {next && <RehearseCard {...next} race={next.race} />}
            {onBench && (
              <section className="sim-card flex flex-wrap items-center gap-x-6 gap-y-3 p-5" aria-labelledby="bench-title">
                <div className="min-w-[240px] flex-1">
                  <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>For race officers</p>
                  <h2 id="bench-title" className="sim-h3 mt-0.5">Scoring bench</h2>
                  <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>Sail one fleet as a whole regatta under low point, HMS and SHRS, see how each system ranks the same skippers, and take the results into Race Management's event simulation.</p>
                </div>
                <Btn onClick={onBench}>Open the bench</Btn>
              </section>
            )}
        {/* ── Race set-up ── */}
        <section ref={setCard} className="sim-set-card scroll-mt-4" aria-labelledby="qr-title">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 pb-4 pt-5 sm:px-6">
            <div className="min-w-[220px] flex-1">
              <h2 id="qr-title" className="sim-h2">Your race</h2>
              <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>About {minutes(s)} minutes. Sail it with the keyboard, touch or a USB transmitter.</p>
              {focus && (
                <p className="m-0 mt-2.5 flex items-start gap-2 text-[13.5px] leading-snug">
                  <span className="mt-px shrink-0"><AlfieOrb size={18} /></span>
                  <span><b className="font-semibold">{focusWords(focus).title}.</b> <span style={{ color: C.mute }}>{focusWords(focus).line}</span></span>
                </p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
              {!(s.venue === practiceAt.id && s.windDir === 'today') && <button type="button" onClick={() => set({ venue: practiceAt.id, windDir: 'today', todayStrength: true })} className="sim-btn-lg flex-1 sm:flex-none" title={`${practiceAt.name}, in the wind blowing there today`}>Today's wind</button>}
              <button type="button" onClick={surprise} className="sim-btn-lg flex-1 sm:flex-none">Surprise me</button>
              <button type="button" onClick={() => onStart('race', s)} className="sim-btn-lg sim-btn-go sim-btn-green flex-1 sm:flex-none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 001.5.86l12.5-7.5a1 1 0 000-1.72L8.5 3.64A1 1 0 007 4.5z" /></svg>
                Start race
              </button>
            </div>
          </div>
          <div className="sim-set-groups">
            <SetupGroup title="Water and wind">
              <SetupRow icon="venue" label="Where" value={venue ? venue.short : 'Practice pond'} sub={venue ? windDirName : 'Sheltered, tree-lined'} onClick={() => setPick('venue')} />
              <SetupRow icon="wind" label="Wind" value={strengthName} sub={CHARACTER[s.windCharacter][0]} onClick={() => setPick('wind')} />
              <SetupRow icon="water" label="Water" value={WATER[s.seaState][0]} sub={s.seaState === 'flat' ? 'Glassy' : s.seaState === 'chop' ? 'Waves 4 cm' : 'Waves 10 cm, whitecaps'} onClick={() => setPick('water')} />
            </SetupGroup>
            <SetupGroup title="Boat and fleet">
              <SetupRow icon="boat" label="Your boat" value={CLASS_LABEL[s.classId]} sub={`${yachtFor(yard, s.classId) ? `${yachtFor(yard, s.classId)!.name}, sail` : 'Sail'} ${sailFor(yard, s.classId, me).sail}${s.classId === 'IOM' && s.rig ? `, ${s.rig} rig` : ''}`} onClick={() => setPick('boat')} />
              <SetupRow icon="fleet" label="Fleet" value={`${s.fleetSize} boats`} sub="Including you" onClick={() => setPick('fleet')} />
              <SetupRow icon="skippers" label="Skippers" value={LEVEL_NAME[s.level]} sub={s.level === 'club' ? 'A few sharp starters' : s.level === 'state' ? 'Solid, rarely foul' : s.level === 'national' ? 'Fight for the favoured end' : 'On the line at the gun'} onClick={() => setPick('skippers')} />
            </SetupGroup>
            <SetupGroup title="The race">
              <SetupRow icon="course" label="Course" value={`${s.laps} lap${s.laps > 1 ? 's' : ''}, ${s.length}`} sub="Windward–leeward, gate" onClick={() => setPick('course')} />
              <SetupRow icon="start" label="Start" value={startFinding && !startSeq ? 'StartBox' : startName} sub={startSeq ? (startSeq.club ? "Your club's sequence" : 'StartBox sequence') : startFinding ? "Finding your club's sequence…" : 'Called by the simulator'} onClick={() => setPick('start')} />
              <SetupRow icon="aids" label="Coaching" value={`Alfie: ${s.coach === 'full' ? 'full' : s.coach === 'hints' ? 'hints' : 'off'}`} sub={`${s.autoTrim ? 'Auto-trim' : 'Sails on your stick'}, ${s.view === 'bank' ? 'bank view' : 'from above'}`} onClick={() => setPick('aids')} />
            </SetupGroup>
          </div>
        </section>
            {transmitter && <TransmitterCard {...transmitter} />}
        {live && <LiveSection {...live} />}

        {events && (events.length > 0 || canSet) && (
          <section className="flex flex-col gap-3.5" aria-labelledby="ev-title">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="ev-title" className="sim-h2">Events</h2>
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>A series of races, each open for a while and the same race for everyone, scored like a regatta with drops.</p>
              </div>
              {canSet && !settingEvent && <Btn onClick={() => setSettingEvent(true)}>Set up an event</Btn>}
            </div>
            {settingEvent && canSet && onCreateEvent && (
              <EventForm canEveryone={canSet.everyone} onCreate={onCreateEvent} onDone={() => setSettingEvent(false)}
                line={`${CLASS_LABEL[s.classId]} · ${s.fleetSize} boats · ${LEVEL_NAME[s.level]} skippers · ${venue ? venue.short : 'the practice pond'} · ${s.laps} lap${s.laps > 1 ? 's' : ''}`} />
            )}
            {events.length === 0 && !settingEvent && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>No events yet. Set up the first from the race you've set up above.</p>}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
              {events.slice(0, 6).map(e => {
                const st = eventState(e);
                return (
                  <button key={e.id} type="button" onClick={() => onEvent?.(e)} className="flex cursor-pointer flex-col gap-2 sim-card p-5 text-left hover:bg-white/[0.05]">
                    <div className="flex items-center gap-2">
                      <Cap>{e.club_id ? 'Club event' : 'Open event'}</Cap>
                      <Chip tone={st.open.length ? 'blue' : 'plain'} className="ml-auto">{eventStatusText(e)}</Chip>
                    </div>
                    <p className="m-0 text-[16px] font-semibold text-[#F1F4FA]">{e.title}</p>
                    <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>{eventLine(e)} · {e.tries === 'first' ? 'first try counts' : 'best try counts'}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {challenges && (challenges.length > 0 || canSet) && (
          <section className="flex flex-col gap-3.5" aria-labelledby="ch-title">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="ch-title" className="sim-h2">Challenges</h2>
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>The same race for everyone, with a leaderboard. Race the leader's ghost to find the time.</p>
              </div>
              {canSet && !setting && <Btn onClick={() => setSetting(true)}>Set a challenge</Btn>}
            </div>
            {setting && canSet && onCreateChallenge && <SetChallenge canEveryone={canSet.everyone} onCreate={onCreateChallenge} onDone={() => setSetting(false)} />}
            {challenges.length === 0 && !setting && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>No challenges yet. Set the first one from the race you've set up above.</p>}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
              {challenges.slice(0, 6).map(c => (
                <button key={c.id} type="button" onClick={() => onChallenge?.(c)} className="flex cursor-pointer flex-col gap-2 sim-card p-5 text-left hover:bg-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <Cap>{c.club_id ? 'Club challenge' : 'Open challenge'}</Cap>
                    <Chip tone={isOpen(c) ? 'blue' : 'plain'} className="ml-auto">{closesText(c)}</Chip>
                  </div>
                  <p className="m-0 text-[16px] font-semibold text-[#F1F4FA]">{c.title}</p>
                  <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>{challengeLine(c)}</p>
                </button>
              ))}
            </div>
          </section>
        )}
          </>
        )}

        {door === 'train' && (
          <div className="flex min-w-0 flex-col gap-5">
            <div className={cx('grid items-start gap-5', !simple && grad && 'xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]')}>
              {learn && !learn.done ? <LearnCard path={learn} onGo={goLearn} /> : onLink && <WeekCard week={week} level={st.level} onGo={onLink} onPlay={onPlay} />}
              {!simple && grad && <LicenceCard lic={grad} onGo={g => (g === 'race' ? go('race') : onOpen(g))} />}
            </div>
              <div className="flex flex-wrap items-center gap-4 sim-card p-4 sm:px-5">
                <span aria-hidden="true" className="sim-set-icon flex h-11 w-11 shrink-0 items-center justify-center text-[#C9B4FF]"><Glyph name="flag" size={21} /></span>
                <div className="min-w-[200px] flex-1">
                  <Cap>Call of the day</Cap>
                  <p className="m-0 mt-0.5 font-display text-[17px] font-bold leading-tight">{callToday ? `Called: ${callToday.points} of 2` : 'One incident. Who broke a rule, and which one?'}</p>
                  <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>{callToday ? `${judgedToday} of today's five cases done. The same five for everyone, new tomorrow.` : "Watch a short clip from above and make the call. The simulator's referee gives the verdict."}</p>
                </div>
                <Btn primary={!callToday} onClick={() => onOpen('judge')}>{callToday ? (judgedToday < 5 ? 'Carry on judging' : 'More cases') : 'Make the call'}</Btn>
              </div>
            <section className="flex flex-col gap-4" aria-labelledby="lib-title">
              <div>
                <h2 id="lib-title" className="sim-h2">The library</h2>
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Four shelves: tactics, rules, starts and race moments. Learn it here, then take it to the pond.</p>
              </div>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))' }}>
                <AcademyCard icon="book" tint="#34D3C8" kicker={`Tactics · ${PLAYS.length} plays`} title="The Playbook" text="Race strategy and tactics for radio sailing: starts, the beat, marks, the run and coming back. Read a play, then practise it."
                  progress={0} progressText="Strategy and tactics" action={() => onOpen('playbook')} actionLabel="Open" />
                <AcademyCard icon="book" tint="#B692FF" kicker="Rules · 6 modules" title="Rules Academy" text="26 situations from the Racing Rules with Appendix E. Answer each one, then sail it, and earn your licence."
                  progress={lic.level / 6} progressText={`Level ${lic.level}/6`} action={() => onOpen('academy')} actionLabel={lic.level ? 'Next module' : 'Begin'} />
                <AcademyCard icon="flag" tint="#4DA3FF" kicker="Starts · 12 drills" title="Start Trainer" text="Time on distance, the favoured end, port-tack starts, crowded lines, and getting back after a recall."
                  progress={stars.of ? stars.got / stars.of : 0} progressText={`${stars.got}/${stars.of} stars`} action={() => onOpen('trainer')} actionLabel={stars.got ? 'Carry on' : 'Begin'} />
                <AcademyCard icon="flask" tint="#FF9F43" kicker={`Race moments · ${LAB.length} scenarios`} title="Scenario Lab" text="Boat speed upwind and down, tacks, gybes and roundings against the clock, and classic race moments. Replay each until you win it."
                  progress={LAB.length ? labWon / LAB.length : 0} progressText={`${labWon}/${LAB.length} won`} action={() => onOpen('lab')} actionLabel={labWon ? 'Carry on' : 'Begin'} />
                {onLink && (newcomer || (firstWon > 0 && firstWon < FIRST.length)) && (
                  <AcademyCard icon="boat" tint="#7DB7FF" kicker="Learn to sail · 5 steps" title="First sail" text="Never sailed a radio yacht? Steer her, trim the sail, tack, round a mark and cross a start line, a step at a time."
                    progress={firstWon / FIRST.length} progressText={`${firstWon}/${FIRST.length} done`} action={() => onLink({ kind: 'lab', id: (nextFirst(id => !!training.lab[id]?.won) ?? FIRST[0]).id, label: 'First sail' })} actionLabel={firstWon === 0 ? 'Begin' : 'Carry on'} />
                )}
              </div>
            </section>
          </div>
        )}

        {door === 'you' && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-5">
              <LevelCard st={st} clean={clean} simple={simple} />
            <section className="flex flex-col gap-4 sim-card p-5" aria-labelledby="pf-title">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2E7BFF] to-[#8A4DFF] font-display text-[17px] font-extrabold text-white">{sailFor(yard, s.classId, me).sail}</span>
                <div className="min-w-0">
                  <h2 id="pf-title" className="sim-h3 truncate">{me ? me.name : 'Your skipper profile'}</h2>
                  <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{sk ? `From your last ${sk.races} race${sk.races > 1 ? 's' : ''}${synced ? '' : ' on this device'}` : synced ? 'Saved to your account' : 'Kept on this device'}</p>
                </div>
              </div>
              {me && sailFor(yard, s.classId, me).from === 'none' && (
                <p className="m-0 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] leading-snug" style={{ color: C.mute }}>
                  Add your {CLASS_LABEL[s.classId]} in My Garage, or give her a number in Design your yacht, to race with your own sail number. Until then you're <b className="text-[#F1F4FA]">01</b>.
                </p>
              )}
              {!sk ? (
                <p className="m-0 text-[13.5px] leading-normal" style={{ color: C.mute }}>Sail a race and your profile starts here: starts, upwind, roundings, downwind and rules, worked out from how you race.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2.5">
                    <SkillBar label="Starts" v={sk.starts} />
                    <SkillBar label="Upwind" v={sk.upwind} />
                    <SkillBar label="Roundings" v={sk.roundings} />
                    <SkillBar label="Downwind" v={sk.downwind} />
                    <SkillBar label="Rules" v={sk.rules} />
                  </div>
                  <p className="m-0 text-[13px] leading-normal" style={{ color: C.mute }}>
                    {weakest && `${weakest[0][0].toUpperCase()}${weakest[0].slice(1)} is where you have most to gain.`}
                    {sk.avgPlace !== null && ` Average finish: top ${Math.round(sk.avgPlace * 100)}% of the fleet.`}
                    {sk.wins > 0 && ` ${sk.wins} win${sk.wins > 1 ? 's' : ''}.`}
                  </p>
                  <div className="flex flex-col">
                    {profile.races.slice(0, 5).map(r => (
                      <div key={r.at} className="flex items-center gap-3 border-t border-white/[0.055] py-2 text-[13px]">
                        <span className="w-12 font-semibold tabular-nums">{r.mode === 'start' ? 'Start' : r.place ? ordinal(r.place) : r.status.toUpperCase()}</span>
                        <span className="min-w-0 flex-1 leading-snug" style={{ color: C.mute }}>{r.cls} · {levelName(r.level)} · {r.wind}</span>
                        <span className="tabular-nums" style={{ color: C.mute }}>{new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                      </div>
                    ))}
                  </div>
                  {pp && (
                    <p className="m-0 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] leading-snug" style={{ color: C.mute }}>
                      <b className="font-semibold text-[#F1F4FA]">Passport:</b> {pp.total.grade && pp.against
                        ? `${GRADE_NAME[pp.total.grade]} overall against ${pp.against}, with Gold in ${pp.skills.filter(k => k.grade === 'gold').length} of 8 parts.`
                        : pp.graded >= 3 ? `No grade overall yet against ${pp.against ?? 'the fleet'}: give away less than a quarter of the fleet for Bronze.`
                          : `${pp.graded} of the 3 finished races it takes to be graded.`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn small onClick={() => onOpen('passport')}>Open your skill passport</Btn>
                    <Btn quiet small onClick={() => { clearProfile(); onProfileCleared(); }}>Clear my history</Btn>
                  </div>
                </>
              )}
            </section>
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <YachtCard yard={yard} cls={s.classId} me={me} onDesign={() => onOpen('yacht')} />
              {career && (!simple || career.medals.length > 0) && (
                <section className="flex flex-col gap-3 sim-card p-5" aria-labelledby="medals-title">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id="medals-title" className="sim-h3 min-w-0 flex-1">Medals and titles</h2>
                    {onCareer && <Btn small onClick={onCareer}>The Circuit</Btn>}
                  </div>
                  <MedalShelf medals={career.medals} />
                </section>
              )}
              {onYear && (
                <section className="sim-card flex flex-wrap items-center gap-4 p-5" aria-labelledby="year-title">
                  <div className="min-w-[220px] flex-1">
                    <h2 id="year-title" className="sim-h3">Your {new Date().getFullYear()} in sailing</h2>
                    <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>The year so far: your races, your rating through the year, where the lengths went then and lately, and your medals.</p>
                  </div>
                  <Btn onClick={onYear}>See your year</Btn>
                </section>
              )}
              {comfort && onComfort && <ComfortCard comfort={comfort} helpNow={helpNow} onChange={onComfort} />}
              {onWay && <WaySwitch way={way} newcomer={!!training.newcomer} onChoose={onWay} />}
              {onReset && <StartAgain onReset={onReset} hasYachts={yard.yachts.length > 0} synced={synced} />}
              {transmitter && <TransmitterCard {...transmitter} />}
            </div>
          </div>
        )}
      </div>

      {/* ── The sheets ── */}
      {pick === 'venue' && (
        <Sheet icon="venue" title="Where you're sailing" text="A real club's water, drawn from the map and seen from its bank, or a sheltered practice pond." onClose={closePick}
          more={venue ? 'The map, the wind and the sea' : 'The sea'}>
          <Opts>
            {venueList.map(d => <Opt key={d.id} on={s.venue === d.id} onClick={() => set({ venue: d.id, windPick: 0 })} title={d.short} badge={draftIds.has(d.id) ? 'Draft' : mine(d) ? 'Your club' : undefined} text={d.place ? `${d.place}.` : d.name} />)}
            <Opt on={s.venue === 'pond'} onClick={() => set({ venue: 'pond' })} title="Practice pond" text="A sheltered pond lined with trees. The wind blows straight up it." />
          </Opts>
          {venue && vWind && (
            <>
              {venue.traits && <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>{venue.traits.about}</p>}
              <VenuePick def={venue} spot={spot} onSpot={sp => { const spots = { ...(s.spots ?? {}) }; if (sp) spots[venue.id] = sp; else delete spots[venue.id]; set({ spots }); }}
                windFrom={mapWind} windName={s.windDir === 'usual' ? vWind.name : s.windDir === 'today' ? "Today's wind" : vWind.name}
                classId={s.classId} length={s.length} fleetSize={s.fleetSize} laps={s.laps} />
              <Opts label="The wind" cols={2}>
                {windsOf(venue).map((w, i) => (
                  <Opt key={w.name} on={s.windDir === 'usual' && (s.windPick ?? 0) === i} onClick={() => set({ windDir: 'usual', windPick: i, windCharacter: w.character })}
                    title={`${w.name[0].toUpperCase()}${w.name.slice(1)}`} badge={i === 0 ? 'Usual' : undefined}
                    text={`${w.when ? `${w.when}. ` : ''}From ${String(w.from).padStart(3, '0')}°, ${CHARACTER_WORD[w.character]}.${w.pays ? (w.pays === 'bank' ? ' More breeze along your bank.' : ' More breeze out from your bank.') : ''}`} />
                ))}
                <Opt on={s.windDir === 'today'} onClick={() => set({ windDir: 'today' })} title="Today's wind" text="What's blowing at the club right now." />
                <Opt on={s.windDir === 'any'} onClick={() => set({ windDir: 'any' })} title="Any direction" text="Different every race, so you learn the whole of the water." />
              </Opts>
              {windHint && <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>{windHint}</p>}
              <SeaOpts value={s.seaState} onPick={w => set({ seaState: w })} />
              {venue.traits && venue.traits.notes.length > 0 && (
                <div className="sim-card p-3.5">
                  <Cap>Local knowledge</Cap>
                  <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0 text-[13px] leading-snug" style={{ color: C.mute }}>
                    {venue.traits.notes.map(n => <li key={n} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#4DA3FF]" />{n}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
          {!venue && <SeaOpts value={s.seaState} onPick={w => set({ seaState: w })} />}
          {waterAdmin && clubId && (
            <div className="flex flex-col gap-2 rounded-2xl border border-[rgba(77,163,255,0.3)] bg-[rgba(46,123,255,0.07)] p-3.5">
              <Cap>Your club's water · admins</Cap>
              <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>Build your club's water from its venue location and the map, and put its winds and local tips in your own words.</p>
              {myWaters.map(w => (
                <div key={w.rowId} className="flex flex-wrap items-center gap-2">
                  <b className="min-w-0 flex-1 truncate text-[14px]">{w.def.name}</b>
                  {w.published ? <Chip tone="good">Published</Chip> : <Chip tone="warn">Draft</Chip>}
                  <Btn small onClick={() => setBuilding(w)}>Change</Btn>
                </div>
              ))}
              <div><Btn small primary={!myWaters.length} onClick={() => setBuilding('new')}>{startFrom ? `Put ${startFrom.short} in your club's words` : myWaters.length ? 'Set up another venue' : "Set up your club's water"}</Btn></div>
            </div>
          )}
        </Sheet>
      )}
      {building && clubId && (
        <VenueBuilder clubId={clubId} existing={building === 'new' ? null : building} startFrom={building === 'new' ? startFrom : null} onClose={() => setBuilding(null)}
          onSaved={w => { onWaters?.([...waters.filter(x => x.rowId !== w.rowId), w]); set({ venue: w.def.id, windDir: 'usual', windPick: 0 }); setBuilding(null); }}
          onRemoved={id => { const gone = waters.find(x => x.rowId === id); onWaters?.(waters.filter(x => x.rowId !== id)); if (gone && s.venue === gone.def.id) set({ venue: builtIn?.id ?? 'pond', windPick: 0 }); setBuilding(null); }} />
      )}
      {pick === 'boat' && (
        <Sheet icon="boat" title="Your boat" text="The whole fleet sails the same class." onClose={closePick}>
          <Opts>
            {(['IOM', 'DF95', 'DF65', '10R', 'M'] as ClassId[]).map(c => <Opt key={c} on={s.classId === c} onClick={() => set({ classId: c })} title={CLASS_LABEL[c]} text={CLASS_TEXT[c]} badge={sailFor(yard, c, me).from !== 'none' ? `Sail ${sailFor(yard, c, me).sail}` : undefined} />)}
          </Opts>
          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => { closePick(); onOpen('yacht'); }}>Design your yacht</Btn>
            <span className="text-[13px]" style={{ color: C.mute }}>Her hull colour, sail tapes, corner patches and number.</span>
          </div>
          {s.classId === 'IOM' && (
            <>
              <Opts label="Your rig for the day" cols={4}>
                <Opt on={!s.rig} onClick={() => set({ rig: null })} title="Alfie picks" text="The right rig for the breeze, like the rest of the fleet." />
                <Opt on={s.rig === 'A'} onClick={() => set({ rig: 'A' })} title="A rig" text="The big one. Up to about 12 knots." />
                <Opt on={s.rig === 'B'} onClick={() => set({ rig: 'B' })} title="B rig" text="From about 12 knots to 20." />
                <Opt on={s.rig === 'C'} onClick={() => set({ rig: 'C' })} title="C rig" text="The storm rig. 20 knots and over." />
              </Opts>
              <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>Choose it yourself and you live with it for the race, as you do at the pond. Too small and she's short of drive in the lulls; too big and she lies over, loses her rudder and buries her bow on the run. The other skippers carry the right rig for the breeze.</p>
            </>
          )}
        </Sheet>
      )}
      {pick === 'fleet' && (
        <Sheet icon="fleet" title="Fleet" text="Boats on the line, including you." onClose={closePick}>
          <Opts cols={4}>
            {[6, 8, 12, 16].map(n => <Opt key={n} on={s.fleetSize === n} onClick={() => set({ fleetSize: n })} title={String(n)} text={n === 6 ? 'Room to learn' : n === 8 ? 'A club day' : n === 12 ? 'A busy line' : 'A championship fleet'} />)}
          </Opts>
        </Sheet>
      )}
      {pick === 'skippers' && (
        <Sheet icon="skippers" title="Who you race" text="How good the other skippers are. Every fleet is a mix, as at any club: sharp starters, tight rounders, shift readers and quick boats, some on form and some not. Early in the countdown the fleet list says what each is known for." onClose={closePick}>
          <Opts>
            {(['club', 'state', 'national', 'world'] as SkipperLevel[]).map(l => <Opt key={l} on={s.level === l} onClick={() => set({ level: l })} title={LEVEL_NAME[l]} text={LEVEL_TEXT[l]} />)}
          </Opts>
          <Toggle on={s.forgetfulSkippers} onChange={v => set({ forgetfulSkippers: v })} label="Forgetful skippers" text="Some skippers forget their penalty, so hail a protest when they foul you." />
        </Sheet>
      )}
      {pick === 'wind' && (
        <Sheet icon="wind" title="Wind" text={strengthHint ?? 'How hard it blows, and what it does.'} onClose={closePick}>
          <Opts label="Strength" cols={3}>
            {todayKn !== null && <Opt on={useToday} onClick={() => set({ todayStrength: true })} title={`Today's ${Math.round(todayKn)} kn`} text="The real breeze at the club." />}
            <Opt on={!useToday && s.windStrength === 'light'} onClick={() => set({ windStrength: 'light', todayStrength: false })} title="Light" badge="3–6 kn" text="Keep her moving. Quiet water, birdsong." />
            <Opt on={!useToday && s.windStrength === 'medium'} onClick={() => set({ windStrength: 'medium', todayStrength: false })} title="Medium" badge="7–12 kn" text="A proper sailing breeze." />
            <Opt on={!useToday && s.windStrength === 'fresh'} onClick={() => set({ windStrength: 'fresh', todayStrength: false })} title="Fresh" badge="13–18 kn" text="Boats heel hard, and nose-dive downwind in the gusts." />
          </Opts>
          <Opts label="What it does">
            {(Object.keys(CHARACTER) as WindCharacter[]).map(c => <Opt key={c} on={s.windCharacter === c} onClick={() => set({ windCharacter: c })} title={CHARACTER[c][0]} text={CHARACTER[c][1]} />)}
          </Opts>
        </Sheet>
      )}
      {pick === 'water' && (
        <Sheet icon="water" title="Sea state" text="Waves slow her upwind and let her surf downwind." onClose={closePick}>
          <SeaOpts bare value={s.seaState} onPick={w => set({ seaState: w })} />
        </Sheet>
      )}
      {pick === 'course' && (
        <Sheet icon="course" title="Course" text={`Windward–leeward with an offset mark and a gate, finishing upwind. About ${minutes(s)} minutes as set.`} onClose={closePick}>
          <Opts label="Laps" cols={3}>
            {[1, 2, 3].map(n => <Opt key={n} on={s.laps === n} onClick={() => set({ laps: n })} title={`${n} lap${n > 1 ? 's' : ''}`} />)}
          </Opts>
          <Opts label="Length of the beat" cols={3}>
            <Opt on={s.length === 'short'} onClick={() => set({ length: 'short' })} title="Short" text="Quick races, lots of corners." />
            <Opt on={s.length === 'medium'} onClick={() => set({ length: 'medium' })} title="Medium" text="A club course." />
            <Opt on={s.length === 'long'} onClick={() => set({ length: 'long' })} title="Long" text="Room for the shifts to pay." />
          </Opts>
        </Sheet>
      )}
      {pick === 'start' && (
        <Sheet icon="start" title="Start sequence" onClose={closePick}
          text={startSeq ? `${startSeq.club ? "Your club's" : 'The StartBox'} ${startSeq.name} sequence${startSeq.audio ? ', the recording you hear at the pond' : ''}, in step with the race clock.` : 'No StartBox sequence was found for your club, so the simulator calls the start: each minute, every 10 s in the last minute and every second in the last 10 (Appendix E).'}>
          <Opts>
            {startOptions(sequences, startSeq).map(o => {
              const q = sequences.find(x => x.id === o.value);
              return <Opt key={o.value} on={(startSeq ? startSeq.id : `b${s.sequenceSeconds}`) === o.value} title={o.label} text={q ? (q.club ? "Your club's sequence" : 'A StartBox sequence') : 'Called by the simulator'}
                onClick={() => set(q ? { startSeq: q.id, sequenceSeconds: q.seconds } : { startSeq: null, sequenceSeconds: Number(String(o.value).slice(1)) })} />;
            })}
          </Opts>
        </Sheet>
      )}
      {pick === 'aids' && (
        <Sheet icon="aids" title="Coaching and aids" text={comfort?.help === 'steps' ? `Alfie's help is stepping down as you improve: at your level he ${HELP_WORDS[helpNow]}. Choose here to set it yourself.` : 'How much help you get, and how you see the race.'} onClose={closePick}>
          <Opts label="Alfie's coaching" cols={3}>
            <Opt on={s.coach === 'full'} onClick={() => set({ coach: 'full' })} title="Full" text="Alfie calls it aloud as you sail (bear away, ease, tack on the header) and explains every rules incident." />
            <Opt on={s.coach === 'hints'} onClick={() => set({ coach: 'hints' })} title="Hints" text="Written tips as you sail. Incidents show as a banner." />
            <Opt on={s.coach === 'off'} onClick={() => set({ coach: 'off' })} title="Off" text="No tips. Incidents still show briefly." />
          </Opts>
          <div className="flex flex-wrap items-center gap-3">
            <Btn small onClick={hearAlfie}>Hear Alfie's voice</Btn>
            {voiceNote && <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }} role="status">{voiceNote}</p>}
          </div>
          <Opts label="View">
            <Opt on={s.view === 'bank'} onClick={() => set({ view: 'bank' })} title="From the bank" text="From the control area, the way you see a race. Press V to switch." />
            <Opt on={s.view === 'top'} onClick={() => set({ view: 'top' })} title="From above" text="A chart view with laylines." />
          </Opts>
          <Toggle on={s.autoTrim} onChange={v => set({ autoTrim: v })} label="Auto-trim" text="Off: the sails go where your stick puts them, like the real thing. On: they trim themselves with the stick right in." />
        </Sheet>
      )}
    </div>
  );
}
