BEGIN;

-- Expand the supported output contract. Existing jobs, prices and v1 callers
-- retain their recorded values; no historical job is repriced or regenerated.
ALTER TABLE public.restaurant_video_generations
  DROP CONSTRAINT IF EXISTS restaurant_video_generations_resolution_check,
  ADD CONSTRAINT restaurant_video_generations_resolution_check
    CHECK (resolution IN ('480p','720p','1080p')),
  DROP CONSTRAINT IF EXISTS restaurant_video_generations_aspect_ratio_check,
  ADD CONSTRAINT restaurant_video_generations_aspect_ratio_check
    CHECK (aspect_ratio IN ('16:9','4:3','1:1','3:4','9:16','21:9'));

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4','video/quicktime']
WHERE id = 'restaurant-ai-videos';

-- Keep the public signature, locking, daily quota and native credit trigger.
-- 4043 credits is the largest supported v2 estimate (30 s, 1080p, 21:9).
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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_user_id IS NULL OR p_idempotency_key IS NULL
     OR p_prompt IS NULL OR char_length(p_prompt) NOT BETWEEN 1 AND 1800
     OR p_duration IS NULL OR p_duration NOT BETWEEN 4 AND 30
     OR p_resolution IS NULL OR p_resolution NOT IN ('480p','720p','1080p')
     OR p_aspect_ratio IS NULL OR p_aspect_ratio NOT IN ('16:9','4:3','1:1','3:4','9:16','21:9')
     OR p_generate_audio IS NULL OR p_credit_units IS NULL OR p_credit_units NOT BETWEEN 1 AND 4043
  THEN RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || p_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations
    WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_job.user_id IS DISTINCT FROM p_user_id OR v_job.prompt IS DISTINCT FROM p_prompt
       OR v_job.duration IS DISTINCT FROM p_duration OR v_job.resolution IS DISTINCT FROM p_resolution
       OR v_job.aspect_ratio IS DISTINCT FROM p_aspect_ratio
       OR v_job.generate_audio IS DISTINCT FROM p_generate_audio
       OR v_job.reference_media_id IS DISTINCT FROM p_reference_media_id
       OR v_job.credit_units IS DISTINCT FROM p_credit_units
    THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505'; END IF;
    RETURN v_job;
  END IF;
  IF (SELECT count(*) FROM public.restaurant_video_generations
      WHERE restaurant_id = p_restaurant_id AND created_at > now() - interval '24 hours'
        AND status <> 'failed') >= 3
  THEN RAISE EXCEPTION 'video_daily_limit' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.restaurant_video_generations
     WHERE restaurant_id = p_restaurant_id
       AND status IN ('reserved','submitting','queued','in_progress','archiving','needs_review'))
  THEN RAISE EXCEPTION 'video_generation_already_active' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.restaurant_video_generations (
    restaurant_id,user_id,idempotency_key,prompt,duration,resolution,aspect_ratio,
    generate_audio,reference_media_id,provider_model,credit_units
  ) VALUES (
    p_restaurant_id,p_user_id,p_idempotency_key,p_prompt,p_duration,p_resolution,p_aspect_ratio,
    p_generate_audio,p_reference_media_id,v_model,p_credit_units
  ) RETURNING * INTO v_job;
  INSERT INTO public.ai_usage_logs (
    function_name,action,model,user_id,restaurant_id,status,generated_asset_id,metadata
  ) VALUES (
    'ai-video-studio','generate_video',v_model,p_user_id,p_restaurant_id,'success',NULL,
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

-- Same RPC signature for v1 and v2, with a complete immutable options snapshot.
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
  v_version text;
  v_marketing jsonb;
  v_duration integer := 10;
  v_resolution text := '720p';
  v_ratio text := '9:16';
  v_key text;
  v_limit integer;
  v_role_id uuid;
  v_short numeric;
  v_long numeric;
  v_horizontal numeric;
  v_vertical numeric;
  v_tokens numeric;
  v_expected_credits integer;
  v_model constant text := 'bytedance/seedance-2.5/reference-to-video';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_request_options IS NULL OR jsonb_typeof(p_request_options) <> 'object'
    OR p_request_options->>'version' IS NULL OR p_request_options->>'version' NOT IN ('1','2')
    OR p_request_options->>'allowInterpretation' IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_request_options->'referenceMediaIds') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023'; END IF;
  v_version := p_request_options->>'version';
  IF jsonb_array_length(p_request_options->'referenceMediaIds') NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'video_references_invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_request_options->'referenceMediaIds') AS ref(value)
      WHERE jsonb_typeof(value) <> 'string' OR (value #>> '{}') !~*
        '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  THEN RAISE EXCEPTION 'video_references_invalid' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_ids
    FROM jsonb_array_elements_text(p_request_options->'referenceMediaIds') WITH ORDINALITY AS refs(value,ordinality);
  v_logo := NULLIF(p_request_options->>'logoMediaId','')::uuid;
  v_all_ids := CASE WHEN v_logo IS NULL THEN v_ids ELSE array_append(v_ids,v_logo) END;
  IF cardinality(v_all_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_all_ids) id) THEN
    RAISE EXCEPTION 'video_references_invalid' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.restaurant_media m
      WHERE m.id = ANY(v_all_ids) AND m.restaurant_id = p_restaurant_id
        AND m.storage_bucket = 'restaurant-images'
        AND m.storage_path LIKE p_restaurant_id::text || '/%'
        AND m.storage_path !~ '\.\.' AND position(chr(92) in m.storage_path) = 0
        AND m.storage_path ~* '\.(jpe?g|png|webp)$'
        AND COALESCE(m.media_type,'') !~* '(video|pdf)') <> cardinality(v_all_ids)
  THEN RAISE EXCEPTION 'video_reference_not_found' USING ERRCODE = '42501'; END IF;

  IF v_version = '2' THEN
    IF jsonb_typeof(p_request_options->'version') IS DISTINCT FROM 'number'
      OR p_request_options->'allowInterpretation' IS DISTINCT FROM 'true'::jsonb
      OR jsonb_typeof(p_request_options->'duration') IS DISTINCT FROM 'number'
      OR COALESCE(p_request_options->>'duration','') !~ '^[0-9]{1,2}$'
      OR p_request_options->>'resolution' IS NULL OR p_request_options->>'resolution' NOT IN ('480p','720p','1080p')
      OR p_request_options->>'aspectRatio' IS NULL OR p_request_options->>'aspectRatio' NOT IN ('16:9','4:3','1:1','3:4','9:16','21:9')
      OR p_request_options->>'outputFormat' IS NULL OR p_request_options->>'outputFormat' NOT IN ('mp4','mov')
      OR p_request_options->>'bitrateMode' IS NULL OR p_request_options->>'bitrateMode' NOT IN ('standard','high')
      OR jsonb_typeof(p_request_options->'marketing') IS DISTINCT FROM 'object'
      OR p_prompt IS NULL OR char_length(p_prompt) NOT BETWEEN 12 AND 1000
      OR p_request_options - ARRAY['version','referenceMediaIds','logoMediaId','allowInterpretation','duration',
        'resolution','aspectRatio','outputFormat','bitrateMode','marketing'] <> '{}'::jsonb
    THEN RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023'; END IF;
    v_duration := (p_request_options->>'duration')::integer;
    IF v_duration NOT BETWEEN 4 AND 30 THEN RAISE EXCEPTION 'video_duration_invalid' USING ERRCODE = '22023'; END IF;
    v_resolution := p_request_options->>'resolution';
    v_ratio := p_request_options->>'aspectRatio';
    v_marketing := p_request_options->'marketing';
    IF NOT (v_marketing ?& ARRAY['creativeFormat','productDescription','hook','setting','avatarMediaId','productMediaId',
        'startImageMediaId','endImageMediaId','audioMode','language','voiceoverText','callToAction'])
      OR v_marketing - ARRAY['creativeFormat','productDescription','hook','setting','avatarMediaId','productMediaId',
        'startImageMediaId','endImageMediaId','audioMode','language','voiceoverText','callToAction'] <> '{}'::jsonb
      OR v_marketing->>'creativeFormat' IS NULL OR v_marketing->>'creativeFormat' NOT IN (
        'custom','product_showcase','ugc','hypermotion_oj','tv_spot','camera_pov','ugc_how_to','ugc_unboxing',
        'ugc_unboxing_asmr','ugc_before_and_after','classic_meets_modern','ugc_direct_to_camera','ugc_selfie_testimonial',
        'ugc_gadget_saved_me','ugc_giant_figure','ugc_unboxing_virtual_try_on','ugc_virtual_try_on_sneakers',
        'couple_sharing_home','ugc_secret_hack_reveal','crush_test','mess_to_fresh','mystery_box','reboxing',
        'ugc_addiction','ugc_virtual_try_on','virtual_try_on','wild_card')
      OR v_marketing->>'audioMode' IS NULL OR v_marketing->>'audioMode' NOT IN ('silent','ambient','voiceover')
      OR v_marketing->>'language' IS NULL OR v_marketing->>'language' NOT IN ('fr','en','de','it')
    THEN RAISE EXCEPTION 'video_marketing_settings_invalid' USING ERRCODE = '22023'; END IF;
    FOR v_key,v_limit IN VALUES ('productDescription',5000),('hook',500),('setting',500),('voiceoverText',1000),('callToAction',160)
    LOOP
      IF jsonb_typeof(v_marketing->v_key) IS DISTINCT FROM 'string' OR char_length(v_marketing->>v_key) > v_limit THEN
        RAISE EXCEPTION 'video_marketing_settings_invalid' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    FOREACH v_key IN ARRAY ARRAY['avatarMediaId','productMediaId','startImageMediaId','endImageMediaId']
    LOOP
      IF v_marketing->v_key <> 'null'::jsonb THEN
        IF jsonb_typeof(v_marketing->v_key) IS DISTINCT FROM 'string' OR (v_marketing->>v_key) !~*
          '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
        THEN RAISE EXCEPTION 'video_marketing_reference_invalid' USING ERRCODE = '22023'; END IF;
        v_role_id := (v_marketing->>v_key)::uuid;
        IF NOT (v_role_id = ANY(v_ids)) THEN
          RAISE EXCEPTION 'video_marketing_reference_invalid' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
    IF p_generate_audio IS DISTINCT FROM (v_marketing->>'audioMode' <> 'silent') THEN
      RAISE EXCEPTION 'video_audio_mode_mismatch' USING ERRCODE = '22023';
    END IF;
    IF v_marketing->>'audioMode' = 'voiceover' AND NULLIF(btrim(v_marketing->>'voiceoverText'),'') IS NULL THEN
      RAISE EXCEPTION 'video_voiceover_required' USING ERRCODE = '22023';
    END IF;

    -- Same published token estimate as the Edge function, using numeric math.
    -- Image/logo references add no input-video duration. Output encoding and
    -- audio have no separate surcharge in the verified public pricing formula.
    v_short := replace(v_resolution,'p','')::numeric;
    v_horizontal := split_part(v_ratio,':',1)::numeric;
    v_vertical := split_part(v_ratio,':',2)::numeric;
    v_long := ceil(v_short * greatest(v_horizontal,v_vertical) / least(v_horizontal,v_vertical) / 16) * 16;
    v_tokens := ceil(v_short * v_long * v_duration * 24 / 1024);
    v_expected_credits := ceil(v_tokens / 1000 * CASE WHEN v_resolution = '1080p' THEN 0.0234 ELSE 0.0214 END * 0.81 / 0.009);
    IF p_credit_units IS DISTINCT FROM v_expected_credits OR v_expected_credits NOT BETWEEN 1 AND 4043 THEN
      RAISE EXCEPTION 'video_quote_changed' USING ERRCODE = '22023';
    END IF;
  ELSIF p_credit_units IS NULL OR p_credit_units NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'invalid_video_request' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tok_video:' || p_restaurant_id::text)::bigint);
  SELECT * INTO v_job FROM public.restaurant_video_generations
    WHERE restaurant_id = p_restaurant_id AND idempotency_key = p_idempotency_key;
  IF FOUND AND (v_job.request_options IS DISTINCT FROM p_request_options OR v_job.provider_model IS DISTINCT FROM v_model) THEN
    RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_job FROM public.reserve_restaurant_video_generation(
    p_restaurant_id,p_user_id,p_idempotency_key,p_prompt,v_duration,v_resolution,v_ratio,
    p_generate_audio,v_ids[1],p_credit_units
  );
  UPDATE public.restaurant_video_generations
    SET request_options = p_request_options, provider_model = v_model
    WHERE id = v_job.id RETURNING * INTO v_job;
  UPDATE public.ai_usage_logs SET model = v_model,
    metadata = metadata || jsonb_build_object('reference_count',cardinality(v_ids),
      'request_contract',CASE WHEN v_version = '2' THEN 'marketing-v2' ELSE 'brand-v1' END)
    WHERE id = v_job.usage_log_id;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)
  TO service_role;

COMMIT;
