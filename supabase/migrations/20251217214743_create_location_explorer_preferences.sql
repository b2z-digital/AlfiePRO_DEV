/*
  # Location Explorer Preferences System

  ## Overview
  Creates tables for storing user location preferences, travel search history, and favorite race locations.

  ## Tables Created
  
  ### 1. user_location_preferences
  Stores user preferences for location-based race discovery:
  - `user_id` - Reference to the user
  - `default_search_radius` - Default search radius in kilometers
  - `favorite_locations` - Array of saved favorite locations with coordinates
  - `recent_searches` - Array of recent location searches
  - `show_travel_time` - Whether to show driving times
  - `preferred_distance_unit` - km or miles
  
  ### 2. saved_race_locations
  Stores bookmarked race locations for easy access:
  - `user_id` - Reference to the user
  - `location_name` - Name of the saved location
  - `latitude` - Location latitude
  - `longitude` - Location longitude
  - `search_radius` - Preferred radius for this location
  - `notes` - Optional notes about the location
  
  ## Security
  - RLS enabled on all tables
  - Users can only access their own preferences and saved locations
*/

-- Create user_location_preferences table
CREATE TABLE IF NOT EXISTS user_location_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_search_radius integer DEFAULT 50,
  favorite_locations jsonb DEFAULT '[]'::jsonb,
  recent_searches jsonb DEFAULT '[]'::jsonb,
  show_travel_time boolean DEFAULT true,
  preferred_distance_unit text DEFAULT 'km' CHECK (preferred_distance_unit IN ('km', 'miles')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create saved_race_locations table
CREATE TABLE IF NOT EXISTS saved_race_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_name text NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  search_radius integer DEFAULT 50,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_saved_race_locations_user_id ON saved_race_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_race_locations_coordinates ON saved_race_locations(latitude, longitude);

-- Enable RLS
ALTER TABLE user_location_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_race_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_location_preferences
CREATE POLICY "Users can view own location preferences"
  ON user_location_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own location preferences"
  ON user_location_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own location preferences"
  ON user_location_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own location preferences"
  ON user_location_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for saved_race_locations
CREATE POLICY "Users can view own saved locations"
  ON saved_race_locations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved locations"
  ON saved_race_locations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved locations"
  ON saved_race_locations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved locations"
  ON saved_race_locations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_location_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_location_preferences_timestamp ON user_location_preferences;
CREATE TRIGGER update_location_preferences_timestamp
  BEFORE UPDATE ON user_location_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_location_preferences_updated_at();

DROP TRIGGER IF EXISTS update_saved_locations_timestamp ON saved_race_locations;
CREATE TRIGGER update_saved_locations_timestamp
  BEFORE UPDATE ON saved_race_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_location_preferences_updated_at();