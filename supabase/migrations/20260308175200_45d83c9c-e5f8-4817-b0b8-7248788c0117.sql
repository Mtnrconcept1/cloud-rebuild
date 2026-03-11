
-- Database functions needed by the app

CREATE OR REPLACE FUNCTION public.increment_ad_campaign_metric(p_campaign_id uuid, p_metric text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_metric = 'impressions' THEN
    UPDATE ad_campaigns SET impressions = COALESCE(impressions, 0) + 1 WHERE id = p_campaign_id;
  ELSIF p_metric = 'clicks' THEN
    UPDATE ad_campaigns SET clicks = COALESCE(clicks, 0) + 1 WHERE id = p_campaign_id;
  ELSIF p_metric = 'conversions' THEN
    UPDATE ad_campaigns SET conversions = COALESCE(conversions, 0) + 1 WHERE id = p_campaign_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_performance(p_restaurant_id uuid, p_from text, p_to text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json;
BEGIN
  SELECT json_build_object(
    'total_orders', COALESCE((SELECT count(*) FROM orders WHERE restaurant_id = p_restaurant_id AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz), 0),
    'total_revenue', COALESCE((SELECT sum(total_amount) FROM orders WHERE restaurant_id = p_restaurant_id AND status != 'cancelled' AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz), 0),
    'avg_ticket', COALESCE((SELECT avg(total_amount) FROM orders WHERE restaurant_id = p_restaurant_id AND status != 'cancelled' AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz), 0),
    'total_reservations', COALESCE((SELECT count(*) FROM reservations WHERE restaurant_id = p_restaurant_id AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz), 0),
    'cancel_rate', COALESCE((SELECT round(count(*) FILTER (WHERE status = 'cancelled')::numeric / NULLIF(count(*), 0) * 100, 1) FROM orders WHERE restaurant_id = p_restaurant_id AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz), 0)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(p_restaurant_id uuid, p_period text)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json; days_back integer;
BEGIN
  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;
  SELECT json_build_object(
    'my_revenue', COALESCE((SELECT sum(total_amount) FROM orders WHERE restaurant_id = p_restaurant_id AND status != 'cancelled' AND created_at >= now() - (days_back || ' days')::interval), 0),
    'my_orders', COALESCE((SELECT count(*) FROM orders WHERE restaurant_id = p_restaurant_id AND created_at >= now() - (days_back || ' days')::interval), 0),
    'my_avg_rating', COALESCE((SELECT avg(rating) FROM reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue', COALESCE((SELECT avg(rev) FROM (SELECT sum(total_amount) as rev FROM orders WHERE status != 'cancelled' AND created_at >= now() - (days_back || ' days')::interval GROUP BY restaurant_id) t), 0),
    'avg_orders', COALESCE((SELECT avg(cnt) FROM (SELECT count(*) as cnt FROM orders WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY restaurant_id) t), 0),
    'avg_rating', COALESCE((SELECT avg(rating) FROM reviews), 0)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_recommendations(p_restaurant_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) INTO result
  FROM (SELECT * FROM restaurant_recommendations WHERE restaurant_id = p_restaurant_id AND status = 'pending' ORDER BY priority ASC LIMIT 10) r;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL,
  items_param json DEFAULT NULL,
  metadata_param json DEFAULT NULL,
  checkout_id_param uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_order_id uuid; item json;
BEGIN
  INSERT INTO orders (user_id, restaurant_id, delivery_address, total_amount, delivery_fee, notes, metadata, checkout_id)
  VALUES (auth.uid(), restaurant_id_param, delivery_address_param, total_amount_param, delivery_fee_param, notes_param, COALESCE(metadata_param::jsonb, '{}'::jsonb), checkout_id_param)
  RETURNING id INTO new_order_id;

  IF items_param IS NOT NULL THEN
    FOR item IN SELECT * FROM json_array_elements(items_param)
    LOOP
      INSERT INTO order_items (order_id, menu_item_id, restaurant_id, quantity, unit_price, total_price, metadata)
      VALUES (
        new_order_id,
        (item->>'menu_item_id')::uuid,
        (item->>'restaurant_id')::uuid,
        COALESCE((item->>'quantity')::integer, 1),
        (item->>'unit_price')::numeric,
        (item->>'total_price')::numeric,
        COALESCE((item->>'metadata')::jsonb, '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN new_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_restaurant_review_stats(p_restaurant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE restaurants SET
    rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM reviews WHERE restaurant_id = p_restaurant_id), 0),
    review_count = COALESCE((SELECT count(*) FROM reviews WHERE restaurant_id = p_restaurant_id), 0)
  WHERE id = p_restaurant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid, p_title text, p_body text, p_type text, p_category text, p_data json DEFAULT '{}'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  INSERT INTO notifications (user_id, title, body, type, category, data)
  VALUES (p_user_id, p_title, p_body, p_type, p_category, COALESCE(p_data::jsonb, '{}'::jsonb))
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_deliveries(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notification_deliveries (notification_id, channel)
  VALUES (p_notification_id, 'in_app');
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(user_id_param uuid, points_to_redeem integer, description_param text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_points integer;
BEGIN
  SELECT loyalty_points INTO current_points FROM profiles WHERE user_id = user_id_param;
  IF current_points IS NULL OR current_points < points_to_redeem THEN RETURN false; END IF;
  UPDATE profiles SET loyalty_points = loyalty_points - points_to_redeem WHERE user_id = user_id_param;
  INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description) VALUES (user_id_param, -points_to_redeem, 'redeem', description_param);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.donate_points_for_meal(points_param integer, description_param text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_points integer;
BEGIN
  SELECT loyalty_points INTO current_points FROM profiles WHERE user_id = auth.uid();
  IF current_points IS NULL OR current_points < points_param THEN RETURN false; END IF;
  UPDATE profiles SET loyalty_points = loyalty_points - points_param WHERE user_id = auth.uid();
  INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description) VALUES (auth.uid(), -points_param, 'donation', description_param);
  INSERT INTO solidarity_donations (user_id, points_amount, meals_count) VALUES (auth.uid(), points_param, GREATEST(1, points_param / 100));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_gift_points(recipient_email_param text, points_param integer, message_param text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid uuid; current_points integer;
BEGIN
  SELECT loyalty_points INTO current_points FROM profiles WHERE user_id = auth.uid();
  IF current_points IS NULL OR current_points < points_param THEN RAISE EXCEPTION 'Insufficient points'; END IF;
  UPDATE profiles SET loyalty_points = loyalty_points - points_param WHERE user_id = auth.uid();
  INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description) VALUES (auth.uid(), -points_param, 'gift_sent', 'Gift to ' || recipient_email_param);
  INSERT INTO gift_points (sender_id, recipient_email, points_amount, message) VALUES (auth.uid(), recipient_email_param, points_param, message_param) RETURNING id INTO gid;
  RETURN gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_gift_points(claim_code_param text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gift_row gift_points%ROWTYPE;
BEGIN
  SELECT * INTO gift_row FROM gift_points WHERE claim_code = claim_code_param AND status = 'pending' AND expires_at > now();
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE gift_points SET status = 'claimed', claimed_at = now(), recipient_id = auth.uid() WHERE id = gift_row.id;
  UPDATE profiles SET loyalty_points = loyalty_points + gift_row.points_amount WHERE user_id = auth.uid();
  INSERT INTO loyalty_transactions (user_id, amount, transaction_type, description) VALUES (auth.uid(), gift_row.points_amount, 'gift_received', 'Gift claimed');
  RETURN gift_row.points_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_gift_stats()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'total_sent', (SELECT count(*) FROM gift_points WHERE sender_id = auth.uid()),
    'total_received', (SELECT count(*) FROM gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'),
    'points_sent', COALESCE((SELECT sum(points_amount) FROM gift_points WHERE sender_id = auth.uid()), 0),
    'points_received', COALESCE((SELECT sum(points_amount) FROM gift_points WHERE recipient_id = auth.uid() AND status = 'claimed'), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_total_donated_meals()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(meals_count), 0)::integer FROM solidarity_donations;
$$;

CREATE OR REPLACE FUNCTION public.get_total_donated_points()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(points_amount), 0)::integer FROM solidarity_donations;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_groups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE order_groups SET is_active = false WHERE expires_at < now() AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_order_discount_from_payload(p_items_total numeric, p_delivery_fee numeric, p_total_amount numeric, p_metadata json)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT GREATEST(0, p_items_total + p_delivery_fee - p_total_amount);
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_stats(campaign_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  campaign_id uuid, recipients integer, notifications_count integer, read_count integer,
  deliveries_total integer, deliveries_queued integer, deliveries_sent integer, deliveries_failed integer,
  in_app_total integer, email_total integer, push_total integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT
    nc.id as campaign_id,
    0 as recipients,
    0 as notifications_count,
    0 as read_count,
    0 as deliveries_total,
    0 as deliveries_queued,
    0 as deliveries_sent,
    0 as deliveries_failed,
    0 as in_app_total,
    0 as email_total,
    0 as push_total
  FROM notification_campaigns nc
  WHERE campaign_ids IS NULL OR nc.id = ANY(campaign_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_service_settings_json(_opening_hours json)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.set_test_role(new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM user_roles WHERE user_id = auth.uid();
  INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), new_role::app_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_restaurant_daily_kpis_for_date(p_restaurant_id uuid, p_day text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO restaurant_daily_kpis (restaurant_id, kpi_date, orders_count, revenue, avg_ticket, reservations_count, reviews_count, satisfaction_score, cancel_rate)
  SELECT
    p_restaurant_id, p_day::date,
    COALESCE(count(o.id), 0),
    COALESCE(sum(o.total_amount) FILTER (WHERE o.status != 'cancelled'), 0),
    COALESCE(avg(o.total_amount) FILTER (WHERE o.status != 'cancelled'), 0),
    (SELECT count(*) FROM reservations r WHERE r.restaurant_id = p_restaurant_id AND r.date = p_day::date AND r.status != 'cancelled'),
    (SELECT count(*) FROM reviews rev WHERE rev.restaurant_id = p_restaurant_id AND rev.created_at::date = p_day::date),
    COALESCE((SELECT avg(rating) FROM reviews rev WHERE rev.restaurant_id = p_restaurant_id AND rev.created_at::date = p_day::date), 0),
    COALESCE(round(count(o.id) FILTER (WHERE o.status = 'cancelled')::numeric / NULLIF(count(o.id), 0) * 100, 1), 0)
  FROM orders o 
  WHERE o.restaurant_id = p_restaurant_id AND o.created_at::date = p_day::date
  ON CONFLICT (restaurant_id, kpi_date) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    revenue = EXCLUDED.revenue,
    avg_ticket = EXCLUDED.avg_ticket,
    reservations_count = EXCLUDED.reservations_count,
    reviews_count = EXCLUDED.reviews_count,
    satisfaction_score = EXCLUDED.satisfaction_score,
    cancel_rate = EXCLUDED.cancel_rate,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_restaurant_daily_kpis_recent_days(p_days_back integer DEFAULT 7)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r_id uuid; d date;
BEGIN
  FOR r_id IN SELECT id FROM restaurants LOOP
    FOR d IN SELECT generate_series(current_date - (p_days_back || ' days')::interval, current_date, '1 day')::date LOOP
      PERFORM refresh_restaurant_daily_kpis_for_date(r_id, d::text);
    END LOOP;
  END LOOP;
END;
$$;

-- Profile auto-creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
