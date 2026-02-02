/*
  # Fix Event Invitation Trigger - Correct Email Field

  1. Changes
    - Update trigger function to use correct field name `guest_email` instead of `email`
    - The event_registrations table uses `guest_email`, not `email`

  2. Security
    - Maintains existing SECURITY DEFINER and search_path settings
*/

-- Fix the trigger function to use correct field name
CREATE OR REPLACE FUNCTION update_invitation_on_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update any pending invitations for this email and event
  -- Use guest_email instead of email since that's the actual field name
  UPDATE event_invitations
  SET status = 'registered',
      registered_at = now(),
      updated_at = now()
  WHERE event_id = NEW.event_id
  AND recipient_email = NEW.guest_email
  AND status = 'pending';
  
  RETURN NEW;
END;
$$;