import React, { useMemo } from 'react';
import { X, Trophy } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { compareWithCountback } from '../utils/scratchCalculations';

interface HeatOverallResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  heatManagement: HeatManagement;
  dropRules: number[];
  darkMode: boolean;
}

const FLEET_NAMES: Record<string, string> = {
  'A': 'Gold Fleet',
  'B': 'Silver Fleet',
  'C': 'Bronze Fleet',
  'D': 'Copper Fleet',
  'E': 'Fleet E',
  'F': 'Fleet F',
};

const FLEET_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'A': { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500' },
  'B': { bg: 'bg-slate-400/10', text: 'text-slate-400', border: 'border-slate-400' },
  'C': { bg: 'bg-amber-700/10', text: 'text-amber-600', border: 'border-amber-600' },
  'D': { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500' },
  'E': { bg: 'bg-pink-500/10', text: 'text-pink-500', border: 'border-pink-500' },
  'F': { bg: 'bg-cyan-500/10', text: 'text-cyan-500', border: 'border-cyan-500' },
};

export const HeatOverallResultsModal: React.FC<HeatOverallResultsModalProps> = ({
  isOpen,
  onClose,
  skippers,
  heatManagement,
  dropRules,
  darkMode
}) => {
  const isShrs = heatManagement.configuration.scoringSystem === 'shrs';
  const shrsQualifyingRounds = heatManagement.configuration.shrsQualifyingRounds || 0;

  const raceResults = useMemo(() => {
    return convertHeatResultsToRaceResults(heatManagement, skippers);
  }, [heatManagement, skippers]);

  const completedRaces = useMemo(() => {
    const races = new Set(raceResults.map(r => r.race));
    return Array.from(races).sort((a, b) => a - b);
  }, [raceResults]);

  const skipperFleetMap = useMemo(() => {
    if (!isShrs) return new Map<number, HeatDesignation>();
    const map = new Map<number, HeatDesignation>();
    const finalsRounds = heatManagement.rounds
      .filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length === 0) return map;
    const firstFinalsRound = finalsRounds[0];
    firstFinalsRound.heatAssignments.forEach(assignment => {
      assignment.skipperIndices.forEach(idx => {
        map.set(idx, assignment.heatDesignation);
      });
    });
    return map;
  }, [isShrs, heatManagement, shrsQualifyingRounds]);

  const hasFinals = isShrs && skipperFleetMap.size > 0;

  const standings = useMemo(() => {
    const baseStandings = skippers.map((skipper, skipperIndex) => {
      const skipperRaceResults = raceResults
        .filter(r => r.skipperIndex === skipperIndex)
        .sort((a, b) => a.race - b.race);

      const points = skipperRaceResults.map(r => r.position || 999);
      const total = points.reduce((sum, p) => sum + p, 0);

      const sortedPoints = [...points].sort((a, b) => a - b);
      let drops = 0;
      for (const rule of dropRules) {
        if (points.length >= rule) {
          drops++;
        }
      }

      let net = total;
      const droppedScores: number[] = [];
      if (drops > 0) {
        const pointsToDrop = sortedPoints.slice(-drops);
        droppedScores.push(...pointsToDrop);
        net = total - pointsToDrop.reduce((sum, p) => sum + p, 0);
      }

      const droppedRaceIndices = new Set<number>();
      if (drops > 0) {
        const indexedScores = points.map((score, idx) => ({ score, idx }));
        indexedScores.sort((a, b) => b.score - a.score);
        for (let i = 0; i < drops; i++) {
          droppedRaceIndices.add(indexedScores[i].idx);
        }
      }

      return {
        skipperIndex,
        skipper,
        raceResults: skipperRaceResults,
        points,
        total,
        drops,
        droppedScores,
        droppedRaceIndices,
        net,
        fleet: skipperFleetMap.get(skipperIndex) || ('Z' as HeatDesignation),
      };
    });

    if (hasFinals) {
      return baseStandings.sort((a, b) => {
        if (a.fleet !== b.fleet) {
          return a.fleet.localeCompare(b.fleet);
        }
        if (a.net !== b.net) {
          return a.net - b.net;
        }
        return compareWithCountback(a.points, b.points, a.drops, b.drops);
      });
    }

    return baseStandings.sort((a, b) => {
      if (a.net !== b.net) {
        return a.net - b.net;
      }
      return compareWithCountback(a.points, b.points, a.drops, b.drops);
    });
  }, [skippers, raceResults, dropRules, skipperFleetMap, hasFinals]);

  const getRaceLabel = (raceNum: number): string => {
    if (!isShrs) return `R${raceNum}`;
    if (raceNum <= shrsQualifyingRounds) return `Q${raceNum}`;
    return `F${raceNum - shrsQualifyingRounds}`;
  };

  const isFinalsRace = (raceNum: number): boolean => {
    return isShrs && raceNum > shrsQualifyingRounds;
  };

  if (!isOpen) return null;

  let currentFleet: HeatDesignation | null = null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-7xl max-h-[90vh] rounded-xl shadow-xl overflow-hidden flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Trophy className="text-yellow-500" size={28} />
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Overall Results
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {completedRaces.length} race{completedRaces.length !== 1 ? 's' : ''} completed
                {isShrs && ` (${Math.min(completedRaces.length, shrsQualifyingRounds)} qualifying + ${Math.max(0, completedRaces.length - shrsQualifyingRounds)} finals)`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {completedRaces.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <Trophy size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No completed races yet</p>
              <p className="text-sm mt-2">Start scoring heats to see overall results</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b-2 ${darkMode ? 'border-slate-700' : 'border-slate-300'}`}>
                    <th className={`px-4 py-3 text-left text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Pos
                    </th>
                    {hasFinals && (
                      <th className={`px-3 py-3 text-center text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Fleet
                      </th>
                    )}
                    <th className={`px-4 py-3 text-left text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Skipper
                    </th>
                    <th className={`px-4 py-3 text-center text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Sail No
                    </th>
                    <th className={`px-4 py-3 text-left text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Boat
                    </th>
                    {completedRaces.map(race => (
                      <th
                        key={race}
                        className={`px-3 py-3 text-center text-sm font-bold ${
                          isFinalsRace(race)
                            ? darkMode ? 'text-yellow-400' : 'text-yellow-700'
                            : darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        {getRaceLabel(race)}
                      </th>
                    ))}
                    <th className={`px-4 py-3 text-center text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Total
                    </th>
                    <th className={`px-4 py-3 text-center text-sm font-bold bg-blue-500/10 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                      NET
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing, index) => {
                    const isTopThree = !hasFinals && index < 3;
                    const medal = !hasFinals && (index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null);

                    let fleetSeparator: React.ReactNode = null;
                    if (hasFinals && standing.fleet !== currentFleet) {
                      currentFleet = standing.fleet;
                      const fleetName = FLEET_NAMES[standing.fleet] || `Fleet ${standing.fleet}`;
                      const fleetColor = FLEET_COLORS[standing.fleet];
                      const totalCols = 5 + completedRaces.length + 2 + (hasFinals ? 1 : 0);
                      fleetSeparator = (
                        <tr key={`fleet-${standing.fleet}`}>
                          <td
                            colSpan={totalCols}
                            className={`px-4 py-2 font-bold text-sm border-t-2 ${
                              fleetColor
                                ? `${fleetColor.border} ${fleetColor.bg} ${fleetColor.text}`
                                : darkMode ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-100 text-slate-700'
                            }`}
                          >
                            {fleetName}
                          </td>
                        </tr>
                      );
                    }

                    const isFleetTopThree = hasFinals && (() => {
                      const fleetStandings = standings.filter(s => s.fleet === standing.fleet);
                      const posInFleet = fleetStandings.indexOf(standing);
                      return posInFleet < 3;
                    })();

                    const fleetMedal = hasFinals && (() => {
                      const fleetStandings = standings.filter(s => s.fleet === standing.fleet);
                      const posInFleet = fleetStandings.indexOf(standing);
                      if (standing.fleet === 'A') {
                        return posInFleet === 0 ? '🥇' : posInFleet === 1 ? '🥈' : posInFleet === 2 ? '🥉' : null;
                      }
                      return null;
                    })();

                    return (
                      <React.Fragment key={standing.skipperIndex}>
                        {fleetSeparator}
                        <tr
                          className={`
                            border-b transition-colors
                            ${darkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-slate-200 hover:bg-slate-50'}
                            ${(isTopThree || isFleetTopThree) ? (darkMode ? 'bg-yellow-900/10' : 'bg-yellow-50/50') : ''}
                          `}
                        >
                          <td className={`px-4 py-3 text-center font-bold ${
                            (isTopThree || isFleetTopThree)
                              ? 'text-yellow-600'
                              : darkMode ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            {(medal || fleetMedal) ? (
                              <span className="flex items-center justify-center gap-1">
                                {medal || fleetMedal}
                                <span>{index + 1}</span>
                              </span>
                            ) : (
                              index + 1
                            )}
                          </td>
                          {hasFinals && (
                            <td className={`px-3 py-3 text-center text-xs font-semibold ${
                              FLEET_COLORS[standing.fleet]?.text || (darkMode ? 'text-slate-400' : 'text-slate-600')
                            }`}>
                              {standing.fleet === 'A' ? 'G' : standing.fleet === 'B' ? 'S' : standing.fleet === 'C' ? 'B' : standing.fleet}
                            </td>
                          )}
                          <td className={`px-4 py-3 font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {standing.skipper.name}
                          </td>
                          <td className={`px-4 py-3 text-center font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {standing.skipper.sailNo}
                          </td>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {standing.skipper.boatModel}
                          </td>
                          {completedRaces.map((race, raceIdx) => {
                            const result = standing.raceResults.find(r => r.race === race);
                            const position = result?.position || '-';
                            const isDropped = standing.droppedRaceIndices.has(raceIdx);

                            return (
                              <td
                                key={race}
                                className={`px-3 py-3 text-center font-medium ${
                                  isDropped
                                    ? darkMode ? 'text-red-400 line-through opacity-50' : 'text-red-600 line-through opacity-50'
                                    : darkMode ? 'text-slate-300' : 'text-slate-700'
                                }`}
                              >
                                {position}
                              </td>
                            );
                          })}
                          <td className={`px-4 py-3 text-center font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {standing.total}
                          </td>
                          <td className={`px-4 py-3 text-center font-bold bg-blue-500/10 ${
                            (isTopThree || isFleetTopThree)
                              ? 'text-yellow-600'
                              : darkMode ? 'text-blue-400' : 'text-blue-700'
                          }`}>
                            {standing.net}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`
          flex justify-between items-center p-6 border-t
          ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}
        `}>
          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            {standings.length} skippers • Drop rules: {dropRules.join(', ')} races
            {isShrs && ' • SHRS scoring (position within heat)'}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
