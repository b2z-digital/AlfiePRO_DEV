/*
  # Add Yacht Classes to Articles

  1. New Tables
    - `article_yacht_classes` - Junction table linking articles to yacht classes
      - `id` (uuid, primary key)
      - `article_id` (uuid, references articles)
      - `boat_class_id` (uuid, references boat_classes, nullable for "Generic")
      - `is_generic` (boolean) - True for generic/non-class-specific articles
      - `created_at` (timestamptz)

  2. Changes
    - Add unique constraint to prevent duplicate class assignments
    - Create indexes for efficient querying

  3. Security
    - Enable RLS on new table
    - Add policies for article authors and admins to manage class associations
    - Public can view class associations for published articles
*/

-- Create article_yacht_classes junction table
CREATE TABLE IF NOT EXISTS article_yacht_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  boat_class_id uuid REFERENCES boat_classes(id) ON DELETE CASCADE,
  is_generic boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure we don't have duplicate entries
  UNIQUE(article_id, boat_class_id),
  
  -- Check constraint: either is_generic is true OR boat_class_id is not null
  CONSTRAINT valid_class_or_generic CHECK (
    (is_generic = true AND boat_class_id IS NULL) OR
    (is_generic = false AND boat_class_id IS NOT NULL)
  )
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_article_yacht_classes_article_id 
  ON article_yacht_classes(article_id);

CREATE INDEX IF NOT EXISTS idx_article_yacht_classes_boat_class_id 
  ON article_yacht_classes(boat_class_id);

CREATE INDEX IF NOT EXISTS idx_article_yacht_classes_is_generic 
  ON article_yacht_classes(is_generic);

-- Enable RLS
ALTER TABLE article_yacht_classes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view yacht class associations for published articles
CREATE POLICY "Anyone can view yacht class associations for published articles"
  ON article_yacht_classes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_yacht_classes.article_id
      AND articles.status = 'published'
    )
  );

-- Policy: Article authors and admins can manage yacht class associations
CREATE POLICY "Authors and admins can manage yacht class associations"
  ON article_yacht_classes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
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
    EXISTS (
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

-- Create a helper function to get yacht classes for an article
CREATE OR REPLACE FUNCTION get_article_yacht_classes(article_uuid uuid)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  is_generic boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ayc.boat_class_id as class_id,
    COALESCE(bc.name, 'Generic') as class_name,
    ayc.is_generic
  FROM article_yacht_classes ayc
  LEFT JOIN boat_classes bc ON bc.id = ayc.boat_class_id
  WHERE ayc.article_id = article_uuid
  ORDER BY ayc.is_generic DESC, bc.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;