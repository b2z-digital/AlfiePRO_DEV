// The skill passport: each part of racing, what you've been giving away and which way it's going,
// and a grade for how you stand against the fleets you race.
import { useState } from 'react';
import { CAUSE_WORDS, per, rate, type Cause } from './ledger';
import { focusPlay, focusWords, ledgerRaces, raceFocus } from './focus';
import { GRADED_MIN, GRADE_AT, GRADE_NAME, passport, trend, type Grade, type Skill } from './passport';
import type { Profile } from './profile';
import { causeLink, type TrainLink } from './stats';
import { AlfieOrb, Btn, C, Cap, Chip, Page } from './ui';

const n1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const MEDAL: Record<Grade, string> = { bronze: '#C98A5A', silver: '#C9D2E0', gold: '#F2C44D' };
/** The one colour the charts are drawn in (it passes the chart palette check on this dark surface). */
const LINE = '#3D8BFF';

/** A grade as a medal and its name (never the colour alone), or that there isn't one yet. */
function GradeBadge({ grade, graded }: { grade: Grade | null; graded: boolean }) {
  if (!grade) return <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-white/[0.06] px-2.5 text-xs font-semibold" style={{ color: C.mute }}>{graded ? 'No grade yet' : 'Not graded yet'}</span>;
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.14] bg-white/[0.05] pl-1.5 pr-2.5 text-xs font-semibold">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1h6l-1.4 4.2H6.4z" fill={MEDAL[grade]} opacity=".55" /><circle cx="8" cy="10" r="4.6" fill={MEDAL[grade]} /><circle cx="8" cy="10" r="2.6" fill="none" stroke="rgba(6,11,22,.45)" strokeWidth="1" /></svg>
      {GRADE_NAME[grade]}
    </span>
  );
}

/**
 * Lengths given away, race by race, oldest on the left: one line, the newest race marked, the
 * fleet's middle boat as a dashed line. Point at it for a race's own figure. Fewer is better.
 */
function Spark({ series, fleet, unit, tall }: { series: Skill['series']; fleet: number | null; unit: string; tall?: boolean }) {
  const [at, setAt] = useState<number | null>(null);
  const W = 300, H = tall ? 96 : 64, padX = 6, padT = 8, padB = 6;
  const top = Math.max(1, ...series.map(s => s.v), fleet ?? 0) * 1.12;
  const x = (k: number) => (series.length === 1 ? W / 2 : padX + (k / (series.length - 1)) * (W - 2 * padX));
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const last = series.length - 1, show = at ?? last;
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / Math.max(1, r.width);
    setAt(Math.max(0, Math.min(last, Math.round(((f * W - padX) / Math.max(1, W - 2 * padX)) * last))));
  };
  return (
    <div className="relative" onMouseMove={move} onMouseLeave={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
        aria-label={`Lengths given away ${unit}, oldest race first: ${series.map(s => n1(s.v)).join(', ')}.${fleet !== null ? ` The fleet's middle boat: ${n1(fleet)}.` : ''}`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.12)" strokeWidth={1} />
        {fleet !== null && <line x1={0} x2={W} y1={y(fleet)} y2={y(fleet)} stroke="rgba(235,240,255,.42)" strokeWidth={1} strokeDasharray="3 4" />}
        {series.length > 1 && <polyline points={series.map((s, k) => `${x(k).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {at !== null && <line x1={x(show)} x2={x(show)} y1={padT - 4} y2={y(0)} stroke="rgba(255,255,255,.22)" strokeWidth={1} />}
        <circle cx={x(show)} cy={y(series[show].v)} r={4.5} fill={LINE} stroke="#0C1424" strokeWidth={2} />
      </svg>
      <p className="m-0 mt-1 flex justify-between gap-3 text-[11.5px] tabular-nums" style={{ color: C.faint }}>
        <span>{at === null ? (series.length > 1 ? `${day(series[0].at)} to ${day(series[last].at)}` : day(series[0].at)) : `${day(series[show].at)}: ${n1(series[show].v)} lengths`}</span>
        {fleet !== null && <span>Dashed: the fleet's middle boat, {n1(fleet)}</span>}
      </p>
    </div>
  );
}

/** Which way it's going, in words: fewer lengths than before is better. */
function TrendLine({ s }: { s: Skill }) {
  const t = trend(s);
  if (!t) return <span style={{ color: C.faint }}>{s.series.length < 8 ? `Trend after ${8 - s.series.length} more race${8 - s.series.length === 1 ? '' : 's'}` : 'Steady'}</span>;
  if (t.dir === 'steady') return <span style={{ color: C.mute }}>Steady against your five races before</span>;
  return (
    <span className={t.dir === 'better' ? 'text-[#7EE2A8]' : 'text-[#FFCB96]'}>
      <span aria-hidden="true">{t.dir === 'better' ? '↓' : '↑'}</span> {n1(t.by)} {t.dir === 'better' ? 'fewer' : 'more'} than your five races before
    </span>
  );
}

/** Where you stand against the fleet, and what the next grade takes. */
function standing(s: Skill, against: string | null): string {
  if (s.beat === null || !against) return `Finish ${GRADED_MIN} races in a fleet to be graded.`;
  const pct = Math.round(s.beat * 100);
  const lead = `Less given away than ${pct}% of the fleet (${against}).`;
  return s.next ? `${lead} ${GRADE_NAME[s.next.grade]} at ${Math.round(s.next.at * 100)}%.` : lead;
}

function SkillCard({ s, against, graded, onLink, onPlay, link }: { s: Skill; against: string | null; graded: boolean; onLink: (l: TrainLink) => void; onPlay: (id: string) => void; link: TrainLink | null }) {
  const cause = s.part as Cause;
  return (
    <section className="flex flex-col gap-3 sim-card p-5" aria-label={s.name}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="sim-h3">{s.name}</h3>
          <p className="m-0 mt-1 text-[12.5px] leading-snug" style={{ color: C.mute }}>{CAUSE_WORDS[cause].what}</p>
        </div>
        <GradeBadge grade={s.grade} graded={graded} />
      </div>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[30px] font-bold leading-none tabular-nums">{s.now === null ? '–' : n1(s.now)}</span>
        <span className="text-[13px]" style={{ color: C.mute }}>lengths {per(cause)}</span>
      </p>
      <p className="m-0 text-[12.5px]"><TrendLine s={s} /></p>
      <Spark series={s.series} fleet={s.fleet} unit={per(cause)} />
      <p className="m-0 text-[12.5px] leading-snug" style={{ color: C.mute }}>{standing(s, against)}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {link && <Btn small onClick={() => onLink(link)}>{link.label}</Btn>}
        <Btn small quiet onClick={() => onPlay(focusPlay(cause).id)}>The play</Btn>
      </div>
    </section>
  );
}

export default function SimPassport({ profile, onBack, onLink, onPlay }: { profile: Profile; onBack: () => void; onLink: (l: TrainLink) => void; onPlay: (playId: string) => void }) {
  const pp = passport(profile);
  const races = ledgerRaces(profile);
  const newest = races[0]?.ledger ?? null;
  const focus = raceFocus(profile);
  const medals = pp ? (['gold', 'silver', 'bronze'] as Grade[]).map(g => ({ g, n: pp.skills.filter(s => s.grade === g).length })).filter(m => m.n > 0) : [];
  return (
    <Page onBack={onBack} title="Skill passport" text="Each part of racing: what you've been giving away, which way it's going, and how you stand against the fleets you race. Fewer lengths is better."
      side={pp ? <Chip tone="blue">{pp.races} race{pp.races === 1 ? '' : 's'}</Chip> : undefined}>

        {!pp ? (
          <div className="flex flex-wrap items-center gap-4 sim-card p-6">
            <AlfieOrb size={44} />
            <div className="min-w-[220px] flex-1">
              <p className="m-0 font-display text-[19px] font-bold">Sail a race to open your passport</p>
              <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>Every race you finish is measured against a perfect one and split by cause: the start, boat speed, tacks and gybes, shifts, laylines, roundings, dirty air and penalties. Your passport is built from those.</p>
            </div>
            <Btn primary onClick={onBack}>Set up a race</Btn>
          </div>
        ) : (
          <>
            <section className="grid gap-5 sim-card p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" aria-label="Everything together">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Cap>Everything together</Cap>
                  <span className="ml-auto"><GradeBadge grade={pp.total.grade} graded={pp.graded >= GRADED_MIN} /></span>
                </div>
                <p className="m-0 flex flex-wrap items-baseline gap-x-2.5">
                  <span className="font-display text-[46px] font-bold leading-none tabular-nums">{pp.total.now === null ? '–' : n1(pp.total.now)}</span>
                  <span className="text-[14px]" style={{ color: C.mute }}>lengths given away every ten minutes of racing</span>
                </p>
                <p className="m-0 text-[13px]"><TrendLine s={pp.total} /></p>
                <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>{standing(pp.total, pp.against)}</p>
                {medals.length > 0 && (
                  <p className="m-0 flex flex-wrap items-center gap-2 text-[13px]">
                    {medals.map(m => <span key={m.g} className="inline-flex items-center gap-1.5"><GradeBadge grade={m.g} graded /><span style={{ color: C.mute }}>in {m.n} of 8</span></span>)}
                  </p>
                )}
              </div>
              <div className="flex flex-col justify-end gap-3">
                <Spark series={pp.total.series} fleet={pp.total.fleet} unit="every ten minutes of racing" tall />
                {focus && (
                  <p className="m-0 flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13.5px] leading-snug">
                    <span className="mt-px shrink-0"><AlfieOrb size={18} /></span>
                    <span><b className="font-semibold">Next race: {CAUSE_WORDS[focus.cause].name.toLowerCase()}.</b> <span style={{ color: C.mute }}>{focusWords(focus).line} {focusWords(focus).cue}</span></span>
                  </p>
                )}
              </div>
            </section>

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
              {pp.skills.map(s => <SkillCard key={s.part} s={s} against={pp.against} graded={pp.graded >= GRADED_MIN} onLink={onLink} onPlay={onPlay} link={newest ? causeLink(s.part as Cause, newest) : null} />)}
            </div>

            <details className="sim-card">
              <summary className="cursor-pointer px-5 py-3.5 text-[14px] font-semibold">Race by race, as a table</summary>
              <div className="overflow-x-auto px-5 pb-5">
                <table className="w-full min-w-[720px] border-collapse text-left text-[13px] tabular-nums">
                  <thead>
                    <tr style={{ color: C.mute }}>
                      <th className="py-2 pr-3 font-semibold">Race</th>
                      {pp.skills.map(s => <th key={s.part} className="py-2 pr-3 text-right font-semibold">{s.name}</th>)}
                      <th className="py-2 text-right font-semibold">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {races.map(r => {
                      const v = rate(r.ledger!);
                      return (
                        <tr key={r.at} className="border-t border-white/[0.06]">
                          <td className="py-2 pr-3">{day(r.at)} <span style={{ color: C.faint }}>· {r.level}, {r.fleet} boats</span></td>
                          {pp.skills.map(s => <td key={s.part} className="py-2 pr-3 text-right">{n1(Math.round(v[s.part as Cause] * 10) / 10)}</td>)}
                          <td className="py-2 text-right font-semibold">{n1(Math.round(v.total * 10) / 10)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="m-0 mt-2 text-[12px]" style={{ color: C.faint }}>Boat lengths: a start, a tack or gybe, a rounding, and the rest (with All) for every ten minutes raced.</p>
              </div>
            </details>

            <section className="flex flex-col gap-2 text-[13px] leading-relaxed" style={{ color: C.mute }} aria-label="How this is worked out">
              <Cap>How this is worked out</Cap>
              <p className="m-0">As you race, your boat is measured against one sailing her best in the wind you had, with clean tacks, gybes and roundings. What you fall short by is booked to its cause. So that a short race and a long one compare, each part is shown in its own unit: boat lengths a start, a tack or gybe, a rounding, and for the rest every ten minutes raced. Tacks, gybes and roundings count only for what they cost beyond a clean one.</p>
              <p className="m-0">Grades are against the other boats in the same race, measured the same way, over your newest five finished races (at least {GRADED_MIN}): {GRADE_NAME.bronze} for giving away less than {Math.round(GRADE_AT.bronze * 100)}% of the fleet, {GRADE_NAME.silver} for {Math.round(GRADE_AT.silver * 100)}%, {GRADE_NAME.gold} for {Math.round(GRADE_AT.gold * 100)}%. A grade against Club skippers is easier to hold than the same grade against World skippers, so the fleet is always named.</p>
              <p className="m-0">The other boats are the simulator's skippers, not real ones, and the figures come from the simulator's model of each class. Races where fewer than three other boats finished count for the figures but not the grades.</p>
            </section>
          </>
        )}
    </Page>
  );
}
