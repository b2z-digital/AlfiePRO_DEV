/*
# Migrate 'meta' platform entries to 'facebook' in integrations table

1. Changes
  - Updates any integrations rows with platform='meta' to platform='facebook'
    so the unified codebase consistently uses 'facebook' as the platform name.
  - This is a data-only migration; no schema changes.

2. Notes
  - The frontend, edge functions, and all query code now use platform='facebook'.
  - Existing rows stored as 'meta' would not be found by the new code without this fix.
*/

UPDATE integrations
SET platform = 'facebook', updated_at = now()
WHERE platform = 'meta';
