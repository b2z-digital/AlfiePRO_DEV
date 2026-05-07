/*
  # Add Super Admin Bypass to Handicap Rulesets Tables

  1. Changes
    - Add super admin bypass to handicap_rulesets UPDATE and DELETE policies
    - Add super admin bypass to handicap_adjustment_rules INSERT, UPDATE, DELETE policies
    - Add super admin bypass to handicap_ruleset_config INSERT, UPDATE, DELETE policies
    - Add super admin bypass to handicap_seeding_rules INSERT, UPDATE, DELETE policies

  2. Security
    - Super admins (user_metadata.is_super_admin = true) can manage all rulesets
    - Existing club admin/editor policies remain intact
*/

-- handicap_rulesets: UPDATE
DROP POLICY IF EXISTS "Club admins can update their rulesets" ON handicap_rulesets;
CREATE POLICY "Club admins can update their rulesets"
  ON handicap_rulesets FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- handicap_rulesets: DELETE
DROP POLICY IF EXISTS "Club admins can delete their rulesets" ON handicap_rulesets;
CREATE POLICY "Club admins can delete their rulesets"
  ON handicap_rulesets FOR DELETE
  TO authenticated
  USING (
    (is_default = false) AND (
      ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
      OR EXISTS (
        SELECT 1 FROM user_clubs
        WHERE user_clubs.club_id = handicap_rulesets.club_id
        AND user_clubs.user_id = auth.uid()
        AND user_clubs.role IN ('admin', 'editor')
      )
    )
  );

-- handicap_rulesets: INSERT
DROP POLICY IF EXISTS "Club admins can insert rulesets" ON handicap_rulesets;
CREATE POLICY "Club admins can insert rulesets"
  ON handicap_rulesets FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM user_clubs
      WHERE user_clubs.club_id = handicap_rulesets.club_id
      AND user_clubs.user_id = auth.uid()
      AND user_clubs.role IN ('admin', 'editor')
    )
  );

-- handicap_adjustment_rules: INSERT
DROP POLICY IF EXISTS "Club admins can manage adjustment rules" ON handicap_adjustment_rules;
CREATE POLICY "Club admins can manage adjustment rules"
  ON handicap_adjustment_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_adjustment_rules: UPDATE
DROP POLICY IF EXISTS "Club admins can update adjustment rules" ON handicap_adjustment_rules;
CREATE POLICY "Club admins can update adjustment rules"
  ON handicap_adjustment_rules FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_adjustment_rules: DELETE
DROP POLICY IF EXISTS "Club admins can delete adjustment rules" ON handicap_adjustment_rules;
CREATE POLICY "Club admins can delete adjustment rules"
  ON handicap_adjustment_rules FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_adjustment_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_ruleset_config: INSERT
DROP POLICY IF EXISTS "Club admins can manage config" ON handicap_ruleset_config;
CREATE POLICY "Club admins can manage config"
  ON handicap_ruleset_config FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_ruleset_config: UPDATE
DROP POLICY IF EXISTS "Club admins can update config" ON handicap_ruleset_config;
CREATE POLICY "Club admins can update config"
  ON handicap_ruleset_config FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_ruleset_config: DELETE
DROP POLICY IF EXISTS "Club admins can delete config" ON handicap_ruleset_config;
CREATE POLICY "Club admins can delete config"
  ON handicap_ruleset_config FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_ruleset_config.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_seeding_rules: INSERT
DROP POLICY IF EXISTS "Club admins can manage seeding rules" ON handicap_seeding_rules;
CREATE POLICY "Club admins can manage seeding rules"
  ON handicap_seeding_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_seeding_rules: UPDATE
DROP POLICY IF EXISTS "Club admins can update seeding rules" ON handicap_seeding_rules;
CREATE POLICY "Club admins can update seeding rules"
  ON handicap_seeding_rules FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- handicap_seeding_rules: DELETE
DROP POLICY IF EXISTS "Club admins can delete seeding rules" ON handicap_seeding_rules;
CREATE POLICY "Club admins can delete seeding rules"
  ON handicap_seeding_rules FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata' ->> 'is_super_admin')::boolean = true)
    OR EXISTS (
      SELECT 1 FROM handicap_rulesets r
      JOIN user_clubs uc ON uc.club_id = r.club_id
      WHERE r.id = handicap_seeding_rules.ruleset_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );