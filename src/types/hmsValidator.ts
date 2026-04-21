export interface ParsedHMSSkipper {
  position: number;
  name: string;
  sailNumber: string;
  club?: string;
  hull?: string;
  myaNumber?: string;
  totalScore?: number;
  raceScores: { [raceNumber: string]: number | string }; // number or letter score
}

export interface ParsedHMSRaceResult {
  raceNumber: number;
  heat?: string; // 'A', 'B', 'C', etc. for heat scoring
  sailNumber: string;
  position: number | null;
  points: number;
  letterScore?: string; // 'DNF', 'DNS', 'DNC', 'DSQ', 'RDG', etc.
  comment?: string;
  customPoints?: number; // Fixed points for RDGfix, -1 for RDGave
}

export interface ParsedHMSData {
  eventName?: string;
  eventDate?: string;
  hostClub?: string;
  skippers: ParsedHMSSkipper[];
  results: ParsedHMSRaceResult[];
  numRaces: number;
  hasHeats: boolean;
  heats?: string[]; // ['A', 'B', 'C', 'D', 'E']
  promotionCount?: number;
  worksheetNames: string[];
  rawData?: any; // For debugging
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  confirmed: boolean;
}

export interface ValidationDiscrepancy {
  sailNumber: string;
  skipperName: string;
  raceNumber: number;
  field: string;
  hmsValue: any;
  alfiePROValue: any;
  reason?: string;
}

export interface ValidationResult {
  overallMatch: boolean;
  matchPercentage: number;
  totalComparisons: number;
  matches: number;
  discrepancies: ValidationDiscrepancy[];
  raceValidations: {
    raceNumber: number;
    match: boolean;
    matchPercentage: number;
    discrepancies: ValidationDiscrepancy[];
  }[];
  skippersValidated: number;
  racesValidated: number;
  timestamp: Date;
}

export interface HMSImportOptions {
  detectHeats: boolean;
  detectLetterScores: boolean;
  autoMapFields: boolean;
  validateAgainstAlfiePRO: boolean;
}
