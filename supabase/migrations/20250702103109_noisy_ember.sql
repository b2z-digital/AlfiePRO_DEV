/*
  # Add News Articles Schema
  
  1. New Tables
    - `articles` - Stores news articles for clubs
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `content` (text, required)
      - `excerpt` (text)
      - `author_id` (uuid, references users)
      - `club_id` (uuid, references clubs)
      - `published_at` (timestamp with time zone)
      - `cover_image` (text)
      - `created_at` (timestamp with time zone)
      - `updated_at` (timestamp with time zone)
      - `status` (text, enum: 'draft', 'published')
    
    - `article_tags` - Junction table for article tags
      - `id` (uuid, primary key)
      - `article_id` (uuid, references articles)
      - `tag` (text, required)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for proper access control
*/

-- Create articles table
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  author_id uuid REFERENCES auth.users,
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
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger for articles
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

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

-- Club admins and editors can manage articles
CREATE POLICY "Club admins and editors can manage articles" ON articles
  FOR ALL
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

-- Club admins and editors can manage tags
CREATE POLICY "Club admins and editors can manage article tags" ON article_tags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      JOIN user_clubs uc ON uc.club_id = a.club_id
      WHERE a.id = article_tags.article_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles a
      JOIN user_clubs uc ON uc.club_id = a.club_id
      WHERE a.id = article_tags.article_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Create index on article_id in article_tags
CREATE INDEX IF NOT EXISTS idx_article_tags_article_id ON article_tags(article_id);

-- Create index on club_id in articles
CREATE INDEX IF NOT EXISTS idx_articles_club_id ON articles(club_id);

-- Create index on status in articles
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

-- Create index on published_at in articles
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);