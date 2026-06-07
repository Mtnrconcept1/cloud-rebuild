import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  LineChart,
  Scale,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const PAGE_PATH = "/restaurateurs/alternative-commission-couvert";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const comparisonRows = [
  ["Facturation", "Tarif fixe par table et packs optionnels", "Coût variable lié au nombre de couverts"],
  ["Prévisibilité", "Budget plus lisible avant le service", "Facture sensible au volume et aux no-shows"],
  ["Relation client", "Données utiles pour relancer et fidéliser", "Relation parfois captée par la plateforme"],
  ["Activation", "Offres, actualités, photos et réservations dans un même outil", "Outils souvent séparés"],
];

const safeguards = [
  "Comparez vos coûts avant de changer d'outil",
  "Gardez une page restaurateur, des actualités et des offres pilotables",
  "Testez un canal local sans couper vos canaux existants",
];

function formatChf(value: number) {
  return `${Math.round(value).toLocaleString("fr-CH")} CHF`;
}

function clampNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-b border-white/12 pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">{label}</p>
      <p className={accent ? "mt-1 text-2xl font-black text-emerald-300" : "mt-1 text-xl font-bold text-white"}>
        {value}
      </p>
    </div>
  );
}

export default function AlternativeCommissionCouvert() {
  const [tablesPerMonth, setTablesPerMonth] = useState(90);
  const [coversPerTable, setCoversPerTable] = useState(2.4);
  const [feePerCover, setFeePerCover] = useState(6);

  const simulation = useMemo(() => {
    const tables = clampNumber(tablesPerMonth, 0);
    const covers = clampNumber(coversPerTable, 0);
    const fee = clampNumber(feePerCover, 0);
    const totalCovers = tables * covers;
    const perCoverCost = totalCovers * fee;
    const tokTableCost = tables * 5;
    const monthlyPack = 149;
    const tokEstimatedCost = tokTableCost + monthlyPack;

    return {
      totalCovers,
      perCoverCost,
      tokEstimatedCost,
      difference: perCoverCost - tokEstimatedCost,
    };
  }, [coversPerTable, feePerCover, tablesPerMonth]);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          name: "Alternative aux commissions par couvert pour restaurants",
          provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
          areaServed: ["Genève", "Lausanne", "Suisse romande"],
          serviceType: "Réservation restaurant, marketing local et outils restaurateur",
          url: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Accueil",
              item: `${CANONICAL_ORIGIN}/`,
            },
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
          mainEntity: [
            {
              "@type": "Question",
              name: "TOK remplace-t-il immédiatement une plateforme existante ?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Non. TOK peut être testé comme canal complémentaire pour comparer les coûts, les réservations et la relation client avant toute décision opérationnelle.",
              },
            },
            {
              "@type": "Question",
              name: "Pourquoi comparer le coût par couvert ?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Un modèle facturé au couvert varie avec le volume. Un tarif fixe par table permet au restaurant de simuler plus tôt son budget et l'impact sur sa marge.",
              },
            },
          ],
        },
      ],
    }),
    [],
  );

  useSeoMeta({
    title: "Alternative aux commissions par couvert pour restaurants | TOK",
    description:
      "Comparez les modèles facturés au couvert avec TOK, une alternative lisible pour les restaurants qui veulent protéger leur marge, remplir leurs tables et garder la relation client.",
    path: PAGE_PATH,
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
              Modèle par couvert vs tarif fixe par table
            </div>
            <div className="space-y-5">
              <h1 className="text-4xl font-black leading-[0.98] md:text-6xl">
                Alternative aux commissions par couvert pour restaurants
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                TOK aide les restaurateurs à comparer les modèles facturés au couvert avec une approche plus
                prévisible: réservations, actualités, offres locales et relation client dans un même espace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
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
                  Voir l'offre restaurateur
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/14 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
            {safeguards.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-md bg-white/12 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <p className="text-sm leading-6 text-white/84">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-14 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            {
              icon: HandCoins,
              title: "Coût lisible",
              body: "Simulez l'écart entre un prix par couvert et un tarif par table avant de changer vos habitudes.",
            },
            {
              icon: ClipboardCheck,
              title: "Canal complémentaire",
              body: "Ajoutez TOK sans couper vos canaux existants, puis mesurez ce qui apporte réellement des clients.",
            },
            {
              icon: ShieldCheck,
              title: "Marge protégée",
              body: "Gardez le contrôle sur vos offres, vos actualités et votre relation client en Suisse romande.",
            },
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
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulation rapide</p>
            <h2 className="text-3xl font-black md:text-4xl">Comparez le coût mensuel avant de décider.</h2>
            <p className="text-muted-foreground">
              Ce simulateur donne un ordre de grandeur commercial. Le coût réel dépend du pack choisi, du volume,
              des offres activées et de vos conditions contractuelles.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tables-per-month">Tables par mois</Label>
                <Input
                  id="tables-per-month"
                  min={0}
                  type="number"
                  value={tablesPerMonth}
                  onChange={(event) => setTablesPerMonth(clampNumber(Number(event.target.value), 0))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="covers-per-table">Couverts par table</Label>
                <Input
                  id="covers-per-table"
                  min={0}
                  step="0.1"
                  type="number"
                  value={coversPerTable}
                  onChange={(event) => setCoversPerTable(clampNumber(Number(event.target.value), 0))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fee-per-cover">Prix par couvert</Label>
                <Input
                  id="fee-per-cover"
                  min={0}
                  type="number"
                  value={feePerCover}
                  onChange={(event) => setFeePerCover(clampNumber(Number(event.target.value), 0))}
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <Metric label="Couverts estimés" value={Math.round(simulation.totalCovers).toLocaleString("fr-CH")} />
              <Metric label="Modèle par couvert" value={formatChf(simulation.perCoverCost)} />
              <Metric label="Estimation TOK" value={formatChf(simulation.tokEstimatedCost)} />
              <Metric label="Écart estimé" value={formatChf(simulation.difference)} accent />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Comparaison restaurateur</p>
            <h2 className="text-3xl font-black">Modèle par couvert vs tarif fixe par table</h2>
            <p className="text-muted-foreground">
              L'objectif n'est pas de promettre une bascule immédiate. TOK donne au restaurant un cadre pour mesurer
              le coût, la visibilité et la qualité de la relation client.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-white">
            {comparisonRows.map(([label, tok, classic]) => (
              <div
                key={label}
                className="grid gap-2 border-b p-4 text-sm last:border-b-0 md:grid-cols-[160px_1fr_1fr] md:gap-3"
              >
                <p className="font-bold">{label}</p>
                <p className="text-emerald-700">{tok}</p>
                <p className="text-muted-foreground md:block">{classic}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            {
              icon: Table2,
              title: "Réservations",
              body: "Page publique, disponibilité, demandes client et suivi restaurateur dans le dashboard.",
            },
            {
              icon: LineChart,
              title: "Offres et actualités",
              body: "Ventes flash, anti-gaspi, posts restaurant et activations locales pour remplir les périodes calmes.",
            },
            {
              icon: Calculator,
              title: "Pilotage",
              body: "Lecture du coût d'acquisition, du volume de tables et du potentiel de réactivation client.",
            },
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
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Décision mesurée</p>
            <h2 className="text-3xl font-black md:text-4xl">Comparez vos coûts avant de changer d'outil</h2>
            <p className="text-white/72">
              Un restaurateur peut commencer par une comparaison, une page publique et quelques offres ciblées.
              La décision de déplacer du volume se prend ensuite sur des données visibles.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
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
              <Link to="/packs-restaurateur">Voir les packs</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
