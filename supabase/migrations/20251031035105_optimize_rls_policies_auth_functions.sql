/*
  # RLS Policy Optimization - Wrap auth.uid() and auth.jwt() in SELECT

  This migration optimizes all RLS policies by wrapping auth.uid() and auth.jwt()
  calls in SELECT statements. This causes them to be evaluated once per query
  instead of once per row, providing 10-100x performance improvements.

  1. Changes
    - Finds all policies using auth.uid() or auth.jwt()
    - Wraps each call in (SELECT ...) for single evaluation
    - Recreates policies with optimized expressions
  
  2. Performance Impact
    - Before: auth.uid() called 1000 times for 1000 rows
    - After: auth.uid() called 1 time for entire query
    - Result: Massive performance improvement on large datasets
*/

DO $$
DECLARE
    policy_rec RECORD;
    create_stmt TEXT;
    new_using TEXT;
    new_check TEXT;
    policies_fixed INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting RLS policy optimization...';
    RAISE NOTICE 'This will take several minutes. Please wait...';

    -- Loop through all policies that use auth.uid() or auth.jwt()
    FOR policy_rec IN
        SELECT 
            schemaname,
            tablename,
            policyname,
            qual,
            with_check,
            pg_policies.cmd AS policy_cmd,
            roles
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
            qual LIKE '%auth.uid()%' 
            OR qual LIKE '%auth.jwt()%'
            OR with_check LIKE '%auth.uid()%' 
            OR with_check LIKE '%auth.jwt()%'
          )
    LOOP
        -- Replace auth.uid() with (SELECT auth.uid())
        -- Replace auth.jwt() with (SELECT auth.jwt())
        new_using := NULL;
        new_check := NULL;
        
        IF policy_rec.qual IS NOT NULL THEN
            new_using := REPLACE(
                REPLACE(policy_rec.qual, 'auth.uid()', '(SELECT auth.uid())'),
                'auth.jwt()', '(SELECT auth.jwt())'
            );
        END IF;
        
        IF policy_rec.with_check IS NOT NULL THEN
            new_check := REPLACE(
                REPLACE(policy_rec.with_check, 'auth.uid()', '(SELECT auth.uid())'),
                'auth.jwt()', '(SELECT auth.jwt())'
            );
        END IF;

        -- Drop the existing policy
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            policy_rec.policyname,
            policy_rec.schemaname,
            policy_rec.tablename
        );

        -- Rebuild the CREATE POLICY command
        create_stmt := format('CREATE POLICY %I ON %I.%I',
            policy_rec.policyname,
            policy_rec.schemaname,
            policy_rec.tablename
        );

        -- Add FOR clause for the command type (not AS)
        IF policy_rec.policy_cmd IS NOT NULL AND policy_rec.policy_cmd != '*' THEN
            create_stmt := create_stmt || ' FOR ' || policy_rec.policy_cmd;
        END IF;

        -- Add TO clause for roles
        IF policy_rec.roles IS NOT NULL THEN
            create_stmt := create_stmt || ' TO ' || array_to_string(policy_rec.roles, ', ');
        END IF;

        -- Add USING clause (not for INSERT)
        IF new_using IS NOT NULL AND policy_rec.policy_cmd != 'INSERT' THEN
            create_stmt := create_stmt || ' USING (' || new_using || ')';
        END IF;

        -- Add WITH CHECK clause
        IF new_check IS NOT NULL THEN
            create_stmt := create_stmt || ' WITH CHECK (' || new_check || ')';
        END IF;

        -- Execute the new policy creation
        EXECUTE create_stmt;

        policies_fixed := policies_fixed + 1;

        -- Show progress every 50 policies
        IF policies_fixed % 50 = 0 THEN
            RAISE NOTICE 'Progress: % policies optimized...', policies_fixed;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ Complete! Optimized % RLS policies', policies_fixed;
    RAISE NOTICE 'Database queries should now be significantly faster!';
END $$;
