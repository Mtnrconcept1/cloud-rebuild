-- Stripe Connect settlement for the developer revenue share.
--
-- Authoritative rules:
--   * CHF 5.00 reservation fee: CHF 4.50 TOK / CHF 0.50 developer.
--   * Marketplace order: 90% restaurant / 9% TOK / 1% developer.
--
-- The ledger already records the exact developer_payable amount per collected
-- TOK revenue source. This migration makes that payable amount transferable
-- through Stripe Connect from a validated monthly statement. Test transfers
-- never mark a statement paid; live transfers do.

BEGIN;

ALTER TABLE public.finance_runtime_config
  ADD COLUMN IF NOT EXISTS developer_connect_transfers_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS developer_connect_account_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_runtime_config_developer_connect_account_id_check'
      AND conrelid = 'public.finance_runtime_config'::regclass
  ) THEN
    ALTER TABLE public.finance_runtime_config
      ADD CONSTRAINT finance_runtime_config_developer_connect_account_id_check
      CHECK (
        developer_connect_account_id IS NULL
        OR developer_connect_account_id ~ '^acct_[A-Za-z0-9]+$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'finance_runtime_config_developer_connect_enabled_check'
      AND conrelid = 'public.finance_runtime_config'::regclass
  ) THEN
    ALTER TABLE public.finance_runtime_config
      ADD CONSTRAINT finance_runtime_config_developer_connect_enabled_check
      CHECK (
        NOT developer_connect_transfers_enabled
        OR developer_connect_account_id IS NOT NULL
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.developer_stripe_transfers (
  transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL
    REFERENCES public.developer_statements(statement_id) ON DELETE RESTRICT,
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('live', 'test')),
  destination_account_id text NOT NULL
    CHECK (destination_account_id ~ '^acct_[A-Za-z0-9]+$'),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'CHF'
    CHECK (currency = upper(currency) AND char_length(currency) = 3),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text NOT NULL,
  stripe_transfer_id text,
  lock_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT developer_stripe_transfers_success_fields_check
    CHECK (
      status <> 'succeeded'
      OR (
        stripe_transfer_id IS NOT NULL
        AND succeeded_at IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_developer_stripe_transfers_statement_mode
  ON public.developer_stripe_transfers(statement_id, stripe_mode);

CREATE UNIQUE INDEX IF NOT EXISTS ux_developer_stripe_transfers_idempotency
  ON public.developer_stripe_transfers(idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_developer_stripe_transfers_stripe_id
  ON public.developer_stripe_transfers(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_developer_stripe_transfers_retry
  ON public.developer_stripe_transfers(status, lease_expires_at, updated_at)
  WHERE status IN ('pending', 'processing', 'failed');

ALTER TABLE public.developer_stripe_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS developer_stripe_transfers_admin_select
  ON public.developer_stripe_transfers;

CREATE POLICY developer_stripe_transfers_admin_select
  ON public.developer_stripe_transfers
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

REVOKE ALL ON public.developer_stripe_transfers
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.developer_stripe_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.developer_stripe_transfers TO service_role;

-- Validated statements remain immutable, except for the single audited
-- validated -> paid transition after a confirmed live Stripe transfer.
CREATE OR REPLACE FUNCTION public.prevent_locked_developer_statement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('validated', 'paid') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'validated or paid developer statements are immutable; create an adjustment statement instead';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'paid developer statements are immutable; create an adjustment statement instead';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'validated' THEN
    IF NOT (
      NEW.status = 'paid'
      AND NEW.paid_at IS NOT NULL
      AND (
        to_jsonb(NEW) - 'status' - 'paid_at'
      ) = (
        to_jsonb(OLD) - 'status' - 'paid_at'
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'validated developer statements only allow the paid transition';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_configure_developer_connect_transfer(
  p_account_id text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_account_id text := NULLIF(btrim(COALESCE(p_account_id, '')), '');
  v_config public.finance_runtime_config%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;

  IF v_account_id IS NOT NULL AND v_account_id !~ '^acct_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_developer_connect_account_id';
  END IF;

  IF COALESCE(p_enabled, false) AND v_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'developer_connect_account_id_required';
  END IF;

  UPDATE public.finance_runtime_config
  SET developer_connect_account_id = v_account_id,
      developer_connect_transfers_enabled = COALESCE(p_enabled, false),
      updated_at = now(),
      updated_by = v_actor,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'developer_connect_configured_at', now(),
        'developer_connect_configured_by', v_actor
      )
  WHERE config_key = 'default'
  RETURNING * INTO v_config;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'finance_runtime_config_missing';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', v_config.developer_connect_transfers_enabled,
    'account_id', v_config.developer_connect_account_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_validate_developer_statement(
  p_statement_id uuid,
  p_expected_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_statement public.developer_statements%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;

  SELECT *
  INTO v_statement
  FROM public.developer_statements
  WHERE statement_id = p_statement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'developer_statement_not_found';
  END IF;

  IF v_statement.status <> 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_not_draft';
  END IF;

  IF v_statement.developer_amount_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_has_no_positive_payable';
  END IF;

  IF p_expected_amount_cents IS NULL
     OR p_expected_amount_cents <> v_statement.developer_amount_cents THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_amount_confirmation_mismatch';
  END IF;

  UPDATE public.developer_statements
  SET status = 'validated',
      validated_at = now()
  WHERE statement_id = p_statement_id
  RETURNING * INTO v_statement;

  RETURN jsonb_build_object(
    'ok', true,
    'statement_id', v_statement.statement_id,
    'status', v_statement.status,
    'amount_cents', v_statement.developer_amount_cents,
    'currency', v_statement.currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_developer_statement_transfer(
  p_statement_id uuid,
  p_stripe_mode text DEFAULT 'live',
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := lower(btrim(COALESCE(p_stripe_mode, 'live')));
  v_lease_seconds integer := greatest(30, least(COALESCE(p_lease_seconds, 300), 900));
  v_statement public.developer_statements%ROWTYPE;
  v_config public.finance_runtime_config%ROWTYPE;
  v_transfer public.developer_stripe_transfers%ROWTYPE;
  v_transfer_exists boolean := false;
  v_lock_token uuid := gen_random_uuid();
  v_idempotency_key text;
BEGIN
  IF v_mode NOT IN ('live', 'test') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_stripe_mode';
  END IF;

  SELECT *
  INTO v_statement
  FROM public.developer_statements
  WHERE statement_id = p_statement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'developer_statement_not_found';
  END IF;

  SELECT *
  INTO v_transfer
  FROM public.developer_stripe_transfers
  WHERE statement_id = p_statement_id
    AND stripe_mode = v_mode
  FOR UPDATE;

  v_transfer_exists := FOUND;

  IF v_transfer_exists AND v_transfer.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'duplicate', true,
      'in_progress', false,
      'transfer_id', v_transfer.transfer_id,
      'stripe_transfer_id', v_transfer.stripe_transfer_id,
      'statement_id', v_transfer.statement_id,
      'stripe_mode', v_transfer.stripe_mode,
      'destination_account_id', v_transfer.destination_account_id,
      'amount_cents', v_transfer.amount_cents,
      'currency', v_transfer.currency,
      'idempotency_key', v_transfer.idempotency_key
    );
  END IF;

  IF v_statement.status <> 'validated' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_must_be_validated';
  END IF;

  IF v_statement.developer_amount_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_statement_has_no_positive_payable';
  END IF;

  SELECT *
  INTO v_config
  FROM public.finance_runtime_config
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'finance_runtime_config_missing';
  END IF;

  IF NOT v_config.developer_connect_transfers_enabled THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_connect_transfers_disabled';
  END IF;

  IF v_config.developer_connect_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'developer_connect_account_id_missing';
  END IF;

  v_idempotency_key := 'tok-developer-statement:' || p_statement_id::text || ':' || v_mode;

  IF v_transfer_exists THEN
    IF v_transfer.destination_account_id <> v_config.developer_connect_account_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'developer_connect_destination_changed_after_claim';
    END IF;

    IF v_transfer.amount_cents <> v_statement.developer_amount_cents
       OR v_transfer.currency <> v_statement.currency THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'developer_statement_changed_after_transfer_claim';
    END IF;

    IF v_transfer.status = 'processing'
       AND v_transfer.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'duplicate', false,
        'in_progress', true,
        'transfer_id', v_transfer.transfer_id,
        'statement_id', v_transfer.statement_id,
        'stripe_mode', v_transfer.stripe_mode
      );
    END IF;

    UPDATE public.developer_stripe_transfers
    SET status = 'processing',
        lock_token = v_lock_token,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        attempt_count = attempt_count + 1,
        last_error = NULL,
        updated_at = now()
    WHERE transfer_id = v_transfer.transfer_id
    RETURNING * INTO v_transfer;
  ELSE
    INSERT INTO public.developer_stripe_transfers (
      statement_id,
      stripe_mode,
      destination_account_id,
      amount_cents,
      currency,
      status,
      idempotency_key,
      lock_token,
      lease_expires_at,
      attempt_count,
      metadata
    ) VALUES (
      v_statement.statement_id,
      v_mode,
      v_config.developer_connect_account_id,
      v_statement.developer_amount_cents,
      v_statement.currency,
      'processing',
      v_idempotency_key,
      v_lock_token,
      now() + make_interval(secs => v_lease_seconds),
      1,
      jsonb_build_object(
        'period_start', v_statement.period_start,
        'period_end', v_statement.period_end,
        'developer_share_bps', v_statement.developer_share_bps,
        'source', 'validated_developer_statement'
      )
    )
    RETURNING * INTO v_transfer;
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'duplicate', false,
    'in_progress', false,
    'transfer_id', v_transfer.transfer_id,
    'lock_token', v_transfer.lock_token,
    'statement_id', v_transfer.statement_id,
    'stripe_mode', v_transfer.stripe_mode,
    'destination_account_id', v_transfer.destination_account_id,
    'amount_cents', v_transfer.amount_cents,
    'currency', v_transfer.currency,
    'idempotency_key', v_transfer.idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_developer_statement_transfer(
  p_transfer_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_stripe_transfer_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.developer_stripe_transfers%ROWTYPE;
  v_statement public.developer_statements%ROWTYPE;
  v_stripe_transfer_id text := NULLIF(btrim(COALESCE(p_stripe_transfer_id, '')), '');
BEGIN
  SELECT *
  INTO v_transfer
  FROM public.developer_stripe_transfers
  WHERE transfer_id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'developer_transfer_not_found';
  END IF;

  IF v_transfer.status = 'succeeded' THEN
    IF v_stripe_transfer_id IS NOT NULL
       AND v_transfer.stripe_transfer_id <> v_stripe_transfer_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stripe_transfer_identity_mismatch';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transfer_id', v_transfer.transfer_id,
      'stripe_transfer_id', v_transfer.stripe_transfer_id,
      'statement_id', v_transfer.statement_id,
      'statement_status', CASE
        WHEN v_transfer.stripe_mode = 'live' THEN 'paid'
        ELSE 'validated'
      END
    );
  END IF;

  IF v_transfer.status <> 'processing'
     OR v_transfer.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'developer_transfer_lease_lost';
  END IF;

  IF COALESCE(p_success, false) THEN
    IF v_stripe_transfer_id IS NULL OR v_stripe_transfer_id !~ '^tr_[A-Za-z0-9]+$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'valid_stripe_transfer_id_required';
    END IF;

    UPDATE public.developer_stripe_transfers
    SET status = 'succeeded',
        stripe_transfer_id = v_stripe_transfer_id,
        succeeded_at = now(),
        lock_token = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
        updated_at = now()
    WHERE transfer_id = v_transfer.transfer_id
    RETURNING * INTO v_transfer;

    IF v_transfer.stripe_mode = 'live' THEN
      UPDATE public.developer_statements
      SET status = 'paid',
          paid_at = now()
      WHERE statement_id = v_transfer.statement_id
        AND status = 'validated'
      RETURNING * INTO v_statement;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'developer_statement_not_validated_at_live_completion';
      END IF;
    ELSE
      SELECT *
      INTO v_statement
      FROM public.developer_statements
      WHERE statement_id = v_transfer.statement_id;
    END IF;
  ELSE
    UPDATE public.developer_stripe_transfers
    SET status = 'failed',
        lock_token = NULL,
        lease_expires_at = NULL,
        last_error = left(NULLIF(btrim(COALESCE(p_error, '')), ''), 2000),
        metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
        updated_at = now()
    WHERE transfer_id = v_transfer.transfer_id
    RETURNING * INTO v_transfer;

    SELECT *
    INTO v_statement
    FROM public.developer_statements
    WHERE statement_id = v_transfer.statement_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transfer_id', v_transfer.transfer_id,
    'stripe_transfer_id', v_transfer.stripe_transfer_id,
    'transfer_status', v_transfer.status,
    'statement_id', v_transfer.statement_id,
    'statement_status', v_statement.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_configure_developer_connect_transfer(text, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_validate_developer_statement(uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_developer_statement_transfer(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_developer_statement_transfer(uuid, uuid, boolean, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_configure_developer_connect_transfer(text, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_validate_developer_statement(uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_developer_statement_transfer(uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_developer_statement_transfer(uuid, uuid, boolean, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.prevent_locked_developer_statement_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_locked_developer_statement_mutation()
  TO service_role;

COMMENT ON COLUMN public.finance_runtime_config.developer_connect_transfers_enabled IS
  'Fail-closed switch for Stripe Connect developer transfers. Enable only after the connected account is verified and a test transfer is reconciled.';

COMMENT ON COLUMN public.finance_runtime_config.developer_connect_account_id IS
  'Stripe Connect account receiving the developer share. Account identifiers are configuration, never secret API keys.';

COMMENT ON TABLE public.developer_stripe_transfers IS
  'Idempotent Stripe Connect settlement of exact developer_payable statements. Live success marks the validated statement paid; test success never does.';

COMMENT ON COLUMN public.developer_stripe_transfers.amount_cents IS
  'Exact net developer payable after refunds and chargebacks; never recomputed by the Edge Function.';

COMMIT;

NOTIFY pgrst, 'reload schema';
