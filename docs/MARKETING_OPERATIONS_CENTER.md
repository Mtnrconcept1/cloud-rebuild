# Centre d’opérations marketing TheTOK

Le centre d’opérations marketing est une surface d’administration isolée du chrome client, accessible à l’URL canonique `https://marketing.thetok.ch/marketing`. La route React exige le rôle Supabase `admin`, le feature flag `admin-marketing-operations` et les RPC appliquent à nouveau les contrôles admin/RLS côté base de données. Le nom d’hôte n’est pas une autorisation.

> État de livraison : les composants, la migration et les Edge Functions sont présents dans le code. « Opérationnel maintenant » ci-dessous signifie **opérationnel après fusion et déploiement de cette livraison** ; cela ne signifie pas que le sous-domaine, la migration ou les secrets sont déjà actifs en production.

## État fonctionnel exact

| Bloc | Opérationnel maintenant | Après API | Prérequis prod |
|---|---|---|---|
| Accès | Workspace dédié, route admin, feature flag, redirection du host vers `/marketing`, en-têtes `noindex`/`no-store`, absence du menu et du panier client | Aucun connecteur requis | Domaine Vercel, DNS/TLS, contrôle réel avec comptes anonyme/non-admin/admin et durcissement de session host-only |
| Campagnes | Création en brouillon, estimation serveur de l’audience, approbation de la campagne, création et approbation séparée des éléments calendrier, annulation | Créatifs ou variantes produits par un service externe, si un tel service est ajouté plus tard | Migration appliquée, contacts synchronisés et pause globale conservée pendant la recette |
| Calendrier | Grille mensuelle et agenda filtré, horaires `Europe/Zurich`, programmation, statut, note de publication manuelle et journalisation | Publication directe sur les réseaux ou le site après adaptateur dédié | Scheduler prêt pour les canaux exécutables ; opérateur désigné pour les publications manuelles |
| Audiences | Synchronisation du catalogue de prospects et des consentements clients existants, filtres autorisés, comptage total/éligible par canal, cibles masquées | Enrichissement externe autorisé et traçable, après intégration dédiée | Vérifier provenance, base légale, consentement, oppositions et qualité des données avant tout envoi |
| Exécution | Notifications `in_app` consenties ; matérialisation de tâches `manual_call`, `manual_email` et `manual_visit` ; clôture humaine avec note ; cron calendrier | Email, push et réseaux sociaux uniquement après adaptateur fournisseur réellement déployé et testé | Vault, Edge Functions, `pg_cron`, `pg_net`, pause globale, approbations, limites et test interne |
| Journal et résultats | Statuts des éléments et livraisons, destinataire masqué, canal, fournisseur, tentatives, dates, erreurs, événements et agrégats envoyés/livrés/cliqués/convertis | Accusés réels et conversions fournisseur après webhooks/adaptateurs | Définir les identifiants de conversion et valider la qualité des événements ; les KPI actuels ne constituent pas une attribution marketing complète |
| Automatisations | Le planificateur calendrier est la seule automatisation exécutable. Une règle personnalisée peut être décrite et enregistrée en pause | Moteur de règles à concevoir puis brancher ; aucun moteur n’est fourni par cette livraison | Revue métier, juridique et technique avant toute future activation |

## Ce que l’outil ne fait pas

Cette livraison n’implémente pas :

- de modèle ML, de scoring prédictif ou d’optimisation automatique des canaux ;
- de `dry-run` de campagne ;
- de circuit breaker automatique ni de mise en pause fondée sur un seuil d’erreurs ;
- de moteur d’automatisations personnalisées ;
- de génération automatique de contenu ;
- d’adaptateur Resend, Firebase, Meta, TikTok, LinkedIn, YouTube, Telegram, Google Business ou site web ;
- d’achat média, de canal payant ou de promesse de coût fournisseur nul ;
- d’envoi automatisé de prospection froide.

La recommandation affichée dans le wizard de campagne est **déterministe et sans ML** : elle part du type d’audience et ne retient que les canaux dont l’état backend est `available` ou `manual`. L’opérateur garde la décision finale. Même si une ligne d’intégration externe était marquée `connected` prématurément, l’orchestrateur bloque le canal tant que son adaptateur n’est pas déployé.

## Canaux réellement disponibles

| Canal | État initial | Traitement actuel |
|---|---|---|
| `in_app` | `connected` | Envoi automatique possible vers un utilisateur éligible via le pipeline de notifications TheTOK |
| `manual_call`, `manual_email`, `manual_visit` | `manual` | Création d’une tâche par contact ; une personne effectue l’action et clôt la tâche avec une note obligatoire |
| `tok_news` | `manual` | Publication éditoriale effectuée hors de l’orchestrateur, puis marquée publiée ou en échec dans le calendrier |
| Email Resend, push Firebase | `blocked_configuration` | Aucun envoi ; adaptateur, configuration fournisseur et retours réels absents |
| Instagram, Facebook, TikTok, LinkedIn, YouTube, Telegram, Google Business, site | `disconnected` | Aucun appel API et aucun départ. La clôture manuelle ne devient possible qu’après passage explicite de l’intégration à `manual` côté backend |

Les canaux publics ne créent aucune livraison individuelle. Les canaux directs vérifient la base légale, le consentement ou la relation existante selon le canal, les préférences utilisateur et les suppressions avant matérialisation.

## Parcours opérateur

1. **Synchroniser les sources** depuis l’écran Audiences. Le retour ne contient que des comptes, jamais les coordonnées brutes.
2. **Créer une campagne** avec une audience effective, un message, une date et un ou plusieurs canaux disponibles ou manuels. Un filtre vide est refusé.
3. **Contrôler l’estimation** serveur. Un canal individuel sans contact éligible ne peut pas produire son brouillon ; un canal public peut avoir une audience individuelle égale à zéro.
4. **Approuver la campagne** avec une justification, puis approuver et programmer chaque élément calendrier séparément.
5. **Exécuter** par le cron ou le bouton de traitement des éléments dus, uniquement après levée explicite de la pause globale. Une publication publique manuelle est clôturée dans le calendrier ; une tâche humaine individuelle est clôturée dans le journal.
6. **Suivre** les statuts, erreurs et résultats dans Journal et Résultats. Une nouvelle tentative n’est possible que si le parent reste approuvé, le contact reste éligible et la limite de tentatives n’est pas atteinte.

## Garde-fous présents

- `global_pause = true` au déploiement initial ; sa levée exige un motif et un scheduler confirmé prêt.
- Double validation : campagne puis élément calendrier.
- Feature flag agissant comme kill-switch supplémentaire.
- Ciblage vide ou clé de filtre inconnue refusés côté base.
- Consentement, préférences, opposition et base légale vérifiés côté base, pas seulement dans l’interface.
- Fenêtre individuelle en heure suisse, avec claims arrêtés avant 20 h ; les canaux publics restent manuels dans l’implémentation actuelle.
- Plafond journalier par défaut de 500 livraisons et pression de contact par défaut de 72 heures.
- Leases, idempotence, verrouillage `SKIP LOCKED`, nombre maximal de tentatives et backoff pour les échecs rejouables.
- Révocation des privilèges par défaut, fonctions privilégiées séparées entre `authenticated` et `service_role`, RLS et journal d’audit.
- Cibles masquées et fingerprints non réversibles dans les vues admin ; aucun secret fournisseur dans le navigateur.
- Les désinscriptions et plaintes reçues par événement fournisseur suppriment le contact et annulent ses livraisons encore en attente.

Ces garde-fous ne constituent pas un circuit breaker : la détection d’un incident et l’activation de la pause restent des actions opérateur.

## Runbook Vault et secrets Edge

Générer des secrets aléatoires longs dans un gestionnaire approuvé. Ne jamais les placer dans une migration, une variable `VITE_*`, un ticket, un log ou une commande conservée dans l’historique shell.

| Nom | Stockage | Consommateur | Exigence |
|---|---|---|---|
| `marketing_edge_url` | Supabase Vault SQL | `invoke_marketing_orchestrator_cron()` | URL exacte `https://<project-ref>.supabase.co/functions/v1/marketing-orchestrator` du même environnement |
| `internal_cron_secret` | Supabase Vault SQL | Wrapper `pg_cron` | Même valeur que le secret Edge `INTERNAL_CRON_SECRET` |
| `INTERNAL_CRON_SECRET` | Supabase Edge Function Secrets | Authentification de `marketing-orchestrator` | Même valeur que `internal_cron_secret`, jamais exposée au frontend |
| `MARKETING_WEBHOOK_SECRET` | Supabase Edge Function Secrets | HMAC de `marketing-provider-webhook` | Requis avant d’exposer ou tester le webhook ; valeur dédiée, différente du secret cron |

Ordre recommandé :

1. Faire tourner tout secret historique qui aurait été stocké en clair dans une ancienne commande `pg_cron`.
2. Créer ou mettre à jour `internal_cron_secret` et `marketing_edge_url` dans Vault pour l’environnement visé.
3. Définir la même valeur sous `INTERNAL_CRON_SECRET` dans les secrets Edge et une valeur distincte sous `MARKETING_WEBHOOK_SECRET`.
4. Déployer les Edge Functions, puis appliquer la migration. Le bloc scheduler de la migration n’installe le job que si `pg_cron`, `pg_net`, Vault et les deux entrées Vault sont déjà prêts.
5. Si la migration a été appliquée avant les entrées Vault, exécuter à nouveau **uniquement le bloc idempotent d’installation du scheduler** dans une release revue ; ne pas créer une commande cron contenant un secret littéral.
6. Vérifier que `public.marketing_scheduler_ready()` vaut `true` et que `cron.job` contient un job actif nommé `tok-marketing-orchestrator`. Cette fonction confirme le job et Vault, pas l’égalité effective du secret Edge : valider aussi l’authentification de l’Edge Function dans un test sécurisé. Garder la pause globale active.

Le webhook générique attend `x-marketing-timestamp`, `x-marketing-signature` et une signature HMAC-SHA256 de `timestamp.body`, avec une tolérance de cinq minutes. Il ne remplace pas les adaptateurs ni les signatures officielles propres à chaque fournisseur.

## Sous-domaine Vercel et DNS

1. Déployer cette version sur le projet Vercel de production qui sert déjà TheTOK.
2. Ajouter `marketing.thetok.ch` aux domaines de ce projet dans Vercel.
3. Créer chez le fournisseur DNS l’enregistrement exact affiché par Vercel ; ne pas supposer sa cible. Attendre l’émission du certificat TLS et l’état domaine valide.
4. Conserver le callback PKCE sur `https://www.thetok.ch/auth/callback`. Ne pas ajouter de callback marketing tant que le flux de session privilégiée décrit ci-dessous n’est pas construit.
5. Vérifier que la racine du host redirige temporairement, sur le même origin, vers `/marketing` et que toutes ses réponses portent les en-têtes privés prévus.

Commandes de contrôle après propagation :

```bash
curl -I https://marketing.thetok.ch/
curl -I https://marketing.thetok.ch/marketing
```

## Prérequis de session privilégiée avant production

Le stockage d’authentification web actuel place encore la session Supabase dans des cookies lisibles par JavaScript et partagés avec `.thetok.ch`. Le rôle admin et les RLS protègent les appels backend, mais ce modèle ne protège pas le bearer admin contre une XSS sur un domaine frère.

Avant de considérer `marketing.thetok.ch` comme prêt pour un usage admin de production, mettre en place l’un des modèles suivants :

- échange serveur à usage unique depuis le callback canonique, puis cookie `Secure`, `HttpOnly` et **host-only** sur `marketing.thetok.ch` ; ou
- session d’administration marketing dédiée, elle aussi limitée au host et non lisible par JavaScript.

Une valeur `Domain=.thetok.ch` ne doit pas subsister pour la session privilégiée. Cette correction est un **prérequis production**, pas une amélioration facultative du sous-domaine.

## Tests et recette

Tests ciblés à exécuter :

```bash
pnpm vitest run \
  src/test/marketing-domain-isolation.test.ts \
  src/test/marketing-subdomain-integration.test.ts \
  src/test/marketing-sql-governance.test.ts \
  src/test/marketing-consent-dispatch.test.ts \
  src/test/marketing-orchestrator-schema.test.ts \
  src/test/marketing-edge-security.test.ts \
  src/test/marketing-operations-frontend.test.ts \
  src/test/marketing-zurich-time.test.ts \
  src/test/supabase-cors.test.ts \
  src/test/vercel-rewrites.test.ts \
  src/test/feature-flags.test.ts
pnpm lint
pnpm run build:prod
```

Recette de staging minimale :

1. Vérifier redirection, en-têtes, CORS exact et nettoyage de `code`, `state` et fragments de jetons.
2. Vérifier le refus d’un anonyme et d’un non-admin, puis l’accès d’un admin.
3. Vérifier que le flag coupé et la pause globale empêchent tout nouveau traitement.
4. Vérifier qu’un ciblage vide, un contact sans base légale et un contact opposé ne produisent aucune livraison.
5. Approuver une campagne interne et un élément `in_app` à très faible volume, puis confirmer la livraison dans le pipeline TheTOK.
6. Créer et clôturer une tâche humaine avec note ; créer et clôturer une publication manuelle avec note.
7. Confirmer que tous les canaux externes restent bloqués et qu’aucun appel fournisseur ne part.
8. Tester le webhook avec signature valide, signature invalide, timestamp expiré et identifiant d’événement dupliqué.

Il n’existe pas de mode `dry-run` : utiliser exclusivement une audience interne consentie et un volume minimal pendant la recette.

## Incident et arrêt

Activer immédiatement la pause globale en cas de doublon suspect, consentement ambigu, secret exposé ou erreur répétée. La pause empêche les **nouveaux claims** ; une opération déjà réclamée peut terminer, il faut donc contrôler le journal après l’arrêt. Le feature flag peut ensuite être coupé si la surface entière doit être neutralisée.

En cas de secret exposé, tourner la valeur Vault et la valeur Edge correspondante ensemble, redéployer la fonction concernée et vérifier qu’aucune ancienne commande `pg_cron` ne contient encore le secret. La reprise se fait manuellement, à faible volume, après vérification des éléments parents et des contacts éligibles.
