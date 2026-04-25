-- Seed Quirinale for rbarman with public menu anchors from TheFork and
-- platform-native offers for formulas, chef's table, flash sale, and anti-waste.
--
-- Public references consulted on 2026-04-25:
-- https://www.thefork.fr/restaurant/quirinale-r859225/menu
-- https://www.thefork.ch/restaurant/quirinale-r859225/avis

CREATE TEMP TABLE tmp_quirinale_restaurant (
  name text PRIMARY KEY,
  description text NOT NULL,
  cuisine_type text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  phone text,
  rating numeric NOT NULL,
  review_count integer NOT NULL,
  avg_rating numeric NOT NULL,
  rating_count integer NOT NULL,
  price_range integer NOT NULL,
  delivery_available boolean NOT NULL,
  delivery_fee numeric NOT NULL,
  min_order_amount numeric NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  image_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_restaurant (
  name,
  description,
  cuisine_type,
  address,
  city,
  phone,
  rating,
  review_count,
  avg_rating,
  rating_count,
  price_range,
  delivery_available,
  delivery_fee,
  min_order_amount,
  latitude,
  longitude,
  image_url
) VALUES (
  'Quirinale',
  'Table italienne premium a Saint-Gervais avec pinsa romana, pates de maison, poissons, viandes et ambiance elegante.',
  'Italien',
  'Pl. de Saint-Gervais 1',
  'Geneve',
  '+41 22 731 50 23',
  4.3,
  38,
  4.3,
  38,
  4,
  false,
  0.00,
  0.00,
  46.2058393,
  6.1422816,
  '/images/octopus-fine-dining.jpeg'
);

CREATE TEMP TABLE tmp_quirinale_menu_items (
  name text PRIMARY KEY,
  description text NOT NULL,
  price numeric NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_menu_items (name, description, price, category, image_url) VALUES
  ('Rucola e parmigiano', 'Roquette fraiche, copeaux de parmigiano reggiano, tomates cerises et vinaigrette a l huile d olive.', 13.00, 'Entrees', '/images/salade-du-marche.jpg'),
  ('Caprese di bufala', 'Mozzarella di bufala, tomates fraiches, basilic et huile d olive.', 17.00, 'Entrees', '/images/salade-du-marche.jpg'),
  ('Antipasto misto', 'Assortiment de charcuteries italiennes, fromages, olives et legumes grilles.', 20.00, 'Entrees', '/images/prosciutto e rucola.avif'),
  ('Carpaccio di manzo', 'Tranches fines de boeuf, roquette, parmesan, vinaigre balsamique et fruit de la passion.', 21.00, 'Entrees', '/images/prosciutto e rucola.avif'),
  ('Salade de poulpe', 'Poulpe cuit a basse temperature, celeri, tomates cerises, pomme de terre, persil frais, citron et huile d olive extra vierge.', 24.00, 'Entrees', '/images/octopus-fine-dining.jpeg'),

  ('Cotoletta alla milanese', 'Escalope de veau panee a la milanaise, doree au beurre clarifie, croustillante a l exterieur et fondante a coeur.', 45.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('Branzino al forno', 'Loup de mer roti au four, citron, herbes et legumes grilles.', 46.00, 'Plats', '/images/filets de perche.jpg'),
  ('Bistecca fiorentina', 'Filet de boeuf en tagliata grillee a la florentine, servi avec roquette et copeaux de parmesan.', 58.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('Scaloppine al limone', 'Escalope de veau au citron servie avec des legumes sautes.', 46.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('Ossobucco alla milanese', 'Jarret de veau confit lentement, jus corse, legumes fondants et notes d agrumes.', 43.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('Filet de perche meuniere', 'Filets de perche poeles au beurre, citron frais, persil plat cisele et fleur de sel.', 48.00, 'Plats', '/images/filets de perche.jpg'),

  ('Rigatoni al ragu', 'Rigatoni nappes d un ragout d agneau mijote longuement, parfume aux herbes et au vin rouge.', 38.00, 'Pates', '/images/pasta-assortment.jpeg'),
  ('Spaghetti carbonara', 'Guanciale croustillant, jaunes d oeufs et pecorino romano.', 28.00, 'Pates', '/images/pasta-assortment.jpeg'),
  ('Spaghetti frutti del mare', 'Selection de fruits de mer, tomates, ail, persil et huile d olive extra vierge.', 37.00, 'Pates', '/images/pasta-assortment.jpeg'),
  ('Ravioli al tartufo', 'Raviolis maison farcis a la ricotta et aux epinards, servis avec une creme legere au parmesan et a la truffe noire.', 46.00, 'Pates', '/images/pasta-assortment.jpeg'),
  ('Tagliatelle foie gras', 'Tagliatelle fraiches avec sauce onctueuse au foie gras fondu, montees a la minute.', 43.00, 'Pates', '/images/pasta-assortment.jpeg'),

  ('Margherita', 'Tomate san marzano, mozzarella fior di latte, basilic frais et huile d olive extra vierge.', 20.00, 'Pinsa romana', '/images/pizza diavola.avif'),
  ('Prosciutto', 'Tomate san marzano, mozzarella fior di latte, jambon cuit, basilic frais et huile d olive extra vierge.', 23.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),
  ('Parma', 'Tomate san marzano, mozzarella fior di latte, jambon de parme, basilic frais et huile d olive extra vierge.', 26.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),
  ('Diavola', 'Tomate san marzano, mozzarella fior di latte, oignons, poivron, salami piquant et basilic frais.', 25.00, 'Pinsa romana', '/images/pizza diavola.avif'),
  ('Valentino', 'Tomate san marzano, mozzarella fior di latte, jambon de parme, burrata a la truffe, roquette et basilic frais.', 32.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),
  ('Quirinale', 'Mozzarella fior di latte, mortadelle, pistaches, stracciatella et huile d olive extra vierge.', 32.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),
  ('Dolce gabbana', 'Creme legere, saumon fume, oignons, citron et aneth.', 33.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),
  ('Cavalli', 'Creme legere, burrata, gambas roties, ail, zeste de citron et huile d olive.', 37.00, 'Pinsa romana', '/images/prosciutto e rucola.avif'),

  ('Petits farcis du chef', 'Petits poivrons fondants farcis a la viande de boeuf, revisites selon l inspiration du chef.', 42.00, 'Suggestions', '/images/octopus-fine-dining.jpeg'),
  ('Ravioli au foie gras et sauce au porto', 'Raviolis maison au coeur fondant de foie gras, nappes d une reduction au porto.', 44.00, 'Suggestions', '/images/pasta-assortment.jpeg'),
  ('Carpaccio de poulpe', 'Fines tranches de poulpe assaisonnees avec precision pour reveler la noblesse du produit.', 43.00, 'Suggestions', '/images/octopus-fine-dining.jpeg'),

  ('Tiramisu classico', 'Creme mascarpone, cafe, cacao et biscuits savoiardi.', 14.00, 'Desserts', '/images/1.webp'),
  ('Gelato artigianale', 'Glaces artisanales vanille, chocolat, pistache ou citron.', 12.00, 'Desserts', '/images/mochi-glaces.jpg'),
  ('Crostata di frutta', 'Tartelette a la pate sablee avec creme patissiere et fruits frais de saison.', 14.00, 'Desserts', '/images/tarte aux noix.webp');

CREATE TEMP TABLE tmp_quirinale_formula_blueprints (
  formula_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  discount_percent integer NOT NULL,
  image_url text NOT NULL,
  availability jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_formula_blueprints (formula_key, name, description, discount_percent, image_url, availability) VALUES
  (
    'entree_plat',
    'Entree + Plat',
    'Formule Quirinale active au dejeuner et au diner sur les entrees et plats signatures.',
    10,
    '/images/bruschetta.jpg',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  ),
  (
    'plat_dessert',
    'Plat + Dessert',
    'Formule orientee dejeuner d affaires et fin de repas italienne.',
    12,
    '/images/1.webp',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  ),
  (
    'entree_plat_dessert',
    'Menu Quirinale',
    'Menu complet avec la meilleure remise sur entree, plat et dessert.',
    18,
    '/images/octopus-fine-dining.jpeg',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  );

CREATE TEMP TABLE tmp_quirinale_formula_categories (
  formula_key text NOT NULL,
  category text NOT NULL,
  course_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_formula_categories (formula_key, category, course_order) VALUES
  ('entree_plat', 'Entrees', 1),
  ('entree_plat', 'Plats', 2),
  ('entree_plat', 'Pates', 2),
  ('entree_plat', 'Pinsa romana', 2),
  ('entree_plat', 'Suggestions', 2),
  ('plat_dessert', 'Plats', 1),
  ('plat_dessert', 'Pates', 1),
  ('plat_dessert', 'Pinsa romana', 1),
  ('plat_dessert', 'Suggestions', 1),
  ('plat_dessert', 'Desserts', 2),
  ('entree_plat_dessert', 'Entrees', 1),
  ('entree_plat_dessert', 'Plats', 2),
  ('entree_plat_dessert', 'Pates', 2),
  ('entree_plat_dessert', 'Pinsa romana', 2),
  ('entree_plat_dessert', 'Suggestions', 2),
  ('entree_plat_dessert', 'Desserts', 3);

CREATE TEMP TABLE tmp_quirinale_flash_sales (
  title text PRIMARY KEY,
  description text NOT NULL,
  image_url text NOT NULL,
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL,
  sale_start time NOT NULL,
  sale_end time NOT NULL,
  delivery_available boolean NOT NULL,
  takeaway_available boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_flash_sales (
  title,
  description,
  image_url,
  original_price,
  discounted_price,
  quantity_available,
  sale_start,
  sale_end,
  delivery_available,
  takeaway_available
) VALUES (
  'Pinsa Quirinale a emporter',
  'Vente flash du soir sur la pinsa signature mortadelle, pistaches et stracciatella.',
  '/images/prosciutto e rucola.avif',
  32.00,
  24.90,
  8,
  '18:00',
  '21:30',
  false,
  true
);

CREATE TEMP TABLE tmp_quirinale_anti_waste_offers (
  title text PRIMARY KEY,
  description text NOT NULL,
  image_url text NOT NULL,
  offer_type text NOT NULL,
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL,
  pickup_start time NOT NULL,
  pickup_end time NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_anti_waste_offers (
  title,
  description,
  image_url,
  offer_type,
  original_price,
  discounted_price,
  quantity_available,
  pickup_start,
  pickup_end
) VALUES (
  'Panier italien de fermeture',
  'Selection de fin de service composee selon les disponibilites du comptoir italien.',
  '/images/pasta-assortment.jpeg',
  'surprise_bag',
  34.00,
  19.90,
  4,
  '21:30',
  '23:00'
);

CREATE TEMP TABLE tmp_quirinale_chefs_table (
  dish_name text PRIMARY KEY,
  chef_name text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  price numeric NOT NULL,
  original_price numeric NOT NULL,
  total_portions integer NOT NULL,
  drop_offset_hours integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_quirinale_chefs_table (
  dish_name,
  chef_name,
  description,
  image_url,
  price,
  original_price,
  total_portions,
  drop_offset_hours
) VALUES (
  'Ravioli al tartufo minute',
  'Chef de la maison',
  'Experience table du chef autour des raviolis maison a la truffe noire, servis en petite serie au diner.',
  '/images/pasta-assortment.jpeg',
  58.00,
  68.00,
  10,
  24
);

DO $$
DECLARE
  v_rbarman_user_id uuid;
  v_opening_hours jsonb;
BEGIN
  SELECT id
  INTO v_rbarman_user_id
  FROM auth.users
  WHERE email = 'rbarman@hotmail.ch'
  LIMIT 1;

  IF v_rbarman_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for rbarman@hotmail.ch; skipping Quirinale seed.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_rbarman_user_id, 'restaurateur'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  v_opening_hours := jsonb_build_object(
    'lundi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'mardi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'mercredi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'jeudi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'vendredi', jsonb_build_object('open', '12:00', 'close', '23:00'),
    'samedi', jsonb_build_object('open', '12:00', 'close', '23:00'),
    'dimanche', jsonb_build_object('open', '12:00', 'close', '22:00'),
    'service_settings', jsonb_build_object(
      'lunch', jsonb_build_object(
        'start_time', '12:00',
        'end_time', '14:30',
        'last_reservation_time', '14:00',
        'max_covers', 42,
        'min_party_size', 1,
        'max_party_size', 6,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      ),
      'dinner', jsonb_build_object(
        'start_time', '19:00',
        'end_time', '22:30',
        'last_reservation_time', '22:00',
        'max_covers', 60,
        'min_party_size', 1,
        'max_party_size', 8,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      )
    )
  );

  UPDATE public.restaurants AS r
  SET
    owner_id = v_rbarman_user_id,
    name = t.name,
    description = t.description,
    cuisine_type = t.cuisine_type,
    address = t.address,
    city = t.city,
    phone = t.phone,
    rating = t.rating,
    review_count = t.review_count,
    avg_rating = t.avg_rating,
    rating_count = t.rating_count,
    price_range = t.price_range,
    is_active = true,
    is_featured = true,
    delivery_available = t.delivery_available,
    delivery_fee = t.delivery_fee,
    base_delivery_fee = t.delivery_fee,
    min_order_amount = t.min_order_amount,
    latitude = t.latitude,
    longitude = t.longitude,
    image_url = t.image_url,
    supports_pickup = true,
    supports_dinein = true,
    supports_reservation = true,
    supports_group_orders = true,
    supports_scheduled = true,
    supports_scheduled_orders = true,
    status = 'active',
    disabled_dashboard_features = '{}'::text[],
    opening_hours = jsonb_strip_nulls(COALESCE(r.opening_hours, '{}'::jsonb) || v_opening_hours)
  FROM tmp_quirinale_restaurant AS t
  WHERE lower(r.name) = lower(t.name)
     OR (
      lower(COALESCE(r.address, '')) = lower(t.address)
      AND lower(COALESCE(r.city, '')) = lower(t.city)
     );

  INSERT INTO public.restaurants (
    owner_id,
    name,
    description,
    cuisine_type,
    address,
    city,
    phone,
    rating,
    review_count,
    avg_rating,
    rating_count,
    price_range,
    is_active,
    is_featured,
    delivery_available,
    delivery_fee,
    base_delivery_fee,
    min_order_amount,
    latitude,
    longitude,
    image_url,
    opening_hours,
    supports_pickup,
    supports_dinein,
    supports_reservation,
    supports_group_orders,
    supports_scheduled,
    supports_scheduled_orders,
    status,
    disabled_dashboard_features
  )
  SELECT
    v_rbarman_user_id,
    t.name,
    t.description,
    t.cuisine_type,
    t.address,
    t.city,
    t.phone,
    t.rating,
    t.review_count,
    t.avg_rating,
    t.rating_count,
    t.price_range,
    true,
    true,
    t.delivery_available,
    t.delivery_fee,
    t.delivery_fee,
    t.min_order_amount,
    t.latitude,
    t.longitude,
    t.image_url,
    v_opening_hours,
    true,
    true,
    true,
    true,
    true,
    true,
    'active',
    '{}'::text[]
  FROM tmp_quirinale_restaurant AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.restaurants AS r
    WHERE lower(r.name) = lower(t.name)
       OR (
        lower(COALESCE(r.address, '')) = lower(t.address)
        AND lower(COALESCE(r.city, '')) = lower(t.city)
       )
  );
END $$;

CREATE TEMP TABLE tmp_quirinale_target_restaurants ON COMMIT DROP AS
SELECT r.id AS restaurant_id
FROM public.restaurants AS r
JOIN tmp_quirinale_restaurant AS t
  ON lower(r.name) = lower(t.name)
 AND lower(COALESCE(r.address, '')) = lower(t.address)
 AND lower(COALESCE(r.city, '')) = lower(t.city);

UPDATE public.menu_items
SET is_available = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_quirinale_target_restaurants
);

UPDATE public.menu_items AS mi
SET
  description = t.description,
  price = t.price,
  category = t.category,
  image_url = t.image_url,
  is_available = true,
  is_exclusive = false,
  exclusive_type = NULL
FROM tmp_quirinale_menu_items AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE mi.restaurant_id = tr.restaurant_id
  AND lower(mi.name) = lower(t.name);

INSERT INTO public.menu_items (
  restaurant_id,
  name,
  description,
  price,
  category,
  is_available,
  image_url,
  is_exclusive,
  exclusive_type
)
SELECT
  tr.restaurant_id,
  t.name,
  t.description,
  t.price,
  t.category,
  true,
  t.image_url,
  false,
  NULL
FROM tmp_quirinale_menu_items AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.menu_items AS mi
  WHERE mi.restaurant_id = tr.restaurant_id
    AND lower(mi.name) = lower(t.name)
);

UPDATE public.meal_formulas
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_quirinale_target_restaurants
)
AND (
  COALESCE(is_standard, false) = true
  OR formula_key IN (SELECT formula_key FROM tmp_quirinale_formula_blueprints)
);

UPDATE public.meal_formulas AS mf
SET
  name = b.name,
  description = b.description,
  discount_percent = b.discount_percent,
  applies_to = 'both',
  image_url = b.image_url,
  is_active = true,
  is_standard = true,
  availability = b.availability
FROM tmp_quirinale_formula_blueprints AS b
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE mf.restaurant_id = tr.restaurant_id
  AND mf.formula_key = b.formula_key;

INSERT INTO public.meal_formulas (
  restaurant_id,
  name,
  description,
  formula_key,
  discount_percent,
  applies_to,
  image_url,
  is_active,
  is_standard,
  availability
)
SELECT
  tr.restaurant_id,
  b.name,
  b.description,
  b.formula_key,
  b.discount_percent,
  'both',
  b.image_url,
  true,
  true,
  b.availability
FROM tmp_quirinale_target_restaurants AS tr
CROSS JOIN tmp_quirinale_formula_blueprints AS b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.meal_formulas AS mf
  WHERE mf.restaurant_id = tr.restaurant_id
    AND mf.formula_key = b.formula_key
);

DELETE FROM public.meal_formula_categories AS mfc
USING public.meal_formulas AS mf
JOIN tmp_quirinale_target_restaurants AS tr
  ON tr.restaurant_id = mf.restaurant_id
WHERE mfc.formula_id = mf.id
  AND mf.formula_key IN (SELECT formula_key FROM tmp_quirinale_formula_blueprints);

INSERT INTO public.meal_formula_categories (
  formula_id,
  category,
  course_order
)
SELECT
  mf.id,
  c.category,
  c.course_order
FROM public.meal_formulas AS mf
JOIN tmp_quirinale_target_restaurants AS tr
  ON tr.restaurant_id = mf.restaurant_id
JOIN tmp_quirinale_formula_categories AS c
  ON c.formula_key = mf.formula_key
WHERE mf.formula_key IN (SELECT formula_key FROM tmp_quirinale_formula_blueprints);

UPDATE public.flash_sales
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_quirinale_target_restaurants
);

UPDATE public.flash_sales AS fs
SET
  description = t.description,
  image_url = t.image_url,
  original_price = t.original_price,
  discounted_price = t.discounted_price,
  quantity_available = LEAST(COALESCE(fs.quantity_available, t.quantity_available), t.quantity_available),
  sale_date = current_date,
  sale_start = t.sale_start,
  sale_end = t.sale_end,
  delivery_available = t.delivery_available,
  takeaway_available = t.takeaway_available,
  is_active = true,
  updated_at = now()
FROM tmp_quirinale_flash_sales AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE fs.restaurant_id = tr.restaurant_id
  AND lower(fs.title) = lower(t.title);

INSERT INTO public.flash_sales (
  restaurant_id,
  title,
  description,
  image_url,
  original_price,
  discounted_price,
  quantity_available,
  sale_date,
  sale_start,
  sale_end,
  is_active,
  delivery_available,
  takeaway_available
)
SELECT
  tr.restaurant_id,
  t.title,
  t.description,
  t.image_url,
  t.original_price,
  t.discounted_price,
  t.quantity_available,
  current_date,
  t.sale_start,
  t.sale_end,
  true,
  t.delivery_available,
  t.takeaway_available
FROM tmp_quirinale_flash_sales AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.flash_sales AS fs
  WHERE fs.restaurant_id = tr.restaurant_id
    AND lower(fs.title) = lower(t.title)
);

UPDATE public.anti_waste_offers
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_quirinale_target_restaurants
);

UPDATE public.anti_waste_offers AS awo
SET
  description = t.description,
  image_url = t.image_url,
  offer_type = t.offer_type,
  original_price = t.original_price,
  discounted_price = t.discounted_price,
  quantity_available = LEAST(COALESCE(awo.quantity_available, t.quantity_available), t.quantity_available),
  pickup_start = t.pickup_start,
  pickup_end = t.pickup_end,
  available_date = current_date,
  is_active = true
FROM tmp_quirinale_anti_waste_offers AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE awo.restaurant_id = tr.restaurant_id
  AND lower(awo.title) = lower(t.title);

INSERT INTO public.anti_waste_offers (
  restaurant_id,
  title,
  description,
  image_url,
  offer_type,
  original_price,
  discounted_price,
  quantity_available,
  pickup_start,
  pickup_end,
  available_date,
  is_active
)
SELECT
  tr.restaurant_id,
  t.title,
  t.description,
  t.image_url,
  t.offer_type,
  t.original_price,
  t.discounted_price,
  t.quantity_available,
  t.pickup_start,
  t.pickup_end,
  current_date,
  true
FROM tmp_quirinale_anti_waste_offers AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.anti_waste_offers AS awo
  WHERE awo.restaurant_id = tr.restaurant_id
    AND lower(awo.title) = lower(t.title)
);

UPDATE public.chef_table_drops
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_quirinale_target_restaurants
);

UPDATE public.chef_table_drops AS ctd
SET
  chef_name = t.chef_name,
  description = t.description,
  image_url = t.image_url,
  price = t.price,
  original_price = t.original_price,
  total_portions = t.total_portions,
  remaining_portions = LEAST(COALESCE(ctd.remaining_portions, t.total_portions), t.total_portions),
  drop_time = date_trunc('minute', now() + make_interval(hours => t.drop_offset_hours)),
  is_active = true,
  updated_at = now()
FROM tmp_quirinale_chefs_table AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE ctd.restaurant_id = tr.restaurant_id
  AND lower(ctd.dish_name) = lower(t.dish_name);

INSERT INTO public.chef_table_drops (
  restaurant_id,
  dish_name,
  chef_name,
  description,
  image_url,
  price,
  original_price,
  total_portions,
  remaining_portions,
  drop_time,
  is_active
)
SELECT
  tr.restaurant_id,
  t.dish_name,
  t.chef_name,
  t.description,
  t.image_url,
  t.price,
  t.original_price,
  t.total_portions,
  t.total_portions,
  date_trunc('minute', now() + make_interval(hours => t.drop_offset_hours)),
  true
FROM tmp_quirinale_chefs_table AS t
JOIN tmp_quirinale_target_restaurants AS tr
  ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chef_table_drops AS ctd
  WHERE ctd.restaurant_id = tr.restaurant_id
    AND lower(ctd.dish_name) = lower(t.dish_name)
);
