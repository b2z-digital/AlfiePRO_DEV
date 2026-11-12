// Learning to sail: the path for someone who has said they're new to RC sailing. Four stages, in
// order: control the boat (the five First sail steps), the rules that matter most (Right of way in
// the Rules Academy), your first starts (two Start Trainer drills), and your first race (a short
// one against Club skippers). Someone on this path starts at Club level, with no placement races.
// Pure: nothing stored here.
import { DRILLS, FIRST, MODULES } from '@/sim/training';
import type { Profile } from './profile';
import type { TrainingProgress } from './progress';
import type { TrainLink } from './stats';

export type LearnStage = 'boat' | 'rules' | 'starts' | 'race';

export interface LearnStep {
  stage: LearnStage;
  title: string;
  /** Where it's practised: a First sail step, a rules situation or a drill. Not given: a race. */
  link?: TrainLink;
  done: boolean;
}

export interface LearnStageState { id: LearnStage; title: string; text: string; steps: LearnStep[]; done: number; complete: boolean }

export interface LearnPath {
  stages: LearnStageState[];
  /** The next thing to do, and which of the four stages it's in (null when the path is done). */
  next: LearnStep | null; stage: number;
  /** Every step done. */
  done: boolean;
  /** Steps done of all of them. */
  progress: { done: number; of: number };
}

export const STAGE_WORDS: Record<LearnStage, { title: string; text: string }> = {
  boat: { title: 'Control the boat', text: 'Steer her, trim the sail, tack, round a mark and cross a start line, a step at a time.' },
  rules: { title: 'The rules that matter most', text: 'Who keeps clear of whom when two boats meet. Answer each one, then sail it.' },
  starts: { title: 'Your first starts', text: 'Hold your place on the line, then judge how long it takes to reach it.' },
  race: { title: 'Your first race', text: 'A short race against five Club skippers, with Alfie coaching from the bank.' },
};

/** The drills of the first starts. */
export const FIRST_DRILLS = ['hold-spot', 'time-distance'];

/** Where someone who said they're new to RC sailing has got to. `since`: when they said so (a race counts from then). */
export function learnPath(profile: Profile, training: TrainingProgress, since = 0): LearnPath {
  const rules = MODULES[0];
  const steps: Record<LearnStage, LearnStep[]> = {
    boat: FIRST.map(m => ({ stage: 'boat', title: m.title, link: { kind: 'lab', id: m.id, label: 'First sail' }, done: !!training.lab[m.id]?.won })),
    rules: rules.situations.map(s => ({ stage: 'rules', title: s.title, link: { kind: 'lesson', id: `${rules.id}/${s.id}`, label: `Rules: ${s.title}` }, done: !!training.lessons[`${rules.id}/${s.id}`]?.correct })),
    starts: FIRST_DRILLS.map(id => ({ stage: 'starts', title: DRILLS.find(d => d.id === id)?.title ?? id, link: { kind: 'drill', id, label: `Start Trainer: ${DRILLS.find(d => d.id === id)?.title ?? id}` }, done: (training.drills[id]?.stars ?? 0) >= 1 })),
    race: [{ stage: 'race', title: 'Your first race', done: profile.races.some(r => r.mode === 'race' && r.status !== 'racing' && r.at >= since) }],
  };
  const stages = (['boat', 'rules', 'starts', 'race'] as LearnStage[]).map(id => {
    const done = steps[id].filter(s => s.done).length;
    return { id, ...STAGE_WORDS[id], steps: steps[id], done, complete: done === steps[id].length };
  });
  // The first stage not finished, and the first step in it not done: the stages are taken in order.
  const stage = stages.findIndex(s => !s.complete);
  const next = stage < 0 ? null : stages[stage].steps.find(s => !s.done) ?? null;
  const all = stages.flatMap(s => s.steps);
  return { stages, next, stage: Math.max(0, stage), done: stage < 0, progress: { done: all.filter(s => s.done).length, of: all.length } };
}
