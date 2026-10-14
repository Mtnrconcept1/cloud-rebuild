-- Admin-only TOK AI usage and estimated OpenAI costs per restaurant.
-- This report is informational: it is NOT an OpenAI invoice or a payment ledger.
-- Read-only function, bounded window and page size; no historical data mutation.

CREATE INDEX IF NOT EXISTS ai_usage_logs_restaurant_success_created_idx
  ON public.ai_usage_logs (restaurant_id, created_at DESC)
  WHERE status = 'success';

CREATE OR REPLACE FUNCTION public.admin_ai_restaurant_cost_report(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since timestamptz;
  v_until timestamptz := now();
  v_summary jsonb;
  v_restaurants jsonb;
  v_models jsonb;
  v_total bigint;
BEGIN
  IF auth.role() <> 'service_role'
    AND NOT COALESCE(public.has_role(auth.uid(), 'admin'), false)
  THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 366
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN
    RAISE EXCEPTION 'invalid reporting window or page' USING ERRCODE = '22023';
  END IF;

  v_since := v_until - make_interval(days => p_days);

  SELECT jsonb_build_object(
    'requests', count(*)::bigint,
    'attributed_requests', count(*) FILTER (WHERE restaurant_id IS NOT NULL)::bigint,
    'unattributed_requests', count(*) FILTER (WHERE restaurant_id IS NULL)::bigint,
    'estimated_cost_chf', round(COALESCE(sum(GREATEST(estimated_cost_chf, 0)), 0), 6),
    'input_tokens', COALESCE(sum(GREATEST(input_tokens, 0)), 0),
    'output_tokens', COALESCE(sum(GREATEST(output_tokens, 0)), 0)
  )
  INTO v_summary
  FROM public.ai_usage_logs
  WHERE status = 'success'
    AND created_at >= v_since AND created_at < v_until;

  WITH restaurant_totals AS (
    SELECT ul.restaurant_id,
      count(*)::bigint AS requests,
      round(COALESCE(sum(GREATEST(ul.estimated_cost_chf, 0)), 0), 6) AS estimated_cost_chf,
      COALESCE(sum(GREATEST(ul.input_tokens, 0)), 0) AS input_tokens,
      COALESCE(sum(GREATEST(ul.output_tokens, 0)), 0) AS output_tokens,
      COALESCE(sum(
        CASE WHEN ul.metadata->>'credit_units' ~ '^[0-9]+([.][0-9]+)?$'
          THEN least((ul.metadata->>'credit_units')::numeric, 1000000)
          ELSE 0 END
      ), 0) AS logged_credit_units
    FROM public.ai_usage_logs ul
    WHERE ul.restaurant_id IS NOT NULL
      AND ul.status = 'success'
      AND ul.created_at >= v_since AND ul.created_at < v_until
    GROUP BY ul.restaurant_id
  )
  SELECT
    (SELECT count(*)::bigint FROM restaurant_totals),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'restaurant_id', page.restaurant_id,
          'restaurant_name', COALESCE(r.name, 'Restaurant non répertorié'),
          'requests', page.requests,
          'estimated_cost_chf', page.estimated_cost_chf,
          'input_tokens', page.input_tokens,
          'output_tokens', page.output_tokens,
          'logged_credit_units', page.logged_credit_units
        )
        ORDER BY page.estimated_cost_chf DESC, page.restaurant_id
      )
      FROM (
        SELECT * FROM restaurant_totals
        ORDER BY estimated_cost_chf DESC, restaurant_id
        LIMIT p_limit OFFSET p_offset
      ) page
      LEFT JOIN public.restaurants r ON r.id = page.restaurant_id
    ), '[]'::jsonb)
  INTO v_total, v_restaurants;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'model', totals.model,
      'requests', totals.requests,
      'estimated_cost_chf', totals.estimated_cost_chf
    ) ORDER BY totals.estimated_cost_chf DESC, totals.model
  ), '[]'::jsonb)
  INTO v_models
  FROM (
    SELECT COALESCE(NULLIF(model, ''), 'non renseigné') AS model,
      count(*)::bigint AS requests,
      round(COALESCE(sum(GREATEST(estimated_cost_chf, 0)), 0), 6) AS estimated_cost_chf
    FROM public.ai_usage_logs
    WHERE status = 'success'
      AND created_at >= v_since AND created_at < v_until
    GROUP BY COALESCE(NULLIF(model, ''), 'non renseigné')
    ORDER BY estimated_cost_chf DESC, model
    LIMIT 25
  ) totals;

  RETURN jsonb_build_object(
    'since', v_since,
    'until', v_until,
    'cost_type', 'estimated_only',
    'summary', v_summary,
    'total_restaurants', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_restaurants) < v_total,
    'restaurants', v_restaurants,
    'models', v_models
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_restaurant_cost_report(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_restaurant_cost_report(integer, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_ai_restaurant_cost_report(integer, integer, integer)
  IS 'Admin-only AI usage estimates from logged provider calls; does not reflect actual OpenAI invoicing or TOK sales margins.';

NOTIFY pgrst, 'reload schema';
