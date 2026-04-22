-- Normalized payout invoice line details for payout invoices only.
-- This RPC is intentionally explicit: it inspects the linked order/reservation
-- rows directly and does not depend on frontend-side classification helpers.

CREATE OR REPLACE FUNCTION public.get_payout_invoice_lines(
  p_invoice_id uuid
)
RETURNS TABLE (
  line_id uuid,
  line_type text,
  source text,
  reference text,
  label text,
  occurred_at timestamptz,
  gross_amount numeric,
  rate_applied numeric,
  invoiced_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  IF COALESCE(v_invoice.invoice_type, 'payout') <> 'payout' THEN
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
  WITH order_lines AS (
    SELECT
      o.id AS line_id,
      'order'::text AS line_type,
      CASE
        WHEN n.feature_norm IN (
          public.normalize_search_text('ventes-flash'),
          public.normalize_search_text('ventes_flash'),
          public.normalize_search_text('flash-sale'),
          public.normalize_search_text('flash_sale')
        )
          OR public.is_truthy_text(o.metadata ->> 'has_flash_sale')
          OR public.is_truthy_text(o.metadata ->> 'is_flash_sale')
          OR NULLIF(trim(COALESCE(o.metadata ->> 'flash_sale_id', '')), '') IS NOT NULL
          OR oi.has_flash_sale_fallback
          THEN 'flash_sales'
        WHEN n.feature_norm IN (
          public.normalize_search_text('anti-gaspi'),
          public.normalize_search_text('anti_gaspi'),
          public.normalize_search_text('anti-waste'),
          public.normalize_search_text('anti_waste'),
          public.normalize_search_text('zero-gaspi'),
          public.normalize_search_text('zero_gaspi')
        )
          OR public.is_truthy_text(o.metadata ->> 'has_anti_gaspi')
          OR public.is_truthy_text(o.metadata ->> 'is_anti_waste')
          OR NULLIF(trim(COALESCE(o.metadata ->> 'anti_waste_offer_id', '')), '') IS NOT NULL
          OR oi.has_anti_gaspi_fallback
          THEN 'anti_gaspi'
        WHEN n.feature_norm IN (
          public.normalize_search_text('chefs-table'),
          public.normalize_search_text('chefs_table'),
          public.normalize_search_text('table-chef'),
          public.normalize_search_text('table_chef')
        )
          OR public.is_truthy_text(o.metadata ->> 'is_chefs_table')
          OR NULLIF(trim(COALESCE(o.metadata ->> 'chefs_table_id', '')), '') IS NOT NULL
          THEN 'chefs_table'
        WHEN n.feature_norm IN (public.normalize_search_text('zero-attente'), public.normalize_search_text('zero_attente'))
          THEN 'zero_attente'
        ELSE 'orders'
      END::text AS source,
      COALESCE(
        NULLIF(trim(COALESCE(o.order_number, '')), ''),
        left(o.id::text, 8)
      )::text AS reference,
      CONCAT(
        'Commande ',
        COALESCE(
          NULLIF(trim(COALESCE(o.order_number, '')), ''),
          '#' || left(o.id::text, 8)
        )
      )::text AS label,
      o.created_at AS occurred_at,
      (
        COALESCE(o.total_amount, 0)
        + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0)
      )::numeric AS gross_amount,
      0.90::numeric AS rate_applied,
      ROUND(
        (
          COALESCE(o.total_amount, 0)
          + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0)
        ) * 0.90,
        2
      )::numeric AS invoiced_amount
    FROM public.orders o
    CROSS JOIN LATERAL (
      SELECT
        public.normalize_search_text(COALESCE(o.metadata ->> 'feature', '')) AS feature_norm
    ) AS n
    CROSS JOIN LATERAL (
      SELECT
        EXISTS (
          SELECT 1
          FROM public.order_items oi
          WHERE oi.order_id = o.id
            AND (
              oi.anti_waste_offer_id IS NOT NULL
              OR NULLIF(trim(COALESCE(oi.metadata ->> 'flash_sale_id', '')), '') IS NOT NULL
              OR NULLIF(trim(COALESCE(oi.metadata ->> 'anti_waste_offer_id', '')), '') IS NOT NULL
              OR public.is_truthy_text(oi.metadata ->> 'is_anti_waste')
              OR public.is_truthy_text(oi.metadata ->> 'is_flash_sale')
            )
        ) AS has_anti_gaspi_fallback,
        EXISTS (
          SELECT 1
          FROM public.order_items oi
          WHERE oi.order_id = o.id
            AND (
              NULLIF(trim(COALESCE(oi.metadata ->> 'flash_sale_id', '')), '') IS NOT NULL
              OR public.is_truthy_text(oi.metadata ->> 'is_flash_sale')
            )
        ) AS has_flash_sale_fallback
    ) AS oi
    WHERE o.restaurant_invoice_id = p_invoice_id
  ),
  reservation_lines AS (
    SELECT
      r.id AS line_id,
      'reservation'::text AS line_type,
      CASE
        WHEN n.feature_norm IN (public.normalize_search_text('zero-attente'), public.normalize_search_text('zero_attente'))
          THEN 'zero_attente'
        WHEN n.feature_norm IN (
          public.normalize_search_text('chefs-table'),
          public.normalize_search_text('chefs_table'),
          public.normalize_search_text('table-chef'),
          public.normalize_search_text('table_chef')
        )
          THEN 'chefs_table'
        WHEN n.feature_norm IN (
          public.normalize_search_text('ventes-flash'),
          public.normalize_search_text('ventes_flash'),
          public.normalize_search_text('flash-sale'),
          public.normalize_search_text('flash_sale')
        )
          THEN 'flash_sales'
        WHEN n.feature_norm IN (
          public.normalize_search_text('anti-gaspi'),
          public.normalize_search_text('anti_gaspi'),
          public.normalize_search_text('anti-waste'),
          public.normalize_search_text('anti_waste'),
          public.normalize_search_text('zero-gaspi'),
          public.normalize_search_text('zero_gaspi')
        )
          THEN 'anti_gaspi'
        ELSE 'other'
      END::text AS source,
      COALESCE(
        NULLIF(trim(COALESCE(r.order_reference, '')), ''),
        left(r.id::text, 8)
      )::text AS reference,
      CASE
        WHEN n.feature_norm IN (public.normalize_search_text('zero-attente'), public.normalize_search_text('zero_attente'))
          THEN 'Reservation Zero Attente'
        WHEN n.feature_norm IN (
          public.normalize_search_text('chefs-table'),
          public.normalize_search_text('chefs_table'),
          public.normalize_search_text('table-chef'),
          public.normalize_search_text('table_chef')
        )
          THEN 'Reservation Chef''s Table'
        WHEN n.feature_norm IN (
          public.normalize_search_text('ventes-flash'),
          public.normalize_search_text('ventes_flash'),
          public.normalize_search_text('flash-sale'),
          public.normalize_search_text('flash_sale')
        )
          THEN 'Reservation Vente flash'
        WHEN n.feature_norm IN (
          public.normalize_search_text('anti-gaspi'),
          public.normalize_search_text('anti_gaspi'),
          public.normalize_search_text('anti-waste'),
          public.normalize_search_text('anti_waste'),
          public.normalize_search_text('zero-gaspi'),
          public.normalize_search_text('zero_gaspi')
        )
          THEN 'Reservation Anti-gaspi'
        ELSE 'Reservation'
      END::text AS label,
      COALESCE(r.confirmed_at, r.created_at, r.updated_at) AS occurred_at,
      COALESCE(r.total_amount, 0)::numeric AS gross_amount,
      0.90::numeric AS rate_applied,
      ROUND(COALESCE(r.total_amount, 0) * 0.90, 2)::numeric AS invoiced_amount
    FROM public.reservations r
    CROSS JOIN LATERAL (
      SELECT public.normalize_search_text(COALESCE(r.feature, r.metadata ->> 'feature')) AS feature_norm
    ) AS n
    WHERE r.restaurant_invoice_id = p_invoice_id
  )
  SELECT
    x.line_id,
    x.line_type,
    x.source,
    x.reference,
    x.label,
    x.occurred_at,
    x.gross_amount,
    x.rate_applied,
    x.invoiced_amount
  FROM (
    SELECT * FROM order_lines
    UNION ALL
    SELECT * FROM reservation_lines
  ) AS x
  ORDER BY x.occurred_at ASC, x.line_type ASC, x.line_id ASC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
