// The real country round a venue, in 3D, for the bank view: terrain under the aerial photo, trees,
// houses, roads with traffic, jetties and the landmarks people know the place by. It's drawn as one
// layer over the water (land only; the sky and the water stay the 2D renderer's), so the racing,
// the water and the boats are untouched.
//
// This module is small and doesn't load three.js: the scene, and three with it, load on first use at
// a venue that has scenery baked (scripts/sim-venues/scenery). Until then, or on a device without
// WebGL, the bank view draws its own simple scenery as before.

import type { World, WorldView } from './world';

/** Venues with baked scenery: id -> folder under public/. */
const SCENERY: Record<string, string> = {
  lmryc: '/sim-venues/lmryc/',
};

type Slot = { world: World | null; failed: boolean; loading: boolean; credit: string };
const slots = new Map<string, Slot>();

/** Off for this device (a URL flag or a saved setting), or no WebGL. */
function enabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('scenery');
    if (q === 'off' || q === '0') return false;
    if (window.localStorage?.getItem('alfie.sim.scenery3d') === 'off') return false;
  } catch { /* storage blocked: carry on */ }
  return true;
}

let glOk: boolean | null = null;
function hasWebGL(): boolean {
  if (glOk != null) return glOk;
  try {
    const c = document.createElement('canvas');
    glOk = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { glOk = false; }
  return glOk;
}

/** Whether a venue has scenery at all (whether or not it has loaded yet). */
export function hasScenery(id: string | undefined): boolean {
  return !!id && !!SCENERY[id];
}

/** The venue's 3D scenery when it's ready to draw; starts loading it the first time it's asked for. */
export function sceneryFor(id: string | undefined, standAt?: { x: number; y: number }): World | null {
  if (!id || !SCENERY[id]) return null;
  let s = slots.get(id);
  if (!s) {
    s = { world: null, failed: false, loading: false, credit: '' };
    slots.set(id, s);
    if (!enabled() || !hasWebGL()) { s.failed = true; return null; }
    s.loading = true;
    const slot = s;
    import('./world')
      .then(m => m.createWorld(SCENERY[id], { flatAt: standAt }))
      .then(w => { slot.world = w; slot.credit = w.credit; slot.loading = false; })
      .catch(e => { slot.failed = true; slot.loading = false; console.warn('[scenery3d] not available:', e); });
    return null;
  }
  return s.world && !s.failed ? s.world : null;
}

/** A world that failed while drawing: stop using it (the 2D scenery takes over). */
export function sceneryFailed(id: string, e: unknown) {
  const s = slots.get(id);
  if (s) { s.failed = true; s.world?.dispose(); s.world = null; }
  console.warn('[scenery3d] stopped:', e);
}

/** The data credit to add while the scenery's showing. */
export function sceneryCredit(id: string | undefined): string | null {
  const s = id ? slots.get(id) : undefined;
  return s?.world && !s.failed ? s.credit : null;
}

export type { WorldView };
