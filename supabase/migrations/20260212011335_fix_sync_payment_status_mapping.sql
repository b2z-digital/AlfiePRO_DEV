/*
  # Fix Payment Status Mapping in Sync Function

  1. Problem
    - members table only allows: 'paid', 'pending', 'overdue'
    - club_memberships uses: 'paid', 'unpaid', 'partial', 'overdue'
    - Sync function tries to insert 'unpaid' which fails constraint

  2. Solution
    - Map payment statuses correctly:
      - 'unpaid' → 'pending'
      - 'partial' → 'pending'
      - 'paid' → 'paid'
      - 'overdue' → 'overdue'

  3. Security
    - Function remains SECURITY DEFINER
*/

CREATE OR REPLACE FUNCTION sync_club_membership_to_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_exists boolean;
  v_profile_data record;
  v_mapped_payment_status text;
BEGIN
  -- Only sync primary memberships back to members table
  IF NEW.relationship_type = 'primary' THEN

    -- Map payment status from club_memberships to members format
    v_mapped_payment_status := CASE
      WHEN NEW.payment_status = 'paid' THEN 'paid'
      WHEN NEW.payment_status = 'overdue' THEN 'overdue'
      WHEN NEW.payment_status IN ('unpaid', 'partial') THEN 'pending'
      ELSE 'pending'
    END;

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
        payment_status = v_mapped_payment_status,
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
          v_mapped_payment_status,
          now(),
          now()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
