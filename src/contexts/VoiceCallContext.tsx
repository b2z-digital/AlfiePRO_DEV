import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { voiceCallEngine, VoiceCallState, GroupCallState } from '../utils/voiceCallEngine';
import { useAuth } from './AuthContext';

interface VoiceCallContextType {
  callState: VoiceCallState | null;
  groupCallState: GroupCallState | null;
  startCall: (peerId: string, peerName: string, peerAvatar?: string, conversationId?: string, clubId?: string, isVideo?: boolean) => Promise<boolean>;
  startGroupCall: (participants: { userId: string; name: string; avatar?: string }[], isVideo: boolean, conversationId?: string) => Promise<boolean>;
  acceptCall: () => Promise<boolean>;
  acceptGroupCall: () => Promise<boolean>;
  declineCall: () => void;
  declineGroupCall: () => void;
  endCall: () => void;
  addParticipant: (userId: string, name: string, avatar?: string) => Promise<boolean>;
  toggleMute: () => void;
  toggleVideo: () => void;
  isMuted: boolean;
}

const VoiceCallContext = createContext<VoiceCallContextType>({
  callState: null,
  groupCallState: null,
  startCall: async () => false,
  startGroupCall: async () => false,
  acceptCall: async () => false,
  acceptGroupCall: async () => false,
  declineCall: () => {},
  declineGroupCall: () => {},
  endCall: () => {},
  addParticipant: async () => false,
  toggleMute: () => {},
  toggleVideo: () => {},
  isMuted: false,
});

export function useVoiceCall() {
  return useContext(VoiceCallContext);
}

export function VoiceCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<VoiceCallState | null>(null);
  const [groupCallState, setGroupCallState] = useState<GroupCallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const groupChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handledCallIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleIncomingCallRecord = useCallback(async (call: any) => {
    if (!user) return;
    if (handledCallIdsRef.current.has(call.id)) return;
    if (call.status !== 'ringing') return;
    if (call.is_group_call) return;
    if (call.callee_id !== user.id) return;

    handledCallIdsRef.current.add(call.id);

    // Look up caller name from members table first (more reliable than profiles)
    const { data: member } = await supabase
      .from('members')
      .select('first_name, last_name, avatar_url')
      .eq('user_id', call.caller_id)
      .limit(1)
      .maybeSingle();

    let callerName = 'Unknown';
    let callerAvatar: string | undefined;

    if (member) {
      callerName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
      callerAvatar = member.avatar_url || undefined;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', call.caller_id)
        .maybeSingle();
      callerName = profile?.full_name || 'Unknown';
      callerAvatar = profile?.avatar_url || undefined;
    }

    voiceCallEngine.handleIncomingCall(
      call.id,
      call.caller_id,
      callerName,
      callerAvatar,
      call.is_video || false
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;

    voiceCallEngine.setUserId(user.id);
    voiceCallEngine.setHandlers(
      (state) => {
        setCallState(state);
        setGroupCallState(state?.groupCallState || null);
        if (!state) setIsMuted(false);
      },
      (error) => {
        console.error('[VoiceCall] Error:', error);
      }
    );

    // Listen for incoming 1:1 calls via realtime
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
          await handleIncomingCallRecord(payload.new);
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
          const currentState = voiceCallEngine.getCallState();
          if ((call.status === 'declined' || call.status === 'missed') && currentState?.status === 'ringing' && currentState?.direction === 'outgoing') {
            voiceCallEngine.endCall(call.status === 'declined' ? 'declined' : 'missed');
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    // Polling fallback: check for ringing calls periodically
    // Only needed as a safety net if the realtime subscription misses an event
    pollingRef.current = setInterval(async () => {
      const currentState = voiceCallEngine.getCallState();
      if (currentState) return;

      const { data: ringingCalls } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('callee_id', user.id)
        .eq('status', 'ringing')
        .eq('is_group_call', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (ringingCalls && ringingCalls.length > 0) {
        await handleIncomingCallRecord(ringingCalls[0]);
      }
    }, 30000);

    // Listen for incoming group calls
    const groupChannel = supabase.channel(`group-calls-incoming-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_call_participants',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const participant = payload.new as any;
          if (participant.status !== 'invited') return;

          // Fetch the group call session details
          const { data: session } = await supabase
            .from('group_call_sessions')
            .select('*')
            .eq('id', participant.group_call_id)
            .maybeSingle();

          if (!session || session.status !== 'active') return;

          // Fetch all participants
          const { data: allParticipants } = await supabase
            .from('group_call_participants')
            .select('user_id, display_name, status')
            .eq('group_call_id', session.id);

          const { data: initiatorProfile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', session.initiated_by)
            .maybeSingle();

          const participants = (allParticipants || [])
            .filter(p => p.user_id !== user.id)
            .map(p => ({
              userId: p.user_id,
              name: p.display_name || 'Unknown',
              avatar: undefined,
            }));

          voiceCallEngine.handleIncomingGroupCall(
            session.id,
            session.initiated_by,
            initiatorProfile?.full_name || 'Unknown',
            participants,
            session.is_video || false,
            session.conversation_id || undefined
          );
        }
      )
      .subscribe();

    groupChannelRef.current = groupChannel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      if (groupChannelRef.current) {
        supabase.removeChannel(groupChannelRef.current);
        groupChannelRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user?.id, handleIncomingCallRecord]);

  const startCall = useCallback(async (peerId: string, peerName: string, peerAvatar?: string, conversationId?: string, clubId?: string, isVideo = false): Promise<boolean> => {
    if (!user) return false;

    const { data: callRecord, error } = await supabase.from('voice_calls').insert({
      caller_id: user.id,
      callee_id: peerId,
      club_id: clubId || null,
      conversation_id: conversationId || null,
      status: 'ringing',
      is_video: isVideo,
    }).select().single();

    if (error || !callRecord) {
      console.error('[VoiceCall] Failed to create call record:', error);
      return false;
    }

    return voiceCallEngine.initiateCall(callRecord.id, peerId, peerName, peerAvatar, isVideo);
  }, [user]);

  const startGroupCall = useCallback(async (participants: { userId: string; name: string; avatar?: string }[], isVideo: boolean, conversationId?: string): Promise<boolean> => {
    if (!user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    // Create group call session in DB
    const { data: session, error: sessionError } = await supabase
      .from('group_call_sessions')
      .insert({
        initiated_by: user.id,
        conversation_id: conversationId || null,
        is_video: isVideo,
        max_participants: 6,
        status: 'active',
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('[VoiceCall] Failed to create group call session:', sessionError);
      return false;
    }

    // Add all participants to the group call (including initiator)
    const participantRecords = [
      { group_call_id: session.id, user_id: user.id, display_name: profile?.full_name || 'You', status: 'active', joined_at: new Date().toISOString() },
      ...participants.map(p => ({
        group_call_id: session.id,
        user_id: p.userId,
        display_name: p.name,
        status: 'invited',
      })),
    ];

    const { error: partError } = await supabase
      .from('group_call_participants')
      .insert(participantRecords);

    if (partError) {
      console.error('[VoiceCall] Failed to add group call participants:', partError);
      return false;
    }

    return voiceCallEngine.initiateGroupCall(
      session.id,
      participants,
      isVideo,
      profile?.full_name || 'Unknown',
      conversationId
    );
  }, [user]);

  const acceptCall = useCallback(async (): Promise<boolean> => {
    const currentState = voiceCallEngine.getCallState();
    if (currentState?.isGroupCall) {
      return acceptGroupCall();
    }
    return voiceCallEngine.acceptCall();
  }, []);

  const acceptGroupCall = useCallback(async (): Promise<boolean> => {
    const groupState = voiceCallEngine.getGroupCallState();
    if (groupState) {
      // Update participant status in DB
      await supabase
        .from('group_call_participants')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .eq('group_call_id', groupState.groupCallId)
        .eq('user_id', user?.id);
    }
    return voiceCallEngine.acceptGroupCall();
  }, [user]);

  const declineCall = useCallback(() => {
    const currentState = voiceCallEngine.getCallState();
    if (currentState?.isGroupCall) {
      declineGroupCall();
      return;
    }
    voiceCallEngine.declineCall();
  }, []);

  const declineGroupCall = useCallback(async () => {
    const groupState = voiceCallEngine.getGroupCallState();
    if (groupState && user) {
      await supabase
        .from('group_call_participants')
        .update({ status: 'declined', left_at: new Date().toISOString() })
        .eq('group_call_id', groupState.groupCallId)
        .eq('user_id', user.id);
    }
    voiceCallEngine.declineGroupCall();
  }, [user]);

  const endCall = useCallback(() => {
    voiceCallEngine.endCall();
  }, []);

  const addParticipant = useCallback(async (userId: string, name: string, avatar?: string): Promise<boolean> => {
    const groupState = voiceCallEngine.getGroupCallState();
    if (!groupState) return false;

    // Add to DB
    await supabase.from('group_call_participants').insert({
      group_call_id: groupState.groupCallId,
      user_id: userId,
      display_name: name,
      status: 'invited',
    });

    return voiceCallEngine.addParticipantToCall(userId, name, avatar);
  }, []);

  const toggleMute = useCallback(() => {
    const muted = voiceCallEngine.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleVideo = useCallback(() => {
    voiceCallEngine.toggleVideo();
  }, []);

  return (
    <VoiceCallContext.Provider value={{
      callState,
      groupCallState,
      startCall,
      startGroupCall,
      acceptCall,
      acceptGroupCall,
      declineCall,
      declineGroupCall,
      endCall,
      addParticipant,
      toggleMute,
      toggleVideo,
      isMuted,
    }}>
      {children}
    </VoiceCallContext.Provider>
  );
}
