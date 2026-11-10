// Sea state: flat water, chop or rough water. Waves roll downwind at model scale (a few centimetres
// high, under a metre to a metre and a half long), slow a boat punching into them, knock her bow
// about, and let her surf downwind in a breeze. Deterministic: waves depend only on place and time.
import { DEG, dir } from './math';

export type SeaKind = 'flat' | 'chop' | 'rough';

export interface Sea {
  kind: SeaKind;
  /** Wave height, m. */
  height: number;
  /** Wavelength, m. */
  length: number;
  /** Period, s (deep-water waves: T = sqrt(2πλ/g)). */
  period: number;
  /** Direction the waves come from (the wind's direction at the start), compass degrees. */
  from: number;
}

export function makeSea(kind: SeaKind | undefined, from: number): Sea | null {
  if (!kind || kind === 'flat') return null;
  const height = kind === 'chop' ? 0.04 : 0.1;
  const length = kind === 'chop' ? 0.8 : 1.5;
  return { kind, height, length, period: Math.sqrt((2 * Math.PI * length) / 9.81), from };
}

/** Wave phase at a point: crests are where sin(phase) = 1. */
export function wavePhase(sea: Sea, x: number, y: number, t: number): number {
  const d = dir(sea.from + 180); // the way the waves travel
  const s = x * d.x + y * d.y;
  // A second, longer swell at an angle keeps it from looking (and feeling) like a metronome.
  return 2 * Math.PI * (s / sea.length - t / sea.period);
}

export interface WaveEffect {
  /** Multiplier on target speed. */
  speed: number;
  /** Turn rate added by the waves, deg/s. */
  yaw: number;
}

/** What the waves do to a boat at this moment, for her heading relative to where the waves come from. */
export function waveEffect(sea: Sea, x: number, y: number, t: number, hdg: number): WaveEffect {
  const ph = wavePhase(sea, x, y, t);
  const ph2 = wavePhase(sea, x * 0.83 + y * 0.31, y * 0.83 - x * 0.31, t * 0.9) * 0.61;
  const k = sea.height / 0.1;                        // 1 in rough water
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
