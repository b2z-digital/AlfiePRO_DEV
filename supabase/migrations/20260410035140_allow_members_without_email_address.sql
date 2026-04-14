/*
  # Allow members without email addresses

  1. Problem
    - Some club members (especially older members) don't have an email address
    - The members table requires email as NOT NULL, preventing these members 
      from being imported or manually added
    - The unique constraint on (club_id, email) also complicates null handling

  2. Changes
    - Make the email column nullable on the members table
    - Drop the existing unique constraint on (club_id, email)
    - Create a partial unique index that only enforces uniqueness for non-null, 
      non-empty emails (allows multiple members without email in the same club)
    - Members without email cannot log in or be linked to accounts, but can be 
      managed by admins for membership tracking purposes

  3. Tables Modified
    - `members` - email column made nullable, unique constraint updated

  4. Security
    - No RLS changes needed
    - Members without email cannot authenticate or link to accounts

  5. Important Notes
    - These members are "admin-managed only" - they cannot sign up or log in
    - Admins can still manage their membership, boats, and financial status
    - If a member later gets an email, the admin can update it and the member 
      can then create an account
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE members ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_club_email_unique;

DROP INDEX IF EXISTS members_club_email_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS members_club_email_unique_idx
  ON members (club_id, email)
  WHERE email IS NOT NULL AND TRIM(email) != '';
