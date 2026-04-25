import { ChefHat, Heart, Users, Leaf, Sparkles, MapPin, UtensilsCrossed, TrendingUp, Clock, ShieldCheck, Bike, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const STATS = [
  { value: "500+", label: "Restaurants partenaires", icon: UtensilsCrossed },
  { value: "150k+", label: "Utilisateurs actifs", icon: Users },
  { value: "1M+", label: "Repas livrés", icon: Bike },
  { value: "4.8/5", label: "Note moyenne", icon: Star },
];

const VALUES = [
  { icon: ChefHat, title: "Qualité", desc: "Nous sélectionnons rigoureusement nos partenaires pour garantir des repas frais, savoureux et préparés avec soin. Chaque restaurant passe par un processus de vérification avant de rejoindre notre plateforme." },
  { icon: Leaf, title: "Éco-responsabilité", desc: "Notre programme anti-gaspi sauve des milliers de repas chaque mois. Nous privilégions les emballages éco-responsables et optimisons les itinéraires de livraison pour réduire notre empreinte carbone." },
  { icon: Users, title: "Communauté", desc: "Nous favorisons les échanges entre restaurateurs et clients, créant un écosystème où chacun trouve sa place. Nos événements La Table du Chefs rassemblent les passionnés de gastronomie." },
  { icon: Heart, title: "Passion", desc: "Nous mettons tout notre cœur dans chaque aspect de nos services. De l'interface utilisateur au service client, chaque détail est pensé pour offrir la meilleure expérience possible." },
];

const TIMELINE = [
  { year: "Début 2026", title: "L'annonce qui change tout", desc: "Smood annonce sa fermeture définitive, laissant des milliers de restaurateurs et de clients sans solution. Face à ce vide, l'idée de Tok naît : créer une alternative suisse, locale et durable." },
  { year: "Mars 2026", title: "Tok voit le jour", desc: "En quelques semaines, une équipe de passionnés de food et de tech se forme pour construire la plateforme. Les premiers restaurants partenaires rejoignent l'aventure, convaincus par notre vision." },
  { year: "Printemps 2026", title: "Lancement en Suisse romande", desc: "Tok ouvre ses portes avec des centaines de restaurants partenaires. Les anciens utilisateurs de Smood trouvent enfin une alternative fiable, moderne et engagée." },
  { year: "Été 2026", title: "Tok One & Anti-Gaspi", desc: "Lancement de l'abonnement premium Tok One et du programme anti-gaspillage alimentaire. La communauté grandit à une vitesse folle." },
  { year: "Aujourd'hui", title: "L'aventure continue", desc: "Plus de 500 restaurants, 150'000 utilisateurs et une mission claire : reprendre le flambeau là où Smood s'est arrêté, en faisant mieux — pour les restaurateurs, les gourmets et la planète." },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Explorez", desc: "Parcourez les menus de centaines de restaurants près de chez vous. Filtrez par cuisine, prix, note ou distance.", icon: MapPin },
  { step: "2", title: "Commandez", desc: "Composez votre repas idéal, choisissez la livraison ou le click & collect, et payez en toute sécurité.", icon: UtensilsCrossed },
  { step: "3", title: "Savourez", desc: "Suivez votre commande en temps réel et recevez votre repas fraîchement préparé en 30 minutes en moyenne.", icon: Clock },
];

export default function APropos() {
  return (
    <div className="container py-12 md:py-20 space-y-20">

      {/* Hero */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
          <Heart className="h-4 w-4" /> Depuis 2026
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold">À propos de Tok</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
          Nous connectons les passionnés de cuisine aux meilleurs restaurateurs locaux, tout en luttant contre le gaspillage alimentaire. Une mission simple, un impact réel.
        </p>
      </div>

      {/* Chiffres clés */}
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

      {/* Notre Mission */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold">Notre Mission</h2>
          <p className="text-foreground/80 leading-relaxed text-lg">
            Quand Smood a annoncé sa fermeture début 2026, des milliers de restaurateurs et de gourmets se sont retrouvés sans solution. Tok est né de cette urgence : offrir une alternative suisse, moderne et responsable.
          </p>
          <p className="text-foreground/80 leading-relaxed text-lg">
            Notre plateforme valorise le savoir-faire des chefs locaux, optimise la gestion des stocks pour lutter contre le gaspillage alimentaire et offre une expérience utilisateur fluide et personnalisée.
          </p>
          <p className="text-foreground/80 leading-relaxed text-lg">
            Là où d'autres ont abandonné, nous avons repris le flambeau — en faisant les choses différemment. Plus proche des restaurateurs, plus juste pour les livreurs, et toujours au service des gourmets.
          </p>
        </div>
        <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl">
          <img src="/images/mixed-grill-platter.jpeg" alt="Restaurant Kitchen" className="object-cover w-full h-full" />
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Comment ça marche ?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Commander sur Tok, c'est simple comme bonjour.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_IT_WORKS.map((item, i) => (
            <div key={i} className="relative p-8 rounded-2xl border bg-card shadow-sm space-y-4 text-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto text-xl font-bold">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Nos Valeurs */}
      <section className="bg-secondary/30 rounded-3xl p-8 md:p-12 space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Nos Valeurs</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Les principes qui guident chacune de nos décisions.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {VALUES.map((val, i) => (
            <div key={i} className="bg-background p-6 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <val.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">{val.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{val.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Notre Histoire */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold">Notre Histoire</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">De l'idée à la réalité, retour sur le parcours de Tok.</p>
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-border md:left-1/2 md:-translate-x-px" />
          <div className="space-y-10">
            {TIMELINE.map((item, i) => (
              <div key={i} className={`relative flex items-start gap-6 md:gap-12 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}>
                <div className={`flex-1 ${i % 2 === 0 ? "md:text-right" : "md:text-left"} hidden md:block`}>
                  <div className="p-6 rounded-2xl border bg-card shadow-sm space-y-2">
                    <p className="text-primary font-bold text-lg">{item.year}</p>
                    <h3 className="font-semibold text-lg">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="relative z-10 shrink-0">
                  <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-md">
                    {item.year.slice(-2)}
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

      {/* Engagements */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-8 rounded-2xl border bg-green-50 dark:bg-green-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Leaf className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold">Anti-Gaspillage</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Plus de 50'000 repas sauvés grâce à notre programme de paniers surprise. Nous redistribuons les invendus des restaurants à prix réduit pour lutter contre le gaspillage alimentaire.
          </p>
        </div>
        <div className="p-8 rounded-2xl border bg-blue-50 dark:bg-blue-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold">Qualité garantie</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Chaque restaurant partenaire est vérifié et évalué régulièrement. Nous maintenons des standards élevés d'hygiène, de fraîcheur et de service pour garantir votre satisfaction.
          </p>
        </div>
        <div className="p-8 rounded-2xl border bg-amber-50 dark:bg-amber-950/20 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-xl font-semibold">Soutien local</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Nous soutenons l'économie locale en mettant en avant les restaurateurs indépendants. 80% de nos partenaires sont des restaurants locaux, pas des chaînes internationales.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-8 py-12 bg-secondary/30 rounded-3xl px-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
          <Sparkles className="h-4 w-4" /> Rejoignez l'aventure
        </div>
        <h2 className="text-3xl md:text-4xl font-bold">Prêt à découvrir de nouvelles saveurs ?</h2>
        <p className="text-muted-foreground max-w-xl mx-auto text-lg">
          Rejoignez plus de 150'000 gourmets qui nous font déjà confiance. Commandez vos plats préférés en quelques clics.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/">
            <Button size="lg" className="rounded-xl font-bold text-lg px-8 gap-2">
              <UtensilsCrossed className="h-5 w-5" /> Découvrir les restaurants
            </Button>
          </Link>
          <Link to="/aide">
            <Button size="lg" variant="outline" className="rounded-xl font-bold text-lg px-8">
              En savoir plus
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}