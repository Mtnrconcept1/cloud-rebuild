-- Critical RPC smoke test for local Supabase databases.
-- Run after migrations are applied:
--   supabase db reset --local
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/critical_rpc_smoke.sql

BEGIN;

DO $smoke$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_customer_id uuid := gen_random_uuid();
  v_restaurant_id uuid := gen_random_uuid();
  v_post_id uuid := gen_random_uuid();
  v_campaign_id uuid := gen_random_uuid();
  v_direct_dedupe_key text := 'critical-rpc-smoke-direct-' || gen_random_uuid()::text;
  v_click_event_id uuid;
  v_owner_event_id uuid;
  v_result boolean;
  v_count integer;
  v_internal_actor boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES
    (
      '00000000-0000-0000-0000-000000000000',
      v_owner_id,
      'authenticated',
      'authenticated',
      'rpc-smoke-owner@example.test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_customer_id,
      'authenticated',
      'authenticated',
      'rpc-smoke-customer@example.test',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );

  INSERT INTO public.profiles (user_id, full_name, city)
  VALUES
    (v_owner_id, 'Owner Smoke', 'Geneve'),
    (v_customer_id, 'Customer Smoke', 'Geneve')
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    city = EXCLUDED.city,
    updated_at = now();

  INSERT INTO public.restaurants (
    id,
    owner_id,
    name,
    description,
    cuisine_type,
    address,
    city,
    is_active,
    delivery_available,
    min_order_amount
  )
  VALUES (
    v_restaurant_id,
    v_owner_id,
    'Smoke Test Restaurant',
    'Restaurant fixture for Supabase RPC smoke tests',
    'test',
    '1 Rue Test',
    'Geneve',
    true,
    true,
    0
  );

  INSERT INTO public.social_posts (
    id,
    restaurant_id,
    author_id,
    body,
    status,
    post_type,
    cta_type,
    visibility,
    published_at,
    created_at
  )
  VALUES (
    v_post_id,
    v_restaurant_id,
    v_owner_id,
    'Post sponsorise de smoke test',
    'published',
    'promo',
    'order',
    'public',
    now() - interval '5 minutes',
    now() - interval '5 minutes'
  );

  INSERT INTO public.ad_campaigns (
    id,
    restaurant_id,
    type,
    title,
    body,
    status,
    payment_status,
    target_pages,
    budget_daily,
    total_budget,
    spent,
    daily_spent,
    daily_spent_date,
    starts_at,
    ends_at
  )
  VALUES (
    v_campaign_id,
    v_restaurant_id,
    'actualites',
    'Smoke paid campaign',
    'Campaign fixture for Supabase RPC smoke tests',
    'active',
    'paid',
    '["actualites"]'::jsonb,
    50,
    200,
    0,
    0,
    current_date,
    now() - interval '1 hour',
    now() + interval '1 day'
  );

  INSERT INTO public.social_post_promotions (
    post_id,
    campaign_id,
    restaurant_id,
    status,
    starts_at,
    ends_at,
    budget_amount,
    placement,
    boost_weight,
    created_by
  )
  VALUES (
    v_post_id,
    v_campaign_id,
    v_restaurant_id,
    'active',
    now() - interval '1 hour',
    now() + interval '1 day',
    25,
    'actualites_feed',
    2,
    v_owner_id
  );

  SELECT count(*)
  INTO v_count
  FROM public.get_social_feed_v2(10, NULL, 'for_you')
  WHERE post_id = v_post_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_social_feed_v2 must return the sponsored fixture post, got %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_customer_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_customer_id::text, 'role', 'authenticated')::text,
    true
  );

  v_click_event_id := public.record_social_feed_event(
    v_post_id,
    'cta_click',
    jsonb_build_object('source', 'smoke', 'page', 'actualites', 'viewerId', v_customer_id::text)
  );

  IF v_click_event_id IS NULL THEN
    RAISE EXCEPTION 'customer social click event must be created';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.ad_campaign_events
  WHERE campaign_id = v_campaign_id
    AND restaurant_id = v_restaurant_id
    AND event_type = 'click'
    AND user_id = v_customer_id
    AND page = 'actualites';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'customer click must create one campaign click event, got %', v_count;
  END IF;

  v_result := public.record_ad_campaign_event(
    v_campaign_id,
    v_restaurant_id,
    'impression',
    v_direct_dedupe_key,
    v_customer_id,
    'smoke',
    'actualites',
    jsonb_build_object('source', 'critical_rpc_smoke'),
    NULL
  );

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'direct campaign impression must be recorded';
  END IF;

  v_result := public.record_ad_campaign_event(
    v_campaign_id,
    v_restaurant_id,
    'impression',
    v_direct_dedupe_key,
    v_customer_id,
    'smoke',
    'actualites',
    jsonb_build_object('source', 'critical_rpc_smoke'),
    NULL
  );

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'duplicate campaign impression must be ignored';
  END IF;

  v_result := public.record_actualites_sponsored_conversion(
    v_customer_id,
    v_restaurant_id,
    'order',
    gen_random_uuid(),
    'card'
  );

  IF v_result IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'customer conversion must be recorded';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.ad_campaign_events
  WHERE campaign_id = v_campaign_id
    AND restaurant_id = v_restaurant_id
    AND event_type = 'conversion'
    AND conversion_type = 'order'
    AND user_id = v_customer_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'customer conversion must create one campaign conversion event, got %', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );

  v_owner_event_id := public.record_social_feed_event(
    v_post_id,
    'click',
    jsonb_build_object('source', 'smoke-owner', 'page', 'actualites', 'viewerId', v_owner_id::text)
  );

  SELECT COALESCE(is_internal_actor, false)
  INTO v_internal_actor
  FROM public.social_feed_events
  WHERE id = v_owner_event_id;

  IF v_internal_actor IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'owner click must be marked internal';
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.ad_campaign_events
  WHERE campaign_id = v_campaign_id
    AND user_id = v_owner_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'owner click must not create campaign metrics, got %', v_count;
  END IF;

  v_result := public.record_ad_campaign_event(
    v_campaign_id,
    v_restaurant_id,
    'click',
    'critical-rpc-smoke-owner-' || gen_random_uuid()::text,
    v_owner_id,
    'smoke-owner',
    'actualites',
    '{}'::jsonb,
    NULL
  );

  IF v_result IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'owner direct campaign event must be ignored';
  END IF;
END;
$smoke$;

ROLLBACK;
