-- Permet a un administrateur d'attribuer le role commercial depuis l'onglet
-- Utilisateurs, et active ce role pour rbarman@hotmail.ch.
--
-- Le garde-fou posait deux conditions a l'attribution : etre administrateur,
-- et que la cible possede un compte actif dans commercial_demo_accounts. La
-- premiere est une vraie protection et reste inchangee. La seconde confond
-- deux notions distinctes.
--
-- « Commercial » est un role metier reel : admin_set_user_roles lui ouvre un
-- profil de remuneration, et le produit suit ses commissions, ses signatures
-- et sa compensation. commercial_demo_accounts, lui, ne decrit que les comptes
-- de demonstration isoles. Exiger un compte de demo pour tout commercial
-- rendait donc impossible la creation d'un commercial reel — l'onglet
-- Utilisateurs echouait sur 23514 alors que la RPC etait faite pour ca.
--
-- L'etat de la base le montrait deja : cinq porteurs du role pour un seul
-- compte de demo. Le garde-fou interdisait de reproduire ce que la production
-- contenait deja.
--
-- L'isolation des comptes de demo n'est pas affaiblie : elle repose sur
-- commercial_demo_accounts et ses propres regles, pas sur ce trigger.

CREATE OR REPLACE FUNCTION public.guard_commercial_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
  THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'commercial'::public.app_role THEN
    -- Seule condition conservee : le role reste reserve a une decision
    -- administrateur. Un utilisateur ne peut pas se l'attribuer lui-meme.
    IF NOT (v_is_service_role OR v_is_admin) THEN
      RAISE EXCEPTION 'Commercial accounts are administrator-managed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

-- Active le role pour rbarman@hotmail.ch, en passant par les memes ecritures
-- que la RPC d'administration : le role, puis son profil de remuneration.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'rbarman@hotmail.ch' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'rbarman@hotmail.ch absent : role commercial non attribue.';
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'commercial'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.commercial_compensation_profiles (
    user_id,
    status,
    sprint_started_at,
    employment_active
  )
  VALUES (v_user_id, 'sprint', CURRENT_DATE, false)
  ON CONFLICT (user_id) DO UPDATE
  SET
    status = CASE
      WHEN public.commercial_compensation_profiles.status = 'inactive' THEN 'sprint'
      ELSE public.commercial_compensation_profiles.status
    END,
    updated_at = now();
END;
$$;

NOTIFY pgrst, 'reload schema';
