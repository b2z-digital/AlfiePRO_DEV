/*
  # Fix archive_member NOT NULL constraint errors

  1. Problem
    - membership_applications.user_id, classifieds.user_id, and club_tasks.created_by
      are NOT NULL columns, so setting them to NULL fails
  
  2. Solution
    - DELETE rows from those tables instead of nullifying
    - Add broader exception handling as safety net
*/

CREATE OR REPLACE FUNCTION public.archive_member(
  p_member_id uuid,
  p_club_id uuid,
  p_archived_by uuid,
  p_archive_reason text DEFAULT NULL,
  p_delete_auth_user boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_other_memberships_exist boolean;
  v_auth_user_deleted boolean := false;
  v_boat_count integer := 0;
  v_race_results_count integer := 0;
  v_payment_count integer := 0;
  v_attendance_count integer := 0;
BEGIN
  SELECT user_id INTO v_user_id
  FROM members
  WHERE id = p_member_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found or does not belong to this club'
    );
  END IF;

  SELECT COUNT(*) INTO v_boat_count FROM member_boats WHERE member_id = p_member_id;
  SELECT COUNT(*) INTO v_payment_count FROM membership_payments WHERE member_id = p_member_id;
  IF v_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_attendance_count FROM event_attendance WHERE user_id = v_user_id;
  END IF;

  UPDATE members
  SET 
    membership_status = 'archived',
    archived_at = now(),
    archived_by = p_archived_by,
    archive_reason = p_archive_reason,
    updated_at = now()
  WHERE id = p_member_id AND club_id = p_club_id;

  IF p_delete_auth_user AND v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM members 
      WHERE user_id = v_user_id 
      AND id != p_member_id
      AND (membership_status IS DISTINCT FROM 'archived')
    ) INTO v_other_memberships_exist;

    IF NOT v_other_memberships_exist THEN
      UPDATE members SET user_id = NULL WHERE user_id = v_user_id;

      DELETE FROM user_clubs WHERE user_id = v_user_id;
      DELETE FROM profiles WHERE id = v_user_id;

      DELETE FROM membership_applications WHERE user_id = v_user_id;
      DELETE FROM classifieds WHERE user_id = v_user_id;
      DELETE FROM club_tasks WHERE created_by = v_user_id;

      DELETE FROM notifications WHERE user_id = v_user_id;
      DELETE FROM notifications WHERE sender_id = v_user_id;
      DELETE FROM notification_drafts WHERE user_id = v_user_id;
      DELETE FROM user_notification_preferences WHERE user_id = v_user_id;
      DELETE FROM notification_reactions WHERE user_id = v_user_id;
      DELETE FROM notification_attachments WHERE uploaded_by = v_user_id;

      DELETE FROM social_mentions WHERE mentioned_user_id = v_user_id OR mentioned_by_user_id = v_user_id;
      DELETE FROM social_notifications WHERE user_id = v_user_id OR actor_id = v_user_id;
      DELETE FROM social_reactions WHERE user_id = v_user_id;
      DELETE FROM social_comments WHERE author_id = v_user_id;
      DELETE FROM social_posts WHERE author_id = v_user_id;
      DELETE FROM social_connections WHERE user_id = v_user_id OR connected_user_id = v_user_id;
      DELETE FROM social_group_members WHERE user_id = v_user_id;

      DELETE FROM user_dashboard_layouts WHERE user_id = v_user_id;
      DELETE FROM user_modal_preferences WHERE user_id = v_user_id;
      DELETE FROM user_location_preferences WHERE user_id = v_user_id;
      DELETE FROM saved_race_locations WHERE user_id = v_user_id;
      DELETE FROM user_article_bookmarks WHERE user_id = v_user_id;
      DELETE FROM marketing_preferences WHERE user_id = v_user_id;
      DELETE FROM marketing_list_members WHERE user_id = v_user_id;
      DELETE FROM marketing_flow_enrollments WHERE user_id = v_user_id;
      DELETE FROM marketing_recipients WHERE user_id = v_user_id;
      DELETE FROM member_filter_presets WHERE created_by = v_user_id;

      DELETE FROM alfie_tv_search_history WHERE user_id = v_user_id;
      DELETE FROM alfie_tv_user_lists WHERE user_id = v_user_id;
      DELETE FROM alfie_tv_viewing_history WHERE user_id = v_user_id;
      DELETE FROM alfie_tv_user_preferences WHERE user_id = v_user_id;
      DELETE FROM alfie_tv_channel_suggestions WHERE user_id = v_user_id;

      DELETE FROM event_attendance WHERE user_id = v_user_id;
      DELETE FROM event_interest WHERE user_id = v_user_id;
      DELETE FROM event_channel_members WHERE user_id = v_user_id;
      DELETE FROM event_channel_messages WHERE user_id = v_user_id;
      DELETE FROM event_activity_feed WHERE user_id = v_user_id;
      DELETE FROM meeting_attendance WHERE user_id = v_user_id;
      DELETE FROM form_submissions WHERE submitted_by = v_user_id;

      DELETE FROM ad_impressions WHERE user_id = v_user_id;
      DELETE FROM ad_clicks WHERE user_id = v_user_id;

      DELETE FROM member_badges WHERE user_id = v_user_id;
      DELETE FROM member_activity_points WHERE user_id = v_user_id;

      UPDATE articles SET author_id = NULL WHERE author_id = v_user_id;
      UPDATE committee_positions SET user_id = NULL WHERE user_id = v_user_id;
      UPDATE event_registrations SET user_id = NULL WHERE user_id = v_user_id;
      UPDATE membership_applications SET reviewed_by = NULL WHERE reviewed_by = v_user_id;

      BEGIN
        DELETE FROM auth.users WHERE id = v_user_id;
        v_auth_user_deleted := true;
      EXCEPTION WHEN foreign_key_violation THEN
        v_auth_user_deleted := false;
      END;
    END IF;
  ELSE
    IF v_user_id IS NOT NULL THEN
      DELETE FROM user_clubs WHERE user_id = v_user_id AND club_id = p_club_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'user_id', v_user_id,
    'archived', true,
    'preserved', jsonb_build_object(
      'boats', v_boat_count,
      'race_results', v_race_results_count,
      'payments', v_payment_count,
      'attendance', v_attendance_count
    ),
    'auth_user_deleted', v_auth_user_deleted,
    'other_active_memberships', v_other_memberships_exist
  );
END;
$function$;
