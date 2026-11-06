import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, TrendingUp, ChevronDown, ChevronUp, Award, Target, Medal, Sailboat } from 'lucide-react';
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
        <div className="p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  const MEDAL: Record<number, string> = { 1: '#FFC56B', 2: '#C9D1DE', 3: '#E59A62' };
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  const pos = (r: SailorResult | null, size: number, best?: number | null) => {
    const p = r ? r.position : best;
    const letter = r?.letter_score;
    if (letter) return <span className="a-posc a-posc-r" style={{ width: size, height: size }}>{letter.slice(0, 3)}</span>;
    if (p && MEDAL[p]) return <span className="a-med" style={{ width: size, height: size, background: MEDAL[p], boxShadow: `0 0 0 3px color-mix(in srgb, ${MEDAL[p]} 25%, transparent)` }}>{p}</span>;
    return <span className="a-posc" style={{ width: size, height: size }}>{p || '–'}</span>;
  };
  const statCard = (icon: React.ReactNode, cap: string, value: React.ReactNode, sub: string) => (
    <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
      <span className="a-tile" style={{ width: 44, height: 44 }}>{icon}</span>
      <div>
        <p className="a-cap">{cap}</p>
        <div className="a-display a-ink a-num text-[28px] font-semibold leading-none mt-1.5">{value}</div>
        <div className="a-dim text-[12px] mt-1.5">{sub}</div>
      </div>
    </div>
  );
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const groups = Object.entries(eventGroups);
  const yearCounts = groups.reduce<Record<string, number>>((acc, [, rs]) => { const y = rs[0].event_date?.slice(0, 4) || '—'; acc[y] = (acc[y] || 0) + 1; return acc; }, {});
  let lastYear = '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Trophy size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">My results</h1>
            <p className="a-mute mt-1 text-[14.5px]">
              {userName ? `${userName}'s race history` : 'Your personal race history'}
              {userSailNumber ? ` · Sail #${userSailNumber}` : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCard(<Medal size={20} />, 'Wins', stats.winCount, 'Race wins')}
          {statCard(<Award size={20} />, 'Podiums', stats.podiumCount, 'Top three finishes')}
          {statCard(<Target size={20} />, 'Avg position', stats.averagePosition || '–', 'Across all races')}
          {statCard(<TrendingUp size={20} />, 'Completion', `${stats.completionRate}%`, 'Races finished')}
        </div>

        {(years.length > 1 || classes.length > 1 || results.length > 0) && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {years.length > 1 && (
              <div className="a-seg" role="tablist">
                <button onClick={() => setFilterYear('all')} className={`a-seg-i ${filterYear === 'all' ? 'a-seg-on' : ''}`}>All years</button>
                {years.map(y => (
                  <button key={y} onClick={() => setFilterYear(y!)} className={`a-seg-i ${filterYear === y ? 'a-seg-on' : ''}`}>{y}</button>
                ))}
              </div>
            )}
            {classes.length > 1 && (
              <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="a-inp a-inp-sel" style={{ height: 40, width: 'auto', minWidth: 150 }} aria-label="Class">
                <option value="all">All classes</option>
                {classes.map(c => <option key={c} value={c!}>{c}</option>)}
              </select>
            )}
            <div className="flex-1" />
            <span className="a-dim text-[13px]"><b className="a-num a-ink">{stats.totalRaces}</b> races across <b className="a-num a-ink">{stats.totalEvents}</b> events</span>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="a-card a-empty text-center" style={{ padding: 48 }}>
            <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><Sailboat size={22} /></span>
            <h3 className="a-ink text-[16px] font-semibold mb-1">No results yet</h3>
            <p className="a-dim text-[13.5px] max-w-sm mx-auto">Your race results will appear here once you compete in events at this club.</p>
          </div>
        ) : (
          <div className="a-card overflow-hidden">
            {groups.map(([eventId, eventResults]) => {
              const firstResult = eventResults[0];
              const expanded = expandedEvent === eventId;
              const positions = eventResults.filter(r => r.position && !r.letter_score).map(r => r.position!);
              const avgPos = positions.length > 0 ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null;
              const bestPos = positions.length > 0 ? Math.min(...positions) : null;
              const d = firstResult.event_date ? new Date(firstResult.event_date + 'T00:00:00') : null;
              const y = firstResult.event_date?.slice(0, 4) || '—';
              const showYear = y !== lastYear;
              lastYear = y;

              return (
                <React.Fragment key={eventId}>
                  {showYear && (
                    <div className="flex items-baseline gap-2" style={{ padding: '16px 16px 6px' }}>
                      <span className="a-display a-ink text-[16px] font-semibold">{y}</span>
                      <span className="a-cnt">{yearCounts[y]}</span>
                    </div>
                  )}
                  <div className={expanded ? 'a-res-open' : ''}>
                    <button onClick={() => setExpandedEvent(expanded ? null : eventId)} className="a-rr w-full text-left" style={{ padding: '12px 16px' }} aria-expanded={expanded}>
                      <div className="text-center flex-shrink-0" style={{ width: 50 }}>
                        <div className="a-cap" style={{ fontSize: 10 }}>{d ? MON[d.getMonth()] : ''}</div>
                        <div className="a-display a-ink a-num text-[22px] font-semibold leading-none mt-[3px]">{d ? d.getDate() : '–'}</div>
                      </div>
                      {pos(null, 34, bestPos)}
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[15px] font-semibold truncate">{firstResult.event_name}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {firstResult.boat_class && <span className="a-lb-cls"><Sailboat size={11} />{firstResult.boat_class}</span>}
                        </div>
                      </div>
                      <div className="text-right max-md:hidden" style={{ width: 90 }}>
                        <div className="a-dim text-[11.5px]">Best</div>
                        <div className={`text-[14px] font-semibold ${bestPos && bestPos <= 3 ? `a-best-${bestPos}` : 'a-ink'}`}>{bestPos ? ord(bestPos) : '–'}</div>
                      </div>
                      <div className="text-right max-md:hidden" style={{ width: 80 }}>
                        <div className="a-dim text-[11.5px]">Avg</div>
                        <div className="a-num a-ink text-[14px] font-semibold">{avgPos ?? '–'}</div>
                      </div>
                      <div className="text-right" style={{ width: 70 }}>
                        <div className="a-dim text-[11.5px]">Races</div>
                        <div className="a-num a-ink text-[14px] font-semibold">{eventResults.length}</div>
                      </div>
                      {expanded ? <ChevronUp size={18} className="a-dim" /> : <ChevronDown size={18} className="a-dim" />}
                    </button>

                    {expanded && (
                      <div className="flex items-center gap-3.5 flex-wrap" style={{ padding: '4px 16px 16px 92px' }}>
                        <div className="flex gap-2.5 flex-wrap">
                          {eventResults.map((r) => (
                            <div key={`${r.event_id}-${r.race_number}`} className="flex flex-col items-center gap-1" title={`Race ${r.race_number}: ${r.letter_score || r.position || '–'} of ${r.total_entries}`}>
                              <span className="a-dim text-[10.5px]">R{r.race_number}</span>
                              {pos(r, 28)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
