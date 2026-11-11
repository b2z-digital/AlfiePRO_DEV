// The Scenario Lab: practice set up mid-race, in real wind, to replay until you win it. Four kinds:
// boat speed (how much of her best speed made good you hold, upwind and down, in chop and in a
// blow), boat handling (what each tack, gybe and rounding costs you), the marks, and tactics against
// AI skippers. Every one is a real scene on the engine, judged from what the boat actually did.
import type { PlanFn, SceneBoat } from '../scene';
import type { GoalCtx, Outcome } from './common';
import { SceneSpec, fouled, lost, rule14, won } from './common';
import { atAngle, closeHauled, hold, running } from '../scene';
import { vmgAngles } from '../classes';
import { dist } from '../math';
import { dcos } from '../dmath';

export type LabGroup = 'speed' | 'handling' | 'marks' | 'tactics' | 'first';

/** The lab's sections, in order, with what each is for. (The 'first' group is First sail, in first.ts, with a place of its own.) */
export const LAB_GROUPS: { id: LabGroup; title: string; text: string }[] = [
  { id: 'speed', title: 'Boat speed', text: 'On your own against the clock: how much of the best she can do are you getting, upwind and down?' },
  { id: 'handling', title: 'Boat handling', text: 'What each tack, gybe and rounding costs you, in hull lengths and seconds.' },
  { id: 'marks', title: 'Around the marks', text: 'Traffic at mark 1 and the gate.' },
  { id: 'tactics', title: 'Tactics', text: 'One moment against a rival or a pack. Did you come out ahead?' },
];

export interface LabMoment extends SceneSpec {
  group: LabGroup;
  /** One line for the card. */
  blurb: string;
  /** What it trains. */
  skill: string;
}

const CH_S = 317.5, CH_P = 42.5, RUN_S = 195, RUN_P = 165;


const rival = (role: string, at: [number, number], hdg: number, persona: string, level: SceneBoat['level'] = 'state', extra: Partial<SceneBoat> = {}): SceneBoat =>
  ({ role, at, hdg, helm: 'ai', persona, level, ...extra });

/** Ends when you round mark `leg` (the leg index you're on now): win if you're in the top `top`. */
function topAtMark(text: string, leg: number, top: number, seconds: number, mark: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g) ?? rule14(g); if (f) return f;
      const p = g.player;
      if (p.legIndex > leg) {
        const place = p.placeAtLeg[p.placeAtLeg.length - 1] ?? 99;
        const of = g.race.boats.length;
        return place <= top
          ? won(`Round ${mark} ${ordinal(place)} of ${of}`, place === 1 ? 'Led them round.' : `In the top ${top}: that's the win.`, { score: place, stars: place === 1 ? 3 : place <= Math.ceil(top / 2) ? 2 : 1 })
          : lost(`Round ${mark} ${ordinal(place)} of ${of}`, `You needed the top ${top}. Try another way in.`, { score: place });
      }
      return null;
    },
    final: () => lost('Out of time', `Get round ${mark} before the time runs out.`),
    progress: g => `Place now: ${ordinal(g.race.livePlace(g.player))} of ${g.race.boats.length}`,
  };
}

/** Ends when either you or the rival rounds mark `leg`: win if it's you. */
function beatRival(text: string, leg: number, seconds: number, mark: string, rivalRole: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g) ?? rule14(g); if (f) return f;
      const r = g.race.boats.find(b => b.name === rivalRole)!;
      if (g.player.legIndex > leg) return won(`Round ${mark} ahead of ${rivalRole}`, 'You won the moment.', { stars: 3 });
      if (r.legIndex > leg) return lost(`${rivalRole} rounded first`, 'She got there ahead. Watch the replay and try another plan.');
      return null;
    },
    final: () => lost('Out of time', `Get round ${mark} before ${rivalRole} does.`),
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Ends when one of you finishes: win if it's you. */
function beatToFinish(text: string, seconds: number, rivalRole: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g) ?? rule14(g); if (f) return f;
      const r = g.race.boats.find(b => b.name === rivalRole)!;
      if (g.player.finished) return won(`You finished ahead of ${rivalRole}`, 'You took her on the last beat.', { stars: 3 });
      if (r.finished) return lost(`${rivalRole} finished first`, "She held you off. Split from her when she covers loosely, and don't follow her into a header.");
      return null;
    },
    final: () => lost('Out of time', `Get to the finish before ${rivalRole} does.`),
  };
}

// ───────────────────────── boat speed and handling ─────────────────────────

const RAD = Math.PI / 180;

/**
 * Add this step to the running totals: the speed she made good against the wind (up it, or down
 * it), the best she could have made in the wind she had (her target speed at her best angle), and
 * so the distance she has lost to a boat sailed perfectly. Returns the step's length in seconds.
 */
function tally(g: GoalCtx, way: 'up' | 'down'): number {
  const m = g.memo, p = g.player;
  const dt = m.t === undefined ? 0 : Math.max(0, Math.min(0.2, g.t - (m.t as number)));
  m.t = g.t;
  const v = vmgAngles(p.cls, p.tws);
  const c = dcos(p.twa * RAD);
  const made = (way === 'up' ? c : -c) * p.spd, best = way === 'up' ? v.upVmg : v.downVmg;
  m.made = ((m.made as number) ?? 0) + made * dt;
  m.best = ((m.best as number) ?? 0) + best * dt;
  return dt;
}
const share = (g: GoalCtx) => ((g.memo.best as number) > 0 ? (g.memo.made as number) / (g.memo.best as number) : 0);

/**
 * A boat-speed run: sail the leg alone, and it's judged on the speed you made good as a share of
 * the best she could do in the wind you had. `steps`: the share for a pass, two stars and three.
 */
function paceGoal(text: string, way: 'up' | 'down', leg: number, seconds: number, steps: [number, number, number], mark: string, advice: string): SceneSpec['goal'] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      tally(g, way);
      if (g.player.legIndex <= leg) return null;
      // (Judged on the figure you're shown, to the whole per cent: 80% never fails a pass mark of 80%.)
      const r = Math.round(share(g) * 100) / 100;
      const stars = r >= steps[2] ? 3 : r >= steps[1] ? 2 : r >= steps[0] ? 1 : 0;
      return stars
        ? won(`${pct(r)} of her best`, stars === 3 ? `That's top-of-the-fleet pace ${way === 'up' ? 'upwind' : 'downwind'}.` : `Good pace. ${pct(steps[stars])} or more earns the next star. ${advice}`, { stars, score: Math.round(r * 100) })
        : lost(`${pct(r)} of her best`, `That's ${Math.round((steps[0] - r) * 100)} points short of the pass mark, ${pct(steps[0])}. The higher the better. ${advice}`, { score: Math.round(r * 100) });
    },
    final: g => lost('Out of time', `Get to ${mark} before the time runs out. You were making ${pct(share(g))} of her best. ${advice}`),
    progress: g => ((g.memo.best as number) > 0.5 ? `Speed made good: ${pct(share(g))} of her best` : null),
  };
}

/**
 * A handling drill: make `need` tacks (or gybes), each judged on the hull lengths it cost you, from
 * the moment she passes through the wind until five seconds later, against a boat that sailed
 * straight on at her best. `steps`: the average lengths lost for three stars, two and a pass.
 */
export function turnsGoal(text: string, kind: 'tack' | 'gybe', need: number, leg: number, seconds: number, steps: [number, number, number], advice: string): SceneSpec['goal'] {
  const way = kind === 'tack' ? 'up' : 'down';
  const word = kind === 'tack' ? 'tack' : 'gybe';
  const lostNow = (g: GoalCtx) => ((g.memo.best as number) ?? 0) - ((g.memo.made as number) ?? 0);
  const avg = (g: GoalCtx) => ((g.memo.done as number) > 0 ? (g.memo.sum as number) / (g.memo.done as number) / g.player.cls.loa : 0);
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      tally(g, way);
      const m = g.memo, p = g.player;
      const stamp = kind === 'tack' ? p.lastHtwT : p.lastGybeT;
      if (m.stamp === undefined) { m.stamp = stamp; m.done = 0; m.sum = 0; m.open = false; }
      const close = () => { m.sum = (m.sum as number) + lostNow(g) - (m.w0 as number); m.done = (m.done as number) + 1; m.open = false; };
      if (stamp !== m.stamp) { if (m.open) close(); m.stamp = stamp; m.open = true; m.w0 = lostNow(g); m.wt = g.t; }
      if (m.open && g.t - (m.wt as number) >= 5) close();
      const done = m.done as number;
      if (done >= need) {
        // Lengths lost: the fewer the better. (Judged on the figure you're shown, to a tenth.)
        const a = Math.round(avg(g) * 10) / 10;
        const stars = a <= steps[0] ? 3 : a <= steps[1] ? 2 : a <= steps[2] ? 1 : 0;
        const each = `You lost ${a.toFixed(1)} lengths a ${word}`;
        return stars
          ? won(each, stars === 3 ? `As little as a ${word} costs.` : `Tidy. Lose ${steps[stars === 2 ? 0 : 1].toFixed(1)} or fewer for the next star. ${advice}`, { stars, score: a })
          : lost(each, `That's ${(a - steps[2]).toFixed(1)} too many: to pass, lose ${steps[2].toFixed(1)} lengths or fewer on each ${word}. The fewer the better. ${advice}`, { score: a });
      }
      if (p.legIndex > leg) return lost(`Only ${done} ${word}${done === 1 ? '' : 's'}`, `This drill wants ${need} before the mark. Put them in early, one after another.`);
      return null;
    },
    final: g => lost('Out of time', `Make all ${need} ${word}s before the time runs out (you made ${g.memo.done ?? 0}).`),
    progress: g => {
      const done = (g.memo.done as number) ?? 0;
      return done ? `${word[0].toUpperCase()}${word.slice(1)} ${done} of ${need} · ${avg(g).toFixed(1)} lengths lost each` : `${need} ${word}s to make`;
    },
  };
}

/**
 * A rounding against the clock: from the moment she enters the zone (four lengths from the mark)
 * until she's `clear` lengths up (or down) the next leg. `steps`: seconds for three stars, two and a pass.
 */
export function roundingGoal(text: string, marks: string[], leg: number, clear: number, seconds: number, steps: [number, number, number], advice: string): SceneSpec['goal'] {
  return {
    text, seconds,
    check: (g: GoalCtx): Outcome | null => {
      const f = fouled(g); if (f) return f;
      const m = g.memo, p = g.player, c = g.race.course, L = p.cls.loa;
      const near = Math.min(...marks.map(id => dist(c.byId[id].p, p)));
      if (m.in === undefined && near <= 4 * L) m.in = g.t;
      if (m.in === undefined || p.legIndex <= leg) return null;
      // Clear of the mark she rounded, on her way up (or down) the next leg.
      if (m.at === undefined) { m.at = g.t; m.x = p.x; m.y = p.y; }
      const gone = ((p.x - (m.x as number)) * c.up.x + (p.y - (m.y as number)) * c.up.y) * (clear > 0 ? 1 : -1);
      if (gone < Math.abs(clear) * L) return null;
      // Seconds: the fewer the better. (Judged on the figure you're shown, to a tenth.)
      const secs = Math.round((g.t - (m.in as number)) * 10) / 10;
      const stars = secs <= steps[0] ? 3 : secs <= steps[1] ? 2 : secs <= steps[2] ? 1 : 0;
      const title = `${secs.toFixed(1)} s through the corner`;
      return stars
        ? won(title, stars === 3 ? 'In wide, out tight and fast.' : `Good. ${steps[stars === 2 ? 0 : 1].toFixed(1)} s or quicker earns the next star. ${advice}`, { stars, score: secs })
        : lost(title, `That's ${(secs - steps[2]).toFixed(1)} s too slow: to pass, take ${steps[2].toFixed(1)} s or less. ${advice}`, { score: secs });
    },
    final: () => lost('Out of time', 'Round the mark and get away up the next leg before the time runs out.'),
    progress: g => (g.memo.in !== undefined ? `${(g.t - (g.memo.in as number)).toFixed(1)} s since the zone` : 'The clock starts at the zone'),
  };
}

/** Tack (or gybe) every `every` seconds, sailing her best angle between: the demo for the handling drills. */
export const zigzag = (kind: 'tack' | 'gybe', every: number): PlanFn => (t, b, race, me) => {
  const first = b.tack;
  if (me.memo.first === undefined) me.memo.first = first === 'stbd' ? 1 : 0;
  const flip = Math.floor((t + every * 0.45) / every) % 2 === 1;
  const tack = (me.memo.first === 1) !== flip ? 'stbd' : 'port';
  return (kind === 'tack' ? closeHauled(tack) : running(tack))(t, b, race, me);
};

const realWind = { flatWind: false, windCharacter: 'oscillating' as const };
const chop = { flatWind: false, windCharacter: 'oscillating' as const, windStrength: 'medium' as const, seaState: 'chop' as const, length: 'long' as const };
const blow = { flatWind: false, windCharacter: 'puffy' as const, windStrength: 'fresh' as const, seaState: 'rough' as const, length: 'long' as const };
const light = { flatWind: false, windCharacter: 'oscillating' as const, windStrength: 'light' as const, seaState: 'flat' as const };
export const alone = (at: [number, number], hdg: number, leg = 0): SceneBoat[] => [{ role: 'You', at, hdg, leg, helm: 'player', persona: 'builder', level: 'world' }];

export const LAB: LabMoment[] = [
  // ── Boat speed ──
  {
    kind: 'lab', group: 'speed', id: 'speed-up-chop', title: 'Upwind in a breeze and chop', skill: 'Upwind pace, medium wind',
    blurb: 'One beat on your own in 9 knots and a short chop. How much of her best can you hold?',
    brief: "A long beat to mark 1 in a medium breeze and chop, with nobody in your way. You're judged on speed made good.",
    tip: "Sheet right in and let her sail: pinching in chop stops her dead. A short chop comes at her faster than she can turn, so don't steer to each wave: hold a steady course and let her punch through. Keep the rudder quiet (every big movement is a brake) and make each tack count: tack on a header, not for the sake of it.",
    sticks: { sail: 'Right in, all the way up the beat.', rudder: 'Almost still. Tiny corrections to hold her course as the waves knock the bow about; firm and quick only to tack.' },
    scene: () => ({ origin: 'line', settings: chop, boats: alone([0, 1.5], CH_S) }),
    goal: paceGoal('Beat to mark 1 at 80% of her best or better', 'up', 0, 120, [0.80, 0.84, 0.87], 'mark 1', "Foot through the chop instead of pointing into it, and keep the rudder still."),
    solution: 'ai', demoSeeds: [5, 2], mistake: closeHauled('stbd', -9), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'speed', id: 'speed-up-blow', title: 'Upwind in a blow', skill: 'Upwind pace, fresh wind and waves',
    blurb: 'One beat in 15 knots, gusts and steep waves. Keep her on her feet and moving.',
    brief: "A long beat to mark 1 in a fresh, gusty breeze and rough water. You're judged on speed made good.",
    tip: "She's overpowered in the gusts: laid over past about 35° she slows and the rudder loses its grip. Ease the sail a touch as each gust hits and squeeze it back in as she stands up. Don't pinch to spill wind. Foot across the wave faces, and before you tack ease a little so she comes upright and turns quickly.",
    sticks: { sail: "Right in, eased a touch in each gust when she's laid right over, then squeezed back in.", rudder: 'Small corrections, sailing a few degrees lower than usual to foot through the waves. Firm and quick only to tack.' },
    scene: () => ({ origin: 'line', settings: blow, boats: alone([0, 1.5], CH_S) }),
    goal: paceGoal('Beat to mark 1 at 66% of her best or better', 'up', 0, 120, [0.66, 0.71, 0.76], 'mark 1', 'Ease in the gusts to keep her upright, and foot across the waves.'),
    solution: 'ai', demoSeeds: [5, 1], mistake: closeHauled('stbd', -9), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'speed', id: 'speed-down-chop', title: 'Downwind in a breeze and chop', skill: 'Downwind pace, medium wind',
    blurb: 'One run on your own in 9 knots. Sail the angle, not the straight line.',
    brief: "The run from the offset mark to the gate in a medium breeze, with nobody near. You're judged on speed made good downwind.",
    tip: "Ease the sail right out, then sail a little above dead downwind: she's faster there than square to the wind, and it more than pays for the extra distance. Gybe when the wind swings so the other gybe points closer to the gate, and steer gently: a weaving boat sails further and drags her rudder.",
    sticks: { sail: 'Right out, all the way down the run.', rudder: 'Gentle. Hold her a little above dead downwind, and make one smooth movement for each gybe.' },
    scene: () => ({ origin: 'F', settings: chop, boats: alone([-1.5, -3], RUN_S, 2) }),
    goal: paceGoal('Run to the gate at 86% of her best or better', 'down', 2, 110, [0.86, 0.91, 0.94], 'the gate', 'Ease right out and hold her best angle, a little above dead downwind.'),
    solution: 'ai', demoSeeds: [4, 1], mistake: atAngle('stbd', 112), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'speed', id: 'speed-down-blow', title: 'Downwind in a blow', skill: 'Downwind pace, fresh wind and waves',
    blurb: 'One run in 15 knots and waves. Fast, and one mistake from a nose-dive.',
    brief: "The run from the offset mark to the gate in a fresh, gusty breeze and waves. You're judged on speed made good downwind.",
    tip: "She surfs on the wave faces and flies in the gusts, but pressed too hard on a run she buries her bow, stops and broaches. When the bow starts to go down, weave her gently from side to side to shed it, and don't run square in the big gusts: come up a few degrees. Steer early and small. Heeled or diving, the rudder has little grip.",
    sticks: { sail: 'Right out.', rudder: 'Gentle and early. When the bow starts to go down, weave left and right to shake it free.' },
    scene: () => ({ origin: 'F', settings: blow, boats: alone([-1.5, -3], RUN_S, 2) }),
    goal: paceGoal('Run to the gate at 76% of her best or better', 'down', 2, 110, [0.76, 0.84, 0.90], 'the gate', 'Catch the nose-dive early with a gentle weave, and keep off dead square in the gusts.'),
    solution: 'ai', demoSeeds: [2, 6], mistake: atAngle('stbd', 112), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'speed', id: 'speed-light', title: 'Upwind in light air', skill: 'Upwind pace, light wind',
    blurb: 'One beat in 5 knots on flat water. Keep her moving at all costs.',
    brief: "A beat to mark 1 in a light, shifty breeze. You're judged on speed made good.",
    tip: "In light air speed is everything: ease the sail a touch off right-in and sail a few degrees lower than you would in a breeze. She takes a long time to get going again, so tack as little as you can and never pinch. Tiny rudder movements only.",
    sticks: { sail: 'Right in, or a hair off it in the lightest patches.', rudder: 'Tiny and slow. Tack as little as you can: she takes a long time to get going again.' },
    scene: () => ({ origin: 'line', settings: light, boats: alone([0, 1.5], CH_S) }),
    goal: paceGoal('Beat to mark 1 at 80% of her best or better', 'up', 0, 150, [0.80, 0.85, 0.90], 'mark 1', "Keep her moving: a touch of ease, a little lower, and as few tacks as you can."),
    solution: 'ai', demoSeeds: [2, 5], mistake: closeHauled('stbd', -9), mistakeRule: '',
  },
  // ── Boat handling ──
  {
    kind: 'lab', group: 'handling', id: 'tacks', title: 'Speed through the tacks', skill: 'Tacking',
    blurb: 'Six tacks up the beat. Each one is measured in hull lengths lost.',
    brief: 'Flat water and a steady breeze. Make six tacks before mark 1: every tack is timed from head to wind until five seconds later.',
    tip: "Go in with full speed (never tack from a pinch). Turn her firmly through the wind so she spends as little time as possible head to wind, then take the rudder off early and come out a few degrees low to build speed before you squeeze back up to close-hauled. Holding the rudder over too long is the usual mistake: it drags, and she ends up reaching.",
    sticks: { sail: 'Right in throughout.', rudder: 'Firmly over to turn her through the wind, back to the middle as the sails fill on the new side, then still while she builds speed.' },
    scene: () => ({ origin: 'line', settings: { length: 'long' }, boats: alone([0, 1.5], CH_S) }),
    goal: turnsGoal('Make six tacks, losing no more than 1.7 lengths on each', 'tack', 6, 0, 120, [1.0, 1.3, 1.7], 'Carry speed in, turn firmly, and straighten up early onto a course just below close-hauled.'),
    solution: zigzag('tack', 7), mistake: closeHauled('stbd'), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'handling', id: 'gybes', title: 'Speed through the gybes', skill: 'Gybing',
    blurb: 'Five gybes down the run. A good gybe costs almost nothing; a wild one, a length.',
    brief: 'Flat water and a steady breeze. Make five gybes on the run to the gate: every gybe is timed from the boom coming across until five seconds later.',
    tip: "A good gybe barely slows her. Turn smoothly from her best angle on one gybe to her best angle on the other, no further: a big swing past it has you reaching across the course. Use about half rudder, and start straightening as the boom comes over.",
    sticks: { sail: 'Out throughout: the boom comes across on its own.', rudder: 'A smooth movement to turn her from one angle to the other, centred again as the boom comes over.' },
    scene: () => ({ origin: 'F', settings: { length: 'long' }, boats: alone([-1.5, -3], RUN_S, 2) }),
    goal: turnsGoal('Make five gybes, losing no more than 0.8 lengths on each', 'gybe', 5, 2, 110, [0.3, 0.5, 0.8], "Turn only from her best angle on one gybe to her best angle on the other, with half rudder."),
    solution: zigzag('gybe', 7), mistake: running('stbd'), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'handling', id: 'gate-exit', title: 'Gate: in wide, out tight', skill: 'Leeward mark rounding',
    blurb: 'Round the gate and get away upwind. Timed from the zone to five lengths up the beat.',
    brief: "You're running into the leeward gate on your own. The clock starts as you enter the zone and stops when you're five lengths up the next beat.",
    tip: "Come in a length wide of the mark so you can turn early and pass it close on the way out, already close-hauled. Sheet in as you turn (the sail comes in with the bow). A tight entry leaves you wide and slow on the exit, below everyone who rounded properly.",
    sticks: { sail: "Coming in steadily as she turns, so it's right in as she reaches close-hauled.", rudder: 'One smooth turn, started early from a length wide of the mark.' },
    scene: () => ({ origin: 'GP', settings: {}, boats: alone([-2.6, 9], RUN_S, 2) }),
    goal: roundingGoal('From the zone to five lengths up the beat in 20 s or less', ['GP', 'GS'], 2, 5, 60, [17.8, 18.6, 20], "Start your turn before the mark, from a length wide, and be close-hauled as you pass it."),
    solution: 'ai', demoSeeds: [4], mistakeRule: '',
  },
  {
    kind: 'lab', group: 'handling', id: 'bear-away', title: 'Mark 1: the bear-away', skill: 'Windward mark rounding',
    blurb: 'Round mark 1 and the offset and get going down the run. Timed from the zone.',
    brief: "You're on the starboard layline to mark 1 on your own. The clock starts at the zone and stops when you're five lengths down the run past the offset mark.",
    tip: "Lay the mark with speed, not pinching up to it. Ease the sail as you bear away round it (the bow goes down as the sail goes out), cross to the offset mark on a reach, then turn down onto her best running angle, not square. Don't cut either mark close enough to touch.",
    sticks: { sail: 'Let out as she turns down: the sail goes out with the bow.', rudder: 'Over to bear away as the mark comes abeam, eased off as she settles on the run.' },
    scene: () => ({ origin: 'W', settings: {}, boats: alone([5.6, -5.8], CH_S) }),
    goal: roundingGoal('From the zone to five lengths down the run in 24.5 s or less', ['W'], 1, -5, 70, [22.4, 23.2, 24.5], 'Ease as you bear away, and go straight onto her best running angle after the offset.'),
    solution: 'ai', demoSeeds: [1], mistakeRule: '',
  },
  // ── Around the marks ──
  {
    kind: 'lab', group: 'marks', id: 'port-approach', title: 'Port-tack approach', skill: 'Mark 1, crossing the fleet',
    blurb: 'Coming into mark 1 on port with three boats on the starboard layline.',
    brief: "You're on port, heading for mark 1. Three boats are coming in on starboard from the right.",
    tip: "You can't tack in front of them inside the zone (Rule 18.3) and you can't cross them unless you're clearly ahead. Decide early: duck and tack in their wake, or tack early below them to leeward.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [-5, -9], hdg: CH_P, helm: 'player', persona: 'steady', level: 'world' },
        rival('Steady', [5.5, -9.5], CH_S, 'steady'), rival('Squeezer', [7.0, -8.2], CH_S, 'squeezer'), rival('Speed builder', [8.5, -10.6], CH_S, 'builder'),
      ],
    }),
    goal: topAtMark('Round mark 1 in the top 2', 0, 2, 70, 'mark 1'),
    solution: 'ai', demoSeeds: [7, 1],
    mistake: hold(CH_P),
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'marks', id: 'crowded-rounding', title: 'Crowded rounding', skill: 'Mark 1, traffic',
    blurb: 'Five boats arrive at mark 1 together. Keep your place, or gain one.',
    brief: "You're third in a queue on the starboard layline to mark 1, with a port tacker coming in.",
    tip: "Stay on the layline with speed, don't pinch. Inside you, a boat clear ahead at the zone gets room. Round wide in and tight out so nobody can sneak inside on the exit.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [5.4, -5.6], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world' },
        rival('Leader', [3.5, -3.7], CH_S, 'steady', 'national'), rival('Second', [4.4, -4.8], CH_S, 'careful', 'national'),
        rival('Fourth', [6.5, -6.8], CH_S, 'squeezer', 'national'), rival('Fifth', [7.6, -8.0], CH_S, 'builder', 'national'),
        rival('Port tacker', [-3, -5.5], CH_P, 'gambler', 'state'),
      ],
    }),
    goal: topAtMark('Round mark 1 in the top 3', 0, 3, 50, 'mark 1'),
    solution: 'ai', demoSeeds: [8, 5],
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'marks', id: 'gate-choice', title: 'Gate choice', skill: 'The leeward gate',
    blurb: 'Running to the gate with four boats. Which mark?',
    brief: "You're running to the leeward gate in the middle of a pack. Pick your gate mark.",
    tip: "Go for the less crowded mark, or the one that puts you on the favoured side for the next beat. Being inside at the zone matters more than which mark you pick.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-3.2, 11], hdg: RUN_S, leg: 2, helm: 'player', persona: 'steady', level: 'world' },
        rival('Steady', [-5.5, 12], RUN_S, 'steady', 'state', { leg: 2 }), rival('Gambler', [-1.0, 12.5], RUN_P, 'gambler', 'state', { leg: 2 }),
        rival('Shift player', [-3.8, 13.5], RUN_S, 'shifty', 'state', { leg: 2 }), rival('Squeezer', [0.5, 10.5], RUN_P, 'squeezer', 'state', { leg: 2 }),
      ],
    }),
    goal: topAtMark('Round the gate in the top 2', 2, 2, 60, 'the gate'),
    solution: 'ai', demoSeeds: [4, 6],
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'layline', title: 'The layline call', skill: 'Shifts and laylines',
    blurb: 'Beat to mark 1 against one rival in a shifty breeze.',
    brief: "You and one rival are side by side, 16 lengths below mark 1, in an oscillating breeze.",
    tip: "Tack on the headers (watch the wind graph), stay off the laylines until late, and don't overstand: tack when the mark is just behind your beam.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [1, -16], hdg: CH_S, helm: 'player', persona: 'shifty', level: 'world' },
        rival('Rival', [3.2, -16.4], CH_S, 'steady', 'state'),
      ],
    }),
    goal: beatRival('Round mark 1 ahead of your rival', 0, 90, 'mark 1', 'Rival'),
    solution: 'ai', demoSeeds: [1, 3],
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'cover', title: 'Protect your lead', skill: 'Covering',
    blurb: "You're three lengths ahead. Stay there.",
    brief: "You're leading by three lengths up the beat. Your rival behind will split away and look for a shift.",
    tip: 'Stay between her and the mark. When she tacks, tack soon after so you stay on the same side of the course, and keep her in your wind shadow if you can.',
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [0, -14], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world' },
        rival('Rival', [2.0, -16.2], CH_S, 'shifty', 'national'),
      ],
    }),
    goal: beatRival('Round mark 1 still ahead of your rival', 0, 90, 'mark 1', 'Rival'),
    solution: 'ai', demoSeeds: [1, 3],
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'downwind-pass', title: 'Pass on the run', skill: 'Downwind',
    blurb: 'Two lengths behind on the run. Use your wind shadow.',
    brief: "You're two lengths behind your rival on the run to the gate.",
    tip: "Your wind shadow reaches several lengths downwind: sit right behind her to slow her, then pass. Get the inside overlap before the zone and you'll get mark-room.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-3.1, 14.6], hdg: RUN_S, leg: 2, helm: 'player', persona: 'builder', level: 'world' },
        rival('Rival', [-2.8, 12.9], RUN_S, 'careful', 'club', { leg: 2 }),
      ],
    }),
    goal: beatRival('Round the gate ahead of your rival', 2, 60, 'the gate', 'Rival'),
    solution: 'ai', demoSeeds: [4, 5],
    mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'cross-or-duck', title: 'Cross, duck or lee-bow', skill: 'Port and starboard up the beat',
    blurb: "You're on port, she's on starboard, and you're going to meet.",
    brief: "Mid-beat on port, converging with a starboard tacker who is about level with you. You must keep clear (Rule 10).",
    tip: "Decide early. If you'd clear her by a length, cross. If not, either bear away and pass close behind her stern (you lose less than a length and keep going to the right), or tack to leeward and just ahead of her so she sails in your backwind. Never make her alter course.",
    scene: () => ({
      origin: 'W', settings: realWind,
      boats: [
        { role: 'You', at: [-5.2, -17], hdg: CH_P, helm: 'player', persona: 'steady', level: 'world' },
        rival('Rival', [5.2, -17.4], CH_S, 'steady', 'national'),
      ],
    }),
    goal: beatRival('Keep clear of her, and round mark 1 ahead', 0, 100, 'mark 1', 'Rival'),
    solution: 'ai', demoSeeds: [1], mistake: hold(CH_P), mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'dirty-air', title: 'Second row', skill: 'Clear air after a bad start',
    blurb: "A poor start has left you in the bad air of the boats ahead. Get out of it.",
    brief: "Just after the start you're a length behind two boats, right in their wind shadow, with two more out to either side.",
    tip: "Bad air costs you more every second you stay in it. Look for a clear lane: tack away onto port if you can cross behind the boats to windward, or foot off to leeward into clear wind. Don't sit there hoping.",
    scene: () => ({
      origin: 'line', settings: realWind,
      boats: [
        { role: 'You', at: [0, 2.7], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world', spd: 0.85 },
        rival('Ahead', [-0.9, 4.2], CH_S, 'steady', 'club'), rival('To windward', [1.1, 4.0], CH_S, 'squeezer', 'club'),
        rival('Pin hunter', [-4.5, 4.4], CH_S, 'pin', 'club'), rival('Speed builder', [3.6, 3.6], CH_S, 'builder', 'club'),
      ],
    }),
    goal: topAtMark('Round mark 1 in the top 3', 0, 3, 110, 'mark 1'),
    solution: 'ai', demoSeeds: [7, 3], mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'defend-run', title: 'Defend on the run', skill: 'Downwind, leading',
    blurb: "You lead by two lengths down the run, and she's coming for your wind.",
    brief: "You're leading on the run to the gate. Your rival is two lengths behind and will try to sit on your wind and get inside you at the gate.",
    tip: "Her wind shadow reaches you from straight upwind. Watch the wind and stay out of the line between her and it: gybe away if she sits on you. Coming into the gate, protect the inside so she can't get an overlap before the zone.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-2.8, 12.6], hdg: RUN_S, leg: 2, helm: 'player', persona: 'steady', level: 'world' },
        rival('Rival', [-3.0, 14.8], RUN_S, 'squeezer', 'national', { leg: 2 }),
      ],
    }),
    goal: beatRival('Round the gate still ahead of your rival', 2, 60, 'the gate', 'Rival'),
    solution: 'ai', demoSeeds: [1, 2], mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'last-beat', title: 'The last beat', skill: 'Gate to the finish',
    blurb: "You and your rival round opposite gate marks, level. One short beat decides it.",
    brief: "You've just rounded the left-hand gate mark as your rival rounds the right-hand one, dead level, with a short beat to the finish.",
    tip: "A short beat leaves time for one or two tacks at most, so each must be on a header. Watch the wind graph: if you're lifted, stay; if you're headed, tack now and cross her. At the line, go for the nearer end and cross it at the closest point.",
    scene: () => ({
      origin: 'GP', settings: realWind,
      boats: [
        { role: 'You', at: [-7.6, 1.6], hdg: CH_S, leg: 3, helm: 'player', persona: 'shifty', level: 'world' },
        rival('Rival', [1.2, 1.6], CH_P, 'steady', 'state', { leg: 3 }),
      ],
    }),
    goal: beatToFinish('Finish ahead of your rival', 80, 'Rival'),
    solution: 'ai', demoSeeds: [7], mistakeRule: '',
  },
  {
    kind: 'lab', group: 'tactics', id: 'penalty-comeback', title: 'Turn and come back', skill: 'Taking a penalty',
    blurb: 'You fouled at the start and owe a turn. Take it well and get back in the race.',
    brief: "Just after the start you owe a One-Turn Penalty: one tack and one gybe. The fleet is sailing on.",
    tip: "Get clear of other boats first (you must keep clear while you turn), then spin her quickly: bear away into the gybe with speed on, carry on round through the tack, and come out close-hauled. A good turn costs about four lengths. Then sail your own race in clear air rather than chasing straight up their sterns.",
    scene: () => ({
      origin: 'line', settings: realWind,
      boats: [
        { role: 'You', at: [0.5, 3], hdg: CH_S, helm: 'player', persona: 'steady', level: 'world', owes: 1 },
        rival('Steady', [-2.2, 3.4], CH_S, 'steady', 'club'), rival('Gambler', [2.6, 2.8], CH_S, 'gambler', 'club'),
        rival('Conservative', [4.6, 2.2], CH_S, 'careful', 'club'), rival('Shift player', [-4.4, 2.6], CH_S, 'shifty', 'club'),
      ],
    }),
    goal: (() => {
      const base = topAtMark('Take your turn, then round mark 1 in the top 3', 0, 3, 120, 'mark 1');
      return {
        ...base,
        check: (g: GoalCtx): Outcome | null => {
          if (g.player.legIndex > 0 && g.player.penalty.owed > 0) return lost("You didn't take your turn", "You rounded mark 1 still owing your penalty. In a race that's a disqualification if you're protested: take the turn as soon as you're clear of other boats.");
          return base.check!(g);
        },
      };
    })(),
    solution: 'ai', demoSeeds: [17, 19], mistakeRule: '',
  },
];

