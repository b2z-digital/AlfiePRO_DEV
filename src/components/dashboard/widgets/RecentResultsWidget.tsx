import React, { useState, useEffect } from 'react';
import { TrendingUp, X, Trophy, ChevronRight, Globe } from 'lucide-react';
import { AlfieIcon } from '../../brand/AlfieIcon';

/* Board venue glyph (sail on water) for event places */
const MapPin = ({ size = 14, className }: { size?: number; className?: string }) => <AlfieIcon glyph="venue" size={size} strokeWidth={2} className={className} />;

/* Board level label bars: state = two of three, national = all three */
const LevelBars = ({ level }: { level: 'state' | 'national' }) => (
  <svg width="11" height="10" viewBox="0 0 11 10" aria-hidden="true"><rect x="0" y="6" width="2.5" height="4" rx="1" fill="currentColor" /><rect x="4.25" y="3" width="2.5" height="7" rx="1" fill="currentColor" /><rect x="8.5" y="0" width="2.5" height="10" rx="1" fill="currentColor" opacity={level === 'national' ? 1 : 0.3} /></svg>
);
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

                  if (standings && standings.length > 0) {
                    standings.slice(0, 3).forEach((standing, idx) => {
                      if (standing?.name) {
                        topThree.push({
                          name: standing.name,
                          avatarUrl: memberAvatarMap[standing.name],
                          position: idx + 1
                        });
                      }
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
        <div className="flex items-center gap-3">
          <span className="a-tile" style={{ width: 36, height: 36 }}><AlfieIcon glyph="podium" size={19} /></span>
          <h2 className="a-display text-lg font-semibold text-white">Recent Results</h2>
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
        <div className="flex flex-col gap-4">
          {(() => {
            const FALLBACK = 'https://images.pexels.com/photos/163236/sailing-ship-vessel-boat-sea-163236.jpeg?auto=compress&cs=tinysrgb&w=400';
            const open = (race: RaceResult) => {
              if (isEditMode) return;
              if (race.isNationalEvent || race.isStateEvent) {
                navigate('/results', { state: { mainTab: race.isStateEvent ? 'state' : 'national', externalEventId: race.externalEventId } });
              } else {
                navigate('/results', { state: { eventId: race.id, isSeriesEvent: race.isSeriesEvent, seriesId: race.seriesId, roundIndex: race.roundIndex } });
              }
            };
            const initials = (n: string) => n.split(' ').filter(Boolean).map((p: string) => p.charAt(0).toUpperCase()).slice(0, 2).join('');
            const shortName = (n: string) => { const p = n.split(' ').filter(Boolean); return p.length > 1 ? `${p[0]} ${p[p.length - 1].charAt(0)}.` : n; };
            const face = (w: { name: string; avatarUrl?: string }) => (
              <span className="a-pl-face">{w.avatarUrl ? <img src={w.avatarUrl} alt={w.name} referrerPolicy="no-referrer" /> : initials(w.name)}</span>
            );
            const labels = (race: RaceResult) => (
              <>
                {race.isNationalEvent && <span className="a-wlvl a-wlvl-lv"><LevelBars level="national" />National</span>}
                {race.isStateEvent && <span className="a-wlvl a-wlvl-lv"><LevelBars level="state" />State{race.stateAssociationName ? ` · ${race.stateAssociationName}` : ''}</span>}
                {!race.isNationalEvent && !race.isStateEvent && race.raceFormat && (
                  <span className={getRaceFormatBadge(race.raceFormat === 'handicap' ? 'Handicap' : 'Scratch', darkMode).className}>
                    {race.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
                  </span>
                )}
                {race.raceClass && <span className={getBoatClassBadge(race.raceClass, darkMode).className}>{race.raceClass}</span>}
              </>
            );
            const hero = recentResults[0];
            const img = (hero.isNationalEvent || hero.isStateEvent) ? (hero.boatClassImage || FALLBACK) : (hero.venueImage || FALLBACK);
            const d = hero.date ? new Date(hero.date) : null;
            const podium = [2, 1, 3].map(pos => hero.topThree?.find(w => w.position === pos)).filter(Boolean) as NonNullable<RaceResult['topThree']>;
            return (
              <>
                <div onClick={() => open(hero)} className={`a-rh ${isEditMode ? 'pointer-events-none' : ''}`}>
                  <div className="a-rh-img" style={{ backgroundImage: `url(${img})` }}>
                    <span className="a-chrome-pill" style={{ left: 14, top: 14 }}>LATEST</span>
                    {d && (
                      <div className="a-sp-date" style={{ left: 14, bottom: 14, width: 52, height: 58 }}>
                        <b>{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</b><span>{d.getDate()}</span>
                      </div>
                    )}
                  </div>
                  <div className="a-rh-body flex-1 min-w-0 flex flex-col" style={{ padding: '18px 20px 0' }}>
                    <div className="flex gap-1.5 flex-wrap">{labels(hero)}</div>
                    <p className="a-display a-ink m-0 mt-2 text-[17px] font-semibold leading-[1.25] line-clamp-2">{hero.eventName}</p>
                    {hero.venue && <p className="a-ws" style={{ marginTop: 4 }}><MapPin size={13} className="flex-shrink-0" /><span>{hero.venue}</span></p>}
                    {podium.length > 0 ? (
                      <div className="mt-auto flex items-end justify-center gap-2 pt-3">
                        {podium.map(w => (
                          <div key={w.position} className="a-wstep" title={`${w.position}. ${w.name}`}>
                            <span className={`a-pl a-p${w.position}`} style={{ width: w.position === 1 ? 50 : 40, height: w.position === 1 ? 50 : 40 }}>{face(w)}</span>
                            <p className={w.position === 1 ? 'a-ink font-semibold' : ''}>{shortName(w.name)}</p>
                            <div className={`a-wblk a-wblk-${w.position}`}>{w.position}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="mt-auto pb-5 a-dim text-[12.5px]">Results not yet available</div>}
                  </div>
                </div>
                {recentResults.length > 1 && (
                  <div className="flex flex-col">
                    {recentResults.slice(1).map(race => {
                      const rd = race.date ? new Date(race.date) : null;
                      return (
                        <div key={race.id} onClick={() => open(race)} className={`a-wag a-wag-nt ${isEditMode ? 'pointer-events-none' : ''}`}>
                          {rd ? (
                            <div className="a-wagd">
                              <b>{rd.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</b>
                              <span>{rd.getDate()}</span>
                              <i>{rd.toLocaleDateString('en-US', { weekday: 'short' })}</i>
                            </div>
                          ) : <div />}
                          <div className="a-wdot" />
                          <div className="min-w-0">
                            <p className="a-wt">{race.eventName}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {labels(race)}
                              {(race.isNationalEvent || race.isStateEvent) && race.venue && <span className="a-txt-a text-[12px] ml-1 truncate">{race.venue}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {(race.topThree || []).map(w => (
                              <span key={w.position} className={`a-pl a-p${w.position}`} style={{ width: 30, height: 30 }} title={`${w.position}. ${w.name}`}>
                                {face(w)}<span className="a-pl-n">{w.position}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
