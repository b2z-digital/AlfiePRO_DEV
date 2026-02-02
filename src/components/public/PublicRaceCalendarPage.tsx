import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Menu, X, Calendar, Clock, MapPin, Trophy, Filter, ChevronDown, Users, Award, List, Grid, CalendarDays, CalendarRange, Link2, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { generateICalFile, downloadICalFile } from '../../utils/calendarSync';
import { EventRegistrationModal } from '../events/EventRegistrationModal';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

type CalendarView = 'list' | 'grid' | 'month' | 'year';

interface RaceEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  venue_id?: string;
  race_class: string;
  race_format: 'handicap' | 'scratch';
  type: 'single' | 'series_round';
  series_name?: string;
  registered_count: number;
  cover_image?: string;
  entry_fee?: number;
  currency?: string;
}

const getClubInitials = (clubName: string): string => {
  return clubName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .filter((_, index, array) => index < 2 || array.length <= 2)
    .join('');
};

export const PublicRaceCalendarPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>('list');
  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past'>('upcoming');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSubscribeMenu, setShowSubscribeMenu] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    raceFormat?: 'handicap' | 'scratch';
    raceClass?: string;
  }>({});
  const [upcomingEvents, setUpcomingEvents] = useState<RaceEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<RaceEvent[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEventForRegistration, setSelectedEventForRegistration] = useState<RaceEvent | null>(null);
  const subscribeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clubId) {
      loadClubData();
      loadEvents();
    }
  }, [clubId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subscribeMenuRef.current && !subscribeMenuRef.current.contains(event.target as Node)) {
        setShowSubscribeMenu(false);
      }
    };

    if (showSubscribeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSubscribeMenu]);

  const loadClubData = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (error) throw error;
      setClub(data as Club);
    } catch (error) {
      console.error('Error loading club:', error);
    }
  };

  const loadEvents = async () => {
    if (!clubId) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format

      // Load upcoming quick races (single events)
      const { data: upcomingQuickRaces, error: upcomingError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, race_format, completed, entry_fee')
        .eq('club_id', clubId)
        .gte('race_date', today)
        .order('race_date', { ascending: true });

      if (upcomingError) {
        console.error('Error loading upcoming quick races:', upcomingError);
      }

      console.log('Loaded upcoming quick races:', upcomingQuickRaces?.length || 0);

      // Load past quick races
      const { data: pastQuickRaces, error: pastError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, race_format, completed, entry_fee')
        .eq('club_id', clubId)
        .lt('race_date', today)
        .order('race_date', { ascending: false })
        .limit(20);

      if (pastError) {
        console.error('Error loading past quick races:', pastError);
      }

      console.log('Loaded past quick races:', pastQuickRaces?.length || 0);

      // Load race series and extract rounds from JSONB
      const { data: allSeries, error: seriesError } = await supabase
        .from('race_series')
        .select('id, series_name, rounds, race_class, race_format, entry_fee')
        .eq('club_id', clubId);

      if (seriesError) {
        console.error('Error loading series:', seriesError);
      }

      // Extract upcoming and past rounds from all series
      const upcomingSeriesRounds: any[] = [];
      const pastSeriesRounds: any[] = [];

      (allSeries || []).forEach((series: any) => {
        if (series.rounds && Array.isArray(series.rounds)) {
          series.rounds.forEach((round: any, index: number) => {
            const roundDate = round.date;
            const roundData = {
              id: `${series.id}-round-${index}`,
              round_name: round.name,
              date: roundDate,
              venue: round.venue,
              race_class: series.race_class,
              race_format: series.race_format,
              series_name: series.series_name,
              completed: round.completed,
              cancelled: round.cancelled,
              entry_fee: series.entry_fee
            };

            if (roundDate >= today) {
              upcomingSeriesRounds.push(roundData);
            } else {
              pastSeriesRounds.push(roundData);
            }
          });
        }
      });

      console.log('Loaded upcoming series rounds:', upcomingSeriesRounds.length);
      console.log('Loaded past series rounds:', pastSeriesRounds.length);
      console.log('Club ID:', clubId);

      // Transform and combine data
      const transformedUpcoming: RaceEvent[] = [
        ...(upcomingQuickRaces || []).map((race: any) => ({
          id: race.id,
          name: race.event_name || `Race - ${race.race_class || 'Multi-Class'}`,
          date: race.race_date,
          venue: race.race_venue || 'TBA',
          venue_id: undefined,
          race_class: race.race_class || 'Open',
          race_format: race.race_format || 'handicap',
          type: 'single' as const,
          registered_count: 0,
          entry_fee: race.entry_fee,
          currency: 'AUD'
        })),
        ...(upcomingSeriesRounds || []).map((round: any) => ({
          id: round.id,
          name: `${round.round_name} - ${round.series_name}`,
          date: round.date,
          venue: round.venue || 'TBA',
          venue_id: undefined,
          race_class: round.race_class || 'Open',
          race_format: round.race_format || 'handicap',
          type: 'series_round' as const,
          series_name: round.series_name,
          registered_count: 0,
          entry_fee: round.entry_fee,
          currency: 'AUD'
        }))
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const transformedPast: RaceEvent[] = [
        ...(pastQuickRaces || []).map((race: any) => ({
          id: race.id,
          name: race.event_name || `Race - ${race.race_class || 'Multi-Class'}`,
          date: race.race_date,
          venue: race.race_venue || 'TBA',
          venue_id: undefined,
          race_class: race.race_class || 'Open',
          race_format: race.race_format || 'handicap',
          type: 'single' as const,
          registered_count: 0,
          entry_fee: race.entry_fee,
          currency: 'AUD'
        })),
        ...(pastSeriesRounds || []).map((round: any) => ({
          id: round.id,
          name: `${round.round_name} - ${round.series_name}`,
          date: round.date,
          venue: round.venue || 'TBA',
          venue_id: undefined,
          race_class: round.race_class || 'Open',
          race_format: round.race_format || 'handicap',
          type: 'series_round' as const,
          series_name: round.series_name,
          registered_count: 0,
          entry_fee: round.entry_fee,
          currency: 'AUD'
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      console.log('Transformed upcoming events:', transformedUpcoming.length);
      console.log('Transformed past events:', transformedPast.length);

      setUpcomingEvents(transformedUpcoming);
      setPastEvents(transformedPast);

      // Extract unique classes
      const allEvents = [...transformedUpcoming, ...transformedPast];
      const classes = [...new Set(allEvents.map(e => e.race_class))].filter(Boolean);
      setAvailableClasses(classes);

    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = (events: RaceEvent[]) => {
    return events.filter(event => {
      if (activeFilters.raceFormat && event.race_format !== activeFilters.raceFormat) {
        return false;
      }
      if (activeFilters.raceClass && event.race_class !== activeFilters.raceClass) {
        return false;
      }
      return true;
    });
  };

  const displayEvents = timeFilter === 'upcoming'
    ? filterEvents(upcomingEvents)
    : filterEvents(pastEvents);

  const groupEventsByMonth = (events: RaceEvent[]) => {
    const grouped: Record<string, RaceEvent[]> = {};
    events.forEach(event => {
      const date = new Date(event.date);
      const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[monthYear]) {
        grouped[monthYear] = [];
      }
      grouped[monthYear].push(event);
    });
    return grouped;
  };

  const groupedEvents = groupEventsByMonth(displayEvents);

  // Helper functions for calendar views
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
    return displayEvents.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.getDate() === day &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  };

  const getEventsForMonth = (month: number) => {
    return displayEvents.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.getMonth() === month &&
             eventDate.getFullYear() === currentDate.getFullYear();
    });
  };

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

  const monthData = getMonthData();

  const renderListView = () => (
    <div className="space-y-8">
      {Object.entries(groupedEvents).map(([monthYear, events]) => (
        <div key={monthYear}>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{monthYear}</h2>
          <div className="grid gap-4">
            {events.map(event => (
              <div
                key={event.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {event.cover_image && (
                      <img
                        src={event.cover_image}
                        alt={event.name}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {event.name}
                      </h3>
                      {event.series_name && (
                        <p className="text-sm text-blue-600 font-medium mb-2">
                          Part of {event.series_name}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          <span>{formatDate(event.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={16} />
                          <span>{event.venue}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Trophy size={16} />
                          <span>Class: {event.race_class}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            event.race_format === 'handicap'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {event.race_format === 'handicap' ? 'Handicap' : 'Scratch'}
                        </span>
                        {event.type === 'series_round' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Series Round
                          </span>
                        )}
                        {event.type === 'single' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Single Event
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom section with registered count and register button */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {timeFilter === 'upcoming' && event.registered_count > 0 && (
                        <>
                          <Users size={18} className="text-gray-600" />
                          <span className="text-sm font-medium text-gray-600">{event.registered_count} registered</span>
                        </>
                      )}
                    </div>
                    {timeFilter === 'upcoming' && event.entry_fee && event.entry_fee > 0 && (
                      <button
                        onClick={() => setSelectedEventForRegistration(event)}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow-md"
                      >
                        <UserPlus size={18} />
                        <span>Register</span>
                        <span className="ml-1 text-sm font-normal opacity-90">
                          {event.currency || 'AUD'} ${event.entry_fee}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderGridView = () => (
    <div className="space-y-8">
      {Object.entries(groupedEvents).map(([monthYear, events]) => (
        <div key={monthYear}>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{monthYear}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map(event => (
              <div
                key={event.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden"
              >
                {event.cover_image && (
                  <img
                    src={event.cover_image}
                    alt={event.name}
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                    {event.name}
                  </h3>
                  {event.series_name && (
                    <p className="text-xs text-blue-600 font-medium mb-2">
                      {event.series_name}
                    </p>
                  )}
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={14} />
                      <span className="truncate">{event.venue}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy size={14} />
                      <span>{event.race_class}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        event.race_format === 'handicap'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {event.race_format === 'handicap' ? 'Handicap' : 'Scratch'}
                    </span>
                  </div>
                  {timeFilter === 'upcoming' && event.entry_fee && event.entry_fee > 0 && (
                    <button
                      onClick={() => setSelectedEventForRegistration(event)}
                      className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <UserPlus size={16} />
                      <span>Register</span>
                      <span className="text-sm opacity-90">
                        {event.currency || 'AUD'} ${event.entry_fee}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderMonthView = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-lg font-medium text-gray-800">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              className="p-2 text-center text-sm font-medium bg-white text-gray-600"
            >
              {day}
            </div>
          ))}
          {monthData.map((day, index) => {
            const dayEvents = day ? getEventsForDate(day) : [];
            const isToday = day &&
              currentDate.getMonth() === new Date().getMonth() &&
              currentDate.getFullYear() === new Date().getFullYear() &&
              day === new Date().getDate();

            return (
              <div
                key={index}
                className={`min-h-[120px] p-2 bg-white ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                {day && (
                  <>
                    <div className="text-sm font-medium mb-2 text-gray-600">
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event, eventIndex) => (
                        <div
                          key={eventIndex}
                          className="w-full text-left p-1.5 rounded text-xs bg-gray-50 hover:bg-gray-100"
                        >
                          <div className="font-medium mb-1 text-gray-800">
                            {event.name}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">
                            <div
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                event.race_format === 'handicap'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {event.race_format === 'handicap' ? 'Handicap' : 'Scratch'}
                            </div>
                            <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                              {event.race_class}
                            </div>
                          </div>

                          <div className="text-gray-600 truncate">
                            {event.venue}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderYearView = () => {
    const months = Array.from({ length: 12 }, (_, i) => i);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={prevYear}
              className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-lg font-medium text-gray-800">
              {currentDate.getFullYear()}
            </h3>
            <button
              onClick={nextYear}
              className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-600"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {months.map(month => {
            const monthEvents = getEventsForMonth(month);
            const isCurrentMonth =
              new Date().getMonth() === month &&
              new Date().getFullYear() === currentDate.getFullYear();

            return (
              <div
                key={month}
                className={`p-4 rounded-lg bg-white ${isCurrentMonth ? 'ring-2 ring-blue-500' : ''}`}
              >
                <h4 className="text-sm font-medium mb-3 text-gray-800">
                  {new Date(currentDate.getFullYear(), month).toLocaleString('default', { month: 'long' })}
                </h4>
                <div className="space-y-2">
                  {monthEvents.length === 0 ? (
                    <p className="text-xs text-gray-500">No events</p>
                  ) : (
                    monthEvents.map((event, index) => {
                      const eventDate = new Date(event.date);

                      return (
                        <div
                          key={index}
                          className="flex-1 text-left p-2 rounded text-xs bg-gray-50 hover:bg-gray-100"
                        >
                          <div className="font-medium mb-1 text-gray-800 line-clamp-2">
                            {event.name}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">
                            <div
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                event.race_format === 'handicap'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {event.race_format === 'handicap' ? 'H' : 'S'}
                            </div>
                            <div className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                              {event.race_class}
                            </div>
                          </div>

                          <div className="text-gray-500 text-[10px]">
                            {eventDate.getDate()} {eventDate.toLocaleString('default', { month: 'short' })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleSubscribeToCalendar = () => {
    const clubName = club?.name || 'Race Calendar';
    const eventsToExport = upcomingEvents.map(e => ({
      id: e.id,
      eventName: e.name,
      eventDate: e.date,
      eventVenue: e.venue,
      raceClass: e.race_class,
      raceFormat: e.race_format,
      completed: false,
      cancelled: false,
      skippers: [],
      raceResults: [],
      isSeriesEvent: e.type === 'series_round',
      seriesId: e.type === 'series_round' ? e.id : undefined
    } as any));
    const icalContent = generateICalFile(eventsToExport, clubName);
    const filename = `${clubName.replace(/\s+/g, '-').toLowerCase()}-race-calendar.ics`;
    downloadICalFile(icalContent, filename);
    setShowSubscribeMenu(false);
  };

  if (!club) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const clubInitials = getClubInitials(club.name);

  return (
    <div className="min-h-screen bg-gray-50">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="race-calendar" />

      {/* Main Content */}
      <div className="pt-20">
        {/* Page Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 mb-4">
              <Calendar className="w-10 h-10" />
              <h1 className="text-4xl font-bold">Race Calendar</h1>
            </div>
            <p className="text-blue-100 text-lg">
              View upcoming races and past results from {club.name}
            </p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-slate-800 border-b border-slate-700 sticky top-20 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Time Filter Tabs */}
                <div className="flex items-center gap-2 bg-slate-700 rounded-lg p-1">
                  <button
                    onClick={() => setTimeFilter('upcoming')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      timeFilter === 'upcoming'
                        ? 'bg-green-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Upcoming Events
                  </button>
                  <button
                    onClick={() => setTimeFilter('past')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      timeFilter === 'past'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Past Events
                  </button>
                </div>

                {/* View Switcher */}
                <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800">
                  <button
                    onClick={() => setView('list')}
                    className={`p-2 transition-colors flex items-center justify-center gap-1 ${
                      view === 'list'
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <List size={18} />
                  </button>
                  <button
                    onClick={() => setView('grid')}
                    className={`p-2 transition-colors flex items-center justify-center gap-1 ${
                      view === 'grid'
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <Grid size={18} />
                  </button>
                  <button
                    onClick={() => setView('month')}
                    className={`p-2 transition-colors flex items-center justify-center gap-1 ${
                      view === 'month'
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <CalendarDays size={18} />
                  </button>
                  <button
                    onClick={() => setView('year')}
                    className={`p-2 transition-colors flex items-center justify-center gap-1 ${
                      view === 'year'
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    <CalendarRange size={18} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Filter size={18} />
                  <span className="text-sm font-medium">Filters</span>
                  <ChevronDown size={16} className={`transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
                  {(activeFilters.raceFormat || activeFilters.raceClass) && (
                    <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                      {[activeFilters.raceFormat, activeFilters.raceClass].filter(Boolean).length}
                    </span>
                  )}
                </button>

                {showFilterDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowFilterDropdown(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                      <div className="p-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Race Format
                          </label>
                          <div className="space-y-2">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                checked={!activeFilters.raceFormat}
                                onChange={() => setActiveFilters({ ...activeFilters, raceFormat: undefined })}
                                className="mr-2"
                              />
                              <span className="text-sm">All Formats</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                checked={activeFilters.raceFormat === 'handicap'}
                                onChange={() => setActiveFilters({ ...activeFilters, raceFormat: 'handicap' })}
                                className="mr-2"
                              />
                              <span className="text-sm">Handicap</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                checked={activeFilters.raceFormat === 'scratch'}
                                onChange={() => setActiveFilters({ ...activeFilters, raceFormat: 'scratch' })}
                                className="mr-2"
                              />
                              <span className="text-sm">Scratch</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Yacht Class
                          </label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                checked={!activeFilters.raceClass}
                                onChange={() => setActiveFilters({ ...activeFilters, raceClass: undefined })}
                                className="mr-2"
                              />
                              <span className="text-sm">All Classes</span>
                            </label>
                            {availableClasses.map(cls => (
                              <label key={cls} className="flex items-center">
                                <input
                                  type="radio"
                                  checked={activeFilters.raceClass === cls}
                                  onChange={() => setActiveFilters({ ...activeFilters, raceClass: cls })}
                                  className="mr-2"
                                />
                                <span className="text-sm">{cls}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {(activeFilters.raceFormat || activeFilters.raceClass) && (
                          <button
                            onClick={() => {
                              setActiveFilters({});
                              setShowFilterDropdown(false);
                            }}
                            className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

                {/* Subscribe to Calendar */}
                <div className="relative" ref={subscribeMenuRef}>
                  <button
                    onClick={() => setShowSubscribeMenu(!showSubscribeMenu)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 border-blue-500 text-white"
                  >
                    <Link2 size={16} />
                    Subscribe
                  </button>

                  {showSubscribeMenu && (
                    <div className="absolute right-0 mt-2 w-72 rounded-lg shadow-xl border bg-slate-800 border-slate-700 py-2 z-50">
                      <div className="px-4 py-2 border-b border-slate-700">
                        <h4 className="font-semibold text-sm text-slate-200">
                          Subscribe to Calendar
                        </h4>
                        <p className="text-xs mt-1 text-slate-400">
                          Download an iCal file to sync upcoming events to your calendar app
                        </p>
                      </div>

                      <div className="py-2">
                        <button
                          onClick={handleSubscribeToCalendar}
                          className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors hover:bg-slate-700 text-slate-200"
                        >
                          <Calendar size={16} />
                          <div>
                            <div className="font-medium">Download .ics File</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Import into Apple Calendar, Google Calendar, or Outlook
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Events List */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading events...</p>
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No events found</p>
              <p className="text-gray-500 text-sm mt-2">
                {timeFilter === 'upcoming' ? 'Check back later for upcoming races' : 'No past events to display'}
              </p>
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

      {/* Event Registration Modal */}
      {selectedEventForRegistration && clubId && (
        <EventRegistrationModal
          darkMode={false}
          eventId={selectedEventForRegistration.id}
          clubId={clubId}
          eventName={selectedEventForRegistration.name}
          entryFee={selectedEventForRegistration.entry_fee || 0}
          currency={selectedEventForRegistration.currency || 'AUD'}
          onClose={() => setSelectedEventForRegistration(null)}
          onSuccess={() => {
            setSelectedEventForRegistration(null);
            loadEvents(); // Reload events to update registration counts
          }}
        />
      )}

      <PublicFooter club={club} />
    </div>
  );
};
