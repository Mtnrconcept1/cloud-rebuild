-- Fix social_post_comments RLS recursion introduced by checking parent comments
-- from the social_post_comments insert policy itself. PostgreSQL evaluates RLS on
-- the subquery against the same table, which can recursively re-enter the policy.

DROP POLICY IF EXISTS "social_comments_insert" ON public.social_post_comments;

CREATE POLICY "social_comments_insert"
  ON public.social_post_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.id = post_id
        AND p.status = 'published'
    )
  );
