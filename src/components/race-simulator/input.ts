// Controls: keyboard, a USB transmitter or gamepad, and the on-screen sticks all feed one
// rudder (-1..1, + = turn to starboard) and one sheet (0 = eased right out, 1 = sheeted in).

export interface GamepadMapping {
  rudderAxis: number;
  sheetAxis: number;
  rudderInverted: boolean;
  sheetInverted: boolean;
  deadzone: number;
}

export const DEFAULT_MAPPING: GamepadMapping = { rudderAxis: 0, sheetAxis: 3, rudderInverted: false, sheetInverted: false, deadzone: 0.08 };
const KEY = 'race-sim-gamepad-mapping';

export function loadMapping(): GamepadMapping {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...DEFAULT_MAPPING, ...JSON.parse(s) };
  } catch { /* storage unavailable */ }
  return DEFAULT_MAPPING;
}

export function saveMapping(m: GamepadMapping) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable */ }
}

export function firstGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const g of navigator.getGamepads()) if (g) return g;
  return null;
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

  update(dt: number, map: GamepadMapping) {
    // Keyboard: holding a key winds the rudder over; letting go centres it.
    const want = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (want !== 0) this.rudder += (want - this.rudder) * Math.min(1, dt * 5);
    else if (this.touchRudder === null) this.rudder += (0 - this.rudder) * Math.min(1, dt * 9);
    if (this.touchRudder !== null) this.rudder = this.touchRudder;
    if (this.up) this.sheet = Math.min(1, this.sheet + dt * 0.8);
    if (this.down) this.sheet = Math.max(0, this.sheet - dt * 0.8);
    // Transmitter: the rudder stick is the rudder; the sail stick position is the sheet.
    const gp = firstGamepad();
    if (gp) {
      if (map.rudderAxis < gp.axes.length) {
        let r = gp.axes[map.rudderAxis] ?? 0;
        if (map.rudderInverted) r = -r;
        if (Math.abs(r) > map.deadzone && want === 0 && this.touchRudder === null) this.rudder = Math.max(-1, Math.min(1, r));
      }
      if (map.sheetAxis < gp.axes.length) {
        let sv = gp.axes[map.sheetAxis] ?? 0;
        if (map.sheetInverted) sv = -sv;
        const sh = Math.max(0, Math.min(1, (sv + 1) / 2));
        if (this.padSheet === null || Math.abs(sh - this.padSheet) > 0.02) { this.sheet = sh; this.padSheet = sh; }
      }
    }
  }
}
