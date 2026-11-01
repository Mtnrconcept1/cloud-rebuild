-- TOK KPI epoch: 2026-11-01 00:00 Europe/Zurich; noon-only snapshots.
-- No Instagram, external contact, spending, authorization or pg_cron changes.
-- Replaces the existing service-only RPC and repairs post-epoch aggregates.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

CREATE OR REPLACE FUNCTION public.service_run_marketing_growth_autopilot(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $growth$
DECLARE
  v_date date := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_epoch_utc timestamptz := (timestamp '2026-11-01 00:00:00' AT TIME ZONE 'Europe/Zurich');
  v_window_start_utc timestamptz := GREATEST(now() - interval '7 days', v_epoch_utc);
  v_staged integer := 0;
  v_converted integer := 0;
  v_suppressed integer := 0;
  v_contacts integer := 0;
  v_opted_in_emails integer := 0;
  v_leads_7d integer := 0;
  v_leads_with_source_7d integer := 0;
  v_signatures_7d integer := 0;
  v_reservations_7d integer := 0;
  v_honored_7d integer := 0;
  v_acquisitions_7d integer := 0;
  v_attributed_7d integer := 0;
  v_contracts_signed_7d integer := 0;
  v_paid_invoices_7d integer := 0;
  v_paid_deals_7d integer := 0;
  v_activated_restaurants_7d integer := 0;
  v_focus text;
  v_metrics jsonb;
  -- Geneva's local noon converted into an instant, including CET/CEST.
  v_noon_utc timestamptz := ((v_date::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Zurich');
  v_snapshot_recorded_at timestamptz;
  v_refresh_only boolean := false;
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

  -- Without a durable pre-noon staging marker, never create a morning
  -- snapshot or repeatedly stage new batches. The daily run begins at noon.
  IF now() < v_noon_utc THEN
    RETURN jsonb_build_object('status','waiting_noon','date',v_date,'staged',0);
  END IF;

  SELECT recorded_at, staged_count, suppressed_count, converted_count
    INTO v_snapshot_recorded_at, v_staged, v_suppressed, v_converted
  FROM public.marketing_growth_snapshots
  WHERE local_date = v_date
  FOR UPDATE;
  IF v_snapshot_recorded_at IS NOT NULL THEN
    IF now() < v_noon_utc OR v_snapshot_recorded_at >= v_noon_utc THEN
      RETURN jsonb_build_object('status','already_completed','date',v_date,'staged',0);
    END IF;
    v_refresh_only := true;
  END IF;

  -- Only refresh aggregates after noon. Preserve the existing daily
  -- opportunity queue, consent flags and same-day staging totals.
  IF NOT v_refresh_only THEN

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
      WHERE f.source_objectid = c.source_objectid AND f.signed_at >= v_window_start_utc
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
  END IF;

  SELECT count(*) INTO v_contacts FROM public.marketing_contacts
    WHERE contact_type IN ('restaurant_prospect','restaurant_lead')
      AND created_at >= v_window_start_utc;
  SELECT count(*) INTO v_opted_in_emails FROM public.marketing_contacts c
    WHERE c.lawful_basis = 'consent' AND c.consent_at IS NOT NULL
      AND c.email_normalized IS NOT NULL AND c.opted_out_at IS NULL
      AND c.suppression_reason IS NULL AND c.created_at >= v_window_start_utc
      AND public.marketing_contact_is_eligible(c.id,'email');

  SELECT count(*) INTO v_leads_7d FROM public.restaurant_leads
    WHERE created_at >= v_window_start_utc;
  -- Self-reported acquisition hints are counted separately, not as verified conversions.
  SELECT count(*) INTO v_leads_with_source_7d FROM public.restaurant_leads
    WHERE created_at >= v_window_start_utc
      AND source = 'restaurateurs_geneve'
      AND metadata #>> '{acquisition_touch,status}' = 'self_reported_unverified'
      AND metadata #>> '{acquisition_touch,utm,utm_source}' IS NOT NULL;
  SELECT count(*) INTO v_signatures_7d FROM public.commercial_prospect_followups
    WHERE signed_at >= v_window_start_utc;
  SELECT count(*) INTO v_reservations_7d FROM public.reservations
    WHERE created_at >= v_window_start_utc;
  SELECT count(*) INTO v_honored_7d FROM public.reservations
    WHERE honored_at >= v_window_start_utc;
  SELECT count(*) INTO v_acquisitions_7d FROM public.marketing_acquisition_touches
    WHERE touched_at >= v_window_start_utc;
  SELECT count(*) INTO v_attributed_7d FROM public.marketing_attribution_facts
    WHERE observed_at >= v_window_start_utc
      AND fact_type = 'conversion' AND campaign_id IS NOT NULL;

  -- Verifiable post-signature funnel, never substituted for campaign attribution.
  -- A Stripe invoice is deduplicated by its stable invoice identifier.
  SELECT count(*) INTO v_contracts_signed_7d FROM public.restaurant_contracts
    WHERE signed_at >= v_window_start_utc AND accepted_contract IS TRUE;
  SELECT count(DISTINCT COALESCE(stripe_invoice_id, stripe_event_id))
    INTO v_paid_invoices_7d FROM public.restaurant_subscription_payment_events
    WHERE event_type = 'invoice_paid' AND processed_at >= v_window_start_utc;
  SELECT count(*) INTO v_paid_deals_7d FROM public.restaurant_deals
    WHERE paid_at >= v_window_start_utc
      AND refunded_at IS NULL AND stripe_payment_intent_id IS NOT NULL;
  SELECT count(DISTINCT restaurant_id) INTO v_activated_restaurants_7d
    FROM public.restaurant_subscription_activation_jobs
    WHERE status = 'completed' AND completed_at >= v_window_start_utc;

  -- Focus code is a recommendation, never a claim of causal attribution.
  v_focus := CASE
    WHEN v_leads_7d = 0 THEN 'grow_restaurateur_leads'
    WHEN v_acquisitions_7d >= 20 AND v_reservations_7d = 0 THEN 'improve_booking_conversion'
    WHEN v_opted_in_emails > 0 THEN 'nurture_opted_in_leads'
    ELSE 'measure_baseline'
  END;
  v_metrics := jsonb_build_object(
    'source','TOK PostgreSQL', 'window_days',7,
    'kpi_start_local_date','2026-11-01','window_start_utc',v_window_start_utc,
    'prospect_contacts',v_contacts,'consented_emails',v_opted_in_emails,
    'restaurant_leads_created',v_leads_7d,
    'inbound_leads_with_source_unverified',v_leads_with_source_7d,
    'signed_restaurants',v_signatures_7d,
    'reservations_created',v_reservations_7d,'reservations_honored',v_honored_7d,
    'acquisition_touches',v_acquisitions_7d,'campaign_attributed_conversions',v_attributed_7d,
    'restaurant_contracts_signed',v_contracts_signed_7d,
    'stripe_subscription_invoices_paid',v_paid_invoices_7d,
    'stripe_verified_deals_paid',v_paid_deals_7d,
    'restaurants_activated',v_activated_restaurants_7d,
    'paid_metrics_attribution','Unattributed operational receipts; do not add invoice and deal counts.',
    'conversion_rate',NULL,
    'rate_limitation','No verified matched visitor-to-reservation denominator.'
  );
  INSERT INTO public.marketing_growth_snapshots(local_date,metrics,focus_code,staged_count,suppressed_count,converted_count)
    VALUES (v_date,v_metrics,v_focus,v_staged,v_suppressed,v_converted)
  ON CONFLICT (local_date) DO UPDATE SET
    recorded_at = now(),
    metrics = EXCLUDED.metrics,
    focus_code = EXCLUDED.focus_code;
  RETURN jsonb_build_object('status','completed','date',v_date,
    'staged',CASE WHEN v_refresh_only THEN 0 ELSE v_staged END,
    'suppressed',CASE WHEN v_refresh_only THEN 0 ELSE v_suppressed END,
    'converted',CASE WHEN v_refresh_only THEN 0 ELSE v_converted END,
    'refreshed',v_refresh_only,
    'focus',v_focus,'metrics',v_metrics);
END;
$growth$;

REVOKE ALL ON FUNCTION public.service_run_marketing_growth_autopilot(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_run_marketing_growth_autopilot(integer)
  TO service_role;


-- Backfill post-epoch snapshots at their actual recorded timestamp.
-- Do not fake a new recorded_at or change any historical pre-November row.
WITH daily_sources AS (
  SELECT id, recorded_at,
    GREATEST(recorded_at - interval '7 days',
      (timestamp '2026-11-01 00:00:00' AT TIME ZONE 'Europe/Zurich')) AS start_at
  FROM public.marketing_growth_snapshots
  WHERE local_date >= DATE '2026-11-01'
    AND recorded_at >= ((local_date::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Zurich')
),
corrected AS (
  SELECT s.id, s.start_at,
    (SELECT count(*) FROM public.marketing_contacts c WHERE c.contact_type IN ('restaurant_prospect','restaurant_lead') AND c.created_at >= s.start_at AND c.created_at <= s.recorded_at) AS prospect_contacts,
    (SELECT count(*) FROM public.marketing_contacts c WHERE c.lawful_basis='consent' AND c.consent_at IS NOT NULL AND c.email_normalized IS NOT NULL AND c.opted_out_at IS NULL AND c.suppression_reason IS NULL AND c.created_at >= s.start_at AND c.created_at <= s.recorded_at AND public.marketing_contact_is_eligible(c.id,'email')) AS consented_emails,
    (SELECT count(*) FROM public.restaurant_leads r WHERE r.created_at >= s.start_at AND r.created_at <= s.recorded_at) AS restaurant_leads_created,
    (SELECT count(*) FROM public.restaurant_leads r WHERE r.created_at >= s.start_at AND r.created_at <= s.recorded_at AND r.source='restaurateurs_geneve' AND r.metadata #>> '{acquisition_touch,status}'='self_reported_unverified' AND r.metadata #>> '{acquisition_touch,utm,utm_source}' IS NOT NULL) AS inbound_leads_with_source_unverified,
    (SELECT count(*) FROM public.commercial_prospect_followups f WHERE f.signed_at >= s.start_at AND f.signed_at <= s.recorded_at) AS signed_restaurants,
    (SELECT count(*) FROM public.reservations r WHERE r.created_at >= s.start_at AND r.created_at <= s.recorded_at) AS reservations_created,
    (SELECT count(*) FROM public.reservations r WHERE r.honored_at >= s.start_at AND r.honored_at <= s.recorded_at) AS reservations_honored,
    (SELECT count(*) FROM public.marketing_acquisition_touches t WHERE t.touched_at >= s.start_at AND t.touched_at <= s.recorded_at) AS acquisition_touches,
    (SELECT count(*) FROM public.marketing_attribution_facts f WHERE f.observed_at >= s.start_at AND f.observed_at <= s.recorded_at AND f.fact_type='conversion' AND f.campaign_id IS NOT NULL) AS campaign_attributed_conversions,
    (SELECT count(*) FROM public.restaurant_contracts c WHERE c.signed_at >= s.start_at AND c.signed_at <= s.recorded_at AND c.accepted_contract IS TRUE) AS restaurant_contracts_signed,
    (SELECT count(DISTINCT COALESCE(e.stripe_invoice_id,e.stripe_event_id)) FROM public.restaurant_subscription_payment_events e WHERE e.event_type='invoice_paid' AND e.processed_at >= s.start_at AND e.processed_at <= s.recorded_at) AS stripe_subscription_invoices_paid,
    (SELECT count(*) FROM public.restaurant_deals d WHERE d.paid_at >= s.start_at AND d.paid_at <= s.recorded_at AND d.refunded_at IS NULL AND d.stripe_payment_intent_id IS NOT NULL) AS stripe_verified_deals_paid,
    (SELECT count(DISTINCT j.restaurant_id) FROM public.restaurant_subscription_activation_jobs j WHERE j.status='completed' AND j.completed_at >= s.start_at AND j.completed_at <= s.recorded_at) AS restaurants_activated
  FROM daily_sources s
)
UPDATE public.marketing_growth_snapshots snapshot
SET metrics = snapshot.metrics || jsonb_build_object(
    'kpi_start_local_date','2026-11-01','window_start_utc',c.start_at,
    'prospect_contacts',c.prospect_contacts,
    'consented_emails',c.consented_emails,
    'restaurant_leads_created',c.restaurant_leads_created,
    'inbound_leads_with_source_unverified',c.inbound_leads_with_source_unverified,
    'signed_restaurants',c.signed_restaurants,
    'reservations_created',c.reservations_created,
    'reservations_honored',c.reservations_honored,
    'acquisition_touches',c.acquisition_touches,
    'campaign_attributed_conversions',c.campaign_attributed_conversions,
    'restaurant_contracts_signed',c.restaurant_contracts_signed,
    'stripe_subscription_invoices_paid',c.stripe_subscription_invoices_paid,
    'stripe_verified_deals_paid',c.stripe_verified_deals_paid,
    'restaurants_activated',c.restaurants_activated
  ),
  focus_code = CASE
    WHEN c.restaurant_leads_created = 0 THEN 'grow_restaurateur_leads'
    WHEN c.acquisition_touches >= 20 AND c.reservations_created = 0 THEN 'improve_booking_conversion'
    WHEN c.consented_emails > 0 THEN 'nurture_opted_in_leads'
    ELSE 'measure_baseline' END
FROM corrected c WHERE snapshot.id=c.id;

NOTIFY pgrst, 'reload schema';
COMMIT;
