# Audit admin, commercial et marketing — 10 octobre 2026

## Statut de mise en œuvre

Les 24 routes admin héritent d’un rail desktop permanent, d’une recherche de sections, d’un repère de page active et d’un accès mobile conservé. Les 12 vues marketing héritent d’une navigation regroupée par tâche et du système visuel TOK. L’espace commercial conserve ses trois parcours explicites déjà livrés sur la base de départ. Les drapeaux de fonctionnalités, badges, autorisations et actions métier restent inchangés.

Base main `317e85f9`, branche `codex/tok-all-pages-ux-20261010`, worktree dédié. Audit initial lecture seule puis implémentation autorisée. Inventaire source complet; les observations de code ne remplacent pas validation navigateur authentifiée. Périmètre présentation/parcours seulement; permissions, mutations, paiement et séparation des domaines conservés. Risque 3 pour interfaces privilégiées, sans mutation de données pendant audit/tests.

## Constats et plan

1. Admin: navigation disponible seulement via Sheet flottante même sur desktop (AdminMobileNavigation307); 17 pages utilisent DashboardPageHero volumineux avant données. Rail permanent desktop, orientation page active, recherche de sections, contenu réservé au rail; garder menu mobile, flags et badges. Root refond Hero partagé.
2. AdminHome523: chiffres présentés avec `stats?.value ||0`, donc chargement non distingué de zéro; ajouter lecture des états query avant chiffres sans changer agrégations.
3. Pages catalogue/fidélité/paramètres: nombreux champs placeholder-only et selects non associés. Nommer les contrôles; regrouper filtres sous tâche principale, préserver validation et valeurs.
4. CommercialProspection1600: titre/5 métriques puis filtres complets avant carte mobile; source CSV/outputs affichée à l'utilisateur, pas utile à sa décision. En-tête compact, filtre principal accessible, filtres supplémentaires pliables et liste prioritaire; conserver modes carte, détail, propriété et verrou signature.
5. Marketing: chrome bleu/noir forcé et12 sections non regroupées. Navigation organisée en Pilotage, Création & diffusion, Contacts & canaux, Contrôles; titres visibles et liens actifs. Conserver URL view/filter state et session/MFA.
6. MarketingAgent336/417: titres succès et erreurs avec couleurs claires sans variante dark. Lisibilité tokens et statut textuel. Outreach longues consignes/formulaires/KPIs avant cibles: guide repliable et détails techniques secondaires, contrôle humain visible et inchangé.
7. Tableaux/logs: filtres et détails techniques répartis sur écrans de1000+ lignes. Garder chiffres/preuves, table scroll accessible sur mobile, résumé premier niveau; pas masquer erreurs ou restrictions.

## Ownership

Cet agent: `src/pages/admin/*`, `src/components/admin/*`, `src/pages/Commercial*.tsx`, `src/components/commercial/*` (présentation), `src/pages/marketing/*`, `src/components/marketing/*`, tests dédiés. App.tsx uniquement classe/landmark wrapper AdminRouteFrame autorisé par root.
Root: DashboardPageHero, DashboardLayout, index.css et primitives UI; aucun changement concurrent dans mes fichiers. Agent restaurant_detail: CustomerCrmDashboard et dashboard/*; ces fichiers sont exclus.

## Matrice exhaustive

| Route / outil | Fichier | Audité | Changement | Test | Limite |
|---|---|---|---|---|---|
| `/admin` | `src/pages/admin/AdminHome.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/platform` | `src/pages/admin/AdminPlatformConfig.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/restaurants` | `src/pages/admin/AdminRestaurants.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/restaurants/google-business` | `src/pages/admin/AdminGoogleBusiness.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/utilisateurs` | `src/pages/admin/AdminUtilisateurs.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/avis` | `src/pages/admin/AdminAvis.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/catalog` | `src/pages/admin/AdminCatalog.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/loyalty` | `src/pages/admin/AdminLoyalty.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/drops` | `src/pages/admin/DropsManagement.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/notifications` | `src/pages/admin/AdminNotifications.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/actualites` | `src/pages/admin/AdminActualites.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/crm` | `src/pages/admin/AdminCrm.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/audit` | `src/pages/admin/AdminAuditLogs.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/packs` | `src/pages/admin/AdminLaunchPacks.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/compta` | `src/pages/admin/AdminCompta.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/compta/entrees` | `src/pages/admin/AdminComptaInflow.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/compta/sorties` | `src/pages/admin/AdminComptaOutflow.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/compta/ia` | `src/pages/admin/AdminComptaAi.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/commandes-reservations` | `src/pages/admin/AdminOperationsCenter + AdminOrdersReservations.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/sinistres` | `src/pages/admin/AdminSinistres.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/support-resolution` | `src/pages/admin/AdminSupportResolution.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/guardian` | `src/pages/admin/AdminGuardian.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/ai-operations` | `src/pages/admin/AdminAiOperations.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/admin/tok-connect` | `src/pages/admin/AdminTokConnect.tsx` | inventaire source | prévu | prévu | navigateur authentifié à vérifier |
| `/commercial` | `src/pages/CommercialProspection.tsx` | source | prévu | prévu | opérations/signatures réelles non testées |
| `/commercial/comptabilite` | `src/pages/CommercialComptabilite.tsx` | source | prévu | prévu | opérations/signatures réelles non testées |
| `/commercial/demo-live` | `src/pages/CommercialDemoLive.tsx` | source | prévu | prévu | opérations/signatures réelles non testées |
| `/commercial/prospection` | App.tsx alias | source | inchangé | navigation | redirection existante conservée |
| `/marketing/login` | src/pages/marketing/MarketingLogin.tsx | source | prévu | session recovery | MFA/provider réel non testé |
| `/marketing?view=overview` | `src/components/marketing/views/MarketingOverviewView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=agent` | `src/components/marketing/views/MarketingAgentView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=calendar` | `src/components/marketing/views/MarketingCalendarView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=campaigns` | `src/components/marketing/views/MarketingCampaignsView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=audiences` | `src/components/marketing/views/MarketingAudiencesView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=automations` | `src/components/marketing/views/MarketingAutomationsView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=activity` | `src/components/marketing/views/MarketingActivityView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=results` | `src/components/marketing/views/MarketingResultsView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=integrations` | `src/components/marketing/views/MarketingIntegrationsView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=governance` | `src/components/marketing/views/MarketingGovernanceView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=outreach` | `src/components/marketing/views/MarketingOutreachView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |
| `/marketing?view=faq` | `src/components/marketing/views/MarketingFaqView.tsx` | source | prévu | marketing frontend | providers/outreach réels non exécutés |

Vue marketing `overview` par défaut; aucun nouvel endpoint. Fichiers secondaires admin: AdminPrintOrders/AdminComptaPrintShell/adminComptaShared/adminOrdersReservationsShared. Impression conservée. CommercialDemoLive délègue au système multi-space: préserver isolation, progression, scénarios et effets sûrs.

## Validation prévue
Tests navigation admin, mobile responsiveness, gouvernance des24 outils; prospection/compta/contrats/démo; marketing operations/autopilot, agent/meta/source discovery/session recovery. Lint ciblé puis typecheck/build combinés root, navigateur desktop/mobile root. Aucune publication externe, abonnement ou action réelle pendant validation.
