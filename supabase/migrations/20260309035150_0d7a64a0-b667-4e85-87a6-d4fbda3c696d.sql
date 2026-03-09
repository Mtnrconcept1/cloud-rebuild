
CREATE OR REPLACE FUNCTION public.get_reservation_customers(p_restaurant_id uuid)
RETURNS TABLE(user_id uuid, full_name text, phone text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.user_id, p.full_name, p.phone
  FROM profiles p
  INNER JOIN reservations r ON r.user_id = p.user_id
  WHERE r.restaurant_id = p_restaurant_id
    AND EXISTS (
      SELECT 1 FROM restaurants rest
      WHERE rest.id = p_restaurant_id AND rest.owner_id = auth.uid()
    );
END;
$$;
