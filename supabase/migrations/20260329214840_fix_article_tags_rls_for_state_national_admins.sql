/*
  # Fix article_tags RLS policies for state and national admins

  1. Problem
    - The existing "Club admins and editors can manage article tags" policy only checks
      user_clubs.club_id = articles.club_id, which fails when:
      - A state admin creates an article under their state association (club_id is NULL)
      - A national admin creates an article under their national association (club_id is NULL)
      - An article author tries to manage tags on their own article

  2. Changes
    - Drop the old narrow "Club admins and editors can manage article tags" ALL policy
    - Create a new comprehensive ALL policy that checks:
      - Club admins/editors via user_clubs (existing behavior)
      - Article author via articles.author_id = auth.uid()
      - State admins via user_state_associations
      - National admins via user_national_associations

  3. Security
    - All checks require authenticated role
    - Each path requires valid role membership or article ownership
    - Maintains existing public and club member SELECT policies unchanged
*/

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.article_tags'::regclass
    AND polname = 'Club admins and editors can manage article tags'
  ) THEN
    DROP POLICY "Club admins and editors can manage article tags" ON public.article_tags;
  END IF;
END $$;

CREATE POLICY "Admins and authors can manage article tags"
  ON public.article_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
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
    EXISTS (
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
