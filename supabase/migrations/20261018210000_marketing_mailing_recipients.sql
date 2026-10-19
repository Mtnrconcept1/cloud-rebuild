BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- A bounded explicit address list is a separate audience, never a fallback to
-- all restaurants. Normalization follows the existing unique email identity.
CREATE OR REPLACE FUNCTION public.marketing_normalize_mailing_recipients(p_emails jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $function$
DECLARE
  v_entry jsonb;
  v_email text;
  v_local text;
  v_domain text;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(p_emails) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Recipient emails must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_emails) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Mailing requires between 1 and 500 recipients' USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_emails)
  LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'string'
       OR (v_entry #>> '{}') ~ E'[\r\n]' THEN
      RAISE EXCEPTION 'Invalid mailing email' USING ERRCODE = '22023';
    END IF;
    v_email := lower(btrim(v_entry #>> '{}'));
    v_local := split_part(v_email, '@', 1);
    v_domain := split_part(v_email, '@', 2);
    IF length(v_email) > 254 OR length(v_local) NOT BETWEEN 1 AND 64
       OR length(v_email) - length(replace(v_email, '@', '')) <> 1
       OR v_local !~ $email$^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$$email$
       OR strpos(v_domain, '.') = 0
       OR EXISTS (
         SELECT 1 FROM unnest(string_to_array(v_domain, '.')) label
         WHERE label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
       ) THEN
      RAISE EXCEPTION 'Invalid mailing email' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT jsonb_agg(email ORDER BY first_position) INTO v_result
  FROM (
    SELECT lower(btrim(value)) AS email, min(position) AS first_position
    FROM jsonb_array_elements_text(p_emails) WITH ORDINALITY entry(value, position)
    GROUP BY lower(btrim(value))
  ) normalized;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.marketing_normalize_mailing_recipients(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- Extend the current validators in place, retaining every historic filter and
-- every later authorization change. Fail closed if the expected code diverged.
DO $mailing_recipients_filters$
DECLARE
  v_definition text;
  v_anchor text;
  v_branch text;
BEGIN
  v_definition := pg_get_functiondef('public.marketing_validate_audience_filter(jsonb)'::regprocedure);
  v_anchor := '  FOR v_key IN SELECT jsonb_object_keys(p_filter)';
  v_branch := $branch$  IF p_filter ? 'recipient_emails' THEN
    IF p_filter ->> 'audience_kind' IS DISTINCT FROM 'mixed'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_filter) k WHERE k NOT IN ('audience_kind','recipient_emails')) THEN
      RAISE EXCEPTION 'Explicit recipients cannot be combined with audience filters' USING ERRCODE = '22023';
    END IF;
    PERFORM public.marketing_normalize_mailing_recipients(p_filter -> 'recipient_emails');
    RETURN;
  END IF;
$branch$;
  IF strpos(v_definition, v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition, 'recipient_emails') > 0
     OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing audience validator; reconcile migration history';
  ELSE EXECUTE replace(v_definition, v_anchor, v_branch || v_anchor);
  END IF;

  v_definition := pg_get_functiondef('public.marketing_contact_matches_filter(uuid,jsonb)'::regprocedure);
  v_anchor := '  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, ''{}''::jsonb));';
  v_branch := $branch$
  IF p_filter ? 'recipient_emails' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.marketing_contacts c
      WHERE c.id = p_contact_id AND c.email_normalized IN (
        SELECT lower(btrim(value)) FROM jsonb_array_elements_text(p_filter -> 'recipient_emails')
      )
    ) INTO v_matches;
    RETURN v_matches;
  END IF;
$branch$;
  IF strpos(v_definition, v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition, 'recipient_emails') > 0
     OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing audience matcher; reconcile migration history';
  ELSE EXECUTE replace(v_definition, v_anchor, v_anchor || v_branch);
  END IF;
END;
$mailing_recipients_filters$;

-- Private resolver used by authorized estimate/approval/dispatch operations.
-- A NULL result means a validated legacy audience; an empty array means that
-- an explicit list currently matches no identity and must remain empty.
CREATE OR REPLACE FUNCTION public.marketing_mailing_recipient_contact_ids(p_filter jsonb)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, '{}'::jsonb));
  IF NOT COALESCE(p_filter ? 'recipient_emails', false) THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[]) INTO v_ids
  FROM public.marketing_contacts c
  WHERE c.email_normalized IS NOT NULL
    AND c.email_normalized = ANY (ARRAY(
      SELECT lower(btrim(value)) FROM jsonb_array_elements_text(p_filter -> 'recipient_emails')
    ));
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_mailing_recipient_contact_ids(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- After the existing admin guard, validate an explicit list once and resolve
-- it through the unique email index. Inspect at most 500 matching identities
-- instead of revalidating the list for every contact in the database. Legacy
-- audiences continue through the original validator and estimator unchanged.
DO $mailing_recipients_estimate$
DECLARE
  v_signature regprocedure := to_regprocedure('public.admin_estimate_marketing_audience(jsonb,text[])');
  v_definition text;
  v_anchor constant text := '  PERFORM public.marketing_validate_audience_filter(COALESCE(p_filter, ''{}''::jsonb));';
  v_branch constant text := $branch$
  IF p_filter ? 'recipient_emails' THEN
    DECLARE
      v_recipient_ids uuid[] := public.marketing_mailing_recipient_contact_ids(p_filter);
    BEGIN
      SELECT count(*), count(*) FILTER (
        WHERE (v_has_public AND NOT v_has_individual) OR (
          c.opted_out_at IS NULL AND EXISTS (
            SELECT 1 FROM unnest(COALESCE(p_channels, '{}'::text[])) requested_channel
            WHERE public.marketing_contact_is_eligible(c.id, requested_channel)
          )
        )
      ) INTO v_total, v_eligible
      FROM public.marketing_contacts c
      WHERE c.id = ANY (v_recipient_ids);

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'channel', ch,
        'availability', public.marketing_channel_availability(ch),
        'delivery_mode', CASE WHEN ch IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
          THEN 'public' ELSE 'individual' END,
        'eligible', CASE WHEN ch IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website')
          THEN v_total ELSE (
            SELECT count(*) FROM public.marketing_contacts c
            WHERE c.id = ANY (v_recipient_ids)
              AND c.opted_out_at IS NULL
              AND public.marketing_contact_is_eligible(c.id, ch)
          ) END
      )), '[]'::jsonb) INTO v_channels
      FROM unnest(COALESCE(p_channels, '{}'::text[])) ch;

      RETURN jsonb_build_object(
        'total', v_total, 'eligible', v_eligible, 'eligible_count', v_eligible,
        'consent_coverage', CASE WHEN v_total = 0 THEN 0 ELSE round((v_eligible::numeric / v_total) * 100, 1) END,
        'channels', v_channels, 'estimated_at', now(),
        'warning', 'Estimate only; eligibility is rechecked atomically at dispatch time.'
      );
    END;
  END IF;
$branch$;
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Required marketing audience estimator is missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition, v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition, 'recipient_emails') > 0
     OR strpos(v_definition, '  PERFORM public.marketing_require_admin();') = 0
     OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing audience estimator; reconcile migration history';
  ELSE EXECUTE replace(v_definition, v_anchor, v_branch || v_anchor);
  END IF;
END;
$mailing_recipients_estimate$;

-- Keep every approval, runtime, opt-out, eligibility, reservation and frequency
-- guard in the current functions. Only their contact source is bounded for an
-- explicit list. CASE prevents calling the legacy per-contact validator in
-- that branch; the private resolver has already validated the complete list.
DO $mailing_recipients_dispatch_selection$
DECLARE
  v_target record;
  v_definition text;
  v_declare_anchor constant text := E'DECLARE\n';
  v_declaration constant text := E'DECLARE\n  v_mailing_recipient_ids uuid[];\n';
  v_source_anchor constant text := 'FROM public.marketing_contacts c';
  v_match_anchor constant text := 'public.marketing_contact_matches_filter(c.id, v_item.targeting)';
  v_match constant text := '(CASE WHEN v_mailing_recipient_ids IS NULL THEN public.marketing_contact_matches_filter(c.id, v_item.targeting) ELSE true END)';
  v_initialize constant text := $initialize$  IF v_item.targeting ? 'recipient_emails' THEN
    v_mailing_recipient_ids := public.marketing_mailing_recipient_contact_ids(v_item.targeting);
  END IF;
$initialize$;
  v_source constant text := $source$FROM (
      SELECT explicit_contact.* FROM public.marketing_contacts explicit_contact
      WHERE v_mailing_recipient_ids IS NOT NULL
        AND explicit_contact.id = ANY (v_mailing_recipient_ids)
        AND explicit_contact.email_normalized = ANY (ARRAY(
          SELECT lower(btrim(value)) FROM jsonb_array_elements_text(v_item.targeting -> 'recipient_emails')
        ))
      UNION ALL
      SELECT legacy_contact.* FROM public.marketing_contacts legacy_contact
      WHERE v_mailing_recipient_ids IS NULL
    ) c$source$;
BEGIN
  FOR v_target IN SELECT * FROM (VALUES
    ('public.admin_approve_marketing_item(uuid,timestamptz)', '    SELECT count(*) INTO v_computed_audience_size'),
    ('public.service_materialize_marketing_deliveries(uuid,integer)', '  WITH eligible AS (')
  ) target(signature, initialize_anchor)
  LOOP
    IF to_regprocedure(v_target.signature) IS NULL THEN
      RAISE EXCEPTION 'Required mailing selection function is missing: %', v_target.signature;
    END IF;
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    IF strpos(v_definition, v_declaration) > 0
       AND strpos(v_definition, v_initialize) > 0
       AND strpos(v_definition, v_source) > 0
       AND strpos(v_definition, v_match) > 0 THEN NULL;
    ELSIF strpos(v_definition, 'v_mailing_recipient_ids') > 0
       OR (length(v_definition) - length(replace(v_definition, v_declare_anchor, ''))) / length(v_declare_anchor) <> 1
       OR (length(v_definition) - length(replace(v_definition, v_source_anchor, ''))) / length(v_source_anchor) <> 1
       OR (length(v_definition) - length(replace(v_definition, v_match_anchor, ''))) / length(v_match_anchor) <> 1
       OR (length(v_definition) - length(replace(v_definition, v_target.initialize_anchor, ''))) / length(v_target.initialize_anchor) <> 1 THEN
      RAISE EXCEPTION 'Unexpected mailing selection function; reconcile migration history: %', v_target.signature;
    ELSE
      v_definition := replace(v_definition, v_declare_anchor, v_declaration);
      v_definition := replace(v_definition, v_target.initialize_anchor, v_initialize || v_target.initialize_anchor);
      v_definition := replace(v_definition, v_source_anchor, v_source);
      v_definition := replace(v_definition, v_match_anchor, v_match);
      EXECUTE v_definition;
    END IF;
  END LOOP;
END;
$mailing_recipients_dispatch_selection$;

-- This operation only records missing identities. Importing an address never
-- claims consent, changes a registered profile, or clears an existing opt-out.
-- The unique email index also protects concurrent imports of the same address.
CREATE OR REPLACE FUNCTION public.admin_prepare_marketing_mailing_recipients(p_emails jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_emails jsonb;
  v_created integer;
  v_count integer;
BEGIN
  PERFORM public.marketing_require_admin();
  v_emails := public.marketing_normalize_mailing_recipients(p_emails);
  v_count := jsonb_array_length(v_emails);
  INSERT INTO public.marketing_contacts (
    contact_type, source_system, display_name, email, target_fingerprint,
    lawful_basis, lifecycle_status, metadata, created_by
  )
  SELECT 'manual', 'mailing_import', 'Destinataire importé', email,
    encode(extensions.digest(email, 'sha256'), 'hex'), 'none', 'new',
    '{"imported_for_mailing":true}'::jsonb, public.marketing_actor_user_id()
  FROM jsonb_array_elements_text(v_emails) recipients(email)
  ON CONFLICT (email_normalized) WHERE email_normalized IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN jsonb_build_object(
    'recipient_count', v_count, 'created_count', v_created, 'existing_count', v_count - v_created,
    'estimate', public.admin_estimate_marketing_audience(
      jsonb_build_object('audience_kind','mixed','recipient_emails',v_emails), ARRAY['email']::text[]
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_prepare_marketing_mailing_recipients(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

DO $mailing_recipients_dispatch$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_execute_marketing_admin_operation(text,text,text,jsonb)');
  v_definition text;
  v_anchor constant text := '    WHEN ''admin_estimate_marketing_audience'' THEN';
  v_branch constant text := $branch$    WHEN 'admin_prepare_marketing_mailing_recipients' THEN
      IF p_csrf_hash IS NULL THEN
        RAISE EXCEPTION 'Marketing CSRF proof required' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_args) arg(k) WHERE arg.k <> 'p_emails') THEN
        RAISE EXCEPTION 'Recipient import contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_prepare_marketing_mailing_recipients(v_args -> 'p_emails');
$branch$;
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Required marketing BFF dispatcher is missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition, v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition, 'WHEN ''admin_prepare_marketing_mailing_recipients''') > 0
     OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing BFF dispatcher; reconcile migration history';
  ELSE EXECUTE replace(v_definition, v_anchor, v_branch || v_anchor);
  END IF;
END;
$mailing_recipients_dispatch$;

-- Campaign audience definitions can now contain coordinates, just like item
-- targeting. Keep them out of generic audit records while retaining row IDs.
DO $mailing_recipients_audit$
DECLARE
  v_definition text := pg_get_functiondef('public.marketing_redact_audit_record(jsonb)'::regprocedure);
  v_anchor constant text := '- ''targeting''';
BEGIN
  IF strpos(v_definition, '- ''audience_definition''') > 0 THEN NULL;
  ELSIF (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing audit redactor; reconcile migration history';
  ELSE EXECUTE replace(v_definition, v_anchor, v_anchor || ' - ''audience_definition''');
  END IF;
END;
$mailing_recipients_audit$;

NOTIFY pgrst, 'reload schema';
COMMIT;
