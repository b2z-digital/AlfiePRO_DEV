import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle2 } from 'lucide-react';
import { supabase } from '../utils/supabase';

export const JoinScoringSessionPage: React.FC = () => {
  const { pin } = useParams<{ pin?: string }>();
  const navigate = useNavigate();

  const [pinInput, setPinInput] = useState(pin || '');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<'input' | 'joining' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionInfo, setSessionInfo] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('scoring_display_name');
    if (saved) setDisplayName(saved);
  }, []);

  const handleJoin = async (code?: string) => {
    const pinCode = code || pinInput.trim();
    if (!pinCode || pinCode.length !== 6) {
      setErrorMessage('Please enter a valid 6-digit PIN');
      setStatus('error');
      return;
    }

    const name = displayName.trim();
    if (!name) {
      setErrorMessage('Please enter your name');
      setStatus('error');
      return;
    }

    setStatus('joining');
    setErrorMessage('');

    try {
      localStorage.setItem('scoring_display_name', name);

      const { data, error } = await supabase.rpc('join_scoring_session', {
        p_pin_code: pinCode,
        p_display_name: name,
      });

      if (error) throw error;

      if (data?.success) {
        setSessionInfo(data);
        setStatus('success');
        setTimeout(() => {
          navigate('/dashboard', {
            state: {
              scoringSession: {
                sessionId: data.session_id,
                eventId: data.event_id,
                eventName: data.event_name,
                clubId: data.club_id,
                isCreator: data.is_creator,
              },
            },
          });
        }, 2000);
      } else {
        setErrorMessage(data?.error || 'Failed to join session');
        setStatus('error');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl p-6 border border-slate-700/50">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Join Scoring Session</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter the 6-digit PIN and your name to start scoring
          </p>
        </div>

        {/* PIN Input */}
        {status === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Your Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-sm"
                autoFocus={!pin}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Session PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-center text-2xl font-mono tracking-[0.4em] placeholder:text-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                autoFocus={!!pin}
              />
            </div>

            <button
              onClick={() => handleJoin()}
              disabled={pinInput.length !== 6 || !displayName.trim()}
              className="w-full py-3 px-4 bg-cyan-600 text-white rounded-lg font-medium hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Join Session
            </button>
          </div>
        )}

        {/* Joining state */}
        {status === 'joining' && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <p className="text-sm text-slate-400">Joining session...</p>
          </div>
        )}

        {/* Success state */}
        {status === 'success' && sessionInfo && (
          <div className="flex flex-col items-center py-6">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-base font-medium text-white mb-1">Joined Successfully</p>
            <p className="text-sm text-slate-400 text-center">
              Connecting to <span className="text-cyan-300">{sessionInfo.event_name}</span>
            </p>
            <p className="text-xs text-slate-500 mt-2">Redirecting...</p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/20 border border-red-800/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{errorMessage}</p>
            </div>
            <button
              onClick={() => { setStatus('input'); setErrorMessage(''); }}
              className="w-full py-2.5 px-4 bg-slate-700 text-slate-300 rounded-lg font-medium hover:bg-slate-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
