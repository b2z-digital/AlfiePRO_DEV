/*
  # Enhanced Event Approval Workflow with Ranking Events

  1. Changes to public_events table
    - Add `is_ranking_event` boolean field (default false)
    - Update approval_status constraint to include 'withdrawn' and 'approved_state'
    - Update approval flow logic

  2. Approval Flow
    - Club Events: No approval needed
    - State Events (non-ranking): State association approval only
    - State Events (ranking): State approval → National approval
    - National Events: State approval → National approval

  3. Security
    - Events only visible in calendars after all required approvals
*/

-- Add is_ranking_event column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'public_events' AND column_name = 'is_ranking_event'
  ) THEN
    ALTER TABLE public_events ADD COLUMN is_ranking_event boolean DEFAULT false;
  END IF;
END $$;

-- Drop the old constraint
ALTER TABLE public_events DROP CONSTRAINT IF EXISTS public_events_approval_status_check;

-- Create new constraint with 'withdrawn' and 'approved_state'
ALTER TABLE public_events ADD CONSTRAINT public_events_approval_status_check 
  CHECK (approval_status = ANY (ARRAY[
    'draft'::text, 
    'pending'::text,
    'pending_state'::text,
    'approved_state'::text,
    'pending_national'::text, 
    'approved_national'::text,
    'approved'::text, 
    'rejected'::text,
    'withdrawn'::text
  ]));

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_public_events_approval_status 
  ON public_events(approval_status);

CREATE INDEX IF NOT EXISTS idx_public_events_is_ranking 
  ON public_events(is_ranking_event) WHERE is_ranking_event = true;

-- Add comments for documentation
COMMENT ON COLUMN public_events.is_ranking_event IS 'If true, event requires both state and national approval regardless of event_level';
COMMENT ON COLUMN public_events.approval_status IS 'pending_state: Awaiting state approval, approved_state: State approved awaiting national, pending_national: Awaiting national approval, approved: Fully approved, withdrawn: Club withdrew submission';