import { supabase } from './supabase';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const MAX_GROUP_PARTICIPANTS = 6;

export interface CallParticipant {
  userId: string;
  name: string;
  avatar?: string;
  status: 'ringing' | 'connecting' | 'active' | 'left' | 'declined' | 'missed';
  stream?: MediaStream;
  isMuted: boolean;
  isVideoEnabled: boolean;
}

export interface GroupCallState {
  groupCallId: string;
  isVideo: boolean;
  status: 'ringing' | 'connecting' | 'active' | 'ended';
  direction: 'outgoing' | 'incoming';
  participants: CallParticipant[];
  localStream?: MediaStream;
  isLocalMuted: boolean;
  isLocalVideoEnabled: boolean;
  startTime?: number;
  duration: number;
  initiatorId: string;
  initiatorName: string;
  conversationId?: string;
}

export interface VoiceCallState {
  callId: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'active' | 'ended';
  startTime?: number;
  duration: number;
  isVideo: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  isVideoEnabled: boolean;
  isGroupCall?: boolean;
  groupCallState?: GroupCallState;
}

type CallEventHandler = (state: VoiceCallState | null) => void;
type ErrorHandler = (error: string) => void;

class RingToneGenerator {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: ReturnType<typeof setTimeout> | null = null;

  startRingback() {
    this.stop();
    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.15;

      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 440;
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let phase = true;
      const tick = () => {
        if (!this.gainNode) return;
        phase = !phase;
        this.gainNode.gain.value = phase ? 0.15 : 0;
        this.intervalId = setTimeout(tick, phase ? 2000 : 4000);
      };
      this.intervalId = setTimeout(tick, 2000);
    } catch (e) {}
  }

  startRingtone() {
    this.stop();
    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.25;

      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 523.25;
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      let on = true;
      const tick = () => {
        if (!this.gainNode) return;
        on = !on;
        this.gainNode.gain.value = on ? 0.25 : 0;
        this.intervalId = setTimeout(tick, on ? 1000 : 2000);
      };
      this.intervalId = setTimeout(tick, 1000);
    } catch (e) {}
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    if (this.oscillator) {
      try { this.oscillator.stop(); } catch (e) {}
      this.oscillator = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

export class VoiceCallEngine {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private signalingChannel: ReturnType<typeof supabase.channel> | null = null;
  private callState: VoiceCallState | null = null;
  private groupCallState: GroupCallState | null = null;
  private durationInterval: ReturnType<typeof setInterval> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private onStateChange: CallEventHandler | null = null;
  private onError: ErrorHandler | null = null;
  private userId: string = '';
  private iceCandidateQueues: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteDescriptionSet: Set<string> = new Set();
  private ringTone = new RingToneGenerator();
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  setHandlers(onStateChange: CallEventHandler, onError: ErrorHandler) {
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  getCallState(): VoiceCallState | null {
    return this.callState;
  }

  getGroupCallState(): GroupCallState | null {
    return this.groupCallState;
  }

  // ===== 1:1 CALL METHODS (backward-compatible) =====

  async initiateCall(callId: string, peerId: string, peerName: string, peerAvatar?: string, isVideo = false): Promise<boolean> {
    if (this.callState) {
      this.onError?.('Already in a call');
      return false;
    }

    try {
      this.callState = {
        callId,
        peerId,
        peerName,
        peerAvatar,
        direction: 'outgoing',
        status: 'ringing',
        duration: 0,
        isVideo,
        isVideoEnabled: isVideo,
      };
      this.emitState();

      await this.setupLocalMedia(isVideo);
      await this.setupSignaling(callId);

      this.ringTone.startRingback();

      this.ringTimeout = setTimeout(() => {
        if (this.callState?.status === 'ringing') {
          this.endCall('missed');
        }
      }, 30000);

      return true;
    } catch (error: any) {
      this.onError?.(error?.message?.includes('Permission') ? 'Microphone access denied' : 'Failed to access microphone');
      this.cleanup();
      return false;
    }
  }

  async handleIncomingCall(callId: string, callerId: string, callerName: string, callerAvatar?: string, isVideo = false) {
    if (this.callState) {
      await supabase.from('voice_calls').update({ status: 'declined', end_reason: 'declined', ended_at: new Date().toISOString() }).eq('id', callId);
      return;
    }

    this.callState = {
      callId,
      peerId: callerId,
      peerName: callerName,
      peerAvatar: callerAvatar,
      direction: 'incoming',
      status: 'ringing',
      duration: 0,
      isVideo,
      isVideoEnabled: isVideo,
    };
    this.emitState();

    await this.setupSignaling(callId);
    this.ringTone.startRingtone();

    this.ringTimeout = setTimeout(() => {
      if (this.callState?.status === 'ringing') {
        this.endCall('missed');
      }
    }, 30000);
  }

  async acceptCall(): Promise<boolean> {
    if (!this.callState || this.callState.direction !== 'incoming') return false;

    try {
      this.ringTone.stop();
      await this.setupLocalMedia(this.callState.isVideo);

      this.callState.status = 'connecting';
      this.emitState();

      if (this.ringTimeout) {
        clearTimeout(this.ringTimeout);
        this.ringTimeout = null;
      }

      await supabase.from('voice_calls').update({
        status: 'active',
        answered_at: new Date().toISOString(),
      }).eq('id', this.callState.callId);

      this.signalingChannel?.send({
        type: 'broadcast',
        event: 'call_signal',
        payload: { type: 'ready', from: this.userId },
      });

      return true;
    } catch (error: any) {
      this.onError?.(error?.message?.includes('Permission') ? 'Camera/microphone access denied' : 'Failed to access media devices');
      this.endCall('error');
      return false;
    }
  }

  async declineCall() {
    if (!this.callState) return;
    this.ringTone.stop();
    await this.endCall('declined');
  }

  async endCall(reason: string = 'completed') {
    if (!this.callState) return;
    this.ringTone.stop();

    // Handle group call end
    if (this.callState.isGroupCall && this.groupCallState) {
      await this.endGroupCall(reason);
      return;
    }

    const callId = this.callState.callId;
    const duration = this.callState.duration;

    const statusForDb = reason === 'completed' ? 'ended' :
                        reason === 'missed' ? 'missed' :
                        reason === 'declined' ? 'declined' : 'ended';

    await supabase.from('voice_calls').update({
      status: statusForDb,
      end_reason: reason,
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
    }).eq('id', callId);

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'call_signal',
      payload: { type: 'hangup', from: this.userId, reason },
    });

    this.callState.status = 'ended';
    this.emitState();

    setTimeout(() => this.cleanup(), 1500);
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const isMuted = !audioTrack.enabled;

      if (this.groupCallState) {
        this.groupCallState.isLocalMuted = isMuted;
        this.signalingChannel?.send({
          type: 'broadcast',
          event: 'group_signal',
          payload: { type: 'mute_changed', from: this.userId, isMuted },
        });
        this.emitGroupState();
      }

      return isMuted;
    }
    return false;
  }

  isMuted(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      const isEnabled = videoTrack.enabled;

      if (this.callState && !this.callState.isGroupCall) {
        this.callState.isVideoEnabled = isEnabled;
        this.emitState();
      }

      if (this.groupCallState) {
        this.groupCallState.isLocalVideoEnabled = isEnabled;
        this.signalingChannel?.send({
          type: 'broadcast',
          event: 'group_signal',
          payload: { type: 'video_changed', from: this.userId, isVideoEnabled: isEnabled },
        });
        this.emitGroupState();
      }

      return isEnabled;
    }
    return false;
  }

  // ===== GROUP CALL METHODS =====

  async initiateGroupCall(
    groupCallId: string,
    participants: { userId: string; name: string; avatar?: string }[],
    isVideo: boolean,
    initiatorName: string,
    conversationId?: string
  ): Promise<boolean> {
    if (this.callState || this.groupCallState) {
      this.onError?.('Already in a call');
      return false;
    }

    if (participants.length + 1 > MAX_GROUP_PARTICIPANTS) {
      this.onError?.(`Group calls support up to ${MAX_GROUP_PARTICIPANTS} participants`);
      return false;
    }

    try {
      this.groupCallState = {
        groupCallId,
        isVideo,
        status: 'ringing',
        direction: 'outgoing',
        participants: participants.map(p => ({
          userId: p.userId,
          name: p.name,
          avatar: p.avatar,
          status: 'ringing',
          isMuted: false,
          isVideoEnabled: isVideo,
        })),
        isLocalMuted: false,
        isLocalVideoEnabled: isVideo,
        duration: 0,
        initiatorId: this.userId,
        initiatorName,
        conversationId,
      };

      this.callState = {
        callId: groupCallId,
        peerId: participants[0]?.userId || '',
        peerName: `Group Call (${participants.length + 1})`,
        direction: 'outgoing',
        status: 'ringing',
        duration: 0,
        isVideo,
        isVideoEnabled: isVideo,
        isGroupCall: true,
        groupCallState: this.groupCallState,
      };

      this.emitState();

      await this.setupLocalMedia(isVideo);
      this.groupCallState.localStream = this.localStream || undefined;

      await this.setupGroupSignaling(groupCallId);

      this.ringTone.startRingback();

      this.ringTimeout = setTimeout(() => {
        if (this.groupCallState?.status === 'ringing') {
          const hasActive = this.groupCallState.participants.some(p => p.status === 'active');
          if (!hasActive) {
            this.endGroupCall('missed');
          }
        }
      }, 30000);

      return true;
    } catch (error: any) {
      this.onError?.(error?.message?.includes('Permission') ? 'Microphone access denied' : 'Failed to start group call');
      this.cleanup();
      return false;
    }
  }

  async handleIncomingGroupCall(
    groupCallId: string,
    initiatorId: string,
    initiatorName: string,
    participants: { userId: string; name: string; avatar?: string }[],
    isVideo: boolean,
    conversationId?: string
  ) {
    if (this.callState || this.groupCallState) {
      this.signalingChannel?.send({
        type: 'broadcast',
        event: 'group_signal',
        payload: { type: 'participant_declined', from: this.userId },
      });
      return;
    }

    this.groupCallState = {
      groupCallId,
      isVideo,
      status: 'ringing',
      direction: 'incoming',
      participants: participants.map(p => ({
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        status: p.userId === initiatorId ? 'active' : 'ringing',
        isMuted: false,
        isVideoEnabled: isVideo,
      })),
      isLocalMuted: false,
      isLocalVideoEnabled: isVideo,
      duration: 0,
      initiatorId,
      initiatorName,
      conversationId,
    };

    this.callState = {
      callId: groupCallId,
      peerId: initiatorId,
      peerName: `Group Call from ${initiatorName}`,
      peerAvatar: participants.find(p => p.userId === initiatorId)?.avatar,
      direction: 'incoming',
      status: 'ringing',
      duration: 0,
      isVideo,
      isVideoEnabled: isVideo,
      isGroupCall: true,
      groupCallState: this.groupCallState,
    };

    this.emitState();

    await this.setupGroupSignaling(groupCallId);
    this.ringTone.startRingtone();

    this.ringTimeout = setTimeout(() => {
      if (this.groupCallState?.status === 'ringing') {
        this.declineGroupCall();
      }
    }, 30000);
  }

  async acceptGroupCall(): Promise<boolean> {
    if (!this.groupCallState || this.groupCallState.direction !== 'incoming') return false;

    try {
      this.ringTone.stop();
      if (this.ringTimeout) {
        clearTimeout(this.ringTimeout);
        this.ringTimeout = null;
      }

      await this.setupLocalMedia(this.groupCallState.isVideo);
      this.groupCallState.localStream = this.localStream || undefined;
      this.groupCallState.status = 'connecting';
      if (this.callState) this.callState.status = 'connecting';
      this.emitGroupState();

      this.signalingChannel?.send({
        type: 'broadcast',
        event: 'group_signal',
        payload: { type: 'participant_joined', from: this.userId },
      });

      // Create peer connections to all active participants
      const activeParticipants = this.groupCallState.participants.filter(
        p => p.status === 'active' && p.userId !== this.userId
      );
      for (const p of activeParticipants) {
        await this.createOfferForPeer(p.userId);
      }

      this.groupCallState.status = 'active';
      if (this.callState) this.callState.status = 'active';
      this.startDurationTimer();
      this.emitGroupState();

      return true;
    } catch (error: any) {
      this.onError?.(error?.message?.includes('Permission') ? 'Camera/microphone access denied' : 'Failed to join group call');
      this.endGroupCall('error');
      return false;
    }
  }

  async declineGroupCall() {
    if (!this.groupCallState) return;
    this.ringTone.stop();

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'group_signal',
      payload: { type: 'participant_declined', from: this.userId },
    });

    if (this.callState) {
      this.callState.status = 'ended';
    }
    this.emitState();
    setTimeout(() => this.cleanup(), 1000);
  }

  async endGroupCall(reason: string = 'completed') {
    if (!this.groupCallState) return;
    this.ringTone.stop();

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'group_signal',
      payload: { type: 'participant_left', from: this.userId, reason },
    });

    // Update DB
    await supabase.from('group_call_participants')
      .update({ left_at: new Date().toISOString(), status: 'left' })
      .eq('group_call_id', this.groupCallState.groupCallId)
      .eq('user_id', this.userId);

    if (this.callState) {
      this.callState.status = 'ended';
    }
    this.groupCallState.status = 'ended';
    this.emitState();

    setTimeout(() => this.cleanup(), 1000);
  }

  async addParticipantToCall(userId: string, name: string, avatar?: string): Promise<boolean> {
    if (!this.groupCallState) {
      this.onError?.('No active group call');
      return false;
    }

    const totalParticipants = this.groupCallState.participants.filter(
      p => p.status === 'active' || p.status === 'ringing' || p.status === 'connecting'
    ).length + 1; // +1 for local user

    if (totalParticipants >= MAX_GROUP_PARTICIPANTS) {
      this.onError?.(`Maximum ${MAX_GROUP_PARTICIPANTS} participants reached`);
      return false;
    }

    if (this.groupCallState.participants.find(p => p.userId === userId && p.status !== 'left')) {
      this.onError?.('Participant already in call');
      return false;
    }

    const newParticipant: CallParticipant = {
      userId,
      name,
      avatar,
      status: 'ringing',
      isMuted: false,
      isVideoEnabled: this.groupCallState.isVideo,
    };

    this.groupCallState.participants = [
      ...this.groupCallState.participants.filter(p => p.userId !== userId),
      newParticipant,
    ];

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'group_signal',
      payload: {
        type: 'participant_added',
        from: this.userId,
        targetUserId: userId,
        targetName: name,
        targetAvatar: avatar,
      },
    });

    this.emitGroupState();
    return true;
  }

  // ===== PRIVATE METHODS =====

  private async setupLocalMedia(withVideo: boolean) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });

    if (this.callState) {
      this.callState.localStream = this.localStream;
      this.emitState();
    }
  }

  private async setupSignaling(callId: string): Promise<void> {
    const channelName = `voice-call-${callId}`;

    this.signalingChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.signalingChannel.on('broadcast', { event: 'call_signal' }, async ({ payload }) => {
      if (payload.from === this.userId) return;
      await this.handleSignal(payload);
    });

    return new Promise<void>((resolve) => {
      this.signalingChannel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      setTimeout(resolve, 3000);
    });
  }

  private async setupGroupSignaling(groupCallId: string): Promise<void> {
    const channelName = `group-call-${groupCallId}`;

    this.signalingChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.signalingChannel.on('broadcast', { event: 'group_signal' }, async ({ payload }) => {
      if (payload.from === this.userId) return;
      await this.handleGroupSignal(payload);
    });

    return new Promise<void>((resolve) => {
      this.signalingChannel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      setTimeout(resolve, 3000);
    });
  }

  private async handleSignal(payload: any) {
    switch (payload.type) {
      case 'ready':
        if (this.callState?.direction === 'outgoing') {
          this.ringTone.stop();
          this.callState.status = 'connecting';
          this.emitState();
          await this.createOfferForPeer(payload.from);
        }
        break;
      case 'offer':
        await this.handleOffer(payload.from, payload.sdp);
        break;
      case 'answer':
        await this.handleAnswer(payload.from, payload.sdp);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(payload.from, payload.candidate);
        break;
      case 'hangup':
        this.ringTone.stop();
        if (this.callState) {
          this.callState.status = 'ended';
          this.emitState();
        }
        setTimeout(() => this.cleanup(), 1500);
        break;
    }
  }

  private async handleGroupSignal(payload: any) {
    if (!this.groupCallState) return;

    switch (payload.type) {
      case 'participant_joined': {
        const participant = this.groupCallState.participants.find(p => p.userId === payload.from);
        if (participant) {
          participant.status = 'active';
        }
        this.ringTone.stop();

        if (this.groupCallState.status === 'ringing') {
          this.groupCallState.status = 'active';
          if (this.callState) this.callState.status = 'active';
          this.startDurationTimer();
        }

        this.emitGroupState();
        break;
      }

      case 'participant_left': {
        const participant = this.groupCallState.participants.find(p => p.userId === payload.from);
        if (participant) {
          participant.status = 'left';
          participant.stream = undefined;
        }
        this.closePeerConnection(payload.from);

        // End call if no active participants remain
        const active = this.groupCallState.participants.filter(p => p.status === 'active');
        if (active.length === 0 && this.groupCallState.status === 'active') {
          this.groupCallState.status = 'ended';
          if (this.callState) this.callState.status = 'ended';
          this.emitState();
          setTimeout(() => this.cleanup(), 1000);
          return;
        }
        this.emitGroupState();
        break;
      }

      case 'participant_declined': {
        const participant = this.groupCallState.participants.find(p => p.userId === payload.from);
        if (participant) {
          participant.status = 'declined';
        }

        // If all participants declined or left, end call
        const stillPending = this.groupCallState.participants.filter(
          p => p.status === 'ringing' || p.status === 'connecting' || p.status === 'active'
        );
        if (stillPending.length === 0 && this.groupCallState.direction === 'outgoing') {
          this.endGroupCall('missed');
          return;
        }
        this.emitGroupState();
        break;
      }

      case 'participant_added': {
        // Another participant was added to the call
        const exists = this.groupCallState.participants.find(p => p.userId === payload.targetUserId);
        if (!exists) {
          this.groupCallState.participants.push({
            userId: payload.targetUserId,
            name: payload.targetName,
            avatar: payload.targetAvatar,
            status: 'ringing',
            isMuted: false,
            isVideoEnabled: this.groupCallState.isVideo,
          });
        }
        this.emitGroupState();
        break;
      }

      case 'offer':
        await this.handleOffer(payload.from, payload.sdp);
        break;

      case 'answer':
        await this.handleAnswer(payload.from, payload.sdp);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(payload.from, payload.candidate);
        break;

      case 'mute_changed': {
        const participant = this.groupCallState.participants.find(p => p.userId === payload.from);
        if (participant) {
          participant.isMuted = payload.isMuted;
        }
        this.emitGroupState();
        break;
      }

      case 'video_changed': {
        const participant = this.groupCallState.participants.find(p => p.userId === payload.from);
        if (participant) {
          participant.isVideoEnabled = payload.isVideoEnabled;
        }
        this.emitGroupState();
        break;
      }
    }
  }

  private async createOfferForPeer(peerId: string) {
    const pc = this.createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const event = this.groupCallState ? 'group_signal' : 'call_signal';
    this.signalingChannel?.send({
      type: 'broadcast',
      event,
      payload: { type: 'offer', from: this.userId, sdp: offer },
    });
  }

  private async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet.add(fromUserId);

    // Flush queued ICE candidates
    const queue = this.iceCandidateQueues.get(fromUserId) || [];
    for (const candidate of queue) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.iceCandidateQueues.delete(fromUserId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const event = this.groupCallState ? 'group_signal' : 'call_signal';
    this.signalingChannel?.send({
      type: 'broadcast',
      event,
      payload: { type: 'answer', from: this.userId, sdp: answer },
    });
  }

  private async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet.add(fromUserId);

    const queue = this.iceCandidateQueues.get(fromUserId) || [];
    for (const candidate of queue) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.iceCandidateQueues.delete(fromUserId);
  }

  private async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(fromUserId);
    if (!pc || !this.remoteDescriptionSet.has(fromUserId)) {
      const queue = this.iceCandidateQueues.get(fromUserId) || [];
      queue.push(candidate);
      this.iceCandidateQueues.set(fromUserId, queue);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.ontrack = (event) => {
      let stream = this.remoteStreams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }
      event.streams[0].getTracks().forEach(track => {
        stream!.addTrack(track);
      });

      // Play audio
      if (!this.audioElements.has(peerId)) {
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.play().catch(() => {});
        this.audioElements.set(peerId, audio);
      }

      if (this.groupCallState) {
        const participant = this.groupCallState.participants.find(p => p.userId === peerId);
        if (participant) {
          participant.stream = stream;
        }
        this.emitGroupState();
      } else if (this.callState) {
        this.callState.remoteStream = stream;
        this.emitState();
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const signalEvent = this.groupCallState ? 'group_signal' : 'call_signal';
        this.signalingChannel?.send({
          type: 'broadcast',
          event: signalEvent,
          payload: { type: 'ice-candidate', from: this.userId, candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        if (this.groupCallState) {
          const participant = this.groupCallState.participants.find(p => p.userId === peerId);
          if (participant) participant.status = 'active';

          if (this.groupCallState.status !== 'active') {
            this.groupCallState.status = 'active';
            if (this.callState) this.callState.status = 'active';
            this.startDurationTimer();
          }
          this.ringTone.stop();
          this.emitGroupState();
        } else if (this.callState) {
          this.callState.status = 'active';
          this.callState.startTime = Date.now();
          this.emitState();
          this.startDurationTimer();
          if (this.ringTimeout) {
            clearTimeout(this.ringTimeout);
            this.ringTimeout = null;
          }
        }
      } else if (state === 'disconnected' || state === 'failed') {
        if (this.groupCallState) {
          const participant = this.groupCallState.participants.find(p => p.userId === peerId);
          if (participant) participant.status = 'left';
          this.closePeerConnection(peerId);
          this.emitGroupState();
        } else if (this.callState?.status === 'active') {
          this.endCall('error');
        }
      }
    };

    return pc;
  }

  private closePeerConnection(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.remoteDescriptionSet.delete(peerId);
    this.iceCandidateQueues.delete(peerId);
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.audioElements.delete(peerId);
    }
  }

  private startDurationTimer() {
    if (this.durationInterval) return;
    const startTime = Date.now();
    if (this.groupCallState) {
      this.groupCallState.startTime = startTime;
    }
    if (this.callState && !this.callState.startTime) {
      this.callState.startTime = startTime;
    }

    this.durationInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (this.groupCallState) {
        this.groupCallState.duration = elapsed;
      }
      if (this.callState) {
        this.callState.duration = elapsed;
      }
      this.emitState();
    }, 1000);
  }

  private emitState() {
    if (this.onStateChange) {
      if (this.callState) {
        this.callState.groupCallState = this.groupCallState || undefined;
      }
      this.onStateChange(this.callState ? { ...this.callState } : null);
    }
  }

  private emitGroupState() {
    if (this.callState) {
      this.callState.groupCallState = this.groupCallState || undefined;
    }
    this.emitState();
  }

  private cleanup() {
    this.ringTone.stop();
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Close all peer connections
    for (const [peerId] of this.peerConnections) {
      this.closePeerConnection(peerId);
    }
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.remoteDescriptionSet.clear();
    this.iceCandidateQueues.clear();
    this.audioElements.clear();

    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }

    this.callState = null;
    this.groupCallState = null;
    this.emitState();
  }
}

export const voiceCallEngine = new VoiceCallEngine();
