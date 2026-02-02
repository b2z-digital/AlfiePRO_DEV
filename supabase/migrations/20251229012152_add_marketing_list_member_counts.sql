/*
  # Add Marketing List Member Counts

  1. Changes
    - Add active_subscriber_count column to track members with email notifications enabled
    - Rename subscriber_count to total_contacts for clarity
    - Create trigger to automatically update counts when list members change
    - Create trigger to update counts when member email preferences change
  
  2. Security
    - Triggers run with elevated privileges to update counts
*/

-- Add new column for active subscribers (those with email enabled)
ALTER TABLE marketing_subscriber_lists
ADD COLUMN IF NOT EXISTS active_subscriber_count integer DEFAULT 0;

-- Rename subscriber_count to total_contacts for clarity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_subscriber_lists' 
    AND column_name = 'subscriber_count'
  ) THEN
    ALTER TABLE marketing_subscriber_lists
    RENAME COLUMN subscriber_count TO total_contacts;
  END IF;
END $$;

-- Function to update list member counts
CREATE OR REPLACE FUNCTION update_marketing_list_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_total integer;
  v_active integer;
BEGIN
  -- Determine which list to update
  IF TG_OP = 'DELETE' THEN
    v_list_id := OLD.list_id;
  ELSE
    v_list_id := NEW.list_id;
  END IF;

  -- Count total members in the list
  SELECT COUNT(*)
  INTO v_total
  FROM marketing_list_members
  WHERE list_id = v_list_id;

  -- Count active subscribers (members with email notifications enabled)
  -- A member is active if they DON'T have unsubscribed_marketing = true
  SELECT COUNT(*)
  INTO v_active
  FROM marketing_list_members mlm
  LEFT JOIN marketing_preferences mp ON mlm.email = mp.email
  WHERE mlm.list_id = v_list_id
    AND (mp.unsubscribed_marketing IS NULL OR mp.unsubscribed_marketing = false);

  -- Update the counts
  UPDATE marketing_subscriber_lists
  SET 
    total_contacts = v_total,
    active_subscriber_count = v_active,
    updated_at = now()
  WHERE id = v_list_id;

  RETURN NULL;
END;
$$;

-- Create trigger for list member changes
DROP TRIGGER IF EXISTS update_list_counts_on_member_change ON marketing_list_members;
CREATE TRIGGER update_list_counts_on_member_change
  AFTER INSERT OR UPDATE OR DELETE ON marketing_list_members
  FOR EACH ROW
  EXECUTE FUNCTION update_marketing_list_counts();

-- Function to update all list counts when preferences change
CREATE OR REPLACE FUNCTION update_all_list_counts_for_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_record RECORD;
BEGIN
  -- Update counts for all lists containing this email
  FOR v_list_record IN
    SELECT DISTINCT list_id
    FROM marketing_list_members
    WHERE email = COALESCE(NEW.email, OLD.email)
  LOOP
    PERFORM update_marketing_list_counts_trigger(v_list_record.list_id);
  END LOOP;

  RETURN NULL;
END;
$$;

-- Helper function to update a specific list's counts
CREATE OR REPLACE FUNCTION update_marketing_list_counts_trigger(p_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_active integer;
BEGIN
  -- Count total members
  SELECT COUNT(*)
  INTO v_total
  FROM marketing_list_members
  WHERE list_id = p_list_id;

  -- Count active subscribers
  SELECT COUNT(*)
  INTO v_active
  FROM marketing_list_members mlm
  LEFT JOIN marketing_preferences mp ON mlm.email = mp.email
  WHERE mlm.list_id = p_list_id
    AND (mp.unsubscribed_marketing IS NULL OR mp.unsubscribed_marketing = false);

  -- Update the counts
  UPDATE marketing_subscriber_lists
  SET 
    total_contacts = v_total,
    active_subscriber_count = v_active,
    updated_at = now()
  WHERE id = p_list_id;
END;
$$;

-- Create trigger for preference changes
DROP TRIGGER IF EXISTS update_list_counts_on_preference_change ON marketing_preferences;
CREATE TRIGGER update_list_counts_on_preference_change
  AFTER INSERT OR UPDATE ON marketing_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_all_list_counts_for_email();

-- Backfill existing counts
DO $$
DECLARE
  v_list RECORD;
  v_total integer;
  v_active integer;
BEGIN
  FOR v_list IN SELECT id FROM marketing_subscriber_lists
  LOOP
    -- Count total members
    SELECT COUNT(*)
    INTO v_total
    FROM marketing_list_members
    WHERE list_id = v_list.id;

    -- Count active subscribers
    SELECT COUNT(*)
    INTO v_active
    FROM marketing_list_members mlm
    LEFT JOIN marketing_preferences mp ON mlm.email = mp.email
    WHERE mlm.list_id = v_list.id
      AND (mp.unsubscribed_marketing IS NULL OR mp.unsubscribed_marketing = false);

    -- Update the list
    UPDATE marketing_subscriber_lists
    SET 
      total_contacts = v_total,
      active_subscriber_count = v_active
    WHERE id = v_list.id;
  END LOOP;
END $$;