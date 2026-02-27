/*
  # Fix Sync Function - Remove Phone Column Reference

  1. Problem
    - sync_club_membership_to_member() tries to get phone from profiles
    - profiles table doesn't have phone column
    - This prevents the sync from working

  2. Solution
    - Update function to not reference phone column
    - Phone will be NULL in member records (can be updated later)

  3. Security
    - Function remains SECURITY DEFINER
*/

-- Update function to remove phone column reference
CREATE OR REPLACE FUNCTION sync_club_membership_to_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_exists boolean;
  v_profile_data record;
BEGIN
  -- Only sync primary memberships back to members table
  IF NEW.relationship_type = 'primary' THEN

    -- Check if member record exists
    SELECT EXISTS (
      SELECT 1 FROM members
      WHERE user_id = NEW.member_id
      AND club_id = NEW.club_id
    ) INTO v_member_exists;

    IF v_member_exists THEN
      -- Update existing member record
      UPDATE members
      SET
        membership_status = CASE
          WHEN NEW.status = 'active' THEN 'active'
          WHEN NEW.status = 'expired' THEN 'expired'
          WHEN NEW.status = 'pending' THEN 'pending'
          WHEN NEW.status = 'archived' THEN 'archived'
          ELSE 'active'
        END,
        date_joined = NEW.joined_date,
        renewal_date = NEW.expiry_date,
        is_financial = CASE
          WHEN NEW.payment_status = 'paid' THEN true
          ELSE false
        END,
        payment_status = NEW.payment_status,
        updated_at = now()
      WHERE user_id = NEW.member_id
      AND club_id = NEW.club_id;
    ELSE
      -- Create new member record from profile data
      SELECT
        first_name,
        last_name,
        email,
        avatar_url
      INTO v_profile_data
      FROM profiles
      WHERE id = NEW.member_id;

      IF FOUND THEN
        INSERT INTO members (
          club_id,
          user_id,
          first_name,
          last_name,
          email,
          phone,
          avatar_url,
          membership_status,
          date_joined,
          renewal_date,
          is_financial,
          payment_status,
          created_at,
          updated_at
        ) VALUES (
          NEW.club_id,
          NEW.member_id,
          v_profile_data.first_name,
          v_profile_data.last_name,
          v_profile_data.email,
          NULL, -- Phone not in profiles, will be NULL
          v_profile_data.avatar_url,
          CASE
            WHEN NEW.status = 'active' THEN 'active'
            WHEN NEW.status = 'expired' THEN 'expired'
            WHEN NEW.status = 'pending' THEN 'pending'
            WHEN NEW.status = 'archived' THEN 'archived'
            ELSE 'active'
          END,
          NEW.joined_date,
          NEW.expiry_date,
          CASE
            WHEN NEW.payment_status = 'paid' THEN true
            ELSE false
          END,
          NEW.payment_status,
          now(),
          now()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
