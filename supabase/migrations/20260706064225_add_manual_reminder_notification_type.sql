ALTER TABLE membership_renewal_notifications
DROP CONSTRAINT membership_renewal_notifications_notification_type_check;

ALTER TABLE membership_renewal_notifications
ADD CONSTRAINT membership_renewal_notifications_notification_type_check
CHECK (notification_type = ANY (ARRAY['30_days'::text, '14_days'::text, '7_days'::text, '1_day'::text, 'expired'::text, 'custom'::text, 'renewal_due'::text, 'grace_expiry'::text, 'manual_reminder'::text]));