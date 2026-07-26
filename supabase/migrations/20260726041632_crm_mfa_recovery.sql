-- One-time, email-verified recovery for the TOK CRM TOTP factor.
--
-- Challenge rows are service-only. The browser receives only the challenge ID
-- and the destination email mask; verification codes are stored as hashes and
-- expire after ten minutes.

BEGIN;

CREATE TABLE public.crm_mfa_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts_remaining smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_mfa_recovery_code_hash_check
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT crm_mfa_recovery_attempts_check
    CHECK (attempts_remaining BETWEEN 0 AND 5),
  CONSTRAINT crm_mfa_recovery_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX crm_mfa_recovery_user_created_idx
  ON public.crm_mfa_recovery_challenges(user_id, created_at DESC);

CREATE INDEX crm_mfa_recovery_cleanup_idx
  ON public.crm_mfa_recovery_challenges(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.crm_mfa_recovery_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_mfa_recovery_challenges FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_mfa_recovery_challenges
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.crm_mfa_recovery_challenges
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_crm_mfa_recovery_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_code_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  challenge public.crm_mfa_recovery_challenges%ROWTYPE;
BEGIN
  SELECT recovery.*
  INTO challenge
  FROM public.crm_mfa_recovery_challenges AS recovery
  WHERE recovery.id = p_challenge_id
    AND recovery.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF challenge.consumed_at IS NOT NULL THEN
    RETURN 'consumed';
  END IF;

  IF challenge.expires_at <= now() THEN
    UPDATE public.crm_mfa_recovery_challenges
    SET attempts_remaining = 0
    WHERE id = challenge.id;
    RETURN 'expired';
  END IF;

  IF challenge.attempts_remaining <= 0 THEN
    RETURN 'locked';
  END IF;

  IF challenge.code_hash IS DISTINCT FROM lower(p_code_hash) THEN
    UPDATE public.crm_mfa_recovery_challenges
    SET attempts_remaining = greatest(attempts_remaining - 1, 0)
    WHERE id = challenge.id;
    RETURN 'invalid';
  END IF;

  UPDATE public.crm_mfa_recovery_challenges
  SET verified_at = COALESCE(verified_at, now())
  WHERE id = challenge.id;

  RETURN 'verified';
END
$function$;

REVOKE ALL ON FUNCTION public.consume_crm_mfa_recovery_challenge(
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_crm_mfa_recovery_challenge(
  uuid,
  uuid,
  text
) TO service_role;

COMMENT ON TABLE public.crm_mfa_recovery_challenges IS
  'Service-only email challenges used to recover access to the TOK CRM TOTP factor.';
COMMENT ON FUNCTION public.consume_crm_mfa_recovery_challenge(uuid, uuid, text) IS
  'Atomically validates, expires or decrements a service-only CRM MFA recovery challenge.';

DO $postflight$
DECLARE
  recovery_policy_count integer;
  helper_owner name;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'crm_mfa_recovery_challenges'
      AND relation.relrowsecurity IS TRUE
      AND relation.relforcerowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION
      'CRM MFA recovery challenges must have RLS enabled and forced';
  END IF;

  SELECT count(*)::integer
  INTO recovery_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'crm_mfa_recovery_challenges';

  IF recovery_policy_count <> 0 THEN
    RAISE EXCEPTION
      'CRM MFA recovery challenges must remain service-only, found % client policies',
      recovery_policy_count;
  END IF;

  IF has_table_privilege(
    'anon',
    'public.crm_mfa_recovery_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  ) OR has_table_privilege(
    'authenticated',
    'public.crm_mfa_recovery_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION
      'Client roles retain privileges on CRM MFA recovery challenges';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.crm_mfa_recovery_challenges',
    'SELECT,INSERT,UPDATE,DELETE'
  ) THEN
    RAISE EXCEPTION
      'service_role is missing CRM MFA recovery challenge privileges';
  END IF;

  SELECT owner.rolname
  INTO helper_owner
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner
    ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'consume_crm_mfa_recovery_challenge'
    AND pg_get_function_identity_arguments(procedure.oid)
      = 'p_challenge_id uuid, p_user_id uuid, p_code_hash text';

  IF helper_owner IS DISTINCT FROM 'postgres'::name THEN
    RAISE EXCEPTION
      'consume_crm_mfa_recovery_challenge owner drifted to %',
      helper_owner;
  END IF;

  IF has_function_privilege(
    'anon',
    'public.consume_crm_mfa_recovery_challenge(uuid,uuid,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.consume_crm_mfa_recovery_challenge(uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.consume_crm_mfa_recovery_challenge(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'CRM MFA recovery helper privileges are not service-only';
  END IF;
END
$postflight$;

COMMIT;
