BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Keep the deployed function's ownership checks, row locks, loyalty accounting,
-- idempotency and commercial-demo guards. Change only the known unsafe floor;
-- abort on an unexpected definition instead of reinstalling an old function.
-- p_discount_applied remains in the RPC signature for existing callers, but
-- must never influence the authoritative discount calculated from the order.
DO $checkout_discount$
DECLARE
  v_signature regprocedure := to_regprocedure(
    'public.apply_checkout_benefits(uuid,uuid,integer,uuid,numeric,text)'
  );
  v_definition text;
  v_unsafe constant text := 'v_promo_discount := GREATEST(v_promo_discount, COALESCE(p_discount_applied, 0), 0);';
  v_safe constant text := 'v_promo_discount := GREATEST(v_promo_discount, 0);';
  v_occurrences integer;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Required apply_checkout_benefits signature is missing';
  END IF;
  v_definition := pg_get_functiondef(v_signature);
  v_occurrences := (length(v_definition) - length(replace(v_definition, v_unsafe, ''))) / length(v_unsafe);
  IF v_occurrences = 1 THEN
    EXECUTE replace(v_definition, v_unsafe, v_safe);
  ELSIF v_occurrences = 0 AND strpos(v_definition, v_safe) > 0 THEN
    NULL; -- Reapplying this migration is safe.
  ELSE
    RAISE EXCEPTION 'Unexpected apply_checkout_benefits definition: reconcile migration history before deployment';
  END IF;
END;
$checkout_discount$;

-- Usage is authoritative accounting state. Keep the historical rows and reads;
-- writes remain available to the SECURITY DEFINER RPC and service_role only.
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.promo_code_uses FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Users manage own promo_code_uses" ON public.promo_code_uses;
DROP POLICY IF EXISTS promo_uses_own ON public.promo_code_uses;
CREATE POLICY promo_uses_own ON public.promo_code_uses
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS promo_uses_admin ON public.promo_code_uses;
CREATE POLICY promo_uses_admin ON public.promo_code_uses
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Policies are ORed: remove BOTH legacy public read paths. The public branch
-- mirrors the current restaurant-publication requirements (including images).
-- Owner policies and ALL restrictive commercial_demo policies stay unchanged.
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view available menu items" ON public.menu_items;
DROP POLICY IF EXISTS menu_items_public_select ON public.menu_items;
CREATE POLICY menu_items_public_select ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (
    is_available IS TRUE
    AND EXISTS (
      SELECT 1 FROM public.restaurants AS restaurant
      WHERE restaurant.id = menu_items.restaurant_id
        AND restaurant.is_active IS TRUE
        AND restaurant.is_demo IS FALSE
        AND lower(COALESCE(restaurant.status, '')) = 'active'
        AND public.restaurant_address_city_is_consistent(restaurant.address, restaurant.city)
        AND (restaurant.is_directory_listing IS FALSE OR restaurant.directory_public_name_verified IS TRUE)
        AND NULLIF(btrim(restaurant.image_url), '') IS NOT NULL
        AND (restaurant.is_directory_listing IS FALSE OR restaurant.directory_image_verified IS TRUE)
        AND public.restaurant_source_is_publicly_displayable(restaurant.id)
    )
  );
DROP POLICY IF EXISTS menu_items_admin_select ON public.menu_items;
CREATE POLICY menu_items_admin_select ON public.menu_items
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Only trusted Edge Functions may consume or choose rate-limit buckets.
REVOKE ALL ON FUNCTION public.rate_limit_consume(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume(text, text, integer, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
