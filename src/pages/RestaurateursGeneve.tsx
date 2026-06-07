import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgePercent, Camera, CheckCircle2, Clock3, LineChart, PhoneCall, ShieldCheck, Sparkles, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PACKS = {
  starter: { label: "Starter", monthlyFee: 0, aiPhotos: 10 },
  croissance: { label: "Croissance", monthlyFee: 149, aiPhotos: 30 },
  premium: { label: "Premium", monthlyFee: 349, aiPhotos: 80 },
} as const;

type PackKey = keyof typeof PACKS;

const comparisonRows = [
  ["Commission", "5 CHF/table + packs", "Commission élevée par commande"],
  ["Contrôle client", "Données et relation restaurant", "Relation souvent captée"],
  ["Photos", "Photos IA et retouche guidée", "Visuels à gérer seul"],
  ["Offres", "Heures creuses, anti-gaspi, ventes flash", "Promos peu pilotées"],
  ["Pilotage", "Marge, Miamz, campagnes, réservations", "Reporting fragmenté"],
];

const leadNeeds = [
  "Remplir les tables creuses",
  "Améliorer les photos",
  "Lancer les réservations",
  "Vendre des offres",
  "Structurer le marketing",
];

export default function RestaurateursGeneve() {
  const [tablesPerMonth, setTablesPerMonth] = useState(120);
  const [averageTicket, setAverageTicket] = useState(42);
  const [pack, setPack] = useState<PackKey>("croissance");
  const [marketingCost, setMarketingCost] = useState(600);

  const simulation = useMemo(() => {
    const packConfig = PACKS[pack];
    const revenue = tablesPerMonth * averageTicket;
    const tokFees = tablesPerMonth * 5 + packConfig.monthlyFee;
    const availableMarketing = revenue * 0.6;
    const estimatedMarginAfterTok = revenue - tokFees - marketingCost;

    return {
      packConfig,
      revenue,
      tokFees,
      availableMarketing,
      estimatedMarginAfterTok,
    };
  }, [averageTicket, marketingCost, pack, tablesPerMonth]);

  const demoSubject = encodeURIComponent("Demande de démo restaurateur TOK Genève");
  const demoBody = encodeURIComponent([
    "Bonjour TOK,",
    "",
    "Je souhaite organiser une démo restaurateur.",
    "",
    "Restaurant :",
    "Ville : Genève",
    "Téléphone :",
    "Email :",
    "Nombre de tables :",
    "Besoin principal :",
  ].join("\n"));

  return (
    <main className="bg-background text-foreground">
      <section
        className="relative isolate flex min-h-[78vh] items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-28 text-white md:px-8 lg:px-12"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(5,7,15,0.88), rgba(5,7,15,0.62), rgba(5,7,15,0.16)), url('/fond3.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <Sparkles className="h-4 w-4 text-orange-300" />
              Genève · Réservations · Offres · Photos IA
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-[0.98] md:text-6xl">
                Remplissez vos tables sans exploser vos commissions.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                TOK aide les restaurants genevois à capter les réservations, remplir les heures creuses,
                améliorer leurs photos et piloter leurs offres sans céder leur marge aux plateformes classiques.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${demoSubject}&body=${demoBody}`}>
                  Demander une démo
                  <PhoneCall className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link to="/packs-restaurateur">
                  Voir les packs
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/14 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
            {[
              ["5 CHF/table", "Modèle lisible, conçu pour garder votre marge."],
              ["60 % marketing", "Budget plafonné sur le CA encaissé, pas sur des promesses."],
              ["Photos IA", `${simulation.packConfig.aiPhotos} visuels inclus avec le pack ${simulation.packConfig.label}.`],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl bg-white/12 p-4">
                <p className="text-lg font-bold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-white/78">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            { icon: Clock3, title: "Zéro attente", body: "Précommande et rotation plus fluide quand la salle se remplit." },
            { icon: BadgePercent, title: "Offres heures creuses", body: "Mardi midi, dimanche soir, fin de service : chaque créneau peut devenir utile." },
            { icon: ShieldCheck, title: "Marge protégée", body: "TOK privilégie le revenu encaissé, la traçabilité et les plafonds de coûts." },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulateur de marge</p>
            <h2 className="text-3xl font-black md:text-4xl">Combien une salle mieux remplie peut rapporter ?</h2>
            <p className="text-muted-foreground">
              Ajustez les volumes pour visualiser le revenu estimé, les frais TOK et l'enveloppe marketing maximale de 60 %.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tables">Nombre de tables par mois</Label>
                <Input id="tables" type="number" min={0} value={tablesPerMonth} onChange={(event) => setTablesPerMonth(Number(event.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket">Ticket moyen par table</Label>
                <Input id="ticket" type="number" min={0} value={averageTicket} onChange={(event) => setAverageTicket(Number(event.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>Pack</Label>
                <Select value={pack} onValueChange={(value) => setPack(value as PackKey)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PACKS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="marketing">Coût marketing mensuel</Label>
                <Input id="marketing" type="number" min={0} value={marketingCost} onChange={(event) => setMarketingCost(Number(event.target.value) || 0)} />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <Metric label="Revenu estimé" value={`${simulation.revenue.toLocaleString("fr-CH")} CHF`} />
              <Metric label="Frais TOK" value={`${simulation.tokFees.toLocaleString("fr-CH")} CHF`} />
              <Metric label="Marketing autorisé" value={`${Math.round(simulation.availableMarketing).toLocaleString("fr-CH")} CHF`} />
              <Metric label="Marge après TOK + marketing" value={`${Math.round(simulation.estimatedMarginAfterTok).toLocaleString("fr-CH")} CHF`} accent />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">TOK vs plateformes classiques</p>
            <h2 className="text-3xl font-black">Plus de contrôle, moins de dépendance.</h2>
          </div>
          <div className="overflow-hidden rounded-lg border bg-white">
            {comparisonRows.map(([label, tok, classic]) => (
              <div key={label} className="grid grid-cols-[120px_1fr_1fr] gap-3 border-b p-4 text-sm last:border-b-0 md:grid-cols-[160px_1fr_1fr]">
                <p className="font-bold">{label}</p>
                <p className="text-emerald-700">{tok}</p>
                <p className="text-muted-foreground">{classic}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            { icon: Camera, title: "Photos IA", body: "Retouches de plats, cohérence visuelle et quotas par pack pour limiter les coûts." },
            { icon: Table2, title: "Réservations", body: "5 CHF/table, suivi clair, activation rapide et données restaurant exploitables." },
            { icon: LineChart, title: "Pilotage business", body: "CA encaissé, marketing autorisé, commissions commerciales et coûts IA visibles." },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-white p-6 shadow-sm">
              <Icon className="h-7 w-7 text-orange-600" />
              <h2 className="mt-5 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_520px]">
          <div className="space-y-5">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Démo restaurateur</p>
            <h2 className="text-3xl font-black md:text-4xl">On prépare votre plan d'activation Genève.</h2>
            <p className="max-w-2xl text-white/72">
              Le formulaire sert à cadrer la démo. Pour l'instant, il prépare un email avec les informations utiles
              afin d'éviter une écriture publique non contrôlée en base.
            </p>
            <ul className="grid gap-3 text-sm text-white/82">
              {["Nouveau", "Contacté", "Démo", "Signé", "Activé", "Perdu"].map((status) => (
                <li key={status} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-orange-300" />
                  Statut CRM : {status}
                </li>
              ))}
            </ul>
          </div>

          <form className="grid gap-4 rounded-lg border border-white/12 bg-white p-5 text-slate-950 shadow-2xl" action={`mailto:contact@thetok.ch?subject=${demoSubject}`} method="post" encType="text/plain">
            <div className="grid gap-2">
              <Label htmlFor="restaurant-name">Nom du restaurant</Label>
              <Input id="restaurant-name" name="restaurant" placeholder="Restaurant du Rhône" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" name="ville" defaultValue="Genève" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="table-count">Nombre de tables</Label>
                <Input id="table-count" name="tables" type="number" min={0} placeholder="24" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" name="telephone" type="tel" placeholder="+41 ..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="contact@restaurant.ch" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="need">Besoin principal</Label>
              <Select name="besoin">
                <SelectTrigger id="need">
                  <SelectValue placeholder="Choisir un besoin" />
                </SelectTrigger>
                <SelectContent>
                  {leadNeeds.map((need) => (
                    <SelectItem key={need} value={need}>{need}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message">Contexte</Label>
              <Textarea id="message" name="message" placeholder="Horaires creux, objectifs, contraintes d'équipe..." />
            </div>
            <Button type="submit" className="bg-orange-500 text-white hover:bg-orange-600">
              Demander une démo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white/8 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/56">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-orange-300" : ""}`}>{value}</p>
    </div>
  );
}
