/*
  # Auto-Setup Event Websites System
  
  1. Purpose
     - Automatically create default homepage, header, menu, and footer when a new event website is created
     - Ensure all event websites have a complete, functional setup out of the box
  
  2. Changes
     - Create function to initialize event website with default content
     - Create trigger to run initialization on event website creation
     - Set homepage as is_homepage=true automatically
  
  3. Default Components Created
     - Homepage with welcome section
     - Header with logo/title
     - Menu with navigation
     - Footer with copyright and links
*/

-- Function to initialize a new event website with default content
CREATE OR REPLACE FUNCTION public.initialize_event_website()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_name TEXT;
  v_header_id UUID;
  v_menu_id UUID;
  v_footer_id UUID;
  v_homepage_id UUID;
BEGIN
  -- Get the event name from public_events if available
  SELECT event_name INTO v_event_name
  FROM public_events
  WHERE id = NEW.event_id;

  -- Use event name or fallback to 'Event Website'
  v_event_name := COALESCE(v_event_name, 'Event Website');

  -- Create default header
  INSERT INTO event_global_sections (event_website_id, section_type, enabled, config)
  VALUES (
    NEW.id,
    'header',
    true,
    jsonb_build_object(
      'height', 80,
      'logo_type', 'text',
      'header_text', v_event_name,
      'text_size', 28,
      'text_color', '#1e293b',
      'background_color', '#ffffff',
      'logo_position', 'center',
      'show_event_name', true,
      'logo_size', 60
    )
  )
  RETURNING id INTO v_header_id;

  -- Create default menu with hamburger style
  INSERT INTO event_global_sections (event_website_id, section_type, enabled, config)
  VALUES (
    NEW.id,
    'menu',
    true,
    jsonb_build_object(
      'style', 'dropdown',
      'menu_style', 'hamburger',
      'position', 'sticky',
      'menu_position', 'left',
      'scroll_behavior', 'sticky',
      'background_color', '#ffffff',
      'text_color', '#1e293b',
      'hover_color', '#06b6d4',
      'hamburger_color', '#1e293b',
      'menu_items', '[]'::jsonb,
      'cta_buttons', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'label', 'Register Now',
          'url', '#register',
          'type', 'internal',
          'style', 'primary',
          'position', 'right',
          'background_color', '#06b6d4',
          'text_color', '#ffffff'
        )
      )
    )
  )
  RETURNING id INTO v_menu_id;

  -- Create default footer
  INSERT INTO event_global_sections (event_website_id, section_type, enabled, config)
  VALUES (
    NEW.id,
    'footer',
    true,
    jsonb_build_object(
      'background_color', '#1e293b',
      'text_color', '#94a3b8',
      'show_social_links', false,
      'show_contact_info', true,
      'copyright_text', '© ' || EXTRACT(YEAR FROM NOW())::text || ' ' || v_event_name || '. All rights reserved.',
      'social_links', '{}'::jsonb,
      'footer_columns', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'title', 'Quick Links',
          'links', jsonb_build_array(
            jsonb_build_object('label', 'Home', 'url', '/'),
            jsonb_build_object('label', 'News', 'url', '/news'),
            jsonb_build_object('label', 'Contact', 'url', '/contact')
          )
        )
      )
    )
  )
  RETURNING id INTO v_footer_id;

  -- Create default homepage with welcome section
  INSERT INTO event_page_layouts (
    event_website_id,
    page_slug,
    title,
    page_type,
    is_homepage,
    is_published,
    show_in_navigation,
    navigation_order,
    rows
  )
  VALUES (
    NEW.id,
    'home',
    'Home',
    'home',
    true,
    true,
    true,
    0,
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'order', 0,
        'fullWidth', true,
        'background', jsonb_build_object('type', 'color', 'value', '#0f172a'),
        'padding', jsonb_build_object('top', 64, 'bottom', 64, 'left', 16, 'right', 16),
        'margin', jsonb_build_object('top', 0, 'bottom', 0, 'left', 0, 'right', 0),
        'columns', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'width', 12,
            'widgets', jsonb_build_array(
              jsonb_build_object(
                'id', gen_random_uuid()::text,
                'type', 'text-block',
                'order', 0,
                'settings', jsonb_build_object(
                  'content', '<h1 style="text-align: center; color: #ffffff; font-size: 48px; font-weight: bold; margin-bottom: 16px;">Welcome to ' || v_event_name || '</h1><p style="text-align: center; color: #94a3b8; font-size: 20px;">Stay tuned for more information about this exciting event!</p>',
                  'padding', jsonb_build_object('top', 0, 'bottom', 0, 'left', 0, 'right', 0)
                )
              )
            )
          )
        )
      )
    )
  )
  RETURNING id INTO v_homepage_id;

  RAISE NOTICE 'Event website initialized: header=%, menu=%, footer=%, homepage=%', v_header_id, v_menu_id, v_footer_id, v_homepage_id;

  RETURN NEW;
END;
$$;

-- Create trigger to automatically initialize event websites
DROP TRIGGER IF EXISTS trigger_initialize_event_website ON event_websites;
CREATE TRIGGER trigger_initialize_event_website
  AFTER INSERT ON event_websites
  FOR EACH ROW
  EXECUTE FUNCTION initialize_event_website();

-- Also ensure existing homepage pages are marked correctly
UPDATE event_page_layouts
SET is_homepage = true
WHERE page_type = 'home'
AND is_homepage = false;

COMMENT ON FUNCTION initialize_event_website IS 'Automatically creates default header, menu, footer, and homepage when a new event website is created';