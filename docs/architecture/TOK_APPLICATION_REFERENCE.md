# Référence exhaustive et index de recherche de l’application TOK

> Document généré depuis les sources du dépôt. Ne pas modifier manuellement : exécuter `pnpm docs:application-index`.

## Utiliser l’index

- Recherche libre : `pnpm docs:search -- marketing campagne`
- Filtrer un type : `pnpm docs:search -- --type=frontend-route admin`
- Filtrer une surface : `pnpm docs:search -- --surface=restaurant factures`
- Sortie exploitable : `pnpm docs:search -- --json --limit=50 supabase`
- Index machine : [tok-application-search-index.json](./tok-application-search-index.json)
- Vérification anti-obsolescence : `pnpm docs:application-index:check`

## Périmètre et preuve de fraîcheur

- Dépôt : `Mtnrconcept1/cloud-rebuild`
- Version du schéma : `2`
- Empreinte SHA-256 des sources indexées : `1fef344eb39883360a515d026900922e0ae2460302becc932ef18103ed0f4992`
- Périmètre : État versionné local du dépôt; inventaire statique sans lecture des valeurs de secrets ni interrogation de la production.
- Les noms de variables d’environnement sont indexés, jamais leurs valeurs.
- Les comportements dépendant des données, fournisseurs et secrets de production exigent une vérification d’exécution séparée.
- État Supabase observé : [photographie distante du 3 octobre 2026](./TOK_RUNTIME_EVIDENCE_2026-10-03.md).

### Volumétrie

| Famille | Total |
| --- | --- |
| apiRoutes | 9 |
| cronJobs | 33 |
| databaseContract | 228 |
| databaseObjects | 2736 |
| documents | 199 |
| edgeFunctions | 114 |
| edgeHttpRoutes | 20 |
| exportedSymbols | 3389 |
| featureFlags | 99 |
| frontendRoutes | 131 |
| integrations | 11 |
| marketingOperations | 36 |
| migrations | 526 |
| modules | 1487 |
| pages | 127 |
| pathLiterals | 620 |
| publicAssets | 308 |
| publicEntries | 333 |
| publicNavigableRoutes | 2 |
| queryParameters | 104 |
| records | 15720 |
| repositoryFiles | 2796 |
| routingAuthorities | 35 |
| runtimeOnlyEdgeFunctions | 4 |
| seoBuildRoutes | 39 |
| storageBuckets | 9 |
| workerRoutes | 2 |
| workflows | 27 |

## État distant observé

Photographie Supabase en lecture seule du `2026-10-03`. Source structurée : [tok-runtime-evidence-2026-10-03.json](./tok-runtime-evidence-2026-10-03.json).

| Environnement | Projet | Fonctions Git | Fonctions actives | Runtime uniquement |
| --- | --- | --- | --- | --- |
| production | wwcrtyoueexyxkkikaos | 114 | 118 | print-sandbox-diagnose, recover-thefork-source-archive, tok-image-truth-probe, tok-places-coverage-probe |
| demo | hzldfhjfgjcadmpghhhf | 114 | 114 | — |

| Contrat de données | Tables | Vues | RPC | Enums |
| --- | --- | --- | --- | --- |
| Production observée | 335 | 4 | 558 | 3 |
| Types committés | 140 | 0 | 85 | 3 |

Migrations locales/distantes alignées : **518**.

## Architecture fonctionnelle

```text
Navigateur / applications Capacitor
  ├─ React Router : surfaces publique, client, restaurateur, coursier, commercial, admin, marketing
  ├─ Liens applicatifs : schéma tok://, universal/app links iOS/Android et raccourcis PWA
  ├─ /api/marketing/* : BFF Vercel isolé de la surface marketing
  └─ /functions/v1/* : fonctions Edge Supabase
       ├─ Authentification, règles métier et intégrations externes
       └─ PostgreSQL / RLS / stockage, versionnés par les migrations
Vercel : redirections d’hôtes, réécritures, sécurité HTTP, SPA et middleware SEO
Worker image IA : endpoints de santé /healthz et /readyz
GitHub Actions : contrôles, synchronisation, déploiement et opérations planifiées
```

### Surfaces applicatives

| Surface | Routes |
| --- | --- |
| admin | 24 |
| client-account | 13 |
| commercial | 4 |
| courier | 5 |
| marketing | 3 |
| public | 48 |
| restaurant | 33 |
| system | 1 |

### Groupes de fonctionnalités

| Groupe | Flags |
| --- | --- |
| admin_tools | 24 |
| client_features | 23 |
| courier | 5 |
| journeys | 5 |
| payments | 6 |
| restaurant_dashboard | 36 |

## Routes frontend complètes

| Route | Surface | Composants | Protection | Flag | Redirection | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `/coming-soon` | public | ComingSoon | — | — | — | [src/App.tsx:556](../../src/App.tsx#L556) |
| `/` | public | ClientSurfaceRoute, Index | ClientSurfaceRoute | — | — | [src/App.tsx:557](../../src/App.tsx#L557) |
| `/auth` | public | Auth | — | — | — | [src/App.tsx:558](../../src/App.tsx#L558) |
| `/auth/demo` | public | Auth | — | — | — | [src/App.tsx:559](../../src/App.tsx#L559) |
| `/auth/callback` | public | Auth | — | — | — | [src/App.tsx:560](../../src/App.tsx#L560) |
| `/espaces` | public | ProtectedRoute, WorkspaceChooser | ProtectedRoute | — | — | [src/App.tsx:561](../../src/App.tsx#L561) |
| `/oauth/consent` | public | OAuthConsent | — | — | — | [src/App.tsx:562](../../src/App.tsx#L562) |
| `/recherche` | public | ClientSurfaceRoute, Recherche | ClientSurfaceRoute | — | — | [src/App.tsx:563](../../src/App.tsx#L563) |
| `/restaurants/:city` | public | ClientSurfaceRoute, LocalRestaurants | ClientSurfaceRoute | — | — | [src/App.tsx:564](../../src/App.tsx#L564) |
| `/restaurants-pres/:venueSlug` | public | ClientSurfaceRoute, LocalRestaurants | ClientSurfaceRoute | — | — | [src/App.tsx:565](../../src/App.tsx#L565) |
| `/restaurants/:city/r/:restaurantSlug` | public | ClientSurfaceRoute, LocalRestaurants | ClientSurfaceRoute | — | — | [src/App.tsx:566](../../src/App.tsx#L566) |
| `/restaurants/:city/:category` | public | ClientSurfaceRoute, LocalRestaurants | ClientSurfaceRoute | — | — | [src/App.tsx:567](../../src/App.tsx#L567) |
| `/r/:slug/reserver` | public | ClientSurfaceRoute, RestaurantBookingRedirect | ClientSurfaceRoute | — | — | [src/App.tsx:568](../../src/App.tsx#L568) |
| `/r/:slug` | public | ClientSurfaceRoute, RestaurantBookingRedirect | ClientSurfaceRoute | — | — | [src/App.tsx:569](../../src/App.tsx#L569) |
| `/restaurant/:id` | public | ClientSurfaceRoute, RestaurantDetail | ClientSurfaceRoute | — | — | [src/App.tsx:570](../../src/App.tsx#L570) |
| `/anti-gaspi` | public | AntiGaspi, ClientSurfaceRoute, FeatureSwitch | ClientSurfaceRoute | antiWasteEnabled | — | [src/App.tsx:571](../../src/App.tsx#L571) |
| `/panier` | public | ClientSurfaceRoute, Panier | ClientSurfaceRoute | — | — | [src/App.tsx:572](../../src/App.tsx#L572) |
| `/commandes` | client-account | Commandes, FeatureSwitch, ProtectedRoute | ProtectedRoute, client | commandesEnabled | — | [src/App.tsx:573](../../src/App.tsx#L573) |
| `/commande/confirmation` | client-account | ClientSurfaceRoute, FeatureSwitch, OrderConfirmation | ClientSurfaceRoute | commandesEnabled | — | [src/App.tsx:574](../../src/App.tsx#L574) |
| `/commande/:id` | client-account | FeatureSwitch, ProtectedRoute, SuiviCommande | ProtectedRoute, client | commandesEnabled | — | [src/App.tsx:575](../../src/App.tsx#L575) |
| `/mon-espace` | client-account | ClientDashboardHome, ProtectedRoute | ProtectedRoute, client | — | — | [src/App.tsx:576](../../src/App.tsx#L576) |
| `/compte` | client-account | Navigate | — | — | /mon-espace | [src/App.tsx:577](../../src/App.tsx#L577) |
| `/espace-client` | client-account | Navigate | — | — | /mon-espace | [src/App.tsx:578](../../src/App.tsx#L578) |
| `/reservations` | client-account | FeatureSwitch, ProtectedRoute, Reservations | ProtectedRoute, client | reservationEnabled | — | [src/App.tsx:579](../../src/App.tsx#L579) |
| `/mes-avis` | client-account | ClientReviews, ProtectedRoute | ProtectedRoute, client | — | — | [src/App.tsx:580](../../src/App.tsx#L580) |
| `/profil` | client-account | Profil, ProtectedRoute | ProtectedRoute, client | — | — | [src/App.tsx:581](../../src/App.tsx#L581) |
| `/parametres/securite` | client-account | AccountSecurity, ProtectedRoute | ProtectedRoute | — | — | [src/App.tsx:582](../../src/App.tsx#L582) |
| `/memoire-tok` | client-account | CustomerMemory, FeatureSwitch, ProtectedRoute | ProtectedRoute, client | customerMemoryEnabled | — | [src/App.tsx:583](../../src/App.tsx#L583) |
| `/notifications` | client-account | Notifications, ProtectedRoute | ProtectedRoute, client | — | — | [src/App.tsx:584](../../src/App.tsx#L584) |
| `/creneaux-garantis` | public | ClientSurfaceRoute, CreneauxGarantis, FeatureSwitch | ClientSurfaceRoute | hasFeature("creneaux-garantis") | — | [src/App.tsx:585](../../src/App.tsx#L585) |
| `/flex-prix-bas` | public | ClientSurfaceRoute, FeatureSwitch, FlexPrixBas | ClientSurfaceRoute | hasFeature("flex-prix-bas") | — | [src/App.tsx:586](../../src/App.tsx#L586) |
| `/match-groupes` | public | ClientSurfaceRoute, FeatureSwitch, MatchGroupes | ClientSurfaceRoute | hasFeature("match-groupes") | — | [src/App.tsx:587](../../src/App.tsx#L587) |
| `/multi-stop` | public | ClientSurfaceRoute, FeatureSwitch, MultiStop | ClientSurfaceRoute | hasFeature("multi-stop") | — | [src/App.tsx:588](../../src/App.tsx#L588) |
| `/multi-restaurant` | public | ClientSurfaceRoute, FeatureSwitch, MultiRestaurant | ClientSurfaceRoute | hasFeature("multi-restaurant") | — | [src/App.tsx:589](../../src/App.tsx#L589) |
| `/chefs-table` | public | ChefsTable, ClientSurfaceRoute, FeatureSwitch | ClientSurfaceRoute | hasFeature("chefs-table") | — | [src/App.tsx:590](../../src/App.tsx#L590) |
| `/zero-attente` | public | ClientSurfaceRoute, FeatureSwitch, ZeroAttente | ClientSurfaceRoute | hasFeature("zero-attente") | — | [src/App.tsx:591](../../src/App.tsx#L591) |
| `/garantie-qualite` | public | ClientSurfaceRoute, FeatureSwitch, GarantieQualite | ClientSurfaceRoute | hasFeature("garantie-qualite") | — | [src/App.tsx:592](../../src/App.tsx#L592) |
| `/budget-auto` | public | BudgetAuto, ClientSurfaceRoute, FeatureSwitch | ClientSurfaceRoute | hasFeature("budget-auto") | — | [src/App.tsx:593](../../src/App.tsx#L593) |
| `/abonnement` | public | Abonnement, ClientSurfaceRoute, FeatureSwitch | ClientSurfaceRoute | abonnementEnabled | — | [src/App.tsx:594](../../src/App.tsx#L594) |
| `/tok-one` | public | ClientSurfaceRoute, FeatureSwitch, TokOne | ClientSurfaceRoute | tokOneEnabled | — | [src/App.tsx:595](../../src/App.tsx#L595) |
| `/tok-pulse` | public | ClientSurfaceRoute, FeatureSwitch, TokPulse | ClientSurfaceRoute | hasFeature("tok-pulse") | — | [src/App.tsx:596](../../src/App.tsx#L596) |
| `/tok-connect` | public | FeatureSwitch, TokConnect | — | tokConnectEnabled | — | [src/App.tsx:597](../../src/App.tsx#L597) |
| `/tok-connect/developer` | public | FeatureSwitch, ProtectedRoute, TokConnectDeveloper | ProtectedRoute | tokConnectEnabled | — | [src/App.tsx:598](../../src/App.tsx#L598) |
| `/tok-connect/mcp-widget` | public | TokConnectMcpWidget | — | — | — | [src/App.tsx:599](../../src/App.tsx#L599) |
| `/commercial` | commercial | CommercialProspection, FeatureSwitch, ProtectedRoute | ProtectedRoute, admin, commercial | commercialProspectionEnabled | — | [src/App.tsx:600](../../src/App.tsx#L600) |
| `/commercial/prospection` | commercial | Navigate | — | — | /commercial | [src/App.tsx:601](../../src/App.tsx#L601) |
| `/commercial/comptabilite` | commercial | CommercialComptabilite, FeatureSwitch, ProtectedRoute | ProtectedRoute, admin, commercial | commercialProspectionEnabled | — | [src/App.tsx:602](../../src/App.tsx#L602) |
| `/commercial/demo-live` | commercial | CommercialDemoLive, FeatureSwitch, ProtectedRoute | ProtectedRoute, admin, commercial | commercialProspectionEnabled | — | [src/App.tsx:603](../../src/App.tsx#L603) |
| `/miamz-solidaires` | public | MiamzSolidaires | — | — | — | [src/App.tsx:604](../../src/App.tsx#L604) |
| `/points-cadeau` | client-account | FeatureSwitch, GiftPoints, ProtectedRoute | ProtectedRoute, client | giftPointsEnabled | — | [src/App.tsx:605](../../src/App.tsx#L605) |
| `/ventes-flash` | public | ClientSurfaceRoute, FeatureSwitch, VentesFlash | ClientSurfaceRoute | flashSalesEnabled | — | [src/App.tsx:606](../../src/App.tsx#L606) |
| `/actualites` | public | Actualites, FeatureSwitch | — | actualitesSocialesEnabled | — | [src/App.tsx:607](../../src/App.tsx#L607) |
| `/actualites/:postId` | public | ActualitePost, FeatureSwitch | — | actualitesSocialesEnabled | — | [src/App.tsx:608](../../src/App.tsx#L608) |
| `/dashboard` | restaurant | DashboardHome, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardOverviewEnabled | — | [src/App.tsx:609](../../src/App.tsx#L609) |
| `/dashboard/restaurant` | restaurant | DashboardRestaurant, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardRestaurantEnabled | — | [src/App.tsx:610](../../src/App.tsx#L610) |
| `/dashboard/advisor` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardAdvisor, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardAdvisorEnabled | — | [src/App.tsx:611](../../src/App.tsx#L611) |
| `/dashboard/menu` | restaurant | DashboardMenu, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardMenuEnabled | — | [src/App.tsx:612](../../src/App.tsx#L612) |
| `/dashboard/reservations` | restaurant | DashboardReservations, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardReservationsEnabled | — | [src/App.tsx:613](../../src/App.tsx#L613) |
| `/dashboard/commandes` | restaurant | DashboardCommandes, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardCommandesEnabled | — | [src/App.tsx:614](../../src/App.tsx#L614) |
| `/dashboard/recommandations` | restaurant | Navigate | — | — | /dashboard/advisor | [src/App.tsx:615](../../src/App.tsx#L615) |
| `/dashboard/performances` | restaurant | DashboardPerformances, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardPerformancesEnabled | — | [src/App.tsx:616](../../src/App.tsx#L616) |
| `/dashboard/comparaison` | restaurant | DashboardComparaison, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardComparaisonEnabled | — | [src/App.tsx:617](../../src/App.tsx#L617) |
| `/dashboard/avis` | restaurant | DashboardAvis, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardAvisEnabled | — | [src/App.tsx:618](../../src/App.tsx#L618) |
| `/dashboard/compta` | restaurant | Navigate, div | — | — | dashboardFacturesEnabled ? "/dashboard/factures" : "/dashboard" | [src/App.tsx:619](../../src/App.tsx#L619) |
| `/dashboard/factures` | restaurant | DashboardFactures, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardFacturesEnabled | — | [src/App.tsx:620](../../src/App.tsx#L620) |
| `/dashboard/factures/entrees` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardFacturesInflow, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardFacturesEnabled | — | [src/App.tsx:621](../../src/App.tsx#L621) |
| `/dashboard/factures/sorties` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardFacturesOutflow, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardFacturesEnabled | — | [src/App.tsx:622](../../src/App.tsx#L622) |
| `/dashboard/factures/parametres` | restaurant | DashboardInvoiceSettings, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardFacturesParametresEnabled | — | [src/App.tsx:623](../../src/App.tsx#L623) |
| `/dashboard/mon-compte-facturation` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardAccountBilling, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardBillingEnabled | — | [src/App.tsx:624](../../src/App.tsx#L624) |
| `/dashboard/offres` | restaurant | DashboardOffres, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardOffresEnabled | — | [src/App.tsx:625](../../src/App.tsx#L625) |
| `/dashboard/ventes-flash` | restaurant | DashboardRoute, DashboardVentesFlash, FeatureSwitch | DashboardRoute | dashboardVentesFlashEnabled | — | [src/App.tsx:626](../../src/App.tsx#L626) |
| `/dashboard/formules` | restaurant | DashboardFormules, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardFormulesEnabled | — | [src/App.tsx:627](../../src/App.tsx#L627) |
| `/dashboard/photos` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardPhotos, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardPhotosEnabled | — | [src/App.tsx:628](../../src/App.tsx#L628) |
| `/dashboard/promotions` | restaurant | DashboardPromotions, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardPromotionsEnabled | — | [src/App.tsx:629](../../src/App.tsx#L629) |
| `/dashboard/campagne-overview` | restaurant | Navigate | — | — | /dashboard/campagnes | [src/App.tsx:630](../../src/App.tsx#L630) |
| `/dashboard/reseaux-sociaux` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardReseauxSociaux, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardReseauxSociauxEnabled | — | [src/App.tsx:631](../../src/App.tsx#L631) |
| `/dashboard/actualites` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardActualites, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardActualitesEnabled | — | [src/App.tsx:632](../../src/App.tsx#L632) |
| `/dashboard/campagnes` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardCampagnes, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardCampagnesEnabled | — | [src/App.tsx:633](../../src/App.tsx#L633) |
| `/dashboard/campaign-studio` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardCampaignStudio, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardCampaignStudioEnabled | — | [src/App.tsx:634](../../src/App.tsx#L634) |
| `/dashboard/crm` | restaurant | DashboardCrm, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardCrmEnabled | — | [src/App.tsx:635](../../src/App.tsx#L635) |
| `/dashboard/notifications` | restaurant | DashboardNotifications, DashboardRoute | DashboardRoute | — | — | [src/App.tsx:636](../../src/App.tsx#L636) |
| `/dashboard/support` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardRoute, DashboardSupport, FeatureSwitch | DashboardRoute | dashboardSupportEnabled | — | [src/App.tsx:637](../../src/App.tsx#L637) |
| `/dashboard/service` | restaurant | DashboardRoute, DashboardService, FeatureSwitch | DashboardRoute | dashboardServiceEnabled | — | [src/App.tsx:638](../../src/App.tsx#L638) |
| `/dashboard/plan-salle` | restaurant | DashboardPlanSalle, DashboardRoute, FeatureSwitch | DashboardRoute | dashboardPlanSalleEnabled | — | [src/App.tsx:639](../../src/App.tsx#L639) |
| `/dashboard/plan-salle-v2` | restaurant | Navigate | — | — | /dashboard/plan-salle | [src/App.tsx:641](../../src/App.tsx#L641) |
| `/dashboard/tok-connect` | restaurant | CommercialDemoSafeEffectsBoundary, DashboardRoute, DashboardTokConnect, FeatureSwitch | DashboardRoute | dashboardTokConnectEnabled | — | [src/App.tsx:642](../../src/App.tsx#L642) |
| `/courier` | courier | CourierHome, FeatureSwitch, ProtectedRoute | ProtectedRoute, courier | courierHomeEnabled | — | [src/App.tsx:643](../../src/App.tsx#L643) |
| `/courier/jobs` | courier | CourierJobs, FeatureSwitch, ProtectedRoute | ProtectedRoute, courier | courierJobsEnabled | — | [src/App.tsx:644](../../src/App.tsx#L644) |
| `/courier/notifications` | courier | CourierNotifications, ProtectedRoute | ProtectedRoute, courier | — | — | [src/App.tsx:645](../../src/App.tsx#L645) |
| `/courier/earnings` | courier | CourierEarnings, FeatureSwitch, ProtectedRoute | ProtectedRoute, courier | courierEarningsEnabled | — | [src/App.tsx:646](../../src/App.tsx#L646) |
| `/courier/profile` | courier | CourierProfile, FeatureSwitch, ProtectedRoute | ProtectedRoute, courier | courierProfileEnabled | — | [src/App.tsx:647](../../src/App.tsx#L647) |
| `/admin` | admin | AdminDashboardRoute | — | — | — | [src/App.tsx:648](../../src/App.tsx#L648) |
| `/admin/platform` | admin | AdminPlatformConfig, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminPlatformConfigEnabled | — | [src/App.tsx:649](../../src/App.tsx#L649) |
| `/admin/restaurants` | admin | AdminProtectedRoute, AdminRestaurants, FeatureSwitch | AdminProtectedRoute | adminRestaurantsEnabled | — | [src/App.tsx:650](../../src/App.tsx#L650) |
| `/admin/restaurants/google-business` | admin | AdminGoogleBusiness, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminRestaurantsEnabled | — | [src/App.tsx:651](../../src/App.tsx#L651) |
| `/admin/utilisateurs` | admin | AdminProtectedRoute, AdminUtilisateurs, FeatureSwitch | AdminProtectedRoute | adminUtilisateursEnabled | — | [src/App.tsx:652](../../src/App.tsx#L652) |
| `/admin/avis` | admin | AdminAvis, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminAvisEnabled | — | [src/App.tsx:653](../../src/App.tsx#L653) |
| `/admin/catalog` | admin | AdminCatalog, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminCatalogEnabled | — | [src/App.tsx:654](../../src/App.tsx#L654) |
| `/admin/loyalty` | admin | AdminLoyalty, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminLoyaltyEnabled | — | [src/App.tsx:655](../../src/App.tsx#L655) |
| `/admin/drops` | admin | AdminProtectedRoute, DropsManagement, FeatureSwitch | AdminProtectedRoute | adminDropsEnabled | — | [src/App.tsx:656](../../src/App.tsx#L656) |
| `/admin/notifications` | admin | AdminNotifications, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminNotificationsEnabled | — | [src/App.tsx:657](../../src/App.tsx#L657) |
| `/admin/actualites` | admin | AdminActualites, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminActualitesEnabled | — | [src/App.tsx:658](../../src/App.tsx#L658) |
| `/admin/crm` | admin | AdminCrm, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminCrmEnabled | — | [src/App.tsx:659](../../src/App.tsx#L659) |
| `/admin/audit` | admin | AdminAuditLogs, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminAuditEnabled | — | [src/App.tsx:660](../../src/App.tsx#L660) |
| `/admin/packs` | admin | AdminLaunchPacks, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminPacksEnabled | — | [src/App.tsx:661](../../src/App.tsx#L661) |
| `/admin/compta` | admin | AdminCompta, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminComptaEnabled | — | [src/App.tsx:662](../../src/App.tsx#L662) |
| `/admin/compta/entrees` | admin | AdminComptaInflow, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminComptaEnabled | — | [src/App.tsx:663](../../src/App.tsx#L663) |
| `/admin/compta/sorties` | admin | AdminComptaOutflow, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminComptaEnabled | — | [src/App.tsx:664](../../src/App.tsx#L664) |
| `/admin/compta/ia` | admin | AdminComptaAi, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminComptaAiEnabled | — | [src/App.tsx:665](../../src/App.tsx#L665) |
| `/admin/commandes-reservations` | admin | AdminOperationsCenter, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminOperationsCenterEnabled | — | [src/App.tsx:666](../../src/App.tsx#L666) |
| `/admin/sinistres` | admin | AdminProtectedRoute, AdminSinistres, FeatureSwitch | AdminProtectedRoute | adminOperationsCenterEnabled | — | [src/App.tsx:667](../../src/App.tsx#L667) |
| `/admin/support-resolution` | admin | AdminProtectedRoute, AdminSupportResolution, FeatureSwitch | AdminProtectedRoute | adminSupportResolutionEnabled | — | [src/App.tsx:668](../../src/App.tsx#L668) |
| `/admin/guardian` | admin | AdminGuardian, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminGuardianEnabled | — | [src/App.tsx:669](../../src/App.tsx#L669) |
| `/admin/ai-operations` | admin | AdminAiOperations, AdminProtectedRoute, FeatureSwitch | AdminProtectedRoute | adminAiOperationsEnabled | — | [src/App.tsx:670](../../src/App.tsx#L670) |
| `/admin/tok-connect` | admin | AdminProtectedRoute, AdminTokConnect, FeatureSwitch | AdminProtectedRoute | adminTokConnectEnabled | — | [src/App.tsx:671](../../src/App.tsx#L671) |
| `/contact` | public | Contact | — | — | — | [src/App.tsx:672](../../src/App.tsx#L672) |
| `/cgu` | public | CGU | — | — | — | [src/App.tsx:673](../../src/App.tsx#L673) |
| `/politique-confidentialite` | public | PolitiqueConfidentialite | — | — | — | [src/App.tsx:674](../../src/App.tsx#L674) |
| `/cookies` | public | Cookies | — | — | — | [src/App.tsx:675](../../src/App.tsx#L675) |
| `/a-propos` | public | APropos | — | — | — | [src/App.tsx:676](../../src/App.tsx#L676) |
| `/packs-restaurateur` | public | PacksRestaurateur | — | — | — | [src/App.tsx:677](../../src/App.tsx#L677) |
| `/conditions-restaurateurs` | public | ConditionsRestaurateurs | — | — | — | [src/App.tsx:678](../../src/App.tsx#L678) |
| `/restaurateurs/geneve` | public | RestaurateursGeneve | — | — | — | [src/App.tsx:679](../../src/App.tsx#L679) |
| `/restaurateurs/:city` | public | RestaurateursGeneve | — | — | — | [src/App.tsx:680](../../src/App.tsx#L680) |
| `/restaurateurs/google-business` | public | RestaurateursGoogleBusiness | — | — | — | [src/App.tsx:681](../../src/App.tsx#L681) |
| `/restaurateurs/alternative-commission-couvert` | public | AlternativeCommissionCouvert | — | — | — | [src/App.tsx:682](../../src/App.tsx#L682) |
| `/aide` | public | Aide | — | — | — | [src/App.tsx:683](../../src/App.tsx#L683) |
| `*` | system | NotFound | — | — | — | [src/App.tsx:684](../../src/App.tsx#L684) |
| `/marketing/login` | marketing | MarketingLogin | — | — | — | [src/App.tsx:724](../../src/App.tsx#L724) |
| `/marketing` | marketing | MarketingProtectedRoute, MarketingWorkspace | MarketingProtectedRoute | — | — | [src/App.tsx:725](../../src/App.tsx#L725) |
| `/marketing/*` | marketing | Navigate | — | — | /marketing | [src/App.tsx:733](../../src/App.tsx#L733) |

## Routage Vercel, domaines et middleware

### Redirections

| Source | Hôte | Destination | Statut |
| --- | --- | --- | --- |
| / | auth.thetok.ch | https://www.thetok.ch/auth | temporaire |
| /:path* | auth.thetok.ch | https://www.thetok.ch/:path* | temporaire |
| /auth | commercial.thetok.ch | https://www.thetok.ch/auth | temporaire |
| /auth/:path* | commercial.thetok.ch | https://www.thetok.ch/auth/:path* | temporaire |
| /auth | admin.thetok.ch | https://www.thetok.ch/auth | temporaire |
| /auth/:path* | admin.thetok.ch | https://www.thetok.ch/auth/:path* | temporaire |
| /auth | thetok.ch | https://www.thetok.ch/auth | temporaire |
| /espaces | commercial.thetok.ch | https://www.thetok.ch/espaces | temporaire |
| /espaces | admin.thetok.ch | https://www.thetok.ch/espaces | temporaire |
| / | demo-client.thetok.ch | /commercial/demo-live?surface=client | temporaire |
| / | demo-restaurateur.thetok.ch | /commercial/demo-live?surface=restaurant | temporaire |
| / | demo-livreur.thetok.ch | /commercial/demo-live?surface=courier | temporaire |
| / | commercial.thetok.ch | /commercial | temporaire |
| / | admin.thetok.ch | /admin | temporaire |
| / | marketing.thetok.ch | /marketing | temporaire |
| /admin | www.thetok.ch | https://admin.thetok.ch/admin | temporaire |
| /admin/:path* | www.thetok.ch | https://admin.thetok.ch/admin/:path* | temporaire |
| /admin | thetok.ch | https://admin.thetok.ch/admin | temporaire |
| /admin/:path* | thetok.ch | https://admin.thetok.ch/admin/:path* | temporaire |
| /restaurants/carouge-ge/r/fernandes-de-almeida-restaurant-le-par | — | /restaurants/carouge/r/fernandes-de-almeida-restaurant-le-paradisio | 301 |
| /restaurants/carouge/r/fernandes-de-almeida-restaurant-le-par | — | /restaurants/carouge/r/fernandes-de-almeida-restaurant-le-paradisio | 301 |
| /restaurants/carouge-ge | — | /restaurants/carouge | 301 |
| /restaurants/carouge-ge/:path* | — | /restaurants/carouge/:path* | 301 |
| /sitemap-seo.xml | — | /sitemap.xml | permanent |
| /sitemap_index.xml | — | /sitemap.xml | permanent |
| /sitemap-index.xml | — | /sitemap.xml | permanent |
| /restaurants/vand-uvres | — | /restaurants/vandoeuvres | permanent |
| /restaurants/vand-uvres/:path* | — | /restaurants/vandoeuvres/:path* | permanent |
| /restaurants/corsier-ge | — | /restaurants/corsier | permanent |
| /restaurants/corsier-ge/:path* | — | /restaurants/corsier/:path* | permanent |
| /:path((?!\.well-known/(?:apple-app-site-association\|assetlinks\.json)$).*) | thetok.ch | https://www.thetok.ch/:path | permanent |

### Réécritures

| Source | Hôte | Destination |
| --- | --- | --- |
| /mcp | www.thetok.ch | https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-remote-mcp |
| /.well-known/oauth-protected-resource | www.thetok.ch | https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-remote-mcp?tok_connect_route=protected-resource |
| /functions/v1/:path* | — | https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/:path* |
| /api/photon | — | https://photon.komoot.io/api |
| /images/fondue moitié moitié.jpg | — | /images/fondue-moitie-moitie.jpg |
| /images/fondue%20moiti%C3%A9%20moiti%C3%A9.jpg | — | /images/fondue-moitie-moitie.jpg |
| /images/meringue double.webp | — | /images/meringue-double.webp |
| /images/meringue%20double.webp | — | /images/meringue-double.webp |
| /images/milshake oreo.jpg | — | /images/milkshake-oreo.jpg |
| /images/milshake%20oreo.jpg | — | /images/milkshake-oreo.jpg |
| /images/milshake vanille.jpeg | — | /images/milkshake-vanille.jpeg |
| /images/milshake%20vanille.jpeg | — | /images/milkshake-vanille.jpeg |
| /images/moshi glacés.jpg | — | /images/mochi-glaces.jpg |
| /images/moshi%20glac%C3%A9s.jpg | — | /images/mochi-glaces.jpg |
| /images/rösti bernois.jpg | — | /images/rosti-bernois.jpg |
| /images/r%C3%B6sti%20bernois.jpg | — | /images/rosti-bernois.jpg |
| /images/salade du marché.jpg | — | /images/salade-du-marche.jpg |
| /images/salade%20du%20march%C3%A9.jpg | — | /images/salade-du-marche.jpg |
| /images/taboulé.webp | — | /images/taboule.webp |
| /images/taboul%C3%A9.webp | — | /images/taboule.webp |
| /:surface(admin\|marketing\|dashboard\|courier\|commercial\|profil\|memoire-tok\|notifications\|commandes\|commande\|reservations\|mon-espace\|compte\|espace-client\|mes-avis\|points-cadeau\|panier\|auth\|oauth\|espaces\|r) | — | /index.html |
| /:surface(admin\|marketing\|dashboard\|courier\|commercial\|profil\|memoire-tok\|notifications\|commandes\|commande\|reservations\|mon-espace\|compte\|espace-client\|mes-avis\|points-cadeau\|panier\|auth\|oauth\|espaces\|r)/:path* | — | /index.html |
| /tok-connect/developer | — | /index.html |
| /tok-connect/developer/:path* | — | /index.html |
| /coming-soon | — | /index.html |
| /parametres/securite | — | /index.html |
| /creneaux-garantis | — | /index.html |
| /flex-prix-bas | — | /index.html |
| /match-groupes | — | /index.html |
| /multi-restaurant | — | /index.html |
| /multi-stop | — | /index.html |
| /garantie-qualite | — | /index.html |
| /abonnement | — | /index.html |
| /tok-pulse | — | /index.html |
| /tok-connect/mcp-widget | — | /index.html |
| /restaurant/:id | — | /index.html |
| /restaurateurs/((?!geneve/?$\|google-business/?$\|alternative-commission-couvert/?$)[^/]+) | — | /index.html |

### Règles d’en-têtes

| Source | Hôte | En-têtes |
| --- | --- | --- |
| /.well-known/apple-app-site-association | — | Content-Type |
| /(.*) | — | Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options |
| /assets/:path* | — | Cache-Control |
| /auth | — | Cache-Control |
| /robots.txt | — | Cache-Control |
| /sitemap.xml | — | Cache-Control |
| /sitemap-pages.xml | — | Cache-Control |
| /sitemap-restaurants.xml | — | Cache-Control |
| /sitemap-actualites.xml | — | Cache-Control |
| /auth/:path* | — | Cache-Control |
| /api/marketing/:path* | — | Cache-Control, Pragma, X-Robots-Tag |
| /:path* | demo-client.thetok.ch | X-Robots-Tag |
| /:path* | demo-restaurateur.thetok.ch | X-Robots-Tag |
| /:path* | demo-livreur.thetok.ch | X-Robots-Tag |
| /:path* | commercial.thetok.ch | X-Robots-Tag, Content-Security-Policy, Referrer-Policy, X-Frame-Options |
| /:path* | marketing.thetok.ch | X-Robots-Tag, Content-Security-Policy, Referrer-Policy, Cache-Control, X-Frame-Options |
| /:path* | admin.thetok.ch | X-Robots-Tag, Referrer-Policy |
| /:surface(admin\|marketing\|dashboard\|courier\|commercial\|profil\|memoire-tok\|notifications\|commandes\|commande\|reservations\|mon-espace\|compte\|espace-client\|mes-avis\|points-cadeau\|panier\|auth\|oauth\|espaces\|r) | — | X-Robots-Tag, Cache-Control |
| /:surface(admin\|marketing\|dashboard\|courier\|commercial\|profil\|memoire-tok\|notifications\|commandes\|commande\|reservations\|mon-espace\|compte\|espace-client\|mes-avis\|points-cadeau\|panier\|auth\|oauth\|espaces\|r)/:path* | — | X-Robots-Tag, Cache-Control |
| /tok-connect/developer | — | X-Robots-Tag |
| /tok-connect/developer/:path* | — | X-Robots-Tag |
| /:surface(functions\|api)/:path* | — | X-Robots-Tag |
| /mcp | — | X-Robots-Tag |
| /.well-known/:path* | — | X-Robots-Tag |

Middleware : matcher `/restaurants-pres/:path*` dans [middleware.js](../../middleware.js).

### Autorités de routage applicatives, mobiles et PWA

| Type | Valeur | Nom | Sources | Première source |
| --- | --- | --- | --- | --- |
| android-app-link | `admin.thetok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:51](../../android/app/src/main/AndroidManifest.xml#L51) |
| android-app-link | `app.thetok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:50](../../android/app/src/main/AndroidManifest.xml#L50) |
| android-app-link | `app.tok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:47](../../android/app/src/main/AndroidManifest.xml#L47) |
| android-app-link | `thetok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:48](../../android/app/src/main/AndroidManifest.xml#L48) |
| android-app-link | `tok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:45](../../android/app/src/main/AndroidManifest.xml#L45) |
| android-app-link | `www.thetok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:49](../../android/app/src/main/AndroidManifest.xml#L49) |
| android-app-link | `www.tok.ch` | — | 1 | [android/app/src/main/AndroidManifest.xml:46](../../android/app/src/main/AndroidManifest.xml#L46) |
| android-scheme | `https://*` | — | 7 | [android/app/src/main/AndroidManifest.xml:45](../../android/app/src/main/AndroidManifest.xml#L45) |
| android-scheme | `tok://*` | — | 1 | [android/app/src/main/AndroidManifest.xml:38](../../android/app/src/main/AndroidManifest.xml#L38) |
| application-host | `admin.thetok.ch` | — | 5 | [src/lib/adminDomains.ts:5](../../src/lib/adminDomains.ts#L5) |
| application-host | `app.thetok.ch` | — | 4 | [src/lib/commercialDomains.ts:31](../../src/lib/commercialDomains.ts#L31) |
| application-host | `auth.thetok.ch` | — | 1 | [src/lib/commercialDomains.ts:33](../../src/lib/commercialDomains.ts#L33) |
| application-host | `commercial.thetok.ch` | — | 1 | [src/lib/demoWorkspaces.ts:59](../../src/lib/demoWorkspaces.ts#L59) |
| application-host | `demo-client.thetok.ch` | — | 1 | [src/lib/demoWorkspaces.ts:17](../../src/lib/demoWorkspaces.ts#L17) |
| application-host | `demo-livreur.thetok.ch` | — | 1 | [src/lib/demoWorkspaces.ts:31](../../src/lib/demoWorkspaces.ts#L31) |
| application-host | `demo-restaurateur.thetok.ch` | — | 1 | [src/lib/demoWorkspaces.ts:24](../../src/lib/demoWorkspaces.ts#L24) |
| application-host | `marketing.thetok.ch` | — | 1 | [src/lib/marketingDomains.ts:6](../../src/lib/marketingDomains.ts#L6) |
| application-host | `thetok.ch` | — | 4 | [src/lib/commercialDomains.ts:29](../../src/lib/commercialDomains.ts#L29) |
| application-host | `www.thetok.ch` | — | 8 | [src/lib/adminDomains.ts:3](../../src/lib/adminDomains.ts#L3) |
| capacitor-scheme | `tok://*` | — | 1 | [capacitor.config.ts:28](../../capacitor.config.ts#L28) |
| commercial-frame | `/commercial/demo-live/frame/:surface/:sessionId/*` | — | 1 | [src/lib/commercialDemoFrame.ts:1](../../src/lib/commercialDemoFrame.ts#L1) |
| deep-link | `tok://auth/callback` | — | 1 | [src/lib/authDomains.ts:5](../../src/lib/authDomains.ts#L5) |
| deep-link | `tok://autopilot-runs/{restaurant_id}` | — | 1 | [src/lib/tokConnect.ts:264](../../src/lib/tokConnect.ts#L264) |
| deep-link | `tok://availability/{restaurant_id}` | — | 1 | [src/lib/tokConnect.ts:254](../../src/lib/tokConnect.ts#L254) |
| deep-link | `tok://campaign-preview/{restaurant_id}` | — | 1 | [src/lib/tokConnect.ts:259](../../src/lib/tokConnect.ts#L259) |
| deep-link | `tok://restaurants` | — | 1 | [src/lib/tokConnect.ts:244](../../src/lib/tokConnect.ts#L244) |
| deep-link | `tok://restaurants/{restaurant_id}` | — | 1 | [src/lib/tokConnect.ts:249](../../src/lib/tokConnect.ts#L249) |
| ios-universal-link | `admin.thetok.ch` | — | 1 | [ios/App/App/App.entitlements:10](../../ios/App/App/App.entitlements#L10) |
| ios-universal-link | `app.thetok.ch` | — | 1 | [ios/App/App/App.entitlements:9](../../ios/App/App/App.entitlements#L9) |
| ios-universal-link | `thetok.ch` | — | 1 | [ios/App/App/App.entitlements:7](../../ios/App/App/App.entitlements#L7) |
| ios-universal-link | `www.thetok.ch` | — | 1 | [ios/App/App/App.entitlements:8](../../ios/App/App/App.entitlements#L8) |
| pwa-shortcut | `/actualites` | Actualités | 1 | [public/manifest.json:89](../../public/manifest.json#L89) |
| pwa-shortcut | `/mon-espace?source=pwa-shortcut` | Mon espace | 1 | [public/manifest.json:50](../../public/manifest.json#L50) |
| pwa-shortcut | `/recherche?mode=reservation` | Réserver | 1 | [public/manifest.json:63](../../public/manifest.json#L63) |
| pwa-shortcut | `/ventes-flash` | Offres flash | 1 | [public/manifest.json:76](../../public/manifest.json#L76) |

## API Vercel

| Route | Méthodes | Handler | Intégrations | Source |
| --- | --- | --- | --- | --- |
| /api/marketing/agent | POST | marketingAgentHandler | google, supabase, vercel | [api/marketing/agent.ts](../../api/marketing/agent.ts) |
| /api/marketing/launch | POST | marketingLaunchHandler | google, supabase, vercel | [api/marketing/launch.ts](../../api/marketing/launch.ts) |
| /api/marketing/login | POST | marketingLoginHandler | google, supabase, vercel | [api/marketing/login.ts](../../api/marketing/login.ts) |
| /api/marketing/logout | POST | marketingLogoutHandler | google, supabase, vercel | [api/marketing/logout.ts](../../api/marketing/logout.ts) |
| /api/marketing/mfa/enroll | POST | marketingMfaEnrollHandler | google, supabase, vercel | [api/marketing/mfa/enroll.ts](../../api/marketing/mfa/enroll.ts) |
| /api/marketing/mfa/verify | POST | marketingMfaVerifyHandler | google, supabase, vercel | [api/marketing/mfa/verify.ts](../../api/marketing/mfa/verify.ts) |
| /api/marketing/orchestrator | POST | marketingOrchestratorHandler | google, supabase, vercel | [api/marketing/orchestrator.ts](../../api/marketing/orchestrator.ts) |
| /api/marketing/rpc | POST | marketingRpcHandler | google, supabase, vercel | [api/marketing/rpc.ts](../../api/marketing/rpc.ts) |
| /api/marketing/session | DELETE, GET | marketingSessionHandler | google, supabase, vercel | [api/marketing/session.ts](../../api/marketing/session.ts) |

## Opérations du BFF marketing

| Opération | Groupe | Source |
| --- | --- | --- |
| admin_approve_marketing_campaign | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:48](../../server/marketingBff.ts#L48) |
| admin_approve_marketing_item | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:49](../../server/marketingBff.ts#L49) |
| admin_cancel_marketing_item | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:50](../../server/marketingBff.ts#L50) |
| admin_complete_manual_marketing_delivery | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:51](../../server/marketingBff.ts#L51) |
| admin_complete_manual_marketing_item | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:52](../../server/marketingBff.ts#L52) |
| admin_create_marketing_campaign_bundle | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:53](../../server/marketingBff.ts#L53) |
| admin_estimate_marketing_audience | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:54](../../server/marketingBff.ts#L54) |
| admin_get_marketing_overview | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:55](../../server/marketingBff.ts#L55) |
| admin_list_marketing_automations | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:56](../../server/marketingBff.ts#L56) |
| admin_list_marketing_calendar | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:57](../../server/marketingBff.ts#L57) |
| admin_list_marketing_campaigns | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:58](../../server/marketingBff.ts#L58) |
| admin_list_marketing_contacts | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:59](../../server/marketingBff.ts#L59) |
| admin_list_marketing_deliveries | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:60](../../server/marketingBff.ts#L60) |
| admin_list_marketing_integrations | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:61](../../server/marketingBff.ts#L61) |
| admin_reveal_manual_delivery_target | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:62](../../server/marketingBff.ts#L62) |
| admin_retry_marketing_delivery | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:63](../../server/marketingBff.ts#L63) |
| admin_set_marketing_global_pause | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:64](../../server/marketingBff.ts#L64) |
| admin_suppress_marketing_contact | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:65](../../server/marketingBff.ts#L65) |
| admin_sync_marketing_client_consents | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:66](../../server/marketingBff.ts#L66) |
| admin_sync_marketing_prospect_catalog | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:67](../../server/marketingBff.ts#L67) |
| admin_upsert_marketing_automation | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:68](../../server/marketingBff.ts#L68) |
| admin_upsert_marketing_calendar_item | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:69](../../server/marketingBff.ts#L69) |
| admin_upsert_marketing_campaign | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:70](../../server/marketingBff.ts#L70) |
| admin_upsert_marketing_contact | MARKETING_OPERATION_NAMES | [server/marketingBff.ts:71](../../server/marketingBff.ts#L71) |
| admin_list_marketing_outreach | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:77](../../server/marketingBff.ts#L77) |
| admin_upsert_marketing_outreach_target | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:78](../../server/marketingBff.ts#L78) |
| admin_upsert_marketing_outreach_opportunity | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:79](../../server/marketingBff.ts#L79) |
| admin_upsert_marketing_outreach_draft | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:80](../../server/marketingBff.ts#L80) |
| admin_approve_marketing_outreach_draft | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:81](../../server/marketingBff.ts#L81) |
| admin_record_marketing_outreach_result | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:82](../../server/marketingBff.ts#L82) |
| admin_upsert_marketing_backlink | MARKETING_OUTREACH_OPERATION_NAMES | [server/marketingBff.ts:83](../../server/marketingBff.ts#L83) |
| admin_get_marketing_autopilot_dashboard | MARKETING_AUTOPILOT_OPERATION_NAMES | [server/marketingBff.ts:95](../../server/marketingBff.ts#L95) |
| admin_prepare_marketing_automation_action | MARKETING_AUTOPILOT_OPERATION_NAMES | [server/marketingBff.ts:96](../../server/marketingBff.ts#L96) |
| admin_simulate_marketing_automation | MARKETING_AUTOPILOT_OPERATION_NAMES | [server/marketingBff.ts:97](../../server/marketingBff.ts#L97) |
| admin_update_marketing_provider_control | MARKETING_AUTOPILOT_OPERATION_NAMES | [server/marketingBff.ts:98](../../server/marketingBff.ts#L98) |
| admin_upsert_marketing_asset | MARKETING_AUTOPILOT_OPERATION_NAMES | [server/marketingBff.ts:99](../../server/marketingBff.ts#L99) |

## Fonctions Edge Supabase

| Fonction | Source | Config déclarée | JWT config | Méthodes | Actions qualifiées | Intégrations |
| --- | --- | --- | --- | --- | --- | --- |
| admin-demo-entities | [supabase/functions/admin-demo-entities/index.ts:1](../../supabase/functions/admin-demo-entities/index.ts#L1) | oui ([supabase/config.toml:23](../../supabase/config.toml#L23)) | false | POST | create_restaurant, create_user, list | stripe, supabase |
| admin-restaurant-adjustment | [supabase/functions/admin-restaurant-adjustment/index.ts:1](../../supabase/functions/admin-restaurant-adjustment/index.ts#L1) | oui ([supabase/config.toml:194](../../supabase/config.toml#L194)) | false | POST | — | stripe |
| ai-accounting-agent | [supabase/functions/ai-accounting-agent/index.ts:1](../../supabase/functions/ai-accounting-agent/index.ts#L1) | oui ([supabase/config.toml:26](../../supabase/config.toml#L26)) | false | ANY | — | openai, stripe, supabase |
| ai-admin-dashboard-chat | [supabase/functions/ai-admin-dashboard-chat/index.ts:1](../../supabase/functions/ai-admin-dashboard-chat/index.ts#L1) | oui ([supabase/config.toml:20](../../supabase/config.toml#L20)) | false | ANY | history, messages | openai, stripe |
| ai-admin-monitor | [supabase/functions/ai-admin-monitor/index.ts:1](../../supabase/functions/ai-admin-monitor/index.ts#L1) | oui ([supabase/config.toml:17](../../supabase/config.toml#L17)) | false | GET | full_report, reject_public_analytics_event | openai, supabase, vercel |
| ai-admin-support | [supabase/functions/ai-admin-support/index.ts:1](../../supabase/functions/ai-admin-support/index.ts#L1) | oui ([supabase/config.toml:14](../../supabase/config.toml#L14)) | false | ANY | — | openai |
| ai-campaign-studio | [supabase/functions/ai-campaign-studio/index.ts:1](../../supabase/functions/ai-campaign-studio/index.ts#L1) | oui ([supabase/config.toml:50](../../supabase/config.toml#L50)) | false | ANY | approve, generate, list, mark_launched | openai |
| ai-client-chat | [supabase/functions/ai-client-chat/index.ts:1](../../supabase/functions/ai-client-chat/index.ts#L1) | oui ([supabase/config.toml:29](../../supabase/config.toml#L29)) | false | ANY | — | openai |
| ai-client-support | [supabase/functions/ai-client-support/index.ts:1](../../supabase/functions/ai-client-support/index.ts#L1) | oui ([supabase/config.toml:32](../../supabase/config.toml#L32)) | false | ANY | — | openai |
| ai-guardian | [supabase/functions/ai-guardian/index.ts:1](../../supabase/functions/ai-guardian/index.ts#L1) | oui ([supabase/config.toml:53](../../supabase/config.toml#L53)) | false | ANY | analyze, overview, verify | openai, supabase |
| ai-image-enhance | [supabase/functions/ai-image-enhance/index.ts:1](../../supabase/functions/ai-image-enhance/index.ts#L1) | oui ([supabase/config.toml:35](../../supabase/config.toml#L35)) | false | POST | — | openai |
| ai-marketing-agent | [supabase/functions/ai-marketing-agent/index.ts:1](../../supabase/functions/ai-marketing-agent/index.ts#L1) | oui ([supabase/config.toml:56](../../supabase/config.toml#L56)) | false | POST | discover_sources, generate, list_runs, unknown | openai |
| ai-restaurant-agent | [supabase/functions/ai-restaurant-agent/index.ts:1](../../supabase/functions/ai-restaurant-agent/index.ts#L1) | oui ([supabase/config.toml:41](../../supabase/config.toml#L41)) | false | ANY | sales_insights | openai |
| ai-restaurant-tools | [supabase/functions/ai-restaurant-tools/index.ts:1](../../supabase/functions/ai-restaurant-tools/index.ts#L1) | oui ([supabase/config.toml:47](../../supabase/config.toml#L47)) | false | ANY | — | openai |
| ai-social-post-copy | [supabase/functions/ai-social-post-copy/index.ts:1](../../supabase/functions/ai-social-post-copy/index.ts#L1) | oui ([supabase/config.toml:44](../../supabase/config.toml#L44)) | false | POST | — | openai |
| ai-support-resolution | [supabase/functions/ai-support-resolution/index.ts:1](../../supabase/functions/ai-support-resolution/index.ts#L1) | oui ([supabase/config.toml:59](../../supabase/config.toml#L59)) | false | POST | analyze, execute, list, reject | openai, resend, stripe, supabase |
| aligro-catalog-sync | [supabase/functions/aligro-catalog-sync/index.ts:1](../../supabase/functions/aligro-catalog-sync/index.ts#L1) | oui ([supabase/config.toml:176](../../supabase/config.toml#L176)) | false | POST | — | supabase |
| analyze-restaurant-image | [supabase/functions/analyze-restaurant-image/index.ts:1](../../supabase/functions/analyze-restaurant-image/index.ts#L1) | oui ([supabase/config.toml:38](../../supabase/config.toml#L38)) | false | POST | — | openai, supabase |
| apple-storekit-webhook | [supabase/functions/apple-storekit-webhook/index.ts:1](../../supabase/functions/apple-storekit-webhook/index.ts#L1) | oui ([supabase/config.toml:272](../../supabase/config.toml#L272)) | false | POST | — | — |
| authorize-match-group-order | [supabase/functions/authorize-match-group-order/index.ts:1](../../supabase/functions/authorize-match-group-order/index.ts#L1) | oui ([supabase/config.toml:62](../../supabase/config.toml#L62)) | false | ANY | — | stripe |
| campaign-portal | [supabase/functions/campaign-portal/index.ts:1](../../supabase/functions/campaign-portal/index.ts#L1) | oui ([supabase/config.toml:65](../../supabase/config.toml#L65)) | false | ANY | delete, estimate_audience, list, save, update_status | twint |
| cancel-payment-attempt | [supabase/functions/cancel-payment-attempt/index.ts:1](../../supabase/functions/cancel-payment-attempt/index.ts#L1) | oui ([supabase/config.toml:71](../../supabase/config.toml#L71)) | false | ANY | — | stripe |
| cancel-pending-order-checkout | [supabase/functions/cancel-pending-order-checkout/index.ts:1](../../supabase/functions/cancel-pending-order-checkout/index.ts#L1) | oui ([supabase/config.toml:68](../../supabase/config.toml#L68)) | false | POST | — | stripe |
| capture-due-match-groups | [supabase/functions/capture-due-match-groups/index.ts:1](../../supabase/functions/capture-due-match-groups/index.ts#L1) | oui ([supabase/config.toml:74](../../supabase/config.toml#L74)) | false | ANY | — | stripe |
| close-due-match-groups | [supabase/functions/close-due-match-groups/index.ts:1](../../supabase/functions/close-due-match-groups/index.ts#L1) | oui ([supabase/config.toml:77](../../supabase/config.toml#L77)) | false | ANY | — | — |
| cloudprinter-webhook | [supabase/functions/cloudprinter-webhook/index.ts:1](../../supabase/functions/cloudprinter-webhook/index.ts#L1) | oui ([supabase/config.toml:284](../../supabase/config.toml#L284)) | false | POST | — | — |
| commercial-demo-ai | [supabase/functions/commercial-demo-ai/index.ts:1](../../supabase/functions/commercial-demo-ai/index.ts#L1) | oui ([supabase/config.toml:86](../../supabase/config.toml#L86)) | false | POST | chat, maintenance_cleanup, visual_generate | openai, supabase |
| commercial-demo-checkout | [supabase/functions/commercial-demo-checkout/index.ts:1](../../supabase/functions/commercial-demo-checkout/index.ts#L1) | oui ([supabase/config.toml:83](../../supabase/config.toml#L83)) | false | POST | create | stripe, supabase |
| commercial-followup-reminder | [supabase/functions/commercial-followup-reminder/index.ts:1](../../supabase/functions/commercial-followup-reminder/index.ts#L1) | oui ([supabase/config.toml:80](../../supabase/config.toml#L80)) | false | POST | — | — |
| complete-order-checkout | [supabase/functions/complete-order-checkout/index.ts:1](../../supabase/functions/complete-order-checkout/index.ts#L1) | oui ([supabase/config.toml:98](../../supabase/config.toml#L98)) | false | ANY | — | stripe |
| complete-restaurant-credit-pack-checkout | [supabase/functions/complete-restaurant-credit-pack-checkout/index.ts:1](../../supabase/functions/complete-restaurant-credit-pack-checkout/index.ts#L1) | oui ([supabase/config.toml:101](../../supabase/config.toml#L101)) | false | ANY | — | stripe |
| confirm-match-group-authorization | [supabase/functions/confirm-match-group-authorization/index.ts:1](../../supabase/functions/confirm-match-group-authorization/index.ts#L1) | oui ([supabase/config.toml:89](../../supabase/config.toml#L89)) | false | POST | — | stripe, supabase |
| contact-support | [supabase/functions/contact-support/index.ts:1](../../supabase/functions/contact-support/index.ts#L1) | oui ([supabase/config.toml:92](../../supabase/config.toml#L92)) | false | POST | — | cloudflare |
| courier-portal | [supabase/functions/courier-portal/index.ts:1](../../supabase/functions/courier-portal/index.ts#L1) | oui ([supabase/config.toml:104](../../supabase/config.toml#L104)) | false | ANY | ensure_profile, respond_attempt, save_profile, sync_presence, update_job_status, verify_delivery_proof | — |
| create-checkout | [supabase/functions/create-checkout/index.ts:1](../../supabase/functions/create-checkout/index.ts#L1) | oui ([supabase/config.toml:107](../../supabase/config.toml#L107)) | false | ANY | — | stripe, twint |
| create-chefs-table-reservation | [supabase/functions/create-chefs-table-reservation/index.ts:1](../../supabase/functions/create-chefs-table-reservation/index.ts#L1) | oui ([supabase/config.toml:110](../../supabase/config.toml#L110)) | false | ANY | — | stripe |
| create-reservation | [supabase/functions/create-reservation/index.ts:1](../../supabase/functions/create-reservation/index.ts#L1) | oui ([supabase/config.toml:113](../../supabase/config.toml#L113)) | false | ANY | — | google |
| create-social-post-boost | [supabase/functions/create-social-post-boost/index.ts:1](../../supabase/functions/create-social-post-boost/index.ts#L1) | oui ([supabase/config.toml:116](../../supabase/config.toml#L116)) | false | POST | — | supabase |
| create-zero-attente-reservation | [supabase/functions/create-zero-attente-reservation/index.ts:1](../../supabase/functions/create-zero-attente-reservation/index.ts#L1) | oui ([supabase/config.toml:119](../../supabase/config.toml#L119)) | false | ANY | — | stripe, twint |
| crm-mfa-recovery | [supabase/functions/crm-mfa-recovery/index.ts:1](../../supabase/functions/crm-mfa-recovery/index.ts#L1) | oui ([supabase/config.toml:95](../../supabase/config.toml#L95)) | false | POST | confirm, request, string | resend, supabase |
| customer-memory | [supabase/functions/customer-memory/index.ts:1](../../supabase/functions/customer-memory/index.ts#L1) | oui ([supabase/config.toml:122](../../supabase/config.toml#L122)) | false | ANY | clear, confirm, delete, export, infer, list, reject, upsert | openai |
| daily-dish-ai | [supabase/functions/daily-dish-ai/index.ts:1](../../supabase/functions/daily-dish-ai/index.ts#L1) | oui ([supabase/config.toml:128](../../supabase/config.toml#L128)) | false | ANY | generate, publish, refine, regenerate, select, set_enabled, status | openai |
| daily-slot-spin | [supabase/functions/daily-slot-spin/index.ts:1](../../supabase/functions/daily-slot-spin/index.ts#L1) | oui ([supabase/config.toml:131](../../supabase/config.toml#L131)) | false | GET, POST | — | — |
| delete-account | [supabase/functions/delete-account/index.ts:1](../../supabase/functions/delete-account/index.ts#L1) | oui ([supabase/config.toml:125](../../supabase/config.toml#L125)) | false | POST | — | — |
| discover-thefork-official-sites | [supabase/functions/discover-thefork-official-sites/index.ts:1](../../supabase/functions/discover-thefork-official-sites/index.ts#L1) | oui ([supabase/config.toml:149](../../supabase/config.toml#L149)) | false | GET, OPTIONS, POST | — | google, supabase |
| dispatch-order | [supabase/functions/dispatch-order/index.ts:1](../../supabase/functions/dispatch-order/index.ts#L1) | oui ([supabase/config.toml:134](../../supabase/config.toml#L134)) | false | ANY | — | supabase |
| dispatch-timeout | [supabase/functions/dispatch-timeout/index.ts:1](../../supabase/functions/dispatch-timeout/index.ts#L1) | oui ([supabase/config.toml:137](../../supabase/config.toml#L137)) | false | ANY | — | supabase |
| enrich-directory-cuisines | [supabase/functions/enrich-directory-cuisines/index.ts:1](../../supabase/functions/enrich-directory-cuisines/index.ts#L1) | oui ([supabase/config.toml:152](../../supabase/config.toml#L152)) | false | GET | — | google, supabase |
| enrich-directory-cuisines-osm | [supabase/functions/enrich-directory-cuisines-osm/index.ts:1](../../supabase/functions/enrich-directory-cuisines-osm/index.ts#L1) | oui ([supabase/config.toml:155](../../supabase/config.toml#L155)) | false | GET, POST | — | supabase |
| enrich-directory-images | [supabase/functions/enrich-directory-images/index.ts:1](../../supabase/functions/enrich-directory-images/index.ts#L1) | oui ([supabase/config.toml:140](../../supabase/config.toml#L140)) | false | GET, POST | — | google, supabase |
| enrich-restaurants | [supabase/functions/enrich-restaurants/index.ts:1](../../supabase/functions/enrich-restaurants/index.ts#L1) | oui ([supabase/config.toml:161](../../supabase/config.toml#L161)) | false | POST | — | supabase |
| enrich-thefork-images | [supabase/functions/enrich-thefork-images/index.ts:1](../../supabase/functions/enrich-thefork-images/index.ts#L1) | oui ([supabase/config.toml:143](../../supabase/config.toml#L143)) | false | GET, OPTIONS, POST | — | google, supabase |
| floorplan-ai | [supabase/functions/floorplan-ai/index.ts:1](../../supabase/functions/floorplan-ai/index.ts#L1) | oui ([supabase/config.toml:164](../../supabase/config.toml#L164)) | false | POST | generate, image-import, optimize, suggest-furniture | openai |
| generate-campaign | [supabase/functions/generate-campaign/index.ts:1](../../supabase/functions/generate-campaign/index.ts#L1) | oui ([supabase/config.toml:167](../../supabase/config.toml#L167)) | false | ANY | — | openai |
| generate-invoices | [supabase/functions/generate-invoices/index.ts:1](../../supabase/functions/generate-invoices/index.ts#L1) | oui ([supabase/config.toml:203](../../supabase/config.toml#L203)) | false | ANY | — | supabase |
| google-actions-center | [supabase/functions/google-actions-center/index.ts:1](../../supabase/functions/google-actions-center/index.ts#L1) | oui ([supabase/config.toml:170](../../supabase/config.toml#L170)) | false | GET, POST | — | google |
| google-actions-center-sync | [supabase/functions/google-actions-center-sync/index.ts:1](../../supabase/functions/google-actions-center-sync/index.ts#L1) | oui ([supabase/config.toml:173](../../supabase/config.toml#L173)) | false | POST | — | google, supabase |
| manage-restaurant-subscription | [supabase/functions/manage-restaurant-subscription/index.ts:1](../../supabase/functions/manage-restaurant-subscription/index.ts#L1) | oui ([supabase/config.toml:209](../../supabase/config.toml#L209)) | false | ANY | cancel, change_plan, resume | stripe |
| manage-tok-one-subscription | [supabase/functions/manage-tok-one-subscription/index.ts:1](../../supabase/functions/manage-tok-one-subscription/index.ts#L1) | oui ([supabase/config.toml:206](../../supabase/config.toml#L206)) | false | ANY | cancel, sync_checkout_session | stripe |
| marketing-orchestrator | [supabase/functions/marketing-orchestrator/index.ts:1](../../supabase/functions/marketing-orchestrator/index.ts#L1) | oui ([supabase/config.toml:275](../../supabase/config.toml#L275)) | false | POST | check_meta, run_item | google, resend, supabase |
| marketing-provider-webhook | [supabase/functions/marketing-provider-webhook/index.ts:1](../../supabase/functions/marketing-provider-webhook/index.ts#L1) | oui ([supabase/config.toml:278](../../supabase/config.toml#L278)) | false | POST | — | — |
| marketing-unsubscribe | [supabase/functions/marketing-unsubscribe/index.ts:1](../../supabase/functions/marketing-unsubscribe/index.ts#L1) | oui ([supabase/config.toml:281](../../supabase/config.toml#L281)) | false | GET, POST | — | — |
| menu-image-import | [supabase/functions/menu-image-import/index.ts:1](../../supabase/functions/menu-image-import/index.ts#L1) | oui ([supabase/config.toml:212](../../supabase/config.toml#L212)) | false | POST | — | openai |
| notification-dispatch | [supabase/functions/notification-dispatch/index.ts:1](../../supabase/functions/notification-dispatch/index.ts#L1) | oui ([supabase/config.toml:179](../../supabase/config.toml#L179)) | false | ANY | — | — |
| ops-incident-control | [supabase/functions/ops-incident-control/index.ts:1](../../supabase/functions/ops-incident-control/index.ts#L1) | oui ([supabase/config.toml:182](../../supabase/config.toml#L182)) | false | GET, POST | ingest, repair-context, scan, workflow-update | openai, sentry, stripe, supabase |
| ops-incident-native-scan | [supabase/functions/ops-incident-native-scan/index.ts:1](../../supabase/functions/ops-incident-native-scan/index.ts#L1) | oui ([supabase/config.toml:185](../../supabase/config.toml#L185)) | false | POST | — | supabase |
| payment-attempt-status | [supabase/functions/payment-attempt-status/index.ts:1](../../supabase/functions/payment-attempt-status/index.ts#L1) | oui ([supabase/config.toml:188](../../supabase/config.toml#L188)) | false | ANY | — | stripe |
| print-admin | [supabase/functions/print-admin/index.ts:1](../../supabase/functions/print-admin/index.ts#L1) | oui ([supabase/config.toml:287](../../supabase/config.toml#L287)) | false | POST | cancel, list, map_product, reconcile, reorder, settings, update_settings | — |
| print-catalog | [supabase/functions/print-catalog/index.ts:1](../../supabase/functions/print-catalog/index.ts#L1) | oui ([supabase/config.toml:290](../../supabase/config.toml#L290)) | false | POST | admin_mappings, discover, generation_catalog, hydrate, list, map, sync | — |
| print-checkout | [supabase/functions/print-checkout/index.ts:1](../../supabase/functions/print-checkout/index.ts#L1) | oui ([supabase/config.toml:293](../../supabase/config.toml#L293)) | false | POST | — | stripe, supabase |
| print-export | [supabase/functions/print-export/index.ts:1](../../supabase/functions/print-export/index.ts#L1) | oui ([supabase/config.toml:299](../../supabase/config.toml#L299)) | false | POST | approve | — |
| print-orchestrator | [supabase/functions/print-orchestrator/index.ts:1](../../supabase/functions/print-orchestrator/index.ts#L1) | oui ([supabase/config.toml:302](../../supabase/config.toml#L302)) | false | POST | paused, stop | stripe |
| print-order-action | [supabase/functions/print-order-action/index.ts:1](../../supabase/functions/print-order-action/index.ts#L1) | oui ([supabase/config.toml:305](../../supabase/config.toml#L305)) | false | POST | cancel, get, list, reorder | stripe |
| print-quote | [supabase/functions/print-quote/index.ts:1](../../supabase/functions/print-quote/index.ts#L1) | oui ([supabase/config.toml:308](../../supabase/config.toml#L308)) | false | POST | — | — |
| print-reconcile | [supabase/functions/print-reconcile/index.ts:1](../../supabase/functions/print-reconcile/index.ts#L1) | oui ([supabase/config.toml:311](../../supabase/config.toml#L311)) | false | POST | — | — |
| print-sandbox-complete | [supabase/functions/print-sandbox-complete/index.ts:1](../../supabase/functions/print-sandbox-complete/index.ts#L1) | oui ([supabase/config.toml:296](../../supabase/config.toml#L296)) | false | GET | — | stripe |
| process-refund | [supabase/functions/process-refund/index.ts:1](../../supabase/functions/process-refund/index.ts#L1) | oui ([supabase/config.toml:191](../../supabase/config.toml#L191)) | false | ANY | — | stripe |
| provision-commercial-accounts | [supabase/functions/provision-commercial-accounts/index.ts:1](../../supabase/functions/provision-commercial-accounts/index.ts#L1) | oui ([supabase/config.toml:197](../../supabase/config.toml#L197)) | false | POST | create, list, reset_password, string | — |
| provision-commercial-demo-logins | [supabase/functions/provision-commercial-demo-logins/index.ts:1](../../supabase/functions/provision-commercial-demo-logins/index.ts#L1) | oui ([supabase/config.toml:351](../../supabase/config.toml#L351)) | true | OPTIONS | — | supabase |
| provision-commercial-demo-project-session | [supabase/functions/provision-commercial-demo-project-session/index.ts:1](../../supabase/functions/provision-commercial-demo-project-session/index.ts#L1) | oui ([supabase/config.toml:200](../../supabase/config.toml#L200)) | false | POST | — | stripe, supabase |
| reconcile-match-group-authorizations | [supabase/functions/reconcile-match-group-authorizations/index.ts:1](../../supabase/functions/reconcile-match-group-authorizations/index.ts#L1) | oui ([supabase/config.toml:215](../../supabase/config.toml#L215)) | false | ANY | — | stripe |
| reconcile-paid-order-checkouts | [supabase/functions/reconcile-paid-order-checkouts/index.ts:1](../../supabase/functions/reconcile-paid-order-checkouts/index.ts#L1) | oui ([supabase/config.toml:218](../../supabase/config.toml#L218)) | false | ANY | — | stripe |
| restaurant-advisor | [supabase/functions/restaurant-advisor/index.ts:1](../../supabase/functions/restaurant-advisor/index.ts#L1) | oui ([supabase/config.toml:221](../../supabase/config.toml#L221)) | false | POST | — | openai, stripe |
| restaurant-media-governance | [supabase/functions/restaurant-media-governance/index.ts:1](../../supabase/functions/restaurant-media-governance/index.ts#L1) | oui ([supabase/config.toml:227](../../supabase/config.toml#L227)) | false | POST | add_ai_creation_to_gallery, string | — |
| restaurant-order-status | [supabase/functions/restaurant-order-status/index.ts:1](../../supabase/functions/restaurant-order-status/index.ts#L1) | oui ([supabase/config.toml:224](../../supabase/config.toml#L224)) | false | ANY | — | — |
| scrape-restaurants | [supabase/functions/scrape-restaurants/index.ts:1](../../supabase/functions/scrape-restaurants/index.ts#L1) | oui ([supabase/config.toml:230](../../supabase/config.toml#L230)) | false | POST | — | supabase |
| send-email | [supabase/functions/send-email/index.ts:1](../../supabase/functions/send-email/index.ts#L1) | oui ([supabase/config.toml:233](../../supabase/config.toml#L233)) | false | POST | — | resend, supabase |
| send-push | [supabase/functions/send-push/index.ts:1](../../supabase/functions/send-push/index.ts#L1) | oui ([supabase/config.toml:236](../../supabase/config.toml#L236)) | false | POST | — | firebase, google, supabase |
| settle-developer-statement | [supabase/functions/settle-developer-statement/index.ts:1](../../supabase/functions/settle-developer-statement/index.ts#L1) | oui ([supabase/config.toml:254](../../supabase/config.toml#L254)) | false | ANY | — | stripe |
| stripe-connect-onboard | [supabase/functions/stripe-connect-onboard/index.ts:1](../../supabase/functions/stripe-connect-onboard/index.ts#L1) | oui ([supabase/config.toml:239](../../supabase/config.toml#L239)) | false | POST | — | stripe |
| stripe-connect-status | [supabase/functions/stripe-connect-status/index.ts:1](../../supabase/functions/stripe-connect-status/index.ts#L1) | oui ([supabase/config.toml:242](../../supabase/config.toml#L242)) | false | POST | — | stripe |
| stripe-setup | [supabase/functions/stripe-setup/index.ts:1](../../supabase/functions/stripe-setup/index.ts#L1) | non | null | OPTIONS | — | stripe, supabase |
| stripe-subscription-reconcile | [supabase/functions/stripe-subscription-reconcile/index.ts:1](../../supabase/functions/stripe-subscription-reconcile/index.ts#L1) | oui ([supabase/config.toml:251](../../supabase/config.toml#L251)) | false | POST | — | stripe, supabase |
| stripe-webhook | [supabase/functions/stripe-webhook/index.ts:1](../../supabase/functions/stripe-webhook/index.ts#L1) | oui ([supabase/config.toml:245](../../supabase/config.toml#L245)) | false | POST | — | stripe, supabase |
| stripe-worker | [supabase/functions/stripe-worker/index.ts:1](../../supabase/functions/stripe-worker/index.ts#L1) | oui ([supabase/config.toml:248](../../supabase/config.toml#L248)) | false | OPTIONS, POST | — | stripe, supabase |
| submit-signup-application | [supabase/functions/submit-signup-application/index.ts:1](../../supabase/functions/submit-signup-application/index.ts#L1) | oui ([supabase/config.toml:266](../../supabase/config.toml#L266)) | false | ANY | — | — |
| sync-apple-storekit | [supabase/functions/sync-apple-storekit/index.ts:1](../../supabase/functions/sync-apple-storekit/index.ts#L1) | oui ([supabase/config.toml:269](../../supabase/config.toml#L269)) | false | POST | — | — |
| tok-connect-admin | [supabase/functions/tok-connect-admin/index.ts:1](../../supabase/functions/tok-connect-admin/index.ts#L1) | oui ([supabase/config.toml:329](../../supabase/config.toml#L329)) | false | POST | admin-overview, set-restaurant-mcp-access | supabase |
| tok-connect-api | [supabase/functions/tok-connect-api/index.ts:1](../../supabase/functions/tok-connect-api/index.ts#L1) | oui ([supabase/config.toml:317](../../supabase/config.toml#L317)) | false | GET, POST | — | — |
| tok-connect-app-bridge | [supabase/functions/tok-connect-app-bridge/index.ts:1](../../supabase/functions/tok-connect-app-bridge/index.ts#L1) | oui ([supabase/config.toml:335](../../supabase/config.toml#L335)) | false | GET, POST | insert, list, select, update | stripe, supabase |
| tok-connect-chatgpt | [supabase/functions/tok-connect-chatgpt/index.ts:1](../../supabase/functions/tok-connect-chatgpt/index.ts#L1) | oui ([supabase/config.toml:338](../../supabase/config.toml#L338)) | false | GET, POST | — | openai, supabase |
| tok-connect-commercial-bridge | [supabase/functions/tok-connect-commercial-bridge/index.ts:1](../../supabase/functions/tok-connect-commercial-bridge/index.ts#L1) | oui ([supabase/config.toml:341](../../supabase/config.toml#L341)) | false | POST | demo_session, list, read, rpc | supabase |
| tok-connect-full-app-mcp | [supabase/functions/tok-connect-full-app-mcp/index.ts:1](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L1) | oui ([supabase/config.toml:323](../../supabase/config.toml#L323)) | false | GET, POST | — | google, openai, stripe, supabase, vercel |
| tok-connect-mcp | [supabase/functions/tok-connect-mcp/index.ts:1](../../supabase/functions/tok-connect-mcp/index.ts#L1) | oui ([supabase/config.toml:320](../../supabase/config.toml#L320)) | false | GET, POST | — | google, openai, stripe, supabase, vercel |
| tok-connect-oauth | [supabase/functions/tok-connect-oauth/index.ts:1](../../supabase/functions/tok-connect-oauth/index.ts#L1) | oui ([supabase/config.toml:314](../../supabase/config.toml#L314)) | false | GET, POST | — | supabase |
| tok-connect-portal | [supabase/functions/tok-connect-portal/index.ts:1](../../supabase/functions/tok-connect-portal/index.ts#L1) | oui ([supabase/config.toml:326](../../supabase/config.toml#L326)) | false | POST | approve-agent-run, approve-partner, create-sandbox-client, create-webhook-endpoint, mcp-connection-status, overview, reject-agent-run, revoke-client, revoke-partner, rotate-client-secret, send-webhook-test, suspend-partner, update-client-policy, update-grant-status, upsert-restaurant-grant | supabase |
| tok-connect-remote-mcp | [supabase/functions/tok-connect-remote-mcp/index.ts:1](../../supabase/functions/tok-connect-remote-mcp/index.ts#L1) | oui ([supabase/config.toml:344](../../supabase/config.toml#L344)) | false | GET, POST | — | supabase |
| tok-connect-webhook-dispatch | [supabase/functions/tok-connect-webhook-dispatch/index.ts:1](../../supabase/functions/tok-connect-webhook-dispatch/index.ts#L1) | oui ([supabase/config.toml:332](../../supabase/config.toml#L332)) | false | POST | — | supabase |
| tok-pulse-widget | [supabase/functions/tok-pulse-widget/index.ts:1](../../supabase/functions/tok-pulse-widget/index.ts#L1) | oui ([supabase/config.toml:347](../../supabase/config.toml#L347)) | false | GET | — | supabase |
| track-analytics | [supabase/functions/track-analytics/index.ts:1](../../supabase/functions/track-analytics/index.ts#L1) | oui ([supabase/config.toml:257](../../supabase/config.toml#L257)) | false | POST | — | supabase |
| track-sponsored-event | [supabase/functions/track-sponsored-event/index.ts:1](../../supabase/functions/track-sponsored-event/index.ts#L1) | oui ([supabase/config.toml:260](../../supabase/config.toml#L260)) | false | POST | — | supabase |
| validate-order | [supabase/functions/validate-order/index.ts:1](../../supabase/functions/validate-order/index.ts#L1) | oui ([supabase/config.toml:263](../../supabase/config.toml#L263)) | false | ANY | — | stripe |
| verify-directory-commercial-names | [supabase/functions/verify-directory-commercial-names/index.ts:1](../../supabase/functions/verify-directory-commercial-names/index.ts#L1) | oui ([supabase/config.toml:158](../../supabase/config.toml#L158)) | false | GET | — | google, supabase |
| verify-directory-image-truth | [supabase/functions/verify-directory-image-truth/index.ts:1](../../supabase/functions/verify-directory-image-truth/index.ts#L1) | oui ([supabase/config.toml:146](../../supabase/config.toml#L146)) | false | GET, OPTIONS | — | google, supabase |

### Sous-routes HTTP des fonctions Edge

| Fonction | Méthode | Route | Endpoint complet | Paramètres | Source |
| --- | --- | --- | --- | --- | --- |
| google-actions-center | POST | /v3/BatchAvailabilityLookup/ | /functions/v1/google-actions-center/v3/BatchAvailabilityLookup/ | — | [supabase/functions/google-actions-center/index.ts:991](../../supabase/functions/google-actions-center/index.ts#L991) |
| google-actions-center | POST | /v3/CreateBooking/ | /functions/v1/google-actions-center/v3/CreateBooking/ | — | [supabase/functions/google-actions-center/index.ts:994](../../supabase/functions/google-actions-center/index.ts#L994) |
| google-actions-center | POST | /v3/GetBookingStatus/ | /functions/v1/google-actions-center/v3/GetBookingStatus/ | — | [supabase/functions/google-actions-center/index.ts:1000](../../supabase/functions/google-actions-center/index.ts#L1000) |
| google-actions-center | GET | /v3/HealthCheck/ | /functions/v1/google-actions-center/v3/HealthCheck/ | — | [supabase/functions/google-actions-center/index.ts:985](../../supabase/functions/google-actions-center/index.ts#L985) |
| google-actions-center | POST | /v3/ListBookings/ | /functions/v1/google-actions-center/v3/ListBookings/ | — | [supabase/functions/google-actions-center/index.ts:1003](../../supabase/functions/google-actions-center/index.ts#L1003) |
| google-actions-center | POST | /v3/UpdateBooking/ | /functions/v1/google-actions-center/v3/UpdateBooking/ | — | [supabase/functions/google-actions-center/index.ts:997](../../supabase/functions/google-actions-center/index.ts#L997) |
| google-actions-center | GET | /v3/feeds/availability/ | /functions/v1/google-actions-center/v3/feeds/availability/ | — | [supabase/functions/google-actions-center/index.ts:1012](../../supabase/functions/google-actions-center/index.ts#L1012) |
| google-actions-center | GET | /v3/feeds/merchants/ | /functions/v1/google-actions-center/v3/feeds/merchants/ | — | [supabase/functions/google-actions-center/index.ts:1006](../../supabase/functions/google-actions-center/index.ts#L1006) |
| google-actions-center | GET | /v3/feeds/services/ | /functions/v1/google-actions-center/v3/feeds/services/ | — | [supabase/functions/google-actions-center/index.ts:1009](../../supabase/functions/google-actions-center/index.ts#L1009) |
| tok-connect-api | POST | /v1/autopilot/plan | /functions/v1/tok-connect-api/v1/autopilot/plan | — | [supabase/functions/tok-connect-api/index.ts:1016](../../supabase/functions/tok-connect-api/index.ts#L1016) |
| tok-connect-api | POST | /v1/campaigns/preview | /functions/v1/tok-connect-api/v1/campaigns/preview | — | [supabase/functions/tok-connect-api/index.ts:952](../../supabase/functions/tok-connect-api/index.ts#L952) |
| tok-connect-api | GET | /v1/credits/balance | /functions/v1/tok-connect-api/v1/credits/balance | — | [supabase/functions/tok-connect-api/index.ts:839](../../supabase/functions/tok-connect-api/index.ts#L839) |
| tok-connect-api | POST | /v1/reservations/:id/cancel/preview | /functions/v1/tok-connect-api/v1/reservations/:id/cancel/preview | id | [supabase/functions/tok-connect-api/index.ts:588](../../supabase/functions/tok-connect-api/index.ts#L588) |
| tok-connect-api | POST | /v1/reservations/:id/cancel | /functions/v1/tok-connect-api/v1/reservations/:id/cancel | id | [supabase/functions/tok-connect-api/index.ts:628](../../supabase/functions/tok-connect-api/index.ts#L628) |
| tok-connect-api | POST | /v1/reservations/preview | /functions/v1/tok-connect-api/v1/reservations/preview | — | [supabase/functions/tok-connect-api/index.ts:372](../../supabase/functions/tok-connect-api/index.ts#L372) |
| tok-connect-api | POST | /v1/reservations | /functions/v1/tok-connect-api/v1/reservations | — | [supabase/functions/tok-connect-api/index.ts:422](../../supabase/functions/tok-connect-api/index.ts#L422) |
| tok-connect-api | GET | /v1/restaurants/:id/availability | /functions/v1/tok-connect-api/v1/restaurants/:id/availability | id | [supabase/functions/tok-connect-api/index.ts:332](../../supabase/functions/tok-connect-api/index.ts#L332) |
| tok-connect-api | GET | /v1/restaurants/:id/menu | /functions/v1/tok-connect-api/v1/restaurants/:id/menu | id | [supabase/functions/tok-connect-api/index.ts:289](../../supabase/functions/tok-connect-api/index.ts#L289) |
| tok-connect-api | GET | /v1/restaurants/:id | /functions/v1/tok-connect-api/v1/restaurants/:id | id | [supabase/functions/tok-connect-api/index.ts:250](../../supabase/functions/tok-connect-api/index.ts#L250) |
| tok-connect-api | GET | /v1/restaurants | /functions/v1/tok-connect-api/v1/restaurants | — | [supabase/functions/tok-connect-api/index.ts:206](../../supabase/functions/tok-connect-api/index.ts#L206) |

### Endpoints des workers

| Worker | Méthode statique | Route | Source |
| --- | --- | --- | --- |
| image-ai-worker | ANY | /healthz | [workers/image-ai-worker/index.js:251](../../workers/image-ai-worker/index.js#L251) |
| image-ai-worker | ANY | /readyz | [workers/image-ai-worker/index.js:252](../../workers/image-ai-worker/index.js#L252) |

## Routes statiques et chemins référencés

Les ressources publiques correspondent exactement aux fichiers du dossier `public/`; leur type distingue les pages navigables des manifests, données et médias. Les chemins référencés sont des littéraux trouvés dans le code : ils peuvent être des routes internes, des endpoints, des retours OAuth, des deep links ou des destinations externes.

### Ressources publiques

| Chemin servi | Type | Source |
| --- | --- | --- |
| /.well-known/apple-app-site-association | platform | [public/.well-known/apple-app-site-association](../../public/.well-known/apple-app-site-association) |
| /.well-known/assetlinks.json | platform | [public/.well-known/assetlinks.json](../../public/.well-known/assetlinks.json) |
| /4c81caf5-ee6d-400c-8605-c61d010a05de.png | media | [public/4c81caf5-ee6d-400c-8605-c61d010a05de.png](../../public/4c81caf5-ee6d-400c-8605-c61d010a05de.png) |
| /5a64288a-9712-4aae-8293-b0570ecd8668.png | media | [public/5a64288a-9712-4aae-8293-b0570ecd8668.png](../../public/5a64288a-9712-4aae-8293-b0570ecd8668.png) |
| /64b6c2b1-eeb7-4cec-9f09-cb58519c17bc.png | media | [public/64b6c2b1-eeb7-4cec-9f09-cb58519c17bc.png](../../public/64b6c2b1-eeb7-4cec-9f09-cb58519c17bc.png) |
| /B3A185C6-2CC3-471E-AC4D-3A4B7461084E.png | media | [public/B3A185C6-2CC3-471E-AC4D-3A4B7461084E.png](../../public/B3A185C6-2CC3-471E-AC4D-3A4B7461084E.png) |
| /ChatGPT Image 16 juin 2026, 12_50_15.png | media | [public/ChatGPT Image 16 juin 2026, 12_50_15.png](../../public/ChatGPT%20Image%2016%20juin%202026%2C%2012_50_15.png) |
| /ChatGPT Image 16 juin 2026, 13_36_20.png | media | [public/ChatGPT Image 16 juin 2026, 13_36_20.png](../../public/ChatGPT%20Image%2016%20juin%202026%2C%2013_36_20.png) |
| /ChatGPT Image 16 juin 2026, 13_36_31.png | media | [public/ChatGPT Image 16 juin 2026, 13_36_31.png](../../public/ChatGPT%20Image%2016%20juin%202026%2C%2013_36_31.png) |
| /ChatGPT Image 22 mars 2026, 23_46_27.png | media | [public/ChatGPT Image 22 mars 2026, 23_46_27.png](../../public/ChatGPT%20Image%2022%20mars%202026%2C%2023_46_27.png) |
| /ChatGPT Image 30 mai 2026, 05_49_11.png | media | [public/ChatGPT Image 30 mai 2026, 05_49_11.png](../../public/ChatGPT%20Image%2030%20mai%202026%2C%2005_49_11.png) |
| /ChatGPT Image 8 juin 2026, 02_46_54.png | media | [public/ChatGPT Image 8 juin 2026, 02_46_54.png](../../public/ChatGPT%20Image%208%20juin%202026%2C%2002_46_54.png) |
| /ChatGPT Image 8 juin 2026, 02_57_38.png | media | [public/ChatGPT Image 8 juin 2026, 02_57_38.png](../../public/ChatGPT%20Image%208%20juin%202026%2C%2002_57_38.png) |
| /Chef TOK au bord du lac Léman.png | media | [public/Chef TOK au bord du lac Léman.png](../../public/Chef%20TOK%20au%20bord%20du%20lac%20L%C3%A9man.png) |
| /Chef jovial au bord du lac Léman.png | media | [public/Chef jovial au bord du lac Léman.png](../../public/Chef%20jovial%20au%20bord%20du%20lac%20L%C3%A9man.png) |
| /Image Codex 3 sept. 2026, 02_31_12.png | media | [public/Image Codex 3 sept. 2026, 02_31_12.png](../../public/Image%20Codex%203%20sept.%202026%2C%2002_31_12.png) |
| /Image Codex 3 sept. 2026, 11_06_16.png | media | [public/Image Codex 3 sept. 2026, 11_06_16.png](../../public/Image%20Codex%203%20sept.%202026%2C%2011_06_16.png) |
| /Image Codex 3 sept. 2026, 11_12_46.png | media | [public/Image Codex 3 sept. 2026, 11_12_46.png](../../public/Image%20Codex%203%20sept.%202026%2C%2011_12_46.png) |
| /Miamz2.webp | media | [public/Miamz2.webp](../../public/Miamz2.webp) |
| /Miamz3.webp | media | [public/Miamz3.webp](../../public/Miamz3.webp) |
| /aide.png | media | [public/aide.png](../../public/aide.png) |
| /banniere1.png | media | [public/banniere1.png](../../public/banniere1.png) |
| /chef.png | media | [public/chef.png](../../public/chef.png) |
| /chef2.png | media | [public/chef2.png](../../public/chef2.png) |
| /chef3.png | media | [public/chef3.png](../../public/chef3.png) |
| /chefbg.webp | media | [public/chefbg.webp](../../public/chefbg.webp) |
| /chefbg2.webp | media | [public/chefbg2.webp](../../public/chefbg2.webp) |
| /data/geneva-commercial-prospects.json | data | [public/data/geneva-commercial-prospects.json](../../public/data/geneva-commercial-prospects.json) |
| /data/thefork-geneva-commercial-prospects.json | data | [public/data/thefork-geneva-commercial-prospects.json](../../public/data/thefork-geneva-commercial-prospects.json) |
| /dd35c5e3-5254-41eb-afdd-b3d5b3f43fcc.png | media | [public/dd35c5e3-5254-41eb-afdd-b3d5b3f43fcc.png](../../public/dd35c5e3-5254-41eb-afdd-b3d5b3f43fcc.png) |
| /desig app/1_0000_template_pub_04.png | media | [public/desig app/1_0000_template_pub_04.png](../../public/desig%20app/1_0000_template_pub_04.png) |
| /desig app/1_0001_template_pub_08.png | media | [public/desig app/1_0001_template_pub_08.png](../../public/desig%20app/1_0001_template_pub_08.png) |
| /desig app/1_0002_template_pub_01.png | media | [public/desig app/1_0002_template_pub_01.png](../../public/desig%20app/1_0002_template_pub_01.png) |
| /desig app/1_0003_template_pub_03.png | media | [public/desig app/1_0003_template_pub_03.png](../../public/desig%20app/1_0003_template_pub_03.png) |
| /desig app/1_0004_template_pub_02.png | media | [public/desig app/1_0004_template_pub_02.png](../../public/desig%20app/1_0004_template_pub_02.png) |
| /desig app/1_0005_template_pub_06.png | media | [public/desig app/1_0005_template_pub_06.png](../../public/desig%20app/1_0005_template_pub_06.png) |
| /desig app/1_0006_template_pub_05.png | media | [public/desig app/1_0006_template_pub_05.png](../../public/desig%20app/1_0006_template_pub_05.png) |
| /desig app/1_0007_Calque-1.png | media | [public/desig app/1_0007_Calque-1.png](../../public/desig%20app/1_0007_Calque-1.png) |
| /desig app/assiette.png | media | [public/desig app/assiette.png](../../public/desig%20app/assiette.png) |
| /desig app/burger.png | media | [public/desig app/burger.png](../../public/desig%20app/burger.png) |
| /desig app/cadeau.png | media | [public/desig app/cadeau.png](../../public/desig%20app/cadeau.png) |
| /desig app/calendrier.png | media | [public/desig app/calendrier.png](../../public/desig%20app/calendrier.png) |
| /desig app/chefsection.png | media | [public/desig app/chefsection.png](../../public/desig%20app/chefsection.png) |
| /desig app/chefsection2.png | media | [public/desig app/chefsection2.png](../../public/desig%20app/chefsection2.png) |
| /desig app/db166d8e-afaa-475a-83b0-8510279ca071.png | media | [public/desig app/db166d8e-afaa-475a-83b0-8510279ca071.png](../../public/desig%20app/db166d8e-afaa-475a-83b0-8510279ca071.png) |
| /desig app/flamme.png | media | [public/desig app/flamme.png](../../public/desig%20app/flamme.png) |
| /favicon-180x180.png | media | [public/favicon-180x180.png](../../public/favicon-180x180.png) |
| /favicon-192x192.png | media | [public/favicon-192x192.png](../../public/favicon-192x192.png) |
| /favicon-48x48.png | media | [public/favicon-48x48.png](../../public/favicon-48x48.png) |
| /favicon-512x512.png | media | [public/favicon-512x512.png](../../public/favicon-512x512.png) |
| /favicon.ico | media | [public/favicon.ico](../../public/favicon.ico) |
| /firebase-messaging-sw.js | other | [public/firebase-messaging-sw.js](../../public/firebase-messaging-sw.js) |
| /fond fun.png | media | [public/fond fun.png](../../public/fond%20fun.png) |
| /fond.jpg | media | [public/fond.jpg](../../public/fond.jpg) |
| /fond.png | media | [public/fond.png](../../public/fond.png) |
| /fond3.png | media | [public/fond3.png](../../public/fond3.png) |
| /fond32.png | media | [public/fond32.png](../../public/fond32.png) |
| /fond35.png | media | [public/fond35.png](../../public/fond35.png) |
| /fond4.png | media | [public/fond4.png](../../public/fond4.png) |
| /fond5.png | media | [public/fond5.png](../../public/fond5.png) |
| /fond9.png | media | [public/fond9.png](../../public/fond9.png) |
| /fondacceuil.png | media | [public/fondacceuil.png](../../public/fondacceuil.png) |
| /fondacceuildesk.png | media | [public/fondacceuildesk.png](../../public/fondacceuildesk.png) |
| /fondbanniere.png | media | [public/fondbanniere.png](../../public/fondbanniere.png) |
| /fondbanniere2.png | media | [public/fondbanniere2.png](../../public/fondbanniere2.png) |
| /fonts/anton/Anton-Regular.ttf | media | [public/fonts/anton/Anton-Regular.ttf](../../public/fonts/anton/Anton-Regular.ttf) |
| /fonts/anton/OFL.txt | data | [public/fonts/anton/OFL.txt](../../public/fonts/anton/OFL.txt) |
| /help.png | media | [public/help.png](../../public/help.png) |
| /higgsfield/.gitignore | other | [public/higgsfield/.gitignore](../../public/higgsfield/.gitignore) |
| /higgsfield/83192f58-5841-437e-a320-e115880ffe21.png | media | [public/higgsfield/83192f58-5841-437e-a320-e115880ffe21.png](../../public/higgsfield/83192f58-5841-437e-a320-e115880ffe21.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 18_33_49.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 18_33_49.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2018_33_49.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 18_34_13.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 18_34_13.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2018_34_13.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 18_34_31.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 18_34_31.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2018_34_31.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 18_35_46.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 18_35_46.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2018_35_46.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 18_36_01.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 18_36_01.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2018_36_01.png) |
| /higgsfield/ChatGPT Image 16 mai 2026, 19_25_39.png | media | [public/higgsfield/ChatGPT Image 16 mai 2026, 19_25_39.png](../../public/higgsfield/ChatGPT%20Image%2016%20mai%202026%2C%2019_25_39.png) |
| /higgsfield/Sans titre-2egeg.png | media | [public/higgsfield/Sans titre-2egeg.png](../../public/higgsfield/Sans%20titre-2egeg.png) |
| /higgsfield/f2753607-f87b-470d-89bd-0250ce1fb6c5.png | media | [public/higgsfield/f2753607-f87b-470d-89bd-0250ce1fb6c5.png](../../public/higgsfield/f2753607-f87b-470d-89bd-0250ce1fb6c5.png) |
| /higgsfield/hf_20260518_042910_98da3ceb-a1f6-403f-b859-02b809cb2624.mp4 | media | [public/higgsfield/hf_20260518_042910_98da3ceb-a1f6-403f-b859-02b809cb2624.mp4](../../public/higgsfield/hf_20260518_042910_98da3ceb-a1f6-403f-b859-02b809cb2624.mp4) |
| /higgsfield/tok-intro-desktop-poster.webp | media | [public/higgsfield/tok-intro-desktop-poster.webp](../../public/higgsfield/tok-intro-desktop-poster.webp) |
| /higgsfield/tok-intro-desktop.mp4 | media | [public/higgsfield/tok-intro-desktop.mp4](../../public/higgsfield/tok-intro-desktop.mp4) |
| /higgsfield/tok-intro-mobile-poster.webp | media | [public/higgsfield/tok-intro-mobile-poster.webp](../../public/higgsfield/tok-intro-mobile-poster.webp) |
| /higgsfield/tok-intro-mobile.mp4 | media | [public/higgsfield/tok-intro-mobile.mp4](../../public/higgsfield/tok-intro-mobile.mp4) |
| /higgsfield/wfewf.jpg | media | [public/higgsfield/wfewf.jpg](../../public/higgsfield/wfewf.jpg) |
| /images/1.webp | media | [public/images/1.webp](../../public/images/1.webp) |
| /images/WhatsApp Image 2026-03-12 at 19.54.57.jpeg | media | [public/images/WhatsApp Image 2026-03-12 at 19.54.57.jpeg](../../public/images/WhatsApp%20Image%202026-03-12%20at%2019.54.57.jpeg) |
| /images/acai bowl.jpg | media | [public/images/acai bowl.jpg](../../public/images/acai%20bowl.jpg) |
| /images/assiette mixte libanaise.jpeg | media | [public/images/assiette mixte libanaise.jpeg](../../public/images/assiette%20mixte%20libanaise.jpeg) |
| /images/baklava.jpg | media | [public/images/baklava.jpg](../../public/images/baklava.jpg) |
| /images/bd805b36-a248-4869-8337-95f0af9cbdb2.webp | media | [public/images/bd805b36-a248-4869-8337-95f0af9cbdb2.webp](../../public/images/bd805b36-a248-4869-8337-95f0af9cbdb2.webp) |
| /images/bruschetta.jpg | media | [public/images/bruschetta.jpg](../../public/images/bruschetta.jpg) |
| /images/burger truffe.webp | media | [public/images/burger truffe.webp](../../public/images/burger%20truffe.webp) |
| /images/burgers-wings.jpeg | media | [public/images/burgers-wings.jpeg](../../public/images/burgers-wings.jpeg) |
| /images/burrito boeuf.jpg | media | [public/images/burrito boeuf.jpg](../../public/images/burrito%20boeuf.jpg) |
| /images/burrito poulet.jpg | media | [public/images/burrito poulet.jpg](../../public/images/burrito%20poulet.jpg) |
| /images/byriani.jpg | media | [public/images/byriani.jpg](../../public/images/byriani.jpg) |
| /images/c5fe8c6d-fbae-4456-8191-c4b2f95bdea5.webp | media | [public/images/c5fe8c6d-fbae-4456-8191-c4b2f95bdea5.webp](../../public/images/c5fe8c6d-fbae-4456-8191-c4b2f95bdea5.webp) |
| /images/california roll.jpg | media | [public/images/california roll.jpg](../../public/images/california%20roll.jpg) |
| /images/calzone.webp | media | [public/images/calzone.webp](../../public/images/calzone.webp) |
| /images/chicken-bucket-fries.jpeg | media | [public/images/chicken-bucket-fries.jpeg](../../public/images/chicken-bucket-fries.jpeg) |
| /images/churros.jpg | media | [public/images/churros.jpg](../../public/images/churros.jpg) |
| /images/crispy-chicken.jpeg | media | [public/images/crispy-chicken.jpeg](../../public/images/crispy-chicken.jpeg) |
| /images/dashboard-3d/admin-ai-operations.webp | media | [public/images/dashboard-3d/admin-ai-operations.webp](../../public/images/dashboard-3d/admin-ai-operations.webp) |
| /images/dashboard-3d/admin-audit.webp | media | [public/images/dashboard-3d/admin-audit.webp](../../public/images/dashboard-3d/admin-audit.webp) |
| /images/dashboard-3d/admin-catalog.webp | media | [public/images/dashboard-3d/admin-catalog.webp](../../public/images/dashboard-3d/admin-catalog.webp) |
| /images/dashboard-3d/admin-incidents.webp | media | [public/images/dashboard-3d/admin-incidents.webp](../../public/images/dashboard-3d/admin-incidents.webp) |
| /images/dashboard-3d/admin-loyalty.webp | media | [public/images/dashboard-3d/admin-loyalty.webp](../../public/images/dashboard-3d/admin-loyalty.webp) |
| /images/dashboard-3d/admin-operations.webp | media | [public/images/dashboard-3d/admin-operations.webp](../../public/images/dashboard-3d/admin-operations.webp) |
| /images/dashboard-3d/admin-restaurants.webp | media | [public/images/dashboard-3d/admin-restaurants.webp](../../public/images/dashboard-3d/admin-restaurants.webp) |
| /images/dashboard-3d/admin-users.webp | media | [public/images/dashboard-3d/admin-users.webp](../../public/images/dashboard-3d/admin-users.webp) |
| /images/dashboard-3d/analytics.webp | media | [public/images/dashboard-3d/analytics.webp](../../public/images/dashboard-3d/analytics.webp) |
| /images/dashboard-3d/client-orders-empty.webp | media | [public/images/dashboard-3d/client-orders-empty.webp](../../public/images/dashboard-3d/client-orders-empty.webp) |
| /images/dashboard-3d/commercial-accounting-empty.webp | media | [public/images/dashboard-3d/commercial-accounting-empty.webp](../../public/images/dashboard-3d/commercial-accounting-empty.webp) |
| /images/dashboard-3d/courier-jobs-empty.webp | media | [public/images/dashboard-3d/courier-jobs-empty.webp](../../public/images/dashboard-3d/courier-jobs-empty.webp) |
| /images/dashboard-3d/creations.webp | media | [public/images/dashboard-3d/creations.webp](../../public/images/dashboard-3d/creations.webp) |
| /images/dashboard-3d/gallery.webp | media | [public/images/dashboard-3d/gallery.webp](../../public/images/dashboard-3d/gallery.webp) |
| /images/dashboard-3d/marketing.webp | media | [public/images/dashboard-3d/marketing.webp](../../public/images/dashboard-3d/marketing.webp) |
| /images/dashboard-3d/photo-add.webp | media | [public/images/dashboard-3d/photo-add.webp](../../public/images/dashboard-3d/photo-add.webp) |
| /images/dashboard-3d/photopro.webp | media | [public/images/dashboard-3d/photopro.webp](../../public/images/dashboard-3d/photopro.webp) |
| /images/dashboard-3d/restaurant-advisor.webp | media | [public/images/dashboard-3d/restaurant-advisor.webp](../../public/images/dashboard-3d/restaurant-advisor.webp) |
| /images/dashboard-3d/restaurant-billing.webp | media | [public/images/dashboard-3d/restaurant-billing.webp](../../public/images/dashboard-3d/restaurant-billing.webp) |
| /images/dashboard-3d/restaurant-campaigns.webp | media | [public/images/dashboard-3d/restaurant-campaigns.webp](../../public/images/dashboard-3d/restaurant-campaigns.webp) |
| /images/dashboard-3d/restaurant-comparison.webp | media | [public/images/dashboard-3d/restaurant-comparison.webp](../../public/images/dashboard-3d/restaurant-comparison.webp) |
| /images/dashboard-3d/restaurant-crm.webp | media | [public/images/dashboard-3d/restaurant-crm.webp](../../public/images/dashboard-3d/restaurant-crm.webp) |
| /images/dashboard-3d/restaurant-floor-plan.webp | media | [public/images/dashboard-3d/restaurant-floor-plan.webp](../../public/images/dashboard-3d/restaurant-floor-plan.webp) |
| /images/dashboard-3d/restaurant-formulas.webp | media | [public/images/dashboard-3d/restaurant-formulas.webp](../../public/images/dashboard-3d/restaurant-formulas.webp) |
| /images/dashboard-3d/restaurant-invoice-settings.webp | media | [public/images/dashboard-3d/restaurant-invoice-settings.webp](../../public/images/dashboard-3d/restaurant-invoice-settings.webp) |
| /images/dashboard-3d/restaurant-news.webp | media | [public/images/dashboard-3d/restaurant-news.webp](../../public/images/dashboard-3d/restaurant-news.webp) |
| /images/dashboard-3d/restaurant-orders.webp | media | [public/images/dashboard-3d/restaurant-orders.webp](../../public/images/dashboard-3d/restaurant-orders.webp) |
| /images/dashboard-3d/restaurant-pack.webp | media | [public/images/dashboard-3d/restaurant-pack.webp](../../public/images/dashboard-3d/restaurant-pack.webp) |
| /images/dashboard-3d/restaurant-performance.webp | media | [public/images/dashboard-3d/restaurant-performance.webp](../../public/images/dashboard-3d/restaurant-performance.webp) |
| /images/dashboard-3d/restaurant-profile.webp | media | [public/images/dashboard-3d/restaurant-profile.webp](../../public/images/dashboard-3d/restaurant-profile.webp) |
| /images/dashboard-3d/restaurant-promotions.webp | media | [public/images/dashboard-3d/restaurant-promotions.webp](../../public/images/dashboard-3d/restaurant-promotions.webp) |
| /images/dashboard-3d/restaurant-reviews.webp | media | [public/images/dashboard-3d/restaurant-reviews.webp](../../public/images/dashboard-3d/restaurant-reviews.webp) |
| /images/dashboard-3d/restaurant-service.webp | media | [public/images/dashboard-3d/restaurant-service.webp](../../public/images/dashboard-3d/restaurant-service.webp) |
| /images/dashboard-3d/restaurant-social.webp | media | [public/images/dashboard-3d/restaurant-social.webp](../../public/images/dashboard-3d/restaurant-social.webp) |
| /images/dashboard-3d/restaurant-support.webp | media | [public/images/dashboard-3d/restaurant-support.webp](../../public/images/dashboard-3d/restaurant-support.webp) |
| /images/dashboard-3d/restaurant-tok-connect.webp | media | [public/images/dashboard-3d/restaurant-tok-connect.webp](../../public/images/dashboard-3d/restaurant-tok-connect.webp) |
| /images/doner-kebab-plate.jpeg | media | [public/images/doner-kebab-plate.jpeg](../../public/images/doner-kebab-plate.jpeg) |
| /images/edamame.webp | media | [public/images/edamame.webp](../../public/images/edamame.webp) |
| /images/falafel wrap.jpeg | media | [public/images/falafel wrap.jpeg](../../public/images/falafel%20wrap.jpeg) |
| /images/fattouche.webp | media | [public/images/fattouche.webp](../../public/images/fattouche.webp) |
| /images/filets de perche.jpg | media | [public/images/filets de perche.jpg](../../public/images/filets%20de%20perche.jpg) |
| /images/fond.png | media | [public/images/fond.png](../../public/images/fond.png) |
| /images/fondue-moitie-moitie.jpg | media | [public/images/fondue-moitie-moitie.jpg](../../public/images/fondue-moitie-moitie.jpg) |
| /images/gfc-fried-chicken.jpeg | media | [public/images/gfc-fried-chicken.jpeg](../../public/images/gfc-fried-chicken.jpeg) |
| /images/gourmet-burgers.jpeg | media | [public/images/gourmet-burgers.jpeg](../../public/images/gourmet-burgers.jpeg) |
| /images/greek-gyros.jpeg | media | [public/images/greek-gyros.jpeg](../../public/images/greek-gyros.jpeg) |
| /images/guacamole.jpg | media | [public/images/guacamole.jpg](../../public/images/guacamole.jpg) |
| /images/gulam jamun.jpg | media | [public/images/gulam jamun.jpg](../../public/images/gulam%20jamun.jpg) |
| /images/gyoza porc.webp | media | [public/images/gyoza porc.webp](../../public/images/gyoza%20porc.webp) |
| /images/home/tok-geneve-desktop-reference.jpg | media | [public/images/home/tok-geneve-desktop-reference.jpg](../../public/images/home/tok-geneve-desktop-reference.jpg) |
| /images/home/tok-geneve-desktop.webp | media | [public/images/home/tok-geneve-desktop.webp](../../public/images/home/tok-geneve-desktop.webp) |
| /images/home/tok-geneve-mobile-original.webp | media | [public/images/home/tok-geneve-mobile-original.webp](../../public/images/home/tok-geneve-mobile-original.webp) |
| /images/home/tok-geneve-mobile.webp | media | [public/images/home/tok-geneve-mobile.webp](../../public/images/home/tok-geneve-mobile.webp) |
| /images/home/tok-leman-signature.webp | media | [public/images/home/tok-leman-signature.webp](../../public/images/home/tok-leman-signature.webp) |
| /images/houmous.webp | media | [public/images/houmous.webp](../../public/images/houmous.webp) |
| /images/indian-curry-bowls.jpeg | media | [public/images/indian-curry-bowls.jpeg](../../public/images/indian-curry-bowls.jpeg) |
| /images/indian-feast.jpeg | media | [public/images/indian-feast.jpeg](../../public/images/indian-feast.jpeg) |
| /images/kebab-box-spread.jpeg | media | [public/images/kebab-box-spread.jpeg](../../public/images/kebab-box-spread.jpeg) |
| /images/kombucha.jpeg | media | [public/images/kombucha.jpeg](../../public/images/kombucha.jpeg) |
| /images/lebanese-mezze.jpeg | media | [public/images/lebanese-mezze.jpeg](../../public/images/lebanese-mezze.jpeg) |
| /images/limonade menthe.jpeg | media | [public/images/limonade menthe.jpeg](../../public/images/limonade%20menthe.jpeg) |
| /images/lobster-roll-fries.jpeg | media | [public/images/lobster-roll-fries.jpeg](../../public/images/lobster-roll-fries.jpeg) |
| /images/longeole.avif | media | [public/images/longeole.avif](../../public/images/longeole.avif) |
| /images/mango lassi.jpeg | media | [public/images/mango lassi.jpeg](../../public/images/mango%20lassi.jpeg) |
| /images/meringue-double.webp | media | [public/images/meringue-double.webp](../../public/images/meringue-double.webp) |
| /images/milkshake-oreo.jpg | media | [public/images/milkshake-oreo.jpg](../../public/images/milkshake-oreo.jpg) |
| /images/milkshake-vanille.jpeg | media | [public/images/milkshake-vanille.jpeg](../../public/images/milkshake-vanille.jpeg) |
| /images/miniatures/01_africain.png | media | [public/images/miniatures/01_africain.png](../../public/images/miniatures/01_africain.png) |
| /images/miniatures/02_americain.png | media | [public/images/miniatures/02_americain.png](../../public/images/miniatures/02_americain.png) |
| /images/miniatures/03_bistro.png | media | [public/images/miniatures/03_bistro.png](../../public/images/miniatures/03_bistro.png) |
| /images/miniatures/04_boulangerie.png | media | [public/images/miniatures/04_boulangerie.png](../../public/images/miniatures/04_boulangerie.png) |
| /images/miniatures/05_brunch.png | media | [public/images/miniatures/05_brunch.png](../../public/images/miniatures/05_brunch.png) |
| /images/miniatures/06_burger.png | media | [public/images/miniatures/06_burger.png](../../public/images/miniatures/06_burger.png) |
| /images/miniatures/07_cafe.png | media | [public/images/miniatures/07_cafe.png](../../public/images/miniatures/07_cafe.png) |
| /images/miniatures/08_chinois.png | media | [public/images/miniatures/08_chinois.png](../../public/images/miniatures/08_chinois.png) |
| /images/miniatures/09_creole.png | media | [public/images/miniatures/09_creole.png](../../public/images/miniatures/09_creole.png) |
| /images/miniatures/1.png | media | [public/images/miniatures/1.png](../../public/images/miniatures/1.png) |
| /images/miniatures/10_desserts.png | media | [public/images/miniatures/10_desserts.png](../../public/images/miniatures/10_desserts.png) |
| /images/miniatures/11_francais.png | media | [public/images/miniatures/11_francais.png](../../public/images/miniatures/11_francais.png) |
| /images/miniatures/12_gastronomique.png | media | [public/images/miniatures/12_gastronomique.png](../../public/images/miniatures/12_gastronomique.png) |
| /images/miniatures/13_grillades.png | media | [public/images/miniatures/13_grillades.png](../../public/images/miniatures/13_grillades.png) |
| /images/miniatures/14_halal.png | media | [public/images/miniatures/14_halal.png](../../public/images/miniatures/14_halal.png) |
| /images/miniatures/15_healthy.png | media | [public/images/miniatures/15_healthy.png](../../public/images/miniatures/15_healthy.png) |
| /images/miniatures/16_indien.png | media | [public/images/miniatures/16_indien.png](../../public/images/miniatures/16_indien.png) |
| /images/miniatures/17_italien.png | media | [public/images/miniatures/17_italien.png](../../public/images/miniatures/17_italien.png) |
| /images/miniatures/18_japonais.png | media | [public/images/miniatures/18_japonais.png](../../public/images/miniatures/18_japonais.png) |
| /images/miniatures/19_kebab.png | media | [public/images/miniatures/19_kebab.png](../../public/images/miniatures/19_kebab.png) |
| /images/miniatures/2.png | media | [public/images/miniatures/2.png](../../public/images/miniatures/2.png) |
| /images/miniatures/20_libanais.png | media | [public/images/miniatures/20_libanais.png](../../public/images/miniatures/20_libanais.png) |
| /images/miniatures/21_marocain.png | media | [public/images/miniatures/21_marocain.png](../../public/images/miniatures/21_marocain.png) |
| /images/miniatures/22_mediterranee.png | media | [public/images/miniatures/22_mediterranee.png](../../public/images/miniatures/22_mediterranee.png) |
| /images/miniatures/23_mexicain.png | media | [public/images/miniatures/23_mexicain.png](../../public/images/miniatures/23_mexicain.png) |
| /images/miniatures/24_pakistanais.png | media | [public/images/miniatures/24_pakistanais.png](../../public/images/miniatures/24_pakistanais.png) |
| /images/miniatures/25_pizza.png | media | [public/images/miniatures/25_pizza.png](../../public/images/miniatures/25_pizza.png) |
| /images/miniatures/26_sushi.png | media | [public/images/miniatures/26_sushi.png](../../public/images/miniatures/26_sushi.png) |
| /images/miniatures/27_ramen.png | media | [public/images/miniatures/27_ramen.png](../../public/images/miniatures/27_ramen.png) |
| /images/miniatures/28_thai.png | media | [public/images/miniatures/28_thai.png](../../public/images/miniatures/28_thai.png) |
| /images/miniatures/29_turc.png | media | [public/images/miniatures/29_turc.png](../../public/images/miniatures/29_turc.png) |
| /images/miniatures/3.png | media | [public/images/miniatures/3.png](../../public/images/miniatures/3.png) |
| /images/miniatures/30_salades.png | media | [public/images/miniatures/30_salades.png](../../public/images/miniatures/30_salades.png) |
| /images/miniatures/31_poke.png | media | [public/images/miniatures/31_poke.png](../../public/images/miniatures/31_poke.png) |
| /images/miniatures/32_petit-dejeuner.png | media | [public/images/miniatures/32_petit-dejeuner.png](../../public/images/miniatures/32_petit-dejeuner.png) |
| /images/miniatures/33_pates.png | media | [public/images/miniatures/33_pates.png](../../public/images/miniatures/33_pates.png) |
| /images/miniatures/34_fondue-suisse.png | media | [public/images/miniatures/34_fondue-suisse.png](../../public/images/miniatures/34_fondue-suisse.png) |
| /images/miniatures/35_patisserie.png | media | [public/images/miniatures/35_patisserie.png](../../public/images/miniatures/35_patisserie.png) |
| /images/miniatures/36_sandwich.png | media | [public/images/miniatures/36_sandwich.png](../../public/images/miniatures/36_sandwich.png) |
| /images/miniatures/37_street-food.png | media | [public/images/miniatures/37_street-food.png](../../public/images/miniatures/37_street-food.png) |
| /images/miniatures/38_vegetarien.png | media | [public/images/miniatures/38_vegetarien.png](../../public/images/miniatures/38_vegetarien.png) |
| /images/miniatures/39_vegan.png | media | [public/images/miniatures/39_vegan.png](../../public/images/miniatures/39_vegan.png) |
| /images/miniatures/bulle.png | media | [public/images/miniatures/bulle.png](../../public/images/miniatures/bulle.png) |
| /images/miniatures/manifest.json | data | [public/images/miniatures/manifest.json](../../public/images/miniatures/manifest.json) |
| /images/mixed-grill-platter.jpeg | media | [public/images/mixed-grill-platter.jpeg](../../public/images/mixed-grill-platter.jpeg) |
| /images/mochi-glaces.jpg | media | [public/images/mochi-glaces.jpg](../../public/images/mochi-glaces.jpg) |
| /images/naan.jpeg | media | [public/images/naan.jpeg](../../public/images/naan.jpeg) |
| /images/nachos.webp | media | [public/images/nachos.webp](../../public/images/nachos.webp) |
| /images/octopus-fine-dining.jpeg | media | [public/images/octopus-fine-dining.jpeg](../../public/images/octopus-fine-dining.jpeg) |
| /images/onion rings.jpg | media | [public/images/onion rings.jpg](../../public/images/onion%20rings.jpg) |
| /images/palak paneer.jpg | media | [public/images/palak paneer.jpg](../../public/images/palak%20paneer.jpg) |
| /images/pannacotta.webp | media | [public/images/pannacotta.webp](../../public/images/pannacotta.webp) |
| /images/pasta-assortment.jpeg | media | [public/images/pasta-assortment.jpeg](../../public/images/pasta-assortment.jpeg) |
| /images/pattern.svg | media | [public/images/pattern.svg](../../public/images/pattern.svg) |
| /images/pizza diavola.avif | media | [public/images/pizza diavola.avif](../../public/images/pizza%20diavola.avif) |
| /images/pizza quatre fromage.jpg | media | [public/images/pizza quatre fromage.jpg](../../public/images/pizza%20quatre%20fromage.jpg) |
| /images/poke-bowls.jpeg | media | [public/images/poke-bowls.jpeg](../../public/images/poke-bowls.jpeg) |
| /images/prosciutto e rucola.avif | media | [public/images/prosciutto e rucola.avif](../../public/images/prosciutto%20e%20rucola.avif) |
| /images/quesadillas.jpeg | media | [public/images/quesadillas.jpeg](../../public/images/quesadillas.jpeg) |
| /images/raclette.jpg | media | [public/images/raclette.jpg](../../public/images/raclette.jpg) |
| /images/raita.webp | media | [public/images/raita.webp](../../public/images/raita.webp) |
| /images/ramen miso.jpg | media | [public/images/ramen miso.jpg](../../public/images/ramen%20miso.jpg) |
| /images/rosti-bernois.jpg | media | [public/images/rosti-bernois.jpg](../../public/images/rosti-bernois.jpg) |
| /images/rotisserie-chicken.jpeg | media | [public/images/rotisserie-chicken.jpeg](../../public/images/rotisserie-chicken.jpeg) |
| /images/salade-du-marche.jpg | media | [public/images/salade-du-marche.jpg](../../public/images/salade-du-marche.jpg) |
| /images/salmon roll.webp | media | [public/images/salmon roll.webp](../../public/images/salmon%20roll.webp) |
| /images/samosa.jpg | media | [public/images/samosa.jpg](../../public/images/samosa.jpg) |
| /images/screenshot-1782328742823.png | media | [public/images/screenshot-1782328742823.png](../../public/images/screenshot-1782328742823.png) |
| /images/section-headers/864DB634-B132-4A7E-8443-CCB38318F96D.jpeg | media | [public/images/section-headers/864DB634-B132-4A7E-8443-CCB38318F96D.jpeg](../../public/images/section-headers/864DB634-B132-4A7E-8443-CCB38318F96D.jpeg) |
| /images/section-headers/A5F314DA-0208-45A3-8C73-EAB3F910059F.jpeg | media | [public/images/section-headers/A5F314DA-0208-45A3-8C73-EAB3F910059F.jpeg](../../public/images/section-headers/A5F314DA-0208-45A3-8C73-EAB3F910059F.jpeg) |
| /images/section-headers/calendar-3d.png | media | [public/images/section-headers/calendar-3d.png](../../public/images/section-headers/calendar-3d.png) |
| /images/section-headers/fire-3d.png | media | [public/images/section-headers/fire-3d.png](../../public/images/section-headers/fire-3d.png) |
| /images/section-headers/gift-3d.png | media | [public/images/section-headers/gift-3d.png](../../public/images/section-headers/gift-3d.png) |
| /images/section-headers/heart-3d.png | media | [public/images/section-headers/heart-3d.png](../../public/images/section-headers/heart-3d.png) |
| /images/section-headers/pin-3d.png | media | [public/images/section-headers/pin-3d.png](../../public/images/section-headers/pin-3d.png) |
| /images/section-headers/plate-3d.png | media | [public/images/section-headers/plate-3d.png](../../public/images/section-headers/plate-3d.png) |
| /images/section-headers/scooter-3d.png | media | [public/images/section-headers/scooter-3d.png](../../public/images/section-headers/scooter-3d.png) |
| /images/section-headers/shopping-bags-3d.png | media | [public/images/section-headers/shopping-bags-3d.png](../../public/images/section-headers/shopping-bags-3d.png) |
| /images/shawarma poulet.jpeg | media | [public/images/shawarma poulet.jpeg](../../public/images/shawarma%20poulet.jpeg) |
| /images/smash-burger-single.jpeg | media | [public/images/smash-burger-single.jpeg](../../public/images/smash-burger-single.jpeg) |
| /images/smash-burgers.jpeg | media | [public/images/smash-burgers.jpeg](../../public/images/smash-burgers.jpeg) |
| /images/smoothie vert.jpg | media | [public/images/smoothie vert.jpg](../../public/images/smoothie%20vert.jpg) |
| /images/stack-shake-spread.jpeg | media | [public/images/stack-shake-spread.jpeg](../../public/images/stack-shake-spread.jpeg) |
| /images/taboule.webp | media | [public/images/taboule.webp](../../public/images/taboule.webp) |
| /images/tacos carnitas.webp | media | [public/images/tacos carnitas.webp](../../public/images/tacos%20carnitas.webp) |
| /images/tarte aux noix.webp | media | [public/images/tarte aux noix.webp](../../public/images/tarte%20aux%20noix.webp) |
| /images/tempura crevettes.jpg | media | [public/images/tempura crevettes.jpg](../../public/images/tempura%20crevettes.jpg) |
| /images/thai-curry-spread.jpeg | media | [public/images/thai-curry-spread.jpeg](../../public/images/thai-curry-spread.jpeg) |
| /images/thai-pad-thai.jpeg | media | [public/images/thai-pad-thai.jpeg](../../public/images/thai-pad-thai.jpeg) |
| /images/thai-spread.jpeg | media | [public/images/thai-spread.jpeg](../../public/images/thai-spread.jpeg) |
| /images/tok-connect/chatgpt-mcp-dcr-error.png | media | [public/images/tok-connect/chatgpt-mcp-dcr-error.png](../../public/images/tok-connect/chatgpt-mcp-dcr-error.png) |
| /images/tok-connect/chatgpt-mcp-new-app.png | media | [public/images/tok-connect/chatgpt-mcp-new-app.png](../../public/images/tok-connect/chatgpt-mcp-new-app.png) |
| /images/tok-connect/chatgpt-mcp-oauth-endpoints.png | media | [public/images/tok-connect/chatgpt-mcp-oauth-endpoints.png](../../public/images/tok-connect/chatgpt-mcp-oauth-endpoints.png) |
| /images/tok-connect/chatgpt-mcp-oidc.png | media | [public/images/tok-connect/chatgpt-mcp-oidc.png](../../public/images/tok-connect/chatgpt-mcp-oidc.png) |
| /images/tok-connect/tok-connect-widget-details.svg | media | [public/images/tok-connect/tok-connect-widget-details.svg](../../public/images/tok-connect/tok-connect-widget-details.svg) |
| /images/tok-connect/tok-connect-widget-restaurants.svg | media | [public/images/tok-connect/tok-connect-widget-restaurants.svg](../../public/images/tok-connect/tok-connect-widget-restaurants.svg) |
| /images/tok-restaurant-placeholder.svg | media | [public/images/tok-restaurant-placeholder.svg](../../public/images/tok-restaurant-placeholder.svg) |
| /images/tokone.webp | media | [public/images/tokone.webp](../../public/images/tokone.webp) |
| /images/truffe nera pizza | other | [public/images/truffe nera pizza](../../public/images/truffe%20nera%20pizza) |
| /images/truffe nera.webp | media | [public/images/truffe nera.webp](../../public/images/truffe%20nera.webp) |
| /images/veggie burger.jpg | media | [public/images/veggie burger.jpg](../../public/images/veggie%20burger.jpg) |
| /images/¨kébbé.jpeg | media | [public/images/¨kébbé.jpeg](../../public/images/%C2%A8k%C3%A9bb%C3%A9.jpeg) |
| /launch/LICENSE-anton.txt | data | [public/launch/LICENSE-anton.txt](../../public/launch/LICENSE-anton.txt) |
| /launch/LICENSE-barlow.txt | data | [public/launch/LICENSE-barlow.txt](../../public/launch/LICENSE-barlow.txt) |
| /launch/anton.woff2 | media | [public/launch/anton.woff2](../../public/launch/anton.woff2) |
| /launch/background.png | media | [public/launch/background.png](../../public/launch/background.png) |
| /launch/barlow.woff2 | media | [public/launch/barlow.woff2](../../public/launch/barlow.woff2) |
| /launch/chef.png | media | [public/launch/chef.png](../../public/launch/chef.png) |
| /launch/props.png | media | [public/launch/props.png](../../public/launch/props.png) |
| /logotok.png | media | [public/logotok.png](../../public/logotok.png) |
| /mangez.png | media | [public/mangez.png](../../public/mangez.png) |
| /manifest.json | platform | [public/manifest.json](../../public/manifest.json) |
| /miamz.png | media | [public/miamz.png](../../public/miamz.png) |
| /mockup.png | media | [public/mockup.png](../../public/mockup.png) |
| /placeholder.svg | media | [public/placeholder.svg](../../public/placeholder.svg) |
| /plan salle/generated-host-stand.png | media | [public/plan salle/generated-host-stand.png](../../public/plan%20salle/generated-host-stand.png) |
| /plan salle/generated-service-station.png | media | [public/plan salle/generated-service-station.png](../../public/plan%20salle/generated-service-station.png) |
| /plan salle/generated-stool.png | media | [public/plan salle/generated-stool.png](../../public/plan%20salle/generated-stool.png) |
| /plan salle/plan-de-salle_0000_Calque-1.png | media | [public/plan salle/plan-de-salle_0000_Calque-1.png](../../public/plan%20salle/plan-de-salle_0000_Calque-1.png) |
| /plan salle/plan-de-salle_0002_Calque-15.png | media | [public/plan salle/plan-de-salle_0002_Calque-15.png](../../public/plan%20salle/plan-de-salle_0002_Calque-15.png) |
| /plan salle/plan-de-salle_0003_Calque-3.png | media | [public/plan salle/plan-de-salle_0003_Calque-3.png](../../public/plan%20salle/plan-de-salle_0003_Calque-3.png) |
| /plan salle/plan-de-salle_0004_Calque-4.png | media | [public/plan salle/plan-de-salle_0004_Calque-4.png](../../public/plan%20salle/plan-de-salle_0004_Calque-4.png) |
| /plan salle/plan-de-salle_0005_Calque-5.png | media | [public/plan salle/plan-de-salle_0005_Calque-5.png](../../public/plan%20salle/plan-de-salle_0005_Calque-5.png) |
| /plan salle/plan-de-salle_0006_Calque-6.png | media | [public/plan salle/plan-de-salle_0006_Calque-6.png](../../public/plan%20salle/plan-de-salle_0006_Calque-6.png) |
| /plan salle/plan-de-salle_0008_Calque-8.png | media | [public/plan salle/plan-de-salle_0008_Calque-8.png](../../public/plan%20salle/plan-de-salle_0008_Calque-8.png) |
| /plan salle/plan-de-salle_0009_Calque-10.png | media | [public/plan salle/plan-de-salle_0009_Calque-10.png](../../public/plan%20salle/plan-de-salle_0009_Calque-10.png) |
| /plan salle/plan-de-salle_0010_Calque-11.png | media | [public/plan salle/plan-de-salle_0010_Calque-11.png](../../public/plan%20salle/plan-de-salle_0010_Calque-11.png) |
| /plan salle/plan-de-salle_0012_Supprimer-les-modifications-de-l’outil.png | media | [public/plan salle/plan-de-salle_0012_Supprimer-les-modifications-de-l’outil.png](../../public/plan%20salle/plan-de-salle_0012_Supprimer-les-modifications-de-l%E2%80%99outil.png) |
| /plan salle/plan-de-salle_0013_Calque-14.png | media | [public/plan salle/plan-de-salle_0013_Calque-14.png](../../public/plan%20salle/plan-de-salle_0013_Calque-14.png) |
| /plan salle/plan-de-salle_0014_Calque-12.png | media | [public/plan salle/plan-de-salle_0014_Calque-12.png](../../public/plan%20salle/plan-de-salle_0014_Calque-12.png) |
| /plan salle/plan-de-salle_0015_Calque-13.png | media | [public/plan salle/plan-de-salle_0015_Calque-13.png](../../public/plan%20salle/plan-de-salle_0015_Calque-13.png) |
| /playball-font/Playball-q6o1.ttf | media | [public/playball-font/Playball-q6o1.ttf](../../public/playball-font/Playball-q6o1.ttf) |
| /playball-font/info.txt | data | [public/playball-font/info.txt](../../public/playball-font/info.txt) |
| /playball-font/misc/OFL.txt | data | [public/playball-font/misc/OFL.txt](../../public/playball-font/misc/OFL.txt) |
| /pub.jpg | media | [public/pub.jpg](../../public/pub.jpg) |
| /robots.txt | platform | [public/robots.txt](../../public/robots.txt) |
| /seo-trust-runtime.js | other | [public/seo-trust-runtime.js](../../public/seo-trust-runtime.js) |
| /sitemap-actualites.xml | platform | [public/sitemap-actualites.xml](../../public/sitemap-actualites.xml) |
| /sitemap-pages.xml | platform | [public/sitemap-pages.xml](../../public/sitemap-pages.xml) |
| /sitemap-restaurants.xml | platform | [public/sitemap-restaurants.xml](../../public/sitemap-restaurants.xml) |
| /sitemap.xml | platform | [public/sitemap.xml](../../public/sitemap.xml) |
| /tok-reference-food-webp/tok-reference-food-01.webp | media | [public/tok-reference-food-webp/tok-reference-food-01.webp](../../public/tok-reference-food-webp/tok-reference-food-01.webp) |
| /tok-reference-food-webp/tok-reference-food-02.webp | media | [public/tok-reference-food-webp/tok-reference-food-02.webp](../../public/tok-reference-food-webp/tok-reference-food-02.webp) |
| /tok-reference-food-webp/tok-reference-food-03.webp | media | [public/tok-reference-food-webp/tok-reference-food-03.webp](../../public/tok-reference-food-webp/tok-reference-food-03.webp) |
| /tok-reference-food-webp/tok-reference-food-04.webp | media | [public/tok-reference-food-webp/tok-reference-food-04.webp](../../public/tok-reference-food-webp/tok-reference-food-04.webp) |
| /tok-reference-food-webp/tok-reference-food-05.webp | media | [public/tok-reference-food-webp/tok-reference-food-05.webp](../../public/tok-reference-food-webp/tok-reference-food-05.webp) |
| /tok-reference-food-webp/tok-reference-food-06.webp | media | [public/tok-reference-food-webp/tok-reference-food-06.webp](../../public/tok-reference-food-webp/tok-reference-food-06.webp) |
| /tok-reference-food-webp/tok-reference-food-07.webp | media | [public/tok-reference-food-webp/tok-reference-food-07.webp](../../public/tok-reference-food-webp/tok-reference-food-07.webp) |
| /tok-reference-food-webp/tok-reference-food-08.webp | media | [public/tok-reference-food-webp/tok-reference-food-08.webp](../../public/tok-reference-food-webp/tok-reference-food-08.webp) |
| /tok-reference-food-webp/tok-reference-food-09.webp | media | [public/tok-reference-food-webp/tok-reference-food-09.webp](../../public/tok-reference-food-webp/tok-reference-food-09.webp) |
| /tok-reference-food-webp/tok-reference-food-10.webp | media | [public/tok-reference-food-webp/tok-reference-food-10.webp](../../public/tok-reference-food-webp/tok-reference-food-10.webp) |
| /tok-reference-food-webp/tok-reference-food-11.webp | media | [public/tok-reference-food-webp/tok-reference-food-11.webp](../../public/tok-reference-food-webp/tok-reference-food-11.webp) |
| /tok-reference-food-webp/tok-reference-food-12.webp | media | [public/tok-reference-food-webp/tok-reference-food-12.webp](../../public/tok-reference-food-webp/tok-reference-food-12.webp) |
| /tok-reference-food-webp/tok-reference-food-13.webp | media | [public/tok-reference-food-webp/tok-reference-food-13.webp](../../public/tok-reference-food-webp/tok-reference-food-13.webp) |
| /tok-slot-machine/assets/Livreur.png | media | [public/tok-slot-machine/assets/Livreur.png](../../public/tok-slot-machine/assets/Livreur.png) |
| /tok-slot-machine/assets/chef2.png | media | [public/tok-slot-machine/assets/chef2.png](../../public/tok-slot-machine/assets/chef2.png) |
| /tok-slot-machine/assets/lacuillere.png | media | [public/tok-slot-machine/assets/lacuillere.png](../../public/tok-slot-machine/assets/lacuillere.png) |
| /tok-slot-machine/assets/mangez.png | media | [public/tok-slot-machine/assets/mangez.png](../../public/tok-slot-machine/assets/mangez.png) |
| /tok-slot-machine/assets/paytable.png | media | [public/tok-slot-machine/assets/paytable.png](../../public/tok-slot-machine/assets/paytable.png) |
| /tok-slot-machine/ | navigable | [public/tok-slot-machine/index.html](../../public/tok-slot-machine/index.html) |
| /tok-slot-machine/slot-machine.js | other | [public/tok-slot-machine/slot-machine.js](../../public/tok-slot-machine/slot-machine.js) |
| /tok-table-v2/app.js | other | [public/tok-table-v2/app.js](../../public/tok-table-v2/app.js) |
| /tok-table-v2/ | navigable | [public/tok-table-v2/index.html](../../public/tok-table-v2/index.html) |
| /tok-table-v2/styles.css | other | [public/tok-table-v2/styles.css](../../public/tok-table-v2/styles.css) |

### Chemins référencés dans le code

| Chemin | Occurrences | Première source |
| --- | --- | --- |
| / | 233 | [public/firebase-messaging-sw.js:20](../../public/firebase-messaging-sw.js#L20) |
| /(.*) | 4 | [src/test/daily-slot-machine-security.test.ts:48](../../src/test/daily-slot-machine-security.test.ts#L48) |
| /* | 6 | [scripts/write-apple-app-site-association.mjs:30](../../scripts/write-apple-app-site-association.mjs#L30) |
| /.well-known/apple-app-site-association | 4 | [src/test/application-search-index.test.ts:68](../../src/test/application-search-index.test.ts#L68) |
| /.well-known/apple-app-site-association-extra | 1 | [src/test/mobile-association-hosting.test.ts:27](../../src/test/mobile-association-hosting.test.ts#L27) |
| /.well-known/assetlinks.json | 3 | [scripts/mobile-verify.mjs:262](../../scripts/mobile-verify.mjs#L262) |
| /.well-known/oauth-protected-resource | 1 | [src/test/mobile-association-hosting.test.ts:27](../../src/test/mobile-association-hosting.test.ts#L27) |
| /18270815569115548? | 1 | [src/test/marketing-meta-publishing.test.ts:162](../../src/test/marketing-meta-publishing.test.ts#L162) |
| /:path( | 3 | [src/test/mobile-association-hosting.test.ts:8](../../src/test/mobile-association-hosting.test.ts#L8) |
| /:path* | 1 | [src/test/marketing-subdomain-integration.test.ts:57](../../src/test/marketing-subdomain-integration.test.ts#L57) |
| /:surface( | 2 | [src/test/vercel-rewrites.test.ts:132](../../src/test/vercel-rewrites.test.ts#L132) |
| /:surface(admin\|marketing\|dashboard\|courier\|commercial\|profil\|memoire-tok\|notifications\|commandes\|commande\|reservations\|mon-espace\|compte\|espace-client\|mes-avis\|points-cadeau\|panier\|auth\|oauth\|espaces\|r) | 2 | [src/test/vercel-rewrites.test.ts:107](../../src/test/vercel-rewrites.test.ts#L107) |
| /?$ | 1 | [src/test/route-serving-regression.test.ts:9](../../src/test/route-serving-regression.test.ts#L9) |
| /?q=restaurant | 1 | [src/test/marketing-autopilot-frontend.test.tsx:255](../../src/test/marketing-autopilot-frontend.test.tsx#L255) |
| /?source=pwa | 1 | [src/test/plan-phase1-readiness.test.ts:147](../../src/test/plan-phase1-readiness.test.ts#L147) |
| /Image%20Codex%203%20sept.%202026,%2002_31_12.png | 3 | [src/components/FeatureWizard.tsx:18](../../src/components/FeatureWizard.tsx#L18) |
| /Miamz2.webp | 4 | [src/components/home/SolidaritySection.tsx:43](../../src/components/home/SolidaritySection.tsx#L43) |
| /Miamz3.webp | 3 | [src/components/home/SolidaritySection.tsx:41](../../src/components/home/SolidaritySection.tsx#L41) |
| /[^/]+ | 1 | [src/test/route-serving-regression.test.ts:9](../../src/test/route-serving-regression.test.ts#L9) |
| /^[0-9a-f-]{36}$/i.test(deliveryId) | 1 | [src/test/marketing-one-click-unsubscribe.test.ts:69](../../src/test/marketing-one-click-unsubscribe.test.ts#L69) |
| /__campaign-layout | 2 | [scripts/check-campaign-layout.mjs:59](../../scripts/check-campaign-layout.mjs#L59) |
| /__campaign-layout-test.tsx | 1 | [scripts/check-campaign-layout.mjs:12](../../scripts/check-campaign-layout.mjs#L12) |
| /__commercial-map | 2 | [scripts/check-commercial-map.mjs:42](../../scripts/check-commercial-map.mjs#L42) |
| /__commercial-map-test.tsx | 1 | [scripts/check-commercial-map.mjs:10](../../scripts/check-commercial-map.mjs#L10) |
| /__tests__/ | 1 | [scripts/frontend-10k-readiness.mjs:164](../../scripts/frontend-10k-readiness.mjs#L164) |
| /a | 1 | [src/test/seo-restaurant-context-hardening.test.ts:40](../../src/test/seo-restaurant-context-hardening.test.ts#L40) |
| /a-propos | 12 | [scripts/prerender-seo.mjs:1065](../../scripts/prerender-seo.mjs#L1065) |
| /abonnement | 13 | [scripts/prerender-seo.mjs:1001](../../scripts/prerender-seo.mjs#L1001) |
| /actions/runs/$FAILED_WORKFLOW_ID/jobs | 1 | [src/test/incident-automation-readiness.test.ts:547](../../src/test/incident-automation-readiness.test.ts#L547) |
| /actualites | 29 | [scripts/harden-seo-crawl.mjs:380](../../scripts/harden-seo-crawl.mjs#L380) |
| /actualites/ | 2 | [scripts/prerender-seo.mjs:48](../../scripts/prerender-seo.mjs#L48) |
| /actualites/:postId | 2 | [src/App.tsx:608](../../src/App.tsx#L608) |
| /actualites/post-1 | 4 | [src/test/seo-crawl-hardening.test.ts:114](../../src/test/seo-crawl-hardening.test.ts#L114) |
| /actualites/post-thin | 2 | [src/test/seo-crawl-hardening.test.ts:119](../../src/test/seo-crawl-hardening.test.ts#L119) |
| /actualites?post= | 1 | [src/test/actualites-search-seo.test.ts:36](../../src/test/actualites-search-seo.test.ts#L36) |
| /admin | 64 | [scripts/application-index-core.mjs:162](../../scripts/application-index-core.mjs#L162) |
| /admin/ | 4 | [src/App.tsx:309](../../src/App.tsx#L309) |
| /admin/:path* | 1 | [src/test/vercel-rewrites.test.ts:90](../../src/test/vercel-rewrites.test.ts#L90) |
| /admin/actualites | 5 | [src/App.tsx:658](../../src/App.tsx#L658) |
| /admin/ai-operations | 6 | [src/App.tsx:670](../../src/App.tsx#L670) |
| /admin/audit | 8 | [src/App.tsx:660](../../src/App.tsx#L660) |
| /admin/audit?event=1 | 2 | [src/test/notifications-sinistres-governance.test.ts:34](../../src/test/notifications-sinistres-governance.test.ts#L34) |
| /admin/avis | 13 | [src/App.tsx:653](../../src/App.tsx#L653) |
| /admin/catalog | 4 | [src/App.tsx:654](../../src/App.tsx#L654) |
| /admin/commandes-reservations | 10 | [src/App.tsx:666](../../src/App.tsx#L666) |
| /admin/commandes-reservations?dispatch= | 1 | [src/test/dispatch-client-fallback.test.ts:47](../../src/test/dispatch-client-fallback.test.ts#L47) |
| /admin/commandes-reservations?tab=orders | 2 | [src/lib/notificationRouting.ts:94](../../src/lib/notificationRouting.ts#L94) |
| /admin/commandes-reservations?tab=orders&operation=order-1 | 1 | [src/test/notifications-sinistres-governance.test.ts:27](../../src/test/notifications-sinistres-governance.test.ts#L27) |
| /admin/commandes-reservations?tab=reservations | 1 | [src/lib/notificationRouting.ts:95](../../src/lib/notificationRouting.ts#L95) |
| /admin/commandes-reservations?view=payments | 2 | [src/pages/admin/AdminAuditLogs.tsx:446](../../src/pages/admin/AdminAuditLogs.tsx#L446) |
| /admin/compta | 14 | [src/App.tsx:662](../../src/App.tsx#L662) |
| /admin/compta/ | 1 | [src/components/navigation/BackNavigationButton.tsx:17](../../src/components/navigation/BackNavigationButton.tsx#L17) |
| /admin/compta/entrees | 8 | [src/App.tsx:663](../../src/App.tsx#L663) |
| /admin/compta/ia | 5 | [src/App.tsx:665](../../src/App.tsx#L665) |
| /admin/compta/sorties | 8 | [src/App.tsx:664](../../src/App.tsx#L664) |
| /admin/crm | 4 | [src/App.tsx:659](../../src/App.tsx#L659) |
| /admin/drops | 4 | [src/App.tsx:656](../../src/App.tsx#L656) |
| /admin/guardian | 7 | [src/App.tsx:669](../../src/App.tsx#L669) |
| /admin/loyalty | 4 | [src/App.tsx:655](../../src/App.tsx#L655) |
| /admin/notifications | 9 | [src/App.tsx:657](../../src/App.tsx#L657) |
| /admin/packs | 4 | [src/App.tsx:661](../../src/App.tsx#L661) |
| /admin/platform | 6 | [src/App.tsx:649](../../src/App.tsx#L649) |
| /admin/restaurants | 11 | [src/App.tsx:650](../../src/App.tsx#L650) |
| /admin/restaurants/google-business | 7 | [src/App.tsx:651](../../src/App.tsx#L651) |
| /admin/sinistres | 8 | [src/App.tsx:667](../../src/App.tsx#L667) |
| /admin/sinistres?incident= | 2 | [src/test/notifications-sinistres-governance.test.ts:179](../../src/test/notifications-sinistres-governance.test.ts#L179) |
| /admin/sinistres?incident=incident-1 | 1 | [src/test/notifications-sinistres-governance.test.ts:33](../../src/test/notifications-sinistres-governance.test.ts#L33) |
| /admin/sinistres?ticket= | 1 | [src/test/support-notification-governance.test.ts:93](../../src/test/support-notification-governance.test.ts#L93) |
| /admin/support-resolution | 6 | [src/App.tsx:668](../../src/App.tsx#L668) |
| /admin/tok-connect | 11 | [src/App.tsx:671](../../src/App.tsx#L671) |
| /admin/utilisateurs | 5 | [src/App.tsx:652](../../src/App.tsx#L652) |
| /admin/utilisateurs?tab=applications | 3 | [src/components/admin/AdminMobileNavigation.tsx:66](../../src/components/admin/AdminMobileNavigation.tsx#L66) |
| /admin/utilisateurs?tab=commercials | 3 | [src/components/admin/AdminMobileNavigation.tsx:65](../../src/components/admin/AdminMobileNavigation.tsx#L65) |
| /admin/utilisateurs?tab=couriers | 3 | [src/components/admin/AdminMobileNavigation.tsx:67](../../src/components/admin/AdminMobileNavigation.tsx#L67) |
| /advisor | 1 | [src/lib/commercialDemoAi.ts:293](../../src/lib/commercialDemoAi.ts#L293) |
| /aide | 9 | [scripts/prerender-seo.mjs:1081](../../scripts/prerender-seo.mjs#L1081) |
| /aligro-catalog-sync | 1 | [src/test/supplier-catalog-sync.test.ts:82](../../src/test/supplier-catalog-sync.test.ts#L82) |
| /anti-gaspi | 20 | [scripts/prerender-seo.mjs:340](../../scripts/prerender-seo.mjs#L340) |
| /api | 1 | [vite.config.ts:97](../../vite.config.ts#L97) |
| /api-keys?reveal=true | 1 | [src/test/restaurant-image-backfill-auth.test.ts:15](../../src/test/restaurant-image-backfill-auth.test.ts#L15) |
| /api/ | 1 | [src/lib/commercialDemoEffects.ts:80](../../src/lib/commercialDemoEffects.ts#L80) |
| /api/embed | 2 | [src/test/image-metadata-ai.test.ts:131](../../src/test/image-metadata-ai.test.ts#L131) |
| /api/embeddings | 1 | [src/test/image-metadata-ai.test.ts:132](../../src/test/image-metadata-ai.test.ts#L132) |
| /api/generate | 1 | [src/test/image-metadata-ai.test.ts:130](../../src/test/image-metadata-ai.test.ts#L130) |
| /api/marketing/agent | 3 | [src/marketing/marketingBffClient.ts:13](../../src/marketing/marketingBffClient.ts#L13) |
| /api/marketing/launch | 2 | [src/marketing/marketingBffClient.ts:14](../../src/marketing/marketingBffClient.ts#L14) |
| /api/marketing/login | 1 | [src/marketing/marketingBffClient.ts:7](../../src/marketing/marketingBffClient.ts#L7) |
| /api/marketing/logout | 1 | [src/marketing/marketingBffClient.ts:10](../../src/marketing/marketingBffClient.ts#L10) |
| /api/marketing/mfa/enroll | 1 | [src/marketing/marketingBffClient.ts:8](../../src/marketing/marketingBffClient.ts#L8) |
| /api/marketing/mfa/verify | 3 | [src/marketing/marketingBffClient.ts:9](../../src/marketing/marketingBffClient.ts#L9) |
| /api/marketing/orchestrator | 3 | [src/marketing/marketingBffClient.ts:12](../../src/marketing/marketingBffClient.ts#L12) |
| /api/marketing/rpc | 7 | [src/marketing/marketingBffClient.ts:11](../../src/marketing/marketingBffClient.ts#L11) |
| /api/marketing/session | 4 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /api/missing | 1 | [src/test/route-serving-regression.test.ts:14](../../src/test/route-serving-regression.test.ts#L14) |
| /api/photon | 1 | [vite.config.ts:94](../../vite.config.ts#L94) |
| /api/support-ai | 1 | [src/test/tok-ai-tools.test.ts:524](../../src/test/tok-ai-tools.test.ts#L524) |
| /assets/missing.js | 1 | [src/test/route-serving-regression.test.ts:14](../../src/test/route-serving-regression.test.ts#L14) |
| /auth | 52 | [scripts/prerender-seo.mjs:1224](../../scripts/prerender-seo.mjs#L1224) |
| /auth/callback | 17 | [src/App.tsx:560](../../src/App.tsx#L560) |
| /auth/callback? | 1 | [src/lib/deep-links.ts:33](../../src/lib/deep-links.ts#L33) |
| /auth/callback?code=pkce-code | 1 | [src/test/native-oauth.test.ts:114](../../src/test/native-oauth.test.ts#L114) |
| /auth/demo | 6 | [src/App.tsx:559](../../src/App.tsx#L559) |
| /auth/v1/ | 1 | [src/lib/commercialDemoEffects.ts:74](../../src/lib/commercialDemoEffects.ts#L74) |
| /auth/v1/factors | 4 | [src/test/marketing-bff-security.test.ts:313](../../src/test/marketing-bff-security.test.ts#L313) |
| /auth/v1/logout?scope=local | 5 | [src/test/marketing-bff-security.test.ts:463](../../src/test/marketing-bff-security.test.ts#L463) |
| /auth/v1/token?grant_type=password | 5 | [src/test/marketing-bff-security.test.ts:239](../../src/test/marketing-bff-security.test.ts#L239) |
| /auth/v1/user | 7 | [src/test/marketing-bff-security.test.ts:250](../../src/test/marketing-bff-security.test.ts#L250) |
| /auth?code=secret | 1 | [src/test/monitoring-consent.test.ts:313](../../src/test/monitoring-consent.test.ts#L313) |
| /auth?confirmed=1 | 1 | [src/test/auth-signup-form.test.tsx:907](../../src/test/auth-signup-form.test.tsx#L907) |
| /auth?mode=recovery | 1 | [src/test/coming-soon-gate.test.tsx:17](../../src/test/coming-soon-gate.test.tsx#L17) |
| /auth?redirect=%2Fcommande%2Fconfirmation%3Fsession_id%3Dcs_test_123%26status%3Dsuccess | 1 | [src/test/stripe-return.test.ts:34](../../src/test/stripe-return.test.ts#L34) |
| /auth?redirect=/commercial | 1 | [src/test/admin-commercial-accounts.test.ts:192](../../src/test/admin-commercial-accounts.test.ts#L192) |
| /auth?role=restaurateur | 1 | [src/pages/PacksRestaurateur.tsx:191](../../src/pages/PacksRestaurateur.tsx#L191) |
| /auth?type=client | 12 | [src/test/auth-redirect-security.test.ts:33](../../src/test/auth-redirect-security.test.ts#L33) |
| /auth?type=restaurateur | 4 | [src/test/auth-signup-form.test.tsx:569](../../src/test/auth-signup-form.test.tsx#L569) |
| /availability | 1 | [supabase/functions/tok-connect-api/index.ts:1033](../../supabase/functions/tok-connect-api/index.ts#L1033) |
| /budget-auto | 10 | [scripts/prerender-seo.mjs:1025](../../scripts/prerender-seo.mjs#L1025) |
| /campagnes | 1 | [src/lib/commercialDemoAi.ts:298](../../src/lib/commercialDemoAi.ts#L298) |
| /carte | 2 | [supabase/functions/enrich-directory-cuisines/index.ts:95](../../supabase/functions/enrich-directory-cuisines/index.ts#L95) |
| /cgu | 21 | [scripts/prerender-seo.mjs:1170](../../scripts/prerender-seo.mjs#L1170) |
| /chef.png | 1 | [src/test/marketing-email-template.test.ts:25](../../src/test/marketing-email-template.test.ts#L25) |
| /chef2.png | 1 | [supabase/functions/_shared/transactional-emails.ts:243](../../supabase/functions/_shared/transactional-emails.ts#L243) |
| /chef3.png | 4 | [src/components/dashboard/RestaurantDashboardHomeView.tsx:671](../../src/components/dashboard/RestaurantDashboardHomeView.tsx#L671) |
| /chefs-table | 23 | [scripts/prerender-seo.mjs:993](../../scripts/prerender-seo.mjs#L993) |
| /chefs-table/ | 1 | [src/lib/tokLogo.ts:22](../../src/lib/tokLogo.ts#L22) |
| /chefs-table/selection | 1 | [src/test/tok-logo-calendar.test.ts:30](../../src/test/tok-logo-calendar.test.ts#L30) |
| /coming-soon | 13 | [src/App.tsx:530](../../src/App.tsx#L530) |
| /coming-soon?welcome=1 | 3 | [src/pages/Auth.tsx:1496](../../src/pages/Auth.tsx#L1496) |
| /commande | 2 | [scripts/prerender-seo.mjs:1216](../../scripts/prerender-seo.mjs#L1216) |
| /commande/ | 3 | [src/components/navigation/BackNavigationButton.tsx:22](../../src/components/navigation/BackNavigationButton.tsx#L22) |
| /commande/123?tab=details | 1 | [src/test/navigation.test.ts:24](../../src/test/navigation.test.ts#L24) |
| /commande/:id | 4 | [src/App.tsx:575](../../src/App.tsx#L575) |
| /commande/abc-123 | 1 | [src/test/feature-flags.test.ts:57](../../src/test/feature-flags.test.ts#L57) |
| /commande/confirmation | 11 | [src/App.tsx:574](../../src/App.tsx#L574) |
| /commande/confirmation?checkout_kind=order | 1 | [src/test/payment-attempt-state.test.ts:114](../../src/test/payment-attempt-state.test.ts#L114) |
| /commande/id | 1 | [src/test/coming-soon-gate.test.tsx:16](../../src/test/coming-soon-gate.test.tsx#L16) |
| /commande/order-1 | 3 | [src/test/notifications-sinistres-governance.test.ts:23](../../src/test/notifications-sinistres-governance.test.ts#L23) |
| /commandes | 35 | [scripts/prerender-seo.mjs:1215](../../scripts/prerender-seo.mjs#L1215) |
| /commercial | 42 | [scripts/application-index-core.mjs:166](../../scripts/application-index-core.mjs#L166) |
| /commercial/ | 3 | [src/App.tsx:313](../../src/App.tsx#L313) |
| /commercial/anything | 1 | [src/test/commercial-domain-isolation.test.ts:145](../../src/test/commercial-domain-isolation.test.ts#L145) |
| /commercial/comptabilite | 9 | [src/App.tsx:425](../../src/App.tsx#L425) |
| /commercial/demo-live | 28 | [src/App.tsx:535](../../src/App.tsx#L535) |
| /commercial/demo-live/ | 1 | [src/test/commercial-domain-isolation.test.ts:153](../../src/test/commercial-domain-isolation.test.ts#L153) |
| /commercial/demo-live/evil | 1 | [src/test/commercial-domain-isolation.test.ts:92](../../src/test/commercial-domain-isolation.test.ts#L92) |
| /commercial/demo-live/frame/ | 1 | [src/test/commercial-multi-space-demo.test.ts:121](../../src/test/commercial-multi-space-demo.test.ts#L121) |
| /commercial/demo-live/frame/:surface/:sessionId/* | 2 | [scripts/application-index-core.mjs:846](../../scripts/application-index-core.mjs#L846) |
| /commercial/demo-live/frame/client/not-a-uuid/mon-espace | 1 | [src/test/commercial-domain-isolation.test.ts:93](../../src/test/commercial-domain-isolation.test.ts#L93) |
| /commercial/demo-live/frame/courier/not-a-uuid/courier | 1 | [src/test/commercial-demo-frame.test.ts:32](../../src/test/commercial-demo-frame.test.ts#L32) |
| /commercial/demo-live?panel=client | 1 | [src/test/commercial-domain-isolation.test.ts:309](../../src/test/commercial-domain-isolation.test.ts#L309) |
| /commercial/demo-live?surface=client | 1 | [src/test/demo-workspace-access.test.ts:127](../../src/test/demo-workspace-access.test.ts#L127) |
| /commercial/demo-live?surface=courier | 2 | [src/test/demo-workspace-access.test.ts:60](../../src/test/demo-workspace-access.test.ts#L60) |
| /commercial/demo-live?surface=restaurant | 2 | [src/test/demo-workspace-access.test.ts:62](../../src/test/demo-workspace-access.test.ts#L62) |
| /commercial/prospection | 7 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /commercial/route-inconnue | 1 | [src/test/commercial-domain-isolation.test.ts:157](../../src/test/commercial-domain-isolation.test.ts#L157) |
| /commercially | 1 | [src/test/commercial-domain-isolation.test.ts:146](../../src/test/commercial-domain-isolation.test.ts#L146) |
| /compte | 5 | [scripts/prerender-seo.mjs:1219](../../scripts/prerender-seo.mjs#L1219) |
| /conditions-restaurateurs | 15 | [scripts/prerender-seo.mjs:1184](../../scripts/prerender-seo.mjs#L1184) |
| /contact | 19 | [scripts/prerender-seo.mjs:797](../../scripts/prerender-seo.mjs#L797) |
| /cookies | 13 | [scripts/prerender-seo.mjs:1177](../../scripts/prerender-seo.mjs#L1177) |
| /courier | 29 | [scripts/application-index-core.mjs:165](../../scripts/application-index-core.mjs#L165) |
| /courier/ | 3 | [src/App.tsx:311](../../src/App.tsx#L311) |
| /courier/earnings | 6 | [src/App.tsx:421](../../src/App.tsx#L421) |
| /courier/jobs | 17 | [public/firebase-messaging-sw.js:42](../../public/firebase-messaging-sw.js#L42) |
| /courier/jobs?job=job-1 | 1 | [src/test/notifications-sinistres-governance.test.ts:31](../../src/test/notifications-sinistres-governance.test.ts#L31) |
| /courier/notifications | 11 | [src/App.tsx:421](../../src/App.tsx#L421) |
| /courier/profile | 8 | [src/App.tsx:421](../../src/App.tsx#L421) |
| /creneaux-garantis | 11 | [scripts/prerender-seo.mjs:1009](../../scripts/prerender-seo.mjs#L1009) |
| /dashboard | 79 | [scripts/application-index-core.mjs:164](../../scripts/application-index-core.mjs#L164) |
| /dashboard-spoof | 1 | [src/test/coming-soon-gate.test.tsx:16](../../src/test/coming-soon-gate.test.tsx#L16) |
| /dashboard/ | 4 | [src/App.tsx:307](../../src/App.tsx#L307) |
| /dashboard/abonnement | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:224](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L224) |
| /dashboard/actualites | 7 | [src/App.tsx:632](../../src/App.tsx#L632) |
| /dashboard/advisor | 5 | [src/App.tsx:611](../../src/App.tsx#L611) |
| /dashboard/ai | 3 | [src/test/tok-ai-platform-plan.test.ts:216](../../src/test/tok-ai-platform-plan.test.ts#L216) |
| /dashboard/avis | 5 | [src/App.tsx:618](../../src/App.tsx#L618) |
| /dashboard/campagne-overview | 2 | [src/App.tsx:630](../../src/App.tsx#L630) |
| /dashboard/campagnes | 17 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /dashboard/campaign-studio | 5 | [src/App.tsx:634](../../src/App.tsx#L634) |
| /dashboard/commandes | 21 | [src/App.tsx:614](../../src/App.tsx#L614) |
| /dashboard/comparaison | 3 | [src/App.tsx:617](../../src/App.tsx#L617) |
| /dashboard/compta | 3 | [src/App.tsx:619](../../src/App.tsx#L619) |
| /dashboard/credits | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:215](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L215) |
| /dashboard/crm | 4 | [src/App.tsx:635](../../src/App.tsx#L635) |
| /dashboard/crm-clients | 2 | [supabase/functions/tok-connect-full-app-mcp/index.ts:221](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L221) |
| /dashboard/facturation | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:223](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L223) |
| /dashboard/factures | 15 | [src/App.tsx:619](../../src/App.tsx#L619) |
| /dashboard/factures/ | 1 | [src/components/navigation/BackNavigationButton.tsx:19](../../src/components/navigation/BackNavigationButton.tsx#L19) |
| /dashboard/factures/entrees | 7 | [src/App.tsx:621](../../src/App.tsx#L621) |
| /dashboard/factures/parametres | 5 | [src/App.tsx:623](../../src/App.tsx#L623) |
| /dashboard/factures/sorties | 7 | [src/App.tsx:622](../../src/App.tsx#L622) |
| /dashboard/formules | 4 | [src/App.tsx:627](../../src/App.tsx#L627) |
| /dashboard/menu | 12 | [src/App.tsx:612](../../src/App.tsx#L612) |
| /dashboard/mon-compte-facturation | 14 | [src/App.tsx:624](../../src/App.tsx#L624) |
| /dashboard/mon-compte-facturation?checkout_kind=restaurant-credit-pack | 1 | [src/pages/dashboard/DashboardAccountBilling.tsx:1166](../../src/pages/dashboard/DashboardAccountBilling.tsx#L1166) |
| /dashboard/notifications | 12 | [src/App.tsx:609](../../src/App.tsx#L609) |
| /dashboard/offres | 4 | [src/App.tsx:625](../../src/App.tsx#L625) |
| /dashboard/pack | 2 | [src/test/feature-flags.test.ts:86](../../src/test/feature-flags.test.ts#L86) |
| /dashboard/performances | 6 | [src/App.tsx:616](../../src/App.tsx#L616) |
| /dashboard/photos | 13 | [src/App.tsx:628](../../src/App.tsx#L628) |
| /dashboard/plan-de-salle | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:211](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L211) |
| /dashboard/plan-salle | 6 | [src/App.tsx:639](../../src/App.tsx#L639) |
| /dashboard/plan-salle-v2 | 2 | [src/App.tsx:641](../../src/App.tsx#L641) |
| /dashboard/promotions | 3 | [src/App.tsx:629](../../src/App.tsx#L629) |
| /dashboard/recommandations | 2 | [src/App.tsx:615](../../src/App.tsx#L615) |
| /dashboard/reseaux-sociaux | 3 | [src/App.tsx:631](../../src/App.tsx#L631) |
| /dashboard/reservations | 21 | [src/App.tsx:613](../../src/App.tsx#L613) |
| /dashboard/reservations?reservation=res-1 | 1 | [src/test/notifications-sinistres-governance.test.ts:29](../../src/test/notifications-sinistres-governance.test.ts#L29) |
| /dashboard/restaurant | 5 | [src/App.tsx:610](../../src/App.tsx#L610) |
| /dashboard/service | 5 | [src/App.tsx:638](../../src/App.tsx#L638) |
| /dashboard/statistiques | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:222](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L222) |
| /dashboard/support | 7 | [src/App.tsx:637](../../src/App.tsx#L637) |
| /dashboard/tok-connect | 7 | [src/App.tsx:642](../../src/App.tsx#L642) |
| /dashboard/ventes-flash | 6 | [src/App.tsx:626](../../src/App.tsx#L626) |
| /data/geneva-commercial-prospects.json | 2 | [src/data/genevaCommercialProspects.ts:39](../../src/data/genevaCommercialProspects.ts#L39) |
| /data/thefork-geneva-commercial-prospects.json | 1 | [src/data/theForkCommercialProspects.ts:7](../../src/data/theForkCommercialProspects.ts#L7) |
| /database/query | 1 | [src/test/production-preflight-hardening.test.ts:204](../../src/test/production-preflight-hardening.test.ts#L204) |
| /demo-restaurant.jpg | 1 | [src/test/commercial-demo-client-data-isolation.test.ts:19](../../src/test/commercial-demo-client-data-isolation.test.ts#L19) |
| /enrich-directory-cuisines | 1 | [src/test/directory-cuisine-enrichment.test.ts:40](../../src/test/directory-cuisine-enrichment.test.ts#L40) |
| /enrich-directory-cuisines-osm | 1 | [src/test/directory-cuisine-osm-backfill.test.ts:89](../../src/test/directory-cuisine-osm-backfill.test.ts#L89) |
| /enrich-directory-images | 2 | [src/test/directory-image-discovery-worker.test.ts:44](../../src/test/directory-image-discovery-worker.test.ts#L44) |
| /espace-client | 4 | [scripts/prerender-seo.mjs:1220](../../scripts/prerender-seo.mjs#L1220) |
| /espaces | 24 | [scripts/prerender-seo.mjs:1226](../../scripts/prerender-seo.mjs#L1226) |
| /factors | 1 | [server/marketingBff.ts:787](../../server/marketingBff.ts#L787) |
| /fallback.jpg | 4 | [src/test/security-url-helpers.test.ts:17](../../src/test/security-url-helpers.test.ts#L17) |
| /favicon-192x192.png | 2 | [src/test/favicon-branding.test.ts:53](../../src/test/favicon-branding.test.ts#L53) |
| /favicon-512x512.png | 1 | [src/test/favicon-branding.test.ts:59](../../src/test/favicon-branding.test.ts#L59) |
| /firebase-messaging-sw.js | 1 | [src/lib/push.ts:80](../../src/lib/push.ts#L80) |
| /flex-prix-bas | 11 | [scripts/prerender-seo.mjs:1057](../../scripts/prerender-seo.mjs#L1057) |
| /fond3.png | 7 | [public/seo-trust-runtime.js:8](../../public/seo-trust-runtime.js#L8) |
| /fondbanniere.png | 1 | [src/test/dashboard-overview-google-compact.test.ts:24](../../src/test/dashboard-overview-google-compact.test.ts#L24) |
| /functions/v1/ | 5 | [src/lib/commercialDemoEffects.ts:27](../../src/lib/commercialDemoEffects.ts#L27) |
| /functions/v1/:path* | 1 | [src/test/vercel-rewrites.test.ts:128](../../src/test/vercel-rewrites.test.ts#L128) |
| /functions/v1/ai-marketing-agent | 3 | [src/test/marketing-agent-bff.test.ts:30](../../src/test/marketing-agent-bff.test.ts#L30) |
| /functions/v1/create-checkout | 1 | [src/lib/iosCommerceFetch.ts:291](../../src/lib/iosCommerceFetch.ts#L291) |
| /functions/v1/daily-dish-ai?user=2f4c98d0-03f7-4e72-910a-0c34a892ca21 | 1 | [src/test/incident-intelligence-routing.test.ts:74](../../src/test/incident-intelligence-routing.test.ts#L74) |
| /functions/v1/daily-dish-ai?user=891a6eef-5be3-4d4a-9887-2e4f27bf39ee | 1 | [src/test/incident-intelligence-routing.test.ts:95](../../src/test/incident-intelligence-routing.test.ts#L95) |
| /functions/v1/dispatch-order | 1 | [src/test/dispatch-client-fallback.test.ts:18](../../src/test/dispatch-client-fallback.test.ts#L18) |
| /functions/v1/marketing-orchestrator | 1 | [src/test/marketing-meta-bff.test.ts:6](../../src/test/marketing-meta-bff.test.ts#L6) |
| /functions/v1/stripe-webhook | 1 | [src/test/checkout-stripe-guards.test.ts:182](../../src/test/checkout-stripe-guards.test.ts#L182) |
| /functions/v1/tok-pulse-widget | 2 | [src/pages/TokPulse.tsx:57](../../src/pages/TokPulse.tsx#L57) |
| /galerie | 1 | [supabase/functions/enrich-directory-images/index.ts:126](../../supabase/functions/enrich-directory-images/index.ts#L126) |
| /gallery | 1 | [supabase/functions/enrich-directory-images/index.ts:126](../../supabase/functions/enrich-directory-images/index.ts#L126) |
| /garantie-qualite | 11 | [scripts/prerender-seo.mjs:1017](../../scripts/prerender-seo.mjs#L1017) |
| /google-actions-center-sync | 1 | [src/test/google-actions-center-outbox.test.ts:147](../../src/test/google-actions-center-outbox.test.ts#L147) |
| /healthz | 2 | [src/test/application-search-index.test.ts:71](../../src/test/application-search-index.test.ts#L71) |
| /help.png | 1 | [src/components/help/ChefHelpButton.tsx:36](../../src/components/help/ChefHelpButton.tsx#L36) |
| /higgsfield/tok-intro-desktop.mp4 | 1 | [src/test/mobile-logo-intro.test.tsx:55](../../src/test/mobile-logo-intro.test.tsx#L55) |
| /higgsfield/tok-intro-mobile.mp4 | 1 | [src/test/mobile-logo-intro.test.tsx:24](../../src/test/mobile-logo-intro.test.tsx#L24) |
| /icon-192.png | 2 | [public/firebase-messaging-sw.js:46](../../public/firebase-messaging-sw.js#L46) |
| /icon-72.png | 2 | [public/firebase-messaging-sw.js:47](../../public/firebase-messaging-sw.js#L47) |
| /images/ | 2 | [src/components/RestaurantCard.tsx:69](../../src/components/RestaurantCard.tsx#L69) |
| /images/1.webp | 9 | [src/lib/menu-item-images.ts:15](../../src/lib/menu-item-images.ts#L15) |
| /images/baklava.jpg | 2 | [src/lib/menu-item-images.ts:97](../../src/lib/menu-item-images.ts#L97) |
| /images/bruschetta.jpg | 3 | [src/lib/menu-item-images.ts:54](../../src/lib/menu-item-images.ts#L54) |
| /images/byriani.jpg | 2 | [src/lib/menu-item-images.ts:47](../../src/lib/menu-item-images.ts#L47) |
| /images/calzone.webp | 2 | [src/lib/menu-item-images.ts:19](../../src/lib/menu-item-images.ts#L19) |
| /images/chicken-bucket-fries.jpeg | 5 | [src/lib/menu-item-images.ts:28](../../src/lib/menu-item-images.ts#L28) |
| /images/churros.jpg | 1 | [src/lib/menu-item-images.ts:149](../../src/lib/menu-item-images.ts#L149) |
| /images/crispy-chicken.jpeg | 1 | [src/lib/menu-item-images.ts:154](../../src/lib/menu-item-images.ts#L154) |
| /images/dashboard-3d/ | 1 | [src/test/dashboard-illustrations.test.ts:80](../../src/test/dashboard-illustrations.test.ts#L80) |
| /images/dashboard-3d/admin-ai-operations.webp | 1 | [src/lib/dashboardIllustrations.ts:52](../../src/lib/dashboardIllustrations.ts#L52) |
| /images/dashboard-3d/admin-audit.webp | 1 | [src/lib/dashboardIllustrations.ts:54](../../src/lib/dashboardIllustrations.ts#L54) |
| /images/dashboard-3d/admin-catalog.webp | 1 | [src/lib/dashboardIllustrations.ts:49](../../src/lib/dashboardIllustrations.ts#L49) |
| /images/dashboard-3d/admin-incidents.webp | 1 | [src/lib/dashboardIllustrations.ts:53](../../src/lib/dashboardIllustrations.ts#L53) |
| /images/dashboard-3d/admin-loyalty.webp | 1 | [src/lib/dashboardIllustrations.ts:50](../../src/lib/dashboardIllustrations.ts#L50) |
| /images/dashboard-3d/admin-operations.webp | 1 | [src/lib/dashboardIllustrations.ts:51](../../src/lib/dashboardIllustrations.ts#L51) |
| /images/dashboard-3d/admin-restaurants.webp | 1 | [src/lib/dashboardIllustrations.ts:47](../../src/lib/dashboardIllustrations.ts#L47) |
| /images/dashboard-3d/admin-users.webp | 1 | [src/lib/dashboardIllustrations.ts:48](../../src/lib/dashboardIllustrations.ts#L48) |
| /images/dashboard-3d/analytics.webp | 1 | [src/lib/dashboardIllustrations.ts:21](../../src/lib/dashboardIllustrations.ts#L21) |
| /images/dashboard-3d/client-orders-empty.webp | 1 | [src/lib/dashboardIllustrations.ts:43](../../src/lib/dashboardIllustrations.ts#L43) |
| /images/dashboard-3d/commercial-accounting-empty.webp | 1 | [src/lib/dashboardIllustrations.ts:45](../../src/lib/dashboardIllustrations.ts#L45) |
| /images/dashboard-3d/courier-jobs-empty.webp | 1 | [src/lib/dashboardIllustrations.ts:44](../../src/lib/dashboardIllustrations.ts#L44) |
| /images/dashboard-3d/creations.webp | 1 | [src/lib/dashboardIllustrations.ts:20](../../src/lib/dashboardIllustrations.ts#L20) |
| /images/dashboard-3d/gallery.webp | 1 | [src/lib/dashboardIllustrations.ts:19](../../src/lib/dashboardIllustrations.ts#L19) |
| /images/dashboard-3d/marketing.webp | 1 | [src/lib/dashboardIllustrations.ts:16](../../src/lib/dashboardIllustrations.ts#L16) |
| /images/dashboard-3d/photo-add.webp | 1 | [src/lib/dashboardIllustrations.ts:18](../../src/lib/dashboardIllustrations.ts#L18) |
| /images/dashboard-3d/photopro.webp | 1 | [src/lib/dashboardIllustrations.ts:17](../../src/lib/dashboardIllustrations.ts#L17) |
| /images/dashboard-3d/restaurant-advisor.webp | 1 | [src/lib/dashboardIllustrations.ts:27](../../src/lib/dashboardIllustrations.ts#L27) |
| /images/dashboard-3d/restaurant-billing.webp | 1 | [src/lib/dashboardIllustrations.ts:40](../../src/lib/dashboardIllustrations.ts#L40) |
| /images/dashboard-3d/restaurant-campaigns.webp | 1 | [src/lib/dashboardIllustrations.ts:32](../../src/lib/dashboardIllustrations.ts#L32) |
| /images/dashboard-3d/restaurant-comparison.webp | 1 | [src/lib/dashboardIllustrations.ts:29](../../src/lib/dashboardIllustrations.ts#L29) |
| /images/dashboard-3d/restaurant-crm.webp | 1 | [src/lib/dashboardIllustrations.ts:30](../../src/lib/dashboardIllustrations.ts#L30) |
| /images/dashboard-3d/restaurant-floor-plan.webp | 1 | [src/lib/dashboardIllustrations.ts:25](../../src/lib/dashboardIllustrations.ts#L25) |
| /images/dashboard-3d/restaurant-formulas.webp | 1 | [src/lib/dashboardIllustrations.ts:37](../../src/lib/dashboardIllustrations.ts#L37) |
| /images/dashboard-3d/restaurant-invoice-settings.webp | 1 | [src/lib/dashboardIllustrations.ts:41](../../src/lib/dashboardIllustrations.ts#L41) |
| /images/dashboard-3d/restaurant-news.webp | 1 | [src/lib/dashboardIllustrations.ts:36](../../src/lib/dashboardIllustrations.ts#L36) |
| /images/dashboard-3d/restaurant-orders.webp | 3 | [src/lib/dashboardIllustrations.ts:24](../../src/lib/dashboardIllustrations.ts#L24) |
| /images/dashboard-3d/restaurant-pack.webp | 1 | [src/lib/dashboardIllustrations.ts:39](../../src/lib/dashboardIllustrations.ts#L39) |
| /images/dashboard-3d/restaurant-performance.webp | 1 | [src/lib/dashboardIllustrations.ts:28](../../src/lib/dashboardIllustrations.ts#L28) |
| /images/dashboard-3d/restaurant-profile.webp | 1 | [src/lib/dashboardIllustrations.ts:26](../../src/lib/dashboardIllustrations.ts#L26) |
| /images/dashboard-3d/restaurant-promotions.webp | 1 | [src/lib/dashboardIllustrations.ts:33](../../src/lib/dashboardIllustrations.ts#L33) |
| /images/dashboard-3d/restaurant-reviews.webp | 1 | [src/lib/dashboardIllustrations.ts:34](../../src/lib/dashboardIllustrations.ts#L34) |
| /images/dashboard-3d/restaurant-service.webp | 2 | [src/lib/dashboardIllustrations.ts:23](../../src/lib/dashboardIllustrations.ts#L23) |
| /images/dashboard-3d/restaurant-social.webp | 1 | [src/lib/dashboardIllustrations.ts:35](../../src/lib/dashboardIllustrations.ts#L35) |
| /images/dashboard-3d/restaurant-support.webp | 1 | [src/lib/dashboardIllustrations.ts:31](../../src/lib/dashboardIllustrations.ts#L31) |
| /images/dashboard-3d/restaurant-tok-connect.webp | 1 | [src/lib/dashboardIllustrations.ts:38](../../src/lib/dashboardIllustrations.ts#L38) |
| /images/doner-kebab-plate.jpeg | 2 | [src/lib/menu-item-images.ts:48](../../src/lib/menu-item-images.ts#L48) |
| /images/edamame.webp | 1 | [src/lib/menu-item-images.ts:49](../../src/lib/menu-item-images.ts#L49) |
| /images/fattouche.webp | 5 | [src/lib/menu-item-images.ts:21](../../src/lib/menu-item-images.ts#L21) |
| /images/fondue%20moiti%C3%A9%20moiti%C3%A9.jpg | 2 | [src/test/menu-item-images.test.ts:9](../../src/test/menu-item-images.test.ts#L9) |
| /images/fondue-moitie-moitie.jpg | 5 | [src/lib/securityUrls.ts:26](../../src/lib/securityUrls.ts#L26) |
| /images/gfc-fried-chicken.jpeg | 3 | [src/lib/menu-item-images.ts:69](../../src/lib/menu-item-images.ts#L69) |
| /images/gourmet-burgers.jpeg | 3 | [src/lib/menu-item-images.ts:25](../../src/lib/menu-item-images.ts#L25) |
| /images/greek-gyros.jpeg | 2 | [src/lib/menu-item-images.ts:99](../../src/lib/menu-item-images.ts#L99) |
| /images/home/tok-geneve-mobile-original.webp | 2 | [src/components/home/HeroSection.tsx:81](../../src/components/home/HeroSection.tsx#L81) |
| /images/home/tok-leman-signature.webp | 2 | [src/components/home/HeroSection.tsx:82](../../src/components/home/HeroSection.tsx#L82) |
| /images/indian-curry-bowls.jpeg | 2 | [src/lib/menu-item-images.ts:61](../../src/lib/menu-item-images.ts#L61) |
| /images/indian-feast.jpeg | 4 | [src/lib/menu-item-images.ts:92](../../src/lib/menu-item-images.ts#L92) |
| /images/kebab-box-spread.jpeg | 22 | [public/seo-trust-runtime.js:9](../../public/seo-trust-runtime.js#L9) |
| /images/kombucha.jpeg | 1 | [src/lib/menu-item-images.ts:91](../../src/lib/menu-item-images.ts#L91) |
| /images/lebanese-mezze.jpeg | 5 | [src/components/AntiWasteCard.tsx:33](../../src/components/AntiWasteCard.tsx#L33) |
| /images/lobster-roll-fries.jpeg | 1 | [src/lib/menu-item-images.ts:128](../../src/lib/menu-item-images.ts#L128) |
| /images/meringue-double.webp | 3 | [src/lib/securityUrls.ts:27](../../src/lib/securityUrls.ts#L27) |
| /images/milkshake-oreo.jpg | 3 | [src/lib/securityUrls.ts:28](../../src/lib/securityUrls.ts#L28) |
| /images/milkshake-vanille.jpeg | 9 | [src/lib/menu-item-images.ts:30](../../src/lib/menu-item-images.ts#L30) |
| /images/miniatures/01_africain.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:32](../../src/components/home/CuisineCategoryStrip.tsx#L32) |
| /images/miniatures/02_americain.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:34](../../src/components/home/CuisineCategoryStrip.tsx#L34) |
| /images/miniatures/03_bistro.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:18](../../src/components/home/CuisineCategoryStrip.tsx#L18) |
| /images/miniatures/04_boulangerie.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:47](../../src/components/home/CuisineCategoryStrip.tsx#L47) |
| /images/miniatures/05_brunch.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:45](../../src/components/home/CuisineCategoryStrip.tsx#L45) |
| /images/miniatures/06_burger.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:19](../../src/components/home/CuisineCategoryStrip.tsx#L19) |
| /images/miniatures/07_cafe.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:50](../../src/components/home/CuisineCategoryStrip.tsx#L50) |
| /images/miniatures/08_chinois.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:23](../../src/components/home/CuisineCategoryStrip.tsx#L23) |
| /images/miniatures/09_creole.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:33](../../src/components/home/CuisineCategoryStrip.tsx#L33) |
| /images/miniatures/10_desserts.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:49](../../src/components/home/CuisineCategoryStrip.tsx#L49) |
| /images/miniatures/11_francais.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:21](../../src/components/home/CuisineCategoryStrip.tsx#L21) |
| /images/miniatures/12_gastronomique.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:14](../../src/components/home/CuisineCategoryStrip.tsx#L14) |
| /images/miniatures/13_grillades.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:37](../../src/components/home/CuisineCategoryStrip.tsx#L37) |
| /images/miniatures/14_halal.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:39](../../src/components/home/CuisineCategoryStrip.tsx#L39) |
| /images/miniatures/15_healthy.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:42](../../src/components/home/CuisineCategoryStrip.tsx#L42) |
| /images/miniatures/16_indien.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:25](../../src/components/home/CuisineCategoryStrip.tsx#L25) |
| /images/miniatures/17_italien.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:15](../../src/components/home/CuisineCategoryStrip.tsx#L15) |
| /images/miniatures/18_japonais.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:20](../../src/components/home/CuisineCategoryStrip.tsx#L20) |
| /images/miniatures/19_kebab.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:28](../../src/components/home/CuisineCategoryStrip.tsx#L28) |
| /images/miniatures/20_libanais.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:26](../../src/components/home/CuisineCategoryStrip.tsx#L26) |
| /images/miniatures/21_marocain.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:30](../../src/components/home/CuisineCategoryStrip.tsx#L30) |
| /images/miniatures/22_mediterranee.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:31](../../src/components/home/CuisineCategoryStrip.tsx#L31) |
| /images/miniatures/23_mexicain.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:29](../../src/components/home/CuisineCategoryStrip.tsx#L29) |
| /images/miniatures/24_pakistanais.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:38](../../src/components/home/CuisineCategoryStrip.tsx#L38) |
| /images/miniatures/25_pizza.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:16](../../src/components/home/CuisineCategoryStrip.tsx#L16) |
| /images/miniatures/26_sushi.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:17](../../src/components/home/CuisineCategoryStrip.tsx#L17) |
| /images/miniatures/27_ramen.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:22](../../src/components/home/CuisineCategoryStrip.tsx#L22) |
| /images/miniatures/28_thai.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:24](../../src/components/home/CuisineCategoryStrip.tsx#L24) |
| /images/miniatures/29_turc.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:27](../../src/components/home/CuisineCategoryStrip.tsx#L27) |
| /images/miniatures/30_salades.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:43](../../src/components/home/CuisineCategoryStrip.tsx#L43) |
| /images/miniatures/31_poke.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:44](../../src/components/home/CuisineCategoryStrip.tsx#L44) |
| /images/miniatures/32_petit-dejeuner.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:46](../../src/components/home/CuisineCategoryStrip.tsx#L46) |
| /images/miniatures/33_pates.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:36](../../src/components/home/CuisineCategoryStrip.tsx#L36) |
| /images/miniatures/34_fondue-suisse.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:35](../../src/components/home/CuisineCategoryStrip.tsx#L35) |
| /images/miniatures/35_patisserie.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:48](../../src/components/home/CuisineCategoryStrip.tsx#L48) |
| /images/miniatures/36_sandwich.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:51](../../src/components/home/CuisineCategoryStrip.tsx#L51) |
| /images/miniatures/37_street-food.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:52](../../src/components/home/CuisineCategoryStrip.tsx#L52) |
| /images/miniatures/38_vegetarien.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:40](../../src/components/home/CuisineCategoryStrip.tsx#L40) |
| /images/miniatures/39_vegan.png | 1 | [src/components/home/CuisineCategoryStrip.tsx:41](../../src/components/home/CuisineCategoryStrip.tsx#L41) |
| /images/mixed-grill-platter.jpeg | 10 | [src/components/AntiWasteCard.tsx:34](../../src/components/AntiWasteCard.tsx#L34) |
| /images/mochi-glaces.jpg | 7 | [src/lib/menu-item-images.ts:52](../../src/lib/menu-item-images.ts#L52) |
| /images/moshi%20glac%C3%A9s.jpg | 1 | [src/test/security-url-helpers.test.ts:23](../../src/test/security-url-helpers.test.ts#L23) |
| /images/octopus-fine-dining.jpeg | 8 | [src/components/AntiWasteCard.tsx:36](../../src/components/AntiWasteCard.tsx#L36) |
| /images/pannacotta.webp | 3 | [src/lib/menu-item-images.ts:20](../../src/lib/menu-item-images.ts#L20) |
| /images/pasta-assortment.jpeg | 5 | [src/components/AntiWasteCard.tsx:38](../../src/components/AntiWasteCard.tsx#L38) |
| /images/poke-bowls.jpeg | 8 | [src/components/AntiWasteCard.tsx:37](../../src/components/AntiWasteCard.tsx#L37) |
| /images/raita.webp | 1 | [src/lib/menu-item-images.ts:102](../../src/lib/menu-item-images.ts#L102) |
| /images/restaurant.jpg | 3 | [src/test/restaurant-entity-seo.test.ts:40](../../src/test/restaurant-entity-seo.test.ts#L40) |
| /images/resto.jpg | 1 | [src/test/catalog-quality.test.ts:8](../../src/test/catalog-quality.test.ts#L8) |
| /images/rosti-bernois.jpg | 3 | [src/lib/securityUrls.ts:31](../../src/lib/securityUrls.ts#L31) |
| /images/rotisserie-chicken.jpeg | 1 | [src/lib/menu-item-images.ts:156](../../src/lib/menu-item-images.ts#L156) |
| /images/salade-du-marche.jpg | 5 | [src/lib/menu-item-images.ts:130](../../src/lib/menu-item-images.ts#L130) |
| /images/samosa.jpg | 3 | [src/lib/menu-item-images.ts:94](../../src/lib/menu-item-images.ts#L94) |
| /images/section-headers/calendar-3d.png | 2 | [src/lib/dashboardIllustrations.ts:57](../../src/lib/dashboardIllustrations.ts#L57) |
| /images/section-headers/fire-3d.png | 1 | [src/lib/dashboardIllustrations.ts:59](../../src/lib/dashboardIllustrations.ts#L59) |
| /images/section-headers/gift-3d.png | 2 | [src/components/home/RestaurantSection.tsx:26](../../src/components/home/RestaurantSection.tsx#L26) |
| /images/section-headers/heart-3d.png | 1 | [src/pages/Index.tsx:56](../../src/pages/Index.tsx#L56) |
| /images/section-headers/pin-3d.png | 1 | [src/pages/Index.tsx:57](../../src/pages/Index.tsx#L57) |
| /images/section-headers/plate-3d.png | 2 | [src/lib/dashboardIllustrations.ts:56](../../src/lib/dashboardIllustrations.ts#L56) |
| /images/section-headers/shopping-bags-3d.png | 1 | [src/lib/dashboardIllustrations.ts:60](../../src/lib/dashboardIllustrations.ts#L60) |
| /images/smash-burger-single.jpeg | 3 | [src/lib/menu-item-images.ts:23](../../src/lib/menu-item-images.ts#L23) |
| /images/smash-burgers.jpeg | 3 | [src/components/AntiWasteCard.tsx:39](../../src/components/AntiWasteCard.tsx#L39) |
| /images/stack-shake-spread.jpeg | 1 | [src/components/AntiWasteCard.tsx:35](../../src/components/AntiWasteCard.tsx#L35) |
| /images/taboule.webp | 3 | [src/lib/securityUrls.ts:33](../../src/lib/securityUrls.ts#L33) |
| /images/taboulé.webp | 3 | [src/lib/securityUrls.ts:33](../../src/lib/securityUrls.ts#L33) |
| /images/thai-curry-spread.jpeg | 5 | [src/lib/menu-item-images.ts:62](../../src/lib/menu-item-images.ts#L62) |
| /images/thai-pad-thai.jpeg | 3 | [src/lib/menu-item-images.ts:46](../../src/lib/menu-item-images.ts#L46) |
| /images/thai-spread.jpeg | 3 | [src/lib/menu-item-images.ts:51](../../src/lib/menu-item-images.ts#L51) |
| /images/tok-connect/tok-connect-widget-details.svg | 1 | [src/pages/TokConnect.tsx:103](../../src/pages/TokConnect.tsx#L103) |
| /images/tok-connect/tok-connect-widget-restaurants.svg | 1 | [src/pages/TokConnect.tsx:97](../../src/pages/TokConnect.tsx#L97) |
| /images/tok-restaurant-placeholder.svg | 2 | [src/components/RestaurantCard.tsx:50](../../src/components/RestaurantCard.tsx#L50) |
| /index.html | 27 | [scripts/application-index-core.mjs:767](../../scripts/application-index-core.mjs#L767) |
| /inventory/partners/{partnerId}/merchants/{merchantId}/availability:replace | 1 | [supabase/functions/google-actions-center-sync/index.ts:52](../../supabase/functions/google-actions-center-sync/index.ts#L52) |
| /launch | 1 | [src/components/launch/LaunchArtwork.tsx:51](../../src/components/launch/LaunchArtwork.tsx#L51) |
| /logo3df.png | 1 | [src/test/marketing-email-template.test.ts:24](../../src/test/marketing-email-template.test.ts#L24) |
| /logotok.png | 7 | [public/tok-slot-machine/slot-machine.js:5](../../public/tok-slot-machine/slot-machine.js#L5) |
| /logout?scope=local | 1 | [server/marketingBff.ts:736](../../server/marketingBff.ts#L736) |
| /manifest.json | 1 | [src/hooks/useTokLogo.ts:31](../../src/hooks/useTokLogo.ts#L31) |
| /marketing | 18 | [scripts/application-index-core.mjs:163](../../scripts/application-index-core.mjs#L163) |
| /marketing-assets/ | 1 | [supabase/functions/ai-image-enhance/index.ts:99](../../supabase/functions/ai-image-enhance/index.ts#L99) |
| /marketing-public | 1 | [src/test/marketing-domain-isolation.test.ts:25](../../src/test/marketing-domain-isolation.test.ts#L25) |
| /marketing/ | 1 | [src/App.tsx:315](../../src/App.tsx#L315) |
| /marketing/* | 2 | [src/App.tsx:733](../../src/App.tsx#L733) |
| /marketing/campaigns | 1 | [src/test/marketing-domain-isolation.test.ts:24](../../src/test/marketing-domain-isolation.test.ts#L24) |
| /marketing/login | 8 | [src/App.tsx:724](../../src/App.tsx#L724) |
| /match-groupes | 13 | [scripts/prerender-seo.mjs:1049](../../scripts/prerender-seo.mjs#L1049) |
| /me/accounts? | 1 | [src/test/marketing-meta-publishing.test.ts:94](../../src/test/marketing-meta-publishing.test.ts#L94) |
| /memoire-tok | 7 | [scripts/prerender-seo.mjs:1213](../../scripts/prerender-seo.mjs#L1213) |
| /menu | 3 | [supabase/functions/enrich-directory-cuisines/index.ts:95](../../supabase/functions/enrich-directory-cuisines/index.ts#L95) |
| /mes-avis | 8 | [scripts/prerender-seo.mjs:1221](../../scripts/prerender-seo.mjs#L1221) |
| /miamz | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:206](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L206) |
| /miamz-solidaires | 12 | [scripts/prerender-seo.mjs:563](../../scripts/prerender-seo.mjs#L563) |
| /mon-espace | 29 | [scripts/prerender-seo.mjs:1218](../../scripts/prerender-seo.mjs#L1218) |
| /mon-espace?source=pwa-shortcut | 1 | [src/test/application-search-index.test.ts:95](../../src/test/application-search-index.test.ts#L95) |
| /multi-restaurant | 15 | [scripts/prerender-seo.mjs:1033](../../scripts/prerender-seo.mjs#L1033) |
| /multi-stop | 12 | [scripts/prerender-seo.mjs:1041](../../scripts/prerender-seo.mjs#L1041) |
| /notification/partners/{partnerId}/bookings:notify | 1 | [supabase/functions/google-actions-center-sync/index.ts:60](../../supabase/functions/google-actions-center-sync/index.ts#L60) |
| /notifications | 30 | [scripts/prerender-seo.mjs:1214](../../scripts/prerender-seo.mjs#L1214) |
| /notifications?tab=orders | 2 | [src/test/navigation.test.ts:10](../../src/test/navigation.test.ts#L10) |
| /oauth | 2 | [scripts/prerender-seo.mjs:1225](../../scripts/prerender-seo.mjs#L1225) |
| /oauth/consent | 5 | [src/App.tsx:451](../../src/App.tsx#L451) |
| /oauth/consent?authorization_id=authorization-123 | 1 | [src/test/auth-post-login-routing.test.ts:15](../../src/test/auth-post-login-routing.test.ts#L15) |
| /orders/add | 4 | [src/test/cloudprinter-edge-runtime.test.ts:133](../../src/test/cloudprinter-edge-runtime.test.ts#L133) |
| /orders/cancel | 1 | [supabase/functions/_shared/print/cloudprinter.ts:342](../../supabase/functions/_shared/print/cloudprinter.ts#L342) |
| /orders/info | 2 | [src/test/marketing-print-contract.test.ts:192](../../src/test/marketing-print-contract.test.ts#L192) |
| /orders/quote | 1 | [supabase/functions/_shared/print/cloudprinter.ts:294](../../supabase/functions/_shared/print/cloudprinter.ts#L294) |
| /packs-restaurateur | 12 | [scripts/prerender-seo.mjs:594](../../scripts/prerender-seo.mjs#L594) |
| /panier | 37 | [scripts/launch-10k-load-check.mjs:25](../../scripts/launch-10k-load-check.mjs#L25) |
| /parametres/securite | 5 | [src/App.tsx:357](../../src/App.tsx#L357) |
| /placeholder.svg | 2 | [public/seo-trust-runtime.js:10](../../public/seo-trust-runtime.js#L10) |
| /points-cadeau | 12 | [scripts/prerender-seo.mjs:1222](../../scripts/prerender-seo.mjs#L1222) |
| /politique-confidentialite | 20 | [scripts/prerender-seo.mjs:1199](../../scripts/prerender-seo.mjs#L1199) |
| /prices/lookup | 1 | [supabase/functions/_shared/print/cloudprinter.ts:283](../../supabase/functions/_shared/print/cloudprinter.ts#L283) |
| /products | 3 | [src/test/cloudprinter-edge-runtime.test.ts:64](../../src/test/cloudprinter-edge-runtime.test.ts#L64) |
| /products/info | 1 | [supabase/functions/_shared/print/cloudprinter.ts:273](../../supabase/functions/_shared/print/cloudprinter.ts#L273) |
| /profil | 13 | [scripts/prerender-seo.mjs:1212](../../scripts/prerender-seo.mjs#L1212) |
| /profil?mode=edit | 1 | [src/test/navigation.test.ts:28](../../src/test/navigation.test.ts#L28) |
| /profil?tab=abonnement | 4 | [src/components/CustomerDashboardLayout.tsx:107](../../src/components/CustomerDashboardLayout.tsx#L107) |
| /profil?tab=favoris | 3 | [src/components/CustomerDashboardLayout.tsx:105](../../src/components/CustomerDashboardLayout.tsx#L105) |
| /profil?tab=fidelite | 2 | [src/components/CustomerDashboardLayout.tsx:106](../../src/components/CustomerDashboardLayout.tsx#L106) |
| /profil?tab=infos | 2 | [src/components/CustomerDashboardLayout.tsx:119](../../src/components/CustomerDashboardLayout.tsx#L119) |
| /pub.jpg | 1 | [src/lib/campaignCreative.ts:171](../../src/lib/campaignCreative.ts#L171) |
| /r | 2 | [scripts/prerender-seo.mjs:1227](../../scripts/prerender-seo.mjs#L1227) |
| /r/ | 2 | [scripts/harden-seo-crawl.mjs:118](../../scripts/harden-seo-crawl.mjs#L118) |
| /r/:slug | 3 | [src/App.tsx:569](../../src/App.tsx#L569) |
| /r/:slug/reserver | 2 | [src/App.tsx:568](../../src/App.tsx#L568) |
| /readyz | 3 | [src/test/application-search-index.test.ts:71](../../src/test/application-search-index.test.ts#L71) |
| /recherche | 64 | [public/seo-trust-runtime.js:138](../../public/seo-trust-runtime.js#L138) |
| /recherche?city=Lausanne&sort=prix&order=asc | 1 | [src/test/restaurant-search-preview.test.tsx:23](../../src/test/restaurant-search-preview.test.tsx#L23) |
| /recherche?mode=reservation | 2 | [src/pages/TokPulse.tsx:30](../../src/pages/TokPulse.tsx#L30) |
| /recherche?q=francais | 1 | [src/test/home-cuisine-accessibility.test.tsx:32](../../src/test/home-cuisine-accessibility.test.tsx#L32) |
| /recherche?q=pizza&ville=geneve | 1 | [scripts/launch-10k-load-check.mjs:19](../../scripts/launch-10k-load-check.mjs#L19) |
| /recherche?q=sushi&city=Genève | 2 | [src/test/restaurant-search-preview.test.tsx:30](../../src/test/restaurant-search-preview.test.tsx#L30) |
| /reconcile-paid-order-checkouts | 1 | [src/test/reconcile-paid-order-checkouts.test.ts:39](../../src/test/reconcile-paid-order-checkouts.test.ts#L39) |
| /reseaux-sociaux | 1 | [src/lib/commercialDemoAi.ts:299](../../src/lib/commercialDemoAi.ts#L299) |
| /reservations | 24 | [scripts/prerender-seo.mjs:1217](../../scripts/prerender-seo.mjs#L1217) |
| /reserver | 1 | [src/test/google-actions-center-readiness.test.ts:31](../../src/test/google-actions-center-readiness.test.ts#L31) |
| /rest/v1/ | 3 | [src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx:106](../../src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx#L106) |
| /rest/v1/rpc/ | 2 | [src/lib/commercialDemoEffects.ts:20](../../src/lib/commercialDemoEffects.ts#L20) |
| /rest/v1/user_roles? | 7 | [src/test/marketing-bff-security.test.ts:249](../../src/test/marketing-bff-security.test.ts#L249) |
| /restaurant | 4 | [supabase/functions/discover-thefork-official-sites/index.ts:459](../../supabase/functions/discover-thefork-official-sites/index.ts#L459) |
| /restaurant/ | 2 | [scripts/prerender-seo.mjs:44](../../scripts/prerender-seo.mjs#L44) |
| /restaurant/11111111-1111-1111-1111-111111111111 | 1 | [src/test/restaurant-detail-preview.test.tsx:9](../../src/test/restaurant-detail-preview.test.tsx#L9) |
| /restaurant/:id | 7 | [src/App.tsx:570](../../src/App.tsx#L570) |
| /restaurant/:id/reserver | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:201](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L201) |
| /restaurant/cc47c8c6-752f-406c-8c2f-ed04ebd0ca20 | 1 | [src/test/route-serving-regression.test.ts:11](../../src/test/route-serving-regression.test.ts#L11) |
| /restaurant/la-table-test-restaurant-1 | 1 | [src/test/restaurant-entity-seo.test.ts:39](../../src/test/restaurant-entity-seo.test.ts#L39) |
| /restaurant/production-id | 1 | [src/test/commercial-domain-isolation.test.ts:88](../../src/test/commercial-domain-isolation.test.ts#L88) |
| /restaurant/real-id | 1 | [src/test/commercial-domain-isolation.test.ts:261](../../src/test/commercial-domain-isolation.test.ts#L261) |
| /restaurant/sans-donnee-inventee-restaurant-2 | 1 | [src/test/restaurant-entity-seo.test.ts:150](../../src/test/restaurant-entity-seo.test.ts#L150) |
| /restaurants | 5 | [src/components/marketing/views/MarketingOutreachView.tsx:102](../../src/components/marketing/views/MarketingOutreachView.tsx#L102) |
| /restaurants-pres/:path* | 2 | [middleware.js:5](../../middleware.js#L5) |
| /restaurants-pres/:venueSlug | 2 | [src/App.tsx:565](../../src/App.tsx#L565) |
| /restaurants-pres/OLD | 1 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /restaurants-pres/canonical | 3 | [scripts/stoppin-venue-seo.test.mjs:121](../../scripts/stoppin-venue-seo.test.mjs#L121) |
| /restaurants-pres/grand-theatre-de-geneve | 1 | [src/test/stoppin-thetok-routes.test.ts:85](../../src/test/stoppin-thetok-routes.test.ts#L85) |
| /restaurants-pres/hidden | 1 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /restaurants-pres/old | 2 | [scripts/stoppin-venue-seo.test.mjs:121](../../scripts/stoppin-venue-seo.test.mjs#L121) |
| /restaurants-pres/old/ | 1 | [scripts/stoppin-venue-seo.test.mjs:121](../../scripts/stoppin-venue-seo.test.mjs#L121) |
| /restaurants-pres/old/extra | 1 | [scripts/stoppin-venue-seo.test.mjs:140](../../scripts/stoppin-venue-seo.test.mjs#L140) |
| /restaurants-pres/palexpo-geneve | 1 | [src/test/stoppin-thetok-routes.test.ts:84](../../src/test/stoppin-thetok-routes.test.ts#L84) |
| /restaurants-pres/stade-de-geneve | 1 | [src/test/stoppin-thetok-routes.test.ts:86](../../src/test/stoppin-thetok-routes.test.ts#L86) |
| /restaurants-pres/theatre-de-beaulieu-lausanne | 1 | [src/test/stoppin-thetok-routes.test.ts:87](../../src/test/stoppin-thetok-routes.test.ts#L87) |
| /restaurants-pres/victoria-hall-geneve | 1 | [src/test/stoppin-thetok-routes.test.ts:83](../../src/test/stoppin-thetok-routes.test.ts#L83) |
| /restaurants/ | 4 | [scripts/harden-seo-trust-signals.mjs:188](../../scripts/harden-seo-trust-signals.mjs#L188) |
| /restaurants/${citySlug}/r/${restaurantSlug} | 2 | [src/test/responsive-seo-regressions.test.ts:88](../../src/test/responsive-seo-regressions.test.ts#L88) |
| /restaurants/:city | 4 | [src/App.tsx:564](../../src/App.tsx#L564) |
| /restaurants/:city/:category | 4 | [src/App.tsx:567](../../src/App.tsx#L567) |
| /restaurants/:city/r/:restaurantSlug | 3 | [src/App.tsx:566](../../src/App.tsx#L566) |
| /restaurants/carouge | 2 | [src/test/carouge-seo-consolidation.test.ts:41](../../src/test/carouge-seo-consolidation.test.ts#L41) |
| /restaurants/carouge-ge | 2 | [src/test/carouge-seo-consolidation.test.ts:40](../../src/test/carouge-seo-consolidation.test.ts#L40) |
| /restaurants/carouge-ge/:path* | 3 | [src/test/carouge-seo-consolidation.test.ts:45](../../src/test/carouge-seo-consolidation.test.ts#L45) |
| /restaurants/carouge-ge/r/fernandes-de-almeida-restaurant-le-par | 1 | [src/test/stoppin-venue-dedupe.test.ts:27](../../src/test/stoppin-venue-dedupe.test.ts#L27) |
| /restaurants/carouge/:path* | 2 | [src/test/carouge-seo-consolidation.test.ts:46](../../src/test/carouge-seo-consolidation.test.ts#L46) |
| /restaurants/carouge/r/creperie-du-vieux-carouge | 1 | [src/test/carouge-seo-consolidation.test.ts:30](../../src/test/carouge-seo-consolidation.test.ts#L30) |
| /restaurants/carouge/r/fernandes-de-almeida-restaurant-le-paradisio | 1 | [src/test/stoppin-venue-dedupe.test.ts:32](../../src/test/stoppin-venue-dedupe.test.ts#L32) |
| /restaurants/carouge/r/le-bouchon | 1 | [src/test/seo-city-identity.test.ts:68](../../src/test/seo-city-identity.test.ts#L68) |
| /restaurants/carouge/r/le-jardin-de-pinchat | 1 | [src/test/seo-city-identity.test.ts:67](../../src/test/seo-city-identity.test.ts#L67) |
| /restaurants/carouge/r/other-city | 1 | [src/test/seo-restaurant-context-hardening.test.ts:30](../../src/test/seo-restaurant-context-hardening.test.ts#L30) |
| /restaurants/chene-bourg/r/la-caf | 1 | [src/test/seo-web-artifact-names.test.ts:55](../../src/test/seo-web-artifact-names.test.ts#L55) |
| /restaurants/geneve | 8 | [src/test/commercial-domain-isolation.test.ts:87](../../src/test/commercial-domain-isolation.test.ts#L87) |
| /restaurants/geneve/eaux-vives | 2 | [src/test/seo-crawl-hardening.test.ts:93](../../src/test/seo-crawl-hardening.test.ts#L93) |
| /restaurants/geneve/italien | 2 | [src/test/seo-crawl-hardening.test.ts:99](../../src/test/seo-crawl-hardening.test.ts#L99) |
| /restaurants/geneve/r/a | 6 | [src/test/seo-directory-quality-hardening.test.ts:47](../../src/test/seo-directory-quality-hardening.test.ts#L47) |
| /restaurants/geneve/r/b | 4 | [src/test/seo-directory-quality-hardening.test.ts:48](../../src/test/seo-directory-quality-hardening.test.ts#L48) |
| /restaurants/geneve/r/bombay | 3 | [src/test/seo-near-duplicate-hardening.test.ts:38](../../src/test/seo-near-duplicate-hardening.test.ts#L38) |
| /restaurants/geneve/r/bombay-restaurant | 3 | [src/test/seo-near-duplicate-hardening.test.ts:38](../../src/test/seo-near-duplicate-hardening.test.ts#L38) |
| /restaurants/geneve/r/breaktime | 1 | [src/test/seo-public-name-hardening.test.ts:94](../../src/test/seo-public-name-hardening.test.ts#L94) |
| /restaurants/geneve/r/c | 2 | [src/test/seo-directory-quality-hardening.test.ts:49](../../src/test/seo-directory-quality-hardening.test.ts#L49) |
| /restaurants/geneve/r/cantine-des-commercants | 1 | [src/test/seo-final-quality-hardening.test.ts:77](../../src/test/seo-final-quality-hardening.test.ts#L77) |
| /restaurants/geneve/r/chain-1 | 1 | [src/test/seo-directory-quality-hardening.test.ts:50](../../src/test/seo-directory-quality-hardening.test.ts#L50) |
| /restaurants/geneve/r/current | 1 | [src/test/seo-restaurant-context-hardening.test.ts:22](../../src/test/seo-restaurant-context-hardening.test.ts#L22) |
| /restaurants/geneve/r/d | 1 | [src/test/seo-inventory-consistency.test.ts:28](../../src/test/seo-inventory-consistency.test.ts#L28) |
| /restaurants/geneve/r/dup | 2 | [src/test/seo-crawl-hardening.test.ts:108](../../src/test/seo-crawl-hardening.test.ts#L108) |
| /restaurants/geneve/r/far | 1 | [src/test/seo-restaurant-context-hardening.test.ts:29](../../src/test/seo-restaurant-context-hardening.test.ts#L29) |
| /restaurants/geneve/r/fatorest-sa | 1 | [src/test/seo-near-duplicate-hardening.test.ts:48](../../src/test/seo-near-duplicate-hardening.test.ts#L48) |
| /restaurants/geneve/r/first | 1 | [src/test/seo-restaurant-context-hardening.test.ts:32](../../src/test/seo-restaurant-context-hardening.test.ts#L32) |
| /restaurants/geneve/r/foo | 1 | [src/test/seo-crawl-hardening.test.ts:104](../../src/test/seo-crawl-hardening.test.ts#L104) |
| /restaurants/geneve/r/giardino-romano | 2 | [src/test/seo-near-duplicate-hardening.test.ts:48](../../src/test/seo-near-duplicate-hardening.test.ts#L48) |
| /restaurants/geneve/r/kinako | 1 | [src/test/seo-web-artifact-names.test.ts:46](../../src/test/seo-web-artifact-names.test.ts#L46) |
| /restaurants/geneve/r/la-cantine-des-commercants-plainpalais | 1 | [src/test/seo-final-quality-hardening.test.ts:78](../../src/test/seo-final-quality-hardening.test.ts#L78) |
| /restaurants/geneve/r/le-cellier | 1 | [src/test/seo-public-name-hardening.test.ts:93](../../src/test/seo-public-name-hardening.test.ts#L93) |
| /restaurants/geneve/r/le-samourai | 1 | [src/test/seo-directory-quality-hardening.test.ts:74](../../src/test/seo-directory-quality-hardening.test.ts#L74) |
| /restaurants/geneve/r/lucha-libre | 1 | [src/test/seo-directory-quality-hardening.test.ts:30](../../src/test/seo-directory-quality-hardening.test.ts#L30) |
| /restaurants/geneve/r/mamasan-paquis-1c1d4df5 | 2 | [src/test/seo-web-artifact-names.test.ts:45](../../src/test/seo-web-artifact-names.test.ts#L45) |
| /restaurants/geneve/r/restaurant-le-safran | 1 | [scripts/harden-seo-directory-quality.mjs:25](../../scripts/harden-seo-directory-quality.mjs#L25) |
| /restaurants/geneve/r/second | 1 | [src/test/seo-restaurant-context-hardening.test.ts:31](../../src/test/seo-restaurant-context-hardening.test.ts#L31) |
| /restaurants/geneve/r/shogun | 2 | [scripts/harden-seo-directory-quality.mjs:24](../../scripts/harden-seo-directory-quality.mjs#L24) |
| /restaurants/geneve/r/taraud-co | 1 | [src/test/seo-final-quality-hardening.test.ts:76](../../src/test/seo-final-quality-hardening.test.ts#L76) |
| /restaurants/geneve/r/thai-food-corner | 1 | [src/test/seo-near-duplicate-hardening.test.ts:39](../../src/test/seo-near-duplicate-hardening.test.ts#L39) |
| /restaurants/geneve/r/zai-zai | 1 | [src/test/seo-final-quality-hardening.test.ts:22](../../src/test/seo-final-quality-hardening.test.ts#L22) |
| /restaurants/lausanne | 5 | [src/test/seo-crawl-hardening.test.ts:87](../../src/test/seo-crawl-hardening.test.ts#L87) |
| /restaurants/meyrin/r/poulet-22-sarl | 2 | [src/test/seo-directory-quality-hardening.test.ts:31](../../src/test/seo-directory-quality-hardening.test.ts#L31) |
| /restaurants/vernier/r/mamasan-vernier-172a0351 | 1 | [src/test/seo-near-duplicate-hardening.test.ts:72](../../src/test/seo-near-duplicate-hardening.test.ts#L72) |
| /restaurants/vernier/r/mamasan-vernier-b315506b | 1 | [src/test/seo-near-duplicate-hardening.test.ts:73](../../src/test/seo-near-duplicate-hardening.test.ts#L73) |
| /restaurants/vesenaz/r/sushi-zen-sa | 2 | [src/test/seo-directory-quality-hardening.test.ts:32](../../src/test/seo-directory-quality-hardening.test.ts#L32) |
| /restaurateurs/:city | 2 | [src/App.tsx:680](../../src/App.tsx#L680) |
| /restaurateurs/alternative-commission-couvert | 16 | [scripts/prerender-seo.mjs:674](../../scripts/prerender-seo.mjs#L674) |
| /restaurateurs/geneve | 20 | [scripts/prerender-seo.mjs:609](../../scripts/prerender-seo.mjs#L609) |
| /restaurateurs/google-business | 17 | [scripts/prerender-seo.mjs:673](../../scripts/prerender-seo.mjs#L673) |
| /restaurateurs/lausanne | 1 | [src/test/route-serving-regression.test.ts:11](../../src/test/route-serving-regression.test.ts#L11) |
| /robots.txt | 5 | [supabase/functions/discover-thefork-official-sites/index.ts:348](../../supabase/functions/discover-thefork-official-sites/index.ts#L348) |
| /rpc/ | 1 | [src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx:106](../../src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx#L106) |
| /rpc/service_clear_marketing_auth_attempt | 4 | [src/test/marketing-bff-security.test.ts:372](../../src/test/marketing-bff-security.test.ts#L372) |
| /rpc/service_consume_marketing_auth_attempt | 10 | [src/test/marketing-agent-bff.test.ts:29](../../src/test/marketing-agent-bff.test.ts#L29) |
| /rpc/service_finalize_marketing_web_session | 1 | [src/test/marketing-bff-security.test.ts:597](../../src/test/marketing-bff-security.test.ts#L597) |
| /rpc/service_get_marketing_auth_challenge | 3 | [src/test/marketing-bff-security.test.ts:495](../../src/test/marketing-bff-security.test.ts#L495) |
| /rpc/service_get_marketing_web_session | 2 | [src/test/marketing-agent-bff.test.ts:24](../../src/test/marketing-agent-bff.test.ts#L24) |
| /rpc/service_revoke_marketing_web_session | 1 | [src/test/marketing-bff-security.test.ts:610](../../src/test/marketing-bff-security.test.ts#L610) |
| /rpc/service_store_marketing_auth_challenge | 7 | [src/test/marketing-bff-security.test.ts:263](../../src/test/marketing-bff-security.test.ts#L263) |
| /secrets | 1 | [src/test/production-preflight-hardening.test.ts:205](../../src/test/production-preflight-hardening.test.ts#L205) |
| /setWebhook | 1 | [src/test/incident-secret-sync-readiness.test.ts:58](../../src/test/incident-secret-sync-readiness.test.ts#L58) |
| /sitemap-index.xml | 1 | [src/test/seo-indexation-hardening.test.ts:259](../../src/test/seo-indexation-hardening.test.ts#L259) |
| /sitemap-seo.xml | 1 | [src/test/seo-indexation-hardening.test.ts:259](../../src/test/seo-indexation-hardening.test.ts#L259) |
| /sitemap.xml | 1 | [src/test/seo-indexation-hardening.test.ts:262](../../src/test/seo-indexation-hardening.test.ts#L262) |
| /sitemap_index.xml | 1 | [src/test/seo-indexation-hardening.test.ts:259](../../src/test/seo-indexation-hardening.test.ts#L259) |
| /src/main.tsx | 1 | [src/test/pwa-manifest.test.ts:53](../../src/test/pwa-manifest.test.ts#L53) |
| /src/pages/CommercialProspection.tsx | 1 | [scripts/check-commercial-map.mjs:37](../../scripts/check-commercial-map.mjs#L37) |
| /src/pages/dashboard/DashboardCampagnes.tsx | 1 | [scripts/check-campaign-layout.mjs:54](../../scripts/check-campaign-layout.mjs#L54) |
| /storage/v1/object | 2 | [src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx:104](../../src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx#L104) |
| /storage/v1/object/ | 1 | [supabase/functions/_shared/print/pdf.ts:84](../../supabase/functions/_shared/print/pdf.ts#L84) |
| /storage/v1/object/public/ | 2 | [src/lib/optimizedImages.ts:27](../../src/lib/optimizedImages.ts#L27) |
| /storage/v1/object/sign/commercial-demo-ai/ | 1 | [src/pages/dashboard/DashboardPhotos.tsx:87](../../src/pages/dashboard/DashboardPhotos.tsx#L87) |
| /storage/v1/render/image/public/ | 1 | [src/lib/optimizedImages.ts:35](../../src/lib/optimizedImages.ts#L35) |
| /stripe-subscription-reconcile | 1 | [src/test/audit-remediation.test.ts:46](../../src/test/audit-remediation.test.ts#L46) |
| /support | 1 | [supabase/functions/tok-connect-full-app-mcp/index.ts:228](../../supabase/functions/tok-connect-full-app-mcp/index.ts#L228) |
| /this-route-does-not-exist | 1 | [src/test/route-serving-regression.test.ts:14](../../src/test/route-serving-regression.test.ts#L14) |
| /tok-connect | 11 | [scripts/prerender-seo.mjs:555](../../scripts/prerender-seo.mjs#L555) |
| /tok-connect-api | 1 | [supabase/functions/tok-connect-api/index.ts:89](../../supabase/functions/tok-connect-api/index.ts#L89) |
| /tok-connect/developer | 12 | [scripts/prerender-seo.mjs:1228](../../scripts/prerender-seo.mjs#L1228) |
| /tok-connect/developer/:path* | 2 | [src/test/vercel-rewrites.test.ts:117](../../src/test/vercel-rewrites.test.ts#L117) |
| /tok-connect/mcp-widget | 5 | [src/App.tsx:599](../../src/App.tsx#L599) |
| /tok-one | 23 | [scripts/prerender-seo.mjs:547](../../scripts/prerender-seo.mjs#L547) |
| /tok-one?status=success | 1 | [src/test/security-url-helpers.test.ts:62](../../src/test/security-url-helpers.test.ts#L62) |
| /tok-pulse | 10 | [scripts/prerender-seo.mjs:1191](../../scripts/prerender-seo.mjs#L1191) |
| /tok-reference-food-webp | 1 | [supabase/functions/ai-image-enhance/index.ts:81](../../supabase/functions/ai-image-enhance/index.ts#L81) |
| /tok-slot-machine/index.html?v=20260719 | 1 | [src/components/DailyMiamzSlotMachine.tsx:15](../../src/components/DailyMiamzSlotMachine.tsx#L15) |
| /token?grant_type=password | 1 | [server/marketingBff.ts:728](../../server/marketingBff.ts#L728) |
| /user | 1 | [server/marketingBff.ts:717](../../server/marketingBff.ts#L717) |
| /user_roles? | 2 | [src/test/marketing-agent-bff.test.ts:28](../../src/test/marketing-agent-bff.test.ts#L28) |
| /users/[email] | 1 | [src/test/monitoring-consent.test.ts:313](../../src/test/monitoring-consent.test.ts#L313) |
| /users/private%40example.test#token | 1 | [src/test/monitoring-consent.test.ts:313](../../src/test/monitoring-consent.test.ts#L313) |
| /v1/appScreenshotSets | 1 | [scripts/app-store-connect-upload-screenshots.mjs:216](../../scripts/app-store-connect-upload-screenshots.mjs#L216) |
| /v1/appScreenshots | 1 | [scripts/app-store-connect-upload-screenshots.mjs:283](../../scripts/app-store-connect-upload-screenshots.mjs#L283) |
| /v1/appStoreReviewDetails | 1 | [scripts/app-store-connect-finalize-v1.mjs:248](../../scripts/app-store-connect-finalize-v1.mjs#L248) |
| /v1/appStoreVersionSubmissions | 1 | [scripts/app-store-connect-finalize-v1.mjs:363](../../scripts/app-store-connect-finalize-v1.mjs#L363) |
| /v1/apps | 2 | [scripts/app-store-connect-preflight.mjs:75](../../scripts/app-store-connect-preflight.mjs#L75) |
| /v1/autopilot/plan | 4 | [src/lib/tokConnect.ts:160](../../src/lib/tokConnect.ts#L160) |
| /v1/campaigns/preview | 4 | [src/lib/tokConnect.ts:154](../../src/lib/tokConnect.ts#L154) |
| /v1/credits/balance | 3 | [src/lib/tokConnect.ts:148](../../src/lib/tokConnect.ts#L148) |
| /v1/projects/${encodeURIComponent(projectRef)}/database/query | 1 | [src/test/commercial-demo-migration-workflow.test.ts:34](../../src/test/commercial-demo-migration-workflow.test.ts#L34) |
| /v1/projects/${projectRef}/config/auth | 1 | [src/test/plan-phase1-readiness.test.ts:100](../../src/test/plan-phase1-readiness.test.ts#L100) |
| /v1/reservations | 5 | [src/lib/tokConnect.ts:130](../../src/lib/tokConnect.ts#L130) |
| /v1/reservations/preview | 4 | [src/lib/tokConnect.ts:124](../../src/lib/tokConnect.ts#L124) |
| /v1/reservations/{id}/cancel | 3 | [src/lib/tokConnect.ts:142](../../src/lib/tokConnect.ts#L142) |
| /v1/reservations/{id}/cancel/preview | 2 | [src/lib/tokConnect.ts:136](../../src/lib/tokConnect.ts#L136) |
| /v1/restaurants | 5 | [src/lib/tokConnect.ts:100](../../src/lib/tokConnect.ts#L100) |
| /v1/restaurants/{id} | 2 | [src/lib/tokConnect.ts:106](../../src/lib/tokConnect.ts#L106) |
| /v1/restaurants/{id}/availability | 2 | [src/lib/tokConnect.ts:118](../../src/lib/tokConnect.ts#L118) |
| /v1/restaurants/{id}/menu | 2 | [src/lib/tokConnect.ts:112](../../src/lib/tokConnect.ts#L112) |
| /v1/reviewSubmissionItems | 2 | [scripts/app-store-availability-submit-v5.mjs:203](../../scripts/app-store-availability-submit-v5.mjs#L203) |
| /v1/reviewSubmissions | 2 | [scripts/app-store-availability-submit-v5.mjs:180](../../scripts/app-store-availability-submit-v5.mjs#L180) |
| /v1/territories?limit=200 | 1 | [scripts/app-store-availability-submit-v5.mjs:91](../../scripts/app-store-availability-submit-v5.mjs#L91) |
| /v2/appAvailabilities | 2 | [scripts/app-store-availability-submit-v5.mjs:120](../../scripts/app-store-availability-submit-v5.mjs#L120) |
| /v3/BatchAvailabilityLookup/ | 2 | [src/test/google-actions-center-readiness.test.ts:47](../../src/test/google-actions-center-readiness.test.ts#L47) |
| /v3/CreateBooking/ | 3 | [src/test/application-search-index.test.ts:79](../../src/test/application-search-index.test.ts#L79) |
| /v3/GetBookingStatus/ | 2 | [src/test/google-actions-center-readiness.test.ts:50](../../src/test/google-actions-center-readiness.test.ts#L50) |
| /v3/HealthCheck/ | 4 | [src/test/application-search-index.test.ts:166](../../src/test/application-search-index.test.ts#L166) |
| /v3/ListBookings/ | 2 | [src/test/google-actions-center-readiness.test.ts:51](../../src/test/google-actions-center-readiness.test.ts#L51) |
| /v3/UpdateBooking/ | 2 | [src/test/google-actions-center-readiness.test.ts:49](../../src/test/google-actions-center-readiness.test.ts#L49) |
| /v3/feeds/availability | 2 | [src/test/google-actions-center-readiness.test.ts:99](../../src/test/google-actions-center-readiness.test.ts#L99) |
| /v3/feeds/availability/ | 3 | [scripts/google-actions-center-export-feeds.mjs:22](../../scripts/google-actions-center-export-feeds.mjs#L22) |
| /v3/feeds/availability/?limit=25&days=30 | 1 | [src/test/google-actions-center-feed-exporter.test.ts:115](../../src/test/google-actions-center-feed-exporter.test.ts#L115) |
| /v3/feeds/merchants | 2 | [src/test/google-actions-center-readiness.test.ts:97](../../src/test/google-actions-center-readiness.test.ts#L97) |
| /v3/feeds/merchants/ | 3 | [scripts/google-actions-center-export-feeds.mjs:10](../../scripts/google-actions-center-export-feeds.mjs#L10) |
| /v3/feeds/merchants/?limit=25 | 1 | [src/test/google-actions-center-feed-exporter.test.ts:113](../../src/test/google-actions-center-feed-exporter.test.ts#L113) |
| /v3/feeds/services | 2 | [src/test/google-actions-center-readiness.test.ts:98](../../src/test/google-actions-center-readiness.test.ts#L98) |
| /v3/feeds/services/ | 3 | [scripts/google-actions-center-export-feeds.mjs:16](../../scripts/google-actions-center-export-feeds.mjs#L16) |
| /v3/feeds/services/?limit=25 | 1 | [src/test/google-actions-center-feed-exporter.test.ts:114](../../src/test/google-actions-center-feed-exporter.test.ts#L114) |
| /ventes-flash | 19 | [scripts/prerender-seo.mjs:341](../../scripts/prerender-seo.mjs#L341) |
| /webhooks/tok | 4 | [src/lib/tokConnect.ts:169](../../src/lib/tokConnect.ts#L169) |
| /workers/image-ai-worker | 1 | [scripts/dependabot-policy.test.mjs:40](../../scripts/dependabot-policy.test.mjs#L40) |
| /zero-attente | 18 | [scripts/prerender-seo.mjs:675](../../scripts/prerender-seo.mjs#L675) |
| /zero-attente?restaurant=restaurant-123&date=2026-06-20&time=20%3A15&party_size=4 | 1 | [src/test/zero-attente-reservation-context.test.ts:15](../../src/test/zero-attente-reservation-context.test.ts#L15) |

### Paramètres d’URL

| Paramètre | Routes associées | Occurrences | Première source |
| --- | --- | --- | --- |
| apiKey | — | 1 | [src/lib/push.ts:81](../../src/lib/push.ts#L81) |
| appId | — | 1 | [src/lib/push.ts:84](../../src/lib/push.ts#L84) |
| appsecret_proof | — | 1 | [supabase/functions/_shared/meta-marketing-health.ts:25](../../supabase/functions/_shared/meta-marketing-health.ts#L25) |
| authorization_id | /oauth/consent | 2 | [src/lib/authPostLogin.ts:12](../../src/lib/authPostLogin.ts#L12) |
| campaign_checkout | /dashboard/actualites, /dashboard/campagnes | 4 | [src/pages/dashboard/DashboardActualites.tsx:285](../../src/pages/dashboard/DashboardActualites.tsx#L285) |
| campaign_id | /dashboard/actualites, /dashboard/campagnes | 3 | [src/pages/dashboard/DashboardActualites.tsx:305](../../src/pages/dashboard/DashboardActualites.tsx#L305) |
| channel | — | 1 | [src/marketing/useMarketingUrlState.ts:82](../../src/marketing/useMarketingUrlState.ts#L82) |
| checkout_kind | /dashboard/mon-compte-facturation | 1 | [src/pages/dashboard/DashboardAccountBilling.tsx:846](../../src/pages/dashboard/DashboardAccountBilling.tsx#L846) |
| city | /recherche, /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 5 | [src/pages/Recherche.tsx:241](../../src/pages/Recherche.tsx#L241) |
| claimAddress | — | 2 | [src/components/DirectoryRestaurantOwnershipNotice.tsx:83](../../src/components/DirectoryRestaurantOwnershipNotice.tsx#L83) |
| claimCity | — | 2 | [src/components/DirectoryRestaurantOwnershipNotice.tsx:82](../../src/components/DirectoryRestaurantOwnershipNotice.tsx#L82) |
| claimName | — | 2 | [src/components/DirectoryRestaurantOwnershipNotice.tsx:84](../../src/components/DirectoryRestaurantOwnershipNotice.tsx#L84) |
| claimPhone | — | 2 | [src/components/DirectoryRestaurantOwnershipNotice.tsx:81](../../src/components/DirectoryRestaurantOwnershipNotice.tsx#L81) |
| claimRestaurant | — | 2 | [src/components/DirectoryClaimPersistenceBridge.tsx:37](../../src/components/DirectoryClaimPersistenceBridge.tsx#L37) |
| client_id | — | 1 | [supabase/functions/tok-connect-oauth/index.ts:220](../../supabase/functions/tok-connect-oauth/index.ts#L220) |
| code | — | 1 | [supabase/functions/tok-connect-oauth/index.ts:250](../../supabase/functions/tok-connect-oauth/index.ts#L250) |
| commercialReferral | /auth, /auth/callback, /auth/demo, /commercial | 4 | [src/pages/Auth.tsx:906](../../src/pages/Auth.tsx#L906) |
| commercialUserId | /commercial/comptabilite | 1 | [src/pages/CommercialComptabilite.tsx:280](../../src/pages/CommercialComptabilite.tsx#L280) |
| confirmed | /auth, /auth/callback, /auth/demo | 2 | [src/pages/Auth.tsx:131](../../src/pages/Auth.tsx#L131) |
| cuisine | /recherche, /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 3 | [src/pages/Recherche.tsx:240](../../src/pages/Recherche.tsx#L240) |
| cursor | /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 1 | [supabase/functions/tok-connect-api/index.ts:210](../../supabase/functions/tok-connect-api/index.ts#L210) |
| date | /restaurant/:id, /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 3 | [src/lib/zeroAttenteReservationContext.ts:76](../../src/lib/zeroAttenteReservationContext.ts#L76) |
| days | — | 1 | [scripts/google-actions-center-export-feeds.mjs:55](../../scripts/google-actions-center-export-feeds.mjs#L55) |
| delivery | /recherche | 1 | [src/pages/Recherche.tsx:244](../../src/pages/Recherche.tsx#L244) |
| demo_checkout | — | 4 | [src/components/commercial/CommercialMultiSpaceDemo.tsx:85](../../src/components/commercial/CommercialMultiSpaceDemo.tsx#L85) |
| demo_session_id | — | 4 | [src/components/commercial/CommercialDemoActorWorkspace.tsx:88](../../src/components/commercial/CommercialDemoActorWorkspace.tsx#L88) |
| domain | /auth, /auth/callback, /auth/demo | 1 | [src/pages/Auth.tsx:2312](../../src/pages/Auth.tsx#L2312) |
| email | /coming-soon | 1 | [src/pages/ComingSoon.tsx:20](../../src/pages/ComingSoon.tsx#L20) |
| fields | — | 1 | [supabase/functions/_shared/meta-marketing-health.ts:24](../../supabase/functions/_shared/meta-marketing-health.ts#L24) |
| fields[appScreenshotSets] | — | 1 | [scripts/app-store-connect-upload-screenshots.mjs:205](../../scripts/app-store-connect-upload-screenshots.mjs#L205) |
| fields[appScreenshots] | — | 2 | [scripts/app-store-connect-upload-screenshots.mjs:237](../../scripts/app-store-connect-upload-screenshots.mjs#L237) |
| fields[appStoreVersionLocalizations] | — | 1 | [scripts/app-store-connect-upload-screenshots.mjs:188](../../scripts/app-store-connect-upload-screenshots.mjs#L188) |
| fields[appStoreVersions] | — | 1 | [scripts/app-store-connect-upload-screenshots.mjs:162](../../scripts/app-store-connect-upload-screenshots.mjs#L162) |
| filter[bundleId] | — | 2 | [scripts/app-store-connect-preflight.mjs:76](../../scripts/app-store-connect-preflight.mjs#L76) |
| filter[platform] | — | 1 | [scripts/app-store-connect-upload-screenshots.mjs:160](../../scripts/app-store-connect-upload-screenshots.mjs#L160) |
| format | — | 1 | [src/lib/optimizedImages.ts:41](../../src/lib/optimizedImages.ts#L41) |
| from | — | 1 | [src/marketing/useMarketingUrlState.ts:91](../../src/marketing/useMarketingUrlState.ts#L91) |
| height | — | 1 | [src/lib/optimizedImages.ts:38](../../src/lib/optimizedImages.ts#L38) |
| incident | /admin/guardian, /admin/sinistres, /admin/support-resolution | 4 | [src/pages/admin/AdminGuardian.tsx:105](../../src/pages/admin/AdminGuardian.tsx#L105) |
| job | /courier/jobs | 1 | [src/pages/courier/CourierJobs.tsx:54](../../src/pages/courier/CourierJobs.tsx#L54) |
| lat | /restaurants-pres/:venueSlug, /restaurants/:city, /restaurants/:city/:category, /restaurants/:city/r/:restaurantSlug | 2 | [src/pages/LocalRestaurants.tsx:475](../../src/pages/LocalRestaurants.tsx#L475) |
| limit | /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 13 | [scripts/app-store-connect-preflight.mjs:77](../../scripts/app-store-connect-preflight.mjs#L77) |
| lng | /restaurants-pres/:venueSlug, /restaurants/:city, /restaurants/:city/:category, /restaurants/:city/r/:restaurantSlug | 1 | [src/pages/LocalRestaurants.tsx:478](../../src/pages/LocalRestaurants.tsx#L478) |
| lon | — | 1 | [src/test/address-autocomplete-location-bias.test.tsx:78](../../src/test/address-autocomplete-location-bias.test.tsx#L78) |
| match_group_authorized | /match-groupes | 2 | [src/pages/MatchGroupes.tsx:389](../../src/pages/MatchGroupes.tsx#L389) |
| max_lat | — | 1 | [scripts/prerender-stoppin-restaurants-bounded.mjs:121](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L121) |
| max_lng | — | 1 | [scripts/prerender-stoppin-restaurants-bounded.mjs:123](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L123) |
| member_order_id | /match-groupes | 2 | [src/pages/MatchGroupes.tsx:390](../../src/pages/MatchGroupes.tsx#L390) |
| messagingSenderId | — | 1 | [src/lib/push.ts:83](../../src/lib/push.ts#L83) |
| min_lat | — | 1 | [scripts/prerender-stoppin-restaurants-bounded.mjs:120](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L120) |
| min_lng | — | 1 | [scripts/prerender-stoppin-restaurants-bounded.mjs:122](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L122) |
| mode | /auth, /auth/callback, /auth/demo, /recherche | 3 | [src/pages/Auth.tsx:948](../../src/pages/Auth.tsx#L948) |
| offset | — | 3 | [scripts/prerender-stoppin-restaurants-bounded.mjs:118](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L118) |
| on_conflict | — | 1 | [scripts/restaurant-image-truth-worker.mjs:548](../../scripts/restaurant-image-truth-worker.mjs#L548) |
| open | /restaurant/:id | 2 | [src/pages/RestaurantDetail.tsx:148](../../src/pages/RestaurantDetail.tsx#L148) |
| operation | /admin/commandes-reservations | 2 | [src/pages/admin/AdminOperationsCenter.tsx:65](../../src/pages/admin/AdminOperationsCenter.tsx#L65) |
| order | /courier/jobs, /dashboard/commandes, /recherche | 3 | [src/pages/Recherche.tsx:250](../../src/pages/Recherche.tsx#L250) |
| page | — | 1 | [src/marketing/useMarketingUrlState.ts:90](../../src/marketing/useMarketingUrlState.ts#L90) |
| partySize | — | 1 | [src/lib/zeroAttenteReservationContext.ts:78](../../src/lib/zeroAttenteReservationContext.ts#L78) |
| party_size | /restaurant/:id, /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 3 | [src/lib/zeroAttenteReservationContext.ts:78](../../src/lib/zeroAttenteReservationContext.ts#L78) |
| payment_attempt_id | /dashboard, /dashboard/mon-compte-facturation, /tok-one, /zero-attente | 8 | [src/lib/iosCommerceFetch.ts:138](../../src/lib/iosCommerceFetch.ts#L138) |
| place | /restaurants-pres/:venueSlug, /restaurants/:city, /restaurants/:city/:category, /restaurants/:city/r/:restaurantSlug | 1 | [src/pages/LocalRestaurants.tsx:473](../../src/pages/LocalRestaurants.tsx#L473) |
| post | /actualites | 1 | [src/pages/Actualites.tsx:261](../../src/pages/Actualites.tsx#L261) |
| post_id | /dashboard/actualites | 1 | [src/pages/dashboard/DashboardActualites.tsx:306](../../src/pages/dashboard/DashboardActualites.tsx#L306) |
| price | /recherche | 1 | [src/pages/Recherche.tsx:243](../../src/pages/Recherche.tsx#L243) |
| print_order_id | — | 1 | [supabase/functions/print-sandbox-complete/index.ts:38](../../supabase/functions/print-sandbox-complete/index.ts#L38) |
| progressiveOfferId | /restaurant/:id | 3 | [src/pages/RestaurantDetail.tsx:288](../../src/pages/RestaurantDetail.tsx#L288) |
| projectId | — | 1 | [src/lib/push.ts:82](../../src/lib/push.ts#L82) |
| promo | /recherche | 1 | [src/pages/Recherche.tsx:242](../../src/pages/Recherche.tsx#L242) |
| q | /recherche | 4 | [src/marketing/useMarketingUrlState.ts:85](../../src/marketing/useMarketingUrlState.ts#L85) |
| quality | — | 1 | [src/lib/optimizedImages.ts:39](../../src/lib/optimizedImages.ts#L39) |
| rating | /recherche | 1 | [src/pages/Recherche.tsx:245](../../src/pages/Recherche.tsx#L245) |
| redirect | /auth, /auth/callback, /auth/demo | 1 | [src/pages/Auth.tsx:1108](../../src/pages/Auth.tsx#L1108) |
| redirect_uri | — | 1 | [supabase/functions/tok-connect-oauth/index.ts:221](../../supabase/functions/tok-connect-oauth/index.ts#L221) |
| removeRestaurant | — | 1 | [src/components/DirectoryRestaurantOwnershipNotice.tsx:171](../../src/components/DirectoryRestaurantOwnershipNotice.tsx#L171) |
| reservation | /dashboard/reservations, /reservations | 2 | [src/pages/Reservations.tsx:230](../../src/pages/Reservations.tsx#L230) |
| reservationStep | /restaurant/:id | 1 | [src/pages/RestaurantDetail.tsx:153](../../src/pages/RestaurantDetail.tsx#L153) |
| reserve | /restaurant/:id | 1 | [src/pages/RestaurantDetail.tsx:149](../../src/pages/RestaurantDetail.tsx#L149) |
| resize | — | 1 | [src/lib/optimizedImages.ts:40](../../src/lib/optimizedImages.ts#L40) |
| response_type | — | 1 | [supabase/functions/tok-connect-oauth/index.ts:219](../../supabase/functions/tok-connect-oauth/index.ts#L219) |
| restaurant | /zero-attente | 1 | [src/pages/ZeroAttente.tsx:136](../../src/pages/ZeroAttente.tsx#L136) |
| restaurant_id | /v1/autopilot/plan, /v1/campaigns/preview, /v1/credits/balance, /v1/reservations, /v1/reservations/:id/cancel, /v1/reservations/:id/cancel/preview, /v1/reservations/preview, /v1/restaurants, /v1/restaurants/:id, /v1/restaurants/:id/availability, /v1/restaurants/:id/menu | 1 | [supabase/functions/tok-connect-api/index.ts:813](../../supabase/functions/tok-connect-api/index.ts#L813) |
| scope | /actualites | 3 | [src/pages/Actualites.tsx:249](../../src/pages/Actualites.tsx#L249) |
| session_id | /chefs-table, /dashboard/actualites, /dashboard/campagnes, /dashboard/mon-compte-facturation, /tok-one, /zero-attente | 8 | [src/pages/ChefsTable.tsx:691](../../src/pages/ChefsTable.tsx#L691) |
| signup_operation_id | /auth, /auth/callback, /auth/demo | 2 | [src/pages/Auth.tsx:133](../../src/pages/Auth.tsx#L133) |
| slug | — | 1 | [scripts/prerender-stoppin-restaurants-bounded.mjs:172](../../scripts/prerender-stoppin-restaurants-bounded.mjs#L172) |
| sort | /recherche | 1 | [src/pages/Recherche.tsx:249](../../src/pages/Recherche.tsx#L249) |
| source | /mon-espace | 1 | [public/manifest.json:50](../../public/manifest.json#L50) |
| state | — | 2 | [supabase/functions/tok-connect-oauth/index.ts:222](../../supabase/functions/tok-connect-oauth/index.ts#L222) |
| status | /chefs-table, /dashboard, /dashboard/actualites, /dashboard/campagnes, /dashboard/mon-compte-facturation, /tok-one, /zero-attente | 12 | [src/lib/iosCommerceFetch.ts:137](../../src/lib/iosCommerceFetch.ts#L137) |
| stripe_session_id | — | 4 | [src/components/commercial/CommercialMultiSpaceDemo.tsx:81](../../src/components/commercial/CommercialMultiSpaceDemo.tsx#L81) |
| subscriptionPlan | /auth, /auth/callback, /auth/demo, /commercial | 2 | [src/pages/Auth.tsx:917](../../src/pages/Auth.tsx#L917) |
| tab | /admin/commandes-reservations, /admin/utilisateurs, /profil | 9 | [src/pages/Profil.tsx:178](../../src/pages/Profil.tsx#L178) |
| ticket | /admin/sinistres | 2 | [src/pages/admin/AdminSinistres.tsx:874](../../src/pages/admin/AdminSinistres.tsx#L874) |
| time | /restaurant/:id | 2 | [src/lib/zeroAttenteReservationContext.ts:77](../../src/lib/zeroAttenteReservationContext.ts#L77) |
| to | — | 1 | [src/marketing/useMarketingUrlState.ts:92](../../src/marketing/useMarketingUrlState.ts#L92) |
| tok_connect_route | — | 4 | [supabase/functions/tok-connect-chatgpt/index.ts:504](../../supabase/functions/tok-connect-chatgpt/index.ts#L504) |
| token | — | 1 | [supabase/functions/marketing-unsubscribe/index.ts:66](../../supabase/functions/marketing-unsubscribe/index.ts#L66) |
| type | /auth, /auth/callback, /auth/demo, /commercial | 2 | [src/pages/Auth.tsx:285](../../src/pages/Auth.tsx#L285) |
| utm_medium | /restaurant/:id | 2 | [src/components/ReservationDialog.tsx:598](../../src/components/ReservationDialog.tsx#L598) |
| utm_source | /restaurant/:id | 2 | [src/components/ReservationDialog.tsx:594](../../src/components/ReservationDialog.tsx#L594) |
| view | /admin/commandes-reservations | 2 | [src/marketing/useMarketingUrlState.ts:84](../../src/marketing/useMarketingUrlState.ts#L84) |
| welcome | /coming-soon | 1 | [src/pages/ComingSoon.tsx:9](../../src/pages/ComingSoon.tsx#L9) |
| width | — | 1 | [src/lib/optimizedImages.ts:37](../../src/lib/optimizedImages.ts#L37) |

## Routes SEO générées au build

Ces contrats décrivent les familles statiquement détectables. Le nombre exact de fichiers HTML, leur état index/noindex et les aliases Stoppin dépendent des données disponibles pendant `build:prod`; ils ne sont donc pas présentés comme une preuve de production.

| Route ou famille | Type | Indexabilité | Source |
| --- | --- | --- | --- |
| /:param1 | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1233](../../scripts/prerender-seo.mjs#L1233) |
| /actualites/:id | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1842](../../scripts/prerender-seo.mjs#L1842) |
| /restaurant/:id | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1293](../../scripts/prerender-seo.mjs#L1293) |
| /restaurants/:citySlug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1627](../../scripts/prerender-seo.mjs#L1627) |
| /restaurants/:citySlug/:cuisineSlug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1615](../../scripts/prerender-seo.mjs#L1615) |
| /restaurants/:citySlug/:districtSlug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:329](../../scripts/prerender-seo.mjs#L329) |
| /restaurants/:citySlug/:slug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:313](../../scripts/prerender-seo.mjs#L313) |
| /restaurants/:citySlug/r/:restaurantSlug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:1290](../../scripts/prerender-seo.mjs#L1290) |
| /restaurants/:slug | dynamic-template | data-dependent | [scripts/prerender-seo.mjs:392](../../scripts/prerender-seo.mjs#L392) |
| / | static | data-dependent | [scripts/prerender-seo.mjs:456](../../scripts/prerender-seo.mjs#L456) |
| /a-propos | static | data-dependent | [scripts/prerender-seo.mjs:1065](../../scripts/prerender-seo.mjs#L1065) |
| /abonnement | static | data-dependent | [scripts/prerender-seo.mjs:1001](../../scripts/prerender-seo.mjs#L1001) |
| /actualites | static | data-dependent | [scripts/prerender-seo.mjs:514](../../scripts/prerender-seo.mjs#L514) |
| /aide | static | data-dependent | [scripts/prerender-seo.mjs:1081](../../scripts/prerender-seo.mjs#L1081) |
| /anti-gaspi | static | data-dependent | [scripts/prerender-seo.mjs:531](../../scripts/prerender-seo.mjs#L531) |
| /budget-auto | static | data-dependent | [scripts/prerender-seo.mjs:1025](../../scripts/prerender-seo.mjs#L1025) |
| /cgu | static | data-dependent | [scripts/prerender-seo.mjs:1170](../../scripts/prerender-seo.mjs#L1170) |
| /chefs-table | static | data-dependent | [scripts/prerender-seo.mjs:993](../../scripts/prerender-seo.mjs#L993) |
| /conditions-restaurateurs | static | data-dependent | [scripts/prerender-seo.mjs:1184](../../scripts/prerender-seo.mjs#L1184) |
| /contact | static | data-dependent | [scripts/prerender-seo.mjs:1073](../../scripts/prerender-seo.mjs#L1073) |
| /cookies | static | data-dependent | [scripts/prerender-seo.mjs:1177](../../scripts/prerender-seo.mjs#L1177) |
| /creneaux-garantis | static | data-dependent | [scripts/prerender-seo.mjs:1009](../../scripts/prerender-seo.mjs#L1009) |
| /flex-prix-bas | static | data-dependent | [scripts/prerender-seo.mjs:1057](../../scripts/prerender-seo.mjs#L1057) |
| /garantie-qualite | static | data-dependent | [scripts/prerender-seo.mjs:1017](../../scripts/prerender-seo.mjs#L1017) |
| /match-groupes | static | data-dependent | [scripts/prerender-seo.mjs:1049](../../scripts/prerender-seo.mjs#L1049) |
| /miamz-solidaires | static | data-dependent | [scripts/prerender-seo.mjs:563](../../scripts/prerender-seo.mjs#L563) |
| /multi-restaurant | static | data-dependent | [scripts/prerender-seo.mjs:1033](../../scripts/prerender-seo.mjs#L1033) |
| /multi-stop | static | data-dependent | [scripts/prerender-seo.mjs:1041](../../scripts/prerender-seo.mjs#L1041) |
| /packs-restaurateur | static | data-dependent | [scripts/prerender-seo.mjs:594](../../scripts/prerender-seo.mjs#L594) |
| /politique-confidentialite | static | data-dependent | [scripts/prerender-seo.mjs:1199](../../scripts/prerender-seo.mjs#L1199) |
| /recherche | static | data-dependent | [scripts/prerender-seo.mjs:506](../../scripts/prerender-seo.mjs#L506) |
| /restaurateurs/alternative-commission-couvert | static | data-dependent | [scripts/prerender-seo.mjs:867](../../scripts/prerender-seo.mjs#L867) |
| /restaurateurs/geneve | static | data-dependent | [scripts/prerender-seo.mjs:609](../../scripts/prerender-seo.mjs#L609) |
| /restaurateurs/google-business | static | data-dependent | [scripts/prerender-seo.mjs:740](../../scripts/prerender-seo.mjs#L740) |
| /tok-connect | static | data-dependent | [scripts/prerender-seo.mjs:555](../../scripts/prerender-seo.mjs#L555) |
| /tok-one | static | data-dependent | [scripts/prerender-seo.mjs:547](../../scripts/prerender-seo.mjs#L547) |
| /tok-pulse | static | data-dependent | [scripts/prerender-seo.mjs:1191](../../scripts/prerender-seo.mjs#L1191) |
| /ventes-flash | static | data-dependent | [scripts/prerender-seo.mjs:539](../../scripts/prerender-seo.mjs#L539) |
| /zero-attente | static | data-dependent | [scripts/prerender-seo.mjs:985](../../scripts/prerender-seo.mjs#L985) |

### Artefacts de routage générés

| Artefact | Versionné | Générateur | Limite de preuve |
| --- | --- | --- | --- |
| dist/**/index.html | non | [scripts/prerender-seo.mjs](../../scripts/prerender-seo.mjs) | Inventaire HTML exact dépendant des données disponibles pendant build:prod. |
| .vercel/stoppin-venue-redirects.json | non | [scripts/apply-stoppin-venue-redirects.mjs](../../scripts/apply-stoppin-venue-redirects.mjs) | Redirections d’alias Stoppin calculées et validées pendant build:prod. |

## Flags fonctionnels

| Nom | Libellé | Groupe | Défaut | Routes | Dépendances | Description | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| payment-card | Paiement carte | payments | true | — | — | Active les paiements carte bancaire dans les parcours checkout et campagnes. | [src/lib/featureCatalog.ts:76](../../src/lib/featureCatalog.ts#L76) |
| payment-twint | Paiement TWINT | payments | true | — | — | Active TWINT dans les parcours checkout et campagnes. | [src/lib/featureCatalog.ts:84](../../src/lib/featureCatalog.ts#L84) |
| payment-postfinance-card | Paiement PostFinance Card | payments | false | — | — | Réservé : reste coupé tant que le parcours Stripe et les remboursements ne sont pas validés. | [src/lib/featureCatalog.ts:91](../../src/lib/featureCatalog.ts#L91) |
| payment-postfinance-efinance | Paiement PostFinance E-Finance | payments | false | — | — | Réservé : reste coupé tant que le parcours Stripe et les remboursements ne sont pas validés. | [src/lib/featureCatalog.ts:98](../../src/lib/featureCatalog.ts#L98) |
| payment-cash | Paiement espèces | payments | true | — | — | Autorise le règlement manuel ou sur place quand le parcours le permet. | [src/lib/featureCatalog.ts:105](../../src/lib/featureCatalog.ts#L105) |
| billing-fair-growth-annual | Facturation annuelle Fair Growth | payments | false | — | — | Autorise les engagements restaurateur de 12 mois factures au prix de 11 mois. Les quotas restent mensuels. | [src/lib/featureCatalog.ts:112](../../src/lib/featureCatalog.ts#L112) |
| commercial-demo-openai | OpenAI — démonstration commerciale | admin_tools | false | — | — | Coupe immédiatement les appels OpenAI de la vue multi-espace et du restaurant Démo. | [src/lib/featureCatalog.ts:120](../../src/lib/featureCatalog.ts#L120) |
| livraison | Livraison (désactivée) | journeys | false | — | — | Parcours dormant, masqué tant que le transport et l’espace coursier ne sont pas réactivés. | [src/lib/featureCatalog.ts:128](../../src/lib/featureCatalog.ts#L128) |
| emporter | Emporter | journeys | true | — | — | Active le retrait click & collect et les flux reliés. | [src/lib/featureCatalog.ts:136](../../src/lib/featureCatalog.ts#L136) |
| sur-place | Sur place | journeys | true | — | — | Active les expériences dine-in et les parcours associés. | [src/lib/featureCatalog.ts:144](../../src/lib/featureCatalog.ts#L144) |
| reservation | Reservation | journeys | true | /reservations | — | Active les réservations côté client, restaurateur et leurs routes dédiées. | [src/lib/featureCatalog.ts:151](../../src/lib/featureCatalog.ts#L151) |
| commandes | Commandes | journeys | true | /commandes, /commande/confirmation, /commande/:id | livraison, emporter | Expose l'historique client et le suivi des commandes du dashboard restaurateur. | [src/lib/featureCatalog.ts:160](../../src/lib/featureCatalog.ts#L160) |
| anti-gaspi | Anti-gaspi | client_features | true | /anti-gaspi | emporter | Active les offres anti-gaspi côté client et restaurateur. | [src/lib/featureCatalog.ts:169](../../src/lib/featureCatalog.ts#L169) |
| ventes-flash | Ventes flash | client_features | true | /ventes-flash | — | Active les drops time-boxes et les ecrans associés. | [src/lib/featureCatalog.ts:178](../../src/lib/featureCatalog.ts#L178) |
| actualites-sociales | Actualités sociales | client_features | true | /actualites | — | Active le fil social client dédié aux restaurants. | [src/lib/featureCatalog.ts:186](../../src/lib/featureCatalog.ts#L186) |
| tok-pulse | TOK Pulse | client_features | true | /tok-pulse | — | Widget iPhone natif TOK Pulse et raccourcis mobiles alimentés par les données publiques TOK. | [src/lib/featureCatalog.ts:194](../../src/lib/featureCatalog.ts#L194) |
| creneaux-garantis | Créneaux garantis | client_features | false | /creneaux-garantis | livraison | Active la promesse de livraison ponctuelle ou remboursée. | [src/lib/featureCatalog.ts:202](../../src/lib/featureCatalog.ts#L202) |
| flex-prix-bas | Offres | client_features | false | /flex-prix-bas | livraison | Active l'expérience de fenêtre flexible a prix reduit. | [src/lib/featureCatalog.ts:211](../../src/lib/featureCatalog.ts#L211) |
| match-groupes | Match groupes | client_features | false | /match-groupes | livraison | Active la commande groupée mutualisee. | [src/lib/featureCatalog.ts:220](../../src/lib/featureCatalog.ts#L220) |
| multi-stop | Multi-stop | client_features | false | /multi-stop | livraison | Active un trajet unique vers plusieurs adresses. | [src/lib/featureCatalog.ts:229](../../src/lib/featureCatalog.ts#L229) |
| multi-restaurant | Multi-restos | client_features | true | /multi-restaurant | livraison, emporter | Active les paniers composes de plusieurs restaurants. | [src/lib/featureCatalog.ts:238](../../src/lib/featureCatalog.ts#L238) |
| chefs-table | La Table du Chef | client_features | true | /chefs-table | — | Active les expériences exclusives et leurs pages associées. | [src/lib/featureCatalog.ts:247](../../src/lib/featureCatalog.ts#L247) |
| zero-attente | Zéro attente | client_features | true | /zero-attente | reservation, sur-place | Active la précommande synchronisée sur réservation payée. | [src/lib/featureCatalog.ts:255](../../src/lib/featureCatalog.ts#L255) |
| garantie-qualite | Garantie qualité | client_features | false | /garantie-qualite | livraison | Active la garantie chaud ou remboursé. | [src/lib/featureCatalog.ts:264](../../src/lib/featureCatalog.ts#L264) |
| budget-auto | Budget auto | client_features | true | /budget-auto | — | Active les menus optimisés par objectifs. | [src/lib/featureCatalog.ts:273](../../src/lib/featureCatalog.ts#L273) |
| abonnement | Abonnement | client_features | false | /abonnement | livraison | Active les repas récurrents planifiés. | [src/lib/featureCatalog.ts:281](../../src/lib/featureCatalog.ts#L281) |
| tok-one | Tok One | client_features | true | /tok-one | — | Active la page d'abonnement premium Tok One. | [src/lib/featureCatalog.ts:290](../../src/lib/featureCatalog.ts#L290) |
| tok-connect | TOK Connect | client_features | true | /tok-connect, /tok-connect/developer, /tok-connect/mcp-widget | — | Active la page publique API, MCP et agents IA pour partenaires restaurants. | [src/lib/featureCatalog.ts:298](../../src/lib/featureCatalog.ts#L298) |
| tok-connect-api | TOK Connect API | client_features | true | — | tok-connect | Active l'API REST versionnee, OAuth client-credentials et les quotas partenaires. | [src/lib/featureCatalog.ts:306](../../src/lib/featureCatalog.ts#L306) |
| tok-connect-mcp | TOK Connect MCP | client_features | true | — | tok-connect | Active le serveur MCP prudent pour tools, resources et prompts sûrs. | [src/lib/featureCatalog.ts:314](../../src/lib/featureCatalog.ts#L314) |
| tok-connect-webhooks | TOK Connect Webhooks | client_features | true | — | tok-connect | Active les webhooks sortants signes pour partenaires approuves. | [src/lib/featureCatalog.ts:322](../../src/lib/featureCatalog.ts#L322) |
| tok-connect-autopilot | TOK Connect Autopilot | client_features | false | — | tok-connect | Garde les actions autonomes hors production v1. | [src/lib/featureCatalog.ts:330](../../src/lib/featureCatalog.ts#L330) |
| points-cadeau | Points cadeau | client_features | false | /points-cadeau | — | Active la page de fidélité et d'utilisation des points cadeau. | [src/lib/featureCatalog.ts:338](../../src/lib/featureCatalog.ts#L338) |
| customer-memory | TOK Customer Memory | client_features | true | /memoire-tok | — | Active la mémoire client explicite et consentie ainsi que son inférence IA. | [src/lib/featureCatalog.ts:346](../../src/lib/featureCatalog.ts#L346) |
| commercial-prospection | Prospection commerciale | admin_tools | true | /commercial, /commercial/prospection, /commercial/demo-live | — | Expose la carte terrain et le suivi des restaurants visités par les commerciaux TOK. | [src/lib/featureCatalog.ts:354](../../src/lib/featureCatalog.ts#L354) |
| campagnes-pub | Campagnes pub | restaurant_dashboard | true | — | — | Active les mises en avant sponsorisées et la gestion des campagnes. | [src/lib/featureCatalog.ts:362](../../src/lib/featureCatalog.ts#L362) |
| performances | Performances | restaurant_dashboard | true | — | — | Active les vues de performance et comparaison restaurateur. | [src/lib/featureCatalog.ts:369](../../src/lib/featureCatalog.ts#L369) |
| dashboard-restaurateur | Dashboard restaurateur | restaurant_dashboard | true | — | — | Expose l'entrée du dashboard restaurateur et ses sections internes. | [src/lib/featureCatalog.ts:376](../../src/lib/featureCatalog.ts#L376) |
| dashboard-campaign-studio | Dashboard: Campaign Studio IA | restaurant_dashboard | true | /dashboard/campaign-studio | dashboard-restaurateur | Expose la génération et la préparation de campagnes marketing assistées par IA. | [src/lib/featureCatalog.ts:384](../../src/lib/featureCatalog.ts#L384) |
| dashboard-overview | Dashboard: Vue d'ensemble | restaurant_dashboard | true | /dashboard | dashboard-restaurateur | Affiche la page d'accueil du dashboard restaurateur. | [src/lib/featureCatalog.ts:393](../../src/lib/featureCatalog.ts#L393) |
| dashboard-advisor | Dashboard: Assistant IA | restaurant_dashboard | true | /dashboard/advisor, /dashboard/recommandations | dashboard-restaurateur | Expose l'assistant IA du dashboard restaurateur. | [src/lib/featureCatalog.ts:402](../../src/lib/featureCatalog.ts#L402) |
| ai_support_chat | IA support client | client_features | true | — | — | Active le chat support IA client avec escalade humaine et tickets audités. | [src/lib/featureCatalog.ts:411](../../src/lib/featureCatalog.ts#L411) |
| ai_menu_optimizer | IA optimisation menu | restaurant_dashboard | true | — | dashboard-restaurateur | Active l'optimisation des menus, descriptions et traductions côté restaurateur. | [src/lib/featureCatalog.ts:418](../../src/lib/featureCatalog.ts#L418) |
| ai_marketing_campaigns | IA campagnes marketing | restaurant_dashboard | true | — | dashboard-restaurateur | Active les brouillons de campagnes et contenus promotionnels IA. | [src/lib/featureCatalog.ts:426](../../src/lib/featureCatalog.ts#L426) |
| ai_photo_enhancer | IA photos incluses | restaurant_dashboard | true | — | dashboard-restaurateur | Active les recommandations et briefs d'amélioration photo. | [src/lib/featureCatalog.ts:434](../../src/lib/featureCatalog.ts#L434) |
| ai_sales_insights | IA analyse des ventes | restaurant_dashboard | true | — | dashboard-restaurateur | Expose l'Assistant IA restaurateur, les analyses de ventes et les recommandations marge. | [src/lib/featureCatalog.ts:442](../../src/lib/featureCatalog.ts#L442) |
| ai_accounting_insights | IA comptabilité admin | admin_tools | true | /admin/compta/ia | admin-compta | Expose les synthèses comptables, anomalies, prévisions et coût IA côté admin. | [src/lib/featureCatalog.ts:450](../../src/lib/featureCatalog.ts#L450) |
| ai_admin_monitoring | IA monitoring admin | admin_tools | true | /admin/ai-operations | — | Expose le monitoring IA sécurité, performance, coûts et incidents. | [src/lib/featureCatalog.ts:459](../../src/lib/featureCatalog.ts#L459) |
| admin_dashboard_ai_chat | IA chat dashboard admin | admin_tools | true | — | admin-operations-center, ai_admin_monitoring | Active le chat IA admin privilegie avec analyse des donnees et logs du back-office. | [src/lib/featureCatalog.ts:467](../../src/lib/featureCatalog.ts#L467) |
| ai_premium_image_generation | IA image premium | restaurant_dashboard | false | — | dashboard-restaurateur, ai_photo_enhancer | Active la génération image premium réservée aux abonnements supérieurs. | [src/lib/featureCatalog.ts:475](../../src/lib/featureCatalog.ts#L475) |
| dashboard-restaurant | Dashboard: Mon restaurant | restaurant_dashboard | true | /dashboard/restaurant | dashboard-restaurateur | Expose l'édition de la fiche restaurant et des capacités locales. | [src/lib/featureCatalog.ts:483](../../src/lib/featureCatalog.ts#L483) |
| dashboard-menu | Dashboard: Menu | restaurant_dashboard | true | /dashboard/menu | dashboard-restaurateur | Expose la gestion du menu restaurateur. | [src/lib/featureCatalog.ts:492](../../src/lib/featureCatalog.ts#L492) |
| daily-dish-ai | IA Plat du jour | restaurant_dashboard | true | /dashboard/menu | dashboard-restaurateur, dashboard-menu, ai_menu_optimizer, ai_photo_enhancer, ai_sales_insights | Trois propositions quotidiennes avec recherche fournisseurs, coûts, recette et publication PhotoPro. | [src/lib/featureCatalog.ts:501](../../src/lib/featureCatalog.ts#L501) |
| dashboard-photos | Dashboard: Photos | restaurant_dashboard | true | /dashboard/photos | dashboard-restaurateur | Expose la gestion des photos du restaurant. | [src/lib/featureCatalog.ts:510](../../src/lib/featureCatalog.ts#L510) |
| dashboard-commandes | Dashboard: Commandes | restaurant_dashboard | true | /dashboard/commandes | dashboard-restaurateur, commandes | Expose la vue commandes du dashboard restaurateur. | [src/lib/featureCatalog.ts:519](../../src/lib/featureCatalog.ts#L519) |
| dashboard-reservations | Dashboard: Reservations | restaurant_dashboard | true | /dashboard/reservations | dashboard-restaurateur, reservation | Expose la vue réservations du dashboard restaurateur. | [src/lib/featureCatalog.ts:528](../../src/lib/featureCatalog.ts#L528) |
| dashboard-performances | Dashboard: Performances | restaurant_dashboard | true | /dashboard/performances, /dashboard/compta | dashboard-restaurateur, performances | Expose la page performances du dashboard restaurateur. | [src/lib/featureCatalog.ts:537](../../src/lib/featureCatalog.ts#L537) |
| dashboard-comparaison | Dashboard: Comparaison | restaurant_dashboard | true | /dashboard/comparaison | dashboard-restaurateur, performances | Expose la page comparaison du dashboard restaurateur. | [src/lib/featureCatalog.ts:546](../../src/lib/featureCatalog.ts#L546) |
| dashboard-avis | Dashboard: Avis | restaurant_dashboard | true | /dashboard/avis | dashboard-restaurateur | Expose la vue d'avis clients du dashboard restaurateur. | [src/lib/featureCatalog.ts:555](../../src/lib/featureCatalog.ts#L555) |
| dashboard-campagne-overview | Dashboard: Campagnes | restaurant_dashboard | true | /dashboard/campagne-overview | dashboard-restaurateur, campagnes-pub | Expose la vue synthese des campagnes publicitaires. | [src/lib/featureCatalog.ts:564](../../src/lib/featureCatalog.ts#L564) |
| dashboard-reseaux-sociaux | Dashboard: Reseaux sociaux | restaurant_dashboard | true | /dashboard/reseaux-sociaux | dashboard-restaurateur, campagnes-pub | Expose les activations réseaux sociaux côté restaurateur. | [src/lib/featureCatalog.ts:573](../../src/lib/featureCatalog.ts#L573) |
| dashboard-actualites | Dashboard: Actualités | restaurant_dashboard | true | /dashboard/actualites | dashboard-restaurateur | Expose la publication et le suivi des posts du fil social. | [src/lib/featureCatalog.ts:582](../../src/lib/featureCatalog.ts#L582) |
| dashboard-campagnes | Dashboard: Campagnes avancees | restaurant_dashboard | true | /dashboard/campagnes | dashboard-restaurateur, campagnes-pub | Expose l'édition complète des campagnes sponsorisées. | [src/lib/featureCatalog.ts:591](../../src/lib/featureCatalog.ts#L591) |
| dashboard-crm | Dashboard: CRM clients | restaurant_dashboard | true | /dashboard/crm | dashboard-restaurateur, commandes, reservation | Expose le CRM restaurateur base sur les commandes, reservations et habitudes client. | [src/lib/featureCatalog.ts:600](../../src/lib/featureCatalog.ts#L600) |
| dashboard-factures | Dashboard: Factures | restaurant_dashboard | true | /dashboard/factures, /dashboard/factures/entrees, /dashboard/factures/sorties | dashboard-restaurateur | Expose la vue factures et paiements restaurateur. | [src/lib/featureCatalog.ts:610](../../src/lib/featureCatalog.ts#L610) |
| dashboard-factures-parametres | Dashboard: Paramètres de facturation | restaurant_dashboard | true | /dashboard/factures/parametres | dashboard-restaurateur | Expose les paramètres de facturation restaurateur. | [src/lib/featureCatalog.ts:619](../../src/lib/featureCatalog.ts#L619) |
| dashboard-billing | Dashboard: Mon compte/Facturation | restaurant_dashboard | true | /dashboard/mon-compte-facturation | dashboard-restaurateur | Expose le compte restaurateur, l'abonnement, l'upgrade et le suivi des crédits. | [src/lib/featureCatalog.ts:628](../../src/lib/featureCatalog.ts#L628) |
| dashboard-offres | Dashboard: Anti-gaspi | restaurant_dashboard | true | /dashboard/offres | dashboard-restaurateur, anti-gaspi | Expose la gestion anti-gaspi côté restaurateur. | [src/lib/featureCatalog.ts:637](../../src/lib/featureCatalog.ts#L637) |
| dashboard-ventes-flash | Dashboard: Ventes flash | restaurant_dashboard | true | /dashboard/ventes-flash | dashboard-restaurateur, ventes-flash | Expose la gestion des ventes flash côté restaurateur. | [src/lib/featureCatalog.ts:646](../../src/lib/featureCatalog.ts#L646) |
| dashboard-formules | Dashboard: Formules | restaurant_dashboard | true | /dashboard/formules | dashboard-restaurateur | Expose la gestion des formules et menus. | [src/lib/featureCatalog.ts:655](../../src/lib/featureCatalog.ts#L655) |
| dashboard-service | Dashboard: Pilotage de service | restaurant_dashboard | true | /dashboard/service | dashboard-restaurateur | Expose le pilotage des réservations et du service du restaurant. | [src/lib/featureCatalog.ts:664](../../src/lib/featureCatalog.ts#L664) |
| dashboard-plan-salle | Dashboard: Plan de salle | restaurant_dashboard | true | /dashboard/plan-salle | dashboard-restaurateur, reservation | Expose le plan de salle, l'édition des tables et l'affectation des réservations. | [src/lib/featureCatalog.ts:673](../../src/lib/featureCatalog.ts#L673) |
| dashboard-support | Dashboard: Support | restaurant_dashboard | true | /dashboard/support | dashboard-restaurateur | Expose l'aide et le support restaurateur. | [src/lib/featureCatalog.ts:682](../../src/lib/featureCatalog.ts#L682) |
| dashboard-tok-connect | Dashboard: TOK Connect | restaurant_dashboard | true | /dashboard/tok-connect | dashboard-restaurateur, tok-connect | Expose les consentements partenaires TOK Connect par restaurant. | [src/lib/featureCatalog.ts:691](../../src/lib/featureCatalog.ts#L691) |
| dashboard-promotions | Dashboard: Promotions | restaurant_dashboard | true | /dashboard/promotions | dashboard-restaurateur | Expose la page promotions restaurateur. | [src/lib/featureCatalog.ts:700](../../src/lib/featureCatalog.ts#L700) |
| espace-livreur | Dashboard coursier | courier | false | — | — | Expose l'entrée du dashboard coursier et ses routes dédiées. | [src/lib/featureCatalog.ts:709](../../src/lib/featureCatalog.ts#L709) |
| courier-home | Coursier: Vue d'ensemble | courier | false | /courier | espace-livreur | Expose la page d'accueil du dashboard livreur. | [src/lib/featureCatalog.ts:717](../../src/lib/featureCatalog.ts#L717) |
| courier-jobs | Coursier: Missions | courier | false | /courier/jobs | espace-livreur | Expose la gestion des missions coursier. | [src/lib/featureCatalog.ts:726](../../src/lib/featureCatalog.ts#L726) |
| courier-earnings | Coursier: Gains | courier | false | /courier/earnings | espace-livreur | Expose le suivi des gains coursier. | [src/lib/featureCatalog.ts:735](../../src/lib/featureCatalog.ts#L735) |
| courier-profile | Coursier: Profil | courier | false | /courier/profile | espace-livreur | Expose le profil coursier et ses validations. | [src/lib/featureCatalog.ts:744](../../src/lib/featureCatalog.ts#L744) |
| admin-support-resolution | Admin: Résolution IA | admin_tools | true | /admin/support-resolution | — | Expose l'assistance IA à l'analyse et à la résolution des incidents support. | [src/lib/featureCatalog.ts:753](../../src/lib/featureCatalog.ts#L753) |
| admin-guardian | Admin: Guardian IA | admin_tools | true | /admin/guardian | — | Expose l'analyse IA de santé, sécurité et incidents de la plateforme. | [src/lib/featureCatalog.ts:762](../../src/lib/featureCatalog.ts#L762) |
| admin-marketing-operations | Admin: Centre marketing | admin_tools | true | /marketing | — | Pilote le calendrier, les campagnes, les audiences, les automatisations, les envois et leurs résultats depuis un espace admin isolé. | [src/lib/featureCatalog.ts:771](../../src/lib/featureCatalog.ts#L771) |
| admin-restaurants | Admin: Restaurants | admin_tools | true | /admin/restaurants, /admin/restaurants/google-business | — | Expose la gestion admin des restaurants. | [src/lib/featureCatalog.ts:780](../../src/lib/featureCatalog.ts#L780) |
| admin-utilisateurs | Admin: Utilisateurs | admin_tools | true | /admin/utilisateurs | — | Expose la gestion admin des utilisateurs et des roles. | [src/lib/featureCatalog.ts:788](../../src/lib/featureCatalog.ts#L788) |
| admin-avis | Admin: Avis | admin_tools | true | /admin/avis | — | Expose la moderation des avis. | [src/lib/featureCatalog.ts:796](../../src/lib/featureCatalog.ts#L796) |
| admin-catalog | Admin: Catalogue | admin_tools | true | /admin/catalog | — | Expose le catalogue central et ses taxonomies. | [src/lib/featureCatalog.ts:804](../../src/lib/featureCatalog.ts#L804) |
| admin-loyalty | Admin: Fidélité | admin_tools | true | /admin/loyalty | — | Expose la configuration fidélité et abonnement. | [src/lib/featureCatalog.ts:812](../../src/lib/featureCatalog.ts#L812) |
| admin-drops | Admin: Drops | admin_tools | true | /admin/drops | — | Expose la gestion des drops et ventes flash admin. | [src/lib/featureCatalog.ts:820](../../src/lib/featureCatalog.ts#L820) |
| admin-notifications | Admin: Notifications | admin_tools | true | /admin/notifications | — | Expose la gestion des notifications et campagnes. | [src/lib/featureCatalog.ts:828](../../src/lib/featureCatalog.ts#L828) |
| admin-platform-config | Admin: Configuration plateforme | admin_tools | true | /admin/platform | — | Expose le panneau de configuration plateforme et la gouvernance des feature flags. | [src/lib/featureCatalog.ts:836](../../src/lib/featureCatalog.ts#L836) |
| admin-operations-center | Admin: Operations Center | admin_tools | true | /admin/commandes-reservations, /admin/sinistres | — | Expose la supervision admin des commandes, reservations, remboursements et dispatch. | [src/lib/featureCatalog.ts:845](../../src/lib/featureCatalog.ts#L845) |
| admin-tok-connect | Admin: TOK Connect | admin_tools | true | /admin/tok-connect | tok-connect | Expose la supervision des partenaires, scopes, quotas et webhooks TOK Connect. | [src/lib/featureCatalog.ts:854](../../src/lib/featureCatalog.ts#L854) |
| admin-actualites | Admin: Actualités sociales | admin_tools | true | /admin/actualites | — | Expose la moderation du fil social. | [src/lib/featureCatalog.ts:863](../../src/lib/featureCatalog.ts#L863) |
| admin-crm | Admin: CRM clients | admin_tools | true | /admin/crm | — | Expose la segmentation client et les signaux commerciaux du CRM TOK. | [src/lib/featureCatalog.ts:871](../../src/lib/featureCatalog.ts#L871) |
| admin-audit | Admin: Audit | admin_tools | true | /admin/audit | — | Expose les journaux d'audit et les exécutions Edge. | [src/lib/featureCatalog.ts:879](../../src/lib/featureCatalog.ts#L879) |
| admin-packs | Admin: Abonnements restaurateur | admin_tools | true | /admin/packs | — | Expose la supervision admin des abonnements restaurateur et des droits dashboard. | [src/lib/featureCatalog.ts:887](../../src/lib/featureCatalog.ts#L887) |
| admin-compta | Admin: Comptabilite | admin_tools | true | /admin/compta, /admin/compta/entrees, /admin/compta/sorties | — | Expose l'outil de rapprochement financier et le suivi des commissions 10% / reversements 90%. | [src/lib/featureCatalog.ts:895](../../src/lib/featureCatalog.ts#L895) |
| coming-soon | Animation de lancement · verrou client | admin_tools | false | /coming-soon | — | Verrou client : seul le flag désactivé ouvre l’application, même à zéro. Lorsque activé, redirige toutes les pages publiques vers la page Coming Soon. Les dashboards admin, restaurateur, coursier et l'authentification restent accessibles. | [src/lib/featureCatalog.ts:903](../../src/lib/featureCatalog.ts#L903) |

## Pages frontend

| Page | Routes | Montée | Exports | Source |
| --- | --- | --- | --- | --- |
| APropos | /a-propos | oui | default | [src/pages/APropos.tsx](../../src/pages/APropos.tsx) |
| Abonnement | /abonnement | oui | default | [src/pages/Abonnement.tsx](../../src/pages/Abonnement.tsx) |
| Account Security | /parametres/securite | oui | default | [src/pages/AccountSecurity.tsx](../../src/pages/AccountSecurity.tsx) |
| Actualite Post | /actualites/:postId | oui | default | [src/pages/ActualitePost.tsx](../../src/pages/ActualitePost.tsx) |
| Actualites | /actualites | oui | default | [src/pages/Actualites.tsx](../../src/pages/Actualites.tsx) |
| Aide | /aide | oui | default | [src/pages/Aide.tsx](../../src/pages/Aide.tsx) |
| Alternative Commission Couvert | /restaurateurs/alternative-commission-couvert | oui | default | [src/pages/AlternativeCommissionCouvert.tsx](../../src/pages/AlternativeCommissionCouvert.tsx) |
| Anti Gaspi | /anti-gaspi | oui | default | [src/pages/AntiGaspi.tsx](../../src/pages/AntiGaspi.tsx) |
| Auth | /auth, /auth/demo, /auth/callback | oui | default | [src/pages/Auth.tsx](../../src/pages/Auth.tsx) |
| Budget Auto | /budget-auto | oui | default | [src/pages/BudgetAuto.tsx](../../src/pages/BudgetAuto.tsx) |
| CGU | /cgu | oui | default | [src/pages/CGU.tsx](../../src/pages/CGU.tsx) |
| Chefs Table | /chefs-table | oui | default | [src/pages/ChefsTable.tsx](../../src/pages/ChefsTable.tsx) |
| Client Dashboard Home | /mon-espace | oui | default | [src/pages/ClientDashboardHome.tsx](../../src/pages/ClientDashboardHome.tsx) |
| Client Reviews | /mes-avis | oui | default | [src/pages/ClientReviews.tsx](../../src/pages/ClientReviews.tsx) |
| Coming Soon | /coming-soon | oui | default | [src/pages/ComingSoon.tsx](../../src/pages/ComingSoon.tsx) |
| Commandes | /commandes | oui | default | [src/pages/Commandes.tsx](../../src/pages/Commandes.tsx) |
| Commercial Comptabilite | /commercial/comptabilite | oui | default | [src/pages/CommercialComptabilite.tsx](../../src/pages/CommercialComptabilite.tsx) |
| Commercial Demo Live | /commercial/demo-live | oui | default | [src/pages/CommercialDemoLive.tsx](../../src/pages/CommercialDemoLive.tsx) |
| Commercial Prospection | /commercial | oui | default | [src/pages/CommercialProspection.tsx](../../src/pages/CommercialProspection.tsx) |
| Conditions Restaurateurs | /conditions-restaurateurs | oui | default | [src/pages/ConditionsRestaurateurs.tsx](../../src/pages/ConditionsRestaurateurs.tsx) |
| Contact | /contact | oui | default | [src/pages/Contact.tsx](../../src/pages/Contact.tsx) |
| Cookies | /cookies | oui | default | [src/pages/Cookies.tsx](../../src/pages/Cookies.tsx) |
| Creneaux Garantis | /creneaux-garantis | oui | default | [src/pages/CreneauxGarantis.tsx](../../src/pages/CreneauxGarantis.tsx) |
| Customer Memory | /memoire-tok | oui | default | [src/pages/CustomerMemory.tsx](../../src/pages/CustomerMemory.tsx) |
| Flex Prix Bas | /flex-prix-bas | oui | default | [src/pages/FlexPrixBas.tsx](../../src/pages/FlexPrixBas.tsx) |
| Garantie Qualite | /garantie-qualite | oui | default | [src/pages/GarantieQualite.tsx](../../src/pages/GarantieQualite.tsx) |
| Gift Points | /points-cadeau | oui | default | [src/pages/GiftPoints.tsx](../../src/pages/GiftPoints.tsx) |
| Index | / | oui | default | [src/pages/Index.tsx](../../src/pages/Index.tsx) |
| Local Restaurants | /restaurants/:city, /restaurants-pres/:venueSlug, /restaurants/:city/r/:restaurantSlug, /restaurants/:city/:category | oui | default | [src/pages/LocalRestaurants.tsx](../../src/pages/LocalRestaurants.tsx) |
| Match Groupes | /match-groupes | oui | default | [src/pages/MatchGroupes.tsx](../../src/pages/MatchGroupes.tsx) |
| Miamz Solidaires | /miamz-solidaires | oui | default | [src/pages/MiamzSolidaires.tsx](../../src/pages/MiamzSolidaires.tsx) |
| Multi Restaurant | /multi-restaurant | oui | default | [src/pages/MultiRestaurant.tsx](../../src/pages/MultiRestaurant.tsx) |
| Multi Stop | /multi-stop | oui | default | [src/pages/MultiStop.tsx](../../src/pages/MultiStop.tsx) |
| Not Found | * | oui | default | [src/pages/NotFound.tsx](../../src/pages/NotFound.tsx) |
| Notifications | /notifications | oui | default | [src/pages/Notifications.tsx](../../src/pages/Notifications.tsx) |
| OAuth Consent | /oauth/consent | oui | default | [src/pages/OAuthConsent.tsx](../../src/pages/OAuthConsent.tsx) |
| Order Confirmation | /commande/confirmation | oui | default | [src/pages/OrderConfirmation.tsx](../../src/pages/OrderConfirmation.tsx) |
| Packs Restaurateur | /packs-restaurateur | oui | default | [src/pages/PacksRestaurateur.tsx](../../src/pages/PacksRestaurateur.tsx) |
| Panier | /panier | oui | default | [src/pages/Panier.tsx](../../src/pages/Panier.tsx) |
| Politique Confidentialite | /politique-confidentialite | oui | default | [src/pages/PolitiqueConfidentialite.tsx](../../src/pages/PolitiqueConfidentialite.tsx) |
| Profil | /profil | oui | default | [src/pages/Profil.tsx](../../src/pages/Profil.tsx) |
| Recherche | /recherche | oui | default | [src/pages/Recherche.tsx](../../src/pages/Recherche.tsx) |
| Reservations | /reservations | oui | default | [src/pages/Reservations.tsx](../../src/pages/Reservations.tsx) |
| Restaurant Booking Redirect | /r/:slug/reserver, /r/:slug | oui | default | [src/pages/RestaurantBookingRedirect.tsx](../../src/pages/RestaurantBookingRedirect.tsx) |
| Restaurant Detail | /restaurant/:id | oui | default | [src/pages/RestaurantDetail.tsx](../../src/pages/RestaurantDetail.tsx) |
| Restaurateurs Geneve | /restaurateurs/geneve, /restaurateurs/:city | oui | default | [src/pages/RestaurateursGeneve.tsx](../../src/pages/RestaurateursGeneve.tsx) |
| Restaurateurs Google Business | /restaurateurs/google-business | oui | default | [src/pages/RestaurateursGoogleBusiness.tsx](../../src/pages/RestaurateursGoogleBusiness.tsx) |
| Suivi Commande | /commande/:id | oui | default | [src/pages/SuiviCommande.tsx](../../src/pages/SuiviCommande.tsx) |
| Tok Connect | /tok-connect | oui | default | [src/pages/TokConnect.tsx](../../src/pages/TokConnect.tsx) |
| Tok Connect Developer | /tok-connect/developer | oui | default | [src/pages/TokConnectDeveloper.tsx](../../src/pages/TokConnectDeveloper.tsx) |
| Tok One | /tok-one | oui | default | [src/pages/TokOne.tsx](../../src/pages/TokOne.tsx) |
| Tok Pulse | /tok-pulse | oui | default | [src/pages/TokPulse.tsx](../../src/pages/TokPulse.tsx) |
| Ventes Flash | /ventes-flash | oui | default | [src/pages/VentesFlash.tsx](../../src/pages/VentesFlash.tsx) |
| Workspace Chooser | /espaces | oui | default | [src/pages/WorkspaceChooser.tsx](../../src/pages/WorkspaceChooser.tsx) |
| Zero Attente | /zero-attente | oui | default | [src/pages/ZeroAttente.tsx](../../src/pages/ZeroAttente.tsx) |
| Admin Actualites | /admin/actualites | oui | default | [src/pages/admin/AdminActualites.tsx](../../src/pages/admin/AdminActualites.tsx) |
| Admin Ai Operations | /admin/ai-operations | oui | default | [src/pages/admin/AdminAiOperations.tsx](../../src/pages/admin/AdminAiOperations.tsx) |
| Admin Audit Logs | /admin/audit | oui | default | [src/pages/admin/AdminAuditLogs.tsx](../../src/pages/admin/AdminAuditLogs.tsx) |
| Admin Avis | /admin/avis | oui | default | [src/pages/admin/AdminAvis.tsx](../../src/pages/admin/AdminAvis.tsx) |
| Admin Catalog | /admin/catalog | oui | default | [src/pages/admin/AdminCatalog.tsx](../../src/pages/admin/AdminCatalog.tsx) |
| Admin Compta | /admin/compta | oui | default | [src/pages/admin/AdminCompta.tsx](../../src/pages/admin/AdminCompta.tsx) |
| Admin Compta Ai | /admin/compta/ia | oui | default | [src/pages/admin/AdminComptaAi.tsx](../../src/pages/admin/AdminComptaAi.tsx) |
| Admin Compta Inflow | /admin/compta/entrees | oui | default | [src/pages/admin/AdminComptaInflow.tsx](../../src/pages/admin/AdminComptaInflow.tsx) |
| Admin Compta Outflow | /admin/compta/sorties | oui | default | [src/pages/admin/AdminComptaOutflow.tsx](../../src/pages/admin/AdminComptaOutflow.tsx) |
| Admin Compta Print Shell | — | non | default | [src/pages/admin/AdminComptaPrintShell.tsx](../../src/pages/admin/AdminComptaPrintShell.tsx) |
| Admin Crm | /admin/crm | oui | default | [src/pages/admin/AdminCrm.tsx](../../src/pages/admin/AdminCrm.tsx) |
| Admin Google Business | /admin/restaurants/google-business | oui | default | [src/pages/admin/AdminGoogleBusiness.tsx](../../src/pages/admin/AdminGoogleBusiness.tsx) |
| Admin Guardian | /admin/guardian | oui | default | [src/pages/admin/AdminGuardian.tsx](../../src/pages/admin/AdminGuardian.tsx) |
| Admin Home | — | non | default | [src/pages/admin/AdminHome.tsx](../../src/pages/admin/AdminHome.tsx) |
| Admin Launch Packs | /admin/packs | oui | default | [src/pages/admin/AdminLaunchPacks.tsx](../../src/pages/admin/AdminLaunchPacks.tsx) |
| Admin Loyalty | /admin/loyalty | oui | default | [src/pages/admin/AdminLoyalty.tsx](../../src/pages/admin/AdminLoyalty.tsx) |
| Admin Notifications | /admin/notifications | oui | default | [src/pages/admin/AdminNotifications.tsx](../../src/pages/admin/AdminNotifications.tsx) |
| Admin Operations Center | /admin/commandes-reservations | oui | default | [src/pages/admin/AdminOperationsCenter.tsx](../../src/pages/admin/AdminOperationsCenter.tsx) |
| Admin Orders Reservations | — | non | default | [src/pages/admin/AdminOrdersReservations.tsx](../../src/pages/admin/AdminOrdersReservations.tsx) |
| Admin Platform Config | /admin/platform | oui | default | [src/pages/admin/AdminPlatformConfig.tsx](../../src/pages/admin/AdminPlatformConfig.tsx) |
| Admin Print Orders | — | non | default | [src/pages/admin/AdminPrintOrders.tsx](../../src/pages/admin/AdminPrintOrders.tsx) |
| Admin Restaurants | /admin/restaurants | oui | default | [src/pages/admin/AdminRestaurants.tsx](../../src/pages/admin/AdminRestaurants.tsx) |
| Admin Sinistres | /admin/sinistres | oui | default | [src/pages/admin/AdminSinistres.tsx](../../src/pages/admin/AdminSinistres.tsx) |
| Admin Support Resolution | /admin/support-resolution | oui | default | [src/pages/admin/AdminSupportResolution.tsx](../../src/pages/admin/AdminSupportResolution.tsx) |
| Admin Tok Connect | /admin/tok-connect | oui | ADMIN_TOK_CONNECT_LOG_LIMIT, default | [src/pages/admin/AdminTokConnect.tsx](../../src/pages/admin/AdminTokConnect.tsx) |
| Admin Utilisateurs | /admin/utilisateurs | oui | default | [src/pages/admin/AdminUtilisateurs.tsx](../../src/pages/admin/AdminUtilisateurs.tsx) |
| Drops Management | /admin/drops | oui | default | [src/pages/admin/DropsManagement.tsx](../../src/pages/admin/DropsManagement.tsx) |
| Admin Compta Shared | — | non | RestaurantFilterRow, AdminOrderRow, AdminReservationPaymentRow, AdminInvoiceRow, AdminCampaignRow, AccountingStripeReconciliationRow, AccountingMonthLockRow, AccountingPeriodControl, PlatformFinanceMonthlySnapshot, AdminReservationFeeAccrualRow, AdminPayableLineItemRow, AdminPayableAccrualSummary, InvoiceDetailLineType, InvoiceDetailSource, InvoiceDetailSourcePresentation, PayoutInvoiceDetailLine, ReservationFeeInvoiceDetailLine, INVOICE_DETAIL_SOURCE_PRESENTATION, toAmount, formatAmount, formatDate, formatPeriod, downloadAccountingCsv, isAccountingPeriodClosed, getInvoiceStatusClass, getInvoiceDetailSourcePresentation, getPayoutInvoiceOrderSubtotal, getPayoutInvoiceReservationSubtotal, getPayoutInvoiceLinesTotal, getPayoutInvoiceRoundingDelta, getReservationFeeInvoiceLinesTotal, buildMonthOptions, isCreditFundedCampaign, fetchAdminAccountingExportEntries, useAdminPayoutInvoiceDetailLines, useAdminReservationFeeInvoiceDetailLines, useAdminComptaData | [src/pages/admin/adminComptaShared.ts](../../src/pages/admin/adminComptaShared.ts) |
| Admin Orders Reservations Shared | — | non | AdminHistoryTab, AdminRestaurantOption, AdminCustomerSummary, AdminRestaurantSummary, AdminOrderItemModifier, AdminOrderItem, AdminOrderHistoryItem, AdminReservationPreorderItem, AdminReservationHistoryItem, getReservationFeaturePresentation, getOrderTypePresentation, getDefaultAdminHistoryFilters, normalizeOrderHistoryRow, normalizeReservationHistoryRow, orderMatchesSearchTerm, reservationMatchesSearchTerm, getUniqueCustomerCount, getUniqueRestaurantCount | [src/pages/admin/adminOrdersReservationsShared.ts](../../src/pages/admin/adminOrdersReservationsShared.ts) |
| Courier Earnings | /courier/earnings | oui | default | [src/pages/courier/CourierEarnings.tsx](../../src/pages/courier/CourierEarnings.tsx) |
| Courier Home | /courier | oui | default | [src/pages/courier/CourierHome.tsx](../../src/pages/courier/CourierHome.tsx) |
| Courier Jobs | /courier/jobs | oui | default | [src/pages/courier/CourierJobs.tsx](../../src/pages/courier/CourierJobs.tsx) |
| Courier Notifications | /courier/notifications | oui | default | [src/pages/courier/CourierNotifications.tsx](../../src/pages/courier/CourierNotifications.tsx) |
| Courier Profile | /courier/profile | oui | default | [src/pages/courier/CourierProfile.tsx](../../src/pages/courier/CourierProfile.tsx) |
| Dashboard Account Billing | /dashboard/mon-compte-facturation | oui | default | [src/pages/dashboard/DashboardAccountBilling.tsx](../../src/pages/dashboard/DashboardAccountBilling.tsx) |
| Dashboard Actualites | /dashboard/actualites | oui | default | [src/pages/dashboard/DashboardActualites.tsx](../../src/pages/dashboard/DashboardActualites.tsx) |
| Dashboard Advisor | /dashboard/advisor | oui | default | [src/pages/dashboard/DashboardAdvisor.tsx](../../src/pages/dashboard/DashboardAdvisor.tsx) |
| Dashboard Avis | /dashboard/avis | oui | default | [src/pages/dashboard/DashboardAvis.tsx](../../src/pages/dashboard/DashboardAvis.tsx) |
| Dashboard Campagne Overview | — | non | default | [src/pages/dashboard/DashboardCampagneOverview.tsx](../../src/pages/dashboard/DashboardCampagneOverview.tsx) |
| Dashboard Campagnes | /dashboard/campagnes | oui | default | [src/pages/dashboard/DashboardCampagnes.tsx](../../src/pages/dashboard/DashboardCampagnes.tsx) |
| Dashboard Campaign Studio | /dashboard/campaign-studio | oui | default | [src/pages/dashboard/DashboardCampaignStudio.tsx](../../src/pages/dashboard/DashboardCampaignStudio.tsx) |
| Dashboard Commandes | /dashboard/commandes | oui | default | [src/pages/dashboard/DashboardCommandes.tsx](../../src/pages/dashboard/DashboardCommandes.tsx) |
| Dashboard Comparaison | /dashboard/comparaison | oui | default | [src/pages/dashboard/DashboardComparaison.tsx](../../src/pages/dashboard/DashboardComparaison.tsx) |
| Dashboard Context | — | non | DashboardProvider | [src/pages/dashboard/DashboardContext.tsx](../../src/pages/dashboard/DashboardContext.tsx) |
| Dashboard Crm | /dashboard/crm | oui | default | [src/pages/dashboard/DashboardCrm.tsx](../../src/pages/dashboard/DashboardCrm.tsx) |
| Dashboard Empty State | — | non | default | [src/pages/dashboard/DashboardEmptyState.tsx](../../src/pages/dashboard/DashboardEmptyState.tsx) |
| Dashboard Factures | /dashboard/factures | oui | default | [src/pages/dashboard/DashboardFactures.tsx](../../src/pages/dashboard/DashboardFactures.tsx) |
| Dashboard Factures Inflow | /dashboard/factures/entrees | oui | default | [src/pages/dashboard/DashboardFacturesInflow.tsx](../../src/pages/dashboard/DashboardFacturesInflow.tsx) |
| Dashboard Factures Outflow | /dashboard/factures/sorties | oui | default | [src/pages/dashboard/DashboardFacturesOutflow.tsx](../../src/pages/dashboard/DashboardFacturesOutflow.tsx) |
| Dashboard Formules | /dashboard/formules | oui | default | [src/pages/dashboard/DashboardFormules.tsx](../../src/pages/dashboard/DashboardFormules.tsx) |
| Dashboard Home | /dashboard | oui | default | [src/pages/dashboard/DashboardHome.tsx](../../src/pages/dashboard/DashboardHome.tsx) |
| Dashboard Invoice Settings | /dashboard/factures/parametres | oui | default | [src/pages/dashboard/DashboardInvoiceSettings.tsx](../../src/pages/dashboard/DashboardInvoiceSettings.tsx) |
| Dashboard Menu | /dashboard/menu | oui | default | [src/pages/dashboard/DashboardMenu.tsx](../../src/pages/dashboard/DashboardMenu.tsx) |
| Dashboard Notifications | /dashboard/notifications | oui | default | [src/pages/dashboard/DashboardNotifications.tsx](../../src/pages/dashboard/DashboardNotifications.tsx) |
| Dashboard Offres | /dashboard/offres | oui | default | [src/pages/dashboard/DashboardOffres.tsx](../../src/pages/dashboard/DashboardOffres.tsx) |
| Dashboard Performances | /dashboard/performances | oui | default | [src/pages/dashboard/DashboardPerformances.tsx](../../src/pages/dashboard/DashboardPerformances.tsx) |
| Dashboard Photos | /dashboard/photos | oui | default | [src/pages/dashboard/DashboardPhotos.tsx](../../src/pages/dashboard/DashboardPhotos.tsx) |
| Dashboard Plan Salle | /dashboard/plan-salle | oui | default | [src/pages/dashboard/DashboardPlanSalle.tsx](../../src/pages/dashboard/DashboardPlanSalle.tsx) |
| Dashboard Promotions | /dashboard/promotions | oui | default | [src/pages/dashboard/DashboardPromotions.tsx](../../src/pages/dashboard/DashboardPromotions.tsx) |
| Dashboard Reseaux Sociaux | /dashboard/reseaux-sociaux | oui | default | [src/pages/dashboard/DashboardReseauxSociaux.tsx](../../src/pages/dashboard/DashboardReseauxSociaux.tsx) |
| Dashboard Reservations | /dashboard/reservations | oui | default | [src/pages/dashboard/DashboardReservations.tsx](../../src/pages/dashboard/DashboardReservations.tsx) |
| Dashboard Restaurant | /dashboard/restaurant | oui | default | [src/pages/dashboard/DashboardRestaurant.tsx](../../src/pages/dashboard/DashboardRestaurant.tsx) |
| Dashboard Service | /dashboard/service | oui | default | [src/pages/dashboard/DashboardService.tsx](../../src/pages/dashboard/DashboardService.tsx) |
| Dashboard Support | /dashboard/support | oui | default | [src/pages/dashboard/DashboardSupport.tsx](../../src/pages/dashboard/DashboardSupport.tsx) |
| Dashboard Tok Connect | /dashboard/tok-connect | oui | DASHBOARD_TOK_CONNECT_GRANTS_LIMIT, TOK_CONNECT_MCP_ENDPOINT, default | [src/pages/dashboard/DashboardTokConnect.tsx](../../src/pages/dashboard/DashboardTokConnect.tsx) |
| Dashboard Ventes Flash | /dashboard/ventes-flash | oui | default | [src/pages/dashboard/DashboardVentesFlash.tsx](../../src/pages/dashboard/DashboardVentesFlash.tsx) |
| Dashboard Factures Shared | — | non | RestaurantInvoiceRow, RestaurantOrderRow, RestaurantReservationPaymentRow, RestaurantPaidCampaignRow, InvoiceDetailLineType, InvoiceDetailSource, InvoiceDetailSourcePresentation, PayoutInvoiceDetailLine, ReservationFeeInvoiceDetailLine, INVOICE_DETAIL_SOURCE_PRESENTATION, toAmount, formatAmount, formatDate, formatPeriod, getInvoiceStatusClass, getInvoiceDetailSourcePresentation, getPayoutInvoiceOrderSubtotal, getPayoutInvoiceReservationSubtotal, getPayoutInvoiceLinesTotal, getPayoutInvoiceRoundingDelta, getReservationFeeInvoiceLinesTotal, fetchDashboardAccountingExportEntries, useDashboardPayoutInvoiceDetailLines, useDashboardReservationFeeInvoiceDetailLines, useDashboardFacturesData | [src/pages/dashboard/dashboardFacturesShared.ts](../../src/pages/dashboard/dashboardFacturesShared.ts) |
| Use Dashboard Restaurant | — | non | DashboardContextValue, RESTAURANT_ONBOARDING_ROUTE_CATALOG, RESTAURANT_ONBOARDING_CONFIGURATION_ROUTES, isRestaurantOnboardingConfigurationRoute, canAccessRestaurantDashboardRoute, isRestaurantDashboardAccessApproved, DashboardContext, useDashboardRestaurant | [src/pages/dashboard/useDashboardRestaurant.ts](../../src/pages/dashboard/useDashboardRestaurant.ts) |
| Use Owner Restaurants | — | non | OwnedRestaurant, useOwnerRestaurants | [src/pages/dashboard/useOwnerRestaurants.ts](../../src/pages/dashboard/useOwnerRestaurants.ts) |
| Marketing Login | /marketing/login | oui | default | [src/pages/marketing/MarketingLogin.tsx](../../src/pages/marketing/MarketingLogin.tsx) |
| Marketing Workspace | /marketing | oui | default | [src/pages/marketing/MarketingWorkspace.tsx](../../src/pages/marketing/MarketingWorkspace.tsx) |
| Tok Connect Mcp Widget | /tok-connect/mcp-widget | oui | default | [src/pages/tok-connect/TokConnectMcpWidget.tsx](../../src/pages/tok-connect/TokConnectMcpWidget.tsx) |

## PostgreSQL et migrations

### Objets SQL détectés

<details><summary>function (739)</summary>

- `pg_temp.tok_demo_public_rls_fingerprint` (1 définition(s))
- `private.prevent_ops_incident_github_run_rebind` (1 définition(s))
- `private_campaign.actualites_billing_dedupe_key` (1 définition(s))
- `private_campaign.record_actualites_internal_test_conversion` (1 définition(s))
- `private_campaign.record_actualites_latest_click_conversion` (1 définition(s))
- `private_campaign.record_actualites_touch_conversions` (1 définition(s))
- `private_finance.apply_flat_reservation_fee_on_arrival` (2 définition(s))
- `private_finance.assert_dashboard_pack_runtime_enabled` (1 définition(s))
- `private_finance.assert_webhook_lease` (1 définition(s))
- `private_finance.enforce_dashboard_pack_paid_module_write` (2 définition(s))
- `private_finance.enqueue_first_restaurant_subscription_activation` (1 définition(s))
- `private_finance.enqueue_restaurant_subscription_activation` (1 définition(s))
- `private_finance.ensure_deferred_restaurant_subscription` (2 définition(s))
- `private_finance.flat_reservation_billing_active` (1 définition(s))
- `private_finance.guard_completed_reservation_honor` (1 définition(s))
- `private_finance.guard_fair_growth_module_feature_keys` (1 définition(s))
- `private_finance.guard_recognized_restaurant_invoice_header` (1 définition(s))
- `private_finance.guard_recognized_restaurant_invoice_lines` (1 définition(s))
- `private_finance.guard_referenced_feature_flag` (1 définition(s))
- `private_finance.guard_restaurateur_signup_approval_payment` (1 définition(s))
- `private_finance.invalidate_commercial_signup_referrals` (1 définition(s))
- `private_finance.link_reservation_charge_to_invoice_once` (1 définition(s))
- `private_finance.normalize_financial_ledger_stripe_mode` (1 définition(s))
- `private_finance.payment_attempt_json` (1 définition(s))
- `private_finance.prepare_commercial_commission_lifecycle` (1 définition(s))
- `private_finance.prevent_append_only_finance_mutation` (1 définition(s))
- `private_finance.prevent_locked_commercial_statement_mutation` (1 définition(s))
- `private_finance.protect_restaurant_subscription_pricing_snapshot` (1 définition(s))
- `private_finance.queue_subscription_on_order` (1 définition(s))
- `private_finance.queue_subscription_on_reservation` (1 définition(s))
- `private_finance.record_marketplace_reversal` (2 définition(s))
- `private_finance.record_paid_restaurant_invoice` (2 définition(s))
- `private_finance.record_paid_restaurant_invoice_line_trigger` (1 définition(s))
- `private_finance.record_paid_restaurant_invoice_trigger` (2 définition(s))
- `private_finance.record_refund_status` (1 définition(s))
- `private_finance.reject_demo_restaurant_paid_module` (1 définition(s))
- `private_finance.reject_immutable_fair_growth_mutation` (1 définition(s))
- `private_finance.resolve_commercial_signup_referral` (1 définition(s))
- `private_finance.run_monthly_reservation_fee_invoice_generation` (1 définition(s))
- `private_finance.set_financial_ledger_livemode` (1 définition(s))
- `private_finance.set_payment_transaction_integrity` (1 définition(s))
- `private_finance.set_reservation_fair_growth_snapshot` (1 définition(s))
- `private_finance.signup_deferred_subscription_trigger` (1 définition(s))
- `private_finance.sync_commercial_subscription_commission` (1 définition(s))
- `private_finance.transition_fair_growth_module` (1 définition(s))
- `private_finance.validate_restaurant_subscription_pricing_insert` (1 définition(s))
- `public._commercial_demo_ai_session_lifecycle_cleanup` (1 définition(s))
- `public._commercial_demo_build_snapshot` (2 définition(s))
- `public._commercial_demo_xml_escape` (1 définition(s))
- `public._guard_restaurant_daily_dish_service_day` (1 définition(s))
- `public._touch_restaurant_daily_dish_updated_at` (1 définition(s))
- `public.abandon_payment_attempt_session` (2 définition(s))
- `public.accept_commercial_contract` (1 définition(s))
- `public.accounting_month_start` (1 définition(s))
- `public.acquire_payment_attempt` (1 définition(s))
- `public.actualites_premium_banner_plan` (1 définition(s))
- `public.ad_campaign_conversion_entity_state` (3 définition(s))
- `public.admin_activate_all_feature_flags` (2 définition(s))
- `public.admin_add_commercial_compensation_adjustment` (2 définition(s))
- `public.admin_apply_feature_flag_preset` (1 définition(s))
- `public.admin_approve_marketing_campaign` (1 définition(s))
- `public.admin_approve_marketing_item` (1 définition(s))
- `public.admin_approve_marketing_outreach_draft` (1 définition(s))
- `public.admin_archive_catalog_collection` (1 définition(s))
- `public.admin_archive_chef_table_drop` (1 définition(s))
- `public.admin_archive_cuisine` (1 définition(s))
- `public.admin_archive_loyalty_tier` (1 définition(s))
- `public.admin_archive_subscription_plan` (1 définition(s))
- `public.admin_cancel_marketing_item` (1 définition(s))
- `public.admin_cancel_notification_campaign` (1 définition(s))
- `public.admin_complete_manual_marketing_delivery` (1 définition(s))
- `public.admin_complete_manual_marketing_item` (1 définition(s))
- `public.admin_configure_developer_connect_transfer` (1 définition(s))
- `public.admin_correct_commercial_signature` (2 définition(s))
- `public.admin_correct_commercial_signature_status` (1 définition(s))
- `public.admin_create_marketing_campaign_bundle` (1 définition(s))
- `public.admin_delete_restaurant` (1 définition(s))
- `public.admin_delete_review` (2 définition(s))
- `public.admin_delete_user_account` (2 définition(s))
- `public.admin_dispatch_notification_campaign` (5 définition(s))
- `public.admin_duplicate_notification_campaign` (1 définition(s))
- `public.admin_estimate_marketing_audience` (1 définition(s))
- `public.admin_generate_tok_payable_invoice` (1 définition(s))
- `public.admin_generate_tok_payable_invoices_all` (1 définition(s))
- `public.admin_get_accounting_period_control` (2 définition(s))
- `public.admin_get_accounting_stripe_reconciliation` (1 définition(s))
- `public.admin_get_actualites_sponsored_posts` (1 définition(s))
- `public.admin_get_cancellation_fraud_metrics` (1 définition(s))
- `public.admin_get_fair_growth_reconciliation` (2 définition(s))
- `public.admin_get_feature_flag_audit_logs` (1 définition(s))
- `public.admin_get_marketing_autopilot_dashboard` (1 définition(s))
- `public.admin_get_marketing_overview` (2 définition(s))
- `public.admin_get_marketplace_alerts` (1 définition(s))
- `public.admin_get_production_health` (4 définition(s))
- `public.admin_get_refund_queue` (2 définition(s))
- `public.admin_get_reservation_billing_history` (3 définition(s))
- `public.admin_get_restaurant_admin_detail` (2 définition(s))
- `public.admin_get_security_abuse_summary` (2 définition(s))
- `public.admin_get_tok_one_metrics` (1 définition(s))
- `public.admin_get_user_admin_detail` (2 définition(s))
- `public.admin_get_user_governance_alerts` (1 définition(s))
- `public.admin_link_real_user_restaurant` (1 définition(s))
- `public.admin_list_google_booking_setups` (2 définition(s))
- `public.admin_list_marketing_automations` (1 définition(s))
- `public.admin_list_marketing_calendar` (1 définition(s))
- `public.admin_list_marketing_campaigns` (1 définition(s))
- `public.admin_list_marketing_contacts` (1 définition(s))
- `public.admin_list_marketing_deliveries` (2 définition(s))
- `public.admin_list_marketing_integrations` (1 définition(s))
- `public.admin_list_marketing_outreach` (1 définition(s))
- `public.admin_list_real_restaurant_owners` (1 définition(s))
- `public.admin_list_real_restaurants_for_assignment` (1 définition(s))
- `public.admin_list_user_storage_objects_for_deletion` (1 définition(s))
- `public.admin_list_users` (3 définition(s))
- `public.admin_mark_restaurant_invoice_paid` (1 définition(s))
- `public.admin_normalize_cuisine_slug` (2 définition(s))
- `public.admin_normalize_notification_channels` (1 définition(s))
- `public.admin_normalize_notification_cities` (1 définition(s))
- `public.admin_normalize_notification_roles` (1 définition(s))
- `public.admin_prepare_marketing_automation_action` (1 définition(s))
- `public.admin_reconcile_marketplace_alerts` (1 définition(s))
- `public.admin_record_marketing_outreach_result` (1 définition(s))
- `public.admin_record_restaurant_admin_action` (3 définition(s))
- `public.admin_record_supabase_advisor_snapshot` (1 définition(s))
- `public.admin_reorder_catalog_collections` (1 définition(s))
- `public.admin_reply_review` (3 définition(s))
- `public.admin_reset_dashboard_logs` (3 définition(s))
- `public.admin_retry_marketing_delivery` (1 définition(s))
- `public.admin_reveal_manual_delivery_target` (1 définition(s))
- `public.admin_review_courier_profile` (1 définition(s))
- `public.admin_review_signup_application` (9 définition(s))
- `public.admin_review_social_post_promotion` (1 définition(s))
- `public.admin_save_catalog_collection` (1 définition(s))
- `public.admin_save_chef_table_drop` (2 définition(s))
- `public.admin_save_loyalty_tier` (1 définition(s))
- `public.admin_save_notification_campaign` (1 définition(s))
- `public.admin_save_subscription_plan` (2 définition(s))
- `public.admin_seed_default_flags` (1 définition(s))
- `public.admin_send_test_notification_campaign` (1 définition(s))
- `public.admin_set_accounting_month_lock` (1 définition(s))
- `public.admin_set_marketing_global_pause` (1 définition(s))
- `public.admin_set_user_account_status` (1 définition(s))
- `public.admin_set_user_roles` (6 définition(s))
- `public.admin_simulate_marketing_automation` (1 définition(s))
- `public.admin_submit_signup_application` (5 définition(s))
- `public.admin_suppress_marketing_contact` (1 définition(s))
- `public.admin_sync_marketing_client_consents` (1 définition(s))
- `public.admin_sync_marketing_prospect_catalog` (1 définition(s))
- `public.admin_take_marketplace_alert` (1 définition(s))
- `public.admin_toggle_feature_flag` (5 définition(s))
- `public.admin_update_google_booking_setup` (1 définition(s))
- `public.admin_update_launch_pack_fulfillment` (1 définition(s))
- `public.admin_update_launch_pack_status` (1 définition(s))
- `public.admin_update_marketing_integration` (1 définition(s))
- `public.admin_update_marketing_provider_control` (1 définition(s))
- `public.admin_update_marketplace_alert` (2 définition(s))
- `public.admin_update_restaurant_admin_state` (1 définition(s))
- `public.admin_update_restaurant_disabled_features` (1 définition(s))
- `public.admin_update_review_status` (2 définition(s))
- `public.admin_upsert_cuisine` (1 définition(s))
- `public.admin_upsert_marketing_asset` (1 définition(s))
- `public.admin_upsert_marketing_automation` (1 définition(s))
- `public.admin_upsert_marketing_backlink` (1 définition(s))
- `public.admin_upsert_marketing_calendar_item` (1 définition(s))
- `public.admin_upsert_marketing_campaign` (1 définition(s))
- `public.admin_upsert_marketing_contact` (1 définition(s))
- `public.admin_upsert_marketing_outreach_draft` (1 définition(s))
- `public.admin_upsert_marketing_outreach_opportunity` (1 définition(s))
- `public.admin_upsert_marketing_outreach_target` (1 définition(s))
- `public.admin_validate_developer_statement` (2 définition(s))
- `public.advance_print_order_state` (1 définition(s))
- `public.advance_print_reorder_state` (1 définition(s))
- `public.apply_checkout_benefits` (2 définition(s))
- `public.apply_miamz_metadata_to_order` (1 définition(s))
- `public.apply_miamz_metadata_to_reservation` (1 définition(s))
- `public.apply_miamz_priority_to_support` (1 définition(s))
- `public.apply_progressive_offer_to_reservation` (3 définition(s))
- `public.apply_reservation_loyalty_points` (1 définition(s))
- `public.assert_accounting_month_open` (1 définition(s))
- `public.assert_commercial_demo_production_rpc_allowed` (1 définition(s))
- `public.assert_meal_formula_service_capacity` (2 définition(s))
- `public.atomic_record_checkout_finance` (1 définition(s))
- `public.atomic_record_dispute_finance` (1 définition(s))
- `public.atomic_record_refund_finance` (1 définition(s))
- `public.attach_reservations_to_invoice` (1 définition(s))
- `public.audit_commercial_compensation_profile` (1 définition(s))
- `public.audit_commercial_prospect_followup` (2 définition(s))
- `public.auth_can_access_branch` (1 définition(s))
- `public.auth_can_access_cart` (1 définition(s))
- `public.auth_can_access_cart_item` (1 définition(s))
- `public.auth_can_access_credit_note` (1 définition(s))
- `public.auth_can_access_legacy_invoice` (1 définition(s))
- `public.auth_can_access_order` (1 définition(s))
- `public.auth_can_access_order_item` (1 définition(s))
- `public.auth_can_access_reservation_record` (1 définition(s))
- `public.auth_can_manage_dish` (1 définition(s))
- `public.auth_can_manage_dish_modifier_group` (1 définition(s))
- `public.auth_can_manage_dispatch_job` (1 définition(s))
- `public.auth_can_manage_floor_plan_variant` (1 définition(s))
- `public.auth_can_manage_inventory_item` (1 définition(s))
- `public.auth_can_manage_menu_category` (1 définition(s))
- `public.auth_can_manage_order_delivery` (1 définition(s))
- `public.auth_can_manage_reservation_slot` (1 définition(s))
- `public.auth_can_manage_table_layout_override` (1 définition(s))
- `public.auth_can_view_courier` (1 définition(s))
- `public.auth_can_view_dispatch_job` (1 définition(s))
- `public.auth_can_view_order_delivery` (1 définition(s))
- `public.auth_can_view_reservation_slot` (1 définition(s))
- `public.auth_is_admin` (1 définition(s))
- `public.auth_is_super_admin` (2 définition(s))
- `public.auth_owns_courier` (1 définition(s))
- `public.auth_owns_restaurant` (1 définition(s))
- `public.auto_arrive_overdue_reservations` (2 définition(s))
- `public.auto_disable_sold_out_special_offer` (1 définition(s))
- `public.bind_payment_attempt_stripe` (1 définition(s))
- `public.block_commercial_demo_account_production_transaction` (1 définition(s))
- `public.block_commercial_demo_side_effect_row` (1 définition(s))
- `public.block_commercial_demo_social_side_effect_row` (1 définition(s))
- `public.branch_restaurant_is_demo` (1 définition(s))
- `public.broadcast_topic_notification` (1 définition(s))
- `public.build_accounting_month_official_totals` (2 définition(s))
- `public.calculate_match_group_discount` (4 définition(s))
- `public.calculate_progressive_offer_discount` (1 définition(s))
- `public.can_access_print_restaurant` (1 définition(s))
- `public.can_view_commercial_demo_branch` (3 définition(s))
- `public.can_view_commercial_demo_post` (2 définition(s))
- `public.can_view_commercial_demo_restaurant` (6 définition(s))
- `public.cancel_fair_growth_module` (1 définition(s))
- `public.cancel_order_by_customer` (2 définition(s))
- `public.cancel_order_by_restaurant` (1 définition(s))
- `public.cancel_payment_attempt` (1 définition(s))
- `public.cancel_reservation` (1 définition(s))
- `public.cancel_reservation_by_customer` (4 définition(s))
- `public.cancel_reservation_by_restaurant` (3 définition(s))
- `public.capture_signup_application_draft` (1 définition(s))
- `public.check_restaurant_ai_quota` (3 définition(s))
- `public.claim_developer_statement_transfer` (1 définition(s))
- `public.claim_due_marketing_items` (1 définition(s))
- `public.claim_finance_outbox` (1 définition(s))
- `public.claim_gift_points` (3 définition(s))
- `public.claim_gift_points_v2` (1 définition(s))
- `public.claim_google_actions_center_outbox` (2 définition(s))
- `public.claim_image_analysis_job_by_image_id` (2 définition(s))
- `public.claim_image_analysis_jobs` (2 définition(s))
- `public.claim_marketing_deliveries` (2 définition(s))
- `public.claim_marketing_item` (1 définition(s))
- `public.claim_miamz_birthday_bonus` (2 définition(s))
- `public.claim_next_match_group_capture_candidate` (1 définition(s))
- `public.claim_notification_deliveries` (1 définition(s))
- `public.claim_print_fulfillment_jobs` (2 définition(s))
- `public.claim_restaurant_daily_dish_run` (2 définition(s))
- `public.claim_restaurant_image_discovery_jobs` (2 définition(s))
- `public.claim_restaurant_image_discovery_jobs_for_edge` (1 définition(s))
- `public.claim_restaurant_image_truth_reviews` (1 définition(s))
- `public.claim_restaurant_subscription_activation_jobs` (2 définition(s))
- `public.claim_stripe_webhook_event` (1 définition(s))
- `public.cleanup_expired_groups` (1 définition(s))
- `public.close_due_match_groups` (2 définition(s))
- `public.commercial_build_signature_snapshot` (3 définition(s))
- `public.commercial_demo_ai_apply_retention` (1 définition(s))
- `public.commercial_demo_ai_archive_conversation` (1 définition(s))
- `public.commercial_demo_ai_claim_request` (2 définition(s))
- `public.commercial_demo_ai_complete_chat_request` (1 définition(s))
- `public.commercial_demo_ai_complete_daily_dish_request` (1 définition(s))
- `public.commercial_demo_ai_complete_visual_request` (1 définition(s))
- `public.commercial_demo_ai_fail_request` (1 définition(s))
- `public.commercial_demo_ai_generate_visual` (1 définition(s))
- `public.commercial_demo_ai_generation_history` (1 définition(s))
- `public.commercial_demo_ai_history` (1 définition(s))
- `public.commercial_demo_ai_prune_provider_failures` (1 définition(s))
- `public.commercial_demo_ai_respond` (1 définition(s))
- `public.commercial_demo_can_access_user` (1 définition(s))
- `public.commercial_demo_confirm_test_payment` (1 définition(s))
- `public.commercial_demo_create_order` (2 définition(s))
- `public.commercial_demo_create_reservation` (1 définition(s))
- `public.commercial_demo_create_session` (1 définition(s))
- `public.commercial_demo_current_restaurant_id` (1 définition(s))
- `public.commercial_demo_current_user_is_restricted` (1 définition(s))
- `public.commercial_demo_get_checkout_order` (1 définition(s))
- `public.commercial_demo_get_snapshot` (1 définition(s))
- `public.commercial_demo_reset_session` (1 définition(s))
- `public.commercial_demo_shared_restaurant_id` (1 définition(s))
- `public.commercial_demo_transition` (1 définition(s))
- `public.commercial_demo_transition_reservation` (1 définition(s))
- `public.commercial_demo_user_is_restricted` (2 définition(s))
- `public.commercial_plan_key` (1 définition(s))
- `public.commercial_refusal_reason_codes_valid` (2 définition(s))
- `public.commercial_signature_commission_chf` (1 définition(s))
- `public.commercial_sprint_bonus_chf` (1 définition(s))
- `public.complete_developer_statement_transfer` (1 définition(s))
- `public.complete_finance_outbox` (1 définition(s))
- `public.complete_image_analysis_job` (2 définition(s))
- `public.complete_marketing_delivery` (1 définition(s))
- `public.complete_marketing_item` (1 définition(s))
- `public.complete_print_fulfillment_job` (2 définition(s))
- `public.complete_restaurant_subscription_activation_job` (1 définition(s))
- `public.complete_stripe_webhook_event` (1 définition(s))
- `public.compute_order_acceptance_deadline` (1 définition(s))
- `public.compute_order_discount_from_payload` (1 définition(s))
- `public.compute_restaurant_reservation_fees` (3 définition(s))
- `public.confirm_fair_growth_module_activation` (1 définition(s))
- `public.consume_chef_table_checkout_hold` (1 définition(s))
- `public.consume_crm_mfa_recovery_challenge` (1 définition(s))
- `public.count_restaurant_actualites_like_audience` (1 définition(s))
- `public.create_chef_table_checkout_hold` (1 définition(s))
- `public.create_match_group` (3 définition(s))
- `public.create_order_with_items` (6 définition(s))
- `public.create_order_with_items_idempotent` (1 définition(s))
- `public.create_premium_actualites_banner` (1 définition(s))
- `public.create_social_post_boost_atomic` (1 définition(s))
- `public.create_support_incident` (1 définition(s))
- `public.create_zero_attente_checkout_hold` (3 définition(s))
- `public.credit_order_loyalty_points` (4 définition(s))
- `public.credit_reservation_loyalty_points` (3 définition(s))
- `public.crm_session_has_sensitive_access` (1 définition(s))
- `public.decrement_stock` (1 définition(s))
- `public.delete_user_gdpr_cascade` (3 définition(s))
- `public.delete_user_gdpr_cascade_unguarded` (3 définition(s))
- `public.directory_claim_follow_signup_review` (1 définition(s))
- `public.directory_name_looks_legal_entity` (1 définition(s))
- `public.directory_public_name_looks_navigation_or_promo` (1 définition(s))
- `public.directory_registry_name_needs_commercial_verification` (1 définition(s))
- `public.dispatch_due_notification_campaigns` (2 définition(s))
- `public.donate_points_for_meal` (3 définition(s))
- `public.enforce_commercial_demo_restaurant_active` (1 définition(s))
- `public.enforce_launch_gate` (1 définition(s))
- `public.enforce_restaurateur_signup_role` (2 définition(s))
- `public.enforce_signed_commercial_prospect_status_owner` (1 définition(s))
- `public.enqueue_birthday_notifications` (1 définition(s))
- `public.enqueue_deliveries` (1 définition(s))
- `public.enqueue_directory_cuisine_research` (1 définition(s))
- `public.enqueue_google_actions_center_updates` (1 définition(s))
- `public.enqueue_image_analysis_job` (1 définition(s))
- `public.enqueue_notification` (3 définition(s))
- `public.ensure_guest_profile` (1 définition(s))
- `public.ensure_restaurant_booking_channels` (1 définition(s))
- `public.ensure_restaurant_google_booking_setup` (2 définition(s))
- `public.ensure_social_post_boost_integrity` (2 définition(s))
- `public.estimate_campaign_audience` (4 définition(s))
- `public.fail_image_analysis_job` (2 définition(s))
- `public.fail_payment_attempt` (1 définition(s))
- `public.fail_restaurant_subscription_activation_job` (1 définition(s))
- `public.fence_restaurant_payment_capture` (1 définition(s))
- `public.finalize_paid_print_order` (1 définition(s))
- `public.finalize_payment_attempt` (1 définition(s))
- `public.finalize_progressive_offer` (1 définition(s))
- `public.find_nearby_couriers` (2 définition(s))
- `public.finish_print_fulfillment_submission` (1 définition(s))
- `public.floor_plan_autoassign_reservation` (1 définition(s))
- `public.floor_plan_reservation_duration_minutes` (1 définition(s))
- `public.floor_plan_table_is_free` (1 définition(s))
- `public.generate_monthly_invoices` (5 définition(s))
- `public.generate_reference_number` (1 définition(s))
- `public.generate_restaurant_payout_invoice` (6 définition(s))
- `public.generate_restaurant_payout_invoice_rpc` (1 définition(s))
- `public.generate_tok_payable_invoice` (4 définition(s))
- `public.generate_tok_payable_invoices_all` (4 définition(s))
- `public.generate_tok_reservation_fee_invoice` (4 définition(s))
- `public.generate_tok_reservation_fee_invoices_all` (3 définition(s))
- `public.get_ad_campaign_internal_test_metrics` (1 définition(s))
- `public.get_admin_commercial_activity` (1 définition(s))
- `public.get_admin_commercial_commission_summary` (3 définition(s))
- `public.get_admin_commercial_refusal_overview` (1 définition(s))
- `public.get_campaign_stats` (3 définition(s))
- `public.get_commercial_compensation_summary` (5 définition(s))
- `public.get_commercial_prospect_commission_summary` (3 définition(s))
- `public.get_commercial_prospect_followups` (2 définition(s))
- `public.get_commercial_prospect_signup_referral` (1 définition(s))
- `public.get_customer_crm_profiles` (2 définition(s))
- `public.get_customer_orders_dashboard` (3 définition(s))
- `public.get_gift_stats` (2 définition(s))
- `public.get_launch_gate_state` (1 définition(s))
- `public.get_match_group_capture_candidates` (3 définition(s))
- `public.get_match_group_pending_authorizations` (1 définition(s))
- `public.get_match_group_public_feed` (4 définition(s))
- `public.get_meal_formula_service_availability` (2 définition(s))
- `public.get_meal_formula_service_key` (1 définition(s))
- `public.get_my_restaurant_ai_subscriptions` (1 définition(s))
- `public.get_order_customers` (1 définition(s))
- `public.get_payable_invoice_lines` (1 définition(s))
- `public.get_payment_integrity_anomalies` (2 définition(s))
- `public.get_payout_invoice_lines` (2 définition(s))
- `public.get_profile_order_window` (1 définition(s))
- `public.get_profile_reservation_service_settings` (1 définition(s))
- `public.get_progressive_offer_service_key` (1 définition(s))
- `public.get_reservation_customers` (1 définition(s))
- `public.get_reservation_fee_invoice_lines` (2 définition(s))
- `public.get_reservation_slot_capacity` (1 définition(s))
- `public.get_restaurant_actualites_access` (2 définition(s))
- `public.get_restaurant_actualites_insights` (2 définition(s))
- `public.get_restaurant_actualites_premium_banner_audience` (1 définition(s))
- `public.get_restaurant_ai_usage` (2 définition(s))
- `public.get_restaurant_campaign_activity` (2 définition(s))
- `public.get_restaurant_comparison` (6 définition(s))
- `public.get_restaurant_credit_usage` (5 définition(s))
- `public.get_restaurant_image_truth_stats` (1 définition(s))
- `public.get_restaurant_order_capacity_state` (2 définition(s))
- `public.get_restaurant_orders_dashboard` (4 définition(s))
- `public.get_restaurant_payment_history` (2 définition(s))
- `public.get_restaurant_performance` (6 définition(s))
- `public.get_restaurant_recommendations` (2 définition(s))
- `public.get_restaurant_reservation_slot_availability` (4 définition(s))
- `public.get_restaurant_review_submission_state` (1 définition(s))
- `public.get_restaurant_subscription_self_service_state` (1 définition(s))
- `public.get_social_feed` (2 définition(s))
- `public.get_social_feed_premium_banners` (2 définition(s))
- `public.get_social_feed_v2` (5 définition(s))
- `public.get_social_post_thread` (1 définition(s))
- `public.get_stripe_webhook_signing_secrets` (1 définition(s))
- `public.get_total_donated_meals` (2 définition(s))
- `public.get_total_donated_points` (1 définition(s))
- `public.get_user_miamz_benefit_state` (1 définition(s))
- `public.guard_ad_campaign_client_write` (4 définition(s))
- `public.guard_commercial_demo_image_analysis_job` (1 définition(s))
- `public.guard_commercial_role_assignment` (3 définition(s))
- `public.guard_human_signup_review` (2 définition(s))
- `public.guard_online_order_confirmation_requires_payment` (1 définition(s))
- `public.guard_reservation_table_slot` (1 définition(s))
- `public.guard_restaurant_image_client_writes` (1 définition(s))
- `public.guard_restaurant_tok_credit_spend` (1 définition(s))
- `public.handle_email_confirmation` (2 définition(s))
- `public.handle_new_user` (8 définition(s))
- `public.has_role` (1 définition(s))
- `public.immutable_unaccent_lower` (1 définition(s))
- `public.increment_ad_campaign_metric` (1 définition(s))
- `public.invoke_directory_image_truth_worker` (2 définition(s))
- `public.invoke_marketing_orchestrator_cron` (1 définition(s))
- `public.invoke_thefork_image_recovery_worker` (1 définition(s))
- `public.invoke_thefork_official_site_discovery_worker` (2 définition(s))
- `public.is_feature_flag_active` (2 définition(s))
- `public.is_flat_arrival_billing_candidate` (1 définition(s))
- `public.is_print_admin` (1 définition(s))
- `public.is_restaurant_internal_actor` (1 définition(s))
- `public.is_special_paid_order_locked` (2 définition(s))
- `public.is_special_paid_reservation_locked` (2 définition(s))
- `public.is_truthy_text` (1 définition(s))
- `public.jsonb_target_pages_has_actualites` (2 définition(s))
- `public.launch_gate_enabled` (1 définition(s))
- `public.launch_rpc_allowed` (1 définition(s))
- `public.launch_table_allowed` (1 définition(s))
- `public.log_audit` (1 définition(s))
- `public.log_feature_flag_audit` (1 définition(s))
- `public.mark_directory_cuisine_job_satisfied` (1 définition(s))
- `public.mark_match_group_authorization_failed` (1 définition(s))
- `public.mark_match_group_member_authorized` (4 définition(s))
- `public.mark_match_group_member_capture_failed` (3 définition(s))
- `public.mark_match_group_member_capture_failed_claimed` (1 définition(s))
- `public.mark_match_group_member_captured` (2 définition(s))
- `public.mark_match_group_member_captured_claimed` (1 définition(s))
- `public.mark_noshow_reservations` (1 définition(s))
- `public.mark_order_seen_by_restaurant` (1 définition(s))
- `public.mark_overdue_order_acceptance` (1 définition(s))
- `public.mark_refund_applied` (2 définition(s))
- `public.mark_reservation_honored` (4 définition(s))
- `public.mark_signup_application_draft_finalized` (1 définition(s))
- `public.marketing_actor_user_id` (1 définition(s))
- `public.marketing_asset_require_current_rights` (1 définition(s))
- `public.marketing_autopilot_append_only` (1 définition(s))
- `public.marketing_autopilot_payload_is_safe` (1 définition(s))
- `public.marketing_autopilot_touch_updated_at` (1 définition(s))
- `public.marketing_bff_encryption_secret` (1 définition(s))
- `public.marketing_capture_lawful_basis_evidence` (1 définition(s))
- `public.marketing_channel_availability` (1 définition(s))
- `public.marketing_contact_is_eligible` (2 définition(s))
- `public.marketing_contact_matches_filter` (2 définition(s))
- `public.marketing_delivery_status_rank` (1 définition(s))
- `public.marketing_email_cadence` (1 définition(s))
- `public.marketing_events_append_only` (1 définition(s))
- `public.marketing_finalize_item_if_terminal` (1 définition(s))
- `public.marketing_html_escape` (1 définition(s))
- `public.marketing_lawful_basis_evidence_append_only` (1 définition(s))
- `public.marketing_log_delivery_transition` (1 définition(s))
- `public.marketing_mask_target` (1 définition(s))
- `public.marketing_normalize_swiss_phone` (1 définition(s))
- `public.marketing_redact_audit_record` (3 définition(s))
- `public.marketing_require_admin` (1 définition(s))
- `public.marketing_require_service_role` (1 définition(s))
- `public.marketing_runtime_enabled` (1 définition(s))
- `public.marketing_scheduler_ready` (1 définition(s))
- `public.marketing_touch_delivery` (1 définition(s))
- `public.marketing_touch_version` (1 définition(s))
- `public.marketing_validate_audience_filter` (2 définition(s))
- `public.marketing_validate_campaign_transition` (1 définition(s))
- `public.marketing_validate_outreach_url` (1 définition(s))
- `public.marketing_write_audit` (1 définition(s))
- `public.match_restaurant_images` (1 définition(s))
- `public.miamz_priority_from_rank` (1 définition(s))
- `public.miamz_priority_rank` (1 définition(s))
- `public.miamz_tier_rank` (1 définition(s))
- `public.moderate_social_target` (1 définition(s))
- `public.normalize_campaign_target_criteria` (1 définition(s))
- `public.normalize_photo_ai_usage_credit_units` (2 définition(s))
- `public.normalize_restaurant_city_alias` (1 définition(s))
- `public.normalize_restaurant_operational_state` (1 définition(s))
- `public.normalize_search_text` (1 définition(s))
- `public.notify_restaurant_follow` (1 définition(s))
- `public.notify_social_comment` (2 définition(s))
- `public.notify_social_repost` (1 définition(s))
- `public.notify_tok_one_members_new_offer` (1 définition(s))
- `public.ops_decide_incident` (1 définition(s))
- `public.ops_register_incident` (3 définition(s))
- `public.ops_touch_incident_updated_at` (1 définition(s))
- `public.pause_fair_growth_module` (1 définition(s))
- `public.prepare_actualites_media_for_indexing` (3 définition(s))
- `public.prepare_print_fulfillment_submission` (1 définition(s))
- `public.prepare_restaurant_media_for_indexing` (1 définition(s))
- `public.preserve_terminal_restaurant_image_truth_review` (1 définition(s))
- `public.prevent_accounting_period_mutation_when_locked` (1 définition(s))
- `public.prevent_commercial_compensation_profile_event_mutation` (1 définition(s))
- `public.prevent_commercial_contract_evidence_mutation` (1 définition(s))
- `public.prevent_commercial_demo_event_mutation` (1 définition(s))
- `public.prevent_commercial_followup_history_mutation` (2 définition(s))
- `public.prevent_commercial_prospect_followup_delete` (2 définition(s))
- `public.prevent_duplicate_ad_campaign_conversion_entity` (1 définition(s))
- `public.prevent_financial_ledger_mutation` (1 définition(s))
- `public.prevent_locked_developer_statement_mutation` (3 définition(s))
- `public.prevent_restaurant_demo_status_change` (1 définition(s))
- `public.prevent_restaurant_image_reassignment` (1 définition(s))
- `public.print_order_state_rank` (1 définition(s))
- `public.prioritize_thefork_image_truth_reviews` (2 définition(s))
- `public.process_fair_growth_module_credit` (1 définition(s))
- `public.process_pending_ad_campaign_conversions` (3 définition(s))
- `public.protect_canonical_commercial_demo_inert_state` (1 définition(s))
- `public.protect_commercial_demo_account_boundary` (2 définition(s))
- `public.protect_commercial_demo_account_mapping` (2 définition(s))
- `public.protect_demo_restaurant_identity` (1 définition(s))
- `public.protect_directory_listing_state` (1 définition(s))
- `public.protect_directory_public_name_quality` (2 définition(s))
- `public.protect_generated_print_format` (1 définition(s))
- `public.protect_match_group_capture_claim_fields` (1 définition(s))
- `public.protect_restaurant_moderation_state` (2 définition(s))
- `public.provision_commercial_demo_account` (2 définition(s))
- `public.public_restaurant_all_sources_enabled` (3 définition(s))
- `public.publish_restaurant_daily_dish` (2 définition(s))
- `public.queue_directory_image_candidate` (1 définition(s))
- `public.queue_notification_deliveries` (3 définition(s))
- `public.queue_restaurant_image_discovery_after_name_verification` (2 définition(s))
- `public.rate_limit_consume` (1 définition(s))
- `public.read_meal_formula_max_tables_per_service` (1 définition(s))
- `public.recompute_restaurant_review_stats` (1 définition(s))
- `public.record_actualites_order_conversion_trigger` (2 définition(s))
- `public.record_actualites_reservation_conversion_trigger` (2 définition(s))
- `public.record_actualites_sponsored_conversion` (4 définition(s))
- `public.record_ad_campaign_event` (8 définition(s))
- `public.record_commercial_earning` (1 définition(s))
- `public.record_commercial_prospect_followup` (4 définition(s))
- `public.record_daily_slot_spin` (3 définition(s))
- `public.record_marketing_provider_event` (1 définition(s))
- `public.record_marketplace_checkout_ledger` (4 définition(s))
- `public.record_marketplace_dispute_ledger` (1 définition(s))
- `public.record_marketplace_refund_ledger` (2 définition(s))
- `public.record_print_provider_event` (1 définition(s))
- `public.record_refund_status` (1 définition(s))
- `public.record_reservation_fee_adjustment` (1 définition(s))
- `public.record_restaurant_onboarding_payment_method_ready` (1 définition(s))
- `public.record_restaurant_onboarding_state` (1 définition(s))
- `public.record_restaurant_subscription_cancelled_before_payment` (1 définition(s))
- `public.record_restaurant_subscription_invoice_paid` (1 définition(s))
- `public.record_restaurant_subscription_invoice_payment_failed` (1 définition(s))
- `public.record_restaurant_subscription_payment_reversed` (1 définition(s))
- `public.record_social_feed_event` (5 définition(s))
- `public.record_social_feed_event_v2` (1 définition(s))
- `public.record_stripe_connect_fee_ledger` (1 définition(s))
- `public.record_stripe_tax_fee_ledger` (2 définition(s))
- `public.recount_progressive_offer_reservations` (1 définition(s))
- `public.redeem_loyalty_points` (2 définition(s))
- `public.refresh_commercial_statement` (1 définition(s))
- `public.refresh_developer_statement` (3 définition(s))
- `public.refresh_match_group_discount` (2 définition(s))
- `public.refresh_progressive_offer_reservations` (1 définition(s))
- `public.refresh_restaurant_daily_kpis_for_date` (4 définition(s))
- `public.refresh_restaurant_daily_kpis_recent_days` (1 définition(s))
- `public.refresh_social_comment_counts` (1 définition(s))
- `public.refresh_social_post_counts` (1 définition(s))
- `public.reject_signup_review_event_mutation` (1 définition(s))
- `public.release_chef_table_checkout_hold` (1 définition(s))
- `public.release_match_group_capture_claim` (1 définition(s))
- `public.release_zero_attente_checkout_hold` (1 définition(s))
- `public.renew_match_group_capture_cancellation_claim` (1 définition(s))
- `public.renew_match_group_capture_claim` (1 définition(s))
- `public.request_fair_growth_module` (1 définition(s))
- `public.request_invoiced_reservation_fee_reconciliation` (1 définition(s))
- `public.resolve_google_booking_slug` (3 définition(s))
- `public.resolve_miamz_benefit_state` (1 définition(s))
- `public.resolve_swiss_vat_rate_bps` (1 définition(s))
- `public.restaurant_actualites_subscription_plan` (1 définition(s))
- `public.restaurant_actualites_week_window` (1 définition(s))
- `public.restaurant_actualites_weekly_post_count` (1 définition(s))
- `public.restaurant_address_city_is_consistent` (1 définition(s))
- `public.restaurant_archive_anti_waste_offer` (1 définition(s))
- `public.restaurant_archive_flash_sale` (1 définition(s))
- `public.restaurant_can_create_actualites_post` (2 définition(s))
- `public.restaurant_cuisine_evidence_reject_generic_osm_regional` (1 définition(s))
- `public.restaurant_cuisines_mark_osm_job_satisfied` (1 définition(s))
- `public.restaurant_delete_media_metadata` (1 définition(s))
- `public.restaurant_get_google_booking_setup` (1 définition(s))
- `public.restaurant_has_elite_crm_subscription` (2 définition(s))
- `public.restaurant_is_approved_for_publication` (3 définition(s))
- `public.restaurant_is_demo` (1 définition(s))
- `public.restaurant_is_publicly_visible` (3 définition(s))
- `public.restaurant_is_thefork_catalog_member` (3 définition(s))
- `public.restaurant_mark_admin_correction_done` (2 définition(s))
- `public.restaurant_mark_review_read` (1 définition(s))
- `public.restaurant_reply_review` (2 définition(s))
- `public.restaurant_report_review` (1 définition(s))
- `public.restaurant_save_floor_plan_assignments` (2 définition(s))
- `public.restaurant_save_floor_plan_furniture` (1 définition(s))
- `public.restaurant_save_floor_plan_layouts` (1 définition(s))
- `public.restaurant_save_floor_plan_layouts_v2` (1 définition(s))
- `public.restaurant_save_floor_plan_template` (1 définition(s))
- `public.restaurant_save_floor_plan_variant_v2` (1 définition(s))
- `public.restaurant_save_floor_plan_workspace` (1 définition(s))
- `public.restaurant_save_floor_plan_workspace_v2` (1 définition(s))
- `public.restaurant_set_cover_media` (1 définition(s))
- `public.restaurant_set_cuisines` (1 définition(s))
- `public.restaurant_set_preferred_table` (1 définition(s))
- `public.restaurant_source_is_publicly_displayable` (3 définition(s))
- `public.restaurant_stripe_connect_ready` (1 définition(s))
- `public.restaurant_subscription_genuine_client` (2 définition(s))
- `public.restaurant_update_anti_waste_offer_status` (1 définition(s))
- `public.restaurant_update_flash_sale_status` (1 définition(s))
- `public.restaurant_update_google_booking_setup` (2 définition(s))
- `public.restaurant_upsert_anti_waste_offer` (1 définition(s))
- `public.restaurant_upsert_flash_sale` (1 définition(s))
- `public.restaurants_enqueue_directory_cuisine_osm_research` (1 définition(s))
- `public.restore_special_offer_stock` (1 définition(s))
- `public.resume_fair_growth_module` (1 définition(s))
- `public.rls_auto_enable` (1 définition(s))
- `public.run_social_post_promotion_status_sync` (1 définition(s))
- `public.seal_payment_attempt_request` (1 définition(s))
- `public.search_actualites_posts` (1 définition(s))
- `public.search_restaurant_images` (2 définition(s))
- `public.search_restaurants_catalog` (7 définition(s))
- `public.search_restaurants_catalog_page` (9 définition(s))
- `public.search_restaurants_nearby` (1 définition(s))
- `public.send_gift_points` (3 définition(s))
- `public.send_gift_points_v2` (1 définition(s))
- `public.service_apply_directory_cuisine_evidence` (1 définition(s))
- `public.service_apply_directory_cuisine_osm_evidence` (1 définition(s))
- `public.service_claim_directory_cuisine_jobs` (1 définition(s))
- `public.service_claim_directory_cuisine_osm_jobs` (1 définition(s))
- `public.service_claim_directory_image_jobs` (1 définition(s))
- `public.service_claim_directory_name_jobs` (1 définition(s))
- `public.service_claim_thefork_image_discovery_jobs` (2 définition(s))
- `public.service_claim_thefork_image_truth_reviews` (1 définition(s))
- `public.service_claim_thefork_official_site_discovery_jobs` (4 définition(s))
- `public.service_clear_marketing_auth_attempt` (1 définition(s))
- `public.service_complete_marketing_ai_run` (1 définition(s))
- `public.service_consume_marketing_auth_attempt` (1 définition(s))
- `public.service_dispatch_marketing_notification_item` (1 définition(s))
- `public.service_execute_marketing_admin_operation` (1 définition(s))
- `public.service_execute_marketing_autopilot_operation` (1 définition(s))
- `public.service_execute_marketing_outreach_operation` (1 définition(s))
- `public.service_finalize_marketing_web_session` (1 définition(s))
- `public.service_get_marketing_auth_challenge` (1 définition(s))
- `public.service_get_marketing_web_session` (1 définition(s))
- `public.service_import_marketing_prospect_coordinates` (1 définition(s))
- `public.service_list_marketing_ai_runs` (1 définition(s))
- `public.service_materialize_marketing_deliveries` (1 définition(s))
- `public.service_prepare_marketing_email_delivery` (1 définition(s))
- `public.service_record_marketing_email_sent` (1 définition(s))
- `public.service_revoke_marketing_web_session` (1 définition(s))
- `public.service_send_marketing_in_app_delivery` (1 définition(s))
- `public.service_start_marketing_ai_run` (1 définition(s))
- `public.service_store_marketing_auth_challenge` (1 définition(s))
- `public.service_unsubscribe_marketing_delivery` (1 définition(s))
- `public.set_floor_plan_variants_updated_at` (1 définition(s))
- `public.set_restaurant_slug` (1 définition(s))
- `public.set_social_reaction` (1 définition(s))
- `public.set_test_role` (1 définition(s))
- `public.settle_google_actions_center_outbox` (1 définition(s))
- `public.settle_google_actions_center_outbox_claim` (1 définition(s))
- `public.settle_notification_delivery` (1 définition(s))
- `public.settle_restaurant_image_discovery_job` (1 définition(s))
- `public.settle_restaurant_image_truth_review` (1 définition(s))
- `public.signup_restaurateur_onboarding_payment_ready` (4 définition(s))
- `public.social_campaign_targeting_score` (3 définition(s))
- `public.social_comment_counts_trigger` (1 définition(s))
- `public.social_post_counts_trigger` (1 définition(s))
- `public.social_report_auto_block_author` (1 définition(s))
- `public.submit_verified_review` (2 définition(s))
- `public.swiss_vat_from_tax_inclusive_cents` (1 définition(s))
- `public.sync_actualites_media_image_index` (4 définition(s))
- `public.sync_directory_name_job` (1 définition(s))
- `public.sync_launch_gate_clock` (1 définition(s))
- `public.sync_net_http_response_cache` (1 définition(s))
- `public.sync_restaurant_media_image_index` (1 définition(s))
- `public.sync_signup_application` (5 définition(s))
- `public.sync_social_post_promotion_status` (1 définition(s))
- `public.tg_guard_locked_order_status` (1 définition(s))
- `public.tg_guard_locked_reservation_status` (1 définition(s))
- `public.tg_orders_guard_acceptance_capacity` (1 définition(s))
- `public.tg_reservations_apply_confirmation_deposit` (1 définition(s))
- `public.tg_reservations_autoassign_table` (1 définition(s))
- `public.tg_reservations_set_confirmed_at` (1 définition(s))
- `public.toggle_social_save` (1 définition(s))
- `public.tok_connect_is_partner_member` (1 définition(s))
- `public.tok_connect_restaurant_grant_enabled` (1 définition(s))
- `public.tok_credit_balance_from_usage` (1 définition(s))
- `public.tok_slugify` (1 définition(s))
- `public.touch_ai_updated_at` (2 définition(s))
- `public.touch_group_member_order_updated_at` (1 définition(s))
- `public.touch_restaurant_contracts_updated_at` (1 définition(s))
- `public.touch_supplier_catalog_product` (1 définition(s))
- `public.touch_support_incident_last_message` (1 définition(s))
- `public.touch_support_incident_updated_at` (1 définition(s))
- `public.track_google_booking_event` (3 définition(s))
- `public.track_order_event` (1 définition(s))
- `public.trg_ensure_order_number` (1 définition(s))
- `public.trg_ensure_reservation_reference` (1 définition(s))
- `public.trigger_anti_gaspi_subscription_alert` (2 définition(s))
- `public.trigger_chefs_table_subscription_alert` (2 définition(s))
- `public.trigger_flash_sale_subscription_alert` (2 définition(s))
- `public.trigger_invoice_notification` (1 définition(s))
- `public.trigger_order_status_notification` (3 définition(s))
- `public.trigger_recompute_review_stats` (1 définition(s))
- `public.trigger_refresh_kpis` (1 définition(s))
- `public.trigger_reservation_notifications` (2 définition(s))
- `public.trigger_restaurant_review_notification` (1 définition(s))
- `public.trigger_review_reply_notification` (1 définition(s))
- `public.trigger_review_report_admin_notification` (1 définition(s))
- `public.update_client_profile` (1 définition(s))
- `public.update_loyalty_tier` (1 définition(s))
- `public.update_restaurant_images_search_fields` (1 définition(s))
- `public.update_restaurant_reservation_status_safe` (6 définition(s))
- `public.update_restaurant_search_vector` (2 définition(s))
- `public.update_updated_at_column` (1 définition(s))
- `public.upsert_match_group_member_order` (3 définition(s))
- `public.upsert_supplier_catalog_products` (1 définition(s))
- `public.user_can_access_support_incident` (1 définition(s))
- `public.user_has_miamz_benefit` (1 définition(s))
- `public.user_has_verified_restaurant_consumption` (1 définition(s))
- `public.validate_and_create_reservation` (14 définition(s))
- `public.validate_and_create_reservation_safe` (4 définition(s))
- `public.validate_commercial_compensation_profile` (2 définition(s))
- `public.validate_service_settings_json` (1 définition(s))
- `public.validate_signup_document_manifest` (2 définition(s))
- `public.verification_document_is_committed` (2 définition(s))
- `public.verify_internal_cron_secret` (2 définition(s))

</details>

<details><summary>index (649)</summary>

- `IF` (2 définition(s))
- `ad_campaign_attribution_touches_active_idx` (1 définition(s))
- `ad_campaign_attribution_touches_entity_idx` (1 définition(s))
- `ad_campaign_attribution_touches_tracking_call_unique` (1 définition(s))
- `ad_campaign_attribution_touches_user_time_idx` (1 définition(s))
- `ad_campaign_conversion_entity_unique` (1 définition(s))
- `ad_campaign_event_transport_unique` (1 définition(s))
- `ad_campaign_internal_test_events_campaign_time_idx` (1 définition(s))
- `ad_campaign_internal_test_events_restaurant_time_idx` (1 définition(s))
- `admin_loyalty_change_history_entity_created_idx` (1 définition(s))
- `admin_marketplace_alert_events_alert_id_idx` (1 définition(s))
- `admin_review_action_history_admin_created_idx` (2 définition(s))
- `admin_review_action_history_review_created_idx` (2 définition(s))
- `ai_accounting_insights_period_idx` (2 définition(s))
- `ai_admin_events_severity_created_idx` (2 définition(s))
- `ai_conversations_restaurant_scope_idx` (2 définition(s))
- `ai_conversations_support_incident_created_idx` (1 définition(s))
- `ai_conversations_user_created_idx` (2 définition(s))
- `ai_generated_assets_restaurant_created_idx` (2 définition(s))
- `ai_messages_conversation_created_idx` (3 définition(s))
- `ai_performance_snapshots_scope_date_idx` (2 définition(s))
- `ai_restaurant_tasks_feature_idx` (2 définition(s))
- `ai_restaurant_tasks_restaurant_created_idx` (2 définition(s))
- `ai_safety_rules_active_idx` (2 définition(s))
- `ai_security_events_status_created_idx` (2 définition(s))
- `ai_support_tickets_restaurant_status_idx` (2 définition(s))
- `ai_support_tickets_user_created_idx` (2 définition(s))
- `ai_usage_logs_function_created_idx` (2 définition(s))
- `ai_usage_logs_restaurant_created_idx` (2 définition(s))
- `ai_usage_logs_restaurant_feature_created_idx` (2 définition(s))
- `anti_waste_offers_archive_restaurant_idx` (1 définition(s))
- `audit_log_entity_id_created_at_idx` (1 définition(s))
- `audit_log_new_target_user_id_created_at_idx` (1 définition(s))
- `audit_log_new_user_id_created_at_idx` (1 définition(s))
- `audit_log_old_target_user_id_created_at_idx` (1 définition(s))
- `audit_log_old_user_id_created_at_idx` (1 définition(s))
- `campaign_studio_runs_restaurant_created_idx` (1 définition(s))
- `campaign_studio_runs_restaurant_idempotency_uidx` (1 définition(s))
- `campaign_studio_runs_status_created_idx` (1 définition(s))
- `chef_table_checkout_holds_session_idx` (1 définition(s))
- `chef_table_drops_archive_active_idx` (1 définition(s))
- `chef_table_drops_vip_active_idx` (1 définition(s))
- `commercial_contract_acceptances_user_accepted_idx` (1 définition(s))
- `commercial_demo_accounts_active_idx` (1 définition(s))
- `commercial_demo_accounts_created_by_idx` (1 définition(s))
- `commercial_demo_accounts_demo_restaurant_idx` (1 définition(s))
- `commercial_demo_ai_conversations_session_tool_idx` (1 définition(s))
- `commercial_demo_ai_generations_session_created_idx` (1 définition(s))
- `commercial_demo_ai_generations_session_identity_idx` (1 définition(s))
- `commercial_demo_ai_messages_conversation_created_idx` (1 définition(s))
- `commercial_demo_ai_messages_session_created_idx` (1 définition(s))
- `commercial_demo_ai_messages_session_identity_idx` (1 définition(s))
- `commercial_demo_ai_provider_failures_occurred_idx` (1 définition(s))
- `commercial_demo_ai_requests_commercial_day_budget_idx` (1 définition(s))
- `commercial_demo_ai_requests_global_day_budget_idx` (1 définition(s))
- `commercial_demo_ai_requests_processing_idx` (1 définition(s))
- `commercial_demo_ai_requests_provider_failures_idx` (1 définition(s))
- `commercial_demo_ai_requests_session_created_idx` (1 définition(s))
- `commercial_demo_ai_storage_cleanup_enqueued_idx` (1 définition(s))
- `commercial_demo_delivery_missions_owner_idx` (1 définition(s))
- `commercial_demo_events_reservation_idx` (1 définition(s))
- `commercial_demo_order_events_session_created_idx` (1 définition(s))
- `commercial_demo_order_sessions_one_active_idx` (1 définition(s))
- `commercial_demo_order_sessions_restaurant_idx` (1 définition(s))
- `commercial_demo_orders_owner_created_idx` (1 définition(s))
- `commercial_demo_reservations_owner_created_idx` (1 définition(s))
- `commercial_demo_reservations_restaurant_idx` (1 définition(s))
- `commercial_demo_reservations_session_date_idx` (1 définition(s))
- `commercial_prospect_catalog_marketing_cursor_idx` (1 définition(s))
- `consent_receipts_marketing_user_latest_idx` (1 définition(s))
- `crm_mfa_recovery_cleanup_idx` (1 définition(s))
- `crm_mfa_recovery_user_created_idx` (1 définition(s))
- `cuisines_archived_name_idx` (1 définition(s))
- `cuisines_slug_unique_idx` (1 définition(s))
- `customer_memory_events_item_created_idx` (1 définition(s))
- `customer_memory_events_user_created_idx` (1 définition(s))
- `customer_memory_items_expiry_idx` (1 définition(s))
- `customer_memory_items_user_key_uidx` (1 définition(s))
- `customer_memory_items_user_status_idx` (1 définition(s))
- `daily_slot_spins_user_request_uidx` (1 définition(s))
- `feature_flag_audit_logs_flag_created_idx` (1 définition(s))
- `flash_sales_archive_restaurant_idx` (1 définition(s))
- `gift_points_claim_code_lower_unique` (1 définition(s))
- `google_actions_center_bookings_google_id_idx` (1 définition(s))
- `google_actions_center_bookings_idempotency_idx` (1 définition(s))
- `google_actions_center_bookings_reservation_idx` (1 définition(s))
- `google_actions_center_bookings_restaurant_created_idx` (1 définition(s))
- `google_actions_center_bookings_user_id_idx` (1 définition(s))
- `group_member_orders_capture_candidates_idx` (1 définition(s))
- `group_member_orders_group_status_idx` (1 définition(s))
- `group_member_orders_user_created_idx` (1 définition(s))
- `idx_ad_campaign_events_campaign_type_time` (1 définition(s))
- `idx_ad_campaign_events_launch_user_time` (1 définition(s))
- `idx_ad_campaign_events_restaurant_type_time` (1 définition(s))
- `idx_ad_campaign_pending_conversions_campaign` (1 définition(s))
- `idx_ad_campaign_pending_conversions_entity` (1 définition(s))
- `idx_ad_campaigns_launch_restaurant_status_window` (1 définition(s))
- `idx_ad_campaigns_launch_status_scheduled` (1 définition(s))
- `idx_admin_supabase_advisor_snapshots_captured_at` (1 définition(s))
- `idx_ai_generated_assets_launch_status_created` (1 définition(s))
- `idx_ai_usage_costs_period_feature` (1 définition(s))
- `idx_ai_usage_costs_restaurant_created` (1 définition(s))
- `idx_ai_usage_logs_feature_created` (1 définition(s))
- `idx_ai_usage_logs_launch_status_created` (1 définition(s))
- `idx_audit_log_created_at_id_desc` (1 définition(s))
- `idx_carts_user_id` (1 définition(s))
- `idx_collection_restaurants_restaurant_id` (1 définition(s))
- `idx_commercial_commissions_deal_type` (1 définition(s))
- `idx_commercial_commissions_rep_status` (1 définition(s))
- `idx_commercial_compensation_adjustments_created_by` (1 définition(s))
- `idx_commercial_compensation_adjustments_restaurant` (1 définition(s))
- `idx_commercial_compensation_adjustments_user_period` (1 définition(s))
- `idx_commercial_compensation_profile_events_user_effective` (1 définition(s))
- `idx_commercial_compensation_profiles_team_lead` (1 définition(s))
- `idx_commercial_earning_event_fk` (1 définition(s))
- `idx_commercial_earning_ledger_fk` (1 définition(s))
- `idx_commercial_earning_restaurant_fk` (1 définition(s))
- `idx_commercial_earning_reversal_fk` (1 définition(s))
- `idx_commercial_earning_user_period` (1 définition(s))
- `idx_commercial_followup_history_actor_changed` (2 définition(s))
- `idx_commercial_followup_history_source_changed` (2 définition(s))
- `idx_commercial_followup_history_status_changed` (2 définition(s))
- `idx_commercial_followups_commission_lifecycle` (1 définition(s))
- `idx_commercial_followups_owner_status_updated` (2 définition(s))
- `idx_commercial_followups_refusal_reasons` (2 définition(s))
- `idx_commercial_prospect_followups_assigned_to` (1 définition(s))
- `idx_commercial_prospect_followups_compensation_mode` (1 définition(s))
- `idx_commercial_prospect_followups_last_contacted_by` (1 définition(s))
- `idx_commercial_prospect_followups_next_follow_up` (1 définition(s))
- `idx_commercial_prospect_followups_signed_at` (1 définition(s))
- `idx_commercial_prospect_followups_signed_by` (1 définition(s))
- `idx_commercial_prospect_followups_signed_restaurant_id` (1 définition(s))
- `idx_commercial_prospect_followups_status` (1 définition(s))
- `idx_commercial_signup_referrals_current` (1 définition(s))
- `idx_commercial_statements_created_by_fk` (1 définition(s))
- `idx_commercial_statements_user_status` (1 définition(s))
- `idx_commercial_subscription_commissions_accounting` (1 définition(s))
- `idx_commercial_subscription_commissions_pending` (1 définition(s))
- `idx_consent_receipts_user_recorded` (1 définition(s))
- `idx_consent_receipts_version_recorded` (1 définition(s))
- `idx_conversations_order` (2 définition(s))
- `idx_courier_documents_courier_id` (1 définition(s))
- `idx_courier_earnings_courier` (2 définition(s))
- `idx_courier_earnings_dispatch_job_id` (1 définition(s))
- `idx_courier_locations_recent` (2 définition(s))
- `idx_courier_shifts_courier_id` (1 définition(s))
- `idx_credit_notes_invoice_id` (1 définition(s))
- `idx_cron_job_run_details_start_time` (1 définition(s))
- `idx_daily_slot_spins_user_created` (1 définition(s))
- `idx_daily_slot_spins_user_date_attempt` (1 définition(s))
- `idx_delivery_batches_courier_id` (1 définition(s))
- `idx_delivery_routes_batch_id` (1 définition(s))
- `idx_delivery_routes_dispatch_job_id` (1 définition(s))
- `idx_developer_statements_status_period` (1 définition(s))
- `idx_developer_stripe_transfers_retry` (1 définition(s))
- `idx_directory_claim_requests_status` (1 définition(s))
- `idx_directory_removal_requests_status` (1 définition(s))
- `idx_dish_modifier_groups_dish_id` (1 définition(s))
- `idx_dishes_menu_category_id` (1 définition(s))
- `idx_dispatch_attempts_courier` (2 définition(s))
- `idx_dispatch_attempts_job` (2 définition(s))
- `idx_dispatch_jobs_courier` (2 définition(s))
- `idx_dispatch_jobs_order` (2 définition(s))
- `idx_dispatch_jobs_order_status` (1 définition(s))
- `idx_edge_function_audit_logs_actor_created` (1 définition(s))
- `idx_edge_function_audit_logs_created_at` (1 définition(s))
- `idx_edge_function_audit_logs_function_created` (1 définition(s))
- `idx_edge_function_audit_logs_ip_created_10k` (1 définition(s))
- `idx_edge_function_audit_logs_status_created_10k` (1 définition(s))
- `idx_event_store_entity` (1 définition(s))
- `idx_finance_outbox_dispatch` (1 définition(s))
- `idx_finance_outbox_reclaim` (1 définition(s))
- `idx_financial_ledger_account_effective` (1 définition(s))
- `idx_financial_ledger_mode_payment_intent` (1 définition(s))
- `idx_financial_ledger_restaurant_effective` (1 définition(s))
- `idx_financial_ledger_reversal_of` (1 définition(s))
- `idx_financial_ledger_stripe_event` (1 définition(s))
- `idx_floor_plan_save_operations_created_at` (1 définition(s))
- `idx_floor_plan_variants_branch_updated` (1 définition(s))
- `idx_floor_plan_variants_created_by` (1 définition(s))
- `idx_floor_plan_variants_restaurant_id` (1 définition(s))
- `idx_fraud_signals_user_id` (1 définition(s))
- `idx_google_actions_center_outbox_due` (1 définition(s))
- `idx_google_actions_center_outbox_expired_lease` (1 définition(s))
- `idx_google_actions_center_outbox_recent` (1 définition(s))
- `idx_group_member_orders_capture_claim_queue` (1 définition(s))
- `idx_group_member_orders_live_capture_by_restaurant` (1 définition(s))
- `idx_inventory_items_branch_id` (1 définition(s))
- `idx_invoices_order_id` (1 définition(s))
- `idx_launch_pack_fulfillments_pack` (1 définition(s))
- `idx_launch_packs_ai_quota_active` (1 définition(s))
- `idx_loyalty_transactions_birthday_bonus_once_year` (1 définition(s))
- `idx_loyalty_transactions_order_reward_once` (1 définition(s))
- `idx_loyalty_transactions_redeem_once` (1 définition(s))
- `idx_loyalty_transactions_reservation_redeem_once` (1 définition(s))
- `idx_loyalty_transactions_reservation_reward_once` (1 définition(s))
- `idx_loyalty_transactions_user_created_at` (1 définition(s))
- `idx_marketing_budget_periods_period_month` (1 définition(s))
- `idx_menu_categories_branch_id` (1 définition(s))
- `idx_messages_conversation` (2 définition(s))
- `idx_net_http_response_id` (1 définition(s))
- `idx_notifications_birthday_once_year` (1 définition(s))
- `idx_notifications_tok_one_offer_dedupe` (1 définition(s))
- `idx_notifications_user_created_at` (1 définition(s))
- `idx_ops_incident_events_incident_created` (1 définition(s))
- `idx_ops_incidents_fingerprint_active` (1 définition(s))
- `idx_ops_incidents_source_event` (1 définition(s))
- `idx_ops_incidents_status_last_seen` (1 définition(s))
- `idx_order_events_order_id` (1 définition(s))
- `idx_order_items_anti_waste_offer_id` (1 définition(s))
- `idx_order_items_menu_item_id` (1 définition(s))
- `idx_order_items_order_id` (1 définition(s))
- `idx_order_items_restaurant_id` (1 définition(s))
- `idx_order_refunds_issue_id_fk` (1 définition(s))
- `idx_order_refunds_order_id_fk` (1 définition(s))
- `idx_order_status_history_order_id` (1 définition(s))
- `idx_orders_branch_id` (1 définition(s))
- `idx_orders_checkout_id` (2 définition(s))
- `idx_orders_courier_id` (1 définition(s))
- `idx_orders_invoice_id` (1 définition(s))
- `idx_orders_launch_restaurant_updated_at` (1 définition(s))
- `idx_orders_metadata_checkout_group_id` (2 définition(s))
- `idx_orders_metadata_stripe_session_id` (2 définition(s))
- `idx_orders_pending_checkout_group_metadata` (1 définition(s))
- `idx_orders_pending_payment_attempt_metadata` (1 définition(s))
- `idx_orders_pending_payment_created_at` (1 définition(s))
- `idx_orders_pending_payment_watchdog` (1 définition(s))
- `idx_orders_refund_queue` (1 définition(s))
- `idx_orders_restaurant_acceptance_deadline` (1 définition(s))
- `idx_orders_restaurant_capacity_slot` (1 définition(s))
- `idx_orders_restaurant_id` (1 définition(s))
- `idx_orders_restaurant_status_created_at` (2 définition(s))
- `idx_orders_scheduled_delivery_dispatch` (1 définition(s))
- `idx_orders_user_created_at` (2 définition(s))
- `idx_orders_user_id` (1 définition(s))
- `idx_payment_attempts_owner_created` (1 définition(s))
- `idx_payment_attempts_restaurant_created` (1 définition(s))
- `idx_payment_attempts_state_lease` (1 définition(s))
- `idx_payment_intents_order_id_fk` (1 définition(s))
- `idx_payment_intents_user_id_fk` (1 définition(s))
- `idx_payment_transactions_order` (2 définition(s))
- `idx_payment_transactions_order_charge_once` (1 définition(s))
- `idx_payment_transactions_order_id_fk` (1 définition(s))
- `idx_payment_transactions_order_status_type` (2 définition(s))
- `idx_payment_transactions_payment_attempt_fk` (1 définition(s))
- `idx_payment_transactions_provider_created` (1 définition(s))
- `idx_payment_transactions_stripe_event_fk` (1 définition(s))
- `idx_payment_transactions_stripe_payment_intent` (2 définition(s))
- `idx_payment_transactions_stripe_session_charge_succeeded` (1 définition(s))
- `idx_payment_transactions_stripe_session_status_type` (1 définition(s))
- `idx_payment_transactions_succeeded_charge_session_kind` (1 définition(s))
- `idx_payment_transactions_user_status_created_10k` (1 définition(s))
- `idx_payment_transactions_zero_attente_reservation_lookup` (1 définition(s))
- `idx_payment_transactions_zero_attente_session_unique` (1 définition(s))
- `idx_payouts_recipient_id` (1 définition(s))
- `idx_platform_cost_entries_period_source` (1 définition(s))
- `idx_platform_cost_entries_restaurant_created` (1 définition(s))
- `idx_platform_revenue_entries_period_source` (1 définition(s))
- `idx_platform_revenue_entries_restaurant_created` (1 définition(s))
- `idx_print_documents_restaurant_created` (1 définition(s))
- `idx_print_exports_restaurant_created` (1 définition(s))
- `idx_print_fulfillment_jobs_due` (1 définition(s))
- `idx_print_order_events_order_created` (1 définition(s))
- `idx_print_order_items_order` (1 définition(s))
- `idx_print_orders_provider_reference` (1 définition(s))
- `idx_print_orders_restaurant_created` (1 définition(s))
- `idx_print_orders_status_updated` (1 définition(s))
- `idx_print_provider_events_reference_created` (1 définition(s))
- `idx_print_provider_products_product_active` (1 définition(s))
- `idx_print_quotes_expires` (1 définition(s))
- `idx_print_quotes_restaurant_created` (1 définition(s))
- `idx_print_reorders_order_created` (1 définition(s))
- `idx_print_reorders_restaurant_created` (1 définition(s))
- `idx_print_reorders_status_updated` (1 définition(s))
- `idx_profiles_birthday_lookup` (1 définition(s))
- `idx_promo_code_uses_order_once` (1 définition(s))
- `idx_proof_of_delivery_dispatch_job_unique` (1 définition(s))
- `idx_refund_operations_payment_intent` (1 définition(s))
- `idx_refund_operations_stripe_event_fk` (1 définition(s))
- `idx_refund_operations_target` (1 définition(s))
- `idx_reservation_flat_fee_charges_restaurant` (1 définition(s))
- `idx_reservation_progressive_offers_one_active_per_day` (1 définition(s))
- `idx_reservation_progressive_offers_public` (1 définition(s))
- `idx_reservation_progressive_offers_recurrence_lookup` (1 définition(s))
- `idx_reservation_progressive_offers_restaurant` (1 définition(s))
- `idx_reservation_slots_reservation_table` (1 définition(s))
- `idx_reservation_slots_table_reservation_10k` (1 définition(s))
- `idx_reservation_table_layout_overrides_branch_date` (1 définition(s))
- `idx_reservation_table_layout_overrides_unique` (1 définition(s))
- `idx_reservation_tables_branch_sector` (1 définition(s))
- `idx_reservations_active_slot_capacity_10k` (1 définition(s))
- `idx_reservations_active_user_slot_10k` (1 définition(s))
- `idx_reservations_billing_pending` (1 définition(s))
- `idx_reservations_branch_id` (1 définition(s))
- `idx_reservations_cancellation_audit` (1 définition(s))
- `idx_reservations_confirmation_deadline_active` (1 définition(s))
- `idx_reservations_launch_restaurant_slot_status` (1 définition(s))
- `idx_reservations_no_show_review` (1 définition(s))
- `idx_reservations_pending_fee_billing` (1 définition(s))
- `idx_reservations_pending_payment_attempt_metadata` (1 définition(s))
- `idx_reservations_progressive_offer` (1 définition(s))
- `idx_reservations_progressive_offer_cancelled_reentry` (1 définition(s))
- `idx_reservations_refund_queue` (1 définition(s))
- `idx_reservations_reservation_fee_invoice_id` (1 définition(s))
- `idx_reservations_restaurant_id` (1 définition(s))
- `idx_reservations_restaurant_status_created_at` (2 définition(s))
- `idx_reservations_user_created_at` (2 définition(s))
- `idx_reservations_user_id` (1 définition(s))
- `idx_restaurant_activation_metrics_restaurant` (1 définition(s))
- `idx_restaurant_admin_correction_requests_notification` (1 définition(s))
- `idx_restaurant_admin_correction_requests_restaurant_status` (1 définition(s))
- `idx_restaurant_ai_subscriptions_cancel_at_period_end` (1 définition(s))
- `idx_restaurant_ai_subscriptions_lifecycle` (1 définition(s))
- `idx_restaurant_ai_subscriptions_schedule_id` (1 définition(s))
- `idx_restaurant_ai_subscriptions_stripe_checkout_session_id` (1 définition(s))
- `idx_restaurant_ai_subscriptions_stripe_subscription_id` (1 définition(s))
- `idx_restaurant_branches_restaurant_id` (1 définition(s))
- `idx_restaurant_contracts_restaurant_signed_at` (1 définition(s))
- `idx_restaurant_contracts_signed_by` (1 définition(s))
- `idx_restaurant_credit_packs_active_position` (1 définition(s))
- `idx_restaurant_credit_purchases_pack` (1 définition(s))
- `idx_restaurant_credit_purchases_payment_attempt_fk` (1 définition(s))
- `idx_restaurant_credit_purchases_restaurant_paid` (1 définition(s))
- `idx_restaurant_deals_sales_rep_created` (1 définition(s))
- `idx_restaurant_deals_status_paid` (1 définition(s))
- `idx_restaurant_image_discovery_claim` (1 définition(s))
- `idx_restaurant_image_truth_claim` (1 définition(s))
- `idx_restaurant_image_truth_restaurant_status` (1 définition(s))
- `idx_restaurant_image_truth_sha256` (1 définition(s))
- `idx_restaurant_invoice_line_items_invoice_id` (1 définition(s))
- `idx_restaurant_invoice_line_items_restaurant_time` (1 définition(s))
- `idx_restaurant_invoice_line_items_unique_source_kind` (1 définition(s))
- `idx_restaurant_invoices_restaurant_number` (1 définition(s))
- `idx_restaurant_invoices_subscription_lifecycle` (1 définition(s))
- `idx_restaurant_invoices_type` (1 définition(s))
- `idx_restaurant_launch_packs_restaurant` (1 définition(s))
- `idx_restaurant_launch_packs_status` (1 définition(s))
- `idx_restaurant_leads_assigned_created` (1 définition(s))
- `idx_restaurant_leads_status_created` (1 définition(s))
- `idx_restaurant_media_storage_object` (1 définition(s))
- `idx_restaurant_onboarding_state_events_application_time` (1 définition(s))
- `idx_restaurant_onboarding_state_events_restaurant_time` (1 définition(s))
- `idx_restaurant_stripe_adjustments_restaurant_created` (1 définition(s))
- `idx_restaurant_stripe_adjustments_status_created` (1 définition(s))
- `idx_restaurant_subscription_activation_claim` (1 définition(s))
- `idx_restaurant_thefork_catalog_restaurant_id` (3 définition(s))
- `idx_restaurants_active_created_at` (2 définition(s))
- `idx_restaurants_city_slug_unique` (1 définition(s))
- `idx_restaurants_directory_source_reference` (1 définition(s))
- `idx_restaurants_order_capacity_controls` (1 définition(s))
- `idx_restaurants_owner_id` (2 définition(s))
- `idx_restaurants_public_catalog_normalized_city_trgm` (1 définition(s))
- `idx_restaurants_public_catalog_visible_city_trgm` (1 définition(s))
- `idx_restaurants_search` (2 définition(s))
- `idx_restaurants_slug_active` (1 définition(s))
- `idx_restaurants_stripe_account` (1 définition(s))
- `idx_restaurants_stripe_connect_ready` (1 définition(s))
- `idx_reviews_restaurant_id` (1 définition(s))
- `idx_sales_representatives_status_zone` (1 définition(s))
- `idx_search_logs_user_id` (1 définition(s))
- `idx_signup_application_documents_application` (1 définition(s))
- `idx_signup_application_review_events_application` (1 définition(s))
- `idx_signup_applications_status` (1 définition(s))
- `idx_signup_applications_user_role` (1 définition(s))
- `idx_stripe_webhook_events_failed_retry` (1 définition(s))
- `idx_stripe_webhook_events_mode_status` (1 définition(s))
- `idx_stripe_webhook_events_processed_at` (1 définition(s))
- `idx_stripe_webhook_events_processing_status` (1 définition(s))
- `idx_stripe_webhook_events_reclaimable` (1 définition(s))
- `idx_stripe_webhook_events_type_processed_at` (2 définition(s))
- `idx_supplier_catalog_products_freshness` (1 définition(s))
- `idx_supplier_catalog_products_lookup` (1 définition(s))
- `idx_supplier_catalog_products_priced` (1 définition(s))
- `idx_supplier_catalog_syncs_recent` (1 définition(s))
- `idx_support_messages_ticket` (2 définition(s))
- `idx_support_tickets_user` (2 définition(s))
- `idx_tok_connect_access_tokens_client_revoked` (1 définition(s))
- `idx_tok_connect_access_tokens_token_hash` (1 définition(s))
- `idx_tok_connect_agent_runs_partner_created` (1 définition(s))
- `idx_tok_connect_agent_runs_pending_approval` (1 définition(s))
- `idx_tok_connect_agent_runs_restaurant_status` (1 définition(s))
- `idx_tok_connect_api_requests_client_created` (1 définition(s))
- `idx_tok_connect_clients_partner_id` (1 définition(s))
- `idx_tok_connect_mcp_action_idempotency_expiry` (1 définition(s))
- `idx_tok_connect_partner_members_user_id` (1 définition(s))
- `idx_tok_connect_restaurant_grants_partner_restaurant` (1 définition(s))
- `idx_tok_connect_restaurant_grants_restaurant_id` (1 définition(s))
- `idx_tok_connect_webhook_deliveries_endpoint_status` (1 définition(s))
- `idx_tok_connect_webhook_deliveries_retry` (1 définition(s))
- `idx_tok_connect_webhook_endpoints_partner_id` (1 définition(s))
- `idx_tok_one_apple_original_transaction` (1 définition(s))
- `idx_tok_one_apple_transaction` (1 définition(s))
- `idx_tok_one_billing_provider_user` (1 définition(s))
- `idx_tok_one_subscriptions_entitled_users` (1 définition(s))
- `idx_tok_one_subscriptions_stripe_checkout_session_id` (1 définition(s))
- `idx_tok_one_subscriptions_stripe_subscription_id` (1 définition(s))
- `idx_tok_one_subscriptions_user_id` (1 définition(s))
- `idx_tok_one_subscriptions_user_status_period` (1 définition(s))
- `idx_user_addresses_user_id` (1 définition(s))
- `idx_user_payment_methods_user_id` (1 définition(s))
- `idx_user_profiles_birthday_lookup` (1 définition(s))
- `idx_user_referrals_referrer_id` (1 définition(s))
- `idx_user_subscriptions_user_day` (1 définition(s))
- `idx_wallet_transactions_wallet_id` (1 définition(s))
- `image_analysis_jobs_status_created_idx` (1 définition(s))
- `loyalty_gift_received_once` (1 définition(s))
- `loyalty_gift_sent_once` (1 définition(s))
- `loyalty_order_primary_reward_once` (1 définition(s))
- `loyalty_reservation_primary_reward_once` (1 définition(s))
- `loyalty_reward_reinstatement_once` (1 définition(s))
- `loyalty_reward_reversal_once` (1 définition(s))
- `loyalty_tiers_status_min_points_idx` (1 définition(s))
- `marketing_admin_auth_challenges_expiry_idx` (1 définition(s))
- `marketing_admin_auth_challenges_user_expiry_idx` (1 définition(s))
- `marketing_admin_login_limits_cleanup_idx` (1 définition(s))
- `marketing_admin_web_sessions_expiry_idx` (1 définition(s))
- `marketing_admin_web_sessions_user_expiry_idx` (1 définition(s))
- `marketing_ai_runs_campaign_idx` (1 définition(s))
- `marketing_ai_runs_created_at_idx` (1 définition(s))
- `marketing_asset_rights_current_idx` (1 définition(s))
- `marketing_attribution_facts_campaign_time_idx` (1 définition(s))
- `marketing_attribution_facts_type_time_idx` (1 définition(s))
- `marketing_automation_actions_run_idx` (1 définition(s))
- `marketing_automation_runs_created_idx` (1 définition(s))
- `marketing_automation_simulation_receipts_expiry_idx` (1 définition(s))
- `marketing_backlinks_status_idx` (1 définition(s))
- `marketing_calendar_campaign_schedule_idx` (1 définition(s))
- `marketing_calendar_due_idx` (1 définition(s))
- `marketing_calendar_lease_idx` (1 définition(s))
- `marketing_calendar_notification_campaign_unique` (1 définition(s))
- `marketing_campaigns_client_request_unique` (1 définition(s))
- `marketing_contacts_category_prefix_idx` (1 définition(s))
- `marketing_contacts_city_prefix_idx` (1 définition(s))
- `marketing_contacts_commune_idx` (1 définition(s))
- `marketing_contacts_company_size_idx` (1 définition(s))
- `marketing_contacts_display_name_prefix_idx` (1 définition(s))
- `marketing_contacts_display_name_trgm_idx` (1 définition(s))
- `marketing_contacts_eligibility_idx` (1 définition(s))
- `marketing_contacts_email_unique` (1 définition(s))
- `marketing_contacts_list_idx` (1 définition(s))
- `marketing_contacts_next_action_idx` (1 définition(s))
- `marketing_contacts_phone_unique` (1 définition(s))
- `marketing_contacts_postal_code_idx` (1 définition(s))
- `marketing_contacts_source_unique` (1 définition(s))
- `marketing_contacts_status_list_idx` (1 définition(s))
- `marketing_contacts_user_unique` (1 définition(s))
- `marketing_deliveries_contact_idx` (1 définition(s))
- `marketing_deliveries_contact_status_idx` (1 définition(s))
- `marketing_deliveries_due_idx` (1 définition(s))
- `marketing_deliveries_error_code_prefix_idx` (1 définition(s))
- `marketing_deliveries_item_contact_channel_unique` (1 définition(s))
- `marketing_deliveries_item_status_idx` (1 définition(s))
- `marketing_deliveries_item_user_channel_unique` (1 définition(s))
- `marketing_deliveries_list_idx` (1 définition(s))
- `marketing_deliveries_provider_message_unique` (1 définition(s))
- `marketing_deliveries_provider_prefix_idx` (1 définition(s))
- `marketing_deliveries_status_channel_list_idx` (1 définition(s))
- `marketing_events_campaign_time_idx` (1 définition(s))
- `marketing_events_delivery_time_idx` (1 définition(s))
- `marketing_events_provider_unique` (1 définition(s))
- `marketing_lawful_basis_evidence_contact_time_idx` (1 définition(s))
- `marketing_lawful_basis_evidence_source_unique` (1 définition(s))
- `marketing_outreach_drafts_status_idx` (1 définition(s))
- `marketing_outreach_opportunities_status_idx` (1 définition(s))
- `marketing_outreach_opportunities_target_idx` (1 définition(s))
- `marketing_outreach_targets_kind_idx` (1 définition(s))
- `marketing_outreach_targets_status_idx` (1 définition(s))
- `marketing_provider_probes_account_time_idx` (1 définition(s))
- `marketplace_alert_state_history_key_created_idx` (1 définition(s))
- `marketplace_alert_states_status_updated_idx` (1 définition(s))
- `notification_campaigns_due_idx` (1 définition(s))
- `notification_deliveries_notification_channel_unique` (1 définition(s))
- `notification_deliveries_queue_claim_idx` (1 définition(s))
- `notification_deliveries_retry_claim_idx` (1 définition(s))
- `ops_guardian_assessments_evidence_cache_idx` (1 définition(s))
- `ops_guardian_assessments_incident_created_idx` (1 définition(s))
- `ops_guardian_assessments_severity_created_idx` (1 définition(s))
- `ops_guardian_verifications_incident_created_idx` (1 définition(s))
- `ops_incidents_fingerprint_evidence_idx` (1 définition(s))
- `ops_incidents_repairability_status_idx` (1 définition(s))
- `order_groups_public_active_idx` (1 définition(s))
- `order_groups_status_lock_idx` (1 définition(s))
- `order_items_order_id_idx` (1 définition(s))
- `orders_restaurant_user_created_idx` (1 définition(s))
- `orders_review_eligibility_idx` (1 définition(s))
- `rate_limit_buckets_last_hit_at_idx` (1 définition(s))
- `reservation_fee_adjustments_charge_restaurant_idx` (1 définition(s))
- `reservation_fee_adjustments_created_by_idx` (1 définition(s))
- `reservation_fee_adjustments_restaurant_idx` (1 définition(s))
- `reservation_fee_charges_id_restaurant_uidx` (1 définition(s))
- `reservation_fee_charges_invoice_idx` (1 définition(s))
- `reservation_fee_charges_reservation_restaurant_idx` (1 définition(s))
- `reservation_fee_charges_restaurant_idx` (1 définition(s))
- `reservation_fee_charges_zero_revenue_reviewer_idx` (1 définition(s))
- `reservations_acquisition_channel_idx` (1 définition(s))
- `reservations_fair_growth_invoice_idx` (1 définition(s))
- `reservations_id_restaurant_uidx` (1 définition(s))
- `reservations_restaurant_user_date_idx` (1 définition(s))
- `reservations_review_eligibility_idx` (1 définition(s))
- `restaurant_cuisine_evidence_source_idx` (1 définition(s))
- `restaurant_daily_dish_runs_requested_by_idx` (1 définition(s))
- `restaurant_daily_dish_runs_status_idx` (1 définition(s))
- `restaurant_daily_dish_settings_activated_by_idx` (1 définition(s))
- `restaurant_daily_dish_variants_created_by_idx` (1 définition(s))
- `restaurant_daily_dish_variants_parent_idx` (1 définition(s))
- `restaurant_daily_dish_variants_restaurant_idx` (1 définition(s))
- `restaurant_daily_dishes_asset_idx` (1 définition(s))
- `restaurant_daily_dishes_post_idx` (1 définition(s))
- `restaurant_daily_dishes_public_idx` (1 définition(s))
- `restaurant_daily_dishes_published_by_idx` (1 définition(s))
- `restaurant_daily_dishes_variant_idx` (1 définition(s))
- `restaurant_directory_cuisine_jobs_due_idx` (1 définition(s))
- `restaurant_directory_cuisine_osm_jobs_due_idx` (1 définition(s))
- `restaurant_directory_image_jobs_due_idx` (1 définition(s))
- `restaurant_directory_name_jobs_due_idx` (1 définition(s))
- `restaurant_follows_user_idx` (1 définition(s))
- `restaurant_google_booking_events_restaurant_type_idx` (1 définition(s))
- `restaurant_google_booking_setup_help_idx` (1 définition(s))
- `restaurant_google_booking_setup_status_idx` (1 définition(s))
- `restaurant_images_ai_metadata_idx` (1 définition(s))
- `restaurant_images_analysis_status_idx` (1 définition(s))
- `restaurant_images_created_at_idx` (1 définition(s))
- `restaurant_images_detected_objects_idx` (1 définition(s))
- `restaurant_images_embedding_hnsw_idx` (1 définition(s))
- `restaurant_images_food_items_idx` (1 définition(s))
- `restaurant_images_hashtags_idx` (1 définition(s))
- `restaurant_images_ingredients_idx` (1 définition(s))
- `restaurant_images_restaurant_id_idx` (1 définition(s))
- `restaurant_images_restaurant_media_completed_idx` (1 définition(s))
- `restaurant_images_restaurant_media_unique_idx` (1 définition(s))
- `restaurant_images_search_vector_idx` (1 définition(s))
- `restaurant_images_social_post_media_completed_idx` (1 définition(s))
- `restaurant_images_social_post_media_unique_idx` (1 définition(s))
- `restaurant_images_source_idx` (1 définition(s))
- `restaurant_media_one_cover_per_restaurant_idx` (1 définition(s))
- `restaurant_media_storage_object_unique_idx` (1 définition(s))
- `restaurant_paid_module_events_restaurant_created_idx` (1 définition(s))
- `restaurant_paid_modules_cancelled_at_idx` (1 définition(s))
- `restaurant_paid_modules_module_idx` (1 définition(s))
- `restaurant_paid_modules_requested_by_idx` (1 définition(s))
- `restaurant_preferred_tables_branch_idx` (1 définition(s))
- `restaurant_preferred_tables_table_idx` (1 définition(s))
- `restaurants_city_trgm_idx` (1 définition(s))
- `restaurants_cuisine_type_trgm_idx` (1 définition(s))
- `restaurants_name_trgm_idx` (1 définition(s))
- `review_replies_review_author_type_unique_idx` (1 définition(s))
- `review_replies_review_created_idx` (1 définition(s))
- `review_reports_restaurant_created_idx` (1 définition(s))
- `review_reports_review_open_unique_idx` (1 définition(s))
- `review_reports_review_status_idx` (1 définition(s))
- `review_reports_status_created_idx` (1 définition(s))
- `reviews_reported_status_idx` (1 définition(s))
- `reviews_restaurant_rating_created_idx` (1 définition(s))
- `reviews_restaurant_read_created_idx` (1 définition(s))
- `reviews_user_restaurant_idx` (1 définition(s))
- `reviews_user_restaurant_unique` (1 définition(s))
- `signup_application_documents_file_path_key` (1 définition(s))
- `signup_application_drafts_owner_expiry_idx` (1 définition(s))
- `social_comment_reactions_comment_idx` (1 définition(s))
- `social_feed_events_conversion_lookup_idx` (1 définition(s))
- `social_feed_events_internal_actor_idx` (1 définition(s))
- `social_feed_events_post_created_idx` (1 définition(s))
- `social_feed_events_premium_banner_idx` (1 définition(s))
- `social_feed_events_restaurant_created_idx` (1 définition(s))
- `social_feed_events_tracking_call_idx` (1 définition(s))
- `social_feed_feedback_post_unique_idx` (1 définition(s))
- `social_feed_feedback_restaurant_unique_idx` (1 définition(s))
- `social_post_comments_parent_idx` (1 définition(s))
- `social_post_comments_post_created_idx` (1 définition(s))
- `social_post_likes_reaction_idx` (1 définition(s))
- `social_post_likes_user_post_idx` (1 définition(s))
- `social_post_media_alt_text_trgm_idx` (1 définition(s))
- `social_post_media_media_path_unique_idx` (1 définition(s))
- `social_post_media_post_order_idx` (1 définition(s))
- `social_post_metrics_daily_date_idx` (1 définition(s))
- `social_post_premium_banner_deliveries_user_idx` (1 définition(s))
- `social_post_premium_banners_active_idx` (1 définition(s))
- `social_post_promotions_campaign_idx` (1 définition(s))
- `social_post_promotions_post_idx` (1 définition(s))
- `social_post_promotions_restaurant_status_idx` (1 définition(s))
- `social_post_reposts_post_created_idx` (1 définition(s))
- `social_post_saves_user_idx` (1 définition(s))
- `social_posts_audience_segment_created_idx` (1 définition(s))
- `social_posts_body_search_vector_idx` (1 définition(s))
- `social_posts_body_trgm_idx` (1 définition(s))
- `social_posts_campaign_goal_created_idx` (1 définition(s))
- `social_posts_restaurant_created_idx` (1 définition(s))
- `social_posts_restaurant_status_id_idx` (1 définition(s))
- `social_posts_status_created_idx` (1 définition(s))
- `social_posts_type_created_idx` (1 définition(s))
- `social_posts_v2_feed_idx` (1 définition(s))
- `social_reports_open_unique_idx` (1 définition(s))
- `social_reports_status_created_idx` (1 définition(s))
- `support_incident_messages_incident_created_idx` (1 définition(s))
- `support_incidents_chat_conversation_idx` (1 définition(s))
- `support_incidents_chat_source_updated_idx` (1 définition(s))
- `support_incidents_order_idx` (1 définition(s))
- `support_incidents_reservation_idx` (1 définition(s))
- `support_incidents_restaurant_status_idx` (1 définition(s))
- `support_incidents_status_priority_idx` (1 définition(s))
- `support_incidents_user_created_idx` (1 définition(s))
- `support_ops_incident_links_ops_idx` (1 définition(s))
- `support_ops_incident_links_support_idx` (1 définition(s))
- `support_resolution_actions_idempotency_uidx` (1 définition(s))
- `support_resolution_actions_incident_created_idx` (1 définition(s))
- `support_resolution_actions_run_status_idx` (1 définition(s))
- `support_resolution_runs_context_cache_idx` (1 définition(s))
- `support_resolution_runs_incident_created_idx` (1 définition(s))
- `support_resolution_runs_status_created_idx` (1 définition(s))
- `uq_google_actions_center_outbox_pending_day` (1 définition(s))
- `uq_ops_incidents_github_run_id` (1 définition(s))
- `uq_restaurant_image_truth_verified_sha256` (1 définition(s))
- `uq_tok_connect_agent_runs_mcp_idempotency` (1 définition(s))
- `ux_commercial_earning_source` (1 définition(s))
- `ux_commercial_followups_signed_restaurant` (2 définition(s))
- `ux_commercial_signup_referrals_application` (1 définition(s))
- `ux_commercial_statements_active_period` (1 définition(s))
- `ux_commercial_subscription_commissions_invoice` (1 définition(s))
- `ux_developer_statements_period_currency_active` (1 définition(s))
- `ux_developer_stripe_transfers_idempotency` (1 définition(s))
- `ux_developer_stripe_transfers_statement_mode` (1 définition(s))
- `ux_developer_stripe_transfers_stripe_id` (1 définition(s))
- `ux_financial_ledger_mode_payment_intent_asset` (1 définition(s))
- `ux_financial_ledger_source_account_direction` (2 définition(s))
- `ux_payment_attempts_active_restaurant_subscription` (1 définition(s))
- `ux_payment_attempts_active_tok_one_owner` (1 définition(s))
- `ux_payment_attempts_checkout_session_mode` (1 définition(s))
- `ux_payment_attempts_payment_intent_mode` (1 définition(s))
- `ux_payment_attempts_refund_mode` (1 définition(s))
- `ux_payment_attempts_subscription_mode` (1 définition(s))
- `ux_payment_transactions_attempt_order_success` (1 définition(s))
- `ux_payment_transactions_checkout_semantic_charge` (1 définition(s))
- `ux_payment_transactions_refund_allocation` (1 définition(s))
- `ux_payment_transactions_succeeded_charge_session_kind` (1 définition(s))
- `ux_payment_transactions_succeeded_order_charge_session` (1 définition(s))
- `ux_payment_transactions_succeeded_reservation_charge_session` (1 définition(s))
- `ux_platform_cost_entries_stripe_refund` (1 définition(s))
- `ux_platform_revenue_entries_checkout_source` (1 définition(s))
- `ux_platform_revenue_entries_stripe_invoice_source` (1 définition(s))
- `ux_reservation_tables_branch_item_name_ci` (1 définition(s))
- `ux_restaurant_ai_subscriptions_internal_invoice` (1 définition(s))
- `ux_restaurant_ai_subscriptions_signup_application` (1 définition(s))
- `ux_restaurant_credit_purchases_payment_attempt` (1 définition(s))
- `ux_restaurant_invoices_signup_subscription` (1 définition(s))
- `ux_restaurant_invoices_stripe_invoice` (1 définition(s))
- `ux_restaurant_onboarding_state_events_stripe_event_state` (1 définition(s))
- `ux_restaurant_subscription_activation_trigger` (1 définition(s))
- `ux_restaurant_subscription_payment_methods_checkout` (1 définition(s))
- `ux_sales_representatives_user_id` (2 définition(s))

</details>

<details><summary>policy (760)</summary>

- `ad_campaigns.Admins can manage ad campaigns` (1 définition(s))
- `ad_campaigns.Anyone can read active campaigns` (1 définition(s))
- `ad_campaigns.Restaurant owners can manage ad campaigns` (1 définition(s))
- `anti_waste_offers.Anyone can view active offers` (1 définition(s))
- `anti_waste_offers.Restaurant owners can manage offers` (1 définition(s))
- `audit_log.Admins can view audit logs` (1 définition(s))
- `audit_log.Authenticated can insert audit logs` (1 définition(s))
- `chef_table_drops.Admins can manage drops` (1 définition(s))
- `chef_table_drops.Public drops are viewable by everyone` (1 définition(s))
- `delivery_tracking.Restaurant owners can manage delivery tracking` (2 définition(s))
- `delivery_tracking.Users can view their delivery tracking` (2 définition(s))
- `device_tokens.Users can manage their device tokens` (1 définition(s))
- `email_queue.Admins can view email queue` (1 définition(s))
- `email_queue.Authenticated can insert emails` (1 définition(s))
- `favorites.Users can add favorites` (1 définition(s))
- `favorites.Users can remove favorites` (1 définition(s))
- `favorites.Users can view their favorites` (1 définition(s))
- `feature_flags.Admins can manage feature flags` (1 définition(s))
- `feature_flags.Feature flags are viewable by everyone` (1 définition(s))
- `flash_sales.Admins can manage flash sales` (1 définition(s))
- `flash_sales.Anyone can view active flash sales` (1 définition(s))
- `flash_sales.Restaurant owners can manage flash sales` (1 définition(s))
- `gift_points.Authenticated users can send gifts` (1 définition(s))
- `gift_points.Users can view their own gifts` (1 définition(s))
- `group_members.Anyone can view group members` (1 définition(s))
- `group_members.Users can join groups` (1 définition(s))
- `loyalty_transactions.Users can view their own loyalty transactions` (1 définition(s))
- `meal_formula_categories.Anyone can view formula categories` (1 définition(s))
- `meal_formula_categories.Restaurant owners can manage formula categories` (1 définition(s))
- `meal_formulas.Anyone can view active formulas` (1 définition(s))
- `meal_formulas.Restaurant owners can manage formulas` (1 définition(s))
- `menu_items.Anyone can view available menu items` (1 définition(s))
- `menu_items.Restaurant owners can manage menu items` (1 définition(s))
- `notification_campaigns.Admins can manage campaigns` (1 définition(s))
- `notification_deliveries.Users can view their notification deliveries` (1 définition(s))
- `notification_preferences.Users can manage their notification preferences` (1 définition(s))
- `notification_subscriptions.Users can manage their subscriptions` (1 définition(s))
- `notifications.Users can update their notifications` (2 définition(s))
- `notifications.Users can view their notifications` (2 définition(s))
- `order_groups.Anyone can view active groups` (1 définition(s))
- `order_groups.Users can create groups` (1 définition(s))
- `order_items.Restaurant owners can view order items` (2 définition(s))
- `order_items.Users can create order items` (2 définition(s))
- `order_items.Users can view their own order items` (2 définition(s))
- `orders.Restaurant owners can update orders` (2 définition(s))
- `orders.Restaurant owners can view orders` (2 définition(s))
- `orders.Users can create orders` (2 définition(s))
- `orders.Users can view their own orders` (2 définition(s))
- `profiles.Users can insert their own profile` (2 définition(s))
- `profiles.Users can update their own profile` (2 définition(s))
- `profiles.Users can view their own profile` (2 définition(s))
- `public..Couriers manage own %I` (1 définition(s))
- `public..Public read for %I` (2 définition(s))
- `public..Users manage own %I` (1 définition(s))
- `public..hide_commercial_demo_branch_rows` (1 définition(s))
- `public..hide_commercial_demo_post_rows` (1 définition(s))
- `public..hide_commercial_demo_rows` (1 définition(s))
- `public..launch_access_guard` (1 définition(s))
- `public.ad_campaign_events.ad_campaign_events_owner_select` (1 définition(s))
- `public.ad_campaign_internal_test_events.ad_campaign_internal_test_events_owner_read` (1 définition(s))
- `public.ad_campaigns.Admins can manage ad campaigns` (1 définition(s))
- `public.ad_campaigns.Anyone can read active campaigns` (1 définition(s))
- `public.ad_campaigns.Restaurant owners can manage ad campaigns` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_admin_all` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_owner_all` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_owner_delete` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_owner_insert` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_owner_select` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_owner_update` (1 définition(s))
- `public.ad_campaigns.ad_campaigns_public_select` (1 définition(s))
- `public.admin_catalog_change_history.admin_catalog_change_history_admin_insert` (1 définition(s))
- `public.admin_catalog_change_history.admin_catalog_change_history_admin_select` (1 définition(s))
- `public.admin_dashboard_log_reset_history.admin_dashboard_log_reset_history_admin_select` (1 définition(s))
- `public.admin_loyalty_change_history.admin_loyalty_change_history_admin_insert` (1 définition(s))
- `public.admin_loyalty_change_history.admin_loyalty_change_history_admin_select` (1 définition(s))
- `public.admin_marketplace_alert_events.admin_marketplace_alert_events_admin_insert` (1 définition(s))
- `public.admin_marketplace_alert_events.admin_marketplace_alert_events_admin_select` (1 définition(s))
- `public.admin_marketplace_alerts.admin_marketplace_alerts_admin_insert` (1 définition(s))
- `public.admin_marketplace_alerts.admin_marketplace_alerts_admin_select` (1 définition(s))
- `public.admin_marketplace_alerts.admin_marketplace_alerts_admin_update` (1 définition(s))
- `public.admin_month_locks.Admins can manage accounting month locks` (1 définition(s))
- `public.admin_month_locks.Admins can view accounting month locks` (1 définition(s))
- `public.admin_review_action_history.admin_review_action_history_admin_insert` (1 définition(s))
- `public.admin_review_action_history.admin_review_action_history_admin_select` (2 définition(s))
- `public.admin_supabase_advisor_snapshots.admin_supabase_advisor_snapshots_admin_insert` (1 définition(s))
- `public.admin_supabase_advisor_snapshots.admin_supabase_advisor_snapshots_admin_select` (1 définition(s))
- `public.admin_user_account_states.Admins can manage user account states` (1 définition(s))
- `public.admin_user_account_states.Admins can view user account states` (1 définition(s))
- `public.ai_accounting_insights.ai_accounting_insights_admin_all` (2 définition(s))
- `public.ai_accounting_insights.ai_accounting_insights_admin_restaurant_select` (2 définition(s))
- `public.ai_admin_events.ai_admin_events_admin_all` (2 définition(s))
- `public.ai_admin_events.ai_admin_events_admin_select` (2 définition(s))
- `public.ai_conversations.ai_conversations_insert_related` (2 définition(s))
- `public.ai_conversations.ai_conversations_select_related` (2 définition(s))
- `public.ai_conversations.ai_conversations_update_related` (2 définition(s))
- `public.ai_generated_assets.ai_generated_assets_insert_related` (2 définition(s))
- `public.ai_generated_assets.ai_generated_assets_select_related` (2 définition(s))
- `public.ai_messages.ai_messages_insert_related` (2 définition(s))
- `public.ai_messages.ai_messages_select_related` (2 définition(s))
- `public.ai_performance_snapshots.ai_performance_snapshots_admin_all` (2 définition(s))
- `public.ai_performance_snapshots.ai_performance_snapshots_admin_restaurant_select` (2 définition(s))
- `public.ai_restaurant_tasks.ai_restaurant_tasks_owner_admin` (2 définition(s))
- `public.ai_safety_rules.ai_safety_rules_admin_all` (2 définition(s))
- `public.ai_safety_rules.ai_safety_rules_select_related` (2 définition(s))
- `public.ai_security_events.ai_security_events_admin_all` (2 définition(s))
- `public.ai_security_events.ai_security_events_admin_select` (2 définition(s))
- `public.ai_support_tickets.ai_support_tickets_admin_update` (2 définition(s))
- `public.ai_support_tickets.ai_support_tickets_insert_related` (2 définition(s))
- `public.ai_support_tickets.ai_support_tickets_select_related` (2 définition(s))
- `public.ai_usage_logs.ai_usage_logs_select_related` (2 définition(s))
- `public.allergens.Require auth for allergens` (1 définition(s))
- `public.anti_waste_offers.Anyone can view active offers` (1 définition(s))
- `public.anti_waste_offers.Restaurant owners can manage offers` (1 définition(s))
- `public.audit_log.Admins can view audit logs` (1 définition(s))
- `public.audit_log.Authenticated can insert audit logs` (2 définition(s))
- `public.audit_log.System can insert audit logs` (1 définition(s))
- `public.audit_log.audit_log_super_admin_select` (1 définition(s))
- `public.campaign_studio_runs.Restaurant members can read campaign studio runs` (1 définition(s))
- `public.cart_item_modifiers.Require auth for cart_item_modifiers` (1 définition(s))
- `public.cart_item_modifiers.cart_item_modifiers_owner_delete` (1 définition(s))
- `public.cart_item_modifiers.cart_item_modifiers_owner_insert` (1 définition(s))
- `public.cart_item_modifiers.cart_item_modifiers_owner_select` (1 définition(s))
- `public.cart_item_modifiers.cart_item_modifiers_owner_update` (1 définition(s))
- `public.cart_items.Require auth for cart_items` (1 définition(s))
- `public.cart_items.Users manage own cart_items` (1 définition(s))
- `public.cart_items.cart_items_owner_delete` (1 définition(s))
- `public.cart_items.cart_items_owner_insert` (1 définition(s))
- `public.cart_items.cart_items_owner_select` (1 définition(s))
- `public.cart_items.cart_items_owner_update` (1 définition(s))
- `public.carts.Require auth for carts` (1 définition(s))
- `public.carts.carts_owner_delete` (1 définition(s))
- `public.carts.carts_owner_insert` (1 définition(s))
- `public.carts.carts_owner_select` (1 définition(s))
- `public.carts.carts_owner_update` (1 définition(s))
- `public.categories.Require auth for categories` (1 définition(s))
- `public.categories.categories_public_select` (1 définition(s))
- `public.chef_table_checkout_holds.chef_table_checkout_holds_service_role` (1 définition(s))
- `public.chef_table_drops.Admins can manage drops` (1 définition(s))
- `public.chef_table_drops.Public drops are viewable by everyone` (1 définition(s))
- `public.chef_table_drops.chef_table_drops_public_select` (1 définition(s))
- `public.clicks.Allow anyone to insert clicks` (1 définition(s))
- `public.clicks.Require auth for clicks` (1 définition(s))
- `public.clicks.Users can view their own clicks` (1 définition(s))
- `public.collection_restaurants.Require auth for collection_restaurants` (1 définition(s))
- `public.collections.Require auth for collections` (1 définition(s))
- `public.commercial_compensation_adjustments.commercial_compensation_adjustments_admin_commercial_select` (1 définition(s))
- `public.commercial_compensation_adjustments.commercial_compensation_adjustments_admin_write` (1 définition(s))
- `public.commercial_compensation_adjustments.commercial_compensation_adjustments_self_or_super_select` (1 définition(s))
- `public.commercial_compensation_adjustments.commercial_compensation_adjustments_super_admin_write` (1 définition(s))
- `public.commercial_compensation_profile_events.commercial_compensation_profile_events_select` (1 définition(s))
- `public.commercial_compensation_profiles.commercial_compensation_profiles_admin_select` (1 définition(s))
- `public.commercial_compensation_profiles.commercial_compensation_profiles_admin_write` (1 définition(s))
- `public.commercial_compensation_profiles.commercial_compensation_profiles_self_or_super_select` (1 définition(s))
- `public.commercial_compensation_profiles.commercial_compensation_profiles_super_admin_write` (1 définition(s))
- `public.commercial_contract_acceptances.commercial_contract_acceptances_owner_admin_read` (1 définition(s))
- `public.commercial_contract_versions.commercial_contract_versions_roles_read` (1 définition(s))
- `public.commercial_demo_accounts.commercial_demo_accounts_admin_all` (1 définition(s))
- `public.commercial_demo_accounts.commercial_demo_accounts_self_select` (1 définition(s))
- `public.commercial_demo_ai_conversations.commercial_demo_ai_conversations_select` (1 définition(s))
- `public.commercial_demo_ai_generations.commercial_demo_ai_generations_select` (1 définition(s))
- `public.commercial_demo_ai_messages.commercial_demo_ai_messages_select` (1 définition(s))
- `public.commercial_demo_catalog_items.commercial_demo_catalog_select` (1 définition(s))
- `public.commercial_demo_delivery_missions.commercial_demo_missions_select` (1 définition(s))
- `public.commercial_demo_order_events.commercial_demo_events_select` (1 définition(s))
- `public.commercial_demo_order_sessions.commercial_demo_sessions_select` (1 définition(s))
- `public.commercial_demo_orders.commercial_demo_orders_select` (1 définition(s))
- `public.commercial_demo_reservations.commercial_demo_reservations_select` (1 définition(s))
- `public.commercial_prospect_followup_history.commercial_followup_history_admin_select` (2 définition(s))
- `public.commercial_prospect_followup_history.commercial_followup_history_owner_select` (2 définition(s))
- `public.commercial_prospect_followups.commercial_prospect_followups_admin_commercial_insert` (1 définition(s))
- `public.commercial_prospect_followups.commercial_prospect_followups_admin_commercial_select` (1 définition(s))
- `public.commercial_prospect_followups.commercial_prospect_followups_admin_commercial_update` (1 définition(s))
- `public.commercial_prospect_followups.commercial_prospect_followups_owner_select` (2 définition(s))
- `public.commercial_statements.commercial_statements_owner_admin_select` (1 définition(s))
- `public.commercial_subscription_commissions.commercial_subscription_commissions_owner_select` (1 définition(s))
- `public.compensations.Require auth for compensations` (2 définition(s))
- `public.consent_receipts.Anyone can record consent` (1 définition(s))
- `public.consent_receipts.Users can read own consent receipts` (1 définition(s))
- `public.conversations.conversations_admin` (2 définition(s))
- `public.conversations.conversations_participant` (2 définition(s))
- `public.courier_documents.courier_docs_admin` (2 définition(s))
- `public.courier_documents.courier_docs_own` (2 définition(s))
- `public.courier_earnings.courier_earnings_admin` (2 définition(s))
- `public.courier_earnings.courier_earnings_admin_safe` (1 définition(s))
- `public.courier_earnings.courier_earnings_own` (2 définition(s))
- `public.courier_earnings.courier_earnings_select_safe` (1 définition(s))
- `public.courier_locations.courier_locations_admin` (2 définition(s))
- `public.courier_locations.courier_locations_client_active` (2 définition(s))
- `public.courier_locations.courier_locations_insert_safe` (1 définition(s))
- `public.courier_locations.courier_locations_own_insert` (2 définition(s))
- `public.courier_locations.courier_locations_own_select` (2 définition(s))
- `public.courier_locations.courier_locations_select_safe` (1 définition(s))
- `public.courier_shifts.courier_shifts_admin` (2 définition(s))
- `public.courier_shifts.courier_shifts_own` (2 définition(s))
- `public.courier_shifts.courier_shifts_select_safe` (1 définition(s))
- `public.courier_shifts.courier_shifts_write_safe` (1 définition(s))
- `public.couriers.Couriers manage own profile` (1 définition(s))
- `public.couriers.couriers_admin_all` (2 définition(s))
- `public.couriers.couriers_client_active_order` (2 définition(s))
- `public.couriers.couriers_insert_self` (1 définition(s))
- `public.couriers.couriers_own_profile_insert` (2 définition(s))
- `public.couriers.couriers_own_profile_select` (2 définition(s))
- `public.couriers.couriers_own_profile_update` (2 définition(s))
- `public.couriers.couriers_select_safe` (1 définition(s))
- `public.couriers.couriers_update_self` (1 définition(s))
- `public.credit_notes.Require auth for credit_notes` (2 définition(s))
- `public.credit_notes.credit_notes_recipient_select` (1 définition(s))
- `public.cuisines.Require auth for cuisines` (1 définition(s))
- `public.cuisines.cuisines_admin_insert` (1 définition(s))
- `public.cuisines.cuisines_admin_select_archived` (1 définition(s))
- `public.cuisines.cuisines_admin_update` (1 définition(s))
- `public.cuisines.cuisines_public_select` (4 définition(s))
- `public.customer_memory_events.Users can read own customer memory events` (1 définition(s))
- `public.customer_memory_items.Users can read own customer memory` (1 définition(s))
- `public.daily_slot_spins.Clients can read own daily slot spins` (1 définition(s))
- `public.delivery_batches.Require auth for delivery_batches` (2 définition(s))
- `public.delivery_batches.delivery_batches_courier_select` (1 définition(s))
- `public.delivery_routes.Require auth for delivery_routes` (2 définition(s))
- `public.delivery_routes.delivery_routes_participant_select` (1 définition(s))
- `public.delivery_tracking.Restaurant owners can manage delivery tracking` (1 définition(s))
- `public.delivery_tracking.Users can view their delivery tracking` (1 définition(s))
- `public.delivery_tracking.delivery_tracking_courier_select` (1 définition(s))
- `public.delivery_tracking.delivery_tracking_manage_safe` (1 définition(s))
- `public.delivery_tracking.delivery_tracking_select_safe` (1 définition(s))
- `public.developer_statements.developer_statements_admin_select` (1 définition(s))
- `public.developer_stripe_transfers.developer_stripe_transfers_admin_select` (1 définition(s))
- `public.device_tokens.Users can manage their device tokens` (1 définition(s))
- `public.dish_allergens.Require auth for dish_allergens` (1 définition(s))
- `public.dish_availability_windows.Require auth for dish_availability_windows` (1 définition(s))
- `public.dish_images.Require auth for dish_images` (1 définition(s))
- `public.dish_modifier_groups.Require auth for dish_modifier_groups` (1 définition(s))
- `public.dish_modifier_options.Require auth for dish_modifier_options` (1 définition(s))
- `public.dish_modifier_options.dish_modifier_options_owner_delete` (1 définition(s))
- `public.dish_modifier_options.dish_modifier_options_owner_insert` (1 définition(s))
- `public.dish_modifier_options.dish_modifier_options_owner_update` (1 définition(s))
- `public.dish_modifier_options.dish_modifier_options_public_select` (1 définition(s))
- `public.dish_tags.Require auth for dish_tags` (1 définition(s))
- `public.dish_variants.Require auth for dish_variants` (1 définition(s))
- `public.dishes.Require auth for dishes` (1 définition(s))
- `public.dishes.dishes_owner_delete` (1 définition(s))
- `public.dishes.dishes_owner_insert` (1 définition(s))
- `public.dishes.dishes_owner_update` (1 définition(s))
- `public.dispatch_attempts.dispatch_attempts_admin` (2 définition(s))
- `public.dispatch_attempts.dispatch_attempts_courier` (2 définition(s))
- `public.dispatch_attempts.dispatch_attempts_courier_safe` (1 définition(s))
- `public.dispatch_jobs.dispatch_jobs_admin` (2 définition(s))
- `public.dispatch_jobs.dispatch_jobs_admin_safe` (1 définition(s))
- `public.dispatch_jobs.dispatch_jobs_client_select` (2 définition(s))
- `public.dispatch_jobs.dispatch_jobs_courier_select` (4 définition(s))
- `public.dispatch_jobs.dispatch_jobs_courier_update` (3 définition(s))
- `public.dispatch_jobs.dispatch_jobs_select_safe` (1 définition(s))
- `public.dispatch_jobs.dispatch_jobs_update_safe` (1 définition(s))
- `public.edge_function_audit_logs.edge_function_audit_logs_admin_select` (1 définition(s))
- `public.email_queue.Admins can view email queue` (1 définition(s))
- `public.email_queue.Authenticated can insert emails` (1 définition(s))
- `public.email_queue.email_queue_super_admin_select` (1 définition(s))
- `public.event_store.Allow anyone to insert event_store` (1 définition(s))
- `public.event_store.Require auth for event_store` (2 définition(s))
- `public.event_store.Restrict read on analytics` (1 définition(s))
- `public.event_store.Users can view their own event_store` (1 définition(s))
- `public.fair_growth_modules.fair_growth_modules_public_read` (1 définition(s))
- `public.favorites.Users can add favorites` (1 définition(s))
- `public.favorites.Users can remove favorites` (1 définition(s))
- `public.favorites.Users can view their favorites` (1 définition(s))
- `public.feature_flag_audit_logs.feature_flag_audit_logs_admin_insert` (1 définition(s))
- `public.feature_flag_audit_logs.feature_flag_audit_logs_admin_select` (1 définition(s))
- `public.feature_flags.Admins can manage feature flags` (1 définition(s))
- `public.feature_flags.Feature flags are viewable by everyone` (1 définition(s))
- `public.feature_flags.feature_flags_public_select` (1 définition(s))
- `public.feature_flags.feature_flags_super_admin_write` (1 définition(s))
- `public.feature_store.Require auth for feature_store` (2 définition(s))
- `public.finance_runtime_config.finance_runtime_config_admin_select` (1 définition(s))
- `public.financial_ledger.financial_ledger_admin_select` (1 définition(s))
- `public.flash_sales.Admins can manage flash sales` (1 définition(s))
- `public.flash_sales.Anyone can view active flash sales` (1 définition(s))
- `public.flash_sales.Restaurant owners can manage flash sales` (1 définition(s))
- `public.floor_plan_variants.floor_plan_variants_owner_admin_delete` (1 définition(s))
- `public.floor_plan_variants.floor_plan_variants_owner_admin_insert` (1 définition(s))
- `public.floor_plan_variants.floor_plan_variants_owner_admin_select` (1 définition(s))
- `public.floor_plan_variants.floor_plan_variants_owner_admin_update` (1 définition(s))
- `public.fraud_signals.Require auth for fraud_signals` (2 définition(s))
- `public.gift_cards.Require auth for gift_cards` (2 définition(s))
- `public.gift_cards.Users manage own gift_cards` (1 définition(s))
- `public.gift_cards.gift_cards_owner_select` (1 définition(s))
- `public.gift_points.Authenticated users can send gifts` (1 définition(s))
- `public.gift_points.Users can view their own gifts` (1 définition(s))
- `public.google_actions_center_bookings.google_actions_center_bookings_service_role_all` (1 définition(s))
- `public.google_actions_center_outbox.google_actions_center_outbox_admin_read` (1 définition(s))
- `public.group_member_orders.group_member_orders_insert_own` (1 définition(s))
- `public.group_member_orders.group_member_orders_select_related` (1 définition(s))
- `public.group_member_orders.group_member_orders_update_admin_only` (1 définition(s))
- `public.group_member_orders.group_member_orders_update_own_draft` (1 définition(s))
- `public.group_members.Anyone can view group members` (1 définition(s))
- `public.group_members.Users can join groups` (1 définition(s))
- `public.group_members.group_members_self` (1 définition(s))
- `public.group_orders.group_orders_participant` (1 définition(s))
- `public.image_analysis_jobs.image_analysis_jobs_admin_select` (1 définition(s))
- `public.impressions.Allow anyone to insert impressions` (1 définition(s))
- `public.impressions.Require auth for impressions` (1 définition(s))
- `public.impressions.Users can view their own impressions` (1 définition(s))
- `public.incident_reports.Require auth for incident_reports` (2 définition(s))
- `public.incident_reports.incident_reports_admin_update` (1 définition(s))
- `public.incident_reports.incident_reports_owner_insert` (1 définition(s))
- `public.incident_reports.incident_reports_owner_select` (1 définition(s))
- `public.inventory_items.Require auth for inventory_items` (1 définition(s))
- `public.inventory_items.inventory_items_owner_delete` (1 définition(s))
- `public.inventory_items.inventory_items_owner_insert` (1 définition(s))
- `public.inventory_items.inventory_items_owner_select` (1 définition(s))
- `public.inventory_items.inventory_items_owner_update` (1 définition(s))
- `public.inventory_movements.Require auth for inventory_movements` (1 définition(s))
- `public.inventory_movements.inventory_movements_owner_insert` (1 définition(s))
- `public.inventory_movements.inventory_movements_owner_select` (1 définition(s))
- `public.invoices.Require auth for invoices` (2 définition(s))
- `public.invoices.invoices_admin_all` (1 définition(s))
- `public.invoices.invoices_recipient_select` (1 définition(s))
- `public.launch_pack_service_fulfillments.fulfillments_admin_all` (1 définition(s))
- `public.launch_pack_service_fulfillments.fulfillments_owner_read` (1 définition(s))
- `public.launch_packs.launch_packs_admin_all` (1 définition(s))
- `public.launch_packs.launch_packs_public_read` (1 définition(s))
- `public.loyalty_accounts.Require auth for loyalty_accounts` (2 définition(s))
- `public.loyalty_tiers.Require auth for loyalty_tiers` (2 définition(s))
- `public.loyalty_transactions.Users can view their own loyalty transactions` (1 définition(s))
- `public.marketplace_alert_state_history.marketplace_alert_state_history_admin_insert` (1 définition(s))
- `public.marketplace_alert_state_history.marketplace_alert_state_history_admin_select` (1 définition(s))
- `public.marketplace_alert_states.marketplace_alert_states_admin_select` (1 définition(s))
- `public.marketplace_alert_states.marketplace_alert_states_admin_write` (1 définition(s))
- `public.meal_formula_categories.Anyone can view formula categories` (1 définition(s))
- `public.meal_formula_categories.Restaurant owners can manage formula categories` (1 définition(s))
- `public.meal_formulas.Anyone can view active formulas` (1 définition(s))
- `public.meal_formulas.Restaurant owners can manage formulas` (1 définition(s))
- `public.menu_categories.Require auth for menu_categories` (1 définition(s))
- `public.menu_items.Anyone can view available menu items` (1 définition(s))
- `public.menu_items.Restaurant owners can manage menu items` (1 définition(s))
- `public.menu_items.block_commercial_demo_menu_item_delete` (1 définition(s))
- `public.menu_items.block_commercial_demo_menu_item_insert` (1 définition(s))
- `public.menu_items.block_commercial_demo_menu_item_update` (1 définition(s))
- `public.menu_items.commercial_demo_select_mapped_menu_items` (1 définition(s))
- `public.menu_items.menu_items_admin_select` (1 définition(s))
- `public.menu_items.menu_items_owner_all` (1 définition(s))
- `public.menu_items.menu_items_public_select` (2 définition(s))
- `public.menu_items.scope_production_menu_items_for_commercial_demo_accounts` (1 définition(s))
- `public.messages.messages_admin` (2 définition(s))
- `public.messages.messages_participant` (2 définition(s))
- `public.ml_predictions.Require auth for ml_predictions` (2 définition(s))
- `public.notification_campaigns.Admins can manage campaigns` (1 définition(s))
- `public.notification_campaigns.notification_campaigns_admin_select` (1 définition(s))
- `public.notification_deliveries.Users can view their notification deliveries` (1 définition(s))
- `public.notification_deliveries.notification_deliveries_recipient_select` (1 définition(s))
- `public.notification_preferences.Users can manage their notification preferences` (1 définition(s))
- `public.notification_subscriptions.Users can manage their subscriptions` (1 définition(s))
- `public.notification_subscriptions.notification_subscriptions_self` (1 définition(s))
- `public.notifications.Users can update their notifications` (1 définition(s))
- `public.notifications.Users can view their notifications` (1 définition(s))
- `public.notifications.notifications_recipient_select` (1 définition(s))
- `public.notifications.notifications_recipient_update` (1 définition(s))
- `public.ops_guardian_assessments.Admins can read guardian assessments` (1 définition(s))
- `public.ops_guardian_verifications.Admins can read guardian verifications` (1 définition(s))
- `public.ops_incident_events.ops_incident_events_admin_select` (1 définition(s))
- `public.ops_incidents.ops_incidents_admin_select` (1 définition(s))
- `public.order_addresses.Require auth for order_addresses` (1 définition(s))
- `public.order_events.Require auth for order_events` (1 définition(s))
- `public.order_events.order_events_related_select` (1 définition(s))
- `public.order_fees.Require auth for order_fees` (1 définition(s))
- `public.order_groups.Anyone can view active groups` (1 définition(s))
- `public.order_groups.Users can create groups` (1 définition(s))
- `public.order_issues.Require auth for order_issues` (1 définition(s))
- `public.order_item_modifiers.Require auth for order_item_modifiers` (1 définition(s))
- `public.order_item_modifiers.order_item_modifiers_participant_select` (1 définition(s))
- `public.order_items.Require auth for order_items` (1 définition(s))
- `public.order_items.Restaurant owners can view order items` (1 définition(s))
- `public.order_items.Users can create order items` (1 définition(s))
- `public.order_items.Users can view their own order items` (1 définition(s))
- `public.order_items.order_items_participant_select` (1 définition(s))
- `public.order_notes.Require auth for order_notes` (1 définition(s))
- `public.order_refunds.Require auth for order_refunds` (1 définition(s))
- `public.order_status_history.Require auth for order_status_history` (1 définition(s))
- `public.order_taxes.Require auth for order_taxes` (1 définition(s))
- `public.orders.Restaurant owners can update orders` (1 définition(s))
- `public.orders.Restaurant owners can view orders` (1 définition(s))
- `public.orders.Users can create orders` (1 définition(s))
- `public.orders.Users can view their own orders` (1 définition(s))
- `public.orders.orders_admin_select_production` (1 définition(s))
- `public.orders.orders_admin_update_only` (1 définition(s))
- `public.orders.orders_courier_select` (1 définition(s))
- `public.payment_intents.Require auth for payment_intents` (2 définition(s))
- `public.payment_intents.payment_intents_admin_all` (1 définition(s))
- `public.payment_transactions.payment_transactions_admin` (2 définition(s))
- `public.payment_transactions.payment_transactions_own` (2 définition(s))
- `public.payout_batches.Require auth for payout_batches` (2 définition(s))
- `public.payout_batches.payout_batches_admin_select` (1 définition(s))
- `public.payouts.Require auth for payouts` (2 définition(s))
- `public.payouts.payouts_recipient_select` (1 définition(s))
- `public.print_documents.print_documents_select` (1 définition(s))
- `public.print_exports.print_exports_select` (1 définition(s))
- `public.print_order_events.print_order_events_select` (1 définition(s))
- `public.print_order_items.print_order_items_select` (1 définition(s))
- `public.print_orders.print_orders_select` (1 définition(s))
- `public.print_products.print_products_select` (1 définition(s))
- `public.print_reorders.print_reorders_select` (1 définition(s))
- `public.print_settings.print_settings_admin_select` (1 définition(s))
- `public.profiles.Admins can view all profiles` (1 définition(s))
- `public.profiles.Users can insert their own profile` (1 définition(s))
- `public.profiles.Users can update their own profile` (1 définition(s))
- `public.profiles.Users can view their own profile` (1 définition(s))
- `public.profiles.profiles_self_all` (1 définition(s))
- `public.promo_code_uses.promo_uses_admin` (3 définition(s))
- `public.promo_code_uses.promo_uses_own` (3 définition(s))
- `public.promo_codes.promo_codes_active_select` (1 définition(s))
- `public.promo_codes.promo_codes_admin` (2 définition(s))
- `public.promo_codes.promo_codes_public_read` (2 définition(s))
- `public.promo_codes.promo_codes_restaurant` (2 définition(s))
- `public.proof_of_delivery.Require auth for proof_of_delivery` (2 définition(s))
- `public.proof_of_delivery.proof_of_delivery_admin_all` (1 définition(s))
- `public.proof_of_delivery.proof_of_delivery_admin_select` (1 définition(s))
- `public.proof_of_delivery.proof_of_delivery_authorized_select` (1 définition(s))
- `public.proof_of_delivery.proof_of_delivery_client_select` (2 définition(s))
- `public.proof_of_delivery.proof_of_delivery_courier_insert` (1 définition(s))
- `public.proof_of_delivery.proof_of_delivery_courier_select` (2 définition(s))
- `public.proof_of_delivery.proof_of_delivery_courier_update` (1 définition(s))
- `public.proof_of_delivery.proof_of_delivery_restaurant_select` (2 définition(s))
- `public.rate_limit_buckets.deny all rate_limit_buckets` (1 définition(s))
- `public.recommendation_logs.Require auth for recommendation_logs` (2 définition(s))
- `public.referral_codes.Users manage own referral_codes` (1 définition(s))
- `public.referral_codes.referral_own` (2 définition(s))
- `public.referral_codes.referral_public_read` (2 définition(s))
- `public.reservation_fee_adjustments.reservation_fee_adjustments_admin_select` (1 définition(s))
- `public.reservation_fee_adjustments.reservation_fee_adjustments_owner_read` (1 définition(s))
- `public.reservation_fee_charges.reservation_fee_charges_admin_select` (1 définition(s))
- `public.reservation_fee_charges.reservation_fee_charges_owner_read` (1 définition(s))
- `public.reservation_flat_fee_charges.reservation_flat_fee_charges_admin_read` (1 définition(s))
- `public.reservation_progressive_offers.reservation_progressive_offers_owner_admin_write` (1 définition(s))
- `public.reservation_progressive_offers.reservation_progressive_offers_public_active_select` (1 définition(s))
- `public.reservation_slots.Require auth for reservation_slots` (2 définition(s))
- `public.reservation_slots.reservation_slots_owner_admin_write` (1 définition(s))
- `public.reservation_slots.reservation_slots_related_select` (1 définition(s))
- `public.reservation_status_history.Require auth for reservation_status_history` (2 définition(s))
- `public.reservation_status_history.reservation_status_history_participant_select` (1 définition(s))
- `public.reservation_table_layout_overrides.Require auth for reservation_table_layout_overrides` (1 définition(s))
- `public.reservation_table_layout_overrides.reservation_table_layout_overrides_owner_admin_select` (1 définition(s))
- `public.reservation_table_layout_overrides.reservation_table_layout_overrides_owner_admin_write` (1 définition(s))
- `public.reservation_tables.Require auth for reservation_tables` (2 définition(s))
- `public.reservation_tables.reservation_tables_owner_admin_delete` (1 définition(s))
- `public.reservation_tables.reservation_tables_owner_admin_insert` (1 définition(s))
- `public.reservation_tables.reservation_tables_owner_admin_select` (1 définition(s))
- `public.reservation_tables.reservation_tables_owner_admin_update` (1 définition(s))
- `public.reservations.Restaurant owners can update reservations` (1 définition(s))
- `public.reservations.Restaurant owners can view reservations` (1 définition(s))
- `public.reservations.Users can cancel their reservations` (1 définition(s))
- `public.reservations.Users can create reservations` (1 définition(s))
- `public.reservations.Users can view their own reservations` (1 définition(s))
- `public.reservations.reservations_admin_select_production` (1 définition(s))
- `public.reservations.reservations_admin_update_only` (1 définition(s))
- `public.restaurant_admin_correction_requests.restaurant_admin_correction_requests_admin_select` (1 définition(s))
- `public.restaurant_admin_correction_requests.restaurant_admin_correction_requests_owner_select` (1 définition(s))
- `public.restaurant_ai_profiles.restaurant_ai_profiles_owner_admin` (2 définition(s))
- `public.restaurant_ai_subscriptions.restaurant_ai_subscriptions_admin_all` (2 définition(s))
- `public.restaurant_ai_subscriptions.restaurant_ai_subscriptions_admin_select` (1 définition(s))
- `public.restaurant_ai_subscriptions.restaurant_ai_subscriptions_owner_admin_select` (2 définition(s))
- `public.restaurant_booking_channels.restaurant_booking_channels_owner_read` (1 définition(s))
- `public.restaurant_branches.Require auth for restaurant_branches` (1 définition(s))
- `public.restaurant_branches.hide_commercial_demo_branches` (1 définition(s))
- `public.restaurant_branches.restaurant_branches_owner_admin_delete` (1 définition(s))
- `public.restaurant_branches.restaurant_branches_owner_admin_insert` (1 définition(s))
- `public.restaurant_branches.restaurant_branches_owner_admin_select` (1 définition(s))
- `public.restaurant_branches.restaurant_branches_owner_admin_update` (1 définition(s))
- `public.restaurant_contracts.restaurant_contracts_admin_all` (1 définition(s))
- `public.restaurant_contracts.restaurant_contracts_owner_insert_signature` (1 définition(s))
- `public.restaurant_contracts.restaurant_contracts_owner_read` (1 définition(s))
- `public.restaurant_credit_packs.restaurant_credit_packs_active_select` (1 définition(s))
- `public.restaurant_credit_packs.restaurant_credit_packs_admin_all` (1 définition(s))
- `public.restaurant_credit_purchases.restaurant_credit_purchases_admin_all` (1 définition(s))
- `public.restaurant_credit_purchases.restaurant_credit_purchases_owner_admin_select` (1 définition(s))
- `public.restaurant_cuisines.Require auth for restaurant_cuisines` (1 définition(s))
- `public.restaurant_cuisines.restaurant_cuisines_owner_delete` (1 définition(s))
- `public.restaurant_cuisines.restaurant_cuisines_owner_insert` (1 définition(s))
- `public.restaurant_cuisines.restaurant_cuisines_public_select` (1 définition(s))
- `public.restaurant_daily_dish_runs.restaurant_daily_dish_runs_service_role_all` (1 définition(s))
- `public.restaurant_daily_dish_settings.restaurant_daily_dish_settings_service_role_all` (1 définition(s))
- `public.restaurant_daily_dish_variants.restaurant_daily_dish_variants_service_role_all` (1 définition(s))
- `public.restaurant_daily_dishes.hide_unapproved_restaurant_daily_dishes` (2 définition(s))
- `public.restaurant_daily_dishes.restaurant_daily_dishes_public_read` (1 définition(s))
- `public.restaurant_daily_kpis.Admins can manage daily kpis` (1 définition(s))
- `public.restaurant_daily_kpis.Restaurant owners can manage daily kpis` (1 définition(s))
- `public.restaurant_delivery_rules.Require auth for restaurant_delivery_rules` (1 définition(s))
- `public.restaurant_directory_claim_requests.directory_claim_admin_update` (1 définition(s))
- `public.restaurant_directory_claim_requests.directory_claim_requester_insert` (1 définition(s))
- `public.restaurant_directory_claim_requests.directory_claim_requester_read` (1 définition(s))
- `public.restaurant_directory_removal_requests.directory_removal_admin_update` (1 définition(s))
- `public.restaurant_directory_removal_requests.directory_removal_requester_insert` (1 définition(s))
- `public.restaurant_directory_removal_requests.directory_removal_requester_read` (1 définition(s))
- `public.restaurant_documents.Require auth for restaurant_documents` (1 définition(s))
- `public.restaurant_follows.restaurant_follows_delete` (1 définition(s))
- `public.restaurant_follows.restaurant_follows_insert` (1 définition(s))
- `public.restaurant_follows.restaurant_follows_select` (1 définition(s))
- `public.restaurant_google_booking_events.restaurant_google_booking_events_admin_all` (1 définition(s))
- `public.restaurant_google_booking_events.restaurant_google_booking_events_owner_select` (1 définition(s))
- `public.restaurant_google_booking_setup.restaurant_google_booking_setup_admin_all` (1 définition(s))
- `public.restaurant_google_booking_setup.restaurant_google_booking_setup_owner_select` (1 définition(s))
- `public.restaurant_google_booking_setup.restaurant_google_booking_setup_owner_update` (1 définition(s))
- `public.restaurant_hours.Require auth for restaurant_hours` (1 définition(s))
- `public.restaurant_hours.hide_commercial_demo_hours` (1 définition(s))
- `public.restaurant_hours.restaurant_hours_owner_admin_select` (1 définition(s))
- `public.restaurant_images.restaurant_images_authenticated_select` (1 définition(s))
- `public.restaurant_images.restaurant_images_owner_delete` (1 définition(s))
- `public.restaurant_images.restaurant_images_owner_insert` (1 définition(s))
- `public.restaurant_images.restaurant_images_owner_update` (1 définition(s))
- `public.restaurant_images.restaurant_images_public_actualites_select` (1 définition(s))
- `public.restaurant_images.restaurant_images_public_completed_select` (1 définition(s))
- `public.restaurant_invoice_line_items.restaurant_invoice_line_items_admin_all` (1 définition(s))
- `public.restaurant_invoice_line_items.restaurant_invoice_line_items_owner_select` (1 définition(s))
- `public.restaurant_invoice_settings.Admins can manage invoice settings` (1 définition(s))
- `public.restaurant_invoice_settings.Restaurant owners can manage invoice settings` (1 définition(s))
- `public.restaurant_invoices.Admins can manage invoices` (1 définition(s))
- `public.restaurant_invoices.Restaurant owners can manage invoices` (1 définition(s))
- `public.restaurant_invoices.restaurant_invoices_admin_all` (1 définition(s))
- `public.restaurant_invoices.restaurant_invoices_owner_select` (1 définition(s))
- `public.restaurant_launch_packs.restaurant_launch_packs_admin_all` (1 définition(s))
- `public.restaurant_launch_packs.restaurant_launch_packs_owner_read` (1 définition(s))
- `public.restaurant_leads.restaurant_leads_public_insert` (1 définition(s))
- `public.restaurant_media.Admins can manage media` (1 définition(s))
- `public.restaurant_media.Anyone can view restaurant media` (1 définition(s))
- `public.restaurant_media.Restaurant owners can manage media` (1 définition(s))
- `public.restaurant_onboarding_state_events.restaurant_onboarding_state_events_owner_read` (1 définition(s))
- `public.restaurant_paid_module_events.restaurant_paid_module_events_owner_read` (1 définition(s))
- `public.restaurant_paid_modules.restaurant_paid_modules_owner_read` (1 définition(s))
- `public.restaurant_payout_settings.Require auth for restaurant_payout_settings` (1 définition(s))
- `public.restaurant_payout_settings.restaurant_payout_settings_owner_select` (1 définition(s))
- `public.restaurant_preferred_tables.restaurant_preferred_tables_owner_select` (1 définition(s))
- `public.restaurant_promotions.Admins can manage promotions` (1 définition(s))
- `public.restaurant_promotions.Anyone can view active promotions` (1 définition(s))
- `public.restaurant_promotions.Restaurant owners can manage promotions` (1 définition(s))
- `public.restaurant_recommendations.Admins can manage recommendations` (1 définition(s))
- `public.restaurant_recommendations.Restaurant owners can manage recommendations` (1 définition(s))
- `public.restaurant_service_areas.Require auth for restaurant_service_areas` (1 définition(s))
- `public.restaurant_settings.Require auth for restaurant_settings` (1 définition(s))
- `public.restaurant_staff.Require auth for restaurant_staff` (1 définition(s))
- `public.restaurant_staff.restaurant_staff_all` (1 définition(s))
- `public.restaurant_stripe_adjustments.restaurant_stripe_adjustments_admin_read` (1 définition(s))
- `public.restaurant_subscription_plans.restaurant_subscription_plans_admin_all` (1 définition(s))
- `public.restaurant_subscription_plans.restaurant_subscription_plans_public_active_read` (1 définition(s))
- `public.restaurants.Admins can manage all restaurants` (1 définition(s))
- `public.restaurants.Anyone can view active restaurants` (1 définition(s))
- `public.restaurants.Owners can manage their restaurants` (1 définition(s))
- `public.restaurants.block_commercial_demo_restaurant_delete` (1 définition(s))
- `public.restaurants.block_commercial_demo_restaurant_insert` (1 définition(s))
- `public.restaurants.block_commercial_demo_restaurant_update` (1 définition(s))
- `public.restaurants.commercial_demo_select_mapped_restaurant` (1 définition(s))
- `public.restaurants.production_hide_demo_restaurants` (7 définition(s))
- `public.restaurants.restaurants_owner_all` (1 définition(s))
- `public.restaurants.restaurants_owner_delete` (2 définition(s))
- `public.restaurants.restaurants_owner_insert` (2 définition(s))
- `public.restaurants.restaurants_owner_select` (2 définition(s))
- `public.restaurants.restaurants_owner_update` (2 définition(s))
- `public.restaurants.restaurants_public_select` (11 définition(s))
- `public.restaurants.scope_production_restaurants_for_commercial_demo_accounts` (7 définition(s))
- `public.review_replies.Admins can manage review replies` (1 définition(s))
- `public.review_replies.Require auth for review_replies` (2 définition(s))
- `public.review_replies.review_replies_owner_insert` (1 définition(s))
- `public.review_replies.review_replies_public_select` (2 définition(s))
- `public.review_reports.review_reports_admin_update` (1 définition(s))
- `public.review_reports.review_reports_owner_admin_select` (1 définition(s))
- `public.review_reports.review_reports_owner_insert` (1 définition(s))
- `public.reviews.Admins can delete reviews` (1 définition(s))
- `public.reviews.Admins can update reviews` (1 définition(s))
- `public.reviews.Anyone can view reviews` (1 définition(s))
- `public.reviews.Users can create reviews` (1 définition(s))
- `public.reviews.Users can delete their own reviews` (1 définition(s))
- `public.reviews.Users can update their own reviews` (1 définition(s))
- `public.reviews.reviews_no_direct_client_insert` (1 définition(s))
- `public.reviews.reviews_public_select` (1 définition(s))
- `public.reviews.reviews_published_owner_admin_select` (1 définition(s))
- `public.reviews.reviews_user_all` (1 définition(s))
- `public.search_logs.Allow anyone to insert search_logs` (1 définition(s))
- `public.search_logs.Require auth for search_logs` (1 définition(s))
- `public.search_logs.Users can view their own search_logs` (1 définition(s))
- `public.signup_application_documents.signup_application_documents_admin_all` (1 définition(s))
- `public.signup_application_documents.signup_application_documents_admin_select` (2 définition(s))
- `public.signup_application_documents.signup_application_documents_self_select` (1 définition(s))
- `public.signup_application_drafts.signup_application_drafts_admin_select` (1 définition(s))
- `public.signup_application_drafts.signup_application_drafts_owner_select` (1 définition(s))
- `public.signup_application_review_events.signup_application_review_events_admin_select` (1 définition(s))
- `public.signup_applications.signup_applications_admin_all` (1 définition(s))
- `public.signup_applications.signup_applications_admin_select` (2 définition(s))
- `public.signup_applications.signup_applications_self_select` (1 définition(s))
- `public.social_comment_reactions.social_comment_reactions_delete` (1 définition(s))
- `public.social_comment_reactions.social_comment_reactions_insert` (1 définition(s))
- `public.social_comment_reactions.social_comment_reactions_select` (1 définition(s))
- `public.social_feed_events.social_feed_events_insert` (1 définition(s))
- `public.social_feed_events.social_feed_events_select` (1 définition(s))
- `public.social_feed_feedback.social_feed_feedback_delete` (1 définition(s))
- `public.social_feed_feedback.social_feed_feedback_insert` (1 définition(s))
- `public.social_feed_feedback.social_feed_feedback_select` (1 définition(s))
- `public.social_post_comments.social_comments_blocked_authors_filter` (1 définition(s))
- `public.social_post_comments.social_comments_delete` (1 définition(s))
- `public.social_post_comments.social_comments_insert` (3 définition(s))
- `public.social_post_comments.social_comments_public_select` (1 définition(s))
- `public.social_post_comments.social_comments_select` (1 définition(s))
- `public.social_post_comments.social_comments_update` (1 définition(s))
- `public.social_post_external_shares.social_external_shares_insert` (1 définition(s))
- `public.social_post_external_shares.social_external_shares_select` (1 définition(s))
- `public.social_post_likes.social_likes_delete` (1 définition(s))
- `public.social_post_likes.social_likes_insert` (1 définition(s))
- `public.social_post_likes.social_likes_select` (1 définition(s))
- `public.social_post_media.social_media_authenticated_select` (1 définition(s))
- `public.social_post_media.social_media_manage` (1 définition(s))
- `public.social_post_media.social_media_public_select` (2 définition(s))
- `public.social_post_media.social_media_select` (1 définition(s))
- `public.social_post_metrics_daily.social_post_metrics_daily_select` (1 définition(s))
- `public.social_post_premium_banner_deliveries.social_post_premium_banner_deliveries_owner_admin_select` (1 définition(s))
- `public.social_post_premium_banners.social_post_premium_banners_admin_all` (1 définition(s))
- `public.social_post_premium_banners.social_post_premium_banners_owner_admin_select` (1 définition(s))
- `public.social_post_promotions.social_post_promotions_insert_owner` (1 définition(s))
- `public.social_post_promotions.social_post_promotions_select_public_active` (1 définition(s))
- `public.social_post_promotions.social_post_promotions_update_owner` (1 définition(s))
- `public.social_post_reposts.social_reposts_delete` (1 définition(s))
- `public.social_post_reposts.social_reposts_insert` (1 définition(s))
- `public.social_post_reposts.social_reposts_public_select` (1 définition(s))
- `public.social_post_reposts.social_reposts_select` (1 définition(s))
- `public.social_post_reposts.social_reposts_update` (1 définition(s))
- `public.social_post_saves.social_post_saves_delete` (1 définition(s))
- `public.social_post_saves.social_post_saves_insert` (1 définition(s))
- `public.social_post_saves.social_post_saves_select` (1 définition(s))
- `public.social_posts.social_posts_blocked_authors_filter` (1 définition(s))
- `public.social_posts.social_posts_delete` (1 définition(s))
- `public.social_posts.social_posts_insert` (3 définition(s))
- `public.social_posts.social_posts_public_select` (1 définition(s))
- `public.social_posts.social_posts_select` (2 définition(s))
- `public.social_posts.social_posts_update` (3 définition(s))
- `public.social_reports.social_reports_insert` (1 définition(s))
- `public.social_reports.social_reports_select` (1 définition(s))
- `public.social_reports.social_reports_update` (1 définition(s))
- `public.social_user_blocks.social_user_blocks_own_delete` (1 définition(s))
- `public.social_user_blocks.social_user_blocks_own_insert` (1 définition(s))
- `public.social_user_blocks.social_user_blocks_own_select` (1 définition(s))
- `public.solidarity_donations.Anyone can view solidarity donations` (1 définition(s))
- `public.solidarity_donations.Authenticated users can create donations` (1 définition(s))
- `public.stripe_webhook_events.stripe_webhook_events_deny_all` (2 définition(s))
- `public.subscription_benefits.Require auth for subscription_benefits` (2 définition(s))
- `public.supplier_catalog_products.supplier_catalog_products_select_authenticated` (1 définition(s))
- `public.supplier_catalog_syncs.supplier_catalog_syncs_select_admin` (1 définition(s))
- `public.support_incident_messages.support_messages_insert_related` (2 définition(s))
- `public.support_incident_messages.support_messages_select_related` (1 définition(s))
- `public.support_incidents.support_incidents_insert_customer` (1 définition(s))
- `public.support_incidents.support_incidents_select_related` (1 définition(s))
- `public.support_incidents.support_incidents_update_related` (1 définition(s))
- `public.support_messages.Users view own support_messages` (1 définition(s))
- `public.support_messages.support_messages_admin` (2 définition(s))
- `public.support_messages.support_messages_own` (2 définition(s))
- `public.support_ops_incident_links.Admins can read support incident technical links` (1 définition(s))
- `public.support_resolution_actions.Admins can read support resolution actions` (1 définition(s))
- `public.support_resolution_runs.Admins can read support resolution runs` (1 définition(s))
- `public.support_tickets.support_tickets_admin` (2 définition(s))
- `public.support_tickets.support_tickets_own` (2 définition(s))
- `public.swiss_vat_rates.swiss_vat_rates_public_read` (1 définition(s))
- `public.tok_connect_access_tokens.tok_connect_access_tokens_admin_select` (1 définition(s))
- `public.tok_connect_agent_runs.tok_connect_agent_runs_admin_select` (1 définition(s))
- `public.tok_connect_agent_runs.tok_connect_agent_runs_member_select` (1 définition(s))
- `public.tok_connect_api_requests.tok_connect_api_requests_admin_select` (1 définition(s))
- `public.tok_connect_api_requests.tok_connect_api_requests_member_select` (1 définition(s))
- `public.tok_connect_clients.tok_connect_clients_admin_all` (1 définition(s))
- `public.tok_connect_idempotency_keys.tok_connect_idempotency_keys_admin_select` (1 définition(s))
- `public.tok_connect_partner_members.tok_connect_partner_members_admin_all` (1 définition(s))
- `public.tok_connect_partner_members.tok_connect_partner_members_member_select` (1 définition(s))
- `public.tok_connect_partners.tok_connect_partners_admin_all` (1 définition(s))
- `public.tok_connect_partners.tok_connect_partners_member_select` (1 définition(s))
- `public.tok_connect_restaurant_grants.tok_connect_restaurant_grants_admin_all` (1 définition(s))
- `public.tok_connect_restaurant_grants.tok_connect_restaurant_grants_restaurant_select` (1 définition(s))
- `public.tok_connect_restaurant_grants.tok_connect_restaurant_grants_restaurant_update` (1 définition(s))
- `public.tok_connect_webhook_deliveries.tok_connect_webhook_deliveries_admin_select` (1 définition(s))
- `public.tok_connect_webhook_deliveries.tok_connect_webhook_deliveries_member_select` (1 définition(s))
- `public.tok_connect_webhook_endpoints.tok_connect_webhook_endpoints_admin_all` (1 définition(s))
- `public.tok_one_subscriptions.tok_one_subscriptions_own_select` (1 définition(s))
- `public.tok_one_subscriptions.tok_one_subscriptions_own_update` (1 définition(s))
- `public.user_addresses.Require auth for user_addresses` (1 définition(s))
- `public.user_analytics.Admins can view all analytics` (1 définition(s))
- `public.user_analytics.Users can insert their own analytics` (1 définition(s))
- `public.user_analytics.Users can view their own analytics` (1 définition(s))
- `public.user_devices.Require auth for user_devices` (1 définition(s))
- `public.user_meal_subscription_settings.user_meal_subscription_settings_own_all` (1 définition(s))
- `public.user_notification_settings.Require auth for user_notification_settings` (1 définition(s))
- `public.user_payment_methods.Require auth for user_payment_methods` (1 définition(s))
- `public.user_preferences.Require auth for user_preferences` (1 définition(s))
- `public.user_preferences.Users can manage their preferences` (1 définition(s))
- `public.user_profiles.Admins can view all user_profiles` (1 définition(s))
- `public.user_profiles.Require auth for user_profiles` (1 définition(s))
- `public.user_profiles.user_profiles_self_all` (1 définition(s))
- `public.user_profiles.user_profiles_self_select` (1 définition(s))
- `public.user_referrals.Require auth for user_referrals` (1 définition(s))
- `public.user_referrals.Users manage own user_referrals` (1 définition(s))
- `public.user_referrals.user_referrals_owner_insert` (1 définition(s))
- `public.user_referrals.user_referrals_owner_select` (1 définition(s))
- `public.user_roles.Users can view their own roles` (1 définition(s))
- `public.user_roles.user_roles_admin_all` (1 définition(s))
- `public.user_roles.user_roles_self_select` (2 définition(s))
- `public.user_roles.user_roles_super_admin_all` (1 définition(s))
- `public.user_subscription_plans.Require auth for user_subscription_plans` (1 définition(s))
- `public.user_subscriptions.Require auth for user_subscriptions` (1 définition(s))
- `public.user_subscriptions.Users can manage their subscriptions` (1 définition(s))
- `public.user_wallets.Require auth for user_wallets` (1 définition(s))
- `public.user_wallets.wallets_admin` (2 définition(s))
- `public.user_wallets.wallets_own` (2 définition(s))
- `public.wallet_transactions.Require auth for wallet_transactions` (1 définition(s))
- `public.wallet_transactions.Users view own wallet_transactions` (1 définition(s))
- `public.wallet_transactions.wallet_transactions_owner_select` (1 définition(s))
- `reservations.Restaurant owners can update reservations` (2 définition(s))
- `reservations.Restaurant owners can view reservations` (2 définition(s))
- `reservations.Users can cancel their reservations` (2 définition(s))
- `reservations.Users can create reservations` (2 définition(s))
- `reservations.Users can view their own reservations` (2 définition(s))
- `restaurant_daily_kpis.Admins can manage daily kpis` (1 définition(s))
- `restaurant_daily_kpis.Restaurant owners can manage daily kpis` (1 définition(s))
- `restaurant_invoice_settings.Admins can manage invoice settings` (1 définition(s))
- `restaurant_invoice_settings.Restaurant owners can manage invoice settings` (1 définition(s))
- `restaurant_invoices.Admins can manage invoices` (1 définition(s))
- `restaurant_invoices.Restaurant owners can manage invoices` (1 définition(s))
- `restaurant_media.Admins can manage media` (1 définition(s))
- `restaurant_media.Anyone can view restaurant media` (1 définition(s))
- `restaurant_media.Restaurant owners can manage media` (1 définition(s))
- `restaurant_promotions.Admins can manage promotions` (1 définition(s))
- `restaurant_promotions.Restaurant owners can manage promotions` (1 définition(s))
- `restaurant_recommendations.Admins can manage recommendations` (1 définition(s))
- `restaurant_recommendations.Restaurant owners can manage recommendations` (1 définition(s))
- `restaurants.Admins can manage all restaurants` (2 définition(s))
- `restaurants.Anyone can view active restaurants` (2 définition(s))
- `restaurants.Owners can manage their restaurants` (2 définition(s))
- `reviews.Admins can delete reviews` (2 définition(s))
- `reviews.Anyone can view reviews` (2 définition(s))
- `reviews.Users can create reviews` (2 définition(s))
- `reviews.Users can delete their own reviews` (2 définition(s))
- `reviews.Users can update their own reviews` (2 définition(s))
- `storage.objects.Admins can list images` (1 définition(s))
- `storage.objects.Anyone can view images` (1 définition(s))
- `storage.objects.Anyone can view invoice logos` (1 définition(s))
- `storage.objects.Authenticated users can upload images` (1 définition(s))
- `storage.objects.Restaurant owners can delete their logos` (2 définition(s))
- `storage.objects.Restaurant owners can list their invoice logos` (2 définition(s))
- `storage.objects.Restaurant owners can upload invoice logos` (2 définition(s))
- `storage.objects.Users can delete images in their folder` (1 définition(s))
- `storage.objects.Users can delete their own images` (1 définition(s))
- `storage.objects.Users can update images in their folder` (1 définition(s))
- `storage.objects.Users can update their own images` (1 définition(s))
- `storage.objects.Users can upload images in their folder` (1 définition(s))
- `storage.objects.ai_generated_assets_storage_owner_insert` (2 définition(s))
- `storage.objects.ai_generated_assets_storage_owner_select` (2 définition(s))
- `storage.objects.launch_access_guard` (1 définition(s))
- `storage.objects.restaurant_images_storage_owner_delete` (1 définition(s))
- `storage.objects.restaurant_images_storage_owner_insert` (1 définition(s))
- `storage.objects.restaurant_images_storage_owner_select` (1 définition(s))
- `storage.objects.restaurant_images_storage_owner_update` (1 définition(s))
- `storage.objects.restaurant_removal_evidence_delete_own_pending` (1 définition(s))
- `storage.objects.restaurant_removal_evidence_insert_own` (1 définition(s))
- `storage.objects.restaurant_removal_evidence_read_own` (1 définition(s))
- `storage.objects.social_posts_storage_delete` (1 définition(s))
- `storage.objects.social_posts_storage_insert` (1 définition(s))
- `storage.objects.social_posts_storage_select` (1 définition(s))
- `storage.objects.social_posts_storage_update` (1 définition(s))
- `storage.objects.verification_documents_delete` (3 définition(s))
- `storage.objects.verification_documents_insert` (1 définition(s))
- `storage.objects.verification_documents_select` (1 définition(s))
- `storage.objects.verification_documents_update` (3 définition(s))

</details>

<details><summary>table (343)</summary>

- `AS` (2 définition(s))
- `does` (1 définition(s))
- `private.floor_plan_save_operations` (1 définition(s))
- `private_finance.commercial_signup_referrals` (1 définition(s))
- `private_finance.fair_growth_rollout_cutovers` (1 définition(s))
- `public.ad_campaign_attribution_touches` (1 définition(s))
- `public.ad_campaign_events` (1 définition(s))
- `public.ad_campaign_internal_test_events` (1 définition(s))
- `public.ad_campaign_pending_conversions` (1 définition(s))
- `public.ad_campaigns` (1 définition(s))
- `public.admin_catalog_change_history` (1 définition(s))
- `public.admin_dashboard_log_reset_history` (1 définition(s))
- `public.admin_loyalty_change_history` (1 définition(s))
- `public.admin_month_locks` (1 définition(s))
- `public.admin_review_action_history` (2 définition(s))
- `public.admin_supabase_advisor_snapshots` (1 définition(s))
- `public.admin_user_account_states` (1 définition(s))
- `public.ai_accounting_insights` (2 définition(s))
- `public.ai_admin_events` (2 définition(s))
- `public.ai_conversations` (2 définition(s))
- `public.ai_generated_assets` (2 définition(s))
- `public.ai_messages` (2 définition(s))
- `public.ai_performance_snapshots` (2 définition(s))
- `public.ai_restaurant_tasks` (2 définition(s))
- `public.ai_safety_rules` (2 définition(s))
- `public.ai_security_events` (2 définition(s))
- `public.ai_support_tickets` (2 définition(s))
- `public.ai_usage_costs` (1 définition(s))
- `public.ai_usage_logs` (2 définition(s))
- `public.allergens` (1 définition(s))
- `public.anti_waste_offers` (1 définition(s))
- `public.audit_log` (1 définition(s))
- `public.campaign_studio_runs` (1 définition(s))
- `public.cart_item_modifiers` (1 définition(s))
- `public.cart_items` (1 définition(s))
- `public.carts` (1 définition(s))
- `public.categories` (1 définition(s))
- `public.chef_table_checkout_holds` (1 définition(s))
- `public.chef_table_drops` (1 définition(s))
- `public.clicks` (1 définition(s))
- `public.collection_restaurants` (1 définition(s))
- `public.collections` (1 définition(s))
- `public.commercial_commissions` (1 définition(s))
- `public.commercial_compensation_adjustments` (1 définition(s))
- `public.commercial_compensation_profile_events` (1 définition(s))
- `public.commercial_compensation_profiles` (1 définition(s))
- `public.commercial_contract_acceptances` (1 définition(s))
- `public.commercial_contract_versions` (1 définition(s))
- `public.commercial_demo_accounts` (1 définition(s))
- `public.commercial_demo_ai_conversations` (1 définition(s))
- `public.commercial_demo_ai_generations` (1 définition(s))
- `public.commercial_demo_ai_messages` (1 définition(s))
- `public.commercial_demo_ai_provider_failures` (1 définition(s))
- `public.commercial_demo_ai_requests` (1 définition(s))
- `public.commercial_demo_ai_storage_cleanup_queue` (1 définition(s))
- `public.commercial_demo_catalog_items` (1 définition(s))
- `public.commercial_demo_delivery_missions` (1 définition(s))
- `public.commercial_demo_order_events` (1 définition(s))
- `public.commercial_demo_order_sessions` (1 définition(s))
- `public.commercial_demo_orders` (1 définition(s))
- `public.commercial_demo_reservations` (1 définition(s))
- `public.commercial_demo_shared_restaurant` (1 définition(s))
- `public.commercial_earning_events` (1 définition(s))
- `public.commercial_prospect_catalog` (1 définition(s))
- `public.commercial_prospect_followup_history` (2 définition(s))
- `public.commercial_prospect_followups` (1 définition(s))
- `public.commercial_statements` (1 définition(s))
- `public.commercial_subscription_commissions` (1 définition(s))
- `public.compensations` (1 définition(s))
- `public.consent_receipts` (1 définition(s))
- `public.conversations` (2 définition(s))
- `public.courier_documents` (2 définition(s))
- `public.courier_earnings` (2 définition(s))
- `public.courier_locations` (2 définition(s))
- `public.courier_shifts` (2 définition(s))
- `public.couriers` (2 définition(s))
- `public.credit_notes` (1 définition(s))
- `public.crm_mfa_recovery_challenges` (1 définition(s))
- `public.cuisines` (1 définition(s))
- `public.customer_memory_events` (1 définition(s))
- `public.customer_memory_items` (1 définition(s))
- `public.daily_slot_spins` (1 définition(s))
- `public.delivery_batches` (1 définition(s))
- `public.delivery_routes` (1 définition(s))
- `public.delivery_tracking` (1 définition(s))
- `public.developer_statements` (1 définition(s))
- `public.developer_stripe_transfers` (1 définition(s))
- `public.device_tokens` (1 définition(s))
- `public.dish_allergens` (1 définition(s))
- `public.dish_availability_windows` (1 définition(s))
- `public.dish_images` (1 définition(s))
- `public.dish_modifier_groups` (1 définition(s))
- `public.dish_modifier_options` (1 définition(s))
- `public.dish_tags` (1 définition(s))
- `public.dish_variants` (1 définition(s))
- `public.dishes` (1 définition(s))
- `public.dispatch_attempts` (2 définition(s))
- `public.dispatch_jobs` (2 définition(s))
- `public.edge_function_audit_logs` (1 définition(s))
- `public.email_queue` (1 définition(s))
- `public.event_store` (1 définition(s))
- `public.fair_growth_modules` (1 définition(s))
- `public.favorites` (1 définition(s))
- `public.feature_flag_audit_logs` (1 définition(s))
- `public.feature_flags` (1 définition(s))
- `public.feature_store` (1 définition(s))
- `public.finance_outbox` (1 définition(s))
- `public.finance_runtime_config` (1 définition(s))
- `public.financial_ledger` (1 définition(s))
- `public.flash_sales` (1 définition(s))
- `public.floor_plan_variants` (1 définition(s))
- `public.fraud_signals` (1 définition(s))
- `public.gift_cards` (1 définition(s))
- `public.gift_points` (1 définition(s))
- `public.google_actions_center_bookings` (1 définition(s))
- `public.google_actions_center_outbox` (1 définition(s))
- `public.group_member_orders` (1 définition(s))
- `public.group_members` (1 définition(s))
- `public.image_analysis_jobs` (1 définition(s))
- `public.impressions` (1 définition(s))
- `public.incident_reports` (1 définition(s))
- `public.inventory_items` (1 définition(s))
- `public.inventory_movements` (1 définition(s))
- `public.invoices` (1 définition(s))
- `public.launch_gate_clock` (1 définition(s))
- `public.launch_pack_service_fulfillments` (1 définition(s))
- `public.launch_packs` (1 définition(s))
- `public.loyalty_accounts` (1 définition(s))
- `public.loyalty_tiers` (1 définition(s))
- `public.loyalty_transactions` (1 définition(s))
- `public.marketing_admin_auth_challenges` (1 définition(s))
- `public.marketing_admin_login_limits` (1 définition(s))
- `public.marketing_admin_web_sessions` (1 définition(s))
- `public.marketing_ai_runs` (1 définition(s))
- `public.marketing_asset_rights` (1 définition(s))
- `public.marketing_assets` (1 définition(s))
- `public.marketing_attribution_facts` (1 définition(s))
- `public.marketing_automation_actions` (1 définition(s))
- `public.marketing_automation_runs` (1 définition(s))
- `public.marketing_automation_simulation_receipts` (1 définition(s))
- `public.marketing_automation_templates` (1 définition(s))
- `public.marketing_automations` (1 définition(s))
- `public.marketing_backlinks` (1 définition(s))
- `public.marketing_budget_periods` (1 définition(s))
- `public.marketing_calendar_items` (1 définition(s))
- `public.marketing_campaign_assets` (1 définition(s))
- `public.marketing_campaigns` (1 définition(s))
- `public.marketing_contacts` (1 définition(s))
- `public.marketing_deliveries` (1 définition(s))
- `public.marketing_events` (1 définition(s))
- `public.marketing_integrations` (1 définition(s))
- `public.marketing_lawful_basis_evidence` (1 définition(s))
- `public.marketing_outreach_drafts` (1 définition(s))
- `public.marketing_outreach_opportunities` (1 définition(s))
- `public.marketing_outreach_targets` (1 définition(s))
- `public.marketing_provider_accounts` (1 définition(s))
- `public.marketing_provider_probes` (1 définition(s))
- `public.marketing_utm_plans` (1 définition(s))
- `public.marketplace_alert_state_history` (1 définition(s))
- `public.marketplace_alert_states` (1 définition(s))
- `public.meal_formula_categories` (1 définition(s))
- `public.meal_formulas` (1 définition(s))
- `public.menu_categories` (1 définition(s))
- `public.menu_items` (1 définition(s))
- `public.messages` (2 définition(s))
- `public.ml_predictions` (1 définition(s))
- `public.notification_campaigns` (1 définition(s))
- `public.notification_deliveries` (1 définition(s))
- `public.notification_preferences` (1 définition(s))
- `public.notification_subscriptions` (1 définition(s))
- `public.notifications` (1 définition(s))
- `public.ops_guardian_assessments` (1 définition(s))
- `public.ops_guardian_verifications` (1 définition(s))
- `public.ops_incident_events` (1 définition(s))
- `public.ops_incidents` (1 définition(s))
- `public.order_addresses` (1 définition(s))
- `public.order_events` (1 définition(s))
- `public.order_fees` (1 définition(s))
- `public.order_groups` (1 définition(s))
- `public.order_issues` (1 définition(s))
- `public.order_item_modifiers` (1 définition(s))
- `public.order_items` (2 définition(s))
- `public.order_notes` (1 définition(s))
- `public.order_refunds` (1 définition(s))
- `public.order_status_history` (1 définition(s))
- `public.order_taxes` (1 définition(s))
- `public.orders` (1 définition(s))
- `public.payment_attempts` (1 définition(s))
- `public.payment_intents` (1 définition(s))
- `public.payment_transactions` (2 définition(s))
- `public.payout_batches` (1 définition(s))
- `public.payouts` (1 définition(s))
- `public.platform_cost_entries` (1 définition(s))
- `public.platform_revenue_entries` (1 définition(s))
- `public.print_documents` (1 définition(s))
- `public.print_exports` (1 définition(s))
- `public.print_fulfillment_jobs` (1 définition(s))
- `public.print_order_events` (1 définition(s))
- `public.print_order_items` (1 définition(s))
- `public.print_orders` (1 définition(s))
- `public.print_products` (1 définition(s))
- `public.print_provider_events` (1 définition(s))
- `public.print_provider_products` (1 définition(s))
- `public.print_quotes` (1 définition(s))
- `public.print_reorders` (1 définition(s))
- `public.print_settings` (1 définition(s))
- `public.profiles` (1 définition(s))
- `public.promo_code_uses` (2 définition(s))
- `public.promo_codes` (2 définition(s))
- `public.proof_of_delivery` (1 définition(s))
- `public.rate_limit_buckets` (1 définition(s))
- `public.recommendation_logs` (1 définition(s))
- `public.referral_codes` (2 définition(s))
- `public.refund_operations` (1 définition(s))
- `public.reservation_fee_adjustments` (1 définition(s))
- `public.reservation_fee_charges` (1 définition(s))
- `public.reservation_flat_fee_charges` (1 définition(s))
- `public.reservation_progressive_offers` (1 définition(s))
- `public.reservation_slots` (1 définition(s))
- `public.reservation_status_history` (1 définition(s))
- `public.reservation_table_layout_overrides` (1 définition(s))
- `public.reservation_tables` (1 définition(s))
- `public.reservations` (1 définition(s))
- `public.restaurant_activation_metrics` (1 définition(s))
- `public.restaurant_admin_correction_requests` (1 définition(s))
- `public.restaurant_ai_profiles` (2 définition(s))
- `public.restaurant_ai_subscriptions` (2 définition(s))
- `public.restaurant_booking_channels` (1 définition(s))
- `public.restaurant_branches` (1 définition(s))
- `public.restaurant_contracts` (1 définition(s))
- `public.restaurant_credit_packs` (1 définition(s))
- `public.restaurant_credit_purchases` (1 définition(s))
- `public.restaurant_cuisine_evidence` (1 définition(s))
- `public.restaurant_cuisines` (1 définition(s))
- `public.restaurant_daily_dish_runs` (1 définition(s))
- `public.restaurant_daily_dish_settings` (1 définition(s))
- `public.restaurant_daily_dish_variants` (1 définition(s))
- `public.restaurant_daily_dishes` (1 définition(s))
- `public.restaurant_daily_kpis` (1 définition(s))
- `public.restaurant_deals` (1 définition(s))
- `public.restaurant_delivery_rules` (1 définition(s))
- `public.restaurant_directory_claim_requests` (1 définition(s))
- `public.restaurant_directory_cuisine_jobs` (1 définition(s))
- `public.restaurant_directory_cuisine_osm_jobs` (1 définition(s))
- `public.restaurant_directory_image_jobs` (1 définition(s))
- `public.restaurant_directory_name_jobs` (1 définition(s))
- `public.restaurant_directory_removal_requests` (1 définition(s))
- `public.restaurant_documents` (1 définition(s))
- `public.restaurant_follows` (1 définition(s))
- `public.restaurant_google_booking_events` (1 définition(s))
- `public.restaurant_google_booking_setup` (1 définition(s))
- `public.restaurant_hours` (1 définition(s))
- `public.restaurant_image_discovery_jobs` (1 définition(s))
- `public.restaurant_image_truth_reviews` (1 définition(s))
- `public.restaurant_images` (1 définition(s))
- `public.restaurant_invoice_line_items` (1 définition(s))
- `public.restaurant_invoice_settings` (1 définition(s))
- `public.restaurant_invoices` (1 définition(s))
- `public.restaurant_launch_packs` (1 définition(s))
- `public.restaurant_leads` (1 définition(s))
- `public.restaurant_media` (1 définition(s))
- `public.restaurant_onboarding_state_events` (1 définition(s))
- `public.restaurant_paid_module_events` (1 définition(s))
- `public.restaurant_paid_modules` (1 définition(s))
- `public.restaurant_payout_settings` (1 définition(s))
- `public.restaurant_preferred_tables` (1 définition(s))
- `public.restaurant_promotions` (1 définition(s))
- `public.restaurant_recommendations` (1 définition(s))
- `public.restaurant_service_areas` (1 définition(s))
- `public.restaurant_settings` (1 définition(s))
- `public.restaurant_staff` (1 définition(s))
- `public.restaurant_stripe_adjustments` (1 définition(s))
- `public.restaurant_subscription_activation_jobs` (1 définition(s))
- `public.restaurant_subscription_payment_events` (1 définition(s))
- `public.restaurant_subscription_payment_methods` (1 définition(s))
- `public.restaurant_subscription_plans` (1 définition(s))
- `public.restaurant_thefork_catalog` (3 définition(s))
- `public.restaurants` (1 définition(s))
- `public.review_replies` (1 définition(s))
- `public.review_reports` (1 définition(s))
- `public.reviews` (1 définition(s))
- `public.sales_representatives` (1 définition(s))
- `public.search_logs` (1 définition(s))
- `public.signup_application_documents` (1 définition(s))
- `public.signup_application_drafts` (1 définition(s))
- `public.signup_application_review_events` (1 définition(s))
- `public.signup_applications` (1 définition(s))
- `public.social_comment_reactions` (1 définition(s))
- `public.social_feed_events` (1 définition(s))
- `public.social_feed_feedback` (1 définition(s))
- `public.social_post_comments` (1 définition(s))
- `public.social_post_external_shares` (1 définition(s))
- `public.social_post_likes` (1 définition(s))
- `public.social_post_media` (1 définition(s))
- `public.social_post_metrics_daily` (1 définition(s))
- `public.social_post_premium_banner_deliveries` (1 définition(s))
- `public.social_post_premium_banners` (1 définition(s))
- `public.social_post_promotions` (1 définition(s))
- `public.social_post_reposts` (1 définition(s))
- `public.social_post_saves` (1 définition(s))
- `public.social_posts` (1 définition(s))
- `public.social_reports` (1 définition(s))
- `public.social_user_blocks` (1 définition(s))
- `public.solidarity_donations` (1 définition(s))
- `public.stripe_webhook_events` (1 définition(s))
- `public.subscription_benefits` (1 définition(s))
- `public.supplier_catalog_products` (1 définition(s))
- `public.supplier_catalog_syncs` (1 définition(s))
- `public.support_incident_messages` (1 définition(s))
- `public.support_incidents` (1 définition(s))
- `public.support_messages` (2 définition(s))
- `public.support_ops_incident_links` (1 définition(s))
- `public.support_resolution_actions` (1 définition(s))
- `public.support_resolution_runs` (1 définition(s))
- `public.support_tickets` (2 définition(s))
- `public.swiss_vat_rates` (1 définition(s))
- `public.thefork_deploy_probe` (1 définition(s))
- `public.tok_connect_access_tokens` (1 définition(s))
- `public.tok_connect_agent_runs` (1 définition(s))
- `public.tok_connect_api_requests` (1 définition(s))
- `public.tok_connect_clients` (1 définition(s))
- `public.tok_connect_idempotency_keys` (1 définition(s))
- `public.tok_connect_mcp_action_idempotency` (1 définition(s))
- `public.tok_connect_partner_members` (1 définition(s))
- `public.tok_connect_partners` (1 définition(s))
- `public.tok_connect_restaurant_grants` (1 définition(s))
- `public.tok_connect_webhook_deliveries` (1 définition(s))
- `public.tok_connect_webhook_endpoints` (1 définition(s))
- `public.tok_one_subscriptions` (1 définition(s))
- `public.user_addresses` (1 définition(s))
- `public.user_analytics` (1 définition(s))
- `public.user_devices` (1 définition(s))
- `public.user_meal_subscription_settings` (1 définition(s))
- `public.user_notification_settings` (1 définition(s))
- `public.user_payment_methods` (1 définition(s))
- `public.user_preferences` (2 définition(s))
- `public.user_profiles` (1 définition(s))
- `public.user_referrals` (1 définition(s))
- `public.user_roles` (1 définition(s))
- `public.user_subscription_plans` (1 définition(s))
- `public.user_subscriptions` (2 définition(s))
- `public.user_wallets` (3 définition(s))
- `public.wallet_transactions` (1 définition(s))

</details>

<details><summary>trigger (239)</summary>

- `after_anti_gaspi_subscription_alert` (3 définition(s))
- `after_chefs_table_subscription_alert` (3 définition(s))
- `after_flash_sale_subscription_alert` (3 définition(s))
- `after_invoice_notification` (1 définition(s))
- `after_order_status_update` (5 définition(s))
- `after_reservation_notification` (3 définition(s))
- `after_restaurant_review_notification` (2 définition(s))
- `after_review_change` (1 définition(s))
- `after_review_reply_notification` (1 définition(s))
- `after_review_report_admin_notification` (2 définition(s))
- `apply_flat_reservation_fee_on_arrival` (1 définition(s))
- `audit_commercial_compensation_profile` (1 définition(s))
- `audit_commercial_prospect_followup` (2 définition(s))
- `audit_orders` (2 définition(s))
- `audit_reservations` (2 définition(s))
- `audit_restaurants` (2 définition(s))
- `auto_disable_sold_out_anti_waste_offers` (1 définition(s))
- `auto_disable_sold_out_flash_sales` (1 définition(s))
- `block_commercial_demo_account_production_transaction` (1 définition(s))
- `block_commercial_demo_side_effect_row` (1 définition(s))
- `block_commercial_demo_social_side_effect_row` (1 définition(s))
- `capture_signup_application_draft_on_auth_user` (1 définition(s))
- `commercial_contract_acceptances_immutable` (1 définition(s))
- `commercial_demo_accounts_updated_at` (1 définition(s))
- `commercial_demo_ai_session_lifecycle_cleanup` (1 définition(s))
- `commercial_demo_events_append_only` (1 définition(s))
- `create_deferred_subscription_on_signup` (1 définition(s))
- `enforce_commercial_demo_restaurant_active` (1 définition(s))
- `enforce_dashboard_pack_paid_module_write` (1 définition(s))
- `enforce_restaurateur_signup_role` (2 définition(s))
- `enforce_signed_commercial_prospect_status_owner` (1 définition(s))
- `enqueue_image_analysis_job_on_insert` (2 définition(s))
- `guard_ad_campaign_client_write` (1 définition(s))
- `guard_commercial_demo_image_analysis_job` (1 définition(s))
- `guard_commercial_role_assignment` (2 définition(s))
- `guard_fair_growth_module_feature_keys` (1 définition(s))
- `guard_human_signup_review` (2 définition(s))
- `guard_locked_order_status` (1 définition(s))
- `guard_locked_reservation_status` (1 définition(s))
- `guard_online_order_confirmation_requires_payment` (1 définition(s))
- `guard_recognized_restaurant_invoice_header` (1 définition(s))
- `guard_recognized_restaurant_invoice_lines` (1 définition(s))
- `guard_referenced_feature_flag` (1 définition(s))
- `guard_restaurant_image_client_writes_on_write` (1 définition(s))
- `guard_restaurateur_signup_approval_payment` (1 définition(s))
- `guard_tok_credit_spend_ad_campaigns` (1 définition(s))
- `guard_tok_credit_spend_ai_usage_logs` (1 définition(s))
- `invalidate_commercial_signup_referrals` (1 définition(s))
- `marketing_asset_rights_append_only` (1 définition(s))
- `marketing_assets_touch` (1 définition(s))
- `marketing_attribution_facts_append_only` (1 définition(s))
- `marketing_automation_actions_append_only` (1 définition(s))
- `marketing_automation_templates_touch` (1 définition(s))
- `marketing_automations_touch` (1 définition(s))
- `marketing_backlinks_audit` (1 définition(s))
- `marketing_backlinks_touch` (1 définition(s))
- `marketing_calendar_touch` (1 définition(s))
- `marketing_campaigns_touch` (1 définition(s))
- `marketing_campaigns_transition` (1 définition(s))
- `marketing_contacts_lawful_basis_evidence` (1 définition(s))
- `marketing_contacts_touch` (1 définition(s))
- `marketing_deliveries_events` (1 définition(s))
- `marketing_deliveries_touch` (1 définition(s))
- `marketing_events_no_update` (1 définition(s))
- `marketing_integrations_touch` (1 définition(s))
- `marketing_lawful_basis_evidence_no_update` (1 définition(s))
- `marketing_outreach_drafts_audit` (1 définition(s))
- `marketing_outreach_drafts_touch` (1 définition(s))
- `marketing_outreach_opportunities_audit` (1 définition(s))
- `marketing_outreach_opportunities_touch` (1 définition(s))
- `marketing_outreach_targets_audit` (1 définition(s))
- `marketing_outreach_targets_touch` (1 définition(s))
- `marketing_provider_accounts_touch` (1 définition(s))
- `marketing_provider_probes_append_only` (1 définition(s))
- `marketing_utm_plans_touch` (1 définition(s))
- `normalize_financial_ledger_stripe_mode` (1 définition(s))
- `normalize_photo_ai_usage_credit_units` (2 définition(s))
- `normalize_restaurant_city_alias` (1 définition(s))
- `normalize_restaurant_operational_state` (1 définition(s))
- `notify_restaurant_follow_insert` (2 définition(s))
- `notify_social_comment_insert` (2 définition(s))
- `notify_social_repost_insert` (1 définition(s))
- `on_auth_user_created` (1 définition(s))
- `on_auth_user_email_confirmed` (2 définition(s))
- `orders_guard_acceptance_capacity` (1 définition(s))
- `prepare_actualites_media_for_indexing_on_write` (2 définition(s))
- `prepare_commercial_commission_lifecycle` (1 définition(s))
- `prepare_restaurant_media_for_indexing_on_write` (1 définition(s))
- `prevent_commercial_compensation_profile_event_mutation` (1 définition(s))
- `prevent_commercial_earning_mutation` (1 définition(s))
- `prevent_commercial_followup_history_mutation` (2 définition(s))
- `prevent_commercial_prospect_followup_delete` (2 définition(s))
- `prevent_duplicate_ad_campaign_conversion_entity` (1 définition(s))
- `prevent_financial_ledger_update_delete` (1 définition(s))
- `prevent_locked_commercial_statement_mutation` (1 définition(s))
- `prevent_locked_developer_statement_update` (1 définition(s))
- `prevent_restaurant_demo_status_change` (1 définition(s))
- `prevent_restaurant_image_reassignment` (1 définition(s))
- `prevent_restaurant_invoice_line_items_locked_period` (1 définition(s))
- `prevent_restaurant_invoices_locked_period` (1 définition(s))
- `protect_canonical_commercial_demo_inert_state` (1 définition(s))
- `protect_commercial_demo_account_boundary` (2 définition(s))
- `protect_commercial_demo_account_mapping` (2 définition(s))
- `protect_demo_restaurant_identity` (2 définition(s))
- `protect_generated_print_format` (1 définition(s))
- `protect_match_group_capture_claim_insert` (1 définition(s))
- `protect_match_group_capture_claim_mutation` (1 définition(s))
- `protect_restaurant_moderation_state` (2 définition(s))
- `protect_restaurant_subscription_pricing_snapshot` (1 définition(s))
- `queue_subscription_activation_on_order` (1 définition(s))
- `queue_subscription_activation_on_reservation` (1 définition(s))
- `record_actualites_order_conversion_on_orders` (2 définition(s))
- `record_actualites_reservation_conversion_on_reservations` (2 définition(s))
- `record_paid_restaurant_invoice_finance` (1 définition(s))
- `reject_demo_restaurant_paid_module` (1 définition(s))
- `reject_signup_review_event_mutation` (1 définition(s))
- `reservation_fee_adjustments_immutable` (1 définition(s))
- `reservation_fee_charges_immutable` (1 définition(s))
- `reservations_apply_confirmation_deposit` (1 définition(s))
- `reservations_progressive_offer_apply` (1 définition(s))
- `reservations_progressive_offer_recount` (1 définition(s))
- `reservations_set_confirmed_at` (1 définition(s))
- `restaurant_cuisine_evidence_reject_generic_osm_regional` (1 définition(s))
- `restaurant_cuisines_mark_directory_job_satisfied` (1 définition(s))
- `restaurant_cuisines_mark_osm_job_satisfied` (1 définition(s))
- `restaurant_daily_dish_runs_touch` (1 définition(s))
- `restaurant_daily_dish_settings_touch` (1 définition(s))
- `restaurant_daily_dish_variants_touch` (1 définition(s))
- `restaurant_daily_dishes_service_day_guard` (1 définition(s))
- `restaurant_daily_dishes_touch` (1 définition(s))
- `restaurants_00_protect_directory_listing_state` (1 définition(s))
- `restaurants_01_protect_directory_public_name_quality` (2 définition(s))
- `restaurants_enqueue_directory_cuisine_osm_research` (1 définition(s))
- `restaurants_enqueue_directory_cuisine_research` (1 définition(s))
- `restaurants_sync_directory_name_job` (1 définition(s))
- `set_commercial_subscription_commissions_updated_at` (1 définition(s))
- `set_financial_ledger_livemode` (1 définition(s))
- `set_floor_plan_variants_updated_at` (1 définition(s))
- `set_image_analysis_jobs_updated_at` (1 définition(s))
- `set_payment_transaction_integrity` (1 définition(s))
- `set_reservation_fair_growth_snapshot` (1 définition(s))
- `set_restaurant_images_updated_at` (1 définition(s))
- `set_restaurant_invoice_line_items_updated_at` (1 définition(s))
- `set_restaurant_slug` (1 définition(s))
- `set_restaurant_subscription_activation_jobs_updated_at` (1 définition(s))
- `set_restaurant_subscription_payment_methods_updated_at` (1 définition(s))
- `set_updated_at` (16 définition(s))
- `set_updated_at_commercial_compensation_adjustments` (1 définition(s))
- `set_updated_at_commercial_compensation_profiles` (1 définition(s))
- `set_updated_at_commercial_prospect_followups` (1 définition(s))
- `set_updated_at_delivery_tracking` (1 définition(s))
- `set_updated_at_flash_sales` (1 définition(s))
- `set_updated_at_google_actions_center_bookings` (1 définition(s))
- `set_updated_at_launch_pack_fulfillments` (1 définition(s))
- `set_updated_at_launch_packs` (1 définition(s))
- `set_updated_at_orders` (1 définition(s))
- `set_updated_at_restaurant_google_booking_setup` (1 définition(s))
- `set_updated_at_restaurant_launch_packs` (1 définition(s))
- `set_updated_at_restaurants` (1 définition(s))
- `set_updated_at_review_reports` (1 définition(s))
- `set_updated_at_signup_application_documents` (1 définition(s))
- `set_updated_at_signup_applications` (1 définition(s))
- `set_updated_at_social_comments` (1 définition(s))
- `set_updated_at_social_posts` (1 définition(s))
- `set_updated_at_social_reports` (1 définition(s))
- `set_updated_at_social_reposts` (1 définition(s))
- `set_updated_at_tok_connect_clients` (1 définition(s))
- `set_updated_at_tok_connect_partners` (1 définition(s))
- `set_updated_at_tok_connect_restaurant_grants` (1 définition(s))
- `set_updated_at_tok_connect_webhook_endpoints` (1 définition(s))
- `set_updated_at_user_meal_subscription_settings` (1 définition(s))
- `signup_application_directory_claim_review` (1 définition(s))
- `social_comment_reactions_refresh_counts` (1 définition(s))
- `social_comments_refresh_counts` (1 définition(s))
- `social_external_shares_refresh_counts` (1 définition(s))
- `social_likes_refresh_counts` (1 définition(s))
- `social_reposts_refresh_counts` (1 définition(s))
- `sync_actualites_media_image_index_on_write` (2 définition(s))
- `sync_commercial_subscription_commission` (1 définition(s))
- `sync_launch_gate_clock` (1 définition(s))
- `sync_restaurant_media_image_index_on_write` (1 définition(s))
- `sync_social_post_promotion_status_on_campaign` (1 définition(s))
- `tg_ai_support_tickets_apply_miamz_priority` (1 définition(s))
- `tg_orders_apply_miamz_metadata` (1 définition(s))
- `tg_reservations_apply_miamz_metadata` (1 définition(s))
- `tg_support_incidents_apply_miamz_priority` (1 définition(s))
- `touch_ai_conversations_updated_at` (2 définition(s))
- `touch_ai_restaurant_tasks_updated_at` (2 définition(s))
- `touch_ai_safety_rules_updated_at` (2 définition(s))
- `touch_ai_support_tickets_updated_at` (2 définition(s))
- `touch_group_member_order_updated_at` (1 définition(s))
- `touch_restaurant_ai_profiles_updated_at` (2 définition(s))
- `touch_restaurant_ai_subscriptions_updated_at` (2 définition(s))
- `touch_restaurant_contracts_updated_at` (1 définition(s))
- `touch_restaurant_credit_packs_updated_at` (1 définition(s))
- `touch_restaurant_credit_purchases_updated_at` (1 définition(s))
- `touch_social_post_premium_banner_deliveries_updated_at` (1 définition(s))
- `touch_social_post_premium_banners_updated_at` (1 définition(s))
- `touch_support_incident_last_message` (1 définition(s))
- `touch_support_incident_updated_at` (1 définition(s))
- `trg_audit_orders` (3 définition(s))
- `trg_audit_reservations` (3 définition(s))
- `trg_audit_restaurants` (1 définition(s))
- `trg_credit_order_loyalty` (5 définition(s))
- `trg_credit_reservation_loyalty` (5 définition(s))
- `trg_ensure_social_post_boost_integrity` (2 définition(s))
- `trg_feature_flag_audit` (1 définition(s))
- `trg_google_actions_center_outbox` (1 définition(s))
- `trg_guard_reservation_table_slot` (1 définition(s))
- `trg_ops_incidents_prevent_github_run_rebind` (1 définition(s))
- `trg_ops_incidents_updated_at` (1 définition(s))
- `trg_order_number` (1 définition(s))
- `trg_order_status_notification` (2 définition(s))
- `trg_preserve_terminal_restaurant_image_truth_review` (1 définition(s))
- `trg_process_pending_ad_campaign_order_conversions` (1 définition(s))
- `trg_process_pending_ad_campaign_reservation_conversions` (1 définition(s))
- `trg_queue_directory_image_candidate` (1 définition(s))
- `trg_queue_restaurant_image_discovery_after_name_verification` (1 définition(s))
- `trg_recompute_review_stats` (2 définition(s))
- `trg_refresh_kpis_orders` (1 définition(s))
- `trg_refresh_kpis_reservations` (1 définition(s))
- `trg_reservation_reference` (1 définition(s))
- `trg_reservations_autoassign_table` (1 définition(s))
- `trg_restaurants_search_vector` (2 définition(s))
- `trg_social_report_auto_block_author` (1 définition(s))
- `trg_supplier_catalog_products_touch` (1 définition(s))
- `trg_update_loyalty_tier` (3 définition(s))
- `trg_updated_at_orders` (3 définition(s))
- `trg_updated_at_restaurants` (2 définition(s))
- `trigger_order_status_notification` (1 définition(s))
- `trigger_recompute_review_stats` (1 définition(s))
- `update_restaurant_images_search_fields_on_change` (1 définition(s))
- `validate_commercial_compensation_profile` (2 définition(s))
- `validate_restaurant_subscription_pricing_insert` (1 définition(s))
- `validate_signup_document_manifest` (2 définition(s))
- `zz_fence_restaurant_payment_capture_delete` (1 définition(s))
- `zz_fence_restaurant_payment_capture_update` (1 définition(s))
- `zz_guard_completed_reservation_honor` (1 définition(s))
- `zz_guard_insert_completed_reservation_honor` (1 définition(s))

</details>

<details><summary>type (3)</summary>

- `public.app_role` (1 définition(s))
- `public.commercial_visit_status` (1 définition(s))
- `public.loyalty_tier` (1 définition(s))

</details>

<details><summary>view (3)</summary>

- `public.admin_platform_finance_monthly_snapshot` (2 définition(s))
- `public.marketing_event_facts` (1 définition(s))
- `resets` (1 définition(s))

</details>

### Contrat TypeScript Supabase versionné

Ce contrat décrit ce que le frontend peut typer localement. Il ne remplace pas une introspection de la base distante et peut révéler un décalage de génération.

| Type | Nom | Source |
| --- | --- | --- |
| table | ad_campaign_events | [src/integrations/supabase/types.ts:17](../../src/integrations/supabase/types.ts#L17) |
| table | ad_campaigns | [src/integrations/supabase/types.ts:77](../../src/integrations/supabase/types.ts#L77) |
| table | allergens | [src/integrations/supabase/types.ts:196](../../src/integrations/supabase/types.ts#L196) |
| table | anti_waste_offers | [src/integrations/supabase/types.ts:214](../../src/integrations/supabase/types.ts#L214) |
| table | audit_log | [src/integrations/supabase/types.ts:273](../../src/integrations/supabase/types.ts#L273) |
| table | cart_item_modifiers | [src/integrations/supabase/types.ts:309](../../src/integrations/supabase/types.ts#L309) |
| table | cart_items | [src/integrations/supabase/types.ts:348](../../src/integrations/supabase/types.ts#L348) |
| table | carts | [src/integrations/supabase/types.ts:393](../../src/integrations/supabase/types.ts#L393) |
| table | categories | [src/integrations/supabase/types.ts:448](../../src/integrations/supabase/types.ts#L448) |
| table | chef_table_drops | [src/integrations/supabase/types.ts:475](../../src/integrations/supabase/types.ts#L475) |
| table | clicks | [src/integrations/supabase/types.ts:540](../../src/integrations/supabase/types.ts#L540) |
| table | collection_restaurants | [src/integrations/supabase/types.ts:575](../../src/integrations/supabase/types.ts#L575) |
| table | collections | [src/integrations/supabase/types.ts:608](../../src/integrations/supabase/types.ts#L608) |
| table | compensations | [src/integrations/supabase/types.ts:641](../../src/integrations/supabase/types.ts#L641) |
| table | conversations | [src/integrations/supabase/types.ts:682](../../src/integrations/supabase/types.ts#L682) |
| table | courier_documents | [src/integrations/supabase/types.ts:720](../../src/integrations/supabase/types.ts#L720) |
| table | courier_earnings | [src/integrations/supabase/types.ts:767](../../src/integrations/supabase/types.ts#L767) |
| table | courier_locations | [src/integrations/supabase/types.ts:812](../../src/integrations/supabase/types.ts#L812) |
| table | courier_shifts | [src/integrations/supabase/types.ts:853](../../src/integrations/supabase/types.ts#L853) |
| table | couriers | [src/integrations/supabase/types.ts:891](../../src/integrations/supabase/types.ts#L891) |
| table | credit_notes | [src/integrations/supabase/types.ts:960](../../src/integrations/supabase/types.ts#L960) |
| table | cuisines | [src/integrations/supabase/types.ts:995](../../src/integrations/supabase/types.ts#L995) |
| table | delivery_batches | [src/integrations/supabase/types.ts:1022](../../src/integrations/supabase/types.ts#L1022) |
| table | delivery_routes | [src/integrations/supabase/types.ts:1057](../../src/integrations/supabase/types.ts#L1057) |
| table | delivery_tracking | [src/integrations/supabase/types.ts:1108](../../src/integrations/supabase/types.ts#L1108) |
| table | device_tokens | [src/integrations/supabase/types.ts:1173](../../src/integrations/supabase/types.ts#L1173) |
| table | dish_allergens | [src/integrations/supabase/types.ts:1203](../../src/integrations/supabase/types.ts#L1203) |
| table | dish_availability_windows | [src/integrations/supabase/types.ts:1233](../../src/integrations/supabase/types.ts#L1233) |
| table | dish_images | [src/integrations/supabase/types.ts:1265](../../src/integrations/supabase/types.ts#L1265) |
| table | dish_modifier_groups | [src/integrations/supabase/types.ts:1297](../../src/integrations/supabase/types.ts#L1297) |
| table | dish_modifier_options | [src/integrations/supabase/types.ts:1335](../../src/integrations/supabase/types.ts#L1335) |
| table | dish_tags | [src/integrations/supabase/types.ts:1370](../../src/integrations/supabase/types.ts#L1370) |
| table | dish_variants | [src/integrations/supabase/types.ts:1393](../../src/integrations/supabase/types.ts#L1393) |
| table | dishes | [src/integrations/supabase/types.ts:1425](../../src/integrations/supabase/types.ts#L1425) |
| table | dispatch_attempts | [src/integrations/supabase/types.ts:1475](../../src/integrations/supabase/types.ts#L1475) |
| table | dispatch_jobs | [src/integrations/supabase/types.ts:1526](../../src/integrations/supabase/types.ts#L1526) |
| table | edge_function_audit_logs | [src/integrations/supabase/types.ts:1628](../../src/integrations/supabase/types.ts#L1628) |
| table | email_queue | [src/integrations/supabase/types.ts:1673](../../src/integrations/supabase/types.ts#L1673) |
| table | event_store | [src/integrations/supabase/types.ts:1712](../../src/integrations/supabase/types.ts#L1712) |
| table | favorites | [src/integrations/supabase/types.ts:1739](../../src/integrations/supabase/types.ts#L1739) |
| table | feature_flags | [src/integrations/supabase/types.ts:1768](../../src/integrations/supabase/types.ts#L1768) |
| table | commercial_prospect_followups | [src/integrations/supabase/types.ts:1798](../../src/integrations/supabase/types.ts#L1798) |
| table | feature_store | [src/integrations/supabase/types.ts:1882](../../src/integrations/supabase/types.ts#L1882) |
| table | flash_sales | [src/integrations/supabase/types.ts:1906](../../src/integrations/supabase/types.ts#L1906) |
| table | fraud_signals | [src/integrations/supabase/types.ts:1971](../../src/integrations/supabase/types.ts#L1971) |
| table | gift_cards | [src/integrations/supabase/types.ts:2016](../../src/integrations/supabase/types.ts#L2016) |
| table | gift_points | [src/integrations/supabase/types.ts:2063](../../src/integrations/supabase/types.ts#L2063) |
| table | group_members | [src/integrations/supabase/types.ts:2105](../../src/integrations/supabase/types.ts#L2105) |
| table | impressions | [src/integrations/supabase/types.ts:2144](../../src/integrations/supabase/types.ts#L2144) |
| table | incident_reports | [src/integrations/supabase/types.ts:2171](../../src/integrations/supabase/types.ts#L2171) |
| table | inventory_items | [src/integrations/supabase/types.ts:2207](../../src/integrations/supabase/types.ts#L2207) |
| table | inventory_movements | [src/integrations/supabase/types.ts:2255](../../src/integrations/supabase/types.ts#L2255) |
| table | invoices | [src/integrations/supabase/types.ts:2287](../../src/integrations/supabase/types.ts#L2287) |
| table | launch_pack_service_fulfillments | [src/integrations/supabase/types.ts:2337](../../src/integrations/supabase/types.ts#L2337) |
| table | launch_packs | [src/integrations/supabase/types.ts:2390](../../src/integrations/supabase/types.ts#L2390) |
| table | loyalty_accounts | [src/integrations/supabase/types.ts:2435](../../src/integrations/supabase/types.ts#L2435) |
| table | loyalty_tiers | [src/integrations/supabase/types.ts:2477](../../src/integrations/supabase/types.ts#L2477) |
| table | loyalty_transactions | [src/integrations/supabase/types.ts:2507](../../src/integrations/supabase/types.ts#L2507) |
| table | meal_formula_categories | [src/integrations/supabase/types.ts:2545](../../src/integrations/supabase/types.ts#L2545) |
| table | meal_formulas | [src/integrations/supabase/types.ts:2574](../../src/integrations/supabase/types.ts#L2574) |
| table | menu_categories | [src/integrations/supabase/types.ts:2627](../../src/integrations/supabase/types.ts#L2627) |
| table | menu_items | [src/integrations/supabase/types.ts:2669](../../src/integrations/supabase/types.ts#L2669) |
| table | messages | [src/integrations/supabase/types.ts:2719](../../src/integrations/supabase/types.ts#L2719) |
| table | ml_predictions | [src/integrations/supabase/types.ts:2760](../../src/integrations/supabase/types.ts#L2760) |
| table | notification_campaigns | [src/integrations/supabase/types.ts:2790](../../src/integrations/supabase/types.ts#L2790) |
| table | notification_deliveries | [src/integrations/supabase/types.ts:2838](../../src/integrations/supabase/types.ts#L2838) |
| table | notification_preferences | [src/integrations/supabase/types.ts:2888](../../src/integrations/supabase/types.ts#L2888) |
| table | notification_subscriptions | [src/integrations/supabase/types.ts:2915](../../src/integrations/supabase/types.ts#L2915) |
| table | notifications | [src/integrations/supabase/types.ts:2939](../../src/integrations/supabase/types.ts#L2939) |
| table | order_addresses | [src/integrations/supabase/types.ts:2975](../../src/integrations/supabase/types.ts#L2975) |
| table | order_events | [src/integrations/supabase/types.ts:3028](../../src/integrations/supabase/types.ts#L3028) |
| table | order_fees | [src/integrations/supabase/types.ts:3060](../../src/integrations/supabase/types.ts#L3060) |
| table | order_groups | [src/integrations/supabase/types.ts:3089](../../src/integrations/supabase/types.ts#L3089) |
| table | order_issues | [src/integrations/supabase/types.ts:3136](../../src/integrations/supabase/types.ts#L3136) |
| table | order_item_modifiers | [src/integrations/supabase/types.ts:3183](../../src/integrations/supabase/types.ts#L3183) |
| table | order_items | [src/integrations/supabase/types.ts:3225](../../src/integrations/supabase/types.ts#L3225) |
| table | order_notes | [src/integrations/supabase/types.ts:3290](../../src/integrations/supabase/types.ts#L3290) |
| table | order_refunds | [src/integrations/supabase/types.ts:3325](../../src/integrations/supabase/types.ts#L3325) |
| table | order_status_history | [src/integrations/supabase/types.ts:3373](../../src/integrations/supabase/types.ts#L3373) |
| table | order_taxes | [src/integrations/supabase/types.ts:3405](../../src/integrations/supabase/types.ts#L3405) |
| table | orders | [src/integrations/supabase/types.ts:3437](../../src/integrations/supabase/types.ts#L3437) |
| table | payment_intents | [src/integrations/supabase/types.ts:3599](../../src/integrations/supabase/types.ts#L3599) |
| table | payment_transactions | [src/integrations/supabase/types.ts:3646](../../src/integrations/supabase/types.ts#L3646) |
| table | payout_batches | [src/integrations/supabase/types.ts:3696](../../src/integrations/supabase/types.ts#L3696) |
| table | payouts | [src/integrations/supabase/types.ts:3726](../../src/integrations/supabase/types.ts#L3726) |
| table | profiles | [src/integrations/supabase/types.ts:3770](../../src/integrations/supabase/types.ts#L3770) |
| table | promo_code_uses | [src/integrations/supabase/types.ts:3818](../../src/integrations/supabase/types.ts#L3818) |
| table | promo_codes | [src/integrations/supabase/types.ts:3860](../../src/integrations/supabase/types.ts#L3860) |
| table | proof_of_delivery | [src/integrations/supabase/types.ts:3925](../../src/integrations/supabase/types.ts#L3925) |
| table | rate_limit_buckets | [src/integrations/supabase/types.ts:3979](../../src/integrations/supabase/types.ts#L3979) |
| table | recommendation_logs | [src/integrations/supabase/types.ts:4003](../../src/integrations/supabase/types.ts#L4003) |
| table | referral_codes | [src/integrations/supabase/types.ts:4038](../../src/integrations/supabase/types.ts#L4038) |
| table | reservation_slots | [src/integrations/supabase/types.ts:4068](../../src/integrations/supabase/types.ts#L4068) |
| table | reservation_status_history | [src/integrations/supabase/types.ts:4104](../../src/integrations/supabase/types.ts#L4104) |
| table | reservation_table_layout_overrides | [src/integrations/supabase/types.ts:4139](../../src/integrations/supabase/types.ts#L4139) |
| table | reservation_tables | [src/integrations/supabase/types.ts:4184](../../src/integrations/supabase/types.ts#L4184) |
| table | reservations | [src/integrations/supabase/types.ts:4222](../../src/integrations/supabase/types.ts#L4222) |
| table | restaurant_branches | [src/integrations/supabase/types.ts:4351](../../src/integrations/supabase/types.ts#L4351) |
| table | restaurant_cuisines | [src/integrations/supabase/types.ts:4404](../../src/integrations/supabase/types.ts#L4404) |
| table | restaurant_daily_kpis | [src/integrations/supabase/types.ts:4434](../../src/integrations/supabase/types.ts#L4434) |
| table | restaurant_delivery_rules | [src/integrations/supabase/types.ts:4487](../../src/integrations/supabase/types.ts#L4487) |
| table | restaurant_documents | [src/integrations/supabase/types.ts:4522](../../src/integrations/supabase/types.ts#L4522) |
| table | restaurant_hours | [src/integrations/supabase/types.ts:4560](../../src/integrations/supabase/types.ts#L4560) |
| table | restaurant_invoice_settings | [src/integrations/supabase/types.ts:4595](../../src/integrations/supabase/types.ts#L4595) |
| table | restaurant_invoices | [src/integrations/supabase/types.ts:4672](../../src/integrations/supabase/types.ts#L4672) |
| table | restaurant_invoice_line_items | [src/integrations/supabase/types.ts:4734](../../src/integrations/supabase/types.ts#L4734) |
| table | restaurant_launch_packs | [src/integrations/supabase/types.ts:4815](../../src/integrations/supabase/types.ts#L4815) |
| table | restaurant_media | [src/integrations/supabase/types.ts:4878](../../src/integrations/supabase/types.ts#L4878) |
| table | restaurant_payout_settings | [src/integrations/supabase/types.ts:4934](../../src/integrations/supabase/types.ts#L4934) |
| table | restaurant_promotions | [src/integrations/supabase/types.ts:4966](../../src/integrations/supabase/types.ts#L4966) |
| table | restaurant_recommendations | [src/integrations/supabase/types.ts:5016](../../src/integrations/supabase/types.ts#L5016) |
| table | restaurant_service_areas | [src/integrations/supabase/types.ts:5060](../../src/integrations/supabase/types.ts#L5060) |
| table | restaurant_settings | [src/integrations/supabase/types.ts:5092](../../src/integrations/supabase/types.ts#L5092) |
| table | restaurant_staff | [src/integrations/supabase/types.ts:5124](../../src/integrations/supabase/types.ts#L5124) |
| table | restaurants | [src/integrations/supabase/types.ts:5156](../../src/integrations/supabase/types.ts#L5156) |
| table | review_replies | [src/integrations/supabase/types.ts:5294](../../src/integrations/supabase/types.ts#L5294) |
| table | reviews | [src/integrations/supabase/types.ts:5329](../../src/integrations/supabase/types.ts#L5329) |
| table | search_logs | [src/integrations/supabase/types.ts:5408](../../src/integrations/supabase/types.ts#L5408) |
| table | signup_application_documents | [src/integrations/supabase/types.ts:5438](../../src/integrations/supabase/types.ts#L5438) |
| table | signup_applications | [src/integrations/supabase/types.ts:5497](../../src/integrations/supabase/types.ts#L5497) |
| table | signup_application_drafts | [src/integrations/supabase/types.ts:5578](../../src/integrations/supabase/types.ts#L5578) |
| table | solidarity_donations | [src/integrations/supabase/types.ts:5617](../../src/integrations/supabase/types.ts#L5617) |
| table | stripe_webhook_events | [src/integrations/supabase/types.ts:5641](../../src/integrations/supabase/types.ts#L5641) |
| table | subscription_benefits | [src/integrations/supabase/types.ts:5662](../../src/integrations/supabase/types.ts#L5662) |
| table | support_messages | [src/integrations/supabase/types.ts:5694](../../src/integrations/supabase/types.ts#L5694) |
| table | support_tickets | [src/integrations/supabase/types.ts:5732](../../src/integrations/supabase/types.ts#L5732) |
| table | tok_one_subscriptions | [src/integrations/supabase/types.ts:5794](../../src/integrations/supabase/types.ts#L5794) |
| table | user_addresses | [src/integrations/supabase/types.ts:5847](../../src/integrations/supabase/types.ts#L5847) |
| table | user_analytics | [src/integrations/supabase/types.ts:5909](../../src/integrations/supabase/types.ts#L5909) |
| table | user_devices | [src/integrations/supabase/types.ts:5950](../../src/integrations/supabase/types.ts#L5950) |
| table | user_notification_settings | [src/integrations/supabase/types.ts:5991](../../src/integrations/supabase/types.ts#L5991) |
| table | user_payment_methods | [src/integrations/supabase/types.ts:6035](../../src/integrations/supabase/types.ts#L6035) |
| table | user_preferences | [src/integrations/supabase/types.ts:6082](../../src/integrations/supabase/types.ts#L6082) |
| table | user_profiles | [src/integrations/supabase/types.ts:6106](../../src/integrations/supabase/types.ts#L6106) |
| table | user_referrals | [src/integrations/supabase/types.ts:6139](../../src/integrations/supabase/types.ts#L6139) |
| table | user_roles | [src/integrations/supabase/types.ts:6187](../../src/integrations/supabase/types.ts#L6187) |
| table | user_subscription_plans | [src/integrations/supabase/types.ts:6205](../../src/integrations/supabase/types.ts#L6205) |
| table | user_subscriptions | [src/integrations/supabase/types.ts:6247](../../src/integrations/supabase/types.ts#L6247) |
| table | user_wallets | [src/integrations/supabase/types.ts:6298](../../src/integrations/supabase/types.ts#L6298) |
| table | wallet_transactions | [src/integrations/supabase/types.ts:6322](../../src/integrations/supabase/types.ts#L6322) |
| rpc | admin_activate_all_feature_flags | [src/integrations/supabase/types.ts:6365](../../src/integrations/supabase/types.ts#L6365) |
| rpc | admin_dispatch_notification_campaign | [src/integrations/supabase/types.ts:6366](../../src/integrations/supabase/types.ts#L6366) |
| rpc | dispatch_due_notification_campaigns | [src/integrations/supabase/types.ts:6380](../../src/integrations/supabase/types.ts#L6380) |
| rpc | admin_get_cancellation_fraud_metrics | [src/integrations/supabase/types.ts:6395](../../src/integrations/supabase/types.ts#L6395) |
| rpc | admin_get_reservation_billing_history | [src/integrations/supabase/types.ts:6408](../../src/integrations/supabase/types.ts#L6408) |
| rpc | admin_list_users | [src/integrations/supabase/types.ts:6429](../../src/integrations/supabase/types.ts#L6429) |
| rpc | admin_review_courier_profile | [src/integrations/supabase/types.ts:6439](../../src/integrations/supabase/types.ts#L6439) |
| rpc | admin_review_signup_application | [src/integrations/supabase/types.ts:6450](../../src/integrations/supabase/types.ts#L6450) |
| rpc | admin_seed_default_flags | [src/integrations/supabase/types.ts:6461](../../src/integrations/supabase/types.ts#L6461) |
| rpc | admin_set_user_roles | [src/integrations/supabase/types.ts:6462](../../src/integrations/supabase/types.ts#L6462) |
| rpc | admin_toggle_feature_flag | [src/integrations/supabase/types.ts:6469](../../src/integrations/supabase/types.ts#L6469) |
| rpc | get_commercial_prospect_commission_summary | [src/integrations/supabase/types.ts:6473](../../src/integrations/supabase/types.ts#L6473) |
| rpc | auth_can_manage_dispatch_job | [src/integrations/supabase/types.ts:6477](../../src/integrations/supabase/types.ts#L6477) |
| rpc | auth_can_manage_order_delivery | [src/integrations/supabase/types.ts:6481](../../src/integrations/supabase/types.ts#L6481) |
| rpc | auth_can_view_courier | [src/integrations/supabase/types.ts:6485](../../src/integrations/supabase/types.ts#L6485) |
| rpc | auth_can_view_dispatch_job | [src/integrations/supabase/types.ts:6489](../../src/integrations/supabase/types.ts#L6489) |
| rpc | auth_can_view_order_delivery | [src/integrations/supabase/types.ts:6493](../../src/integrations/supabase/types.ts#L6493) |
| rpc | auth_is_admin | [src/integrations/supabase/types.ts:6497](../../src/integrations/supabase/types.ts#L6497) |
| rpc | auth_owns_courier | [src/integrations/supabase/types.ts:6498](../../src/integrations/supabase/types.ts#L6498) |
| rpc | auth_owns_restaurant | [src/integrations/supabase/types.ts:6499](../../src/integrations/supabase/types.ts#L6499) |
| rpc | broadcast_topic_notification | [src/integrations/supabase/types.ts:6503](../../src/integrations/supabase/types.ts#L6503) |
| rpc | cancel_reservation_by_customer | [src/integrations/supabase/types.ts:6514](../../src/integrations/supabase/types.ts#L6514) |
| rpc | cancel_reservation_by_restaurant | [src/integrations/supabase/types.ts:6522](../../src/integrations/supabase/types.ts#L6522) |
| rpc | claim_gift_points | [src/integrations/supabase/types.ts:6534](../../src/integrations/supabase/types.ts#L6534) |
| rpc | cleanup_expired_groups | [src/integrations/supabase/types.ts:6535](../../src/integrations/supabase/types.ts#L6535) |
| rpc | compute_order_discount_from_payload | [src/integrations/supabase/types.ts:6536](../../src/integrations/supabase/types.ts#L6536) |
| rpc | compute_restaurant_reservation_fees | [src/integrations/supabase/types.ts:6545](../../src/integrations/supabase/types.ts#L6545) |
| rpc | create_order_with_items | [src/integrations/supabase/types.ts:6556](../../src/integrations/supabase/types.ts#L6556) |
| rpc | decrement_stock | [src/integrations/supabase/types.ts:6569](../../src/integrations/supabase/types.ts#L6569) |
| rpc | delete_user_gdpr_cascade | [src/integrations/supabase/types.ts:6573](../../src/integrations/supabase/types.ts#L6573) |
| rpc | donate_points_for_meal | [src/integrations/supabase/types.ts:6577](../../src/integrations/supabase/types.ts#L6577) |
| rpc | enqueue_deliveries | [src/integrations/supabase/types.ts:6581](../../src/integrations/supabase/types.ts#L6581) |
| rpc | enqueue_notification | [src/integrations/supabase/types.ts:6585](../../src/integrations/supabase/types.ts#L6585) |
| rpc | ensure_guest_profile | [src/integrations/supabase/types.ts:6596](../../src/integrations/supabase/types.ts#L6596) |
| rpc | estimate_campaign_audience | [src/integrations/supabase/types.ts:6604](../../src/integrations/supabase/types.ts#L6604) |
| rpc | find_nearby_couriers | [src/integrations/supabase/types.ts:6608](../../src/integrations/supabase/types.ts#L6608) |
| rpc | generate_monthly_invoices | [src/integrations/supabase/types.ts:6624](../../src/integrations/supabase/types.ts#L6624) |
| rpc | generate_restaurant_payout_invoice | [src/integrations/supabase/types.ts:6625](../../src/integrations/supabase/types.ts#L6625) |
| rpc | generate_tok_reservation_fee_invoice | [src/integrations/supabase/types.ts:6634](../../src/integrations/supabase/types.ts#L6634) |
| rpc | generate_tok_reservation_fee_invoices_all | [src/integrations/supabase/types.ts:6638](../../src/integrations/supabase/types.ts#L6638) |
| rpc | generate_tok_payable_invoice | [src/integrations/supabase/types.ts:6642](../../src/integrations/supabase/types.ts#L6642) |
| rpc | generate_tok_payable_invoices_all | [src/integrations/supabase/types.ts:6646](../../src/integrations/supabase/types.ts#L6646) |
| rpc | get_campaign_stats | [src/integrations/supabase/types.ts:6650](../../src/integrations/supabase/types.ts#L6650) |
| rpc | get_customer_orders_dashboard | [src/integrations/supabase/types.ts:6666](../../src/integrations/supabase/types.ts#L6666) |
| rpc | get_gift_stats | [src/integrations/supabase/types.ts:6687](../../src/integrations/supabase/types.ts#L6687) |
| rpc | get_order_customers | [src/integrations/supabase/types.ts:6688](../../src/integrations/supabase/types.ts#L6688) |
| rpc | get_reservation_customers | [src/integrations/supabase/types.ts:6696](../../src/integrations/supabase/types.ts#L6696) |
| rpc | get_reservation_fee_invoice_lines | [src/integrations/supabase/types.ts:6704](../../src/integrations/supabase/types.ts#L6704) |
| rpc | get_payable_invoice_lines | [src/integrations/supabase/types.ts:6717](../../src/integrations/supabase/types.ts#L6717) |
| rpc | get_restaurant_comparison | [src/integrations/supabase/types.ts:6737](../../src/integrations/supabase/types.ts#L6737) |
| rpc | get_restaurant_orders_dashboard | [src/integrations/supabase/types.ts:6741](../../src/integrations/supabase/types.ts#L6741) |
| rpc | get_restaurant_payment_history | [src/integrations/supabase/types.ts:6762](../../src/integrations/supabase/types.ts#L6762) |
| rpc | get_restaurant_performance | [src/integrations/supabase/types.ts:6780](../../src/integrations/supabase/types.ts#L6780) |
| rpc | get_restaurant_recommendations | [src/integrations/supabase/types.ts:6784](../../src/integrations/supabase/types.ts#L6784) |
| rpc | get_total_donated_meals | [src/integrations/supabase/types.ts:6788](../../src/integrations/supabase/types.ts#L6788) |
| rpc | get_total_donated_points | [src/integrations/supabase/types.ts:6789](../../src/integrations/supabase/types.ts#L6789) |
| rpc | has_role | [src/integrations/supabase/types.ts:6790](../../src/integrations/supabase/types.ts#L6790) |
| rpc | increment_ad_campaign_metric | [src/integrations/supabase/types.ts:6797](../../src/integrations/supabase/types.ts#L6797) |
| rpc | is_feature_flag_active | [src/integrations/supabase/types.ts:6801](../../src/integrations/supabase/types.ts#L6801) |
| rpc | mark_noshow_reservations | [src/integrations/supabase/types.ts:6805](../../src/integrations/supabase/types.ts#L6805) |
| rpc | normalize_search_text | [src/integrations/supabase/types.ts:6806](../../src/integrations/supabase/types.ts#L6806) |
| rpc | queue_notification_deliveries | [src/integrations/supabase/types.ts:6807](../../src/integrations/supabase/types.ts#L6807) |
| rpc | rate_limit_consume | [src/integrations/supabase/types.ts:6816](../../src/integrations/supabase/types.ts#L6816) |
| rpc | restaurant_save_floor_plan_assignments | [src/integrations/supabase/types.ts:6825](../../src/integrations/supabase/types.ts#L6825) |
| rpc | restaurant_save_floor_plan_furniture | [src/integrations/supabase/types.ts:6829](../../src/integrations/supabase/types.ts#L6829) |
| rpc | restaurant_save_floor_plan_layouts | [src/integrations/supabase/types.ts:6838](../../src/integrations/supabase/types.ts#L6838) |
| rpc | restaurant_save_floor_plan_layouts_v2 | [src/integrations/supabase/types.ts:6847](../../src/integrations/supabase/types.ts#L6847) |
| rpc | restaurant_save_floor_plan_template | [src/integrations/supabase/types.ts:6858](../../src/integrations/supabase/types.ts#L6858) |
| rpc | restaurant_save_floor_plan_variant_v2 | [src/integrations/supabase/types.ts:6867](../../src/integrations/supabase/types.ts#L6867) |
| rpc | restaurant_save_floor_plan_workspace | [src/integrations/supabase/types.ts:6877](../../src/integrations/supabase/types.ts#L6877) |
| rpc | restaurant_save_floor_plan_workspace_v2 | [src/integrations/supabase/types.ts:6888](../../src/integrations/supabase/types.ts#L6888) |
| rpc | recompute_restaurant_review_stats | [src/integrations/supabase/types.ts:6901](../../src/integrations/supabase/types.ts#L6901) |
| rpc | record_ad_campaign_event | [src/integrations/supabase/types.ts:6905](../../src/integrations/supabase/types.ts#L6905) |
| rpc | redeem_loyalty_points | [src/integrations/supabase/types.ts:6919](../../src/integrations/supabase/types.ts#L6919) |
| rpc | refresh_restaurant_daily_kpis_for_date | [src/integrations/supabase/types.ts:6927](../../src/integrations/supabase/types.ts#L6927) |
| rpc | refresh_restaurant_daily_kpis_recent_days | [src/integrations/supabase/types.ts:6931](../../src/integrations/supabase/types.ts#L6931) |
| rpc | search_restaurants_catalog | [src/integrations/supabase/types.ts:6935](../../src/integrations/supabase/types.ts#L6935) |
| rpc | search_restaurants_nearby | [src/integrations/supabase/types.ts:6971](../../src/integrations/supabase/types.ts#L6971) |
| rpc | send_gift_points | [src/integrations/supabase/types.ts:7002](../../src/integrations/supabase/types.ts#L7002) |
| rpc | mark_signup_application_draft_finalized | [src/integrations/supabase/types.ts:7010](../../src/integrations/supabase/types.ts#L7010) |
| rpc | sync_signup_application | [src/integrations/supabase/types.ts:7014](../../src/integrations/supabase/types.ts#L7014) |
| rpc | update_restaurant_reservation_status_safe | [src/integrations/supabase/types.ts:7040](../../src/integrations/supabase/types.ts#L7040) |
| rpc | validate_and_create_reservation | [src/integrations/supabase/types.ts:7048](../../src/integrations/supabase/types.ts#L7048) |
| rpc | validate_and_create_reservation_safe | [src/integrations/supabase/types.ts:7060](../../src/integrations/supabase/types.ts#L7060) |
| rpc | validate_service_settings_json | [src/integrations/supabase/types.ts:7076](../../src/integrations/supabase/types.ts#L7076) |
| enum | app_role | [src/integrations/supabase/types.ts:7082](../../src/integrations/supabase/types.ts#L7082) |
| enum | commercial_visit_status | [src/integrations/supabase/types.ts:7083](../../src/integrations/supabase/types.ts#L7083) |
| enum | loyalty_tier | [src/integrations/supabase/types.ts:7084](../../src/integrations/supabase/types.ts#L7084) |

### Tâches pg_cron détectées

| Tâche | Planifications versionnées | Dernière source |
| --- | --- | --- |
| commercial-demo-ai-storage-cleanup | */5 * * * * | [supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql:299](../../supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql#L299) |
| restaurant-subscription-activation-worker | * * * * * | [supabase/migrations/20260717220000_deferred_subscription_commission_lifecycle.sql:4334](../../supabase/migrations/20260717220000_deferred_subscription_commission_lifecycle.sql#L4334) |
| retention-cron-job-run-details-14d | 23 * * * * | [supabase/migrations/20260909025200_optimize_observability_maintenance.sql:149](../../supabase/migrations/20260909025200_optimize_observability_maintenance.sql#L149) |
| retention-edge-function-audit-logs-30d | 17 * * * * | [supabase/migrations/20260909025200_optimize_observability_maintenance.sql:166](../../supabase/migrations/20260909025200_optimize_observability_maintenance.sql#L166) |
| retention-net-http-response-7d | 11 * * * * | [supabase/migrations/20260909025200_optimize_observability_maintenance.sql:183](../../supabase/migrations/20260909025200_optimize_observability_maintenance.sql#L183) |
| send-email-worker | * * * * * | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:189](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L189) |
| send-push-worker | */5 * * * * | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:204](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L204) |
| thetok-print-orchestrator | * * * * * | [supabase/migrations/20260907023100_marketing_print_operations.sql:116](../../supabase/migrations/20260907023100_marketing_print_operations.sql#L116) |
| thetok-print-reconcile | */10 * * * * | [supabase/migrations/20260907023100_marketing_print_operations.sql:120](../../supabase/migrations/20260907023100_marketing_print_operations.sql#L120) |
| tok-aligro-catalog-sync | 15 3 * * 1 | [supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql:32](../../supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql#L32) |
| tok-auto-arrive-overdue-reservations | */10 * * * * | [supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql:161](../../supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql#L161) |
| tok-birthday-notifications | 15 7 * * * | [supabase/migrations/20260615084738_birthday_profiles_notifications_advisor_hardening.sql:312](../../supabase/migrations/20260615084738_birthday_profiles_notifications_advisor_hardening.sql#L312) |
| tok-capture-due-match-groups | */5 * * * * | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:249](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L249) |
| tok-close-due-match-groups | * * * * * | [supabase/migrations/20260531191057_security_linter_hardening_and_core_cron.sql:221](../../supabase/migrations/20260531191057_security_linter_hardening_and_core_cron.sql#L221) |
| tok-connect-webhook-dispatcher | * * * * * | [supabase/migrations/20260626143100_tok_connect_webhook_scheduler.sql:27](../../supabase/migrations/20260626143100_tok_connect_webhook_scheduler.sql#L27) |
| tok-directory-commercial-name-verification | * * * * * | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:81](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L81) |
| tok-directory-cuisine-enrichment | * * * * * | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:105](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L105) |
| tok-directory-cuisine-osm-enrichment | * * * * * | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:129](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L129) |
| tok-directory-image-discovery | * * * * * | [supabase/migrations/20260925015352_schedule_directory_image_discovery.sql:143](../../supabase/migrations/20260925015352_schedule_directory_image_discovery.sql#L143) |
| tok-directory-image-enrichment | * * * * * | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:57](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L57) |
| tok-directory-image-truth-verifier | * * * * * | [supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql:222](../../supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql#L222) |
| tok-dispatch-due-notification-campaigns | * * * * * | [supabase/migrations/20260907011600_notification_delivery_reliability.sql:457](../../supabase/migrations/20260907011600_notification_delivery_reliability.sql#L457) |
| tok-google-actions-center-sync | */2 * * * * | [supabase/migrations/20260728120100_google_actions_center_sync_cron.sql:33](../../supabase/migrations/20260728120100_google_actions_center_sync_cron.sql#L33) |
| tok-marketing-orchestrator | * * * * * | [supabase/migrations/20260801190000_marketing_operations_center.sql:5062](../../supabase/migrations/20260801190000_marketing_operations_center.sql#L5062) |
| tok-monthly-reservation-fee-invoices | 20 2 1 * * | [supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql:3265](../../supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql#L3265) |
| tok-net-http-response-cache-retention | */5 * * * *, 37 * * * * | [supabase/migrations/20260909025200_optimize_observability_maintenance.sql:203](../../supabase/migrations/20260909025200_optimize_observability_maintenance.sql#L203) |
| tok-ops-incident-native-scan | */5 * * * * | [supabase/migrations/20260726062000_ops_incident_native_cron.sql:36](../../supabase/migrations/20260726062000_ops_incident_native_cron.sql#L36) |
| tok-reconcile-match-group-authorizations | */5 * * * * | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:234](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L234) |
| tok-reconcile-paid-order-checkouts | */5 * * * * | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:219](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L219) |
| tok-stripe-subscription-reconcile | 17 * * * * | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:33](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L33) |
| tok-sync-social-post-promotions | */5 * * * * | [supabase/migrations/20260726020000_harden_demo_gdpr_and_social_cron.sql:274](../../supabase/migrations/20260726020000_harden_demo_gdpr_and_social_cron.sql#L274) |
| tok-thefork-image-recovery | * * * * * | [supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql:216](../../supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql#L216) |
| tok-thefork-official-site-discovery | * * * * *, 0 */6 * * * | [supabase/migrations/20260918032031_backoff_thefork_site_discovery_provider.sql:15](../../supabase/migrations/20260918032031_backoff_thefork_site_discovery_provider.sql#L15) |

### Buckets Storage détectés

| Bucket | Dernière source |
| --- | --- |
| ai-generated-assets | [supabase/migrations/20260602070000_restore_tok_ai_schema.sql:638](../../supabase/migrations/20260602070000_restore_tok_ai_schema.sql#L638) |
| commercial-demo-ai | [supabase/migrations/20260715044653_commercial_demo_openai_gateway.sql:190](../../supabase/migrations/20260715044653_commercial_demo_openai_gateway.sql#L190) |
| images | [supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql:58](../../supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql#L58) |
| invoice-logos | [supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql:42](../../supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql#L42) |
| print-production-files | [supabase/migrations/20260907023000_marketing_print_foundation.sql:450](../../supabase/migrations/20260907023000_marketing_print_foundation.sql#L450) |
| restaurant-images | [supabase/migrations/20260706192000_image_metadata_ai.sql:4](../../supabase/migrations/20260706192000_image_metadata_ai.sql#L4) |
| restaurant-removal-evidence | [supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql:100](../../supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql#L100) |
| social-post-media | [supabase/migrations/20260606000500_social_post_media_bucket_hardening.sql:4](../../supabase/migrations/20260606000500_social_post_media_bucket_hardening.sql#L4) |
| verification-documents | [supabase/migrations/20260329103000_add_signup_applications_and_verification.sql:105](../../supabase/migrations/20260329103000_add_signup_applications_and_verification.sql#L105) |

### Historique complet des migrations

| Migration | Lignes | Objets CREATE | Source |
| --- | --- | --- | --- |
| 20260308174912 24a4f7b8 7291 401b Aa81 669264a5bbd2 | 106 | 8 | [supabase/migrations/20260308174912_24a4f7b8-7291-401b-aa81-669264a5bbd2.sql:1](../../supabase/migrations/20260308174912_24a4f7b8-7291-401b-aa81-669264a5bbd2.sql#L1) |
| 20260308174933 9ab8b795 Eeb6 45b1 90bc Dcc424e0750c | 123 | 8 | [supabase/migrations/20260308174933_9ab8b795-eeb6-45b1-90bc-dcc424e0750c.sql:1](../../supabase/migrations/20260308174933_9ab8b795-eeb6-45b1-90bc-dcc424e0750c.sql#L1) |
| 20260308175015 D089cd3a 79e4 45da 9a43 Db36386961b3 | 278 | 22 | [supabase/migrations/20260308175015_d089cd3a-79e4-45da-9a43-db36386961b3.sql:1](../../supabase/migrations/20260308175015_d089cd3a-79e4-45da-9a43-db36386961b3.sql#L1) |
| 20260308175103 Dfc099a3 6826 4a75 A155 F32e3c7036e1 | 200 | 79 | [supabase/migrations/20260308175103_dfc099a3-6826-4a75-a155-f32e3c7036e1.sql:1](../../supabase/migrations/20260308175103_dfc099a3-6826-4a75-a155-f32e3c7036e1.sql#L1) |
| 20260308175200 45d83c9c E5f8 4817 B0b8 7248788c0117 | 300 | 24 | [supabase/migrations/20260308175200_45d83c9c-e5f8-4817-b0b8-7248788c0117.sql:1](../../supabase/migrations/20260308175200_45d83c9c-e5f8-4817-b0b8-7248788c0117.sql#L1) |
| 20260308175209 C4bedbed 0ec5 48b4 91bd 71780de7dbd0 | 4 | 0 | [supabase/migrations/20260308175209_c4bedbed-0ec5-48b4-91bd-71780de7dbd0.sql:1](../../supabase/migrations/20260308175209_c4bedbed-0ec5-48b4-91bd-71780de7dbd0.sql#L1) |
| 20260308210913 25c0e614 6971 4ff7 8bd9 Fefe6d3027a7 | 114 | 7 | [supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql:1](../../supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql#L1) |
| 20260309020210 E9cb423e 4bce 474e B664 6e7f10cd51d1 | 67 | 25 | [supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql:1](../../supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql#L1) |
| 20260309020227 B4db187d 422a 4fa6 9b83 B215a182bb34 | 3 | 0 | [supabase/migrations/20260309020227_b4db187d-422a-4fa6-9b83-b215a182bb34.sql:1](../../supabase/migrations/20260309020227_b4db187d-422a-4fa6-9b83-b215a182bb34.sql#L1) |
| 20260309021628 F77a0b80 1674 491d A32e Ec824934fc34 | 235 | 14 | [supabase/migrations/20260309021628_f77a0b80-1674-491d-a32e-ec824934fc34.sql:1](../../supabase/migrations/20260309021628_f77a0b80-1674-491d-a32e-ec824934fc34.sql#L1) |
| 20260309021638 C2c39137 Cec6 41a8 8570 0343b3def13e | 5 | 1 | [supabase/migrations/20260309021638_c2c39137-cec6-41a8-8570-0343b3def13e.sql:1](../../supabase/migrations/20260309021638_c2c39137-cec6-41a8-8570-0343b3def13e.sql#L1) |
| 20260309022824 36f66f8f C8ba 4a61 Afe8 B700f6dc1bdb | 22 | 9 | [supabase/migrations/20260309022824_36f66f8f-c8ba-4a61-afe8-b700f6dc1bdb.sql:1](../../supabase/migrations/20260309022824_36f66f8f-c8ba-4a61-afe8-b700f6dc1bdb.sql#L1) |
| 20260309022839 90eeed83 Ec09 4e21 Be6a D4d0bbd65189 | 9 | 2 | [supabase/migrations/20260309022839_90eeed83-ec09-4e21-be6a-d4d0bbd65189.sql:1](../../supabase/migrations/20260309022839_90eeed83-ec09-4e21-be6a-d4d0bbd65189.sql#L1) |
| 20260309024358 F4547c11 E404 450f A47d 1b7f0466f713 | 125 | 6 | [supabase/migrations/20260309024358_f4547c11-e404-450f-a47d-1b7f0466f713.sql:1](../../supabase/migrations/20260309024358_f4547c11-e404-450f-a47d-1b7f0466f713.sql#L1) |
| 20260309030216 6f0e0d0b D8f4 42f6 8d63 2b3dee128846 | 214 | 36 | [supabase/migrations/20260309030216_6f0e0d0b-d8f4-42f6-8d63-2b3dee128846.sql:1](../../supabase/migrations/20260309030216_6f0e0d0b-d8f4-42f6-8d63-2b3dee128846.sql#L1) |
| 20260309030839 Ebfd9756 78cb 4daa Be6b D81b1684c038 | 332 | 90 | [supabase/migrations/20260309030839_ebfd9756-78cb-4daa-be6b-d81b1684c038.sql:1](../../supabase/migrations/20260309030839_ebfd9756-78cb-4daa-be6b-d81b1684c038.sql#L1) |
| 20260309035150 0d7a64a0 B667 4e85 87a6 D4fbda3c696d | 20 | 1 | [supabase/migrations/20260309035150_0d7a64a0-b667-4e85-87a6-d4fbda3c696d.sql:1](../../supabase/migrations/20260309035150_0d7a64a0-b667-4e85-87a6-d4fbda3c696d.sql#L1) |
| 20260309035221 5ea4c81a 7cb1 41a6 B785 2198d257d39d | 20 | 1 | [supabase/migrations/20260309035221_5ea4c81a-7cb1-41a6-b785-2198d257d39d.sql:1](../../supabase/migrations/20260309035221_5ea4c81a-7cb1-41a6-b785-2198d257d39d.sql#L1) |
| 20260309132514 E9dd6e9b Fcd1 4f11 9f41 F3136362aed7 | 75 | 1 | [supabase/migrations/20260309132514_e9dd6e9b-fcd1-4f11-9f41-f3136362aed7.sql:1](../../supabase/migrations/20260309132514_e9dd6e9b-fcd1-4f11-9f41-f3136362aed7.sql#L1) |
| 20260310023835 B14ea06a 147c 4d23 8f53 6f18af772318 | 1 | 0 | [supabase/migrations/20260310023835_b14ea06a-147c-4d23-8f53-6f18af772318.sql:1](../../supabase/migrations/20260310023835_b14ea06a-147c-4d23-8f53-6f18af772318.sql#L1) |
| 20260310032611 2160c3d3 7a63 4d29 93c5 3c3103ed3903 | 129 | 13 | [supabase/migrations/20260310032611_2160c3d3-7a63-4d29-93c5-3c3103ed3903.sql:1](../../supabase/migrations/20260310032611_2160c3d3-7a63-4d29-93c5-3c3103ed3903.sql#L1) |
| 20260310032639 Aac9ed25 7f2d 40c2 83ca 7a4155b6924b | 163 | 17 | [supabase/migrations/20260310032639_aac9ed25-7f2d-40c2-83ca-7a4155b6924b.sql:1](../../supabase/migrations/20260310032639_aac9ed25-7f2d-40c2-83ca-7a4155b6924b.sql#L1) |
| 20260310032756 Eebbe5c2 2aca 4d66 8ad2 34818e438514 | 146 | 41 | [supabase/migrations/20260310032756_eebbe5c2-2aca-4d66-8ad2-34818e438514.sql:1](../../supabase/migrations/20260310032756_eebbe5c2-2aca-4d66-8ad2-34818e438514.sql#L1) |
| 20260310035822 Core Identity | 151 | 15 | [supabase/migrations/20260310035822_core_identity.sql:1](../../supabase/migrations/20260310035822_core_identity.sql#L1) |
| 20260310035927 Restaurant Catalog | 220 | 26 | [supabase/migrations/20260310035927_restaurant_catalog.sql:1](../../supabase/migrations/20260310035927_restaurant_catalog.sql#L1) |
| 20260310040012 Discovery Orders | 226 | 25 | [supabase/migrations/20260310040012_discovery_orders.sql:1](../../supabase/migrations/20260310040012_discovery_orders.sql#L1) |
| 20260310042712 Security Rls Audit Fix | 281 | 75 | [supabase/migrations/20260310042712_security_rls_audit_fix.sql:1](../../supabase/migrations/20260310042712_security_rls_audit_fix.sql#L1) |
| 20260310044542 Reload Schema Cache | 5 | 0 | [supabase/migrations/20260310044542_reload_schema_cache.sql:1](../../supabase/migrations/20260310044542_reload_schema_cache.sql#L1) |
| 20260310044645 Grant Table Permissions | 177 | 0 | [supabase/migrations/20260310044645_grant_table_permissions.sql:1](../../supabase/migrations/20260310044645_grant_table_permissions.sql#L1) |
| 20260310051648 Strict Rls Policies | 165 | 12 | [supabase/migrations/20260310051648_strict_rls_policies.sql:1](../../supabase/migrations/20260310051648_strict_rls_policies.sql#L1) |
| 20260310064000 Rls Emergency Fix | 62 | 9 | [supabase/migrations/20260310064000_rls_emergency_fix.sql:1](../../supabase/migrations/20260310064000_rls_emergency_fix.sql#L1) |
| 20260310100000 Courier Infrastructure | 685 | 72 | [supabase/migrations/20260310100000_courier_infrastructure.sql:1](../../supabase/migrations/20260310100000_courier_infrastructure.sql#L1) |
| 20260310100100 Delivery Logistics | 99 | 11 | [supabase/migrations/20260310100100_delivery_logistics.sql:1](../../supabase/migrations/20260310100100_delivery_logistics.sql#L1) |
| 20260310100200 Loyalty Reviews Data | 175 | 19 | [supabase/migrations/20260310100200_loyalty_reviews_data.sql:1](../../supabase/migrations/20260310100200_loyalty_reviews_data.sql#L1) |
| 20260310110000 Allow Anon Tracking Inserts | 45 | 8 | [supabase/migrations/20260310110000_allow_anon_tracking_inserts.sql:1](../../supabase/migrations/20260310110000_allow_anon_tracking_inserts.sql#L1) |
| 20260311120000 Atomic Stock And Rls Hardening | 169 | 16 | [supabase/migrations/20260311120000_atomic_stock_and_rls_hardening.sql:1](../../supabase/migrations/20260311120000_atomic_stock_and_rls_hardening.sql#L1) |
| 20260311140000 Seed Feature Flags | 14 | 0 | [supabase/migrations/20260311140000_seed_feature_flags.sql:1](../../supabase/migrations/20260311140000_seed_feature_flags.sql#L1) |
| 20260311150000 Seed Geneva Restaurants | 272 | 0 | [supabase/migrations/20260311150000_seed_geneva_restaurants.sql:1](../../supabase/migrations/20260311150000_seed_geneva_restaurants.sql#L1) |
| 20260311153000 Activate All Admin Feature Flags | 20 | 0 | [supabase/migrations/20260311153000_activate_all_admin_feature_flags.sql:1](../../supabase/migrations/20260311153000_activate_all_admin_feature_flags.sql#L1) |
| 20260311165000 Add Formulas Availability | 8 | 0 | [supabase/migrations/20260311165000_add_formulas_availability.sql:1](../../supabase/migrations/20260311165000_add_formulas_availability.sql#L1) |
| 20260311171000 Assign Restaurants To Rbarman | 36 | 0 | [supabase/migrations/20260311171000_assign_restaurants_to_rbarman.sql:1](../../supabase/migrations/20260311171000_assign_restaurants_to_rbarman.sql#L1) |
| 20260311200000 Add Stripe Connect | 8 | 1 | [supabase/migrations/20260311200000_add_stripe_connect.sql:1](../../supabase/migrations/20260311200000_add_stripe_connect.sql#L1) |
| 20260311223000 Admin Tools Functionality | 282 | 8 | [supabase/migrations/20260311223000_admin_tools_functionality.sql:1](../../supabase/migrations/20260311223000_admin_tools_functionality.sql#L1) |
| 20260311234500 Split Service Settings For Reservations | 99 | 1 | [supabase/migrations/20260311234500_split_service_settings_for_reservations.sql:1](../../supabase/migrations/20260311234500_split_service_settings_for_reservations.sql#L1) |
| 20260312000500 Enable Public Restaurant Promotions | 5 | 1 | [supabase/migrations/20260312000500_enable_public_restaurant_promotions.sql:1](../../supabase/migrations/20260312000500_enable_public_restaurant_promotions.sql#L1) |
| 20260312003000 Seed Restaurant Categories | 65 | 1 | [supabase/migrations/20260312003000_seed_restaurant_categories.sql:1](../../supabase/migrations/20260312003000_seed_restaurant_categories.sql#L1) |
| 20260312113000 Ad Campaign Payments | 39 | 0 | [supabase/migrations/20260312113000_ad_campaign_payments.sql:1](../../supabase/migrations/20260312113000_ad_campaign_payments.sql#L1) |
| 20260312143000 Secure Order Rpc And Sponsored Tracking | 307 | 6 | [supabase/migrations/20260312143000_secure_order_rpc_and_sponsored_tracking.sql:1](../../supabase/migrations/20260312143000_secure_order_rpc_and_sponsored_tracking.sql#L1) |
| 20260312160000 Search Audience And Edge Audit | 583 | 7 | [supabase/migrations/20260312160000_search_audience_and_edge_audit.sql:1](../../supabase/migrations/20260312160000_search_audience_and_edge_audit.sql#L1) |
| 20260312183000 Courier Dashboard Completion | 79 | 3 | [supabase/migrations/20260312183000_courier_dashboard_completion.sql:1](../../supabase/migrations/20260312183000_courier_dashboard_completion.sql#L1) |
| 20260312200000 Delivery Proof Qr Dispatch | 116 | 7 | [supabase/migrations/20260312200000_delivery_proof_qr_dispatch.sql:1](../../supabase/migrations/20260312200000_delivery_proof_qr_dispatch.sql#L1) |
| 20260312213000 Fix Courier Rls And Order Tabs | 490 | 25 | [supabase/migrations/20260312213000_fix_courier_rls_and_order_tabs.sql:1](../../supabase/migrations/20260312213000_fix_courier_rls_and_order_tabs.sql#L1) |
| 20260312223000 Delivery Scheduling Indexes | 7 | 2 | [supabase/migrations/20260312223000_delivery_scheduling_indexes.sql:1](../../supabase/migrations/20260312223000_delivery_scheduling_indexes.sql#L1) |
| 20260312223100 Notification System Completion | 805 | 18 | [supabase/migrations/20260312223100_notification_system_completion.sql:1](../../supabase/migrations/20260312223100_notification_system_completion.sql#L1) |
| 20260312233000 Fix Dashboard Performance Consistency | 265 | 4 | [supabase/migrations/20260312233000_fix_dashboard_performance_consistency.sql:1](../../supabase/migrations/20260312233000_fix_dashboard_performance_consistency.sql#L1) |
| 20260312235900 Fix Dashboard Performance Consistency | 265 | 4 | [supabase/migrations/20260312235900_fix_dashboard_performance_consistency.sql:1](../../supabase/migrations/20260312235900_fix_dashboard_performance_consistency.sql#L1) |
| 20260312235930 Add Route Fields To Order Dashboards | 203 | 2 | [supabase/migrations/20260312235930_add_route_fields_to_order_dashboards.sql:1](../../supabase/migrations/20260312235930_add_route_fields_to_order_dashboards.sql#L1) |
| 20260313010000 Security Hardening Server Authority | 591 | 11 | [supabase/migrations/20260313010000_security_hardening_server_authority.sql:1](../../supabase/migrations/20260313010000_security_hardening_server_authority.sql#L1) |
| 20260321000000 Fix Handle New User Role Assignment | 26 | 1 | [supabase/migrations/20260321000000_fix_handle_new_user_role_assignment.sql:1](../../supabase/migrations/20260321000000_fix_handle_new_user_role_assignment.sql#L1) |
| 20260322000000 Add Disabled Payment Methods | 5 | 0 | [supabase/migrations/20260322000000_add_disabled_payment_methods.sql:1](../../supabase/migrations/20260322000000_add_disabled_payment_methods.sql#L1) |
| 20260322100000 Campaign Pool Delivery | 109 | 1 | [supabase/migrations/20260322100000_campaign_pool_delivery.sql:1](../../supabase/migrations/20260322100000_campaign_pool_delivery.sql#L1) |
| 20260323000000 Secure Feature Flags Admin | 139 | 5 | [supabase/migrations/20260323000000_secure_feature_flags_admin.sql:1](../../supabase/migrations/20260323000000_secure_feature_flags_admin.sql#L1) |
| 20260324021706 Fix Estimate Campaign Audience Time | 258 | 1 | [supabase/migrations/20260324021706_fix_estimate_campaign_audience_time.sql:1](../../supabase/migrations/20260324021706_fix_estimate_campaign_audience_time.sql#L1) |
| 20260324030000 Fix Restaurants Rls Isolation | 14 | 1 | [supabase/migrations/20260324030000_fix_restaurants_rls_isolation.sql:1](../../supabase/migrations/20260324030000_fix_restaurants_rls_isolation.sql#L1) |
| 20260329050000 Harden Dashboard And Loyalty Rpcs | 354 | 5 | [supabase/migrations/20260329050000_harden_dashboard_and_loyalty_rpcs.sql:1](../../supabase/migrations/20260329050000_harden_dashboard_and_loyalty_rpcs.sql#L1) |
| 20260329070000 Add Restaurant Payment History Rpc | 180 | 1 | [supabase/migrations/20260329070000_add_restaurant_payment_history_rpc.sql:1](../../supabase/migrations/20260329070000_add_restaurant_payment_history_rpc.sql#L1) |
| 20260329103000 Add Signup Applications And Verification | 649 | 18 | [supabase/migrations/20260329103000_add_signup_applications_and_verification.sql:1](../../supabase/migrations/20260329103000_add_signup_applications_and_verification.sql#L1) |
| 20260329110000 Fix Admin Dispatch Notification Campaign Return Shape | 113 | 1 | [supabase/migrations/20260329110000_fix_admin_dispatch_notification_campaign_return_shape.sql:1](../../supabase/migrations/20260329110000_fix_admin_dispatch_notification_campaign_return_shape.sql#L1) |
| 20260329113000 Add Safe Reservation Rpcs | 128 | 2 | [supabase/migrations/20260329113000_add_safe_reservation_rpcs.sql:1](../../supabase/migrations/20260329113000_add_safe_reservation_rpcs.sql#L1) |
| 20260329140000 Fix Notification Pipeline Newsletter Column | 385 | 5 | [supabase/migrations/20260329140000_fix_notification_pipeline_newsletter_column.sql:1](../../supabase/migrations/20260329140000_fix_notification_pipeline_newsletter_column.sql#L1) |
| 20260330120000 Global Feature Flag Enforcement | 699 | 4 | [supabase/migrations/20260330120000_global_feature_flag_enforcement.sql:1](../../supabase/migrations/20260330120000_global_feature_flag_enforcement.sql#L1) |
| 20260330184500 Dashboard Floor Plan | 165 | 3 | [supabase/migrations/20260330184500_dashboard_floor_plan.sql:1](../../supabase/migrations/20260330184500_dashboard_floor_plan.sql#L1) |
| 20260330193000 Floor Plan Daily Layout Overrides | 27 | 4 | [supabase/migrations/20260330193000_floor_plan_daily_layout_overrides.sql:1](../../supabase/migrations/20260330193000_floor_plan_daily_layout_overrides.sql#L1) |
| 20260331120000 Improve Search Full Text | 335 | 1 | [supabase/migrations/20260331120000_improve_search_full_text.sql:1](../../supabase/migrations/20260331120000_improve_search_full_text.sql#L1) |
| 20260401060000 Update Menu Item Images | 75 | 0 | [supabase/migrations/20260401060000_update_menu_item_images.sql:1](../../supabase/migrations/20260401060000_update_menu_item_images.sql#L1) |
| 20260402193000 Fix Remaining Menu Item Images | 77 | 0 | [supabase/migrations/20260402193000_fix_remaining_menu_item_images.sql:1](../../supabase/migrations/20260402193000_fix_remaining_menu_item_images.sql#L1) |
| 20260404120000 Launch Offer Packs | 191 | 15 | [supabase/migrations/20260404120000_launch_offer_packs.sql:1](../../supabase/migrations/20260404120000_launch_offer_packs.sql#L1) |
| 20260405120000 Fix Zero Attente Null Opening Hours | 232 | 1 | [supabase/migrations/20260405120000_fix_zero_attente_null_opening_hours.sql:1](../../supabase/migrations/20260405120000_fix_zero_attente_null_opening_hours.sql#L1) |
| 20260405130000 Include Zero Attente Revenue In Performance | 313 | 4 | [supabase/migrations/20260405130000_include_zero_attente_revenue_in_performance.sql:1](../../supabase/migrations/20260405130000_include_zero_attente_revenue_in_performance.sql#L1) |
| 20260405140000 Restaurant Dashboard Feature Gating | 10 | 0 | [supabase/migrations/20260405140000_restaurant_dashboard_feature_gating.sql:1](../../supabase/migrations/20260405140000_restaurant_dashboard_feature_gating.sql#L1) |
| 20260407193000 Enable Rls Reservation Tables | 88 | 0 | [supabase/migrations/20260407193000_enable_rls_reservation_tables.sql:1](../../supabase/migrations/20260407193000_enable_rls_reservation_tables.sql#L1) |
| 20260407194000 Linter Security Hardening | 73 | 0 | [supabase/migrations/20260407194000_linter_security_hardening.sql:1](../../supabase/migrations/20260407194000_linter_security_hardening.sql#L1) |
| 20260407195000 Guest Child Rls Policies | 101 | 1 | [supabase/migrations/20260407195000_guest_child_rls_policies.sql:1](../../supabase/migrations/20260407195000_guest_child_rls_policies.sql#L1) |
| 20260407200000 Rls Initplan Optimize | 139 | 0 | [supabase/migrations/20260407200000_rls_initplan_optimize.sql:1](../../supabase/migrations/20260407200000_rls_initplan_optimize.sql#L1) |
| 20260411191623 Fix Admin List Users Without User Profiles | 41 | 1 | [supabase/migrations/20260411191623_fix_admin_list_users_without_user_profiles.sql:1](../../supabase/migrations/20260411191623_fix_admin_list_users_without_user_profiles.sql#L1) |
| 20260411200000 Rate Limit Buckets | 91 | 4 | [supabase/migrations/20260411200000_rate_limit_buckets.sql:1](../../supabase/migrations/20260411200000_rate_limit_buckets.sql#L1) |
| 20260411200100 Delete User Gdpr Cascade | 135 | 1 | [supabase/migrations/20260411200100_delete_user_gdpr_cascade.sql:1](../../supabase/migrations/20260411200100_delete_user_gdpr_cascade.sql#L1) |
| 20260412103000 Tok One Subscription Compat View | 77 | 5 | [supabase/migrations/20260412103000_tok_one_subscription_compat_view.sql:1](../../supabase/migrations/20260412103000_tok_one_subscription_compat_view.sql#L1) |
| 20260412211629 Stripe Webhook Idempotency | 34 | 3 | [supabase/migrations/20260412211629_stripe_webhook_idempotency.sql:1](../../supabase/migrations/20260412211629_stripe_webhook_idempotency.sql#L1) |
| 20260412220000 Enable Delivery Finance Rls | 169 | 23 | [supabase/migrations/20260412220000_enable_delivery_finance_rls.sql:1](../../supabase/migrations/20260412220000_enable_delivery_finance_rls.sql#L1) |
| 20260416010300 Link Orders And Reservations To Invoices | 40 | 0 | [supabase/migrations/20260416010300_link_orders_and_reservations_to_invoices.sql:1](../../supabase/migrations/20260416010300_link_orders_and_reservations_to_invoices.sql#L1) |
| 20260416010318 Generate Restaurant Payout Invoice Overloads | 203 | 2 | [supabase/migrations/20260416010318_generate_restaurant_payout_invoice_overloads.sql:1](../../supabase/migrations/20260416010318_generate_restaurant_payout_invoice_overloads.sql#L1) |
| 20260417120000 Reservation Billing Schema | 59 | 2 | [supabase/migrations/20260417120000_reservation_billing_schema.sql:1](../../supabase/migrations/20260417120000_reservation_billing_schema.sql#L1) |
| 20260417120100 Reservation Billing Rpcs | 407 | 7 | [supabase/migrations/20260417120100_reservation_billing_rpcs.sql:1](../../supabase/migrations/20260417120100_reservation_billing_rpcs.sql#L1) |
| 20260417180419 Ensure Rls Event Trigger | 46 | 3 | [supabase/migrations/20260417180419_ensure_rls_event_trigger.sql:1](../../supabase/migrations/20260417180419_ensure_rls_event_trigger.sql#L1) |
| 20260418043243 Lock Status Changes After Cancellation Or Payment | 405 | 10 | [supabase/migrations/20260418043243_lock_status_changes_after_cancellation_or_payment.sql:1](../../supabase/migrations/20260418043243_lock_status_changes_after_cancellation_or_payment.sql#L1) |
| 20260418090000 Separate Reservation Fee Invoices | 206 | 4 | [supabase/migrations/20260418090000_separate_reservation_fee_invoices.sql:1](../../supabase/migrations/20260418090000_separate_reservation_fee_invoices.sql#L1) |
| 20260418100000 Extend Payout Invoice To All Paid Reservations | 113 | 1 | [supabase/migrations/20260418100000_extend_payout_invoice_to_all_paid_reservations.sql:1](../../supabase/migrations/20260418100000_extend_payout_invoice_to_all_paid_reservations.sql#L1) |
| 20260418110000 Reservations Confirmed At Trigger | 34 | 2 | [supabase/migrations/20260418110000_reservations_confirmed_at_trigger.sql:1](../../supabase/migrations/20260418110000_reservations_confirmed_at_trigger.sql#L1) |
| 20260418113000 Add Unambiguous Payout Invoice Rpc | 26 | 1 | [supabase/migrations/20260418113000_add_unambiguous_payout_invoice_rpc.sql:1](../../supabase/migrations/20260418113000_add_unambiguous_payout_invoice_rpc.sql#L1) |
| 20260418113317 Harden Function Search Path | 15 | 0 | [supabase/migrations/20260418113317_harden_function_search_path.sql:1](../../supabase/migrations/20260418113317_harden_function_search_path.sql#L1) |
| 20260418113419 Restrict Public Bucket Listing | 31 | 2 | [supabase/migrations/20260418113419_restrict_public_bucket_listing.sql:1](../../supabase/migrations/20260418113419_restrict_public_bucket_listing.sql#L1) |
| 20260418113723 Cleanup Dup Fk And Index Hot Fks | 29 | 10 | [supabase/migrations/20260418113723_cleanup_dup_fk_and_index_hot_fks.sql:1](../../supabase/migrations/20260418113723_cleanup_dup_fk_and_index_hot_fks.sql#L1) |
| 20260418120000 Submit Verified Review Rpc | 112 | 1 | [supabase/migrations/20260418120000_submit_verified_review_rpc.sql:1](../../supabase/migrations/20260418120000_submit_verified_review_rpc.sql#L1) |
| 20260418121500 Fix Payment History Invoice Directions | 189 | 1 | [supabase/migrations/20260418121500_fix_payment_history_invoice_directions.sql:1](../../supabase/migrations/20260418121500_fix_payment_history_invoice_directions.sql#L1) |
| 20260418130000 Strengthen Reservation Billing Rule | 181 | 3 | [supabase/migrations/20260418130000_strengthen_reservation_billing_rule.sql:1](../../supabase/migrations/20260418130000_strengthen_reservation_billing_rule.sql#L1) |
| 20260418140000 Zero Attente Idempotent Duplicate Check | 231 | 1 | [supabase/migrations/20260418140000_zero_attente_idempotent_duplicate_check.sql:1](../../supabase/migrations/20260418140000_zero_attente_idempotent_duplicate_check.sql#L1) |
| 20260420120000 Security And Invoice Hardening | 289 | 11 | [supabase/migrations/20260420120000_security_and_invoice_hardening.sql:1](../../supabase/migrations/20260420120000_security_and_invoice_hardening.sql#L1) |
| 20260421110000 Order Checkout Integrity And Chefs Table | 268 | 4 | [supabase/migrations/20260421110000_order_checkout_integrity_and_chefs_table.sql:1](../../supabase/migrations/20260421110000_order_checkout_integrity_and_chefs_table.sql#L1) |
| 20260422124254 Auto Disable Sold Out Special Offers | 40 | 3 | [supabase/migrations/20260422124254_auto_disable_sold_out_special_offers.sql:1](../../supabase/migrations/20260422124254_auto_disable_sold_out_special_offers.sql#L1) |
| 20260422170000 Split Reservation Fee Invoice Link | 332 | 7 | [supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql:1](../../supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql#L1) |
| 20260422180000 Get Payout Invoice Lines | 245 | 1 | [supabase/migrations/20260422180000_get_payout_invoice_lines.sql:1](../../supabase/migrations/20260422180000_get_payout_invoice_lines.sql#L1) |
| 20260422193000 Unified Payable Invoice | 651 | 10 | [supabase/migrations/20260422193000_unified_payable_invoice.sql:1](../../supabase/migrations/20260422193000_unified_payable_invoice.sql#L1) |
| 20260423232011 Fix Apply Checkout Benefits Redeem Conflict | 253 | 1 | [supabase/migrations/20260423232011_fix_apply_checkout_benefits_redeem_conflict.sql:1](../../supabase/migrations/20260423232011_fix_apply_checkout_benefits_redeem_conflict.sql#L1) |
| 20260424120000 Fix Reservation Accounting Periods | 478 | 2 | [supabase/migrations/20260424120000_fix_reservation_accounting_periods.sql:1](../../supabase/migrations/20260424120000_fix_reservation_accounting_periods.sql#L1) |
| 20260424234900 Remote History Alignment | 6 | 0 | [supabase/migrations/20260424234900_remote_history_alignment.sql:1](../../supabase/migrations/20260424234900_remote_history_alignment.sql#L1) |
| 20260425014839 Campaign Hybrid Pricing | 215 | 2 | [supabase/migrations/20260425014839_campaign_hybrid_pricing.sql:1](../../supabase/migrations/20260425014839_campaign_hybrid_pricing.sql#L1) |
| 20260425021831 Campaign Strategy Planner | 26 | 0 | [supabase/migrations/20260425021831_campaign_strategy_planner.sql:1](../../supabase/migrations/20260425021831_campaign_strategy_planner.sql#L1) |
| 20260425031533 Chefs Table Checkout Idempotency | 292 | 1 | [supabase/migrations/20260425031533_chefs_table_checkout_idempotency.sql:1](../../supabase/migrations/20260425031533_chefs_table_checkout_idempotency.sql#L1) |
| 20260425130000 Chef Table Drops Available Slots | 19 | 0 | [supabase/migrations/20260425130000_chef_table_drops_available_slots.sql:1](../../supabase/migrations/20260425130000_chef_table_drops_available_slots.sql#L1) |
| 20260425140000 Chef Table Drops Drop Available Slots | 10 | 0 | [supabase/migrations/20260425140000_chef_table_drops_drop_available_slots.sql:1](../../supabase/migrations/20260425140000_chef_table_drops_drop_available_slots.sql#L1) |
| 20260425150000 Chefs Table Reservation Confirmed On Create | 162 | 1 | [supabase/migrations/20260425150000_chefs_table_reservation_confirmed_on_create.sql:1](../../supabase/migrations/20260425150000_chefs_table_reservation_confirmed_on_create.sql#L1) |
| 20260425160000 Backfill Chefs Table Confirmed | 30 | 0 | [supabase/migrations/20260425160000_backfill_chefs_table_confirmed.sql:1](../../supabase/migrations/20260425160000_backfill_chefs_table_confirmed.sql#L1) |
| 20260425170000 Standardize Order Reservation References | 342 | 6 | [supabase/migrations/20260425170000_standardize_order_reservation_references.sql:1](../../supabase/migrations/20260425170000_standardize_order_reservation_references.sql#L1) |
| 20260425183000 Restore Chefs Table Checkout Guards | 340 | 1 | [supabase/migrations/20260425183000_restore_chefs_table_checkout_guards.sql:1](../../supabase/migrations/20260425183000_restore_chefs_table_checkout_guards.sql#L1) |
| 20260425220000 Seed Geneva Catalog Complete | 790 | 0 | [supabase/migrations/20260425220000_seed_geneva_catalog_complete.sql:1](../../supabase/migrations/20260425220000_seed_geneva_catalog_complete.sql#L1) |
| 20260425234500 Delete Restaurants Res Fgfgfg | 231 | 0 | [supabase/migrations/20260425234500_delete_restaurants_res_fgfgfg.sql:1](../../supabase/migrations/20260425234500_delete_restaurants_res_fgfgfg.sql#L1) |
| 20260425235500 Seed Quirinale For Rbarman | 765 | 0 | [supabase/migrations/20260425235500_seed_quirinale_for_rbarman.sql:1](../../supabase/migrations/20260425235500_seed_quirinale_for_rbarman.sql#L1) |
| 20260426000000 Refund Columns And Lock Lift | 147 | 4 | [supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql:1](../../supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql#L1) |
| 20260426010000 Refund Rpcs And Queue | 935 | 8 | [supabase/migrations/20260426010000_refund_rpcs_and_queue.sql:1](../../supabase/migrations/20260426010000_refund_rpcs_and_queue.sql#L1) |
| 20260426013000 Add Orders Cancelled At For Refunds | 10 | 0 | [supabase/migrations/20260426013000_add_orders_cancelled_at_for_refunds.sql:1](../../supabase/migrations/20260426013000_add_orders_cancelled_at_for_refunds.sql#L1) |
| 20260426120000 Enable Subscription Features | 10 | 0 | [supabase/migrations/20260426120000_enable_subscription_features.sql:1](../../supabase/migrations/20260426120000_enable_subscription_features.sql#L1) |
| 20260518100000 Enable Zero Attente Miamz | 130 | 2 | [supabase/migrations/20260518100000_enable_zero_attente_miamz.sql:1](../../supabase/migrations/20260518100000_enable_zero_attente_miamz.sql#L1) |
| 20260522030000 Social Feed Restaurateurs | 998 | 61 | [supabase/migrations/20260522030000_social_feed_restaurateurs.sql:1](../../supabase/migrations/20260522030000_social_feed_restaurateurs.sql#L1) |
| 20260522075454 Social Reactions And Comment Threads | 446 | 13 | [supabase/migrations/20260522075454_social_reactions_and_comment_threads.sql:1](../../supabase/migrations/20260522075454_social_reactions_and_comment_threads.sql#L1) |
| 20260523022842 Social Feed V2 | 957 | 31 | [supabase/migrations/20260523022842_social_feed_v2.sql:1](../../supabase/migrations/20260523022842_social_feed_v2.sql#L1) |
| 20260525090000 Align Campaign Default Pricing | 94 | 1 | [supabase/migrations/20260525090000_align_campaign_default_pricing.sql:1](../../supabase/migrations/20260525090000_align_campaign_default_pricing.sql#L1) |
| 20260525205039 Restore Dashboard Rpc Guards | 250 | 4 | [supabase/migrations/20260525205039_restore_dashboard_rpc_guards.sql:1](../../supabase/migrations/20260525205039_restore_dashboard_rpc_guards.sql#L1) |
| 20260525211157 Notification Campaign Automation | 173 | 2 | [supabase/migrations/20260525211157_notification_campaign_automation.sql:1](../../supabase/migrations/20260525211157_notification_campaign_automation.sql#L1) |
| 20260526005419 Reservation Slot Availability | 506 | 3 | [supabase/migrations/20260526005419_reservation_slot_availability.sql:1](../../supabase/migrations/20260526005419_reservation_slot_availability.sql#L1) |
| 20260526152736 Security Audit Hardening | 132 | 6 | [supabase/migrations/20260526152736_security_audit_hardening.sql:1](../../supabase/migrations/20260526152736_security_audit_hardening.sql#L1) |
| 20260526162656 Meal Subscription Status | 53 | 3 | [supabase/migrations/20260526162656_meal_subscription_status.sql:1](../../supabase/migrations/20260526162656_meal_subscription_status.sql#L1) |
| 20260526170535 Tok One Default Plan | 72 | 0 | [supabase/migrations/20260526170535_tok_one_default_plan.sql:1](../../supabase/migrations/20260526170535_tok_one_default_plan.sql#L1) |
| 20260527110835 Fix Signup Moderation Flow | 505 | 3 | [supabase/migrations/20260527110835_fix_signup_moderation_flow.sql:1](../../supabase/migrations/20260527110835_fix_signup_moderation_flow.sql#L1) |
| 20260527133000 Social Marketing Campaign Fields | 25 | 2 | [supabase/migrations/20260527133000_social_marketing_campaign_fields.sql:1](../../supabase/migrations/20260527133000_social_marketing_campaign_fields.sql#L1) |
| 20260527134055 Allow Seated Reservation Status | 94 | 1 | [supabase/migrations/20260527134055_allow_seated_reservation_status.sql:1](../../supabase/migrations/20260527134055_allow_seated_reservation_status.sql#L1) |
| 20260530120000 Signup Email Verification Drafts | 391 | 4 | [supabase/migrations/20260530120000_signup_email_verification_drafts.sql:1](../../supabase/migrations/20260530120000_signup_email_verification_drafts.sql#L1) |
| 20260530121000 Schedule Email Worker | 34 | 0 | [supabase/migrations/20260530121000_schedule_email_worker.sql:1](../../supabase/migrations/20260530121000_schedule_email_worker.sql#L1) |
| 20260530133000 Allow Multiple Meal Subscription Slots | 6 | 1 | [supabase/migrations/20260530133000_allow_multiple_meal_subscription_slots.sql:1](../../supabase/migrations/20260530133000_allow_multiple_meal_subscription_slots.sql#L1) |
| 20260531035500 Fix Social Post Comments Recursive Policy | 20 | 1 | [supabase/migrations/20260531035500_fix_social_post_comments_recursive_policy.sql:1](../../supabase/migrations/20260531035500_fix_social_post_comments_recursive_policy.sql#L1) |
| 20260531121057 Actualites Conversion Insights Hardening | 321 | 3 | [supabase/migrations/20260531121057_actualites_conversion_insights_hardening.sql:1](../../supabase/migrations/20260531121057_actualites_conversion_insights_hardening.sql#L1) |
| 20260531123000 Social Post Promotions | 117 | 9 | [supabase/migrations/20260531123000_social_post_promotions.sql:1](../../supabase/migrations/20260531123000_social_post_promotions.sql#L1) |
| 20260531131500 Actualites Metrics Hardening | 11 | 0 | [supabase/migrations/20260531131500_actualites_metrics_hardening.sql:1](../../supabase/migrations/20260531131500_actualites_metrics_hardening.sql#L1) |
| 20260531150500 Actualites Weighted Rotation And Conversion Attribution | 507 | 7 | [supabase/migrations/20260531150500_actualites_weighted_rotation_and_conversion_attribution.sql:1](../../supabase/migrations/20260531150500_actualites_weighted_rotation_and_conversion_attribution.sql#L1) |
| 20260531153732 Security Rpc Grants Hardening | 33 | 0 | [supabase/migrations/20260531153732_security_rpc_grants_hardening.sql:1](../../supabase/migrations/20260531153732_security_rpc_grants_hardening.sql#L1) |
| 20260531162000 Public Actualites And Anonymous Tracking | 274 | 5 | [supabase/migrations/20260531162000_public_actualites_and_anonymous_tracking.sql:1](../../supabase/migrations/20260531162000_public_actualites_and_anonymous_tracking.sql#L1) |
| 20260531163500 Prevent Restaurant Self Metrics | 8 | 1 | [supabase/migrations/20260531163500_prevent_restaurant_self_metrics.sql:1](../../supabase/migrations/20260531163500_prevent_restaurant_self_metrics.sql#L1) |
| 20260531163600 Actualites Internal Actor Helper | 27 | 1 | [supabase/migrations/20260531163600_actualites_internal_actor_helper.sql:1](../../supabase/migrations/20260531163600_actualites_internal_actor_helper.sql#L1) |
| 20260531163700 Actualites Internal Campaign Guard | 82 | 1 | [supabase/migrations/20260531163700_actualites_internal_campaign_guard.sql:1](../../supabase/migrations/20260531163700_actualites_internal_campaign_guard.sql#L1) |
| 20260531163800 Ignore Internal Actualites Organic Metrics | 181 | 1 | [supabase/migrations/20260531163800_ignore_internal_actualites_organic_metrics.sql:1](../../supabase/migrations/20260531163800_ignore_internal_actualites_organic_metrics.sql#L1) |
| 20260531165000 Payment Integrity Anomaly Rpc | 203 | 1 | [supabase/migrations/20260531165000_payment_integrity_anomaly_rpc.sql:1](../../supabase/migrations/20260531165000_payment_integrity_anomaly_rpc.sql#L1) |
| 20260531170500 Support Incidents Foundation | 343 | 19 | [supabase/migrations/20260531170500_support_incidents_foundation.sql:1](../../supabase/migrations/20260531170500_support_incidents_foundation.sql#L1) |
| 20260531172000 Match Group Lifecycle | 444 | 16 | [supabase/migrations/20260531172000_match_group_lifecycle.sql:1](../../supabase/migrations/20260531172000_match_group_lifecycle.sql#L1) |
| 20260531173500 Match Group Auto Capture Fields | 179 | 5 | [supabase/migrations/20260531173500_match_group_auto_capture_fields.sql:1](../../supabase/migrations/20260531173500_match_group_auto_capture_fields.sql#L1) |
| 20260531174000 Match Group Authorization Reconciliation | 73 | 2 | [supabase/migrations/20260531174000_match_group_authorization_reconciliation.sql:1](../../supabase/migrations/20260531174000_match_group_authorization_reconciliation.sql#L1) |
| 20260531174500 Create Match Group Rpc | 82 | 1 | [supabase/migrations/20260531174500_create_match_group_rpc.sql:1](../../supabase/migrations/20260531174500_create_match_group_rpc.sql#L1) |
| 20260531182000 Actualites Conversion Insights Hardening | 323 | 3 | [supabase/migrations/20260531182000_actualites_conversion_insights_hardening.sql:1](../../supabase/migrations/20260531182000_actualites_conversion_insights_hardening.sql#L1) |
| 20260531183000 Security Rpc Grants Hardening | 52 | 0 | [supabase/migrations/20260531183000_security_rpc_grants_hardening.sql:1](../../supabase/migrations/20260531183000_security_rpc_grants_hardening.sql#L1) |
| 20260531185419 Admin Review Courier Profiles | 111 | 1 | [supabase/migrations/20260531185419_admin_review_courier_profiles.sql:1](../../supabase/migrations/20260531185419_admin_review_courier_profiles.sql#L1) |
| 20260531190000 Security Linter Hardening And Core Cron | 238 | 0 | [supabase/migrations/20260531190000_security_linter_hardening_and_core_cron.sql:1](../../supabase/migrations/20260531190000_security_linter_hardening_and_core_cron.sql#L1) |
| 20260531191057 Security Linter Hardening And Core Cron | 238 | 0 | [supabase/migrations/20260531191057_security_linter_hardening_and_core_cron.sql:1](../../supabase/migrations/20260531191057_security_linter_hardening_and_core_cron.sql#L1) |
| 20260531213124 Match Group 30 Min Prepay Rules | 495 | 8 | [supabase/migrations/20260531213124_match_group_30_min_prepay_rules.sql:1](../../supabase/migrations/20260531213124_match_group_30_min_prepay_rules.sql#L1) |
| 20260531213500 Revoke Anon Courier Review Rpc | 9 | 0 | [supabase/migrations/20260531213500_revoke_anon_courier_review_rpc.sql:1](../../supabase/migrations/20260531213500_revoke_anon_courier_review_rpc.sql#L1) |
| 20260601005703 Admin Marketplace Alerts | 635 | 10 | [supabase/migrations/20260601005703_admin_marketplace_alerts.sql:1](../../supabase/migrations/20260601005703_admin_marketplace_alerts.sql#L1) |
| 20260601014500 Admin Production Health | 787 | 6 | [supabase/migrations/20260601014500_admin_production_health.sql:1](../../supabase/migrations/20260601014500_admin_production_health.sql#L1) |
| 20260601020204 Allow Internal Campaign Metric Writes | 184 | 2 | [supabase/migrations/20260601020204_allow_internal_campaign_metric_writes.sql:1](../../supabase/migrations/20260601020204_allow_internal_campaign_metric_writes.sql#L1) |
| 20260601031804 Admin Actualites Sponsored Control | 242 | 2 | [supabase/migrations/20260601031804_admin_actualites_sponsored_control.sql:1](../../supabase/migrations/20260601031804_admin_actualites_sponsored_control.sql#L1) |
| 20260601035409 Admin Restaurant Console Controls | 495 | 3 | [supabase/migrations/20260601035409_admin_restaurant_console_controls.sql:1](../../supabase/migrations/20260601035409_admin_restaurant_console_controls.sql#L1) |
| 20260601040827 Admin Restaurant Notification Action | 85 | 1 | [supabase/migrations/20260601040827_admin_restaurant_notification_action.sql:1](../../supabase/migrations/20260601040827_admin_restaurant_notification_action.sql#L1) |
| 20260601041744 Admin Users Governance Controls | 638 | 9 | [supabase/migrations/20260601041744_admin_users_governance_controls.sql:1](../../supabase/migrations/20260601041744_admin_users_governance_controls.sql#L1) |
| 20260601043333 Admin Compta Governance Controls | 633 | 15 | [supabase/migrations/20260601043333_admin_compta_governance_controls.sql:1](../../supabase/migrations/20260601043333_admin_compta_governance_controls.sql#L1) |
| 20260601050626 Admin Feature Flag Governance | 257 | 8 | [supabase/migrations/20260601050626_admin_feature_flag_governance.sql:1](../../supabase/migrations/20260601050626_admin_feature_flag_governance.sql#L1) |
| 20260601051105 Admin Reviews Moderation Governance | 242 | 8 | [supabase/migrations/20260601051105_admin_reviews_moderation_governance.sql:1](../../supabase/migrations/20260601051105_admin_reviews_moderation_governance.sql#L1) |
| 20260601051641 Admin Loyalty Tok One Governance | 296 | 9 | [supabase/migrations/20260601051641_admin_loyalty_tok_one_governance.sql:1](../../supabase/migrations/20260601051641_admin_loyalty_tok_one_governance.sql#L1) |
| 20260601052044 Admin Catalog Governance | 161 | 6 | [supabase/migrations/20260601052044_admin_catalog_governance.sql:1](../../supabase/migrations/20260601052044_admin_catalog_governance.sql#L1) |
| 20260601061258 Remote Schema History Placeholder | 9 | 0 | [supabase/migrations/20260601061258_remote_schema_history_placeholder.sql:1](../../supabase/migrations/20260601061258_remote_schema_history_placeholder.sql#L1) |
| 20260601232854 Tok Ai Tools | 421 | 34 | [supabase/migrations/20260601232854_tok_ai_tools.sql:1](../../supabase/migrations/20260601232854_tok_ai_tools.sql#L1) |
| 20260602000907 Tok Ai Platform | 423 | 31 | [supabase/migrations/20260602000907_tok_ai_platform.sql:1](../../supabase/migrations/20260602000907_tok_ai_platform.sql#L1) |
| 20260602033100 Admin Period Control No Throw | 53 | 1 | [supabase/migrations/20260602033100_admin_period_control_no_throw.sql:1](../../supabase/migrations/20260602033100_admin_period_control_no_throw.sql#L1) |
| 20260602043000 Social Sync And Rpc Security | 65 | 1 | [supabase/migrations/20260602043000_social_sync_and_rpc_security.sql:1](../../supabase/migrations/20260602043000_social_sync_and_rpc_security.sql#L1) |
| 20260602070000 Restore Tok Ai Schema | 858 | 65 | [supabase/migrations/20260602070000_restore_tok_ai_schema.sql:1](../../supabase/migrations/20260602070000_restore_tok_ai_schema.sql#L1) |
| 20260602080000 Tok Ai Runtime Hardening | 37 | 2 | [supabase/migrations/20260602080000_tok_ai_runtime_hardening.sql:1](../../supabase/migrations/20260602080000_tok_ai_runtime_hardening.sql#L1) |
| 20260602095159 Reconcile Paid Order Checkouts 10k Hardening | 730 | 4 | [supabase/migrations/20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql:1](../../supabase/migrations/20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql#L1) |
| 20260602120000 Scale Readiness Indexes | 88 | 17 | [supabase/migrations/20260602120000_scale_readiness_indexes.sql:1](../../supabase/migrations/20260602120000_scale_readiness_indexes.sql#L1) |
| 20260602121000 Order Acceptance Capacity Hardening | 630 | 10 | [supabase/migrations/20260602121000_order_acceptance_capacity_hardening.sql:1](../../supabase/migrations/20260602121000_order_acceptance_capacity_hardening.sql#L1) |
| 20260602122000 Reservation Confirmation Deposit Ops | 166 | 4 | [supabase/migrations/20260602122000_reservation_confirmation_deposit_ops.sql:1](../../supabase/migrations/20260602122000_reservation_confirmation_deposit_ops.sql#L1) |
| 20260602123000 Security Rpc Grants Hardening | 14 | 0 | [supabase/migrations/20260602123000_security_rpc_grants_hardening.sql:1](../../supabase/migrations/20260602123000_security_rpc_grants_hardening.sql#L1) |
| 20260602124000 Security Abuse Monitoring 10k | 349 | 4 | [supabase/migrations/20260602124000_security_abuse_monitoring_10k.sql:1](../../supabase/migrations/20260602124000_security_abuse_monitoring_10k.sql#L1) |
| 20260602133000 Admin Security Scheduler Rpc Lockdown | 77 | 3 | [supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql:1](../../supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql#L1) |
| 20260602230737 Refresh Ai Schema Cache Contracts | 29 | 0 | [supabase/migrations/20260602230737_refresh_ai_schema_cache_contracts.sql:1](../../supabase/migrations/20260602230737_refresh_ai_schema_cache_contracts.sql#L1) |
| 20260603102000 Allow Manual Signature Delivery Proof | 18 | 0 | [supabase/migrations/20260603102000_allow_manual_signature_delivery_proof.sql:1](../../supabase/migrations/20260603102000_allow_manual_signature_delivery_proof.sql#L1) |
| 20260603113000 Fix Admin Set User Roles Sorting | 82 | 1 | [supabase/migrations/20260603113000_fix_admin_set_user_roles_sorting.sql:1](../../supabase/migrations/20260603113000_fix_admin_set_user_roles_sorting.sql#L1) |
| 20260603114000 Restore Special Offer Stock | 42 | 1 | [supabase/migrations/20260603114000_restore_special_offer_stock.sql:1](../../supabase/migrations/20260603114000_restore_special_offer_stock.sql#L1) |
| 20260603125000 Seed Admin Operations Center Flag | 13 | 0 | [supabase/migrations/20260603125000_seed_admin_operations_center_flag.sql:1](../../supabase/migrations/20260603125000_seed_admin_operations_center_flag.sql#L1) |
| 20260603132000 Pricing And Stock Constraints | 156 | 0 | [supabase/migrations/20260603132000_pricing_and_stock_constraints.sql:1](../../supabase/migrations/20260603132000_pricing_and_stock_constraints.sql#L1) |
| 20260603143000 Rls Policy Hardening | 360 | 27 | [supabase/migrations/20260603143000_rls_policy_hardening.sql:1](../../supabase/migrations/20260603143000_rls_policy_hardening.sql#L1) |
| 20260603151000 Rls Generic Policy Audit | 732 | 52 | [supabase/migrations/20260603151000_rls_generic_policy_audit.sql:1](../../supabase/migrations/20260603151000_rls_generic_policy_audit.sql#L1) |
| 20260603170000 Admin Notification Campaign Governance | 416 | 8 | [supabase/migrations/20260603170000_admin_notification_campaign_governance.sql:1](../../supabase/migrations/20260603170000_admin_notification_campaign_governance.sql#L1) |
| 20260603171000 Restaurant Media Governance | 229 | 4 | [supabase/migrations/20260603171000_restaurant_media_governance.sql:1](../../supabase/migrations/20260603171000_restaurant_media_governance.sql#L1) |
| 20260603172000 Tok One Currency Chf | 110 | 1 | [supabase/migrations/20260603172000_tok_one_currency_chf.sql:1](../../supabase/migrations/20260603172000_tok_one_currency_chf.sql#L1) |
| 20260603224952 Admin Dashboard Log Reset | 114 | 3 | [supabase/migrations/20260603224952_admin_dashboard_log_reset.sql:1](../../supabase/migrations/20260603224952_admin_dashboard_log_reset.sql#L1) |
| 20260604014500 Restaurant Promotion Validation | 38 | 0 | [supabase/migrations/20260604014500_restaurant_promotion_validation.sql:1](../../supabase/migrations/20260604014500_restaurant_promotion_validation.sql#L1) |
| 20260604020500 Admin Cuisine Governance | 185 | 7 | [supabase/migrations/20260604020500_admin_cuisine_governance.sql:1](../../supabase/migrations/20260604020500_admin_cuisine_governance.sql#L1) |
| 20260604023000 Admin Chef Table Drop Governance | 218 | 4 | [supabase/migrations/20260604023000_admin_chef_table_drop_governance.sql:1](../../supabase/migrations/20260604023000_admin_chef_table_drop_governance.sql#L1) |
| 20260604025500 Admin Launch Pack Governance | 204 | 3 | [supabase/migrations/20260604025500_admin_launch_pack_governance.sql:1](../../supabase/migrations/20260604025500_admin_launch_pack_governance.sql#L1) |
| 20260604031500 Floor Plan Assignment Rpc | 183 | 1 | [supabase/migrations/20260604031500_floor_plan_assignment_rpc.sql:1](../../supabase/migrations/20260604031500_floor_plan_assignment_rpc.sql#L1) |
| 20260604034000 Restaurant Special Offer Governance | 572 | 8 | [supabase/migrations/20260604034000_restaurant_special_offer_governance.sql:1](../../supabase/migrations/20260604034000_restaurant_special_offer_governance.sql#L1) |
| 20260604040500 Zero Attente Checkout Hold | 199 | 1 | [supabase/migrations/20260604040500_zero_attente_checkout_hold.sql:1](../../supabase/migrations/20260604040500_zero_attente_checkout_hold.sql#L1) |
| 20260604042000 Chef Table Checkout Holds | 209 | 6 | [supabase/migrations/20260604042000_chef_table_checkout_holds.sql:1](../../supabase/migrations/20260604042000_chef_table_checkout_holds.sql#L1) |
| 20260605003509 Admin Alert Reconciliation | 110 | 1 | [supabase/migrations/20260605003509_admin_alert_reconciliation.sql:1](../../supabase/migrations/20260605003509_admin_alert_reconciliation.sql#L1) |
| 20260605024301 Fix Admin Log Reset Safe Delete | 66 | 1 | [supabase/migrations/20260605024301_fix_admin_log_reset_safe_delete.sql:1](../../supabase/migrations/20260605024301_fix_admin_log_reset_safe_delete.sql#L1) |
| 20260605030232 Broaden Admin Log Reset Report Scope | 205 | 1 | [supabase/migrations/20260605030232_broaden_admin_log_reset_report_scope.sql:1](../../supabase/migrations/20260605030232_broaden_admin_log_reset_report_scope.sql#L1) |
| 20260605033419 Index Chat Support Incidents | 17 | 4 | [supabase/migrations/20260605033419_index_chat_support_incidents.sql:1](../../supabase/migrations/20260605033419_index_chat_support_incidents.sql#L1) |
| 20260605131641 Admin Domain And Advisor Hardening | 110 | 7 | [supabase/migrations/20260605131641_admin_domain_and_advisor_hardening.sql:1](../../supabase/migrations/20260605131641_admin_domain_and_advisor_hardening.sql#L1) |
| 20260605180050 Wire Miamz Business Logic | 1120 | 25 | [supabase/migrations/20260605180050_wire_miamz_business_logic.sql:1](../../supabase/migrations/20260605180050_wire_miamz_business_logic.sql#L1) |
| 20260605183251 Tok One Stripe Test Mode Support | 27 | 2 | [supabase/migrations/20260605183251_tok_one_stripe_test_mode_support.sql:1](../../supabase/migrations/20260605183251_tok_one_stripe_test_mode_support.sql#L1) |
| 20260606000500 Social Post Media Bucket Hardening | 33 | 0 | [supabase/migrations/20260606000500_social_post_media_bucket_hardening.sql:1](../../supabase/migrations/20260606000500_social_post_media_bucket_hardening.sql#L1) |
| 20260606035714 Repair Loyalty Tiers Status | 35 | 1 | [supabase/migrations/20260606035714_repair_loyalty_tiers_status.sql:1](../../supabase/migrations/20260606035714_repair_loyalty_tiers_status.sql#L1) |
| 20260607033000 Platform Finance Sales Governance | 506 | 34 | [supabase/migrations/20260607033000_platform_finance_sales_governance.sql:1](../../supabase/migrations/20260607033000_platform_finance_sales_governance.sql#L1) |
| 20260607043000 Launch Pack Ai Quotas | 38 | 1 | [supabase/migrations/20260607043000_launch_pack_ai_quotas.sql:1](../../supabase/migrations/20260607043000_launch_pack_ai_quotas.sql#L1) |
| 20260607044000 Restaurant Slug Urls | 80 | 5 | [supabase/migrations/20260607044000_restaurant_slug_urls.sql:1](../../supabase/migrations/20260607044000_restaurant_slug_urls.sql#L1) |
| 20260607053000 Scale Readiness Indexes And Guards | 123 | 15 | [supabase/migrations/20260607053000_scale_readiness_indexes_and_guards.sql:1](../../supabase/migrations/20260607053000_scale_readiness_indexes_and_guards.sql#L1) |
| 20260607053100 Plan2 Fk Index Readiness | 45 | 1 | [supabase/migrations/20260607053100_plan2_fk_index_readiness.sql:1](../../supabase/migrations/20260607053100_plan2_fk_index_readiness.sql#L1) |
| 20260607053200 Plan2 Sensitive Rpc Execute Hardening | 35 | 0 | [supabase/migrations/20260607053200_plan2_sensitive_rpc_execute_hardening.sql:1](../../supabase/migrations/20260607053200_plan2_sensitive_rpc_execute_hardening.sql#L1) |
| 20260607054648 Chef Table Vip Miamz Access | 194 | 2 | [supabase/migrations/20260607054648_chef_table_vip_miamz_access.sql:1](../../supabase/migrations/20260607054648_chef_table_vip_miamz_access.sql#L1) |
| 20260607063751 Authenticated Security Audit Hardening | 64 | 0 | [supabase/migrations/20260607063751_authenticated_security_audit_hardening.sql:1](../../supabase/migrations/20260607063751_authenticated_security_audit_hardening.sql#L1) |
| 20260607065812 Actualites Budget Pacing Delivery Score | 575 | 3 | [supabase/migrations/20260607065812_actualites_budget_pacing_delivery_score.sql:1](../../supabase/migrations/20260607065812_actualites_budget_pacing_delivery_score.sql#L1) |
| 20260607113000 Actualites Saved Feed And Personal Recommendations | 562 | 1 | [supabase/migrations/20260607113000_actualites_saved_feed_and_personal_recommendations.sql:1](../../supabase/migrations/20260607113000_actualites_saved_feed_and_personal_recommendations.sql#L1) |
| 20260607150000 Accounting Refund Aligned Invoice Calculations | 949 | 5 | [supabase/migrations/20260607150000_accounting_refund_aligned_invoice_calculations.sql:1](../../supabase/migrations/20260607150000_accounting_refund_aligned_invoice_calculations.sql#L1) |
| 20260607170000 Notification Recipient Isolation | 42 | 3 | [supabase/migrations/20260607170000_notification_recipient_isolation.sql:1](../../supabase/migrations/20260607170000_notification_recipient_isolation.sql#L1) |
| 20260607174951 Actualites Multi Campaign Attribution | 409 | 3 | [supabase/migrations/20260607174951_actualites_multi_campaign_attribution.sql:1](../../supabase/migrations/20260607174951_actualites_multi_campaign_attribution.sql#L1) |
| 20260607203629 Restaurant Google Booking Setup | 735 | 18 | [supabase/migrations/20260607203629_restaurant_google_booking_setup.sql:1](../../supabase/migrations/20260607203629_restaurant_google_booking_setup.sql#L1) |
| 20260607212249 Seed La Gazelle Dor Restaurant | 385 | 0 | [supabase/migrations/20260607212249_seed_la_gazelle_dor_restaurant.sql:1](../../supabase/migrations/20260607212249_seed_la_gazelle_dor_restaurant.sql#L1) |
| 20260607224120 Link La Gazelle Dor To Rbarman | 40 | 0 | [supabase/migrations/20260607224120_link_la_gazelle_dor_to_rbarman.sql:1](../../supabase/migrations/20260607224120_link_la_gazelle_dor_to_rbarman.sql#L1) |
| 20260608030423 Restaurant Review Response Workflow | 694 | 27 | [supabase/migrations/20260608030423_restaurant_review_response_workflow.sql:1](../../supabase/migrations/20260608030423_restaurant_review_response_workflow.sql#L1) |
| 20260608055014 Fix Admin Restaurant Detail Payout Uuid | 244 | 1 | [supabase/migrations/20260608055014_fix_admin_restaurant_detail_payout_uuid.sql:1](../../supabase/migrations/20260608055014_fix_admin_restaurant_detail_payout_uuid.sql#L1) |
| 20260608060225 Restaurant Admin Correction Requests | 265 | 7 | [supabase/migrations/20260608060225_restaurant_admin_correction_requests.sql:1](../../supabase/migrations/20260608060225_restaurant_admin_correction_requests.sql#L1) |
| 20260608061200 Review Replies Author Type Split | 190 | 4 | [supabase/migrations/20260608061200_review_replies_author_type_split.sql:1](../../supabase/migrations/20260608061200_review_replies_author_type_split.sql#L1) |
| 20260608061215 Restaurant Correction Done Admin Notification | 105 | 1 | [supabase/migrations/20260608061215_restaurant_correction_done_admin_notification.sql:1](../../supabase/migrations/20260608061215_restaurant_correction_done_admin_notification.sql#L1) |
| 20260608063500 Admin Marketplace Alert Take Action | 248 | 2 | [supabase/migrations/20260608063500_admin_marketplace_alert_take_action.sql:1](../../supabase/migrations/20260608063500_admin_marketplace_alert_take_action.sql#L1) |
| 20260608144951 Tok One Vip Offer Notifications | 347 | 9 | [supabase/migrations/20260608144951_tok_one_vip_offer_notifications.sql:1](../../supabase/migrations/20260608144951_tok_one_vip_offer_notifications.sql#L1) |
| 20260613120000 Restaurateur Pending Dashboard Access | 488 | 2 | [supabase/migrations/20260613120000_restaurateur_pending_dashboard_access.sql:1](../../supabase/migrations/20260613120000_restaurateur_pending_dashboard_access.sql#L1) |
| 20260613130000 Auth Signup Role Routing | 58 | 1 | [supabase/migrations/20260613130000_auth_signup_role_routing.sql:1](../../supabase/migrations/20260613130000_auth_signup_role_routing.sql#L1) |
| 20260614103000 Fix Privileged Signup Dossiers And Roles | 328 | 4 | [supabase/migrations/20260614103000_fix_privileged_signup_dossiers_and_roles.sql:1](../../supabase/migrations/20260614103000_fix_privileged_signup_dossiers_and_roles.sql#L1) |
| 20260614234500 Fix Signup Application Id Ambiguity | 233 | 1 | [supabase/migrations/20260614234500_fix_signup_application_id_ambiguity.sql:1](../../supabase/migrations/20260614234500_fix_signup_application_id_ambiguity.sql#L1) |
| 20260615001515 Restaurateur Onboarding Payment Gate | 393 | 7 | [supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql:1](../../supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql#L1) |
| 20260615005145 Restaurant Amenities | 7 | 0 | [supabase/migrations/20260615005145_restaurant_amenities.sql:1](../../supabase/migrations/20260615005145_restaurant_amenities.sql#L1) |
| 20260615012338 Restaurant Billing Credit Usage | 385 | 1 | [supabase/migrations/20260615012338_restaurant_billing_credit_usage.sql:1](../../supabase/migrations/20260615012338_restaurant_billing_credit_usage.sql#L1) |
| 20260615024500 Fix Signup Document Upsert Conflict Target | 233 | 1 | [supabase/migrations/20260615024500_fix_signup_document_upsert_conflict_target.sql:1](../../supabase/migrations/20260615024500_fix_signup_document_upsert_conflict_target.sql#L1) |
| 20260615025943 Fix Signup Review Application Id Ambiguity | 145 | 1 | [supabase/migrations/20260615025943_fix_signup_review_application_id_ambiguity.sql:1](../../supabase/migrations/20260615025943_fix_signup_review_application_id_ambiguity.sql#L1) |
| 20260615031500 Campaign Credit Packs | 594 | 12 | [supabase/migrations/20260615031500_campaign_credit_packs.sql:1](../../supabase/migrations/20260615031500_campaign_credit_packs.sql#L1) |
| 20260615033000 Floor Plan Variants | 114 | 9 | [supabase/migrations/20260615033000_floor_plan_variants.sql:1](../../supabase/migrations/20260615033000_floor_plan_variants.sql#L1) |
| 20260615054500 Restaurant Paid Tok Purchase Invoices | 32 | 1 | [supabase/migrations/20260615054500_restaurant_paid_tok_purchase_invoices.sql:1](../../supabase/migrations/20260615054500_restaurant_paid_tok_purchase_invoices.sql#L1) |
| 20260615070000 Progressive Reservation Offers | 454 | 14 | [supabase/migrations/20260615070000_progressive_reservation_offers.sql:1](../../supabase/migrations/20260615070000_progressive_reservation_offers.sql#L1) |
| 20260615072206 Meal Formula Service Limits | 267 | 5 | [supabase/migrations/20260615072206_meal_formula_service_limits.sql:1](../../supabase/migrations/20260615072206_meal_formula_service_limits.sql#L1) |
| 20260615082200 Progressive Offer Service Scope | 122 | 2 | [supabase/migrations/20260615082200_progressive_offer_service_scope.sql:1](../../supabase/migrations/20260615082200_progressive_offer_service_scope.sql#L1) |
| 20260615084738 Birthday Profiles Notifications Advisor Hardening | 322 | 15 | [supabase/migrations/20260615084738_birthday_profiles_notifications_advisor_hardening.sql:1](../../supabase/migrations/20260615084738_birthday_profiles_notifications_advisor_hardening.sql#L1) |
| 20260615095700 Admin Dashboard Ai Chat Flag | 13 | 0 | [supabase/migrations/20260615095700_admin_dashboard_ai_chat_flag.sql:1](../../supabase/migrations/20260615095700_admin_dashboard_ai_chat_flag.sql#L1) |
| 20260615145022 Reservation Service Capacity Totals | 664 | 3 | [supabase/migrations/20260615145022_reservation_service_capacity_totals.sql:1](../../supabase/migrations/20260615145022_reservation_service_capacity_totals.sql#L1) |
| 20260615184759 Bill Cash Order Commissions | 12 | 0 | [supabase/migrations/20260615184759_bill_cash_order_commissions.sql:1](../../supabase/migrations/20260615184759_bill_cash_order_commissions.sql#L1) |
| 20260616061331 Online Order Payment Confirmation Guard | 236 | 4 | [supabase/migrations/20260616061331_online_order_payment_confirmation_guard.sql:1](../../supabase/migrations/20260616061331_online_order_payment_confirmation_guard.sql#L1) |
| 20260616110000 Actualites Sponsored Targeting Score | 773 | 2 | [supabase/migrations/20260616110000_actualites_sponsored_targeting_score.sql:1](../../supabase/migrations/20260616110000_actualites_sponsored_targeting_score.sql#L1) |
| 20260616123000 Social Comment Reply Mentions | 86 | 2 | [supabase/migrations/20260616123000_social_comment_reply_mentions.sql:1](../../supabase/migrations/20260616123000_social_comment_reply_mentions.sql#L1) |
| 20260616164131 Customer Crm Profiles | 336 | 4 | [supabase/migrations/20260616164131_customer_crm_profiles.sql:1](../../supabase/migrations/20260616164131_customer_crm_profiles.sql#L1) |
| 20260617013000 Progressive Offer Daily Visibility | 32 | 2 | [supabase/migrations/20260617013000_progressive_offer_daily_visibility.sql:1](../../supabase/migrations/20260617013000_progressive_offer_daily_visibility.sql#L1) |
| 20260617110000 Customer Crm Elite Mfa Gate | 132 | 3 | [supabase/migrations/20260617110000_customer_crm_elite_mfa_gate.sql:1](../../supabase/migrations/20260617110000_customer_crm_elite_mfa_gate.sql#L1) |
| 20260619234500 Verified Review Submission Gate | 246 | 7 | [supabase/migrations/20260619234500_verified_review_submission_gate.sql:1](../../supabase/migrations/20260619234500_verified_review_submission_gate.sql#L1) |
| 20260620095406 Miamz Solidarity 1000 Points Per Meal | 161 | 3 | [supabase/migrations/20260620095406_miamz_solidarity_1000_points_per_meal.sql:1](../../supabase/migrations/20260620095406_miamz_solidarity_1000_points_per_meal.sql#L1) |
| 20260620121921 Actualites Premium Banner Followers | 808 | 18 | [supabase/migrations/20260620121921_actualites_premium_banner_followers.sql:1](../../supabase/migrations/20260620121921_actualites_premium_banner_followers.sql#L1) |
| 20260621090000 Disable Launch Packs | 7 | 0 | [supabase/migrations/20260621090000_disable_launch_packs.sql:1](../../supabase/migrations/20260621090000_disable_launch_packs.sql#L1) |
| 20260621090500 Onboarding Subscription Only Gate | 69 | 1 | [supabase/migrations/20260621090500_onboarding_subscription_only_gate.sql:1](../../supabase/migrations/20260621090500_onboarding_subscription_only_gate.sql#L1) |
| 20260621120000 Restaurant Partner Contracts | 94 | 8 | [supabase/migrations/20260621120000_restaurant_partner_contracts.sql:1](../../supabase/migrations/20260621120000_restaurant_partner_contracts.sql#L1) |
| 20260624223726 Daily Miamz Slot Machine | 200 | 4 | [supabase/migrations/20260624223726_daily_miamz_slot_machine.sql:1](../../supabase/migrations/20260624223726_daily_miamz_slot_machine.sql#L1) |
| 20260625012621 Ai Image Resolution Credit Pricing | 57 | 0 | [supabase/migrations/20260625012621_ai_image_resolution_credit_pricing.sql:1](../../supabase/migrations/20260625012621_ai_image_resolution_credit_pricing.sql#L1) |
| 20260625034551 Daily Slot Three Attempts | 223 | 2 | [supabase/migrations/20260625034551_daily_slot_three_attempts.sql:1](../../supabase/migrations/20260625034551_daily_slot_three_attempts.sql#L1) |
| 20260625094000 Canonicalize Legacy Public Image Urls | 40 | 0 | [supabase/migrations/20260625094000_canonicalize_legacy_public_image_urls.sql:1](../../supabase/migrations/20260625094000_canonicalize_legacy_public_image_urls.sql#L1) |
| 20260625133000 Photo Ai Credit Units From Estimated Cost | 107 | 2 | [supabase/migrations/20260625133000_photo_ai_credit_units_from_estimated_cost.sql:1](../../supabase/migrations/20260625133000_photo_ai_credit_units_from_estimated_cost.sql#L1) |
| 20260625150000 Progressive Offer Reentry Lock | 207 | 3 | [supabase/migrations/20260625150000_progressive_offer_reentry_lock.sql:1](../../supabase/migrations/20260625150000_progressive_offer_reentry_lock.sql#L1) |
| 20260625163000 Restaurant Media Ai Metadata | 76 | 0 | [supabase/migrations/20260625163000_restaurant_media_ai_metadata.sql:1](../../supabase/migrations/20260625163000_restaurant_media_ai_metadata.sql#L1) |
| 20260625170500 Unified Tok Credits | 545 | 1 | [supabase/migrations/20260625170500_unified_tok_credits.sql:1](../../supabase/migrations/20260625170500_unified_tok_credits.sql#L1) |
| 20260626073000 Harden Support Incident Message Authors | 50 | 1 | [supabase/migrations/20260626073000_harden_support_incident_message_authors.sql:1](../../supabase/migrations/20260626073000_harden_support_incident_message_authors.sql#L1) |
| 20260626101032 Tok Connect Foundation | 444 | 42 | [supabase/migrations/20260626101032_tok_connect_foundation.sql:1](../../supabase/migrations/20260626101032_tok_connect_foundation.sql#L1) |
| 20260626111842 Tok Connect V1 1 Operations | 16 | 2 | [supabase/migrations/20260626111842_tok_connect_v1_1_operations.sql:1](../../supabase/migrations/20260626111842_tok_connect_v1_1_operations.sql#L1) |
| 20260626143100 Tok Connect Webhook Scheduler | 41 | 0 | [supabase/migrations/20260626143100_tok_connect_webhook_scheduler.sql:1](../../supabase/migrations/20260626143100_tok_connect_webhook_scheduler.sql#L1) |
| 20260626161540 Stripe Webhook Processing Status | 46 | 2 | [supabase/migrations/20260626161540_stripe_webhook_processing_status.sql:1](../../supabase/migrations/20260626161540_stripe_webhook_processing_status.sql#L1) |
| 20260626164236 Tok Connect Webhook Secret Column Grant | 24 | 0 | [supabase/migrations/20260626164236_tok_connect_webhook_secret_column_grant.sql:1](../../supabase/migrations/20260626164236_tok_connect_webhook_secret_column_grant.sql#L1) |
| 20260627104100 Tok Connect Autopilot Governance | 69 | 2 | [supabase/migrations/20260627104100_tok_connect_autopilot_governance.sql:1](../../supabase/migrations/20260627104100_tok_connect_autopilot_governance.sql#L1) |
| 20260627161000 Google Actions Center Foundation | 140 | 9 | [supabase/migrations/20260627161000_google_actions_center_foundation.sql:1](../../supabase/migrations/20260627161000_google_actions_center_foundation.sql#L1) |
| 20260630103000 Restaurant Subscription Self Service | 86 | 3 | [supabase/migrations/20260630103000_restaurant_subscription_self_service.sql:1](../../supabase/migrations/20260630103000_restaurant_subscription_self_service.sql#L1) |
| 20260630131500 Openai X10 Credit Pricing | 234 | 2 | [supabase/migrations/20260630131500_openai_x10_credit_pricing.sql:1](../../supabase/migrations/20260630131500_openai_x10_credit_pricing.sql#L1) |
| 20260630143000 Gpt Image 2 Medium Only Pricing | 62 | 0 | [supabase/migrations/20260630143000_gpt_image_2_medium_only_pricing.sql:1](../../supabase/migrations/20260630143000_gpt_image_2_medium_only_pricing.sql#L1) |
| 20260630155500 Restaurant Subscription Ai Usage Quotas | 101 | 0 | [supabase/migrations/20260630155500_restaurant_subscription_ai_usage_quotas.sql:1](../../supabase/migrations/20260630155500_restaurant_subscription_ai_usage_quotas.sql#L1) |
| 20260630183000 Premium Elite Crm Access | 32 | 1 | [supabase/migrations/20260630183000_premium_elite_crm_access.sql:1](../../supabase/migrations/20260630183000_premium_elite_crm_access.sql#L1) |
| 20260630192000 Fix Tok Credit Recharge Wallet | 458 | 1 | [supabase/migrations/20260630192000_fix_tok_credit_recharge_wallet.sql:1](../../supabase/migrations/20260630192000_fix_tok_credit_recharge_wallet.sql#L1) |
| 20260703075901 Add Commercial Role | 6 | 0 | [supabase/migrations/20260703075901_add_commercial_role.sql:1](../../supabase/migrations/20260703075901_add_commercial_role.sql#L1) |
| 20260703080000 Commercial Prospecting Map | 623 | 12 | [supabase/migrations/20260703080000_commercial_prospecting_map.sql:1](../../supabase/migrations/20260703080000_commercial_prospecting_map.sql#L1) |
| 20260703183553 Commercial Followup Signatures | 34 | 2 | [supabase/migrations/20260703183553_commercial_followup_signatures.sql:1](../../supabase/migrations/20260703183553_commercial_followup_signatures.sql#L1) |
| 20260703205820 Commercial Commission Tracking | 197 | 3 | [supabase/migrations/20260703205820_commercial_commission_tracking.sql:1](../../supabase/migrations/20260703205820_commercial_commission_tracking.sql#L1) |
| 20260703222027 Commercial Compensation Accounting | 695 | 17 | [supabase/migrations/20260703222027_commercial_compensation_accounting.sql:1](../../supabase/migrations/20260703222027_commercial_compensation_accounting.sql#L1) |
| 20260704014500 Enforce Profile Hours For Slots | 1064 | 6 | [supabase/migrations/20260704014500_enforce_profile_hours_for_slots.sql:1](../../supabase/migrations/20260704014500_enforce_profile_hours_for_slots.sql#L1) |
| 20260704164009 Super Admin Sensitive Rls Hardening | 781 | 15 | [supabase/migrations/20260704164009_super_admin_sensitive_rls_hardening.sql:1](../../supabase/migrations/20260704164009_super_admin_sensitive_rls_hardening.sql#L1) |
| 20260706142609 Demo Unlimited Ai Credits | 144 | 0 | [supabase/migrations/20260706142609_demo_unlimited_ai_credits.sql:1](../../supabase/migrations/20260706142609_demo_unlimited_ai_credits.sql#L1) |
| 20260706181500 Actualites Subscription Access Quota | 183 | 6 | [supabase/migrations/20260706181500_actualites_subscription_access_quota.sql:1](../../supabase/migrations/20260706181500_actualites_subscription_access_quota.sql#L1) |
| 20260706192000 Image Metadata Ai | 673 | 34 | [supabase/migrations/20260706192000_image_metadata_ai.sql:1](../../supabase/migrations/20260706192000_image_metadata_ai.sql#L1) |
| 20260707173000 Guard Tok Credit Spend | 124 | 4 | [supabase/migrations/20260707173000_guard_tok_credit_spend.sql:1](../../supabase/migrations/20260707173000_guard_tok_credit_spend.sql#L1) |
| 20260707200452 Claim Image Analysis Job By Image Id | 76 | 1 | [supabase/migrations/20260707200452_claim_image_analysis_job_by_image_id.sql:1](../../supabase/migrations/20260707200452_claim_image_analysis_job_by_image_id.sql#L1) |
| 20260709120000 Financial Ledger And Developer Statements | 158 | 14 | [supabase/migrations/20260709120000_financial_ledger_and_developer_statements.sql:1](../../supabase/migrations/20260709120000_financial_ledger_and_developer_statements.sql#L1) |
| 20260710182000 Lock Signed Commercial Prospect Status | 78 | 2 | [supabase/migrations/20260710182000_lock_signed_commercial_prospect_status.sql:1](../../supabase/migrations/20260710182000_lock_signed_commercial_prospect_status.sql#L1) |
| 20260710190000 Stripe Connect Required Restaurant Payouts | 54 | 2 | [supabase/migrations/20260710190000_stripe_connect_required_restaurant_payouts.sql:1](../../supabase/migrations/20260710190000_stripe_connect_required_restaurant_payouts.sql#L1) |
| 20260710190500 Remove Commercial Demo Accounts | 27 | 0 | [supabase/migrations/20260710190500_remove_commercial_demo_accounts.sql:1](../../supabase/migrations/20260710190500_remove_commercial_demo_accounts.sql#L1) |
| 20260711120000 Audit Security Hardening | 34 | 0 | [supabase/migrations/20260711120000_audit_security_hardening.sql:1](../../supabase/migrations/20260711120000_audit_security_hardening.sql#L1) |
| 20260711153000 Comprehensive Rpc Privilege Hardening | 65 | 0 | [supabase/migrations/20260711153000_comprehensive_rpc_privilege_hardening.sql:1](../../supabase/migrations/20260711153000_comprehensive_rpc_privilege_hardening.sql#L1) |
| 20260712000526 Marketplace Finance Routing | 716 | 11 | [supabase/migrations/20260712000526_marketplace_finance_routing.sql:1](../../supabase/migrations/20260712000526_marketplace_finance_routing.sql#L1) |
| 20260712000718 Index Financial Ledger Reversal | 4 | 1 | [supabase/migrations/20260712000718_index_financial_ledger_reversal.sql:1](../../supabase/migrations/20260712000718_index_financial_ledger_reversal.sql#L1) |
| 20260712001744 Disable Legacy Stripe Sync Worker Cron | 19 | 0 | [supabase/migrations/20260712001744_disable_legacy_stripe_sync_worker_cron.sql:1](../../supabase/migrations/20260712001744_disable_legacy_stripe_sync_worker_cron.sql#L1) |
| 20260712014949 Actualites Image Indexing Security | 1778 | 32 | [supabase/migrations/20260712014949_actualites_image_indexing_security.sql:1](../../supabase/migrations/20260712014949_actualites_image_indexing_security.sql#L1) |
| 20260712060000 Fix Production Security Alerts | 985 | 6 | [supabase/migrations/20260712060000_fix_production_security_alerts.sql:1](../../supabase/migrations/20260712060000_fix_production_security_alerts.sql#L1) |
| 20260712061702 Harden Client Dashboard Boundaries | 546 | 14 | [supabase/migrations/20260712061702_harden_client_dashboard_boundaries.sql:1](../../supabase/migrations/20260712061702_harden_client_dashboard_boundaries.sql#L1) |
| 20260712061703 Fix Miamz Reward Lifecycle | 722 | 8 | [supabase/migrations/20260712061703_fix_miamz_reward_lifecycle.sql:1](../../supabase/migrations/20260712061703_fix_miamz_reward_lifecycle.sql#L1) |
| 20260712063000 Separate Advisors From Operational Health | 104 | 1 | [supabase/migrations/20260712063000_separate_advisors_from_operational_health.sql:1](../../supabase/migrations/20260712063000_separate_advisors_from_operational_health.sql#L1) |
| 20260712090000 Floor Plan V2 Editor Rpc | 604 | 3 | [supabase/migrations/20260712090000_floor_plan_v2_editor_rpc.sql:1](../../supabase/migrations/20260712090000_floor_plan_v2_editor_rpc.sql#L1) |
| 20260712210714 Floor Plan V2 Furniture | 360 | 3 | [supabase/migrations/20260712210714_floor_plan_v2_furniture.sql:1](../../supabase/migrations/20260712210714_floor_plan_v2_furniture.sql#L1) |
| 20260712211332 Floor Plan V2 Furniture Rpc Hardening | 12 | 0 | [supabase/migrations/20260712211332_floor_plan_v2_furniture_rpc_hardening.sql:1](../../supabase/migrations/20260712211332_floor_plan_v2_furniture_rpc_hardening.sql#L1) |
| 20260714120000 Commercial Demo Accounts | 1500 | 44 | [supabase/migrations/20260714120000_commercial_demo_accounts.sql:1](../../supabase/migrations/20260714120000_commercial_demo_accounts.sql#L1) |
| 20260714181500 Commercial Demo Function Acl Hardening | 298 | 10 | [supabase/migrations/20260714181500_commercial_demo_function_acl_hardening.sql:1](../../supabase/migrations/20260714181500_commercial_demo_function_acl_hardening.sql#L1) |
| 20260714184500 Repair Auth Email Change Null | 10 | 0 | [supabase/migrations/20260714184500_repair_auth_email_change_null.sql:1](../../supabase/migrations/20260714184500_repair_auth_email_change_null.sql#L1) |
| 20260714195229 Secure Commercial Sales Governance | 1324 | 25 | [supabase/migrations/20260714195229_secure_commercial_sales_governance.sql:1](../../supabase/migrations/20260714195229_secure_commercial_sales_governance.sql#L1) |
| 20260714232000 Commercial Sales Governance Followup | 2433 | 38 | [supabase/migrations/20260714232000_commercial_sales_governance_followup.sql:1](../../supabase/migrations/20260714232000_commercial_sales_governance_followup.sql#L1) |
| 20260714232001 Commercial Demo Realtime Order Journey | 1013 | 26 | [supabase/migrations/20260714232001_commercial_demo_realtime_order_journey.sql:1](../../supabase/migrations/20260714232001_commercial_demo_realtime_order_journey.sql#L1) |
| 20260714233500 Commercial Demo Finance Isolation Guard | 52 | 0 | [supabase/migrations/20260714233500_commercial_demo_finance_isolation_guard.sql:1](../../supabase/migrations/20260714233500_commercial_demo_finance_isolation_guard.sql#L1) |
| 20260715003424 Commercial Demo Reservations And Active Tools | 642 | 10 | [supabase/migrations/20260715003424_commercial_demo_reservations_and_active_tools.sql:1](../../supabase/migrations/20260715003424_commercial_demo_reservations_and_active_tools.sql#L1) |
| 20260715015956 Commercial Demo Ai Workspaces | 767 | 18 | [supabase/migrations/20260715015956_commercial_demo_ai_workspaces.sql:1](../../supabase/migrations/20260715015956_commercial_demo_ai_workspaces.sql#L1) |
| 20260715023000 Commercial Demo Transaction Host Isolation | 957 | 21 | [supabase/migrations/20260715023000_commercial_demo_transaction_host_isolation.sql:1](../../supabase/migrations/20260715023000_commercial_demo_transaction_host_isolation.sql#L1) |
| 20260715031224 Tok Connect Mcp Chatgpt V2 | 59 | 1 | [supabase/migrations/20260715031224_tok_connect_mcp_chatgpt_v2.sql:1](../../supabase/migrations/20260715031224_tok_connect_mcp_chatgpt_v2.sql#L1) |
| 20260715031622 Floor Plan V2 Reliability | 501 | 5 | [supabase/migrations/20260715031622_floor_plan_v2_reliability.sql:1](../../supabase/migrations/20260715031622_floor_plan_v2_reliability.sql#L1) |
| 20260715044653 Commercial Demo Openai Gateway | 1283 | 17 | [supabase/migrations/20260715044653_commercial_demo_openai_gateway.sql:1](../../supabase/migrations/20260715044653_commercial_demo_openai_gateway.sql#L1) |
| 20260715050654 Distinguish Admin From Commercial Demo | 58 | 1 | [supabase/migrations/20260715050654_distinguish_admin_from_commercial_demo.sql:1](../../supabase/migrations/20260715050654_distinguish_admin_from_commercial_demo.sql#L1) |
| 20260715054500 Tok Connect Mcp Security Hardening | 10 | 0 | [supabase/migrations/20260715054500_tok_connect_mcp_security_hardening.sql:1](../../supabase/migrations/20260715054500_tok_connect_mcp_security_hardening.sql#L1) |
| 20260715060000 Payment Integrity State Machine | 3561 | 83 | [supabase/migrations/20260715060000_payment_integrity_state_machine.sql:1](../../supabase/migrations/20260715060000_payment_integrity_state_machine.sql#L1) |
| 20260715060500 Payment Integrity Advisor Followup | 7 | 1 | [supabase/migrations/20260715060500_payment_integrity_advisor_followup.sql:1](../../supabase/migrations/20260715060500_payment_integrity_advisor_followup.sql#L1) |
| 20260717023000 Stripe Developer Share Transfers | 599 | 11 | [supabase/migrations/20260717023000_stripe_developer_share_transfers.sql:1](../../supabase/migrations/20260717023000_stripe_developer_share_transfers.sql#L1) |
| 20260717024500 Fix Locked Developer Statement Paid Transition | 66 | 1 | [supabase/migrations/20260717024500_fix_locked_developer_statement_paid_transition.sql:1](../../supabase/migrations/20260717024500_fix_locked_developer_statement_paid_transition.sql#L1) |
| 20260717210000 Lock Developer Share All Tok Revenue | 192 | 1 | [supabase/migrations/20260717210000_lock_developer_share_all_tok_revenue.sql:1](../../supabase/migrations/20260717210000_lock_developer_share_all_tok_revenue.sql#L1) |
| 20260717220000 Deferred Subscription Commission Lifecycle | 4371 | 57 | [supabase/migrations/20260717220000_deferred_subscription_commission_lifecycle.sql:1](../../supabase/migrations/20260717220000_deferred_subscription_commission_lifecycle.sql#L1) |
| 20260717235004 Stripe Security And Finance Fail Closed | 334 | 2 | [supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql:1](../../supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql#L1) |
| 20260718022910 Fair Growth Business Model | 6450 | 66 | [supabase/migrations/20260718022910_fair_growth_business_model.sql:1](../../supabase/migrations/20260718022910_fair_growth_business_model.sql#L1) |
| 20260718095000 Fair Growth Post Advisor Hardening | 88 | 11 | [supabase/migrations/20260718095000_fair_growth_post_advisor_hardening.sql:1](../../supabase/migrations/20260718095000_fair_growth_post_advisor_hardening.sql#L1) |
| 20260718201439 Daily Dish Ai | 428 | 19 | [supabase/migrations/20260718201439_daily_dish_ai.sql:1](../../supabase/migrations/20260718201439_daily_dish_ai.sql#L1) |
| 20260718203255 Daily Dish Publication Day Guard | 53 | 2 | [supabase/migrations/20260718203255_daily_dish_publication_day_guard.sql:1](../../supabase/migrations/20260718203255_daily_dish_publication_day_guard.sql#L1) |
| 20260718203452 Daily Dish Advisor Hardening | 38 | 7 | [supabase/migrations/20260718203452_daily_dish_advisor_hardening.sql:1](../../supabase/migrations/20260718203452_daily_dish_advisor_hardening.sql#L1) |
| 20260718203641 Daily Dish Public Column Privacy | 22 | 0 | [supabase/migrations/20260718203641_daily_dish_public_column_privacy.sql:1](../../supabase/migrations/20260718203641_daily_dish_public_column_privacy.sql#L1) |
| 20260718203923 Daily Dish Demo Ai Budget Completion | 101 | 1 | [supabase/migrations/20260718203923_daily_dish_demo_ai_budget_completion.sql:1](../../supabase/migrations/20260718203923_daily_dish_demo_ai_budget_completion.sql#L1) |
| 20260719015244 Prepare Demo Isolation For Activation | 25 | 0 | [supabase/migrations/20260719015244_prepare_demo_isolation_for_activation.sql:1](../../supabase/migrations/20260719015244_prepare_demo_isolation_for_activation.sql#L1) |
| 20260719103746 Harden Daily Slot Idempotency | 276 | 2 | [supabase/migrations/20260719103746_harden_daily_slot_idempotency.sql:1](../../supabase/migrations/20260719103746_harden_daily_slot_idempotency.sql#L1) |
| 20260719110000 Prepare Commercial Demo Activation | 21 | 0 | [supabase/migrations/20260719110000_prepare_commercial_demo_activation.sql:1](../../supabase/migrations/20260719110000_prepare_commercial_demo_activation.sql#L1) |
| 20260719113000 Activate Commercial Demo Restaurant | 30 | 0 | [supabase/migrations/20260719113000_activate_commercial_demo_restaurant.sql:1](../../supabase/migrations/20260719113000_activate_commercial_demo_restaurant.sql#L1) |
| 20260719124500 Keep Commercial Demo Restaurants Active | 43 | 2 | [supabase/migrations/20260719124500_keep_commercial_demo_restaurants_active.sql:1](../../supabase/migrations/20260719124500_keep_commercial_demo_restaurants_active.sql#L1) |
| 20260719150000 Admin Real Restaurant Ownership | 229 | 3 | [supabase/migrations/20260719150000_admin_real_restaurant_ownership.sql:1](../../supabase/migrations/20260719150000_admin_real_restaurant_ownership.sql#L1) |
| 20260719165000 Enforce Commercial Only Roles | 19 | 0 | [supabase/migrations/20260719165000_enforce_commercial_only_roles.sql:1](../../supabase/migrations/20260719165000_enforce_commercial_only_roles.sql#L1) |
| 20260719170000 Production Demo Restaurant Read Isolation | 42 | 2 | [supabase/migrations/20260719170000_production_demo_restaurant_read_isolation.sql:1](../../supabase/migrations/20260719170000_production_demo_restaurant_read_isolation.sql#L1) |
| 20260720130000 Hide Demo Restaurants From Real Catalog | 10 | 0 | [supabase/migrations/20260720130000_hide_demo_restaurants_from_real_catalog.sql:1](../../supabase/migrations/20260720130000_hide_demo_restaurants_from_real_catalog.sql#L1) |
| 20260720131000 Hide Demo Restaurants From Real Catalog | 353 | 1 | [supabase/migrations/20260720131000_hide_demo_restaurants_from_real_catalog.sql:1](../../supabase/migrations/20260720131000_hide_demo_restaurants_from_real_catalog.sql#L1) |
| 20260721181334 Secure Pending Restaurant Onboarding | 564 | 22 | [supabase/migrations/20260721181334_secure_pending_restaurant_onboarding.sql:1](../../supabase/migrations/20260721181334_secure_pending_restaurant_onboarding.sql#L1) |
| 20260721200051 Finalize Pending Restaurant Onboarding | 2308 | 46 | [supabase/migrations/20260721200051_finalize_pending_restaurant_onboarding.sql:1](../../supabase/migrations/20260721200051_finalize_pending_restaurant_onboarding.sql#L1) |
| 20260721215805 Harden Restaurant Payment Eligibility | 306 | 5 | [supabase/migrations/20260721215805_harden_restaurant_payment_eligibility.sql:1](../../supabase/migrations/20260721215805_harden_restaurant_payment_eligibility.sql#L1) |
| 20260721222758 Fence Match Group Capture Claims | 715 | 17 | [supabase/migrations/20260721222758_fence_match_group_capture_claims.sql:1](../../supabase/migrations/20260721222758_fence_match_group_capture_claims.sql#L1) |
| 20260722120000 Restaurant Stripe Adjustments | 47 | 4 | [supabase/migrations/20260722120000_restaurant_stripe_adjustments.sql:1](../../supabase/migrations/20260722120000_restaurant_stripe_adjustments.sql#L1) |
| 20260722123000 Secure Public Analytics Ingestion | 15 | 0 | [supabase/migrations/20260722123000_secure_public_analytics_ingestion.sql:1](../../supabase/migrations/20260722123000_secure_public_analytics_ingestion.sql#L1) |
| 20260724043000 Consent Receipts | 57 | 5 | [supabase/migrations/20260724043000_consent_receipts.sql:1](../../supabase/migrations/20260724043000_consent_receipts.sql#L1) |
| 20260726013000 Admin Destructive Actions | 251 | 2 | [supabase/migrations/20260726013000_admin_destructive_actions.sql:1](../../supabase/migrations/20260726013000_admin_destructive_actions.sql#L1) |
| 20260726020000 Harden Demo Gdpr And Social Cron | 397 | 2 | [supabase/migrations/20260726020000_harden_demo_gdpr_and_social_cron.sql:1](../../supabase/migrations/20260726020000_harden_demo_gdpr_and_social_cron.sql#L1) |
| 20260726021000 Add Paid Module Cancelled At | 291 | 1 | [supabase/migrations/20260726021000_add_paid_module_cancelled_at.sql:1](../../supabase/migrations/20260726021000_add_paid_module_cancelled_at.sql#L1) |
| 20260726022000 Close Demo User Role Escalation | 118 | 0 | [supabase/migrations/20260726022000_close_demo_user_role_escalation.sql:1](../../supabase/migrations/20260726022000_close_demo_user_role_escalation.sql#L1) |
| 20260726022100 Close Demo Storage Bypass | 96 | 0 | [supabase/migrations/20260726022100_close_demo_storage_bypass.sql:1](../../supabase/migrations/20260726022100_close_demo_storage_bypass.sql#L1) |
| 20260726023000 Disable Demo Live Finance Crons | 166 | 0 | [supabase/migrations/20260726023000_disable_demo_live_finance_crons.sql:1](../../supabase/migrations/20260726023000_disable_demo_live_finance_crons.sql#L1) |
| 20260726024000 Close Remaining Demo Rls Bypass | 485 | 1 | [supabase/migrations/20260726024000_close_remaining_demo_rls_bypass.sql:1](../../supabase/migrations/20260726024000_close_remaining_demo_rls_bypass.sql#L1) |
| 20260726030142 Restore Production Reservation Visibility | 133 | 1 | [supabase/migrations/20260726030142_restore_production_reservation_visibility.sql:1](../../supabase/migrations/20260726030142_restore_production_reservation_visibility.sql#L1) |
| 20260726041631 Restore Admin Dashboard Visibility | 207 | 3 | [supabase/migrations/20260726041631_restore_admin_dashboard_visibility.sql:1](../../supabase/migrations/20260726041631_restore_admin_dashboard_visibility.sql#L1) |
| 20260726041632 Crm Mfa Recovery | 203 | 4 | [supabase/migrations/20260726041632_crm_mfa_recovery.sql:1](../../supabase/migrations/20260726041632_crm_mfa_recovery.sql#L1) |
| 20260726053000 Ops Incident Automation | 343 | 12 | [supabase/migrations/20260726053000_ops_incident_automation.sql:1](../../supabase/migrations/20260726053000_ops_incident_automation.sql#L1) |
| 20260726061344 Seed Thefork Commercial Prospect Catalog | 87 | 0 | [supabase/migrations/20260726061344_seed_thefork_commercial_prospect_catalog.sql:1](../../supabase/migrations/20260726061344_seed_thefork_commercial_prospect_catalog.sql#L1) |
| 20260726061543 Ops Incident Native Cron | 59 | 0 | [supabase/migrations/20260726061543_ops_incident_native_cron.sql:1](../../supabase/migrations/20260726061543_ops_incident_native_cron.sql#L1) |
| 20260726062000 Ops Incident Native Cron | 59 | 0 | [supabase/migrations/20260726062000_ops_incident_native_cron.sql:1](../../supabase/migrations/20260726062000_ops_incident_native_cron.sql#L1) |
| 20260726070000 Daily Dish Claim Lock Window | 79 | 1 | [supabase/migrations/20260726070000_daily_dish_claim_lock_window.sql:1](../../supabase/migrations/20260726070000_daily_dish_claim_lock_window.sql#L1) |
| 20260727100000 Daily Dish Optional Image | 193 | 1 | [supabase/migrations/20260727100000_daily_dish_optional_image.sql:1](../../supabase/migrations/20260727100000_daily_dish_optional_image.sql#L1) |
| 20260727190000 Daily Dish Actualites Trusted Asset | 457 | 2 | [supabase/migrations/20260727190000_daily_dish_actualites_trusted_asset.sql:1](../../supabase/migrations/20260727190000_daily_dish_actualites_trusted_asset.sql#L1) |
| 20260727190100 Daily Dish Actualites Trigger Metadata | 39 | 2 | [supabase/migrations/20260727190100_daily_dish_actualites_trigger_metadata.sql:1](../../supabase/migrations/20260727190100_daily_dish_actualites_trigger_metadata.sql#L1) |
| 20260728010000 Ops Incident No Changes Status | 169 | 1 | [supabase/migrations/20260728010000_ops_incident_no_changes_status.sql:1](../../supabase/migrations/20260728010000_ops_incident_no_changes_status.sql#L1) |
| 20260728030000 Supplier Catalog | 186 | 11 | [supabase/migrations/20260728030000_supplier_catalog.sql:1](../../supabase/migrations/20260728030000_supplier_catalog.sql#L1) |
| 20260728030100 Aligro Catalog Weekly Sync | 47 | 0 | [supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql:1](../../supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql#L1) |
| 20260728075715 Server Signup Drafts | 139 | 7 | [supabase/migrations/20260728075715_server_signup_drafts.sql:1](../../supabase/migrations/20260728075715_server_signup_drafts.sql#L1) |
| 20260728075938 Restaurant Onboarding Server Lifecycle | 92 | 6 | [supabase/migrations/20260728075938_restaurant_onboarding_server_lifecycle.sql:1](../../supabase/migrations/20260728075938_restaurant_onboarding_server_lifecycle.sql#L1) |
| 20260728090000 Fair Growth Module Lifecycle | 168 | 10 | [supabase/migrations/20260728090000_fair_growth_module_lifecycle.sql:1](../../supabase/migrations/20260728090000_fair_growth_module_lifecycle.sql#L1) |
| 20260728120000 Google Actions Center Outbox | 221 | 9 | [supabase/migrations/20260728120000_google_actions_center_outbox.sql:1](../../supabase/migrations/20260728120000_google_actions_center_outbox.sql#L1) |
| 20260728120100 Google Actions Center Sync Cron | 48 | 0 | [supabase/migrations/20260728120100_google_actions_center_sync_cron.sql:1](../../supabase/migrations/20260728120100_google_actions_center_sync_cron.sql#L1) |
| 20260728150000 Commercial Contract Acceptances | 150 | 8 | [supabase/migrations/20260728150000_commercial_contract_acceptances.sql:1](../../supabase/migrations/20260728150000_commercial_contract_acceptances.sql#L1) |
| 20260728160000 Dashboard Pack Runtime Kill Switch | 287 | 4 | [supabase/migrations/20260728160000_dashboard_pack_runtime_kill_switch.sql:1](../../supabase/migrations/20260728160000_dashboard_pack_runtime_kill_switch.sql#L1) |
| 20260728170000 Confirmed Campaign Conversions | 412 | 8 | [supabase/migrations/20260728170000_confirmed_campaign_conversions.sql:1](../../supabase/migrations/20260728170000_confirmed_campaign_conversions.sql#L1) |
| 20260728170050 Server Side Campaign Last Click Attribution | 199 | 1 | [supabase/migrations/20260728170050_server_side_campaign_last_click_attribution.sql:1](../../supabase/migrations/20260728170050_server_side_campaign_last_click_attribution.sql#L1) |
| 20260728170075 Dedupe Campaign Conversion Entities | 54 | 2 | [supabase/migrations/20260728170075_dedupe_campaign_conversion_entities.sql:1](../../supabase/migrations/20260728170075_dedupe_campaign_conversion_entities.sql#L1) |
| 20260728170100 Strict Campaign Targeting | 565 | 2 | [supabase/migrations/20260728170100_strict_campaign_targeting.sql:1](../../supabase/migrations/20260728170100_strict_campaign_targeting.sql#L1) |
| 20260728170110 Normalize Complete Campaign Targets | 167 | 3 | [supabase/migrations/20260728170110_normalize_complete_campaign_targets.sql:1](../../supabase/migrations/20260728170110_normalize_complete_campaign_targets.sql#L1) |
| 20260728170120 Confirm Arrived Reservation Conversions | 59 | 1 | [supabase/migrations/20260728170120_confirm_arrived_reservation_conversions.sql:1](../../supabase/migrations/20260728170120_confirm_arrived_reservation_conversions.sql#L1) |
| 20260728173450 Immutable Unaccent Lower | 20 | 1 | [supabase/migrations/20260728173450_immutable_unaccent_lower.sql:1](../../supabase/migrations/20260728173450_immutable_unaccent_lower.sql#L1) |
| 20260728173475 Actualites Campaign Image Index | 254 | 1 | [supabase/migrations/20260728173475_actualites_campaign_image_index.sql:1](../../supabase/migrations/20260728173475_actualites_campaign_image_index.sql#L1) |
| 20260728173500 Actualites Boost Atomic Media | 573 | 2 | [supabase/migrations/20260728173500_actualites_boost_atomic_media.sql:1](../../supabase/migrations/20260728173500_actualites_boost_atomic_media.sql#L1) |
| 20260728173600 Actualites Campaign Image Index | 253 | 1 | [supabase/migrations/20260728173600_actualites_campaign_image_index.sql:1](../../supabase/migrations/20260728173600_actualites_campaign_image_index.sql#L1) |
| 20260728173650 Harden Social Post Boosts | 155 | 2 | [supabase/migrations/20260728173650_harden_social_post_boosts.sql:1](../../supabase/migrations/20260728173650_harden_social_post_boosts.sql#L1) |
| 20260728173700 Harden Social Post Boosts | 155 | 2 | [supabase/migrations/20260728173700_harden_social_post_boosts.sql:1](../../supabase/migrations/20260728173700_harden_social_post_boosts.sql#L1) |
| 20260729090000 Campaign Tracking And Reservation Fee Integrity | 3413 | 36 | [supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql:1](../../supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql#L1) |
| 20260729100000 Exclude Credit Funded Campaigns From Revenue | 81 | 1 | [supabase/migrations/20260729100000_exclude_credit_funded_campaigns_from_revenue.sql:1](../../supabase/migrations/20260729100000_exclude_credit_funded_campaigns_from_revenue.sql#L1) |
| 20260729110000 Flat Reservation Billing When Modules Disabled | 430 | 5 | [supabase/migrations/20260729110000_flat_reservation_billing_when_modules_disabled.sql:1](../../supabase/migrations/20260729110000_flat_reservation_billing_when_modules_disabled.sql#L1) |
| 20260729120000 Allow Admin Managed Commercial Role | 98 | 1 | [supabase/migrations/20260729120000_allow_admin_managed_commercial_role.sql:1](../../supabase/migrations/20260729120000_allow_admin_managed_commercial_role.sql#L1) |
| 20260729160000 Flat Fee On Arrival And Auto Arrival | 170 | 4 | [supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql:1](../../supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql#L1) |
| 20260729170000 Remove Mon Pack And Fair Growth Modules | 371 | 3 | [supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql:1](../../supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql#L1) |
| 20260801003000 Tok Intelligence Suite | 380 | 30 | [supabase/migrations/20260801003000_tok_intelligence_suite.sql:1](../../supabase/migrations/20260801003000_tok_intelligence_suite.sql#L1) |
| 20260801090000 Ops Incident Stale Recovery | 277 | 1 | [supabase/migrations/20260801090000_ops_incident_stale_recovery.sql:1](../../supabase/migrations/20260801090000_ops_incident_stale_recovery.sql#L1) |
| 20260801100000 Google Actions Center Outbox Claim Lease | 179 | 3 | [supabase/migrations/20260801100000_google_actions_center_outbox_claim_lease.sql:1](../../supabase/migrations/20260801100000_google_actions_center_outbox_claim_lease.sql#L1) |
| 20260801120000 Harden Public Restaurant Search Bounds | 127 | 1 | [supabase/migrations/20260801120000_harden_public_restaurant_search_bounds.sql:1](../../supabase/migrations/20260801120000_harden_public_restaurant_search_bounds.sql#L1) |
| 20260801130000 Unify Incident Intelligence | 118 | 8 | [supabase/migrations/20260801130000_unify_incident_intelligence.sql:1](../../supabase/migrations/20260801130000_unify_incident_intelligence.sql#L1) |
| 20260801190000 Marketing Operations Center | 5071 | 129 | [supabase/migrations/20260801190000_marketing_operations_center.sql:1](../../supabase/migrations/20260801190000_marketing_operations_center.sql#L1) |
| 20260802000000 Restaurateur Onboarding Reliability | 153 | 2 | [supabase/migrations/20260802000000_restaurateur_onboarding_reliability.sql:1](../../supabase/migrations/20260802000000_restaurateur_onboarding_reliability.sql#L1) |
| 20260802171847 Grant Rbarman Marketing Admin | 29 | 0 | [supabase/migrations/20260802171847_grant_rbarman_marketing_admin.sql:1](../../supabase/migrations/20260802171847_grant_rbarman_marketing_admin.sql#L1) |
| 20260802230000 Marketing Ai Agent | 461 | 9 | [supabase/migrations/20260802230000_marketing_ai_agent.sql:1](../../supabase/migrations/20260802230000_marketing_ai_agent.sql#L1) |
| 20260803010000 Marketing Prospect Coordinates | 288 | 6 | [supabase/migrations/20260803010000_marketing_prospect_coordinates.sql:1](../../supabase/migrations/20260803010000_marketing_prospect_coordinates.sql#L1) |
| 20260803020000 Marketing B2b Legitimate Interest Email | 74 | 1 | [supabase/migrations/20260803020000_marketing_b2b_legitimate_interest_email.sql:1](../../supabase/migrations/20260803020000_marketing_b2b_legitimate_interest_email.sql#L1) |
| 20260803030000 Marketing Delivery Recipient History | 136 | 3 | [supabase/migrations/20260803030000_marketing_delivery_recipient_history.sql:1](../../supabase/migrations/20260803030000_marketing_delivery_recipient_history.sql#L1) |
| 20260803140000 Marketing One Click Unsubscribe | 111 | 1 | [supabase/migrations/20260803140000_marketing_one_click_unsubscribe.sql:1](../../supabase/migrations/20260803140000_marketing_one_click_unsubscribe.sql#L1) |
| 20260803150000 Marketing Email Cadence | 276 | 2 | [supabase/migrations/20260803150000_marketing_email_cadence.sql:1](../../supabase/migrations/20260803150000_marketing_email_cadence.sql#L1) |
| 20260804204940 Edge Function Audit Logs Created At Index | 28 | 1 | [supabase/migrations/20260804204940_edge_function_audit_logs_created_at_index.sql:1](../../supabase/migrations/20260804204940_edge_function_audit_logs_created_at_index.sql#L1) |
| 20260804204953 Bound Abandon Payment Attempt Lock Wait | 28 | 0 | [supabase/migrations/20260804204953_bound_abandon_payment_attempt_lock_wait.sql:1](../../supabase/migrations/20260804204953_bound_abandon_payment_attempt_lock_wait.sql#L1) |
| 20260804204958 Supabase Advisor Hygiene | 16 | 0 | [supabase/migrations/20260804204958_supabase_advisor_hygiene.sql:1](../../supabase/migrations/20260804204958_supabase_advisor_hygiene.sql#L1) |
| 20260805014524 Idempotent Payment Attempt Abandonment | 163 | 1 | [supabase/migrations/20260805014524_idempotent_payment_attempt_abandonment.sql:1](../../supabase/migrations/20260805014524_idempotent_payment_attempt_abandonment.sql#L1) |
| 20260808064701 Close Audit Security Gaps | 100 | 0 | [supabase/migrations/20260808064701_close_audit_security_gaps.sql:1](../../supabase/migrations/20260808064701_close_audit_security_gaps.sql#L1) |
| 20260808065344 Schedule Stripe Subscription Reconcile | 44 | 0 | [supabase/migrations/20260808065344_schedule_stripe_subscription_reconcile.sql:1](../../supabase/migrations/20260808065344_schedule_stripe_subscription_reconcile.sql#L1) |
| 20260811014500 Ios Storekit Appstore Compliance | 161 | 11 | [supabase/migrations/20260811014500_ios_storekit_appstore_compliance.sql:1](../../supabase/migrations/20260811014500_ios_storekit_appstore_compliance.sql#L1) |
| 20260811070000 Flat Marketplace Pickup Privacy | 306 | 4 | [supabase/migrations/20260811070000_flat_marketplace_pickup_privacy.sql:1](../../supabase/migrations/20260811070000_flat_marketplace_pickup_privacy.sql#L1) |
| 20260831043504 Public Geneva Restaurant Directory | 332 | 3 | [supabase/migrations/20260831043504_public_geneva_restaurant_directory.sql:1](../../supabase/migrations/20260831043504_public_geneva_restaurant_directory.sql#L1) |
| 20260831081000 Directory Image Enrichment | 125 | 3 | [supabase/migrations/20260831081000_directory_image_enrichment.sql:1](../../supabase/migrations/20260831081000_directory_image_enrichment.sql#L1) |
| 20260831093000 Directory Restaurant Claim Removal | 334 | 15 | [supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql:1](../../supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql#L1) |
| 20260831144500 Directory Commercial Name Gate | 360 | 10 | [supabase/migrations/20260831144500_directory_commercial_name_gate.sql:1](../../supabase/migrations/20260831144500_directory_commercial_name_gate.sql#L1) |
| 20260901083000 Restaurant Public Data Consistency | 272 | 8 | [supabase/migrations/20260901083000_restaurant_public_data_consistency.sql:1](../../supabase/migrations/20260901083000_restaurant_public_data_consistency.sql#L1) |
| 20260901170943 Public Restaurant Catalog Infinite Scroll | 263 | 1 | [supabase/migrations/20260901170943_public_restaurant_catalog_infinite_scroll.sql:1](../../supabase/migrations/20260901170943_public_restaurant_catalog_infinite_scroll.sql#L1) |
| 20260901182818 Harden Directory Restaurant Display Names | 204 | 3 | [supabase/migrations/20260901182818_harden_directory_restaurant_display_names.sql:1](../../supabase/migrations/20260901182818_harden_directory_restaurant_display_names.sql#L1) |
| 20260901203000 Directory Cuisine Enrichment | 3121 | 10 | [supabase/migrations/20260901203000_directory_cuisine_enrichment.sql:1](../../supabase/migrations/20260901203000_directory_cuisine_enrichment.sql#L1) |
| 20260902055545 Exact Directory Image Search Backfill | 26 | 0 | [supabase/migrations/20260902055545_exact_directory_image_search_backfill.sql:1](../../supabase/migrations/20260902055545_exact_directory_image_search_backfill.sql#L1) |
| 20260902060000 Directory Cuisine Osm Backfill | 457 | 8 | [supabase/migrations/20260902060000_directory_cuisine_osm_backfill.sql:1](../../supabase/migrations/20260902060000_directory_cuisine_osm_backfill.sql#L1) |
| 20260902061000 Directory Cuisine Osm Precision Guards | 63 | 2 | [supabase/migrations/20260902061000_directory_cuisine_osm_precision_guards.sql:1](../../supabase/migrations/20260902061000_directory_cuisine_osm_precision_guards.sql#L1) |
| 20260902114500 Fix Public Cuisine Catalog Rls | 27 | 3 | [supabase/migrations/20260902114500_fix_public_cuisine_catalog_rls.sql:1](../../supabase/migrations/20260902114500_fix_public_cuisine_catalog_rls.sql#L1) |
| 20260902150000 Expose Restaurant Coordinates In Catalog | 139 | 1 | [supabase/migrations/20260902150000_expose_restaurant_coordinates_in_catalog.sql:1](../../supabase/migrations/20260902150000_expose_restaurant_coordinates_in_catalog.sql#L1) |
| 20260902182000 Randomize Image Backed Restaurant Search | 272 | 1 | [supabase/migrations/20260902182000_randomize_image_backed_restaurant_search.sql:1](../../supabase/migrations/20260902182000_randomize_image_backed_restaurant_search.sql#L1) |
| 20260902190000 Normalize Carouge City Variant | 89 | 0 | [supabase/migrations/20260902190000_normalize_carouge_city_variant.sql:1](../../supabase/migrations/20260902190000_normalize_carouge_city_variant.sql#L1) |
| 20260902212500 Consolidate Carouge City | 121 | 2 | [supabase/migrations/20260902212500_consolidate_carouge_city.sql:1](../../supabase/migrations/20260902212500_consolidate_carouge_city.sql#L1) |
| 20260903084500 Security Audit P0 Remediation | 188 | 0 | [supabase/migrations/20260903084500_security_audit_p0_remediation.sql:1](../../supabase/migrations/20260903084500_security_audit_p0_remediation.sql#L1) |
| 20260903091500 Deduplicate Exact Rls Policies | 67 | 1 | [supabase/migrations/20260903091500_deduplicate_exact_rls_policies.sql:1](../../supabase/migrations/20260903091500_deduplicate_exact_rls_policies.sql#L1) |
| 20260904143000 Ops Incident Github Run Binding | 42 | 3 | [supabase/migrations/20260904143000_ops_incident_github_run_binding.sql:1](../../supabase/migrations/20260904143000_ops_incident_github_run_binding.sql#L1) |
| 20260904173000 Restaurant Image Truth Pipeline | 797 | 13 | [supabase/migrations/20260904173000_restaurant_image_truth_pipeline.sql:1](../../supabase/migrations/20260904173000_restaurant_image_truth_pipeline.sql#L1) |
| 20260904173100 Restaurant Image Truth Guards | 51 | 3 | [supabase/migrations/20260904173100_restaurant_image_truth_guards.sql:1](../../supabase/migrations/20260904173100_restaurant_image_truth_guards.sql#L1) |
| 20260904173200 Restaurant Image Discovery Trigger | 80 | 2 | [supabase/migrations/20260904173200_restaurant_image_discovery_trigger.sql:1](../../supabase/migrations/20260904173200_restaurant_image_discovery_trigger.sql#L1) |
| 20260904173300 Restaurant Image Discovery Reactivation | 77 | 1 | [supabase/migrations/20260904173300_restaurant_image_discovery_reactivation.sql:1](../../supabase/migrations/20260904173300_restaurant_image_discovery_reactivation.sql#L1) |
| 20260904173400 Restaurant Image Discovery Claim Eligibility | 88 | 1 | [supabase/migrations/20260904173400_restaurant_image_discovery_claim_eligibility.sql:1](../../supabase/migrations/20260904173400_restaurant_image_discovery_claim_eligibility.sql#L1) |
| 20260905022000 Tok Connect Mcp Action Bridge | 32 | 2 | [supabase/migrations/20260905022000_tok_connect_mcp_action_bridge.sql:1](../../supabase/migrations/20260905022000_tok_connect_mcp_action_bridge.sql#L1) |
| 20260907011600 Notification Delivery Reliability | 475 | 6 | [supabase/migrations/20260907011600_notification_delivery_reliability.sql:1](../../supabase/migrations/20260907011600_notification_delivery_reliability.sql#L1) |
| 20260907011700 Ai Feature Flag Enforcement | 105 | 1 | [supabase/migrations/20260907011700_ai_feature_flag_enforcement.sql:1](../../supabase/migrations/20260907011700_ai_feature_flag_enforcement.sql#L1) |
| 20260907023000 Marketing Print Foundation | 819 | 38 | [supabase/migrations/20260907023000_marketing_print_foundation.sql:1](../../supabase/migrations/20260907023000_marketing_print_foundation.sql#L1) |
| 20260907023100 Marketing Print Operations | 127 | 6 | [supabase/migrations/20260907023100_marketing_print_operations.sql:1](../../supabase/migrations/20260907023100_marketing_print_operations.sql#L1) |
| 20260907030000 Floor Plan Preferred Tables Autoplacement | 332 | 10 | [supabase/migrations/20260907030000_floor_plan_preferred_tables_autoplacement.sql:1](../../supabase/migrations/20260907030000_floor_plan_preferred_tables_autoplacement.sql#L1) |
| 20260907100000 Optimize Public Restaurant Catalog | 346 | 3 | [supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql:1](../../supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql#L1) |
| 20260908034500 Expand Cloudprinter Logical Catalog | 127 | 0 | [supabase/migrations/20260908034500_expand_cloudprinter_logical_catalog.sql:1](../../supabase/migrations/20260908034500_expand_cloudprinter_logical_catalog.sql#L1) |
| 20260909014500 Tok Connect Restaurant Mcp Access | 6 | 0 | [supabase/migrations/20260909014500_tok_connect_restaurant_mcp_access.sql:1](../../supabase/migrations/20260909014500_tok_connect_restaurant_mcp_access.sql#L1) |
| 20260909025200 Optimize Observability Maintenance | 228 | 4 | [supabase/migrations/20260909025200_optimize_observability_maintenance.sql:1](../../supabase/migrations/20260909025200_optimize_observability_maintenance.sql#L1) |
| 20260909133500 Complete Thefork Directory Catalog | 273 | 0 | [supabase/migrations/20260909133500_complete_thefork_directory_catalog.sql:1](../../supabase/migrations/20260909133500_complete_thefork_directory_catalog.sql#L1) |
| 20260909143000 Show Verified Restaurants Without Images | 269 | 2 | [supabase/migrations/20260909143000_show_verified_restaurants_without_images.sql:1](../../supabase/migrations/20260909143000_show_verified_restaurants_without_images.sql#L1) |
| 20260909153000 Optimize Expanded Public Catalog Rpc | 441 | 1 | [supabase/migrations/20260909153000_optimize_expanded_public_catalog_rpc.sql:1](../../supabase/migrations/20260909153000_optimize_expanded_public_catalog_rpc.sql#L1) |
| 20260914090000 Marketing Outreach Assistance | 1186 | 28 | [supabase/migrations/20260914090000_marketing_outreach_assistance.sql:1](../../supabase/migrations/20260914090000_marketing_outreach_assistance.sql#L1) |
| 20260914224100 Add Directory Display Name | 10 | 0 | [supabase/migrations/20260914224100_add_directory_display_name.sql:1](../../supabase/migrations/20260914224100_add_directory_display_name.sql#L1) |
| 20260915183203 Admin Thefork Only Catalog Filter | 686 | 9 | [supabase/migrations/20260915183203_admin_thefork_only_catalog_filter.sql:1](../../supabase/migrations/20260915183203_admin_thefork_only_catalog_filter.sql#L1) |
| 20260915183625 Admin Thefork Only Catalog Filter | 676 | 9 | [supabase/migrations/20260915183625_admin_thefork_only_catalog_filter.sql:1](../../supabase/migrations/20260915183625_admin_thefork_only_catalog_filter.sql#L1) |
| 20260915183715 Thefork Deploy Probe | 2 | 1 | [supabase/migrations/20260915183715_thefork_deploy_probe.sql:1](../../supabase/migrations/20260915183715_thefork_deploy_probe.sql#L1) |
| 20260915183730 Create Restaurant Thefork Catalog | 2 | 1 | [supabase/migrations/20260915183730_create_restaurant_thefork_catalog.sql:1](../../supabase/migrations/20260915183730_create_restaurant_thefork_catalog.sql#L1) |
| 20260915183738 Extend Restaurant Thefork Catalog | 4 | 1 | [supabase/migrations/20260915183738_extend_restaurant_thefork_catalog.sql:1](../../supabase/migrations/20260915183738_extend_restaurant_thefork_catalog.sql#L1) |
| 20260915183744 Seed Public Restaurant Source Flag | 4 | 0 | [supabase/migrations/20260915183744_seed_public_restaurant_source_flag.sql:1](../../supabase/migrations/20260915183744_seed_public_restaurant_source_flag.sql#L1) |
| 20260915183752 Populate Restaurant Thefork Catalog | 52 | 0 | [supabase/migrations/20260915183752_populate_restaurant_thefork_catalog.sql:1](../../supabase/migrations/20260915183752_populate_restaurant_thefork_catalog.sql#L1) |
| 20260915184411 Create Public Restaurant All Sources Helper | 10 | 1 | [supabase/migrations/20260915184411_create_public_restaurant_all_sources_helper.sql:1](../../supabase/migrations/20260915184411_create_public_restaurant_all_sources_helper.sql#L1) |
| 20260915184416 Create Restaurant Thefork Member Helper | 10 | 1 | [supabase/migrations/20260915184416_create_restaurant_thefork_member_helper.sql:1](../../supabase/migrations/20260915184416_create_restaurant_thefork_member_helper.sql#L1) |
| 20260915184421 Create Restaurant Source Display Helper | 10 | 1 | [supabase/migrations/20260915184421_create_restaurant_source_display_helper.sql:1](../../supabase/migrations/20260915184421_create_restaurant_source_display_helper.sql#L1) |
| 20260915184427 Secure Thefork Visibility Helpers | 7 | 0 | [supabase/migrations/20260915184427_secure_thefork_visibility_helpers.sql:1](../../supabase/migrations/20260915184427_secure_thefork_visibility_helpers.sql#L1) |
| 20260915184436 Gate Restaurants Public Select By Source | 3 | 1 | [supabase/migrations/20260915184436_gate_restaurants_public_select_by_source.sql:1](../../supabase/migrations/20260915184436_gate_restaurants_public_select_by_source.sql#L1) |
| 20260915184441 Gate Production Restaurant Reads By Source | 3 | 1 | [supabase/migrations/20260915184441_gate_production_restaurant_reads_by_source.sql:1](../../supabase/migrations/20260915184441_gate_production_restaurant_reads_by_source.sql#L1) |
| 20260915184447 Gate Commercial Demo Production Reads By Source | 3 | 1 | [supabase/migrations/20260915184447_gate_commercial_demo_production_reads_by_source.sql:1](../../supabase/migrations/20260915184447_gate_commercial_demo_production_reads_by_source.sql#L1) |
| 20260915184514 Secure Restaurant Thefork Catalog Table | 3 | 0 | [supabase/migrations/20260915184514_secure_restaurant_thefork_catalog_table.sql:1](../../supabase/migrations/20260915184514_secure_restaurant_thefork_catalog_table.sql#L1) |
| 20260915184551 Gate Public Catalog Rpc By Thefork Source | 433 | 1 | [supabase/migrations/20260915184551_gate_public_catalog_rpc_by_thefork_source.sql:1](../../supabase/migrations/20260915184551_gate_public_catalog_rpc_by_thefork_source.sql#L1) |
| 20260915184600 Remove Thefork Deploy Probe | 2 | 0 | [supabase/migrations/20260915184600_remove_thefork_deploy_probe.sql:1](../../supabase/migrations/20260915184600_remove_thefork_deploy_probe.sql#L1) |
| 20260917212632 Claim Thefork Image Discovery Jobs | 274 | 3 | [supabase/migrations/20260917212632_claim_thefork_image_discovery_jobs.sql:1](../../supabase/migrations/20260917212632_claim_thefork_image_discovery_jobs.sql#L1) |
| 20260917213543 Prioritize Thefork Image Truth Reviews | 109 | 2 | [supabase/migrations/20260917213543_prioritize_thefork_image_truth_reviews.sql:1](../../supabase/migrations/20260917213543_prioritize_thefork_image_truth_reviews.sql#L1) |
| 20260917213646 Fix Thefork Truth Priority Internal Call | 40 | 1 | [supabase/migrations/20260917213646_fix_thefork_truth_priority_internal_call.sql:1](../../supabase/migrations/20260917213646_fix_thefork_truth_priority_internal_call.sql#L1) |
| 20260917214232 Thefork Official Site Discovery | 164 | 2 | [supabase/migrations/20260917214232_thefork_official_site_discovery.sql:1](../../supabase/migrations/20260917214232_thefork_official_site_discovery.sql#L1) |
| 20260918031431 Claim Thefork Image Truth Reviews | 96 | 1 | [supabase/migrations/20260918031431_claim_thefork_image_truth_reviews.sql:1](../../supabase/migrations/20260918031431_claim_thefork_image_truth_reviews.sql#L1) |
| 20260918031434 Thefork Official Site Discovery | 165 | 2 | [supabase/migrations/20260918031434_thefork_official_site_discovery.sql:1](../../supabase/migrations/20260918031434_thefork_official_site_discovery.sql#L1) |
| 20260918031741 Fix Thefork Site Discovery Handoff | 91 | 1 | [supabase/migrations/20260918031741_fix_thefork_site_discovery_handoff.sql:1](../../supabase/migrations/20260918031741_fix_thefork_site_discovery_handoff.sql#L1) |
| 20260918032031 Backoff Thefork Site Discovery Provider | 45 | 0 | [supabase/migrations/20260918032031_backoff_thefork_site_discovery_provider.sql:1](../../supabase/migrations/20260918032031_backoff_thefork_site_discovery_provider.sql#L1) |
| 20260918032409 Recover Stale Thefork Image Worker Leases | 232 | 2 | [supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql:1](../../supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql#L1) |
| 20260924044424 Restrict Internal Print Rpc Execution | 44 | 0 | [supabase/migrations/20260924044424_restrict_internal_print_rpc_execution.sql:1](../../supabase/migrations/20260924044424_restrict_internal_print_rpc_execution.sql#L1) |
| 20260924044438 Qualify Invoice Logo Storage Paths | 51 | 0 | [supabase/migrations/20260924044438_qualify_invoice_logo_storage_paths.sql:1](../../supabase/migrations/20260924044438_qualify_invoice_logo_storage_paths.sql#L1) |
| 20260924044449 Align Restaurant Public Read Policies | 33 | 0 | [supabase/migrations/20260924044449_align_restaurant_public_read_policies.sql:1](../../supabase/migrations/20260924044449_align_restaurant_public_read_policies.sql#L1) |
| 20260925015352 Schedule Directory Image Discovery | 162 | 1 | [supabase/migrations/20260925015352_schedule_directory_image_discovery.sql:1](../../supabase/migrations/20260925015352_schedule_directory_image_discovery.sql#L1) |
| 20260925104552 Require Public Restaurant Images | 521 | 4 | [supabase/migrations/20260925104552_require_public_restaurant_images.sql:1](../../supabase/migrations/20260925104552_require_public_restaurant_images.sql#L1) |
| 20261003070000 Marketing Autopilot Foundation | 1756 | 39 | [supabase/migrations/20261003070000_marketing_autopilot_foundation.sql:1](../../supabase/migrations/20261003070000_marketing_autopilot_foundation.sql#L1) |
| 20261006010000 Repair Admin Commercial Supabase Regressions | 1012 | 18 | [supabase/migrations/20261006010000_repair_admin_commercial_supabase_regressions.sql:1](../../supabase/migrations/20261006010000_repair_admin_commercial_supabase_regressions.sql#L1) |
| 20261006022139 Configure Meta Marketing Integrations | 47 | 0 | [supabase/migrations/20261006022139_configure_meta_marketing_integrations.sql:1](../../supabase/migrations/20261006022139_configure_meta_marketing_integrations.sql#L1) |
| 20261009003407 Protect Generated Print Format | 42 | 2 | [supabase/migrations/20261009003407_protect_generated_print_format.sql:1](../../supabase/migrations/20261009003407_protect_generated_print_format.sql#L1) |
| 20261010194510 Checkout Benefits And Public Menu Security | 86 | 4 | [supabase/migrations/20261010194510_checkout_benefits_and_public_menu_security.sql:1](../../supabase/migrations/20261010194510_checkout_benefits_and_public_menu_security.sql#L1) |
| 20261010203000 Print Fulfillment Protocol | 260 | 4 | [supabase/migrations/20261010203000_print_fulfillment_protocol.sql:1](../../supabase/migrations/20261010203000_print_fulfillment_protocol.sql#L1) |
| 20261010212500 Reconcile Canonical Commercial Demo Inert State | 50 | 2 | [supabase/migrations/20261010212500_reconcile_canonical_commercial_demo_inert_state.sql:1](../../supabase/migrations/20261010212500_reconcile_canonical_commercial_demo_inert_state.sql#L1) |
| 20261010220000 Launch Animation Access Gate | 162 | 11 | [supabase/migrations/20261010220000_launch_animation_access_gate.sql:1](../../supabase/migrations/20261010220000_launch_animation_access_gate.sql#L1) |
| 20261010224500 Actualites Billing Identity | 190 | 1 | [supabase/migrations/20261010224500_actualites_billing_identity.sql:1](../../supabase/migrations/20261010224500_actualites_billing_identity.sql#L1) |

## Automatisation, dépendances et CI

Gestionnaire : `pnpm@10.28.1`; moteurs : `{"node":">=22.12.0","pnpm":">=10.28.1"}`.

### Commandes package

| Commande | Exécution |
| --- | --- |
| pnpm dev | `vite` |
| pnpm dev:prod | `vite --mode production` |
| pnpm build | `vite build` |
| pnpm build:dev | `vite build --mode development` |
| pnpm build:prod | `vite build --mode production && node ./scripts/prerender-seo.mjs && node ./scripts/harden-directory-restaurant-seo.mjs && node ./scripts/prerender-stoppin-restaurants-bounded.mjs && node ./scripts/harden-seo-public-names.mjs && node ./scripts/harden-seo-web-artifact-names.mjs && node ./scripts/harden-seo-directory-quality.mjs && node ./scripts/harden-seo-near-duplicates.mjs && node ./scripts/harden-seo-inventory-consistency.mjs && node ./scripts/harden-seo-crawl.mjs && node ./scripts/harden-seo-restaurant-context.mjs && node ./scripts/harden-seo-trust-signals.mjs && node ./scripts/harden-seo-final-quality.mjs && node ./scripts/harden-performance-delivery.mjs && node ./scripts/apply-stoppin-venue-redirects.mjs` |
| pnpm seo:prerender | `node ./scripts/prerender-seo.mjs && node ./scripts/harden-directory-restaurant-seo.mjs && node ./scripts/prerender-stoppin-restaurants-bounded.mjs && node ./scripts/harden-seo-public-names.mjs && node ./scripts/harden-seo-web-artifact-names.mjs && node ./scripts/harden-seo-directory-quality.mjs && node ./scripts/harden-seo-near-duplicates.mjs && node ./scripts/harden-seo-inventory-consistency.mjs && node ./scripts/harden-seo-crawl.mjs && node ./scripts/harden-seo-restaurant-context.mjs && node ./scripts/harden-seo-trust-signals.mjs && node ./scripts/harden-seo-final-quality.mjs && node ./scripts/harden-performance-delivery.mjs && node ./scripts/apply-stoppin-venue-redirects.mjs` |
| pnpm seo:sitemap | `node ./scripts/prerender-seo.mjs --public-only && node ./scripts/harden-directory-restaurant-seo.mjs --public-only && node ./scripts/prerender-stoppin-restaurants-bounded.mjs --public-only` |
| pnpm seo:names-harden | `node ./scripts/harden-seo-public-names.mjs` |
| pnpm seo:web-names-harden | `node ./scripts/harden-seo-web-artifact-names.mjs` |
| pnpm seo:quality-harden | `node ./scripts/harden-seo-directory-quality.mjs` |
| pnpm seo:duplicates-harden | `node ./scripts/harden-seo-near-duplicates.mjs` |
| pnpm seo:inventory-harden | `node ./scripts/harden-seo-inventory-consistency.mjs` |
| pnpm seo:crawl-harden | `node ./scripts/harden-seo-crawl.mjs` |
| pnpm seo:context-harden | `node ./scripts/harden-seo-restaurant-context.mjs` |
| pnpm seo:trust-harden | `node ./scripts/harden-seo-trust-signals.mjs` |
| pnpm seo:final-quality | `node ./scripts/harden-seo-final-quality.mjs` |
| pnpm seo:performance-harden | `node ./scripts/harden-performance-delivery.mjs` |
| pnpm deploy:vercel:prod | `node ./scripts/write-production-env.mjs --out=.env.production.local && npx vercel@latest pull --yes --environment=production && npx vercel@latest --prod` |
| pnpm deploy:postcheck | `node ./scripts/post-deploy-check.mjs` |
| pnpm lint | `eslint .` |
| pnpm lint:release | `eslint src/App.tsx src/pages/TokOne.tsx supabase/functions/create-checkout/index.ts supabase/functions/stripe-webhook/index.ts supabase/functions/manage-tok-one-subscription/index.ts supabase/functions/manage-restaurant-subscription/index.ts` |
| pnpm typecheck | `tsc -p tsconfig.typecheck.json --noEmit --pretty false` |
| pnpm preview | `vite preview` |
| pnpm preview:prod | `pnpm run build:prod && vite preview --mode production` |
| pnpm test | `vitest run` |
| pnpm test:launch:10k | `node ./scripts/launch-10k-load-check.mjs` |
| pnpm check:frontend:10k | `node ./scripts/frontend-10k-readiness.mjs` |
| pnpm test:prod | `vitest run --mode production` |
| pnpm test:watch | `vitest` |
| pnpm release:readiness | `node ./scripts/release-readiness.mjs` |
| pnpm release:readiness:strict | `node ./scripts/release-readiness.mjs --strict` |
| pnpm scale:readiness | `node ./scripts/scale-readiness-check.mjs` |
| pnpm audit:business-wiring | `node ./scripts/business-wiring-audit.mjs` |
| pnpm google:actions:feeds | `node ./scripts/google-actions-center-export-feeds.mjs` |
| pnpm image-ai-worker:check | `pnpm --filter tok-image-ai-worker check` |
| pnpm image-ai-worker:start | `pnpm --filter tok-image-ai-worker start` |
| pnpm supabase:doctor | `node ./scripts/supabase-doctor.mjs` |
| pnpm supabase:doctor:prod | `node ./scripts/supabase-doctor.mjs --mode=production` |
| pnpm supabase:doctor:all | `node ./scripts/supabase-doctor.mjs --mode=all` |
| pnpm supabase:target:dev | `node ./scripts/supabase-target.mjs --mode=development` |
| pnpm supabase:target:prod | `node ./scripts/supabase-target.mjs --mode=production` |
| pnpm supabase:db:push:dev | `node ./scripts/supabase-db-push.mjs --mode=development` |
| pnpm supabase:db:push:prod | `node ./scripts/supabase-db-push.mjs --mode=production` |
| pnpm git:auto-sync | `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/git-auto-sync.ps1 -Once` |
| pnpm git:auto-sync:main | `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/git-auto-sync.ps1 -Once -Branch main` |
| pnpm git:auto-sync:watch | `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/git-auto-sync.ps1 -Loop -Branch main -IntervalSeconds 300` |
| pnpm git:auto-sync:install | `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/install-git-auto-sync-task.ps1` |
| pnpm git:auto-sync:uninstall | `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/install-git-auto-sync-task.ps1 -Uninstall` |
| pnpm cap:sync | `pnpm exec cap sync` |
| pnpm cap:build | `pnpm run build && pnpm exec cap sync` |
| pnpm cap:ios | `pnpm run build && pnpm exec cap sync ios && pnpm exec cap open ios` |
| pnpm cap:android | `pnpm run build && pnpm exec cap sync android && pnpm exec cap open android` |
| pnpm cap:dev:ios | `pnpm run build:dev && pnpm exec cap sync ios && pnpm exec cap open ios` |
| pnpm cap:dev:android | `pnpm run build:dev && pnpm exec cap sync android && pnpm exec cap open android` |
| pnpm mobile:sync | `pnpm run build && pnpm exec cap sync android ios` |
| pnpm mobile:build:android:debug | `node ./scripts/mobile-verify.mjs android-debug` |
| pnpm mobile:build:android:release | `node ./scripts/mobile-verify.mjs android-release` |
| pnpm mobile:build:android:bundle | `node ./scripts/mobile-verify.mjs android-bundle` |
| pnpm mobile:build:ios:release | `node ./scripts/mobile-verify.mjs ios-release` |
| pnpm mobile:android:readiness | `node ./scripts/mobile-verify.mjs android-readiness` |
| pnpm mobile:ios:readiness | `node ./scripts/mobile-verify.mjs ios-readiness` |
| pnpm mobile:playstore:check | `pnpm run mobile:android:readiness && pnpm run build` |
| pnpm mobile:appstore:check | `pnpm run mobile:ios:readiness && pnpm run build` |
| pnpm mobile:verify | `node ./scripts/mobile-verify.mjs verify` |
| pnpm generate:error-code-map | `node ./scripts/generate-error-code-map.mjs` |
| pnpm docs:application-index | `node ./scripts/generate-application-index.mjs` |
| pnpm docs:application-index:check | `node ./scripts/generate-application-index.mjs --check` |
| pnpm docs:search | `node ./scripts/search-application-index.mjs` |

### Workflows GitHub Actions

| Workflow | Jobs | Source |
| --- | --- | --- |
| Reusable validation | critical_tests, full_tests, plan, quality, related_tests, validate, windows_worker_tests, worker_tests | [.github/workflows/_validation.yml](../../.github/workflows/_validation.yml) |
| Actualites billing PostgreSQL replay | replay | [.github/workflows/actualites-billing-postgres.yml](../../.github/workflows/actualites-billing-postgres.yml) |
| App Store Build 3 Trigger | dispatch | [.github/workflows/app-store-build3-trigger.yml](../../.github/workflows/app-store-build3-trigger.yml) |
| App Store Build 4 Trigger | dispatch | [.github/workflows/app-store-build4-trigger.yml](../../.github/workflows/app-store-build4-trigger.yml) |
| App Store Build 5 Icon Fix Trigger | dispatch | [.github/workflows/app-store-build5-icon-fix-trigger.yml](../../.github/workflows/app-store-build5-icon-fix-trigger.yml) |
| App Store Build 6 Logotok Trigger | dispatch | [.github/workflows/app-store-build6-logotok-trigger.yml](../../.github/workflows/app-store-build6-logotok-trigger.yml) |
| App Store Connect Preflight | preflight | [.github/workflows/app-store-connect-preflight.yml](../../.github/workflows/app-store-connect-preflight.yml) |
| App Store Finalize v1 | finalize-app-store, prepare-review-account | [.github/workflows/app-store-finalize-v1.yml](../../.github/workflows/app-store-finalize-v1.yml) |
| App Store First Signed Build Trigger | dispatch | [.github/workflows/app-store-first-signed-build.yml](../../.github/workflows/app-store-first-signed-build.yml) |
| App Store Release | app_store_preflight, archive, validation, web_bundle | [.github/workflows/app-store-release.yml](../../.github/workflows/app-store-release.yml) |
| App Store Screenshots | upload-screenshots | [.github/workflows/app-store-screenshots.yml](../../.github/workflows/app-store-screenshots.yml) |
| App Store Submit v7 | submit | [.github/workflows/app-store-submit-v5.yml](../../.github/workflows/app-store-submit-v5.yml) |
| App Store Upload Build 2 Trigger | dispatch | [.github/workflows/app-store-upload-build2-trigger.yml](../../.github/workflows/app-store-upload-build2-trigger.yml) |
| App Store Xcode 26 Validation Trigger | dispatch | [.github/workflows/app-store-xcode26-validation-trigger.yml](../../.github/workflows/app-store-xcode26-validation-trigger.yml) |
| Changed Test Files | changed-tests | [.github/workflows/changed-test-files.yml](../../.github/workflows/changed-test-files.yml) |
| Checkout security PostgreSQL replay | replay | [.github/workflows/checkout-security-postgres.yml](../../.github/workflows/checkout-security-postgres.yml) |
| CI | validate, validation | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |
| Deploy Production | attach_marketing_domain, baseline, build_frontend, configure_project_domains, deploy_frontend, deploy_supabase, deployment_gate, preflight, record_production_baseline, validation | [.github/workflows/deploy-production.yml](../../.github/workflows/deploy-production.yml) |
| Ensure Supabase Auth SMTP | configure | [.github/workflows/ensure-supabase-auth-smtp.yml](../../.github/workflows/ensure-supabase-auth-smtp.yml) |
| TOK Codex Incident Repair | prepare, publish, report, validate | [.github/workflows/incident-codex-repair.yml](../../.github/workflows/incident-codex-repair.yml) |
| TOK Incident Monitor | report-workflow-failure, scan-runtime | [.github/workflows/incident-monitor.yml](../../.github/workflows/incident-monitor.yml) |
| iOS Native Validation | native-build | [.github/workflows/ios-native-validation.yml](../../.github/workflows/ios-native-validation.yml) |
| Prepare TOK App Icon | generate | [.github/workflows/prepare-logotok-app-icon.yml](../../.github/workflows/prepare-logotok-app-icon.yml) |
| Print protocol PostgreSQL replay | replay | [.github/workflows/print-protocol-postgres.yml](../../.github/workflows/print-protocol-postgres.yml) |
| Restaurant Image Truth Backfill | backfill | [.github/workflows/restaurant-image-truth-backfill.yml](../../.github/workflows/restaurant-image-truth-backfill.yml) |
| Sync Cloudprinter Secrets | sync | [.github/workflows/sync-cloudprinter-secrets.yml](../../.github/workflows/sync-cloudprinter-secrets.yml) |
| TOK Incident Secret Sync | sync | [.github/workflows/sync-incident-secrets.yml](../../.github/workflows/sync-incident-secrets.yml) |

### Dépendances

| Paquet | Type | Version |
| --- | --- | --- |
| @aparajita/capacitor-secure-storage | runtime | ^8.0.0 |
| @capacitor/android | development | ^8.4.3 |
| @capacitor/app | runtime | ^8.0.1 |
| @capacitor/browser | runtime | ^8.0.2 |
| @capacitor/cli | development | ^8.4.3 |
| @capacitor/core | runtime | ^8.4.3 |
| @capacitor/geolocation | runtime | ^8.1.0 |
| @capacitor/haptics | runtime | ^8.0.1 |
| @capacitor/ios | development | ^8.4.3 |
| @capacitor/keyboard | runtime | ^8.0.1 |
| @capacitor/push-notifications | runtime | ^8.0.2 |
| @capacitor/splash-screen | runtime | ^8.0.1 |
| @capacitor/status-bar | runtime | ^8.0.1 |
| @eslint/js | development | ^9.32.0 |
| @hookform/resolvers | runtime | ^3.10.0 |
| @radix-ui/react-accordion | runtime | ^1.2.11 |
| @radix-ui/react-alert-dialog | runtime | ^1.1.14 |
| @radix-ui/react-aspect-ratio | runtime | ^1.1.7 |
| @radix-ui/react-avatar | runtime | ^1.1.10 |
| @radix-ui/react-checkbox | runtime | ^1.3.2 |
| @radix-ui/react-collapsible | runtime | ^1.1.11 |
| @radix-ui/react-context-menu | runtime | ^2.2.15 |
| @radix-ui/react-dialog | runtime | ^1.1.14 |
| @radix-ui/react-dropdown-menu | runtime | ^2.1.15 |
| @radix-ui/react-hover-card | runtime | ^1.1.14 |
| @radix-ui/react-label | runtime | ^2.1.7 |
| @radix-ui/react-menubar | runtime | ^1.1.15 |
| @radix-ui/react-navigation-menu | runtime | ^1.2.13 |
| @radix-ui/react-popover | runtime | ^1.1.14 |
| @radix-ui/react-progress | runtime | ^1.1.7 |
| @radix-ui/react-radio-group | runtime | ^1.3.7 |
| @radix-ui/react-scroll-area | runtime | ^1.2.9 |
| @radix-ui/react-select | runtime | ^2.2.5 |
| @radix-ui/react-separator | runtime | ^1.1.7 |
| @radix-ui/react-slider | runtime | ^1.3.5 |
| @radix-ui/react-slot | runtime | ^1.2.3 |
| @radix-ui/react-switch | runtime | ^1.2.5 |
| @radix-ui/react-tabs | runtime | ^1.1.12 |
| @radix-ui/react-toast | runtime | ^1.2.14 |
| @radix-ui/react-toggle | runtime | ^1.1.9 |
| @radix-ui/react-toggle-group | runtime | ^1.1.10 |
| @radix-ui/react-tooltip | runtime | ^1.2.7 |
| @sentry/react | runtime | ^10.48.0 |
| @supabase/supabase-js | runtime | ^2.106.2 |
| @tailwindcss/typography | development | ^0.5.16 |
| @tanstack/react-query | runtime | ^5.83.0 |
| @testing-library/jest-dom | development | ^6.6.0 |
| @testing-library/react | development | ^16.0.0 |
| @types/leaflet | runtime | ^1.9.21 |
| @types/node | development | ^22.16.5 |
| @types/qrcode | development | ^1.5.6 |
| @types/react | development | ^18.3.23 |
| @types/react-dom | development | ^18.3.7 |
| @vercel/analytics | runtime | ^2.0.1 |
| @vitejs/plugin-react-swc | development | ^4.3.1 |
| autoprefixer | development | ^10.4.21 |
| class-variance-authority | runtime | ^0.7.1 |
| clsx | runtime | ^2.1.1 |
| cmdk | runtime | ^1.1.1 |
| date-fns | runtime | ^3.6.0 |
| dotenv | runtime | ^17.3.1 |
| embla-carousel-autoplay | runtime | ^8.6.0 |
| embla-carousel-react | runtime | ^8.6.0 |
| eslint | development | ^9.32.0 |
| eslint-plugin-react-hooks | development | ^5.2.0 |
| eslint-plugin-react-refresh | development | ^0.4.20 |
| firebase | runtime | ^12.16.0 |
| framer-motion | runtime | ^12.35.1 |
| globals | development | ^15.15.0 |
| input-otp | runtime | ^1.4.2 |
| jsdom | development | ^29.0.2 |
| leaflet | runtime | ^1.9.4 |
| lucide-react | runtime | ^0.462.0 |
| next-themes | runtime | ^0.3.0 |
| openai | runtime | ^6.39.1 |
| postcss | development | ^8.5.23 |
| puppeteer | development | ^25.12.0 |
| qrcode | runtime | ^1.5.4 |
| react | runtime | ^18.3.1 |
| react-day-picker | runtime | ^8.10.1 |
| react-dom | runtime | ^18.3.1 |
| react-hook-form | runtime | ^7.61.1 |
| react-markdown | runtime | ^10.1.0 |
| react-resizable-panels | runtime | ^2.1.9 |
| react-router-dom | runtime | ^7.18.4 |
| recharts | runtime | ^3.8.1 |
| sonner | runtime | ^1.7.4 |
| supabase | development | ^2.102.0 |
| tailwind-merge | runtime | ^2.6.0 |
| tailwindcss | development | ^3.4.17 |
| tailwindcss-animate | development | ^1.0.7 |
| typescript | development | ^5.8.3 |
| typescript-eslint | development | ^8.38.0 |
| vaul | runtime | ^0.9.9 |
| vite | development | ^6.4.3 |
| vitest | development | ^4.1.11 |
| zod | runtime | ^3.25.76 |

### Intégrations détectées

| Intégration | Modules | Première source |
| --- | --- | --- |
| Cloudflare | 5 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Firebase | 25 | [public/firebase-messaging-sw.js:1](../../public/firebase-messaging-sw.js#L1) |
| Google | 110 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Openai | 114 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Photon | 4 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Resend | 31 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Sentry | 9 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Stripe | 213 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Supabase | 667 | [scripts/app-store-review-account.mjs:1](../../scripts/app-store-review-account.mjs#L1) |
| Twint | 24 | [scripts/application-index-core.mjs:1](../../scripts/application-index-core.mjs#L1) |
| Vercel | 57 | [middleware.js:1](../../middleware.js#L1) |

## Modules et symboles exportés

Chaque module de code et chaque symbole exporté sont indexés individuellement dans le JSON de recherche. L’inventaire de fichiers ci-dessous fournit la liste complète; ce résumé évite de dupliquer plusieurs milliers de lignes dans la version Markdown.

| Famille de module | Total |
| --- | --- |
| application-library | 204 |
| automation-script | 64 |
| documentation | 6 |
| edge-function-source | 183 |
| frontend-component | 250 |
| frontend-hook | 22 |
| frontend-page | 127 |
| frontend-source | 23 |
| public-asset | 4 |
| repository-file | 8 |
| server-source | 1 |
| test | 581 |
| vercel-api | 9 |
| worker | 5 |

## Documentation existante

| Document | Sections | Source |
| --- | --- | --- |
| Integration routing | 3 | [.agents/skills/stripe-best-practices/SKILL.md:1](../../.agents/skills/stripe-best-practices/SKILL.md#L1) |
| Billing / Subscriptions | 6 | [.agents/skills/stripe-best-practices/references/billing.md:1](../../.agents/skills/stripe-best-practices/references/billing.md#L1) |
| Connect / platforms | 19 | [.agents/skills/stripe-best-practices/references/connect.md:1](../../.agents/skills/stripe-best-practices/references/connect.md#L1) |
| Payments | 9 | [.agents/skills/stripe-best-practices/references/payments.md:1](../../.agents/skills/stripe-best-practices/references/payments.md#L1) |
| Security best practices | 12 | [.agents/skills/stripe-best-practices/references/security.md:1](../../.agents/skills/stripe-best-practices/references/security.md#L1) |
| Tax / Stripe Tax | 6 | [.agents/skills/stripe-best-practices/references/tax.md:1](../../.agents/skills/stripe-best-practices/references/tax.md#L1) |
| Treasury / Financial Accounts | 4 | [.agents/skills/stripe-best-practices/references/treasury.md:1](../../.agents/skills/stripe-best-practices/references/treasury.md#L1) |
| Stripe Directory Search | 3 | [.agents/skills/stripe-directory/SKILL.md:1](../../.agents/skills/stripe-directory/SKILL.md#L1) |
| Stripe Projects — Service Provisioning | 9 | [.agents/skills/stripe-projects/SKILL.md:1](../../.agents/skills/stripe-projects/SKILL.md#L1) |
| Changelog | 10 | [.agents/skills/supabase-postgres-best-practices/CHANGELOG.md:1](../../.agents/skills/supabase-postgres-best-practices/CHANGELOG.md#L1) |
| Supabase Postgres Best Practices | 5 | [.agents/skills/supabase-postgres-best-practices/SKILL.md:1](../../.agents/skills/supabase-postgres-best-practices/SKILL.md#L1) |
| Writing Guidelines for Postgres References | 15 | [.agents/skills/supabase-postgres-best-practices/references/_contributing.md:1](../../.agents/skills/supabase-postgres-best-practices/references/_contributing.md#L1) |
| Section Definitions | 9 | [.agents/skills/supabase-postgres-best-practices/references/_sections.md:1](../../.agents/skills/supabase-postgres-best-practices/references/_sections.md#L1) |
| [Rule Title] | 1 | [.agents/skills/supabase-postgres-best-practices/references/_template.md:1](../../.agents/skills/supabase-postgres-best-practices/references/_template.md#L1) |
| Use tsvector for Full-Text Search | 1 | [.agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md:1](../../.agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md#L1) |
| Index JSONB Columns for Efficient Querying | 1 | [.agents/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md:1](../../.agents/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md#L1) |
| Configure Idle Connection Timeouts | 2 | [.agents/skills/supabase-postgres-best-practices/references/conn-idle-timeout.md:1](../../.agents/skills/supabase-postgres-best-practices/references/conn-idle-timeout.md#L1) |
| Set Appropriate Connection Limits | 1 | [.agents/skills/supabase-postgres-best-practices/references/conn-limits.md:1](../../.agents/skills/supabase-postgres-best-practices/references/conn-limits.md#L1) |
| Use Connection Pooling for All Applications | 1 | [.agents/skills/supabase-postgres-best-practices/references/conn-pooling.md:1](../../.agents/skills/supabase-postgres-best-practices/references/conn-pooling.md#L1) |
| Use Prepared Statements Correctly with Pooling | 1 | [.agents/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md:1](../../.agents/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md#L1) |
| Batch INSERT Statements for Bulk Data | 1 | [.agents/skills/supabase-postgres-best-practices/references/data-batch-inserts.md:1](../../.agents/skills/supabase-postgres-best-practices/references/data-batch-inserts.md#L1) |
| Eliminate N+1 Queries with Batch Loading | 1 | [.agents/skills/supabase-postgres-best-practices/references/data-n-plus-one.md:1](../../.agents/skills/supabase-postgres-best-practices/references/data-n-plus-one.md#L1) |
| Use Cursor-Based Pagination Instead of OFFSET | 1 | [.agents/skills/supabase-postgres-best-practices/references/data-pagination.md:1](../../.agents/skills/supabase-postgres-best-practices/references/data-pagination.md#L1) |
| Use UPSERT for Insert-or-Update Operations | 1 | [.agents/skills/supabase-postgres-best-practices/references/data-upsert.md:1](../../.agents/skills/supabase-postgres-best-practices/references/data-upsert.md#L1) |
| Use Advisory Locks for Application-Level Locking | 1 | [.agents/skills/supabase-postgres-best-practices/references/lock-advisory.md:1](../../.agents/skills/supabase-postgres-best-practices/references/lock-advisory.md#L1) |
| Prevent Deadlocks with Consistent Lock Ordering | 1 | [.agents/skills/supabase-postgres-best-practices/references/lock-deadlock-prevention.md:1](../../.agents/skills/supabase-postgres-best-practices/references/lock-deadlock-prevention.md#L1) |
| Keep Transactions Short to Reduce Lock Contention | 1 | [.agents/skills/supabase-postgres-best-practices/references/lock-short-transactions.md:1](../../.agents/skills/supabase-postgres-best-practices/references/lock-short-transactions.md#L1) |
| Use SKIP LOCKED for Non-Blocking Queue Processing | 1 | [.agents/skills/supabase-postgres-best-practices/references/lock-skip-locked.md:1](../../.agents/skills/supabase-postgres-best-practices/references/lock-skip-locked.md#L1) |
| Use EXPLAIN ANALYZE to Diagnose Slow Queries | 1 | [.agents/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md:1](../../.agents/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md#L1) |
| Enable pg_stat_statements for Query Analysis | 1 | [.agents/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md:1](../../.agents/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md#L1) |
| Maintain Table Statistics with VACUUM and ANALYZE | 1 | [.agents/skills/supabase-postgres-best-practices/references/monitor-vacuum-analyze.md:1](../../.agents/skills/supabase-postgres-best-practices/references/monitor-vacuum-analyze.md#L1) |
| Create Composite Indexes for Multi-Column Queries | 1 | [.agents/skills/supabase-postgres-best-practices/references/query-composite-indexes.md:1](../../.agents/skills/supabase-postgres-best-practices/references/query-composite-indexes.md#L1) |
| Use Covering Indexes to Avoid Table Lookups | 1 | [.agents/skills/supabase-postgres-best-practices/references/query-covering-indexes.md:1](../../.agents/skills/supabase-postgres-best-practices/references/query-covering-indexes.md#L1) |
| Choose the Right Index Type for Your Data | 1 | [.agents/skills/supabase-postgres-best-practices/references/query-index-types.md:1](../../.agents/skills/supabase-postgres-best-practices/references/query-index-types.md#L1) |
| Add Indexes on WHERE and JOIN Columns | 1 | [.agents/skills/supabase-postgres-best-practices/references/query-missing-indexes.md:1](../../.agents/skills/supabase-postgres-best-practices/references/query-missing-indexes.md#L1) |
| Use Partial Indexes for Filtered Queries | 1 | [.agents/skills/supabase-postgres-best-practices/references/query-partial-indexes.md:1](../../.agents/skills/supabase-postgres-best-practices/references/query-partial-indexes.md#L1) |
| Add Constraints Safely in Migrations | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-constraints.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-constraints.md#L1) |
| Choose Appropriate Data Types | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-data-types.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-data-types.md#L1) |
| Index Foreign Key Columns | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md#L1) |
| Use Lowercase Identifiers for Compatibility | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-lowercase-identifiers.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-lowercase-identifiers.md#L1) |
| Partition Large Tables for Better Performance | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-partitioning.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-partitioning.md#L1) |
| Select Optimal Primary Key Strategy | 1 | [.agents/skills/supabase-postgres-best-practices/references/schema-primary-keys.md:1](../../.agents/skills/supabase-postgres-best-practices/references/schema-primary-keys.md#L1) |
| Apply Principle of Least Privilege | 1 | [.agents/skills/supabase-postgres-best-practices/references/security-privileges.md:1](../../.agents/skills/supabase-postgres-best-practices/references/security-privileges.md#L1) |
| Enable Row Level Security for Multi-Tenant Data | 1 | [.agents/skills/supabase-postgres-best-practices/references/security-rls-basics.md:1](../../.agents/skills/supabase-postgres-best-practices/references/security-rls-basics.md#L1) |
| Optimize RLS Policies for Performance | 1 | [.agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md:1](../../.agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md#L1) |
| Changelog | 10 | [.agents/skills/supabase/CHANGELOG.md:1](../../.agents/skills/supabase/CHANGELOG.md#L1) |
| Supabase | 9 | [.agents/skills/supabase/SKILL.md:1](../../.agents/skills/supabase/SKILL.md#L1) |
| What happened | 3 | [.agents/skills/supabase/assets/feedback-issue-template.md:1](../../.agents/skills/supabase/assets/feedback-issue-template.md#L1) |
| Skill Feedback | 2 | [.agents/skills/supabase/references/skill-feedback.md:1](../../.agents/skills/supabase/references/skill-feedback.md#L1) |
| Upgrading Stripe Versions | 18 | [.agents/skills/upgrade-stripe/SKILL.md:1](../../.agents/skills/upgrade-stripe/SKILL.md#L1) |
| Integration routing | 3 | [.claude/skills/stripe-best-practices/SKILL.md:1](../../.claude/skills/stripe-best-practices/SKILL.md#L1) |
| Billing / Subscriptions | 6 | [.claude/skills/stripe-best-practices/references/billing.md:1](../../.claude/skills/stripe-best-practices/references/billing.md#L1) |
| Connect / platforms | 19 | [.claude/skills/stripe-best-practices/references/connect.md:1](../../.claude/skills/stripe-best-practices/references/connect.md#L1) |
| Payments | 9 | [.claude/skills/stripe-best-practices/references/payments.md:1](../../.claude/skills/stripe-best-practices/references/payments.md#L1) |
| Security best practices | 12 | [.claude/skills/stripe-best-practices/references/security.md:1](../../.claude/skills/stripe-best-practices/references/security.md#L1) |
| Tax / Stripe Tax | 6 | [.claude/skills/stripe-best-practices/references/tax.md:1](../../.claude/skills/stripe-best-practices/references/tax.md#L1) |
| Treasury / Financial Accounts | 4 | [.claude/skills/stripe-best-practices/references/treasury.md:1](../../.claude/skills/stripe-best-practices/references/treasury.md#L1) |
| Stripe Directory Search | 3 | [.claude/skills/stripe-directory/SKILL.md:1](../../.claude/skills/stripe-directory/SKILL.md#L1) |
| Stripe Projects — Service Provisioning | 9 | [.claude/skills/stripe-projects/SKILL.md:1](../../.claude/skills/stripe-projects/SKILL.md#L1) |
| Upgrading Stripe Versions | 18 | [.claude/skills/upgrade-stripe/SKILL.md:1](../../.claude/skills/upgrade-stripe/SKILL.md#L1) |
| Objectif | 5 | [.github/PULL_REQUEST_TEMPLATE.md:1](../../.github/PULL_REQUEST_TEMPLATE.md#L1) |
| Contexte projet | 12 | [AGENTS.md:1](../../AGENTS.md#L1) |
| TOK / TheTok | 10 | [README.md:1](../../README.md#L1) |
| Déploiement TOK | 5 | [README_DEPLOY.md:1](../../README_DEPLOY.md#L1) |
| Security Policy | 7 | [SECURITY.md:1](../../SECURITY.md#L1) |
| SKILL | 0 | [codex-skills/mobile-fullstack-architect/SKILL.md:1](../../codex-skills/mobile-fullstack-architect/SKILL.md#L1) |
| React + Capacitor Review | 4 | [codex-skills/mobile-fullstack-architect/references/react-capacitor.md:1](../../codex-skills/mobile-fullstack-architect/references/react-capacitor.md#L1) |
| Repo Mapping | 5 | [codex-skills/mobile-fullstack-architect/references/repo-mapping.md:1](../../codex-skills/mobile-fullstack-architect/references/repo-mapping.md#L1) |
| Security Review | 6 | [codex-skills/mobile-fullstack-architect/references/security.md:1](../../codex-skills/mobile-fullstack-architect/references/security.md#L1) |
| Supabase Backend Review | 6 | [codex-skills/mobile-fullstack-architect/references/supabase-backend.md:1](../../codex-skills/mobile-fullstack-architect/references/supabase-backend.md#L1) |
| Centre d’opérations marketing TheTOK | 11 | [docs/MARKETING_OPERATIONS_CENTER.md:1](../../docs/MARKETING_OPERATIONS_CENTER.md#L1) |
| Print fulfillment protocol — controlled rollout and recovery | 5 | [docs/PRINT_FULFILLMENT_PROTOCOL.md:1](../../docs/PRINT_FULFILLMENT_PROTOCOL.md#L1) |
| État d’exécution TOK observé le 3 octobre 2026 | 6 | [docs/architecture/TOK_RUNTIME_EVIDENCE_2026-10-03.md:1](../../docs/architecture/TOK_RUNTIME_EVIDENCE_2026-10-03.md#L1) |
| Audit Execution Plan | 22 | [docs/audit-execution-plan.md:1](../../docs/audit-execution-plan.md#L1) |
| Supabase production audit — project `wwcrtyoueexyxkkikaos` (Tok) | 12 | [docs/audits/2026-04-18-supabase-production-audit.md:1](../../docs/audits/2026-04-18-supabase-production-audit.md#L1) |
| Audit global TOK — routes, fonctionnalités et manques prioritaires | 22 | [docs/audits/2026-05-31-global-site-gap-audit.md:1](../../docs/audits/2026-05-31-global-site-gap-audit.md#L1) |
| Audit d'authentification Supabase — 2026-08-02 | 19 | [docs/audits/2026-08-02-supabase-auth-audit.md:1](../../docs/audits/2026-08-02-supabase-auth-audit.md#L1) |
| Remédiation des dépendances TOK — 3 octobre 2026 | 9 | [docs/audits/DEPENDABOT_2026-10-03.md:1](../../docs/audits/DEPENDABOT_2026-10-03.md#L1) |
| Audit des campagnes marketing TOK — 28 juillet 2026 | 17 | [docs/audits/MARKETING_CAMPAIGNS_AUDIT_2026-07-28.md:1](../../docs/audits/MARKETING_CAMPAIGNS_AUDIT_2026-07-28.md#L1) |
| Audit complet codebase TOK - 2026-06-19 | 25 | [docs/audits/codebase-audit-2026-06-19.md:1](../../docs/audits/codebase-audit-2026-06-19.md#L1) |
| Audit codebase TOK - 2026-06-26 | 16 | [docs/audits/codebase-audit-2026-06-26.md:1](../../docs/audits/codebase-audit-2026-06-26.md#L1) |
| Mobile release readiness | 9 | [docs/audits/mobile-release-readiness-2026-04-30.md:1](../../docs/audits/mobile-release-readiness-2026-04-30.md#L1) |
| Audit Supabase TOK - 2026-06-19 | 52 | [docs/audits/supabase-audit-2026-06-19.md:1](../../docs/audits/supabase-audit-2026-06-19.md#L1) |
| 20260531 Actualites Sponsored Posts | 0 | [docs/ci-triggers/20260531-actualites-sponsored-posts.md:1](../../docs/ci-triggers/20260531-actualites-sponsored-posts.md#L1) |
| TOK — Argumentaire commercial restaurateurs | 27 | [docs/commercial/tok-argumentaire-commerciaux.md:1](../../docs/commercial/tok-argumentaire-commerciaux.md#L1) |
| Déploiement — carte commerciale TheFork Genève | 1 | [docs/deployments/2026-07-24-commercial-map-thefork-520.md:1](../../docs/deployments/2026-07-24-commercial-map-thefork-520.md#L1) |
| Plan de salle — placement des réservations | 10 | [docs/design/plan-de-salle-placement.md:1](../../docs/design/plan-de-salle-placement.md#L1) |
| Plan de salle — thème clair / sombre | 9 | [docs/design/plan-de-salle-theme.md:1](../../docs/design/plan-de-salle-theme.md#L1) |
| Fabrication des assets | 4 | [docs/design/tok-launch/ASSETS.md:1](../../docs/design/tok-launch/ASSETS.md#L1) |
| TOK — Affiche animée et décompte de lancement | 6 | [docs/design/tok-launch/README.md:1](../../docs/design/tok-launch/README.md#L1) |
| TOK — Proposition UX/UI du 10 octobre 2026 | 12 | [docs/design/tok-ux-ui-audit-20261010.md:1](../../docs/design/tok-ux-ui-audit-20261010.md#L1) |
| Modèle économique restaurateur — hypothèses | 8 | [docs/fair-growth-business-model.md:1](../../docs/fair-growth-business-model.md#L1) |
| Intégration de `marketing.thetok.ch` | 9 | [docs/implementation/MARKETING_SUBDOMAIN_INTEGRATION.md:1](../../docs/implementation/MARKETING_SUBDOMAIN_INTEGRATION.md#L1) |
| Audit de candidature — TOK comme fournisseur de réservation Google | 11 | [docs/integrations/google-actions-center-audit.md:1](../../docs/integrations/google-actions-center-audit.md#L1) |
| Google Actions Center / Reserve with Google | 10 | [docs/integrations/google-actions-center.md:1](../../docs/integrations/google-actions-center.md#L1) |
| Conditions générales clients TOK | 12 | [docs/legal/01-cgv-cgu-clients.md:1](../../docs/legal/01-cgv-cgu-clients.md#L1) |
| Contrat-cadre restaurateur TOK | 12 | [docs/legal/02-contrat-restaurateur.md:1](../../docs/legal/02-contrat-restaurateur.md#L1) |
| Abonnements, réservations et commissions TOK | 7 | [docs/legal/03-abonnements-commissions.md:1](../../docs/legal/03-abonnements-commissions.md#L1) |
| Contrat partenaire TOK Connect / API | 9 | [docs/legal/04-tok-connect-api.md:1](../../docs/legal/04-tok-connect-api.md#L1) |
| Contrat coursier et grille d’analyse du statut | 8 | [docs/legal/05-contrat-coursier-statut.md:1](../../docs/legal/05-contrat-coursier-statut.md#L1) |
| Politique d’annulation, remboursement, no-show et chargeback | 9 | [docs/legal/06-annulation-remboursement-no-show-chargeback.md:1](../../docs/legal/06-annulation-remboursement-no-show-chargeback.md#L1) |
| Règles Miamz et Miamz solidaires | 8 | [docs/legal/07-miamz-solidaires.md:1](../../docs/legal/07-miamz-solidaires.md#L1) |
| Règles des ventes flash et offres anti-gaspi | 7 | [docs/legal/08-ventes-flash-anti-gaspi.md:1](../../docs/legal/08-ventes-flash-anti-gaspi.md#L1) |
| Licence sur les images, menus, marques et contenus des restaurants | 8 | [docs/legal/09-licence-contenus-restaurants.md:1](../../docs/legal/09-licence-contenus-restaurants.md#L1) |
| Répartition des responsabilités — prix, disponibilité, allergènes et qualité | 3 | [docs/legal/10-responsabilites-produits.md:1](../../docs/legal/10-responsabilites-produits.md#L1) |
| Pack contractuel TOK | 3 | [docs/legal/README.md:1](../../docs/legal/README.md#L1) |
| Pistes de backlinks TOK sans compte existant | 6 | [docs/marketing-backlink-opportunities.md:1](../../docs/marketing-backlink-opportunities.md#L1) |
| Audit du marketing automatique TOK — 8 octobre 2026 | 7 | [docs/marketing/TOK_MARKETING_AUDIT_2026-10-08.md:1](../../docs/marketing/TOK_MARKETING_AUDIT_2026-10-08.md#L1) |
| TOK Marketing Autopilot — runbook d'exploitation | 13 | [docs/marketing/TOK_MARKETING_AUTOPILOT_RUNBOOK.md:1](../../docs/marketing/TOK_MARKETING_AUTOPILOT_RUNBOOK.md#L1) |
| Marketing : session, recherche de sources et diagnostic Meta | 5 | [docs/marketing/TOK_MARKETING_SESSION_DISCOVERY_2026-10-09.md:1](../../docs/marketing/TOK_MARKETING_SESSION_DISCOVERY_2026-10-09.md#L1) |
| Revue Mobile Fullstack - 2026-03-29 | 25 | [docs/mobile-fullstack-review-2026-03-29.md:1](../../docs/mobile-fullstack-review-2026-03-29.md#L1) |
| Cloudprinter : formats de génération et d’impression | 5 | [docs/operations/CLOUDPRINTER_FORMAT_MAPPING.md:1](../../docs/operations/CLOUDPRINTER_FORMAT_MAPPING.md#L1) |
| TOK Intelligence Suite — Campaign Studio, Customer Memory, Support & Resolution, Guardian | 11 | [docs/operations/TOK_INTELLIGENCE_SUITE.md:1](../../docs/operations/TOK_INTELLIGENCE_SUITE.md#L1) |
| TOK — intelligence d’incident unifiée | 11 | [docs/operations/incident-intelligence-unification.md:1](../../docs/operations/incident-intelligence-unification.md#L1) |
| Préparation des PR — IA, catalogue fournisseur et incidents | 8 | [docs/operations/pr-readiness-2026-07-28.md:1](../../docs/operations/pr-readiness-2026-07-28.md#L1) |
| TOK — incidents Telegram avec réparation Codex approuvée | 17 | [docs/operations/telegram-codex-incidents.md:1](../../docs/operations/telegram-codex-incidents.md#L1) |
| Projet — Finalisation de TOK Marketing Autopilot | 29 | [docs/projects/TOK_MARKETING_AUTOPILOT_COMPLETION.md:1](../../docs/projects/TOK_MARKETING_AUTOPILOT_COMPLETION.md#L1) |
| OpenAI dans la démonstration commerciale | 6 | [docs/runbooks/commercial-demo-ai.md:1](../../docs/runbooks/commercial-demo-ai.md#L1) |
| Simulateur de paiement — démonstration commerciale TOK | 4 | [docs/runbooks/commercial-demo-payment-simulator.md:1](../../docs/runbooks/commercial-demo-payment-simulator.md#L1) |
| Local Git Auto Sync | 4 | [docs/runbooks/local-git-auto-sync.md:1](../../docs/runbooks/local-git-auto-sync.md#L1) |
| Hébergement des associations mobiles | 3 | [docs/runbooks/mobile-association-hosting.md:1](../../docs/runbooks/mobile-association-hosting.md#L1) |
| Runbook release production securisee | 8 | [docs/runbooks/production-release-readiness.md:1](../../docs/runbooks/production-release-readiness.md#L1) |
| Runbook Stripe et reconciliation financiere | 8 | [docs/runbooks/stripe-financial-ops.md:1](../../docs/runbooks/stripe-financial-ops.md#L1) |
| Protection SEO et anti-scraping de TOK | 10 | [docs/security/SEO_BOT_PROTECTION_RUNBOOK.md:1](../../docs/security/SEO_BOT_PROTECTION_RUNBOOK.md#L1) |
| Tok audit readiness — plan 10/10 | 5 | [docs/security/audit-readiness-10-10.md:1](../../docs/security/audit-readiness-10-10.md#L1) |
| Audit d’intégrité des paiements — 15 juillet 2026 | 15 | [docs/security/payment-integrity-audit-2026-07-15.md:1](../../docs/security/payment-integrity-audit-2026-07-15.md#L1) |
| Audit SEO complet TOK — 28 juillet 2026 | 25 | [docs/seo/SEO_AUDIT_2026-07-28.md:1](../../docs/seo/SEO_AUDIT_2026-07-28.md#L1) |
| Réunification des communes scindées par une variante d'orthographe — 2 septembre 2026 | 10 | [docs/seo/SEO_IDENTITE_COMMUNE_2026-09-02.md:1](../../docs/seo/SEO_IDENTITE_COMMUNE_2026-09-02.md#L1) |
| Audit indexation et correctifs SEO — 2 septembre 2026 | 15 | [docs/seo/SEO_INDEXATION_2026-09-02.md:1](../../docs/seo/SEO_INDEXATION_2026-09-02.md#L1) |
| TOK : déduplication des lieux Stoppin et redirections — 20 septembre 2026 | 7 | [docs/seo/SEO_SEARCH_CONSOLE_2026-09-20.md:1](../../docs/seo/SEO_SEARCH_CONSOLE_2026-09-20.md#L1) |
| TOK IDE Skills | 5 | [docs/skills/README.md:1](../../docs/skills/README.md#L1) |
| TOK Admin Support Skill | 6 | [docs/skills/TOK_ADMIN_SUPPORT_SKILL.md:1](../../docs/skills/TOK_ADMIN_SUPPORT_SKILL.md#L1) |
| TOK Application Skill File | 26 | [docs/skills/TOK_APPLICATION_SKILL.md:1](../../docs/skills/TOK_APPLICATION_SKILL.md#L1) |
| TOK Global Rules | 5 | [docs/skills/TOK_GLOBAL_RULES.md:1](../../docs/skills/TOK_GLOBAL_RULES.md#L1) |
| TOK Media and AI Skill | 5 | [docs/skills/TOK_MEDIA_AI_SKILL.md:1](../../docs/skills/TOK_MEDIA_AI_SKILL.md#L1) |
| TOK Notifications Skill | 5 | [docs/skills/TOK_NOTIFICATIONS_SKILL.md:1](../../docs/skills/TOK_NOTIFICATIONS_SKILL.md#L1) |
| TOK Payment Skill | 6 | [docs/skills/TOK_PAYMENT_SKILL.md:1](../../docs/skills/TOK_PAYMENT_SKILL.md#L1) |
| TOK Release Gatekeeper | 9 | [docs/skills/TOK_RELEASE_GATEKEEPER.md:1](../../docs/skills/TOK_RELEASE_GATEKEEPER.md#L1) |
| TOK Restaurant Operations Skill | 5 | [docs/skills/TOK_RESTAURANT_OPS_SKILL.md:1](../../docs/skills/TOK_RESTAURANT_OPS_SKILL.md#L1) |
| TOK Scale Readiness Skill | 5 | [docs/skills/TOK_SCALE_READINESS_SKILL.md:1](../../docs/skills/TOK_SCALE_READINESS_SKILL.md#L1) |
| TOK SEO Skill | 6 | [docs/skills/TOK_SEO_SKILL.md:1](../../docs/skills/TOK_SEO_SKILL.md#L1) |
| TOK Supabase RLS Skill | 5 | [docs/skills/TOK_SUPABASE_RLS_SKILL.md:1](../../docs/skills/TOK_SUPABASE_RLS_SKILL.md#L1) |
| TOK Testing Skill | 10 | [docs/skills/TOK_TESTING_SKILL.md:1](../../docs/skills/TOK_TESTING_SKILL.md#L1) |
| Audit SECURITY DEFINER executable by anon | 5 | [docs/supabase/anon-security-definer-audit.md:1](../../docs/supabase/anon-security-definer-audit.md#L1) |
| Reservation Billing & Anti-Fraud Dashboard Implementation Plan | 12 | [docs/superpowers/plans/2026-04-17-reservation-billing.md:1](../../docs/superpowers/plans/2026-04-17-reservation-billing.md#L1) |
| Compta Home + Inflows/Outflows Implementation Plan | 11 | [docs/superpowers/plans/2026-04-21-compta-home-inflows-outflows.md:1](../../docs/superpowers/plans/2026-04-21-compta-home-inflows-outflows.md#L1) |
| Dashboard Readability Implementation Plan | 13 | [docs/superpowers/plans/2026-04-21-dashboard-readability.md:1](../../docs/superpowers/plans/2026-04-21-dashboard-readability.md#L1) |
| Compta campagnes pub et Tok One - Implementation Plan | 9 | [docs/superpowers/plans/2026-04-22-compta-campaigns-tok-one.md:1](../../docs/superpowers/plans/2026-04-22-compta-campaigns-tok-one.md#L1) |
| Dashboard restaurateur - commandes anti-gaspi et ventes flash - Implementation Plan | 11 | [docs/superpowers/plans/2026-04-22-dashboard-commandes-special-orders.md:1](../../docs/superpowers/plans/2026-04-22-dashboard-commandes-special-orders.md#L1) |
| Invoice Line Details Implementation Plan | 11 | [docs/superpowers/plans/2026-04-22-invoice-line-details.md:1](../../docs/superpowers/plans/2026-04-22-invoice-line-details.md#L1) |
| Plan d'implémentation Plan De Salle Structure | 6 | [docs/superpowers/plans/2026-04-22-plan-salle-structure-studio-implementation.md:1](../../docs/superpowers/plans/2026-04-22-plan-salle-structure-studio-implementation.md#L1) |
| Annulation avec remboursement (restaurateur + admin) & nettoyage Miamz — Plan d'implémentation | 31 | [docs/superpowers/plans/2026-04-25-cancellation-refund-and-miamz-cleanup.md:1](../../docs/superpowers/plans/2026-04-25-cancellation-refund-and-miamz-cleanup.md#L1) |
| Uber/TheFork Readiness Implementation Plan | 21 | [docs/superpowers/plans/2026-05-25-uber-thefork-readiness.md:1](../../docs/superpowers/plans/2026-05-25-uber-thefork-readiness.md#L1) |
| Abonnements Entitlements Implementation Plan | 14 | [docs/superpowers/plans/2026-05-26-abonnements-entitlements.md:1](../../docs/superpowers/plans/2026-05-26-abonnements-entitlements.md#L1) |
| Parcours d'inscription durci — Implementation Plan | 12 | [docs/superpowers/plans/2026-05-30-parcours-inscription.md:1](../../docs/superpowers/plans/2026-05-30-parcours-inscription.md#L1) |
| TOK Global Application Audit Implementation Plan | 9 | [docs/superpowers/plans/2026-06-05-global-application-audit.md:1](../../docs/superpowers/plans/2026-06-05-global-application-audit.md#L1) |
| Audit Remediation Consolidation Implementation Plan | 6 | [docs/superpowers/plans/2026-09-04-audit-remediation.md:1](../../docs/superpowers/plans/2026-09-04-audit-remediation.md#L1) |
| Restaurant Image Truth and Catalog Backfill Implementation Plan | 6 | [docs/superpowers/plans/2026-09-04-restaurant-image-truth-backfill.md:1](../../docs/superpowers/plans/2026-09-04-restaurant-image-truth-backfill.md#L1) |
| TOK notifications, AI and admin hardening plan | 9 | [docs/superpowers/plans/2026-09-07-notifications-ai-admin-hardening.md:1](../../docs/superpowers/plans/2026-09-07-notifications-ai-admin-hardening.md#L1) |
| TOK SEO & Performance Remediation Implementation Plan | 10 | [docs/superpowers/plans/2026-09-07-seo-performance-remediation.md:1](../../docs/superpowers/plans/2026-09-07-seo-performance-remediation.md#L1) |
| TheTok Print + Cloudprinter Implementation Plan | 16 | [docs/superpowers/plans/2026-09-07-thetok-cloudprinter-print.md:1](../../docs/superpowers/plans/2026-09-07-thetok-cloudprinter-print.md#L1) |
| Commercial Demo Multi-Space Fidelity Implementation Plan | 7 | [docs/superpowers/plans/2026-09-08-commercial-demo-multispace-fidelity.md:1](../../docs/superpowers/plans/2026-09-08-commercial-demo-multispace-fidelity.md#L1) |
| Marketing Studio Output Geometry Implementation Plan | 8 | [docs/superpowers/plans/2026-09-08-marketing-studio-output-geometry.md:1](../../docs/superpowers/plans/2026-09-08-marketing-studio-output-geometry.md#L1) |
| Admin TheFork-only filter plan | 1 | [docs/superpowers/plans/2026-09-15-admin-thefork-only-filter.md:1](../../docs/superpowers/plans/2026-09-15-admin-thefork-only-filter.md#L1) |
| Refonte TOK — application réelle en preview | 8 | [docs/superpowers/plans/2026-10-10-tok-ui-ux-preview.md:1](../../docs/superpowers/plans/2026-10-10-tok-ui-ux-preview.md#L1) |
| Facturation des réservations (5.-/resa) & détection anti-fraude | 26 | [docs/superpowers/specs/2026-04-17-reservation-billing-design.md:1](../../docs/superpowers/specs/2026-04-17-reservation-billing-design.md#L1) |
| Refonte compta: accueil + entrees/sorties | 52 | [docs/superpowers/specs/2026-04-21-compta-home-inflows-outflows-design.md:1](../../docs/superpowers/specs/2026-04-21-compta-home-inflows-outflows-design.md#L1) |
| Lisibilite dashboard: factures, reservations et commandes | 39 | [docs/superpowers/specs/2026-04-21-dashboard-readability-design.md:1](../../docs/superpowers/specs/2026-04-21-dashboard-readability-design.md#L1) |
| Comptabilite TOK - campagnes publicitaires et abonnements Tok One | 32 | [docs/superpowers/specs/2026-04-22-compta-campaigns-tok-one-design.md:1](../../docs/superpowers/specs/2026-04-22-compta-campaigns-tok-one-design.md#L1) |
| Dashboard restaurateur — commandes anti-gaspi et ventes flash | 27 | [docs/superpowers/specs/2026-04-22-dashboard-commandes-special-orders-design.md:1](../../docs/superpowers/specs/2026-04-22-dashboard-commandes-special-orders-design.md#L1) |
| Factures compta - detail complet des lignes | 42 | [docs/superpowers/specs/2026-04-22-invoice-line-details-design.md:1](../../docs/superpowers/specs/2026-04-22-invoice-line-details-design.md#L1) |
| Refonte Plan De Salle Structure: studio simplifie et visuel | 58 | [docs/superpowers/specs/2026-04-22-plan-salle-structure-studio-design.md:1](../../docs/superpowers/specs/2026-04-22-plan-salle-structure-studio-design.md#L1) |
| Refonte Plan De Table Tablette: service-first | 67 | [docs/superpowers/specs/2026-04-22-plan-salle-tablette-design.md:1](../../docs/superpowers/specs/2026-04-22-plan-salle-tablette-design.md#L1) |
| Social Preview Image Design | 9 | [docs/superpowers/specs/2026-04-22-social-preview-image-design.md:1](../../docs/superpowers/specs/2026-04-22-social-preview-image-design.md#L1) |
| Refonte Plan De Salle Studio: mobilier, labels et resize | 53 | [docs/superpowers/specs/2026-04-23-plan-salle-studio-mobilier-design.md:1](../../docs/superpowers/specs/2026-04-23-plan-salle-studio-mobilier-design.md#L1) |
| Annulation avec remboursement (restaurateur + admin) & nettoyage Miamz | 45 | [docs/superpowers/specs/2026-04-25-cancellation-refund-and-miamz-cleanup-design.md:1](../../docs/superpowers/specs/2026-04-25-cancellation-refund-and-miamz-cleanup-design.md#L1) |
| Dashboard Performances Dual Surface Design | 30 | [docs/superpowers/specs/2026-04-25-dashboard-performances-dual-surface-design.md:1](../../docs/superpowers/specs/2026-04-25-dashboard-performances-dual-surface-design.md#L1) |
| Geneva Demo Restaurants Design | 12 | [docs/superpowers/specs/2026-04-25-geneva-demo-restaurants-design.md:1](../../docs/superpowers/specs/2026-04-25-geneva-demo-restaurants-design.md#L1) |
| Actualites sociales - parametres et promotions | 38 | [docs/superpowers/specs/2026-05-25-social-actualites-settings-promotions-design.md:1](../../docs/superpowers/specs/2026-05-25-social-actualites-settings-promotions-design.md#L1) |
| Abonnements Et Entitlements Design | 17 | [docs/superpowers/specs/2026-05-26-abonnements-entitlements-design.md:1](../../docs/superpowers/specs/2026-05-26-abonnements-entitlements-design.md#L1) |
| Parcours d'inscription — durcissement (client, restaurateur, livreur) | 24 | [docs/superpowers/specs/2026-05-30-parcours-inscription-design.md:1](../../docs/superpowers/specs/2026-05-30-parcours-inscription-design.md#L1) |
| Marketing Studio Output Geometry Design | 15 | [docs/superpowers/specs/2026-09-08-marketing-studio-output-geometry-design.md:1](../../docs/superpowers/specs/2026-09-08-marketing-studio-output-geometry-design.md#L1) |
| Actualités — identité des événements facturables | 5 | [docs/testing/actualites-billing-identity.md:1](../../docs/testing/actualites-billing-identity.md#L1) |
| Scénario Actualités sponsorisées | 5 | [docs/testing/actualites-sponsored-scenario.md:1](../../docs/testing/actualites-sponsored-scenario.md#L1) |
| Télémétrie navigateur et consentement | 5 | [docs/testing/browser-monitoring-consent.md:1](../../docs/testing/browser-monitoring-consent.md#L1) |
| Recette de sécurité checkout et menus — issue #710 | 8 | [docs/testing/checkout-security-710.md:1](../../docs/testing/checkout-security-710.md#L1) |
| Plan de tests lancement 10k | 6 | [docs/testing/launch-10k-load-plan.md:1](../../docs/testing/launch-10k-load-plan.md#L1) |
| Tests de garde Supabase / RPC | 7 | [docs/testing/supabase-rpc-guards.md:1](../../docs/testing/supabase-rpc-guards.md#L1) |
| TOK Connect | 18 | [docs/tok-connect/README.md:1](../../docs/tok-connect/README.md#L1) |
| TOK Connect Remote MCP | 9 | [docs/tok-connect/REMOTE_MCP.md:1](../../docs/tok-connect/REMOTE_MCP.md#L1) |
| TOK Connect Full App MCP (surface historique interne) | 9 | [docs/tok-connect/full-app-mcp.md:1](../../docs/tok-connect/full-app-mcp.md#L1) |
| Espace Comptabilité Administrateur | 11 | [implementation_plan_compta.md:1](../../implementation_plan_compta.md#L1) |
| Refonte de la Facturation avec Suivi des Commandes | 11 | [implementation_plan_invoice_refactor.md:1](../../implementation_plan_invoice_refactor.md#L1) |
| CapApp-SPM | 1 | [ios/App/CapApp-SPM/README.md:1](../../ios/App/CapApp-SPM/README.md#L1) |
| Security Best Practices Audit Report | 24 | [security_best_practices_report.md:1](../../security_best_practices_report.md#L1) |
| Tâches - Module Comptabilité Administrateur | 1 | [task_compta.md:1](../../task_compta.md#L1) |
| Tâches - Facturation au réel TOK | 1 | [task_invoice_match.md:1](../../task_invoice_match.md#L1) |
| Implémentation du Module Comptabilité Administration (Réconciliation) & Facturation au Réel | 3 | [walkthrough_compta.md:1](../../walkthrough_compta.md#L1) |
| Worker d’analyse d’images TOK — 100 % local | 8 | [workers/image-ai-worker/README.md:1](../../workers/image-ai-worker/README.md#L1) |

## Inventaire exhaustif des fichiers versionnés

Cet inventaire assure qu’aucun composant du dépôt n’est invisible dans l’index. Les contenus binaires ne sont pas analysés, mais leur chemin et leur catégorie sont recherchables.

<details><summary>android (56)</summary>

- `android/.gitignore`
- `android/app/.gitignore`
- `android/app/build.gradle`
- `android/app/capacitor.build.gradle`
- `android/app/google-services.json`
- `android/app/proguard-rules.pro`
- `android/app/src/androidTest/java/com/tok/app/ExampleInstrumentedTest.java`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/tok/app/MainActivity.java`
- `android/app/src/main/res/drawable-land-hdpi/splash.png`
- `android/app/src/main/res/drawable-land-mdpi/splash.png`
- `android/app/src/main/res/drawable-land-xhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-land-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-hdpi/splash.png`
- `android/app/src/main/res/drawable-port-mdpi/splash.png`
- `android/app/src/main/res/drawable-port-xhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png`
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- `android/app/src/main/res/drawable/ic_launcher_background.xml`
- `android/app/src/main/res/drawable/splash.png`
- `android/app/src/main/res/layout/activity_main.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`
- `android/app/src/main/res/values/ic_launcher_background.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/values/styles.xml`
- `android/app/src/main/res/xml/data_extraction_rules.xml`
- `android/app/src/main/res/xml/file_paths.xml`
- `android/app/src/test/java/com/tok/app/ExampleUnitTest.java`
- `android/build.gradle`
- `android/capacitor.settings.gradle`
- `android/gradle.properties`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/gradlew`
- `android/gradlew.bat`
- `android/keystore.properties.example`
- `android/settings.gradle`
- `android/variables.gradle`

</details>

<details><summary>application-library (204)</summary>

- `src/lib/accountingExports.ts`
- `src/lib/actualitesFeedOrdering.ts`
- `src/lib/actualitesPersonalizedTrends.ts`
- `src/lib/admin/auditLogNarrative.ts`
- `src/lib/adminComptaActions.ts`
- `src/lib/adminDomains.ts`
- `src/lib/ai/accountingPublicCopy.ts`
- `src/lib/ai/aiCreationJobs.ts`
- `src/lib/ai/dailyDishAi.ts`
- `src/lib/ai/generationSeed.ts`
- `src/lib/ai/imagePricing.ts`
- `src/lib/ai/restaurantGallery.ts`
- `src/lib/ai/restaurantMediaMetadata.ts`
- `src/lib/ai/supportText.ts`
- `src/lib/ai/tokAiClient.ts`
- `src/lib/ai/tokAiClientMarketingOutputShell.ts`
- `src/lib/analytics.ts`
- `src/lib/auth-context.ts`
- `src/lib/auth.tsx`
- `src/lib/authDomains.ts`
- `src/lib/authPostLogin.ts`
- `src/lib/authRedirect.ts`
- `src/lib/backNavigation.ts`
- `src/lib/businessTime.ts`
- `src/lib/campaignCreative.ts`
- `src/lib/campaignPricing.ts`
- `src/lib/campaignTargeting.ts`
- `src/lib/campaignVisibility.ts`
- `src/lib/campaigns.ts`
- `src/lib/capacitor-init.ts`
- `src/lib/captcha.ts`
- `src/lib/cart-context.ts`
- `src/lib/cart.tsx`
- `src/lib/cartRestaurantSummary.ts`
- `src/lib/cartSuggestions.ts`
- `src/lib/catalogQuality.ts`
- `src/lib/chartStyleSecurity.ts`
- `src/lib/checkoutReturnUrl.ts`
- `src/lib/commercialContract.ts`
- `src/lib/commercialDemoAi.ts`
- `src/lib/commercialDemoClientCatalog.ts`
- `src/lib/commercialDemoClientRoutes.ts`
- `src/lib/commercialDemoDate.ts`
- `src/lib/commercialDemoEffects.ts`
- `src/lib/commercialDemoFrame.ts`
- `src/lib/commercialDemoHostSecurity.ts`
- `src/lib/commercialDemoJourney.ts`
- `src/lib/commercialDemoLogins.ts`
- `src/lib/commercialDemoProject.ts`
- `src/lib/commercialDemoRealtime.ts`
- `src/lib/commercialDemoRestaurantScope.ts`
- `src/lib/commercialDemoRestaurantTools.ts`
- `src/lib/commercialDomains.ts`
- `src/lib/commercialProspectionMarkerTheme.ts`
- `src/lib/commercialSales.ts`
- `src/lib/comptaCommissionSources.ts`
- `src/lib/comptaFlow.ts`
- `src/lib/consent.ts`
- `src/lib/constants.ts`
- `src/lib/contact.ts`
- `src/lib/cookieInventory.ts`
- `src/lib/courier.ts`
- `src/lib/courierMission.ts`
- `src/lib/crmMfa.ts`
- `src/lib/customerCrm.ts`
- `src/lib/customerOrders.ts`
- `src/lib/dashboardGrouping.ts`
- `src/lib/dashboardIllustrations.ts`
- `src/lib/dashboardInvoices.ts`
- `src/lib/dashboardNotificationBadges.ts`
- `src/lib/dashboardOrderTypes.ts`
- `src/lib/dashboardPayments.ts`
- `src/lib/dashboardPerformance.ts`
- `src/lib/dashboardTimeRange.ts`
- `src/lib/deep-links.ts`
- `src/lib/deliveryProof.ts`
- `src/lib/deliveryRoute.ts`
- `src/lib/deliverySlots.ts`
- `src/lib/demoWorkspaces.ts`
- `src/lib/dispatchHealth.ts`
- `src/lib/email-service.ts`
- `src/lib/env.ts`
- `src/lib/fairGrowth.ts`
- `src/lib/featureCatalog.ts`
- `src/lib/featureFlags.ts`
- `src/lib/featureVisibility.ts`
- `src/lib/financialHealth.ts`
- `src/lib/floorPlan.ts`
- `src/lib/floorPlanFrameScheduler.ts`
- `src/lib/floorPlanHealth.ts`
- `src/lib/floorPlanHistory.ts`
- `src/lib/floorPlanPersistence.ts`
- `src/lib/geo.ts`
- `src/lib/geolocation-native.ts`
- `src/lib/googleBusinessBooking.ts`
- `src/lib/googleBusinessEconomics.ts`
- `src/lib/googleBusinessServiceScope.ts`
- `src/lib/guaranteedDeliveryCart.ts`
- `src/lib/helpChat.ts`
- `src/lib/homeRestaurantDiscovery.ts`
- `src/lib/invoicePresentation.ts`
- `src/lib/iosCommerceFetch.ts`
- `src/lib/launchGate.ts`
- `src/lib/launchPacks.ts`
- `src/lib/legalDocuments.ts`
- `src/lib/lifecycleSegments.ts`
- `src/lib/listSorting.ts`
- `src/lib/loyaltyBenefits.ts`
- `src/lib/marketing/imageOutput.ts`
- `src/lib/marketing/outputGeometry.ts`
- `src/lib/marketing/outputSession.ts`
- `src/lib/marketingDomains.ts`
- `src/lib/marketplaceLiquidity.ts`
- `src/lib/meal-formulas.ts`
- `src/lib/mealSubscription.ts`
- `src/lib/mealSubscriptionAvailability.ts`
- `src/lib/media/downloadImageWithWatermark.ts`
- `src/lib/media/socialMediaCompression.ts`
- `src/lib/menu-item-images.ts`
- `src/lib/mobile-domains.ts`
- `src/lib/monitoring.ts`
- `src/lib/nativeOAuth.ts`
- `src/lib/navigation.ts`
- `src/lib/nearbyRestaurants.ts`
- `src/lib/newsletterTemplates.ts`
- `src/lib/notificationDispatch.ts`
- `src/lib/notificationRouting.ts`
- `src/lib/optimizedImages.ts`
- `src/lib/orderConfirmation.ts`
- `src/lib/orderMutations.ts`
- `src/lib/orderStatus.ts`
- `src/lib/packFeatureGating.ts`
- `src/lib/passwordPolicy.ts`
- `src/lib/payableInvoice.ts`
- `src/lib/paymentAttempt.ts`
- `src/lib/paymentMethods.ts`
- `src/lib/platform.ts`
- `src/lib/print/checkout.ts`
- `src/lib/print/client.ts`
- `src/lib/print/document.ts`
- `src/lib/print/preflight.ts`
- `src/lib/print/quantity.ts`
- `src/lib/print/rendering.ts`
- `src/lib/privilegedSignupRecovery.ts`
- `src/lib/progressiveReservationOffers.ts`
- `src/lib/publicEnv.ts`
- `src/lib/publicErrorMessages.ts`
- `src/lib/publicFeatureMatrix.ts`
- `src/lib/push-native.ts`
- `src/lib/push-unified.ts`
- `src/lib/push.ts`
- `src/lib/queryLimits.ts`
- `src/lib/randomizedRestaurantOrder.ts`
- `src/lib/realtimeNotifications.ts`
- `src/lib/refundMutations.ts`
- `src/lib/refundSchemaCompat.ts`
- `src/lib/reservationAvailability.ts`
- `src/lib/reservationInventoryHealth.ts`
- `src/lib/reservationMutations.ts`
- `src/lib/restaurantAdjustments.ts`
- `src/lib/restaurantAdminState.ts`
- `src/lib/restaurantAmenities.ts`
- `src/lib/restaurantCategories.ts`
- `src/lib/restaurantMediaGovernance.ts`
- `src/lib/restaurantOnboardingLifecycle.ts`
- `src/lib/restaurantPartnerContract.ts`
- `src/lib/restaurantSlugs.ts`
- `src/lib/restaurantSubscriptionToolAccess.ts`
- `src/lib/roleAccess.ts`
- `src/lib/routing.ts`
- `src/lib/safePrintWindow.ts`
- `src/lib/searchRestaurantImages.ts`
- `src/lib/securityUrls.ts`
- `src/lib/seo/cityIdentity.d.mts`
- `src/lib/seo/cityIdentity.mjs`
- `src/lib/seo/restaurantEntity.d.mts`
- `src/lib/seo/restaurantEntity.mjs`
- `src/lib/serviceSettings.ts`
- `src/lib/session.ts`
- `src/lib/sessionCleanup.ts`
- `src/lib/signup.ts`
- `src/lib/socialCrossPosting.ts`
- `src/lib/socialFeed.ts`
- `src/lib/socialFeedVisibility.ts`
- `src/lib/socialRealtime.ts`
- `src/lib/specialOffers.ts`
- `src/lib/sponsoredAttribution.ts`
- `src/lib/sponsoredCampaignAi.ts`
- `src/lib/sponsoredPlacement.ts`
- `src/lib/statusLocks.ts`
- `src/lib/stripeReturn.ts`
- `src/lib/subscriptionCheckout.ts`
- `src/lib/subscriptionEntitlements.ts`
- `src/lib/support/contactSupport.ts`
- `src/lib/tokConnect.ts`
- `src/lib/tokConnectOpenApi.ts`
- `src/lib/tokCredits.ts`
- `src/lib/tokIntelligence.ts`
- `src/lib/tokLogo.ts`
- `src/lib/uploadSecurity.ts`
- `src/lib/usePaymentAttemptBackCancellation.ts`
- `src/lib/userFacingErrors.ts`
- `src/lib/utils.ts`
- `src/lib/zeroAttenteReservationContext.ts`

</details>

<details><summary>automation-script (71)</summary>

- `scripts/app-store-availability-submit-v5.mjs`
- `scripts/app-store-connect-finalize-v1.mjs`
- `scripts/app-store-connect-preflight.mjs`
- `scripts/app-store-connect-upload-screenshots.mjs`
- `scripts/app-store-review-account.mjs`
- `scripts/application-index-core.mjs`
- `scripts/apply-commercial-demo-migrations.mjs`
- `scripts/apply-stoppin-venue-redirects.mjs`
- `scripts/assert-production-supabase-target.mjs`
- `scripts/business-wiring-audit.mjs`
- `scripts/check-campaign-layout.mjs`
- `scripts/check-commercial-map.mjs`
- `scripts/ci-change-plan.mjs`
- `scripts/ci-critical-tests.mjs`
- `scripts/ci-migration-version-guard.mjs`
- `scripts/ci-pnpm-audit.sh`
- `scripts/codex-auto-post-edit-validation.mjs`
- `scripts/codex-auto-pre-edit.mjs`
- `scripts/ensure-supabase-auth-security.mjs`
- `scripts/ensure-supabase-auth-smtp.mjs`
- `scripts/frontend-10k-readiness.mjs`
- `scripts/generate-application-index.mjs`
- `scripts/generate-error-code-map.mjs`
- `scripts/git-auto-sync.ps1`
- `scripts/google-actions-center-export-feeds.mjs`
- `scripts/harden-directory-restaurant-seo.mjs`
- `scripts/harden-performance-delivery.mjs`
- `scripts/harden-seo-crawl.mjs`
- `scripts/harden-seo-directory-quality.mjs`
- `scripts/harden-seo-final-quality.mjs`
- `scripts/harden-seo-indexable-inventory.mjs`
- `scripts/harden-seo-inventory-consistency.mjs`
- `scripts/harden-seo-near-duplicates.mjs`
- `scripts/harden-seo-public-names.mjs`
- `scripts/harden-seo-restaurant-context.mjs`
- `scripts/harden-seo-trust-signals.mjs`
- `scripts/harden-seo-web-artifact-names.mjs`
- `scripts/import-marketing-prospect-coordinates.mjs`
- `scripts/install-codex-hooks.ps1`
- `scripts/install-git-auto-sync-task.ps1`
- `scripts/launch-10k-load-check.mjs`
- `scripts/lib/safe-public-fetch.mjs`
- `scripts/lib/stoppin-venue-dedupe.mjs`
- `scripts/mobile-android-build.ps1`
- `scripts/mobile-verify.mjs`
- `scripts/post-deploy-check.mjs`
- `scripts/prepare-ios-app-icon.sh`
- `scripts/prerender-seo.mjs`
- `scripts/prerender-stoppin-restaurants-bounded.mjs`
- `scripts/prerender-stoppin-restaurants.mjs`
- `scripts/release-readiness-core.mjs`
- `scripts/release-readiness.mjs`
- `scripts/resolve-live-stripe-publishable-key.mjs`
- `scripts/restaurant-image-safe-fetch-hook.mjs`
- `scripts/restaurant-image-truth-worker.mjs`
- `scripts/scale-readiness-check.mjs`
- `scripts/search-application-index.mjs`
- `scripts/supabase-ci-retry.sh`
- `scripts/supabase-db-push.mjs`
- `scripts/supabase-doctor.mjs`
- `scripts/supabase-target.mjs`
- `scripts/take-screenshots.mjs`
- `scripts/test-actualites-billing-postgres.mjs`
- `scripts/test-checkout-security-postgres.mjs`
- `scripts/test-print-protocol-postgres.mjs`
- `scripts/verify-supabase-runtime-security.mjs`
- `scripts/write-apple-app-site-association.mjs`
- `scripts/write-commercial-demo-secrets-env.mjs`
- `scripts/write-production-env.mjs`
- `scripts/write-production-supabase-keys-env.mjs`
- `scripts/write-supabase-secrets-env.mjs`

</details>

<details><summary>ci-workflow (27)</summary>

- `.github/workflows/_validation.yml`
- `.github/workflows/actualites-billing-postgres.yml`
- `.github/workflows/app-store-build3-trigger.yml`
- `.github/workflows/app-store-build4-trigger.yml`
- `.github/workflows/app-store-build5-icon-fix-trigger.yml`
- `.github/workflows/app-store-build6-logotok-trigger.yml`
- `.github/workflows/app-store-connect-preflight.yml`
- `.github/workflows/app-store-finalize-v1.yml`
- `.github/workflows/app-store-first-signed-build.yml`
- `.github/workflows/app-store-release.yml`
- `.github/workflows/app-store-screenshots.yml`
- `.github/workflows/app-store-submit-v5.yml`
- `.github/workflows/app-store-upload-build2-trigger.yml`
- `.github/workflows/app-store-xcode26-validation-trigger.yml`
- `.github/workflows/changed-test-files.yml`
- `.github/workflows/checkout-security-postgres.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/ensure-supabase-auth-smtp.yml`
- `.github/workflows/incident-codex-repair.yml`
- `.github/workflows/incident-monitor.yml`
- `.github/workflows/ios-native-validation.yml`
- `.github/workflows/prepare-logotok-app-icon.yml`
- `.github/workflows/print-protocol-postgres.yml`
- `.github/workflows/restaurant-image-truth-backfill.yml`
- `.github/workflows/sync-cloudprinter-secrets.yml`
- `.github/workflows/sync-incident-secrets.yml`

</details>

<details><summary>database-migration (526)</summary>

- `supabase/migrations/20260308174912_24a4f7b8-7291-401b-aa81-669264a5bbd2.sql`
- `supabase/migrations/20260308174933_9ab8b795-eeb6-45b1-90bc-dcc424e0750c.sql`
- `supabase/migrations/20260308175015_d089cd3a-79e4-45da-9a43-db36386961b3.sql`
- `supabase/migrations/20260308175103_dfc099a3-6826-4a75-a155-f32e3c7036e1.sql`
- `supabase/migrations/20260308175200_45d83c9c-e5f8-4817-b0b8-7248788c0117.sql`
- `supabase/migrations/20260308175209_c4bedbed-0ec5-48b4-91bd-71780de7dbd0.sql`
- `supabase/migrations/20260308210913_25c0e614-6971-4ff7-8bd9-fefe6d3027a7.sql`
- `supabase/migrations/20260309020210_e9cb423e-4bce-474e-b664-6e7f10cd51d1.sql`
- `supabase/migrations/20260309020227_b4db187d-422a-4fa6-9b83-b215a182bb34.sql`
- `supabase/migrations/20260309021628_f77a0b80-1674-491d-a32e-ec824934fc34.sql`
- `supabase/migrations/20260309021638_c2c39137-cec6-41a8-8570-0343b3def13e.sql`
- `supabase/migrations/20260309022824_36f66f8f-c8ba-4a61-afe8-b700f6dc1bdb.sql`
- `supabase/migrations/20260309022839_90eeed83-ec09-4e21-be6a-d4d0bbd65189.sql`
- `supabase/migrations/20260309024358_f4547c11-e404-450f-a47d-1b7f0466f713.sql`
- `supabase/migrations/20260309030216_6f0e0d0b-d8f4-42f6-8d63-2b3dee128846.sql`
- `supabase/migrations/20260309030839_ebfd9756-78cb-4daa-be6b-d81b1684c038.sql`
- `supabase/migrations/20260309035150_0d7a64a0-b667-4e85-87a6-d4fbda3c696d.sql`
- `supabase/migrations/20260309035221_5ea4c81a-7cb1-41a6-b785-2198d257d39d.sql`
- `supabase/migrations/20260309132514_e9dd6e9b-fcd1-4f11-9f41-f3136362aed7.sql`
- `supabase/migrations/20260310023835_b14ea06a-147c-4d23-8f53-6f18af772318.sql`
- `supabase/migrations/20260310032611_2160c3d3-7a63-4d29-93c5-3c3103ed3903.sql`
- `supabase/migrations/20260310032639_aac9ed25-7f2d-40c2-83ca-7a4155b6924b.sql`
- `supabase/migrations/20260310032756_eebbe5c2-2aca-4d66-8ad2-34818e438514.sql`
- `supabase/migrations/20260310035822_core_identity.sql`
- `supabase/migrations/20260310035927_restaurant_catalog.sql`
- `supabase/migrations/20260310040012_discovery_orders.sql`
- `supabase/migrations/20260310042712_security_rls_audit_fix.sql`
- `supabase/migrations/20260310044542_reload_schema_cache.sql`
- `supabase/migrations/20260310044645_grant_table_permissions.sql`
- `supabase/migrations/20260310051648_strict_rls_policies.sql`
- `supabase/migrations/20260310064000_rls_emergency_fix.sql`
- `supabase/migrations/20260310100000_courier_infrastructure.sql`
- `supabase/migrations/20260310100100_delivery_logistics.sql`
- `supabase/migrations/20260310100200_loyalty_reviews_data.sql`
- `supabase/migrations/20260310110000_allow_anon_tracking_inserts.sql`
- `supabase/migrations/20260311120000_atomic_stock_and_rls_hardening.sql`
- `supabase/migrations/20260311140000_seed_feature_flags.sql`
- `supabase/migrations/20260311150000_seed_geneva_restaurants.sql`
- `supabase/migrations/20260311153000_activate_all_admin_feature_flags.sql`
- `supabase/migrations/20260311165000_add_formulas_availability.sql`
- `supabase/migrations/20260311171000_assign_restaurants_to_rbarman.sql`
- `supabase/migrations/20260311200000_add_stripe_connect.sql`
- `supabase/migrations/20260311223000_admin_tools_functionality.sql`
- `supabase/migrations/20260311234500_split_service_settings_for_reservations.sql`
- `supabase/migrations/20260312000500_enable_public_restaurant_promotions.sql`
- `supabase/migrations/20260312003000_seed_restaurant_categories.sql`
- `supabase/migrations/20260312113000_ad_campaign_payments.sql`
- `supabase/migrations/20260312143000_secure_order_rpc_and_sponsored_tracking.sql`
- `supabase/migrations/20260312160000_search_audience_and_edge_audit.sql`
- `supabase/migrations/20260312183000_courier_dashboard_completion.sql`
- `supabase/migrations/20260312200000_delivery_proof_qr_dispatch.sql`
- `supabase/migrations/20260312213000_fix_courier_rls_and_order_tabs.sql`
- `supabase/migrations/20260312223000_delivery_scheduling_indexes.sql`
- `supabase/migrations/20260312223100_notification_system_completion.sql`
- `supabase/migrations/20260312233000_fix_dashboard_performance_consistency.sql`
- `supabase/migrations/20260312235900_fix_dashboard_performance_consistency.sql`
- `supabase/migrations/20260312235930_add_route_fields_to_order_dashboards.sql`
- `supabase/migrations/20260313010000_security_hardening_server_authority.sql`
- `supabase/migrations/20260321000000_fix_handle_new_user_role_assignment.sql`
- `supabase/migrations/20260322000000_add_disabled_payment_methods.sql`
- `supabase/migrations/20260322100000_campaign_pool_delivery.sql`
- `supabase/migrations/20260323000000_secure_feature_flags_admin.sql`
- `supabase/migrations/20260324021706_fix_estimate_campaign_audience_time.sql`
- `supabase/migrations/20260324030000_fix_restaurants_rls_isolation.sql`
- `supabase/migrations/20260329050000_harden_dashboard_and_loyalty_rpcs.sql`
- `supabase/migrations/20260329070000_add_restaurant_payment_history_rpc.sql`
- `supabase/migrations/20260329103000_add_signup_applications_and_verification.sql`
- `supabase/migrations/20260329110000_fix_admin_dispatch_notification_campaign_return_shape.sql`
- `supabase/migrations/20260329113000_add_safe_reservation_rpcs.sql`
- `supabase/migrations/20260329140000_fix_notification_pipeline_newsletter_column.sql`
- `supabase/migrations/20260330120000_global_feature_flag_enforcement.sql`
- `supabase/migrations/20260330184500_dashboard_floor_plan.sql`
- `supabase/migrations/20260330193000_floor_plan_daily_layout_overrides.sql`
- `supabase/migrations/20260331120000_improve_search_full_text.sql`
- `supabase/migrations/20260401060000_update_menu_item_images.sql`
- `supabase/migrations/20260402193000_fix_remaining_menu_item_images.sql`
- `supabase/migrations/20260404120000_launch_offer_packs.sql`
- `supabase/migrations/20260405120000_fix_zero_attente_null_opening_hours.sql`
- `supabase/migrations/20260405130000_include_zero_attente_revenue_in_performance.sql`
- `supabase/migrations/20260405140000_restaurant_dashboard_feature_gating.sql`
- `supabase/migrations/20260407193000_enable_rls_reservation_tables.sql`
- `supabase/migrations/20260407194000_linter_security_hardening.sql`
- `supabase/migrations/20260407195000_guest_child_rls_policies.sql`
- `supabase/migrations/20260407200000_rls_initplan_optimize.sql`
- `supabase/migrations/20260411191623_fix_admin_list_users_without_user_profiles.sql`
- `supabase/migrations/20260411200000_rate_limit_buckets.sql`
- `supabase/migrations/20260411200100_delete_user_gdpr_cascade.sql`
- `supabase/migrations/20260412103000_tok_one_subscription_compat_view.sql`
- `supabase/migrations/20260412211629_stripe_webhook_idempotency.sql`
- `supabase/migrations/20260412220000_enable_delivery_finance_rls.sql`
- `supabase/migrations/20260416010300_link_orders_and_reservations_to_invoices.sql`
- `supabase/migrations/20260416010318_generate_restaurant_payout_invoice_overloads.sql`
- `supabase/migrations/20260417120000_reservation_billing_schema.sql`
- `supabase/migrations/20260417120100_reservation_billing_rpcs.sql`
- `supabase/migrations/20260417180419_ensure_rls_event_trigger.sql`
- `supabase/migrations/20260418043243_lock_status_changes_after_cancellation_or_payment.sql`
- `supabase/migrations/20260418090000_separate_reservation_fee_invoices.sql`
- `supabase/migrations/20260418100000_extend_payout_invoice_to_all_paid_reservations.sql`
- `supabase/migrations/20260418110000_reservations_confirmed_at_trigger.sql`
- `supabase/migrations/20260418113000_add_unambiguous_payout_invoice_rpc.sql`
- `supabase/migrations/20260418113317_harden_function_search_path.sql`
- `supabase/migrations/20260418113419_restrict_public_bucket_listing.sql`
- `supabase/migrations/20260418113723_cleanup_dup_fk_and_index_hot_fks.sql`
- `supabase/migrations/20260418120000_submit_verified_review_rpc.sql`
- `supabase/migrations/20260418121500_fix_payment_history_invoice_directions.sql`
- `supabase/migrations/20260418130000_strengthen_reservation_billing_rule.sql`
- `supabase/migrations/20260418140000_zero_attente_idempotent_duplicate_check.sql`
- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql`
- `supabase/migrations/20260421110000_order_checkout_integrity_and_chefs_table.sql`
- `supabase/migrations/20260422124254_auto_disable_sold_out_special_offers.sql`
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql`
- `supabase/migrations/20260422180000_get_payout_invoice_lines.sql`
- `supabase/migrations/20260422193000_unified_payable_invoice.sql`
- `supabase/migrations/20260423232011_fix_apply_checkout_benefits_redeem_conflict.sql`
- `supabase/migrations/20260424120000_fix_reservation_accounting_periods.sql`
- `supabase/migrations/20260424234900_remote_history_alignment.sql`
- `supabase/migrations/20260425014839_campaign_hybrid_pricing.sql`
- `supabase/migrations/20260425021831_campaign_strategy_planner.sql`
- `supabase/migrations/20260425031533_chefs_table_checkout_idempotency.sql`
- `supabase/migrations/20260425130000_chef_table_drops_available_slots.sql`
- `supabase/migrations/20260425140000_chef_table_drops_drop_available_slots.sql`
- `supabase/migrations/20260425150000_chefs_table_reservation_confirmed_on_create.sql`
- `supabase/migrations/20260425160000_backfill_chefs_table_confirmed.sql`
- `supabase/migrations/20260425170000_standardize_order_reservation_references.sql`
- `supabase/migrations/20260425183000_restore_chefs_table_checkout_guards.sql`
- `supabase/migrations/20260425220000_seed_geneva_catalog_complete.sql`
- `supabase/migrations/20260425234500_delete_restaurants_res_fgfgfg.sql`
- `supabase/migrations/20260425235500_seed_quirinale_for_rbarman.sql`
- `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql`
- `supabase/migrations/20260426010000_refund_rpcs_and_queue.sql`
- `supabase/migrations/20260426013000_add_orders_cancelled_at_for_refunds.sql`
- `supabase/migrations/20260426120000_enable_subscription_features.sql`
- `supabase/migrations/20260518100000_enable_zero_attente_miamz.sql`
- `supabase/migrations/20260522030000_social_feed_restaurateurs.sql`
- `supabase/migrations/20260522075454_social_reactions_and_comment_threads.sql`
- `supabase/migrations/20260523022842_social_feed_v2.sql`
- `supabase/migrations/20260525090000_align_campaign_default_pricing.sql`
- `supabase/migrations/20260525205039_restore_dashboard_rpc_guards.sql`
- `supabase/migrations/20260525211157_notification_campaign_automation.sql`
- `supabase/migrations/20260526005419_reservation_slot_availability.sql`
- `supabase/migrations/20260526152736_security_audit_hardening.sql`
- `supabase/migrations/20260526162656_meal_subscription_status.sql`
- `supabase/migrations/20260526170535_tok_one_default_plan.sql`
- `supabase/migrations/20260527110835_fix_signup_moderation_flow.sql`
- `supabase/migrations/20260527133000_social_marketing_campaign_fields.sql`
- `supabase/migrations/20260527134055_allow_seated_reservation_status.sql`
- `supabase/migrations/20260530120000_signup_email_verification_drafts.sql`
- `supabase/migrations/20260530121000_schedule_email_worker.sql`
- `supabase/migrations/20260530133000_allow_multiple_meal_subscription_slots.sql`
- `supabase/migrations/20260531035500_fix_social_post_comments_recursive_policy.sql`
- `supabase/migrations/20260531121057_actualites_conversion_insights_hardening.sql`
- `supabase/migrations/20260531123000_social_post_promotions.sql`
- `supabase/migrations/20260531131500_actualites_metrics_hardening.sql`
- `supabase/migrations/20260531150500_actualites_weighted_rotation_and_conversion_attribution.sql`
- `supabase/migrations/20260531153732_security_rpc_grants_hardening.sql`
- `supabase/migrations/20260531162000_public_actualites_and_anonymous_tracking.sql`
- `supabase/migrations/20260531163500_prevent_restaurant_self_metrics.sql`
- `supabase/migrations/20260531163600_actualites_internal_actor_helper.sql`
- `supabase/migrations/20260531163700_actualites_internal_campaign_guard.sql`
- `supabase/migrations/20260531163800_ignore_internal_actualites_organic_metrics.sql`
- `supabase/migrations/20260531165000_payment_integrity_anomaly_rpc.sql`
- `supabase/migrations/20260531170500_support_incidents_foundation.sql`
- `supabase/migrations/20260531172000_match_group_lifecycle.sql`
- `supabase/migrations/20260531173500_match_group_auto_capture_fields.sql`
- `supabase/migrations/20260531174000_match_group_authorization_reconciliation.sql`
- `supabase/migrations/20260531174500_create_match_group_rpc.sql`
- `supabase/migrations/20260531182000_actualites_conversion_insights_hardening.sql`
- `supabase/migrations/20260531183000_security_rpc_grants_hardening.sql`
- `supabase/migrations/20260531185419_admin_review_courier_profiles.sql`
- `supabase/migrations/20260531190000_security_linter_hardening_and_core_cron.sql`
- `supabase/migrations/20260531191057_security_linter_hardening_and_core_cron.sql`
- `supabase/migrations/20260531213124_match_group_30_min_prepay_rules.sql`
- `supabase/migrations/20260531213500_revoke_anon_courier_review_rpc.sql`
- `supabase/migrations/20260601005703_admin_marketplace_alerts.sql`
- `supabase/migrations/20260601014500_admin_production_health.sql`
- `supabase/migrations/20260601020204_allow_internal_campaign_metric_writes.sql`
- `supabase/migrations/20260601031804_admin_actualites_sponsored_control.sql`
- `supabase/migrations/20260601035409_admin_restaurant_console_controls.sql`
- `supabase/migrations/20260601040827_admin_restaurant_notification_action.sql`
- `supabase/migrations/20260601041744_admin_users_governance_controls.sql`
- `supabase/migrations/20260601043333_admin_compta_governance_controls.sql`
- `supabase/migrations/20260601050626_admin_feature_flag_governance.sql`
- `supabase/migrations/20260601051105_admin_reviews_moderation_governance.sql`
- `supabase/migrations/20260601051641_admin_loyalty_tok_one_governance.sql`
- `supabase/migrations/20260601052044_admin_catalog_governance.sql`
- `supabase/migrations/20260601061258_remote_schema_history_placeholder.sql`
- `supabase/migrations/20260601232854_tok_ai_tools.sql`
- `supabase/migrations/20260602000907_tok_ai_platform.sql`
- `supabase/migrations/20260602033100_admin_period_control_no_throw.sql`
- `supabase/migrations/20260602043000_social_sync_and_rpc_security.sql`
- `supabase/migrations/20260602070000_restore_tok_ai_schema.sql`
- `supabase/migrations/20260602080000_tok_ai_runtime_hardening.sql`
- `supabase/migrations/20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql`
- `supabase/migrations/20260602120000_scale_readiness_indexes.sql`
- `supabase/migrations/20260602121000_order_acceptance_capacity_hardening.sql`
- `supabase/migrations/20260602122000_reservation_confirmation_deposit_ops.sql`
- `supabase/migrations/20260602123000_security_rpc_grants_hardening.sql`
- `supabase/migrations/20260602124000_security_abuse_monitoring_10k.sql`
- `supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql`
- `supabase/migrations/20260602230737_refresh_ai_schema_cache_contracts.sql`
- `supabase/migrations/20260603102000_allow_manual_signature_delivery_proof.sql`
- `supabase/migrations/20260603113000_fix_admin_set_user_roles_sorting.sql`
- `supabase/migrations/20260603114000_restore_special_offer_stock.sql`
- `supabase/migrations/20260603125000_seed_admin_operations_center_flag.sql`
- `supabase/migrations/20260603132000_pricing_and_stock_constraints.sql`
- `supabase/migrations/20260603143000_rls_policy_hardening.sql`
- `supabase/migrations/20260603151000_rls_generic_policy_audit.sql`
- `supabase/migrations/20260603170000_admin_notification_campaign_governance.sql`
- `supabase/migrations/20260603171000_restaurant_media_governance.sql`
- `supabase/migrations/20260603172000_tok_one_currency_chf.sql`
- `supabase/migrations/20260603224952_admin_dashboard_log_reset.sql`
- `supabase/migrations/20260604014500_restaurant_promotion_validation.sql`
- `supabase/migrations/20260604020500_admin_cuisine_governance.sql`
- `supabase/migrations/20260604023000_admin_chef_table_drop_governance.sql`
- `supabase/migrations/20260604025500_admin_launch_pack_governance.sql`
- `supabase/migrations/20260604031500_floor_plan_assignment_rpc.sql`
- `supabase/migrations/20260604034000_restaurant_special_offer_governance.sql`
- `supabase/migrations/20260604040500_zero_attente_checkout_hold.sql`
- `supabase/migrations/20260604042000_chef_table_checkout_holds.sql`
- `supabase/migrations/20260605003509_admin_alert_reconciliation.sql`
- `supabase/migrations/20260605024301_fix_admin_log_reset_safe_delete.sql`
- `supabase/migrations/20260605030232_broaden_admin_log_reset_report_scope.sql`
- `supabase/migrations/20260605033419_index_chat_support_incidents.sql`
- `supabase/migrations/20260605131641_admin_domain_and_advisor_hardening.sql`
- `supabase/migrations/20260605180050_wire_miamz_business_logic.sql`
- `supabase/migrations/20260605183251_tok_one_stripe_test_mode_support.sql`
- `supabase/migrations/20260606000500_social_post_media_bucket_hardening.sql`
- `supabase/migrations/20260606035714_repair_loyalty_tiers_status.sql`
- `supabase/migrations/20260607033000_platform_finance_sales_governance.sql`
- `supabase/migrations/20260607043000_launch_pack_ai_quotas.sql`
- `supabase/migrations/20260607044000_restaurant_slug_urls.sql`
- `supabase/migrations/20260607053000_scale_readiness_indexes_and_guards.sql`
- `supabase/migrations/20260607053100_plan2_fk_index_readiness.sql`
- `supabase/migrations/20260607053200_plan2_sensitive_rpc_execute_hardening.sql`
- `supabase/migrations/20260607054648_chef_table_vip_miamz_access.sql`
- `supabase/migrations/20260607063751_authenticated_security_audit_hardening.sql`
- `supabase/migrations/20260607065812_actualites_budget_pacing_delivery_score.sql`
- `supabase/migrations/20260607113000_actualites_saved_feed_and_personal_recommendations.sql`
- `supabase/migrations/20260607150000_accounting_refund_aligned_invoice_calculations.sql`
- `supabase/migrations/20260607170000_notification_recipient_isolation.sql`
- `supabase/migrations/20260607174951_actualites_multi_campaign_attribution.sql`
- `supabase/migrations/20260607203629_restaurant_google_booking_setup.sql`
- `supabase/migrations/20260607212249_seed_la_gazelle_dor_restaurant.sql`
- `supabase/migrations/20260607224120_link_la_gazelle_dor_to_rbarman.sql`
- `supabase/migrations/20260608030423_restaurant_review_response_workflow.sql`
- `supabase/migrations/20260608055014_fix_admin_restaurant_detail_payout_uuid.sql`
- `supabase/migrations/20260608060225_restaurant_admin_correction_requests.sql`
- `supabase/migrations/20260608061200_review_replies_author_type_split.sql`
- `supabase/migrations/20260608061215_restaurant_correction_done_admin_notification.sql`
- `supabase/migrations/20260608063500_admin_marketplace_alert_take_action.sql`
- `supabase/migrations/20260608144951_tok_one_vip_offer_notifications.sql`
- `supabase/migrations/20260613120000_restaurateur_pending_dashboard_access.sql`
- `supabase/migrations/20260613130000_auth_signup_role_routing.sql`
- `supabase/migrations/20260614103000_fix_privileged_signup_dossiers_and_roles.sql`
- `supabase/migrations/20260614234500_fix_signup_application_id_ambiguity.sql`
- `supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql`
- `supabase/migrations/20260615005145_restaurant_amenities.sql`
- `supabase/migrations/20260615012338_restaurant_billing_credit_usage.sql`
- `supabase/migrations/20260615024500_fix_signup_document_upsert_conflict_target.sql`
- `supabase/migrations/20260615025943_fix_signup_review_application_id_ambiguity.sql`
- `supabase/migrations/20260615031500_campaign_credit_packs.sql`
- `supabase/migrations/20260615033000_floor_plan_variants.sql`
- `supabase/migrations/20260615054500_restaurant_paid_tok_purchase_invoices.sql`
- `supabase/migrations/20260615070000_progressive_reservation_offers.sql`
- `supabase/migrations/20260615072206_meal_formula_service_limits.sql`
- `supabase/migrations/20260615082200_progressive_offer_service_scope.sql`
- `supabase/migrations/20260615084738_birthday_profiles_notifications_advisor_hardening.sql`
- `supabase/migrations/20260615095700_admin_dashboard_ai_chat_flag.sql`
- `supabase/migrations/20260615145022_reservation_service_capacity_totals.sql`
- `supabase/migrations/20260615184759_bill_cash_order_commissions.sql`
- `supabase/migrations/20260616061331_online_order_payment_confirmation_guard.sql`
- `supabase/migrations/20260616110000_actualites_sponsored_targeting_score.sql`
- `supabase/migrations/20260616123000_social_comment_reply_mentions.sql`
- `supabase/migrations/20260616164131_customer_crm_profiles.sql`
- `supabase/migrations/20260617013000_progressive_offer_daily_visibility.sql`
- `supabase/migrations/20260617110000_customer_crm_elite_mfa_gate.sql`
- `supabase/migrations/20260619234500_verified_review_submission_gate.sql`
- `supabase/migrations/20260620095406_miamz_solidarity_1000_points_per_meal.sql`
- `supabase/migrations/20260620121921_actualites_premium_banner_followers.sql`
- `supabase/migrations/20260621090000_disable_launch_packs.sql`
- `supabase/migrations/20260621090500_onboarding_subscription_only_gate.sql`
- `supabase/migrations/20260621120000_restaurant_partner_contracts.sql`
- `supabase/migrations/20260624223726_daily_miamz_slot_machine.sql`
- `supabase/migrations/20260625012621_ai_image_resolution_credit_pricing.sql`
- `supabase/migrations/20260625034551_daily_slot_three_attempts.sql`
- `supabase/migrations/20260625094000_canonicalize_legacy_public_image_urls.sql`
- `supabase/migrations/20260625133000_photo_ai_credit_units_from_estimated_cost.sql`
- `supabase/migrations/20260625150000_progressive_offer_reentry_lock.sql`
- `supabase/migrations/20260625163000_restaurant_media_ai_metadata.sql`
- `supabase/migrations/20260625170500_unified_tok_credits.sql`
- `supabase/migrations/20260626073000_harden_support_incident_message_authors.sql`
- `supabase/migrations/20260626101032_tok_connect_foundation.sql`
- `supabase/migrations/20260626111842_tok_connect_v1_1_operations.sql`
- `supabase/migrations/20260626143100_tok_connect_webhook_scheduler.sql`
- `supabase/migrations/20260626161540_stripe_webhook_processing_status.sql`
- `supabase/migrations/20260626164236_tok_connect_webhook_secret_column_grant.sql`
- `supabase/migrations/20260627104100_tok_connect_autopilot_governance.sql`
- `supabase/migrations/20260627161000_google_actions_center_foundation.sql`
- `supabase/migrations/20260630103000_restaurant_subscription_self_service.sql`
- `supabase/migrations/20260630131500_openai_x10_credit_pricing.sql`
- `supabase/migrations/20260630143000_gpt_image_2_medium_only_pricing.sql`
- `supabase/migrations/20260630155500_restaurant_subscription_ai_usage_quotas.sql`
- `supabase/migrations/20260630183000_premium_elite_crm_access.sql`
- `supabase/migrations/20260630192000_fix_tok_credit_recharge_wallet.sql`
- `supabase/migrations/20260703075901_add_commercial_role.sql`
- `supabase/migrations/20260703080000_commercial_prospecting_map.sql`
- `supabase/migrations/20260703183553_commercial_followup_signatures.sql`
- `supabase/migrations/20260703205820_commercial_commission_tracking.sql`
- `supabase/migrations/20260703222027_commercial_compensation_accounting.sql`
- `supabase/migrations/20260704014500_enforce_profile_hours_for_slots.sql`
- `supabase/migrations/20260704164009_super_admin_sensitive_rls_hardening.sql`
- `supabase/migrations/20260706142609_demo_unlimited_ai_credits.sql`
- `supabase/migrations/20260706181500_actualites_subscription_access_quota.sql`
- `supabase/migrations/20260706192000_image_metadata_ai.sql`
- `supabase/migrations/20260707173000_guard_tok_credit_spend.sql`
- `supabase/migrations/20260707200452_claim_image_analysis_job_by_image_id.sql`
- `supabase/migrations/20260709120000_financial_ledger_and_developer_statements.sql`
- `supabase/migrations/20260710182000_lock_signed_commercial_prospect_status.sql`
- `supabase/migrations/20260710190000_stripe_connect_required_restaurant_payouts.sql`
- `supabase/migrations/20260710190500_remove_commercial_demo_accounts.sql`
- `supabase/migrations/20260711120000_audit_security_hardening.sql`
- `supabase/migrations/20260711153000_comprehensive_rpc_privilege_hardening.sql`
- `supabase/migrations/20260712000526_marketplace_finance_routing.sql`
- `supabase/migrations/20260712000718_index_financial_ledger_reversal.sql`
- `supabase/migrations/20260712001744_disable_legacy_stripe_sync_worker_cron.sql`
- `supabase/migrations/20260712014949_actualites_image_indexing_security.sql`
- `supabase/migrations/20260712060000_fix_production_security_alerts.sql`
- `supabase/migrations/20260712061702_harden_client_dashboard_boundaries.sql`
- `supabase/migrations/20260712061703_fix_miamz_reward_lifecycle.sql`
- `supabase/migrations/20260712063000_separate_advisors_from_operational_health.sql`
- `supabase/migrations/20260712090000_floor_plan_v2_editor_rpc.sql`
- `supabase/migrations/20260712210714_floor_plan_v2_furniture.sql`
- `supabase/migrations/20260712211332_floor_plan_v2_furniture_rpc_hardening.sql`
- `supabase/migrations/20260714120000_commercial_demo_accounts.sql`
- `supabase/migrations/20260714181500_commercial_demo_function_acl_hardening.sql`
- `supabase/migrations/20260714184500_repair_auth_email_change_null.sql`
- `supabase/migrations/20260714195229_secure_commercial_sales_governance.sql`
- `supabase/migrations/20260714232000_commercial_sales_governance_followup.sql`
- `supabase/migrations/20260714232001_commercial_demo_realtime_order_journey.sql`
- `supabase/migrations/20260714233500_commercial_demo_finance_isolation_guard.sql`
- `supabase/migrations/20260715003424_commercial_demo_reservations_and_active_tools.sql`
- `supabase/migrations/20260715015956_commercial_demo_ai_workspaces.sql`
- `supabase/migrations/20260715023000_commercial_demo_transaction_host_isolation.sql`
- `supabase/migrations/20260715031224_tok_connect_mcp_chatgpt_v2.sql`
- `supabase/migrations/20260715031622_floor_plan_v2_reliability.sql`
- `supabase/migrations/20260715044653_commercial_demo_openai_gateway.sql`
- `supabase/migrations/20260715050654_distinguish_admin_from_commercial_demo.sql`
- `supabase/migrations/20260715054500_tok_connect_mcp_security_hardening.sql`
- `supabase/migrations/20260715060000_payment_integrity_state_machine.sql`
- `supabase/migrations/20260715060500_payment_integrity_advisor_followup.sql`
- `supabase/migrations/20260717023000_stripe_developer_share_transfers.sql`
- `supabase/migrations/20260717024500_fix_locked_developer_statement_paid_transition.sql`
- `supabase/migrations/20260717210000_lock_developer_share_all_tok_revenue.sql`
- `supabase/migrations/20260717220000_deferred_subscription_commission_lifecycle.sql`
- `supabase/migrations/20260717235004_stripe_security_and_finance_fail_closed.sql`
- `supabase/migrations/20260718022910_fair_growth_business_model.sql`
- `supabase/migrations/20260718095000_fair_growth_post_advisor_hardening.sql`
- `supabase/migrations/20260718201439_daily_dish_ai.sql`
- `supabase/migrations/20260718203255_daily_dish_publication_day_guard.sql`
- `supabase/migrations/20260718203452_daily_dish_advisor_hardening.sql`
- `supabase/migrations/20260718203641_daily_dish_public_column_privacy.sql`
- `supabase/migrations/20260718203923_daily_dish_demo_ai_budget_completion.sql`
- `supabase/migrations/20260719015244_prepare_demo_isolation_for_activation.sql`
- `supabase/migrations/20260719103746_harden_daily_slot_idempotency.sql`
- `supabase/migrations/20260719110000_prepare_commercial_demo_activation.sql`
- `supabase/migrations/20260719113000_activate_commercial_demo_restaurant.sql`
- `supabase/migrations/20260719124500_keep_commercial_demo_restaurants_active.sql`
- `supabase/migrations/20260719150000_admin_real_restaurant_ownership.sql`
- `supabase/migrations/20260719165000_enforce_commercial_only_roles.sql`
- `supabase/migrations/20260719170000_production_demo_restaurant_read_isolation.sql`
- `supabase/migrations/20260720130000_hide_demo_restaurants_from_real_catalog.sql`
- `supabase/migrations/20260720131000_hide_demo_restaurants_from_real_catalog.sql`
- `supabase/migrations/20260721181334_secure_pending_restaurant_onboarding.sql`
- `supabase/migrations/20260721200051_finalize_pending_restaurant_onboarding.sql`
- `supabase/migrations/20260721215805_harden_restaurant_payment_eligibility.sql`
- `supabase/migrations/20260721222758_fence_match_group_capture_claims.sql`
- `supabase/migrations/20260722120000_restaurant_stripe_adjustments.sql`
- `supabase/migrations/20260722123000_secure_public_analytics_ingestion.sql`
- `supabase/migrations/20260724043000_consent_receipts.sql`
- `supabase/migrations/20260726013000_admin_destructive_actions.sql`
- `supabase/migrations/20260726020000_harden_demo_gdpr_and_social_cron.sql`
- `supabase/migrations/20260726021000_add_paid_module_cancelled_at.sql`
- `supabase/migrations/20260726022000_close_demo_user_role_escalation.sql`
- `supabase/migrations/20260726022100_close_demo_storage_bypass.sql`
- `supabase/migrations/20260726023000_disable_demo_live_finance_crons.sql`
- `supabase/migrations/20260726024000_close_remaining_demo_rls_bypass.sql`
- `supabase/migrations/20260726030142_restore_production_reservation_visibility.sql`
- `supabase/migrations/20260726041631_restore_admin_dashboard_visibility.sql`
- `supabase/migrations/20260726041632_crm_mfa_recovery.sql`
- `supabase/migrations/20260726053000_ops_incident_automation.sql`
- `supabase/migrations/20260726061344_seed_thefork_commercial_prospect_catalog.sql`
- `supabase/migrations/20260726061543_ops_incident_native_cron.sql`
- `supabase/migrations/20260726062000_ops_incident_native_cron.sql`
- `supabase/migrations/20260726070000_daily_dish_claim_lock_window.sql`
- `supabase/migrations/20260727100000_daily_dish_optional_image.sql`
- `supabase/migrations/20260727190000_daily_dish_actualites_trusted_asset.sql`
- `supabase/migrations/20260727190100_daily_dish_actualites_trigger_metadata.sql`
- `supabase/migrations/20260728010000_ops_incident_no_changes_status.sql`
- `supabase/migrations/20260728030000_supplier_catalog.sql`
- `supabase/migrations/20260728030100_aligro_catalog_weekly_sync.sql`
- `supabase/migrations/20260728075715_server_signup_drafts.sql`
- `supabase/migrations/20260728075938_restaurant_onboarding_server_lifecycle.sql`
- `supabase/migrations/20260728090000_fair_growth_module_lifecycle.sql`
- `supabase/migrations/20260728120000_google_actions_center_outbox.sql`
- `supabase/migrations/20260728120100_google_actions_center_sync_cron.sql`
- `supabase/migrations/20260728150000_commercial_contract_acceptances.sql`
- `supabase/migrations/20260728160000_dashboard_pack_runtime_kill_switch.sql`
- `supabase/migrations/20260728170000_confirmed_campaign_conversions.sql`
- `supabase/migrations/20260728170050_server_side_campaign_last_click_attribution.sql`
- `supabase/migrations/20260728170075_dedupe_campaign_conversion_entities.sql`
- `supabase/migrations/20260728170100_strict_campaign_targeting.sql`
- `supabase/migrations/20260728170110_normalize_complete_campaign_targets.sql`
- `supabase/migrations/20260728170120_confirm_arrived_reservation_conversions.sql`
- `supabase/migrations/20260728173450_immutable_unaccent_lower.sql`
- `supabase/migrations/20260728173475_actualites_campaign_image_index.sql`
- `supabase/migrations/20260728173500_actualites_boost_atomic_media.sql`
- `supabase/migrations/20260728173600_actualites_campaign_image_index.sql`
- `supabase/migrations/20260728173650_harden_social_post_boosts.sql`
- `supabase/migrations/20260728173700_harden_social_post_boosts.sql`
- `supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql`
- `supabase/migrations/20260729100000_exclude_credit_funded_campaigns_from_revenue.sql`
- `supabase/migrations/20260729110000_flat_reservation_billing_when_modules_disabled.sql`
- `supabase/migrations/20260729120000_allow_admin_managed_commercial_role.sql`
- `supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql`
- `supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql`
- `supabase/migrations/20260801003000_tok_intelligence_suite.sql`
- `supabase/migrations/20260801090000_ops_incident_stale_recovery.sql`
- `supabase/migrations/20260801100000_google_actions_center_outbox_claim_lease.sql`
- `supabase/migrations/20260801120000_harden_public_restaurant_search_bounds.sql`
- `supabase/migrations/20260801130000_unify_incident_intelligence.sql`
- `supabase/migrations/20260801190000_marketing_operations_center.sql`
- `supabase/migrations/20260802000000_restaurateur_onboarding_reliability.sql`
- `supabase/migrations/20260802171847_grant_rbarman_marketing_admin.sql`
- `supabase/migrations/20260802230000_marketing_ai_agent.sql`
- `supabase/migrations/20260803010000_marketing_prospect_coordinates.sql`
- `supabase/migrations/20260803020000_marketing_b2b_legitimate_interest_email.sql`
- `supabase/migrations/20260803030000_marketing_delivery_recipient_history.sql`
- `supabase/migrations/20260803140000_marketing_one_click_unsubscribe.sql`
- `supabase/migrations/20260803150000_marketing_email_cadence.sql`
- `supabase/migrations/20260804204940_edge_function_audit_logs_created_at_index.sql`
- `supabase/migrations/20260804204953_bound_abandon_payment_attempt_lock_wait.sql`
- `supabase/migrations/20260804204958_supabase_advisor_hygiene.sql`
- `supabase/migrations/20260805014524_idempotent_payment_attempt_abandonment.sql`
- `supabase/migrations/20260808064701_close_audit_security_gaps.sql`
- `supabase/migrations/20260808065344_schedule_stripe_subscription_reconcile.sql`
- `supabase/migrations/20260811014500_ios_storekit_appstore_compliance.sql`
- `supabase/migrations/20260811070000_flat_marketplace_pickup_privacy.sql`
- `supabase/migrations/20260831043504_public_geneva_restaurant_directory.sql`
- `supabase/migrations/20260831081000_directory_image_enrichment.sql`
- `supabase/migrations/20260831093000_directory_restaurant_claim_removal.sql`
- `supabase/migrations/20260831144500_directory_commercial_name_gate.sql`
- `supabase/migrations/20260901083000_restaurant_public_data_consistency.sql`
- `supabase/migrations/20260901170943_public_restaurant_catalog_infinite_scroll.sql`
- `supabase/migrations/20260901182818_harden_directory_restaurant_display_names.sql`
- `supabase/migrations/20260901203000_directory_cuisine_enrichment.sql`
- `supabase/migrations/20260902055545_exact_directory_image_search_backfill.sql`
- `supabase/migrations/20260902060000_directory_cuisine_osm_backfill.sql`
- `supabase/migrations/20260902061000_directory_cuisine_osm_precision_guards.sql`
- `supabase/migrations/20260902114500_fix_public_cuisine_catalog_rls.sql`
- `supabase/migrations/20260902150000_expose_restaurant_coordinates_in_catalog.sql`
- `supabase/migrations/20260902182000_randomize_image_backed_restaurant_search.sql`
- `supabase/migrations/20260902190000_normalize_carouge_city_variant.sql`
- `supabase/migrations/20260902212500_consolidate_carouge_city.sql`
- `supabase/migrations/20260903084500_security_audit_p0_remediation.sql`
- `supabase/migrations/20260903091500_deduplicate_exact_rls_policies.sql`
- `supabase/migrations/20260904143000_ops_incident_github_run_binding.sql`
- `supabase/migrations/20260904173000_restaurant_image_truth_pipeline.sql`
- `supabase/migrations/20260904173100_restaurant_image_truth_guards.sql`
- `supabase/migrations/20260904173200_restaurant_image_discovery_trigger.sql`
- `supabase/migrations/20260904173300_restaurant_image_discovery_reactivation.sql`
- `supabase/migrations/20260904173400_restaurant_image_discovery_claim_eligibility.sql`
- `supabase/migrations/20260905022000_tok_connect_mcp_action_bridge.sql`
- `supabase/migrations/20260907011600_notification_delivery_reliability.sql`
- `supabase/migrations/20260907011700_ai_feature_flag_enforcement.sql`
- `supabase/migrations/20260907023000_marketing_print_foundation.sql`
- `supabase/migrations/20260907023100_marketing_print_operations.sql`
- `supabase/migrations/20260907030000_floor_plan_preferred_tables_autoplacement.sql`
- `supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql`
- `supabase/migrations/20260908034500_expand_cloudprinter_logical_catalog.sql`
- `supabase/migrations/20260909014500_tok_connect_restaurant_mcp_access.sql`
- `supabase/migrations/20260909025200_optimize_observability_maintenance.sql`
- `supabase/migrations/20260909133500_complete_thefork_directory_catalog.sql`
- `supabase/migrations/20260909143000_show_verified_restaurants_without_images.sql`
- `supabase/migrations/20260909153000_optimize_expanded_public_catalog_rpc.sql`
- `supabase/migrations/20260914090000_marketing_outreach_assistance.sql`
- `supabase/migrations/20260914224100_add_directory_display_name.sql`
- `supabase/migrations/20260915183203_admin_thefork_only_catalog_filter.sql`
- `supabase/migrations/20260915183625_admin_thefork_only_catalog_filter.sql`
- `supabase/migrations/20260915183715_thefork_deploy_probe.sql`
- `supabase/migrations/20260915183730_create_restaurant_thefork_catalog.sql`
- `supabase/migrations/20260915183738_extend_restaurant_thefork_catalog.sql`
- `supabase/migrations/20260915183744_seed_public_restaurant_source_flag.sql`
- `supabase/migrations/20260915183752_populate_restaurant_thefork_catalog.sql`
- `supabase/migrations/20260915184411_create_public_restaurant_all_sources_helper.sql`
- `supabase/migrations/20260915184416_create_restaurant_thefork_member_helper.sql`
- `supabase/migrations/20260915184421_create_restaurant_source_display_helper.sql`
- `supabase/migrations/20260915184427_secure_thefork_visibility_helpers.sql`
- `supabase/migrations/20260915184436_gate_restaurants_public_select_by_source.sql`
- `supabase/migrations/20260915184441_gate_production_restaurant_reads_by_source.sql`
- `supabase/migrations/20260915184447_gate_commercial_demo_production_reads_by_source.sql`
- `supabase/migrations/20260915184514_secure_restaurant_thefork_catalog_table.sql`
- `supabase/migrations/20260915184551_gate_public_catalog_rpc_by_thefork_source.sql`
- `supabase/migrations/20260915184600_remove_thefork_deploy_probe.sql`
- `supabase/migrations/20260917212632_claim_thefork_image_discovery_jobs.sql`
- `supabase/migrations/20260917213543_prioritize_thefork_image_truth_reviews.sql`
- `supabase/migrations/20260917213646_fix_thefork_truth_priority_internal_call.sql`
- `supabase/migrations/20260917214232_thefork_official_site_discovery.sql`
- `supabase/migrations/20260918031431_claim_thefork_image_truth_reviews.sql`
- `supabase/migrations/20260918031434_thefork_official_site_discovery.sql`
- `supabase/migrations/20260918031741_fix_thefork_site_discovery_handoff.sql`
- `supabase/migrations/20260918032031_backoff_thefork_site_discovery_provider.sql`
- `supabase/migrations/20260918032409_recover_stale_thefork_image_worker_leases.sql`
- `supabase/migrations/20260924044424_restrict_internal_print_rpc_execution.sql`
- `supabase/migrations/20260924044438_qualify_invoice_logo_storage_paths.sql`
- `supabase/migrations/20260924044449_align_restaurant_public_read_policies.sql`
- `supabase/migrations/20260925015352_schedule_directory_image_discovery.sql`
- `supabase/migrations/20260925104552_require_public_restaurant_images.sql`
- `supabase/migrations/20261003070000_marketing_autopilot_foundation.sql`
- `supabase/migrations/20261006010000_repair_admin_commercial_supabase_regressions.sql`
- `supabase/migrations/20261006022139_configure_meta_marketing_integrations.sql`
- `supabase/migrations/20261009003407_protect_generated_print_format.sql`
- `supabase/migrations/20261010194510_checkout_benefits_and_public_menu_security.sql`
- `supabase/migrations/20261010203000_print_fulfillment_protocol.sql`
- `supabase/migrations/20261010212500_reconcile_canonical_commercial_demo_inert_state.sql`
- `supabase/migrations/20261010220000_launch_animation_access_gate.sql`
- `supabase/migrations/20261010224500_actualites_billing_identity.sql`

</details>

<details><summary>documentation (151)</summary>

- `docs/MARKETING_OPERATIONS_CENTER.md`
- `docs/PRINT_FULFILLMENT_PROTOCOL.md`
- `docs/architecture/TOK_RUNTIME_EVIDENCE_2026-10-03.md`
- `docs/architecture/tok-runtime-evidence-2026-10-03.json`
- `docs/assets-archive/intro.mp4`
- `docs/assets-archive/plan de salle.psd`
- `docs/audit-execution-plan.md`
- `docs/audits/2026-04-18-supabase-production-audit.md`
- `docs/audits/2026-05-31-global-site-gap-audit.md`
- `docs/audits/2026-08-02-supabase-auth-audit.md`
- `docs/audits/DEPENDABOT_2026-10-03.md`
- `docs/audits/MARKETING_CAMPAIGNS_AUDIT_2026-07-28.md`
- `docs/audits/codebase-audit-2026-06-19.md`
- `docs/audits/codebase-audit-2026-06-26.md`
- `docs/audits/mobile-release-readiness-2026-04-30.md`
- `docs/audits/supabase-audit-2026-06-19.md`
- `docs/ci-triggers/20260531-actualites-sponsored-posts.md`
- `docs/commercial/tok-argumentaire-commerciaux.md`
- `docs/deployments/2026-07-24-commercial-map-thefork-520.md`
- `docs/design/plan-de-salle-placement.md`
- `docs/design/plan-de-salle-theme.md`
- `docs/design/tok-launch/.gitignore`
- `docs/design/tok-launch/ASSETS.md`
- `docs/design/tok-launch/README.md`
- `docs/design/tok-launch/eslint.config.js`
- `docs/design/tok-launch/index.html`
- `docs/design/tok-launch/package.json`
- `docs/design/tok-launch/pnpm-lock.yaml`
- `docs/design/tok-launch/pnpm-workspace.yaml`
- `docs/design/tok-launch/public/assets/background.png`
- `docs/design/tok-launch/public/assets/chef.png`
- `docs/design/tok-launch/public/assets/props.png`
- `docs/design/tok-launch/public/launch/anton.woff2`
- `docs/design/tok-launch/public/launch/barlow.woff2`
- `docs/design/tok-launch/src/Scene.tsx`
- `docs/design/tok-launch/src/countdown.ts`
- `docs/design/tok-launch/src/main.tsx`
- `docs/design/tok-launch/src/remotion.tsx`
- `docs/design/tok-launch/src/scene.css`
- `docs/design/tok-launch/src/viewer.css`
- `docs/design/tok-launch/tsconfig.json`
- `docs/design/tok-launch/vite.config.ts`
- `docs/design/tok-ux-ui-audit-20261010.md`
- `docs/design/tok-ux-ui-proposal-20261010.html`
- `docs/fair-growth-business-model.md`
- `docs/implementation/MARKETING_SUBDOMAIN_INTEGRATION.md`
- `docs/integrations/google-actions-center-audit.md`
- `docs/integrations/google-actions-center.md`
- `docs/legal/01-cgv-cgu-clients.md`
- `docs/legal/02-contrat-restaurateur.md`
- `docs/legal/03-abonnements-commissions.md`
- `docs/legal/04-tok-connect-api.md`
- `docs/legal/05-contrat-coursier-statut.md`
- `docs/legal/06-annulation-remboursement-no-show-chargeback.md`
- `docs/legal/07-miamz-solidaires.md`
- `docs/legal/08-ventes-flash-anti-gaspi.md`
- `docs/legal/09-licence-contenus-restaurants.md`
- `docs/legal/10-responsabilites-produits.md`
- `docs/legal/README.md`
- `docs/marketing-backlink-opportunities.md`
- `docs/marketing-email-examples/01-lancement-geneve.html`
- `docs/marketing-email-examples/01-lancement-geneve.txt`
- `docs/marketing-email-examples/02-pizzeria-carouge.html`
- `docs/marketing-email-examples/02-pizzeria-carouge.txt`
- `docs/marketing-email-examples/03-rive-droite-soiree.html`
- `docs/marketing-email-examples/03-rive-droite-soiree.txt`
- `docs/marketing/TOK_MARKETING_AUDIT_2026-10-08.md`
- `docs/marketing/TOK_MARKETING_AUTOPILOT_RUNBOOK.md`
- `docs/marketing/TOK_MARKETING_SESSION_DISCOVERY_2026-10-09.md`
- `docs/mobile-fullstack-review-2026-03-29.md`
- `docs/operations/CLOUDPRINTER_FORMAT_MAPPING.md`
- `docs/operations/TOK_INTELLIGENCE_SUITE.md`
- `docs/operations/incident-intelligence-unification.md`
- `docs/operations/pr-readiness-2026-07-28.md`
- `docs/operations/telegram-codex-incidents.md`
- `docs/projects/TOK_MARKETING_AUTOPILOT_COMPLETION.md`
- `docs/runbooks/commercial-demo-ai.md`
- `docs/runbooks/commercial-demo-payment-simulator.md`
- `docs/runbooks/local-git-auto-sync.md`
- `docs/runbooks/mobile-association-hosting.md`
- `docs/runbooks/production-release-readiness.md`
- `docs/runbooks/stripe-financial-ops.md`
- `docs/security/SEO_BOT_PROTECTION_RUNBOOK.md`
- `docs/security/audit-readiness-10-10.md`
- `docs/security/payment-integrity-audit-2026-07-15.md`
- `docs/seo/SEO_AUDIT_2026-07-28.md`
- `docs/seo/SEO_IDENTITE_COMMUNE_2026-09-02.md`
- `docs/seo/SEO_INDEXATION_2026-09-02.md`
- `docs/seo/SEO_SEARCH_CONSOLE_2026-09-20.md`
- `docs/seo/rollbacks/20260902212500_consolidate_carouge_city.sql`
- `docs/skills/README.md`
- `docs/skills/TOK_ADMIN_SUPPORT_SKILL.md`
- `docs/skills/TOK_APPLICATION_SKILL.md`
- `docs/skills/TOK_GLOBAL_RULES.md`
- `docs/skills/TOK_MEDIA_AI_SKILL.md`
- `docs/skills/TOK_NOTIFICATIONS_SKILL.md`
- `docs/skills/TOK_PAYMENT_SKILL.md`
- `docs/skills/TOK_RELEASE_GATEKEEPER.md`
- `docs/skills/TOK_RESTAURANT_OPS_SKILL.md`
- `docs/skills/TOK_SCALE_READINESS_SKILL.md`
- `docs/skills/TOK_SEO_SKILL.md`
- `docs/skills/TOK_SUPABASE_RLS_SKILL.md`
- `docs/skills/TOK_TESTING_SKILL.md`
- `docs/supabase/anon-security-definer-audit.md`
- `docs/superpowers/plans/2026-04-17-reservation-billing.md`
- `docs/superpowers/plans/2026-04-21-compta-home-inflows-outflows.md`
- `docs/superpowers/plans/2026-04-21-dashboard-readability.md`
- `docs/superpowers/plans/2026-04-22-compta-campaigns-tok-one.md`
- `docs/superpowers/plans/2026-04-22-dashboard-commandes-special-orders.md`
- `docs/superpowers/plans/2026-04-22-invoice-line-details.md`
- `docs/superpowers/plans/2026-04-22-plan-salle-structure-studio-implementation.md`
- `docs/superpowers/plans/2026-04-25-cancellation-refund-and-miamz-cleanup.md`
- `docs/superpowers/plans/2026-05-25-uber-thefork-readiness.md`
- `docs/superpowers/plans/2026-05-26-abonnements-entitlements.md`
- `docs/superpowers/plans/2026-05-30-parcours-inscription.md`
- `docs/superpowers/plans/2026-06-05-global-application-audit.md`
- `docs/superpowers/plans/2026-09-04-audit-remediation.md`
- `docs/superpowers/plans/2026-09-04-restaurant-image-truth-backfill.md`
- `docs/superpowers/plans/2026-09-07-notifications-ai-admin-hardening.md`
- `docs/superpowers/plans/2026-09-07-seo-performance-remediation.md`
- `docs/superpowers/plans/2026-09-07-thetok-cloudprinter-print.md`
- `docs/superpowers/plans/2026-09-08-commercial-demo-multispace-fidelity.md`
- `docs/superpowers/plans/2026-09-08-marketing-studio-output-geometry.md`
- `docs/superpowers/plans/2026-09-15-admin-thefork-only-filter.md`
- `docs/superpowers/plans/2026-10-10-tok-ui-ux-preview.md`
- `docs/superpowers/specs/2026-04-17-reservation-billing-design.md`
- `docs/superpowers/specs/2026-04-21-compta-home-inflows-outflows-design.md`
- `docs/superpowers/specs/2026-04-21-dashboard-readability-design.md`
- `docs/superpowers/specs/2026-04-22-compta-campaigns-tok-one-design.md`
- `docs/superpowers/specs/2026-04-22-dashboard-commandes-special-orders-design.md`
- `docs/superpowers/specs/2026-04-22-invoice-line-details-design.md`
- `docs/superpowers/specs/2026-04-22-plan-salle-structure-studio-design.md`
- `docs/superpowers/specs/2026-04-22-plan-salle-tablette-design.md`
- `docs/superpowers/specs/2026-04-22-social-preview-image-design.md`
- `docs/superpowers/specs/2026-04-23-plan-salle-studio-mobilier-design.md`
- `docs/superpowers/specs/2026-04-25-cancellation-refund-and-miamz-cleanup-design.md`
- `docs/superpowers/specs/2026-04-25-dashboard-performances-dual-surface-design.md`
- `docs/superpowers/specs/2026-04-25-geneva-demo-restaurants-design.md`
- `docs/superpowers/specs/2026-05-25-social-actualites-settings-promotions-design.md`
- `docs/superpowers/specs/2026-05-26-abonnements-entitlements-design.md`
- `docs/superpowers/specs/2026-05-30-parcours-inscription-design.md`
- `docs/superpowers/specs/2026-09-08-marketing-studio-output-geometry-design.md`
- `docs/testing/actualites-billing-identity.md`
- `docs/testing/actualites-sponsored-scenario.md`
- `docs/testing/browser-monitoring-consent.md`
- `docs/testing/checkout-security-710.md`
- `docs/testing/launch-10k-load-plan.md`
- `docs/testing/supabase-rpc-guards.md`
- `docs/tok-connect/README.md`
- `docs/tok-connect/REMOTE_MCP.md`
- `docs/tok-connect/full-app-mcp.md`

</details>

<details><summary>edge-function-source (183)</summary>

- `supabase/functions/_shared/ai-pricing.ts`
- `supabase/functions/_shared/ai-security.ts`
- `supabase/functions/_shared/apple-storekit.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/campaign-pricing.ts`
- `supabase/functions/_shared/chefs-table.ts`
- `supabase/functions/_shared/commercial-demo-ai.ts`
- `supabase/functions/_shared/commercial-demo-host.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/delivery-dispatch.ts`
- `supabase/functions/_shared/error-code-map.ts`
- `supabase/functions/_shared/error-diagnostics.ts`
- `supabase/functions/_shared/feature-flags.ts`
- `supabase/functions/_shared/incident-intelligence.ts`
- `supabase/functions/_shared/intelligence.ts`
- `supabase/functions/_shared/logging.ts`
- `supabase/functions/_shared/marketing-ai-plan.ts`
- `supabase/functions/_shared/marketing-ai.ts`
- `supabase/functions/_shared/marketing-backlink-discovery.ts`
- `supabase/functions/_shared/marketing-backlink-sources.ts`
- `supabase/functions/_shared/marketing-email-template.ts`
- `supabase/functions/_shared/marketing-service-auth.ts`
- `supabase/functions/_shared/marketing-unsubscribe-secrets.ts`
- `supabase/functions/_shared/marketing-unsubscribe-token.ts`
- `supabase/functions/_shared/marketing.ts`
- `supabase/functions/_shared/marketplace-finance.ts`
- `supabase/functions/_shared/mcp-http.ts`
- `supabase/functions/_shared/meta-marketing-health.ts`
- `supabase/functions/_shared/meta-marketing-orchestrator.ts`
- `supabase/functions/_shared/meta-publishing.ts`
- `supabase/functions/_shared/notifications.ts`
- `supabase/functions/_shared/openai.ts`
- `supabase/functions/_shared/order-checkout.ts`
- `supabase/functions/_shared/order-pricing.ts`
- `supabase/functions/_shared/pack-entitlements.ts`
- `supabase/functions/_shared/payment-attempts.ts`
- `supabase/functions/_shared/payment-transactions.ts`
- `supabase/functions/_shared/print/catalog.ts`
- `supabase/functions/_shared/print/cloudprinter.ts`
- `supabase/functions/_shared/print/options.ts`
- `supabase/functions/_shared/print/pdf.ts`
- `supabase/functions/_shared/print/pricing.ts`
- `supabase/functions/_shared/print/product-geometry.ts`
- `supabase/functions/_shared/print/provider.ts`
- `supabase/functions/_shared/print/quantity.ts`
- `supabase/functions/_shared/print/request.ts`
- `supabase/functions/_shared/print/security.ts`
- `supabase/functions/_shared/print/source-format.ts`
- `supabase/functions/_shared/print/types.ts`
- `supabase/functions/_shared/rate-limit.ts`
- `supabase/functions/_shared/refund-allocations.ts`
- `supabase/functions/_shared/restaurant-credits.ts`
- `supabase/functions/_shared/restaurant-subscription-billing.ts`
- `supabase/functions/_shared/return-url.ts`
- `supabase/functions/_shared/safe-public-fetch.ts`
- `supabase/functions/_shared/stripe-client.ts`
- `supabase/functions/_shared/tok-connect-auth.ts`
- `supabase/functions/_shared/tok-connect-discovery-widget.ts`
- `supabase/functions/_shared/tok-connect-discovery.ts`
- `supabase/functions/_shared/tok-connect.ts`
- `supabase/functions/_shared/tok-one.ts`
- `supabase/functions/_shared/transactional-emails.ts`
- `supabase/functions/_shared/user-storage-cleanup.ts`
- `supabase/functions/_shared/zero-attente.ts`
- `supabase/functions/admin-demo-entities/index.ts`
- `supabase/functions/admin-restaurant-adjustment/index.ts`
- `supabase/functions/ai-accounting-agent/index.ts`
- `supabase/functions/ai-admin-dashboard-chat/index.ts`
- `supabase/functions/ai-admin-monitor/index.ts`
- `supabase/functions/ai-admin-support/index.ts`
- `supabase/functions/ai-campaign-studio/index.ts`
- `supabase/functions/ai-client-chat/index.ts`
- `supabase/functions/ai-client-support/index.ts`
- `supabase/functions/ai-guardian/index.ts`
- `supabase/functions/ai-image-enhance/index.ts`
- `supabase/functions/ai-marketing-agent/index.ts`
- `supabase/functions/ai-restaurant-agent/index.ts`
- `supabase/functions/ai-restaurant-tools/index.ts`
- `supabase/functions/ai-social-post-copy/index.ts`
- `supabase/functions/ai-support-resolution/index.ts`
- `supabase/functions/aligro-catalog-sync/index.ts`
- `supabase/functions/analyze-restaurant-image/index.ts`
- `supabase/functions/apple-storekit-webhook/index.ts`
- `supabase/functions/authorize-match-group-order/index.ts`
- `supabase/functions/campaign-portal/index.ts`
- `supabase/functions/cancel-payment-attempt/index.ts`
- `supabase/functions/cancel-pending-order-checkout/index.ts`
- `supabase/functions/capture-due-match-groups/index.ts`
- `supabase/functions/close-due-match-groups/index.ts`
- `supabase/functions/cloudprinter-webhook/index.ts`
- `supabase/functions/commercial-demo-ai/index.ts`
- `supabase/functions/commercial-demo-checkout/index.ts`
- `supabase/functions/commercial-followup-reminder/index.ts`
- `supabase/functions/complete-order-checkout/_local.ts`
- `supabase/functions/complete-order-checkout/index.ts`
- `supabase/functions/complete-restaurant-credit-pack-checkout/index.ts`
- `supabase/functions/confirm-match-group-authorization/index.ts`
- `supabase/functions/contact-support/index.ts`
- `supabase/functions/courier-portal/index.ts`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/create-chefs-table-reservation/index.ts`
- `supabase/functions/create-reservation/index.ts`
- `supabase/functions/create-social-post-boost/index.ts`
- `supabase/functions/create-zero-attente-reservation/index.ts`
- `supabase/functions/crm-mfa-recovery/index.ts`
- `supabase/functions/crm-mfa-recovery/provider-error.ts`
- `supabase/functions/customer-memory/index.ts`
- `supabase/functions/daily-dish-ai/index.ts`
- `supabase/functions/daily-slot-spin/index.ts`
- `supabase/functions/daily-slot-spin/rules.ts`
- `supabase/functions/delete-account/index.ts`
- `supabase/functions/discover-thefork-official-sites/index.ts`
- `supabase/functions/dispatch-order/index.ts`
- `supabase/functions/dispatch-timeout/index.ts`
- `supabase/functions/enrich-directory-cuisines-osm/index.ts`
- `supabase/functions/enrich-directory-cuisines/index.ts`
- `supabase/functions/enrich-directory-images/index.ts`
- `supabase/functions/enrich-restaurants/index.ts`
- `supabase/functions/enrich-thefork-images/index.ts`
- `supabase/functions/floorplan-ai/index.ts`
- `supabase/functions/generate-campaign/index.ts`
- `supabase/functions/generate-invoices/index.ts`
- `supabase/functions/google-actions-center-sync/index.ts`
- `supabase/functions/google-actions-center/index.ts`
- `supabase/functions/manage-restaurant-subscription/index.ts`
- `supabase/functions/manage-tok-one-subscription/index.ts`
- `supabase/functions/marketing-orchestrator/index.ts`
- `supabase/functions/marketing-provider-webhook/index.ts`
- `supabase/functions/marketing-unsubscribe/index.ts`
- `supabase/functions/menu-image-import/index.ts`
- `supabase/functions/notification-dispatch/index.ts`
- `supabase/functions/ops-incident-control/index.ts`
- `supabase/functions/ops-incident-native-scan/index.ts`
- `supabase/functions/payment-attempt-status/index.ts`
- `supabase/functions/print-admin/index.ts`
- `supabase/functions/print-catalog/index.ts`
- `supabase/functions/print-checkout/index.ts`
- `supabase/functions/print-export/index.ts`
- `supabase/functions/print-orchestrator/index.ts`
- `supabase/functions/print-order-action/index.ts`
- `supabase/functions/print-quote/index.ts`
- `supabase/functions/print-reconcile/index.ts`
- `supabase/functions/print-sandbox-complete/index.ts`
- `supabase/functions/process-refund/index.ts`
- `supabase/functions/process-refund/refund-utils.ts`
- `supabase/functions/provision-commercial-accounts/index.ts`
- `supabase/functions/provision-commercial-demo-logins/index.ts`
- `supabase/functions/provision-commercial-demo-project-session/index.ts`
- `supabase/functions/reconcile-match-group-authorizations/index.ts`
- `supabase/functions/reconcile-paid-order-checkouts/index.ts`
- `supabase/functions/restaurant-advisor/index.ts`
- `supabase/functions/restaurant-media-governance/index.ts`
- `supabase/functions/restaurant-order-status/index.ts`
- `supabase/functions/scrape-restaurants/index.ts`
- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-push/index.ts`
- `supabase/functions/settle-developer-statement/index.ts`
- `supabase/functions/stripe-connect-onboard/index.ts`
- `supabase/functions/stripe-connect-status/index.ts`
- `supabase/functions/stripe-setup/index.ts`
- `supabase/functions/stripe-subscription-reconcile/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/stripe-worker/index.ts`
- `supabase/functions/submit-signup-application/index.ts`
- `supabase/functions/submit-signup-application/validation.ts`
- `supabase/functions/sync-apple-storekit/index.ts`
- `supabase/functions/tok-connect-admin/index.ts`
- `supabase/functions/tok-connect-api/index.ts`
- `supabase/functions/tok-connect-app-bridge/index.ts`
- `supabase/functions/tok-connect-chatgpt/index.ts`
- `supabase/functions/tok-connect-commercial-bridge/index.ts`
- `supabase/functions/tok-connect-full-app-mcp/index.ts`
- `supabase/functions/tok-connect-mcp/index.ts`
- `supabase/functions/tok-connect-oauth/index.ts`
- `supabase/functions/tok-connect-portal/index.ts`
- `supabase/functions/tok-connect-remote-mcp/index.ts`
- `supabase/functions/tok-connect-webhook-dispatch/index.ts`
- `supabase/functions/tok-pulse-widget/index.ts`
- `supabase/functions/track-analytics/index.ts`
- `supabase/functions/track-sponsored-event/index.ts`
- `supabase/functions/validate-order/index.ts`
- `supabase/functions/verify-directory-commercial-names/index.ts`
- `supabase/functions/verify-directory-image-truth/index.ts`

</details>

<details><summary>frontend-component (254)</summary>

- `src/components/AddressAutocomplete.tsx`
- `src/components/AiCreationNotifications.tsx`
- `src/components/AntiWasteCard.tsx`
- `src/components/AudienceTargeting.tsx`
- `src/components/CampaignBanner.tsx`
- `src/components/ChefTableSlotDialog.tsx`
- `src/components/CityAutocomplete.tsx`
- `src/components/CityMultiSelect.tsx`
- `src/components/ComingSoonGate.tsx`
- `src/components/CountdownTimer.tsx`
- `src/components/CourierDashboardLayout.tsx`
- `src/components/CustomerDashboardLayout.tsx`
- `src/components/DailyMiamzSlotMachine.tsx`
- `src/components/DashboardLayout.tsx`
- `src/components/DashboardRoute.tsx`
- `src/components/DeliveryMap.tsx`
- `src/components/DirectoryClaimPersistenceBridge.tsx`
- `src/components/DirectoryRestaurantOwnershipNotice.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/FeatureWizard.tsx`
- `src/components/FormulaDetector.tsx`
- `src/components/ImageUpload.tsx`
- `src/components/LoyaltyStatus.tsx`
- `src/components/MenuItemCard.tsx`
- `src/components/MobileLogoIntro.tsx`
- `src/components/NavLink.tsx`
- `src/components/Navbar.tsx`
- `src/components/NearbyRestaurantsMap.tsx`
- `src/components/OrderConflictDialog.tsx`
- `src/components/OrderStatusBadge.tsx`
- `src/components/PriceRangeIcons.tsx`
- `src/components/PromoCarousel.tsx`
- `src/components/PromoCodeInput.tsx`
- `src/components/PromotionDetector.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/ReservationDetailModal.tsx`
- `src/components/ReservationDialog.tsx`
- `src/components/ReservationWidget.tsx`
- `src/components/RestaurantCancellationDialog.tsx`
- `src/components/RestaurantCard.tsx`
- `src/components/ReviewForm.tsx`
- `src/components/ScrollToTop.tsx`
- `src/components/SponsoredRestaurantCard.tsx`
- `src/components/StarRating.tsx`
- `src/components/SupportChat.tsx`
- `src/components/admin/AdminCommercialAccountDetail.tsx`
- `src/components/admin/AdminCommercialAccountsPanel.tsx`
- `src/components/admin/AdminDemoEntitiesDialog.tsx`
- `src/components/admin/AdminDestructiveActions.tsx`
- `src/components/admin/AdminLogResetButton.tsx`
- `src/components/admin/AdminMobileNavigation.tsx`
- `src/components/admin/AdminOperationDetailSheet.tsx`
- `src/components/admin/AdminRealRestaurantAssignment.tsx`
- `src/components/admin/AdminTheForkVisibilityControl.tsx`
- `src/components/admin/AdminUrgentActions.tsx`
- `src/components/auth/AccountPasswordForm.tsx`
- `src/components/auth/SignOutButton.tsx`
- `src/components/campaigns/CampaignInternalTestSummary.tsx`
- `src/components/campaigns/SponsoredRestaurantTemplateCard.tsx`
- `src/components/campaigns/SponsoredVisual.tsx`
- `src/components/campaigns/sponsoredVisualTheme.ts`
- `src/components/cart/CartItemList.tsx`
- `src/components/cart/CartSuggestionsStep.tsx`
- `src/components/cart/FlexOptions.tsx`
- `src/components/cart/LoyaltySection.tsx`
- `src/components/cart/PaymentMethodSelector.tsx`
- `src/components/cart/UpsellModal.tsx`
- `src/components/commercial/CommercialContractPanel.tsx`
- `src/components/commercial/CommercialDemoActorOverview.tsx`
- `src/components/commercial/CommercialDemoActorWorkspace.tsx`
- `src/components/commercial/CommercialDemoBrowserGrid.tsx`
- `src/components/commercial/CommercialDemoConsoleAi.tsx`
- `src/components/commercial/CommercialDemoCourierSecondary.tsx`
- `src/components/commercial/CommercialDemoFrameProvider.tsx`
- `src/components/commercial/CommercialDemoHostSecurityBoundary.tsx`
- `src/components/commercial/CommercialDemoRestaurantHome.tsx`
- `src/components/commercial/CommercialDemoSafeEffectsBoundary.tsx`
- `src/components/commercial/CommercialHostBoundary.tsx`
- `src/components/commercial/CommercialMultiSpaceDemo.tsx`
- `src/components/commercial/CommercialSingleSpaceDemo.tsx`
- `src/components/commercial/CommercialWorkspaceChrome.tsx`
- `src/components/contracts/RestaurantPartnerContractCard.tsx`
- `src/components/contracts/RestaurantPartnerContractPreview.tsx`
- `src/components/countdown-timer-utils.ts`
- `src/components/courier/CourierMissionDialog.tsx`
- `src/components/courier/CourierPushStatusCard.tsx`
- `src/components/courier/DeliveryProofPanel.tsx`
- `src/components/crm/CrmAccessGuard.tsx`
- `src/components/crm/CustomerCrmDashboard.tsx`
- `src/components/dashboard/AiCreationsGallery.tsx`
- `src/components/dashboard/AiStyleReferencePicker.tsx`
- `src/components/dashboard/CommercialDemoScenario.tsx`
- `src/components/dashboard/DailyDishAiPanel.tsx`
- `src/components/dashboard/DashboardIllustrationMedia.tsx`
- `src/components/dashboard/DashboardPageHero.tsx`
- `src/components/dashboard/DirectReservationChannelsCard.tsx`
- `src/components/dashboard/GoogleBusinessBookingCard.tsx`
- `src/components/dashboard/IllustratedActionCard.tsx`
- `src/components/dashboard/RestaurantDashboardHomeView.css`
- `src/components/dashboard/RestaurantDashboardHomeView.tsx`
- `src/components/dashboard/TokAiMarketingStudio.tsx`
- `src/components/dashboard/TokAiMarketingStudioPrintShell.tsx`
- `src/components/dashboard/TokAiPhotoStudio.tsx`
- `src/components/dashboard/TokAiPhotoStudioV2.tsx`
- `src/components/dashboard/marketing-print/MarketingOutputControls.tsx`
- `src/components/dashboard/marketing-print/MarketingStudioPrintCatalogBridge.tsx`
- `src/components/dashboard/marketing-print/PrintComposerDialog.tsx`
- `src/components/dashboard/marketing-print/PrintOrderDetails.tsx`
- `src/components/dashboard/marketing-print/PrintOrdersPanel.tsx`
- `src/components/dashboard/marketing-print/PrintProof.tsx`
- `src/components/dashboard/performance/PerformanceAlerts.tsx`
- `src/components/dashboard/performance/PerformanceBusinessTab.tsx`
- `src/components/dashboard/performance/PerformanceHeroStats.tsx`
- `src/components/dashboard/performance/PerformanceInsights.tsx`
- `src/components/dashboard/performance/PerformanceServiceSplit.tsx`
- `src/components/dashboard/performance/PerformanceTodayTab.tsx`
- `src/components/floor-plan/DynamicTableSvg.tsx`
- `src/components/floor-plan/EventFurnitureSvg.tsx`
- `src/components/floor-plan/FloorPlanAIPanel.tsx`
- `src/components/floor-plan/FloorPlanItemIllustration.tsx`
- `src/components/floor-plan/ReservationQueue.tsx`
- `src/components/floor-plan/ServiceBoard.tsx`
- `src/components/floor-plan/SimpleReservationQueue.tsx`
- `src/components/floor-plan/StudioCanvas.tsx`
- `src/components/floor-plan/StudioInspector.tsx`
- `src/components/floor-plan/StudioPalette.tsx`
- `src/components/floor-plan/TableConfigDialog.tsx`
- `src/components/floor-plan/TableContextDrawer.tsx`
- `src/components/floor-plan/floorPlanAssets.ts`
- `src/components/floor-plan/floorPlanSheet.ts`
- `src/components/floor-plan/floorPlanTones.ts`
- `src/components/floor-plan/seatPositioning.ts`
- `src/components/floor-plan/serviceShared.ts`
- `src/components/floor-plan/studioShared.ts`
- `src/components/floor-plan/useFloorPlanZoomViewport.ts`
- `src/components/help/ChefHelpButton.tsx`
- `src/components/home/CuisineCategoryStrip.tsx`
- `src/components/home/FeaturesSection.tsx`
- `src/components/home/FooterSection.tsx`
- `src/components/home/HeroSection.css`
- `src/components/home/HeroSection.tsx`
- `src/components/home/RestaurantSection.tsx`
- `src/components/home/SearchAndCategories.tsx`
- `src/components/home/SectionShowcaseHeader.tsx`
- `src/components/home/SolidaritySection.tsx`
- `src/components/invoices/AccountingBreakdownCard.tsx`
- `src/components/invoices/AccountingCockpit.tsx`
- `src/components/invoices/InvoiceDetailAccordion.tsx`
- `src/components/invoices/InvoiceLineTable.tsx`
- `src/components/invoices/InvoiceOperationDetailDialog.tsx`
- `src/components/invoices/TokPayableInvoiceDialog.tsx`
- `src/components/invoices/TokPayableInvoiceDocument.tsx`
- `src/components/launch/LaunchArtwork.css`
- `src/components/launch/LaunchArtwork.tsx`
- `src/components/launch/LaunchExperience.css`
- `src/components/launch/LaunchExperience.tsx`
- `src/components/launch/LaunchGateProvider.tsx`
- `src/components/legal/LegalConsentBanner.tsx`
- `src/components/list/SortControls.tsx`
- `src/components/marketing/MarketingHostBoundary.tsx`
- `src/components/marketing/MarketingMetaConnection.tsx`
- `src/components/marketing/MarketingProtectedRoute.tsx`
- `src/components/marketing/MarketingShared.tsx`
- `src/components/marketing/MarketingSourceDiscovery.tsx`
- `src/components/marketing/MarketingWorkspaceChrome.tsx`
- `src/components/marketing/views/MarketingActivityView.tsx`
- `src/components/marketing/views/MarketingAgentView.tsx`
- `src/components/marketing/views/MarketingAudiencesView.tsx`
- `src/components/marketing/views/MarketingAutomationsView.tsx`
- `src/components/marketing/views/MarketingCalendarView.tsx`
- `src/components/marketing/views/MarketingCampaignsView.tsx`
- `src/components/marketing/views/MarketingFaqView.tsx`
- `src/components/marketing/views/MarketingGovernanceView.tsx`
- `src/components/marketing/views/MarketingIntegrationsView.tsx`
- `src/components/marketing/views/MarketingOutreachView.tsx`
- `src/components/marketing/views/MarketingOverviewView.tsx`
- `src/components/marketing/views/MarketingResultsView.tsx`
- `src/components/navigation/BackNavigationButton.tsx`
- `src/components/navigation/RoleSpaceMenuSection.tsx`
- `src/components/navigation/RoleSpaceSwitcher.tsx`
- `src/components/notifications/DayNotificationBadge.tsx`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationHistoryList.tsx`
- `src/components/notifications/NotificationMenuBadge.tsx`
- `src/components/notifications/PushNotificationSettings.tsx`
- `src/components/operations/OperationViewToggle.tsx`
- `src/components/orders/DeliveryProofCard.tsx`
- `src/components/orders/OrderPaymentBreakdown.tsx`
- `src/components/orders/order-payment-breakdown-utils.ts`
- `src/components/restaurant/RestaurantDailyDishCard.tsx`
- `src/components/security/TurnstileCaptcha.tsx`
- `src/components/signup/SignupApplicationStatusCard.tsx`
- `src/components/social/SocialComposer.tsx`
- `src/components/social/SocialMediaCarousel.tsx`
- `src/components/social/SocialPostBoostDialog.tsx`
- `src/components/social/SocialPostCard.tsx`
- `src/components/social/TrackedSocialPostCard.tsx`
- `src/components/support/TokAiSupportChat.tsx`
- `src/components/theme/ThemeToggleButton.tsx`
- `src/components/ui/accordion.tsx`
- `src/components/ui/ai-generation-progress-dialog.tsx`
- `src/components/ui/ai-loading-state.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/app-loading-screen.tsx`
- `src/components/ui/aspect-ratio.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/breadcrumb.tsx`
- `src/components/ui/button-variants.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/chart.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/context-menu.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/drawer.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/form.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/input-otp.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/menubar.tsx`
- `src/components/ui/navigation-menu.tsx`
- `src/components/ui/operation-progress-dialog.tsx`
- `src/components/ui/pagination.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/resizable.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/slider.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/toast.tsx`
- `src/components/ui/toaster.tsx`
- `src/components/ui/toggle-group.tsx`
- `src/components/ui/toggle-variants.ts`
- `src/components/ui/toggle.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/use-toast.ts`

</details>

<details><summary>frontend-hook (22)</summary>

- `src/hooks/use-estimated-progress.ts`
- `src/hooks/use-mobile.tsx`
- `src/hooks/use-toast.ts`
- `src/hooks/useAdminLaunchPacks.ts`
- `src/hooks/useCommercialDemoAccount.ts`
- `src/hooks/useCourierPresenceSync.ts`
- `src/hooks/useCourierProfile.ts`
- `src/hooks/useCourierPushStatus.ts`
- `src/hooks/useGoogleBusinessBooking.ts`
- `src/hooks/useLaunchPack.ts`
- `src/hooks/useMealFormulaDetection.ts`
- `src/hooks/useNotificationCenter.ts`
- `src/hooks/useRealtimeDelivery.ts`
- `src/hooks/useRealtimeNotifications.ts`
- `src/hooks/useRealtimeOrder.ts`
- `src/hooks/useSeoMeta.ts`
- `src/hooks/useSessionStorageState.ts`
- `src/hooks/useSignupApplication.ts`
- `src/hooks/useSocialFeed.ts`
- `src/hooks/useSponsoredImpressionOnView.ts`
- `src/hooks/useTokLogo.ts`
- `src/hooks/useTokOne.ts`

</details>

<details><summary>frontend-page (127)</summary>

- `src/pages/APropos.tsx`
- `src/pages/Abonnement.tsx`
- `src/pages/AccountSecurity.tsx`
- `src/pages/ActualitePost.tsx`
- `src/pages/Actualites.tsx`
- `src/pages/Aide.tsx`
- `src/pages/AlternativeCommissionCouvert.tsx`
- `src/pages/AntiGaspi.tsx`
- `src/pages/Auth.tsx`
- `src/pages/BudgetAuto.tsx`
- `src/pages/CGU.tsx`
- `src/pages/ChefsTable.tsx`
- `src/pages/ClientDashboardHome.tsx`
- `src/pages/ClientReviews.tsx`
- `src/pages/ComingSoon.tsx`
- `src/pages/Commandes.tsx`
- `src/pages/CommercialComptabilite.tsx`
- `src/pages/CommercialDemoLive.tsx`
- `src/pages/CommercialProspection.tsx`
- `src/pages/ConditionsRestaurateurs.tsx`
- `src/pages/Contact.tsx`
- `src/pages/Cookies.tsx`
- `src/pages/CreneauxGarantis.tsx`
- `src/pages/CustomerMemory.tsx`
- `src/pages/FlexPrixBas.tsx`
- `src/pages/GarantieQualite.tsx`
- `src/pages/GiftPoints.tsx`
- `src/pages/Index.tsx`
- `src/pages/LocalRestaurants.tsx`
- `src/pages/MatchGroupes.tsx`
- `src/pages/MiamzSolidaires.tsx`
- `src/pages/MultiRestaurant.tsx`
- `src/pages/MultiStop.tsx`
- `src/pages/NotFound.tsx`
- `src/pages/Notifications.tsx`
- `src/pages/OAuthConsent.tsx`
- `src/pages/OrderConfirmation.tsx`
- `src/pages/PacksRestaurateur.tsx`
- `src/pages/Panier.tsx`
- `src/pages/PolitiqueConfidentialite.tsx`
- `src/pages/Profil.tsx`
- `src/pages/Recherche.tsx`
- `src/pages/Reservations.tsx`
- `src/pages/RestaurantBookingRedirect.tsx`
- `src/pages/RestaurantDetail.tsx`
- `src/pages/RestaurateursGeneve.tsx`
- `src/pages/RestaurateursGoogleBusiness.tsx`
- `src/pages/SuiviCommande.tsx`
- `src/pages/TokConnect.tsx`
- `src/pages/TokConnectDeveloper.tsx`
- `src/pages/TokOne.tsx`
- `src/pages/TokPulse.tsx`
- `src/pages/VentesFlash.tsx`
- `src/pages/WorkspaceChooser.tsx`
- `src/pages/ZeroAttente.tsx`
- `src/pages/admin/AdminActualites.tsx`
- `src/pages/admin/AdminAiOperations.tsx`
- `src/pages/admin/AdminAuditLogs.tsx`
- `src/pages/admin/AdminAvis.tsx`
- `src/pages/admin/AdminCatalog.tsx`
- `src/pages/admin/AdminCompta.tsx`
- `src/pages/admin/AdminComptaAi.tsx`
- `src/pages/admin/AdminComptaInflow.tsx`
- `src/pages/admin/AdminComptaOutflow.tsx`
- `src/pages/admin/AdminComptaPrintShell.tsx`
- `src/pages/admin/AdminCrm.tsx`
- `src/pages/admin/AdminGoogleBusiness.tsx`
- `src/pages/admin/AdminGuardian.tsx`
- `src/pages/admin/AdminHome.tsx`
- `src/pages/admin/AdminLaunchPacks.tsx`
- `src/pages/admin/AdminLoyalty.tsx`
- `src/pages/admin/AdminNotifications.tsx`
- `src/pages/admin/AdminOperationsCenter.tsx`
- `src/pages/admin/AdminOrdersReservations.tsx`
- `src/pages/admin/AdminPlatformConfig.tsx`
- `src/pages/admin/AdminPrintOrders.tsx`
- `src/pages/admin/AdminRestaurants.tsx`
- `src/pages/admin/AdminSinistres.tsx`
- `src/pages/admin/AdminSupportResolution.tsx`
- `src/pages/admin/AdminTokConnect.tsx`
- `src/pages/admin/AdminUtilisateurs.tsx`
- `src/pages/admin/DropsManagement.tsx`
- `src/pages/admin/adminComptaShared.ts`
- `src/pages/admin/adminOrdersReservationsShared.ts`
- `src/pages/courier/CourierEarnings.tsx`
- `src/pages/courier/CourierHome.tsx`
- `src/pages/courier/CourierJobs.tsx`
- `src/pages/courier/CourierNotifications.tsx`
- `src/pages/courier/CourierProfile.tsx`
- `src/pages/dashboard/DashboardAccountBilling.tsx`
- `src/pages/dashboard/DashboardActualites.tsx`
- `src/pages/dashboard/DashboardAdvisor.tsx`
- `src/pages/dashboard/DashboardAvis.tsx`
- `src/pages/dashboard/DashboardCampagneOverview.tsx`
- `src/pages/dashboard/DashboardCampagnes.tsx`
- `src/pages/dashboard/DashboardCampaignStudio.tsx`
- `src/pages/dashboard/DashboardCommandes.tsx`
- `src/pages/dashboard/DashboardComparaison.tsx`
- `src/pages/dashboard/DashboardContext.tsx`
- `src/pages/dashboard/DashboardCrm.tsx`
- `src/pages/dashboard/DashboardEmptyState.tsx`
- `src/pages/dashboard/DashboardFactures.tsx`
- `src/pages/dashboard/DashboardFacturesInflow.tsx`
- `src/pages/dashboard/DashboardFacturesOutflow.tsx`
- `src/pages/dashboard/DashboardFormules.tsx`
- `src/pages/dashboard/DashboardHome.tsx`
- `src/pages/dashboard/DashboardInvoiceSettings.tsx`
- `src/pages/dashboard/DashboardMenu.tsx`
- `src/pages/dashboard/DashboardNotifications.tsx`
- `src/pages/dashboard/DashboardOffres.tsx`
- `src/pages/dashboard/DashboardPerformances.tsx`
- `src/pages/dashboard/DashboardPhotos.tsx`
- `src/pages/dashboard/DashboardPlanSalle.tsx`
- `src/pages/dashboard/DashboardPromotions.tsx`
- `src/pages/dashboard/DashboardReseauxSociaux.tsx`
- `src/pages/dashboard/DashboardReservations.tsx`
- `src/pages/dashboard/DashboardRestaurant.tsx`
- `src/pages/dashboard/DashboardService.tsx`
- `src/pages/dashboard/DashboardSupport.tsx`
- `src/pages/dashboard/DashboardTokConnect.tsx`
- `src/pages/dashboard/DashboardVentesFlash.tsx`
- `src/pages/dashboard/dashboardFacturesShared.ts`
- `src/pages/dashboard/useDashboardRestaurant.ts`
- `src/pages/dashboard/useOwnerRestaurants.ts`
- `src/pages/marketing/MarketingLogin.tsx`
- `src/pages/marketing/MarketingWorkspace.tsx`
- `src/pages/tok-connect/TokConnectMcpWidget.tsx`

</details>

<details><summary>frontend-source (32)</summary>

- `src/App.css`
- `src/App.tsx`
- `src/data/genevaCommercialProspects.ts`
- `src/data/theForkCommercialProspects.ts`
- `src/home-section-headers.css`
- `src/index.css`
- `src/integrations/supabase/authStorage.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/demoClient.ts`
- `src/integrations/supabase/types.ts`
- `src/main.tsx`
- `src/marketing/MarketingSessionContext.tsx`
- `src/marketing/MarketingSessionProvider.tsx`
- `src/marketing/autopilotClient.ts`
- `src/marketing/autopilotTypes.ts`
- `src/marketing/fallbackSnapshot.ts`
- `src/marketing/marketingBffClient.ts`
- `src/marketing/marketingClient.ts`
- `src/marketing/offsetPage.ts`
- `src/marketing/types.ts`
- `src/marketing/useMarketingAutopilot.ts`
- `src/marketing/useMarketingOperations.ts`
- `src/marketing/useMarketingUrlState.ts`
- `src/marketing/zurichTime.ts`
- `src/styles/commercial-prospection-markers.css`
- `src/styles/golden-tok-chefs-table-hero.css`
- `src/styles/golden-tok-chefs-table-v2.css`
- `src/styles/golden-tok-chefs-table-v3.css`
- `src/styles/golden-tok-chefs-table-v4.css`
- `src/styles/golden-tok-chefs-table.css`
- `src/test/setup.ts`
- `src/vite-env.d.ts`

</details>

<details><summary>generated-reference (2)</summary>

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`

</details>

<details><summary>ios (37)</summary>

- `ios/.appstore-build3-icon`
- `ios/.appstore-build4-storekit`
- `ios/.appstore-build5-icon-fix`
- `ios/.appstore-build6-logotok`
- `ios/.appstore-finalize-v1`
- `ios/.appstore-finalize-v2`
- `ios/.appstore-finalize-v3`
- `ios/.appstore-finalize-v4`
- `ios/.appstore-screenshot-upload-v1`
- `ios/.appstore-screenshot-upload-v2`
- `ios/.appstore-submit-v5`
- `ios/.appstore-submit-v6`
- `ios/.appstore-submit-v7`
- `ios/.gitignore`
- `ios/App/App.xcodeproj/project.pbxproj`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist`
- `ios/App/App/App.entitlements`
- `ios/App/App/AppDelegate.swift`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json`
- `ios/App/App/Assets.xcassets/Contents.json`
- `ios/App/App/Assets.xcassets/Splash.imageset/Contents.json`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png`
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`
- `ios/App/App/Base.lproj/LaunchScreen.storyboard`
- `ios/App/App/Base.lproj/Main.storyboard`
- `ios/App/App/Info.plist`
- `ios/App/App/PrivacyInfo.xcprivacy`
- `ios/App/CapApp-SPM/.gitignore`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/App/CapApp-SPM/README.md`
- `ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift`
- `ios/App/TokPulseWidget/Info.plist`
- `ios/App/TokPulseWidget/TokPulseWidget.swift`
- `ios/TheTok_AppStore_Final_Assets.zip`
- `ios/debug.xcconfig`

</details>

<details><summary>public-asset (333)</summary>

- `public/.well-known/apple-app-site-association`
- `public/.well-known/assetlinks.json`
- `public/4c81caf5-ee6d-400c-8605-c61d010a05de.png`
- `public/5a64288a-9712-4aae-8293-b0570ecd8668.png`
- `public/64b6c2b1-eeb7-4cec-9f09-cb58519c17bc.png`
- `public/B3A185C6-2CC3-471E-AC4D-3A4B7461084E.png`
- `public/ChatGPT Image 16 juin 2026, 12_50_15.png`
- `public/ChatGPT Image 16 juin 2026, 13_36_20.png`
- `public/ChatGPT Image 16 juin 2026, 13_36_31.png`
- `public/ChatGPT Image 22 mars 2026, 23_46_27.png`
- `public/ChatGPT Image 30 mai 2026, 05_49_11.png`
- `public/ChatGPT Image 8 juin 2026, 02_46_54.png`
- `public/ChatGPT Image 8 juin 2026, 02_57_38.png`
- `public/Chef TOK au bord du lac Léman.png`
- `public/Chef jovial au bord du lac Léman.png`
- `public/Image Codex 3 sept. 2026, 02_31_12.png`
- `public/Image Codex 3 sept. 2026, 11_06_16.png`
- `public/Image Codex 3 sept. 2026, 11_12_46.png`
- `public/Miamz2.webp`
- `public/Miamz3.webp`
- `public/aide.png`
- `public/banniere1.png`
- `public/chef.png`
- `public/chef2.png`
- `public/chef3.png`
- `public/chefbg.webp`
- `public/chefbg2.webp`
- `public/data/geneva-commercial-prospects.json`
- `public/data/thefork-geneva-commercial-prospects.json`
- `public/dd35c5e3-5254-41eb-afdd-b3d5b3f43fcc.png`
- `public/desig app/1_0000_template_pub_04.png`
- `public/desig app/1_0001_template_pub_08.png`
- `public/desig app/1_0002_template_pub_01.png`
- `public/desig app/1_0003_template_pub_03.png`
- `public/desig app/1_0004_template_pub_02.png`
- `public/desig app/1_0005_template_pub_06.png`
- `public/desig app/1_0006_template_pub_05.png`
- `public/desig app/1_0007_Calque-1.png`
- `public/desig app/assiette.png`
- `public/desig app/burger.png`
- `public/desig app/cadeau.png`
- `public/desig app/calendrier.png`
- `public/desig app/chefsection.png`
- `public/desig app/chefsection2.png`
- `public/desig app/db166d8e-afaa-475a-83b0-8510279ca071.png`
- `public/desig app/flamme.png`
- `public/favicon-180x180.png`
- `public/favicon-192x192.png`
- `public/favicon-48x48.png`
- `public/favicon-512x512.png`
- `public/favicon.ico`
- `public/firebase-messaging-sw.js`
- `public/fond fun.png`
- `public/fond.jpg`
- `public/fond.png`
- `public/fond3.png`
- `public/fond32.png`
- `public/fond35.png`
- `public/fond4.png`
- `public/fond5.png`
- `public/fond9.png`
- `public/fondacceuil.png`
- `public/fondacceuildesk.png`
- `public/fondbanniere.png`
- `public/fondbanniere2.png`
- `public/fonts/anton/Anton-Regular.ttf`
- `public/fonts/anton/OFL.txt`
- `public/help.png`
- `public/higgsfield/.gitignore`
- `public/higgsfield/83192f58-5841-437e-a320-e115880ffe21.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 18_33_49.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 18_34_13.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 18_34_31.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 18_35_46.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 18_36_01.png`
- `public/higgsfield/ChatGPT Image 16 mai 2026, 19_25_39.png`
- `public/higgsfield/Sans titre-2egeg.png`
- `public/higgsfield/f2753607-f87b-470d-89bd-0250ce1fb6c5.png`
- `public/higgsfield/hf_20260518_042910_98da3ceb-a1f6-403f-b859-02b809cb2624.mp4`
- `public/higgsfield/tok-intro-desktop-poster.webp`
- `public/higgsfield/tok-intro-desktop.mp4`
- `public/higgsfield/tok-intro-mobile-poster.webp`
- `public/higgsfield/tok-intro-mobile.mp4`
- `public/higgsfield/wfewf.jpg`
- `public/images/1.webp`
- `public/images/WhatsApp Image 2026-03-12 at 19.54.57.jpeg`
- `public/images/acai bowl.jpg`
- `public/images/assiette mixte libanaise.jpeg`
- `public/images/baklava.jpg`
- `public/images/bd805b36-a248-4869-8337-95f0af9cbdb2.webp`
- `public/images/bruschetta.jpg`
- `public/images/burger truffe.webp`
- `public/images/burgers-wings.jpeg`
- `public/images/burrito boeuf.jpg`
- `public/images/burrito poulet.jpg`
- `public/images/byriani.jpg`
- `public/images/c5fe8c6d-fbae-4456-8191-c4b2f95bdea5.webp`
- `public/images/california roll.jpg`
- `public/images/calzone.webp`
- `public/images/chicken-bucket-fries.jpeg`
- `public/images/churros.jpg`
- `public/images/crispy-chicken.jpeg`
- `public/images/dashboard-3d/admin-ai-operations.webp`
- `public/images/dashboard-3d/admin-audit.webp`
- `public/images/dashboard-3d/admin-catalog.webp`
- `public/images/dashboard-3d/admin-incidents.webp`
- `public/images/dashboard-3d/admin-loyalty.webp`
- `public/images/dashboard-3d/admin-operations.webp`
- `public/images/dashboard-3d/admin-restaurants.webp`
- `public/images/dashboard-3d/admin-users.webp`
- `public/images/dashboard-3d/analytics.webp`
- `public/images/dashboard-3d/client-orders-empty.webp`
- `public/images/dashboard-3d/commercial-accounting-empty.webp`
- `public/images/dashboard-3d/courier-jobs-empty.webp`
- `public/images/dashboard-3d/creations.webp`
- `public/images/dashboard-3d/gallery.webp`
- `public/images/dashboard-3d/marketing.webp`
- `public/images/dashboard-3d/photo-add.webp`
- `public/images/dashboard-3d/photopro.webp`
- `public/images/dashboard-3d/restaurant-advisor.webp`
- `public/images/dashboard-3d/restaurant-billing.webp`
- `public/images/dashboard-3d/restaurant-campaigns.webp`
- `public/images/dashboard-3d/restaurant-comparison.webp`
- `public/images/dashboard-3d/restaurant-crm.webp`
- `public/images/dashboard-3d/restaurant-floor-plan.webp`
- `public/images/dashboard-3d/restaurant-formulas.webp`
- `public/images/dashboard-3d/restaurant-invoice-settings.webp`
- `public/images/dashboard-3d/restaurant-news.webp`
- `public/images/dashboard-3d/restaurant-orders.webp`
- `public/images/dashboard-3d/restaurant-pack.webp`
- `public/images/dashboard-3d/restaurant-performance.webp`
- `public/images/dashboard-3d/restaurant-profile.webp`
- `public/images/dashboard-3d/restaurant-promotions.webp`
- `public/images/dashboard-3d/restaurant-reviews.webp`
- `public/images/dashboard-3d/restaurant-service.webp`
- `public/images/dashboard-3d/restaurant-social.webp`
- `public/images/dashboard-3d/restaurant-support.webp`
- `public/images/dashboard-3d/restaurant-tok-connect.webp`
- `public/images/doner-kebab-plate.jpeg`
- `public/images/edamame.webp`
- `public/images/falafel wrap.jpeg`
- `public/images/fattouche.webp`
- `public/images/filets de perche.jpg`
- `public/images/fond.png`
- `public/images/fondue-moitie-moitie.jpg`
- `public/images/gfc-fried-chicken.jpeg`
- `public/images/gourmet-burgers.jpeg`
- `public/images/greek-gyros.jpeg`
- `public/images/guacamole.jpg`
- `public/images/gulam jamun.jpg`
- `public/images/gyoza porc.webp`
- `public/images/home/tok-geneve-desktop-reference.jpg`
- `public/images/home/tok-geneve-desktop.webp`
- `public/images/home/tok-geneve-mobile-original.webp`
- `public/images/home/tok-geneve-mobile.webp`
- `public/images/home/tok-leman-signature.webp`
- `public/images/houmous.webp`
- `public/images/indian-curry-bowls.jpeg`
- `public/images/indian-feast.jpeg`
- `public/images/kebab-box-spread.jpeg`
- `public/images/kombucha.jpeg`
- `public/images/lebanese-mezze.jpeg`
- `public/images/limonade menthe.jpeg`
- `public/images/lobster-roll-fries.jpeg`
- `public/images/longeole.avif`
- `public/images/mango lassi.jpeg`
- `public/images/meringue-double.webp`
- `public/images/milkshake-oreo.jpg`
- `public/images/milkshake-vanille.jpeg`
- `public/images/miniatures/01_africain.png`
- `public/images/miniatures/02_americain.png`
- `public/images/miniatures/03_bistro.png`
- `public/images/miniatures/04_boulangerie.png`
- `public/images/miniatures/05_brunch.png`
- `public/images/miniatures/06_burger.png`
- `public/images/miniatures/07_cafe.png`
- `public/images/miniatures/08_chinois.png`
- `public/images/miniatures/09_creole.png`
- `public/images/miniatures/1.png`
- `public/images/miniatures/10_desserts.png`
- `public/images/miniatures/11_francais.png`
- `public/images/miniatures/12_gastronomique.png`
- `public/images/miniatures/13_grillades.png`
- `public/images/miniatures/14_halal.png`
- `public/images/miniatures/15_healthy.png`
- `public/images/miniatures/16_indien.png`
- `public/images/miniatures/17_italien.png`
- `public/images/miniatures/18_japonais.png`
- `public/images/miniatures/19_kebab.png`
- `public/images/miniatures/2.png`
- `public/images/miniatures/20_libanais.png`
- `public/images/miniatures/21_marocain.png`
- `public/images/miniatures/22_mediterranee.png`
- `public/images/miniatures/23_mexicain.png`
- `public/images/miniatures/24_pakistanais.png`
- `public/images/miniatures/25_pizza.png`
- `public/images/miniatures/26_sushi.png`
- `public/images/miniatures/27_ramen.png`
- `public/images/miniatures/28_thai.png`
- `public/images/miniatures/29_turc.png`
- `public/images/miniatures/3.png`
- `public/images/miniatures/30_salades.png`
- `public/images/miniatures/31_poke.png`
- `public/images/miniatures/32_petit-dejeuner.png`
- `public/images/miniatures/33_pates.png`
- `public/images/miniatures/34_fondue-suisse.png`
- `public/images/miniatures/35_patisserie.png`
- `public/images/miniatures/36_sandwich.png`
- `public/images/miniatures/37_street-food.png`
- `public/images/miniatures/38_vegetarien.png`
- `public/images/miniatures/39_vegan.png`
- `public/images/miniatures/bulle.png`
- `public/images/miniatures/manifest.json`
- `public/images/mixed-grill-platter.jpeg`
- `public/images/mochi-glaces.jpg`
- `public/images/naan.jpeg`
- `public/images/nachos.webp`
- `public/images/octopus-fine-dining.jpeg`
- `public/images/onion rings.jpg`
- `public/images/palak paneer.jpg`
- `public/images/pannacotta.webp`
- `public/images/pasta-assortment.jpeg`
- `public/images/pattern.svg`
- `public/images/pizza diavola.avif`
- `public/images/pizza quatre fromage.jpg`
- `public/images/poke-bowls.jpeg`
- `public/images/prosciutto e rucola.avif`
- `public/images/quesadillas.jpeg`
- `public/images/raclette.jpg`
- `public/images/raita.webp`
- `public/images/ramen miso.jpg`
- `public/images/rosti-bernois.jpg`
- `public/images/rotisserie-chicken.jpeg`
- `public/images/salade-du-marche.jpg`
- `public/images/salmon roll.webp`
- `public/images/samosa.jpg`
- `public/images/screenshot-1782328742823.png`
- `public/images/section-headers/864DB634-B132-4A7E-8443-CCB38318F96D.jpeg`
- `public/images/section-headers/A5F314DA-0208-45A3-8C73-EAB3F910059F.jpeg`
- `public/images/section-headers/calendar-3d.png`
- `public/images/section-headers/fire-3d.png`
- `public/images/section-headers/gift-3d.png`
- `public/images/section-headers/heart-3d.png`
- `public/images/section-headers/pin-3d.png`
- `public/images/section-headers/plate-3d.png`
- `public/images/section-headers/scooter-3d.png`
- `public/images/section-headers/shopping-bags-3d.png`
- `public/images/shawarma poulet.jpeg`
- `public/images/smash-burger-single.jpeg`
- `public/images/smash-burgers.jpeg`
- `public/images/smoothie vert.jpg`
- `public/images/stack-shake-spread.jpeg`
- `public/images/taboule.webp`
- `public/images/tacos carnitas.webp`
- `public/images/tarte aux noix.webp`
- `public/images/tempura crevettes.jpg`
- `public/images/thai-curry-spread.jpeg`
- `public/images/thai-pad-thai.jpeg`
- `public/images/thai-spread.jpeg`
- `public/images/tok-connect/chatgpt-mcp-dcr-error.png`
- `public/images/tok-connect/chatgpt-mcp-new-app.png`
- `public/images/tok-connect/chatgpt-mcp-oauth-endpoints.png`
- `public/images/tok-connect/chatgpt-mcp-oidc.png`
- `public/images/tok-connect/tok-connect-widget-details.svg`
- `public/images/tok-connect/tok-connect-widget-restaurants.svg`
- `public/images/tok-restaurant-placeholder.svg`
- `public/images/tokone.webp`
- `public/images/truffe nera pizza`
- `public/images/truffe nera.webp`
- `public/images/veggie burger.jpg`
- `public/images/¨kébbé.jpeg`
- `public/launch/LICENSE-anton.txt`
- `public/launch/LICENSE-barlow.txt`
- `public/launch/anton.woff2`
- `public/launch/background.png`
- `public/launch/barlow.woff2`
- `public/launch/chef.png`
- `public/launch/props.png`
- `public/logotok.png`
- `public/mangez.png`
- `public/manifest.json`
- `public/miamz.png`
- `public/mockup.png`
- `public/placeholder.svg`
- `public/plan salle/generated-host-stand.png`
- `public/plan salle/generated-service-station.png`
- `public/plan salle/generated-stool.png`
- `public/plan salle/plan-de-salle_0000_Calque-1.png`
- `public/plan salle/plan-de-salle_0002_Calque-15.png`
- `public/plan salle/plan-de-salle_0003_Calque-3.png`
- `public/plan salle/plan-de-salle_0004_Calque-4.png`
- `public/plan salle/plan-de-salle_0005_Calque-5.png`
- `public/plan salle/plan-de-salle_0006_Calque-6.png`
- `public/plan salle/plan-de-salle_0008_Calque-8.png`
- `public/plan salle/plan-de-salle_0009_Calque-10.png`
- `public/plan salle/plan-de-salle_0010_Calque-11.png`
- `public/plan salle/plan-de-salle_0012_Supprimer-les-modifications-de-l’outil.png`
- `public/plan salle/plan-de-salle_0013_Calque-14.png`
- `public/plan salle/plan-de-salle_0014_Calque-12.png`
- `public/plan salle/plan-de-salle_0015_Calque-13.png`
- `public/playball-font/Playball-q6o1.ttf`
- `public/playball-font/info.txt`
- `public/playball-font/misc/OFL.txt`
- `public/pub.jpg`
- `public/robots.txt`
- `public/seo-trust-runtime.js`
- `public/sitemap-actualites.xml`
- `public/sitemap-pages.xml`
- `public/sitemap-restaurants.xml`
- `public/sitemap.xml`
- `public/tok-reference-food-webp/tok-reference-food-01.webp`
- `public/tok-reference-food-webp/tok-reference-food-02.webp`
- `public/tok-reference-food-webp/tok-reference-food-03.webp`
- `public/tok-reference-food-webp/tok-reference-food-04.webp`
- `public/tok-reference-food-webp/tok-reference-food-05.webp`
- `public/tok-reference-food-webp/tok-reference-food-06.webp`
- `public/tok-reference-food-webp/tok-reference-food-07.webp`
- `public/tok-reference-food-webp/tok-reference-food-08.webp`
- `public/tok-reference-food-webp/tok-reference-food-09.webp`
- `public/tok-reference-food-webp/tok-reference-food-10.webp`
- `public/tok-reference-food-webp/tok-reference-food-11.webp`
- `public/tok-reference-food-webp/tok-reference-food-12.webp`
- `public/tok-reference-food-webp/tok-reference-food-13.webp`
- `public/tok-slot-machine/assets/Livreur.png`
- `public/tok-slot-machine/assets/chef2.png`
- `public/tok-slot-machine/assets/lacuillere.png`
- `public/tok-slot-machine/assets/mangez.png`
- `public/tok-slot-machine/assets/paytable.png`
- `public/tok-slot-machine/index.html`
- `public/tok-slot-machine/slot-machine.js`
- `public/tok-table-v2/app.js`
- `public/tok-table-v2/index.html`
- `public/tok-table-v2/styles.css`

</details>

<details><summary>repository-file (141)</summary>

- `.agents/skills/stripe-best-practices/SKILL.md`
- `.agents/skills/stripe-best-practices/references/billing.md`
- `.agents/skills/stripe-best-practices/references/connect.md`
- `.agents/skills/stripe-best-practices/references/payments.md`
- `.agents/skills/stripe-best-practices/references/security.md`
- `.agents/skills/stripe-best-practices/references/tax.md`
- `.agents/skills/stripe-best-practices/references/treasury.md`
- `.agents/skills/stripe-directory/SKILL.md`
- `.agents/skills/stripe-projects/SKILL.md`
- `.agents/skills/supabase-postgres-best-practices/CHANGELOG.md`
- `.agents/skills/supabase-postgres-best-practices/SKILL.md`
- `.agents/skills/supabase-postgres-best-practices/references/_contributing.md`
- `.agents/skills/supabase-postgres-best-practices/references/_sections.md`
- `.agents/skills/supabase-postgres-best-practices/references/_template.md`
- `.agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md`
- `.agents/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md`
- `.agents/skills/supabase-postgres-best-practices/references/conn-idle-timeout.md`
- `.agents/skills/supabase-postgres-best-practices/references/conn-limits.md`
- `.agents/skills/supabase-postgres-best-practices/references/conn-pooling.md`
- `.agents/skills/supabase-postgres-best-practices/references/conn-prepared-statements.md`
- `.agents/skills/supabase-postgres-best-practices/references/data-batch-inserts.md`
- `.agents/skills/supabase-postgres-best-practices/references/data-n-plus-one.md`
- `.agents/skills/supabase-postgres-best-practices/references/data-pagination.md`
- `.agents/skills/supabase-postgres-best-practices/references/data-upsert.md`
- `.agents/skills/supabase-postgres-best-practices/references/lock-advisory.md`
- `.agents/skills/supabase-postgres-best-practices/references/lock-deadlock-prevention.md`
- `.agents/skills/supabase-postgres-best-practices/references/lock-short-transactions.md`
- `.agents/skills/supabase-postgres-best-practices/references/lock-skip-locked.md`
- `.agents/skills/supabase-postgres-best-practices/references/monitor-explain-analyze.md`
- `.agents/skills/supabase-postgres-best-practices/references/monitor-pg-stat-statements.md`
- `.agents/skills/supabase-postgres-best-practices/references/monitor-vacuum-analyze.md`
- `.agents/skills/supabase-postgres-best-practices/references/query-composite-indexes.md`
- `.agents/skills/supabase-postgres-best-practices/references/query-covering-indexes.md`
- `.agents/skills/supabase-postgres-best-practices/references/query-index-types.md`
- `.agents/skills/supabase-postgres-best-practices/references/query-missing-indexes.md`
- `.agents/skills/supabase-postgres-best-practices/references/query-partial-indexes.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-constraints.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-data-types.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-foreign-key-indexes.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-lowercase-identifiers.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-partitioning.md`
- `.agents/skills/supabase-postgres-best-practices/references/schema-primary-keys.md`
- `.agents/skills/supabase-postgres-best-practices/references/security-privileges.md`
- `.agents/skills/supabase-postgres-best-practices/references/security-rls-basics.md`
- `.agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md`
- `.agents/skills/supabase/CHANGELOG.md`
- `.agents/skills/supabase/SKILL.md`
- `.agents/skills/supabase/assets/feedback-issue-template.md`
- `.agents/skills/supabase/references/skill-feedback.md`
- `.agents/skills/upgrade-stripe/SKILL.md`
- `.claude/skills/stripe-best-practices/SKILL.md`
- `.claude/skills/stripe-best-practices/references/billing.md`
- `.claude/skills/stripe-best-practices/references/connect.md`
- `.claude/skills/stripe-best-practices/references/payments.md`
- `.claude/skills/stripe-best-practices/references/security.md`
- `.claude/skills/stripe-best-practices/references/tax.md`
- `.claude/skills/stripe-best-practices/references/treasury.md`
- `.claude/skills/stripe-directory/SKILL.md`
- `.claude/skills/stripe-projects/SKILL.md`
- `.claude/skills/upgrade-stripe/SKILL.md`
- `.codex-audit-_-390x844.png`
- `.codex-audit-_anti_gaspi-390x844.png`
- `.codex-audit-_contact-390x844.png`
- `.codex-audit-_ventes_flash-390x844.png`
- `.codex-mobile-390x844.png`
- `.codex-mobile-430x932.png`
- `.codex-mobile-bottom-3px.png`
- `.codex-mobile-opacity86-390x844.png`
- `.codex-mobile-opacity94-390x844.png`
- `.codex-mobile-overlay-390x844.png`
- `.codex-mobile-overlay-430x932.png`
- `.codex-mobile-quelques-clics-orange.png`
- `.codex-mobile-subtitle-readable.png`
- `.codex/hooks.json`
- `.env.example`
- `.gitattributes`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/dependabot.yml`
- `.gitignore`
- `.kombai/stack.json`
- `.pnpm-store/v10/files/b7/ca3e00f05ddd45aed19f2bcad1ce71addf370ffb10d8b99db34187416d74ae93b07aa9f752d9394a7ed05135ef7afcce7c3988852256b194c4c990d5ea7c06`
- `.pnpm-store/v10/files/b7/cc71f90740600a44e2ba9b80afa1c39ea1d7a8227a6f28478959a42aa6eb404870121574d408b7f028aa356677484c1b44c5d9ccd73fb210553944fba710bf`
- `.vercelignore`
- `AGENTS.md`
- `README.md`
- `README_DEPLOY.md`
- `SECURITY.md`
- `capacitor.config.ts`
- `checkout_content.txt`
- `codex-skills/mobile-fullstack-architect/SKILL.md`
- `codex-skills/mobile-fullstack-architect/agents/openai.yaml`
- `codex-skills/mobile-fullstack-architect/references/react-capacitor.md`
- `codex-skills/mobile-fullstack-architect/references/repo-mapping.md`
- `codex-skills/mobile-fullstack-architect/references/security.md`
- `codex-skills/mobile-fullstack-architect/references/supabase-backend.md`
- `codex-skills/plan 2.txt`
- `codex-skills/plan.txt`
- `components.json`
- `deno.lock`
- `eslint.config.js`
- `implementation_plan_compta.md`
- `implementation_plan_invoice_refactor.md`
- `index.html`
- `middleware.js`
- `package.json`
- `patches/braces@3.0.3.patch`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `postcss.config.js`
- `restaurant-dark-check.png`
- `security_best_practices_report.md`
- `skills-lock.json`
- `tailwind.config.ts`
- `task_compta.md`
- `task_invoice_match.md`
- `tmp/tok-responsive-audit/abonnement-320.png`
- `tmp/tok-responsive-audit/admin-auth-390.png`
- `tmp/tok-responsive-audit/home-320.png`
- `tmp/tok-responsive-audit/home-412-ready.png`
- `tmp/tok-responsive-audit/home-412.png`
- `tmp/tok-responsive-audit/recherche-360.png`
- `tmp/tok-responsive-audit/zero-attente-320.png`
- `tmp/tok-responsive-fixes/abonnement-320-fixed.png`
- `tmp/tok-responsive-fixes/admin-auth-390-fixed.png`
- `tmp/tok-responsive-fixes/home-320-fixed.png`
- `tmp/tok-responsive-fixes/home-menu-320-fixed.png`
- `tmp/tok-responsive-fixes/recherche-390-fixed.png`
- `tmp/tok-responsive-fixes/test.png`
- `tmp/tok-responsive-fixes/zero-attente-320-fixed.png`
- `tools/inspect-prod-schema.js`
- `tools/prod-schema-utf8.json`
- `tools/prod-schema.json`
- `trigger-deploy-20260725.txt`
- `tsconfig.app.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `tsconfig.typecheck.json`
- `vercel.json`
- `vite.config.ts`
- `vitest.config.ts`
- `walkthrough_compta.md`

</details>

<details><summary>server-source (1)</summary>

- `server/marketingBff.ts`

</details>

<details><summary>supabase-configuration (25)</summary>

- `supabase/.branches/_current_branch`
- `supabase/config.toml`
- `supabase/demo-migrations/20260719103746_harden_daily_slot_idempotency.sql`
- `supabase/demo-migrations/20260719140000_dedicated_commercial_demo_project.sql`
- `supabase/demo-migrations/20260719143000_enable_full_commercial_demo_tools.sql`
- `supabase/demo-migrations/20260719150000_simulated_commercial_demo_payments.sql`
- `supabase/demo-migrations/20260719151000_admin_demo_entity_management.sql`
- `supabase/demo-migrations/20260719165000_enforce_commercial_only_roles.sql`
- `supabase/demo-migrations/20260719170000_dedicated_demo_restaurant_read_isolation.sql`
- `supabase/demo-migrations/20260719183000_enforce_provisioned_demo_commercial_role.sql`
- `supabase/demo-migrations/20260720130500_enable_dedicated_demo_runtime_rpcs.sql`
- `supabase/demo-migrations/20260908013000_unlimit_commercial_demo_ai_presentation.sql`
- `supabase/demo-migrations/20261005210000_enforce_shared_commercial_demo_restaurant.sql`
- `supabase/tests/actualites_billing_identity_fixture.sql`
- `supabase/tests/checkout_security_710_assertions.sql`
- `supabase/tests/checkout_security_710_baseline_prerequisites.sql`
- `supabase/tests/checkout_security_710_fixture.sql`
- `supabase/tests/critical_rpc_smoke.sql`
- `supabase/tests/floor_plan_autoplacement_smoke.sql`
- `supabase/tests/generated_print_format_smoke.sql`
- `supabase/tests/launch_gate_access.sql`
- `supabase/tests/launch_gate_fixture.sql`
- `supabase/tests/print_fulfillment_protocol_assertions.sql`
- `supabase/tests/print_fulfillment_protocol_baseline_prerequisites.sql`
- `supabase/tests/print_fulfillment_protocol_fixture.sql`

</details>

<details><summary>test (581)</summary>

- `docs/design/tok-launch/tests/countdown.test.ts`
- `scripts/ci-change-plan.test.mjs`
- `scripts/ci-critical-tests.test.mjs`
- `scripts/ci-migration-version-guard.test.mjs`
- `scripts/dependabot-policy.test.mjs`
- `scripts/dependency-security.test.mjs`
- `scripts/stoppin-venue-seo.test.mjs`
- `scripts/test-actualites-billing-runner.test.mjs`
- `scripts/test-checkout-security-runner.test.mjs`
- `scripts/test-print-protocol-runner.test.mjs`
- `src/test/accounting-ai-public-copy.test.ts`
- `src/test/accounting-dashboard-clarity.test.ts`
- `src/test/accounting-exports.test.ts`
- `src/test/accounting-refund-alignment.test.ts`
- `src/test/actualites-feed-ordering.test.ts`
- `src/test/actualites-personalized-feed-sql.test.ts`
- `src/test/actualites-personalized-trends.test.ts`
- `src/test/actualites-responsive-guards.test.ts`
- `src/test/actualites-restaurateur.test.tsx`
- `src/test/actualites-search-seo.test.ts`
- `src/test/actualites-search.test.tsx`
- `src/test/actualites-sponsored-sql.test.ts`
- `src/test/address-autocomplete-location-bias.test.tsx`
- `src/test/admin-actualites-moderation.test.ts`
- `src/test/admin-actualites-sponsored.test.ts`
- `src/test/admin-audit-log-narrative.test.ts`
- `src/test/admin-catalog-governance.test.ts`
- `src/test/admin-commercial-accounts.test.ts`
- `src/test/admin-commercial-role-assignment.test.ts`
- `src/test/admin-compta-actions.test.ts`
- `src/test/admin-compta-governance.test.ts`
- `src/test/admin-courier-validation.test.ts`
- `src/test/admin-dashboard-rls-visibility.test.ts`
- `src/test/admin-demo-entity-management.test.ts`
- `src/test/admin-destructive-actions.test.ts`
- `src/test/admin-domain-routing.test.ts`
- `src/test/admin-drops-governance.test.ts`
- `src/test/admin-feature-flag-governance.test.ts`
- `src/test/admin-launch-pack-governance.test.ts`
- `src/test/admin-log-reset-governance.test.ts`
- `src/test/admin-loyalty-governance.test.ts`
- `src/test/admin-loyalty-miamz-benefits.test.ts`
- `src/test/admin-marketplace-alerts.test.ts`
- `src/test/admin-mobile-navigation.test.tsx`
- `src/test/admin-mobile-responsiveness.test.ts`
- `src/test/admin-notifications-governance.test.ts`
- `src/test/admin-operations-center.test.ts`
- `src/test/admin-orders-reservations.test.ts`
- `src/test/admin-privileged-ai-chat.test.ts`
- `src/test/admin-production-health.test.ts`
- `src/test/admin-query-limits.test.ts`
- `src/test/admin-restaurants-console.test.ts`
- `src/test/admin-reviews-governance.test.ts`
- `src/test/admin-security-business-audit-hardening.test.ts`
- `src/test/admin-thefork-only-filter.test.ts`
- `src/test/admin-user-roles.test.ts`
- `src/test/admin-users-governance.test.ts`
- `src/test/ai-creations-server-history.test.ts`
- `src/test/ai-gallery-print-media-contract.test.ts`
- `src/test/ai-generation-progress-dialog.test.tsx`
- `src/test/ai-image-reference-security.test.ts`
- `src/test/ai-loading-state.test.tsx`
- `src/test/ai-support-text-normalization.test.ts`
- `src/test/ai-waiting-animation-wiring.test.ts`
- `src/test/analytics-ingest-contract.test.ts`
- `src/test/android-google-play-readiness.test.ts`
- `src/test/application-search-index.test.ts`
- `src/test/audit-hardening-20260711.test.ts`
- `src/test/audit-readiness-financial-ledger.test.ts`
- `src/test/audit-remediation.test.ts`
- `src/test/auth-password-recovery.test.ts`
- `src/test/auth-post-login-routing.test.ts`
- `src/test/auth-provider.test.tsx`
- `src/test/auth-redirect-security.test.ts`
- `src/test/auth-signup-form.test.tsx`
- `src/test/authenticated-security-audit-hardening.test.ts`
- `src/test/b2b-seo-cluster.test.ts`
- `src/test/back-navigation.test.ts`
- `src/test/business-time.test.ts`
- `src/test/business-wiring-audit.test.ts`
- `src/test/campaign-auto-plan.test.ts`
- `src/test/campaign-creative.test.ts`
- `src/test/campaign-credit-revenue-exclusion.test.ts`
- `src/test/campaign-pricing.test.ts`
- `src/test/campaign-targeting.test.ts`
- `src/test/campaign-tracking-integrity.test.ts`
- `src/test/campaign-visibility.test.ts`
- `src/test/carouge-seo-consolidation.test.ts`
- `src/test/cart-checkout-steps.test.ts`
- `src/test/cart-item-list.test.tsx`
- `src/test/cart-replace.test.tsx`
- `src/test/cart-restaurant-summary.test.ts`
- `src/test/cart-session-isolation.test.tsx`
- `src/test/cart-suggestions-personalization.test.ts`
- `src/test/catalog-quality.test.ts`
- `src/test/checkout-pending-restaurant-guards.test.ts`
- `src/test/checkout-return-url-frontend.test.ts`
- `src/test/checkout-stripe-guards.test.ts`
- `src/test/chef-table-checkout-hold-governance.test.ts`
- `src/test/chef-table-vip-miamz-access.test.ts`
- `src/test/client-checkout-session-guards.test.ts`
- `src/test/cloudprinter-edge-runtime.test.ts`
- `src/test/cloudprinter-generation-catalog.test.ts`
- `src/test/cloudprinter-print-quote-regression.test.ts`
- `src/test/cloudprinter-product-geometry.test.ts`
- `src/test/cloudprinter-sandbox-checkout.test.ts`
- `src/test/coming-soon-gate.test.tsx`
- `src/test/commercial-contract-generation.test.ts`
- `src/test/commercial-demo-active-tools.test.ts`
- `src/test/commercial-demo-actualites-isolation.test.ts`
- `src/test/commercial-demo-ai-creation-scope.test.ts`
- `src/test/commercial-demo-ai-policy.test.ts`
- `src/test/commercial-demo-ai-runtime.test.ts`
- `src/test/commercial-demo-ai-ui-copy-contract.test.ts`
- `src/test/commercial-demo-ai-unlimited-presentation-regression.test.ts`
- `src/test/commercial-demo-ai-workspaces.test.ts`
- `src/test/commercial-demo-blanket-rls-cleanup.test.ts`
- `src/test/commercial-demo-client-data-isolation.test.ts`
- `src/test/commercial-demo-client-final-tools-isolation.test.ts`
- `src/test/commercial-demo-client-home.test.ts`
- `src/test/commercial-demo-console-openai.test.ts`
- `src/test/commercial-demo-date.test.ts`
- `src/test/commercial-demo-dedicated-project.test.ts`
- `src/test/commercial-demo-finance-cron-isolation.test.ts`
- `src/test/commercial-demo-formules-promotions-isolation.test.ts`
- `src/test/commercial-demo-frame.test.ts`
- `src/test/commercial-demo-host-payment-isolation.test.ts`
- `src/test/commercial-demo-logins.test.ts`
- `src/test/commercial-demo-menu-mutations-isolation.test.ts`
- `src/test/commercial-demo-migration-workflow.test.ts`
- `src/test/commercial-demo-multispace-fidelity-regression.test.ts`
- `src/test/commercial-demo-offer-mutations.test.ts`
- `src/test/commercial-demo-payment-simulator.test.ts`
- `src/test/commercial-demo-profile-tok-one-isolation.test.ts`
- `src/test/commercial-demo-realtime-backend.test.ts`
- `src/test/commercial-demo-realtime-status.test.ts`
- `src/test/commercial-demo-restaurant-home-isolation.test.ts`
- `src/test/commercial-demo-restaurant-isolation.test.ts`
- `src/test/commercial-demo-restaurant-live-operations.test.ts`
- `src/test/commercial-demo-restaurant-tools.test.ts`
- `src/test/commercial-demo-role-workspaces.test.ts`
- `src/test/commercial-demo-safe-effects.test.tsx`
- `src/test/commercial-demo-scenario.test.ts`
- `src/test/commercial-demo-user-role-rls.test.ts`
- `src/test/commercial-demo-visible-navigation-isolation.test.ts`
- `src/test/commercial-domain-isolation.test.ts`
- `src/test/commercial-multi-space-demo.test.ts`
- `src/test/commercial-prospection-pins.test.ts`
- `src/test/commercial-prospection-thefork-filter.test.ts`
- `src/test/commercial-prospection.test.ts`
- `src/test/commercial-sales-governance.test.ts`
- `src/test/compta-commission-sources.test.ts`
- `src/test/compta-flow.test.ts`
- `src/test/courier.test.ts`
- `src/test/create-checkout-subscription.test.ts`
- `src/test/crm-mfa-recovery.test.ts`
- `src/test/crm-mfa-resend-provider-errors.test.ts`
- `src/test/crm-mfa-resend-readiness.test.ts`
- `src/test/customer-crm-export.test.ts`
- `src/test/customer-crm.test.ts`
- `src/test/customer-dashboard.test.ts`
- `src/test/customer-order-tracking-no-simulation.test.ts`
- `src/test/customer-orders.test.ts`
- `src/test/daily-dish-ai.test.ts`
- `src/test/daily-dish-legal-mobile-hotfix.test.ts`
- `src/test/daily-slot-machine-security.test.ts`
- `src/test/daily-slot-rules.test.ts`
- `src/test/dashboard-advisor-history.test.ts`
- `src/test/dashboard-campaign-unification.test.ts`
- `src/test/dashboard-commands-collapse.test.tsx`
- `src/test/dashboard-grouping.test.ts`
- `src/test/dashboard-illustration-media.test.tsx`
- `src/test/dashboard-illustrations.test.ts`
- `src/test/dashboard-invoice-restaurant-copy.test.ts`
- `src/test/dashboard-invoices.test.ts`
- `src/test/dashboard-menu-categories.test.ts`
- `src/test/dashboard-menu-photo-tools.test.ts`
- `src/test/dashboard-notification-day-badges.test.ts`
- `src/test/dashboard-order-types.test.ts`
- `src/test/dashboard-overview-google-compact.test.ts`
- `src/test/dashboard-payments.test.ts`
- `src/test/dashboard-performance.test.ts`
- `src/test/dashboard-restaurant-amenities.test.ts`
- `src/test/dashboard-review-response-workflow.test.ts`
- `src/test/dashboard-reviews-governance.test.ts`
- `src/test/dashboard-rpc-security.test.ts`
- `src/test/dashboard-selection-navigation.test.tsx`
- `src/test/dashboard-service-layout.test.ts`
- `src/test/dashboard-shell-navigation.test.ts`
- `src/test/dashboard-switch-no-public-flash.test.ts`
- `src/test/dashboard-time-range.test.ts`
- `src/test/database-value-constraints.test.ts`
- `src/test/delivery-dispatch-scheduling.test.ts`
- `src/test/delivery-proof-signature.test.ts`
- `src/test/delivery-proof.test.ts`
- `src/test/delivery-route.test.ts`
- `src/test/delivery-slots.test.ts`
- `src/test/demo-runtime-and-real-catalog-isolation.test.ts`
- `src/test/demo-single-view-and-production-isolation.test.ts`
- `src/test/demo-workspace-access.test.ts`
- `src/test/dependency-security.test.ts`
- `src/test/deploy-production-secret-scope.test.ts`
- `src/test/dialog-close-animation-guard.test.ts`
- `src/test/directory-commercial-name-governance.test.ts`
- `src/test/directory-cuisine-enrichment.test.ts`
- `src/test/directory-cuisine-osm-backfill.test.ts`
- `src/test/directory-image-discovery-worker.test.ts`
- `src/test/directory-restaurant-ownership-governance.test.ts`
- `src/test/dispatch-client-fallback.test.ts`
- `src/test/dispatch-health.test.ts`
- `src/test/dispatch-service-role-auth.test.ts`
- `src/test/edge-audit-write.test.ts`
- `src/test/edge-function-undeclared-identifiers.test.ts`
- `src/test/edge-rate-limits-10k.test.ts`
- `src/test/error-boundary-chunk-recovery.test.ts`
- `src/test/error-code-map-case.test.ts`
- `src/test/example.test.ts`
- `src/test/fair-growth-annual-billing.test.ts`
- `src/test/fair-growth-pricing.test.ts`
- `src/test/favicon-branding.test.ts`
- `src/test/feature-flags-realtime.test.tsx`
- `src/test/feature-flags.test.ts`
- `src/test/feature-visibility.test.ts`
- `src/test/financial-health.test.ts`
- `src/test/firebase-vapid-key.test.ts`
- `src/test/flat-fee-on-arrival.test.ts`
- `src/test/flat-reservation-billing-fallback.test.ts`
- `src/test/floor-plan-assignment-governance.test.ts`
- `src/test/floor-plan-automatic-import.test.ts`
- `src/test/floor-plan-automatic-placement.test.ts`
- `src/test/floor-plan-frame-scheduler.test.ts`
- `src/test/floor-plan-history.test.ts`
- `src/test/floor-plan-page-layout.test.ts`
- `src/test/floor-plan-persistence.test.ts`
- `src/test/floor-plan.test.ts`
- `src/test/french-copy-accents.test.ts`
- `src/test/frontend-10k-readiness.test.ts`
- `src/test/full-audit-remediation-20260711.test.ts`
- `src/test/generate-campaign-ai-optimization.test.ts`
- `src/test/generate-campaign-copy.test.ts`
- `src/test/geolocation-native.test.ts`
- `src/test/git-auto-sync-scripts.test.ts`
- `src/test/golden-tok-shell-logo.test.ts`
- `src/test/google-actions-center-feed-exporter.test.ts`
- `src/test/google-actions-center-outbox.test.ts`
- `src/test/google-actions-center-readiness.test.ts`
- `src/test/google-business-booking-phase1.test.ts`
- `src/test/google-business-commercial-scope.test.ts`
- `src/test/google-business-economics.test.ts`
- `src/test/guaranteed-delivery-cart.test.ts`
- `src/test/health-score-advisors.test.ts`
- `src/test/home-assets-budget.test.ts`
- `src/test/home-cuisine-accessibility.test.tsx`
- `src/test/home-hero-search.test.tsx`
- `src/test/home-mobile-newsletter.test.tsx`
- `src/test/home-nearby-catalog-contract.test.ts`
- `src/test/homepage-photo-only-sections.test.ts`
- `src/test/homepage-positioning-guards.test.ts`
- `src/test/image-metadata-ai.test.ts`
- `src/test/incident-automation-readiness.test.ts`
- `src/test/incident-evidence-depth.test.ts`
- `src/test/incident-intelligence-routing.test.ts`
- `src/test/incident-intelligence-unification.test.ts`
- `src/test/incident-native-scan-readiness.test.ts`
- `src/test/incident-repair-artifact-limits.test.ts`
- `src/test/incident-secret-sync-readiness.test.ts`
- `src/test/invoice-line-details.test.ts`
- `src/test/invoice-line-table.test.tsx`
- `src/test/ios-app-icon.test.ts`
- `src/test/ios-app-store-bundle-id.test.ts`
- `src/test/ios-app-store-readiness.test.ts`
- `src/test/ios-commerce-policy.test.ts`
- `src/test/ios-storekit-subscription-management.test.ts`
- `src/test/la-gazelle-dor-seed.test.ts`
- `src/test/launch-edge-access.test.ts`
- `src/test/launch-load-plan.test.ts`
- `src/test/launch-pack-ai-quotas.test.ts`
- `src/test/launch-provider.test.tsx`
- `src/test/launch-state.test.ts`
- `src/test/legacy-provider-cleanup.test.ts`
- `src/test/legal-consent-banner-layout.test.ts`
- `src/test/legal-consent-v2.test.ts`
- `src/test/legal-miamz-readiness.test.ts`
- `src/test/legal-public-surface-hardening.test.ts`
- `src/test/lifecycle-segments.test.ts`
- `src/test/list-sorting-controls.test.ts`
- `src/test/logout-availability.test.ts`
- `src/test/loyalty-benefits.test.ts`
- `src/test/loyalty-status-dialog-layout.test.tsx`
- `src/test/marketing-agent-bff.test.ts`
- `src/test/marketing-ai-agent.test.ts`
- `src/test/marketing-autopilot-frontend.test.tsx`
- `src/test/marketing-autopilot-sql.test.ts`
- `src/test/marketing-b2b-outreach.test.ts`
- `src/test/marketing-backlink-discovery.test.ts`
- `src/test/marketing-backlink-provider.test.ts`
- `src/test/marketing-bff-client.test.ts`
- `src/test/marketing-bff-security.test.ts`
- `src/test/marketing-bff-vercel-entrypoints.test.ts`
- `src/test/marketing-consent-dispatch.test.ts`
- `src/test/marketing-domain-isolation.test.ts`
- `src/test/marketing-edge-security.test.ts`
- `src/test/marketing-email-cadence.test.ts`
- `src/test/marketing-email-template.test.ts`
- `src/test/marketing-image-output.test.ts`
- `src/test/marketing-meta-bff.test.ts`
- `src/test/marketing-meta-connection.test.tsx`
- `src/test/marketing-meta-health.test.ts`
- `src/test/marketing-meta-publishing.test.ts`
- `src/test/marketing-meta-recovery.test.ts`
- `src/test/marketing-one-click-unsubscribe.test.ts`
- `src/test/marketing-openai-tool-choice.test.ts`
- `src/test/marketing-operations-frontend.test.ts`
- `src/test/marketing-orchestrator-schema.test.ts`
- `src/test/marketing-output-geometry.test.ts`
- `src/test/marketing-outreach-schema.test.ts`
- `src/test/marketing-print-contract.test.ts`
- `src/test/marketing-print-domain.test.ts`
- `src/test/marketing-print-entry.test.tsx`
- `src/test/marketing-print-rendering.test.ts`
- `src/test/marketing-prospect-coordinates.test.ts`
- `src/test/marketing-rbarman-admin-access.test.ts`
- `src/test/marketing-runtime-hardening.test.ts`
- `src/test/marketing-service-auth.test.ts`
- `src/test/marketing-session-recovery.test.tsx`
- `src/test/marketing-source-discovery.test.tsx`
- `src/test/marketing-sql-governance.test.ts`
- `src/test/marketing-studio-output-targets.test.ts`
- `src/test/marketing-studio-print-destination-regression.test.ts`
- `src/test/marketing-subdomain-integration.test.ts`
- `src/test/marketing-zurich-time.test.ts`
- `src/test/marketplace-finance-routing.test.ts`
- `src/test/marketplace-liquidity.test.ts`
- `src/test/match-group-restaurant-payment-guards.test.ts`
- `src/test/meal-formula-service-limits.test.ts`
- `src/test/meal-formulas.test.ts`
- `src/test/meal-subscription-availability.test.ts`
- `src/test/meal-subscription-cart.test.tsx`
- `src/test/meal-subscription.test.ts`
- `src/test/menu-item-images.test.ts`
- `src/test/miamz-business-logic-guards.test.ts`
- `src/test/mobile-association-hosting.test.ts`
- `src/test/mobile-logo-intro.test.tsx`
- `src/test/mobile-modal-scroll-guards.test.ts`
- `src/test/mobile-theme-toggle.test.tsx`
- `src/test/monitoring-consent.test.ts`
- `src/test/monitoring.test.ts`
- `src/test/native-oauth.test.ts`
- `src/test/navbar-action-stability.test.ts`
- `src/test/navbar-dashboard-access-design.test.ts`
- `src/test/navigation.test.ts`
- `src/test/nearby-restaurants.test.ts`
- `src/test/newsletter-automation-sql.test.ts`
- `src/test/newsletter-templates.test.ts`
- `src/test/notification-campaign-idempotency.test.ts`
- `src/test/notifications-ai-admin-hardening.test.ts`
- `src/test/notifications-sinistres-governance.test.ts`
- `src/test/observability-maintenance-performance.test.ts`
- `src/test/operation-detail-cards-design.test.ts`
- `src/test/operation-progress-dialog.test.tsx`
- `src/test/ops-incident-run-binding.test.ts`
- `src/test/optimized-images.test.ts`
- `src/test/order-capacity-acceptance-10k.test.ts`
- `src/test/order-confirmation.test.ts`
- `src/test/order-payment-breakdown.test.tsx`
- `src/test/order-pricing-special-offers.test.ts`
- `src/test/order-status.test.ts`
- `src/test/pack-feature-gating.test.ts`
- `src/test/package-scripts-readiness.test.ts`
- `src/test/password-policy.test.ts`
- `src/test/password-recovery-routing.test.ts`
- `src/test/payment-attempt-backend-contract.test.ts`
- `src/test/payment-attempt-state.test.ts`
- `src/test/photo-studio-persistence.test.ts`
- `src/test/plan-phase1-readiness.test.ts`
- `src/test/plan2-fk-index-readiness.test.ts`
- `src/test/plan2-security-definer-rpc-grants.test.ts`
- `src/test/post-deploy-seo-regressions.test.ts`
- `src/test/print-and-chart-sinks.test.ts`
- `src/test/print-catalog-actions.test.ts`
- `src/test/print-catalog-admin-pagination.test.tsx`
- `src/test/print-composer-source-format.test.tsx`
- `src/test/print-export-source-format.test.ts`
- `src/test/print-orchestrator-runtime.test.ts`
- `src/test/print-pdf-dimensions.test.ts`
- `src/test/print-source-format.test.ts`
- `src/test/production-alert-remediation.test.ts`
- `src/test/production-deployment-credential-wiring.test.ts`
- `src/test/production-deployment-provenance.test.ts`
- `src/test/production-preflight-hardening.test.ts`
- `src/test/production-supabase-deployment-keys.test.ts`
- `src/test/profile-hours-slot-source.test.ts`
- `src/test/progressive-reservation-offers.test.ts`
- `src/test/public-asset-deduplication.test.ts`
- `src/test/public-asset-references.test.ts`
- `src/test/public-catalog-image-optional-visibility.test.ts`
- `src/test/public-catalog-image-required-visibility.test.ts`
- `src/test/public-catalog-rpc-timeout-remediation.test.ts`
- `src/test/public-directory-preview-postflight.test.ts`
- `src/test/public-env.test.ts`
- `src/test/public-error-messages.test.ts`
- `src/test/public-feature-legal-matrix.test.ts`
- `src/test/public-offer-query-governance.test.ts`
- `src/test/public-restaurant-directory-migration.test.ts`
- `src/test/pwa-manifest.test.ts`
- `src/test/quality-guarantee-governance.test.ts`
- `src/test/randomized-restaurant-discovery.test.ts`
- `src/test/realtime-notifications.test.ts`
- `src/test/reconcile-paid-order-checkouts.test.ts`
- `src/test/refund-allocations.test.ts`
- `src/test/release-readiness-stripe-resolver.test.ts`
- `src/test/release-readiness.test.ts`
- `src/test/repository-json-encoding.test.ts`
- `src/test/repository-text-encoding.test.ts`
- `src/test/reservation-10k-hardening.test.ts`
- `src/test/reservation-availability.test.ts`
- `src/test/reservation-branch-rls-visibility.test.ts`
- `src/test/reservation-confirmation-deposit-ops.test.ts`
- `src/test/reservation-fee-integrity.test.ts`
- `src/test/reservation-inventory-health.test.ts`
- `src/test/reservation-queue.test.tsx`
- `src/test/reservation-service-capacity.test.ts`
- `src/test/responsive-seo-regressions.test.ts`
- `src/test/restaurant-billing-account.test.ts`
- `src/test/restaurant-card-preview.test.tsx`
- `src/test/restaurant-categories.test.ts`
- `src/test/restaurant-contracts-governance.test.ts`
- `src/test/restaurant-dashboard-mobile-overview.test.ts`
- `src/test/restaurant-dashboard-overview-navigation.test.ts`
- `src/test/restaurant-detail-availability-preview.test.tsx`
- `src/test/restaurant-detail-preview.test.tsx`
- `src/test/restaurant-directory-pagination-images.test.ts`
- `src/test/restaurant-entity-seo.test.ts`
- `src/test/restaurant-image-backfill-auth.test.ts`
- `src/test/restaurant-image-discovery-reactivation.test.ts`
- `src/test/restaurant-image-discovery-trigger.test.ts`
- `src/test/restaurant-image-mapped-ip-guard.test.ts`
- `src/test/restaurant-image-safe-fetch.test.ts`
- `src/test/restaurant-image-truth-guards.test.ts`
- `src/test/restaurant-image-truth-pipeline.test.ts`
- `src/test/restaurant-media-governance.test.ts`
- `src/test/restaurant-media-watermark.test.ts`
- `src/test/restaurant-onboarding-payments.test.ts`
- `src/test/restaurant-paid-tok-purchases-invoices.test.ts`
- `src/test/restaurant-partner-contract-export.test.ts`
- `src/test/restaurant-partner-contract-preview.test.tsx`
- `src/test/restaurant-promotions-governance.test.ts`
- `src/test/restaurant-public-data-consistency.test.ts`
- `src/test/restaurant-reservation-sidebar.test.ts`
- `src/test/restaurant-search-preview.test.tsx`
- `src/test/restaurant-slug-seo.test.ts`
- `src/test/restaurant-social-post-reactions.test.ts`
- `src/test/restaurant-special-offer-governance.test.ts`
- `src/test/restaurant-stripe-adjustments.test.ts`
- `src/test/restaurateur-commercial-pages.test.ts`
- `src/test/restaurateur-onboarding-reliability.test.ts`
- `src/test/review-submission-governance.test.ts`
- `src/test/rls-exact-policy-deduplication.test.ts`
- `src/test/rls-generic-policy-audit.test.ts`
- `src/test/rls-policy-hardening.test.ts`
- `src/test/role-access.test.ts`
- `src/test/role-route-wiring.test.ts`
- `src/test/route-serving-regression.test.ts`
- `src/test/route-wiring.test.ts`
- `src/test/scale-readiness-guards.test.ts`
- `src/test/scale-readiness-indexes.test.ts`
- `src/test/security-abuse-monitoring-10k.test.ts`
- `src/test/security-audit-p0-remediation.test.ts`
- `src/test/security-edge-functions.test.ts`
- `src/test/security-role-storage-audit.test.ts`
- `src/test/security-upload-captcha.test.ts`
- `src/test/security-url-helpers.test.ts`
- `src/test/send-push-service-account.test.ts`
- `src/test/seo-city-identity.test.ts`
- `src/test/seo-crawl-hardening.test.ts`
- `src/test/seo-directory-quality-hardening.test.ts`
- `src/test/seo-final-quality-hardening.test.ts`
- `src/test/seo-growth.test.ts`
- `src/test/seo-indexation-hardening.test.ts`
- `src/test/seo-inventory-consistency.test.ts`
- `src/test/seo-near-duplicate-hardening.test.ts`
- `src/test/seo-performance-remediation.test.ts`
- `src/test/seo-public-name-hardening.test.ts`
- `src/test/seo-restaurant-context-hardening.test.ts`
- `src/test/seo-stoppin-scale.test.ts`
- `src/test/seo-trust-runtime.test.ts`
- `src/test/seo-trust-signals.test.ts`
- `src/test/seo-web-artifact-names.test.ts`
- `src/test/service-board.test.tsx`
- `src/test/service-settings.test.ts`
- `src/test/service-shared.test.ts`
- `src/test/session-isolation-governance.test.ts`
- `src/test/signup-correction-flow.test.ts`
- `src/test/signup-document-upload-rollback.test.ts`
- `src/test/signup.test.ts`
- `src/test/social-comments-drawer.test.tsx`
- `src/test/social-comments-mobile-layout.test.ts`
- `src/test/social-composer-cross-post.test.tsx`
- `src/test/social-composer-scheduling.test.ts`
- `src/test/social-feed-v2.test.ts`
- `src/test/social-feed-visibility.test.ts`
- `src/test/social-feed.test.ts`
- `src/test/social-interactions.test.ts`
- `src/test/social-media-autoplay.test.tsx`
- `src/test/social-media-upload-guards.test.ts`
- `src/test/social-migration-sql.test.ts`
- `src/test/social-migration-v2-sql.test.ts`
- `src/test/social-post-actions.test.tsx`
- `src/test/social-post-boost-dialog.test.tsx`
- `src/test/social-post-boost-resilience.test.ts`
- `src/test/social-realtime.test.ts`
- `src/test/social-video-compression.test.ts`
- `src/test/solidarity-section.test.tsx`
- `src/test/space-help-chat.test.ts`
- `src/test/special-offers.test.ts`
- `src/test/sponsored-attribution-touch.test.ts`
- `src/test/sponsored-attribution.test.ts`
- `src/test/sponsored-event-signing.test.ts`
- `src/test/sponsored-placement.test.ts`
- `src/test/stoppin-thetok-routes.test.ts`
- `src/test/stoppin-venue-dedupe.test.ts`
- `src/test/stripe-developer-share-routing.test.ts`
- `src/test/stripe-return.test.ts`
- `src/test/stripe-security-hardening.test.ts`
- `src/test/studio-canvas.test.tsx`
- `src/test/submitSignupValidation.test.ts`
- `src/test/subscription-checkout.test.ts`
- `src/test/subscription-dispatch.test.ts`
- `src/test/subscription-entitlements.test.ts`
- `src/test/subscription-tracking-page.test.tsx`
- `src/test/supabase-client-imports.test.ts`
- `src/test/supabase-cors.test.ts`
- `src/test/supabase-critical-rpc-contracts.test.ts`
- `src/test/supabase-function-deploy-retry.test.ts`
- `src/test/supabase-migration-order.test.ts`
- `src/test/supabase-production-migration-history.test.ts`
- `src/test/supabase-production-stale-head-guard.test.ts`
- `src/test/supabase-return-url.test.ts`
- `src/test/super-admin-sensitive-rls.test.ts`
- `src/test/supplier-catalog-sync.test.ts`
- `src/test/support-chat-auth-gate.test.tsx`
- `src/test/support-chat-history.test.ts`
- `src/test/support-notification-governance.test.ts`
- `src/test/table-context-drawer.test.tsx`
- `src/test/thefork-directory-completion.test.ts`
- `src/test/thefork-image-enrichment-completion.test.ts`
- `src/test/tok-ai-platform-plan.test.ts`
- `src/test/tok-ai-tools.test.ts`
- `src/test/tok-connect-admin-humanized.test.ts`
- `src/test/tok-connect-admin-schema-contract.test.ts`
- `src/test/tok-connect-app-bridge.test.ts`
- `src/test/tok-connect-chatgpt-finalization.test.ts`
- `src/test/tok-connect-commercial-bridge.test.ts`
- `src/test/tok-connect-discovery.test.ts`
- `src/test/tok-connect-edge-functions.test.ts`
- `src/test/tok-connect-frontend.test.ts`
- `src/test/tok-connect-full-app-mcp.test.ts`
- `src/test/tok-connect-legal-content.test.ts`
- `src/test/tok-connect-mcp-http.test.ts`
- `src/test/tok-connect-mcp-migration.test.ts`
- `src/test/tok-connect-runtime.test.ts`
- `src/test/tok-connect-sql.test.ts`
- `src/test/tok-connect-universal-mcp.test.ts`
- `src/test/tok-connect.test.ts`
- `src/test/tok-intelligence-suite.test.ts`
- `src/test/tok-logo-calendar.test.ts`
- `src/test/tok-one-stripe-test-mode.test.ts`
- `src/test/tok-pulse-native-widget.test.ts`
- `src/test/transactional-email-templates.test.ts`
- `src/test/ui-overlay-layering.test.ts`
- `src/test/user-facing-errors.test.ts`
- `src/test/vercel-rewrites.test.ts`
- `src/test/zero-attente-finalization-governance.test.ts`
- `src/test/zero-attente-reservation-context.test.ts`
- `supabase/functions/process-refund/refund-utils.test.ts`
- `workers/image-ai-worker/config.test.mjs`
- `workers/image-ai-worker/index.test.mjs`
- `workers/image-ai-worker/metadata.test.mjs`
- `workers/image-ai-worker/ollama.test.mjs`
- `workers/image-ai-worker/runtime-hardening.test.mjs`
- `workers/image-ai-worker/windows-setup.test.mjs`

</details>

<details><summary>vercel-api (9)</summary>

- `api/marketing/agent.ts`
- `api/marketing/launch.ts`
- `api/marketing/login.ts`
- `api/marketing/logout.ts`
- `api/marketing/mfa/enroll.ts`
- `api/marketing/mfa/verify.ts`
- `api/marketing/orchestrator.ts`
- `api/marketing/rpc.ts`
- `api/marketing/session.ts`

</details>

<details><summary>worker (14)</summary>

- `workers/image-ai-worker/.dockerignore`
- `workers/image-ai-worker/.env.example`
- `workers/image-ai-worker/Dockerfile`
- `workers/image-ai-worker/README.md`
- `workers/image-ai-worker/check.mjs`
- `workers/image-ai-worker/config.js`
- `workers/image-ai-worker/docker-compose.yml`
- `workers/image-ai-worker/index.js`
- `workers/image-ai-worker/metadata.js`
- `workers/image-ai-worker/ollama.js`
- `workers/image-ai-worker/package-lock.json`
- `workers/image-ai-worker/package.json`
- `workers/image-ai-worker/run-windows-worker.ps1`
- `workers/image-ai-worker/setup-windows.ps1`

</details>

## Limites de l’inventaire statique

- `ANY` signifie que la méthode HTTP n’est pas déclarée de façon statiquement détectable dans le point d’entrée.
- `verify_jwt = false` dans Supabase ne signifie pas absence de contrôle : les fonctions peuvent valider elles-mêmes sessions, rôles, signatures ou secrets.
- Les objets SQL listés proviennent des instructions `CREATE` versionnées; les suppressions et l’état distant final doivent être contrôlés dans la base cible.
- Les pages non montées peuvent être des brouillons, des composants historiques ou des points d’entrée utilisés indirectement.
- L’index ne révèle aucune valeur d’environnement et ne prouve pas la disponibilité des services externes.
