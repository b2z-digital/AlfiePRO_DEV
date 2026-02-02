/*
  # Add event_id support to articles table

  1. Changes
    - Add `event_id` column to articles table to support event-specific news
    - Add foreign key constraint to event_websites table
    - Update RLS policies to allow event admins to manage event articles
  
  2. Security
    - Event articles can be managed by club admins who own the event
    - Public access for published articles
*/

-- Add event_id column to articles table
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS event_website_id uuid REFERENCES event_websites(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_articles_event_website_id ON articles(event_website_id);

-- Update RLS policies to support event articles
CREATE POLICY "Event admins can create event articles"
  ON articles FOR INSERT
  TO authenticated
  WITH CHECK (
    event_website_id IS NOT NULL AND
    EXISTS (
      SELECT 1 
      FROM event_websites ew
      INNER JOIN quick_races qr ON qr.id = ew.event_id
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE ew.id = event_website_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Event admins can update event articles"
  ON articles FOR UPDATE
  TO authenticated
  USING (
    event_website_id IS NOT NULL AND
    EXISTS (
      SELECT 1 
      FROM event_websites ew
      INNER JOIN quick_races qr ON qr.id = ew.event_id
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE ew.id = event_website_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Event admins can delete event articles"
  ON articles FOR DELETE
  TO authenticated
  USING (
    event_website_id IS NOT NULL AND
    EXISTS (
      SELECT 1 
      FROM event_websites ew
      INNER JOIN quick_races qr ON qr.id = ew.event_id
      INNER JOIN user_clubs uc ON uc.club_id = qr.club_id
      WHERE ew.id = event_website_id
        AND uc.user_id = auth.uid()
        AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Anyone can view published event articles"
  ON articles FOR SELECT
  TO public
  USING (
    event_website_id IS NOT NULL AND
    status = 'published'
  );
