/*
  # Add boat_class column to classifieds table

  1. Changes
    - Add optional boat_class column to classifieds table to store boat type/class information
    - Allows filtering classifieds by boat class (e.g., DF65, DF95, 10R, IOM, etc.)

  2. Column Details
    - `boat_class` (text, nullable) - Stores the boat class/type for sailing-related classifieds
*/

-- Add boat_class column to classifieds table
ALTER TABLE classifieds ADD COLUMN IF NOT EXISTS boat_class text;

-- Create index for faster filtering by boat_class
CREATE INDEX IF NOT EXISTS idx_classifieds_boat_class ON classifieds(boat_class);
