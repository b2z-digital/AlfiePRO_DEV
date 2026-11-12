-- Sailing Academy, the world: club against club.
-- A club's score for a week is the world points of its best five results in that week's World
-- Regattas (any class, or one class). Over a longer period the weeks add up. Only members who appear
-- on the boards and show their club count, and nobody taken off the boards. Only club names and
-- numbers come back: no members. Read-only; nothing is written, and nothing touches a club's real
-- events, results or profile.
CREATE OR REPLACE FUNCTION public.sim_club_table(p_from timestamptz, p_to timestamptz, p_class text DEFAULT NULL, p_limit int DEFAULT 100)
RETURNS TABLE (pos bigint, club_id uuid, club_name text, points bigint, weeks bigint, skippers bigint, best_week bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH r AS (
    SELECT s.club_id, w.user_id, w.points, split_part(e.world_key, ':', 2) AS wk
    FROM public.sim_world_results w
    JOIN public.sim_events e ON e.id = w.event_id
    JOIN public.sim_skippers s ON s.user_id = w.user_id AND NOT s.hidden AND s.club_id IS NOT NULL
    WHERE w.kind = 'regatta' AND w.closed_at >= p_from AND w.closed_at < p_to
      AND (p_class IS NULL OR w.class_id = p_class)
  ),
  ranked AS (SELECT r.*, row_number() OVER (PARTITION BY r.club_id, r.wk ORDER BY r.points DESC) AS k FROM r),
  weekly AS (SELECT club_id, wk, sum(points) FILTER (WHERE k <= 5) AS pts FROM ranked GROUP BY club_id, wk),
  t AS (SELECT club_id, sum(pts)::bigint AS pts, count(*) AS weeks, max(pts)::bigint AS best FROM weekly GROUP BY club_id),
  ppl AS (SELECT club_id, count(DISTINCT user_id) AS n FROM r GROUP BY club_id)
  SELECT rank() OVER (ORDER BY t.pts DESC), t.club_id, c.name, t.pts, t.weeks, ppl.n, t.best
  FROM t JOIN ppl ON ppl.club_id = t.club_id JOIN public.clubs c ON c.id = t.club_id
  ORDER BY t.pts DESC, c.name
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
REVOKE ALL ON FUNCTION public.sim_club_table(timestamptz, timestamptz, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_club_table(timestamptz, timestamptz, text, int) TO authenticated;

-- The club table reads World Regatta results by when they closed.
CREATE INDEX IF NOT EXISTS sim_world_results_kind_idx ON public.sim_world_results (kind, closed_at DESC);
