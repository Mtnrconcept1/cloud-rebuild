-- The trusted daily-dish source is carried in social_post_media.metadata.
-- Re-run both validation and indexing whenever that metadata or URL changes,
-- instead of relying only on insert/path changes.

BEGIN;

DROP TRIGGER IF EXISTS prepare_actualites_media_for_indexing_on_write
  ON public.social_post_media;

CREATE TRIGGER prepare_actualites_media_for_indexing_on_write
BEFORE INSERT OR UPDATE OF
  post_id,
  media_url,
  media_path,
  media_type,
  alt_text,
  metadata
ON public.social_post_media
FOR EACH ROW
EXECUTE FUNCTION public.prepare_actualites_media_for_indexing();

DROP TRIGGER IF EXISTS sync_actualites_media_image_index_on_write
  ON public.social_post_media;

CREATE TRIGGER sync_actualites_media_image_index_on_write
AFTER INSERT OR UPDATE OF
  post_id,
  media_url,
  media_path,
  media_type,
  sort_order,
  alt_text,
  metadata
ON public.social_post_media
FOR EACH ROW
EXECUTE FUNCTION public.sync_actualites_media_image_index();

COMMIT;
