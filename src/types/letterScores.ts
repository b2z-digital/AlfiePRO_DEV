export type LetterScore = 'DNS' | 'DNF' | 'DSQ' | 'OCS' | 'BFD' | 'UFD' | 'RDG' | 'DPI' | 'ZFP' | 'SCP' | 'RET' | 'DNC' | 'DNE' | 'NSC' | 'WDN';

export type HMSPointsType = 'heat_plus_one' | 'entrants_plus_one' | 'manual' | 'percentage_penalty' | 'scoring_penalty';

export interface LetterScoreDefinition {
  code: LetterScore;
  name: string;
  description: string;
  pointsCalculation: 'heat_plus_one' | 'entrants_plus_one' | 'manual' | 'fixed';
  fixedPoints?: number;
  isDiscardable: boolean;
  countsAsStarter: boolean;
}

export const letterScoreDefinitions: LetterScoreDefinition[] = [
  {
    code: 'DNF',
    name: 'Did Not Finish',
    description: 'Boat started the race but did not finish',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'NSC',
    name: 'Not Sailed Correct Course',
    description: 'Boat did not sail the correct course',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'RET',
    name: 'Retired',
    description: 'Boat retired voluntarily during the race',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'OCS',
    name: 'On Course Side',
    description: 'Boat was over the line early and did not return',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'DNS',
    name: 'Did Not Start',
    description: 'Boat came to the race venue but did not start the race',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'DNC',
    name: 'Did Not Compete',
    description: 'Boat did not come to the starting area',
    pointsCalculation: 'heat_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'UFD',
    name: 'U Flag Disqualification',
    description: 'DSQ under rule 30.3 (U flag)',
    pointsCalculation: 'entrants_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'BFD',
    name: 'Black Flag Disqualification',
    description: 'DSQ for breaking the black flag rule 30.4',
    pointsCalculation: 'entrants_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'DSQ',
    name: 'Disqualified',
    description: 'Boat was disqualified from the race for a rule breach',
    pointsCalculation: 'entrants_plus_one',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'DNE',
    name: 'Disqualification Not Excludable',
    description: 'DSQ that cannot be excluded from series score',
    pointsCalculation: 'entrants_plus_one',
    isDiscardable: false,
    countsAsStarter: true
  },
  {
    code: 'WDN',
    name: 'Withdrawn',
    description: 'Boat formally withdrew from the event',
    pointsCalculation: 'entrants_plus_one',
    isDiscardable: true,
    countsAsStarter: false
  },
  {
    code: 'RDG',
    name: 'Redress Given',
    description: 'Points awarded by Race Committee due to unfair disadvantage',
    pointsCalculation: 'manual',
    isDiscardable: true,
    countsAsStarter: true
  },
  {
    code: 'DPI',
    name: 'Discretionary Penalty',
    description: 'Penalty points imposed for sportsmanship or minor breach',
    pointsCalculation: 'manual',
    isDiscardable: false,
    countsAsStarter: true
  },
  {
    code: 'ZFP',
    name: '20% Penalty',
    description: 'Rule 30.2 penalty - 20% added to score without hearing',
    pointsCalculation: 'manual',
    isDiscardable: false,
    countsAsStarter: true
  },
  {
    code: 'SCP',
    name: 'Scoring Penalty',
    description: 'Scoring penalty applied under rule 44.3',
    pointsCalculation: 'manual',
    isDiscardable: false,
    countsAsStarter: true
  }
];

export function calculateLetterScorePoints(
  letterScore: LetterScore,
  heatSize: number,
  customPoints?: number,
  totalEntrants?: number
): number {
  const definition = letterScoreDefinitions.find(def => def.code === letterScore);
  if (!definition) {
    return heatSize + 1;
  }

  switch (definition.pointsCalculation) {
    case 'heat_plus_one':
      return heatSize + 1;
    case 'entrants_plus_one':
      return (totalEntrants || heatSize) + 1;
    case 'manual':
      return customPoints || heatSize + 1;
    case 'fixed':
      return definition.fixedPoints || heatSize + 1;
    default:
      return heatSize + 1;
  }
}

export function isEntrantsPlusOne(letterScore: LetterScore): boolean {
  const definition = letterScoreDefinitions.find(def => def.code === letterScore);
  return definition?.pointsCalculation === 'entrants_plus_one';
}

export function isHeatPlusOne(letterScore: LetterScore): boolean {
  const definition = letterScoreDefinitions.find(def => def.code === letterScore);
  return definition?.pointsCalculation === 'heat_plus_one';
}

export function calculateStarterCount(raceResults: any[]): number {
  return raceResults.filter(result => {
    if (result.position !== null && result.position !== undefined) {
      return true;
    }

    if (result.letterScore) {
      const definition = letterScoreDefinitions.find(def => def.code === result.letterScore);
      return definition?.countsAsStarter || false;
    }

    return false;
  }).length;
}

export function getLetterScoreDefinition(code: LetterScore): LetterScoreDefinition | undefined {
  return letterScoreDefinitions.find(def => def.code === code);
}

export function isScoreDiscardable(letterScore: LetterScore | string | null | undefined): boolean {
  if (!letterScore) return true;
  const definition = letterScoreDefinitions.find(def => def.code === letterScore);
  return definition?.isDiscardable !== false;
}

export function getLetterScoreDisplayCode(letterScore: string | null | undefined, customPoints?: number): string {
  if (!letterScore) return '';
  if (letterScore === 'RDG') {
    if (customPoints !== undefined && customPoints > 0) return 'RDGfix';
    if (customPoints === -1) return 'RDGave';
    if (customPoints === -2) return 'RDGave';
    return 'RDG';
  }
  return letterScore;
}
