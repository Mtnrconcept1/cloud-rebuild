-- Make the delivery journal answer "who has this already reached?".
--
-- The journal could already be searched by campaign, item, provider, error
-- code, status and channel — everything except the one thing an operator asks
-- first. The recipient was neither searchable nor even returned, so answering
-- "did we already contact this restaurant?" meant reading masked targets by eye.
--
-- The masking stays. What is added is the contact's business identity, which is
-- public registry information, alongside its city and lawful basis so a row can
-- be judged without opening it. The address itself is still only revealed
-- through the audited, reason-bearing reveal operation.

CREATE OR REPLACE FUNCTION public.admin_list_marketing_deliveries(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query text := NULLIF(lower(btrim(p_query)), '');
  v_status text := NULLIF(btrim(p_status), '');
  v_channel text := NULLIF(btrim(p_channel), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset integer := COALESCE(p_offset, 0);
  v_items jsonb;
  v_total bigint;
BEGIN
  PERFORM public.marketing_require_admin();
  IF v_query IS NOT NULL AND (
    char_length(v_query) > 80 OR position('%' IN v_query) > 0
    OR position('_' IN v_query) > 0 OR position(chr(92) IN v_query) > 0
  ) THEN
    RAISE EXCEPTION 'Delivery search query is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'queued','leased','processing','retrying','sent','delivered','opened','clicked',
    'converted','bounced','complained','unsubscribed','skipped',
    'blocked_configuration','manual_required','failed','cancelled'
  ) THEN
    RAISE EXCEPTION 'Delivery status filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_channel IS NOT NULL AND v_channel NOT IN (
    'tok_news','in_app','email','push','instagram','facebook','linkedin',
    'tiktok','youtube','telegram','google_business','website',
    'manual_call','manual_email','manual_visit'
  ) THEN
    RAISE EXCEPTION 'Delivery channel filter is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_offset < 0 OR v_offset > 100000 THEN
    RAISE EXCEPTION 'Delivery offset is invalid' USING ERRCODE = '22023';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      d.*,
      i.title AS item_title,
      COALESCE(c.name, 'Campagne') AS campaign_name,
      mc.display_name AS contact_name,
      mc.city AS contact_city,
      mc.commune AS contact_commune,
      mc.postal_code AS contact_postal_code,
      mc.lawful_basis AS contact_lawful_basis
    FROM public.marketing_deliveries d
    JOIN public.marketing_calendar_items i ON i.id = d.item_id
    LEFT JOIN public.marketing_campaigns c ON c.id = i.campaign_id
    LEFT JOIN public.marketing_contacts mc ON mc.id = d.contact_id
    WHERE (v_status IS NULL OR d.status = v_status)
      AND (v_channel IS NULL OR d.channel = v_channel)
      AND (v_query IS NULL OR
        lower(COALESCE(c.name, 'Campagne')) LIKE v_query || '%'
        OR lower(i.title) LIKE v_query || '%'
        OR lower(d.provider) LIKE v_query || '%'
        OR lower(COALESCE(d.error_code, '')) LIKE v_query || '%'
        OR lower(d.status) LIKE v_query || '%'
        OR lower(d.channel) LIKE v_query || '%'
        -- Recipient lookup. The business name is matched anywhere in the
        -- string, because an operator searching "levant" is looking for
        -- "Café du Levant" and a prefix match would never find it.
        OR position(v_query IN lower(COALESCE(mc.display_name, ''))) > 0
        OR lower(COALESCE(mc.city, '')) LIKE v_query || '%'
        OR lower(COALESCE(mc.commune, '')) LIKE v_query || '%'
        OR COALESCE(mc.postal_code, '') LIKE v_query || '%'
        -- The masked target stays the only address form exposed here.
        OR lower(COALESCE(d.target_masked, '')) LIKE v_query || '%'
      )
  ), page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', page.id, 'item_id', page.item_id, 'item_title', page.item_title,
      'campaign_name', page.campaign_name,
      'contact_id', page.contact_id,
      'contact_name', page.contact_name,
      'contact_city', COALESCE(page.contact_commune, page.contact_city),
      'contact_postal_code', page.contact_postal_code,
      'contact_lawful_basis', page.contact_lawful_basis,
      'target_masked', page.target_masked, 'channel', page.channel,
      'status', page.status, 'provider', page.provider, 'attempt', page.attempt_count,
      'scheduled_at', page.scheduled_at, 'sent_at', page.sent_at,
      'delivered_at', page.delivered_at, 'opened_at', page.opened_at,
      'clicked_at', page.clicked_at, 'converted_at', page.converted_at,
      'manual_outcome', page.metadata ->> 'manual_outcome',
      'manual_note', left(page.metadata ->> 'manual_note', 2000),
      'created_at', page.created_at, 'updated_at', page.updated_at,
      'error_code', page.error_code
    ) ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb),
    (SELECT count(*) FROM filtered)
  INTO v_items, v_total
  FROM page;

  RETURN jsonb_build_object(
    'items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'has_more', v_offset::bigint + jsonb_array_length(v_items) < v_total
  );
END;
$$;

-- A recipient lookup scans display names, so it needs an index that survives
-- accents and case. pg_trgm is already available on this project.
CREATE INDEX IF NOT EXISTS marketing_contacts_display_name_trgm_idx
  ON public.marketing_contacts USING gin (lower(display_name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS marketing_deliveries_contact_idx
  ON public.marketing_deliveries(contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;
