/*
  # Drop global email uniqueness constraint on members table

  1. Changes
    - Drops the `members_email_key` UNIQUE constraint which incorrectly enforces
      email uniqueness across ALL clubs globally
    - The correct per-club constraint `members_club_email_unique_idx` 
      (UNIQUE on club_id + email) already exists and properly handles uniqueness

  2. Why
    - The global constraint prevents the same person from being a member of
      multiple clubs with the same email address
    - Multi-club membership is a supported feature of the platform
    - This was causing CSV import failures when members existed in other clubs
    - The per-club unique index already prevents duplicate emails within a single club

  3. Impact
    - Members can now belong to multiple clubs using the same email
    - CSV imports will no longer fail when importing members who exist in other clubs
    - No data loss - only removing an overly-restrictive constraint
*/

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_email_key;
