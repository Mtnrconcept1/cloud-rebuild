DO $$
DECLARE
  v_plan_id uuid;
BEGIN
  SELECT id
  INTO v_plan_id
  FROM public.user_subscription_plans
  WHERE lower(trim(name)) IN ('tok one', 'tok-one', 'miamz+')
  ORDER BY
    CASE WHEN status IN ('active', 'available', 'live') THEN 0 ELSE 1 END,
    updated_at DESC NULLS LAST,
    created_at DESC NULLS LAST
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.user_subscription_plans (
      name,
      description,
      price_monthly,
      price_yearly,
      currency,
      free_delivery_min_order,
      status,
      stripe_product_id
    )
    VALUES (
      'Tok One',
      'Abonnement premium Tok One avec livraison gratuite, reductions exclusives et acces prioritaire aux experiences.',
      9.90,
      89.90,
      'CHF',
      0,
      'active',
      NULL
    )
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE public.user_subscription_plans
    SET
      name = 'Tok One',
      description = COALESCE(
        NULLIF(trim(description), ''),
        'Abonnement premium Tok One avec livraison gratuite, reductions exclusives et acces prioritaire aux experiences.'
      ),
      price_monthly = CASE WHEN price_monthly > 0 THEN price_monthly ELSE 9.90 END,
      price_yearly = CASE WHEN price_yearly > 0 THEN price_yearly ELSE 89.90 END,
      currency = 'CHF',
      free_delivery_min_order = COALESCE(free_delivery_min_order, 0),
      status = 'active',
      updated_at = now()
    WHERE id = v_plan_id;
  END IF;

  INSERT INTO public.subscription_benefits (plan_id, benefit_type, value)
  SELECT v_plan_id, benefit_type, value
  FROM (
    VALUES
      ('discount_percentage', jsonb_build_object('percentage', 20)),
      ('free_delivery', jsonb_build_object('min_order', 0)),
      ('chef_table_priority', jsonb_build_object('enabled', true)),
      ('flash_early_access', jsonb_build_object('enabled', true)),
      ('priority_support', jsonb_build_object('enabled', true)),
      ('surprise_offers', jsonb_build_object('enabled', true))
  ) AS defaults(benefit_type, value)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subscription_benefits existing
    WHERE existing.plan_id = v_plan_id
      AND existing.benefit_type = defaults.benefit_type
  );
END $$;
