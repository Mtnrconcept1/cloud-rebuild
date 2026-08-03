-- Prospect coordinates and fine-grained campaign targeting.
--
-- The 4843 Geneva restaurants were already synchronised into
-- marketing_contacts, but only as identifiers: the catalogue table carries a
-- source_objectid and nothing else, so every contact landed without an address,
-- a phone number or an email. A campaign could be planned against them and
-- would reach nobody.
--
-- This migration gives those contacts their coordinates and gives the operator
-- the selectors needed to aim a campaign at a district, a size bracket or the
-- subset that is actually reachable, instead of the canton as a whole.
--
-- What it deliberately does NOT change is eligibility. Electronic marketing
-- still requires consent or an existing customer relationship
-- (marketing_contact_is_eligible), which is what Swiss UCA art. 3(1)(o)
-- demands. Importing an address never creates a right to write to it.

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS postal_code text
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$'),
  ADD COLUMN IF NOT EXISTS commune text
    CHECK (commune IS NULL OR char_length(commune) <= 160),
  ADD COLUMN IF NOT EXISTS street_address text
    CHECK (street_address IS NULL OR char_length(street_address) <= 240),
  ADD COLUMN IF NOT EXISTS company_size text
    CHECK (company_size IS NULL OR char_length(company_size) <= 60),
  ADD COLUMN IF NOT EXISTS branch text
    CHECK (branch IS NULL OR char_length(branch) <= 240),
  ADD COLUMN IF NOT EXISTS website text
    CHECK (website IS NULL OR website ~ '^https?://'),
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6)
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6)
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

COMMENT ON COLUMN public.marketing_contacts.latitude IS
  'Kept alongside the postal selectors so a radius filter can be added later without re-importing the catalogue.';

CREATE INDEX IF NOT EXISTS marketing_contacts_postal_code_idx
  ON public.marketing_contacts(postal_code) WHERE postal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_commune_idx
  ON public.marketing_contacts(lower(commune)) WHERE commune IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_contacts_company_size_idx
  ON public.marketing_contacts(company_size) WHERE company_size IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Targeting selectors
-- ---------------------------------------------------------------------------
-- Values stay strings, including the reachability booleans: the AI agent's
-- structured output and the BFF both rely on "every audience filter value is a
-- string", and loosening that here would silently break the contract they share.

CREATE OR REPLACE FUNCTION public.marketing_validate_audience_filter(p_filter jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_kind text := COALESCE(NULLIF(btrim(p_filter ->> 'audience_kind'), ''), NULLIF(btrim(p_filter ->> 'kind'), ''));
  v_audience_id text := NULLIF(btrim(p_filter ->> 'audience_id'), '');
  v_id_kind text;
  v_flag text;
BEGIN
  IF COALESCE(jsonb_typeof(p_filter), 'null') <> 'object' THEN
    RAISE EXCEPTION 'Audience filter must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_filter = '{}'::jsonb THEN
    RAISE EXCEPTION 'Audience filter cannot be empty' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_filter)
  LOOP
    IF v_key NOT IN (
      'audience_kind','kind','canton','city','category','contact_type','audience_id',
      'postal_code','commune','company_size','branch','has_email','has_phone','has_website'
    ) THEN
      RAISE EXCEPTION 'Unsupported audience filter key: %', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_filter -> v_key) <> 'string' THEN
      RAISE EXCEPTION 'Audience filter values must be strings' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF v_kind IS NULL AND v_audience_id IS NULL
     AND NULLIF(btrim(p_filter ->> 'canton'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'city'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'category'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'contact_type'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'postal_code'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'commune'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'company_size'), '') IS NULL
     AND NULLIF(btrim(p_filter ->> 'branch'), '') IS NULL THEN
    -- Reachability alone is not a selector: "everyone with an email" is the
    -- whole database, which is exactly the mistake this guard exists to stop.
    RAISE EXCEPTION 'Audience filter requires an effective selector' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_filter ->> 'audience_kind', '') IS NOT NULL
     AND NULLIF(p_filter ->> 'kind', '') IS NOT NULL
     AND (p_filter ->> 'audience_kind') <> (p_filter ->> 'kind') THEN
    RAISE EXCEPTION 'audience_kind conflicts with legacy kind' USING ERRCODE = '22023';
  END IF;
  IF v_audience_id IS NOT NULL THEN
    IF v_audience_id !~ '^(computed|dynamic):(restaurant|client|mixed):([A-Za-z]{2}|CH)$' THEN
      RAISE EXCEPTION 'Unsupported audience_id; use a computed or dynamic audience' USING ERRCODE = '22023';
    END IF;
    v_id_kind := split_part(v_audience_id, ':', 2);
    IF v_kind IS NOT NULL AND v_kind <> v_id_kind THEN
      RAISE EXCEPTION 'Audience kind conflicts with audience_id' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('restaurant','client','mixed') THEN
    RAISE EXCEPTION 'Invalid audience kind' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_filter ->> 'contact_type', '') IS NOT NULL
     AND (p_filter ->> 'contact_type') NOT IN ('registered_user','restaurant_prospect','restaurant_lead','manual') THEN
    RAISE EXCEPTION 'Invalid contact_type filter' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_filter ->> 'postal_code'), '') IS NOT NULL
     AND (p_filter ->> 'postal_code') !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Invalid postal_code filter' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['has_email','has_phone','has_website']
  LOOP
    v_flag := NULLIF(btrim(p_filter ->> v_key), '');
    IF v_flag IS NOT NULL AND lower(v_flag) NOT IN ('true','false') THEN
      RAISE EXCEPTION 'Reachability filter % must be "true" or "false"', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_contact_matches_filter(p_contact_id uuid, p_filter jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_kind text := COALESCE(NULLIF(p_filter ->> 'audience_kind', ''), NULLIF(p_filter ->> 'kind', ''));
  v_canton text := NULLIF(p_filter ->> 'canton', '');
  v_audience_id text := NULLIF(p_filter ->> 'audience_id', '');
  v_has_email text := lower(NULLIF(btrim(p_filter ->> 'has_email'), ''));
  v_has_phone text := lower(NULLIF(btrim(p_filter ->> 'has_phone'), ''));
  v_has_website text := lower(NULLIF(btrim(p_filter ->> 'has_website'), ''));
  v_matches boolean;
BEGIN
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, '{}'::jsonb));
  IF v_audience_id IS NOT NULL THEN
    v_kind := COALESCE(v_kind, split_part(v_audience_id, ':', 2));
    v_canton := COALESCE(v_canton, split_part(v_audience_id, ':', 3));
  END IF;
  IF upper(COALESCE(v_canton, 'CH')) IN ('CH','ALL') THEN v_canton := NULL; END IF;

  SELECT (
    CASE COALESCE(v_kind, 'mixed')
      WHEN 'restaurant' THEN c.contact_type IN ('restaurant_prospect','restaurant_lead')
      WHEN 'client' THEN c.contact_type = 'registered_user'
      ELSE true
    END
    AND (v_canton IS NULL OR upper(COALESCE(c.canton, '')) = upper(v_canton))
    AND (NULLIF(p_filter ->> 'city', '') IS NULL OR c.city = p_filter ->> 'city')
    AND (NULLIF(p_filter ->> 'category', '') IS NULL OR c.category = p_filter ->> 'category')
    AND (NULLIF(p_filter ->> 'contact_type', '') IS NULL OR c.contact_type = p_filter ->> 'contact_type')
    AND (NULLIF(p_filter ->> 'postal_code', '') IS NULL OR c.postal_code = p_filter ->> 'postal_code')
    -- Commune and branch are matched case-insensitively: they come from a
    -- public registry whose capitalisation is not stable.
    AND (NULLIF(btrim(p_filter ->> 'commune'), '') IS NULL
         OR lower(COALESCE(c.commune, '')) = lower(btrim(p_filter ->> 'commune')))
    AND (NULLIF(btrim(p_filter ->> 'branch'), '') IS NULL
         OR lower(COALESCE(c.branch, '')) = lower(btrim(p_filter ->> 'branch')))
    AND (NULLIF(btrim(p_filter ->> 'company_size'), '') IS NULL
         OR c.company_size = btrim(p_filter ->> 'company_size'))
    AND (v_has_email IS NULL OR (c.email_normalized IS NOT NULL) = (v_has_email = 'true'))
    AND (v_has_phone IS NULL OR (c.phone_normalized IS NOT NULL) = (v_has_phone = 'true'))
    AND (v_has_website IS NULL OR (NULLIF(btrim(COALESCE(c.website, '')), '') IS NOT NULL) = (v_has_website = 'true'))
  ) INTO v_matches
  FROM public.marketing_contacts c WHERE c.id = p_contact_id;
  RETURN COALESCE(v_matches, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue import
-- ---------------------------------------------------------------------------
-- The registry export lives as a static JSON asset served to the commercial
-- map, not as a database table, so the rows arrive here in batches from an
-- operator-run script rather than from a SELECT.
--
-- Import never changes a lawful basis that an administrator already set, never
-- resurrects a suppressed contact, and never overwrites a value a human
-- qualified by hand: a public registry is a weaker source than a person.

CREATE OR REPLACE FUNCTION public.service_import_marketing_prospect_coordinates(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_source_objectid bigint;
  v_updated integer := 0;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(jsonb_typeof(p_rows), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Prospect import expects an array' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 500 THEN
    RAISE EXCEPTION 'Prospect import batch is limited to 500 rows' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_objectid := NULLIF(v_row ->> 'source_objectid', '')::bigint;
    IF v_source_objectid IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.marketing_contacts c SET
      display_name = CASE
        WHEN NULLIF(btrim(COALESCE(c.display_name, '')), '') IS NULL
        THEN left(COALESCE(NULLIF(btrim(v_row ->> 'display_name'), ''), 'Établissement'), 160)
        ELSE c.display_name
      END,
      -- Only fill a gap. A qualified address must survive a re-import.
      email = COALESCE(c.email, NULLIF(btrim(v_row ->> 'email'), '')),
      phone = COALESCE(c.phone, NULLIF(btrim(v_row ->> 'phone'), '')),
      website = COALESCE(c.website, NULLIF(btrim(v_row ->> 'website'), '')),
      street_address = COALESCE(c.street_address, NULLIF(btrim(v_row ->> 'street_address'), '')),
      postal_code = COALESCE(c.postal_code, NULLIF(btrim(v_row ->> 'postal_code'), '')),
      commune = COALESCE(c.commune, NULLIF(btrim(v_row ->> 'commune'), '')),
      city = COALESCE(NULLIF(btrim(COALESCE(c.city, '')), ''), NULLIF(btrim(v_row ->> 'city'), '')),
      canton = COALESCE(NULLIF(btrim(COALESCE(c.canton, '')), ''), NULLIF(btrim(v_row ->> 'canton'), '')),
      category = COALESCE(NULLIF(btrim(COALESCE(c.category, '')), ''), NULLIF(btrim(v_row ->> 'category'), '')),
      branch = COALESCE(c.branch, NULLIF(btrim(v_row ->> 'branch'), '')),
      company_size = COALESCE(c.company_size, NULLIF(btrim(v_row ->> 'company_size'), '')),
      latitude = COALESCE(c.latitude, NULLIF(v_row ->> 'latitude', '')::numeric),
      longitude = COALESCE(c.longitude, NULLIF(v_row ->> 'longitude', '')::numeric),
      -- The lawful basis is an administrator's decision. A registry import may
      -- only propose one where none was ever recorded.
      lawful_basis = CASE
        WHEN c.lawful_basis = 'none' THEN 'legitimate_interest'
        ELSE c.lawful_basis
      END,
      consent_source = COALESCE(c.consent_source, 'registre_public_sitg'),
      metadata = c.metadata || jsonb_build_object(
        'registry_import', jsonb_build_object(
          'source', COALESCE(NULLIF(btrim(v_row ->> 'source'), ''), 'sitg'),
          'collected_at', NULLIF(btrim(v_row ->> 'collected_at'), ''),
          'imported_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    WHERE c.source_objectid = v_source_objectid
      -- A contact that opted out or was suppressed keeps that state; refilling
      -- its address would quietly undo an explicit removal.
      AND c.opted_out_at IS NULL
      AND c.suppression_reason IS NULL;

    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'updated', v_updated,
    'inserted', v_inserted,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.service_import_marketing_prospect_coordinates(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.service_import_marketing_prospect_coordinates(jsonb)
  TO service_role;
