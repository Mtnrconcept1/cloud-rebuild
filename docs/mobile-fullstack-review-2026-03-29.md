# Revue Mobile Fullstack - 2026-03-29

## System map

- Frontend: React 18 + Vite + TypeScript + shadcn/ui
- Mobile shell: Capacitor iOS/Android
- Data/backend: Supabase Postgres + RLS + Edge Functions
- Native integrations: push notifications, deep links, geolocation
- Business domains: commandes, reservations, campagnes sponsorisees, loyalty, dashboard restaurateur, espace livreur, admin

## Flows reviewed

- Bootstrap application, auth/session, routing, feature flags
- Checkout Stripe, webhook Stripe, creation de commande, reservation Zero Attente
- Dispatch livreur, notifications push/email/in-app
- RPC SQL sensibles et migrations de durcissement
- Configuration mobile Capacitor, deep links, stockage de session

## Findings

### P0 - Webhook Stripe falsifiable si la verification de signature echoue

- Evidence:
  - `supabase/functions/stripe-webhook/index.ts:185-203`
- Why it matters:
  - Le handler tente la verification de signature Stripe, mais en cas d'echec il retombe sur `JSON.parse(body)` et traite quand meme l'evenement.
  - Un attaquant peut alors poster un faux `checkout.session.completed`, `payment_intent.payment_failed` ou `charge.refunded` et provoquer des changements metier server-side.
- Impact:
  - Confirmation de commandes ou reservations non payees
  - Activation frauduleuse de campagnes
  - Ecriture de transactions de paiement et credits wallet sur faux refund
- Fix direction:
  - Supprimer tout fallback vers un parse brut
  - Rejeter la requete si la signature est absente ou invalide
  - Enregistrer l'echec dans l'audit log puis retourner `400`

### P1 - Fonction SQL `redeem_loyalty_points` en `SECURITY DEFINER` sans verification d'identite

- Evidence:
  - `supabase/migrations/20260308175200_45d83c9c-e5f8-4817-b0b8-7248788c0117.sql:127-135`
  - `src/pages/Panier.tsx:399`
  - `src/pages/Panier.tsx:481`
- Why it matters:
  - La fonction debite `profiles.loyalty_points` pour `user_id_param` sans verifier `auth.uid()`.
  - Je n'ai trouve aucun `REVOKE/GRANT` de durcissement pour cette fonction dans les migrations. Sauf configuration hors repo, elle reste donc executable via RPC avec ses privileges definer.
- Impact:
  - Un utilisateur authentifie peut vraisemblablement debiter les points d'un autre utilisateur s'il connait son UUID.
- Fix direction:
  - Remplacer `user_id_param` par `auth.uid()` cote SQL
  - Revoquer `EXECUTE` pour `PUBLIC`/`anon` et limiter a `authenticated` si la fonction doit survivre
  - Ajouter un test de non-regression sur l'appel RPC

### P1 - Plusieurs RPC analytics/recommandations semblent exposer des donnees cross-tenant

- Evidence:
  - `supabase/migrations/20260312235900_fix_dashboard_performance_consistency.sql:1-111`
  - `supabase/migrations/20260308175200_45d83c9c-e5f8-4817-b0b8-7248788c0117.sql:49-56`
  - `src/pages/dashboard/DashboardComparaison.tsx:80`
  - `src/pages/dashboard/DashboardRecommandations.tsx:91`
- Why it matters:
  - `get_restaurant_performance`, `get_restaurant_comparison` et `get_restaurant_recommendations` sont en `SECURITY DEFINER` mais ne verifient ni `auth.uid()` ni la possession du restaurant cible.
  - Je n'ai pas trouve de `REVOKE/GRANT` de durcissement pour ces fonctions dans les migrations.
- Impact:
  - Sauf privileges corriges hors repo, un client RPC peut vraisemblablement lire des indicateurs ou recommandations d'un autre restaurant en changeant l'UUID.
- Fix direction:
  - Ajouter un garde SQL `owner/admin` explicite
  - Revoquer `EXECUTE` public par defaut
  - Preferer des fonctions owner-scoped sans `restaurant_id` libre quand possible

### P1 - Android autorise explicitement le mixed content

- Evidence:
  - `capacitor.config.ts:31`
- Why it matters:
  - `allowMixedContent: true` ouvre la porte au chargement de ressources HTTP non securisees dans le WebView Android.
- Impact:
  - Surface MITM accrue sur mobile
  - Degradation de l'integrite du contenu et du JS charge
- Fix direction:
  - Passer `allowMixedContent` a `false`
  - Autoriser exceptionnellement des endpoints HTTP uniquement via proxy/HTTPS

### P1 - Les feature flags echouent en mode fail-open

- Evidence:
  - `src/lib/featureFlags.ts:44-156`
  - `src/lib/featureFlags.ts:205`
  - `src/lib/featureFlags.ts:250`
  - `src/lib/featureFlags.ts:302-303`
- Why it matters:
  - Tous les flags par defaut sont `true`.
  - En cas d'erreur de lecture Supabase, `fetchFlags()` retourne les defaults, ce qui active toutes les features cote UI.
- Impact:
  - Exposition accidentelle de parcours exclusifs ou inacheves lors d'une panne ou d'une erreur RLS
  - Comportement produit non deterministe
- Fix direction:
  - Basculer sur un fail-closed pour les flags non essentiels
  - Differencier les flags de securite/ops des flags purement cosmetiques

### P2 - Les deep links natifs perdent le host et les query params

- Evidence:
  - `src/lib/deep-links.ts:7-9`
  - `capacitor.config.ts:28`
- Why it matters:
  - Avec le scheme natif `tok`, une URL de type `tok://commande/123?x=y` donne `host=commande`, `pathname=/123`.
  - Le code ne conserve que `pathname`.
- Impact:
  - Routage faux ou incomplet sur mobile
  - Liens push/deep link fragiles
- Fix direction:
  - Recomposer la route a partir de `host + pathname + search`
  - Ajouter des tests pour les schemes natifs et les URLs web

### P2 - Les sessions Supabase sont persistees en `localStorage`, y compris pour le shell mobile

- Evidence:
  - `src/integrations/supabase/client.ts:9-13`
- Why it matters:
  - Sur Capacitor, `localStorage` n'offre pas les garanties d'un stockage securise OS.
- Impact:
  - Hardening mobile insuffisant pour les tokens de session
- Fix direction:
  - Utiliser un storage natif securise pour iOS/Android
  - Garder `localStorage` uniquement pour le web si necessaire

### P2 - Navigation push web ouverte vers des URLs externes

- Evidence:
  - `public/firebase-messaging-sw.js:19-21`
  - `public/firebase-messaging-sw.js:71-89`
- Why it matters:
  - Le service worker accepte directement les `http(s)://...` dans `data.url` et ouvre cette URL au clic.
- Impact:
  - Surface de phishing/open redirect si une notification malformee ou malveillante entre dans le systeme
- Fix direction:
  - Restreindre les cibles a des chemins internes
  - Maintenir une allowlist explicite si des URLs externes sont vraiment necessaires

## Quality and operability gaps

- `npm run test`: OK, 44 tests
- `npm run build`: OK, mais chunk principal a environ 1.56 MB minifie
- `npm run lint`: KO, 555 problemes, dont des fichiers generes Android inspectes a tort

### Additional notes

- `src/App.tsx` charge encore beaucoup de pages client de facon eager, ce qui contribue au gros bundle initial.
- `eslint.config.js` n'ignore que `dist`, pas les sorties natives `android/app/build`.
- `src/lib/push-native.ts` ajoute des listeners a chaque enregistrement sans nettoyage explicite, ce qui peut provoquer des callbacks dupliques.

## Roadmap

### Now

- Corriger le webhook Stripe
- Verrouiller les RPC `SECURITY DEFINER` sensibles
- Desactiver `allowMixedContent`
- Faire passer les feature flags en fail-closed

### Next

- Corriger la reconstruction des deep links
- Basculer les tokens mobiles vers un secure storage
- Restreindre les URLs de notifications web

### Later

- Revoir le split des chunks client
- Remettre ESLint en etat exploitable
- Ajouter des tests de securite pour RPC et webhooks

## Follow-up review - spaces and onboarding

### What changed in this pass

- Signup multi-profils client / restaurateur / livreur avec pieces justificatives privees
- Workflow admin de revue documentaire dans `AdminUtilisateurs`
- Correction de l'auto-approbation implicite du flux livreur
- Affichage de l'etat du dossier dans les espaces client, restaurateur et livreur

### Additional findings still open

#### P1 - Modele d'identite fragmente entre `profiles` et `user_profiles`

- Evidence:
  - `supabase/migrations/20260308174912_24a4f7b8-7291-401b-aa81-669264a5bbd2.sql`
  - `supabase/migrations/20260310035822_core_identity.sql`
- Why it matters:
  - Le frontend principal continue d'utiliser `profiles`, alors qu'une deuxieme couche `user_profiles` existe deja pour d'autres domaines.
  - Cette duplication cree des risques de desynchronisation et pousse le frontend vers des casts faibles ou des jointures incoherentes.
- Recommendation:
  - Choisir une source canonique pour le profil utilisateur
  - Aligner les ecrans client/admin et les nouvelles features dessus

#### P2 - Le back-office admin repose encore beaucoup sur des aggregations client-side directes

- Evidence:
  - `src/pages/admin/AdminHome.tsx`
  - `src/pages/admin/AdminRestaurants.tsx`
- Why it matters:
  - Les stats, listes et compteurs restent largement composes dans le navigateur a partir de multiples queries.
  - Cela fragilise les performances, le cache, et la lisibilite de l'autorite metier cote serveur.
- Recommendation:
  - Introduire quelques RPC dashboard/admin stables pour les vues de synthese
  - Garder les tables detaillees pour l'exploration, pas pour toutes les cartes KPI

#### P2 - Les uploads publics d'images restent peu cloisonnes

- Evidence:
  - `src/components/ImageUpload.tsx`
- Why it matters:
  - Les fichiers sont envoyes avec un nom aleatoire a la racine du bucket public `images`, alors que les policies existantes attendent plutot un dossier utilisateur pour les updates/deletes.
  - Ce n'est pas critique pour les medias publics, mais cela complique la gouvernance des assets et l'ownership.
- Recommendation:
  - Prefixer les chemins par `auth.uid()`
  - Factoriser la logique d'upload public comme cela a ete fait pour les documents de verification

#### P2 - Les preferences et abonnements notifications sont encore dupliques cote client

- Evidence:
  - `src/pages/Profil.tsx`
  - `src/pages/ChefsTable.tsx`
  - `src/pages/VentesFlash.tsx`
  - `src/components/Navbar.tsx`
- Why it matters:
  - Plusieurs pages manipulent directement `notification_preferences` et `notification_subscriptions` avec des variations de logique.
  - Cela cree de la dette de coherence et des regressions potentielles entre espaces client et marketing.
- Recommendation:
  - Introduire un hook/service unique pour lire et ecrire les preferences
  - Centraliser la normalisation des topics et categories
