/*
  # Add Yacht Type Category to AlfieTV Channels

  1. Changes
    - Add `yacht_type` column to `alfie_tv_channels` table
    - Supports filtering between 'full_size', 'rc_yachts', and 'all'
    - Default to 'full_size' for existing channels

  2. Security
    - No RLS changes needed - existing policies handle this column
*/

-- Add yacht_type column to channels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alfie_tv_channels' AND column_name = 'yacht_type'
  ) THEN
    ALTER TABLE alfie_tv_channels 
    ADD COLUMN yacht_type text NOT NULL DEFAULT 'full_size'
    CHECK (yacht_type IN ('full_size', 'rc_yachts', 'all'));
  END IF;
END $$;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_alfie_tv_channels_yacht_type 
ON alfie_tv_channels(yacht_type);

-- Update existing channels to 'all' (they can show in both categories)
UPDATE alfie_tv_channels 
SET yacht_type = 'all' 
WHERE yacht_type = 'full_size';