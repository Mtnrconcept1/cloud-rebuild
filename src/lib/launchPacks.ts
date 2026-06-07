import {
  Settings,
  BookOpen,
  Camera,
  Share2,
  Megaphone,
  Map,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

// ── Service slugs ──
export type LaunchPackServiceSlug =
  | "mise_en_place"
  | "menu_creation"
  | "product_photography"
  | "social_media_setup"
  | "advertising_campaign"
  | "floor_plan_design"
  | "account_manager";

// ── Pack service (from JSONB) ──
export type PackService = {
  service: LaunchPackServiceSlug;
  label: string;
  description?: string;
  tier?: string;
  max_items?: number | null;
  quantity?: number | null;
  budget_chf?: number;
  months_management?: number;
};

// ── Pack definition ──
export type LaunchPack = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_chf: number;
  monthly_ai_image_limit?: number | null;
  monthly_ai_premium_image_limit?: number | null;
  ai_monthly_budget_chf?: number | string | null;
  is_active: boolean;
  position: number;
  badge_label: string | null;
  services: PackService[];
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Fulfillment status ──
export type FulfillmentStatus =
  | "pending"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

// ── Service fulfillment ──
export type ServiceFulfillment = {
  id: string;
  restaurant_pack_id: string;
  service_slug: LaunchPackServiceSlug;
  service_label: string;
  status: FulfillmentStatus;
  assigned_to: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

// ── Restaurant pack purchase status ──
export type PackPurchaseStatus =
  | "pending_payment"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled";

// ── Restaurant launch pack (with joins) ──
export type RestaurantLaunchPack = {
  id: string;
  restaurant_id: string;
  pack_id: string;
  purchased_by: string;
  status: PackPurchaseStatus;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  paid_at: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  launch_packs: LaunchPack;
  launch_pack_service_fulfillments: ServiceFulfillment[];
};

// ── Helpers ──

const SERVICE_ICONS: Record<LaunchPackServiceSlug, LucideIcon> = {
  mise_en_place: Settings,
  menu_creation: BookOpen,
  product_photography: Camera,
  social_media_setup: Share2,
  advertising_campaign: Megaphone,
  floor_plan_design: Map,
  account_manager: UserCheck,
};

export function getServiceIcon(slug: LaunchPackServiceSlug): LucideIcon {
  return SERVICE_ICONS[slug] ?? Settings;
}

const STATUS_COLORS: Record<FulfillmentStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending: "En attente",
  scheduled: "Planifie",
  in_progress: "En cours",
  completed: "Termine",
  cancelled: "Annule",
};

export function getStatusColor(status: FulfillmentStatus): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.pending;
}

export function getStatusLabel(status: FulfillmentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const PURCHASE_STATUS_LABELS: Record<PackPurchaseStatus, string> = {
  pending_payment: "En attente de paiement",
  paid: "Paye",
  in_progress: "En cours",
  completed: "Termine",
  cancelled: "Annule",
};

export function getPurchaseStatusLabel(status: PackPurchaseStatus): string {
  return PURCHASE_STATUS_LABELS[status] ?? status;
}

export function computePackProgress(fulfillments: ServiceFulfillment[]): number {
  if (fulfillments.length === 0) return 0;
  const completed = fulfillments.filter((f) => f.status === "completed").length;
  return Math.round((completed / fulfillments.length) * 100);
}

/** Format a service detail line (e.g. "25 plats", "illimite", "200 CHF de budget") */
export function formatServiceDetail(svc: PackService): string | null {
  if (svc.service === "product_photography") {
    return svc.quantity ? `${svc.quantity} plats` : "Tous les plats + ambiance";
  }
  if (svc.service === "menu_creation") {
    return svc.max_items ? `Jusqu'à ${svc.max_items} plats` : "Illimite";
  }
  if (svc.service === "advertising_campaign") {
    const parts: string[] = [];
    if (svc.quantity) parts.push(`${svc.quantity} campagne${svc.quantity > 1 ? "s" : ""}`);
    if (svc.budget_chf) parts.push(`${svc.budget_chf} CHF de budget`);
    return parts.join(" - ") || null;
  }
  if (svc.service === "social_media_setup" && svc.months_management) {
    return `+ ${svc.months_management} mois de gestion`;
  }
  return null;
}

export function formatLaunchPackAiQuota(
  pack: Pick<
    LaunchPack,
    "monthly_ai_image_limit" | "monthly_ai_premium_image_limit" | "ai_monthly_budget_chf"
  >,
): string | null {
  const standardLimit = Number(pack.monthly_ai_image_limit || 0);
  const premiumLimit = Number(pack.monthly_ai_premium_image_limit || 0);
  const monthlyBudget = Number(pack.ai_monthly_budget_chf || 0);

  if (standardLimit <= 0 && premiumLimit <= 0 && monthlyBudget <= 0) return null;

  const parts: string[] = [];
  if (standardLimit > 0) {
    parts.push(`${standardLimit} visuels IA/mois`);
  }
  if (premiumLimit > 0) {
    parts.push(`${premiumLimit} retouches premium`);
  }
  if (monthlyBudget > 0) {
    parts.push(`budget cap ${monthlyBudget.toLocaleString("fr-CH")} CHF/mois`);
  }

  return parts.join(" - ");
}
