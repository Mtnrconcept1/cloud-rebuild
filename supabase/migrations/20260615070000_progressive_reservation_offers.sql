-- Progressive reservation offers: the final discount grows with each booking
-- until the restaurateur-defined table limit or maximum discount is reached.

CREATE TABLE IF NOT EXISTS public.reservation_progressive_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Offre progressive',
  description text,
  service_date date NOT NULL,
  service_time time NOT NULL DEFAULT '19:00',
  countdown_starts_at timestamptz NOT NULL DEFAULT now(),
  countdown_ends_at timestamptz NOT NULL,
  booking_cutoff_at timestamptz NOT NULL,
  max_tables integer NOT NULL DEFAULT 10 CHECK (max_tables BETWEEN 1 AND 200),
  max_discount_percent numeric(5,2) NOT NULL DEFAULT 50 CHECK (max_discount_percent > 0 AND max_discount_percent <= 100),
  current_reservations_count integer NOT NULL DEFAULT 0 CHECK (current_reservations_count >= 0),
  final_discount_percent numeric(5,2),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finalized', 'cancelled', 'expired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (booking_cutoff_at <= countdown_ends_at)
);

CREATE INDEX IF NOT EXISTS idx_reservation_progressive_offers_public
  ON public.reservation_progressive_offers(status, booking_cutoff_at, service_date);

CREATE INDEX IF NOT EXISTS idx_reservation_progressive_offers_restaurant
  ON public.reservation_progressive_offers(restaurant_id, service_date DESC, created_at DESC);

ALTER TABLE public.reservation_progressive_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservation_progressive_offers_public_active_select"
  ON public.reservation_progressive_offers;
CREATE POLICY "reservation_progressive_offers_public_active_select"
  ON public.reservation_progressive_offers
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND booking_cutoff_at > now()
    AND current_reservations_count < max_tables
  );

DROP POLICY IF EXISTS "reservation_progressive_offers_owner_admin_write"
  ON public.reservation_progressive_offers;
CREATE POLICY "reservation_progressive_offers_owner_admin_write"
  ON public.reservation_progressive_offers
  FOR ALL
  TO authenticated
  USING (
    COALESCE(public.auth_owns_restaurant(restaurant_id), false)
    OR COALESCE(public.has_role(auth.uid(), 'admin'), false)
  )
  WITH CHECK (
    COALESCE(public.auth_owns_restaurant(restaurant_id), false)
    OR COALESCE(public.has_role(auth.uid(), 'admin'), false)
  );

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS progressive_offer_id uuid REFERENCES public.reservation_progressive_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progressive_offer_discount_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS progressive_offer_discount_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS progressive_offer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_progressive_offer_discount_status_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_progressive_offer_discount_status_check
  CHECK (progressive_offer_discount_status IN ('none', 'pending', 'finalized', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_reservations_progressive_offer
  ON public.reservations(progressive_offer_id)
  WHERE progressive_offer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.calculate_progressive_offer_discount(
  p_max_discount_percent numeric,
  p_max_tables integer,
  p_reservation_count integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(
    GREATEST(COALESCE(p_max_discount_percent, 0), 0),
    ROUND(
      (
        GREATEST(COALESCE(p_reservation_count, 0), 0)::numeric
        * GREATEST(COALESCE(p_max_discount_percent, 0), 0)
        / GREATEST(COALESCE(p_max_tables, 1), 1)
      )::numeric,
      2
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_progressive_offer_reservations(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.reservation_progressive_offers%ROWTYPE;
  v_count integer := 0;
  v_discount numeric(5,2) := 0;
  v_discount_status text := 'pending';
BEGIN
  IF p_offer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_offer
  FROM public.reservation_progressive_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.reservations r
  WHERE r.progressive_offer_id = p_offer_id
    AND r.status NOT IN ('cancelled', 'no_show', 'pending_payment');

  IF v_offer.status = 'finalized' THEN
    v_discount := COALESCE(v_offer.final_discount_percent, public.calculate_progressive_offer_discount(
      v_offer.max_discount_percent,
      v_offer.max_tables,
      v_count
    ));
    v_discount_status := 'finalized';
  ELSE
    v_discount := public.calculate_progressive_offer_discount(
      v_offer.max_discount_percent,
      v_offer.max_tables,
      v_count
    );
    v_discount_status := 'pending';
  END IF;

  UPDATE public.reservation_progressive_offers
  SET current_reservations_count = v_count,
      final_discount_percent = CASE WHEN status = 'finalized' THEN COALESCE(final_discount_percent, v_discount) ELSE final_discount_percent END,
      updated_at = now()
  WHERE id = p_offer_id;

  UPDATE public.reservations
  SET progressive_offer_discount_percent = v_discount,
      progressive_offer_discount_status = v_discount_status,
      progressive_offer_snapshot = COALESCE(progressive_offer_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'offer_id', v_offer.id,
          'title', v_offer.title,
          'max_tables', v_offer.max_tables,
          'max_discount_percent', v_offer.max_discount_percent,
          'current_reservations_count', v_count,
          'final_discount_percent', CASE WHEN v_discount_status = 'finalized' THEN v_discount ELSE NULL END,
          'discount_status', v_discount_status,
          'countdown_ends_at', v_offer.countdown_ends_at,
          'booking_cutoff_at', v_offer.booking_cutoff_at
        ),
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'progressive_offer_id', v_offer.id,
          'progressive_offer_name', v_offer.title,
          'progressive_offer_discount_percent', v_discount,
          'progressive_offer_discount_status', v_discount_status,
          'progressive_offer_tables_booked', v_count,
          'progressive_offer_max_tables', v_offer.max_tables
        ),
      updated_at = now()
  WHERE progressive_offer_id = p_offer_id
    AND status NOT IN ('cancelled', 'no_show', 'pending_payment');
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_progressive_offer_to_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.reservation_progressive_offers%ROWTYPE;
  v_count integer := 0;
  v_next_discount numeric(5,2);
BEGIN
  IF NEW.progressive_offer_id IS NULL THEN
    NEW.progressive_offer_discount_percent := NULL;
    NEW.progressive_offer_discount_status := 'none';
    NEW.progressive_offer_snapshot := '{}'::jsonb;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_offer
  FROM public.reservation_progressive_offers
  WHERE id = NEW.progressive_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offre progressive introuvable.';
  END IF;

  IF v_offer.restaurant_id <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Cette offre progressive ne correspond pas au restaurant.';
  END IF;

  IF NEW.date <> v_offer.service_date THEN
    RAISE EXCEPTION 'Cette offre progressive est disponible uniquement pour le %.', v_offer.service_date;
  END IF;

  IF v_offer.status <> 'active' THEN
    RAISE EXCEPTION 'Cette offre progressive n''est pas active.';
  END IF;

  IF now() > v_offer.booking_cutoff_at THEN
    RAISE EXCEPTION 'Les reservations de cette offre progressive sont closes.';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.reservations r
  WHERE r.progressive_offer_id = NEW.progressive_offer_id
    AND r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND r.status NOT IN ('cancelled', 'no_show', 'pending_payment');

  IF v_count >= v_offer.max_tables THEN
    RAISE EXCEPTION 'Toutes les tables de cette offre progressive sont deja reservees.';
  END IF;

  v_next_discount := public.calculate_progressive_offer_discount(
    v_offer.max_discount_percent,
    v_offer.max_tables,
    v_count + 1
  );

  NEW.feature := 'promo-progressive';
  NEW.progressive_offer_discount_percent := v_next_discount;
  NEW.progressive_offer_discount_status := 'pending';
  NEW.progressive_offer_snapshot := COALESCE(NEW.progressive_offer_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'offer_id', v_offer.id,
      'title', v_offer.title,
      'max_tables', v_offer.max_tables,
      'max_discount_percent', v_offer.max_discount_percent,
      'current_reservations_count', v_count + 1,
      'discount_status', 'pending',
      'countdown_ends_at', v_offer.countdown_ends_at,
      'booking_cutoff_at', v_offer.booking_cutoff_at
    );
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'progressive_offer_id', v_offer.id,
      'progressive_offer_name', v_offer.title,
      'progressive_offer_discount_percent', v_next_discount,
      'progressive_offer_discount_status', 'pending',
      'progressive_offer_tables_booked', v_count + 1,
      'progressive_offer_max_tables', v_offer.max_tables,
      'progressive_offer_countdown_ends_at', v_offer.countdown_ends_at,
      'progressive_offer_booking_cutoff_at', v_offer.booking_cutoff_at
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recount_progressive_offer_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_progressive_offer_reservations(OLD.progressive_offer_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.refresh_progressive_offer_reservations(NEW.progressive_offer_id);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_progressive_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.reservation_progressive_offers%ROWTYPE;
  v_count integer := 0;
  v_discount numeric(5,2) := 0;
BEGIN
  SELECT *
  INTO v_offer
  FROM public.reservation_progressive_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offre progressive introuvable.';
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false)
    AND NOT COALESCE(public.auth_owns_restaurant(v_offer.restaurant_id), false) THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.reservations r
  WHERE r.progressive_offer_id = p_offer_id
    AND r.status NOT IN ('cancelled', 'no_show', 'pending_payment');

  v_discount := public.calculate_progressive_offer_discount(
    v_offer.max_discount_percent,
    v_offer.max_tables,
    v_count
  );

  UPDATE public.reservation_progressive_offers
  SET status = 'finalized',
      current_reservations_count = v_count,
      final_discount_percent = v_discount,
      updated_at = now()
  WHERE id = p_offer_id;

  UPDATE public.reservations
  SET progressive_offer_discount_percent = v_discount,
      progressive_offer_discount_status = 'finalized',
      progressive_offer_snapshot = COALESCE(progressive_offer_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'final_discount_percent', v_discount,
          'discount_status', 'finalized',
          'finalized_at', now()
        ),
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'progressive_offer_discount_percent', v_discount,
          'progressive_offer_discount_status', 'finalized',
          'progressive_offer_finalized_at', now()
        ),
      updated_at = now()
  WHERE progressive_offer_id = p_offer_id
    AND status NOT IN ('cancelled', 'no_show', 'pending_payment');

  RETURN jsonb_build_object(
    'offer_id', p_offer_id,
    'reservations_count', v_count,
    'final_discount_percent', v_discount
  );
END;
$$;

DROP TRIGGER IF EXISTS reservations_progressive_offer_apply ON public.reservations;
CREATE OR REPLACE TRIGGER reservations_progressive_offer_apply
  BEFORE INSERT OR UPDATE OF progressive_offer_id
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_progressive_offer_to_reservation();

DROP TRIGGER IF EXISTS reservations_progressive_offer_recount ON public.reservations;
CREATE OR REPLACE TRIGGER reservations_progressive_offer_recount
  AFTER INSERT OR UPDATE OF progressive_offer_id, status OR DELETE
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.recount_progressive_offer_reservations();

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation_safe(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text,
  p_metadata jsonb,
  p_notes text,
  p_progressive_offer_id uuid
)
RETURNS TABLE (
  reservation_id uuid,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    reservation_id := public.validate_and_create_reservation(
      p_restaurant_id,
      p_date,
      p_time,
      p_party_size,
      CASE WHEN p_progressive_offer_id IS NOT NULL THEN 'promo-progressive' ELSE COALESCE(p_feature, 'classique') END,
      COALESCE(p_metadata, '{}'::jsonb),
      p_notes
    );

    IF p_progressive_offer_id IS NOT NULL THEN
      UPDATE public.reservations
      SET progressive_offer_id = p_progressive_offer_id,
          feature = 'promo-progressive',
          metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object('progressive_offer_id', p_progressive_offer_id)
      WHERE id = reservation_id;
    END IF;

    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      reservation_id := NULL;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_progressive_offer_discount(numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_progressive_offer_discount(numeric, integer, integer) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_progressive_offer_reservations(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() TO service_role;

REVOKE EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recount_progressive_offer_reservations() TO service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_progressive_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_progressive_offer(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
