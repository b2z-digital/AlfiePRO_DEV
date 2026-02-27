/*
  # Fix Member Sync - Remove Invalid Type Casts

  1. Problem
    - Trigger casts to membership_status_type and payment_status_type
    - These enum types don't exist in the database
    - Columns are just text type
    - Causes "type does not exist" error when saving member updates

  2. Solution
    - Remove ::membership_status_type casts
    - Remove ::payment_status_type casts
    - Values are already text, no casting needed

  3. Security
    - Function remains SECURITY DEFINER
*/

CREATE OR REPLACE FUNCTION sync_member_to_club_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_exists boolean;
  v_new_status text;
  v_new_payment_status text;
  v_current_status text;
  v_current_payment_status text;
  v_current_joined_date date;
  v_current_expiry_date date;
BEGIN
  -- Only sync if this is a primary membership (not archived)
  IF NEW.membership_status != 'archived' THEN
    
    -- Map membership_status to club_memberships.status
    v_new_status := CASE
      WHEN NEW.membership_status = 'active' THEN 'active'
      WHEN NEW.membership_status = 'expired' THEN 'expired'
      WHEN NEW.membership_status = 'pending' THEN 'pending'
      ELSE 'active'
    END;

    -- Map payment_status to club_memberships.payment_status
    v_new_payment_status := CASE
      WHEN NEW.payment_status = 'paid' THEN 'paid'
      WHEN NEW.payment_status = 'overdue' THEN 'overdue'
      WHEN NEW.payment_status = 'pending' THEN 'unpaid'
      ELSE 'unpaid'
    END;

    -- Check if club_membership exists
    SELECT EXISTS (
      SELECT 1 FROM club_memberships
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id
      AND relationship_type = 'primary'
    ) INTO v_membership_exists;

    IF v_membership_exists THEN
      -- Get current values to check if update is needed
      SELECT status, payment_status, joined_date, expiry_date
      INTO v_current_status, v_current_payment_status, v_current_joined_date, v_current_expiry_date
      FROM club_memberships
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id
      AND relationship_type = 'primary';
      
      -- Only update if values are different
      IF v_current_status IS DISTINCT FROM v_new_status
         OR v_current_payment_status IS DISTINCT FROM v_new_payment_status
         OR v_current_joined_date IS DISTINCT FROM NEW.date_joined
         OR v_current_expiry_date IS DISTINCT FROM NEW.renewal_date THEN
        
        UPDATE club_memberships
        SET
          status = v_new_status,
          joined_date = NEW.date_joined,
          expiry_date = NEW.renewal_date,
          payment_status = v_new_payment_status,
          updated_at = now()
        WHERE member_id = NEW.user_id
        AND club_id = NEW.club_id;
      END IF;
    ELSE
      -- Create new club_membership if it doesn't exist
      INSERT INTO club_memberships (
        member_id,
        club_id,
        relationship_type,
        status,
        joined_date,
        expiry_date,
        payment_status,
        pays_association_fees
      ) VALUES (
        NEW.user_id,
        NEW.club_id,
        'primary',
        v_new_status,
        NEW.date_joined,
        NEW.renewal_date,
        v_new_payment_status,
        true
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
