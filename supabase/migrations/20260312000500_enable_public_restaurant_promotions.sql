DROP POLICY IF EXISTS "Anyone can view active promotions" ON public.restaurant_promotions;
CREATE POLICY "Anyone can view active promotions" ON public.restaurant_promotions
FOR SELECT
USING (active = true);
