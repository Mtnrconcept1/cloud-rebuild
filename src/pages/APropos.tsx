import { ChefHat, Heart, Users, Leaf, Sparkles } from "lucide-react";

export default function APropos() {
  return (
    <div className="container py-12 md:py-20 space-y-16">
      <div className="text-center space-y-4">
        <h1 className="font-display text-4xl md:text-5xl font-bold">À propos de Miamz</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Nous connectons les passionnés de cuisine aux meilleurs restaurateurs locaux, tout en luttant contre le gaspillage alimentaire.</p>
      </div>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold">Notre Mission</h2>
          <p className="text-foreground/80 leading-relaxed text-lg">Miamz est né d'une idée simple : rendre la gastronomie accessible à tous, tout en respectant notre planète.</p>
          <p className="text-foreground/80 leading-relaxed text-lg">Notre plateforme valorise le savoir-faire des chefs, optimise la gestion des stocks et offre une expérience utilisateur fluide et personnalisée.</p>
        </div>
        <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl">
          <img src="https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80" alt="Restaurant Kitchen" className="object-cover w-full h-full" />
        </div>
      </section>
      <section className="bg-secondary/30 rounded-3xl p-8 md:p-12 space-y-12">
        <h2 className="text-3xl font-bold text-center">Nos Valeurs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { icon: ChefHat, title: "Qualité", desc: "Nous sélectionnons rigoureusement nos partenaires." },
            { icon: Leaf, title: "Éco-responsabilité", desc: "Notre programme anti-gaspi sauve des milliers de repas." },
            { icon: Users, title: "Communauté", desc: "Nous favorisons les échanges entre restaurateurs et clients." },
            { icon: Heart, title: "Passion", desc: "Nous mettons tout notre cœur dans nos services." },
          ].map((val, i) => (
            <div key={i} className="bg-background p-6 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><val.icon className="h-6 w-6 text-primary" /></div>
              <h3 className="text-xl font-semibold">{val.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{val.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="text-center space-y-8 py-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm"><Sparkles className="h-4 w-4" /> Rejoignez l'aventure</div>
        <h2 className="text-3xl md:text-4xl font-bold">Prêt à découvrir de nouvelles saveurs ?</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">Des milliers d'utilisateurs nous font déjà confiance.</p>
      </section>
    </div>
  );
}