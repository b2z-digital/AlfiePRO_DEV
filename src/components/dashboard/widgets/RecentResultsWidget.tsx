import React, { useState, useEffect } from 'react';
import { TrendingUp, MapPin, X, Trophy, ChevronRight, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { getStoredRaceEvents, getStoredRaceSeries } from '../../../utils/raceStorage';
import { calculateEventStandings } from '../../../utils/standingsCalculator';
import { getBoatClassBadge, getRaceFormatBadge } from '../../../constants/colors';

const BOAT_CLASS_IMAGES: { keywords: string[]; image: string }[] = [
  { keywords: ['ten rater', '10 rater', '10r', '10-r'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693386070-10r31_orig.jpg' },
  { keywords: ['international one metre', 'iom', 'one metre'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693863856-IOM-Europeans-Spain-2023-Torrevieja-starting-upwind-1.jpg' },
  { keywords: ['dragonflite 95', 'dragon force 95', 'df95', 'df-95'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694881094-P1060377.jpg' },
  { keywords: ['dragon force 65', 'dragonflite 65', 'df65', 'df-65'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694758064-DF65.jpeg' },
  { keywords: ['marblehead', 'm class'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693804892-M%20Page%20Image.jpg' },
  { keywords: ['a class', 'a-class'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761693570342-A%20Class%20Start%202.jpg' },
  { keywords: ['rc laser', 'rclaser'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694396750-Dobroyd-RC-lasers-close-racing.jpg' },
  { keywords: ['ec12', 'east coast 12', 'east coast twelve'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761695045578-EC12-Nats.jpg' },
  { keywords: ['soling', 's1m', 'soling one meter'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761694977244-Soling-Nationals-start.jpg' },
  { keywords: ['wind warrior'], image: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/boat-classes/65e9acf7-acff-4071-83a1-487dd130d318/1761695142975-Large_IMG_673320110902%20at%20162351.jpg' },
];

function getBoatClassImage(boatClass: string | null | undefined): string | null {
  if (!boatClass) return null;
  const lower = boatClass.toLowerCase();
  for (const entry of BOAT_CLASS_IMAGES) {
    if (entry.keywords.some(kw => lower.includes(kw))) return entry.image;
  }
  return null;
}

interface RaceResult {
  id: string;
  eventName: string;
  date: string;
  venue: string;
  raceClass: string;
  raceFormat?: string;
  completed: boolean;
  isSeriesEvent?: boolean;
  isNationalEvent?: boolean;
  isStateEvent?: boolean;
  stateAssociationName?: string;
  externalEventId?: string;
  seriesId?: string;
  roundIndex?: number;
  venueImage?: string;
  boatClassImage?: string;
  topThree?: Array<{ name: string; avatarUrl?: string; position: number }>;
}

export const RecentResultsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [recentResults, setRecentResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchRecentResults();
  }, [currentClub, currentOrganization]);

  const fetchRecentResults = async () => {
    if ((!currentClub?.clubId && !currentOrganization?.id) || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      let allRecent: any[] = [];

      // For associations, fetch completed public events
      if (currentOrganization) {
        const { data: completedEvents, error } = await supabase
          .from('public_events')
          .select('*')
          .lt('date', todayISO)
          .eq('approval_status', 'approved')
          .order('date', { ascending: false })
          .limit(4);

        if (error) throw error;

        allRecent = (completedEvents || []).map(event => ({
          id: event.id,
          eventName: event.event_name,
          date: event.date,
          venue: event.venue || '',
          raceClass: event.race_class || '',
          raceFormat: event.race_format,
          completed: true,
          skippers: [],
          raceResults: []
        }));
      } else {
        // For clubs, fetch club events
        // Fetch all race events and series
        const raceEvents = await getStoredRaceEvents();
        const raceSeries = await getStoredRaceSeries();

        // Get completed quick races
        const recentQuickRaces = raceEvents
          .filter(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate < today && event.completed;
          })
          .map(event => ({
            id: event.id,
            eventName: event.eventName,
            date: event.date,
            venue: event.venue,
            raceClass: event.raceClass,
            raceFormat: event.raceFormat,
            completed: event.completed,
            skippers: event.skippers,
            raceResults: event.raceResults,
            overallResults: event.overallResults
          }));

        // Get completed series rounds
        const recentSeriesEvents: any[] = [];
        raceSeries.forEach(series => {
          series.rounds.forEach((round: any, roundIndex: number) => {
            const roundDate = new Date(round.date);
            roundDate.setHours(0, 0, 0, 0);
            if (roundDate < today && round.completed) {
              // Get skippers from round first, then series, or extract from round results if both are empty
              let skippers = round.skippers || series.skippers || [];
              if (skippers.length === 0 && round.results && round.results.length > 0) {
                // Extract unique skippers from round results
                const skipperNames = new Set<string>();
                round.results.forEach((race: any) => {
                  if (race.results) {
                    Object.keys(race.results).forEach(name => skipperNames.add(name));
                  }
                });
                skippers = Array.from(skipperNames).map(name => ({ name }));
              }

              recentSeriesEvents.push({
                id: `${series.id}-round-${roundIndex}`,
                seriesId: series.id,
                roundIndex,
                eventName: `${round.name} - ${series.seriesName}`,
                date: round.date,
                venue: round.venue,
                raceClass: series.raceClass,
                raceFormat: series.raceFormat,
                completed: round.completed,
                isSeriesEvent: true,
                skippers,
                raceResults: round.raceResults || round.results || round.races || []
              });
            }
          });
        });

        allRecent = [...recentQuickRaces, ...recentSeriesEvents]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }

      // Fetch national + state events and merge them in
      try {
        let stateAssociationId: string | null = null;
        let stateAssocName: string | null = null;
        if (currentClub?.clubId) {
          const { data: saLink } = await supabase
            .from('state_association_clubs')
            .select('state_association_id, state_associations(name, abbreviation)')
            .eq('club_id', currentClub.clubId)
            .eq('is_active', true)
            .maybeSingle();
          if (saLink) {
            stateAssociationId = saLink.state_association_id;
            const sa = saLink.state_associations as any;
            if (sa) stateAssocName = sa.abbreviation || sa.name;
          }
        }

        const categoriesToFetch = ['national'];
        if (stateAssociationId) {
          categoriesToFetch.push(`state_${stateAssociationId}`);
        }

        const { data: externalEvents } = await supabase
          .from('external_result_events')
          .select('id, event_name, event_date, venue, boat_class_raw, boat_class_mapped, results_json, competitor_count, display_category, source_url')
          .eq('is_visible', true)
          .in('display_category', categoriesToFetch)
          .not('event_date', 'is', null)
          .order('event_date', { ascending: false })
          .limit(8);

        if (externalEvents && externalEvents.length > 0) {
          const externalResults = externalEvents.map(ev => {
            const boatClass = ev.boat_class_mapped || ev.boat_class_raw || '';
            const isState = ev.display_category !== 'national';
            const topThree: Array<{ name: string; avatarUrl?: string; position: number }> = [];
            if (ev.results_json && Array.isArray(ev.results_json) && ev.results_json.length > 0) {
              ev.results_json
                .filter((r: any) => r.position && r.name)
                .sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
                .slice(0, 3)
                .forEach((r: any) => {
                  topThree.push({ name: r.name, position: r.position });
                });
            }
            const sourceUrl = (ev as any).source_url || '';
            const eventIdMatch = sourceUrl.match?.(/[?&]eventid=(\d+)/i);
            return {
              id: `${isState ? 'state' : 'national'}-${ev.id}`,
              externalEventId: ev.id,
              eventName: ev.event_name,
              date: ev.event_date!,
              venue: ev.venue || '',
              raceClass: boatClass,
              completed: true,
              isNationalEvent: !isState,
              isStateEvent: isState,
              stateAssociationName: isState ? (stateAssocName || undefined) : undefined,
              boatClassImage: getBoatClassImage(boatClass),
              topThree,
              _msrEventId: eventIdMatch ? eventIdMatch[1] : null,
              _sourceUrl: sourceUrl,
            };
          });

          allRecent = [...allRecent, ...externalResults]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      } catch (err) {
        console.error('Error fetching external events for recent results:', err);
      }

      allRecent = allRecent.slice(0, 4);

      // Fetch venue images
      const venueNames = [...new Set(allRecent.map(e => e.venue).filter(Boolean))];
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

          allRecent = allRecent.map(event => ({
            ...event,
            venueImage: event.venue ? venueImages[event.venue] : undefined
          }));
        } catch (error) {
          console.error('Error fetching venue images for recent results:', error);
        }
      }

      // Enrich skippers with avatar URLs from members table
      if (currentClub?.clubId) {
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

            allRecent = allRecent.map(event => {
              if (event.topThree && event.topThree.length > 0) return event;

              const topThree: Array<{ name: string; avatarUrl?: string; position: number }> = [];

              if (event.skippers && event.raceResults && event.raceResults.length > 0) {
                try {
                  let standings;

                  if (event.isSeriesEvent) {
                    // For series rounds, calculate standings from the round's results
                    standings = calculateEventStandings({
                      ...event,
                      races: event.raceResults // Series rounds store races in raceResults
                    });
                  } else {
                    // For single events, use event directly
                    standings = calculateEventStandings({
                      ...event,
                      races: event.raceResults || event.races
                    });
                  }

                  // Get top 3 from standings
                  if (standings && standings.length > 0) {
                    standings.slice(0, 3).forEach((standing, idx) => {
                      topThree.push({
                        name: standing.name,
                        avatarUrl: memberAvatarMap[standing.name],
                        position: idx + 1
                      });
                    });
                  }
                } catch (error) {
                  console.error('Error calculating standings for event:', event.eventName, error);
                }
              } else if (event.isSeriesEvent) {
                console.log('Series round missing data:', {
                  eventName: event.eventName,
                  hasSkippers: !!event.skippers,
                  skippersCount: event.skippers?.length,
                  hasRaceResults: !!event.raceResults,
                  raceResultsLength: event.raceResults?.length
                });
              }

              return { ...event, topThree };
            });
          }
        } catch (error) {
          console.error('Error fetching member avatars for recent results:', error);
        }
      }

      setRecentResults(allRecent);

      const eventsNeedingTop3 = allRecent.filter(
        (e: any) => (e.isNationalEvent || e.isStateEvent) && (!e.topThree || e.topThree.length === 0) && e._msrEventId
      );
      if (eventsNeedingTop3.length > 0) {
        fetchMsrTopThree(eventsNeedingTop3, allRecent);
      }
    } catch (error) {
      console.error('Error loading recent results:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMsrTopThree = async (eventsToFetch: any[], allResults: any[]) => {
    const updates: Record<string, Array<{ name: string; position: number }>> = {};
    const dbUpdates: Array<{ id: string; results_json: any[]; competitor_count: number; race_count: number }> = [];

    await Promise.all(eventsToFetch.map(async (ev) => {
      try {
        const apiUrl = `https://mysailingresults.com/api/results/get_results.php?eventid=${ev._msrEventId}`;
        const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return;
        const data = await resp.json();
        const competitors = data.results || [];
        if (!competitors.length) return;

        const top3 = competitors
          .sort((a: any, b: any) => (a.comppos || 999) - (b.comppos || 999))
          .slice(0, 3)
          .map((c: any) => ({ name: c.compname || '', position: c.comppos }));

        updates[ev.id] = top3;

        const raceKeys = Object.keys(competitors[0]?.results || {}).filter((k: string) => /^r\d+$/i.test(k));
        const parsedResults = competitors.map((c: any) => {
          const races = raceKeys.sort((a: string, b: string) => parseInt(a.slice(1)) - parseInt(b.slice(1))).map((rk: string) => {
            const raw = c.results?.[rk] ?? null;
            if (!raw || raw === '-') return null;
            const d = raw.match(/^\((.+)\)$/);
            return d ? d[1] : raw;
          });
          return {
            position: c.comppos,
            name: c.compname || '',
            club: c.compclubname || '',
            sailNo: c.compsailno || '',
            boatDesign: c.compboatdesign || '',
            nett: c.nettScore ? parseFloat(c.nettScore) || null : null,
            total: c.grossScore ? parseFloat(c.grossScore) || null : null,
            races,
            isDiscard: raceKeys.map((rk: string) => /^\(/.test(c.results?.[rk] || '')),
          };
        });

        dbUpdates.push({
          id: ev.externalEventId,
          results_json: parsedResults,
          competitor_count: competitors.length,
          race_count: raceKeys.length,
        });
      } catch {
        // Silently skip failed fetches
      }
    }));

    if (Object.keys(updates).length > 0) {
      setRecentResults(prev => prev.map(r => updates[r.id] ? { ...r, topThree: updates[r.id] } : r));
    }

    for (const upd of dbUpdates) {
      supabase.from('external_result_events').update({
        results_json: upd.results_json,
        competitor_count: upd.competitor_count,
        race_count: upd.race_count,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', upd.id).then(() => {});
    }
  };

  const getPodiumColor = (position: number) => {
    switch (position) {
      case 1: return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
      case 2: return 'bg-slate-400/20 border-slate-400/50 text-slate-300';
      case 3: return 'bg-orange-600/20 border-orange-600/50 text-orange-400';
      default: return 'bg-slate-700/20 border-slate-600/50 text-slate-400';
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
          <TrendingUp className="text-green-400" size={20} />
          <h2 className="text-lg font-semibold text-white">Recent Results</h2>
        </div>
        {!isEditMode && (
          <button
            onClick={() => navigate('/results')}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            View all
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
        </div>
      ) : recentResults.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="mx-auto mb-4 text-slate-500" size={48} />
          <p className="text-slate-400">No recent results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recentResults.map((race) => (
            <div
              key={race.id}
              onClick={() => {
                if (isEditMode) return;
                if (race.isNationalEvent || race.isStateEvent) {
                  navigate('/results', { state: { mainTab: race.isStateEvent ? 'state' : 'national', externalEventId: race.externalEventId } });
                } else {
                  navigate('/results', { state: { eventId: race.id, isSeriesEvent: race.isSeriesEvent, seriesId: race.seriesId, roundIndex: race.roundIndex } });
                }
              }}
              className={`
                group relative overflow-hidden rounded-xl border transition-all duration-300
                ${isEditMode ? 'pointer-events-none' : 'hover:shadow-xl hover:scale-[1.02] cursor-pointer'}
                bg-slate-800/50 border-slate-700/50 hover:border-slate-600
              `}
            >
              <div className="flex h-32">
                <div className="relative w-32 h-32 flex-shrink-0 overflow-hidden">
                  {(race.isNationalEvent || race.isStateEvent) ? (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: race.boatClassImage ? `url(${race.boatClassImage})` : 'url(https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=400)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0 bg-gradient-to-br from-green-500 to-green-600"
                      style={{
                        backgroundImage: race.venueImage ? `url(${race.venueImage})` : 'url(https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=400)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    </div>
                  )}
                  <div className={`absolute top-0 right-0 bottom-0 w-0.5 bg-gradient-to-b ${race.isNationalEvent ? 'from-amber-400 via-amber-500 to-amber-400' : race.isStateEvent ? 'from-green-400 via-green-500 to-green-400' : 'from-green-400 via-green-500 to-green-400'}`} />
                  {race.date && (
                    <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                      <div className="text-center">
                        <div className="text-xs font-semibold text-slate-900">{new Date(race.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
                        <div className="text-lg font-bold text-slate-900 leading-none">{new Date(race.date).getDate()}</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    {race.isNationalEvent ? (
                      <Globe size={20} className="text-amber-400 drop-shadow-lg" />
                    ) : race.isStateEvent ? (
                      <Globe size={20} className="text-green-400 drop-shadow-lg" />
                    ) : (
                      <Trophy size={20} className="text-yellow-400 drop-shadow-lg" />
                    )}
                  </div>
                </div>
                <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {race.eventName}
                    </h3>
                    <div className="flex items-center text-sm text-slate-400 mb-2">
                      {race.isNationalEvent ? (
                        <>
                          <Globe size={14} className="mr-1 text-amber-400" />
                          <span className="truncate text-amber-400/80">{race.venue || 'National Event'}</span>
                        </>
                      ) : race.isStateEvent ? (
                        <>
                          <Globe size={14} className="mr-1 text-green-400" />
                          <span className="truncate text-green-400/80">{race.venue || 'State Event'}</span>
                        </>
                      ) : (
                        <>
                          <MapPin size={14} className="mr-1" />
                          <span className="truncate">{race.venue}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {race.isNationalEvent && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          National
                        </span>
                      )}
                      {race.isStateEvent && (
                        <>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                            State
                          </span>
                          {race.stateAssociationName && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-green-300 border border-green-500/20">
                              {race.stateAssociationName}
                            </span>
                          )}
                        </>
                      )}
                      {!race.isNationalEvent && !race.isStateEvent && race.raceFormat && (
                        <span className={getRaceFormatBadge(race.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>
                          {race.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                        </span>
                      )}
                      {race.raceClass && (
                        <span className={getBoatClassBadge(race.raceClass, darkMode).className}>
                          {race.raceClass}
                        </span>
                      )}
                      {race.topThree && race.topThree.length > 0 && (
                        <div className="flex items-center gap-1">
                          {race.topThree.map((winner, idx) => (
                            <div
                              key={idx}
                              className="relative"
                              title={`${winner.position}. ${winner.name}`}
                            >
                              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center overflow-hidden ${getPodiumColor(winner.position)}`}>
                                {winner.avatarUrl ? (
                                  <img src={winner.avatarUrl} alt={winner.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                                    <span className="text-xs font-bold text-slate-300">{winner.name.charAt(0)}</span>
                                  </div>
                                )}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                winner.position === 1 ? 'bg-yellow-400 text-slate-900' :
                                winner.position === 2 ? 'bg-slate-300 text-slate-900' :
                                'bg-orange-600 text-white'
                              }`}>
                                {winner.position}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
