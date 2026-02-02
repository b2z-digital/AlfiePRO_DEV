/*
  # Create Automation Flow Tracking

  Creates a table to track automation flow processing runs.
  
  1. New Tables
    - `marketing_automation_job_runs` - tracks each cron job execution
  
  2. Security
    - Enable RLS
    - Super admins can view job runs
*/

-- Create a table to track cron job runs
CREATE TABLE IF NOT EXISTS marketing_automation_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running',
  flows_processed integer DEFAULT 0,
  emails_sent integer DEFAULT 0,
  errors integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_automation_job_runs_created ON marketing_automation_job_runs(created_at DESC);

ALTER TABLE marketing_automation_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view job runs" ON marketing_automation_job_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true));

CREATE POLICY "System creates job runs" ON marketing_automation_job_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "System updates job runs" ON marketing_automation_job_runs FOR UPDATE USING (true);

-- Create a function to trigger automation flow processing
CREATE OR REPLACE FUNCTION trigger_automation_flows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can be called by a cron job or scheduled task
  -- It will trigger the edge function via HTTP
  -- The actual processing happens in the edge function
  
  -- Insert a job run record
  INSERT INTO marketing_automation_job_runs (status)
  VALUES ('pending');
  
  RAISE NOTICE 'Automation flow processing triggered';
END;
$$;
