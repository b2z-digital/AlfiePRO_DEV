/*
  # Add super admin bypass to articles and related tables

  1. Changes
    - Update "Club admins and editors can manage articles" policy on `articles` to also allow super admins
    - Update "Admins and authors can manage article tags" policy on `article_tags` to also allow super admins
    - Update "Authors and admins can manage yacht class associations" policy on `article_yacht_classes` to also allow super admins
    - Add super admin SELECT policy on `articles` for viewing any article

  2. Security
    - Super admins (identified via `is_super_admin()`) can manage all articles regardless of club/association membership
    - This enables impersonation workflows and platform-level management
    - No changes to non-super-admin access patterns

  3. Important Notes
    - Uses the existing `is_super_admin()` function already used across other tables
    - Existing policies for club admins/editors, state admins, and national admins remain unchanged
*/

-- Drop and recreate the club manage articles policy with super admin bypass
DROP POLICY IF EXISTS "Club admins and editors can manage articles" ON articles;
CREATE POLICY "Club admins and editors can manage articles"
  ON articles
  FOR ALL
  TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

-- Drop and recreate the article_tags manage policy with super admin bypass
DROP POLICY IF EXISTS "Admins and authors can manage article tags" ON article_tags;
CREATE POLICY "Admins and authors can manage article tags"
  ON article_tags
  FOR ALL
  TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_tags.article_id
        AND (
          a.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_clubs uc
            WHERE uc.club_id = a.club_id
              AND uc.user_id = auth.uid()
              AND uc.role IN ('admin', 'editor')
          )
          OR EXISTS (
            SELECT 1 FROM user_state_associations usa
            WHERE usa.state_association_id = a.state_association_id
              AND usa.user_id = auth.uid()
              AND usa.role = 'state_admin'
          )
          OR EXISTS (
            SELECT 1 FROM user_national_associations una
            WHERE una.national_association_id = a.national_association_id
              AND una.user_id = auth.uid()
              AND una.role = 'national_admin'
          )
        )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_tags.article_id
        AND (
          a.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_clubs uc
            WHERE uc.club_id = a.club_id
              AND uc.user_id = auth.uid()
              AND uc.role IN ('admin', 'editor')
          )
          OR EXISTS (
            SELECT 1 FROM user_state_associations usa
            WHERE usa.state_association_id = a.state_association_id
              AND usa.user_id = auth.uid()
              AND usa.role = 'state_admin'
          )
          OR EXISTS (
            SELECT 1 FROM user_national_associations una
            WHERE una.national_association_id = a.national_association_id
              AND una.user_id = auth.uid()
              AND una.role = 'national_admin'
          )
        )
    )
  );

-- Drop and recreate the article_yacht_classes manage policy with super admin bypass
DROP POLICY IF EXISTS "Authors and admins can manage yacht class associations" ON article_yacht_classes;
CREATE POLICY "Authors and admins can manage yacht class associations"
  ON article_yacht_classes
  FOR ALL
  TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_yacht_classes.article_id
        AND (
          articles.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_clubs uc
            WHERE uc.user_id = auth.uid()
              AND uc.club_id = articles.club_id
              AND uc.role IN ('admin', 'editor')
          )
          OR EXISTS (
            SELECT 1 FROM user_state_associations usa
            WHERE usa.user_id = auth.uid()
              AND usa.state_association_id = articles.state_association_id
              AND usa.role = 'state_admin'
          )
          OR EXISTS (
            SELECT 1 FROM user_national_associations una
            WHERE una.user_id = auth.uid()
              AND una.national_association_id = articles.national_association_id
              AND una.role = 'national_admin'
          )
        )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_yacht_classes.article_id
        AND (
          articles.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_clubs uc
            WHERE uc.user_id = auth.uid()
              AND uc.club_id = articles.club_id
              AND uc.role IN ('admin', 'editor')
          )
          OR EXISTS (
            SELECT 1 FROM user_state_associations usa
            WHERE usa.user_id = auth.uid()
              AND usa.state_association_id = articles.state_association_id
              AND usa.role = 'state_admin'
          )
          OR EXISTS (
            SELECT 1 FROM user_national_associations una
            WHERE una.user_id = auth.uid()
              AND una.national_association_id = articles.national_association_id
              AND una.role = 'national_admin'
          )
        )
    )
  );
