-- Progressive offers are scoped to a service period, not to one exact slot.
-- Existing rows keep service_time as the anchor used to infer lunch/dinner.

CREATE OR REPLACE FUNCTION public.get_progressive_offer_service_key(p_time time)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN EXTRACT(HOUR FROM p_time) < 16 THEN 'lunch' ELSE 'dinner' END;
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
  v_offer_service text;
  v_reservation_service text;
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

REVOKE EXECUTE ON FUNCTION public.get_progressive_offer_service_key(time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_progressive_offer_service_key(time) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_progressive_offer_to_reservation() TO service_role;

NOTIFY pgrst, 'reload schema';
