-- Disposable PostgreSQL fixture: migration must already be applied. Rollback all data.
BEGIN;
DO $$
DECLARE role_name text; statement text; denied boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.marketing_instagram_reviews'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE 'SET LOCAL ROLE ' || quote_ident(role_name);
    FOREACH statement IN ARRAY ARRAY[
      'SELECT * FROM public.marketing_instagram_reviews',
      'INSERT INTO public.marketing_instagram_reviews DEFAULT VALUES',
      'UPDATE public.marketing_instagram_reviews SET status = ''approved''',
      'DELETE FROM public.marketing_instagram_reviews'
    ] LOOP
      denied := false;
      BEGIN EXECUTE statement;
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      IF NOT denied THEN RAISE EXCEPTION 'unexpected permission for %: %', role_name, statement; END IF;
    END LOOP;
    RESET ROLE;
  END LOOP;
END $$;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111') ON CONFLICT DO NOTHING;
SET LOCAL ROLE service_role;
INSERT INTO public.marketing_instagram_reviews(fingerprint, requested_by, payload, token_hash, chat_id, expires_at)
VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','{"replyText":"@foodie exact"}',repeat('b',64),'123',now()+interval '1 day');
DO $$
DECLARE affected integer;
BEGIN
  BEGIN
    INSERT INTO public.marketing_instagram_reviews(fingerprint, requested_by, payload, token_hash, chat_id, expires_at)
    VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','{}',repeat('c',64),'123',now()+interval '1 day');
    RAISE EXCEPTION 'duplicate draft accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.marketing_instagram_reviews SET payload='{"replyText":"changed"}' WHERE fingerprint=repeat('a',64);
    RAISE EXCEPTION 'snapshot mutation accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.marketing_instagram_reviews SET status='approved', decided_at=now(), decision_actor='telegram:456', message_id=42
    WHERE token_hash=repeat('b',64) AND chat_id='123' AND status IN ('pending','delivering','delivery_unknown') AND expires_at>now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'first decision rejected'; END IF;
  UPDATE public.marketing_instagram_reviews SET status='rejected', decided_at=now(), decision_actor='telegram:456'
    WHERE token_hash=repeat('b',64) AND chat_id='123' AND status IN ('pending','delivering','delivery_unknown') AND expires_at>now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'decision replay accepted'; END IF;
  BEGIN
    UPDATE public.marketing_instagram_reviews SET status='rejected' WHERE fingerprint=repeat('a',64);
    RAISE EXCEPTION 'final decision mutation accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
