-- Birthday profile data, Miamz birthday notifications, and targeted advisor hardening.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE INDEX IF NOT EXISTS idx_profiles_birthday_lookup
  ON public.profiles ((EXTRACT(MONTH FROM date_of_birth)), (EXTRACT(DAY FROM date_of_birth)))
  WHERE date_of_birth IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_birthday_lookup
  ON public.user_profiles ((EXTRACT(MONTH FROM date_of_birth)), (EXTRACT(DAY FROM date_of_birth)))
  WHERE date_of_birth IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_birthday_once_year
  ON public.notifications (user_id, ((data ->> 'birthday_year')))
  WHERE type = 'birthday' AND data ? 'birthday_year';

CREATE OR REPLACE FUNCTION public.enqueue_birthday_notifications(p_run_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_recipient record;
  v_count integer := 0;
  v_year text := to_char(COALESCE(p_run_date, CURRENT_DATE), 'YYYY');
BEGIN
  FOR v_recipient IN
    WITH eligible_users AS (
      SELECT
        ur.user_id,
        COALESCE(up.date_of_birth, p.date_of_birth) AS date_of_birth,
        COALESCE(NULLIF(trim(concat_ws(' ', up.first_name, up.last_name)), ''), p.full_name) AS display_name,
        array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) AS roles
      FROM public.user_roles ur
      LEFT JOIN public.user_profiles up ON up.user_id = ur.user_id
      LEFT JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.role::text IN ('client', 'restaurateur', 'courier')
      GROUP BY ur.user_id, up.date_of_birth, p.date_of_birth, up.first_name, up.last_name, p.full_name
    )
    SELECT *
    FROM eligible_users eu
    WHERE eu.date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM eu.date_of_birth) = EXTRACT(MONTH FROM COALESCE(p_run_date, CURRENT_DATE))
      AND EXTRACT(DAY FROM eu.date_of_birth) = EXTRACT(DAY FROM COALESCE(p_run_date, CURRENT_DATE))
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = eu.user_id
          AND n.type = 'birthday'
          AND n.data ->> 'birthday_year' = v_year
      )
  LOOP
    PERFORM public.enqueue_notification(
      v_recipient.user_id,
      'Joyeux anniversaire de la part de TOK',
      'Votre attention anniversaire Miamz est disponible aujourd''hui dans votre espace TOK.',
      'birthday',
      'product',
      jsonb_build_object(
        'birthday_year', v_year,
        'benefit_id', 'birthday_bonus',
        'roles', COALESCE(to_jsonb(v_recipient.roles), '[]'::jsonb),
        'url', '/profil?tab=fidelite'
      )::json
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enqueue_birthday_notifications(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_birthday_notifications(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_birthday_notifications(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_birthday_notifications(date) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_miamz_birthday_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_state jsonb;
  v_effects jsonb;
  v_birth_date date;
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_points integer;
  v_existing_id uuid;
  v_transaction_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_state := public.resolve_miamz_benefit_state(v_user_id);
  IF NOT (COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb) ? 'birthday_bonus') THEN
    RAISE EXCEPTION 'Birthday bonus is not active for this tier';
  END IF;

  SELECT COALESCE(up.date_of_birth, p.date_of_birth)
  INTO v_birth_date
  FROM public.user_profiles up
  FULL JOIN public.profiles p ON p.user_id = up.user_id
  WHERE COALESCE(up.user_id, p.user_id) = v_user_id;

  IF v_birth_date IS NULL THEN
    RAISE EXCEPTION 'Birth date is missing';
  END IF;

  IF to_char(v_birth_date, 'MM') <> to_char(CURRENT_DATE, 'MM') THEN
    RAISE EXCEPTION 'Birthday bonus is available during your birthday month';
  END IF;

  SELECT lt.id
  INTO v_existing_id
  FROM public.loyalty_transactions lt
  WHERE lt.user_id = v_user_id
    AND lt.transaction_type = 'birthday_bonus'
    AND lt.metadata ->> 'benefit_year' = v_year
  LIMIT 1;

  v_effects := COALESCE(v_state -> 'effects', '{}'::jsonb);
  v_points := GREATEST(1, COALESCE((v_effects ->> 'birthday_bonus_points')::integer, 250));

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'points', 0,
      'benefit_year', v_year
    );
  END IF;

  BEGIN
    INSERT INTO public.loyalty_transactions (
      user_id,
      amount,
      transaction_type,
      description,
      metadata
    )
    VALUES (
      v_user_id,
      v_points,
      'birthday_bonus',
      'Bonus anniversaire Miamz',
      jsonb_build_object(
        'benefit_id', 'birthday_bonus',
        'benefit_year', v_year,
        'miamz_state', v_state
      )
    )
    RETURNING id INTO v_transaction_id;
  EXCEPTION
    WHEN unique_violation THEN
      v_transaction_id := NULL;
  END;

  IF v_transaction_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'points', 0,
      'benefit_year', v_year
    );
  END IF;

  INSERT INTO public.profiles (user_id, loyalty_points)
  VALUES (v_user_id, v_points)
  ON CONFLICT (user_id)
  DO UPDATE SET
    loyalty_points = COALESCE(public.profiles.loyalty_points, 0) + EXCLUDED.loyalty_points,
    updated_at = now();

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = v_user_id
      AND n.type = 'birthday'
      AND n.data ->> 'birthday_year' = v_year
  ) THEN
    PERFORM public.enqueue_notification(
      v_user_id,
      'Bonus anniversaire Miamz activé',
      format('Votre bonus anniversaire de %s Miamz a ete credite.', v_points),
      'birthday',
      'product',
      jsonb_build_object(
        'birthday_year', v_year,
        'benefit_id', 'birthday_bonus',
        'points', v_points,
        'url', '/profil?tab=fidelite'
      )::json
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'points', v_points,
    'benefit_year', v_year
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_miamz_birthday_bonus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_miamz_birthday_bonus() TO authenticated, service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('calculate_progressive_offer_discount', 'jsonb_target_pages_has_actualites')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.signature);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_progressive_offer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_progressive_offer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_progressive_offer(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.admin_review_action_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS admin_review_action_history_admin_select ON public.admin_review_action_history;
    CREATE POLICY admin_review_action_history_admin_select
      ON public.admin_review_action_history
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF to_regclass('public.collection_restaurants') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_collection_restaurants_restaurant_id
      ON public.collection_restaurants(restaurant_id);
  END IF;

  IF to_regclass('public.courier_documents') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_courier_documents_courier_id
      ON public.courier_documents(courier_id);
  END IF;

  IF to_regclass('public.courier_earnings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_courier_earnings_dispatch_job_id
      ON public.courier_earnings(dispatch_job_id);
  END IF;

  IF to_regclass('public.courier_shifts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_courier_shifts_courier_id
      ON public.courier_shifts(courier_id);
  END IF;

  IF to_regclass('public.credit_notes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id
      ON public.credit_notes(invoice_id);
  END IF;

  IF to_regclass('public.delivery_batches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_delivery_batches_courier_id
      ON public.delivery_batches(courier_id);
  END IF;

  IF to_regclass('public.delivery_routes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_delivery_routes_dispatch_job_id
      ON public.delivery_routes(dispatch_job_id);
  END IF;

  IF to_regclass('public.floor_plan_variants') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_floor_plan_variants_restaurant_id
      ON public.floor_plan_variants(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_floor_plan_variants_created_by
      ON public.floor_plan_variants(created_by);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule('tok-birthday-notifications') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'tok-birthday-notifications'
    );

    PERFORM cron.schedule(
      'tok-birthday-notifications',
      '15 7 * * *',
      'select public.enqueue_birthday_notifications(current_date);'
    );
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
