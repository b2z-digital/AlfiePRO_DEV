import Papa from 'papaparse';
import { Skipper, LetterScore } from '../types';
import { RoundResult } from '../types/race';

export interface ImportedRow {
  [key: string]: string;
}

export interface ColumnMapping {
  csvField: string;
  mappedTo: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  sampleData?: string;
}

export interface SkipperMatch {
  rowIndex: number;
  importName: string;
  importSailNo: string;
  matchType: 'exact-sail' | 'exact-name' | 'fuzzy-name' | 'none';
  matchedMember: { id: string; first_name: string; last_name: string; boats?: any[] } | null;
  selectedAction: 'member' | 'visitor';
  selectedMemberId: string | null;
  visitorName: string;
  visitorSailNo: string;
  boatModel: string;
  club: string;
  startHcap: number;
}

export interface ParsedResults {
  headers: string[];
  rows: ImportedRow[];
}

export interface RaceColumnInfo {
  csvField: string;
  raceNumber: number;
}

const VALID_LETTER_SCORES: LetterScore[] = [
  'DNS', 'DNF', 'DSQ', 'OCS', 'BFD', 'RDG', 'DPI', 'RET', 'DNC', 'DNE', 'NSC', 'WDN'
];

export function parseCSVData(text: string): ParsedResults {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  return {
    headers: result.meta.fields || [],
    rows: result.data as ImportedRow[],
  };
}

export function parseTSVData(text: string): ParsedResults {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: '\t',
  });

  if ((result.meta.fields?.length || 0) <= 1) {
    return parseCSVData(text);
  }

  return {
    headers: result.meta.fields || [],
    rows: result.data as ImportedRow[],
  };
}

export function autoDetectMappings(headers: string[], rows: ImportedRow[]): ColumnMapping[] {
  const sampleRow = rows[0] || {};

  return headers.map(header => {
    const normalized = header.toLowerCase().replace(/[_\-\s.]/g, '');
    const sample = sampleRow[header] || '';
    let mappedTo: string | null = null;
    let confidence: ColumnMapping['confidence'] = 'none';

    if (['name', 'skipper', 'skippername', 'helmname', 'helm', 'sailor', 'sailorname', 'competitor'].includes(normalized)) {
      mappedTo = 'skipper_name';
      confidence = 'high';
    } else if (['sailno', 'sailnumber', 'sail', 'sailnum', 'boatnumber', 'no', 'number'].includes(normalized)) {
      mappedTo = 'sail_number';
      confidence = 'high';
    } else if (['club', 'clubname', 'yachtclub'].includes(normalized)) {
      mappedTo = 'club';
      confidence = 'high';
    } else if (['boat', 'boatname', 'boatmodel', 'model', 'hull', 'class'].includes(normalized)) {
      mappedTo = 'boat_model';
      confidence = 'medium';
    } else if (['handicap', 'hcap', 'hcp', 'rating', 'starthandicap', 'starthcap'].includes(normalized)) {
      mappedTo = 'handicap';
      confidence = 'high';
    } else if (['total', 'totalscore', 'totalpoints', 'nett', 'net', 'nettotal', 'score', 'points'].includes(normalized)) {
      mappedTo = 'ignore';
      confidence = 'low';
    } else if (['pos', 'position', 'place', 'rank', 'overall', 'overallposition'].includes(normalized)) {
      mappedTo = 'ignore';
      confidence = 'low';
    } else if (['gross', 'grosstotal'].includes(normalized)) {
      mappedTo = 'ignore';
      confidence = 'low';
    } else {
      const raceMatch = normalized.match(/^(?:r|race|rd|round)?(\d+)$/);
      if (raceMatch) {
        mappedTo = `race_${raceMatch[1]}`;
        confidence = 'high';
      }
    }

    return {
      csvField: header,
      mappedTo,
      confidence,
      sampleData: String(sample).substring(0, 50),
    };
  });
}

export function detectRaceColumns(mappings: ColumnMapping[]): RaceColumnInfo[] {
  return mappings
    .filter(m => m.mappedTo?.startsWith('race_'))
    .map(m => ({
      csvField: m.csvField,
      raceNumber: parseInt(m.mappedTo!.replace('race_', ''), 10),
    }))
    .sort((a, b) => a.raceNumber - b.raceNumber);
}

export function matchSkippersToMembers(
  rows: ImportedRow[],
  mappings: ColumnMapping[],
  members: { id: string; first_name: string; last_name: string; boats?: any[] }[]
): SkipperMatch[] {
  const nameField = mappings.find(m => m.mappedTo === 'skipper_name')?.csvField;
  const sailField = mappings.find(m => m.mappedTo === 'sail_number')?.csvField;
  const clubField = mappings.find(m => m.mappedTo === 'club')?.csvField;
  const boatField = mappings.find(m => m.mappedTo === 'boat_model')?.csvField;
  const hcapField = mappings.find(m => m.mappedTo === 'handicap')?.csvField;

  return rows.map((row, rowIndex) => {
    const importName = nameField ? (row[nameField] || '').trim() : '';
    const importSailNo = sailField ? (row[sailField] || '').trim() : '';
    const importClub = clubField ? (row[clubField] || '').trim() : '';
    const importBoat = boatField ? (row[boatField] || '').trim() : '';
    const importHcap = hcapField ? parseFloat(row[hcapField] || '100') || 100 : 100;

    let matchType: SkipperMatch['matchType'] = 'none';
    let matchedMember: SkipperMatch['matchedMember'] = null;

    if (importSailNo) {
      const sailMatch = members.find(m =>
        m.boats?.some((b: any) =>
          (b.sail_number || '').trim().toLowerCase() === importSailNo.toLowerCase()
        )
      );
      if (sailMatch) {
        matchType = 'exact-sail';
        matchedMember = sailMatch;
      }
    }

    if (!matchedMember && importName) {
      const normalizedImport = importName.toLowerCase().trim();

      const exactMatch = members.find(m => {
        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase().trim();
        const reverseName = `${m.last_name} ${m.first_name}`.toLowerCase().trim();
        return fullName === normalizedImport || reverseName === normalizedImport;
      });

      if (exactMatch) {
        matchType = 'exact-name';
        matchedMember = exactMatch;
      } else {
        const fuzzyMatch = members.find(m => {
          const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
          const lastName = m.last_name.toLowerCase();
          return fullName.includes(normalizedImport) ||
            normalizedImport.includes(fullName) ||
            lastName === normalizedImport.split(' ').pop();
        });

        if (fuzzyMatch) {
          matchType = 'fuzzy-name';
          matchedMember = fuzzyMatch;
        }
      }
    }

    return {
      rowIndex,
      importName,
      importSailNo,
      matchType,
      matchedMember,
      selectedAction: matchedMember ? 'member' : 'visitor',
      selectedMemberId: matchedMember?.id || null,
      visitorName: importName,
      visitorSailNo: importSailNo,
      boatModel: importBoat,
      club: importClub,
      startHcap: importHcap,
    };
  });
}

export function parseResultValue(value: string): { position: number | null; letterScore?: string } {
  if (!value || value.trim() === '') {
    return { position: null };
  }

  const trimmed = value.trim().toUpperCase();

  const letterMatch = VALID_LETTER_SCORES.find(ls => trimmed === ls);
  if (letterMatch) {
    return { position: null, letterScore: letterMatch };
  }

  const numVal = parseInt(trimmed, 10);
  if (!isNaN(numVal) && numVal > 0) {
    return { position: numVal };
  }

  const numFromFloat = parseInt(trimmed, 10);
  if (!isNaN(numFromFloat) && numFromFloat > 0) {
    return { position: numFromFloat };
  }

  if (trimmed.includes('DNF') || trimmed.includes('RET')) {
    return { position: null, letterScore: 'DNF' };
  }
  if (trimmed.includes('DNS') || trimmed.includes('DNC')) {
    return { position: null, letterScore: 'DNS' };
  }
  if (trimmed.includes('DSQ') || trimmed.includes('OCS') || trimmed.includes('BFD')) {
    return { position: null, letterScore: 'DSQ' };
  }

  return { position: null, letterScore: 'DNS' };
}

export function buildSkippersArray(
  matches: SkipperMatch[],
  members: { id: string; first_name: string; last_name: string; boats?: any[] }[]
): Skipper[] {
  return matches.map(match => {
    if (match.selectedAction === 'member' && match.selectedMemberId) {
      const member = members.find(m => m.id === match.selectedMemberId);
      if (member) {
        const boat = member.boats?.[0];
        return {
          name: `${member.first_name} ${member.last_name}`,
          sailNo: match.importSailNo || boat?.sail_number || '',
          club: match.club || '',
          boatModel: match.boatModel || boat?.boat_type || '',
          startHcap: match.startHcap,
          memberId: member.id,
          boatId: boat?.id,
        };
      }
    }

    return {
      name: match.visitorName || match.importName,
      sailNo: match.visitorSailNo || match.importSailNo,
      club: match.club || 'Visitor',
      boatModel: match.boatModel || '',
      startHcap: match.startHcap,
    };
  });
}

export function buildRoundResults(
  rows: ImportedRow[],
  raceColumns: RaceColumnInfo[],
  mappings: ColumnMapping[]
): RoundResult[] {
  const results: RoundResult[] = [];

  rows.forEach((row, skipperIndex) => {
    const hcapField = mappings.find(m => m.mappedTo === 'handicap')?.csvField;
    const handicap = hcapField ? parseFloat(row[hcapField] || '100') || 100 : 100;

    raceColumns.forEach(({ csvField, raceNumber }) => {
      const rawValue = row[csvField] || '';
      const { position, letterScore } = parseResultValue(rawValue);

      if (position !== null || letterScore) {
        results.push({
          race: raceNumber,
          skipperIndex,
          position,
          letterScore,
          handicap,
          adjustedHcap: handicap,
        });
      }
    });
  });

  return results;
}

export const RESULTS_FIELD_OPTIONS = [
  { value: 'skipper_name', label: 'Skipper Name' },
  { value: 'sail_number', label: 'Sail Number' },
  { value: 'club', label: 'Club' },
  { value: 'boat_model', label: 'Boat / Model' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'ignore', label: 'Ignore' },
];
