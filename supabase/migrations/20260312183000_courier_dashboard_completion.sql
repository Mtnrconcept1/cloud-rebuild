DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dispatch_jobs'
  ) THEN
    EXECUTE 'ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs';
    EXECUTE '' ||
      'CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_attempts da ' ||
      '    JOIN public.couriers c ON c.id = da.courier_id ' ||
      '    WHERE da.dispatch_job_id = dispatch_jobs.id AND c.user_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.orders o ' ||
      '    JOIN public.restaurants r ON r.id = o.restaurant_id ' ||
      '    WHERE o.id = dispatch_jobs.order_id AND r.owner_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.orders o ' ||
      '    WHERE o.id = dispatch_jobs.order_id AND o.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "orders_courier_select" ON public.orders';
    EXECUTE '' ||
      'CREATE POLICY "orders_courier_select" ON public.orders ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_jobs dj ' ||
      '    JOIN public.couriers c ON c.id = dj.courier_id ' ||
      '    WHERE dj.order_id = orders.id AND c.user_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_attempts da ' ||
      '    JOIN public.dispatch_jobs dj ON dj.id = da.dispatch_job_id ' ||
      '    JOIN public.couriers c ON c.id = da.courier_id ' ||
      '    WHERE dj.order_id = orders.id AND c.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_tracking'
  ) THEN
    EXECUTE 'ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "delivery_tracking_courier_select" ON public.delivery_tracking';
    EXECUTE '' ||
      'CREATE POLICY "delivery_tracking_courier_select" ON public.delivery_tracking ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_jobs dj ' ||
      '    JOIN public.couriers c ON c.id = dj.courier_id ' ||
      '    WHERE dj.order_id = delivery_tracking.order_id AND c.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;
