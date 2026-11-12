// The AlfiePRO Circuit: your club season. The next race day (or the one under way), its sheet as
// AlfiePRO scores it, the pointscore, your rival and your medals, as glass panels over the live
// render of the fleet. A podium ends the day with the medal coming down on its ribbon.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ClassId } from '@/sim/classes';
import { ME, QUALIFY, TIER_FLEET, castOf, dayStandings, dayState, eventWind, finishDay, fleetOf, medalCount, moveUp, newCareer, rival, seasonOf, seasonStandings, simulateRest, tierOf, type Career, type CareerEvent, type Me, type Medal, type MedalKind } from './career';
import type { LevelLicence, Requirement } from './programme';
import { scoreText, type StandingRow } from './series';
import { Brand, DoorBack } from './SimDoors';
import SimHero from './SimHero';
import type { Setup } from './SimHome';
import { C, Cap, Chip, cx, ordinal } from './ui';

const SEASON_CLASSES: ClassId[] = ['IOM', 'DF95', 'DF65', '10R', 'M'];
const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
const WIND: Record<CareerEvent['wind'], string> = { light: 'Light breeze', medium: 'Medium breeze', fresh: 'Fresh breeze' };
const CHARACTER: Record<NonNullable<CareerEvent['character']>, string> = { steady: 'steady', oscillating: 'shifty', puffy: 'gusty', persistent: 'swinging one way' };
const METAL: Record<MedalKind, { hi: string; mid: string; lo: string; name: string }> = {
  gold: { hi: '#FFF1B8', mid: '#F2C230', lo: '#A8770A', name: 'Gold' },
  silver: { hi: '#FFFFFF', mid: '#C9D2DE', lo: '#7C8898', name: 'Silver' },
  bronze: { hi: '#FFD9B0', mid: '#D08A4E', lo: '#7F4A1E', name: 'Bronze' },
};

/** A medal on its ribbon, with the AlfiePRO sails struck on it. */
export function MedalArt({ kind, size = 56, ribbon = true }: { kind: MedalKind; size?: number; ribbon?: boolean }) {
  const m = METAL[kind], id = `medal-${kind}`;
  return (
    <svg width={size} height={ribbon ? size * 1.5 : size} viewBox={ribbon ? '0 0 100 150' : '0 50 100 100'} role="img" aria-label={`${m.name} medal`}>
      <defs>
        <radialGradient id={`${id}-face`} cx="36%" cy="30%" r="80%"><stop offset="0" stopColor={m.hi} /><stop offset="0.5" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} /></radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={m.hi} /><stop offset="1" stopColor={m.lo} /></linearGradient>
      </defs>
      {ribbon && (<><path d="M30 0h18l10 58H40z" fill="#0066b4" /><path d="M52 0h18L60 58H42z" fill="#01a2e9" /></>)}
      <circle cx="50" cy="100" r="46" fill={`url(#${id}-rim)`} />
      <circle cx="50" cy="100" r="39" fill={`url(#${id}-face)`} stroke={m.lo} strokeOpacity="0.45" strokeWidth="1.2" />
      <g transform="translate(34.5 75) scale(0.245)" fill={m.lo} fillOpacity="0.72">
        <path d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z" />
        <path d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z" />
      </g>
    </svg>
  );
}

/** A title: a pennant in the Circuit's colours. */
export function PennantArt({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Title pennant">
      <path d="M9 4v40" stroke="#C9D2DE" strokeWidth="3" strokeLinecap="round" />
      <path d="M11 7l30 10-30 10z" fill="#F2C230" /><path d="M11 7l14 4.7v10.6L11 27z" fill="#0066b4" />
    </svg>
  );
}

/** The medals you hold, and your titles. */
export function MedalShelf({ medals }: { medals: Medal[] }) {
  const n = medalCount(medals), titles = medals.filter(m => m.trophy);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {(['gold', 'silver', 'bronze'] as MedalKind[]).map(k => (
        <span key={k} className="inline-flex items-center gap-2" style={{ opacity: n[k] ? 1 : 0.4 }}>
          <MedalArt kind={k} size={34} ribbon={false} />
          <span className="flex flex-col leading-tight"><b className="text-[19px] font-bold tabular-nums" style={{ fontFamily: DISPLAY }}>{n[k]}</b><span className="text-[12px]" style={{ color: C.mute }}>{METAL[k].name.toLowerCase()}</span></span>
        </span>
      ))}
      {titles.map(t => (
        <span key={`${t.season}-${t.event}`} className="inline-flex items-center gap-2">
          <PennantArt size={34} />
          <span className="flex flex-col leading-tight"><b className="text-[14px] font-bold">{t.event.replace('Championship', 'Champion')}</b><span className="text-[12px]" style={{ color: C.mute }}>Season {t.season}</span></span>
        </span>
      ))}
    </div>
  );
}

function Who({ id, me, name, sail }: { id: string; me: Me; name: string; sail: string | null }) {
  const m = castOf(id);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-white/30" style={{ background: m?.hull ?? '#FFFFFF' }} />
      <span className={cx('truncate', id === ME && 'font-bold')}>{id === ME ? me.name : name}</span>
      {m && <span className="shrink-0 rounded-[5px] border border-white/20 px-1 text-[10.5px] font-semibold tracking-wider" style={{ color: C.mute }}>{m.country}</span>}
      <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: C.faint }}>{sail ?? ''}</span>
    </span>
  );
}

function Sheet({ rows, me, races, sailed }: { rows: StandingRow[]; me: Me; races: number; sailed?: boolean[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="text-left text-[11.5px] uppercase tracking-[0.1em]" style={{ color: C.faint }}>
            <th className="w-8 py-2 pr-2 font-semibold">#</th><th className="py-2 pr-3 font-semibold">Skipper</th>
            {Array.from({ length: races }, (_, k) => <th key={k} className="px-1.5 py-2 text-center font-semibold" title={sailed && sailed[k] === false ? 'Simulated' : undefined}>{sailed && sailed[k] === false ? `r${k + 1}` : `R${k + 1}`}</th>)}
            <th className="py-2 pl-2 text-right font-semibold">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.userId} className={cx('border-t border-white/[0.06]', r.userId === ME && 'bg-[rgba(46,123,255,0.14)]')}>
              <td className="py-2 pr-2 font-semibold tabular-nums">{r.rank}</td>
              <td className="max-w-[230px] py-2 pr-3"><Who id={r.userId} me={me} name={r.name} sail={r.sail} /></td>
              {Array.from({ length: races }, (_, k) => <td key={k} className={cx('whitespace-nowrap px-1.5 py-2 text-center tabular-nums', r.scores[k]?.dropped && 'opacity-50')}>{r.scores[k] ? scoreText(r.scores[k]) : ''}</td>)}
              <td className="py-2 pl-2 text-right font-bold tabular-nums">{Number.isInteger(r.net) ? r.net : r.net.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Ending { event: CareerEvent; rank: number; of: number; net: number; medal: Medal | null; rows: StandingRow[]; nextName: string; newSeason: boolean; qualified: boolean }

/** The end of a race day: on a podium, the medal comes down on its ribbon; either way, where you came. */
function DayEnd({ end, me, onDone }: { end: Ending; me: Me; onDone: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onDone(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onDone]);
  const title = end.medal?.trophy ? end.event.name.replace('Championship', 'Champion') : end.medal ? `${METAL[end.medal.kind].name} at ${end.event.name}` : `${ordinal(end.rank)} at ${end.event.name}`;
  return (
    <div className="sim-podium" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sim-podium-inner">
        {end.medal && (
          <div className="sim-podium-medal" aria-hidden="true">
            <span className="sim-podium-swing"><MedalArt kind={end.medal.kind} size={190} /></span>
            <span className="sim-podium-sweep" />
          </div>
        )}
        <p className="m-0 text-[12.5px] font-bold uppercase tracking-[0.2em]" style={{ color: end.medal ? METAL[end.medal.kind].mid : C.blueSoft }}>{end.event.name} · {ordinal(end.rank)} of {end.of}</p>
        <h2 className="sim-podium-title">{title}</h2>
        <p className="m-0 max-w-[520px] text-center text-[15.5px] leading-snug" style={{ color: C.mute }}>
          {end.net} point{end.net === 1 ? '' : 's'} net{end.rows[0] && end.rows[0].userId !== ME ? `; ${end.rows[0].name} won the day ${end.rows[0].net === end.net ? 'on countback' : `on ${end.rows[0].net}`}` : end.rows[1] ? `; ${end.rows[1].name} was second on ${end.rows[1].net}` : ''}.
          {end.qualified ? ' That finish qualifies you for the Regional season.' : end.newSeason ? ' The season is over, and a new one begins.' : ''}
        </p>
        <ol className="sim-podium-top">
          {end.rows.slice(0, 3).map(r => <li key={r.userId}><b className="tabular-nums">{r.rank}</b><Who id={r.userId} me={me} name={r.name} sail={r.sail} /><span className="ml-auto tabular-nums">{r.net}</span></li>)}
        </ol>
        <button type="button" className="sim-btn-lg sim-btn-go" autoFocus onClick={onDone}>On to {end.nextName}<ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

export default function SimCareer({ career, me, setup, classLabel, licence, onLicence, onChange, onSail, onBack }: {
  career: Career | null; me: Me; setup: Setup; classLabel: (c: ClassId) => string;
  /** The licence that takes a Club skipper up to the Regional season, and the way to work on one of its requirements. */
  licence: LevelLicence | null; onLicence: (go: Requirement['go']) => void;
  onChange: (c: Career) => void;
  /** Sail the next race of the day. */
  onSail: () => void;
  onBack: () => void;
}) {
  const [end, setEnd] = useState<Ending | null>(null);
  // The class for a season not yet begun: the one set up, until another is picked here.
  const [cls, setCls] = useState<ClassId>(setup.classId);
  const st = useMemo(() => (career ? dayState(career) : null), [career]);
  const day = useMemo(() => (career?.day ? dayStandings(career, me) : []), [career, me]);
  const standing = useMemo(() => (career ? seasonStandings(career, me) : []), [career, me]);
  const rv = useMemo(() => (career ? rival(career, me) : null), [career, me]);
  // The window on the water: the fleet racing where the next event is.
  const heroSetup = useMemo((): Setup => {
    if (!career || !st) return setup;
    const w = st.event.water;
    return { ...setup, classId: career.cls, fleetSize: TIER_FLEET[tierOf(career)], level: tierOf(career), windStrength: st.event.wind, ...(w ? { venue: w, windDir: 'usual' as const, windPick: st.event.picks?.[Math.min(st.day, (st.event.picks?.length ?? 1) - 1)] ?? 0, spots: {} } : {}) };
  }, [setup, career, st]);
  const wind = st ? eventWind(st.event, st.day) : null;

  /** Simulate what's left of today; with the event's last race on the sheet, close it and show how it ended. */
  const close = (c: Career) => {
    const full = dayState(c).complete ? c : simulateRest(c, Date.now());
    if (!dayState(full).complete) { onChange(full); return; }
    const rows = dayStandings(full, me);
    const fin = finishDay(full, me, Date.now());
    if (!fin) return;
    const event = seasonOf(c)[fin.result.event];
    const newSeason = fin.career.season !== c.season;
    const season = seasonOf(fin.career);
    setEnd({ event, rank: fin.result.rank, of: rows.length, net: fin.result.net, medal: fin.medal, rows, newSeason, qualified: !!fin.career.ticket && !c.ticket, nextName: newSeason ? `season ${fin.career.season}` : season[Math.min(fin.career.done.length, season.length - 1)].name });
    onChange(fin.career);
  };

  const season = career ? seasonOf(career) : [], tier = career ? tierOf(career) : 'club';
  const days = season.filter(e => e.kind !== 'championship').length;
  const doneDays = career ? career.done.filter(d => season[d.event].kind !== 'championship').length : 0;
  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <section className="sim-home-hero">
        <div className="sim-home-media" aria-hidden="true"><SimHero setup={heroSetup} fill /><div className="sim-home-scrim" /></div>
        <div className="sim-home-hero-body px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-wrap items-center gap-3"><DoorBack onHome={onBack} /><Brand /></div>
          <h1 className="sim-home-title">The AlfiePRO Circuit</h1>
          <p className="sim-home-sub">{career ? `Season ${career.season} · ${tier === 'club' ? 'Club pointscore' : 'Regional season'} · ${classLabel(career.cls)}` : 'A club season against a fleet of skippers with names, numbers and form of their own.'}</p>
        </div>
      </section>

      <div className="sim-home-body flex flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-10 xl:px-16">
        {!career || !st ? (
          <section className="sim-glass flex max-w-[980px] flex-col gap-4 p-6 sm:p-7" aria-labelledby="cs-title">
            <Cap>Your club season</Cap>
            <h2 id="cs-title" className="m-0 text-[28px] font-bold leading-tight tracking-tight" style={{ fontFamily: DISPLAY }}>Six race days, then the Club Championship</h2>
            <p className="m-0 max-w-[640px] text-[15px] leading-relaxed" style={{ color: C.mute }}>
              Each race day is six races on your home water against nine club mates. Sail at least three; the rest can be simulated from how those went.
              Every day is scored by AlfiePRO's results engine, the one your club's real results use, and a podium earns a medal. It all stays here in the Academy.
            </p>
            <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {newCareer(cls, 0).fleet.map(id => { const m = castOf(id)!; return <li key={id} className="text-[14px]"><Who id={id} me={me} name={m.name} sail={m.sail} /></li>; })}
            </ul>
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blueSoft }}>Your boat for the season</p>
              <div className="sim-chips !mt-0" role="group" aria-label="Your boat for the season">
                {SEASON_CLASSES.map(k => <button key={k} type="button" className="sim-chip-btn" aria-pressed={cls === k} style={cls === k ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined} onClick={() => setCls(k)}>{classLabel(k)}</button>)}
              </div>
            </div>
            <div><button type="button" className="sim-btn-lg sim-btn-go" onClick={() => onChange(newCareer(cls, Date.now()))}>Start your {classLabel(cls)} season<ArrowRight size={18} aria-hidden="true" /></button></div>
          </section>
        ) : (
          <>
            {career.ticket === 'state' && !career.day && (
              <section className="sim-glass flex flex-col gap-3 p-5 sm:p-7" aria-labelledby="up-title" style={{ borderColor: 'rgba(242,194,48,0.45)' }}>
                <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: '#F2C230' }}>Qualified · top {QUALIFY.club} in the Club Championship</p>
                <h2 id="up-title" className="m-0 text-[26px] font-bold leading-tight tracking-tight" style={{ fontFamily: DISPLAY }}>The Regional season is open to you</h2>
                <p className="m-0 max-w-[680px] text-[14.5px] leading-snug" style={{ color: C.mute }}>
                  Three ranking regattas at Lantern Quay, Heron Reach and Kestrelwater, then two days at Aurel Lake for the Regional Championship, in fleets of sixteen.
                  {licence && !licence.ready ? ' You\'ve earned the place on the water; your Regional licence is what\'s left.' : ' You hold the licence. You can stay for another club season first if you\'d rather.'}
                </p>
                {licence && !licence.ready && (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {licence.reqs.map(r => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] py-2.5 text-[14px]">
                        <span className="min-w-[200px] flex-1"><b className="font-semibold">{r.label}: {r.have}</b><span className="block text-[12.5px]" style={{ color: C.mute }}>{r.met ? 'Done' : `Takes ${r.need}`}</span></span>
                        {!r.met && <button type="button" className="sim-chip-btn" onClick={() => onLicence(r.go)}>{r.go === 'race' ? 'Race' : 'Work on it'}</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {(!licence || licence.ready) && <div><button type="button" className="sim-btn-lg sim-btn-go" onClick={() => onChange(moveUp(career, Date.now()))}>Start the Regional season<ArrowRight size={18} aria-hidden="true" /></button></div>}
              </section>
            )}
            <section className="sim-glass flex flex-col gap-4 p-5 sm:p-7" aria-labelledby="day-title">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="min-w-[240px] flex-1">
                  <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>{st.event.kind === 'championship' ? 'The title event' : `${st.event.kind === 'regatta' ? 'Ranking regatta' : 'Race day'} ${st.index + 1} of ${days}`}{st.days > 1 ? ` · day ${st.day + 1} of ${st.days}` : ''} · {career.day ? 'under way' : 'next'}</p>
                  <h2 id="day-title" className="m-0 mt-1 text-[30px] font-bold leading-none tracking-tight" style={{ fontFamily: DISPLAY }}>{st.event.name}</h2>
                  <p className="m-0 mt-2 text-[14.5px] leading-snug" style={{ color: C.mute }}>
                    {wind ? `${wind.water}, ${wind.place.toLowerCase()}. ${wind.name}: ${WIND[st.event.wind].toLowerCase()}, ${CHARACTER[wind.character]}.` : `${WIND[st.event.wind]}, ${CHARACTER[st.event.character ?? 'oscillating']}.`} {st.days > 1 ? `${st.event.perDay} races a day over ${st.days} days` : `${st.event.races} races`}, {TIER_FLEET[tier]} boats. Sail at least {st.event.sail === 3 ? 'three' : st.event.sail}{st.days > 1 ? ' a day' : ''}; the rest can be simulated from how those went.
                    {wind?.note ? <span className="mt-1 block" style={{ color: C.faint }}>Local knowledge: {wind.note}</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {st.canSimulate && <button type="button" className="sim-btn-lg" onClick={() => close(career)}>Simulate {st.days > 1 ? "today's" : 'the'} last {st.leftToday === 1 ? 'race' : st.leftToday}</button>}
                  {st.left > 0
                    ? <button type="button" className="sim-btn-lg sim-btn-go" onClick={onSail}>{!career.day ? (st.event.kind === 'raceday' ? 'Start the race day' : `Start the ${st.event.kind === 'regatta' ? 'regatta' : 'Championship'}`) : st.days > 1 && st.raced > 0 && st.raced % st.event.perDay === 0 ? `Start day ${st.day + 1}: race ${st.raced + 1}` : `Sail race ${st.raced + 1}`}<ArrowRight size={18} aria-hidden="true" /></button>
                    : <button type="button" className="sim-btn-lg sim-btn-go" onClick={() => close(career)}>See how the day ended<ArrowRight size={18} aria-hidden="true" /></button>}
                </div>
              </div>
              {career.day ? (
                <>
                  <Sheet rows={day} me={me} races={Math.min(st.event.races, (st.day + 1) * st.event.perDay)} sailed={Array.from({ length: st.event.races }, (_, k) => career.day!.races[k]?.sailed)} />
                  <p className="m-0 text-[12.5px] leading-snug" style={{ color: C.faint }}>Scored by AlfiePRO's results engine: low point, a race dropped (in brackets) once four count and two once eight do{st.event.races >= 16 ? ', three once sixteen do' : ''}. {st.leftToday > 0 && st.sailedToday < st.event.sail ? `Sail ${st.event.sail - st.sailedToday} more ${st.days > 1 ? 'today ' : ''}to be able to simulate the rest.` : ''}</p>
                </>
              ) : (
                <ul className="m-0 grid list-none gap-x-6 gap-y-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {fleetOf(career).map(m => <li key={m.id} className="text-[14px]"><Who id={m.id} me={me} name={m.name} sail={m.sail} /></li>)}
                </ul>
              )}
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <section className="sim-card flex flex-col gap-3 p-5" aria-labelledby="ps-title">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="ps-title" className="sim-h3 min-w-0 flex-1">{tier === 'club' ? 'The pointscore' : 'The ranking'}</h2>
                  <Chip tone="blue">{standing.length ? `${doneDays} of ${days} ${tier === 'club' ? 'race days' : 'regattas'}` : 'Not started'}</Chip>
                </div>
                {standing.length ? <Sheet rows={standing} me={me} races={doneDays} />
                  : <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>{tier === 'club' ? "Finish a race day and the season's table starts here: each day counts as one race, with a day dropped once four count." : 'Finish a regatta and the ranking starts here: each regatta counts as one race.'}</p>}
              </section>
              <div className="flex min-w-0 flex-col gap-5">
                {rv && (
                  <section className="sim-card flex flex-col gap-1.5 p-5" aria-labelledby="rv-title">
                    <Cap>Your rival</Cap>
                    <h2 id="rv-title" className="sim-h3 flex items-center gap-2.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: rv.skipper.hull }} />{rv.skipper.name}</h2>
                    <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>{rv.gap === 0 ? 'Level with you' : `${rv.gap} point${rv.gap === 1 ? '' : 's'} ${rv.ahead ? 'ahead of' : 'behind'} you`} in the pointscore. {rv.skipper.country}, sail {rv.skipper.sail}.</p>
                  </section>
                )}
                <section className="sim-card flex flex-col gap-3 p-5" aria-labelledby="md-title">
                  <h2 id="md-title" className="sim-h3">Medals and titles</h2>
                  <MedalShelf medals={career.medals} />
                  {career.history.length > 0 && <p className="m-0 text-[13px]" style={{ color: C.mute }}>{career.history.map(h => `Season ${h.season}${h.tier === 'state' ? ' (Regional)' : ''}: ${ordinal(h.pointscore)} in the ${h.tier === 'state' ? 'ranking' : 'pointscore'}, ${ordinal(h.championship)} in the Championship`).join('. ')}.</p>}
                </section>
                <p className="m-0 text-[12.5px] leading-snug" style={{ color: C.faint }}>The skippers and their clubs are invented. Nothing here appears in your club's real results.</p>
              </div>
            </div>
          </>
        )}
      </div>
      {end && <DayEnd end={end} me={me} onDone={() => setEnd(null)} />}
    </div>
  );
}
