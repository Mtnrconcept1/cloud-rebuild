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

import { B2BTable } from "@/components/restaurateurs/B2BTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FAIR_GROWTH_PLANS,
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
  const [tablesPerMonth, setTablesPerMonth] = useState(90);
  const [coversPerTable, setCoversPerTable] = useState(2.4);
  const [feePerCover, setFeePerCover] = useState(6);
  const [noShowRate, setNoShowRate] = useState(8);
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
      <section
        className="relative isolate flex items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-16 text-white md:px-8 lg:px-12"
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
              <h1 className="text-4xl font-black leading-tight md:text-5xl">
                Commission par couvert : comparez avant de choisir.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                La différence est simple : une commission au couvert multiplie le prix par le nombre de personnes ;
                TOK facture 5 CHF pour une table réellement servie, quel que soit le nombre de convives. Comparez
                ensuite les deux modèles sur le même nombre de réservations honorées.
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
                  Voir la solution complète
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/14 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
            <p className="text-sm leading-6 text-white/80">Exemple modifiable ci-dessous : {tablesPerMonth} réservations prévues par mois, {noShowRate} % d'annulations ou d'absences.</p>
            <MetricDark label="Tables servies estimées" value={simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} />
            <MetricDark label="Personnes servies estimées" value={simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} />
            <MetricDark label="Coût au couvert" value={formatChf(simulation.perCoverCost)} />
            <MetricDark label={simulation.difference >= 0 ? "Coût en moins avec TOK / mois" : "Coût en plus avec TOK / mois"} value={formatChf(Math.abs(simulation.difference))} accent />
          </div>
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

      <section id="simulation" className="scroll-mt-28 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulation économique</p>
            <h2 className="text-3xl font-black md:text-4xl">Comparez votre coût mensuel, étape par étape.</h2>
            <p className="text-muted-foreground">
              Entrez vos chiffres. Les deux modèles sont calculés sur les mêmes réservations réellement servies :
              les annulations et les absences (no-shows) sont retirées dans les deux modèles. Les valeurs initiales sont un exemple, pas vos résultats réels.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comparison-plan">Abonnement TOK</Label>
                <Select value={planSlug} onValueChange={(value) => setPlanSlug(value as FairGrowthPlanSlug)}>
                  <SelectTrigger id="comparison-plan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FAIR_GROWTH_PLANS.map((plan) => (
                      <SelectItem key={plan.slug} value={plan.slug}>{plan.publicName} · CHF {plan.monthlyPriceChf}/mois</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField id="tables-per-month" label="Réservations attendues / mois" value={tablesPerMonth} onChange={setTablesPerMonth} />
              <NumberField id="covers-per-table" label="Personnes moyennes par réservation" value={coversPerTable} onChange={setCoversPerTable} step={0.1} />
              <NumberField id="fee-per-cover" label="Commission comparée par personne (CHF)" value={feePerCover} onChange={setFeePerCover} step={0.1} />
              <NumberField id="no-show-rate" label="Annulations ou absences (%)" value={noShowRate} onChange={setNoShowRate} max={100} />
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <MetricDark label="1. Tables servies estimées" value={simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} />
              <MetricDark label="2. Personnes servies estimées" value={simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} />
              <MetricDark label="3. Modèle au couvert" value={formatChf(simulation.perCoverCost)} />
              <MetricDark label={"4. TOK · " + simulation.planName} value={formatChf(simulation.tokEstimatedCost)} />
              <MetricDark label="Forfait TOK / table servie" value={simulation.effectiveFeePerTable.toLocaleString("fr-CH", { maximumFractionDigits: 2 }) + " CHF"} />
              <p className="rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-white/75">
                Au couvert : {simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} personnes × {feePerCover.toLocaleString("fr-CH")} CHF.
                <br />
                TOK : {simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} tables × 5 CHF + pack {simulation.planName}.
              </p>
              <MetricDark
                label="Coût TOK par personne servie"
                value={simulation.honoredCovers > 0 ? `${simulation.acquisitionPerHonoredCover.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF` : "Non calculable : aucune personne"}
                accent
              />
            </div>
          </div>
          <div className="space-y-4 lg:col-span-2" aria-live="polite" aria-atomic="true">
            <B2BTable caption="Le détail de votre calcul mensuel" columns={["Étape", "Formule avec vos valeurs", "Résultat"]} rows={[
              ["1. Tables servies estimées", `${tablesPerMonth} réservations × (1 − ${noShowRate} / 100)`, simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })],
              ["2. Personnes servies estimées", `${simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} tables × ${coversPerTable} personnes en moyenne`, simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })],
              ["3. Coût du modèle au couvert", `${simulation.honoredCovers.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} personnes × ${feePerCover} CHF`, formatChf(simulation.perCoverCost)],
              ["4. Frais TOK des tables", `${simulation.honoredTables.toLocaleString("fr-CH", { maximumFractionDigits: 4 })} tables × 5 CHF`, formatChf(simulation.honoredTables * RESERVATION_FLAT_FEE_CHF)],
              ["5. Abonnement TOK", `Pack ${simulation.planName}, facturation mensuelle`, formatChf(getFairGrowthPlan(planSlug).monthlyPriceChf)],
              ["6. Total TOK", "Frais des tables + abonnement", formatChf(simulation.tokEstimatedCost)],
              ["7. Différence mensuelle", `${formatChf(simulation.perCoverCost)} − ${formatChf(simulation.tokEstimatedCost)}`, `${formatChf(Math.abs(simulation.difference))} ${simulation.difference > 0 ? "de moins avec TOK" : simulation.difference < 0 ? "de plus avec TOK" : ": coûts identiques"}`],
              ["8. Coût TOK par personne", `${formatChf(simulation.tokEstimatedCost)} ÷ personnes servies`, simulation.honoredCovers > 0 ? formatChf(simulation.acquisitionPerHonoredCover) : "Non calculable : aucune personne servie"],
            ]} />
            <p className="text-sm leading-6 text-muted-foreground">Une prévision peut donner une fraction de table ou de personne : par exemple, 90 réservations avec 8 % d'absences donnent 82,8 tables attendues. Les calculs conservent les décimales ; les montants affichés sont arrondis au centime. La facturation réelle porte sur les réservations effectivement honorées.</p>
            <p className="text-sm leading-6 text-muted-foreground">La commission saisie est votre hypothèse de comparaison, pas un tarif concurrent vérifié. Le modèle au couvert exclut tout abonnement concurrent. Les options, taxes et autres frais éventuels ne sont pas ajoutés à cette simulation : comparez les devis sur une même base. L'abonnement TOK reste dû même si aucune table n'est servie. Ce calcul compare des frais de réservation, pas votre marge.</p>
          </div>
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

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        min={0}
        max={max}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Math.min(max ?? Infinity, clampNumber(Number(event.target.value), 0)))}
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
