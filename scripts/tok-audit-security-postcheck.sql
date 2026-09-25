-- Read-only preflight/postflight for the 2026-09-24 audit remediation.
-- Does not call any business RPC or read customer records/secrets.
-- Six rows are required. After migration, exists=true, anon=false,
-- authenticated=false, service=true and passed=true on every row.
WITH expected(signature) AS (
  VALUES
    ('public.advance_print_order_state(uuid,text,text,text,text,text,text,text,jsonb)'),
    ('public.advance_print_reorder_state(uuid,text,text,text,text,text,text)'),
    ('public.claim_print_fulfillment_jobs(integer,text,integer)'),
    ('public.complete_print_fulfillment_job(uuid,uuid,text,text,text,jsonb,timestamptz)'),
    ('public.finalize_paid_print_order(uuid,uuid,text)'),
    ('public.record_print_provider_event(text,text,text,text,text,text,text,timestamptz,text,jsonb)')
), resolved AS (
  SELECT signature, to_regprocedure(signature)::oid AS function_oid
  FROM expected
)
SELECT
  signature,
  function_oid IS NOT NULL AS exists,
  has_function_privilege('anon', function_oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', function_oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', function_oid, 'EXECUTE') AS service_execute,
  function_oid IS NOT NULL
    AND has_function_privilege('anon', function_oid, 'EXECUTE') IS FALSE
    AND has_function_privilege('authenticated', function_oid, 'EXECUTE') IS FALSE
    AND has_function_privilege('service_role', function_oid, 'EXECUTE') IS TRUE AS passed
FROM resolved
ORDER BY signature;

-- Inspect the deparsed definitions, not merely the migration source.
-- Storage must reference the outer objects.name, never the inner r.name.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'storage' AND tablename = 'objects' AND policyname IN (
  'Restaurant owners can upload invoice logos',
  'Restaurant owners can list their invoice logos',
  'Restaurant owners can delete their logos'
)) OR (schemaname = 'public' AND tablename = 'restaurants' AND policyname IN (
  'production_hide_demo_restaurants',
  'scope_production_restaurants_for_commercial_demo_accounts',
  'restaurants_public_select',
  'restaurants_owner_select',
  'Admins can manage all restaurants'
))
ORDER BY schemaname, tablename, policyname;

-- Confirm RLS remains enabled; these tables must each be returned.
SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public' AND c.relname IN ('restaurants', 'print_orders', 'print_fulfillment_jobs'))
   OR (n.nspname = 'storage' AND c.relname = 'objects');
