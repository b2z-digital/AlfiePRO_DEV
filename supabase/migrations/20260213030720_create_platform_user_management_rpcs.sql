/*
  # Platform User Management RPC Functions

  1. New Functions
    - `get_all_club_users_for_super_admin()` - Returns all club user assignments with profile and club info
    - `get_all_association_users_for_super_admin()` - Returns all state and national association user assignments
    - `update_user_org_role_for_super_admin(target_table, record_id, new_role)` - Updates a user's role in an org
    - `remove_user_from_org_for_super_admin(target_table, record_id)` - Removes a user from an org
    - `add_user_to_org_for_super_admin(user_email, org_type, org_id, user_role)` - Adds a user to an org

  2. Security
    - All functions use SECURITY DEFINER to bypass RLS
    - All functions check `is_platform_super_admin()` before executing
    - Strict search_path set to public
*/

CREATE OR REPLACE FUNCTION public.get_all_club_users_for_super_admin()
RETURNS TABLE(
  record_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  club_id uuid,
  club_name text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  RETURN QUERY
  SELECT
    uc.id as record_id,
    uc.user_id,
    COALESCE(au.email, '')::text as email,
    COALESCE(p.full_name, '')::text as full_name,
    uc.role::text as role,
    c.id as club_id,
    COALESCE(c.name, 'Unknown Club')::text as club_name,
    uc.created_at
  FROM user_clubs uc
  LEFT JOIN auth.users au ON au.id = uc.user_id
  LEFT JOIN profiles p ON p.id = uc.user_id
  LEFT JOIN clubs c ON c.id = uc.club_id
  ORDER BY c.name, uc.role, p.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_association_users_for_super_admin()
RETURNS TABLE(
  record_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  org_id uuid,
  org_name text,
  org_type text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  RETURN QUERY
  SELECT
    usa.id as record_id,
    usa.user_id,
    COALESCE(au.email, '')::text as email,
    COALESCE(p.full_name, '')::text as full_name,
    usa.role::text as role,
    sa.id as org_id,
    COALESCE(sa.name, 'Unknown')::text as org_name,
    'state'::text as org_type,
    usa.created_at
  FROM user_state_associations usa
  LEFT JOIN auth.users au ON au.id = usa.user_id
  LEFT JOIN profiles p ON p.id = usa.user_id
  LEFT JOIN state_associations sa ON sa.id = usa.state_association_id
  
  UNION ALL
  
  SELECT
    una.id as record_id,
    una.user_id,
    COALESCE(au2.email, '')::text as email,
    COALESCE(p2.full_name, '')::text as full_name,
    una.role::text as role,
    na.id as org_id,
    COALESCE(na.name, 'Unknown')::text as org_name,
    'national'::text as org_type,
    una.created_at
  FROM user_national_associations una
  LEFT JOIN auth.users au2 ON au2.id = una.user_id
  LEFT JOIN profiles p2 ON p2.id = una.user_id
  LEFT JOIN national_associations na ON na.id = una.national_association_id
  
  ORDER BY org_type DESC, org_name, role, full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_org_role_for_super_admin(
  p_target_table text,
  p_record_id uuid,
  p_new_role text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  IF p_target_table = 'user_clubs' THEN
    UPDATE user_clubs SET role = p_new_role::club_role WHERE id = p_record_id;
  ELSIF p_target_table = 'user_state_associations' THEN
    UPDATE user_state_associations SET role = p_new_role WHERE id = p_record_id;
  ELSIF p_target_table = 'user_national_associations' THEN
    UPDATE user_national_associations SET role = p_new_role WHERE id = p_record_id;
  ELSE
    RAISE EXCEPTION 'Invalid table: %', p_target_table;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_user_from_org_for_super_admin(
  p_target_table text,
  p_record_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  IF p_target_table = 'user_clubs' THEN
    DELETE FROM user_clubs WHERE id = p_record_id;
  ELSIF p_target_table = 'user_state_associations' THEN
    DELETE FROM user_state_associations WHERE id = p_record_id;
  ELSIF p_target_table = 'user_national_associations' THEN
    DELETE FROM user_national_associations WHERE id = p_record_id;
  ELSE
    RAISE EXCEPTION 'Invalid table: %', p_target_table;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_user_to_org_for_super_admin(
  p_user_email text,
  p_org_type text,
  p_org_id uuid,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_record_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_user_email;
  END IF;

  IF p_org_type = 'club' THEN
    INSERT INTO user_clubs (user_id, club_id, role)
    VALUES (v_user_id, p_org_id, p_role::club_role)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_record_id;
  ELSIF p_org_type = 'state' THEN
    INSERT INTO user_state_associations (user_id, state_association_id, role)
    VALUES (v_user_id, p_org_id, p_role)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_record_id;
  ELSIF p_org_type = 'national' THEN
    INSERT INTO user_national_associations (user_id, national_association_id, role)
    VALUES (v_user_id, p_org_id, p_role)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_record_id;
  ELSE
    RAISE EXCEPTION 'Invalid org type: %', p_org_type;
  END IF;

  RETURN v_record_id;
END;
$$;
