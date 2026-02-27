/*
  # Create member linking status check RPC

  1. New Functions
    - `check_member_linking_status()` - Called by authenticated users (typically from the mobile app)
      to determine their current linking/onboarding state.
      
      Returns a JSON object with:
        - `status`: one of 'linked', 'pending_application', 'pending_club', 'unlinked'
        - `clubs`: array of linked clubs (id, name, role) when status is 'linked'
        - `pending_invitation`: boolean indicating if there's an unused invitation for their email
        - `message`: human-readable explanation of the current state

  2. Purpose
    - Provides a single RPC call for the mobile app to determine whether a newly 
      registered user has been matched to a club membership, has a pending application,
      or needs to take further action.
    - Eliminates the need for multiple client-side queries to piece together linking state.

  3. Security
    - SECURITY DEFINER to access auth.users email
    - Only callable by authenticated users
    - Only returns data relevant to the calling user
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
    AND (c.approval_status IS NULL OR c.approval_status = 'approved');

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

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_member_linking_status() TO authenticated;

COMMENT ON FUNCTION public.check_member_linking_status IS 
'Returns the current member linking status for the authenticated user. Used by the mobile app to determine if the user has been matched to a club membership, has a pending application, or needs to take action.';
