import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Users, QrCode, RefreshCw, UserMinus, Clock } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../../utils/supabase';

interface ShareScoringSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  clubId: string;
  darkMode?: boolean;
}

interface Participant {
  id: string;
  display_name: string;
  is_active: boolean;
  last_active_at: string;
}

export const ShareScoringSessionModal: React.FC<ShareScoringSessionModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventName,
  clubId,
  darkMode = false,
}) => {
  const [session, setSession] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePin = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const createOrFetchSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for existing active session
      const { data: existing } = await supabase
        .from('scoring_sessions')
        .select('*')
        .eq('event_id', eventId)
        .eq('club_id', clubId)
        .eq('created_by', user.id)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existing) {
        setSession(existing);
        await generateQR(existing.pin_code);
        await fetchParticipants(existing.id);
        return;
      }

      // Create new session with unique PIN
      let pin = generatePin();
      let attempts = 0;
      let created = false;

      while (!created && attempts < 5) {
        const { data, error: insertError } = await supabase
          .from('scoring_sessions')
          .insert({
            club_id: clubId,
            event_id: eventId,
            event_name: eventName,
            pin_code: pin,
            created_by: user.id,
          })
          .select()
          .maybeSingle();

        if (insertError?.code === '23505') {
          pin = generatePin();
          attempts++;
        } else if (insertError) {
          throw insertError;
        } else {
          setSession(data);
          await generateQR(pin);
          created = true;
        }
      }

      if (!created) {
        setError('Could not generate a unique PIN. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create scoring session');
    } finally {
      setLoading(false);
    }
  }, [eventId, clubId, eventName]);

  const generateQR = async (pin: string) => {
    const joinUrl = `${window.location.origin}/join-scoring/${pin}`;
    try {
      const url = await QRCode.toDataURL(joinUrl, {
        width: 256,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrDataUrl(url);
    } catch {
      // QR generation failed silently
    }
  };

  const fetchParticipants = async (sessionId: string) => {
    const { data } = await supabase
      .from('scoring_session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true });

    if (data) setParticipants(data);
  };

  const removeParticipant = async (participantId: string) => {
    await supabase
      .from('scoring_session_participants')
      .delete()
      .eq('id', participantId);

    setParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  const endSession = async () => {
    if (!session) return;

    await supabase
      .from('scoring_sessions')
      .update({ is_active: false })
      .eq('id', session.id);

    setSession(null);
    setParticipants([]);
    setQrDataUrl('');
    onClose();
  };

  const regeneratePin = async () => {
    if (!session) return;

    const newPin = generatePin();
    const { error: updateError } = await supabase
      .from('scoring_sessions')
      .update({ pin_code: newPin, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', session.id);

    if (!updateError) {
      setSession({ ...session, pin_code: newPin });
      await generateQR(newPin);
    }
  };

  const copyPin = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.pin_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    if (!session) return;
    const joinUrl = `${window.location.origin}/join-scoring/${session.pin_code}`;
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (isOpen) {
      createOrFetchSession();
    }
  }, [isOpen, createOrFetchSession]);

  // Subscribe to participant changes in realtime
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`scoring_participants:${session.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scoring_session_participants',
        filter: `session_id=eq.${session.id}`,
      }, () => {
        fetchParticipants(session.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  if (!isOpen) return null;

  const expiresIn = session?.expires_at
    ? Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 3600000))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-md rounded-xl shadow-xl ${darkMode ? 'bg-slate-800' : 'bg-white'} max-h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Users className={`w-5 h-5 ${darkMode ? 'text-cyan-400' : 'text-blue-600'}`} />
            <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Share Scoring
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className={`w-6 h-6 animate-spin ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            </div>
          )}

          {error && (
            <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {session && !loading && (
            <div className="space-y-5">
              {/* QR Code */}
              <div className="flex flex-col items-center">
                <p className={`text-sm mb-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Scan to join scoring for <span className="font-medium">{eventName}</span>
                </p>
                {qrDataUrl && (
                  <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                    <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                )}
              </div>

              {/* PIN Display */}
              <div className={`p-4 rounded-xl text-center ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Session PIN
                </p>
                <div className="flex items-center justify-center gap-3">
                  <span className={`text-3xl font-mono font-bold tracking-[0.3em] ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {session.pin_code}
                  </span>
                  <button
                    onClick={copyPin}
                    className={`p-2 rounded-lg transition-colors ${
                      copied
                        ? 'bg-emerald-100 text-emerald-600'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                    title="Copy PIN"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className={`flex items-center justify-center gap-1 mt-2 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Clock className="w-3 h-3" />
                  <span>Expires in {expiresIn}h</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    darkMode
                      ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <button
                  onClick={regeneratePin}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title="Generate new PIN"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Participants */}
              <div>
                <h3 className={`text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Active Collaborators ({participants.length}/{session.max_collaborators})
                </h3>
                {participants.length === 0 ? (
                  <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    No one has joined yet. Share the PIN or QR code above.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {participants.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700/50' : 'bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {p.display_name}
                          </span>
                        </div>
                        <button
                          onClick={() => removeParticipant(p.id)}
                          className={`p-1 rounded ${darkMode ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                          title="Remove"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={endSession}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              darkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-600 hover:bg-red-50'
            }`}
          >
            End Session
          </button>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              darkMode
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
