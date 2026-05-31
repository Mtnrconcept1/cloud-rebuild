-- Link social Actualites posts to paid advertising campaigns.

CREATE TABLE IF NOT EXISTS public.social_post_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_payment',
  starts_at timestamptz,
  ends_at timestamptz,
  budget_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CHF',
  placement text NOT NULL DEFAULT 'actualites_feed',
  boost_weight numeric(8,2) NOT NULL DEFAULT 1,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_promotions_status_check CHECK (status IN ('draft', 'pending_payment', 'active', 'paused', 'ended', 'rejected')),
  CONSTRAINT social_post_promotions_currency_check CHECK (currency IN ('CHF', 'EUR', 'USD')),
  CONSTRAINT social_post_promotions_budget_non_negative_check CHECK (budget_amount >= 0),
  CONSTRAINT social_post_promotions_boost_weight_non_negative_check CHECK (boost_weight >= 0),
  CONSTRAINT social_post_promotions_unique_campaign UNIQUE (campaign_id)
);

CREATE INDEX IF NOT EXISTS social_post_promotions_post_idx
  ON public.social_post_promotions(post_id);

CREATE INDEX IF NOT EXISTS social_post_promotions_restaurant_status_idx
  ON public.social_post_promotions(restaurant_id, status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS social_post_promotions_campaign_idx
  ON public.social_post_promotions(campaign_id);

ALTER TABLE public.social_post_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_post_promotions_select_public_active" ON public.social_post_promotions;
CREATE POLICY "social_post_promotions_select_public_active"
  ON public.social_post_promotions
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = social_post_promotions.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "social_post_promotions_insert_owner" ON public.social_post_promotions;
CREATE POLICY "social_post_promotions_insert_owner"
  ON public.social_post_promotions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "social_post_promotions_update_owner" ON public.social_post_promotions;
CREATE POLICY "social_post_promotions_update_owner"
  ON public.social_post_promotions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.sync_social_post_promotion_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.social_post_promotions
  SET
    status = CASE
      WHEN NEW.payment_status = 'paid' AND NEW.status = 'active' THEN 'active'
      WHEN NEW.status = 'paused' THEN 'paused'
      WHEN NEW.status = 'ended' THEN 'ended'
      ELSE 'pending_payment'
    END,
    updated_at = now()
  WHERE campaign_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_social_post_promotion_status_on_campaign ON public.ad_campaigns;
CREATE TRIGGER sync_social_post_promotion_status_on_campaign
AFTER UPDATE OF status, payment_status ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.sync_social_post_promotion_status();
