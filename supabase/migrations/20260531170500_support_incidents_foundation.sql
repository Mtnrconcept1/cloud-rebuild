CREATE TABLE IF NOT EXISTS public.support_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL,
  description text,
  resolution text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_incidents_category_check CHECK (category IN (
    'general',
    'order_missing',
    'order_late',
    'wrong_item',
    'missing_item',
    'quality_issue',
    'refund_request',
    'payment_issue',
    'reservation_issue',
    'zero_attente_issue',
    'delivery_issue',
    'restaurant_issue',
    'technical_issue'
  )),
  CONSTRAINT support_incidents_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT support_incidents_status_check CHECK (status IN ('open', 'waiting_customer', 'waiting_restaurant', 'waiting_admin', 'resolved', 'closed')),
  CONSTRAINT support_incidents_target_check CHECK (order_id IS NOT NULL OR reservation_id IS NOT NULL OR restaurant_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.support_incident_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.support_incidents(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role text NOT NULL DEFAULT 'client',
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'public',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_incident_messages_author_role_check CHECK (author_role IN ('client', 'restaurateur', 'courier', 'admin', 'system')),
  CONSTRAINT support_incident_messages_visibility_check CHECK (visibility IN ('public', 'internal'))
);

CREATE INDEX IF NOT EXISTS support_incidents_user_created_idx
  ON public.support_incidents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_incidents_restaurant_status_idx
  ON public.support_incidents(restaurant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_incidents_order_idx
  ON public.support_incidents(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_incidents_reservation_idx
  ON public.support_incidents(reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_incidents_status_priority_idx
  ON public.support_incidents(status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS support_incident_messages_incident_created_idx
  ON public.support_incident_messages(incident_id, created_at ASC);

ALTER TABLE public.support_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_incident_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_support_incident(p_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.support_incidents si
      WHERE si.id = p_incident_id
        AND (
          si.user_id = auth.uid()
          OR si.opened_by = auth.uid()
          OR public.auth_owns_restaurant(si.restaurant_id)
        )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_support_incident_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolved_at = now();
  END IF;
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.closed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_support_incident_updated_at ON public.support_incidents;
CREATE TRIGGER touch_support_incident_updated_at
BEFORE UPDATE ON public.support_incidents
FOR EACH ROW
EXECUTE FUNCTION public.touch_support_incident_updated_at();

CREATE OR REPLACE FUNCTION public.touch_support_incident_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_incidents
  SET last_message_at = NEW.created_at,
      updated_at = now(),
      status = CASE
        WHEN NEW.author_role = 'client' AND status NOT IN ('resolved', 'closed') THEN 'waiting_admin'
        WHEN NEW.author_role = 'restaurateur' AND status NOT IN ('resolved', 'closed') THEN 'waiting_admin'
        WHEN NEW.author_role = 'admin' AND status NOT IN ('resolved', 'closed') THEN 'waiting_customer'
        ELSE status
      END
  WHERE id = NEW.incident_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_support_incident_last_message ON public.support_incident_messages;
CREATE TRIGGER touch_support_incident_last_message
AFTER INSERT ON public.support_incident_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_support_incident_last_message();

CREATE POLICY "support_incidents_select_related"
  ON public.support_incidents
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR user_id = auth.uid()
    OR opened_by = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

CREATE POLICY "support_incidents_insert_customer"
  ON public.support_incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND (
      user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.auth_owns_restaurant(restaurant_id)
    )
  );

CREATE POLICY "support_incidents_update_related"
  ON public.support_incidents
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR opened_by = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR opened_by = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
  );

CREATE POLICY "support_messages_select_related"
  ON public.support_incident_messages
  FOR SELECT
  TO authenticated
  USING (
    public.user_can_access_support_incident(incident_id)
    AND (
      visibility = 'public'
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.support_incidents si
        WHERE si.id = support_incident_messages.incident_id
          AND public.auth_owns_restaurant(si.restaurant_id)
      )
    )
  );

CREATE POLICY "support_messages_insert_related"
  ON public.support_incident_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_support_incident(incident_id)
    AND author_id = auth.uid()
    AND (
      visibility = 'public'
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.support_incidents si
        WHERE si.id = support_incident_messages.incident_id
          AND public.auth_owns_restaurant(si.restaurant_id)
      )
    )
  );

CREATE OR REPLACE FUNCTION public.create_support_incident(
  p_category text,
  p_subject text,
  p_description text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_restaurant_id uuid := p_restaurant_id;
  v_order_user_id uuid;
  v_reservation_user_id uuid;
  v_incident_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT o.user_id, o.restaurant_id
    INTO v_order_user_id, v_restaurant_id
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF v_order_user_id IS NULL THEN
      RAISE EXCEPTION 'Commande introuvable';
    END IF;

    IF v_order_user_id IS DISTINCT FROM v_user_id AND NOT public.has_role(v_user_id, 'admin') AND NOT public.auth_owns_restaurant(v_restaurant_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT r.user_id, r.restaurant_id
    INTO v_reservation_user_id, v_restaurant_id
    FROM public.reservations r
    WHERE r.id = p_reservation_id;

    IF v_reservation_user_id IS NULL THEN
      RAISE EXCEPTION 'Reservation introuvable';
    END IF;

    IF v_reservation_user_id IS DISTINCT FROM v_user_id AND NOT public.has_role(v_user_id, 'admin') AND NOT public.auth_owns_restaurant(v_restaurant_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant requis';
  END IF;

  INSERT INTO public.support_incidents (
    user_id,
    restaurant_id,
    order_id,
    reservation_id,
    opened_by,
    category,
    priority,
    subject,
    description,
    metadata,
    last_message_at
  )
  VALUES (
    COALESCE(v_order_user_id, v_reservation_user_id, v_user_id),
    v_restaurant_id,
    p_order_id,
    p_reservation_id,
    v_user_id,
    COALESCE(NULLIF(p_category, ''), 'general'),
    COALESCE(NULLIF(p_priority, ''), 'normal'),
    LEFT(COALESCE(NULLIF(p_subject, ''), 'Nouvel incident'), 180),
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_incident_id;

  IF COALESCE(NULLIF(p_description, ''), '') <> '' THEN
    INSERT INTO public.support_incident_messages (
      incident_id,
      author_id,
      author_role,
      body,
      visibility
    )
    VALUES (
      v_incident_id,
      v_user_id,
      CASE
        WHEN public.has_role(v_user_id, 'admin') THEN 'admin'
        WHEN public.auth_owns_restaurant(v_restaurant_id) THEN 'restaurateur'
        ELSE 'client'
      END,
      p_description,
      'public'
    );
  END IF;

  RETURN v_incident_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_support_incident(text, text, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_incident(text, text, text, uuid, uuid, uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
