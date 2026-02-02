# Association Data Separation Implementation Guide

## Overview
This guide documents the work needed to ensure association dashboards operate independently from club data.

## Completed Work

### 1. Database Schema Updates ✅
- **Articles Table**: Already has `state_association_id` and `national_association_id` columns with RLS policies
- **Meetings Table**: Added association columns and RLS policies
- **Club Tasks Table**: Added association columns and RLS policies
- **Association Finance Settings**: All document settings columns added

### 2. Storage Layer Updates

#### ✅ Completed
- **articleStorage.ts**: Updated to support associations
  - `getArticles()` now accepts `associationId` and `associationType` parameters
  - `createArticle()` supports association IDs
  - `getArticleTags()` updated for associations

#### 🔧 Remaining Work Required

**meetingStorage.ts** - Needs association support:
```typescript
// Update all functions to accept:
(clubId?: string, associationId?: string, associationType?: 'state' | 'national')

// Functions to update:
- getMeetings()
- getMeetingById()
- createMeeting()
- updateMeeting()
- deleteMeeting()
```

**taskStorage.ts** - Needs association support:
```typescript
// Update all functions similarly
// Add state_association_id and national_association_id to Task interface
```

**classifiedStorage.ts** - Check if classifieds need association support

**mediaStorage.ts** - Check if media needs association support

**venueStorage.ts** - Check if venues need association support

### 3. Component Layer Updates

#### Components That Need Updating

**ArticleEditorPage.tsx** / **NewsPage.tsx**
- Currently shows error: "You must be logged in and have a selected club"
- **Fix**: Pass `associationId` and `associationType` when in association context
- Use `currentOrganization` from AuthContext instead of `currentClub`

**MeetingsPage.tsx** / **MeetingForm.tsx**
- Currently shows error: "Failed to load members"
- **Fix**: Update to fetch members from association instead of club
- Pass association IDs to meeting storage functions

**TasksPage.tsx** / **TaskForm.tsx**
- Currently shows error: "Failed to save task"
- **Fix**: Pass association IDs instead of club_id
- Update task storage calls

## Implementation Pattern

### Storage Layer Pattern

```typescript
// Before (club-only)
export const getItems = async (clubId: string): Promise<Item[]> => {
  const { data } = await supabase
    .from('items')
    .select('*')
    .eq('club_id', clubId);
  return data;
};

// After (club + association support)
export const getItems = async (
  clubId?: string,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<Item[]> => {
  let query = supabase.from('items').select('*');

  if (clubId) {
    query = query.eq('club_id', clubId);
  } else if (associationId && associationType) {
    const idColumn = associationType === 'state'
      ? 'state_association_id'
      : 'national_association_id';
    query = query.eq(idColumn, associationId);
  } else {
    throw new Error('Either clubId or associationId required');
  }

  const { data } = await query;
  return data;
};
```

### Component Layer Pattern

```typescript
// In any management page component

const { currentClub, currentOrganization } = useAuth();

// Determine context
const isAssociation = !!currentOrganization && !currentClub;
const clubId = currentClub?.clubId;
const associationId = currentOrganization?.id;
const associationType = currentOrganization?.type; // 'state' | 'national'

// Pass to storage functions
const items = await getItems(
  clubId,
  isAssociation ? associationId : undefined,
  isAssociation ? associationType : undefined
);

// For create/update operations
const newItem = await createItem({
  ...itemData,
  club_id: clubId,
  state_association_id: associationType === 'state' ? associationId : undefined,
  national_association_id: associationType === 'national' ? associationId : undefined
});
```

## Priority Order

### High Priority (Blocks Usage)
1. **News/Articles** - Already done in storage, need to update components
2. **Meetings** - Update storage + components
3. **Tasks** - Update storage + components

### Medium Priority
4. **Media** - Check if needed
5. **Venues** - Check if needed
6. **Communications** - Check if needed

### Low Priority
7. **Classifieds** - Likely club-specific only
8. **Website** - Likely club-specific only

## Testing Checklist

For each management page:
- [ ] Can create items as association admin
- [ ] Can view only association's items
- [ ] Can edit association's items
- [ ] Can delete association's items
- [ ] Cannot see other association/club items
- [ ] RLS policies prevent unauthorized access

## Database Migration Status

All required database columns and RLS policies are in place:
- ✅ articles (state_association_id, national_association_id)
- ✅ meetings (state_association_id, national_association_id)
- ✅ club_tasks (state_association_id, national_association_id)
- ✅ association_finance_settings (all document fields)

## Next Steps

1. Update `meetingStorage.ts` following the articleStorage pattern
2. Update `taskStorage.ts` following the articleStorage pattern
3. Update `ArticleEditorPage.tsx` and `NewsPage.tsx` to use association context
4. Update `MeetingsPage.tsx` and related components
5. Update `TasksPage.tsx` and related components
6. Test each page thoroughly
7. Audit remaining management pages (Media, Venues, Communications)

## Key AuthContext Properties

```typescript
// Available from useAuth()
currentClub?: {
  clubId: string;
  name: string;
  // ...
}

currentOrganization?: {
  id: string;
  type: 'state' | 'national';
  name: string;
  // ...
}

// Helper
const isAssociation = !!currentOrganization && !currentClub;
```
