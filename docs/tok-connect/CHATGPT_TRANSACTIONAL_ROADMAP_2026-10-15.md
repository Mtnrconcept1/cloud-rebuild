# TOK Connect × ChatGPT — plan d'intégration transactionnelle

Date : 15 octobre 2026
Périmètre : clients TOK, découverte, réservations, commande, Zéro Attente, paiement, suivi et annulations.
Statut : **plan d'implémentation, non déployé**. Cette note ne certifie aucune fonctionnalité non testée.

## Objectif produit

Un client authentifié à son compte TOK depuis ChatGPT peut :
1. chercher et comparer les restaurants par lieu, horaire, cuisine, budget, accessibilité et autres filtres disponibles dans TOK ;
2. consulter les créneaux réellement disponibles, photos, menus et options du restaurant ;
3. sélectionner une table, obtenir un récapitulatif fiable, puis confirmer explicitement une réservation ;
4. configurer une commande (sur place, livraison, à emporter) ou un parcours Zéro Attente (table + précommande + horaire + paiement) ;
5. consulter le panier, les contraintes alimentaires transmises au restaurant, les coûts et les conditions applicables ;
6. payer via un flux autorisé, suivre la confirmation, l'exécution, les notifications et les factures ;
7. revoir, modifier ou annuler lorsque les règles de TOK et du restaurateur le permettent.

Aucune réservation, commande, annulation ou opération financière ne doit être produite par une simple inférence du modèle. Les actions restent initiées par le client et validées sur le serveur TOK.

## Audit vérifié dans le dépôt

- Le MCP public est https://www.thetok.ch/mcp (routage Vercel vers tok-connect-remote-mcp).
- La découverte OAuth publie Supabase Auth comme authorization server. Le chemin de consentement /oauth/consent existe dans src/pages/OAuthConsent.tsx.
- Les scopes OAuth interactifs sont openid, email, profile, distincts des scopes métier partenaires.
- tok-connect-oauth est un OAuth historique pour l'intégration B2B (clients avec scopes métier). Il ne doit pas être configuré comme authorization server ChatGPT.
- Les outils de recherche, détail restaurant, menus, disponibilités et préparation de réservation existent dans tok-connect-mcp et tok-connect-chatgpt.
- tok-connect-chatgpt contient les outils create_reservation et cancel_reservation, mais tok-connect-remote-mcp rejette les outils sans readOnlyHint via public_mcp_read_only : **la réservation réelle n'est pas disponible sur le MCP public actuel**.
- Le widget de découverte dans _shared/tok-connect-discovery-widget.ts affiche les cartes, détails, menus et disponibilités, mais le bouton « Réserver » envoie un nouveau message à ChatGPT. Il n'a ni panier transactionnel ni paiement intégré.
- TOK possède séparément create-checkout, complete-order-checkout, stripe-webhook, create-zero-attente-reservation et _shared/zero-attente.ts ; aucune intégration end-to-end MCP/widget de ces opérations n'est établie à ce stade.
- Les Edge Functions TOK Connect étaient actives lors de l'audit, mais cela ne prouve pas la connexion OAuth ou un parcours d'achat opérationnel.
- L'application Stripe TOK connectée est live ; **aucun paiement ni test live ne doit être initié pour valider cette intégration**.

## P0 — Corriger et certifier OAuth (bloquant)

1. Garder l'unique URL MCP https://www.thetok.ch/mcp et le metadata protected-resource qui pointe sur https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1.
2. Vérifier dans Supabase Dashboard : OAuth 2.1 activé, authorization path /oauth/consent, site URL, JWT asymétrique pour OIDC, configuration DCR ou client public ChatGPT pré-enregistré.
3. Si client pré-enregistré, renseigner **l'URI de retour exacte publiée par ChatGPT**, sans wildcard ; ne pas inventer de callback.
4. Examiner et corriger l'enregistrement OAuth de l'app TOK Connect dans ChatGPT : retirer toute référence à tok-connect-oauth et utiliser l'autorité Supabase Auth. Ne pas relancer en boucle les anciennes connexions tant que cette configuration n'a pas changé.
5. Publier correctement les metadata, securitySchemes par outil et challenges d'authentification porteurs de mcp/www_authenticate et WWW-Authenticate, y compris sur session expirée ou permissions insuffisantes. Valider l'issuer, l'audience/client_id, l'expiration, la signature JWT et les droits effectifs.
6. Conserver la session TOK après consentement et assurer le retour au widget avec l'état de panier non sensible restauré.
7. Tests : discovery, DCR/client pré-enregistré, PKCE, login, consentement, refus, refresh/revocation, changement de compte, absence/expiration de token, isolation clients et rôles, régression B2B historique.
8. Diagnostiquer les request_id des erreurs via audit API/Edge/Auth ; ne pas masquer un invalid_scope en attribuant automatiquement tous les scopes.

**Limite d'accès :** les outils Supabase connectés ne permettent pas ici d'éditer les paramètres OAuth Server du Dashboard ni l'enregistrement OAuth de l'app ChatGPT ; ces deux réglages doivent être validés dans les interfaces autorisées. Une modification de fichier GitHub ne les remplace pas.

## P1 — Réservations effectives dans le widget

### Contrats MCP proposés

- search_tok_restaurants(filters) → résultats classés ; aucune disponibilité inventée.
- get_tok_restaurant_details(restaurant_id) → fiche, capacités de service, conditions.
- get_tok_reservation_availability(restaurant_id, date, party_size, service_mode) → créneaux en heure locale, capacités et origine des disponibilités.
- preview_tok_reservation(restaurant_id, slot_id, party_size, note, idempotency_key) → réservation prévisualisée, prix/arrhes éventuels, conditions, expiration.
- confirm_tok_reservation(preview_id, explicit_confirmation_token, idempotency_key) → réservation unique et statut autoritaire.
- list_my_tok_reservations / get_my_tok_reservation → accès uniquement au compte authentifié.
- preview_tok_reservation_change / confirm_tok_reservation_change et preview_tok_reservation_cancel / confirm_tok_reservation_cancel → selon règles et délais en vigueur.

Il s'agit de **noms d'outils à implémenter**, pas d'outils déjà déployés. Préférer réutiliser et normaliser les routes/contrats métier existants plutôt que copier la logique. Les confirmations mutantes exigent contrôle serveur du propriétaire, preuve de consentement transactionnel, idempotence, revérification du créneau, capacité, limites anti-abus et journal d'audit.

Le gateway public doit cesser de filtrer aveuglément toutes les écritures : exposer uniquement une **allowlist nominative** d'actions client autorisées, jamais les actions admin/RPC génériques, et conserver le refus par défaut. Le changement ne peut être activé avant tests sécurité.

### Widget TOK

Composants : recherche et filtres, carrousel de restaurants, fiche et cartes, calendrier/créneaux, choix convives, récapitulatif, confirmation, reçu/QR si TOK le supporte. Appeler les outils avec window.openai.callTool quand disponible ; fallback conversationnel/URL autorisée sinon. Utiliser une ressource MCP Apps HTML avec CSP restrictive, structuredContent minimal, état de widget sans PII ni jetons, accessibilité clavier/lecteur d'écran, mobile, erreurs claires et reprise après expiration.

## P2 — Commander sans quitter le parcours

- get_tok_service_modes : sur place, à emporter, livraison, Zéro Attente, offres spécialisées activées par restaurant.
- get_tok_menu : catégories, variations, suppléments, indisponibilités, allergènes déclarés, horaires et images.
- create_tok_cart / update_tok_cart / get_tok_cart : panier serveur associé à l'identité TOK, restaurant/service et TTL ; ne jamais se baser sur les prix du modèle.
- quote_tok_cart : validation menu et stocks, TVA, frais livraison/service, promotions, fidélité/MIAMZ et total TTC signé/expirable.
- preview_tok_order : adresse/point de retrait, créneau, livraison possible, contact, commentaire, politique de remboursement.
- confirm_tok_order : après consentement et état paiement autoritaire, réutiliser exclusivement le flux métier TOK et ses protections.
- get_my_tok_order / list_my_tok_orders / preview_tok_order_cancel : suivi des statuts existants et annulations admises.

La logique métier reste dans create-checkout, pricing, order-checkout, complete-order-checkout, fulfillments et webhooks ; le MCP ne doit pas reproduire les règles de montant, commission ou disponibilité.

## P3 — Zéro Attente : transaction composite

Flow atomique attendu : restaurant et date → table/capacité → menu et quantités → heure d'arrivée/service → prix/TVA → confirmation de la combinaison table + précommande → paiement autorisé → finalisation cohérente des deux objets.

Réutiliser _shared/zero-attente.ts, create-zero-attente-reservation et les checkouts existants. Réserver un identifiant de flux et une clé idempotente communs ; gérer expiration, abandon, stock modifié, fermeture de service, paiement échoué, double clic, succès du paiement mais échec de création de réservation (réconciliation et compensation prévues). Ne jamais afficher « confirmé » avant le retour serveur final.

## P4 — Paiement Stripe dans les limites autorisées

La voie par défaut est une session Stripe Checkout TOK via une URL de paiement HTTPS sur domaine TOK, contrôlée par le serveur. Le widget peut présenter le devis et initier la navigation ; le client revient à un état vérifié de commande ou réservation.

La feuille de paiement intégrée à ChatGPT (window.openai.requestCheckout, complete_checkout) est soumise à éligibilité/approbation OpenAI ; ne pas l'activer ou promettre pour la restauration sans confirmation explicite d'accès pour l'app et les catégories concernées. Si approuvée, implémenter le contrat de session/confirmation, montants en centimes, payment_mode test, et la délégation Stripe conforme. Ne jamais collecter de numéro de carte/CVC dans le modèle, le MCP ou un composant maison.

Mettre un ledger cohérent avec : checkout_session_id, order_id, reservation_id, idempotency_key, stripe_payment_intent_id, compte Connect, application fee, total, devise, commission, TVA, remboursement, statut webhook et horodatages. Stripe reste source de vérité du paiement ; le serveur TOK est source de vérité de l'acceptation restaurant, de la commande et de la réservation.

Tests : carte refusée, 3DS, abandon, paiement tardif, timeout, webhook dupliqué/hors ordre, double clic, erreur de réseau, remboursement total/partiel, test mode, rapprochement Stripe-TOK, email/facture et non-duplication.

## P5 — Parité client TOK et opérations post-achat

Cataloguer toutes les fonctionnalités transactionnelles réellement disponibles et les exposer seulement après validation séparée : réservation sans restauration, Zéro Attente, table du chef/Tok d'Or, offres, retrait, livraison, multi-restaurants si support confirmé, fidélité/avantages, commandes récurrentes si support confirmé, factures/reçus, préférences, suivi, annulation, remboursement, assistance.

Pour chaque capacité : parcours frontend existant → API/RPC métier existante → règles/flags/droits → nouvelle façade MCP minimaliste → UI widget → test de parité. Ne jamais exposer les outils administrateur, les fonctions de paiement internes ou les mutations génériques aux clients.

## Architecture et fichiers pressentis

| Couche | Réutiliser/auditer | Évolution prévue |
|---|---|---|
| OAuth | src/pages/OAuthConsent.tsx ; src/lib/authPostLogin.ts ; configuration Supabase Auth | certifier PKCE, scopes OIDC, consentement, client_id, token refresh |
| Passerelle | supabase/functions/tok-connect-remote-mcp/index.ts ; tok-connect-chatgpt/index.ts | allowlist ciblée + erreurs OAuth + outils client dédiés |
| Autorisation | supabase/functions/_shared/tok-connect-auth.ts ; RLS existantes | scopes métier/RLS distincts ; propriété client ; séparation rôle restaurant |
| Découverte | _shared/tok-connect-discovery.ts ; discovery-widget.ts | disponibilité temps réel, menu, modes service et ouverture du tunnel |
| Réservation | tok-connect-api ; tok-connect-mcp ; RPC de réservation | preview idempotent, confirmation transactionnelle, annulation |
| Panier | modèles commandes, prix, stocks et services existants | façade panier serveur et devis expirant |
| Zéro Attente | create-zero-attente-reservation ; _shared/zero-attente.ts | orchestration atomique |
| Paiement | create-checkout ; complete-order-checkout ; stripe-webhook | Stripe externe éligible, webhooks et rapprochement |
| UI | nouvelle ressource MCP Apps dans le module TOK Connect | parcours multi-étapes responsive, sans iframe de paiement bricolée |
| Tests | src/test/tok-connect-*.test.ts et tests Stripe/checkout/Zéro Attente | nouveaux contrats outils, sécurité, E2E widget et chaos paiement |

N'ajouter des migrations, indices, RLS ou nouvelles fonctions qu'après inventaire du schéma réel, vérification des migrations déjà appliquées et justification. Ne pas écrire de migrations théoriques.

## Sécurité et conformité

- JWT utilisateur validé à chaque appel, tenant/client restaurant lié par des vérifications serveur, RLS appliquée ; jamais de service_role côté widget.
- Scopes OIDC d'identité ≠ droits de réserver, payer ou administrer.
- UI explicite avant toute opération non réversible et confirmation liée à un devis ou preview unique, pas seulement booléen libre envoyé par le modèle.
- CSRF/state/PKCE, anti-rejeu/idempotence, rate limits, signatures, validation d'entrée, quotas, journal d'audit sans PII ni token en clair.
- Toute donnée ou instruction renvoyée par un restaurant/menu/widget est traitée comme non fiable ; jamais une instruction à l'assistant ou un droit.
- Environnement test Stripe distinct de live, PII minimisées, conformité suisse protection des données et termes/conditions vérifiables.
- Conservation des limitations réelles de chaque restaurateur (horaires, stock, arrhes, service du soir, tables sans repas, capacité, zone livraison).

## PR et critères d'acceptation

### PR 1 — OAuth/diagnostic
Livrable : metadata et enregistrement OAuth validés, tests PKCE/refresh, logs exploitables, erreur legacy expliquée. **GO** seulement si connexion depuis un nouveau client de test fonctionne sans erreur missing scope.

### PR 2 — Réservation widget
Livrable : recherche → disponibilité → preview → confirmation → identifiant de réservation → annulation, y compris authentification et contrôle du propriétaire. **GO** si une réservation test réelle est visible une seule fois dans TOK et jamais au nom d'un autre client.

### PR 3 — Catalogue/panier
Livrable : options disponibles, variations, quantités, panier persistant, calcul serveur, stock, taxes et frais. **GO** si montants widget = backend TOK et remise/tarif non falsifiables.

### PR 4 — Zéro Attente
Livrable : couple table + commande préparée, gestion d'échec atomique, notifications. **GO** si aucun état incohérent n'est laissé lors d'un paiement échoué ou d'un retard webhook.

### PR 5 — Paiement
Livrable : Stripe Checkout TOK avec retour vérifié ; feuille de paiement ChatGPT uniquement si approuvée. **GO** si commande/payments/ledger/factures réconciliés, jamais de double paiement.

### PR 6 — Extensions client et lancement
Livrable : suivi, annulations, remboursements admissibles, fidélité, offres, variantes ; support, monitoring et déploiement progressif. **GO** après E2E mobile/desktop, revues sécurité et test de charge pertinent.

Chaque PR : branche dédiée hors main, fichiers limités au périmètre, tests ciblés, lint/typecheck/build selon risque, CI verte, revue RLS et Stripe quand concerné, commit propre, pas de merge automatique. Retour arrière par désactivation du flag dédié et revert, sans supprimer les données transactionnelles validées.

## Opérations manuelles/API non disponibles dans ce contexte

- Vérifier/éditer Authentication > OAuth Server et JWT signing keys sur la console Supabase.
- Modifier directement la configuration OAuth interne de l'app/connexion TOK Connect enregistrée dans ChatGPT.
- Confirmer l'approbation de l'app TOK pour le paiement ChatGPT embarqué.
- Obtenir un résultat de test Stripe sans environnement test dédié.

**Ne jamais déclarer la correction OAuth ni le checkout embarqué terminés avant la validation réelle de ces quatre points.**

## Références techniques

- Supabase Auth : https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase OAuth setup : https://supabase.com/docs/guides/auth/oauth-server/getting-started
- OpenAI MCP authentication : https://developers.openai.com/plugins/build/auth
- OpenAI MCP Apps UI : https://developers.openai.com/plugins/build/chatgpt-ui
- OpenAI checkout : https://developers.openai.com/plugins/build/monetization
- Stripe Connect : https://docs.stripe.com/connect
