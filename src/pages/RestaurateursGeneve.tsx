import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgePercent,
  Camera,
  CheckCircle2,
  Megaphone,
  PhoneCall,
  Sparkles,
  Table2,
} from "lucide-react";

import { B2BTable } from "@/components/restaurateurs/B2BTable";
import { FAIR_GROWTH_PLANS, RESERVATION_FLAT_FEE_CHF } from "@/lib/fairGrowth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useToast } from "@/hooks/use-toast";
import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import { isCaptchaEnabled } from "@/lib/captcha";
import { submitContactSupport } from "@/lib/support/contactSupport";
import { readStoredFirstTouch } from "@/lib/acquisitionAttribution";
import { hasConsent } from "@/lib/consent";

const PAGE_PATH = "/restaurateurs/geneve";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const PACKS = {
  starter: { label: "Starter", monthlyFee: 69, aiPhotos: 10, launchDays: 7 },
  business: { label: "Business", monthlyFee: 129, aiPhotos: 30, launchDays: 14 },
  premium: { label: "Premium", monthlyFee: 199, aiPhotos: 80, launchDays: 21 },
  elite: { label: "Elite", monthlyFee: 499, aiPhotos: 160, launchDays: 30 },
} as const;

type PackKey = keyof typeof PACKS;

const platformModules = [
  {
    icon: Table2,
    title: "Réservations et commandes directes",
    body: "Centralisez les demandes de table, les commandes à emporter, la livraison et les confirmations sans multiplier les outils.",
  },
  {
    icon: BadgePercent,
    title: "Anti-gaspi et ventes flash",
    body: "Activez les créneaux calmes, les fins de service et les stocks courts avec des offres pilotées depuis le dashboard restaurateur.",
  },
  {
    icon: Megaphone,
    title: "Actualités, campagnes et Miamz",
    body: "Publiez vos nouveautés, animez votre communauté locale et reliez vos avantages fidélité aux comportements clients.",
  },
  {
    icon: Camera,
    title: "Photos IA et fiche publique",
    body: "Améliorez l'impact visuel de votre carte avec des photos propres, des médias structurés et une fiche restaurant exploitable.",
  },
];

const useCases = [
  {
    title: "Bistrot de quartier",
    body: "Remplir le mardi midi, annoncer le plat du jour et relancer les clients fidèles sans dépendre uniquement d'Instagram.",
  },
  {
    title: "Restaurant premium",
    body: "Mettre en avant des expériences chef, des tables VIP et des créneaux rares pour les clients avec beaucoup de Miamz.",
  },
  {
    title: "Cuisine rapide qualitative",
    body: "Accélérer la commande à emporter, pousser les ventes flash et fluidifier les pics du déjeuner.",
  },
  {
    title: "Restaurant hôtelier",
    body: "Coordonner réservations, offres locales, photos, avis et visibilité sur les recherches food à Genève.",
  },
];

const onboardingSteps = [
  "Audit de votre fiche, de votre carte, de vos photos et de vos canaux actuels.",
  "Configuration du dashboard restaurateur, des horaires, services, tables et moyens de vente.",
  "Création des premiers contenus : offres anti-gaspi, ventes flash, actualités, photos IA et avantages Miamz.",
  "Lancement local avec liens Google Business, QR codes, page restaurant et suivi des réservations.",
  "Pilotage hebdomadaire : performances, avis, campagnes, commandes, conversions et créneaux à renforcer.",
];

const decisionRows = [
  {
    need: "Remplir les créneaux faibles",
    module: "Ventes flash, anti-gaspi, actualités sponsorisées",
    result: "Le restaurateur pousse une offre courte au bon moment, sans brader toute la carte.",
  },
  {
    need: "Réduire les appels et messages dispersés",
    module: "Réservations, commandes, horaires et confirmations",
    result: "Les demandes arrivent au même endroit avec un statut lisible pour l'équipe.",
  },
  {
    need: "Comprendre d'où viennent les clients",
    module: "Google Business, campagnes, QR codes et tracking",
    result: "Chaque canal peut être comparé sur ses clics, réservations, commandes et revenus.",
  },
  {
    need: "Faire revenir les bons clients",
    module: "Miamz, CRM, profils clients et notifications",
    result: "Les actions commerciales partent des habitudes réelles, pas d'une intuition.",
  },
];

const faqItems = [
  {
    question: "TOK est-il seulement un outil de réservation ?",
    answer:
      "Non. TOK réunit réservations, commandes, offres anti-gaspi, ventes flash, actualités, photos IA, Miamz, campagnes et pilotage restaurateur dans un même espace.",
  },
  {
    question: "Quel type de restaurant genevois peut utiliser TOK ?",
    answer:
      "La plateforme convient aux bistrots, restaurants premium, cuisines rapides qualitatives, hôtels et concepts locaux qui veulent mieux convertir leur demande locale.",
  },
  {
    question: "Comment se passe l'onboarding restaurateur ?",
    answer:
      "TOK commence par un audit, configure la fiche et le dashboard, prépare les contenus utiles, branche les liens publics puis suit les performances avec le restaurateur.",
  },
  {
    question: "Les Miamz servent-ils aussi aux restaurateurs ?",
    answer:
      "Oui. Les Miamz donnent des signaux de fidélité et peuvent soutenir des avantages comme la priorité, des tables VIP ou des expériences réservées aux clients engagés.",
  },
];

const leadNeeds = [
  "Remplir les tables creuses",
  "Structurer les réservations",
  "Accélérer l'emporter",
  "Lancer anti-gaspi et ventes flash",
  "Améliorer les photos IA",
  "Piloter les campagnes et Miamz",
];

function formatChf(value: number) {
  return `${value.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`;
}

export default function RestaurateursGeneve() {
  const [tablesPerMonth, setTablesPerMonth] = useState(120);
  const [ordersPerMonth, setOrdersPerMonth] = useState(180);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [averageTicket, setAverageTicket] = useState(42);
  const [averageOrder, setAverageOrder] = useState(28);
  const [pack, setPack] = useState<PackKey>("business");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [sendingLead, setSendingLead] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const demoRequestId = useRef<string | null>(null);
  const { toast } = useToast();

  const handleLeadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCaptchaEnabled() && !captchaToken) {
      toast({ title: "Validation requise", description: "Validez le contrôle anti-abus.", variant: "destructive" });
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const restaurant = String(data.get("restaurant") || "").trim();
    const email = String(data.get("email") || "").trim();
    const city = String(data.get("ville") || "").trim() || "Genève";
    const phone = String(data.get("telephone") || "").trim();
    const tableCountRaw = String(data.get("tables") || "").trim();
    const tableCount = tableCountRaw === "" ? null : Number(tableCountRaw);
    const primaryNeed = String(data.get("besoin") || "").trim();
    const trackingConsent = hasConsent("marketing");
    const firstTouch = trackingConsent ? readStoredFirstTouch() : null;
    const requestId = demoRequestId.current || crypto.randomUUID();
    demoRequestId.current = requestId;
    const details = [
      `Restaurant: ${restaurant}`,
      `Ville: ${String(data.get("ville") || "").trim()}`,
      `Tables: ${String(data.get("tables") || "").trim() || "non renseigné"}`,
      `Téléphone: ${String(data.get("telephone") || "").trim()}`,
      `Priorité: ${String(data.get("besoin") || "").trim() || "non renseignée"}`,
      `Pack pressenti: ${PACKS[pack].label} (${PACKS[pack].monthlyFee} CHF/mois)`,
      "",
      String(data.get("message") || "").trim(),
    ].join("\n");

    setSendingLead(true);
    try {
      await submitContactSupport({
        source: "public_contact",
        name: restaurant,
        email,
        subject: "Demande de démo restaurateur TOK Genève",
        message: details,
        captchaToken,
        restaurantLead: {
          requestId,
          city,
          phone,
          tableCount,
          primaryNeed,
          marketingConsent: data.get("marketing_optin") === "on",
          marketingTrackingConsent: trackingConsent,
          acquisitionTouch: firstTouch ? {
            utm: firstTouch.utm,
            referrerHost: firstTouch.referrerHost,
            landingPath: firstTouch.landingPath,
            touchedAt: firstTouch.touchedAt,
          } : null,
        },
      });
      form.reset();
      demoRequestId.current = null;
      setCaptchaToken(null);
      setDemoSubmitted(true);
      toast({ title: "Demande reçue", description: "La demande a été transmise à l’équipe TOK." });
    } catch (error) {
      toast({
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setSendingLead(false);
    }
  };

  const activation = useMemo(() => {
    const packConfig = PACKS[pack];
    const monthlyRevenue = tablesPerMonth * averageTicket + ordersPerMonth * averageOrder;
    const monthlyActions = postsPerWeek * 4 + Math.round(tablesPerMonth / 20) + Math.round(ordersPerMonth / 30);
    const marketingEnvelope = monthlyRevenue * 0.12;

    return {
      packConfig,
      monthlyRevenue,
      monthlyActions,
      marketingEnvelope,
      onboardingDays: packConfig.launchDays,
    };
  }, [averageOrder, averageTicket, ordersPerMonth, pack, postsPerWeek, tablesPerMonth]);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          name: "Plateforme restaurateur TOK à Genève",
          provider: { "@type": "Organization", name: "TOK", url: CANONICAL_ORIGIN },
          areaServed: { "@type": "City", name: "Genève", addressCountry: "CH" },
          serviceType:
            "Logiciel restaurateur pour réservations, commandes, anti-gaspi, ventes flash, actualités, photos IA et fidélité Miamz",
          url: `${CANONICAL_ORIGIN}${PAGE_PATH}`,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Accueil", item: `${CANONICAL_ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "Restaurateurs Genève", item: `${CANONICAL_ORIGIN}${PAGE_PATH}` },
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
    title: "Logiciel restaurateur à Genève : réservations, commandes et marketing | TOK",
    description:
      "TOK aide les restaurants genevois à piloter réservations, commandes, anti-gaspi, ventes flash, actualités, photos IA, Miamz et campagnes depuis un dashboard unique.",
    path: PAGE_PATH,
    image: "/fond3.png",
    jsonLd,
  });

  const demoSubject = encodeURIComponent("Demande de démo restaurateur TOK Genève");
  const demoBody = encodeURIComponent(
    [
      "Bonjour TOK,",
      "",
      "Je souhaite organiser une démo restaurateur pour Genève.",
      "",
      `Pack pressenti : ${activation.packConfig.label}`,
      `Tables estimées par mois : ${tablesPerMonth}`,
      `Commandes estimées par mois : ${ordersPerMonth}`,
      `Actualités prévues par semaine : ${postsPerWeek}`,
      "",
      "Restaurant :",
      "Ville : Genève",
      "Téléphone :",
      "Email :",
      "Besoin principal :",
    ].join("\n"),
  );

  return (
    <main className="bg-background text-foreground">
      <section
        className="relative isolate flex items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-16 text-white md:px-8 lg:px-12"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(5,7,15,0.9), rgba(5,7,15,0.62), rgba(5,7,15,0.12)), url('/fond3.png')",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              <Sparkles className="h-4 w-4 text-orange-300" />
              Pour les restaurateurs à Genève
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-tight md:text-5xl">
                Réservations, commandes et fidélité : votre restaurant réuni dans TOK.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                TOK est une plateforme en ligne : vos clients y découvrent votre restaurant, réservent ou commandent.
                Votre équipe gère les demandes, les offres et la fidélité dans un seul espace.
                Pour les réservations, vous payez un abonnement mensuel et 5 CHF par table réellement servie, quel que soit le nombre de personnes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-500 text-white hover:bg-orange-600">
                <a href="#demande-demo">
                  Demander une démo gratuite
                  <PhoneCall className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/auth?role=restaurateur">
                  Créer mon compte restaurateur
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/restaurateurs/alternative-commission-couvert">
                  Comparer les modèles
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <p className="text-sm leading-6 text-white/80">
              Démo sans engagement. Aucun abonnement ni paiement déclenché par une demande de démonstration.
              <Link to="/restaurateurs/google-business" className="ml-2 font-semibold text-orange-200 underline underline-offset-4 hover:text-white">
                Découvrir le module Google Business
              </Link>
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-3xl border-2 border-[#F15D22] bg-white text-slate-950 shadow-2xl">
            <p className="bg-[#F15D22] px-6 py-4 text-xl font-black text-white">Une table servie. Un prix fixe.</p>
            <div className="space-y-5 p-6">
              <p className="text-5xl font-black tracking-tight text-[#F15D22]">5 CHF <span className="text-xl text-slate-950">/ table</span></p>
              <p className="text-base leading-7">2, 4 ou 8 personnes à la même table ? Les frais de réservation restent de <strong>5 CHF pour ce groupe</strong>, en plus de l'abonnement.</p>
              <div className="rounded-2xl bg-orange-50 p-4">
                <p className="text-sm font-bold">Exemple : 10 tables servies avec le pack Starter</p>
                <p className="mt-2 break-words text-2xl font-black">69 + (10 × 5) = <span className="text-[#F15D22]">119 CHF / mois</span></p>
                <p className="mt-2 text-sm text-slate-600">Abonnement + réservations. Hors commandes et autres frais éventuels.</p>
              </div>
              <a href="#simulation" className="inline-flex items-center gap-2 font-bold text-[#b53000] underline underline-offset-4">Calculer avec mes chiffres <ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Sur cette page" className="border-b bg-orange-50 px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-orange-950">
          <a href="#comprendre" className="underline underline-offset-4">1. Comprendre TOK</a>
          <a href="#tarifs" className="underline underline-offset-4">2. Comprendre le prix</a>
          <a href="#simulation" className="underline underline-offset-4">3. Faire une simulation</a>
          <a href="#demande-demo" className="underline underline-offset-4">4. Demander une démo</a>
        </div>
      </nav>
      <section id="comprendre" className="scroll-mt-28 px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-6">
          <h2 className="text-3xl font-black">Vous découvrez TOK ? Voici les mots utiles.</h2>
          <B2BTable caption="De quoi parle-t-on ?" columns={["Terme", "En clair", "Exemple"]} rows={[
            ["Table / réservation honorée", "Un groupe qui vient effectivement manger. Ce n'est pas le nombre de tables physiques de votre salle.", "Une réservation de 4 personnes servies = 1 table facturable à 5 CHF."],
            ["Couvert", "Une personne qui mange au restaurant.", "La même réservation de 4 personnes = 4 couverts."],
            ["Tableau de bord / dashboard", "Votre espace de gestion en ligne, réservé à votre équipe.", "Confirmer une réservation, suivre une commande ou préparer une offre."],
            ["Miamz", "Les points de fidélité TOK des clients, associés à des avantages selon les règles du programme.", "Proposer un avantage fidélité ou une expérience dédiée."],
            ["Anti-gaspi / vente flash", "Une offre sur des invendus / une promotion limitée dans le temps.", "Proposer les portions restantes en fin de service / une offre pour le mardi midi."],
            ["Campagne / CRM / suivi des sources", "Une action pour faire connaître une offre / le suivi de la relation client / l'origine des visites.", "Partager une nouveauté et repérer les demandes venues de Google ou d'un QR code."],
            ["Photos IA", "Des visuels préparés avec une intelligence artificielle.", "Illustrer votre offre avec des contenus à vérifier avant publication."],
            ["Mise en route / onboarding", "La préparation de votre fiche, de vos services et de votre équipe.", "Renseigner les horaires puis ouvrir les créneaux de réservation."],
          ]} />
        </div>
      </section>

      <section className="border-b bg-white px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {platformModules.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="tarifs" className="scroll-mt-28 border-b bg-orange-50 px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Le prix en 15 secondes</p>
            <h2 className="mt-3 text-3xl font-black md:text-4xl">Trois repères avant de comparer les offres.</h2>
            <p className="mt-3 text-slate-700">Le prix ne dépend pas seulement d'un chiffre annoncé. Distinguez le pack, la table réellement servie et les annulations.</p>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {[
              ["1. Le pack", "Un montant mensuel pour les outils et l'accompagnement choisis."],
              ["2. La réservation servie", "5 CHF pour une table réellement servie, que vous receviez 2 ou 8 personnes."],
              ["3. Annulation ou no-show", "0 CHF pour une réservation qui n'est pas honorée."],
            ].map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
                <h3 className="font-black text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6">
            <B2BTable caption="Abonnement mensuel + réservations servies" columns={["Pack", "Abonnement / mois", "Exemple : 10 tables servies / mois"]}
              rows={FAIR_GROWTH_PLANS.map((plan) => [plan.publicName, formatChf(plan.monthlyPriceChf), `${plan.monthlyPriceChf} + 10 × 5 = ${formatChf(plan.monthlyPriceChf + 50)}`])} />
            <p className="mt-3 text-sm leading-6 text-slate-700">Une réservation annulée ou non honorée (no-show) ne déclenche pas les 5 CHF. L'abonnement reste dû, même sans réservation. Ce tableau concerne les réservations ; les commandes et autres prestations ont leurs propres frais.</p>
          </div>
          <Link className="mt-6 inline-flex items-center gap-2 font-bold text-orange-800 underline underline-offset-4" to="/restaurateurs/alternative-commission-couvert">
            Voir un exemple chiffré, table par table <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Lecture simple</p>
            <h2 className="text-3xl font-black md:text-4xl">Ce que TOK regroupe pour un restaurant genevois.</h2>
            <p className="text-muted-foreground">
              Votre espace de gestion (le tableau de bord) rassemble les outils ci-dessous. Activez les services adaptés à votre activité, puis suivez les demandes reçues.
            </p>
          </div>
          <B2BTable caption="Vos besoins et les outils correspondants" columns={["Besoin terrain", "Module TOK", "Résultat attendu"]}
            rows={decisionRows.map((row) => [row.need, row.module, row.result])} />
        </div>
      </section>

      <section id="simulation" className="scroll-mt-28 bg-orange-50/60 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Plan d'activation Genève</p>
            <h2 className="max-w-4xl text-3xl font-black tracking-tight md:text-5xl">Vos ventes d'un côté.<br /><span className="text-[#F15D22]">Votre coût TOK de l'autre.</span></h2>
            <p className="max-w-3xl leading-7 text-slate-700">
              Entrez votre activité mensuelle pour voir chaque multiplication et chaque total. Cette simulation décrit vos hypothèses : elle ne prédit pas les clients que TOK vous apportera.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border-2 border-[#F15D22] bg-white shadow-xl shadow-orange-950/5">
            <div className="bg-[#F15D22] px-5 py-5 text-white sm:px-8">
              <h3 className="text-2xl font-black">1. Vos chiffres pour un mois</h3>
              <p className="mt-1 text-sm font-semibold text-slate-950">Modifiez les cases : les résultats s'actualisent juste en dessous.</p>
            </div>
            <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-2">
              <fieldset className="min-w-0 space-y-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
                <legend className="px-2 text-lg font-black">Les repas à table</legend>
                <NumberField id="tables" label="Tables réellement servies / mois" value={tablesPerMonth} onChange={setTablesPerMonth} />
                <p className="text-sm leading-6 text-slate-600">Comptez les groupes venus manger via une réservation TOK, pas les meubles de votre salle. Un groupe de 4 personnes = 1 table servie.</p>
                <NumberField id="ticket" label="Addition moyenne par table (CHF)" value={averageTicket} onChange={setAverageTicket} />
                <p className="text-sm leading-6 text-slate-700"><strong>Le total payé par tout le groupe.</strong> Par exemple : 4 personnes à 30 CHF = une addition de 120 CHF à saisir ici.</p>
              </fieldset>
              <fieldset className="min-w-0 space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
                <legend className="px-2 text-lg font-black">Les commandes distinctes</legend>
                <NumberField id="orders" label="Commandes par mois" value={ordersPerMonth} onChange={setOrdersPerMonth} />
                <p className="text-sm leading-6 text-slate-600">Comptez vos commandes à emporter ou en livraison. Ne recomptez pas une vente déjà incluse dans les repas à table.</p>
                <NumberField id="order-ticket" label="Montant moyen par commande (CHF)" value={averageOrder} onChange={setAverageOrder} />
                <p className="text-sm leading-6 text-slate-700">Le montant total d'une commande, même si elle contient plusieurs plats. Aucune commande ? Saisissez 0.</p>
              </fieldset>
              <div className="min-w-0 space-y-2 lg:col-span-2">
                <Label htmlFor="activation-pack" className="text-base font-bold">Pack d'accompagnement</Label>
                <Select value={pack} onValueChange={(value) => setPack(value as PackKey)}>
                  <SelectTrigger id="activation-pack" className="h-12 border-orange-200 bg-white text-base font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PACKS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label} · {value.monthlyFee} CHF/mois
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-6 border-t border-orange-200 p-5 sm:p-8" aria-live="polite" aria-atomic="true">
              <h3 className="text-2xl font-black">2. Vos ventes simulées, calculées étape par étape</h3>
              <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
                <RevenueStep title="Repas à table" calculation={`${tablesPerMonth.toLocaleString("fr-CH")} tables × ${formatChf(averageTicket)}`} result={formatChf(tablesPerMonth * averageTicket)} />
                <span aria-hidden="true" className="self-center text-center text-4xl font-black text-[#F15D22]">+</span>
                <RevenueStep title="Commandes" calculation={`${ordersPerMonth.toLocaleString("fr-CH")} commandes × ${formatChf(averageOrder)}`} result={formatChf(ordersPerMonth * averageOrder)} />
              </div>
              <div className="min-w-0 rounded-2xl bg-[#F15D22] p-5 text-white sm:p-7">
                <p className="text-lg font-bold">= Total des ventes simulées / mois</p>
                <p className="mt-2 break-words text-4xl font-black tracking-tight [overflow-wrap:anywhere] sm:text-5xl">{formatChf(activation.monthlyRevenue)}</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">Ventes brutes avant vos charges et les frais. Ce montant n'est ni un bénéfice, ni une économie, ni une facture TOK.</p>
              </div>
              <div className="rounded-2xl border-2 border-orange-200 p-5 sm:p-6">
                <h3 className="text-xl font-black">3. Le coût TOK pour ces réservations</h3>
                <p className="mt-3 break-words text-lg font-bold leading-8">{formatChf(activation.packConfig.monthlyFee)} d'abonnement + ({tablesPerMonth.toLocaleString("fr-CH")} tables × {formatChf(RESERVATION_FLAT_FEE_CHF)})</p>
                <p className="mt-2 break-words text-3xl font-black text-[#F15D22] [overflow-wrap:anywhere] sm:text-4xl">= {formatChf(activation.packConfig.monthlyFee + tablesPerMonth * RESERVATION_FLAT_FEE_CHF)} / mois</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">Pack {activation.packConfig.label} + frais des tables réellement servies. Hors frais des commandes, de livraison, de paiement et prestations supplémentaires. Une annulation ou une absence ne déclenche pas les 5 CHF ; l'abonnement reste dû.</p>
              </div>
            </div>
          </div>

          <details className="rounded-2xl border border-orange-200 bg-white p-5 sm:p-6">
            <summary className="cursor-pointer text-lg font-black text-slate-950">Voir toutes les hypothèses et les calculs</summary>
            <div className="mt-6 space-y-5">
              <p className="max-w-3xl text-sm leading-6 text-slate-600">Les repères suivants servent à préparer votre lancement. Le budget marketing est facultatif ; les actions, photos et délais restent indicatifs et sont à confirmer dans l'offre choisie.</p>
              <div className="max-w-xs"><NumberField id="posts" label="Actualités par semaine" value={postsPerWeek} onChange={setPostsPerWeek} /></div>
            <B2BTable caption="Comment lire votre simulation mensuelle" columns={["Indicateur", "Calcul avec vos valeurs", "Résultat et signification"]} rows={[
              ["Ventes à table", `${tablesPerMonth} tables × ${averageTicket} CHF par addition`, formatChf(tablesPerMonth * averageTicket)],
              ["Ventes en commande", `${ordersPerMonth} commandes × ${averageOrder} CHF`, formatChf(ordersPerMonth * averageOrder)],
              ["Total des ventes simulées", "Ventes à table + ventes en commande", `${formatChf(activation.monthlyRevenue)} de ventes brutes, avant charges et frais`],
              ["Budget marketing facultatif", `${formatChf(activation.monthlyRevenue)} × 12 %`, `${formatChf(activation.marketingEnvelope)} : hypothèse de travail, ni facture TOK ni dépense automatique`],
              ["Actions à prévoir", `${postsPerWeek} publications × 4 semaines + arrondi(${tablesPerMonth} / 20) + arrondi(${ordersPerMonth} / 30)`, `${activation.monthlyActions} actions : repère de planification, pas un quota inclus. Les ratios tables/20 et commandes/30 sont arrondis à l'entier le plus proche ; ce sont des repères de suivi.`],
              ["Photos IA et mise en route", `Repères du pack ${activation.packConfig.label}`, `${activation.packConfig.aiPhotos} visuels et ${activation.onboardingDays} jours indicatifs. Quotas, crédits et calendrier à confirmer dans l'offre du pack.`],
              ["Coût TOK des réservations", `${formatChf(activation.packConfig.monthlyFee)} + ${tablesPerMonth} tables × ${RESERVATION_FLAT_FEE_CHF} CHF`, `${formatChf(activation.packConfig.monthlyFee + tablesPerMonth * RESERVATION_FLAT_FEE_CHF)} / mois, hors commandes et prestations supplémentaires`],
            ]} />
            <p className="text-sm leading-6 text-muted-foreground">Les frais des commandes, de livraison, de paiement et des options sont distincts. Consultez les <Link to="/packs-restaurateur" className="font-semibold underline">packs et conditions applicables</Link> avant de choisir. Le budget marketing proposé ne mesure pas votre bénéfice.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Cas d'usage locaux</p>
            <h2 className="text-3xl font-black md:text-4xl">Une même plateforme, plusieurs réalités de salle.</h2>
            <p className="text-muted-foreground">
              Voici des exemples d'utilisation selon votre établissement. Les résultats dépendent de vos offres, de la demande locale et des services activés.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {useCases.map((item) => (
              <article key={item.title} className="rounded-lg border bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">Onboarding restaurateur</p>
            <h2 className="text-3xl font-black md:text-4xl">De l'audit au pilotage, chaque étape a un livrable.</h2>
            <p className="text-muted-foreground">
              L'équipe vous accompagne de la préparation de votre fiche au suivi des réservations et commandes. Le calendrier est confirmé avec vous avant le lancement.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
                <Link to="/packs-restaurateur">Voir les packs</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/zero-attente">Découvrir Zéro attente</Link>
              </Button>
            </div>
          </div>
          <ol className="grid gap-3">
            {onboardingSteps.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-lg border bg-white p-4 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">
                  {index + 1}
                </span>
                <span className="text-sm leading-6 text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1fr)_520px]">
          <div className="space-y-5">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-300">Démo restaurateur</p>
            <h2 className="text-3xl font-black md:text-4xl">Préparez un lancement TOK cohérent à Genève.</h2>
            <p className="max-w-2xl text-white/72">
              Ce formulaire envoie votre demande à l'équipe TOK. Décrivez votre restaurant et votre priorité pour préparer une démonstration adaptée.
            </p>
            <div className="grid gap-3 text-sm text-white/82 sm:grid-cols-2">
              {["Dashboard", "Réservations", "Commandes", "Actualités", "Miamz", "Photos IA"].map((module) => (
                <div key={module} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-orange-300" />
                  {module}
                </div>
              ))}
            </div>
          </div>

          <form
            id="demande-demo"
            className="grid gap-4 rounded-lg border border-white/12 bg-white p-5 text-slate-950 shadow-2xl"
            onSubmit={handleLeadSubmit}
          >
            <div className="grid gap-2">
              <Label htmlFor="restaurant-name">Nom du restaurant</Label>
              <Input id="restaurant-name" name="restaurant" placeholder="Restaurant du Rhône" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" name="ville" defaultValue="Genève" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="table-count">Tables physiques dans votre salle</Label>
                <Input id="table-count" name="tables" type="number" min={0} placeholder="24" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" name="telephone" type="tel" placeholder="+41 ..." required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="contact@restaurant.ch" required />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="need">Priorité</Label>
              <Select name="besoin">
                <SelectTrigger id="need">
                  <SelectValue placeholder="Choisir une priorité" />
                </SelectTrigger>
                <SelectContent>
                  {leadNeeds.map((need) => (
                    <SelectItem key={need} value={need}>
                      {need}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message">Contexte</Label>
              <Textarea id="message" name="message" placeholder="Horaires creux, canaux actuels, objectif à 30 jours..." />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <input id="marketing_optin" name="marketing_optin" type="checkbox"
                className="mt-1 h-4 w-4 accent-orange-500" />
              <Label htmlFor="marketing_optin" className="cursor-pointer text-sm font-normal leading-6 text-slate-700">
                J’accepte de recevoir des nouvelles et offres TOK par e-mail. Ce choix est facultatif,
                indépendant de ma demande de démo et révocable à tout moment.
              </Label>
            </div>
            <TurnstileCaptcha action="restaurant_lead" onTokenChange={setCaptchaToken} />
            <Button type="submit" className="bg-orange-500 text-white hover:bg-orange-600" disabled={sendingLead}>
              {sendingLead ? "Envoi..." : "Demander une démo gratuite"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {demoSubmitted ? (
              <div role="status" aria-live="polite" data-testid="restaurant-demo-confirmation"
                className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" />Votre demande de démo est enregistrée.</p>
                <p className="text-sm leading-6">L’équipe TOK pourra préparer votre démonstration. Cette demande ne souscrit aucun abonnement.</p>
                <Link to="/auth?role=restaurateur" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">
                  Vous préférez avancer directement ? Créer mon compte restaurateur <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-600">FAQ locale</p>
            <h2 className="text-3xl font-black">Questions fréquentes des restaurants genevois</h2>
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
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} className="h-12 border-slate-300 bg-white text-lg font-bold" value={value} onChange={(event) => onChange(Number.isFinite(Number(event.target.value)) ? Math.max(0, Number(event.target.value)) : 0)} />
    </div>
  );
}

function RevenueStep({ title, calculation, result }: { title: string; calculation: string; result: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
      <h4 className="text-lg font-black">{title}</h4>
      <p className="mt-3 break-words text-base font-semibold leading-7">{calculation}</p>
      <p className="mt-2 break-words text-2xl font-black text-[#b53000] [overflow-wrap:anywhere] sm:text-3xl">= {result}</p>
    </div>
  );
}
