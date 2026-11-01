-- Additive, isolated editorial domain. No public reader or external publication is enabled.
BEGIN;
CREATE TABLE public.marketing_growth_sites (
 site_key text PRIMARY KEY CHECK (site_key = 'tok'),
 profile jsonb, profile_version integer NOT NULL DEFAULT 0,
 profile_approved_by uuid REFERENCES auth.users(id), profile_approved_at timestamptz,
 paused boolean NOT NULL DEFAULT true,
 monthly_budget_micros bigint CHECK (monthly_budget_micros BETWEEN 0 AND 1000000000),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.marketing_growth_sites(site_key) VALUES ('tok');
CREATE TABLE public.marketing_growth_profiles (
 site_key text NOT NULL REFERENCES public.marketing_growth_sites(site_key), version integer NOT NULL,
 profile jsonb NOT NULL, approved_by uuid NOT NULL REFERENCES auth.users(id), approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(site_key,version)
);
CREATE TABLE public.marketing_growth_articles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_key text NOT NULL DEFAULT 'tok' REFERENCES public.marketing_growth_sites(site_key),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 120),
 brief text NOT NULL CHECK (length(brief) BETWEEN 10 AND 4000),
 version integer NOT NULL DEFAULT 1, current_revision integer, approved_revision integer,
 approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_key,slug)
);
CREATE TABLE public.marketing_growth_revisions (
 article_id uuid NOT NULL REFERENCES public.marketing_growth_articles(id), revision integer NOT NULL,
 profile_version integer NOT NULL, document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND octet_length(document::text) <= 100000),
 origin text NOT NULL CHECK (origin IN ('editor','openai')), created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(article_id,revision)
);
CREATE TABLE public.marketing_growth_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), article_id uuid NOT NULL REFERENCES public.marketing_growth_articles(id),
 expected_version integer NOT NULL, profile_version integer NOT NULL, requested_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled','reconcile')),
 error_code text, lease_token uuid, lease_expires_at timestamptz,
 reserved_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0), budget_month date,
 model text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(article_id,expected_version)
);
CREATE TABLE public.marketing_growth_budgets (
 site_key text NOT NULL REFERENCES public.marketing_growth_sites(site_key), month date NOT NULL,
 reserved_micros bigint NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0), PRIMARY KEY(site_key,month)
);
CREATE TABLE public.marketing_growth_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, article_id uuid REFERENCES public.marketing_growth_articles(id),
 actor_id uuid REFERENCES auth.users(id), action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_growth_articles_page ON public.marketing_growth_articles(site_key,updated_at DESC,id DESC);
CREATE INDEX marketing_growth_jobs_queue ON public.marketing_growth_jobs(created_at,id) WHERE status = 'queued';
CREATE INDEX marketing_growth_jobs_lease ON public.marketing_growth_jobs(lease_expires_at) WHERE status = 'running';
CREATE INDEX marketing_growth_events_article ON public.marketing_growth_events(article_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_growth_sites','marketing_growth_profiles','marketing_growth_articles','marketing_growth_revisions','marketing_growth_jobs','marketing_growth_budgets','marketing_growth_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END; $$;

-- Internal operations are reachable ONLY after BFF session verification below.
CREATE FUNCTION public.service_marketing_growth_operation(p_sid_hash text,p_csrf_hash text,p_operation text,p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 sess jsonb; actor uuid; s public.marketing_growth_sites%ROWTYPE; a public.marketing_growth_articles%ROWTYPE;
 result jsonb; payload jsonb; v_id uuid; doc jsonb; v_rev integer; v_offset integer; v_limit integer; allowed text[]; required text[];
BEGIN
 PERFORM public.marketing_require_service_role();
 IF COALESCE(p_csrf_hash ~ '^[0-9a-f]{64}$',false) IS NOT TRUE OR jsonb_typeof(p_args) IS DISTINCT FROM 'object'
  OR octet_length(p_args::text)>120000 THEN RAISE EXCEPTION 'Invalid growth arguments' USING ERRCODE='22023'; END IF;
 sess := public.service_get_marketing_web_session(p_sid_hash,p_csrf_hash,true);
 actor := NULLIF(sess->>'user_id','')::uuid;
 IF actor IS NULL OR sess->>'mfa_verified_at' IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role::text='admin')
 THEN RAISE EXCEPTION 'Active marketing BFF session and CSRF proof required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.marketing_actor_user_id',actor::text,true);
 CASE p_operation
  WHEN 'admin_get_marketing_growth' THEN allowed:=ARRAY['offset','limit','articleId','revision']; required:=ARRAY[]::text[];
  WHEN 'admin_save_marketing_growth_profile' THEN allowed:=ARRAY['expectedVersion','profile','approve']; required:=allowed;
  WHEN 'admin_configure_marketing_growth' THEN allowed:=ARRAY['expectedVersion','paused','budgetMicros']; required:=allowed;
  WHEN 'admin_save_marketing_growth_article' THEN allowed:=ARRAY['articleId','expectedVersion','slug','brief','document']; required:=ARRAY['slug','brief'];
  WHEN 'admin_approve_marketing_growth_article' THEN allowed:=ARRAY['articleId','expectedVersion','revision','reason']; required:=allowed;
  WHEN 'admin_enqueue_marketing_growth_article' THEN allowed:=ARRAY['articleId','expectedVersion']; required:=allowed;
  ELSE RAISE EXCEPTION 'Growth operation is not allowlisted' USING ERRCODE='22023';
 END CASE;
 IF NOT (p_args ?& required) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_args) k WHERE NOT (k=ANY(allowed))) THEN
  RAISE EXCEPTION 'Invalid growth arguments' USING ERRCODE='22023';
 END IF;
 SELECT * INTO STRICT s FROM public.marketing_growth_sites WHERE site_key='tok' FOR UPDATE;
 CASE p_operation
 WHEN 'admin_get_marketing_growth' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_args) k WHERE k NOT IN ('offset','limit','articleId','revision')) THEN RAISE EXCEPTION 'Invalid growth arguments' USING ERRCODE='22023'; END IF;
  v_offset:=COALESCE((p_args->>'offset')::integer,0); v_limit:=COALESCE((p_args->>'limit')::integer,20);
  IF v_offset NOT BETWEEN 0 AND 100000 OR v_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid growth pagination' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC,x.id DESC),'[]') INTO result FROM
   (SELECT ar.* FROM public.marketing_growth_articles ar WHERE ar.site_key='tok' ORDER BY ar.updated_at DESC,ar.id DESC LIMIT v_limit OFFSET v_offset) x;
  RETURN jsonb_build_object('site',to_jsonb(s),'articles',result,'total',(SELECT count(*) FROM public.marketing_growth_articles WHERE site_key='tok'),
   'revisions',COALESCE((SELECT jsonb_agg((CASE WHEN r.revision=(SELECT current_revision FROM public.marketing_growth_articles WHERE id=r.article_id) OR r.revision=(p_args->>'revision')::integer THEN to_jsonb(r) ELSE to_jsonb(r)-'document' END) ORDER BY r.revision DESC) FROM (SELECT * FROM public.marketing_growth_revisions WHERE article_id=(p_args->>'articleId')::uuid ORDER BY revision DESC LIMIT 10) r),'[]'),
   'jobs',COALESCE((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.created_at DESC) FROM (SELECT * FROM public.marketing_growth_jobs ORDER BY created_at DESC LIMIT 30) j),'[]'),
   'reservedMicros',COALESCE((SELECT reserved_micros FROM public.marketing_growth_budgets WHERE site_key='tok' AND month=date_trunc('month',now() AT TIME ZONE 'Europe/Zurich')::date),0));
 WHEN 'admin_save_marketing_growth_profile' THEN
  IF (p_args->>'expectedVersion')::integer IS DISTINCT FROM s.version OR jsonb_typeof(p_args->'profile') IS DISTINCT FROM 'object'
    OR p_args->'approve' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Growth configuration conflict' USING ERRCODE='40001'; END IF;
  payload:=p_args->'profile';
  IF octet_length(payload::text)>20000 OR jsonb_typeof(payload->'approvedUrls') IS DISTINCT FROM 'array'
    OR jsonb_array_length(payload->'approvedUrls') NOT BETWEEN 1 AND 30 OR length(payload->>'facts') NOT BETWEEN 1 AND 12000
  THEN RAISE EXCEPTION 'Invalid growth profile' USING ERRCODE='22023'; END IF;
  INSERT INTO public.marketing_growth_profiles(site_key,version,profile,approved_by) VALUES('tok',s.profile_version+1,payload,actor);
  UPDATE public.marketing_growth_sites SET profile=payload,profile_version=profile_version+1,profile_approved_by=actor,profile_approved_at=now(),version=version+1,updated_at=now() WHERE site_key='tok';
  INSERT INTO public.marketing_growth_events(actor_id,action,detail) VALUES(actor,'profile_approved',jsonb_build_object('version',s.profile_version+1));
 WHEN 'admin_configure_marketing_growth' THEN
  IF (p_args->>'expectedVersion')::integer IS DISTINCT FROM s.version OR jsonb_typeof(p_args->'paused') IS DISTINCT FROM 'boolean'
    OR (p_args->'budgetMicros'<>'null'::jsonb AND (jsonb_typeof(p_args->'budgetMicros') IS DISTINCT FROM 'number' OR (p_args->>'budgetMicros')::bigint NOT BETWEEN 0 AND 1000000000))
  THEN RAISE EXCEPTION 'Growth configuration conflict' USING ERRCODE='40001'; END IF;
  UPDATE public.marketing_growth_sites SET paused=(p_args->>'paused')::boolean,monthly_budget_micros=(p_args->>'budgetMicros')::bigint,version=version+1,updated_at=now() WHERE site_key='tok';
  INSERT INTO public.marketing_growth_events(actor_id,action,detail) VALUES(actor,'configuration_changed',p_args-'expectedVersion');
 WHEN 'admin_save_marketing_growth_article' THEN
  IF length(p_args->>'brief') NOT BETWEEN 10 AND 4000 OR (p_args->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Invalid growth article' USING ERRCODE='22023'; END IF;
  v_id:=NULLIF(p_args->>'articleId','')::uuid;
  IF v_id IS NULL THEN
   INSERT INTO public.marketing_growth_articles(slug,brief,created_by) VALUES(p_args->>'slug',p_args->>'brief',actor) RETURNING * INTO a;
  ELSE
   SELECT * INTO a FROM public.marketing_growth_articles WHERE id=v_id AND site_key='tok' FOR UPDATE;
   IF NOT FOUND OR a.slug IS DISTINCT FROM p_args->>'slug' OR (p_args->>'expectedVersion')::integer IS DISTINCT FROM a.version THEN RAISE EXCEPTION 'Growth article conflict' USING ERRCODE='40001'; END IF;
   UPDATE public.marketing_growth_articles SET brief=p_args->>'brief',version=version+1,approved_revision=NULL,approved_by=NULL,approved_at=NULL,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  END IF;
  doc:=p_args->'document';
  IF doc IS NOT NULL AND doc<>'null'::jsonb THEN
   IF s.profile_version=0 OR jsonb_typeof(doc) IS DISTINCT FROM 'object' OR octet_length(doc::text)>100000 OR jsonb_typeof(doc->'sections') IS DISTINCT FROM 'array'
     OR jsonb_array_length(doc->'sections') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid growth document' USING ERRCODE='22023'; END IF;
   v_rev:=COALESCE(a.current_revision,0)+1;
   INSERT INTO public.marketing_growth_revisions(article_id,revision,profile_version,document,origin,created_by) VALUES(a.id,v_rev,s.profile_version,doc,'editor',actor);
   UPDATE public.marketing_growth_articles SET current_revision=v_rev WHERE id=a.id RETURNING * INTO a;
  END IF;
  INSERT INTO public.marketing_growth_events(actor_id,article_id,action,detail) VALUES(actor,a.id,'article_saved',jsonb_build_object('version',a.version));
  RETURN to_jsonb(a);
 WHEN 'admin_approve_marketing_growth_article' THEN
  SELECT * INTO a FROM public.marketing_growth_articles WHERE id=(p_args->>'articleId')::uuid AND site_key='tok' FOR UPDATE;
  IF NOT FOUND OR (p_args->>'expectedVersion')::integer IS DISTINCT FROM a.version OR a.current_revision IS NULL
    OR (p_args->>'revision')::integer IS DISTINCT FROM a.current_revision THEN RAISE EXCEPTION 'Growth article conflict' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.marketing_growth_revisions WHERE article_id=a.id AND revision=a.current_revision AND profile_version=s.profile_version)
    OR length(trim(p_args->>'reason')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Growth review required' USING ERRCODE='22023'; END IF;
  UPDATE public.marketing_growth_articles SET approved_revision=current_revision,approved_by=actor,approved_at=now(),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.marketing_growth_events(actor_id,article_id,action,detail) VALUES(actor,a.id,'article_approved',jsonb_build_object('revision',a.current_revision,'reason',p_args->>'reason'));
  RETURN to_jsonb(a);
 WHEN 'admin_enqueue_marketing_growth_article' THEN
  SELECT * INTO a FROM public.marketing_growth_articles WHERE id=(p_args->>'articleId')::uuid AND site_key='tok' FOR UPDATE;
  IF NOT FOUND OR (p_args->>'expectedVersion')::integer IS DISTINCT FROM a.version THEN RAISE EXCEPTION 'Growth article conflict' USING ERRCODE='40001'; END IF;
  IF s.profile_version=0 THEN RAISE EXCEPTION 'Growth profile required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.marketing_growth_jobs(article_id,expected_version,profile_version,requested_by) VALUES(a.id,a.version,s.profile_version,actor)
   ON CONFLICT(article_id,expected_version) DO NOTHING;
  INSERT INTO public.marketing_growth_events(actor_id,article_id,action) VALUES(actor,a.id,'generation_requested');
 ELSE RAISE EXCEPTION 'Growth operation is not allowlisted' USING ERRCODE='22023';
 END CASE;
 RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE FUNCTION public.service_claim_marketing_growth_job(p_max_cost_micros bigint,p_model text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.marketing_growth_sites%ROWTYPE; j public.marketing_growth_jobs%ROWTYPE; a public.marketing_growth_articles%ROWTYPE; m date; used bigint;
BEGIN
 PERFORM public.marketing_require_service_role();
 SELECT * INTO STRICT s FROM public.marketing_growth_sites WHERE site_key='tok' FOR UPDATE;
 -- A paid request may have succeeded before a worker died. Never reclaim blindly.
 UPDATE public.marketing_growth_jobs SET status='reconcile',error_code='lease_expired_outcome_unknown',completed_at=now() WHERE status='running' AND lease_expires_at<now();
 IF s.paused OR public.marketing_runtime_enabled() IS NOT TRUE THEN RETURN jsonb_build_object('status','paused'); END IF;
 IF p_max_cost_micros IS NULL OR p_max_cost_micros NOT BETWEEN 1 AND 100000000 OR COALESCE(length(p_model),0) NOT BETWEEN 1 AND 120
 THEN RETURN jsonb_build_object('status','blocked','reason','provider_cost_ceiling_missing'); END IF;
 SELECT * INTO j FROM public.marketing_growth_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','idle'); END IF;
 SELECT * INTO STRICT a FROM public.marketing_growth_articles WHERE id=j.article_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=j.requested_by AND role::text='admin') OR a.version<>j.expected_version OR j.profile_version<>s.profile_version THEN
  UPDATE public.marketing_growth_jobs SET status='cancelled',error_code='stale_authorization_or_revision',completed_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('status','cancelled');
 END IF;
 m:=date_trunc('month',now() AT TIME ZONE 'Europe/Zurich')::date;
 INSERT INTO public.marketing_growth_budgets(site_key,month) VALUES('tok',m) ON CONFLICT DO NOTHING;
 SELECT reserved_micros INTO used FROM public.marketing_growth_budgets WHERE site_key='tok' AND month=m FOR UPDATE;
 IF s.monthly_budget_micros IS NULL OR used+p_max_cost_micros>s.monthly_budget_micros THEN
 UPDATE public.marketing_growth_jobs SET error_code='budget_missing_or_exhausted' WHERE id=j.id;
 RETURN jsonb_build_object('status','blocked','reason','budget_missing_or_exhausted'); END IF;
 UPDATE public.marketing_growth_budgets SET reserved_micros=reserved_micros+p_max_cost_micros WHERE site_key='tok' AND month=m;
 UPDATE public.marketing_growth_jobs SET status='running',error_code=NULL,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '150 seconds',reserved_micros=p_max_cost_micros,budget_month=m,model=p_model WHERE id=j.id RETURNING * INTO j;
 INSERT INTO public.marketing_growth_events(actor_id,article_id,action,detail) VALUES(j.requested_by,a.id,'generation_claimed',jsonb_build_object('jobId',j.id,'reservedMicros',p_max_cost_micros));
 RETURN jsonb_build_object('status','running','id',j.id,'leaseToken',j.lease_token,'profile',s.profile,'profileApprovedAt',s.profile_approved_at,'brief',a.brief,'model',p_model);
END;
$$;

CREATE FUNCTION public.service_finish_marketing_growth_job(p_job_id uuid,p_lease_token uuid,p_document jsonb,p_error_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.marketing_growth_jobs%ROWTYPE; a public.marketing_growth_articles%ROWTYPE; s public.marketing_growth_sites%ROWTYPE; rev integer;
BEGIN
 PERFORM public.marketing_require_service_role();
 SELECT * INTO STRICT s FROM public.marketing_growth_sites WHERE site_key='tok' FOR UPDATE;
 SELECT * INTO j FROM public.marketing_growth_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<now() THEN RAISE EXCEPTION 'Growth lease conflict' USING ERRCODE='40001'; END IF;
 SELECT * INTO STRICT a FROM public.marketing_growth_articles WHERE id=j.article_id FOR UPDATE;
 IF p_error_code IS NOT NULL THEN
  IF p_error_code NOT IN ('provider_outcome_unknown','generated_document_invalid') THEN RAISE EXCEPTION 'Invalid growth error' USING ERRCODE='22023'; END IF;
  UPDATE public.marketing_growth_jobs SET status='reconcile',error_code=p_error_code,completed_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('status','reconcile');
 END IF;
 IF s.paused OR public.marketing_runtime_enabled() IS NOT TRUE OR a.version<>j.expected_version OR s.profile_version<>j.profile_version
   OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=j.requested_by AND role::text='admin') THEN
  UPDATE public.marketing_growth_jobs SET status='cancelled',error_code='stale_authorization_or_revision',completed_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('status','cancelled');
 END IF;
 IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>100000 OR jsonb_typeof(p_document->'sections') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_document->'sections') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid growth document' USING ERRCODE='22023'; END IF;
 rev:=COALESCE(a.current_revision,0)+1;
 INSERT INTO public.marketing_growth_revisions(article_id,revision,profile_version,document,origin,created_by) VALUES(a.id,rev,j.profile_version,p_document,'openai',j.requested_by);
 UPDATE public.marketing_growth_articles SET current_revision=rev,approved_revision=NULL,approved_by=NULL,approved_at=NULL,version=version+1,updated_at=now() WHERE id=a.id;
 UPDATE public.marketing_growth_jobs SET status='succeeded',completed_at=now() WHERE id=j.id;
 INSERT INTO public.marketing_growth_events(actor_id,article_id,action,detail) VALUES(j.requested_by,a.id,'generation_completed',jsonb_build_object('jobId',j.id,'revision',rev));
 RETURN jsonb_build_object('status','succeeded','revision',rev);
END;
$$;
CREATE FUNCTION public.service_expire_marketing_growth_jobs() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.marketing_require_service_role();
 UPDATE public.marketing_growth_jobs SET status='reconcile',error_code='lease_expired_outcome_unknown',completed_at=now() WHERE status='running' AND lease_expires_at<now();
END; $$;
CREATE FUNCTION public.service_note_marketing_growth_block(p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.marketing_require_service_role();
 IF p_reason NOT IN ('provider_cost_ceiling_missing','budget_missing_or_exhausted') THEN RAISE EXCEPTION 'Invalid growth block' USING ERRCODE='22023'; END IF;
 UPDATE public.marketing_growth_jobs SET error_code=p_reason WHERE id IN(SELECT id FROM public.marketing_growth_jobs WHERE status='queued' ORDER BY created_at LIMIT 20);
END; $$;
REVOKE ALL ON FUNCTION public.service_expire_marketing_growth_jobs(),public.service_note_marketing_growth_block(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_expire_marketing_growth_jobs(),public.service_note_marketing_growth_block(text) TO service_role;
-- Server-only timer: separate Edge call, so provider latency never extends distribution requests.
CREATE FUNCTION public.invoke_marketing_growth_worker_cron() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE endpoint text; secret text; request_id bigint;
BEGIN
 UPDATE public.marketing_growth_jobs SET status='reconcile',error_code='lease_expired_outcome_unknown',completed_at=now() WHERE status='running' AND lease_expires_at<now();
 IF (SELECT paused FROM public.marketing_growth_sites WHERE site_key='tok') OR public.marketing_runtime_enabled() IS NOT TRUE THEN RETURN NULL; END IF;
 IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN NULL; END IF;
 EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url'' LIMIT 1' INTO endpoint;
 EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''internal_cron_secret'' LIMIT 1' INTO secret;
 IF COALESCE(endpoint ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$',false) IS NOT TRUE OR COALESCE(length(secret),0)<24 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.marketing_growth_jobs WHERE status IN ('queued','running')) THEN RETURN NULL; END IF;
 endpoint:=regexp_replace(endpoint,'/marketing-orchestrator$','/marketing-growth-worker');
 SELECT net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-internal-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=90000) INTO request_id;
 RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.invoke_marketing_growth_worker_cron() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_marketing_growth_worker_cron() TO service_role;
DO $$ BEGIN
 IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
  PERFORM cron.schedule('tok-marketing-growth-worker','*/5 * * * *','SELECT public.invoke_marketing_growth_worker_cron();');
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.service_marketing_growth_operation(text,text,text,jsonb),public.service_claim_marketing_growth_job(bigint,text),public.service_finish_marketing_growth_job(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_marketing_growth_operation(text,text,text,jsonb),public.service_claim_marketing_growth_job(bigint,text),public.service_finish_marketing_growth_job(uuid,uuid,jsonb,text) TO service_role;
COMMIT;
