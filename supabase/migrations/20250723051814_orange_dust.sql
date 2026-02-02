/*
  # Add sender and recipient name fields to notifications

  1. Changes
    - Add sender_name column to store sender's full name
    - Add recipient_name column to store recipient's full name
    - These will help display names even if profiles are deleted
*/

-- Add sender_name and recipient_name columns
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS sender_name text,
ADD COLUMN IF NOT EXISTS recipient_name text;