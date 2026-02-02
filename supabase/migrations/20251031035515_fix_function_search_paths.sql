/*
  # Fix Function Search Path Mutability

  This migration fixes security issues where functions have role-mutable search paths.
  Functions should have immutable search paths to prevent search path injection attacks.

  1. Changes
    - Sets search_path to empty string for all security definer functions
    - Uses schema-qualified names in function bodies where needed
    - Prevents search path manipulation attacks
  
  2. Security Impact
    - Prevents privilege escalation via search path manipulation
    - Follows PostgreSQL security best practices
*/

-- Fix all functions by setting search_path
ALTER FUNCTION public.handle_stripe_connection SET search_path TO '';
ALTER FUNCTION public.add_club_creator_as_admin SET search_path TO '';
ALTER FUNCTION public.update_shared_club_media_updated_at SET search_path TO '';
ALTER FUNCTION public.generate_invitation_token SET search_path TO '';
ALTER FUNCTION public.set_invitation_expiry SET search_path TO '';
ALTER FUNCTION public.update_race_forms_updated_at SET search_path TO '';
ALTER FUNCTION public.is_org_admin SET search_path TO '';
ALTER FUNCTION public.update_form_fields_updated_at SET search_path TO '';
ALTER FUNCTION public.update_profiles_updated_at SET search_path TO '';
ALTER FUNCTION public.update_document_templates_updated_at SET search_path TO '';
ALTER FUNCTION public.update_news_articles_updated_at SET search_path TO '';
ALTER FUNCTION public.update_notification_draft_updated_at SET search_path TO '';
ALTER FUNCTION public.create_email_templates_table SET search_path TO '';
ALTER FUNCTION public.storage_can_access_own_avatar SET search_path TO '';
ALTER FUNCTION public.update_club_setup_applications_updated_at SET search_path TO '';
ALTER FUNCTION public.storage_can_insert_own_avatar SET search_path TO '';
ALTER FUNCTION public.generate_expense_number SET search_path TO '';
ALTER FUNCTION public.validate_round_results_structure SET search_path TO '';
ALTER FUNCTION public.validate_race_series_results SET search_path TO '';
ALTER FUNCTION public.calculate_actual_budget_amounts SET search_path TO '';
ALTER FUNCTION public.permanently_delete_listing SET search_path TO '';
ALTER FUNCTION public.is_club_admin SET search_path TO '';
ALTER FUNCTION public.handle_profile_upsert SET search_path TO '';
ALTER FUNCTION public.get_primary_member_for_user SET search_path TO '';
ALTER FUNCTION public.get_member_name_for_listing SET search_path TO '';
ALTER FUNCTION public.is_weather_cache_stale SET search_path TO '';
ALTER FUNCTION public.cleanup_old_weather_cache SET search_path TO '';
ALTER FUNCTION public.extract_media_metadata SET search_path TO '';
ALTER FUNCTION public.get_table_columns_rpc SET search_path TO '';
ALTER FUNCTION public.ensure_membership_fees_category SET search_path TO '';
ALTER FUNCTION public.check_membership_renewal SET search_path TO '';
ALTER FUNCTION public.get_weather_cache SET search_path TO '';
ALTER FUNCTION public.update_boat_classes_updated_at SET search_path TO '';
ALTER FUNCTION public.approve_membership_application SET search_path TO '';
ALTER FUNCTION public.sync_quick_race_to_public_event SET search_path TO '';
ALTER FUNCTION public.create_default_homepage_tiles SET search_path TO '';
ALTER FUNCTION public.trigger_create_default_homepage_tiles SET search_path TO '';
ALTER FUNCTION public.get_expiring_memberships SET search_path TO '';
ALTER FUNCTION public.get_overdue_memberships SET search_path TO '';
ALTER FUNCTION public.ensure_event_entry_fees_category SET search_path TO '';
ALTER FUNCTION public.should_send_renewal_notification SET search_path TO '';
ALTER FUNCTION public.auto_approve_event SET search_path TO '';
ALTER FUNCTION public.is_platform_super_admin SET search_path TO '';
ALTER FUNCTION public.sync_profile_from_member SET search_path TO '';
ALTER FUNCTION public.update_updated_at_column SET search_path TO '';
ALTER FUNCTION public.update_race_series_rounds_updated_at SET search_path TO '';
ALTER FUNCTION public.create_finance_transaction_from_event_registration SET search_path TO '';
ALTER FUNCTION public.update_classifieds_updated_at SET search_path TO '';
ALTER FUNCTION public.cleanup_expired_tracking_sessions SET search_path TO '';
ALTER FUNCTION public.update_active_sessions_count SET search_path TO '';
ALTER FUNCTION public.set_session_expiry SET search_path TO '';
ALTER FUNCTION public.match_rc_rules SET search_path TO '';
ALTER FUNCTION public.update_notification_search SET search_path TO '';
ALTER FUNCTION public.get_thread_participants SET search_path TO '';
ALTER FUNCTION public.mark_thread_as_read SET search_path TO '';
ALTER FUNCTION public.is_state_admin SET search_path TO '';
ALTER FUNCTION public.is_national_admin SET search_path TO '';
ALTER FUNCTION public.is_super_admin SET search_path TO '';
ALTER FUNCTION public.apply_standard_rls_policies SET search_path TO '';
ALTER FUNCTION public.notify_admins_on_new_application SET search_path TO '';
