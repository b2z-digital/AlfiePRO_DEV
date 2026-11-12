// Training progress: best drill scores and stars, Rules Academy answers and played-out situations,
// Scenario Lab wins, and the rules licence worked out from them. Kept on this device, and synced to
// the sailor's account when they're signed in (see sync.ts).
import { DRILLS, MODULES } from '@/sim/training';
import type { Outcome, SceneSpec } from '@/sim/training';
import { newerYard, type Yard } from './yacht';
import { newerCareer, type Career } from './career';
import type { Comfort } from './comfort';
import type { RoRecord } from './ro';

const KEY = 'alfie-race-sim-training-v1';

export interface DrillRecord { best: number | null; stars: number; tries: number; at: number }
export interface LessonRecord { answered: boolean; correct: boolean; played: boolean; at: number }
export interface LabRecord { won: boolean; tries: number; at: number }

/** The two ways of using the Academy: the programs on their own, or racing as well. */
export type Way = 'simple' | 'full';

export interface TrainingProgress {
  drills: Record<string, DrillRecord>;
  lessons: Record<string, LessonRecord>;
  lab: Record<string, LabRecord>;
  /** You be the judge: your best call on each case (0 to 2 points) and when you last made one. */
  judge?: Record<string, { points: number; at: number }>;
  /** The boats you've designed (see yacht.ts): they ride here so they follow you to every device. */
  yard?: Yard;
  /** Cards on the home screen you've said you don't want to see again, and when you said so. */
  dismissed?: Record<string, number>;
  /** How you've said you want to use the Academy, and when you said so: 'simple' to sail better, 'full' to race as well. */
  way?: { mode: Way; at: number };
  /** Your season on the AlfiePRO Circuit (see career.ts). */
  career?: Career;
  /** When you said you're new to RC sailing: you start at Club level and on the learn-to-sail path (see learn.ts). */
  newcomer?: number;
  /** Your race officer's record: each duty's best mark at each standard (see ro.ts). */
  ro?: RoRecord;
  /** Comfort settings: text size, race pace, captions, how Alfie's help steps down (see comfort.ts). */
  comfort?: Comfort;
  /** When you last started again: anything older, here or in your account, is left behind. */
  resetAt?: number;
  updatedAt: number;
}

const EMPTY: TrainingProgress = { drills: {}, lessons: {}, lab: {}, updatedAt: 0 };

export function loadTraining(): TrainingProgress {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const p = JSON.parse(s); return { ...EMPTY, ...p, drills: p.drills ?? {}, lessons: p.lessons ?? {}, lab: p.lab ?? {} }; }
  } catch { /* storage unavailable */ }
  return { ...EMPTY, drills: {}, lessons: {}, lab: {} };
}

export function saveTraining(p: TrainingProgress): TrainingProgress {
  p.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  return p;
}

/** Record a finished drill, lesson or lab attempt. */
export function recordScene(spec: SceneSpec, o: Outcome, higherIsBetter = false): TrainingProgress {
  const p = loadTraining();
  const now = Date.now();
  if (spec.kind === 'drill') {
    const r = p.drills[spec.id] ?? { best: null, stars: 0, tries: 0, at: 0 };
    r.tries += 1; r.at = now;
    if (o.pass && o.score !== undefined) r.best = r.best === null ? o.score : higherIsBetter ? Math.max(r.best, o.score) : Math.min(r.best, o.score);
    if (o.pass) r.stars = Math.max(r.stars, o.stars ?? 1);
    p.drills[spec.id] = r;
  } else if (spec.kind === 'lesson') {
    const r = p.lessons[spec.id] ?? { answered: false, correct: false, played: false, at: 0 };
    if (o.pass) r.played = true;
    r.at = now;
    p.lessons[spec.id] = r;
  } else {
    const r = p.lab[spec.id] ?? { won: false, tries: 0, at: 0 };
    r.tries += 1; r.at = now;
    if (o.pass) r.won = true;
    p.lab[spec.id] = r;
  }
  return saveTraining(p);
}

/** Record a call in You be the judge (0 to 2 points): the best call on a case is kept, and when you last made one. */
export function recordJudge(id: string, points: number): TrainingProgress {
  const p = loadTraining();
  const j = p.judge ?? {};
  j[id] = { points: Math.max(points, j[id]?.points ?? 0), at: Date.now() };
  p.judge = j;
  return saveTraining(p);
}

/** "Don't show me this again", for a card on the home screen. */
export function dismissCard(id: string): TrainingProgress {
  const p = loadTraining();
  p.dismissed = { ...(p.dismissed ?? {}), [id]: Date.now() };
  return saveTraining(p);
}

/** Keep a race officer's duty mark. */
export function saveRo(ro: RoRecord): TrainingProgress {
  const p = loadTraining();
  p.ro = ro;
  return saveTraining(p);
}

/** Change your comfort settings. */
export function saveComfort(c: Omit<Comfort, 'at'>): TrainingProgress {
  const p = loadTraining();
  p.comfort = { ...c, at: Date.now() };
  return saveTraining(p);
}

/** "Help me sail better" (simple) or "I want to race" (full); `newcomer`: "I'm new to RC sailing" as well (on), or not any more (off). */
export function chooseWay(mode: Way, newcomer?: boolean): TrainingProgress {
  const p = loadTraining();
  const now = Date.now();
  p.way = { mode, at: now };
  if (newcomer === true && !p.newcomer) p.newcomer = now;
  if (newcomer === false) delete p.newcomer;
  return saveTraining(p);
}

/**
 * Start again: your training, program, licences, Circuit season and medals cleared, and the
 * question of how you'd like to use the Academy asked again. The time is kept, so anything older
 * that comes back from your account (or another device) is left behind. Your yachts are kept unless
 * you say otherwise.
 */
export function resetTraining(keepYachts: boolean, now = Date.now()): TrainingProgress {
  const was = loadTraining();
  const p: TrainingProgress = { drills: {}, lessons: {}, lab: {}, resetAt: now, updatedAt: 0 };
  // (Kept yachts are stamped now, so they're newer than the reset.)
  if (keepYachts && was.yard) p.yard = { ...was.yard, at: Math.max(was.yard.at, now) };
  // Comfort settings are how you read and race, not progress: they stay.
  if (was.comfort) p.comfort = { ...was.comfort, at: Math.max(was.comfort.at, now) };
  return saveTraining(p);
}

/** Only what's newer than the last reset. */
function since(p: TrainingProgress, t: number): TrainingProgress {
  if (!t) return p;
  const keep = <R extends { at: number }>(o: Record<string, R> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, r]) => r.at >= t)) as Record<string, R>;
  return {
    ...p, drills: keep(p.drills), lessons: keep(p.lessons), lab: keep(p.lab),
    judge: p.judge ? keep(p.judge) : undefined,
    dismissed: p.dismissed ? Object.fromEntries(Object.entries(p.dismissed).filter(([, at]) => at >= t)) : undefined,
    way: p.way && p.way.at >= t ? p.way : undefined,
    career: p.career && p.career.at >= t ? p.career : undefined,
    newcomer: p.newcomer && p.newcomer >= t ? p.newcomer : undefined,
    yard: p.yard && p.yard.at >= t ? p.yard : undefined,
    comfort: p.comfort && p.comfort.at >= t ? p.comfort : undefined,
    ro: p.ro && p.ro.at >= t ? p.ro : undefined,
  };
}

/** Keep your season on the Circuit. */
export function saveCareer(career: Career): TrainingProgress {
  const p = loadTraining();
  p.career = career;
  return saveTraining(p);
}

/** Record an answer to a Rules Academy question (`id` is module/situation). */
export function recordAnswer(id: string, correct: boolean): TrainingProgress {
  const p = loadTraining();
  const r = p.lessons[id] ?? { answered: false, correct: false, played: false, at: 0 };
  r.answered = true; r.correct = r.correct || correct; r.at = Date.now();
  p.lessons[id] = r;
  return saveTraining(p);
}

export interface ModuleProgress { id: string; n: number; title: string; answered: number; total: number; done: boolean }

/** The rules licence: one level for every module whose questions you've all got right. */
export function licence(p: TrainingProgress): { level: number; modules: ModuleProgress[] } {
  const modules = MODULES.map(m => {
    const total = m.situations.length;
    const answered = m.situations.filter(s => p.lessons[`${m.id}/${s.id}`]?.correct).length;
    return { id: m.id, n: m.n, title: m.title, answered, total, done: answered === total };
  });
  return { level: modules.filter(m => m.done).length, modules };
}

export function drillStars(p: TrainingProgress): { got: number; of: number } {
  return { got: DRILLS.reduce((a, d) => a + (p.drills[d.id]?.stars ?? 0), 0), of: DRILLS.length * 3 };
}

/** Merge two progress records (device and account): keep the best of each. */
export function mergeTraining(a0: TrainingProgress, b0: TrainingProgress): TrainingProgress {
  // Started again on either side: what's older than that is left behind on both.
  const reset = Math.max(a0.resetAt ?? 0, b0.resetAt ?? 0);
  const a = since(a0, reset), b = since(b0, reset);
  const out: TrainingProgress = { drills: { ...a.drills }, lessons: { ...a.lessons }, lab: { ...a.lab }, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  for (const [k, r] of Object.entries(b.drills)) {
    const m = out.drills[k];
    const hi = !!DRILLS.find(d => d.id === k)?.higherIsBetter;
    const best = m?.best == null ? r.best : r.best == null ? m.best : hi ? Math.max(m.best, r.best) : Math.min(m.best, r.best);
    out.drills[k] = !m ? r : { best, stars: Math.max(m.stars, r.stars), tries: Math.max(m.tries, r.tries), at: Math.max(m.at, r.at) };
  }
  for (const [k, r] of Object.entries(b.lessons)) {
    const m = out.lessons[k];
    out.lessons[k] = !m ? r : { answered: m.answered || r.answered, correct: m.correct || r.correct, played: m.played || r.played, at: Math.max(m.at, r.at) };
  }
  for (const [k, r] of Object.entries(b.lab)) {
    const m = out.lab[k];
    out.lab[k] = !m ? r : { won: m.won || r.won, tries: Math.max(m.tries, r.tries), at: Math.max(m.at, r.at) };
  }
  if (a.judge || b.judge) {
    out.judge = { ...(a.judge ?? {}) };
    for (const [k, r] of Object.entries(b.judge ?? {})) { const m = out.judge[k]; out.judge[k] = !m ? r : { points: Math.max(m.points, r.points), at: Math.max(m.at, r.at) }; }
  }
  if (a.yard || b.yard) out.yard = newerYard(a.yard, b.yard);
  // Dismissed on one device is dismissed on them all.
  if (a.dismissed || b.dismissed) {
    out.dismissed = { ...(a.dismissed ?? {}) };
    for (const [k, at] of Object.entries(b.dismissed ?? {})) out.dismissed[k] = Math.max(at, out.dismissed[k] ?? 0);
  }
  if (a.career || b.career) out.career = newerCareer(a.career, b.career);
  if (reset) out.resetAt = reset;
  if (a.newcomer || b.newcomer) out.newcomer = Math.min(a.newcomer ?? Infinity, b.newcomer ?? Infinity);
  // The way of using the Academy that was chosen last.
  if (a.way || b.way) out.way = (b.way?.at ?? 0) > (a.way?.at ?? 0) ? b.way : a.way;
  // Comfort settings: the ones changed last.
  if (a.comfort || b.comfort) out.comfort = (b.comfort?.at ?? 0) > (a.comfort?.at ?? 0) ? b.comfort : a.comfort;
  // The race officer's record: each duty and standard at its best on either device.
  if (a.ro || b.ro) {
    const best = { ...(a.ro?.best ?? {}) };
    for (const [k, v] of Object.entries(b.ro?.best ?? {}) as [keyof RoRecord['best'], NonNullable<RoRecord['best'][keyof RoRecord['best']]>][]) {
      const w = best[k];
      best[k] = !w ? v : { score: Math.max(w.score, v.score), at: Math.max(w.at, v.at), tries: Math.max(w.tries, v.tries) };
    }
    out.ro = { best, at: Math.max(a.ro?.at ?? 0, b.ro?.at ?? 0) };
  }
  return out;
}
