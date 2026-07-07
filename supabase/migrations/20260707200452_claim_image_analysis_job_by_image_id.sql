CREATE OR REPLACE FUNCTION public.claim_image_analysis_job_by_image_id(
  p_worker_id text,
  p_image_id uuid
)
RETURNS TABLE (
  job_id uuid,
  image_id uuid,
  restaurant_id uuid,
  bucket text,
  storage_path text,
  public_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  RETURN QUERY
  WITH selected_job AS (
    SELECT j.id
    FROM public.image_analysis_jobs j
    JOIN public.restaurant_images i ON i.id = j.image_id
    WHERE j.image_id = p_image_id
      AND j.attempts < j.max_attempts
      AND (
        j.status = 'queued'
        OR (j.status = 'processing' AND j.locked_at < now() - interval '15 minutes')
      )
      AND i.analysis_status IN ('pending', 'processing', 'failed')
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ),
  updated_jobs AS (
    UPDATE public.image_analysis_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      error = NULL
    FROM selected_job sj
    WHERE j.id = sj.id
    RETURNING j.id, j.image_id
  ),
  updated_images AS (
    UPDATE public.restaurant_images i
    SET
      analysis_status = 'processing',
      analysis_attempts = i.analysis_attempts + 1,
      analysis_error = NULL
    FROM updated_jobs uj
    WHERE i.id = uj.image_id
    RETURNING i.id, i.restaurant_id, i.bucket, i.storage_path, i.public_url
  )
  SELECT
    uj.id AS job_id,
    ui.id AS image_id,
    ui.restaurant_id,
    ui.bucket,
    ui.storage_path,
    ui.public_url
  FROM updated_jobs uj
  JOIN updated_images ui ON ui.id = uj.image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_image_analysis_job_by_image_id(text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
