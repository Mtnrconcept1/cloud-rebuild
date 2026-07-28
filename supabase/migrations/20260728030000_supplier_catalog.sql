-- Supplier catalogue cached in Postgres so the daily dish generation reads
-- prices from the database instead of running a web search on every request.
-- Refreshed weekly by the aligro-catalog-sync Edge Function.
--
-- Additive migration: new tables, no existing object is altered or dropped.

CREATE TABLE IF NOT EXISTS public.supplier_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL DEFAULT 'aligro' CHECK (supplier IN ('aligro')),
  external_id text,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 300),
  -- Lowercased, accent-free form written by the sync function. Used to match a
  -- recipe ingredient against a catalogue entry without a text-search extension.
  normalized_name text NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 300),
  category text,
  package_size text,
  unit text,
  price_chf numeric(10, 2) CHECK (price_chf IS NULL OR (price_chf >= 0 AND price_chf <= 100000)),
  currency text NOT NULL DEFAULT 'CHF' CHECK (currency = 'CHF'),
  availability text,
  url text NOT NULL CHECK (url ~ '^https://'),
  image_url text,
  -- Whatever the extractor read from the page, kept for debugging a bad parse
  -- without needing to re-crawl.
  raw jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw) = 'object'),
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_catalog_products_supplier_url_key UNIQUE (supplier, url)
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_lookup
  ON public.supplier_catalog_products(supplier, normalized_name);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_freshness
  ON public.supplier_catalog_products(supplier, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_products_priced
  ON public.supplier_catalog_products(supplier, category)
  WHERE price_chf IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.supplier_catalog_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL DEFAULT 'aligro' CHECK (supplier IN ('aligro')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),
  products_upserted integer NOT NULL DEFAULT 0 CHECK (products_upserted >= 0),
  products_skipped integer NOT NULL DEFAULT 0 CHECK (products_skipped >= 0),
  error_message text,
  -- Extraction counters per strategy, so the first production run tells us which
  -- format the site actually exposes rather than failing silently.
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(diagnostics) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_syncs_recent
  ON public.supplier_catalog_syncs(supplier, started_at DESC);

ALTER TABLE public.supplier_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog_syncs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_catalog_products FROM anon, authenticated;
REVOKE ALL ON public.supplier_catalog_syncs FROM anon, authenticated;

-- Catalogue rows are public webshop facts, so any signed-in restaurateur may read
-- them. Writes stay with the sync function. Sync runs are operational data and
-- are not exposed to restaurateurs at all.
GRANT SELECT ON public.supplier_catalog_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_catalog_products TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.supplier_catalog_syncs TO service_role;

DROP POLICY IF EXISTS "supplier_catalog_products_select_authenticated"
  ON public.supplier_catalog_products;
CREATE POLICY "supplier_catalog_products_select_authenticated"
  ON public.supplier_catalog_products
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "supplier_catalog_syncs_select_admin"
  ON public.supplier_catalog_syncs;
CREATE POLICY "supplier_catalog_syncs_select_admin"
  ON public.supplier_catalog_syncs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_supplier_catalog_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_catalog_products_touch
  ON public.supplier_catalog_products;
CREATE TRIGGER trg_supplier_catalog_products_touch
  BEFORE UPDATE ON public.supplier_catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_supplier_catalog_product();

/**
 * Batch upsert used by the sync function.
 *
 * Keeping the write server-side means one round trip per page batch and lets the
 * unique (supplier, url) key resolve re-crawls into updates. A row whose price
 * could not be read keeps its previous price rather than being wiped, so a bad
 * parse degrades to stale data instead of an empty catalogue.
 */
CREATE OR REPLACE FUNCTION public.upsert_supplier_catalog_products(
  p_supplier text,
  p_products jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF p_supplier IS NULL OR p_supplier NOT IN ('aligro') THEN
    RAISE EXCEPTION 'Unsupported supplier.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'Products payload must be an array.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supplier_catalog_products AS target (
    supplier, external_id, name, normalized_name, category, package_size,
    unit, price_chf, availability, url, image_url, raw, checked_at
  )
  SELECT
    p_supplier,
    NULLIF(btrim(entry->>'external_id'), ''),
    btrim(entry->>'name'),
    btrim(entry->>'normalized_name'),
    NULLIF(btrim(entry->>'category'), ''),
    NULLIF(btrim(entry->>'package_size'), ''),
    NULLIF(btrim(entry->>'unit'), ''),
    NULLIF(entry->>'price_chf', '')::numeric,
    NULLIF(btrim(entry->>'availability'), ''),
    btrim(entry->>'url'),
    NULLIF(btrim(entry->>'image_url'), ''),
    COALESCE(entry->'raw', '{}'::jsonb),
    now()
  FROM jsonb_array_elements(p_products) AS entry
  WHERE btrim(COALESCE(entry->>'name', '')) <> ''
    AND btrim(COALESCE(entry->>'normalized_name', '')) <> ''
    AND btrim(COALESCE(entry->>'url', '')) ~ '^https://'
  ON CONFLICT (supplier, url) DO UPDATE
  SET
    external_id = COALESCE(EXCLUDED.external_id, target.external_id),
    name = EXCLUDED.name,
    normalized_name = EXCLUDED.normalized_name,
    category = COALESCE(EXCLUDED.category, target.category),
    package_size = COALESCE(EXCLUDED.package_size, target.package_size),
    unit = COALESCE(EXCLUDED.unit, target.unit),
    price_chf = COALESCE(EXCLUDED.price_chf, target.price_chf),
    availability = COALESCE(EXCLUDED.availability, target.availability),
    image_url = COALESCE(EXCLUDED.image_url, target.image_url),
    raw = EXCLUDED.raw,
    checked_at = EXCLUDED.checked_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_supplier_catalog_products(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_catalog_products(text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
