import React, { useState, useEffect } from 'react';
import { X, Settings, Trophy, Users, Shuffle, Hash, Award, Sun, Moon, Edit2, Check, AlertTriangle, Sailboat, Eye } from 'lucide-react';
import { HeatManagement, HeatConfiguration, SeedingMethod } from '../types/heat';
import { Skipper } from '../types';
import { seedInitialHeats, validateHeatConfig, HMSConfig, calculateOptimalHeats } from '../utils/hmsHeatSystem';
import { seedInitialHeatsForSHRS, calculateOptimalHeats as calculateOptimalHeatsSHRS } from '../utils/shrsHeatSystem';
import { ManualHeatAssignmentModal } from './ManualHeatAssignmentModal';
import { ConfirmationModal } from './ConfirmationModal';
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
    };
  }) => void;
  onManageSkippers?: () => void;
  addNotification?: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;
  hasRaceResults?: boolean;
  onClearAllRaceResults?: () => void;
  onScoringModeChange?: (mode: 'pro' | 'touch') => void;
  currentEvent?: any;
}

const DROP_RULE_OPTIONS = [
  { label: 'No Discards', value: [], forHeatRacing: false },
  { label: 'Low Point System (1 after 4, 2 after 8, 3 after 12 and then every 4 races after)', value: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40], forHeatRacing: false },
  { label: 'RRS - Appendix A Scoring System (1 after 4, 2 after 8, 3 after 16 and then every 8 races after)', value: [4, 8, 16, 24, 32, 40], forHeatRacing: false },
  { label: 'HMS Heat System', value: 'hms', forHeatRacing: true },
  { label: 'SHRS - Simple Heat Racing System (1 after 4, 2 after 8, +1 per 8 races)', value: 'shrs', forHeatRacing: true },
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
  currentEvent
}) => {
  const [currentNumRaces, setCurrentNumRaces] = useState(initialNumRaces);
  const [currentDropRules, setCurrentDropRules] = useState<number[] | string>(initialDropRules);
  const [customDropRules, setCustomDropRules] = useState('');
  const [isCustomDropRules, setIsCustomDropRules] = useState(false);
  const [showFlag, setShowFlag] = useState(currentEvent?.show_flag ?? true);
  const [showCountry, setShowCountry] = useState(currentEvent?.show_country ?? true);
  const [isHeatRacingEnabled, setIsHeatRacingEnabled] = useState(
    initialHeatManagement?.configuration.enabled || false
  );
  const [currentHeatManagement, setCurrentHeatManagement] = useState<HeatManagement | null>(initialHeatManagement);
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch'>('pro');

  // Observer settings
  const [enableObservers, setEnableObservers] = useState(currentEvent?.enable_observers ?? true);
  const [observersPerHeat, setObserversPerHeat] = useState(currentEvent?.observers_per_heat ?? 2);

  // Load user's scoring mode preference
  useEffect(() => {
    const loadScoringModePreference = async () => {
      if (!isOpen) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('scoring_mode_preference')
          .eq('id', user.id)
          .single();

        if (profileData?.scoring_mode_preference) {
          setScoringMode(profileData.scoring_mode_preference as 'pro' | 'touch');
        }
      }
    };

    loadScoringModePreference();
  }, [isOpen]);

  // Sync currentHeatManagement with initialHeatManagement when modal opens/updates
  useEffect(() => {
    setCurrentHeatManagement(initialHeatManagement);
    setIsHeatRacingEnabled(initialHeatManagement?.configuration.enabled || false);
  }, [initialHeatManagement, isOpen]);

  // Calculate optimal heats automatically based on skipper count
  const optimalHeats = calculateOptimalHeats(skippers.length);

  // Allow manual override of heat count
  const [isEditingHeats, setIsEditingHeats] = useState(false);
  const [manualHeatCount, setManualHeatCount] = useState<number | null>(null);

  // Allow manual override of promotion count
  const [isEditingPromotion, setIsEditingPromotion] = useState(false);
  const [manualPromotionCount, setManualPromotionCount] = useState<number | null>(null);

  // Confirmation modal for clearing all results
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Confirmation modal for clearing all heat results and resetting to Round 1
  const [showHeatClearConfirmation, setShowHeatClearConfirmation] = useState(false);

  // Initialize manual overrides from existing heat management configuration
  useEffect(() => {
    if (initialHeatManagement?.configuration) {
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
    }
  }, [initialHeatManagement, optimalHeats.numberOfHeats, optimalHeats.promotionCount]);

  // Check if any heat results exist (any round has been scored)
  const hasHeatScores = currentHeatManagement?.rounds.some(round =>
    round.results && round.results.length > 0 && round.results.some(r => r.position !== null)
  ) || false;

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

  const configValidation = validatePromotionRelegationPractical(skippers.length, numHeats, promotionCount);

  // Calculate heat sizes based on actual heat count (manual or auto)
  const calculateHeatSizes = (totalSkippers: number, heats: number): number[] => {
    if (heats === 0) return [];
    const baseSize = Math.floor(totalSkippers / heats);
    const remainder = totalSkippers % heats;
    const sizes = new Array(heats).fill(baseSize);
    // Add remainder boats to the FIRST heat (Heat A - top heat)
    // In HMS, Heat A is the top heat with best skippers and should be largest
    // Bottom heats (B, C, D, etc.) get base size
    if (remainder > 0) {
      sizes[0] += remainder;
    }
    return sizes;
  };

  const heatSizes = numHeats > 0 ? calculateHeatSizes(skippers.length, numHeats) : [];

  const [initialAssignment, setInitialAssignment] = useState<'random' | 'manual'>('random');
  const [showManualAssignmentModal, setShowManualAssignmentModal] = useState(false);

  useEffect(() => {
    if (initialHeatManagement?.configuration) {
      const config = initialHeatManagement.configuration;
      setInitialAssignment(config.seedingMethod === 'random' ? 'random' : 'manual');
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
      const seedingMethod: SeedingMethod = initialAssignment === 'random' ? 'random' : 'manual';
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

      // For manual assignment, open modal instead of auto-seeding
      if (initialAssignment === 'manual') {
        setShowManualAssignmentModal(true);
        return;
      }

      // DON'T seed heats immediately when toggling on
      // Wait until user clicks "Save Settings" to seed with final configuration
      // Just enable the UI for now
      return;
    } else if (!enabled) {
      // Disabling heat racing
      setIsHeatRacingEnabled(false);

      // If current scoring system is a heat racing system, switch to RRS
      if (currentDropRules === 'hms' || currentDropRules === 'shrs') {
        setCurrentDropRules([4, 8, 16, 24, 32, 40]); // RRS - Appendix A
      }

      if (currentHeatManagement) {
        // Disable heat management but preserve configuration
        setCurrentHeatManagement({
          ...currentHeatManagement,
          configuration: {
            ...currentHeatManagement.configuration,
            enabled: false
          }
        });
      }
    }
  };

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
      setCurrentDropRules(value); // Can be either array or string ('hms' or 'shrs')
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

    const finalHeatManagement = {
      configuration: {
        enabled: true,
        numberOfHeats: numHeats,
        promotionCount: promotionCount,
        seedingMethod: 'manual' as SeedingMethod,
        autoAssign: false,
        scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms'
      },
      currentRound: 1,
      currentHeat: assignments[assignments.length - 1].heatDesignation,
      rounds: [
        {
          round: 1,
          heatAssignments: assignments,
          results: [],
          completed: false
        }
      ]
    };

    console.log('🎯 Saving heat management:', JSON.stringify(finalHeatManagement, null, 2));

    onSaveSettings({
      numRaces: currentNumRaces,
      dropRules: currentDropRules,
      heatManagement: finalHeatManagement
    });

    setShowManualAssignmentModal(false);
  };

  const handleScoringModeChange = async (mode: 'pro' | 'touch') => {
    setScoringMode(mode);

    // Save to database
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ scoring_mode_preference: mode })
        .eq('id', user.id);

      // Notify parent component
      onScoringModeChange?.(mode);

      // Show notification
      if (addNotification) {
        addNotification('success', `Scoring mode changed to ${mode === 'pro' ? 'Pro Mode' : 'Touch Mode'}`);
      }
    }
  };

  const handleSave = async () => {
    let finalHeatManagement = currentHeatManagement;

    if (isHeatRacingEnabled) {
      // Validate configuration
      const seedingMethod: SeedingMethod = initialAssignment === 'random' ? 'random' : 'manual';
      const config: HMSConfig = {
        numberOfHeats: numHeats,
        promotionCount: promotionCount,
        seedingMethod,
        maxHeatSize: 12
      };

      const validation = validateHeatConfig(config, skippers.length);
      if (!validation.valid) {
        if (addNotification) {
          addNotification('error', `Cannot save heat racing settings: ${validation.errors.join(', ')}`);
        } else {
          alert(`Cannot save heat racing settings: ${validation.errors.join(', ')}`);
        }
        return;
      }

      // Show HMS recommendations as info notification
      if (validation.warnings.length > 0 && addNotification) {
        validation.warnings.forEach(warning => {
          addNotification('info', warning);
        });
      }

      if (currentHeatManagement) {
        // Check if number of heats changed or if there are no scores yet
        const heatCountChanged = currentHeatManagement.configuration.numberOfHeats !== numHeats;
        const hasAnyRoundResults = currentHeatManagement.rounds.some(r => r.results && r.results.length > 0);

        if (heatCountChanged && !hasAnyRoundResults) {
          // Number of heats changed and no scores - regenerate heats
          console.log('🔄 Heat count changed from', currentHeatManagement.configuration.numberOfHeats, 'to', numHeats, '- regenerating heats');

          let heatAssignments;

          if (currentDropRules === 'shrs') {
            // Use SHRS-specific seeding (zigzag pattern)
            const shrsHeats = seedInitialHeatsForSHRS(skippers, numHeats);
            const heatLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

            heatAssignments = Array.from(shrsHeats.entries()).map(([heatNum, heatSkippers]) => {
              const heatIndex = Number(heatNum) - 1;
              return {
                heatDesignation: heatLabels[heatIndex] as any,
                skipperIndices: heatSkippers.map(s => skippers.findIndex(sk => sk.sailNumber === s.sailNumber))
              };
            });
          } else {
            // Use HMS seeding
            heatAssignments = seedInitialHeats(skippers, config);
          }

          finalHeatManagement = {
            configuration: {
              enabled: true,
              numberOfHeats: numHeats,
              promotionCount: promotionCount,
              seedingMethod,
              autoAssign: initialAssignment === 'random',
              scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms'
            },
            currentRound: 1,
            currentHeat: heatAssignments[heatAssignments.length - 1].heatDesignation,
            rounds: [
              {
                round: 1,
                heatAssignments,
                results: [],
                completed: false
              }
            ]
          };
        } else {
          // If heats already seeded and has scores, just update configuration
          finalHeatManagement = {
            ...currentHeatManagement,
            configuration: {
              enabled: true,
              numberOfHeats: numHeats,
              promotionCount: promotionCount,
              seedingMethod,
              autoAssign: initialAssignment === 'random',
              scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms'
            }
          };
        }
      } else {
        // For manual assignment, show the manual assignment modal
        if (initialAssignment === 'manual') {
          setShowManualAssignmentModal(true);
          return; // Don't save yet, wait for manual assignments
        }

        // Create new heat management with seeded heats
        let heatAssignments;

        if (currentDropRules === 'shrs') {
          // Use SHRS-specific seeding (zigzag pattern)
          const shrsHeats = seedInitialHeatsForSHRS(skippers, numHeats);
          const heatLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

          heatAssignments = Array.from(shrsHeats.entries()).map(([heatNum, heatSkippers]) => {
            const heatIndex = Number(heatNum) - 1;
            return {
              heatDesignation: heatLabels[heatIndex] as any,
              skipperIndices: heatSkippers.map(s => skippers.findIndex(sk => sk.sailNumber === s.sailNumber))
            };
          });
        } else {
          // Use HMS seeding
          heatAssignments = seedInitialHeats(skippers, config);
        }

        finalHeatManagement = {
          configuration: {
            enabled: true,
            numberOfHeats: numHeats,
            promotionCount: promotionCount,
            seedingMethod,
            autoAssign: initialAssignment === 'random',
            scoringSystem: (currentDropRules === 'hms' || currentDropRules === 'shrs') ? currentDropRules : 'hms'
          },
          currentRound: 1,
          currentHeat: heatAssignments[heatAssignments.length - 1].heatDesignation, // Start with lowest heat
          rounds: [
            {
              round: 1,
              heatAssignments,
              results: [],
              completed: false
            }
          ]
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
        observers_per_heat: observersPerHeat
      }
    });

    // Show success notification
    if (addNotification) {
      addNotification('success', 'Updated Successfully');
    }

    // Close the modal
    onClose();
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

            {isHeatRacingEnabled && (
              <div className={`p-3 rounded-lg ${darkMode ? 'bg-amber-900/20 border border-amber-600/30' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className={`flex-shrink-0 mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                  <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                    Touch Mode is not available when Heat Racing is enabled. Heat Racing uses a specialized scoring interface.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleScoringModeChange('pro')}
                className={`
                  w-full p-4 rounded-lg transition-all border-2 text-left
                  ${scoringMode === 'pro'
                    ? darkMode
                      ? 'bg-blue-900/30 border-blue-600'
                      : 'bg-blue-50 border-blue-600'
                    : darkMode
                      ? 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Pro Mode
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Full table with all race details, handicaps, and scoring (Desktop)
                    </div>
                  </div>
                  {scoringMode === 'pro' && (
                    <div className="flex-shrink-0 ml-3">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    </div>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => !isHeatRacingEnabled && handleScoringModeChange('touch')}
                disabled={isHeatRacingEnabled}
                className={`
                  w-full p-4 rounded-lg transition-all border-2 text-left
                  ${isHeatRacingEnabled ? 'opacity-50 cursor-not-allowed' : ''}
                  ${scoringMode === 'touch'
                    ? darkMode
                      ? 'bg-blue-900/30 border-blue-600'
                      : 'bg-blue-50 border-blue-600'
                    : darkMode
                      ? 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Touch Mode
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Simplified tablet interface with large sail numbers (Tablet)
                      {isHeatRacingEnabled && ' - Not available with Heat Racing'}
                    </div>
                  </div>
                  {scoringMode === 'touch' && !isHeatRacingEnabled && (
                    <div className="flex-shrink-0 ml-3">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    </div>
                  )}
                </div>
              </button>
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

            {/* Number of Races */}
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Hash size={16} />
                  Number of Races
                </div>
              </label>
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

            {/* Scoring System */}
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Award size={16} />
                  Scoring System
                </div>
              </label>
              <div className="space-y-2">
                {DROP_RULE_OPTIONS
                  .filter(option => {
                    // Show heat-specific options only when heat racing is enabled
                    if (option.forHeatRacing) {
                      return isHeatRacingEnabled;
                    }
                    // Show non-heat options when heat racing is disabled
                    return !isHeatRacingEnabled;
                  })
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
                    <span className="font-semibold">{currentDropRules === 'shrs' ? 'SHRS' : 'HMS'} Heat Racing Active:</span> Skippers will be divided into heats with promotion/relegation between races.
                    Heats are scored from lowest to highest (F → A). Configure your settings below.
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
                  <div className={`p-3 rounded-lg flex items-start gap-3 ${
                    darkMode ? 'bg-amber-900/30 border border-amber-700/50' : 'bg-amber-50 border border-amber-200'
                  }`}>
                    <AlertTriangle className={`flex-shrink-0 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} size={20} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>
                        Heat Settings Locked
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                        Heat configuration cannot be changed after scoring has begun. Clear all round scores to modify settings.
                      </p>
                    </div>
                  </div>
                )}

                {/* Automatic Heat Configuration */}
                <div className={`p-4 rounded-lg ${
                  hasHeatScores
                    ? darkMode ? 'bg-slate-800/50 opacity-60' : 'bg-slate-100 opacity-60'
                    : darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                }`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Heat Configuration
                      </label>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Auto-calculated
                      </span>
                    </div>

                    {numHeats > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} relative`}>
                            <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-1`}>
                              Number of Heats
                            </div>
                            {isEditingHeats && !hasHeatScores ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="2"
                                  max="6"
                                  value={manualHeatCount !== null ? manualHeatCount : optimalHeats.numberOfHeats}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    if (value >= 2 && value <= 6) {
                                      // Check if this configuration would be valid
                                      const validation = validatePromotionRelegationPractical(skippers.length, value, promotionCount);
                                      if (!validation.isValid && addNotification) {
                                        addNotification('warning', validation.message || 'Invalid heat configuration');
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
                                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
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
                          <div className={`p-3 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} relative`}>
                            <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-1`}>
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
                                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
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

                        <div className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'} p-2 rounded ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                          {manualHeatCount !== null || manualPromotionCount !== null ? (
                            <>
                              <strong>Configuration:</strong> {numHeats} heats with sizes of {heatSizes.join(', ')} boats.
                              {promotionCount} boats promotion/relegation{manualPromotionCount !== null ? ' (custom)' : ''}.
                            </>
                          ) : (
                            <>
                              <strong>Auto Configuration:</strong> 8 boats per heat, 4 boats promotion/relegation. Extra boats added to top heat (Heat A).
                            </>
                          )}
                        </div>

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
                <div className={`p-4 rounded-lg space-y-4 ${
                  darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye size={18} className={darkMode ? 'text-purple-400' : 'text-purple-600'} />
                      <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Observer System
                      </label>
                    </div>
                    <button
                      onClick={() => setEnableObservers(!enableObservers)}
                      type="button"
                      className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                        enableObservers ? 'bg-purple-600' : darkMode ? 'bg-slate-600' : 'bg-slate-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                        enableObservers ? 'translate-x-8' : 'translate-x-1'
                      } mt-1`} />
                    </button>
                  </div>

                  <div className={`text-xs p-3 rounded-lg ${
                    darkMode ? 'bg-slate-800/50 text-slate-400' : 'bg-purple-50 text-purple-800'
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
                    <div className="space-y-2">
                      <label className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Observers Per Heat
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setObserversPerHeat(Math.max(2, observersPerHeat - 1))}
                          type="button"
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            observersPerHeat <= 2
                              ? darkMode ? 'bg-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                          disabled={observersPerHeat <= 2}
                        >
                          -
                        </button>
                        <div className={`flex-1 text-center px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-800' : 'bg-white'
                        }`}>
                          <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {observersPerHeat}
                          </div>
                          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            observers
                          </div>
                        </div>
                        <button
                          onClick={() => setObserversPerHeat(Math.min(10, observersPerHeat + 1))}
                          type="button"
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            observersPerHeat >= 10
                              ? darkMode ? 'bg-slate-700 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                          disabled={observersPerHeat >= 10}
                        >
                          +
                        </button>
                      </div>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'} text-center`}>
                        Recommended: 2-4 observers for effective monitoring
                      </p>
                    </div>
                  )}
                </div>

                {/* Initial Assignment */}
                <div className={`space-y-3 ${hasHeatScores ? 'pointer-events-none' : ''}`}>
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Initial Assignment
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInitialAssignment('random')}
                      disabled={hasHeatScores}
                      className={`
                        flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all
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
                      <Shuffle size={16} />
                      Random Assignment
                    </button>
                    <button
                      onClick={() => {
                        setInitialAssignment('manual');
                        // If heat racing is enabled, open modal immediately
                        if (isHeatRacingEnabled) {
                          setShowManualAssignmentModal(true);
                        }
                      }}
                      disabled={hasHeatScores}
                      className={`
                        flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all
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
                      <Users size={16} />
                      Manual Assignment
                    </button>
                  </div>
                </div>

                {/* Clear All Results - only show if heat scores exist */}
                {hasHeatScores && (
                  <div className="space-y-3 pt-4 border-t border-slate-700">
                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Danger Zone
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowHeatClearConfirmation(true)}
                      className={`
                        w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all
                        bg-red-600 text-white hover:bg-red-700
                      `}
                    >
                      <X size={16} />
                      Clear All Heat Results
                    </button>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      This will delete all heat race results and return to Round 1 with original heat assignments. This action cannot be undone.
                    </p>
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
            {hasRaceResults && onClearAllRaceResults && (
              <button
                type="button"
                onClick={() => setShowClearConfirmation(true)}
                className={`
                  px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-red-600 text-white hover:bg-red-700'}
                `}
                title="Clear all race results and start fresh"
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
      />

      {/* Clear All Results Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearConfirmation}
        onClose={() => setShowClearConfirmation(false)}
        onConfirm={async () => {
          if (onClearAllRaceResults) {
            await onClearAllRaceResults();
            if (addNotification) {
              addNotification('success', 'All race results have been cleared');
            }
            setShowClearConfirmation(false);
            // Close the settings panel after clearing
            onClose();
          }
        }}
        title="Clear All Results"
        message="Are you sure you want to clear ALL race results? This action cannot be undone."
        confirmText="Clear All Results"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />

      {/* Clear All Heat Results Confirmation Modal */}
      <ConfirmationModal
        isOpen={showHeatClearConfirmation}
        onClose={() => setShowHeatClearConfirmation(false)}
        onConfirm={async () => {
          // Clear all race results first
          if (onClearAllRaceResults) {
            await onClearAllRaceResults();
          }

          // Reset heat management to Round 1 with original assignments
          onSaveSettings({
            numRaces: currentNumRaces,
            dropRules: currentDropRules,
            heatManagement: {
              ...currentHeatManagement!,
              currentRound: 1,
              roundJustCompleted: null,
              lastPromotionInfo: null,
              rounds: [{
                round: 1,
                heatAssignments: currentHeatManagement!.rounds[0].heatAssignments,
                results: [],
                completed: false
              }]
            }
          });

          if (addNotification) {
            addNotification('success', 'All heat results have been cleared. Starting fresh from Round 1.');
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
    </>
  );
};