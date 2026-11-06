import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Plus, SquarePen as Edit2, CalendarRange, Trash2, Calendar, MapPin, Search, ListFilter as Filter, ChevronDown, ChevronUp, Grid2x2 as Grid, List, TriangleAlert as AlertTriangle, Flag, ArrowUpDown, Users, CircleCheck as CheckCircle2, Clock, Circle as XCircle, CirclePlay as PlayCircle, Sailboat, TrendingUp, QrCode, FileText, Globe, RotateCcw, SquarePen as Edit, Send, Radio, FlaskConical } from 'lucide-react';
import { RaceType } from '../../types';
import { RaceEvent, RaceSeries } from '../../types/race';
import { getStoredRaceEvents, getStoredRaceSeries, getSimulatedRaceEvents, deleteRaceEvent, deleteSimulatedRaceEvent, deleteRaceSeries, setCurrentEvent } from '../../utils/raceStorage';
import { getStoredVenues } from '../../utils/venueStorage';
import { Venue } from '../../types/venue';
import { formatDate } from '../../utils/date';
import { ConfirmationModal } from '../ConfirmationModal';
import { boatTypeColors, defaultColorScheme, getBoatClassBadge, getRaceFormatBadge } from '../../constants/colors';
import { CreateRaceModal } from './CreateRaceModal';
import { EventSimulationModal } from '../EventSimulationModal';
import { EventDetails } from '../EventDetails';
import { VenueDetails } from '../VenueDetails';
import { SingleEventManagement } from '../SingleEventManagement';
import { RaceSeries as RaceSeriesComponent } from '../RaceSeries';
import { SeriesRolloverModal } from '../SeriesRolloverModal';
import LiveTrackingQRCodeModal from '../live-tracking/LiveTrackingQRCodeModal';
import { EventWebsiteSettingsModal } from '../events/EventWebsiteSettingsModal';
import { EventWebsiteDashboard } from '../events/EventWebsiteDashboard';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { getPublicEvents, convertToRaceEvent } from '../../utils/publicEventStorage';

interface RaceManagementPageProps {
  darkMode: boolean;
  selectedEvent: RaceEvent | null;
  onEventSelect: (event: RaceEvent) => void;
  onStartScoring: () => void;
}

type TimeFilter = 'all' | 'upcoming' | 'past' | 'completed' | 'pending' | 'simulated';
type SortOption = 'date-asc' | 'date-desc' | 'name-asc' | 'name-desc' | 'status';

export const RaceManagementPage: React.FC<RaceManagementPageProps> = ({
  darkMode,
  selectedEvent,
  onEventSelect,
  onStartScoring
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentClub, currentOrganization, user, isRaceOfficer } = useAuth();
  const { addNotification } = useNotifications();

  // DIAGNOSTIC: Log when component mounts
  console.log('🎯 [RaceManagementPage] Component rendered, currentClub:', currentClub?.clubId, currentClub?.name);

  // Check if we should start on the pending tab (from navigation state)
  const initialTimeFilter = (location.state as any)?.activeTab === 'pending' ? 'pending' : 'upcoming';

  const [quickRaces, setQuickRaces] = useState<RaceEvent[]>([]);
  const [simulatedEvents, setSimulatedEvents] = useState<RaceEvent[]>([]);
  const [series, setSeries] = useState<RaceSeries[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(initialTimeFilter);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [sortBy, setSortBy] = useState<SortOption>('date-asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [createType, setCreateType] = useState<'quick' | 'series' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'quick' | 'series'} | null>(null);
  const [showDeletePendingConfirm, setShowDeletePendingConfirm] = useState(false);
  const [pendingEventToDelete, setPendingEventToDelete] = useState<any | null>(null);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<RaceEvent | null>(null);
  const [showEditModal, setShowEditModal] = useState<'quick' | 'series' | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [filterEventType, setFilterEventType] = useState<string>('all');
  const [showLiveTrackingQR, setShowLiveTrackingQR] = useState(false);
  const [selectedEventForTracking, setSelectedEventForTracking] = useState<RaceEvent | null>(null);
  const [selectedPendingEvent, setSelectedPendingEvent] = useState<any | null>(null);
  const [showPendingEventModal, setShowPendingEventModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingEventId, setRejectingEventId] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [showEventWebsiteModal, setShowEventWebsiteModal] = useState(false);
  const [showEventWebsiteDashboard, setShowEventWebsiteDashboard] = useState(false);
  const [selectedEventForWebsite, setSelectedEventForWebsite] = useState<RaceEvent | null>(null);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Helper function to check if an event has started scoring
  const hasEventStartedScoring = (event: RaceEvent): boolean => {
    // Check if event is completed
    if (event.completed) return true;

    // Check if any races have been scored (lastCompletedRace > 0)
    if (event.lastCompletedRace && event.lastCompletedRace > 0) return true;

    // Check if there are any race results
    if (event.raceResults && event.raceResults.length > 0) {
      // Check if any race has results entered
      const hasResults = event.raceResults.some(race =>
        race && race.length > 0 && race.some((result: any) => result && result.position)
      );
      if (hasResults) return true;
    }

    return false;
  };

  // Helper function to check if ALL rounds in a series have been completed
  // We only block series editing if ALL rounds are completed
  // This allows adding new rounds, cancelling rounds, or managing the series even with some completed rounds
  const isSeriesFullyCompleted = (series: RaceSeries): boolean => {
    if (!series.rounds || series.rounds.length === 0) return false;

    // Series is only "fully completed" if ALL rounds are completed or cancelled
    return series.rounds.every(round => {
      return round.completed === true || round.cancelled === true;
    });
  };

  useEffect(() => {
    fetchRaces();
  }, []);

  // Handle navigation state to open event details
  useEffect(() => {
    const navState = location.state as any;
    if (navState?.eventId && (quickRaces.length > 0 || series.length > 0)) {
      if (navState.isSeriesEvent && navState.seriesId) {
        const foundSeries = series.find(s => s.id === navState.seriesId);
        if (foundSeries) {
          setExpandedSeries(foundSeries.id);
          const roundIndex = foundSeries.rounds.findIndex((r: any) => r.name === navState.roundName);
          if (roundIndex >= 0) {
            handleRoundClick(foundSeries, roundIndex);
            navigate(location.pathname, { replace: true, state: {} });
          }
        }
      } else {
        // Find and select the quick race event
        const foundEvent = quickRaces.find(e => e.id === navState.eventId);
        if (foundEvent) {
          onEventSelect(foundEvent);
          // Clear the navigation state
          navigate(location.pathname, { replace: true, state: {} });
        }
      }
    }
  }, [location.state, quickRaces, series]);

  // Debug: Log pendingEvents whenever it changes
  useEffect(() => {
    console.log('👀 pendingEvents state changed:', pendingEvents.length, pendingEvents);
  }, [pendingEvents]);

  // Auto-retry connection when using cached data
  useEffect(() => {
    if (!usingCachedData) return;

    const retryInterval = setInterval(() => {
      console.log('Attempting to reconnect...');
      fetchRaces();
    }, 30000); // Retry every 30 seconds

    return () => clearInterval(retryInterval);
  }, [usingCachedData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch event attendance and enrich events with attendee data
  const enrichEventsWithAttendance = async (events: RaceEvent[]) => {
    console.log('🔍 [enrichEventsWithAttendance] Called with:', {
      hasClubId: !!currentClub?.clubId,
      clubId: currentClub?.clubId,
      eventsCount: events.length
    });

    if (!currentClub?.clubId || events.length === 0) {
      console.warn('⚠️ [enrichEventsWithAttendance] Early return:', !currentClub?.clubId ? 'No club ID' : 'No events');
      return events;
    }

    try {
      console.log('🔍 [enrichEventsWithAttendance] Starting enrichment for', events.length, 'events');

      // Fetch all attendance for this club (both single events and series rounds)
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('event_id, series_id, round_name, user_id, status')
        .eq('club_id', currentClub.clubId)
        .eq('status', 'yes');

      console.log('📋 [enrichEventsWithAttendance] Attendance data:', attendanceData?.length || 0, 'records, Error:', attendanceError);

      // Fetch all event registrations (excluding cancelled)
      // Include all registrations regardless of payment status, as long as they're not cancelled
      const { data: registrationsData, error: registrationsError } = await supabase
        .from('event_registrations')
        .select('event_id, user_id, guest_first_name, guest_last_name, sail_number, payment_status, status')
        .eq('club_id', currentClub.clubId)
        .neq('status', 'cancelled');

      console.log('📝 [enrichEventsWithAttendance] Event registrations:', registrationsData?.length || 0, 'records, Error:', registrationsError);

      if (registrationsError) {
        console.error('❌ [enrichEventsWithAttendance] Registration query error:', registrationsError);
      }

      // Combine user IDs from both attendance and registrations
      const attendanceUserIds = attendanceData?.map(att => att.user_id).filter(Boolean) || [];
      const registrationUserIds = registrationsData?.map(reg => reg.user_id).filter(Boolean) || [];
      const userIds = [...new Set([...attendanceUserIds, ...registrationUserIds])];

      // Fetch profiles for these users if there are any
      let profilesData: any[] = [];
      if (userIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        if (!profilesError && data) {
          profilesData = data;
        }
      }

      // Create a map of user_id to profile
      const profileMap: Record<string, any> = {};
      profilesData.forEach(profile => {
        profileMap[profile.id] = profile;
      });

      // Create attendance maps for both single events and series rounds
      const singleEventAttendanceMap: Record<string, any[]> = {};
      const seriesRoundAttendanceMap: Record<string, any[]> = {};

      // Process event_attendance data
      if (attendanceData) {
        attendanceData.forEach((att: any) => {
          const profile = profileMap[att.user_id];
          let name = 'Unknown';
          if (profile && profile.first_name && profile.last_name) {
            name = `${profile.first_name} ${profile.last_name}`;
          }

          const attendee = {
            name,
            sailNo: `ATT-${att.user_id.substring(0, 8)}`,
            club: currentClub.name,
            boatModel: '',
            startHcap: 0,
            avatarUrl: profile?.avatar_url
          };

          // For series rounds (has series_id and round_name)
          if (att.series_id && att.round_name) {
            const key = `${att.series_id}-${att.round_name}`;
            if (!seriesRoundAttendanceMap[key]) {
              seriesRoundAttendanceMap[key] = [];
            }
            seriesRoundAttendanceMap[key].push(attendee);
          }
          // For single events (has event_id)
          else if (att.event_id) {
            if (!singleEventAttendanceMap[att.event_id]) {
              singleEventAttendanceMap[att.event_id] = [];
            }
            singleEventAttendanceMap[att.event_id].push(attendee);
          }
        });
      }

      // Process event_registrations data (for paid events)
      if (registrationsData) {
        registrationsData.forEach((reg: any) => {
          if (!reg.event_id) return;

          let name = 'Unknown';
          let avatarUrl = null;

          // Check if this is an authenticated user or guest
          if (reg.user_id) {
            const profile = profileMap[reg.user_id];
            if (profile && profile.first_name && profile.last_name) {
              name = `${profile.first_name} ${profile.last_name}`;
              avatarUrl = profile.avatar_url;
            }
          } else if (reg.guest_first_name && reg.guest_last_name) {
            // Guest registration
            name = `${reg.guest_first_name} ${reg.guest_last_name}`;
          }

          const attendee = {
            name,
            sailNo: reg.sail_number || `REG-${reg.event_id.substring(0, 8)}`,
            club: currentClub.name,
            boatModel: '',
            startHcap: 0,
            avatarUrl: avatarUrl
          };

          // Add to single event attendance map
          if (!singleEventAttendanceMap[reg.event_id]) {
            singleEventAttendanceMap[reg.event_id] = [];
          }

          // Avoid duplicates - check if this user/guest is already in the list
          const isDuplicate = singleEventAttendanceMap[reg.event_id].some(
            existing => existing.sailNo === attendee.sailNo || existing.name === attendee.name
          );

          if (!isDuplicate) {
            singleEventAttendanceMap[reg.event_id].push(attendee);
          }
        });
      }

      // Log the maps we created
      console.log('🗺️ [enrichEventsWithAttendance] Single event attendance map:', Object.keys(singleEventAttendanceMap).length, 'events');
      Object.keys(singleEventAttendanceMap).forEach(eventId => {
        console.log(`  Event ${eventId}: ${singleEventAttendanceMap[eventId].length} attendees`);
      });

      // Enrich events with attendance data
      const enrichedEvents = events.map(event => {
        let attendees: any[] = [];

        if (event.isSeriesEvent && event.seriesId && event.roundName) {
          // For series rounds, look up by series_id + round_name
          const key = `${event.seriesId}-${event.roundName}`;
          attendees = seriesRoundAttendanceMap[key] || [];
        } else {
          // For single events, extract the UUID from the event ID
          const eventId = event.id.includes('-') && event.id.split('-').length > 5
            ? event.id.split('-').slice(0, 5).join('-')
            : event.id;
          attendees = singleEventAttendanceMap[eventId] || [];

          console.log(`[enrichEventsWithAttendance] Event ${event.eventName}:`, {
            eventId,
            fullEventId: event.id,
            hasSkippers: (event.skippers && event.skippers.length > 0),
            skipperCount: event.skippers?.length || 0,
            attendeeCount: attendees.length,
            lastCompletedRace: event.lastCompletedRace
          });

          if (attendees.length > 0) {
            console.log(`✅ [enrichEventsWithAttendance] Event ${event.eventName} (${eventId}): ${attendees.length} attendees`);
          }
        }

        // Store attendees separately from skippers
        // SkipperModal will use the attendees for pre-selection
        // This prevents attendees from appearing in the scoring table before they're properly added
        return {
          ...event,
          skippers: event.skippers || [],
          attendees: attendees || []
        };
      });

      console.log('✅ [enrichEventsWithAttendance] Enrichment complete');
      return enrichedEvents;
    } catch (err) {
      console.error('❌ [enrichEventsWithAttendance] Error enriching events with attendance:', err);
      return events;
    }
  };

  const enrichSeriesWithAttendance = async (series: RaceSeries[]) => {
    if (!currentClub?.clubId || series.length === 0) return series;

    try {
      // Fetch all attendance for series rounds
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('series_id, round_name, user_id, status')
        .eq('club_id', currentClub.clubId)
        .eq('status', 'yes')
        .not('series_id', 'is', null);

      if (attendanceError || !attendanceData || attendanceData.length === 0) {
        return series;
      }

      // Get unique user IDs
      const userIds = [...new Set(attendanceData.map(att => att.user_id))];

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profilesError || !profilesData) {
        return series;
      }

      // Create a map of user_id to profile
      const profileMap: Record<string, any> = {};
      profilesData.forEach(profile => {
        profileMap[profile.id] = profile;
      });

      // Create attendance map for series rounds
      const roundAttendanceMap: Record<string, any[]> = {};

      attendanceData.forEach((att: any) => {
        const profile = profileMap[att.user_id];
        let name = 'Unknown';
        if (profile && profile.first_name && profile.last_name) {
          name = `${profile.first_name} ${profile.last_name}`;
        }

        const attendee = {
          name,
          avatarUrl: profile?.avatar_url
        };

        const key = `${att.series_id}-${att.round_name}`;
        if (!roundAttendanceMap[key]) {
          roundAttendanceMap[key] = [];
        }
        roundAttendanceMap[key].push(attendee);
      });

      // Enrich series rounds with attendance
      return series.map(s => ({
        ...s,
        rounds: s.rounds.map(round => {
          const key = `${s.id}-${round.name}`;
          const attendees = roundAttendanceMap[key] || [];
          return {
            ...round,
            attendees
          };
        })
      }));
    } catch (err) {
      console.error('Error enriching series with attendance:', err);
      return series;
    }
  };

  const enrichSeriesWithSkippers = async (series: any[]) => {
    try {
      if (!currentClub?.clubId || series.length === 0) {
        return series;
      }

      // Fetch all rounds from race_series_rounds table for these series
      const seriesIds = series.map(s => s.id);
      const { data: roundsData, error: roundsError } = await supabase
        .from('race_series_rounds')
        .select('series_id, round_name, skippers, last_completed_race')
        .eq('club_id', currentClub.clubId)
        .in('series_id', seriesIds);

      if (roundsError || !roundsData) {
        console.error('Error fetching round skippers:', roundsError);
        return series;
      }

      // Create a map of series_id + round_name to round data
      const roundDataMap: Record<string, any> = {};
      roundsData.forEach(round => {
        const key = `${round.series_id}-${round.round_name}`;
        roundDataMap[key] = round;
      });

      // Enrich series rounds with skippers from race_series_rounds table
      return series.map(s => ({
        ...s,
        rounds: s.rounds.map(round => {
          const key = `${s.id}-${round.name}`;
          const roundData = roundDataMap[key];
          return {
            ...round,
            skippers: roundData?.skippers || round.skippers || [],
            lastCompletedRace: roundData?.last_completed_race || round.lastCompletedRace || 0
          };
        })
      }));
    } catch (err) {
      console.error('Error enriching series with skippers:', err);
      return series;
    }
  };

  const fetchRaces = async () => {
    console.log('🔄 fetchRaces starting...');
    const startTime = Date.now();

    try {
      setLoading(true);
      setError(null);
      setUsingCachedData(false);

      // Clean up failed sync items on page load
      const { offlineStorage } = await import('../../utils/offlineStorage');
      await offlineStorage.clearFailedSyncItems().catch(err =>
        console.warn('Failed to clear sync items:', err)
      );

      console.log('📡 Fetching base data...');

      // Add aggressive timeout to ENTIRE fetch operation - 15 seconds max
      const fetchPromise = Promise.all([
        getStoredRaceEvents(),
        getStoredRaceSeries(),
        getStoredVenues()
      ]);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout after 15s')), 15000)
      );

      const [raceEvents, raceSeries, storedVenues] = await Promise.race([
        fetchPromise,
        timeoutPromise
      ]) as [any[], any[], any[]];

      console.log(`✓ Base data loaded in ${Date.now() - startTime}ms`);

      const isAssociation = currentOrganization?.type === 'state' || currentOrganization?.type === 'national';
      const baseSeries = isAssociation ? [] : raceSeries;

      // Show the club's own events straight away; attendance and public events fill in afterwards
      if (!isAssociation) {
        setQuickRaces(raceEvents.filter(event => !event.isSeriesEvent));
        setSeries(baseSeries);
        setVenues(storedVenues);
        setLoading(false);
      }

      const loadPublicEvents = async (): Promise<RaceEvent[]> => {
        try {
          const approvedPublicEvents = await getPublicEvents(
            false,
            currentOrganization?.type as 'state' | 'national' | undefined,
            currentOrganization?.id
          );
          if (!approvedPublicEvents) return [];

          let publicEvents = approvedPublicEvents.map(pe => convertToRaceEvent(pe));

          // Local copies in quick_races hold the scoring data for public events
          if (currentClub?.clubId) {
            const { data: localCopies, error: localCopiesError } = await supabase
              .from('quick_races')
              .select('id, public_event_id, skippers, race_results, last_completed_race, completed')
              .eq('club_id', currentClub.clubId)
              .not('public_event_id', 'is', null)
              .neq('is_simulated', true);

            if (localCopiesError) {
              console.error('Error fetching local copies of public events:', localCopiesError);
            } else if (localCopies && localCopies.length > 0) {
              publicEvents = publicEvents.map(pe => {
                const localCopy = localCopies.find(lc => lc.public_event_id === pe.publicEventId);
                if (!localCopy) return pe;
                return {
                  ...pe,
                  id: localCopy.id,
                  skippers: localCopy.skippers || pe.skippers || [],
                  raceResults: localCopy.race_results || [],
                  lastCompletedRace: localCopy.last_completed_race || 0,
                  completed: localCopy.completed || false
                };
              });
            }
          }
          return publicEvents;
        } catch (err) {
          console.error('Error fetching public events:', err);
          return [];
        }
      };

      const loadRaces = async () => {
        const publicEvents = await loadPublicEvents();
        const allRaceEvents = isAssociation ? publicEvents : [...raceEvents, ...publicEvents];
        const standaloneRaces = allRaceEvents.filter(event => !event.isSeriesEvent);
        try {
          return await enrichEventsWithAttendance(standaloneRaces);
        } catch (err) {
          console.error('Error enriching races with attendance, using base data:', err);
          return standaloneRaces;
        }
      };

      const loadSeries = async () => {
        if (baseSeries.length === 0) return baseSeries;
        let enriched = baseSeries;
        try {
          enriched = await enrichSeriesWithAttendance(enriched);
        } catch (err) {
          console.error('Error enriching series with attendance, using base data:', err);
        }
        try {
          enriched = await enrichSeriesWithSkippers(enriched);
        } catch (err) {
          console.error('Error enriching series with skippers, using base data:', err);
        }
        return enriched;
      };

      const loadSimulated = async () => {
        try {
          return await getSimulatedRaceEvents();
        } catch (simErr) {
          console.error('Error fetching simulated events:', simErr);
          return [];
        }
      };

      const [enrichedRaces, enrichedSeries, simEvents] = await Promise.all([
        loadRaces(),
        loadSeries(),
        loadSimulated()
      ]);

      setQuickRaces(enrichedRaces);
      setSeries(enrichedSeries);
      setVenues(storedVenues);
      setSimulatedEvents(simEvents);
    } catch (err: any) {
      console.error(`❌ Error fetching races after ${Date.now() - startTime}ms:`, err);

      // ALWAYS try to show cached data on error, regardless of online status
      try {
        console.log('🔄 Attempting to load cached data...');
        const { offlineStorage } = await import('../../utils/offlineStorage');
        const cachedEvents = await offlineStorage.getEvents(currentClub?.clubId);
        const cachedSeries = await offlineStorage.getSeries(currentClub?.clubId);

        // Filter out series events from quickRaces
        const standaloneRaces = cachedEvents.filter(event => !event.isSeriesEvent);
        // For state/national associations, don't show club series
        const filteredSeries = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
          ? []
          : cachedSeries;

        if (standaloneRaces.length > 0 || filteredSeries.length > 0) {
          console.log(`✓ Loaded ${standaloneRaces.length} cached events and ${filteredSeries.length} cached series`);
          setQuickRaces(standaloneRaces);
          setSeries(filteredSeries);
          setVenues([]); // No venues in cache fallback
          setUsingCachedData(true);

          const message = err.message?.includes('timeout')
            ? 'Connection slow. Showing cached data.'
            : 'Working offline. Showing cached data.';
          addNotification('info', message);
        } else {
          // No cached data available
          console.warn('⚠️ No cached data available');
          setError(err.message?.includes('timeout')
            ? 'Connection timeout. No cached data available.'
            : 'Unable to load race data. Please check your connection.');
          setQuickRaces([]);
          setSeries([]);
          setVenues([]);
        }
      } catch (cacheErr) {
        console.error('❌ Failed to load cached data:', cacheErr);
        setError('Unable to load race data.');
        // Set empty arrays so UI doesn't break
        setQuickRaces([]);
        setSeries([]);
        setVenues([]);
      }
    } finally {
      console.log(`⏱️ fetchRaces completed in ${Date.now() - startTime}ms`);
      setLoading(false);

      // Load pending events after main loading completes (non-blocking with timeout)
      const pendingPromise = loadPendingEvents();
      const pendingTimeout = new Promise((resolve) =>
        setTimeout(() => {
          console.warn('loadPendingEvents timed out after 5s');
          resolve(null);
        }, 5000)
      );

      Promise.race([pendingPromise, pendingTimeout]).catch(err => {
        console.error('Error loading pending events:', err);
      });
    }
  };

  const loadPendingEvents = async () => {
    // For clubs: show events they created that are pending approval
    // For state associations: show events from member clubs needing state approval
    // For national associations: show events from member clubs needing national approval

    try {
      // Create an AbortController with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      let query = supabase
        .from('public_events')
        .select(`
          *,
          club:clubs(name)
        `)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);

      // If viewing as a club, show events the club created (pending, rejected, withdrawn, or awaiting approvals)
      if (currentClub && !currentOrganization) {
        console.log('loadPendingEvents: Fetching for club:', currentClub.clubId);
        query = query
          .eq('club_id', currentClub.clubId)
          .eq('created_by_type', 'club')
          .in('approval_status', ['pending', 'pending_state', 'pending_national', 'rejected', 'withdrawn']);
      }
      // If viewing as a state association, show events needing state approval
      else if (currentOrganization?.type === 'state') {
        console.log('loadPendingEvents: Fetching for state association:', currentOrganization.id);
        query = query
          .eq('state_association_id', currentOrganization.id)
          .in('approval_status', ['pending_state', 'pending']);
      }
      // If viewing as a national association, show events approved by state and needing national approval
      else if (currentOrganization?.type === 'national') {
        console.log('loadPendingEvents: Fetching for national association:', currentOrganization.id);
        query = query
          .eq('national_association_id', currentOrganization.id)
          .eq('approval_status', 'pending_national');
      }
      else {
        clearTimeout(timeoutId);
        console.log('loadPendingEvents: No valid context (club or organization)');
        setPendingEvents([]);
        return;
      }

      const { data, error } = await query;
      clearTimeout(timeoutId);

      if (error) {
        // Don't throw on abort errors
        if (error.message?.includes('aborted')) {
          console.warn('loadPendingEvents: Query aborted (timeout)');
          return;
        }
        console.error('loadPendingEvents: Error from Supabase:', error);
        throw error;
      }

      console.log('loadPendingEvents: Found', data?.length || 0, 'pending events:', data);
      setPendingEvents(data || []);
    } catch (err: any) {
      // Don't log abort errors as errors
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        console.warn('loadPendingEvents: Timed out');
      } else {
        console.error('Error loading pending events:', err);
      }
      setPendingEvents([]);
    }
  };

  const handleApproveEvent = async (eventId: string, eventLevel: string) => {
    console.log('handleApproveEvent called:', { eventId, eventLevel, currentOrganization, user });

    if (!currentOrganization || !user) {
      console.log('Missing currentOrganization or user');
      return;
    }

    try {
      // First, get the event to check if it's a ranking event
      const { data: eventData, error: fetchError } = await supabase
        .from('public_events')
        .select('is_ranking_event, event_level, approval_status, national_association_id')
        .eq('id', eventId)
        .single();

      if (fetchError) throw fetchError;

      const updateData: any = {};

      // State association approving
      if (currentOrganization.type === 'state') {
        const needsNationalApproval = eventLevel === 'national' ||
                                      (eventLevel === 'state' && eventData.is_ranking_event);

        if (needsNationalApproval) {
          // Event needs national approval next
          updateData.approval_status = 'pending_national';
        } else {
          // State event (non-ranking) - fully approved
          updateData.approval_status = 'approved';
        }
        updateData.state_approved_at = new Date().toISOString();
        updateData.state_approved_by = user.id;
      }
      // National association approving
      else if (currentOrganization.type === 'national') {
        // National approval means event is fully approved
        updateData.approval_status = 'approved';
        updateData.national_approved_at = new Date().toISOString();
        updateData.national_approved_by = user.id;
      }

      console.log('Update data:', updateData);

      const { data, error } = await supabase
        .from('public_events')
        .update(updateData)
        .eq('id', eventId)
        .select();

      console.log('Update result:', { data, error });

      if (error) throw error;

      // Show appropriate notification
      if (updateData.approval_status === 'pending_national') {
        addNotification('success', 'State Approval Complete', 'Event has been approved and forwarded to the National Association for final approval.');
      } else {
        addNotification('success', 'Event Fully Approved', 'Event has been approved and is now visible in all calendars.');
      }

      await loadPendingEvents();
    } catch (error) {
      console.error('Error approving event:', error);
      addNotification('error', 'Failed to Approve Event', 'An error occurred while approving the event. Please try again.');
    }
  };

  const handleRejectEvent = (eventId: string) => {
    setRejectingEventId(eventId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmRejectEvent = async () => {
    if (!currentOrganization || !user || !rejectingEventId) return;
    if (!rejectReason.trim()) {
      addNotification('error', 'Please provide a reason for rejection');
      return;
    }

    try {
      const { error } = await supabase
        .from('public_events')
        .update({
          approval_status: 'rejected',
          rejection_reason: rejectReason,
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
        })
        .eq('id', rejectingEventId);

      if (error) throw error;

      addNotification('success', 'Event rejected');
      setShowRejectModal(false);
      setRejectingEventId(null);
      setRejectReason('');
      await loadPendingEvents();
    } catch (error) {
      console.error('Error rejecting event:', error);
      addNotification('error', 'Failed to reject event');
    }
  };

  const handleWithdrawEvent = async (eventId: string) => {
    if (!currentClub || !user) return;

    try {
      const { error } = await supabase
        .from('public_events')
        .update({
          approval_status: 'withdrawn',
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (error) throw error;

      addNotification('success', 'Event Withdrawn', 'Your event has been withdrawn from the approval process. You can now edit, delete, or resubmit it.');
      await loadPendingEvents();
    } catch (error) {
      console.error('Error withdrawing event:', error);
      addNotification('error', 'Failed to withdraw event');
    }
  };

  const handleResubmitEvent = async (eventId: string) => {
    if (!currentClub || !user) return;

    try {
      // Get event details to determine correct initial status
      const { data: eventData, error: fetchError } = await supabase
        .from('public_events')
        .select('event_level, is_ranking_event')
        .eq('id', eventId)
        .single();

      if (fetchError) throw fetchError;

      // Determine initial approval status based on event type
      const needsStateApproval = eventData.event_level === 'national' ||
                                (eventData.event_level === 'state' && eventData.is_ranking_event);
      const initialApprovalStatus = needsStateApproval ? 'pending_state' : 'pending';

      const { error } = await supabase
        .from('public_events')
        .update({
          approval_status: initialApprovalStatus,
          rejection_reason: null,
          rejected_at: null,
          rejected_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (error) throw error;

      addNotification('success', 'Event Resubmitted', 'Your event has been resubmitted for approval. You\'ll be notified once it\'s reviewed.');
      await loadPendingEvents();
    } catch (error) {
      console.error('Error resubmitting event:', error);
      addNotification('error', 'Failed to Resubmit Event', 'An error occurred while resubmitting the event. Please try again.');
    }
  };

  const handleEditWithdrawnEvent = (event: any) => {
    // Convert the public event to a format the CreateRaceModal expects
    const eventForEdit: RaceEvent = {
      id: '', // Will be ignored since we're editing a public event
      public_event_id: event.id,
      eventName: event.event_name,
      clubName: currentClub?.club?.name || '',
      date: event.date,
      venue: event.venue || '',
      raceClass: event.race_class || '',
      raceFormat: event.race_format || 'pursuit',
      raceResults: [],
      skippers: [],
      lastCompletedRace: 0,
      hasDeterminedInitialHcaps: false,
      isManualHandicaps: false,
      completed: false,
      multiDay: event.multi_day || false,
      numberOfDays: event.number_of_days || 1,
      endDate: event.end_date || undefined,
      currentDay: 1,
      isPaid: event.is_paid || false,
      entryFee: event.entry_fee || undefined,
      noticeOfRaceUrl: event.notice_of_race_url || undefined,
      sailingInstructionsUrl: event.sailing_instructions_url || undefined,
      isInterclub: event.is_interclub || false,
      otherClubName: event.other_club_name || undefined,
      eventLevel: event.event_level || 'club',
    };

    setEditingEvent(eventForEdit);
    setShowEditModal('quick');
  };

  const handleDeleteClick = (id: string, type: 'quick' | 'series', isSimulated?: boolean) => {
    setItemToDelete({ id, type, isSimulated });
    setShowDeleteConfirm(true);
  };

  const handleDeleteModalClose = useCallback(() => {
    setShowDeleteConfirm(false);
    setItemToDelete(null);
  }, []);

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'quick') {
        if (itemToDelete.isSimulated) {
          await deleteSimulatedRaceEvent(itemToDelete.id);
        } else {
          await deleteRaceEvent(itemToDelete.id);
        }
      } else {
        await deleteRaceSeries(itemToDelete.id);
      }
      await fetchRaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }

    setShowDeleteConfirm(false);
    setItemToDelete(null);
  };

  const handleStartScoring = (event: RaceEvent) => {
    setCurrentEvent(event);
    onStartScoring();
  };

  const handleCreateClick = (type: 'quick' | 'series') => {
    setCreateType(type);
    setShowCreateModal(true);
  };

  const handleCreateSuccess = async () => {
    setShowCreateModal(false);
    setCreateType(null);
    // Small delay to ensure data is persisted before refreshing
    await new Promise(resolve => setTimeout(resolve, 300));
    await fetchRaces();
  };

  const handleEditClick = (event: RaceEvent) => {
    // Check if this is a series event
    if (event.isSeriesEvent && event.seriesId) {
      const seriesItem = series.find(s => s.id === event.seriesId);
      if (seriesItem && isSeriesFullyCompleted(seriesItem)) {
        addNotification('warning', 'This series cannot be edited because all rounds have been completed or cancelled. You can still delete the series if needed.');
        return;
      }
    } else {
      // Single event - check if scoring has started
      if (hasEventStartedScoring(event)) {
        addNotification('warning', 'This event cannot be edited because scoring has already commenced. You can still delete the event if needed.');
        return;
      }
    }

    setEditingEvent(event);
    if (event.isSeriesEvent) {
      setShowEditModal('series');
    } else {
      setShowEditModal('quick');
    }
  };

  const handleRoundClick = (seriesItem: RaceSeries, roundIndex: number) => {
    const round = seriesItem.rounds[roundIndex];
    if (round.cancelled) return;

    const event: RaceEvent = {
      id: `${seriesItem.id}-${roundIndex}`,
      eventName: `${round.name} - ${seriesItem.seriesName}`,
      clubName: seriesItem.clubName,
      date: round.date,
      venue: round.venue,
      raceClass: seriesItem.raceClass,
      raceFormat: seriesItem.raceFormat,
      isSeriesEvent: true,
      seriesId: seriesItem.id,
      roundName: round.name,
      skippers: round.skippers?.length ? round.skippers : seriesItem.skippers || [],
      raceResults: round.raceResults || round.results || [],
      lastCompletedRace: round.lastCompletedRace || 0,
      hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || false,
      isManualHandicaps: round.isManualHandicaps || false,
      completed: round.completed || false,
      cancelled: round.cancelled || false,
      cancellationReason: round.cancellationReason,
      media: seriesItem.media || [],
      livestreamUrl: seriesItem.livestreamUrl,
      clubId: seriesItem.clubId,
      heatManagement: round.heatManagement || null,
      numRaces: round.numRaces,
      dropRules: round.dropRules || [4, 8, 16, 24, 32, 40],
      enableLiveTracking: seriesItem.enableLiveTracking,
      enableLiveStream: round.enableLiveStream || seriesItem.enableLiveStream,
      enable_observers: round.enable_observers || false,
      observers_per_heat: round.observers_per_heat || 2
    };

    onEventSelect(event);
  };

  const toggleSeriesExpansion = (seriesId: string) => {
    console.log('Toggle series expansion called:', {
      seriesId: seriesId,
      idType: typeof seriesId,
      currentExpanded: expandedSeries,
      currentType: typeof expandedSeries
    });
    setExpandedSeries(prev => {
      const newValue = prev === seriesId ? null : seriesId;
      console.log('Setting expandedSeries from', prev, 'to', newValue);
      return newValue;
    });
  };

  // Get unique boat classes for filters
  const boatClasses = Array.from(new Set([
    ...quickRaces.map(e => e.raceClass),
    ...series.map(s => s.raceClass)
  ])).filter(Boolean);

  // Helper functions
  const isDatePast = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(dateStr);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  };

  const isDateToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const getVenueImage = (venueName: string, event?: RaceEvent): string | null => {
    // If event has venueImage (from public_events join), use that directly
    if (event?.venueImage) {
      return event.venueImage;
    }

    // Otherwise look up venue in venues array
    const venue = venues.find(v => v.name === venueName);
    return venue?.image || null;
  };

  const getNextUpcomingRound = (seriesItem: RaceSeries): number | null => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureRounds = seriesItem.rounds
      .map((round, index) => ({ ...round, index }))
      .filter(round => {
        const roundDate = new Date(round.date);
        return roundDate >= today && !round.cancelled && !round.completed;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return futureRounds.length > 0 ? futureRounds[0].index : null;
  };

  const getSortedRounds = (seriesItem: RaceSeries) => {
    return [...seriesItem.rounds].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
  };

  // Filter and sort logic
  const filterByTime = (event: RaceEvent | { date: string, completed?: boolean, is_simulated?: boolean }) => {
    const isPast = isDatePast(event.date);
    const isCompleted = event.completed || false;

    if (timeFilter === 'simulated') {
      return false;
    }

    switch (timeFilter) {
      case 'upcoming':
        return !isPast && !isCompleted;
      case 'past':
        return isPast && !isCompleted;
      case 'completed':
        return isCompleted;
      default:
        return true;
    }
  };

  const filterBySearch = (name: string, venue: string) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return name.toLowerCase().includes(search) || venue.toLowerCase().includes(search);
  };

  // Get unique years from all events and series rounds, always including current year
  const availableYears = React.useMemo(() => {
    const years = new Set<number>();

    // Always include current year
    years.add(new Date().getFullYear());

    quickRaces.forEach(race => {
      const year = new Date(race.date).getFullYear();
      if (!isNaN(year)) years.add(year);
    });

    series.forEach(s => {
      s.rounds.forEach(round => {
        const year = new Date(round.date).getFullYear();
        if (!isNaN(year)) years.add(year);
      });
    });

    return Array.from(years).sort((a, b) => b - a); // Sort descending (newest first)
  }, [quickRaces, series]);

  const filteredQuickRaces = quickRaces.filter(race => {
    const matchesSearch = filterBySearch(race.eventName || race.clubName, race.venue);
    const matchesClass = filterClass === 'all' || race.raceClass === filterClass;
    const matchesFormat = filterFormat === 'all' || race.raceFormat === filterFormat;
    const matchesEventType = filterEventType === 'all' || filterEventType === 'single';
    const matchesTime = filterByTime(race);

    const matchesYear = new Date(race.date).getFullYear() === selectedYear;

    return matchesSearch && matchesClass && matchesFormat && matchesEventType && matchesTime && matchesYear;
  });

  const filteredSeries = series.filter(s => {
    const matchesSearch = filterBySearch(s.seriesName, s.rounds[0]?.venue || '');
    const matchesClass = filterClass === 'all' || s.raceClass === filterClass;
    const matchesFormat = filterFormat === 'all' || s.raceFormat === filterFormat;
    const matchesEventType = filterEventType === 'all' || filterEventType === 'series';

    // For series, check if any round matches time filter AND year filter
    const hasMatchingRounds = s.rounds.some(round => {
      const matchesTimeFilter = filterByTime({ date: round.date, completed: round.completed });
      const matchesYearFilter = new Date(round.date).getFullYear() === selectedYear;
      return matchesTimeFilter && matchesYearFilter;
    });

    return matchesSearch && matchesClass && matchesFormat && matchesEventType && hasMatchingRounds;
  });

  // Sort events
  const sortEvents = <T extends { date?: string; eventName?: string; seriesName?: string; completed?: boolean }>(events: T[]): T[] => {
    return [...events].sort((a, b) => {
      // Helper to get date from either event or series
      const getDate = (item: T): string => {
        if ('date' in item && item.date) return item.date;
        if ('rounds' in item && Array.isArray((item as any).rounds) && (item as any).rounds[0]) {
          return (item as any).rounds[0].date || '';
        }
        return '';
      };

      switch (sortBy) {
        case 'date-asc':
          return new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime();
        case 'date-desc':
          return new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime();
        case 'name-asc': {
          const nameA = ('seriesName' in a ? a.seriesName : a.eventName) || '';
          const nameB = ('seriesName' in b ? b.seriesName : b.eventName) || '';
          return nameA.localeCompare(nameB);
        }
        case 'name-desc': {
          const nameA = ('seriesName' in a ? a.seriesName : a.eventName) || '';
          const nameB = ('seriesName' in b ? b.seriesName : b.eventName) || '';
          return nameB.localeCompare(nameA);
        }
        case 'status': {
          const statusA = a.completed ? 2 : (isDatePast(getDate(a)) ? 1 : 0);
          const statusB = b.completed ? 2 : (isDatePast(getDate(b)) ? 1 : 0);
          return statusA - statusB;
        }
        default:
          return 0;
      }
    });
  };

  const sortedQuickRaces = React.useMemo(() => sortEvents(filteredQuickRaces), [filteredQuickRaces, sortBy]);
  const sortedSeries = React.useMemo(() =>
    sortEvents(filteredSeries),
    [filteredSeries, sortBy]
  );

  // Debug: Log all series IDs
  React.useEffect(() => {
    if (sortedSeries.length > 0) {
      console.log('ALL SERIES IDs:', sortedSeries.map(s => ({
        name: s.seriesName,
        id: s.id,
        type: typeof s.id
      })));
    }
  }, [sortedSeries]);

  // Group single events by month
  const groupEventsByMonth = () => {
    const grouped: Record<string, RaceEvent[]> = {};

    sortedQuickRaces.forEach(event => {
      const date = new Date(event.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    });

    return grouped;
  };

  const groupedSingleEvents = groupEventsByMonth();

  const renderEventCard = (race: RaceEvent) => {
    const colors = boatTypeColors[race.raceClass] || defaultColorScheme;
    const isPastDate = isDatePast(race.date);
    const venueImage = getVenueImage(race.venue, race);
    // Use attendees for display if no skippers have been added yet (scoring hasn't started)
    const displayParticipants = (race.skippers && race.skippers.length > 0) ? race.skippers : (race.attendees || []);
    const skippers = displayParticipants;
    const avatars = skippers.slice(0, 5).map((skipper, i) => {
      const nameParts = skipper.name.trim().split(' ');
      const initials = nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
        : nameParts[0][0] || '?';

      return (
        <div
          key={i}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 ${
            darkMode ? 'border-slate-800 bg-slate-700 text-slate-300' : 'border-white bg-slate-200 text-slate-700'
          } -ml-2 first:ml-0`}
          style={{
            backgroundImage: skipper.avatarUrl ? `url(${skipper.avatarUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!skipper.avatarUrl && initials}
        </div>
      );
    });

    return (
      <div
        key={race.id}
        onClick={() => onEventSelect(race)}
        className={`
          group relative overflow-hidden cursor-pointer rounded-xl transition-all duration-300
          ${darkMode
            ? 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700'
            : 'bg-white hover:shadow-xl border border-slate-200'}
          ${race.completed ? 'opacity-75' : ''}
        `}
      >
        {/* Event Image */}
        {venueImage && (
          <div className="relative h-48 overflow-hidden">
            <img
              src={venueImage}
              alt={race.venue}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

            {/* Date Badge Overlay */}
            <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
              <div className="text-center">
                <div className="text-xs font-semibold text-slate-900 leading-none">
                  {new Date(race.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                </div>
                <div className="text-2xl font-bold text-slate-900 leading-tight">
                  {new Date(race.date).getDate()}
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <div className="absolute top-3 right-3">
              {race.completed ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium">
                  <CheckCircle2 size={14} className="text-white" />
                  <span className="text-white">Completed</span>
                </div>
              ) : race.cancelled ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/90 backdrop-blur-sm text-white text-xs font-medium">
                  <XCircle size={14} />
                  Cancelled
                </div>
              ) : isDateToday(race.date) ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium animate-pulse">
                  <PlayCircle size={14} className="text-white" />
                  <span className="text-white">Today</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Event Content */}
        <div className="p-4">
          {/* Action Buttons */}
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 touch-show transition-opacity">
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(race);
                }}
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  hasEventStartedScoring(race)
                    ? darkMode
                      ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                      : 'bg-white/50 text-slate-400 cursor-not-allowed'
                    : darkMode
                      ? 'bg-slate-700/90 hover:bg-slate-600 text-slate-300'
                      : 'bg-white/90 hover:bg-slate-100 text-slate-600'
                }`}
                title={hasEventStartedScoring(race) ? "Cannot edit - scoring has commenced" : "Edit event"}
                disabled={hasEventStartedScoring(race)}
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(race.id, 'quick', race.is_simulated);
                }}
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  darkMode
                    ? 'bg-red-900/90 hover:bg-red-800 text-red-400'
                    : 'bg-red-50/90 hover:bg-red-100 text-red-600'
                }`}
                title="Delete event"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {race.eventName || race.clubName}
                </h3>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}>
                  {race.raceClass}
                </div>
                {/* State/National Event badge */}
                {race.eventLevel && (race.eventLevel === 'state' || race.eventLevel === 'national') && (
                  <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    race.eventLevel === 'state'
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                      : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  }`}>
                    {race.eventLevel === 'state' ? 'State Event' : 'National Event'}
                  </div>
                )}
                {/* Completion badge for cards without images */}
                {!venueImage && race.completed && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-medium">
                    <CheckCircle2 size={12} className="text-white" />
                    <span className="text-white">Completed</span>
                  </div>
                )}
              </div>
              {/* Only show date text when there's no image */}
              {!venueImage && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                    {formatDate(race.date)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm mb-3">
            <MapPin size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            <span className={`truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {race.venue}
            </span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
            <div className="flex items-center">
              {avatars.length > 0 ? (
                <div className="flex items-center">
                  {avatars}
                  {skippers.length > 5 && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 -ml-2 ${
                      darkMode ? 'border-slate-800 bg-slate-700 text-slate-300' : 'border-white bg-slate-200 text-slate-700'
                    }`}>
                      +{skippers.length - 5}
                    </div>
                  )}
                  <span className={`ml-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {skippers.length} registered
                  </span>
                </div>
              ) : (
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  No registrations yet
                </span>
              )}
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
              race.raceFormat === 'handicap'
                ? darkMode ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800'
                : darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
            }`}>
              {race.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const initialsOf = (name: string) => {
    const parts = (name || '').trim().split(' ').filter(Boolean);
    return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : (parts[0] || '?').substring(0, 2).toUpperCase();
  };

  const faceStack = (people: any[], max: number) => (
    <span className="a-sf-stack">
      {people.slice(0, max).map((p: any, i: number) => (
        <span key={i} className="a-sf" title={p.name}>
          {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initialsOf(p.name)}
        </span>
      ))}
      {people.length > max && <span className="a-sf a-sf-more">+{people.length - max}</span>}
    </span>
  );

  const renderSeason = () => {
    const yr = selectedYear;
    const start = new Date(yr, 0, 1).getTime();
    const end = new Date(yr + 1, 0, 1).getTime();
    const pos = (d: string | Date) => Math.min(99.4, Math.max(0.6, ((new Date(d).getTime() - start) / (end - start)) * 100));
    const inYear = (d: string) => new Date(d).getFullYear() === yr;
    const now = new Date();
    const todayPos = now.getFullYear() === yr ? pos(now) : null;
    const seriesRows = sortedSeries.filter(s => s.rounds.some(r => inYear(r.date)));
    const singles = sortedQuickRaces.filter(r => inYear(r.date));
    if (seriesRows.length === 0 && singles.length === 0) return null;
    const palette = ['#8A4DFF', '#2E7BFF', '#30D158', '#FF8A2B', '#40C8C0', '#FF3E9A'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const todayLine = todayPos !== null ? <span aria-hidden="true" className="a-stl-line" style={{ left: `${todayPos}%` }} /> : null;
    return (
      <section className="a-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3.5" style={{ padding: '18px 20px' }}>
          <span className="a-tile" style={{ width: 36, height: 36 }}><CalendarRange size={18} /></span>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <h2 className="a-display a-ink m-0 text-[19px] font-semibold">{yr} season</h2>
            <p className="a-dim m-0 mt-0.5 text-[13px]">{seriesRows.length} series · {singles.length} single {singles.length === 1 ? 'event' : 'events'}</p>
          </div>
          <div className="a-mute flex flex-wrap items-center gap-3.5 text-[12px]">
            <span className="a-stl-key"><i style={{ background: '#8A4DFF' }} />Done</span>
            <span className="a-stl-key"><i style={{ background: '#FFB340' }} />Scoring</span>
            <span className="a-stl-key"><i style={{ border: '2px dashed #FFB340' }} />Not scored</span>
            <span className="a-stl-key"><i style={{ border: '2px solid currentColor', opacity: 0.6 }} />Upcoming</span>
          </div>
          {sortedSeries.length > 0 && (
            <button onClick={() => setShowRolloverModal(true)} className="a-btn a-btn-sm"><RotateCcw size={14} />Roll Over to Next Year</button>
          )}
        </div>
        <div className="a-stl">
          <div className="a-stl-lab" style={{ height: 30 }} />
          <div className="a-stl-months">
            {months.map((m, i) => <span key={m} className={todayPos !== null && i === now.getMonth() ? 'a-stl-now' : ''}>{m}</span>)}
            {todayPos !== null && <span className="a-stl-today" style={{ left: `${todayPos}%` }}>TODAY</span>}
          </div>

          {seriesRows.map((s, si) => {
            const c = palette[si % palette.length];
            const yrRounds = s.rounds.map((r, i) => ({ r, i })).filter(({ r }) => inYear(r.date));
            const later = s.rounds.filter(r => new Date(r.date).getFullYear() > yr).length;
            const done = s.rounds.filter(r => r.completed).length;
            const nextIdx = getNextUpcomingRound(s);
            const first = pos(yrRounds[0].r.date);
            const last = pos(yrRounds[yrRounds.length - 1].r.date);
            return (
              <React.Fragment key={s.id}>
                <div className="a-stl-lab cursor-pointer" style={si === 0 ? { borderLeft: `3px solid ${c}`, paddingLeft: 15 } : undefined} onClick={() => toggleSeriesExpansion(s.id)}>
                  <p className="a-ink m-0 text-[13.5px] font-semibold truncate">{s.seriesName.replace(/\s*-\s*\d{4}$/, '')}</p>
                  <div className="a-stl-meta flex items-center gap-1.5">
                    {s.raceClass && <span className={getBoatClassBadge(s.raceClass, darkMode).className}>{s.raceClass}</span>}
                    <span className={getRaceFormatBadge(s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>{s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>
                    <span className="a-dim text-[11.5px] whitespace-nowrap">{done} of {s.rounds.length}</span>
                  </div>
                </div>
                <div className="a-stl-track" style={{ ['--c' as any]: c }}>
                  <span className="a-stl-span" style={{ left: `${first}%`, width: `${Math.max(0, last - first)}%`, background: c }} />
                  {yrRounds.map(({ r, i }) => {
                    const prog = !r.completed && !r.cancelled && (r.lastCompletedRace || 0) > 0;
                    const cls = r.completed ? 'a-mk-done' : r.cancelled ? 'a-mk-x' : prog ? 'a-mk-prog' : i === nextIdx ? 'a-mk-next' : isDatePast(r.date) && !isDateToday(r.date) ? 'a-mk-pend' : 'a-mk-up';
                    return <button key={i} className={`a-mk ${cls}`} style={{ left: `${pos(r.date)}%` }} title={`${r.name} · ${fmt(r.date)}`} aria-label={`${r.name} · ${fmt(r.date)}`} onClick={() => handleRoundClick(s, i)} />;
                  })}
                  {later > 0 && <span className="a-stl-more">+{later} in {yr + 1}</span>}
                  {todayLine}
                </div>
              </React.Fragment>
            );
          })}

          {singles.length > 0 && (
            <>
              <div className="a-stl-lab">
                <p className="a-ink m-0 text-[13.5px] font-semibold">Single events</p>
                <div className="a-stl-meta flex items-center gap-1.5"><span className="a-dim text-[11.5px]">{singles.length} {singles.length === 1 ? 'event' : 'events'}</span></div>
              </div>
              <div className="a-stl-track">
                {singles.map(r => (
                  <button key={r.id} className={`a-mk a-mk-ev ${r.completed ? 'a-mk-ev-done' : ''}`} style={{ left: `${pos(r.date)}%` }} title={`${r.eventName} · ${fmt(r.date)}`} aria-label={`${r.eventName} · ${fmt(r.date)}`} onClick={() => onEventSelect(r)} />
                ))}
                {todayLine}
              </div>
            </>
          )}
        </div>
      </section>
    );
  };

  const renderSummaryCards = () => {
    if (loading || timeFilter === 'pending' || timeFilter === 'simulated') return null;
    type Item = { date: string; name: string; sub: string; open: () => void; completed: boolean; cancelled: boolean; progress: boolean };
    const items: Item[] = [];
    quickRaces.forEach(r => {
      const reg = (r.attendees || []).length;
      items.push({ date: r.date, name: r.eventName, sub: `${r.clubName || r.venue || ''}${reg ? ` · ${reg} confirmed` : ''}`, open: () => onEventSelect(r), completed: !!r.completed, cancelled: !!(r as any).cancelled, progress: (r.lastCompletedRace || 0) > 0 && !r.completed });
    });
    series.forEach(s => s.rounds.forEach((rd: any, i: number) => {
      const n = (rd.skippers || []).length;
      items.push({ date: rd.date, name: `${rd.name} - ${s.seriesName}`, sub: `${s.clubName || rd.venue || ''}${n ? ` · ${n} competitors` : ''}`, open: () => handleRoundClick(s, i), completed: !!rd.completed, cancelled: !!rd.cancelled, progress: (rd.lastCompletedRace || 0) > 0 && !rd.completed });
    }));
    const next = items.filter(x => !x.completed && !x.cancelled && !x.progress && !isDatePast(x.date)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const scoring = items.filter(x => x.progress && !x.cancelled).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (!next && !scoring) return null;
    const chip = (d: string) => {
      const dt = new Date(d);
      return <div className="a-dc" style={{ width: 52 }}><b>{dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</b><span>{dt.getDate()}</span></div>;
    };
    const inDays = (d: string) => {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      const dt = new Date(d); dt.setHours(0, 0, 0, 0);
      const n = Math.round((dt.getTime() - t.getTime()) / 86400000);
      return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
    };
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-[22px]">
        {next && (
          <div className="a-card flex items-center gap-4" style={{ padding: '16px 18px' }}>
            {chip(next.date)}
            <div className="flex-1 min-w-0">
              <p className="a-cap a-txt-b m-0">Next race day · {inDays(next.date)}</p>
              <p className="a-ink m-0 mt-1 text-[15px] font-semibold truncate">{next.name}</p>
              {next.sub && <p className="a-dim m-0 mt-0.5 text-[12.5px] truncate">{next.sub}</p>}
            </div>
            <button onClick={next.open} className="a-btn a-btn-p">Start scoring</button>
          </div>
        )}
        {scoring && (
          <div className="a-card flex items-center gap-4" style={{ padding: '16px 18px', borderColor: 'rgba(255,179,64,0.3)' }}>
            {chip(scoring.date)}
            <div className="flex-1 min-w-0">
              <p className="a-cap a-txt-a m-0">Scoring in progress</p>
              <p className="a-ink m-0 mt-1 text-[15px] font-semibold truncate">{scoring.name}</p>
              {scoring.sub && <p className="a-dim m-0 mt-0.5 text-[12.5px] truncate">{scoring.sub}</p>}
            </div>
            <button onClick={scoring.open} className="a-btn a-btn-p">Continue scoring</button>
          </div>
        )}
      </div>
    );
  };

  const renderSeriesCard = (s: RaceSeries) => {
    const completedRounds = s.rounds.filter(r => r.completed).length;
    const totalRounds = s.rounds.length;
    const isExpanded = expandedSeries === s.id;
    const nextRoundIndex = getNextUpcomingRound(s);

    const allParticipants = s.rounds.reduce((acc: any[], round) => {
      const roundParticipants = (round.skippers && round.skippers.length > 0) ? round.skippers : (round.attendees || []);
      roundParticipants.forEach(participant => {
        if (!acc.find(p => p.name === participant.name)) acc.push(participant);
      });
      return acc;
    }, []);

    const fullyDone = isSeriesFullyCompleted(s);

    return (
      <section className={`a-card overflow-hidden ${s.completed ? 'opacity-80' : ''}`}>
        <div className="flex flex-wrap items-center gap-3.5 cursor-pointer" style={{ padding: '18px 20px' }} onClick={() => toggleSeriesExpansion(s.id)}>
          <div className="flex-1" style={{ minWidth: 260 }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="a-display a-ink m-0 text-[19px] font-semibold">{s.seriesName}</h2>
              {s.raceClass && <span className={getBoatClassBadge(s.raceClass, darkMode).className}>{s.raceClass}</span>}
              <span className={getRaceFormatBadge(s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>{s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}</span>
              {s.completed && <span className="a-st a-txt-g text-[12.5px]"><span className="a-light a-light-g" />Completed</span>}
            </div>
            <div className="a-mute flex items-center gap-3.5 mt-2 text-[13px] flex-wrap">
              {allParticipants.length > 0 ? <span className="inline-flex items-center gap-2.5">{faceStack(allParticipants, 4)}{allParticipants.length} registered</span> : <span>No registrations yet</span>}
              <span>·</span>
              <span>{completedRounds} of {totalRounds} rounds</span>
              {s.clubName && <><span>·</span><span className="truncate">{s.clubName}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                const seriesEvent: RaceEvent = {
                  id: s.id,
                  eventName: s.seriesName,
                  clubName: s.clubName,
                  date: s.rounds[0]?.date || new Date().toISOString(),
                  venue: s.rounds[0]?.venue || '',
                  raceClass: s.raceClass,
                  raceFormat: s.raceFormat,
                  isSeriesEvent: true,
                  seriesId: s.id,
                  clubId: s.clubId
                };
                handleEditClick(seriesEvent);
              }}
              className="a-ib disabled:opacity-40 disabled:cursor-not-allowed"
              title={fullyDone ? 'Cannot edit - all rounds completed' : 'Edit series'}
              aria-label="Edit series"
              disabled={fullyDone}
            >
              <Edit2 size={16} />
            </button>
            <button onClick={() => handleDeleteClick(s.id, 'series')} className="a-ib a-ib-d" title="Delete series" aria-label="Delete series">
              <Trash2 size={16} />
            </button>
            <button onClick={() => toggleSeriesExpansion(s.id)} className="a-ib" aria-label={isExpanded ? 'Hide rounds' : 'Show rounds'} title={isExpanded ? 'Hide rounds' : 'Show rounds'}>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        {isExpanded && s.rounds.length > 0 && (
          <div>
            <div className="a-rw a-rw-h"><span className="a-cap">Round</span><span className="a-cap">Date</span><span className="a-cap">Status</span><span className="a-cap max-md:hidden">Competitors</span><span /></div>
            {getSortedRounds(s).map((round, index) => {
              const isPastDate = isDatePast(round.date);
              const isToday = isDateToday(round.date);
              const originalIndex = s.rounds.findIndex(r => r.name === round.name);
              const isNextRound = originalIndex === nextRoundIndex;
              const inProgress = !round.completed && !round.cancelled && (round.lastCompletedRace || 0) > 0;
              const notScored = !round.completed && !round.cancelled && !inProgress && isPastDate && !isToday;
              const people = (round.skippers && round.skippers.length > 0) ? round.skippers : (round.attendees || []);
              const label = round.completed ? 'Results' : inProgress ? 'Continue scoring' : (notScored || isToday) ? 'Start scoring' : 'Open';
              const open = () => { if (!round.cancelled) handleRoundClick(s, originalIndex); };
              return (
                <div key={index} onClick={open} className={`a-rw ${inProgress ? 'a-rw-prog' : ''} ${round.cancelled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <span className="a-ink font-semibold truncate">{round.name}</span>
                  <span className="a-mute text-[13px]">{new Date(round.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="flex items-center gap-2 flex-wrap">
                    {round.completed ? (
                      <span className="a-st a-txt-g"><span className="a-light a-light-g" />Completed</span>
                    ) : round.cancelled ? (
                      <span className="a-st a-txt-r"><span className="a-light a-light-r" />Cancelled</span>
                    ) : inProgress ? (
                      <span className="a-st a-txt-a"><span className="a-light a-light-a" />Scoring</span>
                    ) : notScored ? (
                      <span className="a-st a-txt-a"><span className="a-ring-dot a-ring-dot-a" />Not scored</span>
                    ) : isNextRound ? (
                      <span className="a-st a-txt-b"><span className="a-light a-light-b" />Up next</span>
                    ) : (
                      <span className="a-st a-mute"><span className="a-ring-dot" />Upcoming</span>
                    )}
                    {s.enableLiveTracking && !round.completed && !round.cancelled && isToday && (
                      <span className="a-st a-txt-b text-[12px]" title="Live Tracking enabled"><Radio size={12} />Live</span>
                    )}
                  </span>
                  <span className="a-mute flex items-center gap-2.5 text-[13px] max-md:hidden">
                    {people.length > 0 ? <>{faceStack(people, 3)}{people.length} {round.skippers && round.skippers.length > 0 ? 'competing' : 'registered'}</> : <span className="a-dim">No entries</span>}
                  </span>
                  <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {!round.cancelled && <button onClick={open} className={`a-btn a-btn-sm ${inProgress ? 'a-btn-p' : ''}`}>{label}</button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-16 lg:pl-9">
        {/* Offline/Cached Data Banner */}
        {(!navigator.onLine || usingCachedData) && (
          <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
            <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="text-amber-300 font-medium mb-1">
                {!navigator.onLine ? 'Working Offline' : 'Using Cached Data'}
              </h3>
              <p className="text-sm text-amber-200/80">
                {!navigator.onLine
                  ? "You're currently offline. Viewing cached data from your last sync. Changes will be saved locally and synced when you reconnect."
                  : "Connection temporarily unavailable. Showing cached data. Trying to reconnect in the background..."
                }
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center gap-4 mb-[22px]">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Flag size={22} /></span>
          <div className="flex-1" style={{ minWidth: 180 }}>
            <h1 className="a-display a-ink m-0 text-[32px] font-semibold leading-[1.1]">Race Management</h1>
            <p className="a-mute mt-0.5 text-[14px]">
              {quickRaces.length + series.length} {quickRaces.length + series.length === 1 ? 'event' : 'events'} total
            </p>
          </div>

          {/* Toolbar */}
          <div className="a-tbar">
            {showSearch ? (
              <div className="a-field" style={{ height: 36, width: 240 }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search events…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => !searchTerm && setShowSearch(false)}
                  autoFocus
                />
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="a-tb-btn" style={{ width: 36, padding: 0, justifyContent: 'center' }} title="Search" aria-label="Search">
                <Search size={17} />
              </button>
            )}
            <span className="a-tb-sep" />

            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button onClick={() => setShowSortDropdown(!showSortDropdown)} className="a-tb-btn">
                <ArrowUpDown size={15} />Sort<ChevronDown size={15} className="a-dim" />
              </button>
              {showSortDropdown && (
                <div className="a-pop absolute right-0 mt-2 w-56 z-50" style={{ padding: 6 }}>
                  {[
                    { value: 'date-asc', label: 'Date (oldest first)' },
                    { value: 'date-desc', label: 'Date (newest first)' },
                    { value: 'name-asc', label: 'Name (A–Z)' },
                    { value: 'name-desc', label: 'Name (Z–A)' },
                    { value: 'status', label: 'Status' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value as SortOption);
                        setShowSortDropdown(false);
                      }}
                      className={`a-pop-item ${sortBy === option.value ? 'a-pop-item-on' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Dropdown */}
            <div className="relative" ref={filterDropdownRef}>
              <button onClick={() => setShowFilterDropdown(!showFilterDropdown)} className="a-tb-btn">
                <Filter size={15} />Filters
                {(filterFormat !== 'all' || filterClass !== 'all' || filterEventType !== 'all') && <span className="a-light a-light-b" />}
                <ChevronDown size={15} className="a-dim" />
              </button>
              {showFilterDropdown && (
                <div className="a-pop absolute right-0 mt-2 w-80 z-50 flex flex-col gap-3" style={{ padding: 14 }}>
                  <div>
                    <p className="a-cap mb-2">Race type</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterFormat(filterFormat === 'scratch' ? 'all' : 'scratch')} className={`a-fchip ${filterFormat === 'scratch' ? 'a-fchip-on' : ''}`}>Scratch</button>
                      <button onClick={() => setFilterFormat(filterFormat === 'handicap' ? 'all' : 'handicap')} className={`a-fchip ${filterFormat === 'handicap' ? 'a-fchip-on' : ''}`}>Handicap</button>
                    </div>
                  </div>
                  <div className="a-pop-rule" style={{ margin: 0 }} />
                  <div>
                    <p className="a-cap mb-2">Class</p>
                    <div className="flex flex-wrap gap-1.5">
                      {boatClasses.map(boatClass => (
                        <button key={boatClass} onClick={() => setFilterClass(filterClass === boatClass ? 'all' : boatClass)} className={`a-fchip ${filterClass === boatClass ? 'a-fchip-on' : ''}`}>
                          {boatClass}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="a-pop-rule" style={{ margin: 0 }} />
                  <div>
                    <p className="a-cap mb-2">Event type</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => setFilterEventType(filterEventType === 'single' ? 'all' : 'single')} className={`a-fchip ${filterEventType === 'single' ? 'a-fchip-on' : ''}`}><Trophy size={13} />Single events</button>
                      <button onClick={() => setFilterEventType(filterEventType === 'series' ? 'all' : 'series')} className={`a-fchip ${filterEventType === 'series' ? 'a-fchip-on' : ''}`}><Calendar size={13} />Race series</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <span className="a-tb-sep" />

            {/* View Toggle */}
            <div className="a-seg" style={{ padding: 2, borderRadius: 10 }}>
              <button onClick={() => setViewMode('grid')} className={`a-seg-i ${viewMode === 'grid' ? 'a-seg-on' : ''}`} style={{ width: 34, height: 30, padding: 0, justifyContent: 'center', borderRadius: 8 }} title="Grid view" aria-label="Grid view">
                <Grid size={16} />
              </button>
              <button onClick={() => setViewMode('list')} className={`a-seg-i ${viewMode === 'list' ? 'a-seg-on' : ''}`} style={{ width: 34, height: 30, padding: 0, justifyContent: 'center', borderRadius: 8 }} title="List view" aria-label="List view">
                <List size={16} />
              </button>
            </div>
          </div>

          {/* New Event Button */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowDropdown(!showDropdown)} className="a-btn a-btn-p" style={{ height: 44, padding: '0 14px 0 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={2.4} />New Event<ChevronDown size={17} style={{ marginLeft: 2, opacity: 0.85 }} />
            </button>
            {showDropdown && (
              <div className="a-pop absolute right-0 mt-2 w-72 z-50" style={{ padding: 6 }}>
                <button onClick={() => { setShowDropdown(false); handleCreateClick('quick'); }} className="a-pop-item" style={{ padding: 10 }}>
                  <span className="a-tile" style={{ width: 36, height: 36 }}><Trophy size={17} /></span>
                  <div className="min-w-0">
                    <div className="a-ink text-[14px] font-semibold">Single event</div>
                    <div className="a-dim text-[12px]">Create a standalone race event</div>
                  </div>
                </button>
                <button onClick={() => { setShowDropdown(false); handleCreateClick('series'); }} className="a-pop-item" style={{ padding: 10 }}>
                  <span className="a-tile" style={{ width: 36, height: 36 }}><Calendar size={17} /></span>
                  <div className="min-w-0">
                    <div className="a-ink text-[14px] font-semibold">Race series</div>
                    <div className="a-dim text-[12px]">Create a multi-round race series</div>
                  </div>
                </button>
                <div className="a-pop-rule" />
                <button onClick={() => { setShowDropdown(false); setShowSimulationModal(true); }} className="a-pop-item" style={{ padding: 10 }}>
                  <span className="a-tile" style={{ width: 36, height: 36 }}><FlaskConical size={17} /></span>
                  <div className="min-w-0">
                    <div className="a-ink text-[14px] font-semibold">Event simulation</div>
                    <div className="a-dim text-[12px]">Import HMS data or create a test event</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters Section */}
        <div className="flex flex-wrap items-center gap-3 mb-[22px]">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="a-inp font-semibold"
            style={{ width: 'auto', height: 40, minWidth: 96 }}
            aria-label="Season year"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <div className="a-seg overflow-x-auto" role="tablist" aria-label="Event filter" style={{ flexWrap: 'nowrap' }}>
            {[
              { value: 'all', label: 'All Events', count: quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear).length + series.filter(s => s.rounds.some(r => new Date(r.date).getFullYear() === selectedYear)).length },
              { value: 'upcoming', label: 'Upcoming', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => !isDatePast(e.date) && !e.completed).length },
              { value: 'past', label: 'Past', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => isDatePast(e.date) && !e.completed).length },
              { value: 'completed', label: 'Completed', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => e.completed).length },
              { value: 'pending', label: 'Pending', count: pendingEvents.length },
              { value: 'simulated', label: 'Simulated Events', count: simulatedEvents.length },
            ].map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={timeFilter === tab.value}
                onClick={() => setTimeFilter(tab.value as TimeFilter)}
                className={`a-seg-i ${timeFilter === tab.value ? 'a-seg-on' : ''}`}
              >
                {tab.label}<span className="a-cnt">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {renderSummaryCards()}

        {/* Content */}
        {loading ? (
          <div className={`
            text-center py-12 rounded-lg border
            ${darkMode
              ? 'bg-slate-700/50 border-slate-600 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'}
          `}>
            Loading events...
          </div>
        ) : filteredQuickRaces.length === 0 && filteredSeries.length === 0 && timeFilter !== 'pending' && timeFilter !== 'simulated' ? (
          <div className={`
            text-center py-16 rounded-xl border
            ${darkMode
              ? 'bg-slate-800/50 border-slate-700 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'}
          `}>
            <div className={`inline-flex p-4 rounded-full mb-4 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
              <Trophy size={48} className="opacity-30" />
            </div>
            <p className="text-lg font-medium mb-2">No Events Found</p>
            <p className="text-sm mb-6">
              {searchTerm || filterClass !== 'all' || filterFormat !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first race or series to get started'}
            </p>

            {searchTerm || filterClass !== 'all' || filterFormat !== 'all' ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterClass('all');
                  setFilterFormat('all');
                  setTimeFilter('all');
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-lg"
              >
                Clear Filters
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => handleCreateClick('quick')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-lg"
                >
                  <Trophy size={18} />
                  Create Single Event
                </button>
                <button
                  onClick={() => handleCreateClick('series')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors shadow-lg"
                >
                  <Calendar size={18} />
                  Create Race Series
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-[22px]">
            {/* Pending Events Section */}
            {timeFilter === 'pending' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="a-tile" style={{ width: 36, height: 36 }}><Clock size={18} /></span>
                  <div>
                    <h2 className="a-display a-ink m-0 text-[19px] font-semibold">
                      Pending Approval
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Events awaiting state/national approval
                    </p>
                  </div>
                </div>

                {pendingEvents.length === 0 ? (
                  <div className={`text-center py-12 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <Clock size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                    <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      No pending events
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {pendingEvents.map(event => {
                      // Debug log to see what data we have
                      if (!event.id) console.error('Event missing id:', event);

                      return (
                        <div
                          key={event.id}
                          className={`p-6 rounded-lg border-2 cursor-pointer transition-all hover:shadow-lg ${
                            darkMode
                              ? 'bg-slate-800 border-amber-600/30 hover:border-amber-500/50'
                              : 'bg-white border-amber-200 hover:border-amber-300'
                          }`}
                          onClick={() => {
                            console.log('Clicking event:', event);
                            setSelectedPendingEvent(event);
                            setShowPendingEventModal(true);
                          }}
                        >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {event.event_name}
                              </h3>
                              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-600/20 text-amber-400 border border-amber-600/30">
                                {event.event_level === 'state' ? 'State Event' : 'National Event'}
                              </span>
                              {/* Approval status badges */}
                              {event.approval_status === 'pending' && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-600/30">
                                  Pending State Approval
                                </span>
                              )}
                              {event.approval_status === 'pending_state' && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-600/30">
                                  Pending State Approval
                                </span>
                              )}
                              {event.approval_status === 'pending_national' && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-600/20 text-purple-400 border border-purple-600/30">
                                  Pending National Approval
                                </span>
                              )}
                              {event.approval_status === 'rejected' && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-600/20 text-red-400 border border-red-600/30">
                                  Rejected
                                </span>
                              )}
                              {event.approval_status === 'withdrawn' && (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-600/20 text-gray-400 border border-gray-600/30">
                                  Withdrawn
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm">
                              {event.date && (
                                <div className="flex items-center gap-2">
                                  <Calendar size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                    {new Date(event.date).toLocaleDateString('en-AU', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                              )}
                              {event.venue && (
                                <div className="flex items-center gap-2">
                                  <MapPin size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                    {event.venue}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {/* Show approve/reject buttons for associations */}
                            {currentOrganization && (
                              (currentOrganization.type === 'state' && (event.approval_status === 'pending_state' || event.approval_status === 'pending')) ||
                              (currentOrganization.type === 'national' && event.approval_status === 'pending_national')
                            ) && (
                              <div className="flex gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setSelectedPendingEvent(event);
                                    setShowPendingEventModal(true);
                                  }}
                                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                >
                                  <FileText size={16} />
                                  View Details
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Approve button clicked for event:', event);
                                    handleApproveEvent(event.id, event.event_level);
                                  }}
                                  className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                >
                                  <CheckCircle2 size={16} />
                                  Approve
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRejectEvent(event.id);
                                  }}
                                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                >
                                  <XCircle size={16} />
                                  Reject
                                </button>
                              </div>
                            )}

                            {/* Show withdraw/edit/delete buttons for clubs */}
                            {!currentOrganization && (
                              <div className="flex gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
                                {(event.approval_status === 'pending' || event.approval_status === 'pending_state' || event.approval_status === 'pending_national') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleWithdrawEvent(event.id);
                                    }}
                                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                    title="Withdraw from approval process"
                                  >
                                    <RotateCcw size={16} />
                                    Withdraw
                                  </button>
                                )}
                                {event.approval_status === 'withdrawn' && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditWithdrawnEvent(event);
                                      }}
                                      className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Edit event"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingEventToDelete(event);
                                        setShowDeletePendingConfirm(true);
                                      }}
                                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Delete event"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResubmitEvent(event.id);
                                      }}
                                      className="btn-primary-green px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Resubmit for approval"
                                    >
                                      <Send size={16} />
                                      Resubmit
                                    </button>
                                  </>
                                )}
                                {event.approval_status === 'rejected' && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditWithdrawnEvent(event);
                                      }}
                                      className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Edit event"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingEventToDelete(event);
                                        setShowDeletePendingConfirm(true);
                                      }}
                                      className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Delete event"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResubmitEvent(event.id);
                                      }}
                                      className="btn-primary-green px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                      title="Resubmit for approval"
                                    >
                                      <Send size={16} />
                                      Resubmit
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {event.created_at && (
                              <>
                                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  Submitted
                                </p>
                                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                  {new Date(event.created_at).toLocaleDateString('en-AU', {
                                    day: 'numeric',
                                    month: 'short'
                                  })}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Simulated Events Section */}
            {timeFilter === 'simulated' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="a-tile" style={{ width: 36, height: 36 }}><FlaskConical size={18} /></span>
                  <div>
                    <h2 className="a-display a-ink m-0 text-[19px] font-semibold">
                      Simulated Events
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Events created via the HMS Simulation tool
                    </p>
                  </div>
                </div>

                {simulatedEvents.length === 0 ? (
                  <div className={`text-center py-12 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <FlaskConical size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                    <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      No simulated events
                    </p>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                      Use the HMS Simulation tool to create test events
                    </p>
                  </div>
                ) : (
                  <div className={`grid gap-6 items-start ${
                    viewMode === 'grid'
                      ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                      : 'grid-cols-1'
                  }`}>
                    {simulatedEvents.map((event) => (
                      <React.Fragment key={event.id}>
                        {renderEventCard(event)}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Season timeline + series */}
            {timeFilter !== 'pending' && timeFilter !== 'simulated' && (timeFilter === 'all' || timeFilter === 'upcoming') && !searchTerm && renderSeason()}

            {timeFilter !== 'pending' && timeFilter !== 'simulated' && sortedSeries.length > 0 && (
              <div className="flex flex-col gap-4">
                {sortedSeries.map((s) => (
                  <React.Fragment key={s.id}>
                    {renderSeriesCard(s)}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Separator between Series and Single Events */}
            {timeFilter !== 'pending' && timeFilter !== 'simulated' && sortedSeries.length > 0 && Object.entries(groupedSingleEvents).length > 0 && (
              <div className="a-month-rule" />
            )}

            {/* Single Events Section */}
            {timeFilter !== 'pending' && timeFilter !== 'simulated' && Object.entries(groupedSingleEvents).length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="a-tile" style={{ width: 36, height: 36 }}><Trophy size={18} /></span>
                  <div>
                    <h2 className="a-display a-ink m-0 text-[19px] font-semibold">
                      Single Events
                    </h2>
                    <p className="a-dim m-0 mt-0.5 text-[13px]">
                      {sortedQuickRaces.length} {sortedQuickRaces.length === 1 ? 'event' : 'events'}
                    </p>
                  </div>
                </div>
                <div className="space-y-8">
                  {Object.entries(groupedSingleEvents).sort(([a], [b]) => a.localeCompare(b)).map(([monthKey, events]) => {
                    const [year, month] = monthKey.split('-');
                    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long' });

                    return (
                      <div key={monthKey}>
                        {/* Month Header */}
                        <div className="flex items-baseline gap-3 mb-4">
                          <h3 className="a-display a-ink m-0 text-[17px] font-semibold">
                            {monthName}
                          </h3>
                          <span className="a-dim text-[14px]">
                            {year}
                          </span>
                        </div>

                        {/* Events Grid */}
                        <div className={`grid gap-6 items-start ${
                          viewMode === 'grid'
                            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                            : 'grid-cols-1'
                        }`}>
                          {events.map(renderEventCard)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && createType && (
        <CreateRaceModal
          type={createType}
          darkMode={darkMode}
          onClose={() => {
            setShowCreateModal(false);
            setCreateType(null);
          }}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showEditModal === 'quick' && editingEvent && (
        <CreateRaceModal
          type="quick"
          darkMode={darkMode}
          onClose={() => {
            setShowEditModal(null);
            setEditingEvent(null);
          }}
          onSuccess={async () => {
            setShowEditModal(null);
            setEditingEvent(null);
            // Small delay to ensure data is persisted before refreshing
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchRaces();
          }}
          editingEvent={editingEvent}
        />
      )}

      {showEditModal === 'series' && editingEvent && editingEvent.seriesId && (
        <CreateRaceModal
          type="series"
          darkMode={darkMode}
          onClose={() => {
            setShowEditModal(null);
            setEditingEvent(null);
          }}
          onSuccess={async () => {
            setShowEditModal(null);
            setEditingEvent(null);
            // Small delay to ensure data is persisted before refreshing
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchRaces();
          }}
          editingSeries={series.find(s => s.id === editingEvent.seriesId)}
        />
      )}

      {showSimulationModal && (
        <EventSimulationModal
          darkMode={darkMode}
          onClose={() => setShowSimulationModal(false)}
          onSuccess={async (event) => {
            setShowSimulationModal(false);
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchRaces();
            if (isRaceOfficer && !currentClub) {
              // Standalone race officers: save event and stay on management page
            } else {
              handleStartScoring(event);
            }
          }}
        />
      )}

      {showLiveTrackingQR && selectedEventForTracking && currentClub && (
        <LiveTrackingQRCodeModal
          eventId={selectedEventForTracking.id}
          eventName={selectedEventForTracking.eventName || 'Event'}
          clubId={currentClub.clubId}
          onClose={() => {
            setShowLiveTrackingQR(false);
            setSelectedEventForTracking(null);
          }}
        />
      )}

      {showEventWebsiteModal && selectedEventForWebsite && (
        <EventWebsiteSettingsModal
          eventId={selectedEventForWebsite.id}
          eventName={selectedEventForWebsite.eventName || 'Event'}
          onClose={() => {
            setShowEventWebsiteModal(false);
            setSelectedEventForWebsite(null);
          }}
          onSaved={() => {
            addNotification('Event website settings saved successfully', 'success');
          }}
          onOpenDashboard={() => {
            setShowEventWebsiteModal(false);
            navigate(`/event-websites/${selectedEventForWebsite.id}`);
          }}
        />
      )}

      {showEventWebsiteDashboard && selectedEventForWebsite && (
        <EventWebsiteDashboard
          eventId={selectedEventForWebsite.id}
          eventName={selectedEventForWebsite.eventName || 'Event'}
          onClose={() => {
            setShowEventWebsiteDashboard(false);
            setSelectedEventForWebsite(null);
          }}
        />
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          darkMode={darkMode}
          onStartScoring={(event) => handleStartScoring(event)}
          onClose={() => {
            onEventSelect(null);
            fetchRaces(); // Refresh races when closing event details
          }}
          onViewVenue={(venueName) => setSelectedVenueName(venueName)}
          onEventDataUpdated={() => fetchRaces()} // Refresh races when event data is updated
        />
      )}

      {selectedVenueName && (
        <VenueDetails
          venueName={selectedVenueName}
          darkMode={darkMode}
          onClose={() => setSelectedVenueName(null)}
        />
      )}

      {showRolloverModal && (
        <SeriesRolloverModal
          isOpen={showRolloverModal}
          onClose={() => setShowRolloverModal(false)}
          darkMode={darkMode}
          series={series}
          onComplete={async () => {
            const updatedSeries = await getStoredRaceSeries();
            setSeries(updatedSeries);
          }}
        />
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={handleDeleteModalClose}
        onConfirm={handleConfirmDelete}
        title={`Delete ${itemToDelete?.type === 'quick' ? 'Race' : 'Series'}`}
        message={`Are you sure you want to delete this ${itemToDelete?.type === 'quick' ? 'race' : 'series'}? All results and scores will be permanently removed. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      <ConfirmationModal
        isOpen={showDeletePendingConfirm}
        onClose={() => {
          setShowDeletePendingConfirm(false);
          setPendingEventToDelete(null);
        }}
        onConfirm={async () => {
          if (!pendingEventToDelete) return;
          try {
            const { error } = await supabase
              .from('public_events')
              .delete()
              .eq('id', pendingEventToDelete.id);

            if (error) throw error;

            addNotification('success', 'Event deleted successfully');
            setShowDeletePendingConfirm(false);
            setPendingEventToDelete(null);
            setShowPendingEventModal(false);
            await loadPendingEvents();
          } catch (error) {
            console.error('Error deleting event:', error);
            addNotification('error', 'Failed to delete event');
          }
        }}
        title={pendingEventToDelete?.approval_status === 'rejected' ? 'Delete Event' : 'Cancel Event'}
        message={
          pendingEventToDelete?.approval_status === 'rejected'
            ? 'Are you sure you want to delete this rejected event? This cannot be undone.'
            : 'Are you sure you want to cancel this pending event? This cannot be undone.'
        }
        confirmText={pendingEventToDelete?.approval_status === 'rejected' ? 'Delete' : 'Cancel Event'}
        cancelText="Go Back"
        darkMode={darkMode}
      />

      {/* Pending Event Details Modal */}
      {showPendingEventModal && selectedPendingEvent && (() => {
        // Convert public_events record to RaceEvent format for EventDetails
        const eventForDisplay: RaceEvent = {
          id: selectedPendingEvent.id,
          publicEventId: selectedPendingEvent.id,
          eventName: selectedPendingEvent.event_name,
          clubName: typeof selectedPendingEvent.club === 'object' ? selectedPendingEvent.club.name : (selectedPendingEvent.club || ''),
          date: selectedPendingEvent.date,
          venue: selectedPendingEvent.venue || '',
          raceClass: selectedPendingEvent.race_class || '',
          raceFormat: selectedPendingEvent.race_format || 'pursuit',
          raceResults: [],
          skippers: [],
          lastCompletedRace: 0,
          hasDeterminedInitialHcaps: false,
          isManualHandicaps: false,
          completed: false,
          multiDay: selectedPendingEvent.multi_day || false,
          numberOfDays: selectedPendingEvent.number_of_days || 1,
          endDate: selectedPendingEvent.end_date || undefined,
          currentDay: 1,
          isPaid: selectedPendingEvent.is_paid || false,
          entryFee: selectedPendingEvent.entry_fee || undefined,
          noticeOfRaceUrl: selectedPendingEvent.notice_of_race_url || undefined,
          sailingInstructionsUrl: selectedPendingEvent.sailing_instructions_url || undefined,
          isInterclub: selectedPendingEvent.is_interclub || false,
          otherClubName: selectedPendingEvent.other_club_name || undefined,
          eventLevel: selectedPendingEvent.event_level || 'club',
          clubId: selectedPendingEvent.club_id || undefined,
          media: selectedPendingEvent.media || []
        };

        return (
          <EventDetails
            event={eventForDisplay}
            darkMode={darkMode}
            onClose={() => {
              setShowPendingEventModal(false);
              setSelectedPendingEvent(null);
              loadPendingEvents(); // Refresh pending events when closing
            }}
            onEventDataUpdated={() => loadPendingEvents()}
          />
        );
      })()}


      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md rounded-xl ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <div className={`px-6 py-4 border-b ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Reject Event
              </h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Please provide a reason for rejecting this event
              </p>
            </div>

            <div className="p-6">
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Rejection Reason *
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this event is being rejected..."
                rows={4}
                className={`w-full px-4 py-3 rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
                autoFocus
              />
              <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                This reason will be visible to the club that submitted the event
              </p>
            </div>

            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectingEventId(null);
                  setRejectReason('');
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmRejectEvent}
                disabled={!rejectReason.trim()}
                className={`px-4 py-2 rounded-lg transition-colors text-white ${
                  rejectReason.trim()
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-red-600/50 cursor-not-allowed'
                }`}
              >
                Reject Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};