# AWS Custom Domain Automation System

Complete setup guide for automated custom domain management using AWS Amplify + Cloudflare.

## Overview

This system automatically handles:
- **Subdomains** (*.alfiepro.com.au) - Managed via Cloudflare
- **Custom Full Domains** (lmryc.com.au) - Managed via AWS Amplify

## Architecture

```
User Request
    ↓
Frontend (EnhancedDomainManagementSection)
    ↓
Supabase Edge Function: manage-cloudflare-dns
    ├─ Subdomain? → Cloudflare API → DNS Created ✓
    └─ Custom Domain? → manage-aws-amplify Function
                             ↓
                        AWS Amplify API
                             ↓
                        SSL Certificate Provisioned
                             ↓
                        check-amplify-ssl-status (polling)
                             ↓
                        Domain Status Updated
```

---

## Setup Instructions

### 1. AWS IAM User Setup

Create an IAM user with programmatic access for AWS Amplify API:

1. **Go to AWS IAM Console**
   - Navigate to: https://console.aws.amazon.com/iam/

2. **Create New User**
   - Click "Users" → "Create user"
   - Username: `amplify-domain-automation`
   - Access type: ✅ Programmatic access

3. **Attach Permissions**
   - Click "Attach policies directly"
   - Create a custom policy with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "amplify:CreateDomainAssociation",
        "amplify:GetDomainAssociation",
        "amplify:DeleteDomainAssociation",
        "amplify:UpdateDomainAssociation",
        "amplify:ListDomainAssociations"
      ],
      "Resource": "arn:aws:amplify:ap-southeast-2:*:apps/d13roi0uyfa9j/*"
    }
  ]
}
```

4. **Save Credentials**
   - Download the Access Key ID and Secret Access Key
   - **CRITICAL: Store these securely - you won't see the secret again!**

---

### 2. Configure Supabase Edge Functions Secrets

Set the AWS credentials as Supabase secrets:

```bash
# Using Supabase CLI
supabase secrets set AWS_ACCESS_KEY_ID="your_access_key_id"
supabase secrets set AWS_SECRET_ACCESS_KEY="your_secret_access_key"
```

**OR via Supabase Dashboard:**

1. Go to your project settings
2. Navigate to "Edge Functions" → "Secrets"
3. Add:
   - `AWS_ACCESS_KEY_ID` = your access key
   - `AWS_SECRET_ACCESS_KEY` = your secret key

---

### 3. Deploy Edge Functions

Deploy the three required edge functions:

```bash
# Deploy AWS Amplify management function
supabase functions deploy manage-aws-amplify

# Deploy Cloudflare DNS management function (already deployed)
supabase functions deploy manage-cloudflare-dns

# Deploy SSL status checker
supabase functions deploy check-amplify-ssl-status
```

---

### 4. Setup Automated SSL Polling (Optional but Recommended)

Create a cron job or scheduled function to check SSL status every 5 minutes:

**Option A: Using Supabase Cron Jobs**

Add to your database:

```sql
-- Create pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule SSL status checks every 5 minutes
SELECT cron.schedule(
  'check-amplify-ssl-status',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/check-amplify-ssl-status',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )
  )
  $$
);
```

**Option B: Using External Cron Service (like cron-job.org)**

- URL: `https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/check-amplify-ssl-status`
- Method: POST
- Headers: `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
- Schedule: Every 5 minutes

---

## How It Works

### Subdomain Workflow (*.alfiepro.com.au)

1. User enters subdomain (e.g., `lmryc`)
2. System creates CNAME in Cloudflare pointing to CloudFront
3. Domain is immediately active with SSL via Cloudflare
4. No manual DNS setup required

**Result:** `https://lmryc.alfiepro.com.au` works instantly ✓

---

### Custom Domain Workflow (e.g., lmryc.com.au)

1. **User enters custom domain**
   - Frontend: User enters `lmryc.com.au`
   - Click "Publish Website"

2. **System calls manage-cloudflare-dns**
   - Detects custom domain
   - Forwards to manage-aws-amplify

3. **AWS Amplify provisions domain**
   - Creates domain association in AWS Amplify
   - Generates SSL certificate verification DNS record
   - Returns DNS instructions to user

4. **User adds DNS records** (at their domain registrar)
   ```
   Type: CNAME
   Host: _<random-string-from-aws>
   Value: <verification-value-from-aws>

   Type: CNAME
   Host: www
   Value: d205ctqm5i025u.cloudfront.net
   ```

5. **AWS verifies and provisions SSL**
   - AWS Amplify checks DNS records
   - Issues SSL certificate (5-30 minutes)
   - Domain status: `pending` → `in_progress` → `available`

6. **Automated polling updates status**
   - `check-amplify-ssl-status` runs every 5 minutes
   - Checks domain status in AWS
   - Updates database when SSL is ready
   - Marks domain as `active`

**Result:** `https://lmryc.com.au` works with AWS-issued SSL ✓

---

## Database Schema

### amplify_custom_domains
Tracks custom domains in AWS Amplify:
- `domain_name` - The custom domain
- `domain_status` - pending | in_progress | available | failed
- `certificate_status` - pending | in_progress | issued | failed
- `amplify_domain_association_arn` - AWS ARN for management

### dns_records
Tracks all DNS records (both subdomain and custom):
- `is_custom_full_domain` - Boolean flag
- `amplify_domain_id` - Links to amplify_custom_domains
- `status` - Overall status
- `ssl_status` - SSL certificate status

---

## User Experience

### For Subdomains
1. Enter subdomain → Click publish → **Instant live site** ✓

### For Custom Domains
1. Enter custom domain → Click publish
2. See DNS instructions with copy buttons
3. Add DNS records at registrar
4. Wait 5-30 minutes for SSL
5. **Site goes live automatically** ✓

---

## Testing

### Test Subdomain
```bash
# Create subdomain
curl -X POST https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/manage-cloudflare-dns \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "record_type": "club_website",
    "entity_id": "test-id",
    "subdomain": "test-club"
  }'
```

### Test Custom Domain
```bash
# Add custom domain to AWS Amplify
curl -X POST https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/manage-aws-amplify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add_domain",
    "domain_name": "test.example.com",
    "entity_id": "test-id",
    "record_type": "club_website"
  }'
```

### Check SSL Status
```bash
curl -X POST https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/check-amplify-ssl-status \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

---

## Troubleshooting

### Custom Domain Not Working

1. **Check AWS Amplify Console**
   - Go to: https://console.aws.amazon.com/amplify/
   - Click your app → "Domain management"
   - Check domain status and SSL status

2. **Verify DNS Records**
   ```bash
   # Check if CNAME is resolving
   dig test.example.com CNAME
   ```

3. **Check Database Status**
   ```sql
   SELECT * FROM amplify_custom_domains
   WHERE domain_name = 'test.example.com';
   ```

4. **Check Edge Function Logs**
   - Go to Supabase Dashboard → Edge Functions → Logs
   - Check `manage-aws-amplify` and `check-amplify-ssl-status` logs

### SSL Taking Too Long

- **Normal:** 5-15 minutes
- **Delayed:** 30 minutes to 1 hour (if DNS propagation is slow)
- **Failed:** Check DNS records are correct at registrar

### Permission Errors

- Verify IAM user has correct permissions
- Check AWS credentials are set in Supabase secrets
- Verify Amplify App ID is correct: `d13roi0uyfa9j`

---

## Security Notes

- ✅ AWS credentials stored in Supabase secrets (encrypted)
- ✅ Only authenticated admins can add domains
- ✅ RLS policies protect all tables
- ✅ Service role key used for internal function calls only
- ❌ **Never expose AWS credentials in client code**

---

## Cost Considerations

### Cloudflare (Subdomains)
- **Free** - Unlimited subdomains under *.alfiepro.com.au

### AWS Amplify (Custom Domains)
- **$0.00** per month (included in Amplify hosting)
- **SSL certificates:** Free via AWS Certificate Manager
- **No per-domain charges**

**Total cost for custom domains:** $0 per domain ✓

---

## Future Enhancements

Potential improvements:
1. Auto-retry failed SSL provisioning
2. Email notifications when domain goes live
3. In-app SSL verification status display
4. Bulk domain import for associations
5. Custom DNS record management

---

## Summary

You now have a fully automated custom domain system:

- ✅ Subdomains work instantly via Cloudflare
- ✅ Custom domains automatically provisioned in AWS Amplify
- ✅ SSL certificates issued automatically
- ✅ Status polling keeps everything up-to-date
- ✅ Zero manual AWS console interaction needed
- ✅ $0 cost per domain

**Next Steps:**
1. Set AWS credentials in Supabase secrets
2. Deploy edge functions
3. Setup SSL polling (optional)
4. Test with a subdomain
5. Test with a custom domain
