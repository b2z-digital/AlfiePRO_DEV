// Controls: keyboard, a USB transmitter or gamepad, and the on-screen sticks all feed one
// rudder (-1..1, + = turn to starboard) and one sheet (0 = eased right out, 1 = sheeted in).
//
// A radio transmitter (RadioMaster, Jumper, FrSky and the rest running EdgeTX or OpenTX) plugged in
// by USB in joystick mode shows up as a joystick: its channels CH1–CH8 are the axes, after the
// radio's own mixes, rates and expo; CH9–CH32 are buttons. Each transmitter keeps its own set-up.

export interface AxisCal { centre: number; min: number; max: number }

/** A switch or button that does something (Hail, Tack): a button, or a channel switched to `on`. */
export type Trigger = { kind: 'button'; index: number } | { kind: 'axis'; index: number; on: number };

export interface GamepadMapping {
  rudderAxis: number;
  sheetAxis: number;
  rudderInverted: boolean;
  sheetInverted: boolean;
  deadzone: number;
  /** From the calibration step: where each stick rests and how far it really goes. */
  cal?: { rudder: AxisCal; sheet: AxisCal };
  /** Hail and Tack on a switch or button, if you want them. */
  hail?: Trigger | null;
  tack?: Trigger | null;
  /** The transmitter this set-up is for (its id, as the browser reports it). */
  device?: string;
}

/** Calibrated: a raw axis reading scaled to -1..1 (centre 0). */
export function calibrated(v: number, c: AxisCal | undefined): number {
  if (!c) return v;
  const span = v >= c.centre ? c.max - c.centre : c.centre - c.min;
  return Math.max(-1, Math.min(1, span > 0.05 ? (v - c.centre) / span : v - c.centre));
}

/** A raw sail-stick reading scaled by its calibrated range to 0..1. */
export function calibratedRange(v: number, c: AxisCal | undefined): number {
  if (!c || c.max - c.min < 0.1) return Math.max(0, Math.min(1, (v + 1) / 2));
  return Math.max(0, Math.min(1, (v - c.min) / (c.max - c.min)));
}

export const DEFAULT_MAPPING: GamepadMapping = { rudderAxis: 0, sheetAxis: 3, rudderInverted: false, sheetInverted: false, deadzone: 0.08 };
/** A transmitter's sticks are precise: barely any dead zone, so small rudder movements count. */
export const TRANSMITTER_DEADZONE = 0.02;

const KEY = 'race-sim-gamepad-mapping';
const DEVICES_KEY = 'race-sim-transmitters';

// ── Which device it is ──

/** A radio transmitter in joystick mode: EdgeTX and OpenTX radios are USB 1209:4F54; or a known make. */
export function isTransmitter(id: string): boolean {
  return /1209\D{0,12}4f54|edgetx|opentx|radiomaster|jumper|frsky|spektrum|flysky|betafpv|tbs tango|tx16s|boxer|zorro|tx12|gx12|mt12|taranis|horus/i.test(id);
}

/** A friendly name: "Radiomaster TX16S (EdgeTX)" from "EdgeTX Radiomaster TX16S Joystick (Vendor: 1209 Product: 4f54)". */
export function deviceName(id: string): string {
  const fw = /edgetx/i.test(id) ? 'EdgeTX' : /opentx/i.test(id) ? 'OpenTX' : null;
  const s = id
    .replace(/\(.*?\)/g, ' ')                       // Chrome's "(Vendor: … Product: …)"
    .replace(/^\s*[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, ' ') // Firefox's "1209-4f54-" in front
    .replace(/\b(edgetx|opentx|joystick|gamepad|controller|hid|usb)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!s) return fw ? `${fw} transmitter` : isTransmitter(id) ? 'Transmitter' : 'Controller';
  return fw ? `${s} (${fw})` : s;
}

// ── Saved set-ups, one per transmitter ──

function readDevices(): Record<string, GamepadMapping> {
  try { return JSON.parse(localStorage.getItem(DEVICES_KEY) || '{}') as Record<string, GamepadMapping>; } catch { return {}; }
}

/** The set-up saved for this transmitter, if there is one. */
export function savedFor(id: string): GamepadMapping | null {
  const m = readDevices()[id];
  return m ? { ...DEFAULT_MAPPING, ...m, device: id } : null;
}

/** The set-up to use: the one for this transmitter if it has one, else the last one saved. */
export function loadMapping(id?: string): GamepadMapping {
  if (id) {
    const m = savedFor(id);
    if (m) return m;
  }
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...DEFAULT_MAPPING, ...JSON.parse(s) };
  } catch { /* storage unavailable */ }
  return id && isTransmitter(id) ? { ...DEFAULT_MAPPING, deadzone: TRANSMITTER_DEADZONE, device: id } : DEFAULT_MAPPING;
}

export function saveMapping(m: GamepadMapping) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    if (m.device) localStorage.setItem(DEVICES_KEY, JSON.stringify({ ...readDevices(), [m.device]: m }));
  } catch { /* storage unavailable */ }
}

// ── The devices plugged in ──

export function connectedPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter((g): g is Gamepad => !!g && g.connected !== false);
}

export function firstGamepad(): Gamepad | null {
  return connectedPads()[0] ?? null;
}

/** What to steer with: the transmitter you set up, else any transmitter, else the first gamepad. */
export function activePad(map?: GamepadMapping | null): Gamepad | null {
  const pads = connectedPads();
  return (map?.device ? pads.find(p => p.id === map.device) : undefined) ?? pads.find(p => isTransmitter(p.id)) ?? pads[0] ?? null;
}

/** Is this switch or button on? A channel counts as on near the position it was set up with. */
export function triggerOn(axes: readonly number[], buttons: readonly { pressed: boolean }[], t: Trigger | null | undefined): boolean {
  if (!t) return false;
  if (t.kind === 'button') return !!buttons[t.index]?.pressed;
  const v = axes[t.index];
  return v != null && Math.abs(v - t.on) < 0.35;
}

/** Live control state, updated by event handlers and read every frame. */
export class Controls {
  left = false; right = false; up = false; down = false;
  rudder = 0;
  sheet = 1;
  /** On-screen rudder stick while it's held (springs back to centre when let go). */
  touchRudder: number | null = null;
  /** Last value from the transmitter's sail stick, so we only take it when it moves. */
  private padSheet: number | null = null;
  /** Hail or Tack switched on since the race last asked (and whether they were on last frame). */
  private fired = { hail: false, tack: false };
  private was = { hail: false, tack: false };

  update(dt: number, map: GamepadMapping) {
    // Keyboard: holding a key winds the rudder over; letting go centres it.
    const want = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (want !== 0) this.rudder += (want - this.rudder) * Math.min(1, dt * 5);
    else if (this.touchRudder === null) this.rudder += (0 - this.rudder) * Math.min(1, dt * 9);
    if (this.touchRudder !== null) this.rudder = this.touchRudder;
    if (this.up) this.sheet = Math.min(1, this.sheet + dt * 0.8);
    if (this.down) this.sheet = Math.max(0, this.sheet - dt * 0.8);
    // Transmitter: the rudder stick is the rudder; the sail stick position is the sheet.
    const gp = activePad(map);
    if (gp) {
      if (map.rudderAxis < gp.axes.length) {
        let r = calibrated(gp.axes[map.rudderAxis] ?? 0, map.cal?.rudder);
        if (map.rudderInverted) r = -r;
        if (Math.abs(r) > map.deadzone && want === 0 && this.touchRudder === null) this.rudder = Math.max(-1, Math.min(1, r));
      }
      if (map.sheetAxis < gp.axes.length) {
        let sh = calibratedRange(gp.axes[map.sheetAxis] ?? 0, map.cal?.sheet);
        if (map.sheetInverted) sh = 1 - sh;
        if (this.padSheet === null || Math.abs(sh - this.padSheet) > 0.02) { this.sheet = sh; this.padSheet = sh; }
      }
      // A switch flicked on (or a button pressed) hails or tacks, once. One already on when the
      // race starts doesn't count until it's flicked off and on again.
      for (const k of ['hail', 'tack'] as const) {
        const on = triggerOn(gp.axes, gp.buttons, map[k]);
        if (on && !this.was[k] && this.primed) this.fired[k] = true;
        this.was[k] = on;
      }
      this.primed = true;
    }
  }
  private primed = false;

  /** Hail and Tack switched on since you last asked. */
  take(): { hail: boolean; tack: boolean } {
    const f = this.fired;
    this.fired = { hail: false, tack: false };
    return f;
  }
}
