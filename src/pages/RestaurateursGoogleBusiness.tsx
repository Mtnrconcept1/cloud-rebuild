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
import { B2BTable } from "@/components/restaurateurs/B2BTable";
import { calculateGoogleBusinessSavings } from "@/lib/googleBusinessEconomics";
import { FAIR_GROWTH_PLANS, RESERVATION_FLAT_FEE_CHF } from "@/lib/fairGrowth";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { GOOGLE_BUSINESS_PLAN_PRESENTATION, GOOGLE_BUSINESS_SERVICE_SCOPE } from "@/lib/googleBusinessServiceScope";

const PAGE_PATH = "/restaurateurs/google-business";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const guideSteps = [
  "Relevez le lien actuel du bouton de réservation ou de commande sur votre fiche Google Business.",
  "Depuis votre espace restaurateur TOK, créez un lien de réservation identifié comme venant de Google.",
  "Ce lien contient une indication de provenance : elle aide à distinguer Google de votre site ou d'un QR code, lorsque les données sont disponibles.",
  "Remplacez le bouton seulement quand la page restaurant, les horaires et les créneaux sont prêts.",
  "Chaque semaine, comparez les clics, les réservations et les tables effectivement servies. Un clic ou une réservation ne prouve pas une visite.",
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
    risk: "Les frais et l'accès aux coordonnées clients dépendent du contrat de cette plateforme.",
    tokAction: "Tester un lien TOK avant de décider si vous souhaitez changer de service.",
    metric: "Frais facturés, tables servies et coordonnées disponibles avec les consentements requis.",
  },
  {
    situation: "Bouton Google vers le site du restaurant",
    risk: "Le lien existe mais les horaires, services et conversions ne sont pas toujours mesurés.",
    tokAction: "Conserver votre site et vérifier si un lien TOK répond à vos besoins de réservation et de suivi.",
    metric: "Clics, réservations, absences et tables effectivement servies.",
  },
];

const channelMetrics = [
  {
    icon: MousePointerClick,
    title: "Clics Google",
    body: "Nombre de fois où une personne clique sur votre lien depuis Google ou Google Maps, lorsque cette mesure est disponible.",
  },
  {
    icon: Table2,
    title: "Réservations et visites",
    body: "Une réservation confirme une demande ; une table honorée signifie que les clients sont réellement venus. Ce sont deux mesures différentes.",
  },
  {
    icon: LineChart,
    title: "Frais de réservation",
    body: "Comparez les frais pour les mêmes tables réellement servies. Le simulateur ci-dessous détaille chaque multiplication et l'abonnement TOK.",
  },
];

const faqItems = [
  {
    question: "La fiche Google est-elle payante ? Et TOK ?",
    answer:
      "La fiche Google Business est gratuite. TOK est un service distinct avec un abonnement mensuel et des frais de 5 CHF par table honorée. L'accompagnement Google est inclus ou optionnel selon le pack ; une prestation optionnelle nécessite un devis.",
  },
  {
    question: "TOK peut-il remplacer le bouton de réservation Google Business ?",
    answer:
      "TOK fournit un lien vers votre page restaurant et les services activés. Vous pouvez l'ajouter dans votre fiche lorsque Google le permet, ou mandater TOK par écrit avec un accès gestionnaire. Il ne s'agit pas d'une intégration automatique à tous les boutons Google.",
  },
  {
    question: "Comment mesurer les clics Google avec TOK ?",
    answer:
      "Un lien identifié Google Business aide à retrouver les visites et les réservations venant de Google lorsque les données sont disponibles. Les clics, réservations, commandes, paiements et demandes de contact restent des événements distincts ; aucun ne prouve à lui seul une table servie.",
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
  return `${value.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`;
}

export default function RestaurateursGoogleBusiness() {
  const [monthlyTables, setMonthlyTables] = useState(120);
  const [coversPerTable, setCoversPerTable] = useState(3);
  const [commissionPerCover, setCommissionPerCover] = useState(6.2);
  const [planSlug, setPlanSlug] = useState("pro");
  const selectedPlan = FAIR_GROWTH_PLANS.find((plan) => plan.slug === planSlug) ?? FAIR_GROWTH_PLANS[1];
  const packFee = selectedPlan.monthlyPriceChf;

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
      `Écart mensuel estimé (coût au couvert moins TOK) : ${formatChf(simulation.monthlySavingsChf)}`,
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
        className="relative isolate flex items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-16 text-white md:px-8 lg:px-12"
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
              Pour les restaurants · Fiche Google et réservations
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-tight md:text-5xl">
                Depuis Google, aidez vos clients à réserver chez vous.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/80 md:text-lg">
                Votre fiche Google Business est la fiche gratuite de votre restaurant dans Google et Google Maps : adresse,
                horaires, photos et liens. TOK est un service distinct, payant, pour gérer notamment vos réservations.
                Vous pouvez ajouter un lien vers votre page restaurant TOK sur votre fiche Google, selon les options proposées par Google.
                TOK facture 5 CHF par table réellement servie, quel que soit le nombre de personnes, en plus de l'abonnement choisi.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
                  Demander un audit par e-mail
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
            <p className="text-sm leading-6 text-white/80">Exemple modifiable dans le simulateur ci-dessous · abonnement {selectedPlan.publicName} à {formatChf(packFee)}/mois.</p>
            <MetricDark label="Tables servies issues de Google / mois" value={monthlyTables.toLocaleString("fr-CH")} />
            <MetricDark label="Coût modèle au couvert" value={formatChf(simulation.perCoverModelCostChf)} />
            <MetricDark label="TOK : pack + 5 CHF/table" value={formatChf(simulation.tokModelCostChf)} />
            <MetricDark
              label={simulation.monthlySavingsChf > 0 ? "TOK coûte moins par mois" : simulation.monthlySavingsChf < 0 ? "TOK coûte plus par mois" : "Coûts identiques"}
              value={formatChf(Math.abs(simulation.monthlySavingsChf))}
              accent={simulation.isTokCheaper}
            />
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-14 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-3xl font-black">Le parcours d'un client, en 5 étapes</h2>
          <B2BTable caption="De la recherche Google à la table servie" columns={["Étape", "Ce qui se passe", "À comprendre"]} rows={[
            ["1. Recherche Google", "Le client trouve votre fiche dans Google ou Maps.", "Google décide du classement et des boutons disponibles. TOK ne garantit pas votre visibilité."],
            ["2. Clic sur votre lien", "Le client ouvre le lien TOK que vous avez ajouté à la fiche.", "Un clic indique un intérêt, pas encore une réservation."],
            ["3. Page restaurant TOK", "Il consulte votre restaurant et les services activés.", "Les horaires, informations et disponibilités doivent être à jour."],
            ["4. Réservation", "Il choisit un créneau et effectue sa réservation.", "Une réservation n'est pas encore une table servie."],
            ["5. Table honorée", "Les clients viennent et sont servis au restaurant.", "TOK facture 5 CHF pour cette table, pas 5 CHF par personne. L'abonnement reste dû séparément."],
          ]} />
          <p className="text-sm leading-6 text-slate-600">La fiche Google reste gratuite. L'accompagnement TOK dépend de votre abonnement et des prestations convenues. Toute modification de votre fiche par TOK exige votre mandat et les accès nécessaires ; elle n'est pas automatique.</p>
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
          <B2BTable caption="Accompagnement Google selon votre abonnement TOK" columns={["Abonnement", "Statut du service Google", "Ce que cela signifie"]} rows={FAIR_GROWTH_PLANS.map((plan) => {
            const scope = GOOGLE_BUSINESS_PLAN_PRESENTATION[plan.slug === "pro" ? "business" : plan.slug];
            return [plan.publicName, scope.status, scope.detail];
          })} />
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
        <div className="mx-auto grid max-w-7xl gap-8">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Votre lien de réservation</p>
            <h2 className="text-3xl font-black md:text-4xl">Le bon lien dépend de votre situation actuelle.</h2>
            <p className="text-slate-600">
              Identifiez votre situation, puis comparez les options avant de changer votre lien.
              Vérifiez ensuite combien de clients cliquent, réservent et viennent effectivement au restaurant.
            </p>
          </div>
          <B2BTable caption="Quel lien choisir selon votre situation ?" columns={["Situation actuelle", "Point à vérifier", "Action possible avec TOK", "Résultat à suivre"]} rows={googleDecisionRows.map((row) => [row.situation, row.risk, row.tokAction, row.metric])} />
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Simulateur des frais de réservation</p>
            <h2 className="text-3xl font-black md:text-4xl">Combien coûtent les mêmes tables dans chaque modèle ?</h2>
            <p className="text-slate-600">
              Un couvert est une personne servie. Une table est une réservation honorée, même si elle rassemble plusieurs personnes.
              Ce calcul compare le même volume de tables venues depuis Google dans les deux modèles. Le total TOK additionne l'abonnement mensuel
              et 5 CHF par table ; le modèle concurrent additionne un montant pour chaque personne. Il s'agit d'une estimation,
              pas d'une garantie de trafic ou de résultat Google.
            </p>
          </div>

          <div className="min-w-0 space-y-6 rounded-lg border bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="tables" label="Tables réellement servies depuis Google / mois" value={monthlyTables} onChange={setMonthlyTables} />
              <NumberField id="covers" label="Personnes en moyenne par table" value={coversPerTable} onChange={setCoversPerTable} step={0.5} />
              <NumberField id="commission" label="Hypothèse de frais par personne (CHF)" value={commissionPerCover} onChange={setCommissionPerCover} step={0.1} />
              <div className="space-y-2">
                <Label htmlFor="google-pack">Abonnement TOK · paiement mensuel</Label>
                <select id="google-pack" value={planSlug} onChange={(event) => setPlanSlug(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {FAIR_GROWTH_PLANS.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.publicName} · {formatChf(plan.monthlyPriceChf)}/mois</option>)}
                </select>
              </div>
            </div>
            <B2BTable caption="Détail du calcul avec vos valeurs" columns={["Étape", "Calcul", "Résultat"]} rows={[
              ["Personnes servies / mois", `${monthlyTables.toLocaleString("fr-CH")} tables × ${coversPerTable.toLocaleString("fr-CH")} personnes`, simulation.monthlyCovers.toLocaleString("fr-CH")],
              ["Modèle au couvert / mois", `${simulation.monthlyCovers.toLocaleString("fr-CH")} personnes × ${formatChf(commissionPerCover)}`, formatChf(simulation.perCoverModelCostChf)],
              ["TOK : frais de tables / mois", `${monthlyTables.toLocaleString("fr-CH")} tables × ${formatChf(RESERVATION_FLAT_FEE_CHF)}`, formatChf(monthlyTables * RESERVATION_FLAT_FEE_CHF)],
              ["TOK : abonnement / mois", `${selectedPlan.publicName} · paiement mensuel`, formatChf(packFee)],
              ["TOK : total / mois", `${formatChf(monthlyTables * RESERVATION_FLAT_FEE_CHF)} + ${formatChf(packFee)}`, formatChf(simulation.tokModelCostChf)],
              ["Écart / mois", `Coût au couvert − total TOK : ${formatChf(simulation.perCoverModelCostChf)} − ${formatChf(simulation.tokModelCostChf)}`, formatChf(simulation.monthlySavingsChf)],
              ["Écart sur 12 mois identiques", `${formatChf(simulation.monthlySavingsChf)} × 12`, formatChf(simulation.annualSavingsChf)],
              ["Coût TOK moyen par personne", simulation.monthlyCovers > 0 ? `${formatChf(simulation.tokModelCostChf)} ÷ ${simulation.monthlyCovers.toLocaleString("fr-CH")} personnes` : "Division impossible : aucune personne", simulation.monthlyCovers > 0 ? formatChf(simulation.tokEffectiveCostPerCoverChf) : "Non applicable"],
            ]} />
            <div role="status" aria-live="polite" className="rounded-lg bg-slate-950 p-4 text-white">
              <p className="font-bold">{simulation.monthlySavingsChf > 0 ? `Avec ces hypothèses, TOK coûte ${formatChf(simulation.monthlySavingsChf)} de moins par mois.` : simulation.monthlySavingsChf < 0 ? `Avec ces hypothèses, TOK coûte ${formatChf(Math.abs(simulation.monthlySavingsChf))} de plus par mois.` : "Avec ces hypothèses, les deux modèles ont le même coût mensuel."}</p>
              <p className="mt-2 text-sm leading-6 text-white/80">Un écart positif indique une économie de frais avec TOK ; un écart négatif indique un surcoût. Il ne s'agit pas d'une marge ni d'un bénéfice.</p>
            </div>
            <p className="text-sm leading-6 text-slate-600">Hypothèses : mêmes tables réellement servies, même nombre de personnes et tarifs constants. Le montant par personne est votre hypothèse, pas un tarif concurrent vérifié. L'abonnement et les éventuels frais supplémentaires de l'autre service ne sont pas inclus. Le calcul impute ici l'abonnement TOK entier aux tables Google, même s'il sert aussi à d'autres usages. Il ne comprend pas les autres services, options, frais de commande ou de paiement, ni une comparaison de TVA. L'écart annuel multiplie le mois par 12 : il n'applique pas l'offre TOK en paiement annuel. Une moyenne de personnes peut être décimale ; une table reste une réservation honorée.</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Mise en place pas à pas</p>
            <h2 className="text-3xl font-black">Ajouter votre lien et suivre les résultats.</h2>
            <p className="text-slate-600">
              Gardez une copie de l'ancien lien et notez la date du changement pour comparer les résultats.
              Votre espace restaurateur permet de générer et copier le lien, renseigner votre fiche,
              confirmer sa configuration, demander de l'aide et consulter les résultats disponibles ; il ne modifie pas automatiquement Google. Vous ajoutez vous-même le lien dans Google,
              ou vous mandatez TOK par écrit avec un accès gestionnaire.
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
              title: "Savoir d'où vient le client",
              body: "Le lien identifié Google aide à retrouver l'origine des visites et des réservations dans les données disponibles.",
            },
            {
              icon: MapPinned,
              title: "Google Maps",
              body: "Votre fiche aide les clients qui cherchent un restaurant près d'eux. Google contrôle son affichage et ses fonctionnalités.",
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
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Demande d'audit</p>
            <h2 className="text-3xl font-black md:text-4xl">Votre fiche Google envoie-t-elle vraiment les clients chez vous ?</h2>
            <p className="max-w-2xl text-sm leading-6 text-white/70">
              Envoyez votre fiche, votre bouton actuel et vos volumes estimés. TOK vous renvoie une lecture claire :
              parcours du client, réservations mesurables, frais et prochaines actions. Le bouton ouvre votre application de messagerie avec un brouillon ; vous choisissez de l'envoyer.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href={`mailto:contact@thetok.ch?subject=${auditSubject}&body=${auditBody}`}>
                  Préparer ma demande d'audit
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
              {faqItems.map((item) => (
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
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0);
        }}
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
