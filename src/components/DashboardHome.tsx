import React, { useState, useEffect } from 'react';
import { Trophy, Users, Calendar, ChevronRight, MapPin, Clock, TrendingUp, Award, UserCheck, Medal, Zap, Target, Globe, CheckSquare, Camera, DollarSign, AlertCircle, Wind, CloudRain, Droplets, Mail, MessageSquare, Bell, Plus, FileText, CreditCard, UserPlus, Send } from 'lucide-react';
import { getStoredRaceEvents, getStoredRaceSeries, combineAllDayResults } from '../utils/raceStorage';
import { getTopFinishers } from '../utils/standingsCalculator';
import { getStoredMembers } from '../utils/storage';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useAuth } from '../contexts/AuthContext';
import { supabase, retryQuery } from '../utils/supabase';
import { protectedQuery, protectedCount, QUERY_TIMEOUTS } from '../utils/queryHelpers';
import { isValidUUID } from '../utils/storage';
import { getPublicEvents, convertToRaceEvent } from '../utils/publicEventStorage';
import { calculateScratchResults } from '../utils/scratchCalculations';
import CoverImageUploadModal from './CoverImageUploadModal';
import { usePermissions } from '../hooks/usePermissions';
import { TrialStatusBanner } from './TrialStatusBanner';
import { getBoatClassBadge, getRaceFormatBadge, getEventTypeBadge } from '../constants/colors';
import { CustomizableDashboard } from './dashboard/CustomizableDashboard';

// Register ChartJS components
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type DashboardSection = 'home' | 'race-management' | 'club-management' | 'race-calendar' | 'team-management' | 'results';

interface DashboardHomeProps {
  darkMode: boolean;
  stats: {
    activeRaces: number;
    clubMembers: number;
    upcomingEvents: number;
  };
  onNavigate: (section: DashboardSection) => void;
  onEventSelect: (event: RaceEvent) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  darkMode,
  stats,
  onNavigate,
  onEventSelect
}) => {
  const [upcomingEvents, setUpcomingEvents] = useState<RaceEvent[]>([]);
  const [recentResults, setRecentResults] = useState<RaceEvent[]>([]);
  const [topSkippers, setTopSkippers] = useState<{name: string, wins: number, consistency: number}[]>([]);
  const [participationRate, setParticipationRate] = useState<number>(0);
  const [boatClassDistribution, setBoatClassDistribution] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [userFirstName, setUserFirstName] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImagePosition, setCoverImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [showCoverImageModal, setShowCoverImageModal] = useState(false);
  const { isAdmin } = usePermissions();
  const [financialData, setFinancialData] = useState<any>(null);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [membershipData, setMembershipData] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    let loadTimeout: NodeJS.Timeout;

    const loadWithTimeout = async () => {
      // Don't load if tab is hidden (prevents wasted resources)
      if (document.hidden) {
        console.log('Tab is hidden, deferring dashboard load');
        setLoading(false);
        return;
      }

      setLoading(true);

      // Set a maximum 15 second timeout for all loading operations
      loadTimeout = setTimeout(() => {
        if (mounted) {
          console.warn('⚠️ Dashboard loading timeout - forcing completion');
          setLoading(false);
        }
      }, 15000);

      try {
        await Promise.all([
          loadDashboardData().catch(err => console.error('Dashboard data error:', err)),
          fetchUserAvatar().catch(err => console.error('Avatar error:', err)),
          fetchTaskCount().catch(err => console.error('Task count error:', err)),
          fetchCoverImage().catch(err => console.error('Cover image error:', err)),
          fetchFinancialData().catch(err => console.error('Financial data error:', err)),
          fetchWeatherData().catch(err => console.error('Weather data error:', err)),
          fetchMembershipData().catch(err => console.error('Membership data error:', err)),
          fetchRecentActivity().catch(err => console.error('Activity error:', err))
        ]);
      } catch (error) {
        console.error('Fatal dashboard loading error:', error);
      } finally {
        clearTimeout(loadTimeout);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Load immediately if tab is visible
    if (!document.hidden) {
      loadWithTimeout();
    } else {
      setLoading(false);
    }

    // Load when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden && mounted && loading) {
        console.log('Tab became visible, loading dashboard');
        loadWithTimeout();
      }
    };

    // Reload dashboard when connection is restored
    const handleReconnected = () => {
      console.log('🔄 Connection restored - reloading dashboard');
      if (mounted) {
        loadWithTimeout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('supabase-reconnected', handleReconnected);

    return () => {
      mounted = false;
      if (loadTimeout) clearTimeout(loadTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('supabase-reconnected', handleReconnected);
    };
  }, [currentClub]);

  // Real-time subscription for task count updates
  useEffect(() => {
    if (!currentClub?.clubId || !navigator.onLine) return;

    const channel = supabase
      .channel('task-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'club_tasks',
          filter: `club_id=eq.${currentClub.clubId}`
        },
        () => {
          fetchTaskCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentClub?.clubId]);

  const fetchUserAvatar = async () => {
    if (!user) return;

    // Skip if offline
    if (!navigator.onLine) {
      console.log('Offline - skipping user avatar fetch');
      setUserFirstName(user?.user_metadata?.first_name || '');
      return;
    }

    try {
      const result = await retryQuery(async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('avatar_url, first_name')
          .eq('id', user.id)
          .single();
        return { data, error };
      });

      if (result.error) throw result.error;

      if (result.data) {
        setUserAvatarUrl(result.data.avatar_url);
        // Use profile first_name which is synced from members table
        setUserFirstName(result.data.first_name || user?.user_metadata?.first_name || '');
      }
    } catch (err) {
      console.error('Error fetching user avatar:', err);
      // Fallback to user metadata
      setUserFirstName(user?.user_metadata?.first_name || '');
    }
  };

  const fetchCoverImage = async () => {
    if (!currentClub?.clubId) return;

    try {
      const cacheKey = `cover_image_${currentClub.clubId}`;
      const cachedUrl = localStorage.getItem(cacheKey);
      const cachedPosition = localStorage.getItem(`${cacheKey}_position`);

      if (cachedUrl) {
        setCoverImageUrl(cachedUrl);
      }

      if (cachedPosition) {
        try {
          setCoverImagePosition(JSON.parse(cachedPosition));
        } catch (e) {
          console.error('Error parsing cached position:', e);
        }
      }

      // Skip fetch if offline, use cached value
      if (!navigator.onLine) {
        console.log('Offline - using cached cover image');
        return;
      }

      const result = await retryQuery(async () => {
        const { data, error } = await supabase
          .from('clubs')
          .select('cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale')
          .eq('id', currentClub.clubId)
          .maybeSingle();
        return { data, error };
      });

      if (result.error) throw result.error;

      if (result.data?.cover_image_url) {
        setCoverImageUrl(result.data.cover_image_url);
        localStorage.setItem(cacheKey, result.data.cover_image_url);

        const position = {
          x: result.data.cover_image_position_x || 0,
          y: result.data.cover_image_position_y || 0,
          scale: result.data.cover_image_scale || 1
        };
        setCoverImagePosition(position);
        localStorage.setItem(`${cacheKey}_position`, JSON.stringify(position));
      } else {
        setCoverImageUrl(null);
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${cacheKey}_position`);
      }
    } catch (err) {
      console.error('Error fetching cover image:', err);
    }
  };

  const handleSaveCoverImage = async (file: File, position: { x: number; y: number; scale: number }) => {
    if (!currentClub?.clubId) {
      throw new Error('No club selected');
    }

    try {
      const { compressImage } = await import('../utils/imageCompression');
      const compressed = await compressImage(file, 'cover');

      const fileExt = compressed.name.split('.').pop() || 'jpg';
      const fileName = `${currentClub.clubId}/cover-${Date.now()}.${fileExt}`;

      console.log('Uploading to storage bucket: media, path:', fileName);

      // Check authentication status first
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Current auth session:', session ? 'Authenticated' : 'Not authenticated', {
        userId: session?.user?.id,
        hasAccessToken: !!session?.access_token
      });

      if (!session) {
        throw new Error('You must be logged in to upload images');
      }

      // Try direct upload first
      let uploadData: any;
      let uploadError: any;

      try {
        console.log('Attempting upload with auth token:', session.access_token.substring(0, 20) + '...');

        const uploadResult = await supabase.storage
          .from('media')
          .upload(fileName, compressed, {
            cacheControl: '3600',
            upsert: false
          });

        uploadData = uploadResult.data;
        uploadError = uploadResult.error;
      } catch (directUploadError: any) {
        console.warn('Direct upload failed, trying base64 workaround:', directUploadError);

        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(compressed);
        });

        // Convert base64 back to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: file.type });

        const uploadResult = await supabase.storage
          .from('media')
          .upload(fileName, blob, {
            cacheControl: '3600',
            upsert: false
          });

        uploadData = uploadResult.data;
        uploadError = uploadResult.error;
      }

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Upload successful:', uploadData);

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      console.log('Public URL generated:', publicUrl);

      console.log('Updating clubs table with cover image URL and position...');
      const { data: updateData, error: updateError } = await supabase
        .from('clubs')
        .update({
          cover_image_url: publicUrl,
          cover_image_position_x: position.x,
          cover_image_position_y: position.y,
          cover_image_scale: position.scale
        })
        .eq('id', currentClub.clubId)
        .select();

      if (updateError) {
        console.error('Database update error:', updateError);
        throw new Error(`Failed to update club: ${updateError.message}`);
      }

      console.log('Database update successful:', updateData);
      console.log('Cover image saved successfully');

      setCoverImageUrl(publicUrl);
      setCoverImagePosition(position);
      const cacheKey = `cover_image_${currentClub.clubId}`;
      localStorage.setItem(cacheKey, publicUrl);
      localStorage.setItem(`${cacheKey}_position`, JSON.stringify(position));

    } catch (err) {
      console.error('Error saving cover image:', err);
      if (err instanceof Error) {
        throw new Error(`Failed: ${err.message}`);
      }
      throw new Error('Failed to save cover image');
    }
  };

  const fetchTaskCount = async () => {
    if (!currentClub?.clubId) return;

    // Skip if offline
    if (!navigator.onLine) {
      console.log('Offline - skipping task count fetch');
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Task count fetch timeout')), 5000)
      );

      const queryPromise = retryQuery(async () => {
        const { count, error } = await supabase
          .from('club_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('club_id', currentClub.clubId)
          .neq('status', 'completed');
        return { data: count, error };
      });

      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      if (result.error) throw result.error;

      setTaskCount(result.data || 0);
    } catch (err) {
      console.error('Error fetching task count:', err);
    }
  };

  // Enrich series with round data from race_series_rounds table
  const enrichSeriesWithRoundData = async (series: any[]): Promise<any[]> => {
    try {
      if (!currentClub?.clubId || series.length === 0) {
        return series;
      }

      // Skip if offline
      if (!navigator.onLine) {
        console.log('Offline - skipping series enrichment');
        return series;
      }

      // Fetch all rounds from race_series_rounds table for these series (with timeout)
      const seriesIds = series.map(s => s.id);

      const roundsPromise = Promise.race([
        supabase
          .from('race_series_rounds')
          .select('series_id, round_name, skippers, race_results, last_completed_race, completed')
          .eq('club_id', currentClub.clubId)
          .in('series_id', seriesIds),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Rounds query timeout')), 5000)
        )
      ]);

      const { data: roundsData, error: roundsError } = await roundsPromise;

      if (roundsError || !roundsData) {
        console.error('Error fetching round data for dashboard:', roundsError);
        return series;
      }

      // Fetch series-level skippers from race_series table (with timeout)
      const seriesPromise = Promise.race([
        supabase
          .from('race_series')
          .select('id, skippers')
          .eq('club_id', currentClub.clubId)
          .in('id', seriesIds),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Series skippers query timeout')), 5000)
        )
      ]);

      const { data: seriesData, error: seriesError } = await seriesPromise;

      const seriesSkippersMap: Record<string, any[]> = {};
      if (seriesData && !seriesError) {
        seriesData.forEach(s => {
          seriesSkippersMap[s.id] = s.skippers || [];
        });
      }

      // Create a map of series_id + round_name to round data
      const roundDataMap: Record<string, any> = {};
      roundsData.forEach(round => {
        const key = `${round.series_id}-${round.round_name}`;
        roundDataMap[key] = round;
      });

      // Enrich series rounds with data from race_series_rounds table
      return series.map(s => ({
        ...s,
        skippers: seriesSkippersMap[s.id] || s.skippers || [],
        rounds: s.rounds.map((round: any) => {
          const key = `${s.id}-${round.name}`;
          const roundData = roundDataMap[key];
          if (roundData) {
            return {
              ...round,
              skippers: roundData.skippers || round.skippers || [],
              raceResults: roundData.race_results || round.raceResults || [],
              lastCompletedRace: roundData.last_completed_race || round.lastCompletedRace || 0,
              completed: roundData.completed !== undefined ? roundData.completed : round.completed
            };
          }
          return round;
        })
      }));
    } catch (err) {
      console.error('Error enriching series with round data:', err);
      return series;
    }
  };

  const loadDashboardData = async () => {
    try {

      // Create timeout wrapper for all queries (10 second timeout)
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
          )
        ]);
      };

      // Fetch data with individual error handling and timeouts
      const [raceEvents, raceSeries, members, publicEvents] = await Promise.allSettled([
        withTimeout(getStoredRaceEvents()).catch(err => {
          console.error('Error fetching race events:', err);
          return [];
        }),
        withTimeout(getStoredRaceSeries()).catch(err => {
          console.error('Error fetching race series:', err);
          return [];
        }),
        withTimeout(getStoredMembers()).catch(err => {
          console.error('Error fetching members:', err);
          return [];
        }),
        withTimeout(getPublicEvents()).catch(err => {
          console.error('Error fetching public events:', err);
          return [];
        })
      ]);

      // Extract values from settled promises
      const raceEventsData = raceEvents.status === 'fulfilled' ? raceEvents.value : [];
      const raceSeriesData = raceSeries.status === 'fulfilled' ? raceSeries.value : [];
      const membersData = members.status === 'fulfilled' ? members.value : [];
      const publicEventsData = publicEvents.status === 'fulfilled' ? publicEvents.value : [];

      // Enrich series with round data (with timeout)
      const enrichedSeries = await withTimeout(
        enrichSeriesWithRoundData(raceSeriesData)
      ).catch(err => {
        console.error('Error enriching series:', err);
        return raceSeriesData;
      });

      // Convert public events to RaceEvent format
      const publicRaceEvents = publicEventsData.map(publicEvent =>
        convertToRaceEvent(publicEvent)
      );

      // Process all sections with timeouts and error handling
      await Promise.allSettled([
        withTimeout(loadUpcomingEvents(raceEventsData, enrichedSeries, publicRaceEvents)).catch(err => {
          console.error('Error loading upcoming events:', err);
        }),
        withTimeout(loadRecentResults(raceEventsData, enrichedSeries, publicRaceEvents)).catch(err => {
          console.error('Error loading recent results:', err);
        })
      ]);

      // Calculate statistics (these are synchronous, but wrap in try-catch)
      try {
        calculateTopSkippers(raceEventsData, enrichedSeries);
      } catch (err) {
        console.error('Error calculating top skippers:', err);
      }

      try {
        calculateParticipationRate(raceEventsData, enrichedSeries, membersData);
      } catch (err) {
        console.error('Error calculating participation rate:', err);
      }

      try {
        calculateBoatClassDistribution(raceEventsData, enrichedSeries, publicRaceEvents);
      } catch (err) {
        console.error('Error calculating boat class distribution:', err);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Don't set loading to false here - let the timeout handle it
    }
  };

  const loadUpcomingEvents = async (raceEvents: RaceEvent[], raceSeries: any[], publicEvents: RaceEvent[]) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get upcoming quick races
      const upcomingQuickRaces = raceEvents.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        // Show events for today even if completed, and future events if not cancelled or completed
        const isToday = eventDate.getTime() === today.getTime();
        const isFutureAndNotCompleted = eventDate > today && !event.completed && !event.cancelled;
        return (isToday && !event.cancelled) || isFutureAndNotCompleted;
      });

      // Get upcoming series rounds
      const upcomingSeriesEvents: RaceEvent[] = [];
      raceSeries.forEach(series => {
        series.rounds.forEach((round: any, index: number) => {
          const roundDate = new Date(round.date);
          roundDate.setHours(0, 0, 0, 0);
          // Show events for today even if completed, and future events if not cancelled or completed
          const isToday = roundDate.getTime() === today.getTime();
          const isFutureAndNotCompleted = roundDate > today && !round.cancelled && !round.completed;
          const shouldShow = (isToday && !round.cancelled) || isFutureAndNotCompleted;

          if (shouldShow) {
            upcomingSeriesEvents.push({
              id: series.id,
              eventName: `${round.name} - ${series.seriesName}`,
              clubName: series.clubName,
              date: round.date,
              venue: round.venue,
              raceClass: series.raceClass,
              raceFormat: series.raceFormat,
              isSeriesEvent: true,
              seriesId: series.id,
              roundName: round.name
            });
          }
        });
      });

      // Get upcoming public events
      const upcomingPublicEvents = publicEvents.filter(event => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today;
      });

      // Combine and sort by date
      let allUpcoming = [...upcomingQuickRaces, ...upcomingSeriesEvents, ...upcomingPublicEvents]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 4); // Show only next 4 events

      // Fetch venue images for all events
      const venueNames = [...new Set(allUpcoming.map(e => e.venue).filter(Boolean))];
      const venueImages: Record<string, string> = {};

      if (venueNames.length > 0 && navigator.onLine) {
        try {
          const { data: venues } = await supabase
            .from('venues')
            .select('name, image')
            .in('name', venueNames);

          (venues || []).forEach(v => {
            if (v.image) venueImages[v.name] = v.image;
          });

          // Add venue images to events
          allUpcoming = allUpcoming.map(event => ({
            ...event,
            venueImage: event.venue ? venueImages[event.venue] : undefined
          }));
        } catch (error) {
          console.error('Error fetching venue images:', error);
        }
      }

      // Enrich with attendance data
      allUpcoming = await enrichEventsWithAttendance(allUpcoming);

      setUpcomingEvents(allUpcoming);
    } catch (error) {
      console.error('Error loading upcoming events:', error);
    }
  };

  const enrichEventsWithAttendance = async (events: RaceEvent[]) => {
    if (!currentClub?.clubId || events.length === 0) return events;

    // Skip if offline
    if (!navigator.onLine) {
      console.log('Offline - skipping attendance enrichment');
      return events;
    }

    try {
      // Add timeout to attendance query (5 second timeout)
      const attendancePromise = Promise.race([
        supabase
          .from('event_attendance')
          .select('event_id, series_id, round_name, user_id, status')
          .eq('club_id', currentClub.clubId)
          .eq('status', 'yes'),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Attendance query timeout')), 5000)
        )
      ]);

      const { data: attendanceData, error: attendanceError } = await attendancePromise;

      if (attendanceError) {
        console.error('[DashboardHome] Error fetching attendance:', attendanceError);
        return events;
      }

      if (!attendanceData || attendanceData.length === 0) {
        return events;
      }

      // Get unique user IDs
      const userIds = [...new Set(attendanceData.map(att => att.user_id))];

      // Add timeout to profiles query (5 second timeout)
      const profilesPromise = Promise.race([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Profiles query timeout')), 5000)
        )
      ]);

      const { data: profilesData, error: profilesError } = await profilesPromise;

      if (profilesError) {
        console.error('[DashboardHome] Error fetching profiles:', profilesError);
      }

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
          club: currentClub?.club?.name || '',
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

      // Enrich events with attendance data
      return events.map(event => {
        let attendees: any[] = [];

        if (event.isSeriesEvent && event.seriesId && event.roundName) {
          // For series rounds, look up by series_id + round_name
          const key = `${event.seriesId}-${event.roundName}`;
          attendees = seriesRoundAttendanceMap[key] || [];
        } else {
          // For single events, use event.id directly
          attendees = singleEventAttendanceMap[event.id] || [];
        }

        // Store attendees separately and preserve existing skippers from storage
        // Don't overwrite skippers - they contain the actual competing participants
        return {
          ...event,
          attendees: attendees
        };
      });
    } catch (error) {
      console.error('[DashboardHome] Error enriching events with attendance:', error);
      return events;
    }
  };

  const loadRecentResults = async (raceEvents: RaceEvent[], raceSeries: any[], publicEvents: RaceEvent[]) => {
    try {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      // Get completed quick races (regardless of date)
      const recentQuickRaces = raceEvents.filter(event => {
        return event.completed === true;
      });

      // Get completed series rounds
      const recentSeriesEvents: RaceEvent[] = [];
      raceSeries.forEach(series => {
        series.rounds.forEach((round: any, index: number) => {
          // A round is considered "completed" if it has results or has at least one completed race
          const hasResults = (round.raceResults && round.raceResults.length > 0) ||
                            (round.results && round.results.length > 0) ||
                            (round.lastCompletedRace && round.lastCompletedRace > 0);

          if (hasResults) {
            recentSeriesEvents.push({
              id: `${series.id}-round-${index}`,
              eventName: `${round.name} - ${series.seriesName}`,
              clubName: series.clubName,
              date: round.date,
              venue: round.venue,
              raceClass: series.raceClass,
              raceFormat: series.raceFormat,
              isSeriesEvent: true,
              seriesId: series.id,
              roundName: round.name,
              completed: round.completed || false,
              raceResults: round.raceResults || round.results || [],
              skippers: round.skippers || []
            });
          }
        });
      });

      // Combine and sort by date (most recent first)
      let allRecent = [...recentQuickRaces, ...recentSeriesEvents]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 4); // Show only 4 most recent events

      // Fetch venue images and member avatars for all recent results
      const venueNames = [...new Set(allRecent.map(e => e.venue).filter(Boolean))];
      const venueImages: Record<string, string> = {};

      if (venueNames.length > 0 && navigator.onLine) {
        try {
          const { data: venues } = await supabase
            .from('venues')
            .select('name, image')
            .in('name', venueNames);

          (venues || []).forEach(v => {
            if (v.image) venueImages[v.name] = v.image;
          });

          // Add venue images to events
          allRecent = allRecent.map(event => ({
            ...event,
            venueImage: event.venue ? venueImages[event.venue] : undefined
          }));
        } catch (error) {
          console.error('Error fetching venue images for recent results:', error);
        }
      }

      // Enrich skippers with avatar URLs from members table
      if (navigator.onLine && currentClub?.clubId) {
        try {
          const { data: members } = await supabase
            .from('members')
            .select('first_name, last_name, avatar_url')
            .eq('club_id', currentClub.clubId);

          if (members) {
            const memberAvatarMap: Record<string, string> = {};
            members.forEach(m => {
              const fullName = `${m.first_name} ${m.last_name}`.trim();
              if (m.avatar_url) {
                memberAvatarMap[fullName] = m.avatar_url;
              }
            });

            // Enrich skippers in each event
            allRecent = allRecent.map(event => ({
              ...event,
              skippers: (event.skippers || []).map(skipper => ({
                ...skipper,
                avatarUrl: memberAvatarMap[skipper.name] || skipper.avatarUrl
              }))
            }));
          }
        } catch (error) {
          console.error('Error fetching member avatars for recent results:', error);
        }
      }

      setRecentResults(allRecent);
    } catch (error) {
      console.error('Error loading recent results:', error);
    }
  };

  const calculateTopSkippers = (raceEvents: RaceEvent[], raceSeries: any[]) => {
    // Collect all race results
    const allResults: {skipperName: string, position: number}[] = [];
    
    // Process quick races
    raceEvents.forEach(event => {
      if (!event.completed || !event.raceResults || !event.skippers) return;
      
      event.raceResults.forEach(result => {
        if (result.position !== null) { // Count all positions, not just wins
          const skipper = event.skippers[result.skipperIndex];
          if (skipper) {
            allResults.push({
              skipperName: skipper.name,
              position: result.position
            });
          }
        }
      });
    });
    
    // Process series events
    raceSeries.forEach(series => {
      if (!series.skippers) return;
      
      series.rounds.forEach((round: any) => {
        if (!round.completed || !round.results) return;
        
        round.results.forEach((result: any) => {
          if (result.position !== null) { // Count all positions
            const skipper = series.skippers[result.skipperIndex];
            if (skipper) {
              allResults.push({
                skipperName: skipper.name,
                position: result.position
              });
            }
          }
        });
      });
    });
    
    // Count wins per skipper
    const winCounts: {[key: string]: number} = {};
    const positionSums: {[key: string]: {sum: number, count: number}} = {};
    
    allResults.forEach(result => {
      // Count wins (1st place)
      if (result.position === 1) {
        if (!winCounts[result.skipperName]) {
          winCounts[result.skipperName] = 0;
        }
        winCounts[result.skipperName]++;
      }
      
      // Track all positions for consistency calculation
      if (!positionSums[result.skipperName]) {
        positionSums[result.skipperName] = { sum: 0, count: 0 };
      }
      positionSums[result.skipperName].sum += result.position;
      positionSums[result.skipperName].count++;
    });
    
    // Calculate average position (consistency)
    const consistencyScores: {[key: string]: number} = {};
    Object.entries(positionSums).forEach(([name, data]) => {
      // Lower average position is better (more consistent)
      // We'll convert to a 0-100 scale where 100 is perfect (always 1st)
      const avgPosition = data.sum / data.count;
      // Assuming max position is 10 (can adjust based on your data)
      const maxPosition = 10;
      // Convert to 0-100 scale where 100 is best (always 1st)
      const score = Math.max(0, 100 - ((avgPosition - 1) / (maxPosition - 1)) * 100);
      consistencyScores[name] = Math.round(score);
    });
    
    // Combine wins and consistency
    const skipperStats = Object.keys({...winCounts, ...consistencyScores}).map(name => ({
      name,
      wins: winCounts[name] || 0,
      consistency: consistencyScores[name] || 0
    }));
    
    // Sort by wins first, then by consistency
    const sortedSkippers = skipperStats
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.consistency - a.consistency;
      })
      .slice(0, 5); // Top 5 skippers
    
    setTopSkippers(sortedSkippers);
  };

  const calculateParticipationRate = (raceEvents: RaceEvent[], raceSeries: any[], members: any[]) => {
    if (members.length === 0) {
      setParticipationRate(0);
      return;
    }
    
    // Get unique member IDs who have participated in races
    const participatingSkippers = new Set<string>();
    
    // Process quick races
    raceEvents.forEach(event => {
      if (!event.skippers) return;
      
      event.skippers.forEach(skipper => {
        participatingSkippers.add(skipper.name);
      });
    });
    
    // Process series events
    raceSeries.forEach(series => {
      if (!series.skippers) return;
      
      series.skippers.forEach((skipper: any) => {
        participatingSkippers.add(skipper.name);
      });
    });
    
    // Calculate participation rate
    const rate = (participatingSkippers.size / members.length) * 100;
    setParticipationRate(Math.round(rate));
  };

  const calculateBoatClassDistribution = (raceEvents: RaceEvent[], raceSeries: any[], publicEvents: RaceEvent[]) => {
    const distribution: {[key: string]: number} = {};
    
    // Process quick races
    raceEvents.forEach(event => {
      if (!event.raceClass) return;
      
      if (!distribution[event.raceClass]) {
        distribution[event.raceClass] = 0;
      }
      distribution[event.raceClass]++;
    });
    
    // Process series events
    raceSeries.forEach(series => {
      if (!series.raceClass) return;
      
      if (!distribution[series.raceClass]) {
        distribution[series.raceClass] = 0;
      }
      distribution[series.raceClass]++;
    });

    // Process public events
    publicEvents.forEach(event => {
      if (!event.raceClass) return;
      
      if (!distribution[event.raceClass]) {
        distribution[event.raceClass] = 0;
      }
      distribution[event.raceClass]++;
    });
    
    setBoatClassDistribution(distribution);
  };

  const fetchFinancialData = async () => {
    if (!currentClub?.clubId || !navigator.onLine) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Financial data fetch timeout')), 5000)
      );

      const queryPromise = retryQuery(async () => {
        const { data: transactions, error } = await supabase
          .from('membership_transactions')
          .select('amount, payment_status, created_at')
          .eq('club_id', currentClub.clubId)
          .gte('created_at', thirtyDaysAgo.toISOString());
        return { data: transactions, error };
      });

      const result = await Promise.race([queryPromise, timeoutPromise]) as any;
      if (result.error) throw result.error;

      const transactions = result.data;
      const income = transactions?.filter(t => t.payment_status === 'paid').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
      const outstanding = transactions?.filter(t => t.payment_status === 'pending').reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

      setFinancialData({
        income,
        expenses: 0,
        netIncome: income,
        outstanding,
        transactionCount: transactions?.length || 0
      });
    } catch (err) {
      console.error('Error fetching financial data:', err);
    }
  };

  const fetchWeatherData = async () => {
    if (!currentClub?.clubId || !navigator.onLine) return;

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Weather data fetch timeout')), 5000)
      );

      const venuePromise = retryQuery(async () => {
        const { data, error } = await supabase
          .from('venues')
          .select('latitude, longitude, name')
          .eq('club_id', currentClub.clubId)
          .limit(1)
          .maybeSingle();
        return { data, error };
      });

      const venueResult = await Promise.race([venuePromise, timeoutPromise]) as any;
      if (venueResult.error) throw venueResult.error;

      const venue = venueResult.data;

      if (venue?.latitude && venue?.longitude) {
        const cacheKey = `weather_${venue.latitude}_${venue.longitude}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 3600000) {
            setWeatherData(data);
            return;
          }
        }

        const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
        if (!apiKey) return;

        const weatherTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Weather API timeout')), 5000)
        );

        const weatherFetch = fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${venue.latitude}&lon=${venue.longitude}&units=metric&appid=${apiKey}`
        );

        const response = await Promise.race([weatherFetch, weatherTimeout]) as Response;
        const data = await response.json();

        setWeatherData({
          temp: Math.round(data.main.temp),
          condition: data.weather[0].main,
          wind: Math.round(data.wind.speed * 3.6),
          humidity: data.main.humidity,
          venueName: venue.name
        });

        localStorage.setItem(cacheKey, JSON.stringify({ data: {
          temp: Math.round(data.main.temp),
          condition: data.weather[0].main,
          wind: Math.round(data.wind.speed * 3.6),
          humidity: data.main.humidity,
          venueName: venue.name
        }, timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('Error fetching weather data:', err);
    }
  };

  const fetchMembershipData = async () => {
    if (!currentClub?.clubId || !navigator.onLine) return;

    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Membership data fetch timeout')), 5000)
      );

      const queryPromise = Promise.all([
        retryQuery(async () => {
          const { data, error } = await supabase
            .from('members')
            .select('id, payment_status, membership_status')
            .eq('club_id', currentClub.clubId)
            .eq('membership_status', 'active');
          return { data, error };
        }),
        retryQuery(async () => {
          const { data, error } = await supabase
            .from('membership_applications')
            .select('id, status')
            .eq('club_id', currentClub.clubId)
            .eq('status', 'pending');
          return { data, error };
        })
      ]);

      const [membersResult, applicationsResult] = await Promise.race([queryPromise, timeoutPromise]) as any;

      const expiring = 0;
      const unpaid = membersResult.data?.filter(m => m.payment_status === 'unpaid').length || 0;
      const pending = applicationsResult.data?.length || 0;

      setMembershipData({
        expiringCount: expiring,
        unpaidCount: unpaid,
        pendingApplications: pending,
        totalMembers: membersResult.data?.length || 0
      });
    } catch (err) {
      console.error('Error fetching membership data:', err);
    }
  };

  const fetchRecentActivity = async () => {
    if (!currentClub?.clubId || !navigator.onLine) return;

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Recent activity fetch timeout')), 5000)
      );

      const queryPromise = Promise.all([
        retryQuery(async () => {
          const { data, error } = await supabase
            .from('notifications')
            .select('subject, created_at, type')
            .eq('club_id', currentClub.clubId)
            .order('created_at', { ascending: false })
            .limit(5);
          return { data, error };
        }),
        retryQuery(async () => {
          const { data, error } = await supabase
            .from('members')
            .select('first_name, last_name, created_at')
            .eq('club_id', currentClub.clubId)
            .order('created_at', { ascending: false })
            .limit(3);
          return { data, error };
        })
      ]);

      const [notificationsResult, membersResult] = await Promise.race([queryPromise, timeoutPromise]) as any;

      const activities = [
        ...(notificationsResult.data?.map(n => ({
          type: 'notification',
          title: n.subject,
          timestamp: n.created_at
        })) || []),
        ...(membersResult.data?.map(m => ({
          type: 'member_joined',
          title: `${m.first_name} ${m.last_name} joined`,
          timestamp: m.created_at
        })) || [])
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

      setRecentActivity(activities);
    } catch (err) {
      console.error('Error fetching recent activity:', err);
    }
  };

  const getChartColors = (darkMode: boolean) => {
    return {
      blue: darkMode ? 'rgba(59, 130, 246, 0.8)' : 'rgba(37, 99, 235, 0.8)',
      purple: darkMode ? 'rgba(139, 92, 246, 0.8)' : 'rgba(124, 58, 237, 0.8)',
      green: darkMode ? 'rgba(16, 185, 129, 0.8)' : 'rgba(5, 150, 105, 0.8)',
      orange: darkMode ? 'rgba(249, 115, 22, 0.8)' : 'rgba(234, 88, 12, 0.8)',
      red: darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(220, 38, 38, 0.8)',
      cyan: darkMode ? 'rgba(6, 182, 212, 0.8)' : 'rgba(8, 145, 178, 0.8)',
      pink: darkMode ? 'rgba(236, 72, 153, 0.8)' : 'rgba(219, 39, 119, 0.8)'
    };
  };

  const colors = getChartColors(darkMode);

  const boatClassChartData = {
    labels: Object.keys(boatClassDistribution),
    datasets: [
      {
        data: Object.values(boatClassDistribution),
        backgroundColor: [
          colors.blue,
          colors.purple,
          colors.green,
          colors.orange,
          colors.red,
          colors.cyan,
          colors.pink
        ],
        borderWidth: 0
      }
    ]
  };

  const topSkippersChartData = {
    labels: topSkippers.map(s => s.name),
    datasets: [
      {
        label: 'Race Wins',
        data: topSkippers.map(s => s.wins),
        backgroundColor: colors.blue,
        borderRadius: 6
      },
      {
        label: 'Consistency Score',
        data: topSkippers.map(s => s.consistency / 10), // Scale down to match with wins
        backgroundColor: colors.green,
        borderRadius: 6
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: darkMode ? '#e2e8f0' : '#334155',
          font: {
            size: 11
          },
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: darkMode ? '#e2e8f0' : '#1e293b',
        bodyColor: darkMode ? '#e2e8f0' : '#1e293b',
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12
      }
    }
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#475569'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#475569'
        }
      }
    }
  };

  // Use firstName from state (loaded from profile/member data)
  const firstName = userFirstName;
  // Get full club name
  const clubName = currentClub?.club?.name || 'your yacht club';

  return (
    <div className={`h-full overflow-y-auto ${darkMode ? '' : 'bg-gradient-to-br from-slate-50 to-slate-100'}`}>
      {/* Cover Image Section */}
      <div className="relative w-full h-[300px] bg-slate-800 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={coverImageUrl || '/lmryc_slide.jpeg'}
            alt="Club cover"
            className="absolute min-w-full min-h-full object-cover"
            style={coverImageUrl ? {
              transform: `translate(${coverImagePosition.x}px, ${coverImagePosition.y}px) scale(${coverImagePosition.scale})`,
              transformOrigin: 'center',
            } : undefined}
          />
        </div>
        <div className="absolute inset-0 bg-black opacity-10 pointer-events-none" />

        {isAdmin && (
          <button
            onClick={() => setShowCoverImageModal(true)}
            className="absolute top-4 right-4 p-3 bg-slate-900 bg-opacity-30 hover:bg-opacity-50 text-white rounded-lg backdrop-blur-sm transition-all flex items-center gap-2"
            title={coverImageUrl ? 'Change Cover' : 'Add Cover'}
          >
            <Camera className="w-5 h-5" />
          </button>
        )}

        {/* Welcome Header Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 via-slate-900/70 to-transparent p-4 sm:p-8 lg:p-16">
          <div className="flex items-center gap-3 sm:gap-4">
            {userAvatarUrl && (
              <img
                src={userAvatarUrl}
                alt={firstName || 'User'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border border-white/30"
              />
            )}
            <div>
              <h1
                className="text-xl sm:text-2xl lg:text-3xl font-bold"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 4px 16px rgba(0, 0, 0, 0.6)'
                }}
              >
                Welcome to Alfie Pro{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p
                className="text-sm sm:text-base mt-1"
                style={{
                  color: '#ffffff',
                  opacity: 0.95,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.7)'
                }}
              >
                The Ultimate Principal Race Officer & Club Mgt Tool for {clubName}.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-16">
        {/* Trial Status Banner */}
        <TrialStatusBanner />

        {/* Customizable Dashboard - Full Widget System (includes all widgets) */}
        <CustomizableDashboard />
      </div>

      {/* Cover Image Upload Modal */}
      <CoverImageUploadModal
        isOpen={showCoverImageModal}
        onClose={() => setShowCoverImageModal(false)}
        onSave={handleSaveCoverImage}
        currentImageUrl={coverImageUrl}
        currentPosition={coverImagePosition}
      />
    </div>
  );
};

// Helper functions
function calculateNextEventDays(events: RaceEvent[]): number {
  if (!events || events.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextEvent = events[0];
  const eventDate = new Date(nextEvent.date);
  eventDate.setHours(0, 0, 0, 0);

  const diffTime = eventDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

function getNextEventText(events: RaceEvent[]): string {
  if (!events || events.length === 0) return 'No upcoming events';

  const days = calculateNextEventDays(events);

  if (days === 0) {
    return 'Next event is on today!';
  } else if (days === 1) {
    return 'Next event in 1 day';
  } else {
    return `Next event in ${days} days`;
  }
}

function calculateRaceCompletionRate(events: RaceEvent[]): number {
  if (!events || events.length === 0) return 0;
  
  const completedEvents = events.filter(e => e.completed).length;
  return Math.round((completedEvents / events.length) * 100);
}

function getMostPopularBoatClass(distribution: {[key: string]: number}): string {
  if (Object.keys(distribution).length === 0) return 'N/A';
  
  let mostPopular = '';
  let highestCount = 0;
  
  Object.entries(distribution).forEach(([boatClass, count]) => {
    if (count > highestCount) {
      mostPopular = boatClass;
      highestCount = count;
    }
  });
  
  return mostPopular;
}

function getMostPopularClassPercentage(distribution: {[key: string]: number}): number {
  if (Object.keys(distribution).length === 0) return 0;
  
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
  const mostPopular = getMostPopularBoatClass(distribution);
  const count = distribution[mostPopular] || 0;
  
  return Math.round((count / total) * 100);
}