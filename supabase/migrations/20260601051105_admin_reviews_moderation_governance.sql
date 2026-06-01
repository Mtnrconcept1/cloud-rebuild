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

DROP POLICY IF EXISTS "admin_review_action_history_admin_select" ON public.admin_review_action_history;
CREATE POLICY "admin_review_action_history_admin_select"
  ON public.admin_review_action_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_review_action_history_admin_insert" ON public.admin_review_action_history;
CREATE POLICY "admin_review_action_history_admin_insert"
  ON public.admin_review_action_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.admin_review_action_history TO authenticated;

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
  v_previous_status text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_status NOT IN ('published', 'hidden', 'flagged', 'archived') THEN
    RAISE EXCEPTION 'Invalid review status.';
  END IF;

  IF p_status IN ('hidden', 'flagged', 'archived') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT status
  INTO v_previous_status
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  UPDATE public.reviews
  SET status = p_status
  WHERE id = p_review_id;

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
    auth.uid()
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    'admin_update_review_status',
    'review',
    p_review_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status, 'reason', v_reason)
  );
END;
$$;

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
  v_previous_status text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT status
  INTO v_previous_status
  FROM public.reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found.';
  END IF;

  UPDATE public.reviews
  SET status = 'archived'
  WHERE id = p_review_id;

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
    auth.uid()
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    'admin_delete_review',
    'review',
    p_review_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', 'archived', 'reason', v_reason)
  );
END;
$$;

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
  v_reply_text text := NULLIF(trim(COALESCE(p_reply_text, '')), '');
  v_existing_reply_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
    VALUES (p_review_id, auth.uid(), 'admin', v_reply_text);
  ELSE
    UPDATE public.review_replies
    SET reply_text = v_reply_text,
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
    auth.uid(),
    jsonb_build_object('reply_id', v_existing_reply_id)
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    'admin_reply_review',
    'review',
    p_review_id,
    '{}'::jsonb,
    jsonb_build_object('reply_text_length', length(v_reply_text))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_review(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_update_review_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_review(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reply_review(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
