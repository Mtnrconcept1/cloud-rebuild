-- Dedicated TOK demo project only. This migration must never run against the
-- production project. It provides service-role-only idempotency and ownership
-- operations for the production admin bridge.

CREATE TABLE IF NOT EXISTS public.demo_admin_operation_keys (
  request_id uuid PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('create_user', 'create_restaurant', 'link')),
  actor_external_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_admin_operation_keys_status_created_idx
  ON public.demo_admin_operation_keys (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.demo_admin_managed_restaurants (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  created_by_external uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_admin_system_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  unassigned_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_admin_ownership_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_external_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  previous_owner_id uuid,
  new_owner_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_admin_ownership_audit_restaurant_created_idx
  ON public.demo_admin_ownership_audit (restaurant_id, created_at DESC);

ALTER TABLE public.demo_admin_operation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_admin_managed_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_admin_system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_admin_ownership_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_admin_operation_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_admin_managed_restaurants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_admin_system_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.demo_admin_ownership_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.demo_admin_operation_keys TO service_role;
GRANT ALL ON TABLE public.demo_admin_managed_restaurants TO service_role;
GRANT ALL ON TABLE public.demo_admin_system_state TO service_role;
GRANT ALL ON TABLE public.demo_admin_ownership_audit TO service_role;

CREATE OR REPLACE FUNCTION public.demo_admin_link_restaurant_owner(
  p_actor_external_id uuid,
  p_user_id uuid,
  p_restaurant_id uuid,
  p_expected_owner_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_account_type text;
  v_environment text;
  v_managed_by text;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_external_id IS NULL
     OR p_user_id IS NULL
     OR p_restaurant_id IS NULL
     OR p_expected_owner_id IS NULL THEN
    RAISE EXCEPTION 'Actor, user, restaurant and expected owner are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_restaurant.is_demo, false) IS FALSE THEN
    RAISE EXCEPTION 'Demo restaurant not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.demo_admin_managed_restaurants AS managed
    WHERE managed.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'This shared demo restaurant cannot be reassigned.'
      USING ERRCODE = '42501';
  END IF;

  IF v_restaurant.status IS DISTINCT FROM 'demo'
     OR v_restaurant.stripe_account_id IS NOT NULL
     OR v_restaurant.stripe_connect_details_submitted IS TRUE
     OR v_restaurant.stripe_connect_charges_enabled IS TRUE
     OR v_restaurant.stripe_connect_payouts_enabled IS TRUE THEN
    RAISE EXCEPTION 'Unsafe demo restaurant configuration.' USING ERRCODE = '42501';
  END IF;

  SELECT
    lower(COALESCE(raw_app_meta_data->>'account_type', '')),
    lower(COALESCE(raw_app_meta_data->>'environment', '')),
    lower(COALESCE(raw_app_meta_data->>'managed_by', ''))
  INTO v_account_type, v_environment, v_managed_by
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND
     OR v_account_type <> 'restaurant_demo'
     OR v_environment <> 'demo'
     OR v_managed_by <> 'production_admin' THEN
    RAISE EXCEPTION 'Demo restaurateur user not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_restaurant.owner_id = p_user_id THEN
    RETURN jsonb_build_object(
      'restaurant_id', v_restaurant.id,
      'owner_id', p_user_id,
      'changed', false
    );
  END IF;

  IF v_restaurant.owner_id IS DISTINCT FROM p_expected_owner_id THEN
    RAISE EXCEPTION 'The demo restaurant owner changed. Refresh and retry.'
      USING ERRCODE = '40001';
  END IF;

  IF char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A link reason between 3 and 500 characters is required.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'restaurateur'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.restaurants
  SET owner_id = p_user_id,
      updated_at = now()
  WHERE id = p_restaurant_id;

  INSERT INTO public.demo_admin_ownership_audit (
    actor_external_id,
    restaurant_id,
    previous_owner_id,
    new_owner_id,
    reason
  )
  VALUES (
    p_actor_external_id,
    p_restaurant_id,
    v_restaurant.owner_id,
    p_user_id,
    v_reason
  );

  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'previous_owner_id', v_restaurant.owner_id,
    'owner_id', p_user_id,
    'changed', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.demo_admin_link_restaurant_owner(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_admin_link_restaurant_owner(uuid, uuid, uuid, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
