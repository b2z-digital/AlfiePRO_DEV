// Sea state: flat water, chop or rough water. Real wind waves on a lake, made of a few wave trains:
// the main waves rolling downwind, a second set a little off the wind, and short chop on top. They
// slow a boat punching into them, knock her bow about, and let her surf downwind in a breeze.
// Deterministic: the waves depend only on the race's settings, the place and the time.
import { DEG, Rng, dir } from './math';

export type SeaKind = 'flat' | 'chop' | 'rough';

const G = 9.81;

/** One train of waves: deep-water waves, so ω² = g k. */
export interface WaveTrain {
  /** Amplitude (half the height), m. */
  amp: number;
  /** Wavelength, m, and wavenumber 2π/λ. */
  length: number; k: number;
  /** Angular frequency, rad/s. */
  omega: number;
  /** The way the waves travel (a unit vector), and a phase offset. */
  dx: number; dy: number; phase: number;
}

export interface Sea {
  kind: SeaKind;
  /** Height of the main waves, crest to trough, m. */
  height: number;
  /** Wavelength and period of the main waves, m and s. */
  length: number;
  period: number;
  /** Direction the waves come from (the wind's direction at the start), compass degrees. */
  from: number;
  /** The main waves first. */
  trains: WaveTrain[];
}

function train(amp: number, length: number, from: number, phase: number): WaveTrain {
  const k = (2 * Math.PI) / length, d = dir(from + 180);
  return { amp, length, k, omega: Math.sqrt(G * k), dx: d.x, dy: d.y, phase };
}

/**
 * Lake waves for the breeze (knots): choppy is a short fetch (in 9 or 10 knots, main waves about
 * 5 cm high and under 2 m long), rough a long fetch (rolling waves about 10 cm high and 4 m long,
 * with whitecaps). Both build as the breeze does: bigger and longer in a fresh breeze.
 */
export function makeSea(kind: SeaKind | undefined, from: number, seed = 1, knots = 9.5): Sea | null {
  if (!kind || kind === 'flat') return null;
  const r = new Rng((seed ^ 0x5ea5) >>> 0);
  const ph = () => r.range(0, Math.PI * 2);
  const side = r.chance(0.5) ? 1 : -1;
  const kn = Math.max(2, knots);
  const chop = kind === 'chop';
  const ref = chop ? 9.5 : 12;
  const ka = Math.min(1.9, Math.max(0.45, Math.pow(kn / ref, 1.3))), kl = Math.min(1.5, Math.max(0.6, Math.pow(kn / ref, 0.7)));
  const trains = chop
    ? [train(0.024 * ka, 1.8 * kl, from, ph()), train(0.011 * ka, 1.2 * kl, from + side * 28, ph()), train(0.005 * ka, 0.5 * kl, from - side * 18, ph())]
    : [train(0.05 * ka, 4.0 * kl, from, ph()), train(0.025 * ka, 2.6 * kl, from + side * 30, ph()), train(0.01 * ka, 0.8 * kl, from - side * 20, ph())];
  const m = trains[0];
  return { kind, height: 2 * m.amp, length: m.length, period: (2 * Math.PI) / m.omega, from, trains };
}

const phaseOf = (w: WaveTrain, x: number, y: number, t: number) => w.k * (x * w.dx + y * w.dy) - w.omega * t + w.phase;

/** Phase of the main waves at a point: crests are where sin(phase) = 1. */
export function wavePhase(sea: Sea, x: number, y: number, t: number): number {
  return phaseOf(sea.trains[0], x, y, t);
}

/** Height of the water surface at a point, m. */
export function seaLevel(sea: Sea, x: number, y: number, t: number): number {
  let z = 0;
  for (const w of sea.trains) z += w.amp * Math.sin(phaseOf(w, x, y, t));
  return z;
}

/** Slope of the water surface at a point: dz/dx and dz/dy. */
export function seaSlope(sea: Sea, x: number, y: number, t: number): { sx: number; sy: number } {
  let sx = 0, sy = 0;
  for (const w of sea.trains) {
    const c = w.amp * w.k * Math.cos(phaseOf(w, x, y, t));
    sx += c * w.dx; sy += c * w.dy;
  }
  return { sx, sy };
}

/** A damped oscillator's steady response to a wave met at frequency ω: gain and phase lag. */
function respond(omega: number, period: number, zeta: number): { g: number; lag: number } {
  const r = Math.abs(omega) / ((2 * Math.PI) / period);
  return { g: 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2), lag: Math.atan2(2 * zeta * r, 1 - r * r) };
}

export interface HullMotion {
  /** Rise of the hull, m. */
  heave: number;
  /** Bow up, degrees. */
  pitch: number;
  /** Roll to port, degrees (added to her heel). */
  roll: number;
}

/**
 * How a hull rides the waves. She can't follow waves shorter than she is (she bridges them, so short
 * chop only jiggles her), she rides long waves up and over, and the faster she meets them the less
 * of each one she follows: a light bounce punching into chop, a long easy motion over rolling
 * waves, a slow surge running with them. `L` is her length, `spd` her speed along `hdg`.
 */
export function hullMotion(sea: Sea, x: number, y: number, t: number, hdg: number, spd: number, L: number): HullMotion {
  const f = dir(hdg);
  let heave = 0, pitch = 0, roll = 0;
  for (const w of sea.trains) {
    const c = f.x * w.dx + f.y * w.dy; // cos of her heading to the waves' travel
    const s = f.x * w.dy - f.y * w.dx;
    // The frequency she meets them at: faster punching into them, slower running with them.
    const enc = w.omega - w.k * spd * c;
    const dirn = enc >= 0 ? 1 : -1;
    const ph = phaseOf(w, x, y, t);
    // Averaged over her length: u is half the phase change from stern to bow.
    const u = (w.k * L * c) / 2;
    const au = Math.abs(u);
    const sinc = au < 1e-4 ? 1 : Math.sin(u) / u;
    const tilt = au < 1e-4 ? (2 * u) / L : (6 / L) * ((Math.sin(u) - u * Math.cos(u)) / (u * u));
    const h = respond(enc, 0.5, 0.6), p = respond(enc, 0.7, 0.6), rl = respond(enc, 1.1, 0.3);
    heave += h.g * w.amp * sinc * Math.sin(ph + dirn * h.lag);
    pitch += p.g * w.amp * tilt * Math.cos(ph + dirn * p.lag);
    // Across her the waves tip her; the heavy bulb answers slowly.
    roll -= 0.5 * rl.g * w.amp * w.k * s * Math.cos(ph + dirn * rl.lag);
  }
  return { heave, pitch: Math.atan(pitch) / DEG, roll: Math.atan(roll) / DEG };
}

export interface WaveEffect {
  /** Multiplier on target speed. */
  speed: number;
  /** Turn rate added by the waves, deg/s. */
  yaw: number;
}

/** What the waves do to a boat at this moment, for her heading relative to where the waves come from. */
export function waveEffect(sea: Sea, x: number, y: number, t: number, hdg: number): WaveEffect {
  const main = sea.trains[0], second = sea.trains[1];
  const ph = phaseOf(main, x, y, t);
  const ph2 = second ? phaseOf(second, x, y, t) : ph * 0.61;
  const k = sea.height / 0.1;                        // about 1 in rough water
  const into = Math.cos((hdg - sea.from) * DEG);     // 1 = heading straight into the waves
  const beam = Math.abs(Math.sin((hdg - sea.from) * DEG));
  const lift = (1 + Math.sin(ph)) / 2;               // 0 in a trough, 1 on a crest
  // Punching into waves: speed lost slamming, more as the bow climbs each crest.
  const slam = into > 0 ? 0.13 * k * Math.pow(into, 1.5) * (0.55 + 0.45 * lift) : 0;
  // Running in a breeze: a lift on the face of each wave, surfing.
  const surf = into < -0.3 ? 0.12 * k * (-into) * Math.max(0, Math.sin(ph + 0.6)) : 0;
  // The bow is knocked about, most in a beam sea.
  const yaw = 11 * k * (0.35 + 0.65 * beam) * (Math.sin(ph) * 0.7 + Math.sin(ph2) * 0.3);
  return { speed: 1 - slam + surf, yaw };
}
