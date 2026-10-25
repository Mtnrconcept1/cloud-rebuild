import { Link } from "react-router-dom";
import {
  Calculator,
  ChefHat,
  Gift,
  Heart,
  Layers,
  Repeat,
  Route,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";

interface FeaturesSectionProps {
  activeFeatures: Set<string>;
}

const SECONDARY_FEATURES = [
  { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursée", to: "/creneaux-garantis", feature: "creneaux-garantis", bg: "bg-blue-500/10", fg: "text-blue-500" },
  { icon: Gift, label: "Offres flexibles", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", feature: "flex-prix-bas", bg: "bg-emerald-500/10", fg: "text-emerald-500" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", feature: "match-groupes", bg: "bg-violet-500/10", fg: "text-violet-500" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", feature: "multi-stop", bg: "bg-orange-500/10", fg: "text-orange-500" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", feature: "multi-restaurant", bg: "bg-pink-500/10", fg: "text-pink-500" },
  { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", feature: "garantie-qualite", bg: "bg-teal-500/10", fg: "text-teal-500" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", feature: "budget-auto", bg: "bg-cyan-500/10", fg: "text-cyan-500" },
  { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", feature: "abonnement", bg: "bg-purple-500/10", fg: "text-purple-500" },
];

const PRIMARY_PILLARS = [
  {
    icon: Timer,
    label: "Zéro attente",
    desc: "Réservez, choisissez, payez, arrivez, mangez.",
    to: "/zero-attente",
    feature: "zero-attente",
    bg: "bg-indigo-500/10",
    fg: "text-indigo-500",
  },
  {
    icon: ChefHat,
    label: "Offres anti-gaspi & Tables du Chef",
    desc: "Des offres fortes, limitées et utiles aux restaurants.",
    to: "/anti-gaspi",
    feature: "anti-gaspi",
    bg: "bg-amber-500/10",
    fg: "text-amber-500",
  },
  {
    icon: Heart,
    label: "Miamz solidaires",
    desc: "Chaque repas peut produire un impact concret.",
    to: "/tok-one",
    feature: "tok-one",
    bg: "bg-pink-500/10",
    fg: "text-pink-500",
  },
];

export default function FeaturesSection({ activeFeatures }: FeaturesSectionProps) {
  const visiblePrimaryPillars = PRIMARY_PILLARS.filter((feature) => activeFeatures.has(feature.feature));
  const visibleFeatures = SECONDARY_FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  if (visiblePrimaryPillars.length === 0 && visibleFeatures.length === 0) return null;

  return (
    <section className="py-12 md:py-20">
      <div className="container space-y-8 md:space-y-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-4 w-4" />
              Pourquoi TOK
            </p>
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] dark:text-white">Trois raisons de choisir <em className="tok-title-accent">TOK</em></h2>
          </div>
          <p className="max-w-md text-[0.9375rem] leading-7 text-muted-foreground dark:text-slate-300 md:text-right">
            Une lecture simple : moins d&apos;attente, plus d&apos;offres locales, plus d&apos;impact solidaire.
          </p>
        </div>

        {visiblePrimaryPillars.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {visiblePrimaryPillars.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.to}
                to={feature.to}
                className="neon-card group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[24px] border border-border/60 bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift md:p-7"
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${feature.bg}`}>
                    <Icon className={`h-6 w-6 ${feature.fg}`} />
                  </div>
                  <span aria-hidden="true" className="font-display text-4xl font-medium tabular-nums text-foreground/10 transition-colors group-hover:text-primary/25 dark:text-white/10">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] dark:text-white">{feature.label}</h3>
                  <p className="text-sm leading-6 text-muted-foreground dark:text-slate-300">{feature.desc}</p>
                </div>
              </Link>
            );
            })}
          </div>
        ) : null}

        {visibleFeatures.length > 0 ? (
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Modules complémentaires activés
            </p>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
              {visibleFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.to}
                    to={feature.to}
                    className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift dark:border-white/10"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${feature.bg}`}>
                      <Icon className={`h-[18px] w-[18px] ${feature.fg}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-tight dark:text-white">{feature.label}</h3>
                      <p className="truncate text-xs leading-snug text-muted-foreground dark:text-slate-300">{feature.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
