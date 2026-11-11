// All the training content in one place: Start Trainer drills, Rules Academy lessons and Scenario
// Lab moments, each a playable scene spec on the same engine and referee as a race.
import { DRILLS } from './drills';
import { LAB } from './lab';
import { FIRST } from './first';
import { lessonSpecs } from './lessons';
import type { SceneKind, SceneSpec } from './common';
import type { LabMoment } from './lab';

export * from './common';
export { DRILLS, findDrill } from './drills';
export type { Drill, DrillGroup } from './drills';
export { LAB, LAB_GROUPS } from './lab';
export { FIRST, nextFirst } from './first';
export type { LabGroup, LabMoment } from './lab';
export { MODULES, findSituation, lessonSpecs } from './lessons';
export type { Answer, RulesModule, Situation } from './lessons';

let lessonCache: SceneSpec[] | null = null;

/** Every playable scene, by kind. */
export function allScenes(): SceneSpec[] {
  lessonCache = lessonCache ?? lessonSpecs();
  return [...DRILLS, ...lessonCache, ...LAB, ...FIRST];
}

/** A Scenario Lab scenario or a First sail step, by id. */
export function findMoment(id: string): LabMoment | null { return LAB.find(m => m.id === id) ?? FIRST.find(m => m.id === id) ?? null; }

export function findScene(kind: SceneKind, id: string): SceneSpec | null {
  return allScenes().find(s => s.kind === kind && s.id === id) ?? null;
}
