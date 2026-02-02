import React, { useState, useEffect, useRef } from 'react';
import { X, Calculator, Save, ChevronDown, Edit2, Check } from 'lucide-react';
import { RaceSeries } from '../types/race';
import { Avatar } from './ui/Avatar';

interface SeriesEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  series: RaceSeries;
  onSave: (updatedSeries: RaceSeries) => void;
  darkMode?: boolean;
}

interface RoundScore {
  roundIndex: number;
  roundName: string;
  completed: boolean;
  totalScore: number | null;
  isEditing: boolean;
  editValue: string;
  hasAverage: boolean;
}

export const SeriesEditModal: React.FC<SeriesEditModalProps> = ({
  isOpen,
  onClose,
  series,
  onSave,
  darkMode = true
}) => {
  const [editedSeries, setEditedSeries] = useState<RaceSeries>(series);
  const [selectedSkipperIndex, setSelectedSkipperIndex] = useState<number>(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Build a unique list of skippers from all rounds
    const allSkippers = new Map();

    series?.rounds?.forEach(round => {
      if (round.skippers && Array.isArray(round.skippers)) {
        round.skippers.forEach(skipper => {
          const key = skipper.sailNumber || skipper.sailNo;
          if (key && !allSkippers.has(key)) {
            allSkippers.set(key, skipper);
          }
        });
      }
    });

    const skippersList = Array.from(allSkippers.values());

    // Update the series with the collected skippers
    const updatedSeries = {
      ...series,
      skippers: skippersList
    };

    setEditedSeries(updatedSeries);
  }, [series]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    // Load round scores for the selected skipper - use the same calculation as SeriesResultsDisplay
    const selectedSkipper = editedSeries.skippers?.[selectedSkipperIndex];

    console.log('SeriesEditModal useEffect triggered:', {
      selectedSkipperIndex,
      selectedSkipper,
      hasSkippers: !!editedSeries.skippers,
      skippersCount: editedSeries.skippers?.length || 0,
      roundsCount: editedSeries.rounds?.length || 0
    });

    if (!selectedSkipper) {
      console.log('No selected skipper, returning empty scores');
      setRoundScores([]);
      return;
    }

    const scores: RoundScore[] = editedSeries.rounds.map((round, roundIndex) => {
      let finishingPosition: number | null = null;
      const hasAverage = round.averagePointsApplied?.[selectedSkipperIndex] !== undefined;

      if (hasAverage) {
        finishingPosition = round.averagePointsApplied[selectedSkipperIndex];
      } else if (round.completed) {
        // Find the skipper's index in THIS round's skipper array by matching sail number
        const selectedSailNum = selectedSkipper.sailNumber || selectedSkipper.sailNo;
        const roundSkippers = round.skippers || [];
        const roundSkipperIndex = roundSkippers.findIndex((s: any) =>
          (s.sailNumber || s.sailNo) === selectedSailNum
        );

        // Handle both results formats: flat array (results) or 2D array (raceResults)
        const flatResults = round.results || [];
        const raceResultsArray = (round as any).raceResults || [];

        // Flatten raceResults if it's a 2D array
        const allResults = flatResults.length > 0
          ? flatResults
          : raceResultsArray.flat();

        console.log(`Round ${roundIndex + 1}:`, {
          selectedSailNum,
          roundSkipperIndex,
          roundSkippersCount: roundSkippers.length,
          flatResultsCount: flatResults.length,
          raceResultsCount: raceResultsArray.length,
          allResultsCount: allResults.length,
          hasResults: allResults.length > 0
        });

        // Check if skipper participated in this round
        const hasResults = allResults.length > 0;
        const skipperParticipated = roundSkipperIndex !== -1 && hasResults && allResults.some((r: any) => r.skipperIndex === roundSkipperIndex);

        console.log(`Round ${roundIndex + 1} participation:`, {
          roundSkipperIndex,
          hasResults,
          skipperParticipated
        });

        if (!skipperParticipated) {
          finishingPosition = null;
        } else {
          // Calculate net scores for all skippers in this round using the same logic as SeriesResultsDisplay
          const roundResults = allResults;
          const skipperGroups: Record<number, any[]> = {};

          // Group results by skipper
          roundResults.forEach(result => {
            if (!skipperGroups[result.skipperIndex]) {
              skipperGroups[result.skipperIndex] = [];
            }
            skipperGroups[result.skipperIndex].push(result);
          });

          // Calculate net scores with drops for this round
          const skipperNetScores = Object.entries(skipperGroups).map(([skipperIndex, results]) => {
            const idx = parseInt(skipperIndex);

            // Calculate scores for each race
            const scores = results.map(r => {
              if (r.position !== null && !r.letterScore) {
                return { race: r.race || 1, score: r.position };
              }
              return { race: r.race || 1, score: editedSeries.skippers.length + 1 };
            });

            const gross = scores.reduce((sum, r) => sum + r.score, 0);

            // Determine number of drops for this round
            let numDrops = 0;
            const dropRules = round.dropRules || editedSeries.dropRules || [4, 8, 16, 24, 32, 40];
            const numRaces = scores.length;

            for (const threshold of dropRules) {
              if (numRaces >= threshold) {
                numDrops++;
              }
            }

            // Apply drops - drop the highest scores
            const sortedScores = [...scores].sort((a, b) => b.score - a.score);
            const dropsTotal = sortedScores.slice(0, numDrops).reduce((sum, r) => sum + r.score, 0);
            const net = gross - dropsTotal;

            return { skipperIndex: idx, net, positions: results.map((r: any) => r.position).filter((p: any) => p !== null) };
          });

          // Sort skippers by net score to determine positions
          skipperNetScores.sort((a, b) => {
            if (a.net !== b.net) {
              return a.net - b.net;
            }

            // Countback: compare number of 1sts, 2nds, 3rds, etc.
            const aPositions = a.positions.sort((x: number, y: number) => x - y);
            const bPositions = b.positions.sort((x: number, y: number) => x - y);
            const maxPosition = Math.max(...aPositions, ...bPositions, 1);

            for (let pos = 1; pos <= maxPosition; pos++) {
              const aCount = aPositions.filter((p: number) => p === pos).length;
              const bCount = bPositions.filter((p: number) => p === pos).length;

              if (aCount !== bCount) {
                return bCount - aCount;
              }
            }

            return a.skipperIndex - b.skipperIndex;
          });

          // Find our skipper's position (using the round's skipper index)
          const position = skipperNetScores.findIndex(s => s.skipperIndex === roundSkipperIndex);
          if (position !== -1) {
            finishingPosition = position + 1;
          }
        }
      }

      return {
        roundIndex,
        roundName: round.roundName || `Round ${roundIndex + 1}`,
        completed: round.completed,
        totalScore: finishingPosition,
        isEditing: false,
        editValue: finishingPosition?.toString() || '',
        hasAverage
      };
    });

    setRoundScores(scores);
  }, [selectedSkipperIndex, editedSeries]);

  if (!isOpen) return null;

  const selectedSkipper = editedSeries.skippers?.[selectedSkipperIndex];
  const sailNum = selectedSkipper?.sailNumber || selectedSkipper?.sailNo;

  // Calculate average finishing position excluding drops
  const calculateAveragePosition = (): number => {
    const dropRules = editedSeries.dropRules || [];
    const completedPositions = roundScores
      .filter(rs => rs.completed && rs.totalScore !== null)
      .map(rs => rs.totalScore as number)
      .sort((a, b) => b - a); // Sort descending (higher position numbers are worse)

    // Apply drop rules - drop the worst (highest) positions
    let positionsToCount = [...completedPositions];
    dropRules.forEach(drop => {
      if (positionsToCount.length > drop) {
        positionsToCount = positionsToCount.slice(0, -1); // Remove worst (highest) position
      }
    });

    if (positionsToCount.length === 0) return 0;

    const total = positionsToCount.reduce((sum, pos) => sum + pos, 0);
    return Math.round(total / positionsToCount.length);
  };

  const startEditing = (roundIndex: number) => {
    setRoundScores(prev => prev.map(rs =>
      rs.roundIndex === roundIndex
        ? { ...rs, isEditing: true, editValue: rs.totalScore?.toString() || '' }
        : rs
    ));
  };

  const cancelEditing = (roundIndex: number) => {
    setRoundScores(prev => prev.map(rs =>
      rs.roundIndex === roundIndex
        ? { ...rs, isEditing: false }
        : rs
    ));
  };

  const saveScore = (roundIndex: number) => {
    const roundScore = roundScores.find(rs => rs.roundIndex === roundIndex);
    if (!roundScore) return;

    const newScore = parseInt(roundScore.editValue);
    if (isNaN(newScore)) {
      cancelEditing(roundIndex);
      return;
    }

    // Update the edited series
    const updatedSeries = { ...editedSeries };
    const round = updatedSeries.rounds[roundIndex];

    if (!round.manualScoreOverrides) {
      round.manualScoreOverrides = {};
    }
    round.manualScoreOverrides[selectedSkipperIndex] = newScore;

    // Clear average if manual override is set
    if (round.averagePointsApplied?.[selectedSkipperIndex]) {
      delete round.averagePointsApplied[selectedSkipperIndex];
    }

    setEditedSeries(updatedSeries);

    // Update local state
    setRoundScores(prev => prev.map(rs =>
      rs.roundIndex === roundIndex
        ? { ...rs, totalScore: newScore, isEditing: false, hasAverage: false }
        : rs
    ));

    // Auto-save to database
    console.log('=== AUTO-SAVING MANUAL OVERRIDE ===');
    console.log('Round:', roundIndex, 'Skipper:', selectedSkipperIndex, 'Score:', newScore);
    onSave(updatedSeries);
  };

  const applyAverageToRound = (roundIndex: number) => {
    const avgPosition = calculateAveragePosition();
    if (avgPosition === 0) return;

    console.log('=== APPLYING AVERAGE ===');
    console.log('Round Index:', roundIndex);
    console.log('Selected Skipper Index:', selectedSkipperIndex);
    console.log('Average Position:', avgPosition);

    const updatedSeries = { ...editedSeries };
    const round = updatedSeries.rounds[roundIndex];

    if (!round.averagePointsApplied) {
      round.averagePointsApplied = {};
    }
    round.averagePointsApplied[selectedSkipperIndex] = avgPosition;

    console.log('Updated averagePointsApplied:', round.averagePointsApplied);

    // Clear manual override if average is applied
    if (round.manualScoreOverrides?.[selectedSkipperIndex]) {
      delete round.manualScoreOverrides[selectedSkipperIndex];
    }

    setEditedSeries(updatedSeries);

    // Update local state
    setRoundScores(prev => prev.map(rs =>
      rs.roundIndex === roundIndex
        ? { ...rs, totalScore: avgPosition, hasAverage: true }
        : rs
    ));

    // Auto-save to database
    console.log('=== AUTO-SAVING AVERAGE ===');
    onSave(updatedSeries);
  };

  const handleSave = () => {
    console.log('=== SAVING SERIES FROM EDIT MODAL ===');
    console.log('Full editedSeries:', editedSeries);
    console.log('Rounds with averagePointsApplied:');
    editedSeries.rounds.forEach((round, idx) => {
      if (round.averagePointsApplied) {
        console.log(`Round ${idx}:`, round.averagePointsApplied);
      }
    });
    onSave(editedSeries);
    onClose();
  };

  const avgPosition = calculateAveragePosition();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Edit Series Results
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Skipper Selection */}
          <div className="relative z-10">
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Select Skipper
            </label>

            {!editedSeries.skippers || editedSeries.skippers.length === 0 ? (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-red-900/20 border-red-600/30 text-red-300' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <p className="text-sm">
                  No skippers found in this series. Please ensure the series has skippers added.
                </p>
              </div>
            ) : (
              <div className="relative z-10" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className={`w-full px-4 py-3 rounded-lg border flex items-center justify-between ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600'
                      : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
                  } transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={selectedSkipper?.name || ''}
                      src={selectedSkipper?.avatarUrl}
                      size="sm"
                    />
                    <span>
                      {selectedSkipper?.name || 'Unknown'} - Sail #{sailNum || 'N/A'}
                    </span>
                  </div>
                  <ChevronDown size={20} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                  <div
                    className={`absolute w-full mt-2 rounded-lg border shadow-2xl max-h-64 overflow-y-auto ${
                      darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-300'
                    }`}
                    style={{ zIndex: 9999 }}
                  >
                    {editedSeries.skippers.map((skipper, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setSelectedSkipperIndex(index);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                          index === selectedSkipperIndex
                            ? darkMode ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-900'
                            : darkMode ? 'hover:bg-slate-600 text-white' : 'hover:bg-slate-100 text-slate-900'
                        }`}
                      >
                        <Avatar
                          name={skipper.name}
                          src={skipper.avatarUrl}
                          size="sm"
                        />
                        <span className="text-left">
                          {skipper.name} - Sail #{skipper.sailNumber || skipper.sailNo}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Average Position Info */}
          {selectedSkipper && (
            <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/20 border-blue-600/30' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="text-blue-400" size={20} />
                <span className={`font-medium ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                  Average Finishing Position (Excluding Drops)
                </span>
              </div>
              <p className={`text-sm ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>
                Average finishing position for this skipper across completed rounds after applying drop rules: <strong>{avgPosition}</strong>
              </p>
            </div>
          )}

          {/* Rounds List */}
          {selectedSkipper && (
            <div>
              <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Round Results
              </label>
              <div className="space-y-2">
                {roundScores.map((roundScore) => (
                  <div
                    key={roundScore.roundIndex}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex-1">
                      <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {roundScore.roundName}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {roundScore.completed ? 'Completed' : 'Not completed'}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Score Display/Edit */}
                      {roundScore.isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={roundScore.editValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRoundScores(prev => prev.map(rs =>
                                rs.roundIndex === roundScore.roundIndex
                                  ? { ...rs, editValue: value }
                                  : rs
                              ));
                            }}
                            className={`w-20 px-2 py-1 rounded border ${
                              darkMode
                                ? 'bg-slate-600 border-slate-500 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => saveScore(roundScore.roundIndex)}
                            className="p-1 rounded bg-green-600 text-white hover:bg-green-700"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => cancelEditing(roundScore.roundIndex)}
                            className={`p-1 rounded ${
                              darkMode
                                ? 'bg-slate-600 text-white hover:bg-slate-500'
                                : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                            }`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className={`text-lg font-bold min-w-[60px] text-right ${
                            roundScore.hasAverage
                              ? 'text-green-500'
                              : darkMode ? 'text-white' : 'text-slate-900'
                          }`}>
                            {roundScore.totalScore !== null ? roundScore.totalScore : '-'}
                          </div>
                          {roundScore.completed && (
                            <button
                              onClick={() => startEditing(roundScore.roundIndex)}
                              className={`p-2 rounded-lg transition-colors ${
                                darkMode
                                  ? 'hover:bg-slate-600 text-slate-400'
                                  : 'hover:bg-slate-200 text-slate-600'
                              }`}
                              title="Edit score"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Apply Average Button */}
                      <button
                        onClick={() => applyAverageToRound(roundScore.roundIndex)}
                        disabled={!roundScore.completed || avgPosition === 0}
                        className={`px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                          roundScore.completed && avgPosition > 0
                            ? roundScore.hasAverage
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {roundScore.hasAverage ? 'Average Applied' : 'Apply Average'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-amber-900/20 border-amber-600/30' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-sm ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
              <strong>Note:</strong> The numbers shown are finishing positions (1st, 2nd, 3rd, etc.) for each round. You can manually edit any position or apply the average finishing position (excluding drops) to any completed round. Useful for scenarios like representing the club at national events.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`px-6 py-2 rounded-lg transition-colors ${
              darkMode
                ? 'bg-slate-700 text-white hover:bg-slate-600'
                : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
