/*
# Fix Critical Security Advisories

1. Backup Tables - Enable RLS
   - `_backup_club_memberships_20260703` — enable RLS, add no policies (deny-all)
   - `_backup_members_20260703` — enable RLS, add no policies (deny-all)
   These are backup snapshots that should not be accessible via the Data API.

2. Replace user_metadata references with profiles-based check
   All policies that use `auth.jwt() -> 'user_metadata' ->> 'is_super_admin'`
   are a security risk because users can edit their own user_metadata.
   Replace with `public.is_super_admin_user()` which checks the profiles table.

   Affected tables:
   - `start_sequences` (1 policy: delete)
   - `handicap_rulesets` (3 policies: insert, update, delete)
   - `handicap_adjustment_rules` (3 policies: insert, update, delete)
   - `handicap_ruleset_config` (3 policies: insert, update, delete)
   - `handicap_seeding_rules` (3 policies: insert, update, delete)

3. Security
   - Backup tables now deny all access via RLS (no policies = no access).
   - Super admin checks now use server-side profiles table, not user-editable metadata.
*/

-- ============================================================
-- 1. Enable RLS on backup tables (deny-all, no policies needed)
-- ============================================================
ALTER TABLE IF EXISTS public._backup_club_memberships_20260703 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._backup_members_20260703 ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Fix start_sequences delete policy
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete sequences" ON public.start_sequences;
CREATE POLICY "Admins can delete sequences" ON public.start_sequences
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_user()
    OR (
      club_id IS NOT NULL
      AND is_system_default = false
      AND EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.club_id = start_sequences.club_id
          AND user_clubs.role IN ('admin', 'super_admin')
      )
    )
    OR (
      club_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_clubs
        WHERE user_clubs.user_id = auth.uid()
          AND user_clubs.role = 'super_admin'
      )
    )
  );

-- ============================================================
-- 3. Fix handicap_rulesets policies (insert, update, delete)
-- ============================================================
DROP POLICY IF EXISTS "Club admins can manage rulesets" ON public.handicap_rulesets;
CREATE POLICY "Club admins can manage rulesets" ON public.handicap_rulesets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = handicap_rulesets.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can update rulesets" ON public.handicap_rulesets;
CREATE POLICY "Club admins can update rulesets" ON public.handicap_rulesets
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = handicap_rulesets.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = handicap_rulesets.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can delete rulesets" ON public.handicap_rulesets;
CREATE POLICY "Club admins can delete rulesets" ON public.handicap_rulesets
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.user_clubs uc
      WHERE uc.club_id = handicap_rulesets.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

-- ============================================================
-- 4. Fix handicap_adjustment_rules policies (insert, update, delete)
-- ============================================================
DROP POLICY IF EXISTS "Club admins can manage adjustment rules" ON public.handicap_adjustment_rules;
CREATE POLICY "Club admins can manage adjustment rules" ON public.handicap_adjustment_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can update adjustment rules" ON public.handicap_adjustment_rules;
CREATE POLICY "Club admins can update adjustment rules" ON public.handicap_adjustment_rules
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can delete adjustment rules" ON public.handicap_adjustment_rules;
CREATE POLICY "Club admins can delete adjustment rules" ON public.handicap_adjustment_rules
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

-- ============================================================
-- 5. Fix handicap_ruleset_config policies (insert, update, delete)
-- ============================================================
DROP POLICY IF EXISTS "Club admins can manage config" ON public.handicap_ruleset_config;
CREATE POLICY "Club admins can manage config" ON public.handicap_ruleset_config
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can update config" ON public.handicap_ruleset_config;
CREATE POLICY "Club admins can update config" ON public.handicap_ruleset_config
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can delete config" ON public.handicap_ruleset_config;
CREATE POLICY "Club admins can delete config" ON public.handicap_ruleset_config
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

-- ============================================================
-- 6. Fix handicap_seeding_rules policies (insert, update, delete)
-- ============================================================
DROP POLICY IF EXISTS "Club admins can manage seeding rules" ON public.handicap_seeding_rules;
CREATE POLICY "Club admins can manage seeding rules" ON public.handicap_seeding_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can update seeding rules" ON public.handicap_seeding_rules;
CREATE POLICY "Club admins can update seeding rules" ON public.handicap_seeding_rules
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Club admins can delete seeding rules" ON public.handicap_seeding_rules;
CREATE POLICY "Club admins can delete seeding rules" ON public.handicap_seeding_rules
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.handicap_rulesets r
      JOIN public.user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );
