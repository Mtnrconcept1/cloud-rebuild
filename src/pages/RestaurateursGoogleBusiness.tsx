import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  ExternalLink,
  LineChart,
  MousePointerClick,
  SearchCheck,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateGoogleBusinessSavings } from "@/lib/googleBusinessEconomics";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const guideSteps = [
  "Auditez le bouton actuel de votre fiche Google Business.",
  "Comparez le coût d'un modèle par couvert avec un tarif fixe par table.",
  "Préparez votre lien TOK de réservation, commande ou demande de table.",
  "Remplacez le bouton de réservation Google par votre lien TOK quand vous êtes prêt.",
  "Suivez les tables générées et l'économie réalisée mois après mois.",
];

const proofPoints = [
  {
    icon: SearchCheck,
    title: "Vos clients vous trouvent déjà sur Google",
    body: "TOK vous aide à convertir cette intention en réservation directe, sans perdre la relation client.",
  },
  {
    icon: Table2,
    title: "5 CHF par table",
    body: "Le tarif fixe reste lisible, quel que soit le nombre de couverts assis à la table.",
  },
  {
    icon: LineChart,
    title: "Économie mesurable",
    body: "Le simulateur montre le coût mensuel estimé, le coût TOK et l'écart à documenter dans le CRM.",
  },
];

function formatChf(value: number) {
  return `${Math.round(value).toLocaleString("fr-CH")} CHF`;
}

export default function RestaurateursGoogleBusiness() {
  const [monthlyTables, setMonthlyTables] = useState(120);
  const [coversPerTable, setCoversPerTable] = useState(3);
  const [commissionPerCover, setCommissionPerCover] = useState(6.2);
  const [packFee, setPackFee] = useState(149);

  const simulation = useMemo(
    () =>
      calculateGoogleBusinessSavings({
        monthlyTables,
        coversPerTable,
        commissionPerCoverChf: commissionPerCover,
        tokFeePerTableChf: 5,
        monthlyPackFeeChf: packFee,
      }),
    [commissionPerCover, coversPerTable, monthlyTables, packFee],
  );

  useSeoMeta({
    title: "Remplacer le bouton Google Business par TOK | Restaurants Genève",
    description:
      "Comparez un modèle de réservation facturé au couvert avec le modèle TOK à 5 CHF par table, puis préparez l'audit de votre fiche Google Business.",
    path: "/restaurateurs/google-business",
    image: "/fond3.png",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Audit Google Business pour restaurants",
      provider: { "@type": "Organization", name: "TOK", url: "https://www.thetok.ch" },
      areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
      serviceType: "Audit du bouton de réservation Google Business et comparaison de coûts",
    },
  });

  const auditSubject = encodeURIComponent("Audit gratuit de ma fiche Google Business");
  const auditBody = encodeURIComponent(
    [
      "Bonjour TOK,",
      "",
      "Je souhaite auditer le bouton de réservation de ma fiche Google Business.",
      "",
      `Tables par mois estimées : ${monthlyTables}`,
      `Couverts par table : ${coversPerTable}`,
      `Commission par couvert comparée : ${commissionPerCover} CHF`,
      `Pack TOK estimé : ${packFee} CHF/mois`,
      `Économie mensuelle estimée : ${formatChf(simulation.monthlySavingsChf)}`,
      "",
      "Restaurant :",
      "Lien fiche Google :",
      "Bouton actuel : TheFork / autre plateforme / site propre / aucun",
      "Téléphone :",
      "Email :",
    ].join("\n"),
  );

  return (
    <main className="bg-white text-slate-950">
      <section
        className="relative isolate flex min-h-[76vh] items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-28 text-white md:px-8 lg:px-12"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(5,7,15,0.9), rgba(5,7,15,0.64), rgba(5,7,15,0.18)), url('/fond3.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <SearchCheck className="h-4 w-4 text-orange-300" />
              Google Business · Réservation directe · Genève
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-[0.98] md:text-6xl">
                Remplacer le bouton de réservation Google Business.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/80 md:text-lg">
                Vos clients vous cherchent déjà sur Google. Comparez un modèle de commission par couvert avec TOK:
                5 CHF par table, une relation client plus directe et un suivi clair des réservations générées.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
                  Audit gratuit de ma fiche Google
                  <ExternalLink className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Link to="/restaurateurs/geneve">
                  Voir l'offre restaurateur
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-md">
            <MetricDark label="Modèle par couvert" value={formatChf(simulation.perCoverModelCostChf)} />
            <MetricDark label="TOK 5 CHF/table + pack" value={formatChf(simulation.tokModelCostChf)} />
            <MetricDark
              label={simulation.isTokCheaper ? "Économie mensuelle estimée" : "Écart mensuel estimé"}
              value={formatChf(Math.abs(simulation.monthlySavingsChf))}
              accent={simulation.isTokCheaper}
            />
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {proofPoints.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-white p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulateur Google Business</p>
            <h2 className="text-3xl font-black md:text-4xl">Modèle par couvert vs tarif fixe par table.</h2>
            <p className="text-slate-600">
              Entrez vos hypothèses terrain. Le résultat sert à cadrer l'audit commercial, pas à affirmer le prix exact d'un fournisseur externe.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="tables" label="Tables générées par mois" value={monthlyTables} onChange={setMonthlyTables} />
              <NumberField id="covers" label="Couverts moyens par table" value={coversPerTable} onChange={setCoversPerTable} step={0.5} />
              <NumberField id="commission" label="Commission par couvert comparée" value={commissionPerCover} onChange={setCommissionPerCover} step={0.1} />
              <NumberField id="pack" label="Pack TOK mensuel" value={packFee} onChange={setPackFee} />
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <MetricDark label="Couverts mensuels" value={simulation.monthlyCovers.toLocaleString("fr-CH")} />
              <MetricDark label="Coût au couvert" value={formatChf(simulation.perCoverModelCostChf)} />
              <MetricDark label="Coût TOK" value={formatChf(simulation.tokModelCostChf)} />
              <MetricDark label="Coût TOK / couvert" value={`${simulation.tokEffectiveCostPerCoverChf.toLocaleString("fr-CH")} CHF`} />
              <MetricDark label="Économie annuelle" value={formatChf(simulation.annualSavingsChf)} accent={simulation.isTokCheaper} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Guide de bascule</p>
            <h2 className="text-3xl font-black">Changer sans perdre le contrôle.</h2>
            <p className="text-slate-600">
              TOK doit documenter le lien actuel, la source des réservations et la date de changement du bouton Google Business.
            </p>
          </div>
          <ol className="grid gap-3">
            {guideSteps.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-lg border bg-white p-4 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            { icon: MousePointerClick, title: "Bouton actuel", body: "TheFork, autre plateforme, site propre ou aucun: le CRM doit garder la source." },
            { icon: BadgePercent, title: "Écart de coût", body: "Le commercial peut montrer l'économie estimée sur 30 jours et 12 mois." },
            { icon: ShieldCheck, title: "Formulation prudente", body: "TOK compare des modèles de facturation, sans attaque ni promesse non vérifiée." },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-white p-6 shadow-sm">
              <Icon className="h-7 w-7 text-orange-600" />
              <h2 className="mt-5 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Audit gratuit</p>
            <h2 className="text-3xl font-black">Vous voulez comparer votre bouton actuel ?</h2>
            <p className="max-w-2xl text-sm leading-6 text-white/70">
              Envoyez votre fiche Google, votre lien de réservation actuel et vos volumes estimés. TOK prépare un diagnostic exploitable par le commercial.
            </p>
          </div>
          <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
            <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
              Lancer l'audit
              <CheckCircle2 className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}

function MetricDark({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-white/10 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-orange-300" : ""}`}>{value}</p>
    </div>
  );
}
