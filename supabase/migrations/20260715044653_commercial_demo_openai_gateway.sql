-- Replace the synthetic commercial-demo AI writers with a server-side OpenAI
-- gateway. This is deliberately a follow-up to 20260715015956: that migration
-- is already live and its historical SVG rows must remain readable.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

BEGIN;

-- Real generations are private Storage objects. Keep legacy SVG rows valid,
-- while making every new provider-backed row identify its request and usage.
ALTER TABLE public.commercial_demo_ai_generations
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_generations_model_check,
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_generations_output_mime_type_check,
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_generations_output_svg_check,
  DROP CONSTRAINT IF EXISTS commercial_demo_ai_generations_estimated_cost_chf_check;

ALTER TABLE public.commercial_demo_ai_generations
  ALTER COLUMN output_svg DROP NOT NULL,
  ALTER COLUMN model DROP DEFAULT,
  ALTER COLUMN estimated_cost_chf TYPE numeric(12, 6),
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS output_sha256 text,
  ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.commercial_demo_ai_generations
  ADD CONSTRAINT commercial_demo_ai_generations_request_id_unique UNIQUE (request_id),
  ADD CONSTRAINT commercial_demo_ai_generations_model_nonempty_check
    CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),
  ADD CONSTRAINT commercial_demo_ai_generations_output_mime_type_check
    CHECK (output_mime_type IN ('image/svg+xml', 'image/png', 'image/webp')),
  ADD CONSTRAINT commercial_demo_ai_generations_output_check
    CHECK (
      (output_svg IS NOT NULL
        AND char_length(output_svg) BETWEEN 100 AND 200000
        AND storage_bucket IS NULL
        AND storage_path IS NULL
        AND output_mime_type = 'image/svg+xml')
      OR
      (output_svg IS NULL
        AND storage_bucket = 'commercial-demo-ai'
        AND char_length(COALESCE(storage_path, '')) BETWEEN 10 AND 500
        AND output_mime_type IN ('image/png', 'image/webp'))
    ),
  ADD CONSTRAINT commercial_demo_ai_generations_output_sha256_check
    CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT commercial_demo_ai_generations_token_usage_check
    CHECK (
      input_tokens >= 0
      AND output_tokens >= 0
      AND total_tokens >= 0
      AND total_tokens >= input_tokens
      AND total_tokens >= output_tokens
    ),
  ADD CONSTRAINT commercial_demo_ai_generations_estimated_cost_chf_check
    CHECK (estimated_cost_chf >= 0);

CREATE TABLE public.commercial_demo_ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  commercial_user_id uuid NOT NULL,
  demo_restaurant_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('chat', 'visual_generate')),
  tool text NOT NULL CHECK (tool IN (
    'assistant', 'support_chat', 'marketing_studio', 'photo_studio', 'advisor_visual'
  )),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  lock_token uuid NOT NULL,
  response jsonb CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 160),
  model text CHECK (model IS NULL OR char_length(btrim(model)) BETWEEN 1 AND 120),
  provider_response_id text CHECK (
    provider_response_id IS NULL OR char_length(provider_response_id) BETWEEN 1 AND 200
  ),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (
    total_tokens >= 0 AND total_tokens >= input_tokens AND total_tokens >= output_tokens
  ),
  credit_units integer NOT NULL DEFAULT 0 CHECK (credit_units = 0),
  estimated_cost_chf numeric(12, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_chf >= 0),
  locked_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_ai_requests_request_id_unique UNIQUE (request_id),
  CONSTRAINT commercial_demo_ai_requests_session_fk
    FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)
    REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT commercial_demo_ai_requests_action_tool_check CHECK (
    (action = 'chat' AND tool IN ('assistant', 'support_chat'))
    OR
    (action = 'visual_generate' AND tool IN ('marketing_studio', 'photo_studio', 'advisor_visual'))
  ),
  CONSTRAINT commercial_demo_ai_requests_state_check CHECK (
    (status = 'processing' AND response IS NULL AND error_code IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND response IS NOT NULL AND error_code IS NULL AND completed_at IS NOT NULL)
    OR
    (status = 'failed' AND response IS NULL AND error_code IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX commercial_demo_ai_requests_session_created_idx
  ON public.commercial_demo_ai_requests (session_id, created_at DESC, request_id);
CREATE INDEX commercial_demo_ai_requests_processing_idx
  ON public.commercial_demo_ai_requests (locked_at, session_id)
  WHERE status = 'processing';
CREATE INDEX commercial_demo_ai_requests_provider_failures_idx
  ON public.commercial_demo_ai_requests (completed_at DESC)
  WHERE status = 'failed' AND error_code LIKE 'provider_%';

-- SQL cannot safely remove the underlying Storage payload. Lifecycle triggers
-- therefore enqueue paths and the Edge Function drains this internal outbox in
-- bounded batches through the official Storage API.
CREATE TABLE public.commercial_demo_ai_storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket text NOT NULL DEFAULT 'commercial-demo-ai'
    CHECK (storage_bucket = 'commercial-demo-ai'),
  storage_path text NOT NULL CHECK (
    char_length(storage_path) BETWEEN 10 AND 500
    AND storage_path !~ '(^/|\\\\|(^|/)\.\.(/|$))'
  ),
  reason text NOT NULL CHECK (reason IN ('session_archived', 'session_deleted', 'retention')),
  commercial_user_id uuid,
  session_id uuid,
  request_id uuid,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_ai_storage_cleanup_path_unique
    UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX commercial_demo_ai_storage_cleanup_enqueued_idx
  ON public.commercial_demo_ai_storage_cleanup_queue (enqueued_at, id);

-- Append-only attempt events make the circuit breaker resistant to retries of
-- the same request_id. Current request status is deliberately not the journal.
CREATE TABLE public.commercial_demo_ai_provider_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  session_id uuid NOT NULL,
  commercial_user_id uuid NOT NULL,
  error_code text NOT NULL CHECK (
    error_code ~ '^provider_'
    AND char_length(error_code) BETWEEN 10 AND 160
  ),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commercial_demo_ai_provider_failures_occurred_idx
  ON public.commercial_demo_ai_provider_failures (occurred_at DESC, id);

ALTER TABLE public.commercial_demo_ai_generations
  ADD CONSTRAINT commercial_demo_ai_generations_request_fk
  FOREIGN KEY (request_id)
  REFERENCES public.commercial_demo_ai_requests (request_id)
  ON DELETE CASCADE;

ALTER TABLE public.commercial_demo_ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_ai_storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_ai_provider_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_demo_ai_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_ai_requests TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.commercial_demo_ai_requests TO service_role;
REVOKE ALL ON TABLE public.commercial_demo_ai_storage_cleanup_queue
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_demo_ai_storage_cleanup_queue
  TO service_role;
REVOKE ALL ON TABLE public.commercial_demo_ai_provider_failures
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.commercial_demo_ai_provider_failures
  TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.commercial_demo_ai_conversations TO service_role;
GRANT INSERT, DELETE ON TABLE public.commercial_demo_ai_messages TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.commercial_demo_ai_generations TO service_role;

-- The browser receives short-lived signed URLs. It has no direct object policy,
-- so only the Edge Function service role can upload, sign, or remove objects.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commercial-demo-ai',
  'commercial-demo-ai',
  false,
  20971520,
  ARRAY['image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Claim one semantic request. The advisory lock and UNIQUE request_id make
-- identical replays deterministic and reject a UUID reused with another body.
-- There is no business/session quota: only bounded simultaneous provider work
-- and a short global provider-failure circuit breaker.
CREATE OR REPLACE FUNCTION public.commercial_demo_ai_claim_request(
  p_request_id uuid,
  p_session_id uuid,
  p_actor_user_id uuid,
  p_commercial_user_id uuid,
  p_demo_restaurant_id uuid,
  p_action text,
  p_tool text,
  p_payload_hash text,
  p_lock_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.commercial_demo_ai_requests%ROWTYPE;
  v_session_ok boolean := false;
  v_global_processing integer := 0;
  v_session_processing integer := 0;
  v_provider_failures integer := 0;
BEGIN
  IF p_request_id IS NULL OR p_session_id IS NULL OR p_actor_user_id IS NULL
     OR p_commercial_user_id IS NULL OR p_demo_restaurant_id IS NULL OR p_lock_token IS NULL
     OR COALESCE(p_payload_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid commercial demo AI claim' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (p_action = 'chat' AND p_tool IN ('assistant', 'support_chat'))
    OR
    (p_action = 'visual_generate' AND p_tool IN ('marketing_studio', 'photo_studio', 'advisor_visual'))
  ) THEN
    RAISE EXCEPTION 'invalid commercial demo AI action/tool' USING ERRCODE = '22023';
  END IF;

  -- Lock and validate the lifecycle row in one statement. A concurrent reset,
  -- archive, account deactivation or demo-restaurant change must finish before
  -- a provider slot can be claimed, never between validation and INSERT.
  SELECT true INTO v_session_ok
  FROM public.commercial_demo_order_sessions session
  JOIN public.commercial_demo_accounts account
    ON account.user_id = session.commercial_user_id
   AND account.demo_restaurant_id = session.demo_restaurant_id
   AND account.is_active
  JOIN public.restaurants restaurant
    ON restaurant.id = session.demo_restaurant_id
   AND restaurant.is_demo
  WHERE session.id = p_session_id
    AND session.status = 'active'
    AND session.commercial_user_id = p_commercial_user_id
    AND session.commercial_user_id = p_actor_user_id
    AND session.demo_restaurant_id = p_demo_restaurant_id
  FOR UPDATE OF session, account, restaurant;

  IF COALESCE(v_session_ok, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial demo AI session is not active or mapped' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-request:' || p_request_id::text, 0)
  );

  -- Serialize every count/reclaim/insert across distinct request UUIDs. The
  -- request lock above keeps idempotency deterministic; this global lock makes
  -- both provider and per-session concurrency guards atomic.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-global-claim', 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-session:' || p_session_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.session_id <> p_session_id
       OR v_existing.commercial_user_id <> p_commercial_user_id
       OR v_existing.demo_restaurant_id <> p_demo_restaurant_id
       OR v_existing.action <> p_action
       OR v_existing.tool <> p_tool
       OR v_existing.payload_hash <> p_payload_hash THEN
      RETURN jsonb_build_object('state', 'mismatch');
    END IF;

    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'state', 'replay',
        'response', v_existing.response,
        'request_id', v_existing.request_id
      );
    END IF;

    IF v_existing.status = 'failed' THEN
      SELECT count(*) INTO v_provider_failures
      FROM public.commercial_demo_ai_provider_failures failure
      WHERE failure.occurred_at > now() - interval '90 seconds';

      IF v_provider_failures >= 6 THEN
        RETURN jsonb_build_object('state', 'circuit_open', 'retry_after_seconds', 90);
      END IF;

      SELECT count(*) INTO v_global_processing
      FROM public.commercial_demo_ai_requests request
      WHERE request.status = 'processing'
        AND request.locked_at > now() - interval '3 minutes';

      SELECT count(*) INTO v_session_processing
      FROM public.commercial_demo_ai_requests request
      WHERE request.status = 'processing'
        AND request.session_id = p_session_id
        AND request.locked_at > now() - interval '3 minutes';

      IF v_global_processing >= 12 OR v_session_processing >= 2 THEN
        RETURN jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
      END IF;

      UPDATE public.commercial_demo_ai_requests
      SET actor_user_id = p_actor_user_id,
          status = 'processing',
          lock_token = p_lock_token,
          response = NULL,
          error_code = NULL,
          model = NULL,
          provider_response_id = NULL,
          input_tokens = 0,
          output_tokens = 0,
          total_tokens = 0,
          estimated_cost_chf = 0,
          locked_at = now(),
          completed_at = NULL,
          updated_at = now()
      WHERE id = v_existing.id;

      RETURN jsonb_build_object(
        'state', 'claimed',
        'request_id', p_request_id,
        'retry_after_failure', true
      );
    END IF;

    IF v_existing.locked_at > now() - interval '3 minutes' THEN
      RETURN jsonb_build_object('state', 'in_progress', 'request_id', v_existing.request_id);
    END IF;

    -- A stale request is a new provider slot. It must pass the same breaker
    -- and atomic concurrency guards as a failed retry or a brand-new UUID.
    SELECT count(*) INTO v_provider_failures
    FROM public.commercial_demo_ai_provider_failures failure
    WHERE failure.occurred_at > now() - interval '90 seconds';

    IF v_provider_failures >= 6 THEN
      RETURN jsonb_build_object('state', 'circuit_open', 'retry_after_seconds', 90);
    END IF;

    SELECT count(*) INTO v_global_processing
    FROM public.commercial_demo_ai_requests request
    WHERE request.status = 'processing'
      AND request.request_id <> p_request_id
      AND request.locked_at > now() - interval '3 minutes';

    SELECT count(*) INTO v_session_processing
    FROM public.commercial_demo_ai_requests request
    WHERE request.status = 'processing'
      AND request.request_id <> p_request_id
      AND request.session_id = p_session_id
      AND request.locked_at > now() - interval '3 minutes';

    IF v_global_processing >= 12 OR v_session_processing >= 2 THEN
      RETURN jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
    END IF;

    UPDATE public.commercial_demo_ai_requests
    SET actor_user_id = p_actor_user_id,
        lock_token = p_lock_token,
        locked_at = now(),
        updated_at = now()
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
      'state', 'claimed',
      'request_id', p_request_id,
      'recovered_stale_lock', true
    );
  END IF;

  -- Release abandoned locks before evaluating concurrency. This is a safety
  -- brake, not a usage quota, and therefore never limits sequential demos.
  UPDATE public.commercial_demo_ai_requests
  SET status = 'failed',
      error_code = 'request_abandoned',
      completed_at = now(),
      updated_at = now()
  WHERE status = 'processing'
    AND locked_at <= now() - interval '3 minutes';

  SELECT count(*) INTO v_provider_failures
  FROM public.commercial_demo_ai_provider_failures failure
  WHERE failure.occurred_at > now() - interval '90 seconds';

  IF v_provider_failures >= 6 THEN
    RETURN jsonb_build_object('state', 'circuit_open', 'retry_after_seconds', 90);
  END IF;

  SELECT count(*) INTO v_global_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.locked_at > now() - interval '3 minutes';

  SELECT count(*) INTO v_session_processing
  FROM public.commercial_demo_ai_requests request
  WHERE request.status = 'processing'
    AND request.session_id = p_session_id
    AND request.locked_at > now() - interval '3 minutes';

  IF v_global_processing >= 12 OR v_session_processing >= 2 THEN
    RETURN jsonb_build_object('state', 'busy', 'retry_after_seconds', 5);
  END IF;

  INSERT INTO public.commercial_demo_ai_requests (
    request_id,
    session_id,
    commercial_user_id,
    demo_restaurant_id,
    actor_user_id,
    action,
    tool,
    payload_hash,
    lock_token
  ) VALUES (
    p_request_id,
    p_session_id,
    p_commercial_user_id,
    p_demo_restaurant_id,
    p_actor_user_id,
    p_action,
    p_tool,
    p_payload_hash,
    p_lock_token
  );

  RETURN jsonb_build_object('state', 'claimed', 'request_id', p_request_id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_complete_chat_request(
  p_request_id uuid,
  p_lock_token uuid,
  p_message text,
  p_context jsonb,
  p_conversation_id uuid,
  p_surface text,
  p_reply text,
  p_model text,
  p_provider_response_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_estimated_cost_chf numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.commercial_demo_ai_requests%ROWTYPE;
  v_conversation public.commercial_demo_ai_conversations%ROWTYPE;
  v_response jsonb;
  v_created_at timestamptz := now();
  v_session_id uuid;
  v_session_active boolean := false;
BEGIN
  SELECT request.session_id INTO v_session_id
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id;

  SELECT true INTO v_session_active
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_session_id
    AND session.status = 'active'
  FOR UPDATE;

  IF COALESCE(v_session_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial demo AI session is no longer active' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_request
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;

  IF v_request.status = 'completed' THEN
    RETURN v_request.response;
  END IF;
  IF v_request.id IS NULL OR v_request.status <> 'processing'
     OR v_request.lock_token <> p_lock_token OR v_request.action <> 'chat' THEN
    RAISE EXCEPTION 'commercial demo AI request lock lost' USING ERRCODE = '55000';
  END IF;
  IF p_surface NOT IN ('client', 'restaurant', 'courier')
     OR char_length(btrim(COALESCE(p_message, ''))) NOT BETWEEN 1 AND 4000
     OR char_length(btrim(COALESCE(p_reply, ''))) NOT BETWEEN 1 AND 8000
     OR jsonb_typeof(COALESCE(p_context, '{}'::jsonb)) <> 'object'
     OR pg_column_size(COALESCE(p_context, '{}'::jsonb)) > 32768
     OR char_length(btrim(COALESCE(p_model, ''))) NOT BETWEEN 1 AND 120
     OR COALESCE(p_input_tokens, -1) < 0
     OR COALESCE(p_output_tokens, -1) < 0
     OR COALESCE(p_total_tokens, -1) < greatest(p_input_tokens, p_output_tokens)
     OR COALESCE(p_estimated_cost_chf, -1) < 0 THEN
    RAISE EXCEPTION 'invalid commercial demo AI completion' USING ERRCODE = '22023';
  END IF;

  IF p_conversation_id IS NOT NULL THEN
    SELECT * INTO v_conversation
    FROM public.commercial_demo_ai_conversations conversation
    WHERE conversation.id = p_conversation_id
      AND conversation.session_id = v_request.session_id
      AND conversation.commercial_user_id = v_request.commercial_user_id
      AND conversation.demo_restaurant_id = v_request.demo_restaurant_id
      AND conversation.tool = v_request.tool
      AND conversation.status = 'active'
    FOR UPDATE;
    IF v_conversation.id IS NULL THEN
      RAISE EXCEPTION 'commercial demo AI conversation not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.commercial_demo_ai_conversations (
      session_id, commercial_user_id, demo_restaurant_id, tool, surface, title, metadata
    ) VALUES (
      v_request.session_id,
      v_request.commercial_user_id,
      v_request.demo_restaurant_id,
      v_request.tool,
      p_surface,
      left(regexp_replace(btrim(p_message), E'[\\n\\r\\t]+', ' ', 'g'), 120),
      jsonb_build_object('engine', 'openai', 'production_data', false, 'unlimited_demo', true)
    ) RETURNING * INTO v_conversation;
  END IF;

  INSERT INTO public.commercial_demo_ai_messages (
    conversation_id,
    session_id,
    commercial_user_id,
    demo_restaurant_id,
    role,
    content,
    metadata,
    created_at
  ) VALUES
  (
    v_conversation.id,
    v_request.session_id,
    v_request.commercial_user_id,
    v_request.demo_restaurant_id,
    'user',
    btrim(p_message),
    jsonb_build_object(
      'surface', p_surface,
      'request_id', p_request_id,
      'context', COALESCE(p_context, '{}'::jsonb)
    ),
    v_created_at
  ),
  (
    v_conversation.id,
    v_request.session_id,
    v_request.commercial_user_id,
    v_request.demo_restaurant_id,
    'assistant',
    btrim(p_reply),
    jsonb_build_object(
      'surface', p_surface,
      'request_id', p_request_id,
      'engine', 'openai',
      'model', p_model,
      'provider_response_id', p_provider_response_id,
      'input_tokens', p_input_tokens,
      'output_tokens', p_output_tokens,
      'total_tokens', p_total_tokens,
      'estimated_cost_chf', p_estimated_cost_chf,
      'credit_units', 0
    ),
    v_created_at + interval '1 microsecond'
  );

  UPDATE public.commercial_demo_ai_conversations
  SET updated_at = v_created_at,
      metadata = metadata || jsonb_build_object(
        'last_surface', p_surface,
        'last_model', p_model,
        'last_request_id', p_request_id
      )
  WHERE id = v_conversation.id;

  v_response := jsonb_build_object(
    'request_id', p_request_id,
    'conversation_id', v_conversation.id,
    'reply', btrim(p_reply),
    'tool', v_request.tool,
    'model', p_model,
    'input_tokens', p_input_tokens,
    'output_tokens', p_output_tokens,
    'total_tokens', p_total_tokens,
    'credit_units', 0,
    'estimated_cost_chf', p_estimated_cost_chf,
    'replayed', false,
    'created_at', v_created_at
  );

  UPDATE public.commercial_demo_ai_requests
  SET status = 'completed',
      response = v_response,
      model = p_model,
      provider_response_id = NULLIF(btrim(COALESCE(p_provider_response_id, '')), ''),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      estimated_cost_chf = p_estimated_cost_chf,
      completed_at = v_created_at,
      updated_at = v_created_at
  WHERE id = v_request.id;

  RETURN v_response;
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_complete_visual_request(
  p_request_id uuid,
  p_lock_token uuid,
  p_prompt text,
  p_format text,
  p_style text,
  p_context jsonb,
  p_storage_path text,
  p_output_sha256 text,
  p_model text,
  p_provider_response_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer,
  p_estimated_cost_chf numeric,
  p_width integer,
  p_height integer,
  p_alt_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.commercial_demo_ai_requests%ROWTYPE;
  v_generation public.commercial_demo_ai_generations%ROWTYPE;
  v_response jsonb;
  v_session_id uuid;
  v_session_active boolean := false;
BEGIN
  SELECT request.session_id INTO v_session_id
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id;

  SELECT true INTO v_session_active
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_session_id
    AND session.status = 'active'
  FOR UPDATE;

  IF COALESCE(v_session_active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial demo AI session is no longer active' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_request
  FROM public.commercial_demo_ai_requests request
  WHERE request.request_id = p_request_id
  FOR UPDATE;

  IF v_request.status = 'completed' THEN
    RETURN v_request.response;
  END IF;
  IF v_request.id IS NULL OR v_request.status <> 'processing'
     OR v_request.lock_token <> p_lock_token OR v_request.action <> 'visual_generate' THEN
    RAISE EXCEPTION 'commercial demo AI request lock lost' USING ERRCODE = '55000';
  END IF;
  IF char_length(btrim(COALESCE(p_prompt, ''))) NOT BETWEEN 1 AND 6000
     OR p_format NOT IN ('landscape', 'square', 'portrait')
     OR char_length(COALESCE(p_style, '')) > 80
     OR jsonb_typeof(COALESCE(p_context, '{}'::jsonb)) <> 'object'
     OR pg_column_size(COALESCE(p_context, '{}'::jsonb)) > 32768
     OR COALESCE(p_storage_path, '') <> format(
       '%s/%s/%s.png',
       v_request.commercial_user_id,
       v_request.session_id,
       p_request_id
     )
     OR COALESCE(p_output_sha256, '') !~ '^[0-9a-f]{64}$'
     OR char_length(btrim(COALESCE(p_model, ''))) NOT BETWEEN 1 AND 120
     OR COALESCE(p_input_tokens, -1) < 0
     OR COALESCE(p_output_tokens, -1) < 0
     OR COALESCE(p_total_tokens, -1) < greatest(p_input_tokens, p_output_tokens)
     OR COALESCE(p_estimated_cost_chf, -1) < 0
     OR COALESCE(p_width, 0) <= 0 OR COALESCE(p_height, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid commercial demo AI visual completion' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commercial_demo_ai_generations (
    session_id,
    commercial_user_id,
    demo_restaurant_id,
    tool,
    prompt,
    format,
    output_mime_type,
    output_svg,
    model,
    credit_units,
    estimated_cost_chf,
    metadata,
    request_id,
    storage_bucket,
    storage_path,
    output_sha256,
    input_tokens,
    output_tokens,
    total_tokens
  ) VALUES (
    v_request.session_id,
    v_request.commercial_user_id,
    v_request.demo_restaurant_id,
    v_request.tool,
    btrim(p_prompt),
    p_format,
    'image/png',
    NULL,
    p_model,
    0,
    p_estimated_cost_chf,
    jsonb_build_object(
      'style', left(COALESCE(p_style, ''), 80),
      'width', p_width,
      'height', p_height,
      'engine', 'openai',
      'provider_response_id', p_provider_response_id,
      'input_tokens', p_input_tokens,
      'output_tokens', p_output_tokens,
      'total_tokens', p_total_tokens,
      'credit_units', 0,
      'unlimited_demo', true,
      'production_storage', false,
      'source_context', COALESCE(p_context, '{}'::jsonb)
    ),
    p_request_id,
    'commercial-demo-ai',
    p_storage_path,
    p_output_sha256,
    p_input_tokens,
    p_output_tokens,
    p_total_tokens
  ) RETURNING * INTO v_generation;

  v_response := jsonb_build_object(
    'request_id', p_request_id,
    'generation_id', v_generation.id,
    'tool', v_generation.tool,
    'prompt', v_generation.prompt,
    'format', v_generation.format,
    'style', left(COALESCE(p_style, ''), 80),
    'storage_bucket', v_generation.storage_bucket,
    'storage_path', v_generation.storage_path,
    'output_mime_type', v_generation.output_mime_type,
    'model', v_generation.model,
    'width', p_width,
    'height', p_height,
    'input_tokens', p_input_tokens,
    'output_tokens', p_output_tokens,
    'total_tokens', p_total_tokens,
    'credit_units', 0,
    'estimated_cost_chf', p_estimated_cost_chf,
    'alt_text', left(COALESCE(NULLIF(btrim(p_alt_text), ''), 'Visuel IA de démonstration'), 500),
    'replayed', false,
    'created_at', v_generation.created_at
  );

  UPDATE public.commercial_demo_ai_requests
  SET status = 'completed',
      response = v_response,
      model = p_model,
      provider_response_id = NULLIF(btrim(COALESCE(p_provider_response_id, '')), ''),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      estimated_cost_chf = p_estimated_cost_chf,
      completed_at = now(),
      updated_at = now()
  WHERE id = v_request.id;

  RETURN v_response;
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_fail_request(
  p_request_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_model text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failed_request public.commercial_demo_ai_requests%ROWTYPE;
BEGIN
  -- Serialize event insertion with the claim-side breaker count. Once the
  -- sixth committed event opens the circuit, no later claim can slip through.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-global-claim', 0)
  );

  UPDATE public.commercial_demo_ai_requests request
  SET status = 'failed',
      error_code = left(COALESCE(NULLIF(btrim(p_error_code), ''), 'internal_error'), 160),
      model = NULLIF(left(btrim(COALESCE(p_model, '')), 120), ''),
      completed_at = now(),
      updated_at = now()
  WHERE request.request_id = p_request_id
    AND request.lock_token = p_lock_token
    AND request.status = 'processing'
  RETURNING request.* INTO v_failed_request;

  IF v_failed_request.id IS NOT NULL
     AND v_failed_request.error_code ~ '^provider_' THEN
    INSERT INTO public.commercial_demo_ai_provider_failures (
      request_id,
      session_id,
      commercial_user_id,
      error_code
    ) VALUES (
      v_failed_request.request_id,
      v_failed_request.session_id,
      v_failed_request.commercial_user_id,
      v_failed_request.error_code
    );
  END IF;

  RETURN v_failed_request.id IS NOT NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_ai_prune_provider_failures()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  WITH expired AS (
    SELECT failure.id
    FROM public.commercial_demo_ai_provider_failures failure
    WHERE failure.occurred_at < now() - interval '1 day'
    ORDER BY failure.occurred_at, failure.id
    LIMIT 1000
  )
  DELETE FROM public.commercial_demo_ai_provider_failures failure
  USING expired
  WHERE failure.id = expired.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

-- Used only by the Edge auth fallback. The Vault value is never returned and
-- PostgREST execution is granted solely to service_role.
CREATE OR REPLACE FUNCTION public.verify_internal_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
BEGIN
  IF p_secret IS NULL OR char_length(p_secret) NOT BETWEEN 16 AND 512 THEN
    RETURN false;
  END IF;

  SELECT secret.decrypted_secret
  INTO v_expected
  FROM vault.decrypted_secrets secret
  WHERE secret.name = 'internal_cron_secret'
  ORDER BY secret.created_at DESC
  LIMIT 1;

  IF v_expected IS NULL THEN
    RETURN false;
  END IF;

  RETURN extensions.digest(pg_catalog.convert_to(p_secret, 'UTF8'), 'sha256')
    = extensions.digest(pg_catalog.convert_to(v_expected, 'UTF8'), 'sha256');
END
$$;

-- Archive/reset/delete is a hard lifecycle boundary for AI demo workspaces.
-- Database rows disappear immediately; private object paths survive only in a
-- service-role outbox until the Edge Function removes the payload via Storage.
CREATE OR REPLACE FUNCTION public._commercial_demo_ai_session_lifecycle_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status = 'active' AND NEW.status = 'archived') THEN
      RETURN NEW;
    END IF;
    v_reason := 'session_archived';
  ELSE
    v_reason := 'session_deleted';
  END IF;

  INSERT INTO public.commercial_demo_ai_storage_cleanup_queue (
    storage_bucket,
    storage_path,
    reason,
    commercial_user_id,
    session_id,
    request_id
  )
  SELECT
    generation.storage_bucket,
    generation.storage_path,
    v_reason,
    OLD.commercial_user_id,
    OLD.id,
    generation.request_id
  FROM public.commercial_demo_ai_generations generation
  WHERE generation.session_id = OLD.id
    AND generation.storage_bucket = 'commercial-demo-ai'
    AND generation.storage_path IS NOT NULL
  ON CONFLICT (storage_bucket, storage_path) DO UPDATE
  SET reason = EXCLUDED.reason,
      commercial_user_id = EXCLUDED.commercial_user_id,
      session_id = EXCLUDED.session_id,
      request_id = EXCLUDED.request_id;

  -- Order matters because a generation protects its idempotency request.
  DELETE FROM public.commercial_demo_ai_generations generation
  WHERE generation.session_id = OLD.id;

  DELETE FROM public.commercial_demo_ai_requests request
  WHERE request.session_id = OLD.id;

  -- Messages cascade from their isolated conversation only.
  DELETE FROM public.commercial_demo_ai_conversations conversation
  WHERE conversation.session_id = OLD.id;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS commercial_demo_ai_session_lifecycle_cleanup
  ON public.commercial_demo_order_sessions;
CREATE TRIGGER commercial_demo_ai_session_lifecycle_cleanup
BEFORE UPDATE OF status OR DELETE ON public.commercial_demo_order_sessions
FOR EACH ROW
EXECUTE FUNCTION public._commercial_demo_ai_session_lifecycle_cleanup();

-- Commercial calls remain unlimited. Retention bounds persisted demo artifacts,
-- messages and idempotency rows only; it never blocks or charges a request.
CREATE OR REPLACE FUNCTION public.commercial_demo_ai_apply_retention(
  p_actor_user_id uuid,
  p_commercial_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor_user_id IS NULL
     OR p_commercial_user_id IS NULL
     OR p_actor_user_id <> p_commercial_user_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.commercial_demo_accounts account
       WHERE account.user_id = p_commercial_user_id
         AND account.is_active
     ) THEN
    RAISE EXCEPTION 'commercial demo AI retention owner mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commercial-demo-ai-retention:' || p_commercial_user_id::text, 0)
  );

  -- Keep at most 100 real images per commercial account and no image older
  -- than 30 days. Archived-session images are purged immediately.
  WITH ranked AS (
    SELECT
      generation.id,
      generation.request_id,
      generation.storage_bucket,
      generation.storage_path,
      generation.session_id,
      generation.created_at,
      session.status AS session_status,
      row_number() OVER (
        ORDER BY generation.created_at DESC, generation.id DESC
      ) AS ordinal
    FROM public.commercial_demo_ai_generations generation
    JOIN public.commercial_demo_order_sessions session
      ON session.id = generation.session_id
    WHERE generation.commercial_user_id = p_commercial_user_id
      AND generation.storage_bucket = 'commercial-demo-ai'
      AND generation.storage_path IS NOT NULL
      AND generation.request_id IS NOT NULL
  ), candidates AS (
    SELECT *
    FROM ranked
    WHERE session_status = 'archived'
       OR created_at < now() - interval '30 days'
       OR ordinal > 100
    ORDER BY created_at, id
    LIMIT 25
  ), queued AS (
    INSERT INTO public.commercial_demo_ai_storage_cleanup_queue (
      storage_bucket,
      storage_path,
      reason,
      commercial_user_id,
      session_id,
      request_id
    )
    SELECT
      candidate.storage_bucket,
      candidate.storage_path,
      'retention',
      p_commercial_user_id,
      candidate.session_id,
      candidate.request_id
    FROM candidates candidate
    ON CONFLICT (storage_bucket, storage_path) DO UPDATE
    SET reason = 'retention',
        commercial_user_id = EXCLUDED.commercial_user_id,
        session_id = EXCLUDED.session_id,
        request_id = EXCLUDED.request_id
    RETURNING storage_bucket, storage_path
  ), deleted_generations AS (
    DELETE FROM public.commercial_demo_ai_generations generation
    USING candidates candidate
    WHERE generation.id = candidate.id
      AND EXISTS (
        SELECT 1
        FROM queued queued_path
        WHERE queued_path.storage_bucket = generation.storage_bucket
          AND queued_path.storage_path = generation.storage_path
      )
    RETURNING generation.request_id
  )
  DELETE FROM public.commercial_demo_ai_requests request
  USING deleted_generations deleted
  WHERE request.request_id = deleted.request_id;

  -- Fifty workspaces per commercial, with archived/30-day-old workspaces
  -- removed first. Their messages cascade locally.
  WITH ranked AS (
    SELECT
      conversation.id,
      conversation.status,
      conversation.updated_at,
      session.status AS session_status,
      row_number() OVER (
        ORDER BY conversation.updated_at DESC, conversation.id DESC
      ) AS ordinal
    FROM public.commercial_demo_ai_conversations conversation
    JOIN public.commercial_demo_order_sessions session
      ON session.id = conversation.session_id
    WHERE conversation.commercial_user_id = p_commercial_user_id
  ), candidates AS (
    SELECT id
    FROM ranked
    WHERE status = 'archived'
       OR session_status = 'archived'
       OR updated_at < now() - interval '30 days'
       OR ordinal > 50
    ORDER BY updated_at, id
    LIMIT 25
  )
  DELETE FROM public.commercial_demo_ai_conversations conversation
  USING candidates candidate
  WHERE conversation.id = candidate.id;

  -- Bound a single long-running conversation to its latest 200 messages.
  WITH ranked AS (
    SELECT
      message.id,
      message.created_at,
      row_number() OVER (
        PARTITION BY message.conversation_id
        ORDER BY message.created_at DESC, message.role, message.id DESC
      ) AS ordinal
    FROM public.commercial_demo_ai_messages message
    JOIN public.commercial_demo_ai_conversations conversation
      ON conversation.id = message.conversation_id
    WHERE conversation.commercial_user_id = p_commercial_user_id
  ), candidates AS (
    SELECT id
    FROM ranked
    WHERE created_at < now() - interval '30 days'
       OR ordinal > 200
    ORDER BY created_at, id
    LIMIT 200
  )
  DELETE FROM public.commercial_demo_ai_messages message
  USING candidates candidate
  WHERE message.id = candidate.id;

  -- Idempotency rows are operational, not business history. Keep at most 1000
  -- non-processing rows for 30 days; live generation FKs remain protected.
  WITH ranked AS (
    SELECT
      request.id,
      request.request_id,
      request.completed_at,
      session.status AS session_status,
      row_number() OVER (
        ORDER BY request.created_at DESC, request.id DESC
      ) AS ordinal
    FROM public.commercial_demo_ai_requests request
    JOIN public.commercial_demo_order_sessions session
      ON session.id = request.session_id
    WHERE request.commercial_user_id = p_commercial_user_id
      AND request.status <> 'processing'
  ), candidates AS (
    SELECT ranked.id
    FROM ranked
    WHERE (
      session_status = 'archived'
      OR completed_at < now() - interval '30 days'
      OR ordinal > 1000
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.commercial_demo_ai_generations generation
      WHERE generation.request_id = ranked.request_id
    )
    ORDER BY completed_at NULLS FIRST, id
    LIMIT 100
  )
  DELETE FROM public.commercial_demo_ai_requests request
  USING candidates candidate
  WHERE request.id = candidate.id;

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_ai_claim_request(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_complete_chat_request(
  uuid, uuid, text, jsonb, uuid, text, text, text, text, integer, integer, integer, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_complete_visual_request(
  uuid, uuid, text, text, text, jsonb, text, text, text, text,
  integer, integer, integer, numeric, integer, integer, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_fail_request(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_apply_retention(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_ai_prune_provider_failures()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.verify_internal_cron_secret(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._commercial_demo_ai_session_lifecycle_cleanup()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_claim_request(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_complete_chat_request(
  uuid, uuid, text, jsonb, uuid, text, text, text, text, integer, integer, integer, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_complete_visual_request(
  uuid, uuid, text, text, text, jsonb, text, text, text, text,
  integer, integer, integer, numeric, integer, integer, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_fail_request(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_apply_retention(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_ai_prune_provider_failures()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_internal_cron_secret(text)
  TO service_role;

-- Drain the Storage outbox independently from user traffic. The secret never
-- enters source control; it is read from the project's existing Vault entry.
DO $scheduler$
DECLARE
  v_cron_secret text;
BEGIN
  SELECT secret.decrypted_secret
  INTO v_cron_secret
  FROM vault.decrypted_secrets secret
  WHERE secret.name = 'internal_cron_secret'
  ORDER BY secret.created_at DESC
  LIMIT 1;

  IF NULLIF(v_cron_secret, '') IS NULL THEN
    RAISE NOTICE 'commercial-demo-ai cleanup cron not scheduled: Vault secret internal_cron_secret is absent';
    RETURN;
  END IF;

  PERFORM cron.unschedule(job.jobid)
  FROM cron.job job
  WHERE job.jobname = 'commercial-demo-ai-storage-cleanup';

  PERFORM cron.schedule(
    'commercial-demo-ai-storage-cleanup',
    '*/5 * * * *',
    format(
      $command$
        SELECT net.http_post(
          url := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/commercial-demo-ai',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-cron-secret', %L
          ),
          body := '{"action":"maintenance_cleanup"}'::jsonb,
          timeout_milliseconds := 60000
        );
      $command$,
      v_cron_secret
    )
  );
END
$scheduler$;

-- Disable the deterministic zero-cost writers. Read/archive RPCs stay in place
-- for historical rows; new UI writes must pass through the authenticated Edge
-- Function and therefore through OPENAI_API_KEY.
REVOKE EXECUTE ON FUNCTION public.commercial_demo_ai_respond(uuid, text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commercial_demo_ai_generate_visual(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commercial_demo_ai_generation_history(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.commercial_demo_ai_requests IS
  'Idempotency, concurrency and provider circuit state for real OpenAI calls made only from isolated commercial demo sessions.';
COMMENT ON TABLE public.commercial_demo_ai_storage_cleanup_queue IS
  'Internal outbox drained in bounded batches through the Storage API after archive, delete or 30-day retention.';
COMMENT ON COLUMN public.commercial_demo_ai_requests.credit_units IS
  'Always zero: commercial demonstrations have no TOK business quota or credit debit.';
COMMENT ON COLUMN public.commercial_demo_ai_requests.estimated_cost_chf IS
  'Operational estimate derived from the actual provider model and returned token usage; never debited from restaurant credits.';

NOTIFY pgrst, 'reload schema';

COMMIT;
