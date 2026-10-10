BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Fail on inconsistent history; do not pick winners or delete past deliveries.
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_jobs_one_active_order
  ON public.dispatch_jobs(order_id)
  WHERE status NOT IN ('delivered','cancelled','expired');
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_jobs_one_active_courier
  ON public.dispatch_jobs(courier_id)
  WHERE courier_id IS NOT NULL
    AND status IN ('assigned','accepted','arriving_pickup','picked_up','arriving_dropoff');
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_attempts_one_accepted_job
  ON public.dispatch_attempts(dispatch_job_id) WHERE status = 'accepted';

-- All browser writes already go through authenticated Edge endpoints. Preserve
-- their SELECT policies, including tenant/demo restrictions and realtime reads.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.dispatch_jobs, public.dispatch_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_courier_dispatch_job(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_job public.dispatch_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  -- Order first, then job, courier, attempt throughout the response protocol.
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_order_not_found' USING ERRCODE='P0002'; END IF;
  IF v_order.status::text IN ('cancelled','refunded','delivered') THEN
    RAISE EXCEPTION 'dispatch_order_closed' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_job FROM public.dispatch_jobs WHERE order_id=p_order_id
    AND status NOT IN ('delivered','cancelled','expired') FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.dispatch_jobs(order_id,status) VALUES(p_order_id,'searching') RETURNING * INTO v_job;
  END IF;
  RETURN to_jsonb(v_job);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_courier_dispatch_search_state(
  p_job_id uuid, p_status text, p_reason text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job public.dispatch_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('searching','no_courier') THEN
    RAISE EXCEPTION 'invalid_dispatch_search_state' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_job FROM public.dispatch_jobs WHERE id=p_job_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_job.courier_id IS NOT NULL OR v_job.status NOT IN ('pending','searching','no_courier') THEN
    RETURN false;
  END IF;
  IF p_status='no_courier' AND EXISTS (
    SELECT 1 FROM public.dispatch_attempts WHERE dispatch_job_id=p_job_id AND status='pending'
  ) THEN RETURN false; END IF;
  UPDATE public.dispatch_jobs SET status=p_status, cancel_reason=left(p_reason,240), updated_at=clock_timestamp()
    WHERE id=p_job_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.offer_courier_dispatch_attempts(p_job_id uuid, p_offers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.dispatch_jobs%ROWTYPE;
  v_offer jsonb;
  v_attempt public.dispatch_attempts%ROWTYPE;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_offers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_offers)>10 THEN
    RAISE EXCEPTION 'invalid_dispatch_offers' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_job FROM public.dispatch_jobs WHERE id=p_job_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_job.courier_id IS NOT NULL OR v_job.status NOT IN ('pending','searching','no_courier') THEN
    RETURN v_result;
  END IF;
  -- Serializes overlapping dispatch invocations, including different fanouts.
  IF EXISTS (SELECT 1 FROM public.dispatch_attempts WHERE dispatch_job_id=p_job_id AND status='pending') THEN
    RETURN v_result;
  END IF;
  FOR v_offer IN SELECT value FROM jsonb_array_elements(p_offers) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.couriers WHERE id=(v_offer->>'courier_id')::uuid AND status='approved')
      OR EXISTS (SELECT 1 FROM public.dispatch_attempts WHERE dispatch_job_id=p_job_id AND courier_id=(v_offer->>'courier_id')::uuid)
    THEN CONTINUE; END IF;
    IF (v_offer->>'timeout_seconds')::integer NOT BETWEEN 1 AND 3600
      OR (v_offer->>'estimated_earnings')::numeric < 0
      OR v_offer->>'timeout_seconds' IS NULL OR v_offer->>'estimated_earnings' IS NULL THEN
      RAISE EXCEPTION 'invalid_dispatch_offer_values' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.dispatch_attempts(dispatch_job_id,courier_id,timeout_seconds,distance_to_pickup_meters,estimated_earnings)
      VALUES(p_job_id,(v_offer->>'courier_id')::uuid,(v_offer->>'timeout_seconds')::integer,
        greatest(0,(v_offer->>'distance_to_pickup_meters')::integer),(v_offer->>'estimated_earnings')::numeric)
      RETURNING * INTO v_attempt;
    v_result := v_result || jsonb_build_array(to_jsonb(v_attempt));
  END LOOP;
  IF jsonb_array_length(v_result)>0 THEN
    UPDATE public.dispatch_jobs SET status='searching',cancel_reason=NULL,updated_at=clock_timestamp() WHERE id=p_job_id;
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_courier_dispatch_attempt(
  p_attempt_id uuid, p_actor_user_id uuid, p_decision text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt public.dispatch_attempts%ROWTYPE;
  v_job public.dispatch_jobs%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_courier public.couriers%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_order_id uuid;
  v_now timestamptz;
  v_arrival timestamptz;
  v_name text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accept','decline') THEN
    RAISE EXCEPTION 'invalid_dispatch_decision' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','attempt_not_found','http_status',404); END IF;
  SELECT order_id INTO v_order_id FROM public.dispatch_jobs WHERE id=v_attempt.dispatch_job_id;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','order_not_found','http_status',404); END IF;
  SELECT * INTO v_job FROM public.dispatch_jobs WHERE id=v_attempt.dispatch_job_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','attempt_not_found','http_status',404); END IF;
  SELECT * INTO v_courier FROM public.couriers WHERE id=v_attempt.courier_id FOR NO KEY UPDATE;
  IF NOT FOUND OR v_courier.user_id IS DISTINCT FROM p_actor_user_id THEN
    RETURN jsonb_build_object('error','attempt_not_found','http_status',404);
  END IF;
  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id
    OR v_attempt.courier_id IS DISTINCT FROM v_courier.id THEN
    RETURN jsonb_build_object('error','attempt_not_found','http_status',404);
  END IF;
  v_now := clock_timestamp(); -- Evaluate expiry AFTER waiting for contenders.
  IF (p_decision='accept' AND v_attempt.status='accepted' AND v_job.courier_id=v_courier.id)
    OR (p_decision='decline' AND v_attempt.status='declined') THEN
    RETURN jsonb_build_object('status',v_attempt.status,'changed',false,'dispatch_job',to_jsonb(v_job),
      'order_id',v_order.id,'redispatch',p_decision='decline' AND v_job.courier_id IS NULL
        AND v_job.status IN ('pending','searching','no_courier') AND NOT EXISTS (
          SELECT 1 FROM public.dispatch_attempts WHERE dispatch_job_id=v_job.id AND status='pending'));
  END IF;
  IF v_attempt.status<>'pending' OR v_job.courier_id IS NOT NULL
    OR v_job.status NOT IN ('pending','searching','no_courier')
    OR v_order.status::text IN ('cancelled','refunded','delivered') THEN
    RETURN jsonb_build_object('error','attempt_already_processed','http_status',409);
  END IF;
  IF v_attempt.offered_at + make_interval(secs=>greatest(1,coalesce(v_attempt.timeout_seconds,45))) <= v_now THEN
    RETURN jsonb_build_object('error','attempt_expired','http_status',409);
  END IF;
  IF p_decision='decline' THEN
    UPDATE public.dispatch_attempts SET status='declined',responded_at=v_now WHERE id=p_attempt_id;
    RETURN jsonb_build_object('status','declined','changed',true,'dispatch_job',to_jsonb(v_job),'order_id',v_order.id,
      'redispatch',NOT EXISTS (SELECT 1 FROM public.dispatch_attempts WHERE dispatch_job_id=v_job.id AND status='pending'));
  END IF;
  IF v_courier.status<>'approved' THEN RETURN jsonb_build_object('error','courier_not_approved','http_status',403); END IF;
  IF EXISTS (SELECT 1 FROM public.dispatch_jobs WHERE courier_id=v_courier.id AND id<>v_job.id
    AND status IN ('assigned','accepted','arriving_pickup','picked_up','arriving_dropoff')) THEN
    RETURN jsonb_build_object('error','courier_already_busy','http_status',409);
  END IF;
  SELECT * INTO v_restaurant FROM public.restaurants WHERE id=v_order.restaurant_id;
  v_arrival := coalesce(v_order.estimated_delivery_at,v_now + make_interval(mins=>coalesce(nullif(v_restaurant.avg_prep_time_min,0),20)+15));
  v_name := coalesce(nullif(btrim(concat_ws(' ',nullif(btrim(v_courier.first_name),''),nullif(btrim(v_courier.last_name),''))),''),'Livreur Tok');
  UPDATE public.dispatch_attempts SET status='accepted',responded_at=v_now WHERE id=p_attempt_id;
  UPDATE public.dispatch_attempts SET status='cancelled',responded_at=v_now
    WHERE dispatch_job_id=v_job.id AND status='pending' AND id<>p_attempt_id;
  UPDATE public.dispatch_jobs SET courier_id=v_courier.id,status='accepted',assigned_at=coalesce(assigned_at,v_now),
    accepted_at=v_now,earnings_base=coalesce(nullif(earnings_base,0),v_attempt.estimated_earnings,0),updated_at=v_now
    WHERE id=v_job.id RETURNING * INTO v_job;
  UPDATE public.orders SET courier_id=v_courier.id,estimated_delivery_at=v_arrival WHERE id=v_order.id;
  INSERT INTO public.delivery_tracking(order_id,status,driver_name,driver_phone,current_lat,current_lng,estimated_arrival)
    VALUES(v_order.id,'preparing',v_name,v_courier.phone,v_courier.current_lat,v_courier.current_lng,v_arrival)
    ON CONFLICT(order_id) DO UPDATE SET status=EXCLUDED.status,driver_name=EXCLUDED.driver_name,
      driver_phone=EXCLUDED.driver_phone,current_lat=EXCLUDED.current_lat,current_lng=EXCLUDED.current_lng,
      estimated_arrival=EXCLUDED.estimated_arrival;
  -- Enqueue in the same transaction; existing delivery workers handle retries.
  IF v_order.user_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(v_order.user_id,'Livreur assigne',
      v_name||' prend en charge votre commande '||coalesce(v_order.order_number,v_order.id::text)||'.',
      'dispatch','transactional',json_build_object('order_id',v_order.id,'dispatch_job_id',v_job.id,'courier_id',v_courier.id,'url','/commandes'));
  END IF;
  IF v_restaurant.owner_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(v_restaurant.owner_id,'Livreur confirme',
      v_name||' se dirige vers '||coalesce(v_restaurant.name,'le restaurant')||'.',
      'dispatch','transactional',json_build_object('order_id',v_order.id,'dispatch_job_id',v_job.id,'courier_id',v_courier.id,'url','/dashboard/commandes'));
  END IF;
  RETURN jsonb_build_object('status','accepted','changed',true,'dispatch_job',to_jsonb(v_job),'order_id',v_order.id,'redispatch',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_courier_dispatch_attempt(p_attempt_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt public.dispatch_attempts%ROWTYPE;
  v_job public.dispatch_jobs%ROWTYPE;
  v_courier_id uuid;
  v_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_courier_id := v_attempt.courier_id;
  SELECT * INTO v_job FROM public.dispatch_jobs WHERE id=v_attempt.dispatch_job_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.couriers WHERE id=v_courier_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v_attempt FROM public.dispatch_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.dispatch_job_id IS DISTINCT FROM v_job.id
    OR v_attempt.courier_id IS DISTINCT FROM v_courier_id THEN RETURN false; END IF;
  v_now := clock_timestamp();
  IF v_attempt.status<>'pending' OR v_job.courier_id IS NOT NULL
    OR v_job.status NOT IN ('pending','searching','no_courier')
    OR v_attempt.offered_at + make_interval(secs=>greatest(1,coalesce(v_attempt.timeout_seconds,45))) > v_now THEN
    RETURN false;
  END IF;
  UPDATE public.dispatch_attempts SET status='expired',responded_at=v_now WHERE id=p_attempt_id;
  UPDATE public.couriers SET acceptance_rate=greatest(0,coalesce(acceptance_rate,100)-2),updated_at=v_now
    WHERE id=v_attempt.courier_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_courier_dispatch_job(uuid),
  public.set_courier_dispatch_search_state(uuid,text,text),public.offer_courier_dispatch_attempts(uuid,jsonb),
  public.respond_courier_dispatch_attempt(uuid,uuid,text),public.expire_courier_dispatch_attempt(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_courier_dispatch_job(uuid),
  public.set_courier_dispatch_search_state(uuid,text,text),public.offer_courier_dispatch_attempts(uuid,jsonb),
  public.respond_courier_dispatch_attempt(uuid,uuid,text),public.expire_courier_dispatch_attempt(uuid)
  TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
