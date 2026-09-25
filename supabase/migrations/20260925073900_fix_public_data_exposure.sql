/*
# Fix critical public data exposure on members, profiles, clubs, event_registrations

## Problem
Four tables have SELECT policies granting unauthenticated (public/anon) access to sensitive personal data:
- `members`: Full rows exposed including email, phone, address, emergency contacts, payment info, year of birth
- `profiles`: Full rows exposed including is_super_admin flag, email
- `clubs`: Full rows exposed via USING(true) to public role
- `event_registrations`: Confirmed registrations exposed including Stripe payment IDs, guest PII, emergency contacts

## Changes
1. Drop overly permissive public/anon SELECT policies on all four tables
2. Drop the anon INSERT policy on event_registrations
3. Revoke INSERT/UPDATE/DELETE/TRUNCATE from anon on all four tables
4. Revoke SELECT from anon on all four tables

## Security
- Removes all unauthenticated read/write access to member PII, profile data, club data, and registration data
- Existing authenticated policies remain unchanged -- logged-in users still have proper scoped access
- No data is modified or deleted
*/

-- 1. Drop the dangerous public/anon SELECT policies
DROP POLICY IF EXISTS "Public can view member basic info" ON members;
DROP POLICY IF EXISTS "Public can view members assigned to website-visible committee p" ON members;
DROP POLICY IF EXISTS "Public can view basic profiles" ON profiles;
DROP POLICY IF EXISTS "Public can view basic club info" ON clubs;
DROP POLICY IF EXISTS "Public can view confirmed registrations" ON event_registrations;

-- Also drop the anon INSERT on event_registrations
DROP POLICY IF EXISTS "Anonymous users can create registrations" ON event_registrations;

-- 2. Revoke excessive table-level privileges from anon on these sensitive tables
REVOKE ALL ON members FROM anon;
REVOKE ALL ON profiles FROM anon;
REVOKE ALL ON clubs FROM anon;
REVOKE ALL ON event_registrations FROM anon;
