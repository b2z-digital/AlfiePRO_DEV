-- Shops: a platform-wide directory of radio sailing suppliers (parts, sails, boats...).
-- Members browse it in the Sailing section and the phone app; super admins manage it from the
-- AlfiePRO Management dashboard (Shops). A supplier can appear in several categories.

CREATE TABLE IF NOT EXISTS public.shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'bag',          -- key from the app's icon set (bag, sail, wrench, radio, boat, tag)
  accent text NOT NULL DEFAULT 'blue',       -- blue | violet | pink | orange | green | teal
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tagline text,                               -- one line under the name
  description text,
  website_url text,
  logo_url text,
  cover_url text,                             -- optional banner image for the storefront card
  brand_color text,                           -- hex, e.g. #0A84FF; drives the card's banner when there's no image
  email text,
  phone text,
  location text,                              -- e.g. "Lake Macquarie, NSW"
  ships_to text,                              -- e.g. "Australia-wide & NZ"
  boat_classes text[] NOT NULL DEFAULT '{}',  -- e.g. {IOM,DF95}
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_supplier_categories (
  supplier_id uuid NOT NULL REFERENCES public.shop_suppliers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.shop_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, category_id)
);
CREATE INDEX IF NOT EXISTS shop_supplier_categories_category_idx ON public.shop_supplier_categories(category_id);

ALTER TABLE public.shop_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_supplier_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can browse what's switched on; super admins see and manage everything.
CREATE POLICY "Anyone can view active shop categories" ON public.shop_categories
  FOR SELECT TO anon, authenticated USING (is_active OR public.is_platform_super_admin());
CREATE POLICY "Super admins manage shop categories" ON public.shop_categories
  FOR ALL TO authenticated USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Anyone can view active shop suppliers" ON public.shop_suppliers
  FOR SELECT TO anon, authenticated USING (is_active OR public.is_platform_super_admin());
CREATE POLICY "Super admins manage shop suppliers" ON public.shop_suppliers
  FOR ALL TO authenticated USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());

CREATE POLICY "Anyone can view shop supplier categories" ON public.shop_supplier_categories
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Super admins manage shop supplier categories" ON public.shop_supplier_categories
  FOR ALL TO authenticated USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());

-- Counts a "Visit shop" tap, so the dashboard can show which suppliers members use.
CREATE OR REPLACE FUNCTION public.record_shop_visit(p_supplier uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shop_suppliers SET visit_count = visit_count + 1 WHERE id = p_supplier AND is_active;
$$;
REVOKE ALL ON FUNCTION public.record_shop_visit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_shop_visit(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_shop_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER shop_categories_touch BEFORE UPDATE ON public.shop_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_shop_updated_at();
CREATE TRIGGER shop_suppliers_touch BEFORE UPDATE ON public.shop_suppliers
  FOR EACH ROW WHEN (OLD.visit_count IS NOT DISTINCT FROM NEW.visit_count)
  EXECUTE FUNCTION public.touch_shop_updated_at();

-- Starter list: the suppliers on the ARYA resources page (descriptions written for Alfie).
-- Logos, emails and phone numbers are added from the dashboard.
DO $$
DECLARE parts uuid; sails uuid; s uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.shop_categories) THEN RETURN; END IF;

  INSERT INTO public.shop_categories (name, description, icon, accent, sort_order)
    VALUES ('Parts & Accessories', 'Fittings, fins, rudders, bulbs, rigging and spares', 'wrench', 'blue', 1) RETURNING id INTO parts;
  INSERT INTO public.shop_categories (name, description, icon, accent, sort_order)
    VALUES ('Sails', 'Sailmakers for every class and rig', 'sail', 'violet', 2) RETURNING id INTO sails;

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, is_featured, sort_order)
    VALUES ('#334155', 'Bergan Sails', 'dB Sails · authorised Joysway dealer',
      'A family-owned business making RC sails, with a large range of DF65 and DF95 parts, accessories and rigging as an authorised Joysway dealer.',
      'https://www.bergansails.shop/', '{DF65,DF95,IOM}', true, 1) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, parts), (s, sails);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, sort_order)
    VALUES ('#2457C5', 'Radio Sailing Shop', 'Fittings for every class',
      'One of the largest ranges of radio and pond yacht fittings in Australasia, covering IOM, Marblehead, 10 Rater, A Class, RG65, Micro Magic, EC12, Soling and multihulls.',
      'http://radiosailingshop.com.au/', '{IOM,Marblehead,10R,A Class}', 2) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, parts);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, sort_order)
    VALUES ('#0E7490', 'Radio Yacht Supplies Australia', 'RC yachts and fittings specialists',
      'Model racing yachts and fittings for IOM, Marblehead, 10 Rater, A Class, EC12, Soling, RG65 and multihulls, serving the RC yachting community for over a decade.',
      'http://rysa.com.au/', '{IOM,Marblehead,10R,A Class}', 3) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, parts);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, sort_order)
    VALUES ('#C0262D', 'Radio Yachts by Red Ant', 'Locally made fins, rudders and bulbs',
      'Fins, rudders, bulbs, mast and boom tubes and fittings made in Australia, alongside selected imported parts for local and international RC owners.',
      'https://redantradioyachts.com/', '{IOM,10R,Marblehead}', 4) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, parts);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, ships_to, boat_classes, sort_order)
    VALUES ('#E2612B', 'SailRC', 'Radio sailing gear online',
      'An online store with a full catalogue of IOM, DF65 and DF95 parts and accessories.',
      'https://sailrc.com.au', 'Australia-wide & NZ', '{IOM,DF65,DF95}', 5) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, parts);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, sort_order)
    VALUES ('#1D4ED8', 'AirTech Sails', 'Handcrafted race sails',
      'Sails designed and made by hand by a sailmaker and boatbuilder with more than 40 years of experience, for the IOM, 10 Rater and Marblehead classes.',
      'https://airtechsails.com.au', '{IOM,10R,Marblehead}', 6) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, sails);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, location, boat_classes, sort_order)
    VALUES ('#0F172A', 'IOM Sails', 'Australian-made IOM sails',
      'Australian designed and built sails for the International One Metre class.',
      'https://iomsails.au', 'Queensland', '{IOM}', 7) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, sails);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, website_url, boat_classes, sort_order)
    VALUES ('#64748B', 'JG Sails', 'Sails cut to the shape you ask for',
      'Sails made since 2003 with consistent, reliable quality. Tell them the shape you want and that is what you get.',
      'https://dawsong8.wixsite.com/jgsails/', '{}', 8) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, sails);

  INSERT INTO public.shop_suppliers (brand_color, name, tagline, description, location, boat_classes, sort_order)
    VALUES ('#CA8A04', 'PB Sails', 'DF65 and DF95 sails in your colours',
      'DF65 and DF95 sails in the colours you choose, ready to rig and checked against the class templates, with help rigging and setting up in the Sydney area.',
      'Sydney, NSW', '{DF65,DF95}', 9) RETURNING id INTO s;
  INSERT INTO public.shop_supplier_categories VALUES (s, sails);
END $$;
