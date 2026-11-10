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
  private lastToGun = Infinity;
  private timers: number[] = [];
  private readonly unlock = () => this.prime();

  constructor(private seq: SimSequence) {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (seq.audio) {
      this.el = new Audio(seq.audio.url);
      this.el.preload = 'auto';
      this.el.addEventListener('error', () => { this.failed = true; });
    }
    if (seq.sounds?.length) void preloadSounds(seq.sounds.map(x => x.url));
    // Some browsers (Safari on iPhone and iPad) only let a page play sound that a tap or key press started.
    for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, this.unlock, true);
  }

  /** False if the club's recording couldn't be loaded: the simulator calls the start itself then. */
  get working(): boolean { return !this.failed; }

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
        } else if (Math.abs(el.currentTime - this.want) > 0.35) {
          try { el.currentTime = this.want; } catch { /* still seeking */ }
        }
      }
    }
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
    try { el.currentTime = this.want; } catch { /* not loaded yet */ }
    this.starting = true;
    el.play().then(
      () => { this.starting = false; if (!this.shouldPlay) el.pause(); },
      // Not allowed yet (no tap or key press), or still loading: try again shortly.
      () => { this.starting = false; this.retryAt = performance.now() + 1500; },
    );
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
    if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
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
