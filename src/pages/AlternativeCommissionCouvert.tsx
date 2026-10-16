import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  HandCoins,
  LineChart,
  ShieldCheck,
  Table2,
  UsersRound,
} from "lucide-react";

import { B2BTable } from "@/components/restaurateurs/B2BTable";
import { ReservationCostCalculator } from "@/components/restaurateurs/ReservationCostCalculator";
import { Button } from "@/components/ui/button";
import {
  RESERVATION_FLAT_FEE_CHF,
  getFairGrowthPlan,
  type FairGrowthPlanSlug,
} from "@/lib/fairGrowth";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const PAGE_PATH = "/restaurateurs/alternative-commission-couvert";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const comparisonRows = [
  {
    criterion: "Déclencheur du coût",
    tok: "Une table réellement servie = 5 CHF, que la table compte 2 ou 8 personnes.",
    perCover: "Le prix augmente à chaque personne : une table de 6 coûte 6 × la commission annoncée.",
    decision: "Demandez : « combien paie-je si la même table accueille 2, 4 ou 6 personnes ? »",
  },
  {
    criterion: "Prévisibilité",
    tok: "Vous connaissez le coût de chaque table servie avant le service.",
    perCover: "Le total dépend à la fois du nombre de tables et du nombre de personnes à chaque table.",
    decision: "Testez un samedi avec vos grandes tables, pas seulement une petite réservation.",
  },
  {
    criterion: "No-shows et changements",
    tok: "0 CHF si la réservation est annulée ou non honorée ; 5 CHF seulement si la table est servie.",
    perCover: "Vérifiez dans le contrat à quel moment les couverts annulés ou modifiés sont facturés.",
    decision: "Comparez toujours les deux modèles sur les mêmes tables réellement servies.",
  },
  {
    criterion: "Marge",
    tok: "Le coût variable par réservation reste identique ; le pack mensuel est affiché à part.",
    perCover: "Une même réservation peut coûter beaucoup plus dès que le groupe s'agrandit.",
    decision: "Regardez le coût total et le coût par réservation, pas uniquement le prix affiché.",
  },
  {
    criterion: "Décision",
    tok: "La règle de prix est lisible : forfait mensuel + 5 CHF par table réellement servie.",
    perCover: "La règle de prix doit être confirmée : montant par personne, services inclus et conditions d'annulation.",
    decision: "Demandez une simulation écrite avec vos propres volumes avant de changer de canal.",
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
      "TOK facture un forfait de 5.- par réservation honorée, sans plafond, sans distinction de canal et sans dépendre du montant de l'addition.",
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
  return `${value.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`;
}

function clampNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export default function AlternativeCommissionCouvert() {
  const [tablesPerMonth, setTablesPerMonth] = useState(80);
  const [coversPerTable, setCoversPerTable] = useState(3.4);
  const [feePerCover, setFeePerCover] = useState(4);
  const [noShowRate, setNoShowRate] = useState(0);
  const [planSlug, setPlanSlug] = useState<FairGrowthPlanSlug>("starter");

  const simulation = useMemo(() => {
    const tables = clampNumber(tablesPerMonth, 0);
    const covers = clampNumber(coversPerTable, 0);
    const fee = clampNumber(feePerCover, 0);
    const noShows = Math.min(clampNumber(noShowRate, 0), 100) / 100;
    const fairGrowthPlan = getFairGrowthPlan(planSlug);
    const plannedCovers = tables * covers;
    const honoredTables = tables * (1 - noShows);
    const honoredCovers = honoredTables * covers;
    const perCoverCost = honoredCovers * fee;
    const effectiveFeePerTable = RESERVATION_FLAT_FEE_CHF;
    const tokTableCost = honoredTables * effectiveFeePerTable;
    const tokEstimatedCost = tokTableCost + fairGrowthPlan.monthlyPriceChf;

    return {
      plannedCovers,
      honoredTables,
      honoredCovers,
      perCoverCost,
      tokEstimatedCost,
      difference: perCoverCost - tokEstimatedCost,
      acquisitionPerHonoredCover: honoredCovers > 0 ? tokEstimatedCost / honoredCovers : 0,
      effectiveFeePerTable,
      planName: fairGrowthPlan.publicName,
    };
  }, [coversPerTable, feePerCover, noShowRate, planSlug, tablesPerMonth]);

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
      <section className="bg-white px-4 pb-4 pt-8 text-slate-950 md:px-8">
        <div className="mx-auto max-w-[1400px]">
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">Commission par couvert : comparez avant de choisir.</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">Au couvert, vous payez pour chaque personne. Avec TOK, vous payez 5 CHF pour le groupe, en plus de votre abonnement. Même nombre de clients, deux calculs côte à côte.</p>
        </div>
      </section>

      <nav aria-label="Sur cette page" className="border-b bg-orange-50 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-orange-950">
          <a href="#simulation" className="underline underline-offset-4">1. Simuler mon coût</a>
          <a href="#regles" className="underline underline-offset-4">2. Comparer les règles</a>
          <a href="#exemples" className="underline underline-offset-4">3. Voir les exemples</a>
          <Link to="/packs-restaurateur" className="underline underline-offset-4">Détail des packs et conditions</Link>
        </div>
      </nav>
      <ReservationCostCalculator id="simulation" tables={tablesPerMonth} covers={coversPerTable} fee={feePerCover} planSlug={planSlug}
        onTablesChange={setTablesPerMonth} onCoversChange={setCoversPerTable} onFeeChange={setFeePerCover} onPlanChange={(value) => setPlanSlug(value as FairGrowthPlanSlug)}
        noShowRate={noShowRate} onNoShowChange={setNoShowRate}
        costs={{ servedTables: simulation.honoredTables, servedPeople: simulation.honoredCovers, perCoverCost: simulation.perCoverCost, tokTotal: simulation.tokEstimatedCost }} />
      <section className="bg-orange-50 px-4 pb-10 text-slate-950 md:px-8"><details className="mx-auto max-w-[1400px] rounded-xl border border-orange-200 bg-white p-5"><summary className="cursor-pointer font-bold text-orange-900">Voir le détail des calculs et les réservations après absences</summary><div className="mt-5">            <B2BTable caption="Le détail de votre calcul mensuel" columns={["Étape", "Formule avec vos valeurs", "Résultat"]} rows={[
              ["1. Tables servies estimées", `${tablesPerMonth} réservations × (1 − ${noShowRate} / 100)`, simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })],
              ["2. Personnes servies estimées", `${simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} tables × ${coversPerTable} personnes en moyenne`, simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })],
              ["3. Coût du modèle au couvert", `${simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} personnes × ${feePerCover} CHF`, formatChf(simulation.perCoverCost)],
              ["4. Frais TOK des tables", `${simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} tables × 5 CHF`, formatChf(simulation.honoredTables * RESERVATION_FLAT_FEE_CHF)],
              ["5. Abonnement TOK", `Pack ${simulation.planName}, facturation mensuelle`, formatChf(getFairGrowthPlan(planSlug).monthlyPriceChf)],
              ["6. Total TOK", "Frais des tables + abonnement", formatChf(simulation.tokEstimatedCost)],
              ["7. Différence mensuelle", `${formatChf(simulation.perCoverCost)} − ${formatChf(simulation.tokEstimatedCost)}`, `${formatChf(Math.abs(simulation.difference))} ${simulation.difference > 0 ? "de moins avec TOK" : simulation.difference < 0 ? "de plus avec TOK" : ": coûts identiques"}`],
              ["8. Coût TOK par personne", `${formatChf(simulation.tokEstimatedCost)} ÷ personnes servies`, simulation.honoredCovers > 0 ? formatChf(simulation.acquisitionPerHonoredCover) : "Non calculable : aucune personne servie"],
            ]} /><p className="mt-4 text-sm leading-6 text-slate-600">Les deux modèles sont calculés sur les mêmes réservations réellement servies. Une prévision peut donner une fraction de table ou de personne ; les montants sont arrondis au centime à l'affichage. L'abonnement TOK reste dû même sans réservation. Les abonnements éventuels de l'autre service, options et taxes ne sont pas ajoutés. Ce calcul compare des frais, pas votre marge.</p></div></details></section>

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
              <Icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>



      <section id="regles" className="scroll-mt-28 bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Comparatif modèle économique</p>
            <h2 className="text-3xl font-black">Modèle au couvert vs tarif fixe par table.</h2>
            <p className="text-muted-foreground">
              Un couvert est une personne ; une table représente ici une réservation honorée par un groupe. Pour 4 personnes, TOK facture 5 CHF pour la réservation, tandis qu'une commission à 6 CHF par couvert représente 4 × 6 = 24 CHF, avant les éventuels abonnements.
            </p>
          </div>
          <B2BTable caption="Les règles à comparer avant de choisir" columns={["Critère", "Avec TOK", "Au couvert", "À vérifier"]}
            rows={comparisonRows.map((row) => [row.criterion, row.tok, row.perCover, row.decision])} />
        </div>
      </section>

      <section id="exemples" className="scroll-mt-28 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Scénarios chiffrés</p>
            <h2 className="text-3xl font-black">Le même prix par couvert ne raconte pas la même histoire.</h2>
            <p className="text-muted-foreground">
              Même montant par personne, résultat différent : plus une table est grande, plus une commission au couvert augmente. Les exemples utilisent le plan sélectionné et une salle sans no-show.
            </p>
          </div>
          <B2BTable caption={`Exemples mensuels avec le pack ${getFairGrowthPlan(planSlug).publicName}`} columns={["Scénario et hypothèses", "Ventes brutes simulées", "Coût au couvert", "Coût TOK"]}
            rows={scenarioRows.map((scenario) => {
              const plan = getFairGrowthPlan(planSlug);
              return [
                `${scenario.label} : ${scenario.tables} tables servies × ${scenario.covers} personnes ; addition par personne de ${scenario.averageTicket} CHF.`,
                `${scenario.tables} × ${scenario.covers} × ${scenario.averageTicket} = ${formatChf(scenario.tables * scenario.covers * scenario.averageTicket)}`,
                `${scenario.tables} × ${scenario.covers} × ${feePerCover} = ${formatChf(scenario.tables * scenario.covers * feePerCover)}`,
                `${scenario.tables} × 5 + ${plan.monthlyPriceChf} = ${formatChf(scenario.tables * RESERVATION_FLAT_FEE_CHF + plan.monthlyPriceChf)}`,
              ];
            })} />
          <p className="text-sm leading-6 text-muted-foreground">Les ventes brutes ne sont pas un bénéfice : achats, salaires, loyer et autres charges ne sont pas déduits. Ces scénarios utilisent leurs propres volumes, sans annulation ; seuls le pack et la commission par personne suivent votre sélection.</p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {objections.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-6 shadow-sm">
              <Icon className="h-7 w-7 text-orange-600" />
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
              <Link to="/restaurateurs/google-business">Auditer Google Business</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">FAQ comparative</p>
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
