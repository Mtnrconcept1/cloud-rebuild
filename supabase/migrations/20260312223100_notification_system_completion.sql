-- Complete the notification pipeline with centralized delivery queueing
-- and missing business alerts.

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
      notification_id,
      channel,
      status,
      scheduled_at,
      sent_at
    )
    VALUES (
      p_notification_id,
      'in_app',
      'sent',
      now(),
      now()
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
      notification_id,
      channel,
      status,
      scheduled_at
    )
    VALUES (
      p_notification_id,
      'push',
      'queued',
      now()
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
        notification_id,
        channel,
        status,
        target,
        scheduled_at
      )
      VALUES (
        p_notification_id,
        'email',
        'queued',
        v_email,
        now()
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

CREATE OR REPLACE FUNCTION public.broadcast_topic_notification(
  p_topic text,
  p_title text,
  p_body text,
  p_type text,
  p_category text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient record;
  v_count integer := 0;
BEGIN
  FOR v_recipient IN
    SELECT DISTINCT ns.user_id
    FROM public.notification_subscriptions ns
    WHERE ns.topic = p_topic
  LOOP
    PERFORM public.enqueue_notification(
      v_recipient.user_id,
      p_title,
      p_body,
      p_type,
      p_category,
      p_data::json
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign(
  p_campaign_id uuid
)
RETURNS TABLE (
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_campaign public.notification_campaigns%ROWTYPE;
  v_notification record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.';
  END IF;

  FOR v_notification IN
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object(
        'campaign_id', v_campaign.id,
        'campaign_title', v_campaign.title,
        'url', '/notifications',
        'requested_channels', jsonb_build_object(
          'in_app', COALESCE((v_campaign.channels ->> 'in_app')::boolean, true),
          'email', COALESCE((v_campaign.channels ->> 'email')::boolean, true),
          'push', COALESCE((v_campaign.channels ->> 'push')::boolean, true)
        )
      )
    FROM (
      SELECT
        au.id AS user_id,
        COALESCE(p.city, '') AS city,
        COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN LATERAL (
        SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
        FROM public.user_roles ur
        WHERE ur.user_id = au.id
      ) AS roles_map ON true
      WHERE (
        COALESCE(array_length(v_campaign.target_roles, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(roles_map.roles, ARRAY['client']::text[])) AS role_name
          WHERE role_name = ANY(v_campaign.target_roles)
        )
      )
      AND (
        COALESCE(array_length(v_campaign.target_cities, 1), 0) = 0
        OR COALESCE(p.city, '') = ANY(v_campaign.target_cities)
      )
    ) AS tu
    RETURNING id, user_id, category, data
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    )
  ;
  END LOOP;

  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT *
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]);
END;
$$;

DROP TRIGGER IF EXISTS after_order_status_update ON public.orders;

CREATE OR REPLACE FUNCTION public.trigger_order_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := CASE
    WHEN NEW.status = 'on_the_way' THEN 'delivering'
    ELSE COALESCE(NEW.status, 'pending')
  END;
  v_order_reference text := COALESCE(NEW.order_number, '#' || left(NEW.id::text, 8));
  v_title text;
  v_body text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  CASE v_status
    WHEN 'confirmed' THEN
      v_title := 'Commande confirmee';
      v_body := format('Votre commande %s est confirmee et passe en preparation.', v_order_reference);
    WHEN 'preparing' THEN
      v_title := 'Commande en preparation';
      v_body := format('Votre commande %s est en cours de preparation.', v_order_reference);
    WHEN 'delivering' THEN
      v_title := 'Commande en livraison';
      v_body := format('Votre commande %s est en route.', v_order_reference);
    WHEN 'delivered' THEN
      v_title := 'Commande livree';
      v_body := format('Votre commande %s a ete livree.', v_order_reference);
    WHEN 'cancelled' THEN
      v_title := 'Commande annulee';
      v_body := format('Votre commande %s a ete annulee.', v_order_reference);
    WHEN 'payment_failed' THEN
      v_title := 'Paiement echoue';
      v_body := format('Le paiement de votre commande %s a echoue.', v_order_reference);
    ELSE
      v_title := 'Commande mise a jour';
      v_body := format('Votre commande %s est maintenant : %s.', v_order_reference, v_status);
  END CASE;

  PERFORM public.enqueue_notification(
    NEW.user_id,
    v_title,
    v_body,
    'order_update',
    'transactional',
    jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'status', v_status,
      'url', '/commandes'
    )::json
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER after_order_status_update
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_order_status_notification();

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

CREATE OR REPLACE FUNCTION public.trigger_flash_sale_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.quantity_available, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.quantity_available, 0) = 0 AND COALESCE(NEW.quantity_available, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'flash_sales',
      'Nouvelle vente flash',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre exclusive'),
        v_restaurant_name,
        to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00')
      ),
      'flash_sale',
      'product',
      jsonb_build_object(
        'flash_sale_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/ventes-flash'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_flash_sale_subscription_alert ON public.flash_sales;

CREATE TRIGGER after_flash_sale_subscription_alert
AFTER INSERT OR UPDATE ON public.flash_sales
FOR EACH ROW
EXECUTE FUNCTION public.trigger_flash_sale_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_anti_gaspi_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.quantity_available, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.quantity_available, 0) = 0 AND COALESCE(NEW.quantity_available, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'anti_gaspi',
      'Nouvelle offre anti-gaspi',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre anti-gaspi'),
        v_restaurant_name,
        to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00')
      ),
      'anti_gaspi',
      'product',
      jsonb_build_object(
        'anti_waste_offer_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/anti-gaspi'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_anti_gaspi_subscription_alert ON public.anti_waste_offers;

CREATE TRIGGER after_anti_gaspi_subscription_alert
AFTER INSERT OR UPDATE ON public.anti_waste_offers
FOR EACH ROW
EXECUTE FUNCTION public.trigger_anti_gaspi_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_chefs_table_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.remaining_portions, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.remaining_portions, 0) = 0 AND COALESCE(NEW.remaining_portions, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'chefs_table',
      'Nouveau drop Chef''s Table',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.dish_name, 'Un nouveau plat signature'),
        v_restaurant_name,
        to_char(COALESCE(NEW.price, 0), 'FM999999990.00')
      ),
      'chefs_table',
      'product',
      jsonb_build_object(
        'chef_table_drop_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/chefs-table'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_chefs_table_subscription_alert ON public.chef_table_drops;

CREATE TRIGGER after_chefs_table_subscription_alert
AFTER INSERT OR UPDATE ON public.chef_table_drops
FOR EACH ROW
EXECUTE FUNCTION public.trigger_chefs_table_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_invoice_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text := 'Restaurant';
BEGIN
  SELECT owner_id, COALESCE(name, 'Restaurant')
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF v_owner_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Nouvelle facture disponible',
      format(
        'La facture %s pour %s est disponible.',
        COALESCE(NEW.invoice_number, to_char(NEW.period_start, 'MM/YYYY')),
        v_restaurant_name
      ),
      'invoice',
      'transactional',
      jsonb_build_object(
        'invoice_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/dashboard/factures',
        'requested_channels', jsonb_build_object(
          'in_app', true,
          'push', true,
          'email', true
        )
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_invoice_notification ON public.restaurant_invoices;

CREATE TRIGGER after_invoice_notification
AFTER INSERT ON public.restaurant_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_invoice_notification();

CREATE OR REPLACE FUNCTION public.trigger_review_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_user_id uuid;
  v_restaurant_name text := 'Le restaurant';
  v_author_name text;
BEGIN
  SELECT rv.user_id, COALESCE(r.name, 'Le restaurant')
  INTO v_review_user_id, v_restaurant_name
  FROM public.reviews rv
  LEFT JOIN public.restaurants r ON r.id = rv.restaurant_id
  WHERE rv.id = NEW.review_id;

  IF v_review_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_author_name := CASE
    WHEN COALESCE(NEW.author_type, '') = 'admin' THEN 'Tok'
    ELSE v_restaurant_name
  END;

  PERFORM public.enqueue_notification(
    v_review_user_id,
    'Reponse a votre avis',
    format('%s a repondu a votre avis.', v_author_name),
    'review_reply',
    'product',
    jsonb_build_object(
      'review_id', NEW.review_id,
      'reply_id', NEW.id,
      'url', '/notifications'
    )::json
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_review_reply_notification ON public.review_replies;

CREATE TRIGGER after_review_reply_notification
AFTER INSERT OR UPDATE ON public.review_replies
FOR EACH ROW
EXECUTE FUNCTION public.trigger_review_reply_notification();

NOTIFY pgrst, 'reload schema';
