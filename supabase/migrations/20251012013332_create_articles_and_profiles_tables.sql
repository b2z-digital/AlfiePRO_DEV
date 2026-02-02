/*
  # Create articles and profiles tables for news functionality
  
  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `first_name` (text)
      - `last_name` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `articles`
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `content` (text, required)
      - `excerpt` (text, optional)
      - `author_id` (uuid, references auth.users)
      - `custom_author_name` (text, optional) - Custom author name override
      - `club_id` (uuid, references clubs)
      - `published_at` (timestamptz)
      - `cover_image` (text)
      - `status` (text, draft or published)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `article_tags`
      - `id` (uuid, primary key)
      - `article_id` (uuid, references articles)
      - `tag` (text)
  
  2. Security
    - Enable RLS on all tables
    - Public can view published articles
    - Club members can view all articles for their club
    - Club admins and editors can manage articles
*/

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name text,
  last_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create articles table
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  author_id uuid REFERENCES auth.users,
  custom_author_name text,
  club_id uuid REFERENCES clubs,
  published_at timestamptz,
  cover_image text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  CONSTRAINT articles_status_check CHECK (status IN ('draft', 'published'))
);

-- Create article_tags table
CREATE TABLE IF NOT EXISTS article_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES articles ON DELETE CASCADE,
  tag text NOT NULL,
  UNIQUE(article_id, tag)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_articles_updated_at ON articles;
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Policies for profiles
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policies for articles
-- Public can view published articles
CREATE POLICY "Public can view published articles" ON articles
  FOR SELECT
  TO public
  USING (status = 'published');

-- Club members can view all articles for their club
CREATE POLICY "Club members can view articles" ON articles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
      AND uc.user_id = auth.uid()
    )
  );

-- Club admins and editors can insert articles
CREATE POLICY "Club admins and editors can create articles" ON articles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Club admins and editors can update articles
CREATE POLICY "Club admins and editors can update articles" ON articles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Club admins and editors can delete articles
CREATE POLICY "Club admins and editors can delete articles" ON articles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = articles.club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Policies for article_tags
-- Public can view tags for published articles
CREATE POLICY "Public can view article tags" ON article_tags
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_tags.article_id
      AND a.status = 'published'
    )
  );

-- Club members can view all tags for their club's articles
CREATE POLICY "Club members can view article tags" ON article_tags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      JOIN user_clubs uc ON uc.club_id = a.club_id
      WHERE a.id = article_tags.article_id
      AND uc.user_id = auth.uid()
    )
  );

-- Club admins and editors can insert tags
CREATE POLICY "Club admins and editors can create article tags" ON article_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles a
      JOIN user_clubs uc ON uc.club_id = a.club_id
      WHERE a.id = article_tags.article_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Club admins and editors can delete tags
CREATE POLICY "Club admins and editors can delete article tags" ON article_tags
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      JOIN user_clubs uc ON uc.club_id = a.club_id
      WHERE a.id = article_tags.article_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags(article_id);
CREATE INDEX IF NOT EXISTS idx_articles_club_id ON articles(club_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles(author_id);