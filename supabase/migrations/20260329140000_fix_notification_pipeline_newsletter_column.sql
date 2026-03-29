-- Fix: re-deploy notification pipeline functions.
-- The production database may have stale versions of these functions that
-- reference a "newsletter" column on notification_preferences or profiles
-- which does not exist. This migration ensures the correct versions
-- (using jsonb columns: channels, categories) are deployed.

CREATE OR REPLACE FUNCTION public.queue_notification_deliveries(
  p_notification_id uuid,
  p_user_id uuid,
  p_category text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_channels jsonb := '{"push": true, "email": true, "in_app": true}'::jsonb;
  v_categories jsonb := '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb;
  v_requested jsonb := '{"in_app": true, "push": true, "email": false}'::jsonb;
  v_email text;
  v_count integer := 0;
BEGIN
  SELECT channels, categories
  INTO v_channels, v_categories
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  v_channels := COALESCE(v_channels, '{"push": true, "email": true, "in_app": true}'::jsonb);
  v_categories := COALESCE(v_categories, '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb);

  IF COALESCE((v_categories ->> p_category)::boolean, true) IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(COALESCE(p_data, '{}'::jsonb) -> 'requested_channels') = 'object' THEN
    v_requested := COALESCE(p_data, '{}'::jsonb) -> 'requested_channels';
  END IF;

  IF COALESCE((v_requested ->> 'in_app')::boolean, true)
    AND COALESCE((v_channels ->> 'in_app')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'in_app'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id, channel, status, scheduled_at, sent_at
    ) VALUES (
      p_notification_id, 'in_app', 'sent', now(), now()
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'push')::boolean, true)
    AND COALESCE((v_channels ->> 'push')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'push'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id, channel, status, scheduled_at
    ) VALUES (
      p_notification_id, 'push', 'queued', now()
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'email')::boolean, false)
    AND COALESCE((v_channels ->> 'email')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'email'
    ) THEN
    SELECT au.email::text
    INTO v_email
    FROM auth.users au
    WHERE au.id = p_user_id;

    IF v_email IS NOT NULL THEN
      INSERT INTO public.notification_deliveries (
        notification_id, channel, status, target, scheduled_at
      ) VALUES (
        p_notification_id, 'email', 'queued', v_email, now()
      );
      v_count := v_count + 1;
    END IF;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_category text,
  p_data json DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
  v_data jsonb := COALESCE(p_data::jsonb, '{}'::jsonb);
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, category, data)
  VALUES (p_user_id, p_title, p_body, p_type, p_category, v_data)
  RETURNING id INTO nid;

  PERFORM public.queue_notification_deliveries(
    nid,
    p_user_id,
    p_category,
    v_data
  );

  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_reservation_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_owner_id uuid;
  v_restaurant_name text := 'Restaurant';
  v_customer_title text;
  v_customer_body text;
  v_feature_label text := '';
  v_reference_date date;
  v_reference_time time;
BEGIN
  v_restaurant_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.restaurant_id
    ELSE COALESCE(NEW.restaurant_id, OLD.restaurant_id)
  END;
  v_reference_date := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.date
    ELSE COALESCE(NEW.date, OLD.date)
  END;
  v_reference_time := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.time
    ELSE COALESCE(NEW.time, OLD.time)
  END;

  SELECT r.owner_id, COALESCE(r.name, 'Restaurant')
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = v_restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_feature_label := CASE lower(COALESCE(NEW.feature, ''))
      WHEN 'zero-attente' THEN ' Zero Attente'
      WHEN 'chefs_table' THEN ' Chef''s Table'
      WHEN 'promo-formule' THEN ' avec formule'
      WHEN 'promo-offre' THEN ' avec offre'
      ELSE ''
    END;

    PERFORM public.enqueue_notification(
      NEW.user_id,
      'Reservation enregistree',
      format(
        'Votre reservation%s chez %s pour le %s a %s a bien ete enregistree.',
        v_feature_label,
        v_restaurant_name,
        to_char(NEW.date, 'DD/MM/YYYY'),
        to_char(NEW.time, 'HH24:MI')
      ),
      'reservation',
      'transactional',
      jsonb_build_object(
        'reservation_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'status', NEW.status,
        'url', '/reservations'
      )::json
    );

    IF v_owner_id IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_owner_id,
        'Nouvelle reservation',
        format(
          '%s personne(s) chez %s le %s a %s.',
          COALESCE(NEW.party_size, 0),
          v_restaurant_name,
          to_char(NEW.date, 'DD/MM/YYYY'),
          to_char(NEW.time, 'HH24:MI')
        ),
        'reservation',
        'transactional',
        jsonb_build_object(
          'reservation_id', NEW.id,
          'restaurant_id', NEW.restaurant_id,
          'status', NEW.status,
          'url', '/dashboard/reservations'
        )::json
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'confirmed' THEN
        v_customer_title := 'Reservation confirmee';
        v_customer_body := format(
          'Votre reservation chez %s pour le %s a %s est confirmee.',
          v_restaurant_name,
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI')
        );
      WHEN 'arrived' THEN
        v_customer_title := 'Reservation signalee';
        v_customer_body := format(
          'Votre arrivee a ete enregistree chez %s.',
          v_restaurant_name
        );
      WHEN 'cancelled' THEN
        v_customer_title := 'Reservation annulee';
        v_customer_body := format(
          'Votre reservation chez %s pour le %s a %s a ete annulee.',
          v_restaurant_name,
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI')
        );
      WHEN 'no_show' THEN
        v_customer_title := 'Reservation classee no-show';
        v_customer_body := format(
          'Votre reservation chez %s a ete marquee en no-show.',
          v_restaurant_name
        );
      ELSE
        v_customer_title := 'Reservation mise a jour';
        v_customer_body := format(
          'Votre reservation chez %s est maintenant : %s.',
          v_restaurant_name,
          NEW.status
        );
    END CASE;

    PERFORM public.enqueue_notification(
      NEW.user_id,
      v_customer_title,
      v_customer_body,
      'reservation',
      'transactional',
      jsonb_build_object(
        'reservation_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'status', NEW.status,
        'url', '/reservations'
      )::json
    );

    IF v_owner_id IS NOT NULL AND NEW.status IN ('cancelled', 'no_show') THEN
      PERFORM public.enqueue_notification(
        v_owner_id,
        CASE
          WHEN NEW.status = 'cancelled' THEN 'Reservation annulee'
          ELSE 'Reservation en no-show'
        END,
        format(
          'La reservation du %s a %s chez %s est maintenant : %s.',
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI'),
          v_restaurant_name,
          NEW.status
        ),
        'reservation',
        'transactional',
        jsonb_build_object(
          'reservation_id', NEW.id,
          'restaurant_id', NEW.restaurant_id,
          'status', NEW.status,
          'url', '/dashboard/reservations'
        )::json
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_reservation_notification ON public.reservations;

CREATE TRIGGER after_reservation_notification
AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_reservation_notifications();

NOTIFY pgrst, 'reload schema';
