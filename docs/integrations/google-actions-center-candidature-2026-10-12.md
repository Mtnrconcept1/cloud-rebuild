# Dossier de candidature TOK — Reserve with Google / Google Actions Center

**Date de l'audit : 12 octobre 2026.** **Statut : préparation, NON soumis à Google, NON homologué.**

Dossier de travail pour le dépôt Mtnrconcept1/cloud-rebuild, basé sur les guides officiels Google actualisés au 1er avril 2026 et sur des lectures **non destructives** du projet Supabase de production TOK. Cette photographie de la base doit être actualisée avant toute candidature. Ce document prime sur l'audit précédent dans ce même dossier, qui indiquait à tort que la synchronisation temps réel était absente et que les sources Google étaient inaccessibles.

## 1. Programme visé et décision

- **Première cible : Reservations Business Link.** Affiche un lien profond vers la page de réservation du restaurant dans Google Search et Maps. Google exige au minimum un Merchant feed quotidien avec une action_link de type ACTION_LINK_TYPE_MAKE_DINING_RESERVATION. Le Services feed n'est pas recommandé pour les nouvelles intégrations Business Link.
- **Deuxième cible : Reservations End-to-End.** Réservation native dans Google, avec trois feeds (Merchant, Service, Availability), un Booking Server v3, les notifications RTU, un environnement de test, un contrôle Google et une revue de production.
- **Solution intermédiaire indépendante du statut partenaire :** demander aux restaurants autorisés d'ajouter leur lien de réservation TOK sur leur propre fiche Google Business Profile. Cette démarche ne transforme pas TOK en partenaire officiel.
- Le formulaire partenaire ne garantit ni réponse ni intégration. Ne jamais utiliser la marque « partenaire Google » avant acceptation écrite.

L'intégration Business Link est annoncée généralement en 4 à 8 semaines par Google une fois le processus engagé, et non comme un engagement de délai. Google n'ouvre Actions Center qu'après invitation.

## 2. Formulaire officiel — préremplissage factuel

Formulaire : https://services.google.com/fb/forms/reservationsappointmentsonlinebooking-interestform/

| Champ demandé par Google | Réponse proposée / état |
| --- | --- |
| Full legal company name | **À confirmer sur l'extrait officiel de l'entité qui exploite TOK** (ne pas inventer « TOK SA/Sàrl ») |
| Business name | TOK, sous réserve d'alignement avec la raison sociale |
| Website URL | https://www.thetok.ch |
| Existing Actions Center Partner ID | **À confirmer** auprès du titulaire du compte Google ; aucun ID vérifié lors de cet audit |
| Existing Google Merchant Center ID | **À confirmer**, ne pas fabriquer d'identifiant |
| Type of platform | Plateforme web/app de réservation de restaurants (choisir l'option exacte présentée dans le formulaire) |
| Type of business | Fournisseur technologique de réservations / plateforme de réservation (option exacte à confirmer) |
| Headquarters | Suisse **si corroborée par les documents de l'entité juridique** |
| Merchants' regions | Europe : Suisse, Genève pour le pilote |
| Estimated merchant locations live at launch | **À déterminer après qualification de restaurants contractuellement autorisés**. Ne pas indiquer 4 049 |
| Five merchants' Google Business Profile URLs | **Bloqué** : 5 URLs réelles d'établissements partenaires et autorisés requises |
| Primary service | Restaurant Reservations |
| Additional services | Ne cocher Food Ordering/Delivery, Deals & Offers, Food Menus que si ces prestations sont réellement proposées aux établissements présentés |
| Existing signed agreements with merchants | Réponse basée sur le **périmètre réellement autorisé** et les contrats consultés, pas sur le nombre de fiches restaurants |
| Example merchant landing page | Exemple TECHNIQUE uniquement : https://www.thetok.ch/r/la-gazelle-d-or/reserver ; vérifier le parcours réel et le mandat avant de le soumettre |
| Own the landing page domain? | À confirmer par responsable du domaine thetok.ch (le dépôt contient cette URL mais n'établit pas la propriété légale) |
| Contact's name / title / email | Responsable mandaté de TOK, coordonnées professionnelles vérifiées |
| Authorized legal contact / company legal address | Reprendre les renseignements de l'entité inscrite au registre, sans utiliser des coordonnées personnelles supposées |
| NDA with Google | À confirmer |
| Terms and privacy acknowledgment | Lecture et consentement du représentant habilité uniquement |

**Critère d'arrêt :** ne pas envoyer le formulaire tant que les cinq URLs Google Maps de restaurants sous mandat, la dénomination légale, les coordonnées du contact autorisé et le volume au lancement ne sont pas confirmés.

Google demande explicitement cinq liens Google Maps **dans le formulaire**, pas simplement cinq noms de restaurants.

## 3. Argumentaire TOK à réutiliser (anglais)

TOK is a Swiss-focused restaurant reservation and restaurant-management platform, starting with merchants in Geneva. The platform supports real-time table availability, customer reservations and merchant-facing reservation management, and provides individual booking landing pages for participating restaurants.

We are interested in becoming an Actions Center Reservations Business Link partner, with Reservations End-to-End as our next integration stage. Our proposed initial inventory will be restricted to restaurants with active, directly signed agreements permitting TOK to manage bookings, verified Google Maps identities, accurate opening hours, and live bookable inventory.

The TOK engineering stack uses React/TypeScript, Supabase/PostgreSQL and server-side integrations. An initial authenticated Booking Server, feed exporter and event-driven outbox are implemented, but production Google synchronization and sandbox certification remain pending. We can provide dedicated technical and operational contacts for onboarding, testing, compliance and ongoing support.

We welcome Google’s eligibility assessment and guidance on the appropriate integration track for Switzerland.

**Ne pas utiliser la phrase « we have X active merchant partners » avant vérification juridique et fonctionnelle des X contrats.**

## 4. Photographie Supabase en lecture seule au 12/10/2026

Projet vérifié : TOK, distinct de TOK Commercial Demo.

- 4 049 lignes dans public.restaurants ; 4 045 actives mais avec supports_reservation = false.
- Une seule ligne active avec supports_reservation = true : « La Gazelle d’Or ».
- Quatre lignes dans public.restaurant_google_booking_setup, mais **zéro google_place_id** et **zéro google_business_url** renseignés.
- Deux enregistrements de contrats signés dans public.restaurant_contracts, tous deux associés aux « Les Brasseurs ». **Deux contrats ne signifient pas deux établissements.** Les Brasseurs a supports_reservation = false ; l'autorisation spécifique de distribution sur Google n'a pas été prouvée.
- La Gazelle d’Or n'a pas de contrat signé dans cette table ; les autres fiches de réservation ne permettent pas de constituer un inventaire pilote certifié.
- Zéro enregistrement dans public.google_actions_center_bookings.
- Outbox : 4 notifications de disponibilité pending (« google_sync_paused_missing_configuration ») et 4 abandoned (« expired_while_google_sync_unconfigured »).
- Le cron « tok-google-actions-center-sync » est présent à une fréquence de 2 minutes, mais active = false. **Ne pas l'activer** avant corrections API, autorisation Google, secrets et validation sandbox.
- Les tables google_actions_center_bookings, google_actions_center_outbox, restaurant_google_booking_setup et restaurant_contracts ont rowsecurity = true. Un audit complet des politiques reste nécessaire avant activation.

**Conclusion : zéro établissement actuellement vérifié sur l'ensemble des critères contrat + réservation activée + correspondance Google Maps.** Ce n'est pas une mesure de la qualité ou du nombre de restaurants démarchés.

## 5. Audit applicatif — éléments existants et écarts

### Déjà dans le dépôt / déployé

- Landing page par restaurant : /r/{booking_slug}/reserver, route historique /r/{booking_slug}.
- Booking Server dans supabase/functions/google-actions-center/index.ts : HealthCheck, BatchAvailabilityLookup, CreateBooking, UpdateBooking, GetBookingStatus, ListBookings.
- Authentification Basic, RPC métier validate_and_create_reservation_safe, idempotence et table de correspondance des réservations Google.
- Exports Merchant, Service et Availability en JSON dans le Booking Server, exporteur gzip scripts/google-actions-center-export-feeds.mjs, commande pnpm google:actions:feeds.
- Outbox PostgreSQL, trigger sur réservations, revendication par bail, worker supabase/functions/google-actions-center-sync/index.ts, job cron désactivé.
- Tests statiques et tests de l'exporteur dans src/test/google-actions-center-*.test.ts.

**Important : présence de routes, tests statiques ou fonction ACTIVE ne vaut pas conformité du protocole Google ni disponibilité en production.** Aucun test authentifié Google sandbox réussi n'a été vérifié.

### Corrections techniques bloquantes (avant certification)

**P0 — Synchronisation RTU incorrecte.** Le worker utilise actuellement par défaut POST /notification/partners/{partnerId}/bookings:notify. Google documente PATCH /v1alpha/notification/partners/{partnerId}/bookings/{bookingId}?updateMask=status (et autres champs modifiés) avec un corps conforme : name, merchantId, serviceId, startTime, duration, status. Le code existant ne respecte ni le verbe, ni la route, ni la forme attendue.

**P0 — Availability RTU incorrecte.** La route par défaut actuelle POST /inventory/partners/{partnerId}/merchants/{merchantId}/availability:replace est différente de la méthode officielle Single Replace par service (ou Batch Replace par partenaire). Le corps actuellement envoyé est en snake_case avec des valeurs d'époque ; la documentation de l'API RTU exige notamment extendedServiceAvailability et des horodatages RFC3339 / champs camelCase. Vérifier le besoin exact avec le contact Google car Availability Replace est conditionnelle à la verticale/intégration.

**P0 — Fuseau horaire.** Le worker convertit date et heure locale via new Date('YYYY-MM-DDTHH:mm:...'), qui ne garantit pas une interprétation Europe/Zurich. Il faut réutiliser le convertisseur explicite de la fonction Booking Server et tester le passage heure d'été/hiver et les heures ambiguës/non existantes.

**P0 — Filtrage des restaurants.** Le Merchant feed actuel n'impose ni contrat signé ni google_place_id, ni lien Maps vérifié. Ne jamais diffuser des restaurants simplement parce que supports_reservation est activé. Ajouter un statut d'opt-in explicite du restaurateur pour la diffusion à Google et un filtre central réutilisé par les deux intégrations.

**P0 — Sandbox sûre.** Vérifier l'isolation totale des réservations tests, comptes, restaurants et outbox ; les indicateurs d'environnement passés par la requête ne doivent pas permettre de créer ou consulter de vraies réservations via le mode sandbox.

**P1 — Contrats de feeds.** Pour Business Link, créer un Merchant feed dédié comprenant action_link et action_link_type = ACTION_LINK_TYPE_MAKE_DINING_RESERVATION ; le Merchant feed actuel est conçu pour E2E et ne contient pas ce couple requis. Prévoir le dépôt via Google SFTP uniquement après réception des identifiants, clés et exigences de Partner Portal. Pour E2E : Merchants, Services et Availability au moins 30 jours, livrés quotidiennement et contrôlés avec les schémas Google.

**P1 — Expérience utilisateur.** Tester la page cible sur navigateur mobile et desktop : lien direct, bon restaurant, calendrier, réservation réellement réalisable, pas de redirection vers accueil, ni de blocage « coming soon » pour un parcours accepté par Google. Le parcours Google ne doit pas forcer l'acceptation marketing ou ajouter des frais non clairement annoncés.

**P1 — Qualité d'exploitation.** Mise à jour du statut Google, absence de doubles réservations, confirmation/annulation cohérente, monitoring des erreurs et latences, délais de disponibilité, déduplication idempotente, alertes incidents, support client/restaurateur.

**P1 — Vie privée.** Réservations Google en guest checkout si possible ; préférences marketing respectées, pas d'ajout automatique à des campagnes, contrôle de la conservation des données et des droits d'accès, politique de confidentialité et clauses des contrats restaurateurs mises à jour.

## 6. Critères de recette avant candidature technique

- [ ] Entité légale, droit d'utiliser TOK, adresse officielle et contact autorisé vérifiés.
- [ ] Au moins cinq restaurants physiques **distincts** : contrats adéquats et activés pour réservation, Google Maps URLs réelles, horaires/capacités fiables ; dossier de preuves conservé.
- [ ] Désignation d'un responsable d'astreinte technique et du support utilisateurs/restaurateurs.
- [ ] Liens profonds par établissement testés (mobile, desktop, navigation anonyme / connexion).
- [ ] Merchant feed Business Link au format spécifié, vérifié contre les exemples Google.
- [ ] Conversion timezone/DST, concurrence et idempotence testées.
- [ ] Endpoints RTU et charges utiles alignés sur la documentation actuelle ; aucune route fictive.
- [ ] Environnement sandbox Google séparé, données synthétiques et protection production.
- [ ] Feeds E2E complets (y compris 30 jours, créneaux réels et tailles de groupes), dépôt SFTP configuré après invitation.
- [ ] RTU BookingNotification conforme, métriques de contrôle Google satisfaites en sandbox.
- [ ] Politiques de données, consentements, suppression, CGU, SLA et support validés.
- [ ] Tests ciblés Google, lint, typecheck, build et CI verts avant fusion du code.
- [ ] Revue Google Sandbox puis Production réussies avant activation publique.

## 7. Informations à recevoir de Google après acceptation

- Partner ID Actions Center, invitations Partner Portal et Google Cloud Project Number.
- Accès et adresse SFTP, clé SSH publique à enregistrer, conventions de fichiers et statut de validation des feeds.
- Identifiants Booking Server à enregistrer **uniquement** dans les secrets serveur.
- Identité du compte de service Google, permissions de l'API Maps Booking, routes finales RTU.
- Branding public officiel (nom, logo, URL d'assistance, contact technique et juridique).
- Inventaire et identifiants sandbox, protocole de validation, critères de santé et contacts d'escalade.

**Aucun secret ne doit figurer dans ce document ni être commité.**

## 8. Ordre d'exécution sécurisé

1. Qualifier les restaurants et faire valider le mandat de réservation et de diffusion à Google.
2. Associer 5 fiches Google Maps vérifiées à 5 établissements réellement partenaires, sans créer de faux profils ni identifiants.
3. Faire vérifier la raison sociale, la personne habilitée et le contact professionnel ; établir un volume pilote honnête.
4. Corriger l'implémentation (RTU, timezone, sandbox, filtre d'inventaire, Business Link feed) sur branche isolée avec tests. Garder le cron désactivé.
5. Présenter un prototype Business Link sur URLs individuelles stables et accessibles ; valider l'UX.
6. Soumettre le formulaire officiel ci-dessus par le responsable habilité, après vérification des réponses et acceptation des conditions.
7. Après invitation, installer credentials, projet Google, SFTP, sandbox ; tester et réaliser le pilote Google.
8. N'activer la production qu'après revue Google réussie et critères d'exploitation satisfaits.

## 9. Liens officiels vérifiés au 12/10/2026

- Formulaire : https://services.google.com/fb/forms/reservationsappointmentsonlinebooking-interestform/
- Business Link / éligibilité : https://developers.google.com/actions-center/verticals/reservations/bl/overview
- Business Link / Merchant feed : https://developers.google.com/actions-center/verticals/reservations/bl/integration-steps/feeds
- Business Link / action links : https://developers.google.com/actions-center/verticals/reservations/bl/reference/tutorials/specifying-action-links
- End-to-End / éligibilité : https://developers.google.com/actions-center/verticals/reservations/e2e/overview
- End-to-End / politiques (Suisse CH listée) : https://developers.google.com/actions-center/verticals/reservations/e2e/policies/platform-policies
- End-to-End / étapes : https://developers.google.com/actions-center/verticals/reservations/e2e/integration-steps/overview
- End-to-End / feeds : https://developers.google.com/actions-center/verticals/reservations/e2e/integration-steps/feeds
- End-to-End / real-time updates : https://developers.google.com/actions-center/verticals/reservations/e2e/reference/real-time-updates-rest/rtu
- Assistance fiche d'établissement Google : https://support.google.com/business/answer/7475773?hl=fr

## 10. Portée et retour arrière de cette préparation

Ce dossier est documentaire. Il n'effectue **aucun appel à Google**, n'active **aucune tâche**, ne modifie **aucune donnée** et n'expose **aucune information client privée**. Les statistiques des établissements proviennent de requêtes d'agrégation SQL en lecture seule, et les noms cités sont des établissements. Les vérifications de fonctionnement navigateur et les tests en sandbox restent à exécuter.

Retour arrière : revenir au commit documentaire de cette branche ou fermer la PR. Aucun rollback de production n'est requis pour ce document.
