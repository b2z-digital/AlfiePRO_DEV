// Race simulator: the club's StartBox sequences, as the simulator uses them. Run with: npm test
import { describe, expect, it } from 'vitest';
import { SimSequence, chosenSequence, toSimSequence } from '@/components/race-simulator/startbox';
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
