-- Keep public restaurant cards factual: no navigation/promo labels as names,
-- no duplicated legal-entity rows when a verified commercial establishment exists,
-- and no public row whose explicit postal city contradicts restaurants.city.

CREATE OR REPLACE FUNCTION public.directory_public_name_looks_navigation_or_promo(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  WITH normalized AS (
    SELECT lower(regexp_replace(btrim(COALESCE(p_name, '')), '[[:space:]]+', ' ', 'g')) AS value
  )
  SELECT
    value ~ '^[«"''[:space:]]*(réservations?|reservations?|contact( us)?|contactez-nous|accueil|home|menu( midi)?|carte( des mets)?|notre carte|a la carte|à la carte|bienvenue|booking|book now)[»"''[:space:].!:-]*$'
    OR value ~ '^(au menu|bienvenue au|bienvenue à|bienvenue a|cartes? et menus?|contacter[[:space:]]|contactez-nous|contact us|notre carte|carte des mets|menu midi|à propos|a propos)([[:space:]:.!?-]|$)'
    OR (
      value ~ '[0-9]+[[:space:]]*%'
      AND value ~ '(rabais|remise|discount|promotion|promo|emporter|à l.emporter|take.?away|livraison|delivery|offre)'
    )
  FROM normalized;
$function$;

COMMENT ON FUNCTION public.directory_public_name_looks_navigation_or_promo(text) IS
  'Rejects page headings/navigation/promotional copy that must never become a restaurant display name.';

CREATE OR REPLACE FUNCTION public.restaurant_address_city_is_consistent(p_address text, p_city text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH parsed AS (
    SELECT
      public.normalize_search_text(
        regexp_replace(
          COALESCE(p_city, ''),
          '[[:space:]]+(GE|VD|FR|VS|NE|BE|ZH|TI|JU|BS|BL|AG|SO|LU|SG|TG|GR|SZ|ZG|OW|NW|UR|GL|AR|AI)[[:space:]]*$',
          '',
          'i'
        )
      ) AS city_norm,
      public.normalize_search_text(
        COALESCE(
          substring(
            COALESCE(p_address, '')
            FROM '[[:space:]-][1-9][0-9]{3}[[:space:]]+([^,]+)[[:space:]]*$'
          ),
          ''
        )
      ) AS explicit_address_city_norm
  )
  SELECT
    explicit_address_city_norm = ''
    OR city_norm = ''
    OR explicit_address_city_norm = city_norm
    OR explicit_address_city_norm LIKE city_norm || ' %'
    OR city_norm LIKE explicit_address_city_norm || ' %'
  FROM parsed;
$function$;

COMMENT ON FUNCTION public.restaurant_address_city_is_consistent(text, text) IS
  'Fail-closed only when an address explicitly ends in a Swiss postal code + city that contradicts restaurants.city.';

-- H1/title extraction proved unsafe in production (navigation labels and offers were accepted as names).
-- Restore the preserved legal identity and hide these rows until a stronger source resolves them.
UPDATE public.restaurants r
SET name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name),
    directory_public_name_verified = false,
    directory_public_name_source = 'pending_commercial_name_recheck',
    directory_public_name_source_url = NULL,
    directory_public_name_verified_at = NULL,
    updated_at = now()
WHERE r.is_directory_listing IS TRUE
  AND r.directory_public_name_verified IS TRUE
  AND (
    lower(COALESCE(r.directory_public_name_source, '')) IN ('h1', 'title')
    OR public.directory_public_name_looks_navigation_or_promo(r.name)
  );

-- A legal-entity row is a duplicate when another verified commercial row has the same
-- normalized address/city AND the exact same official website host. Address alone is not enough.
WITH source_rows AS (
  SELECT
    r.id,
    r.name,
    r.legal_name,
    r.address,
    r.city,
    r.directory_public_name_verified,
    public.normalize_search_text(COALESCE(r.address, '')) AS address_key,
    public.normalize_search_text(COALESCE(r.city, '')) AS city_key,
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(btrim(COALESCE(c.website, '')), '^https?://', '', 'i'),
          '^www\\.',
          '',
          'i'
        ),
        '[/?:#].*$',
        ''
      )
    ) AS website_host
  FROM public.restaurants r
  JOIN public.marketing_contacts c
    ON c.source_system = 'commercial_prospect_catalog'
   AND COALESCE(c.source_objectid::text, c.id::text) = r.directory_source_reference
  WHERE r.is_directory_listing IS TRUE
), duplicate_legal_rows AS (
  SELECT DISTINCT legal.id
  FROM source_rows legal
  JOIN source_rows commercial
    ON commercial.id <> legal.id
   AND commercial.address_key = legal.address_key
   AND commercial.city_key = legal.city_key
   AND commercial.website_host <> ''
   AND commercial.website_host = legal.website_host
  WHERE public.directory_name_looks_legal_entity(COALESCE(NULLIF(btrim(legal.legal_name), ''), legal.name))
    AND commercial.directory_public_name_verified IS TRUE
    AND NOT public.directory_name_looks_legal_entity(commercial.name)
)
UPDATE public.restaurants r
SET name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name),
    directory_public_name_verified = false,
    directory_public_name_source = 'duplicate_legal_entity_hidden',
    directory_public_name_source_url = NULL,
    directory_public_name_verified_at = NULL,
    updated_at = now()
FROM duplicate_legal_rows duplicate
WHERE r.id = duplicate.id;

CREATE OR REPLACE FUNCTION public.protect_directory_public_name_quality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_directory_listing IS TRUE
    AND NEW.directory_public_name_verified IS TRUE
    AND (
      lower(COALESCE(NEW.directory_public_name_source, '')) IN ('h1', 'title')
      OR public.directory_name_looks_legal_entity(NEW.name)
      OR public.directory_public_name_looks_navigation_or_promo(NEW.name)
    )
  THEN
    RAISE EXCEPTION 'A public directory name must be a verified commercial establishment name.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS restaurants_01_protect_directory_public_name_quality ON public.restaurants;
CREATE TRIGGER restaurants_01_protect_directory_public_name_quality
BEFORE INSERT OR UPDATE OF name, is_directory_listing, directory_public_name_verified, directory_public_name_source
ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.protect_directory_public_name_quality();

CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_active IS TRUE
      AND restaurant.is_demo IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'active'
      AND public.restaurant_address_city_is_consistent(restaurant.address, restaurant.city)
      AND (
        restaurant.is_directory_listing IS FALSE
        OR restaurant.directory_public_name_verified IS TRUE
      )
  );
$function$;

-- These policies are permissive/ORed, so each broad public/authenticated read path must
-- independently enforce both the directory-name gate and explicit address/city consistency.
DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_active IS TRUE
  AND is_demo IS FALSE
  AND lower(COALESCE(status, '')) = 'active'
  AND public.restaurant_address_city_is_consistent(address, city)
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
);

DROP POLICY IF EXISTS production_hide_demo_restaurants ON public.restaurants;
CREATE POLICY production_hide_demo_restaurants
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_demo IS FALSE
  AND public.restaurant_address_city_is_consistent(address, city)
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
);

DROP POLICY IF EXISTS scope_production_restaurants_for_commercial_demo_accounts ON public.restaurants;
CREATE POLICY scope_production_restaurants_for_commercial_demo_accounts
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  (
    NOT public.commercial_demo_current_user_is_restricted()
    AND public.restaurant_address_city_is_consistent(address, city)
    AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
  )
  OR id = public.commercial_demo_current_restaurant_id()
);

DO $postflight$
DECLARE
  v_unsafe_verified integer;
  v_duplicate_visible integer;
  v_inconsistent_public integer;
BEGIN
  SELECT count(*)::integer
  INTO v_unsafe_verified
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_public_name_verified IS TRUE
    AND (
      lower(COALESCE(r.directory_public_name_source, '')) IN ('h1', 'title')
      OR public.directory_name_looks_legal_entity(r.name)
      OR public.directory_public_name_looks_navigation_or_promo(r.name)
    );

  SELECT count(*)::integer
  INTO v_duplicate_visible
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_public_name_source = 'duplicate_legal_entity_hidden'
    AND public.restaurant_is_publicly_visible(r.id);

  SELECT count(*)::integer
  INTO v_inconsistent_public
  FROM public.restaurants r
  WHERE r.is_active IS TRUE
    AND r.is_demo IS FALSE
    AND lower(COALESCE(r.status, '')) = 'active'
    AND NOT public.restaurant_address_city_is_consistent(r.address, r.city)
    AND public.restaurant_is_publicly_visible(r.id);

  IF v_unsafe_verified <> 0 THEN
    RAISE EXCEPTION 'Restaurant public-name quality gate left % unsafe verified names', v_unsafe_verified;
  END IF;

  IF v_duplicate_visible <> 0 THEN
    RAISE EXCEPTION 'Restaurant public-name quality gate left % duplicate legal rows visible', v_duplicate_visible;
  END IF;

  IF v_inconsistent_public <> 0 THEN
    RAISE EXCEPTION 'Restaurant location gate left % explicit address/city mismatches public', v_inconsistent_public;
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
