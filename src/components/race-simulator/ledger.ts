// Where your race went. As you sail, every fraction of a second is compared with the best a boat
// could do in the wind you had (her best speed made good, on the better tack), and the difference
// is booked to its cause: the start, tacks and gybes, mark roundings, penalty turns, sailing past
// the layline, dirty air, the wrong tack for the shift, or plain boat speed. Added up, that is how
// many boat lengths you gave away to a perfect race, and where. Pure: no drawing, nothing stored.
import { vmgAngles } from '@/sim/classes';
import type { Race } from '@/sim/engine';
import { bearing, dir, n180 } from '@/sim/math';
import type { Boat } from '@/sim/types';

export type Cause = 'start' | 'speed' | 'turns' | 'shifts' | 'laylines' | 'roundings' | 'air' | 'penalties';
export const CAUSES: Cause[] = ['start', 'speed', 'turns', 'shifts', 'laylines', 'roundings', 'air', 'penalties'];

/** Lengths given away, by cause, with the single costliest moments. */
export interface Ledger {
  /** Boat lengths lost to a perfect race, all causes. */
  total: number;
  parts: { cause: Cause; lengths: number }[];
  /** The costliest single moments (a tack, a rounding, a penalty, an overstood layline): seconds after the gun. */
  worst: { cause: Cause; t: number; lengths: number }[];
  /** Of the boat-speed loss, how much was upwind (the rest downwind), and of the turns, how much in tacks. */
  speedUp: number; tacks: number;
  /** How many tacks and gybes you made. */
  tacksMade: number; gybesMade: number;
  /** Minutes raced. */
  minutes: number;
}

const zero = (): Record<Cause, number> => ({ start: 0, speed: 0, turns: 0, shifts: 0, laylines: 0, roundings: 0, air: 0, penalties: 0 });

/** One turn (or two in quick succession), one rounding, one penalty or one trip past a layline. `n`: the turns in it; `par`: what doing it cleanly costs, in metres. */
interface Moment { cause: Cause; t: number; m: number; n: number; par: number }

/**
 * What a clean one costs, in boat lengths: nobody tacks, gybes or rounds a mark for nothing, so only
 * what you lose beyond this is counted as given away. From the simulator's best skippers sailing alone.
 */
export const PAR = { tack: 1.0, gybe: 0.2, top: 6.2, gate: 5.0 };

export class LossTally {
  /** Metres lost, by cause. */
  m = zero();
  speedUpM = 0;
  private lastT = -1;
  private t0: number | null = null;
  private startedAt: number | null = null;
  private episode: Moment | null = null;
  private episodes: Moment[] = [];
  /** Each mark's rounding, by the leg that ends at it: all of it, from the zone to away on the next leg. */
  private rounds = new Map<number, Moment>();
  private turnAt = -1e9;
  tacksMade = 0; gybesMade = 0;

  /** Call as often as you like while the race runs: it books a slice at most five times a second. */
  step(race: Race, b: Boat): void {
    const t = race.t;
    if (t < race.gunT || b.finished || b.retired || b.disabled) { this.lastT = t; return; }
    if (this.lastT < 0 || t - this.lastT < 0.2) { if (this.lastT < 0) this.lastT = t; return; }
    // (A long gap is a pause or a skip, not sailing time.)
    const dt = Math.min(0.5, t - this.lastT);
    this.lastT = t;
    if (this.t0 === null) this.t0 = t;
    if (b.started && this.startedAt === null) this.startedAt = t;

    const c = race.course, L = b.cls.loa;
    const leg = c.legs[b.started ? b.legIndex : 0];
    if (!leg) return;
    const v = dir(b.hdg);
    const vx = v.x * b.spd, vy = v.y * b.spd;
    // The mark she's sailing for (the nearer gate mark; the middle of the finishing line).
    let mark: { x: number; y: number };
    if (leg.kind === 'mark') mark = c.byId[leg.rounding.markId].p;
    else if (leg.kind === 'gate') {
      const a = c.byId[leg.options[0].markId].p, g = c.byId[leg.options[1].markId].p;
      mark = Math.hypot(a.x - b.x, a.y - b.y) <= Math.hypot(g.x - b.x, g.y - b.y) ? a : g;
    } else mark = { x: (c.finish.pin.x + c.finish.stbd.x) / 2, y: (c.finish.pin.y + c.finish.stbd.y) / 2 };
    const dMark = Math.hypot(mark.x - b.x, mark.y - b.y);
    const brg = bearing(b, mark);

    let cause: Cause;
    let group = -1;                // which mark's rounding this slice belongs to
    let lost: number;              // metres, this slice
    let split: { air: number; shifts: number } | null = null;

    // The short reach from mark 1 to the offset mark is part of rounding the top of the course:
    // she should be closing on it at full speed for the angle.
    if (leg.kind === 'mark' && !leg.upwind) {
      const closing = (vx * (mark.x - b.x) + vy * (mark.y - b.y)) / Math.max(0.01, dMark);
      lost = (Math.max(b.targetSpd, 0.2 * b.cls.hullSpeed) - closing) * dt;
      cause = b.penalty.active ? 'penalties' : 'roundings';
      group = b.legIndex - 1;
    } else {
      const up = leg.upwind;
      // The wind she'd have in clear air, and the best she could make good in it, up or down the
      // course, on whichever tack points closer to where she's going.
      const free = b.tws / Math.max(0.5, 1 - b.shadow);
      const axis = up ? c.up : { x: -c.up.x, y: -c.up.y };
      const made = vx * axis.x + vy * axis.y;
      const best = (tws: number) => {
        const vm = vmgAngles(b.cls, tws);
        const ang = up ? vm.up : vm.down, spd = up ? vm.upSpeed : vm.downSpeed;
        const f = (h: number) => { const d = dir(h); return spd * (d.x * axis.x + d.y * axis.y); };
        const a = f(b.twd + ang), z = f(b.twd - ang);
        // The tack she's on is the one whose course is nearer her heading.
        const onA = Math.abs(n180(b.hdg - (b.twd + ang))) <= Math.abs(n180(b.hdg - (b.twd - ang)));
        return { both: Math.max(a, z), mine: onA ? a : z, ang };
      };
      const clear = best(free), here = best(b.tws);
      // Is the mark inside the cone she can work in (both tacks open), or has she sailed past a layline?
      const off = Math.abs(n180(brg - (up ? b.twd : b.twd + 180)));
      const cone = up ? clear.ang : 180 - clear.ang;
      const open = off < cone - 6 && dMark > 5 * L;
      const past = off > cone + 6 && dMark > 3 * L;
      const sinceTurn = t - Math.max(b.lastHtwT, b.lastGybeT);
      const ideal = open || past ? clear.both : clear.mine;
      lost = (ideal - made) * dt;

      // Just round a mark: getting going again on the new leg is part of the rounding.
      const prev = b.legIndex > 0 ? c.legs[b.legIndex - 1] : null;
      const exit = b.started && prev !== null && t - (b.roundedAt[b.legIndex - 1] ?? -1e9) < 4;
      if (!b.started) cause = 'start';
      else if (b.penalty.active) cause = 'penalties';
      else if (dMark < 4 * L && leg.kind !== 'finish') { cause = 'roundings'; group = b.legIndex; }
      else if (exit) { cause = 'roundings'; group = prev!.kind === 'mark' && !prev!.upwind ? b.legIndex - 2 : b.legIndex - 1; }
      else if (sinceTurn >= 0 && sinceTurn < 5 && Math.max(b.lastHtwT, b.lastGybeT) >= (this.startedAt ?? t)) cause = 'turns';
      else if (this.startedAt !== null && t - this.startedAt < 8 && b.legIndex === 0) cause = 'start';
      else if (past) cause = 'laylines';
      else {
        cause = 'speed';
        // Of what's left: less wind than the boats in clear air have, and the wrong tack for the shift.
        const air = b.shadow > 0.05 ? Math.max(0, (clear.both - here.both) * dt) : 0;
        const shifts = open ? Math.max(0, (here.both - here.mine) * dt) : 0;
        split = { air: Math.min(Math.max(0, lost), air), shifts: 0 };
        split.shifts = Math.min(Math.max(0, lost - split.air), shifts);
      }
      if (cause === 'speed' && up) this.speedUpM += lost - (split ? split.air + split.shifts : 0);
    }

    if (split) { this.m.air += split.air; this.m.shifts += split.shifts; this.m.speed += lost - split.air - split.shifts; }
    else this.m[cause] += lost;

    // Count the turns as they're made.
    const turned = Math.max(b.lastHtwT, b.lastGybeT);
    const fresh = b.started && turned > this.turnAt && turned >= (this.startedAt ?? t);
    const tacked = b.lastHtwT >= b.lastGybeT;
    if (fresh) { this.turnAt = turned; if (tacked) this.tacksMade++; else this.gybesMade++; }

    // A rounding is one moment from the zone to away on the next leg, whatever she does in it.
    if (cause === 'roundings' && group >= 0) {
      let r = this.rounds.get(group);
      if (!r) { const at = c.legs[group]; r = { cause, t: t - race.gunT, m: 0, n: 1, par: (at?.kind === 'gate' ? PAR.gate : PAR.top) * L }; this.rounds.set(group, r); }
      r.m += lost;
    }
    // One turn (or two together), one penalty, one trip past a layline: each a moment too.
    const moment = cause === 'turns' || cause === 'penalties' || cause === 'laylines';
    if (this.episode && (!moment || this.episode.cause !== cause)) { this.episodes.push(this.episode); this.episode = null; }
    if (moment) {
      if (!this.episode) this.episode = { cause, t: t - race.gunT, m: 0, n: 0, par: 0 };
      this.episode.m += lost;
      if (cause === 'turns' && fresh) { this.episode.n++; this.episode.par += (tacked ? PAR.tack : PAR.gybe) * L; }
      if (cause === 'turns') (this.episode as Moment & { tack?: boolean }).tack ??= tacked;
    }
  }

  /** Every moment so far, in metres: what it cost, and what a clean one would have. */
  moments(): Moment[] { return [...this.rounds.values(), ...this.episodes, ...(this.episode ? [this.episode] : [])]; }

  /**
   * The ledger so far, in boat lengths. Turns and roundings count only for what they cost beyond a
   * clean one. `extraStart` is lengths lost by starting away from the favoured end.
   */
  result(b: Boat, extraStart = 0): Ledger {
    const L = b.cls.loa;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const all = this.moments();
    const over = (e: Moment) => Math.max(0, e.m - e.par);
    const sum = (cause: Cause) => all.filter(e => e.cause === cause).reduce((s, e) => s + over(e), 0);
    const metres: Record<Cause, number> = { ...this.m, turns: sum('turns'), roundings: sum('roundings') };
    const parts = CAUSES.map(cause => ({ cause, lengths: r1(Math.max(0, metres[cause] / L + (cause === 'start' ? Math.max(0, extraStart) : 0))) }));
    const total = r1(parts.reduce((s, p) => s + p.lengths, 0));
    const worst = all.filter(e => over(e) / L >= 0.7).sort((a, z) => over(z) - over(a)).slice(0, 4).map(e => ({ cause: e.cause, t: Math.round(e.t), lengths: r1(over(e) / L) }));
    const tackM = all.filter(e => e.cause === 'turns' && (e as Moment & { tack?: boolean }).tack).reduce((s, e) => s + over(e), 0);
    return {
      total, parts, worst,
      speedUp: r1(Math.max(0, this.speedUpM / L)), tacks: r1(tackM / L),
      tacksMade: this.tacksMade, gybesMade: this.gybesMade,
      minutes: r1(this.t0 === null ? 0 : (this.lastT - this.t0) / 60),
    };
  }
}

/** What each cause is called, what it means, and the practice that fixes it. */
export const CAUSE_WORDS: Record<Cause, { name: string; what: string }> = {
  start: { name: 'The start', what: 'Late to the line, slow across it, or away from the favoured end.' },
  speed: { name: 'Boat speed', what: 'Sailing in clear air on the right tack, but slower or lower than she can go: trim, pinching, steering.' },
  turns: { name: 'Tacks and gybes', what: 'What your turns cost beyond clean ones (a clean tack costs about a length, a clean gybe almost nothing).' },
  shifts: { name: 'Wind shifts', what: 'Time on the headed tack when the other one pointed closer to the mark.' },
  laylines: { name: 'Laylines', what: 'Sailing on past the layline, then reaching back down to the mark.' },
  roundings: { name: 'Mark roundings', what: 'What your roundings cost beyond clean ones, from the zone to away on the next leg.' },
  air: { name: 'Dirty air', what: "Sailing in other boats' wind shadow." },
  penalties: { name: 'Penalty turns', what: 'The time your turns took.' },
};
