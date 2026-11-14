// A radio transmitter as the remote: finding which stick is which by watching them move, naming the
// radio, remembering each one's set-up, and Hail and Tack on a switch.
import { beforeEach, describe, expect, it } from 'vitest';
import { Controls, DEFAULT_MAPPING, GamepadMapping, deviceName, isTransmitter, loadMapping, saveMapping, savedFor, triggerOn } from '@/components/race-simulator/input';
import { Hold, PadFrame, Watch, atEnd, flicked, inMiddle } from '@/components/race-simulator/transmitter';

const EDGETX_CHROME = 'EdgeTX Radiomaster TX16S Joystick (STANDARD GAMEPAD Vendor: 1209 Product: 4f54)';
const frame = (t: number, axes: number[], buttons: boolean[] = []): PadFrame => ({ t, axes, buttons });

// A stand-in for localStorage and the browser's gamepads.
const store = new Map<string, string>();
let pads: (Gamepad | null)[] = [];
beforeEach(() => {
  store.clear();
  pads = [];
  (globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  (globalThis as Record<string, unknown>).navigator = { getGamepads: () => pads };
});
function radio(axes: number[], pressed: number[] = [], id = EDGETX_CHROME): Gamepad {
  return { id, index: 0, connected: true, mapping: '', timestamp: 0, axes, buttons: Array.from({ length: 24 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })), hapticActuators: [], vibrationActuator: null } as unknown as Gamepad;
}

describe('Which device it is', () => {
  it('knows an EdgeTX or OpenTX radio, and RadioMaster and the like', () => {
    expect(isTransmitter(EDGETX_CHROME)).toBe(true);
    expect(isTransmitter('1209-4f54-EdgeTX Radiomaster Boxer Joystick')).toBe(true);
    expect(isTransmitter('OpenTX Jumper T-Pro Joystick')).toBe(true);
    expect(isTransmitter('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe(false);
  });
  it('gives it a friendly name', () => {
    expect(deviceName(EDGETX_CHROME)).toBe('Radiomaster TX16S (EdgeTX)');
    expect(deviceName('1209-4f54-EdgeTX Radiomaster Boxer Joystick')).toBe('Radiomaster Boxer (EdgeTX)');
    expect(deviceName('EdgeTX Joystick')).toBe('EdgeTX transmitter');
    expect(deviceName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('Xbox Wireless');
  });
});

describe('Finding the sticks by moving them', () => {
  it('picks the axis that moved furthest, leaving out the one already taken', () => {
    const w = new Watch(frame(0, [0, 0, -1, 0, -1]));
    // The rudder stick (axis 0) right across; the other stick jiggles a little.
    [[0.9, 0.05, -1, 0.1, -1], [-0.95, -0.04, -1, 0.12, -1], [0.98, 0, -1, 0, -1]].forEach((a, i) => w.add(frame(100 * (i + 1), a)));
    expect(w.moved()).toEqual({ axis: 0, min: -0.95, max: 0.98 });
    // Then the sail stick (axis 2): the rudder axis is left out, small wobbles don't count.
    const s = new Watch(frame(0, [0, 0, -1, 0, -1]));
    [[0.3, 0, 0.2, 0, -1], [-0.2, 0, 1, 0, -1], [0, 0, -0.98, 0, -1]].forEach((a, i) => s.add(frame(100 * (i + 1), a)));
    expect(s.moved([0])).toEqual({ axis: 2, min: -1, max: 1 });
    expect(new Watch(frame(0, [0, 0.2])).moved()).toBeNull();
  });

  it('copes with a radio whose rates keep the stick short of full travel', () => {
    const w = new Watch(frame(0, [0, 0]));
    [0.62, -0.6, 0.61].forEach((v, i) => w.add(frame(100 * (i + 1), [v, 0])));
    expect(w.moved()?.axis).toBe(0); // a span of 1.2 is plenty
  });

  it('tells which end a stick is at, and when it rests in the middle', () => {
    expect(atEnd(0.95, -1, 1)).toBe('max');
    expect(atEnd(-0.7, -1, 1)).toBe('min');
    expect(atEnd(0.1, -1, 1)).toBeNull();
    expect(atEnd(0.55, -0.6, 0.6)).toBe('max'); // reduced rates: still the end of its travel
    expect(inMiddle(0.02, -1, 1)).toBe(true);
    expect(inMiddle(0.6, -1, 1)).toBe(false);
  });

  it('times how long a stick is held still', () => {
    const h = new Hold();
    expect(h.feed(0, 0.9)).toBe(0);
    expect(h.feed(200, 0.92)).toBe(200);
    expect(h.feed(400, 0.6)).toBe(0); // moved: starts again
    expect(h.feed(900, 0.61)).toBe(500);
  });
});

describe('Hail and Tack on a switch', () => {
  it('learns a switch on a spare channel, or a button', () => {
    const start = frame(0, [0, 0, -1, 0, -1, -1], [false, false]);
    expect(flicked(start, frame(50, [0.4, 0, -0.5, 0, -1, -1]), [0, 2])).toBeNull(); // the sticks moving don't count
    expect(flicked(start, frame(100, [0, 0, -1, 0, 1, -1]), [0, 2])).toEqual({ kind: 'axis', index: 4, on: 1 });
    expect(flicked(start, frame(100, [0, 0, -1, 0, 0, -1]), [0, 2])).toEqual({ kind: 'axis', index: 4, on: 0 }); // a three-way switch to the middle
    expect(flicked(start, frame(100, [0, 0, -1, 0, -1, -1], [false, true]), [0, 2])).toEqual({ kind: 'button', index: 1 });
  });

  it('says a switch is on near the position it was learnt in', () => {
    const t = { kind: 'axis' as const, index: 4, on: 1 };
    expect(triggerOn([0, 0, 0, 0, 0.98], [], t)).toBe(true);
    expect(triggerOn([0, 0, 0, 0, 0], [], t)).toBe(false);
    expect(triggerOn([], [{ pressed: true }, { pressed: false }], { kind: 'button', index: 0 })).toBe(true);
    expect(triggerOn([0], [], null)).toBe(false);
  });

  it('hails once each time the switch goes on, and not for one already on at the start', () => {
    const map: GamepadMapping = { ...DEFAULT_MAPPING, rudderAxis: 0, sheetAxis: 2, hail: { kind: 'axis', index: 4, on: 1 }, tack: { kind: 'button', index: 3 } };
    const c = new Controls();
    pads = [radio([0, 0, -1, 0, 1])]; // the hail switch is already on
    c.update(0.016, map);
    expect(c.take()).toEqual({ hail: false, tack: false });
    pads = [radio([0, 0, -1, 0, -1])]; c.update(0.016, map); // off
    pads = [radio([0, 0, -1, 0, 1])]; c.update(0.016, map); // on: hail
    expect(c.take()).toEqual({ hail: true, tack: false });
    c.update(0.016, map); // still on: nothing more
    expect(c.take()).toEqual({ hail: false, tack: false });
    pads = [radio([0, 0, -1, 0, 1], [3])]; c.update(0.016, map); // the tack button
    expect(c.take()).toEqual({ hail: false, tack: true });
  });
});

describe('Steering with it', () => {
  it('uses the set-up: calibrated rudder, reversed sail, a small dead zone', () => {
    const map: GamepadMapping = {
      ...DEFAULT_MAPPING, rudderAxis: 0, sheetAxis: 2, sheetInverted: true, deadzone: 0.02,
      cal: { rudder: { centre: 0.04, min: -0.6, max: 0.62 }, sheet: { centre: 0, min: -1, max: 1 } },
    };
    const c = new Controls();
    pads = [radio([0.33, 0, -1])];
    c.update(0.016, map);
    expect(c.rudder).toBeCloseTo((0.33 - 0.04) / (0.62 - 0.04), 5); // half right, with reduced rates
    expect(c.sheet).toBeCloseTo(1, 5); // stick at its "in" end
    pads = [radio([0.05, 0, 1])];
    c.update(0.016, map);
    expect(c.sheet).toBeCloseTo(0, 5); // eased right out
  });
});

describe('Each transmitter keeps its own set-up', () => {
  it('saves per radio and loads the right one', () => {
    const a: GamepadMapping = { ...DEFAULT_MAPPING, rudderAxis: 0, sheetAxis: 2, device: EDGETX_CHROME };
    const b: GamepadMapping = { ...DEFAULT_MAPPING, rudderAxis: 3, sheetAxis: 1, device: 'Xbox Wireless Controller' };
    saveMapping(a); saveMapping(b);
    expect(savedFor(EDGETX_CHROME)?.rudderAxis).toBe(0);
    expect(loadMapping('Xbox Wireless Controller').rudderAxis).toBe(3);
    expect(loadMapping().rudderAxis).toBe(3); // no device: the last one saved
    expect(savedFor('Something new')).toBeNull();
  });
  it('starts a new radio with a small dead zone', () => {
    expect(loadMapping('EdgeTX Radiomaster Pocket Joystick').deadzone).toBe(0.02);
  });
});

describe('Every radio is checked before it sails', () => {
  // Every EdgeTX radio reports the same USB id, so a set-up saved here may be another skipper's radio.
  it('two EdgeTX radios look the same to the browser, so the saved set-up is shared between them', () => {
    saveMapping({ ...DEFAULT_MAPPING, rudderInverted: true, device: EDGETX_CHROME });
    expect(savedFor(EDGETX_CHROME)?.rudderInverted).toBe(true);
    // (A second skipper's TX16S, its rudder channel the other way round, would get the same set-up.)
  });

  it('a transmitter is unchecked when plugged in, checked once someone confirms its sticks, and unchecked again when it is unplugged', async () => {
    const { isChecked, markChecked, forgetChecked } = await import('@/components/race-simulator/transmitter');
    forgetChecked();
    pads = [radio([0, 0, 0, 0])];
    expect(isChecked(EDGETX_CHROME)).toBe(false);
    markChecked(EDGETX_CHROME);
    expect(isChecked(EDGETX_CHROME)).toBe(true);
    // Unplugged (the browser lists it no more): the next radio plugged in under that id is checked again.
    pads = [];
    expect(isChecked(EDGETX_CHROME)).toBe(false);
    pads = [radio([0, 0, 0, 0])];
    expect(isChecked(EDGETX_CHROME)).toBe(false);
  });
});
