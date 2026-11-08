-- Only the signed-in user can set their own presence (before, any caller could set anyone's).
-- Keeps the (p_user_id, p_is_online) signature so the old Expo app, which passes its own id, keeps working.
CREATE OR REPLACE FUNCTION public.upsert_user_presence(p_user_id uuid, p_is_online boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'You can only set your own presence' USING ERRCODE = '42501';
  END IF;
  INSERT INTO user_presence (user_id, is_online, last_seen_at)
  VALUES (v_uid, p_is_online, now())
  ON CONFLICT (user_id)
  DO UPDATE SET is_online = p_is_online, last_seen_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.upsert_user_presence(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_user_presence(uuid, boolean) TO authenticated;
