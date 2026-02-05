# HMS Seeding Fix - Automatic Ranking Matching

## Problem
The HMS Seeding Assignment modal was showing 0 ranked skippers and all skippers displayed as "undefined undefined" because it couldn't find any verified name mappings linking members to their national rankings.

## Root Cause
The system required verified mappings in the `skipper_name_mappings` table to connect:
- Members in the `members` table (with their actual names)
- Rankings in the `national_rankings` table (with scraped names from radiosailing.org.au)

Without these mappings, HMS seeding couldn't match members to rankings, even though the rankings existed.

## Solution
Enhanced the HMS Seeding Modal to automatically perform fuzzy name matching when no verified mappings are found:

### Automatic Matching Algorithm
1. **Exact Match**: Compares full names after normalizing (lowercase, trim)
2. **Partial Match**: Handles variations like "Steve" vs "Stephen Walsh"
   - Checks if first names are similar (contains or partial match)
   - Verifies last names match exactly
3. **Falls back to distribution**: Unmatched skippers are evenly distributed across heats

### What Changed
- Modified `src/components/HMSSeedingModal.tsx`
- Added automatic fuzzy matching when `rankingsMap.size === 0`
- Dynamically imports `getRankingsByClass` to fetch all rankings
- Matches members to rankings based on name similarity
- Works without requiring manual name mapping setup

## Weekly Automatic Sync
Additionally set up automated weekly sync:
- **Schedule**: Every Sunday at 2:00 AM
- **Function**: `sync-rankings-weekly`
- **Coverage**: All yacht classes (IOM, 10R, Marblehead, A Class, DF65, DF95)
- **Source**: radiosailing.org.au

## Benefits
1. **Zero Configuration**: HMS seeding now works immediately after syncing rankings
2. **Smart Matching**: Handles name variations automatically
3. **No Manual Work**: Eliminates need to create mappings before each event
4. **Always Up-to-Date**: Weekly automatic sync keeps rankings current

## Usage
1. Sync rankings (manual or wait for weekly auto-sync)
2. Open HMS Seeding Assignment modal
3. System automatically matches members to rankings
4. Review and apply heat assignments

## For Advanced Users
If you need more control over name matching, you can still use the Name Mapping Manager to create verified mappings. Verified mappings always take precedence over automatic fuzzy matching.
