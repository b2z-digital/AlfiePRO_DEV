# Observer State Management Fix

## Problem
Observers were not displaying correctly when exiting an event and then continuing to score. The issue occurred because observer state was being managed in multiple places, leading to synchronization problems:

1. **HeatAssignmentModal** - loaded observers into local `observersByHeat` state
2. **HeatScoringTable** - loaded observers into `currentHeatObservers` state
3. **TouchModeScoring** - received observers as `heatObservers` prop

When closing and reopening the modal, the observer states would become out of sync.

## Root Cause
The observer data flow was too complex:
- HeatAssignmentModal loaded its own copy of observers
- HeatScoringTable loaded a separate copy for TouchModeScoring
- When exiting/re-entering the event, the modal's local state wasn't synchronized with the parent's state
- TouchModeScoring would receive stale or empty observer data

## Solution
Simplified the observer state management by ensuring **HeatScoringTable is the single source of truth** for observer data:

### Changes Made

#### 1. Force Observer Reload When Modal Opens
**File:** `src/components/HeatScoringTable.tsx`

Added a useEffect that triggers observer reload whenever the Heat Assignments Modal opens:

```typescript
// Force reload observers when Heat Assignments Modal opens
// This ensures fresh observer data when continuing scoring after exiting
React.useEffect(() => {
  if (showHeatAssignments) {
    console.log('📋 Heat Assignments Modal opened - triggering observer refresh');
    setObserverReloadTrigger(prev => prev + 1);
  }
}, [showHeatAssignments]);
```

This ensures that when you return to scoring after exiting, observers are reloaded from the database.

#### 2. Enhanced Observer Loading Logic
**File:** `src/components/HeatScoringTable.tsx`

Improved the observer loading useEffect with:
- Better logging to track observer loading
- Defensive clearing of stale observers
- Explicit state updates even for empty observer arrays

```typescript
if (!currentEvent?.id || !selectedHeat || !currentEvent.enable_observers) {
  console.log(`🚫 Not loading observers: ...`);
  // Clear observers if we can't load them
  if (currentHeatObservers.length > 0) {
    console.log('🧹 Clearing stale observers');
    setCurrentHeatObservers([]);
  }
  return;
}
```

#### 3. Improved TouchModeScoring Observer Logging
**File:** `src/components/TouchModeScoring.tsx`

Enhanced logging to track:
- When observers are received
- When observers are rendered
- Mismatches between observers and racing skippers
- Round/heat information with observer data

```typescript
console.log('👀 TouchMode heatObservers updated:', {
  count: heatObservers.length,
  race: currentRace,
  observers: heatObservers.map(obs => ({
    name: obs.skipper_name,
    sailNo: obs.skipper_sail_number,
    index: obs.skipper_index,
    round: obs.round,
    heatNumber: obs.heat_number
  }))
});
```

#### 4. Added Defensive Observer Rendering
**File:** `src/components/TouchModeScoring.tsx`

Added logging when rendering each observer to help debug display issues:

```typescript
{heatObservers.map((observer, idx) => {
  console.log(`👁️ Rendering observer ${idx + 1}/${heatObservers.length}:`,
    observer.skipper_name, '#' + observer.skipper_sail_number);
  return (
    // ... observer display ...
  );
})}
```

## Observer State Flow (After Fix)

1. **Modal Opens** → Triggers `setObserverReloadTrigger(prev => prev + 1)`
2. **Observer Loading Effect Runs** → Loads observers from database via `getObserverAssignments()`
3. **State Updates** → `setCurrentHeatObservers(observers)`
4. **Props Flow** → Observers passed to TouchModeScoring as `heatObservers` prop
5. **Display** → TouchModeScoring displays observers at bottom of screen

When modal closes (via X button or "Start Scoring"):
- `onClose()` handler also triggers observer reload (line 1136)
- Ensures fresh data for scoring screen

## Testing the Fix

To verify the fix works:

1. **Start scoring a heat** with observers assigned
2. **Exit the event** (close the modal via X button)
3. **Continue scoring** (reopen the modal)
4. **Check console logs** for:
   - `📋 Heat Assignments Modal opened - triggering observer refresh`
   - `🔍 Loading observers for Heat X`
   - `✅ Loaded N observers`
   - `👀 TouchMode heatObservers updated`
   - `👁️ Rendering observer` (for each observer)
5. **Verify observers display** at bottom of TouchModeScoring screen
6. **Click "Start Scoring"**
7. **Verify observers persist** on the scoring screen

## Key Improvements

✅ **Single Source of Truth** - HeatScoringTable manages observer state
✅ **Automatic Refresh** - Observers reload when modal opens/closes
✅ **Better Logging** - Easy to debug observer state issues
✅ **Defensive Clearing** - Stale observers are explicitly removed
✅ **State Consistency** - Observer state updates trigger re-renders

## Future Improvements (Optional)

For even simpler state management, consider:
- Pass observers as props to HeatAssignmentModal (remove its internal loading)
- Create a custom `useHeatObservers` hook to encapsulate loading logic
- Consider using React Context for observer state if needed across many components

## Notes

- The `observerReloadTrigger` state variable is specifically designed to force observer reloads without changing other dependencies
- The useEffect dependency array includes this trigger: `[..., observerReloadTrigger]`
- Incrementing this trigger (`prev => prev + 1`) causes the effect to rerun
- This pattern is safer than trying to reload observers by changing other state variables
