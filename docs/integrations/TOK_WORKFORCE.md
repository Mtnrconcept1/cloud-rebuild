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
- Assistant IA : la fonction SwissTime originale dépend d'une clé et d'un service du prestataire externe historique, et récupère des données via une clé privilégiée. Elle **n'est pas réutilisée** dans cette première intégration. Les contrôles déterministes évitent d'exposer des données RH privées au fournisseur IA. Toute future IA devra passer par la facturation IA et les autorisations propres à TOK.

## Déploiement et retour arrière
1. Vérifier la migration dans un environnement Supabase de développement, l'accès admin, les employés liés/non liés, les accès croisés entre deux restaurants et les permissions anonymes.
2. Exécuter le test ciblé \`pnpm exec vitest run src/test/tokWorkforce.test.ts\`, \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\`.
3. Faire réviser la PR et ses contrôles GitHub Actions avant tout déploiement.
4. Appliquer la migration suivant le pipeline existant (ne pas exécuter manuellement en production), publier puis activer depuis \`/admin/equipe\` restaurant par restaurant.
5. Pour revenir en arrière, basculer \`enabled=false\` sur les établissements concernés : les données restent intactes. Une migration ultérieure serait nécessaire pour supprimer les tables si cela était voulu.

Il reste à confirmer les procédures RH locales, la conservation des données et les garanties légales de la validation nominative avant un usage officiel pour la paie.


## Extension badgeuse et espace collaborateur (octobre 2026)

La source SwissTime contient les pages employé (Mon planning, Mes heures, Mes compteurs, Mes demandes), les échanges, les analyses et les PDF, **mais pas de badgeuse opérationnelle**. Celle-ci est donc construite comme fonctionnalité native TOK.

- `/equipe/mon-espace` : connecté avec son compte TOK, un collaborateur trouve son invitation par e-mail vérifié, l'accepte volontairement et accède uniquement à ses données.
- Badgeuse : arrivée, début et fin de pause, départ. Horodatage serveur immuable dans `tok_workforce_clock_events` et sessions `tok_workforce_clock_sessions`. Une seule session active par employé. Aucune écriture directe dans ces tables depuis le navigateur.
- Conversion automatique en relevé d'heures uniquement si la durée est valide ; sessions longues ou impossibles à convertir à régulariser dans l'espace responsable.
- Échanges de service : le collègue doit accepter avant validation transactionnelle par le responsable.
- Côté restaurateur : présence en temps réel, pointages à contrôler, coûts prévisionnels basés sur un coût horaire facultatif, alertes de repos, planning réorganisable, rapport CSV et impression / PDF.
- Les comptes collaborateurs n'acquièrent jamais le rôle `restaurateur` de TOK. Ils sont uniquement associés à un identifiant d'employé vérifié et contrôlés par RLS.
- Les données RH de deux restaurants distincts ne sont jamais mélangées ; les fonctions `SECURITY DEFINER` vérifient explicitement le restaurant, la session authentifiée et l'employé.
- Aucune commande ou facturation Stripe n'est touchée, aucun service IA tiers n'accède aux données RH.

### Limites et validation

La badgeuse exige un navigateur avec une connexion Internet pour enregistrer chaque action sur le serveur ; un clic hors ligne n'est pas un pointage validé. Les décalages d'horaires inhabituels, erreurs de saisie et changements d'heure sont à revoir par un responsable avant la paie. Les projections financières, nuits, dimanches et contrôles de temps de repos sont indicatifs. L'impression native permet d'enregistrer un PDF depuis le navigateur.

Avant déploiement : appliquer la migration dans l'environnement de développement ou via le pipeline contrôlé, confirmer RLS/GRANT et tester deux restaurants et deux collaborateurs distincts. Puis lancer les tests ciblés, le typecheck, le lint et le build. Retour arrière : désactiver TOK Équipe par restaurant sans effacer les données.
