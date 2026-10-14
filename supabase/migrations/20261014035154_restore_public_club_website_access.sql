/*
# Restore public club website access (safe fields only)

## Problem
The 25 Sept security fix removed public read access to the clubs table. Every club
subdomain website (e.g. plrmyc.alfiepro.com.au) has shown "Website Not Found" to
visitors who are not logged in since then.

## Changes
1. Replace the anon role's table-wide SELECT grant on `clubs` with a column-level grant
   that covers only website-safe fields (name, logo, images, description, contact
   details, SEO/domain settings).
2. Add a SELECT policy letting anon read only clubs whose website domain is active
   (domain_status 'active' or 'custom').

## Security
- Bank details, Stripe, tax, approval, billing and admin fields remain unreadable to
  the public (no column grant).
- Clubs without an active website remain invisible to the public.
- Logged-in users are unaffected.
*/

REVOKE SELECT ON clubs FROM anon;

GRANT SELECT (
  id, name, abbreviation, logo, description, club_introduction, code_of_conduct,
  organization_type, featured_image_url, cover_image_url, cover_image_position_x,
  cover_image_position_y, cover_image_scale, contact_email, contact_phone, address,
  state_association_id, subdomain_slug, custom_domain, domain_status, website_published,
  seo_title, seo_description, allow_indexing, google_analytics_id, default_share_image,
  default_share_description, facebook_pixel_id, twitter_handle, created_at, updated_at
) ON clubs TO anon;

DROP POLICY IF EXISTS "Public can view clubs with active websites" ON clubs;
CREATE POLICY "Public can view clubs with active websites"
  ON clubs FOR SELECT
  TO anon
  USING (domain_status IN ('active', 'custom'));
