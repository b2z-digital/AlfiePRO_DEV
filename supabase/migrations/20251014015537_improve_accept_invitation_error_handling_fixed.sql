/*
  # Improve accept_invitation Error Handling
  
  The accept_invitation function is failing but we need better error details.
  This migration adds comprehensive error handling and logging to diagnose the issue.
  
  ## Changes
  1. Add exception handling to capture and return specific errors
  2. Add detailed logging for each step
  3. Handle case where member is already linked (by auto-link trigger)
  4. Return success even if member was already linked (idempotent)
*/

CREATE OR REPLACE FUNCTION accept_invitation(
  p_token text,
  p_user_id uuid
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_invitation record;
  v_row_count integer;
BEGIN
  -- Log the attempt
  RAISE LOG 'accept_invitation called: token=%, user_id=%', p_token, p_user_id;

  -- Get the invitation
  SELECT * INTO v_invitation
  FROM member_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  -- Check if invitation exists and is valid
  IF v_invitation.id IS NULL THEN
    RAISE LOG 'accept_invitation failed: invitation not found or expired';
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;

  RAISE LOG 'accept_invitation: valid invitation found, member_id=%, club_id=%', 
    v_invitation.member_id, v_invitation.club_id;

  -- Link user to member if member_id exists
  IF v_invitation.member_id IS NOT NULL THEN
    BEGIN
      -- Try to update the member (allow if not linked OR already linked to same user)
      UPDATE members
      SET user_id = p_user_id,
          updated_at = now()
      WHERE id = v_invitation.member_id
        AND (user_id IS NULL OR user_id = p_user_id);
      
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      
      IF v_row_count > 0 THEN
        RAISE LOG 'accept_invitation: member % linked to user %', v_invitation.member_id, p_user_id;
      ELSE
        -- Check if already linked to same user
        IF EXISTS (
          SELECT 1 FROM members 
          WHERE id = v_invitation.member_id 
          AND user_id = p_user_id
        ) THEN
          RAISE LOG 'accept_invitation: member % already linked to user % (OK)', 
            v_invitation.member_id, p_user_id;
        ELSE
          RAISE LOG 'accept_invitation: member % linked to a different user', v_invitation.member_id;
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Member already linked to a different account'
          );
        END IF;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'accept_invitation: error updating member: % (SQLSTATE %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Failed to link member: %s', SQLERRM)
        );
    END;
  END IF;

  -- Create user_clubs entry
  BEGIN
    INSERT INTO user_clubs (user_id, club_id, role)
    VALUES (p_user_id, v_invitation.club_id, 'member')
    ON CONFLICT (user_id, club_id) DO NOTHING;
    
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    
    IF v_row_count > 0 THEN
      RAISE LOG 'accept_invitation: user_clubs entry created for user % in club %', 
        p_user_id, v_invitation.club_id;
    ELSE
      RAISE LOG 'accept_invitation: user_clubs entry already exists for user % in club %', 
        p_user_id, v_invitation.club_id;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'accept_invitation: error creating user_clubs: % (SQLSTATE %)', SQLERRM, SQLSTATE;
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Failed to create club membership: %s', SQLERRM)
      );
  END;

  -- Mark invitation as accepted
  BEGIN
    UPDATE member_invitations
    SET status = 'accepted',
        used_at = now(),
        updated_at = now()
    WHERE id = v_invitation.id;
    
    RAISE LOG 'accept_invitation: invitation % marked as accepted', v_invitation.id;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'accept_invitation: error updating invitation status: % (SQLSTATE %)', SQLERRM, SQLSTATE;
      -- Don't fail here - the important parts succeeded
  END;

  RAISE LOG 'accept_invitation: SUCCESS for user % in club %', p_user_id, v_invitation.club_id;

  RETURN jsonb_build_object(
    'success', true,
    'club_id', v_invitation.club_id,
    'member_id', v_invitation.member_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'accept_invitation: unexpected error: % (SQLSTATE %)', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Unexpected error: %s', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION accept_invitation IS
'Accepts a member invitation by linking the user to the member record and club. Idempotent - succeeds even if already linked.';
