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
    <section className="relative border-y border-border/70 bg-surface-sunken py-12 md:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(70%_100%_at_50%_0%,hsl(var(--brand)/0.10),transparent_70%)]"
      />
      <div className="container relative space-y-8">
        <header className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="section-eyebrow justify-center">
            <Sparkles className="h-4 w-4" />
            Pourquoi TOK
          </p>
          <h2 className="font-display text-display-md font-bold">Trois raisons de choisir TOK</h2>
          <p className="mx-auto max-w-lg text-[0.95rem] leading-6 text-muted-foreground">
            Une lecture simple : moins d&apos;attente, plus d&apos;offres locales, plus d&apos;impact solidaire.
          </p>
        </header>

        {visiblePrimaryPillars.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {visiblePrimaryPillars.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.to}
                  to={feature.to}
                  className="neon-card group relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-base ease-out-soft hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.45),transparent)] opacity-0 transition-opacity duration-base ease-out-soft group-hover:opacity-100"
                  />
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset ring-border/60 ${feature.bg}`}>
                    <Icon className={`h-6 w-6 ${feature.fg}`} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-[1.0625rem] font-bold leading-tight tracking-[-0.018em] transition-colors duration-fast ease-out-soft group-hover:text-primary">
                      {feature.label}
                    </h3>
                    <p className="text-sm leading-6 text-muted-foreground">{feature.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}

        {visibleFeatures.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <hr className="rule-soft flex-1" />
              <p className="whitespace-nowrap text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Modules complémentaires activés
              </p>
              <hr className="rule-soft flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {visibleFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.to}
                    to={feature.to}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-[transform,box-shadow,border-color] duration-base ease-out-soft hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${feature.bg}`}>
                      <Icon className={`h-4 w-4 ${feature.fg}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold leading-tight transition-colors duration-fast ease-out-soft group-hover:text-primary">
                        {feature.label}
                      </h3>
                      <p className="truncate text-[11px] leading-snug text-muted-foreground">{feature.desc}</p>
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
