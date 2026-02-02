/*
  # Create Club Setup Applications Table
  
  1. New Tables
    - `club_setup_applications`
      - Tracks the progress of users setting up new clubs
      - Stores draft data for each step
      - Links to user and eventual club
      
  2. Fields
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users) - User creating the club
    - `club_id` (uuid, nullable, references clubs) - Created club (null until completed)
    - `current_step` (text) - Current wizard step
    - `is_draft` (boolean) - Whether this is still a draft
    - `club_info` (jsonb) - Club name, abbreviation, logo, colors, description
    - `contact_info` (jsonb) - Email, phone, address, website, social media
    - `primary_venue` (jsonb) - Venue details
    - `financial_info` (jsonb) - Tax type, tax ID, bank details, currency
    - `subscription_plan` (text) - Selected plan type
    - `trial_start_date` (timestamptz) - When trial started
    - `trial_end_date` (timestamptz) - When trial ends (30 days from start)
    - `stripe_customer_id` (text) - Stripe customer ID
    - `stripe_subscription_id` (text) - Stripe subscription ID
    - `completed_at` (timestamptz) - When setup was completed
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
    
  3. Security
    - Enable RLS
    - Users can view and update their own applications
    - Super admins can view all applications
*/

-- Create the club_setup_applications table
CREATE TABLE IF NOT EXISTS club_setup_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  current_step text DEFAULT 'welcome',
  is_draft boolean DEFAULT true,
  club_info jsonb DEFAULT '{}'::jsonb,
  contact_info jsonb DEFAULT '{}'::jsonb,
  primary_venue jsonb DEFAULT '{}'::jsonb,
  financial_info jsonb DEFAULT '{}'::jsonb,
  subscription_plan text,
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_club_setup_applications_user_id 
  ON club_setup_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_club_setup_applications_is_draft 
  ON club_setup_applications(is_draft);

-- Enable RLS
ALTER TABLE club_setup_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view own club setup applications"
  ON club_setup_applications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own applications
CREATE POLICY "Users can create club setup applications"
  ON club_setup_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own draft applications
CREATE POLICY "Users can update own draft club setup applications"
  ON club_setup_applications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_draft = true)
  WITH CHECK (user_id = auth.uid());

-- Super admins can view all applications
CREATE POLICY "Super admins can view all club setup applications"
  ON club_setup_applications
  FOR SELECT
  TO authenticated
  USING (is_platform_super_admin());

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_club_setup_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_club_setup_applications_updated_at
  BEFORE UPDATE ON club_setup_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_club_setup_applications_updated_at();
