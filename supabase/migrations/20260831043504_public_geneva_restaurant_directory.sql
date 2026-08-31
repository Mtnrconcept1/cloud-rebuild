ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_directory_listing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_source text,
  ADD COLUMN IF NOT EXISTS directory_source_reference text;

COMMENT ON COLUMN public.restaurants.is_directory_listing IS
  'True only for public, unclaimed directory listings imported from vetted public restaurant datasets. These rows are never transaction-enabled.';
COMMENT ON COLUMN public.restaurants.directory_source IS
  'Server-owned provenance label for an unclaimed public directory listing.';
COMMENT ON COLUMN public.restaurants.directory_source_reference IS
  'Stable source identifier used for idempotent directory imports and later claim reconciliation.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_directory_source_reference
  ON public.restaurants(directory_source, directory_source_reference)
  WHERE is_directory_listing IS TRUE;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_directory_listing_fail_closed'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_directory_listing_fail_closed CHECK (
        is_directory_listing IS FALSE OR (
          is_demo IS FALSE
          AND is_active IS TRUE
          AND lower(COALESCE(status, '')) = 'active'
          AND COALESCE(delivery_available, false) IS FALSE
          AND COALESCE(supports_dinein, false) IS FALSE
          AND COALESCE(supports_reservation, false) IS FALSE
          AND COALESCE(supports_scheduled, false) IS FALSE
          AND COALESCE(supports_pickup, false) IS FALSE
          AND COALESCE(supports_scheduled_orders, false) IS FALSE
          AND COALESCE(supports_group_orders, false) IS FALSE
          AND COALESCE(is_featured, false) IS FALSE
          AND stripe_account_id IS NULL
          AND COALESCE(stripe_connect_details_submitted, false) IS FALSE
          AND COALESCE(stripe_connect_charges_enabled, false) IS FALSE
          AND COALESCE(stripe_connect_payouts_enabled, false) IS FALSE
          AND NULLIF(btrim(COALESCE(directory_source, '')), '') IS NOT NULL
          AND NULLIF(btrim(COALESCE(directory_source_reference, '')), '') IS NOT NULL
        )
      );
  END IF;
END;
$constraint$;

CREATE OR REPLACE FUNCTION public.protect_directory_listing_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_service boolean := COALESCE(auth.role() = 'service_role', false);
  v_actor_is_admin boolean := COALESCE(public.has_role(v_actor_id, 'admin'::public.app_role), false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_directory_listing IS TRUE
      AND v_actor_id IS NOT NULL
      AND NOT v_actor_is_admin
      AND NOT v_actor_is_service
    THEN
      RAISE EXCEPTION 'Les fiches annuaire sont gérées par le serveur.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.is_directory_listing IS DISTINCT FROM OLD.is_directory_listing
    OR NEW.directory_source IS DISTINCT FROM OLD.directory_source
    OR NEW.directory_source_reference IS DISTINCT FROM OLD.directory_source_reference
  THEN
    IF v_actor_id IS NOT NULL AND NOT v_actor_is_admin AND NOT v_actor_is_service THEN
      RAISE EXCEPTION 'La provenance annuaire est gérée par le serveur.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.is_directory_listing IS TRUE THEN
    IF NEW.is_demo IS TRUE
      OR NEW.is_active IS DISTINCT FROM TRUE
      OR lower(COALESCE(NEW.status, '')) <> 'active'
      OR COALESCE(NEW.delivery_available, false) IS TRUE
      OR COALESCE(NEW.supports_dinein, false) IS TRUE
      OR COALESCE(NEW.supports_reservation, false) IS TRUE
      OR COALESCE(NEW.supports_scheduled, false) IS TRUE
      OR COALESCE(NEW.supports_pickup, false) IS TRUE
      OR COALESCE(NEW.supports_scheduled_orders, false) IS TRUE
      OR COALESCE(NEW.supports_group_orders, false) IS TRUE
      OR COALESCE(NEW.is_featured, false) IS TRUE
      OR NEW.stripe_account_id IS NOT NULL
      OR COALESCE(NEW.stripe_connect_details_submitted, false) IS TRUE
      OR COALESCE(NEW.stripe_connect_charges_enabled, false) IS TRUE
      OR COALESCE(NEW.stripe_connect_payouts_enabled, false) IS TRUE
      OR NULLIF(btrim(COALESCE(NEW.directory_source, '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(NEW.directory_source_reference, '')), '') IS NULL
    THEN
      RAISE EXCEPTION 'Une fiche annuaire publique doit rester non transactionnelle.' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurants_00_protect_directory_listing_state ON public.restaurants;
CREATE TRIGGER restaurants_00_protect_directory_listing_state
BEFORE INSERT OR UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.protect_directory_listing_state();

DO $patch$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'protect_restaurant_moderation_state'
    AND p.prorettype = 'trigger'::regtype
  LIMIT 1;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'protect_restaurant_moderation_state() is missing';
  END IF;

  IF position('COALESCE(NEW.is_directory_listing, false) IS FALSE' in v_definition) = 0 THEN
    v_patched := replace(
      v_definition,
      'AND NOT public.restaurant_is_approved_for_publication(NEW.id, NEW.owner_id)',
      'AND COALESCE(NEW.is_directory_listing, false) IS FALSE' || chr(10) ||
      '    AND NOT public.restaurant_is_approved_for_publication(NEW.id, NEW.owner_id)'
    );

    IF v_patched = v_definition THEN
      RAISE EXCEPTION 'Moderation trigger definition drifted; directory exception not applied';
    END IF;

    EXECUTE v_patched;
  END IF;
END;
$patch$;

WITH eligible AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY
        public.normalize_search_text(c.display_name),
        public.normalize_search_text(COALESCE(c.street_address, ''))
      ORDER BY
        CASE WHEN c.branch = 'Restaurant référencé sur TheFork' THEN 0 ELSE 1 END,
        c.source_objectid NULLS LAST,
        c.id
    ) AS dedupe_rank
  FROM public.marketing_contacts c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND (
      c.branch = 'Restaurants, cafés, snack-bar, tea-rooms et salons de dégustation de glaces'
      OR c.branch = 'Restaurant référencé sur TheFork'
    )
), deduplicated AS (
  SELECT * FROM eligible WHERE dedupe_rank = 1
), prepared AS (
  SELECT
    d.*,
    COALESCE(NULLIF(btrim(d.city), ''), NULLIF(btrim(d.commune), ''), 'Genève') AS public_city,
    COALESCE(
      NULLIF(btrim(d.street_address), ''),
      NULLIF(btrim(concat_ws(' ', NULLIF(btrim(d.postal_code), ''), COALESCE(NULLIF(btrim(d.city), ''), NULLIF(btrim(d.commune), ''), 'Genève'))), ''),
      'Genève'
    ) AS public_address,
    public.tok_slugify(d.display_name) AS base_slug
  FROM deduplicated d
  WHERE NULLIF(btrim(d.display_name), '') IS NOT NULL
), candidates AS (
  SELECT
    p.*,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE lower(COALESCE(r.city, '')) = lower(p.public_city)
          AND r.slug = p.base_slug
      )
      OR count(*) OVER (PARTITION BY lower(p.public_city), p.base_slug) > 1
      THEN p.base_slug || '-' || substr(md5(COALESCE(p.source_objectid::text, p.id::text)), 1, 8)
      ELSE p.base_slug
    END AS final_slug
  FROM prepared p
)
INSERT INTO public.restaurants (
  id, owner_id, name, description, cuisine_type, address, city, phone,
  rating, review_count, price_range, is_active, delivery_available,
  delivery_fee, min_order_amount, latitude, longitude, points_multiplier,
  status, avg_rating, rating_count, base_delivery_fee, is_featured,
  supports_dinein, supports_reservation, supports_scheduled_orders,
  supports_group_orders, supports_scheduled, supports_pickup, slug, is_demo,
  is_directory_listing, directory_source, directory_source_reference
)
SELECT
  (
    substr(md5('tok-public-directory:' || COALESCE(c.source_objectid::text, c.id::text)), 1, 8) || '-' ||
    substr(md5('tok-public-directory:' || COALESCE(c.source_objectid::text, c.id::text)), 9, 4) || '-4' ||
    substr(md5('tok-public-directory:' || COALESCE(c.source_objectid::text, c.id::text)), 14, 3) || '-8' ||
    substr(md5('tok-public-directory:' || COALESCE(c.source_objectid::text, c.id::text)), 18, 3) || '-' ||
    substr(md5('tok-public-directory:' || COALESCE(c.source_objectid::text, c.id::text)), 21, 12)
  )::uuid,
  '00000000-0000-4000-8000-000000000404'::uuid,
  left(btrim(c.display_name), 240),
  'Établissement référencé dans l’annuaire public TOK. Les services de réservation, commande et livraison ne sont activés que lorsque l’établissement les propose officiellement sur TOK.',
  CASE
    WHEN c.branch = 'Restaurant référencé sur TheFork'
      AND NULLIF(btrim(c.category), '') IS NOT NULL
      AND c.category <> 'Restaurant TheFork'
    THEN left(c.category, 120)
    ELSE NULL
  END,
  left(c.public_address, 240),
  left(c.public_city, 120),
  NULLIF(btrim(c.phone), ''),
  0, 0, 2, true, false, 0, 0,
  c.latitude::double precision,
  c.longitude::double precision,
  1.0,
  'active', 0, 0, 0, false,
  false, false, false, false, false, false,
  left(c.final_slug, 180),
  false, true,
  'commercial_prospect_catalog',
  COALESCE(c.source_objectid::text, c.id::text)
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.restaurants r
  WHERE public.normalize_search_text(r.name) = public.normalize_search_text(c.display_name)
    AND public.normalize_search_text(COALESCE(r.address, '')) = public.normalize_search_text(COALESCE(c.public_address, ''))
)
ON CONFLICT DO NOTHING;

DO $postflight$
DECLARE
  v_candidates integer;
  v_covered integer;
  v_directory integer;
  v_unsafe integer;
  v_excluded integer;
BEGIN
  WITH eligible AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY public.normalize_search_text(c.display_name), public.normalize_search_text(COALESCE(c.street_address, ''))
        ORDER BY CASE WHEN c.branch = 'Restaurant référencé sur TheFork' THEN 0 ELSE 1 END, c.source_objectid NULLS LAST, c.id
      ) AS rn
    FROM public.marketing_contacts c
    WHERE c.source_system = 'commercial_prospect_catalog'
      AND (c.branch = 'Restaurants, cafés, snack-bar, tea-rooms et salons de dégustation de glaces' OR c.branch = 'Restaurant référencé sur TheFork')
  ), dedup AS (
    SELECT
      e.*,
      COALESCE(NULLIF(btrim(e.city), ''), NULLIF(btrim(e.commune), ''), 'Genève') AS public_city,
      COALESCE(NULLIF(btrim(e.street_address), ''), NULLIF(btrim(concat_ws(' ', NULLIF(btrim(e.postal_code), ''), COALESCE(NULLIF(btrim(e.city), ''), NULLIF(btrim(e.commune), ''), 'Genève'))), ''), 'Genève') AS public_address
    FROM eligible e
    WHERE rn = 1 AND NULLIF(btrim(e.display_name), '') IS NOT NULL
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE public.normalize_search_text(r.name) = public.normalize_search_text(dedup.display_name)
          AND public.normalize_search_text(COALESCE(r.address, '')) = public.normalize_search_text(COALESCE(dedup.public_address, ''))
      )
    )::integer
  INTO v_candidates, v_covered
  FROM dedup;

  SELECT count(*)::integer INTO v_directory
  FROM public.restaurants
  WHERE is_directory_listing IS TRUE
    AND directory_source = 'commercial_prospect_catalog';

  SELECT count(*)::integer INTO v_unsafe
  FROM public.restaurants
  WHERE is_directory_listing IS TRUE
    AND (
      COALESCE(delivery_available, false)
      OR COALESCE(supports_dinein, false)
      OR COALESCE(supports_reservation, false)
      OR COALESCE(supports_scheduled, false)
      OR COALESCE(supports_pickup, false)
      OR COALESCE(supports_scheduled_orders, false)
      OR COALESCE(supports_group_orders, false)
      OR COALESCE(is_featured, false)
      OR stripe_account_id IS NOT NULL
      OR COALESCE(stripe_connect_charges_enabled, false)
      OR COALESCE(stripe_connect_payouts_enabled, false)
    );

  SELECT count(*)::integer INTO v_excluded
  FROM public.restaurants r
  JOIN public.marketing_contacts c
    ON r.directory_source_reference = COALESCE(c.source_objectid::text, c.id::text)
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_source = 'commercial_prospect_catalog'
    AND c.source_system = 'commercial_prospect_catalog'
    AND c.branch IN ('Bars', 'Administration et gestion d''établissements de restauration', 'Discothèques, dancings, night clubs');

  IF v_candidates <> v_covered THEN
    RAISE EXCEPTION 'Directory import incomplete: % candidates, % covered', v_candidates, v_covered;
  END IF;
  IF v_directory < 4000 THEN
    RAISE EXCEPTION 'Directory import unexpectedly small: % rows', v_directory;
  END IF;
  IF v_unsafe <> 0 THEN
    RAISE EXCEPTION 'Directory safety invariant failed for % rows', v_unsafe;
  END IF;
  IF v_excluded <> 0 THEN
    RAISE EXCEPTION 'Excluded non-restaurant categories leaked into directory: % rows', v_excluded;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$postflight$;
