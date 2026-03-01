import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  X, Upload, FileSpreadsheet, ClipboardPaste, CheckCircle, AlertCircle,
  Loader, ArrowRight, ArrowLeft, UserCheck, UserPlus, Search
} from 'lucide-react';
import {
  ParsedResults, ColumnMapping, SkipperMatch, RaceColumnInfo,
  parseTSVData, autoDetectMappings, detectRaceColumns,
  matchSkippersToMembers, buildSkippersArray, buildRoundResults,
  RESULTS_FIELD_OPTIONS, parseHTMLTable, isHTMLContent
} from '../utils/importResultsUtils';
import { RaceEvent, RaceSeries } from '../types/race';
import { supabase } from '../utils/supabase';
import { storeRaceSeries, storeRaceEvent } from '../utils/raceStorage';

interface ImportRoundResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  series?: RaceSeries;
  roundIndex?: number;
  event?: RaceEvent;
  onImportComplete: () => void;
}

type ImportStep = 'paste' | 'mapping' | 'matching' | 'preview' | 'importing' | 'complete';

export const ImportRoundResultsModal: React.FC<ImportRoundResultsModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  series,
  roundIndex = 0,
  event,
  onImportComplete,
}) => {
  const [step, setStep] = useState<ImportStep>('paste');
  const [pasteData, setPasteData] = useState('');
  const [parsed, setParsed] = useState<ParsedResults | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [raceColumns, setRaceColumns] = useState<RaceColumnInfo[]>([]);
  const [skipperMatches, setSkipperMatches] = useState<SkipperMatch[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState<Record<number, string>>({});
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [numRacesInRound, setNumRacesInRound] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSeriesMode = !!series;
  const round = series?.rounds?.[roundIndex];
  const displayName = isSeriesMode
    ? `${round?.name} - ${series?.seriesName}`
    : event?.eventName || event?.clubName || 'Event';

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
    }
  }, [isOpen]);

  const fetchMembers = async () => {
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) return;

    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, boats:member_boats(id, sail_number, boat_type, hull)')
      .eq('club_id', currentClubId);

    if (data) setMembers(data);
  };

  const handlePaste = useCallback(() => {
    if (!pasteData.trim()) {
      setError('Please paste or upload your results data');
      return;
    }

    setError(null);
    const result = parseTSVData(pasteData);

    if (result.rows.length === 0) {
      setError('No data rows found. Make sure your data includes headers and at least one row.');
      return;
    }

    if (result.headers.length < 2) {
      setError('Could not detect columns. Make sure data is tab or comma separated.');
      return;
    }

    setParsed(result);
    const detected = autoDetectMappings(result.headers, result.rows);
    setMappings(detected);
    setStep('mapping');
  }, [pasteData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteData(text);
      }
    };
    reader.readAsText(file);
  };

  const handlePasteEvent = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const htmlData = e.clipboardData.getData('text/html');
    if (htmlData && htmlData.includes('<table')) {
      e.preventDefault();
      const result = parseHTMLTable(htmlData);
      if (result.headers.length >= 2 && result.rows.length > 0) {
        setParsed(result);
        const detected = autoDetectMappings(result.headers, result.rows);
        setMappings(detected);
        setError(null);
        setStep('mapping');
        return;
      }
    }
  }, []);

  const handleMappingChange = (csvField: string, targetField: string) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.csvField === csvField) {
          if (targetField.startsWith('race_')) {
            return { ...m, mappedTo: targetField, confidence: 'high' };
          }
          return { ...m, mappedTo: targetField || null, confidence: targetField ? 'high' : 'none' };
        }
        return m;
      })
    );
  };

  const handleMappingNext = () => {
    const hasName = mappings.some(m => m.mappedTo === 'skipper_name');
    const races = detectRaceColumns(mappings);

    if (!hasName) {
      setError('You must map at least a "Skipper Name" column');
      return;
    }
    if (races.length === 0) {
      setError('You must map at least one race column (e.g., R1, R2...)');
      return;
    }

    setError(null);
    setRaceColumns(races);
    setNumRacesInRound(races.length);

    if (parsed) {
      const matches = matchSkippersToMembers(parsed.rows, mappings, members);
      setSkipperMatches(matches);
    }

    setStep('matching');
  };

  const handleMatchChange = (rowIndex: number, field: keyof SkipperMatch, value: any) => {
    setSkipperMatches(prev =>
      prev.map(m => {
        if (m.rowIndex === rowIndex) {
          const updated = { ...m, [field]: value };
          if (field === 'selectedMemberId' && value) {
            const member = members.find(mem => mem.id === value);
            if (member) {
              updated.matchedMember = member;
              updated.selectedAction = 'member';
            }
          }
          return updated;
        }
        return m;
      })
    );
  };

  const handlePreview = () => {
    setStep('preview');
  };

  const handleImport = async () => {
    if (!parsed) return;

    setStep('importing');
    setImportProgress(0);
    setError(null);

    try {
      setImportProgress(20);

      const skippers = buildSkippersArray(skipperMatches, members);
      setImportProgress(40);

      const results = buildRoundResults(parsed.rows, raceColumns, mappings);
      setImportProgress(60);

      if (isSeriesMode && series) {
        const updatedRounds = [...series.rounds];
        updatedRounds[roundIndex] = {
          ...updatedRounds[roundIndex],
          skippers,
          results,
          raceResults: undefined,
          completed: true,
          lastCompletedRace: numRacesInRound,
          hasDeterminedInitialHcaps: true,
          isManualHandicaps: true,
          numRaces: numRacesInRound,
        };

        const updatedSeries: RaceSeries = {
          ...series,
          rounds: updatedRounds,
        };

        setImportProgress(80);
        await storeRaceSeries(updatedSeries);
      } else if (event) {
        const updatedEvent: RaceEvent = {
          ...event,
          skippers,
          raceResults: results,
          completed: true,
          lastCompletedRace: numRacesInRound,
          hasDeterminedInitialHcaps: true,
          isManualHandicaps: true,
          numRaces: numRacesInRound,
        };

        setImportProgress(80);
        await storeRaceEvent(updatedEvent);
      }

      setImportProgress(100);
      setStep('complete');
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during import');
      setStep('preview');
    }
  };

  const getFilteredMembers = (rowIndex: number) => {
    const search = (memberSearch[rowIndex] || '').toLowerCase();
    if (!search) return members.slice(0, 20);
    return members.filter(m =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search) ||
      m.boats?.some((b: any) => (b.sail_number || '').toLowerCase().includes(search))
    ).slice(0, 20);
  };

  const getMatchStatusColor = (match: SkipperMatch) => {
    switch (match.matchType) {
      case 'exact-sail': return 'text-green-500';
      case 'exact-name': return 'text-green-500';
      case 'fuzzy-name': return 'text-amber-500';
      case 'none': return 'text-red-400';
    }
  };

  const getMatchStatusLabel = (match: SkipperMatch) => {
    switch (match.matchType) {
      case 'exact-sail': return 'Matched by sail number';
      case 'exact-name': return 'Matched by name';
      case 'fuzzy-name': return 'Possible match';
      case 'none': return 'No match found';
    }
  };

  const maxRaceNum = raceColumns.length > 0 ? Math.max(...raceColumns.map(r => r.raceNumber)) : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className={`
        w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Header */}
        <div className={`
          flex items-center justify-between p-5 border-b shrink-0
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Import Results
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {displayName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Steps */}
        <div className={`
          flex items-center gap-1 px-5 py-3 border-b shrink-0
          ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50'}
        `}>
          {(['paste', 'mapping', 'matching', 'preview'] as const).map((s, i) => {
            const labels = ['Paste Data', 'Map Columns', 'Match Skippers', 'Preview & Import'];
            const stepOrder = ['paste', 'mapping', 'matching', 'preview', 'importing', 'complete'];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = stepOrder.indexOf(s);
            const isActive = step === s;
            const isDone = currentIdx > thisIdx;

            return (
              <React.Fragment key={s}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 rounded ${
                    isDone ? 'bg-blue-500' : darkMode ? 'bg-slate-600' : 'bg-slate-200'
                  }`} />
                )}
                <div className="flex items-center gap-2">
                  <div className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    ${isDone
                      ? 'bg-blue-500 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                        : darkMode
                          ? 'bg-slate-600 text-slate-400'
                          : 'bg-slate-200 text-slate-500'}
                  `}>
                    {isDone ? <CheckCircle size={14} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    isActive
                      ? darkMode ? 'text-blue-400' : 'text-blue-600'
                      : isDone
                        ? darkMode ? 'text-slate-300' : 'text-slate-600'
                        : darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {labels[i]}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Paste Data */}
          {step === 'paste' && (
            <div className="space-y-4">
              <div className={`
                p-4 rounded-lg border
                ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-blue-50 border-blue-100'}
              `}>
                <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-blue-800'}`}>
                  How to import your results
                </h3>
                <ol className={`text-sm space-y-1 list-decimal list-inside ${darkMode ? 'text-slate-300' : 'text-blue-700'}`}>
                  <li>Open your results (spreadsheet, HTML results page, or CSV file)</li>
                  <li>Select all the data including headers (Ctrl+A or Cmd+A)</li>
                  <li>Copy (Ctrl+C or Cmd+C)</li>
                  <li>Click in the text area below and paste (Ctrl+V or Cmd+V)</li>
                </ol>
                <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-blue-600'}`}>
                  Supports: Excel, Google Sheets, CSV, HTML results tables, and space-separated results
                </p>
              </div>

              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  onPaste={handlePasteEvent}
                  placeholder="Paste your results data here...&#10;&#10;Supports: Spreadsheet data, CSV, HTML tables&#10;&#10;Example:&#10;Name&#9;Sail No&#9;R1&#9;R2&#9;R3&#10;John Smith&#9;1234&#9;1&#9;3&#9;2&#10;Jane Doe&#9;5678&#9;2&#9;1&#9;DNS"
                  className={`
                    w-full h-64 p-4 rounded-lg font-mono text-sm resize-none
                    ${darkMode
                      ? 'bg-slate-900 text-slate-200 border-slate-600 placeholder-slate-500'
                      : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'}
                    border focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  `}
                />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.readText().then(text => {
                        setPasteData(text);
                      }).catch(() => {
                        textareaRef.current?.focus();
                      });
                    }}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                    `}
                  >
                    <ClipboardPaste size={14} />
                    Paste
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex-1 h-px ${darkMode ? 'bg-slate-600' : 'bg-slate-200'}`} />
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>or</span>
                <div className={`flex-1 h-px ${darkMode ? 'bg-slate-600' : 'bg-slate-200'}`} />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.html,.htm"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed transition-colors
                    ${darkMode
                      ? 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                      : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-600'}
                  `}
                >
                  <Upload size={18} />
                  <span className="text-sm font-medium">Upload CSV or HTML file</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && parsed && (
            <div className="space-y-4">
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                We detected <span className="font-semibold">{parsed.headers.length}</span> columns and{' '}
                <span className="font-semibold">{parsed.rows.length}</span> rows.
                Map each column to the correct field. Columns with race positions should be mapped to R1, R2, etc.
              </p>

              <div className="space-y-2">
                {mappings.map((mapping) => {
                  const isRace = mapping.mappedTo?.startsWith('race_');
                  return (
                    <div
                      key={mapping.csvField}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg
                        ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {mapping.csvField}
                        </div>
                        {mapping.sampleData && (
                          <div className={`text-xs truncate mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            e.g., "{mapping.sampleData}"
                          </div>
                        )}
                      </div>

                      <ArrowRight size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />

                      <div className="flex-1">
                        <select
                          value={mapping.mappedTo || ''}
                          onChange={(e) => handleMappingChange(mapping.csvField, e.target.value)}
                          className={`
                            w-full px-3 py-2 rounded-lg text-sm transition-colors
                            ${darkMode
                              ? 'bg-slate-800 text-slate-200 border-slate-600'
                              : 'bg-white text-slate-900 border-slate-300'}
                            border
                            ${mapping.confidence === 'high' ? 'ring-1 ring-green-500/50' : ''}
                            ${mapping.confidence === 'none' && !mapping.mappedTo ? 'ring-1 ring-amber-500/50' : ''}
                          `}
                        >
                          <option value="">-- Not mapped --</option>
                          <optgroup label="Skipper Info">
                            {RESULTS_FIELD_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Race Results">
                            {Array.from({ length: 20 }, (_, i) => (
                              <option key={`race_${i + 1}`} value={`race_${i + 1}`}>Race {i + 1}</option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      {mapping.confidence === 'high' && (
                        <CheckCircle size={16} className="text-green-500 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Skipper Matching */}
          {step === 'matching' && (
            <div className="space-y-4">
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                We found <span className="font-semibold">{skipperMatches.length}</span> skippers.
                Review the matches below. Green matches are automatic; yellow need confirmation; red need manual assignment.
              </p>

              <div className="space-y-2">
                {skipperMatches.map((match) => (
                  <div
                    key={match.rowIndex}
                    className={`
                      p-3 rounded-lg border
                      ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 ${getMatchStatusColor(match)}`}>
                        {match.matchType !== 'none' ? <UserCheck size={18} /> : <UserPlus size={18} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {match.importName}
                          </span>
                          {match.importSailNo && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-100 text-slate-600'
                            }`}>
                              Sail #{match.importSailNo}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${getMatchStatusColor(match)}`}>
                          {getMatchStatusLabel(match)}
                          {match.matchedMember && (
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                              {' - '}{match.matchedMember.first_name} {match.matchedMember.last_name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleMatchChange(match.rowIndex, 'selectedAction', 'member')}
                          className={`
                            px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                            ${match.selectedAction === 'member'
                              ? 'bg-blue-600 text-white'
                              : darkMode
                                ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                          `}
                        >
                          Member
                        </button>
                        <button
                          onClick={() => handleMatchChange(match.rowIndex, 'selectedAction', 'visitor')}
                          className={`
                            px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                            ${match.selectedAction === 'visitor'
                              ? 'bg-blue-600 text-white'
                              : darkMode
                                ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                          `}
                        >
                          Visitor
                        </button>
                      </div>
                    </div>

                    {match.selectedAction === 'member' && (
                      <div className="mt-2 ml-8">
                        <div className="relative">
                          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                            darkMode ? 'text-slate-400' : 'text-slate-400'
                          }`} />
                          <input
                            type="text"
                            value={memberSearch[match.rowIndex] || ''}
                            onChange={(e) => setMemberSearch(prev => ({ ...prev, [match.rowIndex]: e.target.value }))}
                            placeholder="Search members..."
                            className={`
                              w-full pl-9 pr-3 py-1.5 rounded-md text-sm
                              ${darkMode
                                ? 'bg-slate-800 text-slate-200 border-slate-600'
                                : 'bg-white text-slate-900 border-slate-300'}
                              border
                            `}
                          />
                        </div>
                        {(memberSearch[match.rowIndex] || match.matchType === 'none') && (
                          <div className={`
                            mt-1 max-h-32 overflow-y-auto rounded-md border
                            ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}
                          `}>
                            {getFilteredMembers(match.rowIndex).map(m => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  handleMatchChange(match.rowIndex, 'selectedMemberId', m.id);
                                  setMemberSearch(prev => ({ ...prev, [match.rowIndex]: '' }));
                                }}
                                className={`
                                  w-full text-left px-3 py-1.5 text-sm flex items-center justify-between
                                  ${match.selectedMemberId === m.id
                                    ? darkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-700'
                                    : darkMode ? 'hover:bg-slate-700 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}
                                `}
                              >
                                <span>{m.first_name} {m.last_name}</span>
                                {m.boats?.[0]?.sail_number && (
                                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    #{m.boats[0].sail_number}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {match.selectedAction === 'visitor' && (
                      <div className="mt-2 ml-8 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={match.visitorName}
                          onChange={(e) => handleMatchChange(match.rowIndex, 'visitorName', e.target.value)}
                          placeholder="Visitor name"
                          className={`
                            px-3 py-1.5 rounded-md text-sm
                            ${darkMode
                              ? 'bg-slate-800 text-slate-200 border-slate-600'
                              : 'bg-white text-slate-900 border-slate-300'}
                            border
                          `}
                        />
                        <input
                          type="text"
                          value={match.visitorSailNo}
                          onChange={(e) => handleMatchChange(match.rowIndex, 'visitorSailNo', e.target.value)}
                          placeholder="Sail number"
                          className={`
                            px-3 py-1.5 rounded-md text-sm
                            ${darkMode
                              ? 'bg-slate-800 text-slate-200 border-slate-600'
                              : 'bg-white text-slate-900 border-slate-300'}
                            border
                          `}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && parsed && (
            <div className="space-y-4">
              <div className={`
                p-4 rounded-lg border
                ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-green-50 border-green-100'}
              `}>
                <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-slate-200' : 'text-green-800'}`}>
                  Ready to import
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-green-700'}`}>
                  {skipperMatches.length} skippers across {raceColumns.length} races will be imported into{' '}
                  <span className="font-semibold">{displayName}</span>.
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border ${darkMode ? 'border-slate-600' : 'border-slate-200'}">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={darkMode ? 'bg-slate-700' : 'bg-slate-50'}>
                      <th className={`px-3 py-2 text-left font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        #
                      </th>
                      <th className={`px-3 py-2 text-left font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Skipper
                      </th>
                      <th className={`px-3 py-2 text-left font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Sail No
                      </th>
                      <th className={`px-3 py-2 text-left font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Type
                      </th>
                      {raceColumns.map(rc => (
                        <th
                          key={rc.raceNumber}
                          className={`px-3 py-2 text-center font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}
                        >
                          R{rc.raceNumber}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {skipperMatches.map((match, idx) => {
                      const row = parsed.rows[match.rowIndex];
                      return (
                        <tr
                          key={match.rowIndex}
                          className={`
                            border-t
                            ${darkMode ? 'border-slate-600' : 'border-slate-100'}
                            ${idx % 2 === 0
                              ? darkMode ? 'bg-slate-800/50' : 'bg-white'
                              : darkMode ? 'bg-slate-700/30' : 'bg-slate-50/50'}
                          `}
                        >
                          <td className={`px-3 py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {idx + 1}
                          </td>
                          <td className={`px-3 py-2 font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {match.selectedAction === 'member' && match.matchedMember
                              ? `${match.matchedMember.first_name} ${match.matchedMember.last_name}`
                              : match.visitorName || match.importName}
                          </td>
                          <td className={`px-3 py-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                            {match.importSailNo}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`
                              text-xs px-2 py-0.5 rounded-full font-medium
                              ${match.selectedAction === 'member'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}
                            `}>
                              {match.selectedAction === 'member' ? 'Member' : 'Visitor'}
                            </span>
                          </td>
                          {raceColumns.map(rc => {
                            const val = row[rc.csvField] || '';
                            const isLetterScore = isNaN(parseInt(val)) && val.trim() !== '';
                            return (
                              <td
                                key={rc.raceNumber}
                                className={`px-3 py-2 text-center ${
                                  isLetterScore
                                    ? 'text-red-500 font-medium'
                                    : darkMode ? 'text-slate-200' : 'text-slate-700'
                                }`}
                              >
                                {val || '-'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 5: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader size={40} className="text-blue-500 animate-spin mb-4" />
              <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                Importing results...
              </p>
              <div className={`w-64 h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {importProgress}% complete
              </p>
            </div>
          )}

          {/* Step 6: Complete */}
          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                Import Complete
              </h3>
              <p className={`text-sm mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Successfully imported <span className="font-semibold">{skipperMatches.length}</span> skippers
                across <span className="font-semibold">{raceColumns.length}</span> races
              </p>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                into <span className="font-semibold">{displayName}</span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`
          flex items-center justify-between p-4 border-t shrink-0
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div>
            {step !== 'paste' && step !== 'importing' && step !== 'complete' && (
              <button
                onClick={() => {
                  const prev: Record<string, ImportStep> = {
                    mapping: 'paste',
                    matching: 'mapping',
                    preview: 'matching',
                  };
                  setStep(prev[step] || 'paste');
                  setError(null);
                }}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${darkMode
                    ? 'text-slate-300 hover:bg-slate-700'
                    : 'text-slate-600 hover:bg-slate-100'}
                `}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'complete' ? (
              <button
                onClick={() => {
                  onImportComplete();
                  onClose();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
              >
                <CheckCircle size={16} />
                Done
              </button>
            ) : step === 'paste' ? (
              <button
                onClick={handlePaste}
                disabled={!pasteData.trim()}
                className={`
                  flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors
                  ${pasteData.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : darkMode
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
                `}
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : step === 'mapping' ? (
              <button
                onClick={handleMappingNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : step === 'matching' ? (
              <button
                onClick={handlePreview}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
              >
                Preview Results
                <ArrowRight size={16} />
              </button>
            ) : step === 'preview' ? (
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
              >
                <Upload size={16} />
                Import Results
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
