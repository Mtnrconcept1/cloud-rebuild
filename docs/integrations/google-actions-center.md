# Google Actions Center / Reserve with Google

Objectif: préparer TOK pour une candidature comme fournisseur officiel de réservation restaurant dans Google Actions Center, tout en gardant la voie rapide Google Business Profile par lien direct.

## État local prêt

- URL canonique par restaurant: `https://www.thetok.ch/r/{booking_slug}/reserver`.
- Ancien raccourci `/r/{booking_slug}` conservé pour ne pas casser les liens déjà copiés.
- Fonction Edge `google-actions-center` ajoutée comme Booking Server initial.
- Endpoint public Supabase cible: `/functions/v1/google-actions-center/v3/...`.
- Authentification Booking Server: Basic Auth via `GOOGLE_ACTIONS_CENTER_USERNAME` et `GOOGLE_ACTIONS_CENTER_PASSWORD`.
- Création de réservation: RPC existante `validate_and_create_reservation_safe`, avec attribution interne par `GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID`.
- Idempotence: table `google_actions_center_bookings` avec `google_booking_id`, `idempotency_token`, `request_hash` et `response_payload`.
- Sécurité: table Google en RLS service-role-only, sans accès `anon` ni `authenticated`.

## Endpoints Booking Server

La fonction expose les routes v3 attendues pour une intégration Dining Reservations:

- `GET /v3/HealthCheck/`
- `POST /v3/BatchAvailabilityLookup/`
- `POST /v3/CreateBooking/`
- `POST /v3/UpdateBooking/`
- `POST /v3/GetBookingStatus/`
- `POST /v3/ListBookings/`

Les mutations `CreateBooking` et `UpdateBooking` sont pensées pour être rejouables: une même clé `idempotency_token` retourne la même réponse, et une clé réutilisée avec un payload différent est rejetée.

Notes d’alignement Google:

- `BatchAvailabilityLookup` accepte le `merchant_id` racine envoyé par Google et les `slot_time` sans `merchant_id` répété.
- `GetBookingStatus` retourne `prepayment_status: PREPAYMENT_NOT_PROVIDED`, car TOK ne fait pas encore porter de prépaiement Google sur cette intégration.
- `ListBookings` filtre par `user_id` Google stocké dans `user_information`, pas par restaurant, puis ne renvoie que les réservations futures.
- `UpdateBooking` conserve le payload de création initial afin de reconstruire une réservation Google complète après annulation ou consultation.

## Feeds à produire

Google demande au minimum:

- Merchant feed: restaurants TOK signés, nom, adresse, téléphone, site, pays, catégorie, identifiant marchand.
- Service feed: service de réservation de table, durée standard, règles d’annulation, URL TOK.
- Availability feed: disponibilités sur au moins 30 jours, par créneau et capacité.

Recommandation TOK: utiliser l’UUID restaurant comme `merchant_id` dans les feeds Google, et stocker `google_place_id` sur les fiches restaurants pour fiabiliser le matching Google Maps.

La fonction `google-actions-center` peut déjà exporter des JSON de travail protégés par Basic Auth:

- `GET /v3/feeds/merchants?limit=100`: Merchant feed avec `PROCESS_AS_COMPLETE`, restaurants actifs et `google_place_id` quand disponible.
- `GET /v3/feeds/services?limit=100`: Service feed pour le service `tok-table-reservation`.
- `GET /v3/feeds/availability?limit=100&days=30`: Availability feed sur 30 jours maximum, généré depuis `get_restaurant_reservation_slot_availability`.

Ces exports servent de base technique pour le compte Actions Center. Après invitation Google, il faudra adapter le transport exact demandé par Google (par exemple dépôt feed, sandbox, shards et planification) sans exposer ces URLs publiquement.

## Export fichiers de feeds

Un exporteur local prépare déjà les trois fichiers `.json.gz` à déposer côté Google après configuration du compte partenaire:

```bash
GOOGLE_ACTIONS_CENTER_FEED_BASE_URL=https://{project}.functions.supabase.co/google-actions-center \
GOOGLE_ACTIONS_CENTER_USERNAME=... \
GOOGLE_ACTIONS_CENTER_PASSWORD=... \
pnpm google:actions:feeds -- --output .tmp/google-actions-center-feeds
```

Le script télécharge les endpoints Basic Auth, vérifie `PROCESS_AS_COMPLETE`, puis écrit:

- `merchant_feed_{timestamp}_001_of_001.json.gz`
- `service_feed_{timestamp}_001_of_001.json.gz`
- `availability_feed_{timestamp}_001_of_001.json.gz`

Options d’environnement utiles:

- `GOOGLE_ACTIONS_CENTER_FEED_LIMIT`: nombre maximal de restaurants exportés, borné à 100.
- `GOOGLE_ACTIONS_CENTER_AVAILABILITY_DAYS`: nombre de jours d’availability, borné à 30.

Le dépôt SFTP/SSH chez Google reste volontairement hors du repo tant que Google n’a pas fourni les credentials et contraintes exactes du compte Actions Center.

## Données à compléter avant candidature

- Contrats restaurants autorisant TOK à recevoir et gérer les réservations au nom de chaque établissement.
- `google_place_id` et URL Google Maps de chaque restaurant pilote.
- Horaires, fermetures exceptionnelles, capacité par service, durée moyenne de réservation, règles d’annulation.
- Politique RGPD: base légale, sous-traitance, conservation, suppression, emails transactionnels et consentement marketing.
- Monitoring: taux d’erreur Booking Server, latence p95/p99, refus de disponibilité, annulations, conflits idempotence.
- Environnement sandbox distinct ou inventaire sandbox contrôlé pour les tests Google.

## Secrets à configurer après validation Google

Ne pas commiter ces valeurs. Elles doivent être créées dans Supabase/Vercel/GitHub selon le workflow habituel:

- `GOOGLE_ACTIONS_CENTER_USERNAME`
- `GOOGLE_ACTIONS_CENTER_PASSWORD`
- `GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID`
- Optionnel: `GOOGLE_ACTIONS_CENTER_ENVIRONMENT=sandbox` pour un endpoint de test dédié.

`GOOGLE_ACTIONS_CENTER_SERVICE_USER_ID` doit référencer un utilisateur Supabase interne contrôlé par TOK. Il sert uniquement à satisfaire le `user_id` obligatoire des réservations créées par Google; les données client Google restent dans `reservations.metadata` et `google_actions_center_bookings.user_information`.

## Parcours d’inscription

1. Finaliser la voie rapide: chaque restaurant ajoute son URL TOK `/reserver` dans Google Business Profile.
2. Préparer un inventaire pilote en Suisse avec restaurants signés et matching Google Maps propre.
3. Remplir le Partner Interest Form Google Actions Center ou passer par un contact business development Google.
4. Après invitation, configurer Actions Center: contacts, marque TOK, credentials Booking Server, clé SSH/feed delivery, sandbox.
5. Envoyer Merchant feed, Service feed et Availability feed.
6. Tester `HealthCheck`, `BatchAvailabilityLookup`, `CreateBooking`, `UpdateBooking`, `GetBookingStatus` et `ListBookings` en sandbox.
7. Corriger les erreurs de matching, latence ou disponibilité.
8. Demander la production review Google.
9. Laisser la mise en production à GitHub Actions et aux migrations Supabase habituelles.

## Points non automatisables par le code

- Acceptation par Google Actions Center.
- Signature contractuelle restaurants.
- Credentials Google, Basic Auth et service user.
- Validation sandbox et production review.
- Gestion du compte Actions Center et des feeds côté Google.

## Références officielles

- Overview Dining Reservations: https://developers.google.com/actions-center/verticals/reservations/e2e/overview
- Feeds Reservations E2E: https://developers.google.com/actions-center/verticals/reservations/e2e/integration-steps/feeds
- Booking Server API REST: https://developers.google.com/actions-center/verticals/reservations/e2e/reference/booking-server-api-rest
- Google Business Profile links: https://support.google.com/business/answer/13769188
