/*
  # Drop Unused Indexes

  This migration removes unused indexes that are consuming storage and maintenance overhead
  without providing any query performance benefit.

  1. Changes
    - Drops 145+ unused indexes across various tables
    - Reduces database storage usage
    - Reduces maintenance overhead during writes
    - Improves write performance
  
  2. Security Impact
    - Reduces attack surface by removing unnecessary database objects
    - Improves database performance
*/

-- Event Registration & Payment indexes
DROP INDEX IF EXISTS idx_event_registrations_event_id;
DROP INDEX IF EXISTS idx_event_registrations_club_id;
DROP INDEX IF EXISTS idx_event_registrations_status;
DROP INDEX IF EXISTS idx_event_registrations_payment_status;
DROP INDEX IF EXISTS idx_event_registrations_guest_email;
DROP INDEX IF EXISTS idx_event_payment_transactions_registration_id;
DROP INDEX IF EXISTS idx_event_payment_transactions_club_id;
DROP INDEX IF EXISTS idx_event_payment_transactions_payment_status;

-- Garage & Rig Management indexes
DROP INDEX IF EXISTS idx_rig_conditions_conditions;
DROP INDEX IF EXISTS idx_shared_rig_settings_status;
DROP INDEX IF EXISTS idx_shared_rig_settings_rig_condition_id;
DROP INDEX IF EXISTS idx_shared_rig_settings_shared_by_member_id;
DROP INDEX IF EXISTS idx_boat_images_uploaded_by;
DROP INDEX IF EXISTS idx_boat_performance_rig_used_id;
DROP INDEX IF EXISTS idx_maintenance_logs_performed_date;
DROP INDEX IF EXISTS idx_boat_performance_race_date;
DROP INDEX IF EXISTS idx_rig_settings_likes_shared_setting_id;
DROP INDEX IF EXISTS idx_rig_settings_likes_member_id;
DROP INDEX IF EXISTS idx_wind_conditions_boat;
DROP INDEX IF EXISTS idx_rig_presets_boat;
DROP INDEX IF EXISTS idx_rig_presets_active;
DROP INDEX IF EXISTS idx_rig_settings_preset;
DROP INDEX IF EXISTS idx_rig_settings_condition;
DROP INDEX IF EXISTS idx_member_boats_hull_reg_number;

-- Classifieds indexes
DROP INDEX IF EXISTS idx_classifieds_category;
DROP INDEX IF EXISTS idx_classifieds_club_id;
DROP INDEX IF EXISTS idx_classifieds_boat_class;
DROP INDEX IF EXISTS idx_classified_inquiries_sender_id;

-- Articles & News indexes
DROP INDEX IF EXISTS idx_articles_author_id;
DROP INDEX IF EXISTS idx_articles_state_association;
DROP INDEX IF EXISTS idx_articles_national_association;
DROP INDEX IF EXISTS idx_user_article_bookmarks_article_id;

-- Email & Notifications indexes
DROP INDEX IF EXISTS idx_email_templates_template_key;
DROP INDEX IF EXISTS idx_email_logs_club_id;
DROP INDEX IF EXISTS idx_email_logs_user_id;
DROP INDEX IF EXISTS idx_notifications_sent_at;
DROP INDEX IF EXISTS idx_notifications_thread;
DROP INDEX IF EXISTS idx_notifications_status;
DROP INDEX IF EXISTS idx_notifications_scheduled;
DROP INDEX IF EXISTS idx_notifications_starred;
DROP INDEX IF EXISTS idx_notifications_archived;
DROP INDEX IF EXISTS idx_notifications_search;
DROP INDEX IF EXISTS idx_notifications_labels;
DROP INDEX IF EXISTS idx_notifications_mentions;
DROP INDEX IF EXISTS idx_notification_attachments_uploaded_by;
DROP INDEX IF EXISTS idx_notification_drafts_club_id;
DROP INDEX IF EXISTS idx_notification_reactions_user_id;
DROP INDEX IF EXISTS idx_notification_drafts_updated;
DROP INDEX IF EXISTS idx_notification_templates_club_id;
DROP INDEX IF EXISTS idx_notification_templates_created_by;

-- Finance indexes
DROP INDEX IF EXISTS idx_budget_entries_year_month;
DROP INDEX IF EXISTS idx_budget_categories_tax_rate_id;
DROP INDEX IF EXISTS idx_invoice_line_items_invoice_id;
DROP INDEX IF EXISTS idx_invoice_notes_created_by_user_id;
DROP INDEX IF EXISTS idx_invoice_notes_invoice_id;
DROP INDEX IF EXISTS idx_tax_rates_club_id;
DROP INDEX IF EXISTS idx_transaction_line_items_category_id;
DROP INDEX IF EXISTS idx_transactions_category_id;
DROP INDEX IF EXISTS idx_transactions_payment_gateway;
DROP INDEX IF EXISTS idx_transactions_gateway_transaction_id;
DROP INDEX IF EXISTS idx_transactions_linked_entity;
DROP INDEX IF EXISTS idx_transactions_invoice_id;
DROP INDEX IF EXISTS idx_membership_transactions_club_id;
DROP INDEX IF EXISTS idx_membership_transactions_member_id;

-- Media indexes
DROP INDEX IF EXISTS idx_event_media_race_class;
DROP INDEX IF EXISTS idx_event_media_event_name;
DROP INDEX IF EXISTS idx_shared_club_media_sharing_club_id;

-- Live Tracking indexes
DROP INDEX IF EXISTS idx_live_tracking_sessions_member;
DROP INDEX IF EXISTS idx_live_tracking_sessions_device;
DROP INDEX IF EXISTS idx_session_skipper_tracking_sail;
DROP INDEX IF EXISTS idx_skipper_notifications_sent_at;
DROP INDEX IF EXISTS idx_skipper_notifications_type;
DROP INDEX IF EXISTS idx_live_tracking_events_club_id;

-- Member Management indexes
DROP INDEX IF EXISTS idx_member_invitations_status;
DROP INDEX IF EXISTS idx_member_invitations_invited_by;
DROP INDEX IF EXISTS idx_members_archived_by;
DROP INDEX IF EXISTS idx_members_archived_at;
DROP INDEX IF EXISTS profiles_email_idx;
DROP INDEX IF EXISTS idx_profiles_super_admin;
DROP INDEX IF EXISTS idx_profiles_default_club_id;

-- Event & Attendance indexes
DROP INDEX IF EXISTS idx_event_attendance_club_id;
DROP INDEX IF EXISTS idx_event_attendance_user_id;
DROP INDEX IF EXISTS idx_event_interest_event_id;
DROP INDEX IF EXISTS idx_event_interest_club_id;

-- Committee & Positions indexes
DROP INDEX IF EXISTS idx_committee_positions_club_id;
DROP INDEX IF EXISTS idx_committee_positions_member_id;

-- Club Setup indexes
DROP INDEX IF EXISTS idx_club_setup_applications_club_id;
DROP INDEX IF EXISTS idx_club_setup_applications_is_draft;
DROP INDEX IF EXISTS idx_clubs_created_by_user_id;
DROP INDEX IF EXISTS idx_club_requests_status;
DROP INDEX IF EXISTS idx_club_requests_created_at;

-- Invitations indexes
DROP INDEX IF EXISTS idx_invitations_club_id;
DROP INDEX IF EXISTS idx_invitations_invited_by;

-- Meeting indexes
DROP INDEX IF EXISTS idx_meeting_agendas_meeting_id;
DROP INDEX IF EXISTS idx_meeting_agendas_owner_id;
DROP INDEX IF EXISTS idx_meetings_chairperson_id;
DROP INDEX IF EXISTS idx_meetings_minute_taker_id;

-- Membership indexes
DROP INDEX IF EXISTS idx_membership_applications_member_id;
DROP INDEX IF EXISTS idx_membership_applications_reviewed_by;
DROP INDEX IF EXISTS idx_membership_applications_membership_type;
DROP INDEX IF EXISTS idx_membership_payments_member_id;
DROP INDEX IF EXISTS idx_membership_payments_membership_type_id;
DROP INDEX IF EXISTS idx_membership_renewals_member_id;
DROP INDEX IF EXISTS idx_membership_renewals_membership_type_id;
DROP INDEX IF EXISTS idx_membership_types_club_id;
DROP INDEX IF EXISTS idx_renewal_notifications_member;
DROP INDEX IF EXISTS idx_renewal_notifications_club;
DROP INDEX IF EXISTS idx_renewal_notifications_type;
DROP INDEX IF EXISTS idx_renewal_notifications_date;

-- Document Templates indexes
DROP INDEX IF EXISTS idx_notice_of_race_templates_club_id;

-- Public Events indexes
DROP INDEX IF EXISTS idx_public_events_club_id;
DROP INDEX IF EXISTS idx_public_events_national_approved_by;
DROP INDEX IF EXISTS idx_public_events_rejected_by;
DROP INDEX IF EXISTS idx_public_events_state_approved_by;
DROP INDEX IF EXISTS idx_quick_races_public_event_id;

-- Recipient Groups indexes
DROP INDEX IF EXISTS idx_recipient_group_members_group;
DROP INDEX IF EXISTS idx_recipient_group_members_member;
DROP INDEX IF EXISTS idx_recipient_groups_club_id;
DROP INDEX IF EXISTS idx_recipient_groups_created_by;

-- State & National Association indexes
DROP INDEX IF EXISTS idx_state_association_applications_reviewed_by;
DROP INDEX IF EXISTS idx_state_association_applications_state_association_id;
DROP INDEX IF EXISTS idx_state_association_applications_user;
DROP INDEX IF EXISTS idx_state_association_applications_national;
DROP INDEX IF EXISTS idx_state_association_applications_status;
DROP INDEX IF EXISTS idx_state_associations_approved_by;
DROP INDEX IF EXISTS idx_state_associations_state;
DROP INDEX IF EXISTS idx_state_associations_subscription;
DROP INDEX IF EXISTS idx_state_associations_national;
DROP INDEX IF EXISTS idx_state_associations_status;
DROP INDEX IF EXISTS idx_national_associations_subscription;
DROP INDEX IF EXISTS idx_state_association_clubs_club;
DROP INDEX IF EXISTS idx_state_association_clubs_active;

-- Task Management indexes
DROP INDEX IF EXISTS idx_task_comments_task_id;
DROP INDEX IF EXISTS idx_task_comments_user_id;

-- User Management indexes
DROP INDEX IF EXISTS idx_user_subscriptions_user_id;
DROP INDEX IF EXISTS idx_user_subscriptions_club_id;
DROP INDEX IF EXISTS idx_user_subscriptions_trial_end;
DROP INDEX IF EXISTS idx_user_clubs_role;

-- Website indexes
DROP INDEX IF EXISTS idx_website_activity_log_created_at;
DROP INDEX IF EXISTS idx_website_activity_log_user_id;
DROP INDEX IF EXISTS idx_website_analytics_created_at;
DROP INDEX IF EXISTS idx_website_analytics_visitor;
DROP INDEX IF EXISTS idx_website_pages_author_id;
DROP INDEX IF EXISTS idx_website_pages_club_id;
DROP INDEX IF EXISTS idx_website_pages_status;

-- Weather indexes
DROP INDEX IF EXISTS idx_weather_cache_last_updated;
DROP INDEX IF EXISTS idx_weather_cache_coordinates;

-- Boat Classes indexes
DROP INDEX IF EXISTS idx_club_boat_classes_boat_class_id;

-- Homepage indexes
DROP INDEX IF EXISTS idx_homepage_slides_display_order;
DROP INDEX IF EXISTS idx_homepage_tiles_display_order;
