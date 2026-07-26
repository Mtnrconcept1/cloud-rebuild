-- Repair the Fair Growth paid-module cancellation lifecycle.
-- The request RPC resets cancelled_at, but the original table migration omitted
-- the column. This migration preserves the existing ACL, RLS and schema shape.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtext('tok:restaurant-paid-modules:cancelled-at:v1')
);

DO $preflight$
DECLARE
  v_table regclass := to_regclass('public.restaurant_paid_modules');
  v_rpc regprocedure := to_regprocedure(
    'public.request_fair_growth_module(uuid,text)'
  );
  v_status_type text;
  v_status_udt text;
  v_status_nullable text;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: public.restaurant_paid_modules is absent';
  END IF;

  IF v_rpc IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: public.request_fair_growth_module(uuid,text) is absent';
  END IF;

  SELECT c.data_type, c.udt_name, c.is_nullable
  INTO v_status_type, v_status_udt, v_status_nullable
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'restaurant_paid_modules'
    AND c.column_name = 'status';

  IF v_status_type IS DISTINCT FROM 'text'
     OR v_status_udt IS DISTINCT FROM 'text'
     OR v_status_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION
      'Preflight failed: restaurant_paid_modules.status shape changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = v_table
      AND con.conname = 'restaurant_paid_modules_status_check'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid, true)
          = 'CHECK (status = ANY (ARRAY['
            || '''requested''::text, '
            || '''trialing''::text, '
            || '''active''::text, '
            || '''paused''::text, '
            || '''cancelled''::text, '
            || '''credit_due''::text]))'
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: restaurant_paid_modules status constraint changed';
  END IF;

  IF pg_get_functiondef(v_rpc::oid)
       NOT ILIKE '%restaurant_paid_modules.cancelled_at%' THEN
    RAISE EXCEPTION
      'Preflight failed: RPC no longer references the missing cancelled_at column';
  END IF;
END;
$preflight$;

-- Snapshot authorization, policy, constraint and index state. The migration
-- must add one nullable column only; it must not silently alter access control.
CREATE TEMP TABLE tok_paid_modules_prechange
ON COMMIT DROP
AS
SELECT
  c.relacl,
  c.relrowsecurity,
  c.relforcerowsecurity,
  (
    SELECT md5(
      COALESCE(
        string_agg(
          concat_ws(
            '|',
            p.policyname,
            p.permissive,
            p.roles::text,
            p.cmd,
            COALESCE(p.qual, ''),
            COALESCE(p.with_check, '')
          ),
          E'\n'
          ORDER BY p.policyname, p.cmd, p.roles::text
        ),
        ''
      )
    )
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'restaurant_paid_modules'
  ) AS policy_fingerprint,
  (
    SELECT md5(
      COALESCE(
        string_agg(
          pg_get_constraintdef(con.oid, true),
          E'\n'
          ORDER BY con.conname
        ),
        ''
      )
    )
    FROM pg_constraint AS con
    WHERE con.conrelid = c.oid
  ) AS constraint_fingerprint,
  (
    SELECT md5(
      COALESCE(
        string_agg(
          idx.indexdef,
          E'\n'
          ORDER BY idx.indexname
        ),
        ''
      )
    )
    FROM pg_indexes AS idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = 'restaurant_paid_modules'
  ) AS index_fingerprint
FROM pg_class AS c
JOIN pg_namespace AS n
  ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'restaurant_paid_modules'
  AND c.relkind = 'r';

ALTER TABLE public.restaurant_paid_modules
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.restaurant_paid_modules.cancelled_at
IS 'Timestamp at which the paid Fair Growth module entered cancelled status; cleared when it is requested again.';

-- Safe for a delayed deployment: preserve the best available historical
-- timestamp for already-cancelled rows. This is a no-op on the currently empty
-- production and demo tables.
UPDATE public.restaurant_paid_modules
SET cancelled_at = COALESCE(updated_at, requested_at, now())
WHERE status = 'cancelled'
  AND cancelled_at IS NULL;

DO $postflight$
DECLARE
  v_table regclass := to_regclass('public.restaurant_paid_modules');
  v_column_type text;
  v_column_udt text;
  v_column_nullable text;
  v_column_default text;
  v_acl aclitem[];
  v_rls boolean;
  v_force_rls boolean;
  v_policy_fingerprint text;
  v_constraint_fingerprint text;
  v_index_fingerprint text;
  v_pre tok_paid_modules_prechange%ROWTYPE;
BEGIN
  SELECT c.data_type, c.udt_name, c.is_nullable, c.column_default
  INTO
    v_column_type,
    v_column_udt,
    v_column_nullable,
    v_column_default
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'restaurant_paid_modules'
    AND c.column_name = 'cancelled_at';

  IF v_column_type IS DISTINCT FROM 'timestamp with time zone'
     OR v_column_udt IS DISTINCT FROM 'timestamptz'
     OR v_column_nullable IS DISTINCT FROM 'YES'
     OR v_column_default IS NOT NULL THEN
    RAISE EXCEPTION
      'Postflight failed: cancelled_at must be nullable timestamptz with no default';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurant_paid_modules
    WHERE status = 'cancelled'
      AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Postflight failed: a cancelled module has no cancelled_at timestamp';
  END IF;

  SELECT *
  INTO STRICT v_pre
  FROM tok_paid_modules_prechange;

  SELECT
    c.relacl,
    c.relrowsecurity,
    c.relforcerowsecurity
  INTO v_acl, v_rls, v_force_rls
  FROM pg_class AS c
  WHERE c.oid = v_table;

  SELECT md5(
    COALESCE(
      string_agg(
        concat_ws(
          '|',
          p.policyname,
          p.permissive,
          p.roles::text,
          p.cmd,
          COALESCE(p.qual, ''),
          COALESCE(p.with_check, '')
        ),
        E'\n'
        ORDER BY p.policyname, p.cmd, p.roles::text
      ),
      ''
    )
  )
  INTO v_policy_fingerprint
  FROM pg_policies AS p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'restaurant_paid_modules';

  SELECT md5(
    COALESCE(
      string_agg(
        pg_get_constraintdef(con.oid, true),
        E'\n'
        ORDER BY con.conname
      ),
      ''
    )
  )
  INTO v_constraint_fingerprint
  FROM pg_constraint AS con
  WHERE con.conrelid = v_table;

  SELECT md5(
    COALESCE(
      string_agg(
        idx.indexdef,
        E'\n'
        ORDER BY idx.indexname
      ),
      ''
    )
  )
  INTO v_index_fingerprint
  FROM pg_indexes AS idx
  WHERE idx.schemaname = 'public'
    AND idx.tablename = 'restaurant_paid_modules';

  IF v_acl IS DISTINCT FROM v_pre.relacl
     OR v_rls IS DISTINCT FROM v_pre.relrowsecurity
     OR v_force_rls IS DISTINCT FROM v_pre.relforcerowsecurity
     OR v_policy_fingerprint IS DISTINCT FROM v_pre.policy_fingerprint
     OR v_constraint_fingerprint IS DISTINCT FROM v_pre.constraint_fingerprint
     OR v_index_fingerprint IS DISTINCT FROM v_pre.index_fingerprint THEN
    RAISE EXCEPTION
      'Postflight failed: grants, RLS, policies, constraints or indexes changed unexpectedly';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- No index is intentionally added:
-- - the broken RPC reads/writes rows through the existing unique
--   (restaurant_id, module_id) index;
-- - no audited query filters or orders by cancelled_at;
-- - adding an unused index would increase write cost and generate another
--   performance-advisor warning.
-- If a future reconciliation worker scans cancelled rows by time, evaluate:
-- CREATE INDEX CONCURRENTLY restaurant_paid_modules_cancelled_at_idx
--   ON public.restaurant_paid_modules (cancelled_at)
--   WHERE status = 'cancelled';
