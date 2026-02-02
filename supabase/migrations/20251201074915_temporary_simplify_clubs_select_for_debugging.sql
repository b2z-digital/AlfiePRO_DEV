/*
  # Add Missing Venue Location Fields

  1. Changes
    - Add city, state, zip_code, country columns to venues table
    - These fields support more detailed venue addresses

  2. Security
    - No RLS changes needed
*/

-- Add missing location columns to venues
ALTER TABLE venues 
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Australia';
