import * as XLSX from 'xlsx';
import { ParsedHMSData, ParsedHMSSkipper, ParsedHMSRaceResult } from '../types/hmsValidator';

/**
 * Parse HMS Excel file
 * This parser handles the HMS 2022 format with Score Sheet and scoring tabs
 */
export async function parseHMSFile(file: File): Promise<ParsedHMSData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Get all sheet names
  const worksheetNames = workbook.SheetNames;
  console.log('HMS File Worksheets:', worksheetNames);

  // Find the Score Sheet (skipper data) - look for exact "Score Sheet" first
  const scoreSheetName = worksheetNames.find(name =>
    name.toLowerCase() === 'score sheet'
  ) || worksheetNames.find(name =>
    name.toLowerCase().includes('score') && name.toLowerCase().includes('sheet')
  ) || worksheetNames.find(name =>
    name.toLowerCase().includes('skipper')
  ) || worksheetNames[0];

  console.log('Using Score Sheet tab:', scoreSheetName);

  const scoreSheet = workbook.Sheets[scoreSheetName];

  // Convert to JSON with header row
  const scoreData: any[][] = XLSX.utils.sheet_to_json(scoreSheet, {
    header: 1,
    defval: '',
    raw: false
  });

  // Parse skippers from Score Sheet
  const skippers = parseSkippersFromScoreSheet(scoreData);
  console.log(`Parsed ${skippers.length} skippers from Score Sheet`);

  // Parse race results from scoring tabs
  const results = parseRaceResults(workbook, worksheetNames, scoreSheetName);
  console.log(`Parsed ${results.length} race results`);

  // Detect if heat racing
  const hasHeats = results.some(r => r.heat !== undefined);
  const heats = hasHeats
    ? Array.from(new Set(results.filter(r => r.heat).map(r => r.heat!)))
    : undefined;

  // Count races
  const numRaces = results.length > 0 ? Math.max(...results.map(r => r.raceNumber), 0) : 0;

  return {
    skippers,
    results,
    numRaces,
    hasHeats,
    heats,
    worksheetNames,
    eventName: extractEventName(scoreData),
    eventDate: extractEventDate(scoreData),
    hostClub: extractHostClub(scoreData)
  };
}

/**
 * Parse skippers from the Score Sheet tab
 */
function parseSkippersFromScoreSheet(data: any[][]): ParsedHMSSkipper[] {
  const skippers: ParsedHMSSkipper[] = [];

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
    const hasPosition = rowStr.includes('position') || rowStr.includes('pos');
    const hasSkipper = rowStr.includes('skipper') || rowStr.includes('name') || rowStr.includes('helmsman');
    const hasSail = rowStr.includes('sail');
    if ((hasPosition && hasSkipper) || (hasPosition && hasSail) || (hasSkipper && hasSail)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    for (let i = 0; i < Math.min(20, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
      if (rowStr.includes('position') || rowStr.includes('skipper') || rowStr.includes('sail')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    return skippers;
  }

  const headers = data[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
  console.log('Score Sheet headers:', headers.filter(h => h).slice(0, 15));

  const posCol = findColumnIndex(headers, ['position', 'pos', 'place']);
  const skipperCol = findColumnIndex(headers, ['skipper', 'name', 'helmsman']);
  const sailCol = findColumnIndex(headers, ['sail', 'sail #', 'sail no']);
  const clubCol = findColumnIndex(headers, ['club', 'club/city', 'organization']);
  const hullCol = findColumnIndex(headers, ['hull', 'boat']);
  const myaCol = findColumnIndex(headers, ['mya', 'mya no', 'mya no.', 'member']);
  const scoreCol = findColumnIndex(headers, ['score', 'total', 'points']);

  console.log(`Score Sheet columns: pos=${posCol} skipper=${skipperCol} sail=${sailCol} club=${clubCol} hull=${hullCol} mya=${myaCol} score=${scoreCol}`);

  const raceColumns: { index: number; raceNumber: number }[] = [];
  const coreMaxCol = Math.max(posCol, skipperCol, sailCol, clubCol, hullCol, myaCol, scoreCol);
  headers.forEach((header, index) => {
    if (index <= coreMaxCol) return;
    const cleanHeader = header.replace(/[^\d]/g, '');
    const num = parseInt(cleanHeader);
    if (!isNaN(num) && num > 0 && num < 100) {
      raceColumns.push({ index, raceNumber: num });
    }
  });

  const skipLabels = ['sort', 'filter', 'header', 'total', 'count', 'sum', 'average', 'program', 'options'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];

    if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
      continue;
    }

    const rawSail = row[sailCol]?.toString().trim() || '';
    const rawName = row[skipperCol]?.toString().trim() || '';

    if (!rawSail || !rawName) continue;

    const sailIsNumeric = /^\d+$/.test(rawSail);
    if (!sailIsNumeric) continue;

    const nameLower = rawName.toLowerCase();
    if (skipLabels.some(label => nameLower === label)) continue;

    if (!/[a-zA-Z]/.test(rawName)) continue;

    const raceScores: { [key: string]: number | string } = {};
    raceColumns.forEach(({ index, raceNumber }) => {
      const cellValue = row[index]?.toString().trim();
      if (cellValue) {
        const numValue = parseFloat(cellValue);
        if (isNaN(numValue)) {
          raceScores[raceNumber.toString()] = cellValue;
        } else {
          raceScores[raceNumber.toString()] = numValue;
        }
      }
    });

    const skipper: ParsedHMSSkipper = {
      position: posCol >= 0 ? parseInt(row[posCol]) || skippers.length + 1 : skippers.length + 1,
      name: rawName,
      sailNumber: rawSail,
      club: clubCol >= 0 ? row[clubCol]?.toString().trim() : undefined,
      hull: hullCol >= 0 ? row[hullCol]?.toString().trim() : undefined,
      myaNumber: myaCol >= 0 ? row[myaCol]?.toString().trim() : undefined,
      totalScore: scoreCol >= 0 ? parseFloat(row[scoreCol]) || undefined : undefined,
      raceScores
    };

    skippers.push(skipper);
  }

  console.log(`Parsed ${skippers.length} skippers from Score Sheet`);
  return skippers;
}

/**
 * Parse race results from scoring tabs
 */
function parseRaceResults(workbook: XLSX.WorkBook, worksheetNames: string[], scoreSheetName: string): ParsedHMSRaceResult[] {
  const results: ParsedHMSRaceResult[] = [];

  // First, try to find "Race Results" tab specifically
  const raceResultsTab = worksheetNames.find(name =>
    name.toLowerCase().includes('race') && name.toLowerCase().includes('result')
  ) || worksheetNames.find(name =>
    name.toLowerCase().includes('result')
  );

  if (raceResultsTab) {
    console.log('Found Race Results tab:', raceResultsTab);
    const sheet = workbook.Sheets[raceResultsTab];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false
    });

    // Try to parse heat-based scoring
    const heatResults = parseHeatScoringFromSheet(data, raceResultsTab);
    results.push(...heatResults);
  }

  // Also look for other scoring tabs (but exclude Score Sheet and instruction sheets)
  for (const sheetName of worksheetNames) {
    // Skip the Score Sheet we already parsed
    if (sheetName === scoreSheetName) {
      continue;
    }

    // Skip if we already processed this as Race Results
    if (raceResultsTab && sheetName === raceResultsTab) {
      continue;
    }

    // Skip instruction and seeding sheets
    if (sheetName.toLowerCase().includes('instruction') ||
        sheetName.toLowerCase().includes('seeding') ||
        sheetName.toLowerCase().includes('worksheet')) {
      continue;
    }

    console.log('Checking tab for race data:', sheetName);

    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false
    });

    // Try to parse heat-based scoring
    const heatResults = parseHeatScoringFromSheet(data, sheetName);
    if (heatResults.length > 0) {
      console.log(`Found ${heatResults.length} results in tab: ${sheetName}`);
      results.push(...heatResults);
    }
  }

  return results;
}

/**
 * Parse heat-based scoring from a worksheet
 */
function parseHeatScoringFromSheet(data: any[][], sheetName: string): ParsedHMSRaceResult[] {
  const results: ParsedHMSRaceResult[] = [];
  let currentHeat: string | null = null;

  console.log(`Parsing sheet "${sheetName}" with ${data.length} rows`);

  const columnarResults = parseColumnarRaceFormat(data, sheetName);
  if (columnarResults.length > 0) {
    console.log(`Found columnar race format with ${columnarResults.length} results`);
    return columnarResults;
  }

  let positionColIndex = -1;
  for (let i = 0; i < Math.min(30, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cell = String(row[c] || '').trim();
      if (cell.match(/^(\d+)(?:st|nd|rd|th)$/i)) {
        positionColIndex = c;
        break;
      }
    }
    if (positionColIndex >= 0) break;
  }

  if (positionColIndex === -1) positionColIndex = 0;
  const dataColStart = positionColIndex + 1;
  console.log(`Heat format: position column=${positionColIndex}, data starts at col=${dataColStart}`);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cellStr = String(row[c] || '').trim();
      const heatMatch = cellStr.match(/(?:HMS\s+)?Heat\s+([A-E])/i);
      if (heatMatch) {
        currentHeat = heatMatch[1].toUpperCase();
        console.log(`Found Heat ${currentHeat} at row ${i}`);
        break;
      }
    }

    const posCell = String(row[positionColIndex] || '').trim();
    const positionMatch = posCell.match(/^(\d+)(?:st|nd|rd|th)$/i);
    if (!positionMatch) continue;

    const position = parseInt(positionMatch[1]);

    let raceNumber = 0;
    for (let colIndex = dataColStart; colIndex < row.length; colIndex += 4) {
      const sailNumber = String(row[colIndex] || '').trim();
      const comment = String(row[colIndex + 1] || '').trim();
      const points = parseFloat(String(row[colIndex + 2] || '0'));

      raceNumber++;

      if (!sailNumber || sailNumber === '00' || sailNumber === '0' || !/^\d+$/.test(sailNumber)) {
        continue;
      }

      const letterScore = comment && comment.toUpperCase() !== 'OK' && comment.toUpperCase() !== 'L' ? comment.toUpperCase() : undefined;

      results.push({
        raceNumber,
        heat: currentHeat || undefined,
        sailNumber,
        position: letterScore ? null : position,
        points,
        letterScore
      });
    }
  }

  if (results.length === 0) {
    console.log(`No heat-based results found, trying simple table format`);
    const simpleResults = parseSimpleResultsTable(data, sheetName);
    results.push(...simpleResults);
  }

  console.log(`Parsed ${results.length} results from "${sheetName}"`);
  return results;
}

/**
 * Parse columnar race format (RO1, RO2, RO3, etc.)
 * HMS Race Results tab structure:
 *   - Race headers row: "Verify RO1", "RO2", "RO3", etc. spaced every 4 columns
 *   - Heat sections stacked vertically: "HMS Heat A" row, position rows, "HMS Heat B" row, position rows, etc.
 *   - Each position row has 4-column groups per race: [Sail No, Comments, Points, Exp]
 */
function parseColumnarRaceFormat(data: any[][], sheetName: string): ParsedHMSRaceResult[] {
  const results: ParsedHMSRaceResult[] = [];

  console.log(`Trying columnar race format for "${sheetName}"`);

  let headerRowIndex = -1;
  let maxRaceCount = 0;
  const raceHeaderPattern = /(?:verify\s+)?r[o0](\d+)|race\s*(\d+)/i;

  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    let raceCount = 0;
    for (let col = 0; col < row.length; col++) {
      const cellValue = String(row[col] || '').trim();
      if (raceHeaderPattern.test(cellValue)) {
        raceCount++;
      }
    }

    if (raceCount > maxRaceCount) {
      maxRaceCount = raceCount;
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1) {
    return results;
  }

  console.log(`Using row ${headerRowIndex} with ${maxRaceCount} race headers`);

  const headerRow = data[headerRowIndex];
  let raceColumns: { startCol: number; raceNumber: number }[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const cellValue = String(headerRow[col] || '').trim();
    const match = cellValue.match(/(?:verify\s+)?r[o0](\d+)|race\s*(\d+)/i);
    if (match) {
      const raceNum = parseInt(match[1] || match[2]);
      raceColumns.push({ startCol: col, raceNumber: raceNum });
    }
  }

  if (raceColumns.length === 0) {
    return results;
  }

  let positionColIndex = -1;
  for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 20, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cell = String(row[c] || '').trim();
      if (cell.match(/^(\d+)(?:st|nd|rd|th)$/i)) {
        positionColIndex = c;
        break;
      }
    }
    if (positionColIndex >= 0) break;
  }

  if (positionColIndex === -1) positionColIndex = 0;
  console.log(`Columnar format: position column=${positionColIndex}, ${raceColumns.length} race columns detected`);

  let dataStartRow = headerRowIndex + 1;
  for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 15, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cell = String(row[c] || '').trim();
      if (cell.match(/^(\d+)(?:st|nd|rd|th)$/i) || cell.match(/(?:HMS\s+)?Heat\s+[A-E]/i)) {
        dataStartRow = i;
        break;
      }
    }
    if (dataStartRow !== headerRowIndex + 1) break;
  }

  let currentHeat: string | null = null;

  for (let rowIdx = dataStartRow; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    if (!row || row.length === 0) continue;

    for (let c = 0; c < Math.min(8, row.length); c++) {
      const cellStr = String(row[c] || '').trim();
      const heatMatch = cellStr.match(/(?:HMS\s+)?Heat\s+([A-F])/i);
      if (heatMatch) {
        currentHeat = heatMatch[1].toUpperCase();
        console.log(`Found Heat ${currentHeat} at row ${rowIdx}`);
        break;
      }
    }

    const posCell = String(row[positionColIndex] || '').trim();
    const positionMatch = posCell.match(/^(\d+)(?:st|nd|rd|th)$/i);
    if (!positionMatch) continue;

    const position = parseInt(positionMatch[1]);

    raceColumns.forEach(({ startCol, raceNumber }) => {
      const sailNumber = String(row[startCol] || '').trim();
      const comment = String(row[startCol + 1] || '').trim();
      const pointsStr = String(row[startCol + 2] || '0').trim();
      const points = parseFloat(pointsStr) || 0;

      if (!sailNumber || sailNumber === '00' || sailNumber === '0' || !/^\d+$/.test(sailNumber)) {
        return;
      }

      const letterScore = comment && comment.toUpperCase() !== 'OK' && comment.toUpperCase() !== 'L' ? comment.toUpperCase() : undefined;

      results.push({
        raceNumber,
        heat: currentHeat || undefined,
        sailNumber,
        position: letterScore ? null : position,
        points,
        letterScore
      });
    });
  }

  console.log(`Columnar format: created ${results.length} race results across ${raceColumns.length} races`);
  if (currentHeat) {
    const heatsFound = [...new Set(results.filter(r => r.heat).map(r => r.heat!))];
    console.log(`Heats detected: ${heatsFound.join(', ')}`);
  }
  return results;
}

/**
 * Parse simple results table (non-heat format)
 */
function parseSimpleResultsTable(data: any[][], sheetName: string): ParsedHMSRaceResult[] {
  const results: ParsedHMSRaceResult[] = [];

  // Log first 10 rows to understand structure
  console.log(`📊 First 10 rows of "${sheetName}":`, data.slice(0, 10));

  // Find header row
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    const rowStr = row.join('').toLowerCase();
    if (rowStr.includes('sail') || rowStr.includes('position') || rowStr.includes('race') || rowStr.includes('name')) {
      headerRowIndex = i;
      console.log(`Found potential header row at index ${i}:`, row);
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.log('❌ No header row found in simple table parser');
    return results;
  }

  const headers = data[headerRowIndex].map(h => String(h || '').toLowerCase().trim());
  console.log('📋 Headers found:', headers);

  // Find columns
  const sailCol = findColumnIndex(headers, ['sail', 'sail #', 'sail no', 'number', 'sail number']);
  const nameCol = findColumnIndex(headers, ['name', 'skipper', 'competitor']);

  console.log(`Found sail column at index: ${sailCol}`);
  console.log(`Found name column at index: ${nameCol}`);

  // Find race columns - look for numeric headers or "R1", "R2" etc
  const raceColumns: { index: number; raceNumber: number }[] = [];
  headers.forEach((header, index) => {
    // Check for "R1", "R2" format
    const rMatch = header.match(/r(\d+)/i);
    if (rMatch) {
      const num = parseInt(rMatch[1]);
      raceColumns.push({ index, raceNumber: num });
      console.log(`Found race column R${num} at index ${index}`);
      return;
    }

    // Check for pure numeric headers
    const cleanHeader = header.replace(/[^\d]/g, '');
    const num = parseInt(cleanHeader);
    if (!isNaN(num) && num > 0 && num < 100) {
      raceColumns.push({ index, raceNumber: num });
      console.log(`Found race column ${num} at index ${index}`);
    }
  });

  console.log(`Found ${raceColumns.length} race columns:`, raceColumns);

  if (raceColumns.length === 0) {
    console.log('❌ No race columns found');
    return results;
  }

  // Parse data rows
  let rowsParsed = 0;
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
      continue;
    }

    const sailNumber = sailCol >= 0 ? row[sailCol]?.toString().trim() : null;
    if (!sailNumber || sailNumber === '' || sailNumber === '00' || sailNumber === '0') continue;

    rowsParsed++;

    // Parse race results
    raceColumns.forEach(({ index, raceNumber }) => {
      const cellValue = row[index]?.toString().trim();
      if (cellValue && cellValue !== '') {
        const numValue = parseFloat(cellValue);
        const isLetterScore = isNaN(numValue);

        results.push({
          raceNumber,
          sailNumber,
          position: isLetterScore ? null : numValue,
          points: isLetterScore ? 0 : numValue,
          letterScore: isLetterScore ? cellValue : undefined
        });
      }
    });
  }

  console.log(`✅ Parsed ${rowsParsed} data rows, created ${results.length} race results`);

  return results;
}

/**
 * Helper function to find column index by multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => h.includes(name));
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Extract event name from data
 */
function extractEventName(data: any[][]): string | undefined {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim().toLowerCase();
    if (firstCell === 'event' || firstCell === 'event:') {
      const val = row.slice(1).map(c => String(c || '').trim()).filter(Boolean).join(' ');
      if (val) return val;
    }
    const rowStr = row.map(c => String(c || '')).join(' ').trim();
    if (rowStr.toLowerCase().includes('event') || rowStr.toLowerCase().includes('championship')) {
      const cleaned = rowStr.replace(/^event:?\s*/i, '').trim();
      if (cleaned && !cleaned.toLowerCase().startsWith('hms')) return cleaned;
    }
  }
  return undefined;
}

function extractEventDate(data: any[][]): string | undefined {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim().toLowerCase();
    if (firstCell.includes('date')) {
      const val = row.slice(1).map(c => String(c || '').trim()).filter(Boolean).join(' ');
      if (val) return val;
    }
    const rowStr = row.map(c => String(c || '')).join(' ').trim();
    if (rowStr.toLowerCase().includes('date')) {
      return rowStr.replace(/^date.*?:?\s*/i, '').trim();
    }
  }
  return undefined;
}

function extractHostClub(data: any[][]): string | undefined {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim().toLowerCase();
    if (firstCell.includes('host club') || firstCell.includes('host')) {
      const val = row.slice(1).map(c => String(c || '').trim()).filter(Boolean).join(' ');
      if (val) return val;
    }
    const rowStr = row.map(c => String(c || '')).join(' ').trim();
    if (rowStr.toLowerCase().includes('host club')) {
      return rowStr.replace(/^host club:?\s*/i, '').trim();
    }
  }
  return undefined;
}

/**
 * Parse HMS data from CSV paste
 * This handles the Score Sheet format with comma-separated values
 */
export function parseHMSFromCSV(csvText: string): ParsedHMSData {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);

  if (lines.length === 0) {
    throw new Error('No data found in CSV');
  }

  // Parse headers and data
  const rows = lines.map(line => parseCSVLine(line));

  // Auto-detect structure
  const skippers: ParsedHMSSkipper[] = [];
  const results: ParsedHMSRaceResult[] = [];

  // Find header row (usually contains 'Sail', 'Position', or 'Skipper')
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    const headerIndicators = ['position', 'skipper', 'sail', 'name', 'club'];
    if (row.some(cell =>
      headerIndicators.some(indicator =>
        cell.toString().toLowerCase().includes(indicator)
      )
    )) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row. Please ensure your CSV has column headers.');
  }

  const headers = rows[headerRowIndex].map(h => h.toString().toLowerCase().trim());

  // Find column indices
  const positionCol = headers.findIndex(h => h.includes('position') || h.includes('pos'));
  const skipperCol = headers.findIndex(h => h.includes('skipper') || h.includes('name'));
  const sailCol = headers.findIndex(h => h.includes('sail'));
  const clubCol = headers.findIndex(h => h.includes('club'));
  const hullCol = headers.findIndex(h => h.includes('hull'));
  const scoreCol = headers.findIndex(h => h.includes('score') || h.includes('total'));

  // Find race columns (numeric headers or "R1", "R2", etc.)
  const raceColumns: { index: number; raceNumber: number }[] = [];
  headers.forEach((header, index) => {
    const match = header.match(/(?:r|race)?(\d+)/);
    if (match) {
      raceColumns.push({ index, raceNumber: parseInt(match[1]) });
    } else if (!isNaN(parseInt(header)) && parseInt(header) > 0) {
      raceColumns.push({ index, raceNumber: parseInt(header) });
    }
  });

  // Parse data rows
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip empty rows
    if (row.every(cell => !cell || cell.toString().trim() === '')) {
      continue;
    }

    const sailNumber = row[sailCol]?.toString().trim();
    const skipperName = row[skipperCol]?.toString().trim();

    if (!sailNumber || !skipperName) {
      continue;
    }

    // Create skipper entry
    const raceScores: { [key: string]: number | string } = {};
    raceColumns.forEach(({ index, raceNumber }) => {
      const cellValue = row[index]?.toString().trim();
      if (cellValue) {
        // Check if it's a letter score or number
        if (isNaN(parseFloat(cellValue))) {
          raceScores[raceNumber.toString()] = cellValue;
        } else {
          raceScores[raceNumber.toString()] = parseFloat(cellValue);
        }
      }
    });

    const skipper: ParsedHMSSkipper = {
      position: skippers.length + 1,
      name: skipperName,
      sailNumber: sailNumber,
      club: row[clubCol]?.toString().trim(),
      hull: row[hullCol]?.toString().trim(),
      totalScore: scoreCol >= 0 ? parseFloat(row[scoreCol]?.toString() || '0') : undefined,
      raceScores
    };

    skippers.push(skipper);

    // Create race results
    raceColumns.forEach(({ raceNumber }) => {
      const score = raceScores[raceNumber.toString()];
      if (score !== undefined) {
        const isLetterScore = typeof score === 'string' && isNaN(parseFloat(score));

        results.push({
          raceNumber,
          sailNumber,
          position: isLetterScore ? null : (typeof score === 'number' ? score : parseFloat(score)),
          points: typeof score === 'number' ? score : 0,
          letterScore: isLetterScore ? score : undefined
        });
      }
    });
  }

  return {
    skippers,
    results,
    numRaces: raceColumns.length,
    hasHeats: false,
    worksheetNames: ['Pasted Data']
  };
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  // Detect delimiter - check if line contains tabs (from Excel paste) or commas (from CSV)
  const hasTab = line.includes('\t');
  const hasComma = line.includes(',');

  // Prefer tabs if present (Excel paste format)
  const delimiter = hasTab ? '\t' : ',';

  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse skipper data and results data separately (two-step paste)
 */
export function parseHMSTwoStep(skipperText: string, resultsText: string): ParsedHMSData {
  console.log('=== TWO-STEP PARSE START ===');
  console.log('Skipper data length:', skipperText.length);
  console.log('Results data length:', resultsText.length);

  // Parse skipper data
  const skipperLines = skipperText.split('\n').map(line => line.trim()).filter(line => line);
  const skipperRows = skipperLines.map(line => parseCSVLine(line));

  console.log(`Skipper rows: ${skipperRows.length}`);

  // Find skipper header
  let skipperHeaderIdx = -1;
  for (let i = 0; i < Math.min(5, skipperRows.length); i++) {
    const row = skipperRows[i];
    const rowStr = row.join('|').toLowerCase();
    if (rowStr.includes('sail') || rowStr.includes('helm') || rowStr.includes('skipper')) {
      skipperHeaderIdx = i;
      console.log(`Found skipper header at row ${i}:`, row);
      break;
    }
  }

  const skippers: ParsedHMSSkipper[] = [];

  if (skipperHeaderIdx >= 0) {
    const headers = skipperRows[skipperHeaderIdx].map(h => h.toString().toLowerCase().trim());
    const sailCol = headers.findIndex(h => h.includes('sail'));
    const helmCol = headers.findIndex(h => h.includes('helm') || h.includes('skipper') || h.includes('name'));
    const crewCol = headers.findIndex(h => h.includes('crew'));
    const clubCol = headers.findIndex(h => h.includes('club'));
    const classCol = headers.findIndex(h => h.includes('class') || h.includes('boat'));

    console.log(`Column indices - Sail: ${sailCol}, Helm: ${helmCol}, Crew: ${crewCol}, Club: ${clubCol}, Class: ${classCol}`);

    for (let i = skipperHeaderIdx + 1; i < skipperRows.length; i++) {
      const row = skipperRows[i];
      const sailNumber = sailCol >= 0 ? row[sailCol]?.toString().trim() : '';
      const helmName = helmCol >= 0 ? row[helmCol]?.toString().trim() : '';

      if (sailNumber && helmName) {
        skippers.push({
          position: i - skipperHeaderIdx,
          name: helmName,
          sailNumber,
          club: clubCol >= 0 ? row[clubCol]?.toString().trim() : undefined,
          hull: classCol >= 0 ? row[classCol]?.toString().trim() : undefined,
          raceScores: {}
        });
      }
    }
  }

  console.log(`Parsed ${skippers.length} skippers`);

  // Parse results data
  const resultsLines = resultsText.split('\n').map(line => line.trim()).filter(line => line);

  // Check first line for delimiter
  const firstLine = resultsLines[0] || '';
  const hasTab = firstLine.includes('\t');
  const tabCount = (firstLine.match(/\t/g) || []).length;
  console.log(`📋 First results line has ${tabCount} tabs, ${firstLine.length} chars`);
  console.log(`📋 First 100 chars: "${firstLine.substring(0, 100)}"`);
  console.log(`📋 Using ${hasTab ? 'TAB' : 'COMMA'} delimiter`);

  const resultsRows = resultsLines.map(line => parseCSVLine(line));

  console.log(`Results rows: ${resultsRows.length}`);
  console.log('📊 First row has', resultsRows[0]?.length, 'columns');
  console.log('📊 First 10 columns of row 0:', resultsRows[0]?.slice(0, 10));

  // Check if race headers are present
  let hasRaceHeaders = false;
  for (let i = 0; i < Math.min(5, resultsRows.length); i++) {
    const row = resultsRows[i];
    const rowStr = row.join('|').toLowerCase().replace(/\s+/g, '');
    // Look for race identifiers like RO1, RO2, Race1, Race2, or "Verify RO1"
    if (rowStr.match(/r[o0]\d+|race\d+|verify/)) {
      hasRaceHeaders = true;
      console.log(`✅ Found race headers in row ${i}:`, row.slice(0, 10));
      break;
    }
  }

  if (!hasRaceHeaders) {
    console.error('❌ NO RACE HEADERS FOUND');
    console.log('Results data appears to be missing the header row with race identifiers');
    console.log('Expected headers like: "Verify RO1", "RO2", "RO3", etc.');
    throw new Error('Missing race headers in results data. Please include the header row that contains race identifiers (e.g., "Verify RO1", "RO2", "RO3")');
  }

  // Use columnar race format parser
  const results = parseColumnarRaceFormat(resultsRows, 'Results');

  console.log(`Parsed ${results.length} race results`);
  console.log('=== TWO-STEP PARSE END ===');

  if (results.length === 0) {
    console.error('❌ Parser found headers but extracted 0 results');
    throw new Error('Could not extract race results. Check that your results data includes both position columns and race data columns.');
  }

  // Calculate numRaces
  const numRaces = results.length > 0
    ? Math.max(...results.map(r => r.raceNumber))
    : 0;

  // 🔥 CRITICAL FIX: Merge race results back into skippers
  console.log('🔧 Merging race results into skipper records...');

  // Build a map of race results by sail number
  const resultsBySail: { [sailNo: string]: { [raceNo: number]: any } } = {};
  let totalScoreBySail: { [sailNo: string]: number } = {};

  results.forEach(result => {
    const sailNo = result.sailNumber.toString();
    if (!resultsBySail[sailNo]) {
      resultsBySail[sailNo] = {};
      totalScoreBySail[sailNo] = 0;
    }
    resultsBySail[sailNo][result.raceNumber] = result.points;
    totalScoreBySail[sailNo] += result.points || 0;
  });

  // Attach race scores and total scores to skippers
  skippers.forEach(skipper => {
    const sailNo = skipper.sailNumber.toString();
    if (resultsBySail[sailNo]) {
      skipper.raceScores = resultsBySail[sailNo];
      skipper.totalScore = totalScoreBySail[sailNo];
      console.log(`  ✅ Skipper ${sailNo} (${skipper.name}): ${Object.keys(skipper.raceScores).length} races, total: ${skipper.totalScore}`);
    } else {
      console.log(`  ⚠️  Skipper ${sailNo} (${skipper.name}): No race results found`);
    }
  });

  console.log('✅ Race result merge complete!');

  const hasHeats = results.some(r => r.heat !== undefined);
  const heats = hasHeats
    ? [...new Set(results.filter(r => r.heat).map(r => r.heat!))]
    : undefined;

  if (hasHeats) {
    console.log(`Heat racing detected: ${heats!.join(', ')}`);
  }

  return {
    skippers,
    results,
    numRaces,
    hasHeats,
    heats,
    worksheetNames: ['Skippers', 'Results']
  };
}

/**
 * Auto-detect HMS format and parse accordingly
 */
export function parseHMSAuto(text: string): ParsedHMSData {
  // Try to detect if it's heat-based scoring
  if (text.toLowerCase().includes('heat a') || text.toLowerCase().includes('heat b')) {
    // Parse as CSV with heat structure
    return parseHMSFromCSV(text);
  }

  // Otherwise, try standard score sheet format
  return parseHMSFromCSV(text);
}
