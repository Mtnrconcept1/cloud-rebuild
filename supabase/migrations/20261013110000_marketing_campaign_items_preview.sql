BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Campaign previews must include posts outside the calendar's visible month.
-- Keep the same response as the calendar, with a mandatory campaign boundary.
CREATE OR REPLACE FUNCTION public.admin_list_marketing_campaign_items(
  p_campaign_id uuid,
  p_limit integer DEFAULT 100,
  p_cursor_scheduled_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
  v_items jsonb;
  v_has_more boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Campaign identifier is required' USING ERRCODE = '22023';
  END IF;
  IF (p_cursor_scheduled_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'Both campaign cursor fields are required' USING ERRCODE = '22023';
  END IF;

  WITH page AS (
    SELECT i.*, COALESCE(c.name, 'Campagne') AS campaign_name
    FROM public.marketing_calendar_items i
    JOIN public.marketing_campaigns c ON c.id = i.campaign_id
    WHERE i.campaign_id = p_campaign_id
      AND (p_cursor_scheduled_at IS NULL OR (i.scheduled_at, i.id) > (p_cursor_scheduled_at, p_cursor_id))
    ORDER BY i.scheduled_at ASC, i.id ASC
    LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM page ORDER BY scheduled_at ASC, id ASC LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'campaign_id', campaign_id, 'campaign_name', campaign_name,
    'title', title, 'channel', channel,
    'status', CASE WHEN status IN ('queued','leased','processing','retrying') THEN 'running'
                   WHEN status IN ('sent','published','partial') THEN 'completed' ELSE status END,
    'scheduled_at', scheduled_at, 'timezone', timezone, 'audience_name', audience_name,
    'audience_size', audience_size, 'approval_status', approval_status, 'content', content,
    'manual_outcome', result_summary ->> 'manual_outcome',
    'manual_note', left(result_summary ->> 'manual_note', 2000),
    'published_at', published_at,
    'updated_at', updated_at
  ) ORDER BY scheduled_at ASC, id ASC), '[]'::jsonb),
  (SELECT count(*) > v_limit FROM page)
  INTO v_items, v_has_more FROM visible;

  RETURN jsonb_build_object(
    'items', v_items,
    'next_cursor', CASE WHEN v_has_more AND jsonb_array_length(v_items) > 0 THEN jsonb_build_object(
      'scheduled_at', v_items -> (jsonb_array_length(v_items) - 1) ->> 'scheduled_at',
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    ) ELSE NULL END
  );
END;
$$;

-- Only the existing BFF dispatcher may invoke this helper. In particular a
-- service-role JWT alone does not grant direct access to campaign previews.
REVOKE ALL ON FUNCTION public.admin_list_marketing_campaign_items(uuid, integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Extend the current dispatcher without reinstalling a historical definition
-- and thereby losing subsequent authorization or operation changes.
DO $campaign_items_dispatch$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_execute_marketing_admin_operation(text,text,text,jsonb)');
  v_definition text;
  v_anchor constant text := '    WHEN ''admin_list_marketing_calendar'' THEN';
  v_branch constant text := $branch$    WHEN 'admin_list_marketing_campaign_items' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_args) AS arg(k)
        WHERE arg.k NOT IN ('p_campaign_id','p_limit','p_cursor_scheduled_at','p_cursor_id')
      ) THEN
        RAISE EXCEPTION 'Campaign preview contains unsupported fields' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_list_marketing_campaign_items(
        NULLIF(v_args ->> 'p_campaign_id', '')::uuid,
        COALESCE(NULLIF(v_args ->> 'p_limit', '')::integer, 100),
        NULLIF(v_args ->> 'p_cursor_scheduled_at', '')::timestamptz,
        NULLIF(v_args ->> 'p_cursor_id', '')::uuid
      );
$branch$;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Required marketing BFF dispatcher is missing';
  END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition, v_branch) > 0 THEN
    NULL; -- Idempotent reapplication of this exact extension.
  ELSIF strpos(v_definition, 'WHEN ''admin_list_marketing_campaign_items''') > 0
     OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing BFF dispatcher definition: reconcile migration history before deployment';
  ELSE
    EXECUTE replace(v_definition, v_anchor, v_branch || v_anchor);
  END IF;
END;
$campaign_items_dispatch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
