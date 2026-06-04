CREATE TABLE IF NOT EXISTS public.chef_table_checkout_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drop_id uuid NOT NULL REFERENCES public.chef_table_drops(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'consumed', 'released')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '35 minutes'),
  consumed_at timestamptz,
  released_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_session_id, drop_id)
);

ALTER TABLE public.chef_table_checkout_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chef_table_checkout_holds_service_role" ON public.chef_table_checkout_holds;
CREATE POLICY "chef_table_checkout_holds_service_role"
  ON public.chef_table_checkout_holds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS chef_table_checkout_holds_session_idx
  ON public.chef_table_checkout_holds (checkout_session_id, status);

CREATE OR REPLACE FUNCTION public.create_chef_table_checkout_hold(
  p_session_id text,
  p_user_id uuid,
  p_items jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_drop_id uuid;
  v_quantity integer;
  v_created integer := 0;
  v_existing_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_session_id IS NULL OR trim(p_session_id) = '' THEN
    RAISE EXCEPTION 'checkout_session_id requis.';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Aucun drop La Table du Chef a reserver.';
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.chef_table_checkout_holds
  WHERE checkout_session_id = p_session_id;

  IF v_existing_count > 0 THEN
    RETURN v_existing_count;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_drop_id := NULLIF(trim(COALESCE(v_item ->> 'drop_id', v_item ->> 'dropId', '')), '')::uuid;
    v_quantity := GREATEST(COALESCE(NULLIF(v_item ->> 'quantity', '')::integer, 1), 1);

    PERFORM pg_advisory_xact_lock(hashtext('chef-table-hold:' || v_drop_id::text));

    UPDATE public.chef_table_drops
    SET remaining_portions = remaining_portions - v_quantity,
        updated_at = now()
    WHERE id = v_drop_id
      AND COALESCE(is_active, false)
      AND remaining_portions >= v_quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Certaines experiences La Table du Chef ne sont plus disponibles.';
    END IF;

    INSERT INTO public.chef_table_checkout_holds (
      checkout_session_id,
      user_id,
      drop_id,
      quantity,
      status,
      metadata
    )
    VALUES (
      p_session_id,
      p_user_id,
      v_drop_id,
      v_quantity,
      'held',
      COALESCE(p_metadata, '{}'::jsonb)
    );

    v_created := v_created + 1;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, new_data)
  VALUES (
    p_user_id,
    'create_chef_table_checkout_hold',
    'chef_table_checkout_hold',
    NULL,
    jsonb_build_object('checkout_session_id', p_session_id, 'items_count', v_created)
  );

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_chef_table_checkout_hold(
  p_session_id text,
  p_drop_id uuid,
  p_quantity integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT id INTO v_hold_id
  FROM public.chef_table_checkout_holds
  WHERE checkout_session_id = p_session_id
    AND drop_id = p_drop_id
    AND quantity >= GREATEST(p_quantity, 1)
    AND status = 'held'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.chef_table_checkout_holds
  SET status = 'consumed',
      consumed_at = now(),
      updated_at = now()
  WHERE id = v_hold_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_chef_table_checkout_hold(
  p_session_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.chef_table_checkout_holds%ROWTYPE;
  v_released integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  FOR v_hold IN
    SELECT *
    FROM public.chef_table_checkout_holds
    WHERE checkout_session_id = p_session_id
      AND status = 'held'
    FOR UPDATE
  LOOP
    UPDATE public.chef_table_drops
    SET remaining_portions = remaining_portions + v_hold.quantity,
        updated_at = now()
    WHERE id = v_hold.drop_id;

    UPDATE public.chef_table_checkout_holds
    SET status = 'released',
        released_at = now(),
        updated_at = now()
    WHERE id = v_hold.id;

    v_released := v_released + 1;
  END LOOP;

  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.create_chef_table_checkout_hold(text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_chef_table_checkout_hold(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_chef_table_checkout_hold(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_chef_table_checkout_hold(text, uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_chef_table_checkout_hold(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_chef_table_checkout_hold(text) TO service_role;

NOTIFY pgrst, 'reload schema';
