/*
  # Fix Event Website Template Pages and Sections RLS Policies

  ## Changes
  1. Adds INSERT/UPDATE/DELETE policies for event_website_template_pages
  2. Adds INSERT/UPDATE/DELETE policies for event_website_template_global_sections
  3. Ensures users can manage pages and sections for templates they can create/update

  ## Important Notes
  - These policies align with the parent template policies
  - Users who can create templates can add pages and sections to them
*/

-- RLS Policies for event_website_template_pages

-- Users can view pages for templates they can view
CREATE POLICY "Users can view template pages for viewable templates"
  ON event_website_template_pages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.is_public = true
        OR t.club_id IN (
          SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
        )
        OR t.state_association_id IN (
          SELECT sa.id
          FROM state_associations sa
          INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
          INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
          WHERE uc.user_id = auth.uid()
        )
        OR t.national_association_id IN (
          SELECT na.id
          FROM national_associations na
          INNER JOIN state_associations sa ON sa.national_association_id = na.id
          INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
          INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
          WHERE uc.user_id = auth.uid()
        )
      )
    )
  );

-- Users can insert pages for templates they can create
CREATE POLICY "Users can insert pages for their templates"
  ON event_website_template_pages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        ))
      )
    )
  );

-- Users can update pages for templates they can update
CREATE POLICY "Users can update pages for their templates"
  ON event_website_template_pages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  );

-- Users can delete pages for templates they can update
CREATE POLICY "Users can delete pages for their templates"
  ON event_website_template_pages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  );

-- RLS Policies for event_website_template_global_sections

-- Users can view global sections for templates they can view
CREATE POLICY "Users can view template sections for viewable templates"
  ON event_website_template_global_sections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.is_public = true
        OR t.club_id IN (
          SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
        )
        OR t.state_association_id IN (
          SELECT sa.id
          FROM state_associations sa
          INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
          INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
          WHERE uc.user_id = auth.uid()
        )
        OR t.national_association_id IN (
          SELECT na.id
          FROM national_associations na
          INNER JOIN state_associations sa ON sa.national_association_id = na.id
          INNER JOIN state_association_clubs sac ON sac.state_association_id = sa.id
          INNER JOIN user_clubs uc ON uc.club_id = sac.club_id
          WHERE uc.user_id = auth.uid()
        )
      )
    )
  );

-- Users can insert global sections for templates they can create
CREATE POLICY "Users can insert sections for their templates"
  ON event_website_template_global_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role IN ('admin', 'editor')
        ))
      )
    )
  );

-- Users can update global sections for templates they can update
CREATE POLICY "Users can update sections for their templates"
  ON event_website_template_global_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  );

-- Users can delete global sections for templates they can update
CREATE POLICY "Users can delete sections for their templates"
  ON event_website_template_global_sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM event_website_templates t
      WHERE t.id = template_id
      AND (
        t.created_by = auth.uid()
        OR (t.club_id IN (
          SELECT club_id FROM user_clubs uc
          WHERE uc.user_id = auth.uid()
          AND uc.role = 'admin'
        ))
      )
    )
  );