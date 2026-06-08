CREATE TABLE IF NOT EXISTS public.admin_review_action_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  admin_user_id uuid DEFAULT auth.uid(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_review_action_history_review_created_idx
  ON public.admin_review_action_history(review_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_review_action_history_admin_created_idx
  ON public.admin_review_action_history(admin_user_id, created_at DESC);

ALTER TABLE public.admin_review_action_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS restaurant_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_reason text;

CREATE INDEX IF NOT EXISTS reviews_restaurant_read_created_idx
  ON public.reviews (restaurant_id, restaurant_read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_restaurant_rating_created_idx
  ON public.reviews (restaurant_id, rating DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_reported_status_idx
  ON public.reviews (status, reported_at DESC)
  WHERE reported_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_decision text,
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_reports_status_check CHECK (status IN ('open', 'accepted', 'rejected', 'closed'))
);

CREATE INDEX IF NOT EXISTS review_reports_restaurant_created_idx
  ON public.review_reports (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS review_reports_review_status_idx
  ON public.review_reports (review_id, status);

CREATE INDEX IF NOT EXISTS review_reports_status_created_idx
  ON public.review_reports (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS review_reports_review_open_unique_idx
  ON public.review_reports (review_id)
  WHERE status = 'open';

DROP TRIGGER IF EXISTS set_updated_at_review_reports ON public.review_reports;
CREATE TRIGGER set_updated_at_review_reports
BEFORE UPDATE ON public.review_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_reports_owner_admin_select" ON public.review_reports;
CREATE POLICY "review_reports_owner_admin_select"
  ON public.review_reports
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_admin()
    OR public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "review_reports_owner_insert" ON public.review_reports;
CREATE POLICY "review_reports_owner_insert"
  ON public.review_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND public.auth_owns_restaurant(restaurant_id)
  );

DROP POLICY IF EXISTS "review_reports_admin_update" ON public.review_reports;
CREATE POLICY "review_reports_admin_update"
  ON public.review_reports
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_public_select" ON public.reviews;
DROP POLICY IF EXISTS "reviews_published_owner_admin_select" ON public.reviews;
CREATE POLICY "reviews_published_owner_admin_select"
  ON public.reviews
  FOR SELECT
  USING (
    COALESCE(status, 'published') = 'published'
    OR auth.uid() = user_id
    OR public.auth_owns_restaurant(restaurant_id)
    OR public.auth_is_admin()
  );

DROP POLICY IF EXISTS "review_replies_public_select" ON public.review_replies;
CREATE POLICY "review_replies_public_select"
  ON public.review_replies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.reviews rv
      WHERE rv.id = review_replies.review_id
        AND (
          COALESCE(rv.status, 'published') = 'published'
          OR rv.user_id = auth.uid()
          OR public.auth_owns_restaurant(rv.restaurant_id)
          OR public.auth_is_admin()
        )
    )
  );

CREATE OR REPLACE FUNCTION public.restaurant_mark_review_read(p_review_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_restaurant_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT restaurant_id
  INTO v_restaurant_id
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  IF NOT (public.auth_owns_restaurant(v_restaurant_id) OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Restaurant access required.';
  END IF;

  UPDATE public.reviews
  SET restaurant_read_at = now(),
      restaurant_read_by = v_actor
  WHERE id = p_review_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_mark_review_read',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('restaurant_id', v_restaurant_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_reply_review(
  p_review_id uuid,
  p_reply_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reply_text text := NULLIF(trim(COALESCE(p_reply_text, '')), '');
  v_restaurant_id uuid;
  v_existing_reply_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_reply_text IS NULL THEN
    RAISE EXCEPTION 'Reply text is required.';
  END IF;

  SELECT restaurant_id
  INTO v_restaurant_id
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  IF NOT (public.auth_owns_restaurant(v_restaurant_id) OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Restaurant access required.';
  END IF;

  SELECT id
  INTO v_existing_reply_id
  FROM public.review_replies
  WHERE review_id = p_review_id;

  IF v_existing_reply_id IS NULL THEN
    INSERT INTO public.review_replies (review_id, author_id, author_type, reply_text)
    VALUES (p_review_id, v_actor, 'restaurant_staff', v_reply_text)
    RETURNING id INTO v_existing_reply_id;
  ELSE
    UPDATE public.review_replies
    SET reply_text = v_reply_text,
        author_id = v_actor,
        author_type = 'restaurant_staff'
    WHERE id = v_existing_reply_id;
  END IF;

  UPDATE public.reviews
  SET restaurant_read_at = COALESCE(restaurant_read_at, now()),
      restaurant_read_by = COALESCE(restaurant_read_by, v_actor)
  WHERE id = p_review_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_reply_review',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('reply_id', v_existing_reply_id, 'reply_text_length', length(v_reply_text))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_report_review(
  p_review_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_restaurant_id uuid;
  v_previous_status text;
  v_report_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Report reason is required.';
  END IF;

  SELECT restaurant_id, COALESCE(status, 'published')
  INTO v_restaurant_id, v_previous_status
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  IF NOT (public.auth_owns_restaurant(v_restaurant_id) OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Restaurant access required.';
  END IF;

  INSERT INTO public.review_reports (review_id, restaurant_id, reporter_id, reason, status)
  VALUES (p_review_id, v_restaurant_id, v_actor, v_reason, 'open')
  ON CONFLICT (review_id) WHERE status = 'open'
  DO UPDATE
    SET reason = EXCLUDED.reason,
        reporter_id = EXCLUDED.reporter_id,
        updated_at = now()
  RETURNING id INTO v_report_id;

  UPDATE public.reviews
  SET status = 'flagged',
      reported_at = now(),
      reported_by = v_actor,
      report_reason = v_reason,
      restaurant_read_at = COALESCE(restaurant_read_at, now()),
      restaurant_read_by = COALESCE(restaurant_read_by, v_actor)
  WHERE id = p_review_id;

  INSERT INTO public.admin_review_action_history (
    review_id,
    action,
    previous_status,
    new_status,
    reason,
    admin_user_id,
    metadata
  )
  VALUES (
    p_review_id,
    'restaurant_report',
    v_previous_status,
    'flagged',
    v_reason,
    v_actor,
    jsonb_build_object('report_id', v_report_id, 'restaurant_id', v_restaurant_id)
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_report_review',
    'review',
    p_review_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', 'flagged', 'reason', v_reason, 'report_id', v_report_id)
  );

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_restaurant_review_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text := 'votre restaurant';
BEGIN
  SELECT owner_id, COALESCE(name, 'votre restaurant')
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_notification(
    v_owner_id,
    'Nouvel avis client',
    format('Un client a laisse un avis %s/10 pour %s.', COALESCE(NEW.rating, 0), v_restaurant_name),
    'review',
    'product',
    jsonb_build_object(
      'review_id', NEW.id,
      'restaurant_id', NEW.restaurant_id,
      'url', '/dashboard/avis',
      'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
    )::json
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_restaurant_review_notification ON public.reviews;
CREATE TRIGGER after_restaurant_review_notification
AFTER INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.trigger_restaurant_review_notification();

CREATE OR REPLACE FUNCTION public.trigger_review_report_admin_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin record;
  v_restaurant_name text := 'Un restaurant';
BEGIN
  SELECT COALESCE(name, 'Un restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  FOR v_admin IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE role = 'admin'
  LOOP
    PERFORM public.enqueue_notification(
      v_admin.user_id,
      'Avis signale par un restaurateur',
      format('%s a signale un avis client.', v_restaurant_name),
      'review_report',
      'system',
      jsonb_build_object(
        'review_id', NEW.review_id,
        'review_report_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/admin/avis',
        'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
      )::json
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_review_report_admin_notification ON public.review_reports;
CREATE TRIGGER after_review_report_admin_notification
AFTER INSERT ON public.review_reports
FOR EACH ROW
EXECUTE FUNCTION public.trigger_review_report_admin_notification();

DROP FUNCTION IF EXISTS public.admin_update_review_status(uuid, text, text);
CREATE OR REPLACE FUNCTION public.admin_update_review_status(
  p_review_id uuid,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous_status text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_status NOT IN ('published', 'hidden', 'flagged', 'archived') THEN
    RAISE EXCEPTION 'Invalid review status.';
  END IF;

  IF p_status IN ('hidden', 'flagged', 'archived') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT COALESCE(status, 'published')
  INTO v_previous_status
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  UPDATE public.reviews
  SET status = p_status,
      reported_at = CASE WHEN p_status = 'published' THEN NULL ELSE reported_at END,
      reported_by = CASE WHEN p_status = 'published' THEN NULL ELSE reported_by END,
      report_reason = CASE WHEN p_status = 'published' THEN NULL ELSE report_reason END
  WHERE id = p_review_id;

  UPDATE public.review_reports
  SET status = CASE
        WHEN p_status = 'published' THEN 'rejected'
        WHEN p_status IN ('hidden', 'archived') THEN 'accepted'
        ELSE status
      END,
      admin_decision = p_status,
      admin_note = v_reason,
      reviewed_by = CASE WHEN p_status IN ('published', 'hidden', 'archived') THEN v_actor ELSE reviewed_by END,
      reviewed_at = CASE WHEN p_status IN ('published', 'hidden', 'archived') THEN now() ELSE reviewed_at END
  WHERE review_id = p_review_id
    AND status = 'open';

  INSERT INTO public.admin_review_action_history (
    review_id,
    action,
    previous_status,
    new_status,
    reason,
    admin_user_id
  )
  VALUES (
    p_review_id,
    'status_update',
    v_previous_status,
    p_status,
    v_reason,
    v_actor
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_update_review_status',
    'review',
    p_review_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status, 'reason', v_reason)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_delete_review(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_delete_review(
  p_review_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous_status text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT COALESCE(status, 'published')
  INTO v_previous_status
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  UPDATE public.reviews
  SET status = 'archived'
  WHERE id = p_review_id;

  UPDATE public.review_reports
  SET status = 'accepted',
      admin_decision = 'archived',
      admin_note = v_reason,
      reviewed_by = v_actor,
      reviewed_at = now()
  WHERE review_id = p_review_id
    AND status = 'open';

  INSERT INTO public.admin_review_action_history (
    review_id,
    action,
    previous_status,
    new_status,
    reason,
    admin_user_id
  )
  VALUES (
    p_review_id,
    'archive',
    v_previous_status,
    'archived',
    v_reason,
    v_actor
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_delete_review',
    'review',
    p_review_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', 'archived', 'reason', v_reason)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_reply_review(uuid, text);
CREATE OR REPLACE FUNCTION public.admin_reply_review(
  p_review_id uuid,
  p_reply_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reply_text text := NULLIF(trim(COALESCE(p_reply_text, '')), '');
  v_existing_reply_id uuid;
BEGIN
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_reply_text IS NULL THEN
    RAISE EXCEPTION 'Reply text is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = p_review_id) THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  SELECT id
  INTO v_existing_reply_id
  FROM public.review_replies
  WHERE review_id = p_review_id;

  IF v_existing_reply_id IS NULL THEN
    INSERT INTO public.review_replies (review_id, author_id, author_type, reply_text)
    VALUES (p_review_id, v_actor, 'admin', v_reply_text)
    RETURNING id INTO v_existing_reply_id;
  ELSE
    UPDATE public.review_replies
    SET reply_text = v_reply_text,
        author_id = v_actor,
        author_type = 'admin'
    WHERE id = v_existing_reply_id;
  END IF;

  INSERT INTO public.admin_review_action_history (
    review_id,
    action,
    reason,
    admin_user_id,
    metadata
  )
  VALUES (
    p_review_id,
    'reply',
    'admin reply',
    v_actor,
    jsonb_build_object('reply_id', v_existing_reply_id)
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_reply_review',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('reply_text_length', length(v_reply_text))
  );
END;
$$;

WITH ai_review_service AS (
  SELECT jsonb_build_object(
    'service', 'ai_review_replies',
    'label', 'Réponses IA aux avis',
    'tier', 'ai',
    'description', 'Agent IA paramétrable selon le style du restaurant pour préparer les réponses aux avis clients'
  ) AS service_payload
)
UPDATE public.launch_packs lp
SET services = COALESCE(lp.services, '[]'::jsonb) || jsonb_build_array((SELECT service_payload FROM ai_review_service)),
    updated_at = now()
WHERE lp.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(lp.services, '[]'::jsonb)) existing_service
    WHERE existing_service ->> 'service' = 'ai_review_replies'
  );

REVOKE EXECUTE ON FUNCTION public.restaurant_mark_review_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restaurant_reply_review(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restaurant_report_review(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.restaurant_mark_review_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_reply_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restaurant_report_review(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_review(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) TO authenticated, service_role;

GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT UPDATE ON public.review_reports TO authenticated;

NOTIFY pgrst, 'reload schema';
