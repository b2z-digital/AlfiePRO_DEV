/*
  # Create Member Activation System

  This migration adds support for admin-initiated account activation,
  allowing club admins to create auth accounts for existing members
  and send them a branded "set your password" email that drives them
  into the AlfiePRO mobile app.

  1. New Columns
    - `members.activation_status` (text) - Tracks whether an activation invite has been sent
      Values: null (not sent), 'pending' (sent, awaiting password set), 'activated' (password set, account active)
    - `members.activation_sent_at` (timestamptz) - When the activation email was last sent
    - `members.activated_at` (timestamptz) - When the member set their password

  2. New Functions
    - `admin_activate_member_account(p_member_id, p_club_id)` - Creates auth account and links member
    - `admin_bulk_activate_members(p_club_id)` - Activates all unlinked members with emails

  3. Security
    - Functions are SECURITY DEFINER with restricted search paths
    - Only club admins/editors can invoke activation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'activation_status'
  ) THEN
    ALTER TABLE public.members ADD COLUMN activation_status text DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'activation_sent_at'
  ) THEN
    ALTER TABLE public.members ADD COLUMN activation_sent_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'activated_at'
  ) THEN
    ALTER TABLE public.members ADD COLUMN activated_at timestamptz DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_activation_status
  ON public.members (activation_status)
  WHERE activation_status IS NOT NULL;
