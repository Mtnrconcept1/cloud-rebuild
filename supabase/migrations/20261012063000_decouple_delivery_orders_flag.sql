-- Decouple the delivery-orders commercial switch from shared Stripe payments and
-- historical order tracking. Preserve the deployed RPC privileges and audit trail.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_feature_flag_active(p_flag_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag_name text := lower(trim(COALESCE(p_flag_name, '')));
  v_is_active boolean;
BEGIN
  IF v_flag_name = '' THEN
    RETURN false;
  END IF;

  SELECT ff.is_active
  INTO v_is_active
  FROM public.feature_flags ff
  WHERE lower(ff.name) = v_flag_name
  LIMIT 1;

  IF v_is_active IS NULL THEN
    RETURN true;
  END IF;

  IF NOT v_is_active THEN
    RETURN false;
  END IF;

  CASE v_flag_name
    WHEN 'commandes' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'anti-gaspi' THEN
      RETURN public.is_feature_flag_active('emporter');
    WHEN 'creneaux-garantis' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'flex-prix-bas' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'match-groupes' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'multi-stop' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'multi-restaurant' THEN
      RETURN public.is_feature_flag_active('livraison') OR public.is_feature_flag_active('emporter');
    WHEN 'zero-attente' THEN
      RETURN public.is_feature_flag_active('reservation') AND public.is_feature_flag_active('sur-place');
    WHEN 'garantie-qualite' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'abonnement' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'dashboard-overview' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-advisor' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-restaurant' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-menu' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-photos' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-commandes' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-reservations' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('reservation');
    WHEN 'dashboard-plan-salle' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-recommandations' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-performances' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('performances');
    WHEN 'dashboard-comparaison' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('performances');
    WHEN 'dashboard-avis' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-campagne-overview' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-reseaux-sociaux' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-campagnes' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-factures' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-factures-parametres' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-offres' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('anti-gaspi');
    WHEN 'dashboard-ventes-flash' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('ventes-flash');
    WHEN 'dashboard-formules' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-service' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-support' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-promotions' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'courier-home' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-jobs' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-earnings' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-profile' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    ELSE
      RETURN true;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(p_flag_name text, p_is_active boolean, p_reason text DEFAULT NULL::text, p_preset_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_previous boolean;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage feature flags';
  END IF;

  SELECT is_active INTO v_previous
  FROM public.feature_flags
  WHERE name = p_flag_name;

  IF p_is_active IS FALSE
    AND p_flag_name IN (
      'livraison',
      'commandes',
      'emporter',
      'reservation',
      'payment-card',
      'dashboard-restaurateur',
      'dashboard-pack',
      'espace-livreur'
    )
    AND v_reason IS NULL
  THEN
    RAISE EXCEPTION 'reason is required for critical feature flag disable';
  END IF;

  IF p_flag_name = 'actualites-sociales' AND p_is_active IS TRUE AND EXISTS (
    SELECT 1 FROM public.feature_flags WHERE name = 'tracking' AND is_active = false
  ) THEN
    RAISE EXCEPTION 'actualites-sociales requires tracking';
  END IF;

  UPDATE public.feature_flags
  SET is_active = p_is_active,
      updated_at = now()
  WHERE name = p_flag_name;

  IF NOT FOUND THEN
    INSERT INTO public.feature_flags (name, label, description, is_active)
    VALUES (p_flag_name, p_flag_name, 'Flag cree depuis la gouvernance admin.', p_is_active);
  END IF;

  INSERT INTO public.feature_flag_audit_logs (
    flag_name,
    previous_state,
    new_state,
    reason,
    preset_name,
    admin_user_id,
    metadata
  )
  VALUES (
    p_flag_name,
    v_previous,
    p_is_active,
    v_reason,
    NULLIF(trim(COALESCE(p_preset_name, '')), ''),
    auth.uid(),
    jsonb_build_object('source', 'admin_platform_config')
  );
END;
$function$;

COMMIT;
