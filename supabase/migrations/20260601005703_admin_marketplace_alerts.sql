CREATE TABLE IF NOT EXISTS public.marketplace_alert_states (
  alert_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'new',
  note text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_alert_states_status_check
    CHECK (status IN ('new', 'in_progress', 'resolved', 'ignored'))
);

CREATE TABLE IF NOT EXISTS public.marketplace_alert_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  note text,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_alert_state_history_status_check
    CHECK (
      (previous_status IS NULL OR previous_status IN ('new', 'in_progress', 'resolved', 'ignored'))
      AND next_status IN ('new', 'in_progress', 'resolved', 'ignored')
    )
);

CREATE INDEX IF NOT EXISTS marketplace_alert_states_status_updated_idx
  ON public.marketplace_alert_states(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS marketplace_alert_state_history_key_created_idx
  ON public.marketplace_alert_state_history(alert_key, created_at DESC);

ALTER TABLE public.marketplace_alert_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_alert_state_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_alert_states_admin_select" ON public.marketplace_alert_states;
CREATE POLICY "marketplace_alert_states_admin_select"
  ON public.marketplace_alert_states
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "marketplace_alert_states_admin_write" ON public.marketplace_alert_states;
CREATE POLICY "marketplace_alert_states_admin_write"
  ON public.marketplace_alert_states
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "marketplace_alert_state_history_admin_select" ON public.marketplace_alert_state_history;
CREATE POLICY "marketplace_alert_state_history_admin_select"
  ON public.marketplace_alert_state_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "marketplace_alert_state_history_admin_insert" ON public.marketplace_alert_state_history;
CREATE POLICY "marketplace_alert_state_history_admin_insert"
  ON public.marketplace_alert_state_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.marketplace_alert_states TO authenticated;
GRANT SELECT, INSERT ON public.marketplace_alert_state_history TO authenticated;

DROP FUNCTION IF EXISTS public.admin_get_marketplace_alerts(boolean);
DROP FUNCTION IF EXISTS public.admin_update_marketplace_alert(text, text, text);

CREATE OR REPLACE FUNCTION public.admin_get_marketplace_alerts(
  p_include_resolved boolean DEFAULT false
)
RETURNS TABLE (
  alert_key text,
  severity text,
  status text,
  source text,
  title text,
  description text,
  entity_type text,
  entity_id text,
  action_url text,
  recommended_action text,
  last_seen_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH dynamic_alerts AS (
    SELECT
      concat('order:pending-payment:', o.id)::text AS alert_key,
      CASE WHEN o.created_at < now() - interval '2 hours' THEN 'critical' ELSE 'high' END::text AS severity,
      'paiements'::text AS source,
      'Paiement de commande bloqué'::text AS title,
      format(
        'Commande %s en attente de paiement depuis %s minutes.',
        COALESCE(o.order_number, '#' || left(o.id::text, 8)),
        floor(extract(epoch FROM now() - o.created_at) / 60)::integer
      )::text AS description,
      'order'::text AS entity_type,
      o.id::text AS entity_id,
      concat('/admin/commandes-reservations?order=', o.id)::text AS action_url,
      'Vérifier Stripe, relancer le client ou annuler la commande avec raison.'::text AS recommended_action,
      COALESCE(o.updated_at, o.created_at) AS last_seen_at,
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'restaurant_id', o.restaurant_id,
        'status', o.status,
        'payment_status', o.payment_status,
        'checkout_id', o.checkout_id,
        'stripe_session_id', o.metadata ->> 'stripe_session_id'
      ) AS metadata
    FROM public.orders o
    WHERE o.created_at < now() - interval '30 minutes'
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'delivered', 'completed', 'refunded')
      AND (
        lower(COALESCE(o.status, '')) IN ('pending', 'pending_payment')
        OR lower(COALESCE(o.payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment', 'requires_action', 'failed')
      )

    UNION ALL

    SELECT
      concat('order:stuck-fulfillment:', o.id)::text AS alert_key,
      CASE WHEN COALESCE(o.updated_at, o.created_at) < now() - interval '2 hours' THEN 'critical' ELSE 'high' END::text AS severity,
      'commandes'::text AS source,
      'Commande active bloquée'::text AS title,
      format(
        'Commande %s au statut %s sans progression récente.',
        COALESCE(o.order_number, '#' || left(o.id::text, 8)),
        COALESCE(o.status, 'inconnu')
      )::text AS description,
      'order'::text AS entity_type,
      o.id::text AS entity_id,
      concat('/admin/commandes-reservations?order=', o.id)::text AS action_url,
      'Contacter le restaurant ou le livreur, puis journaliser la décision.'::text AS recommended_action,
      COALESCE(o.updated_at, o.created_at) AS last_seen_at,
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'restaurant_id', o.restaurant_id,
        'courier_id', o.courier_id,
        'status', o.status,
        'payment_status', o.payment_status,
        'estimated_delivery_at', o.estimated_delivery_at
      ) AS metadata
    FROM public.orders o
    WHERE COALESCE(o.updated_at, o.created_at) < now() - interval '90 minutes'
      AND lower(COALESCE(o.status, '')) IN ('confirmed', 'accepted', 'preparing', 'ready', 'ready_for_pickup', 'out_for_delivery')

    UNION ALL

    SELECT
      concat('dispatch:no-courier:', dj.id)::text AS alert_key,
      CASE
        WHEN dj.status IN ('expired', 'no_courier') OR dj.created_at < now() - interval '30 minutes' THEN 'critical'
        ELSE 'high'
      END::text AS severity,
      'dispatch'::text AS source,
      'Commande sans livreur confirmé'::text AS title,
      format(
        'Dispatch %s au statut %s pour la commande %s.',
        left(dj.id::text, 8),
        COALESCE(dj.status, 'inconnu'),
        COALESCE(o.order_number, '#' || left(o.id::text, 8))
      )::text AS description,
      'dispatch_job'::text AS entity_type,
      dj.id::text AS entity_id,
      concat('/admin/commandes-reservations?dispatch=', dj.id)::text AS action_url,
      'Relancer le dispatch, assigner un livreur ou informer le client.'::text AS recommended_action,
      COALESCE(dj.updated_at, dj.assigned_at, dj.created_at) AS last_seen_at,
      jsonb_build_object(
        'dispatch_job_id', dj.id,
        'order_id', dj.order_id,
        'order_number', o.order_number,
        'courier_id', dj.courier_id,
        'status', dj.status,
        'assigned_at', dj.assigned_at
      ) AS metadata
    FROM public.dispatch_jobs dj
    JOIN public.orders o ON o.id = dj.order_id
    WHERE (
        dj.status IN ('pending', 'searching', 'expired', 'no_courier')
        OR (dj.status = 'assigned' AND dj.accepted_at IS NULL AND COALESCE(dj.assigned_at, dj.created_at) < now() - interval '10 minutes')
      )
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'delivered', 'completed')

    UNION ALL

    SELECT
      concat('reservation:pending:', r.id)::text AS alert_key,
      CASE WHEN (r.date + r.time) < now() THEN 'critical' ELSE 'high' END::text AS severity,
      'réservations'::text AS source,
      'Réservation à confirmer'::text AS title,
      format(
        'Réservation %s pour %s couvert(s), statut %s.',
        COALESCE(r.order_reference, 'RES-' || left(r.id::text, 8)),
        r.party_size,
        COALESCE(r.status, 'inconnu')
      )::text AS description,
      'reservation'::text AS entity_type,
      r.id::text AS entity_id,
      concat('/admin/commandes-reservations?reservation=', r.id)::text AS action_url,
      'Confirmer avec le restaurant ou prévenir le client avant le créneau.'::text AS recommended_action,
      r.created_at AS last_seen_at,
      jsonb_build_object(
        'reservation_id', r.id,
        'restaurant_id', r.restaurant_id,
        'date', r.date,
        'time', r.time,
        'party_size', r.party_size,
        'status', r.status,
        'feature', r.feature
      ) AS metadata
    FROM public.reservations r
    WHERE lower(COALESCE(r.status, '')) IN ('pending', 'waiting', 'waiting_restaurant')
      AND (r.date + r.time) <= now() + interval '24 hours'
      AND (r.date + r.time) >= now() - interval '24 hours'

    UNION ALL

    SELECT
      concat('refund:order:', o.id)::text AS alert_key,
      CASE WHEN COALESCE(o.refund_status, 'pending') = 'failed' THEN 'critical' ELSE 'high' END::text AS severity,
      'remboursements'::text AS source,
      'Remboursement commande en attente'::text AS title,
      format(
        'Commande %s annulée avec CHF %s restant à rembourser.',
        COALESCE(o.order_number, '#' || left(o.id::text, 8)),
        GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0)
      )::text AS description,
      'order'::text AS entity_type,
      o.id::text AS entity_id,
      concat('/admin/commandes-reservations?refund=order:', o.id)::text AS action_url,
      'Traiter le remboursement Stripe puis marquer le suivi comme appliqué.'::text AS recommended_action,
      COALESCE(o.cancelled_at, o.updated_at, o.created_at) AS last_seen_at,
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'refund_status', o.refund_status,
        'refund_reason', o.refund_reason,
        'refund_initiated_by', o.refund_initiated_by,
        'remaining_amount_chf', GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0)
      ) AS metadata
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) IN ('cancelled', 'canceled')
      AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
      AND COALESCE(o.refund_status, 'pending') IN ('pending', 'failed', 'partial')
      AND GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0) > 0

    UNION ALL

    SELECT
      concat('refund:reservation:', r.id)::text AS alert_key,
      CASE WHEN COALESCE(r.refund_status, 'pending') = 'failed' THEN 'critical' ELSE 'high' END::text AS severity,
      'remboursements'::text AS source,
      'Remboursement réservation en attente'::text AS title,
      format(
        'Réservation %s annulée avec CHF %s restant à rembourser.',
        COALESCE(r.order_reference, 'RES-' || left(r.id::text, 8)),
        GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0)
      )::text AS description,
      'reservation'::text AS entity_type,
      r.id::text AS entity_id,
      concat('/admin/commandes-reservations?refund=reservation:', r.id)::text AS action_url,
      'Finaliser le remboursement et prévenir le client.'::text AS recommended_action,
      COALESCE(r.cancelled_at, r.created_at) AS last_seen_at,
      jsonb_build_object(
        'reservation_id', r.id,
        'restaurant_id', r.restaurant_id,
        'refund_status', r.refund_status,
        'refund_reason', r.refund_reason,
        'refund_initiated_by', r.refund_initiated_by,
        'remaining_amount_chf', GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0)
      ) AS metadata
    FROM public.reservations r
    WHERE lower(COALESCE(r.status, '')) IN ('cancelled', 'canceled')
      AND COALESCE(r.total_amount, 0)::numeric > 0
      AND COALESCE(r.refund_status, 'pending') IN ('pending', 'failed', 'partial')
      AND GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0) > 0

    UNION ALL

    SELECT
      concat('restaurant:incomplete:', rest.id)::text AS alert_key,
      'medium'::text AS severity,
      'restaurants'::text AS source,
      concat('Restaurant incomplet : ', rest.name)::text AS title,
      'Profil visible mais incomplet pour la marketplace.'::text AS description,
      'restaurant'::text AS entity_type,
      rest.id::text AS entity_id,
      concat('/admin/restaurants?restaurant=', rest.id)::text AS action_url,
      'Compléter image, cuisine, adresse et géolocalisation avant mise en avant.'::text AS recommended_action,
      COALESCE(rest.updated_at, rest.created_at) AS last_seen_at,
      jsonb_build_object(
        'restaurant_id', rest.id,
        'name', rest.name,
        'status', rest.status,
        'is_active', rest.is_active,
        'missing_image', NULLIF(trim(COALESCE(rest.image_url, '')), '') IS NULL,
        'missing_cuisine', NULLIF(trim(COALESCE(rest.cuisine_type, '')), '') IS NULL,
        'missing_location', rest.latitude IS NULL OR rest.longitude IS NULL,
        'missing_address', NULLIF(trim(COALESCE(rest.address, '')), '') IS NULL OR NULLIF(trim(COALESCE(rest.city, '')), '') IS NULL
      ) AS metadata
    FROM public.restaurants rest
    WHERE COALESCE(rest.is_active, true) = true
      AND lower(COALESCE(rest.status, 'active')) IN ('active', 'published')
      AND (
        NULLIF(trim(COALESCE(rest.image_url, '')), '') IS NULL
        OR NULLIF(trim(COALESCE(rest.cuisine_type, '')), '') IS NULL
        OR NULLIF(trim(COALESCE(rest.address, '')), '') IS NULL
        OR NULLIF(trim(COALESCE(rest.city, '')), '') IS NULL
        OR rest.latitude IS NULL
        OR rest.longitude IS NULL
      )

    UNION ALL

    SELECT
      concat('campaign:paid-inactive:', ac.id)::text AS alert_key,
      'high'::text AS severity,
      'campagnes'::text AS source,
      'Campagne payée inactive'::text AS title,
      format('Campagne "%s" payée mais au statut %s.', ac.title, COALESCE(ac.status, 'inconnu'))::text AS description,
      'ad_campaign'::text AS entity_type,
      ac.id::text AS entity_id,
      concat('/admin/actualites?campaign=', ac.id)::text AS action_url,
      'Activer la campagne ou contacter le restaurateur avant facturation définitive.'::text AS recommended_action,
      COALESCE(ac.updated_at, ac.paid_at, ac.created_at) AS last_seen_at,
      jsonb_build_object(
        'campaign_id', ac.id,
        'restaurant_id', ac.restaurant_id,
        'status', ac.status,
        'payment_status', ac.payment_status,
        'paid_amount', ac.paid_amount,
        'stripe_checkout_session_id', ac.stripe_checkout_session_id
      ) AS metadata
    FROM public.ad_campaigns ac
    WHERE ac.payment_status = 'paid'
      AND lower(COALESCE(ac.status, '')) <> 'active'

    UNION ALL

    SELECT
      concat('campaign:active-unpaid:', ac.id)::text AS alert_key,
      'critical'::text AS severity,
      'campagnes'::text AS source,
      'Campagne active non payée'::text AS title,
      format('Campagne "%s" active avec paiement %s.', ac.title, COALESCE(ac.payment_status, 'inconnu'))::text AS description,
      'ad_campaign'::text AS entity_type,
      ac.id::text AS entity_id,
      concat('/admin/actualites?campaign=', ac.id)::text AS action_url,
      'Suspendre la campagne ou régulariser le paiement côté Stripe.'::text AS recommended_action,
      COALESCE(ac.updated_at, ac.created_at) AS last_seen_at,
      jsonb_build_object(
        'campaign_id', ac.id,
        'restaurant_id', ac.restaurant_id,
        'status', ac.status,
        'payment_status', ac.payment_status,
        'total_budget', ac.total_budget,
        'stripe_checkout_session_id', ac.stripe_checkout_session_id
      ) AS metadata
    FROM public.ad_campaigns ac
    WHERE lower(COALESCE(ac.status, '')) = 'active'
      AND COALESCE(ac.total_budget, 0) > 0
      AND COALESCE(ac.payment_status, 'unpaid') <> 'paid'

    UNION ALL

    SELECT
      concat('support:incident:', si.id)::text AS alert_key,
      CASE WHEN si.priority = 'urgent' THEN 'critical' ELSE 'high' END::text AS severity,
      'support'::text AS source,
      concat('Incident support : ', si.subject)::text AS title,
      format('Incident %s au statut %s.', si.priority, si.status)::text AS description,
      'support_incident'::text AS entity_type,
      si.id::text AS entity_id,
      concat('/dashboard/support?incident=', si.id)::text AS action_url,
      'Répondre au client ou assigner un responsable avant dépassement SLA.'::text AS recommended_action,
      COALESCE(si.last_message_at, si.updated_at, si.created_at) AS last_seen_at,
      jsonb_build_object(
        'incident_id', si.id,
        'restaurant_id', si.restaurant_id,
        'order_id', si.order_id,
        'reservation_id', si.reservation_id,
        'priority', si.priority,
        'status', si.status,
        'category', si.category
      ) AS metadata
    FROM public.support_incidents si
    WHERE lower(COALESCE(si.status, '')) NOT IN ('resolved', 'closed')
      AND (
        si.priority IN ('high', 'urgent')
        OR lower(COALESCE(si.status, '')) = 'waiting_admin'
        OR COALESCE(si.last_message_at, si.updated_at, si.created_at) < now() - interval '12 hours'
      )

    UNION ALL

    SELECT
      concat('edge-function:failure:', e.function_name)::text AS alert_key,
      CASE WHEN count(*) >= 5 THEN 'critical' ELSE 'high' END::text AS severity,
      'edge-functions'::text AS source,
      concat('Edge Function en échec : ', e.function_name)::text AS title,
      format('%s échec(s) sur les dernières 24h. Dernière erreur : %s', count(*), left(COALESCE((array_agg(e.error_message ORDER BY e.created_at DESC))[1], 'Erreur non renseignée'), 180))::text AS description,
      'edge_function'::text AS entity_type,
      e.function_name::text AS entity_id,
      concat('/admin/audit?function=', e.function_name)::text AS action_url,
      'Consulter les logs Edge Function et relancer le flux après correction.'::text AS recommended_action,
      max(e.created_at) AS last_seen_at,
      jsonb_build_object(
        'function_name', e.function_name,
        'failures_24h', count(*),
        'last_error', (array_agg(e.error_message ORDER BY e.created_at DESC))[1],
        'target_entity_type', (array_agg(e.target_entity_type ORDER BY e.created_at DESC))[1],
        'target_entity_id', (array_agg(e.target_entity_id ORDER BY e.created_at DESC))[1]
      ) AS metadata
    FROM public.edge_function_audit_logs e
    WHERE e.status = 'failure'
      AND e.created_at >= now() - interval '24 hours'
    GROUP BY e.function_name

    UNION ALL

    SELECT
      concat('payment:orphan-charge:', pt.id)::text AS alert_key,
      'critical'::text AS severity,
      'paiements'::text AS source,
      'Paiement capturé sans commande'::text AS title,
      format('Transaction Stripe %s capturée sans commande liée.', COALESCE(pt.stripe_checkout_session_id, pt.stripe_payment_intent_id, left(pt.id::text, 8)))::text AS description,
      'payment_transaction'::text AS entity_type,
      pt.id::text AS entity_id,
      concat('/admin/compta/entrees?payment=', pt.id)::text AS action_url,
      'Réconcilier la transaction avec Stripe ou créer un remboursement manuel.'::text AS recommended_action,
      pt.created_at AS last_seen_at,
      jsonb_build_object(
        'payment_transaction_id', pt.id,
        'user_id', pt.user_id,
        'amount', pt.amount,
        'currency', pt.currency,
        'type', pt.type,
        'status', pt.status,
        'stripe_checkout_session_id', pt.stripe_checkout_session_id,
        'stripe_payment_intent_id', pt.stripe_payment_intent_id,
        'metadata', pt.metadata
      ) AS metadata
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status = 'succeeded'
      AND pt.order_id IS NULL
      AND COALESCE(pt.metadata ->> 'checkout_kind', 'order') NOT IN ('campaign', 'tok-one', 'launch-pack')
      AND COALESCE(pt.metadata ->> 'feature', '') NOT IN ('zero-attente')
      AND pt.created_at >= now() - interval '90 days'

    UNION ALL

    SELECT
      concat('payment:failed:', pt.id)::text AS alert_key,
      'high'::text AS severity,
      'paiements'::text AS source,
      'Paiement échoué récent'::text AS title,
      format('Transaction %s au statut %s pour CHF %s.', left(pt.id::text, 8), pt.status, pt.amount)::text AS description,
      'payment_transaction'::text AS entity_type,
      pt.id::text AS entity_id,
      concat('/admin/compta/entrees?payment=', pt.id)::text AS action_url,
      'Identifier le checkout concerné et prévenir le client si une commande est bloquée.'::text AS recommended_action,
      pt.created_at AS last_seen_at,
      jsonb_build_object(
        'payment_transaction_id', pt.id,
        'order_id', pt.order_id,
        'user_id', pt.user_id,
        'amount', pt.amount,
        'currency', pt.currency,
        'type', pt.type,
        'status', pt.status,
        'stripe_checkout_session_id', pt.stripe_checkout_session_id,
        'stripe_payment_intent_id', pt.stripe_payment_intent_id,
        'metadata', pt.metadata
      ) AS metadata
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status IN ('failed', 'cancelled')
      AND pt.created_at >= now() - interval '24 hours'
  )
  SELECT
    d.alert_key,
    d.severity,
    COALESCE(s.status, 'new') AS status,
    d.source,
    d.title,
    d.description,
    d.entity_type,
    d.entity_id,
    d.action_url,
    d.recommended_action,
    d.last_seen_at,
    jsonb_strip_nulls(
      COALESCE(d.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'admin_note', s.note,
        'handled_by', s.handled_by,
        'handled_at', s.handled_at,
        'state_updated_at', s.updated_at
      )
    ) AS metadata
  FROM dynamic_alerts d
  LEFT JOIN public.marketplace_alert_states s ON s.alert_key = d.alert_key
  WHERE COALESCE(p_include_resolved, false)
    OR COALESCE(s.status, 'new') NOT IN ('resolved', 'ignored')
  ORDER BY
    CASE d.severity
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    d.last_seen_at DESC,
    d.alert_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_marketplace_alert(
  p_alert_key text,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_alert_key text := NULLIF(trim(COALESCE(p_alert_key, '')), '');
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_previous_status text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF v_alert_key IS NULL THEN
    RAISE EXCEPTION 'Alert key is required.' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('new', 'in_progress', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Unsupported alert status: %', p_status USING ERRCODE = '22023';
  END IF;

  IF v_status IN ('resolved', 'ignored') AND v_note IS NULL THEN
    RAISE EXCEPTION 'Admin note is required to resolve or ignore an alert.' USING ERRCODE = '22023';
  END IF;

  SELECT mas.status
  INTO v_previous_status
  FROM public.marketplace_alert_states mas
  WHERE mas.alert_key = v_alert_key
  FOR UPDATE;

  INSERT INTO public.marketplace_alert_states (
    alert_key,
    status,
    note,
    handled_by,
    handled_at,
    updated_at
  )
  VALUES (
    v_alert_key,
    v_status,
    v_note,
    v_actor_id,
    now(),
    now()
  )
  ON CONFLICT (alert_key) DO UPDATE
  SET status = EXCLUDED.status,
      note = EXCLUDED.note,
      handled_by = EXCLUDED.handled_by,
      handled_at = EXCLUDED.handled_at,
      updated_at = now();

  INSERT INTO public.marketplace_alert_state_history (
    alert_key,
    previous_status,
    next_status,
    note,
    admin_user_id,
    metadata
  )
  VALUES (
    v_alert_key,
    v_previous_status,
    v_status,
    v_note,
    v_actor_id,
    jsonb_build_object('auth_role', auth.role())
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_update_marketplace_alert',
    'marketplace_alert',
    NULL,
    jsonb_build_object('alert_key', v_alert_key, 'status', v_previous_status),
    jsonb_build_object('alert_key', v_alert_key, 'status', v_status, 'note', v_note)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_marketplace_alerts(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_marketplace_alerts(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_marketplace_alerts(boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
