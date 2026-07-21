BEGIN;

-- A restaurant created outside the reviewed onboarding must start private.
ALTER TABLE public.restaurants
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN is_active SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.restaurant_is_approved_for_publication(
  p_restaurant_id uuid,
  p_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.signup_applications AS application
    WHERE application.user_id = p_owner_id
      AND application.requested_role = 'restaurateur'::public.app_role
      AND application.status = 'approved'
      AND application.reviewed_by IS NOT NULL
      AND application.reviewed_at IS NOT NULL
      AND application.metadata->>'restaurant_id' = p_restaurant_id::text
  );
$$;

-- Compatibility helper for internal diagnostics. The trigger below always uses
-- the two-argument variant so a simultaneous owner transfer is checked against
-- NEW.owner_id rather than the row that still exists before the UPDATE.
CREATE OR REPLACE FUNCTION public.restaurant_is_approved_for_publication(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.restaurant_is_approved_for_publication(
      restaurant.id,
      restaurant.owner_id
    )
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_demo IS FALSE
  ), false);
$$;

REVOKE ALL ON FUNCTION public.restaurant_is_approved_for_publication(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.restaurant_is_approved_for_publication(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_restaurant_moderation_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_service boolean := COALESCE(auth.role() = 'service_role', false);
  v_actor_is_admin boolean := COALESCE(public.has_role(v_actor_id, 'admin'::public.app_role), false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_actor_id IS NOT NULL AND NOT v_actor_is_admin AND NOT v_actor_is_service THEN
      NEW.owner_id := v_actor_id;
      NEW.status := 'pending';
      NEW.is_active := false;
      NEW.is_demo := false;

      -- Server-owned and financial fields cannot be pre-seeded on a private
      -- profile and become trusted merely because the account is later approved.
      NEW.rating := 0;
      NEW.review_count := 0;
      NEW.avg_rating := 0;
      NEW.rating_count := 0;
      NEW.points_multiplier := 1.0;
      NEW.commission_rate := 0.15;
      NEW.search_vector := NULL;
      NEW.avg_delivery_time_min := NULL;
      NEW.dynamic_prep_time_minutes := NULL;
      NEW.is_featured := false;
      NEW.disabled_dashboard_features := ARRAY[]::text[];
      NEW.stripe_account_id := NULL;
      NEW.stripe_connect_details_submitted := false;
      NEW.stripe_connect_charges_enabled := false;
      NEW.stripe_connect_payouts_enabled := false;
      NEW.stripe_connect_requirements_due := ARRAY[]::text[];
      NEW.stripe_connect_disabled_reason := NULL;
      NEW.stripe_connect_onboarding_completed_at := NULL;
      NEW.stripe_connect_last_synced_at := NULL;
      NEW.created_at := now();
      NEW.updated_at := now();
    END IF;
  ELSE
    IF v_actor_id IS NOT NULL AND NOT v_actor_is_admin AND NOT v_actor_is_service THEN
      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.is_active IS DISTINCT FROM OLD.is_active
        OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
        OR NEW.rating IS DISTINCT FROM OLD.rating
        OR NEW.review_count IS DISTINCT FROM OLD.review_count
        OR NEW.avg_rating IS DISTINCT FROM OLD.avg_rating
        OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
        OR NEW.points_multiplier IS DISTINCT FROM OLD.points_multiplier
        OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
        OR NEW.search_vector IS DISTINCT FROM OLD.search_vector
        OR NEW.avg_delivery_time_min IS DISTINCT FROM OLD.avg_delivery_time_min
        OR NEW.dynamic_prep_time_minutes IS DISTINCT FROM OLD.dynamic_prep_time_minutes
        OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
        OR NEW.disabled_dashboard_features IS DISTINCT FROM OLD.disabled_dashboard_features
        OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
        OR NEW.stripe_connect_details_submitted IS DISTINCT FROM OLD.stripe_connect_details_submitted
        OR NEW.stripe_connect_charges_enabled IS DISTINCT FROM OLD.stripe_connect_charges_enabled
        OR NEW.stripe_connect_payouts_enabled IS DISTINCT FROM OLD.stripe_connect_payouts_enabled
        OR NEW.stripe_connect_requirements_due IS DISTINCT FROM OLD.stripe_connect_requirements_due
        OR NEW.stripe_connect_disabled_reason IS DISTINCT FROM OLD.stripe_connect_disabled_reason
        OR NEW.stripe_connect_onboarding_completed_at IS DISTINCT FROM OLD.stripe_connect_onboarding_completed_at
        OR NEW.stripe_connect_last_synced_at IS DISTINCT FROM OLD.stripe_connect_last_synced_at
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'Les champs de publication, de classement, d''abonnement et de paiement sont gérés par le serveur.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- This is an invariant, not merely a transition check. It therefore also
  -- covers an owner transfer of an already-active restaurant and an UPDATE that
  -- changes owner_id while activating the row in the same statement. The old
  -- one-argument form, restaurant_is_approved_for_publication(NEW.id), is not
  -- sufficient here because a BEFORE trigger would read OLD.owner_id.
  IF NEW.is_demo IS FALSE
    AND NEW.is_active IS TRUE
    AND lower(COALESCE(NEW.status, '')) = 'active'
    AND NOT public.restaurant_is_approved_for_publication(NEW.id, NEW.owner_id)
  THEN
    RAISE EXCEPTION 'Le restaurant ne peut être publié qu''après validation du dossier restaurateur.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_restaurant_moderation_state()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS protect_restaurant_moderation_state ON public.restaurants;
CREATE TRIGGER protect_restaurant_moderation_state
BEFORE INSERT OR UPDATE OF
  id,
  owner_id,
  status,
  is_active,
  is_demo,
  rating,
  review_count,
  avg_rating,
  rating_count,
  points_multiplier,
  commission_rate,
  search_vector,
  avg_delivery_time_min,
  dynamic_prep_time_minutes,
  is_featured,
  disabled_dashboard_features,
  stripe_account_id,
  stripe_connect_details_submitted,
  stripe_connect_charges_enabled,
  stripe_connect_payouts_enabled,
  stripe_connect_requirements_due,
  stripe_connect_disabled_reason,
  stripe_connect_onboarding_completed_at,
  stripe_connect_last_synced_at,
  created_at
ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.protect_restaurant_moderation_state();

DROP POLICY IF EXISTS "Owners can manage their restaurants" ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_all ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_select ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_insert ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_update ON public.restaurants;
DROP POLICY IF EXISTS restaurants_owner_delete ON public.restaurants;

CREATE POLICY restaurants_owner_select
ON public.restaurants
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY restaurants_owner_insert
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND is_active IS FALSE
  AND lower(COALESCE(status, '')) = 'pending'
  AND is_demo IS FALSE
);

CREATE POLICY restaurants_owner_update
ON public.restaurants
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY restaurants_owner_delete
ON public.restaurants
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
ON public.restaurants
FOR SELECT
TO anon, authenticated
USING (
  is_active IS TRUE
  AND is_demo IS FALSE
  AND lower(COALESCE(status, '')) = 'active'
);

-- This restrictive helper is shared by menu/media/promotion policies. Pending
-- rows remain readable to their owner/admin, never to a client or anonymous user.
CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT restaurant.is_demo IS FALSE
      AND (
        (
          restaurant.is_active IS TRUE
          AND lower(COALESCE(restaurant.status, '')) = 'active'
        )
        OR restaurant.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_restaurant(uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS hide_unapproved_restaurant_daily_dishes ON public.restaurant_daily_dishes;
CREATE POLICY hide_unapproved_restaurant_daily_dishes
ON public.restaurant_daily_dishes
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (public.can_view_commercial_demo_restaurant(restaurant_id));

-- Owners keep their pending workspace, but a restaurant role is exclusive at
-- onboarding time so a half-created account does not remain in the client space.
CREATE OR REPLACE FUNCTION public.enforce_restaurateur_signup_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_role = 'restaurateur'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'restaurateur'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    DELETE FROM public.user_roles
    WHERE user_id = NEW.user_id
      AND role = 'client'::public.app_role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_restaurateur_signup_role()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_restaurateur_signup_role ON public.signup_applications;
CREATE TRIGGER enforce_restaurateur_signup_role
AFTER INSERT OR UPDATE OF requested_role
ON public.signup_applications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_restaurateur_signup_role();

-- Final moderation decisions require an authenticated admin identity. Service
-- jobs may prepare dossiers and payments, but cannot approve documents/accounts.
CREATE OR REPLACE FUNCTION public.guard_human_signup_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := COALESCE(public.has_role(v_actor_id, 'admin'::public.app_role), false);
  v_old_is_privileged boolean;
  v_new_is_privileged boolean;
  v_old_is_final boolean;
  v_new_is_final boolean;
  v_final_decision_touched boolean;
  v_is_owner_resubmission boolean := false;
BEGIN
  v_new_is_privileged := NEW.requested_role <> 'client'::public.app_role;
  v_new_is_final := NEW.status IN ('approved', 'needs_changes', 'rejected');

  IF TG_OP = 'INSERT' THEN
    -- Every privileged dossier must first exist in a reviewable state. This
    -- also makes the payment guard impossible to bypass with a service-role
    -- INSERT that starts directly at `approved`.
    IF v_new_is_privileged AND v_new_is_final THEN
      RAISE EXCEPTION 'Un dossier privilégié doit être soumis avant toute décision humaine.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_old_is_privileged := OLD.requested_role <> 'client'::public.app_role;
  v_old_is_final := OLD.status IN ('approved', 'needs_changes', 'rejected');
  v_final_decision_touched := (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.requested_role IS DISTINCT FROM OLD.requested_role
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR COALESCE(NEW.metadata->>'restaurant_id', '')
       IS DISTINCT FROM COALESCE(OLD.metadata->>'restaurant_id', '')
  );

  -- A dossier returned for corrections may be resubmitted by its owner. This
  -- is the sole non-admin transition out of a final moderation state: it does
  -- not reuse the decision, keeps the same identity/role/restaurant binding,
  -- and clears the previous human reviewer markers.
  v_is_owner_resubmission := (
    v_old_is_privileged
    AND OLD.status = 'needs_changes'
    AND NEW.status = 'pending_review'
    AND v_actor_id IS NOT NULL
    AND v_actor_id = OLD.user_id
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.requested_role IS NOT DISTINCT FROM OLD.requested_role
    AND COALESCE(NEW.metadata->>'restaurant_id', '')
        IS NOT DISTINCT FROM COALESCE(OLD.metadata->>'restaurant_id', '')
    AND NEW.reviewed_by IS NULL
    AND NEW.reviewed_at IS NULL
  );

  -- Changing the identity or role of an already-final dossier would reuse a
  -- human decision (and potentially its payment) for another account/role.
  IF v_new_is_final
    AND (
      NEW.requested_role IS DISTINCT FROM OLD.requested_role
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR (
        v_old_is_final
        AND COALESCE(NEW.metadata->>'restaurant_id', '')
            IS DISTINCT FROM COALESCE(OLD.metadata->>'restaurant_id', '')
      )
    )
  THEN
    RAISE EXCEPTION 'Le rôle, le compte ou le restaurant doit repasser par une nouvelle revue.'
      USING ERRCODE = '42501';
  END IF;

  IF (v_old_is_privileged AND v_old_is_final)
    OR (v_new_is_privileged AND v_new_is_final)
  THEN
    IF v_final_decision_touched
      AND NOT v_is_owner_resubmission
      AND (v_actor_id IS NULL OR NOT v_actor_is_admin)
    THEN
      RAISE EXCEPTION 'Une validation humaine administrateur est requise.'
        USING ERRCODE = '42501';
    END IF;

    IF v_final_decision_touched
      AND NOT v_is_owner_resubmission
      AND v_new_is_final
      AND NEW.reviewed_by IS DISTINCT FROM v_actor_id
    THEN
      RAISE EXCEPTION 'Le validateur humain doit être enregistré dans reviewed_by.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_human_signup_review()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_human_signup_review ON public.signup_applications;
CREATE TRIGGER guard_human_signup_review
BEFORE INSERT OR UPDATE OF
  status,
  reviewed_by,
  reviewed_at,
  requested_role,
  user_id,
  metadata
ON public.signup_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_human_signup_review();

-- Preserve every human moderation decision as a separate immutable event.
-- The current status on signup_applications remains convenient for the UI;
-- this journal is the authoritative audit trail and is never overwritten.
CREATE TABLE IF NOT EXISTS public.signup_application_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES public.signup_applications(id) ON DELETE RESTRICT,
  applicant_user_id uuid NOT NULL,
  requested_role public.app_role NOT NULL,
  previous_status text NOT NULL,
  decision_status text NOT NULL
    CHECK (decision_status IN ('approved', 'needs_changes', 'rejected')),
  reviewer_id uuid NOT NULL,
  review_note text,
  restaurant_id uuid,
  document_decisions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(document_decisions) = 'array'),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_application_review_events_application
ON public.signup_application_review_events (application_id, decided_at DESC);

ALTER TABLE public.signup_application_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signup_application_review_events_admin_select
ON public.signup_application_review_events;
CREATE POLICY signup_application_review_events_admin_select
ON public.signup_application_review_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.reject_signup_review_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Le journal des décisions de validation est immuable.'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_signup_review_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS reject_signup_review_event_mutation
ON public.signup_application_review_events;
CREATE TRIGGER reject_signup_review_event_mutation
BEFORE UPDATE OR DELETE
ON public.signup_application_review_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_signup_review_event_mutation();

REVOKE ALL ON TABLE public.signup_application_review_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.signup_application_review_events
  TO authenticated;

-- A normal authenticated admin (not only a JWT super-admin) must be able to
-- verify the already-recorded onboarding payment before making the human
-- approval decision. The applicant and service-role checks remain unchanged.
CREATE OR REPLACE FUNCTION public.signup_restaurateur_onboarding_payment_ready(
  p_application_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF p_application_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.signup_applications AS application
    JOIN public.restaurant_ai_subscriptions AS subscription
      ON subscription.id = application.restaurant_subscription_id
      OR subscription.signup_application_id = application.id
    WHERE application.id = p_application_id
      AND application.requested_role = 'restaurateur'::public.app_role
      AND (
        auth.role() = 'service_role'
        OR public.auth_is_super_admin()
        OR public.has_role(v_actor_id, 'admin'::public.app_role)
        OR application.user_id = v_actor_id
      )
      AND (
        (
          subscription.status IN ('awaiting_activation', 'activation_pending')
          AND subscription.payment_method_ready_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.restaurant_subscription_payment_methods AS payment_method
            WHERE payment_method.subscription_id = subscription.id
          )
        )
        OR (
          subscription.status IN ('active', 'trialing')
          AND subscription.current_period_end > now()
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE(application_id uuid, application_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_application public.signup_applications%ROWTYPE;
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_restaurant_id uuid;
  v_applicant_email text;
  v_role_label text;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.signup_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  IF v_next_status = 'approved'
    AND v_application.requested_role = 'restaurateur'::public.app_role
    AND public.signup_restaurateur_onboarding_payment_ready(p_application_id) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'Onboarding payment required before approval';
  END IF;

  -- Resolve and validate the restaurant before recording the decision. A
  -- dashboard-created fallback must be persisted in metadata before the
  -- restaurant UPDATE, because its publication trigger validates that exact
  -- owner/application/restaurant binding.
  IF v_application.requested_role = 'restaurateur'::public.app_role THEN
    v_restaurant_id := CASE
      WHEN COALESCE(v_application.metadata->>'restaurant_id', '') ~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      THEN (v_application.metadata->>'restaurant_id')::uuid
      ELSE NULL
    END;

    IF v_restaurant_id IS NOT NULL THEN
      SELECT restaurant.id
      INTO v_restaurant_id
      FROM public.restaurants AS restaurant
      WHERE restaurant.id = v_restaurant_id
        AND restaurant.owner_id = v_application.user_id
        AND restaurant.is_demo IS FALSE
      FOR UPDATE;
    END IF;

    IF v_restaurant_id IS NULL THEN
      SELECT restaurant.id
      INTO v_restaurant_id
      FROM public.restaurants AS restaurant
      WHERE restaurant.owner_id = v_application.user_id
        AND restaurant.is_demo IS FALSE
      ORDER BY restaurant.created_at ASC
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_next_status = 'approved' AND v_restaurant_id IS NULL THEN
      RAISE EXCEPTION 'A private restaurant profile is required before approval';
    END IF;
  END IF;

  UPDATE public.signup_applications AS application
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = v_actor_id,
      metadata = CASE
        WHEN v_application.requested_role = 'restaurateur'::public.app_role
          AND v_restaurant_id IS NOT NULL
        THEN jsonb_set(
          COALESCE(application.metadata, '{}'::jsonb),
          '{restaurant_id}',
          to_jsonb(v_restaurant_id::text),
          true
        )
        ELSE application.metadata
      END,
      updated_at = now()
  WHERE application.id = p_application_id;

  UPDATE public.signup_application_documents AS document
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE
        WHEN v_next_status = 'approved' THEN NULL
        ELSE NULLIF(trim(COALESCE(p_review_note, '')), '')
      END,
      reviewed_at = now(),
      reviewed_by = v_actor_id,
      updated_at = now()
  WHERE document.application_id = p_application_id;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role = 'courier'::public.app_role THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_application.user_id
      AND role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier'::public.app_role THEN
    UPDATE public.couriers AS courier
    SET status = CASE
          WHEN v_next_status = 'approved' THEN 'approved'
          WHEN v_next_status = 'rejected' THEN 'rejected'
          ELSE 'pending_approval'
        END,
        is_online = CASE WHEN v_next_status = 'approved' THEN courier.is_online ELSE false END,
        updated_at = now()
    WHERE courier.user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur'::public.app_role THEN
    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants AS restaurant
      SET status = CASE
            WHEN v_next_status = 'approved' THEN 'active'
            WHEN v_next_status = 'rejected' THEN 'rejected'
            ELSE 'needs_changes'
          END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE restaurant.id = v_restaurant_id
        AND restaurant.owner_id = v_application.user_id;
    END IF;
  END IF;

  INSERT INTO public.signup_application_review_events (
    application_id,
    applicant_user_id,
    requested_role,
    previous_status,
    decision_status,
    reviewer_id,
    review_note,
    restaurant_id,
    document_decisions,
    decided_at
  )
  VALUES (
    p_application_id,
    v_application.user_id,
    v_application.requested_role,
    v_application.status,
    v_next_status,
    v_actor_id,
    NULLIF(trim(COALESCE(p_review_note, '')), ''),
    v_restaurant_id,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'document_id', document.id,
          'document_type', document.document_type,
          'status', document.status
        )
        ORDER BY document.document_type, document.id
      )
      FROM public.signup_application_documents AS document
      WHERE document.application_id = p_application_id
    ), '[]'::jsonb),
    now()
  );

  SELECT account.email
  INTO v_applicant_email
  FROM auth.users AS account
  WHERE account.id = v_application.user_id;

  IF v_applicant_email IS NOT NULL THEN
    v_role_label := CASE
      WHEN v_application.requested_role = 'courier'::public.app_role THEN 'livreur'
      ELSE 'restaurateur'
    END;

    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_role_label || ' est validé'
        WHEN 'needs_changes' THEN 'Corrections demandées sur votre dossier ' || v_role_label
        ELSE 'Votre demande ' || v_role_label || ' a été refusée'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre dossier a été validé. Votre espace et votre fiche peuvent maintenant être publiés.'
        WHEN 'needs_changes' THEN 'Votre dossier nécessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'consultez le détail dans votre dashboard') || '.'
        ELSE 'Votre demande a été refusée.' ||
          CASE WHEN NULLIF(trim(p_review_note), '') IS NULL THEN '' ELSE ' ' || trim(p_review_note) END
      END,
      jsonb_build_object(
        'application_id', p_application_id,
        'kind', 'signup_decision',
        'status', v_next_status,
        'reviewed_by', v_actor_id
      )
    );
  END IF;

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text)
  TO authenticated;

DROP POLICY IF EXISTS signup_applications_admin_all ON public.signup_applications;
DROP POLICY IF EXISTS signup_applications_admin_select ON public.signup_applications;
CREATE POLICY signup_applications_admin_select
ON public.signup_applications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS signup_application_documents_admin_all ON public.signup_application_documents;
DROP POLICY IF EXISTS signup_application_documents_admin_select ON public.signup_application_documents;
CREATE POLICY signup_application_documents_admin_select
ON public.signup_application_documents
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.validate_signup_document_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_application_user_id uuid;
  v_requested_role public.app_role;
  v_vehicle_type text;
  v_storage_metadata jsonb;
  v_storage_owner_id text;
  v_storage_mime text;
  v_storage_size bigint;
  v_file_extension text;
  v_file_name_pattern text;
BEGIN
  SELECT
    application.user_id,
    application.requested_role,
    lower(COALESCE(application.vehicle_type, ''))
  INTO
    v_application_user_id,
    v_requested_role,
    v_vehicle_type
  FROM public.signup_applications AS application
  WHERE application.id = NEW.application_id;

  IF v_application_user_id IS NULL OR v_application_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Le document ne correspond pas au propriétaire du dossier.'
      USING ERRCODE = '23514';
  END IF;

  IF v_requested_role = 'restaurateur'::public.app_role THEN
    IF NEW.document_type NOT IN (
      'identity_document',
      'business_registration',
      'iban_proof'
    ) THEN
      RAISE EXCEPTION 'Type de document invalide pour un dossier restaurateur.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_requested_role = 'courier'::public.app_role THEN
    IF NEW.document_type NOT IN (
      'identity_document',
      'work_permit',
      'iban_proof',
      'vehicle_registration'
    ) OR (
      NEW.document_type = 'vehicle_registration'
      AND v_vehicle_type NOT IN ('scooter', 'car')
    ) THEN
      RAISE EXCEPTION 'Type de document invalide pour un dossier livreur.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Ce rôle ne doit pas joindre de document de vérification.'
      USING ERRCODE = '23514';
  END IF;

  v_file_name_pattern := '^' || NEW.document_type ||
    '-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '\.(pdf|png|jpg|jpeg|webp|heic|heif)$';

  IF array_length(string_to_array(NEW.file_path, '/'), 1) IS DISTINCT FROM 3
    OR split_part(NEW.file_path, '/', 1) IS DISTINCT FROM NEW.user_id::text
    OR split_part(NEW.file_path, '/', 2) IS DISTINCT FROM v_requested_role::text
    OR split_part(NEW.file_path, '/', 3) !~ v_file_name_pattern
  THEN
    RAISE EXCEPTION 'Chemin de document invalide.' USING ERRCODE = '23514';
  END IF;

  SELECT object.metadata, object.owner_id
  INTO v_storage_metadata, v_storage_owner_id
  FROM storage.objects AS object
  WHERE object.bucket_id = 'verification-documents'
    AND object.name = NEW.file_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document privé introuvable dans le stockage.' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(trim(COALESCE(v_storage_owner_id, '')), '') IS NULL
    OR v_storage_owner_id IS DISTINCT FROM NEW.user_id::text
  THEN
    RAISE EXCEPTION 'Le propriétaire du document stocké est invalide.'
      USING ERRCODE = '23514';
  END IF;

  -- The manifest never trusts MIME/size values supplied by the browser or RPC.
  -- Storage metadata is the sole source of truth; no OCR, image recognition or
  -- automated identity/content analysis is performed.
  v_storage_mime := lower(trim(COALESCE(v_storage_metadata->>'mimetype', '')));

  IF COALESCE(v_storage_metadata->>'size', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Métadonnées de taille du document invalides.'
      USING ERRCODE = '23514';
  END IF;

  v_storage_size := (v_storage_metadata->>'size')::bigint;

  IF v_storage_mime NOT IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ) THEN
    RAISE EXCEPTION 'Type de document non autorisé.' USING ERRCODE = '23514';
  END IF;

  IF v_storage_size <= 0 OR v_storage_size > 15728640 THEN
    RAISE EXCEPTION 'Taille de document non autorisée.' USING ERRCODE = '23514';
  END IF;

  v_file_extension := lower(regexp_replace(NEW.file_path, '^.*\.', ''));
  IF NOT (CASE v_storage_mime
    WHEN 'application/pdf' THEN v_file_extension = 'pdf'
    WHEN 'image/jpeg' THEN v_file_extension IN ('jpg', 'jpeg')
    WHEN 'image/png' THEN v_file_extension = 'png'
    WHEN 'image/webp' THEN v_file_extension = 'webp'
    WHEN 'image/heic' THEN v_file_extension = 'heic'
    WHEN 'image/heif' THEN v_file_extension = 'heif'
    ELSE false
  END) THEN
    RAISE EXCEPTION 'L''extension ne correspond pas au type du document stocké.'
      USING ERRCODE = '23514';
  END IF;

  NEW.mime_type := v_storage_mime;
  NEW.file_size_bytes := v_storage_size::integer;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_signup_document_manifest()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS signup_application_documents_file_path_key
ON public.signup_application_documents (file_path);

DROP TRIGGER IF EXISTS validate_signup_document_manifest ON public.signup_application_documents;
CREATE TRIGGER validate_signup_document_manifest
BEFORE INSERT OR UPDATE OF application_id, user_id, file_path, mime_type, file_size_bytes
ON public.signup_application_documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_signup_document_manifest();

-- Private documents are constrained server-side. These checks do not inspect,
-- classify or extract document content; the final decision remains human.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
WHERE id = 'verification-documents';

CREATE OR REPLACE FUNCTION public.verification_document_is_committed(p_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.signup_application_documents AS document
    WHERE document.file_path = p_file_path
  );
$$;

REVOKE ALL ON FUNCTION public.verification_document_is_committed(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verification_document_is_committed(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS verification_documents_update ON storage.objects;
CREATE POLICY verification_documents_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND NOT public.verification_document_is_committed(name)
    )
  )
)
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS verification_documents_delete ON storage.objects;
CREATE POLICY verification_documents_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      auth.uid()::text = (storage.foldername(name))[1]
      AND NOT public.verification_document_is_committed(name)
    )
  )
);

-- SECURITY DEFINER catalogue/booking functions do not inherit the restaurants
-- RLS policy. Keep their existing implementation private and expose a wrapper
-- that applies the same exact publication predicate to every returned/mutated
-- restaurant.
CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = p_restaurant_id
      AND restaurant.is_active IS TRUE
      AND restaurant.is_demo IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.restaurant_is_publicly_visible(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.search_restaurants_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
)
RENAME TO search_restaurants_catalog_unguarded;

REVOKE ALL ON FUNCTION public.search_restaurants_catalog_unguarded(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.search_restaurants_catalog(
  p_query text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cuisine text DEFAULT NULL,
  p_price_range integer DEFAULT NULL,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence',
  p_sort_direction text DEFAULT NULL,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  cuisine_type text,
  rating numeric,
  review_count integer,
  price_range integer,
  delivery_fee numeric,
  image_url text,
  address text,
  city text,
  delivery_available boolean,
  created_at timestamptz,
  category_names text[],
  category_slugs text[],
  matched_via_menu boolean,
  monthly_reservations integer,
  monthly_orders integer,
  promotion_score numeric,
  relevance_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT result.*
  FROM public.search_restaurants_catalog_unguarded(
    p_query,
    p_city,
    p_cuisine,
    p_price_range,
    p_delivery_only,
    p_min_rating,
    p_sort_by,
    p_sort_direction,
    p_limit,
    p_offset
  ) AS result
  WHERE public.restaurant_is_publicly_visible(result.id);
$$;

REVOKE ALL ON FUNCTION public.search_restaurants_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(
  text, text, text, integer, boolean, numeric, text, text, integer, integer
)
TO anon, authenticated, service_role;

ALTER FUNCTION public.get_match_group_public_feed()
RENAME TO get_match_group_public_feed_unguarded;

REVOKE ALL ON FUNCTION public.get_match_group_public_feed_unguarded()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_match_group_public_feed()
RETURNS TABLE(
  id uuid,
  restaurant_id uuid,
  creator_id uuid,
  area text,
  time_slot text,
  max_members integer,
  discount_percentage numeric,
  final_discount_percentage numeric,
  status text,
  is_active boolean,
  expires_at timestamptz,
  scheduled_at timestamptz,
  lock_at timestamptz,
  member_count integer,
  restaurant jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT result.*
  FROM public.get_match_group_public_feed_unguarded() AS result
  WHERE public.restaurant_is_publicly_visible(result.restaurant_id);
$$;

REVOKE ALL ON FUNCTION public.get_match_group_public_feed()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_match_group_public_feed()
  TO anon, authenticated, service_role;

ALTER FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date)
RENAME TO get_restaurant_slot_availability_unguarded;

REVOKE ALL ON FUNCTION public.get_restaurant_slot_availability_unguarded(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_restaurant_reservation_slot_availability(
  p_restaurant_id uuid,
  p_date date
)
RETURNS TABLE(
  slot_time time,
  service text,
  capacity integer,
  reserved_tables integer,
  remaining_tables integer,
  available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.restaurant_is_publicly_visible(p_restaurant_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT result.*
  FROM public.get_restaurant_slot_availability_unguarded(
    p_restaurant_id,
    p_date
  ) AS result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date)
  TO anon, authenticated, service_role;

ALTER FUNCTION public.get_social_feed_premium_banners(integer, text)
RENAME TO get_social_feed_premium_banners_unguarded;

REVOKE ALL ON FUNCTION public.get_social_feed_premium_banners_unguarded(integer, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_social_feed_premium_banners(
  p_limit integer DEFAULT 1,
  p_scope text DEFAULT 'for_you'
)
RETURNS TABLE(
  activity_id uuid,
  activity_type text,
  post_id uuid,
  restaurant_id uuid,
  author_id uuid,
  body text,
  status text,
  created_at timestamptz,
  published_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  shares_count integer,
  liked_by_me boolean,
  my_reaction text,
  reaction_counts jsonb,
  followed_by_me boolean,
  reposted_by_me boolean,
  saved_by_me boolean,
  recommendation_reasons jsonb,
  score numeric,
  media jsonb,
  restaurant jsonb,
  repost jsonb,
  post_type text,
  cta_type text,
  cta_target_id uuid,
  scheduled_at timestamptz,
  pinned_until timestamptz,
  visibility text,
  premium_banner_id uuid,
  premium_banner_audience_count integer,
  premium_banner_impressions_per_viewer integer,
  premium_banner_remaining_impressions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT result.*
  FROM public.get_social_feed_premium_banners_unguarded(
    p_limit,
    p_scope
  ) AS result
  WHERE public.restaurant_is_publicly_visible(result.restaurant_id);
$$;

REVOKE ALL ON FUNCTION public.get_social_feed_premium_banners(integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_social_feed_premium_banners(integer, text)
  TO anon, authenticated, service_role;

ALTER FUNCTION public.resolve_google_booking_slug(text)
RENAME TO resolve_google_booking_slug_unguarded;

REVOKE ALL ON FUNCTION public.resolve_google_booking_slug_unguarded(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.resolve_google_booking_slug(p_booking_slug text)
RETURNS TABLE(
  restaurant_id uuid,
  restaurant_name text,
  city text,
  slug text,
  booking_slug text,
  is_active boolean,
  status text,
  supports_reservation boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT result.*
  FROM public.resolve_google_booking_slug_unguarded(p_booking_slug) AS result
  WHERE public.restaurant_is_publicly_visible(result.restaurant_id);
$$;

REVOKE ALL ON FUNCTION public.resolve_google_booking_slug(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_google_booking_slug(text)
  TO anon, authenticated, service_role;

ALTER FUNCTION public.track_google_booking_event(uuid, text, jsonb)
RENAME TO track_google_booking_event_unguarded;

REVOKE ALL ON FUNCTION public.track_google_booking_event_unguarded(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.track_google_booking_event(
  p_restaurant_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.restaurant_is_publicly_visible(p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurant introuvable.' USING ERRCODE = '22023';
  END IF;

  RETURN public.track_google_booking_event_unguarded(
    p_restaurant_id,
    p_event_type,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.track_google_booking_event(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_google_booking_event(uuid, text, jsonb)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.admin_review_signup_application(uuid, text, text) IS
  'Human-only signup review. Requires an authenticated admin and records reviewed_by.';
COMMENT ON COLUMN public.signup_application_documents.file_path IS
  'Private document path for manual admin review; no OCR or automated identity analysis.';

NOTIFY pgrst, 'reload schema';

COMMIT;
