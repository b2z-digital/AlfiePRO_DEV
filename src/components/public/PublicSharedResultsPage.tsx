import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy, Calendar, Users, Sailboat, Clock } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

interface SharedResult {
  id: string;
  event_name: string;
  event_id: string;
  share_token: string;
  created_at: string;
}

interface RaceEventData {
  event_name: string;
  boat_class: string;
  race_format: string;
  scoring_type: string;
  skippers: any[];
  race_results: any;
  created_at: string;
  last_completed_race: number;
}

export const PublicSharedResultsPage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [sharedResult, setSharedResult] = useState<SharedResult | null>(null);
  const [eventData, setEventData] = useState<RaceEventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shareToken) loadSharedResults();
  }, [shareToken]);

  const loadSharedResults = async () => {
    try {
      const { data: shared, error: sharedError } = await supabase
        .from('shared_results')
        .select('*')
        .eq('share_token', shareToken)
        .maybeSingle();

      if (sharedError) throw sharedError;
      if (!shared) {
        setError('This shared link is invalid or has been removed.');
        setLoading(false);
        return;
      }

      setSharedResult(shared);

      // Increment view count
      await supabase.rpc('increment_shared_result_views', { p_share_token: shareToken });

      // Load event data
      const { data: event, error: eventError } = await supabase
        .from('quick_races')
        .select('event_name, boat_class, race_format, scoring_type, skippers, race_results, created_at, last_completed_race')
        .eq('id', shared.event_id)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!event) {
        setError('The event data for these results could not be found.');
        setLoading(false);
        return;
      }

      setEventData(event);
    } catch (err) {
      console.error('Error loading shared results:', err);
      setError('An error occurred while loading the results.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Results Not Available</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!eventData) return null;

  const skippers = Array.isArray(eventData.skippers) ? eventData.skippers : [];
  const raceResults = eventData.race_results || {};
  const totalRaces = eventData.last_completed_race || 0;

  // Calculate standings
  const standings = skippers.map((skipper: any, idx: number) => {
    let totalPoints = 0;
    let racesCompleted = 0;

    for (let r = 1; r <= totalRaces; r++) {
      const raceKey = `race_${r}`;
      const results = raceResults[raceKey];
      if (results && results[idx] !== undefined && results[idx] !== null) {
        const pts = typeof results[idx] === 'number' ? results[idx] : parseFloat(results[idx]);
        if (!isNaN(pts)) {
          totalPoints += pts;
          racesCompleted++;
        }
      }
    }

    return {
      ...skipper,
      index: idx,
      totalPoints,
      racesCompleted,
    };
  }).sort((a: any, b: any) => a.totalPoints - b.totalPoints);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto p-6 sm:p-8">
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-sky-500/20 rounded-lg flex items-center justify-center">
                <Trophy className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{eventData.event_name}</h1>
                <p className="text-sm text-slate-400">Shared Race Results</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-400">
              {eventData.boat_class && (
                <span className="flex items-center gap-1.5">
                  <Sailboat className="w-4 h-4" /> {eventData.boat_class}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> {skippers.length} skippers
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> {totalRaces} race{totalRaces !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> {formatDate(eventData.created_at)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Skipper</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Sail</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Club</th>
                  {Array.from({ length: totalRaces }, (_, i) => (
                    <th key={i} className="text-center px-3 py-3 text-xs font-medium text-slate-400 uppercase">
                      R{i + 1}
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((skipper: any, pos: number) => (
                  <tr key={skipper.index} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-sm text-slate-300 font-medium">{pos + 1}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">{skipper.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{skipper.sailNo || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{skipper.club || '-'}</td>
                    {Array.from({ length: totalRaces }, (_, i) => {
                      const raceKey = `race_${i + 1}`;
                      const result = raceResults[raceKey]?.[skipper.index];
                      return (
                        <td key={i} className="text-center px-3 py-3 text-sm text-slate-300">
                          {result !== undefined && result !== null ? result : '-'}
                        </td>
                      );
                    })}
                    <td className="text-center px-4 py-3 text-sm font-bold text-white">
                      {skipper.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {standings.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              No results recorded yet.
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          Powered by AlfiePRO Race Management
        </div>
      </div>
    </div>
  );
};
