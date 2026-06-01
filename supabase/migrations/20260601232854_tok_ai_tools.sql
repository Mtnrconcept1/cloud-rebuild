CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'client',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  support_incident_id uuid REFERENCES public.support_incidents(id) ON DELETE SET NULL,
  title text,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_conversations_scope_check CHECK (scope IN ('client', 'restaurant', 'admin', 'image')),
  CONSTRAINT ai_conversations_status_check CHECK (status IN ('open', 'ticket_created', 'escalated', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  model text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_check CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text NOT NULL DEFAULT 'invoke',
  model text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  generated_asset_id uuid,
  status text NOT NULL DEFAULT 'success',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_chf numeric(12, 6),
  provider_request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_logs_status_check CHECK (status IN ('success', 'failure', 'fallback'))
);

CREATE TABLE IF NOT EXISTS public.restaurant_ai_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  brand_tone text NOT NULL DEFAULT 'premium, clair, chaleureux',
  specialties text[] NOT NULL DEFAULT ARRAY[]::text[],
  visual_style text NOT NULL DEFAULT 'TOK premium, lumineux, appetissant',
  default_language text NOT NULL DEFAULT 'fr-CH',
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_ai_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'trialing',
  monthly_conversation_limit integer NOT NULL DEFAULT 50,
  monthly_text_tool_limit integer NOT NULL DEFAULT 20,
  monthly_image_limit integer NOT NULL DEFAULT 0,
  monthly_premium_image_limit integer NOT NULL DEFAULT 0,
  monthly_voice_minutes_limit integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  current_period_end timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_ai_subscriptions_plan_check CHECK (plan IN ('starter', 'pro', 'premium', 'elite', 'custom')),
  CONSTRAINT restaurant_ai_subscriptions_status_check CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.ai_generated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_image_url text,
  asset_url text,
  storage_bucket text NOT NULL DEFAULT 'ai-generated-assets',
  storage_path text,
  asset_type text NOT NULL DEFAULT 'image_brief',
  model text,
  prompt text NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'generated',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_generated_assets_type_check CHECK (asset_type IN ('image_brief', 'image', 'campaign_visual', 'menu_visual', 'banner')),
  CONSTRAINT ai_generated_assets_status_check CHECK (status IN ('draft', 'generated', 'stored', 'failed', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.ai_safety_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'platform',
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  label text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  auto_escalate boolean NOT NULL DEFAULT false,
  max_auto_credit_chf numeric(10, 2),
  instructions text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_safety_rules_scope_check CHECK (scope IN ('platform', 'restaurant')),
  CONSTRAINT ai_safety_rules_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT ai_safety_rules_unique_key UNIQUE NULLS NOT DISTINCT (scope, restaurant_id, rule_key)
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_created_idx
  ON public.ai_conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_conversations_restaurant_scope_idx
  ON public.ai_conversations(restaurant_id, scope, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON public.ai_messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_function_created_idx
  ON public.ai_usage_logs(function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_restaurant_created_idx
  ON public.ai_usage_logs(restaurant_id, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_generated_assets_restaurant_created_idx
  ON public.ai_generated_assets(restaurant_id, created_at DESC)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_safety_rules_active_idx
  ON public.ai_safety_rules(scope, restaurant_id, is_active);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_safety_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_ai_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_ai_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_ai_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_ai_conversations_updated_at ON public.ai_conversations;
CREATE TRIGGER touch_ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP TRIGGER IF EXISTS touch_restaurant_ai_profiles_updated_at ON public.restaurant_ai_profiles;
CREATE TRIGGER touch_restaurant_ai_profiles_updated_at
BEFORE UPDATE ON public.restaurant_ai_profiles
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP TRIGGER IF EXISTS touch_restaurant_ai_subscriptions_updated_at ON public.restaurant_ai_subscriptions;
CREATE TRIGGER touch_restaurant_ai_subscriptions_updated_at
BEFORE UPDATE ON public.restaurant_ai_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP TRIGGER IF EXISTS touch_ai_safety_rules_updated_at ON public.ai_safety_rules;
CREATE TRIGGER touch_ai_safety_rules_updated_at
BEFORE UPDATE ON public.ai_safety_rules
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP POLICY IF EXISTS "ai_conversations_select_related" ON public.ai_conversations;
CREATE POLICY "ai_conversations_select_related"
  ON public.ai_conversations
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_conversations_insert_related" ON public.ai_conversations;
CREATE POLICY "ai_conversations_insert_related"
  ON public.ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_conversations_update_related" ON public.ai_conversations;
CREATE POLICY "ai_conversations_update_related"
  ON public.ai_conversations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_messages_select_related" ON public.ai_messages;
CREATE POLICY "ai_messages_select_related"
  ON public.ai_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR c.user_id = auth.uid()
          OR public.auth_owns_restaurant(c.restaurant_id)
        )
    )
  );

DROP POLICY IF EXISTS "ai_messages_insert_related" ON public.ai_messages;
CREATE POLICY "ai_messages_insert_related"
  ON public.ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR c.user_id = auth.uid()
          OR public.auth_owns_restaurant(c.restaurant_id)
        )
    )
  );

DROP POLICY IF EXISTS "ai_usage_logs_select_related" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_select_related"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "restaurant_ai_profiles_owner_admin" ON public.restaurant_ai_profiles;
CREATE POLICY "restaurant_ai_profiles_owner_admin"
  ON public.restaurant_ai_profiles
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

DROP POLICY IF EXISTS "restaurant_ai_subscriptions_owner_admin_select" ON public.restaurant_ai_subscriptions;
CREATE POLICY "restaurant_ai_subscriptions_owner_admin_select"
  ON public.restaurant_ai_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "restaurant_ai_subscriptions_admin_all" ON public.restaurant_ai_subscriptions;
CREATE POLICY "restaurant_ai_subscriptions_admin_all"
  ON public.restaurant_ai_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_generated_assets_select_related" ON public.ai_generated_assets;
CREATE POLICY "ai_generated_assets_select_related"
  ON public.ai_generated_assets
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_generated_assets_insert_related" ON public.ai_generated_assets;
CREATE POLICY "ai_generated_assets_insert_related"
  ON public.ai_generated_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "ai_safety_rules_select_related" ON public.ai_safety_rules;
CREATE POLICY "ai_safety_rules_select_related"
  ON public.ai_safety_rules
  FOR SELECT
  TO authenticated
  USING (
    is_active
    AND (
      scope = 'platform'
      OR public.has_role(auth.uid(), 'admin')
      OR public.auth_owns_restaurant(restaurant_id)
    )
  );

DROP POLICY IF EXISTS "ai_safety_rules_admin_all" ON public.ai_safety_rules;
CREATE POLICY "ai_safety_rules_admin_all"
  ON public.ai_safety_rules
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.restaurant_ai_profiles TO authenticated;
GRANT SELECT ON public.restaurant_ai_subscriptions TO authenticated;
GRANT SELECT, INSERT ON public.ai_generated_assets TO authenticated;
GRANT SELECT ON public.ai_safety_rules TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-generated-assets',
  'ai-generated-assets',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ai_generated_assets_storage_owner_select" ON storage.objects;
CREATE POLICY "ai_generated_assets_storage_owner_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ai-generated-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "ai_generated_assets_storage_owner_insert" ON storage.objects;
CREATE POLICY "ai_generated_assets_storage_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ai-generated-assets'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.auth_owns_restaurant(((storage.foldername(name))[1])::uuid)
    )
  );

INSERT INTO public.ai_safety_rules (
  scope,
  rule_key,
  label,
  severity,
  auto_escalate,
  max_auto_credit_chf,
  instructions
)
VALUES
  ('platform', 'human_request', 'Demande explicite de parler a un humain', 'high', true, NULL, 'Escalader immediatement si l utilisateur demande une personne humaine.'),
  ('platform', 'medical_or_allergy', 'Allergie, intoxication ou risque medical', 'critical', true, NULL, 'Ne pas donner de diagnostic medical. Creer un incident urgent pour validation humaine.'),
  ('platform', 'legal_threat', 'Menace juridique ou litige sensible', 'critical', true, NULL, 'Ne pas promettre de compensation. Resumer les faits et transmettre a l equipe TOK.'),
  ('platform', 'refund_limit', 'Limite de compensation automatique', 'high', true, 5.00, 'L IA peut proposer un avoir maximal de 5 CHF uniquement si une regle TOK claire le justifie.')
ON CONFLICT (scope, restaurant_id, rule_key) DO UPDATE
SET label = EXCLUDED.label,
    severity = EXCLUDED.severity,
    auto_escalate = EXCLUDED.auto_escalate,
    max_auto_credit_chf = EXCLUDED.max_auto_credit_chf,
    instructions = EXCLUDED.instructions,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
