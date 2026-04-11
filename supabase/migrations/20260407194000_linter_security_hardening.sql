-- Address Supabase linter warnings:
--  * function_search_path_mutable: pin search_path on flagged functions
--  * foreign_table_in_api: revoke API access on foreign tables
--  * rls_policy_always_true: drop overly-permissive INSERT policies
--    (server code uses service_role and bypasses RLS for these tables)

--------------------------------------------------------------------------------
-- 1. Pin search_path on flagged functions (handles overloads).
--------------------------------------------------------------------------------
DO $$
DECLARE
    fn_name text;
    fn_args text;
    target_funcs text[] := ARRAY[
        'decrement_stock',
        'normalize_search_text',
        'update_restaurant_search_vector',
        'search_restaurants_nearby',
        'find_nearby_couriers'
    ];
BEGIN
    FOREACH fn_name IN ARRAY target_funcs LOOP
        FOR fn_args IN
            SELECT pg_get_function_identity_arguments(p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = fn_name
        LOOP
            EXECUTE format(
                'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_catalog',
                fn_name, fn_args
            );
        END LOOP;
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 2. Revoke API access on foreign tables (Stripe wrappers).
--    Foreign tables don't honour RLS; only service_role should reach them.
--------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    foreign_tables text[] := ARRAY['checkout', 'stripe_customers', 'stripe_refund'];
BEGIN
    FOREACH t IN ARRAY foreign_tables LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'f'
        ) THEN
            EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
        END IF;
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 3. Drop overly-permissive INSERT policies on telemetry/log tables.
--    Inserts must go through edge functions running with service_role,
--    which bypasses RLS — so dropping the public policies is safe.
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Allow anyone to insert clicks" ON public.clicks;
DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;
DROP POLICY IF EXISTS "Allow anyone to insert event_store" ON public.event_store;
DROP POLICY IF EXISTS "Allow anyone to insert impressions" ON public.impressions;
DROP POLICY IF EXISTS "Allow anyone to insert search_logs" ON public.search_logs;

-- Note: auth_leaked_password_protection is a project-level Auth setting,
-- not SQL. Enable it in Supabase Dashboard → Authentication → Policies
-- → "Leaked password protection".
