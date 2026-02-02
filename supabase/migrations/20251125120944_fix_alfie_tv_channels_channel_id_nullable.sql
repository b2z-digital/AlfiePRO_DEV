/*
  # Fix AlfieTV Channels Schema

  1. Changes
    - Make channel_id column nullable in alfie_tv_channels table
    - This allows channels to be added without immediately having the YouTube channel ID
    - The channel ID can be populated later when fetching metadata
*/

ALTER TABLE alfie_tv_channels
  ALTER COLUMN channel_id DROP NOT NULL;