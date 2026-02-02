export type LetterScore = 'DNS' | 'DNF' | 'DSQ' | 'OCS' | 'BFD' | 'RDG' | 'DPI' | 'RET' | 'DNC' | 'DNE' | 'NSC' | 'WDN';

export interface LetterScoreDefinition {
  code: LetterScore;
  name: string;
  description: string;
  pointsCalculation: 'starter_count_plus_one' | 'manual' | 'fixed';
  fixedPoints?: number;
  isDiscardable: boolean;
  countsAsStarter: boolean; // Whether this boat counts towards the starter count
}

export const letterScoreDefinitions: LetterScoreDefinition[] = [
  {
    code: 'DNS',
    name: 'Did Not Start',
    description: 'Boat came to the race venue but did not start the race',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'DNF',
    name: 'Did Not Finish',
    description: 'Boat started the race but did not finish',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'DSQ',
    name: 'Disqualified',
    description: 'Boat was disqualified from the race for a rule breach',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'OCS',
    name: 'On Course Side',
    description: 'Boat was over the line early and did not return',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'BFD',
    name: 'Black Flag Disqualification',
    description: 'DSQ for breaking the black flag start rule',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'RDG',
    name: 'Redress Given',
    description: 'Points awarded by Race Committee due to unfair disadvantage',
    pointsCalculation: 'manual',
    isDiscardable: false,
    countsAsStarter: true
  },
  {
    code: 'DPI',
    name: 'Discretionary Penalty',
    description: 'Penalty points imposed for sportsmanship or minor breach',
    pointsCalculation: 'manual',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'RET',
    name: 'Retired',
    description: 'Boat retired voluntarily during the race',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'DNC',
    name: 'Did Not Compete',
    description: 'Boat did not come to the starting area',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'DNE',
    name: 'Disqualification Not Excludable',
    description: 'DSQ that cannot be excluded from series score',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: false,
    countsAsStarter: true
  },
  {
    code: 'NSC',
    name: 'Not Sailed Correct Course',
    description: 'Boat did not sail the correct course',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'WDN',
    name: 'Withdrawn',
    description: 'Boat formally withdrew from the event',
    pointsCalculation: 'starter_count_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  }
];

/**
 * Calculate points for a letter score based on HMS rules
 * @param letterScore The letter score code
 * @param starterCount Number of boats that actually started the race
 * @param customPoints Manual points (for RDG, DPI)
 * @returns Points to award
 */
export function calculateLetterScorePoints(
  letterScore: LetterScore,
  starterCount: number,
  customPoints?: number
): number {
  const definition = letterScoreDefinitions.find(def => def.code === letterScore);
  if (!definition) {
    throw new Error(`Unknown letter score: ${letterScore}`);
  }

  switch (definition.pointsCalculation) {
    case 'starter_count_plus_one':
      return starterCount + 1;
    case 'manual':
      return customPoints || starterCount + 1;
    case 'fixed':
      return definition.fixedPoints || starterCount + 1;
    default:
      return starterCount + 1;
  }
}

/**
 * Calculate the starter count for a race based on HMS rules
 * Only counts boats that actually started (excludes DNS, BFD, OCS that didn't return)
 * @param raceResults All results for a specific race
 * @returns Number of boats that started
 */
export function calculateStarterCount(raceResults: any[]): number {
  return raceResults.filter(result => {
    // Count boats with numeric positions
    if (result.position !== null && result.position !== undefined) {
      return true;
    }
    
    // Count boats with letter scores that indicate they started
    if (result.letterScore) {
      const definition = letterScoreDefinitions.find(def => def.code === result.letterScore);
      return definition?.countsAsStarter || false;
    }
    
    return false;
  }).length;
}

/**
 * Get letter score definition by code
 */
export function getLetterScoreDefinition(code: LetterScore): LetterScoreDefinition | undefined {
  return letterScoreDefinitions.find(def => def.code === code);
}