-- Evidence-based Analytics: native activity, canonical delivery outcomes and
-- attributed business facts remain separate. No external action or backfill.
BEGIN;

CREATE INDEX IF NOT EXISTS marketing_events_analytics_time_idx
  ON public.marketing_events (occurred_at, delivery_id, event_type);
CREATE INDEX IF NOT EXISTS marketing_events_analytics_identity_idx
  ON public.marketing_events (delivery_id, event_type, occurred_at)
  WHERE delivery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_campaigns_analytics_created_idx
  ON public.marketing_campaigns (created_at);
CREATE INDEX IF NOT EXISTS marketing_calendar_analytics_created_idx
  ON public.marketing_calendar_items (created_at);
CREATE INDEX IF NOT EXISTS marketing_calendar_analytics_schedule_idx
  ON public.marketing_calendar_items (scheduled_at)
  WHERE approval_status = 'approved'
    AND status IN ('scheduled', 'queued', 'leased', 'processing', 'running', 'retrying');
CREATE INDEX IF NOT EXISTS marketing_calendar_analytics_published_idx
  ON public.marketing_calendar_items (published_at, channel)
  WHERE channel IN ('instagram', 'facebook')
    AND NULLIF(btrim(provider_external_id), '') IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_calendar_analytics_provider_idx
  ON public.marketing_calendar_items (channel, btrim(provider_external_id), published_at)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_attribution_analytics_time_idx
  ON public.marketing_attribution_facts (observed_at)
  WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_get_marketing_autopilot_dashboard(
  p_from timestamptz DEFAULT (now() - interval '30 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_global_paused boolean := true;
  v_global_reason text;
  v_providers jsonb := '[]'::jsonb;
  v_automations jsonb := '[]'::jsonb;
  v_assets jsonb := '{}'::jsonb;
  v_sent bigint;
  v_delivered bigint;
  v_clicked bigint;
  v_event_conversions bigint;
  v_event_count bigint := 0;
  v_leads bigint;
  v_business_conversions bigint;
  v_spend_minor bigint;
  v_revenue_minor bigint;
  v_currency text;
  v_currency_count integer := 0;
  v_unavailable_reasons jsonb := '[]'::jsonb;
  v_completeness text;
  v_analytics jsonb;
  v_metrics jsonb;
  v_daily_results jsonb;
  v_completeness_ratio numeric;
  v_campaigns_created bigint;
  v_items_created bigint;
  v_items_scheduled bigint;
  v_social_publications bigint;
  v_campaigns_at timestamptz;
  v_items_at timestamptz;
  v_publications_at timestamptz;
  v_sent_at timestamptz;
  v_delivered_at timestamptz;
  v_clicked_at timestamptz;
  v_event_conversions_at timestamptz;
  v_leads_at timestamptz;
  v_conversions_at timestamptz;
  v_spend_at timestamptz;
  v_revenue_at timestamptz;
  v_cpl numeric;
  v_cpa numeric;
  v_roas numeric;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
     OR p_from >= p_to
     OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'Dashboard interval must be finite, positive and at most 366 days'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE((a.conditions ->> 'global_pause')::boolean, true),
    a.conditions ->> 'reason'
  INTO v_global_paused, v_global_reason
  FROM public.marketing_automations a
  WHERE a.automation_key = 'global_runtime';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', p.provider,
    'display_name', p.display_name,
    'provider_kind', p.provider_kind,
    'channels', to_jsonb(p.channels),
    'capabilities', to_jsonb(p.capabilities),
    'granted_scopes', to_jsonb(p.granted_scopes),
    'control_state', p.control_state,
    'observed_state', p.observed_state,
    'adapter_deployed', p.adapter_deployed,
    'probe_ready', (
      p.control_state <> 'paused'
      AND p.observed_state = 'ready'
      AND p.adapter_deployed IS TRUE
      AND p.last_probe_at >= now() - interval '24 hours'
    ),
    'ready', false,
    'external_actions_enabled', false,
    'last_probe_at', p.last_probe_at,
    'last_probe_status', p.last_probe_status,
    'last_error_code', p.last_error_code,
    'control_reason', p.control_reason,
    'updated_at', p.updated_at
  ) ORDER BY p.provider), '[]'::jsonb)
  INTO v_providers
  FROM public.marketing_provider_accounts p;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'automation_key', t.template_key,
    'template_key', t.template_key,
    'name', t.name,
    'schema_version', t.schema_version,
    'template_enabled', t.is_enabled,
    'automation_status', COALESCE(a.status, 'disabled'),
    'status', COALESCE(a.status, 'disabled'),
    'autonomy_level', COALESCE(a.autonomy_level, 0),
    'approval_mode', COALESCE(a.approval_mode, 'human_required'),
    'requires_approval', true,
    'external_effects_enabled', false,
    'action_type', t.action_contract ->> 'action_type'
  ) ORDER BY t.template_key), '[]'::jsonb)
  INTO v_automations
  FROM public.marketing_automation_templates t
  LEFT JOIN public.marketing_automations a ON a.template_id = t.id
  WHERE t.template_key LIKE 'tok.%';

  SELECT jsonb_build_object(
    'total', count(*),
    'draft', count(*) FILTER (WHERE a.status = 'draft'),
    'approved', count(*) FILTER (WHERE a.status = 'approved'),
    'rejected', count(*) FILTER (WHERE a.status = 'rejected'),
    'archived', count(*) FILTER (WHERE a.status = 'archived'),
    'with_current_rights', count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.marketing_asset_rights r
      WHERE r.asset_id = a.id
        AND (r.valid_from IS NULL OR r.valid_from <= CURRENT_DATE)
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
    ))
  )
  INTO v_assets
  FROM public.marketing_assets a;

  -- Native activity counts are confirmed by these reads. The scheduled count
  -- is current stock within the requested window, not a cumulative outcome.
  SELECT count(*), max(c.created_at)
  INTO v_campaigns_created, v_campaigns_at
  FROM public.marketing_campaigns c
  WHERE c.created_at >= p_from AND c.created_at < p_to;

  SELECT count(*), max(i.created_at)
  INTO v_items_created, v_items_at
  FROM public.marketing_calendar_items i
  WHERE i.created_at >= p_from AND i.created_at < p_to;

  SELECT count(*) INTO v_items_scheduled
  FROM public.marketing_calendar_items i
  WHERE i.scheduled_at >= p_from AND i.scheduled_at < p_to
    AND i.approval_status = 'approved'
    AND i.status IN ('scheduled', 'queued', 'leased', 'processing', 'running', 'retrying');

  -- Bound the candidate scan, then find the first occurrence across all time.
  -- A replay in this period must not duplicate a publication from an earlier one.
  WITH candidates AS (
    SELECT DISTINCT i.channel, btrim(i.provider_external_id) AS provider_id
    FROM public.marketing_calendar_items i
    WHERE i.channel IN ('instagram', 'facebook')
      AND i.published_at >= p_from AND i.published_at < p_to
      AND NULLIF(btrim(i.provider_external_id), '') IS NOT NULL
  ), canonical AS (
    SELECT c.channel, c.provider_id, (
      SELECT min(i.published_at)
      FROM public.marketing_calendar_items i
      WHERE i.channel = c.channel
        AND btrim(i.provider_external_id) = c.provider_id
        AND i.published_at IS NOT NULL
    ) AS occurred_at
    FROM candidates c
  )
  SELECT count(*), max(c.occurred_at)
  INTO v_social_publications, v_publications_at
  FROM canonical c
  WHERE c.occurred_at >= p_from AND c.occurred_at < p_to;

  -- The status trigger and the provider callback can record the same outcome.
  -- Normalize through the existing view and deduplicate before filtering time.
  -- Unlinked historical events retain their individual immutable identity.
  WITH candidate_keys AS (
    SELECT DISTINCT e.delivery_id,
      CASE WHEN e.delivery_id IS NULL THEN e.id END AS unlinked_event_id,
      e.event_type
    FROM public.marketing_event_facts e
    WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
      AND e.event_type IN (
        'delivery_sent', 'delivery_delivered', 'delivery_clicked', 'delivery_converted'
      )
  ), canonical AS (
    SELECT c.event_type, (
      SELECT min(e.occurred_at)
      FROM public.marketing_event_facts e
      WHERE e.event_type = c.event_type
        AND ((c.delivery_id IS NOT NULL AND e.delivery_id = c.delivery_id)
          OR (c.delivery_id IS NULL AND e.id = c.unlinked_event_id))
    ) AS occurred_at
    FROM candidate_keys c
  ), period_facts AS MATERIALIZED (
    SELECT c.event_type, c.occurred_at
    FROM canonical c
    WHERE c.occurred_at >= p_from AND c.occurred_at < p_to
  ), daily AS (
    SELECT (e.occurred_at AT TIME ZONE 'Europe/Zurich')::date AS date,
      count(*) FILTER (WHERE e.event_type = 'delivery_sent') AS sent,
      count(*) FILTER (WHERE e.event_type = 'delivery_delivered') AS delivered,
      count(*) FILTER (WHERE e.event_type = 'delivery_clicked') AS clicks,
      count(*) FILTER (WHERE e.event_type = 'delivery_converted') AS conversions
    FROM period_facts e
    GROUP BY (e.occurred_at AT TIME ZONE 'Europe/Zurich')::date
  )
  SELECT count(*),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_sent'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_delivered'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_clicked'), 0),
    NULLIF(count(*) FILTER (WHERE e.event_type = 'delivery_converted'), 0),
    max(e.occurred_at) FILTER (WHERE e.event_type = 'delivery_sent'),
    max(e.occurred_at) FILTER (WHERE e.event_type = 'delivery_delivered'),
    max(e.occurred_at) FILTER (WHERE e.event_type = 'delivery_clicked'),
    max(e.occurred_at) FILTER (WHERE e.event_type = 'delivery_converted'),
    (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.date), '[]'::jsonb) FROM daily d)
  INTO v_event_count, v_sent, v_delivered, v_clicked, v_event_conversions,
    v_sent_at, v_delivered_at, v_clicked_at, v_event_conversions_at, v_daily_results
  FROM period_facts e;

  -- Only campaign-linked attribution facts can support business results.
  -- Existing general accounting totals are not marketing attribution.
  SELECT
    NULLIF(count(*) FILTER (WHERE f.fact_type = 'lead'), 0),
    NULLIF(count(*) FILTER (WHERE f.fact_type = 'conversion'), 0),
    sum(f.value_minor) FILTER (WHERE f.fact_type = 'spend'),
    sum(f.value_minor) FILTER (WHERE f.fact_type = 'revenue'),
    count(DISTINCT f.currency) FILTER (WHERE f.fact_type IN ('spend', 'revenue')),
    min(f.currency) FILTER (WHERE f.fact_type IN ('spend', 'revenue')),
    max(f.observed_at) FILTER (WHERE f.fact_type = 'lead'),
    max(f.observed_at) FILTER (WHERE f.fact_type = 'conversion'),
    max(f.observed_at) FILTER (WHERE f.fact_type = 'spend'),
    max(f.observed_at) FILTER (WHERE f.fact_type = 'revenue')
  INTO v_leads, v_business_conversions, v_spend_minor, v_revenue_minor,
    v_currency_count, v_currency, v_leads_at, v_conversions_at, v_spend_at, v_revenue_at
  FROM public.marketing_attribution_facts f
  WHERE f.campaign_id IS NOT NULL
    AND f.observed_at >= p_from AND f.observed_at < p_to;

  IF v_currency_count > 1 THEN
    v_spend_minor := NULL;
    v_revenue_minor := NULL;
    v_currency := NULL;
  END IF;
  v_cpl := CASE WHEN v_spend_minor IS NOT NULL AND v_leads > 0
    THEN round(v_spend_minor::numeric / v_leads / 100, 2) END;
  v_cpa := CASE WHEN v_spend_minor IS NOT NULL AND v_business_conversions > 0
    THEN round(v_spend_minor::numeric / v_business_conversions / 100, 2) END;
  v_roas := CASE WHEN v_spend_minor > 0 AND v_revenue_minor IS NOT NULL
    THEN round(v_revenue_minor::numeric / v_spend_minor, 4) END;

  -- Absence of an outcome does not prove webhook coverage or a zero result.
  -- CAC has no trustworthy first-customer fact and must remain distinct from CPA.
  SELECT jsonb_agg(jsonb_build_object(
    'key', m.key, 'label', m.label, 'group', m.metric_group,
    'value', m.value, 'unit', m.unit, 'source', m.source,
    'observed_at', CASE WHEN m.value IS NOT NULL THEN m.observed_at END,
    'freshness', CASE
      WHEN m.value IS NULL OR m.observed_at IS NULL THEN 'unknown'
      WHEN m.observed_at >= now() - interval '24 hours' THEN 'fresh'
      ELSE 'stale'
    END,
    'unavailable_reason', CASE WHEN m.value IS NULL THEN m.unavailable_reason END
  ) ORDER BY m.ordinal)
  INTO v_metrics
  FROM (VALUES
    (1, 'campaigns_created', 'Campagnes créées', 'activity', v_campaigns_created::numeric, 'count',
      'marketing_campaigns', COALESCE(v_campaigns_at, now()), NULL::text),
    (2, 'items_created', 'Contenus préparés', 'activity', v_items_created::numeric, 'count',
      'marketing_calendar_items', COALESCE(v_items_at, now()), NULL::text),
    (3, 'items_scheduled', 'En attente de diffusion', 'activity', v_items_scheduled::numeric, 'count',
      'marketing_calendar_items', now(), NULL::text),
    (4, 'social_publications', 'Publications Meta confirmées', 'activity', v_social_publications::numeric, 'count',
      'marketing_calendar_items', COALESCE(v_publications_at, now()), NULL::text),
    (5, 'sent', 'Envois confirmés', 'delivery', v_sent::numeric, 'count',
      'marketing_event_facts', v_sent_at, 'sent_data_unavailable'),
    (6, 'delivered', 'Envois distribués', 'delivery', v_delivered::numeric, 'count',
      'marketing_event_facts', v_delivered_at, 'delivered_data_unavailable'),
    (7, 'clicks', 'Envois avec clic', 'delivery', v_clicked::numeric, 'count',
      'marketing_event_facts', v_clicked_at, 'click_data_unavailable'),
    (8, 'delivery_conversions', 'Conversions de diffusion', 'delivery', v_event_conversions::numeric, 'count',
      'marketing_event_facts', v_event_conversions_at, 'delivery_conversion_data_unavailable'),
    (9, 'leads', 'Prospects attribués', 'attribution', v_leads::numeric, 'count',
      'marketing_attribution_facts', v_leads_at, 'lead_data_unavailable'),
    (10, 'business_conversions', 'Conversions métier attribuées', 'attribution', v_business_conversions::numeric, 'count',
      'marketing_attribution_facts', v_conversions_at, 'conversion_data_unavailable'),
    (11, 'spend', 'Dépenses attribuées', 'attribution', v_spend_minor::numeric / 100, v_currency,
      'marketing_attribution_facts', v_spend_at,
      CASE WHEN v_currency_count > 1 THEN 'mixed_currencies' ELSE 'spend_data_unavailable' END),
    (12, 'revenue', 'Revenu attribué', 'attribution', v_revenue_minor::numeric / 100, v_currency,
      'marketing_attribution_facts', v_revenue_at,
      CASE WHEN v_currency_count > 1 THEN 'mixed_currencies' ELSE 'revenue_data_unavailable' END),
    (13, 'cac', 'Coût par nouveau client', 'attribution', NULL::numeric, v_currency,
      'marketing_attribution_facts', NULL::timestamptz, 'customer_acquisition_data_unavailable'),
    (14, 'cpl', 'Coût par prospect', 'attribution', v_cpl, v_currency,
      'marketing_attribution_facts', CASE WHEN v_cpl IS NOT NULL THEN LEAST(v_spend_at, v_leads_at) END,
      CASE WHEN v_currency_count > 1 THEN 'mixed_currencies' ELSE 'cpl_data_unavailable' END),
    (15, 'cpa', 'Coût par conversion', 'attribution', v_cpa, v_currency,
      'marketing_attribution_facts', CASE WHEN v_cpa IS NOT NULL THEN LEAST(v_spend_at, v_conversions_at) END,
      CASE WHEN v_currency_count > 1 THEN 'mixed_currencies' ELSE 'cpa_data_unavailable' END),
    (16, 'roas', 'Revenu / dépenses', 'attribution', v_roas, 'ratio',
      'marketing_attribution_facts', CASE WHEN v_roas IS NOT NULL THEN LEAST(v_spend_at, v_revenue_at) END,
      CASE WHEN v_currency_count > 1 THEN 'mixed_currencies' ELSE 'roas_data_unavailable' END)
  ) AS m(ordinal, key, label, metric_group, value, unit, source, observed_at, unavailable_reason);

  SELECT count(*) FILTER (WHERE m ->> 'value' IS NOT NULL)::numeric / count(*)
  INTO v_completeness_ratio
  FROM jsonb_array_elements(v_metrics) m;
  SELECT COALESCE(jsonb_agg(r.reason ORDER BY r.reason), '[]'::jsonb)
  INTO v_unavailable_reasons
  FROM (
    SELECT DISTINCT m ->> 'unavailable_reason' AS reason
    FROM jsonb_array_elements(v_metrics) m
    WHERE m ->> 'unavailable_reason' IS NOT NULL
  ) r;
  IF v_event_count = 0 THEN
    v_unavailable_reasons := jsonb_build_array('delivery_events_unavailable') || v_unavailable_reasons;
  END IF;
  v_completeness := CASE WHEN v_completeness_ratio = 1 THEN 'complete' ELSE 'partial' END;

  v_analytics := jsonb_build_object(
    'from', p_from, 'to', p_to, 'timezone', 'Europe/Zurich', 'generated_at', now(),
    'metrics', v_metrics, 'daily_results', v_daily_results,
    'completeness', v_completeness_ratio, 'unavailable_reasons', v_unavailable_reasons,
    -- Preserve legacy scalar names while clients move to the canonical metrics.
    'sent', v_sent, 'delivered', v_delivered, 'clicked', v_clicked,
    'delivery_conversions', v_event_conversions,
    'leads', v_leads, 'business_conversions', v_business_conversions,
    'spend_minor', v_spend_minor, 'revenue_minor', v_revenue_minor,
    'currency', v_currency,
    'cpl_minor', CASE WHEN v_spend_minor IS NOT NULL AND v_leads > 0
      THEN round(v_spend_minor::numeric / v_leads, 2) END,
    'cpa_minor', CASE WHEN v_spend_minor IS NOT NULL AND v_business_conversions > 0
      THEN round(v_spend_minor::numeric / v_business_conversions, 2) END,
    'cac_minor', NULL, 'roas', v_roas
  );

  RETURN jsonb_build_object(
    'generated_at', now(),
    'governance', jsonb_build_object(
      'global_paused', COALESCE(v_global_paused, true),
      'global_pause_reason', v_global_reason,
      'approval_required', true,
      'draft_only', true,
      'external_actions_enabled', false,
      'provider_readiness_requires_fresh_probe', true,
      'max_campaign_autonomy_level', COALESCE((
        SELECT max(c.autonomy_level) FROM public.marketing_campaigns c
      ), 0)
    ),
    'providers', v_providers,
    'automations', v_automations,
    'assets', v_assets,
    'analytics', v_analytics,
    'completeness', v_completeness,
    'unavailable_reasons', v_unavailable_reasons
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_marketing_autopilot_dashboard(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
