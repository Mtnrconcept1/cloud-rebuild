ALTER TABLE public.cuisines
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

CREATE UNIQUE INDEX IF NOT EXISTS cuisines_slug_unique_idx
  ON public.cuisines (slug)
  WHERE slug IS NOT NULL;

INSERT INTO public.cuisines (name, slug, keywords)
VALUES
  ('Italien', 'italien', ARRAY['pizza', 'pates', 'lasagne', 'risotto', 'trattoria']),
  ('Pizza', 'pizza', ARRAY['pizzeria', 'margherita', 'napolitaine', 'calzone']),
  ('Pates', 'pates', ARRAY['spaghetti', 'penne', 'tagliatelle', 'gnocchi']),
  ('Burger', 'burger', ARRAY['hamburger', 'smash burger', 'cheeseburger', 'frites']),
  ('Grillades', 'grillades', ARRAY['steak', 'barbecue', 'viande', 'bbq', 'cote de boeuf']),
  ('Francais', 'francais', ARRAY['brasserie', 'bistrot', 'traditionnel', 'terroir']),
  ('Suisse', 'suisse', ARRAY['fondue', 'raclette', 'rosti', 'brasserie suisse']),
  ('Japonais', 'japonais', ARRAY['sushi', 'ramen', 'yakitori', 'izakaya']),
  ('Sushi', 'sushi', ARRAY['maki', 'nigiri', 'sashimi', 'chirashi']),
  ('Ramen', 'ramen', ARRAY['udon', 'bouillon', 'nouilles japonaises']),
  ('Chinois', 'chinois', ARRAY['dim sum', 'wok', 'canard laque', 'nouilles']),
  ('Thai', 'thai', ARRAY['pad thai', 'curry thai', 'tom yum', 'thai street food']),
  ('Indien', 'indien', ARRAY['curry', 'tandoori', 'naan', 'biryani']),
  ('Pakistanais', 'pakistanais', ARRAY['karahi', 'biryani', 'grill pakistanais']),
  ('Libanais', 'libanais', ARRAY['mezze', 'shawarma', 'falafel', 'manouche']),
  ('Turc', 'turc', ARRAY['kebab', 'doner', 'lahmacun', 'grill turc']),
  ('Kebab', 'kebab', ARRAY['doner', 'durum', 'galette', 'sandwich kebab']),
  ('Tacos', 'tacos', ARRAY['tacos gratine', 'french tacos', 'double viande']),
  ('Mexicain', 'mexicain', ARRAY['burrito', 'quesadilla', 'nachos', 'guacamole']),
  ('Mediterraneen', 'mediterraneen', ARRAY['mezze', 'grillades', 'huile d olive', 'soleil']),
  ('Marocain', 'marocain', ARRAY['couscous', 'tajine', 'pastilla', 'maroc']),
  ('Africain', 'africain', ARRAY['maf', 'yassa', 'alloco', 'thieb']),
  ('Creole', 'creole', ARRAY['accras', 'colombo', 'bokit', 'antillais']),
  ('Americain', 'americain', ARRAY['fried chicken', 'bbq', 'ribs', 'diner']),
  ('Halal', 'halal', ARRAY['halal food', 'viande halal', 'grill halal']),
  ('Vegetarien', 'vegetarien', ARRAY['veggie', 'sans viande', 'vegetal']),
  ('Vegan', 'vegan', ARRAY['plant based', '100 vegetal', 'sans produit animal']),
  ('Healthy', 'healthy', ARRAY['equilibre', 'fit', 'light', 'bien etre']),
  ('Salades', 'salades', ARRAY['bowl', 'fraicheur', 'caesar', 'crudites']),
  ('Poke', 'poke', ARRAY['poke bowl', 'saumon', 'avocat', 'hawaiien']),
  ('Brunch', 'brunch', ARRAY['petit dejeuner', 'oeufs benedict', 'pancakes']),
  ('Petit-dejeuner', 'petit-dejeuner', ARRAY['cafe', 'croissant', 'tartine', 'matin']),
  ('Boulangerie', 'boulangerie', ARRAY['pain', 'viennoiserie', 'sandwich', 'artisan']),
  ('Patisserie', 'patisserie', ARRAY['gateau', 'dessert', 'tarte', 'eclair']),
  ('Desserts', 'desserts', ARRAY['glace', 'crepe', 'gaufre', 'sucre']),
  ('Cafe', 'cafe', ARRAY['coffee shop', 'espresso', 'latte', 'cappuccino']),
  ('Sandwich', 'sandwich', ARRAY['panini', 'club sandwich', 'bagel', 'wrap']),
  ('Street Food', 'street-food', ARRAY['snacking', 'street', 'finger food', 'sur le pouce'])
ON CONFLICT (name) DO UPDATE
SET
  slug = EXCLUDED.slug,
  keywords = EXCLUDED.keywords;

INSERT INTO public.restaurant_cuisines (restaurant_id, cuisine_id)
SELECT DISTINCT r.id, c.id
FROM public.restaurants r
JOIN public.cuisines c
  ON lower(coalesce(r.cuisine_type, '')) LIKE '%' || lower(c.name) || '%'
  OR EXISTS (
    SELECT 1
    FROM unnest(coalesce(c.keywords, '{}'::text[])) AS keyword
    WHERE lower(coalesce(r.cuisine_type, '')) LIKE '%' || lower(keyword) || '%'
  )
ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING;
