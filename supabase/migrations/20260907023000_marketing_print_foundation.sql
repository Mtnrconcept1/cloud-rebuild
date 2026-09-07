-- TheTok Print durable commerce foundation.
--
-- This migration is intentionally additive. Provider costs, provider payloads and
-- fulfillment internals remain service-only; restaurant-facing rows contain only
-- the retail/order data the owning restaurant needs to see.

BEGIN;

CREATE TABLE IF NOT EXISTS public.print_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL,
  description text,
  marketing_tool_id text,
  default_width_mm numeric(10,3),
  default_height_mm numeric(10,3),
  default_orientation text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  margin_bps integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_products_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  CONSTRAINT print_products_category_check CHECK (btrim(category) <> ''),
  CONSTRAINT print_products_dimensions_check CHECK (
    (default_width_mm IS NULL AND default_height_mm IS NULL)
    OR (default_width_mm > 0 AND default_height_mm > 0)
  ),
  CONSTRAINT print_products_margin_check CHECK (margin_bps IS NULL OR margin_bps BETWEEN 0 AND 50000)
);

CREATE TABLE IF NOT EXISTS public.print_provider_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_product_id uuid REFERENCES public.print_products(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  provider_name text,
  provider_note text,
  width_mm numeric(10,3),
  height_mm numeric(10,3),
  bleed_mm numeric(10,3),
  safe_margin_mm numeric(10,3),
  printable_sides integer,
  orientation text,
  print_technology text,
  minimum_quantity integer,
  quantity_step integer,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  countries jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_provider_products_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT print_provider_products_reference_check CHECK (btrim(provider_reference) <> ''),
  CONSTRAINT print_provider_products_dimensions_check CHECK (
    (width_mm IS NULL AND height_mm IS NULL)
    OR (width_mm > 0 AND height_mm > 0)
  ),
  CONSTRAINT print_provider_products_bleed_check CHECK (bleed_mm IS NULL OR bleed_mm >= 0),
  CONSTRAINT print_provider_products_safe_check CHECK (safe_margin_mm IS NULL OR safe_margin_mm >= 0),
  CONSTRAINT print_provider_products_quantity_check CHECK (
    (minimum_quantity IS NULL OR minimum_quantity > 0)
    AND (quantity_step IS NULL OR quantity_step > 0)
  ),
  CONSTRAINT print_provider_products_provider_reference_unique UNIQUE (provider, provider_reference)
);

CREATE TABLE IF NOT EXISTS public.print_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_generation_id text,
  title text NOT NULL DEFAULT 'Création Marketing Studio',
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_documents_version_check CHECK (version > 0),
  CONSTRAINT print_documents_status_check CHECK (status IN ('draft', 'ready', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.print_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  print_document_id uuid NOT NULL REFERENCES public.print_documents(id) ON DELETE RESTRICT,
  provider_product_id uuid NOT NULL REFERENCES public.print_provider_products(id) ON DELETE RESTRICT,
  export_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'generated',
  proof_storage_path text,
  production_storage_path text NOT NULL,
  preview_storage_path text,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  byte_size bigint NOT NULL DEFAULT 0,
  md5 text NOT NULL,
  sha256 text NOT NULL,
  preflight jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_spec_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_exports_version_check CHECK (export_version > 0),
  CONSTRAINT print_exports_status_check CHECK (status IN ('generated', 'preflight_failed', 'ready', 'approved', 'superseded')),
  CONSTRAINT print_exports_size_check CHECK (byte_size >= 0),
  CONSTRAINT print_exports_md5_check CHECK (md5 ~ '^[a-f0-9]{32}$'),
  CONSTRAINT print_exports_sha256_check CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT print_exports_approval_pair_check CHECK (
    (approved_at IS NULL AND approved_by IS NULL)
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.print_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  print_export_id uuid NOT NULL REFERENCES public.print_exports(id) ON DELETE RESTRICT,
  provider_product_id uuid NOT NULL REFERENCES public.print_provider_products(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'cloudprinter',
  quantity integer NOT NULL,
  country text NOT NULL,
  state text,
  provider_currency text NOT NULL,
  provider_product_amount numeric(14,4) NOT NULL,
  provider_product_vat numeric(14,4) NOT NULL DEFAULT 0,
  provider_invoice_currency text,
  provider_invoice_exchange_rate numeric(18,8),
  provider_quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_shipping_quote text NOT NULL,
  selected_shipping_level text,
  selected_shipping_option text,
  selected_shipping_amount numeric(14,4) NOT NULL,
  selected_shipping_vat numeric(14,4) NOT NULL DEFAULT 0,
  customer_currency text NOT NULL DEFAULT 'CHF',
  customer_amount_cents integer NOT NULL,
  margin_cents integer NOT NULL,
  margin_bps integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_quotes_quantity_check CHECK (quantity > 0),
  CONSTRAINT print_quotes_country_check CHECK (country ~ '^[A-Z]{2}$'),
  CONSTRAINT print_quotes_provider_currency_check CHECK (provider_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT print_quotes_customer_currency_check CHECK (customer_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT print_quotes_customer_amount_check CHECK (customer_amount_cents >= 0),
  CONSTRAINT print_quotes_margin_check CHECK (margin_cents >= 0 AND margin_bps BETWEEN 0 AND 50000),
  CONSTRAINT print_quotes_shipping_quote_check CHECK (btrim(selected_shipping_quote) <> '')
);

CREATE TABLE IF NOT EXISTS public.print_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  print_quote_id uuid NOT NULL REFERENCES public.print_quotes(id) ON DELETE RESTRICT,
  print_export_id uuid NOT NULL REFERENCES public.print_exports(id) ON DELETE RESTRICT,
  payment_attempt_id uuid UNIQUE REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'payment_pending',
  payment_status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'cloudprinter',
  provider_reference text UNIQUE,
  provider_order_id text,
  provider_state text,
  customer_currency text NOT NULL DEFAULT 'CHF',
  customer_amount_cents integer NOT NULL,
  quantity integer NOT NULL,
  shipping_address jsonb NOT NULL,
  selected_shipping jsonb NOT NULL DEFAULT '{}'::jsonb,
  tracking_code text,
  tracking_url text,
  carrier text,
  paid_at timestamptz,
  submitted_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_orders_status_check CHECK (status IN (
    'payment_pending', 'paid', 'submission_pending', 'submitted', 'validated',
    'producing', 'produced', 'packed', 'shipped', 'delivered',
    'cancellation_requested', 'canceled', 'production_error', 'delivery_failed',
    'refund_pending', 'refunded'
  )),
  CONSTRAINT print_orders_payment_status_check CHECK (payment_status IN (
    'pending', 'paid', 'failed', 'canceled', 'refund_pending', 'refunded', 'partial_refund'
  )),
  CONSTRAINT print_orders_customer_currency_check CHECK (customer_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT print_orders_amount_check CHECK (customer_amount_cents >= 0),
  CONSTRAINT print_orders_quantity_check CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS public.print_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_order_id uuid NOT NULL REFERENCES public.print_orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  print_product_id uuid NOT NULL REFERENCES public.print_products(id) ON DELETE RESTRICT,
  provider_product_id uuid NOT NULL REFERENCES public.print_provider_products(id) ON DELETE RESTRICT,
  item_reference text NOT NULL,
  quantity integer NOT NULL,
  title text NOT NULL,
  provider_product_reference text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_item_id text,
  provider_state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT print_order_items_reference_unique UNIQUE (print_order_id, item_reference)
);

CREATE TABLE IF NOT EXISTS public.print_order_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  print_order_id uuid NOT NULL REFERENCES public.print_orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  state text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text,
  provider_event_id text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_order_events_type_check CHECK (btrim(event_type) <> '')
);

CREATE TABLE IF NOT EXISTS public.print_provider_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_order_reference text,
  provider_item_reference text,
  provider_order_id text,
  provider_item_id text,
  occurred_at timestamptz,
  normalized_state text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_provider_events_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT print_provider_events_event_id_check CHECK (btrim(provider_event_id) <> ''),
  CONSTRAINT print_provider_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.print_fulfillment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_order_id uuid NOT NULL REFERENCES public.print_orders(id) ON DELETE CASCADE,
  operation_key text NOT NULL UNIQUE,
  job_type text NOT NULL DEFAULT 'submit_order',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 12,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_fulfillment_jobs_type_check CHECK (job_type IN ('submit_order', 'reconcile_order', 'cancel_order', 'reorder')),
  CONSTRAINT print_fulfillment_jobs_status_check CHECK (status IN ('pending', 'processing', 'retrying', 'completed', 'failed', 'canceled')),
  CONSTRAINT print_fulfillment_jobs_attempt_check CHECK (attempt_count >= 0 AND max_attempts > 0),
  CONSTRAINT print_fulfillment_jobs_lease_pair_check CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.print_settings (
  id text PRIMARY KEY DEFAULT 'global',
  enabled boolean NOT NULL DEFAULT true,
  new_orders_enabled boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'cloudprinter',
  default_margin_bps integer NOT NULL DEFAULT 2500,
  minimum_margin_cents integer NOT NULL DEFAULT 500,
  rounding_increment_cents integer NOT NULL DEFAULT 10,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_settings_margin_check CHECK (default_margin_bps BETWEEN 0 AND 50000),
  CONSTRAINT print_settings_minimum_margin_check CHECK (minimum_margin_cents >= 0),
  CONSTRAINT print_settings_rounding_check CHECK (rounding_increment_cents BETWEEN 1 AND 1000)
);

INSERT INTO public.print_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- Logical TheTok products only. Cloudprinter references are intentionally not
-- seeded: they are discovered from the authenticated CloudCore account and must
-- be explicitly mapped/activated before a product becomes orderable.
INSERT INTO public.print_products (
  slug, display_name, category, description, marketing_tool_id,
  default_width_mm, default_height_mm, default_orientation, sort_order, metadata
) VALUES
  ('flyer-a6', 'Flyer A6', 'flyer', 'Flyer compact pour comptoir, rue et boîte aux lettres.', 'flyer', 105, 148, 'portrait', 10, '{"mvp":true}'::jsonb),
  ('flyer-a5', 'Flyer A5', 'flyer', 'Flyer promotionnel polyvalent pour restaurant.', 'flyer', 148, 210, 'portrait', 20, '{"mvp":true}'::jsonb),
  ('flyer-a4', 'Flyer A4', 'flyer', 'Support promotionnel grand format.', 'flyer', 210, 297, 'portrait', 30, '{"mvp":true}'::jsonb),
  ('poster-a3', 'Affiche A3', 'poster', 'Affiche vitrine ou intérieur.', 'poster', 297, 420, 'portrait', 40, '{"mvp":true}'::jsonb),
  ('business-card-85x55', 'Carte 85 × 55 mm', 'business_card', 'Carte de visite, fidélité ou QR.', 'business_card', 85, 55, 'landscape', 50, '{"mvp":true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_print_provider_products_product_active
  ON public.print_provider_products (print_product_id, provider, active)
  WHERE print_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_print_documents_restaurant_created
  ON public.print_documents (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_exports_restaurant_created
  ON public.print_exports (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_quotes_restaurant_created
  ON public.print_quotes (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_quotes_expires
  ON public.print_quotes (expires_at);
CREATE INDEX IF NOT EXISTS idx_print_orders_restaurant_created
  ON public.print_orders (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_orders_status_updated
  ON public.print_orders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_orders_provider_reference
  ON public.print_orders (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_print_order_items_order
  ON public.print_order_items (print_order_id);
CREATE INDEX IF NOT EXISTS idx_print_order_events_order_created
  ON public.print_order_events (print_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_provider_events_reference_created
  ON public.print_provider_events (provider, provider_order_reference, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_fulfillment_jobs_due
  ON public.print_fulfillment_jobs (status, next_attempt_at, lease_expires_at)
  WHERE status IN ('pending', 'retrying', 'processing');

CREATE OR REPLACE FUNCTION public.is_print_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_print_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = auth.uid()
  ) OR public.is_print_admin();
$$;

REVOKE ALL ON FUNCTION public.is_print_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_print_restaurant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_print_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_print_restaurant(uuid) TO authenticated, service_role;

ALTER TABLE public.print_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_fulfillment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.print_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_provider_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_exports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_order_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_provider_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_fulfillment_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_settings FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.print_products TO authenticated;
GRANT SELECT ON public.print_documents TO authenticated;
GRANT SELECT ON public.print_exports TO authenticated;
GRANT SELECT ON public.print_orders TO authenticated;
GRANT SELECT ON public.print_order_items TO authenticated;
GRANT SELECT ON public.print_order_events TO authenticated;
GRANT SELECT ON public.print_settings TO authenticated;

GRANT ALL ON public.print_products TO service_role;
GRANT ALL ON public.print_provider_products TO service_role;
GRANT ALL ON public.print_documents TO service_role;
GRANT ALL ON public.print_exports TO service_role;
GRANT ALL ON public.print_quotes TO service_role;
GRANT ALL ON public.print_orders TO service_role;
GRANT ALL ON public.print_order_items TO service_role;
GRANT ALL ON public.print_order_events TO service_role;
GRANT ALL ON public.print_provider_events TO service_role;
GRANT ALL ON public.print_fulfillment_jobs TO service_role;
GRANT ALL ON public.print_settings TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS print_products_select ON public.print_products;
CREATE POLICY print_products_select
ON public.print_products FOR SELECT TO authenticated
USING (active OR public.is_print_admin());

DROP POLICY IF EXISTS print_documents_select ON public.print_documents;
CREATE POLICY print_documents_select
ON public.print_documents FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

DROP POLICY IF EXISTS print_exports_select ON public.print_exports;
CREATE POLICY print_exports_select
ON public.print_exports FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

DROP POLICY IF EXISTS print_orders_select ON public.print_orders;
CREATE POLICY print_orders_select
ON public.print_orders FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

DROP POLICY IF EXISTS print_order_items_select ON public.print_order_items;
CREATE POLICY print_order_items_select
ON public.print_order_items FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

DROP POLICY IF EXISTS print_order_events_select ON public.print_order_events;
CREATE POLICY print_order_events_select
ON public.print_order_events FOR SELECT TO authenticated
USING (public.can_access_print_restaurant(restaurant_id));

DROP POLICY IF EXISTS print_settings_admin_select ON public.print_settings;
CREATE POLICY print_settings_admin_select
ON public.print_settings FOR SELECT TO authenticated
USING (public.is_print_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'print-production-files',
  'print-production-files',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Production objects are intentionally not exposed through authenticated
-- storage.objects policies. Edge Functions create short-lived signed URLs after
-- restaurant ownership checks, while Cloudprinter receives a separate short-lived
-- signed URL only during fulfillment.

CREATE OR REPLACE FUNCTION public.print_order_state_rank(p_state text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_state
    WHEN 'payment_pending' THEN 10
    WHEN 'paid' THEN 20
    WHEN 'submission_pending' THEN 30
    WHEN 'submitted' THEN 40
    WHEN 'validated' THEN 50
    WHEN 'producing' THEN 60
    WHEN 'produced' THEN 70
    WHEN 'packed' THEN 80
    WHEN 'shipped' THEN 90
    WHEN 'delivered' THEN 100
    WHEN 'cancellation_requested' THEN 110
    WHEN 'production_error' THEN 115
    WHEN 'delivery_failed' THEN 116
    WHEN 'refund_pending' THEN 120
    WHEN 'canceled' THEN 130
    WHEN 'refunded' THEN 140
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.advance_print_order_state(
  p_order_id uuid,
  p_state text,
  p_provider_state text DEFAULT NULL,
  p_tracking_code text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_carrier text DEFAULT NULL,
  p_provider_event_id text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.print_orders%ROWTYPE;
  v_current_rank integer;
  v_next_rank integer;
  v_advanced boolean := false;
BEGIN
  SELECT * INTO v_order
  FROM public.print_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_order_not_found';
  END IF;

  v_current_rank := public.print_order_state_rank(v_order.status);
  v_next_rank := public.print_order_state_rank(p_state);
  IF v_next_rank = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_order_state';
  END IF;

  IF v_next_rank >= v_current_rank THEN
    UPDATE public.print_orders
    SET status = p_state,
        provider_state = COALESCE(p_provider_state, provider_state),
        tracking_code = COALESCE(NULLIF(p_tracking_code, ''), tracking_code),
        tracking_url = COALESCE(NULLIF(p_tracking_url, ''), tracking_url),
        carrier = COALESCE(NULLIF(p_carrier, ''), carrier),
        submitted_at = CASE WHEN p_state = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
        shipped_at = CASE WHEN p_state = 'shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
        delivered_at = CASE WHEN p_state = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
        canceled_at = CASE WHEN p_state = 'canceled' THEN COALESCE(canceled_at, now()) ELSE canceled_at END,
        refunded_at = CASE WHEN p_state = 'refunded' THEN COALESCE(refunded_at, now()) ELSE refunded_at END,
        updated_at = now()
    WHERE id = p_order_id;
    v_advanced := true;
  ELSE
    -- monotonic guard: late/replayed provider events are recorded but never move
    -- the customer-visible order backwards.
    UPDATE public.print_orders
    SET provider_state = COALESCE(p_provider_state, provider_state),
        tracking_code = COALESCE(NULLIF(p_tracking_code, ''), tracking_code),
        tracking_url = COALESCE(NULLIF(p_tracking_url, ''), tracking_url),
        carrier = COALESCE(NULLIF(p_carrier, ''), carrier),
        updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.print_order_events (
    print_order_id, restaurant_id, event_type, state, provider,
    provider_event_id, message, metadata
  ) VALUES (
    v_order.id, v_order.restaurant_id, 'provider_state', p_state, v_order.provider,
    p_provider_event_id, p_message, COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('advanced', v_advanced)
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'state', p_state, 'advanced', v_advanced);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_print_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_order_reference text DEFAULT NULL,
  p_provider_item_reference text DEFAULT NULL,
  p_provider_order_id text DEFAULT NULL,
  p_provider_item_id text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_normalized_state text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.print_provider_events (
    provider, provider_event_id, event_type, provider_order_reference,
    provider_item_reference, provider_order_id, provider_item_id,
    occurred_at, normalized_state, payload
  ) VALUES (
    lower(btrim(p_provider)), btrim(p_provider_event_id), btrim(p_event_type),
    NULLIF(btrim(COALESCE(p_provider_order_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_provider_item_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_provider_order_id, '')), ''),
    NULLIF(btrim(COALESCE(p_provider_item_id, '')), ''),
    p_occurred_at, p_normalized_state, COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'accepted', v_id IS NOT NULL,
    'duplicate', v_id IS NULL,
    'event_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_paid_print_order(
  p_order_id uuid,
  p_payment_attempt_id uuid,
  p_stripe_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.print_orders%ROWTYPE;
  v_attempt public.payment_attempts%ROWTYPE;
  v_job_id uuid;
BEGIN
  SELECT * INTO v_order
  FROM public.print_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_order_not_found';
  END IF;

  SELECT * INTO v_attempt
  FROM public.payment_attempts
  WHERE id = p_payment_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_payment_attempt_not_found';
  END IF;

  IF v_attempt.kind <> 'marketing_print_order' OR v_attempt.state <> 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'print_payment_not_finalized';
  END IF;
  IF v_attempt.restaurant_id IS DISTINCT FROM v_order.restaurant_id
    OR v_attempt.owner_user_id IS DISTINCT FROM v_order.owner_user_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'print_payment_owner_mismatch';
  END IF;
  IF v_attempt.amount_cents IS DISTINCT FROM v_order.customer_amount_cents
    OR upper(v_attempt.currency) IS DISTINCT FROM upper(v_order.customer_currency)
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'print_payment_amount_mismatch';
  END IF;
  IF v_order.payment_attempt_id IS NOT NULL
    AND v_order.payment_attempt_id IS DISTINCT FROM p_payment_attempt_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'print_payment_attempt_mismatch';
  END IF;

  UPDATE public.print_orders
  SET payment_attempt_id = p_payment_attempt_id,
      payment_status = 'paid',
      status = CASE WHEN public.print_order_state_rank(status) < public.print_order_state_rank('paid') THEN 'paid' ELSE status END,
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.print_fulfillment_jobs (
    print_order_id, operation_key, job_type, status, next_attempt_at
  ) VALUES (
    p_order_id, 'submit:' || p_order_id::text, 'submit_order', 'pending', now()
  )
  ON CONFLICT (operation_key) DO UPDATE
  SET updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_job_id;

  INSERT INTO public.print_order_events (
    print_order_id, restaurant_id, event_type, state, provider, message, metadata
  ) VALUES (
    p_order_id, v_order.restaurant_id, 'payment_finalized', 'paid', v_order.provider,
    'Paiement Stripe confirmé', jsonb_build_object(
      'payment_attempt_id', p_payment_attempt_id,
      'stripe_event_id', p_stripe_event_id
    )
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', 'paid', 'fulfillment_job_id', v_job_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_print_fulfillment_jobs(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT 'print-orchestrator',
  p_lease_seconds integer DEFAULT 180
)
RETURNS TABLE (
  id uuid,
  print_order_id uuid,
  operation_key text,
  job_type text,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_fulfillment_claim';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.print_fulfillment_jobs j
    WHERE j.attempt_count < j.max_attempts
      AND j.next_attempt_at <= now()
      AND (
        j.status IN ('pending', 'retrying')
        OR (j.status = 'processing' AND j.lease_expires_at < now())
      )
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.print_fulfillment_jobs j
  SET status = 'processing',
      attempt_count = j.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now(),
      result = j.result || jsonb_build_object('worker_id', left(COALESCE(p_worker_id, 'print-orchestrator'), 120))
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.id, j.print_order_id, j.operation_key, j.job_type,
            j.attempt_count, j.max_attempts, j.lease_token, j.lease_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_print_fulfillment_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_next_attempt_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.print_fulfillment_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('retrying', 'completed', 'failed', 'canceled') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_print_fulfillment_status';
  END IF;

  SELECT * INTO v_job
  FROM public.print_fulfillment_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'print_fulfillment_job_not_found';
  END IF;
  IF v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'print_fulfillment_lease_lost';
  END IF;

  UPDATE public.print_fulfillment_jobs
  SET status = p_status,
      lease_token = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CASE
        WHEN p_status = 'retrying' THEN COALESCE(p_next_attempt_at, now() + interval '5 minutes')
        ELSE next_attempt_at
      END,
      last_error_code = CASE WHEN p_status IN ('completed', 'canceled') THEN NULL ELSE left(COALESCE(p_error_code, ''), 120) END,
      last_error = CASE WHEN p_status IN ('completed', 'canceled') THEN NULL ELSE left(COALESCE(p_error, ''), 1000) END,
      result = COALESCE(result, '{}'::jsonb) || COALESCE(p_result, '{}'::jsonb),
      completed_at = CASE WHEN p_status IN ('completed', 'failed', 'canceled') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'attempt_count', v_job.attempt_count,
    'next_attempt_at', v_job.next_attempt_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.print_order_state_rank(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_print_order_state(uuid, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_print_provider_event(text, text, text, text, text, text, text, timestamptz, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_paid_print_order(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.print_order_state_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_print_order_state(uuid, text, text, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_print_provider_event(text, text, text, text, text, text, text, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_paid_print_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_print_fulfillment_jobs(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_print_fulfillment_job(uuid, uuid, text, text, text, jsonb, timestamptz) TO service_role;

COMMIT;
