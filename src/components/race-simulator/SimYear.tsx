// Your year in sailing: one screen for the year (or the year so far). The races and time on the
// water, the rating through the year, where the lengths went then and lately, starts and clean
// racing, the Circuit and the world, the training done, and where you sailed.
import { useMemo, useRef, useState } from 'react';
import { CAUSE_WORDS } from './ledger';
import { LEVEL_FROM } from './rating';
import { Brand, DoorBack } from './SimDoors';
import { MedalArt, PennantArt } from './SimCareer';
import SimHero from './SimHero';
import type { Setup } from './SimHome';
import { C } from './ui';
import type { YearSummary } from './year';

const CLASS_LABEL: Record<string, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };
const LEVEL_WORD: Record<string, string> = { club: 'Club', state: 'Regional', national: 'National', world: 'World', unplaced: 'Not yet placed' };
const EARLY = '#7C8BA3', LATELY = '#4DA3FF';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-[120px] flex-1 flex-col gap-1 rounded-2xl border border-white/[0.1] bg-[rgba(8,14,30,0.62)] px-4 py-3.5 backdrop-blur-md">
      <b className="text-[30px] font-bold leading-none tabular-nums tracking-tight">{value}</b>
      <span className="text-[13px]" style={{ color: C.mute }}>{label}</span>
    </div>
  );
}

/** The rating through the year: one line, the level lines behind it, and the value under the pointer. */
function RatingChart({ series, year }: { series: { at: number; rating: number }[]; year: number }) {
  const W = 720, H = 220, pl = 44, pr = 16, pt = 12, pb = 26;
  const from = new Date(year, 0, 1).getTime(), to = new Date(year + 1, 0, 1).getTime();
  const lo = Math.min(...series.map(p => p.rating)) - 60, hi = Math.max(...series.map(p => p.rating)) + 60;
  const x = (t: number) => pl + ((t - from) / (to - from)) * (W - pl - pr);
  const y = (r: number) => pt + (1 - (r - lo) / (hi - lo)) * (H - pt - pb);
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  const lines = Object.entries(LEVEL_FROM).filter(([, v]) => v > lo && v < hi && v > 0);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const move = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const t = from + (((e.clientX - r.left) / r.width) * W - pl) / (W - pl - pr) * (to - from);
    let best = 0;
    series.forEach((p, i) => { if (Math.abs(p.at - t) < Math.abs(series[best].at - t)) best = i; });
    setHover(best);
  };
  const h = hover !== null ? series[hover] : null;
  return (
    <div className="relative">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Your rating through ${year}: from ${series[0].rating} to ${series[series.length - 1].rating}`}
        onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {lines.map(([lv, v]) => (
          <g key={lv}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
            <text x={W - pr} y={y(v) - 5} textAnchor="end" fontSize="11" fill="rgba(214,224,240,0.6)">{LEVEL_WORD[lv]} from {v.toLocaleString()}</text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, m) => (
          <text key={m} x={x(new Date(year, m, 15).getTime())} y={H - 6} textAnchor="middle" fontSize="11" fill="rgba(214,224,240,0.55)">{new Date(year, m, 1).toLocaleDateString(undefined, { month: 'narrow' })}</text>
        ))}
        <text x={pl - 8} y={y(hi - 60) + 4} textAnchor="end" fontSize="11" fill="rgba(214,224,240,0.55)">{Math.round(hi - 60).toLocaleString()}</text>
        <text x={pl - 8} y={y(lo + 60) + 4} textAnchor="end" fontSize="11" fill="rgba(214,224,240,0.55)">{Math.round(lo + 60).toLocaleString()}</text>
        <path d={d} fill="none" stroke={LATELY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && <line x1={x(h.at)} x2={x(h.at)} y1={pt} y2={H - pb} stroke="rgba(255,255,255,0.25)" />}
        {h && <circle cx={x(h.at)} cy={y(h.rating)} r={5} fill={LATELY} stroke="#0B1322" strokeWidth={2} />}
        <circle cx={x(series[series.length - 1].at)} cy={y(series[series.length - 1].rating)} r={4.5} fill={LATELY} stroke="#0B1322" strokeWidth={2} />
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-white/10 bg-[#0B1322]/95 px-3 py-2 text-[12.5px] shadow-lg"
          style={{ left: `clamp(0px, calc(${(x(h.at) / W) * 100}% - 70px), calc(100% - 150px))` }}>
          <b className="tabular-nums">{h.rating.toLocaleString()}</b> <span style={{ color: C.mute }}>{hover === 0 ? 'at the start of the year' : new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        </div>
      )}
    </div>
  );
}

/** Lengths given away a race by cause: early in the year against lately, side by side. */
function LengthsBars({ rows }: { rows: { cause: keyof typeof CAUSE_WORDS; early: number; late: number }[] }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.early, r.late]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-[12.5px]" style={{ color: C.mute }} aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: EARLY }} />Early in the year</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LATELY }} />Lately</span>
      </div>
      {rows.map(r => (
        <div key={r.cause} className="grid grid-cols-[minmax(110px,150px)_1fr] items-center gap-3" title={`${CAUSE_WORDS[r.cause].name}: ${r.early.toFixed(1)} lengths a race early in the year, ${r.late.toFixed(1)} lately`}>
          <span className="text-[13.5px]">{CAUSE_WORDS[r.cause].name}</span>
          <div className="flex flex-col gap-[3px]">
            {([['early', r.early, EARLY], ['late', r.late, LATELY]] as const).map(([k, v, col]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="h-2 rounded-r-[4px]" style={{ width: `${Math.max(1.5, (v / max) * 100)}%`, maxWidth: 'calc(100% - 44px)', background: col }} />
                <span className="text-[12px] tabular-nums" style={{ color: C.mute }}>{v.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface SimYearProps {
  summary: YearSummary | null;
  /** Years you can look at (with races), newest first. */
  years: number[];
  onYear: (y: number) => void;
  setup: Setup;
  waterName: (id: string) => string;
  onBack: () => void;
}

export default function SimYear({ summary: s, years, onYear, setup, waterName, onBack }: SimYearProps) {
  const hours = s ? s.minutes / 60 : 0;
  const best = useMemo(() => (s?.world?.best ? `${s.world.best.place} of ${s.world.best.of_n}` : null), [s]);
  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <section className="sim-home-hero">
        <div className="sim-home-media" aria-hidden="true"><SimHero setup={setup} fill /><div className="sim-home-scrim" /></div>
        <div className="sim-home-hero-body px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-wrap items-center gap-3"><DoorBack onHome={onBack} /><Brand /></div>
          <h1 className="sim-home-title">{s ? `Your ${s.year} in sailing` : 'Your year in sailing'}</h1>
          <p className="sim-home-sub">{s ? `${s.soFar ? 'The year so far. ' : ''}${s.line}` : 'Gathering your year…'}</p>
          {years.length > 1 && s && (
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Which year">
              {years.map(y => <button key={y} type="button" className="sim-chip-btn" aria-pressed={y === s.year} onClick={() => onYear(y)} style={y === s.year ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{y}</button>)}
            </div>
          )}
        </div>
      </section>

      {s && (
        <div className="sim-home-body flex flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-10 xl:px-16">
          <section className="flex flex-wrap gap-3" aria-label="The year in numbers">
            <Stat value={s.races.toLocaleString()} label={s.races === 1 ? 'race sailed' : 'races sailed'} />
            <Stat value={hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1)} label="hours racing" />
            <Stat value={s.wins.toLocaleString()} label={s.wins === 1 ? 'win' : 'wins'} />
            <Stat value={s.podiums.toLocaleString()} label="top-three finishes" />
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              {s.rating && (
                <section className="sim-card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="yr-rating">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 id="yr-rating" className="sim-h3">Your rating</h2>
                      <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>
                        {s.rating.startLevel === 'unplaced' ? `Placed this year at ${LEVEL_WORD[s.rating.level]} level` : s.rating.level !== s.rating.startLevel ? `${LEVEL_WORD[s.rating.startLevel]} to ${LEVEL_WORD[s.rating.level]} level` : `${LEVEL_WORD[s.rating.level]} level all year`}. Highest: {s.rating.peak.toLocaleString()}.
                      </p>
                    </div>
                    <p className="m-0 text-right"><b className="text-[26px] font-bold tabular-nums">{s.rating.now.toLocaleString()}</b><span className="ml-2 text-[13px] tabular-nums" style={{ color: s.rating.now >= s.rating.start ? '#7CE3A1' : '#FFB4A8' }}>{s.rating.now >= s.rating.start ? '+' : '−'}{Math.abs(s.rating.now - s.rating.start)} this year</span></p>
                  </div>
                  <RatingChart series={s.rating.series} year={s.year} />
                </section>
              )}

              {s.lengths && (
                <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="yr-lengths">
                  <div>
                    <h2 id="yr-lengths" className="sim-h3">Where the lengths went</h2>
                    <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>
                      Lengths given away a race to a perfect race: {s.lengths.early.toFixed(1)} early in the year, {s.lengths.late.toFixed(1)} lately.
                      {s.lengths.improved ? ` Most improved: ${CAUSE_WORDS[s.lengths.improved].name.toLowerCase()}.` : ''}
                      {s.lengths.still ? ` Still the most to find: ${CAUSE_WORDS[s.lengths.still].name.toLowerCase()}.` : ''}
                    </p>
                  </div>
                  <LengthsBars rows={s.lengths.cause} />
                </section>
              )}

              {s.starts && (
                <section className="sim-card grid gap-4 p-5 sm:grid-cols-2 sm:p-6" aria-label="Starts and clean racing">
                  <div className="flex flex-col gap-1">
                    <h2 className="sim-h3">Starts</h2>
                    <p className="m-0 text-[14px] leading-snug" style={{ color: C.mute }}>
                      {s.starts.earlyLate !== null && s.starts.lateLate !== null
                        ? <>Across the line <b className="text-[#F1F4FA]">{s.starts.earlyLate.toFixed(1)} s</b> after the gun early in the year; <b className="text-[#F1F4FA]">{s.starts.lateLate.toFixed(1)} s</b> lately.</>
                        : 'Sail a few more races for your starts to show.'}
                      {' '}{s.starts.ocs ? `Over the line at ${s.starts.ocs} start${s.starts.ocs === 1 ? '' : 's'}.` : 'Never over the line.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="sim-h3">Clean racing</h2>
                    <p className="m-0 text-[14px] leading-snug" style={{ color: C.mute }}>
                      {s.clean.penalties ? <><b className="text-[#F1F4FA]">{s.clean.penalties}</b> penalty turn{s.clean.penalties === 1 ? '' : 's'} all year: one every {Math.max(1, Math.round(1 / s.clean.perRace))} races.</> : 'No penalty turns all year.'}
                    </p>
                  </div>
                </section>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {(s.circuit || s.world) && (
                <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="yr-medals">
                  <h2 id="yr-medals" className="sim-h3">Medals and titles</h2>
                  {s.circuit && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: C.faint }}>The Circuit</span>
                      <p className="m-0 text-[14px]" style={{ color: C.mute }}>{s.circuit.events} event{s.circuit.events === 1 ? '' : 's'} sailed{s.circuit.titles ? `, ${s.circuit.titles} title${s.circuit.titles === 1 ? '' : 's'}` : ''}.</p>
                      {s.circuit.medals.length > 0 && <MedalRow medals={s.circuit.medals.map(m => ({ kind: m.kind, trophy: !!m.trophy, label: m.event }))} />}
                    </div>
                  )}
                  {s.world && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: C.faint }}>The world</span>
                      <p className="m-0 text-[14px]" style={{ color: C.mute }}>{s.world.points.toLocaleString()} world points{best ? `; best finish ${best} (${s.world.best!.title ?? 'a world race'})` : ''}.</p>
                      {s.world.medals.length > 0 && <MedalRow medals={s.world.medals.map(m => ({ kind: m.kind, trophy: m.trophy, label: m.event }))} />}
                    </div>
                  )}
                </section>
              )}

              <section className="sim-card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="yr-training">
                <h2 id="yr-training" className="sim-h3">Training</h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
                  <li><b className="tabular-nums">{s.training.drills}</b> <span style={{ color: C.mute }}>drill{s.training.drills === 1 ? '' : 's'} passed, {s.training.stars} star{s.training.stars === 1 ? '' : 's'}</span></li>
                  <li><b className="tabular-nums">{s.training.rules}</b> <span style={{ color: C.mute }}>rules situation{s.training.rules === 1 ? '' : 's'} answered right</span></li>
                  <li><b className="tabular-nums">{s.training.scenarios}</b> <span style={{ color: C.mute }}>race moment{s.training.scenarios === 1 ? '' : 's'} won in the Scenario Lab</span></li>
                </ul>
              </section>

              {(s.waters.length > 0 || s.classes.length > 0) && (
                <section className="sim-card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="yr-where">
                  <h2 id="yr-where" className="sim-h3">Where and what you sailed</h2>
                  {s.waters.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                      {s.waters.slice(0, 5).map(w => <li key={w.venue} className="flex justify-between gap-3"><span className="truncate">{waterName(w.venue)}</span><span className="tabular-nums" style={{ color: C.mute }}>{w.races}</span></li>)}
                    </ul>
                  )}
                  {s.classes.length > 0 && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>{s.classes.map(c => `${CLASS_LABEL[c.cls] ?? c.cls} ${c.races}`).join(' · ')}</p>}
                </section>
              )}
            </div>
          </div>

          <p className="m-0 text-[12.5px]" style={{ color: C.faint }}>
            {s.source === 'account' ? 'From every race in your account.' : 'From the races on this device (it keeps your last thirty). Sign in to see the whole year.'} Your year stays in the Academy.
          </p>
        </div>
      )}
    </div>
  );
}

function MedalRow({ medals }: { medals: { kind: 'gold' | 'silver' | 'bronze'; trophy: boolean; label: string }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {medals.map((m, i) => (
        <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-3 text-[12.5px]" title={m.label}>
          {m.trophy ? <PennantArt size={20} /> : <MedalArt kind={m.kind} size={20} ribbon={false} />}<span className="max-w-[180px] truncate">{m.label}</span>
        </li>
      ))}
    </ul>
  );
}
