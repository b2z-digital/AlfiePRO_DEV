// The club's StartBox start sequences in the simulator: the same start the club races to. The race
// counts down the club's own sequence, and when it's a recording (as most clubs' are) the recording
// plays in step with the race clock: it pauses when the race does, keeps up when you speed up, and
// picks up at the right place after a take-over. A sequence of separate sounds plays each one when
// its time comes. Only with no StartBox sequence at all does the simulator call the start itself.
import type { StartSequence } from '@/types/startBox';
import { getStartBoxEngine } from '@/utils/startBoxAudio';
import { soundOut } from './soundHub';

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

/** The club's scratch start sequences, its own first, then StartBox's defaults. Null if StartBox couldn't be read. */
export async function loadClubSequences(clubId: string | null): Promise<SimSequence[] | null> {
  try {
    const { getSequences } = await import('@/utils/startBoxStorage');
    const all = await getSequences(clubId);
    // (StartBox always has its own defaults, so nothing at all means it couldn't be read.)
    if (!all.length) return null;
    const out = all.map(s => toSimSequence(s, clubId)).filter((x): x is SimSequence => !!x);
    return [...out.filter(x => x.club), ...out.filter(x => !x.club)];
  } catch {
    return null;
  }
}

/**
 * The sequence a race starts with. StartBox calls every start it can: the one you chose; failing
 * that the club's own start of the length set up, then any of the club's own, then a StartBox
 * default of that length, then the shortest there is. Null only when there's no sequence at all
 * (no club, or StartBox couldn't be read), and then the simulator calls the start itself.
 */
export function chosenSequence(sequences: SimSequence[], id: string | null | undefined, seconds?: number): SimSequence | null {
  if (!sequences.length) return null;
  const mine = sequences.filter(q => q.club);
  return (id ? sequences.find(q => q.id === id) : undefined)
    ?? mine.find(q => q.seconds === seconds) ?? mine[0]
    ?? sequences.find(q => q.seconds === seconds)
    ?? [...sequences].sort((x, z) => x.seconds - z.seconds)[0];
}

// The sequences found last time, kept on this device by club: a race opened before StartBox has
// answered (or when it can't be reached) still starts with the club's own sequence.
const KEPT = 'alfie-race-sim-sequences-v1';
export function keptSequences(clubId: string | null): SimSequence[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEPT) ?? '{}') as Record<string, SimSequence[]>;
    const list = all[clubId ?? '-'];
    return Array.isArray(list) ? list.filter(q => q && typeof q.id === 'string' && typeof q.seconds === 'number') : [];
  } catch { return []; }
}
export function keepSequences(clubId: string | null, list: SimSequence[]) {
  if (!list.length) return;
  try {
    const all = JSON.parse(localStorage.getItem(KEPT) ?? '{}') as Record<string, SimSequence[]>;
    all[clubId ?? '-'] = list;
    localStorage.setItem(KEPT, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}

// ───────────────────────── recordings ─────────────────────────
// A club's recording is fetched whole and decoded once, the way StartBox itself plays it, and then
// played from memory: it starts on the instant from any place in it, with nothing to buffer or
// seek. (It used to be streamed through the browser's audio player and moved to the right place
// for every race. On a real club recording that move could take seconds or never settle, so the
// race waited, gave up, and the simulator's own beeps called the start.)

export interface Recording { buf: AudioBuffer | null; failed: boolean; done: Promise<void> }
const recordings = new Map<string, Recording>();

function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const w = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Off = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  // (Decoding needs no sound output, so it can be done before the page has been touched.)
  const ctx: BaseAudioContext | null = soundOut() ?? (Off ? new Off(1, 1, 44100) : null);
  if (!ctx) return Promise.reject(new Error('no audio'));
  return new Promise<AudioBuffer>((ok, no) => {
    const p = ctx.decodeAudioData(bytes, ok, no) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(ok, no);
  });
}

/** Fetch and decode a recording (once: asking again returns the same one, unless it failed). */
export function loadRecording(url: string): Recording {
  const had = recordings.get(url);
  if (had && !had.failed) return had;
  const rec: Recording = { buf: null, failed: false, done: Promise.resolve() };
  rec.done = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rec.buf = await decode(await res.arrayBuffer());
    } catch { rec.failed = true; }
  })();
  recordings.set(url, rec);
  // Keep this one and the one before it only: a decoded recording is tens of megabytes.
  for (const k of recordings.keys()) { if (recordings.size <= 2) break; if (k !== url) recordings.delete(k); }
  return rec;
}

/** Start a sequence's recording loading now (call when it's chosen, before the race). */
export function warmSequence(seq: SimSequence | null | undefined) {
  if (!seq?.audio || typeof window === 'undefined' || typeof fetch === 'undefined') return;
  loadRecording(seq.audio.url);
}

/**
 * Plays a sequence against the race clock. Call update() every frame; stop() when you leave.
 * A recording plays from memory through the simulator's sound output, started at the place the
 * race clock says and put back in step if it ever drifts; it pauses when the race does and runs
 * fast when the race does. Separate sounds play through StartBox's own audio.
 */
export class SequencePlayer {
  private rec: Recording | null = null;
  private src: AudioBufferSourceNode | null = null;
  /** Where the playing source began in the recording, when (on the output's clock), and how fast. */
  private from = 0;
  private at = 0;
  private rate = 1;
  private want = 0;
  private shouldPlay = false;
  private silentSince: number | null = null;
  private lastToGun = Infinity;
  private timers: number[] = [];
  /** How many times the recording has been (re)started: once a race when all is well. */
  starts = 0;

  constructor(private seq: SimSequence, private out: () => AudioContext | null = soundOut) {
    if (typeof window === 'undefined') return;
    if (seq.audio) this.rec = loadRecording(seq.audio.url);
    if (seq.sounds?.length) void preloadSounds(seq.sounds.map(x => x.url));
  }

  /** The recording is in memory (or there isn't one to wait for, or it can't be had). */
  get ready(): boolean { return !this.rec || this.rec.failed || !!this.rec.buf; }

  /** False if the club's recording couldn't be loaded: the simulator calls the start itself then. */
  get working(): boolean { return !this.rec?.failed; }

  /** Is the sequence making its sound right now? */
  get audible(): boolean {
    if (this.rec?.failed) return false;
    if (!this.rec) return !!this.seq.sounds?.length;
    return !!this.src && this.out()?.state === 'running';
  }

  /**
   * Is the sequence calling the start? True while it sounds, and for a moment while it gets going;
   * false once it has been silent for longer than that when it should be playing (still loading,
   * or no sound output), so the simulator makes the calls and a start is never silent.
   */
  get calling(): boolean {
    if (this.rec?.failed) return false;
    return this.silentSince == null || performance.now() - this.silentSince < 3000;
  }

  /** `toGun`: seconds to the gun (negative after it). `running`: the race clock is moving at `rate`. */
  update(toGun: number, running: boolean, rate: number, muted: boolean) {
    const s = this.seq, rec = this.rec;
    if (rec && s.audio && !rec.failed) {
      const into = s.seconds - toGun; // seconds since the countdown began
      this.want = (s.audio.startMs + s.audio.introMs) / 1000 + into;
      const end = Math.min(rec.buf?.duration ?? Infinity, s.audio.endMs != null ? s.audio.endMs / 1000 : Infinity);
      const over = toGun < -4 || into < 0 || this.want >= end - 0.05;
      this.shouldPlay = running && !muted && !over;
      const ctx = this.out();
      if (!this.shouldPlay || !rec.buf || !ctx || ctx.state !== 'running') this.halt();
      else if (!this.src || this.rate !== rate) this.begin(ctx, rec.buf, rate, end);
      else {
        // Out of step with the race clock (the race stuttered, or the tab slept): start again from
        // where it should be. Not within half a second of the last start, so it can't thrash.
        const pos = this.from + (ctx.currentTime - this.at) * this.rate;
        if (Math.abs(pos - this.want) > 0.25 && ctx.currentTime - this.at > 0.5) this.begin(ctx, rec.buf, rate, end);
      }
    }
    if (rec && this.shouldPlay && !this.audible) this.silentSince ??= performance.now();
    else this.silentSince = null;
    if (s.sounds && running && !muted) {
      for (const snd of s.sounds) {
        if (this.lastToGun > snd.at && toGun <= snd.at && this.lastToGun - toGun < 2) this.play(snd.url, snd.repeat, snd.gapMs / rate);
      }
    }
    this.lastToGun = toGun;
  }

  private begin(ctx: AudioContext, buf: AudioBuffer, rate: number, end: number) {
    this.halt();
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      src.onended = () => { if (this.src === src) this.src = null; };
      src.start(0, Math.max(0, this.want), Math.max(0.05, end - this.want));
      this.src = src; this.from = this.want; this.at = ctx.currentTime; this.rate = rate; this.starts++;
    } catch { this.src = null; }
  }

  private halt() {
    const src = this.src;
    if (!src) return;
    this.src = null;
    try { src.onended = null; src.stop(); src.disconnect(); } catch { /* already stopped */ }
  }

  private play(url: string, repeat: number, gapMs: number) {
    for (let k = 0; k < repeat; k++) {
      this.timers.push(window.setTimeout(() => { void playSound(url); }, k * gapMs));
    }
  }

  stop() {
    // The recording stays in memory for the next race.
    this.halt();
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
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
