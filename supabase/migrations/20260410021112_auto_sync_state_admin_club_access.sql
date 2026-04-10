/*
  # Auto-sync state admin club access

  1. Changes
    - Backfills user_clubs entries for all state admins so they have admin access
      to every club under their state association
    - Creates a trigger that automatically adds user_clubs entries when:
      a) A new club is assigned to a state association
      b) A new state admin is added to a state association

  2. Security
    - Only grants admin role to state_admin users for clubs under their association
    - Uses ON CONFLICT DO NOTHING to avoid duplicating existing entries

  3. Important Notes
    - This fixes an issue where state admins could not see all clubs in the context
      switcher because they only had user_clubs entries for clubs they personally created
    - The trigger ensures future clubs and state admin assignments are automatically synced
*/

-- Backfill: add user_clubs entries for all state admins for all clubs under their association
INSERT INTO public.user_clubs (user_id, club_id, role)
SELECT DISTINCT
  usa.user_id,
  c.id,
  'admin'::public.club_role
FROM public.user_state_associations usa
JOIN public.clubs c ON c.state_association_id = usa.state_association_id
WHERE usa.role = 'state_admin'
ON CONFLICT (user_id, club_id) DO NOTHING;

-- Create function to sync state admin access when a club is added to an association
CREATE OR REPLACE FUNCTION public.sync_state_admin_club_access_on_club_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state_association_id IS NOT NULL THEN
    INSERT INTO public.user_clubs (user_id, club_id, role)
    SELECT usa.user_id, NEW.id, 'admin'::public.club_role
    FROM public.user_state_associations usa
    WHERE usa.state_association_id = NEW.state_association_id
      AND usa.role = 'state_admin'
    ON CONFLICT (user_id, club_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_state_admin_access_on_club_insert ON public.clubs;
CREATE TRIGGER sync_state_admin_access_on_club_insert
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_state_admin_club_access_on_club_change();

DROP TRIGGER IF EXISTS sync_state_admin_access_on_club_update ON public.clubs;
CREATE TRIGGER sync_state_admin_access_on_club_update
  AFTER UPDATE OF state_association_id ON public.clubs
  FOR EACH ROW
  WHEN (OLD.state_association_id IS DISTINCT FROM NEW.state_association_id)
  EXECUTE FUNCTION public.sync_state_admin_club_access_on_club_change();

-- Create function to sync access when a new state admin is assigned
CREATE OR REPLACE FUNCTION public.sync_state_admin_club_access_on_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'state_admin' THEN
    INSERT INTO public.user_clubs (user_id, club_id, role)
    SELECT NEW.user_id, c.id, 'admin'::public.club_role
    FROM public.clubs c
    WHERE c.state_association_id = NEW.state_association_id
    ON CONFLICT (user_id, club_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_state_admin_access_on_admin_insert ON public.user_state_associations;
CREATE TRIGGER sync_state_admin_access_on_admin_insert
  AFTER INSERT ON public.user_state_associations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_state_admin_club_access_on_admin_change();

DROP TRIGGER IF EXISTS sync_state_admin_access_on_admin_update ON public.user_state_associations;
CREATE TRIGGER sync_state_admin_access_on_admin_update
  AFTER UPDATE OF role ON public.user_state_associations
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.sync_state_admin_club_access_on_admin_change();
