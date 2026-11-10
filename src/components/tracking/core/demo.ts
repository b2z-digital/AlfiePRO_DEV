// A demo race for Live Tracking, sailed by the race simulator's engine: the same fleet, wind and
// course the simulator uses, turned into tag fixes as a UWB coordinator would send them. Lets a
// club see every tracking screen working before its kit is on the water, and drives the tests.
import { Race } from '@/sim/engine';
import { CLASSES } from '@/sim/classes';
import { VENUES } from '@/sim/venues';
import type { RaceSettings } from '@/sim/types';
import type { VenueScene } from '@/sim/venue';
import type { CourseMark, Fix, TrackedBoat, TrackedCourse, Waypoint } from './analyse';

/** Made-up skippers for the demo fleet. */
export const DEMO_SKIPPERS = ['Marcus Hale', 'Priya Shan', 'Tom Okafor', 'Lena Voss', 'Sam Rourke', 'Ava Lindqvist',
  'Jack Moreau', 'Nina Castell', 'Ben Tranter', 'Kate Ellery', 'Raj Mendis', 'Ollie Brandt', 'Grace Whitlow', 'Leo Farrant'];

export interface DemoOptions {
  seed?: number;
  fleet?: number;
  venue?: string | null;
  laps?: number;
  /** Send the tags' compass headings (true) or leave headings to the track (false). */
  compass?: boolean;
}

export class DemoRace {
  readonly race: Race;
  readonly boats: TrackedBoat[];
  readonly course: TrackedCourse;
  /** Seconds of race clock at the gun. */
  readonly gun: number;
  /** Compass bearing of the frame's +y (the frame is the simulator's: +y is the wind at the start). */
  readonly rot: number;
  readonly venue: VenueScene | null;
  private used = 0;
  private compass: boolean;

  constructor(o: DemoOptions = {}) {
    const venue = o.venue === undefined ? 'lmryc' : o.venue;
    const s = {
      classId: 'IOM', fleetSize: o.fleet ?? 12, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
      laps: o.laps ?? 2, length: 'long', sequenceSeconds: 60, coach: 'off', autoTrim: true, seed: o.seed ?? 5, noPlayer: true,
      ...(venue && VENUES[venue] ? { venue } : {}),
    } as RaceSettings;
    this.race = new Race(s);
    this.compass = o.compass ?? true;
    const r = this.race;
    const cls = CLASSES[s.classId] ?? CLASSES.IOM;
    this.boats = r.boats.map((b, i) => ({
      id: b.id, sail: b.sail, name: DEMO_SKIPPERS[i % DEMO_SKIPPERS.length], color: b.color,
      bow: cls.loa / 2, length: cls.loa, fixes: [] as Fix[],
    }));
    const c = r.course;
    const mk = (id: string, rounding: 'port' | 'starboard'): CourseMark => ({ id, name: c.byId[id].label, p: { ...c.byId[id].p }, rounding });
    const waypoints: Waypoint[] = [];
    for (const l of c.legs) {
      if (l.kind === 'mark') waypoints.push({ kind: 'mark', name: `Mark ${c.byId[l.rounding.markId].label}`, marks: [mk(l.rounding.markId, l.rounding.side === 'port' ? 'port' : 'starboard')] });
      else if (l.kind === 'gate') waypoints.push({ kind: 'gate', name: 'Gate 2', marks: l.options.map(o => mk(o.markId, o.side === 'port' ? 'port' : 'starboard')) });
    }
    this.course = {
      start: { pin: { ...c.start.pin }, boat: { ...c.start.stbd } },
      finish: { pin: { ...c.finish.pin }, boat: { ...c.finish.stbd } },
      waypoints,
      windDeg: 0,
    };
    this.gun = r.gunT;
    this.rot = c.rot;
    this.venue = r.venue ?? null;
  }

  /** Sail on to race-clock time t (seconds) and add the new fixes. */
  advance(t: number): void {
    const r = this.race;
    while (!r.ended && r.t < t) r.step();
    this.collect();
    if (r.ended) this.collect();
  }

  /** Sail the whole race. */
  sailToEnd(limit = 2400): void {
    const r = this.race;
    while (!r.ended && r.t < limit) r.step();
    this.collect();
    this.collect();
  }

  /** Race clock now (after the end, the last fix). */
  get t(): number { return this.race.ended ? Math.max(this.race.t, ...this.boats.map(b => b.fixes[b.fixes.length - 1]?.t ?? 0)) : this.race.t; }
  get ended(): boolean { return this.race.ended; }
  /** True wind direction now, in the frame (compass, from). */
  windNow(): number { const f = this.race.track[this.race.track.length - 1]; return f ? f.twd : 0; }

  private extended = false;

  private collect() {
    const tr = this.race.track;
    if (this.race.ended && this.used >= tr.length && !this.extended) {
      // The engine stops at the last finish; a real tag keeps talking, so carry each boat on a moment.
      this.extended = true;
      for (const b of this.boats) {
        const n = b.fixes.length;
        if (n < 2) continue;
        const a = b.fixes[n - 2], z = b.fixes[n - 1];
        const k = 0.4 / Math.max(1e-3, z.t - a.t);
        b.fixes.push({ t: z.t + 0.4, x: z.x + (z.x - a.x) * k, y: z.y + (z.y - a.y) * k, h: z.h });
      }
      return;
    }
    for (; this.used < tr.length; this.used++) {
      const f = tr[this.used];
      for (let i = 0; i < this.boats.length; i++) {
        const b = this.race.boats[i];
        if (b.retired) continue;
        this.boats[i].fixes.push({ t: f.t, x: f.d[i * 5], y: f.d[i * 5 + 1], h: this.compass ? f.d[i * 5 + 2] : null });
      }
    }
  }
}
