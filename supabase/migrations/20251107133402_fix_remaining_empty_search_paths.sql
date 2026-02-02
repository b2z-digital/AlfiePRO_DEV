/*
  # Fix remaining security definer functions with empty search paths

  1. Changes
    - Update security definer functions that have empty search_path using CREATE OR REPLACE
    - This fixes "relation does not exist" errors throughout the application
  
  2. Functions Fixed
    - is_club_admin
    - is_national_admin
    - is_state_admin  
    - is_platform_super_admin
*/

-- Fix is_club_admin
CREATE OR REPLACE FUNCTION public.is_club_admin(club_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_clubs uc
    WHERE uc.club_id = club_uuid
      AND uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
  );
END;
$$;

-- Fix is_national_admin
CREATE OR REPLACE FUNCTION public.is_national_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_clubs uc
    WHERE uc.user_id = check_user_id
      AND uc.role = 'national_admin'
  );
END;
$$;

-- Fix is_state_admin
CREATE OR REPLACE FUNCTION public.is_state_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_clubs uc
    WHERE uc.user_id = check_user_id
      AND uc.role = 'state_admin'
  );
END;
$$;

-- Fix is_platform_super_admin
CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_super_admin = true
  );
END;
$$;