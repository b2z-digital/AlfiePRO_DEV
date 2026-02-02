/*
  # Allow Public Access to Race Calendar Data

  1. Changes
    - Add RLS policies to allow anonymous users to view quick_races
    - Add RLS policies to allow anonymous users to view race_series_rounds
    - Add RLS policies to allow anonymous users to view race_series
    - Add RLS policies to allow anonymous users to view venues (for location info)
    
  2. Security
    - Only SELECT access is granted
    - Data remains read-only for anonymous users
    - Members still need authentication for other operations
*/

-- Allow public to view quick_races
CREATE POLICY "Public can view quick races"
  ON quick_races FOR SELECT
  TO anon
  USING (true);

-- Allow public to view race series
CREATE POLICY "Public can view race series"
  ON race_series FOR SELECT
  TO anon
  USING (true);

-- Allow public to view race series rounds
CREATE POLICY "Public can view race series rounds"
  ON race_series_rounds FOR SELECT
  TO anon
  USING (true);

-- Allow public to view venues
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'venues' 
    AND policyname = 'Public can view venues'
  ) THEN
    CREATE POLICY "Public can view venues"
      ON venues FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;