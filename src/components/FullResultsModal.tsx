import React, { useMemo } from 'react';
import { X, Trophy } from 'lucide-react';
import { Skipper, LetterScore } from '../types';
import { getLetterScorePointsForRace, compareWithCountback } from '../utils/scratchCalculations';

interface FullResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  raceResults: any[];
  dropRules?: number[] | string;
  numRaces: number;
  darkMode: boolean;
  raceType?: string;
}

export const FullResultsModal: React.FC<FullResultsModalProps> = ({
  isOpen,
  onClose,
  skippers,
  raceResults,
  dropRules,
  numRaces,
  darkMode,
  raceType = 'scratch'
}) => {
  const parsedDropRules = useMemo((): number[] => {
    if (!dropRules) return [];
    if (Array.isArray(dropRules)) return dropRules;
    if (typeof dropRules === 'string') {
      try {
        const parsed = JSON.parse(dropRules);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* ignore */ }
    }
    return [];
  }, [dropRules]);

  const completedRaces = useMemo(() => {
    const races = new Set<number>();
    raceResults.forEach(r => {
      if (r.position !== null || r.letterScore) {
        races.add(r.race);
      }
    });
    return Array.from(races).sort((a, b) => a - b);
  }, [raceResults]);

  const standings = useMemo(() => {
    if (completedRaces.length === 0) return [];

    const entries = skippers.map((skipper, skipperIndex) => {
      const skipperResults = completedRaces.map(race => {
        const result = raceResults.find(r => r.race === race && r.skipperIndex === skipperIndex);
        if (!result) {
          return { race, position: skippers.length + 1, letterScore: null as LetterScore | null, points: skippers.length + 1 };
        }

        let points: number;
        if (result.letterScore) {
          points = getLetterScorePointsForRace(result.letterScore, race, raceResults, skippers, skipperIndex);
        } else {
          points = result.position || skippers.length + 1;
        }

        return {
          race,
          position: result.position,
          letterScore: result.letterScore as LetterScore | null,
          points
        };
      });

      const allPoints = skipperResults.map(r => r.points);
      const total = allPoints.reduce((sum, p) => sum + p, 0);

      let drops = 0;
      for (const rule of parsedDropRules) {
        if (completedRaces.length >= rule) {
          drops++;
        }
      }

      const droppedRaceIndices = new Set<number>();
      if (drops > 0) {
        const droppableEntries = skipperResults
          .map((r, idx) => ({ points: r.points, idx, letterScore: r.letterScore }))
          .filter(r => r.letterScore !== 'DNE');

        droppableEntries.sort((a, b) => b.points - a.points);
        for (let i = 0; i < Math.min(drops, droppableEntries.length); i++) {
          droppedRaceIndices.add(droppableEntries[i].idx);
        }
      }

      let net = total;
      droppedRaceIndices.forEach(idx => {
        net -= skipperResults[idx].points;
      });

      return {
        skipperIndex,
        skipper,
        results: skipperResults,
        allPoints,
        total,
        drops,
        droppedRaceIndices,
        net
      };
    });

    return entries.sort((a, b) => {
      if (a.net !== b.net) return a.net - b.net;
      return compareWithCountback(a.allPoints, b.allPoints, a.drops, b.drops);
    });
  }, [skippers, raceResults, completedRaces, parsedDropRules]);

  if (!isOpen) return null;

  const dropRuleLabel = parsedDropRules.length > 0
    ? `Drop after ${parsedDropRules.join(', ')} races`
    : 'No drops';

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
                Series Standings
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {completedRaces.length} of {numRaces} race{numRaces !== 1 ? 's' : ''} completed
                {raceType === 'handicap' ? ' (Handicap)' : ' (Scratch)'}
                {' \u2022 '}{dropRuleLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`rounded-full p-2 transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {completedRaces.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <Trophy size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No completed races yet</p>
              <p className="text-sm mt-2">Start scoring races to see standings</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b-2 ${darkMode ? 'border-slate-700' : 'border-slate-300'}`}>
                    <th className={`px-4 py-3 text-left text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Pos
                    </th>
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
                        className={`px-3 py-3 text-center text-sm font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                      >
                        R{race}
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
                    const isTopThree = index < 3;
                    const medal = index === 0 ? '\uD83E\uDD47' : index === 1 ? '\uD83E\uDD48' : index === 2 ? '\uD83E\uDD49' : null;

                    return (
                      <tr
                        key={standing.skipperIndex}
                        className={`
                          border-b transition-colors
                          ${darkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-slate-200 hover:bg-slate-50'}
                          ${isTopThree ? (darkMode ? 'bg-yellow-900/10' : 'bg-yellow-50/50') : ''}
                        `}
                      >
                        <td className={`px-4 py-3 text-center font-bold ${
                          isTopThree ? 'text-yellow-600' : darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          {medal ? (
                            <span className="flex items-center justify-center gap-1">
                              {medal}
                              <span>{index + 1}</span>
                            </span>
                          ) : (
                            index + 1
                          )}
                        </td>
                        <td className={`px-4 py-3 font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {standing.skipper.name}
                        </td>
                        <td className={`px-4 py-3 text-center font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {standing.skipper.sailNo}
                        </td>
                        <td className={`px-4 py-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {standing.skipper.boatModel}
                        </td>
                        {standing.results.map((result, raceIdx) => {
                          const isDropped = standing.droppedRaceIndices.has(raceIdx);
                          const display = result.letterScore
                            ? result.letterScore
                            : result.position || '-';

                          return (
                            <td
                              key={result.race}
                              className={`px-3 py-3 text-center font-medium ${
                                isDropped
                                  ? darkMode ? 'text-red-400 line-through opacity-50' : 'text-red-600 line-through opacity-50'
                                  : result.letterScore
                                    ? darkMode ? 'text-amber-400' : 'text-amber-700'
                                    : darkMode ? 'text-slate-300' : 'text-slate-700'
                              }`}
                            >
                              {display}
                            </td>
                          );
                        })}
                        <td className={`px-4 py-3 text-center font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {standing.total}
                        </td>
                        <td className={`px-4 py-3 text-center font-bold bg-blue-500/10 ${
                          isTopThree ? 'text-yellow-600' : darkMode ? 'text-blue-400' : 'text-blue-700'
                        }`}>
                          {standing.net}
                        </td>
                      </tr>
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
            {standings.length} skippers {'\u2022'} {dropRuleLabel}
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
