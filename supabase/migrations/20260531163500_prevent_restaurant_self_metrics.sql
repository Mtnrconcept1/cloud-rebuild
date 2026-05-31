ALTER TABLE public.social_feed_events
  ADD COLUMN IF NOT EXISTS is_internal_actor boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS social_feed_events_internal_actor_idx
  ON public.social_feed_events(restaurant_id, is_internal_actor, created_at DESC);

NOTIFY pgrst, 'reload schema';
