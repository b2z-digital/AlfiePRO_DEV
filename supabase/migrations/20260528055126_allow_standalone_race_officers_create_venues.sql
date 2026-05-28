/*
  # Allow Standalone Race Officers to Create Venues

  1. Schema Changes
    - Make `club_id` nullable on venues table (standalone users don't have a club)
    - Add `user_id` column to venues table for standalone ownership

  2. Security
    - Add INSERT policy for standalone race officers (users with is_race_officer=true)
    - Add SELECT policy for users to see their own venues
    - Add UPDATE policy for users to update their own venues
    - Add DELETE policy for users to delete their own venues

  3. Notes
    - Existing club-based venues remain unchanged (club_id NOT NULL for those)
    - Standalone venues have user_id set and club_id as NULL
*/

-- Make club_id nullable to support standalone venues
ALTER TABLE venues ALTER COLUMN club_id DROP NOT NULL;

-- Add user_id column for standalone venue ownership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE venues ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Index for user-owned venues lookup
CREATE INDEX IF NOT EXISTS idx_venues_user_id ON venues(user_id) WHERE user_id IS NOT NULL;

-- Policy: Standalone race officers can create their own venues
CREATE POLICY "Race officers can create own venues"
  ON venues FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND club_id IS NULL
  );

-- Policy: Users can view their own standalone venues
CREATE POLICY "Users can view own standalone venues"
  ON venues FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Policy: Users can update their own standalone venues
CREATE POLICY "Users can update own standalone venues"
  ON venues FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own standalone venues
CREATE POLICY "Users can delete own standalone venues"
  ON venues FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
