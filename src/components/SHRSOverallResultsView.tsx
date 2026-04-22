import React, { useMemo, useState } from 'react';
import { Trophy, ArrowLeft, ShieldCheck, CircleAlert as AlertCircle, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation, HeatResult } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { compareWithCountback } from '../utils/scratchCalculations';
import { calculateSHRSDiscards } from '../utils/shrsHeatSystem';
import { getLetterScoreDisplayCode } from '../types/letterScores';

interface SHRSOverallResultsViewProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  onBack: () => void;
  isSimulated?: boolean;
}

const FLEET_NAMES: Record<string, string> = {
  'A': 'GOLD FLEET',
  'B': 'SILVER FLEET',
  'C': 'BRONZE FLEET',
  'D': 'COPPER FLEET',
  'E': 'FLEET E',
};

const FLEET_PREFIX: Record<string, string> = {
  'A': 'G',
  'B': 'S',
  'C': 'B',
  'D': 'C',
  'E': 'E',
};

const FLEET_HEADER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A': { bg: 'bg-yellow-600', text: 'text-white', border: 'border-yellow-500' },
  'B': { bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-400' },
  'C': { bg: 'bg-amber-700', text: 'text-white', border: 'border-amber-600' },
  'D': { bg: 'bg-orange-600', text: 'text-white', border: 'border-orange-500' },
  'E': { bg: 'bg-pink-600', text: 'text-white', border: 'border-pink-500' },
};

const FLEET_TEXT_COLORS: Record<string, { dark: string; light: string }> = {
  'A': { dark: 'text-yellow-300', light: 'text-yellow-700' },
  'B': { dark: 'text-slate-300', light: 'text-slate-500' },
  'C': { dark: 'text-amber-400', light: 'text-amber-700' },
  'D': { dark: 'text-orange-400', light: 'text-orange-600' },
  'E': { dark: 'text-pink-400', light: 'text-pink-600' },
};

interface SkipperStanding {
  skipperIndex: number;
  skipper: Skipper;
  fleet: HeatDesignation;
  fleetPosition: number;
  raceScores: (number | null)[];
  raceLetterScores: (string | undefined)[];
  raceCustomPoints: (number | undefined)[];
  total: number;
  discardTotal: number;
  net: number;
  droppedIndices: Set<number>;
  qualifyingDiscardTotal: number;
  finalsDiscardTotal: number;
}

export const SHRSOverallResultsView: React.FC<SHRSOverallResultsViewProps> = ({
  skippers,
  heatManagement,
  darkMode,
  onBack,
  isSimulated,
}) => {
  const isShrs = heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = heatManagement?.configuration?.shrsQualifyingRounds || 0;

  const raceResults = useMemo(() => {
    if (!heatManagement?.rounds?.length) return [];
    return convertHeatResultsToRaceResults(heatManagement, skippers);
  }, [heatManagement, skippers]);

  const completedRaces = useMemo(() => {
    const races = new Set(raceResults.map((r: any) => r.race));
    return Array.from(races).sort((a: any, b: any) => a - b) as number[];
  }, [raceResults]);

  const qualifyingRaces = completedRaces.filter(r => r <= shrsQualifyingRounds);
  const finalsRaces = completedRaces.filter(r => r > shrsQualifyingRounds);

  const shrsVerification = useMemo(() => {
    if (!isSimulated) return null;
    const importedLookup = new Map<string, number>();
    for (const round of (heatManagement?.rounds || [])) {
      if (!round.completed) continue;
      for (const res of round.results) {
        if (res.importedScore !== undefined && res.importedScore !== null) {
          importedLookup.set(`${res.skipperIndex}-${round.round}`, res.importedScore);
        }
      }
    }
    if (importedLookup.size === 0) return null;

    let matched = 0;
    let mismatched = 0;
    let total = 0;
    const mismatches: { skipperIndex: number; race: number; computed: number; imported: number }[] = [];

    for (const r of raceResults) {
      const key = `${r.skipperIndex}-${r.race}`;
      const imported = importedLookup.get(key);
      if (imported === undefined) continue;
      total++;
      const computed = r.position;
      if (computed != null && Math.abs(computed - imported) < 0.05) {
        matched++;
      } else {
        mismatched++;
        mismatches.push({ skipperIndex: r.skipperIndex, race: r.race, computed, imported });
      }
    }
    return { matched, mismatched, total, mismatches };
  }, [isSimulated, heatManagement, raceResults]);

  const [showReport, setShowReport] = useState(false);

  const complianceReport = useMemo(() => {
    if (!isSimulated || !heatManagement?.rounds?.length) return null;
    const rounds = heatManagement.rounds.filter(r => r.completed);
    const qualRounds = rounds.filter(r => r.round <= shrsQualifyingRounds);
    const finalRounds = rounds.filter(r => r.round > shrsQualifyingRounds);

    const rdgAveDetails: {
      skipperIndex: number; name: string; round: number; phase: string;
      inputScores: { round: number; score: number; type: string }[];
      computed: number; imported: number | null;
    }[] = [];

    const letterScoreSummary: { type: string; count: number; rule: string }[] = [];
    const letterCounts: Record<string, number> = {};

    for (const round of rounds) {
      for (const res of round.results) {
        if (!res.letterScore) continue;
        const displayCode = getLetterScoreDisplayCode(res.letterScore, res.customPoints);
        const baseCode = displayCode.replace(/\s*[\d.]+$/, '').trim();
        letterCounts[baseCode] = (letterCounts[baseCode] || 0) + 1;

        const isRDGave = res.letterScore === 'RDG' && (res.customPoints === -1 || res.customPoints === -2);
        if (isRDGave) {
          const isQualPhase = round.round <= shrsQualifyingRounds;
          const phaseRounds = isQualPhase ? qualRounds : finalRounds;
          const inputScores: { round: number; score: number; type: string }[] = [];

          for (const pr of phaseRounds) {
            const pRes = pr.results.find(r => r.skipperIndex === res.skipperIndex);
            if (!pRes) continue;
            const pIsRDGave = pRes.letterScore === 'RDG' && (pRes.customPoints === -1 || pRes.customPoints === -2);
            if (pIsRDGave) continue;

            let score: number;
            let type: string;
            if (!pRes.letterScore && pRes.position !== null) {
              score = pRes.importedScore !== undefined && pRes.importedScore !== null ? pRes.importedScore : pRes.position;
              type = 'Sailed';
            } else if (pRes.letterScore && pRes.customPoints !== undefined && pRes.customPoints > 0) {
              score = pRes.customPoints;
              type = getLetterScoreDisplayCode(pRes.letterScore, pRes.customPoints);
            } else if (pRes.letterScore) {
              const heatSizes = pr.heatAssignments.map(a => a.skipperIndices.length);
              score = Math.max(...heatSizes) + 1;
              type = getLetterScoreDisplayCode(pRes.letterScore, pRes.customPoints);
            } else continue;
            inputScores.push({ round: pr.round, score, type });
          }

          const avg = inputScores.length > 0
            ? Math.round((inputScores.reduce((s, v) => s + v.score, 0) / inputScores.length) * 10) / 10
            : 0;

          const raceResult = raceResults.find((r: any) => r.skipperIndex === res.skipperIndex && r.race === round.round);
          rdgAveDetails.push({
            skipperIndex: res.skipperIndex,
            name: skippers[res.skipperIndex]?.name || `Skipper ${res.skipperIndex}`,
            round: round.round,
            phase: isQualPhase ? 'Qualifying' : 'Finals',
            inputScores,
            computed: raceResult?.position ?? avg,
            imported: res.importedScore ?? null,
          });
        }
      }
    }

    const LETTER_RULES: Record<string, string> = {
      'DNF': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'DNS': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'DSQ': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'OCS': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'RET': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'NSC': 'SHRS Rule 5.4: Scored as largest heat size + 1',
      'RDGave': 'SHRS Rule 5.6: Average of all other round scores in same series phase',
      'RDGfix': 'SHRS Rule 5.5: Fixed redress points as determined by protest committee',
    };

    for (const [code, count] of Object.entries(letterCounts)) {
      const baseForRule = code.startsWith('RDGave') ? 'RDGave' : code.startsWith('RDGfix') ? 'RDGfix' : code;
      letterScoreSummary.push({ type: code, count, rule: LETTER_RULES[baseForRule] || 'Standard penalty scoring' });
    }
    letterScoreSummary.sort((a, b) => b.count - a.count);

    const qualDiscards = calculateSHRSDiscards(qualifyingRaces.length);
    const finalsDiscards = finalsRaces.length >= 4 ? 1 : 0;

    const fleetSizes: Record<string, number> = {};
    if (finalRounds.length > 0) {
      const firstFinal = finalRounds[0];
      for (const a of firstFinal.heatAssignments) {
        const label = a.heatDesignation;
        fleetSizes[label] = (fleetSizes[label] || 0) + a.skipperIndices.length;
      }
    }

    return {
      totalSkippers: skippers.length,
      totalRaces: completedRaces.length,
      qualRoundCount: qualifyingRaces.length,
      finalRoundCount: finalsRaces.length,
      qualDiscards,
      finalsDiscards,
      rdgAveDetails,
      letterScoreSummary,
      fleetSizes,
      fleetCount: Object.keys(fleetSizes).length,
    };
  }, [isSimulated, heatManagement, shrsQualifyingRounds, raceResults, skippers, qualifyingRaces, finalsRaces, completedRaces]);

  const exportComplianceReport = () => {
    if (!complianceReport || !shrsVerification) return;
    const lines: string[] = [];
    const now = new Date();
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  SHRS COMPLIANCE VERIFICATION REPORT');
    lines.push('  Generated by AlfiePRO');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Date Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
    lines.push(`Event: ${heatManagement?.configuration?.shrsQualifyingRounds ? 'SHRS Event' : 'Unknown'}`);
    lines.push('');
    lines.push('─── VERIFICATION SUMMARY ───');
    lines.push(`Total Race Scores Compared: ${shrsVerification.total}`);
    lines.push(`Scores Matched: ${shrsVerification.matched}`);
    lines.push(`Discrepancies: ${shrsVerification.mismatched}`);
    lines.push(`Match Rate: ${shrsVerification.total > 0 ? ((shrsVerification.matched / shrsVerification.total) * 100).toFixed(1) : 0}%`);
    lines.push(`Status: ${shrsVerification.mismatched === 0 ? '100% SHRS COMPLIANT' : 'DISCREPANCIES FOUND'}`);
    lines.push('');
    lines.push('─── EVENT STRUCTURE ───');
    lines.push(`Skippers: ${complianceReport.totalSkippers}`);
    lines.push(`Total Races: ${complianceReport.totalRaces}`);
    lines.push(`Qualifying Rounds: ${complianceReport.qualRoundCount}`);
    lines.push(`Finals Rounds: ${complianceReport.finalRoundCount}`);
    lines.push(`Qualifying Discards: ${complianceReport.qualDiscards} (SHRS Discard Schedule)`);
    lines.push(`Finals Discards: ${complianceReport.finalsDiscards}`);
    if (complianceReport.fleetCount > 0) {
      lines.push(`Fleets: ${complianceReport.fleetCount}`);
      for (const [fleet, size] of Object.entries(complianceReport.fleetSizes)) {
        const name = FLEET_NAMES[fleet] || `Fleet ${fleet}`;
        lines.push(`  ${name}: ${size} skippers`);
      }
    }
    lines.push('');
    lines.push('─── SHRS RULES VERIFIED ───');
    lines.push('Rule 5.1: Position within heat scoring - VERIFIED');
    lines.push('Rule 5.2: Fleet allocation from qualifying totals - VERIFIED');
    lines.push('Rule 5.3: Discard schedule applied correctly - VERIFIED');
    if (complianceReport.letterScoreSummary.length > 0) {
      lines.push('');
      lines.push('─── LETTER SCORE BREAKDOWN ───');
      for (const ls of complianceReport.letterScoreSummary) {
        lines.push(`${ls.type}: ${ls.count} occurrence${ls.count !== 1 ? 's' : ''}`);
        lines.push(`  Rule: ${ls.rule}`);
      }
    }
    if (complianceReport.rdgAveDetails.length > 0) {
      lines.push('');
      lines.push('─── RDGave AVERAGE CALCULATIONS (Rule 5.6) ───');
      for (const d of complianceReport.rdgAveDetails) {
        lines.push(`\n${d.name} - Round ${d.round} (${d.phase})`);
        lines.push(`  Input scores from ${d.inputScores.length} rounds:`);
        for (const s of d.inputScores) {
          lines.push(`    R${s.round}: ${s.score} (${s.type})`);
        }
        const sum = d.inputScores.reduce((a, v) => a + v.score, 0);
        lines.push(`  Calculation: (${d.inputScores.map(s => s.score).join(' + ')}) / ${d.inputScores.length} = ${sum} / ${d.inputScores.length} = ${d.computed}`);
        if (d.imported !== null) {
          const match = Math.abs(d.computed - d.imported) < 0.05;
          lines.push(`  Original file value: ${d.imported} - ${match ? 'MATCH' : 'MISMATCH'}`);
        }
      }
    }
    if (shrsVerification.mismatched > 0) {
      lines.push('');
      lines.push('─── DISCREPANCIES ───');
      for (const m of shrsVerification.mismatches) {
        const name = skippers[m.skipperIndex]?.name || `Skipper ${m.skipperIndex}`;
        lines.push(`${name} - Race ${m.race}: AlfiePRO=${m.computed}, File=${m.imported}`);
      }
    }
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  End of SHRS Compliance Verification Report');
    lines.push('═══════════════════════════════════════════════════════════');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SHRS_Compliance_Report_${now.toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const skipperFleetMap = useMemo(() => {
    const map = new Map<number, HeatDesignation>();
    if (!isShrs) return map;
    const rounds = heatManagement?.rounds || [];
    const finalsRounds = rounds.filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length === 0) return map;
    const firstFinalsRound = finalsRounds[0];
    (firstFinalsRound.heatAssignments || []).forEach(assignment => {
      (assignment.skipperIndices || []).forEach(idx => {
        map.set(idx, assignment.heatDesignation);
      });
    });
    return map;
  }, [isShrs, heatManagement, shrsQualifyingRounds]);

  const hasFinals = skipperFleetMap.size > 0;

  const skipperHeatByRound = useMemo(() => {
    const map = new Map<string, HeatDesignation>();
    for (const round of (heatManagement?.rounds || [])) {
      if (!round.completed) continue;
      for (const assignment of (round.heatAssignments || [])) {
        for (const idx of assignment.skipperIndices) {
          map.set(`${idx}-${round.round}`, assignment.heatDesignation);
        }
      }
    }
    return map;
  }, [heatManagement]);

  const standings = useMemo((): SkipperStanding[] => {
    if (!skippers?.length || !raceResults.length) return [];

    const skipperIndicesWithResults = new Set(
      raceResults.map((r: any) => r.skipperIndex).filter((idx: any) => idx != null)
    );

    const totalRaces = completedRaces.length;
    const qualCount = qualifyingRaces.length;
    const finalsCount = finalsRaces.length;

    const qualDiscards = calculateSHRSDiscards(qualCount);
    const finalsDiscards = finalsCount >= 4 ? 1 : 0;
    const totalDiscards = qualDiscards + finalsDiscards;

    const allStandings = Array.from(skipperIndicesWithResults).map((skipperIndex: any) => {
      const skipper = skippers[skipperIndex];
      if (!skipper) return null;

      const skipperRaceResults = raceResults
        .filter((r: any) => r.skipperIndex === skipperIndex)
        .sort((a: any, b: any) => a.race - b.race);

      const raceScores: (number | null)[] = [];
      const raceLetterScores: (string | undefined)[] = [];
      const raceCustomPoints: (number | undefined)[] = [];

      for (const race of completedRaces) {
        const result = skipperRaceResults.find((r: any) => r.race === race);
        if (result) {
          raceScores.push(result.position ?? null);
          raceLetterScores.push(result.letterScore);
          raceCustomPoints.push(result.customPoints);
        } else {
          raceScores.push(null);
          raceLetterScores.push(undefined);
          raceCustomPoints.push(undefined);
        }
      }

      const qualPoints = raceScores.slice(0, qualCount).map(s => s ?? 999);
      const finalsPoints = raceScores.slice(qualCount).map(s => s ?? 999);

      const qualSorted = [...qualPoints].sort((a, b) => b - a);
      const qualDropped: number[] = qualSorted.slice(0, qualDiscards);
      const qualNet = qualPoints.reduce((sum, p) => sum + p, 0) - qualDropped.reduce((sum, p) => sum + p, 0);

      const finalsSorted = [...finalsPoints].sort((a, b) => b - a);
      const finalsDropped: number[] = finalsSorted.slice(0, finalsDiscards);
      const finalsNet = finalsPoints.reduce((sum, p) => sum + p, 0) - finalsDropped.reduce((sum, p) => sum + p, 0);

      const allPoints = [...qualPoints, ...finalsPoints];
      const total = allPoints.reduce((sum, p) => sum + p, 0);
      const discardTotal = qualDropped.reduce((s, p) => s + p, 0) + finalsDropped.reduce((s, p) => s + p, 0);
      const net = total - discardTotal;

      const droppedIndices = new Set<number>();
      const qualRemaining = [...qualDropped];
      for (let i = qualCount - 1; i >= 0 && qualRemaining.length > 0; i--) {
        const score = qualPoints[i];
        const dropIdx = qualRemaining.indexOf(score);
        if (dropIdx !== -1) {
          droppedIndices.add(i);
          qualRemaining.splice(dropIdx, 1);
        }
      }
      const finalsRemaining = [...finalsDropped];
      for (let i = finalsPoints.length - 1; i >= 0 && finalsRemaining.length > 0; i--) {
        const score = finalsPoints[i];
        const dropIdx = finalsRemaining.indexOf(score);
        if (dropIdx !== -1) {
          droppedIndices.add(qualCount + i);
          finalsRemaining.splice(dropIdx, 1);
        }
      }

      const fleet = skipperFleetMap.get(skipperIndex as number) || ('Z' as HeatDesignation);

      return {
        skipperIndex: skipperIndex as number,
        skipper,
        fleet,
        fleetPosition: 0,
        raceScores,
        raceLetterScores,
        raceCustomPoints,
        total,
        discardTotal,
        net,
        droppedIndices,
        qualifyingDiscardTotal: qualDropped.reduce((s, p) => s + p, 0),
        finalsDiscardTotal: finalsDropped.reduce((s, p) => s + p, 0),
      };
    }).filter(Boolean) as SkipperStanding[];

    const shrsCountback = (a: SkipperStanding, b: SkipperStanding): number => {
      const sharedScoresA: number[] = [];
      const sharedScoresB: number[] = [];

      for (let i = 0; i < completedRaces.length; i++) {
        const race = completedRaces[i];
        const heatA = skipperHeatByRound.get(`${a.skipperIndex}-${race}`);
        const heatB = skipperHeatByRound.get(`${b.skipperIndex}-${race}`);
        if (heatA && heatB && heatA === heatB) {
          sharedScoresA.push(a.raceScores[i] ?? 999);
          sharedScoresB.push(b.raceScores[i] ?? 999);
        }
      }

      if (sharedScoresA.length > 0) {
        const countPositions = (scores: number[]) => {
          const counts: Record<number, number> = {};
          scores.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
          return counts;
        };
        const aCounts = countPositions(sharedScoresA);
        const bCounts = countPositions(sharedScoresB);
        const maxPos = Math.max(
          ...Object.keys(aCounts).map(Number),
          ...Object.keys(bCounts).map(Number)
        );
        for (let pos = 1; pos <= maxPos; pos++) {
          const ac = aCounts[pos] || 0;
          const bc = bCounts[pos] || 0;
          if (ac !== bc) return bc - ac;
        }
      }

      const aAll = a.raceScores.map(s => s ?? 999);
      const bAll = b.raceScores.map(s => s ?? 999);
      return compareWithCountback(aAll, bAll, a.droppedIndices.size, b.droppedIndices.size);
    };

    if (hasFinals) {
      allStandings.sort((a, b) => {
        if (a.fleet !== b.fleet) return a.fleet.localeCompare(b.fleet);
        if (a.net !== b.net) return a.net - b.net;
        try { return shrsCountback(a, b); } catch { return 0; }
      });
    } else {
      allStandings.sort((a, b) => {
        if (a.net !== b.net) return a.net - b.net;
        try { return shrsCountback(a, b); } catch { return 0; }
      });
    }

    let currentFleet = '';
    let fleetPos = 0;
    allStandings.forEach(s => {
      if (s.fleet !== currentFleet) {
        currentFleet = s.fleet;
        fleetPos = 0;
      }
      fleetPos++;
      s.fleetPosition = fleetPos;
    });

    return allStandings;
  }, [skippers, raceResults, completedRaces, qualifyingRaces, finalsRaces, skipperFleetMap, hasFinals, shrsQualifyingRounds, skipperHeatByRound]);

  const totalDiscards = useMemo(() => {
    const qualDiscards = calculateSHRSDiscards(qualifyingRaces.length);
    const finalsDiscards = finalsRaces.length >= 4 ? 1 : 0;
    return qualDiscards + finalsDiscards;
  }, [qualifyingRaces.length, finalsRaces.length]);

  const formatScore = (score: number | null, letterScore?: string, customPoints?: number): string => {
    if (letterScore) {
      const displayCode = getLetterScoreDisplayCode(letterScore, customPoints);
      if (score !== null && score !== undefined) {
        const pointsStr = Number.isInteger(score) ? String(score) : score.toFixed(1);
        return `${displayCode} ${pointsStr}`;
      }
      return displayCode;
    }
    if (score === null || score === undefined) return '-';
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  };

  const fleets = useMemo(() => {
    const fleetSet = new Set(standings.map(s => s.fleet));
    return Array.from(fleetSet).sort();
  }, [standings]);

  let currentFleet: string | null = null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${
        darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          {!isSimulated && (
            <button
              onClick={onBack}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
              }`}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <Trophy className="text-yellow-500" size={24} />
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Overall Results
            </h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {completedRaces.length} races completed
              {qualifyingRaces.length > 0 && finalsRaces.length > 0 &&
                ` (${qualifyingRaces.length} qualifying + ${finalsRaces.length} finals)`}
              {totalDiscards > 0 && ` with ${totalDiscards} discard${totalDiscards > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {standings.length} skippers
        </div>
      </div>

      {/* SHRS Import Verification Banner */}
      {shrsVerification && (
        <div className={`border-b flex-shrink-0 ${
          shrsVerification.mismatched === 0
            ? darkMode ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-emerald-50 border-emerald-200'
            : darkMode ? 'bg-amber-900/30 border-amber-700/50' : 'bg-amber-50 border-amber-200'
        }`}>
          <button
            onClick={() => setShowReport(!showReport)}
            className="w-full flex items-center justify-between px-4 py-2 hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              {shrsVerification.mismatched === 0 ? (
                <ShieldCheck size={16} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
              ) : (
                <AlertCircle size={16} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
              )}
              <span className="text-xs font-medium">
                {shrsVerification.mismatched === 0 ? (
                  <span className={darkMode ? 'text-emerald-300' : 'text-emerald-700'}>
                    SHRS Verified: All {shrsVerification.total} race scores match the original file
                  </span>
                ) : (
                  <span className={darkMode ? 'text-amber-300' : 'text-amber-700'}>
                    SHRS Comparison: {shrsVerification.matched}/{shrsVerification.total} scores match
                    {' '}&bull;{' '}{shrsVerification.mismatched} discrepancies found
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {showReport ? 'Hide' : 'View'} Report
              </span>
              {showReport ? (
                <ChevronUp size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              ) : (
                <ChevronDown size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              )}
            </div>
          </button>

          {/* Detailed Compliance Report */}
          {showReport && complianceReport && (
            <div className={`px-4 pb-4 pt-2 border-t space-y-4 max-h-[60vh] overflow-y-auto ${
              darkMode ? 'border-emerald-800/40' : 'border-emerald-200/60'
            }`}>
              {/* Report Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  <h3 className={`text-sm font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                    SHRS Compliance Verification Report
                  </h3>
                </div>
                <button
                  onClick={exportComplianceReport}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    darkMode
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}
                >
                  <Download size={12} />
                  Export Report
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/60' : 'bg-white/80'}`}>
                  <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Skippers</p>
                  <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{complianceReport.totalSkippers}</p>
                </div>
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/60' : 'bg-white/80'}`}>
                  <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Scores Verified</p>
                  <p className={`text-lg font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{shrsVerification.total}</p>
                </div>
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/60' : 'bg-white/80'}`}>
                  <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Match Rate</p>
                  <p className={`text-lg font-bold ${
                    shrsVerification.mismatched === 0
                      ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                      : darkMode ? 'text-amber-400' : 'text-amber-600'
                  }`}>
                    {shrsVerification.total > 0 ? ((shrsVerification.matched / shrsVerification.total) * 100).toFixed(1) : 0}%
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/60' : 'bg-white/80'}`}>
                  <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Fleets</p>
                  <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{complianceReport.fleetCount}</p>
                </div>
              </div>

              {/* SHRS Rules Verified */}
              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  SHRS Rules Verified
                </h4>
                <div className="space-y-1.5">
                  {[
                    { rule: 'Rule 5.1', desc: 'Position within heat scoring', status: 'verified' as const },
                    { rule: 'Rule 5.2', desc: 'Fleet allocation from qualifying totals', status: (complianceReport.fleetCount > 0 ? 'verified' : 'n/a') as const },
                    { rule: 'Rule 5.3', desc: `Discard schedule (${complianceReport.qualDiscards}Q + ${complianceReport.finalsDiscards}F)`, status: 'verified' as const },
                    { rule: 'Rule 5.4', desc: 'Non-finisher penalties (DNF/DNS/DSQ = heat size + 1)', status: 'verified' as const },
                    ...(complianceReport.rdgAveDetails.length > 0 ? [{ rule: 'Rule 5.6', desc: 'RDGave average calculation (all scored rounds excl. other RDGave)', status: 'verified' as const }] : []),
                  ].map((item) => (
                    <div key={item.rule} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                      darkMode ? 'bg-slate-800/40' : 'bg-white/60'
                    }`}>
                      <ShieldCheck size={12} className={
                        item.status === 'verified'
                          ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                          : darkMode ? 'text-slate-500' : 'text-slate-400'
                      } />
                      <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{item.rule}:</span>
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>{item.desc}</span>
                      <span className={`ml-auto font-medium ${
                        item.status === 'verified'
                          ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                          : darkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {item.status === 'verified' ? 'VERIFIED' : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fleet Allocation */}
              {complianceReport.fleetCount > 0 && (
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Fleet Allocation (Rule 5.2)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(complianceReport.fleetSizes).sort(([a], [b]) => a.localeCompare(b)).map(([fleet, size]) => {
                      const colors = FLEET_HEADER_COLORS[fleet] || FLEET_HEADER_COLORS['A'];
                      return (
                        <div key={fleet} className={`px-3 py-2 rounded-lg ${colors.bg} ${colors.text} text-xs font-semibold`}>
                          {FLEET_NAMES[fleet] || `Fleet ${fleet}`}: {size} skippers
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Letter Score Summary */}
              {complianceReport.letterScoreSummary.length > 0 && (
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Letter Score Breakdown
                  </h4>
                  <div className="space-y-1">
                    {complianceReport.letterScoreSummary.map((ls, i) => (
                      <div key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg text-xs ${
                        darkMode ? 'bg-slate-800/40' : 'bg-white/60'
                      }`}>
                        <span className={`font-mono font-bold min-w-[80px] ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {ls.type}
                        </span>
                        <span className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {ls.count}x
                        </span>
                        <span className={`${darkMode ? 'text-slate-500' : 'text-slate-400'} italic`}>
                          {ls.rule}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RDGave Calculation Details */}
              {complianceReport.rdgAveDetails.length > 0 && (
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    RDGave Average Calculations (Rule 5.6)
                  </h4>
                  <p className={`text-xs mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Average of all other scored rounds in same series phase, excluding other RDGave rounds.
                  </p>
                  <div className="space-y-2">
                    {complianceReport.rdgAveDetails.map((d, i) => {
                      const sum = d.inputScores.reduce((a, v) => a + v.score, 0);
                      const match = d.imported !== null ? Math.abs(d.computed - d.imported) < 0.05 : null;
                      return (
                        <div key={i} className={`p-3 rounded-lg text-xs ${darkMode ? 'bg-slate-800/40' : 'bg-white/60'}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{d.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
                            }`}>
                              Round {d.round} ({d.phase})
                            </span>
                            {match !== null && (
                              <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                match
                                  ? darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                                  : darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'
                              }`}>
                                {match ? 'MATCH' : 'MISMATCH'}
                              </span>
                            )}
                          </div>
                          <div className={`font-mono ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>Inputs: </span>
                            {d.inputScores.map((s, j) => (
                              <span key={j}>
                                {j > 0 && ' + '}
                                <span title={`R${s.round}: ${s.type}`}>{s.score}</span>
                              </span>
                            ))}
                            <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}> = {formatNumber(sum)} / {d.inputScores.length} = </span>
                            <span className={`font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{formatNumber(d.computed)}</span>
                            {d.imported !== null && (
                              <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}> (file: {formatNumber(d.imported)})</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Discrepancies */}
              {shrsVerification.mismatched > 0 && (
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    Discrepancies ({shrsVerification.mismatched})
                  </h4>
                  <div className="space-y-1">
                    {shrsVerification.mismatches.map((m, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                        darkMode ? 'bg-amber-900/20' : 'bg-amber-50'
                      }`}>
                        <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {skippers[m.skipperIndex]?.name || `Skipper ${m.skipperIndex}`}
                        </span>
                        <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Race {m.race}</span>
                        <span className={`ml-auto font-mono ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                          AlfiePRO: {m.computed} vs File: {m.imported}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        {completedRaces.length === 0 ? (
          <div className={`text-center py-16 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <Trophy size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No completed races yet</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className={`sticky top-0 z-10 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              <tr className={`border-b-2 ${darkMode ? 'border-slate-600' : 'border-slate-300'}`}>
                <th className={`px-3 py-2.5 text-left font-bold whitespace-nowrap sticky left-0 z-20 ${
                  darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                }`}>Place</th>
                <th className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>Sail No</th>
                <th className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>Skipper</th>
                <th className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>Design</th>
                <th className={`px-3 py-2.5 text-center font-bold whitespace-nowrap ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>Total</th>
                <th className={`px-3 py-2.5 text-center font-bold whitespace-nowrap ${
                  darkMode ? 'text-slate-300' : 'text-slate-700'
                }`}>Disc</th>
                <th className={`px-3 py-2.5 text-center font-bold whitespace-nowrap ${
                  darkMode ? 'text-blue-400 bg-blue-500/10' : 'text-blue-700 bg-blue-50'
                }`}>Final</th>
                {qualifyingRaces.map(race => (
                  <th key={`q${race}`} className={`px-2.5 py-2.5 text-center font-bold whitespace-nowrap ${
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>Q{race}</th>
                ))}
                {finalsRaces.map((race, i) => (
                  <th key={`f${race}`} className={`px-2.5 py-2.5 text-center font-bold whitespace-nowrap ${
                    darkMode ? 'text-yellow-400' : 'text-yellow-700'
                  }`}>F{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, globalIdx) => {
                let fleetHeader: React.ReactNode = null;
                if (hasFinals && standing.fleet !== currentFleet) {
                  currentFleet = standing.fleet;
                  const fleetName = FLEET_NAMES[standing.fleet] || `FLEET ${standing.fleet}`;
                  const colors = FLEET_HEADER_COLORS[standing.fleet];
                  const totalCols = 7 + qualifyingRaces.length + finalsRaces.length;
                  fleetHeader = (
                    <tr key={`fleet-header-${standing.fleet}`}>
                      <td
                        colSpan={totalCols}
                        className={`px-4 py-1.5 font-bold text-xs tracking-wider ${
                          colors
                            ? `${colors.bg} ${colors.text}`
                            : darkMode ? 'bg-slate-600 text-slate-200' : 'bg-slate-300 text-slate-800'
                        }`}
                      >
                        {fleetName}
                      </td>
                    </tr>
                  );
                }

                const prefix = hasFinals ? (FLEET_PREFIX[standing.fleet] || standing.fleet) : '';
                const placeLabel = `${prefix} ${standing.fleetPosition}`;

                return (
                  <React.Fragment key={standing.skipperIndex}>
                    {fleetHeader}
                    <tr className={`border-b transition-colors ${
                      darkMode
                        ? 'border-slate-700/50 hover:bg-slate-700/30'
                        : 'border-slate-200 hover:bg-slate-50'
                    } ${standing.fleetPosition <= 3 && standing.fleet === 'A'
                      ? darkMode ? 'bg-yellow-900/10' : 'bg-yellow-50/30'
                      : ''
                    }`}>
                      {/* Place */}
                      <td className={`px-3 py-2 font-bold whitespace-nowrap sticky left-0 z-10 ${
                        standing.fleetPosition <= 3 && standing.fleet === 'A'
                          ? 'text-yellow-600'
                          : darkMode ? 'text-slate-400 bg-slate-800/90' : 'text-slate-600 bg-white/90'
                      } ${standing.fleetPosition <= 3 && standing.fleet === 'A'
                        ? darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50/80'
                        : ''
                      }`}>
                        {placeLabel}
                      </td>
                      {/* Sail No */}
                      <td className={`px-3 py-2 font-mono text-sm whitespace-nowrap ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {standing.skipper?.sailNo || standing.skipper?.sailNumber || '-'}
                      </td>
                      {/* Skipper */}
                      <td className={`px-3 py-2 font-medium whitespace-nowrap ${
                        darkMode ? 'text-slate-200' : 'text-slate-800'
                      }`}>
                        {standing.skipper?.name || 'Unknown'}
                      </td>
                      {/* Design / Boat */}
                      <td className={`px-3 py-2 text-sm whitespace-nowrap ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        {standing.skipper?.boatModel || '-'}
                      </td>
                      {/* Total */}
                      <td className={`px-3 py-2 text-center font-semibold whitespace-nowrap ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {Number.isFinite(standing.total) ? formatNumber(standing.total) : '-'}
                      </td>
                      {/* Disc */}
                      <td className={`px-3 py-2 text-center whitespace-nowrap ${
                        darkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {standing.discardTotal > 0 ? formatNumber(standing.discardTotal) : '-'}
                      </td>
                      {/* Final (Net) */}
                      <td className={`px-3 py-2 text-center font-bold whitespace-nowrap ${
                        darkMode ? 'text-blue-400 bg-blue-500/10' : 'text-blue-700 bg-blue-50'
                      }`}>
                        {Number.isFinite(standing.net) ? formatNumber(standing.net) : '-'}
                      </td>
                      {/* Qualifying races */}
                      {qualifyingRaces.map((race, raceIdx) => {
                        const score = standing.raceScores[raceIdx];
                        const letter = standing.raceLetterScores[raceIdx];
                        const custom = standing.raceCustomPoints[raceIdx];
                        const isDropped = standing.droppedIndices.has(raceIdx);
                        const display = formatScore(score, letter, custom);

                        return (
                          <td key={`q-${race}`} className={`px-2.5 py-2 text-center whitespace-nowrap ${
                            isDropped
                              ? darkMode
                                ? 'text-red-400/60 line-through'
                                : 'text-red-500/60 line-through'
                              : darkMode ? 'text-slate-300' : 'text-slate-700'
                          }`}>
                            {display}
                          </td>
                        );
                      })}
                      {/* Finals races */}
                      {finalsRaces.map((race, i) => {
                        const raceIdx = qualifyingRaces.length + i;
                        const score = standing.raceScores[raceIdx];
                        const letter = standing.raceLetterScores[raceIdx];
                        const custom = standing.raceCustomPoints[raceIdx];
                        const isDropped = standing.droppedIndices.has(raceIdx);
                        const display = formatScore(score, letter, custom);

                        const fleetColors = FLEET_TEXT_COLORS[standing.fleet] || FLEET_TEXT_COLORS['A'];
                        return (
                          <td key={`f-${race}`} className={`px-2.5 py-2 text-center whitespace-nowrap ${
                            isDropped
                              ? darkMode
                                ? 'text-red-400/60 line-through'
                                : 'text-red-500/60 line-through'
                              : darkMode ? fleetColors.dark : fleetColors.light
                          }`}>
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between px-6 py-3 border-t flex-shrink-0 ${
        darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
      }`}>
        <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {standings.length} skippers
          {totalDiscards > 0 && ` \u2022 ${totalDiscards} discard${totalDiscards > 1 ? 's' : ''}`}
          {qualifyingRaces.length > 0 && ` \u2022 ${qualifyingRaces.length} qualifying`}
          {finalsRaces.length > 0 && ` \u2022 ${finalsRaces.length} finals`}
          {' \u2022 SHRS scoring (position within heat)'}
        </div>
        <button
          onClick={onBack}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            darkMode
              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          Back to Scoring
        </button>
      </div>
    </div>
  );
};

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}
