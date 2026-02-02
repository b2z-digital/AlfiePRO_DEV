export type RaceType = 'handicap' | 'scratch';

export type BoatType = string;

export type LetterScore = 'DNS' | 'DNF' | 'DSQ' | 'OCS' | 'BFD' | 'RDG' | 'DPI' | 'RET' | 'DNC' | 'DNE' | 'NSC' | 'WDN';

export const letterScoreDescriptions: Record<LetterScore, string> = {
  'DNF': 'Did not finish',
  'RET': 'Retired',
  'DNS': 'Did not start',
  'DNC': 'Did not compete',
  'DSQ': 'Disqualified',
  'BFD': 'Black flag disqualification',
  'RDG': 'Redress given',
  'DPI': 'Discretionary penalty',
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
    case 'RET':
      return numFinishers + 1;
    case 'DNS':
    case 'DNC':
      return totalCompetitors + 1;
    case 'DSQ':
    case 'BFD':
    case 'OCS':
      return totalCompetitors + 1;
    case 'DNE':
      return totalCompetitors + 2;
    case 'RDG':
    case 'DPI':
      return 0; // These are handled separately (manual points)
    case 'NSC':
    case 'WDN':
      return totalCompetitors + 1;
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
  country_code?: string; // Country code for international events (e.g., 'AUS', 'NZL', 'USA')
  country?: string; // Full country name
  category?: string; // Sailor category
  state?: string; // State/province
}