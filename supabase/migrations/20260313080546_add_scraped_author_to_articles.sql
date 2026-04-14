/*
  # Add scraped_author column to articles

  Stores the author/source name extracted from scraped articles
  (e.g. "ARYA Publicity" or the source feed name).
  Used when author_id is null (scraped articles have no registered user author).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'scraped_author'
  ) THEN
    ALTER TABLE articles ADD COLUMN scraped_author text;
  END IF;
END $$;
