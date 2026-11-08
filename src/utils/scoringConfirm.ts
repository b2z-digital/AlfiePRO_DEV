/**
 * Saving a finish order and confirming a race or heat, moved verbatim from the desktop scoring
 * screen (YachtRaceManager: Touch mode's results callback and confirm, replaceRaceResultsForSkippers,
 * handleUpdateHeatResult, handleCompleteHeat, updateMemberHandicaps; the club handicap ruleset
 * load). The desktop calls these, and the phone confirm screen runs the same steps in the same order.
 */
import type { Skipper } from '../types';
import type { HeatDesignation, HeatManagement, HeatResult } from '../types/heat';
import type { RaceEvent } from '../types/race';
import { calculateHandicaps } from './handicapCalculator';
import { calculateHandicapsWithRuleset, loadRulesetById, loadRulesetForClub, type LoadedRuleset } from './rulesetHandicapCalculator';
import { completeHeat, convertHeatResultsToRaceResults, updateHeatResult } from './heatUtils';
import { generateNextRoundAssignments } from '../types/heat';
import { handicapForRace } from './raceProgress';
import { supabase } from './supabase';

/* ─────────────── handicaps ─────────────── */

export interface HandicapSettings {
  ruleset: LoadedRuleset | null;
  capLimit: number;
  lastPlaceBonus: boolean;
}

/** YachtRaceManager's defaults before a ruleset loads. */
export const DEFAULT_HANDICAP_SETTINGS: HandicapSettings = { ruleset: null, capLimit: 150, lastPlaceBonus: false };

/** YachtRaceManager on load: the event's own ruleset, else the club's, for handicap events. */
export async function loadHandicapSettings(currentEvent: Pick<RaceEvent, 'raceFormat' | 'clubId'> & { handicap_ruleset_id?: string | null }): Promise<HandicapSettings & { eventRulesetId: string | null }> {
  const out = { ...DEFAULT_HANDICAP_SETTINGS, eventRulesetId: null as string | null };
  if (currentEvent.raceFormat === 'handicap' && currentEvent.clubId) {
    if (currentEvent.handicap_ruleset_id) {
      const rs = await loadRulesetById(currentEvent.handicap_ruleset_id);
      if (rs) {
        return { ruleset: rs, eventRulesetId: currentEvent.handicap_ruleset_id, capLimit: rs.config.cap_limit, lastPlaceBonus: rs.config.last_place_bonus_enabled };
      }
    }
    const rs = await loadRulesetForClub(currentEvent.clubId);
    if (rs) {
      return { ...out, ruleset: rs, capLimit: rs.config.cap_limit, lastPlaceBonus: rs.config.last_place_bonus_enabled };
    }
  }
  return out;
}

/** The club's ruleset when there is one, else the AlfiePRO handicap rules. */
export function handicapsFor(skippers: Skipper[], raceResults: any[], numRaces: number, settings: HandicapSettings, isManualHandicaps: boolean) {
  return settings.ruleset
    ? calculateHandicapsWithRuleset(skippers, raceResults, numRaces, settings.ruleset, isManualHandicaps)
    : calculateHandicaps(skippers, raceResults, numRaces, settings.capLimit, settings.lastPlaceBonus, isManualHandicaps);
}

/* ─────────────── heats ─────────────── */

/** replaceRaceResultsForSkippers: a heat's results for a race replaced, each carrying its handicap for the race. */
export function replaceRaceResultsForSkippersIn(
  prevResults: any[],
  skippers: Skipper[],
  race: number,
  skipperIndices: number[],
  newEntries: Array<{ skipperIndex: number; position: number | null; letterScore?: any; customPoints?: number }>
): any[] {
  const skipperSet = new Set(skipperIndices);

  // First, filter out all old results for this race and these skippers
  const filteredResults = prevResults.filter(
    r => !(r.race === race && skipperSet.has(r.skipperIndex))
  );

  // Then add the new entries
  const updatedResults = [...filteredResults];
  newEntries.forEach(entry => {
    const currentHandicap = (() => {
      if (entry.skipperIndex < 0 || entry.skipperIndex >= skippers.length) {
        return 0;
      }
      if (race === 1) {
        return skippers[entry.skipperIndex].startHcap || 0;
      }
      for (let prevRace = race - 1; prevRace >= 1; prevRace--) {
        const prevResult = filteredResults.find(r => r.race === prevRace && r.skipperIndex === entry.skipperIndex);
        if (prevResult && prevResult.adjustedHcap !== undefined && prevResult.adjustedHcap !== null) {
          return prevResult.adjustedHcap;
        }
      }
      return skippers[entry.skipperIndex].startHcap || 0;
    })();

    updatedResults.push({
      race,
      skipperIndex: entry.skipperIndex,
      position: entry.position,
      letterScore: entry.letterScore,
      customPoints: entry.customPoints,
      handicap: currentHandicap,
      adjustedHcap: currentHandicap
    });
  });

  return updatedResults;
}

/**
 * handleUpdateHeatResult, skippers: WDN withdraws the skipper from this round on; a finish or
 * a non-DNC score brings a withdrawn skipper back. Null when nothing changes.
 */
export function skippersAfterHeatResult(skippers: Skipper[], result: HeatResult): Skipper[] | null {
  // If WDN letter score, mark skipper as withdrawn from this round onwards
  if (result.letterScore === 'WDN') {
    const skipperIdx = result.skipperIndex;
    const withdrawRound = result.round;
    if (skippers[skipperIdx] && !skippers[skipperIdx].withdrawnFromRace) {
      const newSkippers = [...skippers];
      newSkippers[skipperIdx] = { ...newSkippers[skipperIdx], withdrawnFromRace: withdrawRound };
      return newSkippers;
    }
  } else if (result.position !== null || (result.letterScore && result.letterScore !== 'DNC')) {
    // Re-entry: if a withdrawn skipper gets a finishing position or non-DNC score,
    // clear their withdrawal - they're back in the competition
    const skipperIdx = result.skipperIndex;
    if (skippers[skipperIdx]?.withdrawnFromRace != null && result.round >= skippers[skipperIdx].withdrawnFromRace!) {
      const newSkippers = [...skippers];
      newSkippers[skipperIdx] = { ...newSkippers[skipperIdx], withdrawnFromRace: undefined };
      return newSkippers;
    }
  }
  return null;
}

/** handleUpdateHeatResult, heats: the result recorded, with DNC in later rounds for a withdrawal. */
export function heatManagementAfterResult(prevHM: HeatManagement, skippers: Skipper[], result: HeatResult): HeatManagement {
  let updated = updateHeatResult(prevHM, result);

  // Auto-DNC for withdrawn skipper in all subsequent existing rounds
  if (result.letterScore === 'WDN') {
    const withdrawRound = result.round;
    const maxSkippersInHeat = Math.max(
      ...updated.rounds.flatMap(r => r.heatAssignments.map(a => a.skipperIndices.length)),
      1
    );

    for (const round of updated.rounds) {
      if (round.round <= withdrawRound) continue;
      // Check if skipper already has a result in this round
      const hasResult = round.results.some(
        r => r.skipperIndex === result.skipperIndex
      );
      if (!hasResult) {
        // Find which heat assignment (if any) this skipper is in for this round
        const assignment = round.heatAssignments.find(a =>
          a.skipperIndices.includes(result.skipperIndex)
        );
        const heatDes = assignment?.heatDesignation || result.heatDesignation;

        const dncResult: HeatResult = {
          skipperIndex: result.skipperIndex,
          position: null,
          letterScore: 'DNC',
          customPoints: maxSkippersInHeat + 1,
          heatDesignation: heatDes,
          race: 1,
          round: round.round
        };
        updated = updateHeatResult(updated, dncResult);
      }
    }
  } else if (result.position !== null && result.letterScore !== 'DNC') {
    // Re-entry: clear any auto-DNC results for subsequent rounds
    // since skipper is back in the competition
    const skipperIdx = result.skipperIndex;
    const skipper = skippers[skipperIdx];
    if (skipper?.withdrawnFromRace != null && result.round >= skipper.withdrawnFromRace) {
      for (const round of updated.rounds) {
        if (round.round <= result.round) continue;
        // Remove auto-DNC results for this skipper in future rounds
        round.results = round.results.filter(
          r => !(r.skipperIndex === skipperIdx && r.letterScore === 'DNC')
        );
      }
    }
  }

  return updated;
}

export interface CompletedHeat {
  heatManagement: HeatManagement;
  /** Race results of the completed rounds (empty: leave the race results as they are). */
  convertedResults: any[];
  completedRoundNumbers: Set<number>;
  /** The round being sailed is now complete. */
  roundCompleted: boolean;
  /** What the scoring screen's last completed race becomes. */
  lastCompletedRace: number;
}

/**
 * handleCompleteHeat: promotions / relegations for the heat (hms / shrs rules), DNC for withdrawn
 * skippers in new rounds, and the completed rounds' race results.
 */
export function completeHeatIn(prevHM: HeatManagement, heat: HeatDesignation, dropRules: number[] | string, skippers: Skipper[]): CompletedHeat {
  let updatedHeatManagement = completeHeat(prevHM, heat, dropRules);

  // Auto-DNC withdrawn skippers in newly created rounds
  const withdrawnSkippers = skippers
    .map((s, i) => ({ index: i, withdrawnFromRace: s.withdrawnFromRace }))
    .filter(s => s.withdrawnFromRace != null);

  if (withdrawnSkippers.length > 0) {
    const maxHeatSize = Math.max(
      ...updatedHeatManagement.rounds.flatMap(r => r.heatAssignments.map(a => a.skipperIndices.length)),
      1
    );
    for (const ws of withdrawnSkippers) {
      for (const round of updatedHeatManagement.rounds) {
        if (round.round < ws.withdrawnFromRace!) continue;
        const hasResult = round.results.some(r => r.skipperIndex === ws.index);
        if (!hasResult) {
          const assignment = round.heatAssignments.find(a => a.skipperIndices.includes(ws.index));
          const heatDes = assignment?.heatDesignation || 'A' as HeatDesignation;
          updatedHeatManagement = updateHeatResult(updatedHeatManagement, {
            skipperIndex: ws.index,
            position: null,
            letterScore: 'DNC',
            customPoints: maxHeatSize + 1,
            heatDesignation: heatDes,
            race: 1,
            round: round.round
          });
        }
      }
    }
  }

  const convertedResults = convertHeatResultsToRaceResults(updatedHeatManagement, skippers);
  const completedRoundNumbers = new Set(
    updatedHeatManagement.rounds.filter(r => r.completed).map(r => r.round)
  );
  const currentRoundData = updatedHeatManagement.rounds.find(r => r.round === updatedHeatManagement.currentRound);
  const roundCompleted = !!currentRoundData?.completed;
  const completedRounds = updatedHeatManagement.rounds.filter(r => r.completed);
  const highestCompletedRound = completedRounds.length > 0
    ? Math.max(...completedRounds.map(r => r.round))
    : 0;
  return {
    heatManagement: updatedHeatManagement,
    convertedResults,
    completedRoundNumbers,
    roundCompleted,
    lastCompletedRace: roundCompleted ? updatedHeatManagement.currentRound : highestCompletedRound,
  };
}

/** handleCompleteHeat: completed rounds' converted results replace those races; races in progress stay. */
export function mergeCompletedRoundResults(prevResults: any[], convertedResults: any[], completedRoundNumbers: Set<number>): any[] {
  const inProgressResults = prevResults.filter(r => !completedRoundNumbers.has(r.race));
  return [...convertedResults, ...inProgressResults];
}

/* ─────────────── confirming a race (no heats) ─────────────── */

export interface ConfirmContext {
  skippers: Skipper[];
  numRaces: number;
  lastCompletedRace: number;
  raceType: 'scratch' | 'handicap' | string | undefined;
  isManualHandicaps: boolean;
  hasDeterminedInitialHcaps: boolean;
}

export interface ConfirmedRace {
  highestConsecutiveRace: number;
  newLastCompleted: number;
  /** A new race was completed. */
  advanced: boolean;
  /** One more race is added when the last planned race is completed. */
  numRaces: number;
  skippers: Skipper[];
  isManualHandicaps: boolean;
  hasDeterminedInitialHcaps: boolean;
  /** Races whose new handicaps go to the members' boats. */
  memberHandicapRaces: number[];
}

/** Touch mode confirm: the race is complete once every boat has a result (handicap: at least half, and two). */
export function confirmTouchRace(latestResults: any[], ctx: ConfirmContext): ConfirmedRace {
  const { skippers, raceType, lastCompletedRace } = ctx;
  const currentNumRaces = ctx.numRaces;
  const out: ConfirmedRace = {
    highestConsecutiveRace: 0,
    newLastCompleted: lastCompletedRace,
    advanced: false,
    numRaces: currentNumRaces,
    skippers,
    isManualHandicaps: ctx.isManualHandicaps,
    hasDeterminedInitialHcaps: ctx.hasDeterminedInitialHcaps,
    memberHandicapRaces: [],
  };

  let highestConsecutiveRace = 0;
  for (let r = 1; r <= currentNumRaces; r++) {
    const isComplete = skippers.every((skipper, index) => {
      const result = latestResults.find(res => res.race === r && res.skipperIndex === index);
      if (result && (result.position !== null || result.letterScore)) {
        return true;
      }
      if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) {
        return true;
      }
      return false;
    });
    if (isComplete) {
      highestConsecutiveRace = r;
    } else {
      // For handicap races, accept if at least half the skippers have results
      if (raceType === 'handicap') {
        const raceResultsForR = latestResults.filter(res => res.race === r && (res.position !== null || res.letterScore));
        if (raceResultsForR.length >= Math.ceil(skippers.length * 0.5) && raceResultsForR.length >= 2) {
          highestConsecutiveRace = r;
          continue;
        }
      }
      break;
    }
  }

  out.highestConsecutiveRace = highestConsecutiveRace;
  out.newLastCompleted = Math.max(highestConsecutiveRace, lastCompletedRace);

  if (highestConsecutiveRace > lastCompletedRace) {
    out.advanced = true;

    if (highestConsecutiveRace >= currentNumRaces) {
      out.numRaces = currentNumRaces + 1;
    }

    if (raceType === 'handicap') {
      const race1Complete = highestConsecutiveRace >= 1 && skippers.every((_, index) => {
        const result = latestResults.find(r => r.race === 1 && r.skipperIndex === index);
        return result && (result.position !== null || result.letterScore);
      });

      if (race1Complete && !ctx.isManualHandicaps && !ctx.hasDeterminedInitialHcaps) {
        const hasPresetHandicaps = skippers.some(s => s.startHcap > 0);
        if (!hasPresetHandicaps) {
          const step = 10;
          const ranking = skippers.map((_, idx) => ({
            idx,
            pos: latestResults.find(r => r.race === 1 && r.skipperIndex === idx)?.position || 0
          })).sort((a, b) => a.pos - b.pos);

          const updatedSkippers = [...skippers];
          ranking.forEach((r, rank) => {
            const handicap = rank * step;
            updatedSkippers[r.idx] = { ...updatedSkippers[r.idx], startHcap: handicap };
          });

          out.skippers = updatedSkippers;
        } else {
          out.isManualHandicaps = true;
        }
        out.hasDeterminedInitialHcaps = true;
      }

      for (let r = lastCompletedRace + 1; r <= highestConsecutiveRace; r++) {
        out.memberHandicapRaces.push(r);
      }
    }
  }
  return out;
}

/* ─────────────── members' boats ─────────────── */

/** updateMemberHandicaps: each boat's new handicap after a race goes on the member's boat (and their other boats of that class). */
export async function updateMemberHandicapsFor(skippers: Skipper[], race: number, results: any[], ruleset: LoadedRuleset | null): Promise<void> {
  if (ruleset && ruleset.config.persist_handicaps === false) {
    return;
  }
  try {
    const handicapUpdates = skippers
      .map((skipper, index) => {
        const result = results.find(r => r.race === race && r.skipperIndex === index);
        if (result && result.adjustedHcap !== undefined && skipper.boatId) {
          return {
            boatId: skipper.boatId,
            memberId: skipper.memberId,
            handicap: result.adjustedHcap
          };
        }
        return null;
      })
      .filter(update => update !== null) as { boatId: string; memberId?: string; handicap: number }[];

    for (const update of handicapUpdates) {
      const { error } = await supabase
        .from('member_boats')
        .update({ handicap: update.handicap })
        .eq('id', update.boatId);

      if (error) {
        console.error(`Error updating handicap for boat ${update.boatId}:`, error);
        continue;
      }

      if (update.memberId) {
        const { data: thisBoat } = await supabase
          .from('member_boats')
          .select('boat_type, member_id')
          .eq('id', update.boatId)
          .maybeSingle();

        if (thisBoat?.boat_type) {
          await supabase
            .from('member_boats')
            .update({ handicap: update.handicap })
            .eq('member_id', thisBoat.member_id)
            .eq('boat_type', thisBoat.boat_type)
            .neq('id', update.boatId);
        }
      }
    }
  } catch (error) {
    console.error('Error updating boat handicaps:', error);
  }
}

/**
 * Touch mode's handicap override: the boat's handicap after its latest race is set by hand
 * (and kept when handicaps are recalculated). Null when the boat has no race with a handicap yet.
 */
export function overrideHandicapIn(raceResults: any[], skipperIndex: number, value: number): any[] | null {
  const latestRace = Math.max(
    ...raceResults
      .filter(r => r.skipperIndex === skipperIndex && r.adjustedHcap !== undefined)
      .map(r => r.race),
    0
  );
  if (latestRace === 0) return null;
  return raceResults.map(r =>
    r.race === latestRace && r.skipperIndex === skipperIndex
      ? { ...r, adjustedHcap: value, handicapOverride: true }
      : r
  );
}

/**
 * handleAdvanceToNextRound ("Advance to Race N"): completes the heat given (or goes to the round
 * given), creating the next round's heats from the finished round when needed. Returns the heat
 * management to use, and the race results of the completed rounds when there are any.
 */
export function advanceToNextRoundIn(prevHM: HeatManagement, heatOrRound: HeatDesignation | number, currentDropRules: number[] | string, skippers: Skipper[]): { heatManagement: HeatManagement; convertedResults: any[]; lastCompletedRace: number | null } {
      let updatedHM = prevHM;

      const isHeatDesignation = typeof heatOrRound === 'string' && ['A', 'B', 'C', 'D', 'E', 'F'].includes(heatOrRound);

      if (isHeatDesignation) {
        updatedHM = completeHeat(prevHM, heatOrRound as HeatDesignation, currentDropRules);
      }

      const currentRoundData = updatedHM.rounds.find(r => r.round === updatedHM.currentRound);
      const isCurrentRoundComplete = currentRoundData?.completed;

      let targetRoundNumber: number;
      if (typeof heatOrRound === 'number') {
        targetRoundNumber = heatOrRound;
      } else {
        targetRoundNumber = updatedHM.currentRound + (isCurrentRoundComplete ? 1 : 0);
      }

      let targetRoundExists = updatedHM.rounds.some(r => r.round === targetRoundNumber);

      if (!targetRoundExists) {
        // If the current round is complete, create the next round dynamically
        const currentRd = updatedHM.rounds.find(r => r.round === updatedHM.currentRound);
        if (currentRd?.completed && targetRoundNumber === updatedHM.currentRound + 1) {
          try {
            const nextRoundAssignments = generateNextRoundAssignments(currentRd, updatedHM);
            updatedHM = {
              ...updatedHM,
              rounds: [...updatedHM.rounds, {
                round: targetRoundNumber,
                heatAssignments: nextRoundAssignments,
                results: [],
                completed: false
              }]
            };
            targetRoundExists = true;
          } catch (e) {
            console.error('Failed to create next round:', e);
          }
        }

        if (!targetRoundExists) {
          console.error('Target round', targetRoundNumber, 'does not exist');
          return { heatManagement: updatedHM, convertedResults: [], lastCompletedRace: null };
        }
      }

      const result = {
        ...updatedHM,
        currentRound: targetRoundNumber,
        roundJustCompleted: undefined
      };

      const convertedResults = convertHeatResultsToRaceResults(result, skippers);
      return { heatManagement: result, convertedResults, lastCompletedRace: convertedResults.length > 0 ? targetRoundNumber - 1 : null };
}


export interface CellEditContext {
  skippers: Skipper[];
  raceResults: any[];
  raceType: string | undefined;
  isManualHandicaps: boolean;
  hasDeterminedInitialHcaps: boolean;
  lastCompletedRace: number;
  currentNumRaces: number;
  /** Touch mode waits for Confirm before a race counts as complete. */
  scoringMode: 'pro' | 'touch' | 'spreadsheet' | string;
}

export interface CellEdit {
  raceResults: any[];
  /** Set when the edit changes the skippers (re-entry, race-1 seeding). */
  skippers?: Skipper[];
  isManualHandicaps?: boolean;
  hasDeterminedInitialHcaps?: boolean;
  /** Set when the last completed race changes. */
  lastCompletedRace?: number;
  /** The race is complete and the results are saved straight away (not in Touch mode). */
  raceCompleted?: { highestConsecutiveRace: number };
  /** Handicap races: this race's new handicaps go to the members' boats. */
  memberHandicapRace?: number;
}

/**
 * YachtRaceManager.updateRaceResults (Pro mode and the spreadsheet): one boat's result in one
 * race set or corrected, with its handicap for the race, withdrawals and WDN, race-1 handicap
 * seeding, and the race counted complete once every boat has a result.
 */
export function editRaceResultIn(ctx: CellEditContext, race: number, skipperIndex: number, position: number | null, letterScore?: any, customPoints?: number, hmsHeat?: string, hmsPosition?: number): CellEdit {
    const { skippers, raceResults, raceType, isManualHandicaps, hasDeterminedInitialHcaps, lastCompletedRace, currentNumRaces, scoringMode } = ctx;
    const out: CellEdit = { raceResults };
    const newResults = [...raceResults];
    const resultIndex = hmsHeat !== undefined
      ? newResults.findIndex(
          r => r.race === race && r.skipperIndex === skipperIndex && r.hmsHeat === hmsHeat
        )
      : newResults.findIndex(
          r => r.race === race && r.skipperIndex === skipperIndex
        );

    // Get the handicap for this race - use previous race's adjusted handicap or starting handicap
    const getCurrentHandicapForRace = (raceNum: number, skipIdx: number): number => handicapForRace(skippers, newResults, raceNum, skipIdx);

    const currentHandicap = getCurrentHandicapForRace(race, skipperIndex);

    const skipperSailNo = (() => {
      const s = skippers[skipperIndex];
      return s ? String(s.sailNumber || s.sailNo || s.boat_sail_number || '').trim() : '';
    })();

    if (resultIndex >= 0) {
      const { handicapOverride: _ho, ...existingWithoutOverride } = newResults[resultIndex];
      newResults[resultIndex] = {
        ...existingWithoutOverride,
        position,
        letterScore,
        customPoints,
        handicap: currentHandicap,
        adjustedHcap: currentHandicap,
        ...(hmsHeat !== undefined && { hmsHeat }),
        ...(hmsPosition !== undefined && { hmsPosition }),
        ...(hmsHeat !== undefined && skipperSailNo && { hmsSailNumber: skipperSailNo }),
      };
    } else {
      newResults.push({
        race,
        skipperIndex,
        position,
        letterScore,
        customPoints,
        handicap: currentHandicap,
        adjustedHcap: currentHandicap,
        ...(hmsHeat !== undefined && { hmsHeat }),
        ...(hmsPosition !== undefined && { hmsPosition }),
        ...(hmsHeat !== undefined && skipperSailNo && { hmsSailNumber: skipperSailNo }),
      });
    }

    // Clear handicapOverride flags on later races so recalculation cascades properly
    for (let i = 0; i < newResults.length; i++) {
      if (newResults[i].race > race && newResults[i].handicapOverride) {
        const { handicapOverride: _ho2, ...rest } = newResults[i];
        newResults[i] = rest;
      }
    }

    // Re-entry: if a withdrawn skipper gets an actual finishing position,
    // clear their withdrawal flag - they're back in the competition
    if (position !== null && letterScore !== 'WDN' && letterScore !== 'DNC') {
      const skipper = skippers[skipperIndex];
      if (skipper?.withdrawnFromRace != null && race >= skipper.withdrawnFromRace) {
        const newSkippers = [...skippers];
        newSkippers[skipperIndex] = { ...newSkippers[skipperIndex], withdrawnFromRace: undefined };
        out.skippers = newSkippers;
        // Remove any auto-generated WDN results for this skipper in this and future races
        const filteredResults = newResults.filter(r => {
          if (r.skipperIndex !== skipperIndex) return true;
          if (r.race < race) return true;
          if (r.race === race) return true; // keep the current result we just set
          // Remove future WDN results (they were auto-generated)
          return r.letterScore !== 'WDN';
        });
        newResults.length = 0;
        newResults.push(...filteredResults);
      }
    }

    // Check if this is the first NON-WITHDRAWN result being entered for this race
    // If so, auto-score any withdrawn skippers
    // Only count actual skipper results, not withdrawn skippers (WDN)
    const existingNonWithdrawnResults = newResults.filter(r =>
      r.race === race && r.letterScore !== 'WDN'
    );
    const isFirstResultForRace = existingNonWithdrawnResults.length === 1 && resultIndex < 0;

    if (isFirstResultForRace) {
      skippers.forEach((skipper, index) => {
        // Check if skipper is withdrawn for this race
        if (skipper.withdrawnFromRace && race >= skipper.withdrawnFromRace) {
          // Check if they don't already have a result for this race
          const hasResult = newResults.some(r => r.race === race && r.skipperIndex === index);
          if (!hasResult) {
            // Get handicap from previous race if available (for handicap racing)
            let handicap = skipper.startHcap || 0;
            if (race > 1 && raceType !== 'scratch') {
              const prevResult = newResults.find(r => r.race === race - 1 && r.skipperIndex === index);
              if (prevResult && prevResult.adjustedHcap !== undefined) {
                handicap = prevResult.adjustedHcap;
              }
            }

            // Create race result for withdrawn skipper
            newResults.push({
              race: race,
              skipperIndex: index,
              position: null,
              letterScore: 'WDN',
              customPoints: skippers.length + 1,
              handicap: raceType !== 'scratch' ? handicap : undefined,
              adjustedHcap: raceType !== 'scratch' ? handicap : undefined
            });
          }
        }
      });
    }

    const race1Complete = race === 1 && skippers.every((_, index) => {
      const result = newResults.find(r => r.race === 1 && r.skipperIndex === index);
      return result && (result.position !== null || result.letterScore);
    });

    if (race === 1 && race1Complete && raceType === 'handicap') {
      const hasPresetHandicaps = skippers.some(s => s.startHcap > 0);
      if (!isManualHandicaps && !hasDeterminedInitialHcaps && !hasPresetHandicaps) {
        const step = 10;
        const ranking = skippers.map((_, idx) => ({
          idx,
          pos: newResults.find(r => r.race === 1 && r.skipperIndex === idx)?.position || 0
        })).sort((a, b) => a.pos - b.pos);

        const updatedSkippers = [...skippers];
        ranking.forEach((r, rank) => {
          const handicap = rank * step;
          updatedSkippers[r.idx] = { ...updatedSkippers[r.idx], startHcap: handicap };
        });

        out.skippers = updatedSkippers;
      } else if (hasPresetHandicaps && !isManualHandicaps) {
        out.isManualHandicaps = true;
      }
      out.hasDeterminedInitialHcaps = true;
      // (correcting race 1 later used to set the last completed race back to 1)
      if (lastCompletedRace < 1) out.lastCompletedRace = 1;
    }
    
    // Only update the race completion status when all skippers have results
    // This prevents premature sorting of skippers during race entry
    const raceComplete = skippers.every((skipper, index) => {
      // Check if skipper has a result
      const result = newResults.find(r => r.race === race && r.skipperIndex === index);
      if (result && (result.position !== null || result.letterScore)) {
        return true;
      }

      // Check if skipper is withdrawn for this race
      if (skipper.withdrawnFromRace && race >= skipper.withdrawnFromRace) {
        return true;
      }

      return false;
    });

    // In touch mode, don't auto-advance to next race until user confirms
    // This prevents the race from jumping forward before the confirm button can be clicked
    if (raceComplete && scoringMode !== 'touch') {
      // Find the highest consecutive completed race starting from race 1
      let highestConsecutiveRace = 0;
      for (let r = 1; r <= currentNumRaces; r++) {
        const isComplete = skippers.every((skipper, index) => {
          // Check if skipper has a result
          const result = newResults.find(res => res.race === r && res.skipperIndex === index);
          if (result && (result.position !== null || result.letterScore)) {
            return true;
          }

          // Check if skipper is withdrawn for this race
          if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) {
            return true;
          }

          return false;
        });
        if (isComplete) {
          highestConsecutiveRace = r;
        } else {
          // For handicap races, also accept a race as complete if it has results
          // with positions for at least half the skippers (handles late-added skippers)
          if (raceType === 'handicap') {
            const raceResultsForR = newResults.filter(res => res.race === r && (res.position !== null || res.letterScore));
            if (raceResultsForR.length >= Math.ceil(skippers.length * 0.5) && raceResultsForR.length >= 2) {
              highestConsecutiveRace = r;
              continue;
            }
          }
          break;
        }
      }

      if (highestConsecutiveRace > lastCompletedRace) {
        out.lastCompletedRace = highestConsecutiveRace;
      }
      out.raceCompleted = { highestConsecutiveRace };

      if (raceType === 'handicap') {
        out.memberHandicapRace = race;
      }
    }

    out.raceResults = newResults;
    return out;
}