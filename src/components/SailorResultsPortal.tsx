import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, TrendingUp, Calendar, ListFilter as Filter, ChartBar as BarChart3, ChevronDown, ChevronUp, Award, Target, Medal, Sailboat } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';

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
  const { user, currentClub } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const resolvedClubId = clubId || currentClub?.clubId || '';
  const [results, setResults] = useState<SailorResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [userSailNumber, setUserSailNumber] = useState<string | null>(sailNumber || null);
  const [userName, setUserName] = useState<string>(memberName || '');

  useEffect(() => {
    loadUserInfo();
  }, [effectiveUserId, resolvedClubId]);

  useEffect(() => {
    if (userName || userSailNumber) {
      loadSailorResults();
    } else if (resolvedClubId && effectiveUserId) {
      setLoading(false);
    }
  }, [resolvedClubId, userName, userSailNumber, effectiveUserId]);

  const loadUserInfo = async () => {
    if (memberName && sailNumber) {
      setUserName(memberName);
      setUserSailNumber(sailNumber);
      return;
    }

    if (!effectiveUserId || !resolvedClubId) {
      setLoading(false);
      return;
    }

    try {
      // Try matching member by user_id first
      const { data: memberData } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .eq('user_id', effectiveUserId)
        .eq('club_id', resolvedClubId)
        .maybeSingle();

      if (memberData) {
        const name = `${memberData.first_name || ''} ${memberData.last_name || ''}`.trim();
        setUserName(name);

        // Get sail number from member_boats
        const { data: boatData } = await supabase
          .from('member_boats')
          .select('sail_number')
          .eq('member_id', memberData.id)
          .limit(1)
          .maybeSingle();

        setUserSailNumber(boatData?.sail_number || null);
        return;
      }

      // Fallback: look up user's profile to get name/email, then search members by email
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, full_name')
        .eq('id', effectiveUserId)
        .maybeSingle();

      if (profileData) {
        const profileName = profileData.full_name || `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim();

        // Try finding member by email match
        const { data: userData } = await supabase.auth.getUser();
        const userEmail = userData?.user?.email;

        if (userEmail) {
          const { data: memberByEmail } = await supabase
            .from('members')
            .select('id, first_name, last_name')
            .eq('email', userEmail)
            .eq('club_id', resolvedClubId)
            .maybeSingle();

          if (memberByEmail) {
            const name = `${memberByEmail.first_name || ''} ${memberByEmail.last_name || ''}`.trim();
            setUserName(name);

            const { data: boatData } = await supabase
              .from('member_boats')
              .select('sail_number')
              .eq('member_id', memberByEmail.id)
              .limit(1)
              .maybeSingle();

            setUserSailNumber(boatData?.sail_number || null);
            return;
          }
        }

        // Last resort: use the profile name to match against skippers
        if (profileName) {
          setUserName(profileName);
          return;
        }
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const loadSailorResults = async () => {
    setLoading(true);
    try {
      if (!resolvedClubId) {
        setLoading(false);
        return;
      }

      const sailorResults: SailorResult[] = [];

      const findSkipperIndex = (skippers: Array<{ name: string; sailNo?: string; boatClass?: string; hull?: string }>): number => {
        return skippers.findIndex((s) => {
          if (userSailNumber && s.sailNo === userSailNumber) return true;
          if (userName && s.name.toLowerCase() === userName.toLowerCase()) return true;
          return false;
        });
      };

      // Fetch quick_races (standalone events)
      const { data: events } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_results, skippers, race_class, last_completed_race')
        .eq('club_id', resolvedClubId)
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .neq('is_simulated', true)
        .order('race_date', { ascending: false });

      if (events) {
        for (const event of events) {
          if (!event.race_results || !event.skippers) continue;

          const skippers = event.skippers as Array<{ name: string; sailNo?: string; boatClass?: string; hull?: string }>;
          const skipperIdx = findSkipperIndex(skippers);
          if (skipperIdx === -1) continue;

          // race_results is a flat array of {race, position, skipperIndex, letterScore?}
          const raceResults = event.race_results as Array<{ race: number; position: number | null; skipperIndex: number; letterScore?: string }>;

          for (const result of raceResults) {
            if (result.skipperIndex !== skipperIdx) continue;

            sailorResults.push({
              event_id: event.id,
              event_name: event.event_name || 'Untitled Event',
              event_date: event.race_date || '',
              race_number: result.race || 1,
              position: typeof result.position === 'string' ? parseInt(result.position as string) : result.position,
              letter_score: result.letterScore || null,
              total_entries: skippers.length,
              scoring_system: event.race_class || 'low-point',
              boat_class: skippers[skipperIdx]?.hull || skippers[skipperIdx]?.boatClass || event.race_class || null,
            });
          }
        }
      }

      // Fetch race_series_rounds (series events)
      const { data: seriesRounds } = await supabase
        .from('race_series_rounds')
        .select(`
          id, round_name, round_index, date, race_results, skippers,
          race_series:series_id(id, series_name, race_class, club_id)
        `)
        .not('race_results', 'is', null)
        .not('skippers', 'is', null)
        .order('date', { ascending: false });

      if (seriesRounds) {
        for (const round of seriesRounds) {
          if (!round.race_results || !round.skippers) continue;

          // Check club_id from the parent series
          const series = Array.isArray(round.race_series) ? round.race_series[0] : round.race_series as any;
          if (series?.club_id && series.club_id !== resolvedClubId) continue;

          const skippers = round.skippers as Array<{ name: string; sailNo?: string; boatClass?: string; hull?: string }>;
          const skipperIdx = findSkipperIndex(skippers);
          if (skipperIdx === -1) continue;

          const raceResults = round.race_results as Array<{ race: number; position: number | null; skipperIndex: number; letterScore?: string }>;
          const seriesName = series?.series_name || '';
          const roundLabel = round.round_name || `Round ${(round.round_index ?? 0) + 1}`;

          for (const result of raceResults) {
            if (result.skipperIndex !== skipperIdx) continue;

            sailorResults.push({
              event_id: round.id,
              event_name: seriesName ? `${seriesName} - ${roundLabel}` : roundLabel,
              event_date: round.date || '',
              race_number: result.race || 1,
              position: typeof result.position === 'string' ? parseInt(result.position as string) : result.position,
              letter_score: result.letterScore || null,
              total_entries: skippers.length,
              scoring_system: series?.race_class || 'low-point',
              boat_class: skippers[skipperIdx]?.hull || skippers[skipperIdx]?.boatClass || series?.race_class || null,
            });
          }
        }
      }

      // Sort by date descending
      sailorResults.sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));
      setResults(sailorResults);
    } catch (err) {
      console.error('Failed to load sailor results:', err);
    }
    setLoading(false);
  };

  const stats: SailorStats = useMemo(() => {
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

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Hero Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
              <Trophy className="text-white" size={32} />
            </div>
            <div>
              <h1 className={`text-4xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                My Results
              </h1>
              <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {userName ? `${userName}'s race history` : 'Your personal race history'}
                {userSailNumber ? ` - Sail #${userSailNumber}` : ''}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-xl flex items-start gap-4 ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 flex-shrink-0">
                <Medal className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.winCount}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Wins
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-start gap-4 ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20 flex-shrink-0">
                <Award className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.podiumCount}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Podiums
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-start gap-4 ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 flex-shrink-0">
                <Target className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.averagePosition || '-'}
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Avg Position
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-start gap-4 ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
              <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20 flex-shrink-0">
                <TrendingUp className="text-white" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.completionRate}%
                </div>
                <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Completion
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        {(years.length > 1 || classes.length > 1) && (
          <div className={`flex items-center gap-3 flex-wrap mb-6 p-4 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
            <Filter className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            {years.length > 1 && (
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className={`px-3 py-2 text-sm rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
              >
                <option value="all">All Years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {classes.length > 1 && (
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className={`px-3 py-2 text-sm rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
              >
                <option value="all">All Classes</option>
                {classes.map(c => <option key={c} value={c!}>{c}</option>)}
              </select>
            )}
            <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {stats.totalRaces} races across {stats.totalEvents} events
            </span>
          </div>
        )}

        {/* Results List */}
        {Object.keys(eventGroups).length === 0 ? (
          <div className={`rounded-xl p-12 text-center ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-500/10 to-slate-600/10 inline-block mb-4">
              <Sailboat className={`w-12 h-12 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              No results yet
            </h3>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'} max-w-sm mx-auto`}>
              Your race results will appear here once you compete in events at this club.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(eventGroups).map(([eventId, eventResults]) => {
              const firstResult = eventResults[0];
              const expanded = expandedEvent === eventId;
              const positions = eventResults.filter(r => r.position && !r.letter_score).map(r => r.position!);
              const avgPos = positions.length > 0
                ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
                : null;
              const bestPos = positions.length > 0 ? Math.min(...positions) : null;

              return (
                <div
                  key={eventId}
                  className={`rounded-xl overflow-hidden transition-all ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}
                >
                  <button
                    onClick={() => setExpandedEvent(expanded ? null : eventId)}
                    className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}`}
                  >
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                      bestPos === 1
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20'
                        : bestPos && bestPos <= 3
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20'
                          : darkMode ? 'bg-slate-700' : 'bg-slate-100'
                    }`}>
                      <Trophy className={`w-5 h-5 ${bestPos && bestPos <= 3 ? 'text-white' : darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'} truncate`}>
                          {firstResult.event_name}
                        </span>
                        {firstResult.boat_class && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                            {firstResult.boat_class}
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center gap-4 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {firstResult.event_date ? new Date(firstResult.event_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}
                        </span>
                        <span>{eventResults.length} race{eventResults.length !== 1 ? 's' : ''}</span>
                        {bestPos && (
                          <span className={bestPos === 1 ? 'text-amber-500 font-medium' : ''}>
                            Best: {bestPos}{bestPos === 1 ? 'st' : bestPos === 2 ? 'nd' : bestPos === 3 ? 'rd' : 'th'}
                          </span>
                        )}
                        {avgPos && <span>Avg: {avgPos}</span>}
                      </div>
                    </div>
                    <div className={`flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className={`border-t px-4 pb-4 pt-3 ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                        {eventResults.map((r) => (
                          <div
                            key={`${r.event_id}-${r.race_number}`}
                            className={`text-center p-2.5 rounded-lg transition-all ${
                              r.letter_score
                                ? darkMode ? 'bg-red-900/20 border border-red-800/50' : 'bg-red-50 border border-red-200'
                                : r.position === 1
                                  ? darkMode ? 'bg-amber-900/20 border border-amber-700/50' : 'bg-amber-50 border border-amber-200'
                                  : r.position && r.position <= 3
                                    ? darkMode ? 'bg-blue-900/20 border border-blue-800/50' : 'bg-blue-50 border border-blue-200'
                                    : darkMode ? 'bg-slate-700/50 border border-slate-600/50' : 'bg-slate-50 border border-slate-200'
                            }`}
                          >
                            <p className={`text-[10px] font-medium uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>R{r.race_number}</p>
                            <p className={`text-base font-bold mt-0.5 ${
                              r.letter_score
                                ? 'text-red-500'
                                : r.position === 1
                                  ? 'text-amber-500'
                                  : r.position && r.position <= 3
                                    ? darkMode ? 'text-blue-400' : 'text-blue-600'
                                    : darkMode ? 'text-white' : 'text-slate-900'
                            }`}>
                              {r.letter_score || r.position || '-'}
                            </p>
                            <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>/{r.total_entries}</p>
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
