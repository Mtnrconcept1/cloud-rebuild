import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Truck,
  Percent,
  ChefHat,
  Zap,
  Headphones,
  Gift,
  Check,
  Star,
  Loader2,
  ShieldCheck,
  CalendarCheck,
  ArrowRight,
  Clock3,
  Flame,
  Wallet,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  isTokOneSubscriptionActive,
  useTokOnePlans,
  useTokOneSubscription,
} from "@/hooks/useTokOne";

const supabase = getSupabase();

const BENEFITS = [
  {
    icon: Truck,
    title: "Livraison gratuite",
    desc: "Sur tous les restaurants eligibles, sans minimum de commande.",
    detail: "En tant que membre Tok One, les frais de livraison (express, standard ou flex) sont automatiquement offerts sur chacune de vos commandes. L'economie est appliquee directement dans votre panier — aucune action requise de votre part.",
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  {
    icon: Percent,
    title: "Reductions exclusives",
    desc: "Jusqu'a 20% de reduction sur vos plats preferes.",
    detail: "Des remises permanentes sur une selection de plats chez nos restaurants partenaires. Ces reductions sont cumulables avec les codes promo et les formules dejeuner. Le montant exact varie selon les restaurants et les periodes.",
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  {
    icon: ChefHat,
    title: "Acces prioritaire La Table du Chef",
    desc: "Reservez en avant-premiere les evenements gastronomiques exclusifs.",
    detail: "Les drops La Table du Chef sont souvent complets en quelques minutes. En tant que membre Tok One, vous beneficiez d'un acces anticipe de 24h avant l'ouverture des reservations au grand public.",
    color: "text-orange-600",
    bg: "bg-orange-100",
  },
  {
    icon: Zap,
    title: "Ventes flash en avance",
    desc: "Acces anticipe aux offres speciales avant tout le monde.",
    detail: "Les ventes flash proposent des plats a prix reduit en quantites limitees. Les membres Tok One recoivent une notification en avance et peuvent commander avant le lancement officiel, garantissant l'acces aux meilleures offres.",
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
  {
    icon: Headphones,
    title: "Support prioritaire",
    desc: "Temps de reponse accelere de notre equipe de support.",
    detail: "Votre demande est traitee en priorite par notre equipe. Temps de reponse moyen pour les membres Tok One : moins de 2 heures, contre 24h en standard. Accessible via le chat en ligne et par email.",
    color: "text-purple-600",
    bg: "bg-purple-100",
  },
  {
    icon: Gift,
    title: "Offres surprises",
    desc: "Des recompenses et avantages reguliers reserves aux membres.",
    detail: "Chaque mois, recevez des surprises : desserts offerts, livraisons express gratuites, points de fidelite bonus, invitations a des degustations privees. Les offres changent et sont adaptees a vos habitudes de commande.",
    color: "text-pink-600",
    bg: "bg-pink-100",
  },
];

const TRUST_PILLS = [
  { icon: ShieldCheck, label: "Paiement securise Stripe" },
  { icon: Clock3, label: "Activation en moins de 2 min" },
  { icon: Wallet, label: "Annulation a tout moment" },
];

const VALUE_METRICS = [
  { value: "2.50 CHF", label: "frais de livraison moyens economises / commande" },
  { value: "20%", label: "de remise sur une selection de plats" },
  { value: "24h", label: "d'acces anticipe a La Table du Chef" },
];

export default function TokOne() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<"monthly" | "yearly">("yearly");
  const [subscribing, setSubscribing] = useState(false);
  const [expandedBenefit, setExpandedBenefit] = useState<number | null>(null);

  // Handle Stripe return
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

  // Use the first active plan from the DB (single Tok One tier)
  const plan = plans?.[0];
  const monthlyPrice = plan ? Number(plan.price_monthly) : 0;
  const yearlyPrice = plan ? Number(plan.price_yearly) : 0;
  const yearlySavings = monthlyPrice > 0 ? (monthlyPrice * 12 - yearlyPrice) : 0;

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
      toast({ title: "Abonnement resilie", description: "Vous conservez vos avantages jusqu'a la fin de la periode en cours." });
      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/40 via-background to-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white">
        <div className="absolute inset-0 bg-[url('/images/pattern.svg')] opacity-5" />
        <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="relative container max-w-5xl px-6 pb-24 pt-20 text-center space-y-6 md:pb-28">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 text-sm font-medium">
            <Crown className="h-4 w-4 text-yellow-300" />
            Abonnement Premium
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight">
            Tok <span className="text-yellow-300">One</span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
            L'experience ultime de la livraison gastronomique. Livraison gratuite, reductions exclusives et acces VIP aux evenements culinaires.
          </p>
          <Badge className="bg-yellow-400/20 text-yellow-200 border-yellow-400/30 text-sm px-4 py-1">
            <Star className="h-3.5 w-3.5 mr-1.5" />
            14 jours d'essai gratuit
          </Badge>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {TRUST_PILLS.map((pill) => (
              <span
                key={pill.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/85 backdrop-blur"
              >
                <pill.icon className="h-3.5 w-3.5" />
                {pill.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`relative z-10 container max-w-5xl px-6 pb-20 ${isActive ? "-mt-6 space-y-14 md:-mt-8" : "-mt-10 space-y-16"
          }`}
      >
        {/* Active subscription banner */}
        {isActive && activeSubscription && (
          <div className="rounded-[28px] border border-violet-200/80 bg-white/96 p-6 shadow-[0_22px_60px_-28px_rgba(109,40,217,0.42)] backdrop-blur md:p-7 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100">
                  <Crown className="h-6 w-6 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-violet-900">Vous etes membre Tok One</h3>
                  <p className="text-sm text-violet-600">
                    Plan : {activeSubscription.user_subscription_plans?.name || "Premium"}
                  </p>
                  <p className="text-xs text-violet-500">
                    Actif jusqu'au {new Date(activeSubscription.current_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    {activeSubscription.cancel_at_period_end && " (non renouvele)"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/profil?tab=abonnement">Gerer</Link>
                </Button>
                {!activeSubscription.cancel_at_period_end && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={handleCancel}>
                    Resilier
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {[
                { icon: Truck, label: "Livraison gratuite", active: true },
                { icon: Percent, label: "Reductions actives", active: true },
                { icon: ShieldCheck, label: "Support prioritaire", active: true },
              ].map((perk) => (
                <div key={perk.label} className="flex min-w-0 items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-sm text-violet-700">
                  <perk.icon className="h-4 w-4" />
                  <span className="truncate">{perk.label}</span>
                  <Check className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Value metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUE_METRICS.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-violet-100 bg-white/90 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-violet-700">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>

        {/* Benefits grid with detailed explanations */}
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-display font-bold">
              Vos avantages exclusifs
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Chaque avantage est automatiquement applique a votre compte. Pas de code a saisir, pas de manipulation — tout est inclus.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map((benefit, i) => (
              <button
                key={benefit.title}
                onClick={() => setExpandedBenefit(expandedBenefit === i ? null : i)}
                className={`group text-left p-6 rounded-2xl border bg-card shadow-sm space-y-3 hover:shadow-md hover:-translate-y-0.5 transition-all ${expandedBenefit === i ? "ring-2 ring-violet-300 shadow-md" : ""}`}
              >
                <div className={`w-12 h-12 rounded-xl ${benefit.bg} flex items-center justify-center`}>
                  <benefit.icon className={`h-6 w-6 ${benefit.color}`} />
                </div>
                <h3 className="font-bold">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.desc}</p>
                {expandedBenefit === i && (
                  <div className="pt-2 border-t text-sm text-foreground/80 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200">
                    {benefit.detail}
                  </div>
                )}
                <span className="text-xs text-violet-500 font-medium flex items-center gap-1">
                  {expandedBenefit === i ? "Reduire" : "En savoir plus"} <ArrowRight className={`h-3 w-3 transition-transform ${expandedBenefit === i ? "rotate-90" : ""}`} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-6">
          <h2 className="text-2xl font-display font-bold text-center">Comment ca marche ?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Abonnez-vous", desc: "Choisissez votre formule mensuelle ou annuelle. Le paiement est securise par Stripe.", icon: Crown },
              { step: "2", title: "Commandez normalement", desc: "Parcourez les restaurants, ajoutez vos plats au panier. La livraison gratuite et les reductions s'appliquent automatiquement.", icon: CalendarCheck },
              { step: "3", title: "Profitez de vos avantages", desc: "Acces VIP aux evenements, support prioritaire, et surprises mensuelles. Tout est inclus, sans effort.", icon: Gift },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-3 p-6">
                <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center mx-auto">
                  {s.step}
                </div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing — from DB */}
        {!isActive && (
          <div className="space-y-8">
            <h2 className="text-3xl font-display font-bold text-center">
              Choisissez votre formule
            </h2>

            {plansLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              </div>
            ) : !plan ? (
              <p className="text-center text-muted-foreground">Aucun plan disponible pour le moment.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                  {/* Monthly */}
                  <button
                    onClick={() => setSelectedPeriod("monthly")}
                    className={`relative p-6 rounded-2xl border-2 text-left transition-all space-y-4 bg-white/90 ${selectedPeriod === "monthly"
                        ? "border-violet-500 bg-violet-50/50 shadow-lg shadow-violet-100"
                        : "border-muted hover:border-violet-200"
                      }`}
                  >
                    <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                      <Flame className="h-3 w-3" />
                      Souple
                    </div>
                    <h3 className="font-bold text-lg">Mensuel</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{monthlyPrice.toFixed(2)}</span>
                      <span className="text-muted-foreground">CHF/mois</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Sans engagement — resiliez a tout moment.</p>
                    {selectedPeriod === "monthly" && (
                      <div className="absolute top-4 right-4">
                        <Check className="h-5 w-5 text-violet-600" />
                      </div>
                    )}
                  </button>

                  {/* Yearly */}
                  <button
                    onClick={() => setSelectedPeriod("yearly")}
                    className={`relative p-6 rounded-2xl border-2 text-left transition-all space-y-4 bg-white/90 ${selectedPeriod === "yearly"
                        ? "border-violet-500 bg-violet-50/50 shadow-lg shadow-violet-100"
                        : "border-muted hover:border-violet-200"
                      }`}
                  >
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white">
                      Le plus populaire
                    </Badge>
                    <div className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-700">
                      <Wallet className="h-3 w-3" />
                      Le plus rentable
                    </div>
                    <h3 className="font-bold text-lg">Annuel</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{yearlyPrice.toFixed(2)}</span>
                      <span className="text-muted-foreground">CHF/an</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Soit {(yearlyPrice / 12).toFixed(2)} CHF/mois
                    </p>
                    {yearlySavings > 0 && (
                      <p className="text-sm font-medium text-violet-600">
                        Economisez {yearlySavings.toFixed(2)} CHF
                      </p>
                    )}
                    {selectedPeriod === "yearly" && (
                      <div className="absolute top-4 right-4">
                        <Check className="h-5 w-5 text-violet-600" />
                      </div>
                    )}
                  </button>
                </div>

                <div className="text-center space-y-4">
                  <Button
                    size="lg"
                    className="bg-violet-600 hover:bg-violet-700 text-white px-10"
                    onClick={handleSubscribe}
                    disabled={subscribing}
                  >
                    {subscribing ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Redirection...</>
                    ) : (
                      <><Crown className="mr-2 h-5 w-5" />S'abonner — {selectedPeriod === "yearly" ? `${yearlyPrice.toFixed(2)} CHF/an` : `${monthlyPrice.toFixed(2)} CHF/mois`}</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Annulation possible a tout moment pendant la periode d'essai. Aucun frais si vous resiliez avant la fin des 14 jours.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Comparison table */}
        <div className="space-y-6">
          <h2 className="text-2xl font-display font-bold text-center">Avec et sans Tok One</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-3 border-b font-medium text-muted-foreground">Avantage</th>
                  <th className="p-3 border-b font-medium text-muted-foreground text-center">Sans abonnement</th>
                  <th className="p-3 border-b font-bold text-violet-700 text-center bg-violet-50 rounded-t-xl">Tok One</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Frais de livraison", free: "1.00 – 2.50 CHF", tok: "Gratuit", tokHighlight: true },
                  { feature: "Reductions sur les plats", free: "Promos ponctuelles", tok: "Jusqu'a -20% permanent", tokHighlight: true },
                  { feature: "Acces La Table du Chef", free: "En meme temps que tous", tok: "24h en avance", tokHighlight: true },
                  { feature: "Ventes flash", free: "A l'ouverture", tok: "Acces anticipe", tokHighlight: true },
                  { feature: "Support", free: "Standard (24h)", tok: "Prioritaire (<2h)", tokHighlight: true },
                  { feature: "Offres surprises mensuelles", free: "—", tok: "Incluses", tokHighlight: true },
                ].map((row) => (
                  <tr key={row.feature}>
                    <td className="p-3 border-b font-medium">{row.feature}</td>
                    <td className="p-3 border-b text-center text-muted-foreground">{row.free}</td>
                    <td className={`p-3 border-b text-center font-medium bg-violet-50 ${row.tokHighlight ? "text-violet-700" : ""}`}>{row.tok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ mini */}
        <div className="space-y-4 max-w-2xl mx-auto">
          <h2 className="text-2xl font-display font-bold text-center">Questions frequentes</h2>
          <div className="space-y-3">
            {[
              { q: "L'essai gratuit m'engage-t-il ?", a: "Non. Vous pouvez resilier a tout moment pendant les 14 jours sans etre facture." },
              { q: "Puis-je changer de formule ?", a: "Oui. Passez du mensuel a l'annuel (ou inversement) a tout moment depuis votre profil." },
              { q: "Les avantages sont-ils cumulables avec les promos ?", a: "Oui ! La livraison gratuite et les reductions Tok One se cumulent avec les codes promo et offres speciales." },
              { q: "Comment resilier ?", a: "Depuis Profil > Mon abonnement > Resilier. La resiliation prend effet a la fin de la periode en cours." },
              { q: "Comment fonctionne la livraison gratuite ?", a: "Des que vous etes membre Tok One, les frais de livraison (express, standard ou flex) sont automatiquement retires de votre panier. Aucun code a saisir." },
              { q: "Les reductions s'appliquent-elles a tous les restaurants ?", a: "Les reductions permanentes concernent les restaurants partenaires du programme. La livraison gratuite s'applique a toutes les commandes en livraison." },
            ].map((faq) => (
              <div key={faq.q} className="p-4 rounded-xl border bg-card">
                <h4 className="font-semibold text-sm">{faq.q}</h4>
                <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA footer */}
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Des questions ? <Link to="/aide" className="text-primary underline">Consultez notre FAQ</Link> ou contactez-nous a support@tok.ch
          </p>
        </div>
      </div>
    </div>
  );
}
