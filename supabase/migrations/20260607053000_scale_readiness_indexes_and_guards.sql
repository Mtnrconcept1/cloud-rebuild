-- Production scale readiness for TOK checkout/order hot paths.
-- Goal: keep restaurant dashboards, checkout reconciliation, support triage,
-- and payment anomaly scans responsive during lunch/dinner traffic spikes.

BEGIN;

-- Orders are queried constantly by restaurant, status and recency in dashboards,
-- support screens and webhook reconciliation flows.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created_at
  ON public.orders (restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_checkout_id
  ON public.orders (checkout_id)
  WHERE checkout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_payment_watchdog
  ON public.orders (created_at ASC)
  WHERE lower(COALESCE(status, '')) = 'pending_payment'
     OR lower(COALESCE(payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment');

CREATE INDEX IF NOT EXISTS idx_orders_metadata_stripe_session_id
  ON public.orders ((metadata->>'stripe_session_id'))
  WHERE metadata ? 'stripe_session_id';

CREATE INDEX IF NOT EXISTS idx_orders_metadata_checkout_group_id
  ON public.orders ((metadata->>'checkout_group_id'))
  WHERE metadata ? 'checkout_group_id';

-- Payment reconciliation must be fast and duplicate-resistant.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_status_type
  ON public.payment_transactions (order_id, status, type, created_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_session_charge_succeeded
  ON public.payment_transactions (stripe_checkout_session_id, type, status)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_payment_intent
  ON public.payment_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Partial unique guard: one succeeded charge transaction per Stripe checkout
-- session and checkout kind. Historical preview/production data may already
-- contain duplicate succeeded charge rows, so preflight the data before adding
-- a uniqueness constraint that would otherwise block the whole release.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        stripe_checkout_session_id,
        COALESCE(metadata->>'checkout_kind', 'order') AS checkout_kind
      FROM public.payment_transactions
      WHERE stripe_checkout_session_id IS NOT NULL
        AND type = 'charge'
        AND status = 'succeeded'
      GROUP BY stripe_checkout_session_id, COALESCE(metadata->>'checkout_kind', 'order')
      HAVING COUNT(*) > 1
      LIMIT 1
    ) duplicate_succeeded_charges
  ) THEN
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_succeeded_charge_session_kind
        ON public.payment_transactions (
          stripe_checkout_session_id,
          COALESCE(metadata->>'checkout_kind', 'order')
        )
        WHERE stripe_checkout_session_id IS NOT NULL
          AND type = 'charge'
          AND status = 'succeeded'
    $sql$;
  ELSE
    RAISE NOTICE 'Skipping ux_payment_transactions_succeeded_charge_session_kind because duplicate succeeded charge rows already exist.';
  END IF;
END
$$;

-- Reservation screens and admin support need fast filtering by restaurant,
-- status and freshness. The generic created_at index is intentionally broad
-- because historical migrations use multiple date/time column names.
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_status_created_at
  ON public.reservations (restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_user_created_at
  ON public.reservations (user_id, created_at DESC);

-- Restaurant discovery, availability and dashboard reads.
CREATE INDEX IF NOT EXISTS idx_restaurants_owner_id
  ON public.restaurants (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_active_created_at
  ON public.restaurants (created_at DESC)
  WHERE COALESCE(is_active, true) = true;

-- Webhook idempotency already has a primary key on event_id; this keeps
-- retention/cleanup and recent event diagnostics cheap.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_processed_at
  ON public.stripe_webhook_events (event_type, processed_at DESC);

COMMENT ON INDEX public.idx_orders_restaurant_status_created_at IS
  'Scale readiness: restaurant dashboard and support order filtering by status and recency.';
COMMENT ON INDEX public.idx_orders_pending_payment_watchdog IS
  'Scale readiness: fast detection of stale pending online checkout orders.';
DO $$
BEGIN
  IF to_regclass('public.ux_payment_transactions_succeeded_charge_session_kind') IS NOT NULL THEN
    EXECUTE $sql$
      COMMENT ON INDEX public.ux_payment_transactions_succeeded_charge_session_kind IS
        'Scale readiness: prevents duplicate succeeded charge records for one Stripe checkout session and checkout kind.'
    $sql$;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
