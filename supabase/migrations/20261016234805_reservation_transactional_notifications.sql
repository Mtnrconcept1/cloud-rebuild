-- The native notification delivery queue is the transactional reservation outbox.
-- No network request occurs in this transaction; the existing leased dispatcher
-- retries failures. Rollback: restore the previous trigger function from Git.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_reservation_event_recipient_uidx
ON public.notifications ((data->>'reservation_event_key'), (data->>'recipient_role'))
WHERE type = 'reservation' AND data ? 'reservation_event_key';

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE OR REPLACE FUNCTION public.trigger_reservation_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_restaurant text;
  v_restaurant_details jsonb;
  v_customer_name text;
  v_event text;
  v_key text;
  v_title text;
  v_body text;
  v_recipient uuid;
  v_role text;
  v_nid uuid;
  v_data jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND
     (OLD.status, OLD.date, OLD.time, OLD.party_size, OLD.notes)
       IS NOT DISTINCT FROM
     (NEW.status, NEW.date, NEW.time, NEW.party_size, NEW.notes) THEN
    RETURN NEW;
  END IF;
  SELECT r.owner_id, r.name, to_jsonb(r) INTO v_owner, v_restaurant, v_restaurant_details
  FROM public.restaurants r WHERE r.id = NEW.restaurant_id;
  SELECT full_name INTO v_customer_name FROM public.profiles WHERE user_id = NEW.user_id;
  v_event := CASE WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status:' || OLD.status || ':' || NEW.status
    ELSE 'modified' END;
  -- A new transaction changing the reservation is a new event. A dispatcher
  -- retry always retains the same notification/delivery id and provider key.
  v_key := 'reservation:' || NEW.id || ':' || v_event || ':' || txid_current()::text;
  v_title := CASE WHEN TG_OP = 'INSERT' THEN
      CASE WHEN NEW.status = 'confirmed' THEN 'Réservation confirmée' ELSE 'Demande de réservation enregistrée' END
    WHEN NEW.status = 'confirmed' AND v_event <> 'modified' THEN 'Réservation confirmée'
    WHEN NEW.status = 'cancelled' THEN 'Réservation annulée'
    WHEN NEW.status IN ('rejected', 'declined', 'refused') THEN 'Réservation refusée'
    WHEN NEW.status = 'arrived' THEN 'Arrivée enregistrée'
    WHEN NEW.status = 'no_show' THEN 'Absence enregistrée'
    ELSE 'Réservation mise à jour' END;
  v_body := format('%s chez %s : %s à %s, %s convive(s). Statut : %s.%s',
    v_title, v_restaurant, to_char(NEW.date, 'DD/MM/YYYY'), to_char(NEW.time, 'HH24:MI'),
    NEW.party_size, NEW.status,
    CASE WHEN NEW.status = 'pending' THEN ' En attente de la réponse du restaurant.' ELSE '' END);
  FOREACH v_role IN ARRAY ARRAY['customer', 'restaurant'] LOOP
    v_recipient := CASE WHEN v_role = 'customer' THEN NEW.user_id ELSE v_owner END;
    IF v_recipient IS NULL THEN CONTINUE; END IF;
    v_data := jsonb_build_object(
      'reservation_id', NEW.id, 'restaurant_id', NEW.restaurant_id,
      'restaurant_name', v_restaurant, 'date', NEW.date, 'time', NEW.time,
      'restaurant_address', v_restaurant_details->>'address',
      'restaurant_city', v_restaurant_details->>'city',
      'customer_name', v_customer_name, 'feature', NEW.feature,
      'notes', NEW.notes, 'preorder_items', to_jsonb(NEW)->'preorder_items',
      'total_amount', to_jsonb(NEW)->'total_amount',
      'party_size', NEW.party_size, 'status', NEW.status,
      'event', v_event, 'reservation_event_key', v_key, 'recipient_role', v_role,
      'url', CASE WHEN v_role = 'customer' THEN '/reservations' ELSE '/dashboard/reservations' END,
      'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', true));
    v_nid := NULL;
    INSERT INTO public.notifications(user_id, title, body, type, category, data)
    VALUES (v_recipient, v_title, v_body, 'reservation', 'transactional', v_data)
    ON CONFLICT DO NOTHING RETURNING id INTO v_nid;
    IF v_nid IS NOT NULL THEN
      PERFORM public.queue_notification_deliveries(v_nid, v_recipient, 'transactional', v_data);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_reservation_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reservation_notifications() TO service_role;

COMMENT ON COLUMN public.notification_deliveries.provider_message_id IS
  'Provider acceptance reference; sent does not mean delivered. Delivery events require verified provider webhooks.';
