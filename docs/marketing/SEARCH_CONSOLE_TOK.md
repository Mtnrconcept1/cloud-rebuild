# Recherche Google dans le moteur éditorial TOK

Le centre marketing propose les impressions et les clics de la propriété `sc-domain:thetok.ch`. Les totaux viennent des lignes journalières. La liste éditoriale retient parmi les requêtes reçues les positions moyennes 4 à 30, puis les classe par impressions. Elle ne mesure ni les sessions ni les conversions.

## Accès

Le navigateur passe par le BFF marketing, avec session MFA, contrôle CSRF et rôle administrateur revérifié. Le serveur utilise la variable privée `WINDSOR_API_KEY` si elle existe. La fenêtre couvre les sept jours se terminant à J−3 UTC. Si Windsor est indisponible, le BFF recherche le dernier relevé importé dans la table protégée. Le panneau affiche la provenance, la période et le nombre de jours observés. L’import local dans le panneau ne transmet pas le fichier au serveur.

## Relevé privé récurrent

1. Dans Windsor, lire uniquement Search Console et le compte `sc-domain:thetok.ch`. Choisir les mêmes dates pour les deux lectures. Récupérer `site,date,clicks,impressions` pour les jours et `site,query,clicks,impressions,position` pour les requêtes, sans dimension date dans cette deuxième lecture.
2. Construire un JSON contenant `property`, `from`, `to`, `daily` et `queries`. Fournir les lignes telles que renvoyées par Windsor. Ne jamais committer le relevé ou le SQL généré dans le dépôt public.
3. Après livraison de la migration et vérification du projet cible, importer sur un poste autorisé en générant une requête privée avec `node --experimental-strip-types scripts/import-marketing-search-console.mts CHEMIN_DU_RELEVE`. Exécuter uniquement cette requête sur le projet TOK vérifié, via le connecteur Supabase ou une connexion opérateur. Le programme accepte un relevé validé, impose une taille maximale et encode le JSON en base64 avant la construction du SQL. Le rejeu du même relevé est sans effet. Une période antérieure ne remplace pas une période plus récente.
4. Un administrateur peut sélectionner une requête dans « Recherche Google », préparer un brief, le relire et enregistrer le sujet dans l’éditeur existant. Le bouton préserve tout brief déjà commencé. L’import depuis un fichier reste possible avant le premier rafraîchissement serveur.

## Recette et retrait

Tester les imports uniquement sur une base jetable avec la fixture du moteur, la migration du relevé puis `supabase/tests/marketing_search_console_report.sql`. Vérifier aussi le refus des accès directs, une session révoquée, l’absence de fournisseur, le rejeu et une période vide. Un revert du code retire le panneau. Pour suspendre les imports, arrêter la consigne correspondante de la tâche SEO. Conserver les données privées lors d’un retour arrière.
