// Race sounds: the start sequence calls and gun (Appendix E timing), the recall, and hails from
// boats near you, spoken with the browser's voice; beeps come from the StartBox audio engine.
import { getStartBoxEngine } from '../../utils/startBoxAudio';
import { spellSail } from '@/sim/referee';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export class RaceAudio {
  muted = false;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      this.voice = vs.find(v => /en[-_](AU|GB)/i.test(v.lang)) ?? vs.find(v => /^en/i.test(v.lang)) ?? null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  /** Call from a click so the browser lets the page make sound. */
  unlock() { getStartBoxEngine().initialize().catch(() => {}); }

  say(text: string, urgent = false) {
    if (this.muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = urgent ? 1.15 : 1.05;
    if (urgent) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
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

  stop() { if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }
}
