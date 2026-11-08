/**
 * Which race and heat sail next, and each boat's handicap for a race. Moved verbatim from the
 * desktop scoring screens (HeatScoringTable heat order / progress / first incomplete heat,
 * YachtRaceManager's race stepper and getCurrentHandicapForRace) so the phone StartBox and the
 * desktop always agree on what's next.
 */
import type { Skipper } from '../types';
import type { HeatDesignation, HeatManagement } from '../types/heat';

/** Pro mode's race stepper: the race after the last completed one, capped at the races planned. */
export function nextRaceNumber(lastCompletedRace: number, numRaces?: number): number {
  return Math.min(lastCompletedRace + 1, numRaces || 1);
}

export function isInQualifyingRound(hm: HeatManagement): boolean {
  const isShrs = hm.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = hm.configuration?.shrsQualifyingRounds || 0;
  return isShrs && shrsQualifyingRounds > 0 && hm.currentRound <= shrsQualifyingRounds;
}

export function isInFinals(hm: HeatManagement): boolean {
  const isShrs = hm.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = hm.configuration?.shrsQualifyingRounds || 0;
  return isShrs && shrsQualifyingRounds > 0 && hm.currentRound > shrsQualifyingRounds;
}

export function currentHeatRound(hm: HeatManagement) {
  const safeCurrentRound = Math.max(1, hm.currentRound || 1);
  return hm.rounds[safeCurrentRound - 1];
}

/** HeatScoringTable availableHeats: the order heats sail in this round (lowest heat first). */
export function heatSailingOrder(hm: HeatManagement): HeatDesignation[] {
  const currentRound = currentHeatRound(hm);
  if (!currentRound) return [];
  const heats = currentRound.heatAssignments
    .map(assignment => assignment.heatDesignation)
    .sort();
  if (isInQualifyingRound(hm)) {
    if (hm.configuration?.heatOrder === 'descending') {
      return [...heats].reverse();
    }
    return heats;
  }
  return heats.reverse();
}

/** HeatScoringTable getHeatProgress: boats scored in a heat of the current round. */
export function heatProgress(hm: HeatManagement, raceResults: any[], heat: HeatDesignation): { scored: number; total: number } {
  const currentRound = currentHeatRound(hm);
  const assignment = currentRound?.heatAssignments.find(
    a => a.heatDesignation === heat
  );
  if (!assignment) return { scored: 0, total: 0 };

  const total = assignment.skipperIndices.length;

  const heatResults = currentRound?.results.filter(r =>
    r.heatDesignation === heat &&
    r.round === hm.currentRound
  ) || [];

  let scoredCount = heatResults.filter(r =>
    r.position !== null || r.letterScore
  ).length;

  if (scoredCount < total) {
    const currentRace = hm.currentRound;
    const raceResultsCount = assignment.skipperIndices.filter(idx =>
      raceResults.some(r =>
        r.skipperIndex === idx &&
        r.race === currentRace &&
        (r.position !== null || r.letterScore)
      )
    ).length;
    if (raceResultsCount > scoredCount) {
      scoredCount = raceResultsCount;
    }
  }

  return {
    scored: scoredCount,
    total
  };
}

/** HeatScoringTable on load / new round: the first incomplete heat, else the lowest heat. */
export function firstIncompleteHeat(hm: HeatManagement, raceResults: any[]): HeatDesignation | null {
  const availableHeats = heatSailingOrder(hm);
  if (availableHeats.length === 0) return null;
  let heatToSelect = availableHeats[0]; // Default to lowest heat
  for (const heat of availableHeats) {
    const progress = heatProgress(hm, raceResults, heat);
    const isComplete = progress.scored >= progress.total && progress.total > 0;
    if (!isComplete) {
      heatToSelect = heat;
      break;
    }
  }
  return heatToSelect;
}

/**
 * YachtRaceManager getCurrentHandicapForRace: race 1 uses the starting handicap, later races
 * the most recent earlier race's adjusted handicap.
 */
export function handicapForRace(skippers: Skipper[], raceResults: any[], raceNum: number, skipIdx: number): number {
  // Bounds check to prevent crashes from invalid skipperIndex
  if (skipIdx < 0 || skipIdx >= skippers.length) {
    console.error(`❌ Invalid skipperIndex ${skipIdx} - skippers array has ${skippers.length} entries (indices 0-${skippers.length - 1})`);
    console.error('Stack trace:', new Error().stack);
    return 0; // Return default handicap instead of crashing
  }

  if (raceNum === 1) {
    return skippers[skipIdx].startHcap || 0;
  }
  // Find the most recent previous race result with an adjusted handicap
  for (let prevRace = raceNum - 1; prevRace >= 1; prevRace--) {
    const prevResult = raceResults.find(r => r.race === prevRace && r.skipperIndex === skipIdx);
    if (prevResult && prevResult.adjustedHcap !== undefined && prevResult.adjustedHcap !== null) {
      return prevResult.adjustedHcap;
    }
  }
  return skippers[skipIdx].startHcap || 0;
}

export const SHRS_FLEET_FULL_NAMES: Record<string, string> = {
  'A': 'Gold Fleet', 'B': 'Silver Fleet', 'C': 'Bronze Fleet',
  'D': 'Copper Fleet', 'E': 'Emerald Fleet', 'F': 'Pewter Fleet',
};

/** HeatScoringTable getShrsRoundLabel: "Race 3", or "Qualifying Rd 2" / "Final 1 - Gold Fleet" for SHRS. */
export function roundLabel(hm: HeatManagement | null, roundNum: number, heat?: HeatDesignation | null): string {
  const isShrs = hm?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = hm?.configuration?.shrsQualifyingRounds || 0;
  if (isShrs && shrsQualifyingRounds > 0) {
    if (roundNum <= shrsQualifyingRounds) {
      return `Qualifying Rd ${roundNum}`;
    }
    const finalNum = roundNum - shrsQualifyingRounds;
    const fleetName = heat ? SHRS_FLEET_FULL_NAMES[heat] : null;
    return fleetName ? `Final ${finalNum} - ${fleetName}` : `Final ${finalNum}`;
  }
  return `Race ${roundNum}`;
}

/** TouchModeScoring: a withdrawn skipper is out from the race they withdrew in. */
export function isWithdrawnFor(skipper: Skipper, race: number): boolean {
  return !!(skipper.withdrawnFromRace && race >= skipper.withdrawnFromRace);
}
