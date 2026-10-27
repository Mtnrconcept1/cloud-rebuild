BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Storage paths are chosen by the BFF. This operation only attaches an image
-- to a still-editable social draft, under the same campaign-first lock order
-- used by the targeted mailing importer.
CREATE OR REPLACE FUNCTION public.admin_attach_marketing_social_image(
  p_item_id uuid,
  p_expected_updated_at timestamptz,
  p_visual_url text,
  p_width integer,
  p_height integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.marketing_calendar_items%ROWTYPE;
  v_campaign_id uuid;
  v_campaign_name text;
  v_approved_at timestamptz;
  v_campaign_status text;
  v_actor uuid;
  v_format text;
BEGIN
  PERFORM public.marketing_require_admin();
  v_actor := public.marketing_actor_user_id();
  IF p_item_id IS NULL OR p_expected_updated_at IS NULL
     OR p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 1 AND 8192 OR p_height NOT BETWEEN 1 AND 8192
     OR p_width::bigint * p_height::bigint > 16777216
     OR p_visual_url IS NULL OR length(p_visual_url) > 2048
     OR p_visual_url !~ ('^https://[A-Za-z0-9.-]+/storage/v1/object/public/social-post-media/marketing-social/'
       || v_actor::text || '/' || p_item_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$') THEN
    RAISE EXCEPTION 'Invalid social image attachment' USING ERRCODE = '22023';
  END IF;
  -- Prevent an incorrect visual_format from reaching a provider. A square
  -- photo is the common case; portrait and landscape ratios are exact here.
  v_format := CASE
    WHEN p_width = p_height THEN '1:1'
    WHEN p_width::numeric / p_height BETWEEN 0.79 AND 0.81 THEN '4:5'
    WHEN p_width::numeric / p_height BETWEEN 1.77 AND 1.79 THEN '16:9'
    ELSE NULL END;

  SELECT campaign_id INTO v_campaign_id FROM public.marketing_calendar_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Social item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_campaign_id IS NOT NULL THEN
    SELECT approved_at, status, name INTO v_approved_at, v_campaign_status, v_campaign_name
    FROM public.marketing_campaigns WHERE id = v_campaign_id FOR SHARE;
    IF NOT FOUND OR v_approved_at IS NOT NULL OR v_campaign_status IN ('completed','cancelled','failed') THEN
      RAISE EXCEPTION 'Social campaign cannot be edited' USING ERRCODE = '40001';
    END IF;
  END IF;
  SELECT * INTO v_item FROM public.marketing_calendar_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Social item not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.updated_at IS DISTINCT FROM p_expected_updated_at OR v_item.campaign_id IS DISTINCT FROM v_campaign_id
     OR v_item.approval_status = 'approved' OR v_item.status NOT IN ('draft','blocked_configuration','failed') THEN
    RAISE EXCEPTION 'Social item changed since review' USING ERRCODE = '40001';
  END IF;
  IF v_item.channel NOT IN ('instagram','facebook') THEN
    RAISE EXCEPTION 'A social post is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.marketing_calendar_items SET content =
    (content - 'visual_brand_profile' - 'visual_reference_ids' - 'visual_prompt') || jsonb_build_object(
      'image_mode','manual','visual_source','upload','visual_status','ready','visual_required',true,
      'visual_url',p_visual_url,'visual_width',p_width,'visual_height',p_height,
      'format',v_format,'visual_format',v_format
    )
  WHERE id = p_item_id RETURNING * INTO v_item;
  RETURN to_jsonb(v_item) || jsonb_build_object('campaign_name',COALESCE(v_campaign_name,'Campagne'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_attach_marketing_social_image(uuid,timestamptz,text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;

DO $social_image_dispatch$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_execute_marketing_admin_operation(text,text,text,jsonb)');
  v_definition text;
  v_anchor constant text := '    WHEN ''admin_upsert_marketing_calendar_item'' THEN';
  v_branch constant text := $branch$    WHEN 'admin_attach_marketing_social_image' THEN
      IF p_csrf_hash IS NULL THEN
        RAISE EXCEPTION 'Marketing CSRF proof required' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_args) arg(k)
        WHERE arg.k NOT IN ('p_item_id','p_expected_updated_at','p_visual_url','p_width','p_height')) THEN
        RAISE EXCEPTION 'Social image contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_attach_marketing_social_image(
        NULLIF(v_args ->> 'p_item_id','')::uuid,
        NULLIF(v_args ->> 'p_expected_updated_at','')::timestamptz,
        v_args ->> 'p_visual_url',
        (v_args ->> 'p_width')::integer,
        (v_args ->> 'p_height')::integer
      );
$branch$;
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Required marketing BFF dispatcher is missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition,v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition,'WHEN ''admin_attach_marketing_social_image''') > 0
     OR (length(v_definition)-length(replace(v_definition,v_anchor,''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing BFF dispatcher; reconcile migration history';
  ELSE EXECUTE replace(v_definition,v_anchor,v_branch || v_anchor);
  END IF;
END;
$social_image_dispatch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
