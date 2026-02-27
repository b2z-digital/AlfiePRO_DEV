/*
  # Enable realtime for bug_reports table

  1. Changes
    - Add `bug_reports` table to the Supabase realtime publication
    - This allows the Feedback Hub dashboard to auto-refresh when new bugs or feature requests are submitted

  2. Important Notes
    - No data changes, only realtime subscription enablement
*/

ALTER PUBLICATION supabase_realtime ADD TABLE bug_reports;
