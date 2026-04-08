/*
  # Allow Authenticated Users to Read Mobile App Settings

  1. Security Changes
    - Add SELECT policy on `platform_settings` for all authenticated users
      but only for rows where `category = 'mobile_app'`
    - This allows the mobile app download screen to fetch iOS/Android store URLs
    - Super admins retain full read access via existing policy

  2. Important Notes
    - Only mobile_app category is exposed, not other platform settings
    - Write access remains restricted to super admins only
*/

CREATE POLICY "Authenticated users can read mobile app settings"
  ON platform_settings FOR SELECT TO authenticated
  USING (category = 'mobile_app');
