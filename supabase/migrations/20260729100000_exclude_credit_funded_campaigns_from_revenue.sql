-- Sort les campagnes financees par des credits TOK du chiffre d'affaires.
--
-- Une campagne reglee en credits porte payment_status = 'paid', comme une
-- campagne reglee par carte. Le total mensuel officiel ne regardait que ce
-- statut : il comptait donc en recette un montant qui n'a fait entrer aucun
-- argent au moment de la campagne.
--
-- Les credits sont payes en amont, par l'abonnement ou par un pack de
-- recharge, et cet encaissement-la est deja compte. Les recompter a la
-- depense gonfle le chiffre d'affaires du montant exact des campagnes
-- financees en credits. En base aujourd'hui, la totalite des campagnes payees
-- l'est en credits : la ligne « campagnes » du mois est donc integralement
-- fictive.
--
-- Le montant n'est pas supprime mais deplace : il reste expose sous
-- credit_funded_amount, qui mesure la consommation de credits — une donnee
-- utile au pilotage, mais qui n'est pas une recette.
--
-- Migration additive : seule la fonction de calcul change, aucune table,
-- aucune donnee, aucune facture.

CREATE OR REPLACE FUNCTION public.build_accounting_month_official_totals(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := public.accounting_month_start(p_month);
  v_next_month date := (public.accounting_month_start(p_month) + interval '1 month')::date;
  v_totals jsonb;
BEGIN
  SELECT jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'gross_amount', COALESCE(sum(o.total_amount), 0), 'refunded_amount', COALESCE(sum(COALESCE(o.refunded_amount_chf, 0)), 0))
      FROM public.orders o
      WHERE o.created_at >= v_month::timestamptz
        AND o.created_at < v_next_month::timestamptz
        AND COALESCE(o.payment_status, '') IN ('paid', 'captured')
        AND COALESCE(o.status, '') NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
    ), '{}'::jsonb),
    'reservations', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'gross_amount', COALESCE(sum(r.total_amount), 0), 'reservation_fees', COALESCE(sum(r.billing_fee_chf), 0), 'refunded_amount', COALESCE(sum(COALESCE(r.refunded_amount_chf, 0)), 0))
      FROM public.reservations r
      WHERE r.created_at >= v_month::timestamptz
        AND r.created_at < v_next_month::timestamptz
        AND COALESCE(r.status, '') NOT IN ('cancelled', 'no_show', 'pending')
    ), '{}'::jsonb),
    -- count et paid_amount ne retiennent que l'argent reellement encaisse au
    -- titre de la campagne. La consommation de credits est reportee a part.
    'campaigns', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*) FILTER (WHERE COALESCE(ac.payment_method, '') <> 'credits'),
        'paid_amount', COALESCE(sum(COALESCE(ac.paid_amount, ac.total_budget, 0)) FILTER (WHERE COALESCE(ac.payment_method, '') <> 'credits'), 0),
        'credit_funded_count', count(*) FILTER (WHERE COALESCE(ac.payment_method, '') = 'credits'),
        'credit_funded_amount', COALESCE(sum(COALESCE(ac.paid_amount, ac.total_budget, 0)) FILTER (WHERE COALESCE(ac.payment_method, '') = 'credits'), 0)
      )
      FROM public.ad_campaigns ac
      WHERE ac.created_at >= v_month::timestamptz
        AND ac.created_at < v_next_month::timestamptz
        AND COALESCE(ac.payment_status, '') = 'paid'
    ), '{}'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'amount_ttc', COALESCE(sum(ri.amount_ttc), 0), 'paid_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') = 'paid'), 0), 'open_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') <> 'paid'), 0))
      FROM public.restaurant_invoices ri
      WHERE ri.period_start >= v_month
        AND ri.period_start < v_next_month
    ), '{}'::jsonb),
    'stripe', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(pt.amount), 0), 'succeeded_amount', COALESCE(sum(pt.amount) FILTER (WHERE COALESCE(pt.status, '') IN ('paid', 'succeeded', 'captured')), 0), 'failed_count', count(*) FILTER (WHERE COALESCE(pt.status, '') IN ('failed', 'canceled', 'cancelled')))
      FROM public.payment_transactions pt
      WHERE pt.created_at >= v_month::timestamptz
        AND pt.created_at < v_next_month::timestamptz
    ), '{}'::jsonb)
  ) INTO v_totals;
  RETURN v_totals;
END;
$function$;

NOTIFY pgrst, 'reload schema';
