/*
  # Add club approval status for self-registration

  1. Modified Tables
    - `clubs`
      - `approval_status` (text, default 'active') - tracks whether a club is active, pending approval, or rejected
      - `registered_by_user_id` (uuid, nullable) - the user who self-registered the club
      - `approval_notes` (text, nullable) - notes from the association admin when approving/rejecting

  2. Security
    - Allow authenticated users to insert clubs with 'pending_approval' status (for self-registration)
    - Association admins can update approval_status

  3. Important Notes
    - Existing clubs default to 'active' status
    - Self-registered clubs start as 'pending_approval'
    - Only association admins can approve/reject clubs
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.clubs ADD COLUMN approval_status text NOT NULL DEFAULT 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'registered_by_user_id'
  ) THEN
    ALTER TABLE public.clubs ADD COLUMN registered_by_user_id uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'approval_notes'
  ) THEN
    ALTER TABLE public.clubs ADD COLUMN approval_notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clubs_approval_status ON public.clubs(approval_status);
CREATE INDEX IF NOT EXISTS idx_clubs_registered_by_user_id ON public.clubs(registered_by_user_id);

CREATE OR REPLACE FUNCTION public.user_can_insert_pending_club(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Authenticated users can self-register clubs'
    AND tablename = 'clubs'
  ) THEN
    CREATE POLICY "Authenticated users can self-register clubs"
      ON public.clubs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        approval_status = 'pending_approval'
        AND registered_by_user_id = auth.uid()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view their own pending clubs'
    AND tablename = 'clubs'
  ) THEN
    CREATE POLICY "Users can view their own pending clubs"
      ON public.clubs
      FOR SELECT
      TO authenticated
      USING (
        registered_by_user_id = auth.uid()
      );
  END IF;
END $$;
