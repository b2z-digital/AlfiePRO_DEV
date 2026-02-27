/*
  # Connection management and group admin policies

  1. Security Changes
    - Allow connection recipients to update connection status (accept/reject)
    - Allow connection recipients to delete connections (reject)
    - Allow club admins to manage groups belonging to their club

  2. Important Notes
    - Recipients need to be able to accept or reject friend requests sent to them
    - Club admins should be able to create, edit and delete groups for their club only
*/

-- Allow the recipient (connected_user_id) to update their connection status (accept/reject)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Recipients can update connection status' AND tablename = 'social_connections'
  ) THEN
    CREATE POLICY "Recipients can update connection status"
      ON public.social_connections
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = connected_user_id)
      WITH CHECK (auth.uid() = connected_user_id);
  END IF;
END $$;

-- Allow the recipient to delete (reject) connection requests sent to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Recipients can delete connection requests' AND tablename = 'social_connections'
  ) THEN
    CREATE POLICY "Recipients can delete connection requests"
      ON public.social_connections
      FOR DELETE
      TO authenticated
      USING (auth.uid() = connected_user_id);
  END IF;
END $$;

-- Allow club admins to create groups for their club
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Club admins can create groups for their club' AND tablename = 'social_groups'
  ) THEN
    CREATE POLICY "Club admins can create groups for their club"
      ON public.social_groups
      FOR INSERT
      TO authenticated
      WITH CHECK (
        club_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.club_id = social_groups.club_id
          AND user_clubs.user_id = auth.uid()
          AND user_clubs.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Allow club admins to update groups belonging to their club
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Club admins can update groups for their club' AND tablename = 'social_groups'
  ) THEN
    CREATE POLICY "Club admins can update groups for their club"
      ON public.social_groups
      FOR UPDATE
      TO authenticated
      USING (
        club_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.club_id = social_groups.club_id
          AND user_clubs.user_id = auth.uid()
          AND user_clubs.role IN ('admin', 'super_admin')
        )
      )
      WITH CHECK (
        club_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.club_id = social_groups.club_id
          AND user_clubs.user_id = auth.uid()
          AND user_clubs.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Allow club admins to delete groups belonging to their club (except the default club group)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Club admins can delete groups for their club' AND tablename = 'social_groups'
  ) THEN
    CREATE POLICY "Club admins can delete groups for their club"
      ON public.social_groups
      FOR DELETE
      TO authenticated
      USING (
        club_id IS NOT NULL AND
        group_type != 'club' AND
        EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_clubs.club_id = social_groups.club_id
          AND user_clubs.user_id = auth.uid()
          AND user_clubs.role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;
