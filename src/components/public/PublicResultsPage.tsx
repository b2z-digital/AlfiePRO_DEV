import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Trophy } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { PublicFooter } from './PublicFooter';

interface DisplayResult {
  position: number;
  skipperName: string;
  sailNumber: string;
  points: number;
}

interface DisplayRace {
  raceNumber: number;
  label: string;
  results: DisplayResult[];
}

interface EventDisplay {
  name: string;
  date: string;
  venue: string;
  race_class: string;
  races: DisplayRace[];
}

export const PublicResultsPage: React.FC = () => {
  const { clubId: paramClubId, eventId } = useParams<{ clubId: string; eventId: string }>();
  const { clubId: contextClubId, buildPublicUrl } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [searchParams] = useSearchParams();
  const roundParam = searchParams.get('round');
  const [event, setEvent] = useState<EventDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState<string>('');

  useEffect(() => {
    loadEventData();
  }, [eventId, roundParam]);

  const loadEventData = async () => {
    if (!eventId || !clubId) return;

    try {
      setLoading(true);

      const { data: clubData } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .maybeSingle();

      if (clubData) {
        setClubName(clubData.name);
      }

      const { data: quickRaceData } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, race_results, skippers, num_races')
        .eq('id', eventId)
        .maybeSingle();

      if (quickRaceData) {
        const skippers = quickRaceData.skippers || [];
        const raceResults = quickRaceData.race_results || [];
        const numRaces = quickRaceData.num_races || 1;

        const races: DisplayRace[] = [];
        for (let raceNum = 1; raceNum <= numRaces; raceNum++) {
          const raceEntries = raceResults
            .filter((r: any) => r.race === raceNum)
            .sort((a: any, b: any) => (a.position || 999) - (b.position || 999));

          const results: DisplayResult[] = raceEntries.map((entry: any) => {
            const skipper = skippers[entry.skipperIndex] || {};
            return {
              position: entry.position || 0,
              skipperName: entry.skipperName || skipper.name || 'Unknown',
              sailNumber: entry.sailNumber || skipper.sailNo || '',
              points: entry.points ?? entry.position ?? 0
            };
          });

          if (results.length > 0) {
            races.push({
              raceNumber: raceNum,
              label: `Race ${raceNum}`,
              results
            });
          }
        }

        setEvent({
          name: quickRaceData.event_name || 'Race',
          date: quickRaceData.race_date,
          venue: quickRaceData.race_venue || '',
          race_class: quickRaceData.race_class || '',
          races
        });
      } else {
        const { data: seriesData } = await supabase
          .from('race_series')
          .select('id, series_name, created_at, race_class, rounds, skippers')
          .eq('id', eventId)
          .maybeSingle();

        if (seriesData) {
          const rounds = seriesData.rounds || [];
          const seriesSkippers = seriesData.skippers || [];
          const roundIndex = roundParam !== null ? parseInt(roundParam) : -1;

          if (roundIndex >= 0 && roundIndex < rounds.length) {
            const round = rounds[roundIndex];
            const roundSkippers = round.skippers || seriesSkippers;
            const roundResults = round.results || round.raceResults || round.races || [];

            const races: DisplayRace[] = [];

            if (Array.isArray(roundResults) && roundResults.length > 0) {
              const firstItem = roundResults[0];

              if (firstItem && typeof firstItem === 'object' && 'results' in firstItem) {
                roundResults.forEach((race: any, idx: number) => {
                  const raceResultEntries = race.results || {};
                  const results: DisplayResult[] = [];
                  let position = 1;

                  const entries = Object.entries(raceResultEntries)
                    .map(([name, data]: [string, any]) => ({
                      name,
                      position: data.position || data.pos || 999,
                      points: data.points ?? data.position ?? 0,
                      sailNo: data.sailNo || data.sailNumber || ''
                    }))
                    .sort((a, b) => a.position - b.position);

                  entries.forEach(entry => {
                    results.push({
                      position: entry.position || position++,
                      skipperName: entry.name,
                      sailNumber: entry.sailNo,
                      points: entry.points
                    });
                  });

                  if (results.length > 0) {
                    races.push({
                      raceNumber: idx + 1,
                      label: race.name || `Race ${idx + 1}`,
                      results
                    });
                  }
                });
              } else {
                const results: DisplayResult[] = roundResults
                  .filter((r: any) => r.position !== undefined || r.skipperIndex !== undefined)
                  .sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
                  .map((entry: any) => {
                    const skipper = roundSkippers[entry.skipperIndex] || {};
                    return {
                      position: entry.position || 0,
                      skipperName: entry.skipperName || skipper.name || 'Unknown',
                      sailNumber: entry.sailNumber || skipper.sailNo || '',
                      points: entry.points ?? entry.position ?? 0
                    };
                  });

                if (results.length > 0) {
                  races.push({
                    raceNumber: 1,
                    label: 'Results',
                    results
                  });
                }
              }
            }

            setEvent({
              name: `${round.name} - ${seriesData.series_name}`,
              date: round.date || seriesData.created_at,
              venue: round.venue || '',
              race_class: seriesData.race_class || '',
              races
            });
          } else {
            const seriesResults = seriesData.results || [];
            const races: DisplayRace[] = [];

            if (seriesResults.length > 0) {
              const results: DisplayResult[] = seriesResults
                .sort((a: any, b: any) => (a.position || 999) - (b.position || 999))
                .map((entry: any) => {
                  const skipper = seriesSkippers[entry.skipperIndex] || {};
                  return {
                    position: entry.position || 0,
                    skipperName: entry.skipperName || skipper.name || 'Unknown',
                    sailNumber: entry.sailNumber || skipper.sailNo || '',
                    points: entry.points ?? entry.position ?? 0
                  };
                });

              races.push({
                raceNumber: 1,
                label: 'Series Standings',
                results
              });
            }

            setEvent({
              name: seriesData.series_name,
              date: seriesData.created_at,
              venue: '',
              race_class: seriesData.race_class || '',
              races
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading event data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading results...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Event not found</p>
          <Link
            to={buildPublicUrl('/')}
            className="text-blue-600 hover:underline"
          >
            Back to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GoogleAnalytics measurementId={null} />
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link
            to={buildPublicUrl('/')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {clubName || 'Club Homepage'}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(event.date)}</span>
            </div>
            {event.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{event.venue}</span>
              </div>
            )}
            {event.race_class && (
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                <span>Class: {event.race_class}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {event.races && event.races.length > 0 ? (
          <div className="space-y-8">
            {event.races.map((race, index) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-gray-900 text-white px-6 py-4">
                  <h2 className="text-xl font-semibold">{race.label}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Position
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Skipper
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Sail Number
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {race.results.length > 0 ? (
                        race.results.map((result, resultIndex) => (
                          <tr key={resultIndex} className={result.position === 1 ? 'bg-yellow-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {result.position === 1 && (
                                  <Trophy className="w-4 h-4 text-yellow-600" />
                                )}
                                <span className="text-sm font-medium text-gray-900">
                                  {result.position}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{result.skipperName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600">{result.sailNumber}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{result.points}</div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                            No results recorded for this race
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">No race results available</p>
          </div>
        )}
      </main>

      <PublicFooter clubId={clubId} />
    </div>
  );
};
