-- Golden TOK accreditation: application, review and paid, restaurant-scoped publishing.
-- Rollout: deploy this migration BEFORE the frontend and Edge Function.
CREATE TABLE IF NOT EXISTS public.golden_tok_accreditations (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES auth.users(id),
  application_note text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  review_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_subscription_id text UNIQUE,
  stripe_mode text CHECK (stripe_mode IS NULL OR stripe_mode IN ('live', 'test')),
  subscription_status text NOT NULL DEFAULT 'not_subscribed'
    CHECK (subscription_status IN ('not_subscribed', 'incomplete', 'incomplete_expired',
      'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  checkout_lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_tok_application_note_length CHECK (char_length(application_note) BETWEEN 20 AND 2000)
);

CREATE INDEX IF NOT EXISTS golden_tok_accreditations_review_idx
  ON public.golden_tok_accreditations (status, created_at DESC);

ALTER TABLE public.golden_tok_accreditations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golden_tok_accreditations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golden_tok_accreditations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golden_tok_accreditations TO service_role;

DROP POLICY IF EXISTS golden_tok_accreditations_owner_or_admin_read ON public.golden_tok_accreditations;
CREATE POLICY golden_tok_accreditations_owner_or_admin_read
  ON public.golden_tok_accreditations FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin());

CREATE OR REPLACE FUNCTION public.apply_golden_tok_accreditation(
  p_restaurant_id uuid, p_application_note text
)
RETURNS public.golden_tok_accreditations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_note text := trim(coalesce(p_application_note, ''));
  v_restaurant public.restaurants%ROWTYPE;
  v_existing public.golden_tok_accreditations%ROWTYPE;
  v_row public.golden_tok_accreditations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Accès restaurant refusé';
  END IF;
  SELECT * INTO v_restaurant FROM public.restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND OR NOT v_restaurant.is_active OR v_restaurant.is_demo THEN
    RAISE EXCEPTION 'Restaurant réel et actif requis';
  END IF;
  IF length(v_note) < 20 OR length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Décrivez votre établissement en 20 à 2000 caractères';
  END IF;

  SELECT * INTO v_existing
    FROM public.golden_tok_accreditations WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF FOUND AND v_existing.status <> 'rejected' THEN
    RAISE EXCEPTION 'Une candidature existe déjà';
  END IF;
  IF FOUND AND v_existing.stripe_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'Contactez TOK pour réévaluer un abonnement existant';
  END IF;

  INSERT INTO public.golden_tok_accreditations (
    restaurant_id, applicant_id, application_note, status
  ) VALUES (p_restaurant_id, auth.uid(), v_note, 'pending')
  ON CONFLICT (restaurant_id) DO UPDATE
  SET applicant_id = EXCLUDED.applicant_id,
      application_note = EXCLUDED.application_note,
      status = 'pending', review_reason = NULL, reviewed_by = NULL, reviewed_at = NULL,
      updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'golden_tok_apply', 'golden_tok_accreditation', p_restaurant_id,
    CASE WHEN v_existing.restaurant_id IS NULL THEN NULL ELSE to_jsonb(v_existing) END,
    jsonb_build_object('status','pending','restaurant_id',p_restaurant_id));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_golden_tok_accreditation(
  p_restaurant_id uuid, p_approve boolean, p_reason text
)
RETURNS public.golden_tok_accreditations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reason text := trim(coalesce(p_reason, ''));
  v_old public.golden_tok_accreditations%ROWTYPE;
  v_row public.golden_tok_accreditations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  IF length(v_reason) < 6 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motif de 6 à 1000 caractères requis';
  END IF;

  SELECT * INTO v_old FROM public.golden_tok_accreditations
  WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND OR v_old.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Aucune candidature révisable';
  END IF;
  IF v_old.stripe_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un abonnement existe; ne modifiez pas cet agrément ici';
  END IF;

  UPDATE public.golden_tok_accreditations
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      review_reason = v_reason, reviewed_by = auth.uid(),
      reviewed_at = now(), updated_at = now()
  WHERE restaurant_id = p_restaurant_id RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'admin_golden_tok_review', 'golden_tok_accreditation', p_restaurant_id,
    to_jsonb(v_old), jsonb_build_object('status',v_row.status,'reason',v_reason));
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_golden_tok_accreditation(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_golden_tok_accreditation(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_golden_tok_accreditation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_golden_tok_accreditation(uuid,boolean,text) TO authenticated;

-- A narrow SECURITY DEFINER boolean helper is necessary because unauthenticated
-- customers must be able to see entitled offers without SELECT access to
-- applicant and billing identifiers in the accreditation table.
CREATE OR REPLACE FUNCTION public.golden_tok_restaurant_is_paid(p_restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $
  SELECT EXISTS (
    SELECT 1 FROM public.golden_tok_accreditations a
    WHERE a.restaurant_id = p_restaurant_id
      AND a.status = 'approved'
      AND a.subscription_status = 'active'
      AND a.stripe_mode = 'live'
      AND a.current_period_end > now()
  );
$;
REVOKE ALL ON FUNCTION public.golden_tok_restaurant_is_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_tok_restaurant_is_paid(uuid) TO anon, authenticated, service_role;

-- Admin-created offers keep their existing behavior; self-published offers
-- must cease to be publicly bookable when the paid entitlement expires.
ALTER TABLE public.chef_table_drops
  ADD COLUMN IF NOT EXISTS golden_tok_self_published boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS chef_table_drops_public_select ON public.chef_table_drops;
CREATE POLICY chef_table_drops_public_select ON public.chef_table_drops
FOR SELECT USING (
  public.auth_is_admin()
  OR public.auth_owns_restaurant(restaurant_id)
  OR (
    is_active = true AND archived_at IS NULL AND (
      golden_tok_self_published = false
      OR public.golden_tok_restaurant_is_paid(restaurant_id)
    )
  )
);

-- This SECURITY DEFINER RPC is the ONLY restaurateur write path.
-- Do not grant direct INSERT/UPDATE/DELETE to authenticated users.
CREATE OR REPLACE FUNCTION public.restaurant_save_golden_tok_drop(
  p_restaurant_id uuid, p_drop_id uuid, p_payload jsonb
)
RETURNS public.chef_table_drops
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.chef_table_drops%ROWTYPE;
  v_old public.chef_table_drops%ROWTYPE;
  v_chef text := trim(coalesce(p_payload->>'chef_name',''));
  v_dish text := trim(coalesce(p_payload->>'dish_name',''));
  v_description text := nullif(trim(coalesce(p_payload->>'description','')),'');
  v_image text := nullif(trim(coalesce(p_payload->>'image_url','')),'');
  v_price numeric;
  v_original_price numeric;
  v_portions integer;
  v_time timestamptz;
  v_vip boolean;
  v_miamz integer;
  v_storage_path text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Accès restaurant refusé';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    JOIN public.golden_tok_accreditations a ON a.restaurant_id = r.id
    WHERE r.id = p_restaurant_id AND r.is_active = true AND r.is_demo = false
      AND a.status = 'approved' AND a.subscription_status = 'active'
      AND a.stripe_mode = 'live' AND a.current_period_end > now()
  ) THEN
    RAISE EXCEPTION 'Agrément et abonnement La Tok d’Or actif requis';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Données de la formule invalides';
  END IF;
  IF length(v_chef) < 2 OR length(v_chef) > 150 OR length(v_dish) < 2 OR length(v_dish) > 200
      OR length(coalesce(v_description,'')) > 3000 THEN
    RAISE EXCEPTION 'Chef, plat ou description invalides';
  END IF;

  v_price := nullif(p_payload->>'price','')::numeric;
  v_original_price := nullif(p_payload->>'original_price','')::numeric;
  v_portions := nullif(p_payload->>'total_portions','')::integer;
  v_time := nullif(p_payload->>'drop_time','')::timestamptz;
  v_vip := coalesce((p_payload->>'is_vip')::boolean, false);
  v_miamz := CASE WHEN v_vip THEN
    greatest(1,coalesce(nullif(p_payload->>'required_miamz_points','')::integer,5000))
    ELSE 0 END;

  IF v_price IS NULL OR v_price <= 0 OR v_price > 100000
    OR (v_original_price IS NOT NULL AND (v_original_price <= 0 OR v_original_price > 100000))
    OR v_portions IS NULL OR v_portions < 1 OR v_portions > 2000
    OR v_time IS NULL OR v_time < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Prix, portions ou date invalides';
  END IF;

  IF v_image IS NOT NULL THEN
    IF v_image !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/restaurant-images/' THEN
      RAISE EXCEPTION 'Image TOK publique uniquement';
    END IF;
    v_storage_path := split_part(v_image, '/storage/v1/object/public/restaurant-images/', 2);
    IF v_storage_path NOT LIKE p_restaurant_id::text || '/%'
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = 'restaurant-images' AND o.name = v_storage_path) THEN
      RAISE EXCEPTION 'Image absente du dossier de ce restaurant';
    END IF;
  END IF;

  IF p_drop_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.chef_table_drops
    WHERE id = p_drop_id FOR UPDATE;
    IF NOT FOUND OR v_old.restaurant_id <> p_restaurant_id OR NOT v_old.golden_tok_self_published
      OR v_old.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Formule introuvable ou non modifiable';
    END IF;
    IF v_old.total_portions > v_old.remaining_portions THEN
      RAISE EXCEPTION 'Formule déjà réservée; contactez TOK pour la modifier';
    END IF;
    UPDATE public.chef_table_drops SET
      chef_name = v_chef, dish_name = v_dish, description = v_description,
      image_url = v_image, price = v_price, original_price = v_original_price,
      total_portions = v_portions, remaining_portions = v_portions,
      drop_time = v_time, is_active = coalesce((p_payload->>'is_active')::boolean, true),
      is_vip = v_vip, required_miamz_points = v_miamz, updated_at = now()
    WHERE id = p_drop_id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.chef_table_drops (
      restaurant_id, chef_name, dish_name, description, image_url,
      price, original_price, total_portions, remaining_portions,
      drop_time, is_active, is_vip, required_miamz_points, golden_tok_self_published
    ) VALUES (
      p_restaurant_id, v_chef, v_dish, v_description, v_image,
      v_price, v_original_price, v_portions, v_portions,
      v_time, coalesce((p_payload->>'is_active')::boolean, true),
      v_vip, v_miamz, true
    ) RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(),
    CASE WHEN p_drop_id IS NULL THEN 'restaurant_golden_tok_drop_create'
      ELSE 'restaurant_golden_tok_drop_update' END,
    'chef_table_drop', v_row.id,
    CASE WHEN p_drop_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    to_jsonb(v_row));
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_save_golden_tok_drop(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_golden_tok_drop(uuid,uuid,jsonb) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chef_table_drops FROM authenticated;
NOTIFY pgrst, 'reload schema';
