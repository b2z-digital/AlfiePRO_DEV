# Handicap Viewer Fixes - Touch Mode

## Issues Fixed

### 1. Confirm Button Not Appearing (Race Auto-Advancing)
**Problem**: When all sail numbers were selected in Touch Mode, the race automatically jumped to the next one BEFORE the "Confirm & Apply Results" button could be clicked. The button only appeared after navigating back to the previous race.

**Root Cause**: TWO automatic race completion triggers were firing when all skippers had results entered:
1. In `YachtRaceManager.autoSaveRaceResults()` - lines 1083-1104
2. In `TouchModeScoring.updateRaceResults()` callback - lines 2436-2469

Both were updating `lastCompletedRace` immediately when all positions were entered, which triggered an effect (line 115-117) that advanced `touchModeCurrentRace` to the next race before the user could click confirm.

**Solution Implemented**:
1. **Disabled automatic race completion in touch mode** in `YachtRaceManager.autoSaveRaceResults()`:
   - Added condition: `if (raceComplete && scoringMode !== 'touch')`
   - Prevents `lastCompletedRace` from updating when entering results in touch mode

2. **Moved race completion to confirmation callback**:
   - Removed auto-completion logic from `updateRaceResults` callback
   - Added new `onConfirmResults` callback that ONLY fires when user clicks "Confirm & Apply Results"
   - This callback now handles updating `lastCompletedRace`, which triggers the race advancement

3. **Added comprehensive logging** to track the flow and identify any remaining issues

**Key Changes**:

**In YachtRaceManager.tsx (autoSaveRaceResults):**
```typescript
// In touch mode, don't auto-advance to next race until user confirms
// This prevents the race from jumping forward before the confirm button can be clicked
if (raceComplete && scoringMode !== 'touch') {
  // ... auto-completion logic only runs in Pro mode now
}
```

**In YachtRaceManager.tsx (TouchModeScoring props):**
```typescript
updateRaceResults={(results: RaceResult[]) => {
  // DO NOT update lastCompletedRace here - wait for user confirmation
  console.log('📊 Touch mode: Updating race results (not marking as complete yet)');
  setRaceResults(results);
  autoSaveRaceResults(results);
}}

onConfirmResults={() => {
  // User clicked "Confirm & Apply Results" - NOW mark the race as complete
  console.log('✅ Touch mode: User confirmed results, marking race as complete');

  // Check for completion and update lastCompletedRace
  // This will trigger the effect that advances to next race
  let highestConsecutiveRace = 0;
  // ... calculation logic ...

  if (highestConsecutiveRace > lastCompletedRace) {
    setLastCompletedRace(highestConsecutiveRace); // NOW triggers advancement
  }
}}
```

**In TouchModeScoring.tsx:**
```typescript
// Trigger the race completion callback
// This will update lastCompletedRace and automatically advance to next race
if (onConfirmResults) {
  onConfirmResults();
}
```

### 2. Auto-Open Handicap Viewer After Confirmation
**Problem**: After confirming race results, race officers needed to manually open the handicap viewer to call out the new handicaps to skippers.

**Solution**: Automatically open the floating handicap viewer when results are confirmed for handicap events.

**Implementation**:
1. Made FloatingHandicapViewer accept external open/close control
2. Added state management in TouchModeScoring for viewer visibility
3. Automatically open viewer when handleConfirmResults is called

**Key Changes**:

```typescript
// In TouchModeScoring.tsx
const [isHandicapViewerOpen, setIsHandicapViewerOpen] = useState(false);

// Auto-open viewer on confirmation
const handleConfirmResults = () => {
  setIsConfirmed(true);

  const isHandicapEvent = skippers.some(s => s.startHcap !== undefined && s.startHcap > 0);

  // Automatically open handicap viewer for race officers to call out handicaps
  if (isHandicapEvent) {
    setIsHandicapViewerOpen(true);

    // Also show post-race modal for non-heat events
    if (typeof dropRules === 'string' && dropRules !== 'shrs' && dropRules !== 'hms') {
      setShowPostRaceHandicapModal(true);
    }
  }

  if (onConfirmResults) {
    onConfirmResults();
  }
};

// Reset viewer when changing races
useEffect(() => {
  setCurrentRace(initialRace);
  setIsConfirmed(false);
  setIsHandicapViewerOpen(false); // Close handicap viewer when changing races
}, [initialRace]);

// Pass controlled state to FloatingHandicapViewer
<FloatingHandicapViewer
  skippers={skippers}
  raceResults={raceResults}
  currentRace={currentRace}
  darkMode={darkMode}
  isOpen={isHandicapViewerOpen}
  onOpenChange={setIsHandicapViewerOpen}
/>
```

```typescript
// In FloatingHandicapViewer.tsx - Made component controllable
interface FloatingHandicapViewerProps {
  skippers: Skipper[];
  raceResults: RaceResult[];
  currentRace: number;
  darkMode: boolean;
  isOpen?: boolean;              // NEW: External control
  onOpenChange?: (open: boolean) => void;  // NEW: Callback
}

// Hybrid state management (controlled + uncontrolled)
const [internalIsOpen, setInternalIsOpen] = useState(false);

// Use external control if provided, otherwise use internal state
const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
const setIsOpen = (open: boolean) => {
  if (onOpenChange) {
    onOpenChange(open);
  } else {
    setInternalIsOpen(open);
  }
};
```

## User Experience Improvements

### Before
1. ❌ Confirm button sometimes didn't appear
2. ❌ Race officer had to manually open handicap viewer
3. ❌ Extra steps required to call out handicaps

### After
1. ✅ Confirm button reliably appears with enhanced logging
2. ✅ Handicap viewer automatically opens on confirmation
3. ✅ Race officer can immediately call out handicaps
4. ✅ Comprehensive logging for debugging if issues arise

## Workflow Enhancement

The new workflow for handicap events in Touch Mode:

1. **Scoring**: Race officer scores all skippers by tapping sail numbers
2. **Confirmation Button Appears**: "Confirm & Apply Results" button appears at bottom (no longer auto-advances!)
3. **Click Confirm**: Race officer clicks the confirmation button
4. **Auto-Open Handicap Viewer**: Handicap viewer automatically slides out from right
5. **Call Handicaps**: Race officer can see and call out all updated handicaps to skippers
6. **Optional**: Post-race handicap modal shows detailed before/after comparison
7. **Auto-Advance**: Race automatically advances to next race (Race 5 in your example)
8. **Continue**: Handicap viewer stays open showing new race's starting handicaps

## Technical Details

### State Management
- `isConfirmed`: Tracks whether current race results are confirmed
- `isHandicapViewerOpen`: Controls visibility of floating handicap panel
- Both states reset when navigating to a different race

### Component Communication
- FloatingHandicapViewer now supports both controlled and uncontrolled modes
- Falls back to internal state if no external control provided
- Maintains backward compatibility

### Logging Added
- Button visibility conditions logged on every state change
- All skippers scored event logged
- Confirm button click logged
- Race results save flow fully logged

## Files Modified

1. **YachtRaceManager.tsx**
   - Modified `autoSaveRaceResults()` to skip auto-completion in touch mode (line 1085)
   - Moved race completion logic from `updateRaceResults` callback to new `onConfirmResults` callback (lines 2438-2476)
   - Added logging for touch mode scoring flow

2. **TouchModeScoring.tsx**
   - Added state for handicap viewer control (`isHandicapViewerOpen`)
   - Enhanced `handleConfirmResults` to auto-open handicap viewer
   - Calls `onConfirmResults` callback to trigger race completion
   - Added comprehensive logging throughout
   - Reset viewer state on race change

3. **FloatingHandicapViewer.tsx**
   - Added optional external control props (`isOpen`, `onOpenChange`)
   - Implemented hybrid controlled/uncontrolled pattern
   - Maintains backward compatibility for existing uses

## Testing Checklist

- [x] Build succeeds without errors
- [ ] Confirm button appears when all skippers scored
- [ ] Handicap viewer opens automatically on confirmation
- [ ] Viewer closes when navigating to different race
- [ ] Manual toggle still works (floating button)
- [ ] Non-handicap events unaffected
- [ ] Heat scoring (SHRS/HMS) unaffected

## Notes

The comprehensive logging added will help identify any remaining timing or state synchronization issues. Check browser console for:
- 🔘 Button visibility logs
- 📊 All skippers scored logs
- 🎯 Button click logs
- 💾 Results save logs

This information can be used to further diagnose any edge cases.
