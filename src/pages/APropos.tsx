import {
  Bike,
  ChefHat,
  Clock,
  Heart,
  Leaf,
  MapPin,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const STATS = [
  { value: "4", label: "interfaces clés", icon: Users },
  { value: "Genève", label: "ancrage local", icon: MapPin },
  { value: "Miamz", label: "fidélité intégrée", icon: Star },
  { value: "CHF", label: "paiements suisses", icon: ShieldCheck },
];

const VALUES = [
  {
    icon: ChefHat,
    title: "Restaurateur-first",
    desc: "TOK donne aux restaurants des outils concrets pour vendre, réserver, communiquer, suivre leurs campagnes, gérer leurs factures et garder la relation client.",
  },
  {
    icon: Leaf,
    title: "Moins de gaspillage",
    desc: "Anti-gaspi, ventes flash et offres courtes aident les restaurants à valoriser leurs stocks tout en donnant aux clients des opportunités locales utiles.",
  },
  {
    icon: Users,
    title: "Communauté locale",
    desc: "Le fil Actualités rapproche clients et restaurants avec des posts, sauvegardes, commentaires, partages et recommandations adaptées aux goûts de chacun.",
  },
  {
    icon: ShieldCheck,
    title: "Confiance opérationnelle",
    desc: "Commandes, réservations, notifications, paiements, support et rôles sont pensés pour rester traçables, séparés et cohérents entre clients, restaurateurs et admins.",
  },
];

const TIMELINE = [
  {
    year: "2026",
    title: "Une alternative locale",
    desc: "TOK se construit autour d'une idée simple : proposer une plateforme suisse plus directe pour les restaurants et plus fluide pour les clients.",
  },
  {
    year: "Clients",
    title: "Découverte, commande et réservation",
    desc: "Recherche, panier, suivi de commande, réservations, Zéro Attente, Anti-gaspi, ventes flash, Miamz, Tok One et Actualités forment l'expérience client.",
  },
  {
    year: "Restaurants",
    title: "Un vrai cockpit de pilotage",
    desc: "Le dashboard restaurateur regroupe menus, commandes, réservations, campagnes, posts Actualités, factures, photos, support, plan de salle et performance.",
  },
  {
    year: "Campagnes",
    title: "Marketing local mesurable",
    desc: "Les restaurants peuvent suivre budget, durée, impressions, clics, CPC, conversions et coût global depuis une seule page de campagnes.",
  },
  {
    year: "Suite",
    title: "Une plateforme qui apprend",
    desc: "Les recommandations utilisent likes, commentaires, partages, sauvegardes et signaux « Plus comme ça » ou « Moins comme ça » pour proposer des contenus plus pertinents.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Découvrez",
    desc: "Trouvez un restaurant, une offre Anti-gaspi, une vente flash, une Table du Chef ou un post Actualités près de vous.",
    icon: MapPin,
  },
  {
    step: "2",
    title: "Agissez",
    desc: "Commandez, réservez, sauvegardez un post, suivez un restaurant ou utilisez vos Miamz selon les avantages disponibles.",
    icon: UtensilsCrossed,
  },
  {
    step: "3",
    title: "Suivez",
    desc: "Recevez les notifications qui vous concernent, suivez les statuts et retrouvez vos commandes, réservations ou conversations support.",
    icon: Clock,
  },
];

export default function APropos() {
  useSeoMeta({ title: "À propos de TOK — plateforme restaurant suisse", description: "Découvrez TOK, sa mission restaurateur-first et ses services réellement disponibles ou déployés progressivement.", path: "/a-propos" });
  return (
    <div className="container py-12 md:py-20 space-y-20">
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
          <Heart className="h-4 w-4" /> Plateforme locale suisse
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold">À propos de TOK</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
          TOK réunit découverte, commande, réservation, fidélité, Actualités et outils restaurateurs dans une plateforme pensée pour Genève, la Suisse romande et les restaurants indépendants.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map((stat, i) => (
          <div key={i} className="text-center p-6 rounded-2xl border bg-card shadow-sm hover:shadow-md transition-shadow space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <stat.icon className="h-6 w-6 text-primary" />
            </div>
            <p className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</p>
            <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold">Notre mission</h2>
          <p className="text-foreground/80 leading-relaxed text-lg">
            TOK veut rendre la restauration locale plus rentable, plus visible et plus simple à gérer, sans perdre la qualité d'expérience attendue par les clients.
          </p>
          <p className="text-foreground/80 leading-relaxed text-lg">
            Côté client, l'objectif est clair : trouver rapidement une bonne adresse, réserver ou commander sans friction, profiter d'offres locales et construire une relation fidèle avec les restaurants que l'on aime.
          </p>
          <p className="text-foreground/80 leading-relaxed text-lg">
            Côté restaurant, TOK centralise les opérations : menu, commandes, réservations, campagnes, posts, statistiques, support, factures et services premium comme La Table du Chef ou les tables VIP liées aux Miamz.
          </p>
        </div>
        <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl">
          <img src="/images/mixed-grill-platter.jpeg" alt="Plat partagé dans un restaurant local" className="object-cover w-full h-full" />
        </div>
      </section>

      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Comment ça marche ?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Une expérience simple pour les clients, et un cockpit complet pour les restaurants.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="relative p-8 rounded-2xl border bg-card shadow-sm space-y-4 text-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto text-xl font-bold">
                {item.step}
              </div>
              <item.icon className="h-6 w-6 text-primary mx-auto" />
              <h3 className="text-xl font-semibold">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-secondary/30 rounded-3xl p-8 md:p-12 space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Nos valeurs</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Les principes qui guident les choix produit et opérationnels de TOK.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {VALUES.map((val) => (
            <div key={val.title} className="bg-background p-6 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <val.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">{val.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{val.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Ce que TOK rassemble</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Une plateforme unique plutôt qu'une pile d'outils séparés.</p>
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-border md:left-1/2 md:-translate-x-px" />
          <div className="space-y-10">
            {TIMELINE.map((item, i) => (
              <div key={item.title} className={`relative flex items-start gap-6 md:gap-12 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}>
                <div className={`flex-1 ${i % 2 === 0 ? "md:text-right" : "md:text-left"} hidden md:block`}>
                  <div className="p-6 rounded-2xl border bg-card shadow-sm space-y-2">
                    <p className="text-primary font-bold text-lg">{item.year}</p>
                    <h3 className="font-semibold text-lg">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="relative z-10 shrink-0">
                  <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-md">
                    {i + 1}
                  </div>
                </div>
                <div className="flex-1 md:hidden">
                  <div className="p-5 rounded-2xl border bg-card shadow-sm space-y-2">
                    <p className="text-primary font-bold">{item.year}</p>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="flex-1 hidden md:block" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-8 rounded-2xl border bg-green-50 dark:bg-green-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Leaf className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold">Anti-gaspi et offres courtes</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Les restaurants peuvent transformer des stocks disponibles en offres utiles : Anti-gaspi, ventes flash, codes courts et expériences limitées.
          </p>
        </div>
        <div className="p-8 rounded-2xl border bg-blue-50 dark:bg-blue-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Megaphone className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold">Actualités et campagnes</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Les restaurants publient, sponsorisent, mesurent et comprennent leurs contenus depuis TOK, avec des métriques utiles comme CPC, impressions et conversions.
          </p>
        </div>
        <div className="p-8 rounded-2xl border bg-amber-50 dark:bg-amber-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-xl font-semibold">Fidélité locale</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Les Miamz, Tok One, avantages VIP et recommandations donnent plus de valeur aux clients réguliers tout en créant du revenu récurrent pour les restaurants.
          </p>
        </div>
      </section>

      <section className="text-center space-y-8 py-12 bg-secondary/30 rounded-3xl px-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
          <Sparkles className="h-4 w-4" /> Découvrir TOK
        </div>
        <h2 className="text-3xl md:text-4xl font-bold">Une plateforme locale pour mieux manger et mieux piloter.</h2>
        <p className="text-muted-foreground max-w-xl mx-auto text-lg">
          Explorez les restaurants, suivez les Actualités, réservez une table ou découvrez les packs pensés pour les restaurateurs.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/">
            <Button size="lg" className="rounded-xl font-bold text-lg px-8 gap-2">
              <UtensilsCrossed className="h-5 w-5" /> Découvrir les restaurants
            </Button>
          </Link>
          <Link to="/packs-restaurateur">
            <Button size="lg" variant="outline" className="rounded-xl font-bold text-lg px-8 gap-2">
              <Bike className="h-5 w-5" /> Côté restaurateur
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
