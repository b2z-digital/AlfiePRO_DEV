/*
  # Add Event Approval System

  1. Schema Changes
    - Add approval status and tracking columns to public_events
    - Add created_by_type to track which organization type created the event
    - Add approval timestamps and user references
    - Add state_association_id and national_association_id references

  2. Approval Status Values
    - 'pending': Event created, awaiting approval
    - 'approved_national': National association approved (if applicable)
    - 'approved_state': State association approved (if applicable)
    - 'approved': Fully approved and published
    - 'rejected': Approval rejected
    - 'draft': Saved but not submitted for approval

  3. Approval Flow
    - Club creates National event -> needs National approval -> needs State approval -> approved
    - Club creates State event -> needs State approval -> approved
    - State creates State event -> auto-approved
    - National creates National event -> auto-approved

  4. Security
    - Update RLS policies to handle approval workflow
    - Only show approved events to public
    - Show pending events to appropriate admins
*/

-- Add approval columns to public_events table
DO $$
BEGIN
  -- Add approval_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN approval_status TEXT DEFAULT 'draft' NOT NULL;

    ALTER TABLE public.public_events
    ADD CONSTRAINT public_events_approval_status_check
    CHECK (approval_status IN ('draft', 'pending', 'approved_national', 'approved_state', 'approved', 'rejected'));
  END IF;

  -- Add created_by_type column (tracks if created by club, state, or national)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'created_by_type'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN created_by_type TEXT DEFAULT 'club';

    ALTER TABLE public.public_events
    ADD CONSTRAINT public_events_created_by_type_check
    CHECK (created_by_type IN ('club', 'state', 'national'));
  END IF;

  -- Add created_by_id column (UUID of club/state/national association)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'created_by_id'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN created_by_id UUID;
  END IF;

  -- Add state_association_id reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'state_association_id'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN state_association_id UUID REFERENCES public.state_associations(id) ON DELETE SET NULL;
  END IF;

  -- Add national_association_id reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'national_association_id'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN national_association_id UUID REFERENCES public.national_associations(id) ON DELETE SET NULL;
  END IF;

  -- Add national_approved_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'national_approved_at'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN national_approved_at TIMESTAMPTZ;
  END IF;

  -- Add national_approved_by user reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'national_approved_by'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN national_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- Add state_approved_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'state_approved_at'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN state_approved_at TIMESTAMPTZ;
  END IF;

  -- Add state_approved_by user reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'state_approved_by'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN state_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- Add rejection_reason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN rejection_reason TEXT;
  END IF;

  -- Add rejected_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;

  -- Add rejected_by user reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_public_events_approval_status
ON public.public_events(approval_status);

CREATE INDEX IF NOT EXISTS idx_public_events_created_by
ON public.public_events(created_by_type, created_by_id);

CREATE INDEX IF NOT EXISTS idx_public_events_state_association
ON public.public_events(state_association_id);

CREATE INDEX IF NOT EXISTS idx_public_events_national_association
ON public.public_events(national_association_id);

-- Create function to auto-approve events based on creator
CREATE OR REPLACE FUNCTION auto_approve_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If event is created by state association and is a state event
  IF NEW.created_by_type = 'state' AND NEW.event_level = 'state' THEN
    NEW.approval_status := 'approved';
    NEW.state_approved_at := NOW();
    NEW.state_approved_by := auth.uid();
  END IF;

  -- If event is created by national association and is a national event
  IF NEW.created_by_type = 'national' AND NEW.event_level = 'national' THEN
    NEW.approval_status := 'approved';
    NEW.national_approved_at := NOW();
    NEW.national_approved_by := auth.uid();
    NEW.state_approved_at := NOW();
    NEW.state_approved_by := auth.uid();
  END IF;

  -- If event is a club-level event, auto-approve it
  IF NEW.event_level = 'club' THEN
    NEW.approval_status := 'approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-approval
DROP TRIGGER IF EXISTS auto_approve_event_trigger ON public.public_events;
CREATE TRIGGER auto_approve_event_trigger
  BEFORE INSERT ON public.public_events
  FOR EACH ROW
  EXECUTE FUNCTION auto_approve_event();

-- Update existing events to be approved
UPDATE public.public_events
SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status = 'draft';

-- Drop existing RLS policies that might conflict
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.public_events;
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.public_events;

-- Create new RLS policies for approval workflow

-- Public can only view approved events
CREATE POLICY "Public can view approved events"
  ON public.public_events FOR SELECT
  USING (approval_status = 'approved');

-- Authenticated users can view their own events (any status)
CREATE POLICY "Users can view their club events"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM public.user_clubs WHERE user_id = auth.uid()
    )
  );

-- State admins can view events pending their approval
CREATE POLICY "State admins can view events needing state approval"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
      AND usa.state_association_id = public.public_events.state_association_id
    )
  );

-- National admins can view events pending their approval
CREATE POLICY "National admins can view events needing national approval"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
      AND una.national_association_id = public.public_events.national_association_id
    )
  );

-- Super admins can view all events
CREATE POLICY "Super admins can view all events"
  ON public.public_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Clubs can create events
CREATE POLICY "Clubs can create events"
  ON public.public_events FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- State associations can create events
CREATE POLICY "State associations can create events"
  ON public.public_events FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'state'
    AND created_by_id IN (
      SELECT usa.state_association_id FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
    )
  );

-- National associations can create events
CREATE POLICY "National associations can create events"
  ON public.public_events FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_type = 'national'
    AND created_by_id IN (
      SELECT una.national_association_id FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
    )
  );

-- Clubs can update their own events (if not yet approved)
CREATE POLICY "Clubs can update their pending events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
    AND approval_status IN ('draft', 'pending', 'rejected')
  )
  WITH CHECK (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
  );

-- State admins can update approval status
CREATE POLICY "State admins can approve events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
      AND usa.state_association_id = public.public_events.state_association_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_state_associations usa
      WHERE usa.user_id = auth.uid()
      AND usa.role = 'state_admin'
      AND usa.state_association_id = public.public_events.state_association_id
    )
  );

-- National admins can update approval status
CREATE POLICY "National admins can approve events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
      AND una.national_association_id = public.public_events.national_association_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_national_associations una
      WHERE una.user_id = auth.uid()
      AND una.role = 'national_admin'
      AND una.national_association_id = public.public_events.national_association_id
    )
  );

-- Super admins can update all events
CREATE POLICY "Super admins can update all events"
  ON public.public_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Clubs can delete their own events (if not yet approved)
CREATE POLICY "Clubs can delete their pending events"
  ON public.public_events FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT uc.club_id FROM public.user_clubs uc
      WHERE uc.user_id = auth.uid()
      AND uc.role IN ('admin', 'editor')
    )
    AND approval_status IN ('draft', 'pending', 'rejected')
  );

-- Super admins can delete events
CREATE POLICY "Super admins can delete events"
  ON public.public_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );
