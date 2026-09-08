-- Expand the provider-agnostic TheTok print catalog used by Marketing Studio.
--
-- Provider references are intentionally NOT seeded here. Cloudprinter products
-- remain account-scoped operational data discovered by print-catalog/sync,
-- explicitly mapped by an administrator, then hydrated through /products/info.

INSERT INTO public.print_products (
  slug,
  display_name,
  category,
  description,
  marketing_tool_id,
  default_width_mm,
  default_height_mm,
  default_orientation,
  sort_order,
  metadata
) VALUES
  (
    'business-card-55x85',
    'Carte 55 × 85 mm',
    'business_card',
    'Carte de visite portrait.',
    'business_card',
    55,
    85,
    'portrait',
    55,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  ),
  (
    'business-card-55x55',
    'Carte 55 × 55 mm',
    'business_card',
    'Carte de visite carrée.',
    'business_card',
    55,
    55,
    'square',
    56,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  ),
  (
    'menu-dl-98x210',
    'Carte / menu DL 98 × 210 mm',
    'restaurant_menu',
    'Carte de menu au format DL.',
    'restaurant_menu',
    98,
    210,
    'portrait',
    60,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  ),
  (
    'folded-menu-a6',
    'Menu plié A6 · ouvert 210 × 148 mm',
    'folded_leaflet',
    'Menu plié A6 ; format fermé 105 × 148 mm.',
    'folded_leaflet',
    210,
    148,
    'landscape',
    70,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true,"folded_width_mm":105,"folded_height_mm":148}'::jsonb
  ),
  (
    'folded-menu-a5',
    'Menu plié A5 · ouvert 296 × 210 mm',
    'folded_leaflet',
    'Menu plié A5 ; format fermé 148 × 210 mm.',
    'folded_leaflet',
    296,
    210,
    'landscape',
    80,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true,"folded_width_mm":148,"folded_height_mm":210}'::jsonb
  ),
  (
    'calendar-desk-a5',
    'Calendrier bureau A5 · 210 × 148 mm',
    'calendar',
    'Calendrier de bureau A5.',
    NULL,
    210,
    148,
    'landscape',
    90,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  ),
  (
    'calendar-wall-a4',
    'Calendrier mural A4 · 210 × 297 mm',
    'calendar',
    'Calendrier mural A4.',
    NULL,
    210,
    297,
    'portrait',
    100,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  ),
  (
    'calendar-wall-a3',
    'Calendrier mural A3 · 297 × 420 mm',
    'calendar',
    'Calendrier mural A3.',
    NULL,
    297,
    420,
    'portrait',
    110,
    '{"cloudprinter_catalog":true,"restaurant_relevant":true}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  marketing_tool_id = EXCLUDED.marketing_tool_id,
  default_width_mm = EXCLUDED.default_width_mm,
  default_height_mm = EXCLUDED.default_height_mm,
  default_orientation = EXCLUDED.default_orientation,
  sort_order = EXCLUDED.sort_order,
  metadata = public.print_products.metadata || EXCLUDED.metadata,
  active = true,
  updated_at = now();
