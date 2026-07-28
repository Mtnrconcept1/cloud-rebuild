-- Outbox for real-time updates pushed to Google Actions Center.
--
-- The integration was purely passive: it answered when Google polled but never
-- signalled anything back. A slot sold through another channel therefore stayed
-- bookable on Google until the next feed, and the failure surfaced when the
-- guest arrived.
--
-- Writing the intent to notify inside the same transaction as the reservation
-- change is what makes this reliable: a notification cannot be lost because the
-- HTTP call failed, and a reservation cannot be silently un-notified. Delivery
-- is a separate, retryable concern handled by the sync worker.
--
-- Additive migration: new table, new function, new trigger. No existing object
-- is altered or dropped.

CREATE TABLE IF NOT EXISTS public.google_actions_center_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- "availability" replaces the bookable slots of one merchant for one day.
  -- "booking" reports a status transition on a Google-originated reservation.
  kind text NOT NULL CHECK (kind IN ('availability', 'booking')),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid,
  -- Day covered by an availability replacement; null for booking notifications.
  availability_date date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'abandoned')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- The worker only ever scans for due work, so the index is deliberately partial.
CREATE INDEX IF NOT EXISTS idx_google_actions_center_outbox_due
  ON public.google_actions_center_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_google_actions_center_outbox_recent
  ON public.google_actions_center_outbox (restaurant_id, created_at DESC);

-- One pending availability push per merchant and day: a busy service would
-- otherwise queue dozens of identical replacements for the same date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_actions_center_outbox_pending_day
  ON public.google_actions_center_outbox (restaurant_id, availability_date)
  WHERE status = 'pending' AND kind = 'availability';

ALTER TABLE public.google_actions_center_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.google_actions_center_outbox FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.google_actions_center_outbox TO service_role;

DROP POLICY IF EXISTS "google_actions_center_outbox_admin_read"
  ON public.google_actions_center_outbox;
CREATE POLICY "google_actions_center_outbox_admin_read"
  ON public.google_actions_center_outbox
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

/**
 * Queues the notifications implied by a reservation change.
 *
 * Runs inside the reservation's own transaction, so the queue can never
 * disagree with what was actually booked. It stays deliberately cheap: it
 * writes rows and performs no I/O, because a slow trigger here would slow every
 * reservation in the product, not just Google's.
 */
CREATE OR REPLACE FUNCTION public.enqueue_google_actions_center_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  v_date date := COALESCE(NEW.date, OLD.date);
  v_is_google boolean;
BEGIN
  IF v_restaurant_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Availability changed for that merchant and day, whoever made the booking:
  -- a slot taken through TOK must disappear from Google just as fast as one
  -- taken through Google.
  IF v_date IS NOT NULL THEN
    INSERT INTO public.google_actions_center_outbox (kind, restaurant_id, availability_date, payload)
    VALUES (
      'availability',
      v_restaurant_id,
      v_date,
      jsonb_build_object('restaurant_id', v_restaurant_id, 'date', v_date)
    )
    ON CONFLICT (restaurant_id, availability_date)
      WHERE status = 'pending' AND kind = 'availability'
    DO NOTHING;
  END IF;

  -- A booking notification only makes sense for a reservation Google knows
  -- about; reporting a purely internal booking would be noise Google rejects.
  SELECT EXISTS (
    SELECT 1 FROM public.google_actions_center_bookings b
    WHERE b.reservation_id = COALESCE(NEW.id, OLD.id)
  ) INTO v_is_google;

  IF v_is_google AND TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.google_actions_center_outbox (kind, restaurant_id, reservation_id, payload)
    VALUES (
      'booking',
      v_restaurant_id,
      NEW.id,
      jsonb_build_object(
        'reservation_id', NEW.id,
        'restaurant_id', v_restaurant_id,
        'previous_status', OLD.status,
        'status', NEW.status
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_google_actions_center_updates() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_google_actions_center_outbox ON public.reservations;
CREATE TRIGGER trg_google_actions_center_outbox
  AFTER INSERT OR UPDATE OF status, date, party_size
  ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_google_actions_center_updates();

/**
 * Claims a batch of due notifications.
 *
 * SKIP LOCKED lets a slow delivery run overlap the next scheduled one without
 * two workers sending the same notification twice.
 */
CREATE OR REPLACE FUNCTION public.claim_google_actions_center_outbox(p_limit integer DEFAULT 50)
RETURNS SETOF public.google_actions_center_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.google_actions_center_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.google_actions_center_outbox AS target
  SET attempts = target.attempts + 1
  FROM due
  WHERE target.id = due.id
  RETURNING target.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_actions_center_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_actions_center_outbox(integer) TO service_role;

/**
 * Records the outcome of a delivery attempt.
 *
 * Failures back off exponentially and are abandoned after six attempts, so a
 * permanently rejected notification stops consuming the batch instead of
 * blocking fresher ones behind it.
 */
CREATE OR REPLACE FUNCTION public.settle_google_actions_center_outbox(
  p_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_attempts integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;

  IF p_success THEN
    UPDATE public.google_actions_center_outbox
    SET status = 'sent', sent_at = now(), last_error = NULL
    WHERE id = p_id;
    RETURN;
  END IF;

  SELECT attempts INTO v_attempts
  FROM public.google_actions_center_outbox
  WHERE id = p_id;

  UPDATE public.google_actions_center_outbox
  SET
    status = CASE WHEN COALESCE(v_attempts, 0) >= 6 THEN 'abandoned' ELSE 'pending' END,
    next_attempt_at = now() + (interval '1 minute' * power(3, LEAST(COALESCE(v_attempts, 0), 5))),
    last_error = left(COALESCE(p_error, 'unknown_error'), 1000)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_google_actions_center_outbox(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_google_actions_center_outbox(uuid, boolean, text) TO service_role;

NOTIFY pgrst, 'reload schema';
