import React, { useState } from 'react';
import { X, Hash, UserMinus, Eraser } from 'lucide-react';
import { AAvatar } from './alfie/Kit';
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

const letterScores: { code: LetterScore; name: string; description: string; color: string; scoring: string; tone?: string }[] = [
  { code: 'DNF', name: 'Did Not Finish', description: 'Started but did not finish', color: 'bg-orange-600', scoring: 'Heat +1', tone: '#FF8A2B' },
  { code: 'NSC', name: 'Not Sailed Course', description: 'Finished but course error', color: 'bg-orange-500', scoring: 'Heat +1', tone: '#FF8A2B' },
  { code: 'RET', name: 'Retired', description: 'Retired voluntarily', color: 'bg-amber-600', scoring: 'Heat +1', tone: '#FF8A2B' },
  { code: 'OCS', name: 'On Course Side', description: 'Started early, didn\'t return', color: 'bg-yellow-600', scoring: 'Heat +1', tone: '#FFB340' },
  { code: 'DNS', name: 'Did Not Start', description: 'Did not start the race', color: 'bg-red-600', scoring: 'Heat +1', tone: '#FF6B6B' },
  { code: 'DNC', name: 'Did Not Compete', description: 'Never present in race area', color: 'bg-red-700', scoring: 'Heat +1', tone: '#FF6B6B' },
  { code: 'UFD', name: 'U Flag DSQ', description: 'DSQ under rule 30.3 (U flag)', color: 'bg-rose-700', scoring: 'Entrant +1', tone: '#FF3E9A' },
  { code: 'BFD', name: 'Black Flag DSQ', description: 'DSQ under black flag rule 30.4', color: 'bg-gray-800', scoring: 'Entrant +1', tone: '#9AA6BD' },
  { code: 'DSQ', name: 'Disqualified', description: 'DSQ for rule violation', color: 'bg-red-800', scoring: 'Entrant +1', tone: '#FF6B6B' },
  { code: 'DNE', name: 'Non-Excludable DSQ', description: 'DSQ that cannot be dropped', color: 'bg-red-900', scoring: 'Entrant +1', tone: '#FF6B6B' },
  { code: 'WDN', name: 'Withdrawn', description: 'Formally withdrew from event', color: 'bg-slate-600', scoring: 'Entrant +1', tone: '#9AA6BD' },
  { code: 'RDG', name: 'Redress Given', description: 'Given redress by committee', color: 'bg-green-600', scoring: 'Custom', tone: '#30D158' },
  { code: 'DPI', name: 'Discretionary Penalty', description: 'Discretionary penalty imposed', color: 'bg-pink-600', scoring: 'Custom', tone: '#FF3E9A' },
  { code: 'ZFP', name: '20% Penalty', description: 'Rule 30.2 penalty (20%)', color: 'bg-teal-600', scoring: 'Custom', tone: '#40C8C0' },
  { code: 'SCP', name: 'Scoring Penalty', description: 'Scoring penalty under rule 44.3', color: 'bg-cyan-700', scoring: 'Custom', tone: '#2E7BFF' },
  { code: 'ROD', name: 'RO Duty', description: 'Taking turn as Race Officer', color: 'bg-sky-600', scoring: 'RO Duty', tone: '#0A84FF' }
];

type RdgMode = 'avg_event' | 'avg_penultimate' | 'avg_series' | 'manual';

const CUSTOM_POINTS_CODES: LetterScore[] = ['RDG', 'DPI', 'ZFP', 'SCP'];

export const LetterScoreSelector: React.FC<LetterScoreSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  onWithdrawFromEvent,
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
    if (letterScore === 'ROD') {
      onSelect(letterScore, -1);
      return;
    }
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



  const customTone = letterScores.find(l => l.code === selectedLetterScore)?.tone || '#9AA6BD';
  const nameParts = (skipperName || '').trim().split(/\s+/);

  const tileGroup = (label: string, scoring: string) => (
    <div>
      <p className="a-cap" style={{ margin: '0 0 8px' }}>{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {letterScores.filter(s => s.scoring === scoring).map((score) => (
          <button
            key={score.code}
            type="button"
            onClick={() => handleLetterScoreSelect(score.code)}
            className="a-lt"
            style={{ ['--c' as any]: score.tone }}
          >
            <b>{score.code}</b>
            <span>{score.name.split(' ').map((w, i) => (i === 0 || /^[A-Z]{1,3}$/.test(w) ? w : w.toLowerCase())).join(' ')}</span>
            <i>{score.description}</i>
            {scoring === 'RO Duty' && averagePoints !== null && <i>~{averagePoints} avg pts</i>}
          </button>
        ))}
      </div>
    </div>
  );

  const RdgOption: React.FC<{ mode: RdgMode; title: string; body: string; disabled?: boolean; value?: number | null; valueLabel?: string }> = ({ mode, title, body, disabled, value, valueLabel }) => (
    <button
      type="button"
      onClick={() => !disabled && setRdgMode(mode)}
      disabled={disabled}
      className={`a-acc w-full ${rdgMode === mode && !disabled ? 'a-acc-on' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingRight: 44 }}
    >
      <div className="flex-1 min-w-0">
        <div className="a-ink text-[14.5px] font-semibold">{title}</div>
        <div className="a-mute text-[12.5px] mt-1 leading-snug">{body}</div>
      </div>
      {value !== null && value !== undefined && (
        <div className="text-right flex-shrink-0">
          <div className="a-display a-ink text-[18px] font-semibold leading-none">~{value}</div>
          <div className="a-dim text-[11px] mt-1">{valueLabel}</div>
        </div>
      )}
      <span className="a-radio" />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <section className="a-sheet w-full max-w-[780px] max-h-[92vh] overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label="Letter scores">
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '20px 18px 16px 22px' }}>
          <AAvatar first={nameParts[0]} last={nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''} size={44} />
          <div className="flex-1 min-w-0">
            <p className="a-cap">Letter score · Race {raceNumber}</p>
            <div className="a-display a-ink text-[20px] font-semibold mt-0.5 truncate">{skipperName}</div>
          </div>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ padding: '0 22px 18px' }}>
          {!showCustomPoints ? (
            <>
              {tileGroup('Heat + 1', 'Heat +1')}
              {tileGroup('Entrants + 1', 'Entrant +1')}
              {tileGroup('Custom points', 'Custom')}
              {tileGroup('Race officer duty', 'RO Duty')}

              {onWithdrawFromEvent && (
                <div className="a-withdraw">
                  <span className="a-tile a-tile-sm" style={{ color: '#FFB340' }}><UserMinus size={17} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="a-ink text-[14.5px] font-semibold">Withdraw from event</div>
                    <div className="a-mute text-[12.5px] mt-1 leading-snug">
                      Marks {skipperName} as withdrawn from Race {raceNumber} onwards. Later races automatically get {'"'}Entrants + 1{'"'} with their last handicap.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onWithdrawFromEvent) {
                        onWithdrawFromEvent();
                      }
                    }}
                    className="a-btn a-btn-a"
                    style={{ height: 40 }}
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3.5">
                <span className="a-lt-badge" style={{ ['--c' as any]: customTone }}><Hash size={20} /></span>
                <div className="min-w-0">
                  <div className="a-display a-ink text-[18px] font-semibold">{selectedLetterScore} · {getCustomPointsTitle()}</div>
                  <div className="a-mute text-[13px] mt-0.5">Select points method for {skipperName} in Race {raceNumber}</div>
                </div>
              </div>

              {selectedLetterScore === 'RDG' ? (
                <div className="flex flex-col gap-2.5">
                  <p className="a-cap">{isSHRS ? 'SHRS redress method' : 'Scoring method'}</p>

                  {isSHRS ? (
                    <>
                      <RdgOption
                        mode="avg_event"
                        disabled={!canUseRdgAvg}
                        title={`RGA - Average of Prior Races ${canUseRdgAvg ? '(Default)' : ''}`}
                        body={!canUseRdgAvg
                          ? `Cannot be used in Round ${raceNumber} - requires at least 1 prior completed race.`
                          : 'Average of prior round scores in the same series phase.'}
                        value={canUseRdgAvg ? averagePoints : null}
                        valueLabel="current avg"
                      />
                      <RdgOption
                        mode="avg_series"
                        title="RGS - Average All Races in Series"
                        body="Average of all races in the series (Q or F) excluding races scored RGS. Can be used in any race including Race 1."
                        value={canUseRdgAvg ? averagePoints : null}
                        valueLabel="current avg"
                      />
                      <RdgOption
                        mode="manual"
                        title="RGP - Fixed Points (Protest Committee)"
                        body="Fixed redress points as determined by the protest committee (SHRS Rule 5.5). Enter specific score value."
                      />
                    </>
                  ) : (
                    <>
                      <RdgOption
                        mode="avg_event"
                        disabled={!canUseRdgAvg}
                        title={`RDGave - Average All Races ${canUseRdgAvg ? '(Default)' : ''}`}
                        body={!canUseRdgAvg
                          ? 'Requires at least 1 completed race before average can be calculated.'
                          : `Average of all ${isHeatRacing ? 'race scores (excluding R1 per HMS Rule 5.3)' : 'prior race scores'}. Recalculated at event completion.`}
                        value={canUseRdgAvg ? averagePoints : null}
                        valueLabel="current avg"
                      />
                      <RdgOption
                        mode="avg_penultimate"
                        title="RDGave - Average to Penultimate Day"
                        body={`Average of all races excluding the final day${isHeatRacing ? ' (R1 excluded per HMS Rule 5.3)' : ''}. Used for multi-day events.`}
                        value={penultimateDayAverage}
                        valueLabel="penultimate avg"
                      />
                      <RdgOption
                        mode="manual"
                        title="RDGfix - Fixed Points (Committee Set)"
                        body="Enter specific points determined by the race committee"
                      />
                    </>
                  )}
                </div>
              ) : (
                <p className="a-cap">Penalty points</p>
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
                    className="a-inp a-display text-center"
                    style={{ height: 54, fontSize: 22, fontWeight: 600 }}
                    autoFocus
                  />
                  <p className="a-dim text-[12px] mt-2">
                    Enter the points awarded by the race committee
                  </p>
                </div>
              )}

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="a-btn a-btn-q"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCustomPointsSubmit}
                  disabled={rdgMode === 'manual' && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)}
                  className={`a-btn a-btn-g ${(rdgMode === 'manual' && (!customPoints || isNaN(parseFloat(customPoints)) || parseFloat(customPoints) < 0.1)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Apply {selectedLetterScore}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="a-sheet-foot flex items-center gap-2.5 flex-shrink-0" style={{ padding: '14px 18px' }}>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              onSelect(null);
            }}
            className="a-btn a-btn-q a-txt-r"
          >
            <Eraser size={16} />
            Clear score
          </button>
        </div>
      </section>
    </div>
  );
};
