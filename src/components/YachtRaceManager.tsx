import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, CalendarRange, Flag, X, TrendingUp, ArrowUpDown, Home, Settings, Users, Hand, Table2 } from 'lucide-react';
import { RaceType, LetterScore } from '../types';
import { RaceEvent } from '../types/race';
import { OneOffRace } from './OneOffRace';
import { RaceSeries } from './RaceSeries';
import { RaceCalendar } from './RaceCalendar';
import { EventDetails } from './EventDetails';
import { VenueDetails } from './VenueDetails';
import { getStoredRaceEvents, setCurrentEvent, getCurrentEvent, clearCurrentEvent, updateEventResults, reloadCurrentEventFromDatabase } from '../utils/raceStorage';
import { Controls } from './Controls';
import { RaceTable } from './RaceTable';
import { ScratchRaceTable } from './ScratchRaceTable';
import { PerformanceGraphs } from './PerformanceGraphs';
import { ScratchPerformanceGraphs } from './ScratchPerformanceGraphs';
import { SkipperModal } from './SkipperModal';
import { MembershipManager } from './MembershipManager';
import { RaceHeader } from './RaceHeader';
import { RaceManagement } from './RaceManagement';
import { defaultSkippers } from '../data/skippers';
import '../styles/yacht-race.css';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { ConfirmationModal } from './ConfirmationModal';
import { HeatManagement, HeatResult, HeatDesignation } from '../types/heat';
import { HeatScoringTable } from './HeatScoringTable';
import { updateHeatResult, completeHeat, convertHeatResultsToRaceResults, clearHeatRaceResults } from '../utils/heatUtils';
import { HMSConfig } from '../utils/hmsHeatSystem';
import { SingleEventManagement } from './SingleEventManagement';
import { TouchModeScoring } from './TouchModeScoring';
import { calculateHandicaps } from '../utils/handicapCalculator';
import { RaceSettingsModal } from './RaceSettingsModal';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../utils/supabase';
import { updateRaceStatus, getLiveTrackingEvent } from '../utils/liveTrackingStorage';

interface YachtRaceManagerProps {
  onExitScoring?: () => void;
  darkMode?: boolean;
}

export const YachtRaceManager: React.FC<YachtRaceManagerProps> = ({
  onExitScoring,
  darkMode: propDarkMode
}) => {
  const [skippers, setSkippers] = useState(defaultSkippers);
  const [capLimit, setCapLimit] = useState(150);
  const [lastPlaceBonus, setLastPlaceBonus] = useState(false);
  const [raceResults, setRaceResults] = useState<any[]>([]);
  const [lastCompletedRace, setLastCompletedRace] = useState(0);
  const [hasDeterminedInitialHcaps, setHasDeterminedInitialHcaps] = useState(false);
  const [isManualHandicaps, setIsManualHandicaps] = useState(false);
  const [originalHandicaps, setOriginalHandicaps] = useState<{[key: number]: number}>({});
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [editingRace, setEditingRace] = useState<number | null>(null);
  const [isSkipperModalOpen, setIsSkipperModalOpen] = useState(false); // Don't auto-open skipper modal
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [isRaceManagementOpen, setIsRaceManagementOpen] = useState(true);
  // Use prop darkMode if provided, otherwise fall back to localStorage for backwards compatibility
  const [darkMode, setDarkMode] = useState(() => {
    if (propDarkMode !== undefined) return propDarkMode;
    const savedLightMode = localStorage.getItem('lightMode');
    return savedLightMode !== 'true'; // darkMode is inverse of lightMode
  });

  // Update darkMode when prop changes
  useEffect(() => {
    if (propDarkMode !== undefined) {
      setDarkMode(propDarkMode);
    }
  }, [propDarkMode]);

  const [raceType, setRaceType] = useState<RaceType>('scratch');
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [showChartsModal, setShowChartsModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [showRaceSettingsModal, setShowRaceSettingsModal] = useState(false);
  const [showClearResultsModal, setShowClearResultsModal] = useState(false);
  const [pendingClearScope, setPendingClearScope] = useState<'day' | 'all' | null>(null);
  const [heatManagement, setHeatManagement] = useState<HeatManagement | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [currentNumRaces, setCurrentNumRaces] = useState(12);
  const [currentDropRules, setCurrentDropRules] = useState<number[] | string>([4, 8, 16, 24, 32, 40]); // RRS - Appendix A default
  const [hasShownHeatNotification, setHasShownHeatNotification] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isDataFullyLoaded, setIsDataFullyLoaded] = useState(false);
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch'>('pro');
  const [touchModeCurrentRace, setTouchModeCurrentRace] = useState<number>(1);
  const [eventUpdateTrigger, setEventUpdateTrigger] = useState(0); // Force re-render when event is updated
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const isCalculatingHandicaps = useRef(false);

  // Load user's scoring mode preference
  useEffect(() => {
    const loadScoringModePreference = async () => {
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
  }, []);

  // Sync touch mode current race with last completed race
  useEffect(() => {
    setTouchModeCurrentRace(lastCompletedRace + 1);
  }, [lastCompletedRace]);

  // Check for heat racing eligibility (notification disabled to reduce distractions)
  useEffect(() => {
    if (skippers.length >= 16 && !hasShownHeatNotification && !heatManagement?.configuration.enabled) {
      // Silently track - no notification
      // addNotification('info', `🏁 Heat Racing is now available! With ${skippers.length} skippers, you can enable Heat Racing from the Settings menu for better race management.`);
      setHasShownHeatNotification(true);
    } else if (skippers.length < 16) {
      setHasShownHeatNotification(false);
    }
  }, [skippers.length, hasShownHeatNotification, heatManagement]);

  // Automatically set race status to 'on_hold' when race officer exits scoring
  useEffect(() => {
    return () => {
      // Cleanup function runs when component unmounts
      const currentEvent = getCurrentEvent();
      if (currentEvent?.id) {
        console.log('🏁 YachtRaceManager: Exiting scoring, setting status to on_hold for event:', currentEvent.id);

        // Check if live tracking is enabled for this event before updating status
        getLiveTrackingEvent(currentEvent.id).then((trackingEvent) => {
          if (trackingEvent && trackingEvent.enabled) {
            updateRaceStatus(currentEvent.id, 'on_hold').then((success) => {
              if (success) {
                console.log('✅ Successfully set race status to on_hold');
              } else {
                console.error('❌ Failed to set race status to on_hold');
              }
            });
          }
        }).catch((error) => {
          console.error('Error checking live tracking event:', error);
        });
      }
    };
  }, []); // Empty deps array means this only runs on unmount

  useEffect(() => {
    const currentEvent = getCurrentEvent();
    console.log('🏁 YachtRaceManager: getCurrentEvent() returned:', currentEvent ? {
      eventName: currentEvent.eventName,
      skippers: currentEvent.skippers?.length || 0,
      hasSkippersArray: Array.isArray(currentEvent.skippers),
      lastCompletedRace: currentEvent.lastCompletedRace
    } : null);

    if (currentEvent) {
      console.log('🏁 YachtRaceManager: Loading current event:', currentEvent.eventName);
      console.log('🏁 YachtRaceManager: event.currentDay:', currentEvent.currentDay);
      console.log('🏁 YachtRaceManager: event.multiDay:', currentEvent.multiDay);
      console.log('🏁 YachtRaceManager: event.dayResults:', Object.keys(currentEvent.dayResults || {}));
      setRaceType(currentEvent.raceFormat);

      // Set currentDay FIRST before loading day-specific data
      if (currentEvent.currentDay) {
        console.log('🏁 YachtRaceManager: Setting currentDay state to:', currentEvent.currentDay);
        setCurrentDay(currentEvent.currentDay);
      } else {
        console.warn('🏁 YachtRaceManager: No currentDay found in event, defaulting to 1');
        setCurrentDay(1);
      }

      // Set skippers or use empty array if none exist
      // Also enrich skippers with avatars from member profiles
      if (currentEvent.skippers && currentEvent.skippers.length > 0) {
        console.log('Setting skippers from event:', currentEvent.skippers.length);

        // Enrich skippers with avatars asynchronously
        (async () => {
          try {
            const currentClubId = localStorage.getItem('currentClubId');
            if (!currentClubId) {
              setSkippers(currentEvent.skippers);
              // Mark data as loaded after setting skippers
              setTimeout(() => setIsDataFullyLoaded(true), 100);
              return;
            }

            // Fetch all members for the club
            const { data: members, error: membersError } = await supabase
              .from('members')
              .select('id, first_name, last_name, user_id')
              .eq('club_id', currentClubId);

            if (membersError || !members) {
              console.error('Error fetching members for avatar enrichment:', membersError);
              setSkippers(currentEvent.skippers);
              // Mark data as loaded after setting skippers
              setTimeout(() => setIsDataFullyLoaded(true), 100);
              return;
            }

            // Get unique user IDs
            const userIds = members
              .filter((m: any) => m.user_id)
              .map((m: any) => m.user_id)
              .filter((id): id is string => id !== null);

            if (userIds.length === 0) {
              setSkippers(currentEvent.skippers);
              // Mark data as loaded after setting skippers
              setTimeout(() => setIsDataFullyLoaded(true), 100);
              return;
            }

            // Fetch avatar URLs for those users
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, avatar_url')
              .in('id', userIds);

            if (profilesError || !profiles) {
              console.error('Error fetching profiles for avatar enrichment:', profilesError);
              setSkippers(currentEvent.skippers);
              // Mark data as loaded after setting skippers
              setTimeout(() => setIsDataFullyLoaded(true), 100);
              return;
            }

            // Create a map of member name to avatar URL
            const avatarMap: {[key: string]: string} = {};
            members.forEach((member: any) => {
              if (member.user_id) {
                const profile = profiles?.find((p: any) => p.id === member.user_id);
                if (profile?.avatar_url) {
                  const fullName = `${member.first_name} ${member.last_name}`;
                  avatarMap[fullName] = profile.avatar_url;
                }
              }
            });

            // Enrich skippers with avatars
            const enrichedSkippers = currentEvent.skippers.map(skipper => ({
              ...skipper,
              avatarUrl: avatarMap[skipper.name] || skipper.avatarUrl
            }));

            setSkippers(enrichedSkippers);

            // Capture original handicaps when loading event (if no races completed yet)
            if ((!currentEvent.lastCompletedRace || currentEvent.lastCompletedRace === 0) &&
                (!currentEvent.raceResults || currentEvent.raceResults.length === 0)) {
              const origHandicaps: {[key: number]: number} = {};
              enrichedSkippers.forEach((skipper, idx) => {
                if (skipper.startHcap > 0) {
                  origHandicaps[idx] = skipper.startHcap;
                }
              });
              if (Object.keys(origHandicaps).length > 0) {
                console.log('📋 Captured original handicaps on event load:', origHandicaps);
                setOriginalHandicaps(origHandicaps);
              }
            }

            // Mark data as loaded AFTER async enrichment completes
            console.log('✅ Skipper avatar enrichment complete, marking data as fully loaded');
            setTimeout(() => setIsDataFullyLoaded(true), 100);
          } catch (error) {
            console.error('Error enriching skippers with avatars:', error);
            setSkippers(currentEvent.skippers);

            // Capture original handicaps even if enrichment fails
            if ((!currentEvent.lastCompletedRace || currentEvent.lastCompletedRace === 0) &&
                (!currentEvent.raceResults || currentEvent.raceResults.length === 0)) {
              const origHandicaps: {[key: number]: number} = {};
              currentEvent.skippers.forEach((skipper: any, idx: number) => {
                if (skipper.startHcap > 0) {
                  origHandicaps[idx] = skipper.startHcap;
                }
              });
              if (Object.keys(origHandicaps).length > 0) {
                console.log('📋 Captured original handicaps (enrichment failed):', origHandicaps);
                setOriginalHandicaps(origHandicaps);
              }
            }

            // Mark data as loaded even if enrichment fails
            setTimeout(() => setIsDataFullyLoaded(true), 100);
          }
        })();
      } else {
        console.log('No skippers in event, using empty array');
        setSkippers([]);
        // Mark data as loaded even when no skippers
        setTimeout(() => setIsDataFullyLoaded(true), 100);
      }

      // For multi-day events, load ONLY previous days' completed results
      const targetDay = currentEvent.currentDay || 1;
      if (currentEvent.multiDay && currentEvent.dayResults) {
        console.log('🏁 YachtRaceManager: Loading multi-day results. Target day:', targetDay);

        // Combine race results from PREVIOUS completed days only (not current day)
        let combinedRaceResults: any[] = [];
        let totalLastCompletedRace = 0;
        let cumulativeRaceOffset = 0;

        // Only load previous days (day < targetDay)
        for (let day = 1; day < targetDay; day++) {
          const dayData = currentEvent.dayResults[day];
          if (dayData && dayData.raceResults) {
            console.log(`🏁 YachtRaceManager: Loading Day ${day} results:`, dayData.raceResults.length, 'races, offset:', cumulativeRaceOffset);
            console.log(`🏁 Day ${day} race numbers in DB:`, dayData.raceResults.map(r => r.race));
            console.log(`🏁 Day ${day} lastCompletedRace:`, dayData.lastCompletedRace);

            // Adjust race numbers to be absolute (not day-relative)
            const adjustedResults = dayData.raceResults.map(result => ({
              ...result,
              race: result.race + cumulativeRaceOffset
            }));

            console.log(`🏁 Day ${day} adjusted race numbers:`, adjustedResults.map(r => r.race));

            combinedRaceResults = [...combinedRaceResults, ...adjustedResults];

            // Track the total number of completed races across all days by adding them up
            if (dayData.lastCompletedRace) {
              totalLastCompletedRace += dayData.lastCompletedRace;
              cumulativeRaceOffset += dayData.lastCompletedRace;
            }
          }
        }

        // Now load the current day's results separately (if they exist)
        const targetDayData = currentEvent.dayResults[targetDay];
        if (targetDayData && targetDayData.raceResults) {
          console.log(`🏁 YachtRaceManager: Loading current Day ${targetDay} results:`, targetDayData.raceResults.length, 'races');

          // Adjust current day's race numbers to be absolute
          const adjustedCurrentDayResults = targetDayData.raceResults.map(result => ({
            ...result,
            race: result.race + cumulativeRaceOffset
          }));

          combinedRaceResults = [...combinedRaceResults, ...adjustedCurrentDayResults];

          if (targetDayData.lastCompletedRace) {
            totalLastCompletedRace += targetDayData.lastCompletedRace;
          }
        }

        console.log('🏁 YachtRaceManager: Combined results:', combinedRaceResults.length, 'races, lastCompletedRace:', totalLastCompletedRace);

        setRaceResults(combinedRaceResults);
        setLastCompletedRace(totalLastCompletedRace);

        // Sync current_day to database for livestream overlay (multi-day event)
        const syncCurrentDayToDB = async () => {
          if (currentEvent.id) {
            try {
              const nextRace = totalLastCompletedRace + 1;
              console.log('🔄 On load sync: Updating current_day to:', nextRace, '(lastCompleted:', totalLastCompletedRace, ')');
              const { data, error } = await supabase
                .from('quick_races')
                .update({ current_day: nextRace })
                .eq('id', currentEvent.id)
                .select();

              if (error) {
                console.error('❌ Error syncing current_day on load:', error);
              } else {
                console.log('✅ Successfully synced current_day to:', nextRace, data);
              }
            } catch (error) {
              console.error('❌ Exception syncing current_day on load:', error);
            }
          }
        };
        syncCurrentDayToDB();

        // Use the current day's settings, or fall back to previous days
        const currentDayData = currentEvent.dayResults[targetDay];
        if (currentDayData) {
          setHasDeterminedInitialHcaps(currentDayData.hasDeterminedInitialHcaps || false);
          setIsManualHandicaps(currentDayData.isManualHandicaps || false);

          // Load heat management data only if it's enabled
          if (currentDayData.heatManagement && currentDayData.heatManagement.configuration.enabled) {
            setHeatManagement(currentDayData.heatManagement);

            // Also load the drop rules from heat management configuration
            if (currentDayData.heatManagement.configuration.scoringSystem) {
              setCurrentDropRules(currentDayData.heatManagement.configuration.scoringSystem);
            }
          }

          // Load drop rules from current day data if not from heat management
          if (currentDayData.dropRules && !currentDayData.heatManagement?.configuration.enabled) {
            setCurrentDropRules(currentDayData.dropRules);
          }
        } else {
          // If no data for current day yet, use settings from Day 1
          const day1Data = currentEvent.dayResults[1];
          if (day1Data) {
            setHasDeterminedInitialHcaps(day1Data.hasDeterminedInitialHcaps || false);
            setIsManualHandicaps(day1Data.isManualHandicaps || false);

            if (day1Data.heatManagement && day1Data.heatManagement.configuration.enabled) {
              setHeatManagement(day1Data.heatManagement);

              // Also load the drop rules from heat management configuration
              if (day1Data.heatManagement.configuration.scoringSystem) {
                setCurrentDropRules(day1Data.heatManagement.configuration.scoringSystem);
              }
            }

            // Load drop rules from day 1 data if not from heat management
            if (day1Data.dropRules && !day1Data.heatManagement?.configuration.enabled) {
              setCurrentDropRules(day1Data.dropRules);
            }
          }
        }
      } else {
        // For single-day events or if no day data exists yet
        if (currentEvent.raceResults) setRaceResults(currentEvent.raceResults);
        if (currentEvent.lastCompletedRace) {
          setLastCompletedRace(currentEvent.lastCompletedRace);

          // Sync current_day to database for livestream overlay (single-day event)
          const syncCurrentDayToDB = async () => {
            if (currentEvent.id) {
              try {
                const nextRace = currentEvent.lastCompletedRace + 1;
                console.log('🔄 On load sync (single-day): Updating current_day to:', nextRace, '(lastCompleted:', currentEvent.lastCompletedRace, ')');
                const { data, error } = await supabase
                  .from('quick_races')
                  .update({ current_day: nextRace })
                  .eq('id', currentEvent.id)
                  .select();

                if (error) {
                  console.error('❌ Error syncing current_day on load (single-day):', error);
                } else {
                  console.log('✅ Successfully synced current_day to:', nextRace, data);
                }
              } catch (error) {
                console.error('❌ Exception syncing current_day on load (single-day):', error);
              }
            }
          };
          syncCurrentDayToDB();
        }
        if (currentEvent.hasDeterminedInitialHcaps !== undefined) {
          setHasDeterminedInitialHcaps(currentEvent.hasDeterminedInitialHcaps);
        }
        if (currentEvent.isManualHandicaps !== undefined) {
          setIsManualHandicaps(currentEvent.isManualHandicaps);
        }
        // Load heat management data only if it's enabled
        if (currentEvent.heatManagement && currentEvent.heatManagement.configuration.enabled) {
          setHeatManagement(currentEvent.heatManagement);

          // Also load the drop rules from heat management configuration
          if (currentEvent.heatManagement.configuration.scoringSystem) {
            setCurrentDropRules(currentEvent.heatManagement.configuration.scoringSystem);
          }
        }

        // Load drop rules from event if not from heat management
        if (currentEvent.dropRules && !currentEvent.heatManagement?.configuration.enabled) {
          console.log('📊 Loading dropRules from event:', currentEvent.dropRules);
          setCurrentDropRules(currentEvent.dropRules);
        } else {
          console.log('⚠️ Event dropRules:', currentEvent.dropRules, 'Heat enabled:', currentEvent.heatManagement?.configuration.enabled);
          console.log('⚠️ Using current dropRules state (should be default [4,8,16,24,32,40])');
        }
      }

      console.log('🔍 Final currentDropRules state after loading:', currentDropRules);
      setIsRaceManagementOpen(false);

      // Auto-open skipper modal only if skippers haven't been added yet AND no scoring has started
      const hasSkippers = currentEvent.skippers && currentEvent.skippers.length > 0;
      const hasResults = (currentEvent.lastCompletedRace && currentEvent.lastCompletedRace > 0) ||
                        (currentEvent.raceResults && currentEvent.raceResults.length > 0);

      console.log('Has skippers:', hasSkippers, 'Has results:', hasResults);

      // Only open skipper modal if NO skippers have been added yet (first time scoring)
      // If skippers are already added OR results exist, go straight to scoring
      if (!hasSkippers && !hasResults) {
        console.log('Opening skipper modal - no skippers added yet');
        setIsSkipperModalOpen(true);
      } else {
        console.log('NOT opening skipper modal - skippers already added or results exist');
        setIsSkipperModalOpen(false);
      }
    }

    // Mark initial load as complete after a short delay to allow state to settle
    setTimeout(() => {
      console.log('Initial load complete, enabling auto-save');
      setIsInitialLoad(false);
    }, 100);

    // Note: isDataFullyLoaded is now set after async skipper enrichment completes
    // See the skipper loading code above
  }, []);

  useEffect(() => {
    // Skip auto-save during initial load to prevent overwriting loaded data
    if (isInitialLoad) {
      console.log('Skipping auto-save during initial load');
      return;
    }

    // CRITICAL: Don't auto-save until data is fully loaded
    if (!isDataFullyLoaded) {
      console.warn('⚠️ Skipping auto-save: Data not fully loaded yet');
      return;
    }

    const currentEvent = getCurrentEvent();
    if (!currentEvent) {
      console.warn('⚠️ No current event found in auto-save useEffect - skipping save');
      return;
    }

    // CRITICAL: Don't auto-save if we should have skippers but state is empty
    // This prevents overwriting database when continuing to score an event
    if (currentEvent.skippers && currentEvent.skippers.length > 0 && skippers.length === 0) {
      console.warn('⚠️ Skipping auto-save: Event should have skippers but state is empty (data still loading)');
      return;
    }

    // CRITICAL: Don't auto-save if we should have race results but state is empty
    // This prevents overwriting database when continuing to score a multi-day event
    if (currentEvent.multiDay && currentEvent.dayResults && Object.keys(currentEvent.dayResults).length > 0 && raceResults.length === 0) {
      console.warn('⚠️ Skipping auto-save: Multi-day event should have results but state is empty (data still loading)');
      return;
    }

    console.log('Auto-saving event results:', {
      eventId: currentEvent.id,
      eventName: currentEvent.eventName,
      raceResults,
      skippers,
      lastCompletedRace,
      hasDeterminedInitialHcaps,
      isManualHandicaps,
      currentDay,
      heatManagement
    });

    // Auto-save should NEVER mark event as completed
    // Completion only happens when user explicitly clicks "Complete Scoring"
    let isComplete = false;

    // If this is a multi-day event, we should only mark the entire event as completed
    // when all days have been scored
    if (currentEvent.multiDay) {
      const totalDays = currentEvent.numberOfDays || 1;

      // Check if all days have been scored
      let allDaysCompleted = true;
      const dayResults = { ...(currentEvent.dayResults || {}) };

      // Calculate how many races were completed in previous days
      let racesFromPreviousDays = 0;
      for (let day = 1; day < currentDay; day++) {
        const prevDayData = dayResults[day];
        if (prevDayData && prevDayData.lastCompletedRace) {
          racesFromPreviousDays += prevDayData.lastCompletedRace;
        }
      }

      console.log('🔍 AUTO-SAVE DEBUG:', {
        currentDay,
        racesFromPreviousDays,
        totalRaceResults: raceResults.length,
        raceNumbers: raceResults.map(r => r.race),
        lastCompletedRace,
        dayResultsKeys: Object.keys(dayResults)
      });

      // Filter to get only the current day's race results
      // Current day races will have race numbers > racesFromPreviousDays
      const currentDayRaceResults = raceResults.filter(result =>
        result.race > racesFromPreviousDays
      );

      console.log('🔍 Filtered current day results:', currentDayRaceResults.length, 'races with numbers:', currentDayRaceResults.map(r => r.race));

      // Adjust race numbers to be day-relative (1-based for each day)
      const adjustedCurrentDayResults = currentDayRaceResults.map(result => ({
        ...result,
        race: result.race - racesFromPreviousDays
      }));

      // Calculate lastCompletedRace for current day only
      const currentDayLastCompleted = lastCompletedRace - racesFromPreviousDays;

      console.log('🔍 Saving to day', currentDay, ':', {
        adjustedRaceNumbers: adjustedCurrentDayResults.map(r => r.race),
        lastCompletedRace: currentDayLastCompleted
      });

      // Update the current day's results
      dayResults[currentDay] = {
        raceResults: adjustedCurrentDayResults,
        lastCompletedRace: currentDayLastCompleted,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        heatManagement
      };

      // Check if all days have results
      for (let day = 1; day <= totalDays; day++) {
        const dayHasResults = dayResults[day] &&
                             dayResults[day].raceResults &&
                             dayResults[day].raceResults.length > 0;

        if (!dayHasResults) {
          allDaysCompleted = false;
          break;
        }
      }

      // Only mark as complete if all days are completed
      isComplete = allDaysCompleted && isComplete;

      // Pass the dayResults to updateEventResults for multi-day events
      try {
        updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          isComplete,
          currentDay,
          heatManagement,
          currentNumRaces,
          currentDropRules,
          dayResults // Pass the properly formatted dayResults
        );
      } catch (error) {
        console.error('❌ Error in auto-save updateEventResults (multi-day):', error);
        console.error('Error details:', {
          eventId: currentEvent.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        setError(error instanceof Error ? error.message : 'Failed to update results');
        // Don't throw - just log and continue
      }
    } else {
      // Single-day event auto-save
      try {
        updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          isComplete,
          currentDay,
          heatManagement,
          currentNumRaces,
          currentDropRules
        );
      } catch (error) {
        console.error('❌ Error in auto-save updateEventResults (single-day):', error);
        console.error('Error details:', {
          eventId: currentEvent.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        setError(error instanceof Error ? error.message : 'Failed to update results');
        // Don't throw - just log and continue
      }
    }
  }, [isInitialLoad, raceResults, skippers, lastCompletedRace, hasDeterminedInitialHcaps, isManualHandicaps, currentDay, heatManagement]);

  useEffect(() => {
    // Initial setup only - toggleDarkMode handles updates
    if (darkMode) {
      document.body.classList.add('dark');
      document.documentElement.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    // Prevent infinite loop by checking if we're already calculating
    if (isCalculatingHandicaps.current) {
      console.log('Handicap calculation already in progress, skipping');
      return;
    }

    if (raceResults.length > 0 && raceType === 'handicap' && !heatManagement?.configuration.enabled) {
      isCalculatingHandicaps.current = true;

      console.log('Calculating handicaps:', {
        skippers,
        raceResults,
        currentNumRaces,
        capLimit,
        lastPlaceBonus,
        isManualHandicaps
      });

      try {
        const { updatedSkippers, updatedResults } = calculateHandicaps(
          skippers,
          raceResults,
          currentNumRaces,
          capLimit,
          lastPlaceBonus,
          isManualHandicaps
        );

        console.log('Handicap calculation results:', {
          updatedSkippers,
          updatedResults
        });

        // Only update if there are actual changes to prevent infinite loop
        const skippersChanged = JSON.stringify(skippers) !== JSON.stringify(updatedSkippers);
        const resultsChanged = JSON.stringify(raceResults) !== JSON.stringify(updatedResults);

        if (skippersChanged || resultsChanged) {
          console.log('Applying handicap updates:', { skippersChanged, resultsChanged });
          setSkippers(updatedSkippers);
          setRaceResults(updatedResults);
          setLastUpdateTime(new Date());
        } else {
          console.log('No handicap changes detected, skipping update');
        }
      } catch (error) {
        console.error('Error calculating handicaps:', error);
        setError(error instanceof Error ? error.message : 'Failed to calculate handicaps');
      } finally {
        // Reset the flag after a brief delay to allow state updates to complete
        setTimeout(() => {
          isCalculatingHandicaps.current = false;
        }, 100);
      }
    }
  }, [raceResults, capLimit, lastPlaceBonus, raceType, heatManagement]);

  const startNewSession = () => {
    setRaceResults([]);
    setEditingRace(null);
    setLastUpdateTime(null);
    setLastCompletedRace(0);
    setHasDeterminedInitialHcaps(false);
    setIsManualHandicaps(false);
    setError(null);

    // If heat management is enabled, reset it but preserve the configuration
    if (heatManagement?.configuration.enabled) {
      let heatAssignments;

      // Check if this was manually assigned - if so, preserve the assignments
      if (heatManagement.configuration.seedingMethod === 'manual' &&
          heatManagement.rounds[0]?.heatAssignments) {
        // Preserve the original manual assignments
        heatAssignments = heatManagement.rounds[0].heatAssignments;
      } else {
        // Re-seed the heats with the same configuration (for random/ranking)
        const config: HMSConfig = {
          numberOfHeats: heatManagement.configuration.numberOfHeats,
          promotionCount: heatManagement.configuration.promotionCount || 4,
          seedingMethod: heatManagement.configuration.seedingMethod,
          maxHeatSize: 12
        };

        const { seedInitialHeats } = require('../utils/hmsHeatSystem');
        heatAssignments = seedInitialHeats(skippers, config);
      }

      const resetHeatManagement: HeatManagement = {
        configuration: heatManagement.configuration,
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

      setHeatManagement(resetHeatManagement);
      addNotification('success', 'Heat racing results cleared. Heat configuration preserved.');
    } else {
      // No heat management, just clear everything
      setHeatManagement(null);
    }

    const resetSkippers = skippers.map(skipper => ({
      ...skipper,
      startHcap: 0
    }));
    setSkippers(resetSkippers);
  };

  const skipperHasResults = (skipperIndex: number): boolean => {
    return raceResults.some(r => 
      r.skipperIndex === skipperIndex && 
      (r.position !== null || (r.letterScore && r.letterScore !== 'DNS'))
    );
  };

  const handleRaceTypeSelect = (type: RaceType) => {
    setRaceType(type);
    setIsRaceManagementOpen(false);
  };

  const determineInitialHandicaps = () => {
    const race1Results = skippers.map((_, index) => {
      const result = raceResults.find(r => r.race === 1 && r.skipperIndex === index);
      return result ? result.position : null;
    });
    
    if (race1Results.some(pos => pos === null)) {
      return false;
    }
    
    const step = 10;
    const ranking = race1Results.map((pos, idx) => ({ idx, pos }))
      .sort((a, b) => (a.pos || 0) - (b.pos || 0));
    
    const newSkippers = [...skippers];
    
    ranking.forEach((r, rank) => {
      const handicap = rank * step;
      newSkippers[r.idx] = { ...newSkippers[r.idx], startHcap: handicap };
    });
    
    setSkippers(newSkippers);
    setHasDeterminedInitialHcaps(true);
    setIsManualHandicaps(false);
    setLastCompletedRace(1);
    return true;
  };

  const enableManualHandicaps = () => {
    setIsManualHandicaps(true);
    setHasDeterminedInitialHcaps(false);
    
    const newSkippers = skippers.map(skipper => ({
      ...skipper,
      startHcap: 0
    }));
    setSkippers(newSkippers);
  };

  const updateSkipper = (skipperIndex: number, updates: Partial<Skipper>) => {
    const newSkippers = [...skippers];
    newSkippers[skipperIndex] = { ...newSkippers[skipperIndex], ...updates };
    setSkippers(newSkippers);

    // If this update includes a withdrawal, check if any races are now complete
    if (updates.withdrawnFromRace !== undefined) {
      // Use setTimeout to allow state to update first
      setTimeout(() => {
        // Check if the current race (or any race up to current) is now complete
        let highestConsecutiveRace = 0;
        for (let r = 1; r <= currentNumRaces; r++) {
          const isComplete = newSkippers.every((skipper, index) => {
            // Check if skipper has a result
            const result = raceResults.find(res => res.race === r && res.skipperIndex === index);
            if (result && (result.position !== null || result.letterScore)) {
              return true;
            }

            // Check if skipper is withdrawn for this race
            if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) {
              return true;
            }

            return false;
          });

          if (isComplete) {
            highestConsecutiveRace = r;
          } else {
            break;
          }
        }

        // Update lastCompletedRace if we found newly completed races
        if (highestConsecutiveRace > lastCompletedRace) {
          console.log('🎉 Withdrawal completed race(s)! Setting lastCompletedRace to:', highestConsecutiveRace);
          setLastCompletedRace(highestConsecutiveRace);
          setEditingRace(null);

          // Update current_day in database for livestream overlay sync
          if (currentEvent?.id) {
            const nextRace = highestConsecutiveRace + 1;
            console.log('📊 Withdrawal: Updating current_day to next race:', nextRace);
            supabase
              .from('quick_races')
              .update({ current_day: nextRace })
              .eq('id', currentEvent.id)
              .then(({ error }) => {
                if (error) {
                  console.error('❌ Error updating current_day after withdrawal:', error);
                }
              });
          }

          // Note: Don't update handicaps here - withdrawn skippers don't have actual race results yet.
          // Handicaps will be updated through the normal scoring flow.
        }
      }, 100);
    }
  };

  const updateStartHcap = (skipperIndex: number, value: number) => {
    const newSkippers = [...skippers];
    newSkippers[skipperIndex] = { ...newSkippers[skipperIndex], startHcap: value };
    setSkippers(newSkippers);

    // Store original handicap if this is the first time it's being set (before any race completion)
    if (lastCompletedRace === 0 && originalHandicaps[skipperIndex] === undefined) {
      setOriginalHandicaps(prev => ({ ...prev, [skipperIndex]: value }));
    }

    const race1Result = raceResults.find(
      r => r.race === 1 && r.skipperIndex === skipperIndex
    );

    if (race1Result) {
      const newResults = [...raceResults];
      const resultIndex = newResults.findIndex(
        r => r.race === 1 && r.skipperIndex === skipperIndex
      );
      if (resultIndex >= 0) {
        newResults[resultIndex] = {
          ...newResults[resultIndex],
          handicap: value,
          adjustedHcap: value
        };
      }
      setRaceResults(newResults);
    }

    // Check if ANY skipper now has a handicap set (not just this one)
    const hasAnyHandicaps = newSkippers.some(s => s.startHcap > 0);
    if (hasAnyHandicaps) {
      setHasDeterminedInitialHcaps(true);
      setIsManualHandicaps(true);
    } else {
      // If all handicaps are cleared, reset to needing seeded race
      setHasDeterminedInitialHcaps(false);
      setIsManualHandicaps(false);
    }
  };

  const handleUpdateSkippers = async (newSkippers: typeof skippers, options?: { skipRaceSettingsModal?: boolean }) => {
    // Check for duplicates
    const uniqueSkippers = [];
    const nameSet = new Set();

    for (const skipper of newSkippers) {
      if (!nameSet.has(skipper.name)) {
        nameSet.add(skipper.name);
        uniqueSkippers.push(skipper);
      }
    }

    // Detect newly added skippers
    const previousSkipperNames = new Set(skippers.map(s => s.name));
    const newlyAddedSkippers: number[] = [];

    uniqueSkippers.forEach((skipper, index) => {
      if (!previousSkipperNames.has(skipper.name)) {
        newlyAddedSkippers.push(index);
      }
    });

    setSkippers(uniqueSkippers);

    // Capture original handicaps if this is before any race completion (for handicap events)
    if (lastCompletedRace === 0 && raceType === 'handicap') {
      const newOriginalHandicaps: {[key: number]: number} = {};
      uniqueSkippers.forEach((skipper, idx) => {
        if (skipper.startHcap > 0 && originalHandicaps[idx] === undefined) {
          newOriginalHandicaps[idx] = skipper.startHcap;
        }
      });
      if (Object.keys(newOriginalHandicaps).length > 0) {
        setOriginalHandicaps(prev => ({ ...prev, ...newOriginalHandicaps }));
        console.log('Captured original handicaps:', newOriginalHandicaps);
      }
    }

    // Immediately save skippers to the event in the database
    const currentEvent = getCurrentEvent();
    if (currentEvent) {
      try {
        await updateEventResults(
          currentEvent.id,
          raceResults,
          uniqueSkippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          false, // not completed yet
          currentDay,
          heatManagement,
          currentNumRaces,
          currentDropRules
        );
        console.log('Skippers saved to event:', uniqueSkippers.length);
      } catch (error) {
        console.error('Error saving skippers to event:', error);
        addNotification('error', 'Failed to save skippers to event');
      }
    }

    // If there are completed races and new skippers were added, give them DNS for past races
    if (newlyAddedSkippers.length > 0 && lastCompletedRace > 0) {
      const dnsScore: LetterScore = 'DNS';
      const updatedResults = [...raceResults];

      // Add DNS results for each completed race for each new skipper
      for (let race = 1; race <= lastCompletedRace; race++) {
        newlyAddedSkippers.forEach(skipperIndex => {
          // Check if result already exists
          const existingResult = updatedResults.find(
            r => r.race === race && r.skipperIndex === skipperIndex
          );

          if (!existingResult) {
            updatedResults.push({
              race,
              skipperIndex,
              position: null,
              letterScore: dnsScore,
              points: uniqueSkippers.length + 1, // DNS points
              handicap: uniqueSkippers[skipperIndex].startHcap || 0,
              adjustedHcap: uniqueSkippers[skipperIndex].startHcap || 0
            });
          }
        });
      }

      setRaceResults(updatedResults);
      // Silently add skippers with DNS scores - no notification needed
      // addNotification('info', `${newlyAddedSkippers.length} new skipper${newlyAddedSkippers.length > 1 ? 's' : ''} added with DNS scores for ${lastCompletedRace} completed race${lastCompletedRace > 1 ? 's' : ''}.`);
    }

    // If heat management is enabled, we need to reset it
    // Skip opening the modal if requested (e.g., when editing from ManualHeatAssignmentModal)
    if (heatManagement?.configuration.enabled && !options?.skipRaceSettingsModal) {
      setShowRaceSettingsModal(true);
    } else if (newlyAddedSkippers.length === 0 && uniqueSkippers.length < skippers.length) {
      // Only clear results if skippers were removed and no new ones added
      setRaceResults([]);
      setLastCompletedRace(0);
      setHasDeterminedInitialHcaps(false);
      setIsManualHandicaps(false);
      setLastUpdateTime(null);
      setEditingRace(null);
    }
  };

  const updateMemberHandicaps = async (race: number, results: any[]) => {
    try {
      // Get the adjusted handicaps for each skipper after this race
      const handicapUpdates = skippers
        .map((skipper, index) => {
          const result = results.find(r => r.race === race && r.skipperIndex === index);
          if (result && result.adjustedHcap !== undefined && skipper.boatId) {
            return {
              boatId: skipper.boatId,
              handicap: result.adjustedHcap
            };
          }
          return null;
        })
        .filter((update): update is { boatId: string; handicap: number } => update !== null);

      // Update each boat's handicap in the database
      for (const update of handicapUpdates) {
        const { error } = await supabase
          .from('member_boats')
          .update({ handicap: update.handicap })
          .eq('id', update.boatId);

        if (error) {
          console.error(`Error updating handicap for boat ${update.boatId}:`, error);
        } else {
          console.log(`✅ Updated boat ${update.boatId} handicap to ${update.handicap}`);
        }
      }
    } catch (error) {
      console.error('Error updating boat handicaps:', error);
    }
  };

  const updateRaceResults = (race: number, skipperIndex: number, position: number | null, letterScore?: LetterScore, customPoints?: number) => {
    console.log('Updating race results:', {
      race,
      skipperIndex,
      position,
      letterScore,
      customPoints,
      currentResults: raceResults
    });

    // Auto-update status to live when results are being entered
    const autoUpdateStatusToLive = async () => {
      try {
        const currentEvent = getCurrentEvent();
        if (currentEvent?.id && (position !== null || letterScore)) {
          const trackingEvent = await getLiveTrackingEvent(currentEvent.id);
          if (trackingEvent && trackingEvent.race_status !== 'live') {
            await updateRaceStatus(currentEvent.id, 'live');
            console.log('🚦 Auto-updated race status to live');
          }
        }
      } catch (error) {
        console.error('❌ Error auto-updating race status:', error);
        // Don't block result entry on status update error
      }
    };

    // Update current_day in database for livestream overlay sync
    const updateCurrentDay = async () => {
      try {
        const currentEvent = getCurrentEvent();
        if (currentEvent?.id && race && (position !== null || letterScore)) {
          console.log('📊 Attempting to update current_day to:', race);
          const { error } = await supabase
            .from('quick_races')
            .update({ current_day: race })
            .eq('id', currentEvent.id);

          if (error) {
            console.error('❌ Error updating current_day:', error);
          } else {
            console.log('✅ Successfully updated current_day to:', race);
          }
        }
      } catch (error) {
        console.error('❌ Error in updateCurrentDay:', error);
      }
    };

    // Trigger the auto-updates (fire and forget - don't await)
    autoUpdateStatusToLive();
    updateCurrentDay();

    const newResults = [...raceResults];
    const resultIndex = newResults.findIndex(
      r => r.race === race && r.skipperIndex === skipperIndex
    );

    // Get the handicap for this race - use previous race's adjusted handicap or starting handicap
    const getCurrentHandicapForRace = (raceNum: number, skipIdx: number): number => {
      // Bounds check to prevent crashes from invalid skipperIndex
      if (skipIdx < 0 || skipIdx >= skippers.length) {
        console.error(`❌ Invalid skipperIndex ${skipIdx} - skippers array has ${skippers.length} entries (indices 0-${skippers.length - 1})`);
        console.error('Stack trace:', new Error().stack);
        return 0; // Return default handicap instead of crashing
      }

      if (raceNum === 1) {
        return skippers[skipIdx].startHcap || 0;
      }
      // Find the most recent previous race result with an adjusted handicap
      for (let prevRace = raceNum - 1; prevRace >= 1; prevRace--) {
        const prevResult = newResults.find(r => r.race === prevRace && r.skipperIndex === skipIdx);
        if (prevResult && prevResult.adjustedHcap !== undefined && prevResult.adjustedHcap !== null) {
          return prevResult.adjustedHcap;
        }
      }
      return skippers[skipIdx].startHcap || 0;
    };

    const currentHandicap = getCurrentHandicapForRace(race, skipperIndex);

    if (resultIndex >= 0) {
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        position,
        letterScore,
        customPoints, // Store custom points for RDG/DPI
        handicap: currentHandicap,
        adjustedHcap: currentHandicap // Will be recalculated by calculateHandicaps
      };
    } else {
      newResults.push({
        race,
        skipperIndex,
        position,
        letterScore,
        customPoints, // Store custom points for RDG/DPI
        handicap: currentHandicap,
        adjustedHcap: currentHandicap // Will be recalculated by calculateHandicaps
      });
    }

    // Check if this is the first NON-WITHDRAWN result being entered for this race
    // If so, auto-score any withdrawn skippers
    // Only count actual skipper results, not withdrawn skippers (WDN)
    const existingNonWithdrawnResults = newResults.filter(r =>
      r.race === race && r.letterScore !== 'WDN'
    );
    const isFirstResultForRace = existingNonWithdrawnResults.length === 1 && resultIndex < 0;

    if (isFirstResultForRace) {
      console.log('🎯 First result entered for race', race, '- checking for withdrawn skippers');

      skippers.forEach((skipper, index) => {
        // Check if skipper is withdrawn for this race
        if (skipper.withdrawnFromRace && race >= skipper.withdrawnFromRace) {
          // Check if they don't already have a result for this race
          const hasResult = newResults.some(r => r.race === race && r.skipperIndex === index);
          if (!hasResult) {
            console.log('🚫 Auto-scoring withdrawn skipper:', skipper.name);

            // Get handicap from previous race if available (for handicap racing)
            let handicap = skipper.startHcap || 0;
            if (race > 1 && raceType !== 'scratch') {
              const prevResult = newResults.find(r => r.race === race - 1 && r.skipperIndex === index);
              if (prevResult && prevResult.adjustedHcap !== undefined) {
                handicap = prevResult.adjustedHcap;
              }
            }

            // Create race result for withdrawn skipper
            newResults.push({
              race: race,
              skipperIndex: index,
              position: null,
              letterScore: 'WDN',
              customPoints: skippers.length + 1,
              handicap: raceType !== 'scratch' ? handicap : undefined,
              adjustedHcap: raceType !== 'scratch' ? handicap : undefined
            });
          }
        }
      });
    }

    const race1Complete = race === 1 && skippers.every((_, index) => {
      const result = newResults.find(r => r.race === 1 && r.skipperIndex === index);
      return result && (result.position !== null || result.letterScore);
    });

    if (race === 1 && race1Complete && raceType === 'handicap') {
      if (!isManualHandicaps && !hasDeterminedInitialHcaps) {
        const step = 10;
        const ranking = skippers.map((_, idx) => ({
          idx,
          pos: newResults.find(r => r.race === 1 && r.skipperIndex === idx)?.position || 0
        })).sort((a, b) => a.pos - b.pos);

        const updatedSkippers = [...skippers];
        ranking.forEach((r, rank) => {
          const handicap = rank * step;
          updatedSkippers[r.idx] = { ...updatedSkippers[r.idx], startHcap: handicap };
        });
        
        setSkippers(updatedSkippers);
      }
      setHasDeterminedInitialHcaps(true);
      setLastCompletedRace(1);
    }
    
    // Only update the race completion status when all skippers have results
    // This prevents premature sorting of skippers during race entry
    const raceComplete = skippers.every((skipper, index) => {
      // Check if skipper has a result
      const result = newResults.find(r => r.race === race && r.skipperIndex === index);
      if (result && (result.position !== null || result.letterScore)) {
        return true;
      }

      // Check if skipper is withdrawn for this race
      if (skipper.withdrawnFromRace && race >= skipper.withdrawnFromRace) {
        return true;
      }

      return false;
    });

    // In touch mode, don't auto-advance to next race until user confirms
    // This prevents the race from jumping forward before the confirm button can be clicked
    if (raceComplete && scoringMode !== 'touch') {
      // Find the highest consecutive completed race starting from race 1
      let highestConsecutiveRace = 0;
      for (let r = 1; r <= currentNumRaces; r++) {
        const isComplete = skippers.every((skipper, index) => {
          // Check if skipper has a result
          const result = newResults.find(res => res.race === r && res.skipperIndex === index);
          if (result && (result.position !== null || result.letterScore)) {
            return true;
          }

          // Check if skipper is withdrawn for this race
          if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) {
            return true;
          }

          return false;
        });
        if (isComplete) {
          highestConsecutiveRace = r;
        } else {
          break;
        }
      }

      if (highestConsecutiveRace > lastCompletedRace) {
        console.log('Setting last completed race to highest consecutive:', highestConsecutiveRace);
        setLastCompletedRace(highestConsecutiveRace);
      }
      setEditingRace(null);

      // For handicap races, update member handicaps in the database after race completion
      if (raceType === 'handicap') {
        updateMemberHandicaps(race, newResults);
      }
    }
    
    console.log('Setting new race results:', newResults);
    setRaceResults(newResults);

    // Auto-save to database for live tracking
    autoSaveRaceResults(newResults);
  };

  // Auto-save race results to database for live tracking
  const autoSaveRaceResults = async (results: any[]) => {
    try {
      const currentEvent = getCurrentEvent();
      if (!currentEvent || !currentEvent.id) {
        console.log('⚠️ No current event, skipping auto-save');
        return;
      }

      // Update database to trigger live tracking sync
      await updateEventResults(
        currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
        results,
        skippers,
        lastCompletedRace,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        false, // Not completed yet
        currentDay,
        heatManagement,
        currentNumRaces,
        currentDropRules,
        currentEvent.multiDay ? currentEvent.dayResults : undefined
      );

      console.log('✅ Auto-saved race results to database');
    } catch (error) {
      console.error('❌ Error auto-saving race results:', error);
      // Don't block user interaction on save errors
    }
  };

  const deleteRaceResult = (race: number, skipperIndex: number) => {
    console.log('Deleting race result:', { race, skipperIndex });

    const newResults = raceResults.filter(
      r => !(r.race === race && r.skipperIndex === skipperIndex)
    );
    
    const remainingRace1Results = newResults.filter(r => r.race === 1);
    
    if (race === 1 && !isManualHandicaps && raceType === 'handicap') {
      if (remainingRace1Results.length === 0) {
        const resetSkippers = skippers.map(skipper => ({
          ...skipper,
          startHcap: 0
        }));
        setSkippers(resetSkippers);
        setHasDeterminedInitialHcaps(false);
      } else if (remainingRace1Results.length > 0) {
        const step = 10;
        const ranking = remainingRace1Results
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map(r => r.skipperIndex);
        
        const updatedSkippers = skippers.map(skipper => ({
          ...skipper,
          startHcap: 0
        }));
        
        ranking.forEach((skipperIdx, rank) => {
          updatedSkippers[skipperIdx].startHcap = rank * step;
        });
        
        setSkippers(updatedSkippers);
      }
    }
    
    setRaceResults(newResults);

    // Auto-save to database for live tracking
    autoSaveRaceResults(newResults);

    const raceEntries = newResults.filter(r => r.race === race);
    if (raceEntries.length === 0 && race === lastCompletedRace) {
      const prevRace = Math.max(...newResults.map(r => r.race), 0);
      console.log('Setting last completed race to previous race:', prevRace);
      setLastCompletedRace(prevRace);

      if (race === 1 && !isManualHandicaps && raceType === 'handicap') {
        const resetSkippers = skippers.map(skipper => ({
          ...skipper,
          startHcap: 0
        }));
        setSkippers(resetSkippers);
        setHasDeterminedInitialHcaps(false);
      }
    }
  };

  const clearRace = (race: number) => {
    console.log('Clearing race:', race, 'and all subsequent races');
    // Clear this race AND all subsequent races
    const newResults = raceResults.filter(r => r.race < race);
    setRaceResults(newResults);

    // Auto-save to database for live tracking
    autoSaveRaceResults(newResults);

    // Clear any withdrawals that were set for this race or later
    // This prevents withdrawn skippers from incorrectly appearing as withdrawn after clearing
    const newSkippers = skippers.map((skipper) => {
      // If a skipper was withdrawn starting from this race or later, clear their withdrawal
      if (skipper.withdrawnFromRace !== undefined && skipper.withdrawnFromRace >= race) {
        console.log('Clearing withdrawal flag for skipper:', skipper.name, 'from race', skipper.withdrawnFromRace);
        return {
          ...skipper,
          withdrawnFromRace: undefined
        };
      }
      return skipper;
    });

    // If clearing R1, also restore original handicaps
    if (race === 1 && Object.keys(originalHandicaps).length > 0) {
      console.log('Restoring original handicaps after clearing R1:', originalHandicaps);
      const skipperWithRestoredHcaps = newSkippers.map((skipper, idx) => ({
        ...skipper,
        startHcap: originalHandicaps[idx] !== undefined ? originalHandicaps[idx] : skipper.startHcap
      }));
      setSkippers(skipperWithRestoredHcaps);
    } else {
      setSkippers(newSkippers);
    }

    // If clearing any race, update lastCompletedRace to the race before the one being cleared
    // This allows touch scoring to jump back to the cleared race
    if (race <= lastCompletedRace) {
      // Set lastCompletedRace to the race before the cleared one
      const newLastCompletedRace = race - 1;
      console.log('Setting last completed race to:', newLastCompletedRace);
      setLastCompletedRace(newLastCompletedRace);
    }

    setEditingRace(null);
  };

  // Clear race results for specific skippers only (used in heat racing)
  const clearRaceForSkippers = (race: number, skipperIndices: number[]) => {
    console.log('🗑️ Clearing race', race, 'for skippers:', skipperIndices);
    const skipperSet = new Set(skipperIndices);
    const newResults = raceResults.filter(
      r => !(r.race === race && skipperSet.has(r.skipperIndex))
    );
    console.log('📊 Results before:', raceResults.length, 'after:', newResults.length);
    setRaceResults(newResults);
  };

  // Atomically replace race results for specific skippers (clear + add in one update)
  const replaceRaceResultsForSkippers = (
    race: number,
    skipperIndices: number[],
    newEntries: Array<{ skipperIndex: number; position: number | null; letterScore?: any; customPoints?: number }>
  ) => {
    console.log('🔄 Replacing race', race, 'results for', skipperIndices.length, 'skippers with', newEntries.length, 'entries');

    setRaceResults(prevResults => {
      const skipperSet = new Set(skipperIndices);

      // First, filter out all old results for this race and these skippers
      const filteredResults = prevResults.filter(
        r => !(r.race === race && skipperSet.has(r.skipperIndex))
      );

      console.log('📊 Removed old results, count:', prevResults.length, '->', filteredResults.length);

      // Then add the new entries
      const updatedResults = [...filteredResults];
      newEntries.forEach(entry => {
        const currentHandicap = (() => {
          if (entry.skipperIndex < 0 || entry.skipperIndex >= skippers.length) {
            return 0;
          }
          if (race === 1) {
            return skippers[entry.skipperIndex].startHcap || 0;
          }
          for (let prevRace = race - 1; prevRace >= 1; prevRace--) {
            const prevResult = filteredResults.find(r => r.race === prevRace && r.skipperIndex === entry.skipperIndex);
            if (prevResult && prevResult.adjustedHcap !== undefined && prevResult.adjustedHcap !== null) {
              return prevResult.adjustedHcap;
            }
          }
          return skippers[entry.skipperIndex].startHcap || 0;
        })();

        updatedResults.push({
          race,
          skipperIndex: entry.skipperIndex,
          position: entry.position,
          letterScore: entry.letterScore,
          customPoints: entry.customPoints,
          handicap: currentHandicap,
          adjustedHcap: currentHandicap
        });
      });

      console.log('➕ Added new entries, final count:', updatedResults.length);

      // Auto-save to database for live tracking
      autoSaveRaceResults(updatedResults);

      return updatedResults;
    });
  };

  const enableRaceEditing = async (raceNum: number | null) => {
    console.log('🎯 Enabling race editing for race:', raceNum);
    console.log('🎯 Current event ID:', currentEvent?.id);
    setEditingRace(raceNum);

    // Update current_day in database for livestream overlay sync
    if (raceNum !== null && currentEvent?.id) {
      try {
        console.log('🔄 Attempting to update current_day in database...');
        const { data, error } = await supabase
          .from('quick_races')
          .update({ current_day: raceNum })
          .eq('id', currentEvent.id)
          .select();

        if (error) {
          console.error('❌ Database error updating current_day:', error);
        } else {
          console.log('✅ Successfully updated current_day to:', raceNum);
          console.log('✅ Database response:', data);
        }
      } catch (error) {
        console.error('❌ Exception updating current_day:', error);
      }
    } else {
      console.warn('⚠️ Cannot update current_day - raceNum or event ID missing');
    }
  };

  const canEnterRace2 = () => {
    const race1Complete = skippers.every((_, index) => {
      const result = raceResults.find(r => r.race === 1 && r.skipperIndex === index);
      return result && (result.position !== null || result.letterScore);
    });
    
    if (raceType === 'scratch') {
      return race1Complete;
    }
    
    return race1Complete && (
      hasDeterminedInitialHcaps || 
      isManualHandicaps ||
      skippers.some(s => s.startHcap > 0)
    );
  };

  const handleReturnToRaceManagement = async () => {
    console.log('🔴 handleReturnToRaceManagement called');

    // Always close the confirmation modal first
    setShowExitConfirm(false);

    try {
      console.log('🔴 Starting return to dashboard process');
      console.log('🔴 Current state:', {
        raceResults: raceResults.length,
        skippers: skippers.length,
        lastCompletedRace,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        currentDay,
        heatManagement: !!heatManagement
      });

      const currentEvent = getCurrentEvent();
      console.log('🔴 Current event:', currentEvent?.eventName, 'ID:', currentEvent?.id);

      if (!currentEvent) {
        console.error('🔴 No current event found - navigating anyway');
        // Still navigate even if no current event
        navigate('/');
        return;
      }

      if (currentEvent) {
        // For multi-day events, need to properly separate day results
        if (currentEvent.multiDay) {
          const dayResults = { ...(currentEvent.dayResults || {}) };

          // Calculate how many races were completed in previous days
          let racesFromPreviousDays = 0;
          for (let day = 1; day < currentDay; day++) {
            const prevDayData = dayResults[day];
            if (prevDayData && prevDayData.lastCompletedRace) {
              racesFromPreviousDays += prevDayData.lastCompletedRace;
            }
          }

          // Filter to get only the current day's race results
          const currentDayRaceResults = raceResults.filter(result =>
            result.race > racesFromPreviousDays
          );

          // Adjust race numbers to be day-relative (1-based for each day)
          const adjustedCurrentDayResults = currentDayRaceResults.map(result => ({
            ...result,
            race: result.race - racesFromPreviousDays
          }));

          // Calculate lastCompletedRace for current day only
          const currentDayLastCompleted = lastCompletedRace - racesFromPreviousDays;

          // Update the current day's results
          dayResults[currentDay] = {
            raceResults: adjustedCurrentDayResults,
            lastCompletedRace: currentDayLastCompleted,
            hasDeterminedInitialHcaps,
            isManualHandicaps,
            heatManagement
          };

          console.log('🔴 Calling updateEventResults for multi-day event');
          await updateEventResults(
            currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
            raceResults,
            skippers,
            lastCompletedRace,
            hasDeterminedInitialHcaps,
            isManualHandicaps,
            false, // Never complete when returning to dashboard
            currentDay,
            heatManagement,
            currentNumRaces,
            currentDropRules,
            dayResults // Pass the properly formatted dayResults
          );
          console.log('🔴 Multi-day update completed successfully');
        } else {
          // Single-day event
          console.log('🔴 Calling updateEventResults for single-day event');
          await updateEventResults(
            currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
            raceResults,
            skippers,
            lastCompletedRace,
            hasDeterminedInitialHcaps,
            isManualHandicaps,
            false, // Never complete when returning to dashboard
            currentDay,
            heatManagement,
            currentNumRaces,
            currentDropRules
          );
          console.log('🔴 Single-day update completed successfully');
        }
      }

      console.log('🔴 Event results saved successfully');
    } catch (error) {
      console.error('❌ Error saving results:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      // Don't block navigation on save error - results are auto-saved anyway
      addNotification('warning', 'Results may not have been saved, but will be auto-saved on next change');
    }

    // Update race status to on_hold when exiting scoring
    try {
      if (currentEvent?.id) {
        const trackingEvent = await getLiveTrackingEvent(currentEvent.id);
        if (trackingEvent) {
          await updateRaceStatus(currentEvent.id, 'on_hold');
          console.log('🔴 Updated race status to on_hold');
        }
      }
    } catch (error) {
      console.error('❌ Error updating race status:', error);
      // Don't block navigation on status update error
    }

    // Always clear and navigate, even if save failed
    try {
      console.log('🔴 Clearing current event from localStorage');
      clearCurrentEvent();

      console.log('🔴 Calling onExitScoring callback');
      if (onExitScoring) {
        onExitScoring();
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }

    // Always navigate to dashboard
    console.log('🔴 Navigating to dashboard via navigate()');
    try {
      navigate('/');
      console.log('🔴 navigate() called successfully');

      // Fallback: if navigate doesn't work after 100ms, use window.location
      setTimeout(() => {
        if (window.location.pathname !== '/') {
          console.log('🔴 navigate() did not work, using window.location.href');
          window.location.href = '/';
        }
      }, 100);
    } catch (error) {
      console.error('🔴 Error calling navigate(), using window.location.href', error);
      window.location.href = '/';
    }
    console.log('🔴 Navigation call completed');
  };

  const handleClearResults = async (scope: 'day' | 'all') => {
    console.log(`🗑️ Clearing ${scope === 'day' ? 'current day' : 'all'} results...`);
    setShowClearResultsModal(false);

    const currentEvent = getCurrentEvent();
    if (!currentEvent) return;

    if (scope === 'day') {
      // Clear current day only
      setRaceResults([]);
      setLastCompletedRace(0);

      // Restore original handicaps and clear withdrawal flags
      const newSkippers = skippers.map((skipper, idx) => ({
        ...skipper,
        startHcap: originalHandicaps[idx] !== undefined ? originalHandicaps[idx] : skipper.startHcap,
        withdrawnFromRace: undefined
      }));
      setSkippers(newSkippers);

      // Reset handicap determination flags
      setHasDeterminedInitialHcaps(false);
      setIsManualHandicaps(false);

      // Save cleared day results
      try {
        await updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          [],
          skippers,
          0,
          false,
          false,
          false,
          currentDay,
          heatManagement,
          currentNumRaces,
          currentDropRules as number[]
        );
        console.log(`✅ Cleared Day ${currentDay} results`);
        if (addNotification) {
          addNotification('success', `Day ${currentDay} results cleared`);
        }
      } catch (error) {
        console.error('❌ Error clearing day results:', error);
        if (addNotification) {
          addNotification('error', 'Failed to clear day results');
        }
      }
    } else {
      // Clear all days - this is more complex and needs to reset the entire event
      setRaceResults([]);
      setLastCompletedRace(0);

      const newSkippers = skippers.map((skipper, idx) => ({
        ...skipper,
        startHcap: originalHandicaps[idx] !== undefined ? originalHandicaps[idx] : skipper.startHcap,
        withdrawnFromRace: undefined
      }));
      setSkippers(newSkippers);

      setHasDeterminedInitialHcaps(false);
      setIsManualHandicaps(false);

      try {
        // For multi-day events, we need to clear all days
        if (currentEvent.multiDay && currentEvent.numDays) {
          for (let day = 1; day <= currentEvent.numDays; day++) {
            await updateEventResults(
              currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
              [],
              skippers,
              0,
              false,
              false,
              false,
              day,
              heatManagement,
              currentNumRaces,
              currentDropRules as number[]
            );
          }
        }
        console.log('✅ Cleared all event results');
        if (addNotification) {
          addNotification('success', 'All event results cleared');
        }
      } catch (error) {
        console.error('❌ Error clearing all results:', error);
        if (addNotification) {
          addNotification('error', 'Failed to clear all results');
        }
      }
    }
  };

  const handleCompleteScoring = async () => {
    console.log('🏁 handleCompleteScoring called');

    // Always close the confirmation modal first
    setShowCompleteConfirm(false);

    try {
      console.log('🏁 Starting event completion process');

      const currentEvent = getCurrentEvent();
      console.log('🏁 Current event:', currentEvent?.eventName, 'ID:', currentEvent?.id);

      if (!currentEvent) {
        console.error('🏁 No current event found - navigating anyway');
        // Still navigate even if no current event
        navigate('/');
        return;
      }

      if (currentEvent) {
        // For multi-day events, check if all days are completed
        let isComplete = true;

        if (currentEvent.multiDay) {
          const totalDays = currentEvent.numberOfDays || 1;
          const dayResults = { ...(currentEvent.dayResults || {}) };

          // Calculate how many races were completed before this day
          let racesBeforeThisDay = 0;
          for (let day = 1; day < currentDay; day++) {
            const dayData = dayResults[day];
            if (dayData && dayData.lastCompletedRace) {
              racesBeforeThisDay += dayData.lastCompletedRace;
            }
          }

          console.log('🏁 Races completed before day', currentDay, ':', racesBeforeThisDay);
          console.log('🏁 Total race results:', raceResults.length);
          console.log('🏁 lastCompletedRace (total across all days):', lastCompletedRace);

          // Filter to get only the current day's race results (races with numbers > racesBeforeThisDay)
          const thisDayRaceResults = raceResults.filter(result =>
            result.race > racesBeforeThisDay && result.race <= lastCompletedRace
          );

          // Adjust race numbers to be day-relative (1-based for each day)
          const adjustedThisDayResults = thisDayRaceResults.map(result => ({
            ...result,
            race: result.race - racesBeforeThisDay
          }));

          // Calculate this day's lastCompletedRace (day-relative)
          const thisDayLastCompleted = lastCompletedRace - racesBeforeThisDay;

          console.log('🏁 Saving', adjustedThisDayResults.length, 'races for day', currentDay, '(day lastCompletedRace:', thisDayLastCompleted, ')');

          // Update the current day's results with ONLY this day's races
          dayResults[currentDay] = {
            raceResults: adjustedThisDayResults,
            lastCompletedRace: thisDayLastCompleted, // This day's completed races only
            hasDeterminedInitialHcaps,
            isManualHandicaps,
            heatManagement,
            dayCompleted: true // Mark this day as completed
          };

          // Check if all days have been completed
          for (let day = 1; day <= totalDays; day++) {
            const dayData = dayResults[day];
            const dayIsCompleted = dayData && dayData.dayCompleted === true;

            if (!dayIsCompleted) {
              isComplete = false;
              break;
            }
          }

          // Update the event with the new day results
          currentEvent.dayResults = dayResults;

          // Calculate the next day that needs scoring
          let nextDayToScore = currentDay + 1;
          for (let day = 1; day <= totalDays; day++) {
            const dayData = dayResults[day];
            if (!dayData || dayData.dayCompleted !== true) {
              nextDayToScore = day;
              break;
            }
          }

          console.log('🏁 Multi-day event - next day to score:', nextDayToScore);

          // Update the currentDay in the event for next time
          currentEvent.currentDay = nextDayToScore;
        }

        // Mark event as completed only if all days are done (or single day)
        // For multi-day events, pass the next day to score so it's saved to the database
        const dayToSaveInDb = currentEvent.multiDay && !isComplete ? currentEvent.currentDay : currentDay;

        console.log('🏁 Saving to database with:', {
          eventId: currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          isComplete,
          dayToSaveInDb,
          raceResultsCount: raceResults.length,
          skippersCount: skippers.length,
          lastCompletedRace,
          multiDay: currentEvent.multiDay
        });

        await updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          isComplete, // Only mark as complete if all days are done
          dayToSaveInDb, // Save the next day to score in the database
          heatManagement,
          currentNumRaces, // Use actual numRaces instead of hardcoded 12
          currentDropRules, // Use actual dropRules instead of empty array
          currentEvent.multiDay ? currentEvent.dayResults : undefined // Pass the updated dayResults for multi-day events
        );

        console.log('🏁 Database update completed successfully');

        // Show success notification
        if (currentEvent.multiDay && !isComplete) {
          addNotification('success', `Day ${currentDay} scoring completed! ${totalDays - currentDay} day(s) remaining.`);
          // Update localStorage with next day
          setCurrentEvent(currentEvent);
        } else {
          addNotification('success', 'Results published successfully!');
        }
      }

      console.log('🏁 Event completion successful');
    } catch (error) {
      console.error('❌ Error completing scoring:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      // Don't block navigation on error
      addNotification('warning', 'Results may not have been published, but will be auto-saved');
    }

    // Update race status based on completion state
    try {
      const currentEvent = getCurrentEvent();
      if (currentEvent?.id) {
        const trackingEvent = await getLiveTrackingEvent(currentEvent.id);
        if (trackingEvent) {
          // Determine the appropriate status
          let newStatus: 'completed_for_day' | 'event_complete';

          if (currentEvent.multiDay) {
            const totalDays = currentEvent.numberOfDays || 1;
            const isLastDay = currentDay >= totalDays;

            if (isLastDay) {
              newStatus = 'event_complete';
            } else {
              newStatus = 'completed_for_day';
            }
          } else {
            // Single day event
            newStatus = 'event_complete';
          }

          await updateRaceStatus(currentEvent.id, newStatus);
          console.log(`🏁 Updated race status to ${newStatus}`);
        }
      }
    } catch (error) {
      console.error('❌ Error updating race status:', error);
      // Don't block navigation on status update error
    }

    // Always clear and navigate, even if there was an error
    try {
      const currentEvent = getCurrentEvent();
      // Only clear if single-day OR last day of multi-day event
      if (!currentEvent?.multiDay || (currentEvent.multiDay && currentEvent.currentDay >= (currentEvent.numberOfDays || 1))) {
        console.log('🏁 Clearing current event from localStorage');
        clearCurrentEvent();
      }

      console.log('🏁 Calling onExitScoring callback');
      if (onExitScoring) {
        onExitScoring();
      }
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }

    // Always navigate to dashboard
    console.log('🏁 Navigating to dashboard via navigate()');
    try {
      navigate('/');
      console.log('🏁 navigate() called successfully');

      // Fallback: if navigate doesn't work after 100ms, use window.location
      setTimeout(() => {
        if (window.location.pathname !== '/') {
          console.log('🏁 navigate() did not work, using window.location.href');
          window.location.href = '/';
        }
      }, 100);
    } catch (error) {
      console.error('🏁 Error calling navigate(), using window.location.href', error);
      window.location.href = '/';
    }
    console.log('🏁 Navigation call completed');
  };

  const handleEventSelect = (event: RaceEvent) => {
    console.log('Selected event:', event);
    setSelectedEvent(event);
  };

  const handleStartScoring = () => {
    if (selectedEvent) {
      console.log('Starting scoring for event:', selectedEvent);
      setCurrentEvent(selectedEvent);
      setRaceType(selectedEvent.raceFormat);
      
      // For multi-day events, we need to handle day progression properly
      if (selectedEvent.multiDay) {
        // Determine which day we should be scoring
        let targetDay = selectedEvent.currentDay || 1;
        
        // If the current day is completed, move to the next day
        if (selectedEvent.dayResults && selectedEvent.dayResults[targetDay]) {
          const currentDayData = selectedEvent.dayResults[targetDay];
          if (currentDayData.lastCompletedRace > 0) {
            // Current day has results, check if we should move to next day
            const totalDays = selectedEvent.numberOfDays || 1;
            if (targetDay < totalDays) {
              targetDay = targetDay + 1;
            }
          }
        }
        
        setCurrentDay(targetDay);
        
        // Update the event's current day
        const updatedEvent = { ...selectedEvent, currentDay: targetDay };
        setCurrentEvent(updatedEvent);
        
        // Load skippers from the event (they should be consistent across all days)
        if (selectedEvent.skippers && selectedEvent.skippers.length > 0) {
          console.log('Loading existing skippers for multi-day event:', selectedEvent.skippers);
          setSkippers(selectedEvent.skippers);
        }
        
        // Load the appropriate day's results
        if (selectedEvent.dayResults && selectedEvent.dayResults[targetDay]) {
          const dayData = selectedEvent.dayResults[targetDay];
          setRaceResults(dayData.raceResults || []);
          setLastCompletedRace(dayData.lastCompletedRace || 0);
          setHasDeterminedInitialHcaps(dayData.hasDeterminedInitialHcaps || false);
          setIsManualHandicaps(dayData.isManualHandicaps || false);
          
          // Load heat management data if available
          if (dayData.heatManagement) {
            setHeatManagement(dayData.heatManagement);
          } else {
            setHeatManagement(null);
          }
        } else {
          // If no day results yet, start fresh for this day but keep handicap state from previous days
          setRaceResults([]);
          setLastCompletedRace(0);
          // For multi-day events, preserve handicap determination from previous days
          setHasDeterminedInitialHcaps(selectedEvent.hasDeterminedInitialHcaps || false);
          setIsManualHandicaps(selectedEvent.isManualHandicaps || false);
          setHeatManagement(null);
        }
        
        // Don't auto-open skipper modal for multi-day events since skippers should already be set
        setIsSkipperModalOpen(false);
      } else {
        // Single-day event handling
        // Always load skippers if they exist in the event
      if (selectedEvent.skippers && selectedEvent.skippers.length > 0) {
        console.log('Loading existing skippers:', selectedEvent.skippers);
        setSkippers(selectedEvent.skippers);
      }
      
        if (selectedEvent.raceResults && selectedEvent.raceResults.length > 0) {
          setRaceResults(selectedEvent.raceResults);
        }
        
        if (selectedEvent.lastCompletedRace) {
          setLastCompletedRace(selectedEvent.lastCompletedRace);
        }
        
        if (selectedEvent.hasDeterminedInitialHcaps !== undefined) {
          setHasDeterminedInitialHcaps(selectedEvent.hasDeterminedInitialHcaps);
        }
        
        if (selectedEvent.isManualHandicaps !== undefined) {
          setIsManualHandicaps(selectedEvent.isManualHandicaps);
        }
        
        if (selectedEvent.heatManagement) {
          setHeatManagement(selectedEvent.heatManagement);
        } else {
          setHeatManagement(null);
        }
        
        // Don't auto-open skipper modal here - it will be handled by the initial useEffect
        setIsSkipperModalOpen(false);
      }
      
      setSelectedEvent(null);
      setIsRaceManagementOpen(false);
    }
  };

  const handleDayChange = async (day: number) => {
    // Save current day's results before switching
    const currentEvent = getCurrentEvent();
    if (currentEvent) {
      // For multi-day events, we need to be careful about the completed flag
      let isComplete = lastCompletedRace >= 1;

      // If this is a multi-day event, we should only mark the entire event as completed
      // when all days have been scored
      if (currentEvent.multiDay) {
        const totalDays = currentEvent.numberOfDays || 1;

        // Check if all days have been scored
        let allDaysCompleted = true;
        const dayResults = { ...(currentEvent.dayResults || {}) };

        // Calculate how many races were completed in previous days
        let racesFromPreviousDays = 0;
        for (let d = 1; d < currentDay; d++) {
          const prevDayData = dayResults[d];
          if (prevDayData && prevDayData.lastCompletedRace) {
            racesFromPreviousDays += prevDayData.lastCompletedRace;
          }
        }

        // Filter to get only the current day's race results
        const currentDayRaceResults = raceResults.filter(result =>
          result.race > racesFromPreviousDays
        );

        // Adjust race numbers to be day-relative (1-based for each day)
        const adjustedCurrentDayResults = currentDayRaceResults.map(result => ({
          ...result,
          race: result.race - racesFromPreviousDays
        }));

        // Calculate lastCompletedRace for current day only
        const currentDayLastCompleted = lastCompletedRace - racesFromPreviousDays;

        // Update the current day's results
        dayResults[currentDay] = {
          raceResults: adjustedCurrentDayResults,
          lastCompletedRace: currentDayLastCompleted,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          heatManagement
        };

        // Check if all days have results
        for (let d = 1; d <= totalDays; d++) {
          // Skip the day we're about to switch to
          if (d === currentDay) continue;

          const dayHasResults = dayResults[d] &&
                               dayResults[d].raceResults &&
                               dayResults[d].raceResults.length > 0;

          if (!dayHasResults) {
            allDaysCompleted = false;
            break;
          }
        }

        // Only mark as complete if all days are completed
        isComplete = allDaysCompleted && isComplete;

        updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          isComplete,
          currentDay,
          heatManagement,
          currentNumRaces,
          currentDropRules,
          dayResults // Pass the properly formatted dayResults
        );
      } else {
        // Single-day event
        updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          isComplete,
          currentDay,
          heatManagement
        );
      }
    }

    // Update current day and load that day's results
    setCurrentDay(day);

    // Update current_day in database for livestream overlay sync
    if (currentEvent?.id) {
      try {
        await supabase
          .from('quick_races')
          .update({ current_day: day })
          .eq('id', currentEvent.id);
        console.log('Updated current_day to:', day);
      } catch (error) {
        console.error('Error updating current_day:', error);
      }
    }

    // Reload the event with the new day
    if (currentEvent) {
      currentEvent.currentDay = day;
      // Make sure the event is not marked as completed if we're switching days
      if (currentEvent.multiDay) {
        currentEvent.completed = false;
      }
      setCurrentEvent(currentEvent);
      
      // Reset race results for the new day
      if (currentEvent.dayResults && currentEvent.dayResults[day]) {
        setRaceResults(currentEvent.dayResults[day].raceResults || []);
        setLastCompletedRace(currentEvent.dayResults[day].lastCompletedRace || 0);
        setHasDeterminedInitialHcaps(currentEvent.dayResults[day].hasDeterminedInitialHcaps || false);
        setIsManualHandicaps(currentEvent.dayResults[day].isManualHandicaps || false);
        
        // Load heat management data if available
        if (currentEvent.dayResults[day].heatManagement) {
          setHeatManagement(currentEvent.dayResults[day].heatManagement);
        } else {
          setHeatManagement(null);
        }
      } else {
        // If no results for this day yet, start fresh
        setRaceResults([]);
        setLastCompletedRace(0);
        setHeatManagement(null);
      }
    }
  };

  const handleSaveHeatConfiguration = (newHeatManagement: HeatManagement) => {
    setHeatManagement(newHeatManagement);
    
    // If heat management is disabled, make sure we don't have any heat-specific results
    if (!newHeatManagement.configuration.enabled) {
      setHeatManagement(null);
    }
  };

  const handleUpdateHeatResult = (result: HeatResult) => {
    if (!heatManagement) return;

    const updatedHeatManagement = updateHeatResult(heatManagement, result);
    setHeatManagement(updatedHeatManagement);
  };

  const handleClearHeatRaceResults = (heatDesignation: HeatDesignation, round: number, race: number, skipperIndices: number[]) => {
    if (!heatManagement) return;

    const updatedHeatManagement = clearHeatRaceResults(heatManagement, heatDesignation, round, race, skipperIndices);
    setHeatManagement(updatedHeatManagement);
    console.log('Heat race results cleared for heat', heatDesignation, 'round', round, 'race', race);
  };

  const handleSaveRaceSettings = async (settings: {
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
  }) => {
    console.log('💾 Saving race settings in YachtRaceManager:', JSON.stringify(settings.heatManagement, null, 2));

    setCurrentNumRaces(settings.numRaces);
    setCurrentDropRules(settings.dropRules);
    setHeatManagement(settings.heatManagement);

    console.log('💾 Heat management state updated');

    // CRITICAL: When clearing heat results, explicitly save to database immediately
    // This ensures the cleared state persists and triggers live tracking updates
    const currentEvent = getCurrentEvent();
    if (currentEvent) {
      console.log('💾 Explicitly saving cleared heat management to database...');
      try {
        await updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          false, // not completed
          currentDay,
          settings.heatManagement, // Use the new heat management from settings
          settings.numRaces,
          settings.dropRules as number[]
        );
        console.log('✅ Heat management saved to database successfully');

        // Save display settings and observer settings if provided
        if ((settings.displaySettings || settings.observerSettings) && currentEvent.id) {
          const updateData: any = {};

          if (settings.displaySettings) {
            updateData.show_flag = settings.displaySettings.show_flag;
            updateData.show_country = settings.displaySettings.show_country;
          }

          if (settings.observerSettings) {
            updateData.enable_observers = settings.observerSettings.enable_observers;
            updateData.observers_per_heat = settings.observerSettings.observers_per_heat;
            console.log('💾 Saving observer settings:', settings.observerSettings);
          }

          console.log('💾 Final update data to save:', updateData);

          const { error } = await supabase
            .from('quick_races')
            .update(updateData)
            .eq('id', currentEvent.id);

          if (error) {
            console.error('❌ Error saving display/observer settings:', error);
          } else {
            console.log('✅ Display/Observer settings saved successfully to database');
            // Update the current event in localStorage
            const updatedEvent = {
              ...currentEvent,
              ...(settings.displaySettings && {
                show_flag: settings.displaySettings.show_flag,
                show_country: settings.displaySettings.show_country
              }),
              ...(settings.observerSettings && {
                enable_observers: settings.observerSettings.enable_observers,
                observers_per_heat: settings.observerSettings.observers_per_heat
              })
            };
            setCurrentEvent(updatedEvent);
            console.log('✅ Updated currentEvent with observer settings:', {
              enable_observers: updatedEvent.enable_observers,
              observers_per_heat: updatedEvent.observers_per_heat
            });

            // Update the selectedEvent state to reflect the changes
            if (selectedEvent) {
              const updatedSelectedEvent = {
                ...selectedEvent,
                ...(settings.displaySettings && {
                  show_flag: settings.displaySettings.show_flag,
                  show_country: settings.displaySettings.show_country
                }),
                ...(settings.observerSettings && {
                  enable_observers: settings.observerSettings.enable_observers,
                  observers_per_heat: settings.observerSettings.observers_per_heat
                })
              };
              setSelectedEvent(updatedSelectedEvent);
              console.log('✅ Updated selectedEvent with observer settings:', {
                enable_observers: updatedSelectedEvent.enable_observers,
                observers_per_heat: updatedSelectedEvent.observers_per_heat
              });
            }

            // Force component re-render to pick up the updated event
            setEventUpdateTrigger(prev => prev + 1);

            // CRITICAL: Reload event from database to pick up all updated fields
            // This ensures observer settings and other DB-only fields are loaded
            console.log('🔄 Reloading event from database to pick up changes...');
            const reloadedEvent = await reloadCurrentEventFromDatabase();
            if (reloadedEvent) {
              setSelectedEvent(reloadedEvent);
              console.log('✅ Event reloaded with observer settings:', {
                enable_observers: reloadedEvent.enable_observers,
                observers_per_heat: reloadedEvent.observers_per_heat
              });
            }
          }
        }
      } catch (error) {
        console.error('❌ Error saving heat management to database:', error);
      }
    }

    // If heat racing was just enabled, show success notification
    if (settings.heatManagement?.configuration.enabled && !heatManagement?.configuration.enabled) {
      addNotification('success', '🏁 Heat Racing has been configured! The race table now shows heat-based scoring.');
    }
  };

  const handleRaceSettingsChange = (settings: { numRaces: number; dropRules: number[] | string }) => {
    console.log('Race settings changed in YachtRaceManager:', settings);
    setCurrentNumRaces(settings.numRaces);
    setCurrentDropRules(settings.dropRules);
    
    // Force a re-render of the table by updating the key or triggering a state change
    setLastUpdateTime(new Date());
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    
    // Immediately apply to DOM
    document.body.classList.toggle('dark', newDarkMode);
    document.documentElement.classList.toggle('dark', newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
  };

  const handleCompleteHeat = (heat: HeatDesignation) => {
    if (!heatManagement) return;

    // Pass the scoring system to completeHeat so it can use the right logic
    const updatedHeatManagement = completeHeat(heatManagement, heat, currentDropRules);

    // Convert all heat results to race results for display
    const convertedResults = convertHeatResultsToRaceResults(updatedHeatManagement, skippers);
    if (convertedResults.length > 0) {
      setRaceResults(convertedResults);

      // Update lastCompletedRace based on the CURRENT round if it just completed
      // This enables scoring in the current round's column
      const currentRoundData = updatedHeatManagement.rounds.find(r => r.round === updatedHeatManagement.currentRound);
      if (currentRoundData?.completed) {
        // Current round just completed - update lastCompletedRace to current round
        console.log('Round', updatedHeatManagement.currentRound, 'completed - updating lastCompletedRace');
        setLastCompletedRace(updatedHeatManagement.currentRound);

        // Check if next round exists
        const nextRoundNumber = updatedHeatManagement.currentRound + 1;
        const nextRoundExists = updatedHeatManagement.rounds.some(r => r.round === nextRoundNumber);

        if (nextRoundExists) {
          // Automatically advance to next round
          updatedHeatManagement.currentRound = nextRoundNumber;

          // Determine scoring system message
          const scoringSystem = updatedHeatManagement.configuration.scoringSystem || 'hms';
          const systemName = scoringSystem === 'shrs' ? 'SHRS' : 'HMS';

          addNotification('success', `Round ${nextRoundNumber - 1} complete! Advancing to Round ${nextRoundNumber} with ${systemName} heat assignments.`);
        } else {
          addNotification('success', `Round ${updatedHeatManagement.currentRound} complete! Final round finished.`);
        }
      } else {
        // Round not completed yet - set to highest completed round
        const completedRounds = updatedHeatManagement.rounds.filter(r => r.completed);
        const highestCompletedRound = completedRounds.length > 0
          ? Math.max(...completedRounds.map(r => r.round))
          : 0;
        setLastCompletedRace(highestCompletedRound);
      }
    }

    setHeatManagement(updatedHeatManagement);
  };

  const handleGoBackToPreviousRound = () => {
    if (!heatManagement || heatManagement.currentRound <= 1) return;

    // Check if current round has any scores - prevent going back if there are scores
    const currentRound = heatManagement.rounds[heatManagement.currentRound - 1];
    if (currentRound?.results && currentRound.results.length > 0) {
      addNotification('warning', 'Cannot go back to previous round. Current round has scores entered.');
      return;
    }

    // Go back to previous round
    const updatedHeatManagement = {
      ...heatManagement,
      currentRound: heatManagement.currentRound - 1
    };

    setHeatManagement(updatedHeatManagement);
    // Removed notification - heat operations should be silent
  };

  // Handler to complete current round and advance to next round atomically
  const handleAdvanceToNextRound = (currentHeat: HeatDesignation) => {
    if (!heatManagement) return;

    // First complete the current heat to generate next round assignments
    const updatedHeatManagement = completeHeat(heatManagement, currentHeat);

    // Find the newly created next round
    const nextRoundNumber = updatedHeatManagement.currentRound + 1;
    const nextRoundExists = updatedHeatManagement.rounds.some(r => r.round === nextRoundNumber);

    if (!nextRoundExists) {
      console.error('Next round was not created by completeHeat');
      // Removed notification - heat operations should be silent
      setHeatManagement(updatedHeatManagement);
      return;
    }

    // Now advance to the next round in the same state update
    updatedHeatManagement.currentRound = nextRoundNumber;

    // Update state with both changes at once
    setHeatManagement(updatedHeatManagement);

    // Convert all heat results to race results for display
    const convertedResults = convertHeatResultsToRaceResults(updatedHeatManagement, skippers);
    if (convertedResults.length > 0) {
      setRaceResults(convertedResults);
    }

    // Update lastCompletedRace to the previous round (now that we've advanced)
    setLastCompletedRace(nextRoundNumber - 1);

    addNotification('success', `Advanced to Round ${nextRoundNumber}! Heat assignments ready for scoring.`);
  };

  const handleGoToRound = (roundNumber: number) => {
    if (!heatManagement || roundNumber < 1) return;

    // Use functional state update to get the latest state
    // This is important because onCompleteHeat may have just been called
    setHeatManagement(prevHeatManagement => {
      if (!prevHeatManagement) return prevHeatManagement;

      // Check if the round exists in the LATEST state
      if (roundNumber > prevHeatManagement.rounds.length) {
        console.warn(`Cannot advance to round ${roundNumber} - only ${prevHeatManagement.rounds.length} rounds exist`);
        return prevHeatManagement;
      }

      // Jump to the specified round
      const updatedHeatManagement = {
        ...prevHeatManagement,
        currentRound: roundNumber
      };

      // When advancing to a new round, update lastCompletedRace to enable the column
      const previousRound = updatedHeatManagement.rounds.find(r => r.round === roundNumber - 1);
      if (previousRound?.completed) {
        setLastCompletedRace(roundNumber - 1);
      }

      // Removed notification - heat operations should be silent
      return updatedHeatManagement;
    });
  };

  const handleSelectHeat = (heat: HeatDesignation) => {
    if (!heatManagement) return;

    setHeatManagement({
      ...heatManagement,
      currentHeat: heat
    });
  };

  // Handler to update heat assignments for next round with manual overrides
  const handleUpdateHeatAssignments = (updatedAssignments: any[]) => {
    if (!heatManagement) return;

    // Find the next round to update
    const currentRoundNumber = heatManagement.currentRound;
    const nextRoundNumber = currentRoundNumber + 1;

    // Check if next round exists
    let nextRoundIndex = heatManagement.rounds.findIndex(r => r.round === nextRoundNumber);

    const updatedRounds = [...heatManagement.rounds];

    if (nextRoundIndex === -1) {
      // Next round doesn't exist yet - create it
      const newRound = {
        round: nextRoundNumber,
        heatAssignments: updatedAssignments,
        results: [],
        completed: false
      };
      updatedRounds.push(newRound);
      nextRoundIndex = updatedRounds.length - 1;
    } else {
      // Update existing round
      updatedRounds[nextRoundIndex] = {
        ...updatedRounds[nextRoundIndex],
        heatAssignments: updatedAssignments
      };
    }

    const updatedHeatManagement = {
      ...heatManagement,
      rounds: updatedRounds
    };

    setHeatManagement(updatedHeatManagement);
    // Removed notification - heat operations should be silent
  };

  const showHandicapOptions = !hasDeterminedInitialHcaps && !isManualHandicaps && 
    raceType === 'handicap' &&
    skippers.length > 0 &&
    skippers.every((_, index) => {
      const result = raceResults.find(r => r.race === 1 && r.skipperIndex === index);
      return result && (result.position !== null || result.letterScore);
    }) &&
    !skippers.some(s => s.startHcap > 0);

  // Get the current event to check if it's multi-day
  const currentEvent = getCurrentEvent();
  const isMultiDayEvent = currentEvent?.multiDay || false;
  const totalDays = currentEvent?.numberOfDays || 1;

  // Check if the first race has been scored
  const hasFirstRaceBeenScored = raceResults.some(r => r.race === 1);

  if (isRaceManagementOpen) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]' : 'bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50'}`}>
        {selectedEvent ? (
          <div className="w-full px-20 py-12">
            <button
              onClick={() => setSelectedEvent(null)}
              className={`mb-8 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                darkMode
                  ? 'text-slate-300 hover:text-slate-100 bg-slate-800/30 border border-slate-700/50 hover:bg-slate-700/40'
                  : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <X size={16} className="inline mr-1" />
              Back to Race Calendar
            </button>
            <EventDetails
              event={selectedEvent}
              darkMode={darkMode}
              onConfigureHeats={() => setShowRaceSettingsModal(true)}
              onClose={() => setSelectedEvent(null)}
              onViewVenue={(venueName) => setSelectedVenueName(venueName)}
            />

            {selectedVenueName && (
              <VenueDetails
                venueName={selectedVenueName}
                darkMode={darkMode}
                onClose={() => setSelectedVenueName(null)}
              />
            )}
          </div>
        ) : (
          <RaceManagement 
            darkMode={darkMode}
            onRaceTypeSelect={handleRaceTypeSelect}
            onEventSelect={handleEventSelect}
            onBack={() => setIsRaceManagementOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]' : 'bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50'}`}>
      <div className="w-full px-20 py-12">
        <div className="flex-1 flex flex-col justify-center min-h-[calc(100vh-24rem)]">
          {getCurrentEvent() && (
            <div className="mb-4">
              <RaceHeader 
                event={getCurrentEvent()!} 
                darkMode={darkMode} 
              />
              
            </div>
          )}

          {error && (
            <div className={`
              mb-4 p-4 rounded-lg text-sm
              ${darkMode 
                ? 'bg-red-900/10 text-red-400 border border-red-900/20' 
                : 'bg-red-50 text-red-600 border border-red-100'}
            `}>
              {error}
            </div>
          )}

          <div className="mt-6">
            {showHandicapOptions && (
              <div className="flex justify-center gap-4 mb-8">
                <button
                  onClick={determineInitialHandicaps}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm"
                >
                  Auto-Calculate Handicaps
                </button>
                <button
                  onClick={enableManualHandicaps}
                  className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm"
                >
                  Enter Manual Handicaps
                </button>
              </div>
            )}

            {/* Scoring Mode Toggle Button - Only show for non-heat races */}
            {!heatManagement?.configuration.enabled && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setScoringMode(scoringMode === 'pro' ? 'touch' : 'pro')}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                    ${darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'}
                  `}
                  title={scoringMode === 'pro' ? 'Switch to Touch Scoring' : 'Switch to Pro Scoring'}
                >
                  {scoringMode === 'pro' ? (
                    <>
                      <Hand size={18} className="text-blue-400" />
                      <span className="text-sm font-medium">Touch Mode</span>
                    </>
                  ) : (
                    <>
                      <Table2 size={18} className="text-blue-400" />
                      <span className="text-sm font-medium">Pro Mode</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Top Right Controls - Only for Touch Mode (Pro mode has its own in RaceTable) */}
            {scoringMode === 'touch' && (
              <div className="fixed top-4 right-[5.9375rem] z-30 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(true)}
                  className={`
                    flex items-center justify-center p-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                      : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
                  `}
                  title="Return to Dashboard"
                >
                  <Home size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowRaceSettingsModal(true)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                      : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
                  `}
                >
                  <Settings size={16} />
                  <span className="text-xs font-medium">Settings</span>
                </button>
                {lastCompletedRace >= 1 && (
                  <button
                    type="button"
                    onClick={() => setShowCompleteConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
                  >
                    <Trophy size={16} />
                    <span className="text-sm">Complete Scoring</span>
                  </button>
                )}
              </div>
            )}

            {/* Render appropriate table based on race type and heat configuration */}
            {heatManagement?.configuration.enabled ? (
              <HeatScoringTable
                skippers={skippers}
                heatManagement={heatManagement}
                darkMode={darkMode}
                onManageSkippers={() => setIsSkipperModalOpen(true)}
                onUpdateSkipper={(skipperIndex, updatedSkipper) => {
                  const newSkippers = [...skippers];
                  newSkippers[skipperIndex] = updatedSkipper;
                  handleUpdateSkippers(newSkippers, { skipRaceSettingsModal: true });
                }}
                onRemoveSkipper={(skipperIndex) => {
                  const newSkippers = skippers.filter((_, idx) => idx !== skipperIndex);
                  handleUpdateSkippers(newSkippers, { skipRaceSettingsModal: true });
                }}
                onUpdateHeatResult={handleUpdateHeatResult}
                onCompleteHeat={handleCompleteHeat}
                onReturnToRaceManagement={() => setShowExitConfirm(true)}
                onCompleteScoring={() => setShowCompleteConfirm(true)}
                onShowCharts={() => setShowChartsModal(true)}
                onConfigureHeats={() => setShowRaceSettingsModal(true)}
                onRaceSettingsChange={handleRaceSettingsChange}
                updateRaceResults={updateRaceResults}
                raceResults={raceResults}
                enableRaceEditing={enableRaceEditing}
                lastCompletedRace={lastCompletedRace}
                editingRace={editingRace}
                deleteRaceResult={deleteRaceResult}
                clearRace={clearRace}
                clearRaceForSkippers={clearRaceForSkippers}
                replaceRaceResultsForSkippers={replaceRaceResultsForSkippers}
                currentEvent={getCurrentEvent()}
                currentDay={currentDay}
                onToggleDarkMode={toggleDarkMode}
                onGoBackToPreviousRound={handleGoBackToPreviousRound}
                onGoToRound={handleGoToRound}
                onAdvanceToNextRound={handleAdvanceToNextRound}
                onClearHeatRaceResults={handleClearHeatRaceResults}
                onUpdateHeatAssignments={handleUpdateHeatAssignments}
                onSelectHeat={handleSelectHeat}
              />
            ) : scoringMode === 'touch' ? (
              <TouchModeScoring
                skippers={skippers}
                currentRace={touchModeCurrentRace}
                numRaces={currentNumRaces}
                raceResults={raceResults}
                dropRules={currentDropRules}
                updateRaceResults={(results: RaceResult[]) => {
                  // Batch update all results from touch mode scoring
                  // DO NOT update lastCompletedRace here - wait for user confirmation
                  console.log('📊 Touch mode: Updating race results (not marking as complete yet)');
                  setRaceResults(results);
                  autoSaveRaceResults(results);
                }}
                onConfirmResults={() => {
                  // User clicked "Confirm & Apply Results" - NOW mark the race as complete
                  console.log('✅ Touch mode: User confirmed results, marking race as complete');

                  // Check for race completion and update lastCompletedRace
                  let highestConsecutiveRace = 0;
                  for (let r = 1; r <= currentNumRaces; r++) {
                    const isComplete = skippers.every((skipper, index) => {
                      // Check if skipper has a result
                      const result = raceResults.find(res => res.race === r && res.skipperIndex === index);
                      if (result && (result.position !== null || result.letterScore)) {
                        return true;
                      }

                      // Check if skipper is withdrawn for this race
                      if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) {
                        return true;
                      }

                      return false;
                    });
                    if (isComplete) {
                      highestConsecutiveRace = r;
                    } else {
                      break;
                    }
                  }

                  if (highestConsecutiveRace > lastCompletedRace) {
                    console.log('Touch scoring: Setting last completed race to:', highestConsecutiveRace);
                    setLastCompletedRace(highestConsecutiveRace);
                    setEditingRace(null);

                    // Update current_day in database for livestream overlay sync
                    const updateCurrentDayInDB = async () => {
                      if (currentEvent?.id) {
                        try {
                          const nextRace = highestConsecutiveRace + 1;
                          console.log('📊 Touch mode: Updating current_day to next race:', nextRace);
                          const { data, error } = await supabase
                            .from('quick_races')
                            .update({ current_day: nextRace })
                            .eq('id', currentEvent.id)
                            .select();

                          if (error) {
                            console.error('❌ Error updating current_day:', error);
                          } else {
                            console.log('✅ Updated current_day to:', nextRace, data);
                          }
                        } catch (error) {
                          console.error('❌ Exception updating current_day:', error);
                        }
                      }
                    };
                    updateCurrentDayInDB();

                    // Auto-extend races if we've completed all current races
                    if (highestConsecutiveRace >= currentNumRaces) {
                      const newNumRaces = currentNumRaces + 1;
                      console.log(`Auto-extending races from ${currentNumRaces} to ${newNumRaces}`);
                      setCurrentNumRaces(newNumRaces);
                      // Don't auto-advance here - let the effect handle it
                    }

                    // Update handicaps for newly completed races if using handicap scoring
                    if (raceType === 'handicap') {
                      for (let r = lastCompletedRace + 1; r <= highestConsecutiveRace; r++) {
                        updateMemberHandicaps(r, raceResults);
                      }
                    }
                  }
                }}
                onRaceChange={(newRace) => {
                  setTouchModeCurrentRace(newRace);
                }}
                darkMode={darkMode}
                currentEvent={currentEvent}
              />
            ) : raceType === 'handicap' ? (
              <RaceTable
                skippers={skippers}
                numRaces={currentNumRaces}
                dropRules={currentDropRules}
                updateStartHcap={updateStartHcap}
                updateRaceResults={updateRaceResults}
                raceResults={raceResults}
                enableRaceEditing={enableRaceEditing}
                lastCompletedRace={lastCompletedRace}
                hasDeterminedInitialHcaps={hasDeterminedInitialHcaps}
                editingRace={editingRace}
                canEnterRace2={canEnterRace2()}
                deleteRaceResult={deleteRaceResult}
                clearRace={clearRace}
                darkMode={darkMode}
                isManualHandicaps={isManualHandicaps}
                onManageSkippers={() => setIsSkipperModalOpen(true)}
                onReturnToRaceManagement={() => setShowExitConfirm(true)}
                onCompleteScoring={() => setShowCompleteConfirm(true)}
                onShowCharts={() => setShowChartsModal(true)}
                currentEvent={getCurrentEvent()}
                currentDay={currentDay}
                onToggleDarkMode={toggleDarkMode}
                onRaceSettingsChange={handleRaceSettingsChange}
                onOpenRaceSettings={() => setShowRaceSettingsModal(true)}
                updateSkipper={updateSkipper}
              />
            ) : (
              <ScratchRaceTable
                skippers={skippers}
                numRaces={currentNumRaces}
                dropRules={currentDropRules}
                updateRaceResults={updateRaceResults}
                raceResults={raceResults}
                enableRaceEditing={enableRaceEditing}
                lastCompletedRace={lastCompletedRace}
                editingRace={editingRace}
                deleteRaceResult={deleteRaceResult}
                clearRace={clearRace}
                darkMode={darkMode}
                onManageSkippers={() => setIsSkipperModalOpen(true)}
                onShowCharts={() => setShowChartsModal(true)}
                onReturnToRaceManagement={() => setShowExitConfirm(true)}
                onCompleteScoring={() => setShowCompleteConfirm(true)}
                currentEvent={getCurrentEvent()}
                currentDay={currentDay}
                onToggleDarkMode={toggleDarkMode}
                onRaceSettingsChange={handleRaceSettingsChange}
                onOpenRaceSettings={() => setShowRaceSettingsModal(true)}
                onNewSession={startNewSession}
                updateSkipper={updateSkipper}
              />
            )}
          </div>
        </div>

        <SkipperModal
          isOpen={isSkipperModalOpen}
          onClose={() => setIsSkipperModalOpen(false)}
          skippers={skippers}
          onUpdateSkippers={handleUpdateSkippers}
          darkMode={darkMode}
          skipperHasResults={skipperHasResults}
          currentEvent={getCurrentEvent()}
        />
        
        <MembershipManager
          isOpen={isMembershipOpen}
          onClose={() => setIsMembershipOpen(false)}
          darkMode={darkMode}
        />
        
        <RaceSettingsModal
          isOpen={showRaceSettingsModal}
          onClose={() => setShowRaceSettingsModal(false)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          skippers={skippers}
          initialHeatManagement={heatManagement}
          initialNumRaces={currentNumRaces}
          initialDropRules={currentDropRules}
          currentEvent={getCurrentEvent()}
          onSaveSettings={async (settings) => {
            await handleSaveRaceSettings(settings);
            setShowRaceSettingsModal(false);
          }}
          onManageSkippers={() => {
            setShowRaceSettingsModal(false);
            setIsSkipperModalOpen(true);
          }}
          addNotification={addNotification}
          hasRaceResults={raceResults.length > 0}
          onClearAllRaceResults={async () => {
            const currentEvent = getCurrentEvent();

            // For multi-day events, show modal to choose scope
            if (currentEvent?.multiDay) {
              setShowClearResultsModal(true);
              return;
            }

            // For single-day events, clear immediately
            console.log('🗑️ Clearing all race results...');
            setRaceResults([]);
            setLastCompletedRace(0);

            // Restore original handicaps and clear withdrawal flags
            console.log('Restoring original handicaps and clearing withdrawals after clearing all results');
            const newSkippers = skippers.map((skipper, idx) => ({
              ...skipper,
              startHcap: originalHandicaps[idx] !== undefined ? originalHandicaps[idx] : skipper.startHcap,
              withdrawnFromRace: undefined // Clear withdrawal flag when clearing results
            }));
            setSkippers(newSkippers);

            // Reset handicap determination flags so seeding race logic will work again
            setHasDeterminedInitialHcaps(false);
            setIsManualHandicaps(false);

            // CRITICAL: Explicitly save cleared state to database
            if (currentEvent) {
              console.log('💾 Saving cleared race results to database...');
              try {
                await updateEventResults(
                  currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
                  [], // Empty race results
                  skippers,
                  0, // Reset lastCompletedRace
                  false, // Reset hasDeterminedInitialHcaps
                  false, // Reset isManualHandicaps
                  false, // not completed
                  currentDay,
                  heatManagement,
                  currentNumRaces,
                  currentDropRules as number[]
                );
                console.log('✅ Cleared race results saved to database');
              } catch (error) {
                console.error('❌ Error saving cleared results:', error);
              }
            }
          }}
          onScoringModeChange={(mode) => setScoringMode(mode)}
        />

        {showChartsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`
              w-full max-w-6xl rounded-xl shadow-xl overflow-hidden border
              ${darkMode ? 'bg-slate-800/95 border-slate-700/50 backdrop-blur-md' : 'bg-white'}
            `}>
              <div className={`
                flex items-center justify-between p-6 border-b
                ${darkMode ? 'border-slate-700' : 'border-slate-200'}
              `}>
                <div className="flex items-center gap-3">
                  <TrendingUp className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                    {heatManagement?.configuration.enabled ? 'Overall Results' : 'Performance Analysis'}
                  </h2>
                </div>
                <button
                  onClick={() => setShowChartsModal(false)}
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

              <div className="p-6">
                {raceType === 'handicap' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <PerformanceGraphs
                      skippers={skippers}
                      raceResults={raceResults}
                      darkMode={darkMode}
                      visible={true}
                    />
                  </div>
                ) : (
                  <ScratchPerformanceGraphs
                    skippers={skippers}
                    raceResults={raceResults}
                    darkMode={darkMode}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <ConfirmationModal
          isOpen={showExitConfirm}
          onClose={() => setShowExitConfirm(false)}
          onConfirm={handleReturnToRaceManagement}
          title="Return to Dashboard"
          message="Are you sure you want to leave the Event Scoring and return to the dashboard? Your progress will be saved and you can continue scoring at any time."
          confirmText="Return to Dashboard"
          cancelText="Stay"
          darkMode={darkMode}
        />

        <ConfirmationModal
          isOpen={showCompleteConfirm}
          onClose={() => setShowCompleteConfirm(false)}
          onConfirm={handleCompleteScoring}
          title={currentEvent?.multiDay ? `Complete Day ${currentDay} Scoring` : "Complete Scoring"}
          message={
            currentEvent?.multiDay
              ? currentEvent.numberOfDays && currentDay >= currentEvent.numberOfDays
                ? `Complete scoring for Day ${currentDay}? This is the final day - the entire event will be marked as complete.`
                : `Complete scoring for Day ${currentDay}? You can continue scoring the remaining days later.`
              : "Are you sure you want to publish results for this event? Once published, changes can no longer be made to this event's scoring."
          }
          confirmText={currentEvent?.multiDay && currentEvent.numberOfDays && currentDay < currentEvent.numberOfDays ? "Complete Day" : "Publish Results"}
          cancelText="Cancel"
          darkMode={darkMode}
        />

        {/* Multi-Day Clear Results Modal */}
        {showClearResultsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className={`
              w-full max-w-lg rounded-xl shadow-xl border
              ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
            `}>
              <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Clear Results - Multi-Day Event
                </h3>
                <p className={`mt-2 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  This is a multi-day event. Choose which results to clear:
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Clear Day {currentDay} Only
                  </h4>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    This will clear all results for Day {currentDay} only. Other days will remain unchanged.
                  </p>
                  <button
                    onClick={() => handleClearResults('day')}
                    className="mt-3 w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors"
                  >
                    Clear Day {currentDay}
                  </button>
                </div>

                <div className={`p-4 rounded-lg border-2 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Clear All Days
                  </h4>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    This will clear all results for the entire {currentEvent?.numDays || currentEvent?.numberOfDays}-day event. This action cannot be undone.
                  </p>
                  <button
                    onClick={() => handleClearResults('all')}
                    className="mt-3 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                  >
                    Clear All Days
                  </button>
                </div>
              </div>

              <div className={`p-4 border-t flex justify-end ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <button
                  onClick={() => setShowClearResultsModal(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    darkMode
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};