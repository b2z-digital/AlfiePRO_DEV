# Facebook & Instagram Integration - Final Setup Steps

## ✅ Completed
- Facebook App ID added to `.env`: **2155849474875816**
- Instagram App ID added to `.env`: **2155849474875816** (same as Facebook)

## 🔴 Required: Get Your App Secret

You need to get the **App Secret** from Facebook Developer Console:

1. **Go to Facebook Developer Console**:
   - Visit: https://developers.facebook.com/apps/2155849474875816/settings/basic/

2. **Get App Secret**:
   - Find the "App Secret" field
   - Click **"Show"** button
   - Copy the secret (it will be a long string like `a1b2c3d4e5f6...`)

## 🔴 Required: Set Supabase Edge Function Secrets

Once you have the App Secret, you need to set these secrets in Supabase:

### Using Supabase Dashboard (Recommended):

1. Go to: https://supabase.com/dashboard/project/ehgbpdqbsykhepuwdgrj/settings/functions
2. Scroll to "Secrets" section
3. Add these secrets:

   | Secret Name | Value |
   |------------|--------|
   | `FACEBOOK_APP_ID` | `2155849474875816` |
   | `FACEBOOK_APP_SECRET` | `[Your App Secret from step above]` |
   | `INSTAGRAM_APP_ID` | `2155849474875816` |
   | `INSTAGRAM_APP_SECRET` | `[Same as Facebook App Secret]` |

### OR Using Supabase CLI (if you have it installed):

```bash
# Set Facebook secrets
supabase secrets set FACEBOOK_APP_ID=2155849474875816
supabase secrets set FACEBOOK_APP_SECRET=your-app-secret-here

# Set Instagram secrets (same values)
supabase secrets set INSTAGRAM_APP_ID=2155849474875816
supabase secrets set INSTAGRAM_APP_SECRET=your-app-secret-here
```

## 📋 Configure Facebook App Settings

### 1. Add OAuth Redirect URIs

In your Facebook App dashboard:
- Go to **Products** > **Facebook Login** > **Settings**
- Add these to **Valid OAuth Redirect URIs**:
  ```
  https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/facebook-oauth-callback
  https://ehgbpdqbsykhepuwdgrj.supabase.co/functions/v1/instagram-oauth-callback
  ```
- Save changes

### 2. Configure App Domains

- Go to **Settings** > **Basic**
- Add your domain to **App Domains**: `yourdomain.com` (your actual domain)
- Add **Site URL**: `https://yourdomain.com`

### 3. Request Required Permissions

For your app to work in production, you need to request these permissions in **App Review**:

**For Facebook:**
- `pages_show_list` - List pages the user manages
- `pages_read_engagement` - Read page data
- `pages_manage_posts` - Post to pages

**For Instagram:**
- `instagram_basic` - Basic Instagram profile info
- `instagram_content_publish` - Publish content to Instagram

### 4. Switch to Live Mode

When you're ready for production:
- Go to **Settings** > **Basic**
- Toggle the app status from "In Development" to "Live"
- Note: You'll need to complete App Review first

## 🧪 Testing the Integration

### Facebook Test:
1. Log into your application
2. Go to **Settings** > **Integrations**
3. Click **Connect Facebook**
4. Authorize the app
5. Select a Facebook Page to connect

### Instagram Test:
1. Make sure your Facebook account is connected to an Instagram Business account
2. Go to **Settings** > **Integrations**
3. Click **Connect Instagram**
4. Authorize the app
5. Select an Instagram account to connect

## 🚨 Important Notes

1. **Development Mode Restrictions**:
   - While your app is in "Development" mode, only you and added test users can authenticate
   - Add test users in **Roles** > **Test Users**

2. **Instagram Requirements**:
   - Must be an Instagram Business or Creator account
   - Must be linked to a Facebook Page
   - Cannot use personal Instagram accounts

3. **Token Expiration**:
   - Access tokens expire after 60 days
   - The app will need to refresh tokens automatically
   - Make sure your edge functions handle token refresh

## ✅ Verification Checklist

- [ ] App Secret obtained from Facebook Developer Console
- [ ] Supabase secrets configured for Facebook (APP_ID and APP_SECRET)
- [ ] Supabase secrets configured for Instagram (APP_ID and APP_SECRET)
- [ ] OAuth Redirect URIs added to Facebook App
- [ ] App Domains configured
- [ ] Facebook Login product added to app
- [ ] Required permissions requested (for production)
- [ ] Tested Facebook connection in development
- [ ] Tested Instagram connection in development

## 🆘 Troubleshooting

### "Invalid OAuth Redirect URI" Error
- Make sure the redirect URIs in Facebook App Settings match exactly
- Check for typos or missing `/` at the end

### "This app is in development mode" Error
- Add yourself as a test user in Facebook App Settings
- OR switch app to Live mode (requires App Review)

### "Instagram account not found" Error
- Ensure Instagram account is a Business or Creator account
- Verify Instagram is connected to a Facebook Page

### Edge Function Errors
- Check Supabase Function Logs for detailed error messages
- Verify secrets are set correctly (no extra spaces or quotes)

## 📚 Additional Resources

- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login)
- [Instagram Basic Display API](https://developers.facebook.com/docs/instagram-basic-display-api)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
