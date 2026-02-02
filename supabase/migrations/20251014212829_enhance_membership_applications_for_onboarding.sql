/*
  # Enhance Membership Applications for Onboarding Wizard

  ## Overview
  This migration enhances the membership_applications table to support a comprehensive
  onboarding wizard that collects detailed member information including profile pictures,
  addresses, boats, emergency contacts, and payment preferences.

  ## Changes

  ### New Columns Added to `membership_applications`:
  1. **Profile Information**
     - `avatar_url` (text) - Profile picture URL from storage
     - `street` (text) - Street address
     - `city` (text) - City
     - `state` (text) - State/province
     - `postcode` (text) - Postal code

  2. **Membership Details**
     - `membership_type_id` (uuid) - Selected membership type
     - `membership_type_name` (text) - Name of membership type (denormalized for history)
     - `membership_amount` (decimal) - Amount at time of application

  3. **Payment Information**
     - `payment_method` (text) - Payment method choice (card/bank_transfer)
     - `stripe_payment_intent_id` (text) - Stripe payment reference if paid online

  4. **Emergency Contact**
     - `emergency_contact_name` (text) - Emergency contact full name
     - `emergency_contact_phone` (text) - Emergency contact phone
     - `emergency_contact_relationship` (text) - Relationship to member

  5. **Boats Information**
     - `boats` (jsonb) - Array of boat objects with type, sail_number, hull_name

  6. **Wizard Progress**
     - `application_data` (jsonb) - Complete wizard data for reference
     - `draft_step` (integer) - Current step if saving draft (0 = completed)
     - `completed_steps` (jsonb) - Array of completed step numbers
     - `is_draft` (boolean) - Whether this is a draft or submitted application

  7. **Agreement**
     - `code_of_conduct_accepted` (boolean) - Code of conduct acceptance
     - `code_of_conduct_accepted_at` (timestamptz) - When accepted

  ## Notes
  - Boats stored as JSONB for flexibility: [{type, sail_number, hull_name}]
  - Draft applications can be saved and resumed later
  - Payment method captured even if payment deferred
  - All contact and emergency info collected upfront
*/

-- Add new columns to membership_applications
DO $$
BEGIN
  -- Profile Information
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'avatar_url') THEN
    ALTER TABLE membership_applications ADD COLUMN avatar_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'street') THEN
    ALTER TABLE membership_applications ADD COLUMN street text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'city') THEN
    ALTER TABLE membership_applications ADD COLUMN city text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'state') THEN
    ALTER TABLE membership_applications ADD COLUMN state text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'postcode') THEN
    ALTER TABLE membership_applications ADD COLUMN postcode text;
  END IF;

  -- Membership Details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'membership_type_id') THEN
    ALTER TABLE membership_applications ADD COLUMN membership_type_id uuid REFERENCES membership_types(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'membership_type_name') THEN
    ALTER TABLE membership_applications ADD COLUMN membership_type_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'membership_amount') THEN
    ALTER TABLE membership_applications ADD COLUMN membership_amount decimal(10,2);
  END IF;

  -- Payment Information
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'payment_method') THEN
    ALTER TABLE membership_applications ADD COLUMN payment_method text DEFAULT 'bank_transfer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'stripe_payment_intent_id') THEN
    ALTER TABLE membership_applications ADD COLUMN stripe_payment_intent_id text;
  END IF;

  -- Emergency Contact
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'emergency_contact_name') THEN
    ALTER TABLE membership_applications ADD COLUMN emergency_contact_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'emergency_contact_phone') THEN
    ALTER TABLE membership_applications ADD COLUMN emergency_contact_phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'emergency_contact_relationship') THEN
    ALTER TABLE membership_applications ADD COLUMN emergency_contact_relationship text;
  END IF;

  -- Boats Information
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'boats') THEN
    ALTER TABLE membership_applications ADD COLUMN boats jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Wizard Progress
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'application_data') THEN
    ALTER TABLE membership_applications ADD COLUMN application_data jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'draft_step') THEN
    ALTER TABLE membership_applications ADD COLUMN draft_step integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'completed_steps') THEN
    ALTER TABLE membership_applications ADD COLUMN completed_steps jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'is_draft') THEN
    ALTER TABLE membership_applications ADD COLUMN is_draft boolean DEFAULT false;
  END IF;

  -- Agreement
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'code_of_conduct_accepted') THEN
    ALTER TABLE membership_applications ADD COLUMN code_of_conduct_accepted boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_applications' AND column_name = 'code_of_conduct_accepted_at') THEN
    ALTER TABLE membership_applications ADD COLUMN code_of_conduct_accepted_at timestamptz;
  END IF;
END $$;

-- Add constraint for payment method
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'membership_applications_payment_method_check'
  ) THEN
    ALTER TABLE membership_applications 
    ADD CONSTRAINT membership_applications_payment_method_check 
    CHECK (payment_method IN ('card', 'bank_transfer'));
  END IF;
END $$;

-- Create index for draft applications lookup
CREATE INDEX IF NOT EXISTS idx_membership_applications_user_draft 
ON membership_applications(user_id, is_draft) 
WHERE is_draft = true;

-- Create index for membership type lookups
CREATE INDEX IF NOT EXISTS idx_membership_applications_membership_type 
ON membership_applications(membership_type_id);

-- Update RLS policy to allow users to update their own draft applications
CREATE POLICY "Users can update own draft applications" ON membership_applications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_draft = true)
  WITH CHECK (user_id = auth.uid() AND is_draft = true);
