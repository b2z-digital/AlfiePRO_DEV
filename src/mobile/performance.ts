/**
 * A skipper's racing across events (phase 2 board: Compare skippers, Race history, My stats).
 * Each event's races are scored as the desktop scores them (the same combined multi-day results as
 * eventStandings) and the numbers come from the desktop's skipper performance calculation
 * (utils/skipperPerformance), so a season figure is the same arithmetic as the desktop insights panel.
 */
import { combineAllDayResults } from '../utils/raceStorage';
import { calculateSkipperPerformance, type PerformanceStats } from '../utils/skipperPerformance';
import type { MCalendarItem } from './data';

export interface SkipperRef { memberId?: string; name: string }

const norm = (s?: string | null) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function refKey(r: SkipperRef) { return r.memberId ? `m:${r.memberId}` : `n:${norm(r.name)}`; }
export function parseRef(token: string, items: MCalendarItem[]): SkipperRef | null {
  if (!token) return null;
  if (token.startsWith('m:')) {
    const id = token.slice(2);
    for (const i of items) {
      const s = (i.event?.skippers || []).find((x: any) => x.memberId === id);
      if (s) return { memberId: id, name: s.name };
    }
    return { memberId: id, name: 'Skipper' };
  }
  return { name: token.startsWith('n:') ? token.slice(2) : token };
}

export function indexOfSkipper(skippers: any[], ref: SkipperRef): number {
  if (ref.memberId) {
    const i = skippers.findIndex(s => s?.memberId === ref.memberId);
    if (i >= 0) return i;
  }
  // Not linked to a member in this event (or no member id known): match on name
  return skippers.findIndex(s => (!ref.memberId || !s?.memberId) && norm(s?.name) === norm(ref.name));
}

/** Results of an event as the results page shows them (multi-day events combined). */
export function eventRaceResults(item: MCalendarItem): any[] {
  const e = item.event;
  if (!e) return [];
  return (e.multiDay && e.dayResults ? combineAllDayResults(e as any) : e.raceResults) || [];
}

export interface RaceRow { item: MCalendarItem; race: number; position: number | null; letterScore?: string; points?: number; fleet: number }

/** Every race the skipper has a result in, across the given events. */
export function racesFor(items: MCalendarItem[], ref: SkipperRef): RaceRow[] {
  const out: RaceRow[] = [];
  items.forEach(item => {
    if (item.kind !== 'race') return;
    const skippers = item.event?.skippers || [];
    const idx = indexOfSkipper(skippers, ref);
    if (idx < 0) return;
    eventRaceResults(item).forEach((r: any) => {
      if (r?.skipperIndex !== idx) return;
      out.push({ item, race: Number(r.race), position: r.position ?? null, letterScore: r.letterScore || undefined, points: r.points, fleet: skippers.length });
    });
  });
  return out;
}

/** The desktop performance numbers over any set of races. */
export function performanceOf(rows: RaceRow[]): PerformanceStats {
  return calculateSkipperPerformance(rows.map(r => ({ skipperIndex: 0, position: r.position, letterScore: r.letterScore, points: r.points })), 0, [Number.MAX_SAFE_INTEGER]);
}

/** Head to head: races both sailed, and who finished ahead in each (letter scores count as behind). */
export function headToHead(items: MCalendarItem[], a: SkipperRef, b: SkipperRef) {
  let aheadA = 0, aheadB = 0, races = 0;
  items.forEach(item => {
    const skippers = item.event?.skippers || [];
    const ia = indexOfSkipper(skippers, a), ib = indexOfSkipper(skippers, b);
    if (ia < 0 || ib < 0 || ia === ib) return;
    const byRace = new Map<number, { a?: any; b?: any }>();
    eventRaceResults(item).forEach((r: any) => {
      if (r?.skipperIndex !== ia && r?.skipperIndex !== ib) return;
      const x = byRace.get(Number(r.race)) || {};
      if (r.skipperIndex === ia) x.a = r; else x.b = r;
      byRace.set(Number(r.race), x);
    });
    byRace.forEach(({ a: ra, b: rb }) => {
      if (!ra || !rb) return;
      const pa = ra.letterScore || ra.position == null ? Infinity : ra.position;
      const pb = rb.letterScore || rb.position == null ? Infinity : rb.position;
      if (pa === Infinity && pb === Infinity) return;
      races++;
      if (pa < pb) aheadA++; else if (pb < pa) aheadB++;
    });
  });
  return { a: aheadA, b: aheadB, races };
}

/** Everyone who appears in these events, for the skipper picker. */
export function everyoneIn(items: MCalendarItem[]): (SkipperRef & { sailNo?: string; raceClass?: string; events: number })[] {
  const m = new Map<string, SkipperRef & { sailNo?: string; raceClass?: string; events: number }>();
  items.forEach(i => (i.event?.skippers || []).forEach((s: any) => {
    if (!s?.name || String(s.sailNo || '').startsWith('ATT-')) return;
    const ref = { memberId: s.memberId || undefined, name: s.name };
    const k = refKey(ref);
    const cur = m.get(k);
    if (cur) cur.events++;
    else m.set(k, { ...ref, sailNo: s.sailNo, raceClass: i.raceClass, events: 1 });
  }));
  return [...m.values()].sort((x, y) => y.events - x.events || x.name.localeCompare(y.name));
}

export type { PerformanceStats };
