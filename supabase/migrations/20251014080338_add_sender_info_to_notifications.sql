/*
  # Add Sender Information to Notifications

  1. Schema Changes
    - Add `sender_id` (UUID) - References the user who sent the notification
    - Add `sender_avatar_url` (TEXT) - Cache of sender's avatar for performance
    - Add `recipient_avatar_url` (TEXT) - Cache of recipient's avatar for performance
    
  2. Data Migration
    - Populate sender_id from existing sender_name data where possible
    
  3. Indexes
    - Add index on sender_id for faster lookups
    
  4. Security
    - Update RLS policies to handle sender_id
*/

-- Add new columns
ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS recipient_avatar_url TEXT;

-- Create index for sender lookups
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON notifications(sender_id);

-- Create index for combined sender/recipient queries
CREATE INDEX IF NOT EXISTS idx_notifications_sender_user ON notifications(sender_id, user_id);