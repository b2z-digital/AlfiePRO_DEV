import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { voiceCallEngine, VoiceCallState } from '../utils/voiceCallEngine';
import { useAuth } from './AuthContext';

interface VoiceCallContextType {
  callState: VoiceCallState | null;
  startCall: (peerId: string, peerName: string, peerAvatar?: string, conversationId?: string, clubId?: string) => Promise<boolean>;
  acceptCall: () => Promise<boolean>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
}

const VoiceCallContext = createContext<VoiceCallContextType>({
  callState: null,
  startCall: async () => false,
  acceptCall: async () => false,
  declineCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  isMuted: false,
});

export function useVoiceCall() {
  return useContext(VoiceCallContext);
}

export function VoiceCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<VoiceCallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    voiceCallEngine.setUserId(user.id);
    voiceCallEngine.setHandlers(
      (state) => {
        setCallState(state);
        if (!state) setIsMuted(false);
      },
      (error) => {
        console.error('[VoiceCall] Error:', error);
      }
    );

    // Listen for incoming calls via realtime
    const channel = supabase.channel(`voice-calls-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_calls',
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const call = payload.new as any;
          if (call.status !== 'ringing') return;

          // Look up caller profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', call.caller_id)
            .maybeSingle();

          const callerName = profile?.full_name || 'Unknown';
          const callerAvatar = profile?.avatar_url || undefined;

          voiceCallEngine.handleIncomingCall(call.id, call.caller_id, callerName, callerAvatar);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_calls',
          filter: `caller_id=eq.${user.id}`,
        },
        (payload) => {
          const call = payload.new as any;
          // If callee declined or call was missed while we're still ringing
          if ((call.status === 'declined' || call.status === 'missed') && callState?.status === 'ringing' && callState?.direction === 'outgoing') {
            setCallState(prev => prev ? { ...prev, status: 'ended' } : null);
            setTimeout(() => setCallState(null), 2000);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [user?.id]);

  const startCall = useCallback(async (peerId: string, peerName: string, peerAvatar?: string, conversationId?: string, clubId?: string): Promise<boolean> => {
    if (!user) return false;

    // Create call record
    const { data: callRecord, error } = await supabase.from('voice_calls').insert({
      caller_id: user.id,
      callee_id: peerId,
      club_id: clubId || null,
      conversation_id: conversationId || null,
      status: 'ringing',
    }).select().single();

    if (error || !callRecord) {
      console.error('[VoiceCall] Failed to create call record:', error);
      return false;
    }

    return voiceCallEngine.initiateCall(callRecord.id, peerId, peerName, peerAvatar);
  }, [user]);

  const acceptCall = useCallback(async (): Promise<boolean> => {
    return voiceCallEngine.acceptCall();
  }, []);

  const declineCall = useCallback(() => {
    voiceCallEngine.declineCall();
  }, []);

  const endCall = useCallback(() => {
    voiceCallEngine.endCall();
  }, []);

  const toggleMute = useCallback(() => {
    const muted = voiceCallEngine.toggleMute();
    setIsMuted(muted);
  }, []);

  return (
    <VoiceCallContext.Provider value={{ callState, startCall, acceptCall, declineCall, endCall, toggleMute, isMuted }}>
      {children}
    </VoiceCallContext.Provider>
  );
}
