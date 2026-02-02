/*
  # Add emergency contact fields to members table

  1. New Fields
    - `emergency_contact_name` (text)
    - `emergency_contact_phone` (text)
    - `emergency_contact_relationship` (text)
*/

-- Add emergency contact fields to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;