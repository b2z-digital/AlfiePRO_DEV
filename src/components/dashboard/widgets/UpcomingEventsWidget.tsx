import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { getStoredRaceEvents, getStoredRaceSeries } from '../../../utils/raceStorage';
import { getPublicEvents } from '../../../utils/publicEventStorage';
import { getBoatClassBadge, getRaceFormatBadge } from '../../../constants/colors';

interface RaceEvent {
  id: string;
  eventName: string;
  clubName: string;
  date: string;
  venue: string;
  raceClass: string;
  raceFormat?: string;
  isSeriesEvent?: boolean;
  seriesId?: string;
  roundName?: string;
  venueImage?: string;
  attendees?: any[];
  registrationOpen?: boolean;
  registrationCount?: number;
  eventLevel?: 'state' | 'national';
  isPublicEvent?: boolean;
}

export const UpcomingEventsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [upcomingEvents, setUpcomingEvents] = useState<RaceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchUpcomingEvents();
  }, [currentClub, currentOrganization]);

  const fetchUpcomingEvents = async () => {
    if ((!currentClub?.clubId && !currentOrganization?.id) || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      let allUpcoming: RaceEvent[] = [];

      // For associations, fetch approved public events from database
      if (currentOrganization) {
        const { data: publicEvents, error } = await supabase
          .from('public_events')
          .select('*')
          .gte('date', todayISO)
          .eq('approval_status', 'approved')
          .order('date', { ascending: true })
          .limit(4);

        if (error) throw error;

        allUpcoming = (publicEvents || []).map(event => ({
          id: event.id,
          eventName: event.event_name,
          clubName: event.club_name || '',
          date: event.date,
          venue: event.venue || '',
          raceClass: event.race_class || '',
          raceFormat: event.race_format,
          eventLevel: event.event_level as 'state' | 'national',
          isPublicEvent: true,
          registrationOpen: true
        }));
      } else {
        // For clubs, fetch club events and public events
        // Fetch quick races
        const raceEvents = await getStoredRaceEvents();
        const upcomingQuickRaces = raceEvents.filter(event => {
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          return eventDate >= today && !event.cancelled;
        }).map(event => ({
          id: event.id,
          eventName: event.eventName,
          clubName: event.clubName,
          date: event.date,
          venue: event.venue,
          raceClass: event.raceClass,
          raceFormat: event.raceFormat,
          skippers: event.skippers || []
        }));

        // Fetch series
        const raceSeries = await getStoredRaceSeries();
        const upcomingSeriesEvents: RaceEvent[] = [];
        raceSeries.forEach(series => {
          series.rounds.forEach((round: any, roundIndex: number) => {
            const roundDate = new Date(round.date);
            roundDate.setHours(0, 0, 0, 0);
            const isToday = roundDate.getTime() === today.getTime();
            const isFutureAndNotCompleted = roundDate > today && !round.cancelled && !round.completed;
            const shouldShow = (isToday && !round.cancelled) || isFutureAndNotCompleted;

            if (shouldShow) {
              upcomingSeriesEvents.push({
                id: `${series.id}-round-${roundIndex}`,
                eventName: `${round.name} - ${series.seriesName}`,
                clubName: series.clubName,
                date: round.date,
                venue: round.venue,
                raceClass: series.raceClass,
                raceFormat: series.raceFormat,
                isSeriesEvent: true,
                seriesId: series.id,
                roundName: round.name,
                skippers: series.skippers
              });
            }
          });
        });

        // Get upcoming public events with proper mapping
        const publicEvents = await getPublicEvents();
        const upcomingPublicEvents = publicEvents
          .filter(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate >= today;
          })
          .map(event => ({
            id: event.id!,
            eventName: event.event_name!,
            clubName: event.club_name || '',
            date: event.date!,
            venue: event.venue || '',
            raceClass: event.race_class || '',
            raceFormat: event.race_format,
            eventLevel: event.event_level as 'state' | 'national' | undefined,
            isPublicEvent: true,
            registrationOpen: true // Public events have registration by default
          }));

        // Combine and sort by date
        allUpcoming = [...upcomingQuickRaces, ...upcomingSeriesEvents, ...upcomingPublicEvents]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 4);
      }

      // Fetch venue images
      const venueNames = [...new Set(allUpcoming.map(e => e.venue).filter(Boolean))];
      const venueImages: Record<string, string> = {};

      if (venueNames.length > 0) {
        try {
          const { data: venues } = await supabase
            .from('venues')
            .select('name, image')
            .in('name', venueNames);

          (venues || []).forEach(v => {
            if (v.image) venueImages[v.name] = v.image;
          });

          allUpcoming = allUpcoming.map(event => ({
            ...event,
            venueImage: event.venue ? venueImages[event.venue] : undefined
          }));
        } catch (error) {
          console.error('Error fetching venue images:', error);
        }
      }

      // Fetch attendees with avatars
      allUpcoming = await enrichEventsWithAttendance(allUpcoming);

      setUpcomingEvents(allUpcoming);
    } catch (err) {
      console.error('Error fetching upcoming events:', err);
    } finally {
      setLoading(false);
    }
  };

  const enrichEventsWithAttendance = async (events: RaceEvent[]) => {
    if (!currentClub?.clubId || events.length === 0) return events;

    try {
      // Fetch attendance for all events and series rounds separately
      const eventIds = events.filter(e => !e.isSeriesEvent).map(e => e.id);

      let allAttendanceData: any[] = [];

      // Get attendance for single events
      if (eventIds.length > 0) {
        const { data: eventAttendance } = await supabase
          .from('event_attendance')
          .select('event_id, user_id')
          .eq('club_id', currentClub.clubId)
          .in('event_id', eventIds);

        if (eventAttendance) allAttendanceData = [...allAttendanceData, ...eventAttendance];
      }

      // Get attendance for series rounds
      const seriesEvents = events.filter(e => e.isSeriesEvent);
      for (const seriesEvent of seriesEvents) {
        if (seriesEvent.seriesId && seriesEvent.roundName) {
          const { data: roundAttendance } = await supabase
            .from('event_attendance')
            .select('series_id, round_name, user_id')
            .eq('club_id', currentClub.clubId)
            .eq('series_id', seriesEvent.seriesId)
            .eq('round_name', seriesEvent.roundName);

          if (roundAttendance) allAttendanceData = [...allAttendanceData, ...roundAttendance];
        }
      }

      if (allAttendanceData.length === 0) return events;

      const userIds = [...new Set(allAttendanceData.map((a: any) => a.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      const profileMap: Record<string, any> = {};
      profilesData?.forEach(profile => {
        profileMap[profile.id] = profile;
      });

      const singleEventAttendanceMap: Record<string, any[]> = {};
      const seriesRoundAttendanceMap: Record<string, any[]> = {};

      allAttendanceData.forEach((att: any) => {
        const profile = profileMap[att.user_id];
        const attendee = {
          name: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown',
          avatarUrl: profile?.avatar_url
        };

        if (att.series_id && att.round_name) {
          const key = `${att.series_id}-${att.round_name}`;
          if (!seriesRoundAttendanceMap[key]) {
            seriesRoundAttendanceMap[key] = [];
          }
          seriesRoundAttendanceMap[key].push(attendee);
        } else if (att.event_id) {
          if (!singleEventAttendanceMap[att.event_id]) {
            singleEventAttendanceMap[att.event_id] = [];
          }
          singleEventAttendanceMap[att.event_id].push(attendee);
        }
      });

      // Get member avatars for skipper matching
      const { data: members } = await supabase
        .from('members')
        .select('first_name, last_name, avatar_url')
        .eq('club_id', currentClub.clubId);

      const memberAvatarMap: Record<string, string> = {};
      members?.forEach(m => {
        const fullName = `${m.first_name} ${m.last_name}`.trim();
        if (m.avatar_url) memberAvatarMap[fullName] = m.avatar_url;
      });

      return events.map(event => {
        let attendees: any[] = [];
        if (event.isSeriesEvent && event.seriesId && event.roundName) {
          const key = `${event.seriesId}-${event.roundName}`;
          attendees = seriesRoundAttendanceMap[key] || [];

          // If no attendance but has skippers, show them as attendees
          if (attendees.length === 0 && event.skippers && event.skippers.length > 0) {
            attendees = event.skippers.map((skipper: any) => ({
              name: skipper.name,
              avatarUrl: memberAvatarMap[skipper.name]
            }));
          }
        } else {
          attendees = singleEventAttendanceMap[event.id] || [];

          // If no attendance but has skippers (quick races), show them as attendees
          if (attendees.length === 0 && event.skippers && event.skippers.length > 0) {
            attendees = event.skippers.map((skipper: any) => ({
              name: skipper.name,
              avatarUrl: memberAvatarMap[skipper.name]
            }));
          }
        }
        return {
          ...event,
          attendees,
          registrationCount: event.skippers?.length || attendees.length,
          registrationOpen: event.registrationOpen !== false // default true unless explicitly false
        };
      });
    } catch (error) {
      console.error('Error enriching events with attendance:', error);
      return events;
    }
  };

  return (
    <div className={`relative rounded-2xl p-6 w-full h-full border backdrop-blur-sm ${themeColors.background}`}>
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="text-blue-400" size={20} />
          <h2 className="text-lg font-semibold text-white">Upcoming Events</h2>
        </div>
        {!isEditMode && (
          <button
            onClick={() => navigate('/calendar')}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            View all
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : upcomingEvents.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="mx-auto mb-4 text-slate-500" size={48} />
          <p className="text-slate-400">No upcoming events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcomingEvents.map((event) => (
            <div
              key={event.id}
              onClick={() => {
                if (isEditMode) return;

                if (event.isPublicEvent) {
                  navigate('/calendar');
                } else {
                  // Navigate to race management which will handle event selection
                  navigate('/race-management', { state: { eventId: event.id, isSeriesEvent: event.isSeriesEvent, seriesId: event.seriesId } });
                }
              }}
              className={`
                group relative overflow-hidden rounded-xl border transition-all duration-300
                ${isEditMode ? 'pointer-events-none' : 'hover:shadow-xl hover:scale-[1.02] cursor-pointer'}
                bg-slate-800/50 border-slate-700/50 hover:border-slate-600/70
              `}
            >
              <div className="flex h-32">
                <div className="relative w-32 h-32 flex-shrink-0 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600"
                    style={{
                      backgroundImage: event.venueImage ? `url(${event.venueImage})` : 'url(https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=400)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  <div className="absolute top-0 right-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-400" />
                  <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                    <div className="text-center">
                      <div className="text-xs font-semibold text-slate-900">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
                      <div className="text-lg font-bold text-slate-900 leading-none">{new Date(event.date).getDate()}</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {event.eventName}
                    </h3>
                    <div className="flex items-center text-sm text-slate-400 mb-2">
                      <MapPin size={14} className="mr-1" />
                      <span className="truncate">{event.venue}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {event.raceFormat && (
                        <span className={getRaceFormatBadge(event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>
                          {event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                        </span>
                      )}
                      <span className={getBoatClassBadge(event.raceClass, darkMode).className}>
                        {event.raceClass}
                      </span>
                      {event.attendees && event.attendees.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-2">
                            {event.attendees.slice(0, 5).map((attendee, idx) => (
                              <div
                                key={idx}
                                className="w-7 h-7 rounded-full border-2 border-slate-800 bg-slate-700 flex items-center justify-center overflow-hidden"
                                title={attendee.name}
                              >
                                {attendee.avatarUrl ? (
                                  <img src={attendee.avatarUrl} alt={attendee.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs text-slate-300">{attendee.name.charAt(0)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {event.attendees.length > 5 && (
                            <span className="text-xs text-slate-300 font-medium">
                              +{event.attendees.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                      {event.registrationOpen && !event.attendees?.length && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          Registration open
                        </span>
                      )}
                    </div>
                    {event.eventLevel && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        event.eventLevel === 'national'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      }`}>
                        {event.eventLevel === 'national' ? 'National Event' : 'State Event'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
