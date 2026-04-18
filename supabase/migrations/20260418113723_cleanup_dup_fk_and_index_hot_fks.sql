-- Cleanup duplicate FK on reservations.restaurant_invoice_id and add covering
-- indexes on the hottest foreign keys flagged by the perf advisor
-- (lint 0001_unindexed_foreign_keys).

-- The newer 20260417180419_reservation_billing_schema migration added
-- reservations_invoice_fk; an earlier rebuild migration had also added
-- reservations_restaurant_invoice_id_fkey with the same definition.
-- Drop the duplicate to keep a single FK constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservations_restaurant_invoice_id_fkey') THEN
    ALTER TABLE public.reservations DROP CONSTRAINT reservations_restaurant_invoice_id_fkey;
  END IF;
END $$;

-- Hot FK indexes for orders / order_items / reservations.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_id ON public.orders(courier_id) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON public.orders(restaurant_invoice_id) WHERE restaurant_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_id ON public.order_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_anti_waste_offer_id ON public.order_items(anti_waste_offer_id) WHERE anti_waste_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON public.reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON public.reservations(user_id);
