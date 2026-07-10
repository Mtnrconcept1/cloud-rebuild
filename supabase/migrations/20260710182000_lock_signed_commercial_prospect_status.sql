-- Lock status changes for signed commercial prospects.
-- Once a prospect is marked as signed, only the signing commercial or an admin
-- may move it to another pipeline status. Enforcement is database-side so it
-- cannot be bypassed by calling Supabase directly.

CREATE OR REPLACE FUNCTION public.enforce_signed_commercial_prospect_status_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Trusted backend operations must remain possible.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor_id
      AND ur.role::text = 'admin'
  )
  INTO v_is_admin;

  -- A commercial creating the signature must own it. Admins may assign or
  -- repair ownership explicitly.
  IF OLD.status IS DISTINCT FROM 'signed'::public.commercial_visit_status
     AND NEW.status = 'signed'::public.commercial_visit_status
     AND NOT v_is_admin
     AND NEW.signed_by IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'La signature doit être attribuée au commercial connecté.';
  END IF;

  -- After signature, only its owner or an admin may change the pipeline status.
  IF OLD.status = 'signed'::public.commercial_visit_status
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT v_is_admin
     AND OLD.signed_by IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Seul le commercial signataire ou un administrateur peut modifier le statut de ce restaurant.';
  END IF;

  -- Preserve ownership of the signature. A commercial cannot transfer or erase
  -- signed_by to gain access or hand the record to another account.
  IF OLD.status = 'signed'::public.commercial_visit_status
     AND NEW.signed_by IS DISTINCT FROM OLD.signed_by
     AND NOT v_is_admin THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Seul un administrateur peut modifier le commercial signataire.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_signed_commercial_prospect_status_owner
  ON public.commercial_prospect_followups;

CREATE TRIGGER enforce_signed_commercial_prospect_status_owner
  BEFORE UPDATE ON public.commercial_prospect_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signed_commercial_prospect_status_owner();

REVOKE ALL ON FUNCTION public.enforce_signed_commercial_prospect_status_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_signed_commercial_prospect_status_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_signed_commercial_prospect_status_owner() TO service_role;

COMMENT ON FUNCTION public.enforce_signed_commercial_prospect_status_owner() IS
  'Prevents status changes after a commercial signature unless the actor is the signing commercial or an admin.';
