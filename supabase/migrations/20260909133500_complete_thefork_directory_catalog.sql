BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Only the 440 restaurants already verified in the versioned 2026-07-24
-- TheFork dataset are eligible for this synchronization. The reserved
-- source_objectid range 2600000121..2600000200 intentionally stays out of the
-- public directory until a trustworthy source is available for those rows.
DO $preflight$
BEGIN
  IF to_regclass('public.commercial_prospect_catalog') IS NULL
    OR to_regclass('public.marketing_contacts') IS NULL
    OR to_regclass('public.restaurants') IS NULL
    OR to_regclass('public.restaurant_directory_name_jobs') IS NULL
    OR to_regclass('public.restaurant_directory_image_jobs') IS NULL
    OR to_regclass('public.restaurant_image_discovery_jobs') IS NULL
  THEN
    RAISE EXCEPTION 'Required directory pipeline relation is missing';
  END IF;
END;
$preflight$;

WITH source_rows AS (
  SELECT c.*,
    COALESCE(NULLIF(btrim(c.city), ''), NULLIF(btrim(c.commune), ''), 'Genève') AS public_city,
    COALESCE(
      NULLIF(btrim(c.street_address), ''),
      NULLIF(
        btrim(concat_ws(
          ' ',
          NULLIF(btrim(c.postal_code), ''),
          COALESCE(NULLIF(btrim(c.city), ''), NULLIF(btrim(c.commune), ''), 'Genève')
        )),
        ''
      ),
      'Genève'
    ) AS public_address,
    public.tok_slugify(c.display_name) AS base_slug
  FROM public.marketing_contacts c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND NULLIF(btrim(c.display_name), '') IS NOT NULL
), prepared AS (
  SELECT source_rows.*,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE lower(COALESCE(r.city, '')) = lower(source_rows.public_city)
          AND r.slug = source_rows.base_slug
      )
      OR count(*) OVER (
        PARTITION BY lower(source_rows.public_city), source_rows.base_slug
      ) > 1
      THEN source_rows.base_slug || '-' || substr(md5(source_rows.source_objectid::text), 1, 8)
      ELSE source_rows.base_slug
    END AS final_slug
  FROM source_rows
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
    substr(md5('tok-public-directory:' || p.source_objectid::text), 1, 8) || '-' ||
    substr(md5('tok-public-directory:' || p.source_objectid::text), 9, 4) || '-4' ||
    substr(md5('tok-public-directory:' || p.source_objectid::text), 14, 3) || '-8' ||
    substr(md5('tok-public-directory:' || p.source_objectid::text), 18, 3) || '-' ||
    substr(md5('tok-public-directory:' || p.source_objectid::text), 21, 12)
  )::uuid,
  '00000000-0000-4000-8000-000000000404'::uuid,
  left(btrim(p.display_name), 240),
  'Établissement référencé dans l’annuaire public TOK. Les services transactionnels restent désactivés tant que l’établissement ne les active pas officiellement sur TOK.',
  CASE WHEN NULLIF(btrim(p.category), '') IS NOT NULL AND p.category <> 'Restaurant TheFork'
    THEN left(p.category, 120) ELSE NULL END,
  left(p.public_address, 240), left(p.public_city, 120), NULLIF(btrim(p.phone), ''),
  0, 0, 2, true, false, 0, 0,
  p.latitude::double precision, p.longitude::double precision, 1.0,
  'active', 0, 0, 0, false,
  false, false, false, false, false, false,
  left(p.final_slug, 180), false, true,
  'commercial_prospect_catalog', p.source_objectid::text
FROM prepared p
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurants r
  WHERE public.normalize_search_text(r.name) = public.normalize_search_text(p.display_name)
    AND public.normalize_search_text(COALESCE(r.address, '')) = public.normalize_search_text(p.public_address)
)
ON CONFLICT DO NOTHING;

UPDATE public.restaurants r
SET directory_public_name_verified = true,
    directory_public_name_source = 'public_restaurant_listing',
    directory_public_name_source_url = NULLIF(btrim(c.website), ''),
    directory_public_name_verified_at = COALESCE(r.directory_public_name_verified_at, now()),
    updated_at = now()
FROM public.marketing_contacts c
WHERE r.is_directory_listing IS TRUE
  AND r.directory_source = 'commercial_prospect_catalog'
  AND r.directory_source_reference = c.source_objectid::text
  AND c.source_system = 'commercial_prospect_catalog'
  AND c.source_objectid BETWEEN 2600000001 AND 2600000520
  AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
  AND c.branch = 'Restaurant référencé sur TheFork'
  AND NOT public.directory_name_looks_legal_entity(r.name);

INSERT INTO public.restaurant_directory_name_jobs (restaurant_id, status, attempts, next_attempt_at, locked_at, last_error, updated_at)
SELECT r.id, 'pending', 0, now(), NULL, NULL, now()
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND r.directory_source = 'commercial_prospect_catalog'
  AND r.directory_source_reference ~ '^[0-9]+$'
  AND r.directory_source_reference::bigint BETWEEN 2600000001 AND 2600000520
  AND r.directory_source_reference::bigint NOT BETWEEN 2600000121 AND 2600000200
  AND r.directory_public_name_verified IS FALSE
  AND COALESCE(r.directory_public_name_source, '') <> 'duplicate_legal_entity_hidden'
ON CONFLICT (restaurant_id) DO UPDATE
SET status = CASE WHEN public.restaurant_directory_name_jobs.status = 'processing' THEN 'processing' ELSE 'pending' END,
    attempts = CASE WHEN public.restaurant_directory_name_jobs.status = 'processing' THEN public.restaurant_directory_name_jobs.attempts ELSE 0 END,
    next_attempt_at = CASE WHEN public.restaurant_directory_name_jobs.status = 'processing' THEN public.restaurant_directory_name_jobs.next_attempt_at ELSE now() END,
    locked_at = CASE WHEN public.restaurant_directory_name_jobs.status = 'processing' THEN public.restaurant_directory_name_jobs.locked_at ELSE NULL END,
    last_error = CASE WHEN public.restaurant_directory_name_jobs.status = 'processing' THEN public.restaurant_directory_name_jobs.last_error ELSE NULL END,
    updated_at = now();

INSERT INTO public.restaurant_directory_image_jobs (restaurant_id, status, attempts, next_attempt_at, locked_at, source_page_url, source_image_url, last_error, updated_at)
SELECT r.id, 'pending', 0, now(), NULL, NULL, NULL, NULL, now()
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND r.directory_source = 'commercial_prospect_catalog'
  AND r.directory_source_reference ~ '^[0-9]+$'
  AND r.directory_source_reference::bigint BETWEEN 2600000001 AND 2600000520
  AND r.directory_source_reference::bigint NOT BETWEEN 2600000121 AND 2600000200
  AND NULLIF(btrim(COALESCE(r.image_url, '')), '') IS NULL
ON CONFLICT (restaurant_id) DO UPDATE
SET status = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN 'processing' ELSE 'pending' END,
    attempts = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.attempts ELSE 0 END,
    next_attempt_at = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.next_attempt_at ELSE now() END,
    locked_at = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.locked_at ELSE NULL END,
    source_page_url = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.source_page_url ELSE NULL END,
    source_image_url = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.source_image_url ELSE NULL END,
    last_error = CASE WHEN public.restaurant_directory_image_jobs.status = 'processing' THEN public.restaurant_directory_image_jobs.last_error ELSE NULL END,
    updated_at = now();

WITH official_sites AS (
  SELECT r.id AS restaurant_id, NULLIF(btrim(c.website), '') AS source_url
  FROM public.restaurants r
  JOIN public.marketing_contacts c
    ON c.source_system = 'commercial_prospect_catalog'
   AND c.source_objectid::text = r.directory_source_reference
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_source = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND c.website ~* '^https?://'
    AND lower(c.website) NOT LIKE '%thefork.%'
    AND r.directory_public_name_verified IS TRUE
    AND NULLIF(btrim(COALESCE(r.image_url, '')), '') IS NULL
)
INSERT INTO public.restaurant_image_discovery_jobs (restaurant_id, source_url, status, attempts, next_attempt_at, lease_token, lease_expires_at, last_error, updated_at)
SELECT restaurant_id, source_url, 'queued', 0, now(), NULL, NULL, NULL, now()
FROM official_sites
ON CONFLICT (restaurant_id) DO UPDATE
SET source_url = EXCLUDED.source_url,
    status = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN 'processing' ELSE 'queued' END,
    attempts = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN public.restaurant_image_discovery_jobs.attempts ELSE 0 END,
    next_attempt_at = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN public.restaurant_image_discovery_jobs.next_attempt_at ELSE now() END,
    lease_token = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN public.restaurant_image_discovery_jobs.lease_token ELSE NULL END,
    lease_expires_at = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN public.restaurant_image_discovery_jobs.lease_expires_at ELSE NULL END,
    last_error = CASE WHEN public.restaurant_image_discovery_jobs.status = 'processing' THEN public.restaurant_image_discovery_jobs.last_error ELSE NULL END,
    updated_at = now();

DO $postflight$
DECLARE
  v_source_count integer;
  v_covered_count integer;
  v_unsafe_count integer;
  v_reserved_directory_count integer;
BEGIN
  SELECT count(*)::integer INTO v_source_count
  FROM public.marketing_contacts c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork';

  IF v_source_count <> 440 THEN
    RAISE EXCEPTION 'Expected 440 verified TheFork prospects, found %', v_source_count;
  END IF;

  SELECT count(*)::integer INTO v_covered_count
  FROM public.marketing_contacts c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.is_directory_listing IS TRUE
        AND (
          (r.directory_source = 'commercial_prospect_catalog' AND r.directory_source_reference = c.source_objectid::text)
          OR (
            public.normalize_search_text(r.name) = public.normalize_search_text(c.display_name)
            AND public.normalize_search_text(COALESCE(r.address, '')) = public.normalize_search_text(
              COALESCE(
                NULLIF(btrim(c.street_address), ''),
                NULLIF(
                  btrim(concat_ws(
                    ' ',
                    NULLIF(btrim(c.postal_code), ''),
                    COALESCE(NULLIF(btrim(c.city), ''), NULLIF(btrim(c.commune), ''), 'Genève')
                  )),
                  ''
                ),
                'Genève'
              )
            )
          )
        )
    );

  IF v_covered_count <> 440 THEN
    RAISE EXCEPTION 'Expected all 440 verified TheFork prospects to be covered, found %', v_covered_count;
  END IF;

  SELECT count(*)::integer INTO v_reserved_directory_count
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_source = 'commercial_prospect_catalog'
    AND r.directory_source_reference ~ '^[0-9]+$'
    AND r.directory_source_reference::bigint BETWEEN 2600000121 AND 2600000200;

  IF v_reserved_directory_count <> 0 THEN
    RAISE EXCEPTION 'Reserved TheFork placeholder range must remain outside the public directory; found % rows', v_reserved_directory_count;
  END IF;

  SELECT count(*)::integer INTO v_unsafe_count
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_source = 'commercial_prospect_catalog'
    AND r.directory_source_reference ~ '^[0-9]+$'
    AND r.directory_source_reference::bigint BETWEEN 2600000001 AND 2600000520
    AND r.directory_source_reference::bigint NOT BETWEEN 2600000121 AND 2600000200
    AND (
      COALESCE(r.delivery_available, false)
      OR COALESCE(r.supports_dinein, false)
      OR COALESCE(r.supports_reservation, false)
      OR COALESCE(r.supports_scheduled, false)
      OR COALESCE(r.supports_pickup, false)
      OR COALESCE(r.supports_scheduled_orders, false)
      OR COALESCE(r.supports_group_orders, false)
      OR COALESCE(r.is_featured, false)
      OR r.stripe_account_id IS NOT NULL
    );

  IF v_unsafe_count <> 0 THEN
    RAISE EXCEPTION 'TheFork directory safety invariant failed for % rows', v_unsafe_count;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$postflight$;

COMMIT;
