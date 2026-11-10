-- Race Simulator: your races and training progress across devices, and club challenges with
-- leaderboards (Race Simulator plan, approved 10 Nov 2026). Strict row-level security throughout:
-- you read and write only your own races and progress; a challenge and its leaderboard are seen by
-- the members of its club (or everyone, for a platform-wide one) and run by club admins.
-- Also adds the simulator to Feature Access, off until it's switched on for a club.

-- ── The races you've sailed: one row per race or start practice, with its debrief summary ──
CREATE TABLE IF NOT EXISTS public.sim_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('race', 'start')),
  venue text,
  class_id text NOT NULL,
  level text NOT NULL,
  fleet smallint NOT NULL CHECK (fleet BETWEEN 2 AND 16),
  place smallint,
  status text NOT NULL CHECK (status IN ('finished', 'dsq', 'ocs', 'dnf', 'racing')),
  elapsed_s real,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sailed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sailed_at)
);
COMMENT ON TABLE public.sim_sessions IS 'Race Simulator: races and start practices a member has sailed, with the debrief summary.';
CREATE INDEX IF NOT EXISTS sim_sessions_user_sailed_idx ON public.sim_sessions (user_id, sailed_at DESC);
ALTER TABLE public.sim_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_sessions: read own" ON public.sim_sessions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "sim_sessions: add own" ON public.sim_sessions FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "sim_sessions: delete own" ON public.sim_sessions FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
-- No update policy: a sailed race doesn't change.

-- ── Training progress: drill stars and bests, Rules Academy answers, Scenario Lab wins ──
CREATE TABLE IF NOT EXISTS public.sim_progress (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  training jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sim_progress IS 'Race Simulator: a member''s training progress, merged from every device they use.';
ALTER TABLE public.sim_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_progress: read own" ON public.sim_progress FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "sim_progress: add own" ON public.sim_progress FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "sim_progress: update own" ON public.sim_progress FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- ── Challenges: the same race (class, venue, wind and seed) for everyone, with a leaderboard ──
CREATE TABLE IF NOT EXISTS public.sim_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL: a platform-wide challenge, open to everyone.
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  settings jsonb NOT NULL,
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at IS NULL OR closes_at > opens_at)
);
COMMENT ON TABLE public.sim_challenges IS 'Race Simulator: a race everyone sails the same way (settings include the seed), run by a club or the platform.';
CREATE INDEX IF NOT EXISTS sim_challenges_club_idx ON public.sim_challenges (club_id, opens_at DESC);
ALTER TABLE public.sim_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_challenges: members see their club's, everyone sees open ones" ON public.sim_challenges FOR SELECT TO authenticated
  USING (club_id IS NULL OR public.user_is_club_member(club_id, (SELECT auth.uid())) OR public.is_super_admin());
CREATE POLICY "sim_challenges: club admins create" ON public.sim_challenges FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin()));
CREATE POLICY "sim_challenges: club admins change" ON public.sim_challenges FOR UPDATE TO authenticated
  USING ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin())
  WITH CHECK ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin());
CREATE POLICY "sim_challenges: club admins remove" ON public.sim_challenges FOR DELETE TO authenticated
  USING ((club_id IS NOT NULL AND public.is_club_admin(club_id)) OR public.is_super_admin());

-- ── Challenge entries: your best result in a challenge, and its log to race against as a ghost ──
CREATE TABLE IF NOT EXISTS public.sim_challenge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.sim_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  sail_number text CHECK (sail_number IS NULL OR sail_number ~ '^[0-9]{1,4}$'),
  place smallint,
  status text NOT NULL CHECK (status IN ('finished', 'dsq', 'ocs', 'dnf')),
  elapsed_s real,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  log jsonb,
  sailed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
COMMENT ON TABLE public.sim_challenge_entries IS 'Race Simulator: a member''s best result in a challenge, for the leaderboard and to sail against as a ghost.';
CREATE INDEX IF NOT EXISTS sim_challenge_entries_board_idx ON public.sim_challenge_entries (challenge_id, elapsed_s);
ALTER TABLE public.sim_challenge_entries ENABLE ROW LEVEL SECURITY;
-- Whoever can see the challenge sees its leaderboard.
CREATE POLICY "sim_challenge_entries: see the leaderboard" ON public.sim_challenge_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sim_challenges c
    WHERE c.id = challenge_id
      AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, (SELECT auth.uid())) OR public.is_super_admin())
  ));
-- Your own entry, while the challenge is open.
CREATE POLICY "sim_challenge_entries: enter" ON public.sim_challenge_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.sim_challenges c
    WHERE c.id = challenge_id AND now() >= c.opens_at AND (c.closes_at IS NULL OR now() < c.closes_at)
      AND (c.club_id IS NULL OR public.user_is_club_member(c.club_id, (SELECT auth.uid())))
  ));
CREATE POLICY "sim_challenge_entries: improve your entry" ON public.sim_challenge_entries FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.sim_challenges c
    WHERE c.id = challenge_id AND now() >= c.opens_at AND (c.closes_at IS NULL OR now() < c.closes_at)
  ));
CREATE POLICY "sim_challenge_entries: withdraw, or a club admin removes" ON public.sim_challenge_entries FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.sim_challenges c WHERE c.id = challenge_id AND c.club_id IS NOT NULL AND public.is_club_admin(c.club_id)
  ));

-- ── Feature Access: off everywhere until it's switched on for a club ──
INSERT INTO public.platform_feature_controls (feature_key, feature_label, feature_description, feature_group, is_globally_enabled)
VALUES ('race_simulator', 'Race Simulator', 'Race AI skippers on your club''s own water, with Alfie coaching, start drills, the Rules Academy, the Scenario Lab and race replays.', 'racing', false)
ON CONFLICT (feature_key) DO NOTHING;
