import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, TrendingUp, Search, Calendar, MapPin, Users, CheckCircle2, Clock, ChevronRight, X, Grid as GridIcon, List as ListIcon, Download, ChevronDown, FileImage, FileText, Table, XCircle, Send, Edit2, Globe } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';
import { RaceSeries, RaceEvent } from '../types/race';
import { HeatDesignation } from '../types/heat';
import { LetterScore, getLetterScoreValue } from '../types';
import { getLetterScorePointsForRace } from '../utils/scratchCalculations';
import { getStoredRaceSeries, getStoredRaceEvents, combineAllDayResults, storeRaceSeries } from '../utils/raceStorage';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { formatDate } from '../utils/date';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { boatTypeColors, defaultColorScheme } from '../constants/colors';
import EventResultsDisplay from '../components/EventResultsDisplay';
import SeriesResultsDisplay from '../components/SeriesResultsDisplay';
import ExternalResultsDisplay from '../components/ExternalResultsDisplay';
import { getStoredVenues } from '../utils/venueStorage';
import { Venue } from '../types/venue';
import { supabase } from '../utils/supabase';
import { CreateReportSplitButton } from '../components/CreateReportSplitButton';
import { RaceReportModal } from '../components/RaceReportModal';
import { EventDetails } from '../components/EventDetails';
import { PublishToMetaModal } from '../components/PublishToMetaModal';
import { HeatRaceResultsModal } from '../components/HeatRaceResultsModal';
import { SeriesEditModal } from '../components/SeriesEditModal';

type MainTab = 'events' | 'leaderboards' | 'national' | 'world';
type StatusFilter = 'all' | 'completed' | 'in-progress';

interface ExternalResultEvent {
  id: string;
  event_name: string;
  event_date: string | null;
  event_end_date: string | null;
  venue: string | null;
  boat_class_raw: string | null;
  boat_class_mapped: string | null;
  competitor_count: number;
  race_count: number;
  display_category: 'national' | 'world';
  source_url: string;
  results_json: any[] | null;
  last_scraped_at: string | null;
}
type ViewMode = 'list' | 'grid';

interface RoundResult {
  id: string;
  seriesId: string;
  seriesName: string;
  roundName: string;
  roundIndex: number;
  date: string;
  venue: string;
  raceClass: string;
  raceFormat: string;
  completed: boolean;
  raceResults: any[];
  skippers: any[];
  clubName: string;
}

export const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentClub, currentOrganization } = useAuth();
  const { can } = usePermissions();
  const resultsRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('events');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Data
  const [allEvents, setAllEvents] = useState<RaceEvent[]>([]);
  const [allSeries, setAllSeries] = useState<RaceSeries[]>([]);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [clubFeaturedImage, setClubFeaturedImage] = useState<string | null>(null);
  const [previousSidebarState, setPreviousSidebarState] = useState<string | null>(null);
  const [externalNationalEvents, setExternalNationalEvents] = useState<ExternalResultEvent[]>([]);
  const [externalWorldEvents, setExternalWorldEvents] = useState<ExternalResultEvent[]>([]);

  // Selected item for detail view
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<RaceSeries | null>(null);
  const [selectedRound, setSelectedRound] = useState<RoundResult | null>(null);
  const [selectedExternalEvent, setSelectedExternalEvent] = useState<ExternalResultEvent | null>(null);

  // Export and modal state
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showRaceReportModal, setShowRaceReportModal] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showHeatResultsModal, setShowHeatResultsModal] = useState(false);
  const [showSeriesEditModal, setShowSeriesEditModal] = useState(false);

  useEffect(() => {
    loadData();
    loadClubFeaturedImage();
    loadExternalResults();
  }, [currentClub]);

  const loadClubFeaturedImage = async () => {
    if (!currentClub?.clubId) return;
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('featured_image_url')
        .eq('id', currentClub.clubId)
        .maybeSingle();

      if (!error && data) {
        setClubFeaturedImage(data.featured_image_url);
      }
    } catch (err) {
      console.error('Error loading club featured image:', err);
    }
  };

  const loadExternalResults = async () => {
    try {
      const { data } = await supabase
        .from('external_result_events')
        .select('id,event_name,event_date,event_end_date,venue,boat_class_raw,boat_class_mapped,competitor_count,race_count,display_category,source_url,results_json,last_scraped_at')
        .eq('is_visible', true)
        .order('event_date', { ascending: false });
      if (data) {
        setExternalNationalEvents(data.filter((e: ExternalResultEvent) => e.display_category === 'national'));
        setExternalWorldEvents(data.filter((e: ExternalResultEvent) => e.display_category === 'world'));
      }
    } catch (err) {
      console.error('Error loading external results:', err);
    }
  };

  // Auto-collapse sidebar when viewing individual results
  useEffect(() => {
    if (id && (selectedSeries || selectedEvent || selectedRound)) {
      // We're viewing individual results - collapse sidebar
      const currentState = localStorage.getItem('sidebarCollapsed');

      // Save the current state before we change it
      if (previousSidebarState === null) {
        setPreviousSidebarState(currentState);
      }

      // Force collapse
      localStorage.setItem('sidebarCollapsed', 'true');
      window.dispatchEvent(new Event('storage'));
    } else {
      // We're not viewing results anymore - restore previous state
      if (previousSidebarState !== null) {
        if (previousSidebarState) {
          localStorage.setItem('sidebarCollapsed', previousSidebarState);
        } else {
          localStorage.removeItem('sidebarCollapsed');
        }
        window.dispatchEvent(new Event('storage'));
        setPreviousSidebarState(null);
      }
    }
  }, [id, selectedSeries, selectedEvent, selectedRound]);

  useEffect(() => {
    // Check if navigation state includes event details
    const navState = location.state as any;
    let targetId = id;

    if (navState?.eventId) {
      targetId = navState.eventId;
    }

    if (targetId) {
      // Check if it's a round result (format: seriesId-round-roundIndex)
      if (targetId.includes('-round-')) {
        const parts = targetId.split('-round-');
        const seriesId = parts[0];
        const roundIndex = parseInt(parts[parts.length - 1]);
        const round = roundResults.find(r => r.seriesId === seriesId && r.roundIndex === roundIndex);
        if (round) {
          setSelectedRound(round);
          setSelectedEvent(null);
          setSelectedSeries(null);
          return;
        }
      }

      // Check if navigation state indicates it's a series event
      if (navState?.isSeriesEvent && navState?.seriesId) {
        const series = allSeries.find(s => s.id === navState.seriesId);
        if (series) {
          setSelectedSeries(series);
          setSelectedEvent(null);
          setSelectedRound(null);
          return;
        }
      }

      // Check if it's a series
      const series = allSeries.find(s => s.id === targetId);
      if (series) {
        setSelectedSeries(series);
        setSelectedEvent(null);
        setSelectedRound(null);
        return;
      }

      // Otherwise it's an event
      const event = allEvents.find(e => e.id === targetId);
      if (event) {
        setSelectedEvent(event);
        setSelectedSeries(null);
        setSelectedRound(null);
      }
    } else {
      setSelectedEvent(null);
      setSelectedSeries(null);
      setSelectedRound(null);
    }
  }, [id, location.state, allEvents, allSeries, roundResults]);

  const enrichSeriesWithRoundData = async (series: RaceSeries[]): Promise<RaceSeries[]> => {
    try {
      if (!currentClub?.clubId || series.length === 0) return series;

      const seriesIds = series.map(s => s.id);
      const { data: roundsData, error: roundsError } = await supabase
        .from('race_series_rounds')
        .select('series_id, round_name, skippers, race_results, last_completed_race, completed, average_points_applied, manual_score_overrides')
        .eq('club_id', currentClub.clubId)
        .in('series_id', seriesIds);

      if (roundsError || !roundsData) {
        console.error('Error fetching round data:', roundsError);
        return series;
      }

      const { data: seriesData, error: seriesError } = await supabase
        .from('race_series')
        .select('id, skippers')
        .eq('club_id', currentClub.clubId)
        .in('id', seriesIds);

      const seriesSkippersMap: Record<string, any[]> = {};
      if (seriesData && !seriesError) {
        seriesData.forEach(s => {
          seriesSkippersMap[s.id] = s.skippers || [];
        });
      }

      const roundDataMap: Record<string, any> = {};
      roundsData.forEach(round => {
        const key = `${round.series_id}-${round.round_name}`;
        roundDataMap[key] = round;
      });

      return series.map(s => ({
        ...s,
        skippers: seriesSkippersMap[s.id] || s.skippers || [],
        rounds: s.rounds.map(round => {
          const key = `${s.id}-${round.name}`;
          const roundData = roundDataMap[key];
          if (roundData) {
            const enrichedRound = {
              ...round,
              skippers: roundData.skippers || round.skippers || [],
              raceResults: roundData.race_results || round.raceResults || [],
              lastCompletedRace: roundData.last_completed_race || round.lastCompletedRace || 0,
              completed: roundData.completed !== undefined ? roundData.completed : round.completed,
              averagePointsApplied: roundData.average_points_applied || round.averagePointsApplied,
              manualScoreOverrides: roundData.manual_score_overrides || round.manualScoreOverrides
            };
            // Debug log for Round 3
            if (round.name === 'Round 3') {
              console.log('=== ENRICHING ROUND 3 ===');
              console.log('DB average_points_applied:', roundData.average_points_applied);
              console.log('Final averagePointsApplied:', enrichedRound.averagePointsApplied);
            }
            return enrichedRound;
          }
          return round;
        })
      }));
    } catch (err) {
      console.error('Error enriching series:', err);
      return series;
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [events, series, venuesData] = await Promise.all([
        getStoredRaceEvents(),
        getStoredRaceSeries(),
        getStoredVenues()
      ]);

      // Also fetch approved state/national public events to display
      let publicEvents: RaceEvent[] = [];
      try {
        const approvedPublicEvents = await getPublicEvents(
          false, // only approved events
          currentOrganization?.type as 'state' | 'national' | undefined,
          currentOrganization?.id
        );

        if (approvedPublicEvents) {
          publicEvents = approvedPublicEvents.map(pe => convertToRaceEvent(pe));

          // Fetch local copies of public events (for scoring data)
          if (currentClub?.clubId) {
            try {
              const { data: localCopies } = await supabase
                .from('quick_races')
                .select('id, public_event_id, skippers, race_results, last_completed_race, completed')
                .eq('club_id', currentClub.clubId)
                .not('public_event_id', 'is', null);

              console.log('📋 [ResultsPage] Found', localCopies?.length || 0, 'local copies of public events');

              // Merge local copy data into public events
              if (localCopies && localCopies.length > 0) {
                publicEvents = publicEvents.map(pe => {
                  const localCopy = localCopies.find(lc => lc.public_event_id === pe.publicEventId);
                  if (localCopy) {
                    console.log(`✅ [ResultsPage] Merging local copy data for ${pe.eventName}:`, {
                      skipperCount: localCopy.skippers?.length || 0,
                      resultCount: localCopy.race_results?.length || 0,
                      lastCompletedRace: localCopy.last_completed_race || 0
                    });
                    return {
                      ...pe,
                      id: localCopy.id,
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

      // Combine club events with public events
      // For state/national associations, only show public events (not club events)
      const allEvents = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? publicEvents
        : [...events, ...publicEvents];

      // For state/national associations, don't show club series
      const filteredSeries = (currentOrganization?.type === 'state' || currentOrganization?.type === 'national')
        ? []
        : series;

      const enrichedSeries = await enrichSeriesWithRoundData(filteredSeries);

      // Fetch member avatars if online
      let memberAvatarMap: Record<string, string> = {};
      if (navigator.onLine && currentClub?.clubId) {
        try {
          const { data: members } = await supabase
            .from('members')
            .select('first_name, last_name, avatar_url')
            .eq('club_id', currentClub.clubId);

          if (members) {
            members.forEach(m => {
              const fullName = `${m.first_name} ${m.last_name}`.trim();
              if (m.avatar_url) {
                memberAvatarMap[fullName] = m.avatar_url;
              }
            });
          }
        } catch (error) {
          console.error('Error fetching member avatars:', error);
        }
      }

      // Enrich events with avatar URLs (including public events with merged data)
      const enrichedEvents = allEvents.map(event => ({
        ...event,
        skippers: (event.skippers || []).map(skipper => ({
          ...skipper,
          avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
        }))
      }));

      // Extract round results from series
      const rounds: RoundResult[] = [];
      enrichedSeries.forEach(s => {
        s.rounds?.forEach((round, index) => {
          const hasResults = (round.raceResults && round.raceResults.length > 0) ||
                           (round.lastCompletedRace && round.lastCompletedRace > 0);

          if (hasResults) {
            rounds.push({
              id: `${s.id}-round-${index}`,
              seriesId: s.id,
              seriesName: s.seriesName,
              roundName: round.name,
              roundIndex: index,
              date: round.date,
              venue: round.venue,
              raceClass: s.raceClass,
              raceFormat: s.raceFormat,
              completed: round.completed || false,
              raceResults: round.raceResults || [],
              skippers: (round.skippers || []).map(skipper => ({
                ...skipper,
                avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
              })),
              clubName: s.clubName
            });
          }
        });
      });

      // Enrich series-level skippers with avatar URLs
      const enrichedSeriesWithAvatars = enrichedSeries.map(series => ({
        ...series,
        skippers: (series.skippers || []).map(skipper => ({
          ...skipper,
          avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
        })),
        rounds: series.rounds.map(round => ({
          ...round,
          skippers: (round.skippers || []).map(skipper => ({
            ...skipper,
            avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
          }))
        }))
      }));

      setAllEvents(enrichedEvents);
      setAllSeries(enrichedSeriesWithAvatars);
      setRoundResults(rounds);
      setVenues(venuesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVenueImage = (venueName: string): string | null => {
    const venue = venues.find(v => v.name === venueName);
    return venue?.image || null;
  };

  const getDefaultImage = (isSeries: boolean, series?: RaceSeries): string | null => {
    if (isSeries && series) {
      // First try club featured image
      if (clubFeaturedImage) {
        return clubFeaturedImage;
      }

      // Otherwise, find the most used venue in the series
      if (series.rounds && series.rounds.length > 0) {
        const venueCounts: Record<string, number> = {};
        series.rounds.forEach(round => {
          if (round.venue) {
            venueCounts[round.venue] = (venueCounts[round.venue] || 0) + 1;
          }
        });

        let mostUsedVenue = '';
        let highestCount = 0;
        Object.entries(venueCounts).forEach(([venue, count]) => {
          if (count > highestCount) {
            mostUsedVenue = venue;
            highestCount = count;
          }
        });

        if (mostUsedVenue) {
          return getVenueImage(mostUsedVenue);
        }
      }
    }
    return null;
  };

  const renderSkipperAvatarStack = (skippers: any[], maxVisible: number = 3) => {
    if (!skippers || skippers.length === 0) return null;

    const visibleSkippers = skippers.slice(0, maxVisible);
    const remainingCount = skippers.length - maxVisible;

    return (
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {visibleSkippers.map((skipper, index) => {
            const initials = skipper.name
              ? skipper.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
              : '?';

            return (
              <div
                key={index}
                className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium border-2 border-slate-800"
                title={skipper.name}
              >
                {skipper.avatarUrl ? (
                  <img
                    src={skipper.avatarUrl}
                    alt={skipper.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
            );
          })}
          {remainingCount > 0 && (
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-medium border-2 border-slate-800">
              +{remainingCount}
            </div>
          )}
        </div>
      </div>
    );
  };

  const filterItems = <T extends { eventName?: string; seriesName?: string; raceClass?: string; completed?: boolean; date?: string; rounds?: any[] }>(
    items: T[],
    search: string,
    status: StatusFilter,
    year: number
  ): T[] => {
    return items.filter(item => {
      // Year filter
      if (item.date) {
        // For events and rounds with direct dates
        const eventDate = new Date(item.date);
        if (eventDate.getFullYear() !== year) {
          return false;
        }
      } else if (item.rounds && Array.isArray(item.rounds)) {
        // For series, check if any round is in the selected year
        const hasRoundsInYear = item.rounds.some(round => {
          if (round.date) {
            const roundDate = new Date(round.date);
            return roundDate.getFullYear() === year;
          }
          return false;
        });
        if (!hasRoundsInYear) {
          return false;
        }
      }

      // Search filter
      const name = item.eventName || item.seriesName || '';
      if (search && !name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Status filter
      if (status === 'completed' && !item.completed) return false;
      if (status === 'in-progress' && item.completed) return false;

      return true;
    });
  };

  const sortByDateDesc = <T extends { date?: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA; // Newest first
    });
  };

  // Get unique years from all events, rounds, and series rounds
  const availableYears = Array.from(
    new Set([
      // Years from events and extracted round results
      ...[...allEvents, ...roundResults]
        .map(item => new Date(item.date || '').getFullYear())
        .filter(year => !isNaN(year)),
      // Years from series rounds
      ...allSeries.flatMap(series =>
        (series.rounds || [])
          .map(round => new Date(round.date || '').getFullYear())
          .filter(year => !isNaN(year))
      )
    ])
  ).sort((a, b) => b - a); // Sort descending (newest first)

  const filteredEvents = sortByDateDesc(filterItems([...allEvents, ...roundResults], searchTerm, statusFilter, selectedYear));
  const filteredSeries = filterItems(allSeries, searchTerm, statusFilter, selectedYear);

  // Group series by class
  const groupedSeries = filteredSeries.reduce((acc, series) => {
    const className = series.raceClass || 'Other';
    if (!acc[className]) {
      acc[className] = [];
    }
    acc[className].push(series);
    return acc;
  }, {} as Record<string, RaceSeries[]>);

  const renderCard = (
    item: RaceEvent | RoundResult | RaceSeries,
    type: 'event' | 'round' | 'series'
  ) => {
    const isEvent = type === 'event';
    const isRound = type === 'round';
    const isSeries = type === 'series';

    const name = isEvent
      ? (item as RaceEvent).eventName || ''
      : isRound
      ? (item as RoundResult).roundName || ''
      : (item as RaceSeries).seriesName;

    const date = isEvent || isRound ? (item as RaceEvent | RoundResult).date : '';
    const venue = isEvent || isRound ? (item as RaceEvent | RoundResult).venue : '';
    const raceClass = item.raceClass || '';
    const completed = item.completed || false;

    const colors = raceClass ? boatTypeColors[raceClass] || defaultColorScheme : defaultColorScheme;
    const venueImage = venue ? getVenueImage(venue) : null;
    const seriesItem = isSeries ? (item as RaceSeries) : undefined;
    const displayImage = venueImage || getDefaultImage(isSeries, seriesItem);

    const skippers = isEvent
      ? (item as RaceEvent).skippers || []
      : isRound
      ? (item as RoundResult).skippers || []
      : [];

    const competitorsCount = isEvent
      ? (item as RaceEvent).skippers?.length || 0
      : isRound
      ? (item as RoundResult).skippers?.length || 0
      : isSeries && (item as RaceSeries).rounds
      ? (item as RaceSeries).rounds.reduce((sum, r) => sum + (r.completed ? 1 : 0), 0)
      : 0;

    const handleClick = () => {
      navigate(`/results/${item.id}`);
    };

    if (viewMode === 'grid') {
      return (
        <button
          key={item.id}
          onClick={handleClick}
          className="group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] text-left flex flex-col"
        >
          <div className="relative h-40 flex-shrink-0 overflow-hidden bg-slate-900">
            {displayImage ? (
              <img
                src={displayImage}
                alt={venue || 'Event'}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                style={{ objectPosition: '50% 50%' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                {isSeries ? <TrendingUp className="text-slate-600" size={40} /> : <Trophy className="text-slate-600" size={40} />}
              </div>
            )}

            {completed && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/90 text-white backdrop-blur-sm">
                <CheckCircle2 size={12} />
                Completed
              </div>
            )}
            {!completed && !isSeries && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/90 text-white backdrop-blur-sm">
                <Clock size={12} />
                In Progress
              </div>
            )}

            {/* Date Badge - matching dashboard style */}
            {!isSeries && date && (
              <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                <div className="text-center">
                  <div className="text-xs font-semibold text-slate-900">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </div>
                  <div className="text-lg font-bold text-slate-900 leading-none">
                    {new Date(date).getDate()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4">
            {isSeries && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 mb-2">
                Series Leaderboard
              </div>
            )}
            {isRound && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 mb-2">
                Series Round
              </div>
            )}

            <h4 className="text-white font-medium mb-2 line-clamp-2 text-left">
              {isRound && `${(item as RoundResult).roundName} - ${(item as RoundResult).seriesName}`}
              {!isRound && name}
            </h4>

            <div className="flex flex-wrap gap-2 mb-3">
              {raceClass && (
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.darkBg} ${colors.darkText}`}>
                  {raceClass}
                </div>
              )}
              {!isSeries && (item as RaceEvent | RoundResult).raceFormat && (
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                  {(item as RaceEvent | RoundResult).raceFormat}
                </div>
              )}
              {isSeries && (item as RaceSeries).raceFormat && (
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                  {(item as RaceSeries).raceFormat}
                </div>
              )}
            </div>

            {date && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <Calendar size={14} />
                <span>{formatDate(date)}</span>
              </div>
            )}
            {venue && (
              <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                <MapPin size={14} />
                <span>{venue}</span>
              </div>
            )}
            {!isSeries && skippers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                {renderSkipperAvatarStack(skippers, 3)}
                <span className="ml-1">{skippers.length} competitors</span>
              </div>
            )}
            {isSeries && competitorsCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Users size={14} />
                <span>{competitorsCount} rounds completed</span>
              </div>
            )}
          </div>
        </button>
      );
    }

    // List view
    return (
      <button
        key={item.id}
        onClick={handleClick}
        className="group w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 transition-all duration-200"
      >
        <div className="relative w-32 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900">
          {displayImage ? (
            <img
              src={displayImage}
              alt={venue || 'Event'}
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 50%' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              {isSeries ? <TrendingUp className="text-slate-600" size={24} /> : <Trophy className="text-slate-600" size={24} />}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            {isSeries && (
              <div className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                Series Leaderboard
              </div>
            )}
            {isRound && (
              <div className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                Series Round
              </div>
            )}
            {completed && !isSeries && (
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
                <CheckCircle2 size={12} />
                Completed
              </div>
            )}
            {!completed && !isSeries && (
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">
                <Clock size={12} />
                In Progress
              </div>
            )}
          </div>

          <h4 className="text-white font-medium mb-1 truncate text-left">
            {isRound && `${(item as RoundResult).roundName} - ${(item as RoundResult).seriesName}`}
            {!isRound && name}
          </h4>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {date && (
              <div className="flex items-center gap-1">
                <Calendar size={14} />
                <span>{formatDate(date)}</span>
              </div>
            )}
            {venue && (
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>{venue}</span>
              </div>
            )}
            {!isSeries && skippers.length > 0 && (
              <div className="flex items-center gap-2">
                {renderSkipperAvatarStack(skippers, 3)}
                <span className="ml-1">{skippers.length} competitors</span>
              </div>
            )}
            {isSeries && competitorsCount > 0 && (
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>{competitorsCount} rounds</span>
              </div>
            )}
            {raceClass && (
              <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.darkBg} ${colors.darkText}`}>
                {raceClass}
              </div>
            )}
            {!isSeries && (item as RaceEvent | RoundResult).raceFormat && (
              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                {(item as RaceEvent | RoundResult).raceFormat}
              </div>
            )}
            {isSeries && (item as RaceSeries).raceFormat && (
              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                {(item as RaceSeries).raceFormat}
              </div>
            )}
          </div>
        </div>

        <ChevronRight className="text-slate-400 group-hover:text-white transition-colors flex-shrink-0" size={20} />
      </button>
    );
  };

  // Export helper functions
  const handleExportJPG = async () => {
    const tempContainer = document.createElement('div');

    try {
      const event = selectedEvent || (selectedRound ? {
        ...selectedRound,
        eventName: selectedRound.roundName
      } as RaceEvent : null);

      if (!selectedSeries && !event) {
        console.log('No series or event selected for export');
        return;
      }

      // Create temporary container for export-mode rendering
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = 'fit-content';
      document.body.appendChild(tempContainer);

      // Create export div with proper structure - fit to content
      const exportDiv = document.createElement('div');
      exportDiv.style.width = 'fit-content';
      exportDiv.style.display = 'inline-block';
      tempContainer.appendChild(exportDiv);

      // Render the component in export mode
      if (selectedSeries) {
        const seriesComponent = React.createElement(SeriesResultsDisplay, {
          series: selectedSeries,
          darkMode: false,
          isExportMode: true
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(seriesComponent);
      } else if (event) {
        const displayEvent = event.multiDay && event.dayResults
          ? { ...event, raceResults: combineAllDayResults(event) }
          : event;
        const eventComponent = React.createElement(EventResultsDisplay, {
          event: displayEvent,
          darkMode: false,
          isExportMode: true,
          seriesName: selectedRound?.seriesName
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(eventComponent);
      }

      // Wait for render to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(exportDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      });

      const link = document.createElement('a');
      link.download = `${selectedSeries ? selectedSeries.seriesName : event?.eventName || 'race'}_results.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error('Error exporting JPG:', error);
      alert(`Failed to export JPG: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Cleanup
      if (tempContainer.parentNode) {
        document.body.removeChild(tempContainer);
      }
    }
  };

  const handleExportPDF = async () => {
    const tempContainer = document.createElement('div');

    try {
      const event = selectedEvent || (selectedRound ? {
        ...selectedRound,
        eventName: selectedRound.roundName
      } as RaceEvent : null);

      if (!selectedSeries && !event) {
        console.log('No series or event selected for export');
        return;
      }

      // Create temporary container for export-mode rendering
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = 'fit-content';
      document.body.appendChild(tempContainer);

      // Create export div with proper structure - fit to content
      const exportDiv = document.createElement('div');
      exportDiv.style.width = 'fit-content';
      exportDiv.style.display = 'inline-block';
      tempContainer.appendChild(exportDiv);

      // Render the component in export mode
      if (selectedSeries) {
        const seriesComponent = React.createElement(SeriesResultsDisplay, {
          series: selectedSeries,
          darkMode: false,
          isExportMode: true
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(seriesComponent);
      } else if (event) {
        const displayEvent = event.multiDay && event.dayResults
          ? { ...event, raceResults: combineAllDayResults(event) }
          : event;
        const eventComponent = React.createElement(EventResultsDisplay, {
          event: displayEvent,
          darkMode: false,
          isExportMode: true,
          seriesName: selectedRound?.seriesName
        });
        const root = ReactDOM.createRoot(exportDiv);
        root.render(eventComponent);
      }

      // Wait for render to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(exportDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        scrollX: 0,
        scrollY: 0
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${selectedSeries ? selectedSeries.seriesName : event?.eventName || 'race'}_results.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Cleanup
      if (tempContainer.parentNode) {
        document.body.removeChild(tempContainer);
      }
    }
  };

  const handleExportCSV = () => {
    try {
      const event = selectedEvent || (selectedRound ? {
        ...selectedRound,
        eventName: selectedRound.roundName
      } as RaceEvent : null);

      if (!selectedSeries && !event) {
        console.log('No series or event selected for CSV export');
        return;
      }

      let csvData: any[] = [];

    if (selectedSeries) {
      // For series, export the leaderboard standings
      // Get skippers from series or from rounds
      const effectiveSkippers = selectedSeries.skippers && selectedSeries.skippers.length > 0
        ? selectedSeries.skippers
        : [];

      // If no series-level skippers, collect from completed rounds
      if (effectiveSkippers.length === 0) {
        const skipperMap = new Map();
        selectedSeries.rounds?.forEach(round => {
          if (round.completed && round.skippers) {
            round.skippers.forEach((skipper: any) => {
              const sailNum = skipper.sailNumber || skipper.sailNo;
              if (sailNum && !skipperMap.has(sailNum)) {
                skipperMap.set(sailNum, skipper);
              }
            });
          }
        });
        effectiveSkippers.push(...Array.from(skipperMap.values()));
      }

      csvData = effectiveSkippers.map((skipper, index) => ({
        Position: index + 1,
        Name: skipper.name,
        'Sail Number': skipper.sailNo || skipper.sailNumber,
        Club: skipper.club || skipper.clubName,
        Design: skipper.hull || skipper.boatModel || skipper.design,
        'Total Points': '' // This would need actual calculation from rounds
      }));

      const filename = `${selectedSeries.seriesName}_leaderboard_${Date.now()}.csv`;
      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    } else if (event) {
      const isShrs = event.heatManagement?.configuration?.scoringSystem === 'shrs';
      const shrsQualifyingRounds = event.heatManagement?.configuration?.shrsQualifyingRounds || 0;
      const skippers = event.skippers || [];
      const raceResults = event.raceResults || [];

      const groupResultsByRace = () => {
        const resultsByRace: Record<number, any[]> = {};
        if (!raceResults.length || !skippers.length) return resultsByRace;
        const hasRaceProperty = raceResults.some(r => r.race !== undefined);
        if (hasRaceProperty) {
          raceResults.forEach(result => {
            const raceNum = result.race;
            if (!resultsByRace[raceNum]) resultsByRace[raceNum] = [];
            resultsByRace[raceNum].push(result);
          });
        } else {
          let currentRace = 1;
          let skippersSeen = 0;
          raceResults.forEach(result => {
            if (!resultsByRace[currentRace]) resultsByRace[currentRace] = [];
            resultsByRace[currentRace].push({ ...result, race: currentRace });
            skippersSeen++;
            if (skippersSeen === skippers.length) { currentRace++; skippersSeen = 0; }
          });
        }
        return resultsByRace;
      };

      const resultsByRace = groupResultsByRace();
      const allRaceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);
      const activeSkippers = skippers.filter(s => !s.withdrawnFromRace || typeof s.withdrawnFromRace !== 'number');
      const activeSkipperCount = activeSkippers.length;
      const raceNumbers = allRaceNumbers.filter(raceNum => {
        const rr = resultsByRace[raceNum] || [];
        const activeCount = rr.filter(result => {
          const sk = skippers[result.skipperIndex];
          if (!sk) return false;
          return !sk.withdrawnFromRace || typeof sk.withdrawnFromRace !== 'number' || raceNum < sk.withdrawnFromRace;
        }).length;
        return activeCount >= activeSkipperCount;
      });

      const totals: Record<number, { gross: number; net: number }> = {};
      const drops: Record<string, boolean> = {};

      skippers.forEach((skipper, idx) => {
        const scores = raceNumbers.map(raceNum => {
          const rr = resultsByRace[raceNum] || [];
          const result = rr.find((r: any) => r.skipperIndex === idx);
          if (!result) {
            const skipperWithdrewAtRace = skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace;
            if (skipperWithdrewAtRace) return { race: raceNum, score: skippers.length + 1, isDNE: false, isLetterScore: false };
            return { race: raceNum, score: skippers.length + 1, isDNE: false, isLetterScore: false };
          }
          if (result.letterScore) {
            if ((result.letterScore === 'RDG' || result.letterScore === 'DPI' || result.letterScore === 'RDGfix') && result.customPoints !== undefined) {
              return { race: raceNum, score: result.customPoints, isDNE: false, isLetterScore: true };
            }
            const raceFinishers = rr.filter((res: any) => res.position !== null && !res.letterScore).length;
            return { race: raceNum, score: getLetterScoreValue(result.letterScore as LetterScore, raceFinishers, skippers.length), isDNE: result.letterScore === 'DNE', isLetterScore: true };
          }
          if (result.position !== null) return { race: raceNum, score: result.position, isDNE: false, isLetterScore: false };
          return { race: raceNum, score: skippers.length + 1, isDNE: false, isLetterScore: false };
        });

        const gross = scores.reduce((sum, r) => sum + r.score, 0);
        let numDrops = 0;
        const dropRules = event.dropRules || [4, 8, 16, 24, 32, 40];
        for (const threshold of dropRules) {
          if (scores.length >= threshold) numDrops++;
          else break;
        }
        if (numDrops === 0) { totals[idx] = { gross, net: gross }; return; }
        const dneScores = scores.filter(s => s.isDNE);
        const droppableScores = scores.filter(s => !s.isDNE);
        const sortedDroppable = [...droppableScores].sort((a, b) => b.score - a.score);
        sortedDroppable.slice(0, numDrops).forEach(r => { drops[`${idx}-${r.race}`] = true; });
        let net = gross;
        scores.forEach(r => { if (drops[`${idx}-${r.race}`]) net -= r.score; });
        totals[idx] = { gross, net };
      });

      const sortedSkippers = skippers.map((skipper, index) => ({
        ...skipper, index, netTotal: totals[index]?.net || 0
      })).sort((a, b) => {
        if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
        return a.index - b.index;
      });

      const shrsFleetMap = new Map<number, HeatDesignation>();
      if (isShrs && event.heatManagement) {
        const finalsRounds = event.heatManagement.rounds.filter(r => r.round > shrsQualifyingRounds && r.completed);
        if (finalsRounds.length > 0) {
          finalsRounds[0].heatAssignments.forEach(assignment => {
            assignment.skipperIndices.forEach(idx => {
              shrsFleetMap.set(idx, assignment.heatDesignation);
            });
          });
        }
      }
      const shrsHasFinals = isShrs && shrsFleetMap.size > 0;

      const displaySkippers = shrsHasFinals
        ? [...sortedSkippers].sort((a, b) => {
            const fleetA = shrsFleetMap.get(a.index) || 'Z';
            const fleetB = shrsFleetMap.get(b.index) || 'Z';
            if (fleetA !== fleetB) return fleetA.localeCompare(fleetB);
            if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
            return a.index - b.index;
          })
        : sortedSkippers;

      const fleetNames: Record<string, string> = { 'A': 'Gold Fleet', 'B': 'Silver Fleet', 'C': 'Bronze Fleet', 'D': 'Copper Fleet', 'E': 'Fleet E', 'F': 'Fleet F' };
      const getRaceLabel = (raceNum: number) => {
        if (!isShrs) return `R${raceNum}`;
        return raceNum <= shrsQualifyingRounds ? `Q${raceNum}` : `F${raceNum - shrsQualifyingRounds}`;
      };

      const csvRows: any[] = [];
      let currentFleet: string | null = null;
      let posCounter = 0;

      displaySkippers.forEach(skipper => {
        const skipperFleet = shrsHasFinals ? (shrsFleetMap.get(skipper.index) || 'Z') : null;

        if (shrsHasFinals && skipperFleet !== currentFleet) {
          currentFleet = skipperFleet;
          posCounter = 0;
          const separator: Record<string, string> = { Position: '', 'Sail Number': '', Skipper: fleetNames[skipperFleet!] || `Fleet ${skipperFleet}`, Club: '', Design: '' };
          if (shrsHasFinals) separator['Fleet'] = '';
          raceNumbers.forEach(rn => { separator[getRaceLabel(rn)] = ''; });
          separator['Gross'] = '';
          separator['Net'] = '';
          csvRows.push(separator);
        }

        posCounter++;
        const row: Record<string, string | number> = {};
        row['Position'] = posCounter;
        row['Sail Number'] = skipper.sailNo || '';
        row['Skipper'] = skipper.name;
        row['Club'] = skipper.club || '';
        row['Design'] = skipper.hull || skipper.boatModel || '';
        if (shrsHasFinals) {
          row['Fleet'] = skipperFleet === 'A' ? 'Gold' : skipperFleet === 'B' ? 'Silver' : skipperFleet === 'C' ? 'Bronze' : skipperFleet || '';
        }

        raceNumbers.forEach(raceNum => {
          const rr = resultsByRace[raceNum] || [];
          const result = rr.find((r: any) => r.skipperIndex === skipper.index);
          const isDropped = drops[`${skipper.index}-${raceNum}`];
          let val = '-';
          if (result) {
            if (result.letterScore) {
              const pts = getLetterScorePointsForRace(result.letterScore, raceNum, raceResults, skippers, skipper.index);
              val = `${pts}`;
            } else if (result.position !== null) {
              val = `${result.position}`;
            }
          } else {
            const skipperWithdrew = skipper.withdrawnFromRace && typeof skipper.withdrawnFromRace === 'number' && raceNum >= skipper.withdrawnFromRace;
            if (skipperWithdrew) val = `${skippers.length + 1}`;
          }
          row[getRaceLabel(raceNum)] = isDropped ? `[${val}]` : val;
        });

        row['Gross'] = totals[skipper.index]?.gross || 0;
        row['Net'] = totals[skipper.index]?.net || 0;
        csvRows.push(row);
      });

      const csv = Papa.unparse(csvRows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const eventName = event.eventName || (event as any).name || 'results';
      link.download = `${eventName.replace(/\s+/g, '_')}_results_${Date.now()}.csv`;
      link.click();
    }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      );
    }

    // Viewing specific event
    if (selectedEvent) {
      const displayEvent = selectedEvent.multiDay && selectedEvent.dayResults
        ? { ...selectedEvent, raceResults: combineAllDayResults(selectedEvent) }
        : selectedEvent;

      const hasResultsData = displayEvent.skippers && displayEvent.skippers.length > 0 && displayEvent.raceResults && displayEvent.raceResults.length > 0;

      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Event Details Button */}
            <button
              onClick={() => setShowEventDetails(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Trophy size={18} />
              Event Details
            </button>

            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasResultsData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasResultsData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasResultsData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF document</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Heat Results Button - Only for heat scored events */}
            {selectedEvent?.heatManagement && (
              <button
                onClick={() => setShowHeatResultsModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <GridIcon size={18} />
                Heat Results
              </button>
            )}

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasResultsData && setShowPublishModal(true)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasResultsData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <EventResultsDisplay
              event={displayEvent}
              darkMode={true}
              isExportMode={false}
              onEventUpdate={(updatedEvent) => {
                setSelectedEvent(updatedEvent);
                // Also update the event in the allEvents array
                setAllEvents(prevEvents =>
                  prevEvents.map(e => e.id === updatedEvent.id ? updatedEvent : e)
                );
              }}
            />
          </div>
        </div>
      );
    }

    // Viewing specific series leaderboard
    if (selectedSeries) {
      // Check if series has any results data - either skippers at series level OR in any round
      const hasAnyResults = selectedSeries.rounds?.some(r =>
        (r.raceResults && r.raceResults.length > 0) ||
        (r.results && r.results.length > 0) ||
        (r.skippers && r.skippers.length > 0 && r.completed)
      );

      const hasSeriesData = (selectedSeries.skippers && selectedSeries.skippers.length > 0 &&
                            selectedSeries.rounds && selectedSeries.rounds.length > 0) ||
                            (hasAnyResults && selectedSeries.rounds && selectedSeries.rounds.length > 0);

      return (
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasSeriesData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasSeriesData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasSeriesData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasSeriesData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasSeriesData && setShowPublishModal(true)}
                disabled={!hasSeriesData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasSeriesData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Edit Series Results Button */}
            <button
              onClick={() => setShowSeriesEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Edit2 size={18} />
              Edit Series
            </button>

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <SeriesResultsDisplay series={selectedSeries} darkMode={true} isExportMode={false} />
          </div>
        </div>
      );
    }

    // Viewing specific round result
    if (selectedRound) {
      // Convert round to event format for display
      const roundAsEvent: RaceEvent = {
        id: selectedRound.id,
        eventName: `${selectedRound.roundName} - ${selectedRound.seriesName}`,
        clubName: selectedRound.clubName,
        date: selectedRound.date,
        venue: selectedRound.venue,
        raceClass: selectedRound.raceClass,
        raceFormat: selectedRound.raceFormat as any,
        completed: selectedRound.completed,
        raceResults: selectedRound.raceResults,
        skippers: selectedRound.skippers
      };

      const hasResultsData = roundAsEvent.skippers && roundAsEvent.skippers.length > 0 && roundAsEvent.raceResults && roundAsEvent.raceResults.length > 0;

      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-end items-center gap-2 mb-4">
            {/* Event Details Button */}
            <button
              onClick={() => setShowEventDetails(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Trophy size={18} />
              Event Details
            </button>

            {/* Export Results Dropdown */}
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => hasResultsData && setShowExportDropdown(!showExportDropdown)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasResultsData
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                <span>Export Results</span>
                <ChevronDown size={16} />
              </button>

              {showExportDropdown && hasResultsData && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      handleExportJPG();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <FileImage className="text-blue-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as JPG</div>
                      <div className="text-slate-400 text-xs">Download results as image</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-red-600/20">
                      <FileText className="text-red-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as PDF</div>
                      <div className="text-slate-400 text-xs">Download results as PDF document</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className="p-2 rounded-lg bg-green-600/20">
                      <Table className="text-green-400" size={20} />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">Export as CSV</div>
                      <div className="text-slate-400 text-xs">Download results as spreadsheet</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Share Results Button */}
            {can('reports.create') && (
              <button
                onClick={() => hasResultsData && setShowPublishModal(true)}
                disabled={!hasResultsData}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  !hasResultsData
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Send size={18} />
                Share Results
              </button>
            )}

            {/* Exit Button */}
            <button
              onClick={() => navigate('/results')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <XCircle size={18} />
              Exit
            </button>
          </div>

          <div ref={resultsRef}>
            <EventResultsDisplay
              event={roundAsEvent}
              darkMode={true}
              isExportMode={false}
              onEventUpdate={(updatedEvent) => {
                // Update the round with the new display settings
                const updatedRound = {
                  ...selectedRound,
                  ...updatedEvent
                } as RoundResult;
                setSelectedRound(updatedRound);

                // Also update the round in the roundResults array
                setRoundResults(prevRounds =>
                  prevRounds.map(r =>
                    r.seriesId === updatedRound.seriesId && r.roundIndex === updatedRound.roundIndex
                      ? updatedRound
                      : r
                  )
                );
              }}
            />
          </div>
        </div>
      );
    }

    // External event detail view
    if (selectedExternalEvent) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedExternalEvent(null)}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to results
          </button>
          <ExternalResultsDisplay event={selectedExternalEvent} darkMode={true} isExportMode={false} />
        </div>
      );
    }

    // Main list view
    const eventsToShow = mainTab === 'events' ? filteredEvents : [];
    const seriesToShow = mainTab === 'leaderboards' ? filteredSeries : [];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
              <Trophy className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Results</h1>
              <p className="text-sm text-slate-400">
                {mainTab === 'events' ? eventsToShow.length : seriesToShow.length} {mainTab === 'events' ? 'events' : 'leaderboards'}
              </p>
            </div>
          </div>

          {/* Search and View Toggle */}
          <div className="flex items-center gap-2">
            {showSearch ? (
              <div className="relative flex-1 sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 rounded-lg bg-slate-700 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setShowSearch(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                <Search size={18} />
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListIcon size={18} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <GridIcon size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-700 flex-wrap">
          <button
            onClick={() => { setMainTab('events'); setSelectedExternalEvent(null); }}
            className={`px-4 py-3 font-medium transition-colors relative ${
              mainTab === 'events' ? 'text-green-400' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trophy size={18} />
              <span>Individual Events & Rounds</span>
              <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{filteredEvents.length}</span>
            </div>
            {mainTab === 'events' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          </button>

          <button
            onClick={() => { setMainTab('leaderboards'); setSelectedExternalEvent(null); }}
            className={`px-4 py-3 font-medium transition-colors relative ${
              mainTab === 'leaderboards' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              <span>Series Leaderboards</span>
              <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{filteredSeries.length}</span>
            </div>
            {mainTab === 'leaderboards' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
          </button>

          {externalNationalEvents.length > 0 && (
            <button
              onClick={() => { setMainTab('national'); setSelectedExternalEvent(null); }}
              className={`px-4 py-3 font-medium transition-colors relative ${
                mainTab === 'national' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe size={18} />
                <span>National Events</span>
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{externalNationalEvents.length}</span>
              </div>
              {mainTab === 'national' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400" />}
            </button>
          )}

          {externalWorldEvents.length > 0 && (
            <button
              onClick={() => { setMainTab('world'); setSelectedExternalEvent(null); }}
              className={`px-4 py-3 font-medium transition-colors relative ${
                mainTab === 'world' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe size={18} />
                <span>World Events</span>
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{externalWorldEvents.length}</span>
              </div>
              {mainTab === 'world' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400" />}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Filter */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 rounded-lg font-medium text-sm transition-colors bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 appearance-none pr-10"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
            />
          </div>

          {/* Status Filters */}
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setStatusFilter('in-progress')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'in-progress'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            In Progress
          </button>
        </div>

        {/* Results Grid/List */}
        {mainTab === 'events' && (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {eventsToShow.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-400">
                No events found
              </div>
            ) : (
              eventsToShow.map(item =>
                'seriesId' in item
                  ? renderCard(item, 'round')
                  : renderCard(item, 'event')
              )
            )}
          </div>
        )}

        {mainTab === 'leaderboards' && (
          <div className="space-y-8">
            {Object.keys(groupedSeries).length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No series leaderboards found
              </div>
            ) : (
              Object.entries(groupedSeries).map(([className, seriesList]) => (
                <div key={className}>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-400" />
                    {className}
                    <span className="text-sm font-normal text-slate-400">({seriesList.length})</span>
                  </h3>
                  <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                    {seriesList.map(series => renderCard(series, 'series'))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {(mainTab === 'national' || mainTab === 'world') && (() => {
          const extEvents = mainTab === 'national' ? externalNationalEvents : externalWorldEvents;
          const accentColor = mainTab === 'national' ? 'amber' : 'orange';
          return (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
              {extEvents.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400">
                  No {mainTab === 'national' ? 'national' : 'world'} events found
                </div>
              ) : (
                extEvents.map(ev => {
                  if (viewMode === 'grid') {
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedExternalEvent(ev)}
                        className="group relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] text-left flex flex-col"
                      >
                        <div className="relative h-40 flex-shrink-0 overflow-hidden bg-slate-900">
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                            <img
                              src="/alfie_app_logo.svg"
                              alt="AlfiePRO"
                              className="w-16 h-16 opacity-20"
                            />
                          </div>
                          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${accentColor}-500/90 text-white backdrop-blur-sm`}>
                            <Globe size={12} />
                            {mainTab === 'national' ? 'National' : 'World'}
                          </div>
                          {ev.event_date && (
                            <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                              <div className="text-center">
                                <div className="text-xs font-semibold text-slate-900">
                                  {new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                </div>
                                <div className="text-lg font-bold text-slate-900 leading-none">
                                  {new Date(ev.event_date).getDate()}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <h4 className="text-white font-medium mb-2 line-clamp-2 text-left">{ev.event_name}</h4>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {(ev.boat_class_mapped || ev.boat_class_raw) && (
                              <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                                {ev.boat_class_mapped || ev.boat_class_raw}
                              </div>
                            )}
                          </div>
                          {ev.event_date && (
                            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                              <Calendar size={14} />
                              <span>{formatDate(ev.event_date)}</span>
                            </div>
                          )}
                          {ev.venue && (
                            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                              <MapPin size={14} />
                              <span>{ev.venue}</span>
                            </div>
                          )}
                          {ev.competitor_count > 0 && (
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              <Users size={14} />
                              <span>{ev.competitor_count} competitors</span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }
                  // List view
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedExternalEvent(ev)}
                      className="group w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 transition-all duration-200"
                    >
                      <div className={`w-12 h-12 rounded-lg bg-${accentColor}-500/20 flex items-center justify-center flex-shrink-0`}>
                        <Globe className={`text-${accentColor}-400`} size={20} />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <h4 className="font-medium text-white truncate">{ev.event_name}</h4>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                          {ev.event_date && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(ev.event_date)}</span>}
                          {ev.venue && <span className="flex items-center gap-1"><MapPin size={12} />{ev.venue}</span>}
                          {ev.competitor_count > 0 && <span className="flex items-center gap-1"><Users size={12} />{ev.competitor_count} competitors</span>}
                          {(ev.boat_class_mapped || ev.boat_class_raw) && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                              {ev.boat_class_mapped || ev.boat_class_raw}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="text-slate-400 group-hover:text-white transition-colors flex-shrink-0" size={20} />
                    </button>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {renderContent()}
      </div>

      {/* Modals */}
      {showEventDetails && (selectedEvent || selectedRound) && (
        <EventDetails
          event={selectedEvent || {
            ...selectedRound,
            eventName: selectedRound?.roundName,
            id: selectedRound?.id
          } as RaceEvent}
          onClose={() => setShowEventDetails(false)}
          darkMode={true}
        />
      )}

      {showRaceReportModal && (selectedSeries || selectedEvent || selectedRound) && (
        <RaceReportModal
          isOpen={showRaceReportModal}
          onClose={() => setShowRaceReportModal(false)}
          darkMode={true}
          eventId={selectedEvent?.id || selectedRound?.id || selectedSeries?.id || ''}
          eventType={selectedSeries ? 'race_series' : (selectedEvent?.isPublicEvent || selectedRound) ? 'public_event' : 'quick_race'}
          clubId={currentClub?.clubId || ''}
          eventData={{
            title: selectedSeries ? selectedSeries.seriesName : selectedRound ? `${selectedRound.roundName} - ${selectedRound.seriesName}` : (selectedEvent?.eventName || selectedEvent?.clubName || ''),
            date: selectedSeries ? (selectedSeries.rounds[0]?.date || '') : selectedRound?.date || (selectedEvent?.date || ''),
            venue: selectedSeries ? (selectedSeries.rounds[0]?.venue || '') : selectedRound?.venue || (selectedEvent?.venue || ''),
            raceClass: selectedSeries ? selectedSeries.raceClass : selectedRound?.raceClass || (selectedEvent?.raceClass || ''),
            raceFormat: selectedSeries ? selectedSeries.raceFormat : selectedRound?.raceFormat || (selectedEvent?.raceFormat || '')
          }}
          raceResults={selectedEvent?.raceResults || selectedRound?.raceResults || []}
          skippers={
            selectedEvent?.skippers ||
            selectedRound?.skippers ||
            selectedSeries?.skippers ||
            // For series, collect skippers from rounds if not at series level
            (selectedSeries?.rounds?.reduce((acc, round) => {
              if (round.completed && round.skippers) {
                const skipperMap = new Map(acc.map(s => [s.sailNo || s.sailNumber, s]));
                round.skippers.forEach((skipper: any) => {
                  const sailNum = skipper.sailNumber || skipper.sailNo;
                  if (sailNum && !skipperMap.has(sailNum)) {
                    skipperMap.set(sailNum, skipper);
                  }
                });
                return Array.from(skipperMap.values());
              }
              return acc;
            }, [] as any[]) || [])
          }
        />
      )}

      {showPublishModal && (selectedSeries || selectedEvent || selectedRound) && (
        <PublishToMetaModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          darkMode={true}
          pageName=""
          pageId=""
          eventData={{
            title: selectedSeries ? selectedSeries.seriesName : selectedRound ? `${selectedRound.roundName} - ${selectedRound.seriesName}` : (selectedEvent?.eventName || selectedEvent?.clubName || ''),
            date: selectedSeries ? (selectedSeries.rounds[0]?.date || '') : selectedRound?.date || (selectedEvent?.date || ''),
            venue: selectedSeries ? (selectedSeries.rounds[0]?.venue || '') : selectedRound?.venue || (selectedEvent?.venue || ''),
            raceClass: selectedSeries ? selectedSeries.raceClass : selectedRound?.raceClass || (selectedEvent?.raceClass || ''),
            raceFormat: selectedSeries ? selectedSeries.raceFormat : selectedRound?.raceFormat || (selectedEvent?.raceFormat || ''),
            clubId: currentClub?.clubId || selectedSeries?.clubId || selectedRound?.clubId || selectedEvent?.clubId,
            eventId: selectedEvent?.id || selectedRound?.id || selectedSeries?.id
          }}
          resultsRef={resultsRef}
          eventResults={selectedEvent?.raceResults || selectedRound?.raceResults}
          eventSkippers={selectedEvent?.skippers || selectedRound?.skippers}
          eventMedia={selectedEvent?.media || selectedRound?.media || selectedSeries?.media || []}
        />
      )}

      {showHeatResultsModal && selectedEvent?.heatManagement && (
        <HeatRaceResultsModal
          isOpen={showHeatResultsModal}
          onClose={() => setShowHeatResultsModal(false)}
          darkMode={true}
          heatManagement={selectedEvent.heatManagement}
          skippers={selectedEvent.skippers}
          currentEvent={selectedEvent}
        />
      )}

      {/* Series Edit Modal */}
      {selectedSeries && (
        <SeriesEditModal
          isOpen={showSeriesEditModal}
          onClose={() => setShowSeriesEditModal(false)}
          series={selectedSeries}
          onSave={async (updatedSeries) => {
            // Save the updated series to storage
            await storeRaceSeries(updatedSeries);
            // Reload data to refresh the leaderboard
            await loadData();
            // Find and set the refreshed series from allSeries
            setAllSeries(prevSeries => {
              const refreshedSeries = prevSeries.find(s => s.id === updatedSeries.id);
              if (refreshedSeries) {
                setSelectedSeries(refreshedSeries);
              }
              return prevSeries;
            });
            setShowSeriesEditModal(false);
          }}
          darkMode={true}
        />
      )}
    </div>
  );
};
