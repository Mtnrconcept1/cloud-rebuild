-- Gate restaurateur approval on the selected launch pack and subscription payment.
-- The signup application already carries restaurant_id and selected onboarding
-- choices in metadata; the actual paid state is verified from server-owned tables.

CREATE TABLE IF NOT EXISTS public.restaurant_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly_chf numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'chf',
  campaign_credit_chf numeric(10, 2) NOT NULL DEFAULT 0,
  ai_tool_credits integer NOT NULL DEFAULT 0,
  ai_photo_credits integer NOT NULL DEFAULT 0,
  monthly_conversation_limit integer NOT NULL DEFAULT 50,
  monthly_text_tool_limit integer NOT NULL DEFAULT 20,
  monthly_image_limit integer NOT NULL DEFAULT 0,
  monthly_premium_image_limit integer NOT NULL DEFAULT 0,
  monthly_voice_minutes_limit integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_subscription_plans_slug_check CHECK (slug IN ('starter', 'pro', 'premium', 'elite')),
  CONSTRAINT restaurant_subscription_plans_currency_check CHECK (currency = lower(currency)),
  CONSTRAINT restaurant_subscription_plans_price_check CHECK (price_monthly_chf > 0)
);

ALTER TABLE public.restaurant_subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_subscription_plans_public_active_read"
  ON public.restaurant_subscription_plans;
CREATE POLICY "restaurant_subscription_plans_public_active_read"
  ON public.restaurant_subscription_plans
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "restaurant_subscription_plans_admin_all"
  ON public.restaurant_subscription_plans;
CREATE POLICY "restaurant_subscription_plans_admin_all"
  ON public.restaurant_subscription_plans
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.restaurant_subscription_plans TO anon, authenticated;

INSERT INTO public.restaurant_subscription_plans (
  slug,
  name,
  description,
  price_monthly_chf,
  campaign_credit_chf,
  ai_tool_credits,
  ai_photo_credits,
  monthly_conversation_limit,
  monthly_text_tool_limit,
  monthly_image_limit,
  monthly_premium_image_limit,
  monthly_voice_minutes_limit,
  features,
  position
)
VALUES
(
  'starter',
  'TOK Starter',
  'Services essentiels pour lancer le restaurant, suivre les commandes et tester les premiers outils IA.',
  69.00,
  25.00,
  80,
  10,
  120,
  80,
  10,
  2,
  0,
  '["Dashboard restaurateur", "Campagnes simples", "Assistant IA essentiel", "Retouches photo IA de base"]'::jsonb,
  1
),
(
  'pro',
  'TOK Pro',
  'Croissance locale avec plus de credits campagnes, assistant IA operationnel et retouches photo regulieres.',
  129.00,
  75.00,
  220,
  35,
  300,
  220,
  35,
  8,
  30,
  '["Campagnes locales", "Assistant IA ventes et avis", "Retouches photo IA", "Optimisation menu"]'::jsonb,
  2
),
(
  'premium',
  'TOK Premium',
  'Accompagnement premium avec credits publicitaires renforces, IA avancee et studio photo IA.',
  199.00,
  150.00,
  500,
  80,
  700,
  500,
  80,
  20,
  90,
  '["Campagnes sponsorisees", "Assistant IA avance", "Studio photo IA", "Insights compta et performance"]'::jsonb,
  3
),
(
  'elite',
  'TOK Elite',
  'Pack restaurateur haut niveau avec credits importants, IA premium, retouches photo avancees et priorite support.',
  499.00,
  450.00,
  1500,
  250,
  2000,
  1500,
  250,
  80,
  240,
  '["Operations Center premium", "Campagnes haute visibilite", "Assistant IA premium", "Retouches photo IA premium", "Support prioritaire"]'::jsonb,
  4
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_monthly_chf = EXCLUDED.price_monthly_chf,
    currency = EXCLUDED.currency,
    campaign_credit_chf = EXCLUDED.campaign_credit_chf,
    ai_tool_credits = EXCLUDED.ai_tool_credits,
    ai_photo_credits = EXCLUDED.ai_photo_credits,
    monthly_conversation_limit = EXCLUDED.monthly_conversation_limit,
    monthly_text_tool_limit = EXCLUDED.monthly_text_tool_limit,
    monthly_image_limit = EXCLUDED.monthly_image_limit,
    monthly_premium_image_limit = EXCLUDED.monthly_premium_image_limit,
    monthly_voice_minutes_limit = EXCLUDED.monthly_voice_minutes_limit,
    features = EXCLUDED.features,
    is_active = true,
    position = EXCLUDED.position,
    updated_at = now();

ALTER TABLE public.restaurant_ai_subscriptions
  ADD COLUMN IF NOT EXISTS restaurant_subscription_plan_id uuid REFERENCES public.restaurant_subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS monthly_campaign_credit_chf numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_ai_tool_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_photo_retouch_credits integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_ai_subscriptions_billing_period_check'
      AND conrelid = 'public.restaurant_ai_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.restaurant_ai_subscriptions
      ADD CONSTRAINT restaurant_ai_subscriptions_billing_period_check
      CHECK (billing_period = 'monthly');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_ai_subscriptions_stripe_mode_check'
      AND conrelid = 'public.restaurant_ai_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.restaurant_ai_subscriptions
      ADD CONSTRAINT restaurant_ai_subscriptions_stripe_mode_check
      CHECK (stripe_mode IN ('live', 'test'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_ai_subscriptions_stripe_subscription_id
  ON public.restaurant_ai_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_ai_subscriptions_stripe_checkout_session_id
  ON public.restaurant_ai_subscriptions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready(
  p_application_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.signup_applications%ROWTYPE;
  v_metadata jsonb;
  v_restaurant_id uuid;
  v_launch_pack_id uuid;
  v_subscription_plan_id uuid;
  v_subscription_plan_slug text;
  v_pack_ready boolean := false;
  v_subscription_ready boolean := false;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_application
  FROM public.signup_applications
  WHERE id = p_application_id;

  IF NOT FOUND OR v_application.requested_role <> 'restaurateur' THEN
    RETURN false;
  END IF;

  v_metadata := COALESCE(v_application.metadata, '{}'::jsonb);

  BEGIN
    v_restaurant_id := NULLIF(v_metadata->>'restaurant_id', '')::uuid;
    v_launch_pack_id := NULLIF(v_metadata->>'selected_launch_pack_id', '')::uuid;
    v_subscription_plan_id := NULLIF(v_metadata->>'selected_subscription_plan_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF v_restaurant_id IS NULL OR v_launch_pack_id IS NULL OR v_subscription_plan_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT rsp.slug INTO v_subscription_plan_slug
  FROM public.restaurant_subscription_plans rsp
  WHERE rsp.id = v_subscription_plan_id
    AND rsp.is_active = true;

  IF v_subscription_plan_slug IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_launch_packs rlp
    WHERE rlp.restaurant_id = v_restaurant_id
      AND rlp.pack_id = v_launch_pack_id
      AND rlp.status IN ('paid', 'in_progress', 'completed')
      AND rlp.purchased_by = v_application.user_id
  ) INTO v_pack_ready;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_ai_subscriptions ras
    WHERE ras.restaurant_id = v_restaurant_id
      AND ras.restaurant_subscription_plan_id = v_subscription_plan_id
      AND ras.plan = v_subscription_plan_slug
      AND ras.status IN ('active', 'trialing')
      AND ras.current_period_end > now()
  ) INTO v_subscription_ready;

  RETURN v_pack_ready AND v_subscription_ready;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (application_id uuid, application_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_application public.signup_applications%ROWTYPE;
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_restaurant_id uuid;
  v_applicant_email text;
  v_role_label text;
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT * INTO v_application FROM public.signup_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  IF v_next_status = 'approved'
    AND v_application.requested_role = 'restaurateur'
    AND public.signup_restaurateur_onboarding_payment_ready(p_application_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding payment required before approval';
  END IF;

  UPDATE public.signup_applications
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.signup_application_documents
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE WHEN v_next_status = 'approved' THEN NULL
                              ELSE NULLIF(trim(COALESCE(p_review_note, '')), '') END,
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE application_id = p_application_id;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role = 'courier' THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_application.user_id AND role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier' THEN
    UPDATE public.couriers
    SET status = CASE WHEN v_next_status = 'approved' THEN 'approved'
                      WHEN v_next_status = 'rejected' THEN 'rejected'
                      ELSE 'pending_approval' END,
        is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
        updated_at = now()
    WHERE user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur' THEN
    v_restaurant_id := NULLIF(v_application.metadata->>'restaurant_id', '')::uuid;
    IF v_restaurant_id IS NULL THEN
      SELECT id INTO v_restaurant_id FROM public.restaurants
      WHERE owner_id = v_application.user_id ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants
      SET status = CASE WHEN v_next_status = 'approved' THEN 'active'
                        WHEN v_next_status = 'rejected' THEN 'rejected'
                        ELSE 'needs_changes' END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE id = v_restaurant_id;
    END IF;
  END IF;

  SELECT email INTO v_applicant_email FROM auth.users WHERE id = v_application.user_id;
  IF v_applicant_email IS NOT NULL THEN
    v_role_label := CASE WHEN v_application.requested_role = 'courier' THEN 'livreur' ELSE 'restaurateur' END;
    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_role_label || ' est valide'
        WHEN 'needs_changes' THEN 'Corrections demandees sur votre dossier ' || v_role_label
        ELSE 'Votre demande ' || v_role_label || ' a ete refusee'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Bonne nouvelle : votre dossier ' || v_role_label ||
          ' a ete approuve. Vous pouvez desormais acceder a votre espace.'
        WHEN 'needs_changes' THEN 'Votre dossier necessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'voir le detail dans l''application') ||
          '. Reprenez votre dossier dans la rubrique onboarding.'
        ELSE 'Votre demande ' || v_role_label || ' a ete refusee.' ||
          CASE WHEN NULLIF(trim(p_review_note), '') IS NOT NULL THEN ' ' || trim(p_review_note) ELSE '' END
      END,
      jsonb_build_object('application_id', p_application_id, 'kind', 'signup_decision', 'status', v_next_status)
    );
  END IF;

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
