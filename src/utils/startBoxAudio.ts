import type { StartSequence, StartSequenceSound, StartBoxState } from '../types/startBox';

export interface TimerTickData {
  state: StartBoxState;
  remainingMs: number;
  remainingSeconds: number;
  totalDurationSeconds: number;
  progress: number;
  lastFiredLabel?: string;
  audioOnlyPreCountdown?: boolean;
  preCountdownRemainingMs?: number;
}

type StateChangeCallback = (state: StartBoxState) => void;
type TickCallback = (data: TimerTickData) => void;
type SoundFiredCallback = (sound: StartSequenceSound) => void;
type AudioEndedCallback = () => void;

const TICK_INTERVAL = 50;

class StartBoxAudioEngine {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private loadingUrls: Set<string> = new Set();
  private unlocked = false;

  private currentSequence: StartSequence | null = null;
  private currentState: StartBoxState = 'idle';
  private totalDurationMs = 0;
  private startTimestamp = 0;
  private pausedElapsedMs = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private firedSoundIds: Set<string> = new Set();
  private lastBeepSecond = -1;
  private firedMinuteCallouts: Set<number> = new Set();

  private countdownAudioSource: AudioBufferSourceNode | null = null;
  private countdownAudioStartCtxTime = 0;
  private audioStopScheduled = false;
  private audioStopTimeout: ReturnType<typeof setTimeout> | null = null;

  private bgMusicSource: AudioBufferSourceNode | null = null;
  private bgMusicGain: GainNode | null = null;
  private bgMusicDuckTimeout: ReturnType<typeof setTimeout> | null = null;

  private stateCallbacks: StateChangeCallback[] = [];
  private tickCallbacks: TickCallback[] = [];
  private soundFiredCallbacks: SoundFiredCallback[] = [];
  private audioEndedCallbacks: AudioEndedCallback[] = [];
  private volume = 0.8;

  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      if (!this.unlocked) {
        this.unlockAudioContext();
      }
      return;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.audioContext.destination);

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.unlockAudioContext();
  }

  private unlockAudioContext(): void {
    if (this.unlocked || !this.audioContext || !this.gainNode) return;
    try {
      const buffer = this.audioContext.createBuffer(1, 1, 22050);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      source.start(0);
      source.stop(this.audioContext.currentTime + 0.001);
      this.unlocked = true;
    } catch {}
  }

  async preloadSequence(sequence: StartSequence): Promise<void> {
    await this.initialize();

    const urls = new Set<string>();
    if (sequence.sounds?.length) {
      for (const ss of sequence.sounds) {
        const url = ss.custom_sound_url || ss.sound?.file_url;
        if (url && !this.audioBuffers.has(url)) {
          urls.add(url);
        }
      }
    }

    if (sequence.audio_file_url && !this.audioBuffers.has(sequence.audio_file_url)) {
      urls.add(sequence.audio_file_url);
    }

    if (sequence.minute_callout_sound?.file_url && !this.audioBuffers.has(sequence.minute_callout_sound.file_url)) {
      urls.add(sequence.minute_callout_sound.file_url);
    }

    if (sequence.use_background_music && sequence.background_music_url && !this.audioBuffers.has(sequence.background_music_url)) {
      urls.add(sequence.background_music_url);
    }

    await Promise.allSettled(
      Array.from(urls).map(url => this.loadAudioBuffer(url))
    );
  }

  private async loadAudioBuffer(url: string): Promise<void> {
    if (this.audioBuffers.has(url) || this.loadingUrls.has(url)) return;
    this.loadingUrls.add(url);

    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      if (!this.audioContext) return;
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
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

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

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

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

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
    if (sequence.use_audio_only && sequence.countdown_start_seconds) {
      const introMs = sequence.audio_offset_ms || 0;
      const countdownMs = sequence.countdown_start_seconds * 1000;
      this.totalDurationMs = introMs + countdownMs;
    } else {
      this.totalDurationMs = sequence.total_duration_seconds * 1000;
    }
    this.firedSoundIds.clear();
    this.lastBeepSecond = -1;
    this.firedMinuteCallouts.clear();
    this.pausedElapsedMs = 0;
    this.audioStopScheduled = false;
    this.setState('armed');
    this.emitTick();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.preloadSequence(sequence).catch(() => {});
    }
  }

  start(): void {
    if (this.currentState === 'armed' || this.currentState === 'paused') {
      // Ensure audio context is active - critical for mobile browsers
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const wasArmed = this.currentState === 'armed';
      if (wasArmed) {
        this.pausedElapsedMs = 0;
        // If sequence wasn't preloaded (mobile: arm() called before initialize()), do it now
        if (this.currentSequence && this.audioBuffers.size === 0) {
          this.preloadSequence(this.currentSequence).catch(() => {});
        }
      }
      this.startTimestamp = performance.now() - this.pausedElapsedMs;
      this.setState('running');
      this.startTimer();

      if (this.currentSequence?.use_background_music && this.currentSequence.background_music_url && this.audioContext && this.gainNode) {
        this.startBackgroundMusic(wasArmed);
      }

      if (this.currentSequence?.audio_file_url && this.audioContext && this.gainNode) {
        this.stopCountdownAudio();
        this.startCountdownAudio();
      }
    }
  }

  pause(): void {
    if (this.currentState !== 'running') return;
    this.pausedElapsedMs = performance.now() - this.startTimestamp;
    this.stopTimer();
    this.stopCountdownAudio();
    this.stopBackgroundMusic();
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
    this.stopBackgroundMusic();
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

  onAudioEnded(cb: AudioEndedCallback): () => void {
    this.audioEndedCallbacks.push(cb);
    return () => {
      this.audioEndedCallbacks = this.audioEndedCallbacks.filter(c => c !== cb);
    };
  }

  isCountdownAudioPlaying(): boolean {
    return this.countdownAudioSource !== null;
  }

  destroy(): void {
    this.stopTimer();
    this.stopCountdownAudio();
    this.stopBackgroundMusic();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.gainNode = null;
    this.bgMusicGain = null;
    this.audioBuffers.clear();
    this.stateCallbacks = [];
    this.tickCallbacks = [];
    this.soundFiredCallbacks = [];
    this.audioEndedCallbacks = [];
  }

  private startBackgroundMusic(fromBeginning: boolean): void {
    if (!this.audioContext || !this.gainNode || !this.currentSequence?.background_music_url) return;
    this.stopBackgroundMusic();

    const url = this.currentSequence.background_music_url;
    let buffer = this.audioBuffers.get(url);
    if (!buffer) {
      // Buffer not yet loaded - load it and start when ready
      this.loadAudioBuffer(url).then(() => {
        if (this.currentState === 'running' && this.currentSequence?.background_music_url === url) {
          this.startBackgroundMusic(false);
        }
      });
      return;
    }

    const bgGain = this.audioContext.createGain();
    const normalVol = this.currentSequence.background_music_volume ?? 0.6;
    const fadeInMs = this.currentSequence.background_music_fade_in_ms ?? 2000;

    if (fromBeginning && fadeInMs > 0) {
      bgGain.gain.value = 0;
      bgGain.gain.linearRampToValueAtTime(normalVol, this.audioContext.currentTime + fadeInMs / 1000);
    } else {
      bgGain.gain.value = normalVol;
    }

    bgGain.connect(this.gainNode);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(bgGain);

    const offsetSec = fromBeginning ? 0 : this.pausedElapsedMs / 1000;
    source.start(0, offsetSec % buffer.duration);

    this.bgMusicSource = source;
    this.bgMusicGain = bgGain;
  }

  private stopBackgroundMusic(): void {
    if (this.bgMusicDuckTimeout) {
      clearTimeout(this.bgMusicDuckTimeout);
      this.bgMusicDuckTimeout = null;
    }
    if (this.bgMusicSource) {
      try { this.bgMusicSource.stop(); } catch {}
      this.bgMusicSource = null;
    }
    this.bgMusicGain = null;
  }

  private duckBackgroundMusic(): void {
    if (!this.bgMusicGain || !this.audioContext || !this.currentSequence) return;

    const duckVol = this.currentSequence.background_music_duck_volume ?? 0.15;
    const duckDurationMs = this.currentSequence.background_music_duck_duration_ms ?? 3000;
    const normalVol = this.currentSequence.background_music_volume ?? 0.6;

    this.bgMusicGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.bgMusicGain.gain.linearRampToValueAtTime(duckVol, this.audioContext.currentTime + 0.15);

    if (this.bgMusicDuckTimeout) clearTimeout(this.bgMusicDuckTimeout);
    this.bgMusicDuckTimeout = setTimeout(() => {
      if (this.bgMusicGain && this.audioContext) {
        this.bgMusicGain.gain.linearRampToValueAtTime(normalVol, this.audioContext.currentTime + 0.8);
      }
      this.bgMusicDuckTimeout = null;
    }, duckDurationMs);
  }

  private fadeOutBackgroundMusic(): void {
    if (!this.bgMusicGain || !this.audioContext || !this.currentSequence) return;
    const fadeOutMs = this.currentSequence.background_music_fade_out_ms ?? 3000;
    this.bgMusicGain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.bgMusicGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + fadeOutMs / 1000);
    setTimeout(() => this.stopBackgroundMusic(), fadeOutMs + 200);
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
    if (this.audioStopTimeout !== null) {
      clearTimeout(this.audioStopTimeout);
      this.audioStopTimeout = null;
    }
    if (this.countdownAudioSource) {
      try { this.countdownAudioSource.stop(); } catch {}
      this.countdownAudioSource = null;
    }
  }

  private startCountdownAudio(): void {
    if (!this.currentSequence?.audio_file_url || !this.audioContext || !this.gainNode) return;

    const url = this.currentSequence.audio_file_url;
    const buffer = this.audioBuffers.get(url);

    if (!buffer) {
      // Buffer not loaded yet - load and start when ready
      this.loadAudioBuffer(url).then(() => {
        if (this.currentState === 'running' && this.currentSequence?.audio_file_url === url) {
          this.startCountdownAudio();
        }
      });
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const audioStartMs = this.currentSequence.audio_start_ms || 0;
    const audioEndMs = this.currentSequence.audio_end_ms;
    const elapsedSec = (performance.now() - this.startTimestamp) / 1000;

    if (this.currentSequence.use_audio_only) {
      const startOffset = audioStartMs / 1000 + elapsedSec;
      const duration = audioEndMs != null ? (audioEndMs / 1000) - startOffset : undefined;
      source.start(0, startOffset, duration);
    } else {
      const offsetMs = this.currentSequence.audio_offset_ms || 0;
      const audioStartSec = elapsedSec + (offsetMs / 1000);

      if (audioStartSec >= 0) {
        source.start(0, audioStartSec);
      } else {
        source.start(this.audioContext.currentTime + Math.abs(audioStartSec), 0);
      }
    }

    if (audioEndMs != null && this.currentSequence.use_audio_only && !this.audioStopScheduled) {
      const effectivePlayMs = (audioEndMs - audioStartMs) - (elapsedSec * 1000);
      if (effectivePlayMs > 0) {
        this.audioStopTimeout = setTimeout(() => {
          this.stopCountdownAudio();
          this.audioStopScheduled = true;
        }, effectivePlayMs);
      }
    }

    source.onended = () => {
      if (this.countdownAudioSource === source) {
        this.countdownAudioSource = null;
        if (this.currentState === 'completed') {
          for (const cb of this.audioEndedCallbacks) {
            try { cb(); } catch {}
          }
        }
      }
    };
    this.countdownAudioSource = source;
    this.countdownAudioStartCtxTime = this.audioContext.currentTime;
  }

  private tick(): void {
    if (this.currentState !== 'running') return;

    const elapsed = performance.now() - this.startTimestamp;
    const remainingMs = Math.max(0, this.totalDurationMs - elapsed);
    const remainingSeconds = remainingMs / 1000;

    this.checkSoundTriggers(remainingSeconds);
    this.checkCountdownBeep(remainingSeconds);
    this.checkMinuteCallout(remainingSeconds);
    this.emitTick();

    if (remainingMs <= 0) {
      this.stopTimer();
      if (this.currentSequence?.use_background_music && this.bgMusicGain) {
        this.fadeOutBackgroundMusic();
      }
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

  private checkCountdownBeep(remainingSeconds: number): void {
    if (!this.currentSequence?.enable_countdown_beep) return;
    if (this.currentSequence.use_audio_only) return;

    const currentSecond = Math.ceil(remainingSeconds);
    if (currentSecond <= 0 || currentSecond === this.lastBeepSecond) return;

    if (remainingSeconds <= currentSecond && remainingSeconds > currentSecond - 0.15) {
      this.lastBeepSecond = currentSecond;
      this.playSynthBeep(1000, 80).catch(() => {});
    }
  }

  private checkMinuteCallout(remainingSeconds: number): void {
    if (!this.currentSequence?.minute_callout_sound?.file_url) return;
    if (this.currentSequence.use_audio_only) return;

    const currentMinute = Math.ceil(remainingSeconds / 60);
    const exactMinuteSeconds = currentMinute * 60;

    if (exactMinuteSeconds > 0 &&
        exactMinuteSeconds < this.currentSequence.total_duration_seconds &&
        !this.firedMinuteCallouts.has(exactMinuteSeconds) &&
        remainingSeconds <= exactMinuteSeconds &&
        remainingSeconds > exactMinuteSeconds - 0.5) {
      this.firedMinuteCallouts.add(exactMinuteSeconds);
      const url = this.currentSequence.minute_callout_sound.file_url;
      this.playSound(url).catch(() => {});
    }
  }

  private async fireSoundEvent(ss: StartSequenceSound): Promise<void> {
    const url = ss.custom_sound_url || ss.sound?.file_url;

    for (const cb of this.soundFiredCallbacks) {
      try { cb(ss); } catch {}
    }

    if (this.currentSequence?.use_background_music && this.bgMusicGain) {
      this.duckBackgroundMusic();
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
    const totalRemainingMs = this.getRemainingMs();
    const seq = this.currentSequence;

    let displayRemainingMs = totalRemainingMs;
    let displayTotalSeconds = seq?.total_duration_seconds || 0;
    let audioOnlyPreCountdown = false;
    let preCountdownRemainingMs = 0;

    if (seq?.use_audio_only && seq.countdown_start_seconds) {
      const introMs = seq.audio_offset_ms || 0;
      const countdownMs = seq.countdown_start_seconds * 1000;
      displayTotalSeconds = seq.countdown_start_seconds;

      if (totalRemainingMs > countdownMs) {
        audioOnlyPreCountdown = true;
        preCountdownRemainingMs = totalRemainingMs - countdownMs;
        displayRemainingMs = countdownMs;
      } else {
        displayRemainingMs = totalRemainingMs;
      }
    }

    const data: TimerTickData = {
      state: this.currentState,
      remainingMs: displayRemainingMs,
      remainingSeconds: displayRemainingMs / 1000,
      totalDurationSeconds: displayTotalSeconds,
      progress: this.totalDurationMs > 0 ? 1 - totalRemainingMs / this.totalDurationMs : 0,
      audioOnlyPreCountdown,
      preCountdownRemainingMs,
    };

    for (const cb of this.tickCallbacks) {
      try { cb(data); } catch {}
    }
  }
}

let instance: StartBoxAudioEngine | null = null;
let globalUnlockRegistered = false;

function registerGlobalUnlock(): void {
  if (globalUnlockRegistered) return;
  globalUnlockRegistered = true;

  const unlock = () => {
    if (instance) {
      instance.initialize().catch(() => {});
    }
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('click', unlock, true);
  };

  document.addEventListener('touchstart', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);
}

export function getStartBoxEngine(): StartBoxAudioEngine {
  if (!instance) {
    instance = new StartBoxAudioEngine();
    registerGlobalUnlock();
  }
  return instance;
}

export function destroyStartBoxEngine(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
