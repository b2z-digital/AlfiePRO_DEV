// The sound of a day at the pond, made in the browser (no recordings, nothing to download): the
// wind, water lapping at the bank, your own boat's wash, the rig humming in a blow, and birds now
// and then. It follows the race: in light airs you hear only the water and the birds; a medium
// breeze brings the wind in, with more of it in the gusts; fresh, it's loud and the rig whistles.
// Everything fades in and out, and it goes quiet when the race is paused or muted.

import { soundOut } from './soundHub';

export interface AmbienceState {
  /** The wind at your boat, knots. */
  kn: number;
  /** Your boat's speed as a share of her hull speed, 0 to about 1.3. */
  fast: number;
  /** Chop or rough water: 0 flat, 1 rough. */
  sea: number;
  /** The race is running (not paused, not over). */
  running: boolean;
  muted: boolean;
}

/** How loud each part is for the conditions, 0 to 1 (before the master volume). Pure: tested. */
export function ambienceMix(s: Pick<AmbienceState, 'kn' | 'fast' | 'sea'>) {
  const k = Math.max(0, s.kn);
  const ramp = (a: number, b: number, x: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  return {
    // No wind to hear under about 5 knots; building steadily to a roar at 20.
    wind: Math.pow(ramp(5, 20, k), 1.3),
    // The wind's pitch rises as it builds.
    windHz: 260 + 520 * ramp(4, 22, k),
    // The rig only whistles in a real breeze.
    whistle: Math.pow(ramp(13, 24, k), 1.6) * 0.55,
    // Water at the bank: always there, livelier with chop and breeze.
    lap: 0.35 + 0.3 * ramp(3, 16, k) + 0.25 * s.sea,
    // Your boat's wash grows with her speed.
    wash: Math.pow(Math.max(0, Math.min(1.2, s.fast)), 2) * 0.5,
    // Birds sing in light airs, less as it blows up, and hardly at all in a blow.
    birds: 1 - 0.85 * ramp(8, 20, k),
  };
}

const MASTER = 0.5;

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private whistle: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wash: GainNode | null = null;
  private lapBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextLap = 0;
  private nextBird = 0;
  private gust = 0;
  private stopped = false;
  private loops: AudioBufferSourceNode[] = [];
  private mix = ambienceMix({ kn: 0, fast: 0, sea: 0 });

  /** Start (or start again): on the simulator's shared sound output, as soon as the browser allows
   *  it. That's once you've touched the page anywhere, not only inside this race. */
  unlock() {
    if (typeof window === 'undefined') return;
    this.stopped = false;
    try { if (!this.ctx) this.build(); } catch { /* no sound on this device */ }
  }

  private build() {
    const ctx = soundOut();
    if (!ctx) return;
    this.ctx = ctx;
    // Four seconds of soft noise, looped: the raw material for wind and water. (Slightly "pink":
    // more low than high, which sounds like air and water rather than a hiss.)
    const n = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
      // Join the loop's ends smoothly.
      const f = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const u = i / f; d[i] = d[i] * u + d[n - f + i] * (1 - u); }
    }
    this.noise = buf;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    const loop = (offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.start(0, offset);
      this.loops.push(src);
      return src;
    };
    // The wind: noise through a low band that opens up as it blows.
    {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.55;
      const g = ctx.createGain(); g.gain.value = 0;
      loop(0).connect(f); f.connect(g); g.connect(master);
      this.wind = { gain: g, filter: f };
    }
    // The rig: a narrow, higher band.
    {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 7;
      const g = ctx.createGain(); g.gain.value = 0;
      loop(1.3).connect(f); f.connect(g); g.connect(master);
      this.whistle = { gain: g, filter: f };
    }
    // Your boat's wash: the bright end of the noise.
    {
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
      const g = ctx.createGain(); g.gain.value = 0;
      loop(2.1).connect(f); f.connect(g); g.connect(master);
      this.wash = g;
    }
    // Lapping at the bank: short swells of noise, one after another (scheduled in update).
    {
      const g = ctx.createGain(); g.gain.value = 1;
      g.connect(master);
      this.lapBus = g;
    }
    this.nextLap = ctx.currentTime + 0.4;
    this.nextBird = ctx.currentTime + 3 + Math.random() * 5;
  }

  /** Every frame (or a few times a second): follow the race. */
  update(s: AmbienceState) {
    // (The output opens with your first touch of the page: pick it up the moment it's there.)
    if (!this.ctx && !this.stopped) this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.master || this.stopped) return;
    if (ctx.state !== 'running') { soundOut(); return; }
    const now = ctx.currentTime;
    const on = s.running && !s.muted;
    this.master.gain.setTargetAtTime(on ? MASTER : 0, now, on ? 0.6 : 0.15);
    if (!on) return;
    const m = ambienceMix(s);
    this.mix = m;
    // The wind isn't steady: it breathes, slowly and at random.
    this.gust += (Math.random() - 0.5) * 0.06 - this.gust * 0.02;
    const breath = 1 + Math.max(-0.35, Math.min(0.45, this.gust));
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0.9 * m.wind * breath, now, 0.5);
      this.wind.filter.frequency.setTargetAtTime(m.windHz * (0.9 + 0.2 * breath), now, 0.7);
    }
    if (this.whistle) {
      this.whistle.gain.gain.setTargetAtTime(0.16 * m.whistle * breath, now, 0.4);
      this.whistle.filter.frequency.setTargetAtTime(1500 + 900 * m.whistle * breath, now, 0.5);
    }
    if (this.wash) this.wash.gain.setTargetAtTime(0.22 * m.wash, now, 0.35);
    // Schedule the next little waves and the next bird a moment ahead.
    while (this.nextLap < now + 0.5) {
      this.lap(this.nextLap, m.lap);
      this.nextLap += (0.55 + Math.random() * 1.1) / (0.7 + 0.6 * m.lap);
    }
    if (this.nextBird < now + 0.5) {
      if (Math.random() < m.birds) this.bird(this.nextBird);
      this.nextBird = now + 5 + Math.random() * 16;
    }
  }

  /** One little wave on the bank: a soft swell of noise that washes in and drains away. */
  private lap(at: number, level: number) {
    const ctx = this.ctx, bus = this.lapBus, buf = this.noise;
    if (!ctx || !bus || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    const hz = 500 + Math.random() * 900;
    f.frequency.setValueAtTime(hz, at);
    f.frequency.exponentialRampToValueAtTime(hz * 1.9, at + 0.5);
    const g = ctx.createGain();
    const peak = 0.16 * level * (0.5 + Math.random() * 0.7), dur = 0.5 + Math.random() * 0.5;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const pan = this.pan(ctx, Math.random() * 1.4 - 0.7);
    src.connect(f); f.connect(g); g.connect(pan); pan.connect(bus);
    src.start(at, Math.random() * 3, dur + 0.1);
  }

  /** A bird: a short phrase of whistled notes, somewhere off to one side. */
  private bird(at: number) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    const pan = this.pan(ctx, Math.random() * 1.8 - 0.9);
    const out = ctx.createGain();
    out.gain.value = 0.05 + Math.random() * 0.05;
    out.connect(pan); pan.connect(master);
    const kind = Math.floor(Math.random() * 3);
    let t = at;
    if (kind === 0) {
      // A small bird's chatter: quick rising chirps.
      const n = 3 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1400;
      for (let i = 0; i < n; i++) { this.note(ctx, out, t, base * (0.92 + Math.random() * 0.2), base * (1.25 + Math.random() * 0.3), 0.06 + Math.random() * 0.05); t += 0.11 + Math.random() * 0.09; }
    } else if (kind === 1) {
      // A two-note whistle, the second lower, said twice.
      const hi = 2100 + Math.random() * 500;
      for (let i = 0; i < 2; i++) { this.note(ctx, out, t, hi, hi * 1.03, 0.16); this.note(ctx, out, t + 0.22, hi * 0.76, hi * 0.72, 0.24); t += 0.75; }
    } else {
      // A water bird's cry, falling away.
      const hi = 1500 + Math.random() * 400;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { this.note(ctx, out, t, hi, hi * 0.62, 0.3, 14); t += 0.5 + Math.random() * 0.25; }
    }
  }

  private note(ctx: AudioContext, out: AudioNode, at: number, from: number, to: number, dur: number, vibrato = 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, to), at + dur);
    if (vibrato) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = vibrato; lg.gain.value = from * 0.03;
      l.connect(lg); lg.connect(o.frequency);
      l.start(at); l.stop(at + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(1, at + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + dur + 0.05);
  }

  private pan(ctx: AudioContext, where: number): AudioNode {
    if (typeof ctx.createStereoPanner !== 'function') return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = where;
    return p;
  }

  /** What's sounding now (for tests and the settings screen). */
  get levels() { return this.mix; }

  /** Leaving the race: fade out and unplug (the output itself stays, for the next race). */
  stop() {
    this.stopped = true;
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); } catch { /* going anyway */ }
    const loops = this.loops;
    window.setTimeout(() => {
      for (const l of loops) { try { l.stop(); l.disconnect(); } catch { /* already stopped */ } }
      try { master.disconnect(); } catch { /* already gone */ }
    }, 400);
    this.ctx = null; this.master = null; this.wind = null; this.whistle = null; this.wash = null; this.lapBus = null; this.loops = [];
  }
}
