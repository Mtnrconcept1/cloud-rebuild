ALTER TABLE public.reservation_tables
  ADD COLUMN IF NOT EXISTS sector text;

ALTER TABLE public.reservation_tables
  ADD COLUMN IF NOT EXISTS layout jsonb;

UPDATE public.reservation_tables
SET sector = COALESCE(NULLIF(trim(sector), ''), 'Salle principale')
WHERE sector IS NULL OR trim(sector) = '';

UPDATE public.reservation_tables
SET layout = jsonb_build_object(
  'x', 72,
  'y', 72,
  'w', 176,
  'h', 112,
  'shape', 'round',
  'rotation', 0,
  'seat_labels', jsonb_build_array(2, 2)
)
WHERE layout IS NULL;

ALTER TABLE public.reservation_tables
  ALTER COLUMN sector SET DEFAULT 'Salle principale';

ALTER TABLE public.reservation_tables
  ALTER COLUMN layout SET DEFAULT jsonb_build_object(
    'x', 72,
    'y', 72,
    'w', 176,
    'h', 112,
    'shape', 'round',
    'rotation', 0,
    'seat_labels', jsonb_build_array(2, 2)
  );

CREATE INDEX IF NOT EXISTS idx_reservation_tables_branch_sector
  ON public.reservation_tables(branch_id, sector);

ALTER TABLE public.reservation_slots
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_slots_reservation_table
  ON public.reservation_slots(reservation_id, table_id);

CREATE OR REPLACE FUNCTION public.is_feature_flag_active(p_flag_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      RETURN public.is_feature_flag_active('livraison') OR public.is_feature_flag_active('emporter');
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
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('commandes');
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
$$;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES (
  'dashboard-plan-salle',
  'Dashboard plan de salle',
  'Active le plan de salle et le placement des reservations.',
  true
)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;
