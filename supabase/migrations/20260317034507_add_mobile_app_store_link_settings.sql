/*
  # Add Mobile App Store Link Settings

  1. New Settings
    - `ios_app_store_url` (text) - Apple App Store URL for AlfiePRO iOS app
    - `android_play_store_url` (text) - Google Play Store URL for AlfiePRO Android app
    - `app_deep_link_base` (text) - Base URL for deep links into the mobile app

  2. Category: `mobile_app`
    - These settings are managed from the Super Admin Platform Integrations page
    - Used by the member activation edge function when sending welcome emails

  3. Important Notes
    - Values default to empty strings and should be configured by super admins
    - The edge function falls back to placeholder URLs if not configured
*/

INSERT INTO platform_settings (key, value, category)
VALUES
  ('ios_app_store_url', '', 'mobile_app'),
  ('android_play_store_url', '', 'mobile_app'),
  ('app_deep_link_base', 'https://app.alfiepro.com', 'mobile_app')
ON CONFLICT (key) DO NOTHING;
