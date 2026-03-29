CREATE OR REPLACE FUNCTION public.get_restaurant_payment_history(
  p_restaurant_id uuid,
  p_limit integer DEFAULT 100,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(
  event_id uuid,
  event_kind text,
  direction text,
  occurred_at timestamptz,
  amount numeric,
  currency text,
  status text,
  title text,
  subtitle text,
  payment_method text,
  order_id uuid,
  campaign_id uuid,
  invoice_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service_role AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_is_service_role
    AND NOT public.has_role(v_actor_id, 'admin')
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = p_restaurant_id
        AND r.owner_id = v_actor_id
    ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH requested_events AS (
    SELECT
      pt.id AS event_id,
      CASE
        WHEN pt.type = 'refund' THEN 'order_refund'
        ELSE 'order_charge'
      END::text AS event_kind,
      'received'::text AS direction,
      pt.created_at AS occurred_at,
      pt.amount,
      lower(COALESCE(NULLIF(pt.currency, ''), 'chf')) AS currency,
      pt.status,
      CASE
        WHEN pt.type = 'refund' THEN 'Remboursement client'
        ELSE 'Commande payee'
      END::text AS title,
      CONCAT(
        'Commande ',
        COALESCE(
          NULLIF(o.order_number, ''),
          NULLIF(pt.metadata ->> 'order_reference', ''),
          '#' || left(o.id::text, 8)
        )
      )::text AS subtitle,
      NULLIF(
        trim(
          COALESCE(
            CASE
              WHEN NULLIF(pt.metadata ->> 'card_brand', '') IS NOT NULL
                AND NULLIF(pt.metadata ->> 'card_last4', '') IS NOT NULL
                THEN initcap(pt.metadata ->> 'card_brand') || ' **** ' || (pt.metadata ->> 'card_last4')
              WHEN NULLIF(pt.metadata ->> 'card_brand', '') IS NOT NULL
                THEN initcap(pt.metadata ->> 'card_brand')
              ELSE NULL
            END,
            CASE
              WHEN NULLIF(o.metadata ->> 'card_brand', '') IS NOT NULL
                AND NULLIF(o.metadata ->> 'card_last4', '') IS NOT NULL
                THEN initcap(o.metadata ->> 'card_brand') || ' **** ' || (o.metadata ->> 'card_last4')
              WHEN NULLIF(o.metadata ->> 'card_brand', '') IS NOT NULL
                THEN initcap(o.metadata ->> 'card_brand')
              ELSE NULL
            END,
            NULLIF(pt.metadata ->> 'payment_method', ''),
            NULLIF(o.metadata ->> 'payment_method', '')
          )
        ),
        ''
      ) AS payment_method,
      o.id AS order_id,
      NULL::uuid AS campaign_id,
      NULL::uuid AS invoice_id
    FROM public.payment_transactions pt
    JOIN public.orders o ON o.id = pt.order_id
    WHERE o.restaurant_id = p_restaurant_id
      AND pt.type IN ('charge', 'refund')

    UNION ALL

    SELECT
      c.id AS event_id,
      'campaign_payment'::text AS event_kind,
      'issued'::text AS direction,
      COALESCE(c.paid_at, c.activated_at, c.updated_at, c.created_at) AS occurred_at,
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END AS amount,
      'chf'::text AS currency,
      CASE
        WHEN c.payment_status = 'paid' THEN 'succeeded'
        ELSE COALESCE(c.payment_status, 'pending')
      END::text AS status,
      'Campagne payee'::text AS title,
      COALESCE(NULLIF(c.title, ''), 'Campagne')::text AS subtitle,
      NULLIF(trim(COALESCE(c.payment_method, '')), '') AS payment_method,
      NULL::uuid AS order_id,
      c.id AS campaign_id,
      NULL::uuid AS invoice_id
    FROM public.ad_campaigns c
    WHERE c.restaurant_id = p_restaurant_id
      AND COALESCE(c.payment_status, 'unpaid') <> 'unpaid'

    UNION ALL

    SELECT
      i.id AS event_id,
      'invoice_payment'::text AS event_kind,
      'issued'::text AS direction,
      COALESCE(i.paid_at, i.updated_at, i.created_at) AS occurred_at,
      i.amount_ttc AS amount,
      'chf'::text AS currency,
      'succeeded'::text AS status,
      'Facture reglee'::text AS title,
      COALESCE(
        NULLIF(i.invoice_number, ''),
        'Periode ' || to_char(i.period_start, 'MM/YYYY') || ' - ' || to_char(i.period_end, 'MM/YYYY')
      )::text AS subtitle,
      NULL::text AS payment_method,
      NULL::uuid AS order_id,
      NULL::uuid AS campaign_id,
      i.id AS invoice_id
    FROM public.restaurant_invoices i
    WHERE i.restaurant_id = p_restaurant_id
      AND (i.status = 'paid' OR i.paid_at IS NOT NULL)
  )
  SELECT
    requested_events.event_id,
    requested_events.event_kind,
    requested_events.direction,
    requested_events.occurred_at,
    requested_events.amount,
    requested_events.currency,
    requested_events.status,
    requested_events.title,
    requested_events.subtitle,
    requested_events.payment_method,
    requested_events.order_id,
    requested_events.campaign_id,
    requested_events.invoice_id
  FROM requested_events
  WHERE p_before IS NULL OR requested_events.occurred_at < p_before
  ORDER BY requested_events.occurred_at DESC, requested_events.event_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_payment_history(uuid, integer, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_payment_history(uuid, integer, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_payment_history(uuid, integer, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_payment_history(uuid, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_payment_history(uuid, integer, timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
