/*
  # Add Sub-Category Support and Create Club Stuff Sub-Categories

  1. Schema Changes
    - Add `parent_id` column to `support_faq_categories` for nesting
    - Add foreign key constraint referencing self

  2. New Sub-Categories under "Club Stuff"
    - Club Membership
    - Meetings
    - Tasks
    - Finances
    - Documents

  3. Data Changes
    - Reassign existing Club Stuff FAQs to their appropriate sub-categories
    - Update sort_order to match dashboard menu order

  4. Notes
    - Parent category "Club Stuff" (832bb051-0349-4a1d-a168-86ebd45c9aaf) remains
    - Sub-categories are children with parent_id pointing to Club Stuff
*/

-- Add parent_id column for nested categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_faq_categories' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.support_faq_categories ADD COLUMN parent_id uuid REFERENCES public.support_faq_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create sub-categories under Club Stuff
INSERT INTO public.support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('c2000000-0000-0000-0000-000000000001', 'Club Membership', 'club-membership', 'Managing your club members, applications, renewals, and committee', 'Users', 1, true, '832bb051-0349-4a1d-a168-86ebd45c9aaf'),
  ('c2000000-0000-0000-0000-000000000002', 'Meetings', 'meetings', 'Scheduling meetings, tracking attendance, and recording minutes', 'Calendar', 2, true, '832bb051-0349-4a1d-a168-86ebd45c9aaf'),
  ('c2000000-0000-0000-0000-000000000003', 'Tasks', 'tasks', 'Creating, assigning, and tracking club tasks and action items', 'CheckSquare', 3, true, '832bb051-0349-4a1d-a168-86ebd45c9aaf'),
  ('c2000000-0000-0000-0000-000000000004', 'Finances', 'finances', 'Recording transactions, invoices, budgets, and financial reports', 'DollarSign', 4, true, '832bb051-0349-4a1d-a168-86ebd45c9aaf'),
  ('c2000000-0000-0000-0000-000000000005', 'Documents', 'documents', 'Creating forms, document templates, and the public NOR generator', 'FolderOpen', 5, true, '832bb051-0349-4a1d-a168-86ebd45c9aaf')
ON CONFLICT (id) DO NOTHING;

-- Reassign Club Membership FAQs (IDs 001-014, 039)
UPDATE public.support_faqs SET category_id = 'c2000000-0000-0000-0000-000000000001'
WHERE id IN (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000005',
  'c1000000-0000-0000-0000-000000000006',
  'c1000000-0000-0000-0000-000000000007',
  'c1000000-0000-0000-0000-000000000008',
  'c1000000-0000-0000-0000-000000000009',
  'c1000000-0000-0000-0000-000000000010',
  'c1000000-0000-0000-0000-000000000011',
  'c1000000-0000-0000-0000-000000000012',
  'c1000000-0000-0000-0000-000000000013',
  'c1000000-0000-0000-0000-000000000014',
  'c1000000-0000-0000-0000-000000000039'
);

-- Reassign Meetings FAQs (IDs 015-021)
UPDATE public.support_faqs SET category_id = 'c2000000-0000-0000-0000-000000000002'
WHERE id IN (
  'c1000000-0000-0000-0000-000000000015',
  'c1000000-0000-0000-0000-000000000016',
  'c1000000-0000-0000-0000-000000000017',
  'c1000000-0000-0000-0000-000000000018',
  'c1000000-0000-0000-0000-000000000019',
  'c1000000-0000-0000-0000-000000000020',
  'c1000000-0000-0000-0000-000000000021'
);

-- Reassign Tasks FAQs (IDs 022-026)
UPDATE public.support_faqs SET category_id = 'c2000000-0000-0000-0000-000000000003'
WHERE id IN (
  'c1000000-0000-0000-0000-000000000022',
  'c1000000-0000-0000-0000-000000000023',
  'c1000000-0000-0000-0000-000000000024',
  'c1000000-0000-0000-0000-000000000025',
  'c1000000-0000-0000-0000-000000000026'
);

-- Reassign Finances FAQs (IDs 027-034)
UPDATE public.support_faqs SET category_id = 'c2000000-0000-0000-0000-000000000004'
WHERE id IN (
  'c1000000-0000-0000-0000-000000000027',
  'c1000000-0000-0000-0000-000000000028',
  'c1000000-0000-0000-0000-000000000029',
  'c1000000-0000-0000-0000-000000000030',
  'c1000000-0000-0000-0000-000000000031',
  'c1000000-0000-0000-0000-000000000032',
  'c1000000-0000-0000-0000-000000000033',
  'c1000000-0000-0000-0000-000000000034'
);

-- Reassign Documents FAQs (IDs 035-038)
UPDATE public.support_faqs SET category_id = 'c2000000-0000-0000-0000-000000000005'
WHERE id IN (
  'c1000000-0000-0000-0000-000000000035',
  'c1000000-0000-0000-0000-000000000036',
  'c1000000-0000-0000-0000-000000000037',
  'c1000000-0000-0000-0000-000000000038'
);

-- Update sort_order within each sub-category to match dashboard menu order
-- Club Membership: 1-15
UPDATE public.support_faqs SET sort_order = 1 WHERE id = 'c1000000-0000-0000-0000-000000000001';
UPDATE public.support_faqs SET sort_order = 2 WHERE id = 'c1000000-0000-0000-0000-000000000002';
UPDATE public.support_faqs SET sort_order = 3 WHERE id = 'c1000000-0000-0000-0000-000000000003';
UPDATE public.support_faqs SET sort_order = 4 WHERE id = 'c1000000-0000-0000-0000-000000000004';
UPDATE public.support_faqs SET sort_order = 5 WHERE id = 'c1000000-0000-0000-0000-000000000005';
UPDATE public.support_faqs SET sort_order = 6 WHERE id = 'c1000000-0000-0000-0000-000000000006';
UPDATE public.support_faqs SET sort_order = 7 WHERE id = 'c1000000-0000-0000-0000-000000000007';
UPDATE public.support_faqs SET sort_order = 8 WHERE id = 'c1000000-0000-0000-0000-000000000008';
UPDATE public.support_faqs SET sort_order = 9 WHERE id = 'c1000000-0000-0000-0000-000000000009';
UPDATE public.support_faqs SET sort_order = 10 WHERE id = 'c1000000-0000-0000-0000-000000000010';
UPDATE public.support_faqs SET sort_order = 11 WHERE id = 'c1000000-0000-0000-0000-000000000011';
UPDATE public.support_faqs SET sort_order = 12 WHERE id = 'c1000000-0000-0000-0000-000000000012';
UPDATE public.support_faqs SET sort_order = 13 WHERE id = 'c1000000-0000-0000-0000-000000000013';
UPDATE public.support_faqs SET sort_order = 14 WHERE id = 'c1000000-0000-0000-0000-000000000014';
UPDATE public.support_faqs SET sort_order = 15 WHERE id = 'c1000000-0000-0000-0000-000000000039';

-- Meetings: 1-7
UPDATE public.support_faqs SET sort_order = 1 WHERE id = 'c1000000-0000-0000-0000-000000000015';
UPDATE public.support_faqs SET sort_order = 2 WHERE id = 'c1000000-0000-0000-0000-000000000016';
UPDATE public.support_faqs SET sort_order = 3 WHERE id = 'c1000000-0000-0000-0000-000000000017';
UPDATE public.support_faqs SET sort_order = 4 WHERE id = 'c1000000-0000-0000-0000-000000000018';
UPDATE public.support_faqs SET sort_order = 5 WHERE id = 'c1000000-0000-0000-0000-000000000019';
UPDATE public.support_faqs SET sort_order = 6 WHERE id = 'c1000000-0000-0000-0000-000000000020';
UPDATE public.support_faqs SET sort_order = 7 WHERE id = 'c1000000-0000-0000-0000-000000000021';

-- Tasks: 1-5
UPDATE public.support_faqs SET sort_order = 1 WHERE id = 'c1000000-0000-0000-0000-000000000022';
UPDATE public.support_faqs SET sort_order = 2 WHERE id = 'c1000000-0000-0000-0000-000000000023';
UPDATE public.support_faqs SET sort_order = 3 WHERE id = 'c1000000-0000-0000-0000-000000000024';
UPDATE public.support_faqs SET sort_order = 4 WHERE id = 'c1000000-0000-0000-0000-000000000025';
UPDATE public.support_faqs SET sort_order = 5 WHERE id = 'c1000000-0000-0000-0000-000000000026';

-- Finances: 1-8
UPDATE public.support_faqs SET sort_order = 1 WHERE id = 'c1000000-0000-0000-0000-000000000027';
UPDATE public.support_faqs SET sort_order = 2 WHERE id = 'c1000000-0000-0000-0000-000000000028';
UPDATE public.support_faqs SET sort_order = 3 WHERE id = 'c1000000-0000-0000-0000-000000000029';
UPDATE public.support_faqs SET sort_order = 4 WHERE id = 'c1000000-0000-0000-0000-000000000030';
UPDATE public.support_faqs SET sort_order = 5 WHERE id = 'c1000000-0000-0000-0000-000000000031';
UPDATE public.support_faqs SET sort_order = 6 WHERE id = 'c1000000-0000-0000-0000-000000000032';
UPDATE public.support_faqs SET sort_order = 7 WHERE id = 'c1000000-0000-0000-0000-000000000033';
UPDATE public.support_faqs SET sort_order = 8 WHERE id = 'c1000000-0000-0000-0000-000000000034';

-- Documents: 1-4
UPDATE public.support_faqs SET sort_order = 1 WHERE id = 'c1000000-0000-0000-0000-000000000035';
UPDATE public.support_faqs SET sort_order = 2 WHERE id = 'c1000000-0000-0000-0000-000000000036';
UPDATE public.support_faqs SET sort_order = 3 WHERE id = 'c1000000-0000-0000-0000-000000000037';
UPDATE public.support_faqs SET sort_order = 4 WHERE id = 'c1000000-0000-0000-0000-000000000038';