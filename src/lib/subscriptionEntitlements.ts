export type SubscriptionBenefitInput = {
  benefit_type: string;
  value: Record<string, unknown> | null;
};

export type TokOnePlanLike = {
  free_delivery_min_order?: number | null;
};

export type TokOneEntitlementFlags = {
  chefTablePriority: boolean;
  flashEarlyAccess: boolean;
  prioritySupport: boolean;
  surpriseOffers: boolean;
};

export const TOK_ONE_DEFAULT_DISCOUNT_PERCENT = 20;

export const TOK_ONE_DEFAULT_BENEFITS = [
  {
    id: "free_delivery",
    label: "Livraison gratuite",
    description: "Frais de livraison offerts selon les conditions du plan.",
  },
  {
    id: "discount_percentage",
    label: "Reductions exclusives",
    description: "Jusqu'a 20% sur les plats éligibles.",
  },
  {
    id: "chef_table_priority",
    label: "Acces prioritaire La Table du Chef",
    description: "Acces prioritaire aux experiences gastronomiques.",
  },
  {
    id: "flash_early_access",
    label: "Ventes flash en avance",
    description: "Acces anticipe aux offres limitées.",
  },
  {
    id: "priority_support",
    label: "Support prioritaire",
    description: "Demandes traitées en priorite.",
  },
  {
    id: "surprise_offers",
    label: "Offres surprises",
    description: "Attentions réservées aux membres Tok One.",
  },
] as const;

type BenefitId = typeof TOK_ONE_DEFAULT_BENEFITS[number]["id"];

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBenefitNumber(benefit: SubscriptionBenefitInput | undefined, keys: string[]) {
  if (!benefit?.value) return 0;

  for (const key of keys) {
    const value = asNumber(benefit.value[key]);
    if (value > 0) return value;
  }

  return 0;
}

function isEnabled(benefit: SubscriptionBenefitInput | undefined) {
  if (!benefit?.value || typeof benefit.value.enabled === "undefined") return true;
  return benefit.value.enabled !== false;
}

export function buildTokOneEntitlements(input: {
  plan: TokOnePlanLike | null | undefined;
  benefits: SubscriptionBenefitInput[] | null | undefined;
}) {
  const benefits = input.benefits || [];
  const byType = new Map(benefits.map((benefit) => [benefit.benefit_type, benefit]));
  const discountBenefit = byType.get("discount_percentage");
  const freeDeliveryBenefit = byType.get("free_delivery");
  const configuredDiscount = getBenefitNumber(discountBenefit, [
    "percentage",
    "discount_percent",
    "percent",
    "value",
  ]);
  const configuredFreeDelivery = getBenefitNumber(freeDeliveryBenefit, [
    "min_order",
    "minimum_order",
    "free_delivery_min_order",
    "threshold",
    "value",
  ]);
  const planFreeDelivery = asNumber(input.plan?.free_delivery_min_order);

  const flags: TokOneEntitlementFlags = {
    chefTablePriority: isEnabled(byType.get("chef_table_priority")),
    flashEarlyAccess: isEnabled(byType.get("flash_early_access")),
    prioritySupport: isEnabled(byType.get("priority_support")),
    surpriseOffers: isEnabled(byType.get("surprise_offers")),
  };

  const enabledById: Record<BenefitId, boolean> = {
    free_delivery: isEnabled(freeDeliveryBenefit),
    discount_percentage: isEnabled(discountBenefit),
    chef_table_priority: flags.chefTablePriority,
    flash_early_access: flags.flashEarlyAccess,
    priority_support: flags.prioritySupport,
    surprise_offers: flags.surpriseOffers,
  };

  return {
    discountPercent: enabledById.discount_percentage ? configuredDiscount || TOK_ONE_DEFAULT_DISCOUNT_PERCENT : 0,
    freeDeliveryMinOrder: enabledById.free_delivery
      ? configuredFreeDelivery || planFreeDelivery || 0
      : Number.POSITIVE_INFINITY,
    flags,
    displayBenefits: TOK_ONE_DEFAULT_BENEFITS.map((benefit) => ({
      ...benefit,
      enabled: enabledById[benefit.id],
    })),
  };
}

export type TokOneBenefitForm = {
  discountPercent: number;
  freeDeliveryMinOrder: number;
  chefTablePriority: boolean;
  flashEarlyAccess: boolean;
  prioritySupport: boolean;
  surpriseOffers: boolean;
};

export function buildSubscriptionBenefitRows(planId: string, form: TokOneBenefitForm) {
  return [
    {
      plan_id: planId,
      benefit_type: "discount_percentage",
      value: { percentage: Number(form.discountPercent || 0) },
    },
    {
      plan_id: planId,
      benefit_type: "free_delivery",
      value: { min_order: Number(form.freeDeliveryMinOrder || 0) },
    },
    {
      plan_id: planId,
      benefit_type: "chef_table_priority",
      value: { enabled: Boolean(form.chefTablePriority) },
    },
    {
      plan_id: planId,
      benefit_type: "flash_early_access",
      value: { enabled: Boolean(form.flashEarlyAccess) },
    },
    {
      plan_id: planId,
      benefit_type: "priority_support",
      value: { enabled: Boolean(form.prioritySupport) },
    },
    {
      plan_id: planId,
      benefit_type: "surprise_offers",
      value: { enabled: Boolean(form.surpriseOffers) },
    },
  ];
}
