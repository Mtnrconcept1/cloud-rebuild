-- Prevent clients from cancelling and re-registering for the same progressive offer/day.

CREATE INDEX IF NOT EXISTS idx_reservations_progressive_offer_cancelled_reentry
  ON public.reservations(user_id, restaurant_id, date, progressive_offer_id)
  WHERE progressive_offer_id IS NOT NULL
    AND status IN ('cancelled', 'canceled');

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
  v_offer_service text;
  v_reservation_service text;
  v_cancelled_statuses constant text[] := ARRAY['cancelled', 'canceled'];
  v_blocking_reservation_id uuid;
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

  v_offer_service := public.get_progressive_offer_service_key(v_offer.service_time);
  v_reservation_service := public.get_progressive_offer_service_key(NEW.time);

  IF v_reservation_service <> v_offer_service THEN
    RAISE EXCEPTION 'Cette offre progressive est disponible uniquement pour le service %.', v_offer_service;
  END IF;

  IF v_offer.status <> 'active' THEN
    RAISE EXCEPTION 'Cette offre progressive n''est pas active.';
  END IF;

  IF now() > v_offer.booking_cutoff_at THEN
    RAISE EXCEPTION 'Les reservations de cette offre progressive sont closes.';
  END IF;

  SELECT r.id
  INTO v_blocking_reservation_id
  FROM public.reservations r
  WHERE r.user_id = NEW.user_id
    AND r.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND r.progressive_offer_id IS NOT NULL
    AND lower(COALESCE(r.status, '')) = ANY (v_cancelled_statuses)
    AND COALESCE(r.cancelled_by, 'customer') = 'customer'
    AND (
      r.progressive_offer_id = NEW.progressive_offer_id
      OR (
        r.restaurant_id = NEW.restaurant_id
        AND r.date = v_offer.service_date
      )
    )
  ORDER BY COALESCE(r.cancelled_at, r.updated_at, r.created_at) DESC NULLS LAST
  LIMIT 1;

  IF v_blocking_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'progressive_offer_reentry_blocked'
      USING
        ERRCODE = 'P0001',
        DETAIL = 'A customer cannot re-register after cancelling the same progressive offer/day.';
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
      'service', v_offer_service,
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
      'progressive_offer_service', v_offer_service,
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
      error_code := CASE
        WHEN SQLERRM = 'progressive_offer_reentry_blocked' THEN 'progressive_offer_reentry_blocked'
        ELSE 'validation_error'
      END;
      error_message := CASE
        WHEN SQLERRM = 'progressive_offer_reentry_blocked'
          THEN 'Vous vous etes deja desinscrit de cette offre progressive pour ce jour. Vous ne pouvez pas vous reinscrire.'
        ELSE SQLERRM
      END;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation_safe(uuid, date, time, integer, text, jsonb, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
