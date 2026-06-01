import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChefHat,
  Clock3,
  Crown,
  Flame,
  Gift,
  Headphones,
  Loader2,
  Percent,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Wallet,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  isTokOneSubscriptionActive,
  useTokOneBenefits,
  useTokOnePlans,
  useTokOneSubscription,
} from "@/hooks/useTokOne";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buildTokOneEntitlements } from "@/lib/subscriptionEntitlements";
import { cn } from "@/lib/utils";

const supabase = getSupabase();

const HERO_IMAGE = "/images/octopus-fine-dining.jpeg";

const BENEFITS = [
  {
    id: "free_delivery",
    icon: Truck,
    title: "Livraison gratuite",
    desc: "Sur tous les restaurants éligibles, sans minimum de commande.",
    detail: "Les frais de livraison express, standard ou flex sont automatiquement retirés dans le panier.",
    tone: "from-[#715bff] to-[#3137c9]",
  },
  {
    id: "discount_percentage",
    icon: Percent,
    title: "Réductions exclusives",
    desc: "Jusqu'à 20% de réduction sur une sélection de plats chaque semaine.",
    detail: "Les remises Tok One se cumulent avec les codes promo et les offres spéciales disponibles.",
    tone: "from-[#35c778] to-[#12603f]",
  },
  {
    id: "chef_table_priority",
    icon: ChefHat,
    title: "Accès prioritaire La Table du Chef",
    desc: "Réservez en avant-première les meilleures tables des chefs.",
    detail: "Les drops gastronomiques sont debloqués 24h avant l'ouverture publique.",
    tone: "from-[#ffb34f] to-[#bf4c0a]",
  },
  {
    id: "flash_early_access",
    icon: Zap,
    title: "Ventes flash en avance",
    desc: "Accès anticipé aux offres limitées avant le lancement officiel.",
    detail: "Recevez les alertes prioritaires et commandez avant que les quantités ne partent.",
    tone: "from-[#facc15] to-[#b45309]",
  },
  {
    id: "priority_support",
    icon: Headphones,
    title: "Support prioritaire",
    desc: "Un temps de réponse accelere quand vous avez besoin d'aide.",
    detail: "Les demandes Tok One passent en file prioritaire avec une prise en charge renforcee.",
    tone: "from-[#a78bfa] to-[#5b21b6]",
  },
  {
    id: "surprise_offers",
    icon: Gift,
    title: "Offres surprises",
    desc: "Des attentions régulières réservées aux membres.",
    detail: "Desserts offerts, points bonus et invitations culinaires selon vos habitudes.",
    tone: "from-[#fb7185] to-[#be123c]",
  },
];

const TRUST_PILLS = [
  { icon: ShieldCheck, label: "Paiement sécurisé Stripe" },
  { icon: Clock3, label: "Activation en moins de 2 min" },
  { icon: X, label: "Annulation à tout moment" },
];

const FAQS = [
  { q: "L'essai gratuit m'engage-t-il ?", a: "Non. Vous pouvez résilier pendant les 14 jours sans être facturé." },
  { q: "Puis-je changer de formule ?", a: "Oui, la formule mensuelle ou annuelle se gere depuis votre profil." },
  { q: "Les avantages sont-ils cumulables ?", a: "Oui. Les avantages Tok One se cumulent avec les promos disponibles." },
  { q: "Comment résilier ?", a: "Depuis Profil > Mon abonnement. Les avantages restent actifs jusqu’à la fin de la periode." },
];

const heroMotion = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

export default function TokOne() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<"monthly" | "yearly">("yearly");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [expandedBenefit, setExpandedBenefit] = useState<number | null>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      toast({ title: "Bienvenue dans Tok One !", description: "Votre abonnement ou votre essai gratuit est en cours d'activation." });
      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "cancelled") {
      toast({ title: "Paiement annule", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast, queryClient]);

  const { data: plans, isLoading: plansLoading } = useTokOnePlans();
  const { data: activeSubscription } = useTokOneSubscription();
  const isActive = isTokOneSubscriptionActive(activeSubscription);
  const availablePlans = plans || [];
  const plan = availablePlans.find((item) => item.id === selectedPlanId) || availablePlans[0];
  const { data: configuredBenefits } = useTokOneBenefits(plan?.id);
  const entitlements = buildTokOneEntitlements({ plan, benefits: configuredBenefits });
  const benefitCards = entitlements.displayBenefits
    .filter((benefit) => benefit.enabled)
    .map((benefit) => {
      const presentation = BENEFITS.find((item) => item.id === benefit.id) || BENEFITS[0];
      return {
        ...presentation,
        title: benefit.label,
        desc: benefit.description,
      };
    });
  const valueMetrics = [
    {
      icon: Gift,
      value: Number.isFinite(entitlements.freeDeliveryMinOrder) && entitlements.freeDeliveryMinOrder > 0
        ? `Des ${entitlements.freeDeliveryMinOrder} CHF`
        : "0 CHF",
      label: "minimum pour profiter de la livraison offerte",
      tone: "text-[#7897ff]",
    },
    {
      icon: Percent,
      value: `${entitlements.discountPercent}%`,
      label: "de remise sur les plats éligibles",
      tone: "text-[#37d27d]",
    },
    {
      icon: Clock3,
      value: entitlements.flags.chefTablePriority ? "VIP" : "Selon plan",
      label: "d'accès prioritaire a La Table du Chef",
      tone: "text-[#ffad42]",
    },
  ];
  const monthlyPrice = plan ? Number(plan.price_monthly) : 0;
  const yearlyPrice = plan ? Number(plan.price_yearly) : 0;
  const yearlySavings = monthlyPrice > 0 ? monthlyPrice * 12 - yearlyPrice : 0;

  const selectedPriceLabel =
    selectedPeriod === "yearly" ? `${yearlyPrice.toFixed(2)} CHF/an` : `${monthlyPrice.toFixed(2)} CHF/mois`;

  useEffect(() => {
    const nextPlans = plans || [];
    if (nextPlans.length === 0) {
      if (selectedPlanId) setSelectedPlanId(null);
      return;
    }

    if (!selectedPlanId || !nextPlans.some((item) => item.id === selectedPlanId)) {
      setSelectedPlanId(nextPlans[0].id);
    }
  }, [plans, selectedPlanId]);

  const handleSubscribe = async () => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Connectez-vous pour souscrire a Tok One.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    if (!plan) {
      toast({ title: "Erreur", description: "Aucun plan disponible.", variant: "destructive" });
      return;
    }

    setSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          items: [],
          payment_method: "card",
          return_url: `${window.location.origin}/tok-one`,
          checkout_kind: "tok-one",
          order_metadata: {
            plan_id: plan.id,
            billing_period: selectedPeriod,
          },
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de paiement manquante");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors du paiement";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    if (!activeSubscription) return;
    const { error } = await supabase.functions.invoke("manage-tok-one-subscription", {
      body: { action: "cancel" },
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Abonnement resilie", description: "Vous conservez vos avantages jusqu’à la fin de la periode en cours." });
      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#05031d] text-white">
      <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(125deg,#05031d_0%,#0a0735_44%,#250057_74%,#05031d_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:92px_92px] opacity-15" />

        <div className="container relative z-10 grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-10 px-6 py-12 lg:grid-cols-[minmax(0,0.93fr)_minmax(24rem,1fr)] lg:py-16">
          <motion.div
            className="max-w-2xl space-y-7"
            initial="hidden"
            animate="visible"
            transition={{ staggerChildren: 0.08 }}
          >
            <motion.div variants={heroMotion} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.09] px-4 py-3 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
              <Crown className="h-4 w-4 text-[#f6c453]" />
              Abonnement Premium
            </motion.div>

            <motion.div variants={heroMotion} className="space-y-5">
              <h1 className="font-display text-6xl font-black tracking-tight text-white md:text-8xl lg:text-9xl">
                Tok <span className="bg-gradient-to-b from-[#ffe38a] via-[#f6c453] to-[#d89a13] bg-clip-text text-transparent">One</span>
              </h1>
              <p className="max-w-xl text-2xl leading-[1.35] text-white/88 md:text-3xl">
                L'expérience ultime de la livraison gastronomique. Livraison gratuite, réductions exclusives et accès VIP aux événements culinaires.
              </p>
            </motion.div>

            <motion.div variants={heroMotion} className="flex flex-wrap gap-3">
              {TRUST_PILLS.map((pill) => (
                <span key={pill.label} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#100a35]/80 px-4 py-3 text-sm text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <pill.icon className={cn("h-4 w-4", pill.icon === X ? "text-white/80" : "text-[#f6c453]")} />
                  {pill.label}
                </span>
              ))}
            </motion.div>

            <motion.div variants={heroMotion} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isActive ? (
                <div className="rounded-2xl border border-[#f6c453]/45 bg-[#f6c453]/10 px-5 py-4">
                  <p className="font-bold text-[#ffe38a]">Tok One est actif</p>
                  <p className="text-sm text-white/72">
                    Jusqu'àu {activeSubscription ? new Date(activeSubscription.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""}
                  </p>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="h-16 rounded-2xl bg-gradient-to-r from-[#ffd66b] via-[#f6c453] to-[#e59f1f] px-10 text-lg font-black text-[#10091f] shadow-[0_20px_60px_rgba(246,196,83,0.28)] hover:from-[#ffe38a] hover:to-[#f6b73d]"
                  onClick={handleSubscribe}
                  disabled={subscribing || plansLoading}
                >
                  {subscribing ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : null}
                  Choisir Tok One
                  <ArrowRight className="ml-3 h-5 w-5" />
                </Button>
              )}
              <span className="text-sm text-white/58">14 jours d'essai, sans engagement.</span>
            </motion.div>
          </motion.div>

          <motion.div
            className="relative min-h-[28rem]"
            initial={{ opacity: 0, x: 36, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <div className="absolute inset-x-8 bottom-2 h-16 rounded-full bg-black/50 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/6 shadow-[0_36px_110px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.10)]">
              <img src={HERO_IMAGE} alt="Plat gastronomique Tok One" className="h-[32rem] w-full object-cover brightness-[0.72] contrast-110 saturate-125" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#05031d]/80 via-transparent to-transparent" />
              <motion.div
                className="absolute left-6 right-6 top-10 w-auto rounded-[1.5rem] border border-white/12 bg-[#150c3d]/88 p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:left-1/2 sm:right-auto sm:top-16 sm:w-[17rem] sm:-translate-x-1/2"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f6c453] text-[#160d2c]">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <p className="text-3xl font-black">+2 000</p>
                <p className="text-sm text-white/78">membres déjà conquis</p>
                <div className="mt-4 flex justify-center -space-x-2">
                  {["A", "M", "L", "S", "R", "J"].map((initial, index) => (
                    <span key={initial} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#150c3d] bg-gradient-to-br from-[#ffcf72] to-[#7c2d12] text-xs font-bold" style={{ zIndex: 10 - index }}>
                      {initial}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-center gap-1 text-[#f6c453]">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                  <span className="ml-2 text-white/82">4,9/5</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-20 -mt-8 px-6">
        <div className="container max-w-6xl rounded-[1.5rem] border border-white/12 bg-white/[0.075] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
          <div className="grid gap-6 md:grid-cols-3 md:divide-x md:divide-white/18">
            {valueMetrics.map((metric) => (
              <div key={metric.value} className="flex items-center gap-5 px-2 py-2 md:px-8">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <metric.icon className={cn("h-7 w-7", metric.tone)} />
                </div>
                <div>
                  <p className="text-3xl font-black">{metric.value}</p>
                  <p className="max-w-[13rem] text-sm leading-6 text-white/78">{metric.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container max-w-6xl space-y-8 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-black md:text-5xl">Vos avantages exclusifs</h2>
          <p className="mt-3 text-lg leading-8 text-white/68">
            Chaque avantage est automatiquement applique à votre compte. Pas de code à saisir, pas de manipulation, tout est inclus.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {benefitCards.slice(0, 3).map((benefit, index) => (
            <button
              key={benefit.title}
              type="button"
              onClick={() => setExpandedBenefit(expandedBenefit === index ? null : index)}
              className="group flex min-h-52 flex-col items-start gap-5 rounded-[1.35rem] border border-white/10 bg-white/[0.065] p-7 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:-translate-y-1 hover:bg-white/[0.09] sm:flex-row"
            >
              <span className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", benefit.tone)}>
                <benefit.icon className="h-8 w-8 text-white" />
              </span>
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block text-xl font-black">{benefit.title}</span>
                <span className="block text-base leading-7 text-white/70">{benefit.desc}</span>
                <span className={cn("block overflow-hidden text-sm leading-6 text-[#ffe38a] transition-all", expandedBenefit === index ? "max-h-32 opacity-100" : "max-h-0 opacity-0")}>
                  {benefit.detail}
                </span>
              </span>
              <ArrowRight className="ml-auto mt-6 h-6 w-6 shrink-0 text-white/55 transition group-hover:translate-x-1" />
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {benefitCards.slice(3).map((benefit, offset) => {
            const index = offset + 3;
            return (
              <button
                key={benefit.title}
                type="button"
                onClick={() => setExpandedBenefit(expandedBenefit === index ? null : index)}
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-6 text-left transition hover:bg-white/[0.075]"
              >
                <span className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br", benefit.tone)}>
                  <benefit.icon className="h-6 w-6 text-white" />
                </span>
                <span className="block font-bold">{benefit.title}</span>
                <span className="mt-2 block text-sm leading-6 text-white/64">{expandedBenefit === index ? benefit.detail : benefit.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {!isActive ? (
        <section className="container max-w-5xl px-6 pb-16">
          <div className="rounded-[1.75rem] border border-[#f6c453]/35 bg-[#11092f]/82 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.30)] md:p-8">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <Badge className="mb-3 bg-[#f6c453]/15 text-[#ffe38a] hover:bg-[#f6c453]/20">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Essai gratuit
                </Badge>
                <h2 className="font-display text-3xl font-black">Essayez Tok One gratuitement</h2>
                <p className="mt-2 text-white/68">14 jours d'essai, sans engagement. Choisissez votre plan et votre rythme.</p>
              </div>
              <Button
                size="lg"
                className="h-14 rounded-full bg-[#f6c453] px-8 font-black text-[#10091f] hover:bg-[#ffe38a]"
                onClick={handleSubscribe}
                disabled={subscribing || plansLoading || !plan}
              >
                {subscribing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Continuer
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {plansLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#f6c453]" />
              </div>
            ) : !plan ? (
              <p className="text-center text-white/68">Aucun plan disponible pour le moment.</p>
            ) : (
              <div className="space-y-4">
                {availablePlans.length > 1 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {availablePlans.map((item) => (
                      <PlanChoiceButton
                        key={item.id}
                        active={item.id === plan.id}
                        title={item.name}
                        description={item.description || "Avantages premium Tok One."}
                        monthlyPrice={Number(item.price_monthly)}
                        yearlyPrice={Number(item.price_yearly)}
                        onClick={() => setSelectedPlanId(item.id)}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <PricingButton
                    active={selectedPeriod === "monthly"}
                    eyebrow="Souple"
                    title="Mensuel"
                    price={`${monthlyPrice.toFixed(2)} CHF`}
                    suffix="/mois"
                    helper="Sans engagement, resiliez à tout moment."
                    icon={Flame}
                    onClick={() => setSelectedPeriod("monthly")}
                  />
                  <PricingButton
                    active={selectedPeriod === "yearly"}
                    eyebrow="Le plus populaire"
                    title="Annuel"
                    price={`${yearlyPrice.toFixed(2)} CHF`}
                    suffix="/an"
                    helper={`Soit ${(yearlyPrice / 12).toFixed(2)} CHF/mois${yearlySavings > 0 ? `, ${yearlySavings.toFixed(2)} CHF economises` : ""}.`}
                    icon={Wallet}
                    onClick={() => setSelectedPeriod("yearly")}
                  />
                </div>
              </div>
            )}
            {plan ? <p className="mt-5 text-center text-sm text-white/58">Sélection actuelle: {plan.name} - {selectedPriceLabel}</p> : null}
          </div>
        </section>
      ) : (
        <section className="container max-w-5xl px-6 pb-16">
          <div className="flex flex-col gap-4 rounded-[1.75rem] border border-[#f6c453]/35 bg-[#f6c453]/10 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-display text-2xl font-black text-[#ffe38a]">Votre abonnement Tok One est actif</p>
              <p className="mt-1 text-white/68">
                {activeSubscription?.cancel_at_period_end
                  ? "Le renouvellement est resilie, vos avantages restent actifs jusqu’à la fin de la periode."
                  : "Vos avantages sont automatiquement appliques dans le panier."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link to="/profil?tab=abonnement">Gerer</Link>
              </Button>
              {!activeSubscription?.cancel_at_period_end ? (
                <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={handleCancel}>
                  Resilier
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      )}

      <section className="container grid max-w-6xl gap-10 px-6 pb-20 lg:grid-cols-[0.8fr_1fr]">
        <div>
          <h2 className="font-display text-3xl font-black">Comment ca marche ?</h2>
          <p className="mt-3 text-white/64">Tok One reste invisible quand tout va bien: vous commandez normalement, les avantages s'appliquent seuls.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { step: "1", title: "Activez", desc: "Souscription sécurisée en quelques secondes.", icon: Crown },
            { step: "2", title: "Commandez", desc: "Restaurants, paniers et réservations restent inchanges.", icon: CalendarCheck },
            { step: "3", title: "Economisez", desc: "Livraison, remises et accès VIP sont appliques.", icon: Gift },
          ].map((item) => (
            <div key={item.step} className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-black text-[#f6c453]">{item.step}</div>
              <item.icon className="mb-3 h-6 w-6 text-[#f6c453]" />
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/62">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container max-w-5xl space-y-4 px-6 pb-20">
        <h2 className="text-center font-display text-3xl font-black">Questions frequentes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-[1.1rem] border border-white/10 bg-white/[0.045] p-5">
              <h3 className="font-bold">{faq.q}</h3>
              <p className="mt-2 text-sm leading-6 text-white/62">{faq.a}</p>
            </div>
          ))}
        </div>
        <p className="pt-4 text-center text-sm text-white/54">
          Besoin d'aide ? <Link to="/aide" className="text-[#ffe38a] underline">Consultez la FAQ Tok</Link>.
        </p>
      </section>
    </main>
  );
}

function PlanChoiceButton({
  active,
  title,
  description,
  monthlyPrice,
  yearlyPrice,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  onClick: () => void;
}) {
  const monthly = Number.isFinite(monthlyPrice) ? monthlyPrice : 0;
  const yearly = Number.isFinite(yearlyPrice) ? yearlyPrice : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-[1.15rem] border p-5 text-left transition",
        active
          ? "border-[#f6c453] bg-[#f6c453]/12 shadow-[0_14px_46px_rgba(246,196,83,0.12)]"
          : "border-white/10 bg-white/[0.045] hover:bg-white/[0.075]",
      )}
    >
      <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/70">
        <Crown className="h-3.5 w-3.5 text-[#f6c453]" />
        Plan
      </span>
      <span className="block text-lg font-black">{title}</span>
      <span className="mt-2 block min-h-12 text-sm leading-6 text-white/64">{description}</span>
      <span className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-white/70">
        <span><strong className="text-xl text-white">{monthly.toFixed(2)} CHF</strong>/mois</span>
        <span><strong className="text-xl text-white">{yearly.toFixed(2)} CHF</strong>/an</span>
      </span>
      {active ? (
        <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#f6c453] text-[#10091f]">
          <Check className="h-4 w-4" />
        </span>
      ) : null}
    </button>
  );
}

function PricingButton({
  active,
  eyebrow,
  title,
  price,
  suffix,
  helper,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  eyebrow: string;
  title: string;
  price: string;
  suffix: string;
  helper: string;
  icon: typeof Crown;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-[1.35rem] border p-6 text-left transition",
        active
          ? "border-[#f6c453] bg-[#f6c453]/12 shadow-[0_18px_60px_rgba(246,196,83,0.14)]"
          : "border-white/10 bg-white/[0.045] hover:bg-white/[0.075]",
      )}
    >
      <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/70">
        <Icon className="h-3.5 w-3.5 text-[#f6c453]" />
        {eyebrow}
      </div>
      <h3 className="text-xl font-black">{title}</h3>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-black">{price}</span>
        <span className="pb-1 text-white/58">{suffix}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/64">{helper}</p>
      {active ? (
        <span className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-[#f6c453] text-[#10091f]">
          <Check className="h-5 w-5" />
        </span>
      ) : null}
    </button>
  );
}
