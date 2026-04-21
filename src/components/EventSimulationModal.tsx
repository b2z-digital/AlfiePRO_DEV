import React, { useState, useRef, useCallback } from 'react';
import { X, FlaskConical, Upload, Plus, Settings, ChevronRight, FileSpreadsheet, Users, Layers, ArrowLeft, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Info } from 'lucide-react';
import { parseHMSFile } from '../utils/hmsParser';
import { ParsedHMSData } from '../types/hmsValidator';
import { storeRaceEvent, setCurrentEvent } from '../utils/raceStorage';
import { RaceEvent } from '../types/race';
import { HeatManagement, HeatDesignation, HeatAssignment, HeatRound, HeatResult } from '../types/heat';
import { Skipper, BoatType, RaceType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';

interface EventSimulationModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSuccess: (event: RaceEvent) => void;
}

type SimulationStep = 'choose' | 'hms-config' | 'hms-preview' | 'creating';

export const EventSimulationModal: React.FC<EventSimulationModalProps> = ({
  darkMode,
  onClose,
  onSuccess,
}) => {
  const { currentClub } = useAuth();
  const [step, setStep] = useState<SimulationStep>('choose');
  const [parsedData, setParsedData] = useState<ParsedHMSData | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState({
    eventName: '',
    promotionCount: 4,
    fleetManagement: true,
    raceFormat: 'handicap' as RaceType,
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setFileName(file.name);

    try {
      const data = await parseHMSFile(file);
      setParsedData(data);

      setConfig(prev => ({
        ...prev,
        eventName: data.eventName || file.name.replace(/\.(xls|xlsx|csv)$/i, ''),
        promotionCount: data.promotionCount || 4,
      }));

      setStep('hms-config');
    } catch (err: any) {
      setError(err.message || 'Failed to parse HMS file');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleCreateFromScratch = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);

    try {
      const eventId = uuidv4();
      const event: RaceEvent = {
        id: eventId,
        eventName: 'Simulated Event',
        clubName: currentClub?.club?.name || 'Simulation',
        clubId: currentClub?.clubId,
        date: new Date().toISOString().split('T')[0],
        venue: '',
        raceClass: '' as BoatType,
        raceFormat: 'scratch' as RaceType,
        skippers: [],
        raceResults: [],
        lastCompletedRace: 0,
        hasDeterminedInitialHcaps: false,
        isManualHandicaps: false,
        completed: false,
        numRaces: 12,
        dropRules: [4, 8, 16, 24, 32, 40],
        is_simulated: true,
      };

      await storeRaceEvent(event);
      setCurrentEvent(event);
      onSuccess(event);
    } catch (err: any) {
      console.error('Failed to create simulated event:', err);
      setError(err.message || 'Failed to create event');
      setCreating(false);
    }
  };

  const buildHeatManagement = useCallback((): HeatManagement | undefined => {
    if (!parsedData || !parsedData.hasHeats || !parsedData.heats) return undefined;

    const heats = [...parsedData.heats].sort() as HeatDesignation[];
    const numberOfHeats = heats.length;
    const skippers = parsedData.skippers;

    const rounds: HeatRound[] = [];

    for (let raceNum = 1; raceNum <= parsedData.numRaces; raceNum++) {
      const raceResults = parsedData.results.filter(r => r.raceNumber === raceNum);
      if (raceResults.length === 0) continue;

      const heatAssignments: HeatAssignment[] = [];

      for (const heat of heats) {
        const heatResults = raceResults.filter(r => r.heat === heat);
        const skipperIndices: number[] = [];

        for (const hr of heatResults) {
          const idx = skippers.findIndex(s => s.sailNumber === hr.sailNumber);
          if (idx >= 0 && !skipperIndices.includes(idx)) {
            skipperIndices.push(idx);
          }
        }

        heatAssignments.push({
          heatDesignation: heat,
          skipperIndices,
        });
      }

      const heatResultsList: HeatResult[] = [];
      for (const hr of raceResults) {
        const idx = skippers.findIndex(s => s.sailNumber === hr.sailNumber);
        if (idx < 0) continue;
        const heat = hr.heat as HeatDesignation;
        if (!heat) continue;

        const isUp = hr.comment?.toUpperCase() === 'UP';

        heatResultsList.push({
          skipperIndex: idx,
          position: hr.position,
          letterScore: hr.letterScore as any,
          heatDesignation: heat,
          race: raceNum,
          round: raceNum,
          markedAsUP: isUp,
          customPoints: hr.customPoints,
        });
      }

      rounds.push({
        round: raceNum,
        heatAssignments,
        results: heatResultsList,
        completed: true,
      });
    }

    return {
      configuration: {
        enabled: true,
        numberOfHeats,
        promotionCount: config.promotionCount,
        seedingMethod: 'manual',
        autoAssign: false,
        scoringSystem: 'hms',
        fleetManagementEnabled: config.fleetManagement,
      },
      rounds,
      currentRound: parsedData.numRaces,
      currentHeat: null,
    };
  }, [parsedData, config.promotionCount, config.fleetManagement]);

  const buildSkippers = useCallback((): Skipper[] => {
    if (!parsedData) return [];
    return parsedData.skippers.map(s => ({
      name: s.name,
      sailNo: s.sailNumber,
      sailNumber: s.sailNumber,
      club: s.club || '',
      boatModel: s.hull || '',
      hull: s.hull,
      startHcap: 100,
    }));
  }, [parsedData]);

  const buildSpreadsheetRaceResults = useCallback((): any[] => {
    if (!parsedData) return [];

    const allResults: any[] = [];
    const skippers = parsedData.skippers;

    for (const result of parsedData.results) {
      const idx = skippers.findIndex(s => s.sailNumber === result.sailNumber);
      if (idx < 0) continue;

      const heatResults = parsedData.results.filter(
        r => r.raceNumber === result.raceNumber && r.heat === result.heat
      );
      heatResults.sort((a, b) => (a.position || 999) - (b.position || 999));
      const hmsPosition = heatResults.findIndex(r => r.sailNumber === result.sailNumber) + 1;

      allResults.push({
        race: result.raceNumber,
        skipperIndex: idx,
        position: result.position,
        letterScore: result.letterScore,
        hmsHeat: result.heat as HeatDesignation,
        hmsPosition: hmsPosition || result.position,
        hmsSailNumber: result.sailNumber,
        hmsPoints: result.points,
        customPoints: result.customPoints,
      });
    }

    return allResults;
  }, [parsedData]);

  const handleCreateEvent = useCallback(async () => {
    if (!parsedData) return;
    setCreating(true);
    setError(null);

    try {
      const eventId = uuidv4();
      const skippers = buildSkippers();
      const completedRaces = [...new Set(parsedData.results.map(r => r.raceNumber))].length;

      let raceResults: any[];
      let heatManagement: HeatManagement | undefined;

      if (config.fleetManagement) {
        raceResults = [];
        heatManagement = buildHeatManagement();
      } else {
        raceResults = buildSpreadsheetRaceResults();
        const heats = parsedData.heats ? [...parsedData.heats].sort() as HeatDesignation[] : [];
        heatManagement = {
          configuration: {
            enabled: true,
            numberOfHeats: heats.length || 2,
            promotionCount: config.promotionCount,
            seedingMethod: 'manual',
            autoAssign: false,
            scoringSystem: 'hms',
            fleetManagementEnabled: false,
          },
          rounds: [],
          currentRound: 0,
          currentHeat: null,
        };
      }

      const event: RaceEvent = {
        id: eventId,
        eventName: config.eventName || parsedData.eventName || 'HMS Simulation',
        clubName: currentClub?.clubName || parsedData.hostClub || 'Simulation',
        clubId: currentClub?.clubId,
        date: parsedData.eventDate || new Date().toISOString().split('T')[0],
        venue: '',
        raceClass: '' as BoatType,
        raceFormat: config.raceFormat,
        skippers,
        raceResults,
        lastCompletedRace: completedRaces,
        hasDeterminedInitialHcaps: false,
        isManualHandicaps: false,
        completed: false,
        heatManagement,
        numRaces: 41,
        dropRules: [4, 8, 16, 24, 32, 40],
        scoringSystem: 'hms',
        is_simulated: true,
      };

      await storeRaceEvent(event);
      setCurrentEvent(event);
      onSuccess(event);
    } catch (err: any) {
      setError(err.message || 'Failed to create event');
      setCreating(false);
    }
  }, [parsedData, config, currentClub, buildSkippers, buildSpreadsheetRaceResults, buildHeatManagement, onSuccess]);

  const totalEntrants = parsedData?.skippers.length || 0;
  const totalRaces = parsedData?.numRaces || 0;
  const totalHeats = parsedData?.heats?.length || 0;
  const totalResults = parsedData?.results.length || 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
        darkMode ? 'bg-slate-900' : 'bg-white'
      }`}>
        <div className="relative bg-gradient-to-r from-amber-600 to-amber-700 px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
              <FlaskConical className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Event Simulation</h2>
              <p className="text-amber-100 text-sm mt-0.5">
                {step === 'choose' && 'Choose how to create your simulation'}
                {step === 'hms-config' && 'Configure HMS import settings'}
                {step === 'hms-preview' && 'Review imported data'}
                {step === 'creating' && 'Creating event...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-900/20 border border-red-500/30 flex items-start gap-3">
              <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {step === 'choose' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={`group relative p-6 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                    darkMode
                      ? 'border-slate-700 hover:border-amber-500/50 bg-slate-800/50 hover:bg-slate-800'
                      : 'border-slate-200 hover:border-amber-500/50 bg-slate-50 hover:bg-amber-50/30'
                  }`}
                >
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
                    darkMode ? 'bg-amber-500/15' : 'bg-amber-100'
                  }`}>
                    <FileSpreadsheet className={darkMode ? 'text-amber-400' : 'text-amber-600'} size={28} />
                  </div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Import HMS File
                  </h3>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Import an HMS Excel file to validate results and simulate scoring in AlfiePRO's format
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
                    <Upload size={16} />
                    <span>{uploading ? 'Parsing file...' : 'Upload .xls / .xlsx file'}</span>
                  </div>
                </button>

                <button
                  onClick={handleCreateFromScratch}
                  disabled={creating}
                  className={`group relative p-6 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                    creating ? 'opacity-60 cursor-wait' : ''
                  } ${
                    darkMode
                      ? 'border-slate-700 hover:border-blue-500/50 bg-slate-800/50 hover:bg-slate-800'
                      : 'border-slate-200 hover:border-blue-500/50 bg-slate-50 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
                    darkMode ? 'bg-blue-500/15' : 'bg-blue-100'
                  }`}>
                    <Plus className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={28} />
                  </div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Create from Scratch
                  </h3>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Start a blank event to manually enter skippers and score races from the ground up
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-500">
                    <ChevronRight size={16} />
                    <span>{creating ? 'Creating event...' : 'Start blank event'}</span>
                  </div>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {step === 'hms-config' && parsedData && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('choose'); setParsedData(null); setFileName(''); }}
                className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <div className={`p-4 rounded-xl border ${
                darkMode ? 'bg-emerald-900/15 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <CheckCircle className="text-emerald-500" size={20} />
                  <span className={`font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    File Parsed Successfully
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Skippers" value={totalEntrants} color="blue" darkMode={darkMode} />
                  <StatCard label="Races" value={totalRaces} color="green" darkMode={darkMode} />
                  <StatCard label="Heats" value={totalHeats} color="amber" darkMode={darkMode} />
                  <StatCard label="Results" value={totalResults} color="teal" darkMode={darkMode} />
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Event Name
                  </label>
                  <input
                    type="text"
                    value={config.eventName}
                    onChange={(e) => setConfig(prev => ({ ...prev, eventName: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                    placeholder="Enter event name"
                  />
                </div>

                {parsedData.hasHeats && (
                  <>
                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        Promotion Count
                      </label>
                      <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Number of skippers promoted between heats each round
                        {parsedData.promotionCount && (
                          <span className="ml-1 text-amber-500">
                            (detected: {parsedData.promotionCount} from file)
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-3">
                        {[2, 3, 4, 5, 6].map(n => (
                          <button
                            key={n}
                            onClick={() => setConfig(prev => ({ ...prev, promotionCount: n }))}
                            className={`w-12 h-12 rounded-xl font-bold text-lg transition-all ${
                              config.promotionCount === n
                                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                                : darkMode
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-amber-500/50'
                                  : 'bg-slate-100 text-slate-600 border border-slate-300 hover:border-amber-500/50'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        Fleet Management
                      </label>
                      <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Controls how results are imported into the scoring system
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setConfig(prev => ({ ...prev, fleetManagement: true }))}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            config.fleetManagement
                              ? darkMode
                                ? 'border-amber-500/50 bg-amber-500/10'
                                : 'border-amber-500 bg-amber-50'
                              : darkMode
                                ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Layers className={config.fleetManagement ? 'text-amber-500' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                            <span className={`font-semibold text-sm ${
                              config.fleetManagement
                                ? darkMode ? 'text-amber-400' : 'text-amber-700'
                                : darkMode ? 'text-slate-300' : 'text-slate-700'
                            }`}>
                              Fleet Managed HMS
                            </span>
                          </div>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Import into AlfiePRO's fleet-managed HMS scoring with automatic heat assignments and promotion/relegation
                          </p>
                        </button>

                        <button
                          onClick={() => setConfig(prev => ({ ...prev, fleetManagement: false }))}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            !config.fleetManagement
                              ? darkMode
                                ? 'border-blue-500/50 bg-blue-500/10'
                                : 'border-blue-500 bg-blue-50'
                              : darkMode
                                ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <FileSpreadsheet className={!config.fleetManagement ? 'text-blue-500' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                            <span className={`font-semibold text-sm ${
                              !config.fleetManagement
                                ? darkMode ? 'text-blue-400' : 'text-blue-700'
                                : darkMode ? 'text-slate-300' : 'text-slate-700'
                            }`}>
                              Spreadsheet Mode
                            </span>
                          </div>
                          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Import directly into the HMS manual spreadsheet scoring mode for raw data entry and validation
                          </p>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {parsedData.hasHeats && (
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    darkMode ? 'bg-blue-900/15 border-blue-500/20' : 'bg-blue-50 border-blue-200'
                  }`}>
                    <Info className="text-blue-400 shrink-0 mt-0.5" size={16} />
                    <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                      <strong>Heat Structure:</strong> {totalHeats} heats ({parsedData.heats?.join(', ')}) detected across {totalRaces} races with {totalEntrants} skippers.
                      {parsedData.promotionCount && ` Promotion count of ${parsedData.promotionCount} was auto-detected from the file.`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'hms-preview' && parsedData && (
            <div className="space-y-6">
              <button
                onClick={() => setStep('hms-config')}
                className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeft size={16} />
                Back to settings
              </button>

              <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`px-5 py-3 border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h3 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Skippers ({parsedData.skippers.length})
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className={`sticky top-0 ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-4 py-2 text-left text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pos</th>
                        <th className={`px-4 py-2 text-left text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sail #</th>
                        <th className={`px-4 py-2 text-left text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Name</th>
                        <th className={`px-4 py-2 text-left text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Club</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.skippers.slice(0, 20).map((s, i) => (
                        <tr key={i} className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                          <td className={`px-4 py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.position}</td>
                          <td className={`px-4 py-2 font-mono font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>{s.sailNumber}</td>
                          <td className={`px-4 py-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{s.name}</td>
                          <td className={`px-4 py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.club || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.skippers.length > 20 && (
                    <p className={`px-4 py-2 text-xs text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      ... and {parsedData.skippers.length - 20} more skippers
                    </p>
                  )}
                </div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <h4 className={`font-semibold text-sm mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Import Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Event Name" value={config.eventName} darkMode={darkMode} />
                  <SummaryRow label="Scoring Mode" value={config.fleetManagement ? 'Fleet Managed HMS' : 'Spreadsheet Mode'} darkMode={darkMode} />
                  {parsedData.hasHeats && (
                    <>
                      <SummaryRow label="Heats" value={parsedData.heats?.join(', ') || '-'} darkMode={darkMode} />
                      <SummaryRow label="Promotion Count" value={String(config.promotionCount)} darkMode={darkMode} />
                    </>
                  )}
                  <SummaryRow label="Races" value={String(totalRaces)} darkMode={darkMode} />
                  <SummaryRow label="Skippers" value={String(totalEntrants)} darkMode={darkMode} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`px-8 py-5 border-t flex items-center justify-between ${
          darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            Cancel
          </button>

          {step === 'hms-config' && (
            <button
              onClick={() => setStep('hms-preview')}
              disabled={!config.eventName.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              Preview Import
              <ChevronRight size={16} />
            </button>
          )}

          {step === 'hms-preview' && (
            <button
              onClick={handleCreateEvent}
              disabled={creating}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating Event...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Create Simulation Event
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; color: string; darkMode: boolean }> = ({ label, value, color, darkMode }) => {
  const colorMap: Record<string, string> = {
    blue: darkMode ? 'text-blue-400' : 'text-blue-600',
    green: darkMode ? 'text-emerald-400' : 'text-emerald-600',
    amber: darkMode ? 'text-amber-400' : 'text-amber-600',
    teal: darkMode ? 'text-teal-400' : 'text-teal-600',
  };

  return (
    <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800/60' : 'bg-white'}`}>
      <div className={`text-xl font-bold ${colorMap[color] || colorMap.blue}`}>{value}</div>
      <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</div>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string; darkMode: boolean }> = ({ label, value, darkMode }) => (
  <div className="flex items-center justify-between">
    <span className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
    <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{value}</span>
  </div>
);
