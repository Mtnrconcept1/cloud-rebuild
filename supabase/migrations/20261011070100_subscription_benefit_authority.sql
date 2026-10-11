BEGIN;
INSERT INTO public.loyalty_tiers(name,min_points,multiplier,benefits,status)
VALUES ('bronze',0,1,'{}','active'),('silver',1000,1.10,'{}','active'),
       ('gold',2500,1.25,'{}','active'),('platinum',5000,1.50,'{}','active')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.resolve_miamz_benefit_state(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

  SELECT lower(lt.name), lt.min_points, COALESCE(lt.multiplier, 1), COALESCE(lt.benefits, '{}'::jsonb)
  INTO v_tier_name, v_tier_min_points, v_tier_multiplier, v_tier_benefits
  FROM public.loyalty_tiers lt
  WHERE lt.min_points <= GREATEST(v_points, 0)
    AND lower(lt.name) IN ('bronze','silver','gold','platinum')
    AND lt.status = 'active'
  ORDER BY lt.min_points DESC, public.miamz_tier_rank(lt.name) DESC
  LIMIT 1;

  v_tier_name := COALESCE(v_tier_name, 'bronze');
  v_tier_rank := public.miamz_tier_rank(v_tier_name);

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(v_catalog)
  LOOP
    IF public.miamz_tier_rank(v_item ->> 'applies_from') > v_tier_rank THEN
      CONTINUE;
    END IF;

    v_benefit_id := v_item ->> 'id';
    SELECT COALESCE(lt.benefits -> 'miamz_benefits' -> v_benefit_id, '{}'::jsonb)
    INTO v_config FROM public.loyalty_tiers lt
    WHERE lower(lt.name) = v_item ->> 'applies_from' AND lt.status = 'active';
    IF NOT FOUND THEN CONTINUE; END IF;

    IF COALESCE((v_config ->> 'enabled')::boolean, true) IS FALSE THEN
      CONTINUE;
    END IF;

    v_effect := COALESCE(v_item -> 'effects', '{}'::jsonb) || COALESCE(v_config -> 'effects', '{}'::jsonb);
    IF v_benefit_id IN ('silver_multiplier', 'gold_multiplier', 'platinum_multiplier') THEN
      SELECT jsonb_build_object('points_multiplier', GREATEST(1, LEAST(5, COALESCE(lt.multiplier, 1))))
      INTO v_effect FROM public.loyalty_tiers lt WHERE lower(lt.name) = v_item ->> 'applies_from';
    END IF;
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

CREATE OR REPLACE FUNCTION public.update_loyalty_tier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_tier loyalty_tier;
BEGIN
  SELECT lower(name)::public.loyalty_tier INTO v_new_tier
  FROM public.loyalty_tiers
  WHERE status = 'active' AND min_points <= GREATEST(COALESCE(NEW.loyalty_points, 0), 0)
    AND lower(name) IN ('bronze','silver','gold','platinum')
  ORDER BY min_points DESC, public.miamz_tier_rank(name) DESC LIMIT 1;
  v_new_tier := COALESCE(v_new_tier, 'bronze'::public.loyalty_tier);

  IF NEW.current_tier IS DISTINCT FROM v_new_tier THEN
    NEW.current_tier := v_new_tier;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.has_tok_one_benefit(p_user_id uuid, p_benefit text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tok_one_subscriptions s
    WHERE s.user_id = p_user_id AND s.stripe_mode = 'live'
      AND s.status IN ('active','trialing') AND s.current_period_end > now()
      AND (s.current_period_start IS NULL OR s.current_period_start <= now())
      AND p_benefit IN ('discount_percentage','free_delivery','chef_table_priority',
                        'flash_early_access','priority_support','surprise_offers')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_benefits b
        WHERE b.plan_id = s.plan_id AND b.benefit_type = p_benefit
          AND b.value ->> 'enabled' = 'false'
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_tok_one_benefit(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_tok_one_benefit(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_tok_one_entitlements()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_object_agg(benefit, public.has_tok_one_benefit(auth.uid(),benefit))
  FROM unnest(ARRAY['discount_percentage','free_delivery','chef_table_priority',
                   'flash_early_access','priority_support','surprise_offers']) benefit;
$$;
REVOKE ALL ON FUNCTION public.get_my_tok_one_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tok_one_entitlements() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_miamz_priority_to_support()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  IF public.has_tok_one_benefit(NEW.user_id, 'priority_support') THEN
    v_target_priority := public.miamz_priority_from_rank(GREATEST(
      public.miamz_priority_rank(v_target_priority), public.miamz_priority_rank('high')
    ));
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || '{"tok_one_priority_boost":true}'::jsonb;
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

CREATE OR REPLACE FUNCTION public.notify_tok_one_members_new_offer(p_offer_kind text, p_offer_id uuid, p_restaurant_id uuid, p_title text, p_body text, p_url text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer_kind text := lower(trim(COALESCE(p_offer_kind, '')));
  v_offer_key text;
  v_notification record;
  v_count integer := 0;
BEGIN
  IF p_offer_id IS NULL THEN
    RAISE EXCEPTION 'offer_id requis';
  END IF;

  IF v_offer_kind NOT IN ('anti_gaspi', 'flash_sale', 'chefs_table') THEN
    RAISE EXCEPTION 'type offre Tok One invalide';
  END IF;

  v_offer_key := v_offer_kind || ':' || p_offer_id::text;

  FOR v_notification IN
    WITH active_tok_one_users AS (
      SELECT DISTINCT ON (tos.user_id)
        tos.user_id
      FROM public.tok_one_subscriptions tos
      WHERE tos.stripe_mode = 'live'
        AND public.has_tok_one_benefit(tos.user_id, CASE v_offer_kind
          WHEN 'flash_sale' THEN 'flash_early_access'
          WHEN 'chefs_table' THEN 'chef_table_priority' ELSE 'surprise_offers' END)
        AND tos.status IN ('active', 'trialing')
        AND tos.current_period_end > now()
      ORDER BY tos.user_id, tos.current_period_end DESC
    ),
    inserted_notifications AS (
      INSERT INTO public.notifications (user_id, title, body, type, category, data)
      SELECT
        atu.user_id,
        p_title,
        p_body,
        'tok_one_offer',
        'product',
        COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
          'audience', 'tok_one',
          'tok_one_offer_id', v_offer_key,
          'offer_kind', v_offer_kind,
          'offer_id', p_offer_id,
          'restaurant_id', p_restaurant_id,
          'url', p_url,
          'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
        )
      FROM active_tok_one_users atu
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = atu.user_id
          AND n.type = 'tok_one_offer'
          AND n.data ->> 'tok_one_offer_id' = v_offer_key
      )
      RETURNING id, user_id, category, data
    )
    SELECT id, user_id, category, data
    FROM inserted_notifications
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_loyalty_tier(
  p_tier_id uuid,
  p_payload jsonb,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_id uuid := p_tier_id;
  v_old_data jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF length(trim(COALESCE(p_reason,'')))<6 THEN RAISE EXCEPTION 'Reason required'; END IF;
  IF COALESCE(p_payload->>'name','') NOT IN ('bronze','silver','gold','platinum')
    OR COALESCE((p_payload->>'min_points')::integer,-1)<0
    OR COALESCE(p_payload->>'status','active') NOT IN ('active','inactive','archived') THEN RAISE EXCEPTION 'Invalid tier'; END IF;
  IF p_payload->>'name'='bronze' AND (p_payload->>'min_points')::integer<>0 THEN RAISE EXCEPTION 'Bronze starts at zero'; END IF;
  PERFORM 1 FROM public.loyalty_tiers ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.loyalty_tiers t WHERE t.id IS DISTINCT FROM p_tier_id AND
    ((public.miamz_tier_rank(t.name)<public.miamz_tier_rank(p_payload->>'name') AND t.min_points >= (p_payload->>'min_points')::integer)
    OR (public.miamz_tier_rank(t.name)>public.miamz_tier_rank(p_payload->>'name') AND t.min_points <= (p_payload->>'min_points')::integer))) THEN
    RAISE EXCEPTION 'Tier thresholds must increase'; END IF;

  IF COALESCE((p_payload ->> 'multiplier')::numeric, 1) <= 0 OR COALESCE((p_payload ->> 'multiplier')::numeric, 1) > 5 THEN
    RAISE EXCEPTION 'multiplier is invalid';
  END IF;

  IF v_tier_id IS NOT NULL THEN
    SELECT to_jsonb(lt.*) INTO v_old_data FROM public.loyalty_tiers lt WHERE id = v_tier_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tier not found'; END IF;
    UPDATE public.loyalty_tiers
    SET
      name = p_payload ->> 'name',
      min_points = COALESCE((p_payload ->> 'min_points')::integer, 0),
      multiplier = COALESCE((p_payload ->> 'multiplier')::numeric, 1),
      benefits = COALESCE(p_payload -> 'benefits', '{}'::jsonb),
      status = COALESCE(NULLIF(p_payload ->> 'status', ''), 'active')
    WHERE id = v_tier_id;
  ELSE
    INSERT INTO public.loyalty_tiers (name, min_points, multiplier, benefits, status)
    VALUES (
      p_payload ->> 'name',
      COALESCE((p_payload ->> 'min_points')::integer, 0),
      COALESCE((p_payload ->> 'multiplier')::numeric, 1),
      COALESCE(p_payload -> 'benefits', '{}'::jsonb),
      COALESCE(NULLIF(p_payload ->> 'status', ''), 'active')
    )
    RETURNING id INTO v_tier_id;
  END IF;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('loyalty_tier', v_tier_id, CASE WHEN p_tier_id IS NULL THEN 'create' ELSE 'update' END, p_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), p_payload);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_save_loyalty_tier', 'loyalty_tier', v_tier_id, COALESCE(v_old_data, '{}'::jsonb), p_payload);

  RETURN v_tier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_loyalty_tier(p_tier_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data jsonb;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  PERFORM public.assert_commercial_demo_production_rpc_allowed();
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT to_jsonb(lt.*) INTO v_old_data FROM public.loyalty_tiers lt WHERE id = p_tier_id;
  UPDATE public.loyalty_tiers SET status = 'archived' WHERE id = p_tier_id;

  INSERT INTO public.admin_loyalty_change_history (entity_type, entity_id, action, reason, admin_user_id, old_data, new_data)
  VALUES ('loyalty_tier', p_tier_id, 'archive', v_reason, auth.uid(), COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived'));

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_archive_loyalty_tier', 'loyalty_tier', p_tier_id, COALESCE(v_old_data, '{}'::jsonb), jsonb_build_object('status', 'archived', 'reason', v_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_loyalty_tier(uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_archive_loyalty_tier(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_loyalty_tier(uuid,jsonb,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_archive_loyalty_tier(uuid,text) TO authenticated,service_role;
COMMIT;
