import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, Loader, Activity, TrendingUp, Trophy, Target } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import {
  getLiveTrackingEventByEventId,
  createTrackingSession,
  getCurrentTrackingSession,
  getSkipperTrackingStatus,
} from '../../../utils/liveTrackingStorage';
import type { LiveTrackingEvent, SessionSkipperTracking } from '../../../types/liveTracking';
import { format } from 'date-fns';

interface LiveTrackingWidgetProps {
  settings?: {
    title?: string;
    description?: string;
    showInstructions?: boolean;
    backgroundColor?: string;
    textColor?: string;
    accentColor?: string;
  };
  eventId: string;
}

export default function LiveTrackingWidget({ settings, eventId }: LiveTrackingWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [trackingEvent, setTrackingEvent] = useState<LiveTrackingEvent | null>(null);
  const [skippers, setSkippers] = useState<Array<{ name: string; sail_number: string; boat_class?: string; avatar_url?: string | null }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSkipper, setSelectedSkipper] = useState<{ name: string; sail_number: string } | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [tracking, setTracking] = useState<SessionSkipperTracking | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const title = settings?.title || 'Live Race Tracking';
  const description = settings?.description || 'Track your performance in real-time during the event';
  const showInstructions = settings?.showInstructions !== false;
  const bgColor = settings?.backgroundColor || 'bg-gray-800';
  const textColor = settings?.textColor || 'text-white';
  const accentColor = settings?.accentColor || 'cyan';

  useEffect(() => {
    loadTrackingEvent();
  }, [eventId]);

  useEffect(() => {
    if (trackingEvent) {
      checkExistingSession();
    }
  }, [trackingEvent]);

  useEffect(() => {
    if (currentSession && showDashboard) {
      setupRealtimeTracking();
    }
  }, [currentSession, showDashboard]);

  const loadTrackingEvent = async () => {
    try {
      setLoading(true);

      // Get tracking event for this event ID
      const event = await getLiveTrackingEventByEventId(eventId);

      if (!event || !event.enabled) {
        setLoading(false);
        return;
      }

      setTrackingEvent(event);

      // Load registered skippers
      await loadSkippers(eventId);
    } catch (error) {
      console.error('Error loading tracking event:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingSession = async () => {
    if (!trackingEvent) return;

    const session = await getCurrentTrackingSession(trackingEvent.event_id);
    if (session) {
      setCurrentSession(session);
      const trackingStatus = await getSkipperTrackingStatus(session.id);
      setTracking(trackingStatus);
      setShowDashboard(true);
    }
  };

  const loadSkippers = async (eventId: string) => {
    try {
      // Try to get skippers from event_attendance
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('event_attendance')
        .select('member_id, members(first_name, last_name, sail_number, avatar_url)')
        .eq('event_id', eventId);

      if (!attendanceError && attendanceData && attendanceData.length > 0) {
        const skippersList = attendanceData
          .map((attendance: any) => ({
            name: `${attendance.members.first_name} ${attendance.members.last_name}`,
            sail_number: attendance.members.sail_number,
            avatar_url: attendance.members.avatar_url,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setSkippers(skippersList);
        return;
      }

      // Fall back to quick_races skippers
      const { data: raceData } = await supabase
        .from('quick_races')
        .select('skippers')
        .eq('id', eventId)
        .maybeSingle();

      if (raceData?.skippers) {
        const skippersList = Array.isArray(raceData.skippers)
          ? raceData.skippers
          : [];

        const formattedSkippers = skippersList
          .map((s: any) => ({
            name: s.name || s.skipper_name || '',
            sail_number: s.sailNo || s.sailNumber || s.sail_number || '',
            boat_class: s.boatModel || s.boatClass || s.boat_class || '',
            avatar_url: s.avatarUrl || s.avatar_url || null,
          }))
          .filter((s: any) => s.name && s.sail_number)
          .sort((a, b) => a.name.localeCompare(b.name));

        setSkippers(formattedSkippers);
      }
    } catch (error) {
      console.error('Error loading skippers:', error);
    }
  };

  const setupRealtimeTracking = () => {
    if (!currentSession) return;

    const channel = supabase
      .channel(`tracking-${currentSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_tracking_skipper_sessions',
          filter: `session_id=eq.${currentSession.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setTracking((prev) => ({
              ...prev,
              ...payload.new,
            } as SessionSkipperTracking));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleSelectSkipper = (skipper: { name: string; sail_number: string }) => {
    setSelectedSkipper(skipper);
  };

  const handleStartTracking = async () => {
    if (!selectedSkipper || !trackingEvent) return;

    try {
      setCreatingSession(true);

      const session = await createTrackingSession(
        trackingEvent.event_id,
        selectedSkipper.name,
        selectedSkipper.sail_number,
        undefined // No user ID for public access
      );

      if (!session) {
        throw new Error('Failed to create tracking session');
      }

      setCurrentSession(session);
      const trackingStatus = await getSkipperTrackingStatus(session.id);
      setTracking(trackingStatus);
      setShowDashboard(true);
    } catch (error) {
      console.error('Error starting tracking:', error);
      alert('Failed to start tracking. Please try again.');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleStopTracking = () => {
    setShowDashboard(false);
    setCurrentSession(null);
    setTracking(null);
    setSelectedSkipper(null);
    localStorage.removeItem('alfie_current_tracking_session');
    localStorage.removeItem('alfie_tracking_skipper');
  };

  const filteredSkippers = skippers.filter(
    (skipper) =>
      skipper.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skipper.sail_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className={`${bgColor} rounded-xl p-8 text-center`}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-400 mx-auto mb-4"></div>
        <p className="text-gray-300">Loading live tracking...</p>
      </div>
    );
  }

  if (!trackingEvent) {
    return (
      <div className={`${bgColor} rounded-xl p-8 text-center`}>
        <Activity className="mx-auto mb-4 text-gray-400" size={48} />
        <p className="text-gray-400 font-semibold mb-2">Live tracking is not available for this event</p>
        <p className="text-gray-500 text-sm">
          To enable live tracking:
        </p>
        <ul className="text-gray-500 text-sm text-left max-w-md mx-auto mt-2 space-y-1">
          <li>• Go to Race Management for this event</li>
          <li>• Enable Live Tracking in the event settings</li>
          <li>• Then configure which event to track in this widget's settings</li>
        </ul>
      </div>
    );
  }

  // Dashboard View
  if (showDashboard && tracking && currentSession) {
    return (
      <div className={`${bgColor} rounded-xl overflow-hidden`}>
        {/* Header */}
        <div className={`bg-gradient-to-r from-${accentColor}-500 to-blue-500 p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {tracking.skipper_avatar_url ? (
                <img
                  src={tracking.skipper_avatar_url}
                  alt={tracking.skipper_name}
                  className="w-16 h-16 rounded-full object-cover border-4 border-white/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold border-4 border-white/20">
                  {tracking.skipper_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-2xl font-bold text-white">{tracking.skipper_name}</h3>
                <p className="text-white/80">Sail {tracking.sail_number}</p>
              </div>
            </div>
            <button
              onClick={handleStopTracking}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Stop Tracking
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
              <Trophy className="mx-auto mb-2 text-white" size={24} />
              <div className="text-3xl font-bold text-white">{tracking.current_position || '-'}</div>
              <div className="text-sm text-white/80">Position</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
              <Target className="mx-auto mb-2 text-white" size={24} />
              <div className="text-3xl font-bold text-white">{tracking.total_points || 0}</div>
              <div className="text-sm text-white/80">Points</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
              <Activity className="mx-auto mb-2 text-white" size={24} />
              <div className="text-3xl font-bold text-white">{tracking.races_completed || 0}</div>
              <div className="text-sm text-white/80">Races</div>
            </div>
          </div>
        </div>

        {/* Recent Performance */}
        <div className="p-6">
          <h4 className={`text-lg font-bold ${textColor} mb-4`}>Recent Performance</h4>
          {tracking.recent_results && tracking.recent_results.length > 0 ? (
            <div className="space-y-2">
              {tracking.recent_results.slice(0, 5).map((result: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                >
                  <span className="text-gray-300">Race {result.race_number}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">
                      {result.position ? `P${result.position}` : result.score}
                    </span>
                    {result.trend && (
                      <TrendingUp
                        size={16}
                        className={result.trend === 'up' ? 'text-green-400' : 'text-red-400'}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">
              No race results yet. Updates will appear here in real-time.
            </p>
          )}
        </div>

        {/* Live Updates Notice */}
        <div className="px-6 pb-6">
          <div className={`bg-${accentColor}-500/10 border border-${accentColor}-500/20 rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 bg-${accentColor}-400 rounded-full animate-pulse`}></div>
              <span className={`text-${accentColor}-400 font-semibold text-sm`}>LIVE</span>
            </div>
            <p className="text-gray-300 text-sm">
              You'll receive real-time updates as races are scored and positions change.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Selection View
  return (
    <div className={`${bgColor} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className={`bg-gradient-to-r from-${accentColor}-500 to-blue-500 p-6 text-white`}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-white/20 rounded-lg">
            <Activity size={24} />
          </div>
          <h3 className="text-2xl font-bold">{title}</h3>
        </div>
        <p className="text-white/90">{description}</p>
      </div>

      {/* Selection */}
      <div className="p-6">
        <h4 className={`text-lg font-bold ${textColor} mb-4`}>Select Your Profile</h4>
        <p className="text-gray-400 mb-4 text-sm">
          Choose your name to start receiving live race updates
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or sail number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-900/50 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Skippers List */}
        <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
          {filteredSkippers.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">
              No skippers found. Try a different search term.
            </p>
          ) : (
            filteredSkippers.slice(0, 10).map((skipper) => (
              <button
                key={skipper.sail_number}
                onClick={() => handleSelectSkipper(skipper)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${
                  selectedSkipper?.sail_number === skipper.sail_number
                    ? `border-${accentColor}-500 bg-${accentColor}-500/10`
                    : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {skipper.avatar_url ? (
                    <img
                      src={skipper.avatar_url}
                      alt={skipper.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      selectedSkipper?.sail_number === skipper.sail_number
                        ? `bg-${accentColor}-500`
                        : 'bg-gray-600'
                    }`}>
                      {skipper.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className={`font-semibold text-sm ${textColor}`}>{skipper.name}</p>
                    <p className="text-xs text-gray-400">
                      Sail {skipper.sail_number}
                      {skipper.boat_class && ` • ${skipper.boat_class}`}
                    </p>
                  </div>
                </div>
                {selectedSkipper?.sail_number === skipper.sail_number && (
                  <CheckCircle className={`text-${accentColor}-400`} size={20} />
                )}
              </button>
            ))
          )}
        </div>

        {/* Start Button */}
        {selectedSkipper && (
          <button
            onClick={handleStartTracking}
            disabled={creatingSession}
            className={`w-full py-3 bg-gradient-to-r from-${accentColor}-500 to-blue-500 hover:from-${accentColor}-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50`}
          >
            {creatingSession ? (
              <>
                <Loader className="animate-spin" size={18} />
                Starting...
              </>
            ) : (
              'Start Live Tracking'
            )}
          </button>
        )}

        {/* Instructions */}
        {showInstructions && (
          <div className="mt-6 space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className={`text-${accentColor}-400 flex-shrink-0 mt-0.5`} />
              <span className="text-gray-300 text-xs">Real-time position and points updates</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className={`text-${accentColor}-400 flex-shrink-0 mt-0.5`} />
              <span className="text-gray-300 text-xs">Live race results as they're scored</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className={`text-${accentColor}-400 flex-shrink-0 mt-0.5`} />
              <span className="text-gray-300 text-xs">No app download required</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
