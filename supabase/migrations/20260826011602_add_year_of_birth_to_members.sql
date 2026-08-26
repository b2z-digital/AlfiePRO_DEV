/*
# Add year_of_birth column to members table

1. Modified Tables
  - `members`
    - Added `year_of_birth` (integer, nullable) — stores the 4-digit birth year for club members

2. Important Notes
  - Column is nullable since not all members have this data
  - No RLS changes needed as existing policies cover all columns
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'members' AND column_name = 'year_of_birth'
  ) THEN
    ALTER TABLE members ADD COLUMN year_of_birth integer;
  END IF;
END $$;