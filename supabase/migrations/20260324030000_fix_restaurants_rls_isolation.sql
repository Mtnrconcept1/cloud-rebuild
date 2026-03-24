-- Fix restaurant data isolation: replace overly permissive public SELECT policy.
-- The emergency fix (20260310064000) set USING (true) which leaks all restaurant
-- data to any authenticated user. Restore proper scoping:
--   - Public catalog: only active restaurants (for discovery/storefront)
--   - Owner: full access to own restaurants (handled by existing restaurants_owner_all)

DROP POLICY IF EXISTS "restaurants_public_select" ON public.restaurants;

CREATE POLICY "restaurants_public_select" ON public.restaurants
  FOR SELECT
  USING (is_active = true OR auth.uid() = owner_id);

NOTIFY pgrst, 'reload schema';
