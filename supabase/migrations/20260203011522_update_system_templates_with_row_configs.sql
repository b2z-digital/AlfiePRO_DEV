/*
  # Update System Templates with Row Configs

  1. Changes
    - Updates all system templates to include row_configs in template_data JSON
    - This allows the dashboard to properly render row heights when loading templates
    - Adds row configuration metadata alongside widget layouts

  2. Notes
    - Row configs specify the number of columns and height for each row
    - This fixes the template loading and saving functionality
*/

-- Update Race Management template
UPDATE public.dashboard_templates
SET template_data = jsonb_set(
  template_data,
  '{row_configs}',
  '[
    {"row": 0, "columns": 3, "height": "compact"},
    {"row": 1, "columns": 2, "height": "default"},
    {"row": 3, "columns": 3, "height": "default"}
  ]'::jsonb
)
WHERE id = 'a1111111-1111-1111-1111-111111111111'::uuid;

-- Update Finance Management template
UPDATE public.dashboard_templates
SET template_data = jsonb_set(
  template_data,
  '{row_configs}',
  '[
    {"row": 0, "columns": 2, "height": "default"},
    {"row": 2, "columns": 2, "height": "default"},
    {"row": 3, "columns": 2, "height": "compact"}
  ]'::jsonb
)
WHERE id = 'b2222222-2222-2222-2222-222222222222'::uuid;

-- Update Membership Management template
UPDATE public.dashboard_templates
SET template_data = jsonb_set(
  template_data,
  '{row_configs}',
  '[
    {"row": 0, "columns": 3, "height": "default"},
    {"row": 1, "columns": 2, "height": "default"},
    {"row": 2, "columns": 2, "height": "default"}
  ]'::jsonb
)
WHERE id = 'c3333333-3333-3333-3333-333333333333'::uuid;

-- Update Club Secretary template
UPDATE public.dashboard_templates
SET template_data = jsonb_set(
  template_data,
  '{row_configs}',
  '[
    {"row": 0, "columns": 3, "height": "compact"},
    {"row": 1, "columns": 2, "height": "default"},
    {"row": 3, "columns": 2, "height": "default"}
  ]'::jsonb
)
WHERE id = 'd4444444-4444-4444-4444-444444444444'::uuid;

-- Update Full Overview template
UPDATE public.dashboard_templates
SET template_data = jsonb_set(
  template_data,
  '{row_configs}',
  '[
    {"row": 0, "columns": 4, "height": "compact"},
    {"row": 1, "columns": 2, "height": "default"},
    {"row": 3, "columns": 3, "height": "default"}
  ]'::jsonb
)
WHERE id = 'e5555555-5555-5555-5555-555555555555'::uuid;
