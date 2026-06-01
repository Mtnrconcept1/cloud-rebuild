export type LoyaltyTierId = "bronze" | "silver" | "gold" | "platinum";

export type LoyaltyBenefit = {
  id: string;
  title: string;
  description: string;
  appliesFrom: LoyaltyTierId;
  highlight?: boolean;
};

export const LOYALTY_TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;

export const LOYALTY_TIERS: Record<LoyaltyTierId, {
  id: LoyaltyTierId;
  label: string;
  threshold: number;
  nextThreshold: number | null;
  colorClass: string;
}> = {
  bronze: {
    id: "bronze",
    label: "Bronze",
    threshold: 0,
    nextThreshold: 1000,
    colorClass: "bg-orange-700",
  },
  silver: {
    id: "silver",
    label: "Silver",
    threshold: 1000,
    nextThreshold: 2500,
    colorClass: "bg-slate-400",
  },
  gold: {
    id: "gold",
    label: "Gold",
    threshold: 2500,
    nextThreshold: 5000,
    colorClass: "bg-amber-400",
  },
  platinum: {
    id: "platinum",
    label: "Platinum",
    threshold: 5000,
    nextThreshold: null,
    colorClass: "bg-indigo-400",
  },
};

export const LOYALTY_BENEFITS: LoyaltyBenefit[] = [
  {
    id: "welcome_miamz",
    title: "Bonus Miamz regulier",
    description: "Cumulez des Miamz sur les commandes, réservations et actions qualifiees du compte.",
    appliesFrom: "bronze",
  },
  {
    id: "birthday_bonus",
    title: "Bonus anniversaire",
    description: "Recevez une attention Miamz pendant votre mois anniversaire, selon les partenaires actifs.",
    appliesFrom: "bronze",
  },
  {
    id: "personalized_recommendations",
    title: "Recommandations personnalisees",
    description: "Profitez de suggestions basees sur vos cuisines, favoris et horaires de commande habituels.",
    appliesFrom: "bronze",
  },
  {
    id: "early_deals",
    title: "Accès bons plans",
    description: "Découvrez les opérations locales avant leur mise en avant générale dans l'application.",
    appliesFrom: "bronze",
  },
  {
    id: "silver_multiplier",
    title: "Multiplicateur Silver",
    description: "Gagnez davantage de Miamz sur les achats éligibles pour progresser plus vite.",
    appliesFrom: "silver",
    highlight: true,
  },
  {
    id: "reservation_priority",
    title: "Priorite réservation",
    description: "Les tables disponibles et les créneaux Zéro Attente sont remontes plus haut pour vous.",
    appliesFrom: "silver",
  },
  {
    id: "delivery_fee_boost",
    title: "Avantages livraison",
    description: "Des avantages de livraison peuvent être actives sur certains restaurants et paniers éligibles.",
    appliesFrom: "silver",
  },
  {
    id: "exclusive_partner_events",
    title: "Evenements partenaires",
    description: "Recevez des invitations a des menus tests, ouvertures et expériences locales sélectionnées.",
    appliesFrom: "silver",
  },
  {
    id: "gold_multiplier",
    title: "Multiplicateur Gold",
    description: "Les commandes et réservations éligibles rapportent un bonus Miamz supérieur au niveau Silver.",
    appliesFrom: "gold",
    highlight: true,
  },
  {
    id: "priority_support",
    title: "Support prioritaire",
    description: "Vos demandes support liees aux commandes, réservations et remboursements sont traitées en priorité.",
    appliesFrom: "gold",
    highlight: true,
  },
  {
    id: "premium_slots",
    title: "Créneaux premium",
    description: "Accedez en priorité à certains créneaux très demandes quand les restaurants les ouvrent.",
    appliesFrom: "gold",
  },
  {
    id: "restaurant_gifts",
    title: "Attentions restaurants",
    description: "Recevez des attentions partenaires ponctuelles selon vos habitudes et les campagnes actives.",
    appliesFrom: "gold",
  },
  {
    id: "platinum_multiplier",
    title: "Multiplicateur Platinum",
    description: "Le plus haut bonus Miamz est applique aux achats éligibles pour les clients les plus actifs.",
    appliesFrom: "platinum",
    highlight: true,
  },
  {
    id: "vip_table_access",
    title: "Accès tables VIP",
    description: "Profitez d'un accès prioritaire aux tables rares et expériences premium ouvertes par les partenaires.",
    appliesFrom: "platinum",
    highlight: true,
  },
  {
    id: "concierge_booking",
    title: "Conciergerie réservation",
    description: "Les demandes complexes de réservation peuvent être accompagnees par le support Tok.",
    appliesFrom: "platinum",
  },
  {
    id: "premium_refunds",
    title: "Traitement premium",
    description: "Les dossiers sensibles de remboursement et litige bénéficient d'une file de traitement dédiée.",
    appliesFrom: "platinum",
  },
];

export function isLoyaltyTier(value: unknown): value is LoyaltyTierId {
  return typeof value === "string" && LOYALTY_TIER_ORDER.includes(value as LoyaltyTierId);
}

export function getTierForPoints(points: number): LoyaltyTierId {
  const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
  const ordered = [...LOYALTY_TIER_ORDER].reverse();
  return ordered.find((tier) => safePoints >= LOYALTY_TIERS[tier].threshold) || "bronze";
}

export function getTierBenefits(tier: LoyaltyTierId): LoyaltyBenefit[] {
  const tierIndex = LOYALTY_TIER_ORDER.indexOf(tier);
  return LOYALTY_BENEFITS.filter((benefit) => LOYALTY_TIER_ORDER.indexOf(benefit.appliesFrom) <= tierIndex);
}

export function getLockedTierBenefits(tier: LoyaltyTierId): LoyaltyBenefit[] {
  const tierIndex = LOYALTY_TIER_ORDER.indexOf(tier);
  return LOYALTY_BENEFITS.filter((benefit) => LOYALTY_TIER_ORDER.indexOf(benefit.appliesFrom) > tierIndex);
}

export function getLoyaltyStatus(points: number, explicitTier?: string | null) {
  const safePoints = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const pointsTier = getTierForPoints(safePoints);
  const currentTier = isLoyaltyTier(explicitTier) && LOYALTY_TIERS[explicitTier].threshold <= safePoints
    ? explicitTier
    : pointsTier;
  const tier = LOYALTY_TIERS[currentTier];
  const nextTier = LOYALTY_TIER_ORDER[LOYALTY_TIER_ORDER.indexOf(currentTier) + 1] || null;
  const nextThreshold = tier.nextThreshold;

  return {
    currentTier,
    nextTier,
    currentThreshold: tier.threshold,
    nextThreshold,
    progressPercent: nextThreshold ? Math.min(100, Math.round((safePoints / nextThreshold) * 100)) : 100,
    pointsToNextTier: nextThreshold ? Math.max(0, nextThreshold - safePoints) : 0,
  };
}
