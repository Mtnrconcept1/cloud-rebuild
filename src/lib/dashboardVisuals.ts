import type { CSSProperties } from "react";

// Keep page-specific visual assets confined to the TOK dashboard media directory.
const assetRoot = "/images/dashboard-generated/";

const image = (surface: "restaurant" | "client", slug: string) => ({
  hero: `${assetRoot}${surface}_${slug}_hero.webp`,
  illustration: `${assetRoot}${surface}_${slug}_3d.webp`,
});

const restaurantRoutes: Record<string, string> = {
  "/dashboard": "accueil",
  "/dashboard/advisor": "assistant_ia",
  "/dashboard/commandes": "commandes",
  "/dashboard/reservations": "reservations",
  "/dashboard/performances": "performances",
  "/dashboard/comparaison": "comparaison",
  "/dashboard/avis": "avis_clients",
  "/dashboard/campagnes": "campagnes",
  "/dashboard/campaign-studio": "campaign_studio_ia",
  "/dashboard/crm": "crm_clients",
  "/dashboard/promotions": "promotions",
  "/dashboard/reseaux-sociaux": "reseaux_sociaux",
  "/dashboard/photos": "studio_marketing",
  "/dashboard/actualites": "actualites",
  "/dashboard/mon-compte-facturation": "compte_facturation",
  "/dashboard/factures": "comptabilite",
  "/dashboard/factures/entrees": "entrees",
  "/dashboard/factures/sorties": "sorties",
  "/dashboard/factures/parametres": "parametres_facturation",
  "/dashboard/tok-connect": "tok_connect",
  "/dashboard/restaurant": "mon_restaurant",
  "/dashboard/menu": "menu",
  "/dashboard/offres": "anti_gaspi",
  "/dashboard/ventes-flash": "ventes_flash",
  "/dashboard/formules": "formules",
  "/dashboard/service": "pilotage_service",
  "/dashboard/plan-salle": "plan_de_salle",
  "/dashboard/equipe": "tok_equipe",
  "/dashboard/notifications": "notifications",
  "/dashboard/support": "support",
  "/dashboard/guide": "guide",
};

const clientRoutes: Record<string, string> = {
  "/mon-espace": "accueil",
  "/reservations": "reservations",
  "/commandes": "achats",
  "/panier": "panier",
  "/mes-avis": "avis",
  "/anti-gaspi": "anti_gaspi",
  "/ventes-flash": "ventes_flash",
  "/actualites": "actualites",
  "/chefs-table": "tok_dor",
  "/zero-attente": "zero_attente",
  "/creneaux-garantis": "creneaux_garantis",
  "/flex-prix-bas": "flex_prix_bas",
  "/match-groupes": "match_groupes",
  "/multi-stop": "livraison_multistop",
  "/multi-restaurant": "multi_restaurant",
  "/garantie-qualite": "garantie_qualite",
  "/budget-auto": "budget_auto",
  "/tok-one": "tok_one",
  "/abonnement": "abonnement_repas",
  "/points-cadeau": "points_cadeau",
  "/tok-pulse": "tok_pulse",
  "/miamz-solidaires": "miamz_solidaires",
  "/notifications": "notifications",
  "/memoire-tok": "memoire_tok",
  "/contact": "support",
  "/commande/confirmation": "confirmation_commande",
};

export function getRestaurantDashboardVisual(pathname: string) {
  const slug = restaurantRoutes[pathname.replace(/\/$/, "")] ?? undefined;
  return slug ? image("restaurant", slug) : undefined;
}

export function getCustomerDashboardVisual(pathname: string, search = "") {
  const path = pathname.replace(/\/$/, "");
  if (path === "/commande/confirmation") return image("client", "confirmation_commande");
  if (/^\/commande\/[^/]+$/.test(path)) return image("client", "suivi_commande");
  if (path === "/profil") {
    const tab = new URLSearchParams(search).get("tab") || "infos";
    const slug = ({
      infos: "profil", favoris: "favoris", fidelite: "miamz", abonnement: "mon_abonnement",
    } as Record<string, string>)[tab] || "profil";
    return image("client", slug);
  }
  const slug = clientRoutes[path];
  return slug ? image("client", slug) : undefined;
}

export function getTokHeroStyle(src: string | undefined): CSSProperties | undefined {
  return src ? ({ "--tok-hero-image": `url("${src}")` } as CSSProperties) : undefined;
}
