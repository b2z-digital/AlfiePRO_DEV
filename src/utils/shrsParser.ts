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
  }[];
}

export async function parseSHRSFile(file: File): Promise<ParsedSHRSData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const worksheetNames = workbook.SheetNames;
  console.log('SHRS File Worksheets:', worksheetNames);

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

function parseSHRSFromRows(
  data: any[][],
  worksheetNames: string[],
  fileName?: string
): ParsedSHRSData {
  let headerRowIndex = -1;

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
    throw new Error('Could not find header row. Ensure column headers include Sail, Name, Q1, etc.');
  }

  const headers = data[headerRowIndex].map((h: any) => String(h || '').trim());
  const headersLower = headers.map((h: string) => h.toLowerCase());
  console.log('SHRS headers:', headers.filter((h: string) => h));

  const posCol = findCol(headersLower, ['pos', 'position', 'place', 'rank']);
  const sailCol = findCol(headersLower, ['sail', 'sail no', 'sail #', 'sail number', 'sailno']);
  const nameCol = findCol(headersLower, ['name', 'skipper', 'helmsman', 'competitor']);
  const clubCol = findCol(headersLower, ['club', 'organization', 'org']);

  const qualifyingCols: { index: number; round: number }[] = [];
  const finalCols: { index: number; round: number }[] = [];
  const totalCol = findCol(headersLower, ['total', 'gross', 'tot']);
  const netCol = findCol(headersLower, ['net', 'nett']);

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

  console.log(`SHRS: ${qualifyingCols.length} qualifying columns, ${finalCols.length} final columns`);
  console.log(`SHRS columns: pos=${posCol} sail=${sailCol} name=${nameCol} club=${clubCol} total=${totalCol} net=${netCol}`);

  if (sailCol === -1 && nameCol === -1) {
    throw new Error('Could not find Sail Number or Name columns in the spreadsheet.');
  }

  if (qualifyingCols.length === 0 && finalCols.length === 0) {
    throw new Error('Could not find round columns (Q1, Q2... or F1, F2... or R1, R2...).');
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
      if (isNaN(numVal)) {
        raceScores[col.round.toString()] = cellValue.toUpperCase();
      } else {
        raceScores[col.round.toString()] = numVal;
      }
    }

    const skipperPosition = posCol >= 0 ? parseInt(String(row[posCol] || '')) || skippers.length + 1 : skippers.length + 1;
    const totalScore = totalCol >= 0 ? parseFloat(String(row[totalCol] || '')) || undefined : undefined;
    const netScore = netCol >= 0 ? parseFloat(String(row[netCol] || '')) || undefined : undefined;

    skippers.push({
      position: skipperPosition,
      name: rawName || `Sail ${rawSail}`,
      sailNumber: rawSail || String(skippers.length + 1),
      club: clubCol >= 0 ? String(row[clubCol] || '').trim() || undefined : undefined,
      totalScore: netScore || totalScore,
      raceScores,
    });

    const skipperIndex = skippers.length - 1;

    for (const col of qualifyingCols) {
      const cellValue = String(row[col.index] || '').trim();
      if (!cellValue) continue;
      parseResultCell(cellValue, col.round, rawSail || String(skipperIndex + 1), results, undefined);
    }

    for (const col of finalCols) {
      const raceNum = col.round + qualifyingCols.length;
      const cellValue = String(row[col.index] || '').trim();
      if (!cellValue) continue;
      parseResultCell(cellValue, raceNum, rawSail || String(skipperIndex + 1), results, undefined);
    }
  }

  const numQualifying = qualifyingCols.length;
  const numFinals = finalCols.length;
  const numRaces = numQualifying + numFinals;
  const detectedHeats = calculateOptimalHeats(skippers.length);

  console.log(`SHRS parsed: ${skippers.length} skippers, ${numQualifying} qualifying rounds, ${numFinals} final rounds, ${detectedHeats} optimal heats`);

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

function parseResultCell(
  cellValue: string,
  raceNumber: number,
  sailNumber: string,
  results: ParsedHMSRaceResult[],
  heat?: string
): void {
  const upper = cellValue.toUpperCase().trim();

  const knownLetterScores = ['DNF', 'DNS', 'DNC', 'DSQ', 'OCS', 'RET', 'BFD', 'UFD', 'NSC', 'ZFP', 'SCP', 'DPI', 'DNE', 'RDG', 'WDN'];
  if (knownLetterScores.includes(upper)) {
    results.push({
      raceNumber,
      sailNumber,
      position: null,
      points: 0,
      letterScore: upper,
      heat,
    });
    return;
  }

  const numVal = parseFloat(cellValue);
  if (!isNaN(numVal) && numVal > 0) {
    results.push({
      raceNumber,
      sailNumber,
      position: numVal,
      points: numVal,
      heat,
    });
    return;
  }

  const mixed = cellValue.match(/^(\d+\.?\d*)\s*([a-zA-Z]+)$/);
  if (mixed) {
    const pos = parseFloat(mixed[1]);
    const code = mixed[2].toUpperCase();
    results.push({
      raceNumber,
      sailNumber,
      position: pos,
      points: pos,
      letterScore: knownLetterScores.includes(code) ? code : undefined,
      comment: code,
      heat,
    });
    return;
  }

  if (cellValue.trim()) {
    results.push({
      raceNumber,
      sailNumber,
      position: null,
      points: 0,
      letterScore: upper || undefined,
      heat,
    });
  }
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
          reconstructedResults.push({
            skipperIndex,
            heatDesignation: assignment.heatDesignation,
            position: result.position,
            letterScore: result.letterScore,
            points: result.points,
          });
        } else {
          const largestHeat = getLargestHeatSize(heatSizes);
          reconstructedResults.push({
            skipperIndex,
            heatDesignation: assignment.heatDesignation,
            position: null,
            letterScore: 'DNC',
            points: largestHeat + 1,
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

    for (const round of rounds) {
      for (const result of round.results) {
        if (!qualScores.has(result.skipperIndex)) {
          qualScores.set(result.skipperIndex, 0);
          qualRaceScores.set(result.skipperIndex, []);
        }
        const score = result.letterScore
          ? calculateNonFinisherScore(largestHeat)
          : (result.position || largestHeat + 1);
        qualRaceScores.get(result.skipperIndex)!.push(score);
      }
    }

    const numDiscards = calculateSHRSDiscards(qualifyingRounds);
    qualRaceScores.forEach((scores, idx) => {
      const sorted = [...scores].sort((a, b) => b - a);
      const kept = sorted.slice(numDiscards);
      qualScores.set(idx, kept.reduce((sum, s) => sum + s, 0));
    });

    const rankedSkippers = Array.from(qualScores.entries())
      .sort(([, a], [, b]) => a - b);

    const fleetSizes = calculateHeatSizes(skippers.length, numberOfHeats);
    const fleetAssignments = heatLabels.map((label, i) => ({
      heatDesignation: label,
      skipperIndices: [] as number[],
    }));

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

      for (const assignment of fleetAssignments) {
        for (const skipperIndex of assignment.skipperIndices) {
          const skipper = skippers[skipperIndex];
          const result = roundResults.find(r => r.sailNumber === skipper.sailNumber);

          if (result) {
            reconstructedResults.push({
              skipperIndex,
              heatDesignation: assignment.heatDesignation,
              position: result.position,
              letterScore: result.letterScore,
              points: result.points,
            });
          } else {
            const lh = getLargestHeatSize(finalFleetSizes);
            reconstructedResults.push({
              skipperIndex,
              heatDesignation: assignment.heatDesignation,
              position: null,
              letterScore: 'DNC',
              points: lh + 1,
            });
          }
        }
      }

      rounds.push({
        round: raceNum,
        phase: 'finals',
        heatAssignments: fleetAssignments.map(a => ({
          heatDesignation: a.heatDesignation,
          skipperIndices: [...a.skipperIndices],
        })),
        results: reconstructedResults,
      });
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
