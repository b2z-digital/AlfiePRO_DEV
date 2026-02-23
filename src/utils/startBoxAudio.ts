import type { StartSequence, StartSequenceSound, StartBoxState } from '../types/startBox';

export interface TimerTickData {
  state: StartBoxState;
  remainingMs: number;
  remainingSeconds: number;
  totalDurationSeconds: number;
  progress: number;
  lastFiredLabel?: string;
}

type StateChangeCallback = (state: StartBoxState) => void;
type TickCallback = (data: TimerTickData) => void;
type SoundFiredCallback = (sound: StartSequenceSound) => void;

const TICK_INTERVAL = 50;

class StartBoxAudioEngine {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private loadingUrls: Set<string> = new Set();

  private currentSequence: StartSequence | null = null;
  private currentState: StartBoxState = 'idle';
  private totalDurationMs = 0;
  private startTimestamp = 0;
  private pausedElapsedMs = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private firedSoundIds: Set<string> = new Set();

  private countdownAudioSource: AudioBufferSourceNode | null = null;
  private countdownAudioStartCtxTime = 0;

  private stateCallbacks: StateChangeCallback[] = [];
  private tickCallbacks: TickCallback[] = [];
  private soundFiredCallbacks: SoundFiredCallback[] = [];
  private volume = 0.8;

  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);
  }

  async preloadSequence(sequence: StartSequence): Promise<void> {
    await this.initialize();

    const urls = new Set<string>();
    if (sequence.sounds?.length) {
      for (const ss of sequence.sounds) {
        const url = ss.sound?.file_url;
        if (url && !this.audioBuffers.has(url)) {
          urls.add(url);
        }
      }
    }

    if (sequence.audio_file_url && !this.audioBuffers.has(sequence.audio_file_url)) {
      urls.add(sequence.audio_file_url);
    }

    await Promise.allSettled(
      Array.from(urls).map(url => this.loadAudioBuffer(url))
    );
  }

  private async loadAudioBuffer(url: string): Promise<void> {
    if (this.audioBuffers.has(url) || this.loadingUrls.has(url)) return;
    this.loadingUrls.add(url);

    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      if (!this.audioContext) return;
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(url, audioBuffer);
    } catch (err) {
      console.warn('Failed to load audio:', url, err);
    } finally {
      this.loadingUrls.delete(url);
    }
  }

  async playSound(url: string, volumeOverride?: number): Promise<void> {
    await this.initialize();
    if (!this.audioContext || !this.gainNode) return;

    let buffer = this.audioBuffers.get(url);
    if (!buffer) {
      await this.loadAudioBuffer(url);
      buffer = this.audioBuffers.get(url);
    }
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    if (volumeOverride !== undefined && volumeOverride !== null) {
      const tempGain = this.audioContext.createGain();
      tempGain.gain.value = volumeOverride;
      tempGain.connect(this.gainNode);
      source.connect(tempGain);
    } else {
      source.connect(this.gainNode);
    }

    source.start(0);
  }

  async playSynthBeep(frequency = 880, durationMs = 150): Promise<void> {
    await this.initialize();
    if (!this.audioContext || !this.gainNode) return;

    const osc = this.audioContext.createOscillator();
    const oscGain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;
    oscGain.gain.value = 0.5;
    oscGain.gain.setTargetAtTime(0, this.audioContext.currentTime + durationMs / 1000 - 0.02, 0.01);

    osc.connect(oscGain);
    oscGain.connect(this.gainNode);
    osc.start();
    osc.stop(this.audioContext.currentTime + durationMs / 1000);
  }

  arm(sequence: StartSequence): void {
    this.stop();
    this.currentSequence = sequence;
    const effectiveDuration = sequence.use_audio_only && sequence.countdown_start_seconds
      ? sequence.countdown_start_seconds
      : sequence.total_duration_seconds;
    this.totalDurationMs = effectiveDuration * 1000;
    this.firedSoundIds.clear();
    this.pausedElapsedMs = 0;
    this.setState('armed');
    this.emitTick();

    this.preloadSequence(sequence).catch(() => {});
  }

  start(): void {
    if (this.currentState === 'armed' || this.currentState === 'paused') {
      const wasArmed = this.currentState === 'armed';
      if (wasArmed) {
        this.pausedElapsedMs = 0;
      }
      this.startTimestamp = performance.now() - this.pausedElapsedMs;
      this.setState('running');
      this.startTimer();

      if (this.currentSequence?.audio_file_url && this.audioContext && this.gainNode) {
        this.stopCountdownAudio();
        const buffer = this.audioBuffers.get(this.currentSequence.audio_file_url);
        if (buffer) {
          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(this.gainNode);

          const offsetMs = this.currentSequence.audio_offset_ms || 0;
          const elapsedSec = this.pausedElapsedMs / 1000;
          const audioStartSec = elapsedSec + (offsetMs / 1000);

          if (audioStartSec >= 0) {
            source.start(0, audioStartSec);
          } else {
            source.start(this.audioContext.currentTime + Math.abs(audioStartSec), 0);
          }
          this.countdownAudioSource = source;
          this.countdownAudioStartCtxTime = this.audioContext.currentTime;
        }
      }
    }
  }

  pause(): void {
    if (this.currentState !== 'running') return;
    this.pausedElapsedMs = performance.now() - this.startTimestamp;
    this.stopTimer();
    this.stopCountdownAudio();
    this.setState('paused');
    this.emitTick();
  }

  resume(): void {
    if (this.currentState !== 'paused') return;
    this.start();
  }

  stop(): void {
    this.stopTimer();
    this.stopCountdownAudio();
    this.firedSoundIds.clear();
    this.pausedElapsedMs = 0;
    this.startTimestamp = 0;
    if (this.currentSequence) {
      this.setState('idle');
    }
    this.emitTick();
  }

  reset(): void {
    if (this.currentSequence) {
      this.arm(this.currentSequence);
    } else {
      this.stop();
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  getState(): StartBoxState {
    return this.currentState;
  }

  getCurrentSequence(): StartSequence | null {
    return this.currentSequence;
  }

  getRemainingMs(): number {
    if (this.currentState === 'idle' || !this.currentSequence) {
      return 0;
    }
    if (this.currentState === 'armed') {
      return this.totalDurationMs;
    }
    if (this.currentState === 'paused') {
      return Math.max(0, this.totalDurationMs - this.pausedElapsedMs);
    }
    if (this.currentState === 'completed') {
      return 0;
    }
    const elapsed = performance.now() - this.startTimestamp;
    return Math.max(0, this.totalDurationMs - elapsed);
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.stateCallbacks.push(cb);
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter(c => c !== cb);
    };
  }

  onTick(cb: TickCallback): () => void {
    this.tickCallbacks.push(cb);
    return () => {
      this.tickCallbacks = this.tickCallbacks.filter(c => c !== cb);
    };
  }

  onSoundFired(cb: SoundFiredCallback): () => void {
    this.soundFiredCallbacks.push(cb);
    return () => {
      this.soundFiredCallbacks = this.soundFiredCallbacks.filter(c => c !== cb);
    };
  }

  destroy(): void {
    this.stopTimer();
    this.stopCountdownAudio();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.gainNode = null;
    this.audioBuffers.clear();
    this.stateCallbacks = [];
    this.tickCallbacks = [];
    this.soundFiredCallbacks = [];
  }

  private setState(state: StartBoxState): void {
    this.currentState = state;
    for (const cb of this.stateCallbacks) {
      try { cb(state); } catch {}
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerHandle = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private stopCountdownAudio(): void {
    if (this.countdownAudioSource) {
      try { this.countdownAudioSource.stop(); } catch {}
      this.countdownAudioSource = null;
    }
  }

  private tick(): void {
    if (this.currentState !== 'running') return;

    const elapsed = performance.now() - this.startTimestamp;
    const remainingMs = Math.max(0, this.totalDurationMs - elapsed);
    const remainingSeconds = remainingMs / 1000;

    this.checkSoundTriggers(remainingSeconds);
    this.emitTick();

    if (remainingMs <= 0) {
      this.stopTimer();
      this.stopCountdownAudio();
      this.setState('completed');
      this.emitTick();
    }
  }

  private checkSoundTriggers(remainingSeconds: number): void {
    if (!this.currentSequence?.sounds) return;
    if (this.currentSequence.use_audio_only) return;

    for (const ss of this.currentSequence.sounds) {
      if (this.firedSoundIds.has(ss.id)) continue;

      const triggerAt = ss.trigger_time_seconds;
      if (remainingSeconds <= triggerAt && remainingSeconds > triggerAt - 0.5) {
        this.firedSoundIds.add(ss.id);
        this.fireSoundEvent(ss);
      }
    }
  }

  private async fireSoundEvent(ss: StartSequenceSound): Promise<void> {
    const url = ss.sound?.file_url;

    for (const cb of this.soundFiredCallbacks) {
      try { cb(ss); } catch {}
    }

    if (url) {
      const vol = ss.volume_override ?? undefined;
      await this.playSound(url, vol);

      if (ss.repeat_count > 1 && ss.repeat_interval_ms) {
        for (let i = 1; i < ss.repeat_count; i++) {
          setTimeout(() => {
            this.playSound(url, vol).catch(() => {});
          }, i * ss.repeat_interval_ms);
        }
      }
    } else {
      await this.playSynthBeep();
    }
  }

  private emitTick(): void {
    const remaining = this.getRemainingMs();
    const seq = this.currentSequence;
    const effectiveDuration = seq
      ? (seq.use_audio_only && seq.countdown_start_seconds ? seq.countdown_start_seconds : seq.total_duration_seconds)
      : 0;
    const data: TimerTickData = {
      state: this.currentState,
      remainingMs: remaining,
      remainingSeconds: remaining / 1000,
      totalDurationSeconds: effectiveDuration,
      progress: this.totalDurationMs > 0 ? 1 - remaining / this.totalDurationMs : 0,
    };

    for (const cb of this.tickCallbacks) {
      try { cb(data); } catch {}
    }
  }
}

let instance: StartBoxAudioEngine | null = null;

export function getStartBoxEngine(): StartBoxAudioEngine {
  if (!instance) {
    instance = new StartBoxAudioEngine();
  }
  return instance;
}

export function destroyStartBoxEngine(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
