-- App Store compliance: Apple StoreKit entitlement provenance and user blocking for UGC.
-- Additive only: existing Stripe subscriptions and social data remain untouched.

ALTER TABLE public.tok_one_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS apple_product_id text,
  ADD COLUMN IF NOT EXISTS apple_transaction_id text,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS apple_environment text,
  ADD COLUMN IF NOT EXISTS apple_app_account_token uuid,
  ADD COLUMN IF NOT EXISTS apple_signed_at timestamptz;

ALTER TABLE public.tok_one_subscriptions
  DROP CONSTRAINT IF EXISTS tok_one_subscriptions_billing_provider_check,
  ADD CONSTRAINT tok_one_subscriptions_billing_provider_check
    CHECK (billing_provider IN ('stripe', 'apple'));

ALTER TABLE public.tok_one_subscriptions
  DROP CONSTRAINT IF EXISTS tok_one_subscriptions_apple_environment_check,
  ADD CONSTRAINT tok_one_subscriptions_apple_environment_check
    CHECK (
      apple_environment IS NULL
      OR lower(apple_environment) IN ('production', 'sandbox', 'xcode', 'localtesting')
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_tok_one_apple_original_transaction
  ON public.tok_one_subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tok_one_apple_transaction
  ON public.tok_one_subscriptions (apple_transaction_id)
  WHERE apple_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tok_one_billing_provider_user
  ON public.tok_one_subscriptions (billing_provider, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_user_blocks (
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT social_user_blocks_not_self CHECK (blocker_user_id <> blocked_user_id)
);

ALTER TABLE public.social_user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_user_blocks_own_select" ON public.social_user_blocks;
CREATE POLICY "social_user_blocks_own_select"
  ON public.social_user_blocks
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = blocker_user_id);

DROP POLICY IF EXISTS "social_user_blocks_own_insert" ON public.social_user_blocks;
CREATE POLICY "social_user_blocks_own_insert"
  ON public.social_user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = blocker_user_id
    AND blocker_user_id <> blocked_user_id
  );

DROP POLICY IF EXISTS "social_user_blocks_own_delete" ON public.social_user_blocks;
CREATE POLICY "social_user_blocks_own_delete"
  ON public.social_user_blocks
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = blocker_user_id);

GRANT SELECT, INSERT, DELETE ON public.social_user_blocks TO authenticated;

-- A blocked author can no longer appear in the authenticated user's feed even
-- when another permissive social policy would normally expose the content.
DROP POLICY IF EXISTS "social_posts_blocked_authors_filter" ON public.social_posts;
CREATE POLICY "social_posts_blocked_authors_filter"
  ON public.social_posts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    author_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.social_user_blocks b
      WHERE b.blocker_user_id = (SELECT auth.uid())
        AND b.blocked_user_id = social_posts.author_id
    )
  );

DROP POLICY IF EXISTS "social_comments_blocked_authors_filter" ON public.social_post_comments;
CREATE POLICY "social_comments_blocked_authors_filter"
  ON public.social_post_comments
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.social_user_blocks b
      WHERE b.blocker_user_id = (SELECT auth.uid())
        AND b.blocked_user_id = social_post_comments.user_id
    )
  );

-- Reporting abusive UGC also blocks the reported author for that reporter.
-- This is intentionally idempotent and never permits blocking oneself.
CREATE OR REPLACE FUNCTION public.social_report_auto_block_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blocked_user_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NEW.reporter_id <> (SELECT auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.target_type = 'post' THEN
    SELECT p.author_id
      INTO v_blocked_user_id
      FROM public.social_posts p
     WHERE p.id = NEW.target_id;
  ELSIF NEW.target_type = 'comment' THEN
    SELECT c.user_id
      INTO v_blocked_user_id
      FROM public.social_post_comments c
     WHERE c.id = NEW.target_id;
  END IF;

  IF v_blocked_user_id IS NOT NULL AND v_blocked_user_id <> NEW.reporter_id THEN
    INSERT INTO public.social_user_blocks (
      blocker_user_id,
      blocked_user_id,
      reason
    ) VALUES (
      NEW.reporter_id,
      v_blocked_user_id,
      COALESCE(NEW.category, NEW.reason, 'reported_content')
    )
    ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_report_auto_block_author ON public.social_reports;
CREATE TRIGGER trg_social_report_auto_block_author
AFTER INSERT ON public.social_reports
FOR EACH ROW
EXECUTE FUNCTION public.social_report_auto_block_author();
