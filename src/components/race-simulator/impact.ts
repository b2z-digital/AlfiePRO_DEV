// The sound of two hulls meeting: the sharp, dry crack of carbon on carbon. A light touch is a soft
// tick; a hard hit is a loud crack with a knock under it and a rattle after. Made in the browser.
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { soundOut } from './soundHub';

/** How hard two boats meet, 0 (a kiss) to 1 (flat out into each other): from how fast they're closing. Pure: tested. */
export function impactStrength(a: Pick<Boat, 'hdg' | 'spd' | 'cls'>, b: Pick<Boat, 'hdg' | 'spd' | 'cls'>): number {
  const v = (q: Pick<Boat, 'hdg' | 'spd'>) => ({ x: q.spd * Math.sin((q.hdg * Math.PI) / 180), y: q.spd * Math.cos((q.hdg * Math.PI) / 180) });
  const va = v(a), vb = v(b);
  const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
  const hull = Math.max(a.cls.hullSpeed, b.cls.hullSpeed) || 1;
  // Two boats at hull speed on opposite tacks close at about 1.4 times hull speed.
  return Math.max(0.05, Math.min(1, rel / (1.3 * hull)));
}

/** How loud a hit sounds from where you're watching: full close by, fading with distance (never silent). */
export function impactNear(distLengths: number): number {
  return Math.max(0.2, Math.min(1, 1.15 - distLengths / 45));
}

/** Play one crack: `strength` 0 to 1, `near` 0 to 1. */
export function playCrack(strength: number, near = 1): void {
  const ctx = soundOut();
  if (!ctx || ctx.state !== 'running') return;
  const out = crackInto(ctx, ctx.destination, strength, near, ctx.currentTime + 0.005);
  window.setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 700);
}

/** The crack itself, into any output at a given time (so it can be made and measured off-line). */
export function crackInto(ctx: BaseAudioContext, dest: AudioNode, strength: number, near: number, t0: number): GainNode {
  const s = Math.max(0, Math.min(1, strength));
  const vol = (0.05 + 0.31 * Math.pow(s, 1.3)) * near; // (the hardest hit peaks just under full scale)
  const out = ctx.createGain();
  out.gain.value = vol;
  out.connect(dest);
  const crack = (at: number, level: number, bright: number) => {
    // The crack itself: a few thousandths of a second of noise, all top end, gone at once.
    const n = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + 900 * bright;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3200 + 1400 * bright; pk.Q.value = 1.6; pk.gain.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.028 + 0.05 * s);
    src.connect(hp); hp.connect(pk); pk.connect(g); g.connect(out);
    src.start(at); src.stop(at + 0.1);
    // The thin shell ringing: two high, dry notes that die in a few hundredths of a second.
    for (const [hz, lv, dur] of [[1850, 0.35, 0.035], [2950, 0.22, 0.022]] as const) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(hz * (1 + 0.08 * bright), at);
      o.frequency.exponentialRampToValueAtTime(hz * 0.82, at + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(lv * level, at);
      og.gain.exponentialRampToValueAtTime(0.0006, at + dur + 0.02 * s);
      o.connect(og); og.connect(out);
      o.start(at); o.stop(at + dur + 0.05);
    }
  };
  crack(t0, 1, 0.3 + 0.7 * s);
  if (s > 0.35) {
    // A real hit: the knock of the hulls under the crack…
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(210, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7 * s, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.12);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.14);
  }
  if (s > 0.6) {
    // …and for a big one, the boats bouncing and the rigs rattling.
    crack(t0 + 0.07 + 0.03 * Math.random(), 0.45, 0.5);
    crack(t0 + 0.16 + 0.04 * Math.random(), 0.22, 0.2);
  }
  return out;
}

/** Listens to a race for hulls touching, and sounds each new touch once. */
export class Impacts {
  private heard = new Map<string, number>();

  /** Call every frame (cheap): `ear` is where you're watching from, or the boat you're sailing. */
  update(race: Race, ear: { x: number; y: number } | null, on: boolean): void {
    const boats = race.boats;
    for (let i = 0; i < boats.length; i++) {
      const a = boats[i];
      for (const id in a.contactWith) {
        if (id <= a.id) continue;                       // each pair once
        const at = a.contactWith[id], key = `${a.id}|${id}`;
        if (this.heard.get(key) === at) continue;
        this.heard.set(key, at);
        if (!on || race.t - at > 0.5) continue;        // (old news: a touch from before you were listening)
        const b = race.boatById(id);
        const L = a.cls.loa;
        const d = ear ? Math.hypot((a.x + b.x) / 2 - ear.x, (a.y + b.y) / 2 - ear.y) / L : 0;
        playCrack(impactStrength(a, b), impactNear(d));
      }
    }
  }
}
