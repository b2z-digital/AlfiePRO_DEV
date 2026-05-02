import { supabase } from './supabase';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export interface VoiceCallState {
  callId: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'active' | 'ended';
  startTime?: number;
  duration: number;
}

type CallEventHandler = (state: VoiceCallState) => void;
type ErrorHandler = (error: string) => void;

export class VoiceCallEngine {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private signalingChannel: ReturnType<typeof supabase.channel> | null = null;
  private callState: VoiceCallState | null = null;
  private durationInterval: ReturnType<typeof setInterval> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private onStateChange: CallEventHandler | null = null;
  private onError: ErrorHandler | null = null;
  private userId: string = '';
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

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

  async initiateCall(callId: string, peerId: string, peerName: string, peerAvatar?: string): Promise<boolean> {
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
      };
      this.emitState();

      await this.setupLocalAudio();
      this.setupSignaling(callId);

      // Auto-end after 30s if not answered
      this.ringTimeout = setTimeout(() => {
        if (this.callState?.status === 'ringing') {
          this.endCall('missed');
        }
      }, 30000);

      return true;
    } catch (error) {
      this.onError?.('Failed to access microphone');
      this.cleanup();
      return false;
    }
  }

  async handleIncomingCall(callId: string, callerId: string, callerName: string, callerAvatar?: string) {
    if (this.callState) {
      // Already in a call, decline this one
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
    };
    this.emitState();

    this.setupSignaling(callId);

    // Auto-decline after 30s
    this.ringTimeout = setTimeout(() => {
      if (this.callState?.status === 'ringing') {
        this.endCall('missed');
      }
    }, 30000);
  }

  async acceptCall(): Promise<boolean> {
    if (!this.callState || this.callState.direction !== 'incoming') return false;

    try {
      await this.setupLocalAudio();

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

      // Send ready signal to caller so they create the offer
      this.signalingChannel?.send({
        type: 'broadcast',
        event: 'call_signal',
        payload: { type: 'ready', from: this.userId },
      });

      return true;
    } catch (error) {
      this.onError?.('Failed to access microphone');
      this.endCall('error');
      return false;
    }
  }

  async declineCall() {
    if (!this.callState) return;
    await this.endCall('declined');
  }

  async endCall(reason: string = 'completed') {
    if (!this.callState) return;

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

    setTimeout(() => this.cleanup(), 500);
  }

  private async setupLocalAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  }

  private setupSignaling(callId: string) {
    const channelName = `voice-call-${callId}`;
    this.signalingChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.signalingChannel.on('broadcast', { event: 'call_signal' }, async ({ payload }) => {
      if (payload.from === this.userId) return;
      await this.handleSignal(payload);
    });

    this.signalingChannel.subscribe();
  }

  private async handleSignal(payload: any) {
    switch (payload.type) {
      case 'ready':
        // Callee is ready, create offer
        if (this.callState?.direction === 'outgoing') {
          await this.createOffer();
        }
        break;

      case 'offer':
        await this.handleOffer(payload.sdp);
        break;

      case 'answer':
        await this.handleAnswer(payload.sdp);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(payload.candidate);
        break;

      case 'hangup':
        this.callState = this.callState ? { ...this.callState, status: 'ended' } : null;
        this.emitState();
        setTimeout(() => this.cleanup(), 500);
        break;
    }
  }

  private async createOffer() {
    this.createPeerConnection();

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'call_signal',
      payload: { type: 'offer', from: this.userId, sdp: offer },
    });
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit) {
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;

    // Process queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.iceCandidateQueue = [];

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.signalingChannel?.send({
      type: 'broadcast',
      event: 'call_signal',
      payload: { type: 'answer', from: this.userId, sdp: answer },
    });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescriptionSet = true;

    for (const candidate of this.iceCandidateQueue) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
    this.iceCandidateQueue = [];
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection || !this.remoteDescriptionSet) {
      this.iceCandidateQueue.push(candidate);
      return;
    }
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private createPeerConnection() {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote audio
    this.peerConnection.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audio.play().catch(() => {});
    };

    // ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingChannel?.send({
          type: 'broadcast',
          event: 'call_signal',
          payload: { type: 'ice-candidate', from: this.userId, candidate: event.candidate.toJSON() },
        });
      }
    };

    // Connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'connected') {
        if (this.callState) {
          this.callState.status = 'active';
          this.callState.startTime = Date.now();
          this.emitState();
          this.startDurationTimer();
        }
        if (this.ringTimeout) {
          clearTimeout(this.ringTimeout);
          this.ringTimeout = null;
        }
      } else if (state === 'disconnected' || state === 'failed') {
        if (this.callState?.status === 'active') {
          this.endCall('error');
        }
      }
    };
  }

  private startDurationTimer() {
    this.durationInterval = setInterval(() => {
      if (this.callState?.startTime) {
        this.callState.duration = Math.floor((Date.now() - this.callState.startTime) / 1000);
        this.emitState();
      }
    }, 1000);
  }

  private emitState() {
    if (this.callState && this.onStateChange) {
      this.onStateChange({ ...this.callState });
    }
  }

  private cleanup() {
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
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }
    this.callState = null;
    this.remoteDescriptionSet = false;
    this.iceCandidateQueue = [];
    this.emitState();
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if muted
    }
    return false;
  }

  isMuted(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }
}

export const voiceCallEngine = new VoiceCallEngine();
