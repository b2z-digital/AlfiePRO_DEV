/*
  # Add emergency contact fields to members table

  This migration adds emergency contact fields to the members table to store
  emergency contact information for club members.

  1. New Fields
    - `emergency_contact_name` - Name of emergency contact
    - `emergency_contact_phone` - Phone number of emergency contact
    - `emergency_contact_relationship` - Relationship to the member (e.g., spouse, parent)
*/

-- Add emergency contact fields to members table
ALTER TABLE members 
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;