import React, { useState } from 'react';
import { X, AlertTriangle, Hash } from 'lucide-react';
import { LetterScore } from '../types/letterScores';

export type { LetterScore };

interface LetterScoreSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (letterScore: LetterScore | null, customPoints?: number) => void;
  onWithdrawFromEvent?: () => void;
  darkMode: boolean;
  skipperName: string;
  raceNumber: number;
  skipperPreviousResults?: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number }>;
}

const letterScores: { code: LetterScore; name: string; description: string; color: string; scoring: string }[] = [
  { code: 'DNS', name: 'Did Not Start', description: 'Did not start the race', color: 'bg-red-600', scoring: 'Starter +1' },
  { code: 'DNF', name: 'Did Not Finish', description: 'Started but did not finish', color: 'bg-orange-600', scoring: 'Starter +1' },
  { code: 'DSQ', name: 'Disqualified', description: 'DSQ for rule violation', color: 'bg-purple-600', scoring: 'Starter +1' },
  { code: 'OCS', name: 'On Course Side', description: 'Started early, didn\'t return', color: 'bg-yellow-600', scoring: 'Starter +1' },
  { code: 'BFD', name: 'Black Flag', description: 'DSQ under black flag rule', color: 'bg-gray-800', scoring: 'Starter +1' },
  { code: 'RDG', name: 'Redress Given', description: 'Given redress by committee', color: 'bg-green-600', scoring: 'Custom' },
  { code: 'DPI', name: 'Discretionary Penalty', description: 'Received discretionary penalty', color: 'bg-pink-600', scoring: 'Custom' },
  { code: 'RET', name: 'Retired', description: 'Retired voluntarily', color: 'bg-amber-600', scoring: 'Starter +1' },
  { code: 'DNC', name: 'Did Not Compete', description: 'Never present in race area', color: 'bg-red-700', scoring: 'Entrant +1' },
  { code: 'DNE', name: 'Non-Excludable DSQ', description: 'DSQ that cannot be dropped', color: 'bg-purple-800', scoring: 'Starter +1' },
  { code: 'NSC', name: 'Not Sailed Correct Course', description: 'Finished but course error', color: 'bg-orange-500', scoring: 'Starter +1' },
  { code: 'WDN', name: 'Withdrawn', description: 'Formally withdrew from event', color: 'bg-slate-600', scoring: 'Entrant +1' }
];

export const LetterScoreSelector: React.FC<LetterScoreSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  onWithdrawFromEvent,
  darkMode,
  skipperName,
  raceNumber,
  skipperPreviousResults = []
}) => {
  const [selectedLetterScore, setSelectedLetterScore] = useState<LetterScore | null>(null);
  const [showCustomPoints, setShowCustomPoints] = useState(false);
  const [customPoints, setCustomPoints] = useState<string>('');
  const [useAveragePoints, setUseAveragePoints] = useState(true);

  // Calculate average points from previous results (excluding letter scores except RDG/DPI with custom points)
  const calculateAveragePoints = (): number | null => {
    if (!skipperPreviousResults || skipperPreviousResults.length === 0) {
      return null;
    }

    // Filter to only include valid scored results (position-based or RDG/DPI with custom points)
    const validResults = skipperPreviousResults.filter(result => {
      // Include if has position (normal finish)
      if (result.position !== null && result.position > 0) {
        return true;
      }
      // Include RDG/DPI if they have custom points
      if ((result.letterScore === 'RDG' || result.letterScore === 'DPI') && result.customPoints) {
        return true;
      }
      return false;
    });

    if (validResults.length === 0) {
      return null;
    }

    // Calculate average from the points
    const totalPoints = validResults.reduce((sum, result) => sum + result.points, 0);
    const average = totalPoints / validResults.length;

    // Round to 1 decimal place
    return Math.round(average * 10) / 10;
  };

  const averagePoints = calculateAveragePoints();

  const handleLetterScoreSelect = (letterScore: LetterScore) => {
    if (letterScore === 'RDG' || letterScore === 'DPI') {
      setSelectedLetterScore(letterScore);
      setShowCustomPoints(true);
      // Default to average points if available and more than 1 race completed
      if (averagePoints !== null && skipperPreviousResults.length > 0) {
        setUseAveragePoints(true);
      } else {
        setUseAveragePoints(false);
      }
    } else {
      onSelect(letterScore);
      // Don't call onClose() - parent handles it after state updates
    }
  };

  const handleCustomPointsSubmit = () => {
    if (useAveragePoints && averagePoints !== null) {
      // Use average points
      onSelect(selectedLetterScore!, averagePoints);
    } else {
      // Use custom points
      const points = parseFloat(customPoints);
      if (isNaN(points) || points < 0.1) {
        return; // Invalid points
      }
      onSelect(selectedLetterScore!, points);
    }
    setShowCustomPoints(false);
    setSelectedLetterScore(null);
    setCustomPoints('');
    setUseAveragePoints(true);
    // Don't call onClose() - parent handles it after state updates
  };

  const handleCancel = () => {
    setShowCustomPoints(false);
    setSelectedLetterScore(null);
    setCustomPoints('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-4xl rounded-xl shadow-xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-orange-400" size={20} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Letter Scores
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {!showCustomPoints ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {letterScores.map((score) => (
                <button
                  key={score.code}
                  onClick={() => handleLetterScoreSelect(score.code)}
                  className={`
                    p-4 rounded-lg text-left transition-all hover:scale-[1.02] text-white relative
                    ${score.color}
                  `}
                >
                  <div className="mb-2">
                    <div className="font-bold text-xl">{score.code}</div>
                    <div className="text-sm opacity-90 leading-tight">{score.name}</div>
                  </div>
                  <div className="text-xs opacity-75 mb-2 leading-tight">
                    {score.description}
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="bg-black/20 text-white px-2 py-1 rounded-full text-xs font-medium">
                      {score.scoring}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Hash className="text-white" size={32} />
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {selectedLetterScore} - {selectedLetterScore === 'RDG' ? 'Redress' : 'Discretionary Penalty'}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Select points method for {skipperName} in Race {raceNumber}
                </p>
              </div>

              {/* Average Points Option (if available and > 1 race) */}
              {averagePoints !== null && skipperPreviousResults.length > 0 && (
                <div>
                  <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Points Method
                  </label>

                  {/* Average Points Card */}
                  <button
                    onClick={() => setUseAveragePoints(true)}
                    className={`
                      w-full p-4 rounded-lg border-2 text-left transition-all mb-3
                      ${useAveragePoints
                        ? 'border-green-500 bg-green-500/10'
                        : darkMode
                          ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                          : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            useAveragePoints
                              ? 'border-green-500 bg-green-500'
                              : darkMode ? 'border-slate-500' : 'border-slate-400'
                          }`}>
                            {useAveragePoints && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            Average Points (Recommended)
                          </span>
                        </div>
                        <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Based on {skipperPreviousResults.length} previous race{skipperPreviousResults.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${useAveragePoints ? 'text-green-500' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {averagePoints}
                        </div>
                        <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                          points
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Custom Points Card */}
                  <button
                    onClick={() => setUseAveragePoints(false)}
                    className={`
                      w-full p-4 rounded-lg border-2 text-left transition-all
                      ${!useAveragePoints
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode
                          ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                          : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        !useAveragePoints
                          ? 'border-blue-500 bg-blue-500'
                          : darkMode ? 'border-slate-500' : 'border-slate-400'
                      }`}>
                        {!useAveragePoints && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Custom Points
                      </span>
                    </div>
                    <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Enter specific points awarded by race committee
                    </p>
                  </button>
                </div>
              )}

              {/* Custom Points Input (shown if no average available or custom selected) */}
              {(!averagePoints || skipperPreviousResults.length === 0 || !useAveragePoints) && (
                <div>
                  {averagePoints === null || skipperPreviousResults.length === 0 ? (
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Points for {skipperName} in Race {raceNumber}
                    </label>
                  ) : null}
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customPoints}
                    onChange={(e) => setCustomPoints(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Enter points (e.g., 3 or 2.5)"
                    className={`
                      w-full px-4 py-3 rounded-lg border text-center text-lg font-bold
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}
                    `}
                    autoFocus={!useAveragePoints || !averagePoints}
                  />
                  <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {averagePoints === null || skipperPreviousResults.length === 0
                      ? 'Enter the points awarded by the race committee'
                      : 'Decimals allowed for precise scoring'}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className={`
                    flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                  `}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomPointsSubmit}
                  disabled={!useAveragePoints && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)}
                  className={`
                    flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors
                    ${(!useAveragePoints && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)) ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  Apply {selectedLetterScore}
                </button>
              </div>
            </div>
          )}
        </div>

        {!showCustomPoints && onWithdrawFromEvent && (
          <div className={`px-6 pb-4 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className={`p-4 rounded-lg border-2 border-dashed ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-slate-50'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h3 className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Withdraw from Event
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Mark {skipperName} as withdrawn from this event starting from Race {raceNumber}.
                    All subsequent races will automatically receive {'"'}Entrants + 1{'"'} points with their last handicap.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (onWithdrawFromEvent) {
                      onWithdrawFromEvent();
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap text-sm"
                >
                  Withdraw from Event
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`
          flex justify-end p-4 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={() => {
              onSelect(null);
              // Don't call onClose() - parent handles it immediately
            }}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
            `}
          >
            Clear Score
          </button>
        </div>
      </div>
    </div>
  );
};