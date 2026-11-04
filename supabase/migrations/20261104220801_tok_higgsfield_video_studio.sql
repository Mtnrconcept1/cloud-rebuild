-- Higgsfield Seedance marketing video jobs. All writes occur in server-side RPCs.
CREATE TABLE IF NOT EXISTS public.restaurant_video_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1800),
  duration integer NOT NULL CHECK (duration BETWEEN 4 AND 30),
  resolution text NOT NULL CHECK (resolution IN ('480p', '720p')),
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('16:9','9:16','1:1','4:3','3:4')),
  generate_audio boolean NOT NULL DEFAULT true,
  reference_media_id uuid NULL REFERENCES public.restaurant_media(id) ON DELETE SET NULL,
  provider_model text NOT NULL DEFAULT 'bytedance/seedance-2.5/text-to-video',
  provider_request_id text,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','submitting','queued','in_progress','archiving','completed','failed','needs_review')),
  credit_units integer NOT NULL CHECK (credit_units >= 0),
  usage_log_id uuid REFERENCES public.ai_usage_logs(id),
  storage_path text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS restaurant_video_generations_restaurant_created_idx
  ON public.restaurant_video_generations (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_video_generations_provider_idx
  ON public.restaurant_video_generations (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

ALTER TABLE public.restaurant_video_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_video_generations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.restaurant_video_generations TO authenticated;
DROP POLICY IF EXISTS video_jobs_select_owner ON public.restaurant_video_generations;
CREATE POLICY video_jobs_select_owner ON public.restaurant_video_generations
  FOR SELECT TO authenticated
  USING (
    public.auth_owns_restaurant(restaurant_id)
    AND public.tok_connect_oauth_request_allowed()
    AND public.launch_table_allowed('ai_generated_assets')
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('restaurant-ai-videos', 'restaurant-ai-videos', false, 104857600, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 104857600,
  allowed_mime_types = ARRAY['video/mp4'];

-- Atomic idempotency, usage reservation and per-restaurant rate limits.
CREATE OR REPLACE FUNCTION public.reserve_restaurant_video_generation(
  p_restaurant_id uuid, p_user_id uuid, p_idempotency_key uuid,
  p_prompt text, p_duration integer, p_resolution text, p_aspect_ratio text,
  p_generate_audio boolean, p_reference_media_id uuid, p_credit_units integer
)
RETURNS public.restaurant_video_generations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.restaurant_video_generations;
  v_usage_id uuid;
  v_model text := CASE WHEN p_reference_media_id IS NULL
    THEN 'bytedance/seedance-2.5/text-to-video'
    ELSE 'bytedance/seedance-2.5/image-to-video' END;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_prompt IS NULL OR char_length(p_prompt) NOT BETWEEN 1 AND 1800
     OR p_duration NOT BETWEEN 4 AND 30
     OR p_resolution NOT IN ('480p','720p')
     OR p_aspect_ratio NOT IN ('16:9','9:16','1:1','4:3','3:4')
     OR p_credit_units NOT BETWEEN 1 AND 2000
  THEN
    RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || p_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations
    WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_job.user_id <> p_user_id OR v_job.prompt <> p_prompt
       OR v_job.duration <> p_duration OR v_job.resolution <> p_resolution
       OR v_job.aspect_ratio <> p_aspect_ratio
       OR v_job.generate_audio <> p_generate_audio
       OR v_job.reference_media_id IS DISTINCT FROM p_reference_media_id
       OR v_job.credit_units <> p_credit_units
    THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_job;
  END IF;
  IF (SELECT count(*) FROM public.restaurant_video_generations
      WHERE restaurant_id = p_restaurant_id AND created_at > now() - interval '24 hours') >= 3
  THEN
    RAISE EXCEPTION 'video_daily_limit' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.restaurant_video_generations
     WHERE restaurant_id = p_restaurant_id
       AND status IN ('reserved','submitting','queued','in_progress','archiving','needs_review')) THEN
    RAISE EXCEPTION 'video_generation_already_active' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.restaurant_video_generations (
    restaurant_id, user_id, idempotency_key, prompt, duration, resolution,
    aspect_ratio, generate_audio, reference_media_id, provider_model, credit_units
  ) VALUES (
    p_restaurant_id, p_user_id, p_idempotency_key, p_prompt, p_duration, p_resolution,
    p_aspect_ratio, p_generate_audio, p_reference_media_id, v_model, p_credit_units
  ) RETURNING * INTO v_job;

  -- The existing credit guard locks the restaurant and rejects insufficient balance.
  -- Reservations are charged once and reversed only on confirmed provider failure.
  INSERT INTO public.ai_usage_logs (
    function_name, action, model, user_id, restaurant_id, status,
    generated_asset_id, metadata
  ) VALUES (
    'ai-video-studio', 'generate_video', v_model, p_user_id, p_restaurant_id, 'success',
    NULL,
    jsonb_build_object('credit_kind','ai_tools','credit_units',p_credit_units,
      'video_job_id',v_job.id,'billing_state','reserved','provider','higgsfield')
  ) RETURNING id INTO v_usage_id;
  UPDATE public.restaurant_video_generations SET usage_log_id = v_usage_id
    WHERE id = v_job.id RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_restaurant_video_generation(uuid,uuid,uuid,text,integer,text,text,boolean,uuid,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_restaurant_video_generation(uuid,uuid,uuid,text,integer,text,text,boolean,uuid,integer)
  TO service_role;

-- Only one concurrent caller may submit the paid provider request.
CREATE OR REPLACE FUNCTION public.claim_restaurant_video_submission(p_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.restaurant_video_generations SET status = 'submitting', updated_at = now()
    WHERE id = p_job_id AND status = 'reserved';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_restaurant_video_submission(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_video_submission(uuid) TO service_role;

-- Guard refunds from delayed/out-of-order status requests.
CREATE OR REPLACE FUNCTION public.finish_restaurant_video_generation(
  p_job_id uuid, p_provider_request_id text, p_status text,
  p_storage_path text DEFAULT NULL, p_error_code text DEFAULT NULL
)
RETURNS public.restaurant_video_generations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.restaurant_video_generations;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM public.restaurant_video_generations
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'video_job_not_found' USING ERRCODE = '02000'; END IF;
  IF v_job.status IN ('completed','failed') THEN RETURN v_job; END IF;
  IF p_status NOT IN ('queued','in_progress','archiving','completed','failed','needs_review') THEN
    RAISE EXCEPTION 'video_status_invalid' USING ERRCODE = '22023';
  END IF;
  IF v_job.provider_request_id IS NOT NULL
    AND (p_provider_request_id IS NULL OR v_job.provider_request_id <> p_provider_request_id)
  THEN RAISE EXCEPTION 'stale_video_provider_response' USING ERRCODE = 'P0001'; END IF;
  IF p_status = 'failed' AND v_job.provider_request_id IS NOT NULL
     AND p_provider_request_id IS NULL THEN
    RAISE EXCEPTION 'cannot_refund_unverified_submission' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'completed' AND (p_storage_path IS NULL OR p_storage_path = '') THEN
    RAISE EXCEPTION 'video_asset_required' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'failed' AND v_job.usage_log_id IS NOT NULL THEN
    UPDATE public.ai_usage_logs
      SET status = 'failure', metadata = metadata || '{"billing_state":"refunded"}'::jsonb
      WHERE id = v_job.usage_log_id AND status = 'success';
  ELSIF p_status = 'completed' AND v_job.usage_log_id IS NOT NULL THEN
    UPDATE public.ai_usage_logs
      SET metadata = metadata || '{"billing_state":"charged"}'::jsonb
      WHERE id = v_job.usage_log_id AND status = 'success';
  END IF;
  UPDATE public.restaurant_video_generations
    SET status = p_status,
      provider_request_id = COALESCE(provider_request_id, NULLIF(p_provider_request_id,'')),
      storage_path = CASE WHEN p_status = 'completed' THEN p_storage_path ELSE storage_path END,
      error_code = CASE WHEN p_status IN ('failed','needs_review') THEN left(p_error_code,80) ELSE NULL END,
      updated_at = now()
    WHERE id = p_job_id RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_restaurant_video_generation(uuid,text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_restaurant_video_generation(uuid,text,text,text,text)
  TO service_role;
