// The Rules Academy: six modules of situations, each with a diagram drawn by the engine, a question,
// the ruling in plain English and the radio sailing difference. Most can be played out on the water
// against the same referee that judges races. Rules are the Racing Rules of Sailing 2025–2028 as
// changed by Appendix E (radio sailing). This is a learning aid, not a substitute for the rulebook.
import type { Race } from '../engine';
import type { Boat } from '../types';
import { vmgAngles } from '../classes';
import { bearing, dir, dist, dot, n180, n360, sub } from '../math';
import { bankAhead, hullGap } from '../physics';
import { easedSheet } from '../ai';
import { PlanFn, SceneDef, Step, closeHauled, hold, onTack, running, until, when } from '../scene';
import { dhypot } from '../dmath';
import {
  SceneSpec, answersHail, cleanFor, contact, fouled, hailed, hailsRoomToTack, lost, penaltyTurn, protestHail,
  recallAndRestart, rule14, startFacts, timedStart, won,
} from './common';

export interface Answer { text: string; correct?: boolean }

export interface Situation {
  id: string;
  title: string;
  /** The rules it's about; the first one is the one "Read the rule" opens. */
  rules: string[];
  /** The situation, in words. */
  text: string;
  question: string;
  answers: Answer[];
  /** The ruling, shown once you answer. */
  ruling: string;
  /** What's different in radio sailing, if anything. */
  rc?: string;
  /** Diagram labels by role (the player's boat is "You"). */
  labels: Record<string, string>;
  scene: (seed: number) => SceneDef;
  /** The diagram: your boat sailed by this plan for this long, tracks drawn. */
  diagram: { plan?: PlanFn | 'ai'; seconds: number };
  /** Play it out on the water. */
  play?: Omit<SceneSpec, 'kind' | 'id' | 'title' | 'scene'>;
}

export interface RulesModule {
  id: string;
  n: number;
  title: string;
  /** Short list of the rules covered. */
  rules: string;
  blurb: string;
  situations: Situation[];
}

// Headings with the wind from 0°: close-hauled about 42.5° off it, running about 165° off.
const CH_S = 317.5, CH_P = 42.5, RUN_S = 195, RUN_P = 165;

// ───────────────────────── lesson scripts ─────────────────────────

const find = (race: Race, role: string): Boat => (role === 'player' ? race.player! : race.boats.find(o => o.name === role)!);

/** Hold course until she's `fromL` lengths away, bear away round her stern (about a length behind),
 *  then `after` once we've crossed behind her. Never tacks or steers into the no-go zone. */
const duckRole = (role: string, after: PlanFn, gapL = 1.15, fromL = 3.4): PlanFn => (t, b, race, me) => {
  const o = find(race, role);
  const L = b.cls.loa;
  const rel = sub(b, o);
  const side = Math.sign(dir(o.hdg).x * rel.y - dir(o.hdg).y * rel.x); // which side of her track we're on
  if (me.memo.ducked) return after(t, b, race, me);
  if (!me.memo.ducking) {
    if (hullGap(b, o) > fromL * L) return after(t, b, race, me);
    me.memo.ducking = 1; me.memo.side0 = side;
  }
  // Crossed behind her (now on the other side of her track, astern of her), or she's well clear: done.
  const behind = dot(rel, dir(o.hdg)) < 0;
  if ((side !== me.memo.side0 && behind) || hullGap(b, o) > (fromL + 1.5) * L) { me.memo.ducked = 1; return after(t, b, race, me); }
  // Aim behind where her stern will be when we get there.
  const lead = Math.min(4, dhypot(rel.x, rel.y) / Math.max(0.3, b.spd)) * 0.8;
  const ov = dir(o.hdg), back = dir(o.hdg + 180);
  const aim = { x: o.x + ov.x * o.spd * lead + back.x * gapL * L, y: o.y + ov.y * o.spd * lead + back.y * gapL * L };
  const up = vmgAngles(b.cls, b.tws).up + 1.5;
  let hdg = bearing(b, aim);
  const twa = n180(b.twd - hdg);
  const sameSide = b.tack === 'stbd' ? twa > 0 : twa < 0;
  if (!sameSide || Math.abs(twa) < up) hdg = onTack(b, b.tack, up);
  return { hdg, avoid: true, intent: `Ducking ${o.isPlayer ? 'you' : o.name}` };
};

/** Hand the boat to an AI skipper from here. */
const aiFromHere = (gate?: 0 | 1): PlanFn => (_t, b) => ({ hdg: b.hdg, ai: { level: 'state', gate } });

/** Close-hauled, then a slow luff to `twa` from `start` at `rate` °/s, held until `back`, then close-hauled again. */
const slowLuff = (start: number, twa: number, rate: number, back: number): PlanFn => (t, b) => {
  const up = vmgAngles(b.cls, b.tws).up + 1.5;
  if (t < start || t > back) return { hdg: onTack(b, 'stbd', up) };
  return { hdg: onTack(b, 'stbd', Math.max(twa, up - (t - start) * rate)), intent: 'Luffing' };
};

/** Windward boat keeping clear of a luffing leeward boat: stay at least as high as she is. */
const keepUpWith = (role: string): PlanFn => (_t, b, race) => {
  const o = find(race, role);
  const up = vmgAngles(b.cls, b.tws).up + 1.5;
  const mine = onTack(b, 'stbd', up);
  const want = n180(o.hdg - mine) > 0 ? n360(o.hdg + 4) : mine;
  return { hdg: want, intent: 'Keeping clear', avoid: want !== mine };
};

/** Hold a heading, but swerve hard (Rule 14) once she is about to hit us. */
const holdThenAvoid = (hdg: number, role: string, swerve: number, within = 1.5, after?: PlanFn): PlanFn => (t, b, race, me) => {
  const o = find(race, role);
  if (!me.memo.swerved && hullGap(b, o) < within * b.cls.loa) me.memo.swerved = race.t;
  if (me.memo.swerved) {
    if (race.t - (me.memo.swerved as number) < 2.6) return { hdg: n360(hdg + swerve), avoid: true, intent: 'Avoiding contact' };
    if (after) return after(t, b, race, me);
  }
  return { hdg };
};

/** A boat that keeps a steady course whatever happens (she isn't looking). */
const blind = (hdg: number, sheet?: number): PlanFn => () => ({ hdg, sheet, intent: 'Not looking' });

/** Running slowly on a gybe, luffing only to keep clear of a boat to leeward that luffs her. */
const slowRunner = (tack: 'port' | 'stbd', sheet: number): PlanFn => (_t, b, race) => {
  const p = race.player!;
  const down = vmgAngles(b.cls, b.tws).down;
  const g = hullGap(b, p);
  // Is the player to leeward, close, and heading up towards us?
  const lee = tack === 'stbd' ? dir(b.hdg - 90) : dir(b.hdg + 90);
  const isLee = dot(sub(p, b), lee) > 0;
  const pTwa = Math.abs(p.twa);
  if (isLee && g < 0.9 * b.cls.loa && pTwa < down - 18) return { hdg: onTack(b, tack, Math.max(95, pTwa - 6)), sheet: 0.4, avoid: true, intent: 'Keeping clear' };
  return { hdg: onTack(b, tack, down), sheet, intent: 'Running' };
};

const gate = (race: Race) => race.course.byId.GP.p;

// ───────────────────────── 1. Right of way ─────────────────────────

const m1: RulesModule = {
  id: 'right-of-way', n: 1, title: 'Right of way', rules: 'Rules 10, 11, 12 and 14',
  blurb: 'Who keeps clear of whom when two boats meet.',
  situations: [
    {
      id: 'port-starboard', title: 'Port meets starboard', rules: ['10'],
      text: 'You are on port tack, beating to mark 1. Orange is on starboard and you are on a collision course.',
      question: 'Who has to keep clear?',
      answers: [
        { text: 'You, on port', correct: true },
        { text: 'Orange, on starboard' },
        { text: 'Whichever boat is further behind' },
      ],
      ruling: 'Rule 10: on opposite tacks, a port-tack boat keeps clear of a starboard-tack boat. Decide early: cross only with a clear length to spare, otherwise bear away and duck behind her, or tack before you get close.',
      labels: { player: 'You · port', Orange: 'Orange · starboard' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [-3.6, -13], hdg: CH_P, helm: 'player' },
          { role: 'Orange', at: [3.6, -13], hdg: CH_S, helm: 'ai', persona: 'steady' },
        ],
      }),
      diagram: { plan: duckRole('Orange', closeHauled('port')), seconds: 10 },
      play: {
        brief: "You're on port. Orange is on starboard and you're heading for the same bit of water.",
        tip: 'Bear away a little and aim about a length behind her stern, then come back up to close-hauled once she has passed. Or tack early, well before you meet.',
        goal: cleanFor('Keep clear of Orange: she is on starboard', 15, won('You kept clear', 'Port gives way to starboard (Rule 10). A small duck costs far less than a penalty turn.')),
        solution: duckRole('Orange', closeHauled('port')),
        mistake: closeHauled('port'),
        mistakeRule: '10',
      },
    },
    {
      id: 'windward-leeward', title: 'Windward and leeward', rules: ['11', '16.1'],
      text: "You and Orange are on starboard, overlapped. You're the windward boat. Orange starts to luff, slowly.",
      question: 'What must you do?',
      answers: [
        { text: 'Keep clear: luff with her', correct: true },
        { text: 'Hold your course: she must not change course near you' },
        { text: 'Hail "Starboard!"' },
      ],
      ruling: 'Rule 11: when boats on the same tack are overlapped, the windward boat keeps clear of the leeward boat. Orange may luff, but because she has right of way and is changing course she must give you room to keep clear (Rule 16.1), so she must do it slowly enough for you to respond.',
      labels: { player: 'You · windward', Orange: 'Orange · leeward' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [0.69, -13.84], hdg: CH_S, helm: 'player' },
          { role: 'Orange', at: [0, -14], hdg: CH_S, helm: slowLuff(1.8, 27, 4.5, 11) },
        ],
      }),
      diagram: { plan: keepUpWith('Orange'), seconds: 9 },
      play: {
        brief: "You're overlapped to windward of Orange on starboard. Watch her: she's about to luff.",
        tip: 'As soon as her bow comes up, come up with her and keep at least half a length of space. When she bears away again, so can you.',
        goal: cleanFor('Keep clear of Orange as she luffs', 14, won('You kept clear', 'The windward boat keeps clear (Rule 11), and Orange luffed slowly enough to give you room (Rule 16.1).')),
        solution: keepUpWith('Orange'),
        mistake: hold(CH_S),
        mistakeRule: '11',
      },
    },
    {
      id: 'clear-astern', title: 'Clear astern', rules: ['12'],
      text: "You and Orange are both on starboard. She's a few lengths ahead and slower, and you're closing on her fast.",
      question: 'Who has to keep clear?',
      answers: [
        { text: 'You: the boat clear astern keeps clear', correct: true },
        { text: 'Orange: the slower boat must let you through' },
        { text: 'Nobody until you overlap' },
      ],
      ruling: 'Rule 12: when boats on the same tack are not overlapped, the boat clear astern keeps clear of the boat clear ahead. Steer round her early, to leeward or to windward, and remember that once you overlap to windward you must keep clear under Rule 11.',
      labels: { player: 'You · clear astern', Orange: 'Orange · clear ahead' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [2.03, -14.21], hdg: CH_S, spd: 1, helm: 'player' },
          { role: 'Orange', at: [0, -12], hdg: CH_S, spd: 0.65, helm: (_t, b) => ({ hdg: onTack(b, 'stbd', vmgAngles(b.cls, b.tws).up + 1.5), sheet: 0.55, intent: 'Slow' }) },
        ],
      }),
      diagram: { plan: until(4.5, hold(CH_S - 13), closeHauled('stbd')), seconds: 12 },
      play: {
        brief: "You're on starboard and catching Orange, who is clear ahead of you and slow.",
        tip: 'Decide early which side to pass. Bear away a little to go through to leeward, with a good half length of space, then come back up to close-hauled.',
        goal: cleanFor('Get past Orange without touching her', 16, won('Clean overtake', 'The boat clear astern keeps clear (Rule 12). You chose your side early and left room.')),
        solution: until(4.5, hold(CH_S - 13), closeHauled('stbd')),
        mistake: hold(CH_S),
        mistakeRule: '12',
      },
    },
    {
      id: 'avoid-contact', title: 'Avoiding contact', rules: ['14'],
      text: "You're on starboard. Orange, on port, is heading straight for you and isn't changing course.",
      question: 'You have right of way. What should you do?',
      answers: [
        { text: 'Hold your course until it is clear she will not keep clear, then avoid her, and protest', correct: true },
        { text: 'Hold your course: she has to keep clear, so contact is her fault' },
        { text: 'Tack away straight away to be safe' },
      ],
      ruling: "Rule 14: every boat must avoid contact if reasonably possible, including the right-of-way boat. But a right-of-way boat needn't act until it is clear the other boat isn't keeping clear. Then change course to avoid her, and hail a protest.",
      labels: { player: 'You · starboard', Orange: 'Orange · port, not looking' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [3.6, -13], hdg: CH_S, helm: 'player' },
          { role: 'Orange', at: [-3.6, -13], hdg: CH_P, helm: blind(CH_P), forgets: true },
        ],
      }),
      diagram: { plan: holdThenAvoid(CH_S, 'Orange', -40, 1.5, closeHauled('stbd')), seconds: 10 },
      play: {
        brief: "You're on starboard. Orange is on port and doesn't seem to have seen you.",
        tip: "Hold your course while she still has time to keep clear. When it's clear she won't, bear away hard to pass behind her. Then hail a protest (H).",
        goal: cleanFor('Avoid Orange, whoever is in the right', 14, won('Contact avoided', "Orange broke Rule 10, but you kept clear of trouble (Rule 14). A protest hail is next: press H and you'll hail your sail number, \"protest\" and hers.")),
        solution: holdThenAvoid(CH_S, 'Orange', -40, 1.5, closeHauled('stbd')),
        mistake: hold(CH_S),
        // Orange breaks Rule 10, but you fail under Rule 14 for not avoiding the contact.
        mistakeRule: '10',
      },
    },
  ],
};

// ───────────────────────── 2. Changing course ─────────────────────────

const m2: RulesModule = {
  id: 'changing-course', n: 2, title: 'Changing course', rules: 'Rules 13, 15, 16 and 17',
  blurb: 'Tacking, gaining right of way, and what you may do with it.',
  situations: [
    {
      id: 'tacking', title: 'Tacking close to another boat', rules: ['13', '15'],
      text: "You're on port and can't cross Orange, who is on starboard. You decide to tack onto starboard just ahead of her and to leeward.",
      question: 'While you are turning, after head to wind and before close-hauled, who keeps clear?',
      answers: [
        { text: 'You, the boat that is tacking', correct: true },
        { text: 'Orange, because you will be the leeward boat' },
        { text: 'Orange, because she is on starboard' },
      ],
      ruling: "Rule 13: after passing head to wind, a boat keeps clear of others until she is close-hauled. Once you're close-hauled on starboard to leeward, Orange must keep clear (Rule 11), but because you gained right of way by your own tack you must first give her room to do it (Rule 15). Tack early enough that she can.",
      labels: { player: 'You · tacking', Orange: 'Orange · starboard' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [-2.6, -12.4], hdg: CH_P, helm: 'player' },
          { role: 'Orange', at: [3.6, -13.4], hdg: CH_S, helm: 'ai', persona: 'steady' },
        ],
      }),
      diagram: { plan: when((_t, b, r) => dist(b, find(r, 'Orange')) < 3.6 * b.cls.loa, closeHauled('port'), closeHauled('stbd')), seconds: 10 },
      play: {
        brief: "You're on port and can't cross Orange. Tack onto starboard ahead of her and to leeward: the lee-bow.",
        tip: 'Tack about three lengths before you would meet her, so you are close-hauled and up to speed before she arrives. Too late and you foul her while tacking.',
        goal: {
          text: 'Tack onto starboard ahead of Orange without fouling her', seconds: 14,
          check: g => {
            const f = fouled(g) ?? rule14(g); if (f) return f;
            const p = g.player;
            if (p.lastHtwT > 0 && g.race.t - p.lastHtwT < 4) g.memo.minGap = Math.min((g.memo.minGap as number) ?? 99, hullGap(p, find(g.race, 'Orange')) / p.cls.loa);
            return null;
          },
          final: g => {
            if (!(g.player.tack === 'stbd' && Math.abs(g.player.twa) < 90)) return lost('No tack', 'You stayed on port. Tack onto starboard about three lengths before you meet her.');
            if (((g.memo.minGap as number) ?? 99) < 0.4) return lost('Too close', `You came within ${(((g.memo.minGap as number) ?? 0) * 100).toFixed(0)}% of a hull length of her while tacking. Until you're close-hauled you must keep clear (Rule 13), and then give her room to keep clear (Rule 15). Tack earlier.`);
            return won('Lee-bow done', 'You finished your tack before she arrived (Rule 13) and gave her room to keep clear (Rule 15). Now she is in your backwind.');
          },
        },
        solution: when((_t, b, r) => dist(b, find(r, 'Orange')) < 3.6 * b.cls.loa, closeHauled('port'), closeHauled('stbd')),
        mistake: when((_t, b, r) => dist(b, find(r, 'Orange')) < 1.7 * b.cls.loa, closeHauled('port'), closeHauled('stbd')),
        mistakeRule: '',
      },
    },
    {
      id: 'hunting', title: "Don't hunt the ducker", rules: ['16.1'],
      text: "You're on starboard. Orange, on port, is bearing away to pass behind you.",
      question: 'May you bear away towards her?',
      answers: [
        { text: 'Only if she still has room to keep clear; holding your course is safest', correct: true },
        { text: 'Yes: you have right of way, so you can steer where you like' },
        { text: 'Yes, as long as you hail first' },
      ],
      ruling: 'Rule 16.1: when a right-of-way boat changes course, she gives the other boat room to keep clear. Bearing away at a boat that is ducking you, so that she can no longer get round your stern, breaks it.',
      labels: { player: 'You · starboard', Orange: 'Orange · ducking' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [3.6, -13], hdg: CH_S, helm: 'player' },
          { role: 'Orange', at: [-3.6, -13], hdg: CH_P, helm: duckRole('player', closeHauled('port'), 1.0) },
        ],
      }),
      diagram: { plan: hold(CH_S), seconds: 10 },
      play: {
        brief: "You're on starboard. Orange is on port and ducking behind you.",
        tip: 'Hold your course and let her go behind. If you must change course, do it slowly enough that she can still keep clear.',
        goal: cleanFor('Let Orange duck behind you', 13, won('Well held', 'You kept a steady course, so Orange could keep clear (Rule 16.1).')),
        solution: hold(CH_S),
        mistake: until(4.2, hold(CH_S), hold(CH_S - 40)),
        mistakeRule: '16.1',
      },
    },
    {
      id: 'gybe-onto-starboard', title: 'Gybing onto starboard', rules: ['15', '10'],
      text: "You're running on port gybe with Orange just to leeward of you, also on port. You want to gybe onto starboard.",
      question: 'If you gybe now, who has right of way, and what do you owe her?',
      answers: [
        { text: 'You will, on starboard, but you must first give her room to keep clear', correct: true },
        { text: 'You will, so she must keep clear at once' },
        { text: 'She keeps right of way until you are clear ahead' },
      ],
      ruling: "Rule 10 gives the starboard boat right of way, but Rule 15 says a boat that gets right of way by her own action must initially give the other boat room to keep clear. Gybe where she has time and space to respond, or wait until she's clear.",
      labels: { player: 'You · port gybe', Orange: 'Orange · port gybe' },
      scene: () => ({
        origin: 'GP',
        boats: [
          { role: 'You', at: [0, 12], hdg: RUN_P, leg: 2, helm: 'player' },
          { role: 'Orange', at: [-0.63, 11.47], hdg: RUN_P, leg: 2, helm: 'ai', persona: 'steady', gate: 0 },
        ],
      }),
      diagram: { plan: until(4, (_t, b) => ({ hdg: onTack(b, 'port', 165), sheet: 0.85 }), running('stbd')), seconds: 10 },
      play: {
        brief: "You're on port gybe with Orange close to leeward. You need to gybe onto starboard.",
        tip: "Don't gybe straight into her. Slow down (sheet in) and let her get clear ahead, then gybe behind her.",
        goal: {
          text: 'Gybe onto starboard without fouling Orange', seconds: 16,
          check: g => fouled(g) ?? rule14(g),
          final: g => (g.player.tack === 'stbd'
            ? won('Clean gybe', 'You gave Orange room before you took right of way (Rule 15).')
            : lost('Still on port', 'You never gybed. Let her get clear, then gybe onto starboard.')),
        },
        solution: until(4, (_t, b) => ({ hdg: onTack(b, 'port', 165), sheet: 0.85 }), running('stbd')),
        mistake: running('stbd'),
        mistakeRule: '15|16.1',
      },
    },
    {
      id: 'proper-course', title: 'Overtaking to leeward', rules: ['17'],
      text: "On the run, you came up from clear astern of Orange and you're now overlapped within two lengths to leeward of her.",
      question: 'May you luff her?',
      answers: [
        { text: 'No, not above your proper course while that overlap lasts', correct: true },
        { text: 'Yes: the leeward boat always has right of way' },
        { text: 'Yes, as long as you luff slowly' },
      ],
      ruling: 'Rule 17: a boat that becomes overlapped within two hull lengths to leeward of a boat on the same tack, from clear astern, must not sail above her proper course while they stay on the same tack and overlapped within that distance. You still have right of way under Rule 11; you just may not luff her. The 2025–2028 rules removed the old exception for overlaps that begin while the windward boat is tacking.',
      labels: { player: 'You · overtaking', Orange: 'Orange · slower' },
      scene: () => ({
        origin: 'GP',
        boats: [
          { role: 'You', at: [-1.33, 26.51], hdg: RUN_S, spd: 1, leg: 2, helm: 'player' },
          { role: 'Orange', at: [-2.0, 24], hdg: RUN_S, spd: 0.65, leg: 2, helm: slowRunner('stbd', 0.55) },
        ],
      }),
      diagram: { plan: hold(RUN_S - 9), seconds: 14 },
      play: {
        brief: "You're running fast and catching Orange, who is slower. You'll pass to leeward of her.",
        tip: "Keep your course to the gate and sail through to leeward. Don't luff her once you're overlapped: you came from astern within two lengths.",
        goal: {
          text: 'Pass Orange to leeward without luffing her', seconds: 22,
          check: g => fouled(g) ?? rule14(g),
          final: g => {
            const o = find(g.race, 'Orange');
            return dist(g.player, gate(g.race)) < dist(o, gate(g.race))
              ? won('Through to leeward', 'You passed on your proper course (Rule 17), so Orange never had to luff.')
              : lost('Not past yet', 'Keep sailing your course to the gate and you will roll through to leeward.');
          },
        },
        solution: hold(RUN_S - 9),
        mistake: until(9, hold(RUN_S - 9), hold(RUN_S + 55)),
        mistakeRule: '17',
      },
    },
  ],
};

// ───────────────────────── 3. Mark-room ─────────────────────────

const m3: RulesModule = {
  id: 'mark-room', n: 3, title: 'Mark-room', rules: 'Rule 18 and the 4-length zone',
  blurb: 'Who gets room at a mark, from when, and how much.',
  situations: [
    {
      id: 'opposite-tacks', title: 'Opposite tacks at mark 1', rules: ['18.1', '10'],
      text: "You're on port, close to mark 1. Orange is on starboard on the layline. You both reach the zone together and you're nearer the mark.",
      question: 'Does Orange have to give you mark-room?',
      answers: [
        { text: "No: Rule 18 doesn't apply between boats on opposite tacks on a beat, so you keep clear (Rule 10)", correct: true },
        { text: "Yes: you're inside her at the zone" },
        { text: 'Yes: you reached the zone first' },
      ],
      ruling: 'Rule 18.1: mark-room does not apply between boats on opposite tacks on a beat to windward. Port still keeps clear of starboard under Rule 10, right up to the mark. Duck her, then tack behind her onto the layline.',
      rc: 'In radio sailing the zone is 4 hull lengths.',
      labels: { player: 'You · port', Orange: 'Orange · starboard layline' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [1.35, -5.16], hdg: CH_P, helm: 'player' },
          { role: 'Orange', at: [4.73, -5.16], hdg: CH_S, helm: 'ai', persona: 'steady' },
        ],
      }),
      diagram: { plan: duckRole('Orange', aiFromHere(), 1.15, 99), seconds: 16 },
      play: {
        brief: "You're on port near mark 1. Orange is coming in on the starboard layline.",
        tip: 'Port keeps clear right up to the mark. Duck her, tack onto starboard behind her, and round.',
        goal: {
          text: 'Keep clear of Orange and round mark 1', seconds: 35,
          check: g => fouled(g) ?? rule14(g) ?? (g.player.legIndex > 0 ? won('Round mark 1', 'No mark-room on opposite tacks on a beat (Rule 18.1): you kept clear on port (Rule 10) and still got round.') : null),
          final: () => lost('Not round yet', 'Duck Orange, tack behind her and round mark 1, leaving it to port.'),
        },
        solution: duckRole('Orange', aiFromHere(), 1.15, 99),
        mistake: closeHauled('port'),
        mistakeRule: '10',
      },
    },
    {
      id: 'inside-leeward', title: 'Inside at the leeward mark', rules: ['18.2(a)'],
      text: 'You and Blue are on port gybe, overlapped, running to the gate mark 2p, which is left to port. Blue is inside you (nearer the mark), and you are outside and to leeward.',
      question: 'Who has to give room at the mark?',
      answers: [
        { text: 'You, the outside boat: Blue gets mark-room', correct: true },
        { text: "Blue: she's to windward, so she keeps clear" },
        { text: 'Neither: first to the mark goes first' },
      ],
      ruling: "Rule 18.2(a): when the first boat reaches the zone and they're overlapped, the outside boat gives the inside boat mark-room, even though the outside boat has right of way under Rule 11. Mark-room is room to sail to the mark and round it, not room to sail wherever she likes.",
      rc: 'In radio sailing the zone is 4 hull lengths.',
      labels: { player: 'You · outside', Blue: 'Blue · inside' },
      scene: () => ({
        origin: 'GP',
        boats: [
          { role: 'You', at: [-2.97, 5.54], hdg: RUN_P, leg: 2, helm: 'player', color: '#FB923C', gate: 0 },
          { role: 'Blue', at: [-2.0, 5.8], hdg: RUN_P, leg: 2, helm: 'ai', persona: 'steady', gate: 0, color: '#2A93FF' },
        ],
      }),
      diagram: { plan: 'ai', seconds: 14 },
      play: {
        brief: "You're outside Blue at the gate. She's overlapped inside you as you reach the zone.",
        tip: 'Slow down or swing wide so Blue can sail to the mark and round it, then round close behind her and tight out.',
        goal: {
          text: 'Give Blue room and round the gate after her', seconds: 30,
          check: g => fouled(g) ?? rule14(g) ?? (g.player.legIndex > 2 ? won('Room given', 'You were outside at the zone, so you gave Blue mark-room (Rule 18.2(a)) and rounded right behind her.') : null),
          final: () => lost('Not round yet', 'Give Blue room, then round the gate behind her.'),
        },
        solution: 'ai',
        mistake: (_t, b, race) => {
          const m = race.course.byId.GP.p, L = b.cls.loa;
          if (dist(b, m) > 1.4 * L && !race.player!.roundedAt.length) return { hdg: bearing(b, { x: m.x - 0.55 * L, y: m.y }) };
          return { hdg: 60 };
        },
        mistakeRule: '18.2(a)|18.2(c)',
      },
    },
    {
      id: 'clear-ahead', title: 'Clear ahead at the zone', rules: ['18.2(a)'],
      text: 'Blue reaches the zone of mark 1 clear ahead of Orange. Then Orange sails into an inside overlap, between Blue and the mark.',
      question: 'Who is entitled to mark-room?',
      answers: [
        { text: "Blue: she was clear ahead when she reached the zone", correct: true },
        { text: "Orange: she's inside now" },
        { text: "Orange: she's the leeward boat" },
      ],
      ruling: "Rule 18.2(a): if the boats aren't overlapped when the first one reaches the zone, the boat that hasn't reached it gives the other mark-room. That stays true even if an overlap begins later, so Orange must give Blue room to round.",
      rc: 'In radio sailing the zone is 4 hull lengths.',
      labels: { Blue: 'Blue · clear ahead', Orange: 'Orange · clear astern' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'Blue', at: [3.6, -4.2], hdg: CH_S, helm: 'ai', persona: 'steady', color: '#2A93FF' },
          { role: 'Orange', at: [4.6, -5.5], hdg: CH_S, helm: 'ai', persona: 'careful', color: '#FB923C' },
        ],
      }),
      diagram: { seconds: 12 },
    },
    {
      id: 'tack-in-zone', title: 'Tacking in the zone', rules: ['18.3'],
      text: "You're on port inside the zone of mark 1, which is left to port. Orange is on starboard, fetching the mark. You tack onto starboard just ahead of her.",
      question: 'What does Rule 18.3 say?',
      answers: [
        { text: "You must not make her sail above close-hauled to avoid you, and she needn't give you mark-room", correct: true },
        { text: "You're inside, so she must give you mark-room" },
        { text: "Nothing: once you're on starboard you have right of way" },
      ],
      ruling: "Rule 18.3: if a boat passes head to wind from port to starboard in the zone of a mark left to port, she must not make a boat that has been on starboard since entering the zone sail above close-hauled to avoid her, and Rule 18.2 doesn't give her mark-room from that boat. Duck the starboard boat and tack behind her, or tack onto the layline before the zone.",
      rc: 'In radio sailing the zone is 4 hull lengths, so there is more of it to get wrong.',
      labels: { player: 'You · port, in the zone', Orange: 'Orange · starboard, fetching' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [1.6, -3.4], hdg: CH_P, helm: 'player' },
          { role: 'Orange', at: [4.46, -4.86], hdg: CH_S, helm: 'ai', persona: 'steady' },
        ],
      }),
      diagram: { plan: duckRole('Orange', aiFromHere(), 1.15, 99), seconds: 14 },
      play: {
        brief: "You're on port inside the zone at mark 1. Orange is on starboard, fetching the mark.",
        tip: 'Tacking in front of her is a trap. Bear away behind her, then tack onto starboard in her wake and round.',
        goal: {
          text: 'Round mark 1 without breaking Rule 18.3', seconds: 30,
          check: g => fouled(g) ?? rule14(g) ?? (g.player.legIndex > 0 ? won('Round, legally', 'You stayed out of Orange\'s way (Rules 10 and 18.3) and still rounded close behind her.') : null),
          final: () => lost('Not round yet', 'Duck Orange, tack behind her, and round mark 1.'),
        },
        solution: duckRole('Orange', aiFromHere(), 1.15, 99),
        mistake: until(2.3, hold(CH_P), closeHauled('stbd')),
        mistakeRule: '18.3|13|15',
      },
    },
  ],
};

// ───────────────────────── 4. Starting ─────────────────────────

const m4: RulesModule = {
  id: 'starting', n: 4, title: 'Starting', rules: 'Rules 29, 30 and 31, and recalls',
  blurb: 'Over early, touching a mark, and barging at the start.',
  situations: [
    {
      id: 'over-early', title: 'Over at the gun', rules: ['29.1', '21'],
      text: "At the starting signal your bow is over the line.",
      question: 'What happens, and what must you do?',
      answers: [
        { text: 'You are hailed "Recall" with your sail number; return fully below the line, keep clear of others, then start', correct: true },
        { text: 'Take a One-Turn Penalty and carry on' },
        { text: 'Nothing, unless the race officer stops the race' },
      ],
      ruling: 'Rule 29.1 with Appendix E: the race officer promptly hails "Recall" and the sail numbers of boats over early. You must return completely to the pre-start side and then start. While you are returning you keep clear of every boat that is not (Rule 21).',
      rc: 'In radio sailing the recall is hailed with your sail number, digit by digit.',
      labels: { player: 'You · over', Grey: 'Grey', Green: 'Green' },
      scene: () => ({
        origin: 'line', preStart: 1.6,
        boats: [
          { role: 'You', at: [0, 0.25], hdg: CH_S, spd: 1, helm: 'player' },
          { role: 'Grey', at: [-5, -1.1], hdg: CH_S, helm: 'ai', persona: 'steady', color: '#94A3B8' },
          { role: 'Green', at: [5, -1.0], hdg: CH_S, helm: 'ai', persona: 'careful', color: '#34D399' },
        ],
      }),
      diagram: { plan: recallAndRestart(), seconds: 14 },
      play: {
        brief: "You're over the line at the gun. Get back and start again.",
        tip: 'Bear away hard, run back across the line, then head up and start. While you are returning you keep clear of everyone (Rule 21).',
        goal: {
          text: 'Return below the line and start again, keeping clear', seconds: 22,
          check: g => {
            const f = fouled(g) ?? rule14(g); if (f) return f;
            const s = startFacts(g);
            return s ? won('Back in the race', `You restarted ${s.late.toFixed(1)} s after the gun. Returning boats keep clear of everyone (Rule 21) until they start again.`) : null;
          },
          final: () => lost('Still over', 'You must return completely to the pre-start side of the line and then start (Rule 29.1).'),
        },
        solution: recallAndRestart(),
        mistake: closeHauled('stbd'),
        mistakeRule: '',
      },
    },
    {
      id: 'touch-start-mark', title: 'Touching the starting mark', rules: ['31'],
      text: 'You squeeze in to start right beside the starboard-end mark and brush it.',
      question: 'Is that a penalty?',
      answers: [
        { text: 'Yes: Rule 31 covers starting marks too. Take a One-Turn Penalty', correct: true },
        { text: "No: Rule 31 only applies once you've started" },
        { text: 'Only if you gained an advantage' },
      ],
      ruling: 'Rule 31: while racing, a boat must not touch a mark, and that includes a starting mark before she starts. In radio sailing the penalty is a One-Turn Penalty (Appendix E).',
      rc: 'Appendix E: a One-Turn Penalty for touching a mark.',
      labels: { player: 'You' },
      scene: () => ({
        origin: 'stbd', preStart: 9,
        boats: [{ role: 'You', at: [1.0, -2.3], hdg: 300, spd: 0.4, helm: 'player' }],
      }),
      diagram: { plan: timedStart({ margin: 0.4 }), seconds: 12 },
      play: {
        brief: "Start right at the starboard end, on time, without touching the mark.",
        tip: 'Line up so your close-hauled course passes half a length inside the mark, not at it.',
        goal: {
          text: 'Start within 2.5 lengths of the starboard end without touching it', seconds: 16,
          check: g => {
            const f = fouled(g); if (f) return f;
            const s = startFacts(g);
            if (!s) return null;
            if (s.fromStbd > 2.5) return lost('Too far down the line', `You started ${s.fromStbd.toFixed(1)} lengths from the end. Aim half a length inside the mark.`);
            return won('Right at the end', `Started ${s.late.toFixed(1)} s after the gun, ${s.fromStbd.toFixed(1)} lengths from the mark, without touching it (Rule 31).`);
          },
          final: () => lost('Not started', 'Cross the line between the marks to start.'),
        },
        solution: timedStart({ margin: 0.4 }),
        mistake: (t, b, race) => (t < 3 ? { hdg: 100, sheet: 0.5 } : { hdg: bearing(b, race.course.start.stbd) }),
        mistakeRule: '31',
      },
    },
    {
      id: 'barging', title: 'No room at the starting mark', rules: ['11', '18'],
      text: 'Just before the start, you come in to windward of Orange at the starboard end and want room between her and the starting mark.',
      question: 'Must Orange give you room?',
      answers: [
        { text: "No: the mark-room rules don't apply at a starting mark as boats approach to start. You keep clear (Rule 11)", correct: true },
        { text: "Yes: you're inside her at the mark" },
        { text: 'Yes, in the last 10 seconds' },
      ],
      ruling: "Section C (Rules 18 to 21's mark and obstruction rules) does not apply at a starting mark surrounded by water while boats are approaching it to start. So there's no mark-room for a \"barger\": as the windward boat you keep clear under Rule 11. Come in behind her instead.",
      labels: { player: 'You · windward', Orange: 'Orange · leeward' },
      scene: () => ({
        origin: 'stbd', preStart: 12,
        boats: [
          { role: 'You', at: [1.4, -3.2], hdg: CH_S, spd: 0.7, helm: 'player' },
          { role: 'Orange', at: [-0.9, -1.25], hdg: 300, spd: 0.15, helm: timedStart({ margin: 0.3 }) },
        ],
      }),
      diagram: { plan: when((_t, _b, r) => r.gunT - r.t < 2.2, (_t, b) => ({ hdg: onTack(b, 'stbd', 30), sheet: 0.05 }), closeHauled('stbd')), seconds: 16 },
    },
    {
      id: 'general-recall', title: 'General recall', rules: ['29.2'],
      text: "At the gun most of the fleet is over the line and the race officer can't tell who.",
      question: 'What happens?',
      answers: [
        { text: 'A general recall: the start is called off and run again', correct: true },
        { text: 'Every boat takes a One-Turn Penalty' },
        { text: 'The race carries on and the boats over are scored OCS' },
      ],
      ruling: "Rule 29.2 with Appendix E: if the race officer can't identify the boats over the line, or something went wrong with the start, they hail a general recall with two loud sounds, and the start is run again shortly afterwards.",
      rc: 'In radio sailing the general recall is hailed, with two sounds.',
      labels: { A: '', B: '', C: '', D: '', E: '' },
      scene: () => ({
        origin: 'line', preStart: 1.2,
        boats: [-6, -3, 0, 3, 6].map((x, i) => ({ role: 'ABCDE'[i], at: [x, 0.15 + (i % 2) * 0.25] as [number, number], hdg: CH_S, spd: 1, helm: closeHauled('stbd') })),
      }),
      diagram: { seconds: 4 },
    },
  ],
};

// ───────────────────────── 5. Obstructions and room to tack ─────────────────────────

const bankScene = (playerLeeward: boolean): SceneDef => ({
  origin: 'line',
  boats: [
    { role: playerLeeward ? 'You' : 'Orange', at: [-25, 6], hdg: CH_S, helm: playerLeeward ? 'player' : hailsRoomToTack('stbd') },
    { role: playerLeeward ? 'Orange' : 'You', at: [-24.37, 6.71], hdg: CH_S, helm: playerLeeward ? answersHail('stbd') : 'player' },
  ],
});

const m5: RulesModule = {
  id: 'obstructions', n: 5, title: 'Obstructions and room to tack', rules: 'Rules 19, 20 and 22, and the radio hail',
  blurb: 'The bank, boats in the way, and boats that have lost control.',
  situations: [
    {
      id: 'hail-room-to-tack', title: 'Pinned at the bank', rules: ['20'],
      text: "You're close-hauled on starboard, almost at the bank. Orange is just to windward of you, so you can't tack without hitting her.",
      question: 'What can you do?',
      answers: [
        { text: 'Hail "Room to tack" with your sail number; she must respond, then you tack', correct: true },
        { text: 'Tack anyway: she has to keep clear' },
        { text: 'Hail "Water!" and wait' },
      ],
      ruling: 'Rule 20.1: when you are close-hauled or above, approaching an obstruction, and will soon need a big change of course to avoid it, you may hail for room to tack. Orange must respond, by tacking as soon as possible or by replying "You tack" (Rule 20.2), and then you tack as soon as possible.',
      rc: 'Appendix E: the hail includes "room", "tack" and your sail number, for example "Room to tack, zero one".',
      labels: { player: 'You · leeward', Orange: 'Orange · windward' },
      scene: () => bankScene(true),
      diagram: { plan: hailsRoomToTack('stbd'), seconds: 9 },
      play: {
        brief: "You're on starboard, running out of water at the bank, with Orange just to windward.",
        tip: "Press H to hail \"Room to tack\" with your sail number before you get too close. When she tacks, press T and tack yourself.",
        goal: {
          text: 'Hail for room to tack, then tack away from the bank', seconds: 16,
          check: g => {
            const f = fouled(g) ?? rule14(g); if (f) return f;
            const p = g.player;
            if (p.tack === 'port' && Math.abs(p.twa) < 90 && p.tackingSince === null) {
              const asked = g.race.events.some(e => e.type === 'room-to-tack' && e.from === p.id);
              return asked ? won('Off the bank', 'You hailed for room to tack (Rule 20.1, with your sail number as Appendix E requires), Orange tacked, and so did you.')
                : won('Off the bank', 'You got out, but the rules give you a better way: hail "Room to tack" (H) and make her tack.');
            }
            return null;
          },
          final: () => lost('Still on the bank', 'Hail for room to tack (H) a few lengths before the bank, then tack when she does.'),
        },
        solution: hailsRoomToTack('stbd'),
        mistake: when((_t, b, r) => bankAhead(b, r.course) < 2.6 * b.cls.loa, closeHauled('stbd'), closeHauled('port')),
        mistakeRule: '13',
      },
    },
    {
      id: 'answer-room-to-tack', title: 'Hailed for room to tack', rules: ['20.2'],
      text: 'Orange, just to leeward of you, is close-hauled and almost at the bank. She hails "Room to tack, zero five".',
      question: 'What must you do?',
      answers: [
        { text: 'Respond at once: tack as soon as possible, or reply "You tack" and then give her room', correct: true },
        { text: "Hold your course: you're the right-of-way boat" },
        { text: "Only respond if you agree she's at an obstruction" },
      ],
      ruling: 'Rule 20.2: the hailed boat must respond even if she thinks the hail is wrong, either by tacking as soon as possible, or by replying "You tack" and then giving the hailing boat room to tack and avoid her. If you disagree, protest afterwards.',
      rc: 'Appendix E: the hail must include "room", "tack" and her sail number.',
      labels: { player: 'You · windward', Orange: 'Orange · hailing' },
      scene: () => bankScene(false),
      diagram: { plan: answersHail('stbd'), seconds: 9 },
      play: {
        brief: "You're to windward of Orange, who is running out of water at the bank.",
        tip: 'When she hails, tack straight away (T). Or press H to reply "You tack", then keep clear while she tacks.',
        goal: {
          text: 'Respond to the room-to-tack hail', seconds: 14,
          check: g => {
            const f = fouled(g) ?? rule14(g); if (f) return f;
            const r = g.race.events.find(e => e.type === 'room-to-tack' && e.to === g.player.id);
            if (!r) return null;
            if (g.player.lastHtwT > r.t) return won('Room given', 'You tacked as soon as you could (Rule 20.2).');
            const yt = g.race.events.find(e => e.type === 'you-tack' && e.from === g.player.id);
            if (yt && g.race.t - yt.t > 6) return won('"You tack"', 'You replied "You tack" and gave her room to tack and keep clear (Rule 20.2(c)).');
            return null;
          },
          final: () => lost('No response', 'When a boat hails for room to tack, tack as soon as possible or reply "You tack".'),
        },
        solution: answersHail('stbd'),
        mistake: closeHauled('stbd'),
        mistakeRule: '20.2(c)',
      },
    },
    {
      id: 'you-tack', title: '"You tack"', rules: ['20.2'],
      text: 'Orange hails you for room to tack at the bank. Instead of tacking, you reply "You tack".',
      question: 'What happens next?',
      answers: [
        { text: 'She tacks as soon as possible, and you must give her room to tack and avoid you', correct: true },
        { text: 'She must bear away and gybe instead' },
        { text: 'You both hold course until one of you hits the bank' },
      ],
      ruling: 'Rule 20.2(c) and (d): having replied "You tack", you must give her room to tack and keep clear of you, usually by slowing or bearing away below her stern, and she must tack as soon as possible.',
      labels: { player: 'You · "You tack"', Orange: 'Orange · tacking' },
      scene: () => ({
        origin: 'line',
        boats: [
          { role: 'Orange', at: [-25, 6], hdg: CH_S, helm: hailsRoomToTack('stbd') },
          { role: 'You', at: [-24.37, 6.71], hdg: CH_S, helm: 'player' },
        ],
      }),
      diagram: {
        plan: (t, b, race, me) => {
          const r2t = race.events.find(e => e.type === 'room-to-tack');
          if (!r2t) return closeHauled('stbd')(t, b, race, me);
          if (race.t - r2t.t < 2.2) return { hdg: onTack(b, 'stbd', 30), sheet: 0.1, youTack: true };
          return { hdg: onTack(b, 'stbd', 120), sheet: 0.4 };
        },
        seconds: 10,
      },
    },
    {
      id: 'disabled-boat', title: 'A boat out of control', rules: ['22'],
      text: "Grey has lost radio control and is drifting right in your path. You're on starboard; she's lying on port.",
      question: 'Who keeps clear?',
      answers: [
        { text: 'You: avoid a disabled boat if you possibly can', correct: true },
        { text: "Grey: she's on port" },
        { text: 'Nobody: she should be retrieved first' },
      ],
      ruling: 'Appendix E changes Rule 22: if possible, a boat shall avoid a boat that is disabled, whatever the right of way. Her skipper should have hailed "(sail number) out of control" (E2.3), and she retires from the heat.',
      rc: 'Radio sailing only: a disabled boat is one that cannot continue in the heat.',
      labels: { player: 'You · starboard', Grey: 'Grey · out of control' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [3.0, -12], hdg: CH_S, helm: 'player' },
          { role: 'Grey', at: [0.3, -9.05], hdg: 60, helm: hold(60), disabled: true, color: '#94A3B8' },
        ],
      }),
      diagram: { plan: holdThenAvoid(CH_S, 'Grey', -24, 1.7, closeHauled('stbd')), seconds: 9 },
      play: {
        brief: "Grey is out of control and drifting in your path on the beat.",
        tip: 'Steer round her early and wide: she can\'t get out of your way and may drift into you.',
        goal: cleanFor('Get past Grey without touching her', 12, won('Avoided', 'Disabled boats must be avoided if possible (Rule 22, Appendix E).'), g => {
          const c = contact(g); return c ? lost('Rule 22: you hit a disabled boat', c.explanation, { incident: c }) : null;
        }),
        solution: holdThenAvoid(CH_S, 'Grey', -24, 1.7, closeHauled('stbd')),
        mistake: hold(CH_S),
        mistakeRule: '22',
      },
    },
    {
      id: 'room-at-obstruction', title: 'Room at an obstruction', rules: ['19.2'],
      text: "You and Orange are on starboard, overlapped, closing on a drifting boat. You're to leeward; Orange is inside you, nearer the drifting boat, and you'll both pass below it.",
      question: 'Who must give room?',
      answers: [
        { text: 'You, the outside boat, must give Orange room to pass between you and it', correct: true },
        { text: "Nobody: you're the leeward boat, so Orange keeps clear" },
        { text: 'Orange must drop behind you' },
      ],
      ruling: "Rule 19.2(b): when boats are overlapped at an obstruction, the outside boat gives the inside boat room between her and the obstruction, unless she's been unable to since the overlap began. A boat taking room she's entitled to is exonerated if she breaks a right-of-way rule doing it (Rule 43.1).",
      labels: { player: 'You · outside', Orange: 'Orange · inside', Grey: 'Grey · drifting' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [1.2, -12.9], hdg: CH_S, helm: 'player' },
          { role: 'Orange', at: [1.95, -12.2], hdg: CH_S, helm: closeHauled('stbd', 6) },
          { role: 'Grey', at: [-1.0, -7.5], hdg: 40, helm: hold(40), disabled: true, color: '#94A3B8' },
        ],
      }),
      diagram: { plan: closeHauled('stbd', 14), seconds: 8 },
    },
  ],
};

// ───────────────────────── 6. Penalties and protests ─────────────────────────

const m6: RulesModule = {
  id: 'penalties', n: 6, title: 'Penalties and protests', rules: 'One-Turn Penalty, protests, Rules 21 and 23',
  blurb: 'Taking your turn, hailing a protest, and keeping out of the way.',
  situations: [
    {
      id: 'one-turn', title: 'The One-Turn Penalty', rules: ['44'],
      text: 'You fouled Orange a moment ago.',
      question: 'What is your penalty in radio sailing?',
      answers: [
        { text: 'A One-Turn Penalty: get clear, then one turn including one tack and one gybe', correct: true },
        { text: 'A Two-Turns Penalty, as in other racing' },
        { text: 'Retire from the heat' },
      ],
      ruling: 'Appendix E replaces the Two-Turns Penalty with a One-Turn Penalty for breaking a Part 2 rule or touching a mark: as soon as possible get well clear of other boats, then promptly make one turn in the same direction, including one tack and one gybe. If you gained an advantage despite it, take more turns; if you caused serious damage, retire.',
      rc: 'Appendix E: one turn, not two.',
      labels: { player: 'You · penalty', Orange: 'Orange' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [0, -12], hdg: CH_S, spd: 0.7, helm: 'player', owes: 1 },
          { role: 'Orange', at: [5.5, -14.5], hdg: CH_P, helm: 'ai', persona: 'steady' },
        ],
      }),
      diagram: { plan: penaltyTurn(closeHauled('stbd'), 0.3), seconds: 10 },
      play: {
        brief: 'You owe a penalty for a foul a moment ago.',
        tip: 'Turn the same way the whole time: through head to wind and through dead downwind, right round.',
        goal: {
          text: 'Take your One-Turn Penalty', seconds: 20,
          check: g => fouled(g) ?? (g.player.penalty.taken > 0 ? won('Penalty done', 'One turn, one tack and one gybe, in clear water (Appendix E). Back to racing.') : null),
          final: () => lost('Penalty not taken', 'Turn right round, through a tack and a gybe, as soon as you are clear of other boats.'),
        },
        solution: penaltyTurn(closeHauled('stbd'), 0.3),
        mistake: closeHauled('stbd'),
        mistakeRule: '',
      },
    },
    {
      id: 'protest-hail', title: 'Hailing a protest', rules: ['E6'],
      text: "Orange, on port, made you change course to avoid her and sailed on without taking a penalty.",
      question: 'How do you protest in radio sailing?',
      answers: [
        { text: 'Hail your sail number, "protest", then hers: "zero one protest zero five"', correct: true },
        { text: 'Shout "Protest!" and fly a red flag' },
        { text: 'Tell the race officer after the heat' },
      ],
      ruling: 'Appendix E: hail your own sail number, the word "protest" and the other boat\'s sail number, at the first reasonable opportunity, with sail numbers said digit by digit. She can then take a One-Turn Penalty; if she doesn\'t, the protest is heard after the heat.',
      rc: 'Appendix E: no flag, just the hail with both sail numbers.',
      labels: { player: 'You · starboard', Orange: 'Orange · port' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [3.6, -13], hdg: CH_S, helm: 'player' },
          { role: 'Orange', at: [-3.6, -13], hdg: CH_P, helm: blind(CH_P), forgets: true },
        ],
      }),
      diagram: { plan: holdThenAvoid(CH_S, 'Orange', -40, 1.5, closeHauled('stbd')), seconds: 10 },
      play: {
        brief: "You're on starboard and Orange, on port, isn't keeping clear.",
        tip: 'Hold your course until she clearly won\'t keep clear, avoid her, then press H to hail the protest.',
        goal: {
          text: 'Avoid Orange, then hail a protest', seconds: 16,
          check: g => {
            const f = fouled(g) ?? rule14(g); if (f) return f;
            return hailed(g, /protest/i) ? won('Protest hailed', `You hailed it the radio sailing way: "${protestHail(g.player, find(g.race, 'Orange'))}". Now she can take her One-Turn Penalty.`) : null;
          },
          final: () => lost('No protest', 'After she fouls you, press H: you hail your sail number, "protest" and hers.'),
        },
        solution: (t, b, race, me) => {
          const st: Step = holdThenAvoid(CH_S, 'Orange', -40, 1.5, closeHauled('stbd'))(t, b, race, me);
          return race.incidents.some(i => i.victim === b.id) ? { ...st, hail: protestHail(b, find(race, 'Orange')) } : st;
        },
        mistake: holdThenAvoid(CH_S, 'Orange', -40, 1.5, closeHauled('stbd')),
        mistakeRule: '',
      },
    },
    {
      id: 'keep-clear-turning', title: 'Keeping clear while turning', rules: ['21'],
      text: "You owe a penalty. Orange is coming up fast behind you.",
      question: 'While you turn, who keeps clear?',
      answers: [
        { text: 'You: a boat taking a penalty keeps clear of boats that are not', correct: true },
        { text: "Orange: she's clear astern" },
        { text: "Orange: you're the one with the problem" },
      ],
      ruling: "Rule 21: a boat taking a penalty keeps clear of one that isn't. Wait until there's clear water, then turn. If you turn into someone's path you foul her too.",
      labels: { player: 'You · penalty', Orange: 'Orange' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [0, -12], hdg: CH_S, spd: 0.65, helm: 'player', owes: 1 },
          { role: 'Orange', at: [1.73, -12.85], hdg: CH_S, spd: 1, helm: closeHauled('stbd') },
        ],
      }),
      diagram: { plan: when((_t, b, r) => hullGap(b, find(r, 'Orange')) > 2.2 * b.cls.loa && _t > 2, (_t, b) => ({ hdg: onTack(b, 'stbd', 47), sheet: easedSheet(47, 0.45), intent: 'Letting her past' }), penaltyTurn(closeHauled('stbd'))), seconds: 14 },
      play: {
        brief: 'You owe a penalty, and Orange is about to sail past you.',
        tip: "Let her get past first. When there's clear water around you, turn.",
        goal: {
          text: 'Take your penalty without getting in anyone\'s way', seconds: 26,
          check: g => fouled(g) ?? rule14(g) ?? (g.player.penalty.taken > 0 ? won('Clean penalty', 'You waited for clear water before turning (Rule 21).') : null),
          final: () => lost('Penalty not taken', 'Once Orange is past, make your turn.'),
        },
        solution: when((_t, b, r) => hullGap(b, find(r, 'Orange')) > 2.2 * b.cls.loa && _t > 2, (_t, b) => ({ hdg: onTack(b, 'stbd', 47), sheet: easedSheet(47, 0.45), intent: 'Letting her past' }), penaltyTurn(closeHauled('stbd'))),
        mistake: penaltyTurn(closeHauled('stbd'), 0.6),
        mistakeRule: '21|13',
      },
    },
    {
      id: 'interfering', title: "Don't interfere", rules: ['23'],
      text: "Orange is doing her penalty turn just ahead of you on the run. You could sail right past her and take her wind.",
      question: 'May you?',
      answers: [
        { text: "Not if you can reasonably avoid it, unless you're simply sailing your proper course", correct: true },
        { text: "Yes: she's out of the race until she has turned" },
        { text: 'Yes, as long as you keep clear of her' },
      ],
      ruling: "Rule 23: if reasonably possible, a boat must not interfere with a boat that is taking a penalty or sailing on another leg. After the start, that doesn't stop you sailing your proper course.",
      labels: { player: 'You', Orange: 'Orange · turning' },
      scene: () => ({
        origin: 'GP',
        boats: [
          { role: 'You', at: [0.5, 14], hdg: RUN_S, leg: 2, helm: 'player' },
          { role: 'Orange', at: [-0.4, 10.5], hdg: RUN_S, leg: 2, helm: penaltyTurn(running('stbd'), 0, -1), owes: 1 },
        ],
      }),
      diagram: { plan: hold(RUN_S - 10), seconds: 7 },
    },
    {
      id: 'out-of-control', title: 'Out of control', rules: ['E2.3'],
      text: 'Your boat stops answering the transmitter in the middle of a heat.',
      question: 'What must you do?',
      answers: [
        { text: 'Hail "(your sail number) out of control" straight away; the boat retires', correct: true },
        { text: 'Keep trying the sticks and say nothing' },
        { text: 'Ask the race officer to stop the heat' },
      ],
      ruling: 'Appendix E2.3: a competitor who loses radio control of her boat must promptly hail "(sail number) out of control", and the boat retires. Other boats must then avoid her if possible (Rule 22).',
      rc: 'Radio sailing only.',
      labels: { player: 'You', Grey: 'Grey · out of control' },
      scene: () => ({
        origin: 'W',
        boats: [
          { role: 'You', at: [2.5, -12], hdg: CH_S, helm: 'player' },
          { role: 'Grey', at: [-0.5, -10.5], hdg: 30, helm: hold(30), disabled: true, color: '#94A3B8' },
        ],
      }),
      diagram: { plan: closeHauled('stbd', 8), seconds: 6 },
    },
  ],
};

export const MODULES: RulesModule[] = [m1, m2, m3, m4, m5, m6];

/** Every playable situation as a scene spec (for the race screen, the tests and the dev harness). */
export function lessonSpecs(): SceneSpec[] {
  const out: SceneSpec[] = [];
  for (const m of MODULES) for (const s of m.situations) {
    if (!s.play) continue;
    out.push({ kind: 'lesson', id: `${m.id}/${s.id}`, title: s.title, scene: s.scene, ...s.play });
  }
  return out;
}

export function findSituation(id: string): { module: RulesModule; situation: Situation } | null {
  const [mid, sid] = id.split('/');
  const module = MODULES.find(m => m.id === mid);
  const situation = module?.situations.find(s => s.id === sid);
  return module && situation ? { module, situation } : null;
}
