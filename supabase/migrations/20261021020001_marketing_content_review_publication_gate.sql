-- A Telegram content decision and the existing scheduling approval are both
-- required for newly tracked Marketing content. Historical, untracked items
-- retain their existing authorization. No callback schedules or publishes.
BEGIN;

CREATE OR REPLACE FUNCTION public.marketing_require_content_review_delivery(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_campaign_id uuid;
BEGIN
  SELECT campaign_id INTO v_campaign_id FROM public.marketing_calendar_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Calendar item not found' USING ERRCODE = 'P0002'; END IF;
  -- Callers already hold the source row. Source -> target is also the mutation
  -- trigger's lock order; never lock the source after taking this target lock.
  PERFORM 1 FROM public.marketing_content_review_targets
  WHERE target_type = CASE WHEN v_campaign_id IS NULL THEN 'item' ELSE 'campaign' END
    AND target_id = COALESCE(v_campaign_id, p_item_id)
  FOR SHARE;
  IF public.marketing_content_review_allows_delivery(p_item_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Marketing content Telegram approval required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_require_content_review_delivery(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Meta persists this marker immediately before the external publish request.
-- A review invalidated after the queue claim is therefore checked again in
-- the same transaction as the publish marker, including parent edits.
CREATE OR REPLACE FUNCTION public.marketing_guard_content_review_publish_marker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.channel IN ('instagram','facebook')
     AND NEW.result_summary ->> 'meta_publish_started_at' IS NOT NULL
     AND NEW.result_summary ->> 'meta_publish_started_at' IS DISTINCT FROM OLD.result_summary ->> 'meta_publish_started_at' THEN
    -- An UPDATE cannot change the material and consume its previous approval
    -- in the same statement, before the AFTER mutation trigger invalidates it.
    IF ROW(NEW.campaign_id,NEW.integration_id,NEW.title,NEW.channel,NEW.item_type,NEW.scheduled_at,NEW.timezone,
        NEW.audience_name,NEW.content-'daily_publication_authorization',NEW.targeting,NEW.status='cancelled')
      IS DISTINCT FROM
      ROW(OLD.campaign_id,OLD.integration_id,OLD.title,OLD.channel,OLD.item_type,OLD.scheduled_at,OLD.timezone,
        OLD.audience_name,OLD.content-'daily_publication_authorization',OLD.targeting,OLD.status='cancelled') THEN
      RAISE EXCEPTION 'Marketing content Telegram approval required' USING ERRCODE = '42501';
    END IF;
    PERFORM public.marketing_require_content_review_delivery(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_guard_content_review_publish_marker() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS marketing_content_review_publish_guard ON public.marketing_calendar_items;
CREATE TRIGGER marketing_content_review_publish_guard
BEFORE UPDATE OF result_summary ON public.marketing_calendar_items
FOR EACH ROW EXECUTE FUNCTION public.marketing_guard_content_review_publish_marker();

-- Extend the live function definitions so later mailing/cadence amendments
-- remain intact. Each exact anchor is checked once; schema drift aborts the
-- migration instead of silently omitting the authorization gate.
DO $publication_gates$
DECLARE v_patch record; v_definition text; v_signature regprocedure;
BEGIN
  FOR v_patch IN SELECT * FROM (VALUES
    ('public.claim_due_marketing_items(integer,text,integer)',
      '    WHERE i.approval_status = ''approved''',
      E'    WHERE public.marketing_content_review_allows_delivery(i.id)\n      AND i.approval_status = ''approved'''),
    ('public.claim_marketing_item(uuid,text,integer)',
      '    WHERE i.id = p_item_id AND i.approval_status = ''approved''',
      E'    WHERE i.id = p_item_id AND public.marketing_content_review_allows_delivery(i.id)\n      AND i.approval_status = ''approved'''),
    ('public.claim_marketing_deliveries(integer,text,integer)',
      '      AND i.approval_status = ''approved'' AND i.approved_at = d.item_approved_at',
      E'      AND public.marketing_content_review_allows_delivery(i.id)\n      AND i.approval_status = ''approved'' AND i.approved_at = d.item_approved_at'),
    ('public.service_prepare_marketing_email_delivery(uuid,uuid)',
      E'  UPDATE public.marketing_deliveries SET status = ''processing''\n  WHERE id = v_delivery.id;',
      E'  PERFORM public.marketing_require_content_review_delivery(v_item.id);\n  UPDATE public.marketing_deliveries SET status = ''processing''\n  WHERE id = v_delivery.id;'),
    ('public.service_send_marketing_in_app_delivery(uuid,uuid)',
      '  INSERT INTO public.notifications (id, user_id, title, body, type, category, data)',
      E'  PERFORM public.marketing_require_content_review_delivery(v_item.id);\n  INSERT INTO public.notifications (id, user_id, title, body, type, category, data)')
  ) AS patches(signature, anchor, replacement)
  LOOP
    v_signature := to_regprocedure(v_patch.signature);
    IF v_signature IS NULL THEN RAISE EXCEPTION 'Required Marketing delivery function is missing: %', v_patch.signature; END IF;
    v_definition := pg_get_functiondef(v_signature);
    IF strpos(v_definition, v_patch.replacement) > 0 THEN CONTINUE; END IF;
    IF (length(v_definition) - length(replace(v_definition, v_patch.anchor, ''))) / length(v_patch.anchor) <> 1 THEN
      RAISE EXCEPTION 'Marketing delivery function changed; reconcile review gate: %', v_patch.signature;
    END IF;
    EXECUTE replace(v_definition, v_patch.anchor, v_patch.replacement);
  END LOOP;
END;
$publication_gates$;

NOTIFY pgrst, 'reload schema';
COMMIT;
