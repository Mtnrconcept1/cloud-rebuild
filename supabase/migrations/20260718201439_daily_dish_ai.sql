-- Premium daily-dish assistant: private planning data, public publication data,
-- server-only idempotency and atomic publishing.

BEGIN;

CREATE TABLE public.restaurant_daily_dish_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Europe/Zurich'
    CHECK (char_length(timezone) BETWEEN 3 AND 80),
  target_food_cost_bps integer NOT NULL DEFAULT 3000
    CHECK (target_food_cost_bps BETWEEN 1000 AND 6000),
  preferred_supplier_domains text[] NOT NULL DEFAULT ARRAY['aligro.ch']::text[]
    CHECK (cardinality(preferred_supplier_domains) BETWEEN 1 AND 10),
  dietary_notes text NOT NULL DEFAULT ''
    CHECK (char_length(dietary_notes) <= 2000),
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_daily_dish_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  generation_date date NOT NULL,
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'completed', 'failed')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  lock_token uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  model text CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 120),
  source_context_hash text CHECK (
    source_context_hash IS NULL OR source_context_hash ~ '^[0-9a-f]{64}$'
  ),
  research_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(research_snapshot) = 'object'),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(sources) = 'array'),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_daily_dish_runs_daily_unique UNIQUE (restaurant_id, generation_date),
  CONSTRAINT restaurant_daily_dish_runs_request_unique UNIQUE (request_id),
  CONSTRAINT restaurant_daily_dish_runs_state_check CHECK (
    (status = 'generating' AND completed_at IS NULL AND error_code IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE TABLE public.restaurant_daily_dish_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.restaurant_daily_dish_runs(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  variant_number smallint NOT NULL CHECK (variant_number BETWEEN 1 AND 3),
  revision integer NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 6),
  parent_variant_id uuid REFERENCES public.restaurant_daily_dish_variants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'refined', 'selected', 'published', 'archived')),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND pg_column_size(payload) <= 65536
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_daily_dish_variants_revision_unique
    UNIQUE (run_id, variant_number, revision)
);

CREATE TABLE public.restaurant_daily_dishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.restaurant_daily_dish_variants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 2 AND 1200),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 100 AND 1000000),
  image_url text NOT NULL CHECK (char_length(image_url) BETWEEN 10 AND 2048),
  ai_generated_asset_id uuid NOT NULL REFERENCES public.ai_generated_assets(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  actualites_post_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_daily_dishes_service_unique UNIQUE (restaurant_id, service_date)
);

CREATE INDEX restaurant_daily_dish_runs_status_idx
  ON public.restaurant_daily_dish_runs (restaurant_id, status, generation_date DESC);
CREATE INDEX restaurant_daily_dish_variants_restaurant_idx
  ON public.restaurant_daily_dish_variants (restaurant_id, run_id, variant_number, revision DESC);
CREATE INDEX restaurant_daily_dish_variants_parent_idx
  ON public.restaurant_daily_dish_variants (parent_variant_id)
  WHERE parent_variant_id IS NOT NULL;
CREATE INDEX restaurant_daily_dishes_public_idx
  ON public.restaurant_daily_dishes (restaurant_id, status, service_date DESC);
CREATE INDEX restaurant_daily_dishes_variant_idx
  ON public.restaurant_daily_dishes (variant_id);
CREATE INDEX restaurant_daily_dishes_asset_idx
  ON public.restaurant_daily_dishes (ai_generated_asset_id);
CREATE INDEX restaurant_daily_dishes_post_idx
  ON public.restaurant_daily_dishes (actualites_post_id)
  WHERE actualites_post_id IS NOT NULL;

ALTER TABLE public.restaurant_daily_dish_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dish_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dish_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dish_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dish_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dish_variants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_daily_dishes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.restaurant_daily_dish_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_daily_dish_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_daily_dish_variants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_daily_dishes FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_daily_dish_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_daily_dish_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_daily_dish_variants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_daily_dishes TO service_role;
GRANT SELECT ON public.restaurant_daily_dishes TO anon, authenticated;

CREATE POLICY restaurant_daily_dishes_public_read
  ON public.restaurant_daily_dishes
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

CREATE OR REPLACE FUNCTION public._touch_restaurant_daily_dish_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER restaurant_daily_dish_settings_touch
BEFORE UPDATE ON public.restaurant_daily_dish_settings
FOR EACH ROW EXECUTE FUNCTION public._touch_restaurant_daily_dish_updated_at();
CREATE TRIGGER restaurant_daily_dish_runs_touch
BEFORE UPDATE ON public.restaurant_daily_dish_runs
FOR EACH ROW EXECUTE FUNCTION public._touch_restaurant_daily_dish_updated_at();
CREATE TRIGGER restaurant_daily_dish_variants_touch
BEFORE UPDATE ON public.restaurant_daily_dish_variants
FOR EACH ROW EXECUTE FUNCTION public._touch_restaurant_daily_dish_updated_at();
CREATE TRIGGER restaurant_daily_dishes_touch
BEFORE UPDATE ON public.restaurant_daily_dishes
FOR EACH ROW EXECUTE FUNCTION public._touch_restaurant_daily_dish_updated_at();

-- One provider generation per restaurant and local service day. A stale lock
-- can be recovered, while completed work is replayed without another AI call.
CREATE OR REPLACE FUNCTION public.claim_restaurant_daily_dish_run(
  p_restaurant_id uuid,
  p_generation_date date,
  p_requested_by uuid,
  p_request_id uuid,
  p_lock_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.restaurant_daily_dish_runs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_generation_date IS NULL OR p_requested_by IS NULL
     OR p_request_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'invalid daily dish claim' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'daily-dish:' || p_restaurant_id::text || ':' || p_generation_date::text,
      0
    )
  );

  SELECT * INTO v_run
  FROM public.restaurant_daily_dish_runs run
  WHERE run.restaurant_id = p_restaurant_id
    AND run.generation_date = p_generation_date
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    INSERT INTO public.restaurant_daily_dish_runs (
      restaurant_id, generation_date, requested_by, request_id, lock_token
    ) VALUES (
      p_restaurant_id, p_generation_date, p_requested_by, p_request_id, p_lock_token
    ) RETURNING * INTO v_run;
    RETURN jsonb_build_object('state', 'claimed', 'run_id', v_run.id);
  END IF;

  IF v_run.status = 'completed' THEN
    RETURN jsonb_build_object('state', 'replay', 'run_id', v_run.id);
  END IF;
  IF v_run.status = 'generating' AND v_run.locked_at > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('state', 'in_progress', 'run_id', v_run.id);
  END IF;

  UPDATE public.restaurant_daily_dish_runs
  SET status = 'generating', requested_by = p_requested_by, request_id = p_request_id,
      lock_token = p_lock_token, locked_at = now(), error_code = NULL,
      completed_at = NULL, research_snapshot = '{}'::jsonb, sources = '[]'::jsonb
  WHERE id = v_run.id
  RETURNING * INTO v_run;

  RETURN jsonb_build_object('state', 'claimed', 'run_id', v_run.id, 'recovered', true);
END
$$;

REVOKE ALL ON FUNCTION public.claim_restaurant_daily_dish_run(uuid, date, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_daily_dish_run(uuid, date, uuid, uuid, uuid)
  TO service_role;

-- Atomically publishes the selected private proposal to the public restaurant
-- page and, optionally, to Actualités. Browser-provided URLs are never used:
-- the stable gallery URL and path come from a server-validated PhotoPro asset.
CREATE OR REPLACE FUNCTION public.publish_restaurant_daily_dish(
  p_restaurant_id uuid,
  p_actor_user_id uuid,
  p_variant_id uuid,
  p_asset_id uuid,
  p_price_cents integer,
  p_description text,
  p_publish_actualite boolean,
  p_actualite_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_variant public.restaurant_daily_dish_variants%ROWTYPE;
  v_run public.restaurant_daily_dish_runs%ROWTYPE;
  v_asset public.ai_generated_assets%ROWTYPE;
  v_dish public.restaurant_daily_dishes%ROWTYPE;
  v_post_id uuid;
  v_name text;
  v_image_url text;
  v_media_path text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_actor_user_id IS NULL OR p_variant_id IS NULL
     OR p_asset_id IS NULL OR p_price_cents NOT BETWEEN 100 AND 1000000
     OR char_length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 2 AND 1200
     OR (COALESCE(p_publish_actualite, false)
       AND char_length(btrim(COALESCE(p_actualite_body, ''))) NOT BETWEEN 2 AND 4000) THEN
    RAISE EXCEPTION 'invalid daily dish publication' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('daily-dish-publish:' || p_restaurant_id::text, 0)
  );

  SELECT * INTO v_variant
  FROM public.restaurant_daily_dish_variants variant
  WHERE variant.id = p_variant_id
    AND variant.restaurant_id = p_restaurant_id
  FOR UPDATE;
  IF v_variant.id IS NULL THEN
    RAISE EXCEPTION 'daily dish variant not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_run
  FROM public.restaurant_daily_dish_runs run
  WHERE run.id = v_variant.run_id
    AND run.restaurant_id = p_restaurant_id
    AND run.status = 'completed'
  FOR UPDATE;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'daily dish run is not publishable' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_asset
  FROM public.ai_generated_assets asset
  WHERE asset.id = p_asset_id
    AND asset.restaurant_id = p_restaurant_id
    AND asset.user_id = p_actor_user_id
    AND asset.status IN ('generated', 'stored')
  FOR SHARE;
  IF v_asset.id IS NULL THEN
    RAISE EXCEPTION 'PhotoPro asset not found' USING ERRCODE = '42501';
  END IF;

  v_name := left(btrim(COALESCE(v_variant.payload->>'name', '')), 120);
  v_image_url := COALESCE(
    NULLIF(v_asset.metadata->>'gallery_image_url', ''),
    NULLIF(v_asset.asset_url, '')
  );
  v_media_path := COALESCE(
    NULLIF(v_asset.metadata->>'gallery_storage_path', ''),
    NULLIF(v_asset.storage_path, '')
  );
  IF char_length(v_name) < 2 OR char_length(COALESCE(v_image_url, '')) NOT BETWEEN 10 AND 2048 THEN
    RAISE EXCEPTION 'daily dish publication asset invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.restaurant_daily_dishes
  SET status = 'archived'
  WHERE restaurant_id = p_restaurant_id
    AND status = 'active'
    AND service_date <> v_run.generation_date;

  INSERT INTO public.restaurant_daily_dishes (
    restaurant_id, service_date, variant_id, name, description, price_cents,
    image_url, ai_generated_asset_id, status, published_by, published_at
  ) VALUES (
    p_restaurant_id, v_run.generation_date, v_variant.id, v_name,
    btrim(p_description), p_price_cents, v_image_url, v_asset.id, 'active',
    p_actor_user_id, now()
  )
  ON CONFLICT (restaurant_id, service_date) DO UPDATE
  SET variant_id = EXCLUDED.variant_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      image_url = EXCLUDED.image_url,
      ai_generated_asset_id = EXCLUDED.ai_generated_asset_id,
      status = 'active',
      published_by = EXCLUDED.published_by,
      published_at = now()
  RETURNING * INTO v_dish;

  UPDATE public.restaurant_daily_dish_variants
  SET status = CASE WHEN id = v_variant.id THEN 'published' ELSE 'archived' END
  WHERE run_id = v_variant.run_id;

  IF COALESCE(p_publish_actualite, false) THEN
    v_post_id := v_dish.actualites_post_id;
    IF v_post_id IS NULL THEN
      INSERT INTO public.social_posts (
        restaurant_id, author_id, body, status, post_type, cta_type,
        visibility, campaign_goal, campaign_name, audience_segment, published_at
      ) VALUES (
        p_restaurant_id, p_actor_user_id, btrim(p_actualite_body), 'published',
        'annonce', 'none', 'public', 'awareness', 'Plat du jour IA', 'local', now()
      ) RETURNING id INTO v_post_id;

      INSERT INTO public.social_post_media (
        post_id, media_url, media_path, media_type, sort_order, alt_text, metadata
      ) VALUES (
        v_post_id, v_image_url, v_media_path, 'image', 0,
        'Plat du jour : ' || v_name,
        jsonb_build_object('source', 'daily_dish_ai', 'asset_id', v_asset.id)
      );
    ELSE
      UPDATE public.social_posts
      SET body = btrim(p_actualite_body), status = 'published', published_at = now(), updated_at = now()
      WHERE id = v_post_id AND restaurant_id = p_restaurant_id;
      DELETE FROM public.social_post_media WHERE post_id = v_post_id;
      INSERT INTO public.social_post_media (
        post_id, media_url, media_path, media_type, sort_order, alt_text, metadata
      ) VALUES (
        v_post_id, v_image_url, v_media_path, 'image', 0,
        'Plat du jour : ' || v_name,
        jsonb_build_object('source', 'daily_dish_ai', 'asset_id', v_asset.id)
      );
    END IF;
    UPDATE public.restaurant_daily_dishes SET actualites_post_id = v_post_id WHERE id = v_dish.id;
  END IF;

  RETURN jsonb_build_object(
    'dish_id', v_dish.id,
    'post_id', v_post_id,
    'service_date', v_run.generation_date,
    'image_url', v_image_url
  );
END
$$;

REVOKE ALL ON FUNCTION public.publish_restaurant_daily_dish(
  uuid, uuid, uuid, uuid, integer, text, boolean, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_restaurant_daily_dish(
  uuid, uuid, uuid, uuid, integer, text, boolean, text
) TO service_role;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'daily-dish-ai',
  'IA Plat du jour',
  'Trois propositions quotidiennes avec recherche fournisseurs, coûts, recette et publication PhotoPro.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

UPDATE public.restaurant_subscription_plans
SET features = CASE
  WHEN jsonb_typeof(features) = 'array' THEN
    features || jsonb_build_array('Plat du jour IA : 3 propositions quotidiennes, fournisseurs et visuel PhotoPro')
  ELSE jsonb_build_array('Plat du jour IA : 3 propositions quotidiennes, fournisseurs et visuel PhotoPro')
END,
updated_at = now()
WHERE slug IN ('premium', 'elite')
  AND NOT COALESCE(features, '[]'::jsonb) @>
    jsonb_build_array('Plat du jour IA : 3 propositions quotidiennes, fournisseurs et visuel PhotoPro');

COMMENT ON TABLE public.restaurant_daily_dish_settings IS
  'Server-private Premium/Elite daily-dish configuration.';
COMMENT ON TABLE public.restaurant_daily_dish_runs IS
  'Server-private, one idempotent AI supplier-research run per restaurant and local day.';
COMMENT ON TABLE public.restaurant_daily_dish_variants IS
  'Server-private recipes, baskets, supplier prices and revisions.';
COMMENT ON TABLE public.restaurant_daily_dishes IS
  'Public-safe selected daily dish; never exposes recipe costs or supplier research.';

COMMIT;
