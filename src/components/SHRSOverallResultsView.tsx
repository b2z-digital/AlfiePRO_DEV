import React, { useMemo } from 'react';
import { Trophy, ArrowLeft } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation, HeatResult } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { compareWithCountback } from '../utils/scratchCalculations';
import { calculateSHRSDiscards } from '../utils/shrsHeatSystem';

interface SHRSOverallResultsViewProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  darkMode: boolean;
  onBack: () => void;
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

    if (hasFinals) {
      allStandings.sort((a, b) => {
        if (a.fleet !== b.fleet) return a.fleet.localeCompare(b.fleet);
        if (a.net !== b.net) return a.net - b.net;
        try {
          const aPoints = a.raceScores.map(s => s ?? 999);
          const bPoints = b.raceScores.map(s => s ?? 999);
          return compareWithCountback(aPoints, bPoints, a.droppedIndices.size, b.droppedIndices.size);
        } catch { return 0; }
      });
    } else {
      allStandings.sort((a, b) => {
        if (a.net !== b.net) return a.net - b.net;
        try {
          const aPoints = a.raceScores.map(s => s ?? 999);
          const bPoints = b.raceScores.map(s => s ?? 999);
          return compareWithCountback(aPoints, bPoints, a.droppedIndices.size, b.droppedIndices.size);
        } catch { return 0; }
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
  }, [skippers, raceResults, completedRaces, qualifyingRaces, finalsRaces, skipperFleetMap, hasFinals, shrsQualifyingRounds]);

  const totalDiscards = useMemo(() => {
    const qualDiscards = calculateSHRSDiscards(qualifyingRaces.length);
    const finalsDiscards = finalsRaces.length >= 4 ? 1 : 0;
    return qualDiscards + finalsDiscards;
  }, [qualifyingRaces.length, finalsRaces.length]);

  const formatScore = (score: number | null, letterScore?: string, customPoints?: number): string => {
    if (letterScore) {
      if (letterScore === 'RDG' && customPoints !== undefined) {
        return `RGP ${customPoints}`;
      }
      if (letterScore === 'SCP' && customPoints !== undefined) {
        return `SCP ${customPoints}`;
      }
      return letterScore;
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
          <button
            onClick={onBack}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <ArrowLeft size={20} />
          </button>
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
                              : letter
                                ? darkMode ? 'text-amber-400' : 'text-amber-600'
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

                        return (
                          <td key={`f-${race}`} className={`px-2.5 py-2 text-center whitespace-nowrap ${
                            isDropped
                              ? darkMode
                                ? 'text-red-400/60 line-through'
                                : 'text-red-500/60 line-through'
                              : letter
                                ? darkMode ? 'text-amber-400' : 'text-amber-600'
                                : darkMode ? 'text-yellow-300' : 'text-yellow-700'
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
