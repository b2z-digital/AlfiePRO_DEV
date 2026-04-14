/*
  # Sync avatar across cross-club members

  1. Problem
    - Members who belong to multiple clubs have separate member records per club
    - When an avatar is updated on one record, the other club records don't get it
    - The existing profile-to-members trigger only works for members with user accounts

  2. Solution
    - Create a trigger that syncs avatar_url to all member records sharing the same
      email address when any one of them is updated
    - This handles both members with and without user accounts

  3. Backfill
    - Copy existing avatars to cross-club members who are missing them
*/

CREATE OR REPLACE FUNCTION public.sync_avatar_across_clubs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url) AND NEW.email IS NOT NULL AND NEW.email != '' THEN
    UPDATE public.members
    SET avatar_url = NEW.avatar_url, updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND id != NEW.id
      AND (avatar_url IS DISTINCT FROM NEW.avatar_url);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_avatar_across_clubs ON public.members;
CREATE TRIGGER trigger_sync_avatar_across_clubs
  AFTER UPDATE OF avatar_url ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_avatar_across_clubs();

UPDATE public.members dst
SET avatar_url = src.avatar_url, updated_at = now()
FROM (
  SELECT LOWER(email) as email_lower, MAX(avatar_url) as avatar_url
  FROM public.members
  WHERE avatar_url IS NOT NULL AND email IS NOT NULL AND email != ''
    AND membership_status != 'archived'
  GROUP BY LOWER(email)
) src
WHERE LOWER(dst.email) = src.email_lower
  AND (dst.avatar_url IS NULL OR dst.avatar_url = '')
  AND dst.membership_status != 'archived';
