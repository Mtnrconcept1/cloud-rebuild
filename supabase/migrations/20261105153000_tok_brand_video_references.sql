-- Additive contract: ordered references and identity are reserved atomically with credits.
-- Keep the original RPC for older app clients and in-flight video jobs.
ALTER TABLE public.restaurant_video_generations
  ADD COLUMN IF NOT EXISTS request_options jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.reserve_restaurant_brand_video_generation(
  p_restaurant_id uuid, p_user_id uuid, p_idempotency_key uuid,
  p_prompt text, p_generate_audio boolean, p_credit_units integer, p_request_options jsonb
)
RETURNS public.restaurant_video_generations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_job public.restaurant_video_generations;
  v_ids uuid[];
  v_logo uuid;
  v_all_ids uuid[];
  v_model constant text := 'bytedance/seedance-2.5/reference-to-video';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_options IS NULL OR jsonb_typeof(p_request_options) <> 'object'
    OR p_request_options->>'version' IS DISTINCT FROM '1'
    OR p_request_options->>'allowInterpretation' IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_request_options->'referenceMediaIds') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_request_options->'referenceMediaIds') NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'video_references_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_ids
    FROM jsonb_array_elements_text(p_request_options->'referenceMediaIds') WITH ORDINALITY AS refs(value, ordinality);
  v_logo := NULLIF(p_request_options->>'logoMediaId', '')::uuid;
  v_all_ids := CASE WHEN v_logo IS NULL THEN v_ids ELSE array_append(v_ids, v_logo) END;
  IF cardinality(v_all_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_all_ids) id) THEN
    RAISE EXCEPTION 'video_references_invalid' USING ERRCODE = '22023';
  END IF;
  -- A reference never grants access to a different restaurant's image or private bucket.
  IF (SELECT count(*) FROM public.restaurant_media m
      WHERE m.id = ANY(v_all_ids) AND m.restaurant_id = p_restaurant_id
        AND m.storage_bucket = 'restaurant-images'
        AND m.storage_path LIKE p_restaurant_id::text || '/%'
        AND m.storage_path !~ '\.\.' AND m.storage_path ~* '\.(jpe?g|png|webp)$'
        AND COALESCE(m.media_type,'') !~* '(video|pdf)') <> cardinality(v_all_ids)
  THEN RAISE EXCEPTION 'video_reference_not_found' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || p_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations
    WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND AND (v_job.request_options IS DISTINCT FROM p_request_options OR v_job.provider_model <> v_model) THEN
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505';
  END IF;

  -- Existing quota, credit guard, ownership of request and idempotency checks stay in force.
  SELECT * INTO v_job FROM public.reserve_restaurant_video_generation(
    p_restaurant_id, p_user_id, p_idempotency_key, p_prompt, 10, '720p', '9:16',
    p_generate_audio, v_ids[1], p_credit_units
  );
  UPDATE public.restaurant_video_generations
    SET request_options = p_request_options, provider_model = v_model
    WHERE id = v_job.id RETURNING * INTO v_job;
  UPDATE public.ai_usage_logs SET model = v_model,
    metadata = metadata || jsonb_build_object('reference_count', cardinality(v_ids), 'request_contract', 'brand-v1')
    WHERE id = v_job.usage_log_id;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)
  TO service_role;
