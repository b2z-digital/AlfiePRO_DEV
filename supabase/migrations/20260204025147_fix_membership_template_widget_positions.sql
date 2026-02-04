/*
  # Fix Membership Template Widget Positions

  1. Changes
    - Resets the Membership Management system template with clean widget positions
    - Fixes widget column positions to match row configurations
    - Removes overlapping widgets at col 0
    - Ensures all widgets are within valid column ranges

  2. Template Layout
    - Row 1: 3 columns (compact) - Member stats
    - Row 2: 2 columns (default) - Membership details and applications
*/

-- Reset Membership Management template with clean data
UPDATE public.dashboard_templates
SET template_data = '{
  "lg": [
    {
      "type": "members-count",
      "row": 1,
      "col": 0,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "blue"
      },
      "colorTheme": "blue"
    },
    {
      "type": "new-members",
      "row": 1,
      "col": 1,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "green"
      },
      "colorTheme": "green"
    },
    {
      "type": "membership-renewals",
      "row": 1,
      "col": 2,
      "width": 1,
      "height": 1,
      "settings": {
        "colorTheme": "amber"
      },
      "colorTheme": "amber"
    },
    {
      "type": "membership-types-large",
      "row": 2,
      "col": 0,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    },
    {
      "type": "recent-applications",
      "row": 2,
      "col": 1,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    }
  ],
  "md": [
    {
      "type": "members-count",
      "row": 1,
      "col": 0,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "blue"
      },
      "colorTheme": "blue"
    },
    {
      "type": "new-members",
      "row": 1,
      "col": 1,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "green"
      },
      "colorTheme": "green"
    },
    {
      "type": "membership-renewals",
      "row": 1,
      "col": 2,
      "width": 1,
      "height": 1,
      "settings": {
        "colorTheme": "amber"
      },
      "colorTheme": "amber"
    },
    {
      "type": "membership-types-large",
      "row": 2,
      "col": 0,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    },
    {
      "type": "recent-applications",
      "row": 2,
      "col": 1,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    }
  ],
  "sm": [
    {
      "type": "members-count",
      "row": 1,
      "col": 0,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "blue"
      },
      "colorTheme": "blue"
    },
    {
      "type": "new-members",
      "row": 1,
      "col": 1,
      "width": 3,
      "height": 1,
      "settings": {
        "colorTheme": "green"
      },
      "colorTheme": "green"
    },
    {
      "type": "membership-renewals",
      "row": 1,
      "col": 2,
      "width": 1,
      "height": 1,
      "settings": {
        "colorTheme": "amber"
      },
      "colorTheme": "amber"
    },
    {
      "type": "membership-types-large",
      "row": 2,
      "col": 0,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    },
    {
      "type": "recent-applications",
      "row": 2,
      "col": 1,
      "width": 6,
      "height": 2,
      "settings": {},
      "colorTheme": "default"
    }
  ],
  "rows": [
    {
      "id": "row-2",
      "order": 1,
      "height": "compact",
      "columns": 3,
      "widgetIds": []
    },
    {
      "id": "row-3",
      "order": 2,
      "height": "default",
      "columns": 2,
      "widgetIds": []
    }
  ],
  "row_configs": [
    {
      "row": 1,
      "columns": 3,
      "height": "compact"
    },
    {
      "row": 2,
      "columns": 2,
      "height": "default"
    }
  ]
}'::jsonb
WHERE id = 'c3333333-3333-3333-3333-333333333333'::uuid
  AND is_system_template = true;