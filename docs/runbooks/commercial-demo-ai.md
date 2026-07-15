# OpenAI dans la démonstration commerciale

Les interfaces Assistant IA, Chat IA, Studio Marketing et Studio Photo utilisent
les vrais composants du dashboard. Depuis `/commercial/demo-live`, leurs
générations passent exclusivement par l'Edge Function Supabase
`commercial-demo-ai`, puis par OpenAI côté serveur.

Le commercial ne consomme aucun crédit TOK et n'est soumis à aucun quota métier
par session, jour ou mois. « Illimité » désigne cette absence de quota
applicatif : les limites techniques et de sécurité du fournisseur restent
applicables afin de protéger la plateforme.

## Garanties de sécurité et d'isolation

- `OPENAI_API_KEY` reste un secret Supabase et n'est jamais envoyé au navigateur ;
- le JWT est authentifié par la fonction, puis la session commerciale, le
  commercial propriétaire, le restaurant Démo et les flags actifs sont dérivés
  côté serveur ;
- le client ne choisit jamais un `restaurant_id`, un rôle ou un droit d'accès ;
- aucun débit de crédit TOK, abonnement ou événement de facturation n'est créé ;
- aucune écriture n'est faite dans les conversations, médias, crédits ou journaux
  comptables de production ;
- les textes sont enregistrés uniquement dans les tables
  `commercial_demo_ai_*` et les images dans le bucket privé
  `commercial-demo-ai` ;
- les anciennes RPC de génération factice ne sont plus exécutables par
  `authenticated` ; les RPC de lecture et d'archivage restent disponibles sous
  leurs contrôles RLS ;
- le navigateur bloque toujours les appels directs à `api.openai.com` et toutes
  les fonctions IA de production. Seul le slug exact `commercial-demo-ai` est
  autorisé sur l'origine Supabase de confiance.

La recommandation officielle OpenAI est de conserver la clé sur un backend et
dans une variable d'environnement :
<https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety>.

## Contrat de la passerelle

`POST /functions/v1/commercial-demo-ai` accepte trois actions :

- `chat` pour Assistant IA et Chat IA ;
- `visual_generate` pour Studio Marketing et Studio Photo ;
- `visual_history` pour restituer les créations de la session avec une URL
  signée de courte durée.

Une quatrième action interne, `maintenance_cleanup`, est réservée au scheduler
authentifié par secret. Elle vide la file de suppression Storage et n'est jamais
accessible avec le JWT d'un commercial.

Chaque génération porte un `request_id`. La fonction calcule elle-même
l'empreinte du payload : une répétition identique rejoue le résultat, une
réutilisation différente ou une requête encore en cours renvoie un conflit.
Les échecs restent rejouables sans créer de doublons.

Les réponses exposent `credit_units: 0` et indiquent le modèle réellement
utilisé. Les tokens et le coût fournisseur estimé sont journalisés dans le
domaine Démo pour l'observabilité interne ; ils ne deviennent jamais des crédits
facturés au commercial.

## Garde-fous sans quota commercial

L'absence de quota métier ne supprime pas les protections opérationnelles :

- taille maximale des messages, prompts, contextes et références ;
- validation des formats et signatures binaires d'image ;
- au plus deux références JPEG, PNG ou WebP de 4 Mio chacune, transmises
  temporairement à OpenAI pour l'édition et jamais publiées dans Storage ;
- délai maximal sur chaque appel OpenAI ;
- une génération active par clé d'idempotence et conflits explicites ;
- limites globales du fournisseur et coupe-circuit d'infrastructure ;
- URLs Storage privées et temporaires.

La rétention ne limite pas les appels : elle conserve au plus 30 jours de
données Démo, 100 visuels et 50 conversations par compte commercial, puis
supprime les plus anciennes ressources via une file Storage interne.

OpenAI applique aussi ses propres limites de débit, indépendamment des crédits
TOK : <https://developers.openai.com/api/docs/guides/rate-limits>.

## Ordre de déploiement

1. Appliquer la migration `20260715044653_commercial_demo_openai_gateway.sql`.
2. Confirmer que le secret Supabase `OPENAI_API_KEY` est présent sans en afficher
   la valeur.
3. Déployer l'Edge Function `commercial-demo-ai` avec `verify_jwt = false` au
   gateway Supabase : l'authentification JWT applicative reste obligatoire via
   `authenticateRequest`/`getUser`, comme pour les autres fonctions du projet.
4. Déployer le frontend seulement après la disponibilité de la fonction.
5. Vérifier que la migration a créé le job Cron
   `commercial-demo-ai-storage-cleanup`. Il est planifié toutes les cinq minutes
   lorsque `internal_cron_secret` existe dans Vault ; sinon ajouter le secret et
   rejouer la planification. Le drain opportuniste à chaque session reste un
   filet de sécurité.
6. Ne pas réactiver les RPC `commercial_demo_ai_respond` ou
   `commercial_demo_ai_generate_visual` pour le rôle `authenticated`.

## Vérification avant mise en production

1. Exécuter `commercial-demo-ai-policy.test.ts`,
   `commercial-demo-ai-workspaces.test.ts`, les tests de firewall commercial et
   les tests des effets sûrs.
2. Depuis une session commerciale active, envoyer un message dans Assistant IA
   puis Chat IA et vérifier que le modèle retourné n'est pas le moteur factice.
3. Générer un visuel Marketing puis Photo, recharger la page et vérifier
   l'historique ainsi que l'URL signée.
4. Rejouer le même `request_id`, puis le réutiliser avec un autre payload, pour
   valider respectivement le replay et le conflit `409`.
5. Confirmer que `credit_units` reste à zéro, que le coût fournisseur est tracé,
   et qu'aucune table IA, média, crédit ou comptable de production n'a reçu de
   ligne.
6. Confirmer qu'un utilisateur non mappé, une session inactive, un flag désactivé
   et un autre slug Edge sont refusés.
