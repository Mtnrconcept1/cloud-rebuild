-- Raw registry labels can contain a proprietor, legal entity, branch or commercial
-- name in the same field. Only unambiguous establishment names may remain public.
-- Ambiguous rows stay available to admin/service workflows and are requeued for
-- verification by the existing official-website worker.
BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.directory_name_looks_legal_entity(text)') IS NULL THEN
    RAISE EXCEPTION 'Required function directory_name_looks_legal_entity(text) is missing';
  END IF;

  IF to_regprocedure('public.directory_public_name_looks_navigation_or_promo(text)') IS NULL THEN
    RAISE EXCEPTION 'Required function directory_public_name_looks_navigation_or_promo(text) is missing';
  END IF;

  IF to_regprocedure('public.restaurant_is_publicly_visible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required function restaurant_is_publicly_visible(uuid) is missing';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.directory_registry_name_needs_commercial_verification(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_catalog'
AS $function$
  WITH candidate AS (
    SELECT btrim(
      regexp_replace(COALESCE(p_name, ''), '[[:space:]]+', ' ', 'g')
    ) AS value
  ), normalized AS (
    SELECT
      value,
      public.normalize_search_text(value) AS name_key
    FROM candidate
  )
  SELECT
    value = ''
    OR public.directory_name_looks_legal_entity(value)
    -- Registry exports frequently join the public sign and the proprietor with a comma.
    -- The verifier must resolve those labels before they become public.
    OR position(',' IN value) > 0
    OR position('/' IN value) > 0
    OR value ~ '[[:space:]][-–—][[:space:]]'
    OR name_key ~ '(^| )(association|fondation|holding|investissements?|services?|diffusion|production|distribution|societe|entreprise|compagnie|cie|administration|entertainment|sales|evenementiel|evenements?|events?|titulaire|succursale|proprietaire|zweigniederlassung|sas|sasu|eurl|srl|snc|sca|scs|corporation|corp|agence|academy|consulting|conseil|concept|management|group|groupe|international|solutions?|trading|imports?|exports?|logistique|transport|immobilier|construction|catering|location|finance|partners?|monsieur|madame|mademoiselle|mr|mrs|mme|mlle|epouse|veuve|commerce|boutique|market|shop|store)( |$)'
    -- A registry activity category proves that the record concerns food service,
    -- but not that its label is the public sign. Without an explicit establishment
    -- signal, a person, company or restaurant brand cannot be distinguished safely.
    OR name_key !~ '(^| )(osteria|trattoria|restaurant|restaurants|cafe|cafeteria|bar|pub|snack|tea|room|auberge|brasserie|pizzeria|pinseria|piadineria|pizza|kebab|kebap|bistro|bistrot|traiteur|grill|sushi|tacos|burger|food|kitchen|hostellerie|hotel|comptoir|boulangerie|patisserie|confiserie|glaces|gelateria|taverne|cantine|buffet|rotisserie|creperie|buvette|focacceria|gastronomia|canteen|coffee|chicken|take|away|donuts|wok|thai|indian|deli|juice|poke|arepa|chocolat|sandwich|falafel|churrascaria)( |$)'
  FROM normalized;
$function$;

COMMENT ON FUNCTION public.directory_registry_name_needs_commercial_verification(text) IS
  'Returns true when a raw restaurant-registry label may be a person, legal entity, branch or mixed proprietor/establishment label and needs an independent commercial-name source.';

-- The reported address has two registry contacts. The establishment itself is
-- independently confirmed by its official website, including name, phone and address.
UPDATE public.restaurants r
SET directory_public_name_verified = true,
    directory_public_name_source = 'official_website_manual_review',
    directory_public_name_source_url = 'https://www.pizzeria-les-ormeaux.ch/',
    directory_public_name_verified_at = now(),
    updated_at = now()
WHERE r.is_directory_listing IS TRUE
  AND r.directory_source = 'commercial_prospect_catalog'
  AND r.directory_source_reference = '19320'
  AND public.normalize_search_text(r.name) = 'les ormeaux'
  AND public.normalize_search_text(r.address) = public.normalize_search_text('Route de Chancy 25')
  AND public.normalize_search_text(r.city) = public.normalize_search_text('Petit-Lancy');

-- Preserve the original registry identity, hide it from public reads immediately and
-- let restaurants_sync_directory_name_job enqueue it for official-source verification.
UPDATE public.restaurants r
SET legal_name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name),
    directory_public_name_verified = false,
    directory_public_name_source = 'pending_registry_commercial_name_recheck',
    directory_public_name_source_url = NULL,
    directory_public_name_verified_at = NULL,
    updated_at = now()
WHERE r.is_directory_listing IS TRUE
  AND r.directory_public_name_verified IS TRUE
  AND r.directory_public_name_source = 'public_restaurant_registry_label'
  AND public.directory_registry_name_needs_commercial_verification(r.name);

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
      OR (
        NEW.directory_public_name_source = 'public_restaurant_registry_label'
        AND public.directory_registry_name_needs_commercial_verification(NEW.name)
      )
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

DO $postflight$
DECLARE
  v_registry_rows integer;
  v_ambiguous_visible integer;
  v_visible_directory integer;
  v_root_case_visible integer;
  v_person_only_names_visible integer;
  v_verified_replacement integer;
BEGIN
  SELECT count(*)::integer
  INTO v_registry_rows
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_source = 'commercial_prospect_catalog';

  SELECT count(*)::integer
  INTO v_ambiguous_visible
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND r.directory_public_name_verified IS TRUE
    AND r.directory_public_name_source = 'public_restaurant_registry_label'
    AND public.directory_registry_name_needs_commercial_verification(r.name)
    AND public.restaurant_is_publicly_visible(r.id);

  SELECT count(*)::integer
  INTO v_visible_directory
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND public.restaurant_is_publicly_visible(r.id);

  SELECT count(*)::integer
  INTO v_root_case_visible
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND public.normalize_search_text(r.name) = 'ahmet sahin'
    AND public.restaurant_is_publicly_visible(r.id);

  SELECT count(*)::integer
  INTO v_person_only_names_visible
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND public.normalize_search_text(r.name) IN (
      'ahmet sahin',
      'maria otilia de oliveira martins teixeira'
    )
    AND public.restaurant_is_publicly_visible(r.id);

  SELECT count(*)::integer
  INTO v_verified_replacement
  FROM public.restaurants r
  WHERE r.is_directory_listing IS TRUE
    AND public.normalize_search_text(r.name) = 'les ormeaux'
    AND public.normalize_search_text(r.address) = public.normalize_search_text('Route de Chancy 25')
    AND public.normalize_search_text(r.city) = public.normalize_search_text('Petit-Lancy')
    AND r.directory_public_name_source = 'official_website_manual_review'
    AND r.directory_public_name_source_url = 'https://www.pizzeria-les-ormeaux.ch/'
    AND public.restaurant_is_publicly_visible(r.id);

  IF v_ambiguous_visible <> 0 THEN
    RAISE EXCEPTION 'Restaurant display-name gate left % ambiguous registry labels public', v_ambiguous_visible;
  END IF;

  IF v_root_case_visible <> 0 THEN
    RAISE EXCEPTION 'Ahmet Sahin legal identity must not be displayed as a restaurant name';
  END IF;

  IF v_person_only_names_visible <> 0 THEN
    RAISE EXCEPTION 'Natural-person-only registry labels must not be displayed as restaurant names';
  END IF;

  IF v_registry_rows >= 4000 AND v_verified_replacement = 0 THEN
    RAISE EXCEPTION 'Verified Les Ormeaux restaurant listing is missing after legal-identity cleanup';
  END IF;

  -- Catch a catastrophic future pattern while keeping uncertain labels fail-closed.
  IF v_registry_rows >= 4000 AND v_visible_directory < 1000 THEN
    RAISE EXCEPTION 'Restaurant display-name gate unexpectedly hid too much inventory: visible=%', v_visible_directory;
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
