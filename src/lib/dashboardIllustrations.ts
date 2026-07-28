export type DashboardIllustration = {
  src: string;
  width: number;
  height: number;
  alt: "";
};

const squareIllustration = (src: string): DashboardIllustration => ({
  src,
  width: 512,
  height: 512,
  alt: "",
});

export const DASHBOARD_ILLUSTRATIONS = {
  photoMarketing: squareIllustration("/images/dashboard-3d/marketing.webp"),
  photoPro: squareIllustration("/images/dashboard-3d/photopro.webp"),
  photoAdd: squareIllustration("/images/dashboard-3d/photo-add.webp"),
  photoGallery: squareIllustration("/images/dashboard-3d/gallery.webp"),
  photoCreations: squareIllustration("/images/dashboard-3d/creations.webp"),
  adminAnalytics: squareIllustration("/images/dashboard-3d/analytics.webp"),

  restaurantService: squareIllustration("/images/dashboard-3d/restaurant-service.webp"),
  restaurantOrders: squareIllustration("/images/dashboard-3d/restaurant-orders.webp"),
  restaurantFloorPlan: squareIllustration("/images/dashboard-3d/restaurant-floor-plan.webp"),
  restaurantProfile: squareIllustration("/images/dashboard-3d/restaurant-profile.webp"),
  restaurantAdvisor: squareIllustration("/images/dashboard-3d/restaurant-advisor.webp"),
  restaurantPerformance: squareIllustration("/images/dashboard-3d/restaurant-performance.webp"),
  restaurantComparison: squareIllustration("/images/dashboard-3d/restaurant-comparison.webp"),
  restaurantCrm: squareIllustration("/images/dashboard-3d/restaurant-crm.webp"),
  restaurantSupport: squareIllustration("/images/dashboard-3d/restaurant-support.webp"),
  restaurantCampaigns: squareIllustration("/images/dashboard-3d/restaurant-campaigns.webp"),
  restaurantPromotions: squareIllustration("/images/dashboard-3d/restaurant-promotions.webp"),
  restaurantReviews: squareIllustration("/images/dashboard-3d/restaurant-reviews.webp"),
  restaurantSocial: squareIllustration("/images/dashboard-3d/restaurant-social.webp"),
  restaurantNews: squareIllustration("/images/dashboard-3d/restaurant-news.webp"),
  restaurantFormulas: squareIllustration("/images/dashboard-3d/restaurant-formulas.webp"),
  restaurantTokConnect: squareIllustration("/images/dashboard-3d/restaurant-tok-connect.webp"),
  restaurantPack: squareIllustration("/images/dashboard-3d/restaurant-pack.webp"),
  restaurantBilling: squareIllustration("/images/dashboard-3d/restaurant-billing.webp"),
  restaurantInvoiceSettings: squareIllustration("/images/dashboard-3d/restaurant-invoice-settings.webp"),

  clientOrdersEmpty: squareIllustration("/images/dashboard-3d/client-orders-empty.webp"),
  courierJobsEmpty: squareIllustration("/images/dashboard-3d/courier-jobs-empty.webp"),
  commercialAccountingEmpty: squareIllustration("/images/dashboard-3d/commercial-accounting-empty.webp"),

  adminRestaurants: squareIllustration("/images/dashboard-3d/admin-restaurants.webp"),
  adminUsers: squareIllustration("/images/dashboard-3d/admin-users.webp"),
  adminCatalog: squareIllustration("/images/dashboard-3d/admin-catalog.webp"),
  adminLoyalty: squareIllustration("/images/dashboard-3d/admin-loyalty.webp"),
  adminOperations: squareIllustration("/images/dashboard-3d/admin-operations.webp"),
  adminAiOperations: squareIllustration("/images/dashboard-3d/admin-ai-operations.webp"),
  adminIncidents: squareIllustration("/images/dashboard-3d/admin-incidents.webp"),
  adminAudit: squareIllustration("/images/dashboard-3d/admin-audit.webp"),

  menu: { src: "/images/section-headers/plate-3d.png", width: 320, height: 320, alt: "" },
  reservations: { src: "/images/section-headers/calendar-3d.png", width: 320, height: 320, alt: "" },
  offers: { src: "/images/section-headers/gift-3d.png", width: 320, height: 320, alt: "" },
  flashSales: { src: "/images/section-headers/fire-3d.png", width: 320, height: 320, alt: "" },
  clientOrder: { src: "/images/section-headers/shopping-bags-3d.png", width: 320, height: 320, alt: "" },
  clientReservation: { src: "/images/section-headers/calendar-3d.png", width: 320, height: 320, alt: "" },
  clientDiscovery: { src: "/images/section-headers/plate-3d.png", width: 320, height: 320, alt: "" },
} as const satisfies Record<string, DashboardIllustration>;
