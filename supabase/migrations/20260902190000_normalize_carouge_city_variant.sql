-- Carouge est publié sous deux orthographes de ville, « Carouge » et « Carouge GE ». La commune est
-- donc scindée en deux pages locales concurrentes (/restaurants/carouge et /restaurants/carouge-ge)
-- et en deux jeux d'URL de fiches, ce qui divise l'inventaire et le signal de la requête
-- « restaurant Carouge ». Cette migration réunit la commune sous « Carouge ».
--
-- Quelques établissements existent des deux côtés avec le même slug, issus du même import du
-- 2026-08-31 avec une abréviation d'adresse différente. L'index unique idx_restaurants_city_slug_unique
-- porte sur (lower(city), slug) SANS filtre sur is_active : renommer ces fiches ferait échouer la
-- migration. Elles sont donc fusionnées avant la normalisation, et la jumelle désactivée conserve son
-- ancienne ville pour ne pas entrer en collision avec la fiche conservée.
--
-- La même normalisation est appliquée à Vandœuvres/Vandoeuvres, scindée par une ligature.
--
-- Migration additive et réversible : aucune ligne n'est supprimée, la désactivation est un soft delete.

BEGIN;

-- Fiches présentes sous les deux orthographes : même slug, donc même établissement.
-- La fiche « Carouge » est conservée car elle porte le nom commercial vérifié, tandis que la jumelle
-- « Carouge GE » porte une variante issue du registre ou du site web (raison sociale, nom de domaine).
CREATE TEMP TABLE carouge_duplicate_pairs ON COMMIT DROP AS
SELECT kept.id AS kept_id, dropped.id AS dropped_id
FROM public.restaurants kept
JOIN public.restaurants dropped
  ON dropped.slug = kept.slug
 AND dropped.id <> kept.id
WHERE kept.city = 'Carouge'
  AND dropped.city = 'Carouge GE'
  AND kept.is_active
  AND dropped.is_active;

-- 1. Conserver les cuisines vérifiées que seule la jumelle portait.
INSERT INTO public.restaurant_cuisines (restaurant_id, cuisine_id)
SELECT pair.kept_id, link.cuisine_id
FROM carouge_duplicate_pairs pair
JOIN public.restaurant_cuisines link ON link.restaurant_id = pair.dropped_id
ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING;

-- 2. Reprendre le téléphone public que seule la jumelle renseignait. Même établissement, même
--    adresse : la donnée est réelle, elle n'est ni déduite ni inventée.
UPDATE public.restaurants kept
SET phone = dropped.phone,
    updated_at = now()
FROM carouge_duplicate_pairs pair
JOIN public.restaurants dropped ON dropped.id = pair.dropped_id
WHERE kept.id = pair.kept_id
  AND COALESCE(btrim(kept.phone), '') = ''
  AND COALESCE(btrim(dropped.phone), '') <> '';

-- 3. Désactiver la jumelle : une seule fiche par établissement reste publiable.
UPDATE public.restaurants
SET is_active = false,
    updated_at = now()
WHERE id IN (SELECT dropped_id FROM carouge_duplicate_pairs);

-- 4. Réunir la commune sous une seule orthographe. Le NOT EXISTS protège l'index unique contre tout
--    slug déjà pris côté « Carouge », y compris par une fiche inactive.
UPDATE public.restaurants target
SET city = 'Carouge',
    updated_at = now()
WHERE target.city = 'Carouge GE'
  AND target.is_active
  AND NOT EXISTS (
    SELECT 1
    FROM public.restaurants other
    WHERE other.id <> target.id
      AND lower(COALESCE(other.city, '')) = 'carouge'
      AND other.slug = target.slug
  );

-- 5. Même symptôme, autre cause : « Vandœuvres » et « Vandoeuvres » sont la même commune, et la
--    ligature ne se décompose pas en NFD — elle produisait le slug cassé « vand-uvres ». Aucune fiche
--    n'existe des deux côtés, la fusion est donc directe. Le code sait désormais lire les deux
--    orthographes ; cette normalisation garantit en plus un libellé unique dans les pages locales.
UPDATE public.restaurants target
SET city = 'Vandoeuvres',
    updated_at = now()
WHERE target.city = 'Vandœuvres'
  AND target.is_active
  AND NOT EXISTS (
    SELECT 1
    FROM public.restaurants other
    WHERE other.id <> target.id
      AND lower(COALESCE(other.city, '')) = 'vandoeuvres'
      AND other.slug = target.slug
  );

COMMIT;
