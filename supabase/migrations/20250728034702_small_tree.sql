/*
  # Create shared club media table

  1. New Tables
    - `shared_club_media`
      - `id` (uuid, primary key)
      - `media_id` (uuid, foreign key to event_media)
      - `sharing_club_id` (uuid, foreign key to clubs)
      - `recipient_club_id` (uuid, foreign key to clubs)
      - `shared_by_user_id` (uuid, foreign key to auth.users)
      - `message` (text, optional)
      - `shared_at` (timestamp)

  2. Security
    - Enable RLS on `shared_club_media` table
    - Add policies for club admins/editors to share media
    - Add policies for recipient clubs to view shared media

  3. Changes
    - Update event_media RLS to include shared media access
*/

CREATE TABLE IF NOT EXISTS shared_club_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL,
  sharing_club_id uuid NOT NULL,
  recipient_club_id uuid NOT NULL,
  shared_by_user_id uuid NOT NULL,
  message text,
  shared_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shared_club_media ENABLE ROW LEVEL SECURITY;

-- Foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'shared_club_media_media_id_fkey'
  ) THEN
    ALTER TABLE shared_club_media 
    ADD CONSTRAINT shared_club_media_media_id_fkey 
    FOREIGN KEY (media_id) REFERENCES event_media(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'shared_club_media_sharing_club_id_fkey'
  ) THEN
    ALTER TABLE shared_club_media 
    ADD CONSTRAINT shared_club_media_sharing_club_id_fkey 
    FOREIGN KEY (sharing_club_id) REFERENCES clubs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'shared_club_media_recipient_club_id_fkey'
  ) THEN
    ALTER TABLE shared_club_media 
    ADD CONSTRAINT shared_club_media_recipient_club_id_fkey 
    FOREIGN KEY (recipient_club_id) REFERENCES clubs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'shared_club_media_shared_by_user_id_fkey'
  ) THEN
    ALTER TABLE shared_club_media 
    ADD CONSTRAINT shared_club_media_shared_by_user_id_fkey 
    FOREIGN KEY (shared_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shared_club_media_media_id ON shared_club_media(media_id);
CREATE INDEX IF NOT EXISTS idx_shared_club_media_sharing_club_id ON shared_club_media(sharing_club_id);
CREATE INDEX IF NOT EXISTS idx_shared_club_media_recipient_club_id ON shared_club_media(recipient_club_id);
CREATE INDEX IF NOT EXISTS idx_shared_club_media_shared_by_user_id ON shared_club_media(shared_by_user_id);

-- RLS Policies for shared_club_media
CREATE POLICY "Club admins/editors can share media from their club"
  ON shared_club_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = sharing_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Users can view media shared with their club"
  ON shared_club_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = recipient_club_id
      AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = sharing_club_id
      AND uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Club admins/editors can manage shared media from their club"
  ON shared_club_media
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_clubs uc
      WHERE uc.club_id = sharing_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Update event_media RLS to include shared media access
CREATE POLICY "Users can view media shared with their club"
  ON event_media
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_club_media scm
      JOIN user_clubs uc ON uc.club_id = scm.recipient_club_id
      WHERE scm.media_id = event_media.id
      AND uc.user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_shared_club_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shared_club_media_updated_at
  BEFORE UPDATE ON shared_club_media
  FOR EACH ROW
  EXECUTE FUNCTION update_shared_club_media_updated_at();