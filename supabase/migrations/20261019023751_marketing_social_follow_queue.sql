-- Discovery reads public restaurant websites only. No Meta follow API is called.
-- Manual observations belong to the configured TOK actor, never to a restaurant row.
BEGIN;

CREATE OR REPLACE FUNCTION public.marketing_social_link_is_safe(p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(char_length(p_url) BETWEEN 8 AND 2048
    AND p_url ~ '^https?://[^/@[:space:]]+([/?#].*)?$'
    AND p_url !~ '[[:cntrl:][:space:]]', false)
$$;

CREATE OR REPLACE FUNCTION public.marketing_social_profile_is_valid(p_platform text, p_key text, p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(CASE p_platform
    WHEN 'instagram' THEN p_key ~ '^[a-z0-9_][a-z0-9_.]{0,29}$'
      AND p_key !~ '\.\.' AND right(p_key, 1) <> '.'
      AND p_key NOT IN ('accounts','about','explore','developer','developers','directory','direct','emails','legal','p','privacy','reel','reels','stories','tv','web','share')
      AND p_url = 'https://www.instagram.com/' || p_key || '/'
    WHEN 'facebook' THEN
      (p_key ~ '^id:[1-9][0-9]{4,31}$' AND p_url = 'https://www.facebook.com/profile.php?id=' || substring(p_key FROM 4))
      OR (p_key ~ '^slug:[a-z0-9][a-z0-9.]{0,99}$'
        AND substring(p_key FROM 6) NOT IN ('about','ads','business','dialog','events','friends','gaming','groups','help','home.php','l.php','login','login.php','marketplace','notifications','pages','people','permalink.php','photo','photos','plugins','policies','privacy','profile.php','reel','reels','search','share','sharer','sharer.php','story.php','watch')
        AND p_url = 'https://www.facebook.com/' || substring(p_key FROM 6) || '/')
    ELSE false END, false)
$$;

CREATE TABLE IF NOT EXISTS public.marketing_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('instagram','facebook')),
  canonical_key text NOT NULL CHECK (char_length(canonical_key) BETWEEN 1 AND 110),
  profile_url text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, canonical_key),
  CHECK (public.marketing_social_profile_is_valid(platform, canonical_key, profile_url))
);

CREATE TABLE IF NOT EXISTS public.marketing_social_profile_restaurants (
  profile_id uuid NOT NULL REFERENCES public.marketing_social_profiles(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_url text NOT NULL CHECK (public.marketing_social_link_is_safe(source_url)),
  source_kind text NOT NULL CHECK (source_kind IN ('website','database','manual')),
  context text NOT NULL DEFAULT '' CHECK (char_length(context) <= 500),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.marketing_social_follows (
  profile_id uuid NOT NULL REFERENCES public.marketing_social_profiles(id) ON DELETE CASCADE,
  source_account_id text NOT NULL CHECK (source_account_id ~ '^[0-9]{5,32}$'),
  follow_status text NOT NULL DEFAULT 'unknown' CHECK (follow_status IN ('unknown','not_followed','requested','followed','ignored')),
  verification_status text NOT NULL DEFAULT 'needs_review' CHECK (verification_status IN ('needs_review','verified','rejected')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, source_account_id),
  CHECK (follow_status NOT IN ('followed','requested') OR (verification_status = 'verified' AND confirmed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.marketing_social_discovery_jobs (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','no_profiles','no_website','robots_blocked','error')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  leased_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  completed_at timestamptz,
  profiles_found integer NOT NULL DEFAULT 0 CHECK (profiles_found BETWEEN 0 AND 22),
  visited_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(visited_urls) = 'array' AND jsonb_array_length(visited_urls) <= 12),
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diagnostics) = 'array' AND jsonb_array_length(diagnostics) <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);

CREATE OR REPLACE FUNCTION public.marketing_social_robots_policy_is_valid(p_policy jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF COALESCE(jsonb_typeof(p_policy),'')<>'object' OR octet_length(p_policy::text)>65536 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_policy) k WHERE k NOT IN ('rules','crawlDelayMs','denyAll'))
    OR COALESCE(jsonb_typeof(p_policy->'rules'),'')<>'array'
    OR COALESCE(jsonb_typeof(p_policy->'denyAll'),'')<>'boolean'
    OR COALESCE(jsonb_typeof(p_policy->'crawlDelayMs'),'')<>'number'
    OR NOT COALESCE(p_policy->>'crawlDelayMs' ~ '^[0-9]{3,16}$',false) THEN RETURN false; END IF;
  IF (p_policy->>'crawlDelayMs')::bigint NOT BETWEEN 500 AND 9007199254740991
    OR jsonb_array_length(p_policy->'rules')>1000 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_policy->'rules') r WHERE COALESCE(jsonb_typeof(r),'')<>'object') THEN RETURN false; END IF;
  RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_policy->'rules') r
    WHERE COALESCE(jsonb_typeof(r->'allow'),'')<>'boolean' OR COALESCE(jsonb_typeof(r->'path'),'')<>'string'
      OR char_length(r->>'path')>2048 OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('allow','path')));
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketing_social_origin_guards (
  origin text PRIMARY KEY CHECK (char_length(origin) BETWEEN 8 AND 500 AND origin ~ '^https?://[^/@[:space:]?#]+$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  lease_restaurant_id uuid,
  discovery_lease_token uuid,
  leased_by uuid,
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  crawl_delay_ms bigint NOT NULL DEFAULT 500 CHECK (crawl_delay_ms BETWEEN 500 AND 9007199254740991),
  robots_policy jsonb CHECK (robots_policy IS NULL OR public.marketing_social_robots_policy_is_valid(robots_policy)),
  robots_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((lease_token IS NULL AND lease_expires_at IS NULL AND lease_restaurant_id IS NULL AND discovery_lease_token IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_restaurant_id IS NOT NULL AND discovery_lease_token IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS marketing_social_profile_restaurants_restaurant_idx
  ON public.marketing_social_profile_restaurants(restaurant_id, profile_id);
CREATE INDEX IF NOT EXISTS marketing_social_follows_status_idx
  ON public.marketing_social_follows(source_account_id, follow_status, profile_id);
CREATE INDEX IF NOT EXISTS marketing_social_discovery_due_idx
  ON public.marketing_social_discovery_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS marketing_social_discovery_lease_idx
  ON public.marketing_social_discovery_jobs(lease_expires_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS marketing_social_contact_source_object_idx
  ON public.marketing_contacts(source_objectid) WHERE source_system = 'commercial_prospect_catalog';

ALTER TABLE public.marketing_social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_social_profile_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_social_discovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_social_origin_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_social_profiles, public.marketing_social_profile_restaurants,
  public.marketing_social_follows, public.marketing_social_discovery_jobs, public.marketing_social_origin_guards
FROM PUBLIC, anon, authenticated, service_role;

-- Only public identifiers are projected; token/secret configuration is never returned.
CREATE OR REPLACE FUNCTION public.marketing_social_source_account(p_platform text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account text; v_label text;
BEGIN
  SELECT CASE WHEN i.status <> 'disabled' THEN i.public_configuration ->>
      CASE p_platform WHEN 'instagram' THEN 'ig_user_id' ELSE 'page_id' END END,
    left(i.name, 200)
  INTO v_account, v_label FROM public.marketing_integrations i
  WHERE i.channel = p_platform ORDER BY i.updated_at DESC, i.id LIMIT 1;
  IF NOT COALESCE(v_account ~ '^[0-9]{5,32}$', false) THEN v_account := NULL; END IF;
  RETURN jsonb_build_object('platform', p_platform, 'id', v_account,
    'label', COALESCE(NULLIF(v_label,''), 'TOK ' || p_platform), 'configured', v_account IS NOT NULL,
    'profileUrl', CASE WHEN p_platform = 'facebook' AND v_account IS NOT NULL
      THEN 'https://www.facebook.com/profile.php?id=' || v_account ELSE NULL END);
END;
$$;

-- Database-owned website inputs only. No URL from collect requests enters this query.
CREATE OR REPLACE FUNCTION public.marketing_social_restaurant_sources()
RETURNS TABLE(id uuid, name text, city text, website_url text, instagram_url text, facebook_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.id, left(COALESCE(r.name,''),300), left(COALESCE(r.city,''),120),
    CASE WHEN public.marketing_social_link_is_safe(btrim(r.opening_hours ->> 'social_website'))
      THEN btrim(r.opening_hours ->> 'social_website')
      WHEN public.marketing_social_link_is_safe(btrim(c.website)) THEN btrim(c.website) ELSE NULL END,
    left(r.opening_hours ->> 'social_instagram',2048), left(r.opening_hours ->> 'social_facebook',2048)
  FROM public.restaurants r
  LEFT JOIN LATERAL (
    SELECT mc.website FROM public.marketing_contacts mc
    WHERE mc.source_system = 'commercial_prospect_catalog'
      AND NULLIF(r.directory_source_reference,'') IS NOT NULL
      AND (mc.source_reference = r.directory_source_reference
        OR mc.source_objectid = CASE WHEN r.directory_source_reference ~ '^[0-9]{1,18}$'
          THEN r.directory_source_reference::bigint END
        OR mc.id = CASE WHEN r.directory_source_reference ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          THEN r.directory_source_reference::uuid END)
    ORDER BY (mc.source_reference = r.directory_source_reference) DESC NULLS LAST, mc.id
    LIMIT 1
  ) c ON true
  WHERE r.is_demo IS NOT TRUE
$$;

CREATE OR REPLACE FUNCTION public.marketing_social_profile_json(p_profile_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id',p.id,'platform',p.platform,'canonicalKey',p.canonical_key,'profileUrl',p.profile_url,
    'handle',CASE WHEN p.platform = 'facebook' THEN regexp_replace(p.canonical_key,'^(id:|slug:)','') ELSE p.canonical_key END,
    'followStatus',COALESCE(f.follow_status,'unknown'),'verificationStatus',COALESCE(f.verification_status,'needs_review'),
    'sourceAccountId',a.account ->> 'id','version',COALESCE(f.version,0),'confirmedAt',f.confirmed_at,
    'confirmedBy',f.confirmed_by,'note',COALESCE(f.note,''),'sourceUrl',e.evidence -> 0 ->> 'sourceUrl',
    'sourceKind',e.evidence -> 0 ->> 'sourceKind','restaurants',COALESCE(e.evidence,'[]'::jsonb),
    'restaurantCount',(SELECT count(*) FROM public.marketing_social_profile_restaurants pr
      JOIN public.restaurants r ON r.id = pr.restaurant_id AND r.is_demo IS NOT TRUE WHERE pr.profile_id = p.id),
    'firstSeenAt',p.first_seen_at,'lastSeenAt',p.last_seen_at)
  FROM public.marketing_social_profiles p
  CROSS JOIN LATERAL (SELECT public.marketing_social_source_account(p.platform) AS account) a
  LEFT JOIN public.marketing_social_follows f ON f.profile_id = p.id AND f.source_account_id = a.account ->> 'id'
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(x.entry ORDER BY x.priority DESC,x.name,x.id) AS evidence FROM (
      SELECT jsonb_build_object('id',r.id,'name',left(r.name,300),'city',left(COALESCE(r.city,''),120),
        'sourceUrl',pr.source_url,'sourceKind',pr.source_kind,'context',pr.context) AS entry,
        CASE pr.source_kind WHEN 'manual' THEN 3 WHEN 'website' THEN 2 ELSE 1 END AS priority, r.name, r.id
      FROM public.marketing_social_profile_restaurants pr
      JOIN public.restaurants r ON r.id = pr.restaurant_id AND r.is_demo IS NOT TRUE
      WHERE pr.profile_id = p.id ORDER BY priority DESC,r.name,r.id LIMIT 20
    ) x
  ) e ON true
  WHERE p.id = p_profile_id
$$;

CREATE OR REPLACE FUNCTION public.marketing_social_collection_progress()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH rows AS (
    SELECT j.* FROM public.restaurants r LEFT JOIN public.marketing_social_discovery_jobs j ON j.restaurant_id = r.id
    WHERE r.is_demo IS NOT TRUE
  ), counts AS (
    SELECT count(*) AS eligible, count(restaurant_id) AS jobs,
      count(*) FILTER (WHERE status IS NULL OR status = 'pending'
        OR (status = 'processing' AND lease_expires_at <= now() AND attempts < 3)
        OR (status IN ('error','robots_blocked') AND next_attempt_at IS NOT NULL AND attempts < 3)) AS pending,
      count(*) FILTER (WHERE status = 'processing' AND lease_expires_at > now()) AS processing,
      count(*) FILTER (WHERE status IN ('success','no_profiles','no_website')
        OR (status = 'processing' AND lease_expires_at <= now() AND attempts >= 3)
        OR (status IN ('error','robots_blocked') AND (next_attempt_at IS NULL OR attempts >= 3))) AS completed,
      count(*) FILTER (WHERE status = 'success') AS success,
      count(*) FILTER (WHERE status = 'no_profiles') AS no_profiles,
      count(*) FILTER (WHERE status = 'no_website') AS no_website,
      count(*) FILTER (WHERE status = 'robots_blocked') AS robots_blocked,
      count(*) FILTER (WHERE status = 'error') AS errors,
      COALESCE(bool_or(status IS NULL OR (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at<=now()))
        OR (status IN ('error','robots_blocked') AND next_attempt_at <= now() AND attempts < 3)
        OR (status = 'processing' AND lease_expires_at + interval '15 minutes' <= now() AND attempts < 3)),false) AS has_more
    FROM rows
  )
  SELECT jsonb_build_object('eligibleRestaurants',eligible,'totalJobs',jobs,'pending',pending,'processing',processing,
    'completed',completed,'success',success,'noProfiles',no_profiles,'noWebsite',no_website,'robotsBlocked',robots_blocked,
    'errors',errors,'hasMore',has_more AND processing<3,'profiles',(SELECT count(*) FROM public.marketing_social_profiles p WHERE EXISTS (
      SELECT 1 FROM public.marketing_social_profile_restaurants pr JOIN public.restaurants r ON r.id=pr.restaurant_id
      WHERE pr.profile_id=p.id AND r.is_demo IS NOT TRUE))) FROM counts
$$;

CREATE OR REPLACE FUNCTION public.marketing_social_check_keys(p_args jsonb,p_keys text[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF COALESCE(jsonb_typeof(p_args),'') <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_args) k WHERE NOT (k = ANY(p_keys))) THEN
    RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_social_upsert_candidate(p_restaurant_id uuid,p_candidate jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_duplicate boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();
  PERFORM public.marketing_social_check_keys(p_candidate,ARRAY['platform','canonicalKey','url','sourceUrl','sourceKind','context']);
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['platform','canonicalKey','url','sourceUrl','sourceKind','context']) k
      WHERE COALESCE(jsonb_typeof(p_candidate->k),'') <> 'string')
    OR NOT public.marketing_social_profile_is_valid(p_candidate->>'platform',p_candidate->>'canonicalKey',p_candidate->>'url')
    OR NOT public.marketing_social_link_is_safe(p_candidate->>'sourceUrl')
    OR NOT COALESCE(p_candidate->>'sourceKind' IN ('website','database','manual'),false)
    OR COALESCE(jsonb_typeof(p_candidate->'context'),'') <> 'string'
    OR char_length(p_candidate->>'context') > 500 THEN
    RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.marketing_social_profiles(platform,canonical_key,profile_url)
  VALUES (p_candidate->>'platform',p_candidate->>'canonicalKey',p_candidate->>'url')
  ON CONFLICT(platform,canonical_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    v_duplicate := true;
    UPDATE public.marketing_social_profiles SET last_seen_at=now()
    WHERE platform=p_candidate->>'platform' AND canonical_key=p_candidate->>'canonicalKey' RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.marketing_social_profile_restaurants AS existing(profile_id,restaurant_id,source_url,source_kind,context)
  VALUES(v_id,p_restaurant_id,p_candidate->>'sourceUrl',p_candidate->>'sourceKind',p_candidate->>'context')
  ON CONFLICT(profile_id,restaurant_id) DO UPDATE SET last_seen_at=now(),
    source_url=CASE WHEN existing.source_kind='manual' AND EXCLUDED.source_kind<>'manual'
      OR existing.source_kind='website' AND EXCLUDED.source_kind='database' THEN existing.source_url ELSE EXCLUDED.source_url END,
    source_kind=CASE WHEN existing.source_kind='manual' AND EXCLUDED.source_kind<>'manual'
      OR existing.source_kind='website' AND EXCLUDED.source_kind='database' THEN existing.source_kind ELSE EXCLUDED.source_kind END,
    context=CASE WHEN existing.source_kind='manual' AND EXCLUDED.source_kind<>'manual'
      OR existing.source_kind='website' AND EXCLUDED.source_kind='database' THEN existing.context ELSE EXCLUDED.context END;
  RETURN jsonb_build_object('id',v_id,'duplicate',v_duplicate);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_execute_marketing_social_follow_operation(
  p_sid_hash text, p_csrf_hash text, p_operation text, p_args jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session jsonb; v_actor uuid; v_result jsonb; v_args jsonb := COALESCE(p_args,'{}'::jsonb);
  v_limit integer; v_offset integer; v_query text; v_platform text; v_status text;
  v_restaurant uuid; v_profile uuid; v_source text; v_expected text; v_version integer;
  v_job record; v_candidate jsonb; v_upsert jsonb; v_account jsonb;
  v_jobs jsonb := '[]'::jsonb; v_discovered integer := 0; v_duplicates integer := 0;
  v_active integer; v_retry timestamptz; v_follow text; v_verification text; v_confirmed boolean;
  v_origin text; v_guard record; v_now timestamptz; v_delay bigint; v_deferred boolean;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF NOT COALESCE(p_sid_hash ~ '^[0-9a-f]{64}$' AND p_csrf_hash ~ '^[0-9a-f]{64}$',false) THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  IF COALESCE(jsonb_typeof(v_args),'') <> 'object' OR octet_length(v_args::text) > 131072 THEN
    RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023';
  END IF;
  v_session := public.service_get_marketing_web_session(p_sid_hash,p_csrf_hash,true);
  IF v_session IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501'; END IF;
  v_actor := NULLIF(v_session->>'user_id','')::uuid;
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_actor AND ur.role::text='admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.marketing_actor_user_id',v_actor::text,true);
  PERFORM set_config('app.marketing_web_session_sid_hash',p_sid_hash,true);
  PERFORM set_config('app.marketing_operation','social_follow_' || COALESCE(p_operation,''),true);
  PERFORM public.marketing_require_admin();

  CASE p_operation
    WHEN 'list' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['query','platform','status','limit','offset']);
      IF COALESCE(jsonb_typeof(v_args->'query'),'') <> 'string' OR char_length(v_args->>'query')>120
        OR NOT COALESCE(v_args->>'platform' IN ('all','instagram','facebook'),false)
        OR NOT COALESCE(v_args->>'status' IN ('all','unknown','not_followed','requested','followed','ignored'),false)
        OR COALESCE(jsonb_typeof(v_args->'limit'),'') <> 'number' OR COALESCE(jsonb_typeof(v_args->'offset'),'') <> 'number'
        OR NOT COALESCE(v_args->>'limit' ~ '^[0-9]{1,2}$',false) OR NOT COALESCE(v_args->>'offset' ~ '^[0-9]{1,6}$',false) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023';
      END IF;
      v_limit := (v_args->>'limit')::integer; v_offset := (v_args->>'offset')::integer;
      IF v_limit NOT BETWEEN 1 AND 50 OR v_offset NOT BETWEEN 0 AND 100000 THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_query := lower(btrim(v_args->>'query')); v_platform := v_args->>'platform'; v_status := v_args->>'status';
      WITH actors AS (
        SELECT p AS platform,public.marketing_social_source_account(p)->>'id' AS account
        FROM unnest(ARRAY['instagram','facebook']) p
      ), base AS (
        SELECT p.id,p.platform,p.canonical_key,COALESCE(f.follow_status,'unknown') AS follow_status
        FROM public.marketing_social_profiles p JOIN actors a ON a.platform=p.platform
        LEFT JOIN public.marketing_social_follows f ON f.profile_id=p.id AND f.source_account_id=a.account
        WHERE (v_platform='all' OR p.platform=v_platform) AND EXISTS (
          SELECT 1 FROM public.marketing_social_profile_restaurants pr JOIN public.restaurants r ON r.id=pr.restaurant_id
          WHERE pr.profile_id=p.id AND r.is_demo IS NOT TRUE
            AND (v_query='' OR position(v_query IN lower(p.canonical_key))>0
              OR position(v_query IN lower(COALESCE(r.name,'') || ' ' || COALESCE(r.city,'')))>0))
      ), page AS (
        SELECT * FROM base WHERE v_status='all' OR follow_status=v_status ORDER BY platform,canonical_key,id LIMIT v_limit OFFSET v_offset
      )
      SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(public.marketing_social_profile_json(id) ORDER BY platform,canonical_key,id) FROM page),'[]'::jsonb),
        'total',(SELECT count(*) FROM base WHERE v_status='all' OR follow_status=v_status),
        'counts',(SELECT jsonb_build_object('unknown',count(*) FILTER(WHERE follow_status='unknown'),
          'not_followed',count(*) FILTER(WHERE follow_status='not_followed'),'requested',count(*) FILTER(WHERE follow_status='requested'),
          'followed',count(*) FILTER(WHERE follow_status='followed'),'ignored',count(*) FILTER(WHERE follow_status='ignored')) FROM base),
        'sourceAccounts',jsonb_build_array(public.marketing_social_source_account('instagram'),public.marketing_social_source_account('facebook')),
        'collection',public.marketing_social_collection_progress()) INTO v_result;

    WHEN 'restaurants' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['query','limit','offset']);
      IF COALESCE(jsonb_typeof(v_args->'query'),'') <> 'string' OR char_length(v_args->>'query')>120
        OR COALESCE(jsonb_typeof(v_args->'limit'),'') <> 'number' OR COALESCE(jsonb_typeof(v_args->'offset'),'') <> 'number'
        OR NOT COALESCE(v_args->>'limit' ~ '^[0-9]{1,2}$',false) OR NOT COALESCE(v_args->>'offset' ~ '^[0-9]{1,6}$',false) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_limit := (v_args->>'limit')::integer; v_offset := (v_args->>'offset')::integer; v_query:=lower(btrim(v_args->>'query'));
      IF v_limit NOT BETWEEN 1 AND 50 OR v_offset NOT BETWEEN 0 AND 100000 THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      WITH matched AS (
        SELECT s.*,COALESCE(j.status,'pending') AS discovery_status FROM public.marketing_social_restaurant_sources() s
        LEFT JOIN public.marketing_social_discovery_jobs j ON j.restaurant_id=s.id
        WHERE v_query='' OR position(v_query IN lower(s.name || ' ' || s.city))>0
      ), page AS (SELECT * FROM matched ORDER BY name,id LIMIT v_limit OFFSET v_offset)
      SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'city',city,
        'websiteUrl',website_url,'discoveryStatus',discovery_status) ORDER BY name,id) FROM page),'[]'::jsonb),
        'total',(SELECT count(*) FROM matched)) INTO v_result;

    WHEN 'progress' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY[]::text[]);
      v_result := public.marketing_social_collection_progress();

    WHEN 'claim' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['limit','restaurantId']);
      IF COALESCE(jsonb_typeof(v_args->'limit'),'') <> 'number' OR NOT COALESCE(v_args->>'limit' ~ '^[1-3]$',false)
        OR (COALESCE(jsonb_typeof(v_args->'restaurantId'),'null') <> 'null' AND NOT COALESCE(
          jsonb_typeof(v_args->'restaurantId')='string' AND v_args->>'restaurantId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_limit := (v_args->>'limit')::integer; v_restaurant := (v_args->>'restaurantId')::uuid;
      IF v_restaurant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=v_restaurant AND r.is_demo IS NOT TRUE) THEN
        RAISE EXCEPTION 'social_follow_restaurant_not_found' USING ERRCODE='22023'; END IF;
      -- This transaction-wide lock makes the global three-lease limit atomic.
      IF NOT pg_try_advisory_xact_lock(hashtextextended('marketing_social_discovery_slots',0)) THEN
        RAISE EXCEPTION 'social_follow_collection_busy' USING ERRCODE='P0001',DETAIL='5'; END IF;
      UPDATE public.marketing_social_discovery_jobs SET status='error',lease_token=NULL,lease_expires_at=NULL,leased_by=NULL,
        diagnostics='["lease_expired"]'::jsonb, next_attempt_at=CASE WHEN attempts<3 THEN lease_expires_at+interval '15 minutes' ELSE NULL END,
        completed_at=now(),updated_at=now() WHERE status='processing' AND lease_expires_at<=now();
      SELECT count(*) INTO v_active FROM public.marketing_social_discovery_jobs WHERE status='processing' AND lease_expires_at>now();
      IF v_active>=3 THEN RAISE EXCEPTION 'social_follow_collection_busy' USING ERRCODE='P0001',DETAIL='90'; END IF;
      v_limit := least(v_limit,3-v_active);
      INSERT INTO public.marketing_social_discovery_jobs(restaurant_id)
      SELECT r.id FROM public.restaurants r WHERE r.is_demo IS NOT TRUE AND (v_restaurant IS NULL OR r.id=v_restaurant)
      ON CONFLICT(restaurant_id) DO NOTHING;
      IF v_restaurant IS NOT NULL THEN
        SELECT * INTO v_job FROM public.marketing_social_discovery_jobs WHERE restaurant_id=v_restaurant FOR UPDATE;
        IF v_job.status='processing' OR (v_job.last_attempt_at IS NOT NULL AND (
          (v_job.status IN ('success','no_profiles','no_website') AND v_job.last_attempt_at>now()-interval '24 hours')
          OR (v_job.next_attempt_at IS NOT NULL AND v_job.next_attempt_at>now())
          OR (v_job.next_attempt_at IS NULL AND v_job.status IN ('error','robots_blocked') AND v_job.last_attempt_at>now()-interval '24 hours'))) THEN
          v_retry:=CASE WHEN v_job.status='processing' THEN v_job.lease_expires_at
            WHEN v_job.next_attempt_at IS NOT NULL THEN v_job.next_attempt_at ELSE v_job.last_attempt_at+interval '24 hours' END;
          RAISE EXCEPTION 'social_follow_collection_busy' USING ERRCODE='P0001',
            DETAIL=greatest(1,ceil(extract(epoch FROM v_retry-now())))::bigint::text; END IF;
        IF v_job.status<>'pending' THEN
          UPDATE public.marketing_social_discovery_jobs SET status='pending',attempts=CASE WHEN last_attempt_at<=now()-interval '24 hours'
            THEN 0 ELSE attempts END,next_attempt_at=NULL,updated_at=now() WHERE restaurant_id=v_restaurant;
        END IF;
      END IF;
      FOR v_job IN
        SELECT j.restaurant_id FROM public.marketing_social_discovery_jobs j JOIN public.restaurants r ON r.id=j.restaurant_id
        WHERE r.is_demo IS NOT TRUE AND (v_restaurant IS NULL OR j.restaurant_id=v_restaurant)
          AND j.attempts<3 AND ((j.status='pending' AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=now()))
            OR (j.status IN ('error','robots_blocked') AND j.next_attempt_at<=now()))
        ORDER BY j.created_at,j.restaurant_id LIMIT v_limit FOR UPDATE OF j SKIP LOCKED
      LOOP
        UPDATE public.marketing_social_discovery_jobs SET status='processing',attempts=attempts+1,
          lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds',leased_by=v_actor,
          last_attempt_at=now(),next_attempt_at=NULL,updated_at=now() WHERE restaurant_id=v_job.restaurant_id;
        SELECT v_jobs || jsonb_build_array(jsonb_build_object('restaurantId',s.id,'websiteUrl',s.website_url,
          'instagramUrl',s.instagram_url,'facebookUrl',s.facebook_url,'leaseToken',j.lease_token)) INTO v_jobs
        FROM public.marketing_social_restaurant_sources() s JOIN public.marketing_social_discovery_jobs j ON j.restaurant_id=s.id
        WHERE s.id=v_job.restaurant_id;
      END LOOP;
      v_result := jsonb_build_object('jobs',v_jobs,'collection',public.marketing_social_collection_progress());

    WHEN 'complete' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['restaurantId','leaseToken','crawlStatus','profiles','visitedUrls','diagnostics','retryAfter','networkAttempted']);
      IF NOT COALESCE(jsonb_typeof(v_args->'restaurantId')='string' AND v_args->>'restaurantId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'leaseToken')='string' AND v_args->>'leaseToken' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(v_args->>'crawlStatus' IN ('success','no_profiles','no_website','robots_blocked','error'),false)
        OR COALESCE(jsonb_typeof(v_args->'profiles'),'')<>'array' OR COALESCE(jsonb_typeof(v_args->'visitedUrls'),'')<>'array'
        OR COALESCE(jsonb_typeof(v_args->'diagnostics'),'')<>'array'
        OR COALESCE(jsonb_typeof(v_args->'retryAfter'),'null') NOT IN ('null','string')
        OR COALESCE(jsonb_typeof(v_args->'networkAttempted'),'')<>'boolean' THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      IF jsonb_array_length(v_args->'profiles')>22 OR jsonb_array_length(v_args->'visitedUrls')>12
        OR jsonb_array_length(v_args->'diagnostics')>10
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_args->'visitedUrls') x WHERE jsonb_typeof(x)<>'string' OR NOT public.marketing_social_link_is_safe(x#>>'{}'))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_args->'diagnostics') x WHERE jsonb_typeof(x)<>'string' OR char_length(x#>>'{}')>160)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_args->'profiles') x WHERE NOT COALESCE(x->>'sourceKind' IN ('website','database'),false) OR char_length(x->>'context')>200) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_restaurant := (v_args->>'restaurantId')::uuid;
      SELECT * INTO v_job FROM public.marketing_social_discovery_jobs WHERE restaurant_id=v_restaurant FOR UPDATE;
      IF NOT FOUND OR v_job.status<>'processing' OR v_job.lease_token IS DISTINCT FROM (v_args->>'leaseToken')::uuid
        OR v_job.lease_expires_at<=now() OR v_job.leased_by IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_args->'profiles') LOOP
        v_upsert := public.marketing_social_upsert_candidate(v_restaurant,v_candidate);
        IF (v_upsert->>'duplicate')::boolean THEN v_duplicates:=v_duplicates+1; ELSE v_discovered:=v_discovered+1; END IF;
      END LOOP;
      v_retry := NULL;
      v_deferred:=v_args->>'crawlStatus' IN ('error','robots_blocked') AND (v_args->>'networkAttempted')::boolean=false
        AND (v_args->'diagnostics') ? 'crawl_delay_deferred' AND NULLIF(v_args->>'retryAfter','') IS NOT NULL;
      IF v_deferred THEN v_retry:=greatest(now()+interval '1 second',(v_args->>'retryAfter')::timestamptz);
      ELSIF v_job.attempts<3 AND v_args->>'crawlStatus' IN ('error','robots_blocked') THEN
        IF NULLIF(v_args->>'retryAfter','') IS NOT NULL THEN
          IF char_length(v_args->>'retryAfter')>40 THEN RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
          v_retry:=greatest(now()+interval '15 minutes',(v_args->>'retryAfter')::timestamptz);
        ELSIF v_args->>'crawlStatus'='error' THEN v_retry:=now()+interval '15 minutes'*v_job.attempts; END IF;
      END IF;
      UPDATE public.marketing_social_discovery_jobs SET status=CASE WHEN v_deferred THEN 'pending' ELSE v_args->>'crawlStatus' END,
        attempts=CASE WHEN v_deferred THEN greatest(0,attempts-1) ELSE attempts END,lease_token=NULL,lease_expires_at=NULL,leased_by=NULL,
        completed_at=now(),next_attempt_at=v_retry,profiles_found=jsonb_array_length(v_args->'profiles'),visited_urls=v_args->'visitedUrls',
        diagnostics=v_args->'diagnostics',updated_at=now() WHERE restaurant_id=v_restaurant;
      v_result:=jsonb_build_object('restaurantId',v_restaurant,'status',v_args->>'crawlStatus','profilesFound',jsonb_array_length(v_args->'profiles'),
        'discovered',v_discovered,'deduplicated',v_duplicates,'deferred',v_deferred);

    WHEN 'reserve_origin' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['restaurantId','leaseToken','origin','kind']);
      IF NOT COALESCE(jsonb_typeof(v_args->'restaurantId')='string' AND v_args->>'restaurantId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'leaseToken')='string' AND v_args->>'leaseToken' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'origin')='string' AND char_length(v_args->>'origin') BETWEEN 8 AND 500
          AND v_args->>'origin' ~ '^https?://[^/@[:space:]?#]+$',false)
        OR NOT COALESCE(v_args->>'kind' IN ('robots','html'),false) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_restaurant:=(v_args->>'restaurantId')::uuid; v_origin:=v_args->>'origin'; v_now:=clock_timestamp();
      SELECT * INTO v_job FROM public.marketing_social_discovery_jobs WHERE restaurant_id=v_restaurant FOR SHARE;
      IF NOT FOUND OR v_job.status<>'processing' OR v_job.lease_token IS DISTINCT FROM (v_args->>'leaseToken')::uuid
        OR v_job.lease_expires_at<=v_now OR v_job.leased_by IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.marketing_social_origin_guards(origin) VALUES(v_origin) ON CONFLICT(origin) DO NOTHING;
      SELECT * INTO v_guard FROM public.marketing_social_origin_guards WHERE origin=v_origin FOR UPDATE;
      IF v_guard.lease_token IS NOT NULL AND v_guard.lease_expires_at<=v_now THEN
        -- An abandoned request has a fixed upper bound, never a sliding retry deadline.
        UPDATE public.marketing_social_origin_guards SET next_allowed_at=greatest(next_allowed_at,lease_expires_at+interval '1 millisecond'*crawl_delay_ms),
          lease_token=NULL,lease_expires_at=NULL,lease_restaurant_id=NULL,discovery_lease_token=NULL,leased_by=NULL,updated_at=v_now
        WHERE origin=v_origin RETURNING * INTO v_guard;
      END IF;
      IF v_args->>'kind'='robots' AND v_guard.robots_policy IS NOT NULL AND v_guard.robots_expires_at>v_now THEN
        v_result:=jsonb_build_object('kind','cached','robotsPolicy',v_guard.robots_policy,'robotsExpiresAt',v_guard.robots_expires_at);
      ELSIF v_guard.lease_token IS NOT NULL OR v_guard.next_allowed_at>v_now THEN
        v_result:=jsonb_build_object('kind','deferred','retryAfter',greatest(v_guard.next_allowed_at,
          COALESCE(v_guard.lease_expires_at+interval '1 millisecond'*v_guard.crawl_delay_ms,v_now)));
      ELSE
        UPDATE public.marketing_social_origin_guards SET lease_token=gen_random_uuid(),
          lease_expires_at=least(v_now+interval '20 seconds',v_job.lease_expires_at),lease_restaurant_id=v_restaurant,
          discovery_lease_token=v_job.lease_token,leased_by=v_actor,updated_at=v_now WHERE origin=v_origin RETURNING * INTO v_guard;
        v_result:=jsonb_build_object('kind','reserved','requestToken',v_guard.lease_token);
      END IF;

    WHEN 'finish_origin' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['restaurantId','leaseToken','origin','requestToken','robotsPolicy','retryAfter']);
      IF NOT COALESCE(jsonb_typeof(v_args->'restaurantId')='string' AND v_args->>'restaurantId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'leaseToken')='string' AND v_args->>'leaseToken' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'requestToken')='string' AND v_args->>'requestToken' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR COALESCE(jsonb_typeof(v_args->'origin'),'')<>'string' OR char_length(v_args->>'origin')>500
        OR COALESCE(jsonb_typeof(v_args->'retryAfter'),'null') NOT IN ('null','string')
        OR (COALESCE(jsonb_typeof(v_args->'robotsPolicy'),'null')<>'null' AND NOT public.marketing_social_robots_policy_is_valid(v_args->'robotsPolicy')) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_restaurant:=(v_args->>'restaurantId')::uuid; v_origin:=v_args->>'origin'; v_now:=clock_timestamp();
      SELECT * INTO v_job FROM public.marketing_social_discovery_jobs WHERE restaurant_id=v_restaurant FOR SHARE;
      IF NOT FOUND OR v_job.status<>'processing' OR v_job.lease_token IS DISTINCT FROM (v_args->>'leaseToken')::uuid
        OR v_job.lease_expires_at<=v_now OR v_job.leased_by IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      SELECT * INTO v_guard FROM public.marketing_social_origin_guards WHERE origin=v_origin FOR UPDATE;
      IF NOT FOUND OR v_guard.lease_token IS DISTINCT FROM (v_args->>'requestToken')::uuid
        OR v_guard.lease_restaurant_id IS DISTINCT FROM v_restaurant OR v_guard.discovery_lease_token IS DISTINCT FROM v_job.lease_token
        OR v_guard.leased_by IS DISTINCT FROM v_actor OR v_guard.lease_expires_at<=v_now THEN
        RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      v_delay:=CASE WHEN COALESCE(jsonb_typeof(v_args->'robotsPolicy'),'null')='object'
        THEN (v_args->'robotsPolicy'->>'crawlDelayMs')::bigint ELSE v_guard.crawl_delay_ms END;
      v_retry:=NULL;
      IF NULLIF(v_args->>'retryAfter','') IS NOT NULL THEN
        IF char_length(v_args->>'retryAfter')>40 THEN RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
        v_retry:=(v_args->>'retryAfter')::timestamptz;
      END IF;
      UPDATE public.marketing_social_origin_guards SET
        next_allowed_at=greatest(next_allowed_at,v_now+interval '1 millisecond'*v_delay,COALESCE(v_retry,v_now)),crawl_delay_ms=v_delay,
        robots_policy=CASE WHEN COALESCE(jsonb_typeof(v_args->'robotsPolicy'),'null')='object' THEN v_args->'robotsPolicy' ELSE robots_policy END,
        -- Keep a newly learned long delay usable after a cold-start retry, without re-fetching robots forever.
        robots_expires_at=CASE WHEN COALESCE(jsonb_typeof(v_args->'robotsPolicy'),'null')='object'
          THEN v_now+greatest(interval '30 minutes',interval '1 millisecond'*v_delay+interval '30 minutes') ELSE robots_expires_at END,
        lease_token=NULL,lease_expires_at=NULL,lease_restaurant_id=NULL,discovery_lease_token=NULL,leased_by=NULL,updated_at=v_now
      WHERE origin=v_origin RETURNING * INTO v_guard;
      v_result:=jsonb_build_object('nextAllowedAt',v_guard.next_allowed_at);

    WHEN 'add' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['restaurantId','candidate']);
      IF NOT COALESCE(jsonb_typeof(v_args->'restaurantId')='string' AND v_args->>'restaurantId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(v_args->'candidate'->>'sourceKind'='manual',false) THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_restaurant:=(v_args->>'restaurantId')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=v_restaurant AND r.is_demo IS NOT TRUE) THEN
        RAISE EXCEPTION 'social_follow_restaurant_not_found' USING ERRCODE='22023'; END IF;
      v_upsert:=public.marketing_social_upsert_candidate(v_restaurant,v_args->'candidate');
      v_profile:=(v_upsert->>'id')::uuid;
      v_result:=jsonb_build_object('profile',public.marketing_social_profile_json(v_profile),'duplicate',(v_upsert->>'duplicate')::boolean);

    WHEN 'record' THEN
      PERFORM public.marketing_social_check_keys(v_args,ARRAY['profileId','followStatus','verificationStatus','expectedVersion','expectedSourceAccountId','confirmedWithTokAccount','note']);
      IF NOT COALESCE(jsonb_typeof(v_args->'profileId')='string' AND v_args->>'profileId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
        OR NOT COALESCE(v_args->>'followStatus' IN ('unknown','not_followed','requested','followed','ignored'),false)
        OR NOT COALESCE(v_args->>'verificationStatus' IN ('needs_review','verified','rejected'),false)
        OR COALESCE(jsonb_typeof(v_args->'expectedVersion'),'')<>'number' OR NOT COALESCE(v_args->>'expectedVersion' ~ '^[0-9]{1,10}$',false)
        OR NOT COALESCE(jsonb_typeof(v_args->'expectedSourceAccountId')='string' AND v_args->>'expectedSourceAccountId' ~ '^[0-9]{5,32}$',false)
        OR COALESCE(jsonb_typeof(v_args->'confirmedWithTokAccount'),'')<>'boolean'
        OR COALESCE(jsonb_typeof(v_args->'note'),'')<>'string' OR char_length(v_args->>'note')>500 THEN
        RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      IF (v_args->>'expectedVersion')::bigint>2147483646 THEN RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023'; END IF;
      v_profile:=(v_args->>'profileId')::uuid; v_follow:=v_args->>'followStatus'; v_verification:=v_args->>'verificationStatus';
      v_expected:=v_args->>'expectedSourceAccountId'; v_confirmed:=(v_args->>'confirmedWithTokAccount')::boolean;
      IF v_follow IN ('followed','requested') AND (NOT v_confirmed OR v_verification<>'verified') THEN
        RAISE EXCEPTION 'social_follow_identity_required' USING ERRCODE='P0001'; END IF;
      SELECT platform INTO v_platform FROM public.marketing_social_profiles p WHERE p.id=v_profile AND EXISTS(
        SELECT 1 FROM public.marketing_social_profile_restaurants pr JOIN public.restaurants r ON r.id=pr.restaurant_id
        WHERE pr.profile_id=p.id AND r.is_demo IS NOT TRUE) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      -- Keep a configuration update from changing the actor before this transaction commits.
      PERFORM 1 FROM public.marketing_integrations WHERE channel=v_platform ORDER BY id FOR SHARE;
      v_account:=public.marketing_social_source_account(v_platform); v_source:=v_account->>'id';
      IF v_source IS NULL THEN RAISE EXCEPTION 'social_follow_account_unavailable' USING ERRCODE='P0001'; END IF;
      IF v_source<>v_expected THEN RAISE EXCEPTION 'social_follow_account_changed' USING ERRCODE='P0001'; END IF;
      SELECT version INTO v_version FROM public.marketing_social_follows WHERE profile_id=v_profile AND source_account_id=v_source;
      IF COALESCE(v_version,0)<>(v_args->>'expectedVersion')::integer THEN RAISE EXCEPTION 'social_follow_conflict' USING ERRCODE='P0001'; END IF;
      INSERT INTO public.marketing_social_follows(profile_id,source_account_id,follow_status,verification_status,version,confirmed_at,confirmed_by,note)
      VALUES(v_profile,v_source,v_follow,v_verification,COALESCE(v_version,0)+1,
        CASE WHEN v_follow IN ('followed','requested') THEN now() END,CASE WHEN v_follow IN ('followed','requested') THEN v_actor END,v_args->>'note')
      ON CONFLICT(profile_id,source_account_id) DO UPDATE SET follow_status=EXCLUDED.follow_status,verification_status=EXCLUDED.verification_status,
        version=EXCLUDED.version,confirmed_at=EXCLUDED.confirmed_at,confirmed_by=EXCLUDED.confirmed_by,note=EXCLUDED.note,updated_at=now();
      v_result:=public.marketing_social_profile_json(v_profile);

    ELSE RAISE EXCEPTION 'social_follow_invalid_request' USING ERRCODE='22023';
  END CASE;

  IF p_operation IN ('claim','complete','add','record') THEN
    INSERT INTO public.audit_log(id,user_id,action,entity_type,entity_id,old_data,new_data,created_at)
    VALUES(gen_random_uuid(),v_actor,'marketing_social_follow_operation','marketing_social_follow',COALESCE(v_profile,v_restaurant),NULL,
      jsonb_strip_nulls(jsonb_build_object('operation',p_operation,'status',COALESCE(v_result->>'followStatus',v_result->>'status'),
        'version',v_result->'version','sourceAccountId',v_result->>'sourceAccountId','verificationStatus',v_result->>'verificationStatus',
        'discovered',v_result->'discovered','deduplicated',v_result->'deduplicated',
        'duplicate',v_result->'duplicate','external_effect',false)),now());
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_social_link_is_safe(text),public.marketing_social_profile_is_valid(text,text,text),
  public.marketing_social_robots_policy_is_valid(jsonb),
  public.marketing_social_source_account(text),public.marketing_social_restaurant_sources(),public.marketing_social_profile_json(uuid),
  public.marketing_social_collection_progress(),public.marketing_social_check_keys(jsonb,text[]),
  public.marketing_social_upsert_candidate(uuid,jsonb),public.service_execute_marketing_social_follow_operation(text,text,text,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.service_execute_marketing_social_follow_operation(text,text,text,jsonb) TO service_role;

COMMENT ON TABLE public.marketing_social_follows IS 'Human observations for a specific configured TOK actor. Opening a profile is not a follow confirmation.';
COMMENT ON TABLE public.marketing_social_discovery_jobs IS 'Bounded, resumable collection; at most three global leases. No unattended scheduler or Meta follow action.';
COMMIT;
