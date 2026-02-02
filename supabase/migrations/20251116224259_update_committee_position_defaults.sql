/*
  # Update Committee Position Defaults
  
  1. Changes
    - Update default committee positions to new list:
      * President
      * Vice President
      * Secretary
      * Treasurer
      * Public Officer
      * Regatta Officer
      * Class Coordinator
      * Delegates
    - Remove is_executive designation (all positions are equal)
    - Update existing positions in all clubs
    
  2. Notes
    - Positions can now have multiple members assigned
    - All positions have is_executive set to false
*/

-- Update the function to create new default positions
CREATE OR REPLACE FUNCTION create_default_committee_positions(p_club_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Only create if no positions exist for this club
  IF NOT EXISTS (
    SELECT 1 FROM committee_position_definitions WHERE club_id = p_club_id
  ) THEN
    INSERT INTO committee_position_definitions (club_id, position_name, description, display_order, is_executive)
    VALUES
      (p_club_id, 'President', 'Club President', 1, false),
      (p_club_id, 'Vice President', 'Vice President', 2, false),
      (p_club_id, 'Secretary', 'Manages correspondence and records', 3, false),
      (p_club_id, 'Treasurer', 'Manages club finances', 4, false),
      (p_club_id, 'Public Officer', 'Public Officer', 5, false),
      (p_club_id, 'Regatta Officer', 'Oversees race operations', 6, false),
      (p_club_id, 'Class Coordinator', 'Coordinates class activities', 7, false),
      (p_club_id, 'Delegates', 'Club delegates', 8, false);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update existing positions in all clubs to the new standard
DO $$
DECLARE
  club_record RECORD;
BEGIN
  FOR club_record IN SELECT id FROM clubs LOOP
    -- Delete old default positions if they exist
    DELETE FROM committee_position_definitions 
    WHERE club_id = club_record.id;
    
    -- Create new default positions
    PERFORM create_default_committee_positions(club_record.id);
  END LOOP;
END $$;
