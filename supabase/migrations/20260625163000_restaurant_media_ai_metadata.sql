ALTER TABLE public.restaurant_media
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurant_media
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

UPDATE public.restaurant_media
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE public.restaurant_media
  ALTER COLUMN metadata SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.ai_generated_assets') IS NOT NULL THEN
    EXECUTE $sql$
      WITH ai_matches AS (
        SELECT
          rm.id AS media_id,
          aga.id AS asset_id,
          aga.title,
          aga.asset_type,
          aga.model,
          aga.metadata,
          aga.created_at
        FROM public.restaurant_media rm
        JOIN LATERAL (
          SELECT asset.*
          FROM public.ai_generated_assets asset
          WHERE asset.restaurant_id = rm.restaurant_id
            AND (
              rm.media_url = asset.asset_url
              OR rm.media_url = asset.metadata->>'gallery_image_url'
              OR (
                rm.storage_path IS NOT NULL
                AND rm.storage_path = asset.metadata->>'gallery_storage_path'
              )
            )
          ORDER BY asset.created_at DESC
          LIMIT 1
        ) aga ON true
        WHERE rm.media_type = 'photo_ai_tok'
          AND COALESCE(rm.metadata->>'source', '') = ''
      )
      UPDATE public.restaurant_media rm
      SET metadata = COALESCE(rm.metadata, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'source', 'tok_ai_generation',
          'dish_name', COALESCE(ai.metadata->>'dish_name', ai.title, rm.alt_text),
          'tool', CASE
            WHEN ai.asset_type = 'campaign_visual' OR ai.metadata->>'marketing_asset_mode' = 'true'
              THEN 'marketing_studio'
            ELSE 'photopro'
          END,
          'tool_label', CASE
            WHEN ai.asset_type = 'campaign_visual' OR ai.metadata->>'marketing_asset_mode' = 'true'
              THEN 'Marketing Studio'
            ELSE 'Photopro'
          END,
          'ai_model', COALESCE(ai.model, ai.metadata->>'request_image_model', ai.metadata->>'image_model'),
          'output_resolution', ai.metadata->>'output_resolution',
          'output_quality', CASE COALESCE(ai.metadata->>'requested_output_quality', ai.metadata->>'image_quality')
            WHEN 'medium' THEN 'med'
            ELSE COALESCE(ai.metadata->>'requested_output_quality', ai.metadata->>'image_quality')
          END,
          'output_size', COALESCE(ai.metadata->>'request_image_size', ai.metadata->>'image_size'),
          'generated_asset_id', ai.asset_id::text,
          'generated_at', ai.created_at
        ))
      FROM ai_matches ai
      WHERE rm.id = ai.media_id
    $sql$;
  END IF;
END $$;
