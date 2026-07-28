-- A guest marked as arrived is a confirmed reservation outcome even when a
-- legacy or operational flow skipped the intermediate `confirmed` status.

CREATE OR REPLACE FUNCTION public.ad_campaign_conversion_entity_state(
  p_conversion_type text,
  p_entity_id uuid,
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text := 'missing';
BEGIN
  IF p_conversion_type = 'order' THEN
    SELECT CASE
      WHEN lower(COALESCE(o.status, '')) IN ('cancelled', 'canceled', 'rejected', 'failed', 'payment_failed', 'refunded')
        OR lower(COALESCE(o.payment_status, '')) IN ('cancelled', 'canceled', 'failed', 'payment_failed', 'refunded')
        THEN 'terminal'
      WHEN lower(COALESCE(o.status, '')) IN ('confirmed', 'preparing', 'ready', 'completed', 'delivered')
        AND lower(COALESCE(o.payment_status, '')) NOT IN ('pending', 'pending_payment', 'requires_payment', 'failed', 'payment_failed', 'cancelled', 'canceled')
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.orders o
    WHERE o.id = p_entity_id
      AND o.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR o.user_id = p_user_id)
    LIMIT 1;
  ELSIF p_conversion_type IN ('reservation', 'zero-attente') THEN
    SELECT CASE
      WHEN lower(COALESCE(r.status, '')) IN ('cancelled', 'canceled', 'rejected', 'declined', 'no_show', 'failed')
        THEN 'terminal'
      WHEN lower(COALESCE(r.status, '')) IN ('confirmed', 'arrived', 'seated', 'completed')
        THEN 'confirmed'
      ELSE 'pending'
    END
    INTO v_state
    FROM public.reservations r
    WHERE r.id = p_entity_id
      AND r.restaurant_id = p_restaurant_id
      AND (p_user_id IS NULL OR r.user_id = p_user_id)
    LIMIT 1;
  ELSE
    RETURN 'missing';
  END IF;

  RETURN COALESCE(v_state, 'missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_campaign_conversion_entity_state(text, uuid, uuid, uuid) TO service_role;
