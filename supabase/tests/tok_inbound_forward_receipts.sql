-- Run after 20261021093000_tok_inbound_forward_receipts.sql in a disposable database.
BEGIN;
DO $$
DECLARE v_id uuid := '11111111-1111-4111-8111-111111111111'; v_count int; v_token uuid;
BEGIN
  IF has_table_privilege('anon', 'public.tok_inbound_forward_receipts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.tok_inbound_forward_receipts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.tok_inbound_forward_receipts', 'INSERT') THEN
    RAISE EXCEPTION 'Private receipt table is exposed';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tok_inbound_forward_receipts'::regclass) THEN
    RAISE EXCEPTION 'RLS must remain enabled';
  END IF;
  INSERT INTO public.tok_inbound_forward_receipts(received_id) VALUES (v_id);
  INSERT INTO public.tok_inbound_forward_receipts(received_id) VALUES (v_id) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_count FROM public.tok_inbound_forward_receipts WHERE received_id = v_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Duplicate receipt'; END IF;
  SELECT lease_token INTO v_token FROM public.tok_inbound_forward_receipts WHERE received_id = v_id;
  UPDATE public.tok_inbound_forward_receipts SET lease_token = gen_random_uuid(), status = 'sending', lease_until = now() + interval '2 minutes'
    WHERE received_id = v_id AND lease_token = v_token AND status IN ('pending', 'sending') AND lease_until <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'First lease must succeed'; END IF;
  UPDATE public.tok_inbound_forward_receipts SET lease_token = gen_random_uuid()
    WHERE received_id = v_id AND lease_token = v_token AND status IN ('pending', 'sending') AND lease_until <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Competing lease must fail'; END IF;
  BEGIN
    UPDATE public.tok_inbound_forward_receipts SET status = 'sent' WHERE received_id = v_id;
    RAISE EXCEPTION 'Sent receipt without provider ID must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.tok_inbound_forward_receipts SET status = 'sent', provider_message_id = '22222222-2222-4222-8222-222222222222' WHERE received_id = v_id;
  UPDATE public.tok_inbound_forward_receipts SET status = 'sending'
    WHERE received_id = v_id AND status IN ('pending', 'sending');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Completed receipt must remain terminal'; END IF;
END $$;
ROLLBACK;
