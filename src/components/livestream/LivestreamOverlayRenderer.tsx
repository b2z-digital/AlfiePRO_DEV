import React, { useEffect, useState, useRef } from 'react';
import { Timer } from 'lucide-react';
import type { LivestreamSession, LivestreamOverlay } from '../../types/livestream';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { getActiveSessionsForEvent, getRaceStatus } from '../../utils/liveTrackingStorage';
import { supabase } from '../../utils/supabase';

interface LivestreamOverlayRendererProps {
  session: LivestreamSession;
  raceData?: any;
  weatherData?: any;
  showTitleCard?: boolean;
  titleCardTrigger?: number;
  venueImage?: string;
  venueName?: string;
  /** Host club shown on the intro and hold screens (AlfiePRO sits small in the corner) */
  hostClubName?: string;
  hostClubLogo?: string;
  /** Show the intro at full strength straight away (going live), instead of fading it in */
  titleCardInstant?: boolean;
  /** Show the last scored race's results card again (Results scene in the control room) */
  resultsTrigger?: number;
  /** Tells the control room what scoring is doing (race, status, whether results exist) */
  onScoring?: (summary: OverlayScoringSummary | null) => void;
  /**
   * Where the race data comes from when this page can't read it itself: the cloud
   * program page runs signed out, so it gets the same rows from the live-cloud function.
   */
  loadSource?: () => Promise<OverlaySource | null>;
  /** Time zone for the race bar clock (the cloud recorder runs in UTC) */
  timeZone?: string;
}

/** The rows the overlays are built from: the race (quick race shape), its public event and race status */
export interface OverlaySource {
  race: any;
  event: any;
  status: { status: string; lastUpdate: string | null; notes: string | null; day: number | null } | null;
}

export interface OverlayScoringSummary {
  race: string;
  status: string;
  label: string;
  hasResults: boolean;
}

/** Race word and status label as the overlay race bar shows them */
export function describeScoring(data: any, sessionHeat?: number | null) {
  const race = data?.heat_label
    ? String(data.heat_label)
    : `${data?.race_type === 'heat' ? 'Heat' : 'Race'} ${data?.heat_number || data?.race_number || sessionHeat || 1}`;
  const raw = String(data?.status || '');
  const [label, tone] =
    raw === 'live' || raw === 'in_progress' ? ['Racing', 'is-racing'] :
    raw === 'on_hold' ? ['On hold', 'is-hold'] :
    raw === 'completed_for_day' ? ['Done for today', 'is-done'] :
    raw === 'event_complete' || raw === 'completed' ? ['Finished', 'is-done'] :
    raw === 'preparing' ? ['Getting ready', 'is-done'] : ['', ''];
  return { race, raw, label, tone };
}

export const LivestreamOverlayRenderer = React.forwardRef<HTMLDivElement, LivestreamOverlayRendererProps>(function LivestreamOverlayRenderer({ session, raceData, weatherData, showTitleCard, titleCardTrigger = 0, venueImage, venueName, hostClubName, hostClubLogo, titleCardInstant = false, resultsTrigger = 0, onScoring, loadSource, timeZone }, ref) {
  const [overlays, setOverlays] = useState<LivestreamOverlay[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [liveTrackingData, setLiveTrackingData] = useState<any>(null);
  const [liveSkippers, setLiveSkippers] = useState<any[]>([]);
  const [resultsUntil, setResultsUntil] = useState(0);
  const prevCompletedRef = useRef<number | null>(null);
  const lastRaceResultsRef = useRef<{ race: number; rows: { position: number; sail: string; name: string; hull: string }[] } | null>(null);
  const [titleCardVisible, setTitleCardVisible] = useState(false);
  const [titleCardPhase, setTitleCardPhase] = useState<'entering' | 'visible' | 'exiting' | 'hidden'>('hidden');
  const titleCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadOverlays();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [session.id]);

  useEffect(() => {
    setLiveTrackingData(null);
    setLiveSkippers([]);

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

  // Going live: the intro is held for as long as the control room shows it, then fades out
  const heldIntroRef = useRef(false);
  useEffect(() => {
    if (showTitleCard && titleCardInstant) {
      heldIntroRef.current = true;
      if (titleCardTimerRef.current) clearTimeout(titleCardTimerRef.current);
      setTitleCardVisible(true);
      setTitleCardPhase('visible');
      return;
    }
    if (!showTitleCard && heldIntroRef.current) {
      heldIntroRef.current = false;
      setTitleCardPhase('exiting');
      const hideTimer = setTimeout(() => { setTitleCardPhase('hidden'); setTitleCardVisible(false); }, 1000);
      return () => clearTimeout(hideTimer);
    }
  }, [showTitleCard, titleCardInstant]);

  const lastTriggerRef = useRef(titleCardTrigger);
  useEffect(() => {
    if (showTitleCard && titleCardInstant) return;
    // Only a new trigger or the card being switched on shows it (not the card being switched off)
    const triggered = titleCardTrigger !== lastTriggerRef.current && titleCardTrigger > 0;
    lastTriggerRef.current = titleCardTrigger;
    if (showTitleCard || triggered) {
      if (titleCardTimerRef.current) clearTimeout(titleCardTimerRef.current);
      setTitleCardVisible(true);
      setTitleCardPhase(titleCardInstant ? 'visible' : 'entering');

      const enterTimer = setTimeout(() => setTitleCardPhase('visible'), 100);
      const holdTimer = setTimeout(() => setTitleCardPhase('exiting'), 8000);
      const hideTimer = setTimeout(() => {
        setTitleCardPhase('hidden');
        setTitleCardVisible(false);
      }, 9500);

      titleCardTimerRef.current = hideTimer;

      return () => {
        clearTimeout(enterTimer);
        clearTimeout(holdTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [showTitleCard, titleCardTrigger]);

  useEffect(() => {
    return () => {
      if (titleCardTimerRef.current) clearTimeout(titleCardTimerRef.current);
    };
  }, []);

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
      // Race status is looked up under this id (series rounds linked by round id use the series id)
      let statusEventId = session.event_id;
      // Rows handed in by the page (cloud program page) instead of read here
      const external = loadSource ? await loadSource().catch(() => null) : null;
      if (loadSource && !external) return;

      if (external) {
        quickRaces = external.race;
      } else if (isSeriesRound) {
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
            round_index,
            last_completed_race
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
            public_event_id: null,
            last_completed_race: (data as any).last_completed_race
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
            public_event_id,
            last_completed_race
          `)
          .eq('id', session.event_id)
          .maybeSingle();

        quickRaces = data;
        error = raceError;

        // Not a quick race: it may be a series round linked by its round id
        // (Live setup wizard and Link Race/Heat saved links this way).
        if (!quickRaces && !raceError) {
          const { data: round } = await supabase
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
              round_index,
              last_completed_race
            `)
            .eq('id', session.event_id)
            .maybeSingle();

          if (round) {
            console.log('[Overlay Debug] Detected series round by round id:', { seriesId: round.series_id, roundIndex: round.round_index });
            quickRaces = {
              id: round.id,
              event_name: round.round_name,
              race_date: round.date,
              race_format: null,
              race_results: round.race_results,
              completed: round.completed,
              updated_at: round.updated_at,
              skippers: round.skippers,
              heat_management: round.heat_management,
              num_races: round.num_races,
              current_day: round.round_index,
              public_event_id: null,
              last_completed_race: (round as any).last_completed_race
            } as any;
            if (round.series_id) statusEventId = round.series_id;
          }
        }
      }

      console.log('[Overlay Debug] Quick race data:', quickRaces, error);

      // Get the public event details if we have a public_event_id
      let eventData = external ? external.event : null;
      if (!external && quickRaces?.public_event_id) {
        const { data, error: eventError } = await supabase
          .from('public_events')
          .select('id, event_name, date, end_date')
          .eq('id', quickRaces.public_event_id)
          .maybeSingle();

        eventData = data;
        console.log('[Overlay Debug] Public event data:', eventData, eventError);
      }

      // Get race status
      const raceStatusData = external ? (external.status as Awaited<ReturnType<typeof getRaceStatus>>) : await getRaceStatus(statusEventId);
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
            skipperIndex: index,
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

        const heatManagement = quickRaces.heat_management as any;
        const hasLegacyHeats = !!heatManagement?.heats && Array.isArray(heatManagement.heats) && heatManagement.heats.length > 0;
        const hasSHRSRounds = !!heatManagement?.rounds && Array.isArray(heatManagement.rounds) && heatManagement.rounds.length > 0;
        const isHeatManagement = hasLegacyHeats || hasSHRSRounds;

        let displayHeatLabel: string | null = null;
        let displayRoundNumber: number | null = null;
        let heatSkipperIndices: number[] | null = null;

        if (hasSHRSRounds) {
          const activeRoundNum = heatManagement.currentRound || 1;
          const activeHeatDesig = heatManagement.currentHeat || 'A';
          displayRoundNumber = activeRoundNum;

          const activeRound = heatManagement.rounds.find((r: any) => r.round === activeRoundNum) || heatManagement.rounds[0];

          if (activeRound?.heatAssignments && Array.isArray(activeRound.heatAssignments)) {
            const activeAssignment = activeRound.heatAssignments.find((ha: any) => ha.heatDesignation === activeHeatDesig);
            if (activeAssignment?.skipperIndices) {
              heatSkipperIndices = activeAssignment.skipperIndices;
              displayHeatLabel = `Qualifying Rd ${activeRoundNum} - Heat ${activeHeatDesig}`;
            }
          }

          console.log('[Overlay Debug] SHRS format: round', activeRoundNum, 'heat', activeHeatDesig, 'indices:', heatSkipperIndices?.length);
        } else if (hasLegacyHeats) {
          let currentHeat: any = null;
          if (quickRaces.current_day) {
            currentHeat = heatManagement.heats.find((h: any) => h.heat_number === quickRaces.current_day);
          }
          if (!currentHeat) {
            currentHeat = heatManagement.heats.find((h: any) => !h.completed);
          }
          if (!currentHeat) {
            currentHeat = heatManagement.heats[0];
          }

          if (currentHeat) {
            displayHeatLabel = `Heat ${currentHeat.heat_number}`;
            displayRoundNumber = currentHeat.heat_number;

            if (currentHeat.skippers && Array.isArray(currentHeat.skippers) && currentHeat.skippers.length > 0) {
              const heatSkipperSet = new Set(
                currentHeat.skippers.map((hs: any) => String(hs.sailNo || hs.sail_number || '').trim())
              );
              const filtered = allSkippers.filter((skipper: any) => {
                const sailNum = String(skipper.sail_number || skipper.sailNo || '').trim();
                return heatSkipperSet.has(sailNum);
              });
              if (filtered.length > 0) {
                allSkippers = filtered;
              }
            }
          }
        }

        if (hasSHRSRounds && heatSkipperIndices && heatSkipperIndices.length > 0) {
          const skippersArray = quickRaces.skippers as any[];
          if (skippersArray && Array.isArray(skippersArray)) {
            const heatSkippers = heatSkipperIndices
              .filter((idx: number) => idx >= 0 && idx < skippersArray.length)
              .map((idx: number, pos: number) => {
                const skipper = skippersArray[idx];
                return {
                  id: idx,
                  skipperIndex: idx,
                  skipper_name: skipper.name || skipper.skipper_name,
                  sail_number: skipper.sailNo || skipper.sail_number,
                  sailNo: skipper.sailNo,
                  hull: skipper.hull || skipper.boatModel,
                  boatModel: skipper.boatModel || skipper.hull,
                  position: null,
                  score: null,
                };
              });

            if (heatSkippers.length > 0) {
              allSkippers = heatSkippers;
            }
          }
          console.log('[Overlay Debug] SHRS filtered to', allSkippers.length, 'skippers');
        }

        // Finishers in the race being sailed (and the last race's results, for the results card)
        const lastCompleted = Number(quickRaces.last_completed_race) || 0;
        const resultsForRace = (raceNo: number) => {
          const map = new Map<number, { position: number | null; letter: string | null }>();
          if (!Array.isArray(quickRaces.race_results)) return map;
          (quickRaces.race_results as any[]).forEach((r: any) => {
            if (!r || r.race !== raceNo || typeof r.skipperIndex !== 'number') return;
            const pos = typeof r.position === 'number' && r.position > 0 ? r.position : null;
            const letter = r.letterScore || r.letter_score || null;
            if (pos !== null || letter) map.set(r.skipperIndex, { position: pos, letter });
          });
          return map;
        };
        if (!isHeatManagement) {
          const finishes = resultsForRace(lastCompleted + 1);
          allSkippers = allSkippers.map((sk: any) => ({
            ...sk,
            racePosition: typeof sk.skipperIndex === 'number' ? (finishes.get(sk.skipperIndex)?.position ?? null) : null,
          }));
          const last = resultsForRace(lastCompleted);
          lastRaceResultsRef.current = lastCompleted > 0 ? {
            race: lastCompleted,
            rows: allSkippers
              .map((sk: any) => ({ sk, r: typeof sk.skipperIndex === 'number' ? last.get(sk.skipperIndex) : undefined }))
              .filter((x: any) => x.r && x.r.position)
              .sort((a: any, b: any) => a.r.position - b.r.position)
              .map((x: any) => ({ position: x.r.position, sail: x.sk.sail_number || x.sk.sailNo || '', name: x.sk.skipper_name || '', hull: x.sk.hull || x.sk.boatModel || '' })),
          } : null;
          // A newly scored race shows its results for 20 seconds
          if (prevCompletedRef.current !== null && lastCompleted > prevCompletedRef.current && lastRaceResultsRef.current?.rows.length) {
            setResultsUntil(Date.now() + 20000);
          }
          prevCompletedRef.current = lastCompleted;
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

        const currentRaceNumber = isHeatManagement
          ? (displayRoundNumber || 1)
          : ((quickRaces.last_completed_race || 0) + 1);

        setLiveTrackingData((prev: any) => ({
          ...prev,
          race_type: isHeatManagement ? 'heat' : 'fleet',
          heat_label: displayHeatLabel || null,
          heat_number: displayRoundNumber || null,
          race_number: currentRaceNumber,
          event_name: eventData?.event_name || quickRaces.event_name,
          event_id: session.event_id,
          status: raceStatusData?.status || raceStatus,
          status_notes: raceStatusData?.notes || null,
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

  // Results scene: bring the last scored race's results back for 20 seconds
  useEffect(() => {
    if (resultsTrigger > 0 && lastRaceResultsRef.current?.rows.length) {
      setResultsUntil(Date.now() + 20000);
    }
  }, [resultsTrigger]);

  const scoringKey = displayData?.status
    ? `${describeScoring(displayData, session.heat_number).race}|${displayData.status}|${lastRaceResultsRef.current?.rows.length ? 1 : 0}`
    : '';
  useEffect(() => {
    if (!onScoring) return;
    if (!scoringKey) { onScoring(null); return; }
    const d = describeScoring(displayData, session.heat_number);
    onScoring({ race: d.race, status: d.raw, label: d.label, hasResults: !!lastRaceResultsRef.current?.rows.length });
  }, [scoringKey]);

  if (!session.enable_overlays) {
    return null;
  }


  // Fleet list and race bar (livestream board "Overlay pack")
  const fleetOpacity = Math.min(0.9, Math.max(0.25, Number(config.fleetOpacity ?? 0.58)));
  const fleetRows = [...(displaySkippers || [])].sort((a: any, b: any) => {
    const pa = a.racePosition ?? null, pb = b.racePosition ?? null;
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });
  const finishedCount = fleetRows.filter((s: any) => s.racePosition).length;
  const compactFleet = fleetRows.length > 14;
  const fleetMax = 22;
  const scoringNow = describeScoring(displayData, session.heat_number);
  const raceWord = scoringNow.race.toUpperCase();
  const fleetHeading = `${raceWord} · ${fleetRows.length} BOATS`;
  const rawStatus = scoringNow.raw;
  const isOnHold = rawStatus === 'on_hold';
  const statusLabel = scoringNow.label;
  const statusTone = scoringNow.tone;
  const showResults = resultsUntil > currentTime.getTime();
  // The stream capture can't ellipsize, so long names are shortened up front
  const clip = (text: string, max: number) => (text && text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  const isDone = rawStatus === 'completed_for_day' || rawStatus === 'event_complete';
  const eventTitle = String(displayData?.event_name || session.title || '')
    .replace(/\s*[-–|·]\s*live coverage\s*$/i, '').trim();
  // "Series - 2026 - Round 9" → title "Series - 2026", "Round 9" beside the race
  const roundMatch = eventTitle.match(/^(.*?)\s*[-–|·]\s*((?:round|rd|day|regatta day)\s*\d+)\s*$/i);
  const eventMain = roundMatch ? roundMatch[1] : eventTitle;
  const eventRound = roundMatch ? roundMatch[2].replace(/^rd\b/i, 'Round') : null;
  const clockLabel = (() => {
    try { return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }); }
    catch { return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  })();

  return (
    <div ref={ref} className="alv-ov absolute inset-0 pointer-events-none z-10">

      {/* Fleet list (livestream board "Overlay pack"): every boat in the race, see-through,
          finishers move to the top in finishing order */}
      {config.showSkippers && fleetRows.length > 0 && (
        <div className="alv-ov-glass alv-ov-fleet" style={{ background: `rgba(6,11,22,${fleetOpacity})` }}>
          <div className="alv-ov-fleet-head">
            <span>{fleetHeading}</span>
            {finishedCount > 0 && <span className="in">{finishedCount} IN</span>}
          </div>
          {fleetRows.slice(0, fleetMax).map((sk: any, i: number) => (
            <div key={`${sk.skipperIndex ?? sk.id ?? i}`} className={`alv-ov-row ${sk.racePosition ? 'done' : ''} ${compactFleet ? 'compact' : ''}`}>
              <span className="p">{sk.racePosition ?? '–'}</span>
              <span className="s">{sk.sail_number || sk.sailNo || ''}</span>
              <span className="n">{clip(sk.skipper_name || sk.name || '', 20)}</span>
              <span className="t">{clip(sk.hull || sk.boatModel || '', 12)}</span>
            </div>
          ))}
          {fleetRows.length > fleetMax && <div className="alv-ov-more">+{fleetRows.length - fleetMax} more</div>}
        </div>
      )}

      {/* Hold and end-of-day screens: full screen over the venue photo */}
      {(isOnHold || isDone) && !titleCardVisible && (
        <BroadcastScreen
          variant={isOnHold ? 'hold' : 'done'}
          venueImage={venueImage}
          hostClubName={hostClubName}
          hostClubLogo={hostClubLogo}
          chip={isOnHold ? 'Racing on hold' : 'Racing complete'}
          eyebrow={[eventTitle, venueName].filter(Boolean).join(' · ')}
          title={isOnHold
            ? (displayData?.status_notes || 'Racing will resume shortly')
            : (rawStatus === 'completed_for_day' ? "That's racing for today" : 'Thanks for watching')}
          badgeLead={isOnHold ? 'Up next' : undefined}
          badges={isOnHold ? [eventRound, scoringNow.race] : [eventRound]}
          meta={isOnHold ? [clockLabel] : ['Race videos are on AlfieTV and YouTube', clockLabel]}
          results={lastRaceResultsRef.current && lastRaceResultsRef.current.rows.length > 0 ? lastRaceResultsRef.current : null}
          clip={clip}
        />
      )}

      {/* Results card: shown for 20 seconds when a race is scored */}
      {showResults && config.showStandings !== false && lastRaceResultsRef.current && (
        <div className="alv-ov-glass alv-ov-results" style={{ background: `rgba(6,11,22,${Math.min(0.88, fleetOpacity + 0.2)})` }}>
          <div className="h">Race {lastRaceResultsRef.current.race} results</div>
          {lastRaceResultsRef.current.rows.slice(0, 8).map((r) => (
            <div key={`${r.position}-${r.sail}`} className="alv-ov-res">
              <span className="p">{r.position}</span>
              <span className="s">{r.sail}</span>
              <span className="n">{clip(r.name, 24)}{r.hull ? <span className="t"> · {clip(r.hull, 14)}</span> : null}</span>
            </div>
          ))}
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

      {/* Race bar */}
      <div className="alv-ov-glass alv-ov-bar" style={{ background: `rgba(6,11,22,${Math.min(0.85, fleetOpacity + 0.12)})` }}>
        {config.showHeatNumber && (displayData || session.heat_number) && (
          <span className="race">
            {displayData?.heat_label || (
              `${displayData?.race_type === 'heat' ? 'Heat' : 'Race'} ${displayData?.heat_number || displayData?.race_number || session.heat_number || '1'}`
            )}
          </span>
        )}
        {statusLabel && (
          <span className={`status ${statusTone}`}><span className="dot" />{statusLabel}</span>
        )}
        <span className="clock">{(() => {
          try { return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }); }
          catch { return currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
        })()}</span>
        {config.showWeather && weatherData?.windSpeed ? (
          <span className="wind">Wind {weatherData.windDirection ? `${weatherData.windDirection}° ` : ''}{weatherData.windSpeed} kn</span>
        ) : null}
        {displayData?.event_name && <span className="event">{displayData.event_name}</span>}
        <span className="brand">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 129.43 201.4" aria-hidden="true">
            <path fill="#2A93FF" d="M92.63.1s-33.4,35.9-46.9,76.9-18,123-18,123c53.9-26.1,87.1-5.1,101.7,1.4C76.03,145.2,92.63,0,92.63,0v.1Z"/>
            <path fill="#0A78F0" d="M45.43,35.4s-23.9,31.1-37.4,61.2-5.9,88.2-5.9,88.2c22.2-23.9,68.8-19.1,68.8-19.1C33.83,122.7,45.33,35.4,45.33,35.4h.1Z"/>
          </svg>
          Alfie<b>PRO</b>
        </span>
      </div>

      {titleCardVisible && (
        <BroadcastScreen
          variant="intro"
          opacity={titleCardPhase === 'visible' ? 1 : 0}
          venueImage={venueImage}
          hostClubName={hostClubName}
          hostClubLogo={hostClubLogo}
          chip="Live"
          eyebrow={[new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), venueName].filter(Boolean).join(' · ')}
          title={eventMain || 'Live race broadcast'}
          badges={[eventRound, scoringNow.race]}
          clip={clip}
        />
      )}

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

/**
 * Full-screen broadcast card: intro (going live / new race), racing on hold, racing complete.
 * The venue photo fills the frame under a left-weighted scrim; the host club leads (top left),
 * the event sits lower left, AlfiePRO is a small mark bottom right. Sized in cqw so it scales
 * with the program frame and is captured into the stream as drawn.
 */
export function BroadcastScreen({
  variant, opacity = 1, venueImage, hostClubName, hostClubLogo, chip, eyebrow, title, badges = [], badgeLead, meta = [], results, clip,
}: {
  variant: 'intro' | 'hold' | 'done';
  opacity?: number;
  venueImage?: string;
  hostClubName?: string;
  hostClubLogo?: string;
  chip: string;
  eyebrow?: string;
  title: string;
  /** Round, race and heat, each in its own badge (always in that order) */
  badges?: string[];
  /** Small plain label before the badges, e.g. "Up next" */
  badgeLead?: string;
  /** Plain text after the badges (time, notes) */
  meta?: string[];
  results?: { race: number; rows: Array<{ position: number; sail: string; name: string; hull: string }> } | null;
  clip: (text: string, max: number) => string;
}) {
  const ordered = orderBadges(badges);
  return (
    <div className={`alv-ov-screen is-${variant}`} style={{ opacity }}>
      <div className="bg" style={venueImage ? { backgroundImage: `url("${venueImage}")` } : undefined} />
      <div className="scrim" />

      <div className="top">
        {(hostClubName || hostClubLogo) && (
          <span className="host">
            {hostClubLogo && <span className="logo" style={{ backgroundImage: `url("${hostClubLogo}")` }} />}
            {hostClubName && <span className="name">{clip(hostClubName, 44)}</span>}
          </span>
        )}
        <span className={`chip is-${variant}`}><span className="dot" /><span className="tx">{chip}</span></span>
      </div>

      <div className="body">
        {eyebrow && <span className="eyebrow">{clip(eyebrow, 90)}</span>}
        <span className="rule" />
        <h1>{clip(title, 80)}</h1>
        {(ordered.length > 0 || meta.length > 0) && (
          <div className="meta">
            {badgeLead && ordered.length > 0 && <span className="lead">{badgeLead}</span>}
            {ordered.map(b => (
              <span key={b} className={`badge ${badgeTone(b)}`}><span className="tx">{b}</span></span>
            ))}
            {meta.map((m, i) => <span key={i} className="m">{m}</span>)}
          </div>
        )}
      </div>

      {variant === 'hold' && results && (
        <div className="results">
          <div className="h">Race {results.race} results</div>
          {results.rows.slice(0, 6).map(r => (
            <div key={`${r.position}-${r.sail}`} className="r">
              <span className="p">{r.position}</span>
              <span className="s">{r.sail}</span>
              <span className="n">{clip(r.name, 22)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="brand">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 129.43 201.4" aria-hidden="true">
          <path fill="#2A93FF" d="M92.63.1s-33.4,35.9-46.9,76.9-18,123-18,123c53.9-26.1,87.1-5.1,101.7,1.4C76.03,145.2,92.63,0,92.63,0v.1Z"/>
          <path fill="#0A78F0" d="M45.43,35.4s-23.9,31.1-37.4,61.2-5.9,88.2-5.9,88.2c22.2-23.9,68.8-19.1,68.8-19.1C33.83,122.7,45.33,35.4,45.33,35.4h.1Z"/>
        </svg>
        <span className="w">Alfie<b>PRO</b></span>
        <span className="t">Live race broadcast</span>
      </div>
    </div>
  );
}

const badgeRank = (label: string) =>
  /\b(round|rd|day)\b/i.test(label) && !/^(race|heat)\b/i.test(label) ? 0 : /^race\b/i.test(label) ? 1 : /^heat\b/i.test(label) ? 2 : 3;
const badgeTone = (label: string) =>
  ['is-round', 'is-race', 'is-heat', 'is-other'][badgeRank(label)];
/** "Round 9", "Race 5", "Heat A": split combined labels ("Round 2 · Heat A") and order Round → Race → Heat */
export function orderBadges(labels: Array<string | null | undefined>): string[] {
  const parts = labels
    .flatMap(l => String(l || '').split(/\s*[·|-]\s*(?=(?:round|rd|race|heat|day)\b)/i))
    .map(l => l.trim().replace(/\brd\b/i, 'Round'))
    .filter(Boolean);
  const seen = new Set<string>();
  return parts
    .filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => badgeRank(a) - badgeRank(b));
}
