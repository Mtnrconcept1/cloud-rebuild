# Audit restaurateur TOK — couverture exhaustive

## Statut de mise en œuvre

La refonte du chrome partagé couvre les 41 en-têtes utilisés dans les espaces restaurateur et admin : hiérarchie compacte, statistiques sémantiques, navigation recherchable et actions prioritaires visibles. Les écrans Réservations, Commandes, Menu, Service et Plan de salle ont aussi reçu des corrections ciblées d’accessibilité, de filtres, d’états et de densité. Les permissions, mutations et règles métier restent inchangées. La matrice sépare les constats de code des preuves navigateur.

Avant modifications : audit code uniquement, branch codex/tok-all-pages-ux-20261010 base317e85f9. Risque global3, changements présentation seulement. Root possède Hero/Layout/primitives/CSS; cet agent pages dashboard+composants opérationnels. Aucune mutation, permission, prix, requête de production ou migration à changer. Rollback: revert des modifications frontend.

Preuve navigateur root réservations : hero ~440px, titre cassé, filtres et planning repoussés. Autres constats ci-dessous issus du code et à confirmer au navigateur.

| Route | Fichier | Constat / plan | Code | Navigateur | Tests |
|---|---|---|---|---|---|
| /dashboard | src/pages/dashboard/DashboardHome.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/restaurant | src/pages/dashboard/DashboardRestaurant.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/menu | src/pages/dashboard/DashboardMenu.tsx | IA avant liste; lignes horizontales; actions icônes non nommées; lecture vide/erreur. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/reservations | src/pages/dashboard/DashboardReservations.tsx | Hero et liens de partage avant planning; filtres7; labels non associés; historique global initial. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/commandes | src/pages/dashboard/DashboardCommandes.tsx | Filtres7 et détails longs; actions de statut à hiérarchiser. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/offres | src/pages/dashboard/DashboardOffres.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/ventes-flash | src/pages/dashboard/DashboardVentesFlash.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/formules | src/pages/dashboard/DashboardFormules.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/campagnes | src/pages/dashboard/DashboardCampagnes.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/campaign-studio | src/pages/dashboard/DashboardCampaignStudio.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/crm | src/pages/dashboard/DashboardCrm.tsx | Filtres/vues/tri/export denses; guards à préserver. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/performances | src/pages/dashboard/DashboardPerformances.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/comparaison | src/pages/dashboard/DashboardComparaison.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/avis | src/pages/dashboard/DashboardAvis.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/promotions | src/pages/dashboard/DashboardPromotions.tsx | Badges10px; édition/suppression sans noms; formulaires labels non liés. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/reseaux-sociaux | src/pages/dashboard/DashboardReseauxSociaux.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/actualites | src/pages/dashboard/DashboardActualites.tsx | Métriques9px et4colonnes; analytics avant posts. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/factures | src/pages/dashboard/DashboardFactures.tsx | Nombreux panels et explications; distinction payé/exigible/encours à préserver. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/factures/entrees | src/pages/dashboard/DashboardFacturesInflow.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/factures/sorties | src/pages/dashboard/DashboardFacturesOutflow.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/factures/parametres | src/pages/dashboard/DashboardInvoiceSettings.tsx | Logo160px horizontal; suppression28px; labels non associés. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/mon-compte-facturation | src/pages/dashboard/DashboardAccountBilling.tsx | Solde/abonnement mélangés aux cartes outils/historique. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/photos | src/pages/dashboard/DashboardPhotos.tsx | Accueil outils presque pleinehauteur; galerie secondaire. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/notifications | src/pages/dashboard/DashboardNotifications.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/support | src/pages/dashboard/DashboardSupport.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/service | src/pages/dashboard/DashboardService.tsx | Avancés existent; spinner sans restaurant; sauvegarde en bas. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/plan-salle | src/pages/dashboard/DashboardPlanSalle.tsx | Workspace dédié à préserver; min-width selects et classe largeur invalide; actionsfile36px. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/advisor | src/pages/dashboard/DashboardAdvisor.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |
| /dashboard/tok-connect | src/pages/dashboard/DashboardTokConnect.tsx | En-tête partagé disproportionné; organiser action principale, contenu et détails secondaires, labels/états à vérifier. | Audité, à modifier | Non vérifié | Non exécutés |

Aliases préservés: recommandations→advisor; compta→factures; plan-salle-v2→plan-salle; campagne-overview→campagnes. DashboardCampagneOverview existe mais sans route active; aucune nouvelle route concurrente. Helpers Context/useDashboardRestaurant/useOwnerRestaurants/dashboardFacturesShared préservés.

Ordre: réservations/commandes; menu/service/salle; offres/formules/promotions; marketing/CRM/photos/advisor; comptabilité/support/notifications; validation. Tests: interactions filtres/reset/menu/états + régressions métier existantes; lint/typecheck/build globaux root; navigateur démo sûre root. Aucun paiement ou message externe réel.
