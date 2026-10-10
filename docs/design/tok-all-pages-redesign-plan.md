# Refonte des outils TOK — 10 octobre 2026

## Périmètre et niveau de risque

Extension de la première refonte publique à toutes les routes et vues internes. Niveau 3 : les interfaces comprennent commandes, réservations, facturation et administration. Les changements portent sur présentation, compréhension, navigation et états de lecture ; les autorisations, mutations métier, paiements et bases restent régis par leurs contrats existants.

Base : `317e85f96bdef2bd42fc6e8954e07c7053b37ed2`. Branche et worktree dédiés : `codex/tok-all-pages-ux-20261010`.

## Constat observé dans le navigateur

Sur Réservations, à une largeur de fenêtre intermédiaire, le grand en-tête réparti en deux colonnes casse le titre au milieu d'un mot et occupe environ 440 pixels. Les liens de partage et un texte technique précèdent le planning. Les statistiques du composant commun disparaissent sur mobile. La navigation présente de nombreuses entrées et réserve beaucoup de hauteur à l'aide.

## Ordre des changements

1. Inventorier les routes, écrans et états dans trois matrices : restaurateur, client/livreur, administration/commercial/marketing. Distinguer revue du code, modification et vérification navigateur.
2. Remplacer le grand composant `DashboardPageHero` par un en-tête opérationnel : titre lisible, explication courte, actions, statistiques sémantiques sur tous les écrans, illustration TOK discrète.
3. Améliorer `DashboardLayout` : recherche dans les outils déjà autorisés, orientation, sélecteur de restaurant accessible, cibles tactiles et aide compacte.
4. Reprendre chaque groupe de pages : hiérarchie des tâches, labels de formulaires, réglages secondaires, états erreur/vide, tableaux mobiles et actions nommées. Fichiers précis consignés dans les matrices et le rapport final.
5. Vérifier les comportements modifiés, puis types, lint, build et suite pertinente. Relecture indépendante. Preview du commit vérifié et tests de rendu/interactions desktop/mobile, puis PR et merge après checks requis.

## Risques et protections

- Ne pas rendre une fonction accessible par la recherche si son feature flag ou son droit la bloque ; réutiliser le rendu et les contrôles de navigation existants.
- Ne pas représenter un échec réseau comme un résultat vide ou une valeur zéro.
- Ne pas déplacer ni recréer les contrôles de paiement, validation ou permissions sans préserver leurs handlers et confirmations.
- Ne pas utiliser la session production pour provoquer commandes, factures, publications ou paiements de test.
- Préserver les autres travaux : PR de sécurité, dépendances et lancement simultanées.

## Rollback et limites de preuve

Rollback par revert de la PR ; aucune migration à annuler. Une note de design reste une appréciation et ne certifie pas tous les parcours. Le rapport indiquera les écrans effectivement vérifiés, les états simulés et les accès manquants. Les domaines preview redirigent actuellement l'authentification vers le domaine canonique ; aucune protection ne sera contournée pour produire des captures.
