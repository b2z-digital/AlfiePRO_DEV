/*
  # Seed System Dashboard Templates with UUIDs
  
  1. Purpose
    - Creates default dashboard templates in the database
    - Marks them as system templates editable by super admin
    - These templates can be assigned to committee positions
  
  2. Templates Created
    - Race Management (ID: a1111111-1111-1111-1111-111111111111)
    - Finance Management (ID: b2222222-2222-2222-2222-222222222222)
    - Membership Management (ID: c3333333-3333-3333-3333-333333333333)
    - Club Secretary (ID: d4444444-4444-4444-4444-444444444444)
    - Full Overview (ID: e5555555-5555-5555-5555-555555555555)
  
  3. Note
    - Using predictable UUIDs for easier reference
    - These are system-wide templates available to all clubs
*/

INSERT INTO public.dashboard_templates (
  id,
  name,
  description,
  icon,
  template_data,
  is_system_template,
  is_editable_by_super_admin,
  is_default,
  is_public,
  club_id,
  created_by,
  created_at,
  updated_at
) VALUES 
  (
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'Race Management',
    'Perfect for Race Officers - focuses on events, weather, and race results',
    'Calendar',
    '{
      "lg": [
        {"type": "event-count", "row": 0, "col": 0, "width": 4, "height": 1},
        {"type": "event-websites", "row": 0, "col": 4, "width": 4, "height": 1},
        {"type": "tasks-count", "row": 0, "col": 8, "width": 4, "height": 1},
        {"type": "upcoming-events", "row": 1, "col": 0, "width": 6, "height": 2},
        {"type": "recent-results", "row": 1, "col": 6, "width": 6, "height": 2},
        {"type": "weather", "row": 3, "col": 0, "width": 12, "height": 2}
      ],
      "rows": [
        {"id": "row-1", "order": 0, "columns": 3, "height": "compact", "widgetIds": []},
        {"id": "row-2", "order": 1, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-3", "order": 2, "columns": 1, "height": "default", "widgetIds": []}
      ]
    }'::jsonb,
    true,
    true,
    false,
    true,
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    'b2222222-2222-2222-2222-222222222222'::uuid,
    'Finance Management',
    'Perfect for Treasurers - focuses on financial health and transactions',
    'DollarSign',
    '{
      "lg": [
        {"type": "financial-health", "row": 0, "col": 0, "width": 6, "height": 2},
        {"type": "membership-status", "row": 0, "col": 6, "width": 6, "height": 2},
        {"type": "recent-transactions", "row": 2, "col": 0, "width": 6, "height": 2},
        {"type": "pending-invoices", "row": 2, "col": 6, "width": 6, "height": 2},
        {"type": "gross-income", "row": 4, "col": 0, "width": 4, "height": 1},
        {"type": "net-income", "row": 4, "col": 4, "width": 4, "height": 1},
        {"type": "total-expenses", "row": 4, "col": 8, "width": 4, "height": 1}
      ],
      "rows": [
        {"id": "row-1", "order": 0, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-2", "order": 1, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-3", "order": 2, "columns": 3, "height": "compact", "widgetIds": []}
      ]
    }'::jsonb,
    true,
    true,
    false,
    true,
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    'c3333333-3333-3333-3333-333333333333'::uuid,
    'Membership Management',
    'Perfect for Membership Officers - focuses on members and engagement',
    'Users',
    '{
      "lg": [
        {"type": "members-count", "row": 0, "col": 0, "width": 3, "height": 1},
        {"type": "active-members", "row": 0, "col": 3, "width": 3, "height": 1},
        {"type": "new-members", "row": 0, "col": 6, "width": 3, "height": 1},
        {"type": "pending-applications", "row": 0, "col": 9, "width": 3, "height": 1},
        {"type": "recent-applications", "row": 1, "col": 0, "width": 6, "height": 2},
        {"type": "membership-types-large", "row": 1, "col": 6, "width": 6, "height": 2},
        {"type": "members-by-class-large", "row": 3, "col": 0, "width": 6, "height": 2},
        {"type": "member-engagement", "row": 3, "col": 6, "width": 6, "height": 2}
      ],
      "rows": [
        {"id": "row-1", "order": 0, "columns": 4, "height": "compact", "widgetIds": []},
        {"id": "row-2", "order": 1, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-3", "order": 2, "columns": 2, "height": "default", "widgetIds": []}
      ]
    }'::jsonb,
    true,
    true,
    false,
    true,
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    'd4444444-4444-4444-4444-444444444444'::uuid,
    'Club Secretary',
    'Perfect for Club Secretaries - focuses on communications and administrative tasks',
    'FileText',
    '{
      "lg": [
        {"type": "unread-communications", "row": 0, "col": 0, "width": 4, "height": 1},
        {"type": "pending-applications", "row": 0, "col": 4, "width": 4, "height": 1},
        {"type": "meetings-count", "row": 0, "col": 8, "width": 4, "height": 1},
        {"type": "tasks-count", "row": 1, "col": 0, "width": 3, "height": 1},
        {"type": "latest-news", "row": 1, "col": 3, "width": 9, "height": 2},
        {"type": "upcoming-meetings", "row": 3, "col": 0, "width": 12, "height": 2}
      ],
      "rows": [
        {"id": "row-1", "order": 0, "columns": 3, "height": "compact", "widgetIds": []},
        {"id": "row-2", "order": 1, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-3", "order": 2, "columns": 1, "height": "default", "widgetIds": []}
      ]
    }'::jsonb,
    true,
    true,
    false,
    true,
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    'e5555555-5555-5555-5555-555555555555'::uuid,
    'Full Overview',
    'Perfect for Commodores and Admins - comprehensive view of all club activities',
    'LayoutGrid',
    '{
      "lg": [
        {"type": "members-count", "row": 0, "col": 0, "width": 3, "height": 1},
        {"type": "event-count", "row": 0, "col": 3, "width": 3, "height": 1},
        {"type": "tasks-count", "row": 0, "col": 6, "width": 3, "height": 1},
        {"type": "financial-health", "row": 0, "col": 9, "width": 3, "height": 1},
        {"type": "upcoming-events", "row": 1, "col": 0, "width": 6, "height": 2},
        {"type": "recent-results", "row": 1, "col": 6, "width": 6, "height": 2},
        {"type": "membership-overview", "row": 3, "col": 0, "width": 6, "height": 2},
        {"type": "financial-position", "row": 3, "col": 6, "width": 6, "height": 2}
      ],
      "rows": [
        {"id": "row-1", "order": 0, "columns": 4, "height": "compact", "widgetIds": []},
        {"id": "row-2", "order": 1, "columns": 2, "height": "default", "widgetIds": []},
        {"id": "row-3", "order": 2, "columns": 2, "height": "default", "widgetIds": []}
      ]
    }'::jsonb,
    true,
    true,
    false,
    true,
    NULL,
    NULL,
    now(),
    now()
  )
ON CONFLICT (id) 
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  template_data = EXCLUDED.template_data,
  is_system_template = true,
  is_editable_by_super_admin = true,
  updated_at = now();
