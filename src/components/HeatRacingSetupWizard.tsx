import React, { useState, useMemo } from 'react';
import { X, ChevronRight, ChevronLeft, Trophy, Users, Zap, Target, Check, Shuffle, ClipboardList, ArrowUpDown, Grid3x2 as Grid3X3, Eye, ClipboardCheck, Hand, Table2, Monitor, Tag } from 'lucide-react';
import { Logo } from './Logo';
import { motion, AnimatePresence } from 'framer-motion';
import { Skipper } from '../types';
import { HeatManagement, HeatConfiguration, SeedingMethod, HeatDesignation } from '../types/heat';
import { calculateOptimalHeats as calculateOptimalHeatsHMS, calculateHMSHeatSizes, seedInitialHeats, HMSConfig } from '../utils/hmsHeatSystem';
import { calculateOptimalHeats as calculateOptimalHeatsSHRS, calculateHeatSizes, seedInitialHeatsForSHRS, generatePreSetQualifyingAssignments, estimateDiversityMetrics } from '../utils/shrsHeatSystem';
import { DiversityGauge } from './DiversityGauge';

interface HeatRacingSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (settings: {
    numRaces: number;
    dropRules: number[] | string;
    heatManagement: HeatManagement | null;
    observerSettings?: {
      enable_observers?: boolean;
      observers_per_heat?: number;
      enable_roll_call?: boolean;
      auto_complete_sail?: boolean;
    };
    scoringMode?: 'pro' | 'touch' | 'spreadsheet';
    pendingSeedingAction?: 'manual' | 'ranking';
  }) => void;
  onSkip: () => void;
  skippers: Skipper[];
  darkMode: boolean;
}

type ScoringSystem = 'hms' | 'shrs';
type ShrsMode = 'progressive' | 'preset';
type ScoringMode = 'pro' | 'touch' | 'spreadsheet';
type Step = 'welcome' | 'system' | 'configure' | 'structure' | 'options' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'system', label: 'System' },
  { id: 'configure', label: 'Configure' },
  { id: 'structure', label: 'Structure' },
  { id: 'options', label: 'Options' },
  { id: 'review', label: 'Review' },
];

const NUM_RACES_OPTIONS = [6, 8, 10, 12, 14, 16];

export const HeatRacingSetupWizard: React.FC<HeatRacingSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  onSkip,
  skippers,
  darkMode,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [scoringSystem, setScoringSystem] = useState<ScoringSystem>('shrs');
  const [shrsMode, setShrsMode] = useState<ShrsMode>('preset');
  const [numHeats, setNumHeats] = useState<number>(0);
  const [promotionCount, setPromotionCount] = useState<number>(4);
  const [numRaces, setNumRaces] = useState<number>(12);
  const [qualifyingRounds, setQualifyingRounds] = useState<number>(8);
  const [finalsRounds, setFinalsRounds] = useState<number>(4);
  const [seedingMethod, setSeedingMethod] = useState<SeedingMethod>('random');
  const [enableObservers, setEnableObservers] = useState(false);
  const [observersPerHeat, setObserversPerHeat] = useState(2);
  const [enableRollCall, setEnableRollCall] = useState(true);
  const [scoringMode, setScoringMode] = useState<ScoringMode>('touch');
  const [fleetManagementEnabled, setFleetManagementEnabled] = useState(true);
  const [heatLabelStyle, setHeatLabelStyle] = useState<'letters' | 'numbers'>('letters');
  const [heatOrder, setHeatOrder] = useState<'ascending' | 'descending'>('ascending');

  const totalSkippers = skippers.length;

  const hmsDefaults = useMemo(() => calculateOptimalHeatsHMS(totalSkippers), [totalSkippers]);
  const shrsDefaultHeats = useMemo(() => calculateOptimalHeatsSHRS(totalSkippers), [totalSkippers]);

  const effectiveHeats = numHeats || (scoringSystem === 'hms' ? hmsDefaults.numberOfHeats : shrsDefaultHeats);

  const heatSizes = useMemo(() => {
    if (scoringSystem === 'hms') {
      return calculateHMSHeatSizes(totalSkippers, effectiveHeats);
    }
    return calculateHeatSizes(totalSkippers, effectiveHeats);
  }, [scoringSystem, totalSkippers, effectiveHeats]);

  const diversityMetrics = useMemo(() => {
    if (scoringSystem === 'shrs') {
      return estimateDiversityMetrics(totalSkippers, effectiveHeats, qualifyingRounds);
    }
    return null;
  }, [scoringSystem, totalSkippers, effectiveHeats, qualifyingRounds]);

  const handleSystemSelect = (system: ScoringSystem) => {
    setScoringSystem(system);
    if (system === 'hms') {
      setNumHeats(hmsDefaults.numberOfHeats);
      setPromotionCount(hmsDefaults.promotionCount);
    } else {
      setNumHeats(shrsDefaultHeats);
      const rec = estimateDiversityMetrics(totalSkippers, shrsDefaultHeats, 8).recommendedMinRounds;
      setQualifyingRounds(rec);
      setFinalsRounds(Math.max(2, numRaces - rec));
    }
  };

  const handleQualifyingChange = (q: number) => {
    setQualifyingRounds(q);
    setFinalsRounds(Math.max(0, numRaces - q));
  };

  const handleFinalsChange = (f: number) => {
    setFinalsRounds(f);
    setQualifyingRounds(Math.max(1, numRaces - f));
  };

  const handleNumRacesChange = (n: number) => {
    setNumRaces(n);
    if (scoringSystem === 'shrs') {
      const rec = diversityMetrics?.recommendedMinRounds || 8;
      setQualifyingRounds(Math.min(rec, n));
      setFinalsRounds(Math.max(0, n - Math.min(rec, n)));
    }
  };

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);

  const goNext = () => {
    const idx = STEPS.findIndex(s => s.id === currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1].id);
    }
  };

  const goBack = () => {
    const idx = STEPS.findIndex(s => s.id === currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1].id);
    }
  };

  const handleActivate = () => {
    const heatDesignations: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E'];
    let rounds;

    // Determine if this seeding method should defer to a modal
    const needsManualModal = seedingMethod === 'manual' && (
      (scoringSystem === 'shrs' && shrsMode === 'progressive') ||
      (scoringSystem === 'hms' && fleetManagementEnabled)
    );
    const needsRankingModal = seedingMethod === 'ranking' && (
      (scoringSystem === 'shrs' && shrsMode === 'progressive') ||
      (scoringSystem === 'hms' && fleetManagementEnabled)
    );

    if (needsManualModal || needsRankingModal) {
      // Create configuration with empty placeholder round - the modal will provide real assignments
      const emptyAssignments = Array.from({ length: effectiveHeats }, (_, i) => ({
        heatDesignation: heatDesignations[i] as HeatDesignation,
        skipperIndices: [] as number[]
      }));

      rounds = [{
        round: 1,
        heatAssignments: emptyAssignments,
        results: [],
        completed: false
      }];

      const configuration: HeatConfiguration = {
        enabled: true,
        numberOfHeats: effectiveHeats,
        promotionCount: scoringSystem === 'hms' ? promotionCount : 0,
        seedingMethod,
        autoAssign: false,
        scoringSystem,
        fleetManagementEnabled,
        heatLabelStyle,
        heatOrder,
        ...(scoringSystem === 'shrs' ? {
          shrsAssignmentMode: shrsMode,
          shrsQualifyingRounds: qualifyingRounds,
        } : {}),
      };

      const heatManagement: HeatManagement = {
        configuration,
        rounds,
        currentRound: 1,
        currentHeat: heatDesignations[effectiveHeats - 1],
      };

      const dropRules: string = scoringSystem;

      onComplete({
        numRaces,
        dropRules,
        heatManagement,
        observerSettings: {
          enable_observers: enableObservers,
          observers_per_heat: observersPerHeat,
          enable_roll_call: enableRollCall,
          auto_complete_sail: true,
        },
        scoringMode,
        pendingSeedingAction: needsManualModal ? 'manual' : 'ranking',
      });
      return;
    }

    // Build ranking data from skippers' national_ranking field
    const rankingData = skippers
      .map((s, idx) => ({ skipperIndex: idx, ranking: s.national_ranking || 0 }))
      .filter(r => r.ranking > 0);

    // Build seeding list ordered by national ranking (sail numbers sorted by rank)
    const seedingList = seedingMethod === 'ranking' && rankingData.length > 0
      ? [...rankingData]
          .sort((a, b) => a.ranking - b.ranking)
          .map(r => skippers[r.skipperIndex].sailNo || skippers[r.skipperIndex].sailNumber || '')
          .filter(Boolean)
      : undefined;

    if (scoringSystem === 'shrs') {
      const heatsMap = seedInitialHeatsForSHRS(skippers, effectiveHeats, seedingList);
      const initialAssignments = Array.from({ length: effectiveHeats }, (_, i) => {
        const heatSkippers = heatsMap.get(i + 1) || [];
        return {
          heatDesignation: heatDesignations[i] as string,
          skipperIndices: heatSkippers.map(s => skippers.findIndex(sk => (sk.sailNo || sk.sailNumber) === (s.sailNo || s.sailNumber)))
        };
      });

      if (shrsMode === 'preset' && qualifyingRounds > 1) {
        const allQR = generatePreSetQualifyingAssignments(initialAssignments, effectiveHeats, qualifyingRounds);
        rounds = allQR.map((ra, idx) => ({
          round: idx + 1,
          heatAssignments: ra.map(a => ({
            heatDesignation: a.heatDesignation as HeatDesignation,
            skipperIndices: a.skipperIndices
          })),
          results: [],
          completed: false
        }));
      } else {
        rounds = [{
          round: 1,
          heatAssignments: initialAssignments.map(a => ({
            heatDesignation: a.heatDesignation as HeatDesignation,
            skipperIndices: a.skipperIndices
          })),
          results: [],
          completed: false
        }];
      }
    } else {
      const hmsConfig: HMSConfig = {
        numberOfHeats: effectiveHeats,
        promotionCount,
        seedingMethod: fleetManagementEnabled ? seedingMethod : 'manual',
      };
      const initialAssignments = seedInitialHeats(
        skippers,
        hmsConfig,
        seedingMethod === 'ranking' ? rankingData : undefined
      );

      rounds = [{
        round: 1,
        heatAssignments: initialAssignments,
        results: [],
        completed: false
      }];
    }

    const configuration: HeatConfiguration = {
      enabled: true,
      numberOfHeats: effectiveHeats,
      promotionCount: scoringSystem === 'hms' ? promotionCount : 0,
      seedingMethod,
      autoAssign: false,
      scoringSystem,
      fleetManagementEnabled,
      heatLabelStyle,
      heatOrder,
      ...(scoringSystem === 'shrs' ? {
        shrsAssignmentMode: shrsMode,
        shrsQualifyingRounds: qualifyingRounds,
      } : {}),
    };

    const heatManagement: HeatManagement = {
      configuration,
      rounds,
      currentRound: 1,
      currentHeat: rounds[0].heatAssignments[rounds[0].heatAssignments.length - 1].heatDesignation,
    };

    const dropRules: string = scoringSystem;

    onComplete({
      numRaces,
      dropRules,
      heatManagement,
      observerSettings: {
        enable_observers: enableObservers,
        observers_per_heat: observersPerHeat,
        enable_roll_call: enableRollCall,
        auto_complete_sail: true,
      },
      scoringMode,
    });
  };

  if (!isOpen) return null;

  const renderWelcomeStep = () => (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center text-center px-4"
    >
      <div className="mb-6">
        <Logo size="xlarge" />
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
        Heat Racing Detected
      </h2>

      <p className="text-slate-400 text-base sm:text-lg max-w-lg mb-2">
        With <span className="text-teal-400 font-semibold">{totalSkippers} skippers</span> in your fleet,
        AlfiePRO recommends Heat Racing for optimal competition.
      </p>

      <p className="text-slate-500 text-sm max-w-md mb-8">
        Skippers will be divided into smaller heats ensuring fairer racing and better
        tie-breaking across the fleet.
      </p>

      <div className="grid grid-cols-3 gap-4 sm:gap-6 mb-10 w-full max-w-sm">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 sm:p-4">
          <Users size={20} className="text-teal-400 mx-auto mb-1.5" />
          <div className="text-lg sm:text-xl font-bold text-white">{totalSkippers}</div>
          <div className="text-[11px] sm:text-xs text-slate-500">Skippers</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 sm:p-4">
          <Grid3X3 size={20} className="text-cyan-400 mx-auto mb-1.5" />
          <div className="text-lg sm:text-xl font-bold text-white">{shrsDefaultHeats}</div>
          <div className="text-[11px] sm:text-xs text-slate-500">Heats</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 sm:p-4">
          <Target size={20} className="text-green-400 mx-auto mb-1.5" />
          <div className="text-lg sm:text-xl font-bold text-white">100%</div>
          <div className="text-[11px] sm:text-xs text-slate-500">Diversity</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <button
          onClick={goNext}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-teal-500/20"
        >
          Guide Me
          <ChevronRight size={18} />
        </button>
        <button
          onClick={onSkip}
          className="flex-1 px-6 py-3.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-300 hover:text-white font-medium rounded-xl transition-all"
        >
          I'll Set It Up Manually
        </button>
      </div>
    </motion.div>
  );

  const renderSystemStep = () => (
    <motion.div
      key="system"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="px-4 w-full max-w-2xl mx-auto"
    >
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
        Choose Your Scoring System
      </h2>
      <p className="text-slate-400 text-sm sm:text-base text-center mb-8">
        Select the heat racing format that best suits your event.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <button
          onClick={() => handleSystemSelect('shrs')}
          className={`relative text-left p-5 sm:p-6 rounded-2xl border-2 transition-all ${
            scoringSystem === 'shrs'
              ? 'border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10'
              : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
          }`}
        >
          {scoringSystem === 'shrs' && (
            <div className="absolute top-3 right-3 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
              <Check size={14} className="text-white" />
            </div>
          )}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
            scoringSystem === 'shrs' ? 'bg-teal-500/20' : 'bg-slate-700/50'
          }`}>
            <Zap size={24} className={scoringSystem === 'shrs' ? 'text-teal-400' : 'text-slate-400'} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">SHRS</h3>
          <p className="text-xs text-teal-400 font-medium mb-3">Simple Heat Race System</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
              Fixed qualifying rounds with optional finals
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
              Pre-assigned heats maximise opponent diversity
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
              Gold/Silver/Bronze fleet finals
            </li>
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            <span className="text-xs font-medium text-teal-400 bg-teal-400/10 px-2 py-1 rounded-full">
              Recommended
            </span>
          </div>
        </button>

        <button
          onClick={() => handleSystemSelect('hms')}
          className={`relative text-left p-5 sm:p-6 rounded-2xl border-2 transition-all ${
            scoringSystem === 'hms'
              ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
              : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
          }`}
        >
          {scoringSystem === 'hms' && (
            <div className="absolute top-3 right-3 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
              <Check size={14} className="text-white" />
            </div>
          )}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
            scoringSystem === 'hms' ? 'bg-amber-500/20' : 'bg-slate-700/50'
          }`}>
            <ArrowUpDown size={24} className={scoringSystem === 'hms' ? 'text-amber-400' : 'text-slate-400'} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">HMS</h3>
          <p className="text-xs text-amber-400 font-medium mb-3">Heat Management System</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              Promotion & relegation between heats
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              Skippers move up/down based on results
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              Dynamic fleet balancing every round
            </li>
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            <span className="text-xs font-medium text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
              Traditional
            </span>
          </div>
        </button>
      </div>
    </motion.div>
  );

  const renderConfigureStep = () => {
    const accent = scoringSystem === 'shrs' ? 'teal' : 'amber';

    return (
      <motion.div
        key="configure"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="px-4 w-full max-w-2xl mx-auto"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
          {scoringSystem === 'shrs' ? 'SHRS Configuration' : 'HMS Configuration'}
        </h2>
        <p className="text-slate-400 text-sm sm:text-base text-center mb-8">
          {scoringSystem === 'shrs'
            ? 'Choose how heat assignments are managed across rounds.'
            : 'Configure promotion/relegation settings for your heats.'}
        </p>

        {scoringSystem === 'shrs' ? (
          <div className="space-y-6">
            {/* Assignment Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Assignment Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setShrsMode('preset')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    shrsMode === 'preset'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <ClipboardList size={20} className={shrsMode === 'preset' ? 'text-teal-400' : 'text-slate-400'} />
                    <span className="font-semibold text-white text-sm">Pre-Assigned</span>
                    {shrsMode === 'preset' && <Check size={16} className="text-teal-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-400">
                    All qualifying heats pre-assigned before racing. Maximises opponent diversity.
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-medium text-teal-400 bg-teal-400/10 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </button>

                <button
                  onClick={() => setShrsMode('progressive')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    shrsMode === 'progressive'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Shuffle size={20} className={shrsMode === 'progressive' ? 'text-teal-400' : 'text-slate-400'} />
                    <span className="font-semibold text-white text-sm">Progressive</span>
                    {shrsMode === 'progressive' && <Check size={16} className="text-teal-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-400">
                    Round 1 assigned, subsequent rounds determined using movement tables.
                  </p>
                </button>
              </div>
            </div>

            {/* Heat Count */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Number of Heats</label>
              <div className="flex items-center gap-3">
                {[2, 3, 4, 5].map(h => (
                  <button
                    key={h}
                    onClick={() => setNumHeats(h)}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-all ${
                      effectiveHeats === h
                        ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {heatSizes.join(', ')} skippers per heat
              </p>
            </div>

            {/* Seeding - only show for Progressive mode (Pre-Assigned uses the algorithm) */}
            {shrsMode === 'progressive' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Initial Seeding</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setSeedingMethod('random')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'random'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Shuffle size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">Random</span>
                  </button>
                  <button
                    onClick={() => setSeedingMethod('ranking')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'ranking'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Trophy size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">National Ranking</span>
                  </button>
                  <button
                    onClick={() => setSeedingMethod('manual')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'manual'
                        ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <ClipboardList size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">Manual</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // HMS Configuration
          <div className="space-y-6">
            {/* Fleet Management Toggle */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <ArrowUpDown size={18} className="text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Fleet Management</h4>
                    <p className="text-xs text-slate-400">Auto promotion/relegation between heats</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const newValue = !fleetManagementEnabled;
                    setFleetManagementEnabled(newValue);
                    if (!newValue) {
                      setScoringMode('spreadsheet');
                    }
                  }}
                  className={`relative w-12 h-6 rounded-full transition-all ${
                    fleetManagementEnabled ? 'bg-amber-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    fleetManagementEnabled ? 'left-[26px]' : 'left-0.5'
                  }`} />
                </button>
              </div>
              {!fleetManagementEnabled && (
                <p className="text-xs text-slate-500 mt-3 pl-12">
                  Manual spreadsheet scoring only - no automatic heat assignments or promotion.
                </p>
              )}
            </div>

            {/* Heat Count */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Number of Heats</label>
              <div className="flex items-center gap-3">
                {[2, 3, 4, 5].map(h => (
                  <button
                    key={h}
                    onClick={() => setNumHeats(h)}
                    className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-all ${
                      effectiveHeats === h
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {heatSizes.join(', ')} skippers per heat
              </p>
            </div>

            {/* Promotion Count */}
            {fleetManagementEnabled && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Promotion Count</label>
                <p className="text-xs text-slate-500 mb-3">
                  Number of skippers promoted/relegated each round.
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setPromotionCount(Math.max(2, promotionCount - 1))}
                    className="w-10 h-10 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all"
                  >
                    -
                  </button>
                  <div className="text-2xl font-bold text-amber-400 w-12 text-center">{promotionCount}</div>
                  <button
                    onClick={() => setPromotionCount(Math.min(12, promotionCount + 1))}
                    className="w-10 h-10 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Seeding - only show when Fleet Management is enabled */}
            {fleetManagementEnabled && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Initial Seeding</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setSeedingMethod('random')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'random'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Shuffle size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">Random</span>
                  </button>
                  <button
                    onClick={() => setSeedingMethod('ranking')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'ranking'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Trophy size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">National Ranking</span>
                  </button>
                  <button
                    onClick={() => setSeedingMethod('manual')}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      seedingMethod === 'manual'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <ClipboardList size={18} className="mx-auto mb-1" />
                    <span className="text-xs font-medium">Manual</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  const renderStructureStep = () => (
    <motion.div
      key="structure"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="px-4 w-full max-w-2xl mx-auto"
    >
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
        Race Structure
      </h2>
      <p className="text-slate-400 text-sm sm:text-base text-center mb-8">
        {scoringSystem === 'shrs'
          ? 'Set total races and the qualifying-to-finals split.'
          : 'Set the number of races for your event.'}
      </p>

      <div className="space-y-6">
        {/* Total Races */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">Total Races</label>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {NUM_RACES_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => handleNumRacesChange(n)}
                className={`px-4 py-2.5 rounded-xl border-2 font-semibold transition-all text-sm ${
                  numRaces === n
                    ? scoringSystem === 'shrs'
                      ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                      : 'border-amber-500 bg-amber-500/10 text-amber-400'
                    : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* SHRS: Qualifying vs Finals split */}
        {scoringSystem === 'shrs' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                  Qualifying Rounds
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQualifyingChange(Math.max(1, qualifyingRounds - 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all text-sm"
                  >
                    -
                  </button>
                  <div className="flex-1 text-center py-1.5 rounded-lg bg-slate-800/60">
                    <span className="text-2xl font-bold text-teal-400">{qualifyingRounds}</span>
                  </div>
                  <button
                    onClick={() => handleQualifyingChange(Math.min(numRaces, qualifyingRounds + 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                  Finals Rounds
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFinalsChange(Math.max(0, finalsRounds - 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all text-sm"
                  >
                    -
                  </button>
                  <div className="flex-1 text-center py-1.5 rounded-lg bg-slate-800/60">
                    <span className="text-2xl font-bold text-cyan-400">{finalsRounds}</span>
                  </div>
                  <button
                    onClick={() => handleFinalsChange(Math.min(numRaces - 1, finalsRounds + 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white flex items-center justify-center hover:bg-slate-700 transition-all text-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Diversity Gauge */}
            {shrsMode === 'preset' && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <DiversityGauge
                  totalSkippers={totalSkippers}
                  numberOfHeats={effectiveHeats}
                  qualifyingRounds={qualifyingRounds}
                  darkMode={true}
                />
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );

  const renderOptionsStep = () => {
    const accent = scoringSystem === 'shrs' ? 'teal' : 'amber';

    return (
      <motion.div
        key="options"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="px-4 w-full max-w-2xl mx-auto"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
          Scoring & Race Options
        </h2>
        <p className="text-slate-400 text-sm sm:text-base text-center mb-8">
          Configure how you'll score races and optional race day features.
        </p>

        <div className="space-y-5">
          {/* Scoring Mode */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Scoring Input Mode</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setScoringMode('touch')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  scoringMode === 'touch'
                    ? scoringSystem === 'shrs' ? 'border-teal-500 bg-teal-500/10' : 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <Hand size={22} className={`mx-auto mb-2 ${scoringMode === 'touch' ? (scoringSystem === 'shrs' ? 'text-teal-400' : 'text-amber-400') : 'text-slate-400'}`} />
                <span className={`text-xs font-semibold block ${scoringMode === 'touch' ? 'text-white' : 'text-slate-400'}`}>Touch</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Tap to score</span>
              </button>
              <button
                onClick={() => setScoringMode('pro')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  scoringMode === 'pro'
                    ? scoringSystem === 'shrs' ? 'border-teal-500 bg-teal-500/10' : 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <Monitor size={22} className={`mx-auto mb-2 ${scoringMode === 'pro' ? (scoringSystem === 'shrs' ? 'text-teal-400' : 'text-amber-400') : 'text-slate-400'}`} />
                <span className={`text-xs font-semibold block ${scoringMode === 'pro' ? 'text-white' : 'text-slate-400'}`}>PRO</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Full control</span>
              </button>
              <button
                onClick={() => setScoringMode('spreadsheet')}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  scoringMode === 'spreadsheet'
                    ? scoringSystem === 'shrs' ? 'border-teal-500 bg-teal-500/10' : 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                }`}
              >
                <Table2 size={22} className={`mx-auto mb-2 ${scoringMode === 'spreadsheet' ? (scoringSystem === 'shrs' ? 'text-teal-400' : 'text-amber-400') : 'text-slate-400'}`} />
                <span className={`text-xs font-semibold block ${scoringMode === 'spreadsheet' ? 'text-white' : 'text-slate-400'}`}>Spreadsheet</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Grid entry</span>
              </button>
            </div>
          </div>

          {/* Observer System - only relevant when fleet management is active */}
          {(scoringSystem === 'shrs' || fleetManagementEnabled) && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Eye size={18} className="text-blue-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Observer System</h4>
                  <p className="text-xs text-slate-400">Non-racing skippers monitor for rule infringements</p>
                </div>
              </div>
              <button
                onClick={() => setEnableObservers(!enableObservers)}
                className={`relative w-12 h-6 rounded-full transition-all ${
                  enableObservers ? 'bg-blue-500' : 'bg-slate-600'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                  enableObservers ? 'left-[26px]' : 'left-0.5'
                }`} />
              </button>
            </div>
            {enableObservers && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-slate-300">Observers Per Heat</span>
                    <p className="text-xs text-slate-500">Number of observers assigned to each heat</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setObserversPerHeat(Math.max(2, observersPerHeat - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white text-sm font-bold transition-colors"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-white font-semibold">{observersPerHeat}</span>
                    <button
                      onClick={() => setObserversPerHeat(Math.min(10, observersPerHeat + 1))}
                      className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white text-sm font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Roll Call - only relevant when fleet management is active */}
          {(scoringSystem === 'shrs' || fleetManagementEnabled) && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <ClipboardCheck size={18} className="text-green-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Roll Call Before Scoring</h4>
                  <p className="text-xs text-slate-400">Mark skippers present/absent before each heat</p>
                </div>
              </div>
              <button
                onClick={() => setEnableRollCall(!enableRollCall)}
                className={`relative w-12 h-6 rounded-full transition-all ${
                  enableRollCall ? 'bg-green-500' : 'bg-slate-600'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                  enableRollCall ? 'left-[26px]' : 'left-0.5'
                }`} />
              </button>
            </div>
          </div>
          )}

          {/* Heat Identification & Order - SHRS only */}
          {scoringSystem === 'shrs' && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-teal-500/20 flex items-center justify-center">
                <Tag size={18} className="text-teal-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Heat Scoring Options</h4>
                <p className="text-xs text-slate-400">Configure heat labelling and scoring order</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                Heat Identification
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setHeatLabelStyle('letters')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    heatLabelStyle === 'letters'
                      ? 'bg-teal-500/20 border-2 border-teal-500 text-white'
                      : 'bg-slate-700/50 border-2 border-slate-700/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  Letters (A, B, C)
                </button>
                <button
                  onClick={() => setHeatLabelStyle('numbers')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    heatLabelStyle === 'numbers'
                      ? 'bg-teal-500/20 border-2 border-teal-500 text-white'
                      : 'bg-slate-700/50 border-2 border-slate-700/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  Numbers (1, 2, 3)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                Heat Racing Order
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setHeatOrder('ascending')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    heatOrder === 'ascending'
                      ? 'bg-teal-500/20 border-2 border-teal-500 text-white'
                      : 'bg-slate-700/50 border-2 border-slate-700/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {heatLabelStyle === 'letters' ? 'A, B' : '1, 2'}
                </button>
                <button
                  onClick={() => setHeatOrder('descending')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    heatOrder === 'descending'
                      ? 'bg-teal-500/20 border-2 border-teal-500 text-white'
                      : 'bg-slate-700/50 border-2 border-slate-700/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {heatLabelStyle === 'letters' ? 'B, A' : '2, 1'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">Sets the display and scoring order of heats</p>
            </div>
          </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderReviewStep = () => {
    const accentColor = scoringSystem === 'shrs' ? 'teal' : 'amber';

    return (
      <motion.div
        key="review"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="px-4 w-full max-w-2xl mx-auto"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
          Ready to Activate
        </h2>
        <p className="text-slate-400 text-sm sm:text-base text-center mb-6">
          Review your heat racing configuration.
        </p>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 sm:p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 sm:gap-5">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">System</span>
              <p className={`text-lg font-bold ${accentColor === 'teal' ? 'text-teal-400' : 'text-amber-400'}`}>
                {scoringSystem === 'shrs' ? 'SHRS' : 'HMS'}
              </p>
            </div>
            {scoringSystem === 'shrs' && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Mode</span>
                <p className="text-lg font-bold text-white">
                  {shrsMode === 'preset' ? 'Pre-Assigned' : 'Progressive'}
                </p>
              </div>
            )}
            {scoringSystem === 'hms' && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Fleet Mgmt</span>
                <p className="text-lg font-bold text-white">
                  {fleetManagementEnabled ? 'Active' : 'Off'}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Heats</span>
              <p className="text-lg font-bold text-white">{effectiveHeats} ({heatSizes.join('/')})</p>
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Total Races</span>
              <p className="text-lg font-bold text-white">{numRaces}</p>
            </div>
            {scoringSystem === 'shrs' && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Structure</span>
                <p className="text-lg font-bold text-white">{qualifyingRounds}Q + {finalsRounds}F</p>
              </div>
            )}
            {scoringSystem === 'hms' && fleetManagementEnabled && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Promotion</span>
                <p className="text-lg font-bold text-white">{promotionCount} boats</p>
              </div>
            )}
            {((scoringSystem === 'shrs' && shrsMode === 'progressive') || (scoringSystem === 'hms' && fleetManagementEnabled)) && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Seeding</span>
                <p className="text-lg font-bold text-white capitalize">
                  {seedingMethod === 'ranking' ? 'National Ranking' : seedingMethod}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Scoring Mode</span>
              <p className="text-lg font-bold text-white capitalize">{scoringMode === 'pro' ? 'PRO' : scoringMode === 'spreadsheet' ? 'Spreadsheet' : 'Touch'}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Options</span>
              <p className="text-sm font-medium text-white">
                {[enableObservers && 'Observers', enableRollCall && 'Roll Call'].filter(Boolean).join(', ') || 'None'}
              </p>
            </div>
          </div>

          {scoringSystem === 'shrs' && shrsMode === 'preset' && diversityMetrics && (
            <div className="mt-5 pt-5 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Opponent Diversity</span>
                  <p className="text-2xl font-bold text-green-400">
                    {diversityMetrics.roundStats[qualifyingRounds - 1]?.efficiency || 0}%
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Unique Opponents</span>
                  <p className="text-2xl font-bold text-white">
                    {Math.round(diversityMetrics.roundStats[qualifyingRounds - 1]?.avgUnique || 0)} of {diversityMetrics.totalPossibleOpponents}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleActivate}
          className={`w-full flex items-center justify-center gap-2 px-6 py-4 font-semibold rounded-xl transition-all shadow-lg text-white ${
            scoringSystem === 'shrs'
              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 shadow-teal-500/20'
              : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-500/20'
          }`}
        >
          <Trophy size={20} />
          Activate Heat Racing
        </button>

        <p className="text-xs text-slate-500 text-center mt-3">
          You can adjust these settings anytime from Race Settings.
        </p>
      </motion.div>
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome': return renderWelcomeStep();
      case 'system': return renderSystemStep();
      case 'configure': return renderConfigureStep();
      case 'structure': return renderStructureStep();
      case 'options': return renderOptionsStep();
      case 'review': return renderReviewStep();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[90vh] mx-4 flex flex-col bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-700/30">
          <div className="flex items-center gap-2">
            <Logo size="small" />
            <span className="text-sm font-medium text-white">Heat Racing Setup</span>
          </div>
          <div className="flex items-center gap-3">
            {currentStep !== 'welcome' && (
              <button
                onClick={onSkip}
                className="text-xs text-slate-400 hover:text-white transition-all px-3 py-1.5 rounded-lg hover:bg-slate-700/50"
              >
                Skip Wizard
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-all p-1.5 rounded-lg hover:bg-slate-700/50"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Progress Bar (hidden on welcome step) */}
        {currentStep !== 'welcome' && (
          <div className="px-5 sm:px-6 pt-4">
            <div className="flex items-center justify-between mb-3">
              {STEPS.slice(1).map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                        stepIndex > index + 1
                          ? 'bg-teal-500 text-white'
                          : stepIndex === index + 1
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-700/50 border border-slate-600/50 text-slate-400'
                      }`}
                    >
                      {stepIndex > index + 1 ? <Check size={14} /> : index + 1}
                    </div>
                    <span className={`text-[10px] sm:text-xs mt-1 hidden sm:block ${
                      stepIndex === index + 1 ? 'text-teal-400 font-medium' : 'text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 2 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded transition-all ${
                      stepIndex > index + 1 ? 'bg-teal-500' : 'bg-slate-700/50'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-6 sm:py-8">
          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>
        </div>

        {/* Footer Navigation (shown on all steps except welcome) */}
        {currentStep !== 'welcome' && currentStep !== 'review' && (
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-t border-slate-700/30">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 py-2.5 text-slate-400 hover:text-white transition-all rounded-lg hover:bg-slate-700/50"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <button
              onClick={goNext}
              className={`flex items-center gap-1.5 px-5 py-2.5 font-medium rounded-xl transition-all text-white ${
                scoringSystem === 'shrs'
                  ? 'bg-teal-600 hover:bg-teal-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Review step gets its own footer with Back */}
        {currentStep === 'review' && (
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-t border-slate-700/30">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 px-4 py-2.5 text-slate-400 hover:text-white transition-all rounded-lg hover:bg-slate-700/50"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <div />
          </div>
        )}
      </div>
    </div>
  );
};
