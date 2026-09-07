-- TheTok Print operations: SAV reorders and durable scheduler hooks.

BEGIN;

CREATE TABLE IF NOT EXISTS public.print_reorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_order_id uuid NOT NULL REFERENCES public.print_orders(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  original_item_id uuid NOT NULL REFERENCES public.print_order_items(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'cloudprinter',
  provider_reference text NOT NULL UNIQUE,
  provider_order_id text,
  provider_item_id text,
  reorder_cause text NOT NULL,
  reorder_description text,
  status text NOT NULL DEFAULT 'requested',
  tracking_code text,
  tracking_url text,
  carrier text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  submitted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT print_reorders_cause_check CHECK (btrim(reorder_cause) <> ''),
  CONSTRAINT print_reorders_status_check CHECK (status IN (
    'requested', 'approved', 'submission_pending', 'submitted', 'producing',
    'produced', 'packed', 'shipped', 'delivered', 'failed', 'canceled', 'rejected'
  ))
);

CREATE INDEX IF NOT EXISTS idx_print_reorders_order_created ON public.print_reorders (print_order_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_reorders_restaurant_created ON public.print_reorders (restaurant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_reorders_status_updated ON public.print_reorders (status, updated_at DESC);

ALTER TABLE public.print_reorders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.print_reorders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.print_reorders TO authenticated;
GRANT ALL ON public.print_reorders TO service_role;

DROP POLICY IF EXISTS print_reorders_select ON public.print_reorders;
CREATE POLICY print_reorders_select ON public.print_reorders FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

CREATE OR REPLACE FUNCTION public.advance_print_reorder_state(
  p_reorder_id uuid,
  p_state text,
  p_provider_order_id text DEFAULT NULL,
  p_provider_item_id text DEFAULT NULL,
  p_tracking_code text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_carrier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.print_reorders%ROWTYPE;
  v_current_rank integer;
  v_next_rank integer;
BEGIN
  SELECT * INTO v_row FROM public.print_reorders WHERE id = p_reorder_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_reorder_not_found'; END IF;
  v_current_rank := CASE v_row.status
    WHEN 'requested' THEN 10 WHEN 'approved' THEN 20 WHEN 'submission_pending' THEN 30
    WHEN 'submitted' THEN 40 WHEN 'producing' THEN 50 WHEN 'produced' THEN 60
    WHEN 'packed' THEN 70 WHEN 'shipped' THEN 80 WHEN 'delivered' THEN 90
    WHEN 'failed' THEN 95 WHEN 'canceled' THEN 100 WHEN 'rejected' THEN 100 ELSE 0 END;
  v_next_rank := CASE p_state
    WHEN 'requested' THEN 10 WHEN 'approved' THEN 20 WHEN 'submission_pending' THEN 30
    WHEN 'submitted' THEN 40 WHEN 'producing' THEN 50 WHEN 'produced' THEN 60
    WHEN 'packed' THEN 70 WHEN 'shipped' THEN 80 WHEN 'delivered' THEN 90
    WHEN 'failed' THEN 95 WHEN 'canceled' THEN 100 WHEN 'rejected' THEN 100 ELSE 0 END;
  IF v_next_rank = 0 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_reorder_state'; END IF;
  UPDATE public.print_reorders
  SET status = CASE WHEN v_next_rank >= v_current_rank THEN p_state ELSE status END,
      provider_order_id = COALESCE(NULLIF(p_provider_order_id, ''), provider_order_id),
      provider_item_id = COALESCE(NULLIF(p_provider_item_id, ''), provider_item_id),
      tracking_code = COALESCE(NULLIF(p_tracking_code, ''), tracking_code),
      tracking_url = COALESCE(NULLIF(p_tracking_url, ''), tracking_url),
      carrier = COALESCE(NULLIF(p_carrier, ''), carrier),
      submitted_at = CASE WHEN p_state = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
      shipped_at = CASE WHEN p_state = 'shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
      delivered_at = CASE WHEN p_state = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      canceled_at = CASE WHEN p_state = 'canceled' THEN COALESCE(canceled_at, now()) ELSE canceled_at END,
      updated_at = now()
  WHERE id = p_reorder_id RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.advance_print_reorder_state(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_print_reorder_state(uuid, text, text, text, text, text, text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret' LIMIT 1;
  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE NOTICE 'TheTok Print cron not scheduled: Vault secret internal_cron_secret is absent.';
    RETURN;
  END IF;
  PERFORM cron.unschedule('thetok-print-orchestrator') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'thetok-print-orchestrator');
  PERFORM cron.schedule('thetok-print-orchestrator', '* * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret', %L), body := '{"limit":10}'::jsonb);
  $cron$, v_base || '/print-orchestrator', v_secret));
  PERFORM cron.unschedule('thetok-print-reconcile') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'thetok-print-reconcile');
  PERFORM cron.schedule('thetok-print-reconcile', '*/10 * * * *', format($cron$
    SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret', %L), body := '{"limit":20}'::jsonb);
  $cron$, v_base || '/print-reconcile', v_secret));
END
$$;

COMMIT;
