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
  isVideo: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  isVideoEnabled: boolean;
}

type CallEventHandler = (state: VoiceCallState | null) => void;
type ErrorHandler = (error: string) => void;

class RingToneGenerator {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  startRingback() {
    this.stop();
    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0;

      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 440;
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      // US ringback pattern: 2s on, 4s off
      let on = true;
      this.gainNode.gain.value = 0.15;
      this.intervalId = setInterval(() => {
        if (!this.gainNode) return;
        on = !on;
        this.gainNode.gain.value = on ? 0.15 : 0;
      }, on ? 2000 : 4000);

      // Fix timing: alternate 2s/4s
      let phase = true;
      if (this.intervalId) clearInterval(this.intervalId);
      const tick = () => {
        if (!this.gainNode) return;
        phase = !phase;
        this.gainNode.gain.value = phase ? 0.15 : 0;
        this.intervalId = setTimeout(tick, phase ? 2000 : 4000) as unknown as ReturnType<typeof setInterval>;
      };
      this.intervalId = setTimeout(tick, 2000) as unknown as ReturnType<typeof setInterval>;
    } catch (e) {
      // Audio context not available
    }
  }

  startRingtone() {
    this.stop();
    try {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);

      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 523.25; // C5
      this.oscillator.connect(this.gainNode);
      this.oscillator.start();

      // Ring pattern: 1s on, 2s off, repeating
      let on = true;
      this.gainNode.gain.value = 0.25;
      const tick = () => {
        if (!this.gainNode) return;
        on = !on;
        this.gainNode.gain.value = on ? 0.25 : 0;
        this.intervalId = setTimeout(tick, on ? 1000 : 2000) as unknown as ReturnType<typeof setInterval>;
      };
      this.intervalId = setTimeout(tick, 1000) as unknown as ReturnType<typeof setInterval>;
    } catch (e) {
      // Audio context not available
    }
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId as unknown as ReturnType<typeof setTimeout>);
      clearInterval(this.intervalId);
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
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private signalingChannel: ReturnType<typeof supabase.channel> | null = null;
  private callState: VoiceCallState | null = null;
  private durationInterval: ReturnType<typeof setInterval> | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private onStateChange: CallEventHandler | null = null;
  private onError: ErrorHandler | null = null;
  private userId: string = '';
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private ringTone = new RingToneGenerator();
  private signalingReady = false;

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

      // Play ringback tone for the caller
      this.ringTone.startRingback();

      // Auto-end after 30s if not answered
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

    // Play ringtone for the callee
    this.ringTone.startRingtone();

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
      // Stop ringtone
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

      // Send ready signal to caller so they create the offer
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

    // Stop any ringing tones
    this.ringTone.stop();

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

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      if (this.callState) {
        this.callState.isVideoEnabled = videoTrack.enabled;
        this.emitState();
      }
      return videoTrack.enabled;
    }
    return false;
  }

  private async setupLocalMedia(withVideo: boolean) {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: withVideo ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      } : false,
    });

    if (this.callState) {
      this.callState.localStream = this.localStream;
      this.emitState();
    }
  }

  private async setupSignaling(callId: string): Promise<void> {
    const channelName = `voice-call-${callId}`;
    this.signalingReady = false;

    this.signalingChannel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.signalingChannel.on('broadcast', { event: 'call_signal' }, async ({ payload }) => {
      if (payload.from === this.userId) return;
      await this.handleSignal(payload);
    });

    return new Promise<void>((resolve) => {
      this.signalingChannel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.signalingReady = true;
          resolve();
        }
      });
      // Fallback timeout in case subscription takes too long
      setTimeout(() => {
        if (!this.signalingReady) {
          this.signalingReady = true;
          resolve();
        }
      }, 3000);
    });
  }

  private async handleSignal(payload: any) {
    switch (payload.type) {
      case 'ready':
        // Callee is ready, create offer (stop ringback for caller)
        if (this.callState?.direction === 'outgoing') {
          this.ringTone.stop();
          this.callState.status = 'connecting';
          this.emitState();
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
        this.ringTone.stop();
        if (this.callState) {
          this.callState.status = 'ended';
          this.emitState();
        }
        setTimeout(() => this.cleanup(), 1500);
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

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote tracks (audio + video)
    this.peerConnection.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });

      // Play remote audio
      const audioTracks = this.remoteStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audio = new Audio();
        audio.srcObject = this.remoteStream;
        audio.autoplay = true;
        audio.play().catch(() => {});
      }

      if (this.callState) {
        this.callState.remoteStream = this.remoteStream;
        this.emitState();
      }
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
    if (this.onStateChange) {
      this.onStateChange(this.callState ? { ...this.callState } : null);
    }
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
    this.remoteStream = null;
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
    this.signalingReady = false;
    this.emitState();
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
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
