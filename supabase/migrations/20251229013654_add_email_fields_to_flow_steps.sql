/*
  # Add Email Fields to Flow Steps

  1. Changes
    - Add preview_text column to marketing_flow_steps
    - Add from_name column to marketing_flow_steps
    - Add from_email column to marketing_flow_steps
    
  2. Notes
    - These fields allow users to customize sender information for each email step in automation flows
    - Matches the campaign email fields for consistency
*/

-- Add email sender fields to flow steps
ALTER TABLE marketing_flow_steps
ADD COLUMN IF NOT EXISTS preview_text text,
ADD COLUMN IF NOT EXISTS from_name text,
ADD COLUMN IF NOT EXISTS from_email text;