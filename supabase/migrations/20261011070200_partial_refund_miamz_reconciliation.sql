BEGIN;
-- Runs after the existing reward trigger. The order row serialises concurrent
-- refund updates; the adjustment is the difference from the durable ledger.
CREATE OR REPLACE FUNCTION public.reconcile_order_refund_miamz(p_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_base public.loyalty_transactions%ROWTYPE;
  v_net integer;
  v_expected integer;
  v_delta integer;
  v_donation boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO v_base FROM public.loyalty_transactions
  WHERE order_id = v_order.id AND transaction_type IN ('order_earned','donation')
  ORDER BY created_at,id LIMIT 1;
  IF NOT FOUND OR v_order.total_amount <= 0 THEN RETURN 0; END IF;
  v_donation := v_base.transaction_type = 'donation';
  SELECT COALESCE(sum(amount),0) INTO v_net FROM public.loyalty_transactions
  WHERE order_id = v_order.id AND transaction_type IN (
    'order_earned','donation','order_reward_reversal','donation_reversal',
    'order_reward_reinstated','donation_reinstated','order_reward_adjustment','donation_adjustment');
  IF lower(COALESCE(v_order.status,'')) IN ('cancelled','refunded','payment_failed','refused')
    OR lower(COALESCE(v_order.payment_status,'')) IN ('failed','refunded')
    OR lower(COALESCE(v_order.refund_status,'')) IN ('refunded','fully_refunded','full_refund') THEN
    v_expected := 0;
  ELSIF lower(COALESCE(v_order.payment_status,'')) IN ('paid','captured')
    AND (v_order.status IN ('delivered','completed') OR (v_order.status='picked_up'
      AND lower(COALESCE(NULLIF(v_order.type,''),v_order.metadata->>'type','')) IN ('pickup','takeaway','emporter','click_and_collect'))) THEN
    v_expected := floor(abs(v_base.amount) * GREATEST(0, LEAST(1,
      (v_order.total_amount - GREATEST(COALESCE(v_order.refunded_amount_chf,0),0)) / v_order.total_amount)));
  ELSE RETURN 0;
  END IF;
  v_delta := v_expected - v_net;
  IF v_delta = 0 THEN RETURN 0; END IF;
  INSERT INTO public.loyalty_transactions(user_id,order_id,amount,transaction_type,description,metadata)
  VALUES (v_base.user_id,v_order.id,v_delta,
    CASE WHEN v_donation THEN 'donation_adjustment' ELSE 'order_reward_adjustment' END,
    'Ajustement Miamz après remboursement',
    jsonb_build_object('base_reward_id',v_base.id,'refunded_amount_chf',v_order.refunded_amount_chf,
      'expected_points',v_expected,'previous_points',v_net));
  IF v_donation THEN
    INSERT INTO public.solidarity_donations(user_id,points_amount,meals_count)
    VALUES(v_base.user_id,v_delta,floor(v_expected::numeric/1000)-floor(v_net::numeric/1000));
  ELSE
    UPDATE public.profiles SET loyalty_points=COALESCE(loyalty_points,0)+v_delta
    WHERE user_id=v_base.user_id;
  END IF;
  RETURN v_delta;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_order_refund_miamz(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_order_refund_miamz(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.reconcile_refunded_order_miamz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.reconcile_order_refund_miamz(NEW.id);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_refunded_order_miamz() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_reconcile_refunded_order_miamz ON public.orders;
CREATE TRIGGER zz_reconcile_refunded_order_miamz
AFTER INSERT OR UPDATE OF status,payment_status,refund_status,refunded_amount_chf ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.reconcile_refunded_order_miamz();
CREATE INDEX IF NOT EXISTS loyalty_order_reward_reconciliation_idx
ON public.loyalty_transactions(order_id,transaction_type) WHERE order_id IS NOT NULL;
-- Explicit, bounded replay for historical refunds; not executed by this migration.
CREATE OR REPLACE FUNCTION public.reconcile_refunded_order_miamz_batch(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(order_id uuid,adjustment integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; d integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 FOR r IN SELECT o.id FROM public.orders o WHERE (p_after IS NULL OR o.id>p_after)
   AND (o.refunded_amount_chf>0 OR o.payment_status='refunded')
   ORDER BY o.id LIMIT GREATEST(1,LEAST(COALESCE(p_limit,50),100))
 LOOP
   d := public.reconcile_order_refund_miamz(r.id);
   IF d<>0 THEN INSERT INTO public.audit_log(action,entity_type,entity_id,new_data)
     VALUES('reconcile_historical_refund_miamz','order',r.id,jsonb_build_object('adjustment',d)); END IF;
   order_id:=r.id; adjustment:=d; RETURN NEXT;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_refunded_order_miamz_batch(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_refunded_order_miamz_batch(uuid,integer) TO service_role;
COMMIT;
