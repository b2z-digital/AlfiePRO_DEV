// The club's StartBox start sequences in the simulator. The race counts down the club's own
// sequence, and when it's a recording (as most clubs' are) the recording plays in step with the
// race clock: it pauses when the race does, keeps up when you speed up, and picks up at the right
// place after a take-over. A sequence of separate sounds plays each one when its time comes.
// Without a club sequence, the simulator calls the start itself (RaceAudio.signal).
import type { StartSequence } from '@/types/startBox';
import { getStartBoxEngine } from '@/utils/startBoxAudio';

export interface SimSequence {
  id: string;
  name: string;
  /** The countdown, in seconds to the gun. */
  seconds: number;
  /** The club's own (rather than a StartBox default). */
  club: boolean;
  /** One recording of the whole sequence: where the countdown starts in it, and where it ends. */
  audio?: { url: string; startMs: number; introMs: number; endMs: number | null };
  /** Or a sound at each time before the gun. */
  sounds?: { at: number; url: string; repeat: number; gapMs: number }[];
}

/** A StartBox sequence as the simulator uses it, or null if it isn't a start for a scratch race. */
export function toSimSequence(s: StartSequence, clubId: string | null): SimSequence | null {
  if (s.sequence_type === 'handicap' || s.race_type_default === 'handicap') return null;
  const recorded = !!(s.use_audio_only && s.audio_file_url);
  const seconds = recorded && s.countdown_start_seconds ? s.countdown_start_seconds : s.total_duration_seconds;
  if (!seconds || seconds < 20 || seconds > 600) return null;
  const sounds = (s.sounds ?? [])
    .map(x => ({ at: x.trigger_time_seconds, url: x.custom_sound_url || x.sound?.file_url || '', repeat: Math.max(1, x.repeat_count || 1), gapMs: x.repeat_interval_ms ?? 600 }))
    .filter(x => x.url && x.at >= 0 && x.at <= seconds);
  if (!recorded && !sounds.length) return null;
  return {
    id: s.id, name: s.name, seconds, club: !!clubId && s.club_id === clubId,
    audio: recorded ? { url: s.audio_file_url!, startMs: s.audio_start_ms ?? 0, introMs: s.audio_offset_ms ?? 0, endMs: s.audio_end_ms ?? null } : undefined,
    sounds: recorded ? undefined : sounds,
  };
}

/** The club's scratch start sequences, its own first, then StartBox's defaults. */
export async function loadClubSequences(clubId: string | null): Promise<SimSequence[]> {
  try {
    const { getSequences } = await import('@/utils/startBoxStorage');
    const all = await getSequences(clubId);
    const out = all.map(s => toSimSequence(s, clubId)).filter((x): x is SimSequence => !!x);
    return [...out.filter(x => x.club), ...out.filter(x => !x.club)];
  } catch {
    return [];
  }
}

/** The sequence a race starts with: the one you chose, or else the club's own if it has one. */
export function chosenSequence(sequences: SimSequence[], id: string | null | undefined): SimSequence | null {
  if (id === undefined) return sequences[0]?.club ? sequences[0] : null;
  return id === null ? null : sequences.find(q => q.id === id) ?? null;
}

// Recordings already loading or loaded, by address: choosing a sequence on the home screen starts
// its recording loading, so it's ready when the race starts (a one-minute start begins counting
// down the moment the race opens, with no time to fetch it).
const warm = new Map<string, HTMLAudioElement>();
function recording(url: string): HTMLAudioElement {
  let el = warm.get(url);
  if (!el) {
    el = new Audio(url);
    el.preload = 'auto';
    warm.set(url, el);
    // Keep the last few only.
    for (const k of warm.keys()) { if (warm.size <= 3) break; if (k !== url) { const old = warm.get(k)!; old.removeAttribute('src'); old.load(); warm.delete(k); } }
  }
  return el;
}
/** Start a sequence's recording loading now (call when it's chosen, before the race). */
export function warmSequence(seq: SimSequence | null | undefined) {
  if (!seq?.audio || typeof window === 'undefined' || typeof Audio === 'undefined') return;
  try { recording(seq.audio.url).load(); } catch { /* it loads when the race starts */ }
}

/**
 * Plays a sequence against the race clock. Call update() every frame; stop() when you leave.
 * A recording plays in an audio element (so it keeps its pitch when the race runs fast); separate
 * sounds play through StartBox's own audio, which the race unlocks when you first tap or press a key.
 */
export class SequencePlayer {
  private el: HTMLAudioElement | null = null;
  private failed = false;
  private starting = false;
  private retryAt = 0;
  private want = 0;
  private shouldPlay = false;
  /** When the last jump in the recording was asked for, and how long jumps have been taking. */
  private seekAt = -1e9;
  private seekLag = 0;
  private silentSince: number | null = null;
  private readonly onError = () => { this.failed = true; };
  private readonly onSeeked = () => { this.seekLag = Math.min(2, Math.max(0, (performance.now() - this.seekAt) / 1000)); };
  private lastToGun = Infinity;
  private timers: number[] = [];
  private readonly unlock = () => this.prime();

  constructor(private seq: SimSequence) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (seq.audio) {
      this.el = recording(seq.audio.url);
      if (this.el.error) { warm.delete(seq.audio.url); this.el = recording(seq.audio.url); }
      this.el.addEventListener('error', this.onError);
      this.el.addEventListener('seeked', this.onSeeked);
    }
    if (seq.sounds?.length) void preloadSounds(seq.sounds.map(x => x.url));
    // Some browsers (Safari on iPhone and iPad) only let a page play sound that a tap or key press started.
    for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, this.unlock, true);
  }

  /** False if the club's recording couldn't be loaded: the simulator calls the start itself then. */
  get working(): boolean { return !this.failed; }

  /**
   * Is the sequence making its sound right now? False while a recording is still loading or
   * catching up (the simulator makes that call itself, so a start is never silent).
   */
  get audible(): boolean {
    if (this.failed) return false;
    if (!this.el) return !!this.seq.sounds?.length;
    return !this.el.paused && !this.el.seeking && this.el.readyState >= 3;
  }

  /**
   * Is the sequence calling the start? True while it sounds, and for a moment while a recording
   * gets going; false once it has been silent for longer than that when it should be playing.
   */
  get calling(): boolean {
    if (this.failed) return false;
    return this.silentSince == null || performance.now() - this.silentSince < 1500;
  }

  /** `toGun`: seconds to the gun (negative after it). `running`: the race clock is moving at `rate`. */
  update(toGun: number, running: boolean, rate: number, muted: boolean) {
    const s = this.seq;
    if (this.el && s.audio && !this.failed) {
      const el = this.el;
      const into = s.seconds - toGun; // seconds since the countdown began
      this.want = (s.audio.startMs + s.audio.introMs) / 1000 + into;
      const over = toGun < -4 || into < 0 || (s.audio.endMs != null && this.want * 1000 >= s.audio.endMs);
      this.shouldPlay = running && !muted && !over;
      if (!this.shouldPlay) {
        if (!el.paused) el.pause();
      } else {
        if (el.playbackRate !== rate) el.playbackRate = rate;
        if (el.paused) {
          if (!this.starting && performance.now() >= this.retryAt) this.start();
        } else if (!el.seeking && el.readyState >= 3 && Math.abs(el.currentTime - this.want) > 0.35) {
          // Out of step with the race clock: jump to where it should be. Never while a jump is
          // still under way or the recording is still loading: a jump that takes longer than the
          // step we allow would be restarted every frame, and the recording would never sound.
          // Aim ahead by as long as jumps have been taking, so it lands in step.
          this.seek(this.want + this.seekLag * rate);
        }
      }
    }
    if (this.el && this.shouldPlay && !this.audible) this.silentSince ??= performance.now();
    else this.silentSince = null;
    if (s.sounds && running && !muted) {
      for (const snd of s.sounds) {
        if (this.lastToGun > snd.at && toGun <= snd.at && this.lastToGun - toGun < 2) this.play(snd.url, snd.repeat, snd.gapMs / rate);
      }
    }
    this.lastToGun = toGun;
  }

  private start() {
    const el = this.el;
    if (!el) return;
    this.seek(this.want);
    this.starting = true;
    el.play().then(
      () => { this.starting = false; if (!this.shouldPlay) el.pause(); },
      // Not allowed yet (no tap or key press), or still loading: try again shortly.
      () => { this.starting = false; this.retryAt = performance.now() + 1500; },
    );
  }

  private seek(to: number) {
    const el = this.el;
    if (!el) return;
    this.seekAt = performance.now();
    try { el.currentTime = Math.max(0, to); } catch { /* not loaded yet */ }
  }

  /** On a tap or key press: start the recording if it should be playing, so the browser allows it. */
  private prime() {
    const el = this.el;
    if (!el || this.failed || !el.paused || this.starting) return;
    if (this.shouldPlay) { this.start(); return; }
    // Not yet: play and pause at once, which is enough for the browser to allow it later.
    const muted = el.muted;
    el.muted = true;
    this.starting = true;
    el.play().then(() => { el.pause(); }, () => undefined).finally(() => { el.muted = muted; this.starting = false; });
  }

  private play(url: string, repeat: number, gapMs: number) {
    for (let k = 0; k < repeat; k++) {
      this.timers.push(window.setTimeout(() => { void playSound(url); }, k * gapMs));
    }
  }

  stop() {
    // The recording stays loaded for the next race.
    if (this.el) { this.el.pause(); this.el.playbackRate = 1; this.el.removeEventListener('error', this.onError); this.el.removeEventListener('seeked', this.onSeeked); }
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown'] as const) window.removeEventListener(ev, this.unlock, true);
  }
}

async function preloadSounds(urls: string[]) {
  try {
    // StartBox loads the sounds of a sequence ahead of time; these are the only parts it needs.
    await getStartBoxEngine().preloadSequence({ sounds: urls.map(u => ({ custom_sound_url: u })) } as unknown as StartSequence);
  } catch { /* they'll load when they first play */ }
}

async function playSound(url: string) {
  try { await getStartBoxEngine().playSound(url); } catch { /* no sound */ }
}
