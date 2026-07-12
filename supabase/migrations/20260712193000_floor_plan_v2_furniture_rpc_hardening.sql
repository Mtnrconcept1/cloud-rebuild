-- Keep the low-level furniture writer private; the authenticated client uses the
-- atomic workspace RPC, which validates the complete table + furniture payload.
REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_furniture(uuid, jsonb, uuid[], text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, uuid[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_save_floor_plan_workspace(uuid, jsonb, uuid[], jsonb, uuid[], text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
