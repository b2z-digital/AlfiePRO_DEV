/*
  # Fix sync_club_membership_to_member trigger - application lookup

  1. Problem
    - When admin approves an application, the flow is:
      a. Upsert club_memberships (triggers this function)
      b. Update application status to 'approved' (happens AFTER trigger)
    - The trigger only looked for applications with status = 'approved'
    - Since the status hasn't been updated yet, no application data is found
    - Falls back to profile data, but admin can't update other user's profile (RLS)
    - Result: member created with blank name/email/phone

  2. Fix
    - Look for applications with status IN ('approved', 'pending') 
    - Order by most recent, preferring 'approved' first
    - This catches the application data during the approval flow
*/

CREATE OR REPLACE FUNCTION public.sync_club_membership_to_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_member_exists boolean;
v_profile_data record;
v_application_data record;
v_mapped_payment_status text;
v_membership_type_name text;
BEGIN
IF NEW.relationship_type = 'primary' THEN

  v_mapped_payment_status := CASE
    WHEN NEW.payment_status = 'paid' THEN 'paid'
    WHEN NEW.payment_status = 'overdue' THEN 'overdue'
    WHEN NEW.payment_status IN ('unpaid', 'partial') THEN 'pending'
    ELSE 'pending'
  END;

  IF NEW.membership_type_id IS NOT NULL THEN
    SELECT name INTO v_membership_type_name
    FROM membership_types
    WHERE id = NEW.membership_type_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM members
    WHERE user_id = NEW.member_id
    AND club_id = NEW.club_id
  ) INTO v_member_exists;

  IF v_member_exists THEN
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
    AND status IN ('approved', 'pending')
    ORDER BY
      CASE WHEN status = 'approved' THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1;

    IF NOT FOUND OR COALESCE(v_application_data.email, '') = '' THEN
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
        NULL,
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
$function$;
