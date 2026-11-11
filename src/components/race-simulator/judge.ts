// You be the judge. A short incident between two or three boats, from above: who broke a rule, and
// which one? The cases are the Rules Academy's situations sailed two ways (the classic mistake, and
// the right way), with nobody marked as "you", and the verdict is whatever the simulator's own
// referee found when the clip was sailed. So some clips have no foul in them at all. Pure: the
// clips are run on the engine here; drawing them is the diagram's job.
import { buildScene, runScene, type PlanFn, type SceneDef } from '@/sim/scene';
import { MODULES, named } from '@/sim/training';
import { RULES, ruleText } from './rulesText';

/** The boat that was "you" in the lesson: one of the fleet here, with a name and colour of her own. */
const WAS_YOU = 'Purple';
/** Each boat is drawn in the colour she's named for. */
export const BOAT_COLOR: Record<string, string> = { Purple: '#B48CFF', Orange: '#FB923C', Green: '#34D399', Grey: '#94A3B8', Blue: '#2A93FF' };
const OTHER = ['#F472B6', '#2DD4BF', '#FBBF24'];

export interface JudgeCase {
  /** `module/situation:mistake` or `module/situation:right`. */
  id: string;
  /** The Rules Academy situation it comes from (`module/situation`), to sail it yourself afterwards. */
  lesson: string;
  title: string;
  way: 'mistake' | 'right';
}

export interface Verdict {
  /** The boat that broke a rule, by name (null: nobody did). */
  offender: string | null;
  /** The rule she broke, as the referee calls it ("10", "18.2(a)"), and its short title. */
  rule: string | null; ruleTitle: string | null;
  /** The referee's explanation, with the boats by name. */
  text: string;
  /** Seconds into the clip that it happened. */
  at: number | null;
}

export interface Clip {
  c: JudgeCase;
  /** The scene with nobody as "you", the seed and how long to run it: what the diagram draws. */
  scene: SceneDef; seed: number; seconds: number;
  /** The boats in it, by name. */
  boats: string[];
  verdict: Verdict;
}

const find = (lesson: string) => {
  const [mod, sit] = lesson.split('/');
  return MODULES.find(m => m.id === mod)?.situations.find(s => s.id === sit) ?? null;
};

/**
 * Cases left out. Three situations are scripted round "your" boat and can't be sailed with nobody
 * as you. For the rest listed, the two ways come to the same call (or the clip is a boat taking a
 * penalty, where there's nothing to judge), so one is enough.
 */
const SKIP = new Set([
  'changing-course/hunting:mistake', 'changing-course/hunting:right', 'changing-course/proper-course:mistake', 'changing-course/proper-course:right', 'mark-room/inside-leeward:mistake',
  'right-of-way/avoid-contact:right', 'changing-course/tacking:right', 'changing-course/gybe-onto-starboard:mistake', 'starting/over-early:right',
  'penalties/one-turn:mistake', 'penalties/one-turn:right', 'penalties/protest-hail:right',
]);

/** Every case there is: each situation you can sail, the mistake's way and the right way. */
export function judgeCases(): JudgeCase[] {
  const out: JudgeCase[] = [];
  for (const m of MODULES) for (const s of m.situations) {
    if (!s.play) continue;
    const lesson = `${m.id}/${s.id}`;
    if (s.play.mistake) out.push({ id: `${lesson}:mistake`, lesson, title: s.title, way: 'mistake' });
    if (s.play.solution) out.push({ id: `${lesson}:right`, lesson, title: s.title, way: 'right' });
  }
  return out.filter(c => !SKIP.has(c.id));
}

/** Sail a case and take the referee's verdict (null if the situation has gone). */
export function runCase(c: JudgeCase, seed = 1): Clip | null {
  try { return sail(c, seed); } catch { return null; }
}

function sail(c: JudgeCase, seed: number): Clip | null {
  const s = find(c.lesson);
  if (!s?.play) return null;
  const plan: PlanFn | 'ai' | undefined = c.way === 'mistake' ? s.play.mistake : s.play.solution;
  if (!plan) return null;
  // How long the lesson takes sailed this way, with a moment after it.
  const def = s.scene(seed);
  const took = runScene(def, s.play.goal, seed, plan).t;
  let k = 0;
  const scene: SceneDef = {
    ...def,
    boats: def.boats.map(b => (b.helm === 'player' ? { ...b, role: WAS_YOU, color: BOAT_COLOR[WAS_YOU], helm: plan } : { ...b, color: BOAT_COLOR[b.role] ?? b.color ?? OTHER[k++ % OTHER.length] })),
  };
  const { race, ids } = buildScene(scene, seed);
  const max = Math.min(60, took + 2.5);
  let at: number | null = null;
  let t = 0;
  for (; t < max; t += 0.05) {
    race.step();
    if (at === null && race.incidents.length) at = t;
    // (Enough after it to see who had to do what.)
    if (at !== null && t > at + 2.5) break;
  }
  const inc = race.incidents[0] ?? null;
  const name = (id: string) => Object.entries(ids).find(([, v]) => v === id)?.[0] ?? race.boatById(id).name;
  const rt = inc ? ruleText(inc.rule) : null;
  return {
    c, scene, seed, seconds: Math.max(4, Math.round(t)), boats: scene.boats.map(b => b.role),
    verdict: inc
      ? { offender: name(inc.offender), rule: inc.rule, ruleTitle: rt?.title ?? inc.title, text: named(race, `${inc.explanation} ${inc.nextTime ?? ''}`.trim()), at }
      : { offender: null, rule: null, ruleTitle: null, text: `No rule was broken in this one. The rule in play: ${s.ruling}`, at: null },
  };
}

/** The rules offered as answers: the right one (when there is one) among others from the same part of the book. */
export function ruleChoices(v: Verdict, seed: number): { rule: string; title: string }[] {
  const base = (r: string) => r.split('(')[0];
  const pool = ['10', '11', '12', '13', '14', '15', '16.1', '17', '18.2(a)', '18.3', '19', '20', '21', '22', '29.1', '31'].filter(r => !v.rule || base(r) !== base(v.rule));
  // (A fixed shuffle for the case, so the choices are the same each time you see it.)
  let x = (seed * 2654435761) >>> 0;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const others = [...pool].sort(() => rnd() - 0.5).slice(0, 3);
  const all = v.rule ? [v.rule, ...others] : [...others, pool.find(r => !others.includes(r))!];
  return all.sort(() => rnd() - 0.5).map(r => ({ rule: r, title: RULES[r]?.title ?? ruleText(r)?.title ?? `Rule ${r}` }));
}

/** A whole number from a string: the same case of the day for everyone on the same day. */
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Today's cases, the same for everyone that day: `n` of them, the first being the call of the day. */
export function todaysCases(day: string, n = 5): JudgeCase[] {
  const all = judgeCases();
  return [...all].sort((a, z) => hash(`${day}|${a.id}`) - hash(`${day}|${z.id}`)).slice(0, n);
}

/** How a call is marked: the boat (or nobody) is half of it, the rule the other half. */
export function mark(v: Verdict, who: string | null, rule: string | null): { who: boolean; rule: boolean; points: number } {
  const okWho = who === v.offender;
  const base = (r: string | null) => (r ? r.split('(')[0] : null);
  const okRule = v.rule === null ? okWho : okWho && base(rule) === base(v.rule);
  return { who: okWho, rule: okRule, points: (okWho ? 1 : 0) + (okRule ? 1 : 0) };
}
