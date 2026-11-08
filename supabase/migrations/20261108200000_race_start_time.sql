-- Optional first-start time for single events and series rounds (not every club uses one)
alter table public.quick_races add column if not exists start_time time;
alter table public.race_series_rounds add column if not exists start_time time;
comment on column public.quick_races.start_time is 'Optional time of the first start (local to the venue).';
comment on column public.race_series_rounds.start_time is 'Optional time of the first start (local to the venue).';
