export type StartBoxState = 'idle' | 'armed' | 'running' | 'paused' | 'completed';
export type SequenceType = 'standard' | 'handicap' | 'botw' | 'special';

export interface StartBoxSound {
  id: string;
  club_id: string | null;
  name: string;
  description?: string;
  file_path: string;
  file_url: string;
  file_size?: number;
  duration_ms?: number;
  mime_type: string;
  is_system_default: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface StartSequence {
  id: string;
  club_id: string | null;
  name: string;
  description?: string;
  sequence_type: SequenceType;
  total_duration_seconds: number;
  is_system_default: boolean;
  is_active: boolean;
  race_type_default?: 'scratch' | 'handicap' | null;
  sort_order: number;
  audio_file_path?: string | null;
  audio_file_url?: string | null;
  audio_offset_ms?: number;
  use_audio_only?: boolean;
  countdown_start_seconds?: number | null;
  enable_countdown_beep?: boolean;
  minute_callout_sound_id?: string | null;
  minute_callout_sound?: StartBoxSound;
  audio_start_ms?: number;
  audio_end_ms?: number | null;
  use_background_music?: boolean;
  background_music_url?: string | null;
  background_music_path?: string | null;
  background_music_volume?: number;
  background_music_duck_volume?: number;
  background_music_duck_duration_ms?: number;
  background_music_fade_in_ms?: number;
  background_music_fade_out_ms?: number;
  follow_on_sequence_id?: string | null;
  follow_on_sequence?: StartSequence;
  created_by?: string;
  created_at: string;
  updated_at: string;
  sounds?: StartSequenceSound[];
}

export interface StartSequenceSound {
  id: string;
  sequence_id: string;
  sound_id: string | null;
  trigger_time_seconds: number;
  label?: string;
  repeat_count: number;
  repeat_interval_ms?: number;
  volume_override?: number;
  sort_order: number;
  custom_sound_url?: string | null;
  custom_sound_path?: string | null;
  custom_sound_name?: string | null;
  created_at: string;
  sound?: StartBoxSound;
}

export interface StartBoxTimerState {
  state: StartBoxState;
  sequenceId: string | null;
  totalDurationSeconds: number;
  remainingSeconds: number;
  remainingMs: number;
  volume: number;
  firedSoundIds: Set<string>;
}
