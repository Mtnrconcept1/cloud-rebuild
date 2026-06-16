-- Notify a user when someone replies to their comment and mention them in the reply.

CREATE OR REPLACE FUNCTION public.notify_social_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text;
  v_parent_author_id uuid;
  v_actor_name text;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.social_posts p
  JOIN public.restaurants r ON r.id = p.restaurant_id
  WHERE p.id = NEW.post_id;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Un utilisateur')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id
  LIMIT 1;

  v_actor_name := COALESCE(v_actor_name, 'Un utilisateur');

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT parent.user_id
    INTO v_parent_author_id
    FROM public.social_post_comments parent
    WHERE parent.id = NEW.parent_comment_id
      AND parent.post_id = NEW.post_id
    LIMIT 1;

    IF v_parent_author_id IS NOT NULL AND v_parent_author_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM public.enqueue_notification(
        v_parent_author_id,
        'Mention dans un commentaire',
        v_actor_name || ' vous a mentionné dans un commentaire.',
        'social_comment_mention',
        'product',
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'parent_comment_id', NEW.parent_comment_id,
          'mentioned_by_user_id', NEW.user_id,
          'url', '/actualites?post=' || NEW.post_id::text || '&comment=' || NEW.id::text,
          'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
        )::json
      );
    END IF;
  END IF;

  IF v_owner_id IS NOT NULL AND v_owner_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Nouveau commentaire',
      'Un client a commenté une actualité de ' || COALESCE(v_restaurant_name, 'votre restaurant') || '.',
      'social_comment',
      'product',
      jsonb_build_object(
        'post_id', NEW.post_id,
        'comment_id', NEW.id,
        'url', '/dashboard/actualites',
        'requested_channels', jsonb_build_object('in_app', true, 'push', true, 'email', false)
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_social_comment_insert ON public.social_post_comments;
CREATE TRIGGER notify_social_comment_insert
  AFTER INSERT ON public.social_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_social_comment();

NOTIFY pgrst, 'reload schema';
