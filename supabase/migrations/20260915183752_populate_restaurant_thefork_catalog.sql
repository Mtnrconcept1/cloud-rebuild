WITH source_rows AS (
  SELECT
    c.source_objectid,
    c.display_name,
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
    ) AS public_address
  FROM public.marketing_contacts AS c
  WHERE c.source_system = 'commercial_prospect_catalog'
    AND c.source_objectid BETWEEN 2600000001 AND 2600000520
    AND c.source_objectid NOT BETWEEN 2600000121 AND 2600000200
    AND c.branch = 'Restaurant référencé sur TheFork'
    AND NULLIF(btrim(c.display_name), '') IS NOT NULL
), resolved AS (
  SELECT
    source.source_objectid,
    COALESCE(direct_match.id, dedup_match.id) AS restaurant_id
  FROM source_rows AS source
  LEFT JOIN LATERAL (
    SELECT restaurant.id
    FROM public.restaurants AS restaurant
    WHERE restaurant.is_directory_listing IS TRUE
      AND restaurant.directory_source = 'commercial_prospect_catalog'
      AND restaurant.directory_source_reference = source.source_objectid::text
    ORDER BY restaurant.directory_public_name_verified DESC, restaurant.is_active DESC, restaurant.id
    LIMIT 1
  ) AS direct_match ON TRUE
  LEFT JOIN LATERAL (
    SELECT restaurant.id
    FROM public.restaurants AS restaurant
    WHERE direct_match.id IS NULL
      AND public.normalize_search_text(restaurant.name) = public.normalize_search_text(source.display_name)
      AND public.normalize_search_text(COALESCE(restaurant.address, '')) = public.normalize_search_text(source.public_address)
    ORDER BY restaurant.is_directory_listing DESC, restaurant.directory_public_name_verified DESC, restaurant.is_active DESC, restaurant.id
    LIMIT 1
  ) AS dedup_match ON direct_match.id IS NULL
)
INSERT INTO public.restaurant_thefork_catalog (source_objectid, restaurant_id)
SELECT source_objectid, restaurant_id
FROM resolved
WHERE restaurant_id IS NOT NULL
ON CONFLICT (source_objectid) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id;;
