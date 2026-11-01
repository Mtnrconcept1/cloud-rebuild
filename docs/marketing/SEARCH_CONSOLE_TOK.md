# Recherche Google dans le moteur éditorial TOK

Le centre marketing propose les impressions et les clics de la propriété `sc-domain:thetok.ch`. Les totaux viennent des lignes journalières. La liste éditoriale retient parmi les requêtes reçues les positions moyennes 4 à 30, puis les classe par impressions. Elle ne mesure ni les sessions ni les conversions.

## Accès

Le navigateur passe par le BFF marketing, avec session MFA, contrôle CSRF et rôle administrateur revérifié. Le BFF délègue la lecture à l’Edge Supabase `ai-marketing-agent` après vérification de la session et du rôle administrateur. Seule cette Edge lit `WINDSOR_API_KEY`. Le workflow de déploiement synchronise la clé depuis l’environnement GitHub `Production` vers le projet Supabase TOK. Une valeur GitHub absente n’écrase pas une clé Edge existante. La fenêtre couvre les sept jours se terminant à J−3 UTC. Si Windsor est indisponible, le BFF recherche le dernier relevé importé dans la table protégée. Le panneau affiche la provenance, la période et le nombre de jours observés. L’import local dans le panneau ne transmet pas le fichier au serveur.

Le contrôle GitHub `Verify TOK Windsor connection` vérifie les métadonnées du secret Supabase et lit sept jours sur la propriété TOK sans publier le relevé. Une limite de comptes peut produire une réponse HTTP 200 contenant des données de démonstration. L’Edge refuse ces lignes et le panneau identifie la limite du fournisseur. Le relevé privé précédent reste disponible. La connexion de l’assistant Windsor et la clé de l’application peuvent présenter des listes de connexions différentes ; vérifier la limite avec la clé destinée au serveur.

## Relevé privé récurrent

1. Dans Windsor, lire uniquement Search Console et le compte `sc-domain:thetok.ch`. Choisir les mêmes dates pour les deux lectures. Récupérer `site,date,clicks,impressions` pour les jours et `site,query,clicks,impressions,position` pour les requêtes, sans dimension date dans cette deuxième lecture.
2. Construire un JSON contenant `property`, `from`, `to`, `daily` et `queries`. Fournir les lignes telles que renvoyées par Windsor. Facultativement, ajouter `previousDaily` (mêmes champs quotidiens, période précédente de durée identique) et `pages` (site, page, clics et impressions sur la période actuelle). Le moteur filtre les URL publiques TOK et ignore les URL contenant paramètres ou fragment. Les anciens exports sont compatibles. Ne jamais committer le relevé ou le SQL généré dans le dépôt public.
3. Après livraison de la migration et vérification du projet cible, importer sur un poste autorisé en générant une requête privée avec `node --experimental-strip-types scripts/import-marketing-search-console.mts CHEMIN_DU_RELEVE`. Exécuter uniquement cette requête sur le projet TOK vérifié, via le connecteur Supabase ou une connexion opérateur. Le programme accepte un relevé validé, impose une taille maximale et encode le JSON en base64 avant la construction du SQL. Le rejeu du même relevé est sans effet. Une période antérieure ne remplace pas une période plus récente.
4. Un administrateur peut sélectionner une requête dans « Recherche Google », préparer un brief, le relire et enregistrer le sujet dans l’éditeur existant. Le bouton préserve tout brief déjà commencé. L’import depuis un fichier reste possible avant le premier rafraîchissement serveur.

## Publication d’une révision approuvée

Dans le projet TOK vérifié, `scripts/marketing-approved-blog.sql` sélectionne en lecture seule les révisions actuellement approuvées, leur profil et le rôle de l’approbateur. Sur le worktree de publication dédié, passer un seul objet `snapshot` à `node --experimental-strip-types scripts/prepare-approved-blog.mts CHEMIN_PRIVE.json`. Le programme ajoute le guide au catalogue, refuse un conflit de slug et accepte le rejeu sans modifier le contenu. Exécuter `node --test scripts/blog-seo.test.mjs scripts/prepare-approved-blog.test.mjs`, puis relire la sélection privée avant de fusionner la seule PR autorisée. Une révocation, une pause ou un changement de version interrompt la publication. Ne pas placer l’entrée privée dans Git.

## Recette et retrait

Tester les imports uniquement sur une base jetable avec la fixture du moteur, la migration du relevé puis `supabase/tests/marketing_search_console_report.sql`. Vérifier aussi le refus des accès directs, une session révoquée, l’absence de fournisseur, le rejeu et une période vide. Un revert du code retire le panneau. Pour suspendre les imports, arrêter la consigne correspondante de la tâche SEO. Conserver les données privées lors d’un retour arrière.
