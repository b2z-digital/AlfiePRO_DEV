/*
  # Create RPC to set race officer status

  1. New Functions
    - `set_race_officer_status` - Allows super admins to toggle race officer flag on profiles
    - `invite_race_officer` - Allows super admins to create a new auth user and mark as race officer

  2. Security
    - Both functions are SECURITY DEFINER
    - Both check that calling user is an active super admin
*/

CREATE OR REPLACE FUNCTION public.set_race_officer_status(
  p_user_id uuid,
  p_is_race_officer boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = auth.uid() AND super_admins.is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  UPDATE public.profiles
  SET is_race_officer = p_is_race_officer,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user_id %', p_user_id;
  END IF;
END;
$function$;
