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
  created_by?: string;
  created_at: string;
  updated_at: string;
  sounds?: StartSequenceSound[];
}

export interface StartSequenceSound {
  id: string;
  sequence_id: string;
  sound_id: string;
  trigger_time_seconds: number;
  label?: string;
  repeat_count: number;
  repeat_interval_ms?: number;
  volume_override?: number;
  sort_order: number;
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
