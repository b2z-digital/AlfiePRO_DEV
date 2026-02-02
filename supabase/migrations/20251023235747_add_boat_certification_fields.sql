/*
  # Add Boat Certification and Registration Fields

  1. New Columns
    - `boat_name` (text) - The boat's name (e.g., "Alfie")
    - `design_name` (text) - Design name (e.g., "Trance") 
    - `designer_name` (text) - Designer's name (e.g., "Brad Gibson")
    - `hull_registration_number` (text) - Official hull registration number
    - `registration_date` (date) - Date of registration
    - `certification_authority` (text) - Certifying organization (e.g., "Australian Radio Yachting Association")
    - `certification_file_url` (text) - URL to the PDF certificate file
    - `certification_file_name` (text) - Original filename of the certificate
  
  2. Changes
    - Add new columns to member_boats table
    - All fields are optional to allow gradual adoption
*/

-- Add new boat certification and registration fields
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS boat_name TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS design_name TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS designer_name TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS hull_registration_number TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS registration_date DATE;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS certification_authority TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS certification_file_url TEXT;
ALTER TABLE member_boats ADD COLUMN IF NOT EXISTS certification_file_name TEXT;

-- Add index on hull_registration_number for quick lookups
CREATE INDEX IF NOT EXISTS idx_member_boats_hull_reg_number ON member_boats(hull_registration_number);
