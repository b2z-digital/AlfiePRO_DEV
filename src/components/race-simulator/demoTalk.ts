// "Watch Alfie's way": what the sticks are doing and why, in words, as a drill is sailed for you.
// Everything said is read off the boat as she's being sailed (her rudder, her sheet, how she's
// turning and heeling), so the words always match the sticks on screen. Pure: no drawing, no sound.
import { bestSheet, vmgAngles } from '@/sim/classes';
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import type { Cue } from './coach';

export type Stick = 'rudder' | 'sail' | 'both';

/** A line of the demonstration: what to look at, and what it's for. */
export interface DemoCue extends Cue {
  key: string;
  /** The stick the line is about: it lights up on screen. */
  stick: Stick | null;
}

interface Cand { key: string; topic: string; text: string; say: string; stick: Stick | null; pri: number; hold: number }

/** How a stick position reads: "right in", "62% in"; "centred", "40% right". */
export const sailWords = (sheet: number): string => (sheet >= 0.97 ? 'Right in' : `${Math.round(Math.max(0, Math.min(1, sheet)) * 100)}% in`);
export const rudderWords = (rudder: number): string => (Math.abs(rudder) < 0.06 ? 'Centred' : `${Math.round(Math.min(1, Math.abs(rudder)) * 100)}% ${rudder > 0 ? 'right' : 'left'}`);

const over = (p: number): string => (p >= 0.9 ? 'right over' : p >= 0.6 ? 'well over' : `about ${Math.max(10, Math.round(p * 10) * 10)}% over`);
const firstSentence = (s: string): string => { const m = /^(.*?[.!?])(\s|$)/.exec(s); return (m ? m[1] : s).slice(0, 160); };

export class DemoTalk {
  private cur: (DemoCue & { pri: number; hold: number }) | null = null;
  private curAt = -99;
  private t0: number | null = null;
  private turn = 0;
  private hist: { t: number; rudder: number; sheet: number; atwa: number }[] = [];

  /** `tip` is the drill's own "how to do it well": the plan. It's the first thing said, unless it
   *  has just been shown (`open` false), and it comes round again between the other lines. */
  constructor(private tip: string, private open = true) {}

  /**
   * Call a few times a second with the boat being sailed for you. `intent` is what her skipper says
   * she's doing (if anything), and `mark` the next mark and whether it's the windward one. Returns
   * the same object until the line changes.
   */
  update(race: Race, b: Boat, intent: string | null | undefined, mark: { x: number; y: number; upwind: boolean; isMark: boolean } | null): DemoCue {
    const t = race.t;
    if (this.t0 === null) this.t0 = t;
    const atwa = Math.abs(b.twa);
    const last = this.hist[this.hist.length - 1];
    if (!last || t > last.t) this.hist.push({ t, rudder: b.rudder, sheet: b.sheet, atwa });
    while (this.hist.length > 1 && this.hist[0].t < t - 2.6) this.hist.shift();
    const c = this.pick(race, b, intent ?? '', mark);
    const cur = this.cur;
    const since = t - this.curAt;
    // Something she's doing now cuts in on a steady line at once, and on another call once it has
    // had a second to be read; otherwise each line stays up for its time.
    if (!cur || (c.key !== cur.key && ((c.pri > cur.pri && (cur.pri <= 2 || since >= 1)) || since >= cur.hold))) {
      if (cur && cur.pri <= 1) this.turn++;
      this.cur = { key: c.key, topic: c.topic, text: c.text, say: c.say, stick: c.stick, watch: null, tone: 'plain', pri: c.pri, hold: c.hold };
      this.curAt = t;
    } else if (c.key === cur.key && cur.pri <= 1 && since >= cur.hold) {
      // The same steady stretch has been read: on to the next thing worth saying about it.
      this.turn++;
      const n = this.pick(race, b, intent ?? '', mark);
      this.cur = { key: n.key, topic: n.topic, text: n.text, say: n.say, stick: n.stick, watch: null, tone: 'plain', pri: n.pri, hold: n.hold };
      this.curAt = t;
    }
    return this.cur!;
  }

  private pick(race: Race, b: Boat, intent: string, mark: { x: number; y: number; upwind: boolean; isMark: boolean } | null): Cand {
    const t = race.t, L = b.cls.loa, atwa = Math.abs(b.twa);
    const H = this.hist;
    const then = H.find(h => h.t >= t - 1) ?? H[0];
    const dt = Math.max(0.2, t - then.t);
    const dTwa = H.length > 1 ? (atwa - then.atwa) / dt : 0;       // °/s: + is bearing away
    const dSheet = b.sheet - then.sheet;
    // How far over the rudder has been this last second, the way it's over now (not the way it was
    // for the manoeuvre before).
    const way = Math.sign(b.rudder || b.rot) || 1;
    let peak = Math.abs(b.rudder), flips = 0, prevSign = 0;
    for (const h of H) {
      if (h.t >= t - 1.2 && h.rudder * way > 0) peak = Math.max(peak, Math.abs(h.rudder));
      const s = Math.abs(h.rudder) > 0.18 ? Math.sign(h.rudder) : 0;
      if (s && prevSign && s !== prevSign) flips++;
      if (s) prevSign = s;
    }
    // Small, quick corrections either way (holding a course in waves): how many, and how big.
    let wig = 0, amp = 0, ws = 0;
    for (const h of H) {
      amp = Math.max(amp, Math.abs(h.rudder));
      const g = Math.abs(h.rudder) > 0.03 ? Math.sign(h.rudder) : 0;
      if (g && ws && g !== ws) wig++;
      if (g) ws = g;
    }
    const side = way > 0 ? 'right' : 'left';
    const pct = `${Math.round(b.sheet * 100)}% in`;
    const sail = sailWords(b.sheet).toLowerCase();
    const full = b.targetSpd > 0.05 * b.cls.hullSpeed ? Math.round(100 * Math.min(1.2, b.spd / b.targetSpd)) : null;
    const speed = full === null ? '' : `She's at ${full}% of full speed${full < 80 ? ' and building' : ''}.`;
    const vm = vmgAngles(b.cls, b.tws);
    const pre = !b.started && t < race.gunT;
    const near = !!mark && mark.isMark && b.started && Math.hypot(mark.x - b.x, mark.y - b.y) < 4.5 * L;
    const sinceTack = t - b.lastHtwT, sinceGybe = t - b.lastGybeT;

    // The plan, first: the drill's own advice, in full.
    if (this.tip && this.open && t - this.t0! < 0.3) return { key: 'plan', topic: 'The plan', text: this.tip, say: firstSentence(this.tip), stick: null, pri: 3, hold: 7 };
    // (It's held for a few seconds, unless she starts a manoeuvre worth calling straight away.)

    if (b.penalty.owed > 0 && Math.abs(b.rot) > 20) {
      return { key: 'penalty', topic: 'Penalty turn', text: 'Penalty turn: rudder stick hard over and held there. One tack and one gybe, then straight back to racing.', say: 'Penalty turn. Rudder hard over.', stick: 'rudder', pri: 9, hold: 3.5 };
    }
    // Before the start, holding station: luffed up with the sail out (not a tack, though she may go
    // through the wind doing it).
    if (pre && b.sheet < 0.6 && atwa < 40) {
      return {
        key: 'pre-luff', topic: 'Before the start', stick: 'both', pri: 5, hold: 4,
        text: `Holding station: rudder stick over to luff her up into the wind, with the sail stick ${b.sheet < 0.25 ? 'right out' : 'eased'} (${pct}). She slows almost to a stop without drifting far. To go again: bear away and sheet in.`,
        say: 'Luff up and let the sail out to hold her.',
      };
    }
    // Tacking: into it (rudder over, turning up through the wind), then out of it.
    // (A boat that tacks round a mark and bears straight away is rounding, not coming out of a tack.)
    const tackingIn = (atwa < 36 && dTwa < -9 && peak > 0.4) || (b.tackingSince !== null && Math.abs(b.rudder) > 0.3 && atwa < 50);
    if (tackingIn) {
      const eased = b.sheet < 0.95;
      return {
        key: 'tack-in', topic: 'Tacking', stick: eased ? 'both' : 'rudder', pri: 8, hold: 2.2,
        text: `Tacking: rudder stick ${over(peak)} to the ${side}, so she turns quickly and spends as little time as she can head to wind. ${!eased ? 'The sail stick stays right in.' : b.sheet >= 0.8 ? `The sail stick is eased a touch (${pct}) as she goes round.` : `The sail stick is at ${pct} as she goes round.`}`,
        say: 'Tacking. Rudder over.',
      };
    }
    if ((b.tackingSince !== null || sinceTack < 3.4) && sinceTack >= 0 && atwa < 55 && (!pre || b.sheet > 0.9)) {
      return {
        key: 'tack-out', topic: 'Out of the tack', stick: 'rudder', pri: 7, hold: 3,
        text: `Out of the tack: rudder stick back to the middle, then held still while she gets going again. ${speed} Don't point up until she's moving.`,
        say: 'Rudder back to the middle. Let her build speed.',
      };
    }
    // Gybing.
    if ((sinceGybe >= 0 && sinceGybe < 0.9) || (atwa > 154 && peak > 0.3 && dTwa > 5)) {
      return {
        key: 'gybe-in', topic: 'Gybing', stick: 'rudder', pri: 8, hold: 2.2,
        text: `Gybing: rudder stick ${over(peak)} to the ${side}, smoothly. She only has to turn through about ${Math.round((2 * (180 - vm.down)) / 5) * 5}°, from her best angle on one side to her best on the other. The sail stick stays out (${pct}).`,
        say: 'Gybing. Small, smooth rudder.',
      };
    }
    if (sinceGybe >= 0 && sinceGybe < 3.2 && atwa > 110) {
      return {
        key: 'gybe-out', topic: 'Out of the gybe', stick: 'rudder', pri: 7, hold: 3,
        text: `Out of the gybe: rudder stick centred as the boom comes over, so she doesn't swing on past her angle. ${speed}`,
        say: 'Rudder centred.',
      };
    }
    // Downwind in a breeze: the bow going down.
    if (atwa > 110 && b.dive > 0.5) {
      return flips >= 1
        ? { key: 'dive-weave', topic: 'Bow down', stick: 'rudder', pri: 7, hold: 3.5, text: 'The bow is digging in. The rudder stick is being worked gently left and right: the weave shakes the bow free before it trips her.', say: "Bow's digging in. Weave the rudder." }
        : { key: 'dive', topic: 'Bow down', stick: 'rudder', pri: 6, hold: 3.5, text: 'The bow is pressing down in this breeze. If it starts to bury, work the rudder stick gently left and right to shake it free.', say: 'Watch the bow.' };
    }
    // A gust upwind: eased to keep her on her feet.
    if (b.started && atwa < 65 && Math.abs(b.heel) > 36 && b.sheet < bestSheet(atwa, b.tws) - 0.015) {
      return {
        key: 'gust', topic: 'Gust', stick: 'sail', pri: 6, hold: 3.5,
        text: `Gust: she's laid over to ${Math.round(Math.abs(b.heel))}°. Sail stick eased a touch (${pct}) to stand her up, then squeezed back in as the gust passes. Laid flat she's slow and the rudder loses its grip.`,
        say: 'Gust. Ease the sail a touch.',
      };
    }
    // Turning down or up (a mark, a duck, the start): the sail goes with the bow.
    const why = /^(ducking|keeping clear|avoiding|letting her past|luffing)/i.test(intent) ? `${intent}: ` : '';
    const lead = (what: string): string => (why ? `${why}${what}` : near ? `Round the mark: ${what}` : `${what[0].toUpperCase()}${what.slice(1)}`);
    const big = atwa > 115 ? 13 : 9; // (on a run she wanders a few degrees all the time: only a real change of course is called)
    const settled = t - this.t0! > 2.5; // (as a scene opens she's still settling onto her course)
    if (settled && dTwa > big && atwa > 35 && atwa < 165 && sinceGybe > 1 && (!pre || why)) {
      const easing = dSheet < -0.015;
      return {
        key: 'bear-away', topic: near ? 'Round the mark' : 'Bearing away', stick: easing ? 'both' : 'rudder', pri: 6, hold: 3,
        text: `${lead('bearing away')}. Rudder stick ${over(peak)} to the ${side}${easing ? `, and the sail stick let out at the same time: watch it go. With the sail pinned in she won't turn down.` : `, with the sail ${sail}.`}`,
        say: easing ? 'Bearing away. Ease the sail as she turns.' : 'Bearing away.',
      };
    }
    if (settled && dTwa < -big && atwa > 42 && b.tackingSince === null && (!pre || why)) {
      const sheeting = dSheet > 0.015;
      // Coming up onto the wind (a leeward mark, the start), or just a few degrees higher on a reach or a run.
      const onto = atwa < 80 || (near && !mark!.upwind);
      return {
        key: 'head-up', topic: near ? 'Round the mark' : 'Heading up', stick: sheeting ? 'both' : 'rudder', pri: 6, hold: 3,
        text: `${lead('heading up')}. Rudder stick ${over(peak)} to the ${side}${sheeting ? `, and the sail stick coming in as she turns${onto ? ", so she's sheeted right in as she reaches close-hauled." : ': the sail follows the bow.'}` : `, with the sail ${sail}.`}`,
        say: sheeting ? 'Heading up. Sheet in as she turns.' : 'Heading up.',
      };
    }
    // What her skipper says she's up to, when it says more than the point of sail does.
    const plain = /^(beating|beat to|running|reaching|holding|building speed|finished|slow|gybing|tacking|rounding|on the headed tack)\b/i.test(intent);
    const thinking = intent && !plain ? ` The thinking: ${intent[0].toLowerCase()}${intent.slice(1)}.` : '';
    // Before the start.
    if (pre) {
      const T = Math.max(0, Math.ceil(race.gunT - t));
      const held = b.sheet < bestSheet(atwa, b.tws) - 0.1;
      return held
        ? { key: 'pre-hold', topic: 'Before the start', stick: 'sail', pri: 2, hold: 4.5, text: `Before the start: sail stick eased (${pct}) to hold her back below the line. The sail is the throttle: out to wait, in to go.${thinking}`, say: 'Sail eased to hold her back.' }
        : { key: 'pre-go', topic: 'Before the start', stick: 'sail', pri: 2, hold: 4.5, text: `${T <= 12 ? 'Going for the line' : 'Before the start'}: sail stick ${sail}, and she's building speed. ${speed} She needs to be at full speed as she crosses, not just on the line.${thinking}`, say: T <= 12 ? 'Sheet in and go.' : '' };
    }
    // Steady sailing: a few things worth knowing, one after the other.
    const lines: Cand[] = [];
    const steady = (key: string, topic: string, text: string, say = '', stick: Stick | null = null): void => { lines.push({ key, topic, text, say, stick, pri: 1, hold: 6 }); };
    if (atwa < 62) {
      if (race.sea) {
        // (Measured in this sea: steering to every wave costs speed; steady hands are fastest.)
        const busy = wig >= 2 && amp < 0.4;
        steady('up-waves', 'In the waves', busy
          ? `The waves knock her bow from side to side. Those small, quick rudder movements (${Math.max(5, Math.round(amp * 20) * 5)}% at most) are only holding her on course. She isn't steering to each wave: they come faster than she can turn, and chasing them costs speed.`
          : 'In waves, keep her moving and keep your hands quiet. Pinching up into a wave face stops her dead; a steady course, a touch low and fast, gets to the mark sooner.', '', busy ? 'rudder' : null);
      }
      const light = b.sheet < 0.97;
      steady('up-sticks', 'Upwind', `Upwind: sail stick ${light ? `almost right in (${pct}), eased a hair to keep the sail working` : 'right in'}. The rudder stick barely moves: small, slow corrections only. Every big rudder movement is a brake.`, light ? 'Sail almost right in. Rudder still.' : 'Sail right in. Rudder still.', 'both');
      const off = Math.round(atwa), d = atwa - vm.up;
      steady('up-angle', 'Upwind', `She's sailing ${off}° off the wind${full === null ? '' : ` at ${full}% of full speed`}. ${d > 2.5 ? 'That is a touch lower than her closest angle: speed first, then height.' : d < -2.5 ? 'That is a little high: any higher and she slows.' : 'That is her best angle for making ground upwind.'}`);
      if (thinking) steady('up-why', 'Upwind', `Sticks steady, sail ${sail}.${thinking}`);
    } else if (atwa > 120) {
      steady('down-sticks', 'Downwind', `Downwind: sail stick well out (${pct}). The rudder stick moves as little as possible: steer gently and let her run.`, 'Sail out. Steer gently.', 'both');
      const off = Math.round(180 - atwa);
      steady('down-angle', 'Downwind', off >= 6
        ? `She's sailing ${off}° above dead downwind${full === null ? '' : ` at ${full}% of full speed`}: an angle is faster than pointing straight at the mark, and steadier.`
        : `She's running nearly square to the wind${full === null ? '' : ` at ${full}% of full speed`}.`);
      if (b.tws / 0.514444 > 12) steady('down-blow', 'Downwind', 'In this much wind, watch the bow. If it starts to go down, a gentle weave on the rudder stick sheds it.');
      if (thinking) steady('down-why', 'Downwind', `Sticks steady, sail ${pct}.${thinking}`);
    } else {
      steady('reach-sticks', 'Reaching', `Reaching: sail stick part way out (${pct}) and a steady rudder. The trim to copy: ease until the sail just stops driving, then bring it back in a touch.`, '', 'sail');
      if (thinking) steady('reach-why', 'Reaching', `Sticks steady, sail ${pct}.${thinking}`);
    }
    // …and the plan again, once round.
    if (this.tip) lines.push({ key: 'plan-again', topic: 'The plan', text: this.tip, say: '', stick: null, pri: 1, hold: 8 });
    return lines[this.turn % lines.length];
  }
}
