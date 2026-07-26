-- Remove all remaining dedicated-demo blanket RLS policies.
--
-- Production has no such policies, so this migration is a controlled no-op
-- there. The dedicated demo project falls back to its existing scoped
-- policies and SECURITY DEFINER RPCs. Tables that had no alternative policy
-- become server-only.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(
  hashtext('tok-demo:remaining-public-rls-blanket:v1')
);

CREATE TEMP TABLE tok_demo_blanket_cleanup_targets (
  schema_name name NOT NULL,
  table_name name NOT NULL,
  PRIMARY KEY (schema_name, table_name)
) ON COMMIT DROP;

INSERT INTO tok_demo_blanket_cleanup_targets (schema_name, table_name)
SELECT policy.schemaname, policy.tablename
FROM pg_policies AS policy
WHERE policy.schemaname = 'public'
  AND policy.tablename <> 'user_roles'
  AND policy.policyname = 'dedicated_commercial_demo_full_access';

CREATE TEMP TABLE tok_demo_blanket_service_only_tables (
  table_name name PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO tok_demo_blanket_service_only_tables (table_name)
VALUES
  ('commercial_demo_ai_provider_failures'),
  ('commercial_demo_ai_requests'),
  ('commercial_demo_ai_storage_cleanup_queue'),
  ('commercial_earning_events'),
  ('commercial_prospect_catalog'),
  ('finance_outbox'),
  ('payment_attempts'),
  ('refund_operations'),
  ('restaurant_subscription_activation_jobs'),
  ('restaurant_subscription_payment_events'),
  ('restaurant_subscription_payment_methods'),
  ('solidarity_donations');

CREATE OR REPLACE FUNCTION pg_temp.tok_demo_public_rls_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $fingerprint$
  SELECT pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'rls',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_array(
              namespace.nspname,
              relation.relname,
              relation.relrowsecurity,
              relation.relforcerowsecurity
            )
            ORDER BY namespace.nspname, relation.relname
          )
          FROM pg_catalog.pg_class AS relation
          JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p')
        ),
        '[]'::jsonb
      ),
      'policies',
      COALESCE(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_array(
              policy.schemaname,
              policy.tablename,
              policy.policyname,
              policy.permissive,
              policy.roles::text,
              policy.cmd,
              policy.qual,
              policy.with_check
            )
            ORDER BY
              policy.schemaname,
              policy.tablename,
              policy.policyname,
              policy.cmd
          )
          FROM pg_catalog.pg_policies AS policy
          WHERE policy.schemaname = 'public'
            AND policy.policyname <> 'dedicated_commercial_demo_full_access'
        ),
        '[]'::jsonb
      )
    )::text
  );
$fingerprint$;

CREATE TEMP TABLE tok_demo_blanket_cleanup_fingerprint (
  fingerprint text NOT NULL
) ON COMMIT DROP;

DO $preflight$
DECLARE
  v_policy record;
  v_target_count integer;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM tok_demo_blanket_cleanup_targets;

  IF v_target_count = 0 THEN
    RAISE NOTICE
      'No remaining public dedicated-demo blanket policies; controlled no-op';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname <> 'public'
      AND policyname = 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION
      'An earlier non-public demo isolation migration has not been applied';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION
      'The earlier user_roles demo isolation migration has not been applied';
  END IF;

  FOR v_policy IN
    SELECT
      policy.schemaname,
      policy.tablename,
      policy.permissive,
      policy.roles,
      policy.cmd,
      policy.qual,
      policy.with_check
    FROM pg_policies AS policy
    JOIN tok_demo_blanket_cleanup_targets AS target
      ON target.schema_name = policy.schemaname
     AND target.table_name = policy.tablename
    WHERE policy.policyname = 'dedicated_commercial_demo_full_access'
  LOOP
    IF v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
      OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
      OR v_policy.cmd IS DISTINCT FROM 'ALL'
      OR v_policy.qual IS DISTINCT FROM
        'is_dedicated_commercial_demo_actor()'
      OR v_policy.with_check IS DISTINCT FROM
        'is_dedicated_commercial_demo_actor()'
    THEN
      RAISE EXCEPTION
        'Unexpected demo blanket policy shape on %.%',
        v_policy.schemaname,
        v_policy.tablename;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_blanket_cleanup_targets AS target
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.nspname = target.schema_name
    JOIN pg_catalog.pg_class AS relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = target.table_name
    WHERE relation.relkind NOT IN ('r', 'p')
       OR relation.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION
      'A target relation is not an RLS-enabled public table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_blanket_service_only_tables AS expected
    WHERE to_regclass(format('public.%I', expected.table_name)) IS NULL
  ) THEN
    RAISE EXCEPTION
      'An expected service-only table is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_blanket_service_only_tables AS expected
    JOIN pg_policies AS policy
      ON policy.schemaname = 'public'
     AND policy.tablename = expected.table_name
    WHERE policy.policyname <> 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION
      'A service-only table has an unexpected alternative client policy';
  END IF;

  IF (
    SELECT count(DISTINCT required.proname)
    FROM (
      VALUES
        ('commercial_demo_create_session'),
        ('commercial_demo_create_order'),
        ('commercial_demo_create_reservation'),
        ('commercial_demo_get_snapshot'),
        ('commercial_demo_reset_session'),
        ('commercial_demo_transition'),
        ('commercial_demo_transition_reservation'),
        ('get_commercial_prospect_followups'),
        ('get_commercial_prospect_signup_referral'),
        ('record_commercial_prospect_followup')
    ) AS required(proname)
    JOIN pg_catalog.pg_proc AS routine
      ON routine.proname = required.proname
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
     AND namespace.nspname = 'public'
    WHERE routine.prosecdef
      AND routine.proowner = 'postgres'::regrole
      AND EXISTS (
        SELECT 1
        FROM unnest(routine.proconfig) AS setting
        WHERE setting LIKE 'search_path=%'
      )
      AND has_function_privilege(
        'authenticated',
        routine.oid,
        'EXECUTE'
      )
  ) <> 10 THEN
    RAISE EXCEPTION
      'Required scoped demo or prospect RPC security invariants are missing';
  END IF;
END;
$preflight$;

INSERT INTO tok_demo_blanket_cleanup_fingerprint (fingerprint)
SELECT pg_temp.tok_demo_public_rls_fingerprint();

DO $cleanup$
DECLARE
  v_target record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM tok_demo_blanket_cleanup_targets
  ) THEN
    RETURN;
  END IF;

  FOR v_target IN
    SELECT schema_name, table_name
    FROM tok_demo_blanket_cleanup_targets
    ORDER BY schema_name, table_name
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      'dedicated_commercial_demo_full_access',
      v_target.schema_name,
      v_target.table_name
    );
  END LOOP;

  FOR v_target IN
    SELECT table_name
    FROM tok_demo_blanket_service_only_tables
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated',
      v_target.table_name
    );
  END LOOP;
END;
$cleanup$;

DO $postflight$
DECLARE
  v_before_fingerprint text;
  v_after_fingerprint text;
  v_target_count integer;
BEGIN
  SELECT count(*)
  INTO v_target_count
  FROM tok_demo_blanket_cleanup_targets;

  IF v_target_count = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'dedicated_commercial_demo_full_access'
  ) THEN
    RAISE EXCEPTION
      'A dedicated-demo blanket policy remains after cleanup';
  END IF;

  SELECT fingerprint
  INTO STRICT v_before_fingerprint
  FROM tok_demo_blanket_cleanup_fingerprint;

  SELECT pg_temp.tok_demo_public_rls_fingerprint()
  INTO v_after_fingerprint;

  IF v_after_fingerprint IS DISTINCT FROM v_before_fingerprint THEN
    RAISE EXCEPTION
      'A non-blanket policy or public-table RLS setting changed unexpectedly';
  END IF;

  IF (
    SELECT count(*)
    FROM (
      VALUES
        (
          'commercial_demo_ai_conversations',
          'commercial_demo_ai_conversations_select'
        ),
        (
          'commercial_demo_ai_generations',
          'commercial_demo_ai_generations_select'
        ),
        (
          'commercial_demo_ai_messages',
          'commercial_demo_ai_messages_select'
        ),
        (
          'commercial_demo_catalog_items',
          'commercial_demo_catalog_select'
        ),
        (
          'commercial_demo_delivery_missions',
          'commercial_demo_missions_select'
        ),
        (
          'commercial_demo_order_events',
          'commercial_demo_events_select'
        ),
        (
          'commercial_demo_order_sessions',
          'commercial_demo_sessions_select'
        ),
        (
          'commercial_demo_orders',
          'commercial_demo_orders_select'
        ),
        (
          'commercial_demo_reservations',
          'commercial_demo_reservations_select'
        )
    ) AS required(table_name, policy_name)
    JOIN pg_policies AS policy
      ON policy.schemaname = 'public'
     AND policy.tablename = required.table_name
     AND policy.policyname = required.policy_name
    WHERE policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['authenticated']::name[]
      AND policy.cmd = 'SELECT'
      AND policy.qual IS NOT NULL
      AND policy.qual <> 'true'
      AND policy.with_check IS NULL
  ) <> 9 THEN
    RAISE EXCEPTION
      'Expected scoped commercial-demo SELECT policies are missing';
  END IF;

  IF (
    SELECT count(*)
    FROM (
      VALUES
        (
          'menu_items',
          'dedicated_commercial_demo_mapped_menu_select',
          'SELECT'
        ),
        (
          'menu_items',
          'dedicated_commercial_demo_mapped_menu_insert',
          'INSERT'
        ),
        (
          'menu_items',
          'dedicated_commercial_demo_mapped_menu_update',
          'UPDATE'
        ),
        (
          'menu_items',
          'dedicated_commercial_demo_mapped_menu_delete',
          'DELETE'
        ),
        (
          'restaurants',
          'dedicated_commercial_demo_shared_restaurant_select',
          'SELECT'
        ),
        (
          'restaurants',
          'dedicated_commercial_demo_shared_restaurant_update',
          'UPDATE'
        )
    ) AS required(table_name, policy_name, command)
    JOIN pg_policies AS policy
      ON policy.schemaname = 'public'
     AND policy.tablename = required.table_name
     AND policy.policyname = required.policy_name
     AND policy.cmd = required.command
    WHERE policy.permissive = 'PERMISSIVE'
      AND policy.roles = ARRAY['authenticated']::name[]
      AND (
        COALESCE(policy.qual, '') LIKE
          '%dedicated_demo_can_access_restaurant%'
        OR COALESCE(policy.with_check, '') LIKE
          '%dedicated_demo_can_access_restaurant%'
      )
  ) <> 6 THEN
    RAISE EXCEPTION
      'Expected mapped restaurant or menu demo policies are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_blanket_service_only_tables AS expected
    JOIN pg_policies AS policy
      ON policy.schemaname = 'public'
     AND policy.tablename = expected.table_name
  ) THEN
    RAISE EXCEPTION
      'A service-only table still has a client RLS policy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tok_demo_blanket_service_only_tables AS expected
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.nspname = 'public'
    JOIN pg_catalog.pg_class AS relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = expected.table_name
    WHERE has_table_privilege(
      'authenticated',
      relation.oid,
      'SELECT'
    )
       OR has_table_privilege(
         'authenticated',
         relation.oid,
         'INSERT'
       )
       OR has_table_privilege(
         'authenticated',
         relation.oid,
         'UPDATE'
       )
       OR has_table_privilege(
         'authenticated',
         relation.oid,
         'DELETE'
       )
  ) THEN
    RAISE EXCEPTION
      'An authenticated table privilege remains on a service-only table';
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$postflight$;

COMMIT;
