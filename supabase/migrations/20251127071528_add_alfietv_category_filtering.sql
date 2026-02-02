/*
  # Add AlfieTV Category Filtering System

  1. Changes
    - Add category column to alfie_tv_channels table
    - Add category_preferences to profiles for user filtering
    - Add search_history tracking (optional for future autocomplete)

  2. Categories
    - Categories include: 'rc_yachting', 'full_size_yachting', 'sailing_education', 'racing', 'general'
    - Users can filter which categories they want to see
    - Preferences are stored in the user's profile
*/

-- Add category to channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'category'
  ) THEN
    ALTER TABLE alfie_tv_channels
    ADD COLUMN category text DEFAULT 'general' CHECK (category IN ('rc_yachting', 'full_size_yachting', 'sailing_education', 'racing', 'general'));
  END IF;
END $$;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_category ON alfie_tv_channels(category);

-- Add category_preferences to profiles if not exists (stored as JSON array of category strings)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'alfietv_category_preferences'
  ) THEN
    ALTER TABLE profiles
    ADD COLUMN alfietv_category_preferences jsonb DEFAULT '["rc_yachting", "full_size_yachting", "sailing_education", "racing", "general"]'::jsonb;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_alfietv_preferences ON profiles USING GIN (alfietv_category_preferences);

-- Update existing LIVE SailGP channel to full_size_yachting
UPDATE alfie_tv_channels
SET category = 'full_size_yachting'
WHERE channel_name ILIKE '%SailGP%' OR channel_url ILIKE '%SailGP%';

-- Update existing CYCATV channel to rc_yachting
UPDATE alfie_tv_channels
SET category = 'rc_yachting'
WHERE channel_name ILIKE '%CYCATV%' OR channel_url ILIKE '%CYCATV%' OR channel_name ILIKE '%cruising%yacht%';