import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp, Calendar, ListFilter as Filter, ChartBar as BarChart3, ChevronDown, ChevronUp, Award, Target, Clock, Anchor, Medal } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface SailorResult {
  event_id: string;
  event_name: string;
  event_date: string;
  race_number: number;
  position: number | null;
  letter_score: string | null;
  total_entries: number;
  scoring_system: string;
  boat_class: string | null;
}

interface SailorStats {
  totalRaces: number;
  totalEvents: number;
  averagePosition: number;
  bestPosition: number;
  winCount: number;
  podiumCount: number;
  dnfCount: number;
  completionRate: number;
}

interface SailorResultsPortalProps {
  clubId: string;
  darkMode: boolean;
  memberId?: string;
  memberName?: string;
  sailNumber?: string;
}

export const SailorResultsPortal: React.FC<SailorResultsPortalProps> = ({
  clubId,
  darkMode,
  memberId,
  memberName,
  sailNumber
}) => {
  const { user, profile } = useAuth();
  const [results, setResults] = useState<SailorResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');

  const name = memberName || (profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '');

  useEffect(() => {
    loadSailorResults();
  }, [clubId, memberId, sailNumber]);

  const loadSailorResults = async () => {
    setLoading(true);
    try {
      const { data: events, error } = await supabase
        .from('quick_races')
        .select('id, event_name, date, race_results, skippers, scoring_system, boat_class, last_completed_race')
        .eq('club_id', clubId)
        .order('date', { ascending: false });

      if (error || !events) {
        setLoading(false);
        return;
      }

      const sailorResults: SailorResult[] = [];

      for (const event of events) {
        if (!event.race_results || !event.skippers) continue;

        const skippers = event.skippers as Array<{ name: string; sailNumber?: string; boatClass?: string }>;
        const skipperIndex = skippers.findIndex((s: { name: string; sailNumber?: string }) => {
          if (sailNumber && s.sailNumber === sailNumber) return true;
          if (name && s.name.toLowerCase() === name.toLowerCase()) return true;
          return false;
        });

        if (skipperIndex === -1) continue;

        const raceResults = event.race_results as Array<Array<{ skipperIndex: number; position: number | null; letterScore?: string }>>;

        for (let raceIdx = 0; raceIdx < raceResults.length; raceIdx++) {
          const raceData = raceResults[raceIdx];
          if (!raceData) continue;

          const myResult = raceData.find((r: { skipperIndex: number }) => r.skipperIndex === skipperIndex);
          if (!myResult) continue;

          sailorResults.push({
            event_id: event.id,
            event_name: event.event_name || 'Untitled Event',
            event_date: event.date || '',
            race_number: raceIdx + 1,
            position: myResult.position,
            letter_score: myResult.letterScore || null,
            total_entries: skippers.length,
            scoring_system: event.scoring_system || 'low-point',
            boat_class: event.boat_class || skippers[skipperIndex]?.boatClass || null,
          });
        }
      }

      setResults(sailorResults);
    } catch (err) {
      console.error('Failed to load sailor results:', err);
    }
    setLoading(false);
  };

  const stats: SailorStats = React.useMemo(() => {
    const validPositions = results.filter(r => r.position && !r.letter_score);
    const eventIds = new Set(results.map(r => r.event_id));

    return {
      totalRaces: results.length,
      totalEvents: eventIds.size,
      averagePosition: validPositions.length > 0
        ? Math.round((validPositions.reduce((sum, r) => sum + (r.position || 0), 0) / validPositions.length) * 10) / 10
        : 0,
      bestPosition: validPositions.length > 0
        ? Math.min(...validPositions.map(r => r.position || 999))
        : 0,
      winCount: validPositions.filter(r => r.position === 1).length,
      podiumCount: validPositions.filter(r => r.position && r.position <= 3).length,
      dnfCount: results.filter(r => r.letter_score).length,
      completionRate: results.length > 0
        ? Math.round((validPositions.length / results.length) * 100)
        : 0,
    };
  }, [results]);

  const years = [...new Set(results.map(r => r.event_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const classes = [...new Set(results.map(r => r.boat_class).filter(Boolean))];

  const filteredResults = results.filter(r => {
    if (filterYear !== 'all' && !r.event_date?.startsWith(filterYear)) return false;
    if (filterClass !== 'all' && r.boat_class !== filterClass) return false;
    return true;
  });

  const eventGroups = filteredResults.reduce<Record<string, SailorResult[]>>((acc, r) => {
    if (!acc[r.event_id]) acc[r.event_id] = [];
    acc[r.event_id].push(r);
    return acc;
  }, {});

  const bgClass = darkMode ? 'bg-gray-800' : 'bg-white';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500';
  const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';
  const cardBg = darkMode ? 'bg-gray-750' : 'bg-gray-50';

  if (loading) {
    return (
      <div className={`${bgClass} rounded-xl shadow-sm border ${borderClass} p-8 text-center`}>
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className={`text-sm ${mutedClass} mt-2`}>Loading results...</p>
      </div>
    );
  }

  return (
    <div className={`${bgClass} rounded-xl shadow-sm border ${borderClass} overflow-hidden`}>
      {/* Header */}
      <div className={`p-4 border-b ${borderClass}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Trophy className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${textClass}`}>
              {name ? `${name}'s Results` : 'My Results'}
            </h2>
            <p className={`text-sm ${mutedClass}`}>
              {sailNumber && `Sail #${sailNumber} - `}
              {stats.totalRaces} races across {stats.totalEvents} events
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats.totalRaces > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
          <div className={`p-3 rounded-lg ${cardBg} border ${borderClass}`}>
            <div className="flex items-center gap-2 mb-1">
              <Medal className="w-4 h-4 text-amber-500" />
              <span className={`text-xs ${mutedClass}`}>Wins</span>
            </div>
            <p className={`text-xl font-bold ${textClass}`}>{stats.winCount}</p>
          </div>
          <div className={`p-3 rounded-lg ${cardBg} border ${borderClass}`}>
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-blue-500" />
              <span className={`text-xs ${mutedClass}`}>Podiums</span>
            </div>
            <p className={`text-xl font-bold ${textClass}`}>{stats.podiumCount}</p>
          </div>
          <div className={`p-3 rounded-lg ${cardBg} border ${borderClass}`}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-green-500" />
              <span className={`text-xs ${mutedClass}`}>Avg Position</span>
            </div>
            <p className={`text-xl font-bold ${textClass}`}>{stats.averagePosition || '-'}</p>
          </div>
          <div className={`p-3 rounded-lg ${cardBg} border ${borderClass}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              <span className={`text-xs ${mutedClass}`}>Completion</span>
            </div>
            <p className={`text-xl font-bold ${textClass}`}>{stats.completionRate}%</p>
          </div>
        </div>
      )}

      {/* Filters */}
      {(years.length > 1 || classes.length > 1) && (
        <div className={`px-4 pb-3 flex items-center gap-3 flex-wrap`}>
          <Filter className={`w-4 h-4 ${mutedClass}`} />
          {years.length > 1 && (
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="all">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {classes.length > 1 && (
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            >
              <option value="all">All Classes</option>
              {classes.map(c => <option key={c} value={c!}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Results List */}
      <div className="px-4 pb-4">
        {Object.keys(eventGroups).length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className={`w-10 h-10 mx-auto mb-2 ${mutedClass}`} />
            <p className={`text-sm ${mutedClass}`}>No results found</p>
            <p className={`text-xs ${mutedClass} mt-1`}>
              Results will appear here once you compete in events
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(eventGroups).map(([eventId, eventResults]) => {
              const firstResult = eventResults[0];
              const expanded = expandedEvent === eventId;
              const positions = eventResults.filter(r => r.position && !r.letter_score).map(r => r.position!);
              const avgPos = positions.length > 0
                ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
                : null;
              const bestPos = positions.length > 0 ? Math.min(...positions) : null;

              return (
                <div key={eventId} className={`rounded-lg border ${borderClass} overflow-hidden`}>
                  <button
                    onClick={() => setExpandedEvent(expanded ? null : eventId)}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} transition-colors`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${textClass} truncate`}>
                          {firstResult.event_name}
                        </span>
                        {firstResult.boat_class && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                            {firstResult.boat_class}
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-3 text-xs ${mutedClass} mt-0.5`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {firstResult.event_date ? new Date(firstResult.event_date).toLocaleDateString() : 'No date'}
                        </span>
                        <span>{eventResults.length} race{eventResults.length !== 1 ? 's' : ''}</span>
                        {bestPos && <span>Best: {bestPos}{bestPos === 1 ? 'st' : bestPos === 2 ? 'nd' : bestPos === 3 ? 'rd' : 'th'}</span>}
                        {avgPos && <span>Avg: {avgPos}</span>}
                      </div>
                    </div>
                    {expanded ? <ChevronUp className={`w-4 h-4 ${mutedClass}`} /> : <ChevronDown className={`w-4 h-4 ${mutedClass}`} />}
                  </button>
                  {expanded && (
                    <div className={`border-t ${borderClass} p-3`}>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {eventResults.map((r) => (
                          <div
                            key={`${r.event_id}-${r.race_number}`}
                            className={`text-center p-2 rounded-lg ${
                              r.letter_score
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                : r.position === 1
                                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                                  : r.position && r.position <= 3
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                    : `${cardBg} border ${borderClass}`
                            }`}
                          >
                            <p className={`text-xs ${mutedClass}`}>R{r.race_number}</p>
                            <p className={`text-sm font-bold ${
                              r.letter_score
                                ? 'text-red-600 dark:text-red-400'
                                : r.position === 1
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : textClass
                            }`}>
                              {r.letter_score || r.position || '-'}
                            </p>
                            <p className={`text-[10px] ${mutedClass}`}>/{r.total_entries}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
