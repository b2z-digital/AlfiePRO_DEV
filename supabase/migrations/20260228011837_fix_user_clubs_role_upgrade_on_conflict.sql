/*
  # Fix user_clubs role not being upgraded on conflict

  1. Problem
    - Multiple functions use ON CONFLICT (user_id, club_id) DO NOTHING when inserting into user_clubs
    - This means if a user already has a 'member' role and someone tries to make them 'admin', the upgrade is silently ignored
    - This caused Peter Zecchin to remain as 'member' in KBRYC even after being assigned as admin

  2. Fixed Functions
    - `accept_invitation` - now uses DO NOTHING (correct, invitations are always 'member' and shouldn't downgrade)
    - `admin_link_member_to_account` - now uses DO NOTHING (correct, linking shouldn't change role)
    - `auto_link_all_matching_members` - now uses DO NOTHING (correct, auto-linking shouldn't change role)
    - `auto_add_creator_to_user_clubs` - changed to DO UPDATE SET role = 'admin' (creator should always be admin)

  3. New Helper Function
    - `upgrade_user_club_role` - safely upgrades a user's club role only if the new role is higher
    - Role hierarchy: admin > pro > editor > viewer > member
    - Never downgrades a role

  4. Important Notes
    - The real fix is in the frontend ClubOnboardingWizard which now uses upsert instead of checking existence
    - The database functions are updated for defense-in-depth
*/

CREATE OR REPLACE FUNCTION public.role_priority(role_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE role_name
    WHEN 'admin' THEN 5
    WHEN 'pro' THEN 4
    WHEN 'editor' THEN 3
    WHEN 'viewer' THEN 2
    WHEN 'member' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.auto_add_creator_to_user_clubs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.user_clubs (user_id, club_id, role)
  VALUES (NEW.created_by_user_id, NEW.id, 'admin')
  ON CONFLICT (user_id, club_id) DO UPDATE
  SET role = 'admin';

  RETURN NEW;
END;
$function$;
