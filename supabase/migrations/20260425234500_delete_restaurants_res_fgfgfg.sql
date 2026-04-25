-- Delete demo restaurants named "res" and "fgfgfg" with their operational
-- and accounting data, while leaving auth/profiles untouched.

DO $$
BEGIN
  CREATE TEMP TABLE pg_temp.target_restaurants ON COMMIT DROP AS
  SELECT id, name
  FROM public.restaurants
  WHERE lower(trim(name)) IN ('res', 'fgfgfg');

  IF NOT EXISTS (SELECT 1 FROM pg_temp.target_restaurants) THEN
    RAISE NOTICE 'No restaurants named res or fgfgfg were found.';
    RETURN;
  END IF;

  CREATE TEMP TABLE pg_temp.target_orders ON COMMIT DROP AS
  SELECT o.id
  FROM public.orders o
  JOIN pg_temp.target_restaurants tr ON tr.id = o.restaurant_id;

  CREATE TEMP TABLE pg_temp.target_reservations ON COMMIT DROP AS
  SELECT r.id
  FROM public.reservations r
  JOIN pg_temp.target_restaurants tr ON tr.id = r.restaurant_id;

  IF to_regclass('public.courier_earnings') IS NOT NULL THEN
    DELETE FROM public.courier_earnings ce
    WHERE EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN pg_temp.target_orders o ON o.id = dj.order_id
      WHERE dj.id = ce.dispatch_job_id
    );
  END IF;

  IF to_regclass('public.dispatch_jobs') IS NOT NULL THEN
    DELETE FROM public.dispatch_jobs dj
    USING pg_temp.target_orders o
    WHERE dj.order_id = o.id;
  END IF;

  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    DELETE FROM public.payment_transactions pt
    USING pg_temp.target_orders o
    WHERE pt.order_id = o.id;
  END IF;

  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    DELETE FROM public.payment_intents pi
    USING pg_temp.target_orders o
    WHERE pi.order_id = o.id;
  END IF;

  IF to_regclass('public.delivery_tracking') IS NOT NULL THEN
    DELETE FROM public.delivery_tracking dt
    USING pg_temp.target_orders o
    WHERE dt.order_id = o.id;
  END IF;

  IF to_regclass('public.order_refunds') IS NOT NULL THEN
    DELETE FROM public.order_refunds r
    USING pg_temp.target_orders o
    WHERE r.order_id = o.id;
  END IF;

  IF to_regclass('public.order_issues') IS NOT NULL THEN
    DELETE FROM public.order_issues oi
    USING pg_temp.target_orders o
    WHERE oi.order_id = o.id;
  END IF;

  IF to_regclass('public.order_events') IS NOT NULL THEN
    DELETE FROM public.order_events oe
    USING pg_temp.target_orders o
    WHERE oe.order_id = o.id;
  END IF;

  IF to_regclass('public.order_notes') IS NOT NULL THEN
    DELETE FROM public.order_notes ont
    USING pg_temp.target_orders o
    WHERE ont.order_id = o.id;
  END IF;

  IF to_regclass('public.order_taxes') IS NOT NULL THEN
    DELETE FROM public.order_taxes ot
    USING pg_temp.target_orders o
    WHERE ot.order_id = o.id;
  END IF;

  IF to_regclass('public.order_fees') IS NOT NULL THEN
    DELETE FROM public.order_fees ofe
    USING pg_temp.target_orders o
    WHERE ofe.order_id = o.id;
  END IF;

  IF to_regclass('public.order_status_history') IS NOT NULL THEN
    DELETE FROM public.order_status_history osh
    USING pg_temp.target_orders o
    WHERE osh.order_id = o.id;
  END IF;

  IF to_regclass('public.order_addresses') IS NOT NULL THEN
    DELETE FROM public.order_addresses oa
    USING pg_temp.target_orders o
    WHERE oa.order_id = o.id;
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL THEN
    DELETE FROM public.conversations c
    USING pg_temp.target_orders o
    WHERE c.order_id = o.id;
  END IF;

  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    DELETE FROM public.support_tickets st
    USING pg_temp.target_orders o
    WHERE st.order_id = o.id;
  END IF;

  IF to_regclass('public.promo_code_uses') IS NOT NULL THEN
    DELETE FROM public.promo_code_uses pcu
    WHERE EXISTS (
      SELECT 1
      FROM pg_temp.target_orders o
      WHERE pcu.order_id = o.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.promo_codes pc
      JOIN pg_temp.target_restaurants tr ON tr.id = pc.restaurant_id
      WHERE pc.id = pcu.promo_code_id
    );
  END IF;

  IF to_regclass('public.group_members') IS NOT NULL THEN
    DELETE FROM public.group_members gm
    USING pg_temp.target_orders o
    WHERE gm.order_id = o.id;
  END IF;

  IF to_regclass('public.order_groups') IS NOT NULL THEN
    DELETE FROM public.order_groups og
    USING pg_temp.target_restaurants tr
    WHERE og.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_items oi
    USING pg_temp.target_orders o
    WHERE oi.order_id = o.id;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    DELETE FROM public.invoices i
    USING pg_temp.target_orders o
    WHERE i.order_id = o.id;
  END IF;

  IF to_regclass('public.reservation_slots') IS NOT NULL THEN
    DELETE FROM public.reservation_slots rs
    USING pg_temp.target_reservations r
    WHERE rs.reservation_id = r.id;
  END IF;

  IF to_regclass('public.reservation_status_history') IS NOT NULL THEN
    DELETE FROM public.reservation_status_history rsh
    USING pg_temp.target_reservations r
    WHERE rsh.reservation_id = r.id;
  END IF;

  IF to_regclass('public.restaurant_invoice_line_items') IS NOT NULL THEN
    DELETE FROM public.restaurant_invoice_line_items li
    USING pg_temp.target_restaurants tr
    WHERE li.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.restaurant_invoices') IS NOT NULL THEN
    DELETE FROM public.restaurant_invoices ri
    USING pg_temp.target_restaurants tr
    WHERE ri.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.restaurant_daily_kpis') IS NOT NULL THEN
    DELETE FROM public.restaurant_daily_kpis kpi
    USING pg_temp.target_restaurants tr
    WHERE kpi.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.chef_table_drops') IS NOT NULL THEN
    DELETE FROM public.chef_table_drops ctd
    USING pg_temp.target_restaurants tr
    WHERE ctd.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
    DELETE FROM public.user_subscriptions us
    USING pg_temp.target_restaurants tr
    WHERE us.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.user_analytics') IS NOT NULL THEN
    DELETE FROM public.user_analytics ua
    USING pg_temp.target_restaurants tr
    WHERE ua.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.promo_codes') IS NOT NULL THEN
    DELETE FROM public.promo_codes pc
    USING pg_temp.target_restaurants tr
    WHERE pc.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders o
    USING pg_temp.target_restaurants tr
    WHERE o.restaurant_id = tr.id;
  END IF;

  IF to_regclass('public.reservations') IS NOT NULL THEN
    DELETE FROM public.reservations r
    USING pg_temp.target_restaurants tr
    WHERE r.restaurant_id = tr.id;
  END IF;

  DELETE FROM public.restaurants r
  USING pg_temp.target_restaurants tr
  WHERE r.id = tr.id;
END $$;

NOTIFY pgrst, 'reload schema';
