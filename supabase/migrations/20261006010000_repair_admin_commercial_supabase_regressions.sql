BEGIN;

-- Production commercial identities now share one inert metadata restaurant.
-- The actual editable demo workspace remains in the dedicated demo project.
CREATE TABLE IF NOT EXISTS public.commercial_demo_shared_restaurant (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_demo_shared_restaurant ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_demo_shared_restaurant FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.commercial_demo_accounts
  DROP CONSTRAINT IF EXISTS commercial_demo_accounts_demo_restaurant_id_key;

CREATE INDEX IF NOT EXISTS commercial_demo_accounts_demo_restaurant_idx
  ON public.commercial_demo_accounts (demo_restaurant_id);

-- Seed the singleton from an existing safe managed demo first.
INSERT INTO public.commercial_demo_shared_restaurant (singleton, restaurant_id)
SELECT true, account.demo_restaurant_id
FROM public.commercial_demo_accounts account
JOIN public.restaurants restaurant
  ON restaurant.id = account.demo_restaurant_id
WHERE restaurant.is_demo IS TRUE
  AND lower(COALESCE(restaurant.status, '')) = 'demo'
  AND restaurant.stripe_account_id IS NULL
  AND COALESCE(restaurant.stripe_connect_details_submitted, false) IS FALSE
  AND COALESCE(restaurant.stripe_connect_charges_enabled, false) IS FALSE
  AND COALESCE(restaurant.stripe_connect_payouts_enabled, false) IS FALSE
ORDER BY account.created_at ASC
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

-- If no managed mapping exists yet, reuse the oldest safe inert demo row.
INSERT INTO public.commercial_demo_shared_restaurant (singleton, restaurant_id)
SELECT true, restaurant.id
FROM public.restaurants restaurant
WHERE NOT EXISTS (
    SELECT 1
    FROM public.commercial_demo_shared_restaurant shared
    WHERE shared.singleton
  )
  AND restaurant.is_demo IS TRUE
  AND lower(COALESCE(restaurant.status, '')) = 'demo'
  AND restaurant.stripe_account_id IS NULL
  AND COALESCE(restaurant.stripe_connect_details_submitted, false) IS FALSE
  AND COALESCE(restaurant.stripe_connect_charges_enabled, false) IS FALSE
  AND COALESCE(restaurant.stripe_connect_payouts_enabled, false) IS FALSE
ORDER BY restaurant.created_at ASC
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

-- The pre-existing managed demo may still be marked active. It is only
-- production metadata now; presentation edits happen in the dedicated demo
-- project, so harden the canonical production row before remapping accounts.
DROP TRIGGER IF EXISTS protect_demo_restaurant_identity
  ON public.restaurants;

UPDATE public.restaurants restaurant
SET is_active = false,
    is_featured = false,
    status = 'demo',
    stripe_account_id = NULL,
    stripe_connect_details_submitted = false,
    stripe_connect_charges_enabled = false,
    stripe_connect_payouts_enabled = false,
    updated_at = now()
FROM public.commercial_demo_shared_restaurant shared
WHERE shared.singleton
  AND restaurant.id = shared.restaurant_id;

CREATE TRIGGER protect_demo_restaurant_identity
  BEFORE INSERT OR UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.protect_demo_restaurant_identity();

CREATE OR REPLACE FUNCTION public.commercial_demo_shared_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shared.restaurant_id
  FROM public.commercial_demo_shared_restaurant shared
  WHERE shared.singleton
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_shared_restaurant_id()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_shared_restaurant_id()
  TO service_role;

-- Existing one-restaurant-per-commercial guards conflict with the shared model.
DROP TRIGGER IF EXISTS protect_commercial_demo_account_mapping
  ON public.commercial_demo_accounts;
DROP TRIGGER IF EXISTS protect_commercial_demo_account_boundary
  ON public.commercial_demo_accounts;

UPDATE public.commercial_demo_accounts account
SET demo_restaurant_id = shared.restaurant_id,
    updated_at = now()
FROM public.commercial_demo_shared_restaurant shared
WHERE shared.singleton
  AND account.demo_restaurant_id IS DISTINCT FROM shared.restaurant_id;

CREATE OR REPLACE FUNCTION public.protect_commercial_demo_account_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_shared_restaurant_id uuid;
BEGIN
  SELECT shared.restaurant_id
  INTO v_shared_restaurant_id
  FROM public.commercial_demo_shared_restaurant shared
  WHERE shared.singleton;

  IF v_shared_restaurant_id IS NULL
     OR NEW.demo_restaurant_id IS DISTINCT FROM v_shared_restaurant_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.restaurants restaurant
       WHERE restaurant.id = NEW.demo_restaurant_id
         AND restaurant.is_demo IS TRUE
         AND COALESCE(restaurant.is_active, false) IS FALSE
         AND lower(COALESCE(restaurant.status, '')) = 'demo'
         AND restaurant.stripe_account_id IS NULL
         AND COALESCE(restaurant.stripe_connect_details_submitted, false) IS FALSE
         AND COALESCE(restaurant.stripe_connect_charges_enabled, false) IS FALSE
         AND COALESCE(restaurant.stripe_connect_payouts_enabled, false) IS FALSE
     ) THEN
    RAISE EXCEPTION 'Commercial demo mapping must target the canonical inert shared demo restaurant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_commercial_demo_account_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_privileged boolean := COALESCE(auth.role() = 'service_role', false)
    OR COALESCE(public.auth_is_admin(), false);
  v_shared_restaurant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_is_privileged THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'COMMERCIAL_DEMO_ACCOUNT_TOMBSTONE_REQUIRED: deactivate the mapping instead of deleting it'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION
      'COMMERCIAL_DEMO_ACCOUNT_IDENTITY_IMMUTABLE: create a new managed account instead'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.demo_restaurant_id IS DISTINCT FROM OLD.demo_restaurant_id THEN
    SELECT shared.restaurant_id
    INTO v_shared_restaurant_id
    FROM public.commercial_demo_shared_restaurant shared
    WHERE shared.singleton;

    IF NOT v_is_privileged
       OR v_shared_restaurant_id IS NULL
       OR NEW.demo_restaurant_id IS DISTINCT FROM v_shared_restaurant_id THEN
      RAISE EXCEPTION
        'COMMERCIAL_DEMO_ACCOUNT_REMAP_FORBIDDEN: only an administrator may remap to the canonical shared demo restaurant'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_commercial_demo_account_mapping
  BEFORE INSERT OR UPDATE OF user_id, demo_restaurant_id, is_active
  ON public.commercial_demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_commercial_demo_account_mapping();

CREATE TRIGGER protect_commercial_demo_account_boundary
  BEFORE DELETE OR UPDATE ON public.commercial_demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_commercial_demo_account_boundary();

REVOKE ALL ON FUNCTION public.protect_commercial_demo_account_mapping()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_commercial_demo_account_boundary()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provision_commercial_demo_account(
  p_user_id uuid,
  p_full_name text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_restaurant_id uuid;
  v_restaurant_name text;
  v_display_name text := left(trim(COALESCE(p_full_name, '')), 120);
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_created_by uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL OR v_created_by IS NULL THEN
    RAISE EXCEPTION 'Missing account or administrator identifier' USING ERRCODE = '22023';
  END IF;

  IF length(v_display_name) < 2 OR length(v_email) < 5 THEN
    RAISE EXCEPTION 'Invalid commercial identity' USING ERRCODE = '22023';
  END IF;

  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users account WHERE account.id = p_user_id) THEN
    RAISE EXCEPTION 'Auth user not found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurants restaurant
    WHERE restaurant.owner_id = p_user_id
      AND restaurant.is_demo IS FALSE
  ) THEN
    RAISE EXCEPTION 'An existing real restaurant owner cannot be converted into a managed commercial demo account'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-demo-shared-restaurant', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (p_user_id, v_display_name)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  SELECT p_user_id, role_name::public.app_role
  FROM unnest(ARRAY['client', 'restaurateur']) AS role_name
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.sales_representatives
  SET full_name = v_display_name,
      email = v_email,
      status = 'active',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('managed_commercial_demo', true),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.sales_representatives (
      user_id, full_name, email, status, zone, metadata
    ) VALUES (
      p_user_id,
      v_display_name,
      v_email,
      'active',
      'Genève',
      jsonb_build_object('managed_commercial_demo', true)
    );
  END IF;

  INSERT INTO public.commercial_compensation_profiles (
    user_id, status, sprint_started_at, employment_active, notes
  ) VALUES (
    p_user_id,
    'sprint',
    current_date,
    false,
    'Compte commercial administré avec environnement restaurateur de démonstration partagé.'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  SELECT shared.restaurant_id
  INTO v_restaurant_id
  FROM public.commercial_demo_shared_restaurant shared
  WHERE shared.singleton;

  IF v_restaurant_id IS NULL THEN
    INSERT INTO public.restaurants (
      owner_id,
      name,
      legal_name,
      slug,
      description,
      cuisine_type,
      address,
      city,
      phone,
      image_url,
      rating,
      review_count,
      avg_rating,
      rating_count,
      price_range,
      is_active,
      is_featured,
      is_demo,
      status,
      delivery_available,
      delivery_fee,
      min_order_amount,
      supports_pickup,
      supports_dinein,
      supports_reservation,
      supports_group_orders,
      supports_scheduled,
      supports_scheduled_orders,
      disabled_dashboard_features,
      opening_hours
    ) VALUES (
      v_created_by,
      'Restaurant Démo TOK',
      'Restaurant de démonstration TOK',
      NULL,
      'Référence technique inactive. Le restaurant de présentation éditable vit dans le projet Supabase de démonstration dédié.',
      'Cuisine suisse & méditerranéenne',
      'Adresse de démonstration',
      'Genève',
      '+41 22 000 00 00',
      '/images/filets de perche.jpg',
      4.8,
      128,
      4.8,
      128,
      2,
      false,
      false,
      true,
      'demo',
      true,
      0,
      0,
      true,
      true,
      true,
      true,
      true,
      true,
      ARRAY[]::text[],
      jsonb_build_object('timezone', 'Europe/Zurich')
    )
    RETURNING id INTO v_restaurant_id;

    INSERT INTO public.commercial_demo_shared_restaurant (
      singleton, restaurant_id, updated_at
    ) VALUES (
      true, v_restaurant_id, now()
    )
    ON CONFLICT (singleton) DO UPDATE
    SET restaurant_id = EXCLUDED.restaurant_id,
        updated_at = now();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants restaurant
    WHERE restaurant.id = v_restaurant_id
      AND restaurant.is_demo IS TRUE
      AND COALESCE(restaurant.is_active, false) IS FALSE
      AND lower(COALESCE(restaurant.status, '')) = 'demo'
      AND restaurant.stripe_account_id IS NULL
      AND COALESCE(restaurant.stripe_connect_details_submitted, false) IS FALSE
      AND COALESCE(restaurant.stripe_connect_charges_enabled, false) IS FALSE
      AND COALESCE(restaurant.stripe_connect_payouts_enabled, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'Canonical commercial demo restaurant is unsafe'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.commercial_demo_accounts (
    user_id,
    demo_restaurant_id,
    is_active,
    template_version,
    created_by
  ) VALUES (
    p_user_id,
    v_restaurant_id,
    true,
    1,
    v_created_by
  )
  ON CONFLICT (user_id) DO UPDATE
  SET demo_restaurant_id = EXCLUDED.demo_restaurant_id,
      is_active = true,
      template_version = 1,
      created_by = COALESCE(public.commercial_demo_accounts.created_by, EXCLUDED.created_by),
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'commercial'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT restaurant.name
  INTO v_restaurant_name
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_restaurant_id;

  INSERT INTO public.audit_log (
    user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_created_by,
    'commercial_demo_account_provisioned',
    'commercial_demo_account',
    p_user_id,
    jsonb_build_object(
      'demo_restaurant_id', v_restaurant_id,
      'shared_demo_restaurant', true,
      'roles', jsonb_build_array('client', 'commercial', 'restaurateur'),
      'template_version', 1
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'restaurant_id', v_restaurant_id,
    'restaurant_name', COALESCE(v_restaurant_name, 'Restaurant Démo TOK'),
    'roles', jsonb_build_array('client', 'commercial', 'restaurateur')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_commercial_demo_account(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_commercial_demo_account(uuid, text, text)
  TO authenticated, service_role;

-- The user detail RPC must not scan the complete Auth population.
CREATE INDEX IF NOT EXISTS audit_log_entity_id_created_at_idx
  ON public.audit_log (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_old_user_id_created_at_idx
  ON public.audit_log ((old_data ->> 'user_id'), created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_new_user_id_created_at_idx
  ON public.audit_log ((new_data ->> 'user_id'), created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_old_target_user_id_created_at_idx
  ON public.audit_log ((old_data ->> 'target_user_id'), created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_new_target_user_id_created_at_idx
  ON public.audit_log ((new_data ->> 'target_user_id'), created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_get_user_admin_detail(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_user jsonb;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'user_id', account.id,
    'full_name', COALESCE(
      NULLIF(trim(COALESCE(profile.full_name, '')), ''),
      NULLIF(trim(COALESCE(user_profile.first_name, '') || ' ' || COALESCE(user_profile.last_name, '')), ''),
      split_part(COALESCE(account.email, account.id::text), '@', 1)
    ),
    'email', account.email,
    'city', profile.city,
    'roles', COALESCE(roles_map.roles, ARRAY['client']::text[]),
    'created_at', account.created_at,
    'email_confirmed_at', account.email_confirmed_at,
    'account_status', COALESCE(account_state.status, 'active'),
    'application_status', latest_application.status,
    'courier_status', latest_courier.status,
    'anomalies', array_remove(ARRAY[
      CASE WHEN COALESCE(roles_map.role_count, 0) = 0 THEN 'user_without_role' END,
      CASE WHEN 'restaurateur' = ANY(COALESCE(roles_map.roles, ARRAY['client']::text[]))
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurants restaurant
          WHERE restaurant.owner_id = account.id
            AND restaurant.is_demo IS FALSE
        )
        THEN 'restaurateur_without_restaurant'
      END,
      CASE WHEN 'courier' = ANY(COALESCE(roles_map.roles, ARRAY['client']::text[]))
        AND latest_courier.status IS NULL
        THEN 'courier_without_profile'
      END,
      CASE WHEN account.email_confirmed_at IS NULL THEN 'email_unconfirmed' END,
      CASE WHEN COALESCE(account_state.status, 'active') = 'suspended' THEN 'account_suspended' END
    ]::text[], NULL)
  )
  INTO v_user
  FROM auth.users account
  LEFT JOIN public.profiles profile ON profile.user_id = account.id
  LEFT JOIN public.user_profiles user_profile ON user_profile.user_id = account.id
  LEFT JOIN public.admin_user_account_states account_state ON account_state.user_id = account.id
  LEFT JOIN LATERAL (
    SELECT
      array_agg(role_row.role::text ORDER BY role_row.role::text) AS roles,
      count(*) AS role_count
    FROM public.user_roles role_row
    WHERE role_row.user_id = account.id
  ) roles_map ON true
  LEFT JOIN LATERAL (
    SELECT application.status
    FROM public.signup_applications application
    WHERE application.user_id = account.id
    ORDER BY application.submitted_at DESC NULLS LAST, application.created_at DESC
    LIMIT 1
  ) latest_application ON true
  LEFT JOIN LATERAL (
    SELECT courier.status
    FROM public.couriers courier
    WHERE courier.user_id = account.id
    ORDER BY courier.updated_at DESC NULLS LAST, courier.created_at DESC
    LIMIT 1
  ) latest_courier ON true
  WHERE account.id = p_user_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'User not found.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'user', v_user,
    'orders_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE orders.status NOT IN ('delivered', 'cancelled', 'refunded')),
        'last_at', max(orders.created_at),
        'amount_chf', COALESCE(sum(orders.total_amount), 0)
      )
      FROM public.orders orders
      WHERE orders.user_id = p_user_id
    ),
    'reservations_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE reservations.status NOT IN ('completed', 'cancelled', 'no_show')),
        'last_at', max(reservations.created_at),
        'amount_chf', COALESCE(sum(reservations.total_amount), 0)
      )
      FROM public.reservations reservations
      WHERE reservations.user_id = p_user_id
    ),
    'incidents_summary', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE tickets.status NOT IN ('resolved', 'closed')),
        'critical', count(*) FILTER (WHERE tickets.priority IN ('critical', 'high')),
        'last_at', max(tickets.created_at)
      )
      FROM public.support_tickets tickets
      WHERE tickets.user_id = p_user_id
    ),
    'restaurants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', restaurant.id,
          'name', restaurant.name,
          'status', restaurant.status,
          'is_active', restaurant.is_active,
          'city', restaurant.city,
          'created_at', restaurant.created_at
        )
        ORDER BY restaurant.created_at DESC
      )
      FROM public.restaurants restaurant
      WHERE restaurant.owner_id = p_user_id
    ), '[]'::jsonb),
    'courier_profile', (
      SELECT to_jsonb(courier_row)
      FROM (
        SELECT courier.id, courier.status, courier.vehicle_type, courier.phone,
          courier.rating, courier.total_deliveries, courier.is_online, courier.updated_at
        FROM public.couriers courier
        WHERE courier.user_id = p_user_id
        ORDER BY courier.updated_at DESC NULLS LAST, courier.created_at DESC
        LIMIT 1
      ) courier_row
    ),
    'applications', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', application.id,
          'requested_role', application.requested_role,
          'status', application.status,
          'review_note', application.review_note,
          'submitted_at', application.submitted_at,
          'reviewed_at', application.reviewed_at,
          'documents', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', document.id,
                'document_type', document.document_type,
                'status', document.status,
                'reviewed_at', document.reviewed_at,
                'rejection_reason', document.rejection_reason
              )
              ORDER BY document.created_at ASC
            )
            FROM public.signup_application_documents document
            WHERE document.application_id = application.id
          ), '[]'::jsonb)
        )
        ORDER BY application.submitted_at DESC NULLS LAST, application.created_at DESC
      )
      FROM public.signup_applications application
      WHERE application.user_id = p_user_id
    ), '[]'::jsonb),
    'recent_history', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', history.id,
          'action', history.action,
          'entity_type', history.entity_type,
          'entity_id', history.entity_id,
          'old_data', history.old_data,
          'new_data', history.new_data,
          'created_at', history.created_at,
          'admin_id', history.user_id
        )
        ORDER BY history.created_at DESC
      )
      FROM (
        SELECT audit.*
        FROM public.audit_log audit
        WHERE audit.entity_id = p_user_id
          OR audit.old_data ->> 'user_id' = p_user_id::text
          OR audit.new_data ->> 'user_id' = p_user_id::text
          OR audit.old_data ->> 'target_user_id' = p_user_id::text
          OR audit.new_data ->> 'target_user_id' = p_user_id::text
        ORDER BY audit.created_at DESC
        LIMIT 25
      ) history
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_admin_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_admin_detail(uuid) TO authenticated, service_role;

-- Storage metadata is read-only from SQL. Edge Functions use this service-role
-- helper to discover objects, then delete the real files through the Storage API.
CREATE OR REPLACE FUNCTION public.admin_list_user_storage_objects_for_deletion(
  p_user_id uuid
)
RETURNS TABLE(bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT object.bucket_id, object.name
  FROM storage.objects object
  WHERE (storage.foldername(object.name))[1] = p_user_id::text
     OR object.owner = p_user_id
  ORDER BY object.bucket_id, object.name
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_storage_objects_for_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_user_storage_objects_for_deletion(uuid)
  TO service_role;

-- Supabase Storage explicitly forbids deleting storage.objects with SQL.
-- Keep the database cascade focused on relational/GDPR cleanup; callers must
-- remove the discovered Storage objects through the Storage API.
CREATE OR REPLACE FUNCTION public.delete_user_gdpr_cascade_unguarded(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_user_gdpr_cascade: user_id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users account WHERE account.id = p_user_id
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
    DELETE FROM public.event_store stored_event
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

  DELETE FROM auth.users account
  WHERE account.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_gdpr_cascade_unguarded(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_user_account(
  p_user_id uuid,
  p_confirmation_user_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_snapshot jsonb;
  v_target_is_admin boolean := false;
  v_remaining_admins integer := 0;
  v_active_restaurants integer := 0;
  v_demo_owner_id uuid;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.role() <> 'service_role'
    AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required.' USING ERRCODE = '22023';
  END IF;

  IF p_confirmation_user_id IS DISTINCT FROM p_user_id::text THEN
    RAISE EXCEPTION 'The confirmation does not match the user id.' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_reason) < 8 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason between 8 and 500 characters is required.' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' AND v_actor_id = p_user_id THEN
    RAISE EXCEPTION 'An administrator cannot delete their own account from the admin dashboard.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', account.id,
    'created_at', account.created_at,
    'roles', COALESCE((
      SELECT jsonb_agg(role_row.role ORDER BY role_row.role::text)
      FROM public.user_roles role_row
      WHERE role_row.user_id = account.id
    ), '[]'::jsonb)
  )
  INTO v_target_snapshot
  FROM auth.users account
  WHERE account.id = p_user_id;

  IF v_target_snapshot IS NULL THEN
    RAISE EXCEPTION 'User not found.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles role_row
    WHERE role_row.user_id = p_user_id
      AND role_row.role = 'admin'::public.app_role
  ) INTO v_target_is_admin;

  IF v_target_is_admin THEN
    SELECT COUNT(DISTINCT role_row.user_id)::integer
    INTO v_remaining_admins
    FROM public.user_roles role_row
    WHERE role_row.role = 'admin'::public.app_role
      AND role_row.user_id <> p_user_id;

    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'The last administrator account cannot be deleted.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_restaurants
  FROM public.restaurants restaurant
  WHERE restaurant.owner_id = p_user_id
    AND restaurant.is_demo IS FALSE
    AND (
      COALESCE(restaurant.is_active, false)
      OR lower(COALESCE(restaurant.status, '')) <> 'archived'
    );

  IF v_active_restaurants > 0 THEN
    RAISE EXCEPTION 'This user still owns % active restaurant(s). Reassign or delete them first.', v_active_restaurants
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurants restaurant
    WHERE restaurant.owner_id = p_user_id
      AND restaurant.is_demo IS TRUE
  ) THEN
    IF v_actor_id IS NOT NULL
       AND public.has_role(v_actor_id, 'admin'::public.app_role)
       AND v_actor_id IS DISTINCT FROM p_user_id THEN
      v_demo_owner_id := v_actor_id;
    ELSE
      SELECT role_row.user_id
      INTO v_demo_owner_id
      FROM public.user_roles role_row
      WHERE role_row.role = 'admin'::public.app_role
        AND role_row.user_id <> p_user_id
      ORDER BY role_row.user_id
      LIMIT 1;
    END IF;

    IF v_demo_owner_id IS NULL THEN
      RAISE EXCEPTION 'No administrator is available to retain technical ownership of demo restaurants.'
        USING ERRCODE = '23503';
    END IF;

    UPDATE public.restaurants
    SET owner_id = v_demo_owner_id,
        updated_at = now()
    WHERE owner_id = p_user_id
      AND is_demo IS TRUE;
  END IF;

  PERFORM public.delete_user_gdpr_cascade_unguarded(p_user_id);

  INSERT INTO public.audit_log (
    user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    v_actor_id,
    'delete_user_account',
    'user',
    p_user_id,
    v_target_snapshot,
    jsonb_build_object(
      'deleted', true,
      'deleted_at', now(),
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.admin_delete_user_account(uuid, text, text)
IS 'Permanently deletes a non-current user after real-restaurant safeguards. Demo technical ownership is reassigned and Storage is cleaned through the Edge Storage API.';

REVOKE ALL ON FUNCTION public.admin_delete_user_account(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(uuid, text, text)
  TO authenticated, service_role;

DO $$
DECLARE
  v_account_count integer;
  v_distinct_mapping_count integer;
  v_shared_restaurant_id uuid;
BEGIN
  SELECT count(*)::integer, count(DISTINCT account.demo_restaurant_id)::integer
  INTO v_account_count, v_distinct_mapping_count
  FROM public.commercial_demo_accounts account;

  SELECT shared.restaurant_id
  INTO v_shared_restaurant_id
  FROM public.commercial_demo_shared_restaurant shared
  WHERE shared.singleton;

  IF v_account_count > 0 THEN
    IF v_shared_restaurant_id IS NULL
       OR v_distinct_mapping_count <> 1
       OR EXISTS (
         SELECT 1
         FROM public.commercial_demo_accounts account
         WHERE account.demo_restaurant_id IS DISTINCT FROM v_shared_restaurant_id
       ) THEN
      RAISE EXCEPTION 'Commercial demo accounts were not consolidated onto the canonical shared restaurant'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.restaurants restaurant
      WHERE restaurant.id = v_shared_restaurant_id
        AND restaurant.is_demo IS TRUE
        AND COALESCE(restaurant.is_active, false) IS FALSE
        AND lower(COALESCE(restaurant.status, '')) = 'demo'
        AND restaurant.stripe_account_id IS NULL
        AND COALESCE(restaurant.stripe_connect_details_submitted, false) IS FALSE
        AND COALESCE(restaurant.stripe_connect_charges_enabled, false) IS FALSE
        AND COALESCE(restaurant.stripe_connect_payouts_enabled, false) IS FALSE
    ) THEN
      RAISE EXCEPTION 'Canonical commercial demo restaurant is not inert after migration'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
