-- Seed La Gazelle d'Or as a public, reservable TOK restaurant page.
--
-- Public references consulted on 2026-06-07:
-- https://www.thefork.ch/restaurant/la-gazelle-d-or-r849111
-- https://www.thefork.ch/restaurant/la-gazelle-d-or-r849111/menu
-- https://lagazelledor.eatbu.com/
-- Address source: Rue de Lyon 55, 1203 Genève.

CREATE TEMP TABLE tmp_la_gazelle_dor_restaurant (
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
  image_url text NOT NULL,
  slug text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_la_gazelle_dor_restaurant (
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
  image_url,
  slug
) VALUES (
  'La Gazelle d''Or',
  'Cuisine érythréenne et éthiopienne à Genève, pensée pour le partage autour de l''injera, des sambusas, des salades fraîches et du café traditionnel.',
  'Ethiopien',
  'Rue de Lyon 55',
  'Geneve',
  '+41 22 340 33 50',
  9.5,
  244,
  9.5,
  244,
  3,
  false,
  0.00,
  0.00,
  46.2117,
  6.1361,
  '/images/indian-feast.jpeg',
  'la-gazelle-d-or'
);

CREATE TEMP TABLE tmp_la_gazelle_dor_menu_items (
  name text PRIMARY KEY,
  description text NOT NULL,
  price numeric NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_la_gazelle_dor_menu_items (name, description, price, category, image_url) VALUES
  ('Sambusa fait maison', 'Feuilletés maison fourrés au bœuf et aux légumes.', 9.00, 'Entrées', '/images/samosa.jpg'),
  ('Sambusa végétarienne', 'Feuilletés maison fourrés aux légumes.', 9.00, 'Entrées', '/images/samosa.jpg'),
  ('Timatum salade', 'Salade de laitue, tomates et oignons avec sauce épicée.', 9.00, 'Entrées', '/images/salade-du-marche.jpg'),
  ('Salade du chef', 'Tomates, oignons, poulet et œufs durs servis sur un lit de laitue.', 15.00, 'Entrées', '/images/salade-du-marche.jpg'),
  ('Carte de vin rouge, blanc ou rosé', 'Bouteille de vin rouge, blanc ou rosé.', 20.00, 'Boissons', '/images/limonade menthe.jpeg'),
  ('Verre de vin rouge, blanc ou rosé', 'Verre de vin rouge, blanc ou rosé.', 4.50, 'Boissons', '/images/limonade menthe.jpeg'),
  ('Cocktail', 'Cocktail de la maison.', 12.00, 'Boissons', '/images/limonade menthe.jpeg'),
  ('Cocktail sans alcool', 'Cocktail sans alcool.', 4.00, 'Boissons', '/images/limonade menthe.jpeg'),
  ('Boisson froide soft', 'Soft frais.', 4.50, 'Boissons', '/images/limonade menthe.jpeg'),
  ('Café traditionnel', 'Café servi selon le rituel traditionnel.', 7.50, 'Café traditionnel', '/images/mango lassi.jpeg'),
  ('Café simple', 'Café simple.', 3.50, 'Café traditionnel', '/images/mango lassi.jpeg');

DO $$
DECLARE
  v_owner uuid;
  v_restaurant_id uuid;
  v_opening_hours jsonb;
BEGIN
  SELECT user_id
  INTO v_owner
  FROM public.user_roles
  WHERE role = 'restaurateur'
  ORDER BY user_id
  LIMIT 1;

  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    RAISE NOTICE 'Skipping La Gazelle d''Or seed because no owner account exists yet.';
    RETURN;
  END IF;

  v_opening_hours := jsonb_build_object(
    'lundi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'mardi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'mercredi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'jeudi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'vendredi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'samedi', jsonb_build_object('open', '11:30', 'close', '22:30'),
    'dimanche', jsonb_build_object('closed', true),
    'service_settings', jsonb_build_object(
      'lunch', jsonb_build_object(
        'start_time', '11:30',
        'end_time', '14:30',
        'last_reservation_time', '14:00',
        'max_covers', 48,
        'min_party_size', 1,
        'max_party_size', 8,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      ),
      'dinner', jsonb_build_object(
        'start_time', '18:30',
        'end_time', '22:30',
        'last_reservation_time', '22:00',
        'max_covers', 64,
        'min_party_size', 1,
        'max_party_size', 10,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      )
    )
  );

  UPDATE public.restaurants AS r
  SET
    owner_id = COALESCE(r.owner_id, v_owner),
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
    slug = 'la-gazelle-d-or',
    supports_pickup = true,
    supports_dinein = true,
    supports_reservation = true,
    supports_group_orders = true,
    supports_scheduled = true,
    supports_scheduled_orders = true,
    status = 'active',
    disabled_dashboard_features = '{}'::text[],
    opening_hours = jsonb_strip_nulls(COALESCE(r.opening_hours, '{}'::jsonb) || v_opening_hours)
  FROM tmp_la_gazelle_dor_restaurant AS t
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
    slug,
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
    v_owner,
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
    t.slug,
    v_opening_hours,
    true,
    true,
    true,
    true,
    true,
    true,
    'active',
    '{}'::text[]
  FROM tmp_la_gazelle_dor_restaurant AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.restaurants AS r
    WHERE lower(r.name) = lower(t.name)
       OR (
        lower(COALESCE(r.address, '')) = lower(t.address)
        AND lower(COALESCE(r.city, '')) = lower(t.city)
       )
  );

  SELECT r.id
  INTO v_restaurant_id
  FROM public.restaurants AS r
  JOIN tmp_la_gazelle_dor_restaurant AS t
    ON lower(r.name) = lower(t.name)
   AND lower(COALESCE(r.address, '')) = lower(t.address)
   AND lower(COALESCE(r.city, '')) = lower(t.city)
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RAISE NOTICE 'La Gazelle d''Or seed could not resolve restaurant id.';
    RETURN;
  END IF;

  UPDATE public.menu_items AS mi
  SET
    description = t.description,
    price = t.price,
    category = t.category,
    image_url = t.image_url,
    is_available = true,
    is_exclusive = false,
    exclusive_type = NULL
  FROM tmp_la_gazelle_dor_menu_items AS t
  WHERE mi.restaurant_id = v_restaurant_id
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
    v_restaurant_id,
    t.name,
    t.description,
    t.price,
    t.category,
    true,
    t.image_url,
    false,
    NULL
  FROM tmp_la_gazelle_dor_menu_items AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.menu_items AS mi
    WHERE mi.restaurant_id = v_restaurant_id
      AND lower(mi.name) = lower(t.name)
  );

  INSERT INTO public.restaurant_media (
    restaurant_id,
    media_url,
    media_type,
    alt_text,
    is_cover,
    position
  )
  SELECT
    v_restaurant_id,
    '/images/indian-feast.jpeg',
    'photo',
    'Grand plat africain à partager avec légumes, sauces et pain plat',
    NOT EXISTS (
      SELECT 1
      FROM public.restaurant_media rm
      WHERE rm.restaurant_id = v_restaurant_id
        AND rm.is_cover = true
    ),
    1
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.restaurant_media rm
    WHERE rm.restaurant_id = v_restaurant_id
      AND rm.media_url = '/images/indian-feast.jpeg'
  );

  UPDATE public.restaurant_promotions AS rp
  SET
    promotion_type = 'percent',
    promotion_value = 30.00,
    target = 'reservation',
    start_at = now(),
    end_at = now() + interval '180 days',
    active = true
  WHERE rp.restaurant_id = v_restaurant_id
    AND lower(rp.name) = lower('Gazelle d''Or -30% réservation');

  INSERT INTO public.restaurant_promotions (
    restaurant_id,
    name,
    promotion_type,
    promotion_value,
    target,
    start_at,
    end_at,
    active
  )
  SELECT
    v_restaurant_id,
    'Gazelle d''Or -30% réservation',
    'percent',
    30.00,
    'reservation',
    now(),
    now() + interval '180 days',
    true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.restaurant_promotions rp
    WHERE rp.restaurant_id = v_restaurant_id
      AND lower(rp.name) = lower('Gazelle d''Or -30% réservation')
  );
END $$;

NOTIFY pgrst, 'reload schema';
