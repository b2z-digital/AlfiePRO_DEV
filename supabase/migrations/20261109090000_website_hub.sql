-- Website hub: per-club theme, menu and layout; slide label and show dates;
-- visit length for website analytics, and one call that summarises a club's visits.

alter table public.clubs
  add column if not exists website_theme jsonb,
  add column if not exists website_menu jsonb,
  add column if not exists website_layout jsonb;

comment on column public.clubs.website_theme is 'Public website look: colours, fonts, logos, corner style. Null = default look.';
comment on column public.clubs.website_menu is 'Public website menu items (tree). Null = default menu.';
comment on column public.clubs.website_layout is 'Public website layout: homepage section order/visibility. Null = default layout.';

-- Public pages read clubs through column-level grants for anon
grant select (website_theme, website_menu, website_layout) on public.clubs to anon;

alter table public.homepage_slides
  add column if not exists label text,
  add column if not exists show_from date,
  add column if not exists show_until date;

create index if not exists website_analytics_club_created_idx
  on public.website_analytics (club_id, created_at desc);

-- A public page records its visit with an id it made itself; when the page closes
-- it reports how long it was open. Only fresh visits without a length can be set.
create or replace function public.end_website_visit(p_visit uuid, p_seconds integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.website_analytics
     set duration = least(greatest(coalesce(p_seconds, 0), 0), 3600)
   where id = p_visit
     and coalesce(duration, 0) = 0
     and created_at > now() - interval '6 hours';
$$;

revoke all on function public.end_website_visit(uuid, integer) from public;
grant execute on function public.end_website_visit(uuid, integer) to anon, authenticated;

-- Summary for the Website › Analytics tab. Runs as the caller, so the
-- "admins can view analytics for their clubs" policy decides what is counted.
create or replace function public.club_website_stats(p_club uuid, p_from timestamptz, p_to timestamptz, p_tz text default 'Australia/Sydney')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with v as (
    select id, page_path, visitor_id, session_id, coalesce(duration, 0) as duration,
           lower(coalesce(referrer, '')) as ref, lower(coalesce(user_agent, '')) as ua,
           (created_at at time zone p_tz) as local_at
      from public.website_analytics
     where club_id = p_club and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'views', (select count(*) from v),
    'visitors', (select count(distinct visitor_id) from v),
    'sessions', (select count(distinct session_id) from v),
    'avg_seconds', (select coalesce(round(avg(duration)), 0) from v where duration > 0),
    'days', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'views', views, 'visitors', visitors) order by d)
                        from (select local_at::date as d, count(*) as views, count(distinct visitor_id) as visitors from v group by 1) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', page_path, 'views', views, 'avg', avg_s) order by views desc)
                         from (select page_path, count(*) as views, coalesce(round(avg(nullif(duration, 0))), 0) as avg_s
                                 from v group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', src, 'visits', n) order by n desc)
                           from (select case
                                          when ref = '' then 'direct'
                                          when ref like '%google.%' then 'google'
                                          when ref like '%facebook.%' or ref like '%fb.%' or ref like '%messenger.%' then 'facebook'
                                          when ref like '%instagram.%' then 'instagram'
                                          when ref like '%arya.%' then 'arya'
                                          when ref like '%bing.%' or ref like '%duckduckgo.%' or ref like '%yahoo.%' then 'search'
                                          else 'other' end as src,
                                        count(distinct session_id) as n
                                   from v group by 1) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device', dev, 'visits', n))
                           from (select case
                                          when ua like '%ipad%' or (ua like '%android%' and ua not like '%mobile%') or ua like '%tablet%' then 'tablet'
                                          when ua like '%mobi%' or ua like '%iphone%' or ua like '%android%' then 'phone'
                                          else 'computer' end as dev,
                                        count(distinct session_id) as n
                                   from v group by 1) x), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'views', n))
                         from (select extract(isodow from local_at)::int as dow, extract(hour from local_at)::int as hr, count(*) as n
                                 from v group by 1, 2) x), '[]'::jsonb)
  );
$$;

grant execute on function public.club_website_stats(uuid, timestamptz, timestamptz, text) to authenticated;
