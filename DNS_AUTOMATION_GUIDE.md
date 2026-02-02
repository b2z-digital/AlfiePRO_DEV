# DNS Automation Solution for AlfiePRO

## Overview

This guide documents the complete DNS automation solution for AlfiePRO that enables clubs and event organizers to publish their websites with automatic subdomain provisioning through Cloudflare DNS integration.

## Architecture

### Components

1. **Database Layer**
   - `cloudflare_config` table: Stores Cloudflare API credentials
   - `dns_records` table: Tracks all DNS records created
   - Enhanced `clubs` and `event_websites` tables with domain fields

2. **Backend Layer**
   - `manage-cloudflare-dns` Edge Function: Handles all DNS operations
   - Cloudflare API integration for automated record creation

3. **Frontend Layer**
   - `DomainManagementSection` component: Universal DNS configuration UI
   - Integrated into Club Website Settings and Event Website Settings

## Features

### Automated Subdomain Creation

- **Default Subdomain**: Uses club abbreviation (e.g., `lmryc.alfiepro.com.au`)
- **Custom Subdomain**: Allows clubs to choose their own subdomain
- **One-Click Publishing**: Automatic DNS record creation on button click
- **Real-time Verification**: Built-in domain verification system

### Custom Domain Support

- Full support for custom domains (e.g., `www.yourclub.com`)
- Automatic DNS instructions generation
- Visual DNS setup guide with copy-to-clipboard functionality
- Support for both A and CNAME records

### Security

- Row Level Security (RLS) on all tables
- API token encryption in database
- Admin-only access to DNS management
- Secure Edge Function with JWT verification

## Setup Instructions

### 1. Cloudflare Configuration

#### Get Your Cloudflare Credentials

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your domain (`alfiepro.com.au`)
3. Get your **Zone ID**:
   - Go to Overview
   - Scroll down to find "Zone ID" on the right sidebar
   - Copy this value

4. Create an **API Token**:
   - Go to Profile → API Tokens
   - Click "Create Token"
   - Use the "Edit zone DNS" template
   - Configure permissions:
     - Zone → DNS → Edit
     - Zone Resources → Include → Specific zone → `alfiepro.com.au`
   - Create the token and copy it immediately (won't be shown again)

#### Configure in Supabase

The Edge Function automatically uses environment variables. The system administrator needs to configure these in Supabase:

```bash
# Set these as Supabase secrets
CLOUDFLARE_ZONE_ID=your_zone_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here
```

### 2. DNS Requirements

#### For Subdomain Publishing (Automatic)

No additional configuration needed. The system automatically creates:
- Type: `CNAME`
- Name: `{subdomain}` (e.g., `lmryc`)
- Target: `alfiepro.com.au`
- TTL: `3600`

#### For Custom Domain (Manual Setup Required)

Users must add these records to their domain's DNS:

**A Record:**
```
Type: A
Host: @
Value: 76.76.21.21
TTL: 3600
```

**CNAME Record:**
```
Type: CNAME
Host: www
Target: alfiepro.com.au
TTL: 3600
```

## Usage

### For Club Websites

1. Navigate to **Settings → Website → Domain Management**
2. Choose between:
   - **Use Subdomain**: Auto-generated from club abbreviation
   - **Custom Domain**: Enter your own domain
3. Click **"Publish Website"**
4. Wait for verification (automatic for subdomains)
5. If using custom domain, follow the DNS instructions displayed

### For Event Websites

1. Open Event Website Settings
2. Scroll to **Domain Management** section
3. Choose subdomain or custom domain
4. Click **"Publish Website"**
5. Domain is automatically configured

## API Reference

### Edge Function: `manage-cloudflare-dns`

**Endpoint**: `/functions/v1/manage-cloudflare-dns`

**Authentication**: Requires Bearer token

#### Actions

##### Create DNS Record

```json
{
  "action": "create",
  "record_type": "club_website" | "event_website",
  "entity_id": "uuid",
  "subdomain": "your-subdomain",
  "custom_domain": "www.yourdomain.com" // optional
}
```

##### Delete DNS Record

```json
{
  "action": "delete",
  "record_type": "club_website" | "event_website",
  "entity_id": "uuid",
  "dns_record_id": "uuid"
}
```

##### Verify DNS Record

```json
{
  "action": "verify",
  "record_type": "club_website" | "event_website",
  "entity_id": "uuid",
  "subdomain": "your-subdomain"
}
```

##### List DNS Records

```json
{
  "action": "list",
  "record_type": "club_website" | "event_website",
  "entity_id": "uuid"
}
```

## Database Schema

### cloudflare_config

```sql
CREATE TABLE cloudflare_config (
  id uuid PRIMARY KEY,
  organization_type text,
  organization_id uuid,
  zone_id text NOT NULL,
  api_token_encrypted text NOT NULL,
  base_domain text DEFAULT 'alfiepro.com.au',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
);
```

### dns_records

```sql
CREATE TABLE dns_records (
  id uuid PRIMARY KEY,
  record_type text, -- 'club_website' or 'event_website'
  entity_id uuid,
  subdomain text,
  full_domain text,
  cloudflare_record_id text,
  dns_type text DEFAULT 'CNAME',
  dns_target text,
  status domain_status, -- 'pending', 'active', 'failed', 'custom'
  verified_at timestamptz,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid
);
```

### Enhanced Tables

#### clubs
```sql
ALTER TABLE clubs ADD COLUMN:
  - subdomain_slug text UNIQUE
  - custom_domain text
  - domain_status domain_status DEFAULT 'pending'
  - dns_verified_at timestamptz
```

#### event_websites
```sql
ALTER TABLE event_websites ADD COLUMN:
  - subdomain_slug text UNIQUE
  - custom_domain text
  - domain_status domain_status DEFAULT 'pending'
  - dns_verified_at timestamptz
```

## Subdomain Validation Rules

- Minimum length: 3 characters
- Maximum length: 63 characters
- Allowed characters: lowercase letters, numbers, hyphens
- Must start and end with alphanumeric character
- Cannot use reserved words: `www`, `api`, `admin`, `mail`, `ftp`, `smtp`, `pop`, `imap`, `localhost`, `staging`, `dev`, `test`

## Status Flow

### For Subdomain Publishing

1. **pending** → User hasn't published yet
2. **active** → DNS record created and verified
3. **failed** → DNS creation failed (rare)

### For Custom Domain

1. **pending** → User hasn't configured
2. **custom** → Custom domain configured, waiting for DNS setup
3. **active** → Domain verified and working

## Troubleshooting

### "Failed to create DNS record"

**Possible causes:**
- Invalid Cloudflare credentials
- Zone ID mismatch
- API token lacks permissions
- Subdomain already exists

**Solutions:**
- Verify Cloudflare credentials in Supabase secrets
- Check API token permissions
- Try a different subdomain

### "Domain not yet accessible"

**Possible causes:**
- DNS propagation delay (can take up to 48 hours)
- Incorrect DNS records
- SSL certificate not yet issued

**Solutions:**
- Wait 5-10 minutes and click "Verify" again
- Check DNS records using online DNS checker
- For custom domains, verify A and CNAME records are correct

### Subdomain Already Taken

**Solution:**
- Choose a different subdomain
- Check if another club/event is using that subdomain
- Contact support if you believe it's incorrectly assigned

## SSL/TLS Configuration

### Automatic SSL (Subdomains)

For `*.alfiepro.com.au` subdomains:
- SSL certificates are automatically provisioned
- Cloudflare manages certificate renewal
- HTTPS is enforced automatically

### Custom Domain SSL

For custom domains:
- User must configure SSL through their domain provider OR
- Use Cloudflare's free SSL after adding domain to Cloudflare
- AlfiePRO can provide Cloudflare setup assistance

## Future Enhancements

Potential improvements:
1. Wildcard DNS record support
2. Automatic SSL certificate provisioning for custom domains
3. DNS health monitoring and alerts
4. Batch subdomain creation for associations
5. DNS record backup and migration tools
6. Custom nameserver support
7. Advanced DNS configuration (SPF, DKIM, DMARC)

## Support

For DNS-related issues:
1. Check this guide first
2. Use the "Verify" button to test domain status
3. Review error messages in the UI
4. Contact technical support with:
   - Club/Event name
   - Subdomain or custom domain being used
   - Error message (if any)
   - Screenshot of DNS configuration

## Best Practices

1. **Use Abbreviations**: Keep subdomains short and memorable
2. **Test First**: Use subdomain before setting up custom domain
3. **DNS Changes**: Allow 24 hours for custom domain DNS propagation
4. **Documentation**: Save DNS instructions provided by the system
5. **Verification**: Always verify domain after setup
6. **Updates**: If changing domains, wait for old DNS to clear first

## Costs

- **Cloudflare DNS**: Free tier supports this solution
- **Subdomain Publishing**: Included with AlfiePRO subscription
- **Custom Domains**: No additional AlfiePRO fees (domain registration fees apply if purchasing new domain)

## Technical Notes

### Edge Function Location
- Function name: `manage-cloudflare-dns`
- Path: `/supabase/functions/manage-cloudflare-dns/index.ts`
- Runtime: Deno
- Region: Auto (deployed globally)

### Component Location
- Main component: `/src/components/settings/DomainManagementSection.tsx`
- Integration: Club Settings and Event Website Settings

### Migration Files
- Initial migration: `create_cloudflare_dns_integration.sql`
- Applied: [Timestamp will be in filename]

## Security Considerations

1. **API Tokens**: Never expose in frontend code
2. **RLS Policies**: All tables have proper Row Level Security
3. **Admin Access**: Only admins can manage DNS records
4. **Validation**: All inputs are validated and sanitized
5. **Rate Limiting**: Consider implementing for production use
6. **Audit Trail**: All DNS changes are logged with user ID

## Monitoring

Recommended monitoring:
- Track DNS record creation success rate
- Monitor Cloudflare API quota usage
- Alert on failed DNS operations
- Track domain verification rates
- Monitor SSL certificate issues

---

**Document Version**: 1.0
**Last Updated**: November 22, 2025
**Maintained By**: AlfiePRO Development Team
