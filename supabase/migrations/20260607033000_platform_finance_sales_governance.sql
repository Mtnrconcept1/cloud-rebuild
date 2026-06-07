-- Phase 1 launch audit: platform finance, sales governance and anon SECURITY DEFINER hardening.

CREATE TABLE IF NOT EXISTS public.platform_revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_source text NOT NULL CHECK (revenue_source IN ('pack', 'subscription', 'table_fee', 'ai_photo', 'sponsorship', 'tok_one', 'reservation_fee', 'other')),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  amount_chf numeric(12,2) NOT NULL CHECK (amount_chf >= 0),
  currency text NOT NULL DEFAULT 'CHF',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  period_month date NOT NULL DEFAULT date_trunc('month', now())::date,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_source text NOT NULL CHECK (cost_source IN ('marketing', 'openai', 'stripe', 'vercel', 'supabase', 'commercial', 'support', 'admin_legal', 'tools', 'reserve', 'other')),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  amount_chf numeric(12,2) NOT NULL CHECK (amount_chf >= 0),
  currency text NOT NULL DEFAULT 'CHF',
  incurred_at timestamptz NOT NULL DEFAULT now(),
  period_month date NOT NULL DEFAULT date_trunc('month', now())::date,
  vendor text,
  invoice_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_budget_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE,
  revenue_chf numeric(12,2) NOT NULL DEFAULT 0 CHECK (revenue_chf >= 0),
  marketing_budget_ratio numeric(5,4) NOT NULL DEFAULT 0.6000 CHECK (marketing_budget_ratio >= 0 AND marketing_budget_ratio <= 0.6000),
  marketing_spent_chf numeric(12,2) NOT NULL DEFAULT 0 CHECK (marketing_spent_chf >= 0),
  reserve_ratio numeric(5,4) NOT NULL DEFAULT 0.0700 CHECK (reserve_ratio >= 0.0700),
  ai_budget_ratio numeric(5,4) NOT NULL DEFAULT 0.0400 CHECK (ai_budget_ratio >= 0 AND ai_budget_ratio <= 0.04),
  commercial_budget_ratio numeric(5,4) NOT NULL DEFAULT 0.1200 CHECK (commercial_budget_ratio >= 0 AND commercial_budget_ratio <= 0.12),
  locked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (marketing_spent_chf <= revenue_chf * marketing_budget_ratio)
);

CREATE TABLE IF NOT EXISTS public.sales_representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  full_name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'left')),
  zone text NOT NULL DEFAULT 'Genève',
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.0700 CHECK (commission_rate >= 0 AND commission_rate <= 0.12),
  monthly_restaurant_goal integer NOT NULL DEFAULT 10 CHECK (monthly_restaurant_goal >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL,
  city text NOT NULL DEFAULT 'Genève',
  contact_name text,
  phone text,
  email text,
  table_count integer CHECK (table_count IS NULL OR table_count >= 0),
  primary_need text,
  source text NOT NULL DEFAULT 'restaurateurs_geneve',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'demo', 'signed', 'activated', 'lost')),
  assigned_sales_rep_id uuid REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.restaurant_leads(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  sales_rep_id uuid REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  pack_name text NOT NULL,
  subscription_chf numeric(12,2) NOT NULL DEFAULT 0 CHECK (subscription_chf >= 0),
  amount_chf numeric(12,2) NOT NULL CHECK (amount_chf >= 0),
  currency text NOT NULL DEFAULT 'CHF',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'disputed', 'cancelled')),
  signed_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  stripe_payment_intent_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id uuid NOT NULL REFERENCES public.sales_representatives(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.restaurant_deals(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  commission_type text NOT NULL CHECK (commission_type IN ('pack_paid', 'menu_published', 'first_10_tables', 'thirty_tables_60_days', 'sixty_tables_90_days', 'active_after_90_days', 'tier_bonus', 'refund_adjustment')),
  base_amount_chf numeric(12,2) NOT NULL DEFAULT 0 CHECK (base_amount_chf >= 0),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 0.12),
  amount_chf numeric(12,2) NOT NULL CHECK (amount_chf >= 0),
  source_status text NOT NULL DEFAULT 'paid' CHECK (source_status IN ('paid', 'refunded', 'disputed', 'cancelled')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'payable', 'paid', 'cancelled')),
  payable_on date,
  paid_at timestamptz,
  refund_adjusted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_status = 'paid' AND amount_chf >= 0) OR status IN ('cancelled', 'paid'))
);

CREATE TABLE IF NOT EXISTS public.restaurant_activation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.restaurant_deals(id) ON DELETE SET NULL,
  menu_published_at timestamptz,
  first_10_tables_at timestamptz,
  thirty_tables_60_days_at timestamptz,
  sixty_tables_90_days_at timestamptz,
  active_after_90_days_at timestamptz,
  total_reserved_tables integer NOT NULL DEFAULT 0 CHECK (total_reserved_tables >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id uuid,
  feature text NOT NULL CHECK (feature IN ('photo_retouch', 'campaign', 'advisor', 'support', 'floorplan', 'other')),
  model text,
  quality text,
  input_units integer NOT NULL DEFAULT 0 CHECK (input_units >= 0),
  output_units integer NOT NULL DEFAULT 0 CHECK (output_units >= 0),
  estimated_cost_chf numeric(12,4) NOT NULL DEFAULT 0 CHECK (estimated_cost_chf >= 0),
  ai_budget_ratio numeric(5,4) NOT NULL DEFAULT 0.0400 CHECK (ai_budget_ratio >= 0 AND ai_budget_ratio <= 0.04),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('queued', 'recorded', 'failed', 'credited')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  period_month date NOT NULL DEFAULT date_trunc('month', now())::date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_activation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_costs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_platform_revenue_entries_period_source ON public.platform_revenue_entries(period_month, revenue_source);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_entries_restaurant_created ON public.platform_revenue_entries(restaurant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_cost_entries_period_source ON public.platform_cost_entries(period_month, cost_source);
CREATE INDEX IF NOT EXISTS idx_platform_cost_entries_restaurant_created ON public.platform_cost_entries(restaurant_id, incurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_budget_periods_period_month ON public.marketing_budget_periods(period_month);
CREATE INDEX IF NOT EXISTS idx_sales_representatives_status_zone ON public.sales_representatives(status, zone);
CREATE INDEX IF NOT EXISTS idx_restaurant_leads_status_created ON public.restaurant_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_leads_assigned_created ON public.restaurant_leads(assigned_sales_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_deals_status_paid ON public.restaurant_deals(status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_deals_sales_rep_created ON public.restaurant_deals(sales_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_commissions_rep_status ON public.commercial_commissions(sales_rep_id, status, payable_on);
CREATE INDEX IF NOT EXISTS idx_commercial_commissions_deal_type ON public.commercial_commissions(deal_id, commission_type);
CREATE INDEX IF NOT EXISTS idx_restaurant_activation_metrics_restaurant ON public.restaurant_activation_metrics(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_costs_period_feature ON public.ai_usage_costs(period_month, feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_costs_restaurant_created ON public.ai_usage_costs(restaurant_id, occurred_at DESC);

-- Launch audit indexes for existing high-traffic tables. Every index is guarded
-- by table and column checks because production may lag local migrations.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'restaurant_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_launch_restaurant_updated_at ON public.orders(restaurant_id, updated_at DESC)';
  END IF;

  IF to_regclass('public.reservations') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'restaurant_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'date'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'time'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'status'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reservations_launch_restaurant_slot_status ON public.reservations(restaurant_id, date, time, status)';
  END IF;

  IF to_regclass('public.ad_campaigns') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'restaurant_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'status'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'starts_at'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'ends_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ad_campaigns_launch_restaurant_status_window ON public.ad_campaigns(restaurant_id, status, starts_at, ends_at)';
  END IF;

  IF to_regclass('public.ad_campaigns') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'status'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'scheduled_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ad_campaigns_launch_status_scheduled ON public.ad_campaigns(status, scheduled_at DESC) WHERE scheduled_at IS NOT NULL';
  END IF;

  IF to_regclass('public.ad_campaign_events') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaign_events' AND column_name = 'user_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ad_campaign_events' AND column_name = 'occurred_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ad_campaign_events_launch_user_time ON public.ad_campaign_events(user_id, occurred_at DESC) WHERE user_id IS NOT NULL';
  END IF;

  IF to_regclass('public.ai_usage_logs') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'status'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_usage_logs' AND column_name = 'created_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_launch_status_created ON public.ai_usage_logs(status, created_at DESC)';
  END IF;

  IF to_regclass('public.ai_generated_assets') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_generated_assets' AND column_name = 'status'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_generated_assets' AND column_name = 'created_at'
    )
  THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_generated_assets_launch_status_created ON public.ai_generated_assets(status, created_at DESC)';
  END IF;
END
$$;

DO $$
DECLARE
  index_spec record;
BEGIN
  FOR index_spec IN
    SELECT * FROM (VALUES
      ('ad_campaign_events', 'user_id', 'idx_ad_campaign_events_user_id_fk'),
      ('ad_campaigns', 'restaurant_id', 'idx_ad_campaigns_restaurant_id_fk'),
      ('admin_dashboard_log_reset_history', 'actor_user_id', 'idx_admin_dashboard_log_reset_history_actor_user_id_fk'),
      ('admin_user_account_states', 'updated_by', 'idx_admin_user_account_states_updated_by_fk'),
      ('ai_accounting_insights', 'restaurant_id', 'idx_ai_accounting_insights_restaurant_id_fk'),
      ('ai_accounting_insights', 'user_id', 'idx_ai_accounting_insights_user_id_fk'),
      ('ai_admin_events', 'user_id', 'idx_ai_admin_events_user_id_fk'),
      ('ai_conversations', 'order_id', 'idx_ai_conversations_order_id_fk'),
      ('ai_conversations', 'reservation_id', 'idx_ai_conversations_reservation_id_fk'),
      ('ai_generated_assets', 'user_id', 'idx_ai_generated_assets_user_id_fk'),
      ('ai_performance_snapshots', 'restaurant_id', 'idx_ai_performance_snapshots_restaurant_id_fk'),
      ('ai_restaurant_tasks', 'conversation_id', 'idx_ai_restaurant_tasks_conversation_id_fk'),
      ('ai_restaurant_tasks', 'user_id', 'idx_ai_restaurant_tasks_user_id_fk'),
      ('ai_safety_rules', 'restaurant_id', 'idx_ai_safety_rules_restaurant_id_fk'),
      ('ai_security_events', 'restaurant_id', 'idx_ai_security_events_restaurant_id_fk'),
      ('ai_security_events', 'user_id', 'idx_ai_security_events_user_id_fk'),
      ('ai_support_tickets', 'conversation_id', 'idx_ai_support_tickets_conversation_id_fk'),
      ('ai_support_tickets', 'support_incident_id', 'idx_ai_support_tickets_support_incident_id_fk'),
      ('ai_support_tickets', 'order_id', 'idx_ai_support_tickets_order_id_fk'),
      ('ai_support_tickets', 'reservation_id', 'idx_ai_support_tickets_reservation_id_fk'),
      ('ai_usage_logs', 'conversation_id', 'idx_ai_usage_logs_conversation_id_fk'),
      ('ai_usage_logs', 'task_id', 'idx_ai_usage_logs_task_id_fk'),
      ('ai_usage_logs', 'user_id', 'idx_ai_usage_logs_user_id_fk'),
      ('anti_waste_offers', 'archived_by', 'idx_anti_waste_offers_archived_by_fk'),
      ('cart_item_modifiers', 'cart_item_id', 'idx_cart_item_modifiers_cart_item_id_fk'),
      ('cart_item_modifiers', 'modifier_option_id', 'idx_cart_item_modifiers_modifier_option_id_fk'),
      ('cart_items', 'cart_id', 'idx_cart_items_cart_id_fk'),
      ('cart_items', 'dish_id', 'idx_cart_items_dish_id_fk'),
      ('carts', 'branch_id', 'idx_carts_branch_id_fk'),
      ('flash_sales', 'archived_by', 'idx_flash_sales_archived_by_fk')
    ) AS t(table_name, column_name, index_name)
  LOOP
    IF to_regclass(format('%I.%I', 'public', index_spec.table_name)) IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = index_spec.table_name
          AND column_name = index_spec.column_name
      )
    THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)',
        index_spec.index_name,
        index_spec.table_name,
        index_spec.column_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'platform_revenue_entries',
    'platform_cost_entries',
    'marketing_budget_periods',
    'sales_representatives',
    'restaurant_leads',
    'restaurant_deals',
    'commercial_commissions',
    'restaurant_activation_metrics',
    'ai_usage_costs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin())',
      table_name || '_admin_all',
      table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS restaurant_leads_public_insert ON public.restaurant_leads;
CREATE POLICY restaurant_leads_public_insert
  ON public.restaurant_leads
  FOR INSERT
  TO anon
  WITH CHECK (
    status = 'new'
    AND assigned_sales_rep_id IS NULL
    AND length(trim(restaurant_name)) >= 2
    AND length(trim(city)) >= 2
  );

REVOKE ALL ON public.platform_revenue_entries FROM anon;
REVOKE ALL ON public.platform_cost_entries FROM anon;
REVOKE ALL ON public.marketing_budget_periods FROM anon;
REVOKE ALL ON public.sales_representatives FROM anon;
REVOKE ALL ON public.restaurant_deals FROM anon;
REVOKE ALL ON public.commercial_commissions FROM anon;
REVOKE ALL ON public.restaurant_activation_metrics FROM anon;
REVOKE ALL ON public.ai_usage_costs FROM anon;
GRANT INSERT ON public.restaurant_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_revenue_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_cost_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_budget_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_representatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_commissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_activation_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_costs TO authenticated;

CREATE OR REPLACE VIEW public.admin_platform_finance_monthly_snapshot
WITH (security_invoker = true)
AS
WITH revenue AS (
  SELECT period_month, COALESCE(sum(amount_chf), 0)::numeric(12,2) AS revenue_chf
  FROM public.platform_revenue_entries
  GROUP BY period_month
),
costs AS (
  SELECT
    period_month,
    COALESCE(sum(amount_chf) FILTER (WHERE cost_source = 'marketing'), 0)::numeric(12,2) AS marketing_spent_chf,
    COALESCE(sum(amount_chf) FILTER (WHERE cost_source = 'commercial'), 0)::numeric(12,2) AS commercial_cost_chf,
    COALESCE(sum(amount_chf) FILTER (WHERE cost_source = 'openai'), 0)::numeric(12,2) AS openai_cost_chf,
    COALESCE(sum(amount_chf) FILTER (WHERE cost_source NOT IN ('marketing', 'commercial', 'openai')), 0)::numeric(12,2) AS other_cost_chf
  FROM public.platform_cost_entries
  GROUP BY period_month
),
ai AS (
  SELECT period_month, COALESCE(sum(estimated_cost_chf), 0)::numeric(12,2) AS ai_usage_cost_chf
  FROM public.ai_usage_costs
  GROUP BY period_month
)
SELECT
  COALESCE(r.period_month, c.period_month, a.period_month, mb.period_month) AS period_month,
  COALESCE(r.revenue_chf, mb.revenue_chf, 0)::numeric(12,2) AS revenue_chf,
  ROUND((COALESCE(r.revenue_chf, mb.revenue_chf, 0) * COALESCE(mb.marketing_budget_ratio, 0.6000))::numeric, 2) AS marketing_authorized_chf,
  COALESCE(c.marketing_spent_chf, mb.marketing_spent_chf, 0)::numeric(12,2) AS marketing_spent_chf,
  GREATEST(0, ROUND((COALESCE(r.revenue_chf, mb.revenue_chf, 0) * COALESCE(mb.marketing_budget_ratio, 0.6000))::numeric, 2) - COALESCE(c.marketing_spent_chf, mb.marketing_spent_chf, 0)) AS marketing_available_chf,
  COALESCE(c.commercial_cost_chf, 0)::numeric(12,2) AS commercial_cost_chf,
  (COALESCE(c.openai_cost_chf, 0) + COALESCE(a.ai_usage_cost_chf, 0))::numeric(12,2) AS ai_cost_chf,
  COALESCE(c.other_cost_chf, 0)::numeric(12,2) AS other_cost_chf,
  ROUND((COALESCE(r.revenue_chf, mb.revenue_chf, 0) * COALESCE(mb.reserve_ratio, 0.0700))::numeric, 2) AS reserve_minimum_chf,
  (
    COALESCE(r.revenue_chf, mb.revenue_chf, 0)
    - COALESCE(c.marketing_spent_chf, mb.marketing_spent_chf, 0)
    - COALESCE(c.commercial_cost_chf, 0)
    - COALESCE(c.openai_cost_chf, 0)
    - COALESCE(a.ai_usage_cost_chf, 0)
    - COALESCE(c.other_cost_chf, 0)
  )::numeric(12,2) AS net_margin_chf
FROM revenue r
FULL OUTER JOIN costs c ON c.period_month = r.period_month
FULL OUTER JOIN ai a ON a.period_month = COALESCE(r.period_month, c.period_month)
FULL OUTER JOIN public.marketing_budget_periods mb ON mb.period_month = COALESCE(r.period_month, c.period_month, a.period_month);

GRANT SELECT ON public.admin_platform_finance_monthly_snapshot TO authenticated;

COMMENT ON TABLE public.platform_revenue_entries IS 'Launch governance: authoritative platform revenue entries used to cap marketing, sales commissions and AI costs.';
COMMENT ON TABLE public.commercial_commissions IS 'Sales commissions are calculated only from collected revenue; refunded or disputed sources must be cancelled or adjusted before payout.';
COMMENT ON VIEW public.admin_platform_finance_monthly_snapshot IS 'Admin-only monthly snapshot for 60 percent marketing envelope and net margin controls.';

-- anon_security_definer_function_executable audit hardening.
REVOKE EXECUTE ON FUNCTION public.auth_can_access_branch(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_cart(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_cart_item(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_credit_note(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_legacy_invoice(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_order_item(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_access_reservation_record(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_dish(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_dish_modifier_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_inventory_item(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_menu_category(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_reservation_slot(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_manage_table_layout_override(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_can_view_reservation_slot(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.donate_points_for_meal(integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_deliveries(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_guest_profile(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_orders_dashboard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.auth_can_access_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_cart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_cart_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_credit_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_legacy_invoice(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_order_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_reservation_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dish_modifier_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_inventory_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_menu_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_reservation_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_table_layout_override(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_reservation_slot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.donate_points_for_meal(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_deliveries(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_guest_profile(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_group_public_feed() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
