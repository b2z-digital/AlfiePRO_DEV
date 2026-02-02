/*
  # Fix Event Registrations - Use SECURITY DEFINER Function

  1. Changes
    - Keep existing RLS policies
    - Create a security definer function that bypasses RLS for inserts
    - Grant execute permission to anon and authenticated roles
*/

-- Create a function that can insert registrations bypassing RLS
CREATE OR REPLACE FUNCTION public.create_event_registration(
  p_event_id uuid,
  p_club_id uuid,
  p_registration_type text,
  p_user_id uuid,
  p_status text,
  p_payment_status text,
  p_payment_method text,
  p_entry_fee_amount numeric,
  p_amount_paid numeric,
  p_guest_first_name text,
  p_guest_last_name text,
  p_guest_email text,
  p_guest_phone text,
  p_guest_club_name text,
  p_guest_country text,
  p_guest_state text,
  p_guest_address_line1 text,
  p_guest_address_line2 text,
  p_guest_city text,
  p_guest_postcode text,
  p_boat_name text,
  p_sail_number text,
  p_boat_class text,
  p_boat_country text,
  p_boat_registration_no text,
  p_is_personal_sail_number boolean,
  p_accept_temporary_membership boolean,
  p_has_liability_insurance boolean,
  p_dnm_country text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration_id uuid;
BEGIN
  INSERT INTO event_registrations (
    event_id,
    club_id,
    registration_type,
    user_id,
    status,
    payment_status,
    payment_method,
    entry_fee_amount,
    amount_paid,
    guest_first_name,
    guest_last_name,
    guest_email,
    guest_phone,
    guest_club_name,
    guest_country,
    guest_state,
    guest_address_line1,
    guest_address_line2,
    guest_city,
    guest_postcode,
    boat_name,
    sail_number,
    boat_class,
    boat_country,
    boat_registration_no,
    is_personal_sail_number,
    accept_temporary_membership,
    has_liability_insurance,
    dnm_country
  ) VALUES (
    p_event_id,
    p_club_id,
    p_registration_type,
    p_user_id,
    p_status,
    p_payment_status,
    p_payment_method,
    p_entry_fee_amount,
    p_amount_paid,
    p_guest_first_name,
    p_guest_last_name,
    p_guest_email,
    p_guest_phone,
    p_guest_club_name,
    p_guest_country,
    p_guest_state,
    p_guest_address_line1,
    p_guest_address_line2,
    p_guest_city,
    p_guest_postcode,
    p_boat_name,
    p_sail_number,
    p_boat_class,
    p_boat_country,
    p_boat_registration_no,
    p_is_personal_sail_number,
    p_accept_temporary_membership,
    p_has_liability_insurance,
    p_dnm_country
  )
  RETURNING id INTO v_registration_id;
  
  RETURN v_registration_id;
END;
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.create_event_registration TO anon, authenticated;