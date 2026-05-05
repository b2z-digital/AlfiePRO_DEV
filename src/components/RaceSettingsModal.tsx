import React, { useState, useEffect } from 'react';
import { X, Settings, Trophy, Users, Shuffle, Hash, Award, Sun, Moon, SquarePen as Edit2, Check, TriangleAlert as AlertTriangle, Sailboat, Eye, Grid3x2 as Grid3X3, ClipboardCheck, Table2, Hand } from 'lucide-react';
import { HeatManagement, HeatConfiguration, SeedingMethod } from '../types/heat';
import { Skipper } from '../types';
import { seedInitialHeats, validateHeatConfig, validateHeatAssignments, HMSConfig, calculateOptimalHeats, calculateHMSHeatSizes } from '../utils/hmsHeatSystem';
import { seedInitialHeatsForSHRS, calculateOptimalHeats as calculateOptimalHeatsSHRS, validateSHRSConfig, SHRSConfig, generatePreSetQualifyingAssignments, seedSHRSHeatsByIndex, estimateDiversityMetrics } from '../utils/shrsHeatSystem';
import { ManualHeatAssignmentModal } from './ManualHeatAssignmentModal';
import { HMSSeedingModal } from './HMSSeedingModal';
import { ConfirmationModal } from './ConfirmationModal';
import { DiversityGauge } from './DiversityGauge';
import { supabase } from '../utils/supabase';

interface RaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleDarkMode?: () => void;
  skippers: Skipper[];
  initialHeatManagement: HeatManagement | null;
  initialNumRaces: number;
  initialDropRules?: number[] | string; // Optional, defaults to RRS Appendix A
  onSaveSettings: (settings: {
    numRaces: number;
    dropRules: number[] | string;
    heatManagement: HeatManagement | null;
    displaySettings?: {
      show_flag?: boolean;
      show_country?: boolean;
    };
    observerSettings?: {
      enable_observers?: boolean;
      observers_per_heat?: number;
      enable_roll_call?: boolean;
      auto_complete_sail?: boolean;
    };
  }) => void;
  onManageSkippers?: () => void;
  addNotification?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
  hasRaceResults?: boolean;
  onClearAllRaceResults?: () => void;
  onScoringModeChange?: (mode: 'pro' | 'touch' | 'spreadsheet') => void;
  currentEvent?: any;
  autoEnableHeatRacing?: boolean;
}

const DROP_RULE_OPTIONS = [
  { label: 'No Discards', value: [], forHeatRacing: false },
  { label: 'Low Point System (1 after 4, 2 after 8, 3 after 12 and then every 4 races after)', value: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40], forHeatRacing: false },
  { label: 'RRS - Appendix A Scoring System (1 after 4, 2 after 8, 3 after 16 and then every 8 races after)', value: [4, 8, 16, 24, 32, 40], forHeatRacing: false },
  { label: 'HMS Heat System', value: 'hms', forHeatRacing: true },
  { label: 'SHRS - Simple Heat Race System (1 after 4, 2 after 8, +1 per 8 races)', value: 'shrs', forHeatRacing: true },
  { label: 'Custom', value: 'custom', forHeatRacing: false }
];

const NUM_RACES_OPTIONS = [6, 8, 10, 12];

export const RaceSettingsModal: React.FC<RaceSettingsModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onToggleDarkMode,
  skippers,
  initialHeatManagement,
  initialNumRaces = 12,
  initialDropRules = [4, 8, 16, 24, 32, 40], // RRS - Appendix A default
  onSaveSettings,
  onManageSkippers,
  addNotification,
  hasRaceResults = false,
  onClearAllRaceResults,
  onScoringModeChange,
  currentEvent,
  autoEnableHeatRacing = false
}) => {
  const [currentNumRaces, setCurrentNumRaces] = useState(initialNumRaces);
  const [currentDropRules, setCurrentDropRules] = useState<number[] | string>(initialDropRules);
  const [customDropRules, setCustomDropRules] = useState('');
  const [isCustomDropRules, setIsCustomDropRules] = useState(false);
  const [showFlag, setShowFlag] = useState(currentEvent?.show_flag ?? false);
  const [showCountry, setShowCountry] = useState(currentEvent?.show_country ?? false);
  const [isHeatRacingEnabled, setIsHeatRacingEnabled] = useState(
    initialHeatManagement?.configuration.enabled || false
  );
  const [currentHeatManagement, setCurrentHeatManagement] = useState<HeatManagement | null>(initialHeatManagement);
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch' | 'spreadsheet'>('pro');
  const [nationalAssociationId, setNationalAssociationId] = useState<string | undefined>(undefined);

  const [fleetManagementEnabled, setFleetManagementEnabled] = useState(
    initialHeatManagement?.configuration.fleetManagementEnabled ?? true
  );
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [pendingRegenerateAction, setPendingRegenerateAction] = useState<(() => void) | null>(null);

  // Observer settings
  const [enableObservers, setEnableObservers] = useState(currentEvent?.enable_observers ?? true);
  const [observersPerHeat, setObserversPerHeat] = useState(currentEvent?.observers_per_heat ?? 2);
  const [enableRollCall, setEnableRollCall] = useState(currentEvent?.enable_roll_call ?? false);
  const [autoCompleteSail, setAutoCompleteSail] = useState(currentEvent?.auto_complete_sail ?? true);

  useEffect(() => {
    if (!isOpen) return;
    if (currentEvent?.enable_observers !== undefined) setEnableObservers(currentEvent.enable_observers);
    if (currentEvent?.observers_per_heat !== undefined) setObserversPerHeat(currentEvent.observers_per_heat);
    if (currentEvent?.enable_roll_call !== undefined) setEnableRollCall(currentEvent.enable_roll_call);
    if (currentEvent?.auto_complete_sail !== undefined) setAutoCompleteSail(currentEvent.auto_complete_sail);
    if (currentEvent?.show_flag !== undefined) setShowFlag(currentEvent.show_flag);
    if (currentEvent?.show_country !== undefined) setShowCountry(currentEvent.show_country);
  }, [isOpen, currentEvent?.id, currentEvent?.enable_roll_call, currentEvent?.auto_complete_sail, currentEvent?.enable_observers, currentEvent?.observers_per_heat, currentEvent?.show_flag, currentEvent?.show_country]);

  // Start system

  // SHRS qualifying/finals structure
  const [shrsQualifyingRounds, setShrsQualifyingRounds] = useState(
    initialHeatManagement?.configuration.shrsQualifyingRounds || Math.max(2, Math.floor(initialNumRaces * 2 / 3))
  );
  const [shrsAssignmentMode, setShrsAssignmentMode] = useState<'progressive' | 'preset'>(
    initialHeatManagement?.configuration.shrsAssignmentMode || 'preset'
  );

  // Heat display settings
  const [heatLabelStyle, setHeatLabelStyle] = useState<'letters' | 'numbers'>(
    initialHeatManagement?.configuration.heatLabelStyle || 'letters'
  );
  const [heatOrder, setHeatOrder] = useState<'ascending' | 'descending'>(
    initialHeatManagement?.configuration.heatOrder || 'ascending'
  );

  // Load national association ID from club's state association
  useEffect(() => {
    let mounted = true;

    const loadNationalAssociationId = async () => {
      if (!isOpen || !currentEvent?.clubId) return;

      try {
        const { data: clubData } = await supabase
          .from('clubs')
          .select('state_association_id')
          .eq('id', currentEvent.clubId)
          .maybeSingle();

        if (!mounted) return;

        if (clubData?.state_association_id) {
          const { data: stateData } = await supabase
            .from('state_associations')
            .select('national_association_id')
            .eq('id', clubData.state_association_id)
            .maybeSingle();

          if (!mounted) return;

          if (stateData?.national_association_id) {
            setNationalAssociationId(stateData.national_association_id);
          }
        }
      } catch (err) {
        console.error('Error loading national association ID:', err);
      }
    };

    loadNationalAssociationId();
    return () => { mounted = false; };
  }, [isOpen, currentEvent?.clubId]);

  // Load user's scoring mode preference
  useEffect(() => {
    let mounted = true;

    const loadScoringModePreference = async () => {
      if (!isOpen) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted || !user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('scoring_mode_preference')
        .eq('id', user.id)
        .maybeSingle();

      if (mounted && profileData?.scoring_mode_preference) {
        setScoringMode(profileData.scoring_mode_preference as 'pro' | 'touch' | 'spreadsheet');
      }
    };

    loadScoringModePreference();
    return () => { mounted = false; };
  }, [isOpen]);

  // Sync currentHeatManagement with initialHeatManagement when modal opens/updates
  useEffect(() => {
    setCurrentHeatManagement(initialHeatManagement);
    setIsHeatRacingEnabled(initialHeatManagement?.configuration.enabled || false);
    setFleetManagementEnabled(initialHeatManagement?.configuration.fleetManagementEnabled ?? true);
    setCurrentDropRules(initialDropRules);
    setCurrentNumRaces(initialNumRaces);
  }, [initialHeatManagement, isOpen]);

  // Calculate optimal heats automatically based on skipper count
  const optimalHeats = calculateOptimalHeats(skippers.length);

  // Allow manual override of heat count
  const [isEditingHeats, setIsEditingHeats] = useState(false);
  const [manualHeatCount, setManualHeatCount] = useState<number | null>(null);

  // Allow manual override of promotion count
  const [isEditingPromotion, setIsEditingPromotion] = useState(false);
  const [manualPromotionCount, setManualPromotionCount] = useState<number | null>(null);

  // Confirmation modal for clearing all heat results and resetting to Round 1
  const [showHeatClearConfirmation, setShowHeatClearConfirmation] = useState(false);

  // Initialize manual overrides from existing heat management configuration
  useEffect(() => {
    // Only load manual overrides if heat racing is currently enabled
    if (initialHeatManagement?.configuration && initialHeatManagement.configuration.enabled) {
      const config = initialHeatManagement.configuration;
      // If the saved config differs from auto-calculated, it means user manually overrode it
      if (config.numberOfHeats !== optimalHeats.numberOfHeats) {
        setManualHeatCount(config.numberOfHeats);
      } else {
        setManualHeatCount(null);
      }
      if (config.promotionCount !== optimalHeats.promotionCount) {
        setManualPromotionCount(config.promotionCount);
      } else {
        setManualPromotionCount(null);
      }
    } else {
      // If heat racing is not enabled, reset manual overrides
      setManualHeatCount(null);
      setManualPromotionCount(null);
    }
  }, [initialHeatManagement, optimalHeats.numberOfHeats, optimalHeats.promotionCount]);

  // Check if any heat results exist (any round has been scored)
  const hasHeatScores = currentHeatManagement?.rounds.some(round =>
    round.results && round.results.length > 0 && round.results.some(r => r.position !== null)
  ) || false;

  // Check if finals rounds have been scored (rounds beyond the qualifying count)
  const hasFinalsScores = currentHeatManagement?.rounds.some(round => {
    const roundNumber = round.roundNumber || 0;
    return roundNumber > shrsQualifyingRounds &&
      round.results && round.results.length > 0 && round.results.some(r => r.position !== null);
  }) || false;

  // Check if ANY scores exist (heat or regular races)
  const hasAnyScores = hasHeatScores || hasRaceResults;

  const numHeats = manualHeatCount !== null ? manualHeatCount : optimalHeats.numberOfHeats;

  // Calculate max practical promotion count based on fleet size
  // Each heat needs at least (promotionCount * 2) boats to be practical
  const calculateMaxPromotionCount = (totalSkippers: number, heats: number): number => {
    if (heats === 0) return 4;
    const minSkippersPerHeat = Math.floor(totalSkippers / heats);
    const maxPromo = Math.min(Math.floor(minSkippersPerHeat / 2), 10); // Cap at 10
    return Math.max(maxPromo, 2); // Minimum 2, default 4
  };

  const maxPromotionCount = calculateMaxPromotionCount(skippers.length, numHeats);
  const defaultPromotionCount = Math.min(optimalHeats.promotionCount, maxPromotionCount);
  const promotionCount = manualPromotionCount !== null ? manualPromotionCount : defaultPromotionCount;

  // Validate if the current configuration makes sense for promotion/relegation
  const validatePromotionRelegationPractical = (totalSkippers: number, heats: number, promoCount: number): { isValid: boolean; message?: string } => {
    if (heats < 2) {
      return { isValid: false, message: 'At least 2 heats are required for promotion/relegation.' };
    }

    const minSkippersPerHeat = Math.floor(totalSkippers / heats);

    // With N-boat promotion/relegation, each heat needs at least (2 * N) boats to be practical
    // (N to promote/relegate + at least N to remain in the heat)
    const minBoatsPerHeat = promoCount * 2;
    if (minSkippersPerHeat < minBoatsPerHeat) {
      const minRequiredSkippers = heats * minBoatsPerHeat;
      return {
        isValid: false,
        message: `With ${heats} heats and ${promoCount}-boat promotion/relegation, you need at least ${minRequiredSkippers} skippers (minimum ${minBoatsPerHeat} per heat). You currently have ${totalSkippers}. Consider reducing the number of heats, reducing promotion/relegation count, or adding more skippers.`
      };
    }

    return { isValid: true };
  };

  const isSHRS = currentDropRules === 'shrs';

  // Auto-set recommended qualifying rounds for SHRS Pre-Assigned mode
  useEffect(() => {
    if (!isSHRS || shrsAssignmentMode !== 'preset' || hasRaceResults) return;
    if (skippers.length < 4 || numHeats < 2) return;
    const metrics = estimateDiversityMetrics(skippers.length, numHeats, shrsQualifyingRounds);
    const recommended = Math.max(2, Math.min(metrics.recommendedMinRounds, currentNumRaces - 2));
    if (recommended !== shrsQualifyingRounds) {
      setShrsQualifyingRounds(recommended);
    }
  }, [skippers.length, numHeats, shrsAssignmentMode, isSHRS]);

  const validateSHRSPractical = (totalSkippers: number, heats: number): { isValid: boolean; message?: string } => {
    if (heats > 5) {
      return { isValid: false, message: 'SHRS allows a maximum of 5 heats.' };
    }
    const maxPerHeat = Math.ceil(totalSkippers / heats);
    if (maxPerHeat > 20) {
      return { isValid: false, message: `SHRS allows a maximum of 20 boats per heat. With ${totalSkippers} boats and ${heats} heats, the largest heat would have ${maxPerHeat}. Add more heats or reduce entries.` };
    }
    if (totalSkippers > 100) {
      return { isValid: false, message: `SHRS supports a maximum of 100 boats (5 heats x 20 boats). You have ${totalSkippers} entries.` };
    }
    return { isValid: true };
  };

  const configValidation = isSHRS
    ? validateSHRSPractical(skippers.length, numHeats)
    : validatePromotionRelegationPractical(skippers.length, numHeats, promotionCount);

  const calculateHeatSizes = (totalSkippers: number, heats: number): number[] => {
    if (heats === 0) return [];
    if (isSHRS) {
      const baseSize = Math.floor(totalSkippers / heats);
      const remainder = totalSkippers % heats;
      const sizes = new Array(heats).fill(baseSize);
      for (let i = 0; i < remainder; i++) {
        sizes[i]++;
      }
      return sizes;
    }
    return calculateHMSHeatSizes(totalSkippers, heats);
  };

  const heatSizes = numHeats > 0 ? calculateHeatSizes(skippers.length, numHeats) : [];

  const [initialAssignment, setInitialAssignment] = useState<'random' | 'manual' | 'hms'>('random');
  const [showManualAssignmentModal, setShowManualAssignmentModal] = useState(false);
  const [showHMSSeedingModal, setShowHMSSeedingModal] = useState(false);

  useEffect(() => {
    if (initialHeatManagement?.configuration) {
      const config = initialHeatManagement.configuration;
      if (config.seedingMethod === 'random') {
        setInitialAssignment('random');
      } else if (config.seedingMethod === 'ranking') {
        setInitialAssignment('hms');
      } else {
        setInitialAssignment('manual');
      }
    }
  }, [initialHeatManagement]);

  useEffect(() => {
    // Check if current drop rules match any preset
    const matchingOption = DROP_RULE_OPTIONS.find(option =>
      Array.isArray(option.value) &&
      JSON.stringify(option.value) === JSON.stringify(currentDropRules)
    );

    // Only update customDropRules if not already in custom mode (to avoid overwriting user's typing)
    // Also check that currentDropRules is an array before calling join
    if (!matchingOption && Array.isArray(currentDropRules) && currentDropRules.length > 0 && !isCustomDropRules) {
      setIsCustomDropRules(true);
      setCustomDropRules(currentDropRules.join(', '));
    }
  }, [currentDropRules, isCustomDropRules]);

  const handleHeatToggle = (enabled: boolean) => {
    // Pre-validation before enabling
    if (enabled) {
      // Check minimum skipper requirement first (always check when enabling)
      if (skippers.length < 16) {
        // Show custom notification only
        const message = `Heat Racing requires a minimum of 16 skippers to ensure fair competition with proper promotion and relegation. You currently have ${skippers.length} skipper${skippers.length === 1 ? '' : 's'}. Please add ${16 - skippers.length} more skipper${16 - skippers.length === 1 ? '' : 's'} to enable this feature.`;
        if (addNotification) {
          addNotification('warning', message);
        }
        return; // Don't enable the toggle
      }

      // If already enabled, just return (no need to re-initialize)
      if (currentHeatManagement?.configuration.enabled) {
        return;
      }

      // Validate configuration
      const seedingMethod: SeedingMethod = initialAssignment === 'random' ? 'random' : initialAssignment === 'hms' ? 'ranking' : 'manual';
      const config: HMSConfig = {
        numberOfHeats: numHeats,
        promotionCount,
        seedingMethod,
        maxHeatSize: 12
      };

      const validation = validateHeatConfig(config, skippers.length);
      if (!validation.valid) {
        if (addNotification) {
          addNotification('error', `Cannot enable heat racing: ${validation.errors.join(', ')}`);
        } else {
          alert(`Cannot enable heat racing: ${validation.errors.join(', ')}`);
        }
        return; // Don't enable the toggle
      }

      // Now that validation passed, enable it
      setIsHeatRacingEnabled(enabled);

      // If current scoring system is not a heat racing system, default to HMS
      if (currentDropRules !== 'hms' && currentDropRules !== 'shrs') {
        setCurrentDropRules('hms');
      }

      // Scroll to heat racing section when enabled
      setTimeout(() => {
        const heatSection = document.getElementById('heat-racing-section');
        if (heatSection) {
          heatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      // Show HMS recommendations as info notification
      if (validation.warnings.length > 0 && addNotification) {
        validation.warnings.forEach(warning => {
          addNotification('info', warning);
        });
      }

      // DON'T open assignment modals or seed heats immediately when toggling on
      // Wait until user configures settings and clicks "Save Settings"
      // This prevents modals from opening before the race officer has set the number of heats
      return;
    } else if (!enabled) {
      // Disabling heat racing - COMPLETELY CLEAR all heat management data
      setIsHeatRacingEnabled(false);

      // Reset manual overrides so they start fresh when re-enabled
      setManualHeatCount(null);
      setManualPromotionCount(null);

      // If current scoring system is a heat racing system, switch to RRS
      if (currentDropRules === 'hms' || currentDropRules === 'shrs') {
        setCurrentDropRules([4, 8, 16, 24, 32, 40]); // RRS - Appendix A
      }

      // Completely clear heat management data (don't preserve old assignments)
      setCurrentHeatManagement(null);

      if (addNotification) {
        addNotification('info', 'Heat Racing disabled. All heat assignments and configuration cleared.');
      }
    }
  };

  useEffect(() => {
    if (isOpen && autoEnableHeatRacing && !isHeatRacingEnabled && skippers.length >= 16) {
      handleHeatToggle(true);
      setTimeout(() => {
        const heatSection = document.getElementById('heat-racing-section');
        if (heatSection) {
          heatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);
    }
  }, [isOpen, autoEnableHeatRacing]);

  if (!isOpen) return null;

  const handleDropRuleChange = (value: number[] | string) => {
    if (value === 'custom') {
      setIsCustomDropRules(true);
      // Only call join if currentDropRules is an array
      if (Array.isArray(currentDropRules)) {
        setCustomDropRules(currentDropRules.join(', '));
      } else {
        setCustomDropRules('');
      }
    } else {
      setIsCustomDropRules(false);
      setCurrentDropRules(value);
      if (value === 'shrs') {
        setInitialAssignment('hms');
      }
    }
  };

  const handleCustomDropRulesChange = (value: string) => {
    setCustomDropRules(value);
    try {
      const rules = value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      setCurrentDropRules(rules);
    } catch (e) {
      // Invalid input, keep current rules
    }
  };

  const handleManualAssignmentConfirm = (assignments: any[]) => {
    console.log('🎯 Manual assignments received:', JSON.stringify(assignments, null, 2));

    let allRounds;
    if (currentDropRules === 'shrs' && shrsAssignmentMode === 'preset' && shrsQualifyingRounds > 1) {
      const allQualifyingRounds = generatePreSetQualifyingAssignments(
        assignments,
        numHeats,
        shrsQualifyingRounds
      );
      allRounds = allQualifyingRounds.map((roundAssignments, idx) => ({
        round: idx + 1,
        heatAssignments: roundAssignments.map(a => ({
          heatDesignation: a.heatDesignation as any,
          skipperIndices: a.skipperIndices
        })),
        results: [],
        completed: false
      }));
    } else {
      allRounds = [{
        round: 1,
        heatAssignments: assignments,
        results: [],
        completed: false
      }];
    }

    const finalHeatManagement = {
      configuration: {
        enabled: true,
        numberOfHeats: numHeats,
        promotionCount: promotionCount,
        seedingMethod: 'manual' as SeedingMethod,
        autoAssign: false,
        scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms',
        ...(currentDropRules === 'shrs' ? { shrsQualifyingRounds, shrsAssignmentMode } : {}),
        fleetManagementEnabled,
        heatLabelStyle,
        heatOrder
      },
      currentRound: 1,
      currentHeat: assignments[assignments.length - 1].heatDesignation,
      rounds: allRounds
    };

    console.log('🎯 Saving heat management:', JSON.stringify(finalHeatManagement, null, 2));

    onSaveSettings({
      numRaces: currentNumRaces,
      dropRules: currentDropRules,
      heatManagement: finalHeatManagement,
      displaySettings: {
        show_flag: showFlag,
        show_country: showCountry
      },
      observerSettings: {
        enable_observers: enableObservers,
        observers_per_heat: observersPerHeat,
        enable_roll_call: enableRollCall,
        auto_complete_sail: autoCompleteSail
      }
    });

    setShowManualAssignmentModal(false);
  };

  const handleHMSSeedingConfirm = (assignments: any[], rankedSkipperIndices?: number[]) => {
    console.log('🎯 HMS Seeding assignments received:', JSON.stringify(assignments, null, 2));
    console.log('🎯 Ranked skipper indices:', rankedSkipperIndices);

    let allRounds;
    if (currentDropRules === 'shrs' && shrsAssignmentMode === 'preset' && shrsQualifyingRounds > 1) {
      const allQualifyingRounds = generatePreSetQualifyingAssignments(
        assignments,
        numHeats,
        shrsQualifyingRounds
      );
      allRounds = allQualifyingRounds.map((roundAssignments, idx) => ({
        round: idx + 1,
        heatAssignments: roundAssignments.map(a => ({
          heatDesignation: a.heatDesignation as any,
          skipperIndices: a.skipperIndices
        })),
        results: [],
        completed: false
      }));
    } else {
      allRounds = [{
        round: 1,
        heatAssignments: assignments,
        results: [],
        completed: false
      }];
    }

    const finalHeatManagement = {
      configuration: {
        enabled: true,
        numberOfHeats: numHeats,
        promotionCount: promotionCount,
        seedingMethod: 'manual' as SeedingMethod,
        autoAssign: false,
        scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms',
        ...(currentDropRules === 'shrs' ? { shrsQualifyingRounds, shrsAssignmentMode } : {}),
        ...(rankedSkipperIndices && rankedSkipperIndices.length > 0 ? { rankedSkipperIndices } : {}),
        fleetManagementEnabled,
        heatLabelStyle,
        heatOrder
      },
      currentRound: 1,
      currentHeat: assignments[assignments.length - 1].heatDesignation,
      rounds: allRounds
    };

    console.log('🎯 Saving HMS Seeding heat management:', JSON.stringify(finalHeatManagement, null, 2));

    onSaveSettings({
      numRaces: currentNumRaces,
      dropRules: currentDropRules,
      heatManagement: finalHeatManagement,
      displaySettings: {
        show_flag: showFlag,
        show_country: showCountry
      },
      observerSettings: {
        enable_observers: enableObservers,
        observers_per_heat: observersPerHeat,
        enable_roll_call: enableRollCall,
        auto_complete_sail: autoCompleteSail
      }
    });

    setShowHMSSeedingModal(false);
  };

  const handleScoringModeChange = async (mode: 'pro' | 'touch' | 'spreadsheet') => {
    setScoringMode(mode);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ scoring_mode_preference: mode })
        .eq('id', user.id);

      onScoringModeChange?.(mode);

      if (addNotification) {
        const labels: Record<string, string> = { pro: 'Pro Mode', touch: 'Touch Mode', spreadsheet: 'Spreadsheet Mode' };
        addNotification('success', `Scoring mode changed to ${labels[mode]}`);
      }
    }
  };

  const handleSave = async () => {
    let finalHeatManagement = currentHeatManagement;

    console.log('🎯 HandleSave called - Heat Racing Enabled?', isHeatRacingEnabled);
    console.log('🎯 Current heat management:', currentHeatManagement ? {
      configHeats: currentHeatManagement.configuration.numberOfHeats,
      roundHeats: currentHeatManagement.rounds[0]?.heatAssignments.length
    } : 'null');

    if (isHeatRacingEnabled) {
      // Validate configuration
      const seedingMethod: SeedingMethod = initialAssignment === 'random' ? 'random' : initialAssignment === 'hms' ? 'ranking' : 'manual';
      console.log('🎯 numHeats being used:', numHeats, '(manualHeatCount:', manualHeatCount, ', recommended:', optimalHeats.numberOfHeats, ')');
      console.log('🎯 promotionCount being used:', promotionCount, '(manualPromotionCount:', manualPromotionCount, ')');
      console.log('🎯 Scoring system:', currentDropRules);

      // Use appropriate validation based on scoring system
      let validation: { valid: boolean; errors: string[]; warnings: string[] };

      if (currentDropRules === 'shrs') {
        // SHRS validation - no promotion/relegation
        // SHRS typically uses about 1/3 of races for qualifying, minimum 2 races
        const qualifyingRaces = Math.max(2, Math.floor(currentNumRaces / 3));

        const shrsConfig: SHRSConfig = {
          numberOfHeats: numHeats,
          numberOfRaces: currentNumRaces,
          qualifyingRaces: qualifyingRaces,
          useTable2: true // Use alphabetic labeling (A, B, C, D)
        };
        const shrsValidation = validateSHRSConfig(shrsConfig, skippers.length);
        // Adapt SHRS validation result to match HMS format
        validation = {
          valid: shrsValidation.isValid,
          errors: shrsValidation.errors,
          warnings: [] // SHRS doesn't have warnings
        };
      } else {
        // HMS validation - with promotion/relegation
        const hmsConfig: HMSConfig = {
          numberOfHeats: numHeats,
          promotionCount: promotionCount,
          seedingMethod,
          maxHeatSize: 12
        };
        validation = validateHeatConfig(hmsConfig, skippers.length);
      }

      if (!validation.valid) {
        if (addNotification) {
          addNotification('error', `Cannot save heat racing settings: ${validation.errors.join(', ')}`);
        } else {
          alert(`Cannot save heat racing settings: ${validation.errors.join(', ')}`);
        }
        return;
      }

      // Show recommendations as info notification
      if (validation.warnings.length > 0 && addNotification) {
        validation.warnings.forEach(warning => {
          addNotification('info', warning);
        });
      }

      if (currentHeatManagement) {
        const actualHeatCount = currentHeatManagement.rounds[0]?.heatAssignments?.length || 0;
        const heatCountChanged = actualHeatCount !== numHeats;
        const hasAnyRoundResults = currentHeatManagement.rounds.some(r => r.results && r.results.length > 0);
        const isReducingHeats = actualHeatCount > numHeats;

        const previousScoringSystem = currentHeatManagement.configuration.scoringSystem || 'hms';
        const newScoringSystem = (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules as string : 'hms';
        const scoringSystemChanged = previousScoringSystem !== newScoringSystem;

        // Check if heat sizes are unbalanced (indicates old seeding algorithm or corrupted data)
        const currentHeatSizes = currentHeatManagement.rounds[0]?.heatAssignments?.map(h => h.skipperIndices.length) || [];
        const maxSize = Math.max(...currentHeatSizes);
        const minSize = Math.min(...currentHeatSizes);
        const hasUnbalancedHeats = currentHeatSizes.length > 0 && maxSize - minSize > 1 && !hasAnyRoundResults;

        const previousSeedingMethod = currentHeatManagement.configuration.seedingMethod || 'random';
        const seedingMethodChanged = previousSeedingMethod !== seedingMethod && !hasAnyRoundResults;

        const shouldRegenerate = ((heatCountChanged || scoringSystemChanged || hasUnbalancedHeats) && (!hasAnyRoundResults || isReducingHeats || scoringSystemChanged || hasUnbalancedHeats)) || seedingMethodChanged;

        console.log('🔍 Heat regeneration check:', {
          storedConfigHeats: currentHeatManagement.configuration.numberOfHeats,
          actualHeatsInAssignments: actualHeatCount,
          newHeats: numHeats,
          heatCountChanged,
          scoringSystemChanged,
          previousScoringSystem,
          newScoringSystem,
          hasAnyRoundResults,
          isReducingHeats,
          currentHeatSizes,
          hasUnbalancedHeats,
          seedingMethodChanged,
          previousSeedingMethod,
          newSeedingMethod: seedingMethod,
          shouldRegenerate,
          roundsData: currentHeatManagement.rounds.map(r => ({
            round: r.round,
            resultsCount: r.results?.length || 0,
            heatCount: r.heatAssignments?.length || 0
          }))
        });

        if (shouldRegenerate) {
          if (initialAssignment === 'manual') {
            setShowManualAssignmentModal(true);
            return;
          }
          if (initialAssignment === 'hms') {
            setShowHMSSeedingModal(true);
            return;
          }

          const executeRegeneration = () => {
            if (hasUnbalancedHeats && addNotification) {
              addNotification('info', `Detected unbalanced heat sizes (${currentHeatSizes.join(', ')}). Auto-fixing to balanced distribution.`);
            }

            console.log('🔄 Heat count changed from', currentHeatManagement.configuration.numberOfHeats, 'to', numHeats, '- regenerating heats');

            let heatAssignments;

            if (currentDropRules === 'shrs') {
              heatAssignments = seedSHRSHeatsByIndex(skippers, numHeats);
            } else {
              const hmsSeederConfig: HMSConfig = {
                numberOfHeats: numHeats,
                promotionCount: promotionCount,
                seedingMethod,
                maxHeatSize: 12
              };
              heatAssignments = seedInitialHeats(skippers, hmsSeederConfig);

              const assignmentProblems = validateHeatAssignments(heatAssignments, skippers.length);
              if (assignmentProblems.length > 0) {
                console.warn('Heat assignment validation issues:', assignmentProblems);
              }
            }

            let allRounds;
            if (currentDropRules === 'shrs' && shrsAssignmentMode === 'preset' && shrsQualifyingRounds > 1) {
              const allQualifyingRounds = generatePreSetQualifyingAssignments(
                heatAssignments,
                numHeats,
                shrsQualifyingRounds
              );
              allRounds = allQualifyingRounds.map((roundAssignments, idx) => ({
                round: idx + 1,
                heatAssignments: roundAssignments.map(a => ({
                  heatDesignation: a.heatDesignation as any,
                  skipperIndices: a.skipperIndices
                })),
                results: [],
                completed: false
              }));
            } else {
              allRounds = [{
                round: 1,
                heatAssignments,
                results: [],
                completed: false
              }];
            }

            const regenHM: HeatManagement = {
              configuration: {
                enabled: true,
                numberOfHeats: numHeats,
                promotionCount: promotionCount,
                seedingMethod,
                autoAssign: initialAssignment === 'random',
                scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms',
                ...(currentDropRules === 'shrs' ? { shrsQualifyingRounds, shrsAssignmentMode } : {}),
                fleetManagementEnabled,
                heatLabelStyle,
                heatOrder
              },
              currentRound: 1,
              currentHeat: heatAssignments[heatAssignments.length - 1].heatDesignation,
              rounds: allRounds
            };

            onSave({
              numRaces: currentNumRaces,
              dropRules: currentDropRules,
              heatManagement: regenHM,
              displaySettings: {
                show_flag: showFlag,
                show_country: showCountry
              },
              observerSettings: {
                enable_observers: enableObservers,
                observers_per_heat: observersPerHeat,
                enable_roll_call: enableRollCall,
                auto_complete_sail: autoCompleteSail
              }
            });
            onClose();
          };

          // Show confirmation before regenerating assignments
          const reasons: string[] = [];
          if (heatCountChanged) reasons.push(`heat count changed (${actualHeatCount} → ${numHeats})`);
          if (scoringSystemChanged) reasons.push(`scoring system changed (${previousScoringSystem} → ${newScoringSystem})`);
          if (hasUnbalancedHeats) reasons.push(`unbalanced heat sizes detected (${currentHeatSizes.join(', ')})`);
          if (seedingMethodChanged) reasons.push(`initial assignment changed (${previousSeedingMethod} → ${seedingMethod})`);

          console.log('⚠️ Regeneration needed:', reasons.join(', '));
          setPendingRegenerateAction(() => executeRegeneration);
          setShowRegenerateConfirm(true);
          return;
        } else {
          console.log('ℹ️ Updating configuration only - preserving existing heat assignments and results');
          const updatedConfig = {
            enabled: true,
            numberOfHeats: numHeats,
            promotionCount: promotionCount,
            seedingMethod,
            autoAssign: initialAssignment === 'random',
            scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms',
            ...(currentDropRules === 'shrs' ? { shrsQualifyingRounds, shrsAssignmentMode } : {}),
            fleetManagementEnabled,
            heatLabelStyle,
            heatOrder
          };

          const hasResults = currentHeatManagement.rounds.some(r => r.results && r.results.length > 0);
          const needsPreAssignments = currentDropRules === 'shrs' &&
            shrsAssignmentMode === 'preset' &&
            shrsQualifyingRounds > 1 &&
            !hasResults &&
            currentHeatManagement.rounds.length < shrsQualifyingRounds;

          if (needsPreAssignments) {
            const firstRoundAssignments = currentHeatManagement.rounds[0]?.heatAssignments || [];
            const allQualifyingRounds = generatePreSetQualifyingAssignments(
              firstRoundAssignments.map(a => ({
                heatDesignation: a.heatDesignation as string,
                skipperIndices: [...a.skipperIndices]
              })),
              numHeats,
              shrsQualifyingRounds
            );
            const allRounds = allQualifyingRounds.map((roundAssignments, idx) => ({
              round: idx + 1,
              heatAssignments: roundAssignments.map(a => ({
                heatDesignation: a.heatDesignation as any,
                skipperIndices: a.skipperIndices
              })),
              results: [],
              completed: false
            }));
            finalHeatManagement = {
              ...currentHeatManagement,
              configuration: updatedConfig,
              rounds: allRounds
            };
          } else {
            finalHeatManagement = {
              ...currentHeatManagement,
              configuration: updatedConfig
            };
          }
        }
      } else {
        // For manual assignment, show the manual assignment modal
        if (initialAssignment === 'manual') {
          setShowManualAssignmentModal(true);
          return; // Don't save yet, wait for manual assignments
        }

        // For HMS seeding, show the HMS seeding modal
        if (initialAssignment === 'hms') {
          setShowHMSSeedingModal(true);
          return; // Don't save yet, wait for HMS seeding assignments
        }

        let heatAssignments;

        if (currentDropRules === 'shrs') {
          heatAssignments = seedSHRSHeatsByIndex(skippers, numHeats);
        } else {
          const hmsSeederConfig: HMSConfig = {
            numberOfHeats: numHeats,
            promotionCount: promotionCount,
            seedingMethod,
            maxHeatSize: 12
          };
          heatAssignments = seedInitialHeats(skippers, hmsSeederConfig);
        }

        let allRounds;
        if (currentDropRules === 'shrs' && shrsAssignmentMode === 'preset' && shrsQualifyingRounds > 1) {
          const allQualifyingRounds = generatePreSetQualifyingAssignments(
            heatAssignments,
            numHeats,
            shrsQualifyingRounds
          );
          allRounds = allQualifyingRounds.map((roundAssignments, idx) => ({
            round: idx + 1,
            heatAssignments: roundAssignments.map(a => ({
              heatDesignation: a.heatDesignation as any,
              skipperIndices: a.skipperIndices
            })),
            results: [],
            completed: false
          }));
        } else {
          allRounds = [{
            round: 1,
            heatAssignments,
            results: [],
            completed: false
          }];
        }

        finalHeatManagement = {
          configuration: {
            enabled: true,
            numberOfHeats: numHeats,
            promotionCount: promotionCount,
            seedingMethod,
            autoAssign: initialAssignment === 'random',
            scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms',
            ...(currentDropRules === 'shrs' ? { shrsQualifyingRounds, shrsAssignmentMode } : {}),
            fleetManagementEnabled,
            heatLabelStyle,
            heatOrder
          },
          currentRound: 1,
          currentHeat: heatAssignments[heatAssignments.length - 1].heatDesignation,
          rounds: allRounds
        };
      }
    } else {
      // If heat racing is disabled, either set enabled to false or set to null
      if (currentHeatManagement) {
        finalHeatManagement = {
          ...currentHeatManagement,
          configuration: {
            ...currentHeatManagement.configuration,
            enabled: false
          }
        };
      } else {
        finalHeatManagement = null;
      }
    }

    console.log('📤 About to save settings with finalHeatManagement:', {
      enabled: finalHeatManagement?.configuration.enabled,
      configuredHeats: finalHeatManagement?.configuration.numberOfHeats,
      actualHeatsInRound: finalHeatManagement?.rounds[0]?.heatAssignments.length,
      heatDesignations: finalHeatManagement?.rounds[0]?.heatAssignments.map(h => h.heatDesignation)
    });

    await onSaveSettings({
      numRaces: currentNumRaces,
      dropRules: currentDropRules,
      heatManagement: finalHeatManagement,
      displaySettings: {
        show_flag: showFlag,
        show_country: showCountry
      },
      observerSettings: {
        enable_observers: enableObservers,
        observers_per_heat: observersPerHeat,
        enable_roll_call: enableRollCall,
        auto_complete_sail: autoCompleteSail
      }
    });

    if (addNotification) {
      addNotification('success', 'Updated Successfully');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-out Tray */}
      <div
        className={`
          fixed top-0 right-0 h-full w-full sm:w-[500px] z-50
          ${darkMode ? 'bg-slate-800' : 'bg-white'}
          shadow-2xl flex flex-col
          transform transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          transitionTimingFunction: isOpen
            ? 'cubic-bezier(0.32, 0.72, 0, 1)' // Smooth slide in
            : 'cubic-bezier(0.4, 0, 1, 1)' // Quick slide out
        }}
      >
        {/* Header */}
        <div className={`
          flex items-center justify-between p-4 border-b flex-shrink-0
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Settings className="text-blue-400" size={20} />
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Race Settings
            </h2>
          </div>
          <button
            type="button"
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

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          {/* Appearance Settings */}
          {onToggleDarkMode && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                {darkMode ? <Moon className="text-blue-400" size={20} /> : <Sun className="text-blue-400" size={20} />}
                <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Appearance
                </h3>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleDarkMode();
                }}
                className={`
                  w-full flex items-center justify-between p-4 rounded-lg transition-all border-2
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                `}
              >
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon size={20} className="text-blue-400" /> : <Sun size={20} className="text-amber-500" />}
                  <div className="text-left">
                    <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {darkMode ? 'Dark Mode' : 'Light Mode'}
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                    </div>
                  </div>
                </div>
                <div className="relative inline-flex items-center">
                  <div className={`w-14 h-7 rounded-full transition ${
                    darkMode ? 'bg-blue-600' : 'bg-slate-300'
                  }`}>
                    <div className={`w-6 h-6 rounded-full bg-white shadow transform transition-transform top-0.5 absolute ${
                      darkMode ? 'translate-x-7' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Scoring Interface */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Sailboat className="text-blue-400" size={20} />
              <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Scoring Interface
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {([
                { mode: 'pro' as const, label: 'Pro Mode', desc: 'Desktop', Icon: Table2 },
                { mode: 'touch' as const, label: 'Touch Mode', desc: 'Tablet', Icon: Hand },
                { mode: 'spreadsheet' as const, label: 'Spreadsheet', desc: 'Traditional', Icon: Grid3X3 },
              ]).map(({ mode, label, desc, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleScoringModeChange(mode)}
                  className={`
                    relative flex flex-col items-center gap-2 p-4 rounded-xl transition-all border-2 text-center
                    ${scoringMode === mode
                      ? darkMode
                        ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500/30'
                        : 'bg-blue-50 border-blue-500 ring-1 ring-blue-200'
                      : darkMode
                        ? 'bg-slate-700/60 border-slate-600 hover:bg-slate-600/80 hover:border-slate-500'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}
                  `}
                >
                  {scoringMode === mode && (
                    <div className="absolute top-2 right-2">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    </div>
                  )}
                  <div className={`p-2.5 rounded-lg ${
                    scoringMode === mode
                      ? 'bg-blue-600/20 text-blue-400'
                      : darkMode
                        ? 'bg-slate-600/50 text-slate-400'
                        : 'bg-slate-200/80 text-slate-500'
                  }`}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <div className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {label}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Skipper Management */}
          {onManageSkippers && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="text-blue-400" size={20} />
                <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Skipper Management
                </h3>
              </div>

              <div className={`p-4 rounded-lg ${
                darkMode ? 'bg-slate-700/50' : 'bg-blue-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className={`text-sm font-medium mb-1 ${
                      darkMode ? 'text-slate-200' : 'text-slate-800'
                    }`}>
                      Current Skippers: {skippers.length}
                    </div>
                    <div className={`text-xs ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Add, remove, or edit skippers participating in this event
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onManageSkippers}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${darkMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                      }
                    `}
                  >
                    Manage Skippers
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* General Race Settings */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="text-blue-400" size={20} />
              <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                General Race Settings
              </h3>
            </div>


            {/* Scoring System - Only show when heat racing is disabled */}
            {!isHeatRacingEnabled && (
              <div className="space-y-3">
                <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Award size={16} />
                    Scoring System
                  </div>
                </label>
                <div className="space-y-2">
                  {DROP_RULE_OPTIONS
                    .filter(option => !option.forHeatRacing)
                    .map((option, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleDropRuleChange(option.value)}
                        className={`
                          w-full text-left px-4 py-3 rounded-lg text-sm transition-all
                          ${(Array.isArray(option.value) && JSON.stringify(option.value) === JSON.stringify(currentDropRules)) ||
                            (typeof option.value === 'string' && option.value !== 'custom' && option.value === currentDropRules) ||
                            (option.value === 'custom' && isCustomDropRules)
                            ? 'bg-blue-600 text-white shadow-md'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }
                        `}
                      >
                        {option.label}
                      </button>
                    ))}
                  {isCustomDropRules && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={customDropRules}
                        onChange={(e) => handleCustomDropRulesChange(e.target.value)}
                        placeholder="e.g., 4, 8, 12"
                        className={`
                          w-full px-3 py-2 rounded-lg text-sm border
                          ${darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder:text-slate-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'}
                        `}
                      />
                      <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Enter race numbers separated by commas (e.g., 4, 8, 12)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Heat Racing Settings */}
          <div id="heat-racing-section" className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="text-purple-400" size={20} />
                  <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Heat Racing
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!hasHeatScores) {
                      handleHeatToggle(!isHeatRacingEnabled);
                    }
                  }}
                  disabled={hasHeatScores}
                  className={`relative inline-flex items-center ${
                    hasHeatScores ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                  title={hasHeatScores ? 'Cannot disable heat racing after scoring has begun' : ''}
                >
                  <div className={`w-11 h-6 rounded-full transition ${
                    isHeatRacingEnabled ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-200'
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                      isHeatRacingEnabled ? 'translate-x-6' : 'translate-x-1'
                    } mt-0.5`} />
                  </div>
                </button>
              </div>

              {/* Info message */}
              <div className={`text-xs p-3 rounded-lg ${
                darkMode ? 'bg-slate-700/50 text-slate-400' : 'bg-blue-50 text-blue-800'
              }`}>
                {isHeatRacingEnabled ? (
                  <p>
                    <span className="font-semibold">{currentDropRules === 'shrs' ? `SHRS-${shrsAssignmentMode === 'preset' ? 'B' : 'P'}` : 'HMS'} Heat Racing Active:</span> Skippers will be divided into heats{currentDropRules === 'shrs' ? '' : ' with promotion/relegation between races'}.
                    {currentDropRules === 'shrs' ? ` Using ${shrsAssignmentMode === 'preset' ? 'Pre-Assigned' : 'Progressive'} assignment.` : ' Heats are scored from lowest to highest (F → A).'} Configure your settings below.
                  </p>
                ) : (
                  <p>
                    Enable multi-heat racing with promotion and relegation. Ideal for large fleets where racing in multiple heats provides fairer competition.
                  </p>
                )}
              </div>
            </div>

            {isHeatRacingEnabled && (
              <div className="space-y-6 pl-6 border-l-2 border-purple-400/30">
                {/* Warning if scores exist */}
                {hasHeatScores && (
                  <div className="p-3 rounded-lg flex items-start gap-3 bg-red-600">
                    <AlertTriangle className="flex-shrink-0 text-white" size={20} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">
                        Heat Settings Locked
                      </p>
                      <p className="text-xs mt-1 text-white/80">
                        Heat configuration cannot be changed after scoring has begun. Clear all round scores to modify settings.
                      </p>
                    </div>
                  </div>
                )}

                {/* Heat Racing Scoring System */}
                <div className={`space-y-3 ${hasAnyScores ? 'pointer-events-none opacity-60' : ''}`}>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Award size={16} />
                      Scoring System
                    </div>
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {DROP_RULE_OPTIONS
                      .filter(option => option.forHeatRacing)
                      .map((option, index) => {
                        const isHMS = option.value === 'hms';
                        const isSHRSOption = option.value === 'shrs';
                        const isSelected = option.value === currentDropRules;

                        return (
                          <button
                            key={index}
                            type="button"
                            disabled={hasAnyScores}
                            onClick={() => handleDropRuleChange(option.value)}
                            className={`
                              group relative w-full text-left p-4 rounded-xl transition-all border-2
                              ${isSelected
                                ? isHMS
                                  ? 'bg-gradient-to-br from-purple-600 to-purple-700 border-purple-400 text-white shadow-lg'
                                  : 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-400 text-white shadow-lg'
                                : darkMode
                                  ? 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-700'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:shadow-md'
                              }
                            `}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                                isSelected
                                  ? 'bg-white/20'
                                  : darkMode
                                    ? 'bg-slate-800'
                                    : 'bg-slate-100'
                              }`}>
                                <Trophy className={isSelected ? 'text-white' : darkMode ? 'text-purple-400' : 'text-purple-600'} size={24} />
                              </div>
                              <div className="flex-1">
                                <div className={`text-2xl font-black mb-1 tracking-tight ${
                                  isSelected ? 'text-white' : darkMode ? 'text-white' : 'text-slate-900'
                                }`}>
                                  {isHMS ? 'HMS' : 'SHRS'}
                                </div>
                                <div className={`text-sm font-medium ${
                                  isSelected ? 'text-white/90' : darkMode ? 'text-slate-300' : 'text-slate-700'
                                }`}>
                                  {isHMS ? 'Heat Management System' : 'Simple Heat Race System'}
                                </div>
                                <div className={`text-xs mt-2 ${
                                  isSelected ? 'text-white/75' : darkMode ? 'text-slate-400' : 'text-slate-500'
                                }`}>
                                  {isSHRSOption ? '1 after 4, 2 after 8, +1 per 8 races' : 'Dynamic heat management with promotion/relegation'}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex-shrink-0">
                                  <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                                    <Check size={16} className={isHMS ? 'text-purple-600' : 'text-blue-600'} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Fleet Management Toggle - HMS only */}
                {!isSHRS && (() => {
                  const fleetToggleLocked = hasHeatScores || (!fleetManagementEnabled && hasRaceResults);
                  return (
                  <div className={`p-5 rounded-xl border-2 ${
                    darkMode
                      ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600'
                      : 'bg-gradient-to-br from-amber-50 to-slate-50 border-amber-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Users size={18} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                          <label className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            Fleet Management
                          </label>
                          {fleetToggleLocked && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              darkMode ? 'bg-slate-600 text-slate-300' : 'bg-slate-200 text-slate-500'
                            }`}>Locked</span>
                          )}
                        </div>
                        <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {fleetManagementEnabled
                            ? 'Skippers are assigned to heats with automatic promotion/relegation between rounds.'
                            : 'Manual spreadsheet scoring only. No heat assignments, progression, or observers.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => !fleetToggleLocked && setFleetManagementEnabled(!fleetManagementEnabled)}
                        disabled={fleetToggleLocked}
                        className={`relative w-14 h-7 rounded-full transition-colors duration-200 shadow-sm flex-shrink-0 ml-4 ${
                          fleetToggleLocked ? 'opacity-40 cursor-not-allowed' : ''
                        } ${
                          fleetManagementEnabled ? 'bg-amber-500' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                          fleetManagementEnabled ? 'translate-x-8' : 'translate-x-1'
                        } mt-1`} />
                      </button>
                    </div>
                    {!fleetManagementEnabled && hasRaceResults && (
                      <div className={`mt-3 flex items-center gap-2 p-3 rounded-lg border ${
                        darkMode ? 'bg-red-900/20 border-red-700/30' : 'bg-red-50 border-red-200'
                      }`}>
                        <AlertTriangle size={14} className={darkMode ? 'text-red-400' : 'text-red-500'} />
                        <p className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                          Scores have been entered. Clear all results to re-enable this setting.
                        </p>
                      </div>
                    )}
                    {!fleetManagementEnabled && (
                      <div className="mt-3 space-y-3">
                        <div className={`text-xs p-3 rounded-lg border ${
                          darkMode ? 'bg-amber-900/20 text-amber-300 border-amber-700/30' : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          HMS Spreadsheet mode: All scoring is manual. Enter positions directly into the spreadsheet without heat assignments or skipper progression.
                        </div>
                        <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
                          <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-2`}>
                            Promotion / Relegation Count
                          </div>
                          <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} mb-3`}>
                            Number of skippers promoted/relegated between heats each round. Top positions in each heat will be highlighted green.
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setManualPromotionCount(Math.max(1, promotionCount - 1))}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors border-2 ${
                                promotionCount <= 1
                                  ? darkMode ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : darkMode ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                              }`}
                              disabled={promotionCount <= 1}
                            >
                              -
                            </button>
                            <div className={`flex-1 text-center px-4 py-2 rounded-xl border-2 ${
                              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                            }`}>
                              <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {promotionCount}
                              </div>
                              <div className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                boats
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setManualPromotionCount(Math.min(12, promotionCount + 1))}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors border-2 ${
                                promotionCount >= 12
                                  ? darkMode ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : darkMode ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                              }`}
                              disabled={promotionCount >= 12}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* Fleet Management sections - hidden when fleet management is disabled for HMS */}
                {(fleetManagementEnabled || isSHRS) && (
                <>
                {/* Automatic Heat Configuration */}
                <div className={`p-5 rounded-xl border-2 ${
                  hasHeatScores
                    ? darkMode ? 'bg-slate-800/50 border-slate-700 opacity-60' : 'bg-slate-100 border-slate-300 opacity-60'
                    : darkMode ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600' : 'bg-gradient-to-br from-blue-50 to-slate-50 border-blue-200'
                }`}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <div className="flex items-center gap-2">
                          <Trophy size={18} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                          Heat Configuration
                        </div>
                      </label>
                      <span className={`text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                        Auto-calculated
                      </span>
                    </div>

                    {numHeats > 0 ? (
                      <>
                        <div className={`grid gap-4 ${isSHRS ? 'grid-cols-1' : 'grid-cols-2'}`}>
                          <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} relative shadow-sm`}>
                            <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-2`}>
                              Number of Heats
                            </div>
                            {isEditingHeats && !hasHeatScores ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="2"
                                  max={5}
                                  value={manualHeatCount !== null ? manualHeatCount : optimalHeats.numberOfHeats}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    const maxHeats = 5;
                                    if (value >= 2 && value <= maxHeats) {
                                      if (isSHRS) {
                                        const shrsVal = validateSHRSPractical(skippers.length, value);
                                        if (!shrsVal.isValid && addNotification) {
                                          addNotification('warning', shrsVal.message || 'Invalid SHRS configuration');
                                        }
                                      } else {
                                        const validation = validatePromotionRelegationPractical(skippers.length, value, promotionCount);
                                        if (!validation.isValid && addNotification) {
                                          addNotification('warning', validation.message || 'Invalid heat configuration');
                                        }
                                      }
                                      setManualHeatCount(value);
                                    }
                                  }}
                                  className={`w-20 px-2 py-1 text-xl font-bold rounded border ${
                                    darkMode
                                      ? 'bg-slate-700 border-slate-600 text-white'
                                      : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                  autoFocus
                                />
                                <button
                                  onClick={() => setIsEditingHeats(false)}
                                  className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                                  title="Done editing"
                                >
                                  <Check size={16} className={darkMode ? 'text-green-400' : 'text-green-600'} />
                                </button>
                                <button
                                  onClick={() => {
                                    setManualHeatCount(null);
                                    setIsEditingHeats(false);
                                  }}
                                  className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                                  title="Reset to auto"
                                >
                                  <X size={16} className={darkMode ? 'text-red-400' : 'text-red-600'} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  {numHeats}
                                </div>
                                {!hasHeatScores && (
                                  <button
                                    onClick={() => setIsEditingHeats(true)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      darkMode
                                        ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-300'
                                        : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                                    }`}
                                    title="Edit number of heats"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                            {manualHeatCount !== null && !isEditingHeats && (
                              <div className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'} mt-1`}>
                                Manual override
                              </div>
                            )}
                          </div>
                          {/* Hide promotion/relegation for SHRS as it doesn't use that system */}
                          {!isSHRS && (
                            <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} relative shadow-sm`}>
                              <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-2`}>
                                Promotion/Relegation
                              </div>
                            {isEditingPromotion && !hasHeatScores ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="2"
                                  max={maxPromotionCount}
                                  value={manualPromotionCount !== null ? manualPromotionCount : defaultPromotionCount}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    if (value >= 2 && value <= maxPromotionCount) {
                                      // Check if this configuration would be valid
                                      const validation = validatePromotionRelegationPractical(skippers.length, numHeats, value);
                                      if (!validation.isValid && addNotification) {
                                        addNotification('warning', validation.message || 'Invalid promotion/relegation configuration');
                                      }
                                      setManualPromotionCount(value);
                                    }
                                  }}
                                  className={`w-20 px-2 py-1 text-xl font-bold rounded border ${
                                    darkMode
                                      ? 'bg-slate-700 border-slate-600 text-white'
                                      : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                  autoFocus
                                />
                                <button
                                  onClick={() => setIsEditingPromotion(false)}
                                  className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                                  title="Done editing"
                                >
                                  <Check size={16} className={darkMode ? 'text-green-400' : 'text-green-600'} />
                                </button>
                                <button
                                  onClick={() => {
                                    setManualPromotionCount(null);
                                    setIsEditingPromotion(false);
                                  }}
                                  className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                                  title="Reset to auto"
                                >
                                  <X size={16} className={darkMode ? 'text-red-400' : 'text-red-600'} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className={`text-4xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  {promotionCount}
                                </div>
                                {!hasHeatScores && (
                                  <button
                                    onClick={() => setIsEditingPromotion(true)}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      darkMode
                                        ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-300'
                                        : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                                    }`}
                                    title="Edit promotion/relegation count"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                            {manualPromotionCount !== null && !isEditingPromotion && (
                              <div className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'} mt-1`}>
                                Manual override
                              </div>
                            )}
                            {manualPromotionCount === null && !isEditingPromotion && (
                              <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} mt-1`}>
                                Default: 4
                              </div>
                            )}
                            </div>
                          )}
                        </div>

                        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} space-y-1`}>
                          <div className="flex items-center gap-2">
                            <Trophy size={14} />
                            <span>Heat sizes: {heatSizes.join(', ')} boats</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users size={14} />
                            <span>{skippers.length} total skippers</span>
                          </div>
                        </div>

                        {isSHRS && (
                        <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
                          <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-3`}>
                            Number of Races
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {NUM_RACES_OPTIONS.map(num => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => setCurrentNumRaces(num)}
                                    className={`
                                      px-4 py-2 rounded-lg text-sm font-medium transition-all
                                      ${currentNumRaces === num
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : darkMode
                                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }
                                    `}
                                  >
                                    {num} Races
                                  </button>
                                ))}
                                <input
                                  type="number"
                                  value={currentNumRaces}
                                  onChange={(e) => setCurrentNumRaces(parseInt(e.target.value) || 12)}
                                  min="1"
                                  max="50"
                                  className={`
                                    w-20 px-3 py-2 rounded-lg text-sm text-center border
                                    ${darkMode
                                      ? 'bg-slate-700 border-slate-600 text-white'
                                      : 'bg-white border-slate-300 text-slate-900'}
                                  `}
                                />
                              </div>
                            </div>
                        )}

                        {isSHRS && (
                          <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm space-y-4`}>
                            <div>
                              <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-0.5`}>
                                Qualifying Assignment Method
                                </div>
                                <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} mb-2`}>
                                  Select how qualifying heats will be allocated.
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => !hasHeatScores && setShrsAssignmentMode('progressive')}
                                    disabled={hasHeatScores}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                      hasHeatScores ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    } ${shrsAssignmentMode === 'progressive'
                                      ? darkMode
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-blue-500 bg-blue-50'
                                      : darkMode
                                        ? 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <div className={`text-sm font-semibold ${shrsAssignmentMode === 'progressive'
                                      ? 'text-blue-500'
                                      : darkMode ? 'text-slate-300' : 'text-slate-700'
                                    }`}>
                                      Progressive (SHRS-P)
                                    </div>
                                    <div className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      Round 1 heats are assigned prior to racing. Subsequent heat movements are determined after each round based on heat results using structured Movement Tables.
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => !hasHeatScores && setShrsAssignmentMode('preset')}
                                    disabled={hasHeatScores}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                      hasHeatScores ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    } ${shrsAssignmentMode === 'preset'
                                      ? darkMode
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-green-500 bg-green-50'
                                      : darkMode
                                        ? 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <div className={`text-sm font-semibold ${shrsAssignmentMode === 'preset'
                                      ? 'text-green-600'
                                      : darkMode ? 'text-slate-300' : 'text-slate-700'
                                    }`}>
                                      Pre-Assigned (SHRS-PA)
                                    </div>
                                    <div className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      All qualifying heats for the nominated rounds are pre-assigned before racing. The rotation is structured to balance heat sizes and distribute competitor matchups evenly across the fleet.
                                    </div>
                                  </button>
                                </div>
                              </div>

                              <div>
                                <div className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-2`}>
                                  Race Structure
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1 block`}>
                                      Qualifying Rounds
                                    </label>
                                    <input
                                      type="number"
                                      min="2"
                                      max={Math.max(2, currentNumRaces - 2)}
                                      value={shrsQualifyingRounds}
                                      onChange={(e) => {
                                        const val = Math.max(2, Math.min(parseInt(e.target.value) || 2, currentNumRaces - 2));
                                        setShrsQualifyingRounds(val);
                                      }}
                                      disabled={hasFinalsScores}
                                      className={`w-full px-3 py-2 text-lg font-bold rounded-lg border ${
                                        hasFinalsScores ? 'opacity-50 cursor-not-allowed' : ''
                                      } ${
                                        darkMode
                                          ? 'bg-slate-700 border-slate-600 text-white'
                                          : 'bg-white border-slate-300 text-slate-900'
                                      }`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1 block`}>
                                      Finals Rounds
                                    </label>
                                    <div className={`w-full px-3 py-2 text-lg font-bold rounded-lg border ${
                                      darkMode
                                        ? 'bg-slate-700/50 border-slate-600 text-slate-300'
                                        : 'bg-slate-50 border-slate-300 text-slate-700'
                                    }`}>
                                      {Math.max(0, currentNumRaces - shrsQualifyingRounds)}
                                    </div>
                                  </div>
                                </div>
                                {hasHeatScores && !hasFinalsScores && (
                                  <div className={`mt-2 p-2 rounded-lg text-xs ${
                                    darkMode ? 'bg-amber-900/30 border border-amber-700/50 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'
                                  }`}>
                                    Qualifying rounds are in progress. You can still adjust this value, but previously scored rounds will retain their results. Ensure consistency before finalising qualifying.
                                  </div>
                                )}
                                {hasFinalsScores && (
                                  <div className={`mt-2 p-2 rounded-lg text-xs ${
                                    darkMode ? 'bg-red-900/30 border border-red-700/50 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'
                                  }`}>
                                    Finals have been scored. Qualifying round count is now locked.
                                  </div>
                                )}
                              </div>

                              <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} space-y-1`}>
                                {shrsAssignmentMode === 'progressive' ? (
                                  <>
                                    <p>After each race, heat assignments update based on finishing positions using the official SHRS Movement Tables.</p>
                                    <p>Finals: Skippers split into Gold/Silver{numHeats > 2 ? '/Bronze' : ''} fleets by qualifying rank.</p>
                                  </>
                                ) : (
                                  <>
                                    <p>All qualifying round assignments generated before racing. Algorithm maximizes opponent variety across rounds.</p>
                                    <p>Finals: Skippers split into Gold/Silver{numHeats > 2 ? '/Bronze' : ''} fleets by qualifying rank.</p>
                                  </>
                                )}
                            </div>
                          </div>
                        )}

                        {isSHRS && shrsAssignmentMode === 'preset' && skippers.length >= 4 && numHeats >= 2 && (
                          <DiversityGauge
                            totalSkippers={skippers.length}
                            numberOfHeats={numHeats}
                            qualifyingRounds={shrsQualifyingRounds}
                            darkMode={darkMode}
                          />
                        )}

                        <div className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'} p-2 rounded ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                          {isSHRS ? (
                            <>
                              <strong>SHRS-{shrsAssignmentMode === 'preset' ? 'PA' : 'P'} Configuration:</strong> {numHeats} heats, {shrsQualifyingRounds} qualifying + {Math.max(0, currentNumRaces - shrsQualifyingRounds)} finals rounds ({shrsAssignmentMode === 'preset' ? 'Pre-Assigned' : 'Progressive'}). Sizes: {heatSizes.join(', ')} boats.
                            </>
                          ) : manualHeatCount !== null || manualPromotionCount !== null ? (
                            <>
                              <strong>Configuration:</strong> {numHeats} heats with sizes of {heatSizes.join(', ')} boats.
                              {' '}{promotionCount} boats promotion/relegation{manualPromotionCount !== null ? ' (custom)' : ''}.
                            </>
                          ) : (
                            <>
                              <strong>Auto Configuration:</strong> 8 boats per heat, 4 boats promotion/relegation. Extra boats added to top heat (Heat A).
                            </>
                          )}
                        </div>

                        {/* Heat Display Settings - SHRS only */}
                        {isSHRS && <div className="space-y-3">
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              Heat Identification
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setHeatLabelStyle('letters')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                  heatLabelStyle === 'letters'
                                    ? darkMode
                                      ? 'bg-cyan-600 text-white'
                                      : 'bg-cyan-500 text-white'
                                    : darkMode
                                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Letters (A, B, C)
                              </button>
                              <button
                                onClick={() => setHeatLabelStyle('numbers')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                  heatLabelStyle === 'numbers'
                                    ? darkMode
                                      ? 'bg-cyan-600 text-white'
                                      : 'bg-cyan-500 text-white'
                                    : darkMode
                                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Numbers (1, 2, 3)
                              </button>
                            </div>
                          </div>

                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              Heat Racing Order
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setHeatOrder('ascending')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                  heatOrder === 'ascending'
                                    ? darkMode
                                      ? 'bg-cyan-600 text-white'
                                      : 'bg-cyan-500 text-white'
                                    : darkMode
                                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {heatLabelStyle === 'numbers'
                                  ? `${Array.from({ length: Math.min(numHeats, 3) }, (_, i) => i + 1).join(', ')}${numHeats > 3 ? '...' : ''}`
                                  : `${Array.from({ length: Math.min(numHeats, 3) }, (_, i) => String.fromCharCode(65 + i)).join(', ')}${numHeats > 3 ? '...' : ''}`
                                }
                              </button>
                              <button
                                onClick={() => setHeatOrder('descending')}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                  heatOrder === 'descending'
                                    ? darkMode
                                      ? 'bg-cyan-600 text-white'
                                      : 'bg-cyan-500 text-white'
                                    : darkMode
                                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {heatLabelStyle === 'numbers'
                                  ? `${Array.from({ length: Math.min(numHeats, 3) }, (_, i) => numHeats - i).join(', ')}${numHeats > 3 ? '...' : ''}`
                                  : `${Array.from({ length: Math.min(numHeats, 3) }, (_, i) => String.fromCharCode(65 + numHeats - 1 - i)).join(', ')}${numHeats > 3 ? '...' : ''}`
                                }
                              </button>
                            </div>
                            <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              Sets the display and scoring order of heats
                            </p>
                          </div>
                        </div>}

                        {/* Show validation warning if configuration is not practical */}
                        {!configValidation.isValid && (
                          <div className={`flex items-start gap-2 p-3 rounded-lg ${
                            darkMode ? 'bg-amber-900/20 border border-amber-600/30' : 'bg-amber-50 border border-amber-200'
                          }`}>
                            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className={`text-xs ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
                              <strong className="block mb-1">Configuration Warning:</strong>
                              {configValidation.message}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-600'} p-3 rounded ${darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50'}`}>
                        Need at least 12 skippers to enable heat racing. Currently: {skippers.length}
                      </div>
                    )}
                  </div>
                </div>

                {/* Observer Settings */}
                <div className={`p-5 rounded-xl border-2 space-y-4 ${
                  hasHeatScores ? 'opacity-60 pointer-events-none' : ''
                } ${
                  darkMode ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600' : 'bg-gradient-to-br from-purple-50 to-slate-50 border-purple-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye size={20} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                      <label className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Observer System
                      </label>
                    </div>
                    <button
                      onClick={() => !hasHeatScores && setEnableObservers(!enableObservers)}
                      type="button"
                      disabled={hasHeatScores}
                      className={`relative w-14 h-7 rounded-full transition-colors duration-200 shadow-sm ${
                        enableObservers ? 'bg-purple-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        enableObservers ? 'translate-x-8' : 'translate-x-1'
                      } mt-1`} />
                    </button>
                  </div>

                  <div className={`text-xs p-3 rounded-lg border ${
                    darkMode ? 'bg-slate-800/50 text-slate-400 border-slate-700' : 'bg-purple-50 text-purple-800 border-purple-100'
                  }`}>
                    {enableObservers ? (
                      <p>
                        <span className="font-semibold">Observers Active:</span> Skippers not racing in a heat will be automatically selected to observe for rule infringements. The system ensures fair rotation.
                      </p>
                    ) : (
                      <p>
                        Enable observers to have non-racing skippers volunteer to monitor for rule infringements during races.
                      </p>
                    )}
                  </div>

                  {enableObservers && (
                    <div className="space-y-3">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Observers Per Heat
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setObserversPerHeat(Math.max(2, observersPerHeat - 1))}
                          type="button"
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors border-2 ${
                            observersPerHeat <= 2
                              ? darkMode ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : darkMode ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                          }`}
                          disabled={observersPerHeat <= 2}
                        >
                          -
                        </button>
                        <div className={`flex-1 text-center px-4 py-3 rounded-xl border-2 ${
                          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                        }`}>
                          <div className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {observersPerHeat}
                          </div>
                          <div className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            observers
                          </div>
                        </div>
                        <button
                          onClick={() => setObserversPerHeat(Math.min(10, observersPerHeat + 1))}
                          type="button"
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors border-2 ${
                            observersPerHeat >= 10
                              ? darkMode ? 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : darkMode ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                          }`}
                          disabled={observersPerHeat >= 10}
                        >
                          +
                        </button>
                      </div>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'} text-center`}>
                        Recommended: 2-4 observers for effective monitoring
                      </p>
                    </div>
                  )}
                </div>
                </>
                )}

                {/* Roll Call & Spreadsheet Settings */}
                <div className={`p-5 rounded-xl border-2 space-y-4 ${
                  darkMode ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600' : 'bg-gradient-to-br from-blue-50 to-slate-50 border-blue-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                    <label className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Scoring Options
                    </label>
                  </div>

                  <label className={`flex items-center justify-between ${fleetManagementEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                    <div>
                      <div className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        Roll Call Before Scoring
                      </div>
                      <div className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {fleetManagementEnabled
                          ? 'Show roll call screen to mark skippers present/absent before each heat'
                          : 'Requires Fleet Management to be enabled'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!fleetManagementEnabled}
                      onClick={() => { if (fleetManagementEnabled) setEnableRollCall(!enableRollCall); }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        !fleetManagementEnabled ? (darkMode ? 'bg-slate-700' : 'bg-slate-200') :
                        enableRollCall ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enableRollCall && fleetManagementEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>

                  {scoringMode === 'spreadsheet' && (
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          Auto-Complete Sail Numbers
                        </div>
                        <div className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Automatically match and advance when a unique sail number is detected
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoCompleteSail(!autoCompleteSail)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                          autoCompleteSail ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoCompleteSail ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </label>
                  )}
                </div>

                {/* Initial Assignment - only when fleet management is on */}
                {(fleetManagementEnabled || isSHRS) && (
                <div className={`space-y-3 ${hasHeatScores ? 'pointer-events-none' : ''}`}>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Initial Assignment
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setInitialAssignment('random')}
                      disabled={hasHeatScores}
                      className={`
                        flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-lg text-sm font-medium transition-all
                        ${hasHeatScores
                          ? darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : initialAssignment === 'random'
                            ? 'bg-purple-600 text-white shadow-md'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      <Shuffle size={18} />
                      <span className="text-xs">Random</span>
                    </button>
                    <button
                      onClick={() => {
                        setInitialAssignment('manual');
                      }}
                      disabled={hasHeatScores}
                      className={`
                        flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-lg text-sm font-medium transition-all
                        ${hasHeatScores
                          ? darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : initialAssignment === 'manual'
                            ? 'bg-purple-600 text-white shadow-md'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      <Users size={18} />
                      <span className="text-xs">Manual</span>
                    </button>
                    <button
                      onClick={() => {
                        setInitialAssignment('hms');
                      }}
                      disabled={hasHeatScores}
                      className={`
                        flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-lg text-sm font-medium transition-all
                        ${hasHeatScores
                          ? darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : initialAssignment === 'hms'
                            ? 'bg-green-600 text-white shadow-md'
                            : darkMode
                              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      <Award size={18} />
                      <span className="text-xs">National Rankings</span>
                    </button>
                  </div>
                </div>
                )}



              </div>
            )}

            {/* Display Settings */}
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sailboat size={16} />
                  Display Settings
                </div>
              </label>

              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Show Country Flags
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFlag(!showFlag)}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${showFlag ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${showFlag ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Show Country Codes
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCountry(!showCountry)}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${showCountry ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${showCountry ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                </label>

                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Control display of country flags and 3-letter codes (e.g., AUS) in scoring tables and touch mode.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Footer with buttons */}
        <div className={`
          flex justify-end gap-3 p-4 border-t flex-shrink-0
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              `}
            >
              Cancel
            </button>
            {hasAnyScores && onClearAllRaceResults && (
              <button
                type="button"
                onClick={() => setShowHeatClearConfirmation(true)}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  bg-red-600 text-white hover:bg-red-700
                `}
                title="Clear all heat results and reset to Round 1"
              >
                Clear All Results
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isHeatRacingEnabled && !configValidation.isValid}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              isHeatRacingEnabled && !configValidation.isValid
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={isHeatRacingEnabled && !configValidation.isValid ? 'Fix configuration issues before saving' : ''}
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* Manual Heat Assignment Modal */}
      <ManualHeatAssignmentModal
        isOpen={showManualAssignmentModal}
        onClose={() => setShowManualAssignmentModal(false)}
        onConfirm={handleManualAssignmentConfirm}
        skippers={skippers}
        numHeats={numHeats}
        darkMode={darkMode}
        heatConfiguration={initialHeatManagement?.configuration}
        onRankingAssignment={() => {
          setShowManualAssignmentModal(false);
          setShowHMSSeedingModal(true);
        }}
      />

      {/* National Rankings Modal */}
      {showHMSSeedingModal && console.log('Rendering HMSSeedingModal with props:', {
        nationalAssociationId,
        yachtClassName: currentEvent?.raceClass,
        currentEventKeys: currentEvent ? Object.keys(currentEvent) : [],
        currentEventRaceClass: currentEvent?.raceClass
      })}
      <HMSSeedingModal
        isOpen={showHMSSeedingModal}
        onClose={() => setShowHMSSeedingModal(false)}
        onConfirm={handleHMSSeedingConfirm}
        skippers={skippers}
        numHeats={numHeats}
        darkMode={darkMode}
        currentEvent={currentEvent}
        nationalAssociationId={nationalAssociationId}
        yachtClassName={currentEvent?.raceClass}
      />

      {/* Clear All Heat Results Confirmation Modal */}
      <ConfirmationModal
        isOpen={showHeatClearConfirmation}
        onClose={() => setShowHeatClearConfirmation(false)}
        onConfirm={async () => {
          try {
            // Clear all race results first
            if (onClearAllRaceResults) {
              await onClearAllRaceResults();
            }

            // Reset heat management to Round 1 with original assignments (only if heat management is active)
            const settingsUpdate: any = {
              numRaces: currentNumRaces,
              dropRules: currentDropRules,
              displaySettings: {
                show_flag: showFlag,
                show_country: showCountry
              },
              observerSettings: {
                enable_observers: enableObservers,
                observers_per_heat: observersPerHeat,
                enable_roll_call: enableRollCall,
                auto_complete_sail: autoCompleteSail
              }
            };

            if (currentHeatManagement?.rounds?.[0]) {
              settingsUpdate.heatManagement = {
                ...currentHeatManagement,
                currentRound: 1,
                roundJustCompleted: null,
                lastPromotionInfo: null,
                rounds: [{
                  round: 1,
                  heatAssignments: currentHeatManagement.rounds[0].heatAssignments,
                  results: [],
                  completed: false
                }]
              };
            }

            onSaveSettings(settingsUpdate);

            if (addNotification) {
              addNotification('success', 'All results have been cleared. Starting fresh from Race 1.');
            }
          } catch (error) {
            console.error('Error clearing results:', error);
            if (addNotification) {
              addNotification('error', 'Failed to clear results. Please try again.');
            }
          }

          setShowHeatClearConfirmation(false);
          onClose();
        }}
        title="Clear All Heat Results"
        message="⚠️ WARNING: This will permanently delete ALL heat race results and reset to Round 1. All scoring progress will be lost and cannot be recovered. Are you absolutely sure you want to continue?"
        confirmText="Clear All Heat Results"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={showRegenerateConfirm}
        onClose={() => {
          setShowRegenerateConfirm(false);
          setPendingRegenerateAction(null);
        }}
        onConfirm={() => {
          setShowRegenerateConfirm(false);
          if (pendingRegenerateAction) {
            pendingRegenerateAction();
            setPendingRegenerateAction(null);
          }
        }}
        title="Regenerate Heat Assignments"
        message="This will regenerate all heat assignments. If you have previously exported or shared the heat assignment PDF, it will no longer match. Any existing results will be cleared. Do you want to continue?"
        confirmText="Regenerate Assignments"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />
    </>
  );
};