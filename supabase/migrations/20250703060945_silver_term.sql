/*
  # Meeting Minutes Enhancements
  
  1. New Tables
    - None
    
  2. Changes
    - Add `minutes_decision`, `minutes_tasks`, and `minutes_attachments` columns to `meeting_agendas` table
    - Add `minutes_locked` column to `meetings` table
    
  3. Security
    - No changes to RLS policies
*/

-- Add new columns to meeting_agendas table
ALTER TABLE meeting_agendas 
  ADD COLUMN IF NOT EXISTS minutes_decision text,
  ADD COLUMN IF NOT EXISTS minutes_tasks text,
  ADD COLUMN IF NOT EXISTS minutes_attachments jsonb DEFAULT '[]'::jsonb;

-- Add minutes_locked column to meetings table
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS minutes_locked boolean DEFAULT false;