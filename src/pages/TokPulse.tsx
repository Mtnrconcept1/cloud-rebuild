import { useEffect, useMemo, useState } from "react";
import { BadgePercent, BellRing, CalendarClock, Check, Flame, Smartphone, Sparkles, Utensils, Widgets } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/hooks/useSeoMeta";

type PulseItem = {
  count: number;
  title: string;
  subtitle: string;
  url: string;
};

type PulsePayload = {
  updated_at: string;
  city: string;
  priority: string;
  reservation: PulseItem;
  flash: PulseItem;
  chef_table: PulseItem;
  anti_waste: PulseItem;
};

const fallbackPulse: PulsePayload = {
  updated_at: new Date(0).toISOString(),
  city: "Genève",
  priority: "reservation",
  reservation: { count: 0, title: "Trouver une table", subtitle: "Réservation TOK", url: "/recherche?mode=reservation" },
  flash: { count: 0, title: "Offres flash", subtitle: "Voir les offres", url: "/ventes-flash" },
  chef_table: { count: 0, title: "La Table du Chef", subtitle: "Drops exclusifs", url: "/chefs-table" },
  anti_waste: { count: 0, title: "Anti-gaspi", subtitle: "Mieux manger", url: "/anti-gaspi" },
};

function internalPath(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/tok-pulse";
  }
}

export default function TokPulse() {
  const [pulse, setPulse] = useState<PulsePayload>(fallbackPulse);
  const [live, setLive] = useState(false);

  useSeoMeta({
    title: "TOK Pulse - widget iPhone et raccourcis TOK",
    description: "TOK Pulse affiche les tables, offres flash, Tables du Chef et offres anti-gaspi dans le widget natif de l’app TOK sur iPhone.",
    path: "/tok-pulse",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/functions/v1/tok-pulse-widget", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`pulse_${response.status}`);
        return (await response.json()) as PulsePayload;
      })
      .then((payload) => {
        setPulse(payload);
        setLive(true);
      })
      .catch(() => setLive(false));
    return () => controller.abort();
  }, []);

  const cards = useMemo(
    () => [
      { key: "reservation", label: "Réserver", icon: CalendarClock, item: pulse.reservation },
      { key: "flash", label: "Flash", icon: Flame, item: pulse.flash },
      { key: "chef", label: "Chef", icon: Sparkles, item: pulse.chef_table },
      { key: "anti", label: "Anti-gaspi", icon: BadgePercent, item: pulse.anti_waste },
    ],
    [pulse],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#080604] text-white">
      <section className="relative isolate px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,106,0,0.38),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(250,190,75,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.22),transparent_38%)]" />
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <div className="min-w-0 space-y-6">
            <Badge className="w-fit border-orange-300/40 bg-orange-500/15 text-orange-100">
              <span className={`mr-2 h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-orange-300"}`} />
              TOK Pulse · présence iPhone
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                TOK vit maintenant sur ton écran d’accueil.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-orange-50/78 sm:text-lg">
                Le vrai widget TOK Pulse est une extension WidgetKit de l’<strong className="text-white">app iOS native TOK</strong>.
                Il affiche les signaux utiles de TOK et ouvre directement la bonne expérience.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-2xl bg-orange-500 font-bold text-white hover:bg-orange-600">
                <Link to="/recherche?mode=reservation">Trouver une table</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white/20">
                <Link to="/chefs-table">La Table du Chef</Link>
              </Button>
            </div>

            <div className="grid gap-2 text-sm text-orange-50/78 sm:grid-cols-2">
              {["Petit, moyen et grand format", "Actualisation automatique", "Universal Links vers TOK", "Aucune donnée privée dans le widget"].map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-300"><Check className="h-3 w-3" /></span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -inset-8 -z-10 rounded-full bg-orange-500/15 blur-3xl" />
            <div className="rounded-[2.3rem] border border-orange-300/25 bg-black/55 p-3 shadow-[0_35px_100px_rgba(0,0,0,0.5),0_0_70px_rgba(255,106,0,0.18)] backdrop-blur sm:p-5">
              <div className="rounded-[1.8rem] border border-white/10 bg-gradient-to-br from-[#17120d] via-[#0d0b09] to-[#1b0e05] p-4 sm:p-5">
                <div className="mb-5 flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 font-black text-black shadow-[0_0_30px_rgba(255,106,0,0.5)]">TOK</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-200">TOK Pulse</p>
                    <p className="truncate text-xl font-black sm:text-2xl">Maintenant à {pulse.city}</p>
                  </div>
                  <Badge className="ml-auto shrink-0 bg-emerald-500/15 text-emerald-200">{live ? "Live" : "Fallback"}</Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {cards.map(({ key, label, icon: Icon, item }) => (
                    <Link
                      key={key}
                      to={internalPath(item.url)}
                      className="group min-w-0 rounded-2xl border border-orange-200/15 bg-white/[0.055] p-4 transition hover:-translate-y-0.5 hover:border-orange-300/50 hover:bg-orange-500/10"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/15 text-orange-200"><Icon className="h-4 w-4" /></span>
                        <span className="text-xs font-bold uppercase tracking-[0.17em] text-orange-200/75">{label}</span>
                      </div>
                      <p className="break-words text-xl font-black leading-tight">{item.title}</p>
                      <p className="mt-1 text-sm text-orange-50/62">{item.subtitle}</p>
                      <p className="mt-4 text-xs font-bold text-orange-300">Ouvrir dans TOK →</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="rounded-3xl border border-orange-300/20 bg-white/[0.055] p-6 sm:p-7">
          <div className="mb-4 flex items-center gap-3"><Widgets className="h-6 w-6 text-orange-300" /><h2 className="text-2xl font-black">Ajouter le vrai widget iPhone</h2></div>
          <ol className="space-y-3 text-orange-50/76">
            <li><strong className="text-white">1.</strong> Installe ou mets à jour l’app iOS TOK.</li>
            <li><strong className="text-white">2.</strong> Fais un appui long sur l’écran d’accueil puis touche « Modifier » / « Ajouter un widget ».</li>
            <li><strong className="text-white">3.</strong> Recherche « TOK Pulse », choisis le format puis ajoute-le.</li>
          </ol>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 sm:p-7">
          <div className="mb-4 flex items-center gap-3"><Smartphone className="h-6 w-6 text-orange-300" /><h2 className="text-2xl font-black">Et la PWA Safari ?</h2></div>
          <p className="leading-7 text-orange-50/72">
            Une <strong className="text-white">PWA installée depuis Safari ne peut pas installer une extension WidgetKit</strong>.
            Elle garde l’icône TOK, les notifications web autorisées et les raccourcis web, mais le widget natif appartient à l’app iOS TOK.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge className="bg-white/10 text-orange-100">PWA : raccourcis</Badge>
            <Badge className="bg-orange-500/15 text-orange-100">App native : widgets</Badge>
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <BellRing className="mt-1 h-5 w-5 shrink-0 text-emerald-200" />
            <p className="text-emerald-50/85">
              TOK Pulse n’affiche que des agrégats publics dans le widget. Les réservations, commandes, comptes et données privées restent protégés dans l’app TOK après authentification.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 lg:col-span-2">
          <div className="flex items-center gap-3"><Utensils className="h-5 w-5 text-orange-300" /><p className="font-bold">Dernière donnée Pulse : {live ? new Date(pulse.updated_at).toLocaleString("fr-CH") : "mode de secours"}</p></div>
        </div>
      </section>
    </main>
  );
}
