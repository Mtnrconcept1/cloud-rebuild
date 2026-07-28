# Audit de candidature — TOK comme fournisseur de réservation Google

Audit de l'écart entre l'implémentation TOK et ce qu'exige Google Actions Center
(Reservations End-to-End) pour figurer parmi les fournisseurs du bouton
« Réserver » d'une fiche Google Business Profile.

> **Portée de vérification.** Tout ce qui concerne le code TOK a été vérifié
> ligne à ligne dans ce dépôt. En revanche `developers.google.com` est
> inaccessible depuis l'environnement de développement (blocage réseau), donc
> **les exigences Google n'ont pas pu être relues à la source**. Les exigences
> listées ici proviennent de `docs/integrations/google-actions-center.md`, écrit
> lorsque cette documentation était consultable. Elles doivent être reconfirmées
> sur les pages officielles avant toute candidature : Google fait évoluer ces
> spécifications, et une exigence périmée coûterait un cycle de revue.

## Verdict

L'intégration technique est **substantiellement avancée** : le Booking Server
expose les six routes v3 attendues, avec authentification, idempotence et
isolation RLS. Ce n'est pas une maquette.

Trois manques bloquent néanmoins une candidature : **les mises à jour temps réel
vers Google, le transport des feeds, et l'absence d'environnement sandbox
séparé**. Le premier est le plus structurant — il ne s'agit pas d'un réglage
mais d'un composant absent.

## 1. Booking Server — conforme

Les six routes sont implémentées et servies par
`supabase/functions/google-actions-center/index.ts` :

| Route | État |
|---|---|
| `GET /v3/HealthCheck/` | implémentée |
| `POST /v3/BatchAvailabilityLookup/` | implémentée |
| `POST /v3/CreateBooking/` | implémentée |
| `POST /v3/UpdateBooking/` | implémentée |
| `POST /v3/GetBookingStatus/` | implémentée |
| `POST /v3/ListBookings/` | implémentée |

Points solides relevés :

- **Idempotence réelle.** Table `google_actions_center_bookings` avec
  `idempotency_token`, `request_hash` et `response_payload` mémorisé : rejouer
  la même clé renvoie la même réponse, et une clé réutilisée avec un payload
  différent est rejetée. C'est exactement ce qu'attend un Booking Server.
- **Création via le chemin métier existant.** Les réservations Google passent
  par `validate_and_create_reservation_safe`, la même RPC que les réservations
  TOK. Google n'a donc pas de chemin d'écriture privilégié qui contournerait les
  validations de capacité.
- **Annulation gérée.** `UpdateBooking` traduit `CANCELED` en annulation TOK
  avec `cancelled_at`, `cancelled_by` et `cancellation_reason_code`.
- **Isolation.** La table Google est en RLS service-role uniquement, sans accès
  `anon` ni `authenticated`.

## 2. Mises à jour temps réel — **absentes (bloquant)**

Aucun appel sortant vers Google n'existe dans le code. Vérifié : aucune
occurrence de `mapsbooking`, `googleapis.com` ni d'appel `fetch` vers un
domaine Google dans la fonction.

C'est le manque le plus important. L'intégration est aujourd'hui **purement
passive** : elle répond quand Google interroge, mais ne signale jamais rien.
Or Google attend que le partenaire pousse :

- les **changements de disponibilité** entre deux livraisons de feed, sinon un
  créneau vendu par un autre canal reste proposé sur Google et produit un
  échec de réservation à l'arrivée ;
- les **notifications de réservation** lorsqu'une réservation d'origine Google
  est modifiée ou annulée côté TOK.

Sans cela, la fraîcheur des disponibilités dépend entièrement de la fréquence
des feeds. C'est précisément le critère sur lequel une intégration se fait
recaler en revue, parce qu'il produit des échecs visibles côté utilisateur
final.

**À construire** : un émetteur sortant authentifié auprès de l'API Google
(compte de service), appelé sur changement de disponibilité et sur transition
de statut de réservation.

## 3. Feeds — générés, mais non livrables

Les trois feeds sont produits et exportables :

| Feed | Route | Contenu vérifié |
|---|---|---|
| Merchant | `GET /v3/feeds/merchants` | `merchant_id`, `name`, `telephone`, `url`, `category`, `address`, `geo` |
| Service | `GET /v3/feeds/services` | service `tok-table-reservation` |
| Availability | `GET /v3/feeds/availability` | créneaux sur 30 jours, `duration_sec`, `party_size`, `resources` |

Un script `pnpm google:actions:feeds` écrit les trois `.json.gz` au format de
nommage attendu (`*_{timestamp}_001_of_001.json.gz`).

**Ce qui manque** : le transport. Google impose un dépôt (SFTP ou bucket
Cloud Storage) avec ses propres credentials et sa planification. Le dépôt le
documente comme volontairement hors périmètre tant que Google n'a pas fourni
ces éléments — c'est un choix défendable, mais cela reste une étape à faire, et
elle n'est pas automatisable avant l'invitation.

**Point d'attention sur le Merchant feed** : `merchant_id` utilise l'UUID
restaurant TOK. C'est cohérent, mais le rapprochement avec la fiche Google Maps
repose sur `google_place_id`, qui n'est renseigné **que s'il est disponible**.
Un restaurant pilote sans `google_place_id` sera mal apparié — à traiter avant
l'envoi du premier feed, pas après.

## 4. Prépaiement — déclaré non fourni

`GetBookingStatus` retourne `prepayment_status: PREPAYMENT_NOT_PROVIDED`.
Cohérent avec le périmètre actuel : TOK ne fait pas porter de prépaiement par
Google sur cette intégration. À confirmer comme choix assumé auprès de Google,
car il détermine la catégorie d'intégration demandée.

## 5. Sandbox — absent

La documentation prévoit une variable `GOOGLE_ACTIONS_CENTER_ENVIRONMENT=sandbox`
mais **aucun environnement séparé n'existe**. Google exige de valider en bac à
sable avant la revue de production.

Le risque concret : sans inventaire sandbox distinct, les tests Google
créeraient de vraies réservations chez de vrais restaurants. C'est à trancher
avant la phase de test, pas pendant.

## 6. Prérequis non techniques

Aucun n'est réalisable par le code, et tous conditionnent l'acceptation :

- **Mandat contractuel** de chaque restaurant autorisant TOK à recevoir et gérer
  des réservations en son nom. C'est la base juridique de toute l'intégration.
- **Inventaire pilote** suisse avec appariement Google Maps propre.
- **Conformité RGPD** : base légale, sous-traitance, conservation, suppression,
  consentement. Les données client transmises par Google atterrissent dans
  `reservations.metadata` et `google_actions_center_bookings.user_information` —
  ces deux emplacements doivent être couverts par la politique de rétention.
- **Candidature** via le Partner Interest Form ou un contact business Google.
  L'accès n'est pas libre-service : sans invitation, rien de ce qui précède
  n'est activable.

## 7. Observabilité — à mettre en place

Google évalue la qualité de service. Rien n'instrumente aujourd'hui
spécifiquement le Booking Server. À produire avant la revue :

- taux d'erreur et latence p95/p99 par endpoint ;
- taux d'échec de `CreateBooking` pour indisponibilité ;
- conflits d'idempotence ;
- fraîcheur des disponibilités.

Le socle existe : la fonction écrit déjà dans `edge_function_audit_logs`, et la
capture de diagnostics ajoutée récemment y verse le contexte d'erreur. Il reste
à en extraire des indicateurs.

## Séquence recommandée

L'ordre compte, parce que plusieurs étapes dépendent d'une invitation Google.

**Avant de candidater**
1. Sécuriser les mandats contractuels des restaurants pilotes.
2. Renseigner `google_place_id` sur chaque pilote et vérifier l'appariement Maps.
3. Construire l'émetteur de mises à jour temps réel — c'est le plus long, et il
   est indispensable en revue.
4. Instrumenter le Booking Server.

**Candidature**
5. Déposer le Partner Interest Form.

**Après invitation**
6. Configurer le compte, les credentials et le transport des feeds.
7. Monter l'environnement sandbox avec inventaire de test isolé.
8. Valider les six endpoints en sandbox, puis demander la revue de production.

## Ce qui reste incertain

Cet audit ne remplace pas une relecture des exigences officielles. Trois points
en particulier demandent confirmation à la source :

- le **mécanisme exact** des mises à jour temps réel et son authentification ;
- les **seuils de qualité** attendus (latence, disponibilité, taux d'échec) ;
- l'**éligibilité géographique** pour la Suisse et les conditions d'ouverture du
  programme, qui n'est pas en libre accès.
