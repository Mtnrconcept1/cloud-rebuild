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

export type TokOneSubscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  user_subscription_plans: TokOnePlan | null;
};

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
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*, user_subscription_plans(*)")
        .eq("user_id", user!.id)
        .in("status", ["active", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as TokOneSubscription | null;
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
