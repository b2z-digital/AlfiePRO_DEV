import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Bell,
  Trophy,
  TrendingUp,
  TrendingDown,
  Sailboat,
  RefreshCw,
  LogOut,
  Target,
  Award,
  Activity,
  BarChart2,
  List,
  Home,
  Layers,
  Flag,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import {
  getCurrentTrackingSession,
  getSkipperTrackingStatus,
  updateSessionActivity,
  savePushSubscription,
  getRaceStatus,
  subscribeToRaceStatus,
  getLiveTrackingEventByToken,
  RaceStatus,
} from '../utils/liveTrackingStorage';
import { calculateEventStandings } from '../utils/standingsCalculator';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import LiveTrackingTabContent from '../components/live-tracking/LiveTrackingTabContent';
import type {
  LiveTrackingSession,
  SessionSkipperTracking,
  SkipperDashboardData,
} from '../types/liveTracking';
import type { HeatDesignation, HeatManagement, HeatResult } from '../types/heat';
import type { RaceEvent } from '../types/race';

type TabView = 'overview' | 'results' | 'performance' | 'heat';

export default function LiveDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const isShortCode = window.location.pathname.startsWith('/t/');
  const basePrefix = isShortCode ? `/t/${token}` : `/live/${token}`;

  const [session, setSession] = useState<LiveTrackingSession | null>(null);
  const [tracking, setTracking] = useState<SessionSkipperTracking | null>(null);
  const [dashboardData, setDashboardData] = useState<SkipperDashboardData | null>(null);
  const [heatManagement, setHeatManagement] = useState<HeatManagement | null>(null);
  const [fullEvent, setFullEvent] = useState<RaceEvent | null>(null);
  const [calculatedStandings, setCalculatedStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [raceStatus, setRaceStatus] = useState<RaceStatus>('on_hold');
  const [statusNotes, setStatusNotes] = useState<string | null>(null);

  const realtimeChannelRef = useRef<any>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const initSession = async () => {
      const unsubscribe = await loadSession();
      if (unsubscribe) {
        statusUnsubscribeRef.current = unsubscribe;
      }
    };

    initSession();

    const activityInterval = setInterval(() => {
      if (session) {
        updateSessionActivity(session.id);
      }
    }, 30000);

    return () => {
      clearInterval(activityInterval);
      stopPollingFallback();
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (session) {
      setupRealtimeSubscription();
      checkNotificationPermission();
    }
  }, [session]);

  const loadSession = async () => {
    try {
      setLoading(true);

      if (!token) {
        navigate('/');
        return;
      }

      const trackingEvent = await getLiveTrackingEventByToken(token);
      if (!trackingEvent) {
        navigate(basePrefix);
        return;
      }

      const currentSession = await getCurrentTrackingSession(trackingEvent.event_id);
      if (!currentSession) {
        navigate(basePrefix);
        return;
      }

      setSession(currentSession);

      const trackingStatus = await getSkipperTrackingStatus(currentSession.id);
      setTracking(trackingStatus);

      await loadDashboardData(trackingEvent.event_id, currentSession);

      // Load initial race status
      const statusData = await getRaceStatus(trackingEvent.event_id);
      if (statusData) {
        setRaceStatus(statusData.status);
        setStatusNotes(statusData.notes);
      }

      // Subscribe to race status changes
      const unsubscribe = subscribeToRaceStatus(
        trackingEvent.event_id,
        (newStatus, notes) => {
          setRaceStatus(newStatus);
          setStatusNotes(notes);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async (eventId: string, session: LiveTrackingSession) => {
    try {
      console.log('🔍 Loading dashboard data for event:', eventId);

      // Try to load event from different tables
      let event: any = null;

      // Try public_events first (for association events)
      const { data: publicEventData } = await supabase
        .from('public_events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (publicEventData) {
        console.log('✅ Found event in public_events');
        event = publicEventData;
      } else {
        // Try race_series
        const { data: seriesData } = await supabase
          .from('race_series')
          .select('*')
          .eq('id', eventId)
          .maybeSingle();

        if (seriesData) {
          console.log('✅ Found event in race_series');
          event = seriesData;
        } else {
          // Fall back to quick_races
          const { data: raceData, error: eventError } = await supabase
            .from('quick_races')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

          if (eventError) throw eventError;

          if (raceData) {
            console.log('✅ Found event in quick_races');
            event = raceData;
          }
        }
      }

      if (!event) {
        throw new Error('Event not found in any table');
      }

      console.log('📊 Event data loaded:', event);

      // Normalize field names across different event tables
      const eventName = event.event_name || event.name || event.club_name || 'Race Event';
      const eventDate = event.date || event.race_date || event.event_date || new Date().toISOString();
      const raceClass = event.race_class || event.boat_class || 'DF95';

      let venueName = event.venue || event.race_venue || 'TBA';
      if (event.venue_id) {
        const { data: venue } = await supabase
          .from('venues')
          .select('name')
          .eq('id', event.venue_id)
          .maybeSingle();
        if (venue) venueName = venue.name;
      }

      const heatMgmt = event.heat_management as HeatManagement | null;
      setHeatManagement(heatMgmt);

      let skippersList = Array.isArray(event.skippers) ? event.skippers : [];
      console.log('👥 Skippers list from event.skippers:', skippersList.length, 'skippers');

      // If no skippers in the event object, try loading from event_attendance (for public events)
      if (skippersList.length === 0) {
        console.log('⚠️ No skippers in event.skippers, trying event_attendance...');
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('event_attendance')
          .select('member_id, members(id, first_name, last_name, sail_number, avatar_url)')
          .eq('event_id', eventId);

        if (attendanceError) {
          console.error('❌ Error loading event_attendance:', attendanceError);
        } else if (attendanceData && attendanceData.length > 0) {
          console.log('✅ Found', attendanceData.length, 'skippers in event_attendance');
          skippersList = attendanceData.map((attendance: any) => ({
            name: `${attendance.members.first_name} ${attendance.members.last_name}`,
            skipper_name: `${attendance.members.first_name} ${attendance.members.last_name}`,
            sailNo: attendance.members.sail_number,
            sail_number: attendance.members.sail_number,
            sailNumber: attendance.members.sail_number,
            avatar_url: attendance.members.avatar_url,
            avatarUrl: attendance.members.avatar_url,
            member_id: attendance.member_id,
            hull: raceClass,
            boat_class: raceClass,
            boatClass: raceClass,
          }));
          console.log('✅ Built skippers list from attendance:', skippersList.length, 'skippers');
        }
      }

      // Fetch member data (name, avatar) from database for all skippers
      if (skippersList.length > 0 && event.club_id) {
        // Build unique list of sail_number + boat_class combinations
        const skipperKeys = skippersList.map((s: any) => ({
          sailNo: s.sailNo || s.sailNumber || s.sail_number,
          boatClass: s.hull || s.boat_class || s.boatClass
        })).filter(k => k.sailNo && k.boatClass);

        console.log('🔍 Fetching member data for skipper keys:', skipperKeys);

        if (skipperKeys.length > 0) {
          const sailNumbers = [...new Set(skipperKeys.map(k => k.sailNo))];

          // Step 1: Get member_boats for the sail numbers (with boat_class for matching)
          const { data: boatsData, error: boatsError } = await supabase
            .from('member_boats')
            .select('sail_number, boat_class, member_id')
            .in('sail_number', sailNumbers);

          if (boatsError) {
            console.error('❌ Error fetching boats:', boatsError);
          } else {
            console.log('📦 Boats data received:', boatsData);
          }

          if (boatsData && boatsData.length > 0) {
            // Get unique member IDs
            const memberIds = [...new Set(boatsData.map(b => b.member_id))];
            console.log('👤 Member IDs to fetch:', memberIds);

            // Step 2: Get member data for those member IDs
            const { data: membersData, error: membersError } = await supabase
              .from('members')
              .select('id, first_name, last_name, avatar_url')
              .eq('club_id', event.club_id)
              .in('id', memberIds);

            if (membersError) {
              console.error('❌ Error fetching members:', membersError);
            } else {
              console.log('👥 Members data received:', membersData);
            }

            if (membersData && membersData.length > 0) {
              // Create member ID to member data map
              const memberDataById = new Map(
                membersData.map(m => [
                  m.id,
                  {
                    name: `${m.first_name} ${m.last_name}`,
                    avatar_url: m.avatar_url
                  }
                ])
              );

              // Create composite key (sail_number + boat_class) to member data map
              const memberDataMap = new Map();
              boatsData.forEach(boat => {
                const memberData = memberDataById.get(boat.member_id);
                if (memberData) {
                  const key = `${boat.sail_number}|${boat.boat_class}`;
                  memberDataMap.set(key, memberData);
                }
              });

              console.log('🗺️ Member data map:', Array.from(memberDataMap.entries()));

              // Merge member data into skippers list
              skippersList = skippersList.map((skipper: any) => {
                const sailNo = skipper.sailNo || skipper.sailNumber || skipper.sail_number;
                const boatClass = skipper.hull || skipper.boat_class || skipper.boatClass;
                const key = `${sailNo}|${boatClass}`;
                const memberData = memberDataMap.get(key);
                if (memberData) {
                  console.log(`✅ Merging data for ${key}:`, memberData);
                }
                return {
                  ...skipper,
                  name: memberData?.name || skipper.name || skipper.skipper_name,
                  skipper_name: memberData?.name || skipper.name || skipper.skipper_name,
                  avatar_url: memberData?.avatar_url || skipper.avatar_url || skipper.avatarUrl || null
                };
              });
              console.log('✅ Merged member data for', memberDataMap.size, 'skippers');
              console.log('📋 Updated skippers list sample:', skippersList.slice(0, 3));
            }
          } else {
            console.warn('⚠️ No boat data found for any skippers');
          }
        }
      }

      console.log('📋 Event structure check:', {
        hasSkippers: !!event.skippers,
        skippersLength: event.skippers?.length,
        hasRaceResults: !!event.raceResults,
        hasRace_results: !!event.race_results,
        raceResultsLength: event.raceResults?.length || event.race_results?.length,
      });

      let currentHeat: HeatDesignation | null = null;
      let currentRound: number | null = null;
      let skipperIndex: number | null = null;

      if (heatMgmt && heatMgmt.rounds && heatMgmt.rounds.length > 0) {
        skipperIndex = skippersList.findIndex(
          (s: any) =>
            (s.sailNo || s.sailNumber || s.sail_number) === session.selected_sail_number
        );

        if (skipperIndex !== -1 && heatMgmt.currentRound) {
          currentRound = heatMgmt.currentRound;
          const currentRoundData = heatMgmt.rounds.find((r) => r.round === currentRound);
          if (currentRoundData) {
            const assignment = currentRoundData.heatAssignments.find((ha) =>
              ha.skipperIndices.includes(skipperIndex!)
            );
            if (assignment) {
              currentHeat = assignment.heatDesignation;
            }
          }
        }
      }

      // Normalize the event structure for the standings calculator
      // For heat-managed events, convert heat results to race results format
      let raceResults = event.raceResults || event.race_results || [];

      if (heatMgmt && heatMgmt.rounds && heatMgmt.rounds.length > 0) {
        console.log('🔄 Converting heat results to race results format...');
        raceResults = convertHeatResultsToRaceResults(heatMgmt, skippersList);
        console.log('✅ Converted heat results:', raceResults.length, 'results');
      }

      const normalizedEvent: RaceEvent = {
        ...event,
        skippers: skippersList,
        raceResults: raceResults,
      } as RaceEvent;

      // Store normalized event for use in other views (includes converted heat results)
      setFullEvent(normalizedEvent);

      console.log('📋 Normalized event for calculator:', {
        skippersCount: normalizedEvent.skippers?.length,
        raceResultsCount: normalizedEvent.raceResults?.length,
        isHeatManaged: !!(heatMgmt && heatMgmt.rounds && heatMgmt.rounds.length > 0),
      });

      // Use standings calculator for single source of truth with NET scores
      const standingsData = calculateEventStandings(normalizedEvent);
      console.log('📊 calculateEventStandings returned:', standingsData.length, 'skippers');

      // Calculate additional properties needed for display
      // Use the same raceResults we used for the standings calculator
      console.log('📊 Race results count:', raceResults.length);

      // If no results yet, log that we're in pre-race mode
      if (raceResults.length === 0) {
        console.log('⚠️ No race results yet - displaying pre-race standings');
      }

      const enhancedStandings = standingsData.map((standing, idx) => {
        // Calculate gross total and handle skippers without results
        const skipperResults = raceResults.filter((r: any) => r.skipperIndex === standing.index);
        const grossTotal = skipperResults.reduce((sum: number, r: any) => {
          if (r.position !== null && !r.letterScore) {
            return sum + r.position;
          }
          return sum;
        }, 0);

        // Handle skippers without results (netTotal will be Number.MAX_SAFE_INTEGER)
        const hasResults = standing.netTotal !== Number.MAX_SAFE_INTEGER;
        const netTotal = hasResults ? standing.netTotal : 0;

        return {
          ...standing,
          position: idx + 1,
          netTotal,
          grossTotal,
          racesCompleted: skipperResults.length,
          hasResults,
        };
      });

      console.log('�� Enhanced standings:', enhancedStandings);
      setCalculatedStandings(enhancedStandings);

      // Find current user in standings
      console.log('🔍 Looking for sail number:', session.selected_sail_number);
      console.log('🔍 Available skippers:', skippersList.map((s: any) => ({
        sailNo: s.sailNo,
        sailNumber: s.sailNumber,
        sail_number: s.sail_number,
        name: s.name
      })));

      const currentUserIndex = skippersList.findIndex(
        (s: any) =>
          (s.sailNo || s.sailNumber || s.sail_number) === session.selected_sail_number
      );

      console.log('👤 Current user index:', currentUserIndex);
      console.log('👤 Enhanced standings count:', enhancedStandings.length);
      const currentUserStanding = enhancedStandings.find((s) => s.index === currentUserIndex);
      console.log('👤 Current user standing:', currentUserStanding);

      if (currentUserIndex === -1) {
        console.error('❌ User not found in skippers list! Sail number:', session.selected_sail_number);
        console.log('⚠️ Skipper may have been removed from the event');

        // If the selected skipper is no longer in the event, redirect back to skipper selection
        // This handles the case where an admin removes a skipper during live tracking
        if (skippersList.length > 0) {
          console.log('🔄 Redirecting to skipper selection page...');
          localStorage.removeItem('alfie_current_tracking_session');
          localStorage.removeItem('alfie_tracking_skipper');
          navigate(basePrefix);
          return;
        }
      }

      // Build standings array for display
      const standings = enhancedStandings.map((s) => {
        const skipper = skippersList[s.index];
        const sailNo = skipper?.sailNo || skipper?.sailNumber || skipper?.sail_number || '';

        return {
          position: s.position,
          name: skipper?.name || skipper?.skipper_name || '',
          sail_number: sailNo,
          points: s.netTotal, // Use NET score with drops applied
          gross_points: s.grossTotal,
          races_completed: s.racesCompleted,
          is_current_user: sailNo === session.selected_sail_number,
          avatar_url: skipper?.avatarUrl || skipper?.avatar_url || null,
        };
      });

      console.log('📊 Display standings:', standings);
      let currentUserData = standings.find((s) => s.is_current_user);
      console.log('👤 Current user data for display:', currentUserData);

      // If avatar is still missing, try to load it directly from members table
      if (currentUserData && !currentUserData.avatar_url) {
        console.log('⚠️ Avatar missing for current user, trying direct member lookup...');
        const { data: memberData } = await supabase
          .from('members')
          .select('avatar_url')
          .eq('sail_number', session.selected_sail_number)
          .maybeSingle();

        if (memberData?.avatar_url) {
          console.log('✅ Found avatar via direct member lookup:', memberData.avatar_url);
          currentUserData = {
            ...currentUserData,
            avatar_url: memberData.avatar_url,
          };
        }
      }

      const currentStatus = {
        position: currentUserData?.position || null,
        total_points: currentUserData?.points || null,
        races_completed: currentUserData?.races_completed || 0,
      };

      console.log('📊 Current status:', currentStatus);

      console.log('✅ Setting dashboard data with:', {
        skipperName: session.selected_skipper_name,
        skipperSailNumber: session.selected_sail_number,
        skipperAvatarUrl: currentUserData?.avatar_url,
        eventName: eventName,
        eventDate: eventDate,
        venueName: venueName,
        raceClass: raceClass,
      });

      setDashboardData({
        skipper: {
          name: session.selected_skipper_name || '',
          sail_number: session.selected_sail_number || '',
          boat_class: raceClass,
          avatar_url: currentUserData?.avatar_url || null,
          current_heat: currentHeat,
          current_round: currentRound,
        },
        event: {
          id: event.id,
          name: eventName,
          date: eventDate,
          venue: venueName,
          race_format: event.race_format || 'handicap',
          type: event.type || 'one-off',
        },
        current_status: currentStatus,
        upcoming_race: null,
        standings: standings,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const startPollingFallback = () => {
    // Stop any existing polling
    stopPollingFallback();

    console.log('🔄 Starting polling fallback (every 3 seconds)...');

    // Poll every 3 seconds
    pollingIntervalRef.current = setInterval(() => {
      console.log('📊 Polling for updates...');
      handleRefresh();
    }, 3000);
  };

  const stopPollingFallback = () => {
    if (pollingIntervalRef.current) {
      console.log('⏸️ Stopping polling fallback');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const setupRealtimeSubscription = () => {
    if (!session) return;

    console.log('🔴 Setting up real-time subscription for session:', session.id);

    const channel = supabase
      .channel(`live_tracking_${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_skipper_tracking',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          console.log('🟢 Tracking INSERT received:', payload);
          setTracking(payload.new as SessionSkipperTracking);
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_skipper_tracking',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          console.log('🟢 Tracking UPDATE received:', payload);
          setTracking(payload.new as SessionSkipperTracking);
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_tracking_sessions',
          filter: `id=eq.${session.id}`,
        },
        () => {
          console.log('🟡 Live tracking session UPDATE received, refreshing...');
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_races',
        },
        () => {
          console.log('🟡 Quick races UPDATE received, refreshing...');
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_tracking_events',
        },
        async (payload) => {
          console.log('🟢 Live tracking events UPDATE received:', payload);
          const newData = payload.new as any;
          if (newData.race_status) {
            console.log('🔄 Updating race status to:', newData.race_status);
            setRaceStatus(newData.race_status as RaceStatus);
            setStatusNotes(newData.status_notes);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);

        // If realtime fails, start polling as fallback
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('⚠️ Realtime subscription failed, starting polling fallback...');
          startPollingFallback();
        } else if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime connected, stopping polling fallback');
          stopPollingFallback();
        }
      });

    realtimeChannelRef.current = channel;
  };

  const checkNotificationPermission = () => {
    // Check if notifications are enabled in session storage
    const enabled = sessionStorage.getItem('alfie_live_notifications_enabled');
    setNotificationsEnabled(enabled === 'true');
  };

  const handleRequestNotifications = async () => {
    try {
      // Enable in-app notifications
      setNotificationsEnabled(true);
      sessionStorage.setItem('alfie_live_notifications_enabled', 'true');

      if (session) {
        await savePushSubscription(session.id, {
          endpoint: 'in-app-notification',
          expirationTime: null,
          keys: { p256dh: '', auth: '' },
        });
      }

      // Show in-app notification that live tracking is enabled
      // Note: This will be handled by the realtime subscription updates
    } catch (error) {
      console.error('Error enabling notifications:', error);
    }
  };

  const handleRefresh = async () => {
    if (!session) return;

    // Use event ID from dashboardData if available, otherwise from session
    const eventId = dashboardData?.event.id || session.event_id;
    if (!eventId) return;

    console.log('🔄 Manually refreshing dashboard data...');
    setRefreshing(true);

    // Force a fresh fetch by clearing any cached data
    try {
      await loadDashboardData(eventId, session);

      // Also refresh the race status
      const statusData = await getRaceStatus(eventId);
      if (statusData) {
        console.log('🔄 Refreshed race status:', statusData.status);
        setRaceStatus(statusData.status);
        setStatusNotes(statusData.notes);
      }

      console.log('✅ Dashboard refresh complete');
    } catch (error) {
      console.error('❌ Error during refresh:', error);
    }

    setTimeout(() => setRefreshing(false), 500);
  };

  const handleLogout = async () => {
    // End the current session
    if (session) {
      try {
        await supabase
          .from('live_tracking_sessions')
          .update({ is_expired: true })
          .eq('id', session.id);
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }

    // Clear local storage
    localStorage.removeItem('alfie_current_tracking_session');
    localStorage.removeItem('alfie_tracking_skipper');
    sessionStorage.removeItem('alfie_live_notifications_enabled');

    // Navigate to skipper selection
    navigate(basePrefix);
  };

  const getHeatColor = (heat: HeatDesignation): string => {
    const colors = {
      A: 'from-yellow-400 to-amber-500',
      B: 'from-orange-400 to-orange-600',
      C: 'from-pink-400 to-rose-500',
      D: 'from-green-400 to-emerald-600',
      E: 'from-blue-400 to-blue-600',
      F: 'from-purple-400 to-purple-600',
    };
    return colors[heat] || 'from-gray-400 to-gray-600';
  };

  const getHeatBadgeColor = (heat: HeatDesignation): string => {
    const colors = {
      A: 'bg-yellow-400 text-yellow-900',
      B: 'bg-orange-400 text-orange-900',
      C: 'bg-pink-400 text-pink-900',
      D: 'bg-green-400 text-green-900',
      E: 'bg-blue-400 text-blue-900',
      F: 'bg-purple-400 text-purple-900',
    };
    return colors[heat] || 'bg-gray-400 text-gray-900';
  };

  const getPromotionStatusBadge = () => {
    if (!tracking?.promotion_status) return null;

    const badges = {
      promoted: (
        <div className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl shadow-lg font-bold text-lg">
          <TrendingUp size={24} />
          <span>Promoted!</span>
        </div>
      ),
      relegated: (
        <div className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl shadow-lg font-bold text-lg">
          <TrendingDown size={24} />
          <span>Relegated</span>
        </div>
      ),
      maintained: (
        <div className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl shadow-lg font-bold text-lg">
          <Target size={24} />
          <span>Same Heat</span>
        </div>
      ),
    };

    return badges[tracking.promotion_status];
  };

  const getRaceStatusBadge = () => {
    // Use heatManagement.currentHeat to show what heat is CURRENTLY being scored
    // NOT the skipper's assigned heat (which is dashboardData.skipper.current_heat)
    const currentlyScoringHeat = heatManagement?.currentHeat;
    const currentlyScoringRound = heatManagement?.currentRound;

    const statusConfig = {
      live: {
        bg: 'bg-gradient-to-r from-green-500 to-emerald-600',
        text: currentlyScoringRound && currentlyScoringHeat
          ? `Live: Round ${currentlyScoringRound} · Heat ${currentlyScoringHeat}`
          : 'Live Racing',
        animate: 'animate-pulse',
      },
      on_hold: {
        bg: 'bg-gradient-to-r from-amber-500 to-orange-600',
        text: 'Racing On Hold',
        animate: '',
      },
      completed_for_day: {
        bg: 'bg-gradient-to-r from-blue-500 to-indigo-600',
        text: 'Racing Complete for Today',
        animate: '',
      },
      event_complete: {
        bg: 'bg-gradient-to-r from-purple-500 to-violet-600',
        text: 'Event Complete',
        animate: '',
      },
    };

    const config = statusConfig[raceStatus] || statusConfig.on_hold;

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 ${config.bg} rounded-lg shadow-lg text-sm ${config.animate}`}>
        <Flag size={16} className="text-white" />
        <span className="text-white font-bold">{config.text}</span>
      </div>
    );
  };

  // Get heat-specific standings with heat position
  const getHeatStandings = () => {
    if (!heatManagement || !dashboardData?.skipper.current_heat || !dashboardData.skipper.current_round) {
      return [];
    }

    const currentRoundData = heatManagement.rounds.find(
      (r) => r.round === dashboardData.skipper.current_round
    );

    if (!currentRoundData) return [];

    const heatAssignment = currentRoundData.heatAssignments.find(
      (ha) => ha.heatDesignation === dashboardData.skipper.current_heat
    );

    if (!heatAssignment) return [];

    // Get results for this heat in this round
    const heatResults = currentRoundData.results.filter(
      (r: HeatResult) => r.heatDesignation === dashboardData.skipper.current_heat
    );

    // Get all skippers in this heat and sort by their heat position
    const heatSkippers = heatAssignment.skipperIndices.map((idx) => {
      const skipper = dashboardData.standings[idx];
      if (!skipper) return null;

      // Find this skipper's result in this heat for this round
      const skipperResult = heatResults.find((r: HeatResult) => r.skipperIndex === idx);
      const heatPosition = skipperResult?.position || null;

      return {
        ...skipper,
        heat_position: heatPosition,
      };
    }).filter(Boolean);

    // Sort by heat position (nulls last)
    heatSkippers.sort((a: any, b: any) => {
      if (a.heat_position === null) return 1;
      if (b.heat_position === null) return -1;
      return a.heat_position - b.heat_position;
    });

    return heatSkippers;
  };

  if (loading || !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-900 font-semibold text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const heatStandings = getHeatStandings();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header - Matching Dashboard */}
      <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] shadow-lg border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-center gap-2.5">
            <img
              src="/alfie_app_logo copy copy.svg"
              alt="AlfiePRO"
              className="w-8 h-8 sm:w-9 sm:h-9"
            />
            <h1 className="text-xl sm:text-2xl text-white">
              <span className="font-thin">Alfie</span><span className="font-extrabold">PRO</span> Live Tracking
            </h1>
          </div>
        </div>
      </div>

      {/* Modern Gradient Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-xl relative overflow-hidden border-b border-white/5">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent"></div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 relative z-10">
          {/* Top Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Circular Avatar */}
              {dashboardData.skipper.avatar_url ? (
                <img
                  src={dashboardData.skipper.avatar_url}
                  alt={dashboardData.skipper.name}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ring-4 ring-blue-500/30 shadow-2xl"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-slate-200 to-blue-200 flex items-center justify-center ring-4 ring-blue-500/30 shadow-2xl">
                  <span className="text-xl sm:text-2xl font-bold text-slate-700">
                    {dashboardData.skipper.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-md">
                  {dashboardData.skipper.name}
                </h1>
                <p className="text-base sm:text-lg text-slate-300 font-semibold">
                  Sail {dashboardData.skipper.sail_number}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 sm:p-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-all border border-white/30 shadow-lg"
                title="Refresh"
              >
                <RefreshCw
                  size={18}
                  className={`text-white ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 sm:p-3 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm rounded-xl transition-all border border-white/30 shadow-lg"
                title="Exit"
              >
                <LogOut size={18} className="text-white" />
              </button>
            </div>
          </div>

          {/* Event Info Bar */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="text-sm">
              <span className="text-base mr-1.5">📅</span>
              <span className="text-white/90 font-medium">
                {new Date(dashboardData.event.date).toLocaleDateString()}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-base mr-1.5">📍</span>
              <span className="text-white/90 font-medium">{dashboardData.event.venue}</span>
            </div>
            <div className="text-sm">
              <span className="text-base mr-1.5">⛵</span>
              <span className="text-white/90 font-medium capitalize">
                {dashboardData.event.race_format}
              </span>
            </div>
            {getRaceStatusBadge()}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap text-sm ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Home size={16} />
              <span>Overview</span>
            </button>
            {heatManagement && (
              <button
                onClick={() => setActiveTab('heat')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap text-sm ${
                  activeTab === 'heat'
                    ? 'bg-white text-slate-700 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Layers size={16} />
                <span>Heats</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('results')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap text-sm ${
                activeTab === 'results'
                  ? 'bg-white text-slate-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <List size={16} />
              <span>Results</span>
            </button>
            <button
              onClick={() => setActiveTab('performance')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap text-sm ${
                activeTab === 'performance'
                  ? 'bg-white text-slate-700 shadow-lg'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <BarChart2 size={16} />
              <span>Insights</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Tab Content */}
        <LiveTrackingTabContent
          activeTab={activeTab}
          dashboardData={dashboardData}
          fullEvent={fullEvent}
          calculatedStandings={calculatedStandings}
          heatManagement={heatManagement}
          tracking={tracking}
          getPromotionStatusBadge={getPromotionStatusBadge}
          getHeatColor={getHeatColor}
        />

        {/* Create Account CTA */}
        {!session?.member_id && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-lg p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <Trophy size={32} />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">Enjoying Live Tracking?</h3>
                <p className="mb-4 text-green-50">
                  Unlock full race-day power with your free AlfiePRO account – get personalised stats, track your performance trends, and access exclusive features built for serious skippers.
                </p>
                <button
                  onClick={() => navigate('/register')}
                  className="px-6 py-3 bg-white hover:bg-green-50 text-green-600 font-bold rounded-lg transition-all shadow-md"
                >
                  Create Free Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Powered by AlfiePRO Footer */}
        <div className="mt-8 pb-6 flex items-center justify-center gap-2 text-slate-500">
          <span className="text-sm font-medium">Powered by</span>
          <img
            src="/alfie_app_logo copy copy copy.svg"
            alt="Alfie Logo"
            className="w-6 h-6"
          />
          <span className="text-sm font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            AlfiePRO
          </span>
        </div>
      </div>
    </div>
  );
}

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
