-- AlfiePRO Live: cloud production engine (Cloudflare RealtimeKit).
-- Additive only: existing browser ("device") broadcasts are unaffected.

alter table public.livestream_sessions
  add column if not exists engine text not null default 'device',
  add column if not exists rtk_meeting_id text,
  add column if not exists program_recording_id text,
  add column if not exists program_participant_id text,
  add column if not exists broadcast_mode text not null default 'live';

do $$ begin
  alter table public.livestream_sessions
    add constraint livestream_sessions_engine_check check (engine in ('device', 'cloud'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.livestream_sessions
    add constraint livestream_sessions_broadcast_mode_check check (broadcast_mode in ('live', 'races_only'));
exception when duplicate_object then null; end $$;

alter table public.livestream_race_segments
  add column if not exists rtk_recording_id text;

-- Camera links that work without a login. Kept out of livestream_sessions so the
-- join key is never readable from the app: only the live-cloud function uses it.
create table if not exists public.livestream_camera_links (
  session_id uuid primary key references public.livestream_sessions(id) on delete cascade,
  join_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.livestream_camera_links enable row level security;
