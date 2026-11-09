// The wind field: one breeze for the whole course that changes in time and place.
// Shifts oscillate and can drift persistently, one side of the course can carry more pressure,
// and puffs and lulls roll down the course. Wind shadow and backwind from boats are applied by
// the engine on top of this field. Everything is seeded, so the same race replays exactly.

import { KN, Rng, V2, clamp, dir, n360 } from './math';

export type WindStrength = 'light' | 'medium' | 'fresh';
export type WindCharacter = 'steady' | 'oscillating' | 'puffy' | 'persistent';

export interface WindSettings {
  strength: WindStrength;
  character: WindCharacter;
  /** Direction the wind comes from at the start, compass degrees. */
  direction: number;
  /** Optional exact speed in knots (venue practice), overrides strength. */
  knots?: number;
}

interface Osc { amp: number; period: number; phase: number }
export interface Puff {
  id: number;
  x: number; y: number;      // centre, m
  r: number;                 // radius across the wind, m
  strength: number;          // +0.3 = 30% more wind, negative = lull
  shift: number;             // degrees added to the direction inside the puff
  age: number; life: number; // s
}

export interface WindSample { twd: number; tws: number }

export class WindField {
  readonly baseTwd: number;
  readonly baseTws: number; // m/s
  private osc: Osc[];
  private gust: Osc[];
  private drift: number;           // deg per second
  private sidePressure: number;    // fraction per metre across the course (positive = more on the right looking upwind)
  private sideShift: number;       // deg per metre across the course
  puffs: Puff[] = [];
  private puffRate: number;        // puffs per second
  private puffStrength: [number, number];
  private nextPuffId = 1;
  private rng: Rng;
  /** Centre and size of the area puffs cover, set by the course. */
  private area: { cx: number; cy: number; halfAlong: number; halfAcross: number };
  readonly character: WindCharacter;

  constructor(settings: WindSettings, seed: number, area: { cx: number; cy: number; halfAlong: number; halfAcross: number }) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.area = area;
    this.character = settings.character;
    const kn = settings.knots ?? (settings.strength === 'light' ? 5 : settings.strength === 'fresh' ? 15 : 9.5);
    this.baseTws = kn * KN;
    this.baseTwd = n360(settings.direction);
    const r = this.rng;
    const ampBy: Record<WindCharacter, number> = { steady: 3, oscillating: 11, puffy: 6, persistent: 4 };
    const A = ampBy[settings.character];
    this.osc = [
      { amp: A, period: r.range(55, 95), phase: r.range(0, Math.PI * 2) },
      { amp: A * 0.45, period: r.range(22, 38), phase: r.range(0, Math.PI * 2) },
      { amp: A * 0.25, period: r.range(140, 220), phase: r.range(0, Math.PI * 2) },
    ];
    this.gust = [
      { amp: settings.character === 'puffy' ? 0.12 : 0.06, period: r.range(18, 30), phase: r.range(0, 6.28) },
      { amp: 0.04, period: r.range(7, 12), phase: r.range(0, 6.28) },
    ];
    this.drift = settings.character === 'persistent' ? r.pick([-1, 1]) * r.range(0.045, 0.07) : 0;
    const sideSign = r.pick([-1, 1]);
    const across = Math.max(10, area.halfAcross);
    this.sidePressure = sideSign * (settings.character === 'steady' ? 0.04 : 0.1) / across;
    this.sideShift = r.range(-1, 1) * 3 / across;
    this.puffRate = settings.character === 'puffy' ? 0.09 : settings.character === 'steady' ? 0.02 : 0.045;
    this.puffStrength = settings.character === 'puffy' ? [0.18, 0.4] : [0.1, 0.25];
    // Seed the course with puffs already on the water.
    for (let i = 0; i < 6; i++) this.spawn(r.range(-1, 1));
  }

  /** Mean direction at time t, before local effects. */
  meanTwd(t: number): number {
    let d = this.baseTwd + this.drift * t;
    for (const o of this.osc) d += o.amp * Math.sin((2 * Math.PI * t) / o.period + o.phase);
    return n360(d);
  }
  meanTws(t: number): number {
    let k = 1;
    for (const g of this.gust) k += g.amp * Math.sin((2 * Math.PI * t) / g.period + g.phase);
    return this.baseTws * k;
  }

  private spawn(alongFrac?: number) {
    const r = this.rng;
    const up = dir(this.baseTwd);              // towards the wind
    const right = { x: up.y, y: -up.x };       // to the right looking upwind
    const a = this.area;
    // New puffs appear upwind of the course; the initial ones are spread along it.
    const along = alongFrac === undefined ? a.halfAlong * 1.3 : alongFrac * a.halfAlong;
    const across = r.range(-1, 1) * a.halfAcross * 1.1;
    const isLull = r.chance(0.28);
    const s = r.range(this.puffStrength[0], this.puffStrength[1]) * (isLull ? -0.7 : 1);
    this.puffs.push({
      id: this.nextPuffId++,
      x: a.cx + up.x * along + right.x * across,
      y: a.cy + up.y * along + right.y * across,
      r: r.range(6, 16) * Math.sqrt(a.halfAcross / 25),
      strength: s,
      shift: r.range(-6, 6),
      age: alongFrac === undefined ? 0 : r.range(5, 20),
      life: r.range(70, 130),
    });
  }

  /** Advance puffs; call once per engine step. */
  step(dt: number, t: number) {
    const tws = this.meanTws(t);
    const down = dir(this.meanTwd(t) + 180);
    const v = tws * 0.55;
    for (const p of this.puffs) {
      p.x += down.x * v * dt;
      p.y += down.y * v * dt;
      p.age += dt;
    }
    this.puffs = this.puffs.filter(p => p.age < p.life);
    if (this.rng.next() < this.puffRate * dt) this.spawn();
  }

  /** Wind at a point, without boats' shadows. */
  sample(x: number, y: number, t: number): WindSample {
    const twd0 = this.meanTwd(t);
    let tws = this.meanTws(t);
    const a = this.area;
    const up = dir(this.baseTwd);
    const right = { x: up.y, y: -up.x };
    const across = (x - a.cx) * right.x + (y - a.cy) * right.y;
    tws *= 1 + clamp(this.sidePressure * across, -0.2, 0.2);
    let twd = twd0 + clamp(this.sideShift * across, -6, 6);
    let k = 1, shift = 0;
    for (const p of this.puffs) {
      const dx = x - p.x, dy = y - p.y;
      const d2 = (dx * dx + dy * dy) / (p.r * p.r);
      if (d2 > 9) continue;
      const env = Math.sin(Math.PI * clamp(p.age / p.life, 0, 1));
      const w = Math.exp(-d2) * env;
      k += p.strength * w;
      shift += p.shift * w;
    }
    tws *= clamp(k, 0.4, 1.6);
    twd += shift;
    return { twd: n360(twd), tws };
  }

  /** Puff intensity at a point (for drawing darker water): positive = more wind. */
  intensity(x: number, y: number): number {
    let k = 0;
    for (const p of this.puffs) {
      const dx = x - p.x, dy = y - p.y;
      const d2 = (dx * dx + dy * dy) / (p.r * p.r);
      if (d2 > 9) continue;
      k += p.strength * Math.exp(-d2) * Math.sin(Math.PI * clamp(p.age / p.life, 0, 1));
    }
    return k;
  }
}

/** Unused helper kept for callers that want a direction vector of the wind's travel. */
export function windTravel(twd: number): V2 {
  return dir(twd + 180);
}
