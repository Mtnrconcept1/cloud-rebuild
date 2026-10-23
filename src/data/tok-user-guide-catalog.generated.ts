// Fichier généré par pnpm docs:application-index. Ne pas modifier manuellement.
export const TOK_USER_GUIDE_META = {
  "repository": "Mtnrconcept1/cloud-rebuild",
  "sourceDigest": "94aa057b083f13b5ff6a7715de2d906df5baf3a89102cd9d9ed09ab9f636a344",
  "routeCount": 143,
  "toolCount": 120
} as const;

export const TOK_USER_GUIDE_ROUTES = [
  {
    "path": "/coming-soon",
    "surface": "public",
    "components": [
      "ComingSoon"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "Index"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/auth",
    "surface": "public",
    "components": [
      "Auth"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/auth/demo",
    "surface": "public",
    "components": [
      "Auth"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/auth/callback",
    "surface": "public",
    "components": [
      "Auth"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/espaces",
    "surface": "public",
    "components": [
      "ProtectedRoute",
      "WorkspaceChooser"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/equipe/mon-espace",
    "surface": "public",
    "components": [
      "MyWorkforce",
      "ProtectedRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/equipe/gestion",
    "surface": "public",
    "components": [
      "MyWorkforceManager",
      "ProtectedRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/oauth/consent",
    "surface": "public",
    "components": [
      "OAuthConsent"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/recherche",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "Recherche"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurants/:city",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "LocalRestaurants"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurants-pres/:venueSlug",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "LocalRestaurants"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurants/:city/r/:restaurantSlug",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "LocalRestaurants"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurants/:city/:category",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "LocalRestaurants"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/r/:slug/reserver",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "RestaurantBookingRedirect"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/r/:slug",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "RestaurantBookingRedirect"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurant/:id",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "RestaurantDetail"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/anti-gaspi",
    "surface": "public",
    "components": [
      "AntiGaspi",
      "ClientSurfaceRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "antiWasteEnabled",
    "redirectTo": null
  },
  {
    "path": "/panier",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "Panier"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/commandes",
    "surface": "client-account",
    "components": [
      "Commandes",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/commande/confirmation",
    "surface": "client-account",
    "components": [
      "ClientSurfaceRoute",
      "OrderConfirmation"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/commande/:id",
    "surface": "client-account",
    "components": [
      "ProtectedRoute",
      "SuiviCommande"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/mon-espace",
    "surface": "client-account",
    "components": [
      "ClientDashboardHome",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/compte",
    "surface": "client-account",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/mon-espace"
  },
  {
    "path": "/espace-client",
    "surface": "client-account",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/mon-espace"
  },
  {
    "path": "/reservations",
    "surface": "client-account",
    "components": [
      "FeatureSwitch",
      "ProtectedRoute",
      "Reservations"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": "reservationEnabled",
    "redirectTo": null
  },
  {
    "path": "/mes-avis",
    "surface": "client-account",
    "components": [
      "ClientReviews",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/profil",
    "surface": "client-account",
    "components": [
      "Profil",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/parametres/securite",
    "surface": "client-account",
    "components": [
      "AccountSecurity",
      "ProtectedRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/memoire-tok",
    "surface": "client-account",
    "components": [
      "CustomerMemory",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": "customerMemoryEnabled",
    "redirectTo": null
  },
  {
    "path": "/notifications",
    "surface": "client-account",
    "components": [
      "Notifications",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/creneaux-garantis",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "CreneauxGarantis",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"creneaux-garantis\")",
    "redirectTo": null
  },
  {
    "path": "/flex-prix-bas",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "FlexPrixBas"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"flex-prix-bas\")",
    "redirectTo": null
  },
  {
    "path": "/match-groupes",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "MatchGroupes"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"match-groupes\")",
    "redirectTo": null
  },
  {
    "path": "/multi-stop",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "MultiStop"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"multi-stop\")",
    "redirectTo": null
  },
  {
    "path": "/multi-restaurant",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "MultiRestaurant"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"multi-restaurant\")",
    "redirectTo": null
  },
  {
    "path": "/chefs-table",
    "surface": "public",
    "components": [
      "ChefsTable",
      "ClientSurfaceRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"chefs-table\")",
    "redirectTo": null
  },
  {
    "path": "/zero-attente",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "ZeroAttente"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"zero-attente\")",
    "redirectTo": null
  },
  {
    "path": "/garantie-qualite",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "GarantieQualite"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"garantie-qualite\")",
    "redirectTo": null
  },
  {
    "path": "/budget-auto",
    "surface": "public",
    "components": [
      "BudgetAuto",
      "ClientSurfaceRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"budget-auto\")",
    "redirectTo": null
  },
  {
    "path": "/abonnement",
    "surface": "public",
    "components": [
      "Abonnement",
      "ClientSurfaceRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "abonnementEnabled",
    "redirectTo": null
  },
  {
    "path": "/tok-one",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "TokOne"
    ],
    "requiredRoles": [],
    "featureGate": "tokOneEnabled",
    "redirectTo": null
  },
  {
    "path": "/tok-pulse",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "TokPulse"
    ],
    "requiredRoles": [],
    "featureGate": "hasFeature(\"tok-pulse\")",
    "redirectTo": null
  },
  {
    "path": "/tok-connect",
    "surface": "public",
    "components": [
      "FeatureSwitch",
      "TokConnect"
    ],
    "requiredRoles": [],
    "featureGate": "tokConnectEnabled",
    "redirectTo": null
  },
  {
    "path": "/tok-connect/developer",
    "surface": "public",
    "components": [
      "FeatureSwitch",
      "ProtectedRoute",
      "TokConnectDeveloper"
    ],
    "requiredRoles": [],
    "featureGate": "tokConnectEnabled",
    "redirectTo": null
  },
  {
    "path": "/tok-connect/mcp-widget",
    "surface": "public",
    "components": [
      "TokConnectMcpWidget"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/commercial",
    "surface": "commercial",
    "components": [
      "CommercialProspection",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "admin",
      "commercial"
    ],
    "featureGate": "commercialProspectionEnabled",
    "redirectTo": null
  },
  {
    "path": "/commercial/prospection",
    "surface": "commercial",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/commercial"
  },
  {
    "path": "/commercial/comptabilite",
    "surface": "commercial",
    "components": [
      "CommercialComptabilite",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "admin",
      "commercial"
    ],
    "featureGate": "commercialProspectionEnabled",
    "redirectTo": null
  },
  {
    "path": "/commercial/notifications",
    "surface": "commercial",
    "components": [
      "CommercialNotifications",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "admin",
      "commercial"
    ],
    "featureGate": "commercialProspectionEnabled",
    "redirectTo": null
  },
  {
    "path": "/commercial/demo-live",
    "surface": "commercial",
    "components": [
      "CommercialDemoLive",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "admin",
      "commercial"
    ],
    "featureGate": "commercialProspectionEnabled",
    "redirectTo": null
  },
  {
    "path": "/miamz-solidaires",
    "surface": "public",
    "components": [
      "MiamzSolidaires"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/points-cadeau",
    "surface": "client-account",
    "components": [
      "FeatureSwitch",
      "GiftPoints",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "client"
    ],
    "featureGate": "giftPointsEnabled",
    "redirectTo": null
  },
  {
    "path": "/ventes-flash",
    "surface": "public",
    "components": [
      "ClientSurfaceRoute",
      "FeatureSwitch",
      "VentesFlash"
    ],
    "requiredRoles": [],
    "featureGate": "flashSalesEnabled",
    "redirectTo": null
  },
  {
    "path": "/actualites",
    "surface": "public",
    "components": [
      "Actualites",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "actualitesSocialesEnabled",
    "redirectTo": null
  },
  {
    "path": "/actualites/:postId",
    "surface": "public",
    "components": [
      "ActualitePost",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "actualitesSocialesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard",
    "surface": "restaurant",
    "components": [
      "DashboardHome",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardOverviewEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/restaurant",
    "surface": "restaurant",
    "components": [
      "DashboardRestaurant",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardRestaurantEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/advisor",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardAdvisor",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardAdvisorEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/menu",
    "surface": "restaurant",
    "components": [
      "DashboardMenu",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardMenuEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/reservations",
    "surface": "restaurant",
    "components": [
      "DashboardReservations",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardReservationsEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/commandes",
    "surface": "restaurant",
    "components": [
      "DashboardCommandes",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardCommandesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/recommandations",
    "surface": "restaurant",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/dashboard/advisor"
  },
  {
    "path": "/dashboard/performances",
    "surface": "restaurant",
    "components": [
      "DashboardPerformances",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardPerformancesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/comparaison",
    "surface": "restaurant",
    "components": [
      "DashboardComparaison",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardComparaisonEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/avis",
    "surface": "restaurant",
    "components": [
      "DashboardAvis",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardAvisEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/compta",
    "surface": "restaurant",
    "components": [
      "Navigate",
      "div"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "dashboardFacturesEnabled ? \"/dashboard/factures\" : \"/dashboard\""
  },
  {
    "path": "/dashboard/factures",
    "surface": "restaurant",
    "components": [
      "DashboardFactures",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardFacturesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/factures/entrees",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardFacturesInflow",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardFacturesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/factures/sorties",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardFacturesOutflow",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardFacturesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/factures/parametres",
    "surface": "restaurant",
    "components": [
      "DashboardInvoiceSettings",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardFacturesParametresEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/mon-compte-facturation",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardAccountBilling",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardBillingEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/offres",
    "surface": "restaurant",
    "components": [
      "DashboardOffres",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardOffresEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/ventes-flash",
    "surface": "restaurant",
    "components": [
      "DashboardRoute",
      "DashboardVentesFlash",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardVentesFlashEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/formules",
    "surface": "restaurant",
    "components": [
      "DashboardFormules",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardFormulesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/photos",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardPhotos",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardPhotosEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/promotions",
    "surface": "restaurant",
    "components": [
      "DashboardPromotions",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardPromotionsEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/campagne-overview",
    "surface": "restaurant",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/dashboard/campagnes"
  },
  {
    "path": "/dashboard/reseaux-sociaux",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardReseauxSociaux",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardReseauxSociauxEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/actualites",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardActualites",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardActualitesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/campagnes",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardCampagnes",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardCampagnesEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/campaign-studio",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardCampaignStudio",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardCampaignStudioEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/crm",
    "surface": "restaurant",
    "components": [
      "DashboardCrm",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardCrmEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/notifications",
    "surface": "restaurant",
    "components": [
      "DashboardNotifications",
      "DashboardRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/dashboard/support",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardRoute",
      "DashboardSupport",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardSupportEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/service",
    "surface": "restaurant",
    "components": [
      "DashboardRoute",
      "DashboardService",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardServiceEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/equipe",
    "surface": "restaurant",
    "components": [
      "DashboardRoute",
      "DashboardWorkforce"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/dashboard/plan-salle",
    "surface": "restaurant",
    "components": [
      "DashboardPlanSalle",
      "DashboardRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardPlanSalleEnabled",
    "redirectTo": null
  },
  {
    "path": "/dashboard/plan-salle-v2",
    "surface": "restaurant",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/dashboard/plan-salle"
  },
  {
    "path": "/dashboard/guide",
    "surface": "restaurant",
    "components": [
      "DashboardRoute",
      "GuideUtilisateur"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/dashboard/tok-connect",
    "surface": "restaurant",
    "components": [
      "CommercialDemoSafeEffectsBoundary",
      "DashboardRoute",
      "DashboardTokConnect",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "dashboardTokConnectEnabled",
    "redirectTo": null
  },
  {
    "path": "/courier",
    "surface": "courier",
    "components": [
      "CourierHome",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "courier"
    ],
    "featureGate": "courierHomeEnabled",
    "redirectTo": null
  },
  {
    "path": "/courier/jobs",
    "surface": "courier",
    "components": [
      "CourierJobs",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "courier"
    ],
    "featureGate": "courierJobsEnabled",
    "redirectTo": null
  },
  {
    "path": "/courier/notifications",
    "surface": "courier",
    "components": [
      "CourierNotifications",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "courier"
    ],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/courier/earnings",
    "surface": "courier",
    "components": [
      "CourierEarnings",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "courier"
    ],
    "featureGate": "courierEarningsEnabled",
    "redirectTo": null
  },
  {
    "path": "/courier/profile",
    "surface": "courier",
    "components": [
      "CourierProfile",
      "FeatureSwitch",
      "ProtectedRoute"
    ],
    "requiredRoles": [
      "courier"
    ],
    "featureGate": "courierProfileEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin",
    "surface": "admin",
    "components": [
      "AdminDashboardRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/admin/platform",
    "surface": "admin",
    "components": [
      "AdminPlatformConfig",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminPlatformConfigEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/restaurants",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminRestaurants",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminRestaurantsEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/equipe",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminWorkforce"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/admin/restaurants/google-business",
    "surface": "admin",
    "components": [
      "AdminGoogleBusiness",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminRestaurantsEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/utilisateurs",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminUtilisateurs",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminUtilisateursEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/avis",
    "surface": "admin",
    "components": [
      "AdminAvis",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminAvisEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/catalog",
    "surface": "admin",
    "components": [
      "AdminCatalog",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminCatalogEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/loyalty",
    "surface": "admin",
    "components": [
      "AdminLoyalty",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminLoyaltyEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/drops",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "DropsManagement",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminDropsEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/notifications",
    "surface": "admin",
    "components": [
      "AdminNotifications",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminNotificationsEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/actualites",
    "surface": "admin",
    "components": [
      "AdminActualites",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminActualitesEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/crm",
    "surface": "admin",
    "components": [
      "AdminCrm",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminCrmEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/audit",
    "surface": "admin",
    "components": [
      "AdminAuditLogs",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminAuditEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/packs",
    "surface": "admin",
    "components": [
      "AdminLaunchPacks",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminPacksEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/compta",
    "surface": "admin",
    "components": [
      "AdminCompta",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminComptaEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/tok-printer",
    "surface": "admin",
    "components": [
      "AdminPrintOrders",
      "AdminProtectedRoute"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/admin/compta/entrees",
    "surface": "admin",
    "components": [
      "AdminComptaInflow",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminComptaEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/compta/sorties",
    "surface": "admin",
    "components": [
      "AdminComptaOutflow",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminComptaEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/compta/ia",
    "surface": "admin",
    "components": [
      "AdminComptaAi",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminComptaAiEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/commandes-reservations",
    "surface": "admin",
    "components": [
      "AdminOperationsCenter",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminOperationsCenterEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/sinistres",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminSinistres",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminOperationsCenterEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/support-resolution",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminSupportResolution",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminSupportResolutionEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/guardian",
    "surface": "admin",
    "components": [
      "AdminGuardian",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminGuardianEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/security-center",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminSecurityCenter",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminAuditEnabled && adminGuardianEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/ai-operations",
    "surface": "admin",
    "components": [
      "AdminAiOperations",
      "AdminProtectedRoute",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminAiOperationsEnabled",
    "redirectTo": null
  },
  {
    "path": "/admin/guide",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "GuideUtilisateur"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/admin/tok-connect",
    "surface": "admin",
    "components": [
      "AdminProtectedRoute",
      "AdminTokConnect",
      "FeatureSwitch"
    ],
    "requiredRoles": [],
    "featureGate": "adminTokConnectEnabled",
    "redirectTo": null
  },
  {
    "path": "/contact",
    "surface": "public",
    "components": [
      "Contact"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/cgu",
    "surface": "public",
    "components": [
      "CGU"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/politique-confidentialite",
    "surface": "public",
    "components": [
      "PolitiqueConfidentialite"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/cookies",
    "surface": "public",
    "components": [
      "Cookies"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/a-propos",
    "surface": "public",
    "components": [
      "APropos"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/packs-restaurateur",
    "surface": "public",
    "components": [
      "PacksRestaurateur"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/conditions-restaurateurs",
    "surface": "public",
    "components": [
      "ConditionsRestaurateurs"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurateurs/geneve",
    "surface": "public",
    "components": [
      "RestaurateursGeneve"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurateurs/:city",
    "surface": "public",
    "components": [
      "RestaurateursGeneve"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurateurs/google-business",
    "surface": "public",
    "components": [
      "RestaurateursGoogleBusiness"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/restaurateurs/alternative-commission-couvert",
    "surface": "public",
    "components": [
      "AlternativeCommissionCouvert"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/aide",
    "surface": "public",
    "components": [
      "Aide"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/guide",
    "surface": "public",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/aide"
  },
  {
    "path": "/guide/restaurateur",
    "surface": "public",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/aide"
  },
  {
    "path": "/guide/plateforme",
    "surface": "public",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/aide"
  },
  {
    "path": "*",
    "surface": "system",
    "components": [
      "NotFound"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/marketing/login",
    "surface": "marketing",
    "components": [
      "MarketingLogin"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/marketing",
    "surface": "marketing",
    "components": [
      "MarketingProtectedRoute",
      "MarketingWorkspace"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": null
  },
  {
    "path": "/marketing/*",
    "surface": "marketing",
    "components": [
      "Navigate"
    ],
    "requiredRoles": [],
    "featureGate": null,
    "redirectTo": "/marketing"
  }
] as const;

export const TOK_USER_GUIDE_TOOLS = [
  {
    "name": "admin-demo-entities",
    "endpoint": "/functions/v1/admin-demo-entities",
    "methods": [
      "POST"
    ],
    "actions": [
      "create_restaurant",
      "create_user",
      "list"
    ],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "admin-restaurant-adjustment",
    "endpoint": "/functions/v1/admin-restaurant-adjustment",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "ai-accounting-agent",
    "endpoint": "/functions/v1/ai-accounting-agent",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai",
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "ai-admin-dashboard-chat",
    "endpoint": "/functions/v1/ai-admin-dashboard-chat",
    "methods": [
      "ANY"
    ],
    "actions": [
      "history",
      "messages"
    ],
    "integrations": [
      "openai",
      "stripe"
    ]
  },
  {
    "name": "ai-admin-monitor",
    "endpoint": "/functions/v1/ai-admin-monitor",
    "methods": [
      "GET"
    ],
    "actions": [
      "full_report",
      "reject_public_analytics_event"
    ],
    "integrations": [
      "openai",
      "supabase",
      "vercel"
    ]
  },
  {
    "name": "ai-admin-support",
    "endpoint": "/functions/v1/ai-admin-support",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-campaign-studio",
    "endpoint": "/functions/v1/ai-campaign-studio",
    "methods": [
      "ANY"
    ],
    "actions": [
      "approve",
      "generate",
      "list",
      "mark_launched"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-client-chat",
    "endpoint": "/functions/v1/ai-client-chat",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-client-support",
    "endpoint": "/functions/v1/ai-client-support",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-guardian",
    "endpoint": "/functions/v1/ai-guardian",
    "methods": [
      "ANY"
    ],
    "actions": [
      "analyze",
      "overview",
      "verify"
    ],
    "integrations": [
      "openai",
      "supabase"
    ]
  },
  {
    "name": "ai-image-enhance",
    "endpoint": "/functions/v1/ai-image-enhance",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-marketing-agent",
    "endpoint": "/functions/v1/ai-marketing-agent",
    "methods": [
      "POST"
    ],
    "actions": [
      "discover_sources",
      "generate",
      "interpret_mailing",
      "list_runs",
      "unknown"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-restaurant-agent",
    "endpoint": "/functions/v1/ai-restaurant-agent",
    "methods": [
      "ANY"
    ],
    "actions": [
      "sales_insights"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-restaurant-editor",
    "endpoint": "/functions/v1/ai-restaurant-editor",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-restaurant-tools",
    "endpoint": "/functions/v1/ai-restaurant-tools",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-social-post-copy",
    "endpoint": "/functions/v1/ai-social-post-copy",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "ai-support-resolution",
    "endpoint": "/functions/v1/ai-support-resolution",
    "methods": [
      "POST"
    ],
    "actions": [
      "analyze",
      "execute",
      "list",
      "reject"
    ],
    "integrations": [
      "openai",
      "resend",
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "aligro-catalog-sync",
    "endpoint": "/functions/v1/aligro-catalog-sync",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "analyze-restaurant-image",
    "endpoint": "/functions/v1/analyze-restaurant-image",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai",
      "supabase"
    ]
  },
  {
    "name": "apple-storekit-webhook",
    "endpoint": "/functions/v1/apple-storekit-webhook",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "authorize-match-group-order",
    "endpoint": "/functions/v1/authorize-match-group-order",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "campaign-portal",
    "endpoint": "/functions/v1/campaign-portal",
    "methods": [
      "ANY"
    ],
    "actions": [
      "delete",
      "estimate_audience",
      "list",
      "save",
      "update_status"
    ],
    "integrations": [
      "twint"
    ]
  },
  {
    "name": "cancel-payment-attempt",
    "endpoint": "/functions/v1/cancel-payment-attempt",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "cancel-pending-order-checkout",
    "endpoint": "/functions/v1/cancel-pending-order-checkout",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "capture-due-match-groups",
    "endpoint": "/functions/v1/capture-due-match-groups",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "close-due-match-groups",
    "endpoint": "/functions/v1/close-due-match-groups",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "cloudprinter-webhook",
    "endpoint": "/functions/v1/cloudprinter-webhook",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "commercial-demo-ai",
    "endpoint": "/functions/v1/commercial-demo-ai",
    "methods": [
      "POST"
    ],
    "actions": [
      "chat",
      "maintenance_cleanup",
      "visual_generate"
    ],
    "integrations": [
      "openai",
      "supabase"
    ]
  },
  {
    "name": "commercial-demo-checkout",
    "endpoint": "/functions/v1/commercial-demo-checkout",
    "methods": [
      "POST"
    ],
    "actions": [
      "create"
    ],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "commercial-followup-reminder",
    "endpoint": "/functions/v1/commercial-followup-reminder",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "complete-order-checkout",
    "endpoint": "/functions/v1/complete-order-checkout",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "complete-restaurant-credit-pack-checkout",
    "endpoint": "/functions/v1/complete-restaurant-credit-pack-checkout",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "confirm-match-group-authorization",
    "endpoint": "/functions/v1/confirm-match-group-authorization",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "contact-support",
    "endpoint": "/functions/v1/contact-support",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "cloudflare"
    ]
  },
  {
    "name": "courier-portal",
    "endpoint": "/functions/v1/courier-portal",
    "methods": [
      "ANY"
    ],
    "actions": [
      "ensure_profile",
      "respond_attempt",
      "save_profile",
      "sync_presence",
      "update_job_status",
      "verify_delivery_proof"
    ],
    "integrations": []
  },
  {
    "name": "create-checkout",
    "endpoint": "/functions/v1/create-checkout",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "twint"
    ]
  },
  {
    "name": "create-chefs-table-reservation",
    "endpoint": "/functions/v1/create-chefs-table-reservation",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "create-reservation",
    "endpoint": "/functions/v1/create-reservation",
    "methods": [
      "ANY"
    ],
    "actions": [
      "finalize",
      "quote"
    ],
    "integrations": [
      "google",
      "stripe"
    ]
  },
  {
    "name": "create-social-post-boost",
    "endpoint": "/functions/v1/create-social-post-boost",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "create-zero-attente-reservation",
    "endpoint": "/functions/v1/create-zero-attente-reservation",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "twint"
    ]
  },
  {
    "name": "crm-mfa-recovery",
    "endpoint": "/functions/v1/crm-mfa-recovery",
    "methods": [
      "POST"
    ],
    "actions": [
      "confirm",
      "request",
      "string"
    ],
    "integrations": [
      "resend",
      "supabase"
    ]
  },
  {
    "name": "customer-memory",
    "endpoint": "/functions/v1/customer-memory",
    "methods": [
      "ANY"
    ],
    "actions": [
      "clear",
      "confirm",
      "delete",
      "export",
      "infer",
      "list",
      "reject",
      "upsert"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "daily-dish-ai",
    "endpoint": "/functions/v1/daily-dish-ai",
    "methods": [
      "ANY"
    ],
    "actions": [
      "generate",
      "publish",
      "refine",
      "regenerate",
      "select",
      "set_enabled",
      "status"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "daily-slot-spin",
    "endpoint": "/functions/v1/daily-slot-spin",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "delete-account",
    "endpoint": "/functions/v1/delete-account",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "discover-thefork-official-sites",
    "endpoint": "/functions/v1/discover-thefork-official-sites",
    "methods": [
      "GET",
      "OPTIONS",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "dispatch-order",
    "endpoint": "/functions/v1/dispatch-order",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "dispatch-timeout",
    "endpoint": "/functions/v1/dispatch-timeout",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "enrich-directory-cuisines",
    "endpoint": "/functions/v1/enrich-directory-cuisines",
    "methods": [
      "GET"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "enrich-directory-cuisines-osm",
    "endpoint": "/functions/v1/enrich-directory-cuisines-osm",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "enrich-directory-images",
    "endpoint": "/functions/v1/enrich-directory-images",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "enrich-restaurants",
    "endpoint": "/functions/v1/enrich-restaurants",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "enrich-thefork-images",
    "endpoint": "/functions/v1/enrich-thefork-images",
    "methods": [
      "GET",
      "OPTIONS",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "floorplan-ai",
    "endpoint": "/functions/v1/floorplan-ai",
    "methods": [
      "POST"
    ],
    "actions": [
      "generate",
      "image-import",
      "optimize",
      "suggest-furniture"
    ],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "generate-campaign",
    "endpoint": "/functions/v1/generate-campaign",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "generate-invoices",
    "endpoint": "/functions/v1/generate-invoices",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "golden-tok-membership",
    "endpoint": "/functions/v1/golden-tok-membership",
    "methods": [
      "POST"
    ],
    "actions": [
      "cancel",
      "resume",
      "string"
    ],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "google-actions-center",
    "endpoint": "/functions/v1/google-actions-center",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "stripe"
    ]
  },
  {
    "name": "google-actions-center-sync",
    "endpoint": "/functions/v1/google-actions-center-sync",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "manage-restaurant-subscription",
    "endpoint": "/functions/v1/manage-restaurant-subscription",
    "methods": [
      "ANY"
    ],
    "actions": [
      "accept_commission_mandate",
      "cancel",
      "change_plan",
      "commission_mandate_status",
      "resume"
    ],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "manage-tok-one-subscription",
    "endpoint": "/functions/v1/manage-tok-one-subscription",
    "methods": [
      "ANY"
    ],
    "actions": [
      "cancel",
      "quote",
      "resume",
      "sync_checkout_session"
    ],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "marketing-orchestrator",
    "endpoint": "/functions/v1/marketing-orchestrator",
    "methods": [
      "POST"
    ],
    "actions": [
      "check_meta",
      "generate_daily",
      "instagram_comments",
      "instagram_discover",
      "run_item"
    ],
    "integrations": [
      "google",
      "openai",
      "resend",
      "supabase"
    ]
  },
  {
    "name": "marketing-provider-webhook",
    "endpoint": "/functions/v1/marketing-provider-webhook",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "marketing-unsubscribe",
    "endpoint": "/functions/v1/marketing-unsubscribe",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "menu-image-import",
    "endpoint": "/functions/v1/menu-image-import",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai"
    ]
  },
  {
    "name": "notification-dispatch",
    "endpoint": "/functions/v1/notification-dispatch",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "ops-admin-approval",
    "endpoint": "/functions/v1/ops-admin-approval",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "ops-incident-control",
    "endpoint": "/functions/v1/ops-incident-control",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [
      "content_review_process",
      "ingest",
      "instagram_review_list",
      "instagram_review_submit",
      "repair-context",
      "scan",
      "workflow-update"
    ],
    "integrations": [
      "openai",
      "sentry",
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "ops-incident-native-scan",
    "endpoint": "/functions/v1/ops-incident-native-scan",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "payment-attempt-status",
    "endpoint": "/functions/v1/payment-attempt-status",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "print-admin",
    "endpoint": "/functions/v1/print-admin",
    "methods": [
      "POST"
    ],
    "actions": [
      "cancel",
      "list",
      "map_product",
      "reconcile",
      "reorder",
      "settings",
      "update_settings"
    ],
    "integrations": []
  },
  {
    "name": "print-catalog",
    "endpoint": "/functions/v1/print-catalog",
    "methods": [
      "POST"
    ],
    "actions": [
      "admin_mappings",
      "discover",
      "generation_catalog",
      "hydrate",
      "list",
      "map",
      "sync"
    ],
    "integrations": []
  },
  {
    "name": "print-checkout",
    "endpoint": "/functions/v1/print-checkout",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "print-export",
    "endpoint": "/functions/v1/print-export",
    "methods": [
      "POST"
    ],
    "actions": [
      "approve"
    ],
    "integrations": []
  },
  {
    "name": "print-orchestrator",
    "endpoint": "/functions/v1/print-orchestrator",
    "methods": [
      "POST"
    ],
    "actions": [
      "paused",
      "stop"
    ],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "print-order-action",
    "endpoint": "/functions/v1/print-order-action",
    "methods": [
      "POST"
    ],
    "actions": [
      "cancel",
      "get",
      "list",
      "reorder"
    ],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "print-quote",
    "endpoint": "/functions/v1/print-quote",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "print-reconcile",
    "endpoint": "/functions/v1/print-reconcile",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "print-sandbox-complete",
    "endpoint": "/functions/v1/print-sandbox-complete",
    "methods": [
      "GET"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "process-refund",
    "endpoint": "/functions/v1/process-refund",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "process-reservation-cancellation-fees",
    "endpoint": "/functions/v1/process-reservation-cancellation-fees",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "provision-commercial-accounts",
    "endpoint": "/functions/v1/provision-commercial-accounts",
    "methods": [
      "POST"
    ],
    "actions": [
      "create",
      "list",
      "reset_password",
      "string"
    ],
    "integrations": []
  },
  {
    "name": "provision-commercial-demo-logins",
    "endpoint": "/functions/v1/provision-commercial-demo-logins",
    "methods": [
      "OPTIONS"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "provision-commercial-demo-project-session",
    "endpoint": "/functions/v1/provision-commercial-demo-project-session",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "reconcile-match-group-authorizations",
    "endpoint": "/functions/v1/reconcile-match-group-authorizations",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "reconcile-paid-order-checkouts",
    "endpoint": "/functions/v1/reconcile-paid-order-checkouts",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "resend-inbound-forward",
    "endpoint": "/functions/v1/resend-inbound-forward",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "resend"
    ]
  },
  {
    "name": "restaurant-advisor",
    "endpoint": "/functions/v1/restaurant-advisor",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai",
      "stripe"
    ]
  },
  {
    "name": "restaurant-media-governance",
    "endpoint": "/functions/v1/restaurant-media-governance",
    "methods": [
      "POST"
    ],
    "actions": [
      "add_ai_creation_to_gallery",
      "string"
    ],
    "integrations": []
  },
  {
    "name": "restaurant-order-status",
    "endpoint": "/functions/v1/restaurant-order-status",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "scrape-restaurants",
    "endpoint": "/functions/v1/scrape-restaurants",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "send-email",
    "endpoint": "/functions/v1/send-email",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "resend",
      "supabase"
    ]
  },
  {
    "name": "send-push",
    "endpoint": "/functions/v1/send-push",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "firebase",
      "google",
      "supabase"
    ]
  },
  {
    "name": "settle-developer-statement",
    "endpoint": "/functions/v1/settle-developer-statement",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "stripe-connect-onboard",
    "endpoint": "/functions/v1/stripe-connect-onboard",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "stripe-connect-status",
    "endpoint": "/functions/v1/stripe-connect-status",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "stripe-setup",
    "endpoint": "/functions/v1/stripe-setup",
    "methods": [
      "OPTIONS"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "stripe-subscription-reconcile",
    "endpoint": "/functions/v1/stripe-subscription-reconcile",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "stripe-webhook",
    "endpoint": "/functions/v1/stripe-webhook",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "stripe-worker",
    "endpoint": "/functions/v1/stripe-worker",
    "methods": [
      "OPTIONS",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "submit-signup-application",
    "endpoint": "/functions/v1/submit-signup-application",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "sync-apple-storekit",
    "endpoint": "/functions/v1/sync-apple-storekit",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "tok-connect-admin",
    "endpoint": "/functions/v1/tok-connect-admin",
    "methods": [
      "POST"
    ],
    "actions": [
      "admin-overview",
      "admin-restaurants",
      "set-restaurant-mcp-access"
    ],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "tok-connect-api",
    "endpoint": "/functions/v1/tok-connect-api",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "tok-connect-app-bridge",
    "endpoint": "/functions/v1/tok-connect-app-bridge",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [
      "cancel_attempt",
      "checkout",
      "insert",
      "list",
      "select",
      "special_offers",
      "status",
      "update"
    ],
    "integrations": [
      "stripe",
      "supabase"
    ]
  },
  {
    "name": "tok-connect-broker",
    "endpoint": "/functions/v1/tok-connect-broker",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "tok-connect-chatgpt",
    "endpoint": "/functions/v1/tok-connect-chatgpt",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai",
      "supabase"
    ]
  },
  {
    "name": "tok-connect-commercial-bridge",
    "endpoint": "/functions/v1/tok-connect-commercial-bridge",
    "methods": [
      "POST"
    ],
    "actions": [
      "demo_session",
      "list",
      "read",
      "rpc"
    ],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "tok-connect-full-app-mcp",
    "endpoint": "/functions/v1/tok-connect-full-app-mcp",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "openai",
      "stripe",
      "supabase",
      "vercel"
    ]
  },
  {
    "name": "tok-connect-mcp",
    "endpoint": "/functions/v1/tok-connect-mcp",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "google",
      "openai",
      "stripe",
      "supabase",
      "vercel"
    ]
  },
  {
    "name": "tok-connect-oauth",
    "endpoint": "/functions/v1/tok-connect-oauth",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": []
  },
  {
    "name": "tok-connect-portal",
    "endpoint": "/functions/v1/tok-connect-portal",
    "methods": [
      "POST"
    ],
    "actions": [
      "approve-agent-run",
      "approve-partner",
      "create-sandbox-client",
      "create-webhook-endpoint",
      "mcp-connection-status",
      "overview",
      "reject-agent-run",
      "revoke-client",
      "revoke-partner",
      "rotate-client-secret",
      "send-webhook-test",
      "suspend-partner",
      "update-client-policy",
      "update-grant-status",
      "upsert-restaurant-grant"
    ],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "tok-connect-remote-mcp",
    "endpoint": "/functions/v1/tok-connect-remote-mcp",
    "methods": [
      "GET",
      "POST"
    ],
    "actions": [],
    "integrations": [
      "openai",
      "stripe",
      "supabase",
      "twint"
    ]
  },
  {
    "name": "tok-connect-webhook-dispatch",
    "endpoint": "/functions/v1/tok-connect-webhook-dispatch",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "tok-pulse-widget",
    "endpoint": "/functions/v1/tok-pulse-widget",
    "methods": [
      "GET"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "track-analytics",
    "endpoint": "/functions/v1/track-analytics",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "track-sponsored-event",
    "endpoint": "/functions/v1/track-sponsored-event",
    "methods": [
      "POST"
    ],
    "actions": [],
    "integrations": [
      "supabase"
    ]
  },
  {
    "name": "validate-order",
    "endpoint": "/functions/v1/validate-order",
    "methods": [
      "ANY"
    ],
    "actions": [],
    "integrations": [
      "stripe"
    ]
  },
  {
    "name": "verify-directory-commercial-names",
    "endpoint": "/functions/v1/verify-directory-commercial-names",
    "methods": [
      "GET"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  },
  {
    "name": "verify-directory-image-truth",
    "endpoint": "/functions/v1/verify-directory-image-truth",
    "methods": [
      "GET",
      "OPTIONS"
    ],
    "actions": [],
    "integrations": [
      "google",
      "supabase"
    ]
  }
] as const;
