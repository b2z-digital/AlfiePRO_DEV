/*
  # Update app deep link base URL to use custom URL scheme

  1. Changes
    - Update `app_deep_link_base` from `https://app.alfiepro.com` to `alfiepro://`
    - This matches the mobile app's configured custom URL scheme

  2. Important Notes
    - The mobile app uses `alfiepro://` as its custom URL scheme (configured in app.json)
    - Deep links will now be in the format: `alfiepro://activate?token=XXX&email=XXX`
    - The `alfiepro://` scheme works when the app is installed on a device
    - Once apps are published to stores, universal links can be added as a fallback
*/

UPDATE platform_settings
SET value = 'alfiepro://'
WHERE key = 'app_deep_link_base' AND category = 'mobile_app';
