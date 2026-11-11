// Race simulator: the club's StartBox sequences, as the simulator uses them. Run with: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SequencePlayer, SimSequence, chosenSequence, keepSequences, keptSequences, loadRecording, toSimSequence, warmSequence } from '@/components/race-simulator/startbox';
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

  it('StartBox calls every start it can: your choice, else the club\'s own of the length set up, else a default', () => {
    const one: SimSequence = { id: 'one', name: '1 Minute Scratch', seconds: 60, club: true };
    const two: SimSequence = { id: 'two', name: '2 Minute Scratch', seconds: 120, club: true };
    const sys5: SimSequence = { id: 'sys5', name: 'BOTW 5 Minutes', seconds: 300, club: false };
    const sys1: SimSequence = { id: 'sys1', name: 'StartBox 1 Minute', seconds: 60, club: false };
    expect(chosenSequence([one, two, sys5], 'two', 60)).toBe(two);
    // No choice made: the club's own of the length set up, or its first.
    expect(chosenSequence([one, two, sys5], undefined, 120)).toBe(two);
    expect(chosenSequence([one, two, sys5], undefined, 180)).toBe(one);
    // "The simulator's calls" chosen before, or a sequence since removed: StartBox still calls it.
    expect(chosenSequence([one, two], null, 120)).toBe(two);
    expect(chosenSequence([one, two], 'gone', 60)).toBe(one);
    // A club with none of its own: the default of that length, else the shortest.
    expect(chosenSequence([sys5, sys1], undefined, 60)).toBe(sys1);
    expect(chosenSequence([sys5, sys1], undefined, 120)).toBe(sys1);
    // Only with no sequence at all does the simulator call the start.
    expect(chosenSequence([], undefined, 60)).toBeNull();
  });

  it("keeps the club's sequences on the device, by club, for a race opened before StartBox answers", () => {
    localStorage.clear();
    const one: SimSequence = { id: 'one', name: '1 Minute Scratch', seconds: 60, club: true, audio: { url: 'https://x/1.mp3', startMs: 0, introMs: 0, endMs: null } };
    expect(keptSequences('club-1')).toEqual([]);
    keepSequences('club-1', [one]);
    expect(keptSequences('club-1')).toEqual([one]);
    expect(keptSequences('club-2')).toEqual([]);
    // An empty answer never wipes what's kept.
    keepSequences('club-1', []);
    expect(keptSequences('club-1')).toEqual([one]);
  });
});

describe("reading the club's sequences from StartBox", () => {
  afterEach(() => { vi.doUnmock('@/utils/startBoxStorage'); vi.resetModules(); });
  const row = (over: Record<string, unknown>) => ({ id: 's', club_id: 'club-1', name: '1 Minute Scratch', sequence_type: 'standard', race_type_default: 'scratch',
    total_duration_seconds: 60, countdown_start_seconds: 60, use_audio_only: true, audio_file_url: 'https://x/1.mp3', audio_offset_ms: 11000, audio_start_ms: 0, audio_end_ms: null, sounds: [], ...over });

  it("lists the club's own scratch starts first, and leaves handicap starts out", async () => {
    vi.doMock('@/utils/startBoxStorage', () => ({ getSequences: async () => [
      row({ id: 'sys', club_id: null, name: 'StartBox 1 Minute' }), row({ id: 'h', name: '2 Minute HCap', sequence_type: 'handicap', race_type_default: 'handicap' }),
      row({ id: 'one' }), row({ id: 'two', name: '2 Minute Scratch', total_duration_seconds: 120, countdown_start_seconds: 120, audio_offset_ms: 6000 }),
    ] }));
    const { loadClubSequences } = await import('@/components/race-simulator/startbox');
    const list = await loadClubSequences('club-1');
    expect(list!.map(q => q.id)).toEqual(['one', 'two', 'sys']);
    expect(list![1]).toMatchObject({ seconds: 120, club: true, audio: { introMs: 6000 } });
  });

  it("says it couldn't be read (so what's kept is used) when StartBox answers with nothing at all", async () => {
    // StartBox always has its own defaults: an empty answer is a failed one (its reader swallows errors).
    vi.doMock('@/utils/startBoxStorage', () => ({ getSequences: async () => [] }));
    const { loadClubSequences } = await import('@/components/race-simulator/startbox');
    expect(await loadClubSequences('club-1')).toBeNull();
  });
});

// Stand-ins for the browser's sound output: a clock we move by hand, and sources that note where
// in the recording they were started.
class FakeSrc {
  buffer: unknown = null; playbackRate = { value: 1 }; onended: (() => void) | null = null;
  began: { offset: number; length: number } | null = null; stopped = false;
  connect() { /* to the output */ }
  disconnect() { /* gone */ }
  start(_when: number, offset: number, length: number) { this.began = { offset, length }; }
  stop() { this.stopped = true; }
}
class FakeOut {
  currentTime = 0; state: 'running' | 'suspended' = 'running'; destination = {}; made: FakeSrc[] = [];
  createBufferSource() { const s = new FakeSrc(); this.made.push(s); return s; }
  get playing() { return this.made.filter(s => s.began && !s.stopped); }
}
let n = 0;
/** A recorded sequence at a fresh address (recordings are kept by address, so tests don't share them). */
const recorded = (seconds: number, extra: Partial<NonNullable<SimSequence['audio']>> = {}): SimSequence =>
  ({ id: 'r', name: 'r', seconds, club: true, audio: { url: `https://x/rec-${++n}.mp3`, startMs: 500, introMs: 4000, endMs: null, ...extra } });

describe('a recorded sequence against the race clock', () => {
  let now = 0;
  let fetches: string[] = [];
  let fail = false;
  beforeEach(() => {
    now = 0; fetches = []; fail = false;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('fetch', async (url: string) => { fetches.push(url); if (fail) throw new Error('offline'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; });
    vi.stubGlobal('OfflineAudioContext', class { decodeAudioData(_b: ArrayBuffer, ok: (b: unknown) => void) { ok({ duration: 200 }); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  /** Run the race clock from `from` seconds before the gun for `secs`, the output's clock keeping time with it. */
  const sail = (p: SequencePlayer, out: FakeOut, from: number, secs: number, rate = 1, opts: { running?: boolean; muted?: boolean } = {}) => {
    const dt = 1 / 60;
    let toGun = from;
    for (let t = 0; t < secs; t += dt) {
      p.update(toGun, opts.running ?? true, rate, opts.muted ?? false);
      if (opts.running ?? true) toGun -= dt * rate;
      out.currentTime += dt; now += dt * 1000;
    }
    return toGun;
  };

  it('is fetched once, when the sequence is chosen, and is there for every race after', async () => {
    const seq = recorded(60);
    warmSequence(seq);
    const rec = loadRecording(seq.audio!.url);
    await rec.done;
    const a = new SequencePlayer(seq, () => null), b = new SequencePlayer(seq, () => null);
    expect(fetches).toEqual([seq.audio!.url]);
    expect(a.ready && b.ready).toBe(true);
    expect(rec.buf).not.toBeNull();
  });

  it('plays a one-minute start from its first second, started once, at the place the countdown begins', async () => {
    const seq = recorded(60), out = new FakeOut();
    const p = new SequencePlayer(seq, () => out as unknown as AudioContext);
    expect(p.ready).toBe(false); // still on its way: the race waits
    await loadRecording(seq.audio!.url).done;
    expect(p.ready).toBe(true);
    sail(p, out, 60, 62);
    // One source, begun 4.5 s into the recording (its start, and the intro before the countdown).
    expect(p.starts).toBe(1);
    expect(out.made[0].began!.offset).toBeCloseTo(4.5, 2);
    expect(p.calling).toBe(true);
    // Four seconds after the gun it has said its piece.
    sail(p, out, -2, 3);
    expect(out.playing).toHaveLength(0);
    expect(p.starts).toBe(1);
  });

  it('pauses with the race and picks up at the same place', async () => {
    const seq = recorded(120), out = new FakeOut();
    const p = new SequencePlayer(seq, () => out as unknown as AudioContext);
    await loadRecording(seq.audio!.url).done;
    const at = sail(p, out, 120, 30);
    sail(p, out, at, 5, 1, { running: false });
    expect(out.playing).toHaveLength(0);
    sail(p, out, at, 1);
    expect(p.starts).toBe(2);
    // Thirty seconds of countdown gone: 4.5 + 30 into the recording.
    expect(out.made[1].began!.offset).toBeCloseTo(34.5, 1);
  });

  it('runs fast when the race does, and stays in step', async () => {
    const seq = recorded(120), out = new FakeOut();
    const p = new SequencePlayer(seq, () => out as unknown as AudioContext);
    await loadRecording(seq.audio!.url).done;
    const at = sail(p, out, 120, 10);
    sail(p, out, at, 20, 2.5);
    expect(p.starts).toBe(2); // once at full speed, once when the race was speeded up
    expect(out.made[1].playbackRate.value).toBe(2.5);
    expect(out.made[1].began!.offset).toBeCloseTo(14.5, 1);
  });

  it('is put back in step if the race clock and the sound drift apart', async () => {
    const seq = recorded(60), out = new FakeOut();
    const p = new SequencePlayer(seq, () => out as unknown as AudioContext);
    await loadRecording(seq.audio!.url).done;
    const at = sail(p, out, 60, 10);
    out.currentTime += 1.5; // the tab slept: the sound ran on, the race didn't
    sail(p, out, at, 2);
    expect(p.starts).toBe(2);
    expect(out.made[1].began!.offset).toBeCloseTo(14.5, 1);
    // And then left alone.
    sail(p, out, at - 2, 10);
    expect(p.starts).toBe(2);
  });

  it('stops where the club set the recording to end, and when you mute', async () => {
    const seq = recorded(60, { endMs: 40000 }), out = new FakeOut();
    const p = new SequencePlayer(seq, () => out as unknown as AudioContext);
    await loadRecording(seq.audio!.url).done;
    sail(p, out, 60, 20);
    expect(out.made[0].began!.length).toBeCloseTo(35.5, 1); // from 4.5 s to the 40 s the club set
    const at = sail(p, out, 40, 1, 1, { muted: true });
    expect(out.playing).toHaveLength(0);
    sail(p, out, at, 20); // past 35.5 s of countdown the recording is over: nothing starts again
    sail(p, out, 20, 5);
    expect(out.playing).toHaveLength(0);
  });

  it("hands the calls to the simulator only when the recording can't be had, or the sound is off", async () => {
    // Couldn't be fetched: the race doesn't wait, and the simulator calls the start.
    fail = true;
    const gone = recorded(60), out = new FakeOut();
    const p = new SequencePlayer(gone, () => out as unknown as AudioContext);
    await loadRecording(gone.audio!.url).done;
    expect(p.working).toBe(false);
    expect(p.ready).toBe(true);
    expect(p.calling).toBe(false);
    // A failed recording is asked for again next race.
    fail = false;
    const again = new SequencePlayer(gone, () => out as unknown as AudioContext);
    await loadRecording(gone.audio!.url).done;
    expect(again.working).toBe(true);
    // No sound output yet (the page hasn't been touched): the recording waits three seconds, then lets the simulator call.
    const seq = recorded(60), asleep = new FakeOut(); asleep.state = 'suspended';
    const q = new SequencePlayer(seq, () => asleep as unknown as AudioContext);
    await loadRecording(seq.audio!.url).done;
    const at = sail(q, asleep, 60, 2);
    expect(q.calling).toBe(true);
    const at2 = sail(q, asleep, at, 2);
    expect(q.calling).toBe(false);
    // Touched: it joins at the right place and takes the calls back.
    asleep.state = 'running';
    sail(q, asleep, at2, 1);
    expect(q.calling).toBe(true);
    expect(asleep.made[0].began!.offset).toBeCloseTo(8.5, 1);
  });
});
