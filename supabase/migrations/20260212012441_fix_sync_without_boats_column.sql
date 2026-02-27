/*
  # Fix Sync Function - Remove Boats Column

  1. Problem
    - Members table doesn't have boats column
    - Boats are tracked separately in member_boats table
    - Need to get membership type NAME for membership_level field

  2. Solution
    - Remove boats column from sync
    - Get membership type name from membership_types table
    - Store in membership_level field

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
  v_application_data record;
  v_mapped_payment_status text;
  v_membership_type_name text;
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

    -- Get membership type name if membership_type_id is set
    IF NEW.membership_type_id IS NOT NULL THEN
      SELECT name INTO v_membership_type_name
      FROM membership_types
      WHERE id = NEW.membership_type_id;
    END IF;

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
        membership_level = COALESCE(v_membership_type_name, membership_level),
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
      -- Try to get ALL data from membership application first
      SELECT
        first_name,
        last_name,
        email,
        phone,
        street,
        city,
        state,
        postcode,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        membership_type_id
      INTO v_application_data
      FROM membership_applications
      WHERE user_id = NEW.member_id
      AND club_id = NEW.club_id
      AND status = 'approved'
      ORDER BY updated_at DESC
      LIMIT 1;

      -- Fall back to profile data if no application or if application has empty email
      IF NOT FOUND OR COALESCE(v_application_data.email, '') = '' THEN
        SELECT
          first_name,
          last_name,
          email,
          avatar_url
        INTO v_profile_data
        FROM profiles
        WHERE id = NEW.member_id;
        
        -- Use profile data (minimal fields)
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
            membership_level,
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
            NULL,
            v_profile_data.avatar_url,
            CASE
              WHEN NEW.status = 'active' THEN 'active'
              WHEN NEW.status = 'expired' THEN 'expired'
              WHEN NEW.status = 'pending' THEN 'pending'
              WHEN NEW.status = 'archived' THEN 'archived'
              ELSE 'active'
            END,
            v_membership_type_name,
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
      ELSE
        -- Use application data (ALL fields available!)
        INSERT INTO members (
          club_id,
          user_id,
          first_name,
          last_name,
          email,
          phone,
          street,
          city,
          state,
          postcode,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact_relationship,
          avatar_url,
          membership_status,
          membership_level,
          date_joined,
          renewal_date,
          is_financial,
          payment_status,
          created_at,
          updated_at
        ) VALUES (
          NEW.club_id,
          NEW.member_id,
          v_application_data.first_name,
          v_application_data.last_name,
          v_application_data.email,
          v_application_data.phone,
          v_application_data.street,
          v_application_data.city,
          v_application_data.state,
          v_application_data.postcode,
          v_application_data.emergency_contact_name,
          v_application_data.emergency_contact_phone,
          v_application_data.emergency_contact_relationship,
          NULL, -- Get avatar from profile if needed
          CASE
            WHEN NEW.status = 'active' THEN 'active'
            WHEN NEW.status = 'expired' THEN 'expired'
            WHEN NEW.status = 'pending' THEN 'pending'
            WHEN NEW.status = 'archived' THEN 'archived'
            ELSE 'active'
          END,
          v_membership_type_name,
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
