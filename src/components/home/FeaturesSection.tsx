import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Calculator,
  ChefHat,
  Gift,
  Heart,
  Layers,
  Repeat,
  Route,
  Shield,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";

interface FeaturesSectionProps {
  activeFeatures: Set<string>;
}

const SECONDARY_FEATURES = [
  { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursée", to: "/creneaux-garantis", feature: "creneaux-garantis" },
  { icon: Gift, label: "Offres flexibles", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", feature: "flex-prix-bas" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", feature: "match-groupes" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", feature: "multi-stop" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", feature: "multi-restaurant" },
  { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", feature: "garantie-qualite" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", feature: "budget-auto" },
  { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", feature: "abonnement" },
];

const PRIMARY_PILLARS = [
  {
    icon: Timer,
    label: "Zéro attente",
    desc: "Réservez, choisissez, payez, arrivez, mangez.",
    to: "/zero-attente",
    feature: "zero-attente",
  },
  {
    icon: ChefHat,
    label: "Offres anti-gaspi & Tables du Chef",
    desc: "Des offres fortes, limitées et utiles aux restaurants.",
    to: "/anti-gaspi",
    feature: "anti-gaspi",
  },
  {
    icon: Heart,
    label: "Miamz solidaires",
    desc: "Chaque repas peut produire un impact concret.",
    to: "/tok-one",
    feature: "tok-one",
  },
];

export default function FeaturesSection({ activeFeatures }: FeaturesSectionProps) {
  const visiblePrimaryPillars = PRIMARY_PILLARS.filter((feature) => activeFeatures.has(feature.feature));
  const visibleFeatures = SECONDARY_FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  if (visiblePrimaryPillars.length === 0 && visibleFeatures.length === 0) return null;

  return (
    <section className="py-14 md:py-24" aria-labelledby="tok-why-heading">
      <div className="container">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="space-y-4 self-start lg:sticky lg:top-28">
            <h2 id="tok-why-heading" className="font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] dark:text-white">Trois raisons de choisir <em className="tok-title-accent">TOK</em></h2>
            <p className="max-w-md text-base leading-7 text-foreground/75 dark:text-slate-300">
              Une lecture simple : moins d&apos;attente, plus d&apos;offres locales, plus d&apos;impact solidaire.
            </p>
          </div>

          <div className="space-y-10">
            {visiblePrimaryPillars.length > 0 ? (
              <ul className="divide-y divide-border/80 border-y border-border/80 dark:divide-white/10 dark:border-white/10">
                {visiblePrimaryPillars.map((feature) => (
                  <li key={feature.to}>
                    <Link
                      to={feature.to}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-2xl py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 md:py-8"
                    >
                      <div className="min-w-0">
                        <h3 className="font-display text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground transition-colors duration-200 group-hover:text-primary dark:text-white">{feature.label}</h3>
                        <p className="mt-2 text-base leading-7 text-muted-foreground dark:text-slate-300">{feature.desc}</p>
                      </div>
                      <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-[background-color,border-color,color,transform] duration-200 ease-tok-out group-hover:border-primary group-hover:bg-primary group-hover:text-white group-active:scale-95 dark:border-white/15 dark:text-white">
                        <ArrowUpRight className="h-5 w-5 transition-transform duration-200 ease-tok-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {visibleFeatures.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-foreground dark:text-white">Également disponible</h3>
                <div className="flex flex-wrap gap-2">
                  {visibleFeatures.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <Link
                        key={feature.to}
                        to={feature.to}
                        title={feature.desc}
                        className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-[border-color,color,transform] duration-150 ease-tok-out hover:border-primary/50 hover:text-primary active:scale-[0.97] dark:border-white/10 dark:text-white"
                      >
                        <Icon className="h-4 w-4 text-foreground/60 transition-colors group-hover:text-primary dark:text-white/70" aria-hidden="true" />
                        {feature.label}
                        <span className="sr-only"> : {feature.desc}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
