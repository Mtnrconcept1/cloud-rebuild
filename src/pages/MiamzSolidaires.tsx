import { Link } from "react-router-dom";
import { ArrowRight, Gift, HeartHandshake, ShieldCheck, Sparkles, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const steps = [
  {
    icon: Utensils,
    title: "Je mange",
    copy: "Chaque commande ou reservation eligible genere des Miamz selon le montant et les avantages actifs.",
  },
  {
    icon: Sparkles,
    title: "Je gagne",
    copy: "Les Miamz restent visibles dans le profil et peuvent financer une reduction, un cadeau ou une action solidaire.",
  },
  {
    icon: HeartHandshake,
    title: "Je donne",
    copy: "Vous pouvez reverser vos Miamz pour contribuer a des repas solidaires suivis par TOK.",
  },
];

const rules = [
  "Les Miamz ne sont pas une monnaie et ne sont pas convertibles en espece.",
  "Une reduction Miamz est appliquee uniquement dans les parcours eligibles et selon les conditions affichees au checkout.",
  "Les dons solidaires sont traces comme une contribution d'impact, separee des paiements restaurant.",
  "En cas d'annulation ou remboursement, les Miamz associes peuvent etre repris ou ajustes.",
];

export default function MiamzSolidaires() {
  useSeoMeta({
    title: "Miamz solidaires - fidelite, cadeaux et dons food | TOK",
    description:
      "Comprenez comment fonctionnent les Miamz TOK : points de fidelite, reductions, cadeaux et dons solidaires pour transformer chaque repas en impact local.",
    path: "/miamz-solidaires",
    image: "/Miamz2.webp",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Les Miamz sont-ils une monnaie ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Non. Les Miamz sont des points de fidelite TOK utilisables selon les conditions affichees dans l'application.",
          },
        },
        {
          "@type": "Question",
          name: "Peut-on donner ses Miamz ?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Oui. Les utilisateurs peuvent reverser des Miamz a une cagnotte solidaire suivie par TOK.",
          },
        },
      ],
    },
  });

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="relative overflow-hidden border-b border-rose-100">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-rose-50 lg:block" aria-hidden="true" />
        <div className="container relative grid gap-10 py-12 md:py-16 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
          <div className="max-w-2xl space-y-7">
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-black leading-[1.02] md:text-6xl">
                Miamz solidaires, chaque repas peut compter.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600 md:text-lg">
                Les Miamz relient fidelite, cadeaux et dons. Vous profitez de vos repas, vous cumulez des points, puis vous choisissez comment les utiliser ou les reverser.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-slate-950 text-white hover:bg-slate-800">
                <Link to="/recherche">
                  Trouver un restaurant
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/points-cadeau">Offrir des Miamz</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <picture>
              <source media="(max-width: 767px)" srcSet="/Miamz3.webp" type="image/webp" />
              <img
                src="/Miamz2.webp"
                alt="Illustration Miamz solidaire TOK"
                className="mx-auto w-full max-w-[560px] rounded-[1.2rem] border border-rose-100 bg-rose-50 shadow-[0_26px_80px_-44px_rgba(190,18,60,0.55)]"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="container grid gap-5 py-10 md:grid-cols-3 md:py-14">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.copy}</p>
            </article>
          );
        })}
      </section>

      <section className="border-y border-slate-200 bg-slate-950 py-10 text-white md:py-14">
        <div className="container grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-3">
            <h2 className="font-display text-3xl font-black">Des regles claires avant le lancement commercial.</h2>
            <p className="text-sm leading-6 text-white/70">
              TOK separe la fidelite, les reductions, les dons et les remboursements pour garder une comptabilite lisible et eviter toute confusion avec une monnaie.
            </p>
          </div>
          <div className="grid gap-3">
            {rules.map((rule) => (
              <div key={rule} className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <p className="text-sm leading-6 text-white/80">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container grid gap-5 py-10 md:grid-cols-2 md:py-14">
        <div className="rounded-lg border border-slate-200 p-6">
          <Gift className="mb-4 h-7 w-7 text-rose-600" />
          <h2 className="text-2xl font-black">Cadeaux entre proches</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Envoyez des Miamz a un proche depuis votre profil. Le destinataire peut les reclamer selon la duree de validite affichee.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-6">
          <HeartHandshake className="mb-4 h-7 w-7 text-rose-600" />
          <h2 className="text-2xl font-black">Dons solidaires</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Les dons Miamz alimentent une cagnotte d'impact local. Les ajustements en cas de remboursement restent audites dans les flux financiers.
          </p>
        </div>
      </section>
    </main>
  );
}
