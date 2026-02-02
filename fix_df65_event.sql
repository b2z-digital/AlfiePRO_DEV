-- Fix the DF65 event that was accidentally reset to pending_state
-- This will restore it back to approved status

UPDATE public_events
SET approval_status = 'approved'
WHERE event_name LIKE '%DF65%Australian Championship%'
  AND date = '2026-03-21'
  AND approval_status = 'pending_state';

-- Verify the fix
SELECT id, event_name, date, approval_status, entry_fee
FROM public_events
WHERE event_name LIKE '%DF65%'
  AND date >= '2026-03-01';
