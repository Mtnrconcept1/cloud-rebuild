-- Facture le forfait a l'arrivee, et bascule les tables oubliees.
--
-- Quand « Mon pack » est coupe, le frais ne depend plus du chiffre d'affaires :
-- il vaut 5.- des que la table est honoree. L'etape de cloture n'a donc plus
-- rien a calculer, et faire saisir un montant pour aboutir a une constante
-- ajoutait un geste sans effet. C'est desormais le passage en « arrived » qui
-- declenche la facturation.
--
-- Une table oubliee ne doit pas echapper au frais : une heure apres l'horaire
-- reserve, une reservation encore en attente passe d'elle-meme en « arrived »
-- et est facturee. Le restaurateur garde la main pour annuler et se justifier
-- aupres de TOK, ce que la trace d'auto-bascule permet de distinguer d'une
-- arrivee constatee.
--
-- Rien de tout cela ne s'applique en mode Fair Growth : le parcours de cloture
-- y reste necessaire, puisque le montant depend du couvert.

-- Le declencheur doit s'executer AVANT set_reservation_fair_growth_snapshot,
-- qui refuse toute ecriture de billing_fee_chf hors du garde
-- app.fair_growth_mark_honored. Les triggers d'un meme evenement se declenchent
-- par ordre alphabetique : « apply_ » precede « set_ ».
CREATE OR REPLACE FUNCTION private_finance.apply_flat_reservation_fee_on_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_flat_arrival_billing_candidate(NEW.status, OLD.status, NEW.honored_at) THEN
    RETURN NEW;
  END IF;

  IF NOT private_finance.flat_reservation_billing_active() THEN
    RETURN NEW;
  END IF;

  -- Le garde de snapshot laisse passer l'ecriture uniquement sous ce reglage,
  -- pose ici parce que l'honoration se fait desormais a l'arrivee.
  PERFORM set_config('app.fair_growth_mark_honored', 'on', true);

  NEW.honored_at := COALESCE(NEW.honored_at, now());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  NEW.attributed_table_revenue_chf := COALESCE(NEW.attributed_table_revenue_chf, 0);
  NEW.billing_fee_chf := 5;

  INSERT INTO public.reservation_flat_fee_charges (
    reservation_id,
    restaurant_id,
    acquisition_source_snapshot,
    honored_at_snapshot,
    attributed_revenue_cents_snapshot,
    fee_cents
  )
  VALUES (
    NEW.id,
    NEW.restaurant_id,
    COALESCE(NULLIF(btrim(NEW.acquisition_source), ''), 'unknown'),
    NEW.honored_at,
    GREATEST(round(COALESCE(NEW.attributed_table_revenue_chf, 0) * 100)::integer, 0),
    500
  )
  ON CONFLICT (reservation_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private_finance.apply_flat_reservation_fee_on_arrival()
  FROM PUBLIC, anon, authenticated;

/**
 * Vrai lorsqu'une transition merite la facturation forfaitaire.
 *
 * Isolee pour rester lisible et testable : une table deja honoree ne doit pas
 * etre refacturee, et seul le franchissement vers « arrived » compte — repasser
 * d'un statut ulterieur ne redeclenche rien.
 */
CREATE OR REPLACE FUNCTION public.is_flat_arrival_billing_candidate(
  p_new_status text,
  p_old_status text,
  p_honored_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_honored_at IS NULL
    AND COALESCE(p_new_status, '') IN ('arrived', 'seated', 'completed')
    AND COALESCE(p_old_status, '') NOT IN ('arrived', 'seated', 'completed');
$$;

DROP TRIGGER IF EXISTS apply_flat_reservation_fee_on_arrival ON public.reservations;
CREATE TRIGGER apply_flat_reservation_fee_on_arrival
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION private_finance.apply_flat_reservation_fee_on_arrival();

/**
 * Bascule en « arrived » les reservations laissees en attente.
 *
 * Une heure apres l'horaire reserve, une table encore ni arrivee ni annulee est
 * consideree comme honoree. La trace dans metadata distingue cette bascule
 * d'une arrivee constatee par le restaurateur, qui peut ensuite annuler et se
 * justifier aupres de TOK.
 *
 * Sans effet en mode Fair Growth : le montant y depend du couvert, qu'aucune
 * bascule automatique ne peut connaitre.
 */
CREATE OR REPLACE FUNCTION public.auto_arrive_overdue_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT private_finance.flat_reservation_billing_active() THEN
    RETURN 0;
  END IF;

  WITH due AS (
    SELECT reservation.id
    FROM public.reservations reservation
    WHERE reservation.honored_at IS NULL
      AND COALESCE(reservation.status, '') IN ('pending', 'confirmed')
      AND reservation.cancelled_by IS NULL
      AND (reservation.date + reservation.time) <= (now() AT TIME ZONE 'Europe/Zurich') - interval '1 hour'
      -- Bornee a la veille : une reservation tres ancienne relevé d'une
      -- reprise manuelle, pas d'une bascule silencieuse.
      AND reservation.date >= (now() AT TIME ZONE 'Europe/Zurich')::date - 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.reservations reservation
  SET
    status = 'arrived',
    metadata = COALESCE(reservation.metadata, '{}'::jsonb)
      || jsonb_build_object('auto_arrived_at', now(), 'auto_arrived_reason', 'no_restaurant_action_within_one_hour')
  FROM due
  WHERE reservation.id = due.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_arrive_overdue_reservations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_arrive_overdue_reservations() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('tok-auto-arrive-overdue-reservations') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-auto-arrive-overdue-reservations'
  );

  -- Toutes les dix minutes : assez fin pour que le retard reste proche d'une
  -- heure, assez espace pour ne pas scanner en continu.
  PERFORM cron.schedule(
    'tok-auto-arrive-overdue-reservations',
    '*/10 * * * *',
    'SELECT public.auto_arrive_overdue_reservations();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
