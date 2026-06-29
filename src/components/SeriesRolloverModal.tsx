import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, TriangleAlert as AlertTriangle, Check, ChevronRight, ChevronLeft, RotateCcw, Trophy } from 'lucide-react';
import { RaceSeries } from '../types/race';
import { getPublicEvents } from '../utils/publicEventStorage';
import { storeRaceSeries, getStoredRaceSeries } from '../utils/raceStorage';
import { useAuth } from '../contexts/AuthContext';

interface PublicEventConflict {
  event_name: string;
  date: string;
  end_date?: string;
  event_level?: string;
}

interface RolloverRound {
  name: string;
  originalDate: string;
  suggestedDate: string;
  venue: string;
  conflict?: PublicEventConflict;
}

interface RolloverSeriesConfig {
  series: RaceSeries;
  selected: boolean;
  newSeriesName: string;
  rounds: RolloverRound[];
}

interface SeriesRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  series: RaceSeries[];
  onComplete: () => void;
}

function getNextYearSameWeekday(dateStr: string): string {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  const nextYear = date.getFullYear() + 1;
  const candidateDate = new Date(nextYear, date.getMonth(), date.getDate());
  const candidateDay = candidateDate.getDay();
  let diff = dayOfWeek - candidateDay;
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  candidateDate.setDate(candidateDate.getDate() + diff);
  return candidateDate.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function isDateInRange(date: string, start: string, end?: string): boolean {
  const d = new Date(date);
  const s = new Date(start);
  if (end) {
    const e = new Date(end);
    return d >= s && d <= e;
  }
  return d.getTime() === s.getTime();
}

export const SeriesRolloverModal: React.FC<SeriesRolloverModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  series,
  onComplete
}) => {
  const { currentClub } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [configs, setConfigs] = useState<RolloverSeriesConfig[]>([]);
  const [publicEvents, setPublicEvents] = useState<PublicEventConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setError(null);

    const initialConfigs: RolloverSeriesConfig[] = series
      .filter(s => s.rounds.length > 0)
      .map(s => {
        const currentYear = new Date(s.rounds[0]?.date || '').getFullYear();
        const nextYear = currentYear + 1;
        return {
          series: s,
          selected: false,
          newSeriesName: s.seriesName.replace(
            String(currentYear),
            String(nextYear)
          ) === s.seriesName
            ? `${s.seriesName} ${nextYear}`
            : s.seriesName.replace(String(currentYear), String(nextYear)),
          rounds: s.rounds.map(r => ({
            name: r.name,
            originalDate: r.date,
            suggestedDate: getNextYearSameWeekday(r.date),
            venue: r.venue
          }))
        };
      });
    setConfigs(initialConfigs);

    const fetchPublicEvents = async () => {
      try {
        const events = await getPublicEvents();
        setPublicEvents(
          events.map(e => ({
            event_name: e.event_name,
            date: e.date,
            end_date: e.end_date,
            event_level: (e as any).event_level
          }))
        );
      } catch {
        setPublicEvents([]);
      }
    };
    fetchPublicEvents();
  }, [isOpen, series]);

  const selectedConfigs = useMemo(
    () => configs.filter(c => c.selected),
    [configs]
  );

  const conflictsForConfig = (config: RolloverSeriesConfig): number => {
    return config.rounds.filter(r =>
      publicEvents.some(e => isDateInRange(r.suggestedDate, e.date, e.end_date))
    ).length;
  };

  const totalConflicts = useMemo(
    () => selectedConfigs.reduce((sum, c) => sum + conflictsForConfig(c), 0),
    [selectedConfigs, publicEvents]
  );

  const handleToggleSeries = (index: number) => {
    setConfigs(prev => prev.map((c, i) =>
      i === index ? { ...c, selected: !c.selected } : c
    ));
  };

  const handleSelectAll = () => {
    const allSelected = configs.every(c => c.selected);
    setConfigs(prev => prev.map(c => ({ ...c, selected: !allSelected })));
  };

  const handleDateChange = (seriesIdx: number, roundIdx: number, newDate: string) => {
    setConfigs(prev => prev.map((c, si) => {
      if (si !== seriesIdx) return c;
      const newRounds = [...c.rounds];
      newRounds[roundIdx] = { ...newRounds[roundIdx], suggestedDate: newDate };
      return { ...c, rounds: newRounds };
    }));
  };

  const handleSeriesNameChange = (seriesIdx: number, newName: string) => {
    setConfigs(prev => prev.map((c, i) =>
      i === seriesIdx ? { ...c, newSeriesName: newName } : c
    ));
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      for (const config of selectedConfigs) {
        const newSeries: RaceSeries = {
          id: crypto.randomUUID(),
          clubName: config.series.clubName,
          seriesName: config.newSeriesName,
          raceClass: config.series.raceClass,
          raceFormat: config.series.raceFormat,
          rounds: config.rounds.map(r => ({
            name: r.name,
            date: r.suggestedDate,
            venue: r.venue,
            results: [],
            completed: false,
            lastCompletedRace: 0,
            hasDeterminedInitialHcaps: false,
            isManualHandicaps: false
          })),
          skippers: [],
          completed: false,
          dropRules: config.series.dropRules,
          numRaces: config.series.numRaces,
          scoringSystem: config.series.scoringSystem,
          noticeOfRaceUrl: null,
          sailingInstructionsUrl: null,
          clubId: config.series.clubId || currentClub?.clubId || undefined,
          enableLiveTracking: config.series.enableLiveTracking,
          enableLiveStream: config.series.enableLiveStream
        };
        await storeRaceSeries(newSeries);
      }
      onComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create series');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <RotateCcw className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={22} />
            <div>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Roll Over Series to Next Year
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Step {step} of 3
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
            <X size={20} />
          </button>
        </div>

        {/* Progress bar */}
        <div className={`h-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <Step1SelectSeries
              configs={configs}
              darkMode={darkMode}
              onToggle={handleToggleSeries}
              onSelectAll={handleSelectAll}
            />
          )}

          {step === 2 && (
            <Step2ReviewDates
              configs={selectedConfigs}
              publicEvents={publicEvents}
              darkMode={darkMode}
              onDateChange={(seriesIdx, roundIdx, date) => {
                const globalIdx = configs.findIndex(c => c === selectedConfigs[seriesIdx]);
                handleDateChange(globalIdx, roundIdx, date);
              }}
              onNameChange={(seriesIdx, name) => {
                const globalIdx = configs.findIndex(c => c === selectedConfigs[seriesIdx]);
                handleSeriesNameChange(globalIdx, name);
              }}
            />
          )}

          {step === 3 && (
            <Step3Confirm
              configs={selectedConfigs}
              totalConflicts={totalConflicts}
              darkMode={darkMode}
            />
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`
          flex items-center justify-between p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={step === 1 ? onClose : () => setStep(prev => (prev - 1) as 1 | 2 | 3)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:bg-slate-700'
                : 'text-slate-600 hover:bg-slate-100'}
            `}
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(prev => (prev + 1) as 1 | 2 | 3)}
              disabled={selectedConfigs.length === 0}
              className={`
                flex items-center gap-2 px-5 py-2 rounded-lg font-medium transition-colors
                ${selectedConfigs.length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-400 text-white cursor-not-allowed'}
              `}
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {creating ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Create {selectedConfigs.length} Series
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Step 1: Select series to roll over
const Step1SelectSeries: React.FC<{
  configs: RolloverSeriesConfig[];
  darkMode: boolean;
  onToggle: (idx: number) => void;
  onSelectAll: () => void;
}> = ({ configs, darkMode, onToggle, onSelectAll }) => {
  const allSelected = configs.length > 0 && configs.every(c => c.selected);
  const someSelected = configs.some(c => c.selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          Select the series you want to roll over to next year. Settings, venues, and round structure will be carried forward.
        </p>
        <button
          onClick={onSelectAll}
          className={`
            text-sm font-medium px-3 py-1.5 rounded-lg transition-colors
            ${darkMode ? 'text-blue-400 hover:bg-slate-700' : 'text-blue-600 hover:bg-blue-50'}
          `}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {configs.length === 0 ? (
        <div className={`
          text-center py-12 rounded-lg border
          ${darkMode ? 'bg-slate-700/50 border-slate-600 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}
        `}>
          <Trophy size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No series with rounds found</p>
          <p className="text-sm mt-1">Create series with scheduled rounds first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((config, idx) => {
            const sortedRounds = [...config.series.rounds].sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            const dateRange = sortedRounds.length > 0
              ? `${formatDisplayDate(sortedRounds[0].date)} - ${formatDisplayDate(sortedRounds[sortedRounds.length - 1].date)}`
              : '';

            return (
              <button
                key={config.series.id}
                onClick={() => onToggle(idx)}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-all
                  ${config.selected
                    ? darkMode
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-blue-500 bg-blue-50'
                    : darkMode
                      ? 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'}
                `}
              >
                <div className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                  ${config.selected
                    ? 'border-blue-500 bg-blue-500'
                    : darkMode ? 'border-slate-500' : 'border-slate-300'}
                `}>
                  {config.selected && <Check size={12} className="text-white" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {config.series.seriesName}
                    </h4>
                    <span className={`
                      px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0
                      ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-100 text-slate-600'}
                    `}>
                      {config.series.raceClass}
                    </span>
                  </div>
                  <div className={`flex items-center gap-4 mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {config.series.rounds.length} rounds
                    </span>
                    {dateRange && <span>{dateRange}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {someSelected && (
        <div className={`
          mt-4 p-3 rounded-lg text-sm
          ${darkMode ? 'bg-blue-900/20 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-100'}
        `}>
          {configs.filter(c => c.selected).length} series selected for rollover
        </div>
      )}
    </div>
  );
};

// Step 2: Review and adjust dates
const Step2ReviewDates: React.FC<{
  configs: RolloverSeriesConfig[];
  publicEvents: PublicEventConflict[];
  darkMode: boolean;
  onDateChange: (seriesIdx: number, roundIdx: number, date: string) => void;
  onNameChange: (seriesIdx: number, name: string) => void;
}> = ({ configs, publicEvents, darkMode, onDateChange, onNameChange }) => {
  const [expandedIdx, setExpandedIdx] = useState<number>(0);

  return (
    <div className="space-y-4">
      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        Review suggested dates for each round. Dates are matched to the same day of the week as the current year.
        Conflicts with National/State events are highlighted.
      </p>

      {configs.map((config, seriesIdx) => {
        const isExpanded = expandedIdx === seriesIdx;
        const conflicts = config.rounds.filter(r =>
          publicEvents.some(e => isDateInRange(r.suggestedDate, e.date, e.end_date))
        ).length;

        return (
          <div
            key={config.series.id}
            className={`
              rounded-lg border overflow-hidden
              ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'}
            `}
          >
            <button
              onClick={() => setExpandedIdx(isExpanded ? -1 : seriesIdx)}
              className={`
                w-full flex items-center justify-between p-4 text-left transition-colors
                ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}
              `}
            >
              <div className="flex items-center gap-3">
                <Trophy size={16} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {config.series.seriesName}
                </span>
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {config.rounds.length} rounds
                </span>
                {conflicts > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertTriangle size={12} />
                    {conflicts} conflict{conflicts > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <ChevronRight
                size={16}
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
            </button>

            {isExpanded && (
              <div className={`p-4 border-t space-y-4 ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                {/* Series name input */}
                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    New Series Name
                  </label>
                  <input
                    type="text"
                    value={config.newSeriesName}
                    onChange={e => onNameChange(seriesIdx, e.target.value)}
                    className={`
                      w-full px-3 py-2 rounded-lg text-sm transition-colors
                      ${darkMode
                        ? 'bg-slate-800 text-slate-200 border border-slate-600 focus:border-blue-500'
                        : 'bg-white text-slate-900 border border-slate-200 focus:border-blue-500'}
                      outline-none
                    `}
                  />
                </div>

                {/* Rounds table */}
                <div className="space-y-2">
                  <div className={`grid grid-cols-[1fr_140px_20px_140px_1fr] gap-2 items-center text-xs font-medium px-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span>Round</span>
                    <span>Original Date</span>
                    <span></span>
                    <span>New Date</span>
                    <span>Conflict</span>
                  </div>

                  {config.rounds.map((round, roundIdx) => {
                    const conflict = publicEvents.find(e =>
                      isDateInRange(round.suggestedDate, e.date, e.end_date)
                    );
                    return (
                      <div
                        key={roundIdx}
                        className={`
                          grid grid-cols-[1fr_140px_20px_140px_1fr] gap-2 items-center p-2 rounded-lg
                          ${conflict
                            ? darkMode
                              ? 'bg-amber-900/15 border border-amber-500/20'
                              : 'bg-amber-50 border border-amber-200'
                            : darkMode
                              ? 'bg-slate-800/50'
                              : 'bg-slate-50'}
                        `}
                      >
                        <span className={`text-sm font-medium truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          {round.name}
                        </span>
                        <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {formatDisplayDate(round.originalDate)}
                        </span>
                        <ChevronRight size={12} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                        <input
                          type="date"
                          value={round.suggestedDate}
                          onChange={e => onDateChange(seriesIdx, roundIdx, e.target.value)}
                          className={`
                            px-2 py-1.5 rounded text-xs transition-colors outline-none
                            ${conflict
                              ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-500/50'
                              : darkMode
                                ? 'bg-slate-700 text-slate-200 border border-slate-600 focus:border-blue-500'
                                : 'bg-white text-slate-900 border border-slate-200 focus:border-blue-500'}
                          `}
                        />
                        <div>
                          {conflict ? (
                            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <AlertTriangle size={11} />
                              <span className="truncate">{conflict.event_name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-green-600 dark:text-green-400">No conflict</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Step 3: Confirm and create
const Step3Confirm: React.FC<{
  configs: RolloverSeriesConfig[];
  totalConflicts: number;
  darkMode: boolean;
}> = ({ configs, totalConflicts, darkMode }) => {
  return (
    <div className="space-y-6">
      <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        Review the summary below and click "Create" to generate the new series.
      </p>

      {totalConflicts > 0 && (
        <div className={`
          flex items-start gap-3 p-4 rounded-lg
          ${darkMode ? 'bg-amber-900/15 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}
        `}>
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
              {totalConflicts} date conflict{totalConflicts > 1 ? 's' : ''} detected
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400/80' : 'text-amber-700'}`}>
              Some round dates clash with National or State events. You can go back to adjust dates, or proceed and modify later.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {configs.map(config => (
          <div
            key={config.series.id}
            className={`
              p-4 rounded-lg border
              ${darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}
            `}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {config.newSeriesName}
              </h4>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                  {config.series.raceClass}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  config.series.raceFormat === 'handicap'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  {config.series.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                </span>
              </div>
            </div>

            <div className={`text-xs space-y-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <p>{config.rounds.length} rounds scheduled</p>
              {config.rounds.length > 0 && (
                <p>
                  {formatDisplayDate(config.rounds[0].suggestedDate)} &mdash; {formatDisplayDate(config.rounds[config.rounds.length - 1].suggestedDate)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={`
        p-4 rounded-lg border
        ${darkMode ? 'border-green-500/20 bg-green-900/10' : 'border-green-200 bg-green-50'}
      `}>
        <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
          The following settings will be carried over from the original series:
        </p>
        <ul className={`mt-2 text-xs space-y-1 ${darkMode ? 'text-green-400/80' : 'text-green-600'}`}>
          <li>- Race class and format</li>
          <li>- Venues for each round</li>
          <li>- Drop rules and scoring system</li>
          <li>- Live tracking and streaming settings</li>
        </ul>
      </div>
    </div>
  );
};
