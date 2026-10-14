BEGIN;

-- A paid TOK invoice is queued ONCE even when Stripe delivers both
-- invoice.paid and invoice.payment_succeeded (or retries either event).
-- The unique key is an immutable internal invoice UUID, not an email address.
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_queue_tok_paid_invoice
ON public.email_queue ((metadata ->> 'tok_paid_invoice_id'))
WHERE (metadata ->> 'tok_paid_invoice_id') IS NOT NULL;

CREATE OR REPLACE FUNCTION private_finance.tok_invoice_html_escape(v text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = ''
AS $$
 SELECT replace(replace(replace(replace(replace(v,'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$$;
REVOKE ALL ON FUNCTION private_finance.tok_invoice_html_escape(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_finance.tok_invoice_html_escape(text) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_tok_paid_invoice_email(
  p_payment_reference text,
  p_source_kind text DEFAULT 'stripe_invoice'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $tok_email$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_restaurant_name text;
  v_email text;
  v_line_count integer;
  v_total numeric;
  v_lines_html text;
  v_lines_text text;
  v_reference text;
  v_url text;
  v_html text;
  v_text text;
  v_inserted integer;
  v_paid_amount text;
  v_ht_amount text;
  v_tva_amount text;
BEGIN
  -- This entrypoint is called ONLY after a trusted Stripe paid event.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='service_role_required';
  END IF;
  IF NULLIF(btrim(p_payment_reference),'') IS NULL
     OR p_source_kind NOT IN ('stripe_invoice','checkout_session') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_paid_invoice_reference';
  END IF;

  IF p_source_kind = 'stripe_invoice' THEN
    SELECT * INTO v_invoice FROM public.restaurant_invoices inv
    WHERE inv.invoice_type='subscription'
      AND (inv.stripe_invoice_id = p_payment_reference
        OR inv.metadata->>'stripe_latest_invoice_id' = p_payment_reference)
    ORDER BY inv.paid_at DESC NULLS LAST LIMIT 1;
  ELSE
    SELECT inv.* INTO v_invoice
    FROM public.restaurant_invoices inv
    JOIN public.restaurant_invoice_line_items line ON line.invoice_id=inv.id
    WHERE inv.invoice_type='payable'
      AND line.metadata->>'stripe_checkout_session_id'=p_payment_reference
    ORDER BY inv.paid_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('queued',false,'reason','tok_invoice_not_recorded_yet');
  END IF;

  IF v_invoice.status<>'paid' OR v_invoice.paid_at IS NULL
    OR v_invoice.amount_ttc <= 0
    OR upper(coalesce(v_invoice.currency,'CHF')) <> 'CHF' THEN
    RETURN jsonb_build_object('queued',false,'reason','invoice_not_confirmed_paid');
  END IF;

  -- Email only the VERIFIED account owner's email, never a client-supplied
  -- URL, unverified billing address or recipient from the webhook payload.
  SELECT restaurant.name, usr.email
    INTO v_restaurant_name,v_email
  FROM public.restaurants restaurant
  JOIN auth.users usr ON usr.id=restaurant.owner_id
  WHERE restaurant.id=v_invoice.restaurant_id
    AND usr.email_confirmed_at IS NOT NULL
  LIMIT 1;
  IF NULLIF(btrim(coalesce(v_email,'')),'') IS NULL THEN
    RETURN jsonb_build_object('queued',false,'reason','verified_owner_email_missing','invoice_id',v_invoice.id);
  END IF;

  SELECT count(*)::integer,coalesce(sum(li.amount_ttc),0),
     string_agg(format(
       '<tr><td style="padding:12px 14px;border-bottom:1px solid #f1f5f9">%s × %s</td><td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right">%s CHF</td></tr>',
       private_finance.tok_invoice_html_escape(coalesce(li.source_label,li.item_kind)),
       li.quantity::text,li.amount_ttc::text),'' ORDER BY li.created_at,li.id),
     string_agg(format('%s x %s : %s CHF',coalesce(li.source_label,li.item_kind),li.quantity,li.amount_ttc),E'\n' ORDER BY li.created_at,li.id)
  INTO v_line_count,v_total,v_lines_html,v_lines_text
  FROM public.restaurant_invoice_line_items li WHERE li.invoice_id=v_invoice.id;

  IF v_line_count=0 OR abs(v_total-v_invoice.amount_ttc)>0.009 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tok_invoice_lines_total_mismatch';
  END IF;

  v_reference := coalesce(nullif(v_invoice.invoice_number,''),v_invoice.id::text);
  v_url := 'https://www.thetok.ch/dashboard/factures/sorties?invoice='||v_invoice.id::text;
  v_paid_amount := to_char(v_invoice.amount_ttc,'FM9999999990.00');
  v_ht_amount := to_char(v_invoice.amount_ht,'FM9999999990.00');
  v_tva_amount := to_char(v_invoice.amount_tva,'FM9999999990.00');

  v_html := format(
    '<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">'
    ||'<div style="max-width:660px;background:white;border-radius:20px;border:1px solid #fed7aa;margin:auto;overflow:hidden">'
    ||'<header style="padding:24px;background:#fff7ed;border-bottom:3px solid #ff5b14">'
    ||'<img src="https://www.thetok.ch/logotok.png" alt="TOK" width="92" style="max-height:92px;object-fit:contain">'
    ||'<h1 style="color:#ff5b14;margin:8px 0">Facture TOK — payée</h1></header>'
    ||'<main style="padding:26px"><p>Bonjour %s,</p><p>Nous confirmons votre paiement. Voici les informations de la facture émise par TOK.</p>'
    ||'<p><strong>Facture :</strong> %s<br><strong>Émetteur :</strong> NEW DOG''S SERVICES Sàrl<br>'
    ||'Rue de Genève 6, 1225 Chêne-Bourg<br><strong>N° TVA :</strong> CHE-109.513.890 TVA</p>'
    ||'<table style="border-collapse:collapse;width:100%%"><tbody>%s</tbody></table>'
    ||'<table style="width:100%%;margin-top:18px">'
    ||'<tr><td>Montant HT</td><td align="right">%s CHF</td></tr>'
    ||'<tr><td>TVA</td><td align="right">%s CHF</td></tr>'
    ||'<tr><td style="font-weight:bold;color:#ff5b14">Total TTC réglé</td>'
    ||'<td align="right" style="font-weight:bold;color:#ff5b14">%s CHF</td></tr></table>'
    ||'<p style="margin-top:24px"><a href="%s" style="color:#fff;background:#ff5b14;padding:13px 18px;border-radius:10px;text-decoration:none">'
    ||'Voir et imprimer ma facture TOK (connexion requise)</a></p>'
    ||'<p style="font-size:12px;color:#64748b">Cet email est un document de confirmation, pas une demande de nouveau paiement.'
    ||' Le document imprimable officiel dans votre dashboard utilise la même facture et les mêmes montants.</p>'
    ||'</main></div></body></html>',
    private_finance.tok_invoice_html_escape(v_restaurant_name),
    private_finance.tok_invoice_html_escape(v_reference),
    v_lines_html,v_ht_amount,v_tva_amount,v_paid_amount,v_url
  );
  v_text := format(
    'Facture TOK %s — payée\nÉmetteur : NEW DOG''S SERVICES Sàrl\nN° TVA : CHE-109.513.890 TVA\n%s\nHT : %s CHF\nTVA : %s CHF\nTTC réglé : %s CHF\nVoir/imprimer votre facture : %s\nAucun nouveau paiement demandé.',
    v_reference,v_lines_text,v_ht_amount,v_tva_amount,v_paid_amount,v_url
  );

  INSERT INTO public.email_queue(to_email,subject,body_html,body_text,metadata)
  VALUES (
    v_email, 'Votre facture TOK payée — '||v_reference,
    v_html,v_text,
    jsonb_build_object(
      'transactional_email',true,
      'transactional_email_key','tok-paid-invoice:'||v_invoice.id::text,
      'tok_paid_invoice_id',v_invoice.id::text,
      'restaurant_id',v_invoice.restaurant_id,
      'source_kind',p_source_kind,
      'payment_reference',p_payment_reference,
      'recipient_role','verified_restaurant_owner',
      'invoice_number',v_reference
    )
  ) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;

  RETURN jsonb_build_object('queued',v_inserted=1,'duplicate',v_inserted=0,'invoice_id',v_invoice.id);
END
$tok_email$;

REVOKE ALL ON FUNCTION public.queue_tok_paid_invoice_email(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_tok_paid_invoice_email(text,text) TO service_role;

COMMIT;
