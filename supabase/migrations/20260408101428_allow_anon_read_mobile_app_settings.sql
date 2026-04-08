/*
  # Allow Anonymous Users to Read Mobile App Settings

  1. Security Changes
    - Add SELECT policy on `platform_settings` for anonymous (unauthenticated) users
      but only for rows where `category = 'mobile_app'`
    - This allows the login page to show app store download links to mobile visitors

  2. Important Notes
    - Only mobile_app category is exposed, not other platform settings
    - Write access remains restricted to super admins only
*/

CREATE POLICY "Anonymous users can read mobile app settings"
  ON platform_settings FOR SELECT TO anon
  USING (category = 'mobile_app');
