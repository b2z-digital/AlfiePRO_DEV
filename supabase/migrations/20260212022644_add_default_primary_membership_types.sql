/*
  # Add Default Primary Membership Types to Existing Clubs

  1. Purpose
    - Ensures all clubs have at least one Full/Primary membership type
    - Required for smart member application system to work correctly
    - Backfills data for clubs created before this requirement was enforced

  2. Changes
    - Adds a default "Full Member" type to any club without a primary membership type
    - Sets amount to 0 (clubs can update this later)
    - Marks as Full/Primary (requires_association_fees = true)

  3. Safety
    - Only adds to clubs that don't have ANY primary membership types
    - Uses idempotent logic to prevent duplicates
    - Preserves all existing membership types
*/

-- Add default Full Member type to clubs without any primary membership types
INSERT INTO public.membership_types (
  club_id,
  name,
  description,
  amount,
  currency,
  renewal_period,
  is_active,
  requires_association_fees
)
SELECT
  c.id as club_id,
  'Full Member' as name,
  'Primary membership with full club access and association fees' as description,
  0 as amount,
  'AUD' as currency,
  'annual' as renewal_period,
  true as is_active,
  true as requires_association_fees
FROM public.clubs c
WHERE NOT EXISTS (
  -- Only add if the club has NO primary membership types
  SELECT 1
  FROM public.membership_types mt
  WHERE mt.club_id = c.id
  AND mt.requires_association_fees = true
);
