BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Add selections without changing the semantics of any legacy scalar selector.
-- OR inside a rubric, AND across rubrics. [] matches nobody; omitted means all.
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
  v_field text;
  v_values jsonb;
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
      'postal_code','commune','company_size','branch','has_email','has_phone','has_website','selections'
    ) THEN
      RAISE EXCEPTION 'Unsupported audience filter key: %', v_key USING ERRCODE = '22023';
    END IF;
    IF v_key = 'selections' THEN
      IF jsonb_typeof(p_filter -> v_key) <> 'object' THEN
        RAISE EXCEPTION 'Selections must be an object' USING ERRCODE = '22023';
      END IF;
      FOR v_field, v_values IN SELECT key, value FROM jsonb_each(p_filter -> v_key)
      LOOP
        IF v_field NOT IN ('canton','city','commune','postal_code','category','branch','company_size','locale','source_system','lifecycle_status')
           OR jsonb_typeof(v_values) <> 'array' THEN
          RAISE EXCEPTION 'Unsupported mailing selection' USING ERRCODE = '22023';
        END IF;
        IF jsonb_array_length(v_values) > 100 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_values) entry
          WHERE jsonb_typeof(entry) <> 'string' OR length(btrim(entry #>> '{}')) NOT BETWEEN 1 AND 240
        ) THEN
          RAISE EXCEPTION 'Invalid mailing selection values' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      CONTINUE;
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

-- Only the service credential may read aggregate facet values. The BFF additionally
-- requires its live admin session and CSRF proof; no contact coordinates are returned.
CREATE OR REPLACE FUNCTION public.service_marketing_mailing_facets(
  p_field text, p_query text DEFAULT '', p_limit integer DEFAULT 50, p_after text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_result jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_field IS NULL OR p_field NOT IN ('canton','city','commune','postal_code','category','branch','company_size','locale','source_system','lifecycle_status')
     OR length(COALESCE(p_query,'')) > 100 OR length(COALESCE(p_after,'')) > 240 THEN
    RAISE EXCEPTION 'Invalid mailing facet' USING ERRCODE = '22023';
  END IF;
  WITH facet_values AS (
    SELECT c.id, btrim(part.value) AS value FROM public.marketing_contacts c
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(to_jsonb(c) ->> p_field, ''),
      CASE WHEN p_field = 'category' THEN ';' ELSE E'\\x01' END) part(value)
    WHERE c.contact_type IN ('restaurant_prospect','restaurant_lead')
  ), page AS (
    SELECT value, count(DISTINCT id) AS count FROM facet_values
    WHERE value <> '' AND length(value) <= 240
      AND (p_after IS NULL OR value COLLATE "C" > p_after COLLATE "C")
      AND strpos(lower(value), lower(COALESCE(p_query,''))) > 0
    GROUP BY value ORDER BY value COLLATE "C" LIMIT v_limit + 1
  ), visible AS (SELECT * FROM page ORDER BY value COLLATE "C" LIMIT v_limit)
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object('value',value,'count',count) ORDER BY value COLLATE "C"), '[]'::jsonb),
    'next', CASE WHEN (SELECT count(*) FROM page) > v_limit THEN max(value COLLATE "C") ELSE NULL END)
  INTO v_result FROM visible;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.service_marketing_mailing_facets(text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_marketing_mailing_facets(text,text,integer,text) TO service_role;

-- A missing native banner or copy can be saved for recovery, but never approved.
CREATE OR REPLACE FUNCTION public.marketing_guard_mailing_content()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.channel = 'email' AND NEW.content ->> 'mailing_version' = 'tok-mailing-v1'
     AND (NEW.approval_status = 'approved' OR NEW.status IN ('scheduled','queued','leased','processing','running')) THEN
    IF COALESCE(NEW.content ->> 'visual_status','') <> 'ready'
       OR COALESCE(NEW.content ->> 'visual_url','') !~ '^https://[a-zA-Z0-9.-]+/'
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['subject','headline','body','call_to_action']) k
         WHERE jsonb_typeof(NEW.content -> k) IS DISTINCT FROM 'string'
            OR NULLIF(btrim(NEW.content ->> k),'') IS NULL) THEN
      RAISE EXCEPTION 'Mailing requires reviewed copy and a generated banner' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_guard_mailing_content() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS marketing_guard_mailing_content ON public.marketing_calendar_items;
CREATE TRIGGER marketing_guard_mailing_content BEFORE INSERT OR UPDATE ON public.marketing_calendar_items
  FOR EACH ROW EXECUTE FUNCTION public.marketing_guard_mailing_content();

-- Preserve the current delivery gates and expose only the already approved item's
-- content to the service worker, which renders the same template as the preview.
DO $mailing_delivery$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_prepare_marketing_email_delivery(uuid,uuid)');
  v_definition text;
  v_anchor constant text := '    ''subject'', v_subject,';
  v_replacement constant text := '    ''content'', v_item.content,
    ''subject'', v_subject,';
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Marketing email delivery function missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition,v_replacement) > 0 THEN NULL;
  ELSIF (length(v_definition)-length(replace(v_definition,v_anchor,''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected delivery definition: review migration history';
  ELSE EXECUTE replace(v_definition,v_anchor,v_replacement);
  END IF;
END;
$mailing_delivery$;

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
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(COALESCE(p_filter -> 'selections', '{}'::jsonb)) selection
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(selection.value) wanted(value)
        CROSS JOIN LATERAL regexp_split_to_table(
          COALESCE(to_jsonb(c) ->> selection.key, ''), CASE WHEN selection.key = 'category' THEN ';' ELSE E'\\x01' END
        ) actual(value)
        WHERE lower(btrim(actual.value)) = lower(btrim(wanted.value))
      )
    )
    AND (v_has_email IS NULL OR (c.email_normalized IS NOT NULL) = (v_has_email = 'true'))
    AND (v_has_phone IS NULL OR (c.phone_normalized IS NOT NULL) = (v_has_phone = 'true'))
    AND (v_has_website IS NULL OR (NULLIF(btrim(COALESCE(c.website, '')), '') IS NOT NULL) = (v_has_website = 'true'))
  ) INTO v_matches
  FROM public.marketing_contacts c WHERE c.id = p_contact_id;
  RETURN COALESCE(v_matches, false);
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
