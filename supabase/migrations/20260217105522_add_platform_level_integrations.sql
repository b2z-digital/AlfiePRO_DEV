/*
  # Add Platform-Level Integrations

  Inserts platform-level integration records for all global services used by AlfiePRO.
  These are integrations where club_id, state_association_id, and national_association_id are all NULL,
  indicating they are system-wide platform integrations.

  1. New Records
    - `stripe` - Platform-level Stripe payment processing (subscriptions, billing)
    - `google` - Google OAuth, Maps, Analytics platform integration
    - `cloudflare` - Cloudflare DNS and domain management
    - `aws` - AWS Amplify hosting and custom domains
    - `sendgrid` - SendGrid email delivery service
    - `resend` - Resend email delivery service
    - `openai` - OpenAI AI content generation
    - `facebook` - Facebook social sharing integration
    - `instagram` - Instagram social sharing integration
    - `weather` - Weather API services (OpenWeatherMap + StormGlass)
    - `adsense` - Google AdSense advertising integration

  2. Notes
    - Credentials are stored as empty JSONB - actual secrets are in Supabase Edge Functions environment
    - Metadata contains descriptive information about each integration
    - All integrations are marked as active and connected
    - YouTube already exists and is not re-inserted
*/

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'stripe', true, true, '{}'::jsonb,
  '{"name": "AlfiePRO Stripe", "description": "Platform billing and subscription payment processing for clubs and associations", "env_vars": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CLIENT_ID"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'stripe' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'google', true, true, '{}'::jsonb,
  '{"name": "Google Services", "description": "Google OAuth, Maps API, Drive, Meet, and Analytics integration", "env_vars": ["VITE_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "VITE_GOOGLE_MAPS_API_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'google' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'cloudflare', true, true, '{}'::jsonb,
  '{"name": "Cloudflare", "description": "DNS management, domain routing, and Cloudflare Stream for livestreaming", "env_vars": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'cloudflare' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'aws', true, true, '{}'::jsonb,
  '{"name": "AWS Amplify", "description": "AWS Amplify hosting, custom domain automation, and CloudFront CDN", "env_vars": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'aws' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'sendgrid', true, true, '{}'::jsonb,
  '{"name": "SendGrid", "description": "Primary email delivery service for notifications, invitations, and marketing", "env_vars": ["SENDGRID_API_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'sendgrid' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'resend', true, true, '{}'::jsonb,
  '{"name": "Resend", "description": "Secondary email delivery service for event invitations and transactional emails", "env_vars": ["RESEND_API_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'resend' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'openai', true, true, '{}'::jsonb,
  '{"name": "OpenAI", "description": "AI-powered race report generation and content assistance", "env_vars": ["OPENAI_API_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'openai' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'facebook', true, true, '{}'::jsonb,
  '{"name": "Facebook", "description": "Facebook social sharing and page integration for clubs", "env_vars": ["VITE_FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'facebook' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'instagram', true, true, '{}'::jsonb,
  '{"name": "Instagram", "description": "Instagram social sharing integration for clubs", "env_vars": ["VITE_INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'instagram' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'weather', true, true, '{}'::jsonb,
  '{"name": "Weather Services", "description": "OpenWeatherMap and StormGlass weather data for race conditions and forecasts", "env_vars": ["VITE_WEATHER_API_KEY", "VITE_STORMGLASS_API_KEY"]}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'weather' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);

INSERT INTO integrations (platform, is_active, is_default, credentials, metadata, connected_at)
SELECT 'adsense', true, false, '{}'::jsonb,
  '{"name": "Google AdSense", "description": "Google AdSense advertising integration for revenue generation on public pages", "env_vars": []}'::jsonb,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM integrations WHERE platform = 'adsense' AND club_id IS NULL AND state_association_id IS NULL AND national_association_id IS NULL
);