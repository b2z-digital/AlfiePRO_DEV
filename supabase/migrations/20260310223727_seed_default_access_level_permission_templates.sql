/*
  # Seed Default Access Level Permission Templates

  Seeds the access_level_permission_templates table with defaults that mirror
  the existing hardcoded permission logic in usePermissions.ts.

  This ensures zero behavior change on deployment - the RPC fallback chain
  will produce the same results as the current hardcoded system.

  Capability levels:
    - 'full'  = read + write + delete + admin actions
    - 'edit'  = read + write (create/update)
    - 'view'  = read-only access
    - 'none'  = no access to this feature

  Three access levels seeded: admin, editor, viewer
  27 features from platform_feature_controls
*/

INSERT INTO access_level_permission_templates (access_level, feature_key, capability) VALUES
  -- ADMIN: Full access to everything
  ('admin', 'race_management', 'full'),
  ('admin', 'race_calendar', 'full'),
  ('admin', 'results_display', 'full'),
  ('admin', 'hms_validator', 'full'),
  ('admin', 'yacht_classes', 'full'),
  ('admin', 'venues', 'full'),
  ('admin', 'live_tracking', 'full'),
  ('admin', 'digital_start_box', 'full'),
  ('admin', 'news', 'full'),
  ('admin', 'media', 'full'),
  ('admin', 'alfie_tv', 'full'),
  ('admin', 'livestream', 'full'),
  ('admin', 'marketing', 'full'),
  ('admin', 'community', 'full'),
  ('admin', 'sms_attendance', 'full'),
  ('admin', 'classifieds', 'full'),
  ('admin', 'resources', 'full'),
  ('admin', 'weather', 'full'),
  ('admin', 'boat_shed', 'full'),
  ('admin', 'website_builder', 'full'),
  ('admin', 'event_websites', 'full'),
  ('admin', 'membership_management', 'full'),
  ('admin', 'finance', 'full'),
  ('admin', 'meetings', 'full'),
  ('admin', 'tasks', 'full'),
  ('admin', 'documents', 'full'),
  ('admin', 'advertising', 'full'),

  -- EDITOR: Can create/edit most things, limited admin features
  ('editor', 'race_management', 'edit'),
  ('editor', 'race_calendar', 'edit'),
  ('editor', 'results_display', 'edit'),
  ('editor', 'hms_validator', 'edit'),
  ('editor', 'yacht_classes', 'edit'),
  ('editor', 'venues', 'edit'),
  ('editor', 'live_tracking', 'edit'),
  ('editor', 'digital_start_box', 'edit'),
  ('editor', 'news', 'edit'),
  ('editor', 'media', 'edit'),
  ('editor', 'alfie_tv', 'edit'),
  ('editor', 'livestream', 'edit'),
  ('editor', 'marketing', 'edit'),
  ('editor', 'community', 'edit'),
  ('editor', 'sms_attendance', 'none'),
  ('editor', 'classifieds', 'edit'),
  ('editor', 'resources', 'edit'),
  ('editor', 'weather', 'view'),
  ('editor', 'boat_shed', 'view'),
  ('editor', 'website_builder', 'edit'),
  ('editor', 'event_websites', 'edit'),
  ('editor', 'membership_management', 'edit'),
  ('editor', 'finance', 'edit'),
  ('editor', 'meetings', 'edit'),
  ('editor', 'tasks', 'edit'),
  ('editor', 'documents', 'edit'),
  ('editor', 'advertising', 'none'),

  -- VIEWER: Read-only access to most features, no access to admin-only features
  ('viewer', 'race_management', 'view'),
  ('viewer', 'race_calendar', 'view'),
  ('viewer', 'results_display', 'view'),
  ('viewer', 'hms_validator', 'none'),
  ('viewer', 'yacht_classes', 'view'),
  ('viewer', 'venues', 'view'),
  ('viewer', 'live_tracking', 'view'),
  ('viewer', 'digital_start_box', 'none'),
  ('viewer', 'news', 'view'),
  ('viewer', 'media', 'view'),
  ('viewer', 'alfie_tv', 'view'),
  ('viewer', 'livestream', 'view'),
  ('viewer', 'marketing', 'none'),
  ('viewer', 'community', 'view'),
  ('viewer', 'sms_attendance', 'none'),
  ('viewer', 'classifieds', 'view'),
  ('viewer', 'resources', 'view'),
  ('viewer', 'weather', 'view'),
  ('viewer', 'boat_shed', 'view'),
  ('viewer', 'website_builder', 'none'),
  ('viewer', 'event_websites', 'none'),
  ('viewer', 'membership_management', 'view'),
  ('viewer', 'finance', 'view'),
  ('viewer', 'meetings', 'view'),
  ('viewer', 'tasks', 'view'),
  ('viewer', 'documents', 'view'),
  ('viewer', 'advertising', 'none')
ON CONFLICT (access_level, feature_key) DO NOTHING;