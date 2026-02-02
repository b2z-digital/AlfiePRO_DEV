# Email Notification System Deployment Guide

## Quick Setup (Required for Notifications to Work)

**IMPORTANT**: The notification system requires email service configuration to work properly. Follow these steps:

### 1. Deploy the Edge Function
```bash
supabase functions deploy send-notification
```

### 2. Configure Email Service (Choose One)

#### Option A: Resend (Recommended)
```bash
supabase secrets set EMAIL_SERVICE=resend
supabase secrets set RESEND_API_KEY=your_resend_api_key_here
supabase secrets set DEFAULT_FROM_EMAIL=noreply@yourclub.com
```

#### Option B: Skip Email (Notifications Only)
If you only want in-app notifications without emails:
```bash
supabase secrets set EMAIL_SERVICE=""
```

### 3. Redeploy the Function
```bash
supabase functions deploy send-notification
```

## 1. Deploy the Supabase Edge Function

### Prerequisites
- Supabase CLI installed
- Authenticated with your Supabase project

### Deploy Command
```bash
supabase functions deploy send-membership-notifications
```

If you don't have Supabase CLI installed:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

## 2. Configure Email Service Provider

Choose one of the following email service providers:

### Option A: Resend (Recommended - Simple & Reliable)

1. **Sign up at [resend.com](https://resend.com)**
2. **Get your API key** from the dashboard
3. **Set environment variable** in Supabase:
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_api_key_here
   supabase secrets set EMAIL_SERVICE=resend
   ```

### Option B: SendGrid

1. **Sign up at [sendgrid.com](https://sendgrid.com)**
2. **Create an API key** with Mail Send permissions
3. **Set environment variables**:
   ```bash
   supabase secrets set SENDGRID_API_KEY=SG.your_api_key_here
   supabase secrets set EMAIL_SERVICE=sendgrid
   ```

### Option C: Mailgun

1. **Sign up at [mailgun.com](https://mailgun.com)**
2. **Get your API key and domain** from the dashboard
3. **Set environment variables**:
   ```bash
   supabase secrets set MAILGUN_API_KEY=your_api_key_here
   supabase secrets set MAILGUN_DOMAIN=your_domain.mailgun.org
   supabase secrets set EMAIL_SERVICE=mailgun
   ```

## 3. Configure From Email Address

Set the default from email address for your club:
```bash
supabase secrets set DEFAULT_FROM_EMAIL="noreply@yourclub.com"
```

## 4. Test the System

### Test Email Sending
1. Go to your membership dashboard
2. Create a test membership application
3. Approve the application - this should trigger a welcome email
4. Check the `email_logs` table in your database to verify emails are being logged

### Test Renewal Reminders
1. In the membership applications manager, click "Send Renewal Reminders"
2. Check the response to see how many reminders were sent
3. Verify in the `email_logs` table

## 5. Email Service Provider Comparison

| Provider | Pros | Cons | Free Tier |
|----------|------|------|-----------|
| **Resend** | Simple API, great deliverability, developer-friendly | Newer service | 3,000 emails/month |
| **SendGrid** | Established, reliable, good analytics | More complex setup | 100 emails/day |
| **Mailgun** | Powerful features, good for high volume | Complex pricing | 5,000 emails/month |

## 6. Email Templates

The system includes default templates for all email types, but you can customize them by:

1. **Adding custom templates** to the `email_templates` table in your database
2. **Using these template keys**:
   - `welcome`
   - `application_approved`
   - `application_rejected`
   - `renewal_reminder`
   - `payment_confirmation`
   - `membership_expired`

Example custom template:
```sql
INSERT INTO email_templates (club_id, template_key, subject, body)
VALUES (
  'your-club-id',
  'welcome',
  'Welcome to {{club_name}}!',
  '<h1>Welcome {{member_name}}!</h1><p>We are excited to have you as a member of {{club_name}}.</p>'
);
```

## 7. Monitoring and Troubleshooting

### Check Email Logs
```sql
SELECT * FROM email_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Check Failed Emails
```sql
SELECT * FROM email_logs 
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### View Function Logs
In Supabase Dashboard:
1. Go to Edge Functions
2. Click on `send-membership-notifications`
3. View the Logs tab for debugging

## 8. Production Considerations

1. **Domain Authentication**: Set up SPF, DKIM, and DMARC records for better deliverability
2. **Rate Limiting**: Consider implementing rate limiting for bulk operations
3. **Monitoring**: Set up alerts for failed emails
4. **Backup**: Regularly backup your email templates
5. **Compliance**: Ensure emails comply with CAN-SPAM and GDPR requirements

## 9. Common Issues and Solutions

### Issue: "RESEND_API_KEY environment variable is not set"
**Solution**: Make sure you've set the environment variable and redeployed the function

### Issue: Emails not being sent
**Solution**: 
1. Check the function logs in Supabase dashboard
2. Verify your API keys are correct
3. Check your email service provider's dashboard for any issues

### Issue: Emails going to spam
**Solution**:
1. Set up proper domain authentication (SPF, DKIM)
2. Use a verified domain for your from address
3. Avoid spam trigger words in subject lines

## 10. Next Steps

After deployment, you can:
1. **Customize email templates** for your club's branding
2. **Set up automated renewal reminders** using Supabase cron jobs
3. **Add email analytics** to track open rates and clicks
4. **Implement email preferences** for members