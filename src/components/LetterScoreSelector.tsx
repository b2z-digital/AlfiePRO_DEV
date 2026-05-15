import React, { useState } from 'react';
import { X, TriangleAlert as AlertTriangle, Hash } from 'lucide-react';
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
  skipperPreviousResults?: Array<{ position: number | null; letterScore?: string; customPoints?: number; points: number; raceNumber?: number }>;
  isHeatRacing?: boolean;
  hasCompletedRaces?: boolean;
  isMultiDay?: boolean;
  numberOfDays?: number;
  currentDay?: number;
  racesPerDay?: Record<number, number[]>;
  scoringSystem?: 'shrs' | 'hms';
}

const letterScores: { code: LetterScore; name: string; description: string; color: string; scoring: string }[] = [
  { code: 'DNF', name: 'Did Not Finish', description: 'Started but did not finish', color: 'bg-orange-600', scoring: 'Heat +1' },
  { code: 'NSC', name: 'Not Sailed Course', description: 'Finished but course error', color: 'bg-orange-500', scoring: 'Heat +1' },
  { code: 'RET', name: 'Retired', description: 'Retired voluntarily', color: 'bg-amber-600', scoring: 'Heat +1' },
  { code: 'OCS', name: 'On Course Side', description: 'Started early, didn\'t return', color: 'bg-yellow-600', scoring: 'Heat +1' },
  { code: 'DNS', name: 'Did Not Start', description: 'Did not start the race', color: 'bg-red-600', scoring: 'Heat +1' },
  { code: 'DNC', name: 'Did Not Compete', description: 'Never present in race area', color: 'bg-red-700', scoring: 'Heat +1' },
  { code: 'UFD', name: 'U Flag DSQ', description: 'DSQ under rule 30.3 (U flag)', color: 'bg-rose-700', scoring: 'Entrant +1' },
  { code: 'BFD', name: 'Black Flag DSQ', description: 'DSQ under black flag rule 30.4', color: 'bg-gray-800', scoring: 'Entrant +1' },
  { code: 'DSQ', name: 'Disqualified', description: 'DSQ for rule violation', color: 'bg-red-800', scoring: 'Entrant +1' },
  { code: 'DNE', name: 'Non-Excludable DSQ', description: 'DSQ that cannot be dropped', color: 'bg-red-900', scoring: 'Entrant +1' },
  { code: 'WDN', name: 'Withdrawn', description: 'Formally withdrew from event', color: 'bg-slate-600', scoring: 'Entrant +1' },
  { code: 'RDG', name: 'Redress Given', description: 'Given redress by committee', color: 'bg-green-600', scoring: 'Custom' },
  { code: 'DPI', name: 'Discretionary Penalty', description: 'Discretionary penalty imposed', color: 'bg-pink-600', scoring: 'Custom' },
  { code: 'ZFP', name: '20% Penalty', description: 'Rule 30.2 penalty (20%)', color: 'bg-teal-600', scoring: 'Custom' },
  { code: 'SCP', name: 'Scoring Penalty', description: 'Scoring penalty under rule 44.3', color: 'bg-cyan-700', scoring: 'Custom' }
];

type RdgMode = 'avg_event' | 'avg_penultimate' | 'avg_series' | 'manual';

const CUSTOM_POINTS_CODES: LetterScore[] = ['RDG', 'DPI', 'ZFP', 'SCP'];

export const LetterScoreSelector: React.FC<LetterScoreSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  onWithdrawFromEvent,
  darkMode,
  skipperName,
  raceNumber,
  skipperPreviousResults = [],
  isHeatRacing = false,
  hasCompletedRaces = false,
  isMultiDay = false,
  numberOfDays = 1,
  currentDay = 1,
  racesPerDay = {},
  scoringSystem
}) => {
  const isSHRS = scoringSystem === 'shrs';
  const [selectedLetterScore, setSelectedLetterScore] = useState<LetterScore | null>(null);
  const [showCustomPoints, setShowCustomPoints] = useState(false);
  const [customPoints, setCustomPoints] = useState<string>('');
  const [rdgMode, setRdgMode] = useState<RdgMode>('avg_event');

  const getFilteredResults = (excludeR1ForHeat: boolean, excludeFinalDay: boolean) => {
    if (!skipperPreviousResults || skipperPreviousResults.length === 0) {
      return [];
    }

    let results = [...skipperPreviousResults];

    // HMS excludes R1 from average; SHRS does NOT (SHRS Rule 5.6 averages all rounds in phase)
    if (excludeR1ForHeat && isHeatRacing && !isSHRS) {
      results = results.filter(r => r.raceNumber !== 1);
    }

    if (excludeFinalDay && isMultiDay && numberOfDays > 1) {
      const finalDayRaces = racesPerDay[numberOfDays] || racesPerDay[currentDay] || [];
      if (finalDayRaces.length > 0) {
        results = results.filter(r => !finalDayRaces.includes(r.raceNumber || 0));
      }
    }

    return results.filter(result => {
      if (result.position !== null && result.position > 0) return true;
      if ((result.letterScore === 'RDG' || result.letterScore === 'DPI') && result.customPoints && result.customPoints > 0) return true;
      return false;
    });
  };

  const calculateAveragePoints = (excludeR1ForHeat = false, excludeFinalDay = false): number | null => {
    const validResults = getFilteredResults(excludeR1ForHeat, excludeFinalDay);
    if (validResults.length === 0) return null;

    const totalPoints = validResults.reduce((sum, result) => sum + result.points, 0);
    const average = totalPoints / validResults.length;
    return Math.round(average * 10) / 10;
  };

  const averagePoints = calculateAveragePoints(isHeatRacing && !isSHRS, false);
  const penultimateDayAverage = calculateAveragePoints(isHeatRacing && !isSHRS, true);
  const canUseRdgAvg = hasCompletedRaces;

  const handleLetterScoreSelect = (letterScore: LetterScore) => {
    if (letterScore === 'RDG') {
      setSelectedLetterScore(letterScore);
      setShowCustomPoints(true);
      setRdgMode(hasCompletedRaces ? 'avg_event' : isSHRS ? 'avg_series' : 'manual');
    } else if (CUSTOM_POINTS_CODES.includes(letterScore)) {
      setSelectedLetterScore(letterScore);
      setShowCustomPoints(true);
      setRdgMode('manual');
    } else {
      onSelect(letterScore);
    }
  };

  const handleCustomPointsSubmit = () => {
    if (selectedLetterScore === 'RDG' && rdgMode === 'avg_event') {
      onSelect(selectedLetterScore!, -1);
    } else if (selectedLetterScore === 'RDG' && rdgMode === 'avg_penultimate') {
      onSelect(selectedLetterScore!, -2);
    } else if (selectedLetterScore === 'RDG' && rdgMode === 'avg_series') {
      onSelect(selectedLetterScore!, -3);
    } else {
      const points = parseFloat(customPoints);
      if (isNaN(points) || points < 0.1) {
        return;
      }
      onSelect(selectedLetterScore!, points);
    }
    setShowCustomPoints(false);
    setSelectedLetterScore(null);
    setCustomPoints('');
    setRdgMode('avg_event');
  };

  const handleCancel = () => {
    setShowCustomPoints(false);
    setSelectedLetterScore(null);
    setCustomPoints('');
  };

  if (!isOpen) return null;

  const getCustomPointsTitle = () => {
    switch (selectedLetterScore) {
      case 'RDG': return 'Redress';
      case 'DPI': return 'Discretionary Penalty';
      case 'ZFP': return '20% Penalty';
      case 'SCP': return 'Scoring Penalty';
      default: return 'Custom Points';
    }
  };

  const getCustomPointsColor = () => {
    switch (selectedLetterScore) {
      case 'RDG': return 'bg-green-600';
      case 'DPI': return 'bg-pink-600';
      case 'ZFP': return 'bg-teal-600';
      case 'SCP': return 'bg-cyan-700';
      default: return 'bg-slate-600';
    }
  };

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
            <>
              <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                HEAT + 1 SCORES
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                {letterScores.filter(s => s.scoring === 'Heat +1').map((score) => (
                  <button
                    key={score.code}
                    onClick={() => handleLetterScoreSelect(score.code)}
                    className={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] text-white relative ${score.color}`}
                  >
                    <div className="font-bold text-lg">{score.code}</div>
                    <div className="text-[11px] opacity-90 leading-tight">{score.name}</div>
                    <div className="text-[10px] opacity-70 mt-1 leading-tight">{score.description}</div>
                  </button>
                ))}
              </div>

              <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                ENTRANT + 1 SCORES
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                {letterScores.filter(s => s.scoring === 'Entrant +1').map((score) => (
                  <button
                    key={score.code}
                    onClick={() => handleLetterScoreSelect(score.code)}
                    className={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] text-white relative ${score.color}`}
                  >
                    <div className="font-bold text-lg">{score.code}</div>
                    <div className="text-[11px] opacity-90 leading-tight">{score.name}</div>
                    <div className="text-[10px] opacity-70 mt-1 leading-tight">{score.description}</div>
                  </button>
                ))}
              </div>

              <div className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                CUSTOM POINTS
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {letterScores.filter(s => s.scoring === 'Custom').map((score) => (
                  <button
                    key={score.code}
                    onClick={() => handleLetterScoreSelect(score.code)}
                    className={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] text-white relative ${score.color}`}
                  >
                    <div className="font-bold text-lg">{score.code}</div>
                    <div className="text-[11px] opacity-90 leading-tight">{score.name}</div>
                    <div className="text-[10px] opacity-70 mt-1 leading-tight">{score.description}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${getCustomPointsColor()}`}>
                  <Hash className="text-white" size={32} />
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {selectedLetterScore} - {getCustomPointsTitle()}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Select points method for {skipperName} in Race {raceNumber}
                </p>
              </div>

              {selectedLetterScore === 'RDG' ? (
                <div>
                  <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {isSHRS ? 'SHRS Redress Method' : 'Scoring Method'}
                  </label>

                  {isSHRS ? (
                    <>
                      {/* SHRS Option 1: Average all races in the series/phase */}
                      <button
                        onClick={() => canUseRdgAvg && setRdgMode('avg_event')}
                        disabled={!canUseRdgAvg}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all mb-3
                          ${!canUseRdgAvg
                            ? darkMode
                              ? 'border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed'
                              : 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                            : rdgMode === 'avg_event'
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
                                !canUseRdgAvg
                                  ? darkMode ? 'border-slate-600' : 'border-slate-300'
                                  : rdgMode === 'avg_event'
                                    ? 'border-green-500 bg-green-500'
                                    : darkMode ? 'border-slate-500' : 'border-slate-400'
                              }`}>
                                {rdgMode === 'avg_event' && canUseRdgAvg && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <span className={`font-semibold ${!canUseRdgAvg ? (darkMode ? 'text-slate-500' : 'text-slate-400') : darkMode ? 'text-white' : 'text-slate-900'}`}>
                                RGA - Average of Prior Races {canUseRdgAvg ? '(Default)' : ''}
                              </span>
                            </div>
                            <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {!canUseRdgAvg
                                ? 'Cannot be used in Race 1 - requires at least 1 prior completed race.'
                                : 'Average of prior round scores in the same series phase. Cannot be used in Race 1.'}
                            </p>
                          </div>
                          {canUseRdgAvg && averagePoints !== null && (
                            <div className="text-right ml-3">
                              <div className={`text-lg font-bold ${rdgMode === 'avg_event' ? 'text-green-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ~{averagePoints}
                              </div>
                              <div className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                current avg
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* SHRS Option 2: Average all races in series (RGS) - always available */}
                      <button
                        onClick={() => setRdgMode('avg_series')}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all mb-3
                          ${rdgMode === 'avg_series'
                            ? 'border-amber-500 bg-amber-500/10'
                            : darkMode
                              ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                              : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                rdgMode === 'avg_series'
                                  ? 'border-amber-500 bg-amber-500'
                                  : darkMode ? 'border-slate-500' : 'border-slate-400'
                              }`}>
                                {rdgMode === 'avg_series' && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                RGS - Average All Races in Series
                              </span>
                            </div>
                            <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Average of all races in the series (Q or F) excluding races scored RGS. Can be used in any race including Race 1.
                            </p>
                          </div>
                          {canUseRdgAvg && averagePoints !== null && (
                            <div className="text-right ml-3">
                              <div className={`text-lg font-bold ${rdgMode === 'avg_series' ? 'text-amber-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ~{averagePoints}
                              </div>
                              <div className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                current avg
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* SHRS Option 3: Fixed points (RGP / committee determined) */}
                      <button
                        onClick={() => setRdgMode('manual')}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all
                          ${rdgMode === 'manual'
                            ? 'border-blue-500 bg-blue-500/10'
                            : darkMode
                              ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                              : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                        `}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            rdgMode === 'manual'
                              ? 'border-blue-500 bg-blue-500'
                              : darkMode ? 'border-slate-500' : 'border-slate-400'
                          }`}>
                            {rdgMode === 'manual' && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            RGP - Fixed Points (Protest Committee)
                          </span>
                        </div>
                        <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Fixed redress points as determined by the protest committee (SHRS Rule 5.5). Enter specific score value.
                        </p>
                      </button>
                    </>
                  ) : (
                    <>
                      {/* HMS/Standard Option 1: Average all races */}
                      <button
                        onClick={() => canUseRdgAvg && setRdgMode('avg_event')}
                        disabled={!canUseRdgAvg}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all mb-3
                          ${!canUseRdgAvg
                            ? darkMode
                              ? 'border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed'
                              : 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                            : rdgMode === 'avg_event'
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
                                !canUseRdgAvg
                                  ? darkMode ? 'border-slate-600' : 'border-slate-300'
                                  : rdgMode === 'avg_event'
                                    ? 'border-green-500 bg-green-500'
                                    : darkMode ? 'border-slate-500' : 'border-slate-400'
                              }`}>
                                {rdgMode === 'avg_event' && canUseRdgAvg && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <span className={`font-semibold ${!canUseRdgAvg ? (darkMode ? 'text-slate-500' : 'text-slate-400') : darkMode ? 'text-white' : 'text-slate-900'}`}>
                                RDGave - Average All Races {canUseRdgAvg ? '(Default)' : ''}
                              </span>
                            </div>
                            <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {!canUseRdgAvg
                                ? 'Requires at least 1 completed race before average can be calculated.'
                                : `Average of all ${isHeatRacing ? 'race scores (excluding R1 per HMS Rule 5.3)' : 'prior race scores'}. Recalculated at event completion.`}
                            </p>
                          </div>
                          {canUseRdgAvg && averagePoints !== null && (
                            <div className="text-right ml-3">
                              <div className={`text-lg font-bold ${rdgMode === 'avg_event' ? 'text-green-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ~{averagePoints}
                              </div>
                              <div className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                current avg
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* HMS/Standard Option 2: Average to penultimate day */}
                      <button
                        onClick={() => setRdgMode('avg_penultimate')}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all mb-3
                          ${rdgMode === 'avg_penultimate'
                            ? 'border-amber-500 bg-amber-500/10'
                            : darkMode
                              ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                              : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                rdgMode === 'avg_penultimate'
                                  ? 'border-amber-500 bg-amber-500'
                                  : darkMode ? 'border-slate-500' : 'border-slate-400'
                              }`}>
                                {rdgMode === 'avg_penultimate' && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                RDGave - Average to Penultimate Day
                              </span>
                            </div>
                            <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Average of all races excluding the final day{isHeatRacing ? ' (R1 excluded per HMS Rule 5.3)' : ''}. Used for multi-day events.
                            </p>
                          </div>
                          {penultimateDayAverage !== null && (
                            <div className="text-right ml-3">
                              <div className={`text-lg font-bold ${rdgMode === 'avg_penultimate' ? 'text-amber-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                ~{penultimateDayAverage}
                              </div>
                              <div className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                penultimate avg
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* HMS/Standard Option 3: Fixed points */}
                      <button
                        onClick={() => setRdgMode('manual')}
                        className={`
                          w-full p-4 rounded-lg border-2 text-left transition-all
                          ${rdgMode === 'manual'
                            ? 'border-blue-500 bg-blue-500/10'
                            : darkMode
                              ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                              : 'border-slate-300 bg-slate-50 hover:border-slate-400'}
                        `}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            rdgMode === 'manual'
                              ? 'border-blue-500 bg-blue-500'
                              : darkMode ? 'border-slate-500' : 'border-slate-400'
                          }`}>
                            {rdgMode === 'manual' && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            RDGfix - Fixed Points (Committee Set)
                          </span>
                        </div>
                        <p className={`text-sm ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Enter specific points determined by the race committee
                        </p>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Penalty Points
                  </label>
                </div>
              )}

              {rdgMode === 'manual' && (
                <div>
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
                    autoFocus
                  />
                  <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Enter the points awarded by the race committee
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
                  disabled={rdgMode === 'manual' && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)}
                  className={`
                    flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors
                    ${(rdgMode === 'manual' && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)) ? 'opacity-50 cursor-not-allowed' : ''}
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
