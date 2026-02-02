/*
  # Add Default Club to Profiles

  1. Changes
    - Add `default_club_id` column to `profiles` table
    - Add foreign key constraint to `clubs` table
    - Allow null values (not all users may have a default club set)
  
  2. Security
    - No RLS changes needed (profiles already has proper RLS)
*/

-- Add default_club_id column to profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'default_club_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN default_club_id uuid REFERENCES clubs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_default_club_id ON profiles(default_club_id);
