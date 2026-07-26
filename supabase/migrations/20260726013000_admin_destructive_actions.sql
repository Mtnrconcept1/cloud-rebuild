-- Secured destructive actions exposed from the administration dashboard.
-- User accounts are deleted through the existing GDPR cascade.
-- Restaurants are operationally deleted (archived) so immutable financial,
-- reservation and order history remains available for legal/accounting duties.

CREATE OR REPLACE FUNCTION public.admin_delete_user_account(
  p_user_id uuid,
  p_confirmation_user_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'storage'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_snapshot jsonb;
  v_target_is_admin boolean := false;
  v_remaining_admins integer := 0;
  v_active_restaurants integer := 0;
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
  )
  INTO v_target_is_admin;

  IF v_target_is_admin THEN
    SELECT COUNT(DISTINCT role_row.user_id)::integer
    INTO v_remaining_admins
    FROM public.user_roles role_row
    WHERE role_row.role = 'admin'::public.app_role
      AND role_row.user_id <> p_user_id;

    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'The last administrator account cannot be deleted.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_restaurants
  FROM public.restaurants restaurant
  WHERE restaurant.owner_id = p_user_id
    AND (
      COALESCE(restaurant.is_active, false)
      OR lower(COALESCE(restaurant.status, '')) <> 'archived'
    );

  IF v_active_restaurants > 0 THEN
    RAISE EXCEPTION 'This user still owns % active restaurant(s). Reassign or delete them first.', v_active_restaurants
      USING ERRCODE = '23503';
  END IF;

  PERFORM public.delete_user_gdpr_cascade_unguarded(p_user_id);

  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
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
$function$;

COMMENT ON FUNCTION public.admin_delete_user_account(uuid, text, text)
IS 'Permanently deletes a non-current user through the GDPR cascade. Admin-only, confirmed and audited.';

REVOKE ALL ON FUNCTION public.admin_delete_user_account(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_account(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_restaurant(
  p_restaurant_id uuid,
  p_confirmation_restaurant_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_restaurant public.restaurants%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_old_snapshot jsonb;
BEGIN
  IF auth.role() <> 'service_role'
    AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant id is required.' USING ERRCODE = '22023';
  END IF;

  IF p_confirmation_restaurant_id IS DISTINCT FROM p_restaurant_id::text THEN
    RAISE EXCEPTION 'The confirmation does not match the restaurant id.' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_reason) < 8 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason between 8 and 500 characters is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants restaurant
  WHERE restaurant.id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = '22023';
  END IF;

  IF v_restaurant.is_demo THEN
    RAISE EXCEPTION 'Demo restaurants must be managed from the dedicated demo entity manager.'
      USING ERRCODE = '42501';
  END IF;

  v_old_snapshot := jsonb_build_object(
    'id', v_restaurant.id,
    'name', v_restaurant.name,
    'owner_id', v_restaurant.owner_id,
    'status', v_restaurant.status,
    'is_active', v_restaurant.is_active,
    'slug', v_restaurant.slug
  );

  UPDATE public.restaurants
  SET is_active = false,
      is_featured = false,
      status = 'archived',
      delivery_available = false,
      supports_pickup = false,
      supports_dinein = false,
      supports_reservation = false,
      supports_scheduled = false,
      supports_scheduled_orders = false,
      supports_group_orders = false,
      slug = NULL,
      updated_at = now()
  WHERE id = p_restaurant_id;

  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_actor_id,
    'delete_restaurant',
    'restaurant',
    p_restaurant_id,
    v_old_snapshot,
    jsonb_build_object(
      'id', p_restaurant_id,
      'name', v_restaurant.name,
      'status', 'archived',
      'is_active', false,
      'deleted_from_platform', true,
      'deleted_at', now(),
      'reason', v_reason,
      'retention_mode', 'legal_and_financial_history_preserved'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'restaurant_id', p_restaurant_id,
    'restaurant_name', v_restaurant.name,
    'mode', 'archived',
    'deleted_at', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_delete_restaurant(uuid, text, text)
IS 'Operationally deletes a real restaurant by archiving it while preserving legal and financial history. Admin-only, confirmed and audited.';

REVOKE ALL ON FUNCTION public.admin_delete_restaurant(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_restaurant(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_restaurant(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_restaurant(uuid, text, text) TO service_role;
