-- Cartes de menu saisonnières (carte d'hiver, carte d'automne, ...).
--
-- Un restaurant peut préparer plusieurs cartes et n'en activer qu'une à la fois.
-- Les plats d'une carte inactive restent en base mais deviennent
-- automatiquement indisponibles (`is_available = false`). Ainsi, la policy
-- publique `menu_items_public_select`, le checkout (`order-pricing`) et toutes
-- les Edge Functions qui filtrent déjà sur `is_available` suivent la carte
-- active sans modification.
--
-- `available_on_card` conserve la disponibilité voulue par le restaurateur
-- (plat épuisé ou non) afin de la restaurer quand la carte est réactivée.
--
-- Migration additive : aucune donnée n'est supprimée. Tant qu'un restaurant
-- n'a créé aucune carte, `menu_card_id` reste NULL et le comportement est
-- strictement identique à l'existant.

-- 1. Table des cartes ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurant_menu_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  activated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_menu_cards_name_length_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT restaurant_menu_cards_restaurant_id_id_key UNIQUE (restaurant_id, id)
);

COMMENT ON TABLE public.restaurant_menu_cards IS
  'Cartes de menu d''un restaurant. Une seule carte active à la fois ; les plats des cartes inactives sont indisponibles.';

-- Une seule carte active par restaurant, garanti par la base.
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_menu_cards_one_active_idx
  ON public.restaurant_menu_cards (restaurant_id)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_menu_cards_name_unique_idx
  ON public.restaurant_menu_cards (restaurant_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS restaurant_menu_cards_restaurant_created_idx
  ON public.restaurant_menu_cards (restaurant_id, created_at);

-- 2. Rattachement des plats -----------------------------------------------------

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS menu_card_id uuid,
  ADD COLUMN IF NOT EXISTS available_on_card boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.menu_items.menu_card_id IS
  'Carte de menu du plat. NULL = restaurant sans carte (comportement historique).';
COMMENT ON COLUMN public.menu_items.available_on_card IS
  'Disponibilité voulue par le restaurateur. is_available = available_on_card ET carte active.';

-- La disponibilité voulue reprend l'état actuel (un plat épuisé le reste).
UPDATE public.menu_items
SET available_on_card = coalesce(is_available, true)
WHERE available_on_card IS DISTINCT FROM coalesce(is_available, true);

-- La clé composite empêche de rattacher un plat à la carte d'un autre restaurant.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_items_menu_card_same_restaurant_fkey'
      AND conrelid = 'public.menu_items'::regclass
  ) THEN
    ALTER TABLE public.menu_items
      ADD CONSTRAINT menu_items_menu_card_same_restaurant_fkey
      FOREIGN KEY (restaurant_id, menu_card_id)
      REFERENCES public.restaurant_menu_cards (restaurant_id, id);
  END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS menu_items_menu_card_id_idx
  ON public.menu_items (menu_card_id)
  WHERE menu_card_id IS NOT NULL;

-- 3. Disponibilité effective imposée en base ----------------------------------

CREATE OR REPLACE FUNCTION public.menu_items_apply_menu_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card_active boolean;
  v_active_card_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.available_on_card := coalesce(NEW.available_on_card, true) AND coalesce(NEW.is_available, true);

    -- Un plat créé sans carte (dashboard, IA, Edge Functions) rejoint la carte active.
    IF NEW.menu_card_id IS NULL THEN
      SELECT c.id INTO v_active_card_id
      FROM public.restaurant_menu_cards c
      WHERE c.restaurant_id = NEW.restaurant_id AND c.is_active
      LIMIT 1;
      NEW.menu_card_id := v_active_card_id;
    END IF;
  ELSE
    IF NEW.available_on_card IS DISTINCT FROM OLD.available_on_card THEN
      NEW.available_on_card := coalesce(NEW.available_on_card, true);
    ELSIF NEW.is_available IS DISTINCT FROM OLD.is_available THEN
      -- Écrivains historiques qui ne connaissent que is_available.
      NEW.available_on_card := coalesce(NEW.is_available, true);
    END IF;
  END IF;

  IF NEW.menu_card_id IS NULL THEN
    v_card_active := true;
  ELSE
    SELECT c.is_active INTO v_card_active
    FROM public.restaurant_menu_cards c
    WHERE c.id = NEW.menu_card_id AND c.restaurant_id = NEW.restaurant_id;
    v_card_active := coalesce(v_card_active, false);
  END IF;

  NEW.is_available := NEW.available_on_card AND v_card_active;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.menu_items_apply_menu_card() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS menu_items_apply_menu_card ON public.menu_items;
CREATE TRIGGER menu_items_apply_menu_card
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.menu_items_apply_menu_card();

-- 4. RLS -------------------------------------------------------------------------

ALTER TABLE public.restaurant_menu_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_menu_cards_owner_select ON public.restaurant_menu_cards;
CREATE POLICY restaurant_menu_cards_owner_select
  ON public.restaurant_menu_cards
  FOR SELECT TO authenticated
  USING (public.auth_owns_restaurant(restaurant_id));

DROP POLICY IF EXISTS restaurant_menu_cards_admin_select ON public.restaurant_menu_cards;
CREATE POLICY restaurant_menu_cards_admin_select
  ON public.restaurant_menu_cards
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Seule une carte inactive peut être supprimée. La clé étrangère des plats
-- refuse la suppression d'une carte qui contient encore des plats.
DROP POLICY IF EXISTS restaurant_menu_cards_owner_delete_inactive ON public.restaurant_menu_cards;
CREATE POLICY restaurant_menu_cards_owner_delete_inactive
  ON public.restaurant_menu_cards
  FOR DELETE TO authenticated
  USING (
    public.auth_owns_restaurant(restaurant_id)
    AND NOT is_active
    AND NOT public.commercial_demo_current_user_is_restricted()
  );

DROP POLICY IF EXISTS tok_connect_oauth_isolation ON public.restaurant_menu_cards;
CREATE POLICY tok_connect_oauth_isolation
  ON public.restaurant_menu_cards
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((SELECT public.tok_connect_oauth_request_allowed()))
  WITH CHECK ((SELECT public.tok_connect_oauth_request_allowed()));

-- Création et activation passent uniquement par les RPC ci-dessous.
REVOKE ALL ON TABLE public.restaurant_menu_cards FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.restaurant_menu_cards TO authenticated;
GRANT ALL ON TABLE public.restaurant_menu_cards TO service_role;

-- 5. RPC -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_restaurant_menu_card(p_restaurant_id uuid, p_name text)
RETURNS public.restaurant_menu_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_main_card_id uuid;
  v_card public.restaurant_menu_cards;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.tok_connect_oauth_request_allowed()
    OR public.commercial_demo_current_user_is_restricted()
    OR NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'menu_card_forbidden' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'menu_card_name_required' USING ERRCODE = '22023';
  END IF;

  -- Sérialise les opérations de cartes d'un même restaurant.
  PERFORM 1 FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;

  IF (SELECT count(*) FROM public.restaurant_menu_cards WHERE restaurant_id = p_restaurant_id) >= 20 THEN
    RAISE EXCEPTION 'menu_card_limit_reached' USING ERRCODE = '22023';
  END IF;

  -- Première carte : la carte actuelle devient « Carte principale » (active)
  -- et récupère tous les plats existants. Rien ne change côté client.
  IF NOT EXISTS (SELECT 1 FROM public.restaurant_menu_cards WHERE restaurant_id = p_restaurant_id) THEN
    INSERT INTO public.restaurant_menu_cards (restaurant_id, name, is_active, activated_at, activated_by)
    VALUES (p_restaurant_id, 'Carte principale', true, now(), auth.uid())
    RETURNING id INTO v_main_card_id;
  ELSE
    SELECT id INTO v_main_card_id
    FROM public.restaurant_menu_cards
    WHERE restaurant_id = p_restaurant_id AND is_active;
  END IF;

  IF v_main_card_id IS NOT NULL THEN
    UPDATE public.menu_items
    SET menu_card_id = v_main_card_id
    WHERE restaurant_id = p_restaurant_id AND menu_card_id IS NULL;
  END IF;

  BEGIN
    INSERT INTO public.restaurant_menu_cards (restaurant_id, name, is_active)
    VALUES (p_restaurant_id, v_name, false)
    RETURNING * INTO v_card;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'menu_card_name_taken' USING ERRCODE = '23505';
  END;

  RETURN v_card;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_restaurant_menu_card(p_card_id uuid)
RETURNS public.restaurant_menu_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restaurant_id uuid;
  v_previous_card_id uuid;
  v_card public.restaurant_menu_cards;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.restaurant_menu_cards
  WHERE id = p_card_id;

  IF v_restaurant_id IS NULL
    OR auth.uid() IS NULL
    OR NOT public.tok_connect_oauth_request_allowed()
    OR public.commercial_demo_current_user_is_restricted()
    OR NOT public.auth_owns_restaurant(v_restaurant_id) THEN
    RAISE EXCEPTION 'menu_card_forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.restaurants WHERE id = v_restaurant_id FOR UPDATE;

  SELECT id INTO v_previous_card_id
  FROM public.restaurant_menu_cards
  WHERE restaurant_id = v_restaurant_id AND is_active;

  IF v_previous_card_id = p_card_id THEN
    SELECT * INTO v_card FROM public.restaurant_menu_cards WHERE id = p_card_id;
    RETURN v_card;
  END IF;

  UPDATE public.restaurant_menu_cards
  SET is_active = false, updated_at = now()
  WHERE restaurant_id = v_restaurant_id AND is_active;

  UPDATE public.restaurant_menu_cards
  SET is_active = true, activated_at = now(), activated_by = auth.uid(), updated_at = now()
  WHERE id = p_card_id
  RETURNING * INTO v_card;

  -- Recalcule la disponibilité effective de tous les plats via le trigger.
  -- Un éventuel plat sans carte rejoint l'ancienne carte active.
  UPDATE public.menu_items
  SET menu_card_id = coalesce(menu_card_id, v_previous_card_id)
  WHERE restaurant_id = v_restaurant_id;

  RETURN v_card;
END;
$$;

REVOKE ALL ON FUNCTION public.create_restaurant_menu_card(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_restaurant_menu_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_restaurant_menu_card(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_restaurant_menu_card(uuid) TO authenticated, service_role;
