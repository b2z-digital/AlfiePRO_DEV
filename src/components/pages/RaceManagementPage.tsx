import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy, Plus, Edit2, Trash2, Calendar, MapPin, Search, Filter, ChevronDown, ChevronUp, Grid, List, AlertTriangle, Flag, ArrowUpDown, Users, CheckCircle2, Clock, XCircle, PlayCircle, Sailboat, TrendingUp, QrCode, FileText, Globe, RotateCcw, Edit, Send, Radio } from 'lucide-react';
import { RaceType } from '../../types';
import { RaceEvent, RaceSeries } from '../../types/race';
import { getStoredRaceEvents, getStoredRaceSeries, deleteRaceEvent, deleteRaceSeries, setCurrentEvent } from '../../utils/raceStorage';
import { getStoredVenues } from '../../utils/venueStorage';
import { Venue } from '../../types/venue';
import { formatDate } from '../../utils/date';
import { ConfirmationModal } from '../ConfirmationModal';
import { boatTypeColors, defaultColorScheme } from '../../constants/colors';
import { CreateRaceModal } from './CreateRaceModal';
import { EventDetails } from '../EventDetails';
import { VenueDetails } from '../VenueDetails';
import { SingleEventManagement } from '../SingleEventManagement';
import { RaceSeries as RaceSeriesComponent } from '../RaceSeries';
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

type TimeFilter = 'all' | 'upcoming' | 'past' | 'completed' | 'pending';
type SortOption = 'date-asc' | 'date-desc' | 'name-asc' | 'name-desc' | 'status';

export const RaceManagementPage: React.FC<RaceManagementPageProps> = ({
  darkMode,
  selectedEvent,
  onEventSelect,
  onStartScoring
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentClub, currentOrganization, user } = useAuth();
  const { addNotification } = useNotifications();

  // DIAGNOSTIC: Log when component mounts
  console.log('🎯 [RaceManagementPage] Component rendered, currentClub:', currentClub?.clubId, currentClub?.name);

  // Check if we should start on the pending tab (from navigation state)
  const initialTimeFilter = (location.state as any)?.activeTab === 'pending' ? 'pending' : 'upcoming';

  const [quickRaces, setQuickRaces] = useState<RaceEvent[]>([]);
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
        // Find and expand the series
        const foundSeries = series.find(s => s.id === navState.seriesId);
        if (foundSeries) {
          setExpandedSeries(foundSeries.id);
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

      // Also fetch approved state/national public events to display
      let publicEvents: RaceEvent[] = [];
      try {
        // Use centralized getPublicEvents function which includes registrations
        const approvedPublicEvents = await getPublicEvents(
          false, // only approved events
          currentOrganization?.type as 'state' | 'national' | undefined,
          currentOrganization?.id
        );

        if (approvedPublicEvents) {
          // Use convertToRaceEvent which includes registrations as attendees
          publicEvents = approvedPublicEvents.map(pe => convertToRaceEvent(pe));

          // Fetch local copies of public events (for scoring data)
          // These are quick_races entries with public_event_id set
          if (currentClub?.clubId) {
            try {
              const { data: localCopies } = await supabase
                .from('quick_races')
                .select('id, public_event_id, skippers, race_results, last_completed_race, completed')
                .eq('club_id', currentClub.clubId)
                .not('public_event_id', 'is', null);

              console.log('📋 [fetchRaces] Found', localCopies?.length || 0, 'local copies of public events');

              // Merge local copy data into public events
              if (localCopies && localCopies.length > 0) {
                publicEvents = publicEvents.map(pe => {
                  const localCopy = localCopies.find(lc => lc.public_event_id === pe.publicEventId);
                  if (localCopy) {
                    console.log(`✅ [fetchRaces] Merging local copy data for ${pe.eventName}:`, {
                      skipperCount: localCopy.skippers?.length || 0,
                      resultCount: localCopy.race_results?.length || 0,
                      lastCompletedRace: localCopy.last_completed_race || 0
                    });
                    return {
                      ...pe,
                      id: localCopy.id, // Use local copy ID for scoring actions
                      skippers: localCopy.skippers || pe.skippers || [],
                      raceResults: localCopy.race_results || [],
                      lastCompletedRace: localCopy.last_completed_race || 0,
                      completed: localCopy.completed || false
                    };
                  }
                  return pe;
                });
              }
            } catch (err) {
              console.error('Error fetching local copies of public events:', err);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching public events:', err);
      }

      // Combine club events with approved public events
      // For state/national associations, only show public events (not club events)
      const allRaceEvents = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? publicEvents
        : [...raceEvents, ...publicEvents];

      // Filter out series events from quickRaces
      const standaloneRaces = allRaceEvents.filter(event => !event.isSeriesEvent);

      // Enrich with attendance data and skippers (with longer timeouts and better error handling)
      let enrichedRaces = standaloneRaces;
      // For state/national associations, don't show club series
      let enrichedSeries = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? []
        : raceSeries;

      try {
        console.log('🚀 [fetchRaces] About to call enrichEventsWithAttendance with', standaloneRaces.length, 'events');
        enrichedRaces = await enrichEventsWithAttendance(standaloneRaces);
        console.log('✅ [fetchRaces] enrichEventsWithAttendance completed successfully');
      } catch (err) {
        console.error('❌ [fetchRaces] Error enriching races with attendance, using base data:', err);
        enrichedRaces = standaloneRaces;
      }

      // Only enrich series if not an association (enrichedSeries will be empty array for associations)
      if (enrichedSeries.length > 0) {
        try {
          console.log('🚀 [fetchRaces] About to call enrichSeriesWithAttendance');
          enrichedSeries = await enrichSeriesWithAttendance(enrichedSeries);
          console.log('✅ [fetchRaces] enrichSeriesWithAttendance completed successfully');
        } catch (err) {
          console.error('❌ [fetchRaces] Error enriching series with attendance, using base data:', err);
          // Keep enrichedSeries as is (already filtered)
        }

        try {
          console.log('🚀 [fetchRaces] About to call enrichSeriesWithSkippers');
          enrichedSeries = await enrichSeriesWithSkippers(enrichedSeries);
          console.log('✅ [fetchRaces] enrichSeriesWithSkippers completed successfully');
        } catch (err) {
          console.error('❌ [fetchRaces] Error enriching series with skippers, using base data:', err);
          // Keep enrichedSeries as is (already filtered)
        }
      }

      setQuickRaces(enrichedRaces);
      setSeries(enrichedSeries);
      setVenues(storedVenues);
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

  const handleDeleteClick = (id: string, type: 'quick' | 'series') => {
    setItemToDelete({ id, type });
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
        await deleteRaceEvent(itemToDelete.id);
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
      skippers: seriesItem.skippers || [],
      raceResults: round.results || [],
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
      enableLiveStream: round.enableLiveStream || seriesItem.enableLiveStream
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
  const filterByTime = (event: RaceEvent | { date: string, completed?: boolean }) => {
    const isPast = isDatePast(event.date);
    const isCompleted = event.completed || false;

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

    // Year filter
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
                  setSelectedEventForTracking(race);
                  setShowLiveTrackingQR(true);
                }}
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  darkMode
                    ? 'bg-blue-900/90 hover:bg-blue-800 text-blue-400'
                    : 'bg-blue-50/90 hover:bg-blue-100 text-blue-600'
                }`}
                title="Live Skipper Tracking QR Code"
              >
                <QrCode size={16} />
              </button>
              {(race.eventLevel === 'state' || race.eventLevel === 'national') && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    // Check if website already exists
                    const { data: existingWebsite } = await supabase
                      .from('event_websites')
                      .select('id')
                      .eq('event_id', race.id)
                      .maybeSingle();

                    if (existingWebsite) {
                      // Navigate to dashboard if website exists
                      navigate(`/website/event-websites/${race.id}`);
                    } else {
                      // Show settings modal to create new website
                      setSelectedEventForWebsite(race);
                      setShowEventWebsiteModal(true);
                    }
                  }}
                  className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                    darkMode
                      ? 'bg-purple-900/90 hover:bg-purple-800 text-purple-400'
                      : 'bg-purple-50/90 hover:bg-purple-100 text-purple-600'
                  }`}
                  title="Event Website"
                >
                  <Globe size={16} />
                </button>
              )}
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
                  handleDeleteClick(race.id, 'quick');
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
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500 text-white text-xs font-medium">
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

  const renderSeriesCard = (s: RaceSeries) => {
    const colors = boatTypeColors[s.raceClass] || defaultColorScheme;
    const completedRounds = s.rounds.filter(r => r.completed).length;
    const totalRounds = s.rounds.length;
    const isExpanded = expandedSeries === s.id;

    // Enhanced debug logging
    console.log('Rendering series card:', {
      seriesName: s.seriesName,
      seriesId: s.id,
      idType: typeof s.id,
      expandedSeries: expandedSeries,
      expandedSeriesType: typeof expandedSeries,
      isExpanded: isExpanded,
      strictEquality: expandedSeries === s.id,
      looseEquality: expandedSeries == s.id
    });

    const venueImage = s.rounds[0] ? getVenueImage(s.rounds[0].venue) : null;
    const nextRoundIndex = getNextUpcomingRound(s);
    const progressPercent = totalRounds > 0 ? (completedRounds / totalRounds) * 100 : 0;

    // Get all unique participants across all rounds
    const allParticipants = s.rounds.reduce((acc: any[], round) => {
      const roundParticipants = (round.skippers && round.skippers.length > 0) ? round.skippers : (round.attendees || []);
      roundParticipants.forEach(participant => {
        if (!acc.find(p => p.name === participant.name)) {
          acc.push(participant);
        }
      });
      return acc;
    }, []);

    const avatars = allParticipants.slice(0, 5).map((skipper, i) => {
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
        className={`
          group relative overflow-hidden cursor-pointer rounded-xl transition-all duration-300
          ${darkMode
            ? 'bg-slate-800/50 hover:bg-slate-800 border border-slate-700'
            : 'bg-white hover:shadow-xl border border-slate-200'}
          ${s.completed ? 'opacity-75' : ''}
        `}
      >
        {/* Series Image */}
        {venueImage && (
          <div className="relative h-48 overflow-hidden">
            <img
              src={venueImage}
              alt={s.rounds[0]?.venue}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

            {/* Date Badge Overlay - Show year range */}
            {s.rounds[0]?.date && (
              <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg">
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-500 leading-none uppercase">
                    {(() => {
                      const firstYear = new Date(s.rounds[0].date).getFullYear();
                      const lastYear = new Date(s.rounds[s.rounds.length - 1].date).getFullYear();
                      return firstYear === lastYear ? firstYear : `${firstYear}-${lastYear}`;
                    })()}
                  </div>
                  <div className="text-xs font-medium text-slate-700 leading-tight mt-1">
                    Series
                  </div>
                </div>
              </div>
            )}

            {/* Status Badge */}
            <div className="absolute top-3 right-3">
              {s.completed ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-500/90 backdrop-blur-sm text-white text-xs font-medium">
                  <CheckCircle2 size={14} className="text-white" />
                  <span className="text-white">Completed</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-purple-500/90 backdrop-blur-sm text-white text-xs font-medium">
                  <TrendingUp size={14} />
                  {completedRounds}/{totalRounds} Rounds
                </div>
              )}
            </div>
          </div>
        )}

        {/* Series Content */}
        <div className="p-4" onClick={() => toggleSeriesExpansion(s.id)}>
          {/* Action Buttons */}
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 touch-show transition-opacity">
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
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
                  setSelectedEventForTracking(seriesEvent);
                  setShowLiveTrackingQR(true);
                }}
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  darkMode
                    ? 'bg-blue-900/90 hover:bg-blue-800 text-blue-400'
                    : 'bg-blue-50/90 hover:bg-blue-100 text-blue-600'
                }`}
                title="Live Skipper Tracking QR Code"
              >
                <QrCode size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
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
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  isSeriesFullyCompleted(s)
                    ? darkMode
                      ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                      : 'bg-white/50 text-slate-400 cursor-not-allowed'
                    : darkMode
                      ? 'bg-slate-700/90 hover:bg-slate-600 text-slate-300'
                      : 'bg-white/90 hover:bg-slate-100 text-slate-600'
                }`}
                title={isSeriesFullyCompleted(s) ? "Cannot edit - all rounds completed" : "Edit series"}
                disabled={isSeriesFullyCompleted(s)}
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(s.id, 'series');
                }}
                className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                  darkMode
                    ? 'bg-red-900/90 hover:bg-red-800 text-red-400'
                    : 'bg-red-50/90 hover:bg-red-100 text-red-600'
                }`}
                title="Delete series"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {s.seriesName}
                </h3>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}>
                  {s.raceClass}
                </div>
                {/* Completion badge for cards without images */}
                {!venueImage && s.completed && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500 text-white text-xs font-medium">
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
                    {s.rounds.length > 0
                      ? `${formatDate(s.rounds[0].date)} - ${formatDate(s.rounds[s.rounds.length - 1].date)}`
                      : 'No rounds scheduled'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {!s.completed && totalRounds > 0 && (
            <div className="mb-3">
              <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm mb-3">
            <MapPin size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            <span className={`truncate ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {s.rounds.length > 0
                ? `${s.rounds.map(r => r.venue).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
                : 'No venues set'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
            <div className="flex items-center">
              {avatars.length > 0 ? (
                <div className="flex items-center">
                  {avatars}
                  {allParticipants.length > 5 && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 -ml-2 ${
                      darkMode ? 'border-slate-800 bg-slate-700 text-slate-300' : 'border-white bg-slate-200 text-slate-700'
                    }`}>
                      +{allParticipants.length - 5}
                    </div>
                  )}
                  <span className={`ml-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {allParticipants.length} registered
                  </span>
                </div>
              ) : (
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  No registrations yet
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                s.raceFormat === 'handicap'
                  ? darkMode ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800'
                  : darkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
              }`}>
                {s.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
              </div>
              <button
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'hover:bg-slate-700 text-slate-300'
                    : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Rounds */}
        {isExpanded && s.rounds.length > 0 && (
          <div className="px-4 pb-4">
            <div className="pt-4 border-t border-slate-700/50">
              <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Series Rounds
              </h4>
              <div className="space-y-2">
                {getSortedRounds(s).map((round, index) => {
                  const isPastDate = isDatePast(round.date);
                  const isToday = isDateToday(round.date);
                  const originalIndex = s.rounds.findIndex(r => r.name === round.name);
                  const isNextRound = originalIndex === nextRoundIndex;

                  return (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!round.cancelled) {
                          handleRoundClick(s, originalIndex);
                        }
                      }}
                      className={`
                        p-3 rounded-lg border transition-all duration-200
                        ${darkMode
                          ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:bg-white hover:shadow-md'}
                        ${round.cancelled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                        ${isNextRound ? 'ring-2 ring-green-500/50' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`font-medium text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {round.name}
                        </div>
                        <div className="flex items-center gap-2">
                          {s.enableLiveTracking && !round.completed && !round.cancelled && isToday && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-900/30 text-cyan-400" title="Live Tracking enabled">
                              <Radio size={12} />
                              Live
                            </div>
                          )}
                          {round.completed ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                              <CheckCircle2 size={12} />
                              Completed
                            </div>
                          ) : round.cancelled ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400">
                              <XCircle size={12} />
                              Cancelled
                            </div>
                          ) : (round.lastCompletedRace && round.lastCompletedRace > 0) ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-900/30 text-orange-400">
                              <TrendingUp size={12} />
                              In Progress
                            </div>
                          ) : isNextRound ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 animate-pulse">
                              <Clock size={12} />
                              Up Next
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              {formatDate(round.date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                              {round.venue}
                            </span>
                          </div>
                        </div>
                        {/* Show competing skippers if available, otherwise show registered attendees */}
                        {((round.skippers && round.skippers.length > 0) || (round.attendees && round.attendees.length > 0)) && (
                          <div className="flex items-center gap-2">
                            {round.skippers && round.skippers.length > 0 ? (
                              <>
                                <div className="flex -space-x-2">
                                  {round.skippers.slice(0, 4).map((skipper: any, i: number) => {
                                    const nameParts = skipper.name.trim().split(' ');
                                    const initials = nameParts.length >= 2
                                      ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
                                      : skipper.name.substring(0, 2).toUpperCase();
                                    return (
                                      <div
                                        key={i}
                                        title={skipper.name}
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2 ring-slate-800 overflow-hidden"
                                      >
                                        {skipper.avatarUrl ? (
                                          <img
                                            src={skipper.avatarUrl}
                                            alt={skipper.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                                            {initials}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {round.skippers.length > 4 && (
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2 ring-slate-800 bg-slate-700 text-slate-300">
                                      +{round.skippers.length - 4}
                                    </div>
                                  )}
                                </div>
                                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {round.skippers.length} competing
                                </span>
                              </>
                            ) : round.attendees && round.attendees.length > 0 && (
                              <>
                                <div className="flex -space-x-2">
                                  {round.attendees.slice(0, 4).map((attendee: any, i: number) => {
                                    const nameParts = attendee.name.trim().split(' ');
                                    const initials = nameParts.length >= 2
                                      ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
                                      : attendee.name.substring(0, 2).toUpperCase();
                                    return (
                                      <div
                                        key={i}
                                        title={attendee.name}
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2 ring-slate-800 overflow-hidden"
                                      >
                                        {attendee.avatarUrl ? (
                                          <img
                                            src={attendee.avatarUrl}
                                            alt={attendee.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                                            {initials}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {round.attendees.length > 4 && (
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2 ring-slate-800 bg-slate-700 text-slate-300">
                                      +{round.attendees.length - 4}
                                    </div>
                                  )}
                                </div>
                                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                  {round.attendees.length} registered
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
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
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Flag className="text-white" size={28} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>Race Management</h1>
              <p className="text-sm text-slate-400">
                {quickRaces.length + series.length} {quickRaces.length + series.length === 1 ? 'event' : 'events'} total
              </p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            {showSearch ? (
              <div className="relative flex-1 sm:w-64">
                <Search
                  size={18}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}
                />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => !searchTerm && setShowSearch(false)}
                  autoFocus
                  className={`
                    w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-slate-200 placeholder-slate-400 border border-slate-600'
                      : 'bg-white text-slate-900 placeholder-slate-400 border border-slate-200'}
                  `}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className={`
                  p-2 rounded-lg transition-colors
                  ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'}
                `}
                title="Search"
              >
                <Search size={18} />
              </button>
            )}

            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}
                `}
              >
                <ArrowUpDown size={16} />
                Sort
                <ChevronDown size={16} />
              </button>

              {showSortDropdown && (
                <div className={`
                  absolute right-0 mt-2 w-56 rounded-lg shadow-xl border py-2 z-50
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}>
                  {[
                    { value: 'date-asc', label: 'Date (Oldest First)' },
                    { value: 'date-desc', label: 'Date (Newest First)' },
                    { value: 'name-asc', label: 'Name (A-Z)' },
                    { value: 'name-desc', label: 'Name (Z-A)' },
                    { value: 'status', label: 'Status' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value as SortOption);
                        setShowSortDropdown(false);
                      }}
                      className={`
                        w-full text-left px-4 py-2 text-sm transition-colors
                        ${sortBy === option.value
                          ? darkMode
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'bg-blue-50 text-blue-600'
                          : darkMode
                            ? 'text-slate-300 hover:bg-slate-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }
                      `}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Dropdown */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}
                `}
              >
                <Filter size={16} />
                Filters
                <ChevronDown size={16} />
              </button>

              {showFilterDropdown && (
                <div className={`
                  absolute right-0 mt-2 w-80 rounded-lg shadow-xl border py-3 z-50
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}>
                  {/* Race Format */}
                  <div className="px-4 py-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Race Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilterFormat(filterFormat === 'scratch' ? 'all' : 'scratch')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-colors
                          ${filterFormat === 'scratch'
                            ? 'bg-blue-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        Scratch
                      </button>
                      <button
                        onClick={() => setFilterFormat(filterFormat === 'handicap' ? 'all' : 'handicap')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-colors
                          ${filterFormat === 'handicap'
                            ? 'bg-purple-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        Handicap
                      </button>
                    </div>
                  </div>

                  <div className={`border-t my-2 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}></div>

                  {/* Boat Class */}
                  <div className="px-4 py-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Class
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {boatClasses.map(boatClass => {
                        const typeColors = boatTypeColors[boatClass] || defaultColorScheme;
                        return (
                          <button
                            key={boatClass}
                            onClick={() => setFilterClass(filterClass === boatClass ? 'all' : boatClass)}
                            className={`
                              px-3 py-1.5 rounded text-sm transition-colors
                              ${filterClass === boatClass
                                ? `${typeColors.bg} ${typeColors.text} ${typeColors.darkBg} ${typeColors.darkText}`
                                : darkMode
                                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }
                            `}
                          >
                            {boatClass}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`border-t my-2 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}></div>

                  {/* Event Type */}
                  <div className="px-4 py-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Event Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilterEventType(filterEventType === 'single' ? 'all' : 'single')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1
                          ${filterEventType === 'single'
                            ? 'bg-blue-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        <Trophy size={14} />
                        Single Events
                      </button>
                      <button
                        onClick={() => setFilterEventType(filterEventType === 'series' ? 'all' : 'series')}
                        className={`
                          flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                          ${filterEventType === 'series'
                            ? 'bg-purple-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        <Calendar size={14} />
                        Race Series
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* View Toggle */}
            <div className={`flex items-center gap-1 p-1 rounded-lg ${
              darkMode ? 'bg-slate-700' : 'bg-slate-200'
            }`}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grid view"
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>

            {/* New Event Button */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 !text-white rounded-lg hover:from-green-700 hover:to-emerald-700 font-medium transition-all shadow-lg hover:shadow-xl animate-pulse"
              >
                <Plus size={20} strokeWidth={2.5} className="!text-white" />
                <span className="!text-white">New Event</span>
                <ChevronDown size={18} className="!text-white" />
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      handleCreateClick('quick');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <Trophy className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Single Event</div>
                      <div className="text-slate-400 text-xs">Create a standalone race event</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      handleCreateClick('series');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-purple-600/20">
                      <Calendar className="text-purple-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Race Series</div>
                      <div className="text-slate-400 text-xs">Create a multi-round race series</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          {/* Year Filter */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors border appearance-none pr-10
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}
              `}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                darkMode ? 'text-slate-400' : 'text-slate-600'
              }`}
            />
          </div>

          {/* Time Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[
              { value: 'all', label: 'All Events', count: sortedQuickRaces.length + sortedSeries.length },
              { value: 'upcoming', label: 'Upcoming', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => !isDatePast(e.date) && !e.completed).length },
              { value: 'past', label: 'Past', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => isDatePast(e.date) && !e.completed).length },
              { value: 'completed', label: 'Completed', count: [...quickRaces.filter(r => new Date(r.date).getFullYear() === selectedYear), ...series.flatMap(s => s.rounds.filter(r => new Date(r.date).getFullYear() === selectedYear))].filter(e => e.completed).length },
              { value: 'pending', label: 'Pending', count: pendingEvents.length },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setTimeFilter(tab.value as TimeFilter)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                  ${timeFilter === tab.value
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                  }
                `}
              >
                <span className={timeFilter === tab.value ? 'text-white' : ''}>{tab.label}</span>
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-semibold
                  ${timeFilter === tab.value
                    ? 'bg-white/20 text-white'
                    : darkMode
                      ? 'bg-slate-600 text-slate-300'
                      : 'bg-slate-100 text-slate-600'
                  }
                `}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

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
        ) : filteredQuickRaces.length === 0 && filteredSeries.length === 0 && timeFilter !== 'pending' ? (
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
          <div className="space-y-12">
            {/* Pending Events Section */}
            {timeFilter === 'pending' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-amber-600/20">
                    <Clock className="text-amber-400" size={24} />
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
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
                                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
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
                                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
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
                                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
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

            {/* Series Section */}
            {timeFilter !== 'pending' && sortedSeries.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-purple-600/20">
                    <Calendar className="text-purple-400" size={24} />
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Race Series
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {sortedSeries.length} {sortedSeries.length === 1 ? 'series' : 'series'}
                    </p>
                  </div>
                </div>
                <div className={`grid gap-6 items-start ${
                  viewMode === 'grid'
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    : 'grid-cols-1'
                }`}>
                  {sortedSeries.map((s) => (
                    <React.Fragment key={s.id}>
                      {renderSeriesCard(s)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Separator between Series and Single Events */}
            {timeFilter !== 'pending' && sortedSeries.length > 0 && Object.entries(groupedSingleEvents).length > 0 && (
              <div className={`my-8 border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}></div>
            )}

            {/* Single Events Section */}
            {timeFilter !== 'pending' && Object.entries(groupedSingleEvents).length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-blue-600/20">
                    <Trophy className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Single Events
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
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
                          <h3 className={`text-xl font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {monthName}
                          </h3>
                          <span className={`text-base ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
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
            navigate(`/website/event-websites/${selectedEventForWebsite.id}`);
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

            <div className={`px-6 py-4 border-t ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            } flex gap-3`}>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectingEventId(null);
                  setRejectReason('');
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmRejectEvent}
                disabled={!rejectReason.trim()}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  !rejectReason.trim()
                    ? 'bg-red-600/50 text-white/50 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
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
