/*
  # Fix invoice_notes foreign key constraint

  1. Changes
    - Add foreign key constraint for created_by_user_id if it doesn't exist
    - This enables Supabase to understand the relationship for API queries

  2. Security
    - No changes to existing RLS policies
*/

-- Add foreign key constraint for created_by_user_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'invoice_notes_created_by_user_id_fkey' 
    AND table_name = 'invoice_notes'
  ) THEN
    ALTER TABLE invoice_notes 
    ADD CONSTRAINT invoice_notes_created_by_user_id_fkey 
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;