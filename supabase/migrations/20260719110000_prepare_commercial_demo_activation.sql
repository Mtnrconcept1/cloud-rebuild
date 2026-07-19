BEGIN;

-- Production protects demo restaurant identity fields from ordinary sessions.
-- Supabase migrations do not carry an application JWT, so the legitimate
-- one-time activation must bypass only this table-owner trigger. The trigger
-- is restored in the same transaction; any failure rolls the whole operation
-- back, including its disabled state.
ALTER TABLE public.restaurants
  DISABLE TRIGGER protect_demo_restaurant_identity;

UPDATE public.restaurants
SET is_active = true,
    updated_at = now()
WHERE is_demo IS TRUE
  AND COALESCE(is_active, false) IS FALSE;

ALTER TABLE public.restaurants
  ENABLE TRIGGER protect_demo_restaurant_identity;

COMMIT;
