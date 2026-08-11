import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Browser } from "@capacitor/browser";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChevronRight,
  Crown,
  Gift,
  Headphones,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Utensils,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import {
  isTokOneSubscriptionActive,
  type TokOneBenefit,
  type TokOnePlan,
  type TokOneSubscription,
  useTokOneBenefits,
  useTokOnePlans,
  useTokOneSubscription,
} from "@/hooks/useTokOne";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { buildTokOneEntitlements } from "@/lib/subscriptionEntitlements";
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
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getPlatform } from "@/lib/platform";
import { restoreTokOneIosPurchases } from "@/lib/iosCommerceFetch";

const supabase = getSupabase();

const HERO_IMAGE = "/images/octopus-fine-dining.jpeg";
const TOK_ONE_PAYMENT_ATTEMPT_SCOPE = "tok-one-subscription";

const COMMERCIAL_DEMO_TOK_ONE_PLAN: TokOnePlan = {
  id: "commercial-demo-tok-one",
  name: "Tok One Premium",
  description: "La formule premium présentée pendant la démonstration commerciale.",
  price_monthly: 9.9,
  price_yearly: 89.9,
  currency: "CHF",
  free_delivery_min_order: null,
  status: "active",
  stripe_product_id: null,
};
const COMMERCIAL_DEMO_TOK_ONE_PLANS = [COMMERCIAL_DEMO_TOK_ONE_PLAN];
const EMPTY_TOK_ONE_PLANS: TokOnePlan[] = [];
const EMPTY_TOK_ONE_BENEFITS: TokOneBenefit[] = [];

const COMMERCIAL_DEMO_TOK_ONE_BENEFITS: TokOneBenefit[] = [
  { id: "demo-discount", plan_id: COMMERCIAL_DEMO_TOK_ONE_PLAN.id, benefit_type: "discount_percentage", value: { percentage: 10 } },
  { id: "demo-priority", plan_id: COMMERCIAL_DEMO_TOK_ONE_PLAN.id, benefit_type: "chef_table_priority", value: {} },
  { id: "demo-support", plan_id: COMMERCIAL_DEMO_TOK_ONE_PLAN.id, benefit_type: "priority_support", value: {} },
];

function commercialDemoTokOneStorageKey(sessionId: string) {
  return `commercial-demo-tok-one:${sessionId}`;
}

function readCommercialDemoTokOneSubscription(sessionId?: string): TokOneSubscription | null {
  if (!sessionId || typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(commercialDemoTokOneStorageKey(sessionId)) || "null");
    return value && typeof value === "object" ? value as TokOneSubscription : null;
  } catch {
    return null;
  }
}

function createCommercialDemoTokOneSubscription(sessionId: string): TokOneSubscription {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
  return {
    id: `commercial-demo-tok-one:${sessionId}`,
    user_id: "commercial-demo-client",
    plan_id: COMMERCIAL_DEMO_TOK_ONE_PLAN.id,
    status: "active",
    current_period_start: currentPeriodStart.toISOString(),
    current_period_end: currentPeriodEnd.toISOString(),
    cancel_at_period_end: false,
    stripe_subscription_id: null,
    stripe_checkout_session_id: null,
    stripe_mode: "test",
    billing_period: "monthly",
    user_subscription_plans: COMMERCIAL_DEMO_TOK_ONE_PLAN,
  };
}

function persistCommercialDemoTokOneSubscription(sessionId: string, subscription: TokOneSubscription) {
  try {
    window.sessionStorage.setItem(commercialDemoTokOneStorageKey(sessionId), JSON.stringify(subscription));
  } catch {
    // Some embedded/privacy contexts disable sessionStorage. Component state still keeps the demo usable.
  }
}

type BenefitCard = {
  id: string;
  title: string;
  description: string;
  details: string[];
  icon: LucideIcon;
  tone: string;
};

type BenefitPresentation = Omit<BenefitCard, "id">;

const CORE_BENEFITS: BenefitCard[] = [
  {
    id: "member_exclusives",
    title: "Avantages réservés",
    description:
      "Profitez d'avantages Tok One sur les parcours et offres partenaires éligibles.",
    details: [
      "Les avantages disponibles sont affichés avant l'action concernée.",
      "Les conditions peuvent varier selon le restaurant et l'opération active.",
      "TOK vérifie l'éligibilité au moment de la commande ou de la réservation.",
    ],
    icon: Star,
    tone: "orange",
  },
  {
    id: "priority_access",
    title: "Accès prioritaire",
    description:
      "Les tables VIP, créneaux rares et drops partenaires remontent plus tôt dans votre expérience.",
    details: [
      "Les tables VIP La Table du Chef sont mises en avant avant les créneaux standards.",
      "Les drops limités et créneaux Zéro Attente peuvent être proposés plus haut dans le parcours.",
      "La priorité reste dépendante des disponibilités réelles du restaurant.",
    ],
    icon: Crown,
    tone: "pink",
  },
  {
    id: "reserved_discounts",
    title: "Réductions réservées",
    description:
      "Des avantages privés s'appliquent sur des restaurants, ventes flash et opérations locales.",
    details: [
      "Les remises configurées par TOK ou le partenaire sont appliquées sans code promo.",
      "Les avantages peuvent varier selon le restaurant, le canal et la campagne active.",
      "Le taux maximum affiché est recalculé depuis la formule sélectionnée.",
    ],
    icon: Gift,
    tone: "emerald",
  },
  {
    id: "priority_support",
    title: "Support prioritaire",
    description:
      "Vos demandes liées aux commandes, réservations et remboursements passent en file prioritaire.",
    details: [
      "Les dossiers liés aux commandes, réservations et paiements sont triés avec priorité Tok One.",
      "Le support conserve l'historique de la demande pour éviter les relances inutiles.",
      "Les remboursements restent soumis aux règles du paiement et du restaurant concerné.",
    ],
    icon: Headphones,
    tone: "sky",
  },
];

const ENTITLEMENT_BENEFITS: Record<string, BenefitPresentation> = {
  discount_percentage: CORE_BENEFITS[2],
  chef_table_priority: {
    title: "Priorité La Table du Chef",
    description:
      "Accédez plus tôt aux expériences gastronomiques et tables rares proposées par les partenaires TOK.",
    details: [
      "Les expériences VIP compatibles avec votre niveau remontent plus haut dans les sélections.",
      "Les disponibilités limitées restent bloquées par la capacité réelle du restaurant.",
      "Les droits Tok One sont relus au moment de la réservation.",
    ],
    icon: Utensils,
    tone: "pink",
  },
  flash_early_access: {
    title: "Ventes flash en avance",
    description:
      "Recevez les meilleures offres limitées avant leur diffusion générale dans l'application.",
    details: [
      "Les ventes flash éligibles peuvent être proposées en priorité dans le feed et les listes.",
      "Les quantités restent limitées et diminuent à chaque commande confirmée.",
      "Les avantages de prix sont recalculés côté serveur avant paiement.",
    ],
    icon: Sparkles,
    tone: "orange",
  },
  priority_support: CORE_BENEFITS[3],
  surprise_offers: {
    title: "Attentions partenaires",
    description:
      "Profitez d'invitations, attentions et avantages ponctuels selon les campagnes actives.",
    details: [
      "Les attentions dépendent des restaurants et opérations locales ouvertes au moment de la visite.",
      "TOK peut cibler les offres selon votre usage et votre niveau Tok One.",
      "Les conditions sont affichées avant confirmation quand une action est requise.",
    ],
    icon: Gift,
    tone: "emerald",
  },
};

const TRUST_PILLS = [
  "Sans engagement",
  "Résiliation J-3",
  "Paiement sécurisé",
  "Avantages Genève",
];

const HOW_IT_WORKS = [
  {
    title: "Choisissez votre formule",
    description:
      "Votre formule Tok One est facturée automatiquement chaque mois tant qu'elle n'est pas résiliée.",
    icon: WalletCards,
  },
  {
    title: "Activez vos avantages",
    description:
      "Les réductions, priorités et statuts VIP sont appliqués automatiquement sur les parcours éligibles.",
    icon: BadgeCheck,
  },
  {
    title: "Profitez chez les partenaires",
    description:
      "Commandes, réservations, La Table du Chef et ventes flash utilisent votre niveau Tok One.",
    icon: Utensils,
  },
];

const FAQS = [
  {
    question: "Puis-je résilier Tok One à tout moment ?",
    answer:
      "Oui. L'abonnement reste actif jusqu'à la fin de la période payée, puis il ne se renouvelle plus.",
  },
  {
    question: "Les avantages sont-ils disponibles partout ?",
    answer:
      "Les avantages dépendent des restaurants partenaires et des opérations actives.",
  },
  {
    question: "Comment les économies sont-elles calculées ?",
    answer:
      "TOK compare les frais et remises éligibles appliqués pendant vos commandes, réservations et expériences.",
  },
];

const TOK_ONE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Tok One",
  provider: {
    "@type": "Organization",
    name: "TOK",
    url: "https://www.thetok.ch",
  },
  description:
    "Abonnement premium TOK pour profiter d’avantages VIP, réductions partenaires, accès prioritaires et support prioritaire en Suisse romande.",
  serviceType: "Abonnement de fidélité et avantages food",
  url: "https://www.thetok.ch/tok-one",
  areaServed: "Suisse romande",
};

const formatDate = (value?: string | null) => {
  if (!value) return "Fin de période non disponible";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
};

const currency = (amount: number) =>
  new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

const getBenefitIcon = (benefit: TokOneBenefit): LucideIcon => {
  if (benefit.benefit_type.includes("discount")) return Gift;
  if (benefit.benefit_type.includes("priority")) return Crown;
  if (benefit.benefit_type.includes("support")) return Headphones;
  return Sparkles;
};

const benefitToneClasses: Record<
  string,
  { icon: string; panel: string; ring: string }
> = {
  orange: {
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
    panel:
      "border-orange-200/80 bg-orange-50/70 dark:border-orange-500/30 dark:bg-orange-500/10",
    ring: "ring-orange-200/70 dark:ring-orange-400/20",
  },
  pink: {
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    panel:
      "border-rose-200/80 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10",
    ring: "ring-rose-200/70 dark:ring-rose-400/20",
  },
  emerald: {
    icon:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    panel:
      "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    ring: "ring-emerald-200/70 dark:ring-emerald-400/20",
  },
  sky: {
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    panel:
      "border-sky-200/80 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10",
    ring: "ring-sky-200/70 dark:ring-sky-400/20",
  },
};

function SectionHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-serif text-3xl font-semibold tracking-normal text-foreground md:text-4xl dark:text-white">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-base leading-7 text-muted-foreground dark:text-white/70">
          {children}
        </p>
      ) : null}
    </div>
  );
}

function StatTile({
  value,
  label,
  detail,
}: {
  value: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-3xl font-semibold tracking-normal text-foreground dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground dark:text-white">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground dark:text-white/60">
        {detail}
      </p>
    </div>
  );
}

function BenefitTile({
  benefit,
  isExpanded,
  onToggle,
}: {
  benefit: BenefitCard;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = benefit.icon;
  const tone = benefitToneClasses[benefit.tone] ?? benefitToneClasses.orange;
  const detailsId = `tok-one-benefit-${benefit.id}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      aria-controls={detailsId}
      className={`group flex h-full min-h-[220px] w-full flex-col rounded-lg border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 ${tone.panel} ${tone.ring}`}
    >
      <span
        className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg ${tone.icon}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold text-foreground dark:text-white">
        {benefit.title}
      </span>
      <span
        className={`mt-3 text-sm leading-6 text-muted-foreground transition dark:text-white/70 ${
          isExpanded ? "" : "line-clamp-3"
        }`}
      >
        {benefit.description}
      </span>
      <span
        id={detailsId}
        aria-hidden={!isExpanded}
        className={`grid transition-all duration-300 ${
          isExpanded ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <span className="overflow-hidden">
          <span className="block rounded-lg border border-white/70 bg-white/70 p-3 text-sm leading-6 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
            {benefit.details.map((detail) => (
              <span key={detail} className="flex gap-2 py-1">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
                  aria-hidden="true"
                />
                <span>{detail}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
      <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-orange-700 dark:text-orange-200">
        {isExpanded ? "Réduire" : "Voir le détail"}
        <ChevronRight
          className={`h-4 w-4 transition ${isExpanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function PlanButton({
  plan,
  selected,
  onSelect,
}: {
  plan: TokOnePlan;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
        selected
          ? "border-orange-500 bg-orange-50 shadow-sm dark:border-orange-300 dark:bg-orange-500/20"
          : "border-border bg-background hover:border-orange-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-orange-300/60"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-base font-semibold text-foreground dark:text-white">
            {plan.name}
          </span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground dark:text-white/60">
            {plan.description || "Formule Tok One"}
          </span>
        </span>
        {selected ? (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white dark:bg-orange-400 dark:text-slate-950">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function StepCard({
  item,
  index,
}: {
  item: (typeof HOW_IT_WORKS)[number];
  index: number;
}) {
  const Icon = item.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-muted-foreground dark:text-white/50">
          0{index + 1}
        </span>
      </div>
      <h3 className="mt-6 text-lg font-semibold text-foreground dark:text-white">
        {item.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/60">
        {item.description}
      </p>
    </div>
  );
}

function FaqCard({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h3 className="text-base font-semibold text-foreground dark:text-white">
        {question}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/60">
        {answer}
      </p>
    </div>
  );
}

export default function TokOne() {
  const { user } = useAuth();
  const isNativeIos = getPlatform() === "ios";
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const commercialDemoSessionId = commercialDemoFrame?.config.sessionId;
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [expandedBenefit, setExpandedBenefit] = useState<string | null>(null);
  const checkoutLockRef = useRef(false);
  const cancellingAttemptRef = useRef<string | null>(null);
  const [demoSubscription, setDemoSubscription] = useState<TokOneSubscription | null>(() => (
    readCommercialDemoTokOneSubscription(commercialDemoSessionId)
  ));

  usePaymentAttemptBackCancellation({
    scope: TOK_ONE_PAYMENT_ATTEMPT_SCOPE,
    enabled: !isCommercialDemoClient && !isNativeIos,
    onCancelled: () => {
      setCheckoutLoading(false);
      toast({
        title: "Souscription interrompue",
        description: "La session Stripe a été fermée après votre retour. Aucun nouvel abonnement n'a été créé.",
      });
    },
    onError: () => {
      setCheckoutLoading(false);
      toast({
        title: "Souscription en cours de vérification",
        description: "Utilisez le même bouton pour reprendre cette tentative sans créer de doublon.",
        variant: "destructive",
      });
    },
  });

  const plansQuery = useTokOnePlans({ enabled: !isCommercialDemoClient });
  const subscriptionQuery = useTokOneSubscription({ enabled: !isCommercialDemoClient });
  const benefitsQuery = useTokOneBenefits(selectedPlanId ?? undefined, { enabled: !isCommercialDemoClient });
  const plans = isCommercialDemoClient ? COMMERCIAL_DEMO_TOK_ONE_PLANS : plansQuery.data || EMPTY_TOK_ONE_PLANS;
  const subscription = isCommercialDemoClient ? demoSubscription : subscriptionQuery.data;
  const benefits = isCommercialDemoClient ? COMMERCIAL_DEMO_TOK_ONE_BENEFITS : benefitsQuery.data || EMPTY_TOK_ONE_BENEFITS;
  const plansLoading = !isCommercialDemoClient && plansQuery.isLoading;
  const refetchSubscription = subscriptionQuery.refetch;

  useSeoMeta({
    title: "Tok One | Avantages VIP et offres restaurant",
    description:
      "Tok One regroupe avantages VIP, réductions partenaires, accès prioritaire aux expériences TOK et support prioritaire en Suisse romande.",
    path: "/tok-one",
    jsonLd: TOK_ONE_JSON_LD,
  });

  useEffect(() => {
    if (!plans.length || selectedPlanId) return;
    setSelectedPlanId(plans[0].id);
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (!isCommercialDemoClient || !commercialDemoSessionId) return;
    setDemoSubscription(readCommercialDemoTokOneSubscription(commercialDemoSessionId));
  }, [commercialDemoSessionId, isCommercialDemoClient]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const sessionId = params.get("session_id");
    const paymentAttemptId = normalizePaymentAttemptId(params.get("payment_attempt_id"));

    if (status === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      if (isNativeIos) {
        if (paymentAttemptId) {
          clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
        }
        setCheckoutLoading(false);
        toast({
          title: "Achat annulé",
          description: "Aucun abonnement Tok One Apple n’a été créé.",
        });
        return;
      }
      if (!paymentAttemptId) {
        toast({ title: "Paiement annulé", variant: "destructive" });
        return;
      }
      if (cancellingAttemptRef.current === paymentAttemptId) return;
      cancellingAttemptRef.current = paymentAttemptId;
      rememberPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
      setCheckoutLoading(true);
      void supabase.functions.invoke("cancel-payment-attempt", {
        body: { payment_attempt_id: paymentAttemptId },
      }).then(({ error }) => {
        if (error) throw error;
        clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
        toast({
          title: "Paiement annulé",
          description: "La session Stripe Tok One a été fermée sans nouvel abonnement.",
        });
      }).catch((error) => {
        toast({
          title: "Annulation en cours de vérification",
          description: error instanceof Error ? error.message : "Vérification de la session Stripe nécessaire.",
          variant: "destructive",
        });
      }).finally(() => {
        setCheckoutLoading(false);
      });
      return;
    }

    if (status !== "success" || !user) return;

    if (isCommercialDemoClient && commercialDemoFrame) {
      const nextSubscription = createCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId);
      persistCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId, nextSubscription);
      setDemoSubscription(nextSubscription);
      toast({
        title: "Bienvenue dans Tok One !",
        description: "Activation simulée localement pour cette démonstration.",
      });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    let isMounted = true;

    const syncCheckout = async () => {
      try {
        if (sessionId) {
          const { error } = await supabase.functions.invoke(
            "manage-tok-one-subscription",
            {
              body: {
                action: "sync_checkout_session",
                session_id: sessionId,
              },
            },
          );

          if (error) throw error;
        }

        if (!isMounted) return;

        if (paymentAttemptId) {
          clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
        }
        toast({
          title: "Bienvenue dans Tok One !",
          description: "Votre abonnement est actif. Vous pouvez tester vos avantages.",
        });
        window.history.replaceState({}, "", window.location.pathname);
        queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
        await refetchSubscription();
      } catch (error) {
        if (!isMounted) return;
        toast({
          title: "Activation Tok One",
          description:
            error instanceof Error
              ? error.message
              : "La synchronisation Tok One est en attente.",
          variant: "destructive",
        });
      }
    };

    void syncCheckout();

    return () => {
      isMounted = false;
    };
  }, [commercialDemoFrame, isCommercialDemoClient, queryClient, refetchSubscription, toast, user]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];
  const activeSubscription = isTokOneSubscriptionActive(subscription);

  const handleRestoreIosPurchases = async () => {
    if (!isNativeIos || !user?.id || restoreLoading) return;
    const planId = subscription?.plan_id || selectedPlan?.id;
    if (!planId) {
      toast({
        title: "Restauration impossible",
        description: "La formule Tok One n'est pas encore disponible.",
        variant: "destructive",
      });
      return;
    }

    setRestoreLoading(true);
    try {
      const result = await restoreTokOneIosPurchases({
        userId: user.id,
        sync: async (signedTransaction) => {
          const { error } = await supabase.functions.invoke("sync-apple-storekit", {
            body: {
              signed_transaction: signedTransaction,
              plan_id: planId,
              source: "ios_storekit_restore",
            },
          });
          if (error) throw error;
        },
      });

      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
      await refetchSubscription();
      toast({
        title: result.restored > 0 ? "Achats restaurés" : "Aucun achat à restaurer",
        description: result.restored > 0
          ? "Votre abonnement Tok One Apple a été resynchronisé."
          : "Aucun abonnement Tok One actif n'a été trouvé sur ce compte Apple.",
      });
    } catch (error) {
      toast({
        title: "Restauration impossible",
        description: error instanceof Error ? error.message : "Impossible de restaurer les achats Apple.",
        variant: "destructive",
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const entitlements = buildTokOneEntitlements({
    plan: selectedPlan ?? null,
    benefits,
  });
  const enabledBenefits = entitlements.displayBenefits
    .filter((benefit) => benefit.enabled)
    .map<BenefitCard>((benefit, index) => {
      const presentation = ENTITLEMENT_BENEFITS[benefit.id];
      if (presentation) return { ...presentation, id: benefit.id };
      return {
        id: benefit.id,
        title: benefit.label,
        description: benefit.description || "Avantage Tok One actif.",
        details: [
          "Cet avantage est configuré dans votre formule Tok One active.",
          "TOK vérifie son éligibilité au moment de l'action concernée.",
          "Les conditions exactes peuvent dépendre du restaurant ou de l'opération.",
        ],
        icon: benefits[index] ? getBenefitIcon(benefits[index]) : Sparkles,
        tone: CORE_BENEFITS[index % CORE_BENEFITS.length].tone,
      };
    });
  const displayedBenefits =
    enabledBenefits.length > 0 ? enabledBenefits : CORE_BENEFITS;

  const selectedPrice = selectedPlan?.price_monthly;
  const selectedPriceLabel =
    selectedPrice !== undefined && selectedPrice > 0
      ? `${currency(selectedPrice)} / mois`
      : "Prix indisponible";

  const handleSubscribe = async () => {
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;

    if (!selectedPlan) {
      toast({
        title: "Formule indisponible",
        description: "Sélectionnez une formule Tok One configurée.",
        variant: "destructive",
      });
      checkoutLockRef.current = false;
      return;
    }

    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour souscrire à Tok One.",
        variant: "destructive",
      });
      navigate("/auth");
      checkoutLockRef.current = false;
      return;
    }

    setCheckoutLoading(true);
    if (isCommercialDemoClient && commercialDemoFrame) {
      const nextSubscription = createCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId);
      persistCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId, nextSubscription);
      setDemoSubscription(nextSubscription);
      setCheckoutLoading(false);
      toast({
        title: "Tok One activé",
        description: "L'abonnement test est simulé localement, sans débit ni modification d'un compte réel.",
      });
      checkoutLockRef.current = false;
      return;
    }
    try {
      const paymentAttemptId = getOrCreatePaymentAttemptId(
        TOK_ONE_PAYMENT_ATTEMPT_SCOPE,
        createPaymentAttemptOperationKey({
          userId: user.id,
          checkoutKind: "tok-one",
          planId: selectedPlan.id,
          billingPeriod: "monthly",
        }),
      );
      const checkoutPayload = {
        payment_attempt_id: paymentAttemptId,
        items: [],
        payment_method: "card",
        return_url: buildCheckoutReturnUrl("/tok-one", { paymentAttemptId }),
        checkout_kind: "tok-one",
        order_metadata: {
          payment_attempt_id: paymentAttemptId,
          plan_id: selectedPlan.id,
          billing_period: "monthly",
        },
      };
      const checkout = await createCheckoutWithRecovery({
        paymentAttemptId,
        create: async () => {
          const { data, error } = await supabase.functions.invoke(
        "create-checkout",
            {
              body: checkoutPayload,
            },
          );
          if (error) throw error;
          return data;
        },
        getStatus: async () => {
          const { data, error } = await supabase.functions.invoke("payment-attempt-status", {
            body: { payment_attempt_id: paymentAttemptId },
          });
          if (error) throw error;
          return data;
        },
      });

      if (isNativeIos && checkout.state === "cancelled") {
        clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
        toast({
          title: "Achat annulé",
          description: "Aucun abonnement Tok One Apple n’a été créé.",
        });
        return;
      }

      if (isNativeIos && checkout.state === "succeeded") {
        clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
        queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
        await refetchSubscription();
        toast({
          title: "Bienvenue dans Tok One !",
          description: "Votre abonnement Apple est actif.",
        });
        return;
      }

      if (!checkout.url) {
        throw new Error("L'abonnement est en cours de vérification. Relancez avec le même bouton dans quelques secondes.");
      }
      markPaymentAttemptRedirected(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId);
      redirectToTrustedCheckoutUrl(checkout.url);
    } catch (error) {
      toast({
        title: isPaymentAttemptIndeterminateError(error)
          ? "Abonnement en cours de vérification"
          : "Paiement impossible",
        description:
          error instanceof Error
            ? error.message
            : "Veuillez réessayer dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(false);
      checkoutLockRef.current = false;
    }
  };

  const cancelSubscription = async () => {
    if (!subscription) return;
    const isAppleManagedSubscription =
      isNativeIos && subscription.billing_provider === "apple";
    const confirmed = window.confirm(
      isAppleManagedSubscription
        ? "Ouvrir la gestion de vos abonnements Apple pour modifier ou résilier Tok One ?"
        : "Résilier Tok One à la fin de la période en cours ? La demande doit être faite au plus tard 3 jours avant le renouvellement mensuel.",
    );
    if (!confirmed) return;

    setCancelLoading(true);
    if (isAppleManagedSubscription) {
      try {
        await Browser.open({ url: "https://apps.apple.com/account/subscriptions" });
        toast({
          title: "Gestion Apple ouverte",
          description: "La résiliation et le renouvellement de cet abonnement sont gérés par Apple.",
        });
      } catch (error) {
        toast({
          title: "Gestion Apple indisponible",
          description: error instanceof Error ? error.message : "Impossible d’ouvrir les abonnements Apple.",
          variant: "destructive",
        });
      } finally {
        setCancelLoading(false);
      }
      return;
    }
    if (isCommercialDemoClient && commercialDemoFrame) {
      const nextSubscription = { ...subscription, cancel_at_period_end: true } as TokOneSubscription;
      persistCommercialDemoTokOneSubscription(commercialDemoFrame.config.sessionId, nextSubscription);
      setDemoSubscription(nextSubscription);
      setCancelLoading(false);
      toast({
        title: "Résiliation simulée",
        description: "Tok One reste actif jusqu'à la fin de la période de démonstration.",
      });
      return;
    }
    try {
      const { error } = await supabase.functions.invoke(
        "manage-tok-one-subscription",
        {
          body: {
            action: "cancel",
          },
        },
      );

      if (error) throw error;
      toast({
        title: "Résiliation programmée",
        description: "Tok One restera actif jusqu'à la fin de la période.",
      });
      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
      await refetchSubscription();
    } catch (error) {
      toast({
        title: "Résiliation impossible",
        description:
          error instanceof Error
            ? error.message
            : "Veuillez réessayer depuis votre profil d'abonnement.",
        variant: "destructive",
      });
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-slate-950 dark:text-white">
      <section className="relative isolate overflow-hidden border-b border-border bg-[linear-gradient(180deg,rgba(255,247,237,0.8),rgba(255,255,255,0.96)_48%,rgba(255,255,255,1))] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,1),rgba(2,6,23,1))]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-3xl"
          >
            <p className="mb-5 inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white/80 px-3 py-2 text-sm font-semibold text-orange-700 shadow-sm dark:border-orange-400/25 dark:bg-white/10 dark:text-orange-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Le statut premium des habitués TOK
            </p>
            <h1 className="font-serif text-5xl font-semibold leading-[0.96] tracking-normal text-slate-950 sm:text-6xl lg:text-7xl dark:text-white">
              Tok One
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700 dark:text-white/70">
              Avantages réservés, accès VIP aux expériences, réductions
              partenaires et support prioritaire. Une formule claire pour les
              clients qui commandent, réservent et découvrent les meilleures
              tables de Genève.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {activeSubscription ? (
                <Button
                  size="lg"
                  asChild
                  className="h-12 rounded-lg bg-orange-600 px-6 text-base font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700 dark:bg-orange-400 dark:text-slate-950 dark:hover:bg-orange-300"
                >
                  <Link to="/profil?tab=abonnement">
                    Gérer mon abonnement
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleSubscribe}
                  disabled={checkoutLoading || plansLoading || !selectedPlan}
                  className="h-12 rounded-lg bg-orange-600 px-6 text-base font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700 dark:bg-orange-400 dark:text-slate-950 dark:hover:bg-orange-300"
                >
                  {checkoutLoading ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  Activer Tok One
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              )}
              <a
                href="#avantages"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-white px-6 text-base font-semibold text-foreground shadow-sm transition hover:border-orange-300 hover:text-orange-700 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-orange-300/60 dark:hover:text-orange-200"
              >
                Voir les avantages
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {TRUST_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/75 px-3 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                >
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  {pill}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-slate-950/10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/30">
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={HERO_IMAGE}
                  alt="Expérience restaurant premium Tok One"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-5 text-white">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-200">
                    Carte membre
                  </p>
                  <p className="mt-2 text-2xl font-semibold">Tok One</p>
                </div>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/50">
                    Formule
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground dark:text-white">
                    {selectedPlan?.name ?? "Chargement"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/50">
                    Prix
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground dark:text-white">
                    {selectedPriceLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-white/50">
                    Statut
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Premium
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-border bg-muted/35 py-10 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <StatTile
            value="VIP"
            label="Avantages membres"
            detail="Les avantages actifs sont appliqués automatiquement sur les parcours éligibles."
          />
          <StatTile
            value={`${entitlements.discountPercent}%`}
            label="Remise maximum affichée"
            detail="Le taux dépend de votre formule et des restaurants partenaires actifs."
          />
          <StatTile
            value="VIP"
            label="Expériences prioritaires"
            detail="Tables rares, créneaux premium et drops sélectionnés sont mis en avant."
          />
        </div>
      </section>

      <section id="avantages" className="py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Avantages"
            title="Une seule formule pour mieux profiter de TOK"
          >
            Tok One regroupe les leviers qui comptent vraiment pour un client
            régulier : moins de frais, plus de priorité et des offres locales
            mieux ciblées.
          </SectionHeader>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {displayedBenefits.map((benefit) => (
              <BenefitTile
                key={benefit.id}
                benefit={benefit}
                isExpanded={expandedBenefit === benefit.id}
                onToggle={() =>
                  setExpandedBenefit((current) =>
                    current === benefit.id ? null : benefit.id,
                  )
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/35 py-16 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div>
            <SectionHeader
              eyebrow="Souscription"
              title="Choisissez votre formule mensuelle"
            >
              Tok One est facturé automatiquement chaque mois. Vous pouvez
              résilier jusqu'à 3 jours avant la fin de la période payée.
            </SectionHeader>
            <div className="grid gap-4">
              {plansLoading ? (
                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                  Chargement des formules Tok One...
                </div>
              ) : plans.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                  Aucune formule Tok One n'est configurée pour le moment.
                </div>
              ) : (
                plans.map((plan) => (
                  <PlanButton
                    key={plan.id}
                    plan={plan}
                    selected={selectedPlanId === plan.id}
                    onSelect={() => setSelectedPlanId(plan.id)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-xl shadow-slate-950/10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/25">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-300">
                  Paiement
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-foreground dark:text-white">
                  {selectedPlan?.name ?? "Tok One"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground dark:text-white/60">
                  {selectedPlan?.description ??
                    "Une formule premium pour profiter de TOK plus souvent."}
                </p>
              </div>
              <span className="rounded-lg bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">
                Renouvellement mensuel automatique
              </span>
            </div>

            <div className="mt-8 rounded-lg border border-border bg-background p-5 dark:border-white/10 dark:bg-slate-950/70">
              <p className="text-sm font-medium text-muted-foreground dark:text-white/60">
                Votre tarif
              </p>
              <p className="mt-2 text-4xl font-semibold tracking-normal text-foreground dark:text-white">
                {selectedPriceLabel}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/60">
                Le paiement est traité par Stripe. Le montant est débité
                automatiquement chaque mois tant que l'abonnement n'est pas
                résilié.
              </p>
            </div>

            <div className="mt-6 grid gap-3 text-sm text-muted-foreground dark:text-white/60">
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                Résiliation possible jusqu'à 3 jours avant le renouvellement.
              </p>
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                Gestion de l'abonnement depuis votre profil sécurisé.
              </p>
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                Avantages recalculés automatiquement selon votre formule.
              </p>
            </div>

            <Button
              onClick={handleSubscribe}
              disabled={
                checkoutLoading ||
                plansLoading ||
                !selectedPlan ||
                activeSubscription
              }
              className="mt-8 h-12 w-full rounded-lg bg-orange-600 text-base font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700 dark:bg-orange-400 dark:text-slate-950 dark:hover:bg-orange-300"
            >
              {checkoutLoading ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {activeSubscription ? "Abonnement déjà actif" : "Souscrire à Tok One"}
            </Button>
            {isNativeIos ? (
              <div className="space-y-3 text-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRestoreIosPurchases}
                  disabled={restoreLoading || !user}
                >
                  {restoreLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Restaurer mes achats Apple
                </Button>
                <p className="mx-auto max-w-xl text-xs leading-5 text-muted-foreground">
                  Tok One est un abonnement mensuel auto-renouvelable. Le prix
                  affiché ci-dessus est débité sur votre compte Apple. Le
                  renouvellement peut être géré depuis les réglages de votre
                  compte Apple. Consultez les <Link className="underline" to="/cgu">conditions d'utilisation</Link>
                  {" "}et la <Link className="underline" to="/politique-confidentialite">politique de confidentialité</Link>.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {activeSubscription ? (
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-400/25 dark:bg-emerald-500/10">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200">
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                    Tok One actif
                  </p>
                  <h2 className="mt-5 text-2xl font-semibold text-foreground dark:text-white">
                    Votre abonnement premium est en cours.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground dark:text-white/70">
                    Prochaine fin de période :{" "}
                    <span className="font-semibold text-foreground dark:text-white">
                      {formatDate(subscription?.current_period_end)}
                    </span>
                    . Vous pouvez ouvrir votre profil d'abonnement ou programmer
                    une résiliation en fin de période.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Button
                    asChild
                    className="rounded-lg bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-white/90"
                  >
                    <Link to="/profil?tab=abonnement">Gérer l'abonnement</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelSubscription}
                    disabled={cancelLoading || subscription?.cancel_at_period_end}
                    className="rounded-lg border-border bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    {cancelLoading ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <X className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {subscription?.cancel_at_period_end
                      ? "Résiliation programmée"
                      : "Résilier en fin de période"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Fonctionnement"
            title="Une expérience premium, sans friction"
          >
            Tok One ne demande aucun code promo. Les droits sont lus depuis
            votre compte et appliqués là où ils sont disponibles.
          </SectionHeader>
          <div className="grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((item, index) => (
              <StepCard key={item.title} item={item} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/35 py-16 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
                Questions fréquentes
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-foreground dark:text-white">
                Les points importants avant d'activer Tok One
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground dark:text-white/70">
                Les conditions précises restent visibles pendant le paiement et
                dans votre espace client après activation.
              </p>
            </div>
            <div className="grid gap-4">
              {FAQS.map((faq) => (
                <FaqCard
                  key={faq.question}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-lg border border-border bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.06]">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-orange-200">
              <Star className="h-4 w-4" aria-hidden="true" />
              Pensé pour les clients réguliers
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Activez Tok One et laissez les avantages se déclencher.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
              Commandes à emporter, réservations, ventes flash ou Table du Chef :
              votre statut premium suit votre compte.
            </p>
          </div>
          {activeSubscription ? (
            <Button
              asChild
              className="h-12 rounded-lg bg-orange-400 px-6 text-base font-semibold text-slate-950 hover:bg-orange-300"
            >
              <Link to="/profil?tab=abonnement">
                Gérer Tok One
                <CalendarCheck className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={checkoutLoading || plansLoading || !selectedPlan}
              className="h-12 rounded-lg bg-orange-400 px-6 text-base font-semibold text-slate-950 hover:bg-orange-300"
            >
              Activer Tok One
              <CalendarCheck className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}

