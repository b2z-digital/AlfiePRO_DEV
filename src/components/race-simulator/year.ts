// Your year in sailing: the races, the rating, where the lengths went and how that changed, the
// Circuit and the world, and the training done, for a calendar year (or the year so far). Pure,
// apart from loading the year's races from your account (every race is kept there; this device
// keeps only the last thirty).
import type { Cause } from './ledger';
import { standing, rated, levelOf } from './rating';
import type { RaceSummary } from './stats';
import type { Career, Medal } from './career';
import type { TrainingProgress } from './progress';
import type { WorldMedal, WorldResult } from './world';
import type { Account } from './sync';

/** A race as the year needs it: the summary's results, its ledger, and where it was sailed. */
export type YearRace = Pick<RaceSummary, 'at' | 'mode' | 'title' | 'cls' | 'level' | 'status' | 'place' | 'of' | 'time' | 'late' | 'ocs' | 'penalties' | 'ledger'> & { venue: string | null };

export const fromSummary = (r: RaceSummary): YearRace => ({ at: r.at, mode: r.mode, title: r.title, cls: r.cls, level: r.level, status: r.status, place: r.place, of: r.of, time: r.time, late: r.late, ocs: r.ocs, penalties: r.penalties, ledger: r.ledger, venue: null });

// Only what the year needs of each race (typed as a plain string: too much for the query's type parser).
const COLS: string = 'venue, at:summary->at, mode:summary->>mode, title:summary->>title, cls:summary->>cls, level:summary->>level, status:summary->>status, place:summary->place, of:summary->of, time:summary->time, late:summary->late, ocs:summary->ocs, penalties:summary->penalties, ledger:summary->ledger';

/** Every race in your account (only what the year needs of each), oldest first; null without an account copy. */
export async function loadAllRaces(a: Account, max = 6000): Promise<YearRace[] | null> {
  try {
    const { supabase } = await import('@/utils/supabase');
    const out: YearRace[] = [];
    const page = 1000;
    for (let from = 0; from < max; from += page) {
      const { data, error } = await supabase.from('sim_sessions').select(COLS)
        .eq('user_id', a.userId).order('sailed_at', { ascending: true }).range(from, from + page - 1);
      if (error) return null;
      const rows = (data ?? []) as unknown as YearRace[];
      for (const r of rows) if (typeof r.at === 'number') out.push(r);
      if (rows.length < page) break;
    }
    return out;
  } catch { return null; }
}

export interface YearSummary {
  year: number; soFar: boolean;
  /** Where the races came from: your account (every race), or this device (the last thirty). */
  source: 'account' | 'device';
  races: number; minutes: number; finished: number; wins: number; podiums: number;
  classes: { cls: string; races: number }[];
  waters: { venue: string; races: number }[];
  rating: { start: number; now: number; peak: number; startLevel: string; level: string; series: { at: number; rating: number }[] } | null;
  /** Lengths given away a race, by cause: early in the year and lately (from races with a ledger). */
  lengths: { early: number; late: number; cause: { cause: Cause; early: number; late: number }[]; improved: Cause | null; still: Cause | null } | null;
  starts: { earlyLate: number | null; lateLate: number | null; ocs: number } | null;
  clean: { penalties: number; perRace: number };
  /** The Circuit: medals and titles won this year, and events finished (those with Alfie's report). */
  circuit: { medals: Medal[]; titles: number; events: number } | null;
  world: { medals: WorldMedal[]; best: WorldResult | null; points: number } | null;
  training: { drills: number; stars: number; rules: number; scenarios: number };
  /** The year in one line. */
  line: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const PLURAL = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const LEVEL_WORD: Record<string, string> = { club: 'Club', state: 'Regional', national: 'National', world: 'World' };

/** A calendar year's bounds in your own time. */
export function yearBounds(year: number): { from: number; to: number } {
  return { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() };
}

/**
 * Your year in sailing.
 * @param all every race you have (oldest first, from before the year too: the rating needs them)
 */
export function yearSummary(o: {
  year: number; now: number; all: YearRace[]; source: 'account' | 'device';
  career: Career | null; training: TrainingProgress; worldResults: WorldResult[] | null; worldMedals: WorldMedal[];
}): YearSummary {
  const { from, to } = yearBounds(o.year);
  const all = [...o.all].sort((a, b) => a.at - b.at);
  const inYear = all.filter(r => r.at >= from && r.at < to);
  const races = inYear.filter(r => r.mode === 'race' && r.status !== 'racing');
  const finished = races.filter(r => r.status === 'finished');
  const wins = finished.filter(r => r.place === 1).length;
  const podiums = finished.filter(r => r.place !== null && r.place <= 3).length;
  const minutes = Math.round(inYear.reduce((a, r) => a + (r.time ?? 0), 0) / 60);
  const count = <K extends string>(xs: (K | null)[]) => {
    const m = new Map<K, number>();
    for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const classes = count(races.map(r => r.cls)).map(([cls, n]) => ({ cls, races: n }));
  const waters = count(races.map(r => r.venue)).map(([venue, n]) => ({ venue, races: n }));

  // The rating: worked out over every race, then read at the year's start and since.
  let rating: YearSummary['rating'] = null;
  const st = standing({ races: all as unknown as RaceSummary[] });
  const before = st.series.filter(p => p.at < from);
  const during = st.series.filter(p => p.at >= from && p.at < to);
  if (during.length) {
    const start = before.length ? before[before.length - 1].rating : 1000;
    const now = during[during.length - 1].rating;
    const peak = Math.max(start, ...during.map(p => p.rating));
    rating = { start, now, peak, startLevel: before.length ? levelOf(start) : 'unplaced', level: levelOf(now), series: [{ at: from, rating: start }, ...during] };
  }

  // Where the lengths went: the first third of the year's races with a ledger, against the last third.
  let lengths: YearSummary['lengths'] = null;
  const led = races.filter(r => r.ledger && rated(r as unknown as RaceSummary));
  if (led.length >= 6) {
    const k = Math.max(3, Math.floor(led.length / 3));
    const a = led.slice(0, k), b = led.slice(-k);
    const per = (rs: YearRace[], c?: Cause) => avg(rs.map(r => (c ? r.ledger!.parts.find(p => p.cause === c)?.lengths ?? 0 : r.ledger!.total)))!;
    const causes: Cause[] = ['start', 'speed', 'turns', 'shifts', 'laylines', 'roundings', 'air', 'penalties'];
    const cause = causes.map(c => ({ cause: c, early: per(a, c), late: per(b, c) })).filter(x => x.early > 0.05 || x.late > 0.05);
    const imp = [...cause].sort((x, y) => (y.early - y.late) - (x.early - x.late))[0];
    const still = [...cause].sort((x, y) => y.late - x.late)[0];
    lengths = { early: per(a), late: per(b), cause, improved: imp && imp.early - imp.late >= 0.5 ? imp.cause : null, still: still ? still.cause : null };
  }

  // Starts: seconds late at the gun, the first ten against the last ten; and starts over the line.
  let starts: YearSummary['starts'] = null;
  const lates = races.map(r => r.late).filter((x): x is number => typeof x === 'number');
  if (races.length) starts = { earlyLate: lates.length >= 4 ? avg(lates.slice(0, Math.min(10, Math.ceil(lates.length / 2))))! : null, lateLate: lates.length >= 4 ? avg(lates.slice(-Math.min(10, Math.floor(lates.length / 2))))! : null, ocs: races.filter(r => r.ocs).length };
  const pens = races.reduce((a, r) => a + (r.penalties ?? 0), 0);

  // The Circuit and the world, this year.
  const medals = (o.career?.medals ?? []).filter(m => m.at >= from && m.at < to);
  const events = (o.career?.reports ?? []).filter(r => r.at >= from && r.at < to).length;
  const circuit = o.career && (medals.length || events) ? { medals, titles: medals.filter(m => m.trophy).length, events } : null;
  const wr = (o.worldResults ?? []).filter(r => { const t = Date.parse(r.closed_at); return t >= from && t < to; });
  const wm = o.worldMedals.filter(m => m.at >= from && m.at < to);
  const world = wr.length ? { medals: wm, best: [...wr].sort((a, b) => a.place / a.of_n - b.place / b.of_n)[0], points: wr.reduce((a, r) => a + r.points, 0) } : null;

  // Training done this year.
  const inY = (at: number) => at >= from && at < to;
  const drills = Object.values(o.training.drills).filter(d => inY(d.at) && d.stars > 0);
  const training = {
    drills: drills.length, stars: drills.reduce((a, d) => a + d.stars, 0),
    rules: Object.values(o.training.lessons).filter(l => inY(l.at) && l.correct).length,
    scenarios: Object.values(o.training.lab).filter(l => inY(l.at) && l.won).length,
  };

  // The year in one line.
  const bits: string[] = [];
  if (rating && rating.startLevel !== 'unplaced' && rating.level !== rating.startLevel) bits.push(`${LEVEL_WORD[rating.startLevel]} to ${LEVEL_WORD[rating.level]}`);
  else if (rating) bits.push(`${rating.startLevel === 'unplaced' ? 'placed at ' : ''}${LEVEL_WORD[rating.level]} level, rated ${rating.now.toLocaleString()}`);
  if (lengths && lengths.early - lengths.late >= 1) bits.push(`${Math.round(lengths.early)} lengths a race down to ${Math.round(lengths.late)}`);
  if (wins) bits.push(PLURAL(wins, 'win'));
  else if (podiums) bits.push(PLURAL(podiums, 'podium'));
  const line = bits.length ? `${bits.join(', ')}.`.replace(/^./, c => c.toUpperCase()) : races.length ? `${PLURAL(races.length, 'race')} sailed.` : 'No races yet this year.';

  return {
    year: o.year, soFar: o.now < to, source: o.source,
    races: races.length, minutes, finished: finished.length, wins, podiums, classes, waters,
    rating, lengths, starts, clean: { penalties: pens, perRace: races.length ? pens / races.length : 0 },
    circuit, world, training, line,
  };
}
