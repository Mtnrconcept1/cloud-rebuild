-- The existing TOK invoice is the only invoice shown in both dashboards.
-- Subscriptions are authorized alongside payable invoices; payout/reservation
-- invoice types and RLS role checks remain unchanged.
CREATE OR REPLACE FUNCTION public.get_payable_invoice_lines(p_invoice_id uuid)
 RETURNS TABLE(line_id uuid, item_kind text, source_table text, source_id uuid, source_label text, occurred_at timestamp with time zone, quantity numeric, unit_amount numeric, base_amount numeric, rate_label text, rate_value numeric, amount_ht numeric, amount_tva numeric, amount_ttc numeric, metadata jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.restaurant_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  IF COALESCE(v_invoice.invoice_type, 'payout') NOT IN ('payable', 'subscription') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT (
    auth.role() = 'service_role'
    OR public.auth_is_admin()
    OR public.auth_owns_restaurant(v_invoice.restaurant_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    li.id,
    li.item_kind,
    li.source_table,
    li.source_id,
    li.source_label,
    li.occurred_at,
    li.quantity,
    li.unit_amount,
    li.base_amount,
    li.rate_label,
    li.rate_value,
    li.amount_ht,
    li.amount_tva,
    li.amount_ttc,
    li.metadata
  FROM public.restaurant_invoice_line_items li
  WHERE li.invoice_id = p_invoice_id
  ORDER BY li.occurred_at ASC, li.created_at ASC, li.id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_payable_invoice_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payable_invoice_lines(uuid) TO authenticated, service_role;
