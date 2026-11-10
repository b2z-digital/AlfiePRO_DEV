// All the training content in one place: Start Trainer drills, Rules Academy lessons and Scenario
// Lab moments, each a playable scene spec on the same engine and referee as a race.
import { DRILLS } from './drills';
import { LAB } from './lab';
import { lessonSpecs } from './lessons';
import type { SceneKind, SceneSpec } from './common';

export * from './common';
export { DRILLS, findDrill } from './drills';
export type { Drill, DrillGroup } from './drills';
export { LAB, findMoment } from './lab';
export type { LabMoment } from './lab';
export { MODULES, findSituation, lessonSpecs } from './lessons';
export type { Answer, RulesModule, Situation } from './lessons';

let lessonCache: SceneSpec[] | null = null;

/** Every playable scene, by kind. */
export function allScenes(): SceneSpec[] {
  lessonCache = lessonCache ?? lessonSpecs();
  return [...DRILLS, ...lessonCache, ...LAB];
}

export function findScene(kind: SceneKind, id: string): SceneSpec | null {
  return allScenes().find(s => s.kind === kind && s.id === id) ?? null;
}
