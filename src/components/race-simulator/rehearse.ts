// Rehearse your next race: the club's next race day, set up on the club's water in the wind
// forecast for it, so you've sailed the day before you get to the pond. The picking and the words
// are pure (tested); loading the calendar and the forecast is at the bottom.
import type { ClassId } from '@/sim/classes';
import type { VenueDef } from '@/sim/venue';
import { compassPoint } from './windWords';

/** What's needed of a club race or a series round to pick the next one. */
export interface CalendarRace { id: string; name: string; date: string; venue: string; raceClass: string; startTime?: string; completed?: boolean; cancelled?: boolean }
/** One day of the forecast: the wind's range in knots and where it's from. */
export interface DayWind { date: string; windSpeedMin: number; windSpeedMax: number; windDirection: number }

export interface NextRace {
  id: string; name: string;
  /** The day, as YYYY-MM-DD, and how many days away it is (0 today). */
  date: string; days: number;
  startTime: string | null;
  venue: string;
  /** The class as the club wrote it, and the simulator's class for it (null when it has none). */
  className: string; classId: ClassId | null;
  /** The wind forecast for the day (null when it's too far off, or couldn't be fetched). */
  wind: { from: number; kn: number; lo: number; hi: number } | null;
}

const DAY = 86400000;
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The simulator's class for a club's class name ("IOM", "DF 95", "10 Rater", "Marblehead"...). */
export function classFor(raceClass: string): ClassId | null {
  const k = (raceClass || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k === 'iom' || k.includes('onemetre') || k.includes('onemeter')) return 'IOM';
  if (k.includes('df95') || k.includes('dragonforce95') || k.includes('dragonflite95')) return 'DF95';
  if (k.includes('df65') || k.includes('dragonforce65')) return 'DF65';
  if (k === '10r' || k.includes('10rater') || k.includes('tenrater')) return '10R';
  if (k === 'm' || k.includes('marblehead')) return 'M';
  return null;
}

/** The next race day on the calendar: today's or the soonest after it, not finished or cancelled. */
export function pickNext(races: CalendarRace[], now: Date): Omit<NextRace, 'wind'> | null {
  const today = dayOf(now);
  const next = races
    .filter(r => !r.completed && !r.cancelled && /^\d{4}-\d{2}-\d{2}/.test(r.date) && r.date.slice(0, 10) >= today)
    .sort((a, z) => a.date.slice(0, 10).localeCompare(z.date.slice(0, 10)) || (a.startTime ?? '').localeCompare(z.startTime ?? ''))[0];
  if (!next) return null;
  const date = next.date.slice(0, 10);
  const [y, m, d] = date.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
  return { id: next.id, name: next.name, date, days, startTime: next.startTime ?? null, venue: next.venue, className: next.raceClass, classId: classFor(next.raceClass) };
}

/** The forecast for a day: the middle of its range as the breeze to sail in (kept to what a radio yacht races in). */
export function windOn(daily: DayWind[], date: string): NextRace['wind'] {
  const d = daily.find(x => x.date === date);
  if (!d || !Number.isFinite(d.windSpeedMin) || !Number.isFinite(d.windSpeedMax) || !Number.isFinite(d.windDirection)) return null;
  const lo = Math.round(Math.min(d.windSpeedMin, d.windSpeedMax)), hi = Math.round(Math.max(d.windSpeedMin, d.windSpeedMax));
  return { from: ((Math.round(d.windDirection) % 360) + 360) % 360, kn: Math.max(2, Math.min(22, Math.round((lo + hi) / 2))), lo, hi };
}

/** The race day in words: for the card on the home screen. */
export function rehearseWords(n: NextRace, at: VenueDef | null): { when: string; title: string; wind: string; where: string; button: string } {
  const [y, m, d] = n.date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-AU', { weekday: 'long' });
  const when = n.days === 0 ? 'Today' : n.days === 1 ? 'Tomorrow' : n.days < 7 ? weekday : dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    when,
    title: n.name,
    wind: !at ? "Choose your club's water under Where to rehearse it in the forecast wind."
      : n.wind
      ? `Forecast: ${n.wind.lo === n.wind.hi ? `${n.wind.lo}` : `${n.wind.lo} to ${n.wind.hi}`} knots from the ${compassPoint(n.wind.from)}.`
      : n.days > 4 ? "Too far off for a forecast yet, so it's the venue's usual breeze." : "The forecast couldn't be fetched, so it's the venue's usual breeze.",
    where: !at ? `${n.classId ? n.className : 'Your class'} on the practice pond for now.` : (n.classId ? `${n.className} on ${at.name}'s water.` : `On ${at.name}'s water, in the class you've set up (the simulator has no ${n.className}).`),
    button: n.days === 0 ? 'Rehearse today' : `Rehearse ${n.days === 1 ? 'tomorrow' : n.days < 7 ? weekday : 'it'}`,
  };
}

/**
 * The club's next race day with its forecast, from the club's calendar (single events and series
 * rounds) and the weather service, for the venue the rehearsal is sailed on. Null when there's
 * nothing coming up or the calendar couldn't be read.
 */
export async function loadNextRace(at: VenueDef | null, now = new Date()): Promise<NextRace | null> {
  try {
    const store = await import('@/utils/raceStorage');
    const [events, series] = await Promise.all([store.getStoredRaceEvents().catch(() => []), store.getStoredRaceSeries().catch(() => [])]);
    const races: CalendarRace[] = [
      ...events.map(e => ({ id: e.id, name: e.eventName || e.roundName || `${e.raceClass} racing`, date: e.date, venue: e.venue, raceClass: String(e.raceClass ?? ''), startTime: e.startTime, completed: e.completed, cancelled: e.cancelled })),
      ...series.flatMap(s => s.completed ? [] : s.rounds.map((r, k) => ({ id: `${s.id}:${r.id ?? k}`, name: `${s.seriesName}: ${r.name}`, date: r.date, venue: r.venue, raceClass: String(s.raceClass ?? ''), startTime: r.startTime, completed: r.completed, cancelled: r.cancelled }))),
    ];
    const next = pickNext(races, now);
    if (!next) return null;
    let wind: NextRace['wind'] = null;
    if (at && next.days <= 4) {
      try { const w = await import('@/utils/weatherAPI'); wind = windOn(await w.getDailyForecast(at.lat, at.lon, at.short), next.date); } catch { wind = null; }
    }
    return { ...next, wind };
  } catch { return null; }
}
