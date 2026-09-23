/*
# Fix SECURITY DEFINER functions missing search_path

## Security Changes
- Sets search_path = public on all SECURITY DEFINER functions that currently lack it
- This prevents search-path hijacking attacks where an attacker could shadow
  built-in functions like auth.uid() by creating objects in a schema that
  appears earlier in the default search_path

## Affected Functions (47 total)
- Trigger functions: update_conversation_on_new_message, unhide_conversation_on_message,
  sync_profile_avatar_to_members, log_task_activity, create_default_board_lanes,
  trigger_create_default_homepage_slides, update_legal_page_timestamp,
  update_group_member_count, update_post_comment_count, update_post_like_count,
  trigger_push_delivery, trigger_automation_flows, sync_registration_to_attendance,
  create_club_invoice_transaction, create_association_invoice_transaction,
  create_finance_transaction_from_event_registration,
  create_financial_transaction_for_event_payment, update_event_board_columns_updated_at,
  update_event_task_column_data_updated_at, update_event_task_groups_updated_at,
  auto_create_maintenance_reminder, poll_amplify_ssl_status,
  notify_classified_inquiry, notify_direct_message_push, notify_event_channel_message,
  notify_livestream_go_live, notify_membership_renewal, notify_new_news_article,
  notify_new_public_event, notify_race_reminder, notify_rig_shared,
  notify_social_comment, notify_social_reaction, schedule_renewal_notifications,
  send_upcoming_event_reminders, process_grace_period_expirations
- Callable functions: increment_classified_views, increment_event_website_views,
  increment_correction_surfaced, claim_pending_push_notifications,
  match_knowledge_chunks, get_alfie_skipper_context, get_skipper_race_summary,
  is_conversation_participant, upsert_user_presence,
  ensure_association_system_categories, create_system_categories_for_new_association
*/

DO $$ 
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%SECURITY DEFINER%'
      AND NOT (p.proconfig IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public',
      func_record.proname,
      func_record.args
    );
    RAISE NOTICE 'Fixed search_path for: %(%)', func_record.proname, func_record.args;
  END LOOP;
END $$;
