import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  LineChart,
  Link2,
  MapPinned,
  MousePointerClick,
  SearchCheck,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateGoogleBusinessSavings } from "@/lib/googleBusinessEconomics";
import { RESERVATION_FLAT_FEE_CHF } from "@/lib/fairGrowth";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { GOOGLE_BUSINESS_SERVICE_SCOPE } from "@/lib/googleBusinessServiceScope";

const PAGE_PATH = "/restaurateurs/google-business";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const guideSteps = [
  "Relevez le lien actuel du bouton de réservation ou de commande sur votre fiche Google Business.",
  "Créez un lien TOK traçable pour distinguer Google Maps, recherche Google, QR code et site propre.",
  "Ajoutez des UTM et une source claire dans le dashboard pour mesurer clics, réservations et commandes.",
  "Remplacez le bouton seulement quand la page restaurant, les horaires et les créneaux sont prêts.",
  "Suivez chaque semaine les clics Google, le taux de conversion et les ventes générées depuis ce canal.",
];

const googleDecisionRows = [
  {
    situation: "Bouton Google absent",
    risk: "Les clients appellent, abandonnent ou passent par une autre plateforme.",
    tokAction: "Créer un lien TOK traçable vers réservation, commande ou page restaurant.",
    metric: "Clics Google, réservations confirmées, commandes issues de Google.",
  },
  {
    situation: "Bouton Google vers une plateforme externe",
    risk: "Le restaurant perd la donnée client et lit mal le coût réel du canal.",
    tokAction: "Tester TOK en parallèle, puis basculer si la conversion directe est meilleure.",
    metric: "Coût par conversion, marge, clients récupérés dans le CRM.",
  },
  {
    situation: "Bouton Google vers le site du restaurant",
    risk: "Le lien existe mais les horaires, services et conversions ne sont pas toujours mesurés.",
    tokAction: "Garder l'expérience de marque et ajouter tracking, créneaux, paiements et relances.",
    metric: "Taux de clic vers action, no-show, panier ou table moyenne.",
  },
];

const channelMetrics = [
  {
    icon: MousePointerClick,
    title: "Clics Google",
    body: "Identifiez le volume d'intention qui arrive déjà depuis Google Search et Google Maps.",
  },
  {
    icon: Table2,
    title: "Tables converties",
    body: "Mesurez les réservations confirmées, les commandes à emporter et les demandes de créneau.",
  },
  {
    icon: LineChart,
    title: "Coût par conversion",
    body: "Comparez le coût d'acquisition réel au chiffre d'affaires généré par la fiche Google.",
  },
];

const faqItems = [
  {
    question: "Pourquoi créer une page dédiée à Google Business ?",
    answer:
      "Parce que les clients qui arrivent depuis Google ont déjà une intention forte. TOK aide à convertir ces clics en réservations, commandes et données mesurables.",
  },
  {
    question: "TOK peut-il remplacer le bouton de réservation Google Business ?",
    answer:
      "TOK fournit un lien direct et traçable vers les services réellement activés. Le restaurateur l'ajoute lui-même, ou mandate TOK par écrit avec un accès gestionnaire ; aucune modification automatique de la fiche n'est annoncée.",
  },
  {
    question: "Comment mesurer les clics Google avec TOK ?",
    answer:
      "Les liens peuvent porter une source Google Business, puis les conversions sont rapprochées des réservations, commandes, paiements et demandes de contact.",
  },
  {
    question: "Faut-il abandonner les autres plateformes immédiatement ?",
    answer:
      "Non. La page Google Business sert d'abord à tester un canal direct, mesurer la conversion et réduire progressivement la dépendance si les chiffres le justifient.",
  },
  {
    question: "TOK garantit-il un meilleur classement Google ?",
    answer:
      "Non. Google contrôle le classement, l'affichage, les fonctionnalités et les suspensions. TOK optimise le périmètre convenu et mesure les conversions disponibles, sans garantir de rang ni de volume.",
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
        tokFeePerTableChf: RESERVATION_FLAT_FEE_CHF,
        monthlyPackFeeChf: packFee,
      }),
    [commissionPerCover, coversPerTable, monthlyTables, packFee],
  );

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          name: "Optimisation Google Business pour restaurants",
          provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
          areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
          serviceType:
            "Audit et accompagnement Google Business Profile, lien TOK traçable et suivi des conversions mesurables",
          termsOfService: `${CANONICAL_ORIGIN}/conditions-restaurateurs`,
          offers: {
            "@type": "Offer",
            description: "Service inclus ou optionnel selon l'abonnement ; intervention dans Google soumise à mandat et accès gestionnaire.",
            availability: "https://schema.org/LimitedAvailability",
          },
          url: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: `${CANONICAL_ORIGIN}/` },
            {
              "@type": "ListItem",
              position: 2,
              name: "Restaurateurs Genève",
              item: `${CANONICAL_ORIGIN}/restaurateurs/geneve`,
            },
            { "@type": "ListItem", position: 3, name: "Google Business", item: `${CANONICAL_ORIGIN}${PAGE_PATH}` },
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
    title: "Google Business restaurant : convertir clics Google en réservations | TOK",
    description:
      "Audit Google Business pour restaurant : périmètre, mandat, horaires, catégories, photos, avis, lien TOK traçable et suivi sans garantie de classement.",
    path: PAGE_PATH,
    image: "/fond3.png",
    jsonLd,
  });

  const auditSubject = encodeURIComponent("Audit de ma fiche Google Business restaurant");
  const auditBody = encodeURIComponent(
    [
      "Bonjour TOK,",
      "",
      "Je souhaite auditer le bouton de réservation de ma fiche Google Business.",
      "",
      `Tables depuis Google estimées par mois : ${monthlyTables}`,
      `Couverts par table : ${coversPerTable}`,
      `Commission par couvert comparée : ${commissionPerCover} CHF`,
      `Pack TOK estimé : ${packFee} CHF/mois`,
      `Économie mensuelle estimée : ${formatChf(simulation.monthlySavingsChf)}`,
      "",
      "Restaurant :",
      "Lien fiche Google Business :",
      "Bouton actuel : plateforme / site propre / aucun",
      "Lien de réservation souhaité :",
      "Téléphone :",
      "Email :",
    ].join("\n"),
  );

  return (
    <main className="bg-white text-slate-950">
      <section
        className="relative isolate flex min-h-[76vh] items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-28 text-white md:px-8 lg:px-12"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(5,7,15,0.9), rgba(5,7,15,0.64), rgba(5,7,15,0.18)), url('/fond3.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <SearchCheck className="h-4 w-4 text-orange-300" />
              Google Business · Google Maps · Conversion directe
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-[0.98] md:text-6xl">
                Transformez votre fiche Google Business en canal direct.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/80 md:text-lg">
                Audit, recommandations, suivi des clics Google Maps et bouton de réservation traçable vers les services réellement ouverts.
                Pour comparer les coûts, TOK applique 5 CHF par table réellement servie, en plus du pack mensuel sélectionné. Toute intervention
                dans Google est soumise à mandat ; aucune publication automatique ni garantie de classement.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
                  Auditer ma fiche Google
                  <ExternalLink className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/restaurateurs/geneve">
                  Voir la plateforme restaurateur
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-md">
            <MetricDark label="Tables Google comparées" value={monthlyTables.toLocaleString("fr-CH")} />
            <MetricDark label="Coût modèle au couvert" value={formatChf(simulation.perCoverModelCostChf)} />
            <MetricDark label="TOK : pack + 5 CHF/table" value={formatChf(simulation.tokModelCostChf)} />
            <MetricDark
              label={simulation.isTokCheaper ? "Gain mensuel estimé" : "Écart mensuel estimé"}
              value={formatChf(Math.abs(simulation.monthlySavingsChf))}
              accent={simulation.isTokCheaper}
            />
          </div>
        </div>
      </section>

      <section className="border-b bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Périmètre commercial</p>
            <h2 className="text-3xl font-black md:text-4xl">Ce que TOK fait, ce qui reste à valider.</h2>
            <p className="text-slate-600">Le niveau de service dépend du pack. Une intervention dans Google commence uniquement après validation du périmètre, des accès et du mandat.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              ["Inclus selon le pack", GOOGLE_BUSINESS_SERVICE_SCOPE.included],
              ["Prestations optionnelles", GOOGLE_BUSINESS_SERVICE_SCOPE.optional],
              ["Mandat et accès requis", GOOGLE_BUSINESS_SERVICE_SCOPE.mandateRequired],
              ["Google et limites de résultat", GOOGLE_BUSINESS_SERVICE_SCOPE.dependencies],
            ].map(([title, items]) => (
              <article key={title as string} className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black">{title as string}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                  {(items as readonly string[]).map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-orange-600" />{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-950">
            <strong>Délais :</strong> l'audit et le calendrier d'intervention sont confirmés après réception d'un dossier complet. Toute attente d'accès, de validation restaurant ou de contrôle Google suspend le délai. Consultez les <Link className="underline" to="/conditions-restaurateurs">conditions restaurateurs</Link>.
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {channelMetrics.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-white p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-4 text-xl font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Bascule du bouton Google</p>
            <h2 className="text-3xl font-black md:text-4xl">Le bon lien dépend de votre situation actuelle.</h2>
            <p className="text-slate-600">
              Le restaurateur doit pouvoir décider sans jargon : quel est le risque aujourd'hui, quelle action TOK
              mettre en place, et quelle métrique regarder après sept jours.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="grid bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white md:grid-cols-[0.85fr_1.05fr_1.1fr_1fr]">
              <span>Situation</span>
              <span>Risque</span>
              <span>Action TOK</span>
              <span>Mesure</span>
            </div>
            {googleDecisionRows.map((row) => (
              <div key={row.situation} className="grid gap-2 border-t p-4 text-sm md:grid-cols-[0.85fr_1.05fr_1.1fr_1fr]">
                <p className="font-bold text-slate-950">{row.situation}</p>
                <p className="leading-6 text-slate-600">{row.risk}</p>
                <p className="leading-6 text-orange-700">{row.tokAction}</p>
                <p className="leading-6 text-slate-600">{row.metric}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulateur du canal Google</p>
            <h2 className="text-3xl font-black md:text-4xl">Mesurez le coût de conversion des tables issues de Google.</h2>
            <p className="text-slate-600">
              Ce calcul compare le même volume de tables Google dans les deux modèles. Le total TOK additionne le pack mensuel
              et 5 CHF par table ; le modèle concurrent additionne un montant pour chaque personne. Il s'agit d'une estimation,
              pas d'une garantie de trafic ou de résultat Google.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="tables" label="Réservations issues de Google / mois" value={monthlyTables} onChange={setMonthlyTables} />
              <NumberField id="covers" label="Personnes moyennes par réservation" value={coversPerTable} onChange={setCoversPerTable} step={0.5} />
              <NumberField id="commission" label="Montant facturé par personne (comparatif)" value={commissionPerCover} onChange={setCommissionPerCover} step={0.1} />
              <NumberField id="pack" label="Pack TOK mensuel" value={packFee} onChange={setPackFee} />
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <MetricDark label="1. Personnes comparées" value={simulation.monthlyCovers.toLocaleString("fr-CH")} />
              <MetricDark label="2. Modèle au couvert" value={formatChf(simulation.perCoverModelCostChf)} />
              <MetricDark label="3. TOK : pack + tables" value={formatChf(simulation.tokModelCostChf)} />
              <p className="rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-white/75">
                Au couvert : {simulation.monthlyCovers.toLocaleString("fr-CH")} personnes × {commissionPerCover.toLocaleString("fr-CH")} CHF.
                <br />
                TOK : {monthlyTables.toLocaleString("fr-CH")} tables × 5 CHF + pack {formatChf(packFee)}.
              </p>
              <MetricDark label="Coût TOK par personne" value={`${simulation.tokEffectiveCostPerCoverChf.toLocaleString("fr-CH")} CHF`} />
              <MetricDark label="Écart annuel estimé" value={formatChf(simulation.annualSavingsChf)} accent={simulation.isTokCheaper} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Checklist de bascule</p>
            <h2 className="text-3xl font-black">Changer le bouton Google sans perdre la mesure.</h2>
            <p className="text-slate-600">
              Chaque étape doit laisser une trace : lien avant/après, source, date, service ouvert et conversion finale.
              Le dashboard permet aujourd'hui de générer/copier le lien, déclarer la fiche, confirmer la configuration,
              demander de l'aide et lire les conversions disponibles ; il ne modifie pas automatiquement Google.
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
            {
              icon: Link2,
              title: "Lien traçable",
              body: "Un lien Google Business ne doit pas être un simple raccourci. Il doit porter une source lisible.",
            },
            {
              icon: MapPinned,
              title: "Google Maps",
              body: "Les recherches de proximité sont traitées comme un canal commercial distinct du site et des réseaux sociaux.",
            },
            {
              icon: ShieldCheck,
              title: "Dépendance réduite",
              body: "TOK permet de tester un parcours direct avant de déplacer du volume depuis des plateformes externes.",
            },
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
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Audit gratuit</p>
            <h2 className="text-3xl font-black md:text-4xl">Votre fiche Google envoie-t-elle vraiment les clients chez vous ?</h2>
            <p className="max-w-2xl text-sm leading-6 text-white/70">
              Envoyez votre fiche, votre bouton actuel et vos volumes estimés. TOK vous renvoie une lecture claire :
              source, conversion, coût et prochaines actions.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
                  Lancer l'audit Google
                  <CheckCircle2 className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/restaurateurs/alternative-commission-couvert">Comparer les coûts</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-white/12 bg-white/10 p-5">
            <h3 className="text-lg font-bold">FAQ Google Business</h3>
            <div className="mt-4 grid gap-3">
              {faqItems.slice(0, 3).map((item) => (
                <article key={item.question} className="rounded-md bg-white/10 p-4">
                  <h4 className="text-sm font-bold">{item.question}</h4>
                  <p className="mt-2 text-sm leading-6 text-white/70">{item.answer}</p>
                </article>
              ))}
            </div>
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
