import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type TokOnePlan = {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  free_delivery_min_order: number | null;
  status: string;
  stripe_product_id: string | null;
};

export type TokOneBenefit = {
  id: string;
  plan_id: string;
  benefit_type: string;
  value: Record<string, any> | null;
};

export type TokOneJourney = "delivery" | "takeaway";

export const TOK_ONE_DEFAULT_DISCOUNT_PERCENT = 20;

export type TokOneSubscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  stripe_session_id?: string | null;
  billing_period?: string | null;
  user_subscription_plans: TokOnePlan | null;
};

async function fetchTokOnePlan(planId: string | null | undefined) {
  if (!planId) return null;
  const { data, error } = await (supabase as any)
    .from("user_subscription_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as TokOnePlan | null;
}

function attachPlan<T extends Record<string, any>>(subscription: T, plan: TokOnePlan | null): TokOneSubscription {
  return {
    ...subscription,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_subscription_id: subscription.stripe_subscription_id ?? null,
    user_subscription_plans: plan,
  } as TokOneSubscription;
}

function parseBenefitNumber(value: unknown, keys: string[]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  for (const key of keys) {
    const candidate = Number((value as Record<string, unknown>)[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

function normalizeBenefitList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeBenefitText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export function isTokOneBenefitApplicable(
  benefit: TokOneBenefit,
  input?: { restaurantId?: string | null; journey?: TokOneJourney | null },
) {
  const value = benefit.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;

  if (input?.restaurantId) {
    const restaurantIds = [
      ...normalizeBenefitList(value.restaurant_ids),
      ...normalizeBenefitList(value.restaurantIds),
      ...normalizeBenefitList(value.restaurants),
    ];

    if (restaurantIds.length > 0 && !restaurantIds.includes(input.restaurantId)) {
      return false;
    }
  }

  if (!input?.journey) return true;

  const contexts = [
    ...normalizeBenefitList(value.contexts),
    ...normalizeBenefitList(value.journeys),
    ...normalizeBenefitList(value.order_modes),
    ...normalizeBenefitList(value.applies_to),
    ...normalizeBenefitList(value.apply_to),
  ].map((entry) => normalizeBenefitText(entry));

  if (contexts.length === 0) return true;

  return contexts.some((entry) => (
    entry === "all" ||
    entry === "both" ||
    entry === "cart" ||
    entry === normalizeBenefitText(input.journey)
  ));
}

export function resolveTokOneDiscountPercentage(
  benefits: TokOneBenefit[] | null | undefined,
  fallback = TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
) {
  const discountBenefits = (benefits || [])
    .filter((benefit) => benefit.benefit_type === "discount_percentage");
  const configured = discountBenefits
    .reduce((best, benefit) => {
      const value = parseBenefitNumber(benefit.value, ["percentage", "discount_percent", "percent", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  return discountBenefits.length === 0 ? fallback : 0;
}

export function resolveTokOneDiscountPercentageForContext(
  benefits: TokOneBenefit[] | null | undefined,
  input: { restaurantId?: string | null; journey?: TokOneJourney | null },
  fallback = TOK_ONE_DEFAULT_DISCOUNT_PERCENT,
) {
  const discountBenefits = (benefits || [])
    .filter((benefit) => benefit.benefit_type === "discount_percentage");
  const restaurantScopedBenefits = discountBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, { restaurantId: input.restaurantId }));
  const configured = restaurantScopedBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, input))
    .reduce((best, benefit) => {
      const value = parseBenefitNumber(benefit.value, ["percentage", "discount_percent", "percent", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  if (input.journey === "takeaway") {
    const takeawayFallback = restaurantScopedBenefits
      .reduce((best, benefit) => {
        const value = parseBenefitNumber(benefit.value, ["percentage", "discount_percent", "percent", "value"]);
        return value > best ? value : best;
      }, 0);
    if (takeawayFallback > 0) return takeawayFallback;
  }
  return discountBenefits.length === 0 ? fallback : 0;
}

export function resolveTokOneFreeDeliveryMinOrder(
  plan: TokOnePlan | null | undefined,
  benefits: TokOneBenefit[] | null | undefined,
) {
  const configured = (benefits || [])
    .filter((benefit) => benefit.benefit_type === "free_delivery")
    .reduce((best, benefit) => {
      const value = parseBenefitNumber(benefit.value, ["min_order", "minimum_order", "free_delivery_min_order", "threshold", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  const planThreshold = Number(plan?.free_delivery_min_order || 0);
  return Number.isFinite(planThreshold) && planThreshold > 0 ? planThreshold : 0;
}

export function resolveTokOneFreeDeliveryMinOrderForContext(
  plan: TokOnePlan | null | undefined,
  benefits: TokOneBenefit[] | null | undefined,
  input: { restaurantId?: string | null; journey?: TokOneJourney | null },
) {
  const freeDeliveryBenefits = (benefits || [])
    .filter((benefit) => benefit.benefit_type === "free_delivery");
  const configured = freeDeliveryBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, input))
    .reduce((best, benefit) => {
      const value = parseBenefitNumber(benefit.value, ["min_order", "minimum_order", "free_delivery_min_order", "threshold", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  if (freeDeliveryBenefits.length > 0) return Number.POSITIVE_INFINITY;

  const planThreshold = Number(plan?.free_delivery_min_order || 0);
  return Number.isFinite(planThreshold) && planThreshold > 0 ? planThreshold : 0;
}

export function useTokOnePlans() {
  return useQuery({
    queryKey: ["tok-one-plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_subscription_plans")
        .select("*")
        .eq("status", "active")
        .order("price_monthly", { ascending: true });
      return (data || []) as TokOnePlan[];
    },
  });
}

export function useTokOneBenefits(planId: string | undefined) {
  return useQuery({
    queryKey: ["tok-one-benefits", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_benefits")
        .select("*")
        .eq("plan_id", planId!);
      return (data || []) as TokOneBenefit[];
    },
    enabled: !!planId,
  });
}

export function useTokOneSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tok-one-subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tok_one_subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const plan = await fetchTokOnePlan(data.plan_id);
        return attachPlan(data, plan);
      }

      const { data: transactions, error: transactionsError } = await (supabase as any)
        .from("payment_transactions")
        .select("id, stripe_checkout_session_id, created_at, metadata, status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (transactionsError) throw transactionsError;

      const latestTokOnePayment = ((transactions || []) as any[]).find((transaction) => {
        const metadata = transaction?.metadata;
        return (
          metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata) &&
          metadata.checkout_kind === "tok-one" &&
          metadata.plan_id &&
          ["paid", "succeeded"].includes(String(transaction?.status || ""))
        );
      });

      if (!latestTokOnePayment) return null;

      const paymentMetadata = latestTokOnePayment.metadata as Record<string, any>;
      const billingPeriod = paymentMetadata.billing_period === "yearly" ? "yearly" : "monthly";
      const periodStart = new Date(latestTokOnePayment.created_at);
      const periodEnd = new Date(periodStart);

      if (billingPeriod === "yearly") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      if (periodEnd <= new Date()) return null;

      const recoveredPlan = await fetchTokOnePlan(paymentMetadata.plan_id);

      const recoveryPayload = {
        user_id: user!.id,
        plan_id: paymentMetadata.plan_id,
        status: "active",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        stripe_subscription_id: null,
      };

      const recoveryView = {
        ...recoveryPayload,
        billing_period: billingPeriod,
        stripe_session_id: latestTokOnePayment.stripe_checkout_session_id || null,
      };

      return attachPlan({
        ...recoveryView,
        id: `recovered-${latestTokOnePayment.id}`,
      }, recoveredPlan);
    },
    enabled: !!user,
  });
}

/** Quick boolean check: does the user have an active Tok One subscription? */
export function useIsTokOneMember() {
  const { data: sub, isLoading } = useTokOneSubscription();
  const isActive = !!sub && sub.status === "active" && new Date(sub.current_period_end) > new Date();
  return { isMember: isActive, subscription: sub, isLoading };
}
