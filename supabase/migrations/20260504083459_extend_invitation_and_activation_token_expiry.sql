/*
  # Extend invitation and activation token expiry

  1. Changes
    - Updates all pending member_invitations to expire 30 days from creation (instead of 7)
    - Resets recently expired invitations (expired within last 30 days) back to pending with 30-day expiry from now
    - Updates all unused member_activation_tokens to expire 30 days from creation (instead of 7)
    - Resets recently expired activation tokens back to active with 30-day expiry from now
    - Updates the default expiry in the member_invitations table to 30 days

  2. Important Notes
    - This addresses reports from NSW State Association admins that invitation links stopped working
    - The previous 7-day expiry was too short for clubs sending bulk invitations
    - No data is deleted - only expiry dates are extended
*/

-- Extend currently pending invitations to 30 days from their creation date
UPDATE member_invitations
SET expires_at = created_at + interval '30 days'
WHERE status = 'pending'
  AND expires_at > now();

-- Reset recently expired invitations (expired within last 30 days) back to pending
UPDATE member_invitations
SET status = 'pending',
    expires_at = now() + interval '30 days'
WHERE status = 'expired'
  AND expires_at > now() - interval '30 days';

-- Also reset pending invitations that just expired (still marked pending but past expiry)
UPDATE member_invitations
SET expires_at = now() + interval '30 days'
WHERE status = 'pending'
  AND expires_at <= now()
  AND expires_at > now() - interval '30 days';

-- Extend unused activation tokens to 30 days from creation
UPDATE member_activation_tokens
SET expires_at = created_at + interval '30 days'
WHERE used_at IS NULL
  AND expires_at > now();

-- Reset recently expired activation tokens
UPDATE member_activation_tokens
SET expires_at = now() + interval '30 days'
WHERE used_at IS NULL
  AND expires_at <= now()
  AND expires_at > now() - interval '30 days';

-- Update the default column value for future invitations
ALTER TABLE member_invitations
ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');
