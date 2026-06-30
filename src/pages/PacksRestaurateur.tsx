import { Check, CreditCard, Loader2, Sparkles, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import {
  formatTokCredits,
  getTokCreditAmount,
} from "@/lib/tokCredits";

const supabase = getSupabase();

type RestaurantSubscriptionPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_chf: number;
  campaign_credit_chf: number;
  ai_tool_credits: number;
  ai_photo_credits: number;
  monthly_text_tool_limit: number;
  monthly_image_limit: number;
  monthly_premium_image_limit: number;
  features: string[] | null;
};

type RestaurantCreditPack = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_chf: number;
  campaign_credit_chf: number;
  ai_tool_credits: number;
  ai_photo_credits: number;
  features: string[] | null;
};

function formatChf(value: number) {
  return `${Number(value || 0).toLocaleString("fr-CH", { maximumFractionDigits: 0 })} CHF`;
}

function normalizeFeatures(value: string[] | null) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function getPlanIncludedUsage(plan: RestaurantSubscriptionPlan) {
  return {
    marketing: Math.max(0, Math.round(Number(plan.monthly_premium_image_limit || 0))),
    assistant: Math.max(0, Math.round(Number(plan.monthly_text_tool_limit || 0))),
    photos: Math.max(0, Math.round(Number(plan.monthly_image_limit || 0))),
  };
}

function useRestaurantSubscriptionPlans() {
  return useQuery({
    queryKey: ["public-restaurant-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurant_subscription_plans")
        .select("id, slug, name, description, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, features")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return (data || []) as RestaurantSubscriptionPlan[];
    },
  });
}

function useRestaurantCreditPacks() {
  return useQuery({
    queryKey: ["public-restaurant-credit-packs"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("restaurant_credit_packs")
        .select("id, slug, name, description, price_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, features")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return (data || []) as RestaurantCreditPack[];
    },
  });
}

function PlanCard({ plan }: { plan: RestaurantSubscriptionPlan }) {
  const features = normalizeFeatures(plan.features);
  const tokCredits = getTokCreditAmount(plan);
  const usage = getPlanIncludedUsage(plan);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{plan.description || "Abonnement mensuel TOK restaurateur."}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <span className="text-4xl font-bold">{formatChf(plan.price_monthly_chf)}</span>
          <span className="ml-1 text-muted-foreground">/ mois</span>
        </div>
        <div className="grid gap-2 rounded-xl bg-primary/5 p-3 text-sm text-primary">
          <span className="font-semibold">{formatTokCredits(tokCredits)} inclus pour les outils IA</span>
          <span>{usage.marketing.toLocaleString("fr-CH")} générations marketing / mois</span>
          <span>{usage.assistant.toLocaleString("fr-CH")} utilisations assistant IA / mois</span>
          <span>{usage.photos.toLocaleString("fr-CH")} retouches photo / mois</span>
        </div>
        {features.length ? (
          <ul className="space-y-2 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button asChild className="mt-auto w-full">
          <Link to="/auth?role=restaurateur">Choisir cet abonnement</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function CreditPackCard({ pack }: { pack: RestaurantCreditPack }) {
  const features = normalizeFeatures(pack.features);
  const tokCredits = getTokCreditAmount(pack);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{pack.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{pack.description || "Recharge ponctuelle de crédits TOK."}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <span className="text-4xl font-bold">{formatChf(pack.price_chf)}</span>
          <span className="ml-1 text-muted-foreground">paiement unique</span>
        </div>
        <div className="grid gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <span className="font-semibold">{formatTokCredits(tokCredits)}</span>
          <span>Recharge universelle pour campagnes, assistant IA, photos et supports marketing.</span>
        </div>
        {features.length ? (
          <ul className="space-y-2 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button asChild variant="outline" className="mt-auto w-full">
          <Link to="/dashboard/mon-compte-facturation">Acheter depuis le dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PacksRestaurateur() {
  const plansQuery = useRestaurantSubscriptionPlans();
  const creditPacksQuery = useRestaurantCreditPacks();
  const isLoading = plansQuery.isLoading || creditPacksQuery.isLoading;

  return (
    <div className="container space-y-16 py-12 md:py-20">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          <WalletCards className="h-4 w-4" /> Abonnements et crédits TOK
        </div>
        <h1 className="font-display text-4xl font-bold md:text-5xl">Choisissez votre abonnement TOK</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Les packs de lancement ne sont plus commercialisés. TOK propose désormais des abonnements restaurateur et des recharges de crédits TOK pour piloter campagnes, assistant IA, photos et visuels.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <a href="#abonnements">Voir les abonnements</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#credits-tok">Voir les crédits TOK</a>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Chargement des offres...
        </div>
      ) : null}

      <section id="abonnements" className="scroll-mt-28 space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-3xl font-bold">Abonnements restaurateur</h2>
            <p className="text-muted-foreground">Facturation mensuelle Stripe, crédits recalculés côté serveur.</p>
          </div>
        </div>
        {plansQuery.isError ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">Les abonnements sont temporairement indisponibles.</CardContent></Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {(plansQuery.data || []).map((plan) => <PlanCard key={plan.id} plan={plan} />)}
          </div>
        )}
      </section>

      <section id="credits-tok" className="scroll-mt-28 space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-3xl font-bold">Recharges de crédits TOK</h2>
            <p className="text-muted-foreground">Recharges ponctuelles disponibles depuis le dashboard restaurateur.</p>
          </div>
        </div>
        {creditPacksQuery.isError ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">Les recharges de crédits TOK sont temporairement indisponibles.</CardContent></Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {(creditPacksQuery.data || []).map((pack) => <CreditPackCard key={pack.id} pack={pack} />)}
          </div>
        )}
      </section>
    </div>
  );
}
