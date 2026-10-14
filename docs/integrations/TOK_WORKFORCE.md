# TOK Équipe — intégration de SwissTime Tracker

Source analysée : dépôt privé \`mtnrconcept/swiss-time-tracker\` (branche \`main\`, commit \`7cab98100ae189b7eec1234a7cbc6b49db2f95b7\`).

## Choix d'architecture
Portage natif des fonctions de gestion du personnel vers le dashboard restaurateur TOK plutôt qu'un iframe, une double authentification ou une liaison directe vers la base SwissTime.

- Routes : \`/dashboard/equipe\` (restaurateur) et \`/admin/equipe\` (administrateur).
- Identité visuelle : composants, thèmes clair/sombre et navigation existants de TOK.
- Données : tables \`tok_workforce_*\` isolées par \`restaurant_id\`, FKs composites et policies RLS. Aucune migration historique de SwissTime n'est importée et ses tables \`profiles\`, \`user_roles\` ou \`employees\` ne sont pas réutilisées.
- Activation : administrateur TOK uniquement, \`tok_workforce_settings.enabled=false\` par défaut, contrôlé par la base pour toute mutation du restaurateur. Historique d'activation serveur.
- Données : employés, shifts, heures effectuées, validations nominatives, absences, demandes, échanges et rapports.
- Approvisionnement : pas de synchronisation de comptes ni de secrets entre les deux projets Supabase. Les employés sans compte TOK sont gérés par leur responsable. Les vues RH collaborateurs basées sur leurs comptes TOK pourront être activées après invitation et attribution de \`user_id\`.
- Échanges : fonction transactionnelle \`tok_workforce_review_exchange\`, restreinte au restaurant, pour déplacer les services lors d'une approbation.
- Règles : les alertes de pauses, repos, chevauchements et dépassements sont des indicateurs et ne constituent pas une certification LTr ni un calcul de paie.

## Fonctionnalités conservées et adaptations
- Collaborateurs : création et désactivation.
- Planning : grille sur 7 jours, création/confirmation/déplacement d'un jour/suppression, absences visibles.
- Heures : relevés de travail, validation nominative historisée (pas une signature électronique qualifiée).
- Absences et demandes : saisie, suivi, acceptation/refus.
- Échanges : propositions avec ou sans permutation réciproque, validation transactionnelle.
- Rapports : récapitulatif hebdomadaire, export CSV protégé contre les formules, contrôles horaires.
- Assistant IA : la fonction SwissTime originale dépend d'une clé et d'un service Lovable, et récupère des données via une clé privilégiée. Elle **n'est pas réutilisée** dans cette première intégration. Les contrôles déterministes évitent d'exposer des données RH privées au fournisseur IA. Toute future IA devra passer par la facturation IA et les autorisations propres à TOK.

## Déploiement et retour arrière
1. Vérifier la migration dans un environnement Supabase de développement, l'accès admin, les employés liés/non liés, les accès croisés entre deux restaurants et les permissions anonymes.
2. Exécuter le test ciblé \`pnpm exec vitest run src/test/tokWorkforce.test.ts\`, \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\`.
3. Faire réviser la PR et ses contrôles GitHub Actions avant tout déploiement.
4. Appliquer la migration suivant le pipeline existant (ne pas exécuter manuellement en production), publier puis activer depuis \`/admin/equipe\` restaurant par restaurant.
5. Pour revenir en arrière, basculer \`enabled=false\` sur les établissements concernés : les données restent intactes. Une migration ultérieure serait nécessaire pour supprimer les tables si cela était voulu.

Il reste à confirmer les procédures RH locales, la conservation des données et les garanties légales de la validation nominative avant un usage officiel pour la paie.
