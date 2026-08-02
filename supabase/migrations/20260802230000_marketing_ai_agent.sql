-- Marketing AI agent: traceability for generated campaign plans.
--
-- The agent deliberately owns no write path of its own. It proposes a campaign
-- bundle and the marketing BFF persists it through the already allowlisted
-- admin_create_marketing_campaign_bundle operation, so every existing
-- invariant still applies untouched: new calendar items are forced to draft,
-- audience targeting is validated, unconnected channels degrade to
-- blocked_configuration and approval remains a human act.
--
-- What is recorded here is the run itself: which brief produced which plan, at
-- what model and cost, and whether it was persisted. That is what makes an
-- automated proposal auditable after the fact.

CREATE TABLE IF NOT EXISTS public.marketing_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  objective text NOT NULL DEFAULT '' CHECK (char_length(objective) <= 2000),
  requested_channels text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (array_length(requested_channels, 1) IS NULL OR array_length(requested_channels, 1) <= 16),
  -- The plan as proposed, before persistence. Kept so a campaign that was
  -- rejected or edited by an administrator can still be compared with what the
  -- model actually produced.
  proposed_plan jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposed_plan) = 'object'),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  asset_count integer NOT NULL DEFAULT 0 CHECK (asset_count >= 0),
  model text NOT NULL DEFAULT '' CHECK (char_length(model) <= 120),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_chf numeric(12, 4) NOT NULL DEFAULT 0 CHECK (estimated_cost_chf >= 0),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS marketing_ai_runs_created_at_idx
  ON public.marketing_ai_runs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_ai_runs_campaign_idx
  ON public.marketing_ai_runs(campaign_id) WHERE campaign_id IS NOT NULL;

-- Deny-all, like every other marketing table: reads and writes only ever
-- happen through the SECURITY DEFINER helpers below.
ALTER TABLE public.marketing_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.service_start_marketing_ai_run(
  p_actor_user_id uuid,
  p_objective text,
  p_channels text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.marketing_ai_runs (actor_user_id, objective, requested_channels)
  VALUES (
    p_actor_user_id,
    left(COALESCE(btrim(p_objective), ''), 2000),
    COALESCE(p_channels, '{}'::text[])
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_complete_marketing_ai_run(
  p_run_id uuid,
  p_status text,
  p_plan jsonb,
  p_campaign_id uuid,
  p_item_count integer,
  p_asset_count integer,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_chf numeric,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_status, '') NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Marketing AI run must complete as succeeded or failed'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketing_ai_runs SET
    status = p_status,
    proposed_plan = CASE
      WHEN jsonb_typeof(p_plan) = 'object' THEN p_plan
      ELSE proposed_plan
    END,
    campaign_id = COALESCE(p_campaign_id, campaign_id),
    item_count = GREATEST(COALESCE(p_item_count, 0), 0),
    asset_count = GREATEST(COALESCE(p_asset_count, 0), 0),
    model = left(COALESCE(p_model, ''), 120),
    input_tokens = GREATEST(COALESCE(p_input_tokens, 0), 0),
    output_tokens = GREATEST(COALESCE(p_output_tokens, 0), 0),
    estimated_cost_chf = GREATEST(COALESCE(p_estimated_cost_chf, 0), 0),
    last_error = left(NULLIF(btrim(COALESCE(p_error, '')), ''), 2000),
    completed_at = clock_timestamp()
  WHERE id = p_run_id AND status = 'running';
END;
$$;

CREATE OR REPLACE FUNCTION public.service_list_marketing_ai_runs(
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_rows jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();

  SELECT COALESCE(jsonb_agg(row_to_json(entry)::jsonb ORDER BY entry.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      r.id,
      r.status,
      r.objective,
      r.requested_channels,
      r.campaign_id,
      c.name AS campaign_name,
      r.item_count,
      r.asset_count,
      r.model,
      r.estimated_cost_chf,
      r.last_error,
      r.created_at,
      r.completed_at
    FROM public.marketing_ai_runs r
    LEFT JOIN public.marketing_campaigns c ON c.id = r.campaign_id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit
  ) AS entry;

  RETURN jsonb_build_object('runs', v_rows);
END;
$$;

-- The Resend adapter ships with this change, so the email integration stops
-- advertising an adapter that was never deployed. The row stays out of
-- 'connected' on purpose: only a successful credential probe may promote it,
-- which keeps an unconfigured key fail-closed at the orchestrator.
UPDATE public.marketing_integrations
SET
  secret_ref = 'RESEND_API_KEY',
  capabilities = capabilities || jsonb_build_object('adapter_deployed', true),
  description = CASE
    WHEN btrim(description) = '' THEN 'Envoi transactionnel et marketing par e-mail via Resend.'
    ELSE description
  END
WHERE provider = 'resend' AND channel = 'email';

REVOKE ALL ON FUNCTION
  public.service_start_marketing_ai_run(uuid, text, text[]),
  public.service_complete_marketing_ai_run(uuid, text, jsonb, uuid, integer, integer, text, integer, integer, numeric, text),
  public.service_list_marketing_ai_runs(integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.service_start_marketing_ai_run(uuid, text, text[]),
  public.service_complete_marketing_ai_run(uuid, text, jsonb, uuid, integer, integer, text, integer, integer, numeric, text),
  public.service_list_marketing_ai_runs(integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Email delivery adapter
-- ---------------------------------------------------------------------------
-- The orchestrator cannot read a recipient address: deliveries only carry a
-- masked target and a hash. Revealing one is an audited administrator action,
-- which a headless worker has no way to perform.
--
-- This helper closes that gap without widening it. It re-runs the exact gate
-- chain the in-app adapter enforces -- lease, kill-switch, parent approval,
-- campaign approval, quiet hours, eligibility, targeting, frequency and daily
-- caps -- and only then hands back the address, for the single delivery whose
-- lease the caller already holds. The row moves to 'processing' so a crash
-- between here and the provider call cannot be mistaken for a send.

CREATE OR REPLACE FUNCTION public.marketing_html_escape(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(replace(replace(
    COALESCE(p_text, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

CREATE OR REPLACE FUNCTION public.service_prepare_marketing_email_delivery(
  p_delivery_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_contact public.marketing_contacts%ROWTYPE;
  v_preferences public.notification_preferences%ROWTYPE;
  v_frequency_cap_hours integer := 72;
  v_daily_cap integer := 500;
  v_sent_today bigint := 0;
  v_local_time time;
  v_recipient text;
  v_subject text;
  v_headline text;
  v_body text;
  v_cta text;
  v_visual text;
BEGIN
  PERFORM public.marketing_require_service_role();
  PERFORM pg_catalog.pg_advisory_xact_lock(73104721920260802::bigint);

  SELECT * INTO v_delivery FROM public.marketing_deliveries
  WHERE id = p_delivery_id AND lease_token = p_lease_token
    AND status = 'leased' AND lease_expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or delivery not found' USING ERRCODE = '40001'; END IF;

  IF public.marketing_runtime_enabled() IS NOT TRUE THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying', next_attempt_at = now() + interval '15 minutes',
      error_code = 'runtime_disabled', last_error = 'Marketing runtime or feature kill-switch is disabled',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'retrying', 'reason', 'runtime_disabled');
  END IF;

  IF v_delivery.channel <> 'email' OR v_delivery.contact_id IS NULL THEN
    RAISE EXCEPTION 'Email delivery requires a marketing contact' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = v_delivery.item_id FOR SHARE;
  IF NOT FOUND OR v_item.approval_status <> 'approved'
     OR v_item.approved_at IS DISTINCT FROM v_delivery.item_approved_at
     OR v_item.status NOT IN ('scheduled','queued','leased','processing','running') THEN
    UPDATE public.marketing_deliveries SET
      status = 'cancelled', error_code = 'parent_invalidated', last_error = 'Calendar item is no longer approved',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'cancelled', 'reason', 'parent_invalidated');
  END IF;

  IF v_item.campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns WHERE id = v_item.campaign_id FOR SHARE;
    IF NOT FOUND OR v_campaign.approved_at IS NULL
       OR v_campaign.status IN ('paused','completed','cancelled','failed') THEN
      UPDATE public.marketing_deliveries SET
        status = 'cancelled', error_code = 'campaign_invalidated', last_error = 'Campaign is no longer approved',
        lease_token = NULL, lease_expires_at = NULL
      WHERE id = v_delivery.id;
      RETURN jsonb_build_object('status', 'cancelled', 'reason', 'campaign_invalidated');
    END IF;
  END IF;

  v_local_time := (now() AT TIME ZONE 'Europe/Zurich')::time;
  IF v_local_time < time '08:00' OR v_local_time >= time '20:00' THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying',
      next_attempt_at = CASE WHEN v_local_time < time '08:00'
        THEN (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '8 hours') AT TIME ZONE 'Europe/Zurich'
        ELSE (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '1 day 8 hours') AT TIME ZONE 'Europe/Zurich' END,
      error_code = 'quiet_hours', last_error = 'Deferred outside the 08:00-20:00 Europe/Zurich window',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'retrying', 'reason', 'quiet_hours');
  END IF;

  SELECT * INTO v_contact FROM public.marketing_contacts WHERE id = v_delivery.contact_id FOR UPDATE;
  SELECT
    LEAST(GREATEST(COALESCE((a.conditions ->> 'frequency_cap_hours')::integer, 72), 1), 720),
    LEAST(GREATEST(COALESCE((a.conditions ->> 'daily_cap')::integer, 500), 1), 10000)
  INTO v_frequency_cap_hours, v_daily_cap
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  IF NOT FOUND OR NOT public.marketing_contact_is_eligible(v_contact.id, 'email')
     OR NOT public.marketing_contact_matches_filter(v_contact.id, v_item.targeting) THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'contact_ineligible', last_error = 'Contact is not eligible',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'contact_ineligible');
  END IF;

  v_recipient := NULLIF(btrim(COALESCE(v_contact.email_normalized, v_contact.email, '')), '');
  IF v_recipient IS NULL THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'missing_email', last_error = 'Contact has no email address',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'missing_email');
  END IF;

  -- A registered user who turned marketing email off must not receive one,
  -- even when the marketing contact record still looks eligible.
  IF v_delivery.user_id IS NOT NULL THEN
    SELECT * INTO v_preferences FROM public.notification_preferences WHERE user_id = v_delivery.user_id;
    IF FOUND AND (
      COALESCE((v_preferences.categories ->> 'marketing')::boolean, false) IS NOT TRUE
      OR COALESCE((v_preferences.channels ->> 'email')::boolean, true) IS NOT TRUE
    ) THEN
      UPDATE public.marketing_deliveries SET
        status = 'skipped', error_code = 'notification_preference_blocked',
        last_error = 'Marketing email preference is disabled',
        lease_token = NULL, lease_expires_at = NULL
      WHERE id = v_delivery.id;
      RETURN jsonb_build_object('status', 'skipped', 'reason', 'notification_preference_blocked');
    END IF;
  END IF;

  IF v_contact.last_contact_at IS NOT NULL
     AND v_contact.last_contact_at > now() - make_interval(hours => v_frequency_cap_hours) THEN
    UPDATE public.marketing_deliveries SET
      status = 'skipped', error_code = 'frequency_cap', last_error = 'Contact frequency cap is active',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'frequency_cap');
  END IF;

  SELECT count(*) INTO v_sent_today FROM public.marketing_deliveries d
  WHERE d.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich');
  IF v_sent_today >= v_daily_cap THEN
    UPDATE public.marketing_deliveries SET
      status = 'retrying',
      next_attempt_at = (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') + interval '1 day 8 hours') AT TIME ZONE 'Europe/Zurich',
      error_code = 'daily_cap', last_error = 'Daily marketing cap reached',
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = v_delivery.id;
    RETURN jsonb_build_object('status', 'retrying', 'reason', 'daily_cap');
  END IF;

  v_subject := left(COALESCE(NULLIF(btrim(v_item.content ->> 'subject'), ''), v_item.title), 200);
  v_headline := left(COALESCE(NULLIF(btrim(v_item.content ->> 'headline'), ''), v_item.title), 200);
  v_body := left(COALESCE(NULLIF(btrim(v_item.content ->> 'body'), ''),
                          NULLIF(btrim(v_item.content ->> 'message'), ''), ''), 20000);
  v_cta := left(COALESCE(NULLIF(btrim(v_item.content ->> 'call_to_action'), ''), ''), 200);
  v_visual := NULLIF(btrim(v_item.content ->> 'visual_url'), '');
  IF v_visual IS NOT NULL AND v_visual !~ '^https://[a-zA-Z0-9.-]+/' THEN
    v_visual := NULL;
  END IF;

  -- Hold the lease across the provider call so a concurrent worker cannot
  -- claim the same delivery and send it twice.
  UPDATE public.marketing_deliveries SET status = 'processing'
  WHERE id = v_delivery.id;

  RETURN jsonb_build_object(
    'status', 'ready',
    'delivery_id', v_delivery.id,
    'item_id', v_item.id,
    'campaign_id', v_item.campaign_id,
    'contact_id', v_contact.id,
    'recipient', v_recipient,
    'subject', v_subject,
    'html', concat(
      '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">',
      '<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">',
      public.marketing_html_escape(v_headline), '</h1>',
      CASE WHEN v_visual IS NOT NULL THEN concat(
        '<img src="', public.marketing_html_escape(v_visual),
        '" alt="" style="width:100%;height:auto;border-radius:12px;margin:0 0 16px" />'
      ) ELSE '' END,
      '<div style="font-size:15px;line-height:1.6;white-space:pre-wrap">',
      public.marketing_html_escape(v_body), '</div>',
      CASE WHEN v_cta <> '' THEN concat(
        '<p style="font-size:15px;line-height:1.6;margin:20px 0 0;font-weight:600">',
        public.marketing_html_escape(v_cta), '</p>'
      ) ELSE '' END,
      '</div>'
    ),
    'text', concat_ws(E'\n\n', v_headline, v_body, NULLIF(v_cta, ''))
  );
END;
$$;

/**
 * Records a completed email send: contact touch, provider event and item
 * finalisation, mirroring what the in-app adapter does inline.
 */
CREATE OR REPLACE FUNCTION public.service_record_marketing_email_sent(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_provider_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT * INTO v_delivery FROM public.marketing_deliveries
  WHERE id = p_delivery_id AND lease_token = p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease mismatch or delivery not found' USING ERRCODE = '40001'; END IF;

  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = v_delivery.item_id FOR SHARE;

  UPDATE public.marketing_deliveries SET
    status = 'sent', sent_at = COALESCE(sent_at, now()),
    provider = 'resend',
    provider_message_id = left(NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''), 200),
    lease_token = NULL, lease_expires_at = NULL, last_error = NULL, error_code = NULL
  WHERE id = v_delivery.id;

  IF v_delivery.contact_id IS NOT NULL THEN
    UPDATE public.marketing_contacts SET last_contact_at = now(), lifecycle_status = CASE
      WHEN lifecycle_status IN ('new','qualified','follow_up') THEN 'contacted' ELSE lifecycle_status END
    WHERE id = v_delivery.contact_id;
  END IF;

  INSERT INTO public.marketing_events (campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata)
  VALUES (v_item.campaign_id, v_delivery.item_id, v_delivery.id, 'delivery_sent', 'resend', now(), '{}'::jsonb);

  PERFORM public.marketing_finalize_item_if_terminal(v_delivery.item_id);
  RETURN jsonb_build_object('id', v_delivery.id, 'status', 'sent');
END;
$$;

REVOKE ALL ON FUNCTION
  public.marketing_html_escape(text),
  public.service_prepare_marketing_email_delivery(uuid, uuid),
  public.service_record_marketing_email_sent(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.service_prepare_marketing_email_delivery(uuid, uuid),
  public.service_record_marketing_email_sent(uuid, uuid, text)
  TO service_role;
