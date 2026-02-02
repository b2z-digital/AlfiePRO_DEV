/*
  # Add Organization Subscriptions and Enhanced Roles

  1. Database Schema Changes
    - Modify club_role enum to add national_admin and state_admin
    - Add organization_type column to clubs table
    - Add club_id column to public_events table
    - Create user_subscriptions table

  2. Security
    - Enable RLS on user_subscriptions table
    - Add policies for user subscription management
    - Update public_events policies for organization admins

  3. Helper Functions
    - Create is_org_admin function for RLS policies
*/

-- Step 1: Modify club_role enum to add new roles
ALTER TYPE public.club_role ADD VALUE IF NOT EXISTS 'national_admin';
ALTER TYPE public.club_role ADD VALUE IF NOT EXISTS 'state_admin';

-- Step 2: Add organization_type column to clubs table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clubs' AND column_name = 'organization_type'
  ) THEN
    ALTER TABLE public.clubs
    ADD COLUMN organization_type TEXT DEFAULT 'club' NOT NULL;
    
    ALTER TABLE public.clubs
    ADD CONSTRAINT clubs_organization_type_check
    CHECK (organization_type IN ('club', 'state_association', 'national_association'));
  END IF;
END $$;

-- Step 3: Add club_id column to public_events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'club_id'
  ) THEN
    ALTER TABLE public.public_events
    ADD COLUMN club_id UUID;
    
    ALTER TABLE public.public_events
    ADD CONSTRAINT public_events_club_id_fkey
    FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Step 4: Create user_subscriptions table
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT user_subscriptions_subscription_type_check
  CHECK (subscription_type IN ('club', 'state_association', 'national_association')),
  
  CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'cancelled', 'past_due'))
);

-- Enable RLS on user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscriptions" ON public.user_subscriptions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON public.user_subscriptions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON public.user_subscriptions
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role has full access on user_subscriptions" ON public.user_subscriptions
FOR ALL USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Create helper function for organization admin checks
CREATE OR REPLACE FUNCTION public.is_org_admin(org_club_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_clubs uc
    WHERE uc.club_id = org_club_id
      AND uc.user_id = auth.uid()
      AND uc.role IN ('national_admin', 'state_admin', 'admin')
  );
END;
$$;

-- Step 6: Update public_events RLS policies
DROP POLICY IF EXISTS "Super admins can insert public events" ON public.public_events;
DROP POLICY IF EXISTS "Super admins can update public events" ON public.public_events;
DROP POLICY IF EXISTS "Super admins can delete public events" ON public.public_events;

CREATE POLICY "Organization admins can insert public events" ON public.public_events
FOR INSERT WITH CHECK (
  is_platform_super_admin() OR 
  (club_id IS NOT NULL AND is_org_admin(club_id))
);

CREATE POLICY "Organization admins can update public events" ON public.public_events
FOR UPDATE USING (
  is_platform_super_admin() OR 
  (club_id IS NOT NULL AND is_org_admin(club_id))
) WITH CHECK (
  is_platform_super_admin() OR 
  (club_id IS NOT NULL AND is_org_admin(club_id))
);

CREATE POLICY "Organization admins can delete public events" ON public.public_events
FOR DELETE USING (
  is_platform_super_admin() OR 
  (club_id IS NOT NULL AND is_org_admin(club_id))
);