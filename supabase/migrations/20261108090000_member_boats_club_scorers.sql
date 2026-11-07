-- Club Editors and Race Scorers could only see their own boat, so the skipper
-- picker showed just themselves when they scored. They can now see the boats of
-- their club's members, Race Scorers can add a boat or fix a sail number while
-- scoring (not delete), and both can see their club's event registrations so
-- paid-event entrants load. Existing policies are unchanged; these add to them.

create or replace function public.is_club_official_for_member(p_member_id uuid, p_roles public.club_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    join public.user_clubs uc on uc.club_id = m.club_id
    where m.id = p_member_id
      and uc.user_id = auth.uid()
      and uc.role = any (p_roles)
  );
$$;

revoke all on function public.is_club_official_for_member(uuid, public.club_role[]) from public, anon;
grant execute on function public.is_club_official_for_member(uuid, public.club_role[]) to authenticated;

create policy "Club editors and race scorers can view club boats"
  on public.member_boats for select to authenticated
  using (public.is_club_official_for_member(member_id, array['editor', 'race_scorer']::public.club_role[]));

create policy "Race scorers can add boats for club members"
  on public.member_boats for insert to authenticated
  with check (public.is_club_official_for_member(member_id, array['race_scorer']::public.club_role[]));

create policy "Race scorers can update boats of club members"
  on public.member_boats for update to authenticated
  using (public.is_club_official_for_member(member_id, array['race_scorer']::public.club_role[]))
  with check (public.is_club_official_for_member(member_id, array['race_scorer']::public.club_role[]));

create policy "Club editors and race scorers can view club registrations"
  on public.event_registrations for select to authenticated
  using (exists (
    select 1 from public.user_clubs uc
    where uc.club_id = event_registrations.club_id
      and uc.user_id = (select auth.uid())
      and uc.role in ('editor'::public.club_role, 'race_scorer'::public.club_role)
  ));
