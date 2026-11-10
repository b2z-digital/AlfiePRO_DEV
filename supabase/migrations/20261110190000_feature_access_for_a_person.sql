-- Feature Access for one person: a feature can be switched on for a single user, wherever they are
-- in the app, as well as for a whole club or association. (First used to give one race officer the
-- Race Simulator before it's switched on for clubs.)

alter table public.platform_feature_overrides drop constraint if exists platform_feature_overrides_target_type_check;
alter table public.platform_feature_overrides add constraint platform_feature_overrides_target_type_check
  check (target_type = any (array['club'::text, 'state_association'::text, 'national_association'::text, 'user'::text]));

-- The features switched on for the signed-in person themselves. Only ever their own: the function
-- reads auth.uid(), so it can't be used to look at anyone else's.
create or replace function public.get_my_feature_grants()
returns table(feature_key text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select fc.feature_key
  from public.platform_feature_controls fc
  join public.platform_feature_overrides fo on fo.feature_control_id = fc.id
  where fo.target_type = 'user'
    and fo.target_id = auth.uid()
    and fo.is_enabled;
$$;

revoke all on function public.get_my_feature_grants() from public, anon;
grant execute on function public.get_my_feature_grants() to authenticated;
