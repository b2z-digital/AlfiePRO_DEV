/*
  # Create Weather Cache System

  1. New Tables
    - `weather_cache`
      - `id` (uuid, primary key)
      - `location_key` (text) - Unique identifier for location (lat_lon)
      - `latitude` (numeric)
      - `longitude` (numeric)
      - `location_name` (text)
      - `current_weather` (jsonb) - Current weather data
      - `hourly_forecast` (jsonb) - Hourly wind forecast data
      - `daily_forecast` (jsonb) - 7-day forecast data
      - `marine_data` (jsonb) - Marine/tide data (optional)
      - `last_updated` (timestamptz) - When cache was last updated
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - Index on location_key for fast lookups
    - Index on last_updated for cache invalidation queries

  3. Security
    - Enable RLS on `weather_cache` table
    - Add policy for all authenticated users to read weather data
    - Add policy for system to update weather data

  4. Functions
    - Function to check if cache is stale (older than 1 hour)
    - Function to clean up old cache entries (older than 7 days)
*/

-- Create weather_cache table
CREATE TABLE IF NOT EXISTS weather_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_key text UNIQUE NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  location_name text NOT NULL,
  current_weather jsonb,
  hourly_forecast jsonb,
  daily_forecast jsonb,
  marine_data jsonb,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weather_cache_location_key ON weather_cache(location_key);
CREATE INDEX IF NOT EXISTS idx_weather_cache_last_updated ON weather_cache(last_updated);
CREATE INDEX IF NOT EXISTS idx_weather_cache_coordinates ON weather_cache(latitude, longitude);

-- Enable RLS
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read weather data
CREATE POLICY "Authenticated users can read weather cache"
  ON weather_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: All authenticated users can insert weather data
CREATE POLICY "Authenticated users can insert weather cache"
  ON weather_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: All authenticated users can update weather data
CREATE POLICY "Authenticated users can update weather cache"
  ON weather_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to check if cache is stale (older than 1 hour for current/hourly, 6 hours for daily)
CREATE OR REPLACE FUNCTION is_weather_cache_stale(
  cache_last_updated timestamptz,
  cache_type text DEFAULT 'current'
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF cache_type = 'daily' THEN
    -- Daily forecast can be cached for 6 hours
    RETURN cache_last_updated < (now() - interval '6 hours');
  ELSIF cache_type = 'marine' THEN
    -- Marine data can be cached for 2 hours
    RETURN cache_last_updated < (now() - interval '2 hours');
  ELSE
    -- Current weather and hourly forecast cache for 1 hour
    RETURN cache_last_updated < (now() - interval '1 hour');
  END IF;
END;
$$;

-- Function to clean up old cache entries (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_weather_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM weather_cache
  WHERE last_updated < (now() - interval '7 days');
END;
$$;

-- Create a function to get or create weather cache entry
CREATE OR REPLACE FUNCTION get_weather_cache(
  p_latitude numeric,
  p_longitude numeric,
  p_location_name text
)
RETURNS TABLE (
  id uuid,
  location_key text,
  latitude numeric,
  longitude numeric,
  location_name text,
  current_weather jsonb,
  hourly_forecast jsonb,
  daily_forecast jsonb,
  marine_data jsonb,
  last_updated timestamptz,
  is_stale boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_key text;
  v_cache_record RECORD;
BEGIN
  -- Create location key from coordinates (rounded to 2 decimal places)
  v_location_key := ROUND(p_latitude::numeric, 2)::text || '_' || ROUND(p_longitude::numeric, 2)::text;
  
  -- Try to find existing cache entry
  SELECT * INTO v_cache_record
  FROM weather_cache wc
  WHERE wc.location_key = v_location_key;
  
  -- If not found, create a new entry
  IF NOT FOUND THEN
    INSERT INTO weather_cache (location_key, latitude, longitude, location_name)
    VALUES (v_location_key, p_latitude, p_longitude, p_location_name)
    RETURNING * INTO v_cache_record;
  END IF;
  
  -- Return the cache entry with stale flag
  RETURN QUERY
  SELECT 
    v_cache_record.id,
    v_cache_record.location_key,
    v_cache_record.latitude,
    v_cache_record.longitude,
    v_cache_record.location_name,
    v_cache_record.current_weather,
    v_cache_record.hourly_forecast,
    v_cache_record.daily_forecast,
    v_cache_record.marine_data,
    v_cache_record.last_updated,
    is_weather_cache_stale(v_cache_record.last_updated, 'current') as is_stale;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE weather_cache IS 'Caches weather data to minimize API calls. Current/hourly data cached for 1 hour, daily for 6 hours, marine for 2 hours.';
