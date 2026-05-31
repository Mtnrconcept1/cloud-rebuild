-- Centralized admin alerts for operations, payments, dispatch, campaigns and production health.
-- The RPC is intentionally read-only and SECURITY DEFINER gated by has_role(auth.uid(), 'admin').

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_alerts(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  alert_id text,
  severity text,
  category text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  status text,
  href text,
  created_at timestamptz,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  RETURN QUERY
  WITH order_alerts AS (
    SELECT
      'order:' || o.id::text || ':paid-but-pending' AS alert_id,
      'critical'::text AS severity,
      'order'::text AS category,
      'Commande payée encore bloquée paiement'::text AS title,
      'Le paiement est confirmé mais la commande reste dans un statut d''attente. Vérifier webhook Stripe et création métier.'::text AS body,
      'order'::text AS entity_type,
      o.id AS entity_id,
      'new'::text AS status,
      '/admin/commandes-reservations?order=' || o.id::text AS href,
      COALESCE(o.created_at, now()) AS created_at,
      to_jsonb(o) AS payload
    FROM public.orders o
    WHERE lower(COALESCE(o.payment_status::text, '')) IN ('paid', 'succeeded', 'success', 'captured', 'requires_capture')
      AND lower(COALESCE(o.status::text, '')) IN ('pending', 'pending_payment', 'awaiting_payment')

    UNION ALL

    SELECT
      'order:' || o.id::text || ':stale-open-order' AS alert_id,
      CASE WHEN o.created_at <= now() - interval '45 minutes' THEN 'critical' ELSE 'high' END::text AS severity,
      'order'::text AS category,
      'Commande ouverte trop longtemps'::text AS title,
      'Commande ouverte depuis plus de 20 minutes. Vérifier restaurant, coursier et notification client.'::text AS body,
      'order'::text AS entity_type,
      o.id AS entity_id,
      'new'::text AS status,
      '/admin/commandes-reservations?order=' || o.id::text AS href,
      COALESCE(o.created_at, now()) AS created_at,
      to_jsonb(o) AS payload
    FROM public.orders o
    WHERE lower(COALESCE(o.status::text, '')) IN ('pending', 'pending_payment', 'awaiting_payment', 'paid', 'confirmed', 'accepted', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'in_progress')
      AND COALESCE(o.created_at, now()) <= now() - interval '20 minutes'
  ),
  reservation_alerts AS (
    SELECT
      'reservation:' || r.id::text || ':not-confirmed-soon' AS alert_id,
      CASE
        WHEN make_timestamptz(
          EXTRACT(YEAR FROM r.date)::int,
          EXTRACT(MONTH FROM r.date)::int,
          EXTRACT(DAY FROM r.date)::int,
          EXTRACT(HOUR FROM COALESCE(r.time, r.reservation_time, '00:00'::time))::int,
          EXTRACT(MINUTE FROM COALESCE(r.time, r.reservation_time, '00:00'::time))::int,
          0
        ) <= now() + interval '45 minutes' THEN 'critical'
        ELSE 'high'
      END::text AS severity,
      'reservation'::text AS category,
      'Réservation proche non confirmée'::text AS title,
      'La réservation arrive bientôt mais son statut n''est pas confirmé. Contacter le restaurant ou le client.'::text AS body,
      'reservation'::text AS entity_type,
      r.id AS entity_id,
      'new'::text AS status,
      '/admin/commandes-reservations?reservation=' || r.id::text AS href,
      COALESCE(r.created_at, now()) AS created_at,
      to_jsonb(r) AS payload
    FROM public.reservations r
    WHERE lower(COALESCE(r.status::text, '')) NOT IN ('confirmed', 'cancelled', 'canceled', 'completed', 'no_show')
      AND r.date IS NOT NULL
      AND make_timestamptz(
        EXTRACT(YEAR FROM r.date)::int,
        EXTRACT(MONTH FROM r.date)::int,
        EXTRACT(DAY FROM r.date)::int,
        EXTRACT(HOUR FROM COALESCE(r.time, r.reservation_time, '00:00'::time))::int,
        EXTRACT(MINUTE FROM COALESCE(r.time, r.reservation_time, '00:00'::time))::int,
        0
      ) BETWEEN now() - interval '3 hours' AND now() + interval '2 hours'
  ),
  dispatch_alerts AS (
    SELECT
      'dispatch:' || d.id::text || ':no-courier' AS alert_id,
      CASE WHEN COALESCE(d.created_at, now()) <= now() - interval '25 minutes' THEN 'critical' ELSE 'high' END::text AS severity,
      'dispatch'::text AS category,
      'Mission livraison sans coursier'::text AS title,
      'Aucun coursier assigné depuis plus de 10 minutes. Relancer le dispatch ou prévenir le restaurant.'::text AS body,
      'dispatch_job'::text AS entity_type,
      d.id AS entity_id,
      'new'::text AS status,
      '/admin/commandes-reservations?dispatch=' || d.id::text AS href,
      COALESCE(d.created_at, now()) AS created_at,
      to_jsonb(d) AS payload
    FROM public.dispatch_jobs d
    WHERE lower(COALESCE(d.status::text, '')) IN ('searching', 'assigned', 'accepted', 'pickup', 'picked_up', 'en_route', 'delivering', 'in_progress')
      AND d.courier_id IS NULL
      AND COALESCE(d.created_at, now()) <= now() - interval '10 minutes'
  ),
  refund_alerts AS (
    SELECT
      'refund:' || rr.id::text || ':pending' AS alert_id,
      CASE WHEN lower(COALESCE(rr.status::text, '')) = 'failed' THEN 'critical' ELSE 'high' END::text AS severity,
      'refund'::text AS category,
      CASE WHEN lower(COALESCE(rr.status::text, '')) = 'failed' THEN 'Remboursement échoué' ELSE 'Remboursement en attente' END::text AS title,
      'Un remboursement reste à traiter ou à confirmer côté Stripe/comptabilité.'::text AS body,
      'refund_request'::text AS entity_type,
      rr.id AS entity_id,
      'new'::text AS status,
      '/admin/commandes-reservations?tab=refunds'::text AS href,
      COALESCE(rr.created_at, now()) AS created_at,
      to_jsonb(rr) AS payload
    FROM public.refund_requests rr
    WHERE lower(COALESCE(rr.status::text, 'pending')) IN ('pending', 'open', 'requested', 'failed', 'requires_action')
  ),
  restaurant_alerts AS (
    SELECT
      'restaurant:' || r.id::text || ':active-incomplete' AS alert_id,
      CASE
        WHEN ((r.name IS NULL OR trim(r.name) = '')::int + (r.address IS NULL OR trim(r.address) = '')::int + (r.city IS NULL OR trim(r.city) = '')::int + (r.latitude IS NULL)::int + (r.longitude IS NULL)::int) >= 3 THEN 'high'
        ELSE 'medium'
      END::text AS severity,
      'restaurant'::text AS category,
      'Restaurant actif avec données critiques manquantes'::text AS title,
      'Le restaurant est actif mais son profil est incomplet. Bloquer publication ou corriger la fiche.'::text AS body,
      'restaurant'::text AS entity_type,
      r.id AS entity_id,
      'new'::text AS status,
      '/admin/restaurants?restaurant=' || r.id::text AS href,
      COALESCE(r.updated_at, r.created_at, now()) AS created_at,
      to_jsonb(r) AS payload
    FROM public.restaurants r
    WHERE COALESCE(r.is_active, false) = true
      AND (
        r.name IS NULL OR trim(r.name) = '' OR
        r.address IS NULL OR trim(r.address) = '' OR
        r.city IS NULL OR trim(r.city) = '' OR
        r.latitude IS NULL OR r.longitude IS NULL
      )
  ),
  campaign_alerts AS (
    SELECT
      'campaign:' || c.id::text || ':paid-inactive' AS alert_id,
      'high'::text AS severity,
      'campaign'::text AS category,
      'Campagne payée inactive'::text AS title,
      'Budget encaissé mais campagne inactive. Vérifier activation, dates, ciblage et post sponsorisé associé.'::text AS body,
      'ad_campaign'::text AS entity_type,
      c.id AS entity_id,
      'new'::text AS status,
      '/admin/actualites?campaign=' || c.id::text AS href,
      COALESCE(c.created_at, now()) AS created_at,
      to_jsonb(c) AS payload
    FROM public.ad_campaigns c
    WHERE lower(COALESCE(c.payment_status::text, '')) IN ('paid', 'succeeded', 'success', 'captured')
      AND lower(COALESCE(c.status::text, '')) IN ('inactive', 'paused', 'draft', 'pending')
  ),
  edge_alerts AS (
    SELECT
      'edge:' || e.id::text || ':failure' AS alert_id,
      CASE WHEN e.function_name IN ('stripe-webhook', 'create-checkout', 'dispatch-order') THEN 'critical' ELSE 'high' END::text AS severity,
      'production'::text AS category,
      'Edge Function en échec : ' || COALESCE(e.function_name, 'inconnue') AS title,
      'Une fonction critique échoue. Consulter les logs avant nouvelle mise en production.'::text AS body,
      'edge_function_audit_log'::text AS entity_type,
      e.id AS entity_id,
      'new'::text AS status,
      '/admin/audit'::text AS href,
      COALESCE(e.created_at, now()) AS created_at,
      to_jsonb(e) AS payload
    FROM public.edge_function_audit_logs e
    WHERE lower(COALESCE(e.status::text, '')) IN ('failure', 'failed', 'error', 'timeout')
      AND COALESCE(e.created_at, now()) >= now() - interval '24 hours'
  )
  SELECT * FROM (
    SELECT * FROM order_alerts
    UNION ALL SELECT * FROM reservation_alerts
    UNION ALL SELECT * FROM dispatch_alerts
    UNION ALL SELECT * FROM refund_alerts
    UNION ALL SELECT * FROM restaurant_alerts
    UNION ALL SELECT * FROM campaign_alerts
    UNION ALL SELECT * FROM edge_alerts
  ) alerts
  ORDER BY
    CASE severity
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END,
    created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 250));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_alerts(integer) TO authenticated;
