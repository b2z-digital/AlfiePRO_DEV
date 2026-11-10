// Smooth motion between the race's steps. The race moves on 20 times a second, the screen draws 60
// (or 120). Drawn as stepped, every boat and the water itself would move in little jumps: a judder
// you see most on a boat close to the bank, and ripples that seem to run the wrong way past a boat
// moving quickly (the same trick of the eye that makes a wheel on film turn backwards). So each
// frame is drawn part-way through the last step: every boat between where she was and where she
// is, and the water at the moment in between.
import type { Race } from '@/sim/engine';
import { DT } from '@/sim/physics';
import type { Boat } from '@/sim/types';

const LINEAR = ['x', 'y', 'spd', 'heel', 'sheet', 'tws', 'pitch', 'dive', 'luffUp'] as const;
const ANGLES = ['hdg', 'twd'] as const;
type Key = (typeof LINEAR)[number] | (typeof ANGLES)[number];
type Snap = Record<Key, number>;
type Fields = Record<Key, number | undefined>;

const take = (b: Boat): Snap => {
  const f = b as unknown as Fields, s = {} as Snap;
  for (const k of LINEAR) s[k] = f[k] ?? 0;
  for (const k of ANGLES) s[k] = f[k] ?? 0;
  return s;
};

export class Smoother {
  private prev: Snap[] = [];
  private real: Snap[] = [];
  private realT = 0;
  private at = 0;
  private step = -1;
  private on = false;

  /** Call just before each step of the race: remembers where every boat is. */
  mark(race: Race) {
    this.prev = race.boats.map(take);
    this.step = race.step_;
  }

  /**
   * Put every boat (and the race clock) where they are for this frame: `into` is how far the clock
   * has run into the step after the last one taken, 0 to 1. Never runs backwards (pausing and
   * carrying on again holds still, then moves on). Draw, then call restore().
   */
  apply(race: Race, into: number) {
    if (this.on) this.restore(race);
    // The last step taken went from prev to now: this frame is drawn somewhere along it.
    const stepped = this.prev.length === race.boats.length && race.step_ === this.step + 1;
    const want = stepped ? race.step_ - 1 + Math.max(0, Math.min(1, into)) : race.step_;
    if (race.step_ < Math.floor(this.at)) this.at = want; // the race went back (a take-over, a restart)
    this.at = Math.min(race.step_, Math.max(this.at, want));
    const a = stepped ? Math.max(0, Math.min(1, this.at - (race.step_ - 1))) : 1;
    if (a >= 0.999) return;
    this.real = race.boats.map(take);
    this.realT = race.t;
    race.boats.forEach((b, i) => {
      const f = b as unknown as Fields, p = this.prev[i], r = this.real[i];
      // A boat put somewhere else in one step (towed back, reset) isn't sliding there.
      if (Math.hypot(r.x - p.x, r.y - p.y) > 3 * b.cls.loa) return;
      for (const k of LINEAR) if (f[k] !== undefined) f[k] = p[k] + (r[k] - p[k]) * a;
      for (const k of ANGLES) if (f[k] !== undefined) f[k] = p[k] + ((((r[k] - p[k]) % 360) + 540) % 360 - 180) * a;
    });
    race.renderLag = (1 - a) * DT;
    race.t = this.realT - race.renderLag;
    this.on = true;
  }

  /** Put the race back as it really is. */
  restore(race: Race) {
    if (!this.on) return;
    race.boats.forEach((b, i) => {
      const f = b as unknown as Fields, r = this.real[i];
      if (!r) return;
      for (const k of LINEAR) if (f[k] !== undefined) f[k] = r[k];
      for (const k of ANGLES) if (f[k] !== undefined) f[k] = r[k];
    });
    race.t = this.realT;
    race.renderLag = 0;
    this.on = false;
  }
}
