-- Authorize the versioned 520-row TheFork Geneva dataset in the server-owned
-- commercial prospect catalog. The browser still reads the public static
-- dataset; this allow-list only permits the existing scoped follow-up RPCs to
-- accept those stable source identifiers.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF to_regclass('public.commercial_prospect_catalog') IS NULL THEN
    RAISE EXCEPTION 'commercial_prospect_catalog is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'commercial_prospect_catalog'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION 'commercial_prospect_catalog must remain RLS-enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'public.commercial_prospect_catalog'::regclass
      AND constraint_definition.contype = 'p'
      AND pg_get_constraintdef(constraint_definition.oid) =
        'PRIMARY KEY (source_objectid)'
  ) THEN
    RAISE EXCEPTION 'commercial_prospect_catalog primary key drifted';
  END IF;
END;
$preflight$;

INSERT INTO public.commercial_prospect_catalog (
  source_objectid,
  dataset_version,
  created_at
)
SELECT
  2600000000::bigint + source_index,
  DATE '2026-07-24',
  clock_timestamp()
FROM generate_series(1, 520) AS source_index
ON CONFLICT (source_objectid) DO UPDATE
SET dataset_version = EXCLUDED.dataset_version;

DO $postflight$
DECLARE
  v_authorized_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_authorized_count
  FROM public.commercial_prospect_catalog
  WHERE source_objectid BETWEEN 2600000001 AND 2600000520
    AND dataset_version = DATE '2026-07-24';

  IF v_authorized_count <> 520 THEN
    RAISE EXCEPTION
      'Expected 520 authorized TheFork prospects, found %',
      v_authorized_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'commercial_prospect_catalog'
  ) THEN
    RAISE EXCEPTION
      'commercial_prospect_catalog must remain service-only without client policies';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$postflight$;

COMMIT;
