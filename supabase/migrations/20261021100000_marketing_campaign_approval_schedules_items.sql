-- Approving a campaign is the human go-ahead for its attached calendar items.
-- Telegram content review remains a separate delivery gate.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_approve_marketing_campaign(
  p_campaign_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.marketing_campaigns%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_min_item_schedule timestamptz;
  v_schedule_floor timestamptz := clock_timestamp() + interval '3 minutes';
  v_schedule_shift interval := interval '0 seconds';
  v_scheduled_item_count integer := 0;
  v_has_live_items boolean := false;
BEGIN
  PERFORM public.marketing_require_admin();

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Approval reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.marketing_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IN ('completed','cancelled','failed') THEN
    RAISE EXCEPTION 'Terminal campaign cannot be approved' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(v_row.objective), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign objective is required' USING ERRCODE = '22023';
  END IF;
  IF v_row.content = '{}'::jsonb OR NULLIF(btrim(v_row.content ->> 'message'), '') IS NULL THEN
    RAISE EXCEPTION 'Campaign content is required' USING ERRCODE = '22023';
  END IF;
  IF v_row.audience_definition = '{}'::jsonb THEN
    RAISE EXCEPTION 'Campaign audience is required' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_row.channels) = 0 THEN
    RAISE EXCEPTION 'At least one campaign channel is required' USING ERRCODE = '22023';
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.marketing_calendar_items live
      WHERE live.campaign_id = p_campaign_id
        AND live.status NOT IN ('sent','published','completed','cancelled')
    ),
    min(i.scheduled_at) FILTER (
      WHERE i.status NOT IN ('sent','published','completed','cancelled')
        AND (i.approval_status <> 'approved' OR i.status = 'draft')
    )
  INTO v_has_live_items, v_min_item_schedule
  FROM public.marketing_calendar_items i
  WHERE i.campaign_id = p_campaign_id;

  IF v_min_item_schedule IS NOT NULL AND v_min_item_schedule < v_schedule_floor THEN
    v_schedule_shift := v_schedule_floor - v_min_item_schedule;
  END IF;

  UPDATE public.marketing_campaigns
  SET
    approved_by = public.marketing_actor_user_id(),
    approved_at = clock_timestamp(),
    status = CASE
      WHEN status IN ('draft','paused') AND v_has_live_items THEN 'scheduled'
      ELSE status
    END,
    metadata = jsonb_set(
      metadata,
      '{approval_reason}',
      to_jsonb(left(btrim(p_reason), 500)),
      true
    )
  WHERE id = p_campaign_id
  RETURNING * INTO v_row;

  FOR v_item IN
    SELECT i.*
    FROM public.marketing_calendar_items i
    WHERE i.campaign_id = p_campaign_id
      AND i.status NOT IN ('sent','published','completed','cancelled')
      AND (i.approval_status <> 'approved' OR i.status = 'draft')
    ORDER BY i.scheduled_at, i.id
  LOOP
    PERFORM public.admin_approve_marketing_item(
      v_item.id,
      v_item.scheduled_at + v_schedule_shift
    );
    v_scheduled_item_count := v_scheduled_item_count + 1;
  END LOOP;

  INSERT INTO public.audit_log (
    id, user_id, action, entity_type, entity_id, old_data, new_data, created_at
  ) VALUES (
    gen_random_uuid(),
    public.marketing_actor_user_id(),
    'marketing_campaign_approved',
    'marketing_campaigns',
    v_row.id,
    NULL,
    jsonb_build_object(
      'reason', left(btrim(p_reason), 500),
      'approved_at', v_row.approved_at,
      'scheduled_item_count', v_scheduled_item_count,
      'schedule_shift_seconds', extract(epoch FROM v_schedule_shift)::bigint
    ),
    clock_timestamp()
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', CASE WHEN v_row.status = 'running' THEN 'active' ELSE v_row.status END,
    'approval_status', 'approved',
    'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at,
    'updated_at', v_row.updated_at,
    'scheduled_item_count', v_scheduled_item_count,
    'schedule_shift_seconds', extract(epoch FROM v_schedule_shift)::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_marketing_campaign(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
