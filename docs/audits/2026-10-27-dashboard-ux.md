# Parcours des dashboards TOK — 27 octobre 2026

## Périmètre et résultat

Changement de niveau 2 : présentation, navigation, défilement et accessibilité du frontend. Travail réalisé dans le worktree `tok-dashboard-ux`, sur la branche `fix/dashboard-journey-ux`, à partir de `b6035212`. Aucun merge ni déploiement de production.

Les layouts communs corrigent l’arrivée sur les pages restaurateur et client, y compris lorsque le composant de destination apparaît après un chargement différé. Le focus est placé sur le nouveau contenu. Un changement de filtre conserve la position ; un changement de page ou d’onglet de profil repart du haut. Les liens vers une ancre sont respectés.

Le Studio Marketing possède une seule zone d’actions qui reste visible pendant le défilement, avec l’étape courante, le support, le format, le coût, un retour et une continuation explicite. Les trois étapes restent accessibles et les données saisies sont conservées au retour. La génération exige un brief valide. Les options de style avancées, les idées et les paramètres détaillés sont repliés. Les supports sont plus compacts sur téléphone ; le choix du format de sortie n’occupe plus un grand bloc technique avant le parcours.

Sur mobile, le client dispose de quatre raccourcis et d’un bouton Menu donnant accès aux destinations autorisées et activées. Le menu se ferme après une sélection. La page secondaire courante est nommée. Les intitulés peuvent revenir à la ligne et ne sont plus tronqués.

Les en-têtes de tâches sont compacts. Sur téléphone, les consoles décoratives sans indicateur sont masquées. Les pages d’accueil conservent leur présentation propre. Les étapes des parcours client partagés et celles de l’éditeur de formules ramènent également au début du contenu approprié ; une modale fait défiler son propre panneau.

## Vues recensées et rendues avec les composants réels

Les 42 vues ci-dessous ont été rendues avec les données fictives déterministes du dépôt, sans appel réseau ni mutation métier. Trois états supplémentaires du Studio Marketing ont été exportés. Ce contrôle couvre le montage, les requêtes simulées, les composants, les graphiques et les références aux ressources locales ; il ne remplace pas une recette connectée en production.

| Restaurateur | Route |
| --- | --- |
| Vue d’ensemble | `/dashboard` |
| Mon restaurant | `/dashboard/restaurant` |
| Menu | `/dashboard/menu` |
| Réservations | `/dashboard/reservations` |
| Commandes et retraits | `/dashboard/commandes` |
| Anti-gaspi | `/dashboard/offres` |
| Ventes flash | `/dashboard/ventes-flash` |
| Formules | `/dashboard/formules` |
| Campagnes | `/dashboard/campagnes` |
| Campaign Studio IA | `/dashboard/campaign-studio` |
| Performances | `/dashboard/performances` |
| Comparaison | `/dashboard/comparaison` |
| Avis clients | `/dashboard/avis` |
| Promotions | `/dashboard/promotions` |
| Réseaux sociaux | `/dashboard/reseaux-sociaux` |
| Actualités | `/dashboard/actualites` |
| Comptabilité | `/dashboard/factures` |
| Entrées | `/dashboard/factures/entrees` |
| Sorties | `/dashboard/factures/sorties` |
| Paramètres de facturation | `/dashboard/factures/parametres` |
| Mon compte / Facturation | `/dashboard/mon-compte-facturation` |
| Studio Marketing / Photos | `/dashboard/photos` |
| Support | `/dashboard/support` |
| Pilotage de service | `/dashboard/service` |
| Plan de salle | `/dashboard/plan-salle` |
| TOK Équipe | `/dashboard/equipe` |
| Assistant IA | `/dashboard/advisor` |
| CRM clients | `/dashboard/crm` |
| Notifications | `/dashboard/notifications` |
| TOK Connect | `/dashboard/tok-connect` |
| Guide | `/dashboard/guide` |

| Client | Route |
| --- | --- |
| Accueil | `/mon-espace` |
| Réservations | `/reservations` |
| Achats | `/commandes` |
| Avis | `/mes-avis` |
| Informations du profil | `/profil?tab=infos` |
| Favoris | `/profil?tab=favoris` |
| Abonnement | `/profil?tab=abonnement` |
| Fidélité | `/profil?tab=fidelite` |
| Notifications | `/notifications` |
| Mémoire TOK | `/memoire-tok` |
| Confirmation de commande | `/commande/confirmation` |

## Vérifications

Les tests de comportement couvrent le montage après Suspense, le retour en haut de page, la conservation du focus lors d’un rafraîchissement, les filtres et onglets, les ancres, l’annulation des animations planifiées, les étapes client, le défilement interne de modale, le menu mobile, la conservation du brief et la disponibilité des actions de génération.

La revue visuelle utilise des exports statiques clairement marqués « données de démonstration » : les actions métier y sont inactives. La session du navigateur disponible sur le site public n’était pas authentifiée. Aucune création, publication, commande, réservation, impression payante ou dépense IA n’a été déclenchée.

Les règles d’accès, feature flags, sélection du restaurant et contrats de génération/impression existants sont conservés. Aucune dépendance, variable d’environnement, migration, RLS, Edge Function, configuration Vercel ou workflow GitHub n’est modifié.

## Résultats des validations

- Suite de régression ciblée : **228 tests réussis**, 2 tests d’export désactivés dans l’exécution ordinaire ; 45 fichiers réussis et 1 fichier d’export sauté.
- Export visuel activé séparément : **2 tests réussis**, 42 vues et 3 étapes du Studio rendues, aucune mutation métier.
- TypeScript : `tsc -p tsconfig.typecheck.json --noEmit --pretty false` réussi.
- ESLint complet : **0 erreur, 20 avertissements** dans des fichiers non modifiés par cette PR.
- Build Vite de développement réussi ; avertissement sur certains bundles supérieurs à 500 kB.
- Index applicatif et carte d’erreurs régénérés par les scripts officiels ; contrôle UTF-8 des fichiers modifiés et `git diff --check`.
- Le build production avec les variables de livraison et la suite complète du dépôt relèvent de la CI de la PR. Aucun build de production local n’est revendiqué.

## Risques et retour arrière

Les changements du layout et du composant de parcours se répercutent sur plusieurs pages ; les tests de navigation et les rendus de toutes les vues servent de garde-fous. Une recette connectée sur appareils physiques reste utile pour le clavier virtuel iOS et les transitions après actions réelles. Les exports statiques ne prouvent pas ces comportements de production.

Retour arrière : annuler le commit de cette PR, puis suivre le processus normal de livraison. Aucune donnée, migration ou configuration distante à restaurer.

## Fichiers modifiés

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `docs/audits/2026-10-27-dashboard-ux.md`
- `src/components/CustomerDashboardLayout.tsx`
- `src/components/DashboardLayout.tsx`
- `src/components/FeatureWizard.tsx`
- `src/components/ScrollToTop.tsx`
- `src/components/dashboard/CustomerMobileNavigation.tsx`
- `src/components/dashboard/CustomerPageHero.tsx`
- `src/components/dashboard/DashboardPageHero.tsx`
- `src/components/dashboard/TokAiMarketingStudio.tsx`
- `src/components/dashboard/WorkflowActions.tsx`
- `src/components/dashboard/WorkspaceDesign.css`
- `src/components/dashboard/marketing-print/MarketingOutputControls.tsx`
- `src/data/tok-user-guide-catalog.generated.ts`
- `src/hooks/useJourneyFocus.ts`
- `src/pages/dashboard/DashboardFormules.tsx`
- `src/pages/dashboard/DashboardPhotos.tsx`
- `src/test/customer-dashboard.test.ts`
- `src/test/customer-mobile-navigation.test.tsx`
- `src/test/dashboard-design-preview-export.test.tsx`
- `src/test/dashboard-journey-focus.test.tsx`
- `src/test/marketing-output-controls-journey.test.tsx`
- `src/test/marketing-studio-journey.test.tsx`
- `src/test/photo-studio-persistence.test.ts`
