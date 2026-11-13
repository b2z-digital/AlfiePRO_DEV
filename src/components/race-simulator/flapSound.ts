// The sound of sails flogging: the sharp crack of light film snapping from side to side, made in
// the browser (no recordings). It reads the same flap clock the picture is drawn from (flap.ts), so
// each crack is a pop you can see. You hear your own boat's sails clearly, the boats around you
// more faintly, and a fleet stalled on the start line as a rattle all round. A sail that's sheeted in
// and full makes no sound at all.

import type { Race } from '@/sim/engine';
import { sailSet, twaFor } from './boat3d';
import { flapHz, flapLoud, flapNear, flapSeed, flapWave } from './flap';
import { soundOut } from './soundHub';

export const MASTER_FLAP = 0.9;
/** The most cracks started in one frame (the loudest win): a whole fleet flogging mustn't swamp the output. */
const PER_FRAME = 4;

export interface Crack { gain: number; kind: 'main' | 'jib'; pan: number }
type FlapBoat = Pick<Race['boats'][number], 'id' | 'x' | 'y' | 'hdg' | 'twd' | 'tws' | 'sheet' | 'sail' | 'tack' | 'finished' | 'disabled' | 'cls'>;

/**
 * The cracks due this frame, and how much film is shaking in all (for the rustle under them).
 * `side` remembers which side each sail's belly was on last frame: a crack is the moment it changes.
 * Pure but for that memory (tested).
 */
export function flapCracks(boats: FlapBoat[], t: number, ear: { x: number; y: number } | null, side: Map<string, number>): { due: Crack[]; shake: number } {
  // Watching from the bank, the nearest boat is "here": the rest fall away from her.
  let off = 0;
  if (ear && boats.length && !boats.some(b => b === ear)) off = Math.min(...boats.map(b => Math.hypot(b.x - ear.x, b.y - ear.y) / b.cls.loa));
  const due: Crack[] = [];
  let shake = 0;
  for (const b of boats) {
    if (b.finished) continue;
    const d = ear ? Math.max(0, Math.hypot(b.x - ear.x, b.y - ear.y) / b.cls.loa - off) : 0;
    const near = flapNear(d);
    if (near <= 0) continue;
    const set = sailSet(twaFor(b.twd, b.hdg), b.sheet, b.tws, !!b.disabled, b.tack);
    for (const kind of ['main', 'jib'] as const) {
      const luff = kind === 'main' ? set.luff : set.luffJib;
      const key = `${b.id}:${kind}`;
      if (luff < 0.15) { side.delete(key); continue; }
      const now = flapWave(t, flapHz(b.tws, kind), flapSeed(b.sail, kind)) >= 0 ? 1 : -1;
      const was = side.get(key);
      side.set(key, now);
      const loud = flapLoud(luff, b.tws) * near * (kind === 'jib' ? 0.7 : 1);
      shake += loud;
      // The belly has just popped across: a crack.
      if (was !== undefined && was !== now && loud > 0.012) due.push({ gain: loud, kind, pan: ear ? Math.max(-0.7, Math.min(0.7, (b.x - ear.x) / (6 * b.cls.loa))) : 0 });
    }
  }
  return { due, shake };
}

/** One crack of film: a hard, bright snap with a short dry body under it; sometimes a second, smaller, right behind. */
export function flapCrack(ctx: BaseAudioContext, to: AudioNode, buf: AudioBuffer, at: number, gain: number, kind: 'main' | 'jib', where = 0): void {
  const out = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
  if ('pan' in out) out.pan.value = where;
  out.connect(to);
  const burst = (t: number, peak: number, hz: number, q: number, dur: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.9, dur + 0.03);
  };
  const small = kind === 'jib';
  const vary = 0.8 + Math.random() * 0.45;
  // The snap: bright and very short.
  burst(at, gain * vary, (small ? 4600 : 3500) * (0.85 + Math.random() * 0.4), 0.9, small ? 0.03 : 0.042);
  // The body: the flat slap of the film's panel.
  burst(at, gain * vary * (small ? 0.5 : 0.85), (small ? 1500 : 950) * (0.85 + Math.random() * 0.3), 1.3, small ? 0.04 : 0.065);
  // Film crackles: often a second, smaller snap straight after.
  if (Math.random() < 0.45) burst(at + 0.014 + Math.random() * 0.02, gain * vary * 0.4, (small ? 5400 : 4300) * (0.9 + Math.random() * 0.3), 1.1, 0.022);
}

export class FlapSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rustle: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loop: AudioBufferSourceNode | null = null;
  /** Which side each sail's belly was on last frame (by boat and sail). */
  private side = new Map<string, number>();
  private stopped = false;
  /** How many cracks have sounded (for tests). */
  cracks = 0;

  /** Start (or start again after a stop). */
  start() { this.stopped = false; }

  private build() {
    const ctx = soundOut();
    if (!ctx) return;
    this.ctx = ctx;
    // A second of white noise: a crack is a few hundredths of a second of it, shaped.
    const n = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    // Under the cracks, the dry rustle of film shaking: the bright end of the noise, kept low.
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start();
    this.loop = src; this.rustle = g;
  }

  /**
   * Every frame: `ear` is the boat you're sailing (or, watching, where you're watching from).
   * `on`: sound is wanted (not muted, not paused).
   */
  update(race: Race, ear: { x: number; y: number } | null, on: boolean): void {
    if (this.stopped) return;
    if (!this.ctx) { try { this.build(); } catch { /* no sound on this device */ } }
    const ctx = this.ctx;
    const live = !!ctx && !!this.master && ctx.state === 'running';
    if (ctx && this.master && !live) soundOut();
    if (live) this.master!.gain.setTargetAtTime(on ? MASTER_FLAP : 0, ctx!.currentTime, on ? 0.05 : 0.08);
    const { due, shake } = flapCracks(race.boats, race.t, ear, this.side);
    if (!live || !on) return;
    const at = ctx!.currentTime;
    this.rustle!.gain.setTargetAtTime(0.02 * Math.min(1.6, shake), at, 0.07);
    due.sort((a, z) => z.gain - a.gain);
    for (const c of due.slice(0, PER_FRAME)) this.crack(at + Math.random() * 0.012, c.gain, c.kind, c.pan);
  }

  private crack(at: number, gain: number, kind: 'main' | 'jib', where: number) {
    const ctx = this.ctx, master = this.master, buf = this.noise;
    if (!ctx || !master || !buf) return;
    this.cracks++;
    flapCrack(ctx, master, buf, at, gain, kind, where);
  }

  /** Leaving the race: fade out and unplug (the output itself stays, for the next race). */
  stop() {
    this.stopped = true;
    const ctx = this.ctx, master = this.master, loop = this.loop;
    if (ctx && master) {
      try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* going anyway */ }
      window.setTimeout(() => {
        try { loop?.stop(); loop?.disconnect(); } catch { /* already stopped */ }
        try { master.disconnect(); } catch { /* already gone */ }
      }, 300);
    }
    this.ctx = null; this.master = null; this.rustle = null; this.loop = null;
  }
}
