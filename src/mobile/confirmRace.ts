/**
 * Confirm & publish on the phone (Race Management board, "Check it, fix it with a drag, then
 * everyone sees it"). Runs the desktop scoring screen's own steps, in its order, on the event's
 * scoring state: Touch mode saves the finish order (utils/finishOrder), the scoring screen applies
 * it (handicaps / heat results, utils/scoringConfirm), Confirm completes the race or heat, and the
 * result is saved the way the scoring screen saves it (updateEventResults, checkpoint, members'
 * boat handicaps, live status).
 */
import type { Skipper } from '../types';
import type { HeatDesignation, HeatManagement, HeatResult } from '../types/heat';
import type { RaceEvent } from '../types/race';
import { finishOrderToResults, type FinishingEntry } from '../utils/finishOrder';
import { clearHeatRaceResults } from '../utils/heatUtils';
import { updateRaceStatus } from '../utils/liveTrackingStorage';
import { getCurrentEvent, setCurrentEvent, updateEventResults } from '../utils/raceStorage';
import { heatManagementOf, scoringStateOf } from '../utils/raceSetup';
import { createCheckpoint } from '../utils/scoringCheckpoints';
import {
  DEFAULT_HANDICAP_SETTINGS, completeHeatIn, editRaceResultIn, confirmTouchRace, handicapsFor, heatManagementAfterResult, loadHandicapSettings,
  mergeCompletedRoundResults, overrideHandicapIn, replaceRaceResultsForSkippersIn, skippersAfterHeatResult, updateMemberHandicapsFor, type HandicapSettings,
} from '../utils/scoringConfirm';
import { supabase } from '../utils/supabase';
import { forScoring } from './raceSession';

/** The scoring screen's state for an event (YachtRaceManager's useState values). */
export interface ScoringRun {
  skippers: Skipper[];
  raceResults: any[];
  heatManagement: HeatManagement | null;
  lastCompletedRace: number;
  numRaces: number;
  dropRules: number[] | string;
  hasDeterminedInitialHcaps: boolean;
  isManualHandicaps: boolean;
  currentDay: number;
  raceType: string | undefined;
}

export function runOf(event: RaceEvent): ScoringRun {
  const e = forScoring(event);
  const st = scoringStateOf(e);
  const hm = heatManagementOf(e);
  const heats = !!hm?.configuration?.enabled;
  return {
    skippers: st.skippers,
    raceResults: st.raceResults,
    heatManagement: hm,
    lastCompletedRace: st.lastCompletedRace,
    // the scoring screen's race count: the event's, never fewer than the races scored plus the next
    numRaces: e.numRaces ? Math.max(e.numRaces, st.lastCompletedRace + 1) : 12,
    // heat events score by their heat system; others by the event's discards
    dropRules: heats && hm?.configuration?.scoringSystem ? hm.configuration.scoringSystem : (e.dropRules || [4, 8, 16, 24, 32, 40]),
    hasDeterminedInitialHcaps: st.hasDeterminedInitialHcaps,
    isManualHandicaps: st.isManualHandicaps,
    currentDay: st.currentDay,
    raceType: e.raceFormat,
  };
}

/** Multi-day events keep each day's results apart; they're confirmed on the scoring sheet for now. */
export const confirmsOnPhone = (event: RaceEvent) => !event.multiDay;

const HCAP_KEY = (eventId: string) => `alfie-m-hcap-settings:${eventId}`;

/**
 * The handicap rules for an event (the club's ruleset, else the AlfiePRO rules). Kept on the phone
 * once loaded, so a race confirmed with no signal uses the same rules.
 */
export async function handicapSettingsFor(event: RaceEvent): Promise<HandicapSettings> {
  if (event.raceFormat !== 'handicap') return DEFAULT_HANDICAP_SETTINGS;
  try {
    const hs = await loadHandicapSettings(event as any);
    try { localStorage.setItem(HCAP_KEY(event.id), JSON.stringify(hs)); } catch { /* storage full */ }
    return hs;
  } catch {
    try { const raw = localStorage.getItem(HCAP_KEY(event.id)); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
    return DEFAULT_HANDICAP_SETTINGS;
  }
}

const heatsOn = (run: ScoringRun) => !!run.heatManagement?.configuration?.enabled;

/** Touch mode's save of a race (no heats), with the scoring screen's handicap update. */
export function applyRaceFinish(run: ScoringRun, race: number, entries: FinishingEntry[], settings: HandicapSettings): ScoringRun {
  const results = finishOrderToResults(run.raceResults, race, entries);
  if (run.raceType === 'handicap' && !heatsOn(run) && results.length > 0) {
    const { updatedSkippers, updatedResults } = handicapsFor(run.skippers, results, run.numRaces, settings, run.isManualHandicaps);
    return { ...run, skippers: updatedSkippers, raceResults: updatedResults };
  }
  return { ...run, raceResults: results };
}

/**
 * Touch mode's save of a heat (HeatScoringTable's callback): the heat's race results replaced,
 * its heat results cleared and recorded one by one (handleUpdateHeatResult). Entries use event
 * skipper indices.
 */
export function applyHeatFinish(run: ScoringRun, heat: HeatDesignation, heatSkipperIndices: number[], entries: FinishingEntry[]): ScoringRun {
  const hm0 = run.heatManagement!;
  const currentRace = hm0.currentRound;
  // what Touch mode hands the heat table: its saved results for the race
  const mappedEntries = finishOrderToResults([], currentRace, entries).map(r => ({ skipperIndex: r.skipperIndex, position: r.position, letterScore: r.letterScore, customPoints: r.customPoints }));
  const raceResults = replaceRaceResultsForSkippersIn(run.raceResults, run.skippers, currentRace, heatSkipperIndices, mappedEntries);
  let hm = clearHeatRaceResults(hm0, heat, hm0.currentRound, currentRace, heatSkipperIndices);
  // Each result is recorded against the skippers as they were before this save, as on desktop
  let skippers = run.skippers;
  for (const entry of mappedEntries) {
    const heatResult: HeatResult = {
      skipperIndex: entry.skipperIndex,
      heatDesignation: heat,
      position: entry.position,
      letterScore: entry.letterScore,
      customPoints: entry.customPoints,
      round: hm0.currentRound,
      race: currentRace,
    } as HeatResult;
    const ns = skippersAfterHeatResult(run.skippers, heatResult);
    if (ns) skippers = ns;
    hm = heatManagementAfterResult(hm, run.skippers, heatResult);
  }
  return { ...run, raceResults, heatManagement: hm, skippers };
}

export interface RaceConfirmation {
  kind: 'race';
  before: ScoringRun;
  after: ScoringRun;
  race: number;
  advanced: boolean;
  memberHandicapRaces: number[];
  /** The results the members' boats take their handicaps from (as the desktop passes them). */
  latestResults: any[];
}

/** Touch mode Confirm (no heats), then the scoring screen's handicap recalculation. */
export function confirmRace(run: ScoringRun, race: number, settings: HandicapSettings): RaceConfirmation {
  const c = confirmTouchRace(run.raceResults, run);
  let after: ScoringRun = {
    ...run,
    lastCompletedRace: c.advanced ? c.highestConsecutiveRace : run.lastCompletedRace,
    numRaces: c.numRaces,
    skippers: c.skippers,
    isManualHandicaps: c.isManualHandicaps,
    hasDeterminedInitialHcaps: c.hasDeterminedInitialHcaps,
  };
  if (after.raceType === 'handicap' && !heatsOn(after) && after.skippers.length > 0 && after.raceResults.length > 0) {
    const { updatedSkippers, updatedResults } = handicapsFor(after.skippers, after.raceResults, after.numRaces, settings, after.isManualHandicaps);
    after = { ...after, skippers: updatedSkippers, raceResults: updatedResults };
  }
  return { kind: 'race', before: run, after, race, advanced: c.advanced, memberHandicapRaces: c.memberHandicapRaces, latestResults: run.raceResults };
}

export interface HeatConfirmation {
  kind: 'heat';
  before: ScoringRun;
  after: ScoringRun;
  heat: HeatDesignation;
  round: number;
  roundCompleted: boolean;
}

/** Confirming a heat whose boats all have results: the scoring screen completes it (promotions, next round). */
export function confirmHeat(run: ScoringRun, heat: HeatDesignation): HeatConfirmation {
  const done = completeHeatIn(run.heatManagement!, heat, run.dropRules, run.skippers);
  const after: ScoringRun = { ...run, heatManagement: done.heatManagement };
  if (done.convertedResults.length > 0) {
    after.raceResults = mergeCompletedRoundResults(run.raceResults, done.convertedResults, done.completedRoundNumbers);
    after.lastCompletedRace = done.lastCompletedRace;
  }
  return { kind: 'heat', before: run, after, heat, round: run.heatManagement!.currentRound, roundCompleted: done.roundCompleted };
}

/** Saves a confirmation the way the scoring screen does, and makes the event current with it. */
export async function saveConfirmation(event: RaceEvent, c: RaceConfirmation | HeatConfirmation, settings: HandicapSettings): Promise<RaceEvent> {
  const a = c.after;
  setCurrentEvent(event);
  const eventId = (event.isSeriesEvent ? event.seriesId : event.id) as string;
  await updateEventResults(
    eventId,
    a.raceResults,
    a.skippers,
    a.lastCompletedRace,
    a.hasDeterminedInitialHcaps,
    a.isManualHandicaps,
    false,
    a.currentDay,
    a.heatManagement,
    a.numRaces,
    a.dropRules
  );

  if (c.kind === 'race') {
    // Touch confirm also syncs the race in progress for livestream overlays
    if (c.advanced) {
      const clubId = localStorage.getItem('currentClubId');
      const q = supabase.from('quick_races').update({
        current_day: a.lastCompletedRace + 1,
        race_results: a.raceResults,
        last_completed_race: a.lastCompletedRace,
        skippers: a.skippers,
      }).eq('id', eventId);
      const { error } = await (clubId ? q.eq('club_id', clubId) : q);
      if (error) console.error('Error syncing confirmed results:', error);
      for (const r of c.memberHandicapRaces) await updateMemberHandicapsFor(c.before.skippers, r, c.latestResults, settings.ruleset);
    }
    if (a.lastCompletedRace > c.before.lastCompletedRace && event.clubId) {
      const dropRulesArray = Array.isArray(a.dropRules) ? a.dropRules : [4, 8, 16, 24, 32, 40];
      await createCheckpoint({
        eventId, clubId: event.clubId, roundNumber: a.lastCompletedRace, checkpointType: 'auto_round_complete', label: `End of Race ${a.lastCompletedRace}`,
        heatManagement: a.heatManagement || { configuration: { enabled: false, numberOfHeats: 2, promotionCount: 4, seedingMethod: 'random', autoAssign: false }, rounds: [], currentRound: 1, currentHeat: null } as any,
        raceResults: a.raceResults, skippers: a.skippers, lastCompletedRace: a.lastCompletedRace, dropRules: dropRulesArray, numRaces: a.numRaces,
      }).catch(() => null);
    }
    if (c.advanced && event.id && (event.enableLiveTracking || event.enableLiveStream)) {
      await updateRaceStatus(event.id, 'on_hold', `Race ${c.race} complete`, event.clubId, event.currentDay || 1).catch(() => null);
    }
  } else {
    const hm = a.heatManagement;
    if (hm?.roundJustCompleted && hm.roundJustCompleted !== c.before.heatManagement?.roundJustCompleted && event.clubId) {
      const dropRulesArray = Array.isArray(a.dropRules) ? a.dropRules : [4, 8, 16, 24, 32, 40];
      await createCheckpoint({
        eventId, clubId: event.clubId, roundNumber: hm.roundJustCompleted, checkpointType: 'auto_round_complete', label: `End of Race ${hm.roundJustCompleted}`,
        heatManagement: hm, raceResults: a.raceResults, skippers: a.skippers, lastCompletedRace: hm.roundJustCompleted, dropRules: dropRulesArray, numRaces: a.numRaces,
      }).catch(() => null);
    }
    if (c.roundCompleted && event.id && event.enableLiveTracking) {
      await updateRaceStatus(event.id, 'on_hold', `Qualifying Rd ${c.round} complete`, event.clubId, c.round).catch(() => null);
    }
  }
  return getCurrentEvent() || event;
}

/** Saves the scoring state as the scoring screen's auto-save does (after a handicap override). */
export async function saveRun(event: RaceEvent, a: ScoringRun): Promise<RaceEvent> {
  setCurrentEvent(event);
  await updateEventResults((event.isSeriesEvent ? event.seriesId : event.id) as string, a.raceResults, a.skippers, a.lastCompletedRace,
    a.hasDeterminedInitialHcaps, a.isManualHandicaps, false, a.currentDay, a.heatManagement, a.numRaces, a.dropRules);
  return getCurrentEvent() || event;
}

/** Touch mode's handicap override followed by the scoring screen's recalculation. */
export function overrideHandicap(run: ScoringRun, skipperIndex: number, value: number, settings: HandicapSettings): ScoringRun {
  const results = overrideHandicapIn(run.raceResults, skipperIndex, value);
  if (!results) return run;
  const { updatedSkippers, updatedResults } = handicapsFor(run.skippers, results, run.numRaces, settings, run.isManualHandicaps);
  return { ...run, skippers: updatedSkippers, raceResults: updatedResults };
}

/* ─────────────── what changed, for the confirm screens ─────────────── */

export interface HeatMove { skipperIndex: number; from: HeatDesignation; to: HeatDesignation; place?: number | null }

const heatOf = (hm: HeatManagement | null | undefined, round: number, i: number): HeatDesignation | undefined =>
  hm?.rounds.find(r => r.round === round)?.heatAssignments.find(a => a.skipperIndices.includes(i))?.heatDesignation;

/** Boats that moved heat: now, within this race (HMS promotions), and for the next race. */
export function heatMoves(c: HeatConfirmation): { now: HeatMove[]; next: HeatMove[]; nextRound: number | null } {
  const before = c.before.heatManagement!, after = c.after.heatManagement!;
  const ra = after.rounds.find(r => r.round === c.round);
  const place = (i: number) => ra?.results.find(r => r.skipperIndex === i && r.heatDesignation === c.heat && r.round === c.round)?.position ?? null;
  const now: HeatMove[] = [];
  for (const a of ra?.heatAssignments || []) {
    for (const i of a.skipperIndices) {
      const from = heatOf(before, c.round, i);
      if (from && from !== a.heatDesignation) now.push({ skipperIndex: i, from, to: a.heatDesignation, place: place(i) });
    }
  }
  // the next race's heats exist once every heat of this race is in (it starts on "Advance")
  const nextRound = after.rounds.some(r => r.round === c.round + 1) ? c.round + 1 : null;
  const next: HeatMove[] = [];
  if (nextRound) {
    const rn = after.rounds.find(r => r.round === nextRound);
    for (const a of rn?.heatAssignments || []) {
      for (const i of a.skipperIndices) {
        const from = heatOf(after, c.round, i);
        if (from && from !== a.heatDesignation) next.push({ skipperIndex: i, from, to: a.heatDesignation });
      }
    }
  }
  now.sort((x, y) => (x.place ?? 99) - (y.place ?? 99));
  return { now, next, nextRound };
}

export interface HandicapChange { skipperIndex: number; position: number | null; letterScore?: string; from: number; to: number; overridden: boolean }

/** Each boat's handicap before and after a race, in finishing order. */
export function handicapChanges(run: ScoringRun, race: number): HandicapChange[] {
  return run.raceResults
    .filter(r => r.race === race)
    .map(r => ({ skipperIndex: r.skipperIndex, position: r.position ?? null, letterScore: r.letterScore || undefined, from: r.handicap ?? 0, to: r.adjustedHcap ?? r.handicap ?? 0, overridden: !!r.handicapOverride }))
    .sort((a, b) => (a.letterScore ? 1 : 0) - (b.letterScore ? 1 : 0) || (a.position ?? 999) - (b.position ?? 999));
}

/**
 * Correcting one boat's result in one race (the scoring screen's cell edit, as in Pro mode and
 * the spreadsheet), followed by the scoring screen's handicap recalculation.
 */
export function editCell(run: ScoringRun, race: number, skipperIndex: number, position: number | null, letterScore: string | undefined, customPoints: number | undefined, settings: HandicapSettings): { run: ScoringRun; memberHandicapRace?: number } {
  const edit = editRaceResultIn({
    skippers: run.skippers, raceResults: run.raceResults, raceType: run.raceType, isManualHandicaps: run.isManualHandicaps,
    hasDeterminedInitialHcaps: run.hasDeterminedInitialHcaps, lastCompletedRace: run.lastCompletedRace, currentNumRaces: run.numRaces, scoringMode: 'pro',
  }, race, skipperIndex, position, letterScore, customPoints);
  let after: ScoringRun = {
    ...run,
    raceResults: edit.raceResults,
    skippers: edit.skippers ?? run.skippers,
    isManualHandicaps: edit.isManualHandicaps ?? run.isManualHandicaps,
    hasDeterminedInitialHcaps: edit.hasDeterminedInitialHcaps ?? run.hasDeterminedInitialHcaps,
    lastCompletedRace: edit.lastCompletedRace ?? run.lastCompletedRace,
  };
  if (after.raceType === 'handicap' && !heatsOn(after) && after.skippers.length > 0 && after.raceResults.length > 0) {
    const { updatedSkippers, updatedResults } = handicapsFor(after.skippers, after.raceResults, after.numRaces, settings, after.isManualHandicaps);
    after = { ...after, skippers: updatedSkippers, raceResults: updatedResults };
  }
  return { run: after, memberHandicapRace: edit.raceCompleted ? edit.memberHandicapRace : undefined };
}
