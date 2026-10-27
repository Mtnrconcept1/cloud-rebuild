# Plan de finalisation TOK — 27 octobre 2026

Référence auditée : `140a7fba720aa48ca46027ba5769298ff2864185` (`origin/main`).
Branche dédiée : `fix/application-finalisation-audit-20261027`.

## Périmètre et méthode

La demande couvre l'application. L'audit examine la structure, les parcours,
les contrats métier, les tests, les PR ouvertes et les métadonnées de production.
Les corrections portent sur des défauts établis ; un inventaire statique réussi
ne constitue pas une recette complète de chaque fonctionnalité.

Accès GitHub, Supabase TOK, Vercel et Stripe TOK vérifiés en lecture seule.
Les travaux juridiques non commités et les PR existantes restent séparés.

## Ordre des corrections

1. `src/pages/Recherche.tsx` et tests de recherche : conserver l'échelle de notes
   sur 10 de l'interface au catalogue, y compris les résultats sponsorisés.
2. `src/pages/dashboard/DashboardRestaurant.tsx` et tests ciblés : distinguer
   création réelle, chargement et erreur ; empêcher une sauvegarde de créer un
   restaurant quand le profil sélectionné n'est pas chargé.
3. `supabase/functions/_shared/tok-one.ts`, `stripe-webhook/index.ts` et tests
   TOK One : empêcher les
   événements d'un ancien abonnement de réaffecter la ligne d'un abonnement
   différent ; préserver la première association et les mises à jour du même ID.
   Classer les abonnements restaurateur avant le contrôle des conflits clients
   et isoler ce contrôle selon le mode de l'objet Stripe récupéré.
4. `src/pages/dashboard/DashboardHome.tsx` et tests ciblés : faire remonter les
   erreurs Supabase et proposer une reprise au lieu d'afficher de faux zéros ou
   « Aucun restaurant » pendant une panne ou un chargement.
5. `supabase/functions/_shared/order-checkout.ts`, `order-pricing.ts` et tests :
   conserver l'état avancé d'une commande lors d'un rejeu de confirmation et
   isoler les avantages TOK One selon le mode Stripe serveur (live par défaut).
6. Une nouvelle migration additive et tests SQL : fermer les écritures directes
   des tables coursier/dispatch, limiter les lectures de profils coursiers
   sensibles à soi-même/admin, et contrôler l'autorisation de l'auto-placement
   d'une réservation. Vérifier les fonctions serveur légitimes et les refus
   inter-utilisateurs sur une base PostgreSQL locale avec données synthétiques.
7. Régénérer les index applicatifs exigés par la CI et rédiger le bilan avec
   preuves, validations, points restants et fichiers modifiés.

## Risques et validations

Niveau 3 : synchronisation d'abonnement, droits et données opérationnelles. Aucun
débit, remboursement, envoi de campagne, changement de secret ou migration
appliquée en production. La migration sera proposée dans la PR seulement.
Tests de régression d'abord en échec puis au vert ; tests critiques voisins,
lint, typecheck et build. Contrôle des avis Supabase et du déploiement existant
en lecture seule. Les parcours authentifiés non exécutés seront signalés.

La recherche doit préserver les URL existantes. Les écrans restaurateur doivent
conserver la création légitime et empêcher l'écriture sur une sélection périmée.
TOK One doit conserver l'isolation live/test et les associations checkout.

## Retour arrière et livraison

Commits séparés par risque, réversibles par `git revert`. La consigne initiale
prévoyait une PR sans fusion. L'utilisateur a ensuite demandé « Pousse et fusionne
quand tout est bon » : publier par le connecteur si le terminal n'a pas les
identifiants, vérifier les arbres et les contrôles sur le commit exact, puis
fusionner uniquement après validation. Le déploiement suit le processus du dépôt.
Les limites de recette et les chantiers existants non intégrés figurent dans le bilan.
