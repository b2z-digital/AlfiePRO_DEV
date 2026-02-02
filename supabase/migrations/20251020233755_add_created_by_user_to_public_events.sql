/*
  # Add User Tracking to Public Events

  1. Changes
    - Add `created_by_user_id` column to `public_events` table to track which user created the event
    - This allows showing "User Name - Club Name" in approval panels instead of just "Club"
  
  2. Notes
    - Column is nullable to maintain compatibility with existing events
    - Foreign key references auth.users to ensure data integrity
*/

-- Add created_by_user_id column to track the user who created the event
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public_events ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id);
    
    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_public_events_created_by_user ON public_events(created_by_user_id);
  END IF;
END $$;
