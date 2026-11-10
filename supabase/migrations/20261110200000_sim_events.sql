-- Race Simulator: virtual race events (approved by Stephen, 10 Nov 2026, "Yes, apply them").
-- An event is a series of races, each sailed any time in its own window. A separate, virtual layer:
-- nothing here touches the club's real events or results, though the app scores it with the same
-- results engine. Each race is a challenge (the same race for everyone, with its seed) linked to
-- its event; the entries are the challenge entries. Whoever runs the event chooses whether a
-- skipper's first try at each race counts, or her best. Strict row-level security throughout.

-- ── Events ──
CREATE TABLE IF NOT EXISTS public.sim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL: a platform-wide event, open to everyone (set by super admins).
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  -- 'first': a skipper's first try at each race counts (it starts at the gun); 'best': her best.
  tries text NOT NULL DEFAULT 'best' CHECK (tries IN ('first', 'best')),
  -- Races dropped from each skipper's total: one once this many are sailed, two at the next, and so on.
  drops smallint[] NOT NULL DEFAULT '{4,8,16,24,32,40}',
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sim_events IS 'Race Simulator: a virtual race event, a series of races (sim_challenges with event_id) scored as a regatta.';
CREATE INDEX IF NOT EXISTS sim_events_club_idx ON public.sim_events (club_id, created_at DESC);
ALTER TABLE public.sim_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_events: members see their club's, everyone sees open ones" ON public.sim_events FOR SELECT TO authenticated
  USING (club_id IS NULL OR public.user_is_club_member(club_id, (SELECT auth.uid())) OR public.is_super_admin());
CREATE POLICY "sim_events: club admins create" ON public.sim_events FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin()));
CREATE POLICY "sim_events: club admins change" ON public.sim_events FOR UPDATE TO authenticated
  USING ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin())
  WITH CHECK ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin());
CREATE POLICY "sim_events: club admins remove" ON public.sim_events FOR DELETE TO authenticated
  USING ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin());

-- ── Each race of an event is a challenge, numbered within it ──
ALTER TABLE public.sim_challenges
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.sim_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS race_no smallint CHECK (race_no IS NULL OR race_no BETWEEN 1 AND 40);
ALTER TABLE public.sim_challenges DROP CONSTRAINT IF EXISTS sim_challenges_event_race_check;
ALTER TABLE public.sim_challenges ADD CONSTRAINT sim_challenges_event_race_check CHECK ((event_id IS NULL) = (race_no IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS sim_challenges_event_race_idx ON public.sim_challenges (event_id, race_no) WHERE event_id IS NOT NULL;

-- A race belongs to an event of the same club (or both platform-wide).
DROP POLICY IF EXISTS "sim_challenges: club admins create" ON public.sim_challenges;
CREATE POLICY "sim_challenges: club admins create" ON public.sim_challenges FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin())
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.sim_events e WHERE e.id = event_id AND e.club_id IS NOT DISTINCT FROM club_id))
  );
DROP POLICY IF EXISTS "sim_challenges: club admins change" ON public.sim_challenges;
CREATE POLICY "sim_challenges: club admins change" ON public.sim_challenges FOR UPDATE TO authenticated
  USING ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin())
  WITH CHECK (
    ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin())
    AND (event_id IS NULL OR EXISTS (SELECT 1 FROM public.sim_events e WHERE e.id = event_id AND e.club_id IS NOT DISTINCT FROM club_id))
  );

-- ── Entries: a first try is held from the gun ('started') until it finishes, once ──
ALTER TABLE public.sim_challenge_entries DROP CONSTRAINT IF EXISTS sim_challenge_entries_status_check;
ALTER TABLE public.sim_challenge_entries ADD CONSTRAINT sim_challenge_entries_status_check
  CHECK (status IN ('finished', 'dsq', 'ocs', 'dnf', 'started'));

-- Is this challenge a race of a first-try event?
CREATE OR REPLACE FUNCTION public.sim_first_try(p_challenge uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sim_challenges c JOIN public.sim_events e ON e.id = c.event_id WHERE c.id = p_challenge AND e.tries = 'first');
$$;
REVOKE ALL ON FUNCTION public.sim_first_try(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_first_try(uuid) TO authenticated;

-- Enter while the race is open. In a first-try event the entry starts as 'started' (at the gun);
-- otherwise it's a result.
DROP POLICY IF EXISTS "sim_challenge_entries: enter" ON public.sim_challenge_entries;
CREATE POLICY "sim_challenge_entries: enter" ON public.sim_challenge_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.sim_challenges c
      WHERE c.id = challenge_id AND now() >= c.opens_at AND (c.closes_at IS NULL OR now() < c.closes_at)
        AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, (SELECT auth.uid())))
    )
    AND (CASE WHEN public.sim_first_try(challenge_id) THEN status = 'started' ELSE status <> 'started' END)
  );
-- Improve your entry while the race is open; in a first-try event, only to finish the try you started.
DROP POLICY IF EXISTS "sim_challenge_entries: improve your entry" ON public.sim_challenge_entries;
CREATE POLICY "sim_challenge_entries: improve your entry" ON public.sim_challenge_entries FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (NOT public.sim_first_try(challenge_id) OR status = 'started')
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status <> 'started'
    AND EXISTS (
      SELECT 1 FROM public.sim_challenges c
      WHERE c.id = challenge_id AND now() >= c.opens_at AND (c.closes_at IS NULL OR now() < c.closes_at)
    )
  );
-- Withdraw your own entry (not from a first-try event: your try is used), or a club admin removes one.
DROP POLICY IF EXISTS "sim_challenge_entries: withdraw, or a club admin removes" ON public.sim_challenge_entries;
CREATE POLICY "sim_challenge_entries: withdraw, or a club admin removes" ON public.sim_challenge_entries FOR DELETE TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND NOT public.sim_first_try(challenge_id))
    OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.sim_challenges c WHERE c.id = challenge_id AND c.club_id IS NOT NULL AND public.is_club_admin(c.club_id))
  );

-- ── Race logs (for ghosts): not readable from the table; through sim_entry_log, which keeps an
--    event race's logs private until the race closes, so no one can follow the leader's ghost while
--    it still counts ──
REVOKE SELECT ON public.sim_challenge_entries FROM anon, authenticated;
GRANT SELECT (id, challenge_id, user_id, display_name, sail_number, place, status, elapsed_s, summary, sailed_at)
  ON public.sim_challenge_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.sim_entry_log(p_entry uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.log
  FROM public.sim_challenge_entries e
  JOIN public.sim_challenges c ON c.id = e.challenge_id
  WHERE e.id = p_entry
    -- You can see the race's leaderboard...
    AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, auth.uid()) OR public.is_super_admin())
    -- ...and it's your own race, a plain challenge, or an event race that has closed.
    AND (e.user_id = auth.uid() OR c.event_id IS NULL OR (c.closes_at IS NOT NULL AND now() >= c.closes_at));
$$;
REVOKE ALL ON FUNCTION public.sim_entry_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sim_entry_log(uuid) TO authenticated;
