/*
  # Fix Sync Function - Get Data from Application if Profile Empty

  1. Problem
    - Profiles sometimes have empty first_name/last_name/email
    - This creates member records with empty data
    - Members with empty data don't show in lists

  2. Solution
    - Try to get data from membership_applications first
    - Fall back to profiles if no application exists
    - Ensures member records have complete data

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
      -- Try to get data from membership application first (most recent approved application)
      SELECT
        first_name,
        last_name,
        email,
        phone
      INTO v_application_data
      FROM membership_applications
      WHERE user_id = NEW.member_id
      AND club_id = NEW.club_id
      AND status = 'approved'
      ORDER BY updated_at DESC
      LIMIT 1;

      -- Fall back to profile data if no application or if application has empty data
      IF NOT FOUND OR COALESCE(v_application_data.email, '') = '' THEN
        SELECT
          first_name,
          last_name,
          email,
          avatar_url
        INTO v_profile_data
        FROM profiles
        WHERE id = NEW.member_id;
        
        -- Use profile data
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
            NULL,
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
      ELSE
        -- Use application data (no avatar from application)
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
          v_application_data.first_name,
          v_application_data.last_name,
          v_application_data.email,
          v_application_data.phone,
          NULL, -- Get avatar from profile in a separate query if needed
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
