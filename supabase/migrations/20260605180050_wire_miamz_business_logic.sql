ALTER TABLE public.loyalty_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.gift_points
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_birthday_bonus_once_year
  ON public.loyalty_transactions (user_id, (metadata ->> 'benefit_year'), transaction_type)
  WHERE transaction_type = 'birthday_bonus';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_order_reward_once
  ON public.loyalty_transactions (user_id, order_id, transaction_type)
  WHERE order_id IS NOT NULL
    AND transaction_type IN ('order_earned', 'donation');

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_transactions_reservation_reward_once
  ON public.loyalty_transactions (user_id, reservation_id, transaction_type)
  WHERE reservation_id IS NOT NULL
    AND transaction_type = 'reservation_earned';

CREATE OR REPLACE FUNCTION public.miamz_tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE lower(COALESCE(p_tier, ''))
    WHEN 'bronze' THEN 0
    WHEN 'silver' THEN 1
    WHEN 'gold' THEN 2
    WHEN 'platinum' THEN 3
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.miamz_priority_rank(p_priority text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE lower(COALESCE(p_priority, ''))
    WHEN 'urgent' THEN 4
    WHEN 'high' THEN 3
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.miamz_priority_from_rank(p_rank integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT CASE
    WHEN COALESCE(p_rank, 0) >= 4 THEN 'urgent'
    WHEN COALESCE(p_rank, 0) = 3 THEN 'high'
    WHEN COALESCE(p_rank, 0) = 2 THEN 'normal'
    WHEN COALESCE(p_rank, 0) = 1 THEN 'low'
    ELSE 'normal'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_miamz_benefit_state(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_points integer := 0;
  v_profile_tier text := 'bronze';
  v_tier_name text := 'bronze';
  v_tier_min_points integer := 0;
  v_tier_multiplier numeric := 1;
  v_tier_benefits jsonb := '{}'::jsonb;
  v_tier_rank integer := 0;
  v_catalog jsonb := '[
    {"id":"welcome_miamz","applies_from":"bronze","effects":{"base_earning":true}},
    {"id":"birthday_bonus","applies_from":"bronze","effects":{"birthday_bonus_points":250}},
    {"id":"personalized_recommendations","applies_from":"bronze","effects":{"personalized_recommendations":true}},
    {"id":"early_deals","applies_from":"bronze","effects":{"early_deals":true}},
    {"id":"silver_multiplier","applies_from":"silver","effects":{"points_multiplier":1.10}},
    {"id":"reservation_priority","applies_from":"silver","effects":{"reservation_priority_score":10}},
    {"id":"delivery_fee_boost","applies_from":"silver","effects":{"delivery_fee_discount_percent":10,"delivery_fee_discount_cap":2.00}},
    {"id":"exclusive_partner_events","applies_from":"silver","effects":{"partner_events":true}},
    {"id":"gold_multiplier","applies_from":"gold","effects":{"points_multiplier":1.25}},
    {"id":"priority_support","applies_from":"gold","effects":{"support_priority":"high"}},
    {"id":"premium_slots","applies_from":"gold","effects":{"reservation_priority_score":25,"premium_slots":true}},
    {"id":"restaurant_gifts","applies_from":"gold","effects":{"gift_bonus_percent":10}},
    {"id":"platinum_multiplier","applies_from":"platinum","effects":{"points_multiplier":1.50}},
    {"id":"vip_table_access","applies_from":"platinum","effects":{"reservation_priority_score":50,"vip_table_access":true}},
    {"id":"concierge_booking","applies_from":"platinum","effects":{"support_priority":"high","concierge_booking":true}},
    {"id":"premium_refunds","applies_from":"platinum","effects":{"refund_priority":"high"}}
  ]'::jsonb;
  v_item jsonb;
  v_benefit_id text;
  v_config jsonb;
  v_effect jsonb;
  v_active_ids jsonb := '[]'::jsonb;
  v_effects jsonb := jsonb_build_object(
    'points_multiplier', 1,
    'delivery_fee_discount_percent', 0,
    'delivery_fee_discount_cap', 0,
    'birthday_bonus_points', 0,
    'gift_bonus_percent', 0,
    'reservation_priority_score', 0,
    'support_priority', 'normal',
    'refund_priority', 'normal',
    'base_earning', false,
    'personalized_recommendations', false,
    'early_deals', false,
    'partner_events', false,
    'premium_slots', false,
    'vip_table_access', false,
    'concierge_booking', false
  );
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'tier', 'bronze',
      'points', 0,
      'active_benefit_ids', '[]'::jsonb,
      'effects', v_effects
    );
  END IF;

  SELECT COALESCE(p.loyalty_points, 0), lower(COALESCE(p.current_tier::text, 'bronze'))
  INTO v_points, v_profile_tier
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF NOT FOUND THEN
    v_points := 0;
    v_profile_tier := 'bronze';
  END IF;

  SELECT lower(lt.name), COALESCE(lt.min_points, 0), COALESCE(lt.multiplier, 1), COALESCE(lt.benefits, '{}'::jsonb)
  INTO v_tier_name, v_tier_min_points, v_tier_multiplier, v_tier_benefits
  FROM public.loyalty_tiers lt
  WHERE lower(lt.name) = v_profile_tier
    AND COALESCE(lt.status, 'active') = 'active'
  ORDER BY lt.min_points DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT lower(lt.name), COALESCE(lt.min_points, 0), COALESCE(lt.multiplier, 1), COALESCE(lt.benefits, '{}'::jsonb)
    INTO v_tier_name, v_tier_min_points, v_tier_multiplier, v_tier_benefits
    FROM public.loyalty_tiers lt
    WHERE COALESCE(lt.min_points, 0) <= COALESCE(v_points, 0)
      AND COALESCE(lt.status, 'active') = 'active'
    ORDER BY lt.min_points DESC
    LIMIT 1;
  END IF;

  v_tier_name := COALESCE(v_tier_name, COALESCE(v_profile_tier, 'bronze'));
  v_tier_rank := public.miamz_tier_rank(v_tier_name);

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_catalog)
  LOOP
    IF public.miamz_tier_rank(v_item ->> 'applies_from') > v_tier_rank THEN
      CONTINUE;
    END IF;

    v_benefit_id := v_item ->> 'id';
    v_config := COALESCE(v_tier_benefits -> 'miamz_benefits' -> v_benefit_id, '{}'::jsonb);

    IF COALESCE((v_config ->> 'enabled')::boolean, true) IS FALSE THEN
      CONTINUE;
    END IF;

    v_effect := COALESCE(v_item -> 'effects', '{}'::jsonb) || COALESCE(v_config -> 'effects', '{}'::jsonb);
    v_active_ids := v_active_ids || jsonb_build_array(v_benefit_id);

    v_effects := jsonb_set(
      v_effects,
      '{points_multiplier}',
      to_jsonb(GREATEST(
        COALESCE((v_effects ->> 'points_multiplier')::numeric, 1),
        COALESCE((v_effect ->> 'points_multiplier')::numeric, 1)
      )),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{delivery_fee_discount_percent}',
      to_jsonb(GREATEST(
        COALESCE((v_effects ->> 'delivery_fee_discount_percent')::numeric, 0),
        COALESCE((v_effect ->> 'delivery_fee_discount_percent')::numeric, 0)
      )),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{delivery_fee_discount_cap}',
      to_jsonb(GREATEST(
        COALESCE((v_effects ->> 'delivery_fee_discount_cap')::numeric, 0),
        COALESCE((v_effect ->> 'delivery_fee_discount_cap')::numeric, 0)
      )),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{birthday_bonus_points}',
      to_jsonb(GREATEST(
        COALESCE((v_effects ->> 'birthday_bonus_points')::integer, 0),
        COALESCE((v_effect ->> 'birthday_bonus_points')::integer, 0)
      )),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{gift_bonus_percent}',
      to_jsonb(GREATEST(
        COALESCE((v_effects ->> 'gift_bonus_percent')::numeric, 0),
        COALESCE((v_effect ->> 'gift_bonus_percent')::numeric, 0)
      )),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{reservation_priority_score}',
      to_jsonb(
        COALESCE((v_effects ->> 'reservation_priority_score')::integer, 0)
        + COALESCE((v_effect ->> 'reservation_priority_score')::integer, 0)
      ),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{support_priority}',
      to_jsonb(public.miamz_priority_from_rank(GREATEST(
        public.miamz_priority_rank(v_effects ->> 'support_priority'),
        public.miamz_priority_rank(v_effect ->> 'support_priority')
      ))),
      true
    );
    v_effects := jsonb_set(
      v_effects,
      '{refund_priority}',
      to_jsonb(public.miamz_priority_from_rank(GREATEST(
        public.miamz_priority_rank(v_effects ->> 'refund_priority'),
        public.miamz_priority_rank(v_effect ->> 'refund_priority')
      ))),
      true
    );

    IF COALESCE((v_effect ->> 'base_earning')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{base_earning}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'personalized_recommendations')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{personalized_recommendations}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'early_deals')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{early_deals}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'partner_events')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{partner_events}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'premium_slots')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{premium_slots}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'vip_table_access')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{vip_table_access}', 'true'::jsonb, true);
    END IF;
    IF COALESCE((v_effect ->> 'concierge_booking')::boolean, false) THEN
      v_effects := jsonb_set(v_effects, '{concierge_booking}', 'true'::jsonb, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tier', v_tier_name,
    'tier_min_points', COALESCE(v_tier_min_points, 0),
    'tier_multiplier', COALESCE(v_tier_multiplier, 1),
    'points', COALESCE(v_points, 0),
    'active_benefit_ids', v_active_ids,
    'effects', v_effects
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_miamz_benefit_state(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF auth.role() <> 'service_role'
    AND v_target IS DISTINCT FROM auth.uid()
    AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN public.resolve_miamz_benefit_state(v_target);
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_has_miamz_benefit(p_user_id uuid, p_benefit_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(public.get_user_miamz_benefit_state(p_user_id) -> 'active_benefit_ids', '[]'::jsonb) ? COALESCE(p_benefit_id, '');
$function$;

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

  SELECT up.date_of_birth
  INTO v_birth_date
  FROM public.user_profiles up
  WHERE up.user_id = v_user_id;

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

  UPDATE public.profiles
  SET loyalty_points = COALESCE(loyalty_points, 0) + v_points
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'points', v_points,
    'benefit_year', v_year
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_gift_points(recipient_email_param text, points_param integer, message_param text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  gid uuid;
  current_points integer;
  v_user_id uuid := auth.uid();
  v_state jsonb;
  v_effects jsonb;
  v_bonus_percent numeric := 0;
  v_bonus_points integer := 0;
  v_claimed_points integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF points_param IS NULL OR points_param < 100 THEN
    RAISE EXCEPTION 'Minimum gift amount is 100 Miamz';
  END IF;

  SELECT loyalty_points
  INTO current_points
  FROM public.profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF current_points IS NULL OR current_points < points_param THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  v_state := public.resolve_miamz_benefit_state(v_user_id);
  v_effects := COALESCE(v_state -> 'effects', '{}'::jsonb);
  IF COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb) ? 'restaurant_gifts' THEN
    v_bonus_percent := GREATEST(0, COALESCE((v_effects ->> 'gift_bonus_percent')::numeric, 0));
  END IF;
  v_bonus_points := GREATEST(0, FLOOR(points_param * v_bonus_percent / 100.0)::integer);
  v_claimed_points := points_param + v_bonus_points;

  UPDATE public.profiles
  SET loyalty_points = loyalty_points - points_param
  WHERE user_id = v_user_id;

  INSERT INTO public.loyalty_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    metadata
  )
  VALUES (
    v_user_id,
    -points_param,
    'gift_sent',
    'Gift to ' || recipient_email_param,
    jsonb_build_object(
      'recipient_email', recipient_email_param,
      'base_points', points_param,
      'recipient_points', v_claimed_points,
      'miamz_bonus_points', v_bonus_points,
      'miamz_benefit_id', CASE WHEN v_bonus_points > 0 THEN 'restaurant_gifts' ELSE NULL END
    )
  );

  INSERT INTO public.gift_points (
    sender_id,
    recipient_email,
    points_amount,
    message,
    metadata
  )
  VALUES (
    v_user_id,
    recipient_email_param,
    v_claimed_points,
    message_param,
    jsonb_build_object(
      'base_points', points_param,
      'miamz_bonus_points', v_bonus_points,
      'miamz_bonus_percent', v_bonus_percent,
      'miamz_benefit_id', CASE WHEN v_bonus_points > 0 THEN 'restaurant_gifts' ELSE NULL END
    )
  )
  RETURNING id INTO gid;

  RETURN gid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_gift_points(claim_code_param text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  gift_row public.gift_points%ROWTYPE;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO gift_row
  FROM public.gift_points
  WHERE claim_code = claim_code_param
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.gift_points
  SET status = 'claimed',
      claimed_at = now(),
      recipient_id = v_user_id
  WHERE id = gift_row.id;

  UPDATE public.profiles
  SET loyalty_points = COALESCE(loyalty_points, 0) + gift_row.points_amount
  WHERE user_id = v_user_id;

  INSERT INTO public.loyalty_transactions (
    user_id,
    amount,
    transaction_type,
    description,
    metadata
  )
  VALUES (
    v_user_id,
    gift_row.points_amount,
    'gift_received',
    'Gift claimed',
    jsonb_build_object(
      'gift_id', gift_row.id,
      'sender_id', gift_row.sender_id,
      'base_points', COALESCE((gift_row.metadata ->> 'base_points')::integer, gift_row.points_amount),
      'miamz_bonus_points', COALESCE((gift_row.metadata ->> 'miamz_bonus_points')::integer, 0)
    )
  );

  RETURN gift_row.points_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_gift_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT json_build_object(
    'total_sent', (SELECT count(*) FROM public.gift_points WHERE sender_id = auth.uid()),
    'total_received', (SELECT count(*) FROM public.gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'),
    'gifts_sent_count', (SELECT count(*) FROM public.gift_points WHERE sender_id = auth.uid()),
    'gifts_received_count', (SELECT count(*) FROM public.gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'),
    'pending_gifts', (SELECT count(*) FROM public.gift_points WHERE sender_id = auth.uid() AND status = 'pending'),
    'points_sent', COALESCE((SELECT sum(COALESCE((metadata ->> 'base_points')::integer, points_amount)) FROM public.gift_points WHERE sender_id = auth.uid()), 0),
    'points_received', COALESCE((SELECT sum(points_amount) FROM public.gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'), 0),
    'total_points_sent', COALESCE((SELECT sum(COALESCE((metadata ->> 'base_points')::integer, points_amount)) FROM public.gift_points WHERE sender_id = auth.uid()), 0),
    'total_points_received', COALESCE((SELECT sum(points_amount) FROM public.gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'), 0)
  );
$function$;

CREATE OR REPLACE FUNCTION public.apply_miamz_metadata_to_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state jsonb;
  v_effects jsonb;
  v_active_ids jsonb;
  v_priority integer := 0;
  v_label text := 'Priorite Miamz';
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_state := public.resolve_miamz_benefit_state(NEW.user_id);
  v_effects := COALESCE(v_state -> 'effects', '{}'::jsonb);
  v_active_ids := COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb);
  v_priority := COALESCE((v_effects ->> 'reservation_priority_score')::integer, 0);

  IF v_active_ids ? 'vip_table_access' THEN
    v_label := 'VIP Miamz';
  ELSIF v_active_ids ? 'premium_slots' THEN
    v_label := 'Premium Miamz';
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'miamz_priority_score', v_priority,
    'miamz_priority_label', CASE WHEN v_priority > 0 THEN v_label ELSE NULL END,
    'miamz_benefits_applied', v_active_ids,
    'miamz', jsonb_build_object(
      'tier', v_state ->> 'tier',
      'active_benefit_ids', v_active_ids,
      'effects', v_effects,
      'reservation_priority_score', v_priority
    )
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_miamz_metadata_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state jsonb;
  v_effects jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_state := public.resolve_miamz_benefit_state(NEW.user_id);
  v_effects := COALESCE(v_state -> 'effects', '{}'::jsonb);

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'miamz_benefits_applied', COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb),
    'miamz_points_multiplier', COALESCE((v_effects ->> 'points_multiplier')::numeric, 1),
    'miamz_refund_priority', COALESCE(NULLIF(v_effects ->> 'refund_priority', ''), 'normal'),
    'miamz', jsonb_build_object(
      'tier', v_state ->> 'tier',
      'active_benefit_ids', COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb),
      'effects', v_effects
    )
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_miamz_priority_to_support()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state jsonb;
  v_effects jsonb;
  v_active_ids jsonb;
  v_category text := lower(COALESCE(NEW.category, ''));
  v_current_priority text := lower(COALESCE(NEW.priority, 'normal'));
  v_target_priority text := lower(COALESCE(NEW.priority, 'normal'));
  v_refund_related boolean := false;
  v_reservation_related boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_state := public.resolve_miamz_benefit_state(NEW.user_id);
  v_effects := COALESCE(v_state -> 'effects', '{}'::jsonb);
  v_active_ids := COALESCE(v_state -> 'active_benefit_ids', '[]'::jsonb);
  v_refund_related := v_category LIKE '%refund%'
    OR v_category LIKE '%rembourse%'
    OR v_category LIKE '%payment%'
    OR v_category LIKE '%paiement%';
  v_reservation_related := NEW.reservation_id IS NOT NULL
    OR v_category LIKE '%reservation%'
    OR v_category LIKE '%booking%'
    OR v_category LIKE '%zero%';

  IF v_active_ids ? 'priority_support' THEN
    v_target_priority := public.miamz_priority_from_rank(GREATEST(
      public.miamz_priority_rank(v_target_priority),
      public.miamz_priority_rank(v_effects ->> 'support_priority')
    ));
  END IF;

  IF v_active_ids ? 'concierge_booking' AND v_reservation_related THEN
    v_target_priority := public.miamz_priority_from_rank(GREATEST(
      public.miamz_priority_rank(v_target_priority),
      public.miamz_priority_rank('high')
    ));
  END IF;

  IF v_active_ids ? 'premium_refunds' AND v_refund_related THEN
    v_target_priority := public.miamz_priority_from_rank(GREATEST(
      public.miamz_priority_rank(v_target_priority),
      public.miamz_priority_rank(v_effects ->> 'refund_priority')
    ));
  END IF;

  NEW.priority := v_target_priority;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'miamz_priority_boost', public.miamz_priority_rank(v_target_priority) > public.miamz_priority_rank(v_current_priority),
    'miamz_support_priority', v_target_priority,
    'miamz_benefits_applied', v_active_ids,
    'miamz', jsonb_build_object(
      'tier', v_state ->> 'tier',
      'active_benefit_ids', v_active_ids,
      'effects', v_effects
    )
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_order_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restaurant_multiplier numeric := 1;
  v_miamz_state jsonb;
  v_miamz_effects jsonb;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_earned integer;
  v_donate boolean;
  v_transaction_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(points_multiplier, 1.0)
    INTO v_restaurant_multiplier
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    v_miamz_state := public.resolve_miamz_benefit_state(NEW.user_id);
    v_miamz_effects := COALESCE(v_miamz_state -> 'effects', '{}'::jsonb);
    IF NOT (COALESCE(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz') THEN
      RETURN NEW;
    END IF;

    v_miamz_multiplier := GREATEST(1, COALESCE((v_miamz_effects ->> 'points_multiplier')::numeric, 1));
    v_effective_multiplier := COALESCE(v_restaurant_multiplier, 1) * v_miamz_multiplier;
    v_earned := GREATEST(1, FLOOR(NEW.total_amount * 10 * v_effective_multiplier));
    v_donate := COALESCE((NEW.metadata ->> 'donate_earned_xp')::boolean, false);

    IF v_donate THEN
      INSERT INTO public.loyalty_transactions (
        user_id,
        order_id,
        amount,
        transaction_type,
        description,
        metadata
      )
      VALUES (
        NEW.user_id,
        NEW.id,
        v_earned,
        'donation',
        'Don solidaire automatique (commande)',
        jsonb_build_object(
          'restaurant_multiplier', COALESCE(v_restaurant_multiplier, 1),
          'miamz_points_multiplier', v_miamz_multiplier,
          'effective_multiplier', v_effective_multiplier,
          'miamz_state', v_miamz_state
        )
      )
      ON CONFLICT (user_id, order_id, transaction_type)
      WHERE order_id IS NOT NULL AND transaction_type IN ('order_earned', 'donation')
      DO NOTHING
      RETURNING id INTO v_transaction_id;

      IF v_transaction_id IS NOT NULL THEN
        INSERT INTO public.solidarity_donations (user_id, points_amount, meals_count)
        VALUES (NEW.user_id, v_earned, GREATEST(1, v_earned / 100));
      END IF;
    ELSE
      INSERT INTO public.loyalty_transactions (
        user_id,
        order_id,
        amount,
        transaction_type,
        description,
        metadata
      )
      VALUES (
        NEW.user_id,
        NEW.id,
        v_earned,
        'order_earned',
        'Points gagnes sur commande (' || v_earned || ' pts, x' || v_effective_multiplier || ')',
        jsonb_build_object(
          'restaurant_multiplier', COALESCE(v_restaurant_multiplier, 1),
          'miamz_points_multiplier', v_miamz_multiplier,
          'effective_multiplier', v_effective_multiplier,
          'miamz_state', v_miamz_state
        )
      )
      ON CONFLICT (user_id, order_id, transaction_type)
      WHERE order_id IS NOT NULL AND transaction_type IN ('order_earned', 'donation')
      DO NOTHING
      RETURNING id INTO v_transaction_id;

      IF v_transaction_id IS NOT NULL THEN
        UPDATE public.profiles
        SET loyalty_points = COALESCE(loyalty_points, 0) + v_earned
        WHERE user_id = NEW.user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_reservation_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restaurant_multiplier numeric := 1;
  v_miamz_state jsonb;
  v_miamz_effects jsonb;
  v_miamz_multiplier numeric := 1;
  v_effective_multiplier numeric := 1;
  v_earned integer;
  v_transaction_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(points_multiplier, 1.0)
    INTO v_restaurant_multiplier
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    v_miamz_state := public.resolve_miamz_benefit_state(NEW.user_id);
    v_miamz_effects := COALESCE(v_miamz_state -> 'effects', '{}'::jsonb);
    IF NOT (COALESCE(v_miamz_state -> 'active_benefit_ids', '[]'::jsonb) ? 'welcome_miamz') THEN
      RETURN NEW;
    END IF;

    v_miamz_multiplier := GREATEST(1, COALESCE((v_miamz_effects ->> 'points_multiplier')::numeric, 1));
    v_effective_multiplier := COALESCE(v_restaurant_multiplier, 1) * v_miamz_multiplier;
    v_earned := GREATEST(1, FLOOR(100 * v_effective_multiplier));

    INSERT INTO public.loyalty_transactions (
      user_id,
      reservation_id,
      amount,
      transaction_type,
      description,
      metadata
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      v_earned,
      'reservation_earned',
      'Points gagnes sur reservation (' || v_earned || ' pts, x' || v_effective_multiplier || ')',
      jsonb_build_object(
        'restaurant_multiplier', COALESCE(v_restaurant_multiplier, 1),
        'miamz_points_multiplier', v_miamz_multiplier,
        'effective_multiplier', v_effective_multiplier,
        'miamz_state', v_miamz_state
      )
    )
    ON CONFLICT (user_id, reservation_id, transaction_type)
    WHERE reservation_id IS NOT NULL AND transaction_type = 'reservation_earned'
    DO NOTHING
    RETURNING id INTO v_transaction_id;

    IF v_transaction_id IS NOT NULL THEN
      UPDATE public.profiles
      SET loyalty_points = COALESCE(loyalty_points, 0) + v_earned
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_reservations_apply_miamz_metadata ON public.reservations;
CREATE TRIGGER tg_reservations_apply_miamz_metadata
  BEFORE INSERT OR UPDATE OF user_id, metadata ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_miamz_metadata_to_reservation();

DROP TRIGGER IF EXISTS tg_orders_apply_miamz_metadata ON public.orders;
CREATE TRIGGER tg_orders_apply_miamz_metadata
  BEFORE INSERT OR UPDATE OF user_id, metadata ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_miamz_metadata_to_order();

DROP TRIGGER IF EXISTS tg_support_incidents_apply_miamz_priority ON public.support_incidents;
CREATE TRIGGER tg_support_incidents_apply_miamz_priority
  BEFORE INSERT OR UPDATE OF user_id, category, priority, metadata, order_id, reservation_id ON public.support_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_miamz_priority_to_support();

DROP TRIGGER IF EXISTS trg_credit_order_loyalty ON public.orders;
CREATE TRIGGER trg_credit_order_loyalty
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.credit_order_loyalty_points();

DROP TRIGGER IF EXISTS trg_credit_reservation_loyalty ON public.reservations;
CREATE TRIGGER trg_credit_reservation_loyalty
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.credit_reservation_loyalty_points();

DO $block$
BEGIN
  IF to_regclass('public.ai_support_tickets') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS tg_ai_support_tickets_apply_miamz_priority ON public.ai_support_tickets';
    EXECUTE 'CREATE TRIGGER tg_ai_support_tickets_apply_miamz_priority
      BEFORE INSERT OR UPDATE OF user_id, category, priority, metadata, order_id, reservation_id ON public.ai_support_tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.apply_miamz_priority_to_support()';
  END IF;
END;
$block$;

DROP FUNCTION IF EXISTS public.admin_get_refund_queue();

CREATE OR REPLACE FUNCTION public.admin_get_refund_queue()
RETURNS TABLE (
  target_type text,
  target_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  customer_user_id uuid,
  customer_name text,
  customer_phone text,
  reference text,
  item_label text,
  feature text,
  created_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  refund_status text,
  refund_initiated_by text,
  refund_reason text,
  total_amount_chf numeric,
  refunded_amount_chf numeric,
  remaining_amount_chf numeric,
  payment_status text,
  payment_method text,
  miamz_priority text,
  miamz_priority_score integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM (
  SELECT
    'order'::text AS target_type,
    o.id AS target_id,
    o.restaurant_id,
    rest.name AS restaurant_name,
    o.user_id AS customer_user_id,
    prof.full_name AS customer_name,
    prof.phone AS customer_phone,
    COALESCE(o.order_number, '#' || substr(o.id::text, 1, 8)) AS reference,
    COALESCE(rest.name, 'Commande') AS item_label,
    COALESCE(NULLIF(trim(COALESCE(o.metadata ->> 'feature', '')), ''), 'order') AS feature,
    o.created_at,
    o.cancelled_at,
    o.cancelled_by,
    COALESCE(o.refund_status, 'pending') AS refund_status,
    o.refund_initiated_by,
    COALESCE(NULLIF(trim(COALESCE(o.refund_reason, '')), ''), o.cancellation_reason) AS refund_reason,
    COALESCE(o.total_amount, 0)::numeric AS total_amount_chf,
    COALESCE(o.refunded_amount_chf, 0)::numeric AS refunded_amount_chf,
    GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0) AS remaining_amount_chf,
    o.payment_status,
    COALESCE(NULLIF(trim(COALESCE(o.metadata ->> 'payment_method', '')), ''), 'card') AS payment_method,
    COALESCE(NULLIF(miamz_state.state #>> '{effects,refund_priority}', ''), NULLIF(o.metadata ->> 'miamz_refund_priority', ''), 'normal') AS miamz_priority,
    CASE lower(COALESCE(NULLIF(miamz_state.state #>> '{effects,refund_priority}', ''), NULLIF(o.metadata ->> 'miamz_refund_priority', ''), 'normal'))
      WHEN 'urgent' THEN 100
      WHEN 'high' THEN 70
      ELSE 0
    END AS miamz_priority_score
  FROM public.orders o
  LEFT JOIN public.restaurants rest ON rest.id = o.restaurant_id
  LEFT JOIN public.profiles prof ON prof.user_id = o.user_id
  LEFT JOIN LATERAL public.resolve_miamz_benefit_state(o.user_id) AS miamz_state(state) ON o.user_id IS NOT NULL
  WHERE lower(COALESCE(o.status, '')) = 'cancelled'
    AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
    AND COALESCE(o.refund_status, 'pending') IN ('pending', 'failed', 'partial')
    AND GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0) > 0

  UNION ALL

  SELECT
    'reservation'::text AS target_type,
    r.id AS target_id,
    r.restaurant_id,
    rest.name AS restaurant_name,
    r.user_id AS customer_user_id,
    prof.full_name AS customer_name,
    prof.phone AS customer_phone,
    COALESCE(r.order_reference, 'RES-' || substr(r.id::text, 1, 8)) AS reference,
    COALESCE(rest.name, 'Reservation') AS item_label,
    COALESCE(NULLIF(trim(COALESCE(r.feature, '')), ''), COALESCE(r.metadata ->> 'feature', 'reservation')) AS feature,
    r.created_at,
    r.cancelled_at,
    r.cancelled_by,
    COALESCE(r.refund_status, 'pending') AS refund_status,
    r.refund_initiated_by,
    r.refund_reason,
    COALESCE(r.total_amount, 0)::numeric AS total_amount_chf,
    COALESCE(r.refunded_amount_chf, 0)::numeric AS refunded_amount_chf,
    GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0) AS remaining_amount_chf,
    CASE
      WHEN COALESCE(r.total_amount, 0)::numeric > 0 THEN 'paid'
      ELSE NULL
    END AS payment_status,
    COALESCE(
      NULLIF(trim(COALESCE(r.payment_method, '')), ''),
      NULLIF(trim(COALESCE(r.metadata ->> 'payment_method', '')), ''),
      'card'
    ) AS payment_method,
    COALESCE(NULLIF(miamz_state.state #>> '{effects,refund_priority}', ''), NULLIF(r.metadata ->> 'miamz_refund_priority', ''), 'normal') AS miamz_priority,
    CASE lower(COALESCE(NULLIF(miamz_state.state #>> '{effects,refund_priority}', ''), NULLIF(r.metadata ->> 'miamz_refund_priority', ''), 'normal'))
      WHEN 'urgent' THEN 100
      WHEN 'high' THEN 70
      ELSE 0
    END AS miamz_priority_score
  FROM public.reservations r
  LEFT JOIN public.restaurants rest ON rest.id = r.restaurant_id
  LEFT JOIN public.profiles prof ON prof.user_id = r.user_id
  LEFT JOIN LATERAL public.resolve_miamz_benefit_state(r.user_id) AS miamz_state(state) ON r.user_id IS NOT NULL
  WHERE lower(COALESCE(r.status, '')) = 'cancelled'
    AND COALESCE(r.total_amount, 0)::numeric > 0
    AND COALESCE(r.refund_status, 'pending') IN ('pending', 'failed', 'partial')
    AND GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0) > 0
  ) AS refund_rows
  ORDER BY refund_rows.miamz_priority_score DESC, refund_rows.cancelled_at DESC NULLS LAST, refund_rows.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.miamz_tier_rank(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.miamz_priority_rank(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.miamz_priority_from_rank(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_miamz_benefit_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_miamz_benefit_state(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_miamz_benefit(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_miamz_birthday_bonus() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_gift_points(text, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_gift_points(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gift_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_miamz_metadata_to_reservation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_miamz_metadata_to_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_miamz_priority_to_support() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_order_loyalty_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_reservation_loyalty_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_refund_queue() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.miamz_tier_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.miamz_priority_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.miamz_priority_from_rank(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_miamz_benefit_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_miamz_benefit_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_miamz_benefit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_miamz_birthday_bonus() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_gift_points(text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_gift_points(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gift_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_miamz_metadata_to_reservation() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_miamz_metadata_to_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_miamz_priority_to_support() TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_order_loyalty_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_reservation_loyalty_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_queue() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
