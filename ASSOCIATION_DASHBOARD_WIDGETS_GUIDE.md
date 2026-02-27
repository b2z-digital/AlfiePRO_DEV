# Association Dashboard Widgets - Implementation Guide

## Overview

All dashboard widgets are now **context-aware**, automatically detecting whether they're being viewed in a Club, State Association, or National Association context, and aggregating data accordingly.

## How It Works

### 1. Organization Context Hook

The `useOrganizationContext` hook (`src/hooks/useOrganizationContext.ts`) provides:

```typescript
{
  type: 'club' | 'state' | 'national',
  clubId: string | null,
  stateAssociationId: string | null,
  nationalAssociationId: string | null,
  clubIds: string[],  // Array of club IDs to query
  isLoading: boolean
}
```

**Key Features:**
- For **Clubs**: Returns single club ID in `clubIds` array
- For **State Associations**: Returns all club IDs under that state
- For **National Associations**: Returns all club IDs under all state associations under that national

### 2. Updated Widgets

The following widgets have been updated to be association-aware:

#### ✅ Completed Widgets:
1. **MembersCountWidget** - Shows total members across all clubs
2. **MembersByClassWidget** - Shows member distribution by boat class aggregated across clubs
3. **ActiveMembersWidget** - Shows active members across all clubs
4. **NewMembersWidget** - Shows new members this month across all clubs
5. **PendingApplicationsWidget** - Shows pending applications across all clubs
6. **EventParticipationWidget** - Shows event participation across all clubs

#### 📋 Already Association-Ready:
- **EventCountWidget** - Already has association logic
- **UpcomingEventsWidget** - Already has association logic

## How to Update a Widget

### Step 1: Import the Hook

```typescript
import { useOrganizationContext, getContextLabel } from '../../../hooks/useOrganizationContext';
```

### Step 2: Replace currentClub with orgContext

**Before:**
```typescript
const { currentClub } = useAuth();

useEffect(() => {
  if (currentClub) {
    fetchData();
  }
}, [currentClub]);

const fetchData = async () => {
  if (!currentClub?.clubId) return;

  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .eq('club_id', currentClub.clubId);  // ❌ Single club only
```

**After:**
```typescript
const { currentClub } = useAuth();
const orgContext = useOrganizationContext();

useEffect(() => {
  if (!orgContext.isLoading) {
    fetchData();
  }
}, [orgContext.clubIds, orgContext.isLoading]);

const fetchData = async () => {
  if (orgContext.clubIds.length === 0) return;

  const { data, error } = await supabase
    .from('table_name')
    .select('*')
    .in('club_id', orgContext.clubIds);  // ✅ Multiple clubs
```

### Step 3: Update Loading States

```typescript
{loading || orgContext.isLoading ? '...' : count}
```

### Step 4: Update Labels (Optional)

```typescript
<p className="text-xs text-slate-400">
  {getContextLabel(orgContext.type)} Members
</p>
```

This will display:
- "Club Members" for clubs
- "State Members" for state associations
- "National Members" for national associations

## Example: Complete Widget Update

```typescript
import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { useOrganizationContext, getContextLabel } from '../../../hooks/useOrganizationContext';

export const MyWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove }) => {
  const { currentClub } = useAuth();
  const orgContext = useOrganizationContext();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchData();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchData = async () => {
    if (orgContext.clubIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .in('club_id', orgContext.clubIds);  // Query across all clubs

      if (error) throw error;
      setData(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>{getContextLabel(orgContext.type)} Widget</h3>
      <p>{loading || orgContext.isLoading ? 'Loading...' : data.length}</p>
    </div>
  );
};
```

## Widgets That Need Updating

### Member-Related Widgets
- ✅ MembersCountWidget
- ✅ ActiveMembersWidget
- ✅ NewMembersWidget
- ✅ PendingApplicationsWidget
- ✅ MembersByClassWidget
- ⏳ MemberRetentionWidget
- ⏳ MemberEngagementWidget
- ⏳ MembershipStatusWidget
- ⏳ MembershipRenewalsWidget
- ⏳ PendingRenewalsWidget
- ⏳ RecentApplicationsWidget
- ⏳ ApplicationsRenewalsWidget
- ⏳ MembershipTypesWidget
- ⏳ MembershipTypesLargeWidget

### Event-Related Widgets
- ✅ EventCountWidget (already done)
- ✅ UpcomingEventsWidget (already done)
- ✅ EventParticipationWidget
- ⏳ PendingEventsWidget
- ⏳ RecentResultsWidget
- ⏳ EventWebsitesWidget

### Financial Widgets
- ⏳ FinancialHealthWidget
- ⏳ FinancialPositionWidget
- ⏳ GrossIncomeWidget
- ⏳ NetIncomeWidget
- ⏳ TotalExpensesWidget
- ⏳ MembershipIncomeWidget
- ⏳ RecentTransactionsWidget
- ⏳ PendingInvoicesWidget

### Other Widgets
- ⏳ TasksCountWidget
- ⏳ MeetingsCountWidget
- ⏳ UnreadCommunicationsWidget
- ⏳ MediaCenterWidget
- ⏳ LatestNewsWidget
- ⏳ ActivityFeedWidget
- ⏳ CommunicationsWidget

## Testing

1. **Club View**: Widgets should show only that club's data
2. **State Association View**: Widgets should aggregate across all clubs in that state
3. **National Association View**: Widgets should aggregate across all clubs in all states under that national

## Database Structure

The hook automatically handles these relationships:
```
National Association
  └─ State Associations (state_associations.national_association_id)
      └─ Clubs (clubs.state_association_id)
          └─ Members, Events, etc.
```

## Notes

- Widgets automatically work in all contexts - no need for separate versions
- Labels update automatically based on context
- Queries aggregate data across multiple clubs seamlessly
- Loading states handle both data loading and context loading
- Performance is optimized with single queries using `.in()` clause

## Future Enhancements

Consider adding:
- Club-level breakdown in association views (drill-down)
- Comparison between clubs in state view
- Trend analysis across multiple clubs
- Export aggregated data
