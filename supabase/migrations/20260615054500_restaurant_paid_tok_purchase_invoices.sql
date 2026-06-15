-- Surface restaurateur purchases that are paid directly to TOK in the restaurant
-- outflow invoice history. Webhooks create paid payable invoices and one line item
-- for each paid launch pack, subscription charge or credit pack.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_invoice_line_items_kind_check'
  ) THEN
    ALTER TABLE public.restaurant_invoice_line_items
      DROP CONSTRAINT restaurant_invoice_line_items_kind_check;
  END IF;

  ALTER TABLE public.restaurant_invoice_line_items
    ADD CONSTRAINT restaurant_invoice_line_items_kind_check
    CHECK (item_kind IN (
      'order_commission',
      'reservation_commission',
      'reservation_fee',
      'campaign_payment',
      'manual_adjustment',
      'launch_pack',
      'restaurant_subscription',
      'credit_pack'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurant_invoices_restaurant_number
  ON public.restaurant_invoices(restaurant_id, invoice_number);
