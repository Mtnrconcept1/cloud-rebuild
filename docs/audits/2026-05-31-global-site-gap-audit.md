# Audit global TOK — routes, fonctionnalités et manques prioritaires

## Périmètre audité

Audit réalisé à partir des routes déclarées dans `src/App.tsx`, du catalogue de feature flags, du dashboard restaurateur, des workflows CI/CD, des scripts package, des pages client, restaurateur, coursier et admin, ainsi que des migrations/fonctions Supabase liées aux paiements, campagnes, Actualités et métriques.

## Synthèse courte

Le site n'est plus un simple prototype. La structure correspond déjà à une marketplace complète avec espaces client, restaurateur, coursier et admin. Les routes couvrent la recherche, les restaurants, le panier, les commandes, les réservations, les campagnes, les Actualités, les dashboards, la facturation, le support, le coursier et l'administration.

Le manque principal n'est pas le nombre de pages. Le manque principal est l'industrialisation: tests métier, monitoring, fiabilité paiements, dispatch livraison, attribution marketing, sécurité anti-fraude, support client, remboursement, qualité opérationnelle et observabilité.

## Routes client auditées

Routes publiques ou semi-publiques:

- `/`
- `/auth`
- `/recherche`
- `/restaurant/:id`
- `/anti-gaspi`
- `/panier`
- `/commande/confirmation`
- `/creneaux-garantis`
- `/flex-prix-bas`
- `/match-groupes`
- `/multi-stop`
- `/multi-restaurant`
- `/chefs-table`
- `/zero-attente`
- `/garantie-qualite`
- `/budget-auto`
- `/abonnement`
- `/tok-one`
- `/ventes-flash`
- `/actualites`
- `/contact`
- `/cgu`
- `/politique-confidentialite`
- `/a-propos`
- `/packs-restaurateur`
- `/aide`

Routes client protégées:

- `/commandes`
- `/commande/:id`
- `/reservations`
- `/profil`
- `/notifications`
- `/points-cadeau`

Manques côté client:

1. Un vrai tunnel de conversion mesurable de bout en bout: restaurant → panier → paiement → commande créée → suivi → avis.
2. Une page de gestion des litiges/remboursements client.
3. Un chat client-restaurant-coursier.
4. Une vraie page d'aide contextuelle par commande/réservation.
5. Un système d'ETA unifié et fiable.
6. Une persistance claire des préférences utilisateur: cuisines, budget, allergies, adresses, horaires favoris.
7. Un mode invité complet pour explorer sans compte, puis conversion vers compte au paiement.

## Routes dashboard restaurateur auditées

Routes:

- `/dashboard`
- `/dashboard/restaurant`
- `/dashboard/advisor`
- `/dashboard/menu`
- `/dashboard/reservations`
- `/dashboard/commandes`
- `/dashboard/recommandations`
- `/dashboard/performances`
- `/dashboard/comparaison`
- `/dashboard/avis`
- `/dashboard/factures`
- `/dashboard/factures/entrees`
- `/dashboard/factures/sorties`
- `/dashboard/factures/parametres`
- `/dashboard/offres`
- `/dashboard/ventes-flash`
- `/dashboard/formules`
- `/dashboard/photos`
- `/dashboard/promotions`
- `/dashboard/campagne-overview`
- `/dashboard/reseaux-sociaux`
- `/dashboard/actualites`
- `/dashboard/campagnes`
- `/dashboard/support`
- `/dashboard/service`
- `/dashboard/plan-salle`
- `/dashboard/pack`

Manques côté restaurateur:

1. Mode opérationnel live unique: accepter/refuser commande, préparation, retard, rupture produit, assignation livraison.
2. Centre de notifications critiques pour commandes/réservations en retard.
3. Gestion avancée des horaires exceptionnels, fermetures, capacités et surcharge.
4. Rapports financiers détaillés: ventes brutes, commissions, frais, remboursements, reversements.
5. Analytics par plat, par heure, par canal et par campagne.
6. Alertes intelligentes: plats qui convertissent, photos faibles, panier moyen bas, taux d'annulation élevé.
7. Système de qualité: score restaurant, incidents, temps de préparation réel, fiabilité.
8. Formation/onboarding restaurateur intégré.

## Routes coursier auditées

Routes:

- `/courier`
- `/courier/jobs`
- `/courier/earnings`
- `/courier/profile`

Manques côté coursier:

1. Dispatch temps réel robuste avec acceptation/refus de mission.
2. Géolocalisation live et statut de disponibilité.
3. Calcul du revenu estimé par mission.
4. Gestion des incidents: restaurant en retard, client absent, problème d'adresse.
5. Historique de performance coursier.
6. Validation documents/KYC si le service devient réel.
7. Chat coursier-client-restaurant.

## Routes admin auditées

Routes:

- `/admin`
- `/admin/platform`
- `/admin/restaurants`
- `/admin/utilisateurs`
- `/admin/avis`
- `/admin/catalog`
- `/admin/loyalty`
- `/admin/drops`
- `/admin/notifications`
- `/admin/actualites`
- `/admin/audit`
- `/admin/packs`
- `/admin/compta`
- `/admin/compta/entrees`
- `/admin/compta/sorties`
- `/admin/commandes-reservations`

Manques admin:

1. Centre d'opérations live type dispatch/control tower.
2. Monitoring des commandes bloquées, paiements échoués, webhooks Stripe non traités.
3. Gestion des litiges/remboursements.
4. Journal des erreurs par Edge Function et par route frontend.
5. Supervision Supabase Realtime.
6. Table de santé des feature flags: route impactée, dépendances, statut, dernier test.
7. Outil de réparation des données: commandes orphelines, paiements sans commande, campagnes payées non actives.
8. Dashboard de marge: commissions, Stripe fees, remboursements, reversements.

## Feature flags

Le système de feature flags est riche et couvre les groupes paiements, parcours coeur, fonctionnalités client, dashboard restaurateur, coursier, admin et custom. C'est un point fort.

Manques:

1. Tests automatiques pour vérifier que chaque route déclarée a un feature flag cohérent.
2. Page admin de diagnostic des flags.
3. Historique des changements de flags.
4. Règles de déploiement progressif par ville, restaurant, rôle ou pourcentage d'utilisateurs.

## Paiement et Stripe

Points forts:

- Paiements carte, TWINT, PostFinance et espèces sont modélisés dans les flags.
- Workflow de production synchronise secrets, migrations, fonctions et frontend.
- Les campagnes sponsorisées utilisent Stripe Checkout.

Manques:

1. Table de réconciliation Stripe systématique.
2. Détection des paiements réussis sans commande/réservation créée.
3. Détection des commandes créées sans paiement confirmé.
4. Gestion automatique des remboursements.
5. Webhook dead-letter queue.
6. Rejeu sécurisé des événements Stripe.
7. Tests e2e checkout.

## Actualités et posts sponsorisés

Corrections récentes:

- `/actualites` rendu public.
- Tracking anonyme impressions/clics.
- Rotation sponsorisée pondérée par budget.
- Attribution conversion commande/réservation.
- Protection contre les métriques gonflées par le restaurateur.

Manques restants:

1. Badge Sponsorisé visible sur les cartes.
2. Rapport organique vs sponsorisé dans le dashboard.
3. CPC, CPM, CPA, budget restant.
4. Prévision avant paiement.
5. Fenêtres d'attribution configurables.
6. Distinction post-view / post-click.
7. Export CSV/PDF.
8. A/B testing des posts sponsorisés.

## Commandes

Manques principaux:

1. Cycle de vie standardisé: pending_payment, paid, confirmed, preparing, ready, picked_up, delivered, cancelled, refunded.
2. États visibles côté client, restaurateur, coursier et admin avec la même source de vérité.
3. Gestion des annulations partielles.
4. Gestion des ruptures produit après commande.
5. Gestion des retards et compensations.
6. Historique d'audit par commande.
7. Tests unitaires et e2e sur le tunnel complet.

## Réservations

Manques principaux:

1. Confirmation restaurateur ou auto-confirmation configurable.
2. Capacité par créneau reliée au plan de salle.
3. No-show et pénalités éventuelles.
4. Modification/annulation client.
5. Synchronisation avec zéro-attente et précommande.
6. Attribution marketing robuste par réservation.

## Livraison et dispatch

C'est le plus gros écart avec Uber Eats.

Manques prioritaires:

1. Moteur de dispatch en temps réel.
2. Position live coursier.
3. ETA dynamique.
4. Assignation automatique ou manuelle.
5. Multi-pickup/multi-drop réellement opérationnel.
6. Gestion des retards restaurant et coursier.
7. Notifications push fiables.
8. Preuve de livraison.
9. Support incident live.

## Recherche et ranking marketplace

Manques:

1. Ranking basé sur distance, disponibilité, qualité, délais, taux d'annulation, marge et préférences.
2. Search analytics: recherches sans résultat, clics restaurant, conversion par requête.
3. Suggestions intelligentes.
4. Personnalisation client.
5. SEO public des restaurants.
6. Système de qualité photo/menu.

## Notifications

Manques:

1. Modèle événementiel unifié: commande, réservation, campagne, support, coursier.
2. Push mobile fiable.
3. Email transactionnel robuste.
4. Templates admin.
5. Journal des notifications envoyées/échouées.
6. Préférences utilisateur.

## Sécurité et conformité

Manques:

1. Audit RLS automatique dans CI.
2. Tests de policies Supabase.
3. Protection anti-fraude publicitaire avancée.
4. Rate limiting RPC et Edge Functions.
5. Journal d'accès admin.
6. Séparation claire données publiques/privées.
7. RGPD/LPD: export, suppression, consentement cookies/analytics.

## CI/CD et production

Points forts:

- CI avec pnpm, lint, tests et build.
- Workflow production avec validation, migration Supabase, secrets, Edge Functions et Vercel.

Manques:

1. Tests e2e Playwright/Cypress.
2. Tests SQL/RPC.
3. Tests de migrations sur base temporaire.
4. Rollback documenté.
5. Environnement staging séparé de production.
6. Monitoring post-déploiement.
7. Alertes Slack/email sur échec webhook ou migration.

## Priorités recommandées

### P0 — Fiabiliser les parcours critiques

1. Checkout commande complet.
2. Webhook Stripe + création commande/réservation.
3. Suivi commande cohérent.
4. Dashboard restaurateur commandes/réservations temps réel.
5. Actualités sponsorisées et attribution conversion.
6. Tests SQL/RPC.

### P1 — Construire la puissance marketplace

1. Dispatch coursier.
2. ETA live.
3. Notifications transactionnelles.
4. Support/litiges/remboursements.
5. Analytics restaurateur détaillées.
6. Ranking restaurant.

### P2 — Croissance et différenciation

1. Publicité locale avancée.
2. IA menu/photos/campagnes.
3. Personnalisation client.
4. Fidélité/Tok One.
5. Packs restaurateurs.
6. SEO restaurants.

## Verdict

TOK possède déjà plus de modules qu'un MVP classique. Pour devenir réellement aussi puissant qu'Uber Eats, il faut maintenant réduire la dispersion, choisir les parcours coeur, les tester à fond, puis ajouter le dispatch, le support, les remboursements, les notifications et les analytics fiables. L'objectif réaliste est de passer d'une application riche en fonctionnalités à une plateforme opérationnelle mesurable et robuste.
