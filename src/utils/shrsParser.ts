import * as XLSX from 'xlsx';
import { ParsedHMSSkipper, ParsedHMSRaceResult, ParsedHMSData } from '../types/hmsValidator';
import {
  getNextHeat,
  seedSHRSHeatsByIndex,
  calculateOptimalHeats,
  calculateHeatSizes,
  getLargestHeatSize,
  calculateSHRSDiscards,
  calculateNonFinisherScore,
  getNonFinisherPriority,
  compareSailNumbers,
  compareSHRSWithCountback,
} from './shrsHeatSystem';
import { LetterScore } from '../types/letterScores';

export type SHRSImportMode = 'shrs-progressive' | 'shrs-balanced';

export interface ParsedSHRSData extends ParsedHMSData {
  qualifyingRounds: number;
  finalRounds: number;
  detectedHeats: number;
  reconstructedHeatAssignments?: ReconstructedRound[];
}

export interface ReconstructedRound {
  round: number;
  phase: 'qualifying' | 'finals';
  heatAssignments: { heatDesignation: string; skipperIndices: number[] }[];
  results: {
    skipperIndex: number;
    heatDesignation: string;
    position: number | null;
    letterScore?: string;
    points: number;
    customPoints?: number;
    importedScore?: number | null;
  }[];
}

export async function parseSHRSFile(file: File): Promise<ParsedSHRSData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const worksheetNames = workbook.SheetNames;

  const sheet = workbook.Sheets[worksheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  return parseSHRSFromRows(data, worksheetNames, file.name);
}

export function parseSHRSFromCSV(csvText: string): ParsedSHRSData {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) throw new Error('No data found');

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const data = lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  });

  return parseSHRSFromRows(data, ['Pasted Data']);
}

export function parseSHRSFromHTML(rawHtml: string, sourceUrl?: string): ParsedSHRSData {
  // Strip null bytes (UTF-16 encoded pages have \x00 between every character)
  // Also strip BOM markers
  const html = rawHtml.replace(/\x00/g, '').replace(/^\uFEFF|\uFFFE/g, '');

  const rows: string[][] = [];

  // Split by <tr> boundaries to handle malformed HTML with missing </tr> tags
  const trSegments = html.split(/<tr[^>]*>/gi).slice(1);

  for (const segment of trSegments) {
    // Take content up to </tr> or next <tr> (whichever comes first), or entire segment
    const content = segment.replace(/<\/tr>[\s\S]*$/, '');
    const cells: string[] = [];

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;

    while ((tdMatch = tdRegex.exec(content)) !== null) {
      const tdContent = tdMatch[1];
      const divMatch = tdContent.match(/<div[^>]*class="cell"[^>]*>([\s\S]*?)<\/div>/i);
      let text = divMatch ? divMatch[1] : tdContent;
      text = text.replace(/<br\s*\/?>/gi, ' ');
      text = text.replace(/<[^>]+>/g, '');
      text = text.replace(/&nbsp;?/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n)));
      cells.push(text.trim());
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length === 0) {
    throw new Error('No table data found in the HTML page');
  }

  // Filter out fleet label rows (GOLD FLEET, SILVER FLEET, etc.) and repeated header rows
  // Keep only: the first header row, and data rows
  // Track which fleet section each data row belongs to so we can prefix the Place column
  let headerFound = false;
  let placeColIndex = -1;
  let currentFleetPrefix = '';
  let fleetStartOffset = 0;
  let firstInFleet = true;
  const filteredRows: string[][] = [];

  const fleetLabelMap: Record<string, string> = {
    'gold': 'G', 'silver': 'S', 'bronze': 'B', 'copper': 'C',
    'emerald': 'E', 'diamond': 'D',
  };

  for (const row of rows) {
    const joined = row.map(c => c.toLowerCase()).join(' ');

    // Detect fleet label rows and track current fleet section
    const fleetLabelMatch = joined.match(/\b(gold|silver|bronze|copper|emerald|diamond)\s+fleet\b/i);
    if (fleetLabelMatch) {
      currentFleetPrefix = fleetLabelMap[fleetLabelMatch[1].toLowerCase()] || '';
      firstInFleet = true;
      continue;
    }

    // Detect header row (Place, Sail No, Skipper, etc.)
    const hasPlace = row.some(c => /^place$/i.test(c.trim()));
    const hasSail = row.some(c => /^sail\s*no$/i.test(c.trim()));
    const hasQ = row.some(c => /^q\s*1$/i.test(c.trim()));

    if ((hasPlace || hasSail) && hasQ) {
      if (!headerFound) {
        headerFound = true;
        placeColIndex = row.findIndex(c => /^place$/i.test(c.trim()));
        filteredRows.push(row);
      }
      // Skip duplicate header rows (repeated after each fleet)
      continue;
    }

    // Skip empty rows
    const nonEmpty = row.filter(c => c.trim() !== '');
    if (nonEmpty.length < 3) continue;

    // If we know which fleet section this row belongs to, convert overall position
    // to fleet-relative position (e.g., Silver pos 21 becomes "S 1")
    if (currentFleetPrefix && placeColIndex >= 0 && row[placeColIndex]) {
      const placeVal = String(row[placeColIndex]).trim();
      if (/^\d+$/.test(placeVal)) {
        const overallPos = parseInt(placeVal);
        if (firstInFleet) {
          fleetStartOffset = overallPos - 1;
          firstInFleet = false;
        }
        const fleetRelativePos = overallPos - fleetStartOffset;
        row[placeColIndex] = `${currentFleetPrefix} ${fleetRelativePos}`;
      }
    }

    filteredRows.push(row);
  }

  if (filteredRows.length < 2) {
    throw new Error('Could not find valid header and data rows in the HTML');
  }

  // Extract event name from page title or URL
  let eventName = 'Imported SHRS Event';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (title && title.length > 3) eventName = title;
  }
  if (sourceUrl) {
    // Try to extract event name from URL path, e.g. /AUS/df65nat26/
    const pathMatch = sourceUrl.match(/\/([^/]+)\/[^/]*$/);
    if (pathMatch && pathMatch[1].length > 3) {
      eventName = pathMatch[1].replace(/[-_]/g, ' ');
    }
  }

  return parseSHRSFromRows(filteredRows, ['HTML Import'], eventName);
}

function parseSHRSFromRows(
  data: any[][],
  worksheetNames: string[],
  fileName?: string
): ParsedSHRSData {
  let headerRowIndex = -1;

  // Strategy 1: look for a row with explicit column headers
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join(' ');
    const hasSail = rowStr.includes('sail');
    const hasName = rowStr.includes('name') || rowStr.includes('skipper');
    const hasQ = /\bq1\b/.test(rowStr) || /\bq 1\b/.test(rowStr);
    const hasPos = rowStr.includes('pos');

    if ((hasSail || hasPos) && (hasName || hasQ)) {
      headerRowIndex = i;
      break;
    }
  }

  // Strategy 2: look for a row that contains Q1/Q2 style column headers even without Sail/Name
  if (headerRowIndex === -1) {
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const cells = row.map((c: any) => String(c || '').trim());
      const qCount = cells.filter((c: string) => /^q\s*\d+$/i.test(c)).length;
      const fCount = cells.filter((c: string) => /^f\s*\d+$/i.test(c)).length;
      if (qCount >= 2 || (qCount >= 1 && fCount >= 1)) {
        headerRowIndex = i;
        break;
      }
    }
  }

  // Strategy 3: single fallback for any recognizable header keyword
  if (headerRowIndex === -1) {
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join(' ');
      if (rowStr.includes('sail') || rowStr.includes('name') || rowStr.includes('pos')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row. Ensure the first row contains column headers like Q1, Q2, F1, F2, etc.');
  }

  const headers = data[headerRowIndex].map((h: any) => String(h || '').trim());
  const headersLower = headers.map((h: string) => h.toLowerCase());

  // Detect round columns first (needed for column inference)
  const qualifyingCols: { index: number; round: number }[] = [];
  const finalCols: { index: number; round: number }[] = [];

  headers.forEach((h: string, idx: number) => {
    const clean = h.trim();
    const qMatch = clean.match(/^q\s*(\d+)$/i);
    if (qMatch) {
      qualifyingCols.push({ index: idx, round: parseInt(qMatch[1]) });
      return;
    }
    const fMatch = clean.match(/^f\s*(\d+)$/i);
    if (fMatch) {
      finalCols.push({ index: idx, round: parseInt(fMatch[1]) });
      return;
    }
    const rMatch = clean.match(/^r\s*(\d+)$/i);
    if (rMatch) {
      qualifyingCols.push({ index: idx, round: parseInt(rMatch[1]) });
    }
  });

  qualifyingCols.sort((a, b) => a.round - b.round);
  finalCols.sort((a, b) => a.round - b.round);

  if (qualifyingCols.length === 0 && finalCols.length === 0) {
    throw new Error('Could not find round columns (Q1, Q2... or F1, F2... or R1, R2...).');
  }

  // Find explicit columns
  let posCol = findCol(headersLower, ['pos', 'position', 'place', 'rank']);
  let sailCol = findCol(headersLower, ['sail', 'sail no', 'sail #', 'sail number', 'sailno']);
  let nameCol = findCol(headersLower, ['name', 'skipper', 'helmsman', 'competitor']);
  let clubCol = findCol(headersLower, ['club', 'organization', 'org']);
  const totalCol = findCol(headersLower, ['total', 'gross', 'tot']);
  const netCol = findCol(headersLower, ['net', 'nett', 'final']);

  // Infer columns from data if headers are unlabelled (like the Oceania format)
  const firstRoundColIndex = Math.min(
    ...qualifyingCols.map(c => c.index),
    ...finalCols.map(c => c.index)
  );

  if (sailCol === -1 && nameCol === -1 && firstRoundColIndex > 0) {
    const blankHeaderCols = [];
    for (let c = 0; c < firstRoundColIndex; c++) {
      if (!headers[c] || headers[c] === '') {
        blankHeaderCols.push(c);
      }
    }

    if (blankHeaderCols.length >= 2) {
      // Inspect data rows to figure out which column is name vs sail
      const sampleRows = data.slice(headerRowIndex + 1, headerRowIndex + 6).filter(r => r && r.length > 0);
      for (const col of blankHeaderCols) {
        const sampleValues = sampleRows.map(r => String(r[col] || '').trim()).filter(Boolean);
        if (sampleValues.length === 0) continue;

        const looksLikeSail = sampleValues.every(v => /^[A-Z]{2,4}\s*\d+$/i.test(v) || /^\d+$/.test(v));
        const looksLikeName = sampleValues.every(v => /^[A-Za-z\u00C0-\u024F\s'-]+$/.test(v) && v.includes(' '));
        const looksLikeNumber = sampleValues.every(v => /^\d+$/.test(v) && parseInt(v) <= 200);

        if (looksLikeName && nameCol === -1) {
          nameCol = col;
        } else if (looksLikeSail && sailCol === -1) {
          sailCol = col;
        } else if (looksLikeNumber && posCol === -1 && col === 0) {
          posCol = col;
        }
      }

      // If we still haven't found name and sail, use positional inference:
      // typical layouts: [Name, Sail, Club?, Q1...] or [Name, Sail, Q1...]
      if (nameCol === -1 && sailCol === -1 && blankHeaderCols.length >= 2) {
        nameCol = blankHeaderCols[0];
        sailCol = blankHeaderCols[1];
        if (blankHeaderCols.length >= 3 && clubCol === -1) {
          clubCol = blankHeaderCols[2];
        }
      } else if (nameCol >= 0 && sailCol === -1) {
        const remaining = blankHeaderCols.filter(c => c !== nameCol && c !== posCol);
        if (remaining.length > 0) sailCol = remaining[0];
        if (remaining.length > 1 && clubCol === -1) clubCol = remaining[1];
      } else if (sailCol >= 0 && nameCol === -1) {
        const remaining = blankHeaderCols.filter(c => c !== sailCol && c !== posCol);
        if (remaining.length > 0) nameCol = remaining[0];
        if (remaining.length > 1 && clubCol === -1) clubCol = remaining[1];
      }
    }
  }

  if (sailCol === -1 && nameCol === -1) {
    throw new Error('Could not determine Name or Sail Number columns. Use a header row with labelled columns (Name, Sail, Q1, Q2, etc.).');
  }

  const skippers: ParsedHMSSkipper[] = [];
  const results: ParsedHMSRaceResult[] = [];

  const skipLabels = ['sort', 'filter', 'total', 'count', 'sum', 'average', 'dnc', 'dns'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((cell: any) => !cell || String(cell).trim() === '')) continue;

    const rawSail = sailCol >= 0 ? String(row[sailCol] || '').trim() : '';
    const rawName = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';

    if (!rawSail && !rawName) continue;
    if (rawName && skipLabels.some(l => rawName.toLowerCase() === l)) continue;
    if (rawName && !/[a-zA-Z]/.test(rawName)) continue;

    const raceScores: { [key: string]: number | string } = {};
    const allRoundCols = [
      ...qualifyingCols.map(c => ({ ...c, type: 'Q' as const })),
      ...finalCols.map(c => ({ ...c, round: c.round + qualifyingCols.length, type: 'F' as const })),
    ];

    for (const col of allRoundCols) {
      const cellValue = String(row[col.index] || '').trim();
      if (!cellValue) continue;

      const numVal = parseFloat(cellValue);
      if (!isNaN(numVal) && /^\d+\.?\d*$/.test(cellValue)) {
        raceScores[col.round.toString()] = numVal;
      } else {
        raceScores[col.round.toString()] = cellValue.toUpperCase();
      }
    }

    const rawPlace = posCol >= 0 ? String(row[posCol] || '').trim() : '';
    const skipperPosition = parseInt(rawPlace) || skippers.length + 1;
    const totalScore = totalCol >= 0 ? parseFloat(String(row[totalCol] || '').replace(',', '.')) || undefined : undefined;
    const netScore = netCol >= 0 ? parseFloat(String(row[netCol] || '').replace(',', '.')) || undefined : undefined;

    // Parse fleet designation from Place column (e.g., "G 1", "S 3", "B 12")
    let sourceFleet: string | undefined;
    let sourceFleetPosition: number | undefined;
    const fleetPlaceMatch = rawPlace.match(/^([GSBC])\s*(\d+)$/i);
    if (fleetPlaceMatch) {
      sourceFleet = fleetPlaceMatch[1].toUpperCase();
      sourceFleetPosition = parseInt(fleetPlaceMatch[2]);
    }

    skippers.push({
      position: skipperPosition,
      name: rawName || `Sail ${rawSail}`,
      sailNumber: rawSail || String(skippers.length + 1),
      club: clubCol >= 0 ? String(row[clubCol] || '').trim() || undefined : undefined,
      totalScore: netScore || totalScore,
      grossTotal: netScore ? totalScore : undefined,
      raceScores,
      sourceFleet,
      sourceFleetPosition,
    });

    const skipperIndex = skippers.length - 1;
    const sailForResult = rawSail || String(skipperIndex + 1);

    for (const col of qualifyingCols) {
      const cellValue = String(row[col.index] || '').trim();
      if (!cellValue) continue;
      parseResultCell(cellValue, col.round, sailForResult, results, undefined);
    }

    for (const col of finalCols) {
      const raceNum = col.round + qualifyingCols.length;
      const cellValue = String(row[col.index] || '').trim();
      if (!cellValue) continue;
      parseResultCell(cellValue, raceNum, sailForResult, results, undefined);
    }
  }

  const numQualifying = qualifyingCols.length;
  const numFinals = finalCols.length;
  const numRaces = numQualifying + numFinals;
  const detectedHeats = calculateOptimalHeats(skippers.length);

  const eventName = extractSHRSEventName(data, headerRowIndex) ||
    (fileName ? fileName.replace(/\.(xls|xlsx|csv)$/i, '') : undefined);

  return {
    skippers,
    results,
    numRaces,
    hasHeats: true,
    heats: ['A', 'B', 'C', 'D', 'E'].slice(0, detectedHeats),
    worksheetNames,
    eventName,
    qualifyingRounds: numQualifying,
    finalRounds: numFinals,
    detectedHeats,
  };
}

const KNOWN_LETTER_SCORES = [
  'DNF', 'DNS', 'DNC', 'DSQ', 'OCS', 'RET', 'BFD', 'UFD', 'NSC',
  'ZFP', 'SCP', 'DPI', 'DNE', 'RDG', 'WDN', 'RGA', 'RGP',
];

const FLEET_SUFFIXES = ['G', 'S', 'B', 'C'];

function parseResultCell(
  cellValue: string,
  raceNumber: number,
  sailNumber: string,
  results: ParsedHMSRaceResult[],
  heat?: string
): void {
  const trimmed = cellValue.trim();
  if (!trimmed) return;
  // Normalize European comma decimals to period (e.g. "RGA 9,8c" -> "RGA 9.8c", "13,6" -> "13.6")
  const normalized = trimmed.replace(/(\d),(\d)/g, '$1.$2');
  const upper = normalized.toUpperCase();

  // Pure number: "3", "14", "7.5", "9,8" (comma decimal normalized)
  if (/^\d+\.?\d*$/.test(normalized)) {
    const numVal = parseFloat(normalized);
    results.push({ raceNumber, sailNumber, position: numVal, points: numVal, heat });
    return;
  }

  // Number + single letter suffix: "1G", "3S", "12B", "9C" (fleet indicator) or "1A", "4B", "1C" (heat indicator)
  const numLetterMatch = upper.match(/^(\d+\.?\d*)([A-Z])$/);
  if (numLetterMatch) {
    const pos = parseFloat(numLetterMatch[1]);
    results.push({ raceNumber, sailNumber, position: pos, points: pos, heat });
    return;
  }

  // Standalone letter score: "DNF", "DNC", "DSQ", etc.
  if (KNOWN_LETTER_SCORES.includes(upper)) {
    let letterScore = upper;
    let customPoints: number | undefined = undefined;
    if (upper === 'RGA') {
      letterScore = 'RDG';
      customPoints = -1;
    } else if (upper === 'RGP') {
      letterScore = 'RDG';
    }
    results.push({ raceNumber, sailNumber, position: null, points: 0, letterScore, customPoints, heat });
    return;
  }

  // Letter score + space + points + optional single letter suffix:
  // "DNF 18", "RGP 2", "RGA 4.3", "SCP 16.4", "NSC 18", "UFD 18",
  // "RET 18C", "NSC 18B", "DNC 18S", "RGP 9.3G", "RGP 5S", "DNF 18B", "DNF 16A"
  const codeSpacePointsMatch = upper.match(/^([A-Z]{2,6})\s+(\d+\.?\d*)\s*([A-Z]?)$/);
  if (codeSpacePointsMatch) {
    const code = codeSpacePointsMatch[1];
    const points = parseFloat(codeSpacePointsMatch[2]);

    let letterScore = code;
    let customPoints: number | undefined = undefined;

    if (code === 'RGP') {
      letterScore = 'RDG';
      customPoints = points;
    } else if (code === 'RGA') {
      letterScore = 'RDG';
      customPoints = points;
    } else if (code === 'SCP') {
      customPoints = points;
    }

    results.push({
      raceNumber,
      sailNumber,
      position: null,
      points,
      letterScore,
      customPoints,
      heat,
    });
    return;
  }

  // Letter score + space + "number.number" + single letter suffix: "RGP 9.5C", "RGA 4.3G"
  const codeDecimalFleetMatch = upper.match(/^([A-Z]{2,6})\s+(\d+\.\d+)([A-Z])$/);
  if (codeDecimalFleetMatch) {
    const code = codeDecimalFleetMatch[1];
    const points = parseFloat(codeDecimalFleetMatch[2]);

    let letterScore = code;
    let customPoints: number | undefined = undefined;

    if (code === 'RGP') { letterScore = 'RDG'; customPoints = points; }
    else if (code === 'RGA') { letterScore = 'RDG'; customPoints = points; }
    else if (code === 'SCP') { customPoints = points; }

    results.push({
      raceNumber, sailNumber, position: null, points, letterScore, customPoints, heat,
    });
    return;
  }

  // Number + letter score code (no space): "14DNF" (uncommon but handle it)
  const numCodeMatch = upper.match(/^(\d+\.?\d*)([A-Z]{2,6})$/);
  if (numCodeMatch) {
    const points = parseFloat(numCodeMatch[1]);
    const code = numCodeMatch[2];

    if (KNOWN_LETTER_SCORES.includes(code)) {
      let letterScore = code;
      let customPoints: number | undefined = undefined;
      if (code === 'RGP') { letterScore = 'RDG'; customPoints = points; }
      else if (code === 'RGA') { letterScore = 'RDG'; customPoints = points; }
      else if (code === 'SCP') { customPoints = points; }

      results.push({
        raceNumber, sailNumber, position: null, points, letterScore, customPoints, heat,
      });
      return;
    }
  }

  // Fallback: treat as unknown letter score
  results.push({
    raceNumber, sailNumber, position: null, points: 0, letterScore: upper || undefined, heat,
  });
}

export function reconstructSHRSHeats(
  parsedData: ParsedSHRSData,
  mode: SHRSImportMode,
  numberOfHeats: number
): ReconstructedRound[] {
  const { skippers, results, qualifyingRounds, finalRounds } = parsedData;
  const rounds: ReconstructedRound[] = [];

  const heatLabels = ['A', 'B', 'C', 'D', 'E'].slice(0, numberOfHeats);
  const heatSizes = calculateHeatSizes(skippers.length, numberOfHeats);

  const initialSeeding = seedSHRSHeatsByIndex(
    skippers.map((s, i) => ({
      name: s.name,
      sailNo: s.sailNumber,
      sailNumber: s.sailNumber,
      club: s.club || '',
      boatModel: '',
      startHcap: 100,
    })),
    numberOfHeats
  );

  let currentAssignments = initialSeeding;

  for (let q = 1; q <= qualifyingRounds; q++) {
    const roundResults = results.filter(r => r.raceNumber === q);
    const reconstructedResults: ReconstructedRound['results'] = [];

    for (const assignment of currentAssignments) {
      for (const skipperIndex of assignment.skipperIndices) {
        const skipper = skippers[skipperIndex];
        const result = roundResults.find(r => r.sailNumber === skipper.sailNumber);

        if (result) {
          const isRDGave = result.letterScore === 'RDG' && (result.customPoints === -1 || result.customPoints === -2 || result.customPoints === -3);
          let importedScore: number | null | undefined;
          if (isRDGave) {
            importedScore = undefined;
          } else if (result.customPoints !== undefined && result.customPoints > 0) {
            importedScore = result.customPoints;
          } else if (result.position !== null && result.position !== undefined) {
            importedScore = result.position;
          } else if (result.points > 0) {
            importedScore = result.points;
          } else {
            importedScore = null;
          }
          reconstructedResults.push({
            skipperIndex,
            heatDesignation: assignment.heatDesignation,
            position: result.position,
            letterScore: result.letterScore,
            points: result.points,
            customPoints: result.customPoints,
            importedScore,
          });
        } else {
          const largestHeat = getLargestHeatSize(heatSizes);
          reconstructedResults.push({
            skipperIndex,
            heatDesignation: assignment.heatDesignation,
            position: null,
            letterScore: 'DNC',
            points: largestHeat + 1,
            importedScore: largestHeat + 1,
          });
        }
      }
    }

    rounds.push({
      round: q,
      phase: 'qualifying',
      heatAssignments: currentAssignments.map(a => ({
        heatDesignation: a.heatDesignation,
        skipperIndices: [...a.skipperIndices],
      })),
      results: reconstructedResults,
    });

    if (mode === 'shrs-progressive' && q < qualifyingRounds) {
      currentAssignments = generateNextRoundFromResults(
        currentAssignments,
        reconstructedResults,
        skippers,
        numberOfHeats,
        heatLabels,
        heatSizes
      );
    } else if (mode === 'shrs-balanced' && q < qualifyingRounds) {
      // For balanced, assignments are pre-generated; we recalculate them here
      // using the table-based approach from the SHRS system
      currentAssignments = generateNextRoundBalanced(
        currentAssignments,
        numberOfHeats,
        heatLabels
      );
    }
  }

  if (finalRounds > 0) {
    const qualScores = new Map<number, number>();
    const qualRaceScores = new Map<number, number[]>();
    const largestHeat = getLargestHeatSize(heatSizes);

    // First pass: collect all non-RDGave scores per skipper for RDGave average calculation
    const aveQualScores = new Map<number, number[]>();
    for (const round of rounds) {
      for (const result of round.results) {
        if (!aveQualScores.has(result.skipperIndex)) {
          aveQualScores.set(result.skipperIndex, []);
        }
        const resIsRDGave = result.letterScore === 'RDG' && (result.customPoints === -1 || result.customPoints === -2 || result.customPoints === -3);
        if (resIsRDGave) continue;
        const s = (result.importedScore !== undefined && result.importedScore !== null)
          ? result.importedScore
          : calculateNonFinisherScore(largestHeat);
        aveQualScores.get(result.skipperIndex)!.push(s);
      }
    }

    // Second pass: build race scores using importedScore (set from source data during reconstruction)
    for (const round of rounds) {
      for (const result of round.results) {
        if (!qualScores.has(result.skipperIndex)) {
          qualScores.set(result.skipperIndex, 0);
          qualRaceScores.set(result.skipperIndex, []);
        }
        let score: number;
        const isRDGave = result.letterScore === 'RDG' && (result.customPoints === -1 || result.customPoints === -2 || result.customPoints === -3);
        if (isRDGave) {
          const scores = aveQualScores.get(result.skipperIndex) || [];
          if (scores.length > 0) {
            score = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
          } else if (result.position !== null && result.position !== undefined) {
            score = result.position;
          } else {
            score = calculateNonFinisherScore(largestHeat);
          }
        } else if (result.importedScore !== undefined && result.importedScore !== null) {
          score = result.importedScore;
        } else {
          score = calculateNonFinisherScore(largestHeat);
        }
        qualRaceScores.get(result.skipperIndex)!.push(score);
      }
    }

    const numDiscards = calculateSHRSDiscards(qualifyingRounds);

    qualRaceScores.forEach((scores, idx) => {
      const sorted = [...scores].sort((a, b) => b - a);
      const kept = sorted.slice(numDiscards);
      const net = kept.reduce((sum, s) => sum + s, 0);
      qualScores.set(idx, net);
    });

    const fleetSizes = calculateHeatSizes(skippers.length, numberOfHeats);
    const fleetAssignments = heatLabels.map((label) => ({
      heatDesignation: label,
      skipperIndices: [] as number[],
    }));

    // Always calculate fleet allocations from qualifying results
    // This ensures Alfie independently verifies the correct fleet assignments
    // For imported events, use empty heat maps so the tiebreaker falls back to
    // full countback (all scores with discards). The reconstructed heat assignments
    // don't reflect actual heat pairings from the source event, so same-heat
    // countback would produce incorrect tie resolution.
    const emptyHeatMaps: Map<number, string>[] = [];

    // Rank by qualifying net score with countback tiebreaker
    const rankedSkippers = Array.from(qualScores.entries())
      .sort(([idxA, a], [idxB, b]) => {
        if (a !== b) return a - b;
        const aScores = qualRaceScores.get(idxA) || [];
        const bScores = qualRaceScores.get(idxB) || [];
        return compareSHRSWithCountback(
          emptyHeatMaps,
          idxA,
          idxB,
          aScores,
          bScores,
          numDiscards,
          numDiscards,
          skippers[idxA]?.name,
          skippers[idxB]?.name,
          skippers[idxA]?.sailNumber,
          skippers[idxB]?.sailNumber
        );
      });

    let idx = 0;
    for (let f = 0; f < numberOfHeats; f++) {
      for (let s = 0; s < fleetSizes[f] && idx < rankedSkippers.length; s++) {
        fleetAssignments[f].skipperIndices.push(rankedSkippers[idx][0]);
        idx++;
      }
    }

    const finalFleetSizes = fleetAssignments.map(a => a.skipperIndices.length);

    for (let f = 1; f <= finalRounds; f++) {
      const raceNum = qualifyingRounds + f;
      const roundResults = results.filter(r => r.raceNumber === raceNum);
      const reconstructedResults: ReconstructedRound['results'] = [];

      // Determine which fleets actually sailed this round
      // A fleet is considered "not sailed" if ALL its skippers have DNC/DNS or no result
      const fleetSailed = new Map<string, boolean>();
      for (const assignment of fleetAssignments) {
        const hasRealResult = assignment.skipperIndices.some(skipperIndex => {
          const skipper = skippers[skipperIndex];
          const result = roundResults.find(r => r.sailNumber === skipper.sailNumber);
          if (!result) return false;
          const code = result.letterScore?.toUpperCase();
          return code !== 'DNC' && code !== 'DNS';
        });
        fleetSailed.set(assignment.heatDesignation, hasRealResult);
      }

      for (const assignment of fleetAssignments) {
        // Skip fleets that didn't sail this round
        if (!fleetSailed.get(assignment.heatDesignation)) continue;

        for (const skipperIndex of assignment.skipperIndices) {
          const skipper = skippers[skipperIndex];
          const result = roundResults.find(r => r.sailNumber === skipper.sailNumber);

          if (result) {
            const isRDGave = result.letterScore === 'RDG' && (result.customPoints === -1 || result.customPoints === -2 || result.customPoints === -3);
            let finImportedScore: number | null | undefined;
            if (isRDGave) {
              finImportedScore = undefined;
            } else if (result.customPoints !== undefined && result.customPoints > 0) {
              finImportedScore = result.customPoints;
            } else if (result.position !== null && result.position !== undefined) {
              finImportedScore = result.position;
            } else if (result.points > 0) {
              finImportedScore = result.points;
            } else {
              finImportedScore = null;
            }
            reconstructedResults.push({
              skipperIndex,
              heatDesignation: assignment.heatDesignation,
              position: result.position,
              letterScore: result.letterScore,
              points: result.points,
              customPoints: result.customPoints,
              importedScore: finImportedScore,
            });
          } else {
            const lh = getLargestHeatSize(finalFleetSizes);
            reconstructedResults.push({
              skipperIndex,
              heatDesignation: assignment.heatDesignation,
              position: null,
              letterScore: 'DNC',
              points: lh + 1,
              importedScore: lh + 1,
            });
          }
        }
      }

      // Only include this round if at least one fleet sailed
      if (reconstructedResults.length > 0) {
        rounds.push({
          round: raceNum,
          phase: 'finals',
          heatAssignments: fleetAssignments
            .filter(a => fleetSailed.get(a.heatDesignation))
            .map(a => ({
              heatDesignation: a.heatDesignation,
              skipperIndices: [...a.skipperIndices],
            })),
          results: reconstructedResults,
        });
      }
    }
  }

  return rounds;
}

function generateNextRoundFromResults(
  currentAssignments: { heatDesignation: string; skipperIndices: number[] }[],
  roundResults: ReconstructedRound['results'],
  skippers: ParsedHMSSkipper[],
  numberOfHeats: number,
  heatLabels: string[],
  heatSizes: number[]
): { heatDesignation: string; skipperIndices: number[] }[] {
  const newAssignments = heatLabels.map(label => ({
    heatDesignation: label,
    skipperIndices: [] as number[],
  }));

  for (const assignment of currentAssignments) {
    const heatResults = roundResults
      .filter(r => r.heatDesignation === assignment.heatDesignation);

    const finishers = heatResults
      .filter(r => r.position !== null && r.position > 0 && !r.letterScore)
      .sort((a, b) => (a.position || 999) - (b.position || 999));

    const nonFinishers = heatResults
      .filter(r => r.letterScore)
      .sort((a, b) => {
        const priorityA = getNonFinisherPriority(a.letterScore as LetterScore);
        const priorityB = getNonFinisherPriority(b.letterScore as LetterScore);
        if (priorityA !== priorityB) return priorityA - priorityB;
        const sailA = skippers[a.skipperIndex]?.sailNumber || '';
        const sailB = skippers[b.skipperIndex]?.sailNumber || '';
        return compareSailNumbers(sailA, sailB);
      });

    const allOrdered = [...finishers, ...nonFinishers];

    allOrdered.forEach((result, idx) => {
      const virtualPosition = result.position && result.position > 0
        ? result.position
        : finishers.length + nonFinishers.indexOf(result) + 1;

      const nextHeatLabel = getNextHeat(
        virtualPosition,
        assignment.heatDesignation,
        numberOfHeats,
        true
      );

      const targetIdx = heatLabels.indexOf(nextHeatLabel as string);
      if (targetIdx >= 0) {
        newAssignments[targetIdx].skipperIndices.push(result.skipperIndex);
      }
    });
  }

  rebalanceAssignments(newAssignments, heatSizes);
  return newAssignments;
}

function generateNextRoundBalanced(
  currentAssignments: { heatDesignation: string; skipperIndices: number[] }[],
  numberOfHeats: number,
  heatLabels: string[]
): { heatDesignation: string; skipperIndices: number[] }[] {
  const targetSizes = currentAssignments.map(a => a.skipperIndices.length);
  const newAssignments = heatLabels.map(label => ({
    heatDesignation: label,
    skipperIndices: [] as number[],
  }));

  for (const prevHeat of currentAssignments) {
    prevHeat.skipperIndices.forEach((skipperIndex, positionZeroBased) => {
      const position = positionZeroBased + 1;
      const nextHeatLabel = getNextHeat(
        position,
        prevHeat.heatDesignation,
        numberOfHeats,
        true
      );
      const targetIdx = heatLabels.indexOf(nextHeatLabel as string);
      if (targetIdx >= 0) {
        newAssignments[targetIdx].skipperIndices.push(skipperIndex);
      }
    });
  }

  rebalanceAssignments(newAssignments, targetSizes);
  return newAssignments;
}

function rebalanceAssignments(
  assignments: { heatDesignation: string; skipperIndices: number[] }[],
  targetSizes: number[]
): void {
  const overflow: number[] = [];
  for (let i = 0; i < assignments.length; i++) {
    while (assignments[i].skipperIndices.length > targetSizes[i]) {
      overflow.push(assignments[i].skipperIndices.pop()!);
    }
  }
  for (let i = 0; i < assignments.length; i++) {
    while (assignments[i].skipperIndices.length < targetSizes[i] && overflow.length > 0) {
      assignments[i].skipperIndices.push(overflow.shift()!);
    }
  }
}

function extractSHRSEventName(data: any[][], headerRowIndex: number): string | undefined {
  for (let i = 0; i < Math.min(headerRowIndex, 10); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map((c: any) => String(c || '').trim()).filter(Boolean).join(' ');
    if (!rowStr) continue;
    const lower = rowStr.toLowerCase();
    if (lower.includes('championship') || lower.includes('regatta') || lower.includes('event') ||
        lower.includes('nationals') || lower.includes('open') || lower.includes('trophy')) {
      return rowStr;
    }
  }
  for (let i = 0; i < Math.min(headerRowIndex, 5); i++) {
    const row = data[i];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim();
    if (firstCell && firstCell.length > 5 && /[a-zA-Z]/.test(firstCell)) {
      return firstCell;
    }
  }
  return undefined;
}

function findCol(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h === name || h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}
