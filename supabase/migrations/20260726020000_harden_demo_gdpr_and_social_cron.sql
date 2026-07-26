-- Keep the standalone TOK demo aligned with production security boundaries.
-- This migration is intentionally idempotent because production already has the
-- guarded wrapper while older demo projects may still expose the implementation.

DO $migration$
BEGIN
  IF to_regprocedure('public.delete_user_gdpr_cascade_unguarded(uuid)') IS NULL THEN
    IF to_regprocedure('public.delete_user_gdpr_cascade(uuid)') IS NULL THEN
      RAISE EXCEPTION 'delete_user_gdpr_cascade(uuid) is missing';
    END IF;

    ALTER FUNCTION public.delete_user_gdpr_cascade(uuid)
      RENAME TO delete_user_gdpr_cascade_unguarded;
  END IF;
END;
$migration$;

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
    SELECT 1 FROM auth.users AS account WHERE account.id = p_user_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user % does not exist', p_user_id
      USING ERRCODE = '22023';
  END IF;

  -- Retain accounting records while removing user-entered PII.
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
          'user', 'auth_user', 'profile', 'applicant'
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

  DELETE FROM auth.users AS account WHERE account.id = p_user_id;
END;
$function$;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
IS 'Internal GDPR deletion implementation. Callable only through guarded SECURITY DEFINER wrappers.';

REVOKE ALL ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade(p_user_id uuid)
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
        AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
      )
    )
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM public.delete_user_gdpr_cascade_unguarded(p_user_id);
END;
$function$;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade(uuid)
IS 'Deletes the current user, or an admin-selected user, through the internal GDPR cascade.';

REVOKE ALL ON FUNCTION public.delete_user_gdpr_cascade(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_gdpr_cascade(uuid)
  TO authenticated, service_role;

-- Older demo environments scheduled the trigger function directly. Repoint the
-- existing job to the callable runner already used by production.
DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  IF to_regprocedure('public.run_social_post_promotion_status_sync()') IS NULL THEN
    RAISE EXCEPTION 'run_social_post_promotion_status_sync() is missing';
  END IF;

  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'tok-sync-social-post-promotions';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id := v_job_id,
      command := 'SELECT public.run_social_post_promotion_status_sync();'
    );
  END IF;
END;
$migration$;

DO $assertions$
BEGIN
  IF has_function_privilege(
      'anon',
      'public.delete_user_gdpr_cascade_unguarded(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.delete_user_gdpr_cascade_unguarded(uuid)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'service_role',
      'public.delete_user_gdpr_cascade_unguarded(uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'The unguarded GDPR function remains executable by an API role';
  END IF;

  IF has_function_privilege(
      'anon',
      'public.delete_user_gdpr_cascade(uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.delete_user_gdpr_cascade(uuid)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.delete_user_gdpr_cascade(uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'The guarded GDPR function grants are invalid';
  END IF;

  IF to_regclass('cron.job') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'tok-sync-social-post-promotions'
        AND command IS DISTINCT FROM
          'SELECT public.run_social_post_promotion_status_sync();'
    )
  THEN
    RAISE EXCEPTION 'The social promotion cron still targets the trigger function';
  END IF;
END;
$assertions$;
