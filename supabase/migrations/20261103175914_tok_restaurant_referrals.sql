-- TOK restaurant-to-restaurant referral program.
-- Credits are only ever issued by the internal subscription reconciliation worker.
CREATE TABLE public.restaurant_referral_codes (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT upper(left(replace(gen_random_uuid()::text, '-', ''), 20)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_referral_code_format CHECK (code ~ '^[A-F0-9]{20}$')
);

CREATE TABLE public.restaurant_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  referred_restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id),
  referred_signup_application_id uuid NOT NULL REFERENCES public.signup_applications(id),
  referral_code text NOT NULL,
  referred_restaurant_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualifying', 'processing', 'credited', 'rejected', 'review_required')),
  first_paid_at timestamptz,
  first_paid_invoice_id text,
  eligible_at timestamptz,
  credit_cents integer CHECK (credit_cents > 0),
  credit_stripe_customer_id text,
  stripe_balance_transaction_id text UNIQUE,
  processing_started_at timestamptz,
  credited_at timestamptz,
  rejected_reason text,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_referrals_distinct CHECK (referrer_restaurant_id <> referred_restaurant_id)
);
CREATE INDEX restaurant_referrals_by_referrer ON public.restaurant_referrals(referrer_restaurant_id, created_at DESC);
CREATE INDEX restaurant_referrals_due ON public.restaurant_referrals(eligible_at, status)
  WHERE status IN ('qualifying', 'processing');
CREATE INDEX restaurant_referrals_first_invoice ON public.restaurant_referrals(first_paid_invoice_id)
  WHERE first_paid_invoice_id IS NOT NULL;

ALTER TABLE public.restaurant_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_referral_codes, public.restaurant_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.restaurant_referral_codes, public.restaurant_referrals TO service_role;

-- Only the owning restaurant can access its own code and reward ledger.
-- A SECURITY DEFINER RPC avoids exposing referred owner data in the Data API.
CREATE FUNCTION public.get_restaurant_referral_dashboard(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id AND r.owner_id = (SELECT auth.uid())
      AND COALESCE(r.is_demo, false) = false
      AND COALESCE(r.is_directory_listing, false) = false
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'restaurant_referrals_forbidden';
  END IF;

  INSERT INTO public.restaurant_referral_codes(restaurant_id)
  VALUES (p_restaurant_id)
  ON CONFLICT (restaurant_id) DO NOTHING;
  SELECT c.code INTO v_code FROM public.restaurant_referral_codes c
  WHERE c.restaurant_id = p_restaurant_id;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT ref.created_at,
      jsonb_build_object(
        'id', ref.id,
        'restaurant_name', ref.referred_restaurant_name,
        'status', ref.status,
        'created_at', ref.created_at,
        'eligible_at', ref.eligible_at,
        'credit_cents', CASE WHEN ref.status = 'credited' THEN ref.credit_cents ELSE NULL END,
        'credited_at', ref.credited_at
      ) AS row_data
    FROM public.restaurant_referrals ref
    WHERE ref.referrer_restaurant_id = p_restaurant_id
    ORDER BY ref.created_at DESC
    LIMIT 100
  ) page;
  SELECT jsonb_build_object(
    'total', count(*),
    'credited', count(*) FILTER (WHERE status = 'credited'),
    'in_progress', count(*) FILTER (WHERE status IN ('pending', 'qualifying', 'processing')),
    'saved_cents', COALESCE(sum(credit_cents) FILTER (WHERE status = 'credited'), 0)
  ) INTO v_stats
  FROM public.restaurant_referrals WHERE referrer_restaurant_id = p_restaurant_id;
  RETURN jsonb_build_object('code', v_code, 'stats', v_stats, 'referrals', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.get_restaurant_referral_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_referral_dashboard(uuid) TO authenticated;

CREATE FUNCTION public.is_valid_restaurant_referral_code(p_code text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT length(COALESCE(p_code,'')) = 20 AND EXISTS (
    SELECT 1 FROM public.restaurant_referral_codes c
    JOIN public.restaurants r ON r.id = c.restaurant_id
    WHERE c.code = upper(trim(p_code))
      AND COALESCE(r.is_demo, false) = false
      AND COALESCE(r.is_directory_listing, false) = false
      AND r.is_active = true
      AND r.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_valid_restaurant_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_restaurant_referral_code(text) TO anon, authenticated;

-- Capture the referral only once, at confirmed restaurateur signup, AFTER the
-- existing sync_signup_application RPC has created the restaurant and written its ID.
CREATE FUNCTION public.capture_restaurant_signup_referral()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_referred uuid;
  v_referrer uuid;
  v_restaurant public.restaurants%ROWTYPE;
BEGIN
  IF NEW.requested_role::text <> 'restaurateur' THEN RETURN NEW; END IF;
  v_code := upper(trim(COALESCE(NEW.metadata->>'restaurant_referral_code', '')));
  IF v_code !~ '^[A-F0-9]{20}$' OR (NEW.metadata->>'restaurant_id') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RETURN NEW;
  END IF;
  v_referred := (NEW.metadata->>'restaurant_id')::uuid;
  SELECT * INTO v_restaurant FROM public.restaurants
  WHERE id = v_referred AND owner_id = NEW.user_id
    AND COALESCE(is_demo, false) = false
    AND COALESCE(is_directory_listing, false) = false;
  IF NOT FOUND OR v_restaurant.created_at < NEW.submitted_at - interval '7 days'
    OR EXISTS (
      SELECT 1 FROM public.restaurant_subscription_payment_events e
      WHERE e.restaurant_id = v_referred AND e.event_type = 'invoice_paid'
    )
  THEN
    RETURN NEW;
  END IF;
  SELECT c.restaurant_id INTO v_referrer
  FROM public.restaurant_referral_codes c
  JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE c.code = v_code AND r.is_active = true AND r.status = 'active'
    AND COALESCE(r.is_demo, false) = false
    AND COALESCE(r.is_directory_listing, false) = false
    AND r.owner_id <> NEW.user_id;
  IF v_referrer IS NULL THEN RETURN NEW; END IF;

  -- Same business registration or tax number cannot refer itself under another account.
  IF EXISTS (
    SELECT 1 FROM public.signup_applications previous
    WHERE previous.requested_role::text = 'restaurateur'
      AND previous.metadata->>'restaurant_id' = v_referrer::text
      AND (
        (NULLIF(trim(NEW.business_registration_number), '') IS NOT NULL
          AND lower(trim(previous.business_registration_number)) = lower(trim(NEW.business_registration_number)))
        OR (NULLIF(trim(NEW.tax_id), '') IS NOT NULL
          AND lower(trim(previous.tax_id)) = lower(trim(NEW.tax_id)))
      )
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.restaurant_referrals(
    referrer_restaurant_id, referred_restaurant_id, referred_signup_application_id,
    referral_code, referred_restaurant_name
  )
  VALUES (v_referrer, v_referred, NEW.id, v_code, v_restaurant.name)
  ON CONFLICT (referred_restaurant_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_restaurant_signup_referral() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tok_capture_restaurant_signup_referral ON public.signup_applications;
CREATE TRIGGER tok_capture_restaurant_signup_referral
  AFTER INSERT OR UPDATE OF metadata ON public.signup_applications
  FOR EACH ROW EXECUTE FUNCTION public.capture_restaurant_signup_referral();

-- The authoritative Stripe invoice-paid RPC writes this event only after an
-- actual paid invoice. Duplicated webhook events cannot qualify a referral twice.
CREATE FUNCTION public.qualify_restaurant_referral_from_paid_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_type = 'invoice_paid'
    AND NEW.restaurant_id IS NOT NULL
    AND NEW.stripe_invoice_id IS NOT NULL
    AND NEW.metadata->>'matched' = 'true'
    AND NEW.metadata->>'stripe_mode' = 'live'
    AND NEW.metadata->>'currency' = 'CHF'
    AND COALESCE((NEW.metadata->>'amount_paid_cents')::bigint, 0) > 0
    AND (NEW.metadata->>'activation_payment' = 'true'
      OR NEW.metadata->>'billing_reason' = 'subscription_create')
  THEN
    UPDATE public.restaurant_referrals
    SET status = 'qualifying',
        first_paid_at = COALESCE(NULLIF(NEW.metadata->>'paid_at', '')::timestamptz, NEW.processed_at),
        first_paid_invoice_id = NEW.stripe_invoice_id,
        eligible_at = COALESCE(NULLIF(NEW.metadata->>'paid_at', '')::timestamptz, NEW.processed_at) + interval '30 days',
        updated_at = now()
    WHERE referred_restaurant_id = NEW.restaurant_id
      AND status = 'pending'
      AND first_paid_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.qualify_restaurant_referral_from_paid_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tok_qualify_restaurant_referral_paid ON public.restaurant_subscription_payment_events;
CREATE TRIGGER tok_qualify_restaurant_referral_paid
  AFTER INSERT OR UPDATE OF metadata ON public.restaurant_subscription_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.qualify_restaurant_referral_from_paid_event();

-- This privileged RPC makes a single worker the owner of a Stripe credit attempt.
-- Any ambiguous Stripe error stays in "processing" for reconciliation, never blind retry.
CREATE FUNCTION public.claim_restaurant_referral_credit(p_referral_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref public.restaurant_referrals%ROWTYPE;
  v_sub public.restaurant_ai_subscriptions%ROWTYPE;
  v_customer text;
  v_amount integer;
BEGIN
  IF (auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  SELECT * INTO v_ref FROM public.restaurant_referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND OR v_ref.status <> 'qualifying' OR v_ref.eligible_at > now()
     OR v_ref.first_paid_invoice_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'not_qualifying');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.restaurant_subscription_payment_events reverse
    WHERE reverse.restaurant_id = v_ref.referred_restaurant_id
      AND reverse.event_type = 'payment_reversed'
      AND reverse.stripe_invoice_id = v_ref.first_paid_invoice_id
  ) THEN
    UPDATE public.restaurant_referrals SET status = 'rejected',
      rejected_reason = 'first_payment_reversed', updated_at = now()
    WHERE id = p_referral_id;
    RETURN jsonb_build_object('ready', false, 'reason', 'first_payment_reversed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants referrer
    JOIN public.restaurants referred ON referred.id = v_ref.referred_restaurant_id
    JOIN public.restaurant_ai_subscriptions sub ON sub.restaurant_id = referred.id
    WHERE referrer.id = v_ref.referrer_restaurant_id
      AND referrer.is_active = true AND referrer.status = 'active'
      AND referred.is_active = true AND referred.status = 'active'
      AND COALESCE(referrer.is_demo, false) = false
      AND COALESCE(referred.is_demo, false) = false
      AND sub.status = 'active' AND sub.stripe_mode = 'live'
      AND sub.stripe_subscription_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'restaurant_or_filleul_inactive');
  END IF;

  SELECT * INTO v_sub FROM public.restaurant_ai_subscriptions
  WHERE restaurant_id = v_ref.referrer_restaurant_id
    AND status = 'active' AND stripe_mode = 'live'
    AND stripe_subscription_id IS NOT NULL
    AND price_monthly_cents_snapshot BETWEEN 1 AND 1000000
  ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'parrain_subscription_inactive');
  END IF;
  v_amount := v_sub.price_monthly_cents_snapshot;
  SELECT stripe_customer_id INTO v_customer
  FROM public.restaurant_subscription_payment_methods
  WHERE restaurant_id = v_ref.referrer_restaurant_id
    AND stripe_mode = 'live' AND stripe_customer_id IS NOT NULL
  ORDER BY ready_at DESC NULLS LAST LIMIT 1;
  IF v_customer IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'reason', 'parrain_customer_missing');
  END IF;

  UPDATE public.restaurant_referrals
  SET status = 'processing', credit_cents = v_amount,
      credit_stripe_customer_id = v_customer,
      processing_started_at = now(), updated_at = now()
  WHERE id = p_referral_id;
  RETURN jsonb_build_object('ready', true, 'id', p_referral_id,
    'customer_id', v_customer, 'credit_cents', v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_restaurant_referral_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_referral_credit(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';


-- Support operators can inspect the complete ledger but not edit Stripe transactions.
CREATE FUNCTION public.list_admin_restaurant_referrals(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR
    NOT COALESCE(public.has_role((SELECT auth.uid()), 'admin'::public.app_role), false)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT ref.created_at,
      jsonb_build_object(
        'id', ref.id,
        'parrain', parrain.name,
        'filleul', referred.name,
        'status', ref.status,
        'created_at', ref.created_at,
        'first_paid_at', ref.first_paid_at,
        'eligible_at', ref.eligible_at,
        'credit_cents', ref.credit_cents,
        'credited_at', ref.credited_at,
        'stripe_balance_transaction_id', ref.stripe_balance_transaction_id,
        'rejected_reason', ref.rejected_reason
      ) item
    FROM public.restaurant_referrals ref
    JOIN public.restaurants parrain ON parrain.id = ref.referrer_restaurant_id
    JOIN public.restaurants referred ON referred.id = ref.referred_restaurant_id
    ORDER BY ref.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200)
  ) items;

  SELECT jsonb_build_object(
    'total', count(*),
    'credited', count(*) FILTER (WHERE status='credited'),
    'in_progress', count(*) FILTER (WHERE status IN ('pending','qualifying','processing')),
    'review_required', count(*) FILTER (WHERE status='review_required' OR
      (status='processing' AND processing_started_at < now() - interval '1 day')),
    'credited_cents', COALESCE(sum(credit_cents) FILTER (WHERE status='credited'),0)
  ) INTO v_summary FROM public.restaurant_referrals;
  RETURN jsonb_build_object('rows', v_rows, 'stats', v_summary);
END;
$$;
REVOKE ALL ON FUNCTION public.list_admin_restaurant_referrals(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_restaurant_referrals(integer) TO authenticated;

CREATE FUNCTION public.reject_admin_restaurant_referral(p_referral_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR
    NOT COALESCE(public.has_role((SELECT auth.uid()), 'admin'::public.app_role), false)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;
  IF length(trim(COALESCE(p_reason,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_length_invalid';
  END IF;
  UPDATE public.restaurant_referrals
  SET status='rejected', rejected_reason=trim(p_reason),
      rejected_at=now(), rejected_by=(SELECT auth.uid()), updated_at=now()
  WHERE id=p_referral_id AND status IN ('pending','qualifying');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_admin_restaurant_referral(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_admin_restaurant_referral(uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
