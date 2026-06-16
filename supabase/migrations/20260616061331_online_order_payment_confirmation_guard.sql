-- Keep online order confirmation tied to a verified payment capture.

CREATE OR REPLACE FUNCTION public.guard_online_order_confirmation_requires_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_payment_method text := lower(trim(COALESCE(
    v_metadata ->> 'payment_method',
    v_metadata ->> 'payment_method_label',
    ''
  )));
  v_payment_status text := lower(trim(COALESCE(NEW.payment_status, '')));
  v_checkout_state text := lower(trim(COALESCE(v_metadata ->> 'checkout_session_state', '')));
  v_has_stripe_session boolean := NULLIF(trim(COALESCE(
    v_metadata ->> 'stripe_session_id',
    v_metadata ->> 'checkout_session_id',
    ''
  )), '') IS NOT NULL;
  v_requires_stripe_checkout boolean := lower(trim(COALESCE(
    v_metadata ->> 'requires_stripe_checkout',
    ''
  ))) IN ('1', 'true', 'yes', 'oui');
  v_is_online_payment boolean := v_payment_method IN (
    'card',
    'stripe',
    'credit_card',
    'debit_card',
    'twint',
    'postfinance',
    'postfinance_card',
    'postfinance_efinance'
  )
  OR v_requires_stripe_checkout
  OR v_has_stripe_session
  OR v_checkout_state IN ('pending', 'pending_payment', 'requires_payment', 'requires_action');
BEGIN
  IF lower(COALESCE(NEW.status, '')) = 'confirmed'
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
     )
     AND v_is_online_payment
     AND v_payment_status NOT IN ('captured', 'paid') THEN
    RAISE EXCEPTION
      'Paiement confirme requis avant confirmation de commande en ligne.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_online_order_confirmation_requires_payment ON public.orders;

CREATE TRIGGER guard_online_order_confirmation_requires_payment
BEFORE UPDATE OF status, payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_online_order_confirmation_requires_payment();

REVOKE EXECUTE ON FUNCTION public.guard_online_order_confirmation_requires_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_online_order_confirmation_requires_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_online_order_confirmation_requires_payment() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.guard_online_order_confirmation_requires_payment() TO service_role;

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
  v_metadata jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_payment_method text := lower(trim(COALESCE(
    v_metadata ->> 'payment_method',
    v_metadata ->> 'payment_method_label',
    ''
  )));
  v_payment_status text := lower(trim(COALESCE(NEW.payment_status, '')));
  v_checkout_state text := lower(trim(COALESCE(v_metadata ->> 'checkout_session_state', '')));
  v_has_stripe_session boolean := NULLIF(trim(COALESCE(
    v_metadata ->> 'stripe_session_id',
    v_metadata ->> 'checkout_session_id',
    ''
  )), '') IS NOT NULL;
  v_requires_stripe_checkout boolean := lower(trim(COALESCE(
    v_metadata ->> 'requires_stripe_checkout',
    ''
  ))) IN ('1', 'true', 'yes', 'oui');
  v_is_online_payment boolean := v_payment_method IN (
    'card',
    'stripe',
    'credit_card',
    'debit_card',
    'twint',
    'postfinance',
    'postfinance_card',
    'postfinance_efinance'
  )
  OR v_requires_stripe_checkout
  OR v_has_stripe_session
  OR v_checkout_state IN ('pending', 'pending_payment', 'requires_payment', 'requires_action');
  v_order_reference text := COALESCE(NEW.order_number, '#' || left(NEW.id::text, 8));
  v_title text;
  v_body text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF v_status = 'pending_payment' THEN
    RETURN NEW;
  END IF;

  IF v_is_online_payment
     AND v_payment_status NOT IN ('captured', 'paid')
     AND v_status IN ('confirmed', 'accepted', 'preparing', 'ready', 'delivering', 'delivered') THEN
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

DROP TRIGGER IF EXISTS after_order_status_update ON public.orders;
DROP TRIGGER IF EXISTS trigger_order_status_notification ON public.orders;
DROP TRIGGER IF EXISTS trg_order_status_notification ON public.orders;

CREATE TRIGGER after_order_status_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_order_status_notification();

REVOKE EXECUTE ON FUNCTION public.trigger_order_status_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_order_status_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_order_status_notification() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_order_status_notification() TO service_role;

WITH invalid_confirmation_notifications AS (
  SELECT n.id
  FROM public.notifications n
  JOIN public.orders o
    ON o.id = (n.data ->> 'order_id')::uuid
  WHERE (n.data ->> 'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      lower(COALESCE(n.data ->> 'status', '')) = 'confirmed'
      OR n.title ILIKE 'Commande confirm%'
    )
    AND lower(trim(COALESCE(o.metadata ->> 'payment_method', o.metadata ->> 'payment_method_label', ''))) IN (
      'card',
      'stripe',
      'credit_card',
      'debit_card',
      'twint',
      'postfinance',
      'postfinance_card',
      'postfinance_efinance'
    )
    AND lower(COALESCE(o.payment_status, '')) NOT IN ('captured', 'paid')
)
DELETE FROM public.notification_deliveries d
USING invalid_confirmation_notifications bad
WHERE d.notification_id = bad.id;

WITH invalid_confirmation_notifications AS (
  SELECT n.id
  FROM public.notifications n
  JOIN public.orders o
    ON o.id = (n.data ->> 'order_id')::uuid
  WHERE (n.data ->> 'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      lower(COALESCE(n.data ->> 'status', '')) = 'confirmed'
      OR n.title ILIKE 'Commande confirm%'
    )
    AND lower(trim(COALESCE(o.metadata ->> 'payment_method', o.metadata ->> 'payment_method_label', ''))) IN (
      'card',
      'stripe',
      'credit_card',
      'debit_card',
      'twint',
      'postfinance',
      'postfinance_card',
      'postfinance_efinance'
    )
    AND lower(COALESCE(o.payment_status, '')) NOT IN ('captured', 'paid')
)
DELETE FROM public.notifications n
USING invalid_confirmation_notifications bad
WHERE n.id = bad.id;

NOTIFY pgrst, 'reload schema';
