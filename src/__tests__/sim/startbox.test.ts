// Race simulator: the club's StartBox sequences, as the simulator uses them. Run with: npm test
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequencePlayer, SimSequence, chosenSequence, toSimSequence } from '@/components/race-simulator/startbox';
import type { StartSequence } from '@/types/startBox';

const base = { is_system_default: false, is_active: true, sort_order: 0, created_at: '', updated_at: '' };
const club = 'club-1';

describe('StartBox sequences', () => {
  it("takes a club's recorded scratch sequence: its countdown, and where it starts in the recording", () => {
    const s = toSimSequence({ ...base, id: 'a', club_id: club, name: '1 Minute Scratch', sequence_type: 'standard', race_type_default: 'scratch', total_duration_seconds: 60, use_audio_only: true, audio_file_url: 'https://x/1min.mp3', countdown_start_seconds: 60, audio_offset_ms: 4000, audio_start_ms: 500 } as StartSequence, club)!;
    expect(s).toMatchObject({ id: 'a', seconds: 60, club: true, audio: { url: 'https://x/1min.mp3', startMs: 500, introMs: 4000, endMs: null } });
    expect(s.sounds).toBeUndefined();
  });

  it('takes a sequence of separate sounds, each at its time before the gun', () => {
    const s = toSimSequence({ ...base, id: 'b', club_id: null, name: 'BOTW 5 Minutes', sequence_type: 'botw', total_duration_seconds: 300, is_system_default: true,
      sounds: [{ id: '1', sequence_id: 'b', sound_id: 's', trigger_time_seconds: 300, repeat_count: 1, sort_order: 0, created_at: '', sound: { file_url: 'https://x/horn.mp3' } }, { id: '2', sequence_id: 'b', sound_id: null, trigger_time_seconds: 0, repeat_count: 2, repeat_interval_ms: 400, sort_order: 1, created_at: '', custom_sound_url: 'https://x/gun.mp3' }] } as unknown as StartSequence, club)!;
    expect(s.club).toBe(false);
    expect(s.seconds).toBe(300);
    expect(s.sounds).toEqual([{ at: 300, url: 'https://x/horn.mp3', repeat: 1, gapMs: 600 }, { at: 0, url: 'https://x/gun.mp3', repeat: 2, gapMs: 400 }]);
  });

  it('leaves out handicap starts and sequences with nothing to play', () => {
    expect(toSimSequence({ ...base, id: 'c', club_id: club, name: '2 Minute HCap Count Up', sequence_type: 'handicap', race_type_default: 'handicap', total_duration_seconds: 120, use_audio_only: true, audio_file_url: 'https://x/h.mp3' } as StartSequence, club)).toBeNull();
    expect(toSimSequence({ ...base, id: 'd', club_id: club, name: 'Silent', sequence_type: 'standard', total_duration_seconds: 60 } as StartSequence, club)).toBeNull();
  });

  it("starts with the club's own sequence unless you choose another, or the simulator's calls", () => {
    const own: SimSequence = { id: 'own', name: '1 Minute Scratch', seconds: 60, club: true };
    const sys: SimSequence = { id: 'sys', name: 'BOTW 5 Minutes', seconds: 300, club: false };
    expect(chosenSequence([own, sys], undefined)).toBe(own);
    expect(chosenSequence([sys], undefined)).toBeNull(); // StartBox's defaults only when you pick one
    expect(chosenSequence([own, sys], 'sys')).toBe(sys);
    expect(chosenSequence([own, sys], null)).toBeNull();
    expect(chosenSequence([own], 'gone')).toBeNull();
  });
});

// A stand-in for the browser's audio element whose jumps take time, as they do when the part of
// the recording jumped to hasn't been fetched yet.
class SlowAudio {
  static made: SlowAudio[] = [];
  static seekTakes = 0.6;
  paused = true; seeking = false; readyState = 4; playbackRate = 1; muted = false; preload = ''; error = null;
  played = 0; seeks = 0;
  private t = 0; private left = 0;
  private on: Record<string, (() => void)[]> = {};
  constructor(public src: string) { SlowAudio.made.push(this); }
  get currentTime() { return this.t; }
  set currentTime(v: number) { this.t = v; this.seeking = true; this.left = SlowAudio.seekTakes; this.seeks++; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() { /* nothing to fetch */ }
  removeAttribute() { /* kept */ }
  addEventListener(e: string, f: () => void) { (this.on[e] ||= []).push(f); }
  removeEventListener(e: string, f: () => void) { this.on[e] = (this.on[e] ?? []).filter(x => x !== f); }
  tick(dt: number) {
    if (this.seeking) { this.left -= dt; if (this.left <= 0) { this.seeking = false; for (const f of this.on.seeked ?? []) f(); } return; }
    if (!this.paused) { this.t += dt * this.playbackRate; this.played += dt; }
  }
}

describe('a recorded sequence against the race clock', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const run = (seconds: number, introMs: number, raceSeconds: number, rate = 1) => {
    let now = 0;
    vi.stubGlobal('Audio', SlowAudio);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    SlowAudio.made = [];
    const seq: SimSequence = { id: `s${seconds}-${introMs}`, name: 'Recorded', seconds, club: true, audio: { url: `https://x/${seconds}-${introMs}.mp3`, startMs: 0, introMs, endMs: null } };
    const player = new SequencePlayer(seq);
    const el = SlowAudio.made[0];
    let t = 0, calledByRecording = 0, steps = 0;
    const dt = 1 / 60;
    while (t < raceSeconds) {
      player.update(seconds - t, true, rate, false);
      el.tick(dt);
      now += dt * 1000; t += dt * rate;
      steps++; if (player.calling) calledByRecording++;
    }
    const want = introMs / 1000 + t;
    player.stop();
    return { el, want, calling: calledByRecording / steps };
  };

  it('plays a one-minute start whose recording takes a while to jump to the countdown', () => {
    // The club's 1 Minute Scratch: 11 s of introduction before the countdown, so the race opens
    // with a jump into a part of the recording that isn't loaded yet.
    const { el, want } = run(60, 11022, 20);
    expect(el.played).toBeGreaterThan(18);
    expect(el.seeks).toBeLessThan(4);
    expect(Math.abs(el.currentTime - want)).toBeLessThan(0.35);
  });

  it('stays in step when the race runs fast', () => {
    const { el, want } = run(120, 6028, 40, 2.5);
    expect(el.played).toBeGreaterThan(14);
    expect(Math.abs(el.currentTime - want)).toBeLessThan(0.5);
  });

  it("hands the calls to the simulator when the recording won't sound", () => {
    SlowAudio.seekTakes = 1e6;
    const { el, calling } = run(60, 9000, 10);
    SlowAudio.seekTakes = 0.6;
    expect(el.played).toBe(0);
    expect(calling).toBeLessThan(0.2);
  });
});
