/*
  # Committee Position Definitions System
  
  1. New Tables
    - `committee_position_definitions`
      - `id` (uuid, primary key)
      - `club_id` (uuid, references clubs)
      - `position_name` (text) - e.g., "Commodore", "Treasurer"
      - `description` (text) - optional description of role
      - `display_order` (integer) - for sorting
      - `is_executive` (boolean) - whether it's an executive role
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      
  2. Changes
    - Update `committee_positions` to reference position definitions
    - Add `position_definition_id` column
    - Keep `position_title` for backward compatibility
    
  3. Security
    - Enable RLS on new table
    - Club members can view position definitions
    - Only admins/editors can create/update/delete definitions
    
  4. Default Positions
    - Insert default committee positions for clubs
    - Commodore, Vice Commodore, Secretary, Treasurer, etc.
*/

-- Create committee_position_definitions table
CREATE TABLE IF NOT EXISTS committee_position_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  position_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  is_executive BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add position_definition_id to committee_positions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'committee_positions' AND column_name = 'position_definition_id'
  ) THEN
    ALTER TABLE committee_positions 
    ADD COLUMN position_definition_id UUID REFERENCES committee_position_definitions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_committee_position_definitions_club_id 
  ON committee_position_definitions(club_id);
CREATE INDEX IF NOT EXISTS idx_committee_position_definitions_display_order 
  ON committee_position_definitions(club_id, display_order);
CREATE INDEX IF NOT EXISTS idx_committee_positions_definition_id 
  ON committee_positions(position_definition_id);

-- Enable RLS
ALTER TABLE committee_position_definitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for committee_position_definitions
CREATE POLICY "Club members can view position definitions"
  ON committee_position_definitions FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins/editors can insert position definitions"
  ON committee_position_definitions FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can update position definitions"
  ON committee_position_definitions FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Admins/editors can delete position definitions"
  ON committee_position_definitions FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id 
      FROM user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- Function to create default positions for a club
CREATE OR REPLACE FUNCTION create_default_committee_positions(p_club_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Only create if no positions exist for this club
  IF NOT EXISTS (
    SELECT 1 FROM committee_position_definitions WHERE club_id = p_club_id
  ) THEN
    INSERT INTO committee_position_definitions (club_id, position_name, description, display_order, is_executive)
    VALUES
      (p_club_id, 'Commodore', 'Club President and Chief Executive Officer', 1, true),
      (p_club_id, 'Vice Commodore', 'Deputy to the Commodore', 2, true),
      (p_club_id, 'Rear Commodore', 'Third in command', 3, true),
      (p_club_id, 'Secretary', 'Manages correspondence and records', 4, true),
      (p_club_id, 'Treasurer', 'Manages club finances', 5, true),
      (p_club_id, 'Race Officer', 'Oversees race operations', 6, false),
      (p_club_id, 'Sailing Master', 'Manages sailing activities', 7, false),
      (p_club_id, 'Membership Officer', 'Manages membership', 8, false),
      (p_club_id, 'Social Secretary', 'Organizes social events', 9, false),
      (p_club_id, 'Safety Officer', 'Oversees safety protocols', 10, false);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create default positions for new clubs
CREATE OR REPLACE FUNCTION trigger_create_default_positions()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_committee_positions(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'create_default_positions_on_club_creation'
  ) THEN
    CREATE TRIGGER create_default_positions_on_club_creation
      AFTER INSERT ON clubs
      FOR EACH ROW
      EXECUTE FUNCTION trigger_create_default_positions();
  END IF;
END $$;

-- Create default positions for existing clubs
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN SELECT id FROM clubs LOOP
    PERFORM create_default_committee_positions(club_record.id);
  END LOOP;
END $$;