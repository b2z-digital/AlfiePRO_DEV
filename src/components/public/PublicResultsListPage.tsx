import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, MapPin, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

interface ResultItem {
  id: string;
  name: string;
  date: string;
  venue: string;
  race_class: string;
  type: 'quick_race' | 'series_round';
  series_name?: string;
  winner: string;
  skipper_count: number;
}

export const PublicResultsListPage: React.FC = () => {
  const { clubId, buildPublicUrl } = usePublicNavigation();
  const [club, setClub] = useState<Club | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  useEffect(() => {
    if (clubId) loadData();
  }, [clubId]);

  const getWinnerName = (raceResults: any[], skippers: any[]): string => {
    if (!raceResults?.length || !skippers?.length) return 'No results';
    const skipperScores: Record<number, number> = {};
    raceResults.forEach((r: any) => {
      if (r.skipperIndex !== undefined && r.position) {
        skipperScores[r.skipperIndex] = (skipperScores[r.skipperIndex] || 0) + r.position;
      }
    });
    let lowestScore = Infinity;
    let winnerIdx = -1;
    Object.entries(skipperScores).forEach(([idx, score]) => {
      if (score < lowestScore) {
        lowestScore = score;
        winnerIdx = parseInt(idx);
      }
    });
    if (winnerIdx >= 0 && skippers[winnerIdx]) {
      return skippers[winnerIdx].name || 'Unknown';
    }
    return 'No results';
  };

  const loadData = async () => {
    if (!clubId) return;
    try {
      setLoading(true);

      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (clubData) setClub(clubData as any);

      const { data: quickRaces } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, race_results, skippers, completed')
        .eq('club_id', clubId)
        .eq('completed', true)
        .order('race_date', { ascending: false });

      const { data: seriesRounds } = await supabase
        .from('race_series_rounds')
        .select('id, round_name, date, venue, race_class, race_results, skippers, completed, race_series!inner(series_name)')
        .eq('club_id', clubId)
        .eq('completed', true)
        .order('date', { ascending: false });

      const quickRaceItems: ResultItem[] = (quickRaces || []).map((race: any) => ({
        id: race.id,
        name: race.event_name || `Race - ${race.race_class || 'Multi-Class'}`,
        date: race.race_date,
        venue: race.race_venue || '',
        race_class: race.race_class || '',
        type: 'quick_race' as const,
        winner: getWinnerName(race.race_results, race.skippers),
        skipper_count: race.skippers?.length || 0,
      }));

      const seriesRoundItems: ResultItem[] = (seriesRounds || []).map((round: any) => ({
        id: round.id,
        name: round.round_name,
        date: round.date,
        venue: round.venue || '',
        race_class: round.race_class || '',
        type: 'series_round' as const,
        series_name: round.race_series?.series_name || '',
        winner: getWinnerName(round.race_results, round.skippers),
        skipper_count: round.skippers?.length || 0,
      }));

      const allResults = [...quickRaceItems, ...seriesRoundItems];
      allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setResults(allResults);

      const classes = new Set<string>();
      allResults.forEach(r => { if (r.race_class) classes.add(r.race_class); });
      setAvailableClasses(Array.from(classes).sort());
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = classFilter === 'all'
    ? results
    : results.filter(r => r.race_class === classFilter);

  const groupedByYear = filteredResults.reduce<Record<string, ResultItem[]>>((acc, result) => {
    const year = new Date(result.date).getFullYear().toString();
    if (!acc[year]) acc[year] = [];
    acc[year].push(result);
    return acc;
  }, {});

  const sortedYears = Object.keys(groupedByYear).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className="min-h-screen bg-gray-50">
      <GoogleAnalytics measurementId={null} />
      <PublicHeader club={club} activePage="results" />

      <div className="pt-24">
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900">Race Results</h1>
            <p className="text-gray-600 mt-2">
              View all completed race results for {club?.name || 'the club'}
            </p>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {availableClasses.length > 1 && (
            <div className="flex items-center gap-3 mb-6">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Classes</option>
                {availableClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">
                {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-gray-600">Loading results...</div>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-20">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No completed race results yet</p>
            </div>
          ) : (
            <div className="space-y-8">
              {sortedYears.map(year => (
                <div key={year}>
                  <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">{year}</h2>
                  <div className="space-y-3">
                    {groupedByYear[year].map(result => (
                      <Link
                        key={result.id}
                        to={buildPublicUrl(`/results/${result.id}`)}
                        className="block bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {result.series_name && (
                                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                  {result.series_name}
                                </span>
                              )}
                              {result.race_class && (
                                <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                                  {result.race_class}
                                </span>
                              )}
                            </div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                              {result.series_name ? `${result.name} - ${result.series_name}` : result.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{formatDate(result.date)}</span>
                              </div>
                              {result.venue && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>{result.venue}</span>
                                </div>
                              )}
                              {result.skipper_count > 0 && (
                                <span>{result.skipper_count} competitors</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            {result.winner !== 'No results' && (
                              <div className="text-right">
                                <div className="text-xs text-gray-500">Winner</div>
                                <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                                  <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                                  {result.winner}
                                </div>
                              </div>
                            )}
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <PublicFooter clubId={clubId} />
    </div>
  );
};
