/*
  # Fix check_member_linking_status approval_status filter

  1. Problem
    - The `check_member_linking_status` RPC function only checks for clubs with
      `approval_status IS NULL OR approval_status = 'approved'`
    - All existing clubs have `approval_status = 'active'`
    - This means the function never finds linked clubs, causing new users who match
      existing member records to be sent through the normal onboarding flow instead
      of the "We found your membership" confirmation screen

  2. Fix
    - Update the club status filter in `check_member_linking_status` to also include
      `'active'` as a valid approval status
    - This ensures the function correctly detects linked clubs regardless of whether
      their status is NULL, 'approved', or 'active'
*/

CREATE OR REPLACE FUNCTION public.check_member_linking_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_clubs jsonb;
  v_club_count int;
  v_has_pending_application boolean DEFAULT false;
  v_has_pending_club boolean DEFAULT false;
  v_has_pending_invitation boolean DEFAULT false;
  v_onboarding_completed boolean DEFAULT false;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  SELECT COALESCE(onboarding_completed, false)
  INTO v_onboarding_completed
  FROM profiles
  WHERE id = v_user_id;

  SELECT jsonb_agg(jsonb_build_object(
    'club_id', c.id,
    'club_name', c.name,
    'club_abbreviation', c.abbreviation,
    'role', uc.role,
    'club_logo', c.logo_url
  ))
  INTO v_clubs
  FROM user_clubs uc
  JOIN clubs c ON c.id = uc.club_id
  WHERE uc.user_id = v_user_id
    AND (c.approval_status IS NULL OR c.approval_status IN ('approved', 'active'));

  v_club_count := COALESCE(jsonb_array_length(v_clubs), 0);

  SELECT EXISTS (
    SELECT 1 FROM membership_applications
    WHERE user_id = v_user_id
      AND status = 'pending'
      AND (is_draft IS NULL OR is_draft = false)
  ) INTO v_has_pending_application;

  SELECT EXISTS (
    SELECT 1 FROM clubs
    WHERE registered_by_user_id = v_user_id
      AND approval_status = 'pending_approval'
  ) INTO v_has_pending_club;

  IF v_user_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM member_invitations
      WHERE LOWER(email) = LOWER(v_user_email)
        AND status = 'pending'
        AND expires_at > now()
    ) INTO v_has_pending_invitation;
  END IF;

  IF v_club_count > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'linked',
      'clubs', v_clubs,
      'club_count', v_club_count,
      'has_pending_invitation', v_has_pending_invitation,
      'onboarding_completed', v_onboarding_completed,
      'message', 'Account is linked to ' || v_club_count || ' club(s)'
    );
  END IF;

  IF v_has_pending_application THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending_application',
      'clubs', '[]'::jsonb,
      'club_count', 0,
      'has_pending_invitation', v_has_pending_invitation,
      'onboarding_completed', v_onboarding_completed,
      'message', 'Your membership application is pending approval'
    );
  END IF;

  IF v_has_pending_club THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending_club',
      'clubs', '[]'::jsonb,
      'club_count', 0,
      'has_pending_invitation', v_has_pending_invitation,
      'onboarding_completed', v_onboarding_completed,
      'message', 'Your club registration is pending approval'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'unlinked',
    'clubs', '[]'::jsonb,
    'club_count', 0,
    'has_pending_invitation', v_has_pending_invitation,
    'onboarding_completed', v_onboarding_completed,
    'message', 'No club membership found. Ask your club admin to send you an invitation, or ensure your club has your email address on file.'
  );
END;
$$;