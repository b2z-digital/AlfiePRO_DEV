/*
  # Create RPC function for submitting membership applications

  1. New Functions
    - `submit_membership_application` - Inserts a membership application via RPC
      bypassing any PostgREST schema cache issues with the membership_applications table
    - `get_user_club_role` - Gets user's role in a club via RPC
      bypassing PostgREST schema cache issues with user_clubs table
  
  2. Security
    - Both functions use SECURITY DEFINER to run with elevated privileges
    - Both verify the calling user is authenticated
    - submit_membership_application verifies user_id matches auth.uid()
*/

CREATE OR REPLACE FUNCTION public.submit_membership_application(
  p_club_id uuid,
  p_user_id uuid,
  p_membership_type_id uuid,
  p_membership_type_name text,
  p_membership_amount numeric,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT '',
  p_payment_method text DEFAULT 'bank_transfer',
  p_street text DEFAULT '',
  p_city text DEFAULT '',
  p_state text DEFAULT '',
  p_postcode text DEFAULT '',
  p_avatar_url text DEFAULT '',
  p_application_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

  INSERT INTO public.membership_applications (
    club_id, user_id, membership_type_id, membership_type_name,
    membership_amount, status, is_draft, first_name, last_name,
    email, phone, payment_method, street, city, state, postcode,
    avatar_url, application_data
  ) VALUES (
    p_club_id, p_user_id, p_membership_type_id, p_membership_type_name,
    p_membership_amount, 'pending', false, p_first_name, p_last_name,
    p_email, p_phone, p_payment_method, p_street, p_city, p_state, p_postcode,
    p_avatar_url, p_application_data
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_club_roles(p_user_id uuid)
RETURNS TABLE(club_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

  RETURN QUERY
  SELECT uc.club_id, uc.role::text
  FROM public.user_clubs uc
  WHERE uc.user_id = p_user_id;
END;
$$;

NOTIFY pgrst, 'reload schema';