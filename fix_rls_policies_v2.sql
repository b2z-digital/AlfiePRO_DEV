/*
  RLS Policy Optimization Script v2

  This script wraps all auth.uid() and auth.jwt() calls in SELECT statements
  to improve performance by evaluating them once per query instead of once per row.

  Execution time: ~5-10 minutes for 336 policies

  IMPORTANT: Do NOT interrupt this script while running.
*/

DO $$
DECLARE
    policy_rec RECORD;
    new_qual TEXT;
    new_with_check TEXT;
    drop_stmt TEXT;
    create_stmt TEXT;
    policies_fixed INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting RLS policy optimization...';
    RAISE NOTICE 'This will take 5-10 minutes. Please wait...';

    FOR policy_rec IN
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%'
               OR qual LIKE '%auth.jwt()%' OR with_check LIKE '%auth.jwt()%')
    LOOP
        -- Replace auth.uid() with (SELECT auth.uid())
        -- Replace auth.jwt() with (SELECT auth.jwt())
        new_qual := REPLACE(REPLACE(policy_rec.qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())');

        -- Build DROP statement
        drop_stmt := format('DROP POLICY IF EXISTS %I ON %I.%I',
            policy_rec.policyname, policy_rec.schemaname, policy_rec.tablename);

        -- Handle WITH CHECK if it exists
        IF policy_rec.with_check IS NOT NULL THEN
            new_with_check := REPLACE(REPLACE(policy_rec.with_check, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())');

            -- Build CREATE statement with both USING and WITH CHECK
            create_stmt := format('CREATE POLICY %I ON %I.%I USING %s WITH CHECK %s',
                policy_rec.policyname,
                policy_rec.schemaname,
                policy_rec.tablename,
                new_qual,
                new_with_check);
        ELSE
            -- Build CREATE statement with only USING
            create_stmt := format('CREATE POLICY %I ON %I.%I USING %s',
                policy_rec.policyname,
                policy_rec.schemaname,
                policy_rec.tablename,
                new_qual);
        END IF;

        -- Execute the statements
        EXECUTE drop_stmt;
        EXECUTE create_stmt;

        policies_fixed := policies_fixed + 1;

        -- Show progress every 50 policies
        IF policies_fixed % 50 = 0 THEN
            RAISE NOTICE 'Progress: % policies optimized...', policies_fixed;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ Complete! Optimized % RLS policies', policies_fixed;
    RAISE NOTICE 'Your database queries should now be significantly faster!';
END $$;
