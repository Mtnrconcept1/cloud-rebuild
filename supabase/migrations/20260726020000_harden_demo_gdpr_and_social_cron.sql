-- Align standalone TOK environments with production security boundaries.
-- Production already has the guarded wrapper; older demo projects may still
-- expose the destructive implementation directly. The migration is idempotent.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtext('tok-demo:delete-user-hardening-and-social-promotion-cron:v1')
);

DO $preflight$
DECLARE
  v_delete regprocedure := to_regprocedure(
    'public.delete_user_gdpr_cascade(uuid)'
  );
  v_delete_unguarded regprocedure := to_regprocedure(
    'public.delete_user_gdpr_cascade_unguarded(uuid)'
  );
  v_has_role regprocedure := to_regprocedure(
    'public.has_role(uuid,public.app_role)'
  );
  v_sync_runner regprocedure := to_regprocedure(
    'public.run_social_post_promotion_status_sync()'
  );
  v_bad_trigger regprocedure := to_regprocedure(
    'public.sync_social_post_promotion_status()'
  );
  v_cron_schedule regprocedure := to_regprocedure(
    'cron.schedule(text,text,text)'
  );
BEGIN
  IF v_delete IS NULL AND v_delete_unguarded IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: GDPR deletion function is absent';
  END IF;

  IF v_has_role IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: public.has_role(uuid, public.app_role) is absent';
  END IF;

  IF v_sync_runner IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: safe social-promotion sync runner is absent';
  END IF;

  IF pg_get_function_result(v_sync_runner::oid) <> 'integer' THEN
    RAISE EXCEPTION
      'Preflight failed: safe social-promotion runner has unexpected return type';
  END IF;

  IF v_bad_trigger IS NULL
     OR pg_get_function_result(v_bad_trigger::oid) <> 'trigger' THEN
    RAISE EXCEPTION
      'Preflight failed: expected trigger function is absent or changed';
  END IF;

  IF v_cron_schedule IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: cron.schedule(text,text,text) is absent';
  END IF;

  IF (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'tok-sync-social-post-promotions'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Preflight failed: expected exactly one social-promotion cron job';
  END IF;
END;
$preflight$;

DO $rename$
BEGIN
  IF to_regprocedure(
       'public.delete_user_gdpr_cascade_unguarded(uuid)'
     ) IS NULL THEN
    IF to_regprocedure(
         'public.delete_user_gdpr_cascade(uuid)'
       ) IS NULL THEN
      RAISE EXCEPTION
        'Cannot rename missing public.delete_user_gdpr_cascade(uuid)';
    END IF;

    EXECUTE
      'ALTER FUNCTION public.delete_user_gdpr_cascade(uuid) '
      'RENAME TO delete_user_gdpr_cascade_unguarded';
  END IF;
END;
$rename$;

-- Reconcile the old implementation with the current event_store schema.
CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade_unguarded(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user_id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS account
    WHERE account.id = p_user_id
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user % does not exist', p_user_id
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    UPDATE public.orders
    SET metadata = COALESCE(metadata, '{}'::jsonb)
          - 'customer_email'
          - 'customer_phone'
          - 'customer_name'
          - 'delivery_contact'
          - 'delivery_phone'
          - 'billing_email'
          - 'billing_phone',
        delivery_address = NULL,
        notes = NULL
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    UPDATE public.reservations
    SET metadata = COALESCE(metadata, '{}'::jsonb)
          - 'guest_email'
          - 'guest_phone'
          - 'guest_name'
          - 'contact',
        special_requests = NULL
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    UPDATE public.payment_transactions
    SET metadata = jsonb_build_object(
          'gdpr_anonymized_at', now(),
          'stripe_id', metadata->>'stripe_id',
          'checkout_session_id', metadata->>'checkout_session_id'
        )
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.search_logs WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.impressions WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.clicks WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.event_store AS stored_event
    WHERE (
        lower(COALESCE(stored_event.entity_type, '')) IN (
          'user',
          'auth_user',
          'profile',
          'applicant'
        )
        AND stored_event.entity_id = p_user_id
      )
      OR stored_event.payload->>'user_id' = p_user_id::text
      OR stored_event.payload->>'actor_id' = p_user_id::text
      OR stored_event.payload->>'applicant_user_id' = p_user_id::text
      OR stored_event.payload->>'reviewer_id' = p_user_id::text;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.device_tokens WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM storage.objects
    WHERE (storage.foldername(name))[1] = p_user_id::text
       OR owner = p_user_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  DELETE FROM auth.users AS account
  WHERE account.id = p_user_id;
END;
$function$;

REVOKE ALL
ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
IS 'Internal GDPR deletion implementation. Not executable through the Data API.';

CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
    AND (
      v_actor_id IS NULL
      OR (
        v_actor_id IS DISTINCT FROM p_user_id
        AND NOT public.has_role(
          v_actor_id,
          'admin'::public.app_role
        )
      )
    )
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM public.delete_user_gdpr_cascade_unguarded(p_user_id);
END;
$function$;

REVOKE ALL
ON FUNCTION public.delete_user_gdpr_cascade(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.delete_user_gdpr_cascade(uuid)
TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade(uuid)
IS 'GDPR deletion wrapper: caller may delete self; admin/service_role may delete another user.';

-- pg_cron updates the existing named job instead of creating a duplicate.
SELECT cron.schedule(
  'tok-sync-social-post-promotions',
  '*/5 * * * *',
  'SELECT public.run_social_post_promotion_status_sync();'
);

DO $postflight$
DECLARE
  v_wrapper regprocedure := to_regprocedure(
    'public.delete_user_gdpr_cascade(uuid)'
  );
  v_unguarded regprocedure := to_regprocedure(
    'public.delete_user_gdpr_cascade_unguarded(uuid)'
  );
  v_job_count integer;
  v_bad_job_count integer;
BEGIN
  IF v_wrapper IS NULL OR v_unguarded IS NULL THEN
    RAISE EXCEPTION
      'Postflight failed: wrapper or internal GDPR function is absent';
  END IF;

  IF NOT (
    SELECT p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, auth, storage']::text[]
    FROM pg_proc AS p
    WHERE p.oid = v_wrapper::oid
  ) THEN
    RAISE EXCEPTION
      'Postflight failed: wrapper SECURITY DEFINER/search_path mismatch';
  END IF;

  IF NOT (
    SELECT p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public, auth, storage']::text[]
    FROM pg_proc AS p
    WHERE p.oid = v_unguarded::oid
  ) THEN
    RAISE EXCEPTION
      'Postflight failed: internal SECURITY DEFINER/search_path mismatch';
  END IF;

  IF has_function_privilege('anon', v_wrapper, 'EXECUTE') THEN
    RAISE EXCEPTION
      'Postflight failed: anon can execute guarded GDPR wrapper';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    v_wrapper,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Postflight failed: authenticated cannot execute guarded wrapper';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    v_wrapper,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Postflight failed: service_role cannot execute guarded wrapper';
  END IF;

  IF has_function_privilege('anon', v_unguarded, 'EXECUTE')
     OR has_function_privilege(
          'authenticated',
          v_unguarded,
          'EXECUTE'
        )
     OR has_function_privilege(
          'service_role',
          v_unguarded,
          'EXECUTE'
        ) THEN
    RAISE EXCEPTION
      'Postflight failed: internal GDPR function remains API-executable';
  END IF;

  IF pg_get_functiondef(v_wrapper::oid)
       NOT ILIKE '%v_actor_id uuid := auth.uid()%' THEN
    RAISE EXCEPTION
      'Postflight failed: wrapper actor guard is absent';
  END IF;

  IF pg_get_functiondef(v_wrapper::oid)
       NOT ILIKE '%public.has_role%' THEN
    RAISE EXCEPTION
      'Postflight failed: wrapper admin guard is absent';
  END IF;

  SELECT count(*)
  INTO v_job_count
  FROM cron.job
  WHERE jobname = 'tok-sync-social-post-promotions'
    AND active
    AND schedule = '*/5 * * * *'
    AND lower(
      regexp_replace(command, '[[:space:]]', '', 'g')
    ) = 'selectpublic.run_social_post_promotion_status_sync();';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION
      'Postflight failed: safe social-promotion cron is not uniquely configured';
  END IF;

  SELECT count(*)
  INTO v_bad_job_count
  FROM cron.job
  WHERE active
    AND command ~* '(^|[^A-Za-z0-9_])(?:public[.])?sync_social_post_promotion_status[[:space:]]*[(]';

  IF v_bad_job_count <> 0 THEN
    RAISE EXCEPTION
      'Postflight failed: a cron still invokes the trigger function directly';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
