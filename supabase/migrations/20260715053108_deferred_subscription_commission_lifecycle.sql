-- Deferred restaurant-subscription activation and commercial-commission lifecycle.
--
-- Business invariants introduced here:
--   * a commercial may select one active monthly plan, but never a price or a
--     commission amount (both remain server snapshots);
--   * a signed commission starts as pending_payment and becomes payable only
--     from a verified service-role invoice.paid event;
--   * restaurant signup creates one reserved internal subscription invoice;
--   * the first genuine client reservation or paid/confirmed order creates one
--     idempotent activation outbox job; checkout holds never count;
--   * payment-method setup reserves the payment method/mandate, not a
--     long-lived card authorization (card authorizations expire);
--   * no browser role can mutate subscription jobs, payment receipts or
--     commission entitlement rows directly.

-- ---------------------------------------------------------------------------
-- Typed signup, subscription, invoice and follow-up state
-- ---------------------------------------------------------------------------

ALTER TABLE public.commercial_prospect_followups
  ADD COLUMN IF NOT EXISTS acquisition_commission_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS earned_at timestamptz;

UPDATE public.commercial_prospect_followups
SET acquisition_commission_status = CASE
      WHEN status = 'signed' THEN 'pending_payment'
      ELSE 'not_applicable'
    END,
    earned_at = NULL;

ALTER TABLE public.commercial_prospect_followups
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_commission_lifecycle_check,
  ADD CONSTRAINT commercial_prospect_followups_commission_lifecycle_check
    CHECK (
      (
        status = 'signed'
        AND acquisition_commission_status IN (
          'pending_payment', 'payable', 'paid', 'cancelled', 'reversed'
        )
        AND (
          (acquisition_commission_status IN ('payable', 'paid', 'reversed') AND earned_at IS NOT NULL)
          OR (acquisition_commission_status IN ('pending_payment', 'cancelled') AND earned_at IS NULL)
        )
      )
      OR (
        status <> 'signed'
        AND acquisition_commission_status = 'not_applicable'
        AND earned_at IS NULL
      )
    );

CREATE INDEX IF NOT EXISTS idx_commercial_followups_commission_lifecycle
  ON public.commercial_prospect_followups(signed_by, acquisition_commission_status, earned_at DESC)
  WHERE status = 'signed';

ALTER TABLE public.signup_applications
  ADD COLUMN IF NOT EXISTS selected_subscription_plan_id uuid
    REFERENCES public.restaurant_subscription_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS selected_subscription_billing_period text,
  ADD COLUMN IF NOT EXISTS commercial_source_objectid bigint
    REFERENCES public.commercial_prospect_followups(source_objectid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restaurant_subscription_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_invoice_id uuid;

ALTER TABLE public.signup_applications
  DROP CONSTRAINT IF EXISTS signup_applications_subscription_billing_period_check,
  ADD CONSTRAINT signup_applications_subscription_billing_period_check
    CHECK (
      selected_subscription_billing_period IS NULL
      OR selected_subscription_billing_period = 'monthly'
    );

ALTER TABLE public.restaurant_ai_subscriptions
  ADD COLUMN IF NOT EXISTS signup_application_id uuid
    REFERENCES public.signup_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS price_monthly_chf_snapshot numeric,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CHF',
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS payment_method_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_trigger_type text,
  ADD COLUMN IF NOT EXISTS activation_trigger_id uuid,
  ADD COLUMN IF NOT EXISTS activation_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activation_error text;

-- Pre-activation contracts have no service period yet.
ALTER TABLE public.restaurant_ai_subscriptions
  ALTER COLUMN started_at DROP NOT NULL,
  ALTER COLUMN started_at DROP DEFAULT,
  ALTER COLUMN current_period_start DROP NOT NULL,
  ALTER COLUMN current_period_start DROP DEFAULT,
  ALTER COLUMN current_period_end DROP NOT NULL,
  ALTER COLUMN current_period_end DROP DEFAULT;

ALTER TABLE public.restaurant_ai_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_status_check,
  ADD CONSTRAINT restaurant_ai_subscriptions_status_check
    CHECK (status IN (
      'awaiting_payment_method',
      'awaiting_activation',
      'activation_pending',
      'active',
      'past_due',
      'cancelled',
      -- Compatibility-only states still written by legacy/Tok One flows.
      'trialing',
      'paused'
    )),
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_currency_check,
  ADD CONSTRAINT restaurant_ai_subscriptions_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_price_snapshot_check,
  ADD CONSTRAINT restaurant_ai_subscriptions_price_snapshot_check
    CHECK (price_monthly_chf_snapshot IS NULL OR price_monthly_chf_snapshot > 0),
  DROP CONSTRAINT IF EXISTS restaurant_ai_subscriptions_activation_trigger_check,
  ADD CONSTRAINT restaurant_ai_subscriptions_activation_trigger_check
    CHECK (
      (activation_trigger_type IS NULL AND activation_trigger_id IS NULL)
      OR (
        activation_trigger_type IN ('reservation', 'order')
        AND activation_trigger_id IS NOT NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_ai_subscriptions_signup_application
  ON public.restaurant_ai_subscriptions(signup_application_id)
  WHERE signup_application_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_ai_subscriptions_internal_invoice
  ON public.restaurant_ai_subscriptions(internal_invoice_id)
  WHERE internal_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_ai_subscriptions_lifecycle
  ON public.restaurant_ai_subscriptions(status, updated_at);

ALTER TABLE public.restaurant_invoices
  ADD COLUMN IF NOT EXISTS signup_application_id uuid
    REFERENCES public.signup_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id uuid
    REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CHF',
  ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurant_invoices
  DROP CONSTRAINT IF EXISTS restaurant_invoices_type_check,
  ADD CONSTRAINT restaurant_invoices_type_check
    CHECK (invoice_type IN ('payout', 'reservation_fees', 'payable', 'subscription')),
  DROP CONSTRAINT IF EXISTS restaurant_invoices_status_check,
  ADD CONSTRAINT restaurant_invoices_status_check
    CHECK (status IN (
      'draft', 'reserved', 'open', 'processing', 'pending', 'issued', 'sent',
      'payable', 'due', 'unpaid', 'overdue', 'past_due', 'partially_paid',
      'paid', 'failed', 'refunded', 'partially_refunded', 'disputed',
      'cancelled', 'canceled', 'void', 'voided', 'written_off', 'completed'
    )) NOT VALID,
  DROP CONSTRAINT IF EXISTS restaurant_invoices_currency_check,
  ADD CONSTRAINT restaurant_invoices_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3);

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_invoices_signup_subscription
  ON public.restaurant_invoices(signup_application_id)
  WHERE signup_application_id IS NOT NULL AND invoice_type = 'subscription';
CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_invoices_stripe_invoice
  ON public.restaurant_invoices(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_invoices_subscription_lifecycle
  ON public.restaurant_invoices(subscription_id, status, paid_at DESC)
  WHERE invoice_type = 'subscription';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'restaurant_ai_subscriptions_internal_invoice_fkey'
      AND conrelid = 'public.restaurant_ai_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.restaurant_ai_subscriptions
      ADD CONSTRAINT restaurant_ai_subscriptions_internal_invoice_fkey
      FOREIGN KEY (internal_invoice_id)
      REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signup_applications_restaurant_subscription_fkey'
      AND conrelid = 'public.signup_applications'::regclass
  ) THEN
    ALTER TABLE public.signup_applications
      ADD CONSTRAINT signup_applications_restaurant_subscription_fkey
      FOREIGN KEY (restaurant_subscription_id)
      REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signup_applications_subscription_invoice_fkey'
      AND conrelid = 'public.signup_applications'::regclass
  ) THEN
    ALTER TABLE public.signup_applications
      ADD CONSTRAINT signup_applications_subscription_invoice_fkey
      FOREIGN KEY (subscription_invoice_id)
      REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Normalized commission entitlement and activation outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.commercial_subscription_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_objectid bigint NOT NULL UNIQUE
    REFERENCES public.commercial_prospect_followups(source_objectid) ON DELETE RESTRICT,
  commercial_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL,
  plan_slug text NOT NULL,
  plan_name text NOT NULL,
  amount_chf numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  status text NOT NULL DEFAULT 'pending_payment',
  signed_at timestamptz NOT NULL,
  earned_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscription_commissions_plan_check
    CHECK (plan_slug IN ('starter', 'pro', 'premium', 'elite')),
  CONSTRAINT commercial_subscription_commissions_amount_check
    CHECK (amount_chf >= 0),
  CONSTRAINT commercial_subscription_commissions_currency_check
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  CONSTRAINT commercial_subscription_commissions_status_check
    CHECK (status IN ('pending_payment', 'payable', 'paid', 'cancelled', 'reversed')),
  CONSTRAINT commercial_subscription_commissions_dates_check
    CHECK (
      (status IN ('payable', 'paid', 'reversed') AND earned_at IS NOT NULL)
      OR (status IN ('pending_payment', 'cancelled') AND earned_at IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_subscription_commissions_invoice
  ON public.commercial_subscription_commissions(invoice_id)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_subscription_commissions_accounting
  ON public.commercial_subscription_commissions(commercial_user_id, status, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_subscription_commissions_pending
  ON public.commercial_subscription_commissions(commercial_user_id, signed_at DESC)
  WHERE status = 'pending_payment';

-- Capability tokens are kept outside the exposed public schema. A row is
-- never deleted or reassigned: lifecycle columns record revocation/consumption
-- while the signature and plan snapshots remain append-only audit evidence.
CREATE TABLE IF NOT EXISTS private_finance.commercial_signup_referrals (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_objectid bigint NOT NULL
    REFERENCES public.commercial_prospect_followups(source_objectid) ON DELETE RESTRICT,
  signature_version integer NOT NULL,
  signed_at timestamptz NOT NULL,
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.restaurant_subscription_plans(id) ON DELETE RESTRICT,
  plan_slug text NOT NULL,
  plan_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  consumed_at timestamptz,
  signup_application_id uuid REFERENCES public.signup_applications(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  CONSTRAINT commercial_signup_referrals_signature_version_check
    CHECK (signature_version > 0),
  CONSTRAINT commercial_signup_referrals_plan_check
    CHECK (plan_slug IN ('starter', 'pro', 'premium', 'elite')),
  CONSTRAINT commercial_signup_referrals_consumption_check
    CHECK (
      (consumed_at IS NULL AND signup_application_id IS NULL AND user_id IS NULL AND restaurant_id IS NULL)
      OR
      (consumed_at IS NOT NULL AND signup_application_id IS NOT NULL AND user_id IS NOT NULL AND restaurant_id IS NOT NULL)
    ),
  UNIQUE (source_objectid, signature_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_signup_referrals_application
  ON private_finance.commercial_signup_referrals(signup_application_id)
  WHERE signup_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_signup_referrals_current
  ON private_finance.commercial_signup_referrals(source_objectid, revoked_at, consumed_at, created_at DESC);

REVOKE ALL ON TABLE private_finance.commercial_signup_referrals
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.restaurant_subscription_activation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL UNIQUE
    REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  trigger_id uuid NOT NULL,
  triggered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_until timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_subscription_activation_jobs_trigger_check
    CHECK (trigger_type IN ('reservation', 'order')),
  CONSTRAINT restaurant_subscription_activation_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT restaurant_subscription_activation_jobs_attempt_check
    CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_subscription_activation_trigger
  ON public.restaurant_subscription_activation_jobs(trigger_type, trigger_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_subscription_activation_claim
  ON public.restaurant_subscription_activation_jobs(status, available_at, locked_until, created_at)
  WHERE status IN ('queued', 'processing');

CREATE TABLE IF NOT EXISTS public.restaurant_subscription_payment_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL,
  stripe_invoice_id text,
  stripe_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_subscription_payment_events_type_check
    CHECK (event_type IN (
      'payment_method_ready',
      'invoice_paid',
      'invoice_payment_failed',
      'payment_reversed',
      'subscription_cancelled_before_payment'
    ))
);

-- Stripe Customer/SetupIntent/PaymentMethod identifiers must not live on
-- restaurant_ai_subscriptions: that table has owner SELECT access. This table
-- has no browser policy or browser grant; only service_role may read it and all
-- writes still go through the narrow SECURITY DEFINER RPCs below.
CREATE TABLE IF NOT EXISTS public.restaurant_subscription_payment_methods (
  subscription_id uuid PRIMARY KEY
    REFERENCES public.restaurant_ai_subscriptions(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL UNIQUE
    REFERENCES public.restaurants(id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL,
  stripe_setup_intent_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  stripe_mode text NOT NULL,
  ready_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_subscription_payment_methods_mode_check
    CHECK (stripe_mode IN ('live', 'test'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_restaurant_subscription_payment_methods_checkout
  ON public.restaurant_subscription_payment_methods(stripe_checkout_session_id);

ALTER TABLE public.commercial_subscription_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscription_activation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscription_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscription_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_subscription_commissions_owner_select
  ON public.commercial_subscription_commissions;
CREATE POLICY commercial_subscription_commissions_owner_select
  ON public.commercial_subscription_commissions
  FOR SELECT TO authenticated
  USING (
    commercial_user_id = (SELECT auth.uid())
    OR public.auth_is_super_admin()
  );

REVOKE ALL ON TABLE public.commercial_subscription_commissions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_subscription_commissions TO authenticated;

REVOKE ALL ON TABLE public.restaurant_subscription_activation_jobs
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.restaurant_subscription_payment_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.restaurant_subscription_payment_methods
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.restaurant_subscription_payment_methods TO service_role;

CREATE OR REPLACE TRIGGER set_commercial_subscription_commissions_updated_at
  BEFORE UPDATE ON public.commercial_subscription_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_restaurant_subscription_activation_jobs_updated_at
  BEFORE UPDATE ON public.restaurant_subscription_activation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_restaurant_subscription_payment_methods_updated_at
  BEFORE UPDATE ON public.restaurant_subscription_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Server-owned commission synchronization
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.prepare_commercial_commission_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_existing_status text;
  v_existing_earned_at timestamptz;
  v_invoice_status text;
  v_invoice_paid_at timestamptz;
BEGIN
  SELECT commission.status, commission.earned_at
  INTO v_existing_status, v_existing_earned_at
  FROM public.commercial_subscription_commissions commission
  WHERE commission.source_objectid = NEW.source_objectid;

  IF NEW.status <> 'signed'::public.commercial_visit_status THEN
    IF TG_OP = 'UPDATE'
      AND OLD.status = 'signed'::public.commercial_visit_status
      AND v_existing_status IN ('payable', 'paid', 'reversed')
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'earned_commercial_signature_status_is_immutable';
    END IF;
    NEW.acquisition_commission_status := 'not_applicable';
    NEW.earned_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'signed'::public.commercial_visit_status
    AND v_existing_status IN ('payable', 'paid', 'reversed')
    AND (
      NEW.signed_restaurant_id IS DISTINCT FROM OLD.signed_restaurant_id
      OR NEW.signed_subscription_plan_slug IS DISTINCT FROM OLD.signed_subscription_plan_slug
      OR NEW.acquisition_commission_chf IS DISTINCT FROM OLD.acquisition_commission_chf
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'earned_commercial_commission_snapshot_is_immutable';
  END IF;

  -- A corrected non-signed outcome may later become a genuinely new
  -- signature for the same catalog prospect. That transition starts a fresh
  -- pending entitlement instead of preserving the previous cancellation.
  IF TG_OP = 'UPDATE'
    AND OLD.status <> 'signed'::public.commercial_visit_status
    AND NEW.status = 'signed'::public.commercial_visit_status
  THEN
    v_existing_status := NULL;
    v_existing_earned_at := NULL;
  END IF;

  -- Paid/reversed/cancelled decisions are durable and never inferred from a
  -- browser-supplied field.
  IF v_existing_status IN ('paid', 'reversed', 'cancelled') THEN
    NEW.acquisition_commission_status := v_existing_status;
    NEW.earned_at := v_existing_earned_at;
    RETURN NEW;
  END IF;

  IF NEW.signed_restaurant_id IS NOT NULL THEN
    SELECT invoice.status, invoice.paid_at
    INTO v_invoice_status, v_invoice_paid_at
    FROM public.restaurant_ai_subscriptions subscription
    JOIN public.restaurant_invoices invoice
      ON invoice.id = subscription.internal_invoice_id
    JOIN public.restaurant_subscription_payment_events payment_event
      ON payment_event.invoice_id = invoice.id
     AND payment_event.event_type = 'invoice_paid'
    WHERE subscription.restaurant_id = NEW.signed_restaurant_id
      AND invoice.invoice_type = 'subscription'
      AND COALESCE(invoice.metadata->>'plan_slug', subscription.plan)
        = NEW.signed_subscription_plan_slug
    LIMIT 1;

    IF NOT FOUND AND EXISTS (
      SELECT 1
      FROM public.restaurant_ai_subscriptions subscription
      JOIN public.restaurant_invoices invoice
        ON invoice.id = subscription.internal_invoice_id
      WHERE subscription.restaurant_id = NEW.signed_restaurant_id
        AND invoice.invoice_type = 'subscription'
        AND COALESCE(invoice.metadata->>'plan_slug', subscription.plan)
          IS DISTINCT FROM NEW.signed_subscription_plan_slug
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'signed_and_invoiced_subscription_plan_mismatch';
    END IF;
  END IF;

  IF v_existing_status = 'payable' OR v_invoice_status = 'paid' THEN
    NEW.acquisition_commission_status := 'payable';
    NEW.earned_at := COALESCE(v_existing_earned_at, v_invoice_paid_at);
  ELSE
    NEW.acquisition_commission_status := 'pending_payment';
    NEW.earned_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.sync_commercial_subscription_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_subscription_id uuid;
  v_invoice_id uuid;
BEGIN
  IF NEW.status <> 'signed'::public.commercial_visit_status THEN
    UPDATE public.commercial_subscription_commissions commission
    SET status = CASE
          WHEN commission.status IN ('paid', 'reversed') THEN commission.status
          ELSE 'cancelled'
        END,
        cancelled_at = CASE
          WHEN commission.status IN ('paid', 'reversed') THEN commission.cancelled_at
          ELSE COALESCE(commission.cancelled_at, now())
        END,
        earned_at = CASE
          WHEN commission.status IN ('paid', 'reversed') THEN commission.earned_at
          ELSE NULL
        END,
        metadata = commission.metadata || jsonb_build_object(
          'cancel_reason', 'signature_status_changed',
          'cancelled_from_status', OLD.status
        )
    WHERE commission.source_objectid = NEW.source_objectid;
    RETURN NEW;
  END IF;

  IF NEW.signed_restaurant_id IS NOT NULL THEN
    SELECT subscription.id, subscription.internal_invoice_id
    INTO v_subscription_id, v_invoice_id
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.restaurant_id = NEW.signed_restaurant_id
    LIMIT 1;
  END IF;

  INSERT INTO public.commercial_subscription_commissions (
    source_objectid,
    commercial_user_id,
    restaurant_id,
    subscription_id,
    invoice_id,
    plan_slug,
    plan_name,
    amount_chf,
    currency,
    status,
    signed_at,
    earned_at,
    metadata
  )
  VALUES (
    NEW.source_objectid,
    NEW.signed_by,
    NEW.signed_restaurant_id,
    v_subscription_id,
    v_invoice_id,
    NEW.signed_subscription_plan_slug,
    NEW.signed_subscription_plan_name,
    NEW.acquisition_commission_chf,
    'CHF',
    NEW.acquisition_commission_status,
    NEW.signed_at,
    NEW.earned_at,
    jsonb_build_object(
      'billing_period', NEW.signed_subscription_billing_period,
      'monthly_price_chf', NEW.signed_subscription_monthly_price_chf,
      'contract_value_chf', NEW.signed_subscription_contract_value_chf,
      'snapshot_source', 'commercial_prospect_followups'
    )
  )
  ON CONFLICT (source_objectid) DO UPDATE
  SET commercial_user_id = EXCLUDED.commercial_user_id,
      restaurant_id = CASE
        WHEN public.commercial_subscription_commissions.status = 'cancelled'
          AND TG_OP = 'UPDATE'
          AND OLD.status <> 'signed'::public.commercial_visit_status
          THEN EXCLUDED.restaurant_id
        ELSE COALESCE(EXCLUDED.restaurant_id, public.commercial_subscription_commissions.restaurant_id)
      END,
      subscription_id = CASE
        WHEN public.commercial_subscription_commissions.status = 'cancelled'
          AND TG_OP = 'UPDATE'
          AND OLD.status <> 'signed'::public.commercial_visit_status
          THEN EXCLUDED.subscription_id
        ELSE COALESCE(EXCLUDED.subscription_id, public.commercial_subscription_commissions.subscription_id)
      END,
      invoice_id = CASE
        WHEN public.commercial_subscription_commissions.status = 'cancelled'
          AND TG_OP = 'UPDATE'
          AND OLD.status <> 'signed'::public.commercial_visit_status
          THEN EXCLUDED.invoice_id
        ELSE COALESCE(EXCLUDED.invoice_id, public.commercial_subscription_commissions.invoice_id)
      END,
      plan_slug = CASE
        WHEN public.commercial_subscription_commissions.status IN ('payable', 'paid', 'reversed')
          THEN public.commercial_subscription_commissions.plan_slug
        ELSE EXCLUDED.plan_slug
      END,
      plan_name = CASE
        WHEN public.commercial_subscription_commissions.status IN ('payable', 'paid', 'reversed')
          THEN public.commercial_subscription_commissions.plan_name
        ELSE EXCLUDED.plan_name
      END,
      amount_chf = CASE
        WHEN public.commercial_subscription_commissions.status IN ('payable', 'paid', 'reversed')
          THEN public.commercial_subscription_commissions.amount_chf
        ELSE EXCLUDED.amount_chf
      END,
      status = CASE
        WHEN public.commercial_subscription_commissions.status = 'cancelled'
          AND TG_OP = 'UPDATE'
          AND OLD.status <> 'signed'::public.commercial_visit_status
          THEN EXCLUDED.status
        WHEN public.commercial_subscription_commissions.status IN ('paid', 'reversed', 'cancelled')
          THEN public.commercial_subscription_commissions.status
        ELSE EXCLUDED.status
      END,
      signed_at = EXCLUDED.signed_at,
      earned_at = CASE
        WHEN public.commercial_subscription_commissions.status IN ('paid', 'reversed')
          THEN public.commercial_subscription_commissions.earned_at
        ELSE EXCLUDED.earned_at
      END,
      cancelled_at = CASE
        WHEN public.commercial_subscription_commissions.status = 'cancelled'
          AND TG_OP = 'UPDATE'
          AND OLD.status <> 'signed'::public.commercial_visit_status
          THEN NULL
        ELSE public.commercial_subscription_commissions.cancelled_at
      END,
      metadata = public.commercial_subscription_commissions.metadata || EXCLUDED.metadata;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_commercial_commission_lifecycle
  ON public.commercial_prospect_followups;
CREATE TRIGGER prepare_commercial_commission_lifecycle
  BEFORE INSERT OR UPDATE
  ON public.commercial_prospect_followups
  FOR EACH ROW EXECUTE FUNCTION private_finance.prepare_commercial_commission_lifecycle();

DROP TRIGGER IF EXISTS sync_commercial_subscription_commission
  ON public.commercial_prospect_followups;
CREATE TRIGGER sync_commercial_subscription_commission
  AFTER INSERT OR UPDATE
  ON public.commercial_prospect_followups
  FOR EACH ROW EXECUTE FUNCTION private_finance.sync_commercial_subscription_commission();

REVOKE ALL ON FUNCTION private_finance.prepare_commercial_commission_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.sync_commercial_subscription_commission()
  FROM PUBLIC, anon, authenticated, service_role;

-- Conservative backfill: historical signatures remain pending until a paid
-- internal subscription invoice is linked by a future trusted operation.
INSERT INTO public.commercial_subscription_commissions (
  source_objectid,
  commercial_user_id,
  restaurant_id,
  plan_slug,
  plan_name,
  amount_chf,
  currency,
  status,
  signed_at,
  earned_at,
  metadata
)
SELECT
  followup.source_objectid,
  followup.signed_by,
  followup.signed_restaurant_id,
  followup.signed_subscription_plan_slug,
  followup.signed_subscription_plan_name,
  followup.acquisition_commission_chf,
  'CHF',
  'pending_payment',
  followup.signed_at,
  NULL,
  jsonb_build_object('backfill', true, 'payment_proof', false)
FROM public.commercial_prospect_followups followup
WHERE followup.status = 'signed'
  AND followup.signed_by IS NOT NULL
  AND followup.signed_at IS NOT NULL
ON CONFLICT (source_objectid) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Signup creates one reserved invoice and one pre-activation contract
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private_finance.ensure_deferred_restaurant_subscription(
  p_signup_application_id uuid,
  p_restaurant_id uuid,
  p_plan_id uuid,
  p_billing_period text DEFAULT 'monthly',
  p_commercial_source_objectid bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_application public.signup_applications%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_plan public.restaurant_subscription_plans%ROWTYPE;
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_signed_plan_slug text;
  v_amount numeric;
  v_now timestamptz := now();
BEGIN
  -- This private function is revoked from every API role and can only be
  -- reached through the SECURITY DEFINER signup trigger. The outer signup
  -- transaction may legitimately carry an authenticated JWT.
  IF p_signup_application_id IS NULL OR p_restaurant_id IS NULL OR p_plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_restaurant_and_plan_required';
  END IF;
  IF lower(trim(COALESCE(p_billing_period, ''))) <> 'monthly' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_subscription_must_be_monthly';
  END IF;

  SELECT * INTO v_application
  FROM public.signup_applications application
  WHERE application.id = p_signup_application_id
    AND application.requested_role = 'restaurateur'::public.app_role
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurateur_signup_application_required';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants restaurant
  WHERE restaurant.id = p_restaurant_id
    AND restaurant.owner_id = v_application.user_id
    AND NOT COALESCE(restaurant.is_demo, false)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'real_signup_restaurant_required';
  END IF;

  -- The contract is create-once. Metadata updates (payment webhooks, admin
  -- notes, retries) must never re-read catalogue pricing or rewrite a reserved
  -- or paid invoice/line item. Validate the established links, then return the
  -- immutable snapshots even if the catalogue plan was later deactivated.
  IF v_application.restaurant_subscription_id IS NOT NULL
    OR v_application.subscription_invoice_id IS NOT NULL
  THEN
    IF v_application.restaurant_subscription_id IS NULL
      OR v_application.subscription_invoice_id IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'incomplete_deferred_subscription_contract_links';
    END IF;

    SELECT * INTO v_subscription
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.id = v_application.restaurant_subscription_id
      AND subscription.signup_application_id = p_signup_application_id
      AND subscription.restaurant_id = p_restaurant_id
      AND subscription.internal_invoice_id = v_application.subscription_invoice_id;

    SELECT * INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_application.subscription_invoice_id
      AND invoice.signup_application_id = p_signup_application_id
      AND invoice.subscription_id = v_application.restaurant_subscription_id
      AND invoice.restaurant_id = p_restaurant_id
      AND invoice.invoice_type = 'subscription';

    IF v_subscription.id IS NULL OR v_invoice.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'inconsistent_deferred_subscription_contract_links';
    END IF;
    IF v_subscription.restaurant_subscription_plan_id IS DISTINCT FROM p_plan_id
      OR v_application.selected_subscription_plan_id IS DISTINCT FROM p_plan_id
      OR COALESCE(v_application.selected_subscription_billing_period, 'monthly') <> 'monthly'
      OR v_application.commercial_source_objectid IS DISTINCT FROM p_commercial_source_objectid
    THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'deferred_subscription_contract_snapshot_is_immutable';
    END IF;

    RETURN jsonb_build_object(
      'subscription_id', v_subscription.id,
      'invoice_id', v_invoice.id,
      'subscription_status', v_subscription.status,
      'invoice_status', v_invoice.status,
      'amount_chf', v_invoice.amount_ttc,
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_plan
  FROM public.restaurant_subscription_plans plan
  WHERE plan.id = p_plan_id
    AND plan.is_active
    AND plan.slug IN ('starter', 'pro', 'premium', 'elite');
  IF NOT FOUND OR v_plan.price_monthly_chf IS NULL OR v_plan.price_monthly_chf <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'active_restaurant_subscription_plan_required';
  END IF;
  v_amount := v_plan.price_monthly_chf;

  IF p_commercial_source_objectid IS NOT NULL THEN
    SELECT followup.signed_subscription_plan_slug
    INTO v_signed_plan_slug
    FROM public.commercial_prospect_followups followup
    WHERE followup.source_objectid = p_commercial_source_objectid
      AND followup.status = 'signed'
      AND followup.signed_by IS NOT NULL
      AND (
        followup.signed_restaurant_id IS NULL
        OR followup.signed_restaurant_id = p_restaurant_id
      )
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_signed_commercial_prospect_required';
    END IF;
    IF v_signed_plan_slug IS DISTINCT FROM v_plan.slug THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_and_signup_subscription_plan_mismatch';
    END IF;
  END IF;

  INSERT INTO public.restaurant_ai_subscriptions (
    restaurant_id,
    plan,
    status,
    monthly_conversation_limit,
    monthly_text_tool_limit,
    monthly_image_limit,
    monthly_premium_image_limit,
    monthly_voice_minutes_limit,
    started_at,
    current_period_start,
    current_period_end,
    metadata,
    restaurant_subscription_plan_id,
    billing_period,
    stripe_mode,
    monthly_campaign_credit_chf,
    monthly_ai_tool_credits,
    monthly_photo_retouch_credits,
    signup_application_id,
    price_monthly_chf_snapshot,
    currency
  )
  VALUES (
    p_restaurant_id,
    v_plan.slug,
    'awaiting_payment_method',
    v_plan.monthly_conversation_limit,
    v_plan.monthly_text_tool_limit,
    v_plan.monthly_image_limit,
    v_plan.monthly_premium_image_limit,
    v_plan.monthly_voice_minutes_limit,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'lifecycle', 'deferred_activation',
      'signup_application_id', p_signup_application_id,
      'plan_name_snapshot', v_plan.name
    ),
    v_plan.id,
    'monthly',
    'live',
    v_plan.campaign_credit_chf,
    v_plan.ai_tool_credits,
    v_plan.ai_photo_credits,
    p_signup_application_id,
    v_amount,
    'CHF'
  )
  ON CONFLICT (restaurant_id) DO UPDATE
  SET signup_application_id = COALESCE(
        public.restaurant_ai_subscriptions.signup_application_id,
        EXCLUDED.signup_application_id
      ),
      restaurant_subscription_plan_id = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.restaurant_subscription_plan_id
        ELSE public.restaurant_ai_subscriptions.restaurant_subscription_plan_id
      END,
      plan = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.plan
        ELSE public.restaurant_ai_subscriptions.plan
      END,
      price_monthly_chf_snapshot = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.price_monthly_chf_snapshot
        ELSE COALESCE(
          public.restaurant_ai_subscriptions.price_monthly_chf_snapshot,
          EXCLUDED.price_monthly_chf_snapshot
        )
      END,
      monthly_conversation_limit = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_conversation_limit
        ELSE public.restaurant_ai_subscriptions.monthly_conversation_limit
      END,
      monthly_text_tool_limit = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_text_tool_limit
        ELSE public.restaurant_ai_subscriptions.monthly_text_tool_limit
      END,
      monthly_image_limit = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_image_limit
        ELSE public.restaurant_ai_subscriptions.monthly_image_limit
      END,
      monthly_premium_image_limit = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_premium_image_limit
        ELSE public.restaurant_ai_subscriptions.monthly_premium_image_limit
      END,
      monthly_voice_minutes_limit = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_voice_minutes_limit
        ELSE public.restaurant_ai_subscriptions.monthly_voice_minutes_limit
      END,
      monthly_campaign_credit_chf = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_campaign_credit_chf
        ELSE public.restaurant_ai_subscriptions.monthly_campaign_credit_chf
      END,
      monthly_ai_tool_credits = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_ai_tool_credits
        ELSE public.restaurant_ai_subscriptions.monthly_ai_tool_credits
      END,
      monthly_photo_retouch_credits = CASE
        WHEN public.restaurant_ai_subscriptions.status IN ('awaiting_payment_method', 'awaiting_activation')
          THEN EXCLUDED.monthly_photo_retouch_credits
        ELSE public.restaurant_ai_subscriptions.monthly_photo_retouch_credits
      END,
      metadata = public.restaurant_ai_subscriptions.metadata || EXCLUDED.metadata
  RETURNING * INTO v_subscription;

  -- Reuse a pre-existing paid subscription invoice when migrating an already
  -- activated restaurant. Otherwise create exactly one reserved invoice.
  SELECT invoice.* INTO v_invoice
  FROM public.restaurant_invoices invoice
  WHERE invoice.signup_application_id = p_signup_application_id
    AND invoice.invoice_type = 'subscription'
  ORDER BY (invoice.status = 'paid') DESC, invoice.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND AND v_subscription.status = 'active' THEN
    SELECT invoice.* INTO v_invoice
    FROM public.restaurant_invoice_line_items item
    JOIN public.restaurant_invoices invoice ON invoice.id = item.invoice_id
    WHERE item.item_kind = 'restaurant_subscription'
      AND item.source_table = 'restaurant_ai_subscriptions'
      AND item.source_id = v_subscription.id
      AND invoice.status = 'paid'
    ORDER BY invoice.paid_at ASC NULLS LAST, invoice.created_at ASC
    LIMIT 1
    FOR UPDATE OF invoice;
  END IF;

  IF v_invoice.id IS NULL THEN
    INSERT INTO public.restaurant_invoices (
      restaurant_id,
      period_start,
      period_end,
      amount_ht,
      amount_tva,
      amount_ttc,
      status,
      due_at,
      paid_at,
      invoice_number,
      invoice_type,
      signup_application_id,
      subscription_id,
      currency,
      issued_at,
      metadata
    )
    VALUES (
      p_restaurant_id,
      (v_now AT TIME ZONE 'Europe/Zurich')::date,
      (v_now AT TIME ZONE 'Europe/Zurich')::date,
      v_amount,
      0,
      v_amount,
      'reserved',
      NULL,
      NULL,
      'TOK-SUB-' || replace(p_signup_application_id::text, '-', ''),
      'subscription',
      p_signup_application_id,
      v_subscription.id,
      'CHF',
      v_now,
      jsonb_build_object(
        'service_period_reserved', true,
        'plan_id', v_plan.id,
        'plan_slug', v_plan.slug,
        'plan_name_snapshot', v_plan.name,
        'billing_period', 'monthly'
      )
    )
    ON CONFLICT (signup_application_id)
      WHERE signup_application_id IS NOT NULL AND invoice_type = 'subscription'
    DO UPDATE SET subscription_id = EXCLUDED.subscription_id
    RETURNING * INTO v_invoice;
  ELSE
    UPDATE public.restaurant_invoices invoice
    SET signup_application_id = COALESCE(invoice.signup_application_id, p_signup_application_id),
        subscription_id = COALESCE(invoice.subscription_id, v_subscription.id),
        amount_ht = CASE WHEN invoice.status = 'reserved' THEN v_amount ELSE invoice.amount_ht END,
        amount_tva = CASE WHEN invoice.status = 'reserved' THEN 0 ELSE invoice.amount_tva END,
        amount_ttc = CASE WHEN invoice.status = 'reserved' THEN v_amount ELSE invoice.amount_ttc END,
        currency = COALESCE(invoice.currency, 'CHF'),
        metadata = invoice.metadata || jsonb_build_object(
          'plan_id', v_plan.id,
          'plan_slug', v_plan.slug,
          'plan_name_snapshot', v_plan.name,
          'billing_period', 'monthly'
        )
    WHERE invoice.id = v_invoice.id
    RETURNING * INTO v_invoice;
  END IF;

  INSERT INTO public.restaurant_invoice_line_items (
    invoice_id,
    restaurant_id,
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  VALUES (
    v_invoice.id,
    p_restaurant_id,
    'restaurant_subscription',
    'signup_applications',
    p_signup_application_id,
    'Abonnement restaurateur TOK - ' || v_plan.name,
    v_now,
    1,
    v_amount,
    v_amount,
    'TVA non configuree',
    0,
    v_amount,
    0,
    v_amount,
    jsonb_build_object(
      'plan_id', v_plan.id,
      'plan_slug', v_plan.slug,
      'billing_period', 'monthly',
      'lifecycle', 'reserved_until_first_client_activity'
    )
  )
  ON CONFLICT (source_table, source_id, item_kind)
    WHERE source_id IS NOT NULL
  DO UPDATE SET
    invoice_id = EXCLUDED.invoice_id,
    restaurant_id = EXCLUDED.restaurant_id,
    source_label = EXCLUDED.source_label,
    unit_amount = EXCLUDED.unit_amount,
    base_amount = EXCLUDED.base_amount,
    amount_ht = EXCLUDED.amount_ht,
    amount_tva = EXCLUDED.amount_tva,
    amount_ttc = EXCLUDED.amount_ttc,
    metadata = public.restaurant_invoice_line_items.metadata || EXCLUDED.metadata
  WHERE EXISTS (
    SELECT 1
    FROM public.restaurant_invoices protected_invoice
    WHERE protected_invoice.id = public.restaurant_invoice_line_items.invoice_id
      AND protected_invoice.status NOT IN ('paid', 'refunded', 'disputed')
  );

  UPDATE public.restaurant_ai_subscriptions subscription
  SET internal_invoice_id = v_invoice.id,
      price_monthly_chf_snapshot = COALESCE(subscription.price_monthly_chf_snapshot, v_amount)
  WHERE subscription.id = v_subscription.id
  RETURNING * INTO v_subscription;

  UPDATE public.signup_applications application
  SET selected_subscription_plan_id = v_plan.id,
      selected_subscription_billing_period = 'monthly',
      commercial_source_objectid = p_commercial_source_objectid,
      restaurant_subscription_id = v_subscription.id,
      subscription_invoice_id = v_invoice.id
  WHERE application.id = p_signup_application_id;

  IF p_commercial_source_objectid IS NOT NULL THEN
    UPDATE public.commercial_prospect_followups followup
    SET signed_restaurant_id = p_restaurant_id,
        updated_at = now()
    WHERE followup.source_objectid = p_commercial_source_objectid
      AND followup.status = 'signed'
      AND (
        followup.signed_restaurant_id IS NULL
        OR followup.signed_restaurant_id = p_restaurant_id
      );
  END IF;

  RETURN jsonb_build_object(
    'subscription_id', v_subscription.id,
    'invoice_id', v_invoice.id,
    'subscription_status', v_subscription.status,
    'invoice_status', v_invoice.status,
    'amount_chf', v_invoice.amount_ttc
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_commercial_prospect_signup_referral(
  p_source_objectid bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_followup public.commercial_prospect_followups%ROWTYPE;
  v_referral private_finance.commercial_signup_referrals%ROWTYPE;
  v_next_version integer;
  v_plan_id uuid;
BEGIN
  IF p_source_objectid IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_referral_not_available';
  END IF;

  SELECT * INTO v_followup
  FROM public.commercial_prospect_followups followup
  WHERE followup.source_objectid = p_source_objectid
    AND followup.status = 'signed'::public.commercial_visit_status
    AND followup.signed_by IS NOT NULL
    AND (
      followup.signed_by = auth.uid()
      OR public.auth_is_super_admin()
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_referral_not_available';
  END IF;
  IF v_followup.signed_restaurant_id IS NOT NULL
    OR v_followup.acquisition_commission_status <> 'pending_payment'
    OR NOT EXISTS (
      SELECT 1
      FROM public.commercial_subscription_commissions commission
      WHERE commission.source_objectid = v_followup.source_objectid
        AND commission.status = 'pending_payment'
        AND commission.subscription_id IS NULL
        AND commission.invoice_id IS NULL
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_already_linked_or_closed';
  END IF;

  SELECT plan.id INTO v_plan_id
  FROM public.restaurant_subscription_plans plan
  WHERE plan.slug = v_followup.signed_subscription_plan_slug
    AND plan.is_active
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_plan_inactive';
  END IF;

  SELECT * INTO v_referral
  FROM private_finance.commercial_signup_referrals referral
  WHERE referral.source_objectid = p_source_objectid
    AND referral.revoked_at IS NULL
    AND referral.consumed_at IS NULL
  ORDER BY referral.signature_version DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND
    AND v_referral.signed_at = v_followup.signed_at
    AND v_referral.signed_by = v_followup.signed_by
    AND v_referral.plan_id = v_plan_id
    AND v_referral.plan_slug = v_followup.signed_subscription_plan_slug
    AND v_referral.plan_name = v_followup.signed_subscription_plan_name
  THEN
    RETURN jsonb_build_object(
      'source_objectid', v_referral.source_objectid,
      'referral_token', v_referral.token,
      'signature_version', v_referral.signature_version,
      'plan_id', v_referral.plan_id,
      'plan_slug', v_referral.plan_slug,
      'plan_name', v_referral.plan_name,
      'signed_at', v_referral.signed_at
    );
  END IF;

  UPDATE private_finance.commercial_signup_referrals referral
  SET revoked_at = now(),
      revoked_reason = 'signature_snapshot_replaced'
  WHERE referral.source_objectid = p_source_objectid
    AND referral.revoked_at IS NULL
    AND referral.consumed_at IS NULL;

  SELECT COALESCE(max(referral.signature_version), 0) + 1
  INTO v_next_version
  FROM private_finance.commercial_signup_referrals referral
  WHERE referral.source_objectid = p_source_objectid;

  INSERT INTO private_finance.commercial_signup_referrals (
    source_objectid,
    signature_version,
    signed_at,
    signed_by,
    plan_id,
    plan_slug,
    plan_name
  ) VALUES (
    v_followup.source_objectid,
    v_next_version,
    v_followup.signed_at,
    v_followup.signed_by,
    v_plan_id,
    v_followup.signed_subscription_plan_slug,
    v_followup.signed_subscription_plan_name
  )
  RETURNING * INTO v_referral;

  RETURN jsonb_build_object(
    'source_objectid', v_referral.source_objectid,
    'referral_token', v_referral.token,
    'signature_version', v_referral.signature_version,
    'plan_id', v_referral.plan_id,
    'plan_slug', v_referral.plan_slug,
    'plan_name', v_referral.plan_name,
    'signed_at', v_referral.signed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.resolve_commercial_signup_referral(
  p_referral_token uuid,
  p_signup_application_id uuid,
  p_user_id uuid,
  p_restaurant_id uuid,
  p_plan_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_referral private_finance.commercial_signup_referrals%ROWTYPE;
  v_followup public.commercial_prospect_followups%ROWTYPE;
  v_source_objectid bigint;
  v_plan_slug text;
  v_plan_active boolean;
BEGIN
  IF p_referral_token IS NULL
    OR p_signup_application_id IS NULL
    OR p_user_id IS NULL
    OR p_restaurant_id IS NULL
    OR p_plan_id IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'complete_commercial_referral_required';
  END IF;

  -- Keep the same lock order as the token-issuing RPC: follow-up first, then
  -- referral. The unlocked token lookup is safe because source_objectid is an
  -- immutable append-only snapshot and the row is re-read under lock below.
  SELECT referral.source_objectid INTO v_source_objectid
  FROM private_finance.commercial_signup_referrals referral
  WHERE referral.token = p_referral_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_signed_commercial_referral_required';
  END IF;

  SELECT * INTO v_followup
  FROM public.commercial_prospect_followups followup
  WHERE followup.source_objectid = v_source_objectid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_signed_commercial_referral_required';
  END IF;

  SELECT * INTO v_referral
  FROM private_finance.commercial_signup_referrals referral
  WHERE referral.token = p_referral_token
    AND referral.source_objectid = v_source_objectid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_signed_commercial_referral_required';
  END IF;

  IF p_plan_id IS DISTINCT FROM v_referral.plan_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_referral_plan_mismatch';
  END IF;

  SELECT plan.slug, plan.is_active INTO v_plan_slug, v_plan_active
  FROM public.restaurant_subscription_plans plan
  WHERE plan.id = p_plan_id;
  IF NOT FOUND OR v_plan_slug IS DISTINCT FROM v_referral.plan_slug THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'commercial_referral_plan_mismatch';
  END IF;

  IF v_referral.consumed_at IS NOT NULL THEN
    IF v_referral.signup_application_id = p_signup_application_id
      AND v_referral.user_id = p_user_id
      AND v_referral.restaurant_id = p_restaurant_id
    THEN
      RETURN v_referral.source_objectid;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'commercial_referral_replay_rejected';
  END IF;
  IF v_referral.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_revoked';
  END IF;
  IF NOT COALESCE(v_plan_active, false) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_plan_inactive';
  END IF;

  IF v_followup.status <> 'signed'::public.commercial_visit_status
    OR v_followup.acquisition_commission_status <> 'pending_payment'
    OR v_followup.signed_by IS DISTINCT FROM v_referral.signed_by
    OR v_followup.signed_at IS DISTINCT FROM v_referral.signed_at
    OR v_followup.signed_subscription_plan_slug IS DISTINCT FROM v_referral.plan_slug
    OR v_followup.signed_subscription_plan_name IS DISTINCT FROM v_referral.plan_name
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_signature_changed';
  END IF;
  IF v_followup.signed_restaurant_id IS NOT NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'commercial_referral_already_linked';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_subscription_commissions commission
    WHERE commission.source_objectid = v_followup.source_objectid
      AND commission.status = 'pending_payment'
      AND commission.subscription_id IS NULL
      AND commission.invoice_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'commercial_referral_commission_closed';
  END IF;

  UPDATE private_finance.commercial_signup_referrals referral
  SET consumed_at = now(),
      signup_application_id = p_signup_application_id,
      user_id = p_user_id,
      restaurant_id = p_restaurant_id
  WHERE referral.token = p_referral_token;

  RETURN v_followup.source_objectid;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.invalidate_commercial_signup_referrals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'signed'::public.commercial_visit_status
    OR NEW.acquisition_commission_status IN ('cancelled', 'reversed')
    OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_subscription_plan_slug IS DISTINCT FROM OLD.signed_subscription_plan_slug
    OR NEW.signed_subscription_plan_name IS DISTINCT FROM OLD.signed_subscription_plan_name
    OR NEW.acquisition_commission_chf IS DISTINCT FROM OLD.acquisition_commission_chf
    OR NEW.signed_restaurant_id IS DISTINCT FROM OLD.signed_restaurant_id
  THEN
    UPDATE private_finance.commercial_signup_referrals referral
    SET revoked_at = COALESCE(referral.revoked_at, now()),
        revoked_reason = COALESCE(referral.revoked_reason, 'signature_changed_or_closed')
    WHERE referral.source_objectid = NEW.source_objectid
      AND referral.revoked_at IS NULL
      AND referral.consumed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_commercial_signup_referrals
  ON public.commercial_prospect_followups;
CREATE TRIGGER invalidate_commercial_signup_referrals
  AFTER UPDATE
  ON public.commercial_prospect_followups
  FOR EACH ROW EXECUTE FUNCTION private_finance.invalidate_commercial_signup_referrals();

CREATE OR REPLACE FUNCTION private_finance.signup_deferred_subscription_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_restaurant_text text;
  v_plan_text text;
  v_referral_text text;
  v_billing_period text;
  v_restaurant_id uuid;
  v_plan_id uuid;
  v_source_objectid bigint;
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF NEW.requested_role <> 'restaurateur'::public.app_role THEN
    RETURN NEW;
  END IF;

  v_restaurant_text := NULLIF(trim(COALESCE(NEW.metadata->>'restaurant_id', '')), '');
  v_plan_text := COALESCE(
    NEW.selected_subscription_plan_id::text,
    NULLIF(trim(COALESCE(NEW.metadata->>'selected_subscription_plan_id', '')), ''),
    NULLIF(trim(COALESCE(NEW.metadata->>'restaurant_subscription_plan_id', '')), '')
  );
  v_billing_period := lower(trim(COALESCE(
    NEW.selected_subscription_billing_period,
    NEW.metadata->>'selected_subscription_billing_period',
    NEW.metadata->>'billing_period',
    'monthly'
  )));
  v_referral_text := NULLIF(trim(COALESCE(
    NEW.metadata->>'commercial_referral_token',
    ''
  )), '');

  -- The first application write precedes restaurant creation. The same signup
  -- transaction updates metadata with restaurant_id immediately afterwards.
  IF v_restaurant_text IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_plan_text IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurant_subscription_plan_required_at_signup';
  END IF;
  IF v_restaurant_text !~* v_uuid_pattern OR v_plan_text !~* v_uuid_pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_signup_restaurant_or_plan_identifier';
  END IF;
  IF NEW.metadata ?| ARRAY[
    'commercial_source_objectid',
    'commercial_prospect_source_objectid',
    'source_objectid'
  ] THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'raw_commercial_source_metadata_not_accepted';
  END IF;
  IF v_referral_text IS NOT NULL AND v_referral_text !~* v_uuid_pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_referral_token';
  END IF;

  v_restaurant_id := v_restaurant_text::uuid;
  v_plan_id := v_plan_text::uuid;
  IF v_referral_text IS NOT NULL THEN
    v_source_objectid := private_finance.resolve_commercial_signup_referral(
      v_referral_text::uuid,
      NEW.id,
      NEW.user_id,
      v_restaurant_id,
      v_plan_id
    );
  ELSIF NEW.commercial_source_objectid IS NOT NULL THEN
    IF auth.role() <> 'service_role' AND NOT public.auth_is_super_admin() THEN
      IF TG_OP = 'INSERT'
        OR OLD.commercial_source_objectid IS DISTINCT FROM NEW.commercial_source_objectid
      THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'direct_commercial_source_requires_admin';
      END IF;
    END IF;
    v_source_objectid := NEW.commercial_source_objectid;
  ELSE
    v_source_objectid := NULL;
  END IF;

  PERFORM private_finance.ensure_deferred_restaurant_subscription(
    NEW.id,
    v_restaurant_id,
    v_plan_id,
    v_billing_period,
    v_source_objectid
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_deferred_subscription_on_signup
  ON public.signup_applications;
CREATE TRIGGER create_deferred_subscription_on_signup
  AFTER INSERT OR UPDATE OF metadata
  ON public.signup_applications
  FOR EACH ROW EXECUTE FUNCTION private_finance.signup_deferred_subscription_trigger();

REVOKE ALL ON FUNCTION private_finance.ensure_deferred_restaurant_subscription(
  uuid, uuid, uuid, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.resolve_commercial_signup_referral(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.invalidate_commercial_signup_referrals()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.signup_deferred_subscription_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_commercial_prospect_signup_referral(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commercial_prospect_signup_referral(bigint)
  TO authenticated;

-- Idempotent migration backfill for onboarding rows that already contain all
-- contract identifiers. Invalid or incomplete legacy metadata is left intact
-- for explicit admin correction rather than guessed during deployment.
DO $$
DECLARE
  v_application record;
  v_restaurant_text text;
  v_plan_text text;
  v_source_objectid bigint;
  v_billing_period text;
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  FOR v_application IN
    SELECT application.*
    FROM public.signup_applications application
    WHERE application.requested_role = 'restaurateur'::public.app_role
      AND application.restaurant_subscription_id IS NULL
  LOOP
    v_restaurant_text := NULLIF(trim(COALESCE(
      v_application.metadata->>'restaurant_id',
      ''
    )), '');
    v_plan_text := COALESCE(
      v_application.selected_subscription_plan_id::text,
      NULLIF(trim(COALESCE(v_application.metadata->>'selected_subscription_plan_id', '')), ''),
      NULLIF(trim(COALESCE(v_application.metadata->>'restaurant_subscription_plan_id', '')), '')
    );
    v_source_objectid := v_application.commercial_source_objectid;
    v_billing_period := lower(trim(COALESCE(
      v_application.selected_subscription_billing_period,
      v_application.metadata->>'selected_subscription_billing_period',
      v_application.metadata->>'billing_period',
      'monthly'
    )));

    CONTINUE WHEN v_restaurant_text IS NULL
      OR v_plan_text IS NULL
      OR v_restaurant_text !~* v_uuid_pattern
      OR v_plan_text !~* v_uuid_pattern;

    BEGIN
      PERFORM private_finance.ensure_deferred_restaurant_subscription(
        v_application.id,
        v_restaurant_text::uuid,
        v_plan_text::uuid,
        v_billing_period,
        v_source_objectid
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Deferred subscription backfill skipped signup application %: %',
        v_application.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- First genuine client activity -> one activation outbox job
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restaurant_subscription_genuine_client(
  p_user_id uuid,
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_restaurant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurants restaurant
      WHERE restaurant.id = p_restaurant_id
        AND restaurant.owner_id IS DISTINCT FROM p_user_id
        AND NOT COALESCE(restaurant.is_demo, false)
    )
    AND public.has_role(p_user_id, 'client'::public.app_role)
    AND NOT public.has_role(p_user_id, 'commercial'::public.app_role)
    AND NOT public.has_role(p_user_id, 'admin'::public.app_role)
    AND NOT COALESCE(public.commercial_demo_user_is_restricted(p_user_id), false);
$$;

REVOKE ALL ON FUNCTION public.restaurant_subscription_genuine_client(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private_finance.enqueue_restaurant_subscription_activation(
  p_restaurant_id uuid,
  p_trigger_type text,
  p_trigger_id uuid,
  p_triggered_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_payment_method_ready boolean := false;
  v_job_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_restaurant_id IS NULL OR p_trigger_id IS NULL OR p_triggered_at IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_trigger_type NOT IN ('reservation', 'order') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_activation_trigger';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND OR v_subscription.status NOT IN (
    'awaiting_payment_method', 'awaiting_activation', 'activation_pending'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_subscription_payment_methods payment_method
    WHERE payment_method.subscription_id = v_subscription.id
  ) INTO v_payment_method_ready;

  INSERT INTO public.restaurant_subscription_activation_jobs (
    subscription_id,
    restaurant_id,
    trigger_type,
    trigger_id,
    triggered_at,
    status,
    available_at,
    metadata
  )
  VALUES (
    v_subscription.id,
    p_restaurant_id,
    p_trigger_type,
    p_trigger_id,
    p_triggered_at,
    'queued',
    v_now,
    jsonb_build_object('first_client_activity', true)
  )
  ON CONFLICT (subscription_id) DO UPDATE
  SET available_at = LEAST(
        public.restaurant_subscription_activation_jobs.available_at,
        EXCLUDED.available_at
      )
  RETURNING id INTO v_job_id;

  -- A client event can precede completion of payment-method setup. Keep the
  -- queued job, then make it claimable as soon as setup becomes ready.
  IF v_subscription.payment_method_ready_at IS NOT NULL
    AND v_payment_method_ready
  THEN
    UPDATE public.restaurant_ai_subscriptions subscription
    SET status = CASE
          WHEN subscription.status IN ('awaiting_payment_method', 'awaiting_activation')
            THEN 'activation_pending'
          ELSE subscription.status
        END,
        activation_requested_at = COALESCE(subscription.activation_requested_at, v_now),
        activation_trigger_type = COALESCE(subscription.activation_trigger_type, p_trigger_type),
        activation_trigger_id = COALESCE(subscription.activation_trigger_id, p_trigger_id),
        activation_triggered_at = COALESCE(subscription.activation_triggered_at, p_triggered_at),
        last_activation_error = NULL
    WHERE subscription.id = v_subscription.id;

    UPDATE public.restaurant_invoices invoice
    SET status = CASE WHEN invoice.status = 'reserved' THEN 'open' ELSE invoice.status END,
        due_at = COALESCE(invoice.due_at, v_now),
        metadata = invoice.metadata || jsonb_build_object(
          'service_period_reserved', false,
          'activation_trigger_type', p_trigger_type,
          'activation_trigger_id', p_trigger_id,
          'activation_triggered_at', p_triggered_at
        )
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.status <> 'paid';
  END IF;

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.enqueue_first_restaurant_subscription_activation(
  p_restaurant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_event record;
BEGIN
  SELECT event_type, event_id, occurred_at
  INTO v_event
  FROM (
    SELECT
      'reservation'::text AS event_type,
      reservation.id AS event_id,
      reservation.created_at AS occurred_at
    FROM public.reservations reservation
    WHERE reservation.restaurant_id = p_restaurant_id
      AND public.restaurant_subscription_genuine_client(
        reservation.user_id,
        reservation.restaurant_id
      )
      AND lower(COALESCE(reservation.status, '')) NOT IN (
        'pending_payment', 'payment_failed', 'expired',
        'cancelled', 'canceled', 'refused', 'no_show', 'no-show'
      )

    UNION ALL

    SELECT
      'order'::text AS event_type,
      client_order.id AS event_id,
      COALESCE(client_order.accepted_at, client_order.created_at) AS occurred_at
    FROM public.orders client_order
    WHERE client_order.restaurant_id = p_restaurant_id
      AND public.restaurant_subscription_genuine_client(
        client_order.user_id,
        client_order.restaurant_id
      )
      AND lower(COALESCE(client_order.status, '')) NOT IN (
        'pending_payment', 'expired',
        'cancelled', 'canceled', 'refused', 'payment_failed', 'failed'
      )
      AND (
        lower(COALESCE(client_order.payment_status, '')) IN ('paid', 'captured', 'succeeded')
        OR lower(COALESCE(client_order.status, '')) IN (
          'confirmed', 'paid', 'accepted', 'preparing', 'ready', 'delivering', 'delivered'
        )
      )
  ) eligible_event
  ORDER BY occurred_at ASC, event_type ASC, event_id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN private_finance.enqueue_restaurant_subscription_activation(
    p_restaurant_id,
    v_event.event_type,
    v_event.event_id,
    v_event.occurred_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.queue_subscription_on_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
BEGIN
  IF public.restaurant_subscription_genuine_client(NEW.user_id, NEW.restaurant_id)
    AND lower(COALESCE(NEW.status, '')) NOT IN (
      'pending_payment', 'payment_failed', 'expired',
      'cancelled', 'canceled', 'refused', 'no_show', 'no-show'
    )
  THEN
    PERFORM private_finance.enqueue_restaurant_subscription_activation(
      NEW.restaurant_id,
      'reservation',
      NEW.id,
      NEW.created_at
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private_finance.queue_subscription_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
BEGIN
  IF public.restaurant_subscription_genuine_client(NEW.user_id, NEW.restaurant_id)
    AND lower(COALESCE(NEW.status, '')) NOT IN (
      'pending_payment', 'expired',
      'cancelled', 'canceled', 'refused', 'payment_failed', 'failed'
    )
    AND (
      lower(COALESCE(NEW.payment_status, '')) IN ('paid', 'captured', 'succeeded')
      OR lower(COALESCE(NEW.status, '')) IN (
        'confirmed', 'paid', 'accepted', 'preparing', 'ready', 'delivering', 'delivered'
      )
    )
  THEN
    PERFORM private_finance.enqueue_restaurant_subscription_activation(
      NEW.restaurant_id,
      'order',
      NEW.id,
      COALESCE(NEW.accepted_at, NEW.created_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_subscription_activation_on_reservation
  ON public.reservations;
CREATE TRIGGER queue_subscription_activation_on_reservation
  AFTER INSERT OR UPDATE OF status
  ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION private_finance.queue_subscription_on_reservation();

DROP TRIGGER IF EXISTS queue_subscription_activation_on_order
  ON public.orders;
CREATE TRIGGER queue_subscription_activation_on_order
  AFTER INSERT OR UPDATE OF status, payment_status
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private_finance.queue_subscription_on_order();

REVOKE ALL ON FUNCTION private_finance.enqueue_restaurant_subscription_activation(
  uuid, text, uuid, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.enqueue_first_restaurant_subscription_activation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.queue_subscription_on_reservation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private_finance.queue_subscription_on_order()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Narrow service-role API used by Stripe setup and the activation worker
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_restaurant_onboarding_payment_method_ready(
  p_signup_application_id uuid,
  p_restaurant_id uuid,
  p_plan_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_setup_intent_id text,
  p_stripe_customer_id text,
  p_stripe_payment_method_id text,
  p_stripe_mode text,
  p_stripe_event_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_application public.signup_applications%ROWTYPE;
  v_existing_event_type text;
  v_job_id uuid;
  v_detected_job_id uuid;
  v_has_paid_activation_proof boolean := false;
  v_is_payment_recovery boolean := false;
  v_now timestamptz := now();
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF p_signup_application_id IS NULL OR p_restaurant_id IS NULL OR p_plan_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_restaurant_and_plan_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_stripe_checkout_session_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_setup_intent_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_customer_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_payment_method_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'complete_stripe_setup_identifiers_required';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT event.event_type INTO v_existing_event_type
  FROM public.restaurant_subscription_payment_events event
  WHERE event.stripe_event_id = p_stripe_event_id;
  IF FOUND AND v_existing_event_type <> 'payment_method_ready' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_event_id_reused_for_another_event_type';
  END IF;

  SELECT * INTO v_application
  FROM public.signup_applications application
  WHERE application.id = p_signup_application_id
    AND application.requested_role = 'restaurateur'::public.app_role
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'restaurateur_signup_application_required';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.signup_application_id = p_signup_application_id
    AND subscription.restaurant_id = p_restaurant_id
    AND subscription.restaurant_subscription_plan_id = p_plan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'matching_deferred_subscription_required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_invoices invoice
    JOIN public.restaurant_subscription_payment_events paid_event
      ON paid_event.invoice_id = invoice.id
     AND paid_event.event_type = 'invoice_paid'
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.status IN ('paid', 'refunded', 'disputed')
  ) INTO v_has_paid_activation_proof;

  v_is_payment_recovery := v_subscription.status = 'past_due';
  IF v_is_payment_recovery AND v_has_paid_activation_proof THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'initial_subscription_payment_already_verified';
  END IF;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET stripe_mode = lower(trim(p_stripe_mode)),
      payment_method_ready_at = COALESCE(subscription.payment_method_ready_at, v_now),
      status = CASE
        WHEN subscription.status IN ('awaiting_payment_method', 'past_due') THEN 'awaiting_activation'
        ELSE subscription.status
      END,
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'payment_method_setup_event_id', p_stripe_event_id,
        'payment_method_setup_ready_at', v_now
      )
  WHERE subscription.id = v_subscription.id
  RETURNING * INTO v_subscription;

  INSERT INTO public.restaurant_subscription_payment_methods (
    subscription_id,
    restaurant_id,
    stripe_checkout_session_id,
    stripe_setup_intent_id,
    stripe_customer_id,
    stripe_payment_method_id,
    stripe_mode,
    ready_at,
    metadata
  )
  VALUES (
    v_subscription.id,
    p_restaurant_id,
    p_stripe_checkout_session_id,
    p_stripe_setup_intent_id,
    p_stripe_customer_id,
    p_stripe_payment_method_id,
    lower(trim(p_stripe_mode)),
    COALESCE(v_subscription.payment_method_ready_at, v_now),
    p_metadata
  )
  ON CONFLICT (subscription_id) DO UPDATE
  SET stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
      stripe_setup_intent_id = EXCLUDED.stripe_setup_intent_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_payment_method_id = EXCLUDED.stripe_payment_method_id,
      stripe_mode = EXCLUDED.stripe_mode,
      ready_at = EXCLUDED.ready_at,
      metadata = public.restaurant_subscription_payment_methods.metadata || EXCLUDED.metadata;

  UPDATE public.signup_applications application
  SET metadata = application.metadata || jsonb_build_object(
        'onboarding_payment_status', 'payment_method_ready',
        'onboarding_payment_method_ready_at', v_now
      )
  WHERE application.id = p_signup_application_id;

  -- A fresh SetupIntent after an initial payment failure is a recovery, not a
  -- new contract. Re-arm the unique outbox job and retain its attempt history.
  IF v_is_payment_recovery THEN
    UPDATE public.restaurant_subscription_activation_jobs job
    SET status = 'queued',
        available_at = v_now,
        locked_at = NULL,
        locked_until = NULL,
        completed_at = NULL,
        last_error_code = NULL,
        last_error_message = NULL,
        metadata = job.metadata || jsonb_build_object(
          'payment_method_recovered_at', v_now,
          'payment_method_recovery_event_id', p_stripe_event_id
        )
    WHERE job.subscription_id = v_subscription.id
    RETURNING job.id INTO v_job_id;

    IF v_job_id IS NOT NULL THEN
      UPDATE public.restaurant_ai_subscriptions subscription
      SET status = 'activation_pending',
          activation_requested_at = COALESCE(subscription.activation_requested_at, v_now),
          last_activation_error = NULL
      WHERE subscription.id = v_subscription.id
      RETURNING * INTO v_subscription;
    END IF;

    UPDATE public.restaurant_invoices invoice
    SET status = CASE WHEN invoice.status = 'past_due' THEN 'open' ELSE invoice.status END,
        due_at = COALESCE(invoice.due_at, v_now),
        metadata = invoice.metadata || jsonb_build_object(
          'payment_method_recovered_at', v_now,
          'payment_method_recovery_event_id', p_stripe_event_id
        )
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.status NOT IN ('paid', 'refunded', 'disputed');
  END IF;

  -- Covers the race where activity occurred before SetupIntent completion.
  v_detected_job_id := private_finance.enqueue_first_restaurant_subscription_activation(
    p_restaurant_id
  );
  v_job_id := COALESCE(v_detected_job_id, v_job_id);

  INSERT INTO public.restaurant_subscription_payment_events (
    stripe_event_id,
    event_type,
    restaurant_id,
    subscription_id,
    invoice_id,
    stripe_subscription_id,
    metadata
  )
  VALUES (
    p_stripe_event_id,
    'payment_method_ready',
    p_restaurant_id,
    v_subscription.id,
    v_subscription.internal_invoice_id,
    NULL,
    p_metadata || jsonb_build_object(
      'stripe_setup_intent_id', p_stripe_setup_intent_id,
      'stripe_checkout_session_id', p_stripe_checkout_session_id
    )
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.id = v_subscription.id;

  RETURN jsonb_build_object(
    'subscription_id', v_subscription.id,
    'invoice_id', v_subscription.internal_invoice_id,
    'status', v_subscription.status,
    'activation_job_id', v_job_id,
    'idempotent', v_existing_event_type IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_restaurant_subscription_activation_jobs(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  job_id uuid,
  subscription_id uuid,
  internal_invoice_id uuid,
  restaurant_id uuid,
  signup_application_id uuid,
  plan_id uuid,
  plan_slug text,
  plan_name text,
  amount_chf numeric,
  currency text,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_setup_intent_id text,
  stripe_mode text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  activation_mode text,
  attempt_count integer,
  activation_trigger_type text,
  activation_trigger_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_lease integer := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 15), 900);
  v_candidate record;
  v_claimed public.restaurant_subscription_activation_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;

  FOR v_candidate IN
    SELECT job.id
    FROM public.restaurant_subscription_activation_jobs job
    JOIN public.restaurant_ai_subscriptions subscription
      ON subscription.id = job.subscription_id
    JOIN public.restaurant_subscription_payment_methods payment_method
      ON payment_method.subscription_id = subscription.id
    WHERE subscription.status = 'activation_pending'
      AND subscription.payment_method_ready_at IS NOT NULL
      AND job.available_at <= now()
      AND (
        job.status = 'queued'
        OR (job.status = 'processing' AND job.locked_until <= now())
      )
    ORDER BY job.triggered_at ASC, job.created_at ASC
    FOR UPDATE OF job SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.restaurant_subscription_activation_jobs job
    SET status = 'processing',
        attempt_count = job.attempt_count + 1,
        locked_at = now(),
        locked_until = now() + make_interval(secs => v_lease),
        last_error_code = NULL,
        last_error_message = NULL
    WHERE job.id = v_candidate.id
    RETURNING * INTO v_claimed;

    UPDATE public.restaurant_invoices invoice
    SET status = CASE WHEN invoice.status IN ('reserved', 'open') THEN 'processing' ELSE invoice.status END,
        due_at = COALESCE(invoice.due_at, now())
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.id = v_claimed.subscription_id
      AND invoice.id = subscription.internal_invoice_id
      AND invoice.status <> 'paid';

    RETURN QUERY
    SELECT
      v_claimed.id,
      subscription.id,
      subscription.internal_invoice_id,
      subscription.restaurant_id,
      subscription.signup_application_id,
      subscription.restaurant_subscription_plan_id,
      subscription.plan,
      COALESCE(plan.name, subscription.plan),
      COALESCE(subscription.price_monthly_chf_snapshot, invoice.amount_ttc),
      subscription.currency,
      payment_method.stripe_customer_id,
      payment_method.stripe_payment_method_id,
      payment_method.stripe_setup_intent_id,
      payment_method.stripe_mode,
      subscription.stripe_subscription_id,
      invoice.stripe_invoice_id,
      CASE
        WHEN subscription.stripe_subscription_id IS NOT NULL THEN 'retry_payment'
        ELSE 'create_subscription'
      END,
      v_claimed.attempt_count,
      v_claimed.trigger_type,
      v_claimed.trigger_id
    FROM public.restaurant_ai_subscriptions subscription
    LEFT JOIN public.restaurant_subscription_plans plan
      ON plan.id = subscription.restaurant_subscription_plan_id
    LEFT JOIN public.restaurant_invoices invoice
      ON invoice.id = subscription.internal_invoice_id
    JOIN public.restaurant_subscription_payment_methods payment_method
      ON payment_method.subscription_id = subscription.id
    WHERE subscription.id = v_claimed.subscription_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_restaurant_subscription_activation_job(
  p_job_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_stripe_price_id text,
  p_stripe_mode text,
  p_subscription_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.restaurant_subscription_activation_jobs%ROWTYPE;
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_normalized_stripe_status text := lower(trim(COALESCE(p_subscription_status, '')));
  v_now timestamptz := now();
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF p_job_id IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_subscription_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_customer_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'job_subscription_and_customer_required';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF p_current_period_start IS NOT NULL
    AND p_current_period_end IS NOT NULL
    AND p_current_period_end <= p_current_period_start
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_period';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT * INTO v_job
  FROM public.restaurant_subscription_activation_jobs job
  WHERE job.id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'activation_job_not_found';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.id = v_job.subscription_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'activation_subscription_not_found';
  END IF;

  UPDATE public.restaurant_subscription_payment_methods payment_method
  SET stripe_customer_id = p_stripe_customer_id,
      stripe_mode = lower(trim(p_stripe_mode)),
      metadata = payment_method.metadata || p_metadata
  WHERE payment_method.subscription_id = v_subscription.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'subscription_payment_method_not_ready';
  END IF;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET stripe_subscription_id = p_stripe_subscription_id,
      stripe_price_id = NULLIF(trim(COALESCE(p_stripe_price_id, '')), ''),
      stripe_mode = lower(trim(p_stripe_mode)),
      current_period_start = COALESCE(p_current_period_start, subscription.current_period_start),
      current_period_end = COALESCE(p_current_period_end, subscription.current_period_end),
      activation_completed_at = COALESCE(subscription.activation_completed_at, v_now),
      status = CASE
        WHEN subscription.status IN ('active', 'cancelled', 'past_due') THEN subscription.status
        WHEN v_normalized_stripe_status IN (
          'past_due', 'unpaid', 'incomplete', 'incomplete_expired'
        ) THEN 'past_due'
        ELSE 'activation_pending'
      END,
      last_activation_error = CASE
        WHEN subscription.status IN ('cancelled', 'past_due') THEN subscription.last_activation_error
        ELSE NULL
      END,
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'stripe_activation_status', v_normalized_stripe_status,
        'activation_job_id', p_job_id
      )
  WHERE subscription.id = v_subscription.id
  RETURNING * INTO v_subscription;

  UPDATE public.restaurant_invoices invoice
  SET stripe_subscription_id = p_stripe_subscription_id,
      period_start = CASE
        WHEN invoice.status <> 'paid' AND p_current_period_start IS NOT NULL
          THEN (p_current_period_start AT TIME ZONE 'Europe/Zurich')::date
        ELSE invoice.period_start
      END,
      period_end = CASE
        WHEN invoice.status <> 'paid' AND p_current_period_end IS NOT NULL
          THEN ((p_current_period_end - interval '1 second') AT TIME ZONE 'Europe/Zurich')::date
        ELSE invoice.period_end
      END,
      status = CASE
        WHEN invoice.status IN ('paid', 'refunded', 'disputed', 'cancelled', 'past_due')
          THEN invoice.status
        WHEN v_normalized_stripe_status IN (
          'past_due', 'unpaid', 'incomplete', 'incomplete_expired'
        ) THEN 'past_due'
        ELSE 'processing'
      END,
      metadata = invoice.metadata || p_metadata || jsonb_build_object(
        'stripe_activation_status', v_normalized_stripe_status,
        'activation_job_id', p_job_id
      )
  WHERE invoice.id = v_subscription.internal_invoice_id;

  UPDATE public.restaurant_subscription_activation_jobs job
  SET status = 'completed',
      completed_at = COALESCE(job.completed_at, v_now),
      locked_at = NULL,
      locked_until = NULL,
      last_error_code = NULL,
      last_error_message = NULL,
      metadata = job.metadata || p_metadata || jsonb_build_object(
        'stripe_subscription_id', p_stripe_subscription_id,
        'stripe_subscription_status', v_normalized_stripe_status
      )
  WHERE job.id = p_job_id;

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'subscription_id', v_subscription.id,
    'invoice_id', v_subscription.internal_invoice_id,
    'status', v_subscription.status,
    'commission_status', 'pending_payment'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_restaurant_subscription_activation_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean DEFAULT true,
  p_retry_after_seconds integer DEFAULT 60,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.restaurant_subscription_activation_jobs%ROWTYPE;
  v_subscription_status text;
  v_retry_after integer := LEAST(GREATEST(COALESCE(p_retry_after_seconds, 60), 5), 86400);
  v_error_code text := left(COALESCE(NULLIF(trim(p_error_code), ''), 'activation_failed'), 200);
  v_error_message text := left(COALESCE(NULLIF(trim(p_error_message), ''), 'Unknown activation error'), 2000);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'activation_job_required';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT * INTO v_job
  FROM public.restaurant_subscription_activation_jobs job
  WHERE job.id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'activation_job_not_found';
  END IF;

  IF v_job.status = 'completed' THEN
    SELECT subscription.status INTO v_subscription_status
    FROM public.restaurant_ai_subscriptions subscription
    WHERE subscription.id = v_job.subscription_id;
    RETURN jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'subscription_status', v_subscription_status,
      'idempotent', true
    );
  END IF;

  UPDATE public.restaurant_subscription_activation_jobs job
  SET status = CASE WHEN COALESCE(p_retryable, true) THEN 'queued' ELSE 'failed' END,
      available_at = CASE
        WHEN COALESCE(p_retryable, true)
          THEN now() + make_interval(secs => v_retry_after)
        ELSE job.available_at
      END,
      locked_at = NULL,
      locked_until = NULL,
      completed_at = CASE WHEN COALESCE(p_retryable, true) THEN NULL ELSE now() END,
      last_error_code = v_error_code,
      last_error_message = v_error_message,
      metadata = job.metadata || p_metadata
  WHERE job.id = p_job_id
  RETURNING * INTO v_job;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET status = CASE
        WHEN subscription.status IN ('active', 'cancelled', 'past_due') THEN subscription.status
        WHEN COALESCE(p_retryable, true) THEN 'activation_pending'
        ELSE 'past_due'
      END,
      last_activation_error = v_error_message,
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'activation_error_code', v_error_code,
        'activation_retryable', COALESCE(p_retryable, true)
      )
  WHERE subscription.id = v_job.subscription_id
  RETURNING status INTO v_subscription_status;

  UPDATE public.restaurant_invoices invoice
  SET status = CASE
        WHEN invoice.status IN ('paid', 'refunded', 'disputed', 'cancelled', 'past_due')
          THEN invoice.status
        WHEN COALESCE(p_retryable, true) THEN 'open'
        ELSE 'past_due'
      END,
      metadata = invoice.metadata || jsonb_build_object(
        'activation_error_code', v_error_code,
        'activation_error_message', v_error_message
      )
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.id = v_job.subscription_id
    AND invoice.id = subscription.internal_invoice_id;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'subscription_status', v_subscription_status,
    'retry_at', CASE WHEN v_job.status = 'queued' THEN v_job.available_at ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_restaurant_subscription_invoice_paid(
  p_stripe_event_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_restaurant_id uuid,
  p_amount_paid_cents bigint,
  p_currency text,
  p_billing_reason text,
  p_paid_at timestamptz,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_stripe_mode text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_existing_event_type text;
  v_existing_event_invoice_id uuid;
  v_is_activation_payment boolean := false;
  v_expected_cents bigint := 0;
  v_commissions_transitioned integer := 0;
  v_paid_at timestamptz := COALESCE(p_paid_at, now());
  v_currency text := upper(trim(COALESCE(p_currency, '')));
  v_prior_reversal_event_id text;
  v_prior_reversal_is_dispute boolean := false;
  v_prior_reversal_is_full boolean := false;
  v_prior_cancellation_event_id text;
  v_prior_cancelled_at timestamptz;
  v_payment_after_cancellation boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_invoice_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_subscription_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_invoice_and_subscription_required';
  END IF;
  IF p_amount_paid_cents IS NULL OR p_amount_paid_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_paid_amount';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT event.event_type, event.invoice_id
  INTO v_existing_event_type, v_existing_event_invoice_id
  FROM public.restaurant_subscription_payment_events event
  WHERE event.stripe_event_id = p_stripe_event_id;
  IF FOUND AND v_existing_event_type <> 'invoice_paid' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_event_id_reused_for_another_event_type';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.stripe_subscription_id = p_stripe_subscription_id
     OR (
       p_restaurant_id IS NOT NULL
       AND subscription.restaurant_id = p_restaurant_id
       AND subscription.stripe_subscription_id IS NULL
       AND p_metadata->>'internal_invoice_id' = subscription.internal_invoice_id::text
       AND EXISTS (
           SELECT 1
           FROM public.restaurant_subscription_activation_jobs job
           WHERE job.subscription_id = subscription.id
             AND job.id::text = p_metadata->>'activation_job_id'
         )
     )
  ORDER BY (subscription.stripe_subscription_id = p_stripe_subscription_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.restaurant_subscription_payment_events (
      stripe_event_id, event_type, restaurant_id, stripe_invoice_id,
      stripe_subscription_id, metadata
    ) VALUES (
      p_stripe_event_id, 'invoice_paid', p_restaurant_id, p_stripe_invoice_id,
      p_stripe_subscription_id, p_metadata || jsonb_build_object('matched', false)
    ) ON CONFLICT (stripe_event_id) DO NOTHING;

    RETURN jsonb_build_object(
      'matched', false,
      'commission_transitioned', false,
      'reason', 'subscription_not_managed_by_deferred_lifecycle'
    );
  END IF;

  IF v_subscription.internal_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.invoice_type = 'subscription'
    FOR UPDATE;
  END IF;

  v_is_activation_payment := v_invoice.id IS NOT NULL
    AND (
      v_existing_event_invoice_id = v_invoice.id
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.restaurant_subscription_payment_events paid_event
          WHERE paid_event.event_type = 'invoice_paid'
            AND paid_event.invoice_id = v_invoice.id
        )
        AND (
          v_invoice.stripe_invoice_id = p_stripe_invoice_id
          OR v_invoice.metadata->>'stripe_latest_invoice_id' = p_stripe_invoice_id
          OR (
            v_invoice.stripe_invoice_id IS NULL
            AND NULLIF(v_invoice.metadata->>'stripe_latest_invoice_id', '') IS NULL
            AND lower(trim(COALESCE(p_billing_reason, ''))) = 'subscription_create'
          )
        )
      )
    );

  IF v_is_activation_payment AND v_invoice.status <> 'paid' THEN
    v_expected_cents := round(v_invoice.amount_ttc * 100)::bigint;
    IF v_currency <> upper(v_invoice.currency) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'paid_invoice_currency_mismatch';
    END IF;
    IF p_amount_paid_cents < v_expected_cents THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'paid_amount_below_reserved_invoice_total';
    END IF;
  END IF;

  IF v_is_activation_payment THEN
    -- Stripe does not guarantee webhook delivery order. Reconcile decisive
    -- refunds/disputes and cancellations already received before invoice.paid.
    SELECT
      reversal.stripe_event_id,
      lower(COALESCE(reversal.metadata->>'source_event_type', '')) LIKE '%dispute%',
      COALESCE(reversal.metadata->>'full_reversal', 'false') = 'true'
    INTO
      v_prior_reversal_event_id,
      v_prior_reversal_is_dispute,
      v_prior_reversal_is_full
    FROM public.restaurant_subscription_payment_events reversal
    WHERE reversal.event_type = 'payment_reversed'
      AND reversal.stripe_invoice_id = p_stripe_invoice_id
      AND (
        lower(COALESCE(reversal.metadata->>'source_event_type', '')) LIKE '%dispute%'
        OR COALESCE(reversal.metadata->>'full_reversal', 'false') = 'true'
      )
    ORDER BY reversal.processed_at DESC
    LIMIT 1;

    SELECT
      cancellation.stripe_event_id,
      COALESCE(
        NULLIF(cancellation.metadata->>'cancelled_at', '')::timestamptz,
        cancellation.processed_at
      )
    INTO v_prior_cancellation_event_id, v_prior_cancelled_at
    FROM public.restaurant_subscription_payment_events cancellation
    WHERE cancellation.event_type = 'subscription_cancelled_before_payment'
      AND cancellation.stripe_subscription_id = p_stripe_subscription_id
    ORDER BY COALESCE(
      NULLIF(cancellation.metadata->>'cancelled_at', '')::timestamptz,
      cancellation.processed_at
    ) DESC
    LIMIT 1;

    v_payment_after_cancellation := v_prior_cancelled_at IS NOT NULL
      AND v_paid_at > v_prior_cancelled_at;
  END IF;

  -- Insert the proof before touching the follow-up. The follow-up trigger only
  -- trusts this receipt plus the paid internal invoice, never an admin status.
  INSERT INTO public.restaurant_subscription_payment_events (
    stripe_event_id,
    event_type,
    restaurant_id,
    subscription_id,
    invoice_id,
    stripe_invoice_id,
    stripe_subscription_id,
    metadata
  )
  VALUES (
    p_stripe_event_id,
    'invoice_paid',
    v_subscription.restaurant_id,
    v_subscription.id,
    CASE WHEN v_is_activation_payment THEN v_invoice.id ELSE NULL END,
    p_stripe_invoice_id,
    p_stripe_subscription_id,
    p_metadata || jsonb_build_object(
      'matched', true,
      'activation_payment', v_is_activation_payment,
      'billing_reason', p_billing_reason,
      'amount_paid_cents', p_amount_paid_cents,
      'currency', v_currency,
      'paid_at', v_paid_at,
      'prior_reversal_event_id', v_prior_reversal_event_id,
      'prior_cancellation_event_id', v_prior_cancellation_event_id,
      'payment_after_cancellation', v_payment_after_cancellation
    )
  )
  ON CONFLICT (stripe_event_id) DO UPDATE
  SET restaurant_id = EXCLUDED.restaurant_id,
      subscription_id = EXCLUDED.subscription_id,
      invoice_id = COALESCE(
        public.restaurant_subscription_payment_events.invoice_id,
        EXCLUDED.invoice_id
      ),
      stripe_invoice_id = EXCLUDED.stripe_invoice_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      metadata = public.restaurant_subscription_payment_events.metadata || EXCLUDED.metadata;

  IF v_is_activation_payment THEN
    UPDATE public.restaurant_invoices invoice
    SET status = CASE
          WHEN v_prior_reversal_is_dispute THEN 'disputed'
          WHEN v_prior_reversal_is_full THEN 'refunded'
          ELSE 'paid'
        END,
        paid_at = COALESCE(invoice.paid_at, v_paid_at),
        due_at = COALESCE(invoice.due_at, v_paid_at),
        stripe_invoice_id = COALESCE(invoice.stripe_invoice_id, p_stripe_invoice_id),
        stripe_subscription_id = p_stripe_subscription_id,
        period_start = CASE
          WHEN p_period_start IS NOT NULL
            THEN (p_period_start AT TIME ZONE 'Europe/Zurich')::date
          ELSE invoice.period_start
        END,
        period_end = CASE
          WHEN p_period_end IS NOT NULL
            THEN ((p_period_end - interval '1 second') AT TIME ZONE 'Europe/Zurich')::date
          ELSE invoice.period_end
        END,
        metadata = invoice.metadata || p_metadata || jsonb_build_object(
          'stripe_event_id', p_stripe_event_id,
          'billing_reason', p_billing_reason,
          'amount_paid_cents', p_amount_paid_cents,
          'service_period_reserved', false,
          'prior_reversal_event_id', v_prior_reversal_event_id,
          'prior_cancellation_event_id', v_prior_cancellation_event_id,
          'payment_after_cancellation', v_payment_after_cancellation
        )
    WHERE invoice.id = v_invoice.id
    RETURNING * INTO v_invoice;
  END IF;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET stripe_subscription_id = p_stripe_subscription_id,
      stripe_mode = lower(trim(p_stripe_mode)),
      status = CASE
        WHEN subscription.status = 'cancelled'
          OR v_prior_cancellation_event_id IS NOT NULL THEN 'cancelled'
        ELSE 'active'
      END,
      started_at = COALESCE(
        subscription.started_at,
        p_period_start,
        CASE WHEN v_is_activation_payment THEN v_paid_at ELSE NULL END
      ),
      current_period_start = COALESCE(p_period_start, subscription.current_period_start),
      current_period_end = COALESCE(p_period_end, subscription.current_period_end),
      activated_at = CASE
        WHEN v_is_activation_payment THEN COALESCE(subscription.activated_at, v_paid_at)
        ELSE subscription.activated_at
      END,
      last_activation_error = NULL,
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'last_paid_stripe_invoice_id', p_stripe_invoice_id,
        'last_paid_stripe_event_id', p_stripe_event_id,
        'last_billing_reason', p_billing_reason,
        'prior_reversal_event_id', v_prior_reversal_event_id,
        'prior_cancellation_event_id', v_prior_cancellation_event_id,
        'payment_after_cancellation', v_payment_after_cancellation
      )
  WHERE subscription.id = v_subscription.id
  RETURNING * INTO v_subscription;

  UPDATE public.restaurant_subscription_payment_methods payment_method
  SET stripe_customer_id = COALESCE(
        NULLIF(trim(COALESCE(p_stripe_customer_id, '')), ''),
        payment_method.stripe_customer_id
      ),
      stripe_mode = lower(trim(p_stripe_mode))
  WHERE payment_method.subscription_id = v_subscription.id;

  IF v_is_activation_payment THEN
    IF v_prior_reversal_event_id IS NOT NULL THEN
      UPDATE public.commercial_subscription_commissions commission
      SET status = 'reversed',
          earned_at = COALESCE(commission.earned_at, v_invoice.paid_at, v_paid_at),
          restaurant_id = v_subscription.restaurant_id,
          subscription_id = v_subscription.id,
          invoice_id = v_invoice.id,
          metadata = commission.metadata || jsonb_build_object(
            'earned_from_stripe_event_id', p_stripe_event_id,
            'earned_from_stripe_invoice_id', p_stripe_invoice_id,
            'reversal_event_id', v_prior_reversal_event_id,
            'reconciled_out_of_order', true
          )
      WHERE commission.status IN ('pending_payment', 'payable', 'paid', 'cancelled')
        AND commission.plan_slug = COALESCE(v_invoice.metadata->>'plan_slug', v_subscription.plan)
        AND (
          commission.invoice_id = v_invoice.id
          OR commission.subscription_id = v_subscription.id
          OR (
            commission.restaurant_id = v_subscription.restaurant_id
            AND EXISTS (
              SELECT 1
              FROM public.commercial_prospect_followups followup
              WHERE followup.source_objectid = commission.source_objectid
                AND followup.signed_restaurant_id = v_subscription.restaurant_id
            )
          )
        );
    ELSIF v_payment_after_cancellation THEN
      UPDATE public.commercial_subscription_commissions commission
      SET status = 'cancelled',
          earned_at = NULL,
          cancelled_at = COALESCE(commission.cancelled_at, v_prior_cancelled_at),
          restaurant_id = v_subscription.restaurant_id,
          subscription_id = v_subscription.id,
          invoice_id = v_invoice.id,
          metadata = commission.metadata || jsonb_build_object(
            'payment_after_cancellation_event_id', p_stripe_event_id,
            'cancellation_event_id', v_prior_cancellation_event_id,
            'reconciled_out_of_order', true
          )
      WHERE commission.status IN ('pending_payment', 'payable', 'cancelled')
        AND commission.plan_slug = COALESCE(v_invoice.metadata->>'plan_slug', v_subscription.plan)
        AND (
          commission.invoice_id = v_invoice.id
          OR commission.subscription_id = v_subscription.id
          OR (
            commission.restaurant_id = v_subscription.restaurant_id
            AND EXISTS (
              SELECT 1
              FROM public.commercial_prospect_followups followup
              WHERE followup.source_objectid = commission.source_objectid
                AND followup.signed_restaurant_id = v_subscription.restaurant_id
            )
          )
        );
    ELSE
      UPDATE public.commercial_subscription_commissions commission
      SET status = 'payable',
          earned_at = COALESCE(commission.earned_at, v_invoice.paid_at, v_paid_at),
          cancelled_at = NULL,
          restaurant_id = v_subscription.restaurant_id,
          subscription_id = v_subscription.id,
          invoice_id = v_invoice.id,
          metadata = commission.metadata || jsonb_build_object(
            'earned_from_stripe_event_id', p_stripe_event_id,
            'earned_from_stripe_invoice_id', p_stripe_invoice_id,
            'prior_cancellation_event_id', v_prior_cancellation_event_id
          )
      WHERE commission.status IN ('pending_payment', 'cancelled')
        AND commission.plan_slug = COALESCE(v_invoice.metadata->>'plan_slug', v_subscription.plan)
        AND (
          commission.invoice_id = v_invoice.id
          OR commission.subscription_id = v_subscription.id
          OR (
            commission.restaurant_id = v_subscription.restaurant_id
            AND EXISTS (
              SELECT 1
              FROM public.commercial_prospect_followups followup
              WHERE followup.source_objectid = commission.source_objectid
                AND followup.signed_restaurant_id = v_subscription.restaurant_id
            )
          )
        );
    END IF;
    GET DIAGNOSTICS v_commissions_transitioned = ROW_COUNT;

    UPDATE public.commercial_prospect_followups followup
    SET acquisition_commission_status = commission.status,
        earned_at = commission.earned_at,
        updated_at = now()
    FROM public.commercial_subscription_commissions commission
    WHERE commission.source_objectid = followup.source_objectid
      AND commission.status IN ('payable', 'paid', 'cancelled', 'reversed')
      AND commission.invoice_id = v_invoice.id;

    UPDATE public.signup_applications application
    SET metadata = application.metadata || jsonb_build_object(
          'onboarding_payment_status', CASE
            WHEN v_prior_reversal_event_id IS NOT NULL THEN 'reversed'
            WHEN v_payment_after_cancellation THEN 'cancelled'
            ELSE 'paid'
          END,
          'onboarding_paid_at', v_invoice.paid_at,
          'onboarding_stripe_invoice_id', p_stripe_invoice_id,
          'stripe_subscription_id', p_stripe_subscription_id,
          'prior_reversal_event_id', v_prior_reversal_event_id,
          'prior_cancellation_event_id', v_prior_cancellation_event_id,
          'payment_after_cancellation', v_payment_after_cancellation
        )
    WHERE application.id = v_subscription.signup_application_id;
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'subscription_id', v_subscription.id,
    'invoice_id', CASE WHEN v_is_activation_payment THEN v_invoice.id ELSE NULL END,
    'activation_payment', v_is_activation_payment,
    'subscription_status', v_subscription.status,
    'commission_transitioned', v_commissions_transitioned > 0,
    'commissions_transitioned_count', v_commissions_transitioned
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_restaurant_subscription_invoice_payment_failed(
  p_stripe_event_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_restaurant_id uuid,
  p_amount_due_cents bigint,
  p_currency text,
  p_attempt_count integer,
  p_next_payment_attempt timestamptz,
  p_stripe_mode text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_existing_event_type text;
  v_matches_initial_invoice boolean := false;
  v_is_initial_invoice boolean := false;
  v_stale_failure boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_invoice_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_subscription_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stripe_event_invoice_and_subscription_required';
  END IF;
  IF p_amount_due_cents IS NULL OR p_amount_due_cents < 0
    OR COALESCE(p_attempt_count, 0) < 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_failed_invoice_amount_or_attempt';
  END IF;
  IF upper(trim(COALESCE(p_currency, ''))) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT event.event_type INTO v_existing_event_type
  FROM public.restaurant_subscription_payment_events event
  WHERE event.stripe_event_id = p_stripe_event_id;
  IF FOUND AND v_existing_event_type <> 'invoice_payment_failed' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_event_id_reused_for_another_event_type';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.stripe_subscription_id = p_stripe_subscription_id
     OR (
       p_restaurant_id IS NOT NULL
       AND subscription.restaurant_id = p_restaurant_id
       AND subscription.stripe_subscription_id IS NULL
       AND p_metadata->>'internal_invoice_id' = subscription.internal_invoice_id::text
       AND EXISTS (
           SELECT 1
           FROM public.restaurant_subscription_activation_jobs job
           WHERE job.subscription_id = subscription.id
             AND job.id::text = p_metadata->>'activation_job_id'
         )
     )
  ORDER BY (subscription.stripe_subscription_id = p_stripe_subscription_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.restaurant_subscription_payment_events (
      stripe_event_id, event_type, restaurant_id, stripe_invoice_id,
      stripe_subscription_id, metadata
    ) VALUES (
      p_stripe_event_id, 'invoice_payment_failed', p_restaurant_id,
      p_stripe_invoice_id, p_stripe_subscription_id,
      p_metadata || jsonb_build_object('matched', false)
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
    RETURN jsonb_build_object('matched', false, 'commission_status', 'unchanged');
  END IF;

  IF v_subscription.internal_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.invoice_type = 'subscription'
    FOR UPDATE;
  END IF;
  v_matches_initial_invoice := v_invoice.id IS NOT NULL
    AND (
      v_invoice.stripe_invoice_id = p_stripe_invoice_id
      OR v_invoice.metadata->>'stripe_latest_invoice_id' = p_stripe_invoice_id
      OR (
        v_invoice.stripe_invoice_id IS NULL
        AND NULLIF(v_invoice.metadata->>'stripe_latest_invoice_id', '') IS NULL
        AND p_metadata->>'internal_invoice_id' = v_invoice.id::text
      )
    );
  v_stale_failure := v_subscription.status = 'cancelled'
    OR EXISTS (
      SELECT 1
      FROM public.restaurant_subscription_payment_events paid_event
      WHERE paid_event.event_type = 'invoice_paid'
        AND paid_event.stripe_invoice_id = p_stripe_invoice_id
    )
    OR (
      v_matches_initial_invoice
      AND v_invoice.status IN ('paid', 'refunded', 'disputed')
    );
  v_is_initial_invoice := v_matches_initial_invoice AND NOT v_stale_failure;

  INSERT INTO public.restaurant_subscription_payment_events (
    stripe_event_id,
    event_type,
    restaurant_id,
    subscription_id,
    invoice_id,
    stripe_invoice_id,
    stripe_subscription_id,
    metadata
  ) VALUES (
    p_stripe_event_id,
    'invoice_payment_failed',
    v_subscription.restaurant_id,
    v_subscription.id,
    CASE WHEN v_matches_initial_invoice THEN v_invoice.id ELSE NULL END,
    p_stripe_invoice_id,
    p_stripe_subscription_id,
    p_metadata || jsonb_build_object(
      'matched', true,
      'initial_invoice', v_is_initial_invoice,
      'matches_initial_invoice', v_matches_initial_invoice,
      'stale_failure_ignored', v_stale_failure,
      'amount_due_cents', p_amount_due_cents,
      'currency', upper(trim(p_currency)),
      'attempt_count', COALESCE(p_attempt_count, 0),
      'next_payment_attempt', p_next_payment_attempt
    )
  ) ON CONFLICT (stripe_event_id) DO UPDATE
  SET metadata = public.restaurant_subscription_payment_events.metadata || EXCLUDED.metadata;

  IF v_stale_failure THEN
    RETURN jsonb_build_object(
      'matched', true,
      'subscription_id', v_subscription.id,
      'invoice_id', CASE WHEN v_matches_initial_invoice THEN v_invoice.id ELSE NULL END,
      'initial_invoice', false,
      'stale_failure_ignored', true,
      'subscription_status', v_subscription.status,
      'commission_status', 'unchanged'
    );
  END IF;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET stripe_subscription_id = p_stripe_subscription_id,
      stripe_mode = lower(trim(p_stripe_mode)),
      status = 'past_due',
      last_activation_error = 'subscription_invoice_payment_failed',
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'last_failed_stripe_invoice_id', p_stripe_invoice_id,
        'last_failed_stripe_event_id', p_stripe_event_id,
        'payment_attempt_count', COALESCE(p_attempt_count, 0),
        'next_payment_attempt', p_next_payment_attempt
      )
  WHERE subscription.id = v_subscription.id
  RETURNING * INTO v_subscription;

  UPDATE public.restaurant_subscription_payment_methods payment_method
  SET stripe_customer_id = COALESCE(
        NULLIF(trim(COALESCE(p_stripe_customer_id, '')), ''),
        payment_method.stripe_customer_id
      ),
      stripe_mode = lower(trim(p_stripe_mode))
  WHERE payment_method.subscription_id = v_subscription.id;

  IF v_is_initial_invoice THEN
    UPDATE public.restaurant_invoices invoice
    SET status = 'past_due',
        due_at = COALESCE(invoice.due_at, now()),
        stripe_invoice_id = COALESCE(invoice.stripe_invoice_id, p_stripe_invoice_id),
        stripe_subscription_id = p_stripe_subscription_id,
        metadata = invoice.metadata || p_metadata || jsonb_build_object(
          'payment_failed_event_id', p_stripe_event_id,
          'amount_due_cents', p_amount_due_cents,
          'attempt_count', COALESCE(p_attempt_count, 0),
          'next_payment_attempt', p_next_payment_attempt
        )
    WHERE invoice.id = v_invoice.id;

    UPDATE public.signup_applications application
    SET metadata = application.metadata || jsonb_build_object(
          'onboarding_payment_status', 'payment_failed',
          'onboarding_payment_failed_at', now(),
          'onboarding_stripe_invoice_id', p_stripe_invoice_id
        )
    WHERE application.id = v_subscription.signup_application_id;
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'subscription_id', v_subscription.id,
    'invoice_id', CASE WHEN v_is_initial_invoice THEN v_invoice.id ELSE NULL END,
    'initial_invoice', v_is_initial_invoice,
    'subscription_status', v_subscription.status,
    'commission_status', 'pending_payment'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_restaurant_subscription_payment_reversed(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_charge_id text,
  p_stripe_dispute_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_restaurant_id uuid,
  p_amount_reversed_cents bigint,
  p_currency text,
  p_full_reversal boolean,
  p_reason text,
  p_stripe_mode text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_existing_event_type text;
  v_is_dispute boolean := lower(COALESCE(p_event_type, '')) LIKE '%dispute%';
  v_is_activation_reversal boolean := false;
  v_should_reverse_commission boolean := false;
  v_reversed_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_charge_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_event_type, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reversal_event_type_and_charge_required';
  END IF;
  IF p_amount_reversed_cents IS NULL OR p_amount_reversed_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reversed_amount';
  END IF;
  IF upper(trim(COALESCE(p_currency, ''))) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_currency';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT event.event_type INTO v_existing_event_type
  FROM public.restaurant_subscription_payment_events event
  WHERE event.stripe_event_id = p_stripe_event_id;
  IF FOUND AND v_existing_event_type <> 'payment_reversed' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_event_id_reused_for_another_event_type';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE (
      p_stripe_subscription_id IS NOT NULL
      AND subscription.stripe_subscription_id = p_stripe_subscription_id
    )
    OR (
      p_restaurant_id IS NOT NULL
      AND subscription.restaurant_id = p_restaurant_id
      AND subscription.stripe_subscription_id IS NULL
      AND p_metadata->>'internal_invoice_id' = subscription.internal_invoice_id::text
      AND EXISTS (
          SELECT 1
          FROM public.restaurant_subscription_activation_jobs job
          WHERE job.subscription_id = subscription.id
            AND job.id::text = p_metadata->>'activation_job_id'
        )
    )
  ORDER BY (
    p_stripe_subscription_id IS NOT NULL
    AND subscription.stripe_subscription_id = p_stripe_subscription_id
  ) DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_subscription.internal_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.invoice_type = 'subscription'
    FOR UPDATE;
  END IF;

  -- Never reverse an acquisition commission from a renewal refund. The Edge
  -- handler must resolve the charge to the exact Stripe invoice, which must be
  -- the activation invoice stored on the internal reserved invoice.
  v_is_activation_reversal := v_invoice.id IS NOT NULL
    AND NULLIF(trim(COALESCE(p_stripe_invoice_id, '')), '') IS NOT NULL
    AND v_invoice.stripe_invoice_id = p_stripe_invoice_id
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_subscription_payment_events paid_event
      WHERE paid_event.event_type = 'invoice_paid'
        AND paid_event.invoice_id = v_invoice.id
        AND paid_event.stripe_invoice_id = p_stripe_invoice_id
    );
  v_should_reverse_commission := v_is_activation_reversal
    AND (COALESCE(p_full_reversal, false) OR v_is_dispute);

  INSERT INTO public.restaurant_subscription_payment_events (
    stripe_event_id,
    event_type,
    restaurant_id,
    subscription_id,
    invoice_id,
    stripe_invoice_id,
    stripe_subscription_id,
    metadata
  ) VALUES (
    p_stripe_event_id,
    'payment_reversed',
    COALESCE(v_subscription.restaurant_id, p_restaurant_id),
    v_subscription.id,
    CASE WHEN v_is_activation_reversal THEN v_invoice.id ELSE NULL END,
    p_stripe_invoice_id,
    p_stripe_subscription_id,
    p_metadata || jsonb_build_object(
      'source_event_type', p_event_type,
      'stripe_charge_id', p_stripe_charge_id,
      'stripe_dispute_id', p_stripe_dispute_id,
      'amount_reversed_cents', p_amount_reversed_cents,
      'currency', upper(trim(p_currency)),
      'full_reversal', COALESCE(p_full_reversal, false),
      'reason', p_reason,
      'activation_reversal', v_is_activation_reversal,
      'commission_reversal', v_should_reverse_commission
    )
  )
  ON CONFLICT (stripe_event_id) DO UPDATE
  SET metadata = public.restaurant_subscription_payment_events.metadata || EXCLUDED.metadata;

  IF v_is_activation_reversal THEN
    UPDATE public.restaurant_invoices invoice
    SET status = CASE
          WHEN v_is_dispute THEN 'disputed'
          WHEN COALESCE(p_full_reversal, false) THEN 'refunded'
          ELSE invoice.status
        END,
        metadata = invoice.metadata || p_metadata || jsonb_build_object(
          'reversal_event_id', p_stripe_event_id,
          'reversal_event_type', p_event_type,
          'stripe_charge_id', p_stripe_charge_id,
          'stripe_dispute_id', p_stripe_dispute_id,
          'amount_reversed_cents', p_amount_reversed_cents,
          'full_reversal', COALESCE(p_full_reversal, false),
          'reversal_reason', p_reason
        )
    WHERE invoice.id = v_invoice.id;
  END IF;

  IF v_should_reverse_commission THEN
    UPDATE public.commercial_subscription_commissions commission
    SET status = 'reversed',
        metadata = commission.metadata || jsonb_build_object(
          'reversed_from_status', commission.status,
          'reversal_event_id', p_stripe_event_id,
          'reversal_event_type', p_event_type,
          'stripe_charge_id', p_stripe_charge_id,
          'stripe_dispute_id', p_stripe_dispute_id,
          'amount_reversed_cents', p_amount_reversed_cents,
          'reversal_reason', p_reason
        )
    WHERE commission.invoice_id = v_invoice.id
      AND commission.status IN ('payable', 'paid');
    GET DIAGNOSTICS v_reversed_count = ROW_COUNT;

    UPDATE public.commercial_prospect_followups followup
    SET acquisition_commission_status = commission.status,
        earned_at = commission.earned_at,
        updated_at = now()
    FROM public.commercial_subscription_commissions commission
    WHERE commission.source_objectid = followup.source_objectid
      AND commission.invoice_id = v_invoice.id
      AND commission.status = 'reversed';
  END IF;

  RETURN jsonb_build_object(
    'matched', v_subscription.id IS NOT NULL,
    'activation_reversal', v_is_activation_reversal,
    'commission_reversed', v_reversed_count > 0,
    'commissions_reversed_count', v_reversed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_restaurant_subscription_cancelled_before_payment(
  p_stripe_event_id text,
  p_stripe_subscription_id text,
  p_restaurant_id uuid,
  p_cancelled_at timestamptz,
  p_reason text,
  p_stripe_mode text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.restaurant_ai_subscriptions%ROWTYPE;
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_existing_event_type text;
  v_has_paid_proof boolean := false;
  v_paid_at timestamptz;
  v_payment_precedes_cancellation boolean := false;
  v_cancelled_count integer := 0;
  v_cancelled_at timestamptz := COALESCE(p_cancelled_at, now());
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service_role_required';
  END IF;
  IF NULLIF(trim(COALESCE(p_stripe_event_id, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(p_stripe_subscription_id, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'cancellation_event_and_subscription_required';
  END IF;
  IF lower(trim(COALESCE(p_stripe_mode, ''))) NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'metadata_must_be_an_object';
  END IF;

  SELECT event.event_type INTO v_existing_event_type
  FROM public.restaurant_subscription_payment_events event
  WHERE event.stripe_event_id = p_stripe_event_id;
  IF FOUND AND v_existing_event_type <> 'subscription_cancelled_before_payment' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'stripe_event_id_reused_for_another_event_type';
  END IF;

  SELECT * INTO v_subscription
  FROM public.restaurant_ai_subscriptions subscription
  WHERE subscription.stripe_subscription_id = p_stripe_subscription_id
     OR (
       p_restaurant_id IS NOT NULL
       AND subscription.restaurant_id = p_restaurant_id
       AND subscription.stripe_subscription_id IS NULL
       AND p_metadata->>'internal_invoice_id' = subscription.internal_invoice_id::text
       AND EXISTS (
           SELECT 1
           FROM public.restaurant_subscription_activation_jobs job
           WHERE job.subscription_id = subscription.id
             AND job.id::text = p_metadata->>'activation_job_id'
         )
     )
  ORDER BY (subscription.stripe_subscription_id = p_stripe_subscription_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.restaurant_subscription_payment_events (
      stripe_event_id, event_type, restaurant_id, stripe_subscription_id, metadata
    ) VALUES (
      p_stripe_event_id, 'subscription_cancelled_before_payment', p_restaurant_id,
      p_stripe_subscription_id, p_metadata || jsonb_build_object('matched', false)
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
    RETURN jsonb_build_object('matched', false, 'commission_cancelled', false);
  END IF;

  IF v_subscription.internal_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.restaurant_invoices invoice
    WHERE invoice.id = v_subscription.internal_invoice_id
      AND invoice.invoice_type = 'subscription'
    FOR UPDATE;
  END IF;

  v_has_paid_proof := v_invoice.id IS NOT NULL
    AND v_invoice.status IN ('paid', 'refunded', 'disputed')
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_subscription_payment_events paid_event
      WHERE paid_event.event_type = 'invoice_paid'
        AND paid_event.invoice_id = v_invoice.id
    );
  IF v_has_paid_proof THEN
    v_paid_at := v_invoice.paid_at;
    v_payment_precedes_cancellation := v_paid_at IS NOT NULL
      AND v_paid_at <= v_cancelled_at;
  END IF;

  INSERT INTO public.restaurant_subscription_payment_events (
    stripe_event_id,
    event_type,
    restaurant_id,
    subscription_id,
    invoice_id,
    stripe_subscription_id,
    metadata
  ) VALUES (
    p_stripe_event_id,
    'subscription_cancelled_before_payment',
    v_subscription.restaurant_id,
    v_subscription.id,
    CASE WHEN NOT v_has_paid_proof THEN v_invoice.id ELSE NULL END,
    p_stripe_subscription_id,
    p_metadata || jsonb_build_object(
      'cancelled_at', v_cancelled_at,
      'reason', p_reason,
      'had_paid_activation_invoice', v_has_paid_proof,
      'activation_invoice_paid_at', v_paid_at,
      'payment_precedes_cancellation', v_payment_precedes_cancellation
    )
  )
  ON CONFLICT (stripe_event_id) DO UPDATE
  SET metadata = public.restaurant_subscription_payment_events.metadata || EXCLUDED.metadata;

  UPDATE public.restaurant_ai_subscriptions subscription
  SET status = 'cancelled',
      metadata = subscription.metadata || p_metadata || jsonb_build_object(
        'cancelled_at', v_cancelled_at,
        'cancellation_reason', p_reason,
        'cancellation_event_id', p_stripe_event_id
      )
  WHERE subscription.id = v_subscription.id;

  IF NOT v_payment_precedes_cancellation THEN
    IF NOT v_has_paid_proof THEN
      UPDATE public.restaurant_invoices invoice
      SET status = 'cancelled',
          metadata = invoice.metadata || jsonb_build_object(
            'cancelled_at', v_cancelled_at,
            'cancellation_reason', p_reason,
            'cancellation_event_id', p_stripe_event_id
          )
      WHERE invoice.id = v_invoice.id;
    END IF;

    UPDATE public.commercial_subscription_commissions commission
    SET status = 'cancelled',
        earned_at = NULL,
        cancelled_at = v_cancelled_at,
        metadata = commission.metadata || jsonb_build_object(
          'cancelled_before_payment_event_id', p_stripe_event_id,
          'cancellation_reason', p_reason
        )
    WHERE commission.status IN ('pending_payment', 'payable', 'cancelled')
      AND (
        commission.invoice_id = v_invoice.id
        OR commission.subscription_id = v_subscription.id
        OR commission.restaurant_id = v_subscription.restaurant_id
      );
    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    UPDATE public.commercial_prospect_followups followup
    SET acquisition_commission_status = commission.status,
        earned_at = NULL,
        updated_at = now()
    FROM public.commercial_subscription_commissions commission
    WHERE commission.source_objectid = followup.source_objectid
      AND commission.status = 'cancelled'
      AND commission.subscription_id = v_subscription.id;

    UPDATE public.signup_applications application
    SET metadata = application.metadata || jsonb_build_object(
          'onboarding_payment_status', 'cancelled',
          'onboarding_cancelled_at', v_cancelled_at,
          'onboarding_cancellation_reason', p_reason
        )
    WHERE application.id = v_subscription.signup_application_id;
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'subscription_id', v_subscription.id,
    'had_paid_activation_invoice', v_has_paid_proof,
    'payment_precedes_cancellation', v_payment_precedes_cancellation,
    'commission_cancelled', v_cancelled_count > 0,
    'commissions_cancelled_count', v_cancelled_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_restaurant_onboarding_payment_method_ready(
  uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_restaurant_subscription_activation_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_restaurant_subscription_activation_job(
  uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_restaurant_subscription_activation_job(
  uuid, text, text, boolean, integer, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_restaurant_subscription_invoice_paid(
  text, text, text, text, uuid, bigint, text, text, timestamptz, timestamptz, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_restaurant_subscription_invoice_payment_failed(
  text, text, text, text, uuid, bigint, text, integer, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_restaurant_subscription_payment_reversed(
  text, text, text, text, text, text, uuid, bigint, text, boolean, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_restaurant_subscription_cancelled_before_payment(
  text, text, uuid, timestamptz, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_restaurant_onboarding_payment_method_ready(
  uuid, uuid, uuid, text, text, text, text, text, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_subscription_activation_jobs(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_restaurant_subscription_activation_job(
  uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_restaurant_subscription_activation_job(
  uuid, text, text, boolean, integer, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_restaurant_subscription_invoice_paid(
  text, text, text, text, uuid, bigint, text, text, timestamptz, timestamptz, timestamptz, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_restaurant_subscription_invoice_payment_failed(
  text, text, text, text, uuid, bigint, text, integer, timestamptz, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_restaurant_subscription_payment_reversed(
  text, text, text, text, text, text, uuid, bigint, text, boolean, text, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_restaurant_subscription_cancelled_before_payment(
  text, text, uuid, timestamptz, text, text, jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- Commercial write paths: server plan snapshot and strict self-award refusal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_commercial_prospect_followup(
  p_source_objectid bigint,
  p_status public.commercial_visit_status,
  p_notes text DEFAULT NULL,
  p_next_follow_up_at date DEFAULT NULL,
  p_refusal_reason_codes text[] DEFAULT ARRAY[]::text[],
  p_refusal_other_text text DEFAULT NULL,
  p_subscription_plan_slug text DEFAULT NULL,
  p_subscription_billing_period text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_commercial boolean := public.has_role(auth.uid(), 'commercial'::public.app_role);
  v_existing public.commercial_prospect_followups%ROWTYPE;
  v_result public.commercial_prospect_followups%ROWTYPE;
  v_exists boolean := false;
  v_owner_id uuid;
  v_actor_name text;
  v_owner_name text;
  v_now timestamptz := now();
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_refusal_other text := NULLIF(trim(COALESCE(p_refusal_other_text, '')), '');
  v_reasons text[] := COALESCE(p_refusal_reason_codes, ARRAY[]::text[]);
  v_snapshot jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;
  IF NOT v_is_commercial THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_access_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commercial_compensation_profiles profile
    WHERE profile.user_id = v_actor_id
      AND profile.status = 'inactive'
  ) OR EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts account
    WHERE account.user_id = v_actor_id
      AND NOT account.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_account_inactive';
  END IF;
  IF p_source_objectid IS NULL OR p_source_objectid <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_source_objectid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_prospect_catalog catalog
    WHERE catalog.source_objectid = p_source_objectid
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'prospect_not_in_server_catalog';
  END IF;
  IF p_status IS NULL OR p_status = 'not_visited'::public.commercial_visit_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_status';
  END IF;
  IF char_length(COALESCE(v_notes, '')) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_notes_too_long';
  END IF;

  SELECT * INTO v_existing
  FROM public.commercial_prospect_followups followup
  WHERE followup.source_objectid = p_source_objectid
  FOR UPDATE;
  v_exists := FOUND;

  IF v_exists AND p_expected_updated_at IS NOT NULL
    AND v_existing.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'commercial_followup_changed_reload_required';
  END IF;
  IF v_exists THEN
    IF v_existing.assigned_to IS NOT NULL AND v_existing.assigned_to <> v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prospect_owned_by_another_commercial';
    END IF;
    IF v_existing.status = 'signed'::public.commercial_visit_status THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signed_prospect_is_admin_locked';
    END IF;
  END IF;

  v_owner_id := COALESCE(v_existing.assigned_to, v_existing.signed_by, v_actor_id);

  SELECT NULLIF(trim(profile.full_name), '') INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.user_id = v_actor_id;
  v_actor_name := COALESCE(v_actor_name, 'Commercial TOK');

  SELECT NULLIF(trim(profile.full_name), '') INTO v_owner_name
  FROM public.profiles profile
  WHERE profile.user_id = v_owner_id;
  v_owner_name := COALESCE(v_existing.assigned_to_name, v_owner_name, v_actor_name, 'Commercial TOK');

  IF p_status = 'in_progress'::public.commercial_visit_status THEN
    IF p_next_follow_up_at IS NULL
      OR p_next_follow_up_at < (now() AT TIME ZONE 'Europe/Zurich')::date
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'future_follow_up_date_required';
    END IF;
  ELSIF p_next_follow_up_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'follow_up_date_only_allowed_for_revisit';
  END IF;

  IF p_status = 'not_interested'::public.commercial_visit_status THEN
    IF cardinality(v_reasons) = 0
      OR NOT public.commercial_refusal_reason_codes_valid(v_reasons)
      OR 'not_interested_unspecified' = ANY(v_reasons)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_reason_required';
    END IF;
    IF 'other' = ANY(v_reasons) AND v_refusal_other IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_required';
    END IF;
    IF char_length(COALESCE(v_refusal_other, '')) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_too_long';
    END IF;
  ELSE
    v_reasons := ARRAY[]::text[];
    v_refusal_other := NULL;
  END IF;

  IF p_status = 'signed'::public.commercial_visit_status THEN
    IF NULLIF(lower(trim(COALESCE(p_subscription_plan_slug, ''))), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_subscription_plan_required';
    END IF;
    IF lower(trim(COALESCE(p_subscription_billing_period, ''))) <> 'monthly' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signed_subscription_must_be_monthly';
    END IF;

    -- commercial_build_signature_snapshot validates that the plan is active
    -- and derives every financial value from server-owned plan/profile rows.
    v_snapshot := public.commercial_build_signature_snapshot(
      v_owner_id,
      p_subscription_plan_slug,
      'monthly',
      COALESCE(v_existing.signed_at, v_now)
    );
  ELSE
    IF p_subscription_plan_slug IS NOT NULL OR p_subscription_billing_period IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'subscription_plan_only_allowed_for_signed_status';
    END IF;
    v_snapshot := '{}'::jsonb;
  END IF;

  INSERT INTO public.commercial_prospect_followups (
    source_objectid,
    status,
    notes,
    assigned_to,
    assigned_to_name,
    last_contacted_by,
    last_contacted_by_name,
    visited_at,
    next_follow_up_at,
    refusal_reason_codes,
    refusal_other_text,
    signed_by,
    signed_by_name,
    signed_at,
    signed_restaurant_id,
    signed_subscription_plan_slug,
    signed_subscription_plan_name,
    signed_subscription_billing_period,
    signed_subscription_monthly_price_chf,
    signed_subscription_contract_value_chf,
    acquisition_commission_rate,
    acquisition_commission_chf,
    acquisition_commission_status,
    earned_at,
    commercial_compensation_mode,
    reservation_commission_rate,
    reservation_commission_starts_at,
    created_at,
    updated_at
  ) VALUES (
    p_source_objectid,
    p_status,
    v_notes,
    v_owner_id,
    v_owner_name,
    v_actor_id,
    v_actor_name,
    COALESCE(v_existing.visited_at, v_now),
    CASE WHEN p_status = 'in_progress' THEN p_next_follow_up_at ELSE NULL END,
    v_reasons,
    v_refusal_other,
    CASE WHEN p_status = 'signed' THEN v_owner_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_owner_name ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN COALESCE(v_existing.signed_at, v_now) ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_existing.signed_restaurant_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_slug' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_name' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'billing_period' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'monthly_price_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'contract_value_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_chf')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN 'pending_payment' ELSE 'not_applicable' END,
    NULL,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'commercial_compensation_mode' ELSE 'commission_only' END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'reservation_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed'
      THEN NULLIF(v_snapshot->>'reservation_commission_starts_at', '')::timestamptz
      ELSE NULL
    END,
    COALESCE(v_existing.created_at, v_now),
    v_now
  )
  ON CONFLICT (source_objectid) DO UPDATE
  SET status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      assigned_to = EXCLUDED.assigned_to,
      assigned_to_name = EXCLUDED.assigned_to_name,
      last_contacted_by = EXCLUDED.last_contacted_by,
      last_contacted_by_name = EXCLUDED.last_contacted_by_name,
      visited_at = COALESCE(public.commercial_prospect_followups.visited_at, EXCLUDED.visited_at),
      next_follow_up_at = EXCLUDED.next_follow_up_at,
      refusal_reason_codes = EXCLUDED.refusal_reason_codes,
      refusal_other_text = EXCLUDED.refusal_other_text,
      signed_by = EXCLUDED.signed_by,
      signed_by_name = EXCLUDED.signed_by_name,
      signed_at = EXCLUDED.signed_at,
      signed_restaurant_id = EXCLUDED.signed_restaurant_id,
      signed_subscription_plan_slug = EXCLUDED.signed_subscription_plan_slug,
      signed_subscription_plan_name = EXCLUDED.signed_subscription_plan_name,
      signed_subscription_billing_period = EXCLUDED.signed_subscription_billing_period,
      signed_subscription_monthly_price_chf = EXCLUDED.signed_subscription_monthly_price_chf,
      signed_subscription_contract_value_chf = EXCLUDED.signed_subscription_contract_value_chf,
      acquisition_commission_rate = EXCLUDED.acquisition_commission_rate,
      acquisition_commission_chf = EXCLUDED.acquisition_commission_chf,
      acquisition_commission_status = EXCLUDED.acquisition_commission_status,
      earned_at = EXCLUDED.earned_at,
      commercial_compensation_mode = EXCLUDED.commercial_compensation_mode,
      reservation_commission_rate = EXCLUDED.reservation_commission_rate,
      reservation_commission_starts_at = EXCLUDED.reservation_commission_starts_at,
      updated_at = EXCLUDED.updated_at
  WHERE public.commercial_prospect_followups.assigned_to IS NULL
    OR public.commercial_prospect_followups.assigned_to = v_actor_id
  RETURNING * INTO v_result;

  IF v_result.source_objectid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'prospect_claimed_by_another_commercial_reload_required';
  END IF;

  RETURN jsonb_build_object(
    'followup', to_jsonb(v_result),
    'commission_generated_chf', CASE
      WHEN v_result.status = 'signed' THEN v_result.acquisition_commission_chf
      ELSE 0
    END,
    'commission_status', v_result.acquisition_commission_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_commercial_compensation_adjustment(
  p_commercial_user_id uuid,
  p_kind text,
  p_label text,
  p_amount_chf numeric,
  p_occurred_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL,
  p_source_objectid bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result public.commercial_compensation_adjustments%ROWTYPE;
  v_kind text := lower(trim(COALESCE(p_kind, '')));
  v_label text := NULLIF(trim(COALESCE(p_label, '')), '');
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
BEGIN
  IF NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'super_admin_access_required';
  END IF;
  IF auth.role() <> 'service_role' AND auth.uid() = p_commercial_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_self_adjustment_forbidden';
  END IF;
  IF p_commercial_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles role
    WHERE role.user_id = p_commercial_user_id
      AND role.role = 'commercial'::public.app_role
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_user_required';
  END IF;
  IF v_kind NOT IN (
    'manual_bonus', 'manual_prime',
    'upgrade_starter_business', 'upgrade_business_premium', 'upgrade_premium_elite',
    'campaign_pack_100', 'campaign_pack_250', 'ai_growth_pack', 'correction'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_compensation_adjustment_kind';
  END IF;
  IF v_label IS NULL OR char_length(v_label) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'adjustment_label_required_and_limited_to_200_characters';
  END IF;
  IF p_amount_chf IS NULL OR p_amount_chf = 0 OR abs(p_amount_chf) > 1000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_adjustment_amount';
  END IF;
  IF p_occurred_at IS NULL OR NOT isfinite(p_occurred_at) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'finite_adjustment_date_required';
  END IF;
  IF char_length(COALESCE(v_notes, '')) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'adjustment_notes_too_long';
  END IF;
  IF p_restaurant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurants restaurant
    WHERE restaurant.id = p_restaurant_id
      AND NOT COALESCE(restaurant.is_demo, false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'real_restaurant_required';
  END IF;
  IF p_source_objectid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_prospect_catalog catalog
    WHERE catalog.source_objectid = p_source_objectid
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'prospect_not_in_server_catalog';
  END IF;

  INSERT INTO public.commercial_compensation_adjustments (
    commercial_user_id, kind, label, amount_chf, source_objectid,
    restaurant_id, occurred_at, notes, created_by
  ) VALUES (
    p_commercial_user_id, v_kind, v_label, p_amount_chf, p_source_objectid,
    p_restaurant_id, p_occurred_at, v_notes, auth.uid()
  ) RETURNING * INTO v_result;

  RETURN jsonb_build_object('adjustment', to_jsonb(v_result));
END;
$$;

-- Even an admin uses the audited RPC. This closes direct PostgREST writes and,
-- together with the RPC check above, prevents a dual-role admin/commercial
-- account from awarding itself a bonus.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.commercial_compensation_adjustments
  FROM authenticated;

REVOKE ALL ON FUNCTION public.record_commercial_prospect_followup(
  bigint, public.commercial_visit_status, text, date, text[], text, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_commercial_prospect_followup(
  bigint, public.commercial_visit_status, text, date, text[], text, text, text, timestamptz
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_add_commercial_compensation_adjustment(
  uuid, text, text, numeric, timestamptz, text, uuid, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_commercial_compensation_adjustment(
  uuid, text, text, numeric, timestamptz, text, uuid, bigint
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Accounting summaries: earned_at for payable/paid, signed_at for pending
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.get_commercial_compensation_summary(uuid, date, date)
  RENAME TO get_commercial_compensation_summary_pre_deferred_payment;

REVOKE ALL ON FUNCTION public.get_commercial_compensation_summary_pre_deferred_payment(
  uuid, date, date
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_commercial_compensation_summary(
  p_commercial_user_id uuid DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_user_id uuid := COALESCE(p_commercial_user_id, auth.uid());
  v_period_start date := COALESCE(
    p_period_start,
    date_trunc('month', now() AT TIME ZONE 'Europe/Zurich')::date
  );
  v_period_end date := COALESCE(p_period_end, (now() AT TIME ZONE 'Europe/Zurich')::date);
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_base jsonb;
  v_signatures jsonb;
  v_breakdown jsonb := '[]'::jsonb;
  v_old_nominal numeric := 0;
  v_earned_commission numeric := 0;
  v_pending_commission numeric := 0;
  v_earned_count integer := 0;
  v_pending_count integer := 0;
  v_signed_period_count integer := 0;
  v_payable_count integer := 0;
  v_paid_count integer := 0;
  v_reversed_count integer := 0;
  v_total numeric := 0;
BEGIN
  -- The preserved implementation retains salary, sprint, reservation and
  -- adjustment logic. Only acquisition commission accounting is replaced.
  v_base := public.get_commercial_compensation_summary_pre_deferred_payment(
    p_commercial_user_id,
    p_period_start,
    p_period_end
  );

  v_start_ts := v_period_start::timestamp AT TIME ZONE 'Europe/Zurich';
  v_end_ts := (v_period_end + 1)::timestamp AT TIME ZONE 'Europe/Zurich';

  SELECT
    count(*) FILTER (WHERE commission.status IN ('payable', 'paid'))::integer,
    count(*) FILTER (WHERE commission.status = 'payable')::integer,
    count(*) FILTER (WHERE commission.status = 'paid')::integer,
    count(*) FILTER (WHERE commission.status = 'reversed')::integer,
    COALESCE(sum(commission.amount_chf) FILTER (
      WHERE commission.status IN ('payable', 'paid')
    ), 0)::numeric
  INTO
    v_earned_count,
    v_payable_count,
    v_paid_count,
    v_reversed_count,
    v_earned_commission
  FROM public.commercial_subscription_commissions commission
  WHERE commission.commercial_user_id = v_target_user_id
    AND commission.earned_at >= v_start_ts
    AND commission.earned_at < v_end_ts;

  SELECT count(*)::integer, COALESCE(sum(commission.amount_chf), 0)::numeric
  INTO v_pending_count, v_pending_commission
  FROM public.commercial_subscription_commissions commission
  WHERE commission.commercial_user_id = v_target_user_id
    AND commission.status = 'pending_payment'
    AND commission.signed_at >= v_start_ts
    AND commission.signed_at < v_end_ts;

  SELECT count(*)::integer INTO v_signed_period_count
  FROM public.commercial_subscription_commissions commission
  WHERE commission.commercial_user_id = v_target_user_id
    AND commission.signed_at >= v_start_ts
    AND commission.signed_at < v_end_ts;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'plan_key', grouped.plan_key,
      'plan_name', grouped.plan_name,
      'signatures_count', grouped.earned_count,
      'commission_chf', round(grouped.earned_chf, 2),
      'pending_count', grouped.pending_count,
      'pending_commission_chf', round(grouped.pending_chf, 2)
    )
    ORDER BY CASE grouped.plan_key
      WHEN 'starter' THEN 1
      WHEN 'business' THEN 2
      WHEN 'premium' THEN 3
      WHEN 'elite' THEN 4
      ELSE 5
    END
  ), '[]'::jsonb)
  INTO v_breakdown
  FROM (
    SELECT
      public.commercial_plan_key(commission.plan_slug) AS plan_key,
      max(commission.plan_name) AS plan_name,
      count(*) FILTER (
        WHERE commission.status IN ('payable', 'paid')
          AND commission.earned_at >= v_start_ts
          AND commission.earned_at < v_end_ts
      )::integer AS earned_count,
      COALESCE(sum(commission.amount_chf) FILTER (
        WHERE commission.status IN ('payable', 'paid')
          AND commission.earned_at >= v_start_ts
          AND commission.earned_at < v_end_ts
      ), 0)::numeric AS earned_chf,
      count(*) FILTER (
        WHERE commission.status = 'pending_payment'
          AND commission.signed_at >= v_start_ts
          AND commission.signed_at < v_end_ts
      )::integer AS pending_count,
      COALESCE(sum(commission.amount_chf) FILTER (
        WHERE commission.status = 'pending_payment'
          AND commission.signed_at >= v_start_ts
          AND commission.signed_at < v_end_ts
      ), 0)::numeric AS pending_chf
    FROM public.commercial_subscription_commissions commission
    WHERE commission.commercial_user_id = v_target_user_id
      AND (
        (commission.earned_at >= v_start_ts AND commission.earned_at < v_end_ts)
        OR (commission.signed_at >= v_start_ts AND commission.signed_at < v_end_ts)
      )
    GROUP BY public.commercial_plan_key(commission.plan_slug)
  ) grouped
  WHERE grouped.earned_count > 0 OR grouped.pending_count > 0;

  v_signatures := COALESCE(v_base->'signatures', '{}'::jsonb)
    || jsonb_build_object(
      'period_count', v_earned_count,
      'signed_period_count', v_signed_period_count,
      'payable_count', v_payable_count,
      'paid_count', v_paid_count,
      'reversed_count', v_reversed_count,
      'pending_count', v_pending_count,
      'pending_commission_chf', round(v_pending_commission, 2),
      'commission_chf', round(v_earned_commission, 2),
      'breakdown', v_breakdown,
      'accounting_basis', 'earned_at_when_invoice_paid'
    );

  v_old_nominal := COALESCE((v_base #>> '{signatures,commission_chf}')::numeric, 0);
  v_total := COALESCE((v_base->>'total_chf')::numeric, 0)
    - v_old_nominal
    + v_earned_commission;

  RETURN (v_base - 'signatures' - 'total_chf')
    || jsonb_build_object(
      'signatures', v_signatures,
      'total_chf', round(v_total, 2)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_commercial_commission_summary(
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_start date := COALESCE(
    p_period_start,
    date_trunc('month', now() AT TIME ZONE 'Europe/Zurich')::date
  );
  v_period_end date := COALESCE(p_period_end, (now() AT TIME ZONE 'Europe/Zurich')::date);
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_total numeric := 0;
  v_count integer := 0;
  v_pending_total numeric := 0;
  v_pending_count integer := 0;
  v_commercials jsonb := '[]'::jsonb;
  v_signatures jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'super_admin_access_required';
  END IF;
  IF NOT isfinite(v_period_start) OR NOT isfinite(v_period_end)
    OR v_period_end < v_period_start
    OR v_period_end - v_period_start > 366
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_period';
  END IF;

  v_start_ts := v_period_start::timestamp AT TIME ZONE 'Europe/Zurich';
  v_end_ts := (v_period_end + 1)::timestamp AT TIME ZONE 'Europe/Zurich';

  SELECT count(*)::integer, COALESCE(sum(commission.amount_chf), 0)::numeric
  INTO v_count, v_total
  FROM public.commercial_subscription_commissions commission
  WHERE commission.status IN ('payable', 'paid')
    AND commission.earned_at >= v_start_ts
    AND commission.earned_at < v_end_ts;

  SELECT count(*)::integer, COALESCE(sum(commission.amount_chf), 0)::numeric
  INTO v_pending_count, v_pending_total
  FROM public.commercial_subscription_commissions commission
  WHERE commission.status = 'pending_payment'
    AND commission.signed_at >= v_start_ts
    AND commission.signed_at < v_end_ts;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'commercial_user_id', grouped.commercial_user_id,
      'commercial_name', grouped.commercial_name,
      'signatures_count', grouped.earned_count,
      'commission_chf', round(grouped.earned_chf, 2),
      'pending_count', grouped.pending_count,
      'pending_commission_chf', round(grouped.pending_chf, 2)
    ) ORDER BY grouped.earned_chf DESC, grouped.commercial_name
  ), '[]'::jsonb)
  INTO v_commercials
  FROM (
    SELECT
      commission.commercial_user_id,
      COALESCE(NULLIF(max(followup.signed_by_name), ''), 'Commercial TOK') AS commercial_name,
      count(*) FILTER (
        WHERE commission.status IN ('payable', 'paid')
          AND commission.earned_at >= v_start_ts
          AND commission.earned_at < v_end_ts
      )::integer AS earned_count,
      COALESCE(sum(commission.amount_chf) FILTER (
        WHERE commission.status IN ('payable', 'paid')
          AND commission.earned_at >= v_start_ts
          AND commission.earned_at < v_end_ts
      ), 0)::numeric AS earned_chf,
      count(*) FILTER (
        WHERE commission.status = 'pending_payment'
          AND commission.signed_at >= v_start_ts
          AND commission.signed_at < v_end_ts
      )::integer AS pending_count,
      COALESCE(sum(commission.amount_chf) FILTER (
        WHERE commission.status = 'pending_payment'
          AND commission.signed_at >= v_start_ts
          AND commission.signed_at < v_end_ts
      ), 0)::numeric AS pending_chf
    FROM public.commercial_subscription_commissions commission
    JOIN public.commercial_prospect_followups followup
      ON followup.source_objectid = commission.source_objectid
    WHERE (
      (commission.earned_at >= v_start_ts AND commission.earned_at < v_end_ts)
      OR (commission.signed_at >= v_start_ts AND commission.signed_at < v_end_ts)
    )
    GROUP BY commission.commercial_user_id
  ) grouped;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'source_objectid', commission.source_objectid,
      'commercial_user_id', commission.commercial_user_id,
      'commercial_name', COALESCE(NULLIF(followup.signed_by_name, ''), 'Commercial TOK'),
      'signed_at', commission.signed_at,
      'earned_at', commission.earned_at,
      'status', commission.status,
      'plan_slug', commission.plan_slug,
      'plan_name', commission.plan_name,
      'commission_chf', round(commission.amount_chf, 2)
    ) ORDER BY COALESCE(commission.earned_at, commission.signed_at) DESC
  ), '[]'::jsonb)
  INTO v_signatures
  FROM public.commercial_subscription_commissions commission
  JOIN public.commercial_prospect_followups followup
    ON followup.source_objectid = commission.source_objectid
  WHERE (
    commission.status IN ('payable', 'paid', 'reversed')
    AND commission.earned_at >= v_start_ts
    AND commission.earned_at < v_end_ts
  ) OR (
    commission.status = 'pending_payment'
    AND commission.signed_at >= v_start_ts
    AND commission.signed_at < v_end_ts
  );

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_period_start, 'end', v_period_end),
    'total_commission_chf', round(v_total, 2),
    'signed_restaurants_count', v_count,
    'pending_count', v_pending_count,
    'pending_commission_chf', round(v_pending_total, 2),
    'accounting_basis', 'earned_at_when_invoice_paid',
    'commercials', v_commercials,
    'signatures', v_signatures
  );
END;
$$;

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
    FROM public.signup_applications application
    JOIN public.restaurant_ai_subscriptions subscription
      ON subscription.id = application.restaurant_subscription_id
      OR subscription.signup_application_id = application.id
    WHERE application.id = p_application_id
      AND application.requested_role = 'restaurateur'::public.app_role
      AND (
        auth.role() = 'service_role'
        OR public.auth_is_super_admin()
        OR application.user_id = v_actor_id
      )
      AND (
        (
          subscription.status IN ('awaiting_activation', 'activation_pending')
          AND subscription.payment_method_ready_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.restaurant_subscription_payment_methods payment_method
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

CREATE OR REPLACE FUNCTION private_finance.guard_restaurateur_signup_approval_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private_finance, pg_temp
AS $$
BEGIN
  IF NEW.requested_role = 'restaurateur'::public.app_role
    AND NEW.status::text = 'approved'
    AND OLD.status::text IS DISTINCT FROM 'approved'
    AND NOT public.signup_restaurateur_onboarding_payment_ready(NEW.id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'restaurateur_payment_method_required_before_approval';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_restaurateur_signup_approval_payment
  ON public.signup_applications;
CREATE TRIGGER guard_restaurateur_signup_approval_payment
  BEFORE UPDATE OF status
  ON public.signup_applications
  FOR EACH ROW EXECUTE FUNCTION private_finance.guard_restaurateur_signup_approval_payment();

REVOKE ALL ON FUNCTION private_finance.guard_restaurateur_signup_approval_payment()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_commercial_commission_summary(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_commercial_commission_summary(date, date)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signup_restaurateur_onboarding_payment_ready(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Activation worker schedule (same Vault/pg_net pattern as existing workers)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret'
      AND decrypted_secret IS NOT NULL
  ) THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent: restaurant subscription activation schedule skipped';
    RETURN;
  END IF;

  PERFORM cron.unschedule('restaurant-subscription-activation-worker')
  WHERE EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'restaurant-subscription-activation-worker'
  );

  PERFORM cron.schedule(
    'restaurant-subscription-activation-worker',
    '* * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-cron-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'internal_cron_secret'
            LIMIT 1
          )
        ),
        body := jsonb_build_object(
          'action', 'process-subscription-activations',
          'source', 'restaurant-subscription-activation-cron'
        )
      );
    $cron$, v_base || '/stripe-worker')
  );
END;
$$;

COMMENT ON COLUMN public.commercial_prospect_followups.acquisition_commission_status IS
  'not_applicable for unsigned rows; pending_payment until verified invoice.paid; then payable/paid or reversed.';
COMMENT ON COLUMN public.commercial_prospect_followups.earned_at IS
  'Accounting date set only from the verified activation invoice.paid lifecycle.';
COMMENT ON TABLE public.commercial_subscription_commissions IS
  'Server-owned acquisition commission entitlements. Browser users have SELECT-only access to their own rows.';
COMMENT ON TABLE public.restaurant_subscription_activation_jobs IS
  'Idempotent outbox: exactly one activation job per deferred restaurant subscription.';
COMMENT ON TABLE public.restaurant_subscription_payment_methods IS
  'Server-only Stripe customer/setup/payment-method identifiers; intentionally hidden from browser roles.';

NOTIFY pgrst, 'reload schema';
