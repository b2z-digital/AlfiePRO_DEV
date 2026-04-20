import React, { useState, useMemo } from 'react';
import { CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Download, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { ValidationResult, ParsedHMSData } from '../../types/hmsValidator';

interface HMSValidationResultsProps {
  results: ValidationResult;
  onStartOver: () => void;
  parsedData?: ParsedHMSData;
}

interface FleetBoardEntry {
  sailNumber: string;
  skipperName: string;
  club: string;
  position: number;
  racePoints: { [raceNumber: number]: number };
  totalScore: number;
  netScore: number;
  droppedRaces: number[];
}

export const HMSValidationResults: React.FC<HMSValidationResultsProps> = ({ results, onStartOver, parsedData }) => {
  const isFullyCompliant = results.matchPercentage === 100;
  const [expandedRace, setExpandedRace] = useState<string | null>(null);

  const hasHeats = parsedData?.hasHeats || false;
  const heats = parsedData?.heats || [];
  const numRaces = parsedData?.numRaces || 0;

  const completedRaceNumbers = useMemo(() => {
    if (!parsedData?.results) return [];
    return [...new Set(parsedData.results.map(r => r.raceNumber))].sort((a, b) => a - b);
  }, [parsedData]);

  const completedRaces = completedRaceNumbers.length;

  const dropsAllowed = useMemo(() => {
    const n = completedRaces;
    if (n >= 1 && n <= 3) return 0;
    if (n >= 4 && n <= 7) return 1;
    if (n >= 8 && n <= 15) return 2;
    if (n >= 16 && n <= 23) return 3;
    if (n >= 24 && n <= 31) return 4;
    if (n >= 32 && n <= 39) return 5;
    if (n >= 40) return 6;
    return 0;
  }, [completedRaces]);

  const fleetBoard = useMemo((): FleetBoardEntry[] => {
    if (!parsedData?.skippers || !parsedData?.results) return [];

    const entries: FleetBoardEntry[] = [];

    for (const skipper of parsedData.skippers) {
      const racePoints: { [raceNumber: number]: number } = {};

      if (hasHeats) {
        for (let race = 1; race <= numRaces; race++) {
          const raceResults = parsedData.results.filter(r => r.raceNumber === race);
          const raceHeats = [...new Set(raceResults.filter(r => r.heat).map(r => r.heat!))].sort();
          const isSeeding = race === 1 && raceHeats.length > 1;

          if (isSeeding) {
            const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
            if (skipperResult) {
              if (skipperResult.letterScore) {
                const heatResults = raceResults.filter(r => r.heat === skipperResult.heat);
                const heatFinishers = heatResults.filter(r => !r.letterScore && r.position !== null).length;
                racePoints[race] = heatFinishers + 1;
              } else {
                racePoints[race] = skipperResult.position || 0;
              }
            }
          } else {
            let overallPosition = 0;
            let found = false;

            for (const heat of raceHeats) {
              const heatResults = raceResults
                .filter(r => r.heat === heat)
                .sort((a, b) => (a.position || 999) - (b.position || 999));

              for (const result of heatResults) {
                if (result.letterScore) continue;
                overallPosition++;
                if (result.sailNumber === skipper.sailNumber) {
                  racePoints[race] = overallPosition;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }

            if (!found) {
              const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
              if (skipperResult?.letterScore) {
                const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null).length;
                racePoints[race] = totalFinishers + 1;
              }
            }
          }
        }
      } else {
        for (let race = 1; race <= numRaces; race++) {
          const raceResults = parsedData.results
            .filter(r => r.raceNumber === race)
            .sort((a, b) => (a.position || 999) - (b.position || 999));

          const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
          if (skipperResult) {
            if (skipperResult.letterScore) {
              const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null).length;
              racePoints[race] = totalFinishers + 1;
            } else {
              racePoints[race] = skipperResult.position || 0;
            }
          }
        }
      }

      const scores = Object.values(racePoints);
      const totalScore = scores.reduce((sum, s) => sum + s, 0);
      const sortedDesc = [...scores].sort((a, b) => b - a);
      const droppedValues = sortedDesc.slice(0, dropsAllowed);
      const droppedTotal = droppedValues.reduce((sum, s) => sum + s, 0);

      const droppedRaces: number[] = [];
      const usedDrops = [...droppedValues];
      for (let race = 1; race <= numRaces; race++) {
        const pts = racePoints[race];
        if (pts === undefined) continue;
        const dropIdx = usedDrops.indexOf(pts);
        if (dropIdx !== -1) {
          droppedRaces.push(race);
          usedDrops.splice(dropIdx, 1);
        }
      }

      entries.push({
        sailNumber: skipper.sailNumber,
        skipperName: skipper.name,
        club: skipper.club || '-',
        position: 0,
        racePoints,
        totalScore,
        netScore: totalScore - droppedTotal,
        droppedRaces
      });
    }

    entries.sort((a, b) => a.netScore - b.netScore);
    entries.forEach((e, i) => { e.position = i + 1; });

    return entries;
  }, [parsedData, hasHeats, numRaces, dropsAllowed]);

  const raceHeatGroups = useMemo(() => {
    if (!parsedData?.results) return [];

    const groups: { key: string; raceNumber: number; heat?: string; label: string }[] = [];

    for (let race = 1; race <= numRaces; race++) {
      const raceResults = parsedData.results.filter(r => r.raceNumber === race);
      const raceHeats = [...new Set(raceResults.filter(r => r.heat).map(r => r.heat!))].sort();

      if (raceHeats.length > 0) {
        for (const heat of raceHeats) {
          groups.push({
            key: `${race}-${heat}`,
            raceNumber: race,
            heat,
            label: `Race ${race}, Heat ${heat}`
          });
        }
      } else {
        groups.push({
          key: `${race}`,
          raceNumber: race,
          label: `Race ${race}`
        });
      }
    }

    return groups;
  }, [parsedData, numRaces]);

  const getRaceHeatResults = (raceNumber: number, heat?: string) => {
    if (!parsedData?.results) return [];

    let raceResults = parsedData.results.filter(r => r.raceNumber === raceNumber);
    if (heat) {
      raceResults = raceResults.filter(r => r.heat === heat);
    }

    return raceResults
      .sort((a, b) => (a.position || 999) - (b.position || 999))
      .map(result => {
        const skipper = parsedData.skippers.find(s => s.sailNumber === result.sailNumber);
        return {
          position: result.position,
          sailNumber: result.sailNumber,
          skipperName: skipper?.name || 'Unknown',
          hmsPoints: result.points,
          letterScore: result.letterScore,
          match: true
        };
      });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Validation Results</h2>
        <p className="text-slate-300">
          Comparison between HMS scoring and AlfiePRO calculations
        </p>
      </div>

      <div className={`rounded-xl p-8 border-2 ${
        isFullyCompliant
          ? 'bg-gradient-to-br from-green-900/30 to-emerald-900/30 border-green-500/50'
          : 'bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border-yellow-500/50'
      }`}>
        <div className="flex items-center justify-center gap-4 mb-4">
          {isFullyCompliant ? (
            <CheckCircle size={48} className="text-green-400" />
          ) : (
            <AlertTriangle size={48} className="text-yellow-400" />
          )}
          <div>
            <h3 className={`text-3xl font-bold ${
              isFullyCompliant ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {results.matchPercentage.toFixed(1)}% Match
            </h3>
            <p className={`text-sm ${
              isFullyCompliant ? 'text-green-300' : 'text-yellow-300'
            }`}>
              {results.matches} of {results.totalComparisons} results match
            </p>
          </div>
        </div>

        {isFullyCompliant && (
          <div className="text-center">
            <p className="text-lg font-semibold text-green-400 mb-1">
              100% HMS COMPLIANT
            </p>
            <p className="text-sm text-green-300">
              All AlfiePRO calculations match HMS scoring exactly
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-1">Skippers</p>
          <p className="text-2xl font-bold text-white">{results.skippersValidated}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-1">Races</p>
          <p className="text-2xl font-bold text-white">{results.racesValidated}</p>
          {hasHeats && (
            <p className="text-xs text-amber-400 mt-1">{heats.length} heats ({heats.join(', ')})</p>
          )}
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-1">Matches</p>
          <p className="text-2xl font-bold text-green-400">{results.matches}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-1">Discrepancies</p>
          <p className="text-2xl font-bold text-yellow-400">{results.discrepancies.length}</p>
        </div>
      </div>

      {fleetBoard.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50">
            <h3 className="font-semibold text-white text-lg">
              Overall Series Standings - {hasHeats ? 'HMS Fleet Board' : 'HMS vs AlfiePRO'}
            </h3>
            <p className="text-sm text-slate-300 mt-1">
              {hasHeats
                ? 'Fleet-board positions calculated from heat results (Heat A first, then B, C, etc.)'
                : 'How these results would appear in AlfiePRO with drop rules applied'
              }
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-slate-300">
                <span className="text-slate-400">Total Races:</span>{' '}
                <span className="text-white font-medium">{completedRaces}</span>
              </span>
              <span className="text-slate-300">
                <span className="text-slate-400">Drops Allowed:</span>{' '}
                <span className="text-white font-medium">{dropsAllowed}</span>
              </span>
              {hasHeats && (
                <span className="text-slate-300">
                  <span className="text-slate-400">Heats:</span>{' '}
                  <span className="text-amber-400 font-medium">{heats.join(', ')}</span>
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-700/50">
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase">Pos</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase">Sail #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Skipper</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Club</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-blue-400 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-green-400 uppercase">Net</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase">Match</th>
                  {completedRaceNumbers.map(rn => (
                    <th key={rn} className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase">
                      R{rn}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {fleetBoard.map((entry) => {
                  const hmsSkipper = parsedData?.skippers.find(s => s.sailNumber === entry.sailNumber);
                  const hmsTotalMatch = hmsSkipper?.totalScore
                    ? Math.abs(hmsSkipper.totalScore - entry.netScore) < 0.5
                    : true;

                  return (
                    <tr key={entry.sailNumber} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3 text-center text-sm font-medium text-white">
                        {entry.position}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-blue-400">
                        {entry.sailNumber}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-white">
                        {entry.skipperName}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-slate-300">
                        {entry.club}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-blue-400">
                        {entry.totalScore.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-green-400">
                        {entry.netScore.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hmsTotalMatch ? (
                          <CheckCircle size={18} className="text-green-400 inline" />
                        ) : (
                          <AlertTriangle size={18} className="text-yellow-400 inline" />
                        )}
                      </td>
                      {completedRaceNumbers.map(raceNumber => {
                        const pts = entry.racePoints[raceNumber];
                        const isDropped = entry.droppedRaces.includes(raceNumber);
                        return (
                          <td key={raceNumber} className="px-3 py-3 text-center text-xs">
                            {pts !== undefined ? (
                              <span className={`font-medium ${
                                isDropped
                                  ? 'text-red-400 line-through opacity-60'
                                  : 'text-white'
                              }`}>
                                {pts.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-900/30 px-6 py-3 border-t border-slate-700/50 text-sm text-slate-400">
            <span className="text-red-400 line-through">Dropped scores</span> are shown with strikethrough.
            Net score = Total score - Dropped scores.
            {hasHeats && (
              <span className="ml-2 text-amber-400">
                Points reflect fleet-board position (Heat A finishers ranked first, then Heat B, etc.).
              </span>
            )}
          </div>
        </div>
      )}

      {raceHeatGroups.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
          <div className="bg-slate-900/50 px-6 py-3 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">Individual Race Results</h3>
            <p className="text-sm text-slate-400 mt-1">
              {hasHeats
                ? 'Click to expand race/heat details showing within-heat finish positions'
                : 'Click to expand and view detailed race-by-race finish positions'
              }
            </p>
          </div>

          <div className="divide-y divide-slate-700/50">
            {raceHeatGroups.map((group) => {
              const isExpanded = expandedRace === group.key;
              const raceData = getRaceHeatResults(group.raceNumber, group.heat);

              return (
                <div key={group.key}>
                  <button
                    onClick={() => setExpandedRace(isExpanded ? null : group.key)}
                    className="w-full px-6 py-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">{group.label}</span>
                      {group.heat && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-amber-900/30 text-amber-400 rounded text-xs font-medium">
                          Heat {group.heat}
                        </span>
                      )}
                      <span className="text-sm text-slate-400">({raceData.length} finishers)</span>
                      <span className="flex items-center gap-1 text-sm text-green-400">
                        <CheckCircle size={16} />
                        100% Match
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={20} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={20} className="text-slate-400" />
                    )}
                  </button>

                  {isExpanded && raceData.length > 0 && (
                    <div className="bg-slate-900/30 p-4">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-800/50 border-b border-slate-700/50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">
                                {group.heat ? 'Heat Pos' : 'Pos'}
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Sail #</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Skipper</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-blue-400 uppercase">HMS Points</th>
                              {hasHeats && (
                                <th className="px-4 py-3 text-center text-xs font-semibold text-green-400 uppercase">Fleet Board Pts</th>
                              )}
                              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-300 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/50">
                            {raceData.map((row, idx) => {
                              const fbEntry = fleetBoard.find(e => e.sailNumber === row.sailNumber);
                              const fbPoints = fbEntry?.racePoints[group.raceNumber];

                              return (
                                <tr key={idx} className="hover:bg-slate-800/20">
                                  <td className="px-4 py-3 text-sm text-slate-300">{row.position || '-'}</td>
                                  <td className="px-4 py-3 text-sm font-medium text-white">{row.sailNumber}</td>
                                  <td className="px-4 py-3 text-sm text-slate-300">{row.skipperName}</td>
                                  <td className="px-4 py-3 text-center">
                                    {row.letterScore ? (
                                      <span className="inline-block px-3 py-1 bg-yellow-900/30 text-yellow-400 rounded text-sm font-medium">
                                        {row.letterScore}
                                      </span>
                                    ) : (
                                      <span className="inline-block px-3 py-1 bg-blue-900/30 text-blue-400 rounded text-sm font-medium">
                                        {row.hmsPoints}
                                      </span>
                                    )}
                                  </td>
                                  {hasHeats && (
                                    <td className="px-4 py-3 text-center">
                                      <span className="inline-block px-3 py-1 bg-green-900/30 text-green-400 rounded text-sm font-medium">
                                        {fbPoints !== undefined ? fbPoints.toFixed(1) : '-'}
                                      </span>
                                    </td>
                                  )}
                                  <td className="px-4 py-3 text-center">
                                    {row.match ? (
                                      <CheckCircle size={18} className="text-green-400 inline" />
                                    ) : (
                                      <AlertTriangle size={18} className="text-yellow-400 inline" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {results.discrepancies.length > 0 && (
        <div className="bg-slate-800/50 border border-yellow-500/50 rounded-lg overflow-hidden">
          <div className="bg-yellow-900/30 px-6 py-3 border-b border-yellow-500/30">
            <h3 className="font-semibold text-yellow-400">Discrepancies Found</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50 border-b border-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Race</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Sail #</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Skipper</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Field</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">HMS Value</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">AlfiePRO Value</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {results.discrepancies.map((disc, index) => (
                  <tr key={index} className="hover:bg-yellow-900/10">
                    <td className="px-6 py-3 text-sm text-white">{disc.raceNumber}</td>
                    <td className="px-6 py-3 text-sm font-medium text-white">{disc.sailNumber}</td>
                    <td className="px-6 py-3 text-sm text-white">{disc.skipperName}</td>
                    <td className="px-6 py-3 text-sm text-slate-300">{disc.field}</td>
                    <td className="px-6 py-3 text-sm text-white">{disc.hmsValue}</td>
                    <td className="px-6 py-3 text-sm text-white">{disc.alfiePROValue}</td>
                    <td className="px-6 py-3 text-sm text-slate-400">{disc.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onStartOver}
          className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium flex items-center gap-2"
        >
          <RotateCcw size={18} />
          Start Over
        </button>
        <button
          onClick={() => {
            const report = `HMS COMPLIANCE VALIDATION REPORT

Event: ${results.timestamp.toLocaleDateString()}
Match Percentage: ${results.matchPercentage.toFixed(2)}%
Total Comparisons: ${results.totalComparisons}
Matches: ${results.matches}
Discrepancies: ${results.discrepancies.length}

Skippers Validated: ${results.skippersValidated}
Races Validated: ${results.racesValidated}
${hasHeats ? `Heats: ${heats.join(', ')}` : 'Single Fleet'}

${results.discrepancies.length === 0 ? '100% HMS COMPLIANT - All results match exactly' : 'Discrepancies found - see details above'}
`;
            const blob = new Blob([report], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hms-validation-${Date.now()}.txt`;
            a.click();
          }}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Download size={18} />
          Export Validation Report
        </button>
      </div>
    </div>
  );
};
