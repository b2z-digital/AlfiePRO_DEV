export type RaceType = 'handicap' | 'scratch';

export type BoatType = string;

export type LetterScore = 'DNS' | 'DNF' | 'DSQ' | 'OCS' | 'BFD' | 'UFD' | 'RDG' | 'DPI' | 'ZFP' | 'SCP' | 'RET' | 'DNC' | 'DNE' | 'NSC' | 'WDN';

export const letterScoreDescriptions: Record<LetterScore, string> = {
  'DNF': 'Did not finish',
  'RET': 'Retired',
  'DNS': 'Did not start',
  'DNC': 'Did not compete',
  'DSQ': 'Disqualified',
  'BFD': 'Black flag disqualification',
  'UFD': 'U flag disqualification',
  'RDG': 'Redress given',
  'DPI': 'Discretionary penalty',
  'ZFP': '20% penalty',
  'SCP': 'Scoring penalty',
  'OCS': 'On course side',
  'DNE': 'Disqualification not excludable',
  'NSC': 'Not sailed - course error',
  'WDN': 'Withdrawal'
};

export const getLetterScoreValue = (
  code: LetterScore | undefined,
  numFinishers: number,
  totalCompetitors: number
): number => {
  if (!code) return 0;

  switch (code) {
    case 'DNF':
    case 'NSC':
    case 'RET':
    case 'OCS':
    case 'DNS':
    case 'DNC':
      return numFinishers + 1;
    case 'UFD':
    case 'BFD':
    case 'DSQ':
    case 'WDN':
      return totalCompetitors + 1;
    case 'DNE':
      return totalCompetitors + 1;
    case 'RDG':
    case 'DPI':
    case 'ZFP':
    case 'SCP':
      return 0;
    default:
      return numFinishers + 1;
  }
};

export interface Skipper {
  name: string;
  sailNo: string;
  sailNumber?: string;
  club: string;
  boatModel: string;
  boatType?: string;
  boat?: string;
  boat_type?: string;
  boat_sail_number?: string;
  hull?: string;
  startHcap: number;
  avatarUrl?: string;
  memberId?: string;
  boatId?: string;
  withdrawnFromRace?: number | null; // Race number from which they withdrew (null = not withdrawn)
  country_code?: string;
  country?: string;
  category?: string;
  state?: string;
  national_ranking?: number;
}