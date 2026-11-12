// The world: today's daily race, this week's World Regatta (or a Major), the world, country and club
// tables, club against club, your world medals and results, and how you appear. Sailing a world race happens on the event screen
// (SimEvent), like any virtual event. Nobody appears here until they choose to.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ClassId } from '@/sim/classes';
import type { SkipperLevel } from '@/sim/types';
import { COUNTRY_NAMES } from '@/utils/countryFlags';
import type { ChallengeEntry } from './challenges';
import { breezeText, eventEntries, seriesRaces, whenText } from './events';
import Flag from './Flag';
import { countryName } from './flags';
import { levelName } from './rating';
import { standings } from './series';
import { Brand, DoorBack } from './SimDoors';
import SimHero from './SimHero';
import type { Setup } from './SimHome';
import { fmt } from './stats';
import { C, Cap, cx, ordinal } from './ui';
import { waterName } from './circuitWaters';
import { MedalArt, PennantArt } from './SimCareer';
import { BEST_OF, KIND_NAME, clubPeriod, nameProblem, nextMajor, worldMedals, worldNow, type Appear, type ClubPeriod, type ClubRow, type Skipper, type TableRow, type WorldEvent, type WorldMedal, type WorldResult } from './world';

const CLASS_LABEL: Record<ClassId, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };
const COUNTRIES = Object.entries(COUNTRY_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
const METAL_NAME = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } as const;
const METAL_TONE = { gold: '#F2C230', silver: '#C9D2DE', bronze: '#D9925B' } as const;
/** The newest world medal you've seen the moment for (on this device). */
const MEDAL_SEEN = 'alfie-race-sim-world-medal-seen-v1';
const PERIOD_NAME: Record<Exclude<ClubPeriod, 'lastMonth'>, string> = { week: 'Last week', month: 'This month', year: '12 months' };

export interface SimWorldProps {
  setup: Setup;
  cls: ClassId;
  events: WorldEvent[];
  /** How you appear: null, you don't; undefined, not known yet (or not signed in). */
  skipper: Skipper | null | undefined;
  signedIn: boolean;
  /** Your own name (from your AlfiePRO profile), to show what "my own name" would look like. */
  ownName: string | null;
  /** The club you're in now, if any (it can be shown with your name). */
  club: { id: string; name: string | null } | null;
  /** Your country to start with (from your yacht's sail letters). */
  country: string | null;
  results: WorldResult[] | null;
  loadTable: (o: { cls: ClassId | null; country?: string | null; club?: string | null; limit?: number }) => Promise<TableRow[] | null>;
  /** Club against club, for a period. */
  loadClubs?: (o: { from: number; to: number; cls: ClassId | null; limit?: number }) => Promise<ClubRow[] | null>;
  loadEntries?: (ev: WorldEvent) => Promise<ChallengeEntry[] | null>;
  loadFlags: (ids: string[]) => Promise<Map<string, Skipper>>;
  onAppear: (a: Appear) => Promise<string | null>;
  onStopAppearing: () => Promise<boolean>;
  /** You said "not now": remembered on this device, and asked again only if you come back to it. */
  declined: boolean;
  onDecline: () => void;
  onOpen: (ev: WorldEvent) => void;
  onBack: () => void;
  now?: number;
}

/** Choose how you appear (or change it). */
function AppearForm({ skipper, ownName, club, country, onSave, onCancel, onStop }: {
  skipper: Skipper | null; ownName: string | null; club: { id: string; name: string | null } | null; country: string | null;
  onSave: (a: Appear) => Promise<string | null>; onCancel?: () => void; onStop?: () => void;
}) {
  const [shown, setShown] = useState<'racing' | 'own'>(skipper?.shown ?? 'racing');
  const [name, setName] = useState(skipper?.racing_name ?? '');
  const [flag, setFlag] = useState<string>(skipper ? skipper.country ?? '' : country ?? '');
  const [withClub, setWithClub] = useState<boolean>(skipper ? !!skipper.club_id : false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problem = nameProblem(name);
  const save = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    const e = await onSave({ shown, racing_name: name.trim(), country: flag || null, club_id: withClub && club ? club.id : null });
    setBusy(false);
    if (e) setErr(e);
  };
  const preview = shown === 'own' && ownName ? ownName : name.trim() || 'Your racing name';
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <label className="flex flex-col gap-2">
          <Cap>Racing name</Cap>
          <input value={name} onChange={e => { setName(e.target.value); setErr(null); }} maxLength={20} placeholder="e.g. Blue Heron" autoComplete="off"
            className="h-12 rounded-xl border border-white/15 bg-white/[0.06] px-4 text-[15px] text-[#F1F4FA] outline-none focus:border-[rgba(77,163,255,0.8)]" />
          <span className="text-[12.5px]" style={{ color: C.faint }}>3 to 20 characters, and nobody else's. Everyone has one, even when showing their own name.</span>
        </label>
        <div className="flex flex-col gap-2">
          <Cap>Shown as</Cap>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shown as">
            <button type="button" className="sim-chip-btn" aria-pressed={shown === 'racing'} onClick={() => setShown('racing')} style={shown === 'racing' ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>My racing name</button>
            {ownName && <button type="button" className="sim-chip-btn" aria-pressed={shown === 'own'} onClick={() => setShown('own')} style={shown === 'own' ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>My own name</button>}
          </div>
          <span className="text-[12.5px]" style={{ color: C.faint }}>Your own name comes from your AlfiePRO profile.</span>
        </div>
        <label className="flex flex-col gap-2">
          <Cap>Flag</Cap>
          <span className="flex items-center gap-3">
            <select value={flag} onChange={e => setFlag(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#0E1630] px-3 text-[15px] text-[#F1F4FA]">
              <option value="">No flag</option>
              {COUNTRIES.map(([code, n]) => <option key={code} value={code}>{n}</option>)}
            </select>
            {flag && <Flag code={flag} size={30} />}
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <Cap>Club</Cap>
          {club ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Club">
              <button type="button" className="sim-chip-btn" aria-pressed={withClub} onClick={() => setWithClub(true)} style={withClub ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>Show {club.name ?? 'my club'}</button>
              <button type="button" className="sim-chip-btn" aria-pressed={!withClub} onClick={() => setWithClub(false)} style={!withClub ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>No club</button>
            </div>
          ) : <span className="text-[13px]" style={{ color: C.mute }}>Open the Academy from your club to show it with your name.</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.faint }}>On the boards</span>
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">{flag && <Flag code={flag} size={20} />}<span className="truncate">{preview}</span></span>
        {withClub && club && <span className="text-[13px]" style={{ color: C.mute }}>{club.name ?? 'your club'}</span>}
      </div>
      {err && <p role="alert" className="m-0 text-[13.5px] font-semibold" style={{ color: '#FFB86B' }}>{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="sim-btn-lg sim-btn-go" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : skipper ? 'Save' : 'Appear on the boards'}</button>
        {onCancel && <button type="button" className="sim-btn-lg" onClick={onCancel}>{skipper ? 'Cancel' : 'Not now: practice only'}</button>}
        {onStop && <button type="button" className="sim-link ml-auto text-[13.5px]" onClick={onStop}>Stop appearing</button>}
      </div>
    </div>
  );
}

/** One of the world's events now open: where, the breeze, when it closes, and the board's top five (with flags). */
function EventCard({ ev, label, flags, entries, me, onOpen, now }: {
  ev: WorldEvent; label: string; flags: Map<string, Skipper>; entries: ChallengeEntry[] | null; me: string | null; onOpen: () => void; now: number;
}) {
  const water = (ev.races[0]?.settings.venue ? waterName(ev.races[0].settings.venue) : '');
  const closes = ev.races.reduce((m, r) => Math.max(m, r.closes_at ? Date.parse(r.closes_at) : 0), 0);
  const board = useMemo(() => {
    if (!entries) return null;
    if (ev.races.length === 1) {
      return entries.filter(e => e.status === 'finished' && e.elapsed_s != null).sort((a, b) => a.elapsed_s! - b.elapsed_s!)
        .map((e, k) => ({ userId: e.user_id, name: e.display_name, rank: k + 1, value: fmt(e.elapsed_s!) }));
    }
    return standings(seriesRaces(ev, entries, now), ev.drops).map(r => ({ userId: r.userId, name: r.name, rank: r.rank, value: `${r.net} pts` }));
  }, [entries, ev, now]);
  const mine = board?.find(r => r.userId === me) ?? null;
  const tried = entries?.some(e => e.user_id === me) ?? false;
  const sailed = ev.races.length > 1 && entries ? new Set(entries.filter(e => e.user_id === me).map(e => e.challenge_id)).size : 0;
  return (
    <section className="sim-card flex min-w-0 flex-col gap-3 p-5" aria-label={label}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: ev.kind === 'major' ? '#FCD34D' : C.blueSoft }}>{label}</p>
          <h3 className="sim-h3 mt-0.5">{ev.kind === 'major' ? ev.title : water}</h3>
          <p className="m-0 mt-1 text-[13px] leading-snug" style={{ color: C.mute }}>
            {ev.races.length === 1 ? breezeText(ev.races[0].settings) : `${ev.races.length} race${ev.races.length > 1 ? 's' : ''} open${ev.kind === 'major' ? ', two more each day' : ''}`}. Closes {whenText(new Date(closes).toISOString(), now)}.
          </p>
        </div>
        <button type="button" className={cx('sim-btn-lg', !tried && 'sim-btn-go sim-btn-green')} onClick={onOpen}>{ev.races.length === 1 ? (tried ? 'Open' : 'Sail it') : 'Open'}</button>
      </div>
      {board && board.length > 0 ? (
        <ol className="m-0 flex list-none flex-col p-0 text-[13.5px]">
          {board.slice(0, 5).map(r => (
            <li key={r.userId} className={cx('flex items-center gap-2.5 border-t border-white/[0.06] py-1.5', r.userId === me && 'font-semibold')}>
              <span className="w-6 tabular-nums" style={{ color: C.faint }}>{r.rank}</span>
              <Flag code={flags.get(r.userId)?.country} size={18} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="tabular-nums" style={{ color: C.mute }}>{r.value}</span>
            </li>
          ))}
        </ol>
      ) : <p className="m-0 text-[13px]" style={{ color: C.faint }}>{entries ? 'Nobody on the board yet: be the first.' : 'Loading the board…'}</p>}
      {mine && mine.rank > 5 && <p className="m-0 text-[13px]" style={{ color: C.mute }}>You: {ordinal(mine.rank)} of {board!.length}{ev.races.length > 1 ? `, ${sailed} race${sailed === 1 ? '' : 's'} sailed` : ''}.</p>}
    </section>
  );
}

/** A world medal you haven't seen yet: it comes down on its ribbon, as on the Circuit. */
function WorldPodium({ medal, result, onDone }: { medal: WorldMedal; result: WorldResult | undefined; onDone: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onDone(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onDone]);
  const title = medal.trophy ? `${medal.event.replace(/^The /, '')} champion` : `${METAL_NAME[medal.kind]} at ${medal.event}`;
  return (
    <div className="sim-podium" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sim-podium-inner">
        <div className="sim-podium-medal" aria-hidden="true">
          <span className="sim-podium-swing"><MedalArt kind={medal.kind} size={190} /></span>
          <span className="sim-podium-sweep" />
        </div>
        <p className="m-0 text-[12.5px] font-bold uppercase tracking-[0.2em]" style={{ color: METAL_TONE[medal.kind] }}>{medal.event} · {CLASS_LABEL[medal.cls]}{result ? ` · ${ordinal(result.place)} of ${result.of_n}` : ''}</p>
        <h2 className="sim-podium-title">{title}</h2>
        <p className="m-0 max-w-[520px] text-center text-[15.5px] leading-snug" style={{ color: C.mute }}>
          {result ? `${result.points} world point${result.points === 1 ? '' : 's'}. ` : ''}{medal.trophy ? 'A Major title: it goes on your shelf with your Circuit titles.' : 'Your medal goes on your shelf with your Circuit medals.'}
        </p>
        <button type="button" className="sim-btn-lg sim-btn-go" autoFocus onClick={onDone}>Back to the world<ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

/** Your world medals: how many of each, and the Majors you've won. */
function WorldMedals({ medals }: { medals: WorldMedal[] }) {
  const n = { gold: 0, silver: 0, bronze: 0 };
  for (const m of medals) n[m.kind]++;
  const titles = medals.filter(m => m.trophy);
  return (
    <section className="sim-card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="wmedals-title">
      <div>
        <h2 id="wmedals-title" className="sim-h3">Your world medals</h2>
        <p className="m-0 mt-1 text-[13px]" style={{ color: C.mute }}>A podium in a World Regatta or a Major. Winning a Major is a title.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {(['gold', 'silver', 'bronze'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-2" style={{ opacity: n[k] ? 1 : 0.4 }}>
            <MedalArt kind={k} size={34} ribbon={false} />
            <span className="flex flex-col leading-tight"><b className="text-[19px] font-bold tabular-nums">{n[k]}</b><span className="text-[12px]" style={{ color: C.mute }}>{k}</span></span>
          </span>
        ))}
        {titles.map(t => (
          <span key={t.eventId} className="inline-flex items-center gap-2">
            <PennantArt size={34} />
            <span className="flex flex-col leading-tight"><b className="text-[14px] font-bold">{t.event.replace(/^The /, '')} champion</b><span className="text-[12px]" style={{ color: C.mute }}>{CLASS_LABEL[t.cls]}, {new Date(t.at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></span>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Club against club: each club's best five World Regatta results a week, added up; and the club of the month. */
function ClubTable({ cls, myClub, load, now }: { cls: ClassId; myClub: string | null; load: NonNullable<SimWorldProps['loadClubs']>; now: number }) {
  const [period, setPeriod] = useState<Exclude<ClubPeriod, 'lastMonth'>>('month');
  const [allClasses, setAllClasses] = useState(true);
  const [rows, setRows] = useState<ClubRow[] | null | 'loading'>('loading');
  const [champ, setChamp] = useState<ClubRow | null>(null);
  // Loaded per day (not per render), so the table doesn't reload as time passes.
  const day = Math.floor(now / 86400000);
  useEffect(() => {
    let live = true;
    setRows('loading');
    void load({ ...clubPeriod(period, day * 86400000 + 43200000), cls: allClasses ? null : cls, limit: 100 }).then(r => { if (live) setRows(r); });
    return () => { live = false; };
  }, [period, allClasses, cls, load, day]);
  useEffect(() => {
    let live = true;
    void load({ ...clubPeriod('lastMonth', day * 86400000 + 43200000), cls: null, limit: 1 }).then(r => { if (live) setChamp(r?.[0] ?? null); });
    return () => { live = false; };
  }, [load, day]);
  const list = rows === 'loading' || !rows ? [] : rows;
  const mine = list.find(r => r.club_id === myClub) ?? null;
  const lastMonth = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 1, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' });
  return (
    <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="clubs-title">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 id="clubs-title" className="sim-h3">Club against club</h2>
          <p className="m-0 mt-1 text-[13px]" style={{ color: C.mute }}>Each week, a club scores the world points of its best five results in the World Regattas. Members count when they show their club on the boards.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which period">
          {(Object.keys(PERIOD_NAME) as (keyof typeof PERIOD_NAME)[]).map(k => (
            <button key={k} type="button" className="sim-chip-btn" aria-pressed={period === k} onClick={() => setPeriod(k)} style={period === k ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>{PERIOD_NAME[k]}</button>
          ))}
          <button type="button" className="sim-chip-btn" aria-pressed={!allClasses} onClick={() => setAllClasses(a => !a)}>{allClasses ? 'All classes' : CLASS_LABEL[cls]}</button>
        </div>
      </div>
      {champ && (
        <p className="m-0 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[rgba(242,194,48,0.35)] bg-[rgba(242,194,48,0.08)] px-4 py-3 text-[14px]">
          <PennantArt size={26} /><b>Club of the month for {lastMonth}: {champ.club_name}</b><span style={{ color: C.mute }}>{champ.points.toLocaleString()} points from {champ.skippers} skipper{champ.skippers === 1 ? '' : 's'}</span>
        </p>
      )}
      {rows === 'loading' ? <p className="m-0 text-[13px]" style={{ color: C.faint }}>Loading…</p>
        : !rows ? <p className="m-0 text-[13px]" style={{ color: C.faint }}>The club table can't be reached just now.</p>
          : list.length === 0 ? <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>{period === 'week' ? "No club has scored from last week's regattas yet. They're scored on Monday, when the week's regattas close." : 'No club has scored yet. A club scores once a member who shows it finishes a World Regatta.'}</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13.5px]">
                  <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em]" style={{ color: C.faint }}>
                    <th className="w-10 py-2 font-semibold">#</th><th className="py-2 font-semibold">Club</th><th className="hidden py-2 text-right font-semibold sm:table-cell">Skippers</th><th className="hidden py-2 text-right font-semibold sm:table-cell">Weeks</th><th className="py-2 pl-3 text-right font-semibold">Points</th>
                  </tr></thead>
                  <tbody>
                    {[...list.slice(0, 30), ...(mine && mine.pos > 30 ? [mine] : [])].map(r => (
                      <tr key={r.club_id} className="border-t border-white/[0.06]" style={r.club_id === myClub ? { background: 'rgba(42,147,255,0.08)' } : undefined}>
                        <td className="py-2 font-semibold tabular-nums">{r.pos}</td>
                        <td className="max-w-[180px] truncate py-2 font-semibold sm:max-w-[280px]">{r.club_name}{r.club_id === myClub ? <span className="ml-2 text-[11.5px] font-normal" style={{ color: C.faint }}>Your club</span> : null}</td>
                        <td className="hidden py-2 text-right tabular-nums sm:table-cell" style={{ color: C.mute }}>{r.skippers}</td>
                        <td className="hidden py-2 text-right tabular-nums sm:table-cell" style={{ color: C.mute }}>{r.weeks}</td>
                        <td className="py-2 pl-3 text-right font-semibold tabular-nums">{r.points.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </section>
  );
}

type Scope = 'world' | 'country' | 'club';

export default function SimWorld(p: SimWorldProps) {
  const now = p.now ?? Date.now();
  const { loadFlags, loadTable } = p;
  const me = p.skipper?.user_id ?? null;
  const w = useMemo(() => worldNow(p.events, p.cls, now), [p.events, p.cls, now]);
  const week = w.major ?? w.regatta;
  const major = nextMajor(now);
  // The boards of the events open now, and the flags of everyone on them.
  const [boards, setBoards] = useState<Record<string, ChallengeEntry[] | null>>({});
  const [flags, setFlags] = useState<Map<string, Skipper>>(new Map());
  const load = p.loadEntries ?? eventEntries;
  useEffect(() => {
    let live = true;
    const open = [w.daily, week].filter((e): e is WorldEvent => !!e);
    void Promise.all(open.map(e => load(e).then(es => [e.id, es] as const))).then(async pairs => {
      if (!live) return;
      setBoards(Object.fromEntries(pairs));
      const ids = pairs.flatMap(([, es]) => (es ?? []).map(e => e.user_id));
      const f = await loadFlags(ids);
      if (live) setFlags(f);
    });
    return () => { live = false; };
  }, [w.daily, week, load, loadFlags]);

  // The tables.
  const [scope, setScope] = useState<Scope>('world');
  const [allClasses, setAllClasses] = useState(false);
  const [table, setTable] = useState<TableRow[] | null | 'loading'>('loading');
  const myCountry = p.skipper?.country ?? null, myClub = p.skipper?.club_id ?? p.club?.id ?? null;
  useEffect(() => {
    let live = true;
    setTable('loading');
    void loadTable({ cls: allClasses ? null : p.cls, country: scope === 'country' ? myCountry : null, club: scope === 'club' ? myClub : null, limit: 500 }).then(t => { if (live) setTable(t); });
    return () => { live = false; };
  }, [scope, allClasses, p.cls, myCountry, myClub, loadTable]);
  const rows = table === 'loading' || !table ? [] : table;
  const mineRow = rows.find(r => r.user_id === me) ?? null;

  // Your world medals, and the moment for one you haven't seen (the first visit only remembers where you are).
  const medals = useMemo(() => worldMedals(p.results), [p.results]);
  const [moment, setMoment] = useState<WorldMedal | null>(null);
  useEffect(() => {
    if (!p.results) return;
    const newest = medals[0];
    let seen: number | null = null;
    try { const v = localStorage.getItem(MEDAL_SEEN); seen = v ? Number(v) : null; } catch { /* no storage: no moment */ return; }
    if (!newest) { if (seen === null) try { localStorage.setItem(MEDAL_SEEN, '0'); } catch { /* ignore */ } return; }
    if (seen === null) { try { localStorage.setItem(MEDAL_SEEN, String(newest.at)); } catch { /* ignore */ } return; }
    if (newest.at > seen) setMoment(newest);
  }, [p.results, medals]);
  const seenMoment = () => { if (moment) try { localStorage.setItem(MEDAL_SEEN, String(moment.at)); } catch { /* ignore */ } setMoment(null); };

  const [editing, setEditing] = useState(false);
  const regattaThisYear = (p.results ?? []).some(r => r.kind === 'regatta' && r.class_id === p.cls && Date.parse(r.closed_at) > now - 365 * 86400000);
  const ask = p.signedIn && p.skipper === null && (!p.declined || editing);

  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <section className="sim-home-hero">
        <div className="sim-home-media" aria-hidden="true"><SimHero setup={{ ...p.setup, classId: p.cls, fleetSize: 12 }} fill /><div className="sim-home-scrim" /></div>
        <div className="sim-home-hero-body px-4 sm:px-6 lg:px-10 xl:px-16">
          <div className="flex flex-wrap items-center gap-3"><DoorBack onHome={p.onBack} /><Brand /></div>
          <h1 className="sim-home-title">The world</h1>
          <p className="sim-home-sub">Race every {CLASS_LABEL[p.cls]} skipper in the world: the same races, each sailed in your own time. Your first try counts.</p>
        </div>
      </section>

      <div className="sim-home-body flex flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-10 xl:px-16">
        {ask && (
          <section className="sim-glass flex flex-col gap-4 p-5 sm:p-7" aria-labelledby="appear-title">
            <div>
              <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ color: C.blueSoft }}>Asked once</p>
              <h2 id="appear-title" className="m-0 mt-1 font-display text-[24px] font-bold leading-tight tracking-tight">How would you like to appear?</h2>
              <p className="m-0 mt-1.5 max-w-[720px] text-[14px] leading-snug" style={{ color: C.mute }}>Your results go on the world's boards and tables under the name you choose, with a flag and your club if you like. Nothing is shown until you say so, and you can change it or stop any time. Not now? You can still sail every race for practice.</p>
            </div>
            <AppearForm skipper={null} ownName={p.ownName} club={p.club} country={p.country} onSave={async a => { const e = await p.onAppear(a); if (!e) setEditing(false); return e; }} onCancel={() => { setEditing(false); p.onDecline(); }} />
          </section>
        )}
        {p.signedIn && p.skipper === null && p.declined && !editing && (
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]" style={{ color: C.mute }}>You're sailing the world's races for practice: you're on no board. <button type="button" className="sim-link" onClick={() => setEditing(true)}>Appear on the boards</button></p>
        )}
        {!p.signedIn && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>Sign in to AlfiePRO to sail for the boards. You can sail the races for practice now.</p>}

        <div className="grid items-start gap-5 lg:grid-cols-3">
          {w.daily ? <EventCard ev={w.daily} label={`Daily race · ${CLASS_LABEL[p.cls]}`} flags={flags} entries={boards[w.daily.id] ?? null} me={me} onOpen={() => p.onOpen(w.daily!)} now={now} />
            : <section className="sim-card p-5"><Cap>Daily race</Cap><p className="m-0 mt-2 text-[13.5px]" style={{ color: C.mute }}>Today's race opens shortly.</p></section>}
          {week ? <EventCard ev={week} label={`${KIND_NAME[week.kind]} · ${CLASS_LABEL[p.cls]}`} flags={flags} entries={boards[week.id] ?? null} me={me} onOpen={() => p.onOpen(week)} now={now} />
            : <section className="sim-card p-5"><Cap>World Regatta</Cap><p className="m-0 mt-2 text-[13.5px]" style={{ color: C.mute }}>This week's regatta opens shortly.</p></section>}
          {!w.major && (
            <section className="sim-card flex flex-col gap-2 p-5" aria-label="The next Major">
              <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ color: '#FCD34D' }}>The next Major</p>
              <h3 className="sim-h3">{major.name}</h3>
              <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>Opens {new Date(major.opens).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: twelve races at {waterName(major.water)}, two a day, against the world's best skippers. No coaching; two drops.</p>
              <p className="m-0 text-[13px] font-semibold" style={{ color: regattaThisYear ? '#7EE2A8' : C.mute }}>{regattaThisYear ? `You're in: you have a World Regatta result in ${CLASS_LABEL[p.cls]} this year.` : `Entry: a World Regatta result in ${CLASS_LABEL[p.cls]} in the year before it.`}</p>
            </section>
          )}
        </div>

        <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="table-title">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <h2 id="table-title" className="sim-h3">The tables</h2>
              <p className="m-0 mt-1 text-[13px]" style={{ color: C.mute }}>World points from each skipper's best {BEST_OF} results of the last twelve months. Only those who've chosen to appear are listed.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Which table">
              {(['world', 'country', 'club'] as Scope[]).map(s => (
                <button key={s} type="button" className="sim-chip-btn" aria-pressed={scope === s} disabled={(s === 'country' && !myCountry) || (s === 'club' && !myClub)} onClick={() => setScope(s)}
                  style={scope === s ? { background: '#F1F4FA', color: '#0A1226', borderColor: '#F1F4FA' } : undefined}>
                  {s === 'world' ? 'World' : s === 'country' ? <>{myCountry && <Flag code={myCountry} size={16} />}{myCountry ? countryName(myCountry) : 'Country'}</> : (p.skipper?.club_name ?? p.club?.name ?? 'Club')}
                </button>
              ))}
              <button type="button" className="sim-chip-btn" aria-pressed={allClasses} onClick={() => setAllClasses(a => !a)}>{allClasses ? 'All classes' : CLASS_LABEL[p.cls]}</button>
            </div>
          </div>
          {table === 'loading' ? <p className="m-0 text-[13px]" style={{ color: C.faint }}>Loading…</p>
            : !table ? <p className="m-0 text-[13px]" style={{ color: C.faint }}>The tables can't be reached just now.</p>
              : rows.length === 0 ? <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>No world points yet. They're scored as each event closes: the first daily race closes at the end of its day.</p>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                      <thead><tr className="text-left text-[11px] uppercase tracking-[0.1em]" style={{ color: C.faint }}>
                        <th className="w-10 py-2 font-semibold">#</th><th className="py-2 font-semibold">Skipper</th><th className="py-2 font-semibold">Club</th><th className="py-2 text-right font-semibold">Events</th><th className="py-2 text-right font-semibold">Wins</th><th className="py-2 pl-3 text-right font-semibold">Points</th>
                      </tr></thead>
                      <tbody>
                        {[...rows.slice(0, 50), ...(mineRow && mineRow.pos > 50 ? [mineRow] : [])].map(r => (
                          <tr key={r.user_id} className="border-t border-white/[0.06]" style={r.user_id === me ? { background: 'rgba(42,147,255,0.08)' } : undefined}>
                            <td className="py-2 font-semibold tabular-nums">{r.pos}</td>
                            <td className="py-2"><span className="flex items-center gap-2"><Flag code={r.country} size={18} /><span className="truncate font-semibold">{r.label}</span>{r.level && <span className="text-[11.5px]" style={{ color: C.faint }}>{levelName(r.level as SkipperLevel)}</span>}</span></td>
                            <td className="max-w-[200px] truncate py-2" style={{ color: C.mute }}>{r.club_name ?? ''}</td>
                            <td className="py-2 text-right tabular-nums" style={{ color: C.mute }}>{r.events}</td>
                            <td className="py-2 text-right tabular-nums" style={{ color: C.mute }}>{r.wins}</td>
                            <td className="py-2 pl-3 text-right font-semibold tabular-nums">{r.points.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </section>

        {p.loadClubs && <ClubTable cls={p.cls} myClub={myClub} load={p.loadClubs} now={now} />}

        {medals.length > 0 && <WorldMedals medals={medals} />}

        {p.results && p.results.length > 0 && (
          <section className="sim-card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="mine-title">
            <h2 id="mine-title" className="sim-h3">Your world results</h2>
            <ul className="m-0 flex list-none flex-col p-0 text-[13.5px]">
              {p.results.slice(0, 10).map(r => (
                <li key={r.event_id} className="flex items-center gap-3 border-t border-white/[0.06] py-2">
                  <span className="w-14 shrink-0 sm:w-28" style={{ color: C.mute }}>{new Date(r.closed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">{r.kind !== 'daily' && r.place <= 3 && <span className="inline-flex shrink-0"><MedalArt kind={r.place === 1 ? 'gold' : r.place === 2 ? 'silver' : 'bronze'} size={18} ribbon={false} /></span>}<span className="truncate">{r.title ?? KIND_NAME[r.kind]} · {CLASS_LABEL[r.class_id]}</span></span>
                  <span className="shrink-0 tabular-nums">{ordinal(r.place)}<span className="hidden sm:inline"> of {r.of_n}</span></span>
                  <span className="w-16 shrink-0 text-right font-semibold tabular-nums sm:w-20">{r.points} pts</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.skipper && (
          <section className="sim-card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="how-title">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="how-title" className="sim-h3 flex-1">How you appear</h2>
              {!editing && <button type="button" className="sim-chip-btn" onClick={() => setEditing(true)}>Change</button>}
            </div>
            {editing
              ? <AppearForm skipper={p.skipper} ownName={p.ownName} club={p.club} country={p.country} onSave={async a => { const e = await p.onAppear(a); if (!e) setEditing(false); return e; }} onCancel={() => setEditing(false)} onStop={() => { void p.onStopAppearing().then(ok => { if (ok) setEditing(false); }); }} />
              : (
                <p className="m-0 flex flex-wrap items-center gap-2.5 text-[15px]">
                  <Flag code={p.skipper.country} size={22} /><b>{p.skipper.label}</b>
                  {p.skipper.club_name && <span style={{ color: C.mute }}>· {p.skipper.club_name}</span>}
                  {p.skipper.hidden && <span className="text-[13px]" style={{ color: '#FFB86B' }}>Taken off the boards by AlfiePRO. Choose another name to come back.</span>}
                </p>
              )}
          </section>
        )}
        {moment && <WorldPodium medal={moment} result={p.results?.find(r => r.event_id === moment.eventId)} onDone={seenMoment} />}
        <p className="m-0 text-[12.5px]" style={{ color: C.faint }}>The world's races and results stay in the Academy. Nothing here goes on a club's results or anyone's club profile. Days run on UTC: each daily race opens at {new Date(Date.UTC(2026, 0, 1)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} your time.</p>
      </div>
    </div>
  );
}
