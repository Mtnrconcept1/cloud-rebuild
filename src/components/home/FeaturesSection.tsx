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
    bg: "bg-indigo-500/10",
    fg: "text-indigo-500",
  },
  {
    icon: ChefHat,
    label: "Offres anti-gaspi & Tables du Chef",
    desc: "Des offres fortes, limitées et utiles aux restaurants.",
    to: "/anti-gaspi",
    bg: "bg-amber-500/10",
    fg: "text-amber-500",
  },
  {
    icon: Heart,
    label: "Miamz solidaires",
    desc: "Chaque repas peut produire un impact concret.",
    to: "/tok-one",
    bg: "bg-pink-500/10",
    fg: "text-pink-500",
  },
];

export default function FeaturesSection({ activeFeatures }: FeaturesSectionProps) {
  const visibleFeatures = SECONDARY_FEATURES.filter((feature) => activeFeatures.has(feature.feature));

  return (
    <section className="bg-gradient-to-b from-background to-secondary/20 py-10 dark:from-background dark:via-slate-950/40 dark:to-orange-950/10 md:py-14">
      <div className="container space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-primary dark:drop-shadow-[0_0_16px_rgba(249,115,22,0.55)]" />
            <h2 className="font-display text-2xl font-bold dark:text-white md:text-3xl">Trois raisons de choisir TOK</h2>
          </div>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground dark:text-slate-300">
            Une lecture simple : moins d&apos;attente, plus d&apos;offres locales, plus d&apos;impact solidaire.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PRIMARY_PILLARS.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.to}
                to={feature.to}
                className="neon-card group flex min-h-[180px] flex-col justify-between rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/20 dark:bg-card/90"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg}`}>
                  <Icon className={`h-6 w-6 ${feature.fg}`} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-extrabold leading-tight dark:text-white">{feature.label}</h3>
                  <p className="text-sm leading-6 text-muted-foreground dark:text-slate-300">{feature.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {visibleFeatures.length > 0 ? (
          <div className="space-y-3">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Modules complémentaires activés
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {visibleFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.to}
                    to={feature.to}
                    className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/20 dark:bg-card/90"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${feature.bg}`}>
                      <Icon className={`h-4 w-4 ${feature.fg}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-tight dark:text-white">{feature.label}</h3>
                      <p className="truncate text-[11px] leading-snug text-muted-foreground dark:text-slate-300">{feature.desc}</p>
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
