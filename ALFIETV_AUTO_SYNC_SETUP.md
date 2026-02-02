# AlfieTV Auto-Sync Setup Guide

## What's Been Implemented

An automated system that syncs YouTube channels daily to fetch new videos automatically.

### Features
- ✅ **Daily Auto-Sync**: Runs at 2 AM UTC every day
- ✅ **Smart Syncing**: Only syncs channels with `auto_import` enabled
- ✅ **Rate Limiting**: Syncs max 10 channels per run to avoid API limits
- ✅ **Priority Queue**: Syncs oldest channels first (based on `last_imported_at`)
- ✅ **Manual Trigger**: Can also be triggered manually for testing

### Database Changes
- Added `last_imported_at` column to `alfie_tv_channels` table
- Created `sync_all_alfietv_channels()` function (returns sync status)
- Created `sync_all_alfietv_channels_cron()` function (for automated runs)
- Scheduled daily cron job: `alfietv-daily-sync`

## Required Configuration

The auto-sync system requires two configuration settings to be set in your Supabase database:

### Step 1: Get Your Supabase Credentials

1. Go to your Supabase dashboard
2. Click on "Project Settings" (gear icon)
3. Go to "API" section
4. Copy:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### Step 2: Configure Database Settings

Run these SQL commands in your Supabase SQL Editor (replace with your actual values):

```sql
-- Set your Supabase project URL
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR-PROJECT.supabase.co';

-- Set your Supabase anon key
ALTER DATABASE postgres SET app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Step 3: Verify Configuration

Test that the configuration works:

```sql
-- Check if settings are configured
SELECT current_setting('app.supabase_url', true) as url,
       current_setting('app.supabase_anon_key', true) as key;
```

## Testing the Sync

### Manual Test

You can manually trigger a sync to test it works:

```sql
-- Run sync and see results
SELECT * FROM sync_all_alfietv_channels();
```

This will return a table showing:
- `channel_id` - UUID of the channel
- `channel_name` - Name of the channel
- `sync_triggered` - true if sync request was sent successfully
- `error_message` - any error that occurred (null if successful)

### Check Sync Status

```sql
-- View all channels and their sync status
SELECT
  channel_name,
  auto_import,
  video_count,
  last_imported_at,
  CASE
    WHEN last_imported_at IS NULL THEN 'Never synced'
    WHEN last_imported_at > now() - interval '1 day' THEN 'Synced recently'
    WHEN last_imported_at > now() - interval '7 days' THEN 'Synced this week'
    ELSE 'Synced ' || extract(day from now() - last_imported_at) || ' days ago'
  END as sync_status
FROM alfie_tv_channels
ORDER BY last_imported_at DESC NULLS LAST;
```

### View Cron Job Status

```sql
-- Check scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'alfietv-daily-sync';

-- View cron job history (if available)
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'alfietv-daily-sync')
ORDER BY start_time DESC
LIMIT 10;
```

## How It Works

1. **Daily Schedule**: At 2 AM UTC, the cron job runs `sync_all_alfietv_channels_cron()`
2. **Channel Selection**: Function finds up to 10 channels with `auto_import=true`, prioritizing oldest sync dates
3. **API Call**: For each channel, it calls the `sync-youtube-channel` edge function via HTTP
4. **Rate Limiting**: 100ms delay between each channel to avoid overwhelming the YouTube API
5. **Status Update**: The `sync-youtube-channel` function updates `last_imported_at` when complete

## Channel Status: 6 Total Channels

Currently in your database:
- **6 channels** with auto-import enabled
- **5 channels** have been synced at least once
- **1 channel** has never been synced

The auto-sync will catch all channels within 1 day of setup.

## Troubleshooting

### If channels aren't syncing:

1. **Check Configuration**:
   ```sql
   SELECT current_setting('app.supabase_url', true),
          current_setting('app.supabase_anon_key', true);
   ```
   Both should return values (not null).

2. **Check YouTube API Key**:
   Ensure `YOUTUBE_API_KEY` is set as a Supabase secret:
   - Go to Supabase Dashboard → Project Settings → Edge Functions
   - Add secret: `YOUTUBE_API_KEY` with your Google API key

3. **Test Manual Sync**:
   ```sql
   SELECT * FROM sync_all_alfietv_channels();
   ```
   Check the `error_message` column for details.

4. **Check Cron Job Logs**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'alfietv-daily-sync')
   ORDER BY start_time DESC;
   ```

5. **Verify pg_net Extension**:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```
   Should return one row.

## Manual Sync for Specific Channel

To manually sync a specific channel immediately:

```sql
-- Get channel ID
SELECT id, channel_name FROM alfie_tv_channels WHERE channel_name LIKE '%search%';

-- Then use the edge function directly (from your app)
-- or wait for the nightly sync
```

## Changing Sync Schedule

To change when the sync runs:

```sql
-- Unschedule current job
SELECT cron.unschedule('alfietv-daily-sync');

-- Schedule at different time (example: 3 AM)
SELECT cron.schedule(
  'alfietv-daily-sync',
  '0 3 * * *', -- 3 AM every day
  $$SELECT sync_all_alfietv_channels_cron()$$
);
```

Cron syntax: `minute hour day month weekday`
- `0 2 * * *` = 2 AM every day
- `0 */6 * * *` = Every 6 hours
- `0 0 * * 0` = Midnight every Sunday

## Next Steps

1. ✅ Run the configuration SQL commands above
2. ✅ Test with `SELECT * FROM sync_all_alfietv_channels();`
3. ✅ Wait 24 hours and verify channels are syncing automatically
4. ✅ Monitor the `last_imported_at` dates to ensure regular updates
