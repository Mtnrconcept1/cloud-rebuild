-- Growth AutoPilot TOK: durable, opt-in-only sales qualification and measured conversion signals.
-- Does not contact prospects, send mail, spend money, create backlinks or bypass approval gates.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Protect automated bulk email from an old B2B 'legitimate_interest' exemption.
-- Keep all other existing channel policies and private revocation/confirmation checks intact.
DO $consent_gate$
DECLARE
  v_signature regprocedure := to_regprocedure('public.marketing_contact_is_eligible(uuid,text)');
  v_definition text;
  v_old constant text := 'AND (c.lawful_basis IN (''consent'',''existing_customer'') OR (c.lawful_basis = ''legitimate_interest'' AND c.contact_type IN (''restaurant_prospect'',''restaurant_lead'')))';
  v_new constant text := 'AND (CASE WHEN p_channel = ''email'' THEN (c.lawful_basis = ''existing_customer'' OR (c.lawful_basis = ''consent'' AND c.consent_at IS NOT NULL)) ELSE (c.lawful_basis IN (''consent'',''existing_customer'') OR (c.lawful_basis = ''legitimate_interest'' AND c.contact_type IN (''restaurant_prospect'',''restaurant_lead''))) END)';
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Marketing eligibility guard missing. Review migration prerequisites.';
  END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF position(v_new IN v_definition) > 0 THEN
    NULL; -- idempotent replay
  ELSIF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Marketing eligibility guard changed. Reconcile before changing email rules.';
  ELSE
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END;
$consent_gate$;

CREATE TABLE IF NOT EXISTS public.marketing_growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  action_kind text NOT NULL CHECK (action_kind IN ('consented_nurture', 'research_review')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'converted', 'suppressed', 'closed')),
  priority integer NOT NULL CHECK (priority BETWEEN 0 AND 100),
  reason_code text NOT NULL CHECK (reason_code IN ('inbound_restaurant_lead', 'verified_consent', 'restaurant_directory_review')),
  content_subject text NOT NULL DEFAULT '' CHECK (char_length(content_subject) <= 160),
  content_body text NOT NULL DEFAULT '' CHECK (char_length(content_body) <= 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, action_kind)
);
CREATE INDEX IF NOT EXISTS marketing_growth_opportunities_status_priority_idx
  ON public.marketing_growth_opportunities(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS marketing_growth_opportunities_contact_idx
  ON public.marketing_growth_opportunities(contact_id);

CREATE TABLE IF NOT EXISTS public.marketing_growth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_date date NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  focus_code text NOT NULL CHECK (focus_code IN (
    'grow_restaurateur_leads', 'improve_booking_conversion', 'nurture_opted_in_leads', 'measure_baseline'
  )),
  staged_count integer NOT NULL DEFAULT 0 CHECK (staged_count BETWEEN 0 AND 200),
  suppressed_count integer NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  converted_count integer NOT NULL DEFAULT 0 CHECK (converted_count >= 0)
);

-- No browser/anon/service-role table access. Only narrowly granted SECURITY DEFINER RPCs can operate.
ALTER TABLE public.marketing_growth_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_growth_opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_growth_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_growth_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_growth_opportunities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.marketing_growth_snapshots FROM PUBLIC, anon, authenticated, service_role;

-- A daily run prepares only internal sales tasks and aggregate analytics.
-- It intentionally never invokes any provider, scheduled email, generic SQL, or paid AI.
CREATE OR REPLACE FUNCTION public.service_run_marketing_growth_autopilot(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $growth$
DECLARE
  v_date date := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_staged integer := 0;
  v_converted integer := 0;
  v_suppressed integer := 0;
  v_contacts integer := 0;
  v_opted_in_emails integer := 0;
  v_leads_7d integer := 0;
  v_signatures_7d integer := 0;
  v_reservations_7d integer := 0;
  v_honored_7d integer := 0;
  v_acquisitions_7d integer := 0;
  v_attributed_7d integer := 0;
  v_focus text;
  v_metrics jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Growth batch limit out of bounds' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_automations
    WHERE automation_key = 'global_runtime' AND status = 'active'
      AND conditions ->> 'global_pause' = 'false'
  ) THEN
    RETURN jsonb_build_object('status','paused','staged',0);
  END IF;

  IF NOT pg_try_advisory_xact_lock(31102026, 1420) THEN
    RETURN jsonb_build_object('status','busy','staged',0);
  END IF;

  IF EXISTS (SELECT 1 FROM public.marketing_growth_snapshots WHERE local_date = v_date) THEN
    RETURN jsonb_build_object('status','already_completed','date',v_date,'staged',0);
  END IF;

  UPDATE public.marketing_growth_opportunities q SET
    status='suppressed', updated_at=now()
  FROM public.marketing_contacts c
  WHERE q.contact_id=c.id AND q.status IN ('proposed','approved')
    AND (
      c.opted_out_at IS NOT NULL OR c.suppression_reason IS NOT NULL
      OR (q.action_kind='consented_nurture' AND NOT (
        c.lawful_basis='consent' AND c.consent_at IS NOT NULL
        AND public.marketing_contact_is_eligible(c.id,'email')
      ))
    );
  GET DIAGNOSTICS v_suppressed = ROW_COUNT;

  UPDATE public.marketing_growth_opportunities q SET
    status='converted', updated_at=now()
  FROM public.marketing_contacts c
  WHERE q.contact_id=c.id AND q.status IN ('proposed','approved')
    AND c.source_objectid IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.commercial_prospect_followups f
      WHERE f.source_objectid = c.source_objectid AND f.signed_at IS NOT NULL
    );
  GET DIAGNOSTICS v_converted = ROW_COUNT;

  WITH candidates AS (
    SELECT c.id, c.contact_type, c.lead_score,
      CASE WHEN c.lawful_basis = 'consent' AND c.consent_at IS NOT NULL
        AND c.email_normalized IS NOT NULL
        AND public.marketing_contact_is_eligible(c.id, 'email')
        THEN 'consented_nurture' ELSE 'research_review' END AS action_kind,
      LEAST(100, GREATEST(0, COALESCE(c.lead_score, 0)
        + CASE WHEN c.contact_type = 'restaurant_lead' THEN 20 ELSE 0 END
        + CASE WHEN c.website IS NOT NULL AND c.website <> '' THEN 8 ELSE 0 END
        + CASE WHEN c.canton IN ('GE','Genève','Geneve') THEN 10 ELSE 0 END)) AS priority
    FROM public.marketing_contacts c
    WHERE c.contact_type IN ('restaurant_prospect','restaurant_lead')
      AND c.opted_out_at IS NULL AND c.suppression_reason IS NULL
      AND c.lifecycle_status NOT IN ('converted','signed','customer','opted_out','unsubscribed')
      AND (c.last_contact_at IS NULL OR c.last_contact_at < now() - interval '14 days')
      AND NOT EXISTS (
        SELECT 1 FROM public.commercial_prospect_followups f
        WHERE f.source_objectid = c.source_objectid AND f.signed_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_growth_opportunities old
        WHERE old.contact_id = c.id AND old.action_kind IN ('research_review','consented_nurture')
          AND old.status NOT IN ('suppressed','converted','closed')
      )
    ORDER BY
      CASE WHEN c.lawful_basis = 'consent' AND c.consent_at IS NOT NULL AND c.email_normalized IS NOT NULL THEN 0
        WHEN c.contact_type = 'restaurant_lead' THEN 1 ELSE 2 END,
      c.lead_score DESC NULLS LAST, c.id
    LIMIT p_limit
    FOR UPDATE OF c SKIP LOCKED
  )
  INSERT INTO public.marketing_growth_opportunities(
    contact_id,action_kind,priority,reason_code,content_subject,content_body
  )
  SELECT id,action_kind,priority,
    CASE WHEN action_kind='consented_nurture' THEN 'verified_consent'
      WHEN contact_type='restaurant_lead' THEN 'inbound_restaurant_lead'
      ELSE 'restaurant_directory_review' END,
    CASE WHEN action_kind='consented_nurture'
      THEN 'TOK : simplifier vos réservations et vos services'
      ELSE 'Recherche commerciale : qualification TOK' END,
    CASE WHEN action_kind='consented_nurture'
      THEN 'Découvrez comment TOK simplifie la réservation, le service et la visibilité de votre établissement. Présentation : https://www.thetok.ch/restaurateurs/geneve . Envoi soumis aux approbations et au consentement en vigueur.'
      ELSE 'Vérifier la pertinence de cet établissement, son besoin et son statut de consentement avant tout contact. Aucun envoi automatique autorisé.' END
  FROM candidates
  ON CONFLICT (contact_id, action_kind) DO NOTHING;
  GET DIAGNOSTICS v_staged = ROW_COUNT;

  SELECT count(*) INTO v_contacts FROM public.marketing_contacts
    WHERE contact_type IN ('restaurant_prospect','restaurant_lead');
  SELECT count(*) INTO v_opted_in_emails FROM public.marketing_contacts c
    WHERE c.lawful_basis = 'consent' AND c.consent_at IS NOT NULL
      AND c.email_normalized IS NOT NULL AND c.opted_out_at IS NULL
      AND c.suppression_reason IS NULL
      AND public.marketing_contact_is_eligible(c.id,'email');

  SELECT count(*) INTO v_leads_7d FROM public.restaurant_leads
    WHERE created_at >= now() - interval '7 days';
  SELECT count(*) INTO v_signatures_7d FROM public.commercial_prospect_followups
    WHERE signed_at >= now() - interval '7 days';
  SELECT count(*) INTO v_reservations_7d FROM public.reservations
    WHERE created_at >= now() - interval '7 days';
  SELECT count(*) INTO v_honored_7d FROM public.reservations
    WHERE honored_at >= now() - interval '7 days';
  SELECT count(*) INTO v_acquisitions_7d FROM public.marketing_acquisition_touches
    WHERE touched_at >= now() - interval '7 days';
  SELECT count(*) INTO v_attributed_7d FROM public.marketing_attribution_facts
    WHERE observed_at >= now() - interval '7 days'
      AND fact_type = 'conversion' AND campaign_id IS NOT NULL;

  -- Focus code is a recommendation, never a claim of causal attribution.
  v_focus := CASE
    WHEN v_leads_7d = 0 THEN 'grow_restaurateur_leads'
    WHEN v_acquisitions_7d >= 20 AND v_reservations_7d = 0 THEN 'improve_booking_conversion'
    WHEN v_opted_in_emails > 0 THEN 'nurture_opted_in_leads'
    ELSE 'measure_baseline'
  END;
  v_metrics := jsonb_build_object(
    'source','TOK PostgreSQL', 'window_days',7,
    'prospect_contacts',v_contacts,'consented_emails',v_opted_in_emails,
    'restaurant_leads_created',v_leads_7d,'signed_restaurants',v_signatures_7d,
    'reservations_created',v_reservations_7d,'reservations_honored',v_honored_7d,
    'acquisition_touches',v_acquisitions_7d,'campaign_attributed_conversions',v_attributed_7d,
    'conversion_rate',NULL,
    'rate_limitation','No verified matched visitor-to-reservation denominator.'
  );
  INSERT INTO public.marketing_growth_snapshots(local_date,metrics,focus_code,staged_count,suppressed_count,converted_count)
    VALUES (v_date,v_metrics,v_focus,v_staged,v_suppressed,v_converted);
  RETURN jsonb_build_object('status','completed','date',v_date,
    'staged',v_staged,'suppressed',v_suppressed,'converted',v_converted,
    'focus',v_focus,'metrics',v_metrics);
END;
$growth$;

REVOKE ALL ON FUNCTION public.service_run_marketing_growth_autopilot(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_run_marketing_growth_autopilot(integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
