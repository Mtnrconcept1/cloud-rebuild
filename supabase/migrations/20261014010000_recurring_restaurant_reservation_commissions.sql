-- TOK recurring restaurant commissions, explicitly opt-in and fail-closed.
-- Never hold a card authorization for a future booking: Stripe card holds expire.
-- Collect CHF 5 only when a genuine customer's table is genuinely honored.
-- Historical charges and accounts that did not accept the new mandate are never auto-debited.
-- IMPORTANT: collection is OFF by default until the commercial/legal Stripe test-mode gate is approved.

CREATE TABLE IF NOT EXISTS public.reservation_commission_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_fee_charge_id uuid NOT NULL UNIQUE REFERENCES public.reservation_flat_fee_charges(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL DEFAULT 500 CHECK (amount_cents = 500),
  currency text NOT NULL DEFAULT 'CHF' CHECK (currency = 'CHF'),
  state text NOT NULL DEFAULT 'queued' CHECK (
    state IN ('queued','processing','processing_payment','paid','requires_action','failed','review_required','refunded','disputed')
  ),
  invoice_id uuid UNIQUE REFERENCES public.restaurant_invoices(id) ON DELETE RESTRICT,
  stripe_mode text CHECK (stripe_mode IN ('live','test')),
  stripe_payment_intent_id text UNIQUE,
  stripe_charge_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  settled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_commission_collections_claim
  ON public.reservation_commission_collections (next_attempt_at, created_at)
  WHERE state IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_reservation_commission_collections_restaurant
  ON public.reservation_commission_collections (restaurant_id, created_at DESC);
ALTER TABLE public.reservation_commission_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_commission_collections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reservation_commission_collections TO authenticated;
GRANT ALL ON public.reservation_commission_collections TO service_role;
DROP POLICY IF EXISTS restaurant_commission_read_own ON public.reservation_commission_collections;
CREATE POLICY restaurant_commission_read_own
  ON public.reservation_commission_collections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants restaurant
      WHERE restaurant.id = restaurant_id AND restaurant.owner_id = (SELECT auth.uid())
    ) OR (SELECT public.auth_is_admin())
  );

-- Preparing a locally issued invoice does not collect money.
-- The existing paid-invoice finance trigger books TOK revenue, Swiss VAT,
-- and the developer allocation only when the invoice becomes paid.
CREATE OR REPLACE FUNCTION private_finance.open_reservation_commission_invoice(p_collection_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_item public.reservation_commission_collections%ROWTYPE;
  v_fee public.reservation_flat_fee_charges%ROWTYPE;
  v_invoice_id uuid;
  v_vat_bps integer;
  v_vat_cents integer;
  v_net_cents integer;
  v_local_date date;
BEGIN
  SELECT * INTO v_item FROM public.reservation_commission_collections
    WHERE id=p_collection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_commission_not_found'; END IF;
  IF v_item.invoice_id IS NOT NULL THEN RETURN v_item.invoice_id; END IF;
  IF v_item.state NOT IN ('queued','review_required') THEN
    RAISE EXCEPTION 'reservation_commission_invoice_invalid_state';
  END IF;
  -- Serialize against the legacy invoice generator so the same table
  -- cannot receive two invoices when both billing paths race.
  SELECT * INTO v_fee FROM public.reservation_flat_fee_charges
    WHERE id=v_item.flat_fee_charge_id FOR UPDATE;
  IF v_fee.id IS NULL OR v_fee.reservation_id<>v_item.reservation_id
    OR v_fee.restaurant_id<>v_item.restaurant_id OR v_fee.fee_cents<>500 THEN
    RAISE EXCEPTION 'reservation_commission_fee_integrity_failed';
  END IF;
  -- An already-assigned flat-fee invoice must not be invoiced a second time.
  IF v_fee.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'reservation_commission_already_invoiced';
  END IF;
  SELECT COALESCE(standard_vat_bps,810) INTO v_vat_bps
    FROM public.finance_runtime_config WHERE config_key='default';
  v_vat_bps := COALESCE(v_vat_bps,810);
  v_vat_cents := round(500::numeric * v_vat_bps/(10000+v_vat_bps))::integer;
  v_net_cents := 500-v_vat_cents;
  v_local_date := (v_fee.honored_at_snapshot AT TIME ZONE 'Europe/Zurich')::date;

  INSERT INTO public.restaurant_invoices (
    restaurant_id, period_start, period_end, amount_ht, amount_tva, amount_ttc,
    status, invoice_number, invoice_type, currency, issued_at, vat_rate_bps, metadata
  ) VALUES (
    v_item.restaurant_id,v_local_date,v_local_date,v_net_cents/100.0,v_vat_cents/100.0,5.00,
    'open','TOK-RF-'||replace(v_item.reservation_id::text,'-',''),
    'reservation_fees','CHF',now(),v_vat_bps,
    jsonb_build_object('reservation_id',v_item.reservation_id,
      'flat_fee_charge_id',v_item.flat_fee_charge_id,
      'commission_collection_id',v_item.id,'payment_confirmed',false)
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.restaurant_invoice_line_items (
    invoice_id,restaurant_id,item_kind,source_table,source_id,source_label,occurred_at,
    quantity,unit_amount,base_amount,amount_ht,amount_tva,amount_ttc,metadata
  ) VALUES (
    v_invoice_id,v_item.restaurant_id,'reservation_fee','reservation_flat_fee_charges',
    v_item.flat_fee_charge_id,'Table réservée et honorée',v_fee.honored_at_snapshot,
    1,5.00,5.00,v_net_cents/100.0,v_vat_cents/100.0,5.00,
    jsonb_build_object('reservation_id',v_item.reservation_id,
      'collection_id',v_item.id,'fee_cents',500)
  );
  UPDATE public.reservation_flat_fee_charges SET invoice_id=v_invoice_id
    WHERE id=v_item.flat_fee_charge_id AND invoice_id IS NULL;
  UPDATE public.reservation_commission_collections
    SET invoice_id=v_invoice_id,state='queued',updated_at=now()
    WHERE id=p_collection_id;
  RETURN v_invoice_id;
END $fn$;
REVOKE ALL ON FUNCTION private_finance.open_reservation_commission_invoice(uuid)
  FROM PUBLIC,anon,authenticated;

-- Trigger runs AFTER UPDATE, after legacy BEFORE UPDATE issued its single
-- flat fee. Automatic "arrived" transitions require owner verification before
-- billing; they cannot silently debit a saved bank card.
CREATE OR REPLACE FUNCTION private_finance.stage_reservation_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_fee_id uuid; v_collection_id uuid; v_auto boolean;
BEGIN
  IF NOT public.is_flat_arrival_billing_candidate(
    NEW.status, OLD.status, OLD.honored_at
  ) OR NEW.honored_at IS NULL
     OR NOT public.restaurant_subscription_genuine_client(NEW.user_id,NEW.restaurant_id)
     OR COALESCE(NEW.status,'') NOT IN ('arrived','seated','completed')
  THEN RETURN NEW; END IF;
  -- An old contract never authorizes variable off-session debits.
  -- The feature flag is OFF by default; no new invoices until the rollout.
  IF NOT COALESCE((
    SELECT (config.metadata->>'reservation_commission_auto_debit_enabled')::boolean
    FROM public.finance_runtime_config config WHERE config.config_key='default'
  ),false) OR NOT EXISTS (
    SELECT 1
    FROM public.restaurant_ai_subscriptions subscription
    JOIN public.signup_applications application
      ON application.id=subscription.signup_application_id
    WHERE subscription.restaurant_id=NEW.restaurant_id
      AND application.metadata->>'commission_auto_debit_consent_version'='v1'
      AND NULLIF(application.metadata->>'commission_auto_debit_consent_accepted_at','') IS NOT NULL
  ) THEN RETURN NEW; END IF;
  SELECT fee.id INTO v_fee_id FROM public.reservation_flat_fee_charges fee
    WHERE fee.reservation_id=NEW.id AND fee.fee_cents=500;
  IF v_fee_id IS NULL THEN RETURN NEW; END IF;
  v_auto := COALESCE(NEW.metadata ? 'auto_arrived_at',false);
  INSERT INTO public.reservation_commission_collections (
    flat_fee_charge_id,reservation_id,restaurant_id,state
  ) VALUES (
    v_fee_id,NEW.id,NEW.restaurant_id,
    CASE WHEN v_auto THEN 'review_required' ELSE 'queued' END
  ) ON CONFLICT (reservation_id) DO NOTHING
  RETURNING id INTO v_collection_id;
  IF v_collection_id IS NOT NULL AND NOT v_auto THEN
    PERFORM private_finance.open_reservation_commission_invoice(v_collection_id);
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private_finance.stage_reservation_commission()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stage_reservation_commission_after_honoring ON public.reservations;
CREATE TRIGGER stage_reservation_commission_after_honoring
 AFTER UPDATE OF status ON public.reservations FOR EACH ROW
 EXECUTE FUNCTION private_finance.stage_reservation_commission();

-- Restaurateur can confirm a formerly automatic arrival with explicit action;
-- only this can release an auto-arrival invoice for debit. No backend-only
-- timer can silently assert the client actually visited.
CREATE OR REPLACE FUNCTION public.confirm_auto_arrived_reservation_commission(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_item public.reservation_commission_collections%ROWTYPE; v_owner uuid;
BEGIN
  SELECT * INTO v_item FROM public.reservation_commission_collections
    WHERE reservation_id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_item.state <> 'review_required' THEN RETURN false; END IF;
  SELECT owner_id INTO v_owner FROM public.restaurants WHERE id=v_item.restaurant_id;
  IF auth.uid() IS NULL OR (
    auth.uid() IS DISTINCT FROM v_owner AND NOT public.auth_is_admin()
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden'; END IF;
  PERFORM private_finance.open_reservation_commission_invoice(v_item.id);
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_auto_arrived_reservation_commission(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_auto_arrived_reservation_commission(uuid) TO authenticated;

-- Claim only if the restaurant explicitly accepted the new recurring variable
-- debit mandate at signup, its Stripe subscription has been PAID and is active,
-- and the production feature switch is enabled by a deliberate rollout.
CREATE OR REPLACE FUNCTION public.claim_restaurant_commission_collections(
  p_limit integer DEFAULT 10
) RETURNS TABLE (
  job_id uuid, restaurant_id uuid, reservation_id uuid, invoice_id uuid,
  amount_cents integer, stripe_customer_id text, stripe_payment_method_id text,
  stripe_subscription_id text, stripe_mode text, attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v record;
BEGIN
  IF NOT COALESCE((
    SELECT (metadata->>'reservation_commission_auto_debit_enabled')::boolean
    FROM public.finance_runtime_config WHERE config_key='default'
  ),false) THEN RETURN; END IF;
  FOR v IN
    SELECT collection.*,pm.stripe_customer_id AS customer,
      pm.stripe_payment_method_id AS payment_method,
      sub.stripe_subscription_id AS subscription_id,pm.stripe_mode AS mode
    FROM public.reservation_commission_collections collection
    JOIN public.reservations reservation
      ON reservation.id=collection.reservation_id
      AND reservation.restaurant_id=collection.restaurant_id
      AND reservation.status IN ('arrived','seated','completed')
      AND reservation.cancelled_by IS NULL
    JOIN public.restaurant_ai_subscriptions sub
      ON sub.restaurant_id=collection.restaurant_id AND sub.status='active'
      AND sub.stripe_subscription_id IS NOT NULL
    JOIN public.restaurant_subscription_payment_methods pm
      ON pm.subscription_id=sub.id AND pm.stripe_mode=sub.stripe_mode
    JOIN public.signup_applications app ON app.id=sub.signup_application_id
    WHERE collection.state IN ('queued','processing')
      AND collection.invoice_id IS NOT NULL
      AND collection.next_attempt_at<=now()
      AND (collection.state='queued'
        OR collection.lease_expires_at < now())
      AND COALESCE(app.metadata->>'commission_auto_debit_consent_version','')='v1'
      AND COALESCE(app.metadata->>'commission_auto_debit_consent_accepted_at','')<>''
      AND collection.attempt_count<3
    ORDER BY collection.created_at
    FOR UPDATE OF collection SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit,10),1),20)
  LOOP
    -- Retrying an unacknowledged Stripe creation after a long interruption is
    -- ambiguous when the idempotency key has expired: stop for manual review.
    IF v.attempt_count > 0 AND v.created_at < now() - interval '20 hours'
      AND v.stripe_payment_intent_id IS NULL THEN
      UPDATE public.reservation_commission_collections
        SET state='review_required',last_error_code='stripe_idempotency_expired_review',
            lease_expires_at=NULL,updated_at=now() WHERE id=v.id;
      CONTINUE;
    END IF;
    UPDATE public.reservation_commission_collections collection
       SET state='processing',attempt_count=collection.attempt_count+1,
         lease_expires_at=now()+interval '5 minutes',updated_at=now()
       WHERE id=v.id;
    job_id:=v.id;restaurant_id:=v.restaurant_id;reservation_id:=v.reservation_id;
    invoice_id:=v.invoice_id;amount_cents:=v.amount_cents;
    stripe_customer_id:=v.customer;stripe_payment_method_id:=v.payment_method;
    stripe_subscription_id:=v.subscription_id;stripe_mode:=v.mode;
    attempt_count:=v.attempt_count+1;
    RETURN NEXT;
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_restaurant_commission_collections(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_commission_collections(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.record_restaurant_commission_payment(
  p_collection_id uuid,p_payment_intent_id text,p_stripe_status text,
  p_stripe_mode text,p_error_code text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v public.reservation_commission_collections%ROWTYPE; v_status text;
BEGIN
  IF COALESCE(p_payment_intent_id,'') !~ '^pi_[A-Za-z0-9]+$'
    OR p_stripe_mode NOT IN ('live','test') THEN
    RAISE EXCEPTION 'invalid_commission_payment_identity';
  END IF;
  SELECT * INTO v FROM public.reservation_commission_collections
    WHERE id=p_collection_id FOR UPDATE;
  IF NOT FOUND OR v.invoice_id IS NULL OR v.amount_cents<>500 THEN
    RAISE EXCEPTION 'invalid_commission_payment_target';
  END IF;
  IF v.stripe_mode IS NOT NULL AND v.stripe_mode<>p_stripe_mode THEN
    RAISE EXCEPTION 'stripe_commission_mode_mismatch';
  END IF;
  IF v.stripe_payment_intent_id IS NOT NULL
    AND v.stripe_payment_intent_id<>p_payment_intent_id THEN
    RAISE EXCEPTION 'stripe_commission_payment_conflict';
  END IF;
  IF v.state IN ('refunded','disputed') THEN RETURN v.state; END IF;
  IF v.state='paid' THEN RETURN v.state; END IF;
  v_status:=CASE
    WHEN p_stripe_status='succeeded' THEN 'paid'
    WHEN p_stripe_status IN ('processing','requires_capture') THEN 'processing_payment'
    WHEN p_stripe_status IN ('requires_action','requires_payment_method') THEN 'requires_action'
    ELSE 'failed' END;
  UPDATE public.reservation_commission_collections
    SET state=v_status,stripe_payment_intent_id=p_payment_intent_id,
        stripe_mode=p_stripe_mode,
        last_error_code=CASE WHEN v_status='paid' THEN NULL
          ELSE left(COALESCE(p_error_code,p_stripe_status),100) END,
        settled_at=CASE WHEN v_status='paid' THEN now() ELSE NULL END,
        lease_expires_at=NULL,updated_at=now()
    WHERE id=v.id;
  IF v_status='paid' THEN
    UPDATE public.restaurant_invoices
      SET status='paid',paid_at=COALESCE(paid_at,now()),
        metadata=metadata||jsonb_build_object('stripe_payment_intent_id',
          p_payment_intent_id,'payment_confirmed',true,'stripe_mode',p_stripe_mode),
        updated_at=now()
      WHERE id=v.invoice_id AND status<>'paid';
  ELSIF v_status IN ('failed','requires_action') THEN
    UPDATE public.restaurant_invoices
      SET status='past_due',updated_at=now()
      WHERE id=v.invoice_id AND status<>'paid';
  END IF;
  RETURN v_status;
END $fn$;
REVOKE ALL ON FUNCTION public.record_restaurant_commission_payment(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_restaurant_commission_payment(uuid,text,text,text,text)
 TO service_role;

-- Webhook refund/dispute reversal: never rewrite historical ledger receipts.
-- A successful refund or confirmed dispute creates exactly one reversing entry
-- per original journal entry (including VAT and developer allocation).
CREATE OR REPLACE FUNCTION public.reverse_restaurant_commission_payment(
  p_payment_intent_id text,p_reason text,p_stripe_mode text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v public.reservation_commission_collections%ROWTYPE; v_entry record;
BEGIN
  IF p_reason NOT IN ('refund','dispute') OR p_stripe_mode NOT IN ('live','test')
    THEN RAISE EXCEPTION 'invalid_commission_reversal'; END IF;
  SELECT * INTO v FROM public.reservation_commission_collections
    WHERE stripe_payment_intent_id=p_payment_intent_id AND stripe_mode=p_stripe_mode
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v.state IN ('refunded','disputed') THEN RETURN true; END IF;
  -- A refund/dispute may arrive before the payment-success event.
  IF v.state <> 'paid' THEN
    UPDATE public.reservation_commission_collections
      SET state=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
        refunded_at=CASE WHEN p_reason='refund' THEN now() ELSE NULL END,
        updated_at=now() WHERE id=v.id;
    UPDATE public.restaurant_invoices
      SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
        updated_at=now() WHERE id=v.invoice_id AND status<>'paid';
    RETURN true;
  END IF;
  UPDATE public.reservation_commission_collections
    SET state=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
      refunded_at=CASE WHEN p_reason='refund' THEN now() ELSE NULL END,
      updated_at=now() WHERE id=v.id;
  UPDATE public.restaurant_invoices
    SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
      updated_at=now() WHERE id=v.invoice_id AND status='paid';
  FOR v_entry IN SELECT entry_id,account_code,direction,amount_cents,currency,
      restaurant_id,metadata,stripe_mode,livemode
    FROM public.financial_ledger ledger
    WHERE ledger.source_type='restaurant_invoice'
      AND ledger.source_id=v.invoice_id::text AND ledger.reversal_of IS NULL
  LOOP
    INSERT INTO public.financial_ledger(
      source_type,source_id,restaurant_id,account_code,direction,
      amount_cents,currency,effective_at,reversal_of,metadata,stripe_mode,livemode
    ) SELECT 'reservation_commission_reversal',v.id::text,
      v_entry.restaurant_id,v_entry.account_code,
      CASE WHEN v_entry.direction='debit' THEN 'credit' ELSE 'debit' END,
      v_entry.amount_cents,v_entry.currency,now(),v_entry.entry_id,
      v_entry.metadata||jsonb_build_object('reversal_reason',p_reason,
        'payment_intent_id',p_payment_intent_id),v_entry.stripe_mode,v_entry.livemode
    WHERE NOT EXISTS(SELECT 1 FROM public.financial_ledger existing
      WHERE existing.reversal_of=v_entry.entry_id);
  END LOOP;
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.reverse_restaurant_commission_payment(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_restaurant_commission_payment(text,text,text)
 TO service_role;

-- Only an actual funds-reinstated webhook may restore dispute revenue.
CREATE OR REPLACE FUNCTION public.restore_restaurant_commission_dispute(
  p_payment_intent_id text,p_stripe_mode text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v public.reservation_commission_collections%ROWTYPE; v_entry record;
BEGIN
  IF p_stripe_mode NOT IN ('live','test') THEN
    RAISE EXCEPTION 'invalid_commission_reinstatement_mode';
  END IF;
  SELECT * INTO v FROM public.reservation_commission_collections
    WHERE stripe_payment_intent_id=p_payment_intent_id
      AND stripe_mode=p_stripe_mode FOR UPDATE;
  IF NOT FOUND OR v.state NOT IN ('disputed','paid') THEN RETURN false; END IF;
  IF v.state='paid' THEN RETURN true; END IF;
  UPDATE public.restaurant_invoices
    SET status='paid',paid_at=COALESCE(paid_at,now()),updated_at=now(),
      metadata=metadata||jsonb_build_object('dispute_reinstated_at',now())
    WHERE id=v.invoice_id AND status='disputed';
  FOR v_entry IN SELECT entry_id,account_code,direction,amount_cents,
      currency,restaurant_id,metadata,stripe_mode,livemode
    FROM public.financial_ledger entry
    WHERE entry.source_type='reservation_commission_reversal'
      AND entry.source_id=v.id::text
      AND entry.metadata->>'reversal_reason'='dispute'
  LOOP
    INSERT INTO public.financial_ledger (
      source_type,source_id,restaurant_id,account_code,direction,
      amount_cents,currency,effective_at,reversal_of,metadata,stripe_mode,livemode
    )
    SELECT 'reservation_commission_reinstatement',v.id::text,
      v_entry.restaurant_id,v_entry.account_code,
      CASE WHEN v_entry.direction='debit' THEN 'credit' ELSE 'debit' END,
      v_entry.amount_cents,v_entry.currency,now(),v_entry.entry_id,
      v_entry.metadata||jsonb_build_object(
        'reinstatement_payment_intent_id',p_payment_intent_id),
      v_entry.stripe_mode,v_entry.livemode
    WHERE NOT EXISTS (
      SELECT 1 FROM public.financial_ledger existing
      WHERE existing.reversal_of=v_entry.entry_id
    );
  END LOOP;
  UPDATE public.reservation_commission_collections
    SET state='paid',updated_at=now() WHERE id=v.id;
  RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.restore_restaurant_commission_dispute(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_restaurant_commission_dispute(text,text)
 TO service_role;

-- Do not backfill old reservations or activate production collection in SQL.
-- Finance operators enable the controlled rollout ONLY after Stripe test-mode
-- scenarios, consent coverage, and legal review are accepted.

CREATE OR REPLACE FUNCTION public.fail_restaurant_commission_collection(
  p_collection_id uuid,p_error_code text,p_retryable boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v public.reservation_commission_collections%ROWTYPE; v_next text;
BEGIN
  SELECT * INTO v FROM public.reservation_commission_collections
    WHERE id=p_collection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commission_collection_not_found'; END IF;
  IF v.state IN ('paid','refunded','disputed','review_required') THEN RETURN v.state; END IF;
  v_next:=CASE WHEN p_retryable AND v.attempt_count<3 THEN 'queued'
    WHEN COALESCE(p_error_code,'') LIKE '%authentication%' THEN 'requires_action'
    ELSE 'failed' END;
  UPDATE public.reservation_commission_collections
    SET state=v_next,last_error_code=left(COALESCE(p_error_code,'unknown'),100),
      lease_expires_at=NULL,next_attempt_at=now()+interval '15 minutes',updated_at=now()
    WHERE id=p_collection_id;
  RETURN v_next;
END $fn$;
REVOKE ALL ON FUNCTION public.fail_restaurant_commission_collection(uuid,text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_restaurant_commission_collection(uuid,text,boolean)
 TO service_role;


-- Track Stripe PLATFORM payouts to TOK's own bank. Stripe already maintains
-- the bank linkage and its payout schedule. Connect transfers are not payouts.
CREATE TABLE IF NOT EXISTS public.tok_bank_payout_reconciliations (
  stripe_payout_id text PRIMARY KEY CHECK (stripe_payout_id LIKE 'po_%'),
  amount_cents integer NOT NULL CHECK(amount_cents > 0),
  currency text NOT NULL DEFAULT 'CHF' CHECK(currency='CHF'),
  status text NOT NULL CHECK(status IN('pending','in_transit','paid','failed','canceled')),
  destination_id text,
  arrival_date timestamptz,
  paid_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tok_bank_payout_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_bank_payout_reconciliations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tok_bank_payout_reconciliations TO service_role;
GRANT SELECT ON public.tok_bank_payout_reconciliations TO authenticated;
DROP POLICY IF EXISTS tok_bank_payouts_admin_only ON public.tok_bank_payout_reconciliations;
CREATE POLICY tok_bank_payouts_admin_only
  ON public.tok_bank_payout_reconciliations FOR SELECT TO authenticated
  USING ((SELECT public.auth_is_admin()));

CREATE OR REPLACE FUNCTION public.record_tok_bank_payout(
  p_stripe_payout_id text,p_amount_cents integer,p_currency text,
  p_status text,p_destination_id text DEFAULT NULL,
  p_arrival_date timestamptz DEFAULT NULL,p_error_code text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v public.tok_bank_payout_reconciliations%ROWTYPE; v_now timestamptz:=now();
BEGIN
  IF p_stripe_payout_id !~ '^po_[A-Za-z0-9]+$'
    OR p_amount_cents<=0 OR upper(p_currency)<>'CHF'
    OR p_status NOT IN ('pending','in_transit','paid','failed','canceled') THEN
    RAISE EXCEPTION 'invalid_stripe_bank_payout_event';
  END IF;
  INSERT INTO public.tok_bank_payout_reconciliations(
    stripe_payout_id,amount_cents,currency,status,destination_id,arrival_date,last_error_code
  ) VALUES (
    p_stripe_payout_id,p_amount_cents,'CHF',p_status,p_destination_id,
    p_arrival_date,left(p_error_code,100)
  ) ON CONFLICT(stripe_payout_id) DO NOTHING;
  SELECT * INTO v FROM public.tok_bank_payout_reconciliations
    WHERE stripe_payout_id=p_stripe_payout_id FOR UPDATE;
  IF v.amount_cents<>p_amount_cents OR v.currency<>'CHF' THEN
    RAISE EXCEPTION 'stripe_bank_payout_amount_mismatch';
  END IF;
  IF v.status IN ('paid','failed','canceled')
    AND p_status IN ('pending','in_transit') THEN RETURN v.status; END IF;
  IF p_status='paid' THEN
    INSERT INTO public.financial_ledger(
      source_type,source_id,account_code,direction,amount_cents,currency,
      effective_at,metadata,stripe_mode,livemode
    ) VALUES
      ('stripe_payout',p_stripe_payout_id,'bank_chf','debit',p_amount_cents,'CHF',
        v_now,jsonb_build_object('stripe_payout_id',p_stripe_payout_id),'live',true),
      ('stripe_payout',p_stripe_payout_id,'payment_asset','credit',p_amount_cents,'CHF',
        v_now,jsonb_build_object('stripe_payout_id',p_stripe_payout_id),'live',true)
    ON CONFLICT DO NOTHING;
  END IF;
  IF p_status='failed' AND v.status='paid' THEN
    INSERT INTO public.financial_ledger(
      source_type,source_id,account_code,direction,amount_cents,currency,
      effective_at,metadata,stripe_mode,livemode
    ) VALUES
      ('stripe_payout_failure',p_stripe_payout_id,'bank_chf','credit',p_amount_cents,'CHF',
        v_now,jsonb_build_object('stripe_payout_id',p_stripe_payout_id),'live',true),
      ('stripe_payout_failure',p_stripe_payout_id,'payment_asset','debit',p_amount_cents,'CHF',
        v_now,jsonb_build_object('stripe_payout_id',p_stripe_payout_id),'live',true)
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.tok_bank_payout_reconciliations
     SET status=p_status,destination_id=COALESCE(p_destination_id,destination_id),
         arrival_date=COALESCE(p_arrival_date,arrival_date),
         paid_at=CASE WHEN p_status='paid' THEN COALESCE(paid_at,v_now) ELSE paid_at END,
         last_error_code=CASE WHEN p_status='failed' THEN left(p_error_code,100) ELSE NULL END,
         updated_at=v_now
   WHERE stripe_payout_id=p_stripe_payout_id;
  RETURN p_status;
END $fn$;
REVOKE ALL ON FUNCTION public.record_tok_bank_payout(text,integer,text,text,text,timestamp with time zone,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_tok_bank_payout(text,integer,text,text,text,timestamp with time zone,text)
 TO service_role;
