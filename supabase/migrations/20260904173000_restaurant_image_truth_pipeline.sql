-- Restaurant image truth pipeline.
--
-- Every current directory image is reviewed, every future candidate is
-- quarantined before publication, and rejected/ambiguous candidates are kept as
-- evidence without deleting the original Storage object.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS directory_image_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_image_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS directory_image_verification_score numeric(5,4),
  ADD COLUMN IF NOT EXISTS directory_image_verification_model text,
  ADD COLUMN IF NOT EXISTS directory_image_source_url text,
  ADD COLUMN IF NOT EXISTS directory_image_last_rejected_url text;

CREATE TABLE IF NOT EXISTS public.restaurant_image_truth_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  candidate_url text NOT NULL,
  source_url text,
  source_host text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'processing',
      'retry',
      'verified',
      'rejected',
      'manual_review'
    )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  image_sha256 text CHECK (image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 8388608),
  image_kind text CHECK (
    image_kind IS NULL OR image_kind IN (
      'exterior',
      'interior',
      'terrace',
      'food',
      'logo',
      'menu',
      'map',
      'stock',
      'person',
      'unrelated',
      'unknown'
    )
  ),
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  decision_reason text,
  reviewed_by_model text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, candidate_url)
);

CREATE TABLE IF NOT EXISTS public.restaurant_image_discovery_jobs (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'processing',
      'retry',
      'candidates_found',
      'no_candidate',
      'completed'
    )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 50),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count BETWEEN 0 AND 20),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_image_truth_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_image_discovery_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.restaurant_image_truth_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.restaurant_image_discovery_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.restaurant_image_truth_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.restaurant_image_discovery_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_restaurant_image_truth_claim
  ON public.restaurant_image_truth_reviews (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'processing', 'retry');

CREATE INDEX IF NOT EXISTS idx_restaurant_image_truth_restaurant_status
  ON public.restaurant_image_truth_reviews (restaurant_id, status, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_restaurant_image_truth_sha256
  ON public.restaurant_image_truth_reviews (image_sha256)
  WHERE image_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_image_discovery_claim
  ON public.restaurant_image_discovery_jobs (status, next_attempt_at, updated_at)
  WHERE status IN ('queued', 'processing', 'retry', 'no_candidate');

CREATE OR REPLACE FUNCTION public.queue_directory_image_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_previous_image text;
  v_previous_verified boolean;
  v_previous_verified_at timestamptz;
  v_previous_score numeric(5,4);
  v_previous_model text;
  v_source_url text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_previous_image := NULL;
    v_previous_verified := false;
    v_previous_verified_at := NULL;
    v_previous_score := NULL;
    v_previous_model := NULL;
  ELSE
    v_previous_image := OLD.image_url;
    v_previous_verified := OLD.directory_image_verified;
    v_previous_verified_at := OLD.directory_image_verified_at;
    v_previous_score := OLD.directory_image_verification_score;
    v_previous_model := OLD.directory_image_verification_model;
  END IF;

  IF NOT COALESCE(NEW.is_directory_listing, false) THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(NEW.image_url), '') IS NULL THEN
    NEW.image_url := NULL;
    NEW.directory_image_verified := false;
    NEW.directory_image_verified_at := NULL;
    NEW.directory_image_verification_score := NULL;
    NEW.directory_image_verification_model := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
    RETURN NEW;
  END IF;

  IF current_setting('tok.directory_image_truth_settling', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_source_url := COALESCE(
    NULLIF(btrim(NEW.directory_public_name_source_url), ''),
    NULLIF(btrim(NEW.directory_source_reference), '')
  );

  INSERT INTO public.restaurant_image_truth_reviews (
    restaurant_id,
    candidate_url,
    source_url,
    source_host,
    status,
    next_attempt_at,
    updated_at
  )
  VALUES (
    NEW.id,
    btrim(NEW.image_url),
    v_source_url,
    CASE
      WHEN v_source_url ~* '^https?://' THEN lower(split_part(split_part(v_source_url, '://', 2), '/', 1))
      ELSE NULL
    END,
    'queued',
    now(),
    now()
  )
  ON CONFLICT (restaurant_id, candidate_url) DO UPDATE
  SET
    source_url = COALESCE(EXCLUDED.source_url, public.restaurant_image_truth_reviews.source_url),
    source_host = COALESCE(EXCLUDED.source_host, public.restaurant_image_truth_reviews.source_host),
    status = CASE
      WHEN public.restaurant_image_truth_reviews.status IN ('verified', 'processing')
        THEN public.restaurant_image_truth_reviews.status
      ELSE 'queued'
    END,
    next_attempt_at = CASE
      WHEN public.restaurant_image_truth_reviews.status IN ('verified', 'processing')
        THEN public.restaurant_image_truth_reviews.next_attempt_at
      ELSE now()
    END,
    updated_at = now();

  -- Keep the last verified image visible while a replacement is checked. New
  -- listings remain image-less until the candidate is accepted.
  NEW.image_url := v_previous_image;
  NEW.directory_image_verified := v_previous_verified;
  NEW.directory_image_verified_at := v_previous_verified_at;
  NEW.directory_image_verification_score := v_previous_score;
  NEW.directory_image_verification_model := v_previous_model;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_queue_directory_image_candidate ON public.restaurants;
CREATE TRIGGER trg_queue_directory_image_candidate
BEFORE INSERT OR UPDATE OF image_url ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.queue_directory_image_candidate();

REVOKE ALL ON FUNCTION public.queue_directory_image_candidate() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_restaurant_image_truth_reviews(p_limit integer DEFAULT 10)
RETURNS TABLE (
  review_id uuid,
  lease_token uuid,
  restaurant_id uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  candidate_url text,
  source_url text,
  directory_source text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT reviews.id
    FROM public.restaurant_image_truth_reviews AS reviews
    WHERE (
      reviews.status IN ('queued', 'retry')
      AND reviews.next_attempt_at <= now()
    ) OR (
      reviews.status = 'processing'
      AND reviews.lease_expires_at < now()
    )
    ORDER BY reviews.next_attempt_at, reviews.created_at, reviews.id
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_image_truth_reviews AS reviews
    SET
      status = 'processing',
      attempts = LEAST(reviews.attempts + 1, 20),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '15 minutes',
      updated_at = now()
    FROM candidates
    WHERE reviews.id = candidates.id
    RETURNING reviews.*
  )
  SELECT
    claimed.id,
    claimed.lease_token,
    restaurant.id,
    restaurant.name,
    restaurant.address,
    restaurant.city,
    claimed.candidate_url,
    COALESCE(
      claimed.source_url,
      restaurant.directory_public_name_source_url,
      restaurant.directory_source_reference
    ),
    restaurant.directory_source,
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant ON restaurant.id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_restaurant_image_truth_reviews(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_truth_reviews(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_restaurant_image_truth_review(
  p_review_id uuid,
  p_lease_token uuid,
  p_decision text,
  p_confidence numeric,
  p_image_kind text,
  p_reason text,
  p_model text,
  p_image_sha256 text,
  p_mime_type text,
  p_size_bytes bigint,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_review public.restaurant_image_truth_reviews%ROWTYPE;
  v_decision text := lower(COALESCE(p_decision, 'manual_review'));
  v_confidence numeric(5,4) := LEAST(GREATEST(COALESCE(p_confidence, 0), 0), 1);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF v_decision NOT IN ('verified', 'rejected', 'manual_review', 'retry') THEN
    RAISE EXCEPTION 'invalid_image_truth_decision' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_review
  FROM public.restaurant_image_truth_reviews
  WHERE id = p_review_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_decision = 'verified' AND v_confidence < 0.86 THEN
    v_decision := 'manual_review';
  END IF;

  UPDATE public.restaurant_image_truth_reviews
  SET
    status = v_decision,
    confidence = v_confidence,
    image_kind = CASE
      WHEN p_image_kind IN (
        'exterior', 'interior', 'terrace', 'food', 'logo', 'menu',
        'map', 'stock', 'person', 'unrelated', 'unknown'
      ) THEN p_image_kind
      ELSE 'unknown'
    END,
    decision_reason = left(COALESCE(p_reason, ''), 1200),
    reviewed_by_model = left(COALESCE(p_model, ''), 160),
    image_sha256 = CASE
      WHEN p_image_sha256 ~ '^[0-9a-f]{64}$' THEN p_image_sha256
      ELSE NULL
    END,
    mime_type = left(COALESCE(p_mime_type, ''), 120),
    size_bytes = CASE
      WHEN p_size_bytes BETWEEN 0 AND 8388608 THEN p_size_bytes
      ELSE NULL
    END,
    evidence = COALESCE(p_evidence, '{}'::jsonb),
    reviewed_at = CASE WHEN v_decision = 'retry' THEN NULL ELSE now() END,
    next_attempt_at = CASE
      WHEN v_decision = 'retry' THEN now() + make_interval(mins => LEAST(1440, 5 * power(2, LEAST(v_review.attempts, 8))::integer))
      ELSE next_attempt_at
    END,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = v_review.id;

  IF v_decision = 'verified' THEN
    PERFORM set_config('tok.directory_image_truth_settling', 'on', true);
    UPDATE public.restaurants
    SET
      image_url = v_review.candidate_url,
      directory_image_verified = true,
      directory_image_verified_at = now(),
      directory_image_verification_score = v_confidence,
      directory_image_verification_model = left(COALESCE(p_model, ''), 160),
      directory_image_source_url = v_review.source_url,
      directory_image_last_rejected_url = NULL,
      updated_at = now()
    WHERE id = v_review.restaurant_id;

    UPDATE public.restaurant_image_discovery_jobs
    SET
      status = 'completed',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = now()
    WHERE restaurant_id = v_review.restaurant_id;
  ELSIF v_decision IN ('rejected', 'manual_review') THEN
    PERFORM set_config('tok.directory_image_truth_settling', 'on', true);
    UPDATE public.restaurants
    SET
      image_url = CASE
        WHEN image_url IS NOT DISTINCT FROM v_review.candidate_url
          OR directory_image_verified = false
        THEN NULL
        ELSE image_url
      END,
      directory_image_verified = CASE
        WHEN image_url IS NOT DISTINCT FROM v_review.candidate_url
          OR directory_image_verified = false
        THEN false
        ELSE directory_image_verified
      END,
      directory_image_verified_at = CASE
        WHEN image_url IS NOT DISTINCT FROM v_review.candidate_url
          OR directory_image_verified = false
        THEN NULL
        ELSE directory_image_verified_at
      END,
      directory_image_verification_score = CASE
        WHEN image_url IS NOT DISTINCT FROM v_review.candidate_url
          OR directory_image_verified = false
        THEN NULL
        ELSE directory_image_verification_score
      END,
      directory_image_verification_model = CASE
        WHEN image_url IS NOT DISTINCT FROM v_review.candidate_url
          OR directory_image_verified = false
        THEN NULL
        ELSE directory_image_verification_model
      END,
      directory_image_last_rejected_url = v_review.candidate_url,
      updated_at = now()
    WHERE id = v_review.restaurant_id;

    INSERT INTO public.restaurant_image_discovery_jobs (
      restaurant_id,
      source_url,
      status,
      next_attempt_at,
      updated_at
    )
    SELECT
      restaurant.id,
      COALESCE(
        restaurant.directory_public_name_source_url,
        restaurant.directory_source_reference
      ),
      'queued',
      now(),
      now()
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = v_review.restaurant_id
      AND COALESCE(restaurant.is_active, false)
      AND COALESCE(restaurant.is_directory_listing, false)
      AND COALESCE(restaurant.directory_public_name_verified, false)
    ON CONFLICT (restaurant_id) DO UPDATE
    SET
      source_url = COALESCE(EXCLUDED.source_url, public.restaurant_image_discovery_jobs.source_url),
      status = CASE
        WHEN public.restaurant_image_discovery_jobs.status = 'processing'
          THEN public.restaurant_image_discovery_jobs.status
        ELSE 'queued'
      END,
      next_attempt_at = CASE
        WHEN public.restaurant_image_discovery_jobs.status = 'processing'
          THEN public.restaurant_image_discovery_jobs.next_attempt_at
        ELSE now()
      END,
      updated_at = now();
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_restaurant_image_truth_review(
  uuid, uuid, text, numeric, text, text, text, text, text, bigint, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_restaurant_image_truth_review(
  uuid, uuid, text, numeric, text, text, text, text, text, bigint, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_restaurant_image_discovery_jobs(p_limit integer DEFAULT 10)
RETURNS TABLE (
  restaurant_id uuid,
  lease_token uuid,
  restaurant_name text,
  restaurant_address text,
  restaurant_city text,
  source_url text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT jobs.restaurant_id
    FROM public.restaurant_image_discovery_jobs AS jobs
    JOIN public.restaurants AS restaurant ON restaurant.id = jobs.restaurant_id
    WHERE (
      jobs.status IN ('queued', 'retry', 'no_candidate')
      AND jobs.next_attempt_at <= now()
    ) OR (
      jobs.status = 'processing'
      AND jobs.lease_expires_at < now()
    )
    AND COALESCE(restaurant.is_active, false)
    AND COALESCE(restaurant.is_directory_listing, false)
    AND COALESCE(restaurant.directory_public_name_verified, false)
    AND NULLIF(btrim(restaurant.image_url), '') IS NULL
    ORDER BY jobs.next_attempt_at, jobs.updated_at, jobs.restaurant_id
    FOR UPDATE OF jobs SKIP LOCKED
    LIMIT v_limit
  ), claimed AS (
    UPDATE public.restaurant_image_discovery_jobs AS jobs
    SET
      status = 'processing',
      attempts = LEAST(jobs.attempts + 1, 50),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '15 minutes',
      updated_at = now()
    FROM candidates
    WHERE jobs.restaurant_id = candidates.restaurant_id
    RETURNING jobs.*
  )
  SELECT
    restaurant.id,
    claimed.lease_token,
    restaurant.name,
    restaurant.address,
    restaurant.city,
    COALESCE(
      claimed.source_url,
      restaurant.directory_public_name_source_url,
      restaurant.directory_source_reference
    ),
    claimed.attempts
  FROM claimed
  JOIN public.restaurants AS restaurant ON restaurant.id = claimed.restaurant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_restaurant_image_discovery_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_discovery_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_restaurant_image_discovery_job(
  p_restaurant_id uuid,
  p_lease_token uuid,
  p_candidates jsonb,
  p_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.restaurant_image_discovery_jobs%ROWTYPE;
  v_candidate text;
  v_inserted integer := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_job
  FROM public.restaurant_image_discovery_jobs
  WHERE restaurant_id = p_restaurant_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  IF jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) = 'array' THEN
    FOR v_candidate IN
      SELECT value
      FROM jsonb_array_elements_text(COALESCE(p_candidates, '[]'::jsonb))
      LIMIT 5
    LOOP
      IF v_candidate ~* '^https?://' AND char_length(v_candidate) <= 2000 THEN
        INSERT INTO public.restaurant_image_truth_reviews (
          restaurant_id,
          candidate_url,
          source_url,
          source_host,
          status,
          next_attempt_at,
          updated_at
        )
        VALUES (
          p_restaurant_id,
          v_candidate,
          v_job.source_url,
          CASE
            WHEN v_job.source_url ~* '^https?://' THEN lower(split_part(split_part(v_job.source_url, '://', 2), '/', 1))
            ELSE NULL
          END,
          'queued',
          now(),
          now()
        )
        ON CONFLICT (restaurant_id, candidate_url) DO UPDATE
        SET
          source_url = COALESCE(EXCLUDED.source_url, public.restaurant_image_truth_reviews.source_url),
          status = CASE
            WHEN public.restaurant_image_truth_reviews.status IN ('verified', 'processing')
              THEN public.restaurant_image_truth_reviews.status
            ELSE 'queued'
          END,
          next_attempt_at = CASE
            WHEN public.restaurant_image_truth_reviews.status IN ('verified', 'processing')
              THEN public.restaurant_image_truth_reviews.next_attempt_at
            ELSE now()
          END,
          updated_at = now();
        v_inserted := v_inserted + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.restaurant_image_discovery_jobs
  SET
    status = CASE WHEN v_inserted > 0 THEN 'candidates_found' ELSE 'no_candidate' END,
    candidate_count = v_inserted,
    last_error = left(COALESCE(p_error, ''), 800),
    next_attempt_at = CASE
      WHEN v_inserted > 0 THEN now() + interval '1 day'
      ELSE now() + interval '7 days'
    END,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE restaurant_id = p_restaurant_id;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_restaurant_image_discovery_job(uuid, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_restaurant_image_discovery_job(uuid, uuid, jsonb, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_image_truth_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'active_directory', count(*) FILTER (
      WHERE COALESCE(restaurant.is_active, false)
        AND COALESCE(restaurant.is_directory_listing, false)
    ),
    'active_verified_names', count(*) FILTER (
      WHERE COALESCE(restaurant.is_active, false)
        AND COALESCE(restaurant.is_directory_listing, false)
        AND COALESCE(restaurant.directory_public_name_verified, false)
    ),
    'active_current_images', count(*) FILTER (
      WHERE COALESCE(restaurant.is_active, false)
        AND COALESCE(restaurant.is_directory_listing, false)
        AND NULLIF(btrim(restaurant.image_url), '') IS NOT NULL
    ),
    'active_verified_images', count(*) FILTER (
      WHERE COALESCE(restaurant.is_active, false)
        AND COALESCE(restaurant.is_directory_listing, false)
        AND COALESCE(restaurant.directory_image_verified, false)
        AND NULLIF(btrim(restaurant.image_url), '') IS NOT NULL
    ),
    'public_ready', count(*) FILTER (
      WHERE COALESCE(restaurant.is_active, false)
        AND COALESCE(restaurant.is_directory_listing, false)
        AND COALESCE(restaurant.directory_public_name_verified, false)
        AND COALESCE(restaurant.directory_image_verified, false)
        AND NULLIF(btrim(restaurant.image_url), '') IS NOT NULL
    ),
    'reviews_pending', (
      SELECT count(*)
      FROM public.restaurant_image_truth_reviews
      WHERE status IN ('queued', 'processing', 'retry')
    ),
    'reviews_rejected', (
      SELECT count(*)
      FROM public.restaurant_image_truth_reviews
      WHERE status = 'rejected'
    ),
    'reviews_manual', (
      SELECT count(*)
      FROM public.restaurant_image_truth_reviews
      WHERE status = 'manual_review'
    ),
    'discovery_pending', (
      SELECT count(*)
      FROM public.restaurant_image_discovery_jobs
      WHERE status IN ('queued', 'processing', 'retry', 'no_candidate')
    )
  )
  FROM public.restaurants AS restaurant;
$function$;

REVOKE ALL ON FUNCTION public.get_restaurant_image_truth_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_image_truth_stats() TO service_role;

-- Audit every current active directory image. Existing images remain available
-- only until the bounded worker records a decision; rejected and ambiguous
-- candidates are then cleared reversibly and sent to discovery.
INSERT INTO public.restaurant_image_truth_reviews (
  restaurant_id,
  candidate_url,
  source_url,
  source_host,
  status,
  next_attempt_at,
  updated_at
)
SELECT
  restaurant.id,
  btrim(restaurant.image_url),
  COALESCE(
    NULLIF(btrim(restaurant.directory_public_name_source_url), ''),
    NULLIF(btrim(restaurant.directory_source_reference), '')
  ),
  CASE
    WHEN COALESCE(
      NULLIF(btrim(restaurant.directory_public_name_source_url), ''),
      NULLIF(btrim(restaurant.directory_source_reference), '')
    ) ~* '^https?://'
    THEN lower(split_part(split_part(COALESCE(
      NULLIF(btrim(restaurant.directory_public_name_source_url), ''),
      NULLIF(btrim(restaurant.directory_source_reference), '')
    ), '://', 2), '/', 1))
    ELSE NULL
  END,
  'queued',
  now(),
  now()
FROM public.restaurants AS restaurant
WHERE COALESCE(restaurant.is_active, false)
  AND COALESCE(restaurant.is_directory_listing, false)
  AND NULLIF(btrim(restaurant.image_url), '') IS NOT NULL
ON CONFLICT (restaurant_id, candidate_url) DO NOTHING;

-- Keep filling the catalogue, but only for restaurants whose public commercial
-- name is already verified. Name verification continues independently through
-- the existing worker.
INSERT INTO public.restaurant_image_discovery_jobs (
  restaurant_id,
  source_url,
  status,
  next_attempt_at,
  updated_at
)
SELECT
  restaurant.id,
  COALESCE(
    NULLIF(btrim(restaurant.directory_public_name_source_url), ''),
    NULLIF(btrim(restaurant.directory_source_reference), '')
  ),
  'queued',
  now(),
  now()
FROM public.restaurants AS restaurant
WHERE COALESCE(restaurant.is_active, false)
  AND COALESCE(restaurant.is_directory_listing, false)
  AND COALESCE(restaurant.directory_public_name_verified, false)
  AND NULLIF(btrim(restaurant.image_url), '') IS NULL
ON CONFLICT (restaurant_id) DO UPDATE
SET
  source_url = COALESCE(EXCLUDED.source_url, public.restaurant_image_discovery_jobs.source_url),
  status = CASE
    WHEN public.restaurant_image_discovery_jobs.status = 'processing'
      THEN public.restaurant_image_discovery_jobs.status
    ELSE 'queued'
  END,
  next_attempt_at = CASE
    WHEN public.restaurant_image_discovery_jobs.status = 'processing'
      THEN public.restaurant_image_discovery_jobs.next_attempt_at
    ELSE now()
  END,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
