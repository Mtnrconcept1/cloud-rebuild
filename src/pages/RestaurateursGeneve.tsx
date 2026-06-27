import { useMemo, useState } from "react";
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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const PAGE_PATH = "/restaurateurs/geneve";
const CANONICAL_ORIGIN = "https://www.thetok.ch";

const PACKS = {
  starter: { label: "Starter", monthlyFee: 0, aiPhotos: 10, launchDays: 7 },
  croissance: { label: "Croissance", monthlyFee: 149, aiPhotos: 30, launchDays: 14 },
  premium: { label: "Premium", monthlyFee: 349, aiPhotos: 80, launchDays: 21 },
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
  return `${Math.round(value).toLocaleString("fr-CH")} CHF`;
}

export default function RestaurateursGeneve() {
  const [tablesPerMonth, setTablesPerMonth] = useState(120);
  const [ordersPerMonth, setOrdersPerMonth] = useState(180);
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [averageTicket, setAverageTicket] = useState(42);
  const [pack, setPack] = useState<PackKey>("croissance");

  const activation = useMemo(() => {
    const packConfig = PACKS[pack];
    const monthlyRevenue = (tablesPerMonth + ordersPerMonth) * averageTicket;
    const monthlyActions = postsPerWeek * 4 + Math.round(tablesPerMonth / 20) + Math.round(ordersPerMonth / 30);
    const marketingEnvelope = monthlyRevenue * 0.12;

    return {
      packConfig,
      monthlyRevenue,
      monthlyActions,
      marketingEnvelope,
      onboardingDays: packConfig.launchDays,
    };
  }, [averageTicket, ordersPerMonth, pack, postsPerWeek, tablesPerMonth]);

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
        className="relative isolate flex min-h-[78vh] items-end overflow-hidden bg-slate-950 px-4 pb-12 pt-28 text-white md:px-8 lg:px-12"
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
              Genève · Dashboard · Réservations · Miamz
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black leading-[0.98] md:text-6xl">
                La plateforme restaurateur pour transformer la demande locale à Genève.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/82 md:text-lg">
                TOK centralise les réservations, les commandes, les offres anti-gaspi, les ventes flash, les actualités,
                les photos IA, les Miamz et les campagnes dans un dashboard pensé pour les restaurants genevois.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-orange-700 text-white hover:bg-orange-800">
                <a href={`mailto:contact@thetok.ch?subject=${demoSubject}&body=${demoBody}`}>
                  Demander une démo
                  <PhoneCall className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/restaurateurs/google-business">
                  Optimiser Google Business
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
          </div>

          <div className="grid gap-3 rounded-lg border border-white/14 bg-white/12 p-5 shadow-2xl backdrop-blur-md">
            <MetricDark label="Revenu piloté" value={formatChf(activation.monthlyRevenue)} />
            <MetricDark label="Actions mensuelles" value={activation.monthlyActions.toLocaleString("fr-CH")} />
            <MetricDark label="Photos IA incluses" value={activation.packConfig.aiPhotos.toLocaleString("fr-CH")} />
            <MetricDark label="Onboarding cible" value={`${activation.onboardingDays} jours`} accent />
          </div>
        </div>
      </section>

      <section className="border-b bg-white px-4 py-12 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4">
          {platformModules.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border bg-background p-5 shadow-sm">
              <Icon className="h-6 w-6 text-orange-700" />
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Lecture simple</p>
            <h2 className="text-3xl font-black md:text-4xl">Ce que TOK regroupe pour un restaurant genevois.</h2>
            <p className="text-muted-foreground">
              Un restaurateur doit comprendre en quelques secondes quel problème est traité, où l'action se pilote et
              quel résultat suivre dans le dashboard.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="grid gap-0 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white md:grid-cols-[0.8fr_1fr_1.2fr]">
              <span>Besoin terrain</span>
              <span>Module TOK</span>
              <span>Résultat attendu</span>
            </div>
            {decisionRows.map((row) => (
              <div key={row.need} className="grid gap-2 border-t p-4 text-sm md:grid-cols-[0.8fr_1fr_1.2fr]">
                <p className="font-bold text-slate-950">{row.need}</p>
                <p className="text-orange-700">{row.module}</p>
                <p className="leading-6 text-muted-foreground">{row.result}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Plan d'activation Genève</p>
            <h2 className="text-3xl font-black md:text-4xl">Dimensionnez votre lancement sans empiler les outils.</h2>
            <p className="text-muted-foreground">
              Le simulateur estime le volume que votre équipe devra suivre dans le dashboard : tables, commandes,
              actualités, photos et cadence d'onboarding.
            </p>
          </div>

          <div className="grid gap-6 rounded-lg border bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField id="tables" label="Tables par mois" value={tablesPerMonth} onChange={setTablesPerMonth} />
              <NumberField id="orders" label="Commandes par mois" value={ordersPerMonth} onChange={setOrdersPerMonth} />
              <NumberField id="posts" label="Actualités par semaine" value={postsPerWeek} onChange={setPostsPerWeek} />
              <NumberField id="ticket" label="Ticket moyen estimé" value={averageTicket} onChange={setAverageTicket} />
              <div className="space-y-2 sm:col-span-2">
                <Label>Pack d'accompagnement</Label>
                <Select value={pack} onValueChange={(value) => setPack(value as PackKey)}>
                  <SelectTrigger aria-label="Pack d'accompagnement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PACKS).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-slate-950 p-4 text-white">
              <MetricDark label="CA mensuel suivi" value={formatChf(activation.monthlyRevenue)} />
              <MetricDark label="Enveloppe marketing repère" value={formatChf(activation.marketingEnvelope)} />
              <MetricDark label="Contenus et offres à piloter" value={activation.monthlyActions.toLocaleString("fr-CH")} />
              <MetricDark label="Photos IA pack" value={`${activation.packConfig.aiPhotos} visuels`} accent />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Cas d'usage locaux</p>
            <h2 className="text-3xl font-black md:text-4xl">Une même plateforme, plusieurs réalités de salle.</h2>
            <p className="text-muted-foreground">
              La page Genève doit expliquer pourquoi TOK est indispensable pour l'opération quotidienne, pas seulement
              pour une comparaison tarifaire.
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
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">Onboarding restaurateur</p>
            <h2 className="text-3xl font-black md:text-4xl">De l'audit au pilotage, chaque étape a un livrable.</h2>
            <p className="text-muted-foreground">
              TOK doit permettre au restaurateur de savoir ce qui est configuré, ce qui est publié et ce qui convertit.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="bg-orange-700 text-white hover:bg-orange-800">
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
              Le formulaire prépare un email avec les données utiles pour cadrer la démo : type de restaurant, volume,
              canaux actuels et priorité commerciale.
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
            className="grid gap-4 rounded-lg border border-white/12 bg-white p-5 text-slate-950 shadow-2xl"
            action={`mailto:contact@thetok.ch?subject=${demoSubject}`}
            method="post"
            encType="text/plain"
          >
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
              <Label htmlFor="need">Priorité</Label>
              <Select name="besoin">
                <SelectTrigger id="need" aria-label="Priorité">
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
            <Button type="submit" className="bg-orange-700 text-white hover:bg-orange-800">
              Demander une démo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>

      <section className="px-4 py-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-orange-700">FAQ locale</p>
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
      <Input id={id} type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
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
