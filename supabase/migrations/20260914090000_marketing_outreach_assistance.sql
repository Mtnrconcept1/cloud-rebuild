-- TheTOK Marketing Outreach Assistance
-- Additive, review-first workflow for forums, directories, partners and backlinks.
-- It records opportunities and evidence; it never performs blind external posting.

BEGIN;

CREATE OR REPLACE FUNCTION public.marketing_validate_outreach_url(
  p_url text,
  p_allow_thetok boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_url text := btrim(COALESCE(p_url, ''));
  v_host text;
BEGIN
  IF char_length(v_url) NOT BETWEEN 12 AND 2048
     OR v_url !~ '^https://[a-z0-9][a-z0-9.-]{1,251}(:[0-9]{1,5})?(/[^[:space:]]*)?$'
     OR v_url ~ '[[:space:]<>"]'
     OR v_url ~ '@' THEN
    RAISE EXCEPTION 'Outreach URL must be a public HTTPS URL without credentials'
      USING ERRCODE = '22023';
  END IF;

  v_host := lower(split_part(split_part(v_url, '/', 3), ':', 1));
  IF v_host IS NULL
     OR v_host = ''
     OR v_host IN ('localhost', 'localhost.localdomain')
     OR v_host ~ '^[0-9.]+$'
     OR v_host ~ '^(10[.]|127[.]|169[.]254[.]|192[.]168[.]|172[.](1[6-9]|2[0-9]|3[0-1])[.])' THEN
    RAISE EXCEPTION 'Private or local outreach target is not allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_allow_thetok AND v_host NOT IN ('thetok.ch', 'www.thetok.ch') THEN
    RAISE EXCEPTION 'Backlink destination must be hosted on thetok.ch'
      USING ERRCODE = '22023';
  END IF;
  RETURN v_url;
END;
$$;

CREATE TABLE IF NOT EXISTS public.marketing_outreach_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'community' CHECK (kind IN (
    'forum', 'directory', 'partner', 'press', 'community'
  )),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  domain text NOT NULL CHECK (
    domain ~ '^[a-z0-9][a-z0-9.-]{1,251}$'
    AND domain !~ '^[0-9.]+$'
    AND domain NOT IN ('localhost', 'localhost.localdomain')
  ),
  url text NOT NULL,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate', 'allowlisted', 'paused', 'blocked'
  )),
  relevance_score numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (
    relevance_score >= 0 AND relevance_score <= 1
  ),
  robots_checked_at timestamptz,
  terms_checked_at timestamptz,
  publication_mode text NOT NULL DEFAULT 'manual' CHECK (publication_mode IN ('manual', 'api')),
  provider text CHECK (provider IS NULL OR provider ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  frequency_cap_hours integer NOT NULL DEFAULT 168 CHECK (
    frequency_cap_hours BETWEEN 24 AND 720
  ),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_outreach_target_url_https CHECK (url ~ '^https://'),
  CONSTRAINT marketing_outreach_target_domain_match CHECK (
    lower(split_part(split_part(url, '/', 3), ':', 1)) = lower(domain)
  ),
  UNIQUE (domain, url)
);

CREATE TABLE IF NOT EXISTS public.marketing_outreach_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.marketing_outreach_targets(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  context text NOT NULL DEFAULT '' CHECK (char_length(context) <= 3000),
  suggested_angle text NOT NULL DEFAULT '' CHECK (char_length(suggested_angle) <= 1200),
  suggested_link text NOT NULL DEFAULT '/restaurants' CHECK (
    suggested_link = '/'
    OR (suggested_link ~ '^/' AND suggested_link !~ '^//')
    OR suggested_link ~ '^https://(www[.])?thetok[.]ch(/|$)'
  ),
  status text NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered', 'draft', 'pending_review', 'approved',
    'rejected', 'published', 'won', 'lost'
  )),
  relevance_score numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (
    relevance_score >= 0 AND relevance_score <= 1
  ),
  risk_flags text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(risk_flags) <= 8),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_url text,
  published_at timestamptz,
  result_note text NOT NULL DEFAULT '' CHECK (char_length(result_note) <= 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_outreach_opportunity_source_https CHECK (source_url ~ '^https://'),
  CONSTRAINT marketing_outreach_opportunity_published_https CHECK (
    published_url IS NULL OR published_url ~ '^https://'
  ),
  UNIQUE (target_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS public.marketing_outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.marketing_outreach_opportunities(id) ON DELETE RESTRICT,
  subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 200),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 20 AND 4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_review', 'approved', 'sent', 'rejected'
  )),
  ai_assisted boolean NOT NULL DEFAULT false,
  similarity_hash text NOT NULL CHECK (similarity_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  result_note text NOT NULL DEFAULT '' CHECK (char_length(result_note) <= 1200),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, similarity_hash)
);

CREATE TABLE IF NOT EXISTS public.marketing_backlinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.marketing_outreach_opportunities(id) ON DELETE SET NULL,
  source_url text NOT NULL,
  target_url text NOT NULL,
  rel text NOT NULL DEFAULT 'nofollow' CHECK (rel IN ('follow', 'nofollow', 'sponsored', 'ugc')),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN (
    'prospect', 'requested', 'verified', 'lost', 'rejected'
  )),
  observed_at timestamptz,
  verification_note text NOT NULL DEFAULT '' CHECK (char_length(verification_note) <= 2000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT public.marketing_actor_user_id(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_backlink_source_https CHECK (source_url ~ '^https://'),
  CONSTRAINT marketing_backlink_target_thetok CHECK (
    target_url ~ '^https://(www[.])?thetok[.]ch(/|$)'
  ),
  UNIQUE (source_url, target_url)
);

CREATE INDEX IF NOT EXISTS marketing_outreach_targets_status_idx
  ON public.marketing_outreach_targets(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_outreach_targets_kind_idx
  ON public.marketing_outreach_targets(kind, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_outreach_opportunities_status_idx
  ON public.marketing_outreach_opportunities(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_outreach_opportunities_target_idx
  ON public.marketing_outreach_opportunities(target_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketing_outreach_drafts_status_idx
  ON public.marketing_outreach_drafts(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS marketing_backlinks_status_idx
  ON public.marketing_backlinks(status, updated_at DESC, id DESC);

-- The generic audit redactor must not put outreach copy or operator notes in
-- the immutable audit stream. Publication automatique désactivée by design.
CREATE OR REPLACE FUNCTION public.marketing_redact_audit_record(p_record jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_record, '{}'::jsonb)
    - 'email' - 'email_normalized' - 'phone' - 'phone_normalized' - 'target_fingerprint'
    - 'secret_ref' - 'lease_token' - 'provider_message_id' - 'metadata'
    - 'last_error' - 'content' - 'targeting' - 'public_configuration'
    - 'result_summary' - 'body' - 'context' - 'notes' - 'verification_note'
    - 'result_note' - 'suggested_angle';
$$;

DROP TRIGGER IF EXISTS marketing_outreach_targets_touch ON public.marketing_outreach_targets;
CREATE TRIGGER marketing_outreach_targets_touch
BEFORE UPDATE ON public.marketing_outreach_targets
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_outreach_opportunities_touch ON public.marketing_outreach_opportunities;
CREATE TRIGGER marketing_outreach_opportunities_touch
BEFORE UPDATE ON public.marketing_outreach_opportunities
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_outreach_drafts_touch ON public.marketing_outreach_drafts;
CREATE TRIGGER marketing_outreach_drafts_touch
BEFORE UPDATE ON public.marketing_outreach_drafts
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_backlinks_touch ON public.marketing_backlinks;
CREATE TRIGGER marketing_backlinks_touch
BEFORE UPDATE ON public.marketing_backlinks
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();

DROP TRIGGER IF EXISTS marketing_outreach_targets_audit ON public.marketing_outreach_targets;
CREATE TRIGGER marketing_outreach_targets_audit
AFTER INSERT OR UPDATE OR DELETE ON public.marketing_outreach_targets
FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();

DROP TRIGGER IF EXISTS marketing_outreach_opportunities_audit ON public.marketing_outreach_opportunities;
CREATE TRIGGER marketing_outreach_opportunities_audit
AFTER INSERT OR UPDATE OR DELETE ON public.marketing_outreach_opportunities
FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();

DROP TRIGGER IF EXISTS marketing_outreach_drafts_audit ON public.marketing_outreach_drafts;
CREATE TRIGGER marketing_outreach_drafts_audit
AFTER INSERT OR UPDATE OR DELETE ON public.marketing_outreach_drafts
FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();

DROP TRIGGER IF EXISTS marketing_backlinks_audit ON public.marketing_backlinks;
CREATE TRIGGER marketing_backlinks_audit
AFTER INSERT OR UPDATE OR DELETE ON public.marketing_backlinks
FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();

ALTER TABLE public.marketing_outreach_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outreach_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outreach_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outreach_opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outreach_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_outreach_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_backlinks FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_outreach_targets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_outreach_opportunities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_outreach_drafts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.marketing_backlinks FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_marketing_outreach(
  p_kind text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
  v_targets jsonb;
  v_opportunities jsonb;
  v_drafts jsonb;
  v_backlinks jsonb;
  v_targets_more boolean := false;
  v_next_cursor jsonb;
  v_target_count bigint := 0;
  v_allowlisted_count bigint := 0;
  v_pending_count bigint := 0;
  v_approved_count bigint := 0;
  v_published_count bigint := 0;
  v_verified_backlinks bigint := 0;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 100) THEN
    RAISE EXCEPTION 'Marketing outreach list limit is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('forum','directory','partner','press','community') THEN
    RAISE EXCEPTION 'Marketing outreach kind is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN (
    'candidate','allowlisted','paused','blocked','discovered','draft',
    'pending_review','approved','rejected','published','won','lost',
    'prospect','requested','verified'
  ) THEN
    RAISE EXCEPTION 'Marketing outreach status is invalid' USING ERRCODE = '22023';
  END IF;

  WITH page AS (
    SELECT t.*
    FROM public.marketing_outreach_targets t
    WHERE (p_kind IS NULL OR t.kind = p_kind)
      AND (p_status IS NULL OR t.status = p_status)
      AND (
        p_cursor_updated_at IS NULL OR p_cursor_id IS NULL
        OR (t.updated_at, t.id) < (p_cursor_updated_at, p_cursor_id)
      )
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY updated_at DESC, id DESC LIMIT v_limit
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'name', name, 'domain', domain, 'url', url,
      'status', status, 'relevance_score', relevance_score,
      'robots_checked_at', robots_checked_at, 'terms_checked_at', terms_checked_at,
      'publication_mode', publication_mode, 'provider', provider,
      'frequency_cap_hours', frequency_cap_hours, 'notes', notes,
      'created_at', created_at, 'updated_at', updated_at
    ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb),
    (SELECT count(*) > v_limit FROM page)
  INTO v_targets, v_targets_more
  FROM visible;

  WITH page AS (
    SELECT o.*, t.name AS target_name, t.domain AS target_domain
    FROM public.marketing_outreach_opportunities o
    JOIN public.marketing_outreach_targets t ON t.id = o.target_id
    WHERE (p_status IS NULL OR o.status = p_status)
    ORDER BY o.updated_at DESC, o.id DESC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'target_id', target_id, 'target_name', target_name,
    'target_domain', target_domain, 'source_url', source_url, 'title', title,
    'context', context, 'suggested_angle', suggested_angle, 'suggested_link', suggested_link,
    'status', status, 'relevance_score', relevance_score, 'risk_flags', to_jsonb(risk_flags),
    'fingerprint', fingerprint, 'approved_by', approved_by, 'approved_at', approved_at,
    'published_url', published_url, 'published_at', published_at,
    'result_note', result_note, 'created_at', created_at, 'updated_at', updated_at
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb)
  INTO v_opportunities
  FROM page;

  WITH page AS (
    SELECT d.*, o.title AS opportunity_title
    FROM public.marketing_outreach_drafts d
    JOIN public.marketing_outreach_opportunities o ON o.id = d.opportunity_id
    WHERE (p_status IS NULL OR d.status = p_status)
    ORDER BY d.updated_at DESC, d.id DESC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'opportunity_id', opportunity_id, 'opportunity_title', opportunity_title,
    'subject', subject, 'body', body, 'status', status, 'ai_assisted', ai_assisted,
    'similarity_hash', similarity_hash, 'approved_by', approved_by, 'approved_at', approved_at,
    'sent_at', sent_at, 'result_note', result_note, 'created_at', created_at, 'updated_at', updated_at
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb)
  INTO v_drafts
  FROM page;

  WITH page AS (
    SELECT b.*, o.title AS opportunity_title
    FROM public.marketing_backlinks b
    LEFT JOIN public.marketing_outreach_opportunities o ON o.id = b.opportunity_id
    WHERE (p_status IS NULL OR b.status = p_status)
    ORDER BY b.updated_at DESC, b.id DESC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'opportunity_id', opportunity_id, 'opportunity_title', opportunity_title,
    'source_url', source_url, 'target_url', target_url, 'rel', rel, 'status', status,
    'observed_at', observed_at, 'verification_note', verification_note,
    'created_at', created_at, 'updated_at', updated_at
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb)
  INTO v_backlinks
  FROM page;

  SELECT count(*), count(*) FILTER (WHERE status = 'allowlisted')
  INTO v_target_count, v_allowlisted_count
  FROM public.marketing_outreach_targets;
  SELECT
    count(*) FILTER (WHERE status = 'pending_review'),
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status IN ('published','won'))
  INTO v_pending_count, v_approved_count, v_published_count
  FROM public.marketing_outreach_opportunities;
  SELECT count(*) FILTER (WHERE status = 'verified')
  INTO v_verified_backlinks
  FROM public.marketing_backlinks;

  v_next_cursor := CASE
    WHEN v_targets_more AND jsonb_array_length(v_targets) > 0 THEN jsonb_build_object(
      'updated_at', v_targets -> (jsonb_array_length(v_targets) - 1) ->> 'updated_at',
      'id', v_targets -> (jsonb_array_length(v_targets) - 1) ->> 'id'
    )
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'targets', v_targets,
    'opportunities', v_opportunities,
    'drafts', v_drafts,
    'backlinks', v_backlinks,
    'metrics', jsonb_build_object(
      'targets_count', v_target_count,
      'allowlisted_targets', v_allowlisted_count,
      'pending_opportunities', v_pending_count,
      'approved_opportunities', v_approved_count,
      'published_opportunities', v_published_count,
      'verified_backlinks', v_verified_backlinks
    ),
    'next_cursor', v_next_cursor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_outreach_target(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_existing public.marketing_outreach_targets%ROWTYPE;
  v_row public.marketing_outreach_targets%ROWTYPE;
  v_kind text;
  v_name text;
  v_domain text;
  v_url text;
  v_status text;
  v_relevance numeric;
  v_robots_checked_at timestamptz;
  v_terms_checked_at timestamptz;
  v_publication_mode text;
  v_provider text;
  v_frequency integer;
  v_notes text;
  v_host text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Outreach target payload must be an object' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_payload ->> 'id', '')::uuid;
  v_kind := COALESCE(NULLIF(btrim(p_payload ->> 'kind'), ''), 'community');
  v_name := btrim(COALESCE(p_payload ->> 'name', ''));
  v_domain := lower(btrim(COALESCE(p_payload ->> 'domain', '')));
  v_url := public.marketing_validate_outreach_url(p_payload ->> 'url', false);
  v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'candidate');
  v_relevance := COALESCE(NULLIF(p_payload ->> 'relevance_score', '')::numeric, 0.5);
  v_robots_checked_at := NULLIF(p_payload ->> 'robots_checked_at', '')::timestamptz;
  v_terms_checked_at := NULLIF(p_payload ->> 'terms_checked_at', '')::timestamptz;
  v_publication_mode := COALESCE(NULLIF(p_payload ->> 'publication_mode', ''), 'manual');
  v_provider := NULLIF(lower(btrim(p_payload ->> 'provider')), '');
  v_frequency := LEAST(GREATEST(COALESCE(NULLIF(p_payload ->> 'frequency_cap_hours', '')::integer, 168), 24), 720);
  v_notes := left(COALESCE(p_payload ->> 'notes', ''), 2000);
  v_host := lower(split_part(split_part(v_url, '/', 3), ':', 1));

  IF v_kind NOT IN ('forum','directory','partner','press','community')
     OR char_length(v_name) NOT BETWEEN 2 AND 160
     OR v_domain !~ '^[a-z0-9][a-z0-9.-]{1,251}$'
     OR v_domain ~ '^[0-9.]+$'
     OR v_domain IN ('localhost','localhost.localdomain')
     OR v_host <> v_domain
     OR v_status NOT IN ('candidate','allowlisted','paused','blocked')
     OR v_relevance < 0 OR v_relevance > 1
     OR v_publication_mode NOT IN ('manual','api') THEN
    RAISE EXCEPTION 'Outreach target fields are invalid' USING ERRCODE = '22023';
  END IF;
  IF v_publication_mode = 'api' THEN
    RAISE EXCEPTION 'Publication automatique désactivée : aucun fournisseur externe n''est connecté'
      USING ERRCODE = '55000';
  END IF;
  IF v_status = 'allowlisted'
     AND (v_robots_checked_at IS NULL OR v_terms_checked_at IS NULL OR v_relevance < 0.400) THEN
    RAISE EXCEPTION 'Allowlisting requires robots, terms and relevance evidence'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.marketing_outreach_targets
  WHERE (v_id IS NOT NULL AND id = v_id)
     OR (v_id IS NULL AND domain = v_domain AND url = v_url)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Outreach target was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_outreach_targets SET
      kind = v_kind, name = v_name, domain = v_domain, url = v_url, status = v_status,
      relevance_score = v_relevance, robots_checked_at = v_robots_checked_at,
      terms_checked_at = v_terms_checked_at, publication_mode = 'manual', provider = NULL,
      frequency_cap_hours = v_frequency, notes = v_notes, updated_by = public.marketing_actor_user_id()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.marketing_outreach_targets (
      kind, name, domain, url, status, relevance_score, robots_checked_at,
      terms_checked_at, publication_mode, provider, frequency_cap_hours, notes,
      created_by, updated_by
    ) VALUES (
      v_kind, v_name, v_domain, v_url, v_status, v_relevance, v_robots_checked_at,
      v_terms_checked_at, 'manual', NULL, v_frequency, v_notes,
      public.marketing_actor_user_id(), public.marketing_actor_user_id()
    )
    ON CONFLICT (domain, url) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'kind', v_row.kind, 'name', v_row.name, 'domain', v_row.domain,
    'url', v_row.url, 'status', v_row.status, 'relevance_score', v_row.relevance_score,
    'robots_checked_at', v_row.robots_checked_at, 'terms_checked_at', v_row.terms_checked_at,
    'publication_mode', v_row.publication_mode, 'provider', v_row.provider,
    'frequency_cap_hours', v_row.frequency_cap_hours, 'notes', v_row.notes,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_outreach_opportunity(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_existing public.marketing_outreach_opportunities%ROWTYPE;
  v_row public.marketing_outreach_opportunities%ROWTYPE;
  v_target public.marketing_outreach_targets%ROWTYPE;
  v_target_id uuid;
  v_source_url text;
  v_title text;
  v_context text;
  v_suggested_angle text;
  v_suggested_link text;
  v_status text;
  v_relevance numeric;
  v_risk_flags text[] := '{}'::text[];
  v_fingerprint text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Outreach opportunity payload must be an object' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_payload ->> 'id', '')::uuid;
  v_target_id := NULLIF(p_payload ->> 'target_id', '')::uuid;
  v_source_url := public.marketing_validate_outreach_url(p_payload ->> 'source_url', false);
  v_title := btrim(COALESCE(p_payload ->> 'title', ''));
  v_context := left(COALESCE(p_payload ->> 'context', ''), 3000);
  v_suggested_angle := left(COALESCE(p_payload ->> 'suggested_angle', ''), 1200);
  v_suggested_link := left(COALESCE(NULLIF(btrim(p_payload ->> 'suggested_link'), ''), '/restaurants'), 500);
  v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'discovered');
  v_relevance := COALESCE(NULLIF(p_payload ->> 'relevance_score', '')::numeric, 0.5);
  IF p_payload ? 'risk_flags' AND jsonb_typeof(p_payload -> 'risk_flags') <> 'array' THEN
    RAISE EXCEPTION 'Outreach risk flags must be an array' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'risk_flags' THEN
    v_risk_flags := ARRAY(
      SELECT left(btrim(value), 64)
      FROM jsonb_array_elements_text(p_payload -> 'risk_flags') AS item(value)
      WHERE NULLIF(btrim(value), '') IS NOT NULL
    );
  END IF;
  v_fingerprint := lower(NULLIF(btrim(p_payload ->> 'fingerprint'), ''));
  IF v_fingerprint IS NULL THEN
    v_fingerprint := encode(extensions.digest(
      concat_ws('|', v_target_id::text, v_source_url, v_title), 'sha256'
    ), 'hex');
  END IF;

  IF v_target_id IS NULL
     OR char_length(v_title) NOT BETWEEN 3 AND 200
     OR v_status NOT IN ('discovered','draft','pending_review')
     OR v_relevance < 0 OR v_relevance > 1
     OR (v_suggested_link !~ '^/' OR v_suggested_link ~ '^//')
       AND v_suggested_link !~ '^https://(www[.])?thetok[.]ch(/|$)'
     OR v_fingerprint !~ '^[0-9a-f]{64}$'
     OR cardinality(v_risk_flags) > 8 THEN
    RAISE EXCEPTION 'Outreach opportunity fields are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
  FROM public.marketing_outreach_targets
  WHERE id = v_target_id
  FOR SHARE;
  IF NOT FOUND OR v_target.status <> 'allowlisted' THEN
    RAISE EXCEPTION 'Only an allowlisted target can receive an opportunity'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.marketing_outreach_opportunities
  WHERE (v_id IS NOT NULL AND id = v_id)
     OR (v_id IS NULL AND target_id = v_target_id AND fingerprint = v_fingerprint)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status IN ('approved','published','won','lost','rejected') THEN
      RAISE EXCEPTION 'Terminal outreach opportunity cannot be edited' USING ERRCODE = '22023';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Outreach opportunity was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_outreach_opportunities SET
      target_id = v_target_id, source_url = v_source_url, title = v_title,
      context = v_context, suggested_angle = v_suggested_angle, suggested_link = v_suggested_link,
      status = v_status, relevance_score = v_relevance, risk_flags = v_risk_flags,
      fingerprint = v_fingerprint, updated_by = public.marketing_actor_user_id()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.marketing_outreach_opportunities (
      target_id, source_url, title, context, suggested_angle, suggested_link,
      status, relevance_score, risk_flags, fingerprint, created_by, updated_by
    ) VALUES (
      v_target_id, v_source_url, v_title, v_context, v_suggested_angle, v_suggested_link,
      v_status, v_relevance, v_risk_flags, v_fingerprint,
      public.marketing_actor_user_id(), public.marketing_actor_user_id()
    )
    ON CONFLICT (target_id, fingerprint) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'target_id', v_row.target_id, 'source_url', v_row.source_url,
    'title', v_row.title, 'context', v_row.context, 'suggested_angle', v_row.suggested_angle,
    'suggested_link', v_row.suggested_link, 'status', v_row.status,
    'relevance_score', v_row.relevance_score, 'risk_flags', to_jsonb(v_row.risk_flags),
    'fingerprint', v_row.fingerprint, 'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at, 'published_url', v_row.published_url,
    'published_at', v_row.published_at, 'result_note', v_row.result_note,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_outreach_draft(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_existing public.marketing_outreach_drafts%ROWTYPE;
  v_row public.marketing_outreach_drafts%ROWTYPE;
  v_opportunity public.marketing_outreach_opportunities%ROWTYPE;
  v_opportunity_id uuid;
  v_subject text;
  v_body text;
  v_status text;
  v_ai_assisted boolean := false;
  v_similarity_hash text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Outreach draft payload must be an object' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_payload ->> 'id', '')::uuid;
  v_opportunity_id := NULLIF(p_payload ->> 'opportunity_id', '')::uuid;
  v_subject := left(COALESCE(p_payload ->> 'subject', ''), 200);
  v_body := left(COALESCE(p_payload ->> 'body', ''), 4000);
  v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'draft');
  IF lower(COALESCE(p_payload ->> 'ai_assisted', 'false')) IN ('true','false') THEN
    v_ai_assisted := lower(p_payload ->> 'ai_assisted') = 'true';
  END IF;
  v_similarity_hash := lower(NULLIF(btrim(p_payload ->> 'similarity_hash'), ''));
  IF v_similarity_hash IS NULL THEN
    v_similarity_hash := encode(extensions.digest(
      lower(regexp_replace(v_body, '[[:space:]]+', ' ', 'g')), 'sha256'
    ), 'hex');
  END IF;

  IF v_opportunity_id IS NULL
     OR char_length(btrim(v_body)) NOT BETWEEN 20 AND 4000
     OR v_status NOT IN ('draft','pending_review')
     OR v_similarity_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Outreach draft fields are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_opportunity
  FROM public.marketing_outreach_opportunities
  WHERE id = v_opportunity_id
  FOR SHARE;
  IF NOT FOUND OR v_opportunity.status IN ('published','won','lost','rejected') THEN
    RAISE EXCEPTION 'Opportunity is not editable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.marketing_outreach_drafts
  WHERE (v_id IS NOT NULL AND id = v_id)
     OR (v_id IS NULL AND opportunity_id = v_opportunity_id AND similarity_hash = v_similarity_hash)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status IN ('approved','sent') THEN
      RAISE EXCEPTION 'Approved outreach draft cannot be edited' USING ERRCODE = '22023';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Outreach draft was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_outreach_drafts SET
      opportunity_id = v_opportunity_id, subject = v_subject, body = v_body,
      status = v_status, ai_assisted = v_ai_assisted, similarity_hash = v_similarity_hash,
      updated_by = public.marketing_actor_user_id()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.marketing_outreach_drafts (
      opportunity_id, subject, body, status, ai_assisted, similarity_hash,
      created_by, updated_by
    ) VALUES (
      v_opportunity_id, v_subject, v_body, v_status, v_ai_assisted, v_similarity_hash,
      public.marketing_actor_user_id(), public.marketing_actor_user_id()
    )
    ON CONFLICT (opportunity_id, similarity_hash) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  IF v_status = 'pending_review' THEN
    UPDATE public.marketing_outreach_opportunities
    SET status = CASE WHEN status IN ('discovered','draft') THEN 'pending_review' ELSE status END,
        updated_by = public.marketing_actor_user_id()
    WHERE id = v_opportunity_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'opportunity_id', v_row.opportunity_id, 'subject', v_row.subject,
    'body', v_row.body, 'status', v_row.status, 'ai_assisted', v_row.ai_assisted,
    'similarity_hash', v_row.similarity_hash, 'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at, 'sent_at', v_row.sent_at,
    'result_note', v_row.result_note, 'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_marketing_outreach_draft(
  p_draft_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_draft public.marketing_outreach_drafts%ROWTYPE;
  v_opportunity public.marketing_outreach_opportunities%ROWTYPE;
  v_target public.marketing_outreach_targets%ROWTYPE;
  v_reason text := left(btrim(COALESCE(p_reason, '')), 500);
BEGIN
  PERFORM public.marketing_require_admin();
  IF char_length(v_reason) < 8 THEN
    RAISE EXCEPTION 'Outreach approval reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_draft
  FROM public.marketing_outreach_drafts
  WHERE id = p_draft_id
  FOR UPDATE;
  IF NOT FOUND OR v_draft.status NOT IN ('draft','pending_review') THEN
    RAISE EXCEPTION 'Only a pending outreach draft can be approved' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_opportunity
  FROM public.marketing_outreach_opportunities
  WHERE id = v_draft.opportunity_id
  FOR UPDATE;
  SELECT * INTO v_target
  FROM public.marketing_outreach_targets
  WHERE id = v_opportunity.target_id
  FOR SHARE;
  IF NOT FOUND OR v_target.status <> 'allowlisted' THEN
    RAISE EXCEPTION 'Outreach target is not allowlisted' USING ERRCODE = '42501';
  END IF;
  IF v_opportunity.status <> 'pending_review'
     OR COALESCE(cardinality(v_opportunity.risk_flags), 0) > 0 THEN
    RAISE EXCEPTION 'Opportunity must be pending review without risk flags' USING ERRCODE = '42501';
  END IF;

  UPDATE public.marketing_outreach_drafts SET
    status = 'approved', approved_by = public.marketing_actor_user_id(),
    approved_at = now(), result_note = v_reason,
    updated_by = public.marketing_actor_user_id()
  WHERE id = v_draft.id
  RETURNING * INTO v_draft;

  UPDATE public.marketing_outreach_opportunities SET
    status = 'approved', approved_by = public.marketing_actor_user_id(),
    approved_at = now(), updated_by = public.marketing_actor_user_id()
  WHERE id = v_opportunity.id
  RETURNING * INTO v_opportunity;

  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_outreach_approved',
    'marketing_outreach_opportunities', v_opportunity.id, NULL,
    jsonb_build_object('draft_id', v_draft.id, 'reason', v_reason, 'approved_at', v_opportunity.approved_at),
    now()
  );

  RETURN jsonb_build_object(
    'opportunity_id', v_opportunity.id, 'draft_id', v_draft.id,
    'opportunity_status', v_opportunity.status, 'draft_status', v_draft.status,
    'approved_at', v_opportunity.approved_at, 'updated_at', v_opportunity.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_marketing_outreach_result(
  p_opportunity_id uuid,
  p_status text,
  p_note text,
  p_published_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opportunity public.marketing_outreach_opportunities%ROWTYPE;
  v_note text := left(btrim(COALESCE(p_note, '')), 2000);
  v_published_url text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_status NOT IN ('published','won','lost','rejected') OR char_length(v_note) < 8 THEN
    RAISE EXCEPTION 'Outreach result and note are required' USING ERRCODE = '22023';
  END IF;
  IF p_published_url IS NOT NULL AND NULLIF(btrim(p_published_url), '') IS NOT NULL THEN
    v_published_url := public.marketing_validate_outreach_url(p_published_url, false);
  END IF;
  IF p_status = 'published' AND v_published_url IS NULL THEN
    RAISE EXCEPTION 'A published URL is required to record publication' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_opportunity
  FROM public.marketing_outreach_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outreach opportunity not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_opportunity.status = p_status AND v_opportunity.result_note = v_note THEN
    RETURN jsonb_build_object(
      'id', v_opportunity.id, 'status', v_opportunity.status,
      'published_url', v_opportunity.published_url, 'published_at', v_opportunity.published_at,
      'duplicate', true, 'updated_at', v_opportunity.updated_at
    );
  END IF;
  IF v_opportunity.status IN ('rejected','lost','won')
     OR (p_status = 'published' AND v_opportunity.status <> 'approved')
     OR (p_status IN ('won','lost') AND v_opportunity.status NOT IN ('approved','published')) THEN
    RAISE EXCEPTION 'Outreach result transition is not allowed' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM public.marketing_outreach_drafts d
    WHERE d.opportunity_id = v_opportunity.id AND d.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'An approved outreach draft is required before publication' USING ERRCODE = '42501';
  END IF;

  UPDATE public.marketing_outreach_opportunities SET
    status = p_status, result_note = v_note, published_url = v_published_url,
    published_at = CASE WHEN p_status = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
    updated_by = public.marketing_actor_user_id()
  WHERE id = v_opportunity.id
  RETURNING * INTO v_opportunity;

  IF p_status = 'published' THEN
    UPDATE public.marketing_outreach_drafts
    SET status = CASE WHEN status = 'approved' THEN 'sent' ELSE status END,
        sent_at = CASE WHEN status = 'approved' THEN COALESCE(sent_at, now()) ELSE sent_at END,
        updated_by = public.marketing_actor_user_id()
    WHERE opportunity_id = v_opportunity.id;
  END IF;

  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(), public.marketing_actor_user_id(), 'marketing_outreach_result_recorded',
    'marketing_outreach_opportunities', v_opportunity.id, NULL,
    jsonb_build_object('status', p_status, 'published_url', v_published_url, 'note', v_note),
    now()
  );

  RETURN jsonb_build_object(
    'id', v_opportunity.id, 'status', v_opportunity.status,
    'published_url', v_opportunity.published_url, 'published_at', v_opportunity.published_at,
    'duplicate', false, 'updated_at', v_opportunity.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_backlink(
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_existing public.marketing_backlinks%ROWTYPE;
  v_row public.marketing_backlinks%ROWTYPE;
  v_opportunity_id uuid;
  v_source_url text;
  v_target_url text;
  v_rel text;
  v_status text;
  v_observed_at timestamptz;
  v_note text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Backlink payload must be an object' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_payload ->> 'id', '')::uuid;
  v_opportunity_id := NULLIF(p_payload ->> 'opportunity_id', '')::uuid;
  v_source_url := public.marketing_validate_outreach_url(p_payload ->> 'source_url', false);
  v_target_url := public.marketing_validate_outreach_url(p_payload ->> 'target_url', true);
  v_rel := COALESCE(NULLIF(lower(btrim(p_payload ->> 'rel')), ''), 'nofollow');
  v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'prospect');
  v_observed_at := NULLIF(p_payload ->> 'observed_at', '')::timestamptz;
  v_note := left(COALESCE(p_payload ->> 'verification_note', ''), 2000);

  IF v_rel NOT IN ('follow','nofollow','sponsored','ugc')
     OR v_status NOT IN ('prospect','requested','verified','lost','rejected')
     OR (v_status = 'verified' AND (v_observed_at IS NULL OR char_length(btrim(v_note)) < 8)) THEN
    RAISE EXCEPTION 'Backlink evidence is incomplete or invalid' USING ERRCODE = '22023';
  END IF;
  IF v_opportunity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.marketing_outreach_opportunities WHERE id = v_opportunity_id
  ) THEN
    RAISE EXCEPTION 'Backlink opportunity not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.marketing_backlinks
  WHERE (v_id IS NOT NULL AND id = v_id)
     OR (v_id IS NULL AND source_url = v_source_url AND target_url = v_target_url)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'Backlink was modified by another administrator' USING ERRCODE = '40001';
    END IF;
    UPDATE public.marketing_backlinks SET
      opportunity_id = v_opportunity_id, source_url = v_source_url, target_url = v_target_url,
      rel = v_rel, status = v_status, observed_at = v_observed_at,
      verification_note = v_note, updated_by = public.marketing_actor_user_id()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.marketing_backlinks (
      opportunity_id, source_url, target_url, rel, status, observed_at,
      verification_note, created_by, updated_by
    ) VALUES (
      v_opportunity_id, v_source_url, v_target_url, v_rel, v_status, v_observed_at,
      v_note, public.marketing_actor_user_id(), public.marketing_actor_user_id()
    )
    ON CONFLICT (source_url, target_url) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'opportunity_id', v_row.opportunity_id,
    'source_url', v_row.source_url, 'target_url', v_row.target_url,
    'rel', v_row.rel, 'status', v_row.status, 'observed_at', v_row.observed_at,
    'verification_note', v_row.verification_note, 'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_execute_marketing_outreach_operation(
  p_sid_hash text,
  p_csrf_hash text,
  p_operation text,
  p_args jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session jsonb;
  v_actor_user_id uuid;
  v_args jsonb := COALESCE(p_args, '{}'::jsonb);
  v_result jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF jsonb_typeof(v_args) <> 'object' THEN
    RAISE EXCEPTION 'Marketing outreach operation arguments must be an object' USING ERRCODE = '22023';
  END IF;
  v_session := public.service_get_marketing_web_session(p_sid_hash, p_csrf_hash, true);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Active marketing BFF session and CSRF proof required' USING ERRCODE = '42501';
  END IF;
  v_actor_user_id := NULLIF(v_session ->> 'user_id', '')::uuid;
  IF v_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_actor_user_id AND ur.role::text = 'admin'
  ) THEN
    UPDATE public.marketing_admin_web_sessions s
    SET revoked_at = COALESCE(s.revoked_at, clock_timestamp()),
        revoke_reason = COALESCE(s.revoke_reason, 'admin_role_removed')
    WHERE s.sid_hash = p_sid_hash;
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.marketing_actor_user_id', v_actor_user_id::text, true);
  PERFORM set_config('app.marketing_web_session_sid_hash', p_sid_hash, true);
  PERFORM set_config('app.marketing_operation', COALESCE(p_operation, ''), true);

  CASE p_operation
    WHEN 'admin_list_marketing_outreach' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_kind','p_status','p_limit','p_cursor_updated_at','p_cursor_id')
      ) THEN
        RAISE EXCEPTION 'Marketing outreach list contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_list_marketing_outreach(
        NULLIF(v_args ->> 'p_kind', ''),
        NULLIF(v_args ->> 'p_status', ''),
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        NULLIF(v_args ->> 'p_cursor_updated_at', '')::timestamptz,
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
    WHEN 'admin_upsert_marketing_outreach_target' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload','p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' THEN
        RAISE EXCEPTION 'Outreach target request is invalid' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args -> 'p_payload') AS field(k)
        WHERE field.k NOT IN (
          'id','kind','name','domain','url','status','relevance_score',
          'robots_checked_at','terms_checked_at','publication_mode','provider',
          'frequency_cap_hours','notes'
        )
      ) THEN
        RAISE EXCEPTION 'Outreach target contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_outreach_target(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_upsert_marketing_outreach_opportunity' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload','p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' THEN
        RAISE EXCEPTION 'Outreach opportunity request is invalid' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args -> 'p_payload') AS field(k)
        WHERE field.k NOT IN (
          'id','target_id','source_url','title','context','suggested_angle',
          'suggested_link','status','relevance_score','risk_flags','fingerprint'
        )
      ) THEN
        RAISE EXCEPTION 'Outreach opportunity contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_outreach_opportunity(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_upsert_marketing_outreach_draft' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload','p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' THEN
        RAISE EXCEPTION 'Outreach draft request is invalid' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args -> 'p_payload') AS field(k)
        WHERE field.k NOT IN (
          'id','opportunity_id','subject','body','status','ai_assisted','similarity_hash'
        )
      ) THEN
        RAISE EXCEPTION 'Outreach draft contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_outreach_draft(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    WHEN 'admin_approve_marketing_outreach_draft' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_draft_id','p_reason')
      ) THEN
        RAISE EXCEPTION 'Outreach approval contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_approve_marketing_outreach_draft(
        NULLIF(v_args ->> 'p_draft_id', '')::uuid,
        v_args ->> 'p_reason'
      );
    WHEN 'admin_record_marketing_outreach_result' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_opportunity_id','p_status','p_note','p_published_url')
      ) THEN
        RAISE EXCEPTION 'Outreach result contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_record_marketing_outreach_result(
        NULLIF(v_args ->> 'p_opportunity_id', '')::uuid,
        v_args ->> 'p_status',
        v_args ->> 'p_note',
        NULLIF(v_args ->> 'p_published_url', '')
      );
    WHEN 'admin_upsert_marketing_backlink' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_payload','p_expected_updated_at')
      ) OR jsonb_typeof(v_args -> 'p_payload') <> 'object' THEN
        RAISE EXCEPTION 'Backlink request is invalid' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args -> 'p_payload') AS field(k)
        WHERE field.k NOT IN (
          'id','opportunity_id','source_url','target_url','rel','status',
          'observed_at','verification_note'
        )
      ) THEN
        RAISE EXCEPTION 'Backlink contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_backlink(
        v_args -> 'p_payload',
        NULLIF(v_args ->> 'p_expected_updated_at', '')::timestamptz
      );
    ELSE
      RAISE EXCEPTION 'Marketing outreach operation is not allowlisted'
        USING ERRCODE = '22023';
  END CASE;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_validate_outreach_url(text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_marketing_outreach(text, text, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_marketing_outreach_target(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_marketing_outreach_opportunity(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_marketing_outreach_draft(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_approve_marketing_outreach_draft(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_record_marketing_outreach_result(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_marketing_backlink(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.service_execute_marketing_outreach_operation(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.service_execute_marketing_outreach_operation(text, text, text, jsonb)
TO service_role;

COMMIT;
