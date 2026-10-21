-- Local-only fixture, executed by test-marketing-analytics.mjs in a disposable DB.
-- Synthetic identities and provider references never leave this database.
BEGIN;
CREATE TEMP TABLE analytics_test_context (id boolean);

CREATE FUNCTION pg_temp.analytics_metric(p_snapshot jsonb, p_key text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT metric FROM jsonb_array_elements(p_snapshot #> '{analytics,metrics}') metric
  WHERE metric ->> 'key' = p_key;
$$;
CREATE FUNCTION pg_temp.analytics_value(p_snapshot jsonb, p_key text)
RETURNS numeric LANGUAGE sql AS $$
  SELECT (pg_temp.analytics_metric(p_snapshot, p_key) ->> 'value')::numeric;
$$;
CREATE FUNCTION pg_temp.analytics_snapshot(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.service_execute_marketing_autopilot_operation(
    repeat('a', 64), repeat('b', 64), 'admin_get_marketing_autopilot_dashboard',
    jsonb_build_object('p_from', p_from, 'p_to', p_to)
  );
$$;

INSERT INTO auth.users(id, email)
VALUES ('11111111-1111-4111-8111-111111111111', 'analytics-fixture@example.invalid');
INSERT INTO public.user_roles(user_id, role)
VALUES ('11111111-1111-4111-8111-111111111111', 'admin');
INSERT INTO public.feature_flags(name, label, is_active)
VALUES ('admin-marketing-operations', 'Analytics fixture', true);
INSERT INTO public.marketing_admin_web_sessions(sid_hash, csrf_hash, user_id, mfa_verified_at, expires_at)
VALUES (repeat('a',64), repeat('b',64), '11111111-1111-4111-8111-111111111111', now(), now() + interval '1 hour');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
  m jsonb;
BEGIN
  ASSERT jsonb_array_length(s #> '{analytics,metrics}') = 16;
  ASSERT (s #>> '{analytics,completeness}')::numeric = 0.25;
  ASSERT s #> '{analytics,daily_results}' = '[]'::jsonb;
  ASSERT (s #>> '{analytics,from}')::timestamptz = '2026-10-01 00:00Z'::timestamptz;
  ASSERT (s #>> '{analytics,to}')::timestamptz = '2026-10-03 00:00Z'::timestamptz;
  ASSERT s #>> '{analytics,timezone}' = 'Europe/Zurich';
  FOR m IN SELECT value FROM jsonb_array_elements(s #> '{analytics,metrics}') LOOP
    ASSERT m ?& ARRAY['key','label','group','value','unit','source','observed_at','freshness','unavailable_reason'];
    IF m ->> 'group' = 'activity' THEN
      ASSERT (m ->> 'value')::numeric = 0;
      ASSERT (m ->> 'observed_at')::timestamptz = now();
      ASSERT m ->> 'freshness' = 'fresh';
    ELSE
      ASSERT m ->> 'value' IS NULL;
      ASSERT m ->> 'observed_at' IS NULL;
      ASSERT m ->> 'freshness' = 'unknown';
    END IF;
  END LOOP;
END;
$$;
SELECT 'PASS analytics: empty sources preserve unknown outcomes and confirm four native zero counts';

INSERT INTO public.marketing_campaigns(id, name, created_at) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Included fixture campaign', '2026-10-01 00:00Z'),
  ('20000000-0000-4000-8000-000000000002', 'Excluded boundary campaign', '2026-10-03 00:00Z');
INSERT INTO public.marketing_calendar_items(id, campaign_id, title, channel, status, approval_status, scheduled_at, created_at) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Prepared', 'instagram', 'draft', 'pending', '2026-10-02 00:00Z', '2026-10-01 00:00Z'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Approved schedule', 'instagram', 'scheduled', 'approved', '2026-10-01 12:00Z', '2026-10-01 01:00Z'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Unapproved', 'email', 'scheduled', 'pending', '2026-10-01 12:00Z', '2026-10-01 02:00Z'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Cancelled', 'instagram', 'cancelled', 'approved', '2026-10-01 13:00Z', '2026-10-01 03:00Z'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'Boundary', 'instagram', 'scheduled', 'approved', '2026-10-03 00:00Z', '2026-10-03 00:00Z');
DO $$
DECLARE s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
BEGIN
  ASSERT pg_temp.analytics_value(s, 'campaigns_created') = 1;
  ASSERT pg_temp.analytics_value(s, 'items_created') = 4;
  ASSERT pg_temp.analytics_value(s, 'items_scheduled') = 1;
  ASSERT (pg_temp.analytics_metric(s, 'campaigns_created') ->> 'observed_at')::timestamptz = '2026-10-01 00:00Z'::timestamptz;
  ASSERT (pg_temp.analytics_metric(s, 'items_scheduled') ->> 'observed_at')::timestamptz = now();
  ASSERT pg_temp.analytics_metric(s, 'items_scheduled') ->> 'label' = 'En attente de diffusion';
END;
$$;
SELECT 'PASS analytics: native activity has inclusive start, exclusive end and approved current stock';

INSERT INTO public.marketing_calendar_items(title, channel, status, scheduled_at, published_at, provider_external_id, created_at) VALUES
  ('Instagram proof', 'instagram', 'published', '2026-10-01 02:00Z', '2026-10-01 02:00Z', 'meta-proof-1', '2026-09-30 00:00Z'),
  ('Instagram replay', 'instagram', 'published', '2026-10-01 03:00Z', '2026-10-01 03:00Z', ' meta-proof-1 ', '2026-09-30 00:00Z'),
  ('Facebook proof', 'facebook', 'published', '2026-10-01 04:00Z', '2026-10-01 04:00Z', 'meta-proof-1', '2026-09-30 00:00Z'),
  ('Unfinished provider container', 'instagram', 'failed', '2026-10-01 05:00Z', NULL, 'not-published', '2026-09-30 00:00Z'),
  ('Missing provider proof', 'instagram', 'published', '2026-10-01 05:00Z', '2026-10-01 05:00Z', ' ', '2026-09-30 00:00Z'),
  ('Excluded publication boundary', 'instagram', 'published', '2026-10-03 00:00Z', '2026-10-03 00:00Z', 'end-boundary', '2026-09-30 00:00Z'),
  ('Earlier publication', 'instagram', 'published', '2026-09-30 23:00Z', '2026-09-30 23:00Z', 'earlier-proof', '2026-09-30 00:00Z'),
  ('Replay of earlier publication', 'instagram', 'published', '2026-10-01 06:00Z', '2026-10-01 06:00Z', 'earlier-proof', '2026-09-30 00:00Z'),
  ('Local news is separate', 'tok_news', 'published', '2026-10-01 05:00Z', '2026-10-01 05:00Z', 'local-news', '2026-09-30 00:00Z');
DO $$
DECLARE s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
BEGIN
  ASSERT pg_temp.analytics_value(s, 'social_publications') = 2;
  ASSERT pg_temp.analytics_value(s, 'sent') IS NULL;
  ASSERT pg_temp.analytics_value(s, 'revenue') IS NULL;
  ASSERT (pg_temp.analytics_metric(s, 'social_publications') ->> 'observed_at')::timestamptz = '2026-10-01 04:00Z'::timestamptz;
END;
$$;
SELECT 'PASS analytics: Meta proof, channel identity and first publication prevent invented or duplicate outcomes';

INSERT INTO public.marketing_deliveries(id, item_id, user_id, channel, target_hash, provider, provider_message_id) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'email', 'synthetic-hash-1', 'resend', 'fixture-message-1'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'email', 'synthetic-hash-2', 'resend', 'fixture-message-2');
INSERT INTO public.marketing_events(delivery_id, event_type, occurred_at) VALUES
  ('40000000-0000-4000-8000-000000000001', 'sent', '2026-10-01 00:00Z'),
  ('40000000-0000-4000-8000-000000000001', 'delivery_sent', '2026-10-01 00:00:10Z'),
  ('40000000-0000-4000-8000-000000000001', 'delivered', '2026-10-01 22:30Z'),
  ('40000000-0000-4000-8000-000000000001', 'delivery_delivered', '2026-10-01 22:30:10Z'),
  ('40000000-0000-4000-8000-000000000001', 'clicked', '2026-10-02 01:00Z'),
  ('40000000-0000-4000-8000-000000000001', 'delivery_clicked', '2026-10-02 02:00Z'),
  ('40000000-0000-4000-8000-000000000001', 'converted', '2026-10-03 00:00Z'),
  ('40000000-0000-4000-8000-000000000002', 'delivery_sent', '2026-09-30 23:00Z'),
  ('40000000-0000-4000-8000-000000000002', 'sent', '2026-10-01 01:00Z'),
  (NULL, 'sent', '2026-10-01 02:00Z');
DO $$
DECLARE
  n bigint := (SELECT count(*) FROM public.marketing_events);
  s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
  later jsonb;
BEGIN
  ASSERT pg_temp.analytics_value(s, 'sent') = 2;
  ASSERT pg_temp.analytics_value(s, 'delivered') = 1;
  ASSERT pg_temp.analytics_value(s, 'clicks') = 1;
  ASSERT pg_temp.analytics_value(s, 'delivery_conversions') IS NULL;
  ASSERT (pg_temp.analytics_metric(s, 'sent') ->> 'observed_at')::timestamptz = '2026-10-01 02:00Z'::timestamptz;
  ASSERT (pg_temp.analytics_metric(s, 'clicks') ->> 'observed_at')::timestamptz = '2026-10-02 01:00Z'::timestamptz;
  ASSERT jsonb_array_length(s #> '{analytics,daily_results}') = 2;
  ASSERT s #>> '{analytics,daily_results,1,date}' = '2026-10-02';
  ASSERT (s #>> '{analytics,daily_results,1,delivered}')::int = 1;
  ASSERT (s #>> '{analytics,daily_results,1,clicks}')::int = 1;
  ASSERT (SELECT sum((d ->> 'sent')::int) FROM jsonb_array_elements(s #> '{analytics,daily_results}') d) = 2;
  later := pg_temp.analytics_snapshot('2026-10-02 00:00Z', '2026-10-03 00:00Z');
  ASSERT pg_temp.analytics_value(later, 'sent') IS NULL;
  ASSERT jsonb_array_length(later #> '{analytics,daily_results}') = 1;
  ASSERT (SELECT count(*) FROM public.marketing_events) = n;
  BEGIN
    UPDATE public.marketing_events SET event_type = 'changed';
    RAISE EXCEPTION 'Append-only guard must reject updates';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;
SELECT 'PASS analytics: global event deduplication, orphan identity, Swiss dates and append-only history';

INSERT INTO public.marketing_deliveries(id, item_id, user_id, channel, target_hash, provider, provider_message_id)
VALUES ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111', 'email', 'synthetic-hash-3', 'resend', 'fixture-message-3');
UPDATE public.marketing_deliveries SET status = 'sent' WHERE id = '40000000-0000-4000-8000-000000000003';
INSERT INTO public.marketing_events(delivery_id, event_type, occurred_at)
VALUES ('40000000-0000-4000-8000-000000000003', 'delivery_sent', now());
SELECT public.record_marketing_provider_event('resend', 'fixture-provider-event-1', 'fixture-message-3', 'delivered', now() - interval '5 minutes');
SELECT public.record_marketing_provider_event('resend', 'fixture-provider-event-1', 'fixture-message-3', 'delivered', now() - interval '5 minutes');
DO $$
DECLARE s jsonb := pg_temp.analytics_snapshot(now() - interval '1 hour', now() + interval '1 hour');
BEGIN
  ASSERT (SELECT count(*) FROM public.marketing_event_facts
    WHERE delivery_id = '40000000-0000-4000-8000-000000000003' AND event_type = 'delivery_sent') = 2;
  ASSERT (SELECT count(*) FROM public.marketing_event_facts
    WHERE delivery_id = '40000000-0000-4000-8000-000000000003' AND event_type = 'delivery_delivered') = 2;
  ASSERT pg_temp.analytics_value(s, 'sent') = 1;
  ASSERT pg_temp.analytics_value(s, 'delivered') = 1;
  ASSERT (pg_temp.analytics_metric(s, 'delivered') ->> 'observed_at')::timestamptz = now() - interval '5 minutes';
  ASSERT pg_temp.analytics_metric(s, 'delivered') ->> 'freshness' = 'fresh';
END;
$$;
SELECT 'PASS analytics: real trigger plus explicit completion and replayed provider callback count once';

INSERT INTO public.marketing_attribution_facts(source_system, source_fact_id, fact_type, value_minor, currency, observed_at)
VALUES ('fixture', 'unlinked-revenue', 'revenue', 99999, 'CHF', '2026-10-01 09:00Z');
DO $$
BEGIN
  ASSERT pg_temp.analytics_value(pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z'), 'revenue') IS NULL;
END;
$$;
INSERT INTO public.marketing_attribution_facts(source_system, source_fact_id, fact_type, campaign_id, value_minor, currency, observed_at) VALUES
  ('fixture', 'zero-spend', 'spend', '20000000-0000-4000-8000-000000000001', 0, 'CHF', '2026-10-01 10:00Z'),
  ('fixture', 'confirmed-revenue', 'revenue', '20000000-0000-4000-8000-000000000001', 12345, 'CHF', '2026-10-01 11:00Z'),
  ('fixture', 'lead-1', 'lead', '20000000-0000-4000-8000-000000000001', NULL, NULL, '2026-10-01 12:00Z'),
  ('fixture', 'lead-2', 'lead', '20000000-0000-4000-8000-000000000001', NULL, NULL, '2026-10-01 12:30Z'),
  ('fixture', 'conversion-1', 'conversion', '20000000-0000-4000-8000-000000000001', NULL, NULL, '2026-10-01 13:00Z'),
  ('fixture', 'excluded-revenue', 'revenue', '20000000-0000-4000-8000-000000000001', 99999, 'CHF', '2026-10-03 00:00Z');
DO $$
DECLARE s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
BEGIN
  ASSERT pg_temp.analytics_value(s, 'spend') = 0;
  ASSERT pg_temp.analytics_value(s, 'revenue') = 123.45;
  ASSERT pg_temp.analytics_value(s, 'leads') = 2;
  ASSERT pg_temp.analytics_value(s, 'business_conversions') = 1;
  ASSERT pg_temp.analytics_value(s, 'cpl') = 0;
  ASSERT pg_temp.analytics_value(s, 'cpa') = 0;
  ASSERT pg_temp.analytics_value(s, 'roas') IS NULL;
  ASSERT pg_temp.analytics_value(s, 'cac') IS NULL;
  ASSERT pg_temp.analytics_metric(s, 'spend') ->> 'unit' = 'CHF';
  ASSERT (pg_temp.analytics_metric(s, 'revenue') ->> 'observed_at')::timestamptz = '2026-10-01 11:00Z'::timestamptz;
  ASSERT (pg_temp.analytics_metric(s, 'cpl') ->> 'observed_at')::timestamptz = '2026-10-01 10:00Z'::timestamptz;
  ASSERT (s #>> '{analytics,completeness}')::numeric = 0.8125;
END;
$$;
SELECT 'PASS analytics: campaign attribution, explicit zero money, minor units, source dates and unavailable CAC';

INSERT INTO public.marketing_attribution_facts(source_system, source_fact_id, fact_type, campaign_id, value_minor, currency, observed_at)
VALUES ('fixture', 'other-currency', 'spend', '20000000-0000-4000-8000-000000000001', 100, 'EUR', '2026-10-01 14:00Z');
DO $$
DECLARE s jsonb := pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
BEGIN
  ASSERT pg_temp.analytics_value(s, 'spend') IS NULL;
  ASSERT pg_temp.analytics_value(s, 'revenue') IS NULL;
  ASSERT pg_temp.analytics_value(s, 'cpl') IS NULL;
  ASSERT pg_temp.analytics_value(s, 'cpa') IS NULL;
  ASSERT pg_temp.analytics_metric(s, 'spend') ->> 'unit' IS NULL;
  ASSERT pg_temp.analytics_metric(s, 'revenue') ->> 'unavailable_reason' = 'mixed_currencies';
  ASSERT pg_temp.analytics_value(s, 'leads') = 2;
END;
$$;
SELECT 'PASS analytics: incompatible currencies are never added or implicitly converted';

DO $$
DECLARE bounds timestamptz[];
BEGIN
  FOREACH bounds SLICE 1 IN ARRAY ARRAY[
    ARRAY['2026-10-01 00:00Z'::timestamptz, '2026-10-01 00:00Z'::timestamptz],
    ARRAY['2026-10-03 00:00Z'::timestamptz, '2026-10-01 00:00Z'::timestamptz],
    ARRAY['2025-01-01 00:00Z'::timestamptz, '2026-10-01 00:00Z'::timestamptz],
    ARRAY['-infinity'::timestamptz, '2026-10-01 00:00Z'::timestamptz],
    ARRAY['2026-10-01 00:00Z'::timestamptz, 'infinity'::timestamptz]
  ] LOOP
    BEGIN
      PERFORM pg_temp.analytics_snapshot(bounds[1], bounds[2]);
      RAISE EXCEPTION 'Invalid interval must fail';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.admin_get_marketing_autopilot_dashboard(NULL, '2026-10-01 00:00Z');
    RAISE EXCEPTION 'Null interval must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.service_execute_marketing_autopilot_operation(repeat('a',64), repeat('c',64), 'admin_get_marketing_autopilot_dashboard', '{}');
    RAISE EXCEPTION 'Wrong CSRF must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.service_execute_marketing_autopilot_operation(repeat('a',64), repeat('b',64), 'admin_get_marketing_autopilot_dashboard', '{"arbitrary_rpc":true}');
    RAISE EXCEPTION 'Unapproved arguments must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$$;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT jsonb_array_length(pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z') #> '{analytics,metrics}') = 16;
END;
$$;
RESET ROLE;
DELETE FROM public.user_roles WHERE user_id = '11111111-1111-4111-8111-111111111111';
DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.analytics_snapshot('2026-10-01 00:00Z', '2026-10-03 00:00Z');
    RAISE EXCEPTION 'Removed administrator role must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT 'PASS analytics: finite bounded periods, BFF session, CSRF, argument allowlist and administrator role';
ROLLBACK;
