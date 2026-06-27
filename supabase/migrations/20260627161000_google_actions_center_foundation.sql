-- Google Actions Center / Reserve with Google foundation.
-- This migration does not publish TOK as a Google partner by itself; it adds
-- the local persistence needed by the Google Booking Server integration and
-- makes Google Business Profile links point at the canonical reservation URL.

CREATE TABLE IF NOT EXISTS public.google_actions_center_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_booking_id text NOT NULL,
  idempotency_token text,
  request_hash text NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'confirmed',
  source_environment text NOT NULL DEFAULT 'production',
  user_information jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('confirmed', 'pending', 'cancelled', 'canceled', 'no_show', 'failed')),
  CHECK (source_environment IN ('sandbox', 'production'))
);

CREATE UNIQUE INDEX IF NOT EXISTS google_actions_center_bookings_google_id_idx
  ON public.google_actions_center_bookings (google_booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS google_actions_center_bookings_idempotency_idx
  ON public.google_actions_center_bookings (idempotency_token)
  WHERE idempotency_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS google_actions_center_bookings_user_id_idx
  ON public.google_actions_center_bookings ((user_information ->> 'user_id'), created_at DESC)
  WHERE user_information ? 'user_id';

CREATE INDEX IF NOT EXISTS google_actions_center_bookings_restaurant_created_idx
  ON public.google_actions_center_bookings (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS google_actions_center_bookings_reservation_idx
  ON public.google_actions_center_bookings (reservation_id)
  WHERE reservation_id IS NOT NULL;

ALTER TABLE public.google_actions_center_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_actions_center_bookings_service_role_all"
  ON public.google_actions_center_bookings;

CREATE POLICY "google_actions_center_bookings_service_role_all"
  ON public.google_actions_center_bookings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.google_actions_center_bookings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_actions_center_bookings TO service_role;

DROP TRIGGER IF EXISTS set_updated_at_google_actions_center_bookings
  ON public.google_actions_center_bookings;

CREATE TRIGGER set_updated_at_google_actions_center_bookings
  BEFORE UPDATE ON public.google_actions_center_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_restaurant_google_booking_setup(p_restaurant_id uuid)
RETURNS public.restaurant_google_booking_setup
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.restaurant_google_booking_setup%ROWTYPE;
  v_restaurant record;
  v_base_slug text;
  v_candidate text;
  v_suffix integer := 1;
BEGIN
  SELECT id, name, slug
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF v_restaurant.id IS NULL THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.restaurant_google_booking_setup
  WHERE restaurant_id = p_restaurant_id;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  v_base_slug := NULLIF(public.tok_slugify(COALESCE(v_restaurant.slug, v_restaurant.name)), '');
  IF v_base_slug IS NULL THEN
    v_base_slug := 'restaurant-' || left(p_restaurant_id::text, 8);
  END IF;

  v_candidate := v_base_slug;
  WHILE EXISTS (
    SELECT 1
    FROM public.restaurant_google_booking_setup
    WHERE booking_slug = v_candidate
  ) LOOP
    IF v_suffix = 1 THEN
      v_candidate := v_base_slug || '-' || left(p_restaurant_id::text, 8);
    ELSE
      v_candidate := v_base_slug || '-' || left(p_restaurant_id::text, 8) || '-' || v_suffix::text;
    END IF;
    v_suffix := v_suffix + 1;
  END LOOP;

  INSERT INTO public.restaurant_google_booking_setup (
    restaurant_id,
    booking_slug,
    tok_booking_url
  )
  VALUES (
    p_restaurant_id,
    v_candidate,
    'https://www.thetok.ch/r/' || v_candidate || '/reserver'
  )
  ON CONFLICT (restaurant_id) DO UPDATE
  SET updated_at = public.restaurant_google_booking_setup.updated_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

UPDATE public.restaurant_google_booking_setup
SET tok_booking_url = 'https://www.thetok.ch/r/' || booking_slug || '/reserver'
WHERE tok_booking_url IS DISTINCT FROM 'https://www.thetok.ch/r/' || booking_slug || '/reserver';

REVOKE ALL ON FUNCTION public.ensure_restaurant_google_booking_setup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_restaurant_google_booking_setup(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
