-- Enforce paid restaurant lifecycle without hiding unclaimed legacy directory entries.
-- Historical restaurants with no subscription record keep their current visibility
-- and pre-activation credits. An existing cancelled/expired/test subscription
-- never grants public visibility or paid tools.
BEGIN;

CREATE OR REPLACE FUNCTION public.restaurant_subscription_has_paid_access(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $func$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.restaurant_ai_subscriptions AS historical
      WHERE historical.restaurant_id = p_restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.restaurant_ai_subscriptions AS paid
      WHERE paid.restaurant_id = p_restaurant_id
        AND paid.status IN ('active', 'trialing')
        AND paid.current_period_end > now()
        AND paid.stripe_mode = 'live'
        AND paid.stripe_subscription_id IS NOT NULL
    );
$func$;

REVOKE ALL ON FUNCTION public.restaurant_subscription_has_paid_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_subscription_has_paid_access(uuid)
  TO anon, authenticated, service_role;

-- Catalog RPCs filter with this function before LIMIT/OFFSET, including
-- service-role-backed searches which bypass ordinary RLS.
CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_active IS TRUE
      AND restaurant.is_demo IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'active'
      AND public.restaurant_address_city_is_consistent(restaurant.address, restaurant.city)
      AND (
        restaurant.is_directory_listing IS FALSE
        OR restaurant.directory_public_name_verified IS TRUE
      )
      AND public.restaurant_subscription_has_paid_access(restaurant.id)
  );
$func$;

-- Keep current source, photo and location checks and all existing role scopes.
-- A manual re-creation of these long policies would silently drop recent
-- anti-fraud filters; append a narrow condition instead. Owner/admin policies
-- intentionally remain unchanged so renewal and historical invoices work.
DO $migration$
DECLARE
  v_policy record;
  v_policy_count integer := 0;
BEGIN
  FOR v_policy IN
    SELECT policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'restaurants'
      AND policyname IN (
        'restaurants_public_select',
        'production_hide_demo_restaurants',
        'scope_production_restaurants_for_commercial_demo_accounts'
      )
  LOOP
    v_policy_count := v_policy_count + 1;
    IF v_policy.qual IS NULL THEN
      RAISE EXCEPTION 'Unexpected unrestricted restaurant policy: %', v_policy.policyname;
    END IF;
    IF position('restaurant_subscription_has_paid_access' in v_policy.qual) = 0 THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.restaurants USING ((%s) AND public.restaurant_subscription_has_paid_access(id))',
        v_policy.policyname, v_policy.qual
      );
    END IF;
  END LOOP;
  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Missing public restaurant read policies; refusing incomplete billing gate';
  END IF;
END;
$migration$;

-- The manually granted internal OpenAI exception cannot bypass the paid
-- lifecycle of a restaurant which already had a recurring subscription.
-- The grant row is retained for automatic restoration on later payment.
CREATE OR REPLACE FUNCTION private_finance.has_internal_unlimited_openai_grant(
  p_restaurant_id uuid, p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT public.restaurant_subscription_has_paid_access(p_restaurant_id)
    AND EXISTS (
      SELECT 1
      FROM private_finance.internal_unlimited_openai_grants AS grant_row
      JOIN public.restaurants AS r
        ON r.id = grant_row.restaurant_id AND r.owner_id = grant_row.user_id
      WHERE grant_row.restaurant_id = p_restaurant_id
        AND grant_row.enabled
        AND (
          (auth.role() = 'service_role'
            AND (p_user_id IS NULL OR p_user_id = grant_row.user_id))
          OR
          (auth.uid() IS NOT NULL AND grant_row.user_id = auth.uid()
            AND (p_user_id IS NULL OR p_user_id = auth.uid()))
        )
    );
$func$;
REVOKE ALL ON FUNCTION private_finance.has_internal_unlimited_openai_grant(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- One reminder per paid period and per D-5/D-1 window, even if the cron
-- worker retries. Notification insertion and deduplication are transactional.
CREATE TABLE IF NOT EXISTS public.restaurant_subscription_renewal_notices (
  subscription_id uuid NOT NULL
    REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE CASCADE,
  period_end timestamptz NOT NULL,
  days_before integer NOT NULL CHECK (days_before IN (1, 5)),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, period_end, days_before)
);
ALTER TABLE public.restaurant_subscription_renewal_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_subscription_renewal_notices
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_due_restaurant_subscription_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $func$
DECLARE
  v_subscription record;
  v_days integer;
  v_inserted uuid;
  v_notification uuid;
  v_count integer := 0;
  v_end_label text;
  v_action_text text;
BEGIN
  FOR v_subscription IN
    SELECT
      s.id, s.restaurant_id, s.status, s.cancel_at_period_end,
      s.current_period_end, r.owner_id, r.name,
      (
        (s.current_period_end AT TIME ZONE 'Europe/Zurich')::date
        - (now() AT TIME ZONE 'Europe/Zurich')::date
      )::integer AS days_remaining
    FROM public.restaurant_ai_subscriptions AS s
    JOIN public.restaurants AS r ON r.id = s.restaurant_id
    WHERE s.stripe_mode = 'live'
      AND s.stripe_subscription_id IS NOT NULL
      AND s.status IN ('active', 'trialing', 'cancelled')
      AND s.current_period_end > now()
      AND r.owner_id IS NOT NULL
      AND r.is_demo IS FALSE
      AND r.is_directory_listing IS FALSE
      AND (
        (s.current_period_end AT TIME ZONE 'Europe/Zurich')::date
        - (now() AT TIME ZONE 'Europe/Zurich')::date
      ) IN (1, 5)
  LOOP
    v_days := v_subscription.days_remaining;
    v_inserted := NULL;
    INSERT INTO public.restaurant_subscription_renewal_notices
      (subscription_id, period_end, days_before)
    VALUES (v_subscription.id, v_subscription.current_period_end, v_days)
    ON CONFLICT DO NOTHING
    RETURNING subscription_id INTO v_inserted;
    IF v_inserted IS NULL THEN
      CONTINUE;
    END IF;

    v_end_label := to_char(
      v_subscription.current_period_end AT TIME ZONE 'Europe/Zurich',
      'DD.MM.YYYY'
    );
    v_action_text := CASE
      WHEN v_subscription.status = 'cancelled'
        OR v_subscription.cancel_at_period_end IS TRUE
      THEN 'Réactivez votre abonnement depuis Facturation pour conserver la visibilité de votre restaurant.'
      ELSE 'Votre prélèvement mensuel est automatique. Vérifiez votre moyen de paiement dans Facturation.'
    END;
    SELECT public.enqueue_notification(
      v_subscription.owner_id,
      format('TOK : échéance de votre abonnement dans %s jour%s', v_days,
        CASE WHEN v_days = 1 THEN '' ELSE 's' END),
      format(
        'L’abonnement de %s arrive à échéance le %s. %s Sans abonnement payé, votre restaurant ne sera plus visible et les outils premium seront suspendus.',
        v_subscription.name, v_end_label, v_action_text
      ),
      'restaurant_subscription_renewal',
      'transactional',
      json_build_object(
        'restaurant_id', v_subscription.restaurant_id,
        'subscription_id', v_subscription.id,
        'days_before_due', v_days,
        'period_end', v_subscription.current_period_end,
        'action_url', '/dashboard/mon-compte-facturation',
        'requested_channels', json_build_object(
          'in_app', true, 'email', true, 'push', false
        )
      )
    ) INTO v_notification;

    UPDATE public.restaurant_subscription_renewal_notices
      SET notification_id = v_notification
      WHERE subscription_id = v_subscription.id
        AND period_end = v_subscription.current_period_end
        AND days_before = v_days;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$func$;

REVOKE ALL ON FUNCTION public.enqueue_due_restaurant_subscription_reminders()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_restaurant_subscription_reminders()
  TO service_role;

-- pg_cron executes as the database owner; no embedded webhook/Stripe/API key.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $schedule$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'tok-restaurant-subscription-reminders'
  ) THEN
    PERFORM cron.schedule(
      'tok-restaurant-subscription-reminders',
      '13 * * * *',
      'SELECT public.enqueue_due_restaurant_subscription_reminders()'
    );
  END IF;
END;
$schedule$;

COMMIT;
