/*
  # Create race series table with existence checks

  1. New Tables
    - `race_series`
      - `id` (uuid, primary key)
      - `club_name` (text)
      - `series_name` (text)
      - `race_class` (text)
      - `race_format` (text)
      - `rounds` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS
    - Add policies for:
      - Public read access
      - Authenticated users write access
*/

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS race_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name text NOT NULL,
  series_name text NOT NULL,
  race_class text NOT NULL,
  race_format text NOT NULL,
  rounds jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS if not already enabled
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'race_series' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE race_series ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Enable read access for all users" ON race_series;
  DROP POLICY IF EXISTS "Enable insert for authenticated users" ON race_series;
  DROP POLICY IF EXISTS "Enable update for authenticated users" ON race_series;
  DROP POLICY IF EXISTS "Enable delete for authenticated users" ON race_series;
END $$;

-- Create policies
CREATE POLICY "Enable read access for all users"
ON race_series
FOR SELECT
TO public
USING (true);

CREATE POLICY "Enable insert for authenticated users"
ON race_series
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users"
ON race_series
FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users"
ON race_series
FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated');

-- Create trigger for updating updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_race_series_updated_at'
  ) THEN
    CREATE TRIGGER update_race_series_updated_at
      BEFORE UPDATE ON race_series
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;