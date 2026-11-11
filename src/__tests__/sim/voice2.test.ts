// Alfie's voice against a browser that behaves the way real ones do: lines dropped when handed over
// in the same instant as speech is cut off, and "speaking" that sticks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RaceAudio, pickVoice } from '@/components/race-simulator/audio';

class Utter { voice: unknown = null; rate = 1; pitch = 1; volume = 1; onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null; constructor(public text: string) {} }
class FakeSynth {
  speaking = false; pending = false; paused = false;
  spoken: { text: string; at: number; pitch: number }[] = []; cancels: number[] = [];
  getVoices() { return []; }
  addEventListener() { /* none */ } removeEventListener() { /* none */ }
  speak(u: Utter) { this.spoken.push({ text: u.text, at: now, pitch: u.pitch }); this.speaking = true; u.onstart?.(); }
  cancel() { this.cancels.push(now); this.speaking = false; this.pending = false; }
  resume() { this.paused = false; }
  finish() { this.speaking = false; }
}
let now = 100000;
let synth: FakeSynth;

beforeEach(() => {
  vi.useFakeTimers();
  now = 100000;
  synth = new FakeSynth();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('SpeechSynthesisUtterance', Utter);
  vi.stubGlobal('window', { speechSynthesis: synth, setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (id: number) => clearTimeout(id), addEventListener() { /* none */ } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const pass = (ms: number) => { now += ms; vi.advanceTimersByTime(ms); };

describe("Alfie's voice", () => {
  it('prefers a voice on the device, Australian then British, over one fetched from the internet', () => {
    const v = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });
    expect(pickVoice([v('Google UK English Female', 'en-GB', false), v('Samantha', 'en-US', true), v('Karen', 'en-AU', true), v('Daniel', 'en-GB', true)])).toBe(2);
    expect(pickVoice([v('Google UK English Female', 'en-GB', false), v('Samantha', 'en-US', true)])).toBe(1);
    expect(pickVoice([v('Thomas', 'fr-FR', true), v('Google US English', 'en_US', false)])).toBe(1);
    expect(pickVoice([v('Thomas', 'fr-FR', true)])).toBe(-1);
  });

  it("a skipper's hail never cuts Alfie off, and hails don't pile up", () => {
    const a = new RaceAudio();
    a.say('Headed. Tack now.');
    expect(synth.spoken.map(x => x.text)).toEqual(['Headed. Tack now.']);
    a.hail('Starboard!');                      // Alfie is speaking: the hail is only shown, not said
    a.hail('Up, up!');
    expect(synth.spoken.length).toBe(1);
    expect(synth.cancels.length).toBe(0);
    synth.finish(); pass(200);
    a.hail('Starboard!');                      // quiet now: said, in a skipper's voice
    expect(synth.spoken[1]).toMatchObject({ text: 'Starboard', pitch: 1.25 });
    synth.finish(); pass(300);
    a.hail('Room!');                           // too soon after the last hail
    expect(synth.spoken.length).toBe(2);
  });

  it('an urgent call cuts in, but is handed over a moment after the cut, not in the same instant', () => {
    const a = new RaceAudio();
    a.say('Lifted. Hold this tack.');
    pass(400);
    a.say('Nose-diving! Steer out of it.', true);
    expect(synth.cancels.length).toBe(1);
    expect(synth.spoken.length).toBe(1);       // not yet
    pass(100);
    expect(synth.spoken[1].text).toBe('Nose-diving! Steer out of it.');
    expect(synth.spoken[1].at - synth.cancels[0]).toBeGreaterThanOrEqual(90);
    // With nothing being said, an urgent call goes straight out and nothing is cut.
    synth.finish(); pass(500);
    a.say('Go now! Bear away and sheet in.', true);
    expect(synth.cancels.length).toBe(1);
    expect(synth.spoken.length).toBe(3);
  });

  it('a browser stuck "speaking" stops holding him up after twelve seconds, and is freed', () => {
    const a = new RaceAudio();
    a.say('Pinching. Bear away a touch.');
    expect(a.speaking).toBe(true);
    pass(5000);
    expect(a.speaking).toBe(true);            // (never told it finished)
    pass(8000);
    expect(a.speaking).toBe(false);
    expect(synth.cancels.length).toBe(1);
    pass(200);
    a.say('Sheet right in.');
    expect(synth.spoken.map(x => x.text)).toEqual(['Pinching. Bear away a touch.', 'Sheet right in.']);
  });

  it('says nothing when muted, and remembers why the browser refused', () => {
    const a = new RaceAudio();
    a.muted = true;
    a.say('Ease a touch.');
    expect(synth.spoken.length).toBe(0);
    a.muted = false;
    synth.speak = (u: Utter) => { u.onerror?.({ error: 'not-allowed' }); };
    a.say('Ease a touch.');
    expect(a.problem).toBe('not-allowed');
  });
});
