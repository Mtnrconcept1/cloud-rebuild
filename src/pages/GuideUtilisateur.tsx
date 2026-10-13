import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Code2,
  Filter,
  Image as ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  Map,
  Search,
  ServerCog,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import {
  TOK_USER_GUIDE_META,
  TOK_USER_GUIDE_ROUTES,
  TOK_USER_GUIDE_TOOLS,
} from "@/data/tok-user-guide-catalog.generated";
import {
  BUYER_GUIDE_CHAPTERS,
  GUIDE_SCREENSHOTS,
  RESTAURANT_GUIDE_CHAPTERS,
  SURFACE_LABELS,
  isRestaurantGuideRoute,
  type GuideChapter,
} from "@/data/userGuideContent";

type Audience = "restaurant" | "buyer";
type InventoryKind = "routes" | "tools";
type RouteEntry = (typeof TOK_USER_GUIDE_ROUTES)[number];
type ToolEntry = (typeof TOK_USER_GUIDE_TOOLS)[number];

const IGNORED_COMPONENTS = new Set([
  "AdminProtectedRoute",
  "ClientSurfaceRoute",
  "CommercialDemoSafeEffectsBoundary",
  "DashboardRoute",
  "FeatureSwitch",
  "MarketingProtectedRoute",
  "Navigate",
  "ProtectedRoute",
  "div",
]);

const TOOL_CATEGORY_RULES: readonly [string, RegExp][] = [
  ["Paiements & revenus", /(stripe|checkout|payment|invoice|billing|refund|subscription|payout|adjustment)/i],
  ["Commandes & réservations", /(order|reservation|dispatch|courier|zero-attente|match-group)/i],
  ["IA & création", /(^ai-|advisor|image|photo|floorplan|daily-dish|analyze)/i],
  ["Marketing & CRM", /(marketing|campaign|sponsored|crm|newsletter|prospect)/i],
  ["TOK Connect & partenaires", /(tok-connect|oauth|webhook|google-actions|aligro|supplier)/i],
  ["Messages & support", /(email|push|notification|support|contact)/i],
  ["Données & annuaire", /(directory|restaurant|catalog|scrape|enrich|import|export|geo)/i],
  ["Sécurité & opérations", /(admin|guardian|incident|audit|monitor|security|mfa|delete-account)/i],
];

const SURFACE_DESCRIPTIONS: Record<string, string> = {
  public: "Parcours public de découverte, information ou conversion.",
  "client-account": "Espace personnel du client, protégé lorsqu’une session est requise.",
  restaurant: "Outil de gestion réservé à l’équipe du restaurant.",
  courier: "Parcours opérationnel dédié au coursier.",
  commercial: "Espace de prospection et de démonstration commerciale.",
  marketing: "Espace marketing isolé pour préparer et suivre les campagnes.",
  admin: "Outil de supervision réservé à l’administration de la plateforme.",
  system: "Route technique de repli ou de gestion du système.",
};

function humanize(value: string) {
  return value
    .replace(/^\//, "")
    .replace(/[:*]/g, "")
    .replace(/-/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/\b(ai|crm|mcp|oauth|tok)\b/gi, (token) => token.toUpperCase())
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function getRouteTitle(route: RouteEntry) {
  const component = [...route.components].reverse().find((name) => !IGNORED_COMPONENTS.has(name));
  if (component) return humanize(component);
  if (route.redirectTo) return `Redirection vers ${humanize(route.redirectTo)}`;
  if (route.path === "*") return "Page introuvable";
  return humanize(route.path) || "Accueil";
}

function getRouteAccess(route: RouteEntry) {
  if (route.surface === "admin") return "Accès administrateur";
  if (route.surface === "restaurant") return "Accès restaurateur";
  if (route.surface === "courier") return "Accès coursier";
  if (route.surface === "commercial") return "Accès commercial";
  if (route.surface === "marketing") return "Session marketing";
  if (route.requiredRoles.length > 0) return `Rôle ${route.requiredRoles.join(", ")}`;
  return "Accès public";
}

function getToolCategory(tool: ToolEntry) {
  return TOOL_CATEGORY_RULES.find(([, pattern]) => pattern.test(tool.name))?.[0] || "Services de plateforme";
}

function getToolSummary(tool: ToolEntry) {
  const actions = tool.actions.length > 0 ? ` Actions : ${tool.actions.map(humanize).join(", ")}.` : "";
  const integrations = tool.integrations.length > 0
    ? ` Connexions : ${tool.integrations.map((name) => humanize(name)).join(", ")}.`
    : "";
  return `Service applicatif ${tool.methods.join(" / ") || "interne"}.${actions}${integrations}`;
}

function GuideChoice() {
  useSeoMeta({
    title: "Guides d’utilisation TOK",
    description: "Choisissez le guide restaurateur ou la documentation complète de la plateforme TOK.",
    path: "/guide",
  });

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b bg-white/95 dark:bg-slate-950/95">
        <div className="container flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link to="/" className="flex items-center gap-3 font-black tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff6a1a] text-white">TOK</span>
            Documentation
          </Link>
          <Link to="/aide" className="text-sm font-semibold text-slate-600 hover:text-[#ff6a1a] dark:text-slate-300">
            Centre d’aide
          </Link>
        </div>
      </header>

      <main className="container max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Badge className="mb-5 rounded-full bg-orange-100 px-4 py-2 text-orange-800 hover:bg-orange-100">
            Manuel de référence TOK
          </Badge>
          <h1 className="font-display text-4xl font-black tracking-tight md:text-6xl">Choisissez votre guide</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            Deux documentations distinctes, avec navigation hiérarchique, captures de l’application,
            recherche instantanée et filtres par catégorie.
          </p>
        </div>

        <section className="mt-12 grid gap-6 md:grid-cols-2" aria-label="Choix du guide">
          <Link
            to="/guide/restaurateur"
            className="group rounded-3xl border border-orange-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-orange-400 hover:shadow-xl dark:border-orange-500/30 dark:bg-slate-900"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              <Store className="h-7 w-7" />
            </span>
            <h2 className="mt-6 text-2xl font-black">Guide restaurateur</h2>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
              Un parcours concentré sur le restaurant : installation, carte, commandes, réservations,
              campagnes, performances, factures et support. Aucun contenu d’administration de plateforme.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-bold text-orange-700 dark:text-orange-300">
              Ouvrir le guide <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            to="/guide/plateforme"
            className="group rounded-3xl border border-violet-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-violet-400 hover:shadow-xl dark:border-violet-500/30 dark:bg-slate-900"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              <Boxes className="h-7 w-7" />
            </span>
            <h2 className="mt-6 text-2xl font-black">Guide complet de la plateforme</h2>
            <p className="mt-3 leading-relaxed text-slate-600 dark:text-slate-300">
              Une vue de diligence pour un futur acquéreur : toutes les surfaces, toutes les routes,
              l’administration, les outils serveur et les principales intégrations.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
              Explorer la plateforme <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </section>
      </main>
    </div>
  );
}

function GuideSidebar({ audience, chapters }: { audience: Audience; chapters: readonly GuideChapter[] }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-7 pb-10 text-sm">
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Dans ce guide</p>
          <nav aria-label="Chapitres du guide" className="space-y-1">
            <a href="#vue-ensemble" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-900">
              <BookOpen className="h-4 w-4" /> Vue d’ensemble
            </a>
            {chapters.map((chapter) => (
              <a key={chapter.id} href={`#${chapter.id}`} className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white">
                {chapter.title}
              </a>
            ))}
            <a href="#captures" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-900">
              <ImageIcon className="h-4 w-4" /> Captures
            </a>
            <a href="#index" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold hover:bg-slate-100 dark:hover:bg-slate-900">
              <Search className="h-4 w-4" /> Index complet
            </a>
          </nav>
        </div>

        <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
          <div className="flex items-center gap-2 font-bold">
            {audience === "restaurant" ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Map className="h-4 w-4 text-violet-600" />}
            Périmètre
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {audience === "restaurant"
              ? "Uniquement les outils et parcours utiles à l’exploitation quotidienne du restaurant."
              : "Toutes les surfaces frontend et tous les services serveur indexés depuis le dépôt."}
          </p>
        </div>
      </div>
    </aside>
  );
}

function ScreenshotGallery({ audience }: { audience: Audience }) {
  const screenshots = GUIDE_SCREENSHOTS.filter((item) => item.audiences.includes(audience));
  return (
    <section id="captures" className="scroll-mt-28 space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6a1a]">Captures de l’application</p>
        <h2 className="mt-2 font-display text-3xl font-black">Reconnaître les écrans clés</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Les captures utilisent des données publiques ou de démonstration, sans données personnelles réelles.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {screenshots.map((screenshot) => (
          <figure key={screenshot.src} className="overflow-hidden rounded-3xl border bg-white shadow-sm dark:bg-slate-900">
            <div className="flex min-h-80 items-start justify-center overflow-hidden bg-slate-100 p-3 dark:bg-slate-950">
              <img
                src={screenshot.src}
                alt={screenshot.alt}
                className="h-auto max-h-[34rem] w-auto rounded-2xl object-contain shadow-sm"
                loading="lazy"
              />
            </div>
            <figcaption className="p-5">
              <h3 className="font-bold">{screenshot.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{screenshot.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function ChapterCard({ chapter }: { chapter: GuideChapter }) {
  return (
    <section id={chapter.id} className="scroll-mt-28 rounded-3xl border bg-white p-6 shadow-sm md:p-8 dark:bg-slate-900">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6a1a]">{chapter.eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-black md:text-3xl">{chapter.title}</h2>
      <p className="mt-3 max-w-3xl leading-relaxed text-slate-600 dark:text-slate-300">{chapter.summary}</p>
      <ol className="mt-6 space-y-3">
        {chapter.steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed md:text-base">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-800 dark:bg-orange-500/15 dark:text-orange-200">{index + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap gap-2" aria-label="Routes associées">
        {chapter.routes.map((route) => (
          <code key={route} className="rounded-lg border bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{route}</code>
        ))}
      </div>
    </section>
  );
}

function RouteResult({ route }: { route: RouteEntry }) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold">{getRouteTitle(route)}</h3>
          <code className="mt-1 block break-all text-xs font-semibold text-[#d94d00] dark:text-orange-300">{route.path}</code>
        </div>
        <Badge variant="outline">{SURFACE_LABELS[route.surface] || humanize(route.surface)}</Badge>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{SURFACE_DESCRIPTIONS[route.surface] || "Route de l’application TOK."}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <LockKeyhole className="h-3.5 w-3.5" /> {getRouteAccess(route)}
        </span>
        {route.featureGate ? <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Activation progressive</span> : null}
        {route.redirectTo ? <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">Redirection</span> : null}
      </div>
    </article>
  );
}

function ToolResult({ tool }: { tool: ToolEntry }) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold">{humanize(tool.name)}</h3>
          <code className="mt-1 block break-all text-xs font-semibold text-violet-700 dark:text-violet-300">{tool.endpoint}</code>
        </div>
        <Badge variant="outline">{getToolCategory(tool)}</Badge>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{getToolSummary(tool)}</p>
    </article>
  );
}

function SearchIndex({ audience }: { audience: Audience }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<InventoryKind>("routes");
  const [category, setCategory] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");

  const routes = useMemo(
    () => TOK_USER_GUIDE_ROUTES.filter((route) => audience === "buyer" || isRestaurantGuideRoute(route)),
    [audience],
  );

  const categories = useMemo(() => {
    if (kind === "routes") {
      return [...new Set(routes.map((route) => route.surface))].map((value) => ({ value, label: SURFACE_LABELS[value] || humanize(value) }));
    }
    return [...new Set(TOK_USER_GUIDE_TOOLS.map(getToolCategory))].sort().map((value) => ({ value, label: value }));
  }, [kind, routes]);

  const filteredRoutes = useMemo(
    () => routes.filter((route) => {
      if (category !== "all" && route.surface !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = [route.path, route.surface, ...route.components, ...route.requiredRoles, route.featureGate || "", route.redirectTo || ""].join(" ").toLocaleLowerCase("fr");
      return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term));
    }),
    [category, normalizedQuery, routes],
  );

  const filteredTools = useMemo(
    () => TOK_USER_GUIDE_TOOLS.filter((tool) => {
      if (category !== "all" && getToolCategory(tool) !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = [tool.name, tool.endpoint, ...tool.methods, ...tool.actions, ...tool.integrations, getToolCategory(tool)].join(" ").toLocaleLowerCase("fr");
      return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term));
    }),
    [category, normalizedQuery],
  );

  const total = kind === "routes" ? filteredRoutes.length : filteredTools.length;
  const empty = total === 0;

  return (
    <section id="index" className="scroll-mt-28 space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff6a1a]">Index ultra simplifié</p>
        <h2 className="mt-2 font-display text-3xl font-black">Rechercher une route ou un outil</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          {audience === "restaurant"
            ? "L’index est limité aux parcours du restaurateur et aux pages publiques qui lui sont utiles."
            : "L’index complet couvre les routes frontend et les services serveur détectés dans le dépôt."}
        </p>
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow-sm md:p-6 dark:bg-slate-900">
        {audience === "buyer" ? (
          <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Type d’inventaire">
            <button
              type="button"
              aria-pressed={kind === "routes"}
              onClick={() => { setKind("routes"); setCategory("all"); }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${kind === "routes" ? "bg-white shadow-sm dark:bg-slate-950" : "text-slate-500"}`}
            >
              <Map className="h-4 w-4" /> Routes ({routes.length})
            </button>
            <button
              type="button"
              aria-pressed={kind === "tools"}
              onClick={() => { setKind("tools"); setCategory("all"); }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${kind === "tools" ? "bg-white shadow-sm dark:bg-slate-950" : "text-slate-500"}`}
            >
              <ServerCog className="h-4 w-4" /> Outils serveur ({TOK_USER_GUIDE_TOOLS.length})
            </button>
          </div>
        ) : null}

        <label htmlFor="guide-search" className="sr-only">Rechercher dans le guide</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            id="guide-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "routes" ? "Ex. commandes, factures, profil…" : "Ex. paiement, campagne, notification…"}
            className="h-14 rounded-2xl pl-12 pr-12 text-base"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2" aria-label="Filtres par catégorie">
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-400"><Filter className="h-3.5 w-3.5" /> Filtrer</span>
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === "all" ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>Tout</button>
          {categories.map((item) => (
            <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === item.value ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>{total} résultat{total > 1 ? "s" : ""}</span>
          <span className="hidden sm:inline">Source : inventaire généré depuis le code</span>
        </div>
      </div>

      {empty ? (
        <div className="rounded-3xl border-2 border-dashed p-10 text-center text-slate-500">
          <Search className="mx-auto h-8 w-8" />
          <p className="mt-3 font-bold">Aucun résultat</p>
          <p className="mt-1 text-sm">Essayez un mot plus court ou retirez le filtre.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kind === "routes"
            ? filteredRoutes.map((route) => <RouteResult key={`${route.surface}-${route.path}`} route={route} />)
            : filteredTools.map((tool) => <ToolResult key={tool.name} tool={tool} />)}
        </div>
      )}
    </section>
  );
}

function GuidePage({ audience }: { audience: Audience }) {
  const isRestaurant = audience === "restaurant";
  const chapters = isRestaurant ? RESTAURANT_GUIDE_CHAPTERS : BUYER_GUIDE_CHAPTERS;
  const title = isRestaurant ? "Guide restaurateur TOK" : "Guide complet de la plateforme TOK";
  const path = isRestaurant ? "/guide/restaurateur" : "/guide/plateforme";

  useSeoMeta({
    title,
    description: isRestaurant
      ? "Mode d’emploi TOK réservé aux restaurateurs : outils, captures, recherche et parcours opérationnels, sans contenu d’administration."
      : "Référence complète TOK destinée à la diligence d’un futur acquéreur : surfaces, routes, administration, outils serveur et intégrations.",
    path,
  });

  const routeCount = isRestaurant
    ? TOK_USER_GUIDE_ROUTES.filter(isRestaurantGuideRoute).length
    : TOK_USER_GUIDE_META.routeCount;

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur dark:bg-slate-950/95">
        <div className="container flex min-h-16 max-w-[92rem] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/guide" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6a1a] text-sm font-black text-white">TOK</Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{title}</p>
              <p className="hidden text-xs text-slate-500 sm:block">Documentation de référence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/guide">Changer de guide</Link>
            </Button>
            <Button asChild size="sm" className="bg-[#ff6a1a] text-white hover:bg-[#e85a0a]">
              <a href="#index"><Search className="mr-2 h-4 w-4" /> Rechercher</a>
            </Button>
          </div>
        </div>
      </header>

      <div className="container grid max-w-[92rem] gap-10 px-4 py-10 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)_14rem]">
        <GuideSidebar audience={audience} chapters={chapters} />

        <main className="min-w-0 space-y-10">
          <section id="vue-ensemble" className="scroll-mt-28 overflow-hidden rounded-[2rem] border bg-white shadow-sm dark:bg-slate-900">
            <div className={`p-7 md:p-10 ${isRestaurant ? "bg-gradient-to-br from-orange-50 via-white to-emerald-50 dark:from-orange-500/10 dark:via-slate-900 dark:to-emerald-500/10" : "bg-gradient-to-br from-violet-50 via-white to-orange-50 dark:from-violet-500/10 dark:via-slate-900 dark:to-orange-500/10"}`}>
              <Badge className={isRestaurant ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : "bg-violet-100 text-violet-800 hover:bg-violet-100"}>
                {isRestaurant ? "Parcours restaurateur uniquement" : "Référence complète & administration"}
              </Badge>
              <h1 className="mt-5 max-w-4xl font-display text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                {isRestaurant
                  ? "Le mode d’emploi opérationnel pour configurer votre établissement, gérer le service et développer votre activité, du menu à la facturation."
                  : "La cartographie fonctionnelle de TOK pour comprendre chaque surface, chaque route et les outils serveur qui soutiennent l’application, y compris le back-office d’administration."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><Map className="h-4 w-4 text-[#ff6a1a]" /> {routeCount} routes couvertes</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><Search className="h-4 w-4 text-[#ff6a1a]" /> Recherche instantanée</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><ImageIcon className="h-4 w-4 text-[#ff6a1a]" /> Captures réelles</span>
                {!isRestaurant ? <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm dark:bg-slate-950"><ServerCog className="h-4 w-4 text-violet-600" /> {TOK_USER_GUIDE_META.toolCount} outils serveur</span> : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3" aria-label="Principes du guide">
            {[
              { icon: LayoutDashboard, title: "Hiérarchie claire", text: "Navigation par chapitres, comme un manuel de référence." },
              { icon: Search, title: "Index direct", text: "Un mot suffit pour retrouver une route ou un outil." },
              { icon: CheckCircle2, title: "Source vérifiable", text: "L’inventaire est régénéré depuis le code de l’application." },
            ].map(({ icon: Icon, title: cardTitle, text }) => (
              <div key={cardTitle} className="rounded-2xl border bg-white p-5 dark:bg-slate-900">
                <Icon className="h-5 w-5 text-[#ff6a1a]" />
                <h2 className="mt-3 font-bold">{cardTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
              </div>
            ))}
          </section>

          <div className="space-y-6">
            {chapters.map((chapter) => <ChapterCard key={chapter.id} chapter={chapter} />)}
          </div>

          <ScreenshotGallery audience={audience} />
          <SearchIndex audience={audience} />
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-5 text-sm">
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Repères</p>
              <dl className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2"><dt>Chapitres</dt><dd className="font-black">{chapters.length}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt>Routes</dt><dd className="font-black">{routeCount}</dd></div>
                {!isRestaurant ? <div className="flex items-center justify-between gap-2"><dt>Outils serveur</dt><dd className="font-black">{TOK_USER_GUIDE_META.toolCount}</dd></div> : null}
              </dl>
            </div>
            <div className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <p className="flex items-center gap-2 font-bold"><Code2 className="h-4 w-4 text-slate-400" /> Fraîcheur</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Inventaire statique généré depuis la branche livrée. Les fonctions activées peuvent dépendre du rôle et de la configuration de l’environnement.
              </p>
            </div>
            <Link to="/aide" className="flex items-center justify-between rounded-2xl border bg-white p-4 font-bold hover:border-[#ff6a1a] dark:bg-slate-900">
              Centre d’aide <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function GuideUtilisateur() {
  const { pathname } = useLocation();
  if (pathname === "/guide/restaurateur") return <GuidePage audience="restaurant" />;
  if (pathname === "/guide/plateforme") return <GuidePage audience="buyer" />;
  return <GuideChoice />;
}
