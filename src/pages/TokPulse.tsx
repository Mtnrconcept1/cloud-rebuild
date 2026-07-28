import { BadgePercent, BellRing, CalendarClock, Flame, QrCode, Sparkles, Utensils } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const widgetPresets = [
  {
    name: "Compact",
    title: "3 tables libres",
    subtitle: "Ce soir à Genève",
    action: "Ouvrir",
    icon: CalendarClock,
  },
  {
    name: "Promo",
    title: "Offres flash ce soir",
    subtitle: "Jusqu’à -50% près de toi",
    action: "Voir",
    icon: Flame,
  },
  {
    name: "Premium",
    title: "Tables du Chef",
    subtitle: "Expériences à réserver",
    action: "Réserver",
    icon: Sparkles,
  },
];

const quickActions = [
  { label: "Réserver", href: "/recherche?mode=reservation", icon: CalendarClock },
  { label: "Offres flash", href: "/ventes-flash", icon: Flame },
  { label: "Scanner fidélité", href: "/points-cadeau", icon: QrCode },
  { label: "Anti-gaspi", href: "/anti-gaspi", icon: BadgePercent },
];

export default function TokPulse() {
  useSeoMeta({
    title: "TOK Pulse - raccourcis et expérience mobile TOK",
    description:
      "Découvrez TOK Pulse, les raccourcis mobiles pour réserver, consulter les offres flash et accéder rapidement aux services TOK.",
    path: "/tok-pulse",
  });

  return (
    <main className="min-h-screen overflow-hidden bg-[#080604] text-white">
      <section className="relative isolate px-4 py-12 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,106,0,0.36),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.24),transparent_36%)]" />
        <div className="mx-auto grid min-w-0 max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="min-w-0 space-y-6">
            <Badge className="border-orange-400/60 bg-orange-500/15 text-orange-100">TOK Pulse · présence iPhone</Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
                Un widget TOK qui agit comme un gros bouton vivant.
              </h1>
              <p className="max-w-2xl text-lg text-orange-50/78">
                Pour une PWA installée depuis Safari, on reste App Store-compatible : icône statique forte, raccourcis,
                badge utile quand la plateforme le permet, et une page d'accueil dédiée aux widgets à ajouter juste à côté de l'icône.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <Link to="/recherche?mode=reservation">Trouver une table</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                <Link to="/ventes-flash">Voir les offres</Link>
              </Button>
            </div>
          </div>

          <div className="min-w-0 rounded-[2rem] border border-orange-400/30 bg-black/55 p-4 shadow-[0_0_60px_rgba(255,106,0,0.24)] backdrop-blur">
            <div className="min-w-0 rounded-[1.5rem] border border-white/10 bg-[#12100e] p-4">
              <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500 shadow-[0_0_30px_rgba(255,106,0,0.75)] sm:h-14 sm:w-14">
                  <Utensils className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <p className="text-xs uppercase tracking-[0.18em] text-orange-200 sm:text-sm sm:tracking-[0.24em]">TOK / TOK</p>
                  <p className="text-xl font-black leading-tight sm:text-2xl">Ce soir à Genève</p>
                </div>
                <Badge className="max-w-full shrink-0 whitespace-normal bg-emerald-500 text-center text-white sm:ml-auto">3 dispos</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {widgetPresets.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <Link
                      key={preset.name}
                      to={preset.name === "Promo" ? "/ventes-flash" : "/recherche?mode=reservation"}
                      className="group rounded-2xl border border-orange-300/20 bg-gradient-to-br from-orange-500/20 to-white/5 p-4 transition hover:-translate-y-0.5 hover:border-orange-300/55"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <Badge className="bg-black/50 text-orange-100">{preset.name}</Badge>
                        <Icon className="h-5 w-5 text-orange-200" />
                      </div>
                      <p className="text-xl font-black">{preset.title}</p>
                      <p className="mt-1 text-sm text-orange-50/70">{preset.subtitle}</p>
                      <span className="mt-4 inline-flex rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white group-hover:bg-orange-400">
                        {preset.action}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
          <h2 className="text-2xl font-black">Ajouter TOK à l'écran d'accueil</h2>
          <ol className="mt-4 space-y-3 text-orange-50/78">
            <li>1. Ouvre TOK dans Safari, puis touche Partager.</li>
            <li>2. Choisis « Sur l'écran d'accueil » pour installer la PWA.</li>
            <li>3. Place l'icône TOK près de tes widgets iPhone, puis garde ce panneau comme repère « TOK Pulse ».</li>
          </ol>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
          <h2 className="text-2xl font-black">Actions rapides utiles</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.label} to={action.href} className="rounded-2xl border border-white/10 bg-black/30 p-4 hover:border-orange-300/60">
                  <Icon className="mb-3 h-5 w-5 text-orange-300" />
                  <span className="font-bold">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <BellRing className="mt-1 h-5 w-5 text-emerald-200" />
            <p className="text-emerald-50/85">
              Les badges et notifications TOK doivent rester consentis et utiles : réservation active, commande en cours,
              offres réellement pertinentes ou avantage fidélité disponible. Aucun faux compteur marketing.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
