import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Calendar, CalendarDays, CalendarRange, List, Grid, X, ChevronDown, ChevronRight, ChevronLeft, Filter, Map, FileImage, Download, Medal, Maximize2, Minimize2, TrendingUp as TrendyUp, FileText, Globe, MapPin, Link2, MapIcon, Clock } from 'lucide-react';
import { RaceType } from '../types';
import { RaceEvent, RaceSeries } from '../types/race';
import { formatDate } from '../utils/date';
import { VenueDetails } from './VenueDetails';
import { getStoredRaceSeries, getStoredRaceEvents } from '../utils/raceStorage';
import { getStoredVenues } from '../utils/venueStorage';
import { Venue } from '../types/venue';
import { boatTypeColors, defaultColorScheme, getBoatClassBadge, getRaceFormatBadge, getEventTypeBadge } from '../constants/colors';
import { SeriesLeaderboard } from './SeriesLeaderboard';
import { EventDetails } from './EventDetails';
import html2canvas from 'html2canvas';
import { getBoatClassImage } from '../utils/boatClassImages';
import '../styles/yacht-race.css';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateICalFile, downloadICalFile } from '../utils/calendarSync';
import { LocationExplorer } from './LocationExplorer';
import { getCalendarMeetings, CalendarMeeting } from '../utils/calendarMeetingStorage';
import { CalendarMeetingDetailsModal } from './meetings/CalendarMeetingDetailsModal';
import { Users, Shield, Building2, Globe2, Flag } from 'lucide-react';

type CalendarView = 'list' | 'grid' | 'month' | 'year';
type EventScope = 'all' | 'club' | 'my_state' | 'national' | 'all_states';

interface RaceCalendarProps {
  events?: RaceEvent[];
  darkMode: boolean;
  onEventSelect: (event: RaceEvent) => void;
  onStartScoring: () => void;
  onClose?: () => void;
}

export const RaceCalendar: React.FC<RaceCalendarProps> = ({
  events: propEvents,
  darkMode,
  onEventSelect,
  onStartScoring,
  onClose
}) => {
  const { currentClub, currentOrganization } = useAuth();
  const [view, setView] = useState<CalendarView>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    raceFormat?: 'handicap' | 'scratch';
    raceClass?: string;
    eventType?: 'all' | 'club' | 'public' | 'state' | 'national';
  }>({
    eventType: 'all'
  });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesMap, setSeriesMap] = useState<Record<string, RaceSeries>>({});
  const [selectedSeries, setSelectedSeries] = useState<RaceSeries | null>(null);
  const [showVenueDetails, setShowVenueDetails] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [allPublicEvents, setAllPublicEvents] = useState<RaceEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showSubscribeMenu, setShowSubscribeMenu] = useState(false);
  const [showLocationExplorer, setShowLocationExplorer] = useState(false);
  const [sailingDays, setSailingDays] = useState<any[]>([]);
  const [calendarMeetings, setCalendarMeetings] = useState<CalendarMeeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null);
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<'all' | 'events' | 'meetings'>('all');
  const [eventScope, setEventScope] = useState<EventScope>(() => {
    const saved = localStorage.getItem('raceCalendarEventScope');
    return (saved as EventScope) || 'all';
  });
  const [clubStateAssociationId, setClubStateAssociationId] = useState<string | null>(null);
  const [stateAssociationNames, setStateAssociationNames] = useState<Record<string, string>>({});
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const subscribeMenuRef = useRef<HTMLDivElement>(null);

  // Fetch event attendance and enrich events with attendee data
  const enrichEventsWithAttendance = async (events: RaceEvent[]) => {
    if (!currentClub?.clubId || events.length === 0) return events;

    // Skip if offline
    if (!navigator.onLine) {
      console.log('[RaceCalendar] Offline - skipping attendance enrichment');
      return events;
    }

    try {
      // Fetch all attendance for this club (both single events and series rounds)
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('event_id, series_id, round_name, user_id, status')
        .eq('club_id', currentClub.clubId)
        .eq('status', 'yes');

      if (attendanceError) {
        console.error('[RaceCalendar] Error fetching attendance:', attendanceError);
        return events;
      }

      console.log('[RaceCalendar] Fetched attendance data:', attendanceData);

      if (!attendanceData || attendanceData.length === 0) {
        console.log('[RaceCalendar] No attendance data found');
        return events;
      }

      // Get unique user IDs
      const userIds = [...new Set(attendanceData.map(att => att.user_id))];

      // Fetch profiles for these users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('[RaceCalendar] Error fetching profiles:', profilesError);
      }

      console.log('[RaceCalendar] Fetched profiles:', profilesData);

      // Create a map of user_id to profile
      const profileMap: Record<string, any> = {};
      profilesData?.forEach(profile => {
        profileMap[profile.id] = profile;
      });

      // Create attendance maps for both single events and series rounds
      const singleEventAttendanceMap: Record<string, any[]> = {};
      const seriesRoundAttendanceMap: Record<string, any[]> = {};

      attendanceData.forEach((att: any) => {
        const profile = profileMap[att.user_id];
        let name = 'Unknown';
        if (profile && profile.first_name && profile.last_name) {
          name = `${profile.first_name} ${profile.last_name}`;
        }

        const attendee = {
          name,
          sailNo: `ATT-${att.user_id.substring(0, 8)}`,
          club: currentClub.club?.name || '',
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

      console.log('[RaceCalendar] Single event attendance map:', singleEventAttendanceMap);
      console.log('[RaceCalendar] Series round attendance map:', seriesRoundAttendanceMap);

      // Enrich events with attendance data
      return events.map(event => {
        let attendees: any[] = [];

        if (event.isSeriesEvent && event.seriesId && event.roundName) {
          // For series rounds, look up by series_id + round_name
          const key = `${event.seriesId}-${event.roundName}`;
          attendees = seriesRoundAttendanceMap[key] || [];
          console.log(`[RaceCalendar] Series round "${event.eventName}" (${key}): ${attendees.length} attendees`);
        } else {
          // For single events, extract the UUID from the event ID
          const eventId = event.id.includes('-') && event.id.split('-').length > 5
            ? event.id.split('-').slice(0, 5).join('-')
            : event.id;
          attendees = singleEventAttendanceMap[eventId] || [];
          console.log(`[RaceCalendar] Single event "${event.eventName}" (${event.id} -> ${eventId}): ${attendees.length} attendees`);
        }

        // Merge skippers and attendees, avoiding duplicates
        const existingSkippers = event.skippers || [];
        const allParticipants = [...existingSkippers];

        // Only add attendees if there are no skippers yet (scoring hasn't started)
        if (existingSkippers.length === 0 && attendees.length > 0) {
          console.log(`[RaceCalendar] Adding ${attendees.length} attendees to event "${event.eventName}"`, attendees);
          allParticipants.push(...attendees);
        }

        return {
          ...event,
          skippers: allParticipants
        };
      });
    } catch (err) {
      console.error('Error enriching events with attendance:', err);
      return events;
    }
  };

  // Fetch all public events and venues from all clubs for Location Explorer
  const fetchAllPublicEvents = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const allEvents: RaceEvent[] = [];
      const seenIds = new Set<string>();

      const [publicEventsResult, quickRacesResult, seriesRoundsResult, allVenuesResult] = await Promise.all([
        getPublicEvents(),
        supabase
          .from('quick_races')
          .select('id, event_name, club_name, race_date, end_date, race_venue, race_class, race_format, club_id, multi_day, number_of_days, is_paid, entry_fee, notice_of_race_url, sailing_instructions_url, is_interclub, other_club_name, completed')
          .eq('completed', false)
          .gte('race_date', today)
          .order('race_date', { ascending: true }),
        supabase
          .from('race_series_rounds')
          .select('id, round_name, date, venue, race_class, race_format, club_id, series_id, completed, cancelled')
          .eq('cancelled', false)
          .eq('completed', false)
          .gte('date', today)
          .order('date', { ascending: true }),
        supabase
          .from('venues')
          .select('*')
          .order('name')
      ]);

      const publicEvents = publicEventsResult || [];
      publicEvents
        .map(pe => convertToRaceEvent(pe))
        .filter((event): event is RaceEvent => event !== null)
        .forEach(event => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            allEvents.push(event);
          }
        });

      const clubIds = new Set<string>();
      (quickRacesResult.data || []).forEach(qr => { if (qr.club_id) clubIds.add(qr.club_id); });
      (seriesRoundsResult.data || []).forEach(sr => { if (sr.club_id) clubIds.add(sr.club_id); });

      let clubNameMap: Record<string, string> = {};
      if (clubIds.size > 0) {
        const { data: clubs } = await supabase
          .from('clubs')
          .select('id, name')
          .in('id', [...clubIds]);
        if (clubs) {
          clubs.forEach(c => { clubNameMap[c.id] = c.name; });
        }
      }

      let seriesNameMap: Record<string, string> = {};
      const seriesIds = new Set<string>();
      (seriesRoundsResult.data || []).forEach(sr => { if (sr.series_id) seriesIds.add(sr.series_id); });
      if (seriesIds.size > 0) {
        const { data: series } = await supabase
          .from('race_series')
          .select('id, series_name')
          .in('id', [...seriesIds]);
        if (series) {
          series.forEach(s => { seriesNameMap[s.id] = s.series_name; });
        }
      }

      (quickRacesResult.data || []).forEach(qr => {
        if (seenIds.has(qr.id)) return;
        seenIds.add(qr.id);
        allEvents.push({
          id: qr.id,
          eventName: qr.event_name || 'Race Day',
          clubName: qr.club_name || clubNameMap[qr.club_id] || '',
          date: qr.race_date,
          endDate: qr.end_date,
          venue: qr.race_venue || '',
          raceClass: qr.race_class as any,
          raceFormat: qr.race_format as any,
          multiDay: qr.multi_day,
          numberOfDays: qr.number_of_days,
          isPaid: qr.is_paid,
          entryFee: qr.entry_fee,
          noticeOfRaceUrl: qr.notice_of_race_url,
          sailingInstructionsUrl: qr.sailing_instructions_url,
          isInterclub: qr.is_interclub,
          otherClubName: qr.other_club_name,
          clubId: qr.club_id,
          eventLevel: 'club',
          completed: qr.completed
        });
      });

      (seriesRoundsResult.data || []).forEach(sr => {
        if (seenIds.has(sr.id)) return;
        seenIds.add(sr.id);
        const seriesName = sr.series_id ? seriesNameMap[sr.series_id] : '';
        allEvents.push({
          id: sr.id,
          eventName: seriesName ? `${seriesName} - ${sr.round_name || 'Round'}` : (sr.round_name || 'Series Round'),
          clubName: clubNameMap[sr.club_id] || '',
          date: sr.date,
          venue: sr.venue || '',
          raceClass: sr.race_class as any,
          raceFormat: sr.race_format as any,
          isSeriesEvent: true,
          seriesId: sr.series_id,
          roundName: sr.round_name,
          clubId: sr.club_id,
          eventLevel: 'club',
          completed: sr.completed
        });
      });

      setAllPublicEvents(allEvents);

      if (allVenuesResult.error) {
        console.error('[RaceCalendar] Error fetching all venues:', allVenuesResult.error);
      } else if (allVenuesResult.data) {
        setAllVenues(allVenuesResult.data);
      }
    } catch (err) {
      console.error('[RaceCalendar] Error fetching events for Location Explorer:', err);
    }
  };

  const handleOpenLocationExplorer = async () => {
    await fetchAllPublicEvents();
    setShowLocationExplorer(true);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // If events are provided as props, use them
        if (propEvents && propEvents.length > 0) {
          const enrichedEvents = await enrichEventsWithAttendance(propEvents);
          setEvents(enrichedEvents);
          setLoading(false);
          return;
        }
        
        const [storedVenues, storedSeries, raceEvents, publicEvents, meetings, externalEventsResult] = await Promise.all([
          getStoredVenues(),
          getStoredRaceSeries(),
          getStoredRaceEvents(),
          getPublicEvents(false, currentOrganization?.type, currentOrganization?.id),
          getCalendarMeetings(
            currentClub?.clubId,
            currentOrganization?.type === 'state' ? currentOrganization.id : null,
            currentOrganization?.type === 'national' ? currentOrganization.id : null
          ),
          supabase
            .from('external_events')
            .select('*, external_event_sources!inner(name)')
            .eq('is_visible', true)
            .eq('event_status', 'active')
            .order('event_date', { ascending: true })
        ]);

        setCalendarMeetings(meetings);
        
        setVenues(storedVenues);
        
        const seriesNameMap: Record<string, RaceSeries> = {};
        storedSeries.forEach(series => {
          seriesNameMap[series.id] = series;
        });
        
        console.log('Series map for calendar:', seriesNameMap);
        setSeriesMap(seriesNameMap);
        
        // Convert series events into race events
        const seriesRaceEvents: RaceEvent[] = storedSeries.flatMap(series => {
          console.log(`🟢 [loadData] Converting series "${series.seriesName}" with ${series.rounds.length} rounds`);
          return series.rounds.map((round: any, index) => {
            const roundName = round.name || round.roundName;
            const skippersCount = round.skippers?.length || 0;
            console.log(`🟢 [loadData] Round "${roundName}" has ${skippersCount} skippers in database`);

            return {
              id: `${series.id}-${index}`,
              eventName: `${roundName} - ${series.seriesName}`,
              clubName: series.clubName,
              date: round.date,
              venue: round.venue,
              raceClass: series.raceClass,
              raceFormat: series.raceFormat,
              isSeriesEvent: true,
              seriesId: series.id,
              roundName: roundName,
              completed: round.completed || false,
              cancelled: round.cancelled || false,
              cancellationReason: round.cancellationReason,
              clubId: series.clubId,
              // Include scoring data if available
              skippers: round.skippers || [],
              raceResults: round.raceResults || [],
              lastCompletedRace: round.lastCompletedRace || 0,
              hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || false,
              isManualHandicaps: round.isManualHandicaps || false,
              heatManagement: round.heatManagement,
              numRaces: round.numRaces,
              dropRules: round.dropRules,
              enableLiveTracking: series.enableLiveTracking,
              enableLiveStream: round.enableLiveStream ?? series.enableLiveStream
            };
          });
        });
        
        // Convert public events to RaceEvent format
        const publicRaceEvents: RaceEvent[] = publicEvents.map(publicEvent =>
          convertToRaceEvent(publicEvent)
        );

        const externalRaceEvents: RaceEvent[] = (externalEventsResult.data || []).map((ext: any) => ({
          id: `external-${ext.id}`,
          eventName: ext.event_name,
          clubName: (ext.external_event_sources as any)?.name || ext.venue || 'External Event',
          date: ext.event_date || '',
          endDate: ext.event_end_date || undefined,
          venue: ext.location || ext.venue || '',
          raceClass: (ext.boat_class_mapped || ext.boat_class_raw || 'Unknown') as any,
          raceFormat: 'scratch' as any,
          isPublicEvent: true,
          isExternalEvent: true,
          eventLevel: ext.event_type === 'national' ? 'national' as const : ext.event_type === 'state' ? 'state' as const : 'national' as const,
          noticeOfRaceUrl: ext.documents_json?.find((d: any) => d.type === 'nor' || d.name?.toLowerCase().includes('notice'))?.url,
          sailingInstructionsUrl: ext.documents_json?.find((d: any) => d.type === 'si' || d.name?.toLowerCase().includes('sailing instruction'))?.url,
          sourceUrl: ext.source_url,
          registrationUrl: ext.registration_url,
          multiDay: ext.event_end_date ? true : false,
          numberOfDays: ext.event_end_date ? Math.ceil((new Date(ext.event_end_date).getTime() - new Date(ext.event_date).getTime()) / 86400000) + 1 : undefined,
          displayCategory: ext.display_category || 'national',
          stateCode: ext.state_code || undefined,
          externalDocuments: ext.documents_json || [],
        }));

        // Filter out public events that have local copies in raceEvents
        // Local copies now have a public_event_id field tracking the original event
        const localCopyPublicEventIds = new Set(
          raceEvents
            .filter(e => (e as any).publicEventId) // Local copies have publicEventId
            .map(e => (e as any).publicEventId)
        );

        const filteredPublicEvents = publicRaceEvents.filter(
          pubEvent => !localCopyPublicEventIds.has(pubEvent.id)
        );

        // Combine all events (using local copies instead of original public events where they exist)
        // For associations, only show public events (state/national level events)
        // For clubs, show all events including club-specific events
        const allEvents = currentOrganization?.type === 'state' || currentOrganization?.type === 'national'
          ? [...filteredPublicEvents, ...externalRaceEvents]  // Associations: public + external events
          : [...raceEvents, ...seriesRaceEvents, ...filteredPublicEvents, ...externalRaceEvents];  // Clubs: all events

        const enrichedEvents = await enrichEventsWithAttendance(allEvents);
        setEvents(enrichedEvents);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load calendar data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [propEvents, currentClub, currentOrganization]); // Reload when club/organization changes or component remounts

  useEffect(() => {
    const loadClubStateAssociation = async () => {
      if (!currentClub?.clubId) return;
      try {
        const { data } = await supabase
          .from('clubs')
          .select('state_association_id')
          .eq('id', currentClub.clubId)
          .maybeSingle();
        if (data?.state_association_id) {
          setClubStateAssociationId(data.state_association_id);
        }

        const { data: stateAssocs } = await supabase
          .from('state_associations')
          .select('id, name, abbreviation');
        if (stateAssocs) {
          const nameMap: Record<string, string> = {};
          stateAssocs.forEach((sa: any) => {
            nameMap[sa.id] = sa.abbreviation || sa.name;
          });
          setStateAssociationNames(nameMap);
        }
      } catch (err) {
        console.error('Error loading club state association:', err);
      }
    };
    loadClubStateAssociation();
  }, [currentClub?.clubId]);

  const handleEventScopeChange = (scope: EventScope) => {
    setEventScope(scope);
    localStorage.setItem('raceCalendarEventScope', scope);
  };

  // Load sailing days for the club
  useEffect(() => {
    const loadSailingDays = async () => {
      if (!currentClub?.clubId) return;

      try {
        const { data, error } = await supabase
          .from('club_sailing_days')
          .select(`
            id,
            day_of_week,
            start_time,
            end_time,
            boat_class_id,
            boat_classes(name)
          `)
          .eq('club_id', currentClub.clubId)
          .eq('is_active', true)
          .order('day_of_week');

        if (error) throw error;

        const formattedDays = (data || []).map((sd: any) => ({
          id: sd.id,
          day_of_week: sd.day_of_week,
          start_time: sd.start_time,
          end_time: sd.end_time,
          boat_class_name: sd.boat_classes?.name || null
        }));

        setSailingDays(formattedDays);
      } catch (err) {
        console.error('Error loading sailing days:', err);
      }
    };

    loadSailingDays();
  }, [currentClub?.clubId]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (subscribeMenuRef.current && !subscribeMenuRef.current.contains(event.target as Node)) {
        setShowSubscribeMenu(false);
      }
    };

    if (showFilterDropdown || showSubscribeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterDropdown, showSubscribeMenu]);

  const getSeriesName = (event: RaceEvent): string | null => {
    if (event.isSeriesEvent && event.seriesId) {
      return seriesMap[event.seriesId]?.seriesName || null;
    }
    return null;
  };

  const getVenueImage = (venueName: string, event?: RaceEvent): string | null => {
    if (event?.venueImage) {
      return event.venueImage;
    }
    const venue = venues.find(v => v.name === venueName);
    if (venue?.image) return venue.image;
    if (event?.isExternalEvent) {
      return getBoatClassImage(event.raceClass as string) || null;
    }
    return null;
  };

  const isDatePast = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const isNextUpcomingEvent = (event: RaceEvent, allEvents: RaceEvent[]) => {
    if (isDatePast(event.date) || event.completed || event.cancelled) {
      return false;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const eventDate = new Date(event.date);
    
    // Find the next upcoming event date (the closest future date)
    const upcomingEvents = allEvents
      .filter(e => {
        const eDate = new Date(e.date);
        return eDate >= today && !e.completed && !e.cancelled;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    if (upcomingEvents.length === 0) return false;
    
    // Check if this event is the next upcoming one
    const nextEvent = upcomingEvents[0];
    return event.date === nextEvent.date && event.id === nextEvent.id;
  };

  const formatEventDate = (dateStr: string, venue: string): string => {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}-${month}-${year} - ${venue}`;
  };

  const uniqueEvents = events.reduce((acc, event) => {
    const key = event.isSeriesEvent 
      ? `${event.seriesId}-${event.roundName}-${event.date}`
      : `${event.id}-${event.date}`;
    
    if (!acc[key]) {
      acc[key] = event;
    }
    return acc;
  }, {} as Record<string, RaceEvent>);

  // Get unique years from all events
  const availableYears = Array.from(
    new Set(
      Object.values(uniqueEvents).map(event => new Date(event.date).getFullYear())
    )
  ).sort((a, b) => b - a); // Sort descending (newest first)

  const isEventInMyState = (event: RaceEvent): boolean => {
    if (!clubStateAssociationId) return false;
    if (event.displayCategory?.startsWith('state_')) {
      const assocId = event.displayCategory.replace('state_', '');
      return assocId === clubStateAssociationId;
    }
    return false;
  };

  const isEventInAnyState = (event: RaceEvent): boolean => {
    return event.displayCategory?.startsWith('state_') || event.eventLevel === 'state';
  };

  const filteredEvents = Object.values(uniqueEvents)
    .filter(event => {
      const eventDate = new Date(event.date);
      if (eventDate.getFullYear() !== selectedYear) {
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);

      if (timeFilter === 'upcoming' && eventDate < today) {
        return false;
      }
      if (timeFilter === 'past' && eventDate >= today) {
        return false;
      }

      if (activeFilters.raceFormat && event.raceFormat !== activeFilters.raceFormat) {
        return false;
      }
      if (activeFilters.raceClass && event.raceClass !== activeFilters.raceClass) {
        return false;
      }
      if (activeFilters.eventType === 'club' && event.isPublicEvent) {
        return false;
      }
      if (activeFilters.eventType === 'public' && !event.isPublicEvent) {
        return false;
      }
      if (activeFilters.eventType === 'state' && event.eventLevel !== 'state') {
        return false;
      }
      if (activeFilters.eventType === 'national' && event.eventLevel !== 'national') {
        return false;
      }

      if (eventScope === 'club') {
        if (event.isExternalEvent || event.isPublicEvent) return false;
      } else if (eventScope === 'my_state') {
        if (event.isExternalEvent) {
          if (!isEventInMyState(event)) return false;
        } else if (event.isPublicEvent && event.eventLevel === 'state') {
          // keep
        } else if (!event.isExternalEvent && !event.isPublicEvent) {
          return false;
        } else {
          return false;
        }
      } else if (eventScope === 'national') {
        if (event.isExternalEvent) {
          if (event.displayCategory !== 'national' && event.eventLevel !== 'national') return false;
        } else if (event.isPublicEvent && event.eventLevel === 'national') {
          // keep
        } else if (!event.isExternalEvent && !event.isPublicEvent) {
          return false;
        } else {
          return false;
        }
      } else if (eventScope === 'all_states') {
        if (event.isExternalEvent) {
          if (!isEventInAnyState(event)) return false;
        } else if (event.isPublicEvent && event.eventLevel === 'state') {
          // keep
        } else if (!event.isExternalEvent && !event.isPublicEvent) {
          return false;
        } else {
          return false;
        }
      }
      // 'all' scope: club events + my state external events + national external events (default)
      else if (eventScope === 'all') {
        if (event.isExternalEvent) {
          const isNational = event.displayCategory === 'national' || event.eventLevel === 'national';
          const isMyState = isEventInMyState(event);
          if (!isNational && !isMyState) return false;
        }
      }

      return true;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const filteredMeetings = calendarMeetings.filter(meeting => {
    const meetingDate = new Date(meeting.date);
    if (meetingDate.getFullYear() !== selectedYear) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const md = new Date(meeting.date);
    md.setHours(0, 0, 0, 0);

    if (timeFilter === 'upcoming' && md < today) return false;
    if (timeFilter === 'past' && md >= today) return false;

    return true;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  type CalendarItem = { type: 'event'; data: RaceEvent; date: string } | { type: 'meeting'; data: CalendarMeeting; date: string };

  const allCalendarItems: CalendarItem[] = [
    ...(calendarTypeFilter !== 'meetings' ? filteredEvents.map(e => ({ type: 'event' as const, data: e, date: e.date })) : []),
    ...(calendarTypeFilter !== 'events' ? filteredMeetings.map(m => ({ type: 'meeting' as const, data: m, date: m.date })) : []),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const getCalendarItemsForDate = (day: number) => {
    if (!day) return [];
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return allCalendarItems.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate.getDate() === day &&
             itemDate.getMonth() === date.getMonth() &&
             itemDate.getFullYear() === date.getFullYear();
    });
  };

  const toggleFilter = (type: 'raceFormat' | 'raceClass' | 'eventType', value: string) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      if (newFilters[type] === value) {
        delete newFilters[type];
      } else {
        newFilters[type] = value as any;
      }
      return newFilters;
    });
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getMonthData = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDayOfMonth = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const getEventsForDate = (day: number) => {
    if (!day) return [];
    
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.getDate() === day &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  };

  const getEventsForMonth = (month: number) => {
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.getMonth() === month &&
             eventDate.getFullYear() === currentDate.getFullYear();
    });
  };

  const monthData = getMonthData();

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth()));
  };

  const prevYear = () => {
    setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth()));
  };

  const handleViewSeriesStandings = (seriesId: string) => {
    console.log('Viewing series standings for:', seriesId);
    const series = seriesMap[seriesId];
    if (series) {
      console.log('Found series:', series);
      setSelectedSeries(series);
    } else {
      console.error('Series not found:', seriesId);
    }
  };

  const handleVenueClick = (venueName: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedVenue(venueName);
    setShowVenueDetails(true);
  };

  const handleEventClick = async (event: RaceEvent) => {
    console.log('🔵 [handleEventClick] Event clicked:', event.eventName);
    console.log('🔵 [handleEventClick] isSeriesEvent:', event.isSeriesEvent);
    console.log('🔵 [handleEventClick] seriesId:', event.seriesId);
    console.log('🔵 [handleEventClick] roundName:', event.roundName);
    console.log('🔵 [handleEventClick] skippers in event object:', event.skippers?.length || 0);

    // Fetch fresh event data from database (only if online)
    if (currentClub?.clubId && event.id && navigator.onLine) {
      try {
        // Handle series rounds differently
        if (event.isSeriesEvent && event.seriesId && event.roundName) {
          console.log('✅ [handleEventClick] This IS a series round, fetching from race_series table');
          console.log('✅ [handleEventClick] Series ID:', event.seriesId);
          console.log('✅ [handleEventClick] Round Name:', event.roundName);

          // Fetch the series from the database
          const { data: seriesData, error: seriesError } = await supabase
            .from('race_series')
            .select('rounds')
            .eq('id', event.seriesId)
            .eq('club_id', currentClub.clubId)
            .single();

          if (!seriesError && seriesData && seriesData.rounds) {
            // Find the specific round
            const round = (seriesData.rounds as any[]).find(
              (r: any) => (r.name === event.roundName || r.roundName === event.roundName)
            );

            if (round) {
              console.log('✅ [RaceCalendar] Found fresh round data for:', event.roundName);
              console.log('✅ [RaceCalendar] Skippers:', round.skippers?.length || 0);
              console.log('✅ [RaceCalendar] Race results:', round.raceResults?.length || 0);
              console.log('✅ [RaceCalendar] Last completed:', round.lastCompletedRace || 0);
              console.log('✅ [RaceCalendar] Round data:', round);

              // Merge fresh round data with the event
              const freshEvent = {
                ...event,
                skippers: round.skippers || [],
                raceResults: round.raceResults || [],
                lastCompletedRace: round.lastCompletedRace || 0,
                hasDeterminedInitialHcaps: round.hasDeterminedInitialHcaps || false,
                isManualHandicaps: round.isManualHandicaps || false,
                completed: round.completed || false,
                heatManagement: round.heatManagement,
                numRaces: round.numRaces,
                dropRules: round.dropRules
              };

              console.log('✅ [RaceCalendar] Fresh event created with', freshEvent.skippers.length, 'skippers');
              setSelectedEvent(freshEvent);
              return;
            } else {
              console.log('❌ [RaceCalendar] Round not found for:', event.roundName);
            }
          }
        } else {
          // Handle single events
          console.log('🔵 [handleEventClick] This is NOT a series round, fetching from race_events table');
          const dbId = event.id.includes('-') ? event.id.split('-')[1] : event.id;
          const { data, error } = await supabase
            .from('race_events')
            .select('*')
            .eq('id', dbId)
            .eq('club_id', currentClub.clubId)
            .single();

          if (!error && data) {
            // Merge fresh database data with the event
            const freshEvent = {
              ...event,
              skippers: data.skippers || event.skippers || [],
              raceResults: data.race_results || event.raceResults || [],
              lastCompletedRace: data.last_completed_race || event.lastCompletedRace || 0,
              dayResults: data.day_results || event.dayResults || {},
              completed: data.completed || event.completed || false,
            };
            setSelectedEvent(freshEvent);
            return;
          }
        }
      } catch (err) {
        console.error('❌ [handleEventClick] Error fetching fresh event data:', err);
      }
    }

    // Fallback to using the event as-is
    console.log('⚠️ [handleEventClick] Using event as-is (fallback), skippers:', event.skippers?.length || 0);
    setSelectedEvent(event);
  };

  const handleCloseEventDetails = () => {
    setSelectedEvent(null);
  };

  const handleSubscribeToCalendar = () => {
    const clubName = currentClub?.club?.name || 'Race Calendar';
    const eventsToExport = filteredEvents.filter(e => !e.completed && !e.cancelled);
    const icalContent = generateICalFile(eventsToExport, clubName);
    const filename = `${clubName.replace(/\s+/g, '-').toLowerCase()}-race-calendar.ics`;
    downloadICalFile(icalContent, filename);
    setShowSubscribeMenu(false);
  };

  const handleStartScoring = (eventFromDetails?: RaceEvent) => {
    // If event is provided from EventDetails, it has already been saved to localStorage
    // by EventDetails.handleStartScoring, so we don't need to call onEventSelect again
    // (calling it would overwrite with stale data)
    if (eventFromDetails) {
      console.log('🎯 [handleStartScoring] Event from EventDetails (already saved to localStorage):', {
        eventName: eventFromDetails.eventName,
        skippersCount: eventFromDetails.skippers?.length || 0,
        lastCompletedRace: eventFromDetails.lastCompletedRace,
        isSeriesEvent: eventFromDetails.isSeriesEvent,
        seriesId: eventFromDetails.seriesId,
        roundName: eventFromDetails.roundName
      });
      onStartScoring();
      return;
    }

    // For events selected directly from calendar (not via EventDetails modal)
    // we need to save them first
    if (selectedEvent) {
      console.log('🎯 [handleStartScoring] Event from selectedEvent (saving to localStorage):', {
        eventName: selectedEvent.eventName,
        skippersCount: selectedEvent.skippers?.length || 0,
        lastCompletedRace: selectedEvent.lastCompletedRace
      });
      onEventSelect(selectedEvent);
      onStartScoring();
    }
  };

  const renderMeetingListCard = (meeting: CalendarMeeting, index: number) => {
    const orgConfig = meeting.national_association_id
      ? { label: 'National', color: 'amber', Icon: Globe2 }
      : meeting.state_association_id
      ? { label: 'State', color: 'emerald', Icon: Globe2 }
      : { label: 'Club', color: 'blue', Icon: Building2 };

    const isCommittee = meeting.meeting_category === 'committee';
    const isPast = isDatePast(meeting.date);

    return (
      <button
        key={`meeting-${meeting.id}-${index}`}
        onClick={() => setSelectedMeeting(meeting)}
        className={`
          group w-full flex flex-col sm:flex-row gap-4 p-4 rounded-xl transition-all duration-300
          ${darkMode
            ? 'bg-slate-800/50 hover:bg-slate-800 border border-teal-500/20'
            : 'bg-white hover:bg-slate-50 border border-teal-200'}
          hover:shadow-lg
        `}
      >
        <div className="flex flex-col sm:flex-row gap-4 flex-1 min-w-0">
          <div className="relative w-full sm:w-48 h-32 rounded-lg overflow-hidden flex-shrink-0">
            <div className={`w-full h-full flex flex-col items-center justify-center ${
              darkMode ? 'bg-gradient-to-br from-teal-900/50 to-slate-800' : 'bg-gradient-to-br from-teal-50 to-slate-100'
            }`}>
              <Users size={24} className={darkMode ? 'text-teal-400' : 'text-teal-600'} />
              <span className={`text-xs mt-2 font-medium ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>Meeting</span>
            </div>
            <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg">
              <div className="text-center">
                <div className="text-xs font-semibold text-slate-900 leading-none">
                  {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                </div>
                <div className="text-xl font-bold text-slate-900 leading-tight">
                  {new Date(meeting.date).getDate()}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className={`text-base font-semibold truncate ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {meeting.name}
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {meeting.location && (
                  <>
                    <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <MapPin size={13} />
                      <span className="font-medium truncate">{meeting.location}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                  </>
                )}
                {meeting.start_time && (
                  <>
                    <div className={`flex items-center gap-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <Clock size={12} />
                      <span>{meeting.start_time.substring(0, 5)}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                  </>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  orgConfig.color === 'amber'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                    : orgConfig.color === 'emerald'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  <orgConfig.Icon size={10} className="inline mr-1" />
                  {meeting.organization_name || orgConfig.label}
                </span>
                {isCommittee && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    <Shield size={10} className="inline mr-1" />
                    Committee
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                  Meeting
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2">
              {meeting.attendees && meeting.attendees.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {meeting.attendees.slice(0, 5).map((attendee, i) => {
                      const initials = `${(attendee.first_name || '').charAt(0)}${(attendee.last_name || '').charAt(0)}`.toUpperCase();
                      return (
                        <div
                          key={i}
                          title={`${attendee.first_name} ${attendee.last_name}`}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 overflow-hidden ${
                            darkMode ? 'ring-slate-800' : 'ring-white'
                          }`}
                        >
                          {attendee.avatar_url ? (
                            <img src={attendee.avatar_url} alt={`${attendee.first_name} ${attendee.last_name}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${
                              darkMode ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white' : 'bg-gradient-to-br from-teal-400 to-emerald-400 text-white'
                            }`}>
                              {initials}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {meeting.attendees.length > 5 && (
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 ${
                        darkMode ? 'bg-slate-700 ring-slate-800 text-slate-300' : 'bg-slate-200 ring-white text-slate-700'
                      }`}>
                        +{meeting.attendees.length - 5}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {meeting.attendees.length} attending
                  </span>
                </div>
              )}
              {isPast && meeting.minutes_status === 'completed' && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-teal-500/20 text-teal-400 text-xs font-medium">
                  <FileText size={12} />
                  Minutes Available
                </div>
              )}
              {isPast && meeting.minutes_status !== 'completed' && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                  <Trophy size={12} />
                  Completed
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const renderListView = () => {
    const groupedItems = allCalendarItems.reduce((acc, item) => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!acc[monthKey]) {
        acc[monthKey] = {
          year: date.getFullYear(),
          month: date.toLocaleString('default', { month: 'long' }),
          items: []
        };
      }
      acc[monthKey].items.push(item);
      return acc;
    }, {} as Record<string, { year: number; month: string; items: CalendarItem[] }>);

    return (
      <div className="space-y-8">
        {Object.entries(groupedItems).map(([key, { month, year, items }]) => (
          <div key={key}>
            <div className="flex items-baseline gap-3 mb-4">
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                {month}
              </h3>
              <span className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{year}</span>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => {
                if (item.type === 'meeting') {
                  return renderMeetingListCard(item.data, index);
                }

                const event = item.data;
                const seriesName = getSeriesName(event);
                const displayTitle = event.isSeriesEvent
                  ? `${event.roundName} - ${seriesName}`
                  : event.eventName || event.clubName;

                const venueImage = getVenueImage(event.venue, event);
                const isPastEvent = isDatePast(event.date);
                const colors = event.raceClass ? boatTypeColors[event.raceClass] || defaultColorScheme : defaultColorScheme;
                const isNextEvent = isNextUpcomingEvent(event, filteredEvents);

                const skippers = event.skippers || [];
                const skipperCount = skippers.length;
                const isExpanded = expandedEventId === event.id;
                const displayedSkippers = isExpanded ? skippers : skippers.slice(0, 12);
                const avatars = displayedSkippers.map(skipper => {
                  const nameParts = skipper.name.trim().split(' ');
                  const initials = nameParts.length >= 2
                    ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
                    : skipper.name.substring(0, 2).toUpperCase();
                  return {
                    id: skipper.sailNo,
                    initials,
                    avatarUrl: skipper.avatarUrl,
                    name: skipper.name
                  };
                });

                return (
                  <button
                    key={`event-${event.id}-${index}`}
                    onClick={() => handleEventClick(event)}
                    className={`
                      group w-full flex flex-col sm:flex-row gap-4 p-4 rounded-xl transition-all duration-300
                      ${darkMode
                        ? `bg-slate-800/50 hover:bg-slate-800 ${isNextEvent ? 'ring-2 ring-green-500/50' : ''}`
                        : `bg-white hover:bg-slate-50 ${isNextEvent ? 'ring-2 ring-green-500/50' : 'border border-slate-200'}`}
                      ${isNextEvent ? 'shadow-lg shadow-green-500/20' : 'hover:shadow-lg'}
                    `}
                  >
                    <div className="flex flex-col sm:flex-row gap-4 flex-1 min-w-0">
                      <div className="relative w-full sm:w-48 h-32 rounded-lg overflow-hidden flex-shrink-0">
                        {venueImage ? (
                          <>
                            <img
                              src={venueImage}
                              alt={event.venue}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                          </>
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                            <MapPin size={20} className={`${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg">
                          <div className="text-center">
                            <div className="text-xs font-semibold text-slate-900 leading-none">
                              {new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                            </div>
                            <div className="text-xl font-bold text-slate-900 leading-tight">
                              {new Date(event.date).getDate()}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className={`text-base font-semibold truncate ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                              {displayTitle}
                            </h4>
                            {isNextEvent && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500 text-white whitespace-nowrap animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                Up Next
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              <MapPin size={13} />
                              <span className="font-medium truncate">{event.venue}</span>
                            </div>
                            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                            <span className={getRaceFormatBadge(event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>
                              {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                            </span>
                            <span className={getBoatClassBadge(event.raceClass, darkMode).className}>
                              {event.raceClass}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                          {skipperCount > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedEventId(isExpanded ? null : event.id);
                              }}
                              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                            >
                              <div className="flex -space-x-2">
                                {avatars.map((avatar, i) => (
                                  <div
                                    key={i}
                                    title={avatar.name}
                                    className={`
                                      w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 overflow-hidden
                                      ${darkMode
                                        ? 'ring-slate-800'
                                        : 'ring-white'}
                                    `}
                                  >
                                    {avatar.avatarUrl ? (
                                      <img
                                        src={avatar.avatarUrl}
                                        alt={avatar.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className={`w-full h-full flex items-center justify-center ${
                                        darkMode
                                          ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                                          : 'bg-gradient-to-br from-blue-400 to-cyan-400 text-white'
                                      }`}>
                                        {avatar.initials}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {!isExpanded && skipperCount > 5 && (
                                  <div
                                    className={`
                                      w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2
                                      ${darkMode
                                        ? 'bg-slate-700 ring-slate-800 text-slate-300'
                                        : 'bg-slate-200 ring-white text-slate-700'}
                                    `}
                                  >
                                    +{skipperCount - 12}
                                  </div>
                                )}
                              </div>
                              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                {skipperCount} {isPastEvent ? 'competed' : 'registered'}
                              </span>
                            </button>
                          )}
                          {isPastEvent && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                              <Trophy size={12} />
                              Completed
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {allCalendarItems.length === 0 && !loading && (
          <div className={`
            text-center py-12 rounded-lg border
            ${darkMode
              ? 'bg-slate-700/50 border-slate-600 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'}
          `}>
            <Calendar size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">No Events or Meetings Found</p>
            <p className="text-sm">Try adjusting your filters or add a new event</p>
          </div>
        )}
      </div>
    );
  };

  const renderMonthView = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={prevMonth}
            className={`
              p-2 rounded-lg transition-colors
              ${darkMode
                ? 'hover:bg-slate-700 text-slate-300'
                : 'hover:bg-slate-100 text-slate-600'}
            `}
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h3>
          <button
            onClick={nextMonth}
            className={`
              p-2 rounded-lg transition-colors
              ${darkMode
                ? 'hover:bg-slate-700 text-slate-300'
                : 'hover:bg-slate-100 text-slate-600'}
            `}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div
            key={day}
            className={`
              p-2 text-center text-sm font-medium
              ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-600'}
            `}
          >
            {day}
          </div>
        ))}
        {monthData.map((day, index) => {
          const dayItems = day ? getCalendarItemsForDate(day) : [];
          const isToday = day &&
            currentDate.getMonth() === new Date().getMonth() &&
            currentDate.getFullYear() === new Date().getFullYear() &&
            day === new Date().getDate();

          return (
            <div
              key={index}
              className={`
                min-h-[120px] p-2
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
                ${isToday ? darkMode ? 'ring-2 ring-blue-500' : 'ring-2 ring-blue-500' : ''}
              `}
            >
              {day && (
                <>
                  <div className={`
                    text-sm font-medium mb-2
                    ${darkMode ? 'text-slate-400' : 'text-slate-600'}
                  `}>
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayItems.map((item, itemIndex) => {
                      if (item.type === 'meeting') {
                        const meeting = item.data;
                        return (
                          <button
                            key={`m-${itemIndex}`}
                            onClick={() => setSelectedMeeting(meeting)}
                            className={`
                              w-full text-left p-1.5 rounded text-xs
                              ${darkMode
                                ? 'bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/20'
                                : 'bg-teal-50 hover:bg-teal-100 border border-teal-200'}
                            `}
                          >
                            <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                              {meeting.name}
                            </div>
                            <div className="flex flex-wrap gap-1 mb-1">
                              <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                                Meeting
                              </div>
                              {meeting.meeting_category === 'committee' && (
                                <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                  Committee
                                </div>
                              )}
                            </div>
                            {meeting.start_time && (
                              <div className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                                {meeting.start_time.substring(0, 5)}
                              </div>
                            )}
                          </button>
                        );
                      }

                      const event = item.data;
                      const seriesName = getSeriesName(event);
                      const displayTitle = event.isSeriesEvent
                        ? `${event.roundName} - ${seriesName}`
                        : event.eventName || event.clubName;
                      const colors = event.raceClass ? boatTypeColors[event.raceClass] || defaultColorScheme : defaultColorScheme;
                      const isNextEvent = isNextUpcomingEvent(event, filteredEvents);

                      return (
                        <button
                          key={`e-${itemIndex}`}
                          onClick={() => handleEventClick(event)}
                          className={`
                            w-full text-left p-1.5 rounded text-xs
                            ${darkMode
                              ? `bg-slate-700 hover:bg-slate-600 ${isNextEvent ? 'ring-1 ring-green-500' : ''}`
                              : `bg-slate-50 hover:bg-slate-100 ${isNextEvent ? 'ring-1 ring-green-500' : ''}`}
                          `}
                        >
                          <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                            {displayTitle}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">
                            <div className={`
                              px-1.5 py-0.5 rounded text-[10px] font-medium
                              ${event.raceFormat === 'handicap'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}
                            `}>
                              {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                            </div>
                            <div className={`
                              px-1.5 py-0.5 rounded text-[10px] font-medium
                              ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}
                            `}>
                              {event.raceClass}
                            </div>
                            {isNextEvent && (
                              <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                Next
                              </div>
                            )}
                          </div>

                          <div className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                            {event.venue}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMeetingGridCard = (meeting: CalendarMeeting, index: number) => {
    const isPast = isDatePast(meeting.date);
    const orgLabel = meeting.national_association_id ? 'National' : meeting.state_association_id ? 'State' : 'Club';

    return (
      <button
        key={`meeting-grid-${meeting.id}-${index}`}
        onClick={() => setSelectedMeeting(meeting)}
        className={`
          group w-full flex flex-col rounded-xl overflow-hidden transition-all duration-300 text-left
          ${darkMode
            ? 'bg-slate-800/50 hover:bg-slate-800 border border-teal-500/20'
            : 'bg-white hover:bg-slate-50 border border-teal-200'}
          hover:shadow-xl
        `}
      >
        <div className={`w-full h-40 flex flex-col items-center justify-center ${
          darkMode ? 'bg-gradient-to-br from-teal-900/40 to-slate-800' : 'bg-gradient-to-br from-teal-50 to-slate-100'
        }`}>
          <Users size={32} className={darkMode ? 'text-teal-400' : 'text-teal-600'} />
          <span className={`text-sm mt-2 font-medium ${darkMode ? 'text-teal-400' : 'text-teal-600'}`}>
            {meeting.organization_name || orgLabel} Meeting
          </span>
        </div>

        <div className="p-4 flex flex-col flex-1">
          <h4 className={`text-base font-semibold mb-2 line-clamp-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            {meeting.name}
          </h4>

          <div className={`flex items-center gap-1.5 text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <Calendar size={12} />
            <span className="font-medium">{formatDate(meeting.date)}</span>
            {meeting.start_time && (
              <>
                <span className="mx-1">at</span>
                <span>{meeting.start_time.substring(0, 5)}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <div className="px-2 py-1 rounded-md text-xs font-medium bg-teal-600 text-white">
              Meeting
            </div>
            {meeting.meeting_category === 'committee' && (
              <div className="px-2 py-1 rounded-md text-xs font-medium bg-amber-600 text-white">
                Committee
              </div>
            )}
            {isPast && meeting.minutes_status === 'completed' && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-500/20 text-teal-400 text-xs font-medium">
                <FileText size={11} />
                Minutes
              </div>
            )}
          </div>

          {meeting.attendees && meeting.attendees.length > 0 && (
            <div className={`mt-auto pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {meeting.attendees.slice(0, 4).map((attendee, i) => {
                    const initials = `${(attendee.first_name || '').charAt(0)}${(attendee.last_name || '').charAt(0)}`.toUpperCase();
                    return (
                      <div
                        key={i}
                        title={`${attendee.first_name} ${attendee.last_name}`}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 overflow-hidden ${
                          darkMode ? 'ring-slate-800' : 'ring-white'
                        }`}
                      >
                        {attendee.avatar_url ? (
                          <img src={attendee.avatar_url} alt={`${attendee.first_name} ${attendee.last_name}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${
                            darkMode ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white' : 'bg-gradient-to-br from-teal-400 to-emerald-400 text-white'
                          }`}>
                            {initials}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {meeting.attendees.length > 4 && (
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 ${
                      darkMode ? 'bg-slate-700 ring-slate-800 text-slate-300' : 'bg-slate-200 ring-white text-slate-700'
                    }`}>
                      +{meeting.attendees.length - 4}
                    </div>
                  )}
                </div>
                <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {meeting.attendees.length} attending
                </span>
              </div>
            </div>
          )}
        </div>
      </button>
    );
  };

  const renderGridView = () => {
    const groupedItems = allCalendarItems.reduce((acc, item) => {
      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!acc[monthKey]) {
        acc[monthKey] = {
          year: date.getFullYear(),
          month: date.toLocaleString('default', { month: 'long' }),
          items: []
        };
      }
      acc[monthKey].items.push(item);
      return acc;
    }, {} as Record<string, { year: number; month: string; items: CalendarItem[] }>);

    return (
      <div className="space-y-8">
        {Object.entries(groupedItems).map(([key, { month, year, items }]) => (
          <div key={key}>
            <div className="flex items-baseline gap-3 mb-4">
              <h3 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                {month}
              </h3>
              <span className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{year}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((item, index) => {
                if (item.type === 'meeting') {
                  return renderMeetingGridCard(item.data, index);
                }

                const event = item.data;
                const seriesName = getSeriesName(event);
                const displayTitle = event.isSeriesEvent
                  ? `${event.roundName} - ${seriesName}`
                  : event.eventName || event.clubName;

                const venueImage = getVenueImage(event.venue, event);
                const isPastEvent = isDatePast(event.date);
                const colors = event.raceClass ? boatTypeColors[event.raceClass] || defaultColorScheme : defaultColorScheme;
                const isNextEvent = isNextUpcomingEvent(event, filteredEvents);

                const skippers = event.skippers || [];
                const skipperCount = skippers.length;
                const isExpanded = expandedEventId === event.id;
                const displayedSkippers = isExpanded ? skippers : skippers.slice(0, 4);
                const avatars = displayedSkippers.map(skipper => {
                  const nameParts = skipper.name.trim().split(' ');
                  const initials = nameParts.length >= 2
                    ? `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`.toUpperCase()
                    : skipper.name.substring(0, 2).toUpperCase();
                  return {
                    id: skipper.sailNo,
                    initials,
                    avatarUrl: skipper.avatarUrl,
                    name: skipper.name
                  };
                });

                return (
                  <button
                    key={`event-grid-${event.id}-${index}`}
                    onClick={() => handleEventClick(event)}
                    className={`
                      group w-full flex flex-col rounded-xl overflow-hidden transition-all duration-300 text-left
                      ${darkMode
                        ? `bg-slate-800/50 hover:bg-slate-800 ${isNextEvent ? 'ring-2 ring-green-500/50' : ''}`
                        : `bg-white hover:bg-slate-50 ${isNextEvent ? 'ring-2 ring-green-500/50' : 'border border-slate-200'}`}
                      ${isNextEvent ? 'shadow-lg shadow-green-500/20' : 'hover:shadow-xl'}
                    `}
                  >
                    {venueImage ? (
                      <div className="relative w-full h-40 overflow-hidden">
                        <img
                          src={venueImage}
                          alt={event.venue}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                        {isNextEvent && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500 text-white animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                            Up Next
                          </div>
                        )}
                        <div className="absolute bottom-3 left-3 right-3">
                          <div className="flex items-center gap-1.5 text-white text-sm font-medium">
                            <MapPin size={14} />
                            <span className="truncate">{event.venue}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`w-full h-40 flex items-center justify-center ${
                        darkMode ? 'bg-slate-700/50' : 'bg-slate-100'
                      }`}>
                        <MapPin size={32} className={`${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                      </div>
                    )}

                    <div className="p-4 flex flex-col flex-1">
                      <h4 className={`text-base font-semibold mb-2 line-clamp-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {displayTitle}
                      </h4>

                      <div className={`flex items-center gap-1.5 text-xs mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Calendar size={12} />
                        <span className="font-medium">{formatDate(event.date)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <div className={`
                          px-2 py-1 rounded-md text-xs font-medium
                          ${event.raceFormat === 'handicap'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-600 text-white'}
                        `}>
                          {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                        </div>
                        <div className="px-2 py-1 rounded-md text-xs font-medium bg-slate-600 text-white">
                          {event.raceClass}
                        </div>
                        {isPastEvent && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                            <Trophy size={11} />
                            Done
                          </div>
                        )}
                      </div>

                      {skipperCount > 0 && (
                        <div className={`mt-auto pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedEventId(isExpanded ? null : event.id);
                            }}
                            className="w-full flex items-center gap-2 hover:opacity-80 transition-opacity"
                          >
                            <div className={`flex ${isExpanded ? 'flex-wrap gap-2' : '-space-x-2'}`}>
                              {avatars.map((avatar, i) => (
                                <div
                                  key={i}
                                  title={avatar.name}
                                  className={`
                                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 overflow-hidden
                                    ${darkMode
                                      ? 'ring-slate-800'
                                      : 'ring-white'}
                                  `}
                                >
                                  {avatar.avatarUrl ? (
                                    <img
                                      src={avatar.avatarUrl}
                                      alt={avatar.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className={`w-full h-full flex items-center justify-center ${
                                      darkMode
                                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                                        : 'bg-gradient-to-br from-blue-400 to-cyan-400 text-white'
                                    }`}>
                                      {avatar.initials}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {!isExpanded && skipperCount > 4 && (
                                <div
                                  className={`
                                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2
                                    ${darkMode
                                      ? 'bg-slate-700 ring-slate-800 text-slate-300'
                                      : 'bg-slate-200 ring-white text-slate-700'}
                                  `}
                                >
                                  +{skipperCount - 12}
                                </div>
                              )}
                            </div>
                            <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {skipperCount} {isPastEvent ? 'competed' : 'registered'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {allCalendarItems.length === 0 && !loading && (
          <div className={`
            text-center py-12 rounded-lg border
            ${darkMode
              ? 'bg-slate-700/50 border-slate-600 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'}
          `}>
            <Calendar size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">No Events or Meetings Found</p>
            <p className="text-sm">Try adjusting your filters or add a new event</p>
          </div>
        )}
      </div>
    );
  };

  const getItemsForMonth = (month: number): CalendarItem[] => {
    return allCalendarItems.filter(item => {
      const d = new Date(item.date);
      return d.getMonth() === month && d.getFullYear() === currentDate.getFullYear();
    });
  };

  const renderYearView = () => {
    const months = Array.from({ length: 12 }, (_, i) => i);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={prevYear}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode
                  ? 'hover:bg-slate-700 text-slate-300'
                  : 'hover:bg-slate-100 text-slate-600'}
              `}
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              {currentDate.getFullYear()}
            </h3>
            <button
              onClick={nextYear}
              className={`
                p-2 rounded-lg transition-colors
                ${darkMode
                  ? 'hover:bg-slate-700 text-slate-300'
                  : 'hover:bg-slate-100 text-slate-600'}
              `}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
          {months.map(month => {
            const monthItems = getItemsForMonth(month);
            const isCurrentMonth =
              new Date().getMonth() === month &&
              new Date().getFullYear() === currentDate.getFullYear();

            return (
              <div
                key={month}
                className={`
                  p-4 rounded-lg
                  ${darkMode ? 'bg-slate-800' : 'bg-white'}
                  ${isCurrentMonth ? darkMode ? 'ring-2 ring-blue-500' : 'ring-2 ring-blue-500' : ''}
                `}
              >
                <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {new Date(currentDate.getFullYear(), month).toLocaleString('default', { month: 'long' })}
                </h4>
                <div className="space-y-2">
                  {monthItems.map((item, index) => {
                    if (item.type === 'meeting') {
                      const meeting = item.data;
                      const meetingDate = new Date(meeting.date);
                      return (
                        <div key={`m-${index}`} className="flex items-center gap-1">
                          <button
                            onClick={() => setSelectedMeeting(meeting)}
                            className={`
                              flex-1 text-left p-2 rounded text-xs
                              ${darkMode
                                ? 'bg-teal-900/30 hover:bg-teal-900/50 border border-teal-500/20'
                                : 'bg-teal-50 hover:bg-teal-100 border border-teal-200'}
                            `}
                          >
                            <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                              {meeting.name}
                            </div>
                            <div className="flex flex-wrap gap-1 mb-1">
                              <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                                Meeting
                              </div>
                              {meeting.meeting_category === 'committee' && (
                                <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                  Committee
                                </div>
                              )}
                            </div>
                            <div className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              {meetingDate.getDate()} {meetingDate.toLocaleString('default', { month: 'short' })}
                              {meeting.location ? ` - ${meeting.location}` : ''}
                            </div>
                          </button>
                        </div>
                      );
                    }

                    const event = item.data;
                    const seriesName = getSeriesName(event);
                    const displayTitle = event.isSeriesEvent
                      ? `${event.roundName} - ${seriesName}`
                      : event.eventName || event.clubName;
                    const eventDate = new Date(event.date);
                    const colors = event.raceClass ? boatTypeColors[event.raceClass] || defaultColorScheme : defaultColorScheme;
                    const isNextEvent = isNextUpcomingEvent(event, filteredEvents);

                    return (
                      <div key={`e-${index}`} className="flex items-center gap-1">
                        <button
                          onClick={() => handleEventClick(event)}
                          className={`
                            flex-1 text-left p-2 rounded text-xs
                            ${darkMode
                              ? `bg-slate-700 hover:bg-slate-600 ${isNextEvent ? 'ring-1 ring-green-500' : ''}`
                              : `bg-slate-50 hover:bg-slate-100 ${isNextEvent ? 'ring-1 ring-green-500' : ''}`}
                          `}
                        >
                          <div className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                            {displayTitle}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">
                            <div className={`
                              px-1.5 py-0.5 rounded text-[10px] font-medium
                              ${event.raceFormat === 'handicap'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}
                            `}>
                              {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                            </div>
                            <div className={`
                              px-1.5 py-0.5 rounded text-[10px] font-medium
                              ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}
                            `}>
                              {event.raceClass}
                            </div>
                            {isNextEvent && (
                              <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                Next
                              </div>
                            )}
                          </div>

                          <div className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {eventDate.getDate()} {eventDate.toLocaleString('default', { month: 'short' })} - {event.venue}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  {monthItems.length === 0 && (
                    <div className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      No events
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 lg:mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Calendar className="text-white" size={28} />
            </div>
            <div>
              <h2 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Race Calendar
              </h2>
              {sailingDays.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {sailingDays.map((day) => (
                    <div
                      key={day.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                        darkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'
                      }`}
                    >
                      <Calendar size={14} className="text-blue-500" />
                      <span className={`text-sm font-medium ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        {day.day_of_week}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {day.start_time.substring(0, 5)}-{day.end_time.substring(0, 5)}
                      </span>
                      {day.boat_class_name && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {day.boat_class_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
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

            {/* Time Filter - Past/Upcoming */}
            <div className={`
              flex items-center gap-1 rounded-lg overflow-hidden border flex-1 sm:flex-none
              ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
            `}>
              <button
                onClick={() => setTimeFilter('upcoming')}
                className={`
                  flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm font-medium transition-all whitespace-nowrap
                  ${timeFilter === 'upcoming'
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
                    : darkMode
                      ? 'text-slate-300 hover:bg-slate-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }
                `}
              >
                Upcoming Events
              </button>
              <button
                onClick={() => setTimeFilter('past')}
                className={`
                  flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap
                  ${timeFilter === 'past'
                    ? 'bg-slate-600 text-white'
                    : darkMode
                      ? 'text-slate-300 hover:bg-slate-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }
                `}
              >
                Past Events
              </button>
            </div>

            {/* Calendar Type Filter */}
            {calendarMeetings.length > 0 && (
              <div className={`
                flex items-center gap-1 rounded-lg overflow-hidden border flex-1 sm:flex-none
                ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
              `}>
                <button
                  onClick={() => setCalendarTypeFilter('all')}
                  className={`
                    flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-all whitespace-nowrap
                    ${calendarTypeFilter === 'all'
                      ? 'bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-lg'
                      : darkMode
                        ? 'text-slate-300 hover:bg-slate-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }
                  `}
                >
                  All
                </button>
                <button
                  onClick={() => setCalendarTypeFilter('events')}
                  className={`
                    flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5
                    ${calendarTypeFilter === 'events'
                      ? 'bg-blue-600 text-white'
                      : darkMode
                        ? 'text-slate-300 hover:bg-slate-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }
                  `}
                >
                  <Trophy size={14} />
                  Events
                </button>
                <button
                  onClick={() => setCalendarTypeFilter('meetings')}
                  className={`
                    flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5
                    ${calendarTypeFilter === 'meetings'
                      ? 'bg-teal-600 text-white'
                      : darkMode
                        ? 'text-slate-300 hover:bg-slate-700'
                        : 'text-slate-700 hover:bg-slate-100'
                    }
                  `}
                >
                  <Users size={14} />
                  Meetings
                </button>
              </div>
            )}

            {/* Location Explorer Button */}
            <button
              onClick={handleOpenLocationExplorer}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border overflow-hidden group
                ${darkMode
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 border-cyan-500 text-white'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 border-cyan-400 text-white'}
              `}
            >
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              <MapIcon size={16} className="relative z-10" />
              <span className="relative z-10 whitespace-nowrap">Explore Locations</span>
              <div className="relative z-10 w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
            </button>

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
                        onClick={() => toggleFilter('raceFormat', 'scratch')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-colors
                          ${activeFilters.raceFormat === 'scratch'
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
                        onClick={() => toggleFilter('raceFormat', 'handicap')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-colors
                          ${activeFilters.raceFormat === 'handicap'
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

                  <div className="border-t border-slate-700 my-2"></div>

                  {/* Boat Class */}
                  <div className="px-4 py-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Class
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(events.map(e => e.raceClass))).map(type => {
                        if (!type) return null;
                        const typeColors = boatTypeColors[type] || defaultColorScheme;
                        return (
                          <button
                            key={type}
                            onClick={() => toggleFilter('raceClass', type)}
                            className={`
                              px-3 py-1.5 rounded text-sm transition-colors
                              ${activeFilters.raceClass === type
                                ? `${typeColors.bg} ${typeColors.text} ${typeColors.darkBg} ${typeColors.darkText}`
                                : darkMode
                                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }
                            `}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-700 my-2"></div>

                  {/* Event Type */}
                  <div className="px-4 py-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                      Event Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleFilter('eventType', 'club')}
                        className={`
                          px-3 py-1.5 rounded text-sm transition-all
                          ${activeFilters.eventType === 'club'
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        Club
                      </button>
                      <button
                        onClick={() => toggleFilter('eventType', 'public')}
                        className={`
                          flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                          ${activeFilters.eventType === 'public'
                            ? 'bg-blue-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        <Globe size={14} />
                        Public
                      </button>
                      <button
                        onClick={() => toggleFilter('eventType', 'state')}
                        className={`
                          flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                          ${activeFilters.eventType === 'state'
                            ? 'bg-amber-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        <MapPin size={14} />
                        State
                      </button>
                      <button
                        onClick={() => toggleFilter('eventType', 'national')}
                        className={`
                          flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors
                          ${activeFilters.eventType === 'national'
                            ? 'bg-teal-600 text-white'
                            : darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }
                        `}
                      >
                        <Flag size={14} />
                        National
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`
              flex items-center gap-1 rounded-lg border flex-1 sm:flex-none
              ${darkMode
                ? 'bg-slate-800 border-slate-700'
                : 'bg-white border-slate-200'}
            `}>
              <button
                onClick={() => setView('list')}
                className={`
                  flex-1 sm:flex-none p-2 transition-colors flex items-center justify-center gap-1
                  ${view === 'list'
                    ? darkMode
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-800'
                    : darkMode
                      ? 'text-slate-400 hover:text-slate-300'
                      : 'text-slate-600 hover:text-slate-800'
                  }
                `}
              >
                <List size={18} />
                <span className="text-sm hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => setView('grid')}
                className={`
                  flex-1 sm:flex-none p-2 transition-colors flex items-center justify-center gap-1
                  ${view === 'grid'
                    ? darkMode
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-800'
                    : darkMode
                      ? 'text-slate-400 hover:text-slate-300'
                      : 'text-slate-600 hover:text-slate-800'
                  }
                `}
              >
                <Grid size={18} />
                <span className="text-sm hidden sm:inline">Grid</span>
              </button>
              <button
                onClick={() => setView('month')}
                className={`
                  flex-1 sm:flex-none p-2 transition-colors flex items-center justify-center gap-1
                  ${view === 'month'
                    ? darkMode
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-800'
                    : darkMode
                      ? 'text-slate-400 hover:text-slate-300'
                      : 'text-slate-600 hover:text-slate-800'
                  }
                `}
              >
                <CalendarDays size={18} />
                <span className="text-sm hidden sm:inline">Month</span>
              </button>
              <button
                onClick={() => setView('year')}
                className={`
                  flex-1 sm:flex-none p-2 transition-colors flex items-center justify-center gap-1
                  ${view === 'year'
                    ? darkMode
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-100 text-slate-800'
                    : darkMode
                      ? 'text-slate-400 hover:text-slate-300'
                      : 'text-slate-600 hover:text-slate-800'
                  }
                `}
              >
                <CalendarRange size={18} />
                <span className="text-sm">Year</span>
              </button>
            </div>

            {/* Subscribe to Calendar */}
            <div className="relative" ref={subscribeMenuRef}>
              <button
                onClick={() => setShowSubscribeMenu(!showSubscribeMenu)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap
                  ${darkMode
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 border-blue-500 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 border-blue-400 text-white'}
                `}
              >
                <Link2 size={16} />
                Subscribe
              </button>

              {showSubscribeMenu && (
                <div className={`
                  absolute right-0 mt-2 w-72 rounded-lg shadow-xl border py-2 z-50
                  ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
                `}>
                  <div className="px-4 py-2 border-b border-slate-700">
                    <h4 className={`font-semibold text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      Subscribe to Calendar
                    </h4>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Download an iCal file to sync upcoming events to your calendar app
                    </p>
                  </div>

                  <div className="py-2">
                    <button
                      onClick={handleSubscribeToCalendar}
                      className={`
                        w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors
                        ${darkMode
                          ? 'hover:bg-slate-700 text-slate-200'
                          : 'hover:bg-slate-50 text-slate-800'}
                      `}
                    >
                      <Calendar size={16} />
                      <div>
                        <div className="font-medium">Download .ics File</div>
                        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Works with Google, Apple, Outlook
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className={`px-4 py-2 border-t text-xs ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                    <p className="mb-1 font-medium">How to use:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Google Calendar: Import from Settings</li>
                      <li>Apple Calendar: Double-click the file</li>
                      <li>Outlook: Import from File menu</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {onClose && (
              <button
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
            )}
          </div>
        </div>

        {/* Event Scope Tabs */}
        {currentOrganization?.type !== 'state' && currentOrganization?.type !== 'national' && (
          <div className={`flex items-center gap-1 p-1 rounded-xl mt-4 ${
            darkMode ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-slate-100 border border-slate-200'
          }`}>
            {([
              { key: 'all' as EventScope, label: 'All Events', icon: Calendar, desc: 'Club + My State + National' },
              { key: 'club' as EventScope, label: 'Club', icon: Building2, desc: 'Club events only' },
              { key: 'my_state' as EventScope, label: clubStateAssociationId ? (stateAssociationNames[clubStateAssociationId] || 'My State') : 'My State', icon: MapPin, desc: 'Your state events' },
              { key: 'national' as EventScope, label: 'National', icon: Flag, desc: 'National events' },
              { key: 'all_states' as EventScope, label: 'All States', icon: Globe, desc: 'All state events' },
            ]).map(tab => {
              const isActive = eventScope === tab.key;
              const Icon = tab.icon;
              const count = tab.key === 'all' ? undefined :
                tab.key === 'club' ? Object.values(uniqueEvents).filter(e => !e.isExternalEvent && !e.isPublicEvent).length :
                tab.key === 'my_state' ? Object.values(uniqueEvents).filter(e => isEventInMyState(e)).length :
                tab.key === 'national' ? Object.values(uniqueEvents).filter(e => e.isExternalEvent && (e.displayCategory === 'national' || e.eventLevel === 'national')).length :
                tab.key === 'all_states' ? Object.values(uniqueEvents).filter(e => isEventInAnyState(e)).length :
                undefined;

              return (
                <button
                  key={tab.key}
                  onClick={() => handleEventScopeChange(tab.key)}
                  title={tab.desc}
                  className={`
                    flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none justify-center
                    ${isActive
                      ? tab.key === 'national'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                        : tab.key === 'my_state'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                        : tab.key === 'club'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20'
                        : tab.key === 'all_states'
                        ? 'bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-500/20'
                        : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/20'
                      : darkMode
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white'
                    }
                  `}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className={`
              text-center py-12 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                : 'bg-slate-50 border-slate-200 text-slate-600'}
            `}>
              Loading events...
            </div>
          ) : error ? (
            <div className={`
              text-center py-12 rounded-lg border
              ${darkMode 
                ? 'bg-red-900/10 border-red-900/20 text-red-400' 
                : 'bg-red-50 border-red-100 text-red-600'}
            `}>
              {error}
            </div>
          ) : (
            <>
              {view === 'list' && renderListView()}
              {view === 'grid' && renderGridView()}
              {view === 'month' && renderMonthView()}
              {view === 'year' && renderYearView()}
            </>
          )}
        </div>
      </div>

      {selectedSeries && (
        <SeriesLeaderboard
          series={selectedSeries}
          darkMode={darkMode}
          onClose={() => setSelectedSeries(null)}
        />
      )}

      {showVenueDetails && selectedVenue && (
        <VenueDetails
          venueName={selectedVenue}
          darkMode={darkMode}
          onClose={() => {
            setShowVenueDetails(false);
            setSelectedVenue(null);
          }}
        />
      )}

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          darkMode={darkMode}
          onStartScoring={handleStartScoring}
          onClose={handleCloseEventDetails}
          onViewVenue={(venueName) => handleVenueClick(venueName)}
        />
      )}

      {selectedMeeting && (
        <CalendarMeetingDetailsModal
          meeting={selectedMeeting}
          darkMode={darkMode}
          onClose={() => setSelectedMeeting(null)}
        />
      )}

      {showLocationExplorer && (
        <LocationExplorer
          key="location-explorer"
          events={allPublicEvents}
          venues={allVenues}
          darkMode={darkMode}
          onClose={() => setShowLocationExplorer(false)}
          onEventClick={handleEventClick}
        />
      )}
    </div>
  );
};