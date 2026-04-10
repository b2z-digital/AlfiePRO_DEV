/*
  # Update Default Renewal Settings for New Clubs

  1. Changes
    - Set `renewal_mode` default to 'fixed' (was 'anniversary')
    - Set `fixed_renewal_date` default to '07-01' (July 1st)
    - Set `renewal_grace_period_days` default to 21 (was 7)
    - `renewal_notification_days` remains at 30 (already correct)

  2. Notes
    - Only affects newly created clubs going forward
    - Existing clubs are NOT modified
*/

ALTER TABLE public.clubs
  ALTER COLUMN renewal_mode SET DEFAULT 'fixed';

ALTER TABLE public.clubs
  ALTER COLUMN fixed_renewal_date SET DEFAULT '07-01';

ALTER TABLE public.clubs
  ALTER COLUMN renewal_grace_period_days SET DEFAULT 21;
