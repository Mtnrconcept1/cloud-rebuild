# Réseaux des restaurants

## Objectif et parcours

La rubrique **Réseaux des restaurants** du Studio Marketing prépare et conserve le suivi des comptes Instagram et Facebook des restaurants de la base TOK. Elle est accessible aux administrateurs du Studio sous `?view=social_follow`, avec les protections marketing existantes.

1. Ouvrir la rubrique et vérifier les comptes TOK affichés pour Instagram et Facebook.
2. Lancer la recherche des profils. La collecte progresse par lots de trois restaurants au maximum et conserve son avancement en base. Garder la rubrique ouverte pour enchaîner les lots ; le bouton d’arrêt ou la sortie de la rubrique interrompt l’enchaînement. Les lots déjà enregistrés restent disponibles à la reprise.
3. Relire les comptes retrouvés avec le nom, la ville et le lien source du restaurant. Un profil retrouvé reste un candidat à vérifier. Plusieurs établissements liés au même profil partagent une seule fiche de compte.
4. Ouvrir le profil dans Instagram ou Facebook, vérifier l’établissement et le compte TOK actuellement utilisé, puis effectuer l’abonnement dans l’interface du réseau social.
5. Revenir dans TOK et confirmer l’état réellement observé. Une demande d’abonnement en attente reste distincte d’un abonnement confirmé. Ouvrir un lien ne change aucun état de suivi.

Le mode **Restaurants à rechercher** permet de retrouver un établissement, de relancer sa recherche lorsque le délai l’autorise, ou d’ajouter un profil manuellement avec sa source et une note. Les filtres et la pagination permettent de traiter la liste progressivement.

## Signification des données

| Donnée | Signification |
| --- | --- |
| Identité à vérifier | Un lien de profil a été trouvé ; son rattachement au restaurant doit encore être relu. |
| Identité vérifiée | L’opérateur a confirmé que le profil appartient au restaurant. |
| Profil rejeté | Le candidat ne correspond pas au restaurant. |
| Suivi inconnu | Aucun état confirmé pour le compte TOK actuellement configuré. |
| Non suivi | L’opérateur a constaté que TOK ne suit pas ce compte. |
| Demande envoyée | Une demande est en attente ; elle ne prouve pas un abonnement accepté. |
| Suivi confirmé | L’opérateur a constaté l’abonnement depuis le compte TOK indiqué. |
| Ignoré | Le compte ne fait pas partie de la file à traiter actuellement. |

L’état de suivi est rattaché à l’identifiant du compte TOK source. Changer de compte Instagram ou de page Facebook dans les intégrations ne transfère pas les confirmations de l’ancien compte vers le nouveau. Les écritures vérifient aussi une version attendue : un onglet périmé doit actualiser la fiche avant d’enregistrer.

La collecte lit les liens sociaux existants des restaurants et les sites web associés dans le catalogue commercial. Elle n’écrase pas les champs sociaux historiques de la fiche restaurant. Les restaurants de démonstration sont exclus.

Les compteurs décrivent la collecte, sans garantir une couverture exhaustive des réseaux sociaux. « Aucun profil trouvé » signifie qu’aucun lien exploitable n’a été extrait des pages consultées. Un site absent, un refus `robots.txt`, une erreur HTTP ou un site construit uniquement en JavaScript peut nécessiter une recherche humaine. Un `robots.txt` redirigé vers une autre origine est signalé comme non pris en charge ; ses règles ne sont pas attribuées au mauvais site. Les redirections HTML et les redirections de `robots.txt` dans la même origine sont prises en charge. Une URL Facebook sous forme d’identifiant et une URL sous forme de nom peuvent désigner le même compte sans que cette équivalence soit déductible du site source.

## Architecture et contrôle des accès

Le navigateur passe exclusivement par `POST /api/marketing/social-follow`. Les cinq actions publiques sont `list`, `restaurants`, `collect`, `add` et `record`. Le contrat partagé refuse les champs inconnus, les opérations internes et les preuves de session fournies dans le corps par le navigateur.

Le BFF vérifie l’hôte et l’origine marketing, la session HttpOnly, le jeton CSRF et le rôle administrateur courant. Il transmet à l’Edge Function `marketing-social-follow` une enveloppe serveur fermée contenant la requête et les empreintes de session/CSRF. Le service SQL vérifie de nouveau la session et le rôle avant toute lecture ou écriture. Aucun secret Meta n’est nécessaire à ce module.

Cinq tables additives séparent les profils uniques (`marketing_social_profiles`), leur provenance par restaurant (`marketing_social_profile_restaurants`), les confirmations par compte TOK (`marketing_social_follows`), les travaux de recherche (`marketing_social_discovery_jobs`) et la coordination des requêtes vers chaque site (`marketing_social_origin_guards`). Elles ont la RLS activée et aucun accès direct pour les rôles API. Les opérations passent par les fonctions serveur autorisées, avec des privilèges minimaux et un `search_path` fixé.

Le collecteur reçoit uniquement les sites enregistrés côté serveur. Il utilise le transport HTTP public existant avec résolution DNS contrôlée et connexion à l’adresse validée. Les hôtes locaux/privés, les redirections dangereuses et les adresses de réseaux sociaux à collecter sont refusés. Il respecte les règles `robots.txt`, borne le nombre de pages, la taille des réponses et la durée. Il extrait des liens HTML et des données structurées sans exécuter de JavaScript.

La réservation des travaux est transactionnelle. Elle limite la collecte à trois restaurants simultanés, conserve un bail récupérable après interruption et impose des délais avant nouvelle tentative. La coordination par origine partage les règles `robots.txt`, les baux de requête et les délais `Crawl-delay` / `Retry-After` entre instances du collecteur. Les opérations internes de réservation et de fin de requête ne sont pas accessibles depuis le navigateur. Un échec sur une page conserve les profils déjà extraits et laisse la recherche éligible à une nouvelle tentative selon son délai.

La collecte n’utilise pas le quota de tentatives de connexion du Studio. Son budget est de 12 secondes par restaurant, 45 secondes côté Edge et 55 secondes côté BFF ; la route Node autorise 90 secondes pour inclure les contrôles d’identité. Le navigateur autorise 95 secondes pour une collecte et 50 secondes pour les autres actions.

## Validation reproductible

Utiliser le gestionnaire de paquets versionné et la version Node supportée par le dépôt :

```sh
pnpm exec vitest run src/test/marketing-*.test.ts src/test/marketing-*.test.tsx src/test/pinned-public-http.test.ts --maxWorkers=2
pnpm lint
pnpm typecheck
pnpm build:prod
pnpm docs:application-index:check
```

Les tests du module couvrent les liens de profil et les liens de partage, les redirections, les adresses privées, les limites de collecte, les interruptions, les contrôles BFF/Edge, la validation manuelle, les erreurs et les changements de compte TOK. Ils comprennent la coordination de plusieurs instances, une reprise après un délai long et la conservation des résultats partiels.

Les assertions SQL s’exécutent exclusivement dans une instance PostgreSQL jetable. La fixture crée les rôles et un schéma minimal ; elle ne doit jamais être appliquée à une base TOK. Exécuter dans cet ordre, avec `psql --set=ON_ERROR_STOP=1 --file=...` sur cette instance :

1. `supabase/tests/marketing_social_follow_fixture.sql`
2. `supabase/migrations/20261019023751_marketing_social_follow_queue.sql`
3. La même migration une seconde fois pour vérifier son idempotence.
4. `supabase/tests/marketing_social_follow.sql`

Les assertions vérifient les privilèges des cinq tables, les gardes de session, les doublons, les baux, les versions, les confirmations et la coordination par origine. Elles complètent le contrôle Deno de `supabase/functions/marketing-social-follow/index.ts`. Une recette visuelle et un essai DNS/TLS réels restent nécessaires en environnement de validation accessible ; les mocks de transport ne les remplacent pas.

## Mise en service et retour arrière

Après validation et fusion de la PR, utiliser le workflow de production existant dans cet ordre : migration Supabase, Edge Function `marketing-social-follow`, puis BFF/frontend. La configuration de la nouvelle Edge Function délègue la vérification de la clé serveur à son handler ; sa désactivation du contrôle JWT de la passerelle ne rend pas l’endpoint public. Les comptes TOK source sont lus depuis la configuration publique des intégrations marketing existantes.

La recette en environnement déployé consiste à rechercher quelques restaurants connus, vérifier leurs sources, arrêter puis reprendre la collecte, ouvrir un profil et enregistrer un état relu depuis le bon compte TOK. Les abonnements s’effectuent dans Instagram/Facebook. Aucun traitement de cette rubrique n’appelle une API de mass-follow ou ne clique automatiquement sur « Suivre ».

En cas de retour arrière, retirer le nouvel écran et ses points d’entrée, puis conserver les nouvelles tables pour préserver les profils et l’historique. Les travaux en cours expirent sans réexécution automatique. Aucune suppression de restaurants ou de contacts n’est nécessaire. Les migrations historiques, les fonctions d’envoi marketing, les secrets et les règles de déploiement Git restent hors du périmètre de ce module.
