BEGIN;

-- Supabase Storage rejects direct DELETE statements on storage.objects so the
-- backing object cannot be orphaned. Keep the GDPR cascade operational by
-- quarantining private objects for the Storage API cleanup path when that
-- guard fires. The public wrapper remains defined by the preceding migration.
CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade_unguarded(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
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
  EXCEPTION
    WHEN insufficient_privilege THEN
      BEGIN
        UPDATE storage.objects
        SET owner = NULL,
            owner_id = NULL,
            user_metadata = COALESCE(user_metadata, '{}'::jsonb)
              || jsonb_build_object(
                'gdpr_storage_api_cleanup_required', true,
                'gdpr_quarantined_at', now()
              )
        WHERE (storage.foldername(name))[1] = p_user_id::text
           OR owner = p_user_id
           OR owner_id = p_user_id::text;
      EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
        NULL;
      END;
    WHEN undefined_table OR undefined_column THEN
      NULL;
  END;

  DELETE FROM auth.users AS account WHERE account.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid) IS
  'Internal GDPR cascade. Storage objects blocked from SQL deletion are quarantined for Storage API cleanup.';

COMMIT;
