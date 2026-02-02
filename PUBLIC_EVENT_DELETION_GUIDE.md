# Public Event Deletion Guide

## Overview

This guide explains how State/National event deletion works and the cascading effects on clubs that have scored these events.

## Who Can Delete Public Events?

### State Events (created_by_type = 'state')
- **State Admins** of the association that created the event
- **Super Admins** (platform administrators)

### National Events (created_by_type = 'national')
- **National Admins** of the association that created the event
- **Super Admins** (platform administrators)

### Club Events (created_by_type = 'club')
- **Club Admins/Editors** can only delete events in draft/pending/rejected status
- **Super Admins** can delete any club event

## What Happens When a Public Event is Deleted?

### Database Cascade Behavior

When a State or National admin deletes a public event:

1. **Public Event Removed** ✓
   - Event deleted from `public_events` table
   - No longer visible in any club's Race Calendar

2. **All Local Copies Deleted** ✓
   - Automatic cascade deletion via database trigger
   - All entries in `quick_races` with matching `public_event_id` are removed
   - This happens across ALL clubs

3. **All Scoring Data Lost** ⚠️
   - Results, scores, and skipper data permanently removed
   - No backup or recovery available
   - Affects all clubs that participated

### Visual Flow

```
State Admin Deletes Event
         ↓
public_events row deleted
         ↓
Trigger: cascade_delete_public_event_copies()
         ↓
All quick_races entries with public_event_id deleted
         ↓
Event removed from:
  - All club Race Calendars ✓
  - All club Race Management dashboards ✓
  - All scoring data gone ✓
```

## User Experience

### For Event Organizers (State/National)

**Before Deletion:**
- Event visible on State/National calendar
- Event available to all clubs
- Some clubs may have scored the event

**After Deletion:**
- Event completely removed from system
- Event disappears from all calendars
- All club scoring data removed

### For Clubs That Scored the Event

**Before Deletion:**
- Event visible in Race Management
- Results and scores saved
- Can continue scoring/editing

**After Deletion:**
- Event removed from Race Management ✓
- Event removed from Race Calendar ✓
- All results and scores LOST ⚠️
- No notification sent to clubs

## Implementation Details

### Database Components

#### 1. RLS Policies (Migration: `add_state_national_admin_delete_policies`)

```sql
-- State admins can delete their association events
CREATE POLICY "State admins can delete their association events"
  ON public_events FOR DELETE
  USING (
    created_by_type = 'state'
    AND created_by_id IN (
      SELECT state_association_id
      FROM user_state_associations
      WHERE user_id = auth.uid() AND role = 'state_admin'
    )
  );

-- National admins can delete their association events
CREATE POLICY "National admins can delete their association events"
  ON public_events FOR DELETE
  USING (
    created_by_type = 'national'
    AND created_by_id IN (
      SELECT national_association_id
      FROM user_national_associations
      WHERE user_id = auth.uid() AND role = 'national_admin'
    )
  );
```

#### 2. Cascade Delete Trigger (Migration: `add_cascade_delete_local_copies_on_public_event_deletion`)

```sql
CREATE OR REPLACE FUNCTION cascade_delete_public_event_copies()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete all local copies that reference this public event
  DELETE FROM quick_races
  WHERE public_event_id = OLD.id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER cascade_delete_public_event_copies_trigger
  BEFORE DELETE ON public_events
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_public_event_copies();
```

### Frontend Components

#### Functions Available

```typescript
// Check how many clubs have scored an event
const clubCount = await getPublicEventScoringClubCount(publicEventId);

// Delete public event (with cascade)
const success = await deletePublicEvent(publicEventId);
```

#### File: `src/utils/publicEventStorage.ts`

- `getPublicEventScoringClubCount()` - Check impact before deletion
- `deletePublicEvent()` - Delete event (triggers cascade)

## Best Practices

### Before Deleting an Event

1. **Check Impact**
   ```typescript
   const affectedClubs = await getPublicEventScoringClubCount(eventId);
   if (affectedClubs > 0) {
     // Show warning to admin
     alert(`Warning: ${affectedClubs} clubs have scored this event.
            All their data will be permanently lost.`);
   }
   ```

2. **Confirm Deletion**
   - Always show a confirmation dialog
   - Clearly state the consequences
   - Mention number of affected clubs
   - Make it clear data cannot be recovered

3. **Consider Alternatives**
   - Could the event be marked as cancelled instead?
   - Could the event remain visible but locked?
   - Is there a reason to preserve club data?

### Recommended Confirmation Message

```
⚠️ Delete State Event?

This will permanently delete "Event Name" and affect X clubs:

• Event removed from all calendars
• All club scoring data deleted
• Results and scores permanently lost
• This action CANNOT be undone

Are you absolutely sure?
```

## Testing the Deletion Flow

### Test Scenario 1: Delete Event with No Scoring

1. State admin creates event
2. Event appears in club calendars
3. No clubs score the event
4. State admin deletes event
5. **Expected:** Event removed, no data loss

### Test Scenario 2: Delete Event with Scoring

1. State admin creates event
2. 3 clubs score the event (add skippers, results)
3. State admin deletes event
4. **Expected:**
   - Public event deleted ✓
   - 3 quick_races entries deleted ✓
   - Event removed from all 3 clubs ✓
   - All scoring data lost ✓

### SQL Verification

```sql
-- Check public event exists
SELECT * FROM public_events WHERE id = 'event-id';

-- Check which clubs scored it
SELECT club_id, event_name
FROM quick_races
WHERE public_event_id = 'event-id';

-- Delete the public event
DELETE FROM public_events WHERE id = 'event-id';

-- Verify cascade worked
SELECT club_id, event_name
FROM quick_races
WHERE public_event_id = 'event-id';
-- Should return 0 rows
```

## Future Enhancements

### Recommended Features

1. **Pre-Delete Warnings**
   - Show admin how many clubs will be affected
   - Display list of clubs with scoring data
   - Require confirmation with event name

2. **Soft Delete Option**
   - Mark event as "cancelled" instead of deleting
   - Preserve club data for historical records
   - Hide from calendars but keep in database

3. **Notification System**
   - Send email to affected clubs before deletion
   - Notify clubs when event is deleted
   - Provide 24-48 hour warning period

4. **Archive Feature**
   - Export all club data before deletion
   - Save results to archive table
   - Allow data recovery if needed

## Troubleshooting

### Event Not Deleting

**Problem:** Admin tries to delete event but gets error

**Possible Causes:**
1. User doesn't have permission (check role in user_state_associations)
2. Event was created by different association
3. RLS policy not applied correctly

**Solution:**
```sql
-- Check user's permissions
SELECT * FROM user_state_associations
WHERE user_id = auth.uid();

-- Check event ownership
SELECT created_by_type, created_by_id
FROM public_events
WHERE id = 'event-id';
```

### Cascade Not Working

**Problem:** Public event deleted but local copies remain

**Possible Causes:**
1. Trigger not installed
2. Trigger disabled
3. quick_races entries don't have public_event_id set

**Solution:**
```sql
-- Check trigger exists
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'cascade_delete_public_event_copies_trigger';

-- Check if local copies have reference
SELECT id, public_event_id
FROM quick_races
WHERE public_event_id IS NOT NULL;
```

## Summary

- ✅ State/National admins can delete their events
- ✅ Deletion cascades to all club copies
- ✅ Event removed from all calendars
- ⚠️ All scoring data permanently lost
- ⚠️ No recovery or undo available
- ⚠️ No automatic notification to clubs

**Use with caution!**
