// First sail: five short steps for someone who has never sailed a radio yacht, here or on the
// water. Steer her, trim the sail, tack, round a mark, cross a start line. Each is a real scene on
// the engine like the Scenario Lab's, with easy pass marks: the point is to get round, not to be
// quick. Finished, you know enough to enjoy a race against a small Club fleet.
import type { Race } from '../engine';
import type { Boat } from '../types';
import type { PlanFn, SceneOverlay } from '../scene';
import { closeHauled, hold } from '../scene';
import { bearing } from '../math';
import type { GoalCtx, Outcome, SceneSpec } from './common';
import { linePoint, lost, overEarly, startFacts, starsFor, timedStart, won } from './common';
import { alone, roundingGoal, turnsGoal, zigzag, type LabMoment } from './lab';

const CH_S = 317.5;
type At = [number, number];

/** A scene position (hull lengths from the middle of the start line: right, and upwind) on the water. */
function spot(race: Race, p: At): { x: number; y: number } {
  const c = race.course, L = c.L;
  const o = { x: (c.start.pin.x + c.start.stbd.x) / 2, y: (c.start.pin.y + c.start.stbd.y) / 2 };
  return { x: o.x + c.right.x * p[0] * L + c.up.x * p[1] * L, y: o.y + c.right.y * p[0] * L + c.up.y * p[1] * L };
}
const rings = (at: At[], r: number): SceneOverlay[] => at.map((p, k) => ({ kind: 'ring', at: p, r, label: String(k + 1), tone: k === at.length - 1 ? 'green' : 'blue' }));
const inRing = (race: Race, b: Boat, p: At, r: number) => { const s = spot(race, p); return Math.hypot(b.x - s.x, b.y - s.y) <= r * race.course.L; };

/**
 * Sail through the rings in order. With `pace`, you're also judged on how fast she went between
 * the first moment and the last ring, as a share of the best she could do on each heading: that's
 * the sail trim. `steps`: the share for a pass, two stars and three.
 */
function ringsGoal(text: string, at: At[], r: number, seconds: number, pace: [number, number, number] | null, advice: string): SceneSpec['goal'] {
  const share = (g: GoalCtx) => ((g.memo.n as number) > 0 ? (g.memo.sum as number) / (g.memo.n as number) : 0);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const m = g.memo, p = g.player;
      if (m.k === undefined) { m.k = 0; m.sum = 0; m.n = 0; }
      if (p.targetSpd > 0) { m.sum = (m.sum as number) + Math.min(1.1, p.spd / p.targetSpd); m.n = (m.n as number) + 1; }
      if (inRing(g.race, p, at[m.k as number], r)) m.k = (m.k as number) + 1;
      if ((m.k as number) < at.length) return null;
      if (!pace) return won('Through all of them', 'You can steer her where you want her to go. That is most of it.', { stars: 3 });
      const v = Math.round(share(g) * 100) / 100;
      const stars = v >= pace[2] ? 3 : v >= pace[1] ? 2 : v >= pace[0] ? 1 : 0;
      return stars
        ? won(`${pct(v)} of her best speed`, stars === 3 ? 'The sail was where it should be the whole way.' : `Through them all, and moving well. ${advice}`, { stars, score: Math.round(v * 100) })
        : lost(`${pct(v)} of her best speed`, `You got through the rings, but she was slow: ${pct(pace[0])} or more passes. ${advice}`, { score: Math.round(v * 100) });
    },
    final: g => lost('Out of time', `You reached ${g.memo.k ?? 0} of the ${at.length} rings. ${advice}`),
    progress: g => `Ring ${Math.min(at.length, ((g.memo.k as number) ?? 0) + 1)} of ${at.length}${pace && (g.memo.n as number) > 40 ? ` · ${pct(share(g))} of her best speed` : ''}`,
  };
}

/** Steers for each ring in turn. With `sheet`, the sail is held there (the mistake); without, it's trimmed right. */
const throughRings = (at: At[], r: number, sheet?: number): PlanFn => (_t, b, race, me) => {
  if (me.memo.k === undefined) me.memo.k = 0;
  if (me.memo.k < at.length && inRing(race, b, at[me.memo.k], r * 0.6)) me.memo.k++;
  const k = Math.min(at.length - 1, me.memo.k);
  return { hdg: bearing(b, spot(race, at[k])), sheet };
};

const STEER: At[] = [[-3, 6], [5, 2.5], [13, 6.5]];
const TRIM: At[] = [[0, 15], [5, 4]];
const easy = { windStrength: 'medium' as const, seaState: 'flat' as const };

export const FIRST: LabMoment[] = [
  {
    kind: 'lab', group: 'first', id: 'first-steer', title: 'Steer her', skill: 'Steering', trim: 'auto',
    blurb: 'Three rings across the wind. Sail through each in turn.',
    brief: "She's sailing across the wind and the sail is looking after itself. All you do is steer.",
    tip: "The right stick (or the left and right arrow keys) is the rudder. Push it the way you want her bow to go, as if you were on board looking forward. When she's sailing towards you that feels backwards: think of yourself standing on her deck, not on the bank. Small movements: a little rudder, wait, a little more.",
    sticks: { sail: 'Leave it. The sail trims itself in this one.', rudder: "Small pushes left and right to point her at each ring. Back to the middle once she's pointing where you want." },
    scene: () => ({ origin: 'line', settings: easy, boats: alone([-11, 4], 90), overlays: rings(STEER, 2) }),
    goal: ringsGoal('Sail through rings 1, 2 and 3 in order', STEER, 2, 90, null, 'Point her bow at the next ring with small pushes of the rudder, then let it go back to the middle.'),
    solution: throughRings(STEER, 2), mistake: hold(90), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'first', id: 'first-trim', title: 'Trim the sail', skill: 'Sail trim', trim: 'yours',
    blurb: 'Across the wind, then down it. The sail goes out as she turns away from the wind.',
    brief: "Now the sail is yours. Sail across the wind to ring 1, then turn away from the wind and run down to ring 2, keeping her moving.",
    tip: "The left stick (or the up and down arrow keys) is the sail. One rule covers it: the further she points away from the wind, the further out the sail goes. Sailing close to the wind it's right in. Across the wind, about half way out. Running with the wind behind, right out. Too far in and she heels and stalls; too far out and the sail flaps. Watch her speed on the strip at the bottom as you move it.",
    sticks: { sail: 'About half way out to ring 1. Let it right out as you turn downwind for ring 2.', rudder: 'A gentle turn away from the wind after ring 1.' },
    scene: () => ({ origin: 'line', settings: easy, boats: alone([-9, 15], 90), overlays: rings(TRIM, 2.2) }),
    goal: ringsGoal('Through ring 1, then ring 2, at 75% of her best speed or better', TRIM, 2.2, 100, [0.75, 0.85, 0.92], 'Half way out across the wind, right out with the wind behind.'),
    solution: throughRings(TRIM, 2.2), mistake: throughRings(TRIM, 2.2, 1), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'first', id: 'first-tack', title: 'Tack through the wind', skill: 'Tacking', trim: 'auto',
    blurb: "A boat can't sail straight into the wind. Zigzag up it: two tacks.",
    brief: "The mark is straight upwind and no boat can sail straight at the wind. She sails about 45° either side of it, so you zigzag: sail one way, turn her bow through the wind, sail the other way. That turn is a tack.",
    tip: "Get her going fast first. Then push the rudder firmly so her bow swings through the wind and keeps turning until the sail fills on the other side. Take the rudder off as it fills. If you turn too slowly she stops head to wind with the sail flapping: bear away to get moving, and try again with more speed and a firmer push.",
    sticks: { sail: 'Leave it. The sail trims itself in this one.', rudder: 'Firmly over to swing her bow through the wind, back to the middle as the sail fills on the new side.' },
    scene: () => ({ origin: 'line', settings: { ...easy, length: 'long' }, boats: alone([0, 1.5], CH_S) }),
    goal: turnsGoal('Make two tacks, losing no more than 4 lengths on each', 'tack', 2, 0, 90, [1.3, 2.2, 4.0], 'Go in fast, turn firmly, and straighten up as the sail fills.'),
    solution: zigzag('tack', 9), mistake: closeHauled('stbd'), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'first', id: 'first-mark', title: 'Round a mark', skill: 'Rounding marks', trim: 'auto',
    blurb: 'Round mark 1 and the small mark beside it, then head off downwind.',
    brief: "You're sailing up to mark 1. Leave it on your left (to port), pass the small offset mark beside it the same way, then turn downwind towards the gate. Every race here goes round them like that.",
    tip: "Sail past the mark before you turn: turn too early and you hit it. Give it half a boat length of room. As you go round, she turns away from the wind, so the sail goes out. Hitting a mark in a race costs a penalty turn, so a little wide is better than a little close.",
    sticks: { sail: 'Leave it. The sail trims itself in this one.', rudder: "Hold your course until the mark is beside you, then turn left round it, across to the offset mark and left again down the run." },
    scene: () => ({ origin: 'W', settings: easy, boats: alone([5.6, -5.8], CH_S) }),
    goal: roundingGoal('Round mark 1 and the offset, then sail three lengths down the run, within a minute', ['W'], 1, -3, 90, [26, 34, 60], 'Sail past each mark before you turn round it, and let her head downwind afterwards.'),
    solution: 'ai', demoSeeds: [1], mistake: hold(CH_S), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'first', id: 'first-start', title: 'Cross the start line', skill: 'Starting', trim: 'auto',
    blurb: 'A 30-second countdown. Be behind the line at the gun, and across it soon after.',
    brief: "Races start with a countdown. You may be anywhere behind the line (the dashed line between the two marks) until the gun; cross it going upwind as soon after the gun as you can. Over it early and you must come back and start again.",
    tip: "You're a few lengths below the line with 30 seconds to go. Wait there, barely moving, with the sail let out. With about ten seconds left, point her up towards the line and let her go. Early is worse than late: if you're going to arrive too soon, turn away from the line and come back at it.",
    sticks: { sail: 'Leave it. The sail trims itself in this one.', rudder: 'Hold her steady while you wait, then point her at the line for the last ten seconds.' },
    scene: () => ({ origin: 'line', preStart: 30, settings: easy, boats: [{ role: 'You', at: [2, -4.5], hdg: 300, spd: 0.1, helm: 'player' }] }),
    goal: {
      text: 'Cross the line within 10 seconds after the gun, and not before it', seconds: 30 + 25,
      check: (g: GoalCtx): Outcome | null => {
        const early = overEarly(g); if (early) return early;
        const s = startFacts(g);
        if (!s) return null;
        const stars = starsFor(s.late, [3, 6, 10]);
        return stars
          ? won(s.late < 0.05 ? 'Started right on the gun' : `Started ${s.late.toFixed(1)} s after the gun`, "That's a start. In a race the whole fleet is trying to do the same thing in the same place: the Start Trainer is where to go next.", { stars, score: s.late })
          : lost(`Started ${s.late.toFixed(1)} s after the gun`, 'A clean start, but late: within 10 seconds passes. Head for the line a little sooner.', { score: s.late });
      },
      final: () => lost('No start', 'You never crossed the line. Sail up across it, between the two marks, after the gun.'),
      progress: (g: GoalCtx) => { const s = startFacts(g); return s ? `Started ${s.late.toFixed(1)} s after the gun` : null; },
    },
    solution: timedStart({ hover: race => linePoint(race, 0.6, 3.5), margin: 0.5 }), mistake: hold(CH_S), mistakeRule: '',
  },
];

/** The first step not yet done (null when they all are), given which scenes have been won. */
export function nextFirst(won: (id: string) => boolean): LabMoment | null { return FIRST.find(m => !won(m.id)) ?? null; }
