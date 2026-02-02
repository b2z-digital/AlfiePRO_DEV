# Custom Domain Automation - Quick Start Checklist

## Prerequisites Completed ✓
- [x] AWS Amplify hosting configured
- [x] Wildcard SSL certificate (*.alfiepro.com.au)
- [x] Cloudflare DNS configured
- [x] CloudFront distribution: `d205ctqm5i025u.cloudfront.net`

---

## Setup Steps (Do Once)

### Step 1: Create AWS IAM User
- [ ] Go to AWS IAM Console
- [ ] Create user: `amplify-domain-automation`
- [ ] Attach custom policy for Amplify domain management
- [ ] Save Access Key ID and Secret Access Key

**Policy JSON:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "amplify:CreateDomainAssociation",
      "amplify:GetDomainAssociation",
      "amplify:DeleteDomainAssociation",
      "amplify:UpdateDomainAssociation",
      "amplify:ListDomainAssociations"
    ],
    "Resource": "arn:aws:amplify:ap-southeast-2:*:apps/d13roi0uyfa9j/*"
  }]
}
```

### Step 2: Set Supabase Secrets
- [ ] Set `AWS_ACCESS_KEY_ID` in Supabase Edge Functions secrets
- [ ] Set `AWS_SECRET_ACCESS_KEY` in Supabase Edge Functions secrets

**Via CLI:**
```bash
supabase secrets set AWS_ACCESS_KEY_ID="your_key"
supabase secrets set AWS_SECRET_ACCESS_KEY="your_secret"
```

### Step 3: Deploy Edge Functions
- [ ] Deploy `manage-aws-amplify`
- [ ] Deploy `manage-cloudflare-dns` (already done)
- [ ] Deploy `check-amplify-ssl-status`

**Via CLI:**
```bash
supabase functions deploy manage-aws-amplify
supabase functions deploy check-amplify-ssl-status
```

### Step 4: Setup SSL Polling (Optional)
- [ ] Configure cron job to run every 5 minutes
- [ ] Test polling function works

**Test command:**
```bash
curl -X POST https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/check-amplify-ssl-status \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

---

## How It Works Now

### ✅ Subdomains (*.alfiepro.com.au) - Instant
1. User enters subdomain
2. Click "Publish Website"
3. **Live immediately** with SSL

Example: `lmryc.alfiepro.com.au` → Works instantly

---

### ✅ Custom Domains (e.g., lmryc.com.au) - Automated
1. User enters custom domain
2. Click "Publish Website"
3. System adds domain to AWS Amplify
4. User adds DNS records shown in UI
5. AWS provisions SSL (5-30 min)
6. **Site goes live automatically**

Example: `lmryc.com.au` → User adds DNS → Auto-live in 5-30 min

---

## Testing

### Test Subdomain (Should Work Now)
1. Go to club/event settings
2. Enter subdomain: `test-club`
3. Click "Publish Website"
4. ✅ Should be live immediately

### Test Custom Domain (After AWS Setup)
1. Enter custom domain: `test.yourdomain.com`
2. Click "Publish Website"
3. Copy DNS instructions shown
4. Add DNS records at registrar
5. Wait 5-30 minutes
6. ✅ Should go live automatically

---

## Verification

### Check Everything Works:
```bash
# 1. Check database migration applied
# Should see: amplify_custom_domains table exists
psql $DATABASE_URL -c "\dt amplify_custom_domains"

# 2. Check edge functions deployed
# Should see: manage-aws-amplify, check-amplify-ssl-status
supabase functions list

# 3. Check secrets set
# Should see: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
supabase secrets list

# 4. Test subdomain creation
# Should return: success: true
curl -X POST https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/manage-cloudflare-dns \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"action":"create","record_type":"club_website","entity_id":"test","subdomain":"testclub"}'
```

---

## Current Status

**What Works Now:**
- ✅ Subdomains (*.alfiepro.com.au) - Fully automated
- ✅ Database schema created
- ✅ Edge functions created
- ✅ Frontend UI updated

**What Needs AWS Credentials:**
- ⏳ Custom domain automation (needs AWS IAM user)
- ⏳ SSL status polling (needs deployed function)

**Once AWS is setup:**
- ✅ Full automation for custom domains
- ✅ Zero manual AWS console interaction
- ✅ $0 cost per domain

---

## Support

**Issue:** Custom domain not working
**Solution:** Check AWS Amplify console → Domain management

**Issue:** SSL taking too long
**Solution:** Normal is 5-30 min, check DNS propagated with `dig`

**Issue:** Permission errors
**Solution:** Verify IAM policy is correct and secrets are set

---

## Summary

Your domain automation system is ready! Just need to:

1. ✅ Create AWS IAM user (one-time, 5 min)
2. ✅ Set Supabase secrets (one-time, 2 min)
3. ✅ Deploy edge functions (one-time, 2 min)
4. ✅ Setup polling (optional, 5 min)

**Total setup time:** ~15 minutes

**Then enjoy:**
- Instant subdomains
- Automated custom domains
- Zero ongoing maintenance
- $0 per domain cost

🎉 You're all set!
