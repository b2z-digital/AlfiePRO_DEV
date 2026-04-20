import React, { useMemo } from 'react';
import { X, Trophy, TriangleAlert as AlertTriangle } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement, HeatDesignation } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { compareWithCountback } from '../utils/scratchCalculations';
import { breakTie } from '../utils/hmsHeatSystem';

interface HeatOverallResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  heatManagement: HeatManagement;
  dropRules: number[];
  darkMode: boolean;
  externalRaceResults?: any[];
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

class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; darkMode: boolean; onClose: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; darkMode: boolean; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('HeatOverallResultsModal error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { darkMode, onClose } = this.props;
      return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-xl shadow-xl p-8 text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
            <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
            <h2 className={`text-xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Unable to Display Results
            </h2>
            <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              There was an issue calculating the overall results. This can happen when race data is incomplete.
            </p>
            {this.state.error && (
              <p className={`text-xs font-mono mb-4 p-2 rounded ${darkMode ? 'bg-slate-900 text-red-400' : 'bg-slate-100 text-red-600'}`}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const HeatOverallResultsModal: React.FC<HeatOverallResultsModalProps> = (props) => {
  if (!props.isOpen) return null;

  return (
    <ModalErrorBoundary darkMode={props.darkMode} onClose={props.onClose}>
      <HeatOverallResultsContent {...props} />
    </ModalErrorBoundary>
  );
};

const HeatOverallResultsContent: React.FC<HeatOverallResultsModalProps> = ({
  onClose,
  skippers,
  heatManagement,
  dropRules,
  darkMode,
  externalRaceResults
}) => {
  const isShrs = heatManagement?.configuration?.scoringSystem === 'shrs';
  const shrsQualifyingRounds = heatManagement?.configuration?.shrsQualifyingRounds || 0;

  const raceResults = useMemo(() => {
    try {
      if (externalRaceResults && externalRaceResults.length > 0) return externalRaceResults;
      if (!heatManagement?.rounds?.length) return [];
      return convertHeatResultsToRaceResults(heatManagement, skippers);
    } catch (e) {
      console.error('Error converting race results:', e);
      return [];
    }
  }, [heatManagement, skippers, externalRaceResults]);

  const completedRaces = useMemo(() => {
    const races = new Set(raceResults.map((r: any) => r.race));
    return Array.from(races).sort((a: any, b: any) => a - b) as number[];
  }, [raceResults]);

  const skipperFleetMap = useMemo(() => {
    if (!isShrs) return new Map<number, HeatDesignation>();
    const map = new Map<number, HeatDesignation>();
    const rounds = heatManagement?.rounds || [];
    const finalsRounds = rounds
      .filter(r => r.round > shrsQualifyingRounds && r.completed);
    if (finalsRounds.length === 0) return map;
    const firstFinalsRound = finalsRounds[0];
    (firstFinalsRound.heatAssignments || []).forEach(assignment => {
      (assignment.skipperIndices || []).forEach(idx => {
        map.set(idx, assignment.heatDesignation);
      });
    });
    return map;
  }, [isShrs, heatManagement, shrsQualifyingRounds]);

  const hasFinals = isShrs && skipperFleetMap.size > 0;

  const standings = useMemo(() => {
    try {
      if (!skippers || skippers.length === 0 || raceResults.length === 0) return [];

      const skipperIndicesWithResults = new Set(
        raceResults.map((r: any) => r.skipperIndex).filter((idx: any) => idx != null)
      );

      const allStandings = Array.from(skipperIndicesWithResults).map((skipperIndex: any) => {
        const skipper = skippers[skipperIndex];
        if (!skipper) return null;

        const skipperRaceResults = raceResults
          .filter((r: any) => r.skipperIndex === skipperIndex)
          .sort((a: any, b: any) => a.race - b.race);

        const points = skipperRaceResults.map((r: any) => r.position || 999);
        const total = points.reduce((sum: number, p: number) => sum + p, 0);

        const sortedPoints = [...points].sort((a, b) => a - b);
        let drops = 0;
        if (Array.isArray(dropRules)) {
          for (const rule of dropRules) {
            if (points.length >= rule) {
              drops++;
            }
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
          const indexedScores = points.map((score: number, idx: number) => ({ score, idx }));
          indexedScores.sort((a: any, b: any) => b.score - a.score);
          for (let i = 0; i < drops && i < indexedScores.length; i++) {
            droppedRaceIndices.add(indexedScores[i].idx);
          }
        }

        return {
          skipperIndex: skipperIndex as number,
          skipper,
          raceResults: skipperRaceResults,
          points,
          total,
          drops,
          droppedScores,
          droppedRaceIndices,
          net,
          fleet: skipperFleetMap.get(skipperIndex as number) || ('Z' as HeatDesignation),
        };
      }).filter(Boolean) as any[];

      const isHms = !isShrs;
      const numberOfHeats = heatManagement?.configuration?.numberOfHeats || 2;
      const useHMSTieBreak = isHms && numberOfHeats > 1;

      const hmsBreakTieCompare = (a: any, b: any): number => {
        try {
          const allRaceResults = raceResults.map((r: any) => ({
            ...r,
            race: r.race,
            skipperIndex: r.skipperIndex,
            position: r.position || null,
          }));
          const tieResult = breakTie(
            [a.skipperIndex, b.skipperIndex],
            allRaceResults,
            new Map(),
            useHMSTieBreak
          );
          return tieResult.indexOf(a.skipperIndex) - tieResult.indexOf(b.skipperIndex);
        } catch {
          return 0;
        }
      };

      if (hasFinals) {
        return allStandings.sort((a: any, b: any) => {
          if (a.fleet !== b.fleet) return a.fleet.localeCompare(b.fleet);
          if (a.net !== b.net) return a.net - b.net;
          try {
            return compareWithCountback(a.points, b.points, a.drops, b.drops);
          } catch {
            return 0;
          }
        });
      }

      return allStandings.sort((a: any, b: any) => {
        if (a.net !== b.net) return a.net - b.net;
        if (isHms) return hmsBreakTieCompare(a, b);
        try {
          return compareWithCountback(a.points, b.points, a.drops, b.drops);
        } catch {
          return 0;
        }
      });
    } catch (e) {
      console.error('Error computing standings:', e);
      return [];
    }
  }, [skippers, raceResults, dropRules, skipperFleetMap, hasFinals, isShrs, heatManagement]);

  const getRaceLabel = (raceNum: number): string => {
    if (!isShrs) return `R${raceNum}`;
    if (raceNum <= shrsQualifyingRounds) return `Q${raceNum}`;
    return `F${raceNum - shrsQualifyingRounds}`;
  };

  const isFinalsRace = (raceNum: number): boolean => {
    return isShrs && raceNum > shrsQualifyingRounds;
  };

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
                  {standings.map((standing: any, index: number) => {
                    if (!standing?.skipper) return null;

                    const isTopThree = !hasFinals && index < 3;
                    const medal = !hasFinals && (index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : null);

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
                      const fleetStandings = standings.filter((s: any) => s.fleet === standing.fleet);
                      const posInFleet = fleetStandings.indexOf(standing);
                      return posInFleet < 3;
                    })();

                    const fleetMedal = hasFinals && (() => {
                      const fleetStandings = standings.filter((s: any) => s.fleet === standing.fleet);
                      const posInFleet = fleetStandings.indexOf(standing);
                      if (standing.fleet === 'A') {
                        return posInFleet === 0 ? '1st' : posInFleet === 1 ? '2nd' : posInFleet === 2 ? '3rd' : null;
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
                            {index + 1}
                          </td>
                          {hasFinals && (
                            <td className={`px-3 py-3 text-center text-xs font-semibold ${
                              FLEET_COLORS[standing.fleet]?.text || (darkMode ? 'text-slate-400' : 'text-slate-600')
                            }`}>
                              {standing.fleet === 'A' ? 'G' : standing.fleet === 'B' ? 'S' : standing.fleet === 'C' ? 'B' : standing.fleet}
                            </td>
                          )}
                          <td className={`px-4 py-3 font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {standing.skipper?.name || 'Unknown'}
                          </td>
                          <td className={`px-4 py-3 text-center font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {standing.skipper?.sailNo || standing.skipper?.sailNumber || '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {standing.skipper?.boatModel || '-'}
                          </td>
                          {completedRaces.map((race: number, raceIdx: number) => {
                            const result = standing.raceResults?.find((r: any) => r.race === race);
                            const position = result?.position || '-';
                            const isDropped = standing.droppedRaceIndices?.has(raceIdx);

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
                            {Number.isFinite(standing.total) ? Number(standing.total).toFixed(1) : standing.total}
                          </td>
                          <td className={`px-4 py-3 text-center font-bold bg-blue-500/10 ${
                            (isTopThree || isFleetTopThree)
                              ? 'text-yellow-600'
                              : darkMode ? 'text-blue-400' : 'text-blue-700'
                          }`}>
                            {Number.isFinite(standing.net) ? Number(standing.net).toFixed(1) : standing.net}
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
            {standings.length} skippers
            {Array.isArray(dropRules) && dropRules.length > 0 && ` • Drop rules: ${dropRules.join(', ')} races`}
            {isShrs && ' • SHR scoring (position within heat)'}
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
