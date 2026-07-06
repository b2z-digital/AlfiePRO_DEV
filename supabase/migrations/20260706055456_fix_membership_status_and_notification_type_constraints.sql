-- Fix 1: Allow 'expired' as a valid membership_status value
-- The process_grace_period_expirations() cron function needs to set members to 'expired'
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_membership_status_check;
ALTER TABLE members ADD CONSTRAINT members_membership_status_check
  CHECK (membership_status = ANY (ARRAY['active'::text, 'archived'::text, 'expired'::text]));

-- Fix 2: Allow 'renewal_due' and 'grace_expiry' as valid notification types
-- The schedule_renewal_notifications() function uses these values
ALTER TABLE membership_renewal_notifications DROP CONSTRAINT IF EXISTS membership_renewal_notifications_notification_type_check;
ALTER TABLE membership_renewal_notifications ADD CONSTRAINT membership_renewal_notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY['30_days'::text, '14_days'::text, '7_days'::text, '1_day'::text, 'expired'::text, 'custom'::text, 'renewal_due'::text, 'grace_expiry'::text]));
