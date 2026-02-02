/*
  # Add Association Support to Articles

  1. Changes to articles table
    - Add state_association_id (link articles to state associations)
    - Add national_association_id (link articles to national associations)

  2. Indexes
    - Add indexes for performance

  3. Security
    - Update RLS policies to allow state/national admins to manage their articles
*/

-- Add association fields to articles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE articles ADD COLUMN state_association_id UUID REFERENCES state_associations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE articles ADD COLUMN national_association_id UUID REFERENCES national_associations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_articles_state_association 
ON articles(state_association_id);

CREATE INDEX IF NOT EXISTS idx_articles_national_association 
ON articles(national_association_id);

-- Add RLS policies for state associations
DO $$
BEGIN
  DROP POLICY IF EXISTS "State admins can view their articles" ON articles;
  CREATE POLICY "State admins can view their articles"
    ON articles FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.state_association_id = articles.state_association_id
        AND usa.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "State admins can create articles" ON articles;
  CREATE POLICY "State admins can create articles"
    ON articles FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.state_association_id = articles.state_association_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
      )
    );

  DROP POLICY IF EXISTS "State admins can update their articles" ON articles;
  CREATE POLICY "State admins can update their articles"
    ON articles FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.state_association_id = articles.state_association_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
      )
    );

  DROP POLICY IF EXISTS "State admins can delete their articles" ON articles;
  CREATE POLICY "State admins can delete their articles"
    ON articles FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_state_associations usa
        WHERE usa.state_association_id = articles.state_association_id
        AND usa.user_id = auth.uid()
        AND usa.role = 'state_admin'
      )
    );

  -- National association policies
  DROP POLICY IF EXISTS "National admins can view their articles" ON articles;
  CREATE POLICY "National admins can view their articles"
    ON articles FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.national_association_id = articles.national_association_id
        AND una.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "National admins can create articles" ON articles;
  CREATE POLICY "National admins can create articles"
    ON articles FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.national_association_id = articles.national_association_id
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
      )
    );

  DROP POLICY IF EXISTS "National admins can update their articles" ON articles;
  CREATE POLICY "National admins can update their articles"
    ON articles FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.national_association_id = articles.national_association_id
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
      )
    );

  DROP POLICY IF EXISTS "National admins can delete their articles" ON articles;
  CREATE POLICY "National admins can delete their articles"
    ON articles FOR DELETE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_national_associations una
        WHERE una.national_association_id = articles.national_association_id
        AND una.user_id = auth.uid()
        AND una.role = 'national_admin'
      )
    );
END $$;
