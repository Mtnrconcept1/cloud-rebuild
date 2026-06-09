import { Heart, MapPin, ShieldCheck, Sparkles, Store, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

const VALUES = [
  {
    icon: Store,
    title: "Restaurateur-first",
    desc: "TOK donne aux restaurants des outils concrets pour gérer leur présence locale, leurs informations, leurs opérations et leur relation client.",
  },
  {
    icon: MapPin,
    title: "Ancrage local",
    desc: "La plateforme est pensée pour Genève et la Suisse romande, avec une approche de proximité.",
  },
  {
    icon: ShieldCheck,
    title: "Confiance opérationnelle",
    desc: "Les parcours affichés sont structurés pour rester traçables, cohérents et adaptés à la configuration active.",
  },
  {
    icon: Users,
    title: "Relation directe",
    desc: "TOK cherche à rapprocher les restaurants de leurs clients sans multiplier les intermédiaires inutiles.",
  },
];

export default function APropos() {
  return (
    <div className="container space-y-20 py-12 md:py-20">
      <section className="space-y-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          <Heart className="h-4 w-4" /> Plateforme locale suisse
        </div>
        <h1 className="font-display text-4xl font-bold md:text-5xl">À propos de TOK</h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
          TOK rassemble les parcours visibles dans l’interface, les outils restaurateurs et les services locaux réellement activés pour l’utilisateur.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-5 rounded-3xl border bg-card p-8 shadow-sm">
          <h2 className="text-3xl font-bold">Notre mission</h2>
          <p className="text-lg leading-relaxed text-foreground/80">
            TOK veut rendre la restauration locale plus visible, plus rentable et plus simple à piloter, avec une expérience claire pour les clients et les partenaires.
          </p>
          <p className="text-lg leading-relaxed text-foreground/80">
            Les textes et parcours publics s’adaptent aux modules activés afin de ne présenter que ce qui est disponible au moment de l’utilisation.
          </p>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-3xl shadow-2xl">
          <img src="/images/mixed-grill-platter.jpeg" alt="Plat partagé dans un restaurant local" className="h-full w-full object-cover" />
        </div>
      </section>

      <section className="rounded-3xl bg-secondary/30 p-8 md:p-12">
        <div className="mb-10 space-y-4 text-center">
          <h2 className="text-3xl font-bold">Nos valeurs</h2>
          <p className="mx-auto max-w-xl text-muted-foreground">Les principes qui guident les choix produit et opérationnels de TOK.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <div key={value.title} className="rounded-2xl bg-background p-6 shadow-sm">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <value.icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl bg-primary/10 px-8 py-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" /> Découvrir TOK
        </div>
        <h2 className="mt-6 text-3xl font-bold">Explorer les parcours disponibles</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Les menus et pages publiques ne montrent que les services configurés comme accessibles.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link to="/recherche">Explorer</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full">
            <Link to="/restaurateurs/geneve">Espace restaurateurs</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
