-- Replay for room-plan AI: the private table must remain invisible to PostgREST.
-- The Edge Function authenticates the user and checks restaurant/branch scope.
CREATE OR REPLACE FUNCTION public.floorplan_ai_read_operation(
  p_actor_id uuid, p_branch_id uuid, p_operation_kind text, p_request_id text
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT operation.response
  FROM private.floor_plan_save_operations AS operation
  WHERE operation.actor_id = p_actor_id AND operation.branch_id = p_branch_id
    AND operation.operation_kind = p_operation_kind
    AND operation.request_id = p_request_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.floorplan_ai_save_operation(
  p_actor_id uuid, p_branch_id uuid, p_operation_kind text, p_request_id text,
  p_request_payload jsonb, p_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  saved_payload jsonb;
  saved_response jsonb;
BEGIN
  IF p_actor_id IS NULL OR p_branch_id IS NULL
     OR p_operation_kind IS NULL OR length(p_operation_kind) NOT BETWEEN 1 AND 64
     OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 100
     OR jsonb_typeof(p_request_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_response) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'floorplan_ai_invalid_operation';
  END IF;

  -- The primary key is the replay guard. First persisted result wins.
  INSERT INTO private.floor_plan_save_operations (
    actor_id, branch_id, operation_kind, request_id, request_payload, response
  ) VALUES (
    p_actor_id, p_branch_id, p_operation_kind, p_request_id, p_request_payload, p_response
  )
  ON CONFLICT (actor_id, branch_id, operation_kind, request_id) DO NOTHING;

  SELECT operation.request_payload, operation.response
    INTO saved_payload, saved_response
  FROM private.floor_plan_save_operations AS operation
  WHERE operation.actor_id = p_actor_id AND operation.branch_id = p_branch_id
    AND operation.operation_kind = p_operation_kind
    AND operation.request_id = p_request_id;

  IF saved_payload IS DISTINCT FROM p_request_payload THEN
    RAISE EXCEPTION 'floorplan_ai_request_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN saved_response;
END;
$$;

REVOKE ALL ON FUNCTION public.floorplan_ai_read_operation(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.floorplan_ai_save_operation(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.floorplan_ai_read_operation(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.floorplan_ai_save_operation(uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
