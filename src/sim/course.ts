// The race course, laid out in metres from the wind at the start, never from the screen.
// Windward–leeward with an offset mark and a leeward gate; start and finish on the same line,
// finishing upwind. Every mark knows which side it is left on, and a rounding only counts when
// the boat's track goes round the mark the right way (the string test of Rule 28).

import { V2, add, bearing, dir, mul, n360, sub, dot } from './math';
import type { Shore } from './venue';
import { dtan } from './dmath';

export type Side = 'port' | 'stbd';
export type MarkKind = 'windward' | 'offset' | 'gate-port' | 'gate-stbd' | 'pin' | 'start-stbd';

export interface Mark {
  id: string;
  kind: MarkKind;
  label: string;   // short label drawn on the mark
  name: string;    // used in sentences
  p: V2;
  r: number;       // physical radius, m
}

/** One rounding of one mark: progress is measured round the mark in the rounding direction. */
export interface Rounding {
  markId: string;
  side: Side;      // the side the mark is left on
  betaIn: number;  // bearing from the mark where the rounding starts (beside the incoming leg)
  sweep: number;   // degrees to go round, in the rounding direction
}

export type Leg =
  | { kind: 'mark'; name: string; rounding: Rounding; upwind: boolean }
  | { kind: 'gate'; name: string; options: [Rounding, Rounding]; upwind: false }
  | { kind: 'finish'; name: string; upwind: true };

export type CourseLength = 'short' | 'medium' | 'long';

export interface CourseSettings {
  laps: number;
  length: CourseLength;
  fleetSize: number;
  /** Degrees; positive means the pin end is set upwind (favoured). */
  lineBias?: number;
}

export interface Course {
  axis: number;           // wind direction at the start (from), compass degrees
  up: V2;                 // unit vector towards the wind
  right: V2;              // unit vector to the right, looking upwind
  L: number;              // hull length used for distances
  marks: Mark[];
  byId: Record<string, Mark>;
  start: { pin: V2; stbd: V2 };
  finish: { pin: V2; stbd: V2 };
  legs: Leg[];
  bounds: { alongMin: number; alongMax: number; across: number };
  origin: V2;
  beat: number;           // metres from the start line to the windward mark
  /** Compass bearing of the world's +y: 0 on the practice pond; at a venue, the wind at the start. */
  rot: number;
  /** At a venue: the real water's edge near the course. */
  shore?: Shore;
}

function rounding(markId: string, side: Side, from: V2, at: V2, to: V2): Rounding {
  const dIn = bearing(from, at), dOut = bearing(at, to);
  if (side === 'port') {
    const bIn = n360(dIn + 90), bOut = n360(dOut + 90);
    return { markId, side, betaIn: bIn, sweep: n360(bIn - bOut) || 360 };
  }
  const bIn = n360(dIn - 90), bOut = n360(dOut - 90);
  return { markId, side, betaIn: bIn, sweep: n360(bOut - bIn) || 360 };
}

export function buildCourse(axis: number, L: number, s: CourseSettings): Course {
  const up = dir(axis);
  const right = { x: up.y, y: -up.x };
  const O = { x: 0, y: 0 };
  const at = (along: number, across: number): V2 => add(mul(up, along * L), mul(right, across * L));
  const beatUp = s.length === 'short' ? 22 : s.length === 'long' ? 42 : 30;
  const runDown = s.length === 'short' ? 13 : s.length === 'long' ? 22 : 17;
  const half = Math.max(6, 0.82 * s.fleetSize);
  const bias = ((s.lineBias ?? 0) * Math.PI) / 180;
  const pin = add(O, add(mul(right, -half * L), mul(up, dtan(bias) * half * L)));
  const stbd = add(O, add(mul(right, half * L), mul(up, -dtan(bias) * half * L)));
  const W = at(beatUp, 0);
  const F = at(beatUp - 1.6, -4.2);
  const G = at(-runDown, 0);
  const gP = at(-runDown, 3.2);
  const gS = at(-runDown, -3.2);
  const markR = 0.12 * Math.max(1, L);
  const marks: Mark[] = [
    { id: 'W', kind: 'windward', label: '1', name: 'mark 1', p: W, r: markR },
    { id: 'F', kind: 'offset', label: '1a', name: 'the offset mark', p: F, r: markR * 0.85 },
    { id: 'GP', kind: 'gate-port', label: '2p', name: 'the gate (2p)', p: gP, r: markR },
    { id: 'GS', kind: 'gate-stbd', label: '2s', name: 'the gate (2s)', p: gS, r: markR },
    { id: 'PIN', kind: 'pin', label: 'P', name: 'the pin', p: pin, r: markR },
    { id: 'SB', kind: 'start-stbd', label: 'S', name: 'the starboard end', p: stbd, r: markR },
  ];
  const byId: Record<string, Mark> = {};
  for (const m of marks) byId[m.id] = m;

  const legs: Leg[] = [];
  const laps = Math.max(1, Math.min(3, s.laps));
  for (let lap = 0; lap < laps; lap++) {
    const from = lap === 0 ? O : G;
    legs.push({ kind: 'mark', name: lap === 0 ? 'Beat to mark 1' : `Beat to mark 1 (lap ${lap + 1})`, upwind: true, rounding: rounding('W', 'port', from, W, F) });
    legs.push({ kind: 'mark', name: 'Offset mark', upwind: false, rounding: rounding('F', 'port', W, F, G) });
    const next = lap === laps - 1 ? O : W;
    legs.push({
      kind: 'gate', name: 'Run to the gate', upwind: false,
      options: [rounding('GP', 'port', F, gP, add(next, mul(right, 3.2 * L))), rounding('GS', 'stbd', F, gS, add(next, mul(right, -3.2 * L)))],
    });
  }
  legs.push({ kind: 'finish', name: 'Beat to the finish', upwind: true });

  const across = Math.max(half + 8, (beatUp + runDown) * 0.62);
  return {
    axis, up, right, L, marks, byId,
    start: { pin, stbd }, finish: { pin, stbd },
    legs,
    bounds: { alongMin: (-runDown - 9) * L, alongMax: (beatUp + 9) * L, across: across * L },
    origin: O,
    beat: beatUp * L,
    rot: 0,
  };
}

/** Position in the course frame: along = metres upwind of the start line centre, across = metres to the right. */
export function toCourse(c: Course, p: V2): { along: number; across: number } {
  const d = sub(p, c.origin);
  return { along: dot(d, c.up), across: dot(d, c.right) };
}
export function fromCourse(c: Course, along: number, across: number): V2 {
  return add(c.origin, add(mul(c.up, along), mul(c.right, across)));
}

/** Signed progress round a mark in the rounding direction, from the bearing of the boat. */
export function initialProgress(r: Rounding, mark: V2, p: V2): number {
  const b = bearing(mark, p);
  let d = ((b - r.betaIn) % 360 + 540) % 360 - 180; // (-180, 180]
  if (r.side === 'port') d = -d;
  return d;
}

/** Point on the rounding path: progress phi (deg) at radius rad. */
export function roundingPoint(r: Rounding, mark: V2, phi: number, rad: number): V2 {
  const b = r.side === 'port' ? r.betaIn - phi : r.betaIn + phi;
  return add(mark, mul(dir(b), rad));
}
