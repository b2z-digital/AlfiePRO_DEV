# How to See the Command Center Button

## The Problem
The code has been updated and built successfully, but your browser is showing the old version without the Command Center button.

## The Solution

### If using the dev server:
1. **Stop the dev server** (Ctrl+C in the terminal)
2. **Start it again**: `npm run dev`
3. **Hard refresh your browser**:
   - Chrome/Edge: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Firefox: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
   - Safari: `Cmd+Option+R` (Mac)

### If deployed:
1. **Deploy the new build** that was just created in the `dist` folder
2. **Clear browser cache** and reload

## What Changed

I added the Command Center button to:
- **File**: `src/pages/EventWebsiteDashboardPage.tsx`
- **Location**: Top-right corner, next to "View Website"
- **Appearance**: Purple button with grid icon

The button was added at lines 213-221:
```tsx
{website.event_id && (
  <button
    onClick={() => navigate(`/event-command-center/${website.event_id}`)}
    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
  >
    <LayoutGrid size={18} />
    Command Center
  </button>
)}
```

## Your Event Data

Your event website ("2026 DF95 Australian Championship") has:
- **Event ID**: `17906bb0-b42f-45e4-8d91-5e27ec80ed5a` ✅
- **Primary Event**: `7da02691-9904-467a-b5e2-99aa814efddd` ✅
- **Multiple events linked** via the event_website_events junction table ✅

Everything is configured correctly - you just need to load the new code!
