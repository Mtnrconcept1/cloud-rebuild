DO $$
BEGIN
  IF to_regclass('public.delivery_batches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for delivery_batches" ON public.delivery_batches';
    EXECUTE 'CREATE POLICY "Require auth for delivery_batches" ON public.delivery_batches FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.delivery_batches TO authenticated';
  END IF;

  IF to_regclass('public.delivery_routes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for delivery_routes" ON public.delivery_routes';
    EXECUTE 'CREATE POLICY "Require auth for delivery_routes" ON public.delivery_routes FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.delivery_routes TO authenticated';
  END IF;

  IF to_regclass('public.proof_of_delivery') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for proof_of_delivery" ON public.proof_of_delivery';
    EXECUTE 'CREATE POLICY "Require auth for proof_of_delivery" ON public.proof_of_delivery FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.proof_of_delivery TO authenticated';
  END IF;

  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for payment_intents" ON public.payment_intents';
    EXECUTE 'CREATE POLICY "Require auth for payment_intents" ON public.payment_intents FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.payment_intents TO authenticated';
  END IF;

  IF to_regclass('public.payout_batches') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for payout_batches" ON public.payout_batches';
    EXECUTE 'CREATE POLICY "Require auth for payout_batches" ON public.payout_batches FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.payout_batches TO authenticated';
  END IF;

  IF to_regclass('public.payouts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for payouts" ON public.payouts';
    EXECUTE 'CREATE POLICY "Require auth for payouts" ON public.payouts FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.payouts TO authenticated';
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for invoices" ON public.invoices';
    EXECUTE 'CREATE POLICY "Require auth for invoices" ON public.invoices FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.invoices TO authenticated';
  END IF;

  IF to_regclass('public.credit_notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for credit_notes" ON public.credit_notes';
    EXECUTE 'CREATE POLICY "Require auth for credit_notes" ON public.credit_notes FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.credit_notes TO authenticated';
  END IF;

  IF to_regclass('public.loyalty_tiers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for loyalty_tiers" ON public.loyalty_tiers';
    EXECUTE 'CREATE POLICY "Require auth for loyalty_tiers" ON public.loyalty_tiers FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.loyalty_tiers TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_tiers TO authenticated';
  END IF;

  IF to_regclass('public.loyalty_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for loyalty_accounts" ON public.loyalty_accounts';
    EXECUTE 'CREATE POLICY "Require auth for loyalty_accounts" ON public.loyalty_accounts FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.loyalty_accounts TO authenticated';
  END IF;

  IF to_regclass('public.subscription_benefits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subscription_benefits ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for subscription_benefits" ON public.subscription_benefits';
    EXECUTE 'CREATE POLICY "Require auth for subscription_benefits" ON public.subscription_benefits FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.subscription_benefits TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_benefits TO authenticated';
  END IF;

  IF to_regclass('public.gift_cards') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for gift_cards" ON public.gift_cards';
    EXECUTE 'CREATE POLICY "Require auth for gift_cards" ON public.gift_cards FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.gift_cards TO authenticated';
  END IF;

  IF to_regclass('public.review_replies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for review_replies" ON public.review_replies';
    EXECUTE 'CREATE POLICY "Require auth for review_replies" ON public.review_replies FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.review_replies TO authenticated';
  END IF;

  IF to_regclass('public.incident_reports') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for incident_reports" ON public.incident_reports';
    EXECUTE 'CREATE POLICY "Require auth for incident_reports" ON public.incident_reports FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated';
  END IF;

  IF to_regclass('public.compensations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.compensations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for compensations" ON public.compensations';
    EXECUTE 'CREATE POLICY "Require auth for compensations" ON public.compensations FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.compensations TO authenticated';
  END IF;

  IF to_regclass('public.reservation_tables') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_tables ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for reservation_tables" ON public.reservation_tables';
    EXECUTE 'CREATE POLICY "Require auth for reservation_tables" ON public.reservation_tables FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.reservation_tables TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_tables TO authenticated';
  END IF;

  IF to_regclass('public.reservation_slots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_slots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for reservation_slots" ON public.reservation_slots';
    EXECUTE 'CREATE POLICY "Require auth for reservation_slots" ON public.reservation_slots FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT ON public.reservation_slots TO anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_slots TO authenticated';
  END IF;

  IF to_regclass('public.reservation_status_history') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.reservation_status_history ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for reservation_status_history" ON public.reservation_status_history';
    EXECUTE 'CREATE POLICY "Require auth for reservation_status_history" ON public.reservation_status_history FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.reservation_status_history TO authenticated';
  END IF;

  IF to_regclass('public.event_store') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.event_store ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for event_store" ON public.event_store';
    EXECUTE 'CREATE POLICY "Require auth for event_store" ON public.event_store FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.event_store TO authenticated';
  END IF;

  IF to_regclass('public.feature_store') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.feature_store ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for feature_store" ON public.feature_store';
    EXECUTE 'CREATE POLICY "Require auth for feature_store" ON public.feature_store FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.feature_store TO authenticated';
  END IF;

  IF to_regclass('public.recommendation_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.recommendation_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for recommendation_logs" ON public.recommendation_logs';
    EXECUTE 'CREATE POLICY "Require auth for recommendation_logs" ON public.recommendation_logs FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.recommendation_logs TO authenticated';
  END IF;

  IF to_regclass('public.ml_predictions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ml_predictions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for ml_predictions" ON public.ml_predictions';
    EXECUTE 'CREATE POLICY "Require auth for ml_predictions" ON public.ml_predictions FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.ml_predictions TO authenticated';
  END IF;

  IF to_regclass('public.fraud_signals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for fraud_signals" ON public.fraud_signals';
    EXECUTE 'CREATE POLICY "Require auth for fraud_signals" ON public.fraud_signals FOR ALL USING (auth.role() = ''authenticated'')';
    EXECUTE 'GRANT SELECT, INSERT ON public.fraud_signals TO authenticated';
  END IF;
END
$$;
