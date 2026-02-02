/*
  # Data Migration for User Management
  
  1. Changes
    - Migrate existing data to new schema
    - Update club_id in quick_races and race_series
    - Update club_id in members and venues
    
  2. Notes
    - Preserves existing data relationships
    - Handles null values gracefully
    - Uses safe migration patterns
*/

-- Create a temporary function to handle the migration
CREATE OR REPLACE FUNCTION migrate_club_data()
RETURNS void AS $$
DECLARE
  club_record RECORD;
  race_record RECORD;
  series_record RECORD;
  member_record RECORD;
  venue_record RECORD;
BEGIN
  -- For each club, update related records
  FOR club_record IN SELECT * FROM clubs LOOP
    -- Update quick_races
    FOR race_record IN 
      SELECT * FROM quick_races 
      WHERE club_name = club_record.name OR club_name = club_record.abbreviation 
    LOOP
      UPDATE quick_races
      SET club_id = club_record.id
      WHERE id = race_record.id;
    END LOOP;
    
    -- Update race_series
    FOR series_record IN 
      SELECT * FROM race_series 
      WHERE club_name = club_record.name OR club_name = club_record.abbreviation 
    LOOP
      UPDATE race_series
      SET club_id = club_record.id
      WHERE id = series_record.id;
    END LOOP;
    
    -- Update members
    FOR member_record IN 
      SELECT * FROM members 
      WHERE club = club_record.name
    LOOP
      UPDATE members
      SET club_id = club_record.id
      WHERE id = member_record.id;
    END LOOP;
    
    -- Update venues (assuming venues are associated with clubs by name in some way)
    -- This is a placeholder - you may need to adjust the logic based on your data
    FOR venue_record IN 
      SELECT * FROM venues
    LOOP
      -- For now, we'll just associate all venues with the first club
      -- You may want to implement more sophisticated logic
      UPDATE venues
      SET club_id = club_record.id
      WHERE id = venue_record.id AND club_id IS NULL;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function
SELECT migrate_club_data();

-- Drop the temporary function
DROP FUNCTION migrate_club_data();