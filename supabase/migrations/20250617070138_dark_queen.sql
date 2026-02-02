/*
  # Add membership renewal date options
  
  1. Changes
    - Add `renewal_mode` column to `clubs` table
    - Add `fixed_renewal_date` column to `clubs` table
    
  2. Notes
    - Allows clubs to choose between anniversary-based or fixed date renewals
    - Supports storing a specific date for all memberships to renew
*/

-- Add renewal_mode to clubs table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'renewal_mode'
  ) THEN
    ALTER TABLE clubs ADD COLUMN renewal_mode TEXT DEFAULT 'anniversary' CHECK (renewal_mode IN ('anniversary', 'fixed'));
  END IF;
END $$;

-- Add fixed_renewal_date to clubs table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clubs' AND column_name = 'fixed_renewal_date'
  ) THEN
    ALTER TABLE clubs ADD COLUMN fixed_renewal_date TEXT; -- Stored as MM-DD format
  END IF;
END $$;

-- Update the check_membership_renewal function to handle both renewal modes
CREATE OR REPLACE FUNCTION check_membership_renewal(member_id uuid)
RETURNS boolean AS $$
DECLARE
  renewal_needed boolean;
  member_club_id uuid;
  club_renewal_mode text;
  club_fixed_date text;
  today date;
  renewal_date date;
  fixed_renewal_date date;
  notification_days integer;
BEGIN
  -- Get the current date
  today := CURRENT_DATE;
  
  -- Default notification period (30 days)
  notification_days := 30;
  
  -- Get member's club and renewal date
  SELECT 
    m.club_id, 
    m.renewal_date,
    c.renewal_mode,
    c.fixed_renewal_date
  INTO 
    member_club_id,
    renewal_date,
    club_renewal_mode,
    club_fixed_date
  FROM 
    members m
    JOIN clubs c ON m.club_id = c.id
  WHERE 
    m.id = member_id;
  
  -- If club uses fixed renewal date
  IF club_renewal_mode = 'fixed' AND club_fixed_date IS NOT NULL THEN
    -- Parse MM-DD format to create a date in the current year
    fixed_renewal_date := make_date(
      EXTRACT(YEAR FROM today)::int,
      split_part(club_fixed_date, '-', 1)::int,
      split_part(club_fixed_date, '-', 2)::int
    );
    
    -- If the fixed date has already passed this year, use next year's date
    IF fixed_renewal_date < today THEN
      fixed_renewal_date := make_date(
        EXTRACT(YEAR FROM today)::int + 1,
        split_part(club_fixed_date, '-', 1)::int,
        split_part(club_fixed_date, '-', 2)::int
      );
    END IF;
    
    -- Check if we're within the notification period
    renewal_needed := fixed_renewal_date <= (today + (notification_days || ' days')::interval);
  ELSE
    -- Anniversary-based renewal (original logic)
    renewal_needed := 
      CASE 
        WHEN renewal_date IS NULL THEN false
        WHEN renewal_date <= (today + (notification_days || ' days')::interval) THEN true
        ELSE false
      END;
  END IF;
  
  RETURN renewal_needed;
END;
$$ LANGUAGE plpgsql;