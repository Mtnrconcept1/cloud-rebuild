CREATE TABLE IF NOT EXISTS public.ai_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  support_incident_id uuid REFERENCES public.support_incidents(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'ai-client-support',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT ai_support_tickets_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT ai_support_tickets_status_check CHECK (status IN ('open', 'waiting_restaurant', 'waiting_tok', 'resolved', 'escalated'))
);

CREATE TABLE IF NOT EXISTS public.ai_restaurant_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  task_type text NOT NULL,
  feature_name text NOT NULL DEFAULT 'ai_sales_insights',
  title text NOT NULL,
  prompt text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  model text,
  estimated_cost_chf numeric(12, 6),
  source text NOT NULL DEFAULT 'ai-restaurant-agent',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_restaurant_tasks_status_check CHECK (status IN ('draft', 'generated', 'applied', 'failed', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.ai_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  model text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT ai_admin_events_severity_check CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  CONSTRAINT ai_admin_events_status_check CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed'))
);

CREATE TABLE IF NOT EXISTS public.ai_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  signal text NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT ai_security_events_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ai_security_events_status_check CHECK (status IN ('open', 'reviewing', 'resolved', 'false_positive')),
  CONSTRAINT ai_security_events_risk_score_check CHECK (risk_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS public.ai_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  scope text NOT NULL DEFAULT 'platform',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  function_name text,
  health_score integer NOT NULL DEFAULT 100,
  average_response_ms integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  escalation_rate numeric(5, 2) NOT NULL DEFAULT 0,
  estimated_cost_chf numeric(12, 4) NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_performance_snapshots_scope_check CHECK (scope IN ('platform', 'restaurant', 'function')),
  CONSTRAINT ai_performance_snapshots_health_score_check CHECK (health_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS public.ai_accounting_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary text NOT NULL,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  forecast jsonb NOT NULL DEFAULT '{}'::jsonb,
  margin_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  source text NOT NULL DEFAULT 'ai-accounting-agent',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_accounting_insights_period_check CHECK (period_end >= period_start)
);

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS feature_name text,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.ai_restaurant_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS ai_support_tickets_user_created_idx
  ON public.ai_support_tickets(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_support_tickets_restaurant_status_idx
  ON public.ai_support_tickets(restaurant_id, status, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_restaurant_tasks_restaurant_created_idx
  ON public.ai_restaurant_tasks(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_restaurant_tasks_feature_idx
  ON public.ai_restaurant_tasks(feature_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_admin_events_severity_created_idx
  ON public.ai_admin_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_security_events_status_created_idx
  ON public.ai_security_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_performance_snapshots_scope_date_idx
  ON public.ai_performance_snapshots(scope, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS ai_accounting_insights_period_idx
  ON public.ai_accounting_insights(period_start DESC, period_end DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_restaurant_feature_created_idx
  ON public.ai_usage_logs(restaurant_id, feature_name, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

ALTER TABLE public.ai_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_restaurant_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_accounting_insights ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS touch_ai_support_tickets_updated_at ON public.ai_support_tickets;
CREATE TRIGGER touch_ai_support_tickets_updated_at
BEFORE UPDATE ON public.ai_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP TRIGGER IF EXISTS touch_ai_restaurant_tasks_updated_at ON public.ai_restaurant_tasks;
CREATE TRIGGER touch_ai_restaurant_tasks_updated_at
BEFORE UPDATE ON public.ai_restaurant_tasks
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP POLICY IF EXISTS "ai_support_tickets_select_related" ON public.ai_support_tickets;
CREATE POLICY "ai_support_tickets_select_related"
  ON public.ai_support_tickets
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_support_tickets_insert_related" ON public.ai_support_tickets;
CREATE POLICY "ai_support_tickets_insert_related"
  ON public.ai_support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_support_tickets_admin_update" ON public.ai_support_tickets;
CREATE POLICY "ai_support_tickets_admin_update"
  ON public.ai_support_tickets
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.auth_owns_restaurant(restaurant_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.auth_owns_restaurant(restaurant_id));

DROP POLICY IF EXISTS "ai_restaurant_tasks_owner_admin" ON public.ai_restaurant_tasks;
CREATE POLICY "ai_restaurant_tasks_owner_admin"
  ON public.ai_restaurant_tasks
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_admin_events_admin_select" ON public.ai_admin_events;
CREATE POLICY "ai_admin_events_admin_select"
  ON public.ai_admin_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_admin_events_admin_all" ON public.ai_admin_events;
CREATE POLICY "ai_admin_events_admin_all"
  ON public.ai_admin_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_security_events_admin_select" ON public.ai_security_events;
CREATE POLICY "ai_security_events_admin_select"
  ON public.ai_security_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_security_events_admin_all" ON public.ai_security_events;
CREATE POLICY "ai_security_events_admin_all"
  ON public.ai_security_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_performance_snapshots_admin_restaurant_select" ON public.ai_performance_snapshots;
CREATE POLICY "ai_performance_snapshots_admin_restaurant_select"
  ON public.ai_performance_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_performance_snapshots_admin_all" ON public.ai_performance_snapshots;
CREATE POLICY "ai_performance_snapshots_admin_all"
  ON public.ai_performance_snapshots
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_accounting_insights_admin_restaurant_select" ON public.ai_accounting_insights;
CREATE POLICY "ai_accounting_insights_admin_restaurant_select"
  ON public.ai_accounting_insights
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_accounting_insights_admin_all" ON public.ai_accounting_insights;
CREATE POLICY "ai_accounting_insights_admin_all"
  ON public.ai_accounting_insights
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.ai_support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_restaurant_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_admin_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_security_events TO authenticated;
GRANT SELECT, INSERT ON public.ai_performance_snapshots TO authenticated;
GRANT SELECT, INSERT ON public.ai_accounting_insights TO authenticated;

CREATE OR REPLACE FUNCTION public.check_restaurant_ai_quota(
  p_restaurant_id uuid,
  p_feature text,
  p_units integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text := 'starter';
  v_limit integer := 0;
  v_used integer := 0;
  v_allowed boolean := false;
  v_feature text := coalesce(nullif(trim(p_feature), ''), 'ai_sales_insights');
BEGIN
  IF p_restaurant_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'feature', v_feature,
      'plan', v_plan,
      'limit', 0,
      'used', 0,
      'remaining', 0,
      'reason', 'restaurant_required'
    );
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT
    plan,
    CASE
      WHEN v_feature = 'ai_support_chat' THEN monthly_conversation_limit
      WHEN v_feature = 'ai_photo_enhancer' THEN monthly_image_limit
      WHEN v_feature = 'ai_premium_image_generation' THEN monthly_premium_image_limit
      WHEN v_feature IN ('ai_menu_optimizer', 'ai_marketing_campaigns', 'ai_sales_insights', 'ai_accounting_insights') THEN monthly_text_tool_limit
      WHEN v_feature = 'ai_admin_monitoring' THEN greatest(monthly_text_tool_limit, 100)
      ELSE monthly_text_tool_limit
    END
  INTO v_plan, v_limit
  FROM public.restaurant_ai_subscriptions
  WHERE restaurant_id = p_restaurant_id
    AND status IN ('trialing', 'active')
    AND current_period_start <= now()
    AND current_period_end > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_limit IS NULL THEN
    v_plan := 'starter';
    v_limit := CASE
      WHEN v_feature = 'ai_support_chat' THEN 50
      WHEN v_feature = 'ai_photo_enhancer' THEN 0
      WHEN v_feature = 'ai_premium_image_generation' THEN 0
      ELSE 20
    END;
  END IF;

  SELECT count(*)::integer
  INTO v_used
  FROM public.ai_usage_logs
  WHERE restaurant_id = p_restaurant_id
    AND status = 'success'
    AND created_at >= date_trunc('month', now())
    AND coalesce(feature_name, metadata->>'feature', action) = v_feature;

  v_allowed := v_limit < 0 OR (v_used + greatest(coalesce(p_units, 1), 1)) <= v_limit;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'feature', v_feature,
    'plan', v_plan,
    'limit', v_limit,
    'used', v_used,
    'remaining', CASE WHEN v_limit < 0 THEN -1 ELSE greatest(v_limit - v_used, 0) END,
    'reason', CASE WHEN v_allowed THEN null ELSE 'quota_exceeded' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_ai_usage(
  p_restaurant_id uuid,
  p_since timestamptz DEFAULT date_trunc('month', now())
)
RETURNS TABLE (
  feature_name text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_chf numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(ul.feature_name, ul.metadata->>'feature', ul.action, 'unknown') AS feature_name,
    count(*) AS calls,
    coalesce(sum(ul.input_tokens), 0)::bigint AS input_tokens,
    coalesce(sum(ul.output_tokens), 0)::bigint AS output_tokens,
    coalesce(sum(ul.total_tokens), 0)::bigint AS total_tokens,
    coalesce(sum(ul.estimated_cost_chf), 0)::numeric AS estimated_cost_chf
  FROM public.ai_usage_logs ul
  WHERE ul.restaurant_id = p_restaurant_id
    AND ul.created_at >= p_since
    AND (
      auth.role() = 'service_role'
      OR public.has_role(auth.uid(), 'admin')
      OR public.auth_owns_restaurant(ul.restaurant_id)
    )
  GROUP BY coalesce(ul.feature_name, ul.metadata->>'feature', ul.action, 'unknown')
  ORDER BY calls DESC, feature_name ASC;
$$;

REVOKE ALL ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_restaurant_ai_usage(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_restaurant_ai_quota(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_ai_usage(uuid, timestamptz) TO authenticated, service_role;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('ai_support_chat', 'IA support client', 'Active le chat support IA client avec escalade humaine et tickets audites.', true),
  ('ai_menu_optimizer', 'IA optimisation menu', 'Active les recommandations de descriptions, prix, photos et structuration du menu.', true),
  ('ai_marketing_campaigns', 'IA campagnes marketing', 'Active les brouillons de campagnes et contenus promotionnels restaurateur.', true),
  ('ai_photo_enhancer', 'IA photos incluses', 'Active les briefs et ameliorations visuelles economiques incluses dans les quotas.', true),
  ('ai_sales_insights', 'IA analyse des ventes', 'Active l agent IA restaurateur et ses analyses de ventes.', true),
  ('ai_accounting_insights', 'IA comptabilite admin', 'Active les syntheses comptables, anomalies, previsions et cout IA.', true),
  ('ai_admin_monitoring', 'IA monitoring admin', 'Active le monitoring IA securite, performance, couts et incidents.', true),
  ('ai_premium_image_generation', 'IA image premium', 'Active la generation image premium reservee aux abonnements superieurs.', false)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
