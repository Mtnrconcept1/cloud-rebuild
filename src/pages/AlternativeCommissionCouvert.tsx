import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Clock3,
  HandCoins,
  LineChart,
  Scale,
  ShieldCheck,
  Table2,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const PAGE_PATH = "/restaurateurs/alternative-commission-couvert";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const comparisonRows = [
  {
    criterion: "Déclencheur du coût",
    tok: "Table confirmée, pack choisi et actions réellement activées.",
    perCover: "Chaque couvert déclaré, apporté ou facturé selon le canal.",
    decision: "Comparer le coût avant le service, pas seulement après facturation.",
  },
  {
    criterion: "Prévisibilité",
    tok: "Budget plus stable pour prévoir marge, staff et enveloppe marketing.",
    perCover: "Facture sensible aux groupes, pics de volume et écarts de remplissage.",
    decision: "Vérifier le scénario samedi soir, pas uniquement le jour calme.",
  },
  {
    criterion: "No-shows et changements",
    tok: "Lecture par table honorée, créneau, acompte éventuel et statut client.",
    perCover: "Le coût devient difficile à relire si les couverts changent ou annulent.",
    decision: "Suivre tables honorées, tables perdues et coût par couvert réel.",
  },
  {
    criterion: "Marge",
    tok: "Lecture directe du coût d'acquisition par table et par revenu encaissé.",
    perCover: "La marge baisse vite si le ticket moyen ou la taille des groupes varie.",
    decision: "Comparer coût du canal, ticket moyen et revenu net restaurant.",
  },
  {
    criterion: "Décision",
    tok: "Test progressif par Google Business, page restaurant, campagne ou offre locale.",
    perCover: "Dépendance possible si tout le flux passe par une seule plateforme.",
    decision: "Déplacer du volume seulement quand les conversions sont mesurées.",
  },
];

const scenarioRows = [
  { label: "Table de 2", covers: 2, tables: 80, averageTicket: 38 },
  { label: "Groupe de 6", covers: 6, tables: 35, averageTicket: 52 },
  { label: "Service irrégulier", covers: 3, tables: 55, averageTicket: 31 },
];

const objections = [
  {
    icon: Clock3,
    title: "Et si je remplis surtout certains jours ?",
    body: "Comparez par créneau. Un modèle au couvert peut sembler acceptable un jour calme, puis devenir lourd sur un samedi complet.",
  },
  {
    icon: UsersRound,
    title: "Et si mes tables sont souvent grandes ?",
    body: "Plus le nombre de couverts par table augmente, plus une commission par couvert change vite le coût d'acquisition.",
  },
  {
    icon: AlertTriangle,
    title: "Et si j'ai des no-shows ?",
    body: "La bonne comparaison doit intégrer annulations, paiements, acomptes, confirmation client et temps perdu par l'équipe.",
  },
  {
    icon: LineChart,
    title: "Et si j'ai déjà une plateforme ?",
    body: "TOK peut d'abord servir de canal mesuré : Google Business, page restaurant, actualités, ventes flash ou offres anti-gaspi.",
  },
];

const faqItems = [
  {
    question: "Qu'est-ce qu'une commission par couvert ?",
    answer:
      "C'est un modèle où le coût varie selon le nombre de personnes assises ou apportées par le canal. Il peut vite changer selon les groupes, le ticket moyen et le volume.",
  },
  {
    question: "Pourquoi comparer avec un tarif fixe par table ?",
    answer:
      "Un tarif par table donne au restaurateur une lecture plus prévisible du coût avant le service, surtout quand les couverts varient fortement.",
  },
  {
    question: "Comment intégrer les no-shows dans le calcul ?",
    answer:
      "Il faut comparer le coût du canal, les tables réellement honorées, les annulations, les acomptes éventuels et la capacité perdue pendant le service.",
  },
  {
    question: "TOK doit-il remplacer immédiatement une plateforme existante ?",
    answer:
      "Non. Le restaurateur peut tester TOK sur un canal direct, mesurer le coût d'acquisition et décider ensuite s'il déplace plus de volume.",
  },
];

function formatChf(value: number) {
  return `${Math.round(value).toLocaleString("fr-CH")} CHF`;
}

function clampNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export default function AlternativeCommissionCouvert() {
  const [tablesPerMonth, setTablesPerMonth] = useState(90);
  const [coversPerTable, setCoversPerTable] = useState(2.4);
  const [feePerCover, setFeePerCover] = useState(6);
  const [noShowRate, setNoShowRate] = useState(8);

  const simulation = useMemo(() => {
    const tables = clampNumber(tablesPerMonth, 0);
    const covers = clampNumber(coversPerTable, 0);
    const fee = clampNumber(feePerCover, 0);
    const noShows = Math.min(clampNumber(noShowRate, 0), 100) / 100;
    const plannedCovers = tables * covers;
    const honoredTables = tables * (1 - noShows);
    const honoredCovers = honoredTables * covers;
    const perCoverCost = plannedCovers * fee;
    const tokTableCost = honoredTables * 5;
    const monthlyPack = 149;
    const tokEstimatedCost = tokTableCost + monthlyPack;

    return {
      plannedCovers,
      honoredTables,
      honoredCovers,
      perCoverCost,
      tokEstimatedCost,
      difference: perCoverCost - tokEstimatedCost,
      acquisitionPerHonoredCover: honoredCovers > 0 ? tokEstimatedCost / honoredCovers : 0,
    };
  }, [coversPerTable, feePerCover, noShowRate, tablesPerMonth]);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          name: "Comparatif commission par couvert pour restaurants",
          provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
          areaServed: ["Genève", "Lausanne", "Suisse romande"],
          serviceType: "Comparaison économique entre commission par couvert, coût d'acquisition et tarif fixe par table",
          url: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: `${CANONICAL_ORIGIN}/` },
            {
              "@type": "ListItem",
              position: 2,
              name: "Restaurateurs",
              item: `${CANONICAL_ORIGIN}/restaurateurs/geneve`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: "Alternative commission par couvert",
              item: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
            },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        },
      ],
    }),
    [],
  );

  useSeoMeta({
    title: "Commission par couvert restaurant : alternative et comparatif marge | TOK",
    description:
      "Comparez commission par couvert, no-show, groupes, coût d'acquisition et tarif fixe par table pour choisir un modèle plus prévisible pour votre restaurant.",
    path: PAGE_PATH,
    image: "/fond3.png",
    jsonLd,
  });

  return (
    <main className="bg-background text-foreground">
      <section
        className="relative isolate flex min-h-[76vh] items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-28 text-white md:px-8 lg:px-12"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(5,7,15,0.9), rgba(5,7,15,0.66), rgba(5,7,15,0.18)), url('/fond3.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <Scale className="h-4 w-4 text-orange-300" />
              Commission par couvert · Marge · Prévisibilité
            </div>
            <div className="space-y-5">
              <h1 className="text-4xl font-black leading-[0.98] md:text-6xl">
                Commission par couvert : comparez avant de choisir.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                Une commission par couvert peut sembler simple, mais elle change avec les groupes, les no-shows, le
                ticket moyen et le volume. TOK vous aide à lire le coût d'acquisition avant de déplacer vos ventes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-[#ff5a00] text-[#111827] hover:bg-[#f45100]">
                <Link to="/contact">
                  Demander une comparaison
                  <Calculator className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/restaurateurs/geneve">
                  Voir la solution complète
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/14 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
            <MetricDark label="Couverts prévus" value={Math.round(simulation.plannedCovers).toLocaleString("fr-CH")} />
            <MetricDark label="Tables honorées" value={Math.round(simulation.honoredTables).toLocaleString("fr-CH")} />
            <MetricDark label="Modèle au couvert" value={formatChf(simulation.perCoverCost)} />
            <MetricDark label="Écart estimé" value={formatChf(simulation.difference)} accent />
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-14 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            {
              icon: HandCoins,
              title: "Coût d'acquisition",
              body: "Ramenez chaque canal à un coût par table, par couvert honoré et par franc de chiffre d'affaires.",
            },
            {
              icon: ShieldCheck,
              title: "Marge prévisible",
              body: "Comparez le coût avant d'ouvrir un nouveau canal plutôt que de découvrir la facture après le service.",
            },
            {
              icon: Table2,
              title: "Scénarios de salle",
              body: "La bonne décision dépend des groupes, no-shows, tickets moyens, créneaux pleins et créneaux faibles.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-700" />
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Simulation économique</p>
            <h2 className="text-3xl font-black md:text-4xl">Intégrez les no-shows et les couverts réels.</h2>
            <p className="text-muted-foreground">
              Le but n'est pas de promettre une économie automatique. Le bon comparatif met côte à côte coût variable,
              tables honorées, pack, marge et coût d'acquisition.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="tables-per-month" label="Tables prévues par mois" value={tablesPerMonth} onChange={setTablesPerMonth} />
              <NumberField id="covers-per-table" label="Couverts par table" value={coversPerTable} onChange={setCoversPerTable} step={0.1} />
              <NumberField id="fee-per-cover" label="Commission par couvert" value={feePerCover} onChange={setFeePerCover} step={0.1} />
              <NumberField id="no-show-rate" label="No-show / annulations (%)" value={noShowRate} onChange={setNoShowRate} />
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <MetricDark label="Tables honorées" value={Math.round(simulation.honoredTables).toLocaleString("fr-CH")} />
              <MetricDark label="Couverts honorés" value={Math.round(simulation.honoredCovers).toLocaleString("fr-CH")} />
              <MetricDark label="Coût au couvert" value={formatChf(simulation.perCoverCost)} />
              <MetricDark label="Estimation TOK" value={formatChf(simulation.tokEstimatedCost)} />
              <MetricDark
                label="Coût TOK / couvert honoré"
                value={`${simulation.acquisitionPerHonoredCover.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`}
                accent
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Comparatif modèle économique</p>
            <h2 className="text-3xl font-black">Modèle au couvert vs tarif fixe par table.</h2>
            <p className="text-muted-foreground">
              Cette page doit répondre aux objections financières : pas de répétition de la page Google, mais une lecture
              claire de la marge, des no-shows et de la prévisibilité.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="grid bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white md:grid-cols-[0.75fr_1fr_1fr_1fr]">
              <span>Critère</span>
              <span>Lecture TOK</span>
              <span>Commission par couvert</span>
              <span>Question à trancher</span>
            </div>
            {comparisonRows.map((row) => (
              <div
                key={row.criterion}
                className="grid gap-2 border-t p-4 text-sm md:grid-cols-[0.75fr_1fr_1fr_1fr] md:gap-3"
              >
                <p className="font-bold text-slate-950">{row.criterion}</p>
                <p className="leading-6 text-emerald-700">{row.tok}</p>
                <p className="leading-6 text-muted-foreground">{row.perCover}</p>
                <p className="leading-6 text-orange-700">{row.decision}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Scénarios chiffrés</p>
            <h2 className="text-3xl font-black">Le même prix par couvert ne raconte pas la même histoire.</h2>
            <p className="text-muted-foreground">
              Les scénarios ci-dessous montrent pourquoi le restaurateur doit comparer par situation de salle.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {scenarioRows.map((scenario) => {
              const monthlyRevenue = scenario.tables * scenario.covers * scenario.averageTicket;
              const variableCost = scenario.tables * scenario.covers * feePerCover;
              const tableCost = scenario.tables * 5 + 149;
              return (
                <article key={scenario.label} className="rounded-lg border bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-bold">{scenario.label}</h3>
                  <div className="mt-4 grid gap-3 text-sm">
                    <ScenarioMetric label="CA potentiel" value={formatChf(monthlyRevenue)} />
                    <ScenarioMetric label="Commission au couvert" value={formatChf(variableCost)} />
                    <ScenarioMetric label="Estimation table + pack" value={formatChf(tableCost)} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {objections.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-6 shadow-sm">
              <Icon className="h-7 w-7 text-orange-700" />
              <h2 className="mt-5 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Décision mesurée</p>
            <h2 className="text-3xl font-black md:text-4xl">Comparez vos coûts avant de changer d'outil.</h2>
            <p className="text-white/72">
              Commencez par un canal mesuré : fiche Google, page restaurant, actualités sponsorisées, ventes flash ou
              offres anti-gaspi. La décision se prend ensuite sur des conversions visibles.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[#ff5a00] text-[#111827] hover:bg-[#f45100]">
              <Link to="/contact">
                Parler à TOK
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link to="/restaurateurs/google-business">Auditer Google Business</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">FAQ comparative</p>
            <h2 className="text-3xl font-black">Questions fréquentes sur les commissions par couvert</h2>
          </div>
          <div className="grid gap-3">
            {faqItems.map((item) => (
              <article key={item.question} className="rounded-lg border bg-white p-5 shadow-sm">
                <h3 className="font-bold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </article>
            ))}
          </div>
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
        min={0}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(clampNumber(Number(event.target.value), 0))}
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

function ScenarioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}
