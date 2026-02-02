# Task Reminder System Setup

## Overview
The task reminder system automatically sends email notifications to members assigned to race document creation tasks at key intervals:
- **1 week before** due date
- **3 days before** due date
- **On due date**
- **When overdue** (up to 7 days)

## Components

### 1. Database Schema
- `club_tasks.last_reminder_sent` - Tracks when last reminder was sent
- `club_tasks.reminder_schedule` - JSON object tracking all reminder history
- Tasks with `send_reminder = true` and `task_type` starting with `document_` are eligible

### 2. Edge Function
**Function:** `send-task-reminders`
**URL:** `{SUPABASE_URL}/functions/v1/send-task-reminders`

This function:
- Queries all document tasks with approaching or overdue due dates
- Checks reminder schedule to avoid duplicates
- Sends formatted HTML emails to assignees and contributors
- Updates `last_reminder_sent` timestamp

### 3. Email Integration
The edge function is **ready for email service integration**. Currently it logs emails but doesn't send them.

To enable email sending, integrate with your preferred service in the edge function:

#### Option A: SendGrid
```typescript
await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: member.email }] }],
    from: { email: 'noreply@alfie.app' },
    subject: emailBody.subject,
    content: [{ type: 'text/html', value: emailBody.html }]
  })
});
```

#### Option B: Resend
```typescript
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    from: 'Alfie <noreply@alfie.app>',
    to: [member.email],
    subject: emailBody.subject,
    html: emailBody.html
  })
});
```

## Automation Setup

### Manual Trigger
You can manually trigger the reminder check by calling the edge function:

```bash
curl -X POST \
  {SUPABASE_URL}/functions/v1/send-task-reminders \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json"
```

### Automated Schedule (Recommended)

#### Option 1: GitHub Actions (Recommended)
Create `.github/workflows/task-reminders.yml`:

```yaml
name: Daily Task Reminders

on:
  schedule:
    - cron: '0 9 * * *'  # Run at 9 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Task Reminders
        run: |
          curl -X POST \
            ${{ secrets.SUPABASE_URL }}/functions/v1/send-task-reminders \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
```

Add these secrets to your GitHub repository:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

#### Option 2: Vercel Cron
If deployed on Vercel, add `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/task-reminders",
    "schedule": "0 9 * * *"
  }]
}
```

Create `api/task-reminders.ts`:

```typescript
export default async function handler(req, res) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/send-task-reminders`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();
  res.status(200).json(data);
}
```

#### Option 3: External Cron Service
Use services like:
- **Cron-job.org** - Free, reliable
- **EasyCron** - Feature-rich
- **UptimeRobot** - Monitor + trigger

Set them to call your edge function URL daily.

## Email Template
The system sends beautifully formatted HTML emails with:
- Color-coded urgency (blue → orange → red)
- Task details and description
- Due date and priority
- Direct link to task in Alfie
- Responsive design for mobile

## Testing

### Test the edge function:
```bash
curl -X POST \
  {SUPABASE_URL}/functions/v1/send-task-reminders \
  -H "Authorization: Bearer {ANON_KEY}"
```

### Check logs:
```bash
supabase functions logs send-task-reminders
```

### Create test task:
```sql
INSERT INTO club_tasks (
  title, description, due_date, status, priority,
  club_id, created_by, send_reminder, task_type
) VALUES (
  'Test Document Task',
  'Testing reminder system',
  CURRENT_DATE + INTERVAL '3 days',
  'pending',
  'high',
  '{your-club-id}',
  '{your-user-id}',
  true,
  'document_nor'
);
```

## Monitoring
- Check `last_reminder_sent` timestamps in database
- Review `reminder_schedule` JSON for history
- Monitor edge function logs for email send status
- Track email delivery rates in your email service dashboard

## Customization
Edit the edge function to customize:
- Email templates and styling
- Reminder intervals and frequency
- Which task types get reminders
- Additional notification channels (SMS, Slack, etc.)

## Troubleshooting

### No emails received
1. Check task has `send_reminder = true`
2. Verify `due_date` is set
3. Check members have valid email addresses
4. Verify email service integration is configured
5. Check edge function logs for errors

### Duplicate reminders
The system tracks reminders in `reminder_schedule` to prevent duplicates. If you see duplicates:
1. Check the JSON structure in `reminder_schedule`
2. Verify `last_reminder_sent` is updating correctly
3. Review edge function logic for reminder type detection

### Missing reminders
1. Ensure automation is running (check cron/GitHub Actions)
2. Verify edge function is deployed
3. Check task due dates are in the future
4. Review edge function logs for errors
