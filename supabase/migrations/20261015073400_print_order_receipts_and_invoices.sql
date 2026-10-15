BEGIN;

-- Send both merchant documents once per paid print order (including Stripe/Cloudprinter sandbox).
-- This is an outbox operation; payment finalization never waits for Resend.
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_queue_print_order_email_key
  ON public.email_queue ((metadata ->> 'print_order_email_key'))
  WHERE (metadata ->> 'print_order_email_key') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.queue_print_order_emails(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $print_email$
DECLARE
  v_order public.print_orders%ROWTYPE;
  v_quote public.print_quotes%ROWTYPE;
  v_restaurant_name text;
  v_email text;
  v_mode text;
  v_sandbox boolean;
  v_items_html text;
  v_items_text text;
  v_items_count integer;
  v_reference text;
  v_invoice_number text;
  v_date text;
  v_shipping text;
  v_shipping_html text;
  v_shipping_level text;
  v_amount text;
  v_tax text;
  v_net text;
  v_quote_amount text;
  v_total_cents integer;
  v_net_cents integer;
  v_tax_cents integer;
  v_description text;
  v_html text;
  v_text text;
  v_inserted integer;
  v_queued integer := 0;
  v_link text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='service_role_required';
  END IF;

  SELECT * INTO v_order FROM public.print_orders
  WHERE id = p_order_id AND payment_status = 'paid';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('queued', 0, 'reason', 'print_order_not_paid');
  END IF;

  SELECT * INTO v_quote FROM public.print_quotes
  WHERE id = v_order.print_quote_id AND restaurant_id = v_order.restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='print_quote_missing';
  END IF;

  SELECT r.name, u.email INTO v_restaurant_name, v_email
  FROM public.restaurants r
  JOIN auth.users u ON u.id = r.owner_id
  WHERE r.id = v_order.restaurant_id AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
  IF NULLIF(btrim(coalesce(v_email, '')), '') IS NULL THEN
    RETURN jsonb_build_object('queued', 0, 'reason', 'verified_restaurant_owner_email_missing');
  END IF;

  SELECT pa.mode INTO v_mode
  FROM public.payment_attempts pa WHERE pa.id = v_order.payment_attempt_id;
  v_sandbox := COALESCE(v_mode = 'test', false);

  SELECT count(*)::integer,
    string_agg(
      '<tr><td style="padding:12px;border-bottom:1px solid #e5e7eb">'
      || private_finance.tok_invoice_html_escape(item.title)
      || '</td><td style="padding:12px;border-bottom:1px solid #e5e7eb;text-align:center">'
      || item.quantity::text
      || '</td><td style="padding:12px;border-bottom:1px solid #e5e7eb">'
      || private_finance.tok_invoice_html_escape(item.provider_product_reference)
      || '</td></tr>',
      '' ORDER BY item.created_at, item.id),
    string_agg(
      item.title || ' × ' || item.quantity::text
      || ' (' || item.provider_product_reference || ')',
      E'\n' ORDER BY item.created_at, item.id)
  INTO v_items_count, v_items_html, v_items_text
  FROM public.print_order_items item
  WHERE item.print_order_id = v_order.id AND item.restaurant_id = v_order.restaurant_id;

  IF v_items_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='print_invoice_items_missing';
  END IF;

  v_reference := coalesce(nullif(v_order.provider_reference, ''), v_order.id::text);
  v_invoice_number := 'TOK-PRINT-' || upper(replace(v_order.id::text, '-', ''));
  v_date := to_char(coalesce(v_order.paid_at, now()) AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI');
  v_shipping := concat_ws(', ',
    nullif(v_order.shipping_address->>'company', ''),
    nullif(concat_ws(' ', v_order.shipping_address->>'firstname', v_order.shipping_address->>'lastname'), ''),
    nullif(v_order.shipping_address->>'street1', ''),
    nullif(v_order.shipping_address->>'street2', ''),
    nullif(concat_ws(' ', v_order.shipping_address->>'zip', v_order.shipping_address->>'city'), ''),
    nullif(v_order.shipping_address->>'country', ''));
  v_shipping_html := private_finance.tok_invoice_html_escape(v_shipping);
  v_shipping_level := coalesce(nullif(v_order.selected_shipping->>'shipping_level', ''),
    nullif(v_order.selected_shipping->>'shipping_option', ''), 'Standard');
  v_total_cents := CASE WHEN v_sandbox THEN 0 ELSE v_order.customer_amount_cents END;
  -- Swiss domestic advertising prints are normally charged at the standard 8.1% rate.
  -- Customer total is tax-inclusive; never copy Cloudprinter wholesale VAT into a retail invoice.
  v_net_cents := round(v_total_cents::numeric / 1.081)::integer;
  v_tax_cents := v_total_cents - v_net_cents;
  v_net := to_char(v_net_cents / 100.0, 'FM9999999990.00');
  v_tax := to_char(v_tax_cents / 100.0, 'FM9999999990.00');
  v_amount := to_char(v_total_cents / 100.0, 'FM9999999990.00');
  v_quote_amount := to_char(v_quote.customer_amount_cents / 100.0, 'FM9999999990.00');
  v_link := 'https://www.thetok.ch/dashboard/photos?print_order_id=' || v_order.id::text;
  v_description := CASE WHEN v_sandbox THEN
    'MODE TEST : commande simulée, paiement à 0.00 CHF. Aucun prélèvement effectué, document sans valeur fiscale.'
    ELSE 'Commande payée : impression et livraison incluses dans le prix total TTC.'
  END;

  v_html := format(
    '<!doctype html><html lang="fr"><meta charset="utf-8"><body style="margin:0;padding:24px;background:#fff7ed;font-family:Arial,sans-serif;color:#1f2937">'
    ||'<main style="max-width:720px;margin:auto;padding:28px;background:white;border:1px solid #fed7aa;border-radius:16px">'
    ||'<h1 style="color:#ea580c">TOK — Facture d''impression%s</h1>'
    ||'<p><strong>N° de facture :</strong> %s<br><strong>Date :</strong> %s<br><strong>Référence commande :</strong> %s</p>'
    ||'<p><strong>Émetteur :</strong> NEW DOG''S SERVICES Sàrl<br>Rue de Genève 6, 1225 Chêne-Bourg<br>CHE-109.513.890 TVA</p>'
    ||'<p><strong>Destinataire :</strong> %s<br><strong>Adresse de livraison :</strong> %s<br><strong>Livraison :</strong> %s</p>'
    ||'<table style="width:100%%;border-collapse:collapse"><thead><tr><th align="left">Produit</th><th>Exemplaires</th><th align="left">Référence fournisseur</th></tr></thead><tbody>%s</tbody></table>'
    ||'<p>Impression et livraison comprises dans le montant global.</p>'
    ||'<table style="margin-top:20px;width:100%%">'
    ||'<tr><td>Montant HT</td><td align="right">%s CHF</td></tr>'
    ||'<tr><td>TVA Suisse (8,1 %%)</td><td align="right">%s CHF</td></tr>'
    ||'<tr><td><strong>Total TTC réglé</strong></td><td align="right"><strong>%s CHF</strong></td></tr></table>'
    ||'<p style="color:#92400e"><strong>%s</strong></p>'
    ||'%s'
    ||'<p><a href="%s">Consulter la commande dans votre espace TOK</a></p>'
    ||'</main></body></html>',
    CASE WHEN v_sandbox THEN ' — TEST' ELSE '' END,
    private_finance.tok_invoice_html_escape(v_invoice_number),
    private_finance.tok_invoice_html_escape(v_date),
    private_finance.tok_invoice_html_escape(v_reference),
    private_finance.tok_invoice_html_escape(v_restaurant_name),
    v_shipping_html, private_finance.tok_invoice_html_escape(v_shipping_level),
    v_items_html, v_net, v_tax, v_amount,
    private_finance.tok_invoice_html_escape(v_description),
    CASE WHEN v_sandbox THEN '<p>Montant du devis hors test : ' || v_quote_amount || ' CHF (indicatif, non facturé).</p>' ELSE '' END,
    v_link
  );

  v_text := format(
    'TOK — facture impression %s\nN° %s\nDate : %s\nÉmetteur : NEW DOG''S SERVICES Sàrl, Rue de Genève 6, 1225 Chêne-Bourg, CHE-109.513.890 TVA\nRestaurant : %s\nCommande : %s\nLivraison : %s (%s)\n%s\nHT : %s CHF\nTVA 8,1 %% : %s CHF\nTTC réglé : %s CHF\n%s\n%s',
    CASE WHEN v_sandbox THEN 'TEST' ELSE '' END,
    v_invoice_number, v_date, v_restaurant_name, v_reference, v_shipping,
    v_shipping_level, v_items_text, v_net, v_tax, v_amount, v_description, v_link
  );

  INSERT INTO public.email_queue(to_email, subject, body_html, body_text, metadata)
  VALUES (
    v_email,
    'Confirmation TOK Print ' || v_reference || CASE WHEN v_sandbox THEN ' [TEST]' ELSE '' END,
    format('<h2>Votre commande d''impression TOK est confirmée%s</h2><p>Bonjour %s,</p><p>Référence : %s — %s</p><p>Livraison : %s</p><p>%s</p><pre>%s</pre><p>Total TTC réglé : %s CHF.</p><p><a href="%s">Détails de ma commande</a></p>',
      CASE WHEN v_sandbox THEN ' (TEST)' ELSE '' END,
      private_finance.tok_invoice_html_escape(v_restaurant_name),
      private_finance.tok_invoice_html_escape(v_reference),
      private_finance.tok_invoice_html_escape(v_date),
      v_shipping_html, private_finance.tok_invoice_html_escape(v_description),
      private_finance.tok_invoice_html_escape(v_items_text), v_amount, v_link),
    format('Commande impression confirmée%s\nRéférence : %s\nDate : %s\nLivraison : %s\n%s\nTotal TTC réglé : %s CHF\n%s\n%s',
      CASE WHEN v_sandbox THEN ' (TEST)' ELSE '' END,
      v_reference, v_date, v_shipping, v_items_text, v_amount, v_description, v_link),
    jsonb_build_object(
      'transactional_email', true,
      'transactional_email_key', 'print-order:' || v_order.id::text || ':confirmation',
      'print_order_email_key', 'print-order:' || v_order.id::text || ':confirmation',
      'print_order_id', v_order.id::text,
      'recipient_role', 'verified_restaurant_owner', 'document', 'confirmation',
      'test_mode', v_sandbox
    )
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_queued := v_queued + v_inserted;

  INSERT INTO public.email_queue(to_email, subject, body_html, body_text, metadata)
  VALUES (
    v_email, 'Facture TOK Print ' || v_invoice_number || CASE WHEN v_sandbox THEN ' [TEST]' ELSE '' END,
    v_html, v_text,
    jsonb_build_object(
      'transactional_email', true,
      'transactional_email_key', 'print-order:' || v_order.id::text || ':invoice',
      'print_order_email_key', 'print-order:' || v_order.id::text || ':invoice',
      'print_order_id', v_order.id::text,
      'invoice_number', v_invoice_number,
      'recipient_role', 'verified_restaurant_owner', 'document', 'invoice',
      'test_mode', v_sandbox
    )
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_queued := v_queued + v_inserted;

  RETURN jsonb_build_object('queued', v_queued, 'duplicate', v_queued = 0,
    'order_id', v_order.id, 'test_mode', v_sandbox, 'invoice_number', v_invoice_number);
END
$print_email$;

REVOKE ALL ON FUNCTION public.queue_print_order_emails(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_print_order_emails(uuid) TO service_role;

COMMIT;
