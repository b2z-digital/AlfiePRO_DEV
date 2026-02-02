/*
  # Fix Circular Trigger Dependency Between Members and Club Memberships
  
  The triggers were causing infinite recursion:
  1. members update → sync_member_to_club_membership → updates club_memberships
  2. club_memberships update → sync_club_membership_to_member → updates members
  3. Back to step 1 - infinite loop
  
  1. Changes
    - Add OLD/NEW comparison checks to only update when values actually change
    - Prevent triggers from firing when there's no meaningful change
*/

-- Fix sync_club_membership_to_member to only update if values actually changed
CREATE OR REPLACE FUNCTION sync_club_membership_to_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_membership_status text;
  v_new_is_financial boolean;
  v_current_membership_status text;
  v_current_is_financial boolean;
  v_current_date_joined date;
  v_current_renewal_date date;
  v_current_payment_status text;
BEGIN
  -- Only sync primary memberships back to members table
  IF NEW.relationship_type = 'primary' THEN
    -- Calculate what the new values would be
    v_new_membership_status := CASE 
      WHEN NEW.status = 'active' THEN 'active'
      WHEN NEW.status = 'expired' THEN 'expired'
      WHEN NEW.status = 'pending' THEN 'pending'
      WHEN NEW.status = 'archived' THEN 'archived'
      ELSE 'active'
    END;
    
    v_new_is_financial := CASE 
      WHEN NEW.payment_status = 'paid' THEN true
      ELSE false
    END;
    
    -- Get current values from members table
    SELECT 
      membership_status, 
      is_financial, 
      date_joined, 
      renewal_date, 
      payment_status
    INTO 
      v_current_membership_status,
      v_current_is_financial,
      v_current_date_joined,
      v_current_renewal_date,
      v_current_payment_status
    FROM members
    WHERE user_id = NEW.member_id
    AND club_id = NEW.club_id;
    
    -- Only update if values are different
    IF v_current_membership_status IS DISTINCT FROM v_new_membership_status
       OR v_current_is_financial IS DISTINCT FROM v_new_is_financial
       OR v_current_date_joined IS DISTINCT FROM NEW.joined_date
       OR v_current_renewal_date IS DISTINCT FROM NEW.expiry_date
       OR v_current_payment_status IS DISTINCT FROM NEW.payment_status THEN
      
      UPDATE members
      SET
        membership_status = v_new_membership_status,
        date_joined = NEW.joined_date,
        renewal_date = NEW.expiry_date,
        is_financial = v_new_is_financial,
        payment_status = NEW.payment_status,
        updated_at = now()
      WHERE user_id = NEW.member_id
      AND club_id = NEW.club_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix sync_member_to_club_membership to only update if values actually changed
CREATE OR REPLACE FUNCTION sync_member_to_club_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_status text;
  v_new_payment_status text;
  v_current_status text;
  v_current_payment_status text;
  v_current_joined_date date;
  v_current_expiry_date date;
BEGIN
  -- When a member record is updated, sync to club_memberships
  IF NEW.user_id IS NOT NULL THEN
    -- Calculate what the new values would be
    v_new_status := CASE 
      WHEN NEW.membership_status = 'active' THEN 'active'
      WHEN NEW.membership_status = 'expired' THEN 'expired'
      WHEN NEW.membership_status = 'pending' THEN 'pending'
      WHEN NEW.membership_status = 'archived' THEN 'archived'
      ELSE 'active'
    END;
    
    v_new_payment_status := CASE 
      WHEN NEW.is_financial = true THEN 'paid'
      WHEN NEW.payment_status = 'paid' THEN 'paid'
      WHEN NEW.payment_status = 'partial' THEN 'partial'
      WHEN NEW.payment_status = 'overdue' THEN 'overdue'
      ELSE 'unpaid'
    END;
    
    IF EXISTS (
      SELECT 1 FROM club_memberships
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id
    ) THEN
      -- Get current values
      SELECT 
        status::text, 
        payment_status::text, 
        joined_date, 
        expiry_date
      INTO 
        v_current_status,
        v_current_payment_status,
        v_current_joined_date,
        v_current_expiry_date
      FROM club_memberships
      WHERE member_id = NEW.user_id
      AND club_id = NEW.club_id;
      
      -- Only update if values are different
      IF v_current_status IS DISTINCT FROM v_new_status
         OR v_current_payment_status IS DISTINCT FROM v_new_payment_status
         OR v_current_joined_date IS DISTINCT FROM NEW.date_joined
         OR v_current_expiry_date IS DISTINCT FROM NEW.renewal_date THEN
        
        UPDATE club_memberships
        SET
          status = v_new_status::membership_status_type,
          joined_date = NEW.date_joined,
          expiry_date = NEW.renewal_date,
          payment_status = v_new_payment_status::payment_status_type,
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
        v_new_status::membership_status_type,
        NEW.date_joined,
        NEW.renewal_date,
        v_new_payment_status::payment_status_type,
        true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;