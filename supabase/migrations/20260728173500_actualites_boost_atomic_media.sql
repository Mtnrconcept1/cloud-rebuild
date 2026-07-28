-- Make sponsored Actualites activation atomic and ensure every paid boost has
-- a verified image and a usable CTA before campaign credits are reserved.

CREATE OR REPLACE FUNCTION public.prepare_actualites_media_for_indexing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_post public.social_posts%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_asset public.ai_generated_assets%ROWTYPE;
  v_campaign public.ad_campaigns%ROWTYPE;
  v_body text;
  v_fallback text;
  v_basename text;
  v_path_changed boolean;
  v_trusted_daily_dish boolean;
  v_trusted_campaign_image boolean;
  v_asset_id_text text;
  v_campaign_id_text text;
  v_storage_bucket text;
  v_asset_path text;
  v_asset_url text;
BEGIN
  SELECT *
  INTO v_post
  FROM public.social_posts
  WHERE id = NEW.post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_post_not_found';
  END IF;

  SELECT *
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = v_post.restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_post_restaurant_not_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_path_changed := true;
  ELSE
    v_path_changed := NEW.post_id IS DISTINCT FROM OLD.post_id
      OR NEW.media_path IS DISTINCT FROM OLD.media_path
      OR NEW.media_type IS DISTINCT FROM OLD.media_type
      OR NEW.media_url IS DISTINCT FROM OLD.media_url
      OR NEW.metadata IS DISTINCT FROM OLD.metadata;
  END IF;

  IF v_path_changed AND NEW.media_type IN ('image', 'video') THEN
    IF nullif(btrim(NEW.media_path), '') IS NULL THEN
      RAISE EXCEPTION 'social_media_storage_path_required';
    END IF;

    v_trusted_daily_dish := NEW.media_type = 'image'
      AND coalesce(NEW.metadata ->> 'source', '') = 'daily_dish_ai';
    v_trusted_campaign_image := NEW.media_type = 'image'
      AND coalesce(NEW.metadata ->> 'source', '') = 'campaign_image';

    IF v_trusted_daily_dish THEN
      v_asset_id_text := nullif(btrim(NEW.metadata ->> 'asset_id'), '');
      IF v_asset_id_text IS NULL
        OR v_asset_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'daily_dish_media_asset_invalid';
      END IF;

      SELECT *
      INTO v_asset
      FROM public.ai_generated_assets asset
      WHERE asset.id = v_asset_id_text::uuid
        AND asset.restaurant_id = v_post.restaurant_id
        AND asset.user_id = v_post.author_id
        AND asset.status IN ('generated', 'stored')
        AND (
          asset.asset_type = 'menu_visual'
          OR coalesce(asset.metadata ->> 'tool', '') = 'menu_photo'
        )
      FOR SHARE;

      IF v_asset.id IS NULL THEN
        RAISE EXCEPTION 'daily_dish_media_asset_not_found';
      END IF;

      v_storage_bucket := nullif(btrim(v_asset.metadata ->> 'gallery_storage_bucket'), '');
      v_asset_path := nullif(btrim(v_asset.metadata ->> 'gallery_storage_path'), '');
      v_asset_url := nullif(btrim(v_asset.metadata ->> 'gallery_image_url'), '');

      IF v_storage_bucket IS DISTINCT FROM 'images'
        OR v_asset_path IS NULL
        OR v_asset_url IS NULL
      THEN
        RAISE EXCEPTION 'daily_dish_media_gallery_unavailable';
      END IF;

      IF NEW.media_path IS DISTINCT FROM v_asset_path
        OR NEW.media_url IS DISTINCT FROM v_asset_url
      THEN
        RAISE EXCEPTION 'daily_dish_media_asset_mismatch';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = v_storage_bucket
          AND object.name = v_asset_path
      ) THEN
        RAISE EXCEPTION 'daily_dish_media_storage_object_not_found';
      END IF;

      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'daily_dish_ai',
          'asset_id', v_asset.id,
          'storage_bucket', v_storage_bucket,
          'trusted_asset', true
        );
    ELSIF v_trusted_campaign_image THEN
      v_campaign_id_text := nullif(btrim(NEW.metadata ->> 'campaign_id'), '');
      IF v_campaign_id_text IS NULL
        OR v_campaign_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'campaign_media_campaign_invalid';
      END IF;

      SELECT *
      INTO v_campaign
      FROM public.ad_campaigns campaign
      WHERE campaign.id = v_campaign_id_text::uuid
        AND campaign.restaurant_id = v_post.restaurant_id
        AND campaign.image_url = NEW.media_url
        AND campaign.type = 'boost'
        AND public.jsonb_target_pages_has_actualites(campaign.target_pages)
      FOR SHARE;

      IF v_campaign.id IS NULL THEN
        RAISE EXCEPTION 'campaign_media_campaign_not_found';
      END IF;

      v_storage_bucket := 'images';
      v_asset_path := nullif(
        split_part(NEW.media_url, '/storage/v1/object/public/images/', 2),
        ''
      );

      IF v_asset_path IS NULL OR NEW.media_path IS DISTINCT FROM v_asset_path THEN
        RAISE EXCEPTION 'campaign_media_asset_mismatch';
      END IF;

      IF NEW.media_url IS DISTINCT FROM v_restaurant.image_url
        AND v_asset_path NOT LIKE v_post.author_id::text || '/%'
        AND v_asset_path NOT LIKE v_post.restaurant_id::text || '/%'
        AND v_asset_path NOT LIKE 'ai-gallery/' || v_post.restaurant_id::text || '/%'
      THEN
        RAISE EXCEPTION 'campaign_media_asset_not_owned';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = v_storage_bucket
          AND object.name = v_asset_path
      ) THEN
        RAISE EXCEPTION 'campaign_media_storage_object_not_found';
      END IF;

      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'campaign_image',
          'campaign_id', v_campaign.id,
          'storage_bucket', v_storage_bucket,
          'trusted_asset', true
        );
    ELSE
      IF NEW.media_path NOT LIKE v_post.restaurant_id::text || '/' || NEW.post_id::text || '/%' THEN
        RAISE EXCEPTION 'social_media_storage_path_invalid';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = 'social-post-media'
          AND object.name = NEW.media_path
      ) THEN
        RAISE EXCEPTION 'social_media_storage_object_not_found';
      END IF;

      NEW.metadata := (
        coalesce(NEW.metadata, '{}'::jsonb)
        - 'storage_bucket'
        - 'trusted_asset'
      ) || jsonb_build_object(
        'storage_bucket', 'social-post-media',
        'trusted_asset', false
      );
    END IF;
  END IF;

  v_body := regexp_replace(coalesce(v_post.body, ''), '#[[:alnum:]_]+', ' ', 'g');
  v_body := regexp_replace(btrim(v_body), '\s+', ' ', 'g');
  v_fallback := CASE
    WHEN v_body <> '' THEN
      format('Photo publiée par %s : %s', v_restaurant.name, left(v_body, 170))
    WHEN nullif(btrim(v_restaurant.cuisine_type), '') IS NOT NULL THEN
      format(
        'Photo publiée par %s, restaurant de cuisine %s à %s.',
        v_restaurant.name,
        v_restaurant.cuisine_type,
        v_restaurant.city
      )
    ELSE
      format('Photo publiée par le restaurant %s à %s.', v_restaurant.name, v_restaurant.city)
  END;

  v_basename := lower(regexp_replace(coalesce(NEW.media_path, ''), '^.*/', ''));

  IF NEW.media_type = 'image' AND (
    nullif(btrim(NEW.alt_text), '') IS NULL
    OR lower(btrim(NEW.alt_text)) = v_basename
    OR lower(btrim(NEW.alt_text)) ~ '(^|[/\\])[^/\\]+\.(jpe?g|png|webp|gif|heic|avif)$'
    OR lower(btrim(NEW.alt_text)) ~ '^(img|image|photo|dsc|pxl|screenshot)[-_ ]?[a-z0-9_-]*$'
  ) THEN
    NEW.alt_text := left(v_fallback, 240);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_social_post_boost_atomic(
  p_restaurant_id uuid,
  p_post_id uuid,
  p_title text,
  p_body text,
  p_image_url text,
  p_image_path text,
  p_media_alt_text text,
  p_target_criteria jsonb,
  p_total_budget numeric,
  p_budget_daily numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_pricing_strategy text,
  p_cpm_rate numeric,
  p_cpc_rate numeric,
  p_conversion_rate numeric,
  p_cta_type text,
  p_cta_target_id uuid,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_post public.social_posts%ROWTYPE;
  v_campaign public.ad_campaigns%ROWTYPE;
  v_promotion public.social_post_promotions%ROWTYPE;
  v_credit_usage jsonb;
  v_credit_entry jsonb;
  v_available_chf numeric := 0;
  v_target_criteria jsonb;
  v_cta_type text;
  v_cta_target_id uuid;
  v_media_created boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_restaurant_id IS NULL OR p_post_id IS NULL THEN
    RAISE EXCEPTION 'restaurant_and_post_required' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_total_budget, 0) <= 0
    OR coalesce(p_budget_daily, 0) <= 0
    OR p_ends_at IS NULL
    OR p_starts_at IS NULL
    OR p_ends_at < p_starts_at
  THEN
    RAISE EXCEPTION 'invalid_boost_budget_or_window' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('social_post_boost:' || p_restaurant_id::text, 0)
  );

  SELECT *
  INTO v_post
  FROM public.social_posts
  WHERE id = p_post_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF v_post.id IS NULL THEN
    RAISE EXCEPTION 'social_post_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_post.status <> 'published'
    OR v_post.visibility <> 'public'
    OR (v_post.scheduled_at IS NOT NULL AND v_post.scheduled_at > now())
    OR (v_post.published_at IS NOT NULL AND v_post.published_at > now())
  THEN
    RAISE EXCEPTION 'social_post_not_publishable_for_boost' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_post_promotions spp
    JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
    WHERE spp.post_id = p_post_id
      AND spp.restaurant_id = p_restaurant_id
      AND spp.status IN ('active', 'pending_payment', 'paused')
      AND ac.status IN ('active', 'paused', 'draft')
      AND ac.payment_status = 'paid'
      AND tstzrange(
        coalesce(spp.starts_at, ac.starts_at, now()),
        coalesce(spp.ends_at, ac.ends_at, 'infinity'::timestamptz),
        '[]'
      ) && tstzrange(p_starts_at, p_ends_at, '[]')
  ) THEN
    RAISE EXCEPTION 'social_post_boost_already_active' USING ERRCODE = '23505';
  END IF;

  v_credit_usage := public.get_restaurant_credit_usage(p_restaurant_id);
  SELECT item
  INTO v_credit_entry
  FROM jsonb_array_elements(coalesce(v_credit_usage->'credits', '[]'::jsonb)) AS item
  WHERE item->>'kind' = 'tok_credits'
  LIMIT 1;

  IF v_credit_entry IS NOT NULL THEN
    v_available_chf := coalesce((v_credit_entry->>'balance')::numeric, 0) / 15;
  ELSE
    SELECT item
    INTO v_credit_entry
    FROM jsonb_array_elements(coalesce(v_credit_usage->'credits', '[]'::jsonb)) AS item
    WHERE item->>'kind' = 'campaign'
    LIMIT 1;
    v_available_chf := coalesce((v_credit_entry->>'balance')::numeric, 0);
  END IF;

  IF p_total_budget > v_available_chf THEN
    RAISE EXCEPTION 'campaign_credits_insufficient:%', round(v_available_chf, 2)
      USING ERRCODE = 'P0001';
  END IF;

  v_target_criteria := public.normalize_campaign_target_criteria(
    coalesce(p_target_criteria, '{}'::jsonb) || jsonb_build_object('restaurantId', p_restaurant_id)
  );
  v_cta_type := lower(btrim(coalesce(p_cta_type, '')));
  IF v_cta_type NOT IN ('reserve', 'order', 'menu', 'offer') THEN
    v_cta_type := 'menu';
  END IF;
  v_cta_target_id := coalesce(p_cta_target_id, p_restaurant_id);

  INSERT INTO public.ad_campaigns (
    restaurant_id,
    title,
    body,
    type,
    image_url,
    target_pages,
    target_criteria,
    total_budget,
    budget_daily,
    starts_at,
    ends_at,
    payment_method,
    payment_status,
    paid_amount,
    paid_at,
    status,
    activated_at,
    pricing_strategy,
    cpm_rate,
    cpc_rate,
    conversion_rate,
    daily_spent_date
  )
  VALUES (
    p_restaurant_id,
    nullif(btrim(p_title), ''),
    nullif(btrim(p_body), ''),
    'boost',
    nullif(btrim(p_image_url), ''),
    jsonb_build_array('actualites'),
    v_target_criteria,
    p_total_budget,
    p_budget_daily,
    p_starts_at,
    p_ends_at,
    'credits',
    'paid',
    p_total_budget,
    now(),
    'active',
    now(),
    p_pricing_strategy,
    p_cpm_rate,
    p_cpc_rate,
    p_conversion_rate,
    current_date
  )
  RETURNING * INTO v_campaign;

  IF NOT EXISTS (
    SELECT 1 FROM public.social_post_media media WHERE media.post_id = p_post_id
  ) THEN
    IF nullif(btrim(p_image_url), '') IS NULL OR nullif(btrim(p_image_path), '') IS NULL THEN
      RAISE EXCEPTION 'sponsored_post_media_required' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.social_post_media (
      post_id,
      media_url,
      media_path,
      media_type,
      sort_order,
      alt_text,
      metadata
    )
    VALUES (
      p_post_id,
      p_image_url,
      p_image_path,
      'image',
      0,
      nullif(btrim(p_media_alt_text), ''),
      jsonb_build_object(
        'source', 'campaign_image',
        'campaign_id', v_campaign.id
      )
    );
    v_media_created := true;
  END IF;

  UPDATE public.social_posts
  SET cta_type = v_cta_type,
      cta_target_id = v_cta_target_id,
      updated_at = now()
  WHERE id = p_post_id;

  INSERT INTO public.social_post_promotions (
    post_id,
    campaign_id,
    restaurant_id,
    status,
    starts_at,
    ends_at,
    budget_amount,
    currency,
    placement,
    boost_weight,
    targeting,
    created_by
  )
  VALUES (
    p_post_id,
    v_campaign.id,
    p_restaurant_id,
    'active',
    p_starts_at,
    p_ends_at,
    p_total_budget,
    'CHF',
    'actualites_feed',
    1,
    v_target_criteria,
    p_created_by
  )
  RETURNING * INTO v_promotion;

  RETURN jsonb_build_object(
    'campaign', to_jsonb(v_campaign),
    'promotion', to_jsonb(v_promotion),
    'post', jsonb_build_object(
      'id', p_post_id,
      'cta_type', v_cta_type,
      'cta_target_id', v_cta_target_id
    ),
    'media_created', v_media_created
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_social_post_boost_atomic(
  uuid, uuid, text, text, text, text, text, jsonb, numeric, numeric,
  timestamptz, timestamptz, text, numeric, numeric, numeric, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_post_boost_atomic(
  uuid, uuid, text, text, text, text, text, jsonb, numeric, numeric,
  timestamptz, timestamptz, text, numeric, numeric, numeric, text, uuid, uuid
) TO service_role;

-- Repair active paid promotions created before the atomic flow. Only verified
-- objects from the public images bucket are reused.
INSERT INTO public.social_post_media (
  post_id,
  media_url,
  media_path,
  media_type,
  sort_order,
  alt_text,
  metadata
)
SELECT
  sp.id,
  ac.image_url,
  split_part(ac.image_url, '/storage/v1/object/public/images/', 2),
  'image',
  0,
  format('Publication sponsorisée de %s', r.name),
  jsonb_build_object(
    'source', 'campaign_image',
    'campaign_id', ac.id,
    'backfilled_at', now()
  )
FROM public.social_post_promotions spp
JOIN public.social_posts sp ON sp.id = spp.post_id
JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
JOIN public.restaurants r ON r.id = sp.restaurant_id
JOIN storage.objects object
  ON object.bucket_id = 'images'
 AND object.name = split_part(ac.image_url, '/storage/v1/object/public/images/', 2)
WHERE spp.status = 'active'
  AND ac.status = 'active'
  AND ac.payment_status = 'paid'
  AND public.jsonb_target_pages_has_actualites(ac.target_pages)
  AND ac.image_url LIKE '%/storage/v1/object/public/images/%'
  AND NOT EXISTS (
    SELECT 1 FROM public.social_post_media existing WHERE existing.post_id = sp.id
  )
  AND (
    ac.image_url = r.image_url
    OR split_part(ac.image_url, '/storage/v1/object/public/images/', 2) LIKE sp.author_id::text || '/%'
    OR split_part(ac.image_url, '/storage/v1/object/public/images/', 2) LIKE sp.restaurant_id::text || '/%'
    OR split_part(ac.image_url, '/storage/v1/object/public/images/', 2) LIKE 'ai-gallery/' || sp.restaurant_id::text || '/%'
  )
ON CONFLICT (post_id, sort_order) DO NOTHING;

UPDATE public.social_posts sp
SET cta_type = CASE
      WHEN r.supports_reservation IS DISTINCT FROM false
        AND public.immutable_unaccent_lower(sp.body) ~ '(reserv|réserv|table|places)'
        THEN 'reserve'
      WHEN public.immutable_unaccent_lower(sp.body) ~ '(command|livraison|emporter|retrait|menu|plat)'
        THEN 'order'
      ELSE 'menu'
    END,
    cta_target_id = sp.restaurant_id,
    updated_at = now()
FROM public.restaurants r
WHERE r.id = sp.restaurant_id
  AND sp.cta_type = 'none'
  AND EXISTS (
    SELECT 1
    FROM public.social_post_promotions spp
    JOIN public.ad_campaigns ac ON ac.id = spp.campaign_id
    WHERE spp.post_id = sp.id
      AND spp.status = 'active'
      AND ac.status = 'active'
      AND ac.payment_status = 'paid'
  );

NOTIFY pgrst, 'reload schema';
