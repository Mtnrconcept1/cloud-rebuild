-- Production accounting governance: monthly locks, official snapshots,
-- Stripe reconciliation and audited invoice actions.

CREATE TABLE IF NOT EXISTS public.admin_month_locks (
  period_month date PRIMARY KEY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reopened')),
  reason text,
  official_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reopened_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_month_locks_period_month_is_first_day CHECK (period_month = date_trunc('month', period_month)::date)
);

ALTER TABLE public.admin_month_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view accounting month locks" ON public.admin_month_locks;
CREATE POLICY "Admins can view accounting month locks"
ON public.admin_month_locks
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage accounting month locks" ON public.admin_month_locks;
CREATE POLICY "Admins can manage accounting month locks"
ON public.admin_month_locks
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.accounting_month_start(p_month date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT date_trunc('month', COALESCE(p_month, current_date))::date;
$$;

CREATE OR REPLACE FUNCTION public.assert_accounting_month_open(p_month date)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := public.accounting_month_start(p_month);
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_month_locks aml
    WHERE aml.period_month = v_month
      AND aml.status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Accounting month is closed: %', v_month;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_accounting_month_official_totals(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := public.accounting_month_start(p_month);
  v_next_month date := (public.accounting_month_start(p_month) + interval '1 month')::date;
  v_totals jsonb;
BEGIN
  SELECT jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'gross_amount', COALESCE(sum(o.total_amount), 0),
        'refunded_amount', COALESCE(sum(COALESCE(o.refunded_amount_chf, 0)), 0)
      )
      FROM public.orders o
      WHERE o.created_at >= v_month::timestamptz
        AND o.created_at < v_next_month::timestamptz
        AND COALESCE(o.payment_status, '') IN ('paid', 'captured')
        AND COALESCE(o.status, '') NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
    ), '{}'::jsonb),
    'reservations', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'gross_amount', COALESCE(sum(r.total_amount), 0),
        'reservation_fees', COALESCE(sum(r.billing_fee_chf), 0),
        'refunded_amount', COALESCE(sum(COALESCE(r.refunded_amount_chf, 0)), 0)
      )
      FROM public.reservations r
      WHERE r.created_at >= v_month::timestamptz
        AND r.created_at < v_next_month::timestamptz
        AND COALESCE(r.status, '') NOT IN ('cancelled', 'no_show', 'pending')
    ), '{}'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'paid_amount', COALESCE(sum(COALESCE(ac.paid_amount, ac.total_budget, 0)), 0)
      )
      FROM public.ad_campaigns ac
      WHERE ac.created_at >= v_month::timestamptz
        AND ac.created_at < v_next_month::timestamptz
        AND COALESCE(ac.payment_status, '') = 'paid'
    ), '{}'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'amount_ttc', COALESCE(sum(ri.amount_ttc), 0),
        'paid_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') = 'paid'), 0),
        'open_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') <> 'paid'), 0)
      )
      FROM public.restaurant_invoices ri
      WHERE ri.period_start >= v_month
        AND ri.period_start < v_next_month
    ), '{}'::jsonb),
    'stripe', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'amount', COALESCE(sum(pt.amount), 0),
        'succeeded_amount', COALESCE(sum(pt.amount) FILTER (WHERE COALESCE(pt.status, '') IN ('paid', 'succeeded', 'captured')), 0),
        'failed_count', count(*) FILTER (WHERE COALESCE(pt.status, '') IN ('failed', 'canceled', 'cancelled'))
      )
      FROM public.payment_transactions pt
      WHERE pt.created_at >= v_month::timestamptz
        AND pt.created_at < v_next_month::timestamptz
    ), '{}'::jsonb)
  )
  INTO v_totals;

  RETURN v_totals;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_accounting_stripe_reconciliation(p_month date)
RETURNS TABLE (
  item_kind text,
  expected_count integer,
  expected_amount numeric,
  received_count integer,
  received_amount numeric,
  refunded_amount numeric,
  orphan_count integer,
  mismatch_count integer,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_month date := public.accounting_month_start(p_month);
  v_next_month date := (public.accounting_month_start(p_month) + interval '1 month')::date;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH stripe_success AS (
    SELECT pt.*
    FROM public.payment_transactions pt
    WHERE pt.created_at >= v_month::timestamptz
      AND pt.created_at < v_next_month::timestamptz
      AND COALESCE(pt.status, '') IN ('paid', 'succeeded', 'captured')
  ),
  expected_orders AS (
    SELECT
      o.id,
      o.total_amount::numeric AS amount,
      COALESCE(o.refunded_amount_chf, 0)::numeric AS refunded_amount,
      o.metadata ->> 'stripe_session_id' AS stripe_checkout_session_id,
      COALESCE(o.metadata ->> 'stripe_payment_intent', o.metadata ->> 'stripe_payment_intent_id') AS stripe_payment_intent_id
    FROM public.orders o
    WHERE o.created_at >= v_month::timestamptz
      AND o.created_at < v_next_month::timestamptz
      AND COALESCE(o.payment_status, '') IN ('paid', 'captured')
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
  ),
  expected_reservations AS (
    SELECT
      r.id,
      r.total_amount::numeric AS amount,
      COALESCE(r.refunded_amount_chf, 0)::numeric AS refunded_amount,
      r.metadata ->> 'stripe_session_id' AS stripe_checkout_session_id,
      COALESCE(r.metadata ->> 'stripe_payment_intent', r.metadata ->> 'stripe_payment_intent_id') AS stripe_payment_intent_id
    FROM public.reservations r
    WHERE r.created_at >= v_month::timestamptz
      AND r.created_at < v_next_month::timestamptz
      AND COALESCE(r.status, '') NOT IN ('cancelled', 'no_show', 'pending')
      AND r.total_amount > 0
  ),
  expected_campaigns AS (
    SELECT
      ac.id,
      COALESCE(ac.paid_amount, ac.total_budget, 0)::numeric AS amount,
      0::numeric AS refunded_amount,
      ac.stripe_checkout_session_id,
      ac.stripe_payment_intent_id
    FROM public.ad_campaigns ac
    WHERE ac.created_at >= v_month::timestamptz
      AND ac.created_at < v_next_month::timestamptz
      AND COALESCE(ac.payment_status, '') = 'paid'
  ),
  order_matches AS (
    SELECT DISTINCT eo.id, ss.id AS transaction_id, ss.amount
    FROM expected_orders eo
    JOIN stripe_success ss ON (
      ss.order_id = eo.id
      OR (eo.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = eo.stripe_checkout_session_id)
      OR (eo.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = eo.stripe_payment_intent_id)
    )
  ),
  reservation_matches AS (
    SELECT DISTINCT er.id, ss.id AS transaction_id, ss.amount
    FROM expected_reservations er
    JOIN stripe_success ss ON (
      (er.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = er.stripe_checkout_session_id)
      OR (er.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = er.stripe_payment_intent_id)
    )
  ),
  campaign_matches AS (
    SELECT DISTINCT ec.id, ss.id AS transaction_id, ss.amount
    FROM expected_campaigns ec
    JOIN stripe_success ss ON (
      (ec.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = ec.stripe_checkout_session_id)
      OR (ec.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = ec.stripe_payment_intent_id)
    )
  ),
  orphan_transactions AS (
    SELECT ss.*
    FROM stripe_success ss
    WHERE NOT EXISTS (SELECT 1 FROM order_matches om WHERE om.transaction_id = ss.id)
      AND NOT EXISTS (SELECT 1 FROM reservation_matches rm WHERE rm.transaction_id = ss.id)
      AND NOT EXISTS (SELECT 1 FROM campaign_matches cm WHERE cm.transaction_id = ss.id)
  )
  SELECT
    computed.item_kind,
    computed.expected_count::integer,
    computed.expected_amount,
    computed.received_count::integer,
    computed.received_amount,
    computed.refunded_amount,
    computed.orphan_count::integer,
    GREATEST(computed.expected_count - computed.received_count, 0)::integer AS mismatch_count,
    computed.details
  FROM (
    SELECT
      'orders'::text AS item_kind,
      (SELECT count(*) FROM expected_orders) AS expected_count,
      COALESCE((SELECT sum(amount) FROM expected_orders), 0) AS expected_amount,
      (SELECT count(DISTINCT transaction_id) FROM order_matches) AS received_count,
      COALESCE((SELECT sum(amount) FROM order_matches), 0) AS received_amount,
      COALESCE((SELECT sum(refunded_amount) FROM expected_orders), 0) AS refunded_amount,
      0 AS orphan_count,
      jsonb_build_object('source', 'orders', 'stripe_checkout_session_id', true) AS details
    UNION ALL
    SELECT
      'reservations'::text,
      (SELECT count(*) FROM expected_reservations),
      COALESCE((SELECT sum(amount) FROM expected_reservations), 0),
      (SELECT count(DISTINCT transaction_id) FROM reservation_matches),
      COALESCE((SELECT sum(amount) FROM reservation_matches), 0),
      COALESCE((SELECT sum(refunded_amount) FROM expected_reservations), 0),
      0,
      jsonb_build_object('source', 'reservations', 'stripe_checkout_session_id', true)
    UNION ALL
    SELECT
      'campaigns'::text,
      (SELECT count(*) FROM expected_campaigns),
      COALESCE((SELECT sum(amount) FROM expected_campaigns), 0),
      (SELECT count(DISTINCT transaction_id) FROM campaign_matches),
      COALESCE((SELECT sum(amount) FROM campaign_matches), 0),
      0,
      0,
      jsonb_build_object('source', 'ad_campaigns', 'stripe_checkout_session_id', true)
    UNION ALL
    SELECT
      'orphans'::text,
      0,
      0,
      (SELECT count(*) FROM orphan_transactions),
      COALESCE((SELECT sum(amount) FROM orphan_transactions), 0),
      0,
      (SELECT count(*) FROM orphan_transactions),
      jsonb_build_object('source', 'payment_transactions', 'orphan_count', (SELECT count(*) FROM orphan_transactions))
  ) AS computed
  ORDER BY computed.item_kind;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_accounting_period_control(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_month date := public.accounting_month_start(p_month);
  v_lock public.admin_month_locks%ROWTYPE;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_lock
  FROM public.admin_month_locks
  WHERE period_month = v_month;

  RETURN jsonb_build_object(
    'period_month', v_month,
    'status', COALESCE(v_lock.status, 'open'),
    'is_closed', COALESCE(v_lock.status, 'open') = 'closed',
    'lock', COALESCE(to_jsonb(v_lock), jsonb_build_object('period_month', v_month, 'status', 'open')),
    'stripe_reconciliation', COALESCE((
      SELECT jsonb_agg(to_jsonb(reconciliation_row))
      FROM public.admin_get_accounting_stripe_reconciliation(v_month) reconciliation_row
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_accounting_month_lock(
  p_month date,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_month date := public.accounting_month_start(p_month);
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_before public.admin_month_locks%ROWTYPE;
  v_after public.admin_month_locks%ROWTYPE;
  v_official_totals jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_status NOT IN ('open', 'closed', 'reopened') THEN
    RAISE EXCEPTION 'Unsupported accounting month status: %', p_status;
  END IF;

  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for accounting month changes.';
  END IF;

  SELECT *
  INTO v_before
  FROM public.admin_month_locks
  WHERE period_month = v_month
  FOR UPDATE;

  IF v_status = 'closed' THEN
    v_official_totals := public.build_accounting_month_official_totals(v_month);
  ELSE
    v_official_totals := COALESCE(v_before.official_totals, '{}'::jsonb);
  END IF;

  INSERT INTO public.admin_month_locks (
    period_month,
    status,
    reason,
    official_totals,
    closed_by,
    closed_at,
    reopened_by,
    reopened_at,
    updated_by,
    updated_at
  )
  VALUES (
    v_month,
    v_status,
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    v_official_totals,
    CASE WHEN v_status = 'closed' THEN v_actor_id ELSE NULL END,
    CASE WHEN v_status = 'closed' THEN now() ELSE NULL END,
    CASE WHEN v_status = 'reopened' THEN v_actor_id ELSE NULL END,
    CASE WHEN v_status = 'reopened' THEN now() ELSE NULL END,
    v_actor_id,
    now()
  )
  ON CONFLICT (period_month) DO UPDATE
  SET status = EXCLUDED.status,
      reason = EXCLUDED.reason,
      official_totals = EXCLUDED.official_totals,
      closed_by = CASE WHEN EXCLUDED.status = 'closed' THEN EXCLUDED.closed_by ELSE public.admin_month_locks.closed_by END,
      closed_at = CASE WHEN EXCLUDED.status = 'closed' THEN EXCLUDED.closed_at ELSE public.admin_month_locks.closed_at END,
      reopened_by = CASE WHEN EXCLUDED.status = 'reopened' THEN EXCLUDED.reopened_by ELSE public.admin_month_locks.reopened_by END,
      reopened_at = CASE WHEN EXCLUDED.status = 'reopened' THEN EXCLUDED.reopened_at ELSE public.admin_month_locks.reopened_at END,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  RETURNING * INTO v_after;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_set_accounting_month_lock',
    'admin_month_locks',
    NULL,
    COALESCE(to_jsonb(v_before), '{}'::jsonb),
    to_jsonb(v_after)
  );

  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_accounting_period_mutation_when_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date;
  v_invoice_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'restaurant_invoice_line_items' THEN
    IF TG_OP = 'DELETE' THEN
      v_invoice_id := OLD.invoice_id;
    ELSE
      v_invoice_id := NEW.invoice_id;
    END IF;

    SELECT ri.period_start INTO v_period
    FROM public.restaurant_invoices ri
    WHERE ri.id = v_invoice_id;

    IF v_period IS NULL THEN
      IF TG_OP = 'DELETE' THEN
        v_period := OLD.occurred_at::date;
      ELSE
        v_period := NEW.occurred_at::date;
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_period := OLD.period_start;
    ELSE
      v_period := NEW.period_start;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_month_locks aml
    WHERE aml.period_month = public.accounting_month_start(v_period)
      AND aml.status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Accounting month is closed: %', public.accounting_month_start(v_period);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_restaurant_invoices_locked_period ON public.restaurant_invoices;
CREATE TRIGGER prevent_restaurant_invoices_locked_period
BEFORE INSERT OR UPDATE OR DELETE ON public.restaurant_invoices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_accounting_period_mutation_when_locked();

DROP TRIGGER IF EXISTS prevent_restaurant_invoice_line_items_locked_period ON public.restaurant_invoice_line_items;
CREATE TRIGGER prevent_restaurant_invoice_line_items_locked_period
BEFORE INSERT OR UPDATE OR DELETE ON public.restaurant_invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_accounting_period_mutation_when_locked();

CREATE OR REPLACE FUNCTION public.admin_mark_restaurant_invoice_paid(
  p_invoice_id uuid,
  p_paid_at timestamptz DEFAULT now(),
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_before public.restaurant_invoices%ROWTYPE;
  v_after public.restaurant_invoices%ROWTYPE;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_before
  FROM public.restaurant_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  PERFORM public.assert_accounting_month_open(v_before.period_start);

  UPDATE public.restaurant_invoices
  SET status = 'paid',
      paid_at = COALESCE(p_paid_at, now()),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_after;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_mark_restaurant_invoice_paid',
    'restaurant_invoices',
    p_invoice_id,
    to_jsonb(v_before),
    to_jsonb(v_after) || jsonb_build_object('reference', NULLIF(trim(COALESCE(p_reference, '')), ''))
  );

  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_tok_payable_invoice(
  p_restaurant_id uuid,
  p_month date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_invoice_id uuid;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  PERFORM public.assert_accounting_month_open(p_month);

  v_invoice_id := public.generate_tok_payable_invoice(p_restaurant_id, p_month);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_generate_tok_payable_invoice',
    'restaurant_invoices',
    v_invoice_id,
    '{}'::jsonb,
    jsonb_build_object('restaurant_id', p_restaurant_id, 'month', public.accounting_month_start(p_month), 'invoice_id', v_invoice_id)
  );

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_tok_payable_invoices_all(
  p_month date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_generated integer;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  PERFORM public.assert_accounting_month_open(p_month);

  v_generated := public.generate_tok_payable_invoices_all(p_month);

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_generate_tok_payable_invoices_all',
    'restaurant_invoices',
    NULL,
    '{}'::jsonb,
    jsonb_build_object('month', public.accounting_month_start(p_month), 'generated_count', v_generated)
  );

  RETURN v_generated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accounting_month_start(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assert_accounting_month_open(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.build_accounting_month_official_totals(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_accounting_stripe_reconciliation(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_accounting_period_control(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_accounting_month_lock(date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_restaurant_invoice_paid(uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_generate_tok_payable_invoice(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_generate_tok_payable_invoices_all(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accounting_month_start(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_accounting_month_open(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.build_accounting_month_official_totals(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_accounting_stripe_reconciliation(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_accounting_period_control(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_accounting_month_lock(date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_restaurant_invoice_paid(uuid, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_generate_tok_payable_invoice(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_generate_tok_payable_invoices_all(date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
