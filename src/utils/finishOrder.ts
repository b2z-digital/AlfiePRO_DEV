/**
 * The finish order of one race and how it is written into the race results. Moved verbatim
 * from the desktop Touch mode (TouchModeScoring: loading a race's finish order, tapping a
 * finisher, removing one, letter scores, dragging, saving) so the phone finish pad records
 * exactly what the desktop records.
 */
import type { Skipper } from '../types';
import type { LetterScore } from '../types/letterScores';

/** A race result row as the scoring screens keep them (event raceResults). */
export interface RaceResult {
  race: number;
  skipperIndex: number;
  position: number | null;
  letterScore?: any;
  customPoints?: number;
  handicapOverride?: boolean;
  adjustedHcap?: number;
  [key: string]: any;
}

/** Letter scores that keep the boat's finishing place (the committee sets the points). */
export const POSITION_PRESERVING_SCORES = new Set<string>(['RDG', 'DPI', 'ZFP', 'SCP']);

export interface FinishingEntry {
  skipperIndex: number;
  sailNumber: string;
  skipperName: string;
  position: number;
  letterScore?: string | null;
  customPoints?: number;
}

/** The sail-number grid order: numeric sail numbers ascending, then the rest alphabetically. */
export function sailSortedIndices(skippers: Skipper[]): number[] {
  return skippers
    .map((s, idx) => ({ idx, sail: String(s.sailNumber || s.sailNo || '').trim() }))
    .sort((a, b) => {
      const aNum = parseInt(a.sail, 10);
      const bNum = parseInt(b.sail, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.sail.localeCompare(b.sail);
    })
    .map(item => item.idx);
}

/**
 * A race's finish order from its results. Withdrawn skippers are added as WDN; their results
 * (with the handicap they carry) are returned so the caller can save them, as the desktop does.
 */
export function loadFinishOrder(skippers: Skipper[], raceResults: RaceResult[], currentRace: number): { entries: FinishingEntry[]; withdrawnResults: any[] } {
  const currentResults = raceResults.filter(r => r.race === currentRace);
  const entries: FinishingEntry[] = [];
  const newWithdrawnResults: any[] = [];

  currentResults.forEach(result => {
    if (result.position !== null || result.letterScore) {
      const skipper = skippers[result.skipperIndex];
      if (skipper) {
        entries.push({
          skipperIndex: result.skipperIndex,
          sailNumber: skipper.sailNumber || skipper.sailNo,
          skipperName: skipper.name,
          position: result.position || 999,
          letterScore: result.letterScore,
          customPoints: result.customPoints
        });
      }
    }
  });

  // Add withdrawn skippers automatically and create results for them
  skippers.forEach((skipper, index) => {
    // Check if skipper is withdrawn for this race
    if (skipper.withdrawnFromRace && currentRace >= skipper.withdrawnFromRace) {
      // Check if they're not already in the entries
      const alreadyAdded = entries.some(e => e.skipperIndex === index);
      if (!alreadyAdded) {
        entries.push({
          skipperIndex: index,
          sailNumber: skipper.sailNumber || skipper.sailNo || '',
          skipperName: skipper.name,
          position: 999,
          letterScore: 'WDN',
          customPoints: skippers.length + 1
        });

        // Get handicap from withdrawal race or previous race
        let handicap = skipper.startHcap || 0;
        if (currentRace > skipper.withdrawnFromRace) {
          // Use handicap from previous race if available
          const prevResult = raceResults.find(r => r.race === currentRace - 1 && r.skipperIndex === index);
          if (prevResult && prevResult.adjustedHcap !== undefined) {
            handicap = prevResult.adjustedHcap;
          }
        }

        newWithdrawnResults.push({
          race: currentRace,
          skipperIndex: index,
          position: null,
          letterScore: 'WDN',
          customPoints: skippers.length + 1,
          handicap: handicap,
          adjustedHcap: handicap
        });
      }
    }
  });

  return { entries: sortFinishOrder(entries), withdrawnResults: newWithdrawnResults };
}

/**
 * Regular finishes first by place, then letter scores: the order Touch mode shows once a change
 * is saved and the race's results are read back.
 */
export function sortFinishOrder(entries: FinishingEntry[]): FinishingEntry[] {
  // Sort by position (regular finishes first, then letter scores)
  return entries.sort((a, b) => {
    if (a.letterScore && !b.letterScore) return 1;
    if (!a.letterScore && b.letterScore) return -1;
    return a.position - b.position;
  });
}

/** A boat crosses: it takes the next place after the boats already finished. Null if it's already in. */
export function addFinish(finishOrder: FinishingEntry[], skippers: Skipper[], skipperIndex: number): FinishingEntry[] | null {
  const alreadyFinished = finishOrder.find(e => e.skipperIndex === skipperIndex);
  if (alreadyFinished) return null;
  const skipper = skippers[skipperIndex];
  if (!skipper) return null;

  const nextPosition = finishOrder.filter(e => !e.letterScore).length + 1;
  const newEntry: FinishingEntry = {
    skipperIndex,
    sailNumber: skipper.sailNumber || skipper.sailNo,
    skipperName: skipper.name,
    position: nextPosition
  };
  return [...finishOrder, newEntry];
}

/** Takes a boat out of the finish order; the places after it move up. */
export function removeFinish(finishOrder: FinishingEntry[], skipperIndex: number): FinishingEntry[] {
  const newFinishOrder = finishOrder.filter(e => e.skipperIndex !== skipperIndex).map(e => ({ ...e }));

  // Recalculate positions
  newFinishOrder.forEach((entry, index) => {
    if (!entry.letterScore) {
      entry.position = index + 1;
    }
  });
  return newFinishOrder;
}

/**
 * Gives a boat a letter score (null clears it). RDG, DPI, ZFP and SCP keep the boat's place;
 * the others move it after the finishers.
 */
export function applyLetterScore(finishOrder: FinishingEntry[], skippers: Skipper[], skipperIndex: number, letterScore: LetterScore | null, customPoints?: number): FinishingEntry[] {
  if (letterScore === null) {
    // Clear letter score - remove from finish order
    const newFinishOrder = finishOrder.filter(e => e.skipperIndex !== skipperIndex).map(e => ({ ...e }));
    // Recalculate positions
    newFinishOrder.forEach((entry, index) => {
      if (!entry.letterScore) {
        entry.position = newFinishOrder.filter((e, i) => i <= index && !e.letterScore).length;
      }
    });
    return newFinishOrder;
  }

  const existingEntry = finishOrder.find(e => e.skipperIndex === skipperIndex);
  if (existingEntry) {
    const preservesPosition = letterScore && POSITION_PRESERVING_SCORES.has(letterScore);
    if (preservesPosition) {
      // Keep entry in its current position - just add the letter score
      return finishOrder.map(e =>
        e.skipperIndex === skipperIndex
          ? { ...e, letterScore, customPoints }
          : e
      );
    }
    // Move to end for non-position-preserving scores
    const withoutCurrent = finishOrder.filter(e => e.skipperIndex !== skipperIndex);
    const updatedEntry: FinishingEntry = {
      ...existingEntry,
      letterScore,
      customPoints,
      position: 999
    };
    return [...withoutCurrent, updatedEntry];
  }

  // Add new entry with letter score at the end
  const skipper = skippers[skipperIndex];
  const newEntry: FinishingEntry = {
    skipperIndex,
    sailNumber: skipper.sailNumber,
    skipperName: skipper.name,
    position: 999,
    letterScore,
    customPoints
  };
  return [...finishOrder, newEntry];
}

/** Drag a boat to another place in the finish order. */
export function moveFinish(finishOrder: FinishingEntry[], fromIndex: number, toIndex: number): FinishingEntry[] {
  const newOrder = finishOrder.map(e => ({ ...e }));
  const [draggedItem] = newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, draggedItem);

  // Recalculate positions for non-letter scores
  newOrder.forEach((entry, index) => {
    if (!entry.letterScore) {
      entry.position = newOrder.filter((e, i) => i <= index && !e.letterScore).length;
    }
  });
  return newOrder;
}

/** Writes a race's finish order into the results, replacing that race's earlier results. */
export function finishOrderToResults(raceResults: RaceResult[], currentRace: number, entries: FinishingEntry[]): RaceResult[] {
  const updatedResults = [...raceResults];

  // Remove old results for this race
  const filteredResults = updatedResults.filter(r => r.race !== currentRace);

  // Clear handicapOverride flags on later races so recalculation cascades properly
  for (let i = 0; i < filteredResults.length; i++) {
    if (filteredResults[i].race > currentRace && filteredResults[i].handicapOverride) {
      const { handicapOverride, ...rest } = filteredResults[i];
      filteredResults[i] = rest;
    }
  }

  // Add new results
  entries.forEach(entry => {
    const preservesPosition = entry.letterScore && POSITION_PRESERVING_SCORES.has(entry.letterScore);
    const newResult = {
      race: currentRace,
      skipperIndex: entry.skipperIndex,
      position: entry.letterScore && !preservesPosition ? null : entry.position,
      letterScore: entry.letterScore || undefined,
      customPoints: entry.customPoints
    };
    filteredResults.push(newResult);
  });

  return filteredResults;
}

export interface PreviousResult { position: number | null; letterScore?: string; customPoints?: number; points: number; raceNumber?: number }

/** Touch mode's letter score sheet: a skipper's earlier races with the points each scored (for redress averages). */
export function previousResultsFor(raceResults: RaceResult[], currentRace: number, skipperIndex: number): PreviousResult[] {
  const skipperPreviousResults: PreviousResult[] = [];

  for (let r = 1; r < currentRace; r++) {
    const result = raceResults.find(res => res.race === r && res.skipperIndex === skipperIndex);
    if (result) {
      const position = result.position;
      const letterScore = result.letterScore;
      const customPoints = result.customPoints;

      let points = 0;
      if (letterScore === 'RDG' || letterScore === 'DPI') {
        points = (customPoints && customPoints > 0) ? customPoints : 0;
      } else if (position !== null && position > 0) {
        points = position;
      } else if (letterScore) {
        const numStarters = raceResults.filter(res => res.race === r).length;
        points = numStarters + 1;
      }

      skipperPreviousResults.push({
        position,
        letterScore,
        customPoints,
        points,
        raceNumber: r
      });
    }
  }
  return skipperPreviousResults;
}

export interface RedressContext {
  isHeatRacing?: boolean;
  isSHRS?: boolean;
  isMultiDay?: boolean;
  numberOfDays?: number;
  currentDay?: number;
  racesPerDay?: Record<number, number[]>;
}

/** LetterScoreSelector's redress average (rounded to 0.1), or null with no races to average. */
export function redressAverage(skipperPreviousResults: PreviousResult[], excludeR1ForHeat: boolean, excludeFinalDay: boolean, ctx: RedressContext): number | null {
  const { isHeatRacing = false, isSHRS = false, isMultiDay = false, numberOfDays = 1, currentDay = 1, racesPerDay = {} } = ctx;
  const getFilteredResults = () => {
    if (!skipperPreviousResults || skipperPreviousResults.length === 0) {
      return [];
    }

    let results = [...skipperPreviousResults];

    // HMS excludes R1 from average; SHRS does NOT (SHRS Rule 5.6 averages all rounds in phase)
    if (excludeR1ForHeat && isHeatRacing && !isSHRS) {
      results = results.filter(r => r.raceNumber !== 1);
    }

    if (excludeFinalDay && isMultiDay && numberOfDays > 1) {
      const finalDayRaces = racesPerDay[numberOfDays] || racesPerDay[currentDay] || [];
      if (finalDayRaces.length > 0) {
        results = results.filter(r => !finalDayRaces.includes(r.raceNumber || 0));
      }
    }

    return results.filter(result => {
      if (result.position !== null && result.position > 0) return true;
      if ((result.letterScore === 'RDG' || result.letterScore === 'DPI') && result.customPoints && result.customPoints > 0) return true;
      return false;
    });
  };

  const validResults = getFilteredResults();
  if (validResults.length === 0) return null;

  const totalPoints = validResults.reduce((sum, result) => sum + result.points, 0);
  const average = totalPoints / validResults.length;
  return Math.round(average * 10) / 10;
}

/**
 * What a letter score is worth, as LetterScoreSelector passes it: ROD and the redress averages
 * are flags the results engine works out (-1 average all races, -2 to the penultimate day,
 * -3 average of the series); DPI, ZFP, SCP and fixed redress carry the committee's points.
 */
export const REDRESS_AVERAGE_ALL = -1;
export const REDRESS_AVERAGE_PENULTIMATE = -2;
export const REDRESS_AVERAGE_SERIES = -3;
export const ROD_POINTS_FLAG = -1;
export const CUSTOM_POINTS_CODES = ['RDG', 'DPI', 'ZFP', 'SCP'] as const;
