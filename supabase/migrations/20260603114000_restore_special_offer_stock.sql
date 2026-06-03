CREATE OR REPLACE FUNCTION public.restore_special_offer_stock(
  p_table text,
  p_id uuid,
  p_qty integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer := 0;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_table = 'anti_waste_offers' THEN
    UPDATE public.anti_waste_offers
    SET quantity_available = quantity_available + p_qty,
        is_active = CASE WHEN quantity_available + p_qty > 0 THEN true ELSE is_active END
    WHERE id = p_id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  ELSIF p_table = 'flash_sales' THEN
    UPDATE public.flash_sales
    SET quantity_available = quantity_available + p_qty,
        is_active = CASE WHEN quantity_available + p_qty > 0 THEN true ELSE is_active END
    WHERE id = p_id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Unknown table: %', p_table;
  END IF;

  RETURN rows_affected > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_special_offer_stock(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_special_offer_stock(text, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
