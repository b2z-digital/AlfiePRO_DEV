-- Allow state association admins to view email logs for clubs in their association
CREATE POLICY "Association admins can view email logs for their clubs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN user_state_associations usa ON usa.state_association_id = c.state_association_id
      WHERE c.id = email_logs.club_id
      AND usa.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM clubs c
      JOIN state_associations sa ON sa.id = c.state_association_id
      JOIN user_national_associations una ON una.national_association_id = sa.national_association_id
      WHERE c.id = email_logs.club_id
      AND una.user_id = auth.uid()
    )
  );
