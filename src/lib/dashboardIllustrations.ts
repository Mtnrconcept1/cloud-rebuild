export type DashboardIllustration = {
  src: string;
  width: number;
  height: number;
  alt: "";
};

export const DASHBOARD_ILLUSTRATIONS = {
  photoMarketing: { src: "/images/dashboard-3d/marketing.webp", width: 312, height: 320, alt: "" },
  photoPro: { src: "/images/dashboard-3d/photopro.webp", width: 320, height: 315, alt: "" },
  photoAdd: { src: "/images/dashboard-3d/photo-add.webp", width: 320, height: 234, alt: "" },
  photoGallery: { src: "/images/dashboard-3d/gallery.webp", width: 238, height: 320, alt: "" },
  photoCreations: { src: "/images/dashboard-3d/creations.webp", width: 320, height: 320, alt: "" },
  adminAnalytics: { src: "/images/dashboard-3d/analytics.webp", width: 233, height: 320, alt: "" },
  menu: { src: "/images/section-headers/plate-3d.png", width: 320, height: 320, alt: "" },
  reservations: { src: "/images/section-headers/calendar-3d.png", width: 320, height: 320, alt: "" },
  offers: { src: "/images/section-headers/gift-3d.png", width: 320, height: 320, alt: "" },
  flashSales: { src: "/images/section-headers/fire-3d.png", width: 320, height: 320, alt: "" },
  clientOrder: { src: "/images/section-headers/shopping-bags-3d.png", width: 320, height: 320, alt: "" },
  clientReservation: { src: "/images/section-headers/calendar-3d.png", width: 320, height: 320, alt: "" },
  clientDiscovery: { src: "/images/section-headers/plate-3d.png", width: 320, height: 320, alt: "" },
  courierEmpty: { src: "/images/section-headers/scooter-3d.png", width: 320, height: 320, alt: "" },
} as const satisfies Record<string, DashboardIllustration>;
