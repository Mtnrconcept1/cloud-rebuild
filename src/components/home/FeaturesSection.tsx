import { Link } from "react-router-dom";
import { Shield, Gift, Users, Route, Layers, ChefHat, Timer, ShieldCheck, Calculator, Repeat, Sparkles } from "lucide-react";

interface FeaturesSectionProps {
  activeFeatures: Set<string>;
}

const FEATURES = [
  { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursé", to: "/creneaux-garantis", bg: "bg-blue-500/10", fg: "text-blue-500" },
  { icon: Gift, label: "Offres", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", bg: "bg-emerald-500/10", fg: "text-emerald-500" },
  { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", bg: "bg-violet-500/10", fg: "text-violet-500" },
  { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", bg: "bg-orange-500/10", fg: "text-orange-500" },
  { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", bg: "bg-pink-500/10", fg: "text-pink-500" },
  { icon: ChefHat, label: "Chef's Table", desc: "Plats off-menu en édition limitée", to: "/chefs-table", bg: "bg-amber-500/10", fg: "text-amber-500" },
  { icon: Timer, label: "Zéro attente", desc: "Précommande synchronisée", to: "/zero-attente", bg: "bg-indigo-500/10", fg: "text-indigo-500" },
  { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", bg: "bg-teal-500/10", fg: "text-teal-500" },
  { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", bg: "bg-cyan-500/10", fg: "text-cyan-500" },
  { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", bg: "bg-purple-500/10", fg: "text-purple-500" },
];

export default function FeaturesSection({ activeFeatures }: FeaturesSectionProps) {
  const visibleFeatures = FEATURES.filter((f) => activeFeatures.has(f.to.slice(1)));
  if (visibleFeatures.length === 0) return null;

  return (
    <section className="py-10 md:py-14 bg-gradient-to-b from-background to-secondary/20">
      <div className="container space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl md:text-3xl font-bold">Fonctionnalités exclusives</h2>
          </div>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">Des innovations uniques pour une expérience food inédite</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {visibleFeatures.map((feat) => {
            const Icon = feat.icon;
            return (
              <Link key={feat.to} to={feat.to} className="group rounded-xl border bg-card p-4 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className={`w-10 h-10 rounded-lg ${feat.bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${feat.fg}`} />
                </div>
                <h3 className="font-semibold text-sm leading-tight">{feat.label}</h3>
                <p className="text-[11px] text-muted-foreground leading-snug">{feat.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
