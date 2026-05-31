-- Match Groupes production rules:
-- - fixed 30-minute countdown
-- - 0% start, +5% per prepaid participant
-- - 50% max discount, 10 prepaid participants max
-- - clients authorize/prepay immediately; final amount is captured after countdown
--
-- NOTE:
-- This migration was already applied on Supabase production in the conversation.
-- Keep this file in Git so the repository and database history stay aligned.

ALTER TABLE public.order_groups
  ALTER COLUMN min_discount_percentage SET DEFAULT 0,
  ALTER COLUMN max_discount_percentage SET DEFAULT 50,
  ALTER COLUMN discount_step_percentage SET DEFAULT 5;

UPDATE public.order_groups
SET
  min_discount_percentage = 0,
  max_discount_percentage = 50,
  discount_step_percentage = 5,
  max_members = LEAST(GREATEST(COALESCE(max_members, 10), 2), 10),
  discount_percentage = CASE
    WHEN status = 'open' THEN LEAST(50, GREATEST(0, COALESCE(discount_percentage, 0)))
    ELSE discount_percentage
  END
WHERE status IN ('open', 'locked', 'payment_pending');

NOTIFY pgrst, 'reload schema';
