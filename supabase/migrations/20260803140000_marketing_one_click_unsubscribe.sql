-- One-click unsubscribe (RFC 8058).
--
-- Gmail and Yahoo require bulk senders to honour a one-click unsubscribe: the
-- mail client POSTs to a URL carried in List-Unsubscribe and the recipient is
-- removed without ever opening a page. A mailto: link alone, which is all the
-- Resend adapter carried until now, does not satisfy that requirement and
-- costs sender reputation on the two providers that matter most.
--
-- The endpoint is necessarily public — it is called by the recipient's mail
-- provider, not by an authenticated session — so the delivery identifier alone
-- must never be enough. The Edge function verifies an HMAC over the delivery id
-- before calling this helper, and the helper itself is service_role only.
--
-- Unsubscribing is deliberately generous: it suppresses the contact for every
-- channel, not just the campaign that prompted it. Someone who asks to be left
-- alone has asked once.

CREATE OR REPLACE FUNCTION public.service_unsubscribe_marketing_delivery(
  p_delivery_id uuid,
  p_source text DEFAULT 'one_click'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery public.marketing_deliveries%ROWTYPE;
  v_contact public.marketing_contacts%ROWTYPE;
  v_reason text;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'Delivery identifier is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery FROM public.marketing_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Never disclose whether the identifier exists: the caller is unauthenticated.
    RETURN jsonb_build_object('ok', true, 'applied', false);
  END IF;

  v_reason := 'Desabonnement demande par le destinataire (' ||
    CASE WHEN p_source = 'one_click' THEN 'un clic RFC 8058' ELSE left(coalesce(p_source, 'lien'), 60) END || ')';

  UPDATE public.marketing_deliveries SET
    status = CASE WHEN status IN ('sent','delivered','opened','clicked','converted')
                  THEN 'unsubscribed' ELSE status END,
    unsubscribed_at = COALESCE(unsubscribed_at, now())
  WHERE id = v_delivery.id;

  IF v_delivery.contact_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', true, 'contact_suppressed', false);
  END IF;

  SELECT * INTO v_contact FROM public.marketing_contacts WHERE id = v_delivery.contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', true, 'contact_suppressed', false);
  END IF;

  -- Already suppressed: repeating the request is a no-op, which matters because
  -- some clients prefetch the unsubscribe URL.
  IF v_contact.opted_out_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'applied', true, 'contact_suppressed', true, 'already', true);
  END IF;

  PERFORM set_config(
    'app.marketing_lawful_basis_context',
    jsonb_build_object(
      'source', 'marketing_one_click_unsubscribe',
      'note', v_reason,
      'recorded_at', clock_timestamp(),
      'quality', 'system_event',
      'source_system', 'marketing_unsubscribe'
    )::text,
    true
  );

  UPDATE public.marketing_contacts SET
    opted_out_at = now(),
    lifecycle_status = 'opted_out',
    lawful_basis = 'none',
    suppression_reason = left(v_reason, 500),
    next_action_at = NULL,
    metadata = metadata || jsonb_build_object('email_suppressed', true)
  WHERE id = v_contact.id;

  -- Anything still queued for this contact dies with the request.
  UPDATE public.marketing_deliveries SET
    status = 'cancelled',
    last_error = 'Contact suppressed',
    unsubscribed_at = COALESCE(unsubscribed_at, now()),
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE contact_id = v_contact.id
    AND status IN ('queued','leased','processing','retrying','manual_required','blocked_configuration');

  INSERT INTO public.marketing_events (campaign_id, item_id, delivery_id, event_type, provider, occurred_at, metadata)
  SELECT i.campaign_id, v_delivery.item_id, v_delivery.id, 'unsubscribed', 'one_click', now(), '{}'::jsonb
  FROM public.marketing_calendar_items i WHERE i.id = v_delivery.item_id;

  RETURN jsonb_build_object('ok', true, 'applied', true, 'contact_suppressed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.service_unsubscribe_marketing_delivery(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_unsubscribe_marketing_delivery(uuid, text)
  TO service_role;
