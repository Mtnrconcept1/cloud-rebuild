-- Content approval is independent from native approval and publication. New
-- drafts enter this transactional outbox; pre-existing drafts are not backfilled.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_content_review_targets (
  target_type text NOT NULL CHECK (target_type IN ('campaign','item')),
  target_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','waiting_items','waiting_visuals','delivering','pending','approved',
    'rejected','expired','failed','delivery_unknown','stale','cancelled'
  )),
  latest_review_id uuid,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  assembled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type,target_id)
);

CREATE TABLE IF NOT EXISTS public.marketing_content_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'
    AND octet_length(snapshot::text) <= 262144),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  chat_id text NOT NULL CHECK (chat_id ~ '^-?[1-9][0-9]{0,19}$'),
  -- A content revision may become stale while its sender is still alive. Keep
  -- transport ownership separate from the content state and out of RPC views.
  transport_lease_until timestamptz DEFAULT clock_timestamp()+interval '5 minutes',
  status text NOT NULL DEFAULT 'delivering' CHECK (status IN (
    'delivering','pending','approved','rejected','expired','failed',
    'delivery_unknown','stale','cancelled'
  )),
  document_complete boolean NOT NULL DEFAULT false,
  message_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
  control_message_id bigint CHECK (control_message_id > 0),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,96}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decision_actor text CHECK (decision_actor IS NULL OR char_length(decision_actor) BETWEEN 1 AND 120),
  FOREIGN KEY (target_type,target_id) REFERENCES public.marketing_content_review_targets(target_type,target_id),
  CHECK (expires_at > created_at),
  CHECK (cardinality(message_ids) <= 256),
  CHECK ((status NOT IN ('approved','rejected')) OR
    (document_complete AND control_message_id IS NOT NULL AND decided_at IS NOT NULL AND decision_actor IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS marketing_content_review_queue_idx
  ON public.marketing_content_review_targets(next_attempt_at,created_at,target_type,target_id)
  WHERE status IN ('queued','waiting_items','waiting_visuals');
CREATE INDEX IF NOT EXISTS marketing_content_review_history_idx
  ON public.marketing_content_reviews(target_type,target_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS marketing_content_review_expiry_idx
  ON public.marketing_content_reviews(expires_at)
  WHERE status IN ('delivering','pending','delivery_unknown');
CREATE INDEX IF NOT EXISTS marketing_content_review_transport_idx
  ON public.marketing_content_reviews(chat_id,transport_lease_until)
  WHERE transport_lease_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_calendar_integration_review_idx
  ON public.marketing_calendar_items(integration_id,campaign_id,id) WHERE integration_id IS NOT NULL;

ALTER TABLE public.marketing_content_review_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_review_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_content_review_targets, public.marketing_content_reviews
  FROM PUBLIC, anon, authenticated, service_role;

-- Only publication fields are copied. Target selection keeps facets and counts,
-- never individual emails, phones, user/contact identifiers, or credentials.
CREATE OR REPLACE FUNCTION public.marketing_content_review_content(p_content jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_object_agg(e.key,e.value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(p_content,'{}'::jsonb)) e
  WHERE e.key = ANY(ARRAY['subject','headline','body','message','text','summary','caption',
    'call_to_action','hashtags','visual_url','visual_required','visual_status','visual_format',
    'format','image_mode','visual_source','visual_width','visual_height','mailing_version']);
$$;

CREATE OR REPLACE FUNCTION public.marketing_content_review_audience(p_audience jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(e.key,e.value)
    FROM jsonb_each(COALESCE(p_audience,'{}'::jsonb)) e
    WHERE e.key = ANY(ARRAY['audience_kind','city','cities','canton','cantons','country','countries',
      'language','languages','segments','restaurant_categories','contact_types','subscribed_only'])
      AND (jsonb_typeof(e.value) IN ('string','number','boolean')
        OR (jsonb_typeof(e.value) = 'array' AND NOT EXISTS
          (SELECT 1 FROM jsonb_array_elements(e.value) a WHERE jsonb_typeof(a) NOT IN ('string','number','boolean'))))), '{}'::jsonb)
    || CASE WHEN jsonb_typeof(p_audience->'recipient_emails') = 'array'
       THEN jsonb_build_object('selected_recipient_count',jsonb_array_length(p_audience->'recipient_emails'))
       WHEN jsonb_typeof(p_audience->'contact_ids') = 'array'
       THEN jsonb_build_object('selected_recipient_count',jsonb_array_length(p_audience->'contact_ids'))
       ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_content_review_destination(
  p_id uuid,p_provider text,p_channel text,p_name text,p_configuration jsonb
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id',p_id,'provider',p_provider,'channel',p_channel,'name',p_name,
    'account_id',CASE p_channel WHEN 'instagram' THEN p_configuration->>'ig_user_id'
      WHEN 'facebook' THEN p_configuration->>'page_id'
      ELSE COALESCE(p_configuration->>'account_id',p_configuration->>'channel_id') END,
    'account_username',COALESCE(p_configuration->>'instagram_username',p_configuration->>'account_username',p_configuration->>'username'),
    'page_id',p_configuration->>'page_id','ig_user_id',p_configuration->>'ig_user_id');
$$;

-- The target lock is the serialization point. Callers never lock source rows
-- after it: a concurrent source transaction can finish its AFTER trigger and
-- invalidate this revision without a source-row/target-row lock inversion.
CREATE OR REPLACE FUNCTION public.marketing_touch_content_review_target(
  p_target_type text,p_target_id uuid,p_cancelled boolean DEFAULT false,p_reset_assembly boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_expected text; v_count integer; v_cancelled boolean := p_cancelled;
BEGIN
  IF p_target_id IS NULL THEN RETURN; END IF;
  IF p_target_type = 'campaign' AND EXISTS (SELECT 1 FROM public.marketing_campaigns
    WHERE id = p_target_id AND status = 'cancelled') THEN v_cancelled := true; END IF;
  INSERT INTO public.marketing_content_review_targets(target_type,target_id,status,next_attempt_at)
  VALUES(p_target_type,p_target_id,CASE WHEN v_cancelled THEN 'cancelled' ELSE 'queued' END,clock_timestamp()+interval '5 seconds')
  ON CONFLICT (target_type,target_id) DO UPDATE SET
    revision = public.marketing_content_review_targets.revision + 1,
    status = EXCLUDED.status, next_attempt_at = EXCLUDED.next_attempt_at,
    assembled_at = CASE WHEN p_reset_assembly THEN NULL ELSE public.marketing_content_review_targets.assembled_at END,
    last_error = NULL, updated_at = clock_timestamp();
  UPDATE public.marketing_content_reviews SET status = CASE WHEN v_cancelled THEN 'cancelled' ELSE 'stale' END,
    updated_at = clock_timestamp()
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND status IN ('delivering','pending','delivery_unknown');
  IF p_target_type = 'campaign' AND NOT v_cancelled THEN
    SELECT metadata->>'bundle_item_count' INTO v_expected FROM public.marketing_campaigns WHERE id = p_target_id;
    SELECT count(*) INTO v_count FROM (SELECT id FROM public.marketing_calendar_items
      WHERE campaign_id = p_target_id LIMIT 33) i;
    -- Native bundles contain 1..32 rows in one transaction. Once assembled,
    -- subsequent membership edits review the new membership, not the old count.
    IF v_count BETWEEN 1 AND 32 AND (v_expected IS NULL OR
      (v_expected ~ '^[0-9]{1,2}$' AND v_expected::integer = v_count)) THEN
      UPDATE public.marketing_content_review_targets SET assembled_at = COALESCE(assembled_at,clock_timestamp())
      WHERE target_type = p_target_type AND target_id = p_target_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_queue_campaign_content_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.marketing_touch_content_review_target('campaign',OLD.id,true);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.name,NEW.objective,NEW.content-'daily_publication_authorization',NEW.audience_id,NEW.audience_name,
      NEW.audience_definition,NEW.channels,NEW.timezone,NEW.starts_at,NEW.ends_at,NEW.metadata->'bundle_item_count',NEW.status='cancelled')
    IS NOT DISTINCT FROM
    ROW(OLD.name,OLD.objective,OLD.content-'daily_publication_authorization',OLD.audience_id,OLD.audience_name,
      OLD.audience_definition,OLD.channels,OLD.timezone,OLD.starts_at,OLD.ends_at,OLD.metadata->'bundle_item_count',OLD.status='cancelled') THEN
    RETURN NEW;
  END IF;
  PERFORM public.marketing_touch_content_review_target('campaign',NEW.id,NEW.status='cancelled',
    TG_OP = 'UPDATE' AND NEW.metadata->'bundle_item_count' IS DISTINCT FROM OLD.metadata->'bundle_item_count');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_queue_item_content_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old_type text; v_old_id uuid; v_new_type text; v_new_id uuid; v_scope record;
BEGIN
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.campaign_id,NEW.integration_id,NEW.title,NEW.channel,NEW.item_type,NEW.scheduled_at,NEW.timezone,
      NEW.audience_name,NEW.content-'daily_publication_authorization',NEW.targeting,NEW.status='cancelled')
    IS NOT DISTINCT FROM
    ROW(OLD.campaign_id,OLD.integration_id,OLD.title,OLD.channel,OLD.item_type,OLD.scheduled_at,OLD.timezone,
      OLD.audience_name,OLD.content-'daily_publication_authorization',OLD.targeting,OLD.status='cancelled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_type := CASE WHEN OLD.campaign_id IS NULL THEN 'item' ELSE 'campaign' END;
    v_old_id := COALESCE(OLD.campaign_id,OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_type := CASE WHEN NEW.campaign_id IS NULL THEN 'item' ELSE 'campaign' END;
    v_new_id := COALESCE(NEW.campaign_id,NEW.id);
  END IF;
  -- Deterministic order when a post moves between two campaigns.
  FOR v_scope IN SELECT DISTINCT t.kind,t.id FROM (VALUES(v_old_type,v_old_id),(v_new_type,v_new_id)) t(kind,id)
    WHERE t.id IS NOT NULL ORDER BY t.kind,t.id
  LOOP
    PERFORM public.marketing_touch_content_review_target(v_scope.kind,v_scope.id,
      v_scope.kind = 'item' AND (TG_OP = 'DELETE' OR v_scope.id IS DISTINCT FROM v_new_id OR NEW.status='cancelled'));
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_queue_destination_content_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_scope record;
BEGIN
  IF public.marketing_content_review_destination(NEW.id,NEW.provider,NEW.channel,NEW.name,NEW.public_configuration)
    IS NOT DISTINCT FROM public.marketing_content_review_destination(OLD.id,OLD.provider,OLD.channel,OLD.name,OLD.public_configuration) THEN
    RETURN NEW;
  END IF;
  -- Only already tracked targets are invalidated. Reconnecting an integration
  -- does not enqueue the whole historical marketing calendar.
  FOR v_scope IN SELECT DISTINCT t.target_type,t.target_id
    FROM public.marketing_calendar_items i JOIN public.marketing_content_review_targets t
      ON t.target_type = CASE WHEN i.campaign_id IS NULL THEN 'item' ELSE 'campaign' END
      AND t.target_id = COALESCE(i.campaign_id,i.id)
    WHERE i.integration_id = NEW.id ORDER BY t.target_type,t.target_id
  LOOP
    PERFORM public.marketing_touch_content_review_target(v_scope.target_type,v_scope.target_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_campaign_content_review ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaign_content_review AFTER INSERT OR UPDATE OR DELETE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.marketing_queue_campaign_content_review();
DROP TRIGGER IF EXISTS marketing_item_content_review ON public.marketing_calendar_items;
CREATE TRIGGER marketing_item_content_review AFTER INSERT OR UPDATE OR DELETE ON public.marketing_calendar_items
  FOR EACH ROW EXECUTE FUNCTION public.marketing_queue_item_content_review();
DROP TRIGGER IF EXISTS marketing_destination_content_review ON public.marketing_integrations;
CREATE TRIGGER marketing_destination_content_review AFTER UPDATE ON public.marketing_integrations
  FOR EACH ROW EXECUTE FUNCTION public.marketing_queue_destination_content_review();

CREATE OR REPLACE FUNCTION public.marketing_build_content_review_snapshot(p_target_type text,p_target_id uuid,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign public.marketing_campaigns%ROWTYPE; v_count integer; v_expected text; v_snapshot jsonb; v_items jsonb;
BEGIN
  IF p_target_type = 'campaign' THEN
    SELECT * INTO v_campaign FROM public.marketing_campaigns WHERE id = p_target_id;
    IF NOT FOUND OR v_campaign.status = 'cancelled' THEN RETURN jsonb_build_object('status','cancelled'); END IF;
  ELSIF p_target_type <> 'item' THEN
    RAISE EXCEPTION 'Invalid review target type' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count FROM (SELECT i.id FROM public.marketing_calendar_items i
    WHERE ((p_target_type = 'campaign' AND i.campaign_id = p_target_id)
       OR (p_target_type = 'item' AND i.id = p_target_id AND i.campaign_id IS NULL))
      AND i.status <> 'cancelled' LIMIT 33) items;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('status',CASE WHEN p_target_type = 'item' OR EXISTS
      (SELECT 1 FROM public.marketing_calendar_items WHERE campaign_id = p_target_id AND status = 'cancelled')
      THEN 'cancelled' ELSE 'waiting_items' END);
  END IF;
  IF v_count > 32 THEN RETURN jsonb_build_object('status','failed','error','too_many_items'); END IF;
  IF p_target_type = 'campaign' AND NOT EXISTS (SELECT 1 FROM public.marketing_content_review_targets
    WHERE target_type = p_target_type AND target_id = p_target_id AND assembled_at IS NOT NULL) THEN
    v_expected := v_campaign.metadata->>'bundle_item_count';
    IF v_expected IS NOT NULL AND (v_expected !~ '^[0-9]{1,2}$' OR v_expected::integer <> v_count) THEN
      RETURN jsonb_build_object('status','waiting_items');
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_calendar_items i
    WHERE ((p_target_type = 'campaign' AND i.campaign_id = p_target_id) OR (p_target_type = 'item' AND i.id = p_target_id))
      AND i.status <> 'cancelled'
      AND (i.content->>'visual_required' = 'true' OR i.channel = 'instagram'
        OR (i.channel = 'email' AND i.content->>'mailing_version' = 'tok-mailing-v1')
        OR NULLIF(btrim(i.content->>'visual_url'),'') IS NOT NULL)
      AND (i.content->>'visual_status' IS DISTINCT FROM 'ready'
        OR COALESCE(i.content->>'visual_url','') !~ '^https://[^[:space:]/@]+/[^[:space:]]+$')) THEN
    RETURN jsonb_build_object('status','waiting_visuals');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',i.id,'version',i.version,'updated_at',i.updated_at,
    'title',i.title,'channel',i.channel,'item_type',i.item_type,
    'content',public.marketing_content_review_content(i.content),'targeting',public.marketing_content_review_audience(i.targeting),
    'scheduled_at',i.scheduled_at,'timezone',i.timezone,'audience_name',i.audience_name,'audience_size',i.audience_size,
    'integration',CASE WHEN g.id IS NULL THEN NULL ELSE
      public.marketing_content_review_destination(g.id,g.provider,g.channel,g.name,g.public_configuration) END)
    ORDER BY i.scheduled_at,i.created_at,i.id) INTO v_items
  FROM public.marketing_calendar_items i LEFT JOIN public.marketing_integrations g ON g.id = i.integration_id
  WHERE ((p_target_type = 'campaign' AND i.campaign_id = p_target_id) OR (p_target_type = 'item' AND i.id = p_target_id))
    AND i.status <> 'cancelled';
  v_snapshot := jsonb_build_object('schemaVersion',1,'targetType',p_target_type,'targetId',p_target_id,'revision',p_revision,
    'campaign',CASE WHEN p_target_type = 'campaign' THEN jsonb_build_object('id',v_campaign.id,'version',v_campaign.version,
      'updated_at',v_campaign.updated_at,'name',v_campaign.name,'objective',v_campaign.objective,
      'content',public.marketing_content_review_content(v_campaign.content),'audience_name',v_campaign.audience_name,
      'audience_definition',public.marketing_content_review_audience(v_campaign.audience_definition),
      'channels',v_campaign.channels,'starts_at',v_campaign.starts_at,'ends_at',v_campaign.ends_at,'timezone',v_campaign.timezone)
      ELSE NULL END,'items',v_items);
  IF octet_length(v_snapshot::text) > 262144 THEN RETURN jsonb_build_object('status','failed','error','snapshot_too_large'); END IF;
  RETURN jsonb_build_object('status','ready','snapshot',v_snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketing_content_review(p_token_hash text,p_chat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_target public.marketing_content_review_targets%ROWTYPE; v_review public.marketing_content_reviews%ROWTYPE; v_built jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_token_hash ~ '^[0-9a-f]{64}$',false) IS NOT TRUE
    OR COALESCE(p_chat_id ~ '^-?[1-9][0-9]{0,19}$',false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid content review delivery identity' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'admin-marketing-operations' AND is_active) THEN RETURN NULL; END IF;
  -- Cron invocations can overlap the 140-second sender budget. Serialize the
  -- check-and-reserve operation for this chat, independently from target locks.
  -- Every state counts: invalidation or explicit retry must not let a second
  -- sender interleave with a still-running or uncertain first sender.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('marketing_content_review_transport:'||p_chat_id,0));
  IF EXISTS (SELECT 1 FROM public.marketing_content_reviews
    WHERE chat_id = p_chat_id AND transport_lease_until > clock_timestamp()) THEN RETURN NULL; END IF;
  FOR v_target IN SELECT * FROM public.marketing_content_review_targets
    WHERE status IN ('queued','waiting_items','waiting_visuals') AND next_attempt_at <= clock_timestamp()
    ORDER BY next_attempt_at,created_at,target_type,target_id LIMIT 32 FOR UPDATE SKIP LOCKED
  LOOP
    v_built := public.marketing_build_content_review_snapshot(v_target.target_type,v_target.target_id,v_target.revision);
    IF v_built->>'status' <> 'ready' THEN
      UPDATE public.marketing_content_review_targets SET status = v_built->>'status',last_error = v_built->>'error',
        next_attempt_at = clock_timestamp()+interval '2 minutes',updated_at = clock_timestamp()
      WHERE target_type = v_target.target_type AND target_id = v_target.target_id;
      CONTINUE;
    END IF;
    INSERT INTO public.marketing_content_reviews(target_type,target_id,revision,snapshot,token_hash,chat_id,transport_lease_until,expires_at)
      VALUES(v_target.target_type,v_target.target_id,v_target.revision,v_built->'snapshot',p_token_hash,p_chat_id,
        clock_timestamp()+interval '5 minutes',clock_timestamp()+interval '24 hours') RETURNING * INTO v_review;
    UPDATE public.marketing_content_review_targets SET status = 'delivering',latest_review_id = v_review.id,
      assembled_at = COALESCE(assembled_at,clock_timestamp()),updated_at = clock_timestamp(),last_error = NULL
    WHERE target_type = v_target.target_type AND target_id = v_target.target_id;
    RETURN to_jsonb(v_review)-'token_hash'-'chat_id'-'transport_lease_until';
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_marketing_content_review_delivery(
  p_review_id uuid,p_message_ids bigint[] DEFAULT '{}'::bigint[],p_control_message_id bigint DEFAULT NULL,
  p_document_complete boolean DEFAULT false,p_outcome text DEFAULT 'delivered',p_error_code text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_review public.marketing_content_reviews%ROWTYPE; v_target public.marketing_content_review_targets%ROWTYPE; v_ids bigint[];
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_outcome NOT IN ('delivered','failed','delivery_unknown') OR p_outcome IS NULL
    OR cardinality(COALESCE(p_message_ids,'{}'::bigint[])) > 256
    OR EXISTS (SELECT 1 FROM unnest(p_message_ids) n WHERE n IS NULL OR n <= 0)
    OR p_control_message_id <= 0
    OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_]{1,96}$') THEN
    RAISE EXCEPTION 'Invalid content review delivery acknowledgement' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_review FROM public.marketing_content_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_target FROM public.marketing_content_review_targets
    WHERE target_type = v_review.target_type AND target_id = v_review.target_id FOR UPDATE;
  SELECT * INTO v_review FROM public.marketing_content_reviews WHERE id = p_review_id FOR UPDATE;
  IF v_target.revision <> v_review.revision OR v_target.latest_review_id IS DISTINCT FROM v_review.id THEN RETURN NULL; END IF;
  IF v_review.status IN ('approved','rejected') AND p_outcome = 'delivered'
    AND p_control_message_id = v_review.control_message_id THEN RETURN to_jsonb(v_review)-'token_hash'-'chat_id'-'transport_lease_until'; END IF;
  IF v_review.status NOT IN ('delivering','pending','delivery_unknown') OR v_review.expires_at <= clock_timestamp() THEN RETURN NULL; END IF;
  IF v_review.control_message_id IS NOT NULL AND p_control_message_id IS NOT NULL
    AND v_review.control_message_id <> p_control_message_id THEN
    RAISE EXCEPTION 'Content review control message already assigned' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT n ORDER BY n),'{}'::bigint[]) INTO v_ids
    FROM unnest(v_review.message_ids || COALESCE(p_message_ids,'{}'::bigint[])
      || CASE WHEN p_control_message_id IS NULL THEN '{}'::bigint[] ELSE ARRAY[p_control_message_id] END) n;
  IF cardinality(v_ids) > 256 OR ((p_document_complete OR v_review.document_complete) AND cardinality(v_ids) = 0)
    OR (p_control_message_id IS NOT NULL AND NOT (COALESCE(p_document_complete,false) OR v_review.document_complete)) THEN
    RAISE EXCEPTION 'Content review document is incomplete' USING ERRCODE = '22023';
  END IF;
  UPDATE public.marketing_content_reviews SET message_ids = v_ids,
    document_complete = document_complete OR COALESCE(p_document_complete,false),
    control_message_id = COALESCE(control_message_id,p_control_message_id),
    status = CASE WHEN p_outcome <> 'delivered' THEN p_outcome
      WHEN COALESCE(control_message_id,p_control_message_id) IS NOT NULL THEN 'pending' ELSE 'delivering' END,
    last_error_code = CASE WHEN p_outcome = 'delivered' THEN NULL ELSE p_error_code END,
    -- Keep pacing across dossier boundaries, not just inside one invocation.
    transport_lease_until = CASE WHEN p_outcome = 'failed'
      OR (p_outcome = 'delivered' AND p_control_message_id IS NOT NULL)
      THEN clock_timestamp()+CASE WHEN chat_id LIKE '-%' THEN interval '3100 milliseconds' ELSE interval '1100 milliseconds' END
      ELSE transport_lease_until END,
    updated_at = clock_timestamp()
  WHERE id = p_review_id RETURNING * INTO v_review;
  UPDATE public.marketing_content_review_targets SET status = v_review.status,last_error = v_review.last_error_code,updated_at = clock_timestamp()
    WHERE target_type = v_review.target_type AND target_id = v_review.target_id;
  RETURN to_jsonb(v_review)-'token_hash'-'chat_id'-'transport_lease_until';
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_marketing_content_review(
  p_token_hash text,p_chat_id text,p_message_id bigint,p_decision text,p_actor text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_review public.marketing_content_reviews%ROWTYPE; v_target public.marketing_content_review_targets%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF p_decision NOT IN ('approved','rejected') OR p_decision IS NULL OR p_message_id IS NULL OR p_message_id <= 0
    OR COALESCE(char_length(btrim(p_actor)),0) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid content review decision' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_review FROM public.marketing_content_reviews WHERE token_hash = p_token_hash AND chat_id = p_chat_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_target FROM public.marketing_content_review_targets
    WHERE target_type = v_review.target_type AND target_id = v_review.target_id FOR UPDATE;
  SELECT * INTO v_review FROM public.marketing_content_reviews WHERE id = v_review.id FOR UPDATE;
  IF v_target.revision <> v_review.revision OR v_target.latest_review_id IS DISTINCT FROM v_review.id
    OR v_review.status NOT IN ('delivering','pending','delivery_unknown') OR NOT v_review.document_complete
    OR v_review.expires_at <= clock_timestamp()
    OR (v_review.control_message_id IS NOT NULL AND v_review.control_message_id <> p_message_id) THEN RETURN NULL; END IF;
  IF (public.marketing_build_content_review_snapshot(v_target.target_type,v_target.target_id,v_target.revision)->>'status') <> 'ready' THEN RETURN NULL; END IF;
  -- An authenticated callback may bind the final message if its send ACK was
  -- lost, but only after all document ACKs were durably recorded. No resend.
  UPDATE public.marketing_content_reviews SET status = p_decision,decided_at = clock_timestamp(),
    decision_actor = btrim(p_actor),control_message_id = COALESCE(control_message_id,p_message_id),
    message_ids = CASE WHEN p_message_id = ANY(message_ids) THEN message_ids ELSE array_append(message_ids,p_message_id) END,
    transport_lease_until = clock_timestamp()+CASE WHEN chat_id LIKE '-%' THEN interval '3100 milliseconds' ELSE interval '1100 milliseconds' END,
    updated_at = clock_timestamp() WHERE id = v_review.id RETURNING * INTO v_review;
  UPDATE public.marketing_content_review_targets SET status = p_decision,updated_at = clock_timestamp()
    WHERE target_type = v_review.target_type AND target_id = v_review.target_id;
  RETURN to_jsonb(v_review)-'token_hash'-'chat_id'-'transport_lease_until';
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_content_review_allows_delivery(p_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT t.target_id IS NULL OR (t.status = 'approved' AND r.status = 'approved' AND r.revision = t.revision)
    FROM public.marketing_calendar_items i LEFT JOIN public.marketing_content_review_targets t
      ON t.target_type = CASE WHEN i.campaign_id IS NULL THEN 'item' ELSE 'campaign' END
      AND t.target_id = COALESCE(i.campaign_id,i.id)
    LEFT JOIN public.marketing_content_reviews r ON r.id = t.latest_review_id
    WHERE i.id = p_item_id),false);
$$;

CREATE OR REPLACE FUNCTION public.admin_get_marketing_content_review_status(p_target_type text,p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_target public.marketing_content_review_targets%ROWTYPE; v_review public.marketing_content_reviews%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_target_type NOT IN ('campaign','item') OR p_target_type IS NULL OR p_target_id IS NULL THEN
    RAISE EXCEPTION 'Invalid review target' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_target FROM public.marketing_content_review_targets
    WHERE target_type = p_target_type AND target_id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,
    'revision',0,'status','not_requested','updated_at',NULL,'review',NULL); END IF;
  SELECT * INTO v_review FROM public.marketing_content_reviews WHERE id = v_target.latest_review_id FOR UPDATE;
  IF FOUND AND v_review.status IN ('delivering','pending','delivery_unknown') AND v_review.expires_at <= clock_timestamp() THEN
    UPDATE public.marketing_content_reviews SET status = 'expired',updated_at = clock_timestamp()
      WHERE id = v_review.id RETURNING * INTO v_review;
    IF v_review.revision = v_target.revision THEN
      UPDATE public.marketing_content_review_targets SET status = 'expired',updated_at = clock_timestamp()
        WHERE target_type = p_target_type AND target_id = p_target_id RETURNING * INTO v_target;
    END IF;
  ELSIF v_review.id IS NOT NULL AND v_review.status = 'delivering'
    AND v_review.updated_at < clock_timestamp()-interval '5 minutes' THEN
    -- A worker may disappear before recording its failure. This exceeds the
    -- complete HTTP invocation timeout and exposes an explicit recovery action,
    -- without making the uncertain dossier automatically claimable again.
    UPDATE public.marketing_content_reviews SET status = 'delivery_unknown',
      last_error_code = 'content_review_delivery_unknown',updated_at = clock_timestamp()
      WHERE id = v_review.id RETURNING * INTO v_review;
    IF v_review.revision = v_target.revision THEN
      UPDATE public.marketing_content_review_targets SET status = 'delivery_unknown',
        last_error = 'content_review_delivery_unknown',updated_at = clock_timestamp()
        WHERE target_type = p_target_type AND target_id = p_target_id RETURNING * INTO v_target;
    END IF;
  END IF;
  RETURN jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'revision',v_target.revision,
    'status',v_target.status,'updated_at',v_target.updated_at,'review',CASE WHEN v_review.id IS NULL THEN NULL ELSE
      jsonb_build_object('id',v_review.id,'status',v_review.status,'created_at',v_review.created_at,
        'expires_at',v_review.expires_at,'decided_at',v_review.decided_at,
        'delivery_complete',v_review.document_complete,'message_count',cardinality(v_review.message_ids),
        'last_error_code',v_review.last_error_code) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_marketing_content_review(
  p_target_type text,p_target_id uuid,p_expected_revision bigint,p_expected_review_id uuid DEFAULT NULL,p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status jsonb; v_target public.marketing_content_review_targets%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_admin();
  v_status := public.admin_get_marketing_content_review_status(p_target_type,p_target_id);
  SELECT * INTO v_target FROM public.marketing_content_review_targets
    WHERE target_type = p_target_type AND target_id = p_target_id FOR UPDATE;
  IF NOT FOUND OR p_expected_revision IS NULL OR p_expected_revision <> v_target.revision
    OR p_expected_review_id IS DISTINCT FROM v_target.latest_review_id THEN
    RAISE EXCEPTION 'Content review changed; refresh before retrying' USING ERRCODE = '40001';
  END IF;
  IF v_target.status IN ('queued','waiting_items','waiting_visuals') THEN RETURN v_status; END IF;
  IF v_target.status NOT IN ('expired','rejected','failed','delivery_unknown','stale') THEN
    RAISE EXCEPTION 'Content review cannot be retried in its current state' USING ERRCODE = '22023';
  END IF;
  -- Fence a prior ambiguous attempt before issuing a fresh token. Keeping its
  -- immutable snapshot/history avoids both token replay and permanent dedupe.
  UPDATE public.marketing_content_reviews SET status = 'stale',updated_at = clock_timestamp()
    WHERE id = v_target.latest_review_id AND status = 'delivery_unknown';
  UPDATE public.marketing_content_review_targets SET status = 'queued',next_attempt_at = clock_timestamp(),
    last_error = NULL,updated_at = clock_timestamp() WHERE target_type = p_target_type AND target_id = p_target_id;
  INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,new_data)
  VALUES(public.marketing_actor_user_id(),'marketing_content_review_retried','marketing_content_review_targets',p_target_id,
    jsonb_build_object('target_type',p_target_type,'revision',v_target.revision,'previous_review_id',v_target.latest_review_id,
      'reason',left(NULLIF(btrim(p_reason),''),240),'external_effect',false));
  RETURN public.admin_get_marketing_content_review_status(p_target_type,p_target_id);
END;
$$;

-- Keep the existing series configuration and generation/quality checks. The
-- standing authorization may no longer approve or schedule a freshly made post.
CREATE OR REPLACE FUNCTION public.marketing_schedule_authorized_daily_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_series public.marketing_daily_series%ROWTYPE;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE id = NEW.series_id;
  IF v_series.publication_mode = 'automatic' AND v_series.status = 'active'
    AND v_series.auto_authorized_at IS NOT NULL AND NEW.created_at >= v_series.auto_authorized_at THEN
    UPDATE public.marketing_daily_runs SET last_error = 'waiting_content_review' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Extend the established session/CSRF/administrator dispatcher, never expose
-- these administrator RPCs directly to a browser Supabase session.
DO $content_review_dispatch$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_execute_marketing_admin_operation(text,text,text,jsonb)');
  v_definition text;
  v_anchor constant text := '    WHEN ''admin_upsert_marketing_calendar_item'' THEN';
  v_branch constant text := $branch$    WHEN 'admin_get_marketing_content_review_status' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_args) arg(k)
        WHERE arg.k NOT IN ('p_target_type','p_target_id')) THEN
        RAISE EXCEPTION 'Unsupported content review arguments' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_get_marketing_content_review_status(v_args->>'p_target_type',NULLIF(v_args->>'p_target_id','')::uuid);
    WHEN 'admin_retry_marketing_content_review' THEN
      IF p_csrf_hash IS NULL THEN RAISE EXCEPTION 'Marketing CSRF proof required' USING ERRCODE = '42501'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_args) arg(k)
        WHERE arg.k NOT IN ('p_target_type','p_target_id','p_expected_revision','p_expected_review_id','p_reason')) THEN
        RAISE EXCEPTION 'Unsupported content review arguments' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_retry_marketing_content_review(v_args->>'p_target_type',NULLIF(v_args->>'p_target_id','')::uuid,
        NULLIF(v_args->>'p_expected_revision','')::bigint,NULLIF(v_args->>'p_expected_review_id','')::uuid,v_args->>'p_reason');
$branch$;
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Required marketing BFF dispatcher is missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition,v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition,'WHEN ''admin_get_marketing_content_review_status''') > 0
    OR (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing BFF dispatcher; reconcile migration history';
  ELSE EXECUTE replace(v_definition,v_anchor,v_branch||v_anchor);
  END IF;
END;
$content_review_dispatch$;

CREATE OR REPLACE FUNCTION public.invoke_marketing_content_review_cron()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_edge_url text; v_secret text; v_request_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'admin-marketing-operations' AND is_active)
    OR NOT EXISTS (SELECT 1 FROM public.marketing_content_review_targets
      WHERE status IN ('queued','waiting_items','waiting_visuals') AND next_attempt_at <= clock_timestamp())
    OR to_regclass('vault.decrypted_secrets') IS NULL
    OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN NULL; END IF;
  EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url'' LIMIT 1' INTO v_edge_url;
  EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''internal_cron_secret'' LIMIT 1' INTO v_secret;
  IF v_edge_url IS NULL OR v_edge_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$'
    OR COALESCE(char_length(v_secret),0) < 32 THEN RETURN NULL; END IF;
  SELECT net.http_post(url := regexp_replace(v_edge_url,'/marketing-orchestrator$','/ops-incident-control'),
    headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret',v_secret),
    body := '{"action":"content_review_process"}'::jsonb,timeout_milliseconds := 180000) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.marketing_content_review_content(jsonb), public.marketing_content_review_audience(jsonb),
  public.marketing_content_review_destination(uuid,text,text,text,jsonb),
  public.marketing_touch_content_review_target(text,uuid,boolean,boolean),
  public.marketing_queue_campaign_content_review(), public.marketing_queue_item_content_review(),
  public.marketing_queue_destination_content_review(), public.marketing_build_content_review_snapshot(text,uuid,bigint),
  public.claim_marketing_content_review(text,text),
  public.record_marketing_content_review_delivery(uuid,bigint[],bigint,boolean,text,text),
  public.decide_marketing_content_review(text,text,bigint,text,text),
  public.marketing_content_review_allows_delivery(uuid),
  public.admin_get_marketing_content_review_status(text,uuid),
  public.admin_retry_marketing_content_review(text,uuid,bigint,uuid,text),
  public.marketing_schedule_authorized_daily_post(), public.invoke_marketing_content_review_cron()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_marketing_content_review(text,text),
  public.record_marketing_content_review_delivery(uuid,bigint[],bigint,boolean,text,text),
  public.decide_marketing_content_review(text,text,bigint,text,text) TO service_role;

DO $content_review_scheduler$
DECLARE v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regprocedure('cron.schedule(text,text,text)') IS NULL
    OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE NOTICE 'Content review scheduler not installed: pg_cron or pg_net unavailable'; RETURN;
  END IF;
  EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''tok-marketing-content-review'' LIMIT 1' INTO v_job;
  IF v_job IS NULL THEN
    PERFORM cron.schedule('tok-marketing-content-review','*/2 * * * *','SELECT public.invoke_marketing_content_review_cron();');
  END IF;
END;
$content_review_scheduler$;

NOTIFY pgrst, 'reload schema';
COMMIT;
