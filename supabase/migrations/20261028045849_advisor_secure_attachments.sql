-- Secure, private CRM contacts imported through the restaurant AI advisor.
-- Raw spreadsheets are never stored. Only normalized contacts are accepted by
-- the bounded RPC below, and their marketing consent always starts as unknown.

CREATE TABLE IF NOT EXISTS public.restaurant_crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  city text,
  address text,
  notes text,
  dedupe_key text NOT NULL,
  source text NOT NULL DEFAULT 'advisor_import',
  source_file_name text,
  source_file_sha256 text,
  marketing_consent_status text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_crm_contacts_identity_required
    CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT restaurant_crm_contacts_name_lengths
    CHECK (
      char_length(COALESCE(full_name, '')) <= 240
      AND char_length(COALESCE(first_name, '')) <= 120
      AND char_length(COALESCE(last_name, '')) <= 120
    ),
  CONSTRAINT restaurant_crm_contacts_contact_lengths
    CHECK (
      char_length(COALESCE(email, '')) <= 254
      AND char_length(COALESCE(phone, '')) <= 40
      AND char_length(COALESCE(city, '')) <= 160
      AND char_length(COALESCE(address, '')) <= 300
      AND char_length(COALESCE(notes, '')) <= 500
    ),
  CONSTRAINT restaurant_crm_contacts_source_check
    CHECK (source = 'advisor_import'),
  CONSTRAINT restaurant_crm_contacts_source_file_check
    CHECK (
      char_length(COALESCE(source_file_name, '')) <= 180
      AND (source_file_sha256 IS NULL OR source_file_sha256 ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT restaurant_crm_contacts_consent_check
    CHECK (marketing_consent_status IN ('unknown', 'opted_in', 'opted_out')),
  UNIQUE (restaurant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS restaurant_crm_contacts_restaurant_updated_idx
  ON public.restaurant_crm_contacts (restaurant_id, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS restaurant_crm_contacts_restaurant_email_idx
  ON public.restaurant_crm_contacts (restaurant_id, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurant_crm_contacts_restaurant_phone_idx
  ON public.restaurant_crm_contacts (restaurant_id, phone)
  WHERE phone IS NOT NULL;

ALTER TABLE public.restaurant_crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_crm_contacts FORCE ROW LEVEL SECURITY;

-- The table is deliberately not exposed to browser roles. Authenticated users
-- must go through the MFA/subscription/ownership checked RPCs below.
REVOKE ALL ON TABLE public.restaurant_crm_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.restaurant_crm_contacts FROM anon, authenticated;
GRANT ALL ON TABLE public.restaurant_crm_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.import_restaurant_crm_contacts(
  p_restaurant_id uuid,
  p_contacts jsonb,
  p_source_file_name text DEFAULT NULL,
  p_source_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.jwt()->>'role', '') = 'service_role';
  v_contact jsonb;
  v_count integer;
  v_processed integer := 0;
  v_duplicate_count integer := 0;
  v_seen_keys text[] := ARRAY[]::text[];
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_city text;
  v_address text;
  v_notes text;
  v_identity text;
  v_dedupe_key text;
  v_source_file_name text := NULLIF(btrim(p_source_file_name), '');
  v_source_sha256 text := lower(NULLIF(btrim(p_source_sha256), ''));
BEGIN
  IF NOT public.crm_session_has_sensitive_access() THEN
    RAISE EXCEPTION 'CRM two-factor authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service AND (v_actor_id IS NULL OR NOT public.auth_owns_restaurant(p_restaurant_id)) THEN
    RAISE EXCEPTION 'Access denied for restaurant CRM import.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service AND NOT public.restaurant_has_elite_crm_subscription(p_restaurant_id) THEN
    RAISE EXCEPTION 'Premium or Elite subscription required for CRM import.'
      USING ERRCODE = '42501';
  END IF;

  IF p_restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Restaurant not found.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CRM contacts must be a JSON array.'
      USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_contacts);
  IF v_count < 1 OR v_count > 500 THEN
    RAISE EXCEPTION 'CRM import must contain between 1 and 500 contacts.'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_file_name IS NOT NULL AND (
    char_length(v_source_file_name) > 180
    OR v_source_file_name ~ '[[:cntrl:]/\\]'
    OR v_source_file_name ~* '(private[_ -]?key|secret|password|mot[_ -]?de[_ -]?passe|seed[_ -]?phrase|mnemonic|api[_ -]?key|service[_ -]?role|token)'
  ) THEN
    RAISE EXCEPTION 'Invalid CRM source filename.'
      USING ERRCODE = '22023';
  END IF;

  IF v_source_sha256 IS NULL OR v_source_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid CRM source digest.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_contact IN
    SELECT value FROM jsonb_array_elements(p_contacts)
  LOOP
    IF jsonb_typeof(v_contact) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid CRM contact.'
        USING ERRCODE = '22023';
    END IF;

    v_full_name := NULLIF(btrim(v_contact->>'full_name'), '');
    v_first_name := NULLIF(btrim(v_contact->>'first_name'), '');
    v_last_name := NULLIF(btrim(v_contact->>'last_name'), '');
    v_email := lower(NULLIF(btrim(v_contact->>'email'), ''));
    v_phone := NULLIF(btrim(v_contact->>'phone'), '');
    v_city := NULLIF(btrim(v_contact->>'city'), '');
    v_address := NULLIF(btrim(v_contact->>'address'), '');
    v_notes := NULLIF(btrim(v_contact->>'notes'), '');

    IF EXISTS (
      SELECT 1
      FROM unnest(ARRAY[v_full_name, v_first_name, v_last_name, v_email, v_city, v_address, v_notes]) AS candidate(value)
      WHERE candidate.value IS NOT NULL
        AND candidate.value ~ '^[[:space:]]*[=+@-]'
    ) OR (v_phone IS NOT NULL AND v_phone ~ '^[[:space:]]*[=@-]') THEN
      RAISE EXCEPTION 'Spreadsheet formulas are not accepted in CRM contacts.'
        USING ERRCODE = '22023';
    END IF;

    IF concat_ws('', v_full_name, v_first_name, v_last_name, v_email, v_phone, v_city, v_address, v_notes) ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'Control characters are not accepted in CRM contacts.'
        USING ERRCODE = '22023';
    END IF;

    IF char_length(COALESCE(v_full_name, '')) > 240
      OR char_length(COALESCE(v_first_name, '')) > 120
      OR char_length(COALESCE(v_last_name, '')) > 120
      OR char_length(COALESCE(v_email, '')) > 254
      OR char_length(COALESCE(v_phone, '')) > 40
      OR char_length(COALESCE(v_city, '')) > 160
      OR char_length(COALESCE(v_address, '')) > 300
      OR char_length(COALESCE(v_notes, '')) > 500 THEN
      RAISE EXCEPTION 'CRM contact field exceeds the allowed length.'
        USING ERRCODE = '22023';
    END IF;

    IF v_email IS NOT NULL AND v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' THEN
      RAISE EXCEPTION 'Invalid CRM e-mail address.'
        USING ERRCODE = '22023';
    END IF;

    v_phone_digits := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');
    IF v_phone IS NOT NULL AND char_length(v_phone_digits) NOT BETWEEN 7 AND 20 THEN
      RAISE EXCEPTION 'Invalid CRM phone number.'
        USING ERRCODE = '22023';
    END IF;

    IF v_email IS NULL AND v_phone IS NULL THEN
      RAISE EXCEPTION 'Every CRM contact requires an e-mail address or phone number.'
        USING ERRCODE = '22023';
    END IF;

    v_identity := CASE
      WHEN v_email IS NOT NULL THEN 'email:' || v_email
      ELSE 'phone:' || v_phone_digits
    END;
    v_dedupe_key := encode(extensions.digest(v_identity, 'sha256'), 'hex');

    IF v_dedupe_key = ANY(v_seen_keys) THEN
      v_duplicate_count := v_duplicate_count + 1;
      CONTINUE;
    END IF;
    v_seen_keys := array_append(v_seen_keys, v_dedupe_key);

    INSERT INTO public.restaurant_crm_contacts (
      restaurant_id,
      created_by,
      full_name,
      first_name,
      last_name,
      email,
      phone,
      city,
      address,
      notes,
      dedupe_key,
      source_file_name,
      source_file_sha256,
      marketing_consent_status,
      updated_at
    ) VALUES (
      p_restaurant_id,
      v_actor_id,
      COALESCE(v_full_name, NULLIF(concat_ws(' ', v_first_name, v_last_name), '')),
      v_first_name,
      v_last_name,
      v_email,
      v_phone,
      v_city,
      v_address,
      v_notes,
      v_dedupe_key,
      v_source_file_name,
      v_source_sha256,
      'unknown',
      now()
    )
    ON CONFLICT (restaurant_id, dedupe_key) DO UPDATE
    SET
      full_name = COALESCE(EXCLUDED.full_name, public.restaurant_crm_contacts.full_name),
      first_name = COALESCE(EXCLUDED.first_name, public.restaurant_crm_contacts.first_name),
      last_name = COALESCE(EXCLUDED.last_name, public.restaurant_crm_contacts.last_name),
      email = COALESCE(EXCLUDED.email, public.restaurant_crm_contacts.email),
      phone = COALESCE(EXCLUDED.phone, public.restaurant_crm_contacts.phone),
      city = COALESCE(EXCLUDED.city, public.restaurant_crm_contacts.city),
      address = COALESCE(EXCLUDED.address, public.restaurant_crm_contacts.address),
      notes = COALESCE(EXCLUDED.notes, public.restaurant_crm_contacts.notes),
      source_file_name = EXCLUDED.source_file_name,
      source_file_sha256 = EXCLUDED.source_file_sha256,
      marketing_consent_status = public.restaurant_crm_contacts.marketing_consent_status,
      updated_at = now();

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed_count', v_processed,
    'duplicate_count', v_duplicate_count,
    'marketing_consent_status', 'unknown'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_crm_imported_contacts(
  p_restaurant_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  city text,
  address text,
  notes text,
  marketing_consent_status text,
  created_at timestamptz,
  restaurant_name text,
  total_matching_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_service boolean := COALESCE(auth.jwt()->>'role', '') = 'service_role';
  v_is_admin boolean := public.auth_is_admin();
  v_search text := NULLIF(btrim(p_search), '');
BEGIN
  IF NOT public.crm_session_has_sensitive_access() THEN
    RAISE EXCEPTION 'CRM two-factor authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service AND NOT v_is_admin THEN
    IF NOT public.auth_owns_restaurant(p_restaurant_id) THEN
      RAISE EXCEPTION 'Access denied for restaurant CRM.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.restaurant_has_elite_crm_subscription(p_restaurant_id) THEN
      RAISE EXCEPTION 'Premium or Elite subscription required for CRM.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_limit < 1 OR p_limit > 500 OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'Invalid CRM pagination.'
      USING ERRCODE = '22023';
  END IF;

  IF v_search IS NOT NULL AND (char_length(v_search) > 200 OR v_search ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'Invalid CRM search.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.full_name,
    c.email,
    c.phone,
    c.city,
    c.address,
    c.notes,
    c.marketing_consent_status,
    c.created_at,
    r.name::text AS restaurant_name,
    count(*) OVER () AS total_matching_count
  FROM public.restaurant_crm_contacts c
  JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE c.restaurant_id = p_restaurant_id
    AND (
      v_search IS NULL
      OR concat_ws(' ', c.full_name, c.first_name, c.last_name, c.email, c.phone, c.city, c.address, c.notes)
        ILIKE '%' || v_search || '%'
    )
  ORDER BY c.updated_at DESC, c.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON TABLE public.restaurant_crm_contacts IS
  'Private normalized CRM contacts imported through Assistant TOK. Raw files are never stored and consent starts as unknown.';

COMMENT ON FUNCTION public.import_restaurant_crm_contacts(uuid, jsonb, text, text) IS
  'Imports at most 500 normalized contacts after AAL2, restaurant ownership and Premium/Elite checks; consent is never inferred.';

COMMENT ON FUNCTION public.get_restaurant_crm_imported_contacts(uuid, text, integer, integer) IS
  'Reads private imported CRM contacts through bounded pagination after AAL2 and authorization checks.';

REVOKE ALL ON FUNCTION public.import_restaurant_crm_contacts(uuid, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.import_restaurant_crm_contacts(uuid, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_restaurant_crm_contacts(uuid, jsonb, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_restaurant_crm_imported_contacts(uuid, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_crm_imported_contacts(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_crm_imported_contacts(uuid, text, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
