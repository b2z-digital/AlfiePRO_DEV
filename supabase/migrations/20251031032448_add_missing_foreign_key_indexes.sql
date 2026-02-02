/*
  # Add Missing Foreign Key Indexes

  1. Performance Optimization
    - Adds indexes to all foreign key columns that are missing them
    - Improves JOIN performance and referential integrity checks
    - Reduces query execution time significantly

  2. Indexes Added (64 total)
    - All foreign key columns without covering indexes
    - Follows naming convention: idx_<table>_<column>
*/

-- boat_images
CREATE INDEX IF NOT EXISTS idx_boat_images_uploaded_by ON boat_images(uploaded_by);

-- boat_performance
CREATE INDEX IF NOT EXISTS idx_boat_performance_rig_used_id ON boat_performance(rig_used_id);

-- budget_categories
CREATE INDEX IF NOT EXISTS idx_budget_categories_tax_rate_id ON budget_categories(tax_rate_id);

-- classified_inquiries
CREATE INDEX IF NOT EXISTS idx_classified_inquiries_sender_id ON classified_inquiries(sender_id);

-- club_setup_applications
CREATE INDEX IF NOT EXISTS idx_club_setup_applications_club_id ON club_setup_applications(club_id);

-- clubs
CREATE INDEX IF NOT EXISTS idx_clubs_created_by_user_id ON clubs(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_default_membership_category_id ON clubs(default_membership_category_id);

-- committee_positions
CREATE INDEX IF NOT EXISTS idx_committee_positions_club_id ON committee_positions(club_id);

-- email_logs
CREATE INDEX IF NOT EXISTS idx_email_logs_club_id ON email_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);

-- event_attendance
CREATE INDEX IF NOT EXISTS idx_event_attendance_user_id ON event_attendance(user_id);

-- invitations
CREATE INDEX IF NOT EXISTS idx_invitations_club_id ON invitations(club_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by);

-- invoice_line_items
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);

-- invoice_notes
CREATE INDEX IF NOT EXISTS idx_invoice_notes_created_by_user_id ON invoice_notes(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON invoice_notes(invoice_id);

-- live_tracking_events
CREATE INDEX IF NOT EXISTS idx_live_tracking_events_club_id ON live_tracking_events(club_id);

-- meeting_agendas
CREATE INDEX IF NOT EXISTS idx_meeting_agendas_meeting_id ON meeting_agendas(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_agendas_owner_id ON meeting_agendas(owner_id);

-- meetings
CREATE INDEX IF NOT EXISTS idx_meetings_chairperson_id ON meetings(chairperson_id);
CREATE INDEX IF NOT EXISTS idx_meetings_club_id ON meetings(club_id);
CREATE INDEX IF NOT EXISTS idx_meetings_minute_taker_id ON meetings(minute_taker_id);

-- member_boats
CREATE INDEX IF NOT EXISTS idx_member_boats_member_id ON member_boats(member_id);

-- member_invitations
CREATE INDEX IF NOT EXISTS idx_member_invitations_invited_by ON member_invitations(invited_by);

-- members
CREATE INDEX IF NOT EXISTS idx_members_archived_by ON members(archived_by);
CREATE INDEX IF NOT EXISTS idx_members_club_id ON members(club_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- membership_applications
CREATE INDEX IF NOT EXISTS idx_membership_applications_member_id ON membership_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_membership_applications_reviewed_by ON membership_applications(reviewed_by);

-- membership_payments
CREATE INDEX IF NOT EXISTS idx_membership_payments_member_id ON membership_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_membership_payments_membership_type_id ON membership_payments(membership_type_id);

-- membership_renewals
CREATE INDEX IF NOT EXISTS idx_membership_renewals_member_id ON membership_renewals(member_id);
CREATE INDEX IF NOT EXISTS idx_membership_renewals_membership_type_id ON membership_renewals(membership_type_id);

-- membership_types
CREATE INDEX IF NOT EXISTS idx_membership_types_club_id ON membership_types(club_id);

-- notice_of_race_templates
CREATE INDEX IF NOT EXISTS idx_notice_of_race_templates_club_id ON notice_of_race_templates(club_id);

-- notification_attachments
CREATE INDEX IF NOT EXISTS idx_notification_attachments_uploaded_by ON notification_attachments(uploaded_by);

-- notification_drafts
CREATE INDEX IF NOT EXISTS idx_notification_drafts_club_id ON notification_drafts(club_id);

-- notification_reactions
CREATE INDEX IF NOT EXISTS idx_notification_reactions_user_id ON notification_reactions(user_id);

-- notification_templates
CREATE INDEX IF NOT EXISTS idx_notification_templates_club_id ON notification_templates(club_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_created_by ON notification_templates(created_by);

-- public_events
CREATE INDEX IF NOT EXISTS idx_public_events_club_id ON public_events(club_id);
CREATE INDEX IF NOT EXISTS idx_public_events_national_approved_by ON public_events(national_approved_by);
CREATE INDEX IF NOT EXISTS idx_public_events_rejected_by ON public_events(rejected_by);
CREATE INDEX IF NOT EXISTS idx_public_events_state_approved_by ON public_events(state_approved_by);

-- quick_races
CREATE INDEX IF NOT EXISTS idx_quick_races_public_event_id ON quick_races(public_event_id);

-- recipient_groups
CREATE INDEX IF NOT EXISTS idx_recipient_groups_club_id ON recipient_groups(club_id);
CREATE INDEX IF NOT EXISTS idx_recipient_groups_created_by ON recipient_groups(created_by);

-- shared_rig_settings
CREATE INDEX IF NOT EXISTS idx_shared_rig_settings_rig_condition_id ON shared_rig_settings(rig_condition_id);
CREATE INDEX IF NOT EXISTS idx_shared_rig_settings_shared_by_member_id ON shared_rig_settings(shared_by_member_id);

-- state_association_applications
CREATE INDEX IF NOT EXISTS idx_state_association_applications_reviewed_by ON state_association_applications(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_state_association_applications_state_association_id ON state_association_applications(state_association_id);

-- state_associations
CREATE INDEX IF NOT EXISTS idx_state_associations_approved_by ON state_associations(approved_by);

-- task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);

-- tax_rates
CREATE INDEX IF NOT EXISTS idx_tax_rates_club_id ON tax_rates(club_id);

-- transaction_line_items
CREATE INDEX IF NOT EXISTS idx_transaction_line_items_category_id ON transaction_line_items(category_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON transactions(invoice_id);

-- user_article_bookmarks
CREATE INDEX IF NOT EXISTS idx_user_article_bookmarks_article_id ON user_article_bookmarks(article_id);

-- user_clubs
CREATE INDEX IF NOT EXISTS idx_user_clubs_club_id ON user_clubs(club_id);

-- user_subscriptions
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);

-- website_activity_log
CREATE INDEX IF NOT EXISTS idx_website_activity_log_user_id ON website_activity_log(user_id);

-- website_pages
CREATE INDEX IF NOT EXISTS idx_website_pages_author_id ON website_pages(author_id);

-- Add comment explaining the optimization
COMMENT ON INDEX idx_boat_images_uploaded_by IS 'Foreign key index for query performance';
