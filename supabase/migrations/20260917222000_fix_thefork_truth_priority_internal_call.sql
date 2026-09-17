BEGIN;

-- This helper is called from the SECURITY DEFINER cron invoker itself, where
-- there is intentionally no request JWT. Keep it private by ACL instead of
-- requiring auth.role() inside the DB-internal call chain.
CREATE OR REPLACE FUNCTION public.prioritize_thefork_image_truth_reviews()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH prioritized AS (
    UPDATE public.restaurant_image_truth_reviews AS review
    SET
      next_attempt_at = LEAST(
        review.next_attempt_at,
        timestamptz '2000-01-01 00:00:00+00'
      ),
      updated_at = now()
    FROM public.restaurants AS restaurant
    WHERE restaurant.id = review.restaurant_id
      AND review.status IN ('queued', 'retry')
      AND EXISTS (
        SELECT 1
        FROM public.marketing_contacts AS contact
        WHERE contact.source_objectid::text = restaurant.directory_source_reference
          AND contact.branch = 'Restaurant référencé sur TheFork'
      )
      AND review.next_attempt_at > timestamptz '2000-01-01 00:00:00+00'
    RETURNING review.id
  )
  SELECT count(*)::integer INTO v_updated FROM prioritized;

  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.prioritize_thefork_image_truth_reviews()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prioritize_thefork_image_truth_reviews()
  TO service_role;

COMMIT;
