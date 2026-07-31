import { Check, CreditCard, Loader2, Sparkles, WalletCards, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import {
  formatTokCredits,
  getTokCreditAmount,
} from "@/lib/tokCredits";
import {
  getRestaurantSubscriptionToolAccessState,
  normalizeRestaurantSubscriptionPlanSlug,
  RESTAURANT_SUBSCRIPTION_TOOL_ACCESS_ROWS,
} from "@/lib/restaurantSubscriptionToolAccess";
import {
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  getFairGrowthPlan,
  RESERVATION_FLAT_FEE_CHF,
} from "@/lib/fairGrowth";
import { cn } from "@/lib/utils";
import { getGoogleBusinessPlanPresentation } from "@/lib/googleBusinessServiceScope";

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
  return `${Number(value || 0).toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`;
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
  const planSlug = normalizeRestaurantSubscriptionPlanSlug(plan.slug);
  const fairGrowthPlan = getFairGrowthPlan(plan.slug);
  const annualPriceChf = fairGrowthPlan.monthlyPriceChf * FAIR_GROWTH_ANNUAL_MONTHS_CHARGED;
  const googleBusiness = getGoogleBusinessPlanPresentation(planSlug);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{plan.description || "Abonnement mensuel TOK restaurateur."}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <span className="text-4xl font-bold">{formatChf(fairGrowthPlan.monthlyPriceChf)}</span>
          <span className="ml-1 text-muted-foreground">/ mois</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Annuel {formatChf(annualPriceChf)} — 12 mois, payez-en 11
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm">
          <span><strong>{formatChf(RESERVATION_FLAT_FEE_CHF)}</strong> par réservation honorée, quelle qu'en soit l'origine</span>
          <span><strong>{(fairGrowthPlan.marketplaceCommissionBps / 100).toLocaleString("fr-CH")}%</strong> sur les commandes marketplace</span>
          <span>Site, QR code, Instagram, Google et fichier client : <strong>CHF 0</strong></span>
          <span>Annulation, no-show, remboursement et démonstration : <strong>CHF 0</strong></span>
          <span>Frais de réservation plafonnés à <strong>7% du CA de la table</strong></span>
          <span>Restaurant : <strong>au minimum 90%</strong> de la commande et 100% des pourboires</span>
          {fairGrowthPlan.slug === "elite" ? (
            <>
              <span><strong>3 établissements inclus</strong> · CHF 149/mois par site supplémentaire</span>
              <span className="text-xs text-muted-foreground">
                Rattachement multi-site et sites supplémentaires validés par TOK avant toute facturation additionnelle.
              </span>
            </>
          ) : null}
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
        <div className="space-y-2 rounded-xl border bg-background/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Accès outils</p>
          <div className="grid gap-1.5 text-xs">
            {RESTAURANT_SUBSCRIPTION_TOOL_ACCESS_ROWS.map((row) => {
              const { enabled, note } = getRestaurantSubscriptionToolAccessState(row, planSlug);

              return (
                <div key={row.label} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium",
                    enabled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {enabled ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {note}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-950">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Google Business Profile</p>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-bold">{googleBusiness.status}</span>
          </div>
          <p className="text-xs leading-5">{googleBusiness.detail}</p>
          <Link className="inline-flex text-xs font-semibold underline" to="/restaurateurs/google-business">
            Voir le périmètre, les prérequis et les limites
          </Link>
        </div>
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
          Fair Growth facture uniquement la valeur réellement créée : vos canaux propres restent gratuits, les réservations TOK ne sont facturées que lorsqu'elles sont honorées et le restaurant conserve au minimum 90% de chaque commande.
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
            <h2 className="text-3xl font-bold">Abonnements Fair Growth</h2>
            <p className="text-muted-foreground">Mensuel ou annuel facturé 11 mois pour 12, avec tarifs enregistrés à la souscription.</p>
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
