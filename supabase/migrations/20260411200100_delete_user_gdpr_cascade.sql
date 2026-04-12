-- GDPR-compliant user deletion.
-- The schema already cascades most user-owned rows via ON DELETE CASCADE on
-- auth.users. This migration adds an explicit RPC that, in addition:
--   1. Anonymizes lingering PII inside JSONB metadata columns on tables that
--      deliberately use ON DELETE SET NULL (orders, reservations, payments,
--      reviews, ...) so accounting history can stay without exposing the user.
--   2. Deletes storage objects owned by the user in private buckets.
--   3. Performs the auth.users deletion inside the same transaction.
--
-- The RPC is SECURITY DEFINER (owned by a migration-time role) and only
-- callable by service_role. Edge functions invoke it before returning to the
-- client.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user_id is required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user % does not exist', p_user_id;
  END IF;

  ------------------------------------------------------------------
  -- 1. Anonymize PII in JSONB metadata columns (best-effort).
  ------------------------------------------------------------------
  -- Orders: strip customer fields but keep financial history.
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
    NULL; -- table/column not present in this deployment; ignore.
  END;

  -- Reservations: strip contact info.
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

  -- Payment transactions: blank metadata except id-level fields.
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

  -- Search / analytics logs tied to the user: hard delete.
  BEGIN
    DELETE FROM public.search_logs WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.impressions WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.clicks WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM public.event_store WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Device tokens for push (personal, must go).
  BEGIN
    DELETE FROM public.device_tokens WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  ------------------------------------------------------------------
  -- 2. Storage objects owned by the user.
  -- Buckets following the convention "<bucket>/<user_id>/..." are handled.
  ------------------------------------------------------------------
  BEGIN
    DELETE FROM storage.objects
    WHERE (storage.foldername(name))[1] = p_user_id::text
       OR owner = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  ------------------------------------------------------------------
  -- 3. Finally, delete the auth.users row. ON DELETE CASCADE will take
  -- care of profiles, courier_profiles, signup_applications, etc.
  ------------------------------------------------------------------
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_gdpr_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_gdpr_cascade(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_user_gdpr_cascade(uuid) IS
  'GDPR user deletion: anonymizes PII metadata + storage + cascades auth.users deletion. service_role only.';

COMMIT;
