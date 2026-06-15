-- Cash orders are paid directly to the restaurant, then TOK invoices the
-- restaurant commission. They must therefore be commissionable without waiting
-- for Stripe capture, while still keeping payment_method = cash in metadata.

UPDATE public.orders o
SET payment_status = 'paid',
    updated_at = now()
WHERE lower(COALESCE(o.payment_status, '')) IN ('pending', 'pending_payment')
  AND lower(COALESCE(o.metadata ->> 'payment_method', '')) IN ('cash', 'especes', 'cash_on_delivery', 'on_site', 'onsite')
  AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'payment_failed', 'refused', 'pending', 'pending_payment')
  AND COALESCE(o.total_amount, 0) > 0;
