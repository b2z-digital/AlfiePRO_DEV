/*
  # Add Google Account Email to Integration Tables

  1. Changes
    - Add google_account_email column to club_integrations
    - Add google_account_email column to state_association_integrations  
    - Add google_account_email column to national_association_integrations

  2. Purpose
    - Store the connected Google account email address
    - Display in the integrations UI to show which account is connected
*/

-- Add google_account_email to club_integrations
ALTER TABLE club_integrations 
ADD COLUMN IF NOT EXISTS google_account_email text;

-- Add google_account_email to state_association_integrations
ALTER TABLE state_association_integrations 
ADD COLUMN IF NOT EXISTS google_account_email text;

-- Add google_account_email to national_association_integrations
ALTER TABLE national_association_integrations 
ADD COLUMN IF NOT EXISTS google_account_email text;