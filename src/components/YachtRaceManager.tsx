import React, { useState, useEffect, useRef, Component } from 'react';
import { Trophy, Calendar, CalendarRange, Flag, X, TrendingUp, ArrowUpDown, Settings, Users, Hand, Table2, Grid3x2 as Grid3X3, Maximize2, Minimize2, Timer, TriangleAlert as AlertTriangle } from 'lucide-react';
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
import { HeatManagement, HeatResult, HeatDesignation, generateNextRoundAssignments } from '../types/heat';
import { HeatScoringTable } from './HeatScoringTable';
import { updateHeatResult, completeHeat, convertHeatResultsToRaceResults, clearHeatRaceResults } from '../utils/heatUtils';
import { HMSConfig } from '../utils/hmsHeatSystem';
import { seedSHRSHeatsByIndex, generatePreSetQualifyingAssignments, addSkippersToSHRSAssignments } from '../utils/shrsHeatSystem';
import { SingleEventManagement } from './SingleEventManagement';
import { TouchModeScoring } from './TouchModeScoring';
import { SpreadsheetScoring } from './SpreadsheetScoring';
import { HmsManualSpreadsheet } from './HmsManualSpreadsheet';
import { calculateHandicaps } from '../utils/handicapCalculator';
import { calculateScratchResults } from '../utils/scratchCalculations';
import { RaceSettingsModal } from './RaceSettingsModal';
import { StartBoxModal } from './start-box/StartBoxModal';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../utils/supabase';
import { updateRaceStatus } from '../utils/liveTrackingStorage';
import { AskAlfieOrb } from './ask-alfie/AskAlfieOrb';
import { useScoringContext } from '../contexts/ScoringContext';
import type { ScoringSkipper, ScoringRaceResult, ScoringHeatInfo, ScoringStanding } from '../contexts/ScoringContext';

class ScoringErrorBoundary extends Component<
  { children: React.ReactNode; darkMode?: boolean; onRetry?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; darkMode?: boolean; onRetry?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ScoringErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className={`text-sm ${this.props.darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Scoring component encountered an error. Please try again.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry?.();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [showStartBoxModal, setShowStartBoxModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [showRaceSettingsModal, setShowRaceSettingsModal] = useState(false);
  const [autoEnableHeatRacing, setAutoEnableHeatRacing] = useState(false);
  const [showHeatRacingRecommendation, setShowHeatRacingRecommendation] = useState(false);
  const [heatManagement, setHeatManagement] = useState<HeatManagement | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [currentNumRaces, setCurrentNumRaces] = useState(12);
  const [currentDropRules, setCurrentDropRules] = useState<number[] | string>([4, 8, 16, 24, 32, 40]); // RRS - Appendix A default
  const [hasShownHeatNotification, setHasShownHeatNotification] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isDataFullyLoaded, setIsDataFullyLoaded] = useState(false);
  const [scoringMode, setScoringMode] = useState<'pro' | 'touch' | 'spreadsheet'>('pro');
  const [touchModeCurrentRace, setTouchModeCurrentRace] = useState<number>(1);
  const [isFullscreenScoring, setIsFullscreenScoring] = useState(false);
  const [showOverallResults, setShowOverallResults] = useState(false);
  const [eventUpdateTrigger, setEventUpdateTrigger] = useState(0);
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const isCalculatingHandicaps = useRef(false);
  const liveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { updateScoringContext, setScoringActive } = useScoringContext();

  // Sync live scoring state to ScoringContext for AskAlfie
  useEffect(() => {
    if (isRaceManagementOpen || !selectedEvent) {
      setScoringActive(false);
      return;
    }

    const scoringSystem = heatManagement?.configuration?.enabled
      ? (heatManagement.configuration.scoringSystem || 'hms')
      : 'standard';

    const scoringSkippers: ScoringSkipper[] = skippers.map((s, i) => ({
      index: i,
      name: s.name,
      sailNo: s.sailNo,
      club: s.club,
      boatModel: s.boatModel,
      startHcap: s.startHcap,
      currentHcap: raceResults.length > 0 ? s.startHcap : undefined,
      withdrawn: s.withdrawnFromRace != null,
    }));

    // Build race results with skipper names
    const scoringResults: ScoringRaceResult[] = raceResults.map(r => ({
      race: r.race,
      skipperIndex: r.skipperIndex,
      skipperName: skippers[r.skipperIndex]?.name || `Skipper ${r.skipperIndex}`,
      position: r.position,
      letterScore: r.letterScore,
      points: r.points,
      hcapBefore: r.startHcap,
      hcapAfter: r.adjustedHcap ?? r.startHcap,
      heatDesignation: r.hmsHeat || r.heatDesignation,
    }));

    // Build heat info
    let heatInfo: ScoringHeatInfo | null = null;
    if (heatManagement?.configuration?.enabled) {
      const currentRound = heatManagement.currentRound;
      const currentRoundData = heatManagement.rounds[currentRound - 1];
      const heatAssignments = currentRoundData?.heatAssignments?.map(ha => ({
        heat: ha.heatDesignation,
        skipperNames: ha.skipperIndices.map(i => skippers[i]?.name || `Skipper ${i}`),
      })) || [];

      const roundResults = heatManagement.rounds.map(r => ({
        round: r.round,
        completed: r.completed,
        heats: r.heatAssignments.map(ha => ha.heatDesignation),
      }));

      let lastPromotion: ScoringHeatInfo['lastPromotion'];
      if (heatManagement.lastPromotionInfo) {
        const lp = heatManagement.lastPromotionInfo;
        lastPromotion = {
          promoted: lp.promotedSkippers.map(i => skippers[i]?.name || `Skipper ${i}`),
          relegated: (lp.relegatedSkippers || []).map(i => skippers[i]?.name || `Skipper ${i}`),
          fromHeat: lp.fromHeat,
          toHeat: lp.toHeat,
        };
      }

      heatInfo = {
        scoringSystem: heatManagement.configuration.scoringSystem || 'hms',
        currentRound,
        totalRounds: heatManagement.rounds.length,
        currentHeat: heatManagement.currentHeat,
        numberOfHeats: heatManagement.configuration.numberOfHeats,
        promotionCount: heatManagement.configuration.promotionCount,
        heatAssignments,
        roundResults,
        lastPromotion,
      };
    }

    // Build standings from race results
    const isHeatScoring = scoringSystem === 'hms' || scoringSystem === 'shrs';
    const standings: ScoringStanding[] = [];
    if (lastCompletedRace > 0 && skippers.length > 0) {
      // Build heat assignment map per round for SHRS/HMS
      const roundHeatMap = new Map<number, Map<number, string>>();
      if (isHeatScoring && heatManagement?.rounds) {
        for (const round of heatManagement.rounds) {
          const skipperToHeat = new Map<number, string>();
          for (const ha of (round.heatAssignments || [])) {
            for (const idx of (ha.skipperIndices || [])) {
              skipperToHeat.set(idx, ha.heatDesignation);
            }
          }
          roundHeatMap.set(round.round, skipperToHeat);
        }
      }

      // Build fleet map from first finals round heat assignments (SHRS)
      const skipperFleetMap = new Map<number, string>();
      if (scoringSystem === 'shrs' && heatManagement?.rounds) {
        const qualRoundCount = heatManagement.configuration?.qualifyingRounds || 0;
        const finalsRounds = heatManagement.rounds.filter(r => r.round > qualRoundCount);
        if (finalsRounds.length > 0) {
          for (const ha of (finalsRounds[0].heatAssignments || [])) {
            for (const idx of (ha.skipperIndices || [])) {
              skipperFleetMap.set(idx, ha.heatDesignation);
            }
          }
        }
      }

      const skipperIndicesWithResults = new Set(
        raceResults.map(r => r.skipperIndex).filter(idx => idx != null)
      );

      const skipperPointsData: Record<number, { races: number[]; letterScores: (string | undefined)[]; heats: string[] }> = {};
      for (const i of skipperIndicesWithResults) {
        skipperPointsData[i] = { races: [], letterScores: [], heats: [] };
      }

      for (let race = 1; race <= lastCompletedRace; race++) {
        for (const i of skipperIndicesWithResults) {
          const result = raceResults.find(r => r.race === race && r.skipperIndex === i);
          // For SHRS/HMS, use position within heat as points; for standard, use points or position
          let pts: number;
          if (result) {
            if (result.letterScore && result.letterScore !== 'RDGfix') {
              pts = result.points ?? result.position ?? (skippers.length + 1);
            } else {
              pts = isHeatScoring
                ? (result.position ?? (skippers.length + 1))
                : (result.points ?? result.position ?? (skippers.length + 1));
            }
          } else {
            pts = skippers.length + 1;
          }
          skipperPointsData[i].races.push(pts);
          skipperPointsData[i].letterScores.push(result?.letterScore);
          const heatForRound = roundHeatMap.get(race)?.get(i);
          skipperPointsData[i].heats.push(heatForRound || '');
        }
      }

      // Determine drops
      const dropCount = Array.isArray(currentDropRules)
        ? currentDropRules.filter(d => lastCompletedRace >= d).length
        : 0;

      for (const [idx, data] of Object.entries(skipperPointsData)) {
        const sorted = [...data.races].map((pts, i) => ({ pts, race: i + 1 })).sort((a, b) => b.pts - a.pts);
        const droppedRaces = sorted.slice(0, dropCount).map(d => d.race);
        const netPoints = data.races.reduce((sum, pts, i) => droppedRaces.includes(i + 1) ? sum : sum + pts, 0);
        const totalPoints = data.races.reduce((sum, pts) => sum + pts, 0);
        const fleetDesignation = skipperFleetMap.get(Number(idx));
        const fleetNames: Record<string, string> = { 'A': 'Gold', 'B': 'Silver', 'C': 'Bronze', 'D': 'Copper', 'E': 'Fleet E' };

        standings.push({
          rank: 0,
          skipperName: skippers[Number(idx)]?.name || '',
          sailNo: skippers[Number(idx)]?.sailNo || '',
          totalPoints,
          netPoints,
          racePoints: data.races,
          droppedRaces,
          fleet: fleetDesignation ? (fleetNames[fleetDesignation] || fleetDesignation) : undefined,
          heatPerRace: isHeatScoring ? data.heats : undefined,
          letterScores: data.letterScores.some(ls => ls) ? data.letterScores : undefined,
        });
      }

      standings.sort((a, b) => a.netPoints - b.netPoints);
      standings.forEach((s, i) => { s.rank = i + 1; });
    }

    updateScoringContext({
      isActive: true,
      raceType,
      scoringSystem,
      eventName: selectedEvent.eventName || selectedEvent.clubName || null,
      clubName: selectedEvent.clubName || null,
      boatClass: selectedEvent.raceClass || null,
      currentDay,
      currentRace: touchModeCurrentRace,
      totalRaces: currentNumRaces,
      lastCompletedRace,
      dropRules: currentDropRules,
      skippers: scoringSkippers,
      raceResults: scoringResults.slice(-100),
      heatInfo,
      standings: standings.slice(0, 50),
    });

    return () => setScoringActive(false);
  }, [
    selectedEvent, isRaceManagementOpen, skippers, raceResults, lastCompletedRace,
    raceType, heatManagement, currentDay, touchModeCurrentRace, currentNumRaces,
    currentDropRules,
  ]);

  // Load user's scoring mode preference (simulated events default to touch)
  useEffect(() => {
    const loadScoringModePreference = async () => {
      const currentEvent = getCurrentEvent();
      if (currentEvent?.is_simulated) {
        setScoringMode('touch');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('scoring_mode_preference')
          .eq('id', user.id)
          .single();

        if (profileData?.scoring_mode_preference) {
          setScoringMode(profileData.scoring_mode_preference as 'pro' | 'touch' | 'spreadsheet');
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
      const currentEvent = getCurrentEvent();
      if (currentEvent?.id && currentEvent?.enableLiveTracking) {
        updateRaceStatus(currentEvent.id, 'on_hold', undefined, currentEvent.clubId).catch(() => {});
      }
    };
  }, []);

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

      if (currentEvent.is_simulated) {
        setScoringMode('touch');
      }

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

      const eventSkipperCount = currentEvent.skippers?.length || 0;

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

          if (currentDayData.heatManagement && currentDayData.heatManagement.configuration.enabled) {
            const isSpreadsheetMode = currentDayData.heatManagement.configuration.fleetManagementEnabled === false;
            const storedSkipperCount = currentDayData.heatManagement.rounds[0]?.heatAssignments
              ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

            if (isSpreadsheetMode || storedSkipperCount === eventSkipperCount) {
              setHeatManagement(currentDayData.heatManagement);

              if (currentDayData.heatManagement.configuration.scoringSystem) {
                setCurrentDropRules(currentDayData.heatManagement.configuration.scoringSystem);
              }
            } else {
              console.warn(`Heat management cached for ${storedSkipperCount} skippers but event has ${eventSkipperCount} skippers. Clearing cached assignments.`);
              setHeatManagement(null);
            }
          } else {
            setHeatManagement(null);
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
              const isSpreadsheetMode = day1Data.heatManagement.configuration.fleetManagementEnabled === false;
              const storedSkipperCount = day1Data.heatManagement.rounds[0]?.heatAssignments
                ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

              if (isSpreadsheetMode || storedSkipperCount === eventSkipperCount) {
                setHeatManagement(day1Data.heatManagement);

                if (day1Data.heatManagement.configuration.scoringSystem) {
                  setCurrentDropRules(day1Data.heatManagement.configuration.scoringSystem);
                }
              } else {
                console.warn(`Day 1 heat management cached for ${storedSkipperCount} skippers but event has ${eventSkipperCount} skippers. Clearing cached assignments.`);
                setHeatManagement(null);
              }
            } else {
              setHeatManagement(null);
            }

            // Load drop rules from day 1 data if not from heat management
            if (day1Data.dropRules && !day1Data.heatManagement?.configuration.enabled) {
              setCurrentDropRules(day1Data.dropRules);
            }
          } else {
            setHeatManagement(null);
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
        if (!currentEvent.isManualHandicaps && !currentEvent.hasDeterminedInitialHcaps &&
            currentEvent.skippers?.some((s: any) => s.startHcap > 0)) {
          setIsManualHandicaps(true);
          setHasDeterminedInitialHcaps(true);
        }
        if (currentEvent.heatManagement && currentEvent.heatManagement.configuration.enabled) {
          const isSpreadsheetMode = currentEvent.heatManagement.configuration.fleetManagementEnabled === false;
          const storedSkipperCount = currentEvent.heatManagement.rounds[0]?.heatAssignments
            ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

          if (isSpreadsheetMode || storedSkipperCount === eventSkipperCount) {
            let loadedHM = currentEvent.heatManagement;

            if (loadedHM.configuration.scoringSystem === 'shrs') {
              const hasResults = loadedHM.rounds.some(r => r.results && r.results.length > 0);
              if (!hasResults) {
                const r1Sizes = loadedHM.rounds[0]?.heatAssignments?.map(h => h.skipperIndices.length) || [];
                const maxS = Math.max(...r1Sizes);
                const minS = Math.min(...r1Sizes);
                const unbalancedR1 = r1Sizes.length > 0 && maxS - minS > 1;

                let inconsistentAcrossRounds = false;
                if (loadedHM.rounds.length > 1) {
                  for (let ri = 1; ri < loadedHM.rounds.length; ri++) {
                    const rSizes = loadedHM.rounds[ri]?.heatAssignments?.map(h => h.skipperIndices.length) || [];
                    if (rSizes.length === r1Sizes.length && rSizes.some((s, i) => s !== r1Sizes[i])) {
                      inconsistentAcrossRounds = true;
                      break;
                    }
                  }
                }

                if (unbalancedR1 || inconsistentAcrossRounds) {
                  console.log('Auto-correcting SHRS heats:', unbalancedR1 ? 'unbalanced R1' : 'inconsistent across rounds');
                  const numHeats = loadedHM.configuration.numberOfHeats;
                  const qRounds = loadedHM.configuration.shrsQualifyingRounds || 1;
                  const eventSkippers = currentEvent.skippers || [];
                  const newAssignments = seedSHRSHeatsByIndex(eventSkippers, numHeats);

                  let newRounds;
                  const isPreset = loadedHM.configuration.shrsAssignmentMode === 'preset';
                  if (isPreset && qRounds > 1) {
                    const allQR = generatePreSetQualifyingAssignments(newAssignments, numHeats, qRounds);
                    newRounds = allQR.map((ra, idx) => ({
                      round: idx + 1,
                      heatAssignments: ra.map(a => ({ heatDesignation: a.heatDesignation as any, skipperIndices: a.skipperIndices })),
                      results: [] as any[],
                      completed: false
                    }));
                  } else {
                    newRounds = [{ round: 1, heatAssignments: newAssignments.map(a => ({ heatDesignation: a.heatDesignation as any, skipperIndices: a.skipperIndices })), results: [] as any[], completed: false }];
                  }

                  loadedHM = { ...loadedHM, rounds: newRounds };
                  console.log('Corrected SHRS heats:', newAssignments.map(a => a.skipperIndices.length).join(', '));

                  const eventId = currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id;
                  if (eventId) {
                    supabase.from('quick_races').update({ heat_management: loadedHM }).eq('id', eventId).then(() => {
                      console.log('Saved corrected SHRS heat assignments to database');
                    });
                  }
                }
              }
            }

            setHeatManagement(loadedHM);

            if (loadedHM.configuration.scoringSystem) {
              setCurrentDropRules(loadedHM.configuration.scoringSystem);
            }
          } else {
            console.warn(`Heat management cached for ${storedSkipperCount} skippers but event has ${eventSkipperCount} skippers. Clearing cached assignments.`);
            setHeatManagement(null);
          }
        } else {
          setHeatManagement(null);
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
      setSelectedEvent(currentEvent);
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
  }, [raceResults, skippers, capLimit, lastPlaceBonus, raceType, heatManagement]);

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
    const uniqueSkippers = [];
    const nameSet = new Set();
    const sailNoSet = new Set<string>();

    for (const skipper of newSkippers) {
      if (nameSet.has(skipper.name) || sailNoSet.has(skipper.sailNo)) {
        continue;
      }
      nameSet.add(skipper.name);
      sailNoSet.add(skipper.sailNo);
      uniqueSkippers.push(skipper);
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

    if (
      newlyAddedSkippers.length > 0 &&
      uniqueSkippers.length >= 20 &&
      !heatManagement?.configuration.enabled &&
      !options?.skipRaceSettingsModal
    ) {
      setShowHeatRacingRecommendation(true);
      return;
    }

    if (heatManagement?.configuration.enabled && !options?.skipRaceSettingsModal) {
      if (uniqueSkippers.length < skippers.length) {
        // Skippers removed - clear heat management, force reconfigure
        setHeatManagement(null);
        setShowRaceSettingsModal(true);
        addNotification('info', 'Skippers removed. Heat Racing assignments cleared. Please reconfigure in Race Settings.');
      } else if (
        newlyAddedSkippers.length > 0 &&
        heatManagement.configuration.scoringSystem === 'shrs' &&
        heatManagement.configuration.shrsAssignmentMode === 'preset' &&
        heatManagement.rounds.some(r => r.completed || (r.results && r.results.length > 0))
      ) {
        // SHRS-PA mid-event addition: slot new skippers into future rounds
        const updatedRounds = addSkippersToSHRSAssignments(
          heatManagement.rounds,
          newlyAddedSkippers,
          heatManagement.configuration.numberOfHeats
        );
        const updatedHM = { ...heatManagement, rounds: updatedRounds };
        setHeatManagement(updatedHM);

        // Also add DNC results for completed heat rounds
        const updatedResults = [...raceResults];
        for (const round of updatedRounds) {
          if (!round.completed && !(round.results && round.results.length > 0)) continue;
          for (const skipperIdx of newlyAddedSkippers) {
            for (const heat of round.heatAssignments) {
              const hasResult = round.results?.some(
                r => r.skipperIndex === skipperIdx && r.round === round.round && r.heatDesignation === heat.heatDesignation
              );
              if (!hasResult) {
                updatedResults.push({
                  race: round.round,
                  round: round.round,
                  skipperIndex: skipperIdx,
                  position: null,
                  letterScore: 'DNC' as LetterScore,
                  heatDesignation: heat.heatDesignation,
                  points: uniqueSkippers.length + 1
                });
              }
            }
          }
        }
        setRaceResults(updatedResults);

        // Save updated heat management to database
        const currentEvt = getCurrentEvent();
        if (currentEvt) {
          try {
            await updateEventResults(
              currentEvt.id, updatedResults, uniqueSkippers,
              lastCompletedRace, hasDeterminedInitialHcaps, isManualHandicaps,
              false, currentDay, updatedHM, currentNumRaces, currentDropRules
            );
          } catch (e) {
            console.error('Error saving mid-event skipper addition:', e);
          }
        }

        addNotification('success', `${newlyAddedSkippers.length} skipper${newlyAddedSkippers.length > 1 ? 's' : ''} added to future qualifying rounds. Missed rounds scored as DNC.`);
      } else {
        // Other heat modes or no scoring started yet - open settings to reconfigure
        setShowRaceSettingsModal(true);
      }
    } else if (newlyAddedSkippers.length === 0 && uniqueSkippers.length < skippers.length) {
      // Only clear results if skippers were removed and no new ones added
      setRaceResults([]);
      setLastCompletedRace(0);
      setHasDeterminedInitialHcaps(false);
      setIsManualHandicaps(false);
      setLastUpdateTime(null);
      setEditingRace(null);

      // Also clear heat management if it exists
      if (heatManagement?.configuration.enabled) {
        setHeatManagement(null);
        addNotification('info', 'Skippers removed. Heat Racing assignments cleared.');
      }
    }
  };

  const updateMemberHandicaps = async (race: number, results: any[]) => {
    try {
      const handicapUpdates = skippers
        .map((skipper, index) => {
          const result = results.find(r => r.race === race && r.skipperIndex === index);
          if (result && result.adjustedHcap !== undefined && skipper.boatId) {
            return {
              boatId: skipper.boatId,
              memberId: skipper.memberId,
              handicap: result.adjustedHcap
            };
          }
          return null;
        })
        .filter((update): update is { boatId: string; memberId?: string; handicap: number } => update !== null);

      for (const update of handicapUpdates) {
        const { error } = await supabase
          .from('member_boats')
          .update({ handicap: update.handicap })
          .eq('id', update.boatId);

        if (error) {
          console.error(`Error updating handicap for boat ${update.boatId}:`, error);
          continue;
        }

        if (update.memberId) {
          const { data: thisBoat } = await supabase
            .from('member_boats')
            .select('boat_type, member_id')
            .eq('id', update.boatId)
            .maybeSingle();

          if (thisBoat?.boat_type) {
            await supabase
              .from('member_boats')
              .update({ handicap: update.handicap })
              .eq('member_id', thisBoat.member_id)
              .eq('boat_type', thisBoat.boat_type)
              .neq('id', update.boatId);
          }
        }
      }
    } catch (error) {
      console.error('Error updating boat handicaps:', error);
    }
  };

  const updateRaceResults = (race: number, skipperIndex: number, position: number | null, letterScore?: LetterScore, customPoints?: number, hmsHeat?: string, hmsPosition?: number) => {
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
        if (currentEvent?.id && currentEvent?.enableLiveTracking && (position !== null || letterScore)) {
          const { getRaceStatus } = await import('../utils/liveTrackingStorage');
          const statusData = await getRaceStatus(currentEvent.id);
          if (!statusData || (statusData.status !== 'live' && statusData.status !== 'event_complete')) {
            await updateRaceStatus(currentEvent.id, 'live', undefined, currentEvent.clubId);
          }
        }
      } catch (error) {
        console.error('❌ Error auto-updating race status:', error);
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
    const resultIndex = hmsHeat !== undefined
      ? newResults.findIndex(
          r => r.race === race && r.skipperIndex === skipperIndex && r.hmsHeat === hmsHeat
        )
      : newResults.findIndex(
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

    const skipperSailNo = (() => {
      const s = skippers[skipperIndex];
      return s ? String(s.sailNumber || s.sailNo || s.boat_sail_number || '').trim() : '';
    })();

    if (resultIndex >= 0) {
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        position,
        letterScore,
        customPoints,
        handicap: currentHandicap,
        adjustedHcap: currentHandicap,
        ...(hmsHeat !== undefined && { hmsHeat }),
        ...(hmsPosition !== undefined && { hmsPosition }),
        ...(hmsHeat !== undefined && skipperSailNo && { hmsSailNumber: skipperSailNo }),
      };
    } else {
      newResults.push({
        race,
        skipperIndex,
        position,
        letterScore,
        customPoints,
        handicap: currentHandicap,
        adjustedHcap: currentHandicap,
        ...(hmsHeat !== undefined && { hmsHeat }),
        ...(hmsPosition !== undefined && { hmsPosition }),
        ...(hmsHeat !== undefined && skipperSailNo && { hmsSailNumber: skipperSailNo }),
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
      const hasPresetHandicaps = skippers.some(s => s.startHcap > 0);
      if (!isManualHandicaps && !hasDeterminedInitialHcaps && !hasPresetHandicaps) {
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
      } else if (hasPresetHandicaps && !isManualHandicaps) {
        setIsManualHandicaps(true);
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

      if (raceType === 'handicap') {
        updateMemberHandicaps(race, newResults);
      }

      console.log('Setting new race results:', newResults);
      setRaceResults(newResults);

      autoSaveRaceResults(newResults, highestConsecutiveRace);

      (async () => {
        try {
          const evt = getCurrentEvent();
          if (evt?.id) {
            const actualId = evt.isSeriesEvent ? evt.seriesId : evt.id;
            const clubId = localStorage.getItem('currentClubId');
            await supabase
              .from('quick_races')
              .update({
                race_results: newResults,
                last_completed_race: highestConsecutiveRace,
                skippers: skippers,
                current_day: highestConsecutiveRace + 1
              })
              .eq('id', actualId)
              .eq('club_id', clubId);
          }
        } catch (e) {
          console.error('❌ Direct DB sync error:', e);
        }
      })();
    } else {
      setRaceResults(newResults);
    }
  };

  // Auto-save race results to database for live tracking
  const autoSaveRaceResults = async (results: any[], lastCompletedRaceOverride?: number) => {
    try {
      const currentEvent = getCurrentEvent();
      if (!currentEvent || !currentEvent.id) {
        console.log('⚠️ No current event, skipping auto-save');
        return;
      }

      const effectiveLastCompletedRace = lastCompletedRaceOverride !== undefined ? lastCompletedRaceOverride : lastCompletedRace;

      await updateEventResults(
        currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
        results,
        skippers,
        effectiveLastCompletedRace,
        hasDeterminedInitialHcaps,
        isManualHandicaps,
        false,
        currentDay,
        heatManagement,
        currentNumRaces,
        currentDropRules,
        currentEvent.multiDay ? currentEvent.dayResults : undefined
      );

      console.log('✅ Auto-saved race results to database, last_completed_race:', effectiveLastCompletedRace);
    } catch (error) {
      console.error('❌ Error auto-saving race results:', error);
    }
  };

  const deleteRaceResult = (race: number, skipperIndex: number) => {
    console.log('Deleting race result:', { race, skipperIndex });

    const newResults = raceResults.filter(
      r => !(r.race === race && r.skipperIndex === skipperIndex)
    );
    
    const remainingRace1Results = newResults.filter(r => r.race === 1);
    
    const hasPresetHandicapsOnDelete = originalHandicaps && Object.keys(originalHandicaps).length > 0;
    if (race === 1 && !isManualHandicaps && !hasPresetHandicapsOnDelete && raceType === 'handicap') {
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

    const raceEntries = newResults.filter(r => r.race === race);
    if (raceEntries.length === 0 && race === lastCompletedRace) {
      const prevRace = Math.max(...newResults.map(r => r.race), 0);
      console.log('Setting last completed race to previous race:', prevRace);
      setLastCompletedRace(prevRace);

      if (race === 1 && !isManualHandicaps && !hasPresetHandicapsOnDelete && raceType === 'handicap') {
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
      if (currentEvent?.id && currentEvent?.enableLiveTracking) {
        await updateRaceStatus(currentEvent.id, 'on_hold', undefined, currentEvent.clubId);
      }
    } catch (error) {
      console.error('❌ Error updating race status:', error);
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
          setCurrentEvent(currentEvent);
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
      if (currentEvent?.id && currentEvent?.enableLiveTracking) {
        let newStatus: 'completed_for_day' | 'event_complete';

        if (currentEvent.multiDay) {
          const totalDays = currentEvent.numberOfDays || 1;
          const isLastDay = currentDay >= totalDays;
          newStatus = isLastDay ? 'event_complete' : 'completed_for_day';
        } else {
          newStatus = 'event_complete';
        }

        const statusNote = newStatus === 'completed_for_day'
          ? `Day ${currentDay} complete`
          : 'Event complete';

        await updateRaceStatus(currentEvent.id, newStatus, statusNote, currentEvent.clubId, currentDay);
      }
    } catch (error) {
      console.error('❌ Error updating race status:', error);
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
          
          // Load heat management data if available and valid
          if (dayData.heatManagement && dayData.heatManagement.configuration.enabled) {
            const storedSkipperCount = dayData.heatManagement.rounds[0]?.heatAssignments
              ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

            if (storedSkipperCount === skippers.length) {
              setHeatManagement(dayData.heatManagement);
            } else {
              console.warn(`⚠️ Day ${targetDay} heat management cached for ${storedSkipperCount} skippers but event has ${skippers.length} skippers. Clearing cached assignments.`);
              setHeatManagement(null);
            }
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
          if (!selectedEvent.isManualHandicaps && !selectedEvent.hasDeterminedInitialHcaps &&
              skippers.some(s => s.startHcap > 0)) {
            setIsManualHandicaps(true);
            setHasDeterminedInitialHcaps(true);
          }
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
        if (!selectedEvent.isManualHandicaps && !selectedEvent.hasDeterminedInitialHcaps &&
            selectedEvent.skippers?.some((s: any) => s.startHcap > 0)) {
          setIsManualHandicaps(true);
          setHasDeterminedInitialHcaps(true);
        }

        if (selectedEvent.heatManagement && selectedEvent.heatManagement.configuration.enabled) {
          const storedSkipperCount = selectedEvent.heatManagement.rounds[0]?.heatAssignments
            ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

          if (storedSkipperCount === skippers.length) {
            setHeatManagement(selectedEvent.heatManagement);
          } else {
            console.warn(`⚠️ Event heat management cached for ${storedSkipperCount} skippers but event has ${skippers.length} skippers. Clearing cached assignments.`);
            setHeatManagement(null);
          }
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
        
        // Load heat management data if available and valid
        if (currentEvent.dayResults[day].heatManagement && currentEvent.dayResults[day].heatManagement.configuration.enabled) {
          const storedSkipperCount = currentEvent.dayResults[day].heatManagement.rounds[0]?.heatAssignments
            ?.reduce((sum, heat) => sum + heat.skipperIndices.length, 0) || 0;

          if (storedSkipperCount === skippers.length) {
            setHeatManagement(currentEvent.dayResults[day].heatManagement);
          } else {
            console.warn(`⚠️ Day ${day} heat management cached for ${storedSkipperCount} skippers but event has ${skippers.length} skippers. Clearing cached assignments.`);
            setHeatManagement(null);
          }
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
    setHeatManagement(prevHM => {
      if (!prevHM) return prevHM;
      return updateHeatResult(prevHM, result);
    });
  };

  const handleBatchUpdateHeatResults = (results: HeatResult[]) => {
    if (results.length === 0) return;
    setHeatManagement(prevHM => {
      if (!prevHM) return prevHM;
      let updated = prevHM;
      for (const result of results) {
        updated = updateHeatResult(updated, result);
      }
      return updated;
    });
  };

  const handleClearHeatRaceResults = (heatDesignation: HeatDesignation, round: number, race: number, skipperIndices: number[]) => {
    setHeatManagement(prevHM => {
      if (!prevHM) return prevHM;
      const updated = clearHeatRaceResults(prevHM, heatDesignation, round, race, skipperIndices);
      console.log('Heat race results cleared for heat', heatDesignation, 'round', round, 'race', race);
      return updated;
    });
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
      enable_roll_call?: boolean;
      auto_complete_sail?: boolean;
    };
  }) => {
    console.log('💾 Saving race settings in YachtRaceManager:', JSON.stringify(settings.heatManagement, null, 2));

    let finalHM = settings.heatManagement;
    if (finalHM && finalHM.configuration.scoringSystem === 'shrs') {
      const qRounds = finalHM.configuration.shrsQualifyingRounds || 1;
      const isPreset = finalHM.configuration.shrsAssignmentMode === 'preset';
      if (isPreset && qRounds > 1 && finalHM.rounds.length < qRounds) {
        console.log('⚠️ SHRS safety net (balanced): rounds.length', finalHM.rounds.length, 'but need', qRounds, '- regenerating');
        const firstRoundAssignments = finalHM.rounds[0]?.heatAssignments || [];
        const numHeats = finalHM.configuration.numberOfHeats;
        const allQR = generatePreSetQualifyingAssignments(
          firstRoundAssignments.map(a => ({ heatDesignation: a.heatDesignation as string, skipperIndices: [...a.skipperIndices] })),
          numHeats,
          qRounds
        );
        finalHM = {
          ...finalHM,
          rounds: allQR.map((ra, idx) => ({
            round: idx + 1,
            heatAssignments: ra.map(a => ({ heatDesignation: a.heatDesignation as any, skipperIndices: a.skipperIndices })),
            results: [] as any[],
            completed: false
          }))
        };
      } else if (!isPreset && finalHM.rounds.length > 1) {
        console.log('⚠️ SHRS safety net (progressive): trimming to round 1 only');
        finalHM = {
          ...finalHM,
          rounds: [finalHM.rounds[0]]
        };
      }
    }

    setCurrentNumRaces(settings.numRaces);
    setCurrentDropRules(settings.dropRules);
    setHeatManagement(finalHM);

    console.log('💾 Heat management state updated');

    const currentEvent = getCurrentEvent();
    if (currentEvent) {
      if (settings.observerSettings) {
        currentEvent.enable_observers = settings.observerSettings.enable_observers;
        currentEvent.observers_per_heat = settings.observerSettings.observers_per_heat;
        currentEvent.enable_roll_call = settings.observerSettings.enable_roll_call;
        currentEvent.auto_complete_sail = settings.observerSettings.auto_complete_sail;
      }
      if (settings.displaySettings) {
        currentEvent.show_flag = settings.displaySettings.show_flag;
        currentEvent.show_country = settings.displaySettings.show_country;
      }
      setCurrentEvent(currentEvent);

      console.log('💾 Explicitly saving heat management to database...');
      try {
        await updateEventResults(
          currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id,
          raceResults,
          skippers,
          lastCompletedRace,
          hasDeterminedInitialHcaps,
          isManualHandicaps,
          false,
          currentDay,
          finalHM,
          settings.numRaces,
          settings.dropRules as number[]
        );
        console.log('✅ Heat management saved to database successfully');

        const freshEvent = getCurrentEvent() || currentEvent;

        if ((settings.displaySettings || settings.observerSettings) && freshEvent.id) {
          const updateData: any = {};

          if (settings.displaySettings) {
            updateData.show_flag = settings.displaySettings.show_flag;
            updateData.show_country = settings.displaySettings.show_country;
          }

          if (settings.observerSettings) {
            updateData.enable_observers = settings.observerSettings.enable_observers;
            updateData.observers_per_heat = settings.observerSettings.observers_per_heat;
            updateData.enable_roll_call = settings.observerSettings.enable_roll_call;
            updateData.auto_complete_sail = settings.observerSettings.auto_complete_sail;
            console.log('💾 Saving observer settings:', settings.observerSettings);
          }

          console.log('💾 Final update data to save:', updateData);

          let saveError = null;
          if (freshEvent.isSeriesEvent && freshEvent.seriesId) {
            let roundId = freshEvent.seriesRoundId;
            if (!roundId && freshEvent.roundName) {
              const { data: roundRow } = await supabase
                .from('race_series_rounds')
                .select('id')
                .eq('series_id', freshEvent.seriesId)
                .eq('round_name', freshEvent.roundName)
                .maybeSingle();
              roundId = roundRow?.id;
              if (roundId) {
                freshEvent.seriesRoundId = roundId;
                setCurrentEvent(freshEvent);
              }
            }
            if (roundId) {
              const { error } = await supabase
                .from('race_series_rounds')
                .update(updateData)
                .eq('id', roundId);
              saveError = error;

              if (!saveError && settings.observerSettings && freshEvent.seriesId) {
                const observerData: any = {
                  enable_observers: settings.observerSettings.enable_observers,
                  observers_per_heat: settings.observerSettings.observers_per_heat,
                  enable_roll_call: settings.observerSettings.enable_roll_call,
                  auto_complete_sail: settings.observerSettings.auto_complete_sail
                };
                await supabase
                  .from('race_series_rounds')
                  .update(observerData)
                  .eq('series_id', freshEvent.seriesId)
                  .neq('id', roundId);
              }
            } else {
              console.error('Could not find series round ID for observer settings save');
            }
          } else {
            const { error } = await supabase
              .from('quick_races')
              .update(updateData)
              .eq('id', freshEvent.id);
            saveError = error;
          }

          if (saveError) {
            console.error('❌ Error saving display/observer settings:', saveError);
          } else {
            console.log('✅ Display/Observer settings saved successfully to database');
            const updatedEvent = {
              ...freshEvent,
              ...(settings.displaySettings && {
                show_flag: settings.displaySettings.show_flag,
                show_country: settings.displaySettings.show_country
              }),
              ...(settings.observerSettings && {
                enable_observers: settings.observerSettings.enable_observers,
                observers_per_heat: settings.observerSettings.observers_per_heat,
                enable_roll_call: settings.observerSettings.enable_roll_call,
                auto_complete_sail: settings.observerSettings.auto_complete_sail
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
                  observers_per_heat: settings.observerSettings.observers_per_heat,
                  enable_roll_call: settings.observerSettings.enable_roll_call,
                  auto_complete_sail: settings.observerSettings.auto_complete_sail
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
    console.log(`handleCompleteHeat called for heat ${heat}`);
    setHeatManagement(prevHM => {
      if (!prevHM) return prevHM;
      console.log(`handleCompleteHeat updater: prevHM round=${prevHM.currentRound}, total results in current round=${prevHM.rounds.find(r => r.round === prevHM.currentRound)?.results.length}`);

      const updatedHeatManagement = completeHeat(prevHM, heat, currentDropRules);
      console.log(`handleCompleteHeat: after completeHeat, roundJustCompleted=${updatedHeatManagement.roundJustCompleted}, currentRound completed=${updatedHeatManagement.rounds.find(r => r.round === updatedHeatManagement.currentRound)?.completed}`);

      const convertedResults = convertHeatResultsToRaceResults(updatedHeatManagement, skippers);
      if (convertedResults.length > 0) {
        const completedRoundNumbers = new Set(
          updatedHeatManagement.rounds.filter(r => r.completed).map(r => r.round)
        );
        setRaceResults(prevResults => {
          const inProgressResults = prevResults.filter(r => !completedRoundNumbers.has(r.race));
          return [...convertedResults, ...inProgressResults];
        });

        const currentRoundData = updatedHeatManagement.rounds.find(r => r.round === updatedHeatManagement.currentRound);
        if (currentRoundData?.completed) {
          console.log('Round', updatedHeatManagement.currentRound, 'completed - updating lastCompletedRace');
          setLastCompletedRace(updatedHeatManagement.currentRound);

          const currentEvent = getCurrentEvent();
          if (currentEvent?.id && currentEvent?.enableLiveTracking) {
            const completedRound = updatedHeatManagement.currentRound;
            updateRaceStatus(
              currentEvent.id,
              'on_hold',
              `Qualifying Rd ${completedRound} complete`,
              currentEvent.clubId,
              completedRound
            ).catch(() => {});
          }
        } else {
          const completedRounds = updatedHeatManagement.rounds.filter(r => r.completed);
          const highestCompletedRound = completedRounds.length > 0
            ? Math.max(...completedRounds.map(r => r.round))
            : 0;
          setLastCompletedRace(highestCompletedRound);
        }
      }

      return updatedHeatManagement;
    });
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

  const handleAdvanceToNextRound = (heatOrRound: HeatDesignation | number) => {
    setHeatManagement(prevHM => {
      if (!prevHM) return prevHM;

      let updatedHM = prevHM;

      const isHeatDesignation = typeof heatOrRound === 'string' && ['A', 'B', 'C', 'D', 'E', 'F'].includes(heatOrRound);

      if (isHeatDesignation) {
        updatedHM = completeHeat(prevHM, heatOrRound as HeatDesignation, currentDropRules);
      }

      const currentRoundData = updatedHM.rounds.find(r => r.round === updatedHM.currentRound);
      const isCurrentRoundComplete = currentRoundData?.completed;

      let targetRoundNumber: number;
      if (typeof heatOrRound === 'number') {
        targetRoundNumber = heatOrRound;
      } else {
        targetRoundNumber = updatedHM.currentRound + (isCurrentRoundComplete ? 1 : 0);
      }

      const targetRoundExists = updatedHM.rounds.some(r => r.round === targetRoundNumber);

      if (!targetRoundExists) {
        console.error('Target round', targetRoundNumber, 'does not exist');
        return updatedHM;
      }

      const result = {
        ...updatedHM,
        currentRound: targetRoundNumber,
        roundJustCompleted: undefined
      };

      const convertedResults = convertHeatResultsToRaceResults(result, skippers);
      if (convertedResults.length > 0) {
        setTimeout(() => {
          setRaceResults(convertedResults);
          setLastCompletedRace(targetRoundNumber - 1);
        }, 0);
      }

      return result;
    });
  };

  const handleGoToRound = (roundNumber: number) => {
    if (!heatManagement || roundNumber < 1) return;

    setHeatManagement(prevHeatManagement => {
      if (!prevHeatManagement) return prevHeatManagement;

      if (roundNumber > prevHeatManagement.rounds.length) {
        console.warn(`Cannot advance to round ${roundNumber} - only ${prevHeatManagement.rounds.length} rounds exist`);
        return prevHeatManagement;
      }

      const allPriorComplete = prevHeatManagement.rounds
        .filter(r => r.round < roundNumber)
        .every(r => r.completed);

      if (!allPriorComplete && roundNumber > prevHeatManagement.currentRound) {
        console.warn(`Cannot skip to round ${roundNumber} - prior rounds not completed`);
        const firstIncomplete = prevHeatManagement.rounds.find(r => !r.completed);
        if (firstIncomplete) {
          return {
            ...prevHeatManagement,
            currentRound: firstIncomplete.round
          };
        }
        return prevHeatManagement;
      }

      const updatedHeatManagement = {
        ...prevHeatManagement,
        currentRound: roundNumber
      };

      const previousRound = updatedHeatManagement.rounds.find(r => r.round === roundNumber - 1);
      if (previousRound?.completed) {
        setLastCompletedRace(roundNumber - 1);
      }

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
  const handleUpdateHeatAssignments = async (updatedAssignments: any[], targetRound?: number) => {
    if (!heatManagement) return;

    console.log('🔧 handleUpdateHeatAssignments called with:', {
      assignmentsCount: updatedAssignments.length,
      targetRound,
      currentRound: heatManagement.currentRound
    });

    const currentRoundNumber = heatManagement.currentRound;
    const currentRound = heatManagement.rounds.find(r => r.round === currentRoundNumber);

    // Determine which round to update
    let roundNumberToUpdate: number;

    if (targetRound) {
      // Explicit target round specified by caller
      roundNumberToUpdate = targetRound;
    } else {
      // Auto-detect: if current round is not complete, update current round (mid-round edit)
      // Otherwise, update next round (between-round edit)
      if (currentRound && !currentRound.completed) {
        // Mid-round: check if any heats have results
        const hasAnyResults = currentRound.results && currentRound.results.length > 0;
        if (hasAnyResults) {
          // Mid-round edit: update CURRENT round
          roundNumberToUpdate = currentRoundNumber;
          console.log('   → Mid-round edit detected, updating current round', currentRoundNumber);
        } else {
          // No results yet, create next round
          roundNumberToUpdate = currentRoundNumber + 1;
          console.log('   → No results yet, creating next round', roundNumberToUpdate);
        }
      } else {
        // Between rounds: update next round
        roundNumberToUpdate = currentRoundNumber + 1;
        console.log('   → Between rounds, updating next round', roundNumberToUpdate);
      }
    }

    // Find or create the target round
    let targetRoundIndex = heatManagement.rounds.findIndex(r => r.round === roundNumberToUpdate);
    const updatedRounds = [...heatManagement.rounds];

    if (targetRoundIndex === -1) {
      // Round doesn't exist yet - create it
      console.log('   → Creating new round', roundNumberToUpdate);
      const newRound = {
        round: roundNumberToUpdate,
        heatAssignments: updatedAssignments,
        results: [],
        completed: false
      };
      updatedRounds.push(newRound);
      targetRoundIndex = updatedRounds.length - 1;
    } else {
      // Update existing round
      console.log('   → Updating existing round', roundNumberToUpdate);
      updatedRounds[targetRoundIndex] = {
        ...updatedRounds[targetRoundIndex],
        heatAssignments: updatedAssignments
      };
    }

    const updatedHeatManagement = {
      ...heatManagement,
      rounds: updatedRounds
    };

    console.log('✅ Heat assignments updated for round', roundNumberToUpdate);
    setHeatManagement(updatedHeatManagement);

    const event = getCurrentEvent();
    if (event?.id) {
      try {
        await supabase
          .from('quick_races')
          .update({ heat_management: updatedHeatManagement })
          .eq('id', event.isSeriesEvent ? event.seriesId : event.id);
      } catch (err) {
        console.error('Error saving heat assignments:', err);
      }
    }
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
  // Use selectedEvent state to ensure component re-renders when event is updated
  const currentEvent = selectedEvent || getCurrentEvent();
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
      <div className={`w-full ${isFullscreenScoring ? 'px-0 py-0' : 'px-20 py-12'}`}>
        <div className={`flex-1 flex flex-col justify-center ${isFullscreenScoring ? '' : 'min-h-[calc(100vh-24rem)]'}`}>
          {getCurrentEvent() && !isFullscreenScoring && (
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

            {/* Scoring Mode Buttons - Only show for non-heat races, hide when scratch spreadsheet uses HMS component */}
            {!heatManagement?.configuration.enabled && !(scoringMode === 'spreadsheet' && raceType === 'scratch') && (
              <div className="flex justify-end mb-4 gap-2">
                {scoringMode === 'pro' && (
                  <button
                    onClick={() => setShowStartBoxModal(true)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                      ${darkMode
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25'
                        : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}
                    `}
                    title="Open StartBox"
                  >
                    <Timer size={18} />
                    <span className="text-sm font-medium">StartBox</span>
                  </button>
                )}
                {(['pro', 'touch', 'spreadsheet'] as const).filter(m => m !== scoringMode).filter(m => !(raceType === 'handicap' && m === 'spreadsheet')).map(mode => (
                  <button
                    key={mode}
                    onClick={async () => {
                      setScoringMode(mode);
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        await supabase.from('profiles').update({ scoring_mode_preference: mode }).eq('id', user.id);
                      }
                    }}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                      ${darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'}
                    `}
                    title={`Switch to ${mode === 'pro' ? 'Pro' : mode === 'touch' ? 'Touch' : 'Spreadsheet'} Mode`}
                  >
                    {mode === 'pro' ? <Table2 size={18} className="text-blue-400" />
                      : mode === 'touch' ? <Hand size={18} className="text-blue-400" />
                      : <Grid3X3 size={18} className="text-blue-400" />}
                    <span className="text-sm font-medium">
                      {mode === 'pro' ? 'Pro Mode' : mode === 'touch' ? 'Touch Mode' : 'Spreadsheet Mode'}
                    </span>
                  </button>
                ))}
                {raceType === 'scratch' && (
                  <button
                    onClick={() => setShowOverallResults(true)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                      ${darkMode
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}
                    `}
                    title="View Overall Results"
                  >
                    <Trophy size={18} />
                    <span className="text-sm font-medium">Overall Results</span>
                  </button>
                )}
              </div>
            )}

            {(scoringMode === 'touch' || scoringMode === 'spreadsheet' || heatManagement?.configuration.enabled) && (
              <div className={`fixed ${isFullscreenScoring ? 'top-2 right-4' : 'top-4 right-[5.9375rem]'} z-40 flex items-center gap-2`}>
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
                  <Logo className="w-5 h-5" />
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
                <button
                  type="button"
                  onClick={() => setIsFullscreenScoring(prev => !prev)}
                  className={`
                    flex items-center justify-center p-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600'
                      : 'text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200'}
                  `}
                  title={isFullscreenScoring ? 'Exit Fullscreen' : 'Fullscreen Scoring'}
                >
                  {isFullscreenScoring ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                {lastCompletedRace >= 1 && (
                  <button
                    type="button"
                    onClick={() => setShowCompleteConfirm(true)}
                    className="btn-primary-green flex items-center gap-2 px-4 py-2 text-white font-medium rounded-lg transition-colors"
                  >
                    <Trophy size={16} />
                    <span className="text-sm">Complete Scoring</span>
                  </button>
                )}
              </div>
            )}

            {/* Render appropriate table based on race type and heat configuration */}
            {heatManagement?.configuration?.enabled ? (
              <ScoringErrorBoundary darkMode={darkMode}>
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
                onBatchUpdateHeatResults={handleBatchUpdateHeatResults}
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
                onForceRoundComplete={(roundNumber: number) => {
                  setHeatManagement(prevHM => {
                    if (!prevHM) return prevHM;
                    const roundIdx = prevHM.rounds.findIndex(r => r.round === roundNumber);
                    if (roundIdx === -1) return prevHM;
                    const roundData = prevHM.rounds[roundIdx];
                    if (roundData.completed && prevHM.roundJustCompleted === roundNumber) {
                      console.log(`forceRoundComplete: Round ${roundNumber} already completed with roundJustCompleted set`);
                      return prevHM;
                    }
                    console.log(`forceRoundComplete: Force-marking Round ${roundNumber} as completed (${roundData.results.length} results, was completed=${roundData.completed})`);
                    const updatedRounds = [...prevHM.rounds];
                    updatedRounds[roundIdx] = { ...roundData, completed: true };
                    try {
                      const nextRoundAssignments = generateNextRoundAssignments(updatedRounds[roundIdx], prevHM);
                      const nextRoundIdx = updatedRounds.findIndex(r => r.round === roundNumber + 1);
                      if (nextRoundIdx === -1) {
                        updatedRounds.push({
                          round: roundNumber + 1,
                          heatAssignments: nextRoundAssignments,
                          results: [],
                          completed: false
                        });
                      } else if (updatedRounds[nextRoundIdx].results.length === 0) {
                        updatedRounds[nextRoundIdx] = {
                          ...updatedRounds[nextRoundIdx],
                          heatAssignments: nextRoundAssignments
                        };
                      }
                    } catch (e) {
                      console.error('forceRoundComplete: Failed to generate next round assignments', e);
                    }
                    const updatedHM = {
                      ...prevHM,
                      rounds: updatedRounds,
                      roundJustCompleted: roundNumber
                    };
                    const convertedResults = convertHeatResultsToRaceResults(updatedHM, skippers);
                    if (convertedResults.length > 0) {
                      setRaceResults(convertedResults);
                      setLastCompletedRace(roundNumber);
                    }
                    return updatedHM;
                  });
                }}
                onFinaliseQualifying={() => {
                  setHeatManagement(prevHM => {
                    if (!prevHM) return prevHM;
                    const currentRd = prevHM.currentRound;
                    console.log(`Finalising Qualifying after Round ${currentRd} - transitioning to Finals`);

                    // Update configuration to set current round as the last qualifying round
                    const updatedConfig = {
                      ...prevHM.configuration,
                      shrsQualifyingRounds: currentRd,
                      shrsFinalsStarted: true
                    };

                    const updatedRounds = [...prevHM.rounds];
                    const roundIdx = updatedRounds.findIndex(r => r.round === currentRd);
                    if (roundIdx === -1) return prevHM;

                    // Mark current round complete
                    updatedRounds[roundIdx] = { ...updatedRounds[roundIdx], completed: true };

                    // Build the updated HM with new config so generateNextRoundAssignments sees the transition
                    const hmForGeneration: HeatManagement = {
                      ...prevHM,
                      configuration: updatedConfig,
                      rounds: updatedRounds
                    };

                    try {
                      const nextRoundAssignments = generateNextRoundAssignments(updatedRounds[roundIdx], hmForGeneration);
                      const nextRoundIdx = updatedRounds.findIndex(r => r.round === currentRd + 1);
                      if (nextRoundIdx === -1) {
                        updatedRounds.push({
                          round: currentRd + 1,
                          heatAssignments: nextRoundAssignments,
                          results: [],
                          completed: false
                        });
                      } else if (updatedRounds[nextRoundIdx].results.length === 0) {
                        updatedRounds[nextRoundIdx] = {
                          ...updatedRounds[nextRoundIdx],
                          heatAssignments: nextRoundAssignments
                        };
                      }
                    } catch (e) {
                      console.error('Failed to generate finals fleet assignments', e);
                    }

                    const updatedHM = {
                      ...prevHM,
                      configuration: updatedConfig,
                      rounds: updatedRounds,
                      currentRound: currentRd + 1,
                      roundJustCompleted: currentRd
                    };

                    const convertedResults = convertHeatResultsToRaceResults(updatedHM, skippers);
                    if (convertedResults.length > 0) {
                      setTimeout(() => {
                        setRaceResults(convertedResults);
                        setLastCompletedRace(currentRd);
                      }, 0);
                    }

                    return updatedHM;
                  });
                }}
                isFullscreen={isFullscreenScoring}
                scoringMode={scoringMode}
              />
              </ScoringErrorBoundary>
            ) : scoringMode === 'touch' ? (
              <TouchModeScoring
                skippers={skippers}
                currentRace={touchModeCurrentRace}
                numRaces={currentNumRaces}
                raceResults={raceResults}
                dropRules={currentDropRules}
                updateRaceResults={(results: RaceResult[]) => {
                  setRaceResults(results);
                }}
                onConfirmResults={() => {
                  console.log('✅ Touch mode: User confirmed results, marking race as complete');

                  setRaceResults(latestResults => {
                    let highestConsecutiveRace = 0;
                    for (let r = 1; r <= currentNumRaces; r++) {
                      const isComplete = skippers.every((skipper, index) => {
                        const result = latestResults.find(res => res.race === r && res.skipperIndex === index);
                        if (result && (result.position !== null || result.letterScore)) {
                          return true;
                        }
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

                    const newLastCompleted = Math.max(highestConsecutiveRace, lastCompletedRace);

                    if (highestConsecutiveRace > lastCompletedRace) {
                      setLastCompletedRace(highestConsecutiveRace);
                      setEditingRace(null);

                      if (highestConsecutiveRace >= currentNumRaces) {
                        const newNumRaces = currentNumRaces + 1;
                        setCurrentNumRaces(newNumRaces);
                      }

                      if (raceType === 'handicap') {
                        const race1Complete = highestConsecutiveRace >= 1 && skippers.every((_, index) => {
                          const result = latestResults.find(r => r.race === 1 && r.skipperIndex === index);
                          return result && (result.position !== null || result.letterScore);
                        });

                        if (race1Complete && !isManualHandicaps && !hasDeterminedInitialHcaps) {
                          const hasPresetHandicaps = skippers.some(s => s.startHcap > 0);
                          if (!hasPresetHandicaps) {
                            const step = 10;
                            const ranking = skippers.map((_, idx) => ({
                              idx,
                              pos: latestResults.find(r => r.race === 1 && r.skipperIndex === idx)?.position || 0
                            })).sort((a, b) => a.pos - b.pos);

                            const updatedSkippers = [...skippers];
                            ranking.forEach((r, rank) => {
                              const handicap = rank * step;
                              updatedSkippers[r.idx] = { ...updatedSkippers[r.idx], startHcap: handicap };
                            });

                            setSkippers(updatedSkippers);
                          } else {
                            setIsManualHandicaps(true);
                          }
                          setHasDeterminedInitialHcaps(true);
                        }

                        for (let r = lastCompletedRace + 1; r <= highestConsecutiveRace; r++) {
                          updateMemberHandicaps(r, latestResults);
                        }
                      }
                    }

                    (async () => {
                      if (currentEvent?.id) {
                        try {
                          const nextRace = newLastCompleted + 1;
                          const actualEventId = currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id;
                          const clubId = localStorage.getItem('currentClubId');
                          console.log('📊 Touch confirm: DB sync - results:', latestResults.length, 'last_completed_race:', newLastCompleted, 'current_day:', nextRace);
                          const { error } = await supabase
                            .from('quick_races')
                            .update({
                              current_day: nextRace,
                              race_results: latestResults,
                              last_completed_race: newLastCompleted,
                              skippers: skippers
                            })
                            .eq('id', actualEventId)
                            .eq('club_id', clubId);

                          if (error) {
                            console.error('❌ Error syncing confirmed results:', error);
                          } else {
                            console.log('✅ Confirmed results synced to database');
                          }
                        } catch (error) {
                          console.error('❌ Exception syncing confirmed results:', error);
                        }
                      }
                    })();

                    autoSaveRaceResults(latestResults, newLastCompleted);

                    return latestResults;
                  });
                }}
                onRaceChange={(newRace) => {
                  setTouchModeCurrentRace(newRace);
                }}
                darkMode={darkMode}
                currentEvent={currentEvent}
                isFullscreen={isFullscreenScoring}
                updateSkipper={updateSkipper}
                setSkippers={setSkippers}
              />
            ) : scoringMode === 'spreadsheet' && raceType === 'scratch' ? (
              <div className={`flex flex-col ${isFullscreenScoring ? 'h-full' : 'h-[calc(100vh-200px)]'} no-select`}>
                <HmsManualSpreadsheet
                  skippers={skippers}
                  darkMode={darkMode}
                  raceResults={raceResults}
                  currentEvent={currentEvent}
                  updateRaceResults={updateRaceResults}
                  deleteRaceResult={deleteRaceResult}
                  isFullscreen={isFullscreenScoring}
                  singleFleetMode={true}
                  numRaces={currentNumRaces}
                  onScoringModeChange={async (mode) => {
                    setScoringMode(mode);
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                      await supabase.from('profiles').update({ scoring_mode_preference: mode }).eq('id', user.id);
                    }
                  }}
                  onShowOverallResults={() => setShowOverallResults(true)}
                />
              </div>
            ) : scoringMode === 'spreadsheet' ? (
              <SpreadsheetScoring
                skippers={skippers}
                currentRace={touchModeCurrentRace}
                numRaces={currentNumRaces}
                raceResults={raceResults}
                dropRules={currentDropRules}
                updateRaceResults={(results: any[]) => {
                  setRaceResults(results);
                }}
                onConfirmResults={() => {
                  setRaceResults(latestResults => {
                    let highestConsecutiveRace = 0;
                    for (let r = 1; r <= currentNumRaces; r++) {
                      const isComplete = skippers.every((skipper, index) => {
                        const result = latestResults.find(res => res.race === r && res.skipperIndex === index);
                        if (result && (result.position !== null || result.letterScore)) return true;
                        if (skipper.withdrawnFromRace && r >= skipper.withdrawnFromRace) return true;
                        return false;
                      });
                      if (isComplete) highestConsecutiveRace = r;
                      else break;
                    }

                    const newLastCompleted = Math.max(highestConsecutiveRace, lastCompletedRace);

                    if (highestConsecutiveRace > lastCompletedRace) {
                      setLastCompletedRace(highestConsecutiveRace);
                      setEditingRace(null);
                      if (highestConsecutiveRace >= currentNumRaces) {
                        setCurrentNumRaces(currentNumRaces + 1);
                      }
                    }

                    (async () => {
                      if (currentEvent?.id) {
                        try {
                          const nextRace = newLastCompleted + 1;
                          const actualEventId = currentEvent.isSeriesEvent ? currentEvent.seriesId : currentEvent.id;
                          const clubId = localStorage.getItem('currentClubId');
                          const { error } = await supabase
                            .from('quick_races')
                            .update({
                              current_day: nextRace,
                              race_results: latestResults,
                              last_completed_race: newLastCompleted,
                              skippers: skippers
                            })
                            .eq('id', actualEventId)
                            .eq('club_id', clubId);
                          if (error) console.error('Error syncing results:', error);
                        } catch (error) {
                          console.error('Exception syncing results:', error);
                        }
                      }
                    })();

                    autoSaveRaceResults(latestResults, newLastCompleted);
                    return latestResults;
                  });
                }}
                onRaceChange={(newRace) => {
                  setTouchModeCurrentRace(newRace);
                }}
                darkMode={darkMode}
                currentEvent={currentEvent}
                isFullscreen={isFullscreenScoring}
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
        
        <ConfirmationModal
          isOpen={showHeatRacingRecommendation}
          onClose={() => setShowHeatRacingRecommendation(false)}
          onConfirm={() => {
            setShowHeatRacingRecommendation(false);
            setAutoEnableHeatRacing(true);
            setShowRaceSettingsModal(true);
          }}
          title="Heat Racing Recommended"
          message={`With ${skippers.length} skippers competing, AlfiePRO recommends enabling Heat Racing. Skippers will be divided into heats using either the HMS or SHRS scoring systems. Would you like to enable Heat Racing?`}
          confirmText="Yes, Enable Heat Racing"
          cancelText="No Thanks"
          darkMode={darkMode}
        />

        <RaceSettingsModal
          isOpen={showRaceSettingsModal}
          onClose={() => {
            setShowRaceSettingsModal(false);
            setAutoEnableHeatRacing(false);
          }}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          skippers={skippers}
          initialHeatManagement={heatManagement}
          initialNumRaces={currentNumRaces}
          initialDropRules={currentDropRules}
          currentEvent={getCurrentEvent()}
          autoEnableHeatRacing={autoEnableHeatRacing}
          onSaveSettings={async (settings) => {
            await handleSaveRaceSettings(settings);
            setShowRaceSettingsModal(false);
            setAutoEnableHeatRacing(false);
          }}
          onManageSkippers={() => {
            setShowRaceSettingsModal(false);
            setAutoEnableHeatRacing(false);
            setIsSkipperModalOpen(true);
          }}
          addNotification={addNotification}
          hasRaceResults={raceResults.length > 0}
          onClearAllRaceResults={async () => {
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
            const currentEvent = getCurrentEvent();
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

        <StartBoxModal
          isOpen={showStartBoxModal}
          onClose={() => setShowStartBoxModal(false)}
          onSequenceComplete={() => {}}
          clubId={getCurrentEvent()?.clubId || localStorage.getItem('currentClubId') || null}
          darkMode={darkMode}
        />

        {showOverallResults && raceType === 'scratch' && (() => {
          const results = calculateScratchResults(skippers, raceResults, currentNumRaces, currentDropRules as number[]);
          const completedRaceCount = (() => {
            let count = 0;
            for (let r = 1; r <= currentNumRaces; r++) {
              const hasAnyResult = raceResults.some(res => res.race === r && (res.position !== null || res.letterScore));
              if (hasAnyResult) count = r;
            }
            return count;
          })();

          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`
                w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden border flex flex-col
                ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
              `}>
                <div className={`
                  flex items-center justify-between px-6 py-4 border-b shrink-0
                  ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}
                `}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${darkMode ? 'bg-amber-500/15' : 'bg-amber-50'}`}>
                      <Trophy size={20} className={darkMode ? 'text-amber-400' : 'text-amber-600'} />
                    </div>
                    <div>
                      <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Overall Results
                      </h2>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {getCurrentEvent()?.name || 'Event'} — {completedRaceCount} race{completedRaceCount !== 1 ? 's' : ''} completed
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowOverallResults(false)}
                    className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="overflow-auto flex-1">
                  <table className="w-full">
                    <thead className={`sticky top-0 z-10 ${darkMode ? 'bg-slate-750' : 'bg-slate-50'}`}>
                      <tr className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-14 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pos</th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Skipper</th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-20 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sail No</th>
                        {Array.from({ length: completedRaceCount }, (_, i) => (
                          <th key={i} className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider w-14 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            R{i + 1}
                          </th>
                        ))}
                        <th className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider w-20 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, idx) => {
                        const skipper = skippers[result.skipperIndex];
                        if (!skipper) return null;
                        const isTop3 = idx < 3;

                        return (
                          <tr
                            key={result.skipperIndex}
                            className={`
                              border-b transition-colors
                              ${darkMode
                                ? `border-slate-700/50 ${isTop3 ? 'bg-amber-500/5' : idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'}`
                                : `border-slate-100 ${isTop3 ? 'bg-amber-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`
                              }
                            `}
                          >
                            <td className="px-4 py-2.5">
                              <span className={`
                                inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                                ${idx === 0 ? 'bg-amber-400 text-amber-900'
                                  : idx === 1 ? (darkMode ? 'bg-slate-400 text-slate-900' : 'bg-slate-300 text-slate-800')
                                  : idx === 2 ? 'bg-amber-600 text-white'
                                  : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}
                              `}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className={`px-4 py-2.5 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {skipper.name}
                            </td>
                            <td className={`px-4 py-2.5 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {skipper.sailNumber || '-'}
                            </td>
                            {Array.from({ length: completedRaceCount }, (_, raceIdx) => {
                              const raceNum = raceIdx + 1;
                              const raceDetail = result.raceDetails?.find((d: any) => d.race === raceNum);
                              const raceResult = raceResults.find(r => r.race === raceNum && r.skipperIndex === result.skipperIndex);
                              const displayValue = raceResult?.letterScore
                                ? raceResult.letterScore
                                : raceResult?.position || '';
                              const isDropped = raceDetail?.isDropped;

                              return (
                                <td
                                  key={raceIdx}
                                  className={`px-3 py-2.5 text-center text-sm ${
                                    isDropped
                                      ? darkMode ? 'text-slate-600 line-through' : 'text-slate-300 line-through'
                                      : raceResult?.letterScore
                                        ? darkMode ? 'text-red-400' : 'text-red-500'
                                        : darkMode ? 'text-slate-300' : 'text-slate-700'
                                  }`}
                                >
                                  {displayValue}
                                </td>
                              );
                            })}
                            <td className={`px-4 py-2.5 text-center font-bold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                              {result.totalPoints}
                            </td>
                          </tr>
                        );
                      })}
                      {results.length === 0 && (
                        <tr>
                          <td colSpan={3 + completedRaceCount + 1} className={`px-6 py-12 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            No results recorded yet. Start scoring races to see overall standings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <AskAlfieOrb darkMode={darkMode} />
    </div>
  );
};