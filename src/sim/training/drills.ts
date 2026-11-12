// The Start Trainer: twelve short drills, each a pre-start (or the moment after the gun) set up on
// the real engine against real AI skippers, scored with stars. Drills vary a little each time
// (the wind and the line), so a good score means you've learned it, not memorised it.
import { Rng } from '../math';
import type { SceneBoat, SceneDef } from '../scene';
import { hold } from '../scene';
import type { GoalCtx, Outcome } from './common';
import { dhypot } from '../dmath';
import {
  SceneSpec, fouled, holdForLine, linePoint, lost, overEarly, pctText, recallAndRestart, rule14, secText, starsFor, startFacts, timedStart, won,
} from './common';

export type DrillGroup = 'Timing' | 'Position' | 'Tactics' | 'Recovery';

export interface Drill extends SceneSpec {
  group: DrillGroup;
  /** One line for the drill card. */
  blurb: string;
  /** How the score reads ("0.6 s late", "92%"), and which way is better. */
  scoreText: (v: number) => string;
  higherIsBetter?: boolean;
}

const CH_S = 317.5;
const ai = (role: string, at: [number, number], persona: string, level: SceneBoat['level'] = 'state', hdg = 300, spd = 0.3): SceneBoat =>
  ({ role, at, hdg, spd, helm: 'ai', persona, level });

/** A start drill's goal: start, then score it with `judge`. */
function startGoal(text: string, pre: number, judge: (g: GoalCtx, s: NonNullable<ReturnType<typeof startFacts>>) => Outcome, extraWait = 0) {
  return {
    text, seconds: pre + 12 + extraWait,
    check: (g: GoalCtx) => {
      const f = overEarly(g) ?? fouled(g) ?? rule14(g);
      if (f) return f;
      const s = startFacts(g);
      if (!s) return null;
      if (extraWait && g.race.t < g.race.gunT + extraWait) return null;
      return judge(g, s);
    },
    final: () => lost('No start', 'You never crossed the line. Get below it, then go when your time to the line matches the clock.'),
    progress: (g: GoalCtx) => {
      const T = g.race.gunT - g.race.t;
      const s = startFacts(g);
      if (s) return `Started ${secText(s.late)} after the gun`;
      return T > 0 ? null : `${secText(-T)} after the gun`;
    },
  };
}

const lateText = (late: number) => (late < 0.05 ? 'right on the gun' : `${late.toFixed(1)} s after the gun`);

export const DRILLS: Drill[] = [
  // ── Timing ──
  {
    kind: 'drill', id: 'hold-spot', group: 'Timing', title: 'Hold your spot',
    blurb: 'Hover in one place below the line for 30 seconds without drifting off it.',
    brief: 'Stay inside the ring from 0:40 to 0:10, then start.',
    tip: 'Luff until the sail flaps and she stops. Sit head to wind to drift back, ease and bear away a touch to creep forward. Small moves, early.',
    steps: ["Steer up into the wind (luff) until the sail flaps and she stops: on starboard tack, rudder stick to the right, and let the sail out.", "To drift back a little, sit pointing straight into the wind (head to wind).", "To creep forward, turn away from the wind a touch (rudder stick left on starboard) and pull the sail in a little, then stop again.", "Keep inside the ring until 0:10 on the clock, then turn down to close-hauled, pull the sail right in and go for the line.", "Make small moves, early. A big turn carries you out of the ring."],
    sticks: { sail: "Out to stop, a little in to creep forward, right in for the last ten seconds.", rudder: "Towards the wind (right on starboard) to stop; a small move away from it (left) to creep forward." },
    card: { cues: ['Turn up and ease to stop in the ring', 'Small moves to stay inside', 'At 0:10, bear away, sail in, go'], sail: { at: 'half', move: 'go' }, rudder: 'hold', picture: { kind: 'start', v: 'ring', label: 'stay in the ring till 0:10' } },
    scene: () => ({
      origin: 'line', preStart: 45,
      boats: [
        { role: 'You', at: [0, -1.6], hdg: 300, spd: 0.15, helm: 'player' },
        ai('Pin hunter', [-7, -3.5], 'pin'), ai('Squeezer', [7, -3.5], 'squeezer'),
      ],
      overlays: [{ kind: 'ring', at: [0, -1.6], r: 1, label: 'Hold here', tone: 'blue' }],
    }),
    goal: {
      text: 'Stay in the ring from 0:40 to 0:10, then start', seconds: 45 + 10,
      check: g => {
        const f = overEarly(g) ?? fouled(g) ?? rule14(g);
        if (f) return f;
        const T = g.race.gunT - g.race.t;
        const spot = linePoint(g.race, 0.5, 1.6);
        if (T <= 40 && T > 10 && dhypot(g.player.x - spot.x, g.player.y - spot.y) <= g.player.cls.loa) g.memo.inside = ((g.memo.inside as number) ?? 0) + 0.05;
        return null;
      },
      final: g => {
        const inside = (g.memo.inside as number) ?? 0;
        const stars = inside >= 27 ? 3 : inside >= 22 ? 2 : inside >= 15 ? 1 : 0;
        const s = startFacts(g);
        const tail = s ? ` You started ${lateText(s.late)}.` : '';
        return stars ? won(`${Math.round(inside)} s of 30 in the ring`, `Good station-keeping.${tail}`, { stars, score: inside })
          : lost(`${Math.round(inside)} s of 30 in the ring`, `Luff to stop, drift back head to wind, creep forward with the sail eased. Stay ahead of the drift.${tail}`, { score: inside });
      },
      progress: g => {
        const T = g.race.gunT - g.race.t;
        const inside = Math.round((g.memo.inside as number) ?? 0);
        return T > 40 ? `Get into the ring: ${Math.ceil(T - 40)} s` : T > 10 ? `In the ring: ${inside} s of 30` : `${inside} s held. Now start!`;
      },
    },
    scoreText: v => `${Math.round(v)} s held`, higherIsBetter: true,
    solution: timedStart({ hover: race => linePoint(race, 0.5, 1.6), margin: 0.5 }),
    demoSeeds: [1, 3, 4],
    mistake: hold(CH_S - 10),
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'time-distance', group: 'Timing', title: 'Time on distance',
    blurb: 'From six lengths back, hit the line at full speed as the gun goes.',
    brief: "You're stopped six lengths below the line with 20 seconds to go.",
    tip: 'Watch "at full speed" on the start line card: it is how long you need from here. Sit still until it matches the clock, then sheet in and go.',
    steps: ["Look at the start line card: \"at full speed\" tells you how many seconds you need from here to the line.", "Sit still with the sail out until the clock matches that time.", "Then turn to close-hauled, pull the sail right in and sail straight for the line."],
    sticks: { sail: "Out while you wait; right in the moment the clock matches \"at full speed\".", rudder: "Still while you wait, then a small turn away from the wind (left on starboard) to close-hauled." },
    card: { cues: ['Read "at full speed" on the line card', 'Sit still, sail out, till the clock matches', 'Then sail in and go'], sail: { at: 'in', move: 'go' }, rudder: 'still', picture: { kind: 'start', v: 'back', label: 'go when the clock = "at full speed"' } },
    scene: () => ({ origin: 'line', preStart: 20, boats: [{ role: 'You', at: [3, -6], hdg: 300, spd: 0.1, helm: 'player' }] }),
    goal: startGoal('Cross the line at full speed, as soon after the gun as you can', 20, (_g, s) => {
      const stars = s.spd < 0.85 ? Math.min(2, starsFor(s.late, [1, 2.5, 5])) : starsFor(s.late, [1, 2.5, 5]);
      return stars ? won(`Started ${lateText(s.late)}`, `At ${pctText(s.spd)} of full speed.`, { stars, score: s.late })
        : lost(`Started ${lateText(s.late)}`, 'Too late. Trigger when the time to the line at full speed equals the time left, not after.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: timedStart({ margin: 0.4 }),
    mistake: hold(CH_S),
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'trigger', group: 'Timing', title: 'Pull the trigger',
    blurb: 'Hovering a length and a half back with 12 seconds to go: when do you go?',
    brief: "You're hovering a length and a half below the line, with boats either side.",
    tip: 'From a length and a half back you need about 4 to 5 seconds. Bear away to close-hauled and sheet in hard at that moment, not a second before.',
    steps: ["Wait a length and a half below the line with the sail out, barely moving.", "From there you need about 4 to 5 seconds to reach the line. When the clock shows that, go (that's \"pulling the trigger\").", "Turn away from the wind to close-hauled (rudder stick left on starboard) and pull the sail right in at the same moment.", "Not a second earlier, or you'll be over the line at the gun."],
    sticks: { sail: "Out while you wait; right in at the trigger.", rudder: "A firm move left (on starboard) at the trigger to close-hauled, then centred." },
    card: { cues: ['Wait, sail out, a length and a half back', 'Go at 4 to 5 seconds', 'Turn to close-hauled and sail in together'], sail: { at: 'in', move: 'go' }, rudder: 'smooth', picture: { kind: 'start', v: 'trigger', label: 'go at 4 to 5 seconds' } },
    scene: () => ({
      origin: 'line', preStart: 12,
      boats: [
        { role: 'You', at: [0, -1.6], hdg: 305, spd: 0.15, helm: 'player' },
        ai('Steady', [-4.5, -1.5], 'steady', 'state', 305, 0.15), ai('Conservative', [4.5, -1.7], 'careful', 'state', 305, 0.15), ai('Speed builder', [9, -1.5], 'builder', 'state', 305, 0.15),
      ],
    }),
    goal: startGoal('Start within a second of the gun at full speed', 12, (_g, s) => {
      const stars = s.late <= 0.6 && s.spd >= 0.9 ? 3 : s.late <= 1.5 ? 2 : s.late <= 3 ? 1 : 0;
      return stars ? won(`Started ${lateText(s.late)}`, `At ${pctText(s.spd)} of full speed.`, { stars, score: s.late })
        : lost(`Started ${lateText(s.late)}`, 'You waited too long. Go when the time to the line matches the clock.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: timedStart({ margin: 0.3 }),
    mistake: timedStart({ margin: -5 }),
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'speed', group: 'Timing', title: 'Full speed at the gun',
    blurb: 'Cross with the boat already at full speed, not still accelerating.',
    brief: "You're five lengths back with 15 seconds to go. Be at full speed as you cross.",
    tip: 'Start moving early and control the timing by easing the sail, not by stopping. Sheet in fully for the last few lengths.',
    steps: ["Start moving early, close-hauled towards the line.", "If you're going to be early, let the sail out a little to slow her rather than stopping: a stopped boat takes a long time to get going.", "For the last few lengths, pull the sail right in so she's at full speed as you cross at the gun."],
    sticks: { sail: "Eased to control your timing, right in for the last few lengths.", rudder: "Steady, close-hauled." },
    card: { cues: ['Start moving early', 'Early? Ease the sail, don\'t stop', 'Sail right in for the last few lengths'], sail: { at: 'in', move: 'go' }, rudder: 'still', picture: { kind: 'start', v: 'back', label: 'full speed at the gun' } },
    scene: () => ({ origin: 'line', preStart: 15, boats: [{ role: 'You', at: [2.5, -5], hdg: 300, spd: 0.1, helm: 'player' }] }),
    goal: startGoal('Cross at 95% of full speed or more, within 2 seconds of the gun', 15, (_g, s) => {
      const stars = s.spd >= 0.97 && s.late <= 1.5 ? 3 : s.spd >= 0.9 && s.late <= 2.5 ? 2 : s.spd >= 0.8 && s.late <= 4 ? 1 : 0;
      return stars ? won(`${pctText(s.spd)} of full speed`, `Started ${lateText(s.late)}.`, { stars, score: s.spd })
        : lost(`${pctText(s.spd)} of full speed`, `Started ${lateText(s.late)}. Build speed earlier and burn time by easing, so you cross fully powered up.`, { score: s.spd });
    }),
    scoreText: v => `${Math.round(v * 100)}% speed`, higherIsBetter: true,
    solution: timedStart({ margin: 1.5 }),
    mistake: timedStart({ margin: -4 }),
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'light-air', group: 'Timing', title: 'Light-air start',
    blurb: 'In 5 knots the boat takes far longer to get going. Allow for it.',
    brief: "It's light. You're stopped three lengths back with 30 seconds to go.",
    tip: 'In light air an IOM needs many seconds to reach full speed. Trigger much earlier than you would in a breeze, and keep the boat moving.',
    steps: ["In light air she needs many seconds to reach full speed from stopped.", "So start your run in much earlier than you would in a breeze: check \"at full speed\" on the start line card and add a few seconds.", "Turn to close-hauled and pull the sail almost all the way in, then keep her moving with small, slow rudder moves."],
    sticks: { sail: "Almost right in once you go.", rudder: "Tiny and slow." },
    card: { cues: ['Go much earlier than in a breeze', 'Sail almost right in', 'Tiny, slow rudder moves'], sail: { at: 'nearly-in', move: 'go' }, rudder: 'still', picture: { kind: 'start', v: 'back', label: 'go early: she\'s slow to speed up' } },
    scene: () => ({ origin: 'line', preStart: 30, settings: { windStrength: 'light' }, boats: [{ role: 'You', at: [0, -3], hdg: 300, spd: 0.05, helm: 'player' }] }),
    goal: startGoal('Start within 2 seconds of the gun in light air', 30, (_g, s) => {
      const stars = starsFor(s.late, [1, 2.5, 5]);
      return stars ? won(`Started ${lateText(s.late)}`, `At ${pctText(s.spd)} of full speed.`, { stars, score: s.late })
        : lost(`Started ${lateText(s.late)}`, 'Light air: trigger earlier. The time to the line card allows for the slow acceleration.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: timedStart({ margin: 1.3 }),
    demoSeeds: [1, 3, 4],
    mistake: timedStart({ margin: -6 }),
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'timed-run', group: 'Timing', title: 'Timed run',
    blurb: 'Reach away from the line, turn, and come back to it on the gun.',
    brief: "You're just below the line with 40 seconds to go, reaching away from it.",
    tip: 'Reach away on port, then tack round onto starboard and come back close-hauled. Turn back when the time to the line at full speed, plus a couple of seconds for the turn, matches the time left.',
    steps: ["Sail away from the line on port tack, with the sail about half out (a reach).", "Watch the clock. Turn back when the time left equals the time it took you to get here plus a couple of seconds for the turn.", "Tack round onto starboard and come back close-hauled with the sail right in, crossing at the gun."],
    sticks: { sail: "Half out on the way out, right in on the way back.", rudder: "To turn back, push it towards the wind (left on port) to tack, then centre it." },
    card: { cues: ['Reach away on port, sail half out', 'Turn back with time for the run plus the tack', 'Come back close-hauled, sail in'], sail: { at: 'in', move: 'to-in' }, rudder: 'smooth', picture: { kind: 'start', v: 'run', label: 'out, tack, back on time' } },
    scene: () => ({ origin: 'line', preStart: 40, boats: [{ role: 'You', at: [1, -0.6], hdg: 135, spd: 0.9, helm: 'player' }] }),
    goal: startGoal('Come back and start within 2 seconds of the gun', 40, (_g, s) => {
      const stars = starsFor(s.late, [1, 2.5, 5]);
      return stars ? won(`Started ${lateText(s.late)}`, `At ${pctText(s.spd)} of full speed.`, { stars, score: s.late })
        : lost(`Started ${lateText(s.late)}`, 'Turn back sooner: you need the time to the line plus the turn.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: timedStart({ margin: 2.6, before: hold(135) }),
    mistake: hold(135),
    mistakeRule: '',
  },
  // ── Position ──
  {
    kind: 'drill', id: 'favoured-end', group: 'Position', title: 'Find the favoured end',
    blurb: 'Check which end is upwind, then start in the right third of the line.',
    brief: 'The line is biased. The start line card tells you which end, and by how much.',
    tip: 'The favoured end is the one further upwind. Set up below it early, before the fleet arrives, and leave a gap to leeward.',
    steps: ["Read the start line card: it says which end is favoured (further upwind) and by how much.", "Get there early, before the fleet, and stop just below the line near that end.", "Leave a gap to leeward (on your left, downwind), so you have room to turn and speed up.", "Start on time, close-hauled with the sail right in."],
    sticks: { sail: "Out while you wait; right in when you go.", rudder: "Towards the wind (right on starboard) to hold your spot; left to go." },
    card: { cues: ['The line card says which end', 'Get there early, leave a gap on your left', 'Go on time, sail right in'], sail: { at: 'in', move: 'go' }, rudder: 'hold', picture: { kind: 'start', v: 'gap', label: 'early, with a gap to leeward' } },
    scene: seed => {
      const r = new Rng(seed * 7 + 3);
      const bias = r.pick([-1, 1]) * r.range(6, 9);
      return {
        origin: 'line', preStart: 50, settings: { lineBias: bias },
        boats: [
          { role: 'You', at: [0, -5], hdg: 300, spd: 0.3, helm: 'player', persona: bias > 0 ? 'pin' : 'squeezer', level: 'world' },
          ai('Steady', [-3, -4], 'steady'), ai('Speed builder', [3, -4.5], 'builder'), ai('Gambler', [-6, -6], 'gambler'), ai('Conservative', [6, -6], 'careful'),
        ],
      };
    },
    goal: startGoal('Start in the favoured third of the line, within 3 seconds of the gun', 50, (g, s) => {
      const c = g.race.course;
      const pin = (c.start.pin.x - c.start.stbd.x) * c.up.x + (c.start.pin.y - c.start.stbd.y) * c.up.y > 0; // the pin end is further upwind
      const from = pin ? s.fromPin : s.fromStbd;
      const end = pin ? 'pin' : 'starboard';
      if (from > s.lineL / 3) return lost(`${from.toFixed(1)} lengths from the ${end} end`, `The ${end} end was favoured. Start in the third of the line nearest it.`, { score: from });
      const stars = s.late <= 1 && from <= s.lineL / 5 ? 3 : s.late <= 2 ? 2 : s.late <= 3 ? 1 : 0;
      return stars ? won(`${from.toFixed(1)} lengths from the ${end} end`, `Started ${lateText(s.late)}.`, { stars, score: from })
        : lost('Right end, too late', `Started ${lateText(s.late)}. Get there earlier and hold your spot.`, { score: from });
    }),
    scoreText: v => `${v.toFixed(1)} lengths from the end`,
    solution: 'ai',
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'pin', group: 'Position', title: 'Win the pin',
    blurb: 'The pin end is favoured and the pin hunters know it.',
    brief: 'The pin end is well favoured. Start within three lengths of it, on time.',
    tip: "Get there with 20 seconds to go, on starboard, a length and a half back, with a gap to leeward. Don't run out of line: the pin is the end.",
    steps: ["The pin is the buoy at the left-hand end of the line, looking upwind. Get there with 20 seconds to go.", "Wait on starboard tack a length and a half below the line, near the pin, with a gap on your left.", "Don't drift past the pin: the line ends there.", "Go at about 5 seconds to the gun: turn to close-hauled and pull the sail right in."],
    sticks: { sail: "Out while you wait; right in when you go.", rudder: "Towards the wind (right) to hold your spot; left to go." },
    card: { cues: ['At the pin with 20 seconds to go', 'Wait a length and a half back, gap on your left', 'Don\'t drift past the pin. Go at 5 seconds'], sail: { at: 'in', move: 'go' }, rudder: 'hold', picture: { kind: 'start', v: 'pin', label: 'start by the pin' } },
    scene: () => ({
      origin: 'line', preStart: 45, settings: { lineBias: 8 },
      boats: [
        { role: 'You', at: [3.0, -3.6], hdg: 300, spd: 0.3, helm: 'player' },
        ai('Steady', [-1, -6.5], 'steady'), ai('Conservative', [2, -4.5], 'careful'), ai('Speed builder', [4, -6], 'builder'), ai('Squeezer', [6, -5], 'squeezer'),
      ],
    }),
    goal: startGoal('Start within 3 lengths of the pin, within 2.5 s of the gun', 45, (_g, s) => {
      if (s.fromPin > 3) return lost(`${s.fromPin.toFixed(1)} lengths from the pin`, 'Too far up the line. Set up closer to the pin.', { score: s.late });
      const stars = starsFor(s.late, [0.8, 1.6, 2.5]);
      return stars ? won(`Pin start, ${lateText(s.late)}`, `${s.fromPin.toFixed(1)} lengths from the pin at ${pctText(s.spd)} speed.`, { stars, score: s.late })
        : lost(`At the pin, ${lateText(s.late)}`, 'Good spot, but late. Trigger earlier.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    // Set up to the right and let a luffing boat's drift bring the crossing point down to the pin.
    solution: timedStart({ before: holdForLine(0.18, 2.6), margin: 0.7 }),
    demoSeeds: [8, 10, 2],
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'boat-end', group: 'Position', title: 'Win the starboard end',
    blurb: 'The starboard end is favoured, and everyone wants it.',
    brief: 'The starboard end is favoured. Start within three lengths of it, on time.',
    tip: "Come in early and hold your spot just inside the mark. Arriving late on a reach from outside the line is barging: no room for you (Rule 11).",
    steps: ["The starboard end is the right-hand end looking upwind, by the committee boat. Get there early.", "Hold your spot just inside the end mark, on starboard.", "Don't arrive late, sailing across from outside the end. That's barging, and nobody has to give you room (Rule 11).", "Go on time: close-hauled, sail right in."],
    sticks: { sail: "Out while you wait; right in when you go.", rudder: "Towards the wind (right) to hold your spot; left to go." },
    card: { cues: ['Get to the committee boat end early', 'Hold just inside the end', 'Never come in late from outside: barging'], sail: { at: 'in', move: 'go' }, rudder: 'hold', picture: { kind: 'start', v: 'boat', label: 'start by the committee boat' } },
    scene: () => ({
      origin: 'line', preStart: 45, settings: { lineBias: -8 },
      boats: [
        { role: 'You', at: [3, -5], hdg: 300, spd: 0.3, helm: 'player', persona: 'squeezer', level: 'world' },
        ai('Pin hunter', [-6, -4], 'pin'), ai('Gambler', [-3, -6], 'gambler'), ai('Steady', [0, -4.5], 'steady'), ai('Speed builder', [1, -6.5], 'builder'),
      ],
    }),
    goal: startGoal('Start within 3 lengths of the starboard end, within 2.5 s', 45, (_g, s) => {
      if (s.fromStbd > 3) return lost(`${s.fromStbd.toFixed(1)} lengths from the end`, 'Too far down the line. Set up nearer the starboard end.', { score: s.late });
      const stars = starsFor(s.late, [0.8, 1.6, 2.5]);
      return stars ? won(`Starboard-end start, ${lateText(s.late)}`, `${s.fromStbd.toFixed(1)} lengths from the mark at ${pctText(s.spd)} speed.`, { stars, score: s.late })
        : lost(`At the end, ${lateText(s.late)}`, 'Good spot, but late. Trigger earlier.', { score: s.late });
    }),
    scoreText: v => `${v.toFixed(1)} s late`,
    // A world-class starter who goes for the starboard end shows how.
    solution: 'ai',
    demoSeeds: [1, 3, 4],
    mistakeRule: '',
  },
  // ── Tactics ──
  {
    kind: 'drill', id: 'port-start', group: 'Tactics', title: 'Port-tack start',
    blurb: 'A big pin bias: start on port at the pin and cross the fleet.',
    brief: "The pin is heavily favoured. You're on port below the pin, the fleet is up the line on starboard.",
    tip: 'Hover on port below the pin, trigger on time and cross the line on port near the pin. Any starboard boat you meet has right of way (Rule 10): duck her if you must.',
    steps: ["Wait on port tack (wind over her left side) just below the pin end.", "Time your run so you cross the line on port near the pin, right at the gun.", "Any boat you meet on starboard has right of way (Rule 10). If she's in your way, pass behind her stern (duck): bear away, then come back up."],
    sticks: { sail: "Out while you wait; right in when you go.", rudder: "On port, away from the wind is right: a small move right to bear away behind a starboard boat." },
    card: { cues: ['Wait on port below the pin', 'Cross on port near the pin at the gun', 'Starboard boats have right of way: duck them'], sail: { at: 'in', move: 'go' }, rudder: 'smooth', picture: { kind: 'start', v: 'port', label: 'port tack, across by the pin' } },
    scene: () => ({
      origin: 'pin', preStart: 30, settings: { lineBias: 15 },
      boats: [
        { role: 'You', at: [-4, -3], hdg: 58, spd: 0.15, helm: 'player' },
        ai('Squeezer', [8, -4], 'squeezer'), ai('Steady', [6, -5], 'steady'), ai('Conservative', [9.5, -5.5], 'careful'), ai('Leeward luffer', [13, -4.5], 'luffer'),
      ],
    }),
    goal: startGoal('Start on port within 4 lengths of the pin, within 3 s of the gun', 30, (_g, s) => {
      if (s.tack !== 'port') return lost('Started on starboard', 'This one is a port-tack start: cross the line on port near the pin.', { score: s.late });
      if (s.fromPin > 4) return lost(`${s.fromPin.toFixed(1)} lengths from the pin`, 'Cross nearer the pin, where the bias pays most.', { score: s.late });
      const stars = starsFor(s.late, [1, 2, 3]);
      return stars ? won(`Port-tack start, ${lateText(s.late)}`, `You crossed ${s.fromPin.toFixed(1)} lengths from the pin.`, { stars, score: s.late })
        : lost(`Port start, ${lateText(s.late)}`, 'Right idea, but late. Trigger a little earlier.', { score: s.late });
    }, 4),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: timedStart({ tack: 'port', margin: 0.4, before: holdForLine(0.1, 2.0, 'port'), duck: true }),
    demoSeeds: [7, 8, 4],
    mistakeRule: '',
  },
  {
    kind: 'drill', id: 'crowded', group: 'Tactics', title: 'Crowded line',
    blurb: 'Eight national-level skippers. Start on time with clear air.',
    brief: 'A full line of strong skippers. Find a gap and start on time with clear air.',
    tip: 'Set up early with a gap to leeward, defend it by sitting a little low, and accelerate into it. Bad air from a boat to windward and ahead slows you right down.',
    steps: ["Pick a spot on the line early, and keep a gap on your left (to leeward).", "Protect the gap by sitting a little lower (further from the wind) than the boat beside you.", "At about 5 seconds to go, turn down into the gap and pull the sail right in to speed up.", "Stay out of the wind shadow of boats ahead and to windward: their sails slow you right down."],
    sticks: { sail: "Out while you wait; right in when you go.", rudder: "Small moves to hold your spot and your gap." },
    card: { cues: ['Pick your spot early', 'Keep a gap on your left: sit a little low', 'Go into the gap at 5 seconds'], sail: { at: 'in', move: 'go' }, rudder: 'hold', picture: { kind: 'start', v: 'gap', label: 'defend the gap' } },
    scene: () => ({
      origin: 'line', preStart: 50,
      boats: [
        { role: 'You', at: [0, -5], hdg: 300, spd: 0.3, helm: 'player', persona: 'steady', level: 'world' },
        ...(['pin', 'squeezer', 'steady', 'luffer', 'gambler', 'builder', 'shifty', 'careful'] as const).map((p, i): SceneBoat => ai(['Pin hunter', 'Squeezer', 'Steady', 'Leeward luffer', 'Gambler', 'Speed builder', 'Shift player', 'Conservative'][i], [-8 + i * 2.3, -4.5 - (i % 2) * 2], p, 'national')),
      ],
    }),
    goal: startGoal('Start within 2 s of the gun, in clear air 8 s later', 50, (g, s) => {
      const clear = g.player.shadow < 0.08;
      const stars = !clear ? Math.min(1, starsFor(s.late, [1, 2, 3])) : starsFor(s.late, [1, 2, 3]);
      const air = clear ? 'in clear air' : `losing ${Math.round(g.player.shadow * 100)}% of your wind to the boats around you`;
      return stars ? won(`Started ${lateText(s.late)}`, `Eight seconds later you were ${air}.`, { stars, score: s.late })
        : lost(`Started ${lateText(s.late)}`, `Too late in a fleet this good, and ${air}.`, { score: s.late });
    }, 8),
    scoreText: v => `${v.toFixed(1)} s late`,
    solution: 'ai',
    mistakeRule: '',
  },
  // ── Recovery ──
  {
    kind: 'drill', id: 'recall', group: 'Recovery', title: 'Over early: recover',
    blurb: "You're over at the gun. Get back, keep clear, and restart fast.",
    brief: "You're going to be over the line at the gun. Return, restart, and lose as little as you can.",
    tip: 'Bear away hard and run straight back across the line, keeping clear of everyone (Rule 21), then head up and start again on starboard.',
    steps: ["You'll be over at the gun. As soon as it goes, turn hard away from the wind (rudder stick left on starboard) and let the sail out.", "Run straight back across the line, keeping clear of every boat (Rule 21: until you're back, you have no rights).", "Once you're behind the line, turn up to close-hauled, pull the sail right in and start again on starboard."],
    sticks: { sail: "Out as you turn back, right in to start again.", rudder: "Hard left (on starboard) to turn back, then towards the wind to come up and start." },
    card: { cues: ['At the gun: turn hard away, sail out', 'Back below the line, keeping clear', 'Turn up, sail in, start again'], sail: { at: 'in', move: 'to-in' }, rudder: 'firm', picture: { kind: 'start', v: 'recall', label: 'back below the line, then go' } },
    scene: () => ({
      origin: 'line', preStart: 1.6,
      boats: [
        { role: 'You', at: [0, 0.25], hdg: CH_S, spd: 1, helm: 'player' },
        ai('Steady', [-5, -1.1], 'steady', 'state', CH_S, 0.9), ai('Conservative', [5, -1.0], 'careful', 'state', CH_S, 0.9), ai('Speed builder', [9, -1.3], 'builder', 'state', CH_S, 0.9),
      ],
    }),
    goal: {
      text: 'Return below the line and start again, keeping clear of everyone', seconds: 26,
      check: g => {
        const f = fouled(g) ?? rule14(g); if (f) return f;
        const s = startFacts(g);
        if (!s) return null;
        const stars = starsFor(s.late, [4, 7, 11]);
        return stars ? won(`Restarted ${s.late.toFixed(1)} s after the gun`, 'Quick and clean: you returned without getting in anyone\'s way (Rule 21).', { stars, score: s.late })
          : lost(`Restarted ${s.late.toFixed(1)} s after the gun`, 'Clean, but slow. Turn back straight away and dip the line close to where you are.', { score: s.late });
      },
      final: () => lost('Still over', 'Return completely to the pre-start side, then start (Rule 29.1).'),
      progress: g => (g.player.started ? null : g.player.returning ? 'Below the line: start again' : g.race.t >= g.race.gunT ? 'Recall! Get back below the line' : null),
    },
    scoreText: v => `restart +${v.toFixed(1)} s`,
    solution: recallAndRestart(),
    mistake: hold(CH_S),
    mistakeRule: '',
  },
];

export function findDrill(id: string): Drill | null { return DRILLS.find(d => d.id === id) ?? null; }

export type { SceneDef };
