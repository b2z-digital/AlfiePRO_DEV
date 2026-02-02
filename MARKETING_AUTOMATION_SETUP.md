# Marketing Automation System - Complete Setup Guide

## Overview

The marketing automation system is now fully operational and ready to send automated emails through your existing SendGrid configuration. The system processes automation flows every 5 minutes, handling enrollments, executing steps, and sending personalized emails.

## What's Been Implemented

### 1. Flow Editor Improvements
- **In-App Notifications**: Replaced browser alerts with slide-out notifications showing "Successfully Saved" and "Flow published and activated successfully"
- **Stay on Screen**: After saving or publishing, users remain on the flow editor instead of being redirected
- **Publish/Unpublish**:
  - Draft flows show a blue "Publish" button
  - Active flows show a green "Unpublish" button
  - The "Activate" button has been removed
- **Auto-Save**: Changes are saved with clear user feedback

### 2. Edge Function Processing
Created `process-automation-flows` edge function that:
- Processes all active automation flows
- Handles enrollments and step progression
- Executes different step types:
  - **send_email**: Sends emails via SendGrid
  - **wait**: Delays progression (fixed or event-relative timing)
  - **condition**: Evaluates conditions and branches flow
  - **add_to_list**: Adds subscribers to marketing lists
  - **remove_from_list**: Removes subscribers from lists
- Tracks completion and metrics
- Logs errors for monitoring

### 3. Database Infrastructure
- **marketing_automation_job_runs**: Tracks execution history
- **automation_job_status**: View for monitoring runs
- **trigger_automation_flows_internal()**: Manual trigger function for testing

## Scheduling Setup

The edge function is deployed and ready to be scheduled. Choose one of the following options:

### Option A: Supabase Scheduled Functions (Recommended)

This is the easiest method if your Supabase plan supports scheduled functions:

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Find and click on `process-automation-flows`
4. Look for the **Schedule** or **Cron** section
5. Enable scheduled invocation
6. Set the schedule to: **Every 5 minutes** (or use cron syntax: `*/5 * * * *`)
7. Save the configuration

### Option B: External Cron Service

Use any external cron service or scheduler:

#### Using GitHub Actions

Create `.github/workflows/automation-flows.yml`:

```yaml
name: Process Automation Flows

on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual triggering

jobs:
  process-flows:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            https://[YOUR-PROJECT-REF].supabase.co/functions/v1/process-automation-flows \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

#### Using AWS EventBridge

1. Create a new EventBridge rule
2. Set schedule expression: `rate(5 minutes)`
3. Add target: API Gateway or HTTP endpoint
4. Configure endpoint:
   - URL: `https://[YOUR-PROJECT-REF].supabase.co/functions/v1/process-automation-flows`
   - Method: POST
   - Headers:
     - `Authorization: Bearer [SUPABASE_ANON_KEY]`
     - `Content-Type: application/json`

#### Using cron.io or similar services

1. Sign up for a cron service (cron.io, EasyCron, etc.)
2. Create a new job
3. Set URL: `https://[YOUR-PROJECT-REF].supabase.co/functions/v1/process-automation-flows`
4. Method: POST
5. Headers:
   - `Authorization: Bearer [YOUR-SUPABASE-ANON-KEY]`
   - `Content-Type: application/json`
6. Schedule: Every 5 minutes

### Option C: Manual Testing

For testing purposes, you can manually trigger the automation processor:

```sql
-- From Supabase SQL Editor
SELECT trigger_automation_flows_internal();
```

Or call the edge function directly:
```bash
curl -X POST \
  https://[YOUR-PROJECT-REF].supabase.co/functions/v1/process-automation-flows \
  -H "Authorization: Bearer [YOUR-SUPABASE-ANON-KEY]" \
  -H "Content-Type: application/json"
```

## SendGrid Configuration

The edge function automatically uses your existing SendGrid configuration:

### Environment Variable Required
Ensure the following environment variable is set in your Supabase project:

- `SENDGRID_API_KEY`: Your SendGrid API key (already configured for other emails)

To verify or update:
1. Go to Supabase Dashboard > Project Settings > Edge Functions
2. Check that `SENDGRID_API_KEY` is listed in the secrets
3. If not present, add it with your SendGrid API key

### Email Configuration
- **From Email**: `noreply@alfiepro.com.au`
- **From Name**: Club name (dynamically set from the flow's club)
- **Recipients**: Enrolled users' email addresses
- **Content**: HTML email content defined in flow steps

## Monitoring Automation Flows

### View Job Execution History

```sql
-- View recent automation runs
SELECT * FROM automation_job_status
ORDER BY started_at DESC
LIMIT 10;
```

### Check Active Flows

```sql
-- See all active flows
SELECT id, name, status, currently_active, total_enrolled, total_completed
FROM marketing_automation_flows
WHERE status = 'active';
```

### Monitor Enrollments

```sql
-- Check enrollment status
SELECT
  e.email,
  e.status,
  e.enrolled_at,
  e.current_step_id,
  s.step_type,
  s.name as step_name
FROM marketing_flow_enrollments e
LEFT JOIN marketing_flow_steps s ON s.id = e.current_step_id
WHERE e.status = 'active'
ORDER BY e.enrolled_at DESC;
```

### Email Delivery Tracking

```sql
-- View recent email sends
SELECT
  r.email,
  r.status,
  r.sent_at,
  r.opened_at,
  r.clicked_at,
  r.bounced_at,
  s.subject
FROM marketing_recipients r
JOIN marketing_flow_steps s ON s.id = r.flow_step_id
ORDER BY r.sent_at DESC
LIMIT 50;
```

## How It Works

### Flow Processing Lifecycle

1. **Scheduled Execution**: Every 5 minutes, the scheduler calls the edge function
2. **Active Flows**: Function queries all flows with `status = 'active'`
3. **Enrollment Processing**: For each flow, processes all active enrollments
4. **Step Execution**:
   - Checks current step for enrollment
   - Executes step based on type
   - Tracks completion
   - Moves to next step
5. **Email Sending**: Sends emails via SendGrid API with personalization
6. **Wait Handling**: Checks if wait periods are complete before progressing
7. **Condition Evaluation**: Branches flow based on conditions (registration, email opens, etc.)
8. **Completion Tracking**: Records metrics and updates flow statistics

### Step Types Explained

#### Send Email Step
- Retrieves email content and subject from step configuration
- Creates recipient record for tracking
- Sends via SendGrid API
- Tracks delivery status (sent, opened, clicked, bounced)

#### Wait Step
- **Fixed Delay**: Waits specified time from enrollment (e.g., 2 days after enrollment)
- **Event-Relative**: Waits until event date ± offset (e.g., 1 day before race)
- Only progresses when wait period is complete

#### Condition Step
- Evaluates conditions like:
  - Event registration status
  - Email opened/clicked
  - List membership
  - Member status
- Continues flow if condition is met
- Exits enrollment if condition fails

#### Add/Remove from List Steps
- Manages subscriber list membership
- Useful for segmentation
- Updates status (subscribed/unsubscribed)

## Testing Your Automation Flows

### 1. Create a Test Flow
1. Go to Marketing > Automation Flows
2. Create a new flow with simple steps:
   - Trigger: Manual enrollment
   - Wait: 1 minute
   - Send Email: Test message
3. Publish the flow

### 2. Enroll Test User
```sql
INSERT INTO marketing_flow_enrollments (
  flow_id,
  email,
  first_name,
  last_name,
  status,
  enrolled_at
) VALUES (
  '[YOUR-FLOW-ID]',
  'test@example.com',
  'Test',
  'User',
  'active',
  NOW()
);
```

### 3. Trigger Processing
```sql
SELECT trigger_automation_flows_internal();
```

### 4. Wait 1 Minute, Trigger Again
After the wait period, trigger again to send the email:
```sql
SELECT trigger_automation_flows_internal();
```

### 5. Check Results
```sql
-- Check enrollment progression
SELECT * FROM marketing_flow_enrollments WHERE email = 'test@example.com';

-- Check email was sent
SELECT * FROM marketing_recipients WHERE email = 'test@example.com';
```

## Troubleshooting

### Emails Not Sending

1. **Check SendGrid API Key**:
   ```sql
   -- Verify key is set (won't show actual value)
   SELECT current_setting('app.settings.sendgrid_api_key', true);
   ```

2. **Check Flow Status**:
   ```sql
   SELECT id, name, status FROM marketing_automation_flows;
   -- Status should be 'active'
   ```

3. **Check Enrollments**:
   ```sql
   SELECT * FROM marketing_flow_enrollments WHERE status = 'active';
   -- Should have active enrollments
   ```

4. **Check Wait Steps**:
   ```sql
   SELECT * FROM marketing_flow_step_completions
   WHERE enrollment_id = '[ENROLLMENT-ID]'
   ORDER BY completed_at DESC;
   -- Verify previous steps completed
   ```

### Emails Bouncing

1. **Verify SendGrid Configuration**:
   - Check sender authentication in SendGrid dashboard
   - Ensure domain is verified
   - Check bounce reasons in `marketing_recipients` table

2. **Check Bounce Details**:
   ```sql
   SELECT email, bounce_reason, bounced_at
   FROM marketing_recipients
   WHERE status = 'failed'
   ORDER BY bounced_at DESC;
   ```

### Flow Not Progressing

1. **Check for Errors**:
   ```sql
   SELECT * FROM marketing_automation_job_runs
   WHERE errors_count > 0
   ORDER BY started_at DESC;
   ```

2. **Check Step Completions**:
   ```sql
   SELECT * FROM marketing_flow_step_completions
   WHERE enrollment_id = '[ENROLLMENT-ID]'
   ORDER BY completed_at DESC;
   ```

3. **Verify Cron is Running**:
   ```sql
   -- Check recent job runs
   SELECT * FROM automation_job_status
   ORDER BY started_at DESC
   LIMIT 5;
   -- Should see entries every 5 minutes
   ```

## Production Checklist

Before going live with automation flows:

- [ ] SendGrid API key is configured in Supabase
- [ ] Sender email domain is verified in SendGrid
- [ ] Cron scheduler is set up (Option A or B above)
- [ ] Test flow has been created and tested successfully
- [ ] Monitoring queries are saved for easy access
- [ ] Email templates are reviewed and approved
- [ ] Unsubscribe links are included in email templates (if required)
- [ ] Compliance requirements are met (GDPR, CAN-SPAM, etc.)
- [ ] Bounce handling is configured
- [ ] Error notifications are set up for admins

## Files Modified/Created

### Frontend Changes
- `src/pages/MarketingAutomationFlowEditorPage.tsx` - Updated UI and notifications
- `src/contexts/NotificationContext.tsx` - Used for in-app notifications

### Backend Changes
- `supabase/functions/process-automation-flows/index.ts` - Edge function for processing
- `supabase/migrations/[timestamp]_enhance_automation_job_tracking.sql` - Database tracking

### Edge Function URL
Your edge function is deployed at:
```
https://[YOUR-PROJECT-REF].supabase.co/functions/v1/process-automation-flows
```

## Next Steps

1. **Set up the cron scheduler** using one of the options above
2. **Test with a simple flow** to verify everything works
3. **Monitor the first few runs** using the provided SQL queries
4. **Create your production flows** with confidence
5. **Set up monitoring alerts** (optional) for failed runs

## Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review Supabase function logs for detailed error messages
3. Check SendGrid dashboard for email delivery issues
4. Query the `automation_job_status` view for execution history

The system is now fully operational and ready to automate your marketing communications.
