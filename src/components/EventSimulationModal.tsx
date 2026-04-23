import React, { useState, useRef, useCallback } from 'react';
import { X, FlaskConical, Upload, Plus, ChevronRight, FileSpreadsheet, Users, Layers, ArrowLeft, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Info, Sailboat, TrendingUp, Shuffle, Download, Globe, Loader as Loader2 } from 'lucide-react';
import { parseHMSFile } from '../utils/hmsParser';
import { parseSHRSFile, parseSHRSFromHTML, reconstructSHRSHeats, ParsedSHRSData, SHRSImportMode } from '../utils/shrsParser';
import { ParsedHMSData } from '../types/hmsValidator';
import { calculateOptimalHeats } from '../utils/shrsHeatSystem';
import { storeRaceEvent, setCurrentEvent } from '../utils/raceStorage';
import { RaceEvent } from '../types/race';
import { HeatManagement, HeatDesignation, HeatAssignment, HeatRound, HeatResult } from '../types/heat';
import { Skipper, BoatType, RaceType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

interface EventSimulationModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSuccess: (event: RaceEvent) => void;
}

type ScoringFormat = 'hms' | 'shrs';
type SimulationStep = 'choose' | 'scratch-config' | 'format-select' | 'hms-config' | 'shrs-config' | 'hms-preview' | 'shrs-preview' | 'creating';

export const EventSimulationModal: React.FC<EventSimulationModalProps> = ({
  darkMode,
  onClose,
  onSuccess,
}) => {
  const { currentClub } = useAuth();
  const [step, setStep] = useState<SimulationStep>('choose');
  const [parsedData, setParsedData] = useState<ParsedHMSData | null>(null);
  const [parsedSHRSData, setParsedSHRSData] = useState<ParsedSHRSData | null>(null);
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>('hms');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);

  const [config, setConfig] = useState({
    eventName: '',
    promotionCount: 4,
    fleetManagement: false,
    raceFormat: 'handicap' as RaceType,
  });

  const [shrsConfig, setShrsConfig] = useState({
    eventName: '',
    numberOfHeats: 3,
    raceFormat: 'scratch' as RaceType,
  });

  const YACHT_CLASSES: { value: BoatType; label: string }[] = [
    { value: 'IOM', label: 'IOM' },
    { value: 'DF65', label: 'DF65' },
    { value: 'DF95', label: 'DF95' },
    { value: '10R', label: '10 Rater' },
    { value: 'Marblehead', label: 'Marblehead' },
    { value: 'A Class', label: 'A Class' },
    { value: 'RC Laser', label: 'RC Laser' },
  ];

  const [scratchConfig, setScratchConfig] = useState({
    eventName: '',
    raceFormat: 'scratch' as RaceType,
    raceClass: '' as BoatType,
  });

  const downloadSHRSTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const headerRow = ['Name', 'Sail', 'Club', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'Total', 'Net'];
    const exampleRows = [
      ['John Smith', 'AUS 48', 'LMRYC', '1', '2', '6', '2', '1', '3', '2', '1', '', '', 'RGP 2', 'DNF 18', 'NSC 18', '', '', '', '', ''],
      ['Jane Doe', 'NZL 61', 'WMYC', '7', '2', '1', '2', '1', '5', '7', '1', '4', '', 'DSQ 18', 'SCP 16.4', '', '', '', '', '', ''],
      ['Bob Wilson', 'ESP 47', 'RYC', '1', '2', '4', '2', '2', '2', '11', '4', '7', '', 'DNC 18', 'UFD 18', 'RET 18C', '', '', '', '', ''],
    ];
    const data = [headerRow, ...exampleRows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const colWidths = [20, 12, 12, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 10, 8, 8];
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    XLSX.utils.book_append_sheet(wb, ws, 'AllScores');

    const notesWs = XLSX.utils.aoa_to_sheet([
      ['SHRS Import Template - Instructions'],
      [''],
      ['Column Structure:'],
      ['  Name   - Skipper full name'],
      ['  Sail   - Sail number (e.g. AUS 48, NZL 61)'],
      ['  Club   - Club abbreviation (optional)'],
      ['  Q1-Qn  - Qualifying round scores (position number or letter score)'],
      ['  F1-Fn  - Final round scores (position number or letter score)'],
      ['  Total  - Gross total points (optional, calculated by system)'],
      ['  Net    - Net points after discards (optional, calculated by system)'],
      [''],
      ['Supported Score Formats:'],
      ['  3       - Position (3rd place)'],
      ['  DNF 18  - Did Not Finish (with assigned points)'],
      ['  DNS 18  - Did Not Start'],
      ['  DNC 18  - Did Not Compete'],
      ['  DSQ 18  - Disqualified'],
      ['  UFD 18  - U-Flag Disqualification'],
      ['  NSC 18  - Non Starter Code'],
      ['  OCS 18  - On Course Side'],
      ['  BFD 18  - Black Flag Disqualification'],
      ['  RET 18  - Retired'],
      ['  SCP 16.4 - Scoring Penalty (with calculated points)'],
      ['  RGP 2   - Redress Given Points (fixed points)'],
      ['  RGA 4.3 - Redress Given Average (average points)'],
      [''],
      ['Fleet Suffixes (optional, for finals):'],
      ['  DNC 18B  - Letter after points indicates fleet (G=Gold, S=Silver, B=Bronze, C=Copper)'],
      ['  RET 18C  - Retired in Copper fleet'],
      ['  NSC 18S  - Non Starter Code in Silver fleet'],
    ]);
    notesWs['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, notesWs, 'Instructions');

    XLSX.writeFile(wb, 'SHRS_Import_Template.xlsx');
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setFileName(file.name);
    setRawFile(file);

    try {
      setStep('format-select');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleUrlImport = useCallback(async () => {
    if (!importUrl.trim()) return;
    setFetchingUrl(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-external-html`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: importUrl.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch URL (${response.status})`);
      }

      const { html } = await response.json();
      if (!html) throw new Error('No HTML content received');

      const data = parseSHRSFromHTML(html, importUrl.trim());
      setParsedSHRSData(data);
      const optimalHeats = calculateOptimalHeats(data.skippers.length);
      setShrsConfig(prev => ({
        ...prev,
        eventName: data.eventName || 'Imported SHRS Event',
        numberOfHeats: optimalHeats,
      }));
      setScoringFormat('shrs');
      setFileName(importUrl.trim());
      setStep('shrs-config');
    } catch (err: any) {
      setError(err.message || 'Failed to import from URL');
    } finally {
      setFetchingUrl(false);
    }
  }, [importUrl]);

  const handleFormatConfirm = useCallback(async () => {
    if (!rawFile) return;
    setUploading(true);
    setError(null);

    try {
      if (scoringFormat === 'hms') {
        const data = await parseHMSFile(rawFile);
        setParsedData(data);
        setConfig(prev => ({
          ...prev,
          eventName: data.eventName || rawFile.name.replace(/\.(xls|xlsx|csv)$/i, ''),
          promotionCount: data.promotionCount || 4,
        }));
        setStep('hms-config');
      } else {
        const data = await parseSHRSFile(rawFile);
        setParsedSHRSData(data);
        const optimalHeats = calculateOptimalHeats(data.skippers.length);
        setShrsConfig(prev => ({
          ...prev,
          eventName: data.eventName || rawFile.name.replace(/\.(xls|xlsx|csv)$/i, ''),
          numberOfHeats: optimalHeats,
        }));
        setStep('shrs-config');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
      setStep('format-select');
    } finally {
      setUploading(false);
    }
  }, [rawFile, scoringFormat]);

  const handleCreateFromScratch = async () => {
    if (creating || !scratchConfig.eventName.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const eventId = uuidv4();
      const event: RaceEvent = {
        id: eventId,
        eventName: scratchConfig.eventName.trim(),
        clubName: currentClub?.club?.name || 'Simulation',
        clubId: currentClub?.clubId,
        date: new Date().toISOString().split('T')[0],
        venue: '',
        raceClass: scratchConfig.raceClass || '' as BoatType,
        raceFormat: scratchConfig.raceFormat,
        skippers: [],
        raceResults: [],
        lastCompletedRace: 0,
        hasDeterminedInitialHcaps: false,
        isManualHandicaps: false,
        completed: false,
        numRaces: 20,
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
          importedScore: hr.points,
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

  const handleCreateSHRSEvent = useCallback(async () => {
    if (!parsedSHRSData) return;
    setCreating(true);
    setError(null);

    try {
      const eventId = uuidv4();
      const mode: SHRSImportMode = 'shrs-progressive';
      const numberOfHeats = shrsConfig.numberOfHeats;

      const reconstructedRounds = reconstructSHRSHeats(parsedSHRSData, mode, numberOfHeats);

      const skippers: Skipper[] = parsedSHRSData.skippers.map(s => ({
        name: s.name,
        sailNo: s.sailNumber,
        sailNumber: s.sailNumber,
        club: s.club || '',
        boatModel: '',
        startHcap: 100,
      }));

      const heats = ['A', 'B', 'C', 'D', 'E'].slice(0, numberOfHeats) as HeatDesignation[];
      const rounds: HeatRound[] = reconstructedRounds.map(rr => ({
        round: rr.round,
        heatAssignments: rr.heatAssignments.map(a => ({
          heatDesignation: a.heatDesignation as HeatDesignation,
          skipperIndices: [...a.skipperIndices],
        })),
        results: rr.results.map(r => ({
          skipperIndex: r.skipperIndex,
          position: r.position,
          letterScore: r.letterScore as any,
          heatDesignation: r.heatDesignation as HeatDesignation,
          race: rr.round,
          round: rr.round,
          customPoints: r.customPoints,
          importedScore: r.importedScore,
        })),
        completed: true,
      }));

      const totalRaces = parsedSHRSData.qualifyingRounds + parsedSHRSData.finalRounds;
      const qualifyingRounds = parsedSHRSData.qualifyingRounds;

      const sourceVerification = {
        skippers: parsedSHRSData.skippers.map((s, i) => ({
          skipperIndex: i,
          name: s.name,
          sailNumber: s.sailNumber,
          sourceNet: s.totalScore,
          sourceTotal: s.grossTotal,
          sourceFleet: s.sourceFleet,
          sourceFleetPosition: s.sourceFleetPosition,
        })),
      };

      const heatManagement: HeatManagement = {
        configuration: {
          enabled: true,
          numberOfHeats,
          promotionCount: 0,
          seedingMethod: 'manual',
          autoAssign: false,
          scoringSystem: 'shrs',
          shrsAssignmentMode: 'progressive',
          shrsQualifyingRounds: qualifyingRounds,
          shrsFinalsStarted: parsedSHRSData.finalRounds > 0,
          fleetManagementEnabled: true,
          heatLabelStyle: 'letters',
          sourceVerification,
        },
        rounds,
        currentRound: totalRaces,
        currentHeat: null,
      };

      const discards: number[] = [];
      if (totalRaces >= 4) discards.push(4);
      if (totalRaces >= 8) discards.push(8);
      if (totalRaces >= 16) discards.push(16);
      if (totalRaces >= 24) discards.push(24);

      const event: RaceEvent = {
        id: eventId,
        eventName: shrsConfig.eventName || parsedSHRSData.eventName || 'SHRS Simulation',
        clubName: currentClub?.clubName || 'Simulation',
        clubId: currentClub?.clubId,
        date: new Date().toISOString().split('T')[0],
        venue: '',
        raceClass: '' as BoatType,
        raceFormat: shrsConfig.raceFormat,
        skippers,
        raceResults: [],
        lastCompletedRace: totalRaces,
        hasDeterminedInitialHcaps: false,
        isManualHandicaps: false,
        completed: false,
        heatManagement,
        numRaces: Math.max(totalRaces + 10, 30),
        dropRules: discards,
        scoringSystem: 'shrs',
        is_simulated: true,
      };

      await storeRaceEvent(event);
      setCurrentEvent(event);
      onSuccess(event);
    } catch (err: any) {
      setError(err.message || 'Failed to create SHRS event');
      setCreating(false);
    }
  }, [parsedSHRSData, shrsConfig, scoringFormat, currentClub, onSuccess]);

  const totalEntrants = parsedData?.skippers.length || parsedSHRSData?.skippers.length || 0;
  const totalRaces = parsedData?.numRaces || parsedSHRSData?.numRaces || 0;
  const totalHeats = parsedData?.heats?.length || parsedSHRSData?.detectedHeats || 0;
  const totalResults = parsedData?.results.length || parsedSHRSData?.results.length || 0;

  const stepLabel: Record<SimulationStep, string> = {
    'choose': 'Choose how to create your simulation',
    'scratch-config': 'Configure your simulated event',
    'format-select': 'Select scoring format for import',
    'hms-config': 'Configure HMS import settings',
    'shrs-config': 'Configure SHRS import settings',
    'hms-preview': 'Review imported data',
    'shrs-preview': 'Review SHRS imported data',
    'creating': 'Creating event...',
  };

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
                {stepLabel[step]}
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
                    Import Results File
                  </h3>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Import an HMS or SHRS results file to validate scoring against AlfiePRO's scoring engine
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
                    <Upload size={16} />
                    <span>{uploading ? 'Parsing file...' : 'Upload .xls / .xlsx file'}</span>
                  </div>
                </button>

                <button
                  onClick={() => setStep('scratch-config')}
                  className={`group relative p-6 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
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
                    <span>Configure event</span>
                  </div>
                </button>
              </div>

              <div className={`relative rounded-xl border-2 border-dashed p-5 ${
                darkMode
                  ? 'border-slate-700 bg-slate-800/30'
                  : 'border-slate-200 bg-slate-50/50'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    darkMode ? 'bg-teal-500/15' : 'bg-teal-100'
                  }`}>
                    <Globe className={darkMode ? 'text-teal-400' : 'text-teal-600'} size={18} />
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Import SHRS from URL
                    </h4>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Paste a link to an ANZAM-style HTML results page
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://anzamsystems.com/AUS/df65nat26/HTMLResults.html"
                    className={`flex-1 text-sm rounded-lg border px-3 py-2.5 outline-none transition-colors ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-teal-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-teal-500'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && importUrl.trim()) handleUrlImport();
                    }}
                    disabled={fetchingUrl}
                  />
                  <button
                    onClick={handleUrlImport}
                    disabled={!importUrl.trim() || fetchingUrl}
                    className="px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                  >
                    {fetchingUrl ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Import
                      </>
                    )}
                  </button>
                </div>
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

          {step === 'format-select' && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('choose'); setRawFile(null); setFileName(''); setScoringFormat('hms'); }}
                className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <FileSpreadsheet className={darkMode ? 'text-amber-400' : 'text-amber-600'} size={20} />
                <div>
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{fileName}</p>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Select the scoring format used in this file</p>
                </div>
              </div>

              <button
                onClick={downloadSHRSTemplate}
                className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-amber-400 hover:bg-amber-500/10'
                    : 'text-amber-600 hover:bg-amber-50'
                }`}
              >
                <Download size={14} />
                Download SHRS import template (.xlsx)
              </button>

              <div className="space-y-3">
                <button
                  onClick={() => setScoringFormat('hms')}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${
                    scoringFormat === 'hms'
                      ? darkMode
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-amber-500 bg-amber-50'
                      : darkMode
                        ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      scoringFormat === 'hms' ? 'bg-amber-500/20' : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}>
                      <Layers className={scoringFormat === 'hms' ? 'text-amber-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                    </div>
                    <span className={`font-semibold text-sm ${
                      scoringFormat === 'hms'
                        ? darkMode ? 'text-amber-400' : 'text-amber-700'
                        : darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      HMS (Heat Management System)
                    </span>
                  </div>
                  <p className={`text-xs ml-[52px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Traditional heat system with promotion and relegation between heats each round. Standard HMS Excel format.
                  </p>
                </button>

                <button
                  onClick={() => setScoringFormat('shrs')}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${
                    scoringFormat === 'shrs'
                      ? darkMode
                        ? 'border-teal-500/50 bg-teal-500/10'
                        : 'border-teal-500 bg-teal-50'
                      : darkMode
                        ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      scoringFormat === 'shrs' ? 'bg-teal-500/20' : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}>
                      <Shuffle className={scoringFormat === 'shrs' ? 'text-teal-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                    </div>
                    <span className={`font-semibold text-sm ${
                      scoringFormat === 'shrs'
                        ? darkMode ? 'text-teal-400' : 'text-teal-700'
                        : darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      SHRS (Simple Heat Racing System)
                    </span>
                  </div>
                  <p className={`text-xs ml-[52px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Position-within-heat scoring with qualifying series, fleet allocation, and finals. Supports Progressive and Balanced heat formats.
                  </p>
                </button>
              </div>
            </div>
          )}

          {step === 'scratch-config' && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('choose'); setScratchConfig(prev => ({ ...prev, eventName: '' })); }}
                className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <div className="space-y-5">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Event Name
                  </label>
                  <input
                    type="text"
                    value={scratchConfig.eventName}
                    onChange={(e) => setScratchConfig(prev => ({ ...prev, eventName: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                    } outline-none transition-colors`}
                    placeholder="e.g. 2026 Club Championship Simulation"
                    autoFocus
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Scoring Format
                  </label>
                  <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Choose the scoring system for this simulated event
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setScratchConfig(prev => ({ ...prev, raceFormat: 'scratch' }))}
                      className={`p-5 rounded-xl border-2 text-left transition-all ${
                        scratchConfig.raceFormat === 'scratch'
                          ? darkMode
                            ? 'border-blue-500/50 bg-blue-500/10'
                            : 'border-blue-500 bg-blue-50'
                          : darkMode
                            ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          scratchConfig.raceFormat === 'scratch'
                            ? 'bg-blue-500/20'
                            : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                        }`}>
                          <Sailboat className={scratchConfig.raceFormat === 'scratch' ? 'text-blue-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                        </div>
                        <span className={`font-semibold text-sm ${
                          scratchConfig.raceFormat === 'scratch'
                            ? darkMode ? 'text-blue-400' : 'text-blue-700'
                            : darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          Scratch
                        </span>
                      </div>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Position-based scoring. First across the line wins. No handicap adjustments applied.
                      </p>
                    </button>

                    <button
                      onClick={() => setScratchConfig(prev => ({ ...prev, raceFormat: 'handicap' }))}
                      className={`p-5 rounded-xl border-2 text-left transition-all ${
                        scratchConfig.raceFormat === 'handicap'
                          ? darkMode
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : 'border-emerald-500 bg-emerald-50'
                          : darkMode
                            ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          scratchConfig.raceFormat === 'handicap'
                            ? 'bg-emerald-500/20'
                            : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                        }`}>
                          <TrendingUp className={scratchConfig.raceFormat === 'handicap' ? 'text-emerald-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} size={20} />
                        </div>
                        <span className={`font-semibold text-sm ${
                          scratchConfig.raceFormat === 'handicap'
                            ? darkMode ? 'text-emerald-400' : 'text-emerald-700'
                            : darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          Handicap
                        </span>
                      </div>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Handicap-adjusted scoring. Finishing positions are adjusted based on each skipper's handicap rating.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Yacht Class
                  </label>
                  <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Select the class to enable national rankings seeding
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {YACHT_CLASSES.map(cls => (
                      <button
                        key={cls.value}
                        onClick={() => setScratchConfig(prev => ({ ...prev, raceClass: cls.value }))}
                        className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                          scratchConfig.raceClass === cls.value
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                            : darkMode
                              ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-blue-500/50'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:border-blue-500/50'
                        }`}
                      >
                        {cls.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  darkMode ? 'bg-blue-900/15 border-blue-500/20' : 'bg-blue-50 border-blue-200'
                }`}>
                  <Info className="text-blue-400 shrink-0 mt-0.5" size={16} />
                  <div className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    This will create a simulated event that does not appear in your club's public race calendar, results, or mobile app.
                    You can add skippers and score races as a test without affecting any real data.
                  </div>
                </div>
              </div>
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

                    {/* Fleet Management is always Spreadsheet mode for simulated imports */}
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

          {step === 'shrs-config' && parsedSHRSData && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep('format-select'); setParsedSHRSData(null); }}
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
                    SHRS File Parsed Successfully
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Skippers" value={parsedSHRSData.skippers.length} color="blue" darkMode={darkMode} />
                  <StatCard label="Qualifying" value={parsedSHRSData.qualifyingRounds} color="green" darkMode={darkMode} />
                  <StatCard label="Finals" value={parsedSHRSData.finalRounds} color="amber" darkMode={darkMode} />
                  <StatCard label="Results" value={parsedSHRSData.results.length} color="teal" darkMode={darkMode} />
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Event Name
                  </label>
                  <input
                    type="text"
                    value={shrsConfig.eventName}
                    onChange={(e) => setShrsConfig(prev => ({ ...prev, eventName: e.target.value }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                    } outline-none transition-colors`}
                    placeholder="Enter event name"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Number of Heats
                  </label>
                  <p className={`text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    How many heats were used in the SHRS event
                    {parsedSHRSData.detectedHeats > 0 && (
                      <span className="ml-1 text-teal-500">
                        (auto-detected: {parsedSHRSData.detectedHeats} from {parsedSHRSData.skippers.length} skippers)
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    {[2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setShrsConfig(prev => ({ ...prev, numberOfHeats: n }))}
                        className={`w-12 h-12 rounded-xl font-bold text-lg transition-all ${
                          shrsConfig.numberOfHeats === n
                            ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25'
                            : darkMode
                              ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-teal-500/50'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:border-teal-500/50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  darkMode ? 'bg-teal-900/15 border-teal-500/20' : 'bg-teal-50 border-teal-200'
                }`}>
                  <Info className="text-teal-400 shrink-0 mt-0.5" size={16} />
                  <div className={`text-xs space-y-1 ${darkMode ? 'text-teal-300' : 'text-teal-700'}`}>
                    <p>
                      <strong>Scoring Format:</strong> SHRS (Simple Heat Racing System)
                    </p>
                    <p>
                      <strong>Structure:</strong> {parsedSHRSData.qualifyingRounds} qualifying round{parsedSHRSData.qualifyingRounds !== 1 ? 's' : ''}
                      {parsedSHRSData.finalRounds > 0 && ` + ${parsedSHRSData.finalRounds} final round${parsedSHRSData.finalRounds !== 1 ? 's' : ''}`}
                      {' '}with {parsedSHRSData.skippers.length} skippers across {shrsConfig.numberOfHeats} heats.
                    </p>
                    <p>
                      Heat assignments will be reconstructed from results. Scoring uses position within heat.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'shrs-preview' && parsedSHRSData && (
            <div className="space-y-6">
              <button
                onClick={() => setStep('shrs-config')}
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
                    Skippers ({parsedSHRSData.skippers.length})
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
                        <th className={`px-4 py-2 text-right text-xs font-semibold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedSHRSData.skippers.slice(0, 20).map((s, i) => (
                        <tr key={i} className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
                          <td className={`px-4 py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.position}</td>
                          <td className={`px-4 py-2 font-mono font-semibold ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>{s.sailNumber}</td>
                          <td className={`px-4 py-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{s.name}</td>
                          <td className={`px-4 py-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{s.club || '-'}</td>
                          <td className={`px-4 py-2 text-right font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{s.totalScore ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedSHRSData.skippers.length > 20 && (
                    <p className={`px-4 py-2 text-xs text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      ... and {parsedSHRSData.skippers.length - 20} more skippers
                    </p>
                  )}
                </div>
              </div>

              <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <h4 className={`font-semibold text-sm mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Import Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Event Name" value={shrsConfig.eventName} darkMode={darkMode} />
                  <SummaryRow label="Scoring Format" value="SHRS (Simple Heat Racing System)" darkMode={darkMode} />
                  <SummaryRow label="Heats" value={String(shrsConfig.numberOfHeats)} darkMode={darkMode} />
                  <SummaryRow label="Qualifying Rounds" value={String(parsedSHRSData.qualifyingRounds)} darkMode={darkMode} />
                  <SummaryRow label="Final Rounds" value={String(parsedSHRSData.finalRounds)} darkMode={darkMode} />
                  <SummaryRow label="Total Races" value={String(parsedSHRSData.numRaces)} darkMode={darkMode} />
                  <SummaryRow label="Skippers" value={String(parsedSHRSData.skippers.length)} darkMode={darkMode} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`px-8 py-5 border-t flex items-center justify-between ${
          darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            onClick={
              step === 'scratch-config' ? () => setStep('choose')
              : step === 'format-select' ? () => { setStep('choose'); setRawFile(null); setFileName(''); }
              : step === 'shrs-config' ? () => { setStep('format-select'); setParsedSHRSData(null); }
              : step === 'hms-config' ? () => { setStep('format-select'); setParsedData(null); }
              : step === 'shrs-preview' ? () => setStep('shrs-config')
              : step === 'hms-preview' ? () => setStep('hms-config')
              : onClose
            }
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            {step === 'choose' ? 'Cancel' : 'Back'}
          </button>

          {step === 'format-select' && (
            <button
              onClick={handleFormatConfirm}
              disabled={uploading}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Parsing File...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          )}

          {step === 'scratch-config' && (
            <button
              onClick={handleCreateFromScratch}
              disabled={!scratchConfig.eventName.trim() || creating}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-500/20"
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

          {step === 'shrs-config' && (
            <button
              onClick={() => setStep('shrs-preview')}
              disabled={!shrsConfig.eventName.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-teal-500/20"
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

          {step === 'shrs-preview' && (
            <button
              onClick={handleCreateSHRSEvent}
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
