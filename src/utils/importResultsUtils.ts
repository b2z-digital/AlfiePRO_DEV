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

export function parseHTMLTable(html: string): ParsedResults {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return { headers: [], rows: [] };

  const allRows = Array.from(table.querySelectorAll('tr'));

  let headerRow: Element | null = null;
  let dataStartIdx = 0;

  for (let i = 0; i < allRows.length; i++) {
    const cells = allRows[i].querySelectorAll('th, td');
    if (cells.length < 2) continue;

    const cellTexts = Array.from(cells).map(c => (c.textContent || '').trim());
    const hasColSpan = Array.from(cells).some(c => parseInt(c.getAttribute('colspan') || '1') > 1);
    if (hasColSpan) continue;

    const looksLikeHeader = cellTexts.some(t => {
      const lower = t.toLowerCase().replace(/\s+/g, '');
      return ['sail', 'sailor', 'name', 'skipper', 'club', 'rank', 'r1', 'r2', 'race1', 'helm'].includes(lower);
    });

    if (looksLikeHeader) {
      headerRow = allRows[i];
      dataStartIdx = i + 1;
      break;
    }
  }

  if (!headerRow) return { headers: [], rows: [] };

  const headers = Array.from(headerRow.querySelectorAll('th, td')).map(
    cell => (cell.textContent || '').trim()
  );

  const rows: ImportedRow[] = [];
  for (let i = dataStartIdx; i < allRows.length; i++) {
    const cells = allRows[i].querySelectorAll('th, td');
    if (cells.length < 2) continue;

    const hasColSpan = Array.from(cells).some(c => parseInt(c.getAttribute('colspan') || '1') > 1);
    if (hasColSpan) continue;

    const row: ImportedRow = {};
    let hasData = false;
    Array.from(cells).forEach((cell, colIdx) => {
      if (colIdx < headers.length) {
        const val = (cell.textContent || '').trim();
        row[headers[colIdx]] = val;
        if (val) hasData = true;
      }
    });

    if (hasData) rows.push(row);
  }

  return { headers, rows };
}

export function parseFixedWidthData(text: string): ParsedResults {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase().replace(/\s+/g, ' ');
    if (
      (lower.includes('sail') || lower.includes('name') || lower.includes('skipper') || lower.includes('sailor')) &&
      (lower.includes('r 1') || lower.includes('r1') || lower.includes('race'))
    ) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) return { headers: [], rows: [] };

  const headerLine = lines[headerLineIdx];

  const headerTokens: { name: string; start: number; end: number }[] = [];
  const headerRegex = /\S+(?:\s\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(headerLine)) !== null) {
    const token = match[0];
    const rMulti = token.match(/^(R)\s*(\d+)$/i);
    if (rMulti) {
      headerTokens.push({ name: `R ${rMulti[2]}`, start: match.index, end: match.index + token.length });
    } else {
      headerTokens.push({ name: token, start: match.index, end: match.index + token.length });
    }
  }

  const colBounds: { name: string; start: number; end: number }[] = [];
  for (let i = 0; i < headerTokens.length; i++) {
    const start = i === 0 ? 0 : Math.floor((headerTokens[i - 1].end + headerTokens[i].start) / 2);
    const end = i === headerTokens.length - 1 ? 9999 : Math.floor((headerTokens[i].end + headerTokens[i + 1].start) / 2);
    colBounds.push({ name: headerTokens[i].name, start, end });
  }

  const headers = colBounds.map(c => c.name);
  const rows: ImportedRow[] = [];

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const lower = line.toLowerCase().trim();
    if (lower.startsWith('scoring:') || lower.includes('made easy') || lower.includes('www.')) continue;

    const row: ImportedRow = {};
    let hasNumericData = false;

    colBounds.forEach(col => {
      const val = line.substring(col.start, Math.min(col.end, line.length)).trim();
      row[col.name] = val;
      if (/^\d+$/.test(val)) hasNumericData = true;
    });

    if (hasNumericData) rows.push(row);
  }

  return { headers, rows };
}

export function isHTMLContent(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes('<table') || trimmed.includes('<TABLE') ||
    (trimmed.startsWith('<!') && trimmed.includes('<table')) ||
    (trimmed.startsWith('<html') && trimmed.includes('<table'));
}

export function parseTSVData(text: string): ParsedResults {
  if (isHTMLContent(text)) {
    const htmlResult = parseHTMLTable(text);
    if (htmlResult.headers.length >= 2 && htmlResult.rows.length > 0) {
      return htmlResult;
    }
  }

  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: '\t',
  });

  if ((result.meta.fields?.length || 0) >= 2) {
    return {
      headers: result.meta.fields || [],
      rows: result.data as ImportedRow[],
    };
  }

  const csvResult = parseCSVData(text);
  if (csvResult.headers.length >= 2) {
    return csvResult;
  }

  const fixedResult = parseFixedWidthData(text);
  if (fixedResult.headers.length >= 2 && fixedResult.rows.length > 0) {
    return fixedResult;
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
