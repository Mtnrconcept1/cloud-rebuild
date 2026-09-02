-- Requeue only directory listings that are still missing an image so the
-- exact name + address search strategy can enrich records exhausted by the
-- previous official-site-only pass. Existing restaurant images are untouched.

INSERT INTO public.restaurant_directory_image_jobs (restaurant_id, status)
SELECT r.id, 'pending'
FROM public.restaurants r
WHERE r.is_directory_listing IS TRUE
  AND nullif(btrim(r.image_url), '') IS NULL
ON CONFLICT (restaurant_id) DO NOTHING;

UPDATE public.restaurant_directory_image_jobs j
SET status = 'pending',
    attempts = 0,
    last_attempt_at = NULL,
    next_attempt_at = NULL,
    locked_at = NULL,
    source_page_url = NULL,
    source_image_url = NULL,
    last_error = NULL,
    updated_at = now()
FROM public.restaurants r
WHERE r.id = j.restaurant_id
  AND r.is_directory_listing IS TRUE
  AND nullif(btrim(r.image_url), '') IS NULL;
