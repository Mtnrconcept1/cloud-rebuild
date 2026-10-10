-- A paid-delivery bucket must not change when the browser changes analytics
-- metadata or User-Agent. Attribution identities and original events stay intact.
BEGIN;

CREATE OR REPLACE FUNCTION private_campaign.actualites_billing_dedupe_key(
  p_campaign_id uuid,
  p_post_id uuid,
  p_event_type text,
  p_user_id uuid,
  p_legacy_viewer_id text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $billing_key$
DECLARE
  v_event_type text := CASE WHEN p_event_type = 'cta_click' THEN 'click' ELSE p_event_type END;
  v_identity text;
  v_headers jsonb;
  v_ip text;
  v_key text;
  v_existing_key text;
BEGIN
  IF v_event_type IS NULL OR v_event_type NOT IN ('impression', 'click') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_actualites_billing_event';
  END IF;
  IF p_user_id IS NOT NULL THEN
    v_identity := 'user:' || p_user_id::text;
  ELSIF auth.role() = 'service_role' THEN
    -- Only trusted server callers can select an administrative replay identity.
    IF NULLIF(p_legacy_viewer_id, '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='missing_actualites_service_identity';
    END IF;
    v_identity := 'service:' || p_legacy_viewer_id;
  ELSE
    BEGIN
      v_headers := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    EXCEPTION WHEN invalid_text_representation THEN
      v_headers := '{}'::jsonb;
    END;
    -- Keep the existing gateway-header trust boundary; do not persist raw IPs.
    -- A shared network is one anonymous paid bucket per post/event/day. The
    -- existing viewer identity still distinguishes attribution and analytics.
    v_ip := NULLIF(trim(COALESCE(
      v_headers->>'cf-connecting-ip',
      v_headers->>'x-real-ip',
      regexp_replace(COALESCE(v_headers->>'x-forwarded-for', ''), E'^.*,\\s*', ''),
      ''
    )), '');
    IF v_ip IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='anonymous_social_identity_unavailable';
    END IF;
    v_identity := 'network:' || host(v_ip::inet);
  END IF;
  v_key := encode(extensions.digest(concat_ws('|',
    'actualites-billing-v1', p_campaign_id::text, p_post_id::text,
    v_event_type, v_identity, current_date::text
  ), 'sha256'), 'hex');

  -- Reuse a recognizable historical accepted key without rewriting its payload,
  -- counters or amounts. An old anonymous hash cannot recover its original IP;
  -- a changed pre-migration User-Agent cannot always be linked retrospectively.
  SELECT event.dedupe_key INTO v_existing_key
  FROM public.ad_campaign_events event
  WHERE event.campaign_id = p_campaign_id
    AND event.event_type = v_event_type
    AND event.created_at >= current_date::timestamptz
    AND event.created_at < (current_date + 1)::timestamptz
    AND event.payload->>'social_post_id' = p_post_id::text
    AND (
      event.dedupe_key = v_key
      OR (p_user_id IS NOT NULL AND event.user_id = p_user_id)
      OR (p_user_id IS NULL AND event.user_id IS NULL
          AND event.payload->>'viewer_id' = p_legacy_viewer_id)
    )
  ORDER BY (event.dedupe_key = v_key) DESC, event.created_at, event.id
  LIMIT 1;
  RETURN COALESCE(v_existing_key, v_key);
END;
$billing_key$;
REVOKE ALL ON FUNCTION private_campaign.actualites_billing_dedupe_key(uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_campaign.actualites_billing_dedupe_key(uuid,uuid,text,uuid,text) TO service_role;

-- The two replacements below are generated from the immutable historical
-- definitions. Exact body hashes reject drift and make reapplication a no-op.
DO $unchanged_billing_guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.record_ad_campaign_event(uuid,uuid,text,text,uuid,text,text,jsonb,text)'))
       IS DISTINCT FROM 'c3d20403bab2d99bba08b3ea2db6662a' THEN
    RAISE EXCEPTION 'actualites_billing_drift: paid writer differs; review budgets and conversions';
  END IF;
END;
$unchanged_billing_guard$;

DO $replace_billing_key$
DECLARE
  v_oid oid := to_regprocedure('public.record_social_feed_event(uuid,text,jsonb)');
  v_hash text;
  v_definition text;
  v_before text := $before$      v_dedupe_key := encode(
        digest(
          concat_ws('|', v_campaign.campaign_id::text, p_post_id::text, p_event_type, v_viewer_id, current_date::text, COALESCE(v_source, ''), COALESCE(v_page, '')),
          'sha256'
        ),
        'hex'
      );$before$;
  v_after text := $after$      v_dedupe_key := private_campaign.actualites_billing_dedupe_key(
        v_campaign.campaign_id, p_post_id, p_event_type, v_auth_user_id, v_viewer_id
      );$after$;
BEGIN
  SELECT md5(prosrc) INTO v_hash FROM pg_proc WHERE oid=v_oid;
  IF v_hash = 'ca18c12b1c9fa3a2056034d70df2dcba' THEN
    RETURN;
  END IF;
  IF v_hash IS DISTINCT FROM '74af5a4b72555d3255256de9aa230863' THEN
    RAISE EXCEPTION 'actualites_billing_drift: record_social_feed_event body differs';
  END IF;
  v_definition := pg_get_functiondef(v_oid);
  IF (length(v_definition)-length(replace(v_definition,v_before,''))) / length(v_before) <> 1 THEN
    RAISE EXCEPTION 'actualites_billing_drift: record_social_feed_event replacement mismatch';
  END IF;
  EXECUTE replace(v_definition,v_before,v_after);
END;
$replace_billing_key$;

DO $replace_billing_key$
DECLARE
  v_oid oid := to_regprocedure('public.record_social_feed_event_v2(uuid,text,jsonb)');
  v_hash text;
  v_definition text;
  v_before text := $before$    v_campaign_event_dedupe_key := encode(
      extensions.digest(
        concat_ws(
          '|',
          v_event.campaign_id::text,
          p_post_id::text,
          p_event_type,
          v_viewer_id,
          current_date::text,
          COALESCE(v_event.source, ''),
          COALESCE(v_event.page, '')
        ),
        'sha256'
      ),
      'hex'
    );$before$;
  v_after text := $after$    v_campaign_event_dedupe_key := private_campaign.actualites_billing_dedupe_key(
      v_event.campaign_id, p_post_id, p_event_type, v_auth_user_id, v_viewer_id
    );$after$;
BEGIN
  SELECT md5(prosrc) INTO v_hash FROM pg_proc WHERE oid=v_oid;
  IF v_hash = '8992e200e1c265de728676d60612989e' THEN
    RETURN;
  END IF;
  IF v_hash IS DISTINCT FROM 'd227b9f22f7658fa2f88360961c20b65' THEN
    RAISE EXCEPTION 'actualites_billing_drift: record_social_feed_event_v2 body differs';
  END IF;
  v_definition := pg_get_functiondef(v_oid);
  IF (length(v_definition)-length(replace(v_definition,v_before,''))) / length(v_before) <> 1 THEN
    RAISE EXCEPTION 'actualites_billing_drift: record_social_feed_event_v2 replacement mismatch';
  END IF;
  EXECUTE replace(v_definition,v_before,v_after);
END;
$replace_billing_key$;

NOTIFY pgrst, 'reload schema';
COMMIT;
