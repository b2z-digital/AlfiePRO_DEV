// The pieces of the layered home screen: the AlfiePRO lockup, the "Next up" card, the three doors
// (Race, Train, You), the question that's asked once about how you want to use the Academy, this
// week's programme, the licence to the next level, and your level. They sit as glass panels over
// the live render of the fleet, the way Design your yacht sits over its stage.
import React from 'react';
import { ArrowRight, Check, ChevronDown, ChevronLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import type { SkipperLevel } from '@/sim/types';
import { practiceLink } from './playbook';
import type { LevelLicence, Requirement, Session, Week } from './programme';
import { SYLLABUS } from './programme';
import type { Way } from './progress';
import { LEVELS, LEVEL_FROM, LEVEL_NAME, type Standing } from './rating';
import type { TrainLink } from './stats';
import { AlfieOrb, Btn, C, Cap, Chip, cx } from './ui';

export type Door = 'home' | 'race' | 'train' | 'you';
export const DOOR_NAME: Record<Exclude<Door, 'home'>, string> = { race: 'Race', train: 'Train', you: 'You' };

const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
const LEVEL_TINT: Record<SkipperLevel, string> = { club: '#7FA6CF', state: '#F5A54A', national: '#5B8DEF', world: '#9B7BFF' };

/** The AlfiePRO mark and wordmark, set as the platform sets them, with the product's name beside. */
export function Brand({ onHome }: { onHome?: () => void }) {
  const inner = (
    <>
      <Logo size="small" className="!h-9 !w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="text-[19px] tracking-wide text-white" style={{ fontFamily: DISPLAY }}><span className="font-thin">Alfie</span><span className="font-bold">PRO</span></span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'rgba(241,244,250,.78)' }}>Sailing Academy</span>
      </span>
    </>
  );
  return onHome
    ? <button type="button" onClick={onHome} aria-label="Sailing Academy home" className="sim-brand cursor-pointer border-0 bg-transparent p-0 text-left">{inner}</button>
    : <div className="sim-brand">{inner}</div>;
}

/** The two ways of using the Academy, always in reach at the top of its front. */
export function WayToggle({ way, onChoose }: { way: Way; onChoose: (w: Way) => void }) {
  return (
    <div className="sim-way-toggle" role="group" aria-label="How you use the Academy">
      <button type="button" aria-pressed={way === 'simple'} onClick={() => onChoose('simple')}>Sail better</button>
      <button type="button" aria-pressed={way === 'full'} onClick={() => onChoose('full')}>Race</button>
    </div>
  );
}

/** The race as it's set up, each part a button that opens its picker: your boat first. */
export function SetupChips({ items }: { items: { what: string; value: string; onPick: () => void }[] }) {
  return (
    <div className="sim-chips" role="group" aria-label="Your race, as set up. Press a part to change it.">
      {items.map(i => (
        <button key={i.what} type="button" className="sim-chip-btn" onClick={i.onPick} title={`Change ${i.what.toLowerCase()}`}>
          <small>{i.what}</small>{i.value}<ChevronDown size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** Back to the front of the Academy, from inside a door. */
export function DoorBack({ onHome }: { onHome: () => void }) {
  return (
    <button type="button" onClick={onHome} className="sim-door-back">
      <ChevronLeft size={16} aria-hidden="true" />Sailing Academy
    </button>
  );
}

/** The one thing put in front of you. */
export function NextUpCard({ kicker, title, text, button, onGo, big, children }: { kicker: string; title: string; text: string; button: string; onGo: () => void; big?: boolean; children?: React.ReactNode }) {
  return (
    <section className={cx('sim-glass sim-next', big && 'sim-next-big')} aria-labelledby="next-title">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>{kicker}</p>
        <h2 id="next-title" className="sim-next-title">{title}</h2>
        <p className="sim-next-text">{text}</p>
        {children}
      </div>
      <button type="button" onClick={onGo} className="sim-btn-lg sim-btn-go sim-next-go">{button}<ArrowRight size={18} aria-hidden="true" /></button>
    </section>
  );
}

/** A way in: Race, Train or You. */
export function DoorCard({ title, status, lines, onOpen, children }: { title: string; status: string; lines: string[]; onOpen: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onOpen} className="sim-glass sim-door">
      {children && <span className="sim-door-art" aria-hidden="true">{children}</span>}
      <span className="flex items-center gap-3">
        <span className="sim-door-title">{title}</span>
        <ArrowRight size={20} aria-hidden="true" className="sim-door-arrow ml-auto" />
      </span>
      <span className="block text-[13.5px] font-semibold" style={{ color: C.blueSoft }}>{status}</span>
      <span className="mt-1 flex flex-col gap-0.5 text-[13.5px] leading-snug" style={{ color: C.mute }}>{lines.map(l => <span key={l}>{l}</span>)}</span>
    </button>
  );
}

/** Asked once: how do you want to use the Academy? No answer means the simple way. */
export function WayAsk({ onChoose }: { onChoose: (w: Way) => void }) {
  return (
    <section className="sim-glass flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="way-title">
      <div>
        <h2 id="way-title" className="m-0 text-[21px] font-bold leading-tight" style={{ fontFamily: DISPLAY }}>What would you like from the Academy?</h2>
        <p className="m-0 mt-1 text-[14.5px] leading-snug" style={{ color: C.mute }}>Choose one. You can change it any time, under You.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onChoose('simple')} className="sim-way">
          <span className="sim-way-title">Help me sail better</span>
          <span className="sim-way-text">A session picked for you each time, a practice race when you want one, and how you're going in plain words.</span>
        </button>
        <button type="button" onClick={() => onChoose('full')} className="sim-way">
          <span className="sim-way-title">I want to race</span>
          <span className="sim-way-text">All of that, and your rating, your licence to the next level, races with your mates and club events.</span>
        </button>
      </div>
    </section>
  );
}

function SessionRow({ s, n, onGo, onPlay }: { s: Session; n: number; onGo: (l: TrainLink) => void; onPlay?: (id: string) => void }) {
  const link = practiceLink(s.link);
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] py-3 last:pb-0">
      <span aria-hidden="true" className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold', s.done ? 'bg-[rgba(126,226,168,0.18)] text-[#7EE2A8]' : 'bg-white/[0.08]')}>{s.done ? <Check size={15} /> : n}</span>
      <span className="min-w-[200px] flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{link.label.replace(/^(Start Trainer|Scenario): /, '')}{s.kind === 'keep' && <Chip>Keep it sharp</Chip>}</span>
        <span className="block text-[13px] leading-snug" style={{ color: C.mute }}>{s.why}</span>
        {onPlay && <button type="button" onClick={() => onPlay(s.play.id)} className="sim-link mt-0.5 text-[12.5px]">The play: {s.play.title}</button>}
      </span>
      <Btn small primary={!s.done} onClick={() => onGo(link)}>{s.done ? 'Again' : 'Go'}</Btn>
    </li>
  );
}

/** This week's three sessions, under the aim of the level you sail at. */
export function WeekCard({ week, level, onGo, onPlay }: { week: Week; level: SkipperLevel; onGo: (l: TrainLink) => void; onPlay?: (id: string) => void }) {
  const syl = SYLLABUS[level];
  return (
    <section className="flex flex-col gap-3 sim-card p-4 sm:p-5" aria-labelledby="week-title">
      <div className="flex flex-wrap items-center gap-3">
        <AlfieOrb size={36} />
        <div className="min-w-[200px] flex-1">
          <Cap>Your {LEVEL_NAME[level]} programme</Cap>
          <h2 id="week-title" className="sim-h3 mt-0.5">{syl.aim}</h2>
          <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>{syl.text} {syl.stars === 1 ? 'One star passes a drill at this level.' : `${syl.stars === 2 ? 'Two' : 'Three'} stars pass a drill at this level.`}</p>
        </div>
        <Chip tone={week.done === week.sessions.length ? 'good' : 'blue'}>{week.done} of {week.sessions.length} this week</Chip>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {week.sessions.map((s, i) => <SessionRow key={`${s.link.kind}:${s.link.id}`} s={s} n={i + 1} onGo={onGo} onPlay={onPlay} />)}
      </ol>
    </section>
  );
}

function ReqRow({ r, onGo }: { r: Requirement; onGo: (go: Requirement['go']) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] py-2.5 last:pb-0">
      <span aria-hidden="true" className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', r.met ? 'bg-[rgba(126,226,168,0.18)] text-[#7EE2A8]' : 'bg-white/[0.08] text-white/50')}>{r.met && <Check size={14} />}</span>
      <span className="min-w-[180px] flex-1">
        <span className="block text-[14px] font-semibold">{r.label}: {r.have}</span>
        <span className="block text-[12.5px]" style={{ color: C.mute }}>{r.met ? 'Done' : `Takes ${r.need}`}</span>
      </span>
      {!r.met && <Btn small onClick={() => onGo(r.go)}>{r.go === 'race' ? 'Race' : 'Go'}</Btn>}
    </li>
  );
}

/** The licence that takes you up a level: what you have, what it takes. */
export function LicenceCard({ lic, onGo }: { lic: LevelLicence; onGo: (go: Requirement['go']) => void }) {
  return (
    <section className="flex flex-col gap-2 sim-card p-4 sm:p-5" aria-labelledby="lic-title">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <Cap>To graduate</Cap>
          <h2 id="lic-title" className="sim-h3 mt-0.5">Your {LEVEL_NAME[lic.to]} licence</h2>
        </div>
        <Chip tone={lic.ready ? 'good' : 'blue'}>{lic.ready ? 'Earned' : `${lic.met} of ${lic.reqs.length}`}</Chip>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">{lic.reqs.map(r => <ReqRow key={r.id} r={r} onGo={onGo} />)}</ul>
    </section>
  );
}

/** Your level: the rating, where it sits across the four levels, and how far the next one is. In the simple way, in words only. */
export function LevelCard({ st, clean, simple }: { st: Standing; clean: { races: number; fouls: number } | null; simple?: boolean }) {
  const span = LEVEL_FROM.world + 300 - 800;
  const at = Math.max(0, Math.min(1, (st.rating - 800) / span));
  return (
    <section className="flex flex-col gap-3 sim-card p-5" aria-labelledby="lvl-title">
      <Cap>{st.placed ? `${LEVEL_NAME[st.level]} skipper` : 'Your level'}</Cap>
      {!st.placed ? (
        <>
          <h2 id="lvl-title" className="sim-h3">{st.races === 0 ? 'Three races find your level' : `${st.races} of 3 placement races sailed`}</h2>
          <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>Race any fleet. Each result is compared with every boat you sailed against, and after three you're placed: Club, Regional, National or World.</p>
        </>
      ) : simple ? (
        <>
          <h2 id="lvl-title" className="sim-h3">You're sailing at {LEVEL_NAME[st.level]} level</h2>
          <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>
            {st.next ? (st.next.gap <= 60 ? `${LEVEL_NAME[st.next.level]} level is close.` : `${LEVEL_NAME[st.next.level]} level is the next step.`) : 'The top level.'}
            {st.last !== null && st.last !== 0 && ` Your last race moved you ${st.last > 0 ? 'up' : 'down'} a little.`}
            {clean && ` You're breaking ${clean.fouls === 0 ? 'no rules' : `about ${clean.fouls} rule${clean.fouls === 1 ? '' : 's'}`} a race.`}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="lvl-title" className="m-0 text-[44px] font-bold leading-none tabular-nums tracking-tight" style={{ fontFamily: DISPLAY }}>{st.rating.toLocaleString()}</h2>
            {st.last !== null && st.last !== 0 && <span className="text-[14px] font-bold tabular-nums" style={{ color: st.last > 0 ? '#5CE0A6' : '#FF9F9F' }}>{st.last > 0 ? '+' : '−'}{Math.abs(st.last)}</span>}
            <span className="text-[13.5px]" style={{ color: C.mute }}>{st.next ? `${st.next.gap} to ${LEVEL_NAME[st.next.level]}` : 'World level'}</span>
          </div>
          <div className="relative mt-1" role="img" aria-label={`Rating ${st.rating}: ${LEVEL_NAME[st.level]} level`}>
            <div className="flex gap-[3px]">
              {LEVELS.map((l, i) => {
                const from = i === 0 ? 800 : LEVEL_FROM[l], to = i === 3 ? LEVEL_FROM.world + 300 : LEVEL_FROM[LEVELS[i + 1]];
                return <span key={l} className="h-[7px] rounded-full" style={{ flex: `${to - from} 0 0`, background: LEVEL_TINT[l], opacity: l === st.level ? 1 : 0.5 }} />;
              })}
            </div>
            <span className="absolute top-[-4px] h-[15px] w-[4px] rounded-full bg-white shadow-[0_0_0_2px_rgba(6,11,22,0.9)]" style={{ left: `calc(${(at * 100).toFixed(1)}% - 2px)` }} />
            <div className="mt-2 flex text-[12px]" style={{ color: C.mute }}>
              {LEVELS.map((l, i) => {
                const from = i === 0 ? 800 : LEVEL_FROM[l], to = i === 3 ? LEVEL_FROM.world + 300 : LEVEL_FROM[LEVELS[i + 1]];
                return <span key={l} style={{ flex: `${to - from} 0 0`, color: l === st.level ? LEVEL_TINT[l] : undefined, fontWeight: l === st.level ? 700 : 400 }}>{LEVEL_NAME[l]}</span>;
              })}
            </div>
          </div>
          <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>
            From {st.races} race{st.races === 1 ? '' : 's'} against the computer's skippers.
            {clean && <> Clean sailing: <b className="font-semibold text-[#F1F4FA]">{clean.fouls}</b> foul{clean.fouls === 1 ? '' : 's'} a race over your last {clean.races === 1 ? 'race' : clean.races}.</>}
          </p>
        </>
      )}
    </section>
  );
}

/** Which way you use the Academy, and the switch. */
export function WaySwitch({ way, onChoose }: { way: Way; onChoose: (w: Way) => void }) {
  return (
    <section className="flex flex-col gap-3 sim-card p-5" aria-labelledby="wayset-title">
      <div>
        <h2 id="wayset-title" className="sim-h3">How you use the Academy</h2>
        <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>{way === 'simple' ? 'Kept simple: your programme, a practice race and how you\'re going. Ratings and licences are out of sight.' : 'Everything: your rating, the licence to the next level, races with mates and events.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn small primary={way === 'simple'} aria-pressed={way === 'simple'} onClick={() => onChoose('simple')}>Help me sail better</Btn>
        <Btn small primary={way === 'full'} aria-pressed={way === 'full'} onClick={() => onChoose('full')}>I want to race</Btn>
      </div>
    </section>
  );
}
