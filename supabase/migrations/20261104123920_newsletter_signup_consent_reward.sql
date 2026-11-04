-- Newsletter TOK: explicit opt-in, confirmed subscribers and idempotent welcome Miamz.
-- No subscription or bonus is inferred from accepting the general terms.
CREATE TABLE public.newsletter_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_source text NOT NULL,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  welcome_eligible boolean NOT NULL DEFAULT false,
  welcome_awarded_at timestamptz
);

ALTER TABLE public.newsletter_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.newsletter_subscriptions TO authenticated;

CREATE POLICY newsletter_subscriptions_read_own
  ON public.newsletter_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- A successful insert into the transaction history is the single award authority.
CREATE UNIQUE INDEX loyalty_newsletter_welcome_once_per_user
  ON public.loyalty_transactions(user_id)
  WHERE transaction_type = 'newsletter_welcome';

CREATE FUNCTION public._activate_tok_newsletter(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_subscription public.newsletter_subscriptions%ROWTYPE;
  v_awarded uuid;
BEGIN
  SELECT * INTO v_subscription
  FROM public.newsletter_subscriptions
  WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND OR v_subscription.unsubscribed_at IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id AND email_confirmed_at IS NOT NULL
    )
  THEN
    RETURN;
  END IF;

  UPDATE public.newsletter_subscriptions
  SET confirmed_at = COALESCE(confirmed_at, now())
  WHERE user_id = p_user_id;

  -- The subscriber expressly requests email. Preserve unrelated preferences.
  INSERT INTO public.notification_preferences(user_id, categories)
  VALUES (
    p_user_id,
    '{"system":true,"product":true,"transactional":true,"marketing":true}'::jsonb
  )
  ON CONFLICT (user_id) DO UPDATE
  SET categories = COALESCE(public.notification_preferences.categories, '{}'::jsonb)
                     || '{"marketing":true}'::jsonb,
      channels = COALESCE(public.notification_preferences.channels, '{}'::jsonb)
                   || '{"email":true}'::jsonb;

  -- Bonus only for an explicitly opted-in *new* account from the welcome offer.
  -- LoyaltyStatus and the rest of the app use profiles.loyalty_points, not
  -- loyalty_accounts (whose FK points to a different, sparse user_profiles table).
  IF v_subscription.welcome_eligible AND v_subscription.welcome_awarded_at IS NULL THEN
    INSERT INTO public.loyalty_transactions (
      user_id, amount, transaction_type, description, metadata
    )
    SELECT p_user_id, 500, 'newsletter_welcome',
           'Bonus de bienvenue newsletter TOK',
           jsonb_build_object('source', 'home_offer', 'consented_at', v_subscription.consented_at)
    FROM public.profiles p
    WHERE p.user_id = p_user_id
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_awarded;

    IF v_awarded IS NOT NULL THEN
      UPDATE public.profiles
      SET loyalty_points = COALESCE(loyalty_points, 0) + 500
      WHERE user_id = p_user_id;
    END IF;

    IF v_awarded IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.loyalty_transactions
      WHERE user_id = p_user_id AND transaction_type = 'newsletter_welcome'
    ) THEN
      UPDATE public.newsletter_subscriptions
      SET welcome_awarded_at = COALESCE(welcome_awarded_at, now())
      WHERE user_id = p_user_id;
    END IF;
  END IF;
END;
$$;

-- Never make the privileged helper remotely callable: trigger/RPC only.
REVOKE ALL ON FUNCTION public._activate_tok_newsletter(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._activate_tok_newsletter(uuid) TO service_role;

CREATE FUNCTION public.capture_tok_newsletter_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Capture the request exactly once, at account creation. Subsequent changes
  -- to user-editable auth metadata cannot grant consent or welcome points.
  IF COALESCE(NEW.raw_user_meta_data ->> 'newsletter_opt_in', '') = 'true'
     AND NEW.raw_user_meta_data ->> 'signup_intent' = 'client' THEN
    INSERT INTO public.newsletter_subscriptions (
      user_id, consented_at, consent_source, welcome_eligible
    ) VALUES (
      NEW.id, now(),
      CASE WHEN NEW.raw_user_meta_data ->> 'newsletter_source' = 'home_offer'
        THEN 'home_offer' ELSE 'signup' END,
      NEW.raw_user_meta_data ->> 'newsletter_source' = 'home_offer'
    );
    -- Also supports projects where email confirmation is disabled.
    IF NEW.email_confirmed_at IS NOT NULL THEN
      PERFORM public._activate_tok_newsletter(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_tok_newsletter_signup()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_newsletter_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.capture_tok_newsletter_signup();

CREATE FUNCTION public.confirm_tok_newsletter_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public._activate_tok_newsletter(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_tok_newsletter_signup()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_newsletter_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.confirm_tok_newsletter_signup();

-- Existing clients can opt in without creating another account. No welcome
-- reward can be claimed through this endpoint.
CREATE FUNCTION public.subscribe_tok_newsletter()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_user_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Confirm your email address first' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.newsletter_subscriptions (
    user_id, consent_source, consented_at, confirmed_at, unsubscribed_at, welcome_eligible
  ) VALUES (v_user_id, 'existing_account', now(), now(), NULL, false)
  ON CONFLICT (user_id) DO UPDATE SET
    consent_source = 'existing_account',
    consented_at = now(),
    unsubscribed_at = NULL;

  PERFORM public._activate_tok_newsletter(v_user_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_tok_newsletter() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscribe_tok_newsletter() TO authenticated, service_role;

-- The existing profile Marketing switch is the unsubscribe / resubscribe
-- control. Any later opt-out must suppress future marketing deliveries.
CREATE FUNCTION public.sync_tok_newsletter_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_old boolean;
  v_new boolean;
BEGIN
  v_old := COALESCE((OLD.categories ->> 'marketing')::boolean, false);
  v_new := COALESCE((NEW.categories ->> 'marketing')::boolean, false);
  IF v_old = v_new THEN RETURN NEW; END IF;

  IF NOT v_new THEN
    UPDATE public.newsletter_subscriptions
      SET unsubscribed_at = COALESCE(unsubscribed_at, now())
      WHERE user_id = NEW.user_id;
  ELSIF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.user_id AND email_confirmed_at IS NOT NULL
  ) THEN
    -- Consent when enabling the existing profile marketing toggle.
    INSERT INTO public.newsletter_subscriptions (
      user_id, consent_source, confirmed_at, welcome_eligible
    ) VALUES (NEW.user_id, 'profile', now(), false)
    ON CONFLICT (user_id) DO UPDATE SET
      consent_source = CASE
        WHEN public.newsletter_subscriptions.unsubscribed_at IS NOT NULL THEN 'profile'
        ELSE public.newsletter_subscriptions.consent_source
      END,
      consented_at = CASE
        WHEN public.newsletter_subscriptions.unsubscribed_at IS NOT NULL THEN now()
        ELSE public.newsletter_subscriptions.consented_at
      END,
      unsubscribed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tok_newsletter_preference()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_tok_newsletter_preference_updated
AFTER UPDATE OF categories ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.sync_tok_newsletter_preference();
