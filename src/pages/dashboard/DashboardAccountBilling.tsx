import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Megaphone,
  PlusCircle,
  ReceiptText,
  RotateCcw,
  Sparkles,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { getSupabase } from "@/integrations/supabase/client";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import {
  getRestaurantSubscriptionToolAccessState,
  normalizeRestaurantSubscriptionPlanSlug,
  RESTAURANT_SUBSCRIPTION_TOOL_ACCESS_ROWS,
} from "@/lib/restaurantSubscriptionToolAccess";
import { invokeSupabaseFunction } from "@/lib/session";
import {
  clearPaymentAttemptId,
  createCheckoutWithRecovery,
  createPaymentAttemptOperationKey,
  getOrCreatePaymentAttemptId,
  isPaymentAttemptIndeterminateError,
  markPaymentAttemptRedirected,
  normalizePaymentAttemptId,
  rememberPaymentAttemptId,
} from "@/lib/paymentAttempt";
import { usePaymentAttemptBackCancellation } from "@/lib/usePaymentAttemptBackCancellation";
import {
  formatTokCredits,
  getAiSimpleRequestEquivalent,
  getCampaignEquivalentChf,
  getPhotoSimpleEquivalent,
  getTokCreditAmount,
  TOK_DEMO_UNLIMITED_CREDIT_THRESHOLD,
  TOK_CREDITS_PER_CAMPAIGN_CHF,
} from "@/lib/tokCredits";
import { cn } from "@/lib/utils";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

const supabase = getSupabase();

// One scope per billing page keeps exactly one resumable Stripe operation.
// Separate subscription/credit scopes could both be marked as redirected and
// a later browser-back navigation would then cancel two unrelated sessions.
const billingAttemptScope = (restaurantId: string) => `restaurant-billing:${restaurantId}`;

type CreditKind = "tok_credits" | "campaign" | "ai_tools" | "photo_retouch";

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
  position: number;
  is_active: boolean;
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
  position: number;
  is_active: boolean;
};

type BillingCreditSummary = {
  kind: CreditKind;
  label: string;
  unit: "CHF" | "crédit" | string;
  allowance: number;
  included_allowance?: number;
  topup_allowance?: number;
  subscription_balance?: number;
  topup_balance?: number;
  topup_spent?: number;
  spent: number;
  balance: number;
  metadata?: Record<string, unknown> | null;
};

type BillingCreditEntry = {
  id: string;
  credit_kind: CreditKind;
  label: string;
  description: string | null;
  occurred_at: string;
  credit_amount: number;
  credit_unit: "CHF" | "credit" | string;
  estimated_cost_chf: number;
  status: string | null;
  metadata: Record<string, unknown> | null;
  source_table: string;
  source_id: string;
};

type BillingCreditUsage = {
  period: {
    start: string;
    end: string;
    generated_at: string;
  };
  subscription: null | {
    id: string;
    restaurant_id: string;
    plan: string;
    status: string;
    billing_period: string;
    stripe_subscription_id: string | null;
    current_period_start: string;
    current_period_end: string;
    plan_record: null | {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      price_monthly_chf: number;
      features: string[] | null;
      position: number;
    };
  };
  credits: BillingCreditSummary[];
  entries: BillingCreditEntry[];
};

type ScheduledSubscriptionChange = {
  action?: "cancel" | "downgrade" | string;
  effective_at?: string | null;
  requested_at?: string | null;
  target_plan_id?: string | null;
  target_plan_slug?: string | null;
  target_plan_name?: string | null;
  stripe_subscription_schedule_id?: string | null;
};

type RestaurantSubscriptionSelfServiceState = {
  id: string;
  restaurant_id: string;
  status: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan_change: ScheduledSubscriptionChange | null;
  stripe_subscription_schedule_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

type PendingSubscriptionAction =
  | { type: "cancel" }
  | { type: "resume" }
  | { type: "downgrade"; plan: RestaurantSubscriptionPlan };

type SubscriptionActionState = PendingSubscriptionAction["type"];

const CREDIT_META: Record<CreditKind, {
  icon: typeof Megaphone;
  tone: string;
  label: string;
}> = {
  tok_credits: {
    icon: WalletCards,
    tone: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-400/20",
    label: "Crédits TOK",
  },
  campaign: {
    icon: Megaphone,
    tone: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-100 dark:border-orange-400/20",
    label: "Campagne",
  },
  ai_tools: {
    icon: Sparkles,
    tone: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:border-sky-400/20",
    label: "Assistant IA",
  },
  photo_retouch: {
    icon: Camera,
    tone: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-100 dark:border-violet-400/20",
    label: "Photo et visuel",
  },
};

const EMPTY_CREDITS: BillingCreditSummary[] = [];
const EMPTY_ENTRIES: BillingCreditEntry[] = [];
const COMMERCIAL_DEMO_BILLING_TOOLS = [
  { title: "Studio marketing", description: "Visuels Démo sans consommation de crédit payant.", icon: Camera, feature: "dashboard-photos" },
  { title: "Assistant IA", description: "Conversations isolées, moteur Démo à coût nul.", icon: Sparkles, feature: "dashboard-advisor" },
  { title: "Chat IA", description: "Assistance temps réel conservée dans les tables Démo.", icon: Sparkles, feature: "ai_support_chat" },
  { title: "Campagnes", description: "Prévisualisation complète sans débit publicitaire réel.", icon: Megaphone, feature: "dashboard-campagnes" },
] as const;

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatChf(value: unknown) {
  return `${toNumber(value).toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CHF`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Non daté";
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBillingPeriod(value: string | null | undefined) {
  return value === "yearly" ? "Annuelle" : "Mensuelle";
}

function isScheduledSubscriptionChange(value: unknown): value is ScheduledSubscriptionChange {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as ScheduledSubscriptionChange).action === "string"
    && (value as ScheduledSubscriptionChange).action !== "";
}

function getScheduledChangeSummary(change: ScheduledSubscriptionChange | null | undefined) {
  if (!isScheduledSubscriptionChange(change)) return null;
  const effectiveAt = formatDateTime(change.effective_at);

  if (change.action === "downgrade") {
    return {
      title: "Plan inférieur programmé",
      description: `Le passage vers ${change.target_plan_name || "le plan inférieur"} prendra effet le ${effectiveAt}. Votre abonnement actuel reste actif avec tous ses avantages jusque-là.`,
    };
  }

  if (change.action === "cancel") {
    return {
      title: "Résiliation programmée",
      description: `Votre abonnement reste actif avec tous ses avantages jusqu'au ${effectiveAt}. Aucun renouvellement ne sera lancé après cette date.`,
    };
  }

  return null;
}

function normalizeFeatures(value: string[] | null) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeFeatureForComparison(feature: string) {
  return feature.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isCreditEquivalenceFeature(feature: string) {
  const normalized = normalizeFeatureForComparison(feature);

  return (
    (/^\d/.test(normalized) && normalized.includes("credit") && normalized.includes("tok")) ||
    normalized.includes("campagnes tok") ||
    normalized.includes("requetes assistant") ||
    normalized.includes("utilisations assistant") ||
    normalized.includes("retouches photo") ||
    normalized.includes("photos culinaires") ||
    normalized.includes("generations marketing") ||
    normalized.includes("affiches ou flyers") ||
    normalized.includes("cout openai") ||
    normalized.includes("openai")
  );
}

function getConciseBillingFeatures(value: string[] | null) {
  return normalizeFeatures(value).filter((feature) => !isCreditEquivalenceFeature(feature));
}

function getPlanIncludedUsage(plan: RestaurantSubscriptionPlan) {
  return {
    marketing: Math.max(0, Math.round(toNumber(plan.monthly_premium_image_limit))),
    assistant: Math.max(0, Math.round(toNumber(plan.monthly_text_tool_limit))),
    photos: Math.max(0, Math.round(toNumber(plan.monthly_image_limit))),
  };
}

function toTokCreditUnits(amount: number, unit: string) {
  if (unit === "CHF") return Math.round(amount * TOK_CREDITS_PER_CAMPAIGN_CHF);
  return Math.round(amount);
}

function buildUnifiedTokCreditSummary(credits: BillingCreditSummary[]): BillingCreditSummary | null {
  if (!credits.length) return null;

  const directTokCredit = credits.find((credit) => credit.kind === "tok_credits");
  if (directTokCredit) return directTokCredit;

  const allowance = credits.reduce((sum, credit) => sum + toTokCreditUnits(toNumber(credit.allowance), credit.unit), 0);
  const spent = credits.reduce((sum, credit) => sum + toTokCreditUnits(toNumber(credit.spent), credit.unit), 0);

  return {
    kind: "tok_credits",
    label: "Crédits TOK",
    unit: "credit",
    allowance,
    spent,
    balance: Math.max(allowance - spent, 0),
  };
}

function formatEntryTokCreditAmount(entry: BillingCreditEntry) {
  const credits = toTokCreditUnits(toNumber(entry.credit_amount), entry.credit_unit);
  return formatTokCredits(credits);
}

function isDemoUnlimitedTokCreditBalance(value: unknown) {
  return toNumber(value) >= TOK_DEMO_UNLIMITED_CREDIT_THRESHOLD;
}

function getSubscriptionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return "Essai actif";
    case "active":
      return "Actif";
    case "past_due":
      return "Paiement en retard";
    case "paused":
      return "En pause";
    case "cancelled":
    case "canceled":
      return "Annulé";
    default:
      return "Non configuré";
  }
}

async function fetchRestaurantCreditUsage(restaurantId: string): Promise<BillingCreditUsage> {
  const { data, error } = await (supabase.rpc as any)("get_restaurant_credit_usage", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return data as BillingCreditUsage;
}

async function fetchRestaurantSubscriptionSelfServiceState(
  restaurantId: string,
): Promise<RestaurantSubscriptionSelfServiceState | null> {
  const { data, error } = await (supabase.rpc as any)("get_restaurant_subscription_self_service_state", {
    p_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return data as RestaurantSubscriptionSelfServiceState | null;
}

async function fetchRestaurantSubscriptionPlans(): Promise<RestaurantSubscriptionPlan[]> {
  const { data, error } = await (supabase.from as any)("restaurant_subscription_plans")
    .select("id, slug, name, description, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, features, position, is_active")
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data || []) as RestaurantSubscriptionPlan[];
}

async function fetchRestaurantCreditPacks(): Promise<RestaurantCreditPack[]> {
  const { data, error } = await (supabase.from as any)("restaurant_credit_packs")
    .select("id, slug, name, description, price_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, features, position, is_active")
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data || []) as RestaurantCreditPack[];
}

function CreditSummaryCard({ credit }: { credit: BillingCreditSummary }) {
  const meta = CREDIT_META[credit.kind] ?? CREDIT_META.ai_tools;
  const Icon = meta.icon;
  const allowance = toNumber(credit.allowance);
  const includedAllowance = toNumber(credit.included_allowance ?? credit.metadata?.included_allowance ?? allowance);
  const topupAllowance = toNumber(credit.topup_allowance ?? credit.metadata?.topup_allowance ?? 0);
  const topupBalance = toNumber(credit.topup_balance ?? credit.metadata?.topup_balance ?? 0);
  const spent = toNumber(credit.spent);
  const isDemoUnlimited = isDemoUnlimitedTokCreditBalance(credit.balance);
  const progress = allowance > 0 ? Math.min(100, Math.round((spent / allowance) * 100)) : 0;

  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{credit.label}</p>
            <p className="text-xs text-muted-foreground">Solde universel</p>
          </div>
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", meta.tone)}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-bold">{formatTokCredits(credit.balance)}</p>
          {isDemoUnlimited ? (
            <p className="text-xs text-muted-foreground">
              Compte démo : les outils IA restent disponibles pour les présentations commerciales.
            </p>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Dépensé: {formatTokCredits(spent)}</span>
              <span>Inclus abonnement: {formatTokCredits(includedAllowance)}</span>
            </div>
          )}
          {topupAllowance > 0 && !isDemoUnlimited ? (
            <div className="grid gap-1 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-xs text-orange-900 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-100">
              <div className="flex items-center justify-between gap-3">
                <span>Recharges payees</span>
                <span className="font-semibold">{formatTokCredits(topupAllowance)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Solde recharge</span>
                <span className="font-semibold">{formatTokCredits(topupBalance)}</span>
              </div>
            </div>
          ) : null}
          <Progress value={progress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  currentPosition,
  currentPlanId,
  checkingOutPlanId,
  selfServicePlanId,
  hasScheduledChange,
  onUpgrade,
  onDowngrade,
}: {
  plan: RestaurantSubscriptionPlan;
  currentPosition: number;
  currentPlanId: string | null;
  checkingOutPlanId: string | null;
  selfServicePlanId: string | null;
  hasScheduledChange: boolean;
  onUpgrade: (plan: RestaurantSubscriptionPlan) => void;
  onDowngrade: (plan: RestaurantSubscriptionPlan) => void;
}) {
  const isCurrent = currentPlanId === plan.id;
  const isUpgrade = !isCurrent && plan.position > currentPosition;
  const isDowngrade = !isCurrent && plan.position < currentPosition;
  const isBusy = checkingOutPlanId === plan.id || selfServicePlanId === plan.id;
  const features = getConciseBillingFeatures(plan.features);
  const tokCredits = getTokCreditAmount(plan);
  const usage = getPlanIncludedUsage(plan);
  const planSlug = normalizeRestaurantSubscriptionPlanSlug(plan.slug);

  return (
    <Card className={cn("flex h-full flex-col", isCurrent && "border-primary/60 bg-primary/5")}>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{plan.name}</CardTitle>
          </div>
          {isCurrent ? <Badge>Actuel</Badge> : isUpgrade ? <Badge variant="outline">Upgrade</Badge> : isDowngrade ? <Badge variant="secondary">Fin de période</Badge> : null}
        </div>
        <p className="text-3xl font-bold">
          {formatChf(plan.price_monthly_chf)}
          <span className="text-sm font-medium text-muted-foreground"> / mois</span>
        </p>
        <p className="text-sm font-medium text-primary">{formatTokCredits(tokCredits)} inclus pour les outils IA</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid gap-2 rounded-xl border bg-muted/35 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>Générations marketing</span>
            <span className="font-semibold">{usage.marketing.toLocaleString("fr-CH")}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Utilisations assistant IA</span>
            <span className="font-semibold">{usage.assistant.toLocaleString("fr-CH")}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Retouches photo</span>
            <span className="font-semibold">{usage.photos.toLocaleString("fr-CH")}</span>
          </div>
        </div>
        {features.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {features.slice(0, 5).map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
        <Button
          className="mt-auto w-full"
          variant={isUpgrade ? "default" : "outline"}
          disabled={isCurrent || hasScheduledChange || (!isUpgrade && !isDowngrade) || isBusy}
          onClick={() => {
            if (isUpgrade) {
              onUpgrade(plan);
            } else if (isDowngrade) {
              onDowngrade(plan);
            }
          }}
        >
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
          {isCurrent
            ? "Abonnement actuel"
            : hasScheduledChange
              ? "Changement programmé"
              : isUpgrade
                ? "Upgrader"
                : "Programmer ce plan"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CreditPackCard({
  pack,
  checkingOutPackId,
  onBuy,
}: {
  pack: RestaurantCreditPack;
  checkingOutPackId: string | null;
  onBuy: (pack: RestaurantCreditPack) => void;
}) {
  const features = getConciseBillingFeatures(pack.features);
  const isCheckingOut = checkingOutPackId === pack.id;
  const tokCredits = getTokCreditAmount(pack);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{pack.name}</CardTitle>
          </div>
          <Badge variant="outline">Recharge</Badge>
        </div>
        <p className="text-3xl font-bold">
          {formatChf(pack.price_chf)}
          <span className="text-sm font-medium text-muted-foreground"> TTC</span>
        </p>
        <p className="text-sm font-medium text-primary">{formatTokCredits(tokCredits)} recharge universelle</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {features.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          className="mt-auto w-full"
          onClick={() => onBuy(pack)}
          disabled={isCheckingOut}
        >
          {isCheckingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
          Acheter ce pack
        </Button>
      </CardContent>
    </Card>
  );
}

function CreditKindBadge({ kind }: { kind: CreditKind }) {
  const meta = CREDIT_META[kind] ?? CREDIT_META.ai_tools;
  const Icon = meta.icon;

  return (
    <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap", meta.tone)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

function CommercialDemoAccountBilling() {
  const commercialDemoFrame = useCommercialDemoFrame();
  if (!commercialDemoFrame) return null;
  const activeFeatures = commercialDemoFrame.snapshot.active_features;
  const activeFeatureSet = new Set(activeFeatures);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Abonnement · Démonstration"
          title="Outils et crédits Démo"
          description="Tous les outils activés par l'admin sont disponibles dans ce restaurant simulé. Aucun achat, crédit payant ou abonnement réel ne peut être modifié ici."
          icon={WalletCards}
          tone="violet"
          visualLabel="Illimité"
          stats={[
            { label: "Fonctionnalités actives", value: activeFeatures.length, icon: CheckCircle2 },
            { label: "Crédits Démo", value: "Illimités", icon: Sparkles },
            { label: "Coût réel", value: "0 CHF", icon: CreditCard },
          ]}
        />

        <Alert className="border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Environnement commercial isolé</AlertTitle>
          <AlertDescription>
            Les générations et parcours présentés utilisent les espaces Démo dédiés. Les boutons d'achat et de changement de formule sont volontairement désactivés.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COMMERCIAL_DEMO_BILLING_TOOLS.map(({ title, description, icon: Icon, feature }) => {
            const isActive = activeFeatureSet.has(feature);
            return (
              <Card key={title} className="rounded-3xl border-border/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{description}</p>
                  <Badge variant={isActive ? "outline" : "secondary"} className="mt-4">
                    {isActive ? "Actif en Démo" : "Désactivé par l'admin"}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="rounded-3xl border-border/70">
          <CardHeader>
            <CardTitle>Fonctionnalités activées par l'administrateur</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {activeFeatures.length ? activeFeatures.map((feature) => (
              <Badge key={feature} variant="secondary">{feature}</Badge>
            )) : <p className="text-sm text-muted-foreground">Aucune fonctionnalité activée.</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function DashboardAccountBilling() {
  const commercialDemoFrame = useCommercialDemoFrame();
  if (commercialDemoFrame?.surface === "restaurant") return <CommercialDemoAccountBilling />;
  return <LiveDashboardAccountBilling />;
}

function LiveDashboardAccountBilling() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const { selectedId } = useDashboardRestaurant();
  const [searchParams] = useSearchParams();
  const [checkingOutPlanId, setCheckingOutPlanId] = useState<string | null>(null);
  const [checkingOutCreditPackId, setCheckingOutCreditPackId] = useState<string | null>(null);
  const [selfServicePlanId, setSelfServicePlanId] = useState<string | null>(null);
  const [selfServiceAction, setSelfServiceAction] = useState<SubscriptionActionState | null>(null);
  const [pendingSubscriptionAction, setPendingSubscriptionAction] = useState<PendingSubscriptionAction | null>(null);
  const [completedCreditPackSessionId, setCompletedCreditPackSessionId] = useState<string | null>(null);
  const [reconciledPendingCreditPackRestaurantId, setReconciledPendingCreditPackRestaurantId] = useState<string | null>(null);
  const checkoutLockRef = useRef(false);
  const cancelledAttemptRef = useRef<string | null>(null);

  usePaymentAttemptBackCancellation({
    scope: selectedId ? billingAttemptScope(selectedId) : null,
    onCancelled: () => {
      setCheckingOutPlanId(null);
      setCheckingOutCreditPackId(null);
      toast.success("Paiement interrompu : la session Stripe a été fermée.");
    },
    onError: () => {
      setCheckingOutPlanId(null);
      setCheckingOutCreditPackId(null);
      toast.error("Paiement en cours de vérification : reprenez la même tentative.");
    },
  });

  const paymentStatus = searchParams.get("status");
  const checkoutSessionId = searchParams.get("session_id");
  const returnCheckoutKind = searchParams.get("checkout_kind");
  const returnPaymentAttemptId = normalizePaymentAttemptId(searchParams.get("payment_attempt_id"));

  const usageQuery = useQuery({
    queryKey: ["restaurant-credit-usage", selectedId],
    enabled: !!selectedId,
    refetchInterval: 60_000,
    queryFn: () => fetchRestaurantCreditUsage(selectedId as string),
  });

  const selfServiceQuery = useQuery({
    queryKey: ["restaurant-subscription-self-service", selectedId],
    enabled: !!selectedId,
    retry: false,
    queryFn: () => fetchRestaurantSubscriptionSelfServiceState(selectedId as string),
  });

  const plansQuery = useQuery({
    queryKey: ["restaurant-subscription-plans"],
    queryFn: fetchRestaurantSubscriptionPlans,
  });

  const creditPacksQuery = useQuery({
    queryKey: ["restaurant-credit-packs"],
    queryFn: fetchRestaurantCreditPacks,
  });

  const usage = usageQuery.data;
  const credits = usage?.credits ?? EMPTY_CREDITS;
  const entries = usage?.entries ?? EMPTY_ENTRIES;
  const tokCreditSummary = useMemo(() => buildUnifiedTokCreditSummary(credits), [credits]);
  const currentPlan = usage?.subscription?.plan_record ?? null;
  const currentPosition = toNumber(currentPlan?.position);
  const selfServiceState = selfServiceQuery.data ?? null;
  const scheduledChange = isScheduledSubscriptionChange(selfServiceState?.scheduled_plan_change)
    ? selfServiceState?.scheduled_plan_change ?? null
    : null;
  const scheduledChangeSummary = getScheduledChangeSummary(scheduledChange)
    ?? (selfServiceState?.cancel_at_period_end
      ? {
        title: "Résiliation programmée",
        description: `Votre abonnement reste actif avec tous ses avantages jusqu'au ${formatDateTime(selfServiceState.current_period_end || usage?.subscription?.current_period_end)}.`,
      }
      : null);
  const hasScheduledChange = Boolean(scheduledChangeSummary || selfServiceState?.cancel_at_period_end);
  const activePlans = plansQuery.data ?? [];
  const activeCreditPacks = creditPacksQuery.data ?? [];
  const isUsageLoading = usageQuery.isLoading;
  const isUsageUnavailable = usageQuery.isError;

  useEffect(() => {
    if (paymentStatus !== "cancelled" || !returnPaymentAttemptId || !selectedId) return;
    if (cancelledAttemptRef.current === returnPaymentAttemptId) return;
    cancelledAttemptRef.current = returnPaymentAttemptId;

    const scope = billingAttemptScope(selectedId);
    rememberPaymentAttemptId(scope, returnPaymentAttemptId);

    void invokeSupabaseFunction("cancel-payment-attempt", {
      body: { payment_attempt_id: returnPaymentAttemptId },
    }).then(({ error }) => {
      if (error) throw error;
      clearPaymentAttemptId(scope, returnPaymentAttemptId);
      toast.success("Session Stripe annulée et ressources temporaires libérées.");
    }).catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "L'annulation doit encore être vérifiée avant de relancer un paiement.",
      );
    });
  }, [paymentStatus, returnCheckoutKind, returnPaymentAttemptId, selectedId]);

  useEffect(() => {
    if (paymentStatus !== "success" || !returnPaymentAttemptId || !selectedId) return;
    if (returnCheckoutKind === "restaurant-credit-pack") return;
    clearPaymentAttemptId(billingAttemptScope(selectedId), returnPaymentAttemptId);
  }, [paymentStatus, returnCheckoutKind, returnPaymentAttemptId, selectedId]);

  useEffect(() => {
    if (isCommercialDemo) return;
    if (paymentStatus !== "success" || !checkoutSessionId) return;
    if (returnCheckoutKind && returnCheckoutKind !== "restaurant-credit-pack") return;
    if (completedCreditPackSessionId === checkoutSessionId) return;

    let cancelled = false;
    setCompletedCreditPackSessionId(checkoutSessionId);

    invokeSupabaseFunction<{ ok?: boolean; already_paid?: boolean }>("complete-restaurant-credit-pack-checkout", {
      body: { session_id: checkoutSessionId },
    })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.ok) {
          if (returnCheckoutKind === "restaurant-credit-pack") {
            toast.error((error as Error | null)?.message || "La recharge est payée, mais son activation doit être vérifiée.");
          }
          return;
        }

        if (returnPaymentAttemptId && selectedId) {
          clearPaymentAttemptId(billingAttemptScope(selectedId), returnPaymentAttemptId);
        }
        await usageQuery.refetch();
        if (returnCheckoutKind === "restaurant-credit-pack" && !data.already_paid) {
          toast.success("Recharge de crédits TOK activée.");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (returnCheckoutKind === "restaurant-credit-pack") {
          toast.error(error instanceof Error ? error.message : "Activation de la recharge impossible.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, completedCreditPackSessionId, isCommercialDemo, paymentStatus, returnCheckoutKind, returnPaymentAttemptId, selectedId, usageQuery]);

  useEffect(() => {
    if (isCommercialDemo) return;
    if (!selectedId || checkoutSessionId || reconciledPendingCreditPackRestaurantId === selectedId) return;

    let cancelled = false;
    setReconciledPendingCreditPackRestaurantId(selectedId);

    invokeSupabaseFunction<{ ok?: boolean; already_paid?: boolean; no_pending_purchase?: boolean }>(
      "complete-restaurant-credit-pack-checkout",
      {
        body: { restaurant_id: selectedId },
      },
    )
      .then(async ({ data }) => {
        if (cancelled || !data?.ok || data.no_pending_purchase) return;

        await usageQuery.refetch();
        if (!data.already_paid) {
          toast.success("Recharge de crédits TOK activée.");
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, isCommercialDemo, reconciledPendingCreditPackRestaurantId, selectedId, usageQuery]);

  const totalBalanceLabel = useMemo(() => {
    if (!tokCreditSummary) return "0 crédit TOK";
    return formatTokCredits(tokCreditSummary.balance);
  }, [tokCreditSummary]);
  const isDemoUnlimitedBalance = isDemoUnlimitedTokCreditBalance(tokCreditSummary?.balance);
  const pendingActionTitle = pendingSubscriptionAction?.type === "downgrade"
    ? `Programmer ${pendingSubscriptionAction.plan.name}`
    : pendingSubscriptionAction?.type === "resume"
      ? "Annuler le changement programmé"
      : "Résilier l'abonnement";
  const pendingActionDescription = pendingSubscriptionAction?.type === "downgrade"
    ? `Votre abonnement actuel reste actif avec ses avantages jusqu'à la fin de la période payée. Le plan ${pendingSubscriptionAction.plan.name} prendra le relais ensuite si la demande est faite au plus tard 3 jours avant le renouvellement.`
    : pendingSubscriptionAction?.type === "resume"
      ? "La résiliation ou la baisse de plan programmée sera annulée. L'abonnement continuera normalement au prochain renouvellement."
      : `Votre abonnement restera actif jusqu'au ${formatDateTime(usage?.subscription?.current_period_end)}. Les avantages déjà payés restent disponibles jusqu'à cette date. La résiliation doit être demandée au plus tard 3 jours avant le renouvellement mensuel.`;

  async function handleUpgrade(plan: RestaurantSubscriptionPlan) {
    if (!selectedId) return;
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    setCheckingOutPlanId(plan.id);

    if (isCommercialDemo) {
      toast.success(`Upgrade vers ${plan.name} simulé — aucun abonnement Stripe créé.`);
      setCheckingOutPlanId(null);
      checkoutLockRef.current = false;
      return;
    }

    try {
      const paymentAttemptId = getOrCreatePaymentAttemptId(
        billingAttemptScope(selectedId),
        createPaymentAttemptOperationKey({
          restaurantId: selectedId,
          checkoutKind: "restaurant-subscription-upgrade",
          planId: plan.id,
        }),
      );
      const checkoutPayload = {
        payment_attempt_id: paymentAttemptId,
        checkout_kind: "restaurant-subscription-upgrade",
        payment_method: "card",
        return_url: buildCheckoutReturnUrl("/dashboard/mon-compte-facturation", { paymentAttemptId }),
        order_metadata: {
          payment_attempt_id: paymentAttemptId,
          checkout_kind: "restaurant-subscription-upgrade",
          restaurant_id: selectedId,
          plan_id: plan.id,
        },
      };
      const checkout = await createCheckoutWithRecovery({
        paymentAttemptId,
        create: async () => {
          const { data, error } = await invokeSupabaseFunction("create-checkout", {
            body: checkoutPayload,
          });
          if (error) throw error;
          return data;
        },
        getStatus: async () => {
          const { data, error } = await invokeSupabaseFunction("payment-attempt-status", {
            body: { payment_attempt_id: paymentAttemptId },
          });
          if (error) throw error;
          return data;
        },
      });

      if (!checkout.url) {
        throw new Error("L'upgrade est en cours de vérification. Relancez avec le même bouton dans quelques secondes.");
      }

      markPaymentAttemptRedirected(billingAttemptScope(selectedId), paymentAttemptId);
      redirectToTrustedCheckoutUrl(checkout.url);
    } catch (error) {
      toast.error(
        isPaymentAttemptIndeterminateError(error)
          ? error.message
          : error instanceof Error ? error.message : "Erreur lors de la création de l'upgrade.",
      );
      setCheckingOutPlanId(null);
    } finally {
      checkoutLockRef.current = false;
    }
  }

  async function handleSubscriptionSelfService(action: PendingSubscriptionAction) {
    if (!selectedId) return;
    const actionType = action.type;
    setSelfServiceAction(actionType);
    setSelfServicePlanId(action.type === "downgrade" ? action.plan.id : null);

    if (isCommercialDemo) {
      toast.success(action.type === "downgrade"
        ? `Baisse vers ${action.plan.name} simulée.`
        : action.type === "resume"
          ? "Reprise de l'abonnement simulée."
          : "Résiliation en fin de période simulée.");
      setSelfServiceAction(null);
      setSelfServicePlanId(null);
      setPendingSubscriptionAction(null);
      return;
    }

    try {
      const { data, error } = await invokeSupabaseFunction<{ ok?: boolean }>("manage-restaurant-subscription", {
        body: {
          restaurant_id: selectedId,
          action: actionType,
          ...(action.type === "downgrade" ? { target_plan_id: action.plan.id } : {}),
        },
      });

      if (error || !data?.ok) {
        throw new Error((error as Error | null)?.message || "Impossible de modifier l'abonnement.");
      }

      await Promise.all([
        usageQuery.refetch(),
        selfServiceQuery.refetch(),
      ]);

      if (action.type === "cancel") {
        toast.success("Résiliation programmée en fin de période payée.");
      } else if (action.type === "resume") {
        toast.success("Changement programmé annulé. L'abonnement continue normalement.");
      } else {
        toast.success(`Baisse vers ${action.plan.name} programmée en fin de période payée.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la modification de l'abonnement.");
    } finally {
      setSelfServiceAction(null);
      setSelfServicePlanId(null);
      setPendingSubscriptionAction(null);
    }
  }

  async function handleBuyCreditPack(pack: RestaurantCreditPack) {
    if (!selectedId) return;
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    setCheckingOutCreditPackId(pack.id);

    if (isCommercialDemo) {
      toast.success(`Recharge ${pack.name} simulée — aucun paiement Stripe créé.`);
      setCheckingOutCreditPackId(null);
      checkoutLockRef.current = false;
      return;
    }

    try {
      const paymentAttemptId = getOrCreatePaymentAttemptId(
        billingAttemptScope(selectedId),
        createPaymentAttemptOperationKey({
          restaurantId: selectedId,
          checkoutKind: "restaurant-credit-pack",
          creditPackId: pack.id,
        }),
      );
      const checkoutPayload = {
        payment_attempt_id: paymentAttemptId,
        checkout_kind: "restaurant-credit-pack",
        payment_method: "card",
        return_url: buildCheckoutReturnUrl(
          "/dashboard/mon-compte-facturation?checkout_kind=restaurant-credit-pack",
          { paymentAttemptId },
        ),
        order_metadata: {
          payment_attempt_id: paymentAttemptId,
          checkout_kind: "restaurant-credit-pack",
          restaurant_id: selectedId,
          credit_pack_id: pack.id,
        },
      };
      const checkout = await createCheckoutWithRecovery({
        paymentAttemptId,
        create: async () => {
          const { data, error } = await invokeSupabaseFunction("create-checkout", {
            body: checkoutPayload,
          });
          if (error) throw error;
          return data;
        },
        getStatus: async () => {
          const { data, error } = await invokeSupabaseFunction("payment-attempt-status", {
            body: { payment_attempt_id: paymentAttemptId },
          });
          if (error) throw error;
          return data;
        },
      });

      if (!checkout.url) {
        throw new Error("La recharge est en cours de vérification. Relancez avec le même bouton dans quelques secondes.");
      }

      markPaymentAttemptRedirected(billingAttemptScope(selectedId), paymentAttemptId);
      redirectToTrustedCheckoutUrl(checkout.url);
    } catch (error) {
      toast.error(
        isPaymentAttemptIndeterminateError(error)
          ? error.message
          : error instanceof Error ? error.message : "Erreur lors de la creation du paiement du pack.",
      );
      setCheckingOutCreditPackId(null);
    } finally {
      checkoutLockRef.current = false;
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Compte restaurateur"
          title="Mon compte/Facturation"
          description="Pilotez votre abonnement TOK, upgradez votre pack mensuel et suivez votre solde unique de crédits TOK avec le détail complet des dépenses."
          icon={CreditCard}
          tone="sky"
          visualLabel="Facturation"
          stats={[
            { label: "Abonnement", value: currentPlan?.name ?? "Non configuré", icon: WalletCards },
            { label: "Solde", value: totalBalanceLabel, icon: Sparkles },
            { label: "Lignes de crédit", value: entries.length, icon: ReceiptText },
          ]}
        />

        {paymentStatus === "success" ? (
          <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-400/25 dark:bg-green-500/10 dark:text-green-50">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Paiement en cours d'activation</AlertTitle>
            <AlertDescription>
              Le paiement a été confirmé. Le nouvel abonnement sera visible dès la synchronisation Stripe.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "cancelled" ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upgrade annulé</AlertTitle>
            <AlertDescription>Votre abonnement actuel reste inchangé.</AlertDescription>
          </Alert>
        ) : null}

        {isUsageUnavailable ? (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Usage des crédits indisponible</AlertTitle>
            <AlertDescription>
              Impossible de charger le détail des crédits pour ce restaurant. L'upgrade d'abonnement reste disponible.
            </AlertDescription>
          </Alert>
        ) : null}
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertTitle>Comment fonctionnent les crédits TOK ?</AlertTitle>
              <AlertDescription>
                Les crédits TOK sont utilisables sur tous les outils de la plateforme : campagnes sponsorisées,
                assistant IA, retouches photo, création de visuels, rendus impression et optimisation marketing.
                Chaque action affiche son coût avant utilisation. Exemple : 1 crédit pour une utilisation assistant IA simple
                et 6 crédits pour une retouche photo ou une génération marketing.
              </AlertDescription>
            </Alert>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Abonnement actuel</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {usage?.period
                          ? `Période du ${formatDateTime(usage.period.start)} au ${formatDateTime(usage.period.end)}`
                          : "Période non synchronisée"}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Facturation automatique chaque mois tant que l'abonnement n'est pas résilié.
                        La résiliation ou la baisse de plan doit être demandée au plus tard 3 jours avant la fin de la période payée.
                      </p>
                    </div>
                    <Badge variant="outline">{getSubscriptionStatusLabel(usage?.subscription?.status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isUsageLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement de l'abonnement...
                    </div>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold">{currentPlan?.name ?? usage?.subscription?.plan ?? "Aucun abonnement"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentPlan?.description ?? (
                          isUsageUnavailable
                            ? "L'abonnement actuel sera affiché dès que la lecture des crédits sera disponible."
                            : "Aucun abonnement actif n'est encore synchronisé pour ce restaurant."
                        )}
                      </p>
                    </div>
                  )}
                  {currentPlan ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">Prix mensuel</p>
                        <p className="font-semibold">{formatChf(currentPlan.price_monthly_chf)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">Période</p>
                        <p className="font-semibold">{formatBillingPeriod(usage?.subscription?.billing_period)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/45 p-3">
                        <p className="text-xs text-muted-foreground">Stripe</p>
                        <p className="truncate font-semibold">{usage?.subscription?.stripe_subscription_id ?? "En attente"}</p>
                      </div>
                    </div>
                  ) : null}
                  {scheduledChangeSummary ? (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-50">
                      <CalendarClock className="h-4 w-4" />
                      <AlertTitle>{scheduledChangeSummary.title}</AlertTitle>
                      <AlertDescription>{scheduledChangeSummary.description}</AlertDescription>
                    </Alert>
                  ) : null}
                  {currentPlan ? (
                    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
                      {hasScheduledChange ? (
                        <Button
                          variant="outline"
                          onClick={() => setPendingSubscriptionAction({ type: "resume" })}
                          disabled={selfServiceAction === "resume"}
                        >
                          {selfServiceAction === "resume" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                          Annuler le changement programmé
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingSubscriptionAction({ type: "cancel" })}
                          disabled={selfServiceAction === "cancel"}
                        >
                          {selfServiceAction === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                          Résilier en fin de période
                        </Button>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Solde</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isUsageLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement des soldes...
                    </div>
                  ) : isUsageUnavailable ? (
                    <p className="text-sm text-muted-foreground">Le solde sera disponible après synchronisation de la fonction de facturation.</p>
                  ) : !tokCreditSummary ? (
                    <p className="text-sm text-muted-foreground">Aucun crédit actif pour la période courante.</p>
                  ) : (
                      <div className="space-y-3 rounded-xl border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Crédits TOK</p>
                            <p className="text-xs text-muted-foreground">Solde disponible</p>
                          </div>
                          <p className="text-right text-sm font-bold">{formatTokCredits(tokCreditSummary.balance)}</p>
                        </div>
                        {isDemoUnlimitedBalance ? (
                          <div className="grid gap-1 text-xs text-muted-foreground">
                            <span>Présentation illimitée de PhotoPro, Studio Marketing et Assistant IA.</span>
                            <span>Les coûts restent tracés dans les journaux IA.</span>
                          </div>
                        ) : (
                          <div className="grid gap-1 text-xs text-muted-foreground">
                            <span>{getCampaignEquivalentChf(tokCreditSummary.balance).toLocaleString("fr-CH")} CHF de campagnes TOK</span>
                            <span>ou {getAiSimpleRequestEquivalent(tokCreditSummary.balance).toLocaleString("fr-CH")} requêtes assistant IA</span>
                            <span>ou {getPhotoSimpleEquivalent(tokCreditSummary.balance).toLocaleString("fr-CH")} retouches photo simples</span>
                          </div>
                        )}
                      </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {isUsageLoading ? (
                <Card className="md:col-span-3">
                  <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement de l'usage des crédits...
                  </CardContent>
                </Card>
              ) : isUsageUnavailable ? (
                <Card className="md:col-span-3">
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    Le détail des crédits est temporairement indisponible, mais les packs d'abonnement restent accessibles ci-dessous.
                  </CardContent>
                </Card>
              ) : !tokCreditSummary ? (
                <Card className="md:col-span-3">
                  <CardContent className="py-8 text-sm text-muted-foreground">Aucun crédit inclus n'est encore synchronisé.</CardContent>
                </Card>
              ) : (
                <CreditSummaryCard credit={tokCreditSummary} />
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Recharger des crédits TOK</h2>
                <p className="text-sm text-muted-foreground">
                  Ajoutez des crédits universels lorsque le solde inclus dans l'abonnement est insuffisant.
                </p>
              </div>
              {creditPacksQuery.isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : creditPacksQuery.isError ? (
                <Card>
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    Les packs de crédits TOK sont temporairement indisponibles.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {activeCreditPacks.map((pack) => (
                    <CreditPackCard
                      key={pack.id}
                      pack={pack}
                      checkingOutPackId={checkingOutCreditPackId}
                      onBuy={handleBuyCreditPack}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Changer d'abonnement</h2>
                <p className="text-sm text-muted-foreground">
                  Les upgrades passent par Stripe Checkout. Les plans inférieurs sont programmés à la fin de la période payée pour conserver les avantages déjà réglés, avec un préavis minimum de 3 jours avant le renouvellement.
                </p>
              </div>
              {plansQuery.isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {activePlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      currentPosition={currentPosition}
                      currentPlanId={currentPlan?.id ?? null}
                      checkingOutPlanId={checkingOutPlanId}
                      selfServicePlanId={selfServicePlanId}
                      hasScheduledChange={hasScheduledChange}
                      onUpgrade={handleUpgrade}
                      onDowngrade={(plan) => setPendingSubscriptionAction({ type: "downgrade", plan })}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Détail des dépenses de crédits</h2>
                <p className="text-sm text-muted-foreground">
                  Toutes les consommations de la période courante, triées de la plus récente à la plus ancienne.
                </p>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Outil</TableHead>
                          <TableHead>Détail</TableHead>
                          <TableHead className="text-right">Dépense</TableHead>
                          <TableHead className="text-right">Coût estimé</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isUsageLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                              Chargement des dépenses de crédits...
                            </TableCell>
                          </TableRow>
                        ) : isUsageUnavailable ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                              Détail indisponible jusqu'à la synchronisation de la facturation.
                            </TableCell>
                          </TableRow>
                        ) : entries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                              Aucune dépense de crédits sur cette période.
                            </TableCell>
                          </TableRow>
                        ) : entries.map((entry) => (
                          <TableRow key={`${entry.source_table}-${entry.source_id}`}>
                            <TableCell data-label="Date" className="text-sm md:whitespace-nowrap">{formatDateTime(entry.occurred_at)}</TableCell>
                            <TableCell data-label="Outil">
                              <CreditKindBadge kind={entry.credit_kind} />
                            </TableCell>
                            <TableCell data-label="Détail">
                              <div className="max-w-md">
                                <p className="font-medium">{entry.label}</p>
                                {entry.description ? (
                                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell data-label="Dépense" className="font-medium md:whitespace-nowrap md:text-right">
                              {formatEntryTokCreditAmount(entry)}
                            </TableCell>
                            <TableCell data-label="Coût estimé" className="text-muted-foreground md:whitespace-nowrap md:text-right">
                              {formatChf(entry.estimated_cost_chf)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </section>
      </div>
      <AlertDialog open={!!pendingSubscriptionAction} onOpenChange={(open) => {
        if (!open && !selfServiceAction) {
          setPendingSubscriptionAction(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingActionTitle}</AlertDialogTitle>
            <AlertDialogDescription>{pendingActionDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!selfServiceAction}>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingSubscriptionAction) {
                  void handleSubscriptionSelfService(pendingSubscriptionAction);
                }
              }}
              disabled={!!selfServiceAction}
              className={cn(
                pendingSubscriptionAction?.type === "cancel"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined,
              )}
            >
              {selfServiceAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}


