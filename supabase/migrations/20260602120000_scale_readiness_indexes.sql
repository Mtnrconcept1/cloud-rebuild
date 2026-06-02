BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created_at
  ON public.orders (restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_checkout_id
  ON public.orders (checkout_id)
  WHERE checkout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_payment_created_at
  ON public.orders (created_at ASC)
  WHERE lower(COALESCE(status, '')) = 'pending_payment'
     OR lower(COALESCE(payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment');

CREATE INDEX IF NOT EXISTS idx_orders_metadata_stripe_session_id
  ON public.orders ((metadata->>'stripe_session_id'))
  WHERE metadata ? 'stripe_session_id';

CREATE INDEX IF NOT EXISTS idx_orders_metadata_checkout_group_id
  ON public.orders ((metadata->>'checkout_group_id'))
  WHERE metadata ? 'checkout_group_id';

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_status_type
  ON public.payment_transactions (order_id, status, type, created_at DESC)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_session_status_type
  ON public.payment_transactions (stripe_checkout_session_id, status, type)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_payment_intent
  ON public.payment_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_succeeded_charge_session_kind
  ON public.payment_transactions (
    stripe_checkout_session_id,
    COALESCE(metadata->>'checkout_kind', 'order')
  )
  WHERE stripe_checkout_session_id IS NOT NULL
    AND type = 'charge'
    AND status = 'succeeded';

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_status_created_at
  ON public.reservations (restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_user_created_at
  ON public.reservations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurants_owner_id
  ON public.restaurants (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_active_created_at
  ON public.restaurants (created_at DESC)
  WHERE COALESCE(is_active, true) = true;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_processed_at
  ON public.stripe_webhook_events (event_type, processed_at DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
