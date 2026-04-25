import { Link } from "react-router-dom";
import {
  Calculator,
  ChefHat,
  Gift,
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

const FEATURES = [
  { icon: Shield, label: "Creneaux garantis", desc: "Livraison ponctuelle ou remboursee", to: "/creneaux-garantis", feature: "creneaux-garantis", bg: "bg-blue-500/10", fg: "text-blue-500" },
  { icon: Gift, label: "Offres", desc: "Fenetre flexible, prix reduit", to: "/flex-prix-bas", feature: "flex-prix-bas", bg: "bg-emerald-500/10", fg: "text-emerald-500" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", feature: "match-groupes", bg: "bg-violet-500/10", fg: "text-violet-500" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", feature: "multi-stop", bg: "bg-orange-500/10", fg: "text-orange-500" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de differents restos", to: "/multi-restaurant", feature: "multi-restaurant", bg: "bg-pink-500/10", fg: "text-pink-500" },
  { icon: ChefHat, label: "La Table du Chef", desc: "Plats off-menu en edition limitee", to: "/chefs-table", feature: "chefs-table", bg: "bg-amber-500/10", fg: "text-amber-500" },
  { icon: Timer, label: "Zero attente", desc: "Precommande synchronisee", to: "/zero-attente", feature: "zero-attente", bg: "bg-indigo-500/10", fg: "text-indigo-500" },
  { icon: ShieldCheck, label: "Garantie qualite", desc: "Chaud garanti ou rembourse", to: "/garantie-qualite", feature: "garantie-qualite", bg: "bg-teal-500/10", fg: "text-teal-500" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimises par objectifs", to: "/budget-auto", feature: "budget-auto", bg: "bg-cyan-500/10", fg: "text-cyan-500" },
  { icon: Repeat, label: "Abonnement", desc: "Repas recurrents planifies", to: "/abonnement", feature: "abonnement", bg: "bg-purple-500/10", fg: "text-purple-500" },
];

export default function FeaturesSection({ activeFeatures }: FeaturesSectionProps) {
  const visibleFeatures = FEATURES.filter((feature) => activeFeatures.has(feature.feature));
  if (visibleFeatures.length === 0) return null;

  return (
    <section className="bg-gradient-to-b from-background to-secondary/20 py-10 md:py-14">
      <div className="container space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold md:text-3xl">Fonctionnalites exclusives</h2>
          </div>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Des innovations uniques pour une experience food inedite
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {visibleFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.to}
                to={feature.to}
                className="group space-y-2 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.bg}`}>
                  <Icon className={`h-5 w-5 ${feature.fg}`} />
                </div>
                <h3 className="text-sm font-semibold leading-tight">{feature.label}</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">{feature.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
