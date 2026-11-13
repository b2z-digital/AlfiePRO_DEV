// How a sail flogs. A radio yacht's sails are light film: let one off the wind's pressure (head to
// wind, or sheeted out further than the wind will fill) and it flaps at once, the belly popping from
// side to side, the boom swinging about the wind's line and ripples running back to the leech; sheet
// it in to fill and it sits dead still. This is the one flap "clock" the picture and the sound both
// read, so each crack you hear is a pop you see. Pure.

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Flaps a second for the wind (m/s): a lazy flop in light airs, a rattle in a blow. A jib, being smaller, is quicker. */
export function flapHz(tws: number, kind: 'main' | 'jib' = 'main'): number {
  return (1.8 + 0.55 * Math.max(0, Math.min(9, tws))) * (kind === 'jib' ? 1.35 : 1);
}

/** A sail's own place in the rhythm, from her sail number, so no two boats flap in step. */
export function flapSeed(sail: string, kind: 'main' | 'jib'): number {
  let h = 2166136261;
  for (let i = 0; i < sail.length; i++) h = Math.imul(h ^ sail.charCodeAt(i), 16777619);
  return ((h >>> 0) % 6283) / 1000 + (kind === 'jib' ? 2.1 : 0);
}

/**
 * Where the sail's belly is at time `t`, −1 (popped right out one side) to 1 (the other). Not a
 * steady beat: it hurries and drags like the real thing. Each time it passes through nought, the
 * film snaps across: that's the crack.
 */
export function flapWave(t: number, hz: number, seed: number): number {
  return Math.sin(TAU * hz * t + seed + 0.9 * Math.sin(TAU * hz * 0.31 * t + seed * 1.7));
}

/** How hard the wind throws a flogging sail about, 0 to 1: it barely stirs in a drift and thrashes in a blow. */
export function flapForce(tws: number): number {
  return 0.3 + 0.7 * clamp01((tws - 1) / 5.5);
}

/** How loud one crack is, 0 to 1: nothing from a sail that's nearly full, sharp from one that's flogging in a breeze. */
export function flapLoud(luff: number, tws: number): number {
  const l = clamp01((luff - 0.15) / 0.85);
  return Math.pow(l, 1.4) * (0.22 + 0.78 * clamp01((tws - 1.2) / 6.5));
}

/** How much of it reaches you from `d` hull lengths away, 0 to 1: your own boat is right there; across the pond it's gone. */
export function flapNear(d: number): number {
  return d >= 16 ? 0 : 1 / (1 + (d / 4.5) * (d / 4.5));
}
