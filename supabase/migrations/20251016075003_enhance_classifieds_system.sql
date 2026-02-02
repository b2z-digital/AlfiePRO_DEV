-- Enhance Classifieds System for Club Integration
-- Adds club support, public visibility, favorites, and inquiry tracking

-- Add new columns to classifieds table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classifieds' AND column_name = 'club_id') THEN
    ALTER TABLE classifieds ADD COLUMN club_id uuid REFERENCES clubs(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classifieds' AND column_name = 'is_public') THEN
    ALTER TABLE classifieds ADD COLUMN is_public boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classifieds' AND column_name = 'views_count') THEN
    ALTER TABLE classifieds ADD COLUMN views_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classifieds' AND column_name = 'featured') THEN
    ALTER TABLE classifieds ADD COLUMN featured boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classifieds' AND column_name = 'expires_at') THEN
    ALTER TABLE classifieds ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- Create classified_favorites table
CREATE TABLE IF NOT EXISTS classified_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classified_id uuid REFERENCES classifieds(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(classified_id, user_id)
);

-- Create classified_inquiries table
CREATE TABLE IF NOT EXISTS classified_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classified_id uuid REFERENCES classifieds(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  inquiry_type text DEFAULT 'question',
  offer_amount numeric,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE classifieds ENABLE ROW LEVEL SECURITY;
ALTER TABLE classified_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE classified_inquiries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for classifieds

-- Public can view active public listings or club listings if they're a member
CREATE POLICY "Users can view classifieds" ON classifieds
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' AND 
    (expires_at IS NULL OR expires_at > now()) AND
    (
      is_public = true OR
      club_id IN (
        SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
      )
    )
  );

-- Users can create classifieds for their clubs
CREATE POLICY "Users can create classifieds" ON classifieds
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    club_id IN (
      SELECT club_id FROM user_clubs WHERE user_id = auth.uid()
    )
  );

-- Users can update their own classifieds
CREATE POLICY "Users can update own classifieds" ON classifieds
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own classifieds
CREATE POLICY "Users can delete own classifieds" ON classifieds
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for classified_favorites
CREATE POLICY "Users can view own favorites" ON classified_favorites
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can add favorites" ON classified_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove favorites" ON classified_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for classified_inquiries
CREATE POLICY "Users can view inquiries for their classifieds" ON classified_inquiries
  FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid() OR
    classified_id IN (
      SELECT id FROM classifieds WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create inquiries" ON classified_inquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Classified owners can update inquiry status" ON classified_inquiries
  FOR UPDATE
  TO authenticated
  USING (
    classified_id IN (
      SELECT id FROM classifieds WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    classified_id IN (
      SELECT id FROM classifieds WHERE user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_classifieds_club_id ON classifieds(club_id);
CREATE INDEX IF NOT EXISTS idx_classifieds_user_id ON classifieds(user_id);
CREATE INDEX IF NOT EXISTS idx_classifieds_status ON classifieds(status);
CREATE INDEX IF NOT EXISTS idx_classifieds_category ON classifieds(category);
CREATE INDEX IF NOT EXISTS idx_classifieds_created_at ON classifieds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classified_favorites_user ON classified_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_classified_inquiries_classified ON classified_inquiries(classified_id);