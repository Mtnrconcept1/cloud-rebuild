-- Run after marketing_growth_engine_fixture.sql and the new migration on a disposable database.
-- This validates the growth boundary with fixture auth; existing BFF tests cover real HTTP/session routing.
BEGIN;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_growth_sites','marketing_growth_profiles','marketing_growth_articles','marketing_growth_revisions','marketing_growth_jobs','marketing_growth_budgets','marketing_growth_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'RLS missing: %',t; END IF;
  IF has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('authenticated','public.'||t,'INSERT') OR has_table_privilege('service_role','public.'||t,'UPDATE') THEN RAISE EXCEPTION 'Direct privilege leaked: %',t; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.service_marketing_growth_operation(text,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Dispatcher exposed'; END IF;
 BEGIN PERFORM public.service_claim_marketing_growth_job(100,'model'); RAISE EXCEPTION 'Non-service claim accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE a jsonb; j jsonb; result jsonb; doc jsonb; v bigint; BEGIN
 BEGIN PERFORM public.service_marketing_growth_operation(repeat('0',64),repeat('2',64),'admin_get_marketing_growth','{}'); RAISE EXCEPTION 'Bad session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.service_marketing_growth_operation(repeat('1',64),'','admin_get_marketing_growth','{}'); RAISE EXCEPTION 'Bad CSRF accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'service_claim_marketing_growth_job','{}'); RAISE EXCEPTION 'Worker operation dispatched'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_save_marketing_growth_profile',
 '{"expectedVersion":1,"approve":true,"profile":{"name":"TOK","positioning":"Réservation","audience":"Clients","voice":"Clair","facts":"Réserver selon disponibilité.","approvedUrls":["https://www.thetok.ch/"]}}');
 a:=public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_save_marketing_growth_article','{"slug":"reserver-geneve","brief":"Expliquer comment réserver une table à Genève."}');
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_enqueue_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',1));
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_enqueue_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',1));
 IF (SELECT count(*) FROM public.marketing_growth_jobs)<>1 THEN RAISE EXCEPTION 'Queue duplicate'; END IF;
 j:=public.service_claim_marketing_growth_job(200000,'fixture-model');
 IF j->>'status'<>'paused' THEN RAISE EXCEPTION 'Initial pause bypassed'; END IF;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_configure_marketing_growth','{"expectedVersion":2,"paused":false,"budgetMicros":null}');
 j:=public.service_claim_marketing_growth_job(200000,'fixture-model');
 IF j->>'status'<>'blocked' THEN RAISE EXCEPTION 'Missing budget bypassed'; END IF;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_configure_marketing_growth','{"expectedVersion":3,"paused":false,"budgetMicros":1000000}');
 j:=public.service_claim_marketing_growth_job(200000,'fixture-model');
 IF j->>'status'<>'running' THEN RAISE EXCEPTION 'Job not claimed'; END IF;
 IF (public.service_claim_marketing_growth_job(200000,'fixture-model'))->>'status'<>'idle' THEN RAISE EXCEPTION 'Running job reclaimed'; END IF;
 IF (SELECT sum(reserved_micros) FROM public.marketing_growth_budgets)<>200000 THEN RAISE EXCEPTION 'Budget double-reserved'; END IF;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_save_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',1,'slug','reserver-geneve','brief','Une modification concurrente du brief.'));
 doc:='{"title":"Réserver une table","description":"Conseils pour réserver.","summary":"Préparer sa visite.","language":"fr-CH","sections":[{"heading":"Préparer","paragraphs":["Consultez TOK."],"sourceIds":["tok"]}],"faq":[],"links":[],"sources":[{"id":"tok","url":"https://www.thetok.ch/","title":"TOK","checkedAt":"2026-11-01T08:00:00.000Z"}]}';
 result:=public.service_finish_marketing_growth_job((j->>'id')::uuid,(j->>'leaseToken')::uuid,doc);
 IF result->>'status'<>'cancelled' OR EXISTS(SELECT 1 FROM public.marketing_growth_revisions) THEN RAISE EXCEPTION 'Stale result committed'; END IF;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_enqueue_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',2));
 j:=public.service_claim_marketing_growth_job(200000,'fixture-model');
 result:=public.service_finish_marketing_growth_job((j->>'id')::uuid,(j->>'leaseToken')::uuid,doc);
 IF result->>'status'<>'succeeded' THEN RAISE EXCEPTION 'Completion failed'; END IF;
 BEGIN PERFORM public.service_finish_marketing_growth_job((j->>'id')::uuid,(j->>'leaseToken')::uuid,doc); RAISE EXCEPTION 'Completion replay accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_approve_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',3,'revision',1,'reason','Faits et sources vérifiés en fixture.'));
 PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_save_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',4,'slug','reserver-geneve','brief','Une nouvelle version après approbation.','document',doc));
 IF (SELECT approved_revision FROM public.marketing_growth_articles WHERE id=(a->>'id')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'Stale approval retained'; END IF;
 IF (SELECT count(*) FROM public.marketing_growth_revisions)<>2 THEN RAISE EXCEPTION 'History overwritten'; END IF;
 BEGIN PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_approve_marketing_growth_article',jsonb_build_object('articleId',a->>'id','expectedVersion',4,'revision',1,'reason','Faits et sources vérifiés en fixture.')); RAISE EXCEPTION 'Stale review accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 DELETE FROM public.user_roles;
 BEGIN PERFORM public.service_marketing_growth_operation(repeat('1',64),repeat('2',64),'admin_get_marketing_growth','{}'); RAISE EXCEPTION 'Revoked admin accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
ROLLBACK;
