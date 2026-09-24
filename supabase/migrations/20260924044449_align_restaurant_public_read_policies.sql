BEGIN;

-- PERMISSIVE policies combine with OR. Every public-read path must therefore
-- enforce publication, not only restaurants_public_select. Do not convert the
-- policies to RESTRICTIVE: owners/admins must retain access to their own drafts.
ALTER POLICY production_hide_demo_restaurants ON public.restaurants
USING (
  is_active IS TRUE
  AND is_demo IS FALSE
  AND lower(COALESCE(status, '')) = 'active'
  AND public.restaurant_address_city_is_consistent(address, city)
  AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
  AND public.restaurant_source_is_publicly_displayable(id)
);

ALTER POLICY scope_production_restaurants_for_commercial_demo_accounts ON public.restaurants
USING (
  (
    NOT public.commercial_demo_current_user_is_restricted()
    AND is_active IS TRUE
    AND is_demo IS FALSE
    AND lower(COALESCE(status, '')) = 'active'
    AND public.restaurant_address_city_is_consistent(address, city)
    AND (is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE)
    AND public.restaurant_source_is_publicly_displayable(id)
  )
  OR (id = public.commercial_demo_current_restaurant_id())
);

NOTIFY pgrst, 'reload schema';
COMMIT;
