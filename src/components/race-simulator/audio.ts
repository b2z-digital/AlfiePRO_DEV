// Race sounds: the start sequence calls and gun (Appendix E timing), the recall, and hails from
// boats near you, spoken with the browser's voice; beeps come from the StartBox audio engine.
import { getStartBoxEngine } from '../../utils/startBoxAudio';
import { spellSail } from '@/sim/referee';
import { soundOut } from './soundHub';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** The best voice for Alfie: one on the device itself (it answers at once and works off-line), Australian or British first. */
export function pickVoice(vs: Pick<SpeechSynthesisVoice, 'lang' | 'localService' | 'name'>[]): number {
  const rank = (v: Pick<SpeechSynthesisVoice, 'lang' | 'localService'>) => {
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (!lang.startsWith('en')) return -1;
    return (v.localService ? 10 : 0) + (lang === 'en-au' ? 3 : lang === 'en-gb' ? 2 : 1);
  };
  let best = -1, at = -1;
  vs.forEach((v, i) => { const r = rank(v); if (r > best) { best = r; at = i; } });
  return at;
}

// Some browsers (Safari above all) only speak once a tap or key press has started a first line.
// Say nothing, silently, on the first touch of the page, so Alfie can speak when a race needs him.
let primed = false;
function primeSpeech() {
  if (primed || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  primed = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* no voice here */ }
}
if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, primeSpeech, { capture: true, once: true, passive: true });

export class RaceAudio {
  muted = false;
  /** Why Alfie can't be heard on this device, if the browser has said so ("not-allowed", "synthesis-failed"…). */
  problem: string | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private lines = new Set<SpeechSynthesisUtterance>();
  /** When a line was last handed to the browser, when one last started sounding, and when speech was last cut off. */
  private askedAt = -1e9;
  private startedAt = -1e9;
  private cutAt = -1e9;
  private hailAt = -1e9;
  private timer: number | null = null;
  private readonly pick = () => {
    const vs = window.speechSynthesis.getVoices();
    const i = pickVoice(vs);
    this.voice = i >= 0 ? vs[i] : null;
  };

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.pick();
    window.speechSynthesis.addEventListener?.('voiceschanged', this.pick);
  }

  /** Call from a click so the browser lets the page make sound. */
  unlock() { getStartBoxEngine().initialize().catch(() => {}); soundOut(); primeSpeech(); }

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  /** The browser's voice can stick, and then says nothing more: left paused after the tab was
   *  hidden, or "speaking" for ever after a line that never finished. Free it. */
  private unstick(synth: SpeechSynthesis): void {
    try {
      if (synth.paused) synth.resume();
      const now = performance.now();
      if ((synth.speaking || synth.pending) && now - Math.max(this.askedAt, this.startedAt) > 12000) { synth.cancel(); this.cutAt = now; this.lines.clear(); }
    } catch { /* carry on */ }
  }

  /**
   * Say a line in Alfie's voice. An urgent one cuts in on whatever is being said; any other waits
   * its turn. (A line is never handed over in the same instant as speech is cut off: some browsers
   * drop it, and after a run of those stop speaking altogether.)
   */
  say(text: string, urgent = false, as: 'alfie' | 'skipper' = 'alfie') {
    const synth = this.synth;
    if (this.muted || !synth || !text.trim()) return;
    this.unstick(synth);
    const now = performance.now();
    if (urgent && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch { /* carry on */ } this.cutAt = now; this.lines.clear(); }
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = urgent ? 1.15 : 1.05;
    // Another skipper's hail is pitched up a little, so you can tell it from your coach.
    if (as === 'skipper') { u.pitch = 1.25; u.volume = 0.8; }
    // (Kept hold of until it's said: some browsers drop a line nothing refers to, mid-sentence.)
    this.lines.add(u);
    u.onstart = () => { this.startedAt = performance.now(); this.problem = null; };
    u.onend = () => { this.lines.delete(u); };
    u.onerror = e => {
      this.lines.delete(u);
      const why = (e as SpeechSynthesisErrorEvent).error;
      if (why && why !== 'interrupted' && why !== 'canceled') this.problem = why;
    };
    this.askedAt = now;
    const wait = Math.max(0, this.cutAt + 90 - now);
    const go = () => { try { if (!this.muted) synth.speak(u); } catch { this.problem = 'synthesis-failed'; } };
    if (wait > 0) { if (this.timer != null) window.clearTimeout(this.timer); this.timer = window.setTimeout(go, wait); } else go();
  }

  /**
   * A hail from a boat near you ("Starboard!"). It's said only when nobody is speaking (the hail
   * shows over the boat as well), and never on top of the last one: in a crowd at the start the
   * hails would otherwise cut Alfie off every time he opened his mouth.
   */
  hail(text: string) {
    const synth = this.synth;
    if (this.muted || !synth) return;
    const now = performance.now();
    if (this.speaking || now - this.hailAt < 1500) return;
    this.hailAt = now;
    this.say(text.replace(/!/g, ''), false, 'skipper');
  }

  /** Is something being said right now (a hail, a recall, a call from the coach)? */
  get speaking(): boolean {
    const synth = this.synth;
    if (!synth) return false;
    if (!(synth.speaking || synth.pending)) return false;
    // (Stuck "speaking" long after the last line was handed over: it isn't, and mustn't hold Alfie up.)
    if (performance.now() - Math.max(this.askedAt, this.startedAt) > 12000) { this.unstick(synth); return false; }
    return true;
  }

  beep(freq = 880, ms = 150) {
    if (this.muted) return;
    getStartBoxEngine().playSynthBeep(freq, ms).catch(() => {});
  }

  /** Start sequence: whole minutes, every 10 s in the last minute, every second in the last 10. */
  signal(remaining: number) {
    if (remaining <= 0) return;
    if (remaining <= 10) { this.say(NUM[remaining] ?? String(remaining), true); this.beep(1000, 90); return; }
    if (remaining % 60 === 0) { const m = remaining / 60; this.say(m === 1 ? 'One minute' : `${NUM[m] ?? m} minutes`); this.beep(880, 250); return; }
    if (remaining < 60 && remaining % 10 === 0) { this.say(`${remaining} seconds`); this.beep(880, 120); }
  }

  gun() { this.beep(1200, 650); }

  recall(sails: string[]) {
    if (!sails.length) return;
    this.say(`Recall. ${sails.map(spellSail).join(', ')}`, true);
  }

  stop() {
    if (this.timer != null && typeof window !== 'undefined') { window.clearTimeout(this.timer); this.timer = null; }
    const synth = this.synth;
    if (synth && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch { /* gone */ } this.cutAt = performance.now(); }
    this.lines.clear();
  }

  /** Leaving the race. */
  dispose() {
    this.stop();
    this.synth?.removeEventListener?.('voiceschanged', this.pick);
  }
}
