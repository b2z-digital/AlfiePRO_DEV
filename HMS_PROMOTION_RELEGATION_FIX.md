# HMS Heat Promotion/Relegation System - CORRECTLY FIXED

## Critical Problem Identified

**MAJOR ISSUE:** The previous implementation was calculating promotions and relegations AFTER both heats completed, then applying them to the **NEXT** round. This meant:
- Promoted skippers did NOT race in the higher heat during the same round
- They only appeared in the higher heat in the next round
- This violated HMS rules completely

**The Fix:** Promotions now happen **WITHIN the same round**, updating Heat A's lineup immediately after Heat B completes, BEFORE Heat A is scored.

## HMS Correct Implementation

### The Principle: Promotion-Before-Relegation (SAME ROUND)

HMS follows a specific order **within each round**:

1. **Heat B races** (lower heat goes first)
2. **IMMEDIATELY after Heat B finishes**: Top 6 are **promoted to Heat A**
3. **Heat A's lineup is updated** (now has 6 extra boats)
4. **Heat A races** with the promoted skippers included
5. **After Heat A finishes**: Bottom 6 are **relegated to Heat B for NEXT round**

**Key Insight:** Steps 2-4 happen in the SAME round!

**CRITICAL DETAIL:** Promoted skippers race TWICE in the same round:
- First in Heat B (their starting heat)
- Then in Heat A (after being promoted)
- They get TWO sets of results for that round
- Their Heat A result determines next round assignment

### Example with 27 Boats (2 Heats, 6 up/down)

#### Round 2 Starts
- Heat A: 14 boats (starting lineup)
- Heat B: 13 boats (starting lineup)

#### Heat B Races First
- Heat B completes scoring
- Top 6 finishers: Skippers #5, #12, #18, #21, #24, #26
- **🔼 PROMOTION HAPPENS NOW (same round)**
- These 6 are IMMEDIATELY added to Heat A's lineup

#### Heat A Lineup Updated (Before Racing)
- Heat A now has: 14 (original) + 6 (promoted) = **20 boats**
- This happens BEFORE Heat A is scored

#### Heat A Races
- Heat A races with 20 boats (including the promoted 6)
- Heat A completes scoring
- Bottom 6 finishers are identified for relegation

#### Round 2 Complete → Round 3 Setup
- **🔽 RELEGATION HAPPENS NOW (next round)**
- Bottom 6 from Heat A move to Heat B for Round 3
- Round 3 starts balanced again (14 in A, 13 in B)

## Key Differences from Previous Implementation

| Aspect | Previous (Wrong) | Now (Correct HMS) |
|--------|------------------|-------------------|
| **When promotions happen** | After BOTH heats, to NEXT round | After lower heat, SAME round |
| **Heat A size when racing** | Fixed (never changes) | Variable (includes promoted) |
| **Promoted skippers race in higher heat?** | No (next round only) | Yes (same round) |
| **When relegations happen** | Same time as promotions | After round completes |
| **Race officer sees** | Static heat sizes | Dynamic updates mid-round |

## Technical Implementation

### Files Modified

1. **`src/utils/heatUtils.ts`** - `completeHeat()` function
   - Added mid-round promotion logic
   - After scoring a lower heat, immediately updates the next higher heat's assignments
   - Promotions happen **within the current round**
   - Only applies to Round 2+ (Round 1 is seeding)

2. **`src/types/heat.ts`** - `generateNextRoundAssignments()` function
   - Now only handles RELEGATIONS (for next round setup)
   - Promotions are handled separately during the current round
   - Properly accounts for skippers who raced in promoted positions

3. **`src/utils/hmsHeatSystem.ts`** - `applyScheduleBC()` function
   - Updated for consistency
   - Detailed logging for debugging

### Algorithm Flow

#### During Round Scoring (completeHeat)

```typescript
// After a lower heat completes...
if (currentRound > 1 && nextHeat && promotionCount) {
  // Get top N finishers from just-completed heat
  const promoted = topN skippers from results;

  // UPDATE THE NEXT HEAT'S LINEUP (same round!)
  nextHeat.skipperIndices.push(...promoted);

  console.log(`Heat ${nextHeat} now has extra boats for this round`);
}
```

#### After Round Completes (generateNextRoundAssignments)

```typescript
// Set up STARTING lineups for next round
// This handles RELEGATIONS only
heats.forEach(heat => {
  // Keep skippers except those relegated
  const keep = middleSkippers;
  const relegated = bottomN;

  nextRound[lowerHeat].push(...relegated);
});
```

## Real-World Example

### Round 2 with 27 Skippers

**Starting Lineups:**
- Heat A: Skippers 1-14 (14 boats)
- Heat B: Skippers 15-27 (13 boats)

**Step 1: Score Heat B**
```
Heat B finishes (all 13 skippers race):
1st: Skipper #18
2nd: Skipper #21
3rd: Skipper #15
4th: Skipper #24
5th: Skipper #19
6th: Skipper #27
7th-13th: Skippers #16, #17, #20, #22, #23, #25, #26

All 13 have Heat B results recorded.
```

**Step 2: Promotion (SAME ROUND)**
```
🔼 HMS PROMOTION: Top 6 from Heat B → Heat A
Promoting: #18, #21, #15, #24, #19, #27

CRITICAL: These 6 skippers will race AGAIN in Heat A!
They have Heat B results AND will get Heat A results.

Heat A lineup updated:
- Was: 14 boats (Skippers 1-14)
- Now: 20 boats (Skippers 1-14, PLUS #18, #21, #15, #24, #19, #27)
```

**Step 3: Score Heat A (with 20 boats)**
```
Heat A finishes (20 boats race):
1st: Skipper #1
2nd: Skipper #18 (promoted - has BOTH Heat B and Heat A results!)
3rd: Skipper #4
...
18th: Skipper #9
19th: Skipper #12
20th: Skipper #14

The 6 promoted skippers now have TWO results for Round 2:
- Heat B result (from step 1)
- Heat A result (from step 3)
Their Heat A result is used for next round assignment.
```

**Step 4: Setup Round 3 (Relegation)**
```
🔽 RELEGATION: Bottom 6 from Heat A → Heat B (next round)
Relegating: #7, #11, #9, #12, #14, #8

Round 3 starting lineups:
- Heat A: 14 boats (top/middle from R2 Heat A)
- Heat B: 13 boats (middle from R2 Heat B + relegated 6)
```

## Benefits

1. **HMS Rule Compliant**: Exactly matches official HMS procedures
2. **Fair to Promoted Skippers**: They get immediate reward (race in higher heat)
3. **Correct Heat Sizes**: Heat A temporarily grows during racing
4. **Proper Sequencing**: B→promote→A→relegate→next round
5. **Race Officer Sees Reality**: Dynamic heat sizes match what happens on water

## Console Logging

During Round 2+, you'll see:

```
🔼 HMS PROMOTION: Heat B complete. Promoting top 6 to Heat A (same round)
  Promoting skippers: [18, 21, 15, 24, 19, 27]
  Heat A now has 20 skippers (including promoted)

[Later, after Heat A completes...]

=== GENERATING NEXT ROUND ASSIGNMENTS ===
Processing RELEGATIONS for next round - Round 2 → Round 3

Heat A: 20 finishers
  Heat A: Relegating bottom 6
  Keeping in Heat A: [1, 2, 3, 4, 5, 6, 18, 21, 15, 24, 19, 27, 10, 13]
  Relegating to Heat B: [7, 11, 9, 12, 14, 8]

Heat B: 13 finishers
  Lowest heat: Keeping all 13 skippers
  Keeping in Heat B: [16, 17, 20, 22, 23, 25, 26]

=== NEXT ROUND STARTING ASSIGNMENTS ===
Heat A: 14 skippers
Heat B: 13 skippers
```

## Testing Checklist

✅ **Test 1:** After scoring Heat B in Round 2, check Heat A's lineup
   - Should have MORE boats than it started with
   - Should include top 6 from Heat B

✅ **Test 2:** Score Heat A with the extra boats
   - All promoted skippers should appear in Heat A results
   - Heat A should have results for all original + promoted boats

✅ **Test 3:** Check Round 3 starting lineups
   - Should be balanced again
   - Should include promoted skippers in Heat A
   - Should include relegated skippers in Heat B

## Summary

The system now CORRECTLY implements HMS promotion-before-relegation:

✅ Heat B races first (lower heats always first)
✅ **Promotions happen MID-ROUND** (after B, before A races)
✅ Heat A races with promoted skippers included (same round)
✅ Relegations happen after round completes (next round setup)
✅ Fleet sizes fluctuate during round, balance between rounds
✅ Promoted skippers race in higher heat the SAME round they're promoted

**This is the critical fix**: Promoted skippers now race in the higher heat immediately, not in the next round.
