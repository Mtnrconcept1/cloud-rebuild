-- Social marketing cockpit: campaign intent fields for restaurateur Actualites.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS campaign_goal text NOT NULL DEFAULT 'awareness',
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS audience_segment text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS offer_code text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_campaign_goal_check,
  DROP CONSTRAINT IF EXISTS social_posts_audience_segment_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_campaign_goal_check
    CHECK (campaign_goal IN ('awareness', 'orders', 'bookings', 'loyalty', 'offer')),
  ADD CONSTRAINT social_posts_audience_segment_check
    CHECK (audience_segment IN ('local', 'followers', 'returning', 'discovery'));

CREATE INDEX IF NOT EXISTS social_posts_campaign_goal_created_idx
  ON public.social_posts (restaurant_id, campaign_goal, created_at DESC);

CREATE INDEX IF NOT EXISTS social_posts_audience_segment_created_idx
  ON public.social_posts (restaurant_id, audience_segment, created_at DESC);
