// Setting up a transmitter by moving its sticks: which axis is the rudder and which the sail, which
// way is right and which end is "sheeted in", where the rudder stick rests and how far each goes.
// Pure helpers (tested), plus the hook that lists what's plugged in.
import { useEffect, useState } from 'react';
import type { Trigger } from './input';
import { connectedPads, deviceName, isTransmitter, savedFor } from './input';

/** One reading of every axis and button, at time t (ms). */
export interface PadFrame { t: number; axes: number[]; buttons: boolean[] }

export function frameOf(gp: { axes: readonly number[]; buttons: readonly { pressed: boolean }[] }, t: number): PadFrame {
  return { t, axes: [...gp.axes], buttons: gp.buttons.map(b => b.pressed) };
}

/** Every axis's range while a stick is being moved. */
export class Watch {
  min: number[]; max: number[];
  constructor(public start: PadFrame) {
    this.min = [...start.axes];
    this.max = [...start.axes];
  }
  add(f: PadFrame) {
    f.axes.forEach((v, i) => {
      this.min[i] = Math.min(this.min[i] ?? v, v);
      this.max[i] = Math.max(this.max[i] ?? v, v);
    });
  }
  /** The axis that has moved furthest (not one of `not`), once it has covered at least `need`. */
  moved(not: number[] = [], need = 0.9): { axis: number; min: number; max: number } | null {
    let k = -1, span = need;
    this.min.forEach((m, i) => {
      const s = (this.max[i] ?? m) - m;
      if (!not.includes(i) && s >= span) { span = s; k = i; }
    });
    return k < 0 ? null : { axis: k, min: this.min[k], max: this.max[k] };
  }
}

/** How long a value has stayed put (within `tol`), in ms. */
export class Hold {
  private ref = NaN;
  private since = 0;
  feed(t: number, v: number, tol = 0.05): number {
    if (!(Math.abs(v - this.ref) <= tol)) { this.ref = v; this.since = t; }
    return t - this.since;
  }
}

/** Which end of a range a value is at (within `frac` of the span of it), if either. */
export function atEnd(v: number, min: number, max: number, frac = 0.2): 'min' | 'max' | null {
  const span = max - min;
  if (span <= 0) return null;
  if (v <= min + span * frac) return 'min';
  if (v >= max - span * frac) return 'max';
  return null;
}

/** Well away from both ends: where a self-centring stick rests. */
export function inMiddle(v: number, min: number, max: number): boolean {
  return atEnd(v, min, max, 0.25) === null;
}

/**
 * A switch flicked or a button pressed since `start`: a button that's down now but wasn't, or a
 * channel (not one of the sticks in `not`) that has moved a long way from where it was.
 */
export function flicked(start: PadFrame, now: PadFrame, not: number[]): Trigger | null {
  for (let i = 0; i < now.buttons.length; i++) if (now.buttons[i] && !start.buttons[i]) return { kind: 'button', index: i };
  let best: Trigger | null = null, far = 0.9;
  for (let i = 0; i < now.axes.length; i++) {
    const v = now.axes[i], d = Math.abs(v - (start.axes[i] ?? v));
    if (!not.includes(i) && d >= far) { far = d; best = { kind: 'axis', index: i, on: v }; }
  }
  return best;
}

/** "Axis 3", "Button 2": how a trigger is described in the set-up. */
export function triggerText(t: Trigger | null | undefined): string {
  if (!t) return 'Not set';
  return t.kind === 'button' ? `Button ${t.index + 1}` : `Switch on axis ${t.index + 1}`;
}

// ── Checked since it was plugged in ──
//
// Every EdgeTX and OpenTX radio reports the same USB id (1209:4F54), so the browser can't tell one
// skipper's radio from another's. A set-up saved for "this transmitter" is really saved for every
// radio of its kind, and two radios set up differently (a channel reversed, sticks on other channels)
// would sail back to front on each other's set-up. So a transmitter is only trusted once someone has
// checked its sticks since it was plugged in: each time one is plugged in (or comes back after being
// unplugged), the quick check runs again before you sail. Kept for the page only.

const checkedNow = new Set<string>();
let listening = false;
function watchPlugs() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // Unplugged: whatever's plugged in next under that id may be someone else's radio.
  window.addEventListener('gamepaddisconnected', e => { checkedNow.delete((e as GamepadEvent).gamepad.id); });
}
/** Its sticks have been checked since it was plugged in (this page), and it's still plugged in. */
export function isChecked(id: string): boolean {
  watchPlugs();
  if (checkedNow.has(id) && !connectedPads().some(p => p.id === id)) checkedNow.delete(id);
  return checkedNow.has(id);
}
/** Someone has just checked its sticks: steering and sail both the right way. */
export function markChecked(id: string): void { watchPlugs(); checkedNow.add(id); }
/** Forget the check (tests, and when it's unplugged). */
export function forgetChecked(id?: string): void { if (id) checkedNow.delete(id); else checkedNow.clear(); }

// ── What's plugged in ──

export interface PadInfo { id: string; name: string; transmitter: boolean; setUp: boolean; checked: boolean }

function readPads(): PadInfo[] {
  // (Gone from the list without the browser saying so: forget its check too.)
  const now = connectedPads();
  for (const id of [...checkedNow]) if (!now.some(p => p.id === id)) checkedNow.delete(id);
  return now.map(p => ({ id: p.id, name: deviceName(p.id), transmitter: isTransmitter(p.id), setUp: !!savedFor(p.id), checked: checkedNow.has(p.id) }));
}

const samePads = (a: PadInfo[], b: PadInfo[]) => a.length === b.length && a.every((p, i) => p.id === b[i].id && p.setUp === b[i].setUp && p.checked === b[i].checked);

/**
 * The transmitters and gamepads plugged in, kept up to date. (A browser only shows one once a stick
 * has moved or a button been pressed while the page is open.)
 */
export function usePads(): PadInfo[] {
  const [pads, setPads] = useState<PadInfo[]>(readPads);
  useEffect(() => {
    const tick = () => setPads(prev => { const n = readPads(); return samePads(prev, n) ? prev : n; });
    const id = window.setInterval(tick, 700);
    window.addEventListener('gamepadconnected', tick);
    window.addEventListener('gamepaddisconnected', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('gamepadconnected', tick);
      window.removeEventListener('gamepaddisconnected', tick);
    };
  }, []);
  return pads;
}

/** An iPad or iPhone: they only take the game controllers Apple supports, not a radio over USB. */
export function onAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
