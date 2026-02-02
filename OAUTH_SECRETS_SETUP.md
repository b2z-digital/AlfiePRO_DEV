# OAuth Integration Secret Keys Setup

This document provides the exact secret key names and values you need to configure in your Supabase project for all OAuth integrations.

## YouTube (AlfiePRO Default Channel)

These credentials are for the default AlfiePRO YouTube account that will be automatically connected to all clubs.

### Required Supabase Secrets:

```
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_DEFAULT_ACCESS_TOKEN
YOUTUBE_DEFAULT_REFRESH_TOKEN
YOUTUBE_DEFAULT_CHANNEL_ID
YOUTUBE_DEFAULT_CHANNEL_NAME
```

### How to Get These Values:

1. **Client ID & Secret** (Already have these):
   - Already configured: `230273275079-723coi1ukfg2vngapur5djnug1cer6hd.apps.googleusercontent.com`
   - Get from: https://console.cloud.google.com/apis/credentials

2. **Access Token, Refresh Token, Channel ID, Channel Name**:
   - You need to perform one-time OAuth flow for alfie.pro.au@gmail.com
   - Use OAuth 2.0 Playground: https://developers.google.com/oauthplayground/
   - Steps:
     1. Enter your Client ID and Secret in settings (gear icon)
     2. Select YouTube Data API v3 scopes
     3. Authorize with alfie.pro.au@gmail.com
     4. Exchange code for tokens
     5. Copy the access_token and refresh_token
   - For Channel ID and Name:
     - Use the access token to call: `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`
     - Extract `id` and `snippet.title` from the response

---

## Facebook Integration

### Required Supabase Secrets:

```
FACEBOOK_APP_ID
FACEBOOK_APP_SECRET
```

### How to Get These Values:

1. **Create Facebook App**:
   - Go to: https://developers.facebook.com/apps/
   - Click "Create App"
   - Choose "Business" type
   - Give it a name like "Alfie Yacht Club Manager"

2. **Configure App**:
   - In the dashboard, go to **Settings > Basic**
   - Copy the **App ID** → This is your `FACEBOOK_APP_ID`
   - Click "Show" next to **App Secret** → This is your `FACEBOOK_APP_SECRET`

3. **Add Facebook Login Product**:
   - In dashboard sidebar, click **Add Product**
   - Find **Facebook Login** and click "Set Up"
   - In **Facebook Login > Settings**:
     - Add Valid OAuth Redirect URIs: `https://yourdomain.com/integrations`
     - Save changes

4. **Request Permissions**:
   - In **App Review > Permissions and Features**
   - Request these permissions:
     - `pages_show_list` - To list pages user manages
     - `pages_read_engagement` - To read page data
     - `pages_manage_posts` - To post to pages
   - Submit for review (required for production)

5. **Add Environment Variable** (Frontend):
   - Update `.env` file:
     ```
     VITE_FACEBOOK_APP_ID=your-actual-app-id
     ```

---

## Instagram Integration

Instagram uses the same Facebook app credentials, but requires additional setup.

### Required Supabase Secrets:

```
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
```

**Note**: These are the SAME as Facebook App ID and Secret!

### How to Get These Values:

1. **Use Same Facebook App**:
   - Instagram Basic Display API uses Facebook App credentials
   - `INSTAGRAM_APP_ID` = Your `FACEBOOK_APP_ID`
   - `INSTAGRAM_APP_SECRET` = Your `FACEBOOK_APP_SECRET`

2. **Add Instagram Product**:
   - In your Facebook App dashboard
   - Click **Add Product**
   - Find **Instagram Basic Display** and click "Set Up"

3. **Configure Instagram Display**:
   - Go to **Instagram Basic Display > Settings**
   - Add Valid OAuth Redirect URIs: `https://yourdomain.com/integrations`
   - In **User Token Generator**, click "Add or Remove Instagram Testers"
   - Add your Instagram account as a tester

4. **Request Permissions**:
   - Basic permissions needed:
     - `user_profile` - Access profile data
     - `user_media` - Access media (photos/videos)

5. **Add Environment Variable** (Frontend):
   - Update `.env` file:
     ```
     VITE_INSTAGRAM_APP_ID=your-actual-app-id
     ```

---

## Google Integration (Calendar/Profile)

### Required Supabase Secrets:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### How to Get These Values:

1. **Use Existing Google Cloud Project**:
   - You already have: `230273275079-723coi1ukfg2vngapur5djnug1cer6hd.apps.googleusercontent.com`
   - Same as YouTube credentials
   - If you need to create new ones:
     - Go to: https://console.cloud.google.com/apis/credentials
     - Create OAuth 2.0 Client ID

2. **Configure OAuth Consent Screen**:
   - Add scopes:
     - `userinfo.email`
     - `userinfo.profile`
     - `calendar` (for calendar sync)

3. **Add Redirect URI**:
   - In OAuth Client settings
   - Add: `https://yourdomain.com/integrations`

---

## Setting Secrets in Supabase

### Via Supabase Dashboard:

1. Go to your project: https://supabase.com/dashboard/project/ehgbpdqbsykhepuwdgrj
2. Click **Edge Functions** in sidebar
3. Click **Manage secrets**
4. Add each secret with format: `NAME=value`
5. Click **Save**

### Via Supabase CLI:

```bash
supabase secrets set FACEBOOK_APP_ID=your-app-id
supabase secrets set FACEBOOK_APP_SECRET=your-app-secret
supabase secrets set INSTAGRAM_APP_ID=your-app-id
supabase secrets set INSTAGRAM_APP_SECRET=your-app-secret
supabase secrets set GOOGLE_CLIENT_ID=your-client-id
supabase secrets set GOOGLE_CLIENT_SECRET=your-client-secret

# YouTube Default Account
supabase secrets set YOUTUBE_DEFAULT_ACCESS_TOKEN=your-token
supabase secrets set YOUTUBE_DEFAULT_REFRESH_TOKEN=your-refresh-token
supabase secrets set YOUTUBE_DEFAULT_CHANNEL_ID=your-channel-id
supabase secrets set YOUTUBE_DEFAULT_CHANNEL_NAME="AlfiePRO"
```

---

## Quick Summary

**Minimum Required for Each Platform:**

| Platform | Secrets Needed | Where to Get |
|----------|---------------|--------------|
| **YouTube (Auto)** | 6 secrets | Google Cloud Console + OAuth Playground |
| **Facebook** | 2 secrets | Facebook Developers |
| **Instagram** | 2 secrets | Same as Facebook App |
| **Google** | 2 secrets | Already have (same as YouTube) |

**Total Unique Credentials Needed:**
- 1 Facebook App (covers Facebook + Instagram)
- 1 Google Project (already have, covers YouTube + Google services)

---

## Testing After Setup

1. **YouTube**: Click toggle → Should auto-connect to AlfiePRO channel
2. **Facebook**: Click toggle → Redirects to Facebook OAuth → Shows real pages to select
3. **Instagram**: Click toggle → Redirects to Instagram OAuth → Connects account
4. **Google**: Click toggle → Redirects to Google OAuth → Connects calendar

All clubs will share the same YouTube channel (AlfiePRO) but can have their own Facebook pages and Instagram accounts.
