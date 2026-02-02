/*
  # Fix missing foreign key constraint for invoice_notes

  1. Changes
    - Add foreign key constraint on invoice_notes.created_by_user_id referencing auth.users(id)
    - This will allow Supabase PostgREST to properly join with user data

  2. Security
    - No changes to existing RLS policies
    - Maintains data integrity by ensuring created_by_user_id references valid users
*/

-- Add foreign key constraint for created_by_user_id
ALTER TABLE invoice_notes 
ADD CONSTRAINT invoice_notes_created_by_user_id_fkey 
FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;