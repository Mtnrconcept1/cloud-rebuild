# TOK Connect — contrôle des webhooks Stripe Test

État au 17 octobre 2026 : **contrôle en lecture seule disponible ; recette payante de bout en bout non validée**.

## Situation vérifiée

- Stripe TOK possède un accès Test et un accès Live séparés.
- Les deux webhooks trouvés dans Stripe Test sont désactivés et pointent vers le projet Supabase de production `wwcrtyoueexyxkkikaos`.
- L'ancienne branche Supabase Test `esmsehyxenyqewdfawie` a été supprimée après échec de reprise des migrations.
- La PR Draft #879 s'appuie encore sur cette ancienne cible. Elle ne doit pas être fusionnée ou exécutée telle quelle.
- Aucune nouvelle ressource facturable n'est créée par le présent contrôle.

Une connexion Stripe Test fonctionnelle ne prouve pas à elle seule qu'un paiement TOK est confirmé côté base de données et reçu par le restaurant.

## Vérification sans mutation

Script : `scripts/verify-tok-stripe-test-webhooks.mjs`.

Il effectue uniquement des requêtes GET à l'API Stripe Test. Il exige trois variables d'environnement fournies de manière sécurisée par l'opérateur :

| Variable | Usage |
| --- | --- |
| `TOK_TEST_SUPABASE_PROJECT_REF` | Référence de vingt caractères d'un projet Supabase de test distinct de la production |
| `TOK_TEST_SUPABASE_URL` | URL exacte `https://<ref>.supabase.co` de ce projet |
| `STRIPE_SECRET_KEY_TEST` | Clé serveur Stripe Test, fournie via un secret local/CI et jamais inscrite dans le dépôt |

Exécution après création autorisée et configuration d'un environnement isolé :

    node scripts/verify-tok-stripe-test-webhooks.mjs

Tests sans clé Stripe et sans accès réseau :

    pnpm exec vitest run src/test/tok-stripe-test-webhook-readiness.test.ts

Le contrôle échoue si la cible est la production, si l'URL ne correspond pas à la référence, si la clé n'est pas une clé Test, si un webhook Test actif vise la production, si le webhook attendu n'est pas actif et abonné aux événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`, ou si plusieurs webhooks actifs correspondent.

La clé n'est jamais affichée, et les erreurs Stripe externes ne sont pas réémises. Les webhooks désactivés qui pointent vers la production ne sont pas activés.

## Conditions restantes avant une recette transactionnelle complète

1. Chiffrer une **nouvelle** cible Supabase durable de démonstration et recevoir l'accord explicite avant toute création facturable.
2. Préparer son schéma et bloquer toute migration historique susceptible de déclencher du cron, du HTTP sortant, un webhook, un e-mail ou une notification de production. La reprise des migrations n'est **pas** autorisée automatiquement.
3. Configurer une vraie clé Stripe Test et un nouveau webhook Test signé vers le projet de démonstration uniquement. Les secrets restent dans des coffres sécurisés.
4. Exécuter le script en lecture seule et résoudre tout échec.
5. Tester avec deux identités autorisées les scénarios réservation, commande et offres, puis réconcilier Checkout, événements signés, commande/réservation, notifications client et interface restaurateur. Vérifier l'idempotence en rejouant les événements Test ; annuler/nettoyer les données de recette.
6. Préparer les identifiants de démonstration et la vérification développeur nécessaires à la revue de publication OpenAI.

Ce script n'envoie pas de webhook, ne crée pas de paiement ni de réservation, ne modifie pas Supabase et ne déploie rien. Il **n'atteste pas** de l'isolation de la base de données, du bon fonctionnement de RLS, des migrations, des emails ou de la disponibilité du widget authentifié.

## Retour arrière

La modification est limitée à un script, des tests et cette documentation. Fermer la PR et supprimer sa branche annule entièrement sa livraison sans toucher à la production, aux clés Stripe, aux endpoints ou aux données.
