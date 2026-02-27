/*
  # Enhance Platform User Management RPCs v2
  
  1. Modified Functions
    - `get_all_club_users_for_super_admin()` - Now includes avatar_url
    - `get_all_association_users_for_super_admin()` - Now includes avatar_url
  
  2. New Functions
    - `search_platform_users_for_super_admin(search_term)` - Search all platform users for quick-find add user flow
  
  3. Security
    - All functions use SECURITY DEFINER
    - All functions check is_platform_super_admin()
*/

DROP FUNCTION IF EXISTS public.get_all_club_users_for_super_admin();
DROP FUNCTION IF EXISTS public.get_all_association_users_for_super_admin();

CREATE FUNCTION public.get_all_club_users_for_super_admin()
RETURNS TABLE(
  record_id uuid,
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
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
    COALESCE(p.avatar_url, '')::text as avatar_url,
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

CREATE FUNCTION public.get_all_association_users_for_super_admin()
RETURNS TABLE(
  record_id uuid,
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
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
    COALESCE(p.avatar_url, '')::text as avatar_url,
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
    COALESCE(p2.avatar_url, '')::text as avatar_url,
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

CREATE OR REPLACE FUNCTION public.search_platform_users_for_super_admin(
  p_search_term text DEFAULT ''
)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  avatar_url text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Access denied: not a platform super admin';
  END IF;

  RETURN QUERY
  SELECT
    au.id as user_id,
    au.email::text as email,
    COALESCE(p.full_name, '')::text as full_name,
    COALESCE(p.avatar_url, '')::text as avatar_url
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE
    p_search_term = '' OR
    au.email ILIKE '%' || p_search_term || '%' OR
    p.full_name ILIKE '%' || p_search_term || '%'
  ORDER BY COALESCE(p.full_name, au.email::text)
  LIMIT 50;
END;
$$;
