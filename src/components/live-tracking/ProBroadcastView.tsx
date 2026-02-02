import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy, Users, BarChart3, Flag, Radio } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { getLiveTrackingEventByToken, getRaceStatus, subscribeToRaceStatus, type RaceStatus } from '../../utils/liveTrackingStorage';
import type { LiveTrackingEvent } from '../../types/liveTracking';
import type { HeatManagementConfig, HeatDesignation } from '../../types/heat';
import { format } from 'date-fns';

type TabType = 'heat-assignments' | 'overall-results' | 'race-results';

export default function ProBroadcastView() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [trackingEvent, setTrackingEvent] = useState<LiveTrackingEvent | null>(null);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [clubName, setClubName] = useState<string>('');
  const [venueName, setVenueName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('heat-assignments');
  const [heatConfig, setHeatConfig] = useState<HeatManagementConfig | null>(null);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [currentHeat, setCurrentHeat] = useState<HeatDesignation | null>(null);
  const [skippers, setSkippers] = useState<Array<any>>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [raceStatus, setRaceStatus] = useState<RaceStatus>('on_hold');
  const [statusNotes, setStatusNotes] = useState<string | null>(null);

  const loadEventData = useCallback(async (eventId: string) => {
    try {
      console.log('[ProBroadcast] Loading event data for:', eventId);

      const { data: quickRaceData, error: quickRaceError } = await supabase
        .from('quick_races')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();

      if (quickRaceError) {
        console.error('[ProBroadcast] Error fetching quick_races:', quickRaceError);
      }
      console.log('[ProBroadcast] quick_races data:', quickRaceData ? 'found' : 'not found');

      let eventData = quickRaceData;

      if (!quickRaceData) {
        const { data: publicEventData } = await supabase
          .from('public_events')
          .select('*')
          .eq('id', eventId)
          .maybeSingle();

        if (publicEventData) {
          eventData = publicEventData;
        } else {
          const { data: seriesData } = await supabase
            .from('race_series')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

          eventData = seriesData;
        }
      }

      if (eventData) {
        console.log('[ProBroadcast] Event data found, processing...');

        const hm = eventData.heat_management;
        if (hm) {
          const currentRoundData = hm.rounds?.find((r: any) => r.round === (hm.currentRound || 1));
          console.log('[ProBroadcast] Heat management round:', hm.currentRound || 1);
          console.log('[ProBroadcast] Results count:', currentRoundData?.results?.length || 0);

          if (currentRoundData?.results) {
            const heatCResults = currentRoundData.results.filter((r: any) => r.heatDesignation === 'C');
            console.log('[ProBroadcast] Heat C results:', heatCResults.length, heatCResults.map((r: any) => ({ pos: r.position, skipper: r.skipperIndex })));
          }
        }

        setEventDetails(eventData);

        if (eventData.heat_management) {
          setHeatConfig(eventData.heat_management);
          if (eventData.heat_management.currentRound) {
            setCurrentRound(eventData.heat_management.currentRound);
          } else if (eventData.heat_management.rounds?.length > 0) {
            setCurrentRound(eventData.heat_management.rounds[0].round || 1);
          } else {
            setCurrentRound(1);
          }

          // Also track the current heat
          if (eventData.heat_management.currentHeat) {
            setCurrentHeat(eventData.heat_management.currentHeat);
          }
        } else {
          setHeatConfig(null);
          setCurrentRound(1);
          setCurrentHeat(null);
        }

        if (eventData.skippers) {
          setSkippers(Array.isArray(eventData.skippers) ? eventData.skippers : []);
        }

        setDataVersion(prev => prev + 1);
        console.log('[ProBroadcast] State updated, dataVersion incremented');
      }
    } catch (error) {
      console.error('[ProBroadcast] Error loading event data:', error);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadTrackingEvent();
    }
  }, [token]);

  useEffect(() => {
    if (!trackingEvent?.event_id) return;

    const loadStatus = async () => {
      const statusData = await getRaceStatus(trackingEvent.event_id);
      if (statusData) {
        setRaceStatus(statusData.status);
        setStatusNotes(statusData.notes);
      }
    };
    loadStatus();

    const unsubscribe = subscribeToRaceStatus(
      trackingEvent.event_id,
      (newStatus, notes) => {
        setRaceStatus(newStatus);
        setStatusNotes(notes);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [trackingEvent?.event_id]);

  useEffect(() => {
    if (!trackingEvent?.event_id) return;

    const channel = supabase
      .channel(`pro-broadcast-${trackingEvent.event_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quick_races',
          filter: `id=eq.${trackingEvent.event_id}`,
        },
        () => {
          loadEventData(trackingEvent.event_id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'public_events',
          filter: `id=eq.${trackingEvent.event_id}`,
        },
        () => {
          loadEventData(trackingEvent.event_id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'race_series',
          filter: `id=eq.${trackingEvent.event_id}`,
        },
        () => {
          loadEventData(trackingEvent.event_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackingEvent?.event_id, loadEventData]);

  useEffect(() => {
    if (!trackingEvent?.event_id) return;

    console.log('[ProBroadcast] Setting up poll interval for event:', trackingEvent.event_id);

    const pollInterval = setInterval(() => {
      console.log('[ProBroadcast] Poll tick - fetching latest data...');
      loadEventData(trackingEvent.event_id);
    }, 3000);

    return () => {
      console.log('[ProBroadcast] Clearing poll interval');
      clearInterval(pollInterval);
    };
  }, [trackingEvent?.event_id, loadEventData]);

  const loadTrackingEvent = async () => {
    try {
      setLoading(true);

      if (!token) {
        throw new Error('No tracking token provided');
      }

      const event = await getLiveTrackingEventByToken(token);
      if (!event) {
        throw new Error('Invalid or expired tracking link');
      }

      setTrackingEvent(event);

      // Load event data using shared function
      await loadEventData(event.event_id);

      // Get the event data for additional setup (prioritize quick_races for heat management)
      const { data: quickRaceData } = await supabase
        .from('quick_races')
        .select('*')
        .eq('id', event.event_id)
        .maybeSingle();

      let eventData = quickRaceData;

      if (!quickRaceData) {
        const { data: publicEventData } = await supabase
          .from('public_events')
          .select('*')
          .eq('id', event.event_id)
          .maybeSingle();

        if (publicEventData) {
          eventData = publicEventData;
        } else {
          const { data: seriesData } = await supabase
            .from('race_series')
            .select('*')
            .eq('id', event.event_id)
            .maybeSingle();

          eventData = seriesData;
        }
      }

      if (!eventData) {
        throw new Error('Event not found');
      }

      // Set current round if available
      if (eventData.heat_management?.currentRound) {
        setCurrentRound(eventData.heat_management.currentRound);
      }

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

      if (eventData.venue_id) {
        const { data: venueData } = await supabase
          .from('venues')
          .select('name')
          .eq('id', eventData.venue_id)
          .maybeSingle();

        if (venueData) {
          setVenueName(venueData.name);
        }
      } else if (eventData.race_venue || eventData.venue) {
        setVenueName(eventData.race_venue || eventData.venue);
      }
    } catch (error) {
      console.error('Error loading tracking event:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getRaceStatusDisplay = () => {
    // Build the live status label with round and heat info
    let liveLabel = 'Live Racing';
    if (raceStatus === 'live' && currentRound && currentHeat) {
      liveLabel = `Live: Round ${currentRound} · Heat ${currentHeat}`;
    } else if (raceStatus === 'live' && currentRound) {
      liveLabel = `Live: Round ${currentRound}`;
    } else if (raceStatus === 'live' && statusNotes) {
      // For scratch racing (no heat info), show race number from status notes
      liveLabel = `Live Racing - ${statusNotes}`;
    }

    const statusConfig: Record<RaceStatus, { label: string; bg: string; text: string; pulse: boolean }> = {
      'live': { label: liveLabel, bg: 'bg-emerald-500', text: 'text-white', pulse: true },
      'on_hold': { label: 'On Hold', bg: 'bg-amber-500', text: 'text-white', pulse: false },
      'completed_for_day': { label: 'Day Complete', bg: 'bg-slate-600', text: 'text-white', pulse: false },
      'event_complete': { label: 'Event Complete', bg: 'bg-cyan-600', text: 'text-white', pulse: false },
    };
    return statusConfig[raceStatus] || statusConfig['on_hold'];
  };

  const heatColorMap: Record<HeatDesignation, { bg: string; text: string; border: string }> = {
    'A': { bg: 'bg-amber-400', text: 'text-amber-900', border: 'border-amber-500' },
    'B': { bg: 'bg-orange-500', text: 'text-orange-900', border: 'border-orange-600' },
    'C': { bg: 'bg-rose-500', text: 'text-rose-900', border: 'border-rose-600' },
    'D': { bg: 'bg-purple-500', text: 'text-purple-900', border: 'border-purple-600' },
    'E': { bg: 'bg-blue-500', text: 'text-blue-900', border: 'border-blue-600' },
    'F': { bg: 'bg-slate-500', text: 'text-slate-900', border: 'border-slate-600' },
  };

  const renderScratchResults = () => {
    if (!eventDetails || !eventDetails.race_results || !Array.isArray(eventDetails.race_results) || eventDetails.race_results.length === 0) {
      return (
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">No results available yet</p>
        </div>
      );
    }

    const raceResults = eventDetails.race_results;
    const numRaces = eventDetails.num_races || Math.max(...raceResults.map((r: any) => r.race || 0));

    // Group results by race
    const resultsByRace: Record<number, any[]> = {};
    raceResults.forEach((result: any) => {
      if (!resultsByRace[result.race]) {
        resultsByRace[result.race] = [];
      }
      resultsByRace[result.race].push(result);
    });

    // Calculate totals and standings with proper drop logic
    const skipperTotals: Record<number, { total: number; results: any[]; droppedRaces: Set<number> }> = {};

    skippers.forEach((skipper, idx) => {
      const skipperResults = raceResults.filter((r: any) => r.skipperIndex === idx);

      // Create array of {race, points} for each race
      const racePoints = skipperResults.map((r: any) => ({
        race: r.race,
        points: r.letterScore ? (r.customPoints || 99) : (r.position || 99)
      }));

      // Sort by points (highest first) to determine which races to drop
      const sortedByPoints = [...racePoints].sort((a, b) => b.points - a.points);

      // Determine which races to drop
      const dropCount = eventDetails.drop_rules?.[0] || 0;
      const racesToDrop = new Set(sortedByPoints.slice(0, dropCount).map(rp => rp.race));

      // Calculate total (excluding dropped races)
      const total = racePoints.reduce((sum, rp) => {
        return sum + (racesToDrop.has(rp.race) ? 0 : rp.points);
      }, 0);

      skipperTotals[idx] = { total, results: skipperResults, droppedRaces: racesToDrop };
    });

    // Sort skippers by total
    const sortedSkippers = skippers.map((s, idx) => ({ ...s, idx }))
      .sort((a, b) => (skipperTotals[a.idx]?.total || 999) - (skipperTotals[b.idx]?.total || 999));

    // Calculate responsive sizing
    const numSkippers = sortedSkippers.length;
    const availableHeight = window.innerHeight - 220; // Account for header and footer
    const headerHeight = 60;
    const footerHeight = 50;
    const bodyHeight = availableHeight - headerHeight - footerHeight;
    const rowHeight = Math.max(35, Math.min(80, bodyHeight / numSkippers));

    // Dynamic font sizing
    const baseFontSize = numSkippers <= 8 ? 'text-xl' : numSkippers <= 12 ? 'text-lg' : numSkippers <= 16 ? 'text-base' : 'text-sm';
    const headerFontSize = numSkippers <= 8 ? 'text-2xl' : numSkippers <= 12 ? 'text-xl' : 'text-lg';
    const positionFontSize = numSkippers <= 8 ? 'text-3xl' : numSkippers <= 12 ? 'text-2xl' : 'text-xl';
    const raceFontSize = numSkippers <= 8 ? 'text-xl' : numSkippers <= 12 ? 'text-lg' : 'text-base';

    return (
      <div
        className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-cyan-500/20"
        style={{ height: `${availableHeight}px` }}
      >
        {/* Header */}
        <div
          className="bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-600 relative overflow-hidden"
          style={{ height: `${headerHeight}px` }}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIG9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-20"></div>
          <div className="relative px-6 h-full flex items-center justify-between">
            <div>
              <h3 className={`${headerFontSize} font-black text-white tracking-tight`}>LIVE RESULTS</h3>
              <p className="text-cyan-100 text-sm font-medium">Real-time standings • NET scores with drops applied</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden" style={{ height: `${bodyHeight}px` }}>
          <table className="w-full h-full border-collapse">
            <thead>
              <tr
                className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-b-2 border-cyan-500/30"
                style={{ height: '50px' }}
              >
                <th className={`px-3 text-left font-black text-cyan-400 ${baseFontSize} border-r border-slate-600/50`} style={{ width: '80px' }}>
                  POS
                </th>
                <th className={`px-4 text-left font-black text-cyan-400 ${baseFontSize} border-r border-slate-600/50`} style={{ minWidth: '180px' }}>
                  SKIPPER
                </th>
                {Array.from({ length: numRaces }, (_, i) => i + 1).map(race => (
                  <th
                    key={race}
                    className={`px-2 text-center font-black text-cyan-400 ${baseFontSize} border-r border-slate-600/50`}
                    style={{ width: `${Math.max(50, 400 / numRaces)}px` }}
                  >
                    R{race}
                  </th>
                ))}
                <th
                  className={`px-3 text-center font-black text-cyan-400 ${baseFontSize} bg-gradient-to-r from-slate-700 to-slate-800`}
                  style={{ width: '100px' }}
                >
                  NET
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSkippers.map((skipper, position) => {
                const idx = skipper.idx;
                const skipperData = skipperTotals[idx];
                const isPodium = position < 3;

                const rowBg = position % 2 === 0
                  ? 'bg-slate-800/50'
                  : 'bg-slate-900/50';

                const positionColor = isPodium
                  ? position === 0
                    ? 'text-yellow-400'
                    : position === 1
                      ? 'text-slate-300'
                      : 'text-orange-400'
                  : 'text-slate-400';

                return (
                  <tr
                    key={idx}
                    className={`border-b border-slate-700/50 ${rowBg} hover:bg-cyan-900/10 transition-colors`}
                    style={{ height: `${rowHeight}px` }}
                  >
                    <td className="px-3 border-r border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <span className={`font-black ${positionColor} ${positionFontSize}`}>
                          {position + 1}
                        </span>
                        {isPodium && (
                          <span className="text-lg">
                            {position === 0 ? '🥇' : position === 1 ? '🥈' : '🥉'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 border-r border-slate-700/50">
                      <p className={`font-bold text-white ${baseFontSize} truncate`}>{skipper.name}</p>
                      <p className="text-xs text-slate-400 truncate">Sail {skipper.sailNo || skipper.sail_number || 'N/A'}</p>
                    </td>
                    {Array.from({ length: numRaces }, (_, i) => i + 1).map(race => {
                      const result = resultsByRace[race]?.find((r: any) => r.skipperIndex === idx);
                      const isDropped = skipperData?.droppedRaces.has(race);

                      return (
                        <td key={race} className="px-2 text-center border-r border-slate-700/50">
                          {result ? (
                            result.letterScore ? (
                              <span className={`font-black ${raceFontSize} ${isDropped ? 'text-red-500/50 line-through' : 'text-red-500'}`}>
                                {result.letterScore}
                              </span>
                            ) : (
                              <span className={`font-black ${raceFontSize} ${isDropped ? 'text-red-500/50 line-through' : 'text-white'}`}>
                                {result.position}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600 text-lg">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 text-center bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                      <span className={`font-black text-cyan-400 ${positionFontSize}`}>
                        {skipperData?.total.toFixed(1) || '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Legend */}
        <div
          className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-t-2 border-cyan-500/30 flex items-center justify-center gap-8"
          style={{ height: `${footerHeight}px` }}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg shadow-yellow-500/50"></div>
            <span className="text-slate-300 font-bold text-sm">1st Place</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-500 font-black line-through text-base">(d)</span>
            <span className="text-slate-300 font-bold text-sm">Dropped</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-500 font-black text-base">DNS/DNF</span>
            <span className="text-slate-300 font-bold text-sm">Penalty</span>
          </div>
        </div>
      </div>
    );
  };

  const renderHeatAssignments = () => {
    // For scratch events (no heat management), show results table
    if (!heatConfig || !heatConfig.rounds) {
      return renderScratchResults();
    }

    const round = heatConfig.rounds.find(r => r.round === currentRound);
    if (!round || !round.heatAssignments) {
      return (
        <div className="text-center py-12">
          <p className="text-slate-600 text-lg">No assignments for this round</p>
        </div>
      );
    }

    const assignments = round.heatAssignments.sort((a, b) =>
      a.heatDesignation.localeCompare(b.heatDesignation)
    );

    const heatCount = assignments.length;
    const promotionCount = heatConfig?.configuration?.promotionCount || 4;
    const isSHRS = heatConfig?.configuration?.scoringSystem === 'shrs';
    const totalHeats = assignments.length;

    const getGridCols = () => {
      if (heatCount === 1) return 'grid-cols-1';
      if (heatCount === 2) return 'grid-cols-1 lg:grid-cols-2';
      if (heatCount === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      if (heatCount === 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
      if (heatCount === 5) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5';
      return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6';
    };

    const groupResultsByHeat = () => {
      const grouped: Record<string, { results: any[], isComplete: boolean }> = {};

      if (!round.results || !Array.isArray(round.results)) return grouped;

      round.results.forEach(result => {
        if (!result.heatDesignation) return;
        if (!grouped[result.heatDesignation]) {
          grouped[result.heatDesignation] = { results: [], isComplete: false };
        }
        grouped[result.heatDesignation].results.push(result);
      });

      const isSkipperScored = (result: any) => {
        if (!result) return false;
        const hasValidPosition = result.position != null && result.position > 0 && result.position !== 999;
        const hasLetterScore = result.letterScore != null && result.letterScore !== '';
        return hasValidPosition || hasLetterScore;
      };

      assignments.forEach(assignment => {
        const heatDesignation = assignment.heatDesignation;
        const heatData = grouped[heatDesignation];

        if (heatData && heatData.results.length > 0) {
          const expectedSkipperCount = assignment.skipperIndices?.length || 0;

          const allOriginalSkippersHaveScores = assignment.skipperIndices?.every(idx => {
            const result = heatData.results.find(r => r.skipperIndex === idx);
            return isSkipperScored(result);
          }) || false;

          heatData.isComplete = allOriginalSkippersHaveScores && expectedSkipperCount > 0;
        }
      });

      return grouped;
    };

    const heatResultsGrouped = groupResultsByHeat();

    const getHeatStatus = (heatDesignation: string) => {
      const heatData = heatResultsGrouped[heatDesignation];
      return {
        isComplete: heatData?.isComplete || false,
        results: heatData?.results || []
      };
    };

    const promotedSkippers: Record<string, Array<any>> = {};

    for (let heatIdx = totalHeats - 1; heatIdx > 0; heatIdx--) {
      const assignment = assignments[heatIdx];
      const { isComplete, results } = getHeatStatus(assignment.heatDesignation);

      if (isComplete) {
        const targetHeat = assignments[heatIdx - 1];
        const totalInHeat = results.length;
        const actualPromotionCount = Math.min(promotionCount, Math.floor(totalInHeat / 2));

        results.forEach(result => {
          const idx = result.skipperIndex;
          const skipper = skippers[idx];
          if (!skipper) return;

          const hasValidPosition = result.position && result.position > 0 && result.position !== 999;

          if (hasValidPosition && result.position <= actualPromotionCount) {
            if (!promotedSkippers[targetHeat.heatDesignation]) {
              promotedSkippers[targetHeat.heatDesignation] = [];
            }
            const alreadyAdded = promotedSkippers[targetHeat.heatDesignation].some(
              p => p.skipperIndex === idx
            );
            if (!alreadyAdded) {
              promotedSkippers[targetHeat.heatDesignation].push({
                ...skipper,
                skipperIndex: idx,
                position: result.position,
                fromHeat: assignment.heatDesignation
              });
            }
          }
        });
      }
    }

    const availableHeight = 'calc(100vh - 140px)';

    const incompleteHeats = assignments.filter(a => !getHeatStatus(a.heatDesignation).isComplete);
    const lastIncompleteHeat = incompleteHeats.length > 0 ? incompleteHeats[incompleteHeats.length - 1].heatDesignation : null;

    return (
      <div
        key={`heat-assignments-${dataVersion}`}
        className={`grid ${heatCount > 3 ? getGridCols() : ''} gap-4 justify-items-center`}
        style={{
          gridTemplateColumns: heatCount <= 3
            ? `repeat(${heatCount}, minmax(360px, 1fr))`
            : undefined
        }}
      >
        {assignments.map((assignment, heatIdx) => {
          const colors = heatColorMap[assignment.heatDesignation];
          const { isComplete, results } = getHeatStatus(assignment.heatDesignation);
          const isTopHeat = heatIdx === 0;
          const isBottomHeat = heatIdx === totalHeats - 1;
          const isActiveHeat = raceStatus === 'live' && !isComplete && assignment.heatDesignation === lastIncompleteHeat;

          const isRound1 = currentRound === 1;

          const incomingPromotions = (isComplete || isRound1)
            ? []
            : (promotedSkippers[assignment.heatDesignation] || [])
                .sort((a, b) => a.position - b.position);

          const heatBelowComplete = heatIdx < totalHeats - 1
            ? getHeatStatus(assignments[heatIdx + 1].heatDesignation).isComplete
            : false;

          const shouldShowPromotionSlots = !isRound1 &&
            !isComplete &&
            !isBottomHeat &&
            totalHeats > 1 &&
            incomingPromotions.length === 0 &&
            !heatBelowComplete;

          let heatSkippers: any[] = [];

          const hasValidNumericPosition = (r: any) => r && r.position != null && r.position > 0 && r.position !== 999;
          const hasLetterScoreResult = (r: any) => r && r.letterScore != null && r.letterScore !== '';
          const hasAnyResult = (r: any) => hasValidNumericPosition(r) || hasLetterScoreResult(r);

          const highestNumericPosition = results
            .filter(r => hasValidNumericPosition(r))
            .reduce((max, r) => Math.max(max, r.position), 0);
          const letterScorePosition = highestNumericPosition + 1;

          if (isComplete && results.length > 0) {
            heatSkippers = results
              .map(result => {
                const skipper = skippers[result.skipperIndex];
                if (!skipper) return null;

                const hasNumeric = hasValidNumericPosition(result);
                const hasLetter = hasLetterScoreResult(result);

                return {
                  ...skipper,
                  skipperIndex: result.skipperIndex,
                  position: hasNumeric ? result.position : (hasLetter ? letterScorePosition : 999),
                  letterScore: result.letterScore || null,
                  hasResult: hasAnyResult(result)
                };
              })
              .filter(Boolean)
              .sort((a, b) => a.position - b.position);
          } else {
            heatSkippers = assignment.skipperIndices
              .map(idx => {
                const skipper = skippers[idx];
                if (!skipper) return null;

                const result = results.find(r => r.skipperIndex === idx);
                const hasNumeric = hasValidNumericPosition(result);
                const hasLetter = hasLetterScoreResult(result);

                return {
                  ...skipper,
                  skipperIndex: idx,
                  position: hasNumeric ? result.position : (hasLetter ? letterScorePosition : 999),
                  letterScore: result?.letterScore || null,
                  hasResult: hasAnyResult(result)
                };
              })
              .filter(Boolean);
          }

          const totalSkippersInHeat = heatSkippers.length;
          const actualPromotionCount = Math.min(promotionCount, Math.floor(totalSkippersInHeat / 2));

          return (
            <div
              key={assignment.heatDesignation}
              className="shadow-xl w-full flex flex-col overflow-hidden"
              style={{
                height: availableHeight,
                minWidth: '300px',
                maxWidth: heatCount <= 3 ? 'none' : '420px'
              }}
            >
              {/* Colored Heat Header */}
              <div className={`${colors.bg} px-4 py-3 flex-shrink-0`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold text-white drop-shadow-lg">
                    Heat {assignment.heatDesignation} - Rnd {currentRound}
                  </h3>
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-emerald-500 shadow-md">
                        Complete
                      </span>
                    ) : isActiveHeat ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-cyan-500 shadow-md flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                        In Progress
                      </span>
                    ) : null}
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-slate-900 bg-white/90 shadow-md">
                      {heatSkippers.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Slate Gradient Body */}
              <div
                className={`flex-1 overflow-hidden p-2 flex flex-col bg-gradient-to-br from-slate-800 via-slate-800/95 to-slate-900 border-l-2 border-r-2 border-b-2 ${colors.border}`}
              >
                {(() => {
                  const allSkippersToDisplay: any[] = [];

                  heatSkippers.forEach((skipper) => {
                    const isAlreadyPromoted = incomingPromotions.some(
                      p => p.skipperIndex === skipper.skipperIndex
                    );
                    if (!isAlreadyPromoted) {
                      allSkippersToDisplay.push(skipper);
                    }
                  });

                  incomingPromotions.forEach((promotedSkipper) => {
                    allSkippersToDisplay.push({
                      ...promotedSkipper,
                      isIncomingPromotion: true,
                      fromHeat: promotedSkipper.fromHeat
                    });
                  });

                  if (allSkippersToDisplay.length === 0) {
                    return <p className="text-white/80 text-center py-4 font-semibold text-sm">No skippers assigned</p>;
                  }

                  const totalItems = allSkippersToDisplay.length + (shouldShowPromotionSlots ? promotionCount : 0);
                  const gapSize = totalItems <= 10 ? 8 : totalItems <= 15 ? 6 : totalItems <= 20 ? 4 : 3;

                  return (
                    <div className="flex flex-col h-full" style={{ gap: `${gapSize}px` }}>
                      {allSkippersToDisplay.map((skipper, displayIdx) => {
                        const sailNumber = skipper.sailNo || skipper.sail_number || 'N/A';
                        const hasValidPosition = skipper.position && skipper.position !== 999 && skipper.position > 0;
                        const hasLetterScore = skipper.letterScore != null && skipper.letterScore !== '';
                        const isIncomingPromotion = skipper.isIncomingPromotion;

                        const isRound1TopFinisher = isRound1 && isComplete && hasValidPosition && skipper.position <= actualPromotionCount;

                        const cardBorder = isIncomingPromotion
                          ? 'border-2 border-emerald-500'
                          : isRound1TopFinisher
                            ? 'border-2 border-emerald-400'
                            : '';

                        return (
                          <div
                            key={isIncomingPromotion ? `promoted-${skipper.skipperIndex}` : skipper.skipperIndex}
                            className={`flex-1 min-h-[32px] max-h-[56px] flex items-stretch bg-white shadow-md overflow-hidden ${cardBorder}`}
                          >
                            {isComplete && (hasValidPosition || hasLetterScore) && (
                              <div className={`flex-shrink-0 w-10 flex items-center justify-center ${isRound1TopFinisher ? 'bg-emerald-500' : hasLetterScore ? 'bg-red-500' : 'bg-slate-700'}`}>
                                <span className="text-white font-bold text-sm">
                                  {skipper.position}
                                </span>
                              </div>
                            )}

                            <div className="flex-shrink-0 w-14 bg-slate-900 flex items-center justify-center">
                              <span className="text-white font-bold text-sm">
                                {sailNumber}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0 px-2 flex items-center gap-2">
                              {skipper.avatarUrl && (
                                <img
                                  src={skipper.avatarUrl}
                                  alt={skipper.name}
                                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                />
                              )}
                              <p className="font-bold text-slate-900 text-sm truncate">
                                {skipper.name}
                              </p>
                            </div>

                            {hasLetterScore && !isIncomingPromotion && (
                              <div className="flex-shrink-0 px-2 bg-red-500 flex items-center justify-center">
                                <span className="text-white font-bold text-xs">
                                  {skipper.letterScore}
                                </span>
                              </div>
                            )}

                            {isIncomingPromotion && (
                              <div className="flex-shrink-0 px-3 bg-emerald-500 flex items-center justify-center">
                                <span className="text-white font-bold text-xs whitespace-nowrap">
                                  From Heat {skipper.fromHeat}
                                </span>
                              </div>
                            )}

                            {isRound1TopFinisher && (
                              <div className="flex-shrink-0 px-3 bg-emerald-500 flex items-center justify-center">
                                <span className="text-white font-bold text-xs whitespace-nowrap">
                                  Promotes
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {shouldShowPromotionSlots && Array.from({ length: promotionCount }).map((_, slotIdx) => {
                        const heatColors = heatColorMap[assignment.heatDesignation];
                        const lightBg = heatColors.bg.replace('bg-', 'bg-').replace('-500', '-200');
                        const lightText = heatColors.text.replace('text-', 'text-').replace('-900', '-700');
                        return (
                          <div
                            key={`promotion-slot-${slotIdx}`}
                            className={`flex-1 min-h-[32px] max-h-[56px] flex items-stretch ${lightBg} overflow-hidden border-2 border-dashed ${heatColors.border}`}
                          >
                            <div className={`flex-shrink-0 w-10 ${heatColors.bg} flex items-center justify-center`}>
                              <span className={`${heatColors.text} font-bold text-sm`}>P</span>
                            </div>

                            <div className="flex-1 min-w-0 px-2 flex items-center">
                              <p className={`font-medium ${lightText} text-sm`}>
                                Promotion slot
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderOverallResults = () => {
    // For scratch events, show same as scratch results
    if (!heatConfig || !heatConfig.rounds) {
      return renderScratchResults();
    }

    // Calculate total points for each skipper across all rounds
    const skipperTotals: Record<number, { name: string; sailNo: string; rounds: number[]; total: number }> = {};

    heatConfig.rounds.forEach(round => {
      if (round.results && round.results.length > 0) {
        // Calculate points for this round
        const roundPoints: Record<number, number> = {};

        round.results.forEach(result => {
          if (result.position && !result.markedAsUP) {
            // For heat racing, lower positions get more points (position = points)
            roundPoints[result.skipperIndex] = result.position;
          }
        });

        // Add to overall totals
        Object.entries(roundPoints).forEach(([skipperIdx, points]) => {
          const idx = parseInt(skipperIdx);
          if (!skipperTotals[idx]) {
            const skipper = skippers[idx];
            skipperTotals[idx] = {
              name: skipper?.name || 'Unknown',
              sailNo: skipper?.sailNo || skipper?.sail_number || 'N/A',
              rounds: [],
              total: 0
            };
          }
          skipperTotals[idx].rounds.push(points);
          skipperTotals[idx].total += points;
        });
      }
    });

    const sortedResults = Object.entries(skipperTotals)
      .map(([idx, data]) => ({ idx: parseInt(idx), ...data }))
      .sort((a, b) => a.total - b.total); // Lower is better in heat racing

    if (sortedResults.length === 0) {
      return (
        <div className="text-center py-12">
          <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">No results available yet</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
              <tr>
                <th className="px-6 py-5 text-left font-bold text-lg">Pos</th>
                <th className="px-6 py-5 text-left font-bold text-lg">Skipper</th>
                <th className="px-6 py-5 text-left font-bold text-lg">Sail No</th>
                <th className="px-6 py-5 text-center font-bold text-lg">Races</th>
                <th className="px-6 py-5 text-center font-bold text-lg">Total Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedResults.map((result, idx) => (
                <tr
                  key={result.idx}
                  className={idx < 3 ? 'bg-amber-50' : 'hover:bg-slate-50'}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <span className="text-3xl">🥇</span>}
                      {idx === 1 && <span className="text-3xl">🥈</span>}
                      {idx === 2 && <span className="text-3xl">🥉</span>}
                      <span className="font-extrabold text-slate-900 text-xl">{idx + 1}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="font-extrabold text-slate-900 text-lg">{result.name}</p>
                  </td>
                  <td className="px-6 py-5 font-bold text-slate-900 text-lg">{result.sailNo}</td>
                  <td className="px-6 py-5 text-center font-bold text-slate-900 text-lg">{result.rounds.length}</td>
                  <td className="px-6 py-5 text-center">
                    <span className="font-extrabold text-slate-900 text-xl">{result.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderRaceResults = () => {
    // For scratch events, show same as scratch results
    if (!heatConfig || !heatConfig.rounds) {
      return renderScratchResults();
    }

    const round = heatConfig.rounds.find(r => r.round === currentRound);
    if (!round || !round.results || round.results.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-slate-600 text-lg">No results for Round {currentRound} yet</p>
        </div>
      );
    }

    // Group results by heat for display
    const resultsByHeat: Record<string, any[]> = {};
    round.results.forEach(result => {
      if (!resultsByHeat[result.heatDesignation]) {
        resultsByHeat[result.heatDesignation] = [];
      }
      resultsByHeat[result.heatDesignation].push(result);
    });

    const heats = Object.keys(resultsByHeat).sort();

    return (
      <div className="space-y-6">
        {heats.map((heatDesignation) => {
          const heatResults = resultsByHeat[heatDesignation];
          const sortedResults = [...heatResults].sort((a, b) =>
            (a.position || 999) - (b.position || 999)
          );
          const heatColors = heatColorMap[heatDesignation as HeatDesignation];

          return (
            <div key={heatDesignation} className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className={`text-white px-6 py-5 ${heatColors.bg}`}>
                <h3 className="text-2xl font-extrabold">Heat {heatDesignation} - Round {currentRound}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-left font-bold text-slate-900 text-lg">Pos</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-900 text-lg">Skipper</th>
                      <th className="px-6 py-4 text-left font-bold text-slate-900 text-lg">Sail No</th>
                      <th className="px-6 py-4 text-center font-bold text-slate-900 text-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedResults.map((result) => {
                      const skipper = skippers[result.skipperIndex];
                      const hasLetterScore = result.letterScore && result.letterScore !== 'FIN';

                      return (
                        <tr key={result.skipperIndex} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            {hasLetterScore ? (
                              <span className="font-extrabold text-red-600 text-xl">{result.letterScore}</span>
                            ) : (
                              <span className="font-extrabold text-slate-900 text-xl">{result.position || '-'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-extrabold text-slate-900 text-lg">
                              {skipper?.name || 'Unknown'}
                            </p>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900 text-lg">
                            {skipper?.sailNo || skipper?.sail_number || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {result.markedAsUP ? (
                              <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-purple-500 text-white">
                                UP (Promoted)
                              </span>
                            ) : hasLetterScore ? (
                              <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800">
                                {result.letterScore}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold text-base">Finished</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-700 font-medium">Loading broadcast...</p>
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

  const statusDisplay = getRaceStatusDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] pb-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] shadow-lg border-b border-white/5">
        <div className="w-full px-4 sm:px-6 lg:px-12 py-3">
          <div className="relative flex items-center justify-center">
            {/* Logo and Title - Center */}
            <div className="flex items-center gap-2.5">
              <img
                src="/alfie_app_logo copy copy.svg"
                alt="AlfiePRO"
                className="w-8 h-8 lg:w-9 lg:h-9"
              />
              <h1 className="text-xl lg:text-2xl text-white">
                <span className="font-thin">Alfie</span><span className="font-extrabold">PRO</span> Broadcast
              </h1>
            </div>
            {/* View Icons and Race Status - Absolute Right */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
              {/* View Tab Icons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('heat-assignments')}
                  className={`p-2 rounded-lg font-semibold transition-all ${
                    activeTab === 'heat-assignments'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  }`}
                  title="Heat Assignments"
                >
                  <Users size={18} />
                </button>
                <button
                  onClick={() => setActiveTab('overall-results')}
                  className={`p-2 rounded-lg font-semibold transition-all ${
                    activeTab === 'overall-results'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  }`}
                  title="Overall Results"
                >
                  <Trophy size={18} />
                </button>
                <button
                  onClick={() => setActiveTab('race-results')}
                  className={`p-2 rounded-lg font-semibold transition-all ${
                    activeTab === 'race-results'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  }`}
                  title="Race Results"
                >
                  <Flag size={18} />
                </button>
              </div>
              {/* Race Status */}
              <div className={`flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 rounded-full ${statusDisplay.bg} ${statusDisplay.text} shadow-lg`}>
                {statusDisplay.pulse && (
                  <span className="relative flex h-2.5 w-2.5 lg:h-3 lg:w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 lg:h-3 lg:w-3 bg-white"></span>
                  </span>
                )}
                <Radio size={14} className="lg:w-4 lg:h-4" />
                <span className="font-bold text-xs lg:text-sm">{statusDisplay.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-center px-6 sm:px-8 lg:px-12">
        {/* Content */}
        <div
          className="mt-4 mb-4 w-full"
          style={{
            maxWidth: (heatConfig?.rounds?.[currentRound - 1]?.heatAssignments?.length <= 3 && activeTab === 'heat-assignments') || !heatConfig
              ? 'calc(min(100vw - 96px, 1900px))'
              : '860px'
          }}
        >
          {activeTab === 'heat-assignments' && renderHeatAssignments()}
          {activeTab === 'overall-results' && renderOverallResults()}
          {activeTab === 'race-results' && renderRaceResults()}
        </div>

        {/* Footer */}
        <div className="text-center pb-6">
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
