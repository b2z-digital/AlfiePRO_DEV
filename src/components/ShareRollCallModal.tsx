import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Share2, Wifi, WifiOff, Shield, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ShareRollCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  clubId: string;
  currentHeat: string | null;
  currentRound: number;
  currentRace: number;
  darkMode: boolean;
  onRollCallUpdate?: (data: { ready: number[]; absent: number[]; letterScores: Record<string, string> }) => void;
}

interface RollCallSessionData {
  id: string;
  short_code: string;
  access_token: string;
  pin: string | null;
  enabled: boolean;
  expires_at: string;
  current_heat: string | null;
  current_round: number;
  current_race: number;
  roll_call_data: {
    ready: number[];
    absent: number[];
    letterScores: Record<string, string>;
  };
}

export const ShareRollCallModal: React.FC<ShareRollCallModalProps> = ({
  isOpen,
  onClose,
  eventId,
  clubId,
  currentHeat,
  currentRound,
  currentRace,
  darkMode,
  onRollCallUpdate,
}) => {
  const { user } = useAuth();
  const [session, setSession] = useState<RollCallSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState('');
  const [connected, setConnected] = useState(false);

  const getShareUrl = useCallback((shortCode: string) => {
    const base = window.location.origin;
    return `${base}/rc/${shortCode}`;
  }, []);

  const generateQR = useCallback(async (url: string) => {
    try {
      const qrCode = await import('qrcode');
      const canvas = document.createElement('canvas');
      await qrCode.toCanvas(canvas, url, {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setQrDataUrl(canvas.toDataURL());
    } catch {
      setQrDataUrl('');
    }
  }, []);

  const loadOrCreateSession = useCallback(async () => {
    if (!user || !eventId || !clubId) return;
    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from('race_roll_call_sessions')
        .select('*')
        .eq('event_id', eventId)
        .eq('club_id', clubId)
        .eq('enabled', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setSession(existing);
        setUsePin(!!existing.pin);
        setPin(existing.pin || '');
        const url = getShareUrl(existing.short_code);
        await generateQR(url);
        setLoading(false);
        return;
      }

      const { data: created, error } = await supabase
        .from('race_roll_call_sessions')
        .insert({
          event_id: eventId,
          club_id: clubId,
          created_by: user.id,
          current_heat: currentHeat,
          current_round: currentRound,
          current_race: currentRace,
        })
        .select()
        .single();

      if (error) throw error;

      setSession(created);
      const url = getShareUrl(created.short_code);
      await generateQR(url);
    } catch (err) {
      console.error('Error creating roll call session:', err);
    }
    setLoading(false);
  }, [user, eventId, clubId, currentHeat, currentRound, currentRace, getShareUrl, generateQR]);

  useEffect(() => {
    if (isOpen) {
      loadOrCreateSession();
    }
  }, [isOpen, loadOrCreateSession]);

  // Real-time subscription - sync delegate updates back to scorer
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`rc_admin_${session.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'race_roll_call_sessions',
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        const updated = payload.new as RollCallSessionData;
        setSession(prev => prev ? { ...prev, ...updated } : null);
        if (onRollCallUpdate && updated.roll_call_data) {
          onRollCallUpdate(updated.roll_call_data);
        }
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, onRollCallUpdate]);

  // Push heat/round/race changes from scorer to session
  useEffect(() => {
    if (!session?.id) return;
    if (
      session.current_heat === currentHeat &&
      session.current_round === currentRound &&
      session.current_race === currentRace
    ) return;

    supabase
      .from('race_roll_call_sessions')
      .update({
        current_heat: currentHeat,
        current_round: currentRound,
        current_race: currentRace,
      })
      .eq('id', session.id)
      .then();
  }, [session?.id, currentHeat, currentRound, currentRace, session?.current_heat, session?.current_round, session?.current_race]);

  const handleCopy = async () => {
    if (!session) return;
    const url = getShareUrl(session.short_code);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!session) return;
    const url = getShareUrl(session.short_code);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Roll Call - AlfiePRO',
          text: `Join the roll call for the race event. Code: ${session.short_code}`,
          url,
        });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  };

  const handleTogglePin = async () => {
    if (!session) return;
    const newPin = usePin ? null : (pin || String(Math.floor(1000 + Math.random() * 9000)));
    setUsePin(!usePin);
    if (!usePin) setPin(newPin || '');

    await supabase
      .from('race_roll_call_sessions')
      .update({ pin: usePin ? null : newPin })
      .eq('id', session.id);
  };

  const handleDisableSession = async () => {
    if (!session) return;
    await supabase
      .from('race_roll_call_sessions')
      .update({ enabled: false })
      .eq('id', session.id);
    setSession(null);
    onClose();
  };

  const handleResetSession = async () => {
    if (!session) return;
    const resetData = { ready: [], absent: [], letterScores: {} };
    await supabase
      .from('race_roll_call_sessions')
      .update({ roll_call_data: resetData })
      .eq('id', session.id);
  };

  if (!isOpen) return null;

  const rollData = session?.roll_call_data;
  const readyCount = rollData?.ready?.length || 0;
  const absentCount = rollData?.absent?.length || 0;
  const letterScoreCount = rollData?.letterScores ? Object.keys(rollData.letterScores).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl overflow-hidden shadow-xl ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Share2 size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Share Roll Call</h2>
              <p className="text-teal-100 text-xs">Delegate to another device</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-400"></div>
            </div>
          ) : session ? (
            <>
              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
              )}

              {/* Short Code */}
              <div className={`text-center mb-4 p-3 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                <p className={`text-[10px] uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Access Code</p>
                <p className="text-2xl font-mono font-bold tracking-[0.2em] text-teal-400">{session.short_code}</p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleCopy}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    copied
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                      : darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors"
                >
                  <Share2 size={14} />
                  Share
                </button>
              </div>

              {/* PIN toggle */}
              <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${darkMode ? 'bg-slate-700/30 border border-slate-700/50' : 'bg-slate-50 border border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  <Shield size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>PIN Protection</span>
                </div>
                <button
                  onClick={handleTogglePin}
                  className={`relative w-10 h-5 rounded-full transition-colors ${usePin ? 'bg-teal-500' : darkMode ? 'bg-slate-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${usePin ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {usePin && pin && (
                <div className={`text-center p-2 rounded-lg mb-4 ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>PIN: </span>
                  <span className="font-mono font-bold text-teal-400 tracking-wider">{pin}</span>
                </div>
              )}

              {/* Live status */}
              <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${darkMode ? 'bg-slate-700/30 border border-slate-700/50' : 'bg-slate-50 border border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {connected ? 'Live sync active' : 'Connecting...'}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {readyCount > 0 && <span className="text-emerald-400 font-medium">{readyCount} ready</span>}
                  {absentCount > 0 && <span className="text-red-400 font-medium">{absentCount} absent</span>}
                  {letterScoreCount > 0 && <span className="text-amber-400 font-medium">{letterScoreCount} scored</span>}
                </div>
              </div>

              {/* Session management */}
              <div className="flex gap-2">
                <button
                  onClick={handleResetSession}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    darkMode ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <RefreshCw size={12} />
                  Reset
                </button>
                <button
                  onClick={handleDisableSession}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  <Trash2 size={12} />
                  End Session
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Failed to create session</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
