import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, CheckCircle, Loader, Users, MonitorPlay } from 'lucide-react';
import { supabase } from '../utils/supabase';
import {
  getLiveTrackingEventByToken,
  createTrackingSession,
  getCurrentTrackingSession,
} from '../utils/liveTrackingStorage';
import { useAuth } from '../contexts/AuthContext';
import type { LiveTrackingEvent } from '../types/liveTracking';
import { format } from 'date-fns';

export default function LiveTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [trackingEvent, setTrackingEvent] = useState<LiveTrackingEvent | null>(null);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [clubName, setClubName] = useState<string>('');
  const [venueName, setVenueName] = useState<string>('');
  const [venueImage, setVenueImage] = useState<string>('');
  const [skippers, setSkippers] = useState<Array<{ name: string; sail_number: string; boat_class?: string; avatar_url?: string | null }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSkipper, setSelectedSkipper] = useState<{ name: string; sail_number: string } | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showSkipperSelection, setShowSkipperSelection] = useState(false);
  const [memberId, setMemberId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (token) {
      loadTrackingEvent();
    }
  }, [token]);

  // Look up member_id from user_id when user is authenticated
  useEffect(() => {
    const lookupMemberId = async () => {
      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('members')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data) {
            console.log('✅ Found member_id for user:', data.id);
            setMemberId(data.id);
          } else {
            console.log('⚠️ No member record found for user, will create anonymous session');
            setMemberId(undefined);
          }
        } catch (error) {
          console.error('Error looking up member_id:', error);
          setMemberId(undefined);
        }
      } else {
        setMemberId(undefined);
      }
    };

    lookupMemberId();
  }, [user?.id]);

  const loadTrackingEvent = async () => {
    try {
      setLoading(true);

      if (!token) {
        throw new Error('No tracking token provided');
      }

      console.log('🔍 Loading tracking event for token:', token);

      // Get tracking event config
      const event = await getLiveTrackingEventByToken(token);
      console.log('📦 Tracking event result:', event);
      console.log('📦 Event ID from tracking event:', event?.event_id);

      if (!event) {
        console.error('❌ No tracking event found for token:', token);
        throw new Error('Invalid or expired tracking link');
      }

      setTrackingEvent(event);

      // Get event details - try public_events first, then race_series, then quick_races
      let eventData = null;

      console.log('🔍 Searching for event with ID:', event.event_id);

      // Try public_events first (for association events)
      const { data: publicEventData, error: publicError } = await supabase
        .from('public_events')
        .select('*')
        .eq('id', event.event_id)
        .maybeSingle();

      console.log('📊 public_events query - data:', publicEventData, 'error:', publicError);

      if (publicEventData) {
        eventData = publicEventData;
      } else {
        // Try race_series
        const { data: seriesData, error: seriesError } = await supabase
          .from('race_series')
          .select('*')
          .eq('id', event.event_id)
          .maybeSingle();

        console.log('📊 race_series query - data:', seriesData, 'error:', seriesError);

        if (seriesData) {
          eventData = seriesData;
        } else {
          // Fall back to quick_races
          const { data: raceData, error: raceError } = await supabase
            .from('quick_races')
            .select('*')
            .eq('id', event.event_id)
            .maybeSingle();

          console.log('📊 quick_races query - data:', raceData, 'error:', raceError);

          if (raceError) {
            console.error('Error loading event details:', raceError);
            throw raceError;
          }

          if (raceData) {
            eventData = raceData;
          }
        }
      }

      if (!eventData) {
        console.error('❌ Event not found in any table for event_id:', event.event_id);
        throw new Error('Event not found');
      }

      console.log('✅ Event data loaded:', eventData);
      console.log('🏞️ Venue-related fields:', {
        venue_id: eventData.venue_id,
        venue: eventData.venue,
        race_venue: eventData.race_venue,
      });
      setEventDetails(eventData);

      // Load club name
      if (eventData.club_id) {
        const { data: clubData } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', eventData.club_id)
          .maybeSingle();

        if (clubData) {
          setClubName(clubData.name);
        }
      }

      // Load venue name and image
      let venueNameToUse = '';

      if (eventData.venue_id) {
        console.log('🏞️ Loading venue by ID:', eventData.venue_id);
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('name, image_url')
          .eq('id', eventData.venue_id)
          .maybeSingle();

        console.log('🏞️ Venue data by ID:', venueData, 'error:', venueError);

        if (venueData) {
          venueNameToUse = venueData.name;
          setVenueName(venueData.name);
          if (venueData.image_url) {
            console.log('🖼️ Venue image_url from DB:', venueData.image_url);

            // Check if it's already a full URL or a storage path
            if (venueData.image_url.startsWith('http')) {
              setVenueImage(venueData.image_url);
              console.log('✅ Using full URL:', venueData.image_url);
            } else {
              const { data: publicUrlData } = supabase.storage
                .from('media')
                .getPublicUrl(venueData.image_url);

              console.log('🔗 Generated public URL:', publicUrlData?.publicUrl);
              if (publicUrlData?.publicUrl) {
                setVenueImage(publicUrlData.publicUrl);
              }
            }
          }
        }
      } else if (eventData.race_venue || eventData.venue) {
        // Use text-based venue name and try to look it up
        venueNameToUse = eventData.race_venue || eventData.venue;
        console.log('📝 Using venue text field, trying to look up:', venueNameToUse);
        setVenueName(venueNameToUse);

        // Try to find venue in venues table by name (same as EventDetails)
        try {
          const { data: venueData, error: venueError } = await supabase
            .from('venues')
            .select('*')
            .eq('name', venueNameToUse)
            .maybeSingle();

          console.log('🔍 Venue lookup by name:', venueData, 'error:', venueError);

          if (venueData && !venueError && venueData.image) {
            console.log('🖼️ Found venue image:', venueData.image);
            setVenueImage(venueData.image);
          } else {
            // Fallback to default image (same as EventDetails)
            console.log('⚠️ No venue image found, using default');
            setVenueImage('https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1');
          }
        } catch (venueErr) {
          console.warn('Could not fetch venue from database:', venueErr);
          // Fallback to default image
          setVenueImage('https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1');
        }
      }

      // Check if user already has an active session
      const existingSession = await getCurrentTrackingSession(event.event_id);
      if (existingSession) {
        // Redirect to dashboard
        navigate(`/live/${token}/dashboard`);
        return;
      }

      // Load registered skippers for this event
      await loadSkippers(event.event_id);
    } catch (error) {
      console.error('Error loading tracking event:', error);
      alert('Failed to load tracking event. Please check your link.');
    } finally {
      setLoading(false);
    }
  };

  const loadSkippers = async (eventId: string) => {
    try {
      console.log('🔍 Loading skippers for event:', eventId);

      // Try to get skippers from different event sources
      let eventData = null;

      // Try public_events first
      const { data: publicData } = await supabase
        .from('public_events')
        .select('id')
        .eq('id', eventId)
        .maybeSingle();

      if (publicData) {
        // Public events don't have a skippers field, load from event_attendance instead
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('event_attendance')
          .select('member_id, members(first_name, last_name, sail_number)')
          .eq('event_id', eventId);

        if (attendanceError) {
          console.error('Error loading attendance:', attendanceError);
        }

        if (attendanceData) {
          const skippersList = attendanceData.map((attendance: any) => ({
            name: `${attendance.members.first_name} ${attendance.members.last_name}`,
            sailNumber: attendance.members.sail_number,
            memberId: attendance.member_id
          }));
          setSkippers(skippersList);
          return;
        }
      }

      // Fall back to quick_races
      const { data: raceData, error } = await supabase
        .from('quick_races')
        .select('skippers')
        .eq('id', eventId)
        .maybeSingle();

      if (error) {
        console.error('Error loading skippers:', error);
        throw error;
      }

      if (!raceData?.skippers) {
        console.log('No skippers found in event data');
        setSkippers([]);
        return;
      }

      console.log('📊 Raw skippers data:', raceData.skippers);

      // Parse skippers from JSONB
      const skippersList = Array.isArray(raceData.skippers)
        ? raceData.skippers
        : [];

      const formattedSkippers = skippersList
        .map((s: any) => ({
          name: s.name || s.skipper_name || '',
          sail_number: s.sailNo || s.sailNumber || s.sail_number || '',
          boat_class: s.boatModel || s.boatClass || s.boat_class || s.hull || '',
          avatar_url: s.avatarUrl || s.avatar_url || null,
        }))
        .filter((s: any) => s.name && s.sail_number)
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log('✅ Formatted skippers:', formattedSkippers.length, 'skippers loaded');
      setSkippers(formattedSkippers);
    } catch (error) {
      console.error('Error loading skippers:', error);
      setSkippers([]);
    }
  };

  const handleSelectSkipper = async (skipper: { name: string; sail_number: string }) => {
    if (!trackingEvent || creatingSession) return;

    try {
      setCreatingSession(true);
      setSelectedSkipper(skipper);

      console.log('🎯 Creating tracking session for:', {
        eventId: trackingEvent.event_id,
        skipperName: skipper.name,
        sailNumber: skipper.sail_number,
        memberId: memberId || 'anonymous',
      });

      const session = await createTrackingSession(
        trackingEvent.event_id,
        skipper.name,
        skipper.sail_number,
        memberId // Pass memberId (can be undefined for anonymous users)
      );

      if (!session) {
        console.error('❌ createTrackingSession returned null - check database logs');
        throw new Error('Failed to create tracking session - no session returned');
      }

      console.log('✅ Session created successfully:', session.id);

      // Navigate to dashboard
      navigate(`/live/${token}/dashboard`);
    } catch (error: any) {
      console.error('❌ Error starting tracking:', error);

      // Show more detailed error message
      let errorMessage = 'Failed to start tracking. ';
      if (error?.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please try again or contact support if the issue persists.';
      }

      alert(errorMessage);
      setCreatingSession(false);
      setSelectedSkipper(null);
    }
  };

  const filteredSkippers = skippers.filter(
    (skipper) =>
      skipper.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skipper.sail_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Format dates
  const formatEventDates = () => {
    if (!eventDetails) return 'TBA';

    const startDate = eventDetails.date || eventDetails.race_date || eventDetails.event_date;
    const endDate = eventDetails.end_date;

    if (!startDate) return 'TBA';

    try {
      const start = format(new Date(startDate), 'MMM d, yyyy');
      if (endDate && endDate !== startDate) {
        const end = format(new Date(endDate), 'MMM d, yyyy');
        return `${start} - ${end}`;
      }
      return start;
    } catch (error) {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-700 font-medium">Loading event...</p>
        </div>
      </div>
    );
  }

  if (!trackingEvent || !eventDetails) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">❌</span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Invalid Link</h3>
          <p className="text-slate-600">This tracking link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] pb-8">
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

      {/* Event Hero Banner with Venue Image - Full Width */}
      <div className="relative shadow-2xl overflow-hidden" style={{ height: '280px' }}>
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: venueImage
              ? `url(${venueImage})`
              : 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
          }}
        >
          {/* Dark overlay for text contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/30" />
        </div>

        {/* Content - Constrained Width */}
        <div className="relative h-full flex flex-col justify-end max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-1 drop-shadow-lg">
            {eventDetails.event_name || eventDetails.name || 'Race Event'}
          </h2>
          <p className="text-lg sm:text-xl text-white/95 mb-3 drop-shadow-md">
            {venueName || eventDetails.venue || eventDetails.race_venue || 'TBA'}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base text-white/90 drop-shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-lg">📅</span>
              <span className="font-medium">{formatEventDates()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">⛵</span>
              <span className="font-medium">{eventDetails.race_class || 'DF95'}</span>
            </div>
            {clubName && (
              <div className="flex items-center gap-2">
                <span className="text-lg">🏆</span>
                <span className="font-medium">{clubName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {!showSkipperSelection ? (
          <>
            {/* Mode Selection Tiles */}
            <div className="mt-6 bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">
                Choose Your View
              </h2>
              <p className="text-slate-600 mb-8 text-center">
                Select how you want to track this event
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Skipper Tracking Tile */}
                <button
                  onClick={() => setShowSkipperSelection(true)}
                  className="group relative overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-white/30 transition-all">
                      <Users size={40} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Skipper Tracking</h3>
                    <p className="text-white/90 text-sm mb-4">
                      Get personalized real-time updates for your races, positions, and heat assignments
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                      <span>View My Results</span>
                      <span className="text-xl">→</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>

                {/* PRO Broadcast Tile */}
                <button
                  onClick={() => navigate(`/live/${token}/pro-broadcast`)}
                  className="group relative overflow-hidden bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-white/30 transition-all">
                      <MonitorPlay size={40} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">PRO Broadcast</h3>
                    <p className="text-white/90 text-sm mb-4">
                      Full fleet view with heat assignments, overall standings, and race results for big screens
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                      <span>View Full Fleet</span>
                      <span className="text-xl">→</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              </div>
            </div>

            {/* Info Card */}
            <div className="mt-6 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
              <h3 className="text-2xl font-bold mb-4">Live Tracking Features</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2 text-cyan-400">Skipper Tracking</h4>
                  <ul className="space-y-2 text-sm text-white/90">
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Personalized race updates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Position tracking</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Heat progression alerts</span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 text-pink-400">PRO Broadcast</h4>
                  <ul className="space-y-2 text-sm text-white/90">
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Full fleet heat assignments</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Overall standings</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>Race-by-race results</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Skipper Selection Card */}
            <div className="mt-6 bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900">
                  Select Your Skipper Profile
                </h2>
                <button
                  onClick={() => setShowSkipperSelection(false)}
                  className="text-slate-600 hover:text-slate-900 text-sm font-semibold"
                >
                  ← Back
                </button>
              </div>
              <p className="text-slate-600 mb-6">
                Choose your name from the list below to start receiving real-time race updates and notifications.
              </p>

              {/* Search */}
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by name or sail number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Skippers List */}
              <div className="mb-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-3 pb-4">
                  {filteredSkippers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="text-slate-400" size={28} />
                      </div>
                      <p className="text-slate-600 font-medium">No skippers found</p>
                      <p className="text-slate-500 text-sm">Try a different search term</p>
                    </div>
                  ) : (
                    filteredSkippers.map((skipper) => (
                      <button
                        key={skipper.sail_number}
                        onClick={() => handleSelectSkipper(skipper)}
                        disabled={creatingSession}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-wait ${
                          selectedSkipper?.sail_number === skipper.sail_number && creatingSession
                            ? 'border-cyan-500 bg-cyan-50 shadow-md'
                            : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {skipper.avatar_url ? (
                            <img
                              src={skipper.avatar_url}
                              alt={skipper.name}
                              className="w-14 h-14 rounded-full object-cover border-2 border-slate-300"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg bg-slate-400">
                              {skipper.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="text-left">
                            <p className="font-semibold text-slate-900">{skipper.name}</p>
                            <p className="text-sm text-slate-600">
                              Sail {skipper.sail_number}
                              {skipper.boat_class && ` • ${skipper.boat_class}`}
                            </p>
                          </div>
                        </div>
                        {selectedSkipper?.sail_number === skipper.sail_number && creatingSession && (
                          <Loader className="text-cyan-500 animate-spin" size={24} />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Sign in link */}
              {!user && (
                <div className="text-center pt-2">
                  <p className="text-sm text-slate-500 mb-2">
                    Already have an AlfiePRO account?
                  </p>
                  <button
                    onClick={() => navigate('/login', { state: { returnTo: `/live/${token}` } })}
                    className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm"
                  >
                    Sign in for enhanced features
                  </button>
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="mt-6 bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
              <h3 className="text-2xl font-bold mb-4">What You'll Get</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1 bg-white/20 rounded-lg">
                    <CheckCircle size={20} className="flex-shrink-0" />
                  </div>
                  <span className="text-white/95">Real-time updates when results are posted</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1 bg-white/20 rounded-lg">
                    <CheckCircle size={20} className="flex-shrink-0" />
                  </div>
                  <span className="text-white/95">Live standings and position tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1 bg-white/20 rounded-lg">
                    <CheckCircle size={20} className="flex-shrink-0" />
                  </div>
                  <span className="text-white/95">Heat assignments and promotion/relegation alerts</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1 bg-white/20 rounded-lg">
                    <CheckCircle size={20} className="flex-shrink-0" />
                  </div>
                  <span className="text-white/95">No app download required - works in your browser</span>
                </li>
              </ul>
            </div>
          </>
        )}

        {/* Footer - Matching Dashboard */}
        <div className="mt-8 text-center pb-6">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
            <span>Powered by</span>
            <div className="flex items-center gap-1.5">
              <img
                src="/alfie_app_logo copy copy.svg"
                alt="AlfiePRO"
                className="w-5 h-5"
              />
              <span className="text-white">
                <span className="font-thin">Alfie</span><span className="font-extrabold">PRO</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
