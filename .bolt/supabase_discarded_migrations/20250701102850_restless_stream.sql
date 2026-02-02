-- Create the event-media bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-media', 'event-media', true)
ON CONFLICT (id) DO NOTHING;

-- Create a function to safely create policies for SELECT and DELETE operations
CREATE OR REPLACE FUNCTION create_storage_policy_using(
  policy_name TEXT,
  bucket_name TEXT,
  operation TEXT,
  role_name TEXT,
  policy_definition TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check if policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = policy_name 
    AND tablename = 'objects' 
    AND schemaname = 'storage'
  ) THEN
    -- Create the policy using dynamic SQL to avoid direct references
    EXECUTE format('
      CREATE POLICY %I
      ON storage.objects
      FOR %s
      TO %s
      USING (bucket_id = %L AND (%s))
    ', 
    policy_name, 
    operation, 
    role_name, 
    bucket_name,
    policy_definition);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Not enough privileges to create policy %', policy_name;
END;
$$ LANGUAGE plpgsql;

-- Create a function for INSERT policies that need only WITH CHECK clause
CREATE OR REPLACE FUNCTION create_storage_policy_insert(
  policy_name TEXT,
  bucket_name TEXT,
  role_name TEXT,
  policy_check TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check if policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = policy_name 
    AND tablename = 'objects' 
    AND schemaname = 'storage'
  ) THEN
    -- Create the policy using dynamic SQL to avoid direct references
    EXECUTE format('
      CREATE POLICY %I
      ON storage.objects
      FOR INSERT
      TO %s
      WITH CHECK (bucket_id = %L AND (%s))
    ', 
    policy_name, 
    role_name, 
    bucket_name,
    policy_check);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Not enough privileges to create policy %', policy_name;
END;
$$ LANGUAGE plpgsql;

-- Create a function for UPDATE policies that need both USING and WITH CHECK
CREATE OR REPLACE FUNCTION create_storage_policy_update(
  policy_name TEXT,
  bucket_name TEXT,
  role_name TEXT,
  policy_using TEXT,
  policy_check TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check if policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = policy_name 
    AND tablename = 'objects' 
    AND schemaname = 'storage'
  ) THEN
    -- Create the policy using dynamic SQL to avoid direct references
    EXECUTE format('
      CREATE POLICY %I
      ON storage.objects
      FOR UPDATE
      TO %s
      USING (bucket_id = %L AND (%s))
      WITH CHECK (bucket_id = %L AND (%s))
    ', 
    policy_name, 
    role_name, 
    bucket_name,
    policy_using,
    bucket_name,
    policy_check);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Not enough privileges to create policy %', policy_name;
END;
$$ LANGUAGE plpgsql;

-- Create a function for ALL policies that need both USING and WITH CHECK
CREATE OR REPLACE FUNCTION create_storage_policy_all(
  policy_name TEXT,
  bucket_name TEXT,
  role_name TEXT,
  policy_using TEXT,
  policy_check TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check if policy already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = policy_name 
    AND tablename = 'objects' 
    AND schemaname = 'storage'
  ) THEN
    -- Create the policy using dynamic SQL to avoid direct references
    EXECUTE format('
      CREATE POLICY %I
      ON storage.objects
      FOR ALL
      TO %s
      USING (bucket_id = %L AND (%s))
      WITH CHECK (bucket_id = %L AND (%s))
    ', 
    policy_name, 
    role_name, 
    bucket_name,
    policy_using,
    bucket_name,
    policy_check);
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Not enough privileges to create policy %', policy_name;
END;
$$ LANGUAGE plpgsql;

-- Create policies using our helper functions
SELECT create_storage_policy_using(
  'Public read access for event-media',
  'event-media',
  'SELECT',
  'public',
  'true'
);

SELECT create_storage_policy_insert(
  'Authenticated users can upload to event-media',
  'event-media',
  'authenticated',
  'true'
);

SELECT create_storage_policy_update(
  'Users can update their own files in event-media',
  'event-media',
  'authenticated',
  'auth.uid()::text = owner',
  'auth.uid()::text = owner'
);

SELECT create_storage_policy_using(
  'Users can delete their own files in event-media',
  'event-media',
  'DELETE',
  'authenticated',
  'auth.uid()::text = owner'
);

SELECT create_storage_policy_all(
  'Club admins can manage event media',
  'event-media',
  'authenticated',
  'EXISTS (SELECT 1 FROM user_clubs uc WHERE uc.user_id = auth.uid() AND uc.role = ''admin'')',
  'EXISTS (SELECT 1 FROM user_clubs uc WHERE uc.user_id = auth.uid() AND uc.role = ''admin'')'
);

-- Drop the helper functions after use
DROP FUNCTION IF EXISTS create_storage_policy_using;
DROP FUNCTION IF EXISTS create_storage_policy_insert;
DROP FUNCTION IF EXISTS create_storage_policy_update;
DROP FUNCTION IF EXISTS create_storage_policy_all;