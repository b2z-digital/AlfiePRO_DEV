import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, UserCheck, UserX, Check, Wifi, WifiOff, ChevronDown, X, Sailboat, Lock } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { LetterScore } from '../types/letterScores';
import { getCountryFlag } from '../utils/countryFlags';

interface RollCallSession {
  id: string;
  event_id: string;
  club_id: string;
  enabled: boolean;
  pin: string | null;
  current_heat: string | null;
  current_round: number;
  current_race: number;
  roll_call_data: {
    ready: number[];
    absent: number[];
    letterScores: Record<string, string>;
  };
  expires_at: string;
}

interface SkipperInfo {
  name: string;
  sailNumber: string;
  country?: string;
  avatar_url?: string;
  index: number;
}

interface EventInfo {
  eventName: string;
  raceClass: string;
  clubName: string;
}

const ROLL_CALL_LETTER_SCORES: Array<{ code: LetterScore; label: string; color: string; description: string }> = [
  { code: 'DNS', label: 'DNS', color: 'bg-red-600', description: 'Did Not Start' },
  { code: 'DNC', label: 'DNC', color: 'bg-red-700', description: 'Did Not Compete' },
  { code: 'WDN', label: 'WDN', color: 'bg-slate-600', description: 'Withdrawn' },
  { code: 'DNF', label: 'DNF', color: 'bg-orange-600', description: 'Did Not Finish' },
  { code: 'RET', label: 'RET', color: 'bg-amber-600', description: 'Retired' },
  { code: 'DSQ', label: 'DSQ', color: 'bg-red-800', description: 'Disqualified' },
];

export const DelegatedRollCallPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<RollCallSession | null>(null);
  const [skippers, setSkippers] = useState<SkipperInfo[]>([]);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // PIN state
  const [needsPin, setNeedsPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);

  // Roll call state
  const [ready, setReady] = useState<Set<number>>(new Set());
  const [absent, setAbsent] = useState<Set<number>>(new Set());
  const [letterScores, setLetterScores] = useState<Record<string, string>>({});

  // Letter score sheet
  const [letterScoreTarget, setLetterScoreTarget] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  // Resolve token to session
  const resolveSession = useCallback(async () => {
    if (!token) { setError('No access code provided'); setLoading(false); return; }

    try {
      // Try access_token first, then short_code
      let { data } = await supabase
        .from('race_roll_call_sessions')
        .select('*')
        .eq('access_token', token)
        .eq('enabled', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!data) {
        const result = await supabase
          .from('race_roll_call_sessions')
          .select('*')
          .eq('short_code', token.toUpperCase())
          .eq('enabled', true)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        data = result.data;
      }

      if (!data) {
        setError('Session not found or expired');
        setLoading(false);
        return;
      }

      if (data.pin) {
        setSession(data);
        setNeedsPin(true);
        setLoading(false);
        return;
      }

      setSession(data);
      applyRollCallData(data.roll_call_data);
      await loadEventData(data.event_id, data.club_id, data.current_heat, data.current_round);
    } catch (err) {
      console.error('Error resolving session:', err);
      setError('Failed to load session');
    }
    setLoading(false);
  }, [token]);

  const verifyPin = useCallback(() => {
    if (!session) return;
    if (pinInput === session.pin) {
      setPinVerified(true);
      setNeedsPin(false);
      applyRollCallData(session.roll_call_data);
      loadEventData(session.event_id, session.club_id, session.current_heat, session.current_round);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1500);
    }
  }, [session, pinInput]);

  const applyRollCallData = (data: RollCallSession['roll_call_data']) => {
    if (data?.ready) setReady(new Set(data.ready));
    if (data?.absent) setAbsent(new Set(data.absent));
    if (data?.letterScores) setLetterScores(data.letterScores);
  };

  const loadEventData = async (eventId: string, clubId: string, heat: string | null, round: number) => {
    try {
      // Load event info
      const { data: event } = await supabase
        .from('quick_races')
        .select('id, event_name, race_class, club_id, skippers, heat_management')
        .eq('id', eventId)
        .maybeSingle();

      if (!event) return;

      const { data: club } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .maybeSingle();

      setEventInfo({
        eventName: event.event_name || 'Race Event',
        raceClass: event.race_class || '',
        clubName: club?.name || '',
      });

      // Extract skippers for this heat
      const allSkippers = event.skippers || [];
      const heatMgmt = event.heat_management;
      let skipperInfos: SkipperInfo[] = [];

      if (heat && heatMgmt?.heatAssignments) {
        const roundKey = `round${round}`;
        const roundAssignments = heatMgmt.heatAssignments[roundKey] || heatMgmt.heatAssignments;
        const heatIndices: number[] = roundAssignments[heat] || [];

        skipperInfos = heatIndices
          .filter((idx: number) => idx >= 0 && idx < allSkippers.length)
          .map((idx: number) => {
            const s = allSkippers[idx];
            return {
              name: s.name || 'Unknown',
              sailNumber: String(s.sailNumber || s.sailNo || ''),
              country: s.country,
              avatar_url: s.avatar_url,
              index: idx,
            };
          });
      } else {
        skipperInfos = allSkippers.map((s: any, idx: number) => ({
          name: s.name || 'Unknown',
          sailNumber: String(s.sailNumber || s.sailNo || ''),
          country: s.country,
          avatar_url: s.avatar_url,
          index: idx,
        }));
      }

      setSkippers(skipperInfos);
    } catch (err) {
      console.error('Error loading event data:', err);
    }
  };

  useEffect(() => {
    resolveSession();
  }, [resolveSession]);

  // Real-time subscription
  useEffect(() => {
    if (!session?.id || (needsPin && !pinVerified)) return;

    const channel = supabase
      .channel(`rc_delegate_${session.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'race_roll_call_sessions',
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        const updated = payload.new as RollCallSession;
        const oldHeat = session.current_heat;
        const oldRound = session.current_round;

        setSession(prev => prev ? { ...prev, ...updated } : null);

        // If heat/round changed, reload skippers
        if (updated.current_heat !== oldHeat || updated.current_round !== oldRound) {
          loadEventData(updated.event_id, updated.club_id, updated.current_heat, updated.current_round);
          setReady(new Set());
          setAbsent(new Set());
          setLetterScores({});
        }

        if (!updated.enabled) {
          setError('Session ended by scorer');
        }
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, needsPin, pinVerified]);

  // Sync roll call data to database
  const syncToDatabase = useCallback(async (
    newReady: Set<number>,
    newAbsent: Set<number>,
    newLetterScores: Record<string, string>
  ) => {
    if (!session?.id) return;
    await supabase
      .from('race_roll_call_sessions')
      .update({
        roll_call_data: {
          ready: Array.from(newReady),
          absent: Array.from(newAbsent),
          letterScores: newLetterScores,
        },
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', session.id);
  }, [session?.id]);

  const toggleReady = (idx: number) => {
    setReady(prev => {
      const next = new Set(prev);
      const nextAbsent = new Set(absent);
      const nextScores = { ...letterScores };

      if (absent.has(idx)) {
        nextAbsent.delete(idx);
        next.add(idx);
        delete nextScores[String(idx)];
      } else if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
        delete nextScores[String(idx)];
      }

      setAbsent(nextAbsent);
      setLetterScores(nextScores);
      syncToDatabase(next, nextAbsent, nextScores);
      return next;
    });
  };

  const markAbsent = (idx: number) => {
    setAbsent(prev => {
      const next = new Set(prev);
      const nextReady = new Set(ready);

      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
        nextReady.delete(idx);
      }

      setReady(nextReady);
      syncToDatabase(nextReady, next, letterScores);
      return next;
    });
  };

  const applyLetterScore = (idx: number, code: string) => {
    const nextScores = { ...letterScores, [String(idx)]: code };
    const nextAbsent = new Set(absent);
    nextAbsent.add(idx);
    const nextReady = new Set(ready);
    nextReady.delete(idx);

    setLetterScores(nextScores);
    setAbsent(nextAbsent);
    setReady(nextReady);
    setLetterScoreTarget(null);
    syncToDatabase(nextReady, nextAbsent, nextScores);
  };

  const clearLetterScore = (idx: number) => {
    const nextScores = { ...letterScores };
    delete nextScores[String(idx)];
    const nextAbsent = new Set(absent);
    nextAbsent.delete(idx);

    setLetterScores(nextScores);
    setAbsent(nextAbsent);
    setLetterScoreTarget(null);
    syncToDatabase(ready, nextAbsent, nextScores);
  };

  // Long-press handlers for letter score sheet
  const handlePointerDown = (idx: number) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setLetterScoreTarget(idx);
    }, 500);
  };

  const handlePointerUp = (idx: number) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      toggleReady(idx);
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // --- RENDER ---

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">Loading roll call...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <X size={28} className="text-red-400" />
          </div>
          <h1 className="text-white font-bold text-lg mb-2">{error}</h1>
          <p className="text-slate-400 text-sm">Please check the link or ask the scorer for a new code.</p>
        </div>
      </div>
    );
  }

  // PIN screen
  if (needsPin && !pinVerified) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-teal-400" />
          </div>
          <h1 className="text-white font-bold text-xl mb-2">Enter PIN</h1>
          <p className="text-slate-400 text-sm mb-6">This roll call session is PIN protected.</p>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
            placeholder="----"
            className={`w-full text-center text-3xl font-mono tracking-[0.3em] py-4 bg-slate-800 border rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              pinError ? 'border-red-500 animate-shake' : 'border-slate-700'
            }`}
            autoFocus
          />
          <button
            onClick={verifyPin}
            disabled={!pinInput}
            className="w-full mt-4 py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors"
          >
            Continue
          </button>
          {pinError && <p className="text-red-400 text-sm mt-3">Incorrect PIN</p>}
        </div>
      </div>
    );
  }

  // Waiting for heat
  if (!session?.current_heat) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Sailboat size={28} className="text-amber-400" />
          </div>
          <h1 className="text-white font-bold text-lg mb-2">Waiting for Scorer</h1>
          <p className="text-slate-400 text-sm">The scoring session hasn't started a heat yet. This page will update automatically.</p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
            {connected ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} />}
            {connected ? 'Connected' : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  const totalSkippers = skippers.length;
  const readyCount = ready.size;
  const absentCount = absent.size;
  const progress = totalSkippers > 0 ? ((readyCount + absentCount) / totalSkippers) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/90 border-b border-slate-700/50 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/15 rounded-xl ring-1 ring-teal-500/25">
              <ClipboardCheck size={18} className="text-teal-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm">
                {eventInfo?.eventName || 'Roll Call'}
                {session.current_heat && <span className="text-teal-400 ml-1.5">Heat {session.current_heat}</span>}
              </h1>
              <p className="text-slate-500 text-[10px]">
                {eventInfo?.clubName}{eventInfo?.raceClass ? ` - ${eventInfo.raceClass}` : ''}
                {' | '}Rd {session.current_round} R{session.current_race}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              {readyCount > 0 && <span className="text-emerald-400 font-medium flex items-center gap-1"><UserCheck size={12} />{readyCount}</span>}
              {absentCount > 0 && <span className="text-red-400 font-medium flex items-center gap-1"><UserX size={12} />{absentCount}</span>}
            </div>
            <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
              {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {connected ? 'Live' : 'Offline'}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 w-full rounded-full h-1 bg-slate-700/60">
          <div
            className="h-1 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Instructions */}
      <div className="px-4 py-2 text-center">
        <p className="text-slate-500 text-[10px]">Tap = Ready | Long-press = Letter Score | Right-click = Absent</p>
      </div>

      {/* Skipper Grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-20">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {skippers.map((skipper) => {
            const isReady = ready.has(skipper.index);
            const isAbsent = absent.has(skipper.index);
            const score = letterScores[String(skipper.index)];
            const initials = skipper.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

            return (
              <motion.button
                key={skipper.index}
                whileTap={{ scale: 0.95 }}
                onPointerDown={() => handlePointerDown(skipper.index)}
                onPointerUp={() => handlePointerUp(skipper.index)}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                onContextMenu={(e) => { e.preventDefault(); markAbsent(skipper.index); }}
                className={`relative flex flex-col items-center p-3 rounded-xl border transition-all select-none touch-none ${
                  score
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : isReady
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : isAbsent
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-slate-800/80 border-slate-700/50 hover:border-slate-600/50'
                }`}
              >
                {/* Status icon */}
                {(isReady || isAbsent || score) && (
                  <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center ${
                    score ? 'bg-amber-500' : isReady ? 'bg-emerald-500' : 'bg-red-500'
                  }`}>
                    {score ? <span className="text-[7px] font-bold text-white">{score.slice(0, 2)}</span> : isReady ? <Check size={9} className="text-white" /> : <X size={9} className="text-white" />}
                  </div>
                )}

                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 ${
                  score
                    ? 'bg-amber-500/20 text-amber-300'
                    : isReady
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : isAbsent
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-slate-700 text-slate-300'
                }`}>
                  {skipper.avatar_url ? (
                    <img src={skipper.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>

                {/* Sail number */}
                <span className={`text-sm font-bold ${
                  score ? 'text-amber-300' : isReady ? 'text-emerald-300' : isAbsent ? 'text-red-300' : 'text-white'
                }`}>
                  {skipper.country && <span className="mr-0.5 text-[10px]">{getCountryFlag(skipper.country)}</span>}
                  {skipper.sailNumber}
                </span>

                {/* Name */}
                <span className="text-[10px] text-slate-500 truncate w-full text-center mt-0.5">
                  {skipper.name.split(' ')[0]}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Letter Score Bottom Sheet */}
      <AnimatePresence>
        {letterScoreTarget !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setLetterScoreTarget(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-slate-800 rounded-t-2xl border-t border-slate-700 p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-semibold text-sm">Letter Score</h3>
                  <p className="text-slate-500 text-xs">
                    {skippers.find(s => s.index === letterScoreTarget)?.name || 'Skipper'} - #{skippers.find(s => s.index === letterScoreTarget)?.sailNumber}
                  </p>
                </div>
                <button onClick={() => setLetterScoreTarget(null)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ROLL_CALL_LETTER_SCORES.map((ls) => (
                  <button
                    key={ls.code}
                    onClick={() => applyLetterScore(letterScoreTarget, ls.code)}
                    className={`${ls.color} text-white py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110 active:scale-95`}
                  >
                    <span className="block text-lg">{ls.label}</span>
                    <span className="block text-[9px] font-normal opacity-80">{ls.description}</span>
                  </button>
                ))}
              </div>

              {letterScores[String(letterScoreTarget)] && (
                <button
                  onClick={() => clearLetterScore(letterScoreTarget)}
                  className="w-full mt-3 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors"
                >
                  Clear Letter Score
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer branding */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent pt-6 pb-3 px-4 pointer-events-none">
        <div className="text-center">
          <span className="text-slate-600 text-[10px]">Powered by </span>
          <span className="text-teal-500 text-[10px] font-semibold">AlfiePRO</span>
        </div>
      </div>
    </div>
  );
};

export default DelegatedRollCallPage;
