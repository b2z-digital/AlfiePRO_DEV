import React, { useEffect, useState } from 'react';
import { Wind, Trophy, Users, Hash, Timer, CircleAlert as AlertCircle } from 'lucide-react';
import type { LivestreamSession, LivestreamOverlay } from '../../types/livestream';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { getActiveSessionsForEvent, getRaceStatus } from '../../utils/liveTrackingStorage';
import { supabase } from '../../utils/supabase';

interface LivestreamOverlayRendererProps {
  session: LivestreamSession;
  raceData?: any;
  weatherData?: any;
}

export const LivestreamOverlayRenderer = React.forwardRef<HTMLDivElement, LivestreamOverlayRendererProps>(function LivestreamOverlayRenderer({ session, raceData, weatherData }, ref) {
  const [overlays, setOverlays] = useState<LivestreamOverlay[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveTrackingData, setLiveTrackingData] = useState<any>(null);
  const [liveSkippers, setLiveSkippers] = useState<any[]>([]);

  useEffect(() => {
    loadOverlays();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [session.id]);

  useEffect(() => {
    // Subscribe to live tracking if event is linked
    if (session.event_id) {
      loadLiveTrackingData();

      // Real-time subscription to quick_races table for instant updates
      const channel = supabase
        .channel(`quick_races:${session.event_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'quick_races',
            filter: `id=eq.${session.event_id}`
          },
          (payload) => {
            console.log('[Overlay Debug] Real-time update received:', payload);
            loadLiveTrackingData();
          }
        )
        .subscribe();

      // Also poll every 5 seconds as a fallback
      const interval = setInterval(loadLiveTrackingData, 5000);

      return () => {
        channel.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [session.event_id]);

  const loadLiveTrackingData = async () => {
    if (!session.event_id) {
      console.log('[Overlay Debug] No event_id on session:', session);
      return;
    }

    try {
      console.log('[Overlay Debug] Fetching data for event_id:', session.event_id);

      // Check if this is a series round (format: "uuid-dayNumber")
      const isSeriesRound = session.event_id.includes('-') && session.event_id.split('-').length > 5;
      let quickRaces = null;
      let error = null;

      if (isSeriesRound) {
        // Extract series ID and day number
        const parts = session.event_id.split('-');
        const dayNumber = parseInt(parts[parts.length - 1]);
        const seriesId = parts.slice(0, -1).join('-');

        console.log('[Overlay Debug] Detected series round:', { seriesId, dayNumber });

        // Query race_series_rounds for series events
        const { data, error: roundError } = await supabase
          .from('race_series_rounds')
          .select(`
            id,
            round_name,
            date,
            race_results,
            completed,
            updated_at,
            skippers,
            heat_management,
            num_races,
            series_id,
            current_day,
            round_index
          `)
          .eq('series_id', seriesId)
          .eq('round_index', dayNumber)
          .maybeSingle();

        if (data) {
          // Map race_series_rounds data to quick_races format
          quickRaces = {
            id: data.id,
            event_name: data.round_name,
            race_date: data.date,
            race_format: null,
            race_results: data.race_results,
            completed: data.completed,
            updated_at: data.updated_at,
            skippers: data.skippers,
            heat_management: data.heat_management,
            num_races: data.num_races,
            current_day: dayNumber,
            public_event_id: null
          };
        }
        error = roundError;
      } else {
        // The event_id is a quick_race ID, so fetch it directly
        const { data, error: raceError } = await supabase
          .from('quick_races')
          .select(`
            id,
            event_name,
            race_date,
            race_format,
            race_results,
            completed,
            updated_at,
            skippers,
            heat_management,
            num_races,
            current_day,
            public_event_id
          `)
          .eq('id', session.event_id)
          .maybeSingle();

        quickRaces = data;
        error = raceError;
      }

      console.log('[Overlay Debug] Quick race data:', quickRaces, error);

      // Get the public event details if we have a public_event_id
      let eventData = null;
      if (quickRaces?.public_event_id) {
        const { data, error: eventError } = await supabase
          .from('public_events')
          .select('id, event_name, date, end_date')
          .eq('id', quickRaces.public_event_id)
          .maybeSingle();

        eventData = data;
        console.log('[Overlay Debug] Public event data:', eventData, eventError);
      }

      // Get race status
      const raceStatusData = await getRaceStatus(session.event_id);
      console.log('[Overlay Debug] Race status data:', raceStatusData);

      if (error) {
        console.error('Error loading race data:', error);
        return;
      }

      if (quickRaces) {
        // Get ALL skippers from the race - either from skippers array or race_results
        let allSkippers: any[] = [];

        // First, try to get skippers from the skippers field (all registered skippers)
        if (quickRaces.skippers && Array.isArray(quickRaces.skippers)) {
          console.log('[Overlay Debug] Found skippers array:', quickRaces.skippers);
          allSkippers = quickRaces.skippers.map((skipper: any, index: number) => ({
            id: skipper.id || index,
            skipper_name: skipper.name || skipper.skipper_name,
            sail_number: skipper.sailNo || skipper.sail_number,
            sailNo: skipper.sailNo,
            hull: skipper.hull || skipper.boatModel,
            boatModel: skipper.boatModel || skipper.hull,
            position: null,
            score: null,
          }));
        }

        // If we have race_results, merge them with the skipper list to update positions/scores
        if (quickRaces.race_results && Array.isArray(quickRaces.race_results)) {
          console.log('[Overlay Debug] Found race results:', quickRaces.race_results);

          const results = quickRaces.race_results as any[];

          // If we don't have skippers from the skippers field, use race_results
          if (allSkippers.length === 0) {
            allSkippers = results
              .filter((r: any) => r.skipper_name || r.sail_number)
              .map((r: any, index: number) => ({
                id: r.id || index,
                skipper_name: r.skipper_name,
                sail_number: r.sail_number,
                position: r.position || null,
                score: r.score,
                handicap: r.handicap,
              }));
          } else {
            // Merge race results with skippers list
            allSkippers = allSkippers.map(skipper => {
              const result = results.find((r: any) =>
                r.sail_number === skipper.sail_number ||
                r.skipper_name === skipper.skipper_name
              );

              if (result) {
                return {
                  ...skipper,
                  position: result.position,
                  score: result.score,
                  handicap: result.handicap,
                };
              }
              return skipper;
            });
          }

          // Sort by position if available
          allSkippers.sort((a: any, b: any) => {
            if (a.position && b.position) return a.position - b.position;
            if (a.position && !b.position) return -1;
            if (!a.position && b.position) return 1;
            if (a.score !== undefined && a.score !== null && b.score !== undefined && b.score !== null) {
              return a.score - b.score;
            }
            return 0;
          });
        }

        // Extract heat/race info from heat_management if available
        const heatManagement = quickRaces.heat_management as any;
        const isHeatManagement = !!heatManagement;

        // Determine which heat/race to show based on manual selection or auto-detection
        let displayHeatNumber = session.heat_number; // Manual selection takes priority
        let currentHeat = null;

        if (isHeatManagement && heatManagement.heats) {
          if (displayHeatNumber) {
            // Find manually selected heat
            currentHeat = heatManagement.heats.find((h: any) => h.heat_number === displayHeatNumber);
          } else {
            // Auto-detect: Use current_day from quick_races or find first incomplete heat
            if (quickRaces.current_day) {
              currentHeat = heatManagement.heats.find((h: any) => h.heat_number === quickRaces.current_day);
            }
            if (!currentHeat) {
              currentHeat = heatManagement.heats.find((h: any) => !h.completed);
            }
            if (currentHeat) {
              displayHeatNumber = currentHeat.heat_number;
            }
          }
        }

        // Filter skippers for heat racing
        if (isHeatManagement && currentHeat && currentHeat.skippers) {
          console.log('[Overlay Debug] Filtering skippers for heat', displayHeatNumber, ':', currentHeat.skippers);

          // Filter to only show skippers in the current heat
          allSkippers = allSkippers.filter((skipper: any) => {
            // Match by sail number or skipper name
            return currentHeat.skippers.some((heatSkipper: any) =>
              heatSkipper.sailNo === skipper.sail_number ||
              heatSkipper.sailNo === skipper.sailNo ||
              heatSkipper.name === skipper.skipper_name
            );
          });

          console.log('[Overlay Debug] Filtered to', allSkippers.length, 'skippers in heat');
        }

        console.log('[Overlay Debug] Final skippers list:', allSkippers);
        setLiveSkippers(allSkippers);

        // Determine status based on scoring
        let raceStatus = 'in_progress';
        if (quickRaces.completed === true) {
          raceStatus = 'completed';
        } else if (allSkippers.length > 0 && allSkippers.some((s: any) => s.score !== null)) {
          raceStatus = 'in_progress';
        }

        // Update live tracking data with race info
        setLiveTrackingData((prev: any) => ({
          ...prev,
          race_type: isHeatManagement ? 'heat' : 'fleet',
          heat_number: displayHeatNumber || null,
          race_number: quickRaces.current_day || 1,
          event_name: eventData?.event_name || quickRaces.event_name,
          event_id: session.event_id,
          status: raceStatusData?.status || raceStatus,
        }));

        console.log('[Overlay Debug] Updated live tracking data with status:', raceStatus);
      } else {
        console.log('[Overlay Debug] No race found for this event');
        // Still set the event name even if no race is found
        if (eventData) {
          setLiveTrackingData({
            event_name: eventData.event_name,
            event_id: session.event_id,
            status: 'preparing',
          });
        }
      }
    } catch (error) {
      console.error('Error loading live tracking data:', error);
    }
  };

  const loadOverlays = async () => {
    try {
      const data = await livestreamStorage.getOverlays(session.id);
      setOverlays(data.filter(o => o.is_visible));
    } catch (error) {
      console.error('Error loading overlays:', error);
    }
  };

  const config = session.overlay_config;

  // Use live tracking data if available, otherwise fall back to raceData prop
  const displayData = liveTrackingData || raceData;
  const displaySkippers = liveSkippers.length > 0 ? liveSkippers : (raceData?.skippers || []);

  if (!session.enable_overlays) {
    return null;
  }

  // Theme-based styles
  const getThemeStyles = () => {
    const theme = config.theme || 'dark';
    if (theme === 'dark') {
      return {
        bg: 'from-slate-800/80 to-slate-900/80',
        text: 'text-white',
        subtext: 'text-slate-300',
        border: 'border-slate-600/30'
      };
    } else if (theme === 'light') {
      return {
        bg: 'from-white/80 to-gray-100/80',
        text: 'text-gray-900',
        subtext: 'text-gray-700',
        border: 'border-gray-300/30'
      };
    } else { // transparent
      return {
        bg: 'from-slate-800/50 to-slate-900/50',
        text: 'text-white',
        subtext: 'text-slate-200',
        border: 'border-slate-600/20'
      };
    }
  };

  const themeStyles = getThemeStyles();

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none z-10">

      {config.showWeather && weatherData && (
        <div
          className={`absolute top-3 right-3 bg-gradient-to-br ${themeStyles.bg} backdrop-blur-md px-2.5 py-2 rounded-md border ${themeStyles.border} shadow-lg`}
          style={{
            animation: 'slideLeft 0.5s ease-out'
          }}
        >
          <div className="flex items-center gap-2">
            <Wind className={`w-4 h-4 ${config.theme === 'light' ? 'text-cyan-600' : 'text-cyan-400'}`} />
            <div>
              <p className={`text-xs ${themeStyles.subtext} font-medium`}>Wind</p>
              <p className={`text-sm font-bold ${themeStyles.text}`}>
                {weatherData.windSpeed || '0'} kts
              </p>
            </div>
            {weatherData.windDirection && (
              <div className="ml-2">
                <p className={`text-xs ${themeStyles.subtext}`}>Direction</p>
                <p className={`text-sm font-semibold ${themeStyles.text}`}>{weatherData.windDirection}°</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skippers List - Top Left - Simple Design like example */}
      {config.showSkippers && displaySkippers && displaySkippers.length > 0 && (
        <div
          className="absolute top-3 left-3"
          style={{
            animation: 'slideRight 0.5s ease-out'
          }}
        >
          <div className="bg-slate-700/70 backdrop-blur-md rounded-md shadow-lg overflow-hidden max-w-[280px]">
            {/* Header */}
            <div className="px-2 py-0.5 bg-slate-800/70">
              <div className="flex items-center gap-1.5">
                <Users className="w-2.5 h-2.5 text-slate-300" />
                <p className="text-[10px] font-semibold text-white">
                  Skippers
                </p>
              </div>
            </div>

            {/* Skipper List - Minimal like example */}
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-[10px]">
                <tbody className="text-white">
                  {displaySkippers.slice(0, 20).map((skipper: any, index: number) => (
                    <tr
                      key={skipper.id || index}
                      className="hover:bg-slate-600/30 transition-colors"
                    >
                      <td className="pl-2 pr-0.5 font-medium w-[40px]">
                        {skipper.sail_number || skipper.sailNo || 'N/A'}
                      </td>
                      <td className="pl-0.5 pr-2">
                        {skipper.skipper_name || skipper.name || `Skipper ${index + 1}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {displaySkippers.length > 20 && (
                <div className="px-2 py-0.5 bg-slate-800/50 text-center border-t border-slate-600/30">
                  <p className="text-[9px] text-white/70">
                    +{displaySkippers.length - 20} more
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {raceData?.raceStatus === 'in_progress' && raceData?.startTime && (
        <div
          className="absolute bottom-3 right-3 bg-gradient-to-br from-green-600/60 to-green-700/60 backdrop-blur-md px-2.5 py-2 rounded-md border border-green-400/20 shadow-lg"
          style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}
        >
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-green-100" />
            <div>
              <p className="text-xs text-green-200 font-medium">Race Time</p>
              <p className="text-sm font-bold text-white font-mono">
                {formatElapsedTime(raceData.startTime)}
              </p>
            </div>
          </div>
        </div>
      )}

      {raceData?.sequenceStarting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="bg-red-600/70 backdrop-blur-md px-8 py-6 rounded-xl border-2 border-red-400 shadow-2xl"
            style={{
              animation: 'bounce 1s ease-in-out infinite'
            }}
          >
            <p className="text-5xl font-bold text-white text-center mb-2">
              {raceData.sequenceCountdown}
            </p>
            <p className="text-lg text-red-100 font-semibold text-center uppercase tracking-wider">
              Start Sequence
            </p>
          </div>
        </div>
      )}

      {/* Race Number - Bottom Left - Yellow like example */}
      {config.showHeatNumber && (displayData || session.heat_number) && (
        <div className="absolute bottom-6 left-6">
          <p className="text-4xl font-bold text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {displayData?.race_type === 'heat' ? 'Heat' : 'Race'} {session.heat_number || displayData?.heat_number || displayData?.race_number || '1'}
          </p>
        </div>
      )}

      {/* Alfie Logo Watermark - Bottom Right */}
      <div className="absolute bottom-4 right-4 opacity-40">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 129.43 201.4" className="w-16 h-16">
          <path fill="white" d="M92.63.1s-33.4,35.9-46.9,76.9-18,123-18,123c53.9-26.1,87.1-5.1,101.7,1.4C76.03,145.2,92.63,0,92.63,0v.1Z"/>
          <path fill="rgba(255,255,255,0.7)" d="M45.43,35.4s-23.9,31.1-37.4,61.2-5.9,88.2-5.9,88.2c22.2-23.9,68.8-19.1,68.8-19.1C33.83,122.7,45.33,35.4,45.33,35.4h.1Z"/>
        </svg>
      </div>

      {overlays.map((overlay) => (
        <CustomOverlay key={overlay.id} overlay={overlay} />
      ))}

      <style jsx>{`
        @keyframes slideDown {
          from {
            transform: translate(-50%, -100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes slideLeft {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideRight {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes bounce {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
});

function CustomOverlay({ overlay }: { overlay: LivestreamOverlay }) {
  const style = {
    position: 'absolute' as const,
    left: `${overlay.position.x}px`,
    top: `${overlay.position.y}px`,
    width: `${overlay.position.width}px`,
    height: `${overlay.position.height}px`,
    zIndex: overlay.z_index,
    backgroundColor: overlay.style.backgroundColor,
    borderColor: overlay.style.borderColor,
    color: overlay.style.textColor,
    fontSize: `${overlay.style.fontSize}px`,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '8px',
    padding: '12px',
    backdropFilter: 'blur(8px)',
  };

  return (
    <div style={style}>
      {overlay.type === 'club_logo' && overlay.content.logoUrl && (
        <img
          src={overlay.content.logoUrl}
          alt="Club Logo"
          className="w-full h-full object-contain"
        />
      )}

      {overlay.type === 'sponsor' && overlay.content.logoUrl && (
        <img
          src={overlay.content.logoUrl}
          alt="Sponsor"
          className="w-full h-full object-contain"
        />
      )}

      {overlay.type === 'custom' && (
        <div dangerouslySetInnerHTML={{ __html: overlay.content.html || '' }} />
      )}
    </div>
  );
}

function formatElapsedTime(startTime: string): string {
  const elapsed = Date.now() - new Date(startTime).getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
