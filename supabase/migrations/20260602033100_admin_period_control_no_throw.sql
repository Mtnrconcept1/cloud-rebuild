-- Avoid noisy 400 responses while the admin dashboard is mounted before
-- the browser session has fully recovered. The payload below is non-sensitive
-- and contains no accounting figures.

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
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RETURN jsonb_build_object(
      'period_month', v_month,
      'status', 'open',
      'is_closed', false,
      'lock', NULL,
      'stripe_reconciliation', '[]'::jsonb
    );
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

NOTIFY pgrst, 'reload schema';
