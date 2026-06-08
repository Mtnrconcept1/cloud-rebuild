-- Gate VIP La Table du Chef reservations through Tok One and notify Tok One
-- members when public offers become available.

CREATE INDEX IF NOT EXISTS idx_tok_one_subscriptions_entitled_users
  ON public.tok_one_subscriptions (user_id, current_period_end DESC)
  WHERE status IN ('active', 'trialing');

CREATE INDEX IF NOT EXISTS idx_notifications_tok_one_offer_dedupe
  ON public.notifications (user_id, type, ((data ->> 'tok_one_offer_id')))
  WHERE type = 'tok_one_offer';

CREATE OR REPLACE FUNCTION public.notify_tok_one_members_new_offer(
  p_offer_kind text,
  p_offer_id uuid,
  p_restaurant_id uuid,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer_kind text := lower(trim(COALESCE(p_offer_kind, '')));
  v_offer_key text;
  v_notification record;
  v_count integer := 0;
BEGIN
  IF p_offer_id IS NULL THEN
    RAISE EXCEPTION 'offer_id requis';
  END IF;

  IF v_offer_kind NOT IN ('anti_gaspi', 'flash_sale', 'chefs_table') THEN
    RAISE EXCEPTION 'type offre Tok One invalide';
  END IF;

  v_offer_key := v_offer_kind || ':' || p_offer_id::text;

  FOR v_notification IN
    WITH active_tok_one_users AS (
      SELECT DISTINCT ON (tos.user_id)
        tos.user_id
      FROM public.tok_one_subscriptions tos
      WHERE tos.status IN ('active', 'trialing')
        AND tos.current_period_end > now()
      ORDER BY tos.user_id, tos.current_period_end DESC
    ),
    inserted_notifications AS (
      INSERT INTO public.notifications (user_id, title, body, type, category, data)
      SELECT
        atu.user_id,
        p_title,
        p_body,
        'tok_one_offer',
        'product',
        COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
          'audience', 'tok_one',
          'tok_one_offer_id', v_offer_key,
          'offer_kind', v_offer_kind,
          'offer_id', p_offer_id,
          'restaurant_id', p_restaurant_id,
          'url', p_url,
          'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
        )
      FROM active_tok_one_users atu
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = atu.user_id
          AND n.type = 'tok_one_offer'
          AND n.data ->> 'tok_one_offer_id' = v_offer_key
      )
      RETURNING id, user_id, category, data
    )
    SELECT id, user_id, category, data
    FROM inserted_notifications
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_tok_one_members_new_offer(text, uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_tok_one_members_new_offer(text, uuid, uuid, text, text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_flash_sale_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
  v_price text;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false)
      AND COALESCE(NEW.quantity_available, 0) > 0
      AND NEW.archived_at IS NULL;
  ELSE
    v_should_notify := NEW.archived_at IS NULL
      AND COALESCE(NEW.quantity_available, 0) > 0
      AND COALESCE(NEW.is_active, false)
      AND (
        NOT COALESCE(OLD.is_active, false)
        OR COALESCE(OLD.quantity_available, 0) = 0
      );
  END IF;

  IF v_should_notify THEN
    v_price := to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00');

    PERFORM public.broadcast_topic_notification(
      'flash_sales',
      'Nouvelle vente flash',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre exclusive'),
        v_restaurant_name,
        v_price
      ),
      'flash_sale',
      'product',
      jsonb_build_object(
        'flash_sale_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/ventes-flash'
      )
    );

    PERFORM public.notify_tok_one_members_new_offer(
      'flash_sale',
      NEW.id,
      NEW.restaurant_id,
      'Tok One: nouvelle vente flash',
      format(
        '%s chez %s est en ligne a %s CHF.',
        COALESCE(NEW.title, 'Une vente flash exclusive'),
        v_restaurant_name,
        v_price
      ),
      '/ventes-flash',
      jsonb_build_object(
        'flash_sale_id', NEW.id,
        'price_chf', COALESCE(NEW.discounted_price, 0)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_anti_gaspi_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
  v_price text;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false)
      AND COALESCE(NEW.quantity_available, 0) > 0
      AND NEW.archived_at IS NULL;
  ELSE
    v_should_notify := NEW.archived_at IS NULL
      AND COALESCE(NEW.quantity_available, 0) > 0
      AND COALESCE(NEW.is_active, false)
      AND (
        NOT COALESCE(OLD.is_active, false)
        OR COALESCE(OLD.quantity_available, 0) = 0
      );
  END IF;

  IF v_should_notify THEN
    v_price := to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00');

    PERFORM public.broadcast_topic_notification(
      'anti_gaspi',
      'Nouvelle offre anti-gaspi',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre anti-gaspi'),
        v_restaurant_name,
        v_price
      ),
      'anti_gaspi',
      'product',
      jsonb_build_object(
        'anti_waste_offer_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/anti-gaspi'
      )
    );

    PERFORM public.notify_tok_one_members_new_offer(
      'anti_gaspi',
      NEW.id,
      NEW.restaurant_id,
      'Tok One: nouvelle offre partenaire',
      format(
        '%s chez %s est en ligne a %s CHF.',
        COALESCE(NEW.title, 'Une offre anti-gaspi'),
        v_restaurant_name,
        v_price
      ),
      '/anti-gaspi',
      jsonb_build_object(
        'anti_waste_offer_id', NEW.id,
        'offer_type', NEW.offer_type,
        'price_chf', COALESCE(NEW.discounted_price, 0)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_chefs_table_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
  v_price text;
  v_tok_one_title text;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false)
      AND COALESCE(NEW.remaining_portions, 0) > 0
      AND NEW.archived_at IS NULL;
  ELSE
    v_should_notify := NEW.archived_at IS NULL
      AND COALESCE(NEW.remaining_portions, 0) > 0
      AND COALESCE(NEW.is_active, false)
      AND (
        NOT COALESCE(OLD.is_active, false)
        OR COALESCE(OLD.remaining_portions, 0) = 0
      );
  END IF;

  IF v_should_notify THEN
    v_price := to_char(COALESCE(NEW.price, 0), 'FM999999990.00');
    v_tok_one_title := CASE
      WHEN COALESCE(NEW.is_vip, false) THEN 'Tok One: table VIP disponible'
      ELSE 'Tok One: nouveau drop Table du Chef'
    END;

    PERFORM public.broadcast_topic_notification(
      'chefs_table',
      'Nouveau drop Chef''s Table',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.dish_name, 'Un nouveau plat signature'),
        v_restaurant_name,
        v_price
      ),
      'chefs_table',
      'product',
      jsonb_build_object(
        'chef_table_drop_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/chefs-table'
      )
    );

    PERFORM public.notify_tok_one_members_new_offer(
      'chefs_table',
      NEW.id,
      NEW.restaurant_id,
      v_tok_one_title,
      format(
        '%s chez %s est en ligne a %s CHF.',
        COALESCE(NEW.dish_name, 'Un nouveau plat signature'),
        v_restaurant_name,
        v_price
      ),
      '/chefs-table',
      jsonb_build_object(
        'chef_table_drop_id', NEW.id,
        'is_vip', COALESCE(NEW.is_vip, false),
        'price_chf', COALESCE(NEW.price, 0)
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

DROP TRIGGER IF EXISTS after_anti_gaspi_subscription_alert ON public.anti_waste_offers;
CREATE TRIGGER after_anti_gaspi_subscription_alert
AFTER INSERT OR UPDATE ON public.anti_waste_offers
FOR EACH ROW
EXECUTE FUNCTION public.trigger_anti_gaspi_subscription_alert();

DROP TRIGGER IF EXISTS after_chefs_table_subscription_alert ON public.chef_table_drops;
CREATE TRIGGER after_chefs_table_subscription_alert
AFTER INSERT OR UPDATE ON public.chef_table_drops
FOR EACH ROW
EXECUTE FUNCTION public.trigger_chefs_table_subscription_alert();

NOTIFY pgrst, 'reload schema';
